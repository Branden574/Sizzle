import { Hono } from 'hono';
import type { FeedResponse } from '@sizzle/shared';
import { optionalAuth, requireAuth } from '../middleware/auth';
import { supabaseAdmin } from '../lib/supabase';
import { dbFail } from '../lib/errors';
import { buildCards, type RecipeRow } from '../mappers';
import { rankRecipes, type ViewerSignals } from '../services/ranking';
import type { AppEnv } from '../types';

export const feed = new Hono<AppEnv>();

const PAGE = 10;
/** Candidate window the ranker scores over. */
const CANDIDATES = 60;

/** Load the viewer's engagement signals for ranking. */
async function loadViewerSignals(userId: string): Promise<ViewerSignals> {
  const [profile, follows, reactions, saves, views, impressions] = await Promise.all([
    supabaseAdmin.from('profiles').select('tastes').eq('id', userId).maybeSingle(),
    supabaseAdmin.from('follows').select('cook_id').eq('follower_id', userId),
    supabaseAdmin.from('reactions').select('recipe_id, kind').eq('user_id', userId),
    supabaseAdmin.from('saves').select('recipe_id').eq('user_id', userId),
    supabaseAdmin.from('recipe_views').select('recipe_id, skipped, completed').eq('user_id', userId).order('created_at', { ascending: false }).limit(200),
    supabaseAdmin.from('recipe_impressions').select('recipe_id').eq('user_id', userId).order('served_at', { ascending: false }).limit(200),
  ]);

  // Resolve cook for each engaged recipe.
  const engaged = new Set<string>();
  for (const r of reactions.data ?? []) engaged.add(r.recipe_id as string);
  for (const s of saves.data ?? []) engaged.add(s.recipe_id as string);
  for (const v of views.data ?? []) engaged.add(v.recipe_id as string);
  const cookOf = new Map<string, string>();
  if (engaged.size) {
    const { data: recs } = await supabaseAdmin.from('recipes').select('id, cook_id').in('id', [...engaged]);
    for (const r of recs ?? []) cookOf.set(r.id as string, r.cook_id as string);
  }

  const affinity = new Map<string, number>();
  const dislikedCooks = new Set<string>();
  const skips = new Map<string, number>();
  const bump = (cook: string | undefined, n = 1) => {
    if (cook) affinity.set(cook, (affinity.get(cook) ?? 0) + n);
  };
  for (const r of reactions.data ?? []) {
    const cook = cookOf.get(r.recipe_id as string);
    if (r.kind === 'like') bump(cook);
    else if (cook) dislikedCooks.add(cook);
  }
  for (const s of saves.data ?? []) bump(cookOf.get(s.recipe_id as string));
  for (const v of views.data ?? []) {
    const cook = cookOf.get(v.recipe_id as string);
    if (v.completed) bump(cook);
    if (v.skipped && cook) skips.set(cook, (skips.get(cook) ?? 0) + 1);
  }

  return {
    tastes: ((profile.data?.tastes ?? []) as string[]).filter(Boolean),
    followedCooks: new Set((follows.data ?? []).map((f) => f.cook_id as string)),
    affinity,
    dislikedCooks,
    impressed: new Set((impressions.data ?? []).map((i) => i.recipe_id as string)),
    skips,
  };
}

/**
 * GET /feed/for-you — ranked recommendations (Phase 4, Stage 1 heuristic).
 *
 * Authed first page: load the viewer's signals, score a recent candidate
 * window (recency + taste + follow + cook-affinity + popularity − seen − dislike
 * − skip), attenuate repeated cooks, log impressions. Guests / paginated:
 * recency. The RecipeCard response shape is the contract a learned model
 * (Stage 2) slots behind. See docs/recommendation-algorithm.md.
 */
feed.get('/for-you', optionalAuth, async (c) => {
  const cursor = c.req.query('cursor');
  const userId = c.get('userId');

  if (userId && !cursor) {
    const signals = await loadViewerSignals(userId);
    const { data, error } = await supabaseAdmin
      .from('recipes')
      .select('*')
      .eq('status', 'published')
      .order('created_at', { ascending: false })
      .limit(CANDIDATES);
    if (error) throw dbFail(error.message);

    const ranked = rankRecipes((data ?? []) as RecipeRow[], signals, Date.now()).slice(0, PAGE);
    if (ranked.length) {
      await supabaseAdmin.from('recipe_impressions').insert(ranked.map((r) => ({ user_id: userId, recipe_id: r.id })));
    }
    const items = await buildCards(supabaseAdmin, userId, ranked);
    return c.json<FeedResponse>({ items, nextCursor: null });
  }

  // Guests / pagination: recency, cursor-paginated.
  let q = supabaseAdmin
    .from('recipes')
    .select('*')
    .eq('status', 'published')
    .order('created_at', { ascending: false })
    .limit(PAGE + 1);
  if (cursor) q = q.lt('created_at', cursor);

  const { data, error } = await q;
  if (error) throw dbFail(error.message);

  const rows = (data ?? []) as RecipeRow[];
  const hasMore = rows.length > PAGE;
  const page = rows.slice(0, PAGE);
  const items = await buildCards(supabaseAdmin, userId, page);
  const res: FeedResponse = { items, nextCursor: hasMore ? page[page.length - 1]!.created_at : null };
  return c.json(res);
});

/** GET /feed/following — recipes from cooks the viewer follows. */
feed.get('/following', requireAuth, async (c) => {
  const userId = c.get('userId')!;

  const { data: follows, error: fErr } = await supabaseAdmin.from('follows').select('cook_id').eq('follower_id', userId);
  if (fErr) throw dbFail(fErr.message);
  const cookIds = (follows ?? []).map((f) => f.cook_id as string);
  if (cookIds.length === 0) return c.json<FeedResponse>({ items: [], nextCursor: null });

  const cursor = c.req.query('cursor');
  let q = supabaseAdmin
    .from('recipes')
    .select('*')
    .eq('status', 'published')
    .in('cook_id', cookIds)
    .order('created_at', { ascending: false })
    .limit(PAGE + 1);
  if (cursor) q = q.lt('created_at', cursor);

  const { data, error } = await q;
  if (error) throw dbFail(error.message);

  const rows = (data ?? []) as RecipeRow[];
  const hasMore = rows.length > PAGE;
  const page = rows.slice(0, PAGE);
  const items = await buildCards(supabaseAdmin, userId, page);
  return c.json<FeedResponse>({ items, nextCursor: hasMore ? page[page.length - 1]!.created_at : null });
});
