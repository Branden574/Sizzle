/**
 * Hashtag parsing + normalization. The SAME normalization must be used on the
 * write path (parsing a caption) and the read path (search / ranking), or tags
 * won't match. Rules: lowercase, allow [a-z0-9_], 2–30 chars, max 10 per post.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

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

/**
 * Dual-write a recipe's hashtags into the relational model (canonical `hashtags` +
 * `content_hashtags`), alongside the legacy `recipes.tags` array the live app still reads.
 * Upserts each canonical hashtag, replaces this recipe's associations, and refreshes the
 * denormalized post/creator counts. Blocked hashtags are skipped (never re-created/associated).
 * Best-effort: it logs and swallows errors so a hashtag hiccup never fails a post.
 */
export async function syncContentHashtags(db: SupabaseClient, recipeId: string, cookId: string, tags: string[]): Promise<void> {
  try {
    const now = new Date().toISOString();
    if (tags.length) {
      // Upsert canonical rows (idempotent on normalized_name; refreshes last_used_at).
      await db.from('hashtags').upsert(
        tags.map((t) => ({ normalized_name: t, display_name: t, slug: t, last_used_at: now })),
        { onConflict: 'normalized_name' },
      );
    }
    // Resolve ids, EXCLUDING blocked hashtags (they must not gain associations).
    const { data: rows } = tags.length
      ? await db.from('hashtags').select('id, normalized_name, is_blocked, status').in('normalized_name', tags)
      : { data: [] as Array<{ id: string; normalized_name: string; is_blocked: boolean; status: string }> };
    const idOf = new Map(
      (rows ?? []).filter((r) => !r.is_blocked && r.status !== 'blocked').map((r) => [r.normalized_name as string, r.id as string]),
    );
    // Capture the recipe's PRIOR hashtags so tags REMOVED by a caption edit also get their
    // counts refreshed (else a removed tag keeps a stale, inflated post_count forever).
    const { data: prior } = await db.from('content_hashtags').select('hashtag_id').eq('recipe_id', recipeId);
    const priorIds = (prior ?? []).map((r) => r.hashtag_id as string);
    // Replace this recipe's associations wholesale (handles edits: added + removed tags).
    await db.from('content_hashtags').delete().eq('recipe_id', recipeId);
    const links = tags
      .map((t, i) => ({ recipe_id: recipeId, hashtag_id: idOf.get(t), cook_id: cookId, position: i, source: 'caption' }))
      .filter((l): l is { recipe_id: string; hashtag_id: string; cook_id: string; position: number; source: string } => !!l.hashtag_id);
    if (links.length) await db.from('content_hashtags').insert(links);
    // Refresh denormalized counts for every hashtag we touched (added AND removed).
    const ids = [...new Set([...priorIds, ...idOf.values()])];
    if (ids.length) await db.rpc('refresh_hashtag_counts', { p_ids: ids });
  } catch (err) {
    console.error('[hashtags] syncContentHashtags failed', { recipeId, err: String(err) });
  }
}
