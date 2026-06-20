import { Hono } from 'hono';
import type { CookProfile, SuggestedCook } from '@sizzle/shared';
import { optionalAuth, requireAuth, requireNotBanned } from '../middleware/auth';
import { supabaseAdmin } from '../lib/supabase';
import { badRequest, dbFail, notFound } from '../lib/errors';
import { assertUuid } from '../lib/validate';
import { buildCards, cookSummary, type ProfileRow, type RecipeRow } from '../mappers';
import { matchTastes } from '../services/taste';
import { notify } from '../services/notify';
import type { AppEnv } from '../types';

export const cooks = new Hono<AppEnv>();

/**
 * GET /cooks/suggested?tastes=Japanese,Spicy&limit=5
 * Onboarding creator recommendations: the platform's top cooks by follower
 * count (taste overlap is surfaced as `matched` chips but no longer reorders —
 * following is optional, so we lead with the most-followed creators).
 * Public; excludes the viewer and cooks they already follow when authed.
 */
cooks.get('/suggested', optionalAuth, async (c) => {
  const viewerId = c.get('userId');
  const tastes = (c.req.query('tastes') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const limit = Math.min(Number(c.req.query('limit')) || 5, 20);

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
      return { p, matched };
    })
    // Top cooks by follower count; taste overlap is a tiebreaker only.
    .sort((a, b) => b.p.follower_count - a.p.follower_count || b.matched.length - a.matched.length)
    .slice(0, limit)
    .map(({ p, matched }): SuggestedCook => ({ ...cookSummary(p), bio: p.bio ?? '', matched, followers: p.follower_count }));

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

  // The owner also sees their own removed posts (with the "video removed" state);
  // everyone else sees only published.
  const isOwner = viewerId === id;
  let recipeQuery = supabaseAdmin.from('recipes').select('*').eq('cook_id', id);
  recipeQuery = isOwner ? recipeQuery.in('status', ['published', 'removed']) : recipeQuery.eq('status', 'published');
  const { data: recipeRows } = await recipeQuery.order('created_at', { ascending: false });
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

/** GET /cooks/:id/followers — the people who follow this cook. */
cooks.get('/:id/followers', optionalAuth, async (c) => {
  const id = assertUuid(c.req.param('id'), 'cook');
  const { data: rows } = await supabaseAdmin.from('follows').select('follower_id').eq('cook_id', id).limit(200);
  const ids = (rows ?? []).map((r) => r.follower_id as string);
  if (ids.length === 0) return c.json([]);
  const { data: profiles } = await supabaseAdmin.from('profiles').select('*').in('id', ids);
  return c.json((profiles ?? []).map((p) => cookSummary(p as ProfileRow)));
});

/** GET /cooks/:id/following — the cooks this user follows. */
cooks.get('/:id/following', optionalAuth, async (c) => {
  const id = assertUuid(c.req.param('id'), 'cook');
  const { data: rows } = await supabaseAdmin.from('follows').select('cook_id').eq('follower_id', id).limit(200);
  const ids = (rows ?? []).map((r) => r.cook_id as string);
  if (ids.length === 0) return c.json([]);
  const { data: profiles } = await supabaseAdmin.from('profiles').select('*').in('id', ids);
  return c.json((profiles ?? []).map((p) => cookSummary(p as ProfileRow)));
});

/** POST /cooks/:id/follow */
cooks.post('/:id/follow', requireAuth, requireNotBanned, async (c) => {
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
cooks.delete('/:id/follow', requireAuth, requireNotBanned, async (c) => {
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
