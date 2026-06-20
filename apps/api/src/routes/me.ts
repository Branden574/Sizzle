import { Hono } from 'hono';
import { z } from 'zod';
import type { MeProfile } from '@sizzle/shared';
import { requireAuth } from '../middleware/auth';
import { userClient } from '../lib/supabase';
import { badRequest, notFound } from '../lib/errors';
import { initialsOf } from '../lib/format';
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
