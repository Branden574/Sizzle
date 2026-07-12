import { Hono } from 'hono';
import { z } from 'zod';
import type { CollectionDTO, CreatorAnalytics, FeedResponse, MeProfile, NotificationDTO } from '@sizzle/shared';
import { requireAuth } from '../middleware/auth';
import { supabaseAdmin, userClient } from '../lib/supabase';
import { badRequest, notFound } from '../lib/errors';
import { assertUuid } from '../lib/validate';
import { initialsOf, relativeTime } from '../lib/format';
import { buildCards, cookSummary, loadBlockedIds, profileLinks, type ProfileRow, type RecipeRow } from '../mappers';
import { normalizeLink, PROFILE_LINK_KEYS } from '../services/links';
import { moderateImages } from '../services/moderation';
import { env } from '../env';
import type { AppEnv } from '../types';

export const me = new Hono<AppEnv>();

me.use('*', requireAuth);

/** GET /me — the signed-in user's profile + live counts. */
me.get('/', async (c) => {
  const userId = c.get('userId')!;
  const db = userClient(c.get('accessToken')!);

  // Read the owner's own row via the service role: after the profiles PII
  // lockdown, the authenticated role no longer has column privilege on
  // sensitive fields (phone, role, notif_prefs…), so select('*') under the
  // caller JWT would fail. The user is already authenticated (userId from JWT).
  const { data: profile, error } = await supabaseAdmin.from('profiles').select('*').eq('id', userId).single();
  if (error || !profile) throw notFound('Profile not found');

  // Use the denormalized follower/following counters (seeded + maintained by
  // adjust_follow_counters) so the profile matches the cook profile + the badge.
  const { count: savedCount } = await db.from('saves').select('*', { count: 'exact', head: true }).eq('user_id', userId);

  const dto: MeProfile = {
    id: profile.id,
    name: profile.display_name,
    handle: profile.handle,
    init: initialsOf(profile.display_name ?? profile.handle ?? '?'),
    avatarColor: profile.avatar_color,
    avatarUrl: profile.avatar_url,
    bannerUrl: profile.banner_url,
    phone: profile.phone,
    bio: profile.bio ?? '',
    links: profileLinks(profile as ProfileRow),
    isCook: profile.is_cook,
    verifiedTier: profile.verified_tier ?? null,
    role: profile.role ?? 'user',
    banned: profile.banned ?? false,
    bannedReason: profile.banned_reason ?? null,
    deleteAt: profile.delete_at ?? null,
    banAppealStatus: profile.ban_appeal_status ?? 'none',
    counts: { following: profile.following_count ?? 0, followers: profile.follower_count ?? 0, saved: savedCount ?? 0 },
    tastes: profile.tastes ?? [],
    pushEnabled: profile.push_enabled ?? true,
    notifPrefs: (profile.notif_prefs ?? {}) as MeProfile['notifPrefs'],
    needsUsername: profile.handle_auto ?? false,
  };
  return c.json(dto);
});

const banAppealSchema = z.object({ text: z.string().trim().min(1).max(600) });

/** POST /me/ban-appeal — a banned user appeals their ban (before the 45-day wipe). */
me.post('/ban-appeal', async (c) => {
  const userId = c.get('userId')!;
  const body = banAppealSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) throw badRequest('Appeal text required');

  const { data: profile } = await supabaseAdmin.from('profiles').select('banned').eq('id', userId).maybeSingle();
  if (!profile?.banned) throw badRequest('Your account is not suspended');

  const { error } = await supabaseAdmin
    .from('profiles')
    .update({ ban_appeal_status: 'pending', ban_appeal_text: body.data.text, ban_appeal_at: new Date().toISOString() })
    .eq('id', userId);
  if (error) throw badRequest('Could not submit appeal');
  return c.json({ ok: true });
});

const tastesSchema = z.object({ tastes: z.array(z.string().max(50)).max(64) });

/** POST /me/tastes — save onboarding taste preferences. */
me.post('/tastes', async (c) => {
  const userId = c.get('userId')!;
  const body = tastesSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) throw badRequest('Expected { tastes: string[] }', body.error.flatten());

  const db = userClient(c.get('accessToken')!);
  const { error } = await db.from('profiles').update({ tastes: body.data.tastes }).eq('id', userId);
  if (error) {
    console.error('tastes update:', error.message);
    throw badRequest('Could not save tastes');
  }
  return c.json({ ok: true, tastes: body.data.tastes });
});

