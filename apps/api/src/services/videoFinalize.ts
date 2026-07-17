import { supabaseAdmin } from '../lib/supabase';
import { getStreamProvider, AssetNotFoundError, type AssetStatus } from './stream';
import { moderateImages } from './moderation';

/** Extract the `videos`-bucket object path from a public Storage URL (null for
 *  non-Storage URLs like a Cloudflare thumbnail). */
function storagePathFromPublicUrl(url: string): string | null {
  const marker = '/storage/v1/object/public/videos/';
  const i = url.indexOf(marker);
  return i === -1 ? null : decodeURIComponent(url.slice(i + marker.length));
}

/**
 * Best-effort media teardown for a video asset — deletes the Cloudflare Stream
 * asset AND the raw Supabase Storage objects (source clip, mp4, poster). Called
 * on recipe deletion + account purge so deleted content stops being playable and
 * storage cost stops compounding. Never throws (deletion must not block the
 * user-facing delete); failures are logged for a reconciliation sweep.
 */
export async function deleteAssetMedia(asset: {
  provider?: string | null;
  provider_uid?: string | null;
  source_url?: string | null;
  mp4_url?: string | null;
  poster_url?: string | null;
}): Promise<void> {
  if (asset.provider === 'cloudflare' && asset.provider_uid) {
    try {
      await getStreamProvider().deleteAsset?.(asset.provider_uid);
    } catch (err) {
      console.error('[delete] Cloudflare asset delete failed', { uid: asset.provider_uid, err: String(err) });
    }
  }
  const paths = [asset.source_url, asset.mp4_url, asset.poster_url]
    .filter((u): u is string => !!u)
    .map(storagePathFromPublicUrl)
    .filter((p): p is string => !!p);
  if (paths.length) {
    try {
      await supabaseAdmin.storage.from('videos').remove([...new Set(paths)]);
    } catch (err) {
      console.error('[delete] storage object remove failed', { paths, err: String(err) });
    }
  }
}

/**
 * Pull a provider (Cloudflare Stream) asset's latest transcode state into our DB,
 * and on the ready-hop vision-moderate its thumbnail — PLAYABILITY IS GATED on
 * that check. A flagged thumbnail errors the asset and pulls any recipe built on
 * it (auto_hidden → drops out of every surface); nothing is viewable before this
 * hop because hls_url is null while processing.
 *
 * Idempotent and safe to call from ANY driver — the composer's foreground poll,
 * the every-minute finalize cron, or the Cloudflare webhook.
 *
 * Hardening (2026-07-16 audit), all in this one function:
 *  - FAIL CLOSED: if the thumbnail isn't available yet, or the moderation provider
 *    can't be reached, we DEFER (leave the asset processing) instead of publishing
 *    an unmoderated frame. Cloudflare thumbnails 404 for a few seconds right after
 *    ready — exactly the window the old code failed open in. A bounded attempt
 *    counter stops a sustained moderation outage from wedging a post forever.
 *  - NON-REGRESSIVE: a transient Cloudflare API error (429/5xx) no longer masquerades
 *    as 'processing' and clobbers a live asset's poster/hls back to null. getAsset
 *    throws on transient failures; we catch and leave the row untouched to retry.
 *  - RE-INGEST: an asset whose /copy ingest failed (provider_uid null, source_url
 *    set) is retried here rather than left serving raw HEVC.
 *  - POLL-COLLAPSE: concurrent client polls + the cron are de-duped against the
 *    Cloudflare account-wide API budget via a short freshness floor on last_polled_at.
 *
 * @param assetId    our `video_assets.id`
 * @param providerUid the Cloudflare Stream UID (`video_assets.provider_uid`) — may be
 *                    empty when a /copy ingest failed and we must re-ingest.
 */

// Skip the live Cloudflare API call when the row was refreshed this recently —
// collapses concurrent client polls (2-5s cadence) + the every-minute cron down
// to at most one provider call per asset per window.
const POLL_FRESHNESS_MS = 8_000;
// Defer publishing at most this many moderation-provider failures before failing
// open (publish + log loudly). At ~1 attempt / POLL_FRESHNESS_MS this is a few
// minutes — long enough to cover the thumbnail-404 window, short enough that a
// provider outage doesn't wedge every post until the 2h abandon sweep.
const MODERATION_MAX_ATTEMPTS = 20;

interface AssetRow {
  status: AssetStatus['status'];
  poster_url: string | null;
  hls_url: string | null;
  duration_seconds: number | null;
  provider_uid: string | null;
  source_url: string | null;
  moderation_attempts: number | null;
  last_polled_at: string | null;
}

function rowToStatus(a: AssetRow): AssetStatus {
  return {
    status: a.status,
    hlsUrl: a.hls_url,
    posterUrl: a.poster_url,
    duration: a.duration_seconds,
  };
}

