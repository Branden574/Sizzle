import { supabaseAdmin } from '../lib/supabase';
import { getStreamProvider, type AssetStatus } from './stream';
import { moderateImages } from './moderation';

/**
 * Pull a provider (Cloudflare Stream) asset's latest transcode state into our DB,
 * and on the ready-hop vision-moderate its thumbnail — PLAYABILITY IS GATED on
 * that check. A flagged thumbnail errors the asset and pulls any recipe built on
 * it (auto_hidden → drops out of every surface); nothing is viewable before this
 * hop because hls_url is null while processing.
 *
 * Idempotent and safe to call from ANY driver — the composer's foreground poll,
 * the every-minute finalize cron, or the Cloudflare webhook. Once an asset reaches
 * ready/error the callers stop invoking it. Posting no longer blocks on
 * transcoding, so this is the single source of truth that a video eventually
 * becomes playable + moderated even if the client that posted it went away.
 *
 * @param assetId    our `video_assets.id`
 * @param providerUid the Cloudflare Stream UID (`video_assets.provider_uid`)
 */
export async function finalizeProviderAsset(assetId: string, providerUid: string): Promise<AssetStatus> {
  const a = await getStreamProvider().getAsset(providerUid);

  if (a.status === 'ready' && a.posterUrl) {
    const mod = await moderateImages([a.posterUrl]);
    if (!mod.ok) {
      // Do NOT persist the flagged thumbnail URL — null it so the DB never holds a
      // pointer to known-unsafe content.
      await supabaseAdmin
        .from('video_assets')
        .update({ status: 'error', poster_url: null, hls_url: null, duration_seconds: a.duration })
        .eq('id', assetId);
      await supabaseAdmin
        .from('recipes')
        .update({ status: 'removed', auto_hidden: true })
        .eq('video_asset_id', assetId);
      return { ...a, status: 'error', hlsUrl: null };
    }
  }

  await supabaseAdmin
    .from('video_assets')
    .update({ status: a.status, hls_url: a.hlsUrl, poster_url: a.posterUrl, duration_seconds: a.duration })
    .eq('id', assetId);
  return a;
}
