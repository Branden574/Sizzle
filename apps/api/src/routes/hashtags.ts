import { Hono } from 'hono';
import type { FeedResponse } from '@sizzle/shared';
import { supabaseAdmin } from '../lib/supabase';
import { dbFail, badRequest } from '../lib/errors';
import { optionalAuth, requireAuth, requireAdmin } from '../middleware/auth';
import { buildCards, loadMutedIds, type RecipeRow } from '../mappers';
import { normalizeTag } from '../services/hashtags';
import { logModeration } from '../services/audit';
import type { AppEnv } from '../types';

export const hashtags = new Hono<AppEnv>();

const PAGE = 12;

interface Suggestion { tag: string; displayName: string; postCount: number; featured: boolean; isNew: boolean }

/**
 * GET /hashtags/suggest?q=<prefix> — composer autocomplete. Prefix match over canonical
 * (active, non-blocked, non-sensitive) hashtags ranked by usage; blocked/sensitive tags never
 * surface. With no prefix, featured/popular starters. Always offers the exact typed term (even
 * brand-new, ≥2 chars) so a user can coin a tag. Small, fast, edge-cacheable; safe for anon.
 */
hashtags.get('/suggest', optionalAuth, async (c) => {
  const q = (c.req.query('q') ?? '').trim().replace(/^#+/, '').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 30);
  let query = supabaseAdmin
    .from('hashtags')
    .select('normalized_name, display_name, post_count, is_featured')
    .eq('status', 'active').eq('is_blocked', false).eq('is_sensitive', false)
    .order('is_featured', { ascending: false }).order('post_count', { ascending: false })
    .limit(8);
  // Escape LIKE wildcards — normalized tags can contain '_', which would otherwise match any char.
  if (q.length >= 1) query = query.like('normalized_name', `${q.replace(/[\\_%]/g, '\\$&')}%`);
  const { data } = await query;
  const out: Suggestion[] = (data ?? []).map((r) => ({ tag: r.normalized_name as string, displayName: r.display_name as string, postCount: r.post_count as number, featured: r.is_featured as boolean, isNew: false }));
  if (q.length >= 2 && !out.some((s) => s.tag === q)) out.push({ tag: q, displayName: q, postCount: 0, featured: false, isNew: true });
  c.header('Cache-Control', 'public, max-age=30');
  return c.json(out.slice(0, 8));
});

/**
 * GET /hashtags/trending?window=24h — the trend leaderboard (momentum, not lifetime totals).
 * Reads pre-computed hashtag_metrics (fed by the rollup cron); only positive trend scores,
 * blocked/sensitive tags excluded. Public + briefly edge-cached.
 */
hashtags.get('/trending', optionalAuth, async (c) => {
  const win = c.req.query('window') === '7d' ? '7d' : '24h';
  const { data, error } = await supabaseAdmin
    .from('hashtag_metrics')
    .select('trend_score, posts_created, unique_creators, qualified_views, hashtags!inner(normalized_name, display_name, post_count, is_featured, is_verified, category, status, is_blocked, is_sensitive)')
    .eq('time_window', win)
    .gt('trend_score', 0)
    .eq('hashtags.status', 'active').eq('hashtags.is_blocked', false).eq('hashtags.is_sensitive', false)
    .order('trend_score', { ascending: false })
    .limit(25);
  if (error) throw dbFail(error.message);
  const rows = (data ?? []) as unknown as Array<{ trend_score: number; posts_created: number; unique_creators: number; qualified_views: number; hashtags: { normalized_name: string; display_name: string; post_count: number; is_featured: boolean; is_verified: boolean; category: string | null } }>;
  const items = rows.map((r, i) => ({
    rank: i + 1,
    tag: r.hashtags.normalized_name,
    displayName: r.hashtags.display_name,
    posts: r.hashtags.post_count,
    recentPosts: r.posts_created,
    creators: r.unique_creators,
    views: r.qualified_views,
    trendScore: Number(r.trend_score),
    featured: r.hashtags.is_featured,
    verified: r.hashtags.is_verified,
    category: r.hashtags.category,
    window: win,
  }));
  c.header('Cache-Control', 'public, max-age=60, stale-while-revalidate=120');
  return c.json({ window: win, items });
});

/** Resolve a canonical hashtag row (404s blocked). */
async function loadHashtag(tag: string) {
  const { data } = await supabaseAdmin
    .from('hashtags')
    .select('id, normalized_name, display_name, description, category, post_count, creator_count, is_featured, is_verified, is_sensitive, is_blocked, status')
    .eq('normalized_name', tag)
    .maybeSingle();
  return data as null | { id: string; normalized_name: string; display_name: string; description: string | null; category: string | null; post_count: number; creator_count: number; is_featured: boolean; is_verified: boolean; is_sensitive: boolean; is_blocked: boolean; status: string };
}

/**
 * GET /hashtags/:tag — hashtag detail: canonical metadata, live counts, the viewer's follow/mute
 * state, trend status, and a few related tags. Blocked hashtags 404. Content lives at /:tag/content.
 */
hashtags.get('/:tag', optionalAuth, async (c) => {
  const userId = c.get('userId');
  const tag = normalizeTag(c.req.param('tag'));
  if (!tag) return c.json({ error: 'not_found' }, 404);
  const h = await loadHashtag(tag);
  if (h && (h.is_blocked || h.status === 'blocked')) return c.json({ error: 'not_found' }, 404);

  let state: string | null = null;
  if (userId && h) {
    const { data: pref } = await supabaseAdmin.from('user_hashtag_preferences').select('state').eq('user_id', userId).eq('hashtag_id', h.id).maybeSingle();
    state = (pref?.state as string) ?? null;
  }
  let trendScore = 0;
  if (h) {
    const { data: m } = await supabaseAdmin.from('hashtag_metrics').select('trend_score').eq('hashtag_id', h.id).eq('time_window', '24h').maybeSingle();
    trendScore = Number(m?.trend_score ?? 0);
  }
  // A few related tags: other hashtags that co-occur on this tag's posts (cheap heuristic).
  let related: string[] = [];
  if (h) {
    const { data: rel } = await supabaseAdmin.rpc('related_hashtags', { p_hashtag: h.id, p_limit: 6 });
    related = ((rel ?? []) as Array<{ normalized_name: string }>).map((r) => r.normalized_name);
  }
  return c.json({
    tag,
    displayName: h?.display_name ?? tag,
    description: h?.description ?? null,
    category: h?.category ?? null,
    posts: h?.post_count ?? 0,
    creators: h?.creator_count ?? 0,
    featured: h?.is_featured ?? false,
    verified: h?.is_verified ?? false,
    sensitive: h?.is_sensitive ?? false,
    following: state === 'following',
    muted: state === 'muted' || state === 'not_interested',
    trending: trendScore > 0,
    related,
  });
});

/**
 * GET /hashtags/:tag/content?sort=top|recent&cursor= — the hashtag's public content. `recent` is
 * newest-first (created_at keyset); `top` is engagement-first (like_count keyset). Premium /
 * subscribers-only / auto-hidden posts and blocked/muted cooks are excluded (buildCards enforces
 * private-account rules on the final response too).
 */
hashtags.get('/:tag/content', optionalAuth, async (c) => {
  const userId = c.get('userId');
  const tag = normalizeTag(c.req.param('tag'));
  if (!tag) return c.json<FeedResponse>({ items: [], nextCursor: null });
  // A blocked hashtag's content must not stay browsable even though its detail page 404s.
  const h = await loadHashtag(tag);
  if (h && (h.is_blocked || h.status === 'blocked')) return c.json<FeedResponse>({ items: [], nextCursor: null });
  const sort = c.req.query('sort') === 'top' ? 'top' : 'recent';
  const cursor = c.req.query('cursor');

  let q = supabaseAdmin
    .from('recipes')
    .select('*')
    .eq('status', 'published')
    .not('auto_hidden', 'is', true)
    .contains('tags', [tag])
    // Priced recipes appear as locked teasers (buildCards strips the playable URL);
    // subscribers-only stays out — no in-app subscription path on iOS.
    .or('visibility.is.null,visibility.neq.subscribers')
    .limit(PAGE + 1);
  if (sort === 'recent') {
    q = q.order('created_at', { ascending: false });
    if (cursor) q = q.lt('created_at', cursor);
  } else {
    q = q.order('like_count', { ascending: false }).order('id', { ascending: false });
    if (cursor) {
      // VALIDATE before interpolating into the PostgREST .or() filter — an unvalidated id/likes
      // is a filter-injection vector. Ignore a malformed cursor rather than trust it.
      const [likesRaw, idRaw] = cursor.split(':');
      const likes = Number.parseInt(likesRaw ?? '', 10);
      const id = idRaw ?? '';
      if (Number.isFinite(likes) && likes >= 0 && /^[0-9a-fA-F-]{36}$/.test(id)) {
        q = q.or(`like_count.lt.${likes},and(like_count.eq.${likes},id.lt.${id})`);
      }
    }
  }
  const { data, error } = await q;
  if (error) throw dbFail(error.message);

  let rows = (data ?? []) as RecipeRow[];
  if (userId) {
    const muted = await loadMutedIds(supabaseAdmin, userId);
    if (muted.size) rows = rows.filter((r) => !muted.has(r.cook_id));
  }
  const hasMore = rows.length > PAGE;
  const page = rows.slice(0, PAGE);
  const items = await buildCards(supabaseAdmin, userId, page);
  const last = page[page.length - 1];
  const nextCursor = hasMore && last ? (sort === 'recent' ? last.created_at : `${last.like_count}:${last.id}`) : null;
  return c.json<FeedResponse>({ items, nextCursor });
});

/**
 * POST /hashtags/:tag/preference { state } — follow / mute / not_interested / neutral. Upserts
 * the user's preference; feeds candidate generation + suppression in the ranker. Creates the
 * canonical hashtag on first follow of a not-yet-seen tag.
 */
hashtags.post('/:tag/preference', requireAuth, async (c) => {
  const userId = c.get('userId')!;
  const tag = normalizeTag(c.req.param('tag'));
  if (!tag) throw badRequest('Invalid hashtag');
  const body = await c.req.json<{ state?: string }>().catch(() => ({} as { state?: string }));
  const state = body.state ?? 'neutral';
  if (!['following', 'muted', 'not_interested', 'neutral'].includes(state)) throw badRequest('Invalid state');

  const existing = await loadHashtag(tag);
  if (existing && (existing.is_blocked || existing.status === 'blocked')) throw badRequest('This hashtag is not available');
  let hid = existing?.id;
  if (!hid) {
    const { data: created } = await supabaseAdmin.from('hashtags').insert({ normalized_name: tag, display_name: tag, slug: tag }).select('id').maybeSingle();
    hid = created?.id as string | undefined;
  }
  if (!hid) throw dbFail('Could not resolve hashtag');

  if (state === 'neutral') {
    await supabaseAdmin.from('user_hashtag_preferences').delete().eq('user_id', userId).eq('hashtag_id', hid);
  } else {
    await supabaseAdmin.from('user_hashtag_preferences').upsert(
      { user_id: userId, hashtag_id: hid, state, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,hashtag_id' },
    );
  }
  return c.json({ ok: true, tag, state });
});

/**
 * POST /hashtags/:tag/moderate { action } — admin-only. block / unblock / feature / unfeature /
 * sensitive / unsensitive. Every action is attributable via the admin gate + logged.
 */
hashtags.post('/:tag/moderate', requireAuth, requireAdmin, async (c) => {
  const tag = normalizeTag(c.req.param('tag'));
  if (!tag) throw badRequest('Invalid hashtag');
  const body = await c.req.json<{ action?: string }>().catch(() => ({} as { action?: string }));
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  switch (body.action) {
    case 'block': patch.is_blocked = true; patch.status = 'blocked'; break;
    case 'unblock': patch.is_blocked = false; patch.status = 'active'; break;
    case 'feature': patch.is_featured = true; break;
    case 'unfeature': patch.is_featured = false; break;
    case 'sensitive': patch.is_sensitive = true; patch.status = 'sensitive'; break;
    case 'unsensitive': patch.is_sensitive = false; patch.status = 'active'; break;
    default: throw badRequest('Unknown action');
  }
  const { error } = await supabaseAdmin.from('hashtags').update(patch).eq('normalized_name', tag);
  if (error) throw dbFail(error.message);
  // Every other admin moderation action lands in moderation_log (and therefore in
  // /admin/log). This one used to only console.log, so blocking or featuring a hashtag
  // left no auditable trace of who did it. The target is a tag, not a user or recipe,
  // so it rides in `detail`.
  await logModeration({ adminId: c.get('userId'), action: `hashtag_${body.action}`, detail: tag });
  return c.json({ ok: true, tag, action: body.action });
});
