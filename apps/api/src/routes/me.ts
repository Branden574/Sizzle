import { Hono } from 'hono';
import { z } from 'zod';
import type { FeedResponse, MeProfile, NotificationDTO } from '@sizzle/shared';
import { requireAuth } from '../middleware/auth';
import { supabaseAdmin, userClient } from '../lib/supabase';
import { badRequest, notFound } from '../lib/errors';
import { initialsOf, relativeTime } from '../lib/format';
import { buildCards, cookSummary, type ProfileRow, type RecipeRow } from '../mappers';
import type { AppEnv } from '../types';

export const me = new Hono<AppEnv>();

me.use('*', requireAuth);

/** GET /me — the signed-in user's profile + live counts. */
me.get('/', async (c) => {
  const userId = c.get('userId')!;
  const db = userClient(c.get('accessToken')!);

  const { data: profile, error } = await db.from('profiles').select('*').eq('id', userId).single();
  if (error || !profile) throw notFound('Profile not found');

  const [following, followers, saved] = await Promise.all([
    db.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', userId),
    db.from('follows').select('*', { count: 'exact', head: true }).eq('cook_id', userId),
    db.from('saves').select('*', { count: 'exact', head: true }).eq('user_id', userId),
  ]);

  const dto: MeProfile = {
    id: profile.id,
    name: profile.display_name,
    handle: profile.handle,
    init: initialsOf(profile.display_name ?? profile.handle ?? '?'),
    avatarColor: profile.avatar_color,
    avatarUrl: profile.avatar_url,
    bio: profile.bio ?? '',
    isCook: profile.is_cook,
    counts: { following: following.count ?? 0, followers: followers.count ?? 0, saved: saved.count ?? 0 },
    tastes: profile.tastes ?? [],
  };
  return c.json(dto);
});

const tastesSchema = z.object({ tastes: z.array(z.string()).max(64) });

/** POST /me/tastes — save onboarding taste preferences. */
me.post('/tastes', async (c) => {
  const userId = c.get('userId')!;
  const body = tastesSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) throw badRequest('Expected { tastes: string[] }', body.error.flatten());

  const db = userClient(c.get('accessToken')!);
  const { error } = await db.from('profiles').update({ tastes: body.data.tastes }).eq('id', userId);
  if (error) throw badRequest(error.message);
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

const patchSchema = z.object({
  displayName: z.string().trim().min(1).max(60).optional(),
  bio: z.string().max(300).optional(),
  handle: z.string().trim().min(2).max(30).optional(),
});

/** PATCH /me — edit display name / handle / bio. */
me.patch('/', async (c) => {
  const userId = c.get('userId')!;
  const body = patchSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) throw badRequest('Invalid profile update', body.error.flatten());

  const updates: Record<string, unknown> = {};
  if (body.data.displayName !== undefined) updates.display_name = body.data.displayName;
  if (body.data.bio !== undefined) updates.bio = body.data.bio;
  if (body.data.handle !== undefined) updates.handle = body.data.handle.replace(/^@/, '').toLowerCase();
  if (Object.keys(updates).length === 0) return c.json({ ok: true });

  const db = userClient(c.get('accessToken')!);
  const { error } = await db.from('profiles').update(updates).eq('id', userId);
  if (error) throw badRequest(/duplicate|unique/i.test(error.message) ? 'That handle is taken' : error.message);
  return c.json({ ok: true });
});
