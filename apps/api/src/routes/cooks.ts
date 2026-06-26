import { Hono } from 'hono';
import type { CookProfile, SuggestedCook } from '@sizzle/shared';
import { optionalAuth, requireAuth, requireNotBanned } from '../middleware/auth';
import { supabaseAdmin } from '../lib/supabase';
import { badRequest, dbFail, notFound } from '../lib/errors';
import { assertUuid } from '../lib/validate';
import { buildCards, cookSummary, loadBlockedIds, profileLinks, type ProfileRow, type RecipeRow } from '../mappers';
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
  let blocked = new Set<string>();
  if (viewerId) {
    const { data: f } = await supabaseAdmin.from('follows').select('cook_id').eq('follower_id', viewerId);
    following = new Set((f ?? []).map((x) => x.cook_id as string));
    blocked = await loadBlockedIds(supabaseAdmin, viewerId);
  }

  const ranked = (profiles as ProfileRow[])
    .filter((p) => p.id !== viewerId && !following.has(p.id) && !blocked.has(p.id))
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

/**
 * GET /cooks/handle-available?handle=foo — public username availability check for
 * the signup form. Normalizes to [a-z0-9_] and matches case-insensitively (the
 * underscore is escaped so ilike treats it literally, not as a wildcard).
 */
cooks.get('/handle-available', async (c) => {
  const handle = (c.req.query('handle') ?? '').trim().replace(/[^A-Za-z0-9_]/g, '');
  if (handle.length < 3) return c.json({ available: false, reason: 'At least 3 characters.' });
  if (handle.length > 30) return c.json({ available: false, reason: 'Too long (max 30).' });
  // RPC does `lower(handle) = lower(h)` → uses the profiles_handle_lower_key index.
  const { data, error } = await supabaseAdmin.rpc('handle_available', { h: handle });
  if (error) throw dbFail(error.message);
  return c.json({ available: !!data });
});

/** GET /cooks/:id — public cook profile + recipe grid + viewer.following. */
cooks.get('/:id', optionalAuth, async (c) => {
  const id = assertUuid(c.req.param('id'), 'cook');
  const viewerId = c.get('userId');

  const { data: profile, error } = await supabaseAdmin.from('profiles').select('*').eq('id', id).maybeSingle();
  if (error) throw dbFail(error.message);
  if (!profile) throw notFound('Cook not found');
  const p = profile as ProfileRow;

  // Block state. If THEY blocked the viewer, the profile is unavailable (don't
  // reveal it exists). If the VIEWER blocked them, show a blocked shell (so they
  // can unblock) with no recipes.
  let blockedByMe = false;
  let muted = false;
  if (viewerId && viewerId !== id) {
    const [{ data: b1 }, { data: b2 }, { data: m }] = await Promise.all([
      supabaseAdmin.from('user_blocks').select('blocked_id').eq('blocker_id', viewerId).eq('blocked_id', id).maybeSingle(),
      supabaseAdmin.from('user_blocks').select('blocker_id').eq('blocker_id', id).eq('blocked_id', viewerId).maybeSingle(),
      supabaseAdmin.from('user_mutes').select('muted_id').eq('muter_id', viewerId).eq('muted_id', id).maybeSingle(),
    ]);
    if (b2) throw notFound('Cook not found');
    blockedByMe = !!b1;
    muted = !!m;
  }

  // The owner also sees their own removed posts (with the "video removed" state);
  // everyone else sees only published. A blocked-by-me cook shows no recipes.
  const isOwner = viewerId === id;
  let rows: RecipeRow[] = [];
  if (!blockedByMe) {
    let recipeQuery = supabaseAdmin.from('recipes').select('*').eq('cook_id', id);
    recipeQuery = isOwner ? recipeQuery.in('status', ['published', 'removed']) : recipeQuery.eq('status', 'published');
    const { data: recipeRows } = await recipeQuery.order('created_at', { ascending: false });
    rows = (recipeRows ?? []) as RecipeRow[];
  }
  const cards = blockedByMe ? [] : await buildCards(supabaseAdmin, viewerId, rows);

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
    links: profileLinks(p),
    counts: {
      followers: p.follower_count,
      following: p.following_count,
      likes: p.total_likes,
      recipes: rows.length,
    },
    viewer: { following, blocked: blockedByMe, muted },
    recipes: cards,
  };
  return c.json(res);
});

/** GET /cooks/:id/followers — the people who follow this cook (blocked hidden). */
cooks.get('/:id/followers', optionalAuth, async (c) => {
  const id = assertUuid(c.req.param('id'), 'cook');
  const { data: rows } = await supabaseAdmin.from('follows').select('follower_id').eq('cook_id', id).limit(200);
  const ids = (rows ?? []).map((r) => r.follower_id as string);
  if (ids.length === 0) return c.json([]);
  const blocked = await loadBlockedIds(supabaseAdmin, c.get('userId'));
  const { data: profiles } = await supabaseAdmin.from('profiles').select('*').in('id', ids);
  return c.json((profiles ?? []).filter((p) => !blocked.has(p.id as string)).map((p) => cookSummary(p as ProfileRow)));
});

