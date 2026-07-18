import { apiGet } from './api';

/**
 * Shared cache for premium (signed) playback URLs.
 *
 * A premium recipe's video URL is deliberately withheld from every list/detail
 * payload (the mapper nulls it); an ENTITLED viewer fetches a short-lived signed
 * URL from GET /recipes/:id/playback. Without caching, that round-trip only starts
 * the moment the viewer opens the clip → a ~1s black gap before playback, whereas
 * a normal video plays straight from the URL already in the payload.
 *
 * This warms the signed URL WHILE the user browses (the grid/feed prefetches it),
 * keyed by recipe id, so tapping opens instantly — same speed as a normal video.
 * The server token is long-lived (hours); we treat a cached URL as fresh for a
 * bounded window under that, and de-dupe concurrent fetches so a grid of N premium
 * tiles issues at most N requests.
 */
type Entry = { url: string; at: number };
const cache = new Map<string, Entry>();
const inflight = new Map<string, Promise<string | null>>();

// Bumped every time the signed-in identity changes (clearPlaybackCache). A prefetch
// captures the epoch at dispatch; if it changes before the request resolves, the
// result is discarded — a URL minted for the PREVIOUS account must never populate
// the new account's cache (the clear alone can't cancel an in-flight request).
let epoch = 0;

// Comfortably under the server's signed-token TTL. A cached URL older than this is
// re-fetched on next use so a long-lived tab never plays an expired token.
const FRESH_MS = 60 * 60 * 1000; // 1h

/** A fresh cached signed URL for a recipe, or null. */
export function getCachedPlaybackUrl(recipeId: string): string | null {
  const e = cache.get(recipeId);
  if (!e) return null;
  if (Date.now() - e.at > FRESH_MS) {
    cache.delete(recipeId);
    return null;
  }
  return e.url;
}

/**
 * Fetch (and cache) the signed URL for a premium recipe. Returns the cached value
 * instantly if fresh, de-dupes concurrent callers, and never throws — a 403 for a
 * non-entitled viewer or any network error resolves to null (the caller keeps
 * showing the locked overlay / poster).
 */
export function prefetchPlaybackUrl(recipeId: string): Promise<string | null> {
  const cached = getCachedPlaybackUrl(recipeId);
  if (cached) return Promise.resolve(cached);
  const pending = inflight.get(recipeId);
  if (pending) return pending;
  const startedEpoch = epoch;
  const p = apiGet<{ hlsUrl: string }>(`/recipes/${recipeId}/playback`)
    .then((r) => {
      // Identity changed while this was in flight → drop it (see `epoch` above).
      if (startedEpoch !== epoch) return null;
      if (r && r.hlsUrl) {
        cache.set(recipeId, { url: r.hlsUrl, at: Date.now() });
        return r.hlsUrl;
      }
      return null;
    })
    .catch(() => null)
    .finally(() => {
      // Only retract OUR entry — after an identity change clearPlaybackCache() has
      // already wiped inflight and a new-epoch prefetch may own this key.
      if (startedEpoch === epoch) inflight.delete(recipeId);
    });
  inflight.set(recipeId, p);
  return p;
}

/** Drop a cached URL when entitlement may have changed (e.g. a refund revoked access). */
export function forgetPlaybackUrl(recipeId: string): void {
  cache.delete(recipeId);
}

/**
 * Wipe every cached URL + in-flight fetch. A signed URL is entitlement-scoped to ONE
 * account, and this is an SPA (no reload on a native account switch) — so the auth
 * layer calls this whenever the signed-in identity changes, otherwise the next
 * account could read a URL minted for the previous one.
 */
export function clearPlaybackCache(): void {
  epoch++;
  cache.clear();
  inflight.clear();
}
