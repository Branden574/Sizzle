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
 * Upload limits. The REAL limiter is MAX_DURATION_SECONDS — with the resumable
 * tus path the video streams directly to Cloudflare (which enforces the duration
 * cap and handles multi-GB clips), so the byte gate is just a sanity ceiling that
 * must be generous enough for a 30-min 4K clip (~10-15 GB) not to be rejected as
 * "too large". The server tus endpoint applies its own ceiling.
 */
export const MAX_DURATION_SECONDS = 1800; // 30 minutes
// The REAL transport ceiling: uploads ride Supabase Storage (project global limit
// and the videos bucket are both set to 2 GiB). Gate at pick time with an honest
// message — letting a bigger file through means minutes of upload that the server
// then rejects (the old silent "stuck at 99%" failure).
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024; // 2 GiB
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
  /** The creator's monthly subscription price in cents, or null if they don't offer one. */
  subPriceCents: number | null;
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
  /** Qualified cooks — distinct users who finished cooking this in cook mode. */
  cooks: number;
  /** Public view count for THIS video (excludes the creator's own views). */
  views: number;
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
  /** Premium price in cents (null = free). Set by the creator. */
  price: number | null;
  /** True when this recipe is gated (premium price OR subscribers-only) and the
   *  viewer can't see it yet — the client shows an unlock/subscribe CTA. */
  locked: boolean;
  /** True when the lock is because the post is subscribers-only (vs a one-time
   *  premium price) — the client shows a "Subscribe to watch" CTA instead of a price. */
  subscribersOnly: boolean;
  /** Raw visibility setting (so the owner's edit UI can show the current state). */
  visibility: 'public' | 'subscribers';
  /** Set when this card appears in your feed because a mutual-follow friend reposted it. */
  repost: RepostInfo | null;
  /** Lineage: set when this post was cooked from another recipe ("Cook this").
   *  The credit chip links back to the original. */
  origin: { id: string; title: string; cookHandle: string } | null;
}

/** A post is either a recipe/tutorial or a foodie review. */
export type PostType = 'recipe' | 'review';

/** Nutrition per serving, creator-entered. Fields the creator left blank are null. */
export interface RecipeMacros {
  calories: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
}

/** Full recipe detail (card + caption + ingredients + ordered method). */
export interface RecipeDetail extends RecipeCard {
  caption: string | null;
  ingredients: string[];
  steps: string[];
  /** Nutrition per serving — null when the creator set none of the fields. */
  macros: RecipeMacros | null;
  /** The owner-pinned comment, surfaced on the sheet and in cook mode. */
  chefsNote: { text: string; authorName: string } | null;
}

/** A saved collection ("cookbook") summary. */
export interface BoardDTO {
  id: string;
  name: string;
  owner: CookSummary;
  recipes: RecipeCard[];
}

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
  /** Public board: shareable at /b/:id. */
  isPublic: boolean;
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
  /** Pinned by the recipe owner — surfaced as the Chef's note. */
  pinned: boolean;
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
    /** Lifetime video views across all their videos (public Creator metric). */
    views: number;
  };
  viewer: { following: boolean; blocked: boolean; muted: boolean; subscribed: boolean; requested: boolean };
  /** True when this account is an active Sizzle Creator (shows the Creator badge). */
  isCreator: boolean;
  /** Private account: content is visible to accepted followers only. */
  isPrivate: boolean;
  /** True when this creator has payouts set up and can receive support/tips. */
  acceptsTips: boolean;
  /** Monthly subscription price in cents, or null if they don't offer subs. */
  subPriceCents: number | null;
  /** Public funding goal + progress (null if none), shown as a progress bar. */
  goal: { label: string; targetCents: number; raisedCents: number } | null;
  recipes: RecipeCard[];
}

/** The signed-in user's own profile. */
/* ─────────────────────────── monetization ─────────────────────────── */

/** Sizzle's share of what remains after card processing, in percent. Shown
 *  verbatim to users — Sizzle is transparent about its cut. */
export const PLATFORM_FEE_PCT = 10;

/** Card processing, modeled on Stripe US card pricing. The split every surface
 *  shows is computed from these, so the numbers a fan sees pre-checkout are the
 *  numbers that settle. */
export const PROCESSING_PCT = 2.9;
export const PROCESSING_FIXED_CENTS = 30;

/** Minimum price/tip in cents across every paid surface ($5). Mirrors the API's
 *  MIN_TIP and the DB CHECK floors — keep all three in step. */
export const MIN_PRICE_CENTS = 500;

/** One-line version of the fee disclosure (tip sheet, receipts). */
export const PLATFORM_FEE_SHORT =
  `Card processing (about ${PROCESSING_PCT}% + ${PROCESSING_FIXED_CENTS}¢) comes off the top; ` +
  `of the rest, Sizzle keeps ${PLATFORM_FEE_PCT}% and creators keep ${100 - PLATFORM_FEE_PCT}%.`;