const pushTokenSchema = z.object({
  token: z.string().trim().min(1).max(4096),
  platform: z.enum(['ios', 'android', 'web']).default('ios'),
});

/**
 * POST /me/push-token — register (upsert) this device's FCM token so the user
 * receives pushes. The token is globally unique, so re-registering the same
 * device (or one that moved accounts) just rebinds it to this user. Uses the
 * service role because `push_tokens` is RLS-locked with no public policies.
 */
me.post('/push-token', async (c) => {
  const userId = c.get('userId')!;
  const body = pushTokenSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) throw badRequest('Expected { token, platform? }', body.error.flatten());

  const { error } = await supabaseAdmin.from('push_tokens').upsert(
    { user_id: userId, token: body.data.token, platform: body.data.platform, updated_at: new Date().toISOString() },
    { onConflict: 'token' },
  );
  if (error) {
    console.error('push-token register:', error.message);
    throw badRequest('Could not register device');
  }
  return c.json({ ok: true });
});

/** DELETE /me/push-token — unregister a device token (sign-out / opt-out). */
me.delete('/push-token', async (c) => {
  const userId = c.get('userId')!;
  const body = z.object({ token: z.string().trim().min(1) }).safeParse(await c.req.json().catch(() => null));
  if (!body.success) throw badRequest('Expected { token }', body.error.flatten());

  const { error } = await supabaseAdmin
    .from('push_tokens')
    .delete()
    .eq('token', body.data.token)
    .eq('user_id', userId);
  if (error) {
    console.error('push-token delete:', error.message);
    throw badRequest('Could not unregister device');
  }
  return c.json({ ok: true });
});

/** POST /me/push-enabled — the in-app master switch for push delivery. */
me.post('/push-enabled', async (c) => {
  const userId = c.get('userId')!;
  const body = z.object({ enabled: z.boolean() }).safeParse(await c.req.json().catch(() => null));
  if (!body.success) throw badRequest('Expected { enabled: boolean }', body.error.flatten());

  const db = userClient(c.get('accessToken')!);
  const { error } = await db.from('profiles').update({ push_enabled: body.data.enabled }).eq('id', userId);
  if (error) {
    console.error('push-enabled update:', error.message);
    throw badRequest('Could not update push setting');
  }
  return c.json({ ok: true, enabled: body.data.enabled });
});

/** POST /me/notif-prefs — toggle a single push category (likes/comments/…). */
me.post('/notif-prefs', async (c) => {
  const userId = c.get('userId')!;
  const body = z
    .object({ key: z.enum(['likes', 'comments', 'follows', 'reposts', 'messages']), enabled: z.boolean() })
    .safeParse(await c.req.json().catch(() => null));
  if (!body.success) throw badRequest('Expected { key, enabled }');
  // Merge into the jsonb map via the admin client (column-locked for users).
  const { data: cur } = await supabaseAdmin.from('profiles').select('notif_prefs').eq('id', userId).maybeSingle();
  const next = { ...((cur?.notif_prefs as Record<string, boolean>) ?? {}), [body.data.key]: body.data.enabled };
  const { error } = await supabaseAdmin.from('profiles').update({ notif_prefs: next }).eq('id', userId);
  if (error) throw badRequest('Could not update notification setting');
  return c.json({ ok: true, notifPrefs: next });
});

