import type { SupabaseClient } from '@supabase/supabase-js';
import type { CommentDTO, CookSummary, ProfileLinks, RecipeCard, RecipeViewerState, VideoAssetDTO } from '@sizzle/shared';
import { formatTimeLabel, initialsOf, relativeTime } from './lib/format';

/** Map a profile row's social-link columns to the ProfileLinks DTO. */
export function profileLinks(p: ProfileRow): ProfileLinks {
  return {
    instagram: p.instagram_url ?? null,
    tiktok: p.tiktok_url ?? null,
    x: p.x_url ?? null,
    facebook: p.facebook_url ?? null,
    discord: p.discord_url ?? null,
    youtube: p.youtube_url ?? null,
    website: p.website_url ?? null,
  };
}

export interface CommentRow {
  id: string;
  recipe_id: string;
  author_id: string;
  text: string;
  like_count: number;
  parent_id: string | null;
  reply_count: number;
  created_at: string;
  hidden?: boolean;
  pinned?: boolean;
}

export function commentDTO(row: CommentRow, author: ProfileRow | undefined, likedSet?: Set<string>): CommentDTO {
  const name = author?.display_name ?? 'cook';
  return {
    id: row.id,
    authorId: row.author_id,
    authorName: name,
    authorInit: initialsOf(name),
    authorColor: author?.avatar_color ?? 'linear-gradient(135deg,#3a2a22,#1b1512)',
    authorAvatarUrl: author?.avatar_url ?? null,
    text: row.text,
    time: relativeTime(new Date(row.created_at)),
    createdAt: row.created_at,
    likes: row.like_count,
    likedByMe: likedSet ? likedSet.has(row.id) : false,
    parentId: row.parent_id ?? null,
    replyCount: row.reply_count ?? 0,
    pinned: row.pinned ?? false,
    // Per-viewer: the route coerces this to false for non-moderator viewers so a
    // shadow-hidden comment never reveals its state to its own author.
    hidden: row.hidden ?? false,
  };
}

export interface ProfileRow {
  id: string;
  handle: string;
  display_name: string;
  bio: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  avatar_color: string;
  phone: string | null;
  is_cook: boolean;
  follower_count: number;
  following_count: number;
  total_likes: number;
  tastes: string[] | null;
  verified_tier: 'blue' | 'gold' | null;
  role: 'user' | 'admin';
  boost: number;
  banned: boolean;
  /** Private account: content visible to accepted followers only. */
  private: boolean;
  banned_reason: string | null;
  delete_at: string | null;
  ban_appeal_status: 'none' | 'pending' | 'denied';
  ban_appeal_text: string | null;
  instagram_url: string | null;
  tiktok_url: string | null;
  x_url: string | null;
  facebook_url: string | null;
  discord_url: string | null;
  youtube_url: string | null;
  website_url: string | null;
  monetization_status: string | null;
  sub_price_cents: number | null;
}

export interface RecipeRow {
  id: string;
  cook_id: string;
  title: string;
  cuisine: string;
  time_minutes: number;
  servings: number;
  level: string;
  bg: string;
  video_asset_id: string | null;
  image_urls: string[] | null;
  status: string;
  like_count: number;
  dislike_count: number;
  comment_count: number;
  save_count: number;
  share_count: number;
  caption: string | null;
  tags: string[] | null;
  post_type: string | null;
  rating: number | null;
  removal_reason: string | null;
  appeal_status: string | null;
  auto_hidden: boolean;
  likes_enabled: boolean | null;
  comments_enabled: boolean | null;
  counts_visible: boolean | null;
  price_cents: number | null;
  visibility: string | null;
  /** Qualified cooks — distinct users who finished this recipe in cook mode. */
  cook_count: number | null;
  /** Send-to-friend count (DM shares) — the sends-per-reach ranking signal. */
  send_count: number | null;
  /** Lineage: the recipe this post was cooked from ("Cook this"). */
  origin_recipe_id: string | null;
  created_at: string;
}

export interface VideoRow {
  id: string;
  status: string;
  hls_url: string | null;
  mp4_url: string | null;
  poster_url: string | null;
  duration_seconds: number | null;
}


export function cookSummary(p: ProfileRow): CookSummary {
  return {
    id: p.id,
    name: p.display_name,
    handle: p.handle,
    init: initialsOf(p.display_name || p.handle),
    avatarColor: p.avatar_color,
    avatarUrl: p.avatar_url,
    verifiedTier: p.verified_tier,
    subPriceCents: p.monetization_status === 'active' ? (p.sub_price_cents ?? null) : null,
  };
}