/** Why the fee exists and why we think it's fair — shown to creators wherever
 *  earnings appear. Honest and specific, not marketing fluff. */
export const PLATFORM_FEE_RATIONALE =
  `Every payment splits the same way, in the open: card processing (about ${PROCESSING_PCT}% + ${PROCESSING_FIXED_CENTS}¢) ` +
  `comes off the top, Sizzle keeps ${PLATFORM_FEE_PCT}% of the rest, and you keep the other ${100 - PLATFORM_FEE_PCT}%. ` +
  `Sizzle's share pays for video hosting and streaming and the moderation that keeps the feed worth being on — ` +
  `other platforms typically take a far larger cut. ` +
  `Zero ads, we never sell your data, and we only make money when you do.`;

/** Card-processing cost for a gross amount in cents (comes off the top). */
export const processingFeeCents = (amountCents: number): number =>
  Math.round((amountCents * PROCESSING_PCT) / 100) + PROCESSING_FIXED_CENTS;

/** Sizzle's share: PLATFORM_FEE_PCT of what remains after processing. Rounds
 *  DOWN so rounding always favors the creator. */
export const platformShareCents = (amountCents: number): number =>
  Math.floor(((amountCents - processingFeeCents(amountCents)) * PLATFORM_FEE_PCT) / 100);

/** The creator's share — the remainder, so the split is penny-exact:
 *  processingFeeCents(a) + platformShareCents(a) + creatorShareCents(a) === a
 *  for every a (verified by hand at $5.00: 45 + 45 + 410 = 500). */
export const creatorShareCents = (amountCents: number): number =>
  amountCents - processingFeeCents(amountCents) - platformShareCents(amountCents);

/** The pre-Model-B fee (a flat PLATFORM_FEE_PCT of gross, processing paid out of
 *  it). Kept only so ledger rows written under that model still display the fee
 *  they were actually charged; new charges use the helpers above. */
export const platformFeeCents = (amountCents: number): number => Math.floor((amountCents * PLATFORM_FEE_PCT) / 100);

export type MonetizationStatus = 'none' | 'pending' | 'active';

export type EarningKind = 'support' | 'subscription' | 'unlock' | 'product';

/** One earning in a creator's ledger (support / subscription renewal / unlock). */
export interface TipDTO {
  id: string;
  kind: EarningKind;
  /** Who sent it (for the creator's ledger) — summary of the payer. */
  from: CookSummary | null;
  recipeId: string | null;
  recipeTitle: string | null;
  amountCents: number;
  feeCents: number;
  netCents: number;
  status: 'pending' | 'succeeded' | 'refunded';
  createdAt: string;
  /** Relative label, e.g. "2h". */
  time: string;
}

/** A viewer's subscription to a creator. */
export interface SubscriptionDTO {
  creatorId: string;
  status: 'active' | 'canceled' | 'past_due';
  priceCents: number;
  currentPeriodEnd: string | null;
}

/** The creator's earnings dashboard payload. */
/** A creator subscription tier (name + price + perks). */
export interface TierDTO {
  id: string;
  name: string;
  priceCents: number;
  perks: string | null;
}

/** A creator's digital product (cookbook, meal plan, guide). */
export interface ProductDTO {
  id: string;
  title: string;
  description: string | null;
  priceCents: number;
  /** Download URL — only returned to the owner or a buyer. */
  fileUrl: string | null;
  /** True when the viewer already bought it (or owns it). */
  owned: boolean;
}

export interface EarningsSummary {
  monetization: MonetizationStatus;
  feePct: number;
  /** The creator's own monthly subscription price (null = subscriptions off). */
  subPriceCents: number | null;
  totals: { grossCents: number; feeCents: number; netCents: number; tipCount: number };
  /** Monthly recurring revenue from active subscriptions, net of the platform fee. */
  mrrCents: number;
  /** Number of active subscribers. */
  activeSubs: number;
  /** Net earnings attributed to each recipe (unlocks + recipe-tied support), best-first. */
  byPost: { recipeId: string; title: string; netCents: number; count: number }[];
  /** The creator's funding goal + live progress, or null if none is set. */
  goal: { label: string; targetCents: number; raisedCents: number } | null;
  /** Auto welcome DM sent to new subscribers (null = off). */
  welcomeDm: string | null;
  /** Biggest supporters by net contribution, best-first. */
  topSupporters: { user: CookSummary | null; netCents: number; count: number }[];
  tips: TipDTO[];
}

/** Client config for the tip flow. */
export interface TipConfig {
  provider: 'stripe' | 'mock';
  feePct: number;
  minCents: number;
  maxCents: number;
  presetsCents: number[];
}