/** GET /me/analytics — creator insights: totals + per-post engagement. */
me.get('/analytics', async (c) => {
  const userId = c.get('userId')!;
  const [recsRes, profRes, viewRes] = await Promise.all([
    supabaseAdmin.from('recipes').select('id, title, like_count, comment_count, save_count, share_count, created_at').eq('cook_id', userId).eq('status', 'published').order('created_at', { ascending: false }).limit(100),
    supabaseAdmin.from('profiles').select('follower_count').eq('id', userId).maybeSingle(),
    // Watch-time & completion, aggregated per recipe (data already logged in recipe_views).
    supabaseAdmin.rpc('creator_view_stats', { p_creator: userId }),
  ]);
  type ViewStat = { recipe_id: string; views: number; avg_dwell_ms: number; completed_count: number; skipped_count: number };
  const viewMap = new Map<string, ViewStat>();
  for (const v of (viewRes.data ?? []) as ViewStat[]) viewMap.set(v.recipe_id, v);

  const posts = (recsRes.data ?? []).map((r) => {
    const v = viewMap.get(r.id as string);
    const views = Number(v?.views ?? 0);
    return {
      id: r.id as string,
      title: r.title as string,
      createdAt: r.created_at as string,
      views,
      avgWatchMs: Math.round(Number(v?.avg_dwell_ms ?? 0)),
      completionPct: views ? Math.round((Number(v?.completed_count ?? 0) / views) * 100) : 0,
      skipPct: views ? Math.round((Number(v?.skipped_count ?? 0) / views) * 100) : 0,
      likes: (r.like_count as number) ?? 0,
      comments: (r.comment_count as number) ?? 0,
      saves: (r.save_count as number) ?? 0,
      shares: (r.share_count as number) ?? 0,
    };
  });
  const sum = (k: 'likes' | 'comments' | 'saves' | 'shares' | 'views') => posts.reduce((n, p) => n + p[k], 0);
  const totalViews = sum('views');
  // Watch-time / completion totals are view-weighted across posts.
  const totalCompleted = (viewRes.data ?? []).reduce((n: number, v: ViewStat) => n + Number(v.completed_count ?? 0), 0);
  const totalDwell = (viewRes.data ?? []).reduce((n: number, v: ViewStat) => n + Number(v.avg_dwell_ms ?? 0) * Number(v.views ?? 0), 0);
  return c.json<CreatorAnalytics>({
    totals: {
      recipes: posts.length,
      followers: (profRes.data?.follower_count as number) ?? 0,
      views: totalViews,
      likes: sum('likes'), comments: sum('comments'), saves: sum('saves'), shares: sum('shares'),
      avgWatchMs: totalViews ? Math.round(totalDwell / totalViews) : 0,
      completionPct: totalViews ? Math.round((totalCompleted / totalViews) * 100) : 0,
    },
    posts,
  });
});

/** GET /me/export — a JSON copy of everything the user has on Sizzle (GDPR/CCPA
 *  access). Their own data, so all columns are included. */
me.get('/export', async (c) => {
  const userId = c.get('userId')!;
  const [profile, recipes, comments, saves, following, followers, reactions, sentMessages] = await Promise.all([
    supabaseAdmin.from('profiles').select('*').eq('id', userId).maybeSingle(),
    supabaseAdmin.from('recipes').select('*').eq('cook_id', userId),
    supabaseAdmin.from('comments').select('*').eq('author_id', userId),
    supabaseAdmin.from('saves').select('recipe_id, created_at').eq('user_id', userId),
    supabaseAdmin.from('follows').select('cook_id, created_at').eq('follower_id', userId),
    supabaseAdmin.from('follows').select('follower_id, created_at').eq('cook_id', userId),
    supabaseAdmin.from('reactions').select('recipe_id, kind, created_at').eq('user_id', userId),
    supabaseAdmin.from('messages').select('conversation_id, text, created_at').eq('sender_id', userId),
  ]);
  return c.json({
    exportedAt: new Date().toISOString(),
    profile: profile.data ?? null,
    recipes: recipes.data ?? [],
    comments: comments.data ?? [],
    saves: saves.data ?? [],
    following: following.data ?? [],
    followers: followers.data ?? [],
    reactions: reactions.data ?? [],
    messagesSent: sentMessages.data ?? [],
  });
});

/** POST /me/verify — self-serve verification. Auto-grants the badge at follower
 *  thresholds (blue at 100k, gold at 1M), so creators don't wait on an admin. */
me.post('/verify', async (c) => {
  const userId = c.get('userId')!;
  const { data: prof } = await supabaseAdmin.from('profiles').select('follower_count, verified_tier').eq('id', userId).maybeSingle();
  const followers = (prof?.follower_count as number) ?? 0;
  const eligible: 'gold' | 'blue' | null = followers >= 1_000_000 ? 'gold' : followers >= 100_000 ? 'blue' : null;
  if (!eligible) {
    return c.json({ granted: false, tier: (prof?.verified_tier as string | null) ?? null, needed: 100_000 - followers, message: `Reach 100k followers to get verified (you have ${followers.toLocaleString()}).` });
  }
  // Never downgrade an admin-granted gold to blue.
  const current = prof?.verified_tier as string | null;
  const tier = current === 'gold' ? 'gold' : eligible;
  await supabaseAdmin.from('profiles').update({ verified_tier: tier }).eq('id', userId);
  return c.json({ granted: true, tier });
});

