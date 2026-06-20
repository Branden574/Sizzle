import { Hono } from 'hono';
import { z } from 'zod';
import type { FeedResponse, MeProfile } from '@sizzle/shared';
import { requireAuth } from '../middleware/auth';
import { supabaseAdmin, userClient } from '../lib/supabase';
import { badRequest, notFound } from '../lib/errors';
import { initialsOf } from '../lib/format';
import { buildCards, type RecipeRow } from '../mappers';
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