/** Creator insights (own profile). */
export interface CreatorAnalytics {
  totals: { recipes: number; followers: number; views: number; likes: number; comments: number; saves: number; shares: number; avgWatchMs: number; completionPct: number; cooks: number };
  posts: {
    id: string; title: string; createdAt: string;
    views: number; avgWatchMs: number; completionPct: number; skipPct: number;
    likes: number; comments: number; saves: number; shares: number; cooks: number;
  }[];
  /** Daily views over the trailing window (for a sparkline). */
  trend: { day: string; views: number }[];
  /** The single best day-of-week (0=Sun) + hour to post, by past views. */
  bestTime: { dow: number; hour: number; views: number } | null;
  /** Coarse retention from watch signals: everyone who started → kept watching
   *  (didn't skip) → finished. An estimate from dwell, not per-second pings. */
  retention: { started: number; kept: number; finished: number };
  /** Premium save→unlock funnel (null when the creator has no premium recipes). */
  unlockFunnel: { views: number; saves: number; unlocks: number } | null;
}

/** User-controllable push categories (account/moderation pushes always send). */
export type NotifPrefKey = 'likes' | 'comments' | 'follows' | 'reposts' | 'messages' | 'tips';
export type NotifPrefs = Partial<Record<NotifPrefKey, boolean>>;

/** The Regular↔Creator account tier. `regular` = default; `eligible` = met the
 *  thresholds but hasn't activated; `pending` = activating (payout setup in
 *  progress); `active` = full Creator (payouts wired); `suspended` = under review. */
export type CreatorStatus = 'regular' | 'eligible' | 'pending' | 'active' | 'suspended';
/** Creator-eligibility thresholds (both required). */
export const CREATOR_FOLLOWER_REQ = 1000;
export const CREATOR_VIEW_REQ = 100_000;

export interface CreatorEligibility {
  followers: number;
  views: number;
  followersReq: number;
  viewsReq: number;
  /** True once BOTH thresholds are met. */
  met: boolean;
}

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
  /** Regular↔Creator account tier (see CreatorStatus). */
  creatorStatus: CreatorStatus;
  /** Live progress toward Creator eligibility (drives the "Become a Creator" screen). */
  creatorEligibility: CreatorEligibility;
  counts: {
    following: number;
    followers: number;
    saved: number;
    /** Lifetime video views across all the user's videos (public metric + eligibility). */
    views: number;
  };
  tastes: string[];
  /** Master switch for device push notifications (mirrors the Settings toggle). */
  pushEnabled: boolean;
  /** Per-type push preferences (likes/comments/follows/reposts/messages). Missing = on. */
  notifPrefs: NotifPrefs;
  /** True when the handle was auto-derived (e.g. Google sign-up) and the user
   *  hasn't chosen one yet — the app shows a "pick a username" step. */
  needsUsername: boolean;
  /** Private account: only accepted followers see your posts; follows need approval. */
  private: boolean;
}

/** A Made-It Journal entry: proof-of-cook with optional photo/note/stars. */
export interface CookLogDTO {
  id: string;
  recipeId: string;
  author: { id: string; name: string; handle: string; init: string; avatarColor: string; avatarUrl: string | null };
  note: string | null;
  rating: number | null;
  photoUrl: string | null;
  isPublic: boolean;
  /** Relative label, e.g. "2d". */
  time: string;
  createdAt: string;
}

/** A journal entry on the owner's profile — the entry + its recipe context. */
export interface JournalEntryDTO extends CookLogDTO {
  recipe: { id: string; title: string; poster: string | null; bg: string };
}

export type NotificationKind =
  | 'follow' | 'like' | 'comment' | 'comment_like' | 'verified' | 'repost' | 'removed' | 'restored' | 'banned' | 'message' | 'tip' | 'follow_request'
  // Creator-account lifecycle (system notifications; actor is the recipient).
  | 'creator_progress' | 'creator_eligible' | 'creator_activated' | 'creator_payout_incomplete' | 'payout_first' | 'payout_paid' | 'creator_monthly_summary';

/** Creator/payout system-notification kinds — self-directed, no other-user actor. */
export const SYSTEM_NOTIFICATION_KINDS: readonly NotificationKind[] = [
  'creator_progress', 'creator_eligible', 'creator_activated', 'creator_payout_incomplete', 'payout_first', 'payout_paid', 'creator_monthly_summary', 'verified', 'removed', 'restored', 'banned',
];

export interface NotificationDTO {
  id: string;
  type: NotificationKind;
  actor: CookSummary;
  recipeId: string | null;
  recipeTitle: string | null;
  /** Gross amount in cents for earning notifications (tip/unlock/product/sub);
   *  null for every other kind. Denormalized so the row can say how much. */
  amountCents: number | null;
  read: boolean;
  createdAt: string;
  /** Relative label, e.g. "2h". */
  time: string;
}

