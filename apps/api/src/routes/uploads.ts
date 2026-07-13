import { createHmac, timingSafeEqual } from 'node:crypto';
import { Hono } from 'hono';
import { z } from 'zod';
import type { DirectUploadTicket, VideoAssetStatus, VideoUploadConfig } from '@sizzle/shared';
import { requireAuth } from '../middleware/auth';
import { supabaseAdmin } from '../lib/supabase';
import { badRequest, dbFail, notFound } from '../lib/errors';
import { assertUuid } from '../lib/validate';
import { cloudflareConfigured, env } from '../env';
import { getStreamProvider } from '../services/stream';
import { finalizeProviderAsset } from '../services/videoFinalize';
import { rateLimit } from '../middleware/rateLimit';
import { generateCaptions } from '../services/transcribe';
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
    // Anchor to the caller's OWN folder (videos/<userId>/…), not just the project —
    // otherwise a user could register a URL pointing at someone else's upload.
    const ownFolder = `${env.SUPABASE_URL.replace(/\/$/, '')}/storage/v1/object/public/videos/${userId}/`;
    const allowed = (u?: string) => !u || u.startsWith(ownFolder);
    if (!allowed(provided.uploadedUrl) || !allowed(provided.posterUrl)) {
      throw badRequest('Video/poster URL must be in your own Supabase Storage folder for this project');
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

  // Route the webhook through the SAME finalizer as the poll/cron so the thumbnail
  // is moderated here too — otherwise enabling webhooks would silently bypass the
  // moderation gate and publish an unmoderated clip.
  const { data: asset } = await supabaseAdmin.from('video_assets').select('id').eq('provider_uid', uid).maybeSingle();
  if (asset) await finalizeProviderAsset(asset.id as string, uid);
  return c.json({ ok: true });
});

/**
 * GET /uploads/config — tells the client which upload flow to use: 'cloudflare'
 * (register-first, upload to the provider ticket) or 'storage' (upload to
 * Supabase, then register). Driven by the API's VIDEO_PROVIDER env.
 */
uploads.get('/config', requireAuth, (c) => {
  return c.json<VideoUploadConfig>({ provider: cloudflareConfigured ? 'cloudflare' : 'storage' });
});

/**
 * GET /uploads/video/:id/status — refresh + return a provider asset's processing
 * status. The client polls this after a Cloudflare upload until it's `ready`
 * (we skip webhooks, so this poll is the readiness signal).
 */
uploads.get('/video/:id/status', requireAuth, async (c) => {
  const id = assertUuid(c.req.param('id'), 'asset');
  const userId = c.get('userId')!;
  const { data: asset } = await supabaseAdmin
    .from('video_assets')
    .select('owner_id, provider_uid, status, hls_url, mp4_url, poster_url')
    .eq('id', id)
    .maybeSingle();
  if (!asset || asset.owner_id !== userId) throw notFound('Video not found');

  let status = asset.status as VideoAssetStatus['status'];
  let hlsUrl = asset.hls_url as string | null;
  let posterUrl = asset.poster_url as string | null;
  // Still processing → refresh from the provider + moderate the thumbnail on the
  // ready-hop (finalizeProviderAsset is the single source of truth, shared with the
  // finalize cron + webhook so a video ALWAYS becomes playable + moderated even if
  // the client that posted it went away before the transcode finished).
  if (asset.provider_uid && status !== 'ready' && status !== 'error') {
    const a = await finalizeProviderAsset(id, asset.provider_uid as string);
    status = a.status;
    hlsUrl = a.hlsUrl;
    posterUrl = a.posterUrl;
  }
  return c.json<VideoAssetStatus>({ status, hlsUrl, posterUrl, mp4Url: asset.mp4_url as string | null });
});

const extractSchema = z.object({ videoAssetId: z.string().uuid().optional() });

/** Verify the caller owns the asset when one is supplied (the mock path needs none). */
async function assertAssetOwner(userId: string, videoAssetId?: string): Promise<void> {
  if (!videoAssetId) return;
  const { data: asset } = await supabaseAdmin.from('video_assets').select('owner_id').eq('id', videoAssetId).maybeSingle();
  if (!asset || asset.owner_id !== userId) throw notFound('Video not found');
}


/** POST /uploads/captions — generate WebVTT captions for the clip (mock until keyed). */
uploads.post('/captions', requireAuth, rateLimit({ windowMs: 60_000, max: 10, name: 'captions' }), async (c) => {
  const userId = c.get('userId')!;
  const body = extractSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) throw badRequest('Invalid request');
  await assertAssetOwner(userId, body.data.videoAssetId);
  return c.json(await generateCaptions(body.data.videoAssetId ?? ''));
});
