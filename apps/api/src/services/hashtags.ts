/**
 * Hashtag parsing + normalization. The SAME normalization must be used on the
 * write path (parsing a caption) and the read path (search / ranking), or tags
 * won't match. Rules: lowercase, allow [a-z0-9_], 2–30 chars, max 10 per post.
 */
const MAX_TAGS = 10;
const MAX_LEN = 30;
const MIN_LEN = 2;

/** Normalize a single raw token (with or without a leading '#') to a canonical tag, or null. */
export function normalizeTag(raw: string): string | null {
  const t = raw.replace(/^#+/, '').toLowerCase().replace(/[^a-z0-9_]/g, '');
  if (t.length < MIN_LEN || t.length > MAX_LEN) return null;
  if (/^_+$/.test(t)) return null;
  return t;
}

/** Extract a deduped, capped list of hashtags from free text (caption + title). */
export function parseHashtags(...sources: (string | null | undefined)[]): string[] {
  const text = sources.filter(Boolean).join(' ');
  const out: string[] = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(/#([\p{L}0-9_]+)/gu)) {
    const tag = normalizeTag(m[1]!);
    if (tag && !seen.has(tag)) {
      seen.add(tag);
      out.push(tag);
      if (out.length >= MAX_TAGS) break;
    }
  }
  return out;
}