/** GET /me/drafts — the creator's own draft + scheduled posts (never public). */
me.get('/drafts', async (c) => {
  const userId = c.get('userId')!;
  const { data: rows } = await supabaseAdmin
    .from('recipes')
    .select('*')
    .eq('cook_id', userId)
    .in('status', ['draft', 'scheduled'])
    .order('created_at', { ascending: false })
    .limit(100);
  const cards = await buildCards(supabaseAdmin, userId, (rows ?? []) as RecipeRow[]);
  // Surface the schedule time so the client can show "Goes live …".
  const scheduledAt = new Map((rows ?? []).map((r) => [r.id as string, (r.scheduled_at as string | null) ?? null]));
  const draftStatus = new Map((rows ?? []).map((r) => [r.id as string, r.status as string]));
  return c.json({
    drafts: cards.map((card) => ({ ...card, draftStatus: draftStatus.get(card.id) ?? 'draft', scheduledAt: scheduledAt.get(card.id) ?? null })),
  });
});

/** GET /me/saved — the viewer's saved recipes (newest first). */
me.get('/saved', async (c) => {
  const userId = c.get('userId')!;
  const { data: saves } = await supabaseAdmin
    .from('saves')
    .select('recipe_id, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  const ids = (saves ?? []).map((s) => s.recipe_id as string);
  if (ids.length === 0) return c.json<FeedResponse>({ items: [], nextCursor: null });

  const { data: recipeRows } = await supabaseAdmin.from('recipes').select('*').in('id', ids);
  const byId = new Map<string, RecipeRow>((recipeRows ?? []).map((r) => [r.id as string, r as RecipeRow]));
  const ordered = ids.map((id) => byId.get(id)).filter((r): r is RecipeRow => !!r);
  const items = await buildCards(supabaseAdmin, userId, ordered);
  return c.json<FeedResponse>({ items, nextCursor: null });
});

/** GET /me/liked — the viewer's liked recipes (newest first). */
me.get('/liked', async (c) => {
  const userId = c.get('userId')!;
  const { data: likes } = await supabaseAdmin
    .from('reactions')
    .select('recipe_id, created_at')
    .eq('user_id', userId)
    .eq('kind', 'like')
    .order('created_at', { ascending: false });
  const ids = (likes ?? []).map((s) => s.recipe_id as string);
  if (ids.length === 0) return c.json<FeedResponse>({ items: [], nextCursor: null });

  const { data: recipeRows } = await supabaseAdmin.from('recipes').select('*').in('id', ids);
  const byId = new Map<string, RecipeRow>((recipeRows ?? []).map((r) => [r.id as string, r as RecipeRow]));
  const ordered = ids.map((id) => byId.get(id)).filter((r): r is RecipeRow => !!r);
  const items = await buildCards(supabaseAdmin, userId, ordered);
  return c.json<FeedResponse>({ items, nextCursor: null });
});

/* ───────────────────────── saved collections ───────────────────────── */

const collectionSchema = z.object({ name: z.string().trim().min(1).max(60) });

/** Confirm a collection belongs to the viewer; throws 404 otherwise. */
async function ownCollection(id: string, userId: string) {
  assertUuid(id, 'collection');
  const { data } = await supabaseAdmin.from('collections').select('id').eq('id', id).eq('user_id', userId).maybeSingle();
  if (!data) throw notFound('Collection not found');
}

/** GET /me/collections?recipeId=… — the viewer's collections (with counts + cover, and hasRecipe when ?recipeId is set). */
me.get('/collections', async (c) => {
  const userId = c.get('userId')!;
  const recipeId = c.req.query('recipeId');
  const { data: cols } = await supabaseAdmin.from('collections').select('id, name, created_at').eq('user_id', userId).order('created_at', { ascending: false });
  const list = cols ?? [];
  const ids = list.map((x) => x.id as string);

  let rows: { collection_id: string; recipe_id: string }[] = [];
  if (ids.length) {
    const { data } = await supabaseAdmin.from('collection_recipes').select('collection_id, recipe_id, added_at').in('collection_id', ids).order('added_at', { ascending: false });
    rows = (data ?? []) as typeof rows;
  }
  const countByCol = new Map<string, number>();
  const coverByCol = new Map<string, string>();
  for (const r of rows) {
    countByCol.set(r.collection_id, (countByCol.get(r.collection_id) ?? 0) + 1);
    if (!coverByCol.has(r.collection_id)) coverByCol.set(r.collection_id, r.recipe_id);
  }
  const bgById = new Map<string, string>();
  const coverIds = [...coverByCol.values()];
  if (coverIds.length) {
    const { data: recs } = await supabaseAdmin.from('recipes').select('id, bg').in('id', coverIds);
    for (const rec of recs ?? []) bgById.set(rec.id as string, rec.bg as string);
  }
  const memberCols = recipeId ? new Set(rows.filter((r) => r.recipe_id === recipeId).map((r) => r.collection_id)) : null;

  const dto: CollectionDTO[] = list.map((col) => {
    const coverRid = coverByCol.get(col.id as string);
    return {
      id: col.id as string,
      name: col.name as string,
      createdAt: col.created_at as string,
      count: countByCol.get(col.id as string) ?? 0,
      coverBg: coverRid ? bgById.get(coverRid) ?? null : null,
      ...(memberCols ? { hasRecipe: memberCols.has(col.id as string) } : {}),
    };
  });
  return c.json(dto);
});

/** POST /me/collections {name} — create a collection. */
me.post('/collections', async (c) => {
  const userId = c.get('userId')!;
  const parsed = collectionSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw badRequest('Invalid collection name');
  const { data, error } = await supabaseAdmin
    .from('collections')
    .insert({ user_id: userId, name: parsed.data.name })
    .select('id, name, created_at')
    .single();
  if (error || !data) throw badRequest(error?.message ?? 'Failed to create collection');
  return c.json<CollectionDTO>({ id: data.id as string, name: data.name as string, count: 0, coverBg: null, createdAt: data.created_at as string }, 201);
});

/** PATCH /me/collections/:id {name} — rename a collection. */
me.patch('/collections/:id', async (c) => {
  const userId = c.get('userId')!;
  const id = c.req.param('id');
  await ownCollection(id, userId);
  const parsed = collectionSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw badRequest('Invalid collection name');
  const { error } = await supabaseAdmin.from('collections').update({ name: parsed.data.name }).eq('id', id).eq('user_id', userId);
  if (error) throw badRequest(error.message ?? 'Failed to rename collection');
  return c.json({ ok: true });
});

/** DELETE /me/collections/:id — delete a collection (rows cascade). */
me.delete('/collections/:id', async (c) => {
  const userId = c.get('userId')!;
  const id = c.req.param('id');
  await ownCollection(id, userId);
  await supabaseAdmin.from('collections').delete().eq('id', id).eq('user_id', userId);
  return c.json({ ok: true });
});

/** POST /me/collections/:id/recipes {recipeId} — add a recipe. */
me.post('/collections/:id/recipes', async (c) => {
  const userId = c.get('userId')!;
  const id = c.req.param('id');
  await ownCollection(id, userId);
  const body = (await c.req.json().catch(() => ({}))) as { recipeId?: string };
  const recipeId = assertUuid(body.recipeId ?? '', 'recipe');
  await supabaseAdmin.from('collection_recipes').upsert({ collection_id: id, recipe_id: recipeId }, { onConflict: 'collection_id,recipe_id', ignoreDuplicates: true });
  return c.json({ ok: true });
});

/** DELETE /me/collections/:id/recipes/:recipeId — remove a recipe. */
me.delete('/collections/:id/recipes/:recipeId', async (c) => {
  const userId = c.get('userId')!;
  const id = c.req.param('id');
  await ownCollection(id, userId);
  const recipeId = assertUuid(c.req.param('recipeId'), 'recipe');
  await supabaseAdmin.from('collection_recipes').delete().eq('collection_id', id).eq('recipe_id', recipeId);
  return c.json({ ok: true });
});

/** GET /me/collections/:id/recipes — the recipe cards in a collection. */
me.get('/collections/:id/recipes', async (c) => {
  const userId = c.get('userId')!;
  const id = c.req.param('id');
  await ownCollection(id, userId);
  const { data: rows } = await supabaseAdmin.from('collection_recipes').select('recipe_id, added_at').eq('collection_id', id).order('added_at', { ascending: false });
  const ids = (rows ?? []).map((r) => r.recipe_id as string);
  if (!ids.length) return c.json<FeedResponse>({ items: [], nextCursor: null });
  const { data: recipeRows } = await supabaseAdmin.from('recipes').select('*').in('id', ids);
  const byId = new Map<string, RecipeRow>((recipeRows ?? []).map((r) => [r.id as string, r as RecipeRow]));
  const ordered = ids.map((rid) => byId.get(rid)).filter((r): r is RecipeRow => !!r);
  const items = await buildCards(supabaseAdmin, userId, ordered);
  return c.json<FeedResponse>({ items, nextCursor: null });
});

/** GET /me/notifications — recent activity directed at the viewer. */
me.get('/notifications', async (c) => {
  const userId = c.get('userId')!;
  const { data: rows } = await supabaseAdmin
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);
  const list = rows ?? [];
  if (list.length === 0) return c.json<NotificationDTO[]>([]);

  const actorIds = [...new Set(list.map((n) => n.actor_id as string))];
  const recipeIds = [...new Set(list.map((n) => n.recipe_id as string | null).filter((x): x is string => !!x))];
  const [{ data: actors }, recipesRes] = await Promise.all([
    supabaseAdmin.from('profiles').select('*').in('id', actorIds),
    recipeIds.length
      ? supabaseAdmin.from('recipes').select('id,title').in('id', recipeIds)
      : Promise.resolve({ data: [] as { id: string; title: string }[] }),
  ]);
  const actorMap = new Map<string, ProfileRow>((actors ?? []).map((a) => [a.id as string, a as ProfileRow]));
  const titleMap = new Map<string, string>(((recipesRes.data ?? []) as { id: string; title: string }[]).map((r) => [r.id, r.title]));
  // Drop notifications from blocked users (either direction).
  const blocked = await loadBlockedIds(supabaseAdmin, userId);

  const items: NotificationDTO[] = list
    .filter((n) => actorMap.has(n.actor_id) && !blocked.has(n.actor_id))
    .map((n) => ({
      id: n.id,
      type: n.type,
      actor: cookSummary(actorMap.get(n.actor_id)!),
      recipeId: n.recipe_id,
      recipeTitle: n.recipe_id ? titleMap.get(n.recipe_id) ?? null : null,
      read: n.read,
      createdAt: n.created_at,
      time: relativeTime(new Date(n.created_at)),
    }));
  return c.json(items);
});