export async function finalizeProviderAsset(assetId: string, providerUid: string): Promise<AssetStatus> {
  const { data: current } = await supabaseAdmin
    .from('video_assets')
    .select('status, poster_url, hls_url, duration_seconds, provider_uid, source_url, moderation_attempts, last_polled_at')
    .eq('id', assetId)
    .maybeSingle<AssetRow>();

  if (!current) return { status: 'error', hlsUrl: null, posterUrl: null, duration: null };

  // Idempotency: once terminal, never re-poll or rewrite. Guards the webhook path
  // and races between the client poll and the cron from clobbering a finished asset.
  if (current.status === 'ready' || current.status === 'error') return rowToStatus(current);

  // Poll-collapse: if we refreshed very recently, trust the DB and skip the CF call.
  if (current.last_polled_at && Date.now() - new Date(current.last_polled_at).getTime() < POLL_FRESHNESS_MS) {
    return rowToStatus(current);
  }

  const provider = getStreamProvider();

  // Re-ingest path: a prior /copy failed (no provider_uid) but we kept the source.
  let uid = providerUid || current.provider_uid || '';
  if (!uid && current.source_url && provider.ingestFromUrl) {
    try {
      const { providerUid: newUid } = await provider.ingestFromUrl(current.source_url);
      uid = newUid;
      await supabaseAdmin
        .from('video_assets')
        .update({ provider_uid: newUid, status: 'processing', last_polled_at: new Date().toISOString() })
        .eq('id', assetId);
      return { status: 'processing', hlsUrl: null, posterUrl: current.poster_url, duration: current.duration_seconds };
    } catch (err) {
      console.error('[finalize] re-ingest failed', { assetId, sourceUrl: current.source_url, err: String(err) });
      // Leave the row as-is (still no provider_uid) for the next tick to retry.
      await supabaseAdmin.from('video_assets').update({ last_polled_at: new Date().toISOString() }).eq('id', assetId);
      return rowToStatus(current);
    }
  }
  if (!uid) return rowToStatus(current); // nothing to poll and nothing to re-ingest

  // Fetch the live provider state. getAsset THROWS on transient failures now.
  let a: AssetStatus;
  try {
    a = await provider.getAsset(uid);
  } catch (err) {
    if (err instanceof AssetNotFoundError) {
      // Definitive: the Cloudflare asset is gone. Mark errored so the pipeline stops.
      console.error('[finalize] provider asset not found — marking error', { assetId, uid });
      await supabaseAdmin
        .from('video_assets')
        .update({ status: 'error', last_polled_at: new Date().toISOString() })
        .eq('id', assetId);
      return { status: 'error', hlsUrl: null, posterUrl: current.poster_url, duration: current.duration_seconds };
    }
    // Transient (429/5xx/timeout): do NOT write status/urls — defer to the next tick.
    console.error('[finalize] getAsset transient failure — deferring', { assetId, uid, err: String(err) });
    await supabaseAdmin.from('video_assets').update({ last_polled_at: new Date().toISOString() }).eq('id', assetId);
    return { status: 'processing', hlsUrl: current.hls_url, posterUrl: current.poster_url, duration: current.duration_seconds };
  }

  const nowIso = new Date().toISOString();

  if (a.status === 'ready') {
    // Fail CLOSED: can't moderate without a thumbnail. Right after ready the CF
    // thumbnail URL 404s for a few seconds — defer, don't publish unmoderated.
    if (!a.posterUrl) {
      await supabaseAdmin.from('video_assets').update({ last_polled_at: nowIso, duration_seconds: a.duration }).eq('id', assetId);
      return { ...a, status: 'processing' };
    }

    const mod = await moderateImages([a.posterUrl]);

    if (mod.providerError) {
      const attempts = (current.moderation_attempts ?? 0) + 1;
      await supabaseAdmin
        .from('video_assets')
        .update({ moderation_attempts: attempts, last_polled_at: nowIso, duration_seconds: a.duration })
        .eq('id', assetId);
      if (attempts < MODERATION_MAX_ATTEMPTS) {
        // Defer — the thumbnail may still be 404ing, or the provider is briefly down.
        return { ...a, status: 'processing' };
      }
      // Bounded fallback: after many failures, publish rather than wedge the post,
      // but log LOUDLY (Sentry, once configured) so it can be reviewed. This only
      // fires during a sustained moderation-provider outage.
      console.error('[finalize] image moderation unreachable after max attempts — publishing UNMODERATED, needs review', { assetId, uid, attempts });
      await supabaseAdmin
        .from('video_assets')
        .update({ status: 'ready', hls_url: a.hlsUrl, poster_url: a.posterUrl, duration_seconds: a.duration, last_polled_at: nowIso })
        .eq('id', assetId);
      return a;
    }

    if (!mod.ok) {
      // Flagged: never persist the unsafe thumbnail; error the asset + pull the recipe.
      await supabaseAdmin
        .from('video_assets')
        .update({ status: 'error', poster_url: null, hls_url: null, duration_seconds: a.duration, last_polled_at: nowIso })
        .eq('id', assetId);
      await supabaseAdmin.from('recipes').update({ status: 'removed', auto_hidden: true }).eq('video_asset_id', assetId);
      return { ...a, status: 'error', hlsUrl: null, posterUrl: null };
    }

    // Clean → publish. This is the only place we write the CF poster, so we never
    // overwrite the client's upload poster with a not-yet-live CF thumbnail.
    await supabaseAdmin
      .from('video_assets')
      .update({ status: 'ready', hls_url: a.hlsUrl, poster_url: a.posterUrl, duration_seconds: a.duration, last_polled_at: nowIso })
      .eq('id', assetId);
    return a;
  }

  if (a.status === 'error') {
    await supabaseAdmin
      .from('video_assets')
      .update({ status: 'error', hls_url: null, poster_url: null, duration_seconds: a.duration, last_polled_at: nowIso })
      .eq('id', assetId);
    return a;
  }

  // Still uploading/processing — persist status + duration + poll time, but NEVER
  // null out a poster/hls we may already hold (the client set a poster at upload).
  await supabaseAdmin
    .from('video_assets')
    .update({ status: a.status, duration_seconds: a.duration, last_polled_at: nowIso })
    .eq('id', assetId);
  return { status: a.status, hlsUrl: current.hls_url, posterUrl: current.poster_url, duration: a.duration };
}
