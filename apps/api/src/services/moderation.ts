/**
 * Content moderation hook. This is a deliberately simple placeholder (keyword
 * blocklist + link-spam heuristic). A production deployment swaps in a real
 * moderation provider (Cloudflare AI / OpenAI moderation / Hive) behind this
 * same `moderateText` interface, applied at recipe + comment creation.
 */
export interface ModerationResult {
  ok: boolean;
  reason?: string;
}

// Minimal illustrative blocklist — extend / replace with a real service.
const BLOCKED = ['kill yourself', 'kys', 'fuck you', 'scam link', 'free crypto'];

export function moderateText(...parts: Array<string | string[]>): ModerationResult {
  const blob = parts
    .flat()
    .join(' ')
    .toLowerCase();

  for (const term of BLOCKED) {
    if (blob.includes(term)) return { ok: false, reason: 'Content violates our community guidelines.' };
  }
  const links = (blob.match(/https?:\/\//g) ?? []).length;
  if (links > 3) return { ok: false, reason: 'Too many links.' };
  return { ok: true };
}
