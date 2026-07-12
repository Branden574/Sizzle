import { Hono } from 'hono';
import { z } from 'zod';
import { optionalAuth, requireAuth, requireNotBanned } from '../middleware/auth';
import { supabaseAdmin } from '../lib/supabase';
import { canViewCookContent } from '../mappers';
import { badRequest, dbFail } from '../lib/errors';
import { assertUuid } from '../lib/validate';
import { cloudflareConfigured } from '../env';
import type { AppEnv } from '../types';

export const live = new Hono<AppEnv>();

// Mock playback: a sample HLS stream (same mock pattern as the video provider).
// Real Cloudflare Stream Live Inputs return a per-session playback URL behind keys.
const MOCK_PLAYBACK = 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8';

const startSchema = z.object({ title: z.string().trim().min(1).max(120) });

/** POST /live/start — go live. One session per creator; returns the existing one if
 *  already live. Mock playback URL until Cloudflare Stream Live is configured. */
live.post('/start', requireAuth, requireNotBanned, async (c) => {
  const userId = c.get('userId')!;
  const body = startSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) throw badRequest('Title required');
  const { data: existing } = await supabaseAdmin.from('live_sessions').select('id, playback_url').eq('creator_id', userId).eq('status', 'live').maybeSingle();
  if (existing) return c.json({ id: existing.id, playbackUrl: existing.playback_url, provider: cloudflareConfigured ? 'cloudflare' : 'mock' });
  const { data, error } = await supabaseAdmin
    .from('live_sessions')
    .insert({ creator_id: userId, title: body.data.title, status: 'live', playback_url: MOCK_PLAYBACK })
    .select('id, playback_url').single();
  if (error || !data) throw dbFail(error?.message ?? 'Could not start the session');
  await supabaseAdmin.from('profiles').update({ is_cook: true }).eq('id', userId);
  return c.json({ id: data.id, playbackUrl: data.playback_url, provider: cloudflareConfigured ? 'cloudflare' : 'mock' }, 201);
});

/** POST /live/end — end your current live session. */
live.post('/end', requireAuth, async (c) => {
  const userId = c.get('userId')!;
  await supabaseAdmin.from('live_sessions').update({ status: 'ended', ended_at: new Date().toISOString() }).eq('creator_id', userId).eq('status', 'live');
  return c.json({ ok: true });
});

/** GET /live/:cookId — a creator's current live session, or null. Private
 *  creators' sessions (playback URL + title) are visible to followers only. */
live.get('/:cookId', optionalAuth, async (c) => {
  const cookId = assertUuid(c.req.param('cookId'), 'cook');
  if (!(await canViewCookContent(supabaseAdmin, cookId, c.get('userId')))) return c.json(null);
  const { data } = await supabaseAdmin.from('live_sessions').select('id, title, playback_url, viewer_count, started_at').eq('creator_id', cookId).eq('status', 'live').maybeSingle();
  if (!data) return c.json(null);
  return c.json({ id: data.id, title: data.title, playbackUrl: data.playback_url, viewers: data.viewer_count, startedAt: data.started_at });
});

/** GET /live — everyone currently live (a 'Live now' rail). Private creators
 *  only surface to their accepted followers. */
live.get('/', optionalAuth, async (c) => {
  const viewerId = c.get('userId');
  const { data } = await supabaseAdmin.from('live_sessions').select('id, creator_id, title, started_at').eq('status', 'live').order('started_at', { ascending: false }).limit(50);
  const rows = data ?? [];
  if (!rows.length) return c.json([]);
  // Drop private creators the viewer doesn't follow. One query for the private
  // set + one for the viewer's follows, then filter in memory.
  const creatorIds = [...new Set(rows.map((r) => r.creator_id as string))];
  const { data: privs } = await supabaseAdmin.from('profiles').select('id').eq('private', true).in('id', creatorIds);
  const privateSet = new Set((privs ?? []).map((p) => p.id as string));
  if (privateSet.size) {
    let followed = new Set<string>();
    if (viewerId) {
      const { data: f } = await supabaseAdmin.from('follows').select('cook_id').eq('follower_id', viewerId).in('cook_id', [...privateSet]);
      followed = new Set((f ?? []).map((x) => x.cook_id as string));
    }
    return c.json(rows.filter((r) => !privateSet.has(r.creator_id as string) || r.creator_id === viewerId || followed.has(r.creator_id as string)));
  }
  return c.json(rows);
});