export function videoDTO(v: VideoRow | null | undefined): VideoAssetDTO | null {
  if (!v) return null;
  // Only hand playback URLs to the client once the asset is READY. Cloudflare
  // populates hls_url early (while still transcoding), but its manifest returns
  // 500 until the stream is actually ready — so exposing the URL made the player
  // load a dead stream ("won't play, tapped 5 times"). Null until ready → the
  // client shows a "processing" state instead of a broken player, and the card
  // upgrades to playable once status flips to 'ready'.
  const ready = v.status === 'ready';
  return {
    status: v.status as VideoAssetDTO['status'],
    hlsUrl: ready ? v.hls_url : null,
    mp4Url: ready ? v.mp4_url : null,
    posterUrl: v.poster_url,
    duration: v.duration_seconds,
  };
}

interface ViewerCtx {
  likes: Set<string>;
  dislikes: Set<string>;
  saves: Set<string>;
  downloads: Set<string>;
  follows: Set<string>;
  reposts: Set<string>;
  /** Premium recipes the viewer has unlocked (one-off purchase). */
  unlocked: Set<string>;
  /** Creators the viewer actively subscribes to (grants access to their premium recipes). */
  subscribedTo: Set<string>;
}

function emptyViewer(): ViewerCtx {
  return { likes: new Set(), dislikes: new Set(), saves: new Set(), downloads: new Set(), follows: new Set(), reposts: new Set(), unlocked: new Set(), subscribedTo: new Set() };
}

/** Batch-load the viewer's like/dislike/save/follow state for a page of recipes. */
async function loadViewerCtx(
  db: SupabaseClient,
  viewerId: string | undefined,
  recipeIds: string[],
  cookIds: string[],
): Promise<ViewerCtx> {
  const ctx = emptyViewer();
  if (!viewerId) return ctx;

  // All seven lookups are independent — fetch them in parallel (same data, one
  // round-trip instead of seven). Empty id lists short-circuit to a null result
  // so we skip the query entirely, preserving the old per-block guards.
  const [reactions, saves, downloads, reposts, unlocks, follows, subs] = await Promise.all([
    recipeIds.length ? db.from('reactions').select('recipe_id, kind').eq('user_id', viewerId).in('recipe_id', recipeIds) : Promise.resolve({ data: null }),
    recipeIds.length ? db.from('saves').select('recipe_id').eq('user_id', viewerId).in('recipe_id', recipeIds) : Promise.resolve({ data: null }),
    recipeIds.length ? db.from('downloads').select('recipe_id').eq('user_id', viewerId).in('recipe_id', recipeIds) : Promise.resolve({ data: null }),
    recipeIds.length ? db.from('reposts').select('recipe_id').eq('user_id', viewerId).in('recipe_id', recipeIds) : Promise.resolve({ data: null }),
    recipeIds.length ? db.from('recipe_unlocks').select('recipe_id').eq('user_id', viewerId).in('recipe_id', recipeIds) : Promise.resolve({ data: null }),
    cookIds.length ? db.from('follows').select('cook_id').eq('follower_id', viewerId).in('cook_id', cookIds) : Promise.resolve({ data: null }),
    cookIds.length ? db.from('subscriptions').select('creator_id').eq('subscriber_id', viewerId).eq('status', 'active').in('creator_id', cookIds) : Promise.resolve({ data: null }),
  ]);

  for (const r of reactions.data ?? []) (r.kind === 'like' ? ctx.likes : ctx.dislikes).add(r.recipe_id as string);
  for (const s of saves.data ?? []) ctx.saves.add(s.recipe_id as string);
  for (const d of downloads.data ?? []) ctx.downloads.add(d.recipe_id as string);
  for (const rp of reposts.data ?? []) ctx.reposts.add(rp.recipe_id as string);
  for (const u of unlocks.data ?? []) ctx.unlocked.add(u.recipe_id as string);
  for (const f of follows.data ?? []) ctx.follows.add(f.cook_id as string);
  for (const s of subs.data ?? []) ctx.subscribedTo.add(s.creator_id as string);
  return ctx;
}

