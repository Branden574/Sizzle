import { Hono } from 'hono';
import { z } from 'zod';
import type { CollectionDTO, FeedResponse, MeProfile, NotificationDTO } from '@sizzle/shared';
import { requireAuth } from '../middleware/auth';
import { supabaseAdmin, userClient } from '../lib/supabase';
import { badRequest, notFound } from '../lib/errors';
import { assertUuid } from '../lib/validate';
import { initialsOf, relativeTime } from '../lib/format';
import { buildCards, cookSummary, profileLinks, type ProfileRow, type RecipeRow } from '../mappers';
import { normalizeLink, PROFILE_LINK_KEYS } from '../services/links';
import type { AppEnv } from '../types';

export const me = new Hono<AppEnv>();

me.use('*', requireAuth);

/** GET /me — the signed-in user's profile + live counts. */
me.get('/', async (c) => {
  const userId = c.get('userId')!;
  const db = userClient(c.get('accessToken')!);

  const { data: profile, error } = await db.from('profiles').select('*').eq('id', userId).single();
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

  const items: NotificationDTO[] = list
    .filter((n) => actorMap.has(n.actor_id))
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

/** POST /me/notifications/read — mark all as read. */
me.post('/notifications/read', async (c) => {
  const userId = c.get('userId')!;
  await supabaseAdmin.from('notifications').update({ read: true }).eq('user_id', userId).eq('read', false);
  return c.json({ ok: true });
});

const linkOrNull = z.string().trim().max(300).nullable().optional();
const patchSchema = z.object({
  displayName: z.string().trim().min(1).max(60).optional(),
  bio: z.string().max(300).optional(),
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

  const updates: Record<string, unknown> = {};
  if (body.data.displayName !== undefined) updates.display_name = body.data.displayName;
  if (body.data.bio !== undefined) updates.bio = body.data.bio;
  // Keep the case the user typed (strip @ + invalid chars); uniqueness is enforced
  // case-insensitively by the lower(handle) unique index.
  if (body.data.handle !== undefined) updates.handle = body.data.handle.replace(/^@/, '').replace(/[^A-Za-z0-9_]/g, '');
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
  return c.json({ ok: true });
});

/**
 * DELETE /me — permanently delete the signed-in user's account. Removes the
 * auth user, which cascades to their profile and all content (recipes, follows,
 * comments, etc.) via ON DELETE CASCADE. Irreversible; the client confirms first.
 */
me.delete('/', async (c) => {
  const userId = c.get('userId')!;
  const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (error) {
    console.error('account delete:', error.message);
    throw badRequest('Could not delete account');
  }
  return c.json({ ok: true });
});
