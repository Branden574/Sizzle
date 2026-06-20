import { createHmac, timingSafeEqual } from 'node:crypto';
import { Hono } from 'hono';
import type { DirectUploadTicket } from '@sizzle/shared';
import { requireAuth } from '../middleware/auth';
import { supabaseAdmin } from '../lib/supabase';
import { dbFail } from '../lib/errors';
import { cloudflareConfigured, env } from '../env';
import { getStreamProvider } from '../services/stream';
import { rateLimit } from '../middleware/rateLimit';
import type { AppEnv } from '../types';

export const uploads = new Hono<AppEnv>();

/**
 * POST /uploads/video — register a pending video asset and return a direct
 * upload ticket. The client uploads bytes straight to the provider; the asset
 * becomes "ready" via webhook (Cloudflare) or immediately (mock).
 */
uploads.post('/video', requireAuth, rateLimit({ windowMs: 60_000, max: 20, name: 'upload' }), async (c) => {
  const userId = c.get('userId')!;
  const provider = getStreamProvider();
  const { providerUid, uploadUrl } = await provider.createDirectUpload({ maxDurationSeconds: 120 });

  const { data: asset, error } = await supabaseAdmin
    .from('video_assets')
    .insert({ owner_id: userId, provider: provider.name, provider_uid: providerUid, status: 'pending' })
    .select('id')
    .single();
  if (error || !asset) throw dbFail(error?.message ?? 'Failed to create video asset');

  // The mock provider is "ready" instantly — reflect that so an uploaded recipe
  // is immediately playable in the feed.
  if (provider.name === 'mock') {
    const a = await provider.getAsset(providerUid);
    await supabaseAdmin
      .from('video_assets')
      .update({ status: a.status, hls_url: a.hlsUrl, poster_url: a.posterUrl, duration_seconds: a.duration })
      .eq('id', asset.id);
  }

  const ticket: DirectUploadTicket = { videoAssetId: asset.id, uploadUrl, provider: provider.name };
  return c.json(ticket, 201);
});

/** Cloudflare Stream webhook → mark the asset ready with hls/poster. */
uploads.post('/webhook/cloudflare-stream', async (c) => {
  const secret = env.CLOUDFLARE_STREAM_WEBHOOK_SECRET;
  // Only enabled with a real Stream config + signing secret; nothing legit
  // calls this otherwise (the mock provider is ready instantly).
  if (!cloudflareConfigured || !secret) {
    return c.json({ error: { code: 'forbidden', message: 'Webhook not enabled' } }, 403);
  }

  const raw = await c.req.text();
  // Cloudflare signs with header "Webhook-Signature: time=<t>,sig1=<hmac>".
  const header = c.req.header('webhook-signature') ?? '';
  const parts = Object.fromEntries(header.split(',').map((p) => p.split('=') as [string, string]));
  const expected = createHmac('sha256', secret).update(`${parts.time ?? ''}.${raw}`).digest('hex');
  const provided = parts.sig1 ?? '';
  const valid =
    provided.length === expected.length && timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
  if (!valid) return c.json({ error: { code: 'unauthorized', message: 'Bad signature' } }, 401);

  const body = JSON.parse(raw) as { uid?: string };
  const uid = body.uid;
  if (!uid || !/^[A-Za-z0-9_-]{1,128}$/.test(uid)) return c.json({ ok: false }, 400);

  const a = await getStreamProvider().getAsset(uid);
  await supabaseAdmin
    .from('video_assets')
    .update({ status: a.status, hls_url: a.hlsUrl, poster_url: a.posterUrl, duration_seconds: a.duration })
    .eq('provider_uid', uid);
  return c.json({ ok: true });
});
