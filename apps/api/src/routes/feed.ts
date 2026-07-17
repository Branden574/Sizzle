import { Hono } from 'hono';
import type { FeedResponse, RecipeCard, TrendingTag, VerificationTier } from '@sizzle/shared';
import { optionalAuth, requireAuth } from '../middleware/auth';
import { supabaseAdmin } from '../lib/supabase';
import { dbFail } from '../lib/errors';
import { relativeTime } from '../lib/format';
import { buildCards, loadBlockedIds, loadMutedIds, type RecipeRow } from '../mappers';
import { rankRecipes, type ViewerSignals } from '../services/ranking';
import { normalizeTag } from '../services/hashtags';
import type { AppEnv } from '../types';

interface FeedItem {
  card: RecipeCard;
  sortTime: string;
}

/**
 * Remove recipes by private cooks the viewer doesn't follow, before ranking or
 * impression-logging. buildCards enforces the same rule on the final response;
 * doing it up front keeps private posts from consuming ranked slots or leaving
 * impression rows for content the viewer never sees.
 */
async function dropUnfollowedPrivate(rows: RecipeRow[], viewerId: string | undefined): Promise<RecipeRow[]> {
  if (!rows.length) return rows;
  const cookIds = [...new Set(rows.map((r) => r.cook_id))];
  const { data: privs } = await supabaseAdmin.from('profiles').select('id').eq('private', true).in('id', cookIds);
  const privateSet = new Set((privs ?? []).map((p) => p.id as string));
  if (!privateSet.size) return rows;
  let followed = new Set<string>();
  if (viewerId) {
    const { data: f } = await supabaseAdmin.from('follows').select('cook_id').eq('follower_id', viewerId).in('cook_id', [...privateSet]);
    followed = new Set((f ?? []).map((x) => x.cook_id as string));
  }
  return rows.filter((r) => !privateSet.has(r.cook_id) || r.cook_id === viewerId || followed.has(r.cook_id));
}

/** Build feed items for the recent reposts of a set of users (mutual friends). */
async function buildRepostItems(viewerId: string, reposterIds: string[]): Promise<FeedItem[]> {
  if (reposterIds.length === 0) return [];
  const { data: reposts } = await supabaseAdmin
    .from('reposts')
    .select('*')
    .in('user_id', reposterIds)
    .order('created_at', { ascending: false })
    .limit(PAGE);
  const rp = reposts ?? [];
  if (rp.length === 0) return [];

  const recipeIds = [...new Set(rp.map((r) => r.recipe_id as string))];
  const { data: recRows } = await supabaseAdmin.from('recipes').select('*').in('id', recipeIds).eq('status', 'published');
  const rowMap = new Map<string, RecipeRow>((recRows ?? []).map((r) => [r.id as string, r as RecipeRow]));
  const { data: reposters } = await supabaseAdmin.from('profiles').select('id, display_name, handle, verified_tier').in('id', reposterIds);
  const reposterMap = new Map((reposters ?? []).map((p) => [p.id as string, p]));

  const cards = await buildCards(supabaseAdmin, viewerId, [...rowMap.values()]);
  const cardById = new Map(cards.map((c) => [c.id, c]));

  const items: FeedItem[] = [];
  for (const r of rp) {
    const base = cardById.get(r.recipe_id as string);
    const by = reposterMap.get(r.user_id as string);
    if (!base || !by) continue; // recipe unpublished / banned cook / dropped
    items.push({
      card: {
        ...base,
        repost: {
          byId: r.user_id as string,
          byName: by.display_name as string,
          byHandle: by.handle as string,
          byVerifiedTier: (by.verified_tier as VerificationTier | null) ?? null,
          comment: (r.comment as string) ?? null,
          time: relativeTime(new Date(r.created_at as string)),
        },
      },
      sortTime: r.created_at as string,
    });
  }
  return items;
}

export const feed = new Hono<AppEnv>();

const PAGE = 10;
/** Candidate window the ranker scores over. */
const CANDIDATES = 60;

