import type { SupabaseClient } from '@supabase/supabase-js';
import type { CommentDTO, CookSummary, PostControls, RecipeCard, RecipeViewerState, VideoAssetDTO } from '@sizzle/shared';
import { formatTimeLabel, initialsOf, relativeTime } from './lib/format';

export interface CommentRow {
  id: string;
  recipe_id: string;
  author_id: string;
  text: string;
  like_count: number;
  created_at: string;
}

export function commentDTO(row: CommentRow, author: ProfileRow | undefined): CommentDTO {
  const name = author?.display_name ?? 'cook';
  return {
    id: row.id,
    authorName: name,
    authorInit: initialsOf(name),
    authorColor: author?.avatar_color ?? 'linear-gradient(135deg,#3a2a22,#1b1512)',
    authorAvatarUrl: author?.avatar_url ?? null,
    text: row.text,
    time: relativeTime(new Date(row.created_at)),
    createdAt: row.created_at,
    likes: row.like_count,
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
  status: string;
  like_count: number;
  dislike_count: number;
  comment_count: number;
  save_count: number;
  share_count: number;
  created_at: string;
}

export interface VideoRow {
  id: string;
  status: string;
  hls_url: string | null;
  poster_url: string | null;
  duration_seconds: number | null;
}

// Counts are visible to everyone by default; a creator can still hide them on
// their own post via the per-post "Show counts" control (client-local for now).
const DEFAULT_CONTROLS: PostControls = { likesEnabled: true, commentsEnabled: true, countsVisible: true };

export function cookSummary(p: ProfileRow): CookSummary {
  return {
    id: p.id,
    name: p.display_name,
    handle: p.handle,
    init: initialsOf(p.display_name || p.handle),
    avatarColor: p.avatar_color,
    avatarUrl: p.avatar_url,
  };
}

export function videoDTO(v: VideoRow | null | undefined): VideoAssetDTO | null {
  if (!v) return null;
  return {
    status: v.status as VideoAssetDTO['status'],
    hlsUrl: v.hls_url,
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
}

function emptyViewer(): ViewerCtx {
  return { likes: new Set(), dislikes: new Set(), saves: new Set(), downloads: new Set(), follows: new Set() };
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

  if (recipeIds.length) {
    const { data: reactions } = await db.from('reactions').select('recipe_id, kind').eq('user_id', viewerId).in('recipe_id', recipeIds);
    for (const r of reactions ?? []) (r.kind === 'like' ? ctx.likes : ctx.dislikes).add(r.recipe_id as string);
    const { data: saves } = await db.from('saves').select('recipe_id').eq('user_id', viewerId).in('recipe_id', recipeIds);
    for (const s of saves ?? []) ctx.saves.add(s.recipe_id as string);
    const { data: downloads } = await db.from('downloads').select('recipe_id').eq('user_id', viewerId).in('recipe_id', recipeIds);
    for (const d of downloads ?? []) ctx.downloads.add(d.recipe_id as string);
  }
  if (cookIds.length) {
    const { data: follows } = await db.from('follows').select('cook_id').eq('follower_id', viewerId).in('cook_id', cookIds);
    for (const f of follows ?? []) ctx.follows.add(f.cook_id as string);
  }
  return ctx;
}

function viewerState(recipeId: string, cookId: string, ctx: ViewerCtx): RecipeViewerState {
  return {
    liked: ctx.likes.has(recipeId),
    disliked: ctx.dislikes.has(recipeId),
    saved: ctx.saves.has(recipeId),
    downloaded: ctx.downloads.has(recipeId),
    following: ctx.follows.has(cookId),
  };
}

function toCard(r: RecipeRow, cook: ProfileRow, video: VideoRow | null, ctx: ViewerCtx): RecipeCard {
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
    video: videoDTO(video),
    counts: { likes: r.like_count, dislikes: r.dislike_count, comments: r.comment_count, saves: r.save_count, shares: r.share_count },
    viewer: viewerState(r.id, r.cook_id, ctx),
    controls: DEFAULT_CONTROLS,
  };
}

/**
 * Turn raw recipe rows into RecipeCards, batch-loading cooks, video assets and
 * the viewer's interaction state (no N+1). `db` should be the service-role
 * client; `viewerId` is undefined for guests.
 */
export async function buildCards(db: SupabaseClient, viewerId: string | undefined, rows: RecipeRow[]): Promise<RecipeCard[]> {
  if (rows.length === 0) return [];

  const cookIds = [...new Set(rows.map((r) => r.cook_id))];
  const videoIds = rows.map((r) => r.video_asset_id).filter((x): x is string => !!x);

  const { data: cooks } = await db.from('profiles').select('*').in('id', cookIds);
  const cookMap = new Map<string, ProfileRow>((cooks ?? []).map((c) => [c.id as string, c as ProfileRow]));

  const videoMap = new Map<string, VideoRow>();
  if (videoIds.length) {
    const { data: vids } = await db.from('video_assets').select('id,status,hls_url,poster_url,duration_seconds').in('id', videoIds);
    for (const v of vids ?? []) videoMap.set(v.id as string, v as VideoRow);
  }

  const ctx = await loadViewerCtx(db, viewerId, rows.map((r) => r.id), cookIds);

  const cards: RecipeCard[] = [];
  for (const r of rows) {
    const cook = cookMap.get(r.cook_id);
    if (!cook) continue;
    cards.push(toCard(r, cook, r.video_asset_id ? videoMap.get(r.video_asset_id) ?? null : null, ctx));
  }
  return cards;
}
