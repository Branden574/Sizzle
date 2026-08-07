import { Capacitor, registerPlugin } from '@capacitor/core';
import { apiGet } from './api';

interface InstagramSharePlugin {
  isAvailable(): Promise<{ available: boolean }>;
  shareToStories(opts: {
    backgroundImage?: string;
    backgroundImageUrl?: string;
    backgroundVideoUrl?: string;
    backgroundVideoPath?: string;
    stickerImage?: string;
    appId?: string;
    contentURL?: string;
  }): Promise<{ shared: boolean }>;
}

const InstagramShare = registerPlugin<InstagramSharePlugin>('InstagramShare');

/** Facebook App ID for the Instagram Stories `source_application` (public — safe to ship). */
const FACEBOOK_APP_ID = '4288956074698900';

/**
 * True only where the native plugin is compiled in (build 31+) AND Instagram is installed.
 * We call the plugin DIRECTLY rather than gating on Capacitor.isPluginAvailable() — that
 * helper only knows the static packageClassList and returns false for plugins registered at
 * runtime via bridge.registerPluginInstance (which is how this app's local plugins register).
 * Where the plugin isn't compiled in (build 30/29), the call rejects and we return false.
 */
export async function canShareToInstagramStories(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    const res = await InstagramShare.isAvailable();
    return !!res?.available;
  } catch {
    return false;
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous'; // draw only if CORS-clean, so the canvas never taints
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image load failed'));
    img.src = url;
  });
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
      if (lines.length === maxLines) break;
    } else {
      line = test;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  return lines.slice(0, maxLines);
}

/**
 * Compose a 1080×1920 branded Story card: the recipe's cover (cover-fit) or a Sizzle
 * gradient fallback, a dark scrim, the title, and a "Full recipe on Sizzle @handle" CTA.
 * Returns a base64 JPEG data URL. The poster is drawn ONLY when it loads CORS-clean, so
 * `toDataURL` never throws on a tainted canvas — the gradient covers the CORS-blocked case.
 */
