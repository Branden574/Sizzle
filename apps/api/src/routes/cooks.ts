import { Hono } from 'hono';
import type { CookProfile, SuggestedCook } from '@sizzle/shared';
import { optionalAuth, requireAuth } from '../middleware/auth';
import { supabaseAdmin } from '../lib/supabase';
import { badRequest, dbFail, notFound } from '../lib/errors';
import { assertUuid } from '../lib/validate';
import { buildCards, cookSummary, type ProfileRow, type RecipeRow } from '../mappers';
import { matchTastes } from '../services/taste';
import { notify } from '../services/notify';
import type { AppEnv } from '../types';

export const cooks = new Hono<AppEnv>();

/**
 * GET /cooks/suggested?tastes=Japanese,Spicy&limit=8
 * Onboarding creator recommendations ranked by taste overlap (then popularity).
 * Public; excludes the viewer and cooks they already follow when authed.
 */
cooks.get('/suggested', optionalAuth, async (c) => {
  const viewerId = c.get('userId');
  const tastes = (c.req.query('tastes') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const limit = Math.min(Number(c.req.query('limit')) || 8, 20);

  const [{ data: profiles, error }, { data: recipeRows }] = await Promise.all([
    supabaseAdmin.from('profiles').select('*').eq('is_cook', true),
    supabaseAdmin.from('recipes').select('cook_id, cuisine, title').eq('status', 'published'),
  ]);
  if (error) throw dbFail(error.message);

  // Build a searchable text blob per cook from bio + their recipe cuisines/titles.
  const blobs = new Map<string, string>();
  for (const r of recipeRows ?? []) {
    blobs.set(r.cook_id as string, `${blobs.get(r.cook_id as string) ?? ''} ${r.cuisine} ${r.title}`);
  }

  let following = new Set<string>();
  if (viewerId) {
    const { data: f } = await supabaseAdmin.from('follows').select('cook_id').eq('follower_id', viewerId);
    following = new Set((f ?? []).map((x) => x.cook_id as string));
  }

  const ranked = (profiles as ProfileRow[])
    .filter((p) => p.id !== viewerId && !following.has(p.id))
    .map((p) => {
      const matched = matchTastes(`${p.bio ?? ''} ${blobs.get(p.id) ?? ''}`, tastes);
      return { p, matched, score: matched.length };
    })
    .sort((a, b) => b.score - a.score || b.p.follower_count - a.p.follower_count)
    .slice(0, limit)
    .map(({ p, matched }): SuggestedCook => ({ ...cookSummary(p), bio: p.bio ?? '', matched }));

  return c.json(ranked);
});

/** GET /cooks/:id — public cook profile + recipe grid + viewer.following. */
cooks.get('/:id', optionalAuth, async (c) => {
  const id = assertUuid(c.req.param('id'), 'cook');
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
    bannerUrl: p.banner_url,
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
  const cookId = assertUuid(c.req.param('id'), 'cook');
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
    await notify({ userId: cookId, type: 'follow', actorId: userId });
  }
  return c.json({ following: true });
});

/** DELETE /cooks/:id/follow */
cooks.delete('/:id/follow', requireAuth, async (c) => {
  const cookId = assertUuid(c.req.param('id'), 'cook');
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