/** Load the viewer's engagement signals for ranking. */
async function loadViewerSignals(userId: string): Promise<ViewerSignals> {
  const [profile, follows, reactions, saves, views, impressions, boosted] = await Promise.all([
    supabaseAdmin.from('profiles').select('tastes').eq('id', userId).maybeSingle(),
    supabaseAdmin.from('follows').select('cook_id').eq('follower_id', userId).limit(2000),
    // Cap lifetime engagement to a recent window — the ranker only needs recent
    // signals, and reading a heavy user's ENTIRE reaction/save history on every
    // For You first page (then piping it into the .in() below) was both slow and a
    // latent URL bomb. Ordered newest-first so the window is the most relevant.
    supabaseAdmin.from('reactions').select('recipe_id, kind').eq('user_id', userId).order('created_at', { ascending: false }).limit(300),
    supabaseAdmin.from('saves').select('recipe_id').eq('user_id', userId).order('created_at', { ascending: false }).limit(300),
    supabaseAdmin.from('recipe_views').select('recipe_id, skipped, completed').eq('user_id', userId).order('created_at', { ascending: false }).limit(200),
    supabaseAdmin.from('recipe_impressions').select('recipe_id').eq('user_id', userId).order('served_at', { ascending: false }).limit(200),
    // Admin-boosted creators (tiny set — only those an admin has lifted).
    supabaseAdmin.from('profiles').select('id, boost').gt('boost', 0),
  ]);

  // Resolve cook + tags for each engaged recipe.
  const engaged = new Set<string>();
  for (const r of reactions.data ?? []) engaged.add(r.recipe_id as string);
  for (const s of saves.data ?? []) engaged.add(s.recipe_id as string);
  for (const v of views.data ?? []) engaged.add(v.recipe_id as string);
  const cookOf = new Map<string, string>();
  const tagsOf = new Map<string, string[]>();
  if (engaged.size) {
    // Chunk the id list — a single .in() with hundreds of UUIDs overruns the
    // PostgREST URL limit and 400s. The previous code ignored that error, so a
    // heavy user's personalization silently died. Chunk + surface failures.
    const ids = [...engaged];
    const CHUNK = 150;
    for (let i = 0; i < ids.length; i += CHUNK) {
      const batch = ids.slice(i, i + CHUNK);
      const { data: recs, error: recErr } = await supabaseAdmin.from('recipes').select('id, cook_id, tags').in('id', batch);
      if (recErr) { console.error('[feed] engaged-recipe lookup failed', { userId, err: recErr.message }); continue; }
      for (const r of recs ?? []) {
        cookOf.set(r.id as string, r.cook_id as string);
        tagsOf.set(r.id as string, (r.tags ?? []) as string[]);
      }
    }
  }

  const affinity = new Map<string, number>();
  const tagAffinity = new Map<string, number>();
  const dislikedCooks = new Set<string>();
  const skips = new Map<string, number>();
  const bump = (cook: string | undefined, n = 1) => {
    if (cook) affinity.set(cook, (affinity.get(cook) ?? 0) + n);
  };
  // A positive engagement also boosts that recipe's hashtags.
  const bumpTags = (recipeId: string, n = 1) => {
    for (const t of tagsOf.get(recipeId) ?? []) tagAffinity.set(t, (tagAffinity.get(t) ?? 0) + n);
  };
  for (const r of reactions.data ?? []) {
    const id = r.recipe_id as string;
    const cook = cookOf.get(id);
    if (r.kind === 'like') { bump(cook); bumpTags(id); }
    else if (cook) dislikedCooks.add(cook);
  }
  for (const s of saves.data ?? []) { bump(cookOf.get(s.recipe_id as string)); bumpTags(s.recipe_id as string); }
  for (const v of views.data ?? []) {
    const id = v.recipe_id as string;
    const cook = cookOf.get(id);
    if (v.completed) { bump(cook); bumpTags(id); }
    if (v.skipped && cook) skips.set(cook, (skips.get(cook) ?? 0) + 1);
  }

  return {
    tastes: ((profile.data?.tastes ?? []) as string[]).filter(Boolean),
    followedCooks: new Set((follows.data ?? []).map((f) => f.cook_id as string)),
    affinity,
    tagAffinity,
    dislikedCooks,
    impressed: new Set((impressions.data ?? []).map((i) => i.recipe_id as string)),
    skips,
    boosts: new Map((boosted.data ?? []).map((p) => [p.id as string, Number(p.boost)])),
  };
}