/** GET /me/blocked — the accounts the viewer has blocked (for the unblock list). */
me.get('/blocked', async (c) => {
  const userId = c.get('userId')!;
  const { data: rows } = await supabaseAdmin.from('user_blocks').select('blocked_id, created_at').eq('blocker_id', userId).order('created_at', { ascending: false });
  const ids = (rows ?? []).map((r) => r.blocked_id as string);
  if (ids.length === 0) return c.json([]);
  const { data: profiles } = await supabaseAdmin.from('profiles').select('*').in('id', ids);
  const byId = new Map((profiles ?? []).map((p) => [p.id as string, p as ProfileRow]));
  // Preserve newest-blocked-first order.
  return c.json(ids.map((id) => byId.get(id)).filter((p): p is ProfileRow => !!p).map((p) => cookSummary(p)));
});

/** POST /me/notifications/read — mark all as read. */
me.post('/notifications/read', async (c) => {
  const userId = c.get('userId')!;
  await supabaseAdmin.from('notifications').update({ read: true }).eq('user_id', userId).eq('read', false);
  return c.json({ ok: true });
});

const linkOrNull = z.string().trim().max(300).nullable().optional();
const patchSchema = z.object({
  displayName: z.string().trim().min(1).max(60).optional(),
  bio: z.string().max(150).optional(),
  handle: z.string().trim().min(2).max(30).optional(),
  phone: z.string().trim().max(30).optional(),
  avatarUrl: z.string().url().max(1000).nullable().optional(),
  bannerUrl: z.string().url().max(1000).nullable().optional(),
  links: z
    .object({
      instagram: linkOrNull, tiktok: linkOrNull, x: linkOrNull,
      facebook: linkOrNull, discord: linkOrNull, youtube: linkOrNull, website: linkOrNull,
    })
    .partial()
    .optional(),
});

