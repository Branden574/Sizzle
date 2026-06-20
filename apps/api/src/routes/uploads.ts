import { Hono } from 'hono';
import type { DirectUploadTicket } from '@sizzle/shared';
import { requireAuth } from '../middleware/auth';
import { supabaseAdmin } from '../lib/supabase';
import { dbFail } from '../lib/errors';
import { getStreamProvider } from '../services/stream';
import type { AppEnv } from '../types';

export const uploads = new Hono<AppEnv>();

/**
 * POST /uploads/video — register a pending video asset and return a direct
 * upload ticket. The client uploads bytes straight to the provider; the asset
 * becomes "ready" via webhook (Cloudflare) or immediately (mock).
 */
uploads.post('/video', requireAuth, async (c) => {
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
  // TODO(phase5): verify webhook signature via CLOUDFLARE_STREAM_WEBHOOK_SECRET.
  const body = (await c.req.json().catch(() => null)) as { uid?: string } | null;
  const uid = body?.uid;
  if (!uid) return c.json({ ok: false }, 400);

  const a = await getStreamProvider().getAsset(uid);
  await supabaseAdmin
    .from('video_assets')
    .update({ status: a.status, hls_url: a.hlsUrl, poster_url: a.posterUrl, duration_seconds: a.duration })
    .eq('provider_uid', uid);
  return c.json({ ok: true });
});