/**
 * GET /feed/for-you — ranked recommendations (Phase 4, Stage 1 heuristic).
 *
 * Authed first page: load the viewer's signals, score a recent candidate
 * window (recency + taste + follow + cook-affinity + popularity − seen − dislike
 * − skip), attenuate repeated cooks, log impressions. Guests / paginated:
 * recency. The RecipeCard response shape is the contract a learned model
 * (Stage 2) slots behind. See docs/recommendation-algorithm.md.
 */
feed.get('/for-you', optionalAuth, async (c) => {
  const cursor = c.req.query('cursor');
  const userId = c.get('userId');

  if (userId && !cursor) {
    const [signals, blocked, muted] = await Promise.all([
      loadViewerSignals(userId),
      loadBlockedIds(supabaseAdmin, userId),
      loadMutedIds(supabaseAdmin, userId),
    ]);
    const { data, error } = await supabaseAdmin
      .from('recipes')
      .select('*')
      .eq('status', 'published')
      .order('created_at', { ascending: false })
      .limit(CANDIDATES);
    if (error) throw dbFail(error.message);

    // Drop blocked + muted cooks BEFORE ranking/impressions so they neither
    // surface nor pollute the viewer's signal history. Private cooks the viewer
    // doesn't follow are dropped here too — otherwise they'd take ranked slots and
    // get impressions logged, only for buildCards to strip them from the response.
    const prelim = ((data ?? []) as RecipeRow[]).filter((r) => !blocked.has(r.cook_id) && !muted.has(r.cook_id));
    const candidates = await dropUnfollowedPrivate(prelim, userId);
    const ranked = rankRecipes(candidates, signals, Date.now()).slice(0, PAGE);
    if (ranked.length) {
      await supabaseAdmin.from('recipe_impressions').insert(ranked.map((r) => ({ user_id: userId, recipe_id: r.id })));
    }
    // Reuse the block set already loaded above so buildCards doesn't re-fetch it.
    const items = await buildCards(supabaseAdmin, userId, ranked, false, blocked);
    // Continue by recency from just before the candidate window so the feed keeps
    // loading past the ranked top-10 (page 2+ falls through to the recency branch).
    const raw = (data ?? []) as RecipeRow[];
    const nextCursor = raw.length >= CANDIDATES ? raw[raw.length - 1]!.created_at : null;
    return c.json<FeedResponse>({ items, nextCursor });
  }

  // Guests / pagination: recency, cursor-paginated.
  let q = supabaseAdmin
    .from('recipes')
    .select('*')
    .eq('status', 'published')
    .order('created_at', { ascending: false })
    .limit(PAGE + 1);
  if (cursor) q = q.lt('created_at', cursor);

  const { data, error } = await q;
  if (error) throw dbFail(error.message);

  let rows = (data ?? []) as RecipeRow[];
  // Authed pagination: drop muted cooks (blocked are dropped by buildCards).
  if (userId) {
    const muted = await loadMutedIds(supabaseAdmin, userId);
    if (muted.size) rows = rows.filter((r) => !muted.has(r.cook_id));
  }
  const hasMore = rows.length > PAGE;
  const page = rows.slice(0, PAGE);
  const items = await buildCards(supabaseAdmin, userId, page);
  const res: FeedResponse = { items, nextCursor: hasMore ? page[page.length - 1]!.created_at : null };
  // Guest feed is identical for everyone and was recomputed per request (no CDN
  // cache). Edge-cache it briefly — NEVER for an authed viewer (personalized).
  // Keyed by full URL, so cursor pages cache independently.
  if (!userId) c.header('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=120');
  return c.json(res);
});

/** GET /feed/trending-tags — most-used hashtags across recent published recipes.
 * Bounded to the last 30 days + a row cap so it can't grow into a full-table scan
 * as the catalog grows, and cached briefly so repeated Discover visits don't re-scan. */
