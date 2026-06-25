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

/**
 * Upload limits. The web client enforces these before upload; the API mirrors
 * the duration cap as a literal (it imports only types from this package, so it
 * can't read these at runtime). Supabase storage `file_size_limit` in
 * config.toml must be >= MAX_UPLOAD_BYTES.
 */
export const MAX_DURATION_SECONDS = 1800; // 30 minutes
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024 * 1024; // 5 GiB — headroom for 4K/30-min
/** Longest supported side for a 4K upload (UHD 3840×2160 / DCI 4096). */
export const MAX_VIDEO_LONG_SIDE = 4096;

/** Verification badge: blue at 100k followers, animated gold at 1M. */
export type VerificationTier = 'blue' | 'gold';

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
  /** Verification badge tier, or null if unverified. */
  verifiedTier: VerificationTier | null;
}

export interface VideoAssetDTO {
  status: VideoStatus;
  /** Adaptive HLS manifest (null until `ready`). */
  hlsUrl: string | null;
  /** Direct MP4 url (user uploads); plays natively. */
  mp4Url: string | null;
  /** Poster/thumbnail still (null until `ready`). */
  posterUrl: string | null;
  /** Seconds (null until known). */
  duration: number | null;
}

export interface RecipeCounts {
  likes: number;
  dislikes: number;
  comments: number;
  saves: number;
  shares: number;
}

/** The viewer's relationship to a recipe/cook (all false for guests). */
export interface RecipeViewerState {
  liked: boolean;
  disliked: boolean;
  saved: boolean;
  downloaded: boolean;
  following: boolean;
  /** Whether the viewer has reposted this recipe (so the action can toggle off). */
  reposted: boolean;
}

/** Creator post controls. `*Enabled`/`*Visible` so the UI reads them positively. */
export interface PostControls {
  likesEnabled: boolean;
  commentsEnabled: boolean;
  countsVisible: boolean;
}

/** Who reposted a card into your feed (mutual-follow only). */
export interface RepostInfo {
  byId: string;
  byName: string;
  byHandle: string;
  byVerifiedTier: VerificationTier | null;
  comment: string | null;
  /** Relative label, e.g. "2h". */
  time: string;
}

export type AppealStatus = 'none' | 'pending' | 'denied';

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
  /** Photo post: ordered carousel image URLs. Empty for video posts. */
  images: string[];
  counts: RecipeCounts;
  viewer: RecipeViewerState;
  controls: PostControls;
  /** Normalized hashtags (no leading '#'), parsed from the caption + title. */
  hashtags: string[];
  /** 'recipe' = tutorial with ingredients/method; 'review' = a foodie review. */
  postType: PostType;
  /** 1–5 star rating, only on reviews. */
  rating: number | null;
  /** Moderation state — only meaningful to the owner (hidden/removed posts aren't shown to others). */
  removed: boolean;
  removalReason: string | null;
  appealStatus: AppealStatus;
  /** Auto-hidden pending admin review (crossed the high report threshold). */
  autoHidden: boolean;
  /** Set when this card appears in your feed because a mutual-follow friend reposted it. */
  repost: RepostInfo | null;
}

/** A post is either a recipe/tutorial or a foodie review. */
export type PostType = 'recipe' | 'review';

/** Full recipe detail (card + caption + ingredients + ordered method). */
export interface RecipeDetail extends RecipeCard {
  caption: string | null;
  ingredients: string[];
  steps: string[];
}

/** A saved collection ("cookbook") summary. */
export interface CollectionDTO {
  id: string;
  name: string;
  /** Number of recipes in the collection. */
  count: number;
  /** A member recipe's gradient, used as the folder cover (null when empty). */
  coverBg: string | null;
  createdAt: string;
  /** Whether a specific recipe is in this collection (only set by the picker query). */
  hasRecipe?: boolean;
}

/** A trending hashtag with its post count. */
export interface TrendingTag {
  tag: string;
  count: number;
}

export interface CommentDTO {
  id: string;
  /** The comment author's profile id — used to open their profile. */
  authorId: string;
  authorName: string;
  authorInit: string;
  authorColor: string;
  authorAvatarUrl: string | null;
  text: string;
  /** Relative label, e.g. "2h". */
  time: string;
  createdAt: string;
  likes: number;
  /** Whether the requesting viewer has liked this comment. */
  likedByMe: boolean;
  /** Null for a top-level comment; the parent's id for a reply. */
  parentId: string | null;
  /** Number of replies (top-level comments only). */
  replyCount: number;
  /** Hidden by the post owner/admin. Only ever true for the owner/admin viewer
   *  (the public never receives hidden comments; the author sees their own as
   *  normal), so the UI can show a "Hidden" badge + unhide control. */
  hidden: boolean;
  /** Nested replies, present on top-level comments. */
  replies?: CommentDTO[];
}

/** A cook recommended during onboarding — the platform's top cooks by following. */
export interface SuggestedCook extends CookSummary {
  bio: string;
  /** Which of the viewer's selected tastes this cook matched. */
  matched: string[];
  /** The cook's follower count (shown on the onboarding card). */
  followers: number;
}

/** Optional social/profile links. Each is a full normalized URL, or null. */
export interface ProfileLinks {
  instagram: string | null;
  tiktok: string | null;
  x: string | null; // X (formerly Twitter)
  facebook: string | null;
  discord: string | null;
  youtube: string | null;
  website: string | null;
}

