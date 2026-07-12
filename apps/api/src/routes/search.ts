import { Hono } from 'hono';
import type { SearchResults } from '@sizzle/shared';
import { optionalAuth } from '../middleware/auth';
import { supabaseAdmin } from '../lib/supabase';
import { buildCards, cookSummary, loadBlockedIds, type ProfileRow, type RecipeRow } from '../mappers';
import { normalizeTag } from '../services/hashtags';
import type { AppEnv } from '../types';

export const search = new Hono<AppEnv>();

/**
 * GET /search/pantry?ings=chicken,rice,gochujang&maxTime=30&cuisine=korean&tag=highprotein
 * Ingredient-first search: recipes ranked by how many of the given ingredients
 * they use (then by qualified cooks, then likes). This is the "what can I make
 * with what I have" question — only answerable because ingredients are
 * structured rows, which is exactly the asset a generic video app doesn't have.
 */
search.get('/pantry', optionalAuth, async (c) => {
  // Sanitize each term: strip ilike wildcards and PostgREST or() syntax chars.
  const terms = (c.req.query('ings') ?? '')
    .split(',')
    .map((t) => t.trim().replace(/[%_(),.]/g, '').slice(0, 40).toLowerCase())
    .filter((t) => t.length >= 2)
    .slice(0, 8);
  if (terms.length === 0) return c.json({ recipes: [], matched: {} });

  const maxTime = Number(c.req.query('maxTime') ?? 0) || 0;
  const cuisine = (c.req.query('cuisine') ?? '').replace(/[%_]/g, '').slice(0, 40);
  const tag = normalizeTag(c.req.query('tag') ?? '');

  // One indexed pass over the ingredient rows (pg_trgm GIN backs the ilike).
  const { data: ingHits } = await supabaseAdmin
    .from('recipe_ingredients')
    .select('recipe_id, text')
    .or(terms.map((t) => `text.ilike.%${t}%`).join(','))
    .limit(4000);

  // Count DISTINCT matched terms per recipe (two "chicken" lines ≠ two matches).
  const matchedTerms = new Map<string, Set<string>>();
  for (const row of ingHits ?? []) {
    const text = (row.text as string).toLowerCase();
    let set = matchedTerms.get(row.recipe_id as string);
    if (!set) { set = new Set(); matchedTerms.set(row.recipe_id as string, set); }
    for (const t of terms) if (text.includes(t)) set.add(t);
  }
  const rankedIds = [...matchedTerms.entries()]
    .sort((a, b) => b[1].size - a[1].size)
    .slice(0, 120)
    .map(([id]) => id);
  if (rankedIds.length === 0) return c.json({ recipes: [], matched: {} });

  let query = supabaseAdmin.from('recipes').select('*').in('id', rankedIds).eq('status', 'published');
  if (maxTime > 0) query = query.lte('time_minutes', maxTime);
  if (cuisine) query = query.ilike('cuisine', `%${cuisine}%`);
  if (tag) query = query.contains('tags', [tag]);
  const { data: rows } = await query.limit(60);

  // Rank: most ingredients matched → most qualified cooks → most liked.
  const byMatch = (r: RecipeRow) => matchedTerms.get(r.id)?.size ?? 0;
  const sorted = ((rows ?? []) as RecipeRow[]).sort((a, b) =>
    byMatch(b) - byMatch(a) || (b.cook_count ?? 0) - (a.cook_count ?? 0) || b.like_count - a.like_count,
  ).slice(0, 30);

  const recipes = await buildCards(supabaseAdmin, c.get('userId'), sorted);
  // Per-recipe matched ingredient terms so the client can show "matches 3 of 4".
  const matched: Record<string, string[]> = {};
  for (const card of recipes) matched[card.id] = [...(matchedTerms.get(card.id) ?? [])];
  return c.json({ recipes, matched });
});

/** GET /search?q=… — recipes (title/cuisine/#hashtag) + cooks (name/handle). */
search.get('/', optionalAuth, async (c) => {
  const raw = (c.req.query('q') ?? '').trim();

  // A "#tag" query searches the hashtag index directly (recipes only).
  if (raw.startsWith('#')) {
    const tag = normalizeTag(raw);
    if (!tag) return c.json<SearchResults>({ recipes: [], cooks: [] });
    const { data } = await supabaseAdmin
      .from('recipes')
      .select('*')
      .eq('status', 'published')
      .contains('tags', [tag])
      .order('like_count', { ascending: false })
      .limit(20);
    const recipes = await buildCards(supabaseAdmin, c.get('userId'), (data ?? []) as RecipeRow[]);
    return c.json<SearchResults>({ recipes, cooks: [] });
  }

  // `%`/`_` are ilike wildcards — strip so the user can't control the pattern.
  const q = raw.replace(/[%_]/g, '').slice(0, 80);
  if (q.length < 1) return c.json<SearchResults>({ recipes: [], cooks: [] });
  const like = `%${q}%`;

  // Parameterized .ilike() (value bound, not concatenated into a filter string).
  const tagTerm = normalizeTag(q);
  const [titleHits, cuisineHits, tagHits, nameHits, handleHits] = await Promise.all([
    supabaseAdmin.from('recipes').select('*').eq('status', 'published').ilike('title', like).limit(20),
    supabaseAdmin.from('recipes').select('*').eq('status', 'published').ilike('cuisine', like).limit(20),
    tagTerm ? supabaseAdmin.from('recipes').select('*').eq('status', 'published').contains('tags', [tagTerm]).limit(20) : Promise.resolve({ data: [] }),
    supabaseAdmin.from('profiles').select('*').neq('banned', true).ilike('display_name', like).limit(10),
    supabaseAdmin.from('profiles').select('*').neq('banned', true).ilike('handle', like).limit(10),
  ]);

  const recipeMap = new Map<string, RecipeRow>();
  for (const r of [...(titleHits.data ?? []), ...(cuisineHits.data ?? []), ...(tagHits.data ?? [])]) recipeMap.set(r.id as string, r as RecipeRow);
  const recipeRows = [...recipeMap.values()].sort((a, b) => b.like_count - a.like_count).slice(0, 20);

  const blocked = await loadBlockedIds(supabaseAdmin, c.get('userId'));
  const cookMap = new Map<string, ProfileRow>();
  for (const p of [...(nameHits.data ?? []), ...(handleHits.data ?? [])]) cookMap.set(p.id as string, p as ProfileRow);
  const cookRows = [...cookMap.values()].filter((p) => !blocked.has(p.id)).sort((a, b) => b.follower_count - a.follower_count).slice(0, 10);

  const recipes = await buildCards(supabaseAdmin, c.get('userId'), recipeRows);
  const cooks = cookRows.map(cookSummary);
  return c.json<SearchResults>({ recipes, cooks });
});