export interface SearchResults {
  recipes: RecipeCard[];
  cooks: CookSummary[];
}

/* ─────────────────────────── direct messages ─────────────────────────── */
export interface MessageDTO {
  id: string;
  /** True if the viewer sent it (right-aligned bubble). */
  fromMe: boolean;
  text: string;
  createdAt: string;
  /** Relative label, e.g. "2h". */
  time: string;
  /** Send-to-friend: an embedded recipe card (tap to open the recipe). */
  recipe?: { id: string; title: string; poster: string | null; bg: string; cookHandle: string } | null;
}

/** One row in the messages inbox. */
export interface ConversationDTO {
  id: string;
  otherUser: CookSummary;
  lastText: string | null;
  lastAt: string | null;
  /** Relative label for the last message, e.g. "2h". */
  lastTime: string;
  /** Whether the last message was sent by the viewer. */
  lastFromMe: boolean;
  /** True when the other person's latest message is unread by the viewer. */
  unread: boolean;
}

/** A full conversation thread (the other user + messages oldest→newest). */
export interface ThreadDTO {
  conversationId: string;
  otherUser: CookSummary;
  messages: MessageDTO[];
  /** The other participant's last-read time — drives the sender's Delivered/Read
   *  receipt. Null when there's no conversation yet. */
  otherLastReadAt: string | null;
}

export type ReportCategory = 'nudity' | 'harassment' | 'violence' | 'spam' | 'other';

/** What kind of thing is being reported. */
export type ReportTargetType = 'recipe' | 'comment' | 'profile';

/** Body for filing a report against any user-generated target. */
export interface ReportInput {
  targetType: ReportTargetType;
  targetId: string;
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

/** A flagged comment or profile, shown in the admin content-reports queue. */
export interface AdminContentReportDTO {
  targetType: 'comment' | 'profile';
  targetId: string;
  /** Comment text, or the profile's @handle. */
  preview: string;
  /** e.g. "by @author" (comment) or the display name (profile). */
  subLabel: string;
  reportCount: number;
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
  /** Admin For You ranking lift for this creator (0 = none, 0.5 = light, 1 = strong). */
  boost: number;
  /** Creator-account tier (drives the admin Grant/Revoke Creator control). */
  creatorStatus: CreatorStatus;
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
/** A draft or scheduled post in the creator's Drafts list. */
export type DraftCard = RecipeCard & { draftStatus: 'draft' | 'scheduled'; scheduledAt: string | null };

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
  /** Nutrition per serving (all fields optional; blank = not shown). */
  macros?: { calories?: number; proteinG?: number; carbsG?: number; fatG?: number };
  /** Free-text caption; hashtags in it become the recipe's tags. */
  caption?: string;
  /** 'recipe' (default) or 'review'. */
  postType?: PostType;
  /** 1–5 star rating; only valid when postType is 'review'. */
  rating?: number;
  /** Lineage: the recipe this post was cooked from ("Cook this"). */
  originRecipeId?: string;
  /** Publish now (default), save as a draft, or schedule for later. */
  status?: 'draft' | 'scheduled' | 'published';
  /** ISO time to auto-publish when status is 'scheduled'. */
  scheduledAt?: string;
}

/** Response from requesting a direct (client-side) video upload. */
export interface DirectUploadTicket {
  videoAssetId: string;
  /** One-time URL the client uploads bytes to (Cloudflare Stream, or mock).
   *  For provider "cloudflare-tus" this is the resumable tus endpoint. */
  uploadUrl: string;
  /** "cloudflare-tus" | "cloudflare" | "storage" | "mock" — the upload protocol. */
  provider: string;
  /** True when an existing asset was returned for a repeated clientUploadId
   *  (idempotent retry) — the client resumes its persisted tus upload. */
  resumed?: boolean;
}

/** Which upload flow the client should use (driven by the API's VIDEO_PROVIDER). */
export interface VideoUploadConfig {
  /** 'cloudflare' → register-first + upload to the ticket; 'storage' → upload to Supabase. */
  provider: 'cloudflare' | 'storage';
}

/** A provider asset's processing status (polled after a Cloudflare upload). */
export interface VideoAssetStatus {
  status: 'pending' | 'uploading' | 'processing' | 'ready' | 'error';
  hlsUrl: string | null;
  posterUrl: string | null;
  mp4Url: string | null;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/** A privacy / support request submitted via the public contact form or an in-app ticket. */
export interface SupportRequestDTO {
  id: string;
  name: string;
  email: string;
  kind: string;
  message: string;
  status: string;
  createdAt: string;
  /** Set for authenticated in-app tickets; null for public contact-form rows. */
  userId: string | null;
  userHandle: string | null;
}