/** The platforms in display order, with labels for inputs/placeholders. */
export type ProfileLinkKey = keyof ProfileLinks;
export const PROFILE_LINK_KEYS: ProfileLinkKey[] = ['instagram', 'tiktok', 'x', 'youtube', 'facebook', 'discord', 'website'];

export interface CookProfile {
  id: string;
  name: string;
  handle: string;
  init: string;
  avatarColor: string;
  avatarUrl: string | null;
  bannerUrl: string | null;
  verifiedTier: VerificationTier | null;
  bio: string;
  links: ProfileLinks;
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
  bannerUrl: string | null;
  phone: string | null;
  bio: string;
  links: ProfileLinks;
  isCook: boolean;
  verifiedTier: VerificationTier | null;
  role: 'user' | 'admin';
  banned: boolean;
  bannedReason: string | null;
  /** When a banned account is permanently wiped (ISO); drives the appeal window. */
  deleteAt: string | null;
  banAppealStatus: AppealStatus;
  counts: {
    following: number;
    followers: number;
    saved: number;
  };
  tastes: string[];
  /** Master switch for device push notifications (mirrors the Settings toggle). */
  pushEnabled: boolean;
  /** True when the handle was auto-derived (e.g. Google sign-up) and the user
   *  hasn't chosen one yet — the app shows a "pick a username" step. */
  needsUsername: boolean;
}

export type NotificationKind = 'follow' | 'like' | 'comment' | 'verified' | 'repost' | 'removed' | 'restored' | 'banned';

export interface NotificationDTO {
  id: string;
  type: NotificationKind;
  actor: CookSummary;
  recipeId: string | null;
  recipeTitle: string | null;
  read: boolean;
  createdAt: string;
  /** Relative label, e.g. "2h". */
  time: string;
}

export interface SearchResults {
  recipes: RecipeCard[];
  cooks: CookSummary[];
}

export type ReportCategory = 'nudity' | 'harassment' | 'violence' | 'spam' | 'other';

/** Body for reporting a recipe. */
export interface ReportInput {
  category: ReportCategory;
  reason?: string;
}

/** Body for reposting a recipe (optional quote comment). */
export interface RepostInput {
  comment?: string;
}

/* ─────────────────────────── admin dashboard ─────────────────────────── */

export interface AdminStats {
  /** Recipes that have crossed the report threshold (≥5 distinct reporters). */
  flaggedPosts: number;
  pendingAppeals: number;
  bannedUsers: number;
  flaggedUsers: number;
  verifiedUsers: number;
  totalUsers: number;
}

/** A post in the moderation queue — reports aggregated per recipe (≥ threshold). */
export interface AdminReportGroupDTO {
  recipeId: string;
  recipeTitle: string;
  recipeStatus: string;
  cookId: string;
  cookName: string;
  reportCount: number;
  /** category → count. */
  categories: Partial<Record<ReportCategory, number>>;
  lastReportedAt: string;
  time: string;
}

/** An appeal of a removed video, shown in the admin appeals queue. */
export interface AdminAppealDTO {
  recipeId: string;
  recipeTitle: string;
  cookId: string;
  cookName: string;
  removalReason: string | null;
  appealText: string | null;
  appealedAt: string;
  time: string;
}

export interface AdminUserDTO {
  id: string;
  name: string;
  handle: string;
  init: string;
  avatarColor: string;
  avatarUrl: string | null;
  followerCount: number;
  verifiedTier: VerificationTier | null;
  role: 'user' | 'admin';
  banned: boolean;
  /** Total reports across this user's posts. */
  reportCount: number;
  /** Auto-flagged for review (> 100 reports). */
  flagged: boolean;
  /** Videos this user has had removed. */
  removedCount: number;
  /** Repeat offender — multiple removed videos (stronger ban signal). */
  repeatOffender: boolean;
  /** When a banned account is wiped (ISO) — drives the admin countdown. */
  deleteAt: string | null;
  banReason: string | null;
  banAppealStatus: AppealStatus;
  banAppealText: string | null;
}

/** An entry in the admin moderation audit log. */
export interface AdminLogDTO {
  id: string;
  action: string;
  actorName: string;
  targetName: string | null;
  targetRecipeTitle: string | null;
  detail: string | null;
  createdAt: string;
  time: string;
}

export interface Paginated<T> {
  items: T[];
  nextCursor: string | null;
}

export type FeedResponse = Paginated<RecipeCard>;

/** Body for creating a recipe after its video upload is registered. */
export interface CreateRecipeInput {
  /** Video post: the uploaded video asset. Omit for a photo post. */
  videoAssetId?: string;
  /** Photo post: 1–8 uploaded image URLs (carousel). Omit for a video post. */
  images?: string[];
  title: string;
  cuisine: string;
  timeMinutes: number;
  servings: number;
  level: string;
  ingredients: string[];
  steps: string[];
  /** Free-text caption; hashtags in it become the recipe's tags. */
  caption?: string;
  /** 'recipe' (default) or 'review'. */
  postType?: PostType;
  /** 1–5 star rating; only valid when postType is 'review'. */
  rating?: number;
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

/** A privacy / support request submitted via the public contact form. */
export interface SupportRequestDTO {
  id: string;
  name: string;
  email: string;
  kind: string;
  message: string;
  status: string;
  createdAt: string;
}