function viewerState(recipeId: string, cookId: string, ctx: ViewerCtx): RecipeViewerState {
  return {
    liked: ctx.likes.has(recipeId),
    disliked: ctx.dislikes.has(recipeId),
    saved: ctx.saves.has(recipeId),
    downloaded: ctx.downloads.has(recipeId),
    following: ctx.follows.has(cookId),
    reposted: ctx.reposts.has(recipeId),
  };
}

function toCard(r: RecipeRow, cook: ProfileRow, video: VideoRow | null, ctx: ViewerCtx, viewerId?: string, origin?: RecipeCard['origin']): RecipeCard {
  // Premium gating: a priced recipe is locked unless you own it, unlocked it, or
  // subscribe to the creator. Locked cards keep their poster but never expose the
  // playable video or photos (the detail route also withholds ingredients/steps).
  const price = r.price_cents ?? null;
  const isOwner = r.cook_id === viewerId;
  const subscribed = ctx.subscribedTo.has(r.cook_id);
  // Subscribers-only: locked for everyone but the owner and active subscribers.
  const subscribersOnly = r.visibility === 'subscribers' && !isOwner && !subscribed;
  // Premium price: subscribers get it for free (subscription already grants access).
  const premiumLocked = price != null && !isOwner && !ctx.unlocked.has(r.id) && !subscribed;
  const locked = subscribersOnly || premiumLocked;
  const dto = videoDTO(video);
  return {
    id: r.id,
    title: r.title,
    cuisine: r.cuisine,
    time: formatTimeLabel(r.time_minutes),
    timeMinutes: r.time_minutes,
    servings: r.servings,
    level: r.level,
    bg: r.bg,
    cook: cookSummary(cook),
    video: locked && dto ? { ...dto, hlsUrl: null, mp4Url: null } : dto,
    images: locked ? [] : r.image_urls ?? [],
    counts: { likes: r.like_count, dislikes: r.dislike_count, comments: r.comment_count, saves: r.save_count, shares: r.share_count, cooks: r.cook_count ?? 0 },
    viewer: viewerState(r.id, r.cook_id, ctx),
    controls: {
      likesEnabled: r.likes_enabled ?? true,
      commentsEnabled: r.comments_enabled ?? true,
      countsVisible: r.counts_visible ?? true,
    },
    hashtags: r.tags ?? [],
    postType: (r.post_type as RecipeCard['postType']) ?? 'recipe',
    rating: r.rating ?? null,
    // Moderation fields only ever reach the owner (removed posts are hidden from others).
    removed: r.status === 'removed',
    removalReason: r.removal_reason ?? null,
    appealStatus: (r.appeal_status as RecipeCard['appealStatus']) ?? 'none',
    autoHidden: r.auto_hidden ?? false,
    price,
    locked,
    subscribersOnly,
    visibility: (r.visibility === 'subscribers' ? 'subscribers' : 'public'),
    repost: null,
    origin: origin ?? null,
  };
}

/**
 * Turn raw recipe rows into RecipeCards, batch-loading cooks, video assets and
 * the viewer's interaction state (no N+1). `db` should be the service-role
 * client; `viewerId` is undefined for guests.
 */
/**
 * Ids the viewer can't see, from blocks in EITHER direction (they blocked me, or
 * I blocked them). Used as a hard filter on every surface that lists users or
 * their content — the single source of truth for block visibility.
 */
export async function loadBlockedIds(db: SupabaseClient, viewerId: string | undefined): Promise<Set<string>> {
  if (!viewerId) return new Set();
  const [{ data: outgoing }, { data: incoming }] = await Promise.all([
    db.from('user_blocks').select('blocked_id').eq('blocker_id', viewerId),
    db.from('user_blocks').select('blocker_id').eq('blocked_id', viewerId),
  ]);
  const s = new Set<string>();
  for (const r of outgoing ?? []) s.add(r.blocked_id as string);
  for (const r of incoming ?? []) s.add(r.blocker_id as string);
  return s;
}

/** Cooks the viewer has muted (one-directional). Applied to the feed only. */
export async function loadMutedIds(db: SupabaseClient, viewerId: string | undefined): Promise<Set<string>> {
  if (!viewerId) return new Set();
  const { data } = await db.from('user_mutes').select('muted_id').eq('muter_id', viewerId);
  return new Set((data ?? []).map((r) => r.muted_id as string));
}

/**
 * True when `viewerId` may see `cookId`'s content (recipes, comments, live,
 * products, tiers). Public cooks: always. Private cooks: the owner, accepted
 * followers, and admins only. Every content endpoint that does NOT flow through
 * buildCards (comments, interactions, live, monetize, product/tier listings)
 * must call this — buildCards enforces the same rule for card lists.
 * Short-circuits with one query in the common (public) case.
 */
