/**
 * Content moderation. A fast LOCAL pass (keyword blocklist + link-spam) always
 * runs; when OPENAI_API_KEY is configured, text also goes through OpenAI's
 * moderation model. The remote check FAILS OPEN (on error/timeout it falls back
 * to the local result) so a provider outage never blocks posting. Applied at
 * recipe + comment + repost + DM creation.
 */
import { env } from '../env';

export interface ModerationResult {
  ok: boolean;
  reason?: string;
}

// Minimal illustrative blocklist — the local safety net beneath the provider.
const BLOCKED = ['kill yourself', 'kys', 'fuck you', 'scam link', 'free crypto'];

const GUIDELINES = 'Content violates our community guidelines.';

/** Synchronous local pass: keyword blocklist + link-spam heuristic. */
export function moderateLocal(...parts: Array<string | string[]>): ModerationResult {
  const blob = parts.flat().join(' ').toLowerCase();
  for (const term of BLOCKED) {
    if (blob.includes(term)) return { ok: false, reason: GUIDELINES };
  }
  const links = (blob.match(/https?:\/\//g) ?? []).length;
  if (links > 3) return { ok: false, reason: 'Too many links.' };
  return { ok: true };
}

/** True when a real moderation provider is wired up. */
export const moderationConfigured = !!env.OPENAI_API_KEY;

/**
 * Moderate user text. Runs the local pass first; if it passes AND a provider key
 * is set, also runs OpenAI moderation. Returns the local result on any provider
 * error/timeout (fail-open) so moderation outages don't break the app.
 */
export async function moderate(...parts: Array<string | string[]>): Promise<ModerationResult> {
  const local = moderateLocal(...parts);
  if (!local.ok) return local; // local already blocked it
  if (!env.OPENAI_API_KEY) return local; // no provider → local-only (default)

  const input = parts.flat().join('\n').slice(0, 8000);
  if (!input.trim()) return local;

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch('https://api.openai.com/v1/moderations', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${env.OPENAI_API_KEY}` },
      body: JSON.stringify({ model: 'omni-moderation-latest', input }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return local; // provider error → fall back to the local verdict
    const data = (await res.json()) as { results?: Array<{ flagged?: boolean }> };
    if (data.results?.some((r) => r.flagged)) return { ok: false, reason: GUIDELINES };
    return { ok: true };
  } catch {
    return local; // network/timeout → fail open to the local verdict
  }
}

/**
 * Moderate uploaded images (photo posts, or a video's poster frame) with the
 * same multimodal model. Publicly-reachable URLs only (our Supabase storage is
 * public). No-op when no provider key is set; fails open on any provider error.
 */
export async function moderateImages(urls: string[]): Promise<ModerationResult> {
  const clean = urls.filter((u) => /^https?:\/\//.test(u)).slice(0, 4);
  if (!env.OPENAI_API_KEY || clean.length === 0) return { ok: true };
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch('https://api.openai.com/v1/moderations', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${env.OPENAI_API_KEY}` },
      body: JSON.stringify({ model: 'omni-moderation-latest', input: clean.map((url) => ({ type: 'image_url', image_url: { url } })) }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return { ok: true }; // provider error → fail open
    const data = (await res.json()) as { results?: Array<{ flagged?: boolean }> };
    if (data.results?.some((r) => r.flagged)) return { ok: false, reason: GUIDELINES };
    return { ok: true };
  } catch {
    return { ok: true }; // network/timeout → fail open
  }
}

/** @deprecated Synchronous local-only check. Prefer the async `moderate`. */
export const moderateText = moderateLocal;
