import { createHmac, timingSafeEqual } from 'node:crypto';
import { Hono } from 'hono';
import { z } from 'zod';
import type { DirectUploadTicket } from '@sizzle/shared';
import { requireAuth } from '../middleware/auth';
import { supabaseAdmin } from '../lib/supabase';
import { badRequest, dbFail } from '../lib/errors';
import { cloudflareConfigured, env } from '../env';
import { getStreamProvider } from '../services/stream';
import { rateLimit } from '../middleware/rateLimit';
import type { AppEnv } from '../types';

export const uploads = new Hono<AppEnv>();

// Keep in sync with MAX_DURATION_SECONDS in @sizzle/shared (API imports only types).
const MAX_DURATION_SECONDS = 1800; // 30 minutes

const registerSchema = z.object({
  uploadedUrl: z.string().url().max(1000).optional(),
  posterUrl: z.string().url().max(1000).optional(),
  durationSeconds: z.number().int().min(0).max(MAX_DURATION_SECONDS).optional(),
});

/**
 * POST /uploads/video — register a video asset.
 *  - If the client already uploaded an MP4 to storage and passes `uploadedUrl`,
 *    the asset is created "ready" pointing at it (real upload path).
 *  - Otherwise it falls back to the stream provider (mock = instant sample HLS;
 *    Cloudflare = pending until the webhook fires) and returns a direct-upload ticket.
 */
uploads.post('/video', requireAuth, rateLimit({ windowMs: 60_000, max: 20, name: 'upload' }), async (c) => {
  const userId = c.get('userId')!;
  const body = registerSchema.safeParse(await c.req.json().catch(() => ({})));
  // The no-arg provider path sends an empty body (all fields optional → parses ok).
  // A populated-but-invalid body (e.g. duration over the 30-min cap) is rejected.
  if (!body.success) throw badRequest('Video exceeds the upload limits', body.error.flatten());
  const provided = body.data;

  // Real upload: client put the file in storage and gave us the public URL.
  if (provided.uploadedUrl) {
    // Only accept URLs that live under THIS project's Supabase Storage — the URL
    // is later served to every viewer, so a client must not be able to register
    // an arbitrary off-site link (phishing / serving attacker-controlled content).
    const storagePrefix = `${env.SUPABASE_URL.replace(/\/$/, '')}/storage/v1/object/`;
    const allowed = (u?: string) => !u || u.startsWith(storagePrefix);
    if (!allowed(provided.uploadedUrl) || !allowed(provided.posterUrl)) {
      throw badRequest('Video/poster URL must be a Supabase Storage URL for this project');
    }

    const { data: asset, error } = await supabaseAdmin
      .from('video_assets')
      .insert({
        owner_id: userId,
        provider: 'storage',
        status: 'ready',
        mp4_url: provided.uploadedUrl,
        poster_url: provided.posterUrl ?? null,
        duration_seconds: provided.durationSeconds ?? null,
      })
      .select('id')
      .single();
    if (error || !asset) throw dbFail(error?.message ?? 'Failed to register video');
    return c.json<DirectUploadTicket>({ videoAssetId: asset.id, uploadUrl: '', provider: 'storage' }, 201);
  }

  // Provider path (mock / Cloudflare).
  const provider = getStreamProvider();
  const { providerUid, uploadUrl } = await provider.createDirectUpload({ maxDurationSeconds: MAX_DURATION_SECONDS });
  const { data: asset, error } = await supabaseAdmin
    .from('video_assets')
    .insert({ owner_id: userId, provider: provider.name, provider_uid: providerUid, status: 'pending' })
    .select('id')
    .single();
  if (error || !asset) throw dbFail(error?.message ?? 'Failed to create video asset');

  if (provider.name === 'mock') {
    const a = await provider.getAsset(providerUid);
    await supabaseAdmin
      .from('video_assets')
      .update({ status: a.status, hls_url: a.hlsUrl, poster_url: a.posterUrl, duration_seconds: a.duration })
      .eq('id', asset.id);
  }

  return c.json<DirectUploadTicket>({ videoAssetId: asset.id, uploadUrl, provider: provider.name }, 201);
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
