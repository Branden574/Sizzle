import { Hono } from 'hono';
import type { FeedResponse } from '@sizzle/shared';
import { optionalAuth, requireAuth } from '../middleware/auth';
import { supabaseAdmin } from '../lib/supabase';
import { dbFail } from '../lib/errors';
import { buildCards, type RecipeRow } from '../mappers';
import { tasteScore } from '../services/taste';
import type { AppEnv } from '../types';

export const feed = new Hono<AppEnv>();

const PAGE = 10;
/** How far a taste match outranks recency in the cold-start feed. */
const TASTE_WEIGHT = 10;

/**
 * GET /feed/for-you — recent published recipes.
 *
 * Stage 0 placeholder. Phase 4 replaces the ordering with a ranking pipeline
 * modeled on X's algorithm (in/out-of-network sources → multi-action weighted
 * scorer → cook-diversity → impression filtering). The RecipeCard response
 * shape below is the stable contract the ranker slots behind.
 * See docs/recommendation-algorithm.md.
 */
feed.get('/for-you', optionalAuth, async (c) => {
  const cursor = c.req.query('cursor');
  const userId = c.get('userId');

  // Cold-start personalization: the first page for an authed viewer who has
  // onboarding tastes is ordered taste-match-first, then recency.
  if (userId && !cursor) {
    const { data: profile } = await supabaseAdmin.from('profiles').select('tastes').eq('id', userId).maybeSingle();
    const tastes = ((profile?.tastes ?? []) as string[]).filter(Boolean);
    if (tastes.length) {
      const { data, error } = await supabaseAdmin
        .from('recipes')
        .select('*')
        .eq('status', 'published')
        .order('created_at', { ascending: false })
        .limit(40);
      if (error) throw dbFail(error.message);
      const rows = (data ?? []) as RecipeRow[];
      const scored = rows
        .map((r, idx) => ({ r, s: tasteScore(`${r.cuisine} ${r.title}`, tastes) * TASTE_WEIGHT + (rows.length - idx) * 0.1 }))
        .sort((a, b) => b.s - a.s)
        .slice(0, PAGE)
        .map((x) => x.r);
      const items = await buildCards(supabaseAdmin, userId, scored);
      return c.json<FeedResponse>({ items, nextCursor: null });
    }
  }

  // Default: recency, cursor-paginated.
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
