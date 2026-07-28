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
 * Re-host a (public, already-moderated) Cloudflare thumbnail into OUR Storage so a
 * premium poster teaser never carries the Cloudflare video UID — the UID is what
 * let a non-purchaser reconstruct the HLS manifest and stream the paid video. Runs
 * only for premium videos with no usable client poster. Returns the public Storage
 * URL, or `fallback` (the client poster, or null) if the copy fails — NEVER the raw
 * Cloudflare URL, so a failure degrades to "no poster" rather than a UID leak.
 */
async function rehostPosterPublic(assetId: string, cfThumbUrl: string, fallback: string | null): Promise<string | null> {
  try {
    const res = await fetch(cfThumbUrl);
    if (!res.ok) throw new Error(`fetch thumb HTTP ${res.status}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    const path = `premium-posters/${assetId}.jpg`;
    // cacheControl: a week, not a year — this path is keyed by assetId (not timestamped),
    // so a re-finalize CAN overwrite it; weekly revalidation bounds staleness while still
    // killing the hourly teaser-poster blink.
    const { error } = await supabaseAdmin.storage
      .from('videos')
      .upload(path, bytes, { contentType: 'image/jpeg', upsert: true, cacheControl: '604800' });
    if (error) throw new Error(error.message);
    return supabaseAdmin.storage.from('videos').getPublicUrl(path).data.publicUrl;
  } catch (err) {
    console.error('[finalize] premium poster re-host failed — using fallback', { assetId, err: String(err) });
    return fallback;
  }
}

/**
 * Media teardown for a video asset — deletes the Cloudflare Stream asset AND the
 * raw Supabase Storage objects (source clip, mp4, poster). Never throws (a
 * user-facing delete must not block on it), but RETURNS whether every target was
 * actually removed — the deletion-queue drain relies on that to keep retrying
 * instead of dropping a queue row whose Cloudflare delete quietly failed (which
 * would leak a deleted user's video forever).
 */
export async function deleteAssetMedia(asset: {
  provider?: string | null;
  provider_uid?: string | null;
  source_url?: string | null;
  mp4_url?: string | null;
  poster_url?: string | null;
}): Promise<boolean> {
  let ok = true;
  if (asset.provider === 'cloudflare' && asset.provider_uid) {
    try {
      await getStreamProvider().deleteAsset?.(asset.provider_uid);
    } catch (err) {
      // A 404 means the asset is already gone — that IS success for teardown.
      if (err instanceof AssetNotFoundError) {
        /* already deleted */
      } else {
        console.error('[delete] Cloudflare asset delete failed', { uid: asset.provider_uid, err: String(err) });
        ok = false;
      }
    }
  }
  const paths = [asset.source_url, asset.mp4_url, asset.poster_url]
    .filter((u): u is string => !!u)
    .map(storagePathFromPublicUrl)
    .filter((p): p is string => !!p);
  if (paths.length) {
    try {
      // supabase-js returns {error} without throwing — check it, don't assume.
      const { error } = await supabaseAdmin.storage.from('videos').remove([...new Set(paths)]);
      if (error) {
        console.error('[delete] storage object remove failed', { paths, err: error.message });
        ok = false;
      }
    } catch (err) {
      console.error('[delete] storage object remove failed', { paths, err: String(err) });
      ok = false;
    }
  }
  return ok;
}

/**
 * Make a recipe's Cloudflare video match its premium state when a creator changes
 * pricing AFTER the video is already live (the edit path). Premium/subscribers-only
 * videos flip requireSignedURLs ON — and any Cloudflare-hosted poster (which leaks
 * the UID) is first re-hosted UID-free — so the paid video can't be grabbed; making
 * it free again flips protection OFF.
 *
 * Only touches a READY video: before `ready`, protection is applied by the finalize
 * ready-hop AFTER thumbnail moderation (which fetches the still-public thumbnail) —
 * signing it early would wedge moderation. Best-effort + logged; a failure must not
 * block the edit. Called from PATCH /recipes/:id/controls (create needs nothing:
 * the video finalizes after the price is set, and finalize reads it).
 */
export async function syncVideoProtection(videoAssetId: string | null, premium: boolean): Promise<void> {
  if (!videoAssetId) return;
  const { data: asset } = await supabaseAdmin
    .from('video_assets')
    .select('provider, provider_uid, poster_url, status, source_url, mp4_url')
    .eq('id', videoAssetId)
    .maybeSingle<{ provider: string | null; provider_uid: string | null; poster_url: string | null; status: string | null; source_url: string | null; mp4_url: string | null }>();
  if (!asset || asset.provider !== 'cloudflare' || !asset.provider_uid || asset.status !== 'ready') return;
  const provider = getStreamProvider();
  if (!provider.setRequireSignedURLs) return;
  // Replace a Cloudflare-hosted poster with a UID-free copy BEFORE signing (the
  // re-host fetch needs the thumbnail to still be public).
  if (premium && asset.poster_url && !storagePathFromPublicUrl(asset.poster_url)) {
    const rehosted = await rehostPosterPublic(videoAssetId, asset.poster_url, null);
    if (rehosted) await supabaseAdmin.from('video_assets').update({ poster_url: rehosted }).eq('id', videoAssetId);
  }
  // Drop the raw source / mp4 from the public bucket — an unprotected full-quality
  // copy of a now-paid video (mirrors the finalize premium cleanup; a video that was
  // finalized while free never had these removed).
  if (premium) {
    const paths = [asset.source_url, asset.mp4_url]
      .filter((u): u is string => !!u)
      .map(storagePathFromPublicUrl)
      .filter((p): p is string => !!p);
    if (paths.length) {
      const { error } = await supabaseAdmin.storage.from('videos').remove([...new Set(paths)]);
      if (error) console.error('[premium] premium source cleanup failed', { videoAssetId, err: error.message });
    }
  }
  try {
    await provider.setRequireSignedURLs(asset.provider_uid, premium);
  } catch (err) {
    console.error('[premium] failed to sync signed-URL protection', { videoAssetId, premium, err: String(err) });
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
// Hard cap on clip length (mirrors MAX_DURATION_SECONDS in @sizzle/shared). Cloudflare
// enforces this at ingest via maxDurationSeconds, but we re-check on the ready-hop
// as defense-in-depth against a provider that let a longer clip through.
const MAX_DURATION_SECONDS = 1800;

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
    // Over-duration reject (denial-of-wallet defense): never publish a clip longer
    // than the cap, and tear down its media so it stops costing storage.
    if (a.duration && a.duration > MAX_DURATION_SECONDS + 5) {
      console.error('[finalize] clip exceeds max duration — rejecting', { assetId, uid, duration: a.duration });
      await supabaseAdmin
        .from('video_assets')
        .update({ status: 'error', hls_url: null, poster_url: null, last_polled_at: nowIso })
        .eq('id', assetId);
      await supabaseAdmin.from('recipes').update({ status: 'removed', auto_hidden: true }).eq('video_asset_id', assetId);
      await deleteAssetMedia({ provider: 'cloudflare', provider_uid: uid });
      return { ...a, status: 'error', hlsUrl: null, posterUrl: null };
    }

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
    //
    // PREMIUM PROTECTION: a Cloudflare thumbnail URL embeds the video UID, and the
    // HLS manifest is trivially reconstructed from it — so surfacing that poster on
    // a locked card lets a non-purchaser stream the paid video. For a premium recipe
    // we publish a UID-free poster instead (the client's public teaser, else a
    // re-hosted copy of THIS moderated thumbnail) and drop the raw source MP4 from
    // the public bucket now that Cloudflare holds the transcode. Free videos keep
    // the Cloudflare thumbnail (fast + edge-cached).
    const { data: linkedRecipe } = await supabaseAdmin
      .from('recipes')
      .select('price_cents, visibility')
      .eq('video_asset_id', assetId)
      .maybeSingle<{ price_cents: number | null; visibility: string | null }>();
    const premium = !!(linkedRecipe && (linkedRecipe.price_cents != null || linkedRecipe.visibility === 'subscribers'));

    let posterUrl: string | null = a.posterUrl;
    if (premium) {
      // a.posterUrl is non-null here (guarded above; the fail-closed defer returns
      // when it's missing) — assert past the await-widened narrowing.
      const clientPoster = current.poster_url && storagePathFromPublicUrl(current.poster_url) ? current.poster_url : null;
      posterUrl = clientPoster ?? (await rehostPosterPublic(assetId, a.posterUrl!, null));
    }

    await supabaseAdmin
      .from('video_assets')
      .update({ status: 'ready', hls_url: a.hlsUrl, poster_url: posterUrl, duration_seconds: a.duration, last_polled_at: nowIso })
      .eq('id', assetId);

    if (premium && current.source_url) {
      const srcPath = storagePathFromPublicUrl(current.source_url);
      if (srcPath) {
        const { error: rmErr } = await supabaseAdmin.storage.from('videos').remove([srcPath]);
        if (rmErr) console.error('[finalize] premium source cleanup failed', { assetId, err: rmErr.message });
      }
    }
    // Sign the premium video LAST — after moderation (which needed the public
    // thumbnail) and after the poster is already UID-free. Now the HLS manifest +
    // Cloudflare thumbnail require a token; entitled viewers fetch a signed URL from
    // /recipes/:id/playback.
    if (premium) {
      try {
        await provider.setRequireSignedURLs?.(uid, true);
      } catch (err) {
        console.error('[finalize] enabling signed URLs on premium video failed', { assetId, uid, err: String(err) });
      }
    }
    return { ...a, posterUrl };
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
