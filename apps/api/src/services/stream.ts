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
class CloudflareStream implements VideoStreamProvider {
  readonly name = 'cloudflare';
  private base = `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/stream`;
  private headers = { Authorization: `Bearer ${env.CLOUDFLARE_STREAM_TOKEN}`, 'Content-Type': 'application/json' };

  async createDirectUpload(opts: { maxDurationSeconds?: number }): Promise<CreateUploadResult> {
    const res = await fetch(`${this.base}/direct_upload`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ maxDurationSeconds: opts.maxDurationSeconds ?? 120, requireSignedURLs: false }),
    });
    const json = (await res.json()) as { success: boolean; result?: { uid: string; uploadURL: string } };
    if (!json.success || !json.result) throw new Error('Cloudflare direct_upload failed');
    return { providerUid: json.result.uid, uploadUrl: json.result.uploadURL };
  }

  async getAsset(uid: string): Promise<AssetStatus> {
    const res = await fetch(`${this.base}/${uid}`, { headers: this.headers });
    const json = (await res.json()) as {
      success: boolean;
      result?: { status?: { state?: string }; playback?: { hls?: string }; thumbnail?: string; duration?: number };
    };
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
}

let provider: VideoStreamProvider | null = null;

export function getStreamProvider(): VideoStreamProvider {
  if (provider) return provider;
  provider = cloudflareConfigured ? new CloudflareStream() : new MockStream();
  return provider;
}