export async function canViewCookContent(
  db: SupabaseClient,
  cookId: string,
  viewerId: string | undefined,
  viewerIsAdmin = false,
): Promise<boolean> {
  const { data: owner } = await db.from('profiles').select('private').eq('id', cookId).maybeSingle();
  if (!owner?.private) return true;
  if (!viewerId) return false;
  if (viewerId === cookId || viewerIsAdmin) return true;
  const { data: f } = await db.from('follows').select('cook_id').eq('follower_id', viewerId).eq('cook_id', cookId).maybeSingle();
  return !!f;
}

export async function buildCards(db: SupabaseClient, viewerId: string | undefined, rows: RecipeRow[], viewerIsAdmin = false, preBlocked?: Set<string>): Promise<RecipeCard[]> {
  if (rows.length === 0) return [];

  const cookIds = [...new Set(rows.map((r) => r.cook_id))];
  const videoIds = rows.map((r) => r.video_asset_id).filter((x): x is string => !!x);

  // Callers that already loaded the viewer's block set (e.g. the for-you feed) can
  // thread it in via preBlocked to avoid re-fetching it; otherwise load it here.
  const [{ data: cooks }, blocked] = await Promise.all([
    db.from('profiles').select('*').in('id', cookIds),
    preBlocked ? Promise.resolve(preBlocked) : loadBlockedIds(db, viewerId),
  ]);
  const cookMap = new Map<string, ProfileRow>((cooks ?? []).map((c) => [c.id as string, c as ProfileRow]));

  const videoMap = new Map<string, VideoRow>();
  if (videoIds.length) {
    const { data: vids } = await db.from('video_assets').select('id,status,hls_url,mp4_url,poster_url,duration_seconds').in('id', videoIds);
    for (const v of vids ?? []) videoMap.set(v.id as string, v as VideoRow);
  }

  const ctx = await loadViewerCtx(db, viewerId, rows.map((r) => r.id), cookIds);

  // Lineage credit chips: batch-load the origin recipes ("Cook this" sources)
  // for any cards that have one — title + author handle, two small queries.
  const originIds = [...new Set(rows.map((r) => r.origin_recipe_id).filter((x): x is string => !!x))];
  const originMap = new Map<string, { id: string; title: string; cookHandle: string }>();
  if (originIds.length) {
    const { data: origins } = await db.from('recipes').select('id, title, cook_id, status').in('id', originIds);
    const originCookIds = [...new Set((origins ?? []).map((o) => o.cook_id as string))];
    const { data: originCooks } = originCookIds.length
      ? await db.from('profiles').select('id, handle, banned').in('id', originCookIds)
      : { data: [] as { id: string; handle: string; banned: boolean }[] };
    const handleById = new Map((originCooks ?? []).filter((p) => !p.banned).map((p) => [p.id as string, p.handle as string]));
    for (const o of origins ?? []) {
      if (o.status !== 'published') continue; // no credit chips to unpublished/removed sources
      const handle = handleById.get(o.cook_id as string);
      if (handle) originMap.set(o.id as string, { id: o.id as string, title: o.title as string, cookHandle: handle });
    }
  }

  const cards: RecipeCard[] = [];
  for (const r of rows) {
    const cook = cookMap.get(r.cook_id);
    if (!cook || cook.banned) continue; // banned creators' content is hidden everywhere
    if (blocked.has(r.cook_id)) continue; // blocked in either direction — hidden everywhere
    // Private account: content is visible only to accepted followers (and the
    // owner/admins). Enforced here — the choke point every card-serving route
    // (feed, search, hashtags, profile, collections) flows through.
    if (cook.private && r.cook_id !== viewerId && !ctx.follows.has(r.cook_id) && !viewerIsAdmin) continue;
    // Auto-hidden (pending review) and removed posts are visible only to their
    // owner — and to admins, so moderators can open the exact content to review.
    if ((r.auto_hidden || r.status === 'removed') && r.cook_id !== viewerId && !viewerIsAdmin) continue;
    cards.push(toCard(
      r,
      cook,
      r.video_asset_id ? videoMap.get(r.video_asset_id) ?? null : null,
      ctx,
      viewerId,
      r.origin_recipe_id ? originMap.get(r.origin_recipe_id) : undefined,
    ));
  }
  return cards;
}
