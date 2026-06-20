import { Hono } from 'hono';
import type { FeedResponse } from '@sizzle/shared';
import { optionalAuth, requireAuth } from '../middleware/auth';
import { supabaseAdmin } from '../lib/supabase';
import { dbFail } from '../lib/errors';
import { buildCards, type RecipeRow } from '../mappers';
import type { AppEnv } from '../types';

export const feed = new Hono<AppEnv>();

const PAGE = 10;

/** GET /feed/for-you — recent published recipes (popularity ranking lands in Phase 4). */
feed.get('/for-you', optionalAuth, async (c) => {
  const cursor = c.req.query('cursor');
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
  const items = await buildCards(supabaseAdmin, c.get('userId'), page);
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