export async function composeStoryCard(opts: { posterUrl?: string | null; title: string; handle: string }): Promise<string> {
  const W = 1080, H = 1920;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2d canvas context');

  // 1. Background: poster cover-fit if it loads CORS-clean, else a Sizzle gradient.
  let drewPoster = false;
  if (opts.posterUrl) {
    try {
      const img = await loadImage(opts.posterUrl);
      const scale = Math.max(W / img.width, H / img.height);
      const dw = img.width * scale, dh = img.height * scale;
      ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
      drewPoster = true;
    } catch {
      /* CORS-blocked or 404 — fall through to the gradient */
    }
  }
  if (!drewPoster) {
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#f4a52c');
    g.addColorStop(0.55, '#ff5a36');
    g.addColorStop(1, '#c23a1a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  // 2. Scrims for legibility (top for the wordmark, strong bottom for title + CTA).
  const top = ctx.createLinearGradient(0, 0, 0, 320);
  top.addColorStop(0, 'rgba(0,0,0,.45)');
  top.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = top;
  ctx.fillRect(0, 0, W, 320);
  const bot = ctx.createLinearGradient(0, H * 0.48, 0, H);
  bot.addColorStop(0, 'rgba(0,0,0,0)');
  bot.addColorStop(1, 'rgba(0,0,0,.86)');
  ctx.fillStyle = bot;
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = 'center';

  // 3. Wordmark (top).
  ctx.fillStyle = '#fff';
  ctx.font = "700 52px -apple-system, 'Hanken Grotesk', system-ui, sans-serif";
  ctx.fillText('🔥 Sizzle', W / 2, 132);

  // 4. Title (wrapped, bottom-anchored above the CTA).
  ctx.fillStyle = '#fff';
  ctx.font = "800 84px Georgia, 'Instrument Serif', serif";
  const lines = wrapLines(ctx, opts.title, W - 160, 3);
  let ty = H - 268 - (lines.length - 1) * 96;
  for (const ln of lines) {
    ctx.fillText(ln, W / 2, ty);
    ty += 96;
  }

  // 5. Call to action.
  ctx.fillStyle = 'rgba(255,255,255,.9)';
  ctx.font = "600 42px -apple-system, 'Hanken Grotesk', system-ui, sans-serif";
  ctx.fillText('Full recipe on Sizzle', W / 2, H - 172);
  ctx.fillStyle = '#ffce4a';
  ctx.font = "700 46px -apple-system, 'Hanken Grotesk', system-ui, sans-serif";
  ctx.fillText(`@${opts.handle}`, W / 2, H - 108);

  return canvas.toDataURL('image/jpeg', 0.92);
}

/**
 * Compose the recipe's branded Story card and open Instagram Stories with it. The recipe
 * link rides along as a tappable sticker (IG honors it only for approved apps and safely
 * ignores it otherwise). Resolves true if Instagram opened.
 */
export async function shareRecipeToInstagramStories(opts: {
  posterUrl?: string | null;
  title: string;
  handle: string;
  recipeUrl: string;
}): Promise<boolean> {
  const backgroundImage = await composeStoryCard(opts);
  try {
    // source_application (the FB App ID) is what Instagram checks to allow the Stories share.
    // contentURL (a tappable link sticker) is intentionally omitted — IG only honors it for
    // apps it has approved for link stickers, so we skip it to keep the share reliable.
    const { shared } = await InstagramShare.shareToStories({ backgroundImage, appId: FACEBOOK_APP_ID });
    return shared;
  } catch {
    return false;
  }
}

type ShareVideoResp =
  | { status: 'ready'; mp4Url: string }
  | { status: 'generating'; percent: number };

/**
 * Ask the backend to prepare a downloadable MP4 of the recipe's actual video (it lazily enables
 * Cloudflare's MP4 rendition on the first request) and poll until it's ready. Returns the
 * (signed, for premium owner-exports) MP4 URL, or null if it never readied / isn't exportable /
 * the caller cancelled. The endpoint enforces the export policy: free public = anyone; premium
 * or subscribers-only = the creator only.
 */
async function prepareShareVideoUrl(
  recipeId: string,
  onProgress?: (pct: number) => void,
  isCancelled?: () => boolean,
): Promise<string | null> {
  const deadline = Date.now() + 90_000; // Cloudflare usually renders a short clip in a few seconds.
  while (Date.now() < deadline) {
    if (isCancelled?.()) return null;
    let resp: ShareVideoResp;
    try {
      resp = await apiGet<ShareVideoResp>(`/recipes/${recipeId}/share-video`);
    } catch {
      return null; // 403 (not exportable) / 404 / network — caller falls back to the card.
    }
    if (resp.status === 'ready') return resp.mp4Url;
    onProgress?.(resp.percent ?? 0);
    await new Promise<void>((r) => { setTimeout(r, 1500); });
  }
  return null;
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * A compact branded "watermark" sticker (transparent PNG) overlaid on a shared video story —
 * a Sizzle gradient pill with the wordmark, the creator's @handle, and a "find it on Sizzle"
 * tagline. IG shows it as a draggable sticker the user can reposition. This is our attribution
 * on video shares (IG only renders tappable LINK stickers for approved partners, so we brand
 * visually instead). Returns a base64 PNG.
 */
export async function composeStoryBadge(opts: { handle: string }): Promise<string> {
  const W = 840, H = 300, pad = 12;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2d canvas context');

  const g = ctx.createLinearGradient(pad, 0, W - pad, 0);
  g.addColorStop(0, '#f9a825');
  g.addColorStop(0.5, '#ff5a36');
  g.addColorStop(1, '#d6249f');
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 26;
  ctx.shadowOffsetY = 8;
  ctx.fillStyle = g;
  roundRectPath(ctx, pad, pad, W - pad * 2, H - pad * 2, 52);
  ctx.fill();
  ctx.shadowColor = 'transparent';

  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.font = "800 74px -apple-system, 'Hanken Grotesk', system-ui, sans-serif";
  ctx.fillText('🔥 Sizzle', W / 2, 116);
  ctx.font = "700 50px -apple-system, 'Hanken Grotesk', system-ui, sans-serif";
  ctx.fillText(`@${opts.handle}`, W / 2, 184);
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.font = "600 34px -apple-system, 'Hanken Grotesk', system-ui, sans-serif";
  ctx.fillText('Get the full recipe on Sizzle', W / 2, 240);

  return canvas.toDataURL('image/png');
}

/**
 * Share the recipe's ACTUAL video (with sound) to Instagram Stories, with a branded Sizzle
 * watermark sticker overlaid. Prepares a downloadable MP4 server-side, hands the URL + sticker
 * to the native plugin (which downloads the video and sets IG's backgroundVideo + stickerImage
 * pasteboard), and falls back to the branded card image if the video can't be prepared (not
 * exportable, still transcoding, or IG errors). Returns which path succeeded.
 */
export async function shareRecipeVideoToInstagramStories(opts: {
  recipeId: string;
  posterUrl?: string | null;
  title: string;
  handle: string;
  recipeUrl: string;
  onProgress?: (pct: number) => void;
  isCancelled?: () => boolean;
}): Promise<'shared-video' | 'shared-card' | false> {
  const mp4Url = await prepareShareVideoUrl(opts.recipeId, opts.onProgress, opts.isCancelled);
  if (mp4Url && !opts.isCancelled?.()) {
    try {
      // A branded watermark sticker so the story is visibly "from Sizzle". Best-effort — if the
      // canvas fails for any reason, still share the video (unbranded beats not sharing).
      let stickerImage: string | undefined;
      try { stickerImage = await composeStoryBadge({ handle: opts.handle }); } catch { /* no badge */ }
      const { shared } = await InstagramShare.shareToStories({ backgroundVideoUrl: mp4Url, stickerImage, appId: FACEBOOK_APP_ID });
      if (shared) return 'shared-video';
    } catch {
      /* fall through to the branded card */
    }
  }
  if (opts.isCancelled?.()) return false;
  const ok = await shareRecipeToInstagramStories(opts);
  return ok ? 'shared-card' : false;
}
