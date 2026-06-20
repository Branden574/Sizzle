import { Hono } from 'hono';
import type { SearchResults } from '@sizzle/shared';
import { optionalAuth } from '../middleware/auth';
import { supabaseAdmin } from '../lib/supabase';
import { buildCards, cookSummary, type ProfileRow, type RecipeRow } from '../mappers';
import type { AppEnv } from '../types';

export const search = new Hono<AppEnv>();

/** GET /search?q=… — recipes (title/cuisine) + cooks (name/handle). */
search.get('/', optionalAuth, async (c) => {
  // `%`/`_` are ilike wildcards — strip so the user can't control the pattern.
  const q = (c.req.query('q') ?? '').replace(/[%_]/g, '').trim().slice(0, 80);
  if (q.length < 1) return c.json<SearchResults>({ recipes: [], cooks: [] });
  const like = `%${q}%`;

  // Parameterized .ilike() (value bound, not concatenated into a filter string).
  const [titleHits, cuisineHits, nameHits, handleHits] = await Promise.all([
    supabaseAdmin.from('recipes').select('*').eq('status', 'published').ilike('title', like).limit(20),
    supabaseAdmin.from('recipes').select('*').eq('status', 'published').ilike('cuisine', like).limit(20),
    supabaseAdmin.from('profiles').select('*').eq('is_cook', true).ilike('display_name', like).limit(10),
    supabaseAdmin.from('profiles').select('*').eq('is_cook', true).ilike('handle', like).limit(10),
  ]);

  const recipeMap = new Map<string, RecipeRow>();
  for (const r of [...(titleHits.data ?? []), ...(cuisineHits.data ?? [])]) recipeMap.set(r.id as string, r as RecipeRow);
  const recipeRows = [...recipeMap.values()].sort((a, b) => b.like_count - a.like_count).slice(0, 20);

  const cookMap = new Map<string, ProfileRow>();
  for (const p of [...(nameHits.data ?? []), ...(handleHits.data ?? [])]) cookMap.set(p.id as string, p as ProfileRow);
  const cookRows = [...cookMap.values()].sort((a, b) => b.follower_count - a.follower_count).slice(0, 10);

  const recipes = await buildCards(supabaseAdmin, c.get('userId'), recipeRows);
  const cooks = cookRows.map(cookSummary);
  return c.json<SearchResults>({ recipes, cooks });
});
