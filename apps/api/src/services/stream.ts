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
  /** Provision a one-time RESUMABLE (tus) upload URL. The client then tus-uploads
   *  (PATCH) directly to the returned URL — no API token on the client, chunked +
   *  resumable, and PATCH-based so it works from the iOS WKWebView (unlike the
   *  multipart POST that forced the Supabase relay). Optional — only Cloudflare. */
  createTusUpload?(opts: { uploadLength: number; maxDurationSeconds?: number }): Promise<CreateUploadResult>;
  getAsset(providerUid: string): Promise<AssetStatus>;
  /** Pull an already-uploaded clip (a public URL) into the provider for
   *  transcoding. Optional — only Cloudflare implements it. Lets the native
   *  client upload to Supabase Storage (which works from the WKWebView, unlike
   *  the direct Stream upload) and have the server relay it in. */
  ingestFromUrl?(url: string): Promise<{ providerUid: string }>;
  /** Delete the provider-side asset (recipe/account deletion). Best-effort:
   *  resolves even when the asset is already gone. No-op on the mock. */
  deleteAsset?(providerUid: string): Promise<void>;
  /** Toggle Cloudflare signed-URL protection on an asset. Premium / subscribers-only
   *  videos flip this ON so their HLS manifest AND thumbnail require a short-lived
   *  token; free videos stay public (fast, edge-cached). Optional — only Cloudflare. */
  setRequireSignedURLs?(providerUid: string, required: boolean): Promise<void>;
  /** Mint a short-lived signed playback token for a signed asset. The API hands this
   *  ONLY to entitled viewers (owner / unlocked / active subscriber); the client
   *  appends it as `?token=` to the manifest (and poster) URL. Optional — Cloudflare. */
  signPlaybackToken?(providerUid: string, ttlSeconds: number): Promise<string>;
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

  // Signed-URL protection is a no-op on the mock (its sample stream is public);
  // returning a throwaway token keeps the local premium flow exercisable.
  async setRequireSignedURLs(): Promise<void> {}
  async signPlaybackToken(): Promise<string> {
    return 'mock-playback-token';
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

  /** tus direct-creator upload: provision a one-time upload URL the client streams
   *  the video to, resumably, straight to Cloudflare. maxDurationSeconds reserves
   *  storage and CAPS the accepted clip length (denial-of-wallet protection). */
  async createTusUpload(opts: { uploadLength: number; maxDurationSeconds?: number }): Promise<CreateUploadResult> {
    // Upload-Metadata is comma-separated `key base64(value)` pairs (tus spec).
    const meta = `maxDurationSeconds ${Buffer.from(String(opts.maxDurationSeconds ?? 1800)).toString('base64')}`;
    const res = await fetchWithTimeout(
      `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/stream?direct_user=true`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.CLOUDFLARE_STREAM_TOKEN}`,
          'Tus-Resumable': '1.0.0',
          'Upload-Length': String(opts.uploadLength),
          'Upload-Metadata': meta,
        },
      },
      10_000,
    );
    if (!res.ok) throw new Error(`Cloudflare tus create → HTTP ${res.status}`);
    // The one-time upload URL is in the Location header; the video UID in stream-media-id.
    const uploadUrl = res.headers.get('Location');
    const providerUid = res.headers.get('stream-media-id');
    if (!uploadUrl || !providerUid) throw new Error('Cloudflare tus create missing Location/stream-media-id');
    return { providerUid, uploadUrl };
  }

  /** Copy-from-URL: Cloudflare fetches the clip from `url` and transcodes it —
   *  normalizing iOS HEVC to cross-platform H.264/HLS. The source URL must stay
   *  publicly reachable until the pull completes (our Supabase videos bucket is
   *  public and we don't delete). requireSignedURLs:false to match the direct path. */
  async ingestFromUrl(url: string): Promise<{ providerUid: string }> {
    const res = await fetchWithTimeout(`${this.base}/copy`, {
      method: 'POST',
      headers: this.headers,
      // maxDurationSeconds caps the accepted clip length on the relay path too
      // (the direct + tus paths already cap it) — denial-of-wallet protection.
      body: JSON.stringify({ url, requireSignedURLs: false, maxDurationSeconds: 1800 }),
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

  /** Flip signed-URL protection on/off. Cloudflare's edit endpoint is a POST to the
   *  video with the changed fields. Idempotent (setting the same value is fine). */
  async setRequireSignedURLs(uid: string, required: boolean): Promise<void> {
    const res = await fetchWithTimeout(`${this.base}/${uid}`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ requireSignedURLs: required }),
    }, 10_000);
    if (res.status === 404) throw new AssetNotFoundError(`Cloudflare asset ${uid} not found`);
    if (!res.ok) throw new Error(`Cloudflare setRequireSignedURLs ${uid} → HTTP ${res.status}`);
  }

  /** Mint a signed token via Cloudflare's per-video /token endpoint (uses the Stream
   *  API token — no separate signing key to provision). `exp` bounds its lifetime so
   *  a leaked token dies quickly; the caller only issues one to an entitled viewer. */
  async signPlaybackToken(uid: string, ttlSeconds: number): Promise<string> {
    const exp = Math.floor(Date.now() / 1000) + Math.max(60, ttlSeconds);
    const res = await fetchWithTimeout(`${this.base}/${uid}/token`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ exp }),
    }, 8_000);
    if (res.status === 404) throw new AssetNotFoundError(`Cloudflare asset ${uid} not found`);
    if (!res.ok) throw new Error(`Cloudflare signPlaybackToken ${uid} → HTTP ${res.status}`);
    const json = (await res.json()) as { success: boolean; result?: { token?: string } };
    if (!json.success || !json.result?.token) throw new Error(`Cloudflare token mint ${uid} failed`);
    return json.result.token;
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
