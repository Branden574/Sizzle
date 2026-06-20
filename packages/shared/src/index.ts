/**
 * Sizzle API contract — shared DTOs.
 *
 * These are the shapes the API returns and the web client consumes. They are
 * designed to map cleanly onto the existing front-end view models (see the
 * web app's `types.ts`), with two deliberate evolutions from the prototype:
 *   - counts are integers (the client formats them), not pre-formatted strings;
 *   - a recipe's poster/playback comes from a `video` asset, not a CSS gradient
 *     (the gradient survives only as a loading fallback, `avatarColor`/`bg`).
 */

export type ReactionKind = 'like' | 'dislike';

export type VideoStatus = 'pending' | 'uploading' | 'processing' | 'ready' | 'error';

/** Minimal cook info embedded in feed/recipe cards. */
export interface CookSummary {
  id: string;
  name: string;
  handle: string;
  /** Monogram fallback, e.g. "MP". */
  init: string;
  /** CSS gradient used as the avatar fallback when there's no image. */
  avatarColor: string;
  avatarUrl: string | null;
}

export interface VideoAssetDTO {
  status: VideoStatus;
  /** Adaptive HLS manifest (null until `ready`). */
  hlsUrl: string | null;
  /** Poster/thumbnail still (null until `ready`). */
  posterUrl: string | null;
  /** Seconds (null until known). */
  duration: number | null;
}

export interface RecipeCounts {
  likes: number;
  dislikes: number;
  comments: number;
  shares: number;
}

/** The viewer's relationship to a recipe/cook (all false for guests). */
export interface RecipeViewerState {
  liked: boolean;
  disliked: boolean;
  saved: boolean;
  downloaded: boolean;
  following: boolean;
}

/** Creator post controls. `*Enabled`/`*Visible` so the UI reads them positively. */
export interface PostControls {
  likesEnabled: boolean;
  commentsEnabled: boolean;
  countsVisible: boolean;
}

/** A recipe as shown in a feed / grid card. */
export interface RecipeCard {
  id: string;
  title: string;
  cuisine: string;
  /** Human label, e.g. "25 min" (derived from `timeMinutes`). */
  time: string;
  timeMinutes: number;
  servings: number;
  level: string;
  /** Gradient fallback poster (used while `video` is not ready). */
  bg: string;
  cook: CookSummary;
  video: VideoAssetDTO | null;
  counts: RecipeCounts;
  viewer: RecipeViewerState;
  controls: PostControls;
}

/** Full recipe detail (card + ingredients + ordered method). */
export interface RecipeDetail extends RecipeCard {
  ingredients: string[];
  steps: string[];
}

export interface CommentDTO {
  id: string;
  authorName: string;
  authorInit: string;
  authorColor: string;
  authorAvatarUrl: string | null;
  text: string;
  /** Relative label, e.g. "2h". */
  time: string;
  createdAt: string;
  likes: number;
}

/** A cook recommended during onboarding, ranked by taste overlap. */
export interface SuggestedCook extends CookSummary {
  bio: string;
  /** Which of the viewer's selected tastes this cook matched. */
  matched: string[];
}

export interface CookProfile {
  id: string;
  name: string;
  handle: string;
  init: string;
  avatarColor: string;
  avatarUrl: string | null;
  bio: string;
  counts: {
    followers: number;
    following: number;
    likes: number;
    recipes: number;
  };
  viewer: { following: boolean };
  recipes: RecipeCard[];
}

/** The signed-in user's own profile. */
export interface MeProfile {
  id: string;
  name: string;
  handle: string;
  init: string;
  avatarColor: string;
  avatarUrl: string | null;
  bio: string;
  isCook: boolean;
  counts: {
    following: number;
    followers: number;
    saved: number;
  };
  tastes: string[];
}

export interface Paginated<T> {
  items: T[];
  nextCursor: string | null;
}

export type FeedResponse = Paginated<RecipeCard>;

/** Body for creating a recipe after its video upload is registered. */
export interface CreateRecipeInput {
  videoAssetId: string;
  title: string;
  cuisine: string;
  timeMinutes: number;
  servings: number;
  level: string;
  ingredients: string[];
  steps: string[];
}

/** Response from requesting a direct (client-side) video upload. */
export interface DirectUploadTicket {
  videoAssetId: string;
  /** One-time URL the client uploads bytes to (Cloudflare Stream, or mock). */
  uploadUrl: string;
  /** "cloudflare" | "mock" — so the client knows the upload protocol. */
  provider: string;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}