/** PATCH /me — edit display name / handle / bio / phone / avatar / banner. */
me.patch('/', async (c) => {
  const userId = c.get('userId')!;
  const body = patchSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) throw badRequest('Invalid profile update', body.error.flatten());

  // Avatar/banner must live in the caller's OWN storage folder (not an arbitrary
  // origin or another user's upload — these URLs are served to everyone), and any
  // newly-set image is vision-moderated before it's persisted.
  const storageBase = `${env.SUPABASE_URL.replace(/\/$/, '')}/storage/v1/object/public`;
  const toModerate: string[] = [];
  const requireOwnFolder = (url: string | null | undefined, bucket: 'avatars' | 'banners') => {
    if (!url) return; // null clears the image; undefined leaves it unchanged
    if (!url.startsWith(`${storageBase}/${bucket}/${userId}/`)) throw badRequest(`Invalid ${bucket === 'avatars' ? 'avatar' : 'banner'} image`);
    toModerate.push(url);
  };
  requireOwnFolder(body.data.avatarUrl, 'avatars');
  requireOwnFolder(body.data.bannerUrl, 'banners');
  if (toModerate.length) {
    const mod = await moderateImages(toModerate);
    if (!mod.ok) throw badRequest(mod.reason!);
  }

  const updates: Record<string, unknown> = {};
  if (body.data.displayName !== undefined) updates.display_name = body.data.displayName;
  if (body.data.bio !== undefined) updates.bio = body.data.bio;
  // Keep the case the user typed (strip @ + invalid chars); uniqueness is enforced
  // case-insensitively by the lower(handle) unique index.
  if (body.data.handle !== undefined) {
    updates.handle = body.data.handle.replace(/^@/, '').replace(/[^A-Za-z0-9_]/g, '');
  }
  if (body.data.phone !== undefined) updates.phone = body.data.phone;
  if (body.data.avatarUrl !== undefined) updates.avatar_url = body.data.avatarUrl;
  if (body.data.bannerUrl !== undefined) updates.banner_url = body.data.bannerUrl;
  if (body.data.links) {
    for (const key of PROFILE_LINK_KEYS) {
      const raw = body.data.links[key];
      if (raw !== undefined) updates[`${key}_url`] = normalizeLink(key, raw);
    }
  }
  if (Object.keys(updates).length === 0) return c.json({ ok: true });

  const db = userClient(c.get('accessToken')!);
  const { error } = await db.from('profiles').update(updates).eq('id', userId);
  if (error) {
    if (/duplicate|unique/i.test(error.message)) throw badRequest('That handle is taken');
    console.error('profile update:', error.message);
    throw badRequest('Could not update profile');
  }
  // Choosing a handle clears the "auto-derived" flag (so the pick-a-username step
  // won't reappear). `handle_auto` is intentionally NOT in the user's update grant
  // (profile column-lock), so clear it with the admin client — doing it in the
  // user update above would fail with "permission denied for column handle_auto".
  if (body.data.handle !== undefined) {
    await supabaseAdmin.from('profiles').update({ handle_auto: false }).eq('id', userId);
  }
  return c.json({ ok: true });
});

/**
 * DELETE /me — permanently delete the signed-in user's account. Removes the
 * auth user, which cascades to their profile and all content (recipes, follows,
 * comments, etc.) via ON DELETE CASCADE. Irreversible; the client confirms first.
 */
me.delete('/', async (c) => {
  const userId = c.get('userId')!;
  // Decrement other users' denormalized counters (followers, like/comment/save
  // counts, total_likes) for this account's rows BEFORE the cascade removes them —
  // otherwise those counters stay permanently inflated.
  await supabaseAdmin.rpc('cleanup_user_counters', { uid: userId });
  const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (error) {
    console.error('account delete:', error.message);
    throw badRequest('Could not delete account');
  }
  return c.json({ ok: true });
});