feed.get('/trending-tags', optionalAuth, async (c) => {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabaseAdmin
    .from('recipes')
    .select('cook_id, tags')
    .eq('status', 'published')
    .gt('created_at', since)
    .order('created_at', { ascending: false })
    .limit(2000);
  if (error) throw dbFail(error.message);
  // Private cooks' hashtags must not surface in the public Discover trends.
  const cookIds = [...new Set((data ?? []).map((r) => r.cook_id as string))];
  let privateSet = new Set<string>();
  if (cookIds.length) {
    const { data: privs } = await supabaseAdmin.from('profiles').select('id').eq('private', true).in('id', cookIds);
    privateSet = new Set((privs ?? []).map((p) => p.id as string));
  }
  const counts = new Map<string, number>();
  for (const r of data ?? []) {
    if (privateSet.has(r.cook_id as string)) continue;
    for (const t of (r.tags ?? []) as string[]) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  const top: TrendingTag[] = [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
    .slice(0, 12);
  c.header('Cache-Control', 'public, max-age=300');
  return c.json(top);
});

/** GET /feed/tag/:tag — published recipes carrying a hashtag (cursor-paginated). */
feed.get('/tag/:tag', optionalAuth, async (c) => {
  const userId = c.get('userId');
  const tag = normalizeTag(c.req.param('tag'));
  if (!tag) return c.json<FeedResponse>({ items: [], nextCursor: null });

  const cursor = c.req.query('cursor');
  let q = supabaseAdmin
    .from('recipes')
    .select('*')
    .eq('status', 'published')
    .contains('tags', [tag])
    .order('created_at', { ascending: false })
    .limit(PAGE + 1);
  if (cursor) q = q.lt('created_at', cursor);

  const { data, error } = await q;
  if (error) throw dbFail(error.message);
  const rows = (data ?? []) as RecipeRow[];
  const hasMore = rows.length > PAGE;
  const page = rows.slice(0, PAGE);
  const items = await buildCards(supabaseAdmin, userId, page);
  return c.json<FeedResponse>({ items, nextCursor: hasMore ? page[page.length - 1]!.created_at : null });
});

/**
 * GET /feed/following — recipes from cooks you follow, plus **reposts from
 * mutual-follow friends** (you follow them and they follow you), merged
 * newest-first. Reposts appear on the first page only.
 */
feed.get('/following', requireAuth, async (c) => {
  const userId = c.get('userId')!;
  const cursor = c.req.query('cursor');

  // Followed cooks' published recipes via a server-side join RPC. NEVER fetch the
  // follow list into JS and pipe it through a PostgREST .in() — that URL 400s at
  // ~690 follows. Muted/blocked cooks (either direction) are excluded in the RPC.
  const { data, error } = await supabaseAdmin.rpc('following_feed_recipes', {
    p_user: userId,
    p_cursor: cursor ?? null,
    p_limit: PAGE + 1,
  });
  if (error) throw dbFail(error.message);
  const rows = (data ?? []) as RecipeRow[];
  const hasMore = rows.length > PAGE;
  const pageRows = rows.slice(0, PAGE);
  const recipeCards = await buildCards(supabaseAdmin, userId, pageRows);
  const cardById = new Map(recipeCards.map((card) => [card.id, card]));
  const recipeItems: FeedItem[] = pageRows
    .map((r) => ({ card: cardById.get(r.id), sortTime: r.created_at }))
    .filter((x): x is FeedItem => !!x.card);

  // Reposts from mutual-follow friends (first page only) — mutual set via RPC so we
  // don't fetch both the full follows and full followers lists into JS.
  let repostItems: FeedItem[] = [];
  if (!cursor) {
    const { data: mutuals } = await supabaseAdmin.rpc('mutual_follow_ids', { p_user: userId });
    const mutual = (mutuals ?? []).map((m: { cook_id: string }) => m.cook_id);
    repostItems = await buildRepostItems(userId, mutual);
  }

  // Merge newest-first, dedup by recipe so a followed-cook post that a friend
  // also reposted shows once (keeping the newer surface). Reposts are ADDITIVE —
  // they're not sliced against the recipe page size, so no followed-cook post is
  // ever pushed out of page 1 and then skipped by the cursor (which tracks the
  // recipe stream). Reposts appear on the first page only.
  const seen = new Set<string>();
  const items = [...recipeItems, ...repostItems]
    .sort((a, b) => (a.sortTime < b.sortTime ? 1 : a.sortTime > b.sortTime ? -1 : 0))
    .filter((it) => (seen.has(it.card.id) ? false : seen.add(it.card.id)))
    .map((it) => it.card);

  const nextCursor = hasMore && pageRows.length ? pageRows[pageRows.length - 1]!.created_at : null;
  return c.json<FeedResponse>({ items, nextCursor });
});