/** GET /cooks/:id/following — the cooks this user follows (blocked hidden). */
cooks.get('/:id/following', optionalAuth, async (c) => {
  const id = assertUuid(c.req.param('id'), 'cook');
  const { data: rows } = await supabaseAdmin.from('follows').select('cook_id').eq('follower_id', id).limit(200);
  const ids = (rows ?? []).map((r) => r.cook_id as string);
  if (ids.length === 0) return c.json([]);
  const blocked = await loadBlockedIds(supabaseAdmin, c.get('userId'));
  const { data: profiles } = await supabaseAdmin.from('profiles').select('*').in('id', ids);
  return c.json((profiles ?? []).filter((p) => !blocked.has(p.id as string)).map((p) => cookSummary(p as ProfileRow)));
});

/** POST /cooks/:id/follow */
cooks.post('/:id/follow', requireAuth, requireNotBanned, async (c) => {
  const cookId = assertUuid(c.req.param('id'), 'cook');
  const userId = c.get('userId')!;
  if (cookId === userId) throw badRequest('You cannot follow yourself');

  const { data: cook } = await supabaseAdmin.from('profiles').select('id').eq('id', cookId).maybeSingle();
  if (!cook) throw notFound('Cook not found');

  // Can't follow someone you've blocked or who has blocked you.
  const blocked = await loadBlockedIds(supabaseAdmin, userId);
  if (blocked.has(cookId)) throw notFound('Cook not found');

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

/**
 * POST /cooks/:id/block — block a user. Tears down any follow in BOTH directions
 * (and fixes the counters); after this neither party sees the other anywhere.
 */
cooks.post('/:id/block', requireAuth, requireNotBanned, async (c) => {
  const targetId = assertUuid(c.req.param('id'), 'cook');
  const userId = c.get('userId')!;
  if (targetId === userId) throw badRequest('You cannot block yourself');
  const { data: target } = await supabaseAdmin.from('profiles').select('id').eq('id', targetId).maybeSingle();
  if (!target) throw notFound('Cook not found');

  await supabaseAdmin.from('user_blocks').upsert({ blocker_id: userId, blocked_id: targetId }, { onConflict: 'blocker_id,blocked_id', ignoreDuplicates: true });

  // Remove any follow in either direction and correct the denormalized counters.
  // The DELETE is authoritative — decrement only when THIS call actually removed
  // the row, so a concurrent unfollow can't double-decrement.
  for (const [follower, cook] of [[userId, targetId], [targetId, userId]] as const) {
    const { data: removed } = await supabaseAdmin.from('follows').delete().eq('follower_id', follower).eq('cook_id', cook).select('cook_id');
    if (removed && removed.length) {
      await supabaseAdmin.rpc('adjust_follow_counters', { p_follower: follower, p_cook: cook, delta: -1 });
    }
  }
  return c.json({ blocked: true });
});

/** DELETE /cooks/:id/block — unblock (does not restore the prior follow). */
cooks.delete('/:id/block', requireAuth, async (c) => {
  const targetId = assertUuid(c.req.param('id'), 'cook');
  const userId = c.get('userId')!;
  await supabaseAdmin.from('user_blocks').delete().eq('blocker_id', userId).eq('blocked_id', targetId);
  return c.json({ blocked: false });
});

/** POST /cooks/:id/mute — silently stop seeing this user's posts in your feed. */
cooks.post('/:id/mute', requireAuth, requireNotBanned, async (c) => {
  const targetId = assertUuid(c.req.param('id'), 'cook');
  const userId = c.get('userId')!;
  if (targetId === userId) throw badRequest('You cannot mute yourself');
  const { data: target } = await supabaseAdmin.from('profiles').select('id').eq('id', targetId).maybeSingle();
  if (!target) throw notFound('Cook not found');
  await supabaseAdmin.from('user_mutes').upsert({ muter_id: userId, muted_id: targetId }, { onConflict: 'muter_id,muted_id', ignoreDuplicates: true });
  return c.json({ muted: true });
});

/** DELETE /cooks/:id/mute — unmute. */
cooks.delete('/:id/mute', requireAuth, async (c) => {
  const targetId = assertUuid(c.req.param('id'), 'cook');
  const userId = c.get('userId')!;
  await supabaseAdmin.from('user_mutes').delete().eq('muter_id', userId).eq('muted_id', targetId);
  return c.json({ muted: false });
});
