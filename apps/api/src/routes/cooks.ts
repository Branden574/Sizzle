import { Hono } from 'hono';
import type { CookProfile } from '@sizzle/shared';
import { optionalAuth, requireAuth } from '../middleware/auth';
import { supabaseAdmin } from '../lib/supabase';
import { badRequest, dbFail, notFound } from '../lib/errors';
import { buildCards, cookSummary, type ProfileRow, type RecipeRow } from '../mappers';
import type { AppEnv } from '../types';

export const cooks = new Hono<AppEnv>();

/** GET /cooks/:id — public cook profile + recipe grid + viewer.following. */
cooks.get('/:id', optionalAuth, async (c) => {
  const id = c.req.param('id');
  const viewerId = c.get('userId');

  const { data: profile, error } = await supabaseAdmin.from('profiles').select('*').eq('id', id).maybeSingle();
  if (error) throw dbFail(error.message);
  if (!profile) throw notFound('Cook not found');
  const p = profile as ProfileRow;

  const { data: recipeRows } = await supabaseAdmin
    .from('recipes')
    .select('*')
    .eq('cook_id', id)
    .eq('status', 'published')
    .order('created_at', { ascending: false });
  const rows = (recipeRows ?? []) as RecipeRow[];
  const cards = await buildCards(supabaseAdmin, viewerId, rows);

  let following = false;
  if (viewerId) {
    const { data: f } = await supabaseAdmin
      .from('follows')
      .select('cook_id')
      .eq('follower_id', viewerId)
      .eq('cook_id', id)
      .maybeSingle();
    following = !!f;
  }

  const summary = cookSummary(p);
  const res: CookProfile = {
    ...summary,
    bio: p.bio ?? '',
    counts: {
      followers: p.follower_count,
      following: p.following_count,
      likes: p.total_likes,
      recipes: rows.length,
    },
    viewer: { following },
    recipes: cards,
  };
  return c.json(res);
});

/** POST /cooks/:id/follow */
cooks.post('/:id/follow', requireAuth, async (c) => {
  const cookId = c.req.param('id');
  const userId = c.get('userId')!;
  if (cookId === userId) throw badRequest('You cannot follow yourself');

  const { data: cook } = await supabaseAdmin.from('profiles').select('id').eq('id', cookId).maybeSingle();
  if (!cook) throw notFound('Cook not found');

  const { data: existing } = await supabaseAdmin
    .from('follows')
    .select('cook_id')
    .eq('follower_id', userId)
    .eq('cook_id', cookId)
    .maybeSingle();

  if (!existing) {
    const { error } = await supabaseAdmin.from('follows').insert({ follower_id: userId, cook_id: cookId });
    if (error) throw dbFail(error.message);
    await supabaseAdmin.rpc('adjust_follow_counters', { p_follower: userId, p_cook: cookId, delta: 1 });
  }
  return c.json({ following: true });
});

/** DELETE /cooks/:id/follow */
cooks.delete('/:id/follow', requireAuth, async (c) => {
  const cookId = c.req.param('id');
  const userId = c.get('userId')!;

  const { data: existing } = await supabaseAdmin
    .from('follows')
    .select('cook_id')
    .eq('follower_id', userId)
    .eq('cook_id', cookId)
    .maybeSingle();

  if (existing) {
    await supabaseAdmin.from('follows').delete().eq('follower_id', userId).eq('cook_id', cookId);
    await supabaseAdmin.rpc('adjust_follow_counters', { p_follower: userId, p_cook: cookId, delta: -1 });
  }
  return c.json({ following: false });
});
