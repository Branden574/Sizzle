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
import { moderateImages } from '../services/moderation';
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
  // Idempotency key: one per picked clip on the client. A retried register (lost
  // response, app resume) returns the SAME asset instead of minting a duplicate
  // (which would double-transcode and could publish a duplicate post).
  clientUploadId: z.string().uuid().optional(),
});

/**
 * POST /uploads/video — register a video asset.
 *  - If the client already uploaded an MP4 to storage and passes `uploadedUrl`,
 *    the asset is created "ready" pointing at it (real upload path).
 *  - Otherwise it falls back to the stream provider (mock = instant sample HLS;
 *    Cloudflare = pending until the webhook fires) and returns a direct-upload ticket.
 */
uploads.post(
  '/video',
  requireAuth,
  rateLimit({ windowMs: 60_000, max: 20, name: 'upload' }),
  // Daily quota: caps abandoned-slot / storage-abuse (one account could otherwise
  // mint tens of thousands of Stream slots a day against the prepaid allotment).
  rateLimit({ windowMs: 86_400_000, max: 50, name: 'upload-daily' }),
  async (c) => {
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

    // IDEMPOTENT RESUME: a register retry for the same picked clip returns the
    // asset the first call created — no duplicate row, no second /copy transcode.
    if (provided.clientUploadId) {
      const { data: existing } = await supabaseAdmin
        .from('video_assets')
        .select('id, provider, poster_url, duration_seconds')
        .eq('owner_id', userId)
        .eq('client_upload_id', provided.clientUploadId)
        .maybeSingle();
      if (existing) {
        // Backfill fields the FIRST attempt was missing (e.g. its poster upload
        // failed but the retry's succeeded) — otherwise the retried poster is
        // silently dropped and the post ships without its chosen cover.
        const patch: Record<string, unknown> = {};
        if (provided.posterUrl && !existing.poster_url) patch.poster_url = provided.posterUrl;
        if (provided.durationSeconds && !existing.duration_seconds) patch.duration_seconds = provided.durationSeconds;
        if (Object.keys(patch).length) {
          await supabaseAdmin.from('video_assets').update(patch).eq('id', existing.id as string);
        }
        return c.json<DirectUploadTicket>(
          { videoAssetId: existing.id as string, uploadUrl: '', provider: existing.provider as string, resumed: true },
          200,
        );
      }
    }

    // When Cloudflare is configured, relay the uploaded clip into Stream for
    // transcoding — iOS records HEVC, which won't play on Android/older browsers,
    // and Cloudflare normalizes it to H.264/HLS that plays everywhere. The client
    // uploads to Supabase Storage (which works from the native WKWebView, unlike
    // the direct Stream upload), then we pull it in here. The finalize cron drives
    // the asset to ready. Poster stays as the client's JPEG (cross-platform) until
    // Cloudflare's thumbnail replaces it on the ready-hop. mp4_url is left NULL so
    // the raw HEVC is never served to an incompatible client while transcoding.
    const streamProvider = getStreamProvider();
    if (cloudflareConfigured && streamProvider.ingestFromUrl) {
      // Always keep the source URL so the finalize cron can RE-INGEST if the copy
      // fails now (or fails to finish later) — instead of publishing raw HEVC that
      // black-cards on Android/desktop AND skips thumbnail moderation entirely.
      let providerUid: string | null = null;
      try {
        ({ providerUid } = await streamProvider.ingestFromUrl(provided.uploadedUrl));
      } catch (err) {
        console.error('[uploads] Cloudflare /copy failed — will re-ingest from source', {
          userId, uploadedUrl: provided.uploadedUrl, err: String(err),
        });
      }
      const { data: asset, error } = await supabaseAdmin
        .from('video_assets')
        .insert({
          owner_id: userId,
          provider: 'cloudflare',
          provider_uid: providerUid, // null when copy failed → cron re-ingests from source_url
          status: 'pending',
          poster_url: provided.posterUrl ?? null,
          duration_seconds: provided.durationSeconds ?? null,
          source_url: provided.uploadedUrl,
          client_upload_id: provided.clientUploadId ?? null,
        })
        .select('id')
        .single();
      if (!error && asset) {
        return c.json<DirectUploadTicket>({ videoAssetId: asset.id, uploadUrl: '', provider: 'cloudflare' }, 201);
      }
      // ANY failed insert abandons this request's just-/copy'd Cloudflare asset:
      // no row references it, so orphan GC can never reach it. Queue it for
      // teardown FIRST or the duplicate transcode is stored and billed forever.
      if (providerUid) {
        await supabaseAdmin.from('pending_media_deletions')
          .insert({ provider: 'cloudflare', provider_uid: providerUid, reason: 'register_insert_failed' });
      }
      // Unique-violation = a concurrent retry won the insert race — return ITS asset
      // (idempotent), don't fall through and mint a duplicate storage-provider row.
      if (error?.code === '23505' && provided.clientUploadId) {
        const { data: existing } = await supabaseAdmin
          .from('video_assets')
          .select('id, provider')
          .eq('owner_id', userId)
          .eq('client_upload_id', provided.clientUploadId)
          .maybeSingle();
        if (existing) {
          return c.json<DirectUploadTicket>(
            { videoAssetId: existing.id as string, uploadUrl: '', provider: existing.provider as string, resumed: true },
            200,
          );
        }
      }
      console.error('[uploads] video_asset insert failed after copy', { userId, err: error?.message });
      // Fall through to a raw-storage asset only if we couldn't even record the row.
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
        source_url: provided.uploadedUrl,
        client_upload_id: provided.clientUploadId ?? null,
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

// Sanity ceiling on the declared upload size (Cloudflare enforces the real limit
// by DURATION via maxDurationSeconds; this just rejects absurd values). 20 GiB
// comfortably covers a 30-min 4K clip.
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024 * 1024;

const tusSchema = z.object({
  uploadLength: z.number().int().positive().max(MAX_UPLOAD_BYTES),
  durationSeconds: z.number().int().min(0).max(MAX_DURATION_SECONDS).optional(),
  posterUrl: z.string().url().max(1000).optional(),
  clientUploadId: z.string().uuid(),
});

/**
 * POST /uploads/tus — provision a one-time RESUMABLE (tus) upload URL so the
 * client streams the video DIRECTLY to Cloudflare (no Supabase relay, no 2 GiB
 * bucket cap, chunked + resumable, works from the WKWebView). Idempotent on
 * clientUploadId: a retried/double-tapped provision returns the SAME asset
 * instead of minting a second Cloudflare upload. Cloudflare caps the clip length
 * at MAX_DURATION_SECONDS (denial-of-wallet protection).
 */
uploads.post(
  '/tus',
  requireAuth,
  rateLimit({ windowMs: 60_000, max: 20, name: 'upload' }),
  rateLimit({ windowMs: 86_400_000, max: 50, name: 'upload-daily' }),
  async (c) => {
    const userId = c.get('userId')!;
    const body = tusSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) throw badRequest('Invalid upload request', body.error.flatten());
    const { uploadLength, durationSeconds, posterUrl, clientUploadId } = body.data;

    // The poster (small, uploaded to Supabase for the instant thumbnail) must live
    // in the caller's own folder — same anti-injection rule as /video.
    if (posterUrl) {
      const ownFolder = `${env.SUPABASE_URL.replace(/\/$/, '')}/storage/v1/object/public/videos/${userId}/`;
      if (!posterUrl.startsWith(ownFolder)) {
        throw badRequest('Poster URL must be in your own Supabase Storage folder for this project');
      }
    }

    // Idempotency: a repeated provision for the same (owner, clientUploadId)
    // returns the existing asset — the client resumes its persisted tus upload
    // rather than starting a second Cloudflare upload.
    const { data: existing } = await supabaseAdmin
      .from('video_assets')
      .select('id')
      .eq('owner_id', userId)
      .eq('client_upload_id', clientUploadId)
      .maybeSingle();
    if (existing) {
      return c.json<DirectUploadTicket>({ videoAssetId: existing.id as string, uploadUrl: '', provider: 'cloudflare-tus', resumed: true }, 200);
    }

    const provider = getStreamProvider();
    // Fall back to the storage-relay path when tus isn't available (mock/local dev,
    // or Cloudflare unconfigured) — the client handles both providers.
    if (!(cloudflareConfigured && provider.createTusUpload)) {
      return c.json<DirectUploadTicket>({ videoAssetId: '', uploadUrl: '', provider: 'storage' }, 200);
    }

    const { providerUid, uploadUrl } = await provider.createTusUpload({ uploadLength, maxDurationSeconds: MAX_DURATION_SECONDS });
    const { data: asset, error } = await supabaseAdmin
      .from('video_assets')
      .insert({
        owner_id: userId,
        provider: 'cloudflare',
        provider_uid: providerUid,
        status: 'pending',
        poster_url: posterUrl ?? null,
        duration_seconds: durationSeconds ?? null,
        client_upload_id: clientUploadId,
      })
      .select('id')
      .single();
    if (error || !asset) {
      console.error('[uploads] tus asset insert failed', { userId, err: error?.message });
      throw dbFail(error?.message ?? 'Failed to create video asset');
    }
    return c.json<DirectUploadTicket>({ videoAssetId: asset.id as string, uploadUrl, provider: 'cloudflare-tus' }, 201);
  },
);

const posterSchema = z.object({ posterUrl: z.string().url().max(1000) });

/**
 * POST /uploads/video/:id/poster — set the client-captured poster on an asset
 * AFTER provisioning. Poster capture runs in PARALLEL with the (long) tus upload
 * so it never blocks the transfer; when it's ready the client sets it here, giving
 * an INSTANT thumbnail without waiting for Cloudflare to transcode. Only applies
 * while the asset is still pre-ready — once ready, the moderated Cloudflare
 * thumbnail is authoritative. Owner-checked + moderated.
 */
uploads.post('/video/:id/poster', requireAuth, async (c) => {
  const id = assertUuid(c.req.param('id'), 'asset');
  const userId = c.get('userId')!;
  const body = posterSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) throw badRequest('Invalid poster URL');
  const posterUrl = body.data.posterUrl;
  const ownFolder = `${env.SUPABASE_URL.replace(/\/$/, '')}/storage/v1/object/public/videos/${userId}/`;
  if (!posterUrl.startsWith(ownFolder)) throw badRequest('Poster URL must be in your own Supabase Storage folder for this project');

  const { data: asset } = await supabaseAdmin
    .from('video_assets')
    .select('id, owner_id, status')
    .eq('id', id)
    .maybeSingle();
  if (!asset || asset.owner_id !== userId) throw notFound('Video not found');
  // Only set the client poster before the asset is ready; after that the
  // moderated Cloudflare thumbnail wins.
  if (!['pending', 'uploading', 'processing'].includes(asset.status as string)) return c.json({ ok: true, skipped: true });

  // Moderate the client poster — it's shown to every viewer.
  const mod = await moderateImages([posterUrl]);
  if (!mod.ok) throw badRequest(mod.reason ?? 'Poster failed moderation');

  await supabaseAdmin.from('video_assets').update({ poster_url: posterUrl }).eq('id', id);
  return c.json({ ok: true });
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
  // Replay protection: reject a signature whose timestamp is stale (or absent).
  // Without this, a single captured valid webhook can be replayed forever.
  const ts = Number(parts.time);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) {
    return c.json({ error: { code: 'unauthorized', message: 'Stale or missing signature timestamp' } }, 401);
  }
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
