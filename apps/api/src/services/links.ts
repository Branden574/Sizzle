import { badRequest } from '../lib/errors';

/** Allowed hostnames per platform (without leading www.). */
const DOMAINS: Record<string, string[]> = {
  instagram: ['instagram.com'],
  tiktok: ['tiktok.com'],
  x: ['x.com', 'twitter.com'],
  youtube: ['youtube.com', 'youtu.be'],
  facebook: ['facebook.com', 'fb.com', 'fb.me'],
  discord: ['discord.gg', 'discord.com', 'discordapp.com'],
};

function canonicalFromHandle(platform: string, h: string): string {
  switch (platform) {
    case 'instagram': return `https://instagram.com/${h}`;
    case 'tiktok': return `https://tiktok.com/@${h}`;
    case 'x': return `https://x.com/${h}`;
    case 'youtube': return `https://youtube.com/@${h}`;
    case 'facebook': return `https://facebook.com/${h}`;
    case 'discord': return `https://discord.gg/${h}`;
    default: return `https://${h}`;
  }
}

/**
 * Normalize a social link to a canonical https URL, or null when empty.
 * Accepts either a full URL (host-validated against the platform to stop someone
 * stashing a phishing link under the wrong icon) or a bare @handle/invite code.
 * `website` accepts any host.
 */
export function normalizeLink(platform: string, raw: string | null | undefined): string | null {
  if (raw == null) return null;
  let v = raw.trim();
  if (!v) return null;

  if (/^https?:\/\//i.test(v)) {
    let url: URL;
    try { url = new URL(v); } catch { throw badRequest(`Invalid ${platform} link`); }
    url.protocol = 'https:';
    const host = url.hostname.replace(/^www\./, '').toLowerCase();
    if (platform === 'website') return url.toString();
    const ok = (DOMAINS[platform] ?? []).some((d) => host === d || host.endsWith('.' + d));
    if (!ok) throw badRequest(`That doesn't look like a ${platform} link`);
    return url.toString();
  }

  v = v.replace(/^@+/, '');
  if (platform === 'website') {
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(v)) throw badRequest('Invalid website URL');
    return `https://${v}`;
  }
  if (!/^[A-Za-z0-9._/-]{1,64}$/.test(v)) throw badRequest(`Invalid ${platform} handle`);
  return canonicalFromHandle(platform, v);
}
