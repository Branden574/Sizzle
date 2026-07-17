import { env, cloudflareConfigured } from '../env';

/**
 * Video pipeline abstraction. The app talks to this interface only; whether
 * it's backed by a local mock or real Cloudflare Stream is an env decision.
 */
export interface CreateUploadResult {
  /** Provider-side asset id (Cloudflare Stream UID, or a mock id). */
  providerUid: string;
  /** One-time URL the client PUTs/POSTs the video bytes to. */
  uploadUrl: string;
}

export interface AssetStatus {
  status: 'pending' | 'uploading' | 'processing' | 'ready' | 'error';
  hlsUrl: string | null;
  posterUrl: string | null;
  duration: number | null;
}

export interface VideoStreamProvider {
  readonly name: string;
  createDirectUpload(opts: { maxDurationSeconds?: number }): Promise<CreateUploadResult>;
  getAsset(providerUid: string): Promise<AssetStatus>;
  /** Pull an already-uploaded clip (a public URL) into the provider for
   *  transcoding. Optional — only Cloudflare implements it. Lets the native
   *  client upload to Supabase Storage (which works from the WKWebView, unlike
   *  the direct Stream upload) and have the server relay it in. */
  ingestFromUrl?(url: string): Promise<{ providerUid: string }>;
  /** Delete the provider-side asset (recipe/account deletion). Best-effort:
   *  resolves even when the asset is already gone. No-op on the mock. */
  deleteAsset?(providerUid: string): Promise<void>;
}

/**
 * Mock provider — no Cloudflare account required. Returns a throwaway upload
 * URL and reports assets as immediately "ready" using a public sample stream,
 * so the full upload→feed→playback loop is exercisable locally.
 * STUBBED: bytes are not actually stored or transcoded.
 */
class MockStream implements VideoStreamProvider {
  readonly name = 'mock';

  async createDirectUpload(): Promise<CreateUploadResult> {
    const uid = `mock_${Math.random().toString(36).slice(2, 12)}`;
    return { providerUid: uid, uploadUrl: `${env.WEB_ORIGIN}/__mock-upload/${uid}` };
  }

  async getAsset(): Promise<AssetStatus> {
    return {
      status: 'ready',
      hlsUrl: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
      posterUrl: null,
      duration: 30,
    };
  }
}

/**
 * Real Cloudflare Stream provider. Uses tus/direct-upload + the Stream API.
 * Active only when VIDEO_PROVIDER=cloudflare and creds are present.
 */
/** A definitive "this asset is gone" from Cloudflare (404). Distinct from a
 *  transient API failure so the finalizer can mark it errored vs. retry later. */
export class AssetNotFoundError extends Error {}

/** fetch with an AbortController timeout — a hung Cloudflare API must never stall
 *  the finalize cron batch or a client status poll. */
async function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

class CloudflareStream implements VideoStreamProvider {
  readonly name = 'cloudflare';
  private base = `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/stream`;
  private headers = { Authorization: `Bearer ${env.CLOUDFLARE_STREAM_TOKEN}`, 'Content-Type': 'application/json' };

  async createDirectUpload(opts: { maxDurationSeconds?: number }): Promise<CreateUploadResult> {
    const res = await fetchWithTimeout(`${this.base}/direct_upload`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ maxDurationSeconds: opts.maxDurationSeconds ?? 1800, requireSignedURLs: false }),
    }, 10_000);
    const json = (await res.json()) as { success: boolean; result?: { uid: string; uploadURL: string } };
    if (!json.success || !json.result) throw new Error('Cloudflare direct_upload failed');
    return { providerUid: json.result.uid, uploadUrl: json.result.uploadURL };
  }

  /** Copy-from-URL: Cloudflare fetches the clip from `url` and transcodes it —
   *  normalizing iOS HEVC to cross-platform H.264/HLS. The source URL must stay
   *  publicly reachable until the pull completes (our Supabase videos bucket is
   *  public and we don't delete). requireSignedURLs:false to match the direct path. */
  async ingestFromUrl(url: string): Promise<{ providerUid: string }> {
    const res = await fetchWithTimeout(`${this.base}/copy`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ url, requireSignedURLs: false }),
    }, 15_000);
    const json = (await res.json()) as { success: boolean; result?: { uid: string }; errors?: unknown };
    if (!json.success || !json.result) throw new Error(`Cloudflare copy failed: ${JSON.stringify(json.errors)}`);
    return { providerUid: json.result.uid };
  }

  async getAsset(uid: string): Promise<AssetStatus> {
    const res = await fetchWithTimeout(`${this.base}/${uid}`, { headers: this.headers }, 8_000);
    // Honest error reporting: a definitive 404 means the asset is gone (deleted /
    // never existed) → surface as AssetNotFoundError so the finalizer marks it
    // 'error'. Any OTHER non-2xx (429 rate limit, 5xx) is TRANSIENT → throw so the
    // finalizer defers and the next tick retries. Never silently map an API failure
    // to 'processing' with null URLs (that used to clobber a live asset's poster and
    // regress ready→processing).
    if (res.status === 404) throw new AssetNotFoundError(`Cloudflare asset ${uid} not found`);
    if (!res.ok) throw new Error(`Cloudflare getAsset ${uid} → HTTP ${res.status}`);
    const json = (await res.json()) as {
      success: boolean;
      result?: { status?: { state?: string }; playback?: { hls?: string }; thumbnail?: string; duration?: number };
    };
    if (!json.success || !json.result) throw new Error(`Cloudflare getAsset ${uid} → unsuccessful response`);
    const r = json.result;
    const state = r?.status?.state;
    const status: AssetStatus['status'] = state === 'ready' ? 'ready' : state === 'error' ? 'error' : 'processing';
    return {
      status,
      hlsUrl: r?.playback?.hls ?? null,
      posterUrl: r?.thumbnail ?? null,
      duration: r?.duration ?? null,
    };
  }

  async deleteAsset(uid: string): Promise<void> {
    // 404 = already gone, which is fine (idempotent). Only surface other failures.
    const res = await fetchWithTimeout(`${this.base}/${uid}`, { method: 'DELETE', headers: this.headers }, 10_000);
    if (!res.ok && res.status !== 404) {
      throw new Error(`Cloudflare deleteAsset ${uid} → HTTP ${res.status}`);
    }
  }
}

let provider: VideoStreamProvider | null = null;

// Guard against a silent prod downgrade: if the Cloudflare env vars go missing in
// production, getStreamProvider() would quietly return the MockStream and turn
// every new upload into a fake sample clip. Fail LOUDLY at boot instead (logged
// once; we don't throw so a momentary config blip doesn't take the whole API down).
if (process.env.VERCEL_ENV === 'production' && !cloudflareConfigured) {
  console.error('[stream] VIDEO_PROVIDER not configured in production — falling back to MockStream; new uploads will NOT transcode. Set CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_STREAM_TOKEN.');
}

export function getStreamProvider(): VideoStreamProvider {
  if (provider) return provider;
  provider = cloudflareConfigured ? new CloudflareStream() : new MockStream();
  return provider;
}
