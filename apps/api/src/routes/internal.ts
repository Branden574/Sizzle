import { Hono } from 'hono';
import { supabaseAdmin } from '../lib/supabase';
import { env } from '../env';
import type { AppEnv } from '../types';

export const internal = new Hono<AppEnv>();

/**
 * GET /internal/publish-scheduled — Vercel Cron target (every minute). Flips any
 * scheduled recipe whose time has arrived to published. Vercel Cron sends
 * `Authorization: Bearer ${CRON_SECRET}`; we reject anything else when the secret
 * is configured. (In local dev with no secret set, it's open — fine locally.)
 */
internal.get('/publish-scheduled', async (c) => {
  if (env.CRON_SECRET) {
    const auth = c.req.header('authorization');
    if (auth !== `Bearer ${env.CRON_SECRET}`) return c.json({ error: 'unauthorized' }, 401);
  }
  const now = new Date().toISOString();
  const { data: due } = await supabaseAdmin
    .from('recipes')
    .select('id')
    .eq('status', 'scheduled')
    .lte('scheduled_at', now)
    .limit(200);
  const ids = (due ?? []).map((r) => r.id as string);
  if (ids.length) {
    await supabaseAdmin.from('recipes').update({ status: 'published', scheduled_at: null }).in('id', ids);
  }
  return c.json({ published: ids.length });
});
