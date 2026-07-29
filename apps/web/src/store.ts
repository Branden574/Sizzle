import { create } from 'zustand';
import type { RecipeCard, ReportTargetType } from '@sizzle/shared';
import type { FeedKind, Phase, Tab } from './types';

/** A thing being reported (recipe / comment / profile) + an optional label for the sheet. */
export type ReportTarget = { type: ReportTargetType; id: string; name?: string };

/** Boolean sets keyed by id (taste labels, cook ids, recipe ids). */
type BoolMap = Record<string, boolean>;

/** Maps whose toggles share identical logic. Onboarding is the only caller. */
type ToggleMap = 'tastes' | 'followed';

/**
 * Set `true` to skip onboarding and boot straight into the app
 * (the original `startInApp` design prop).
 */
const START_IN_APP = false;

/** Client-only preferences, persisted to localStorage. */
const PREFS_KEY = 'sz-prefs';
export type ThemePref = 'system' | 'light' | 'dark';
export type FeedKindPref = 'foryou' | 'following';
export type UnitPref = 'original' | 'metric' | 'imperial';
interface Prefs {
  muted: boolean;
  autoplay: boolean;
  theme: ThemePref;
  reduceMotion: boolean;
  defaultFeed: FeedKindPref;
  units: UnitPref;
  dataSaver: boolean;
  /** Require the 4-digit app-lock passcode to open the app. */
  appLockEnabled: boolean;
}
const PREFS_DEFAULT: Prefs = { muted: true, autoplay: true, theme: 'system', reduceMotion: false, defaultFeed: 'foryou', units: 'original', dataSaver: false, appLockEnabled: false };
function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<Prefs>;
      return {
        muted: p.muted ?? PREFS_DEFAULT.muted,
        autoplay: p.autoplay ?? PREFS_DEFAULT.autoplay,
        theme: p.theme ?? PREFS_DEFAULT.theme,
        reduceMotion: p.reduceMotion ?? PREFS_DEFAULT.reduceMotion,
        defaultFeed: p.defaultFeed ?? PREFS_DEFAULT.defaultFeed,
        units: p.units ?? PREFS_DEFAULT.units,
        dataSaver: p.dataSaver ?? PREFS_DEFAULT.dataSaver,
        appLockEnabled: p.appLockEnabled ?? PREFS_DEFAULT.appLockEnabled,
      };
    }
  } catch {
    /* ignore */
  }
  return { ...PREFS_DEFAULT };
}
function savePrefs(p: Prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}
const prefs0 = loadPrefs();
/** Snapshot the persisted prefs from current state, applying a partial change. */
function prefsFrom(s: Prefs, patch: Partial<Prefs>): Prefs {
  return { muted: s.muted, autoplay: s.autoplay, theme: s.theme, reduceMotion: s.reduceMotion, defaultFeed: s.defaultFeed, units: s.units, dataSaver: s.dataSaver, appLockEnabled: s.appLockEnabled, ...patch };
}

export interface SizzleState {
  phase: Phase;
  onbStep: number;
  tastes: BoolMap;
  followed: BoolMap;
  tab: Tab;
  feed: FeedKind;
  /** Hold-to-hide immersive mode: hides all feed overlays + the bottom nav. */
  immersive: boolean;
  /** Passcode app-lock: true once the user has passed the lock this session
      (runtime only — not persisted, so a fresh launch re-locks). */
  appUnlocked: boolean;
  openRecipe: string | null;
  /** Full-screen, swipeable feed-style video viewer: the list + the card in view. */
  viewer: { items: RecipeCard[]; index: number } | null;
  openCook: string | null;
  showUpload: boolean;
  /** True while the native OS share sheet (navigator.share) is presented over the
   *  WebView — folded into feed/viewer suppression so the clip's audio pauses. */
  sharing: boolean;
  showCreate: boolean;
  showNotifications: boolean;
  showEditProfile: boolean;
  showAppSettings: boolean;
  showAnalytics: boolean;
  showRoadmap: boolean;
  showAdmin: boolean;
  /** Direct-messages inbox overlay. */
  /** Send-to-friend sheet: the recipe being sent. */
  sendRecipeFor: { id: string; title: string } | null;
  /** A shared public board being viewed. */
  openBoard: string | null;
  /** Post-publish share card ("Share Everywhere"). */
  shareAfterPost: { id: string; title: string } | null;
  /** "Cook this": pre-fill the composer from an existing recipe (lineage). */
  uploadPrefill: { originRecipeId: string; originTitle: string; originHandle: string; ingredients: string; steps: string } | null;
  messagesOpen: boolean;
  /** Open DM thread — the OTHER user's id (null = closed). */
  threadWith: string | null;
  commentsFor: string | null;
  settingsFor: string | null;
  /** Post "…" overflow menu (recipe id) + whether the viewer owns it. */
  moreFor: string | null;
  moreIsOwn: boolean;
  /** Report sheet target — any user-generated thing (recipe / comment / profile). */
  reportFor: ReportTarget | null;
  /** Tip sheet target (creator + optional recipe context). */
  tipFor: { creatorId: string; recipeId?: string; name: string } | null;
  /** Repost sheet target (recipe id). */
  repostFor: string | null;
  /** Edit-post sheet target (recipe id). */
  editPostFor: string | null;
  /** Cook Mode overlay — the recipe being cooked + the chosen serving scale. */
  cookFor: { id: string; scale: number } | null;
  /** Shopping-list overlay. */
  showShopping: boolean;
  /** Creator hub overlay (eligibility → become-a-creator → dashboard). */
  showCreator: boolean;
  /** "Save to collection" picker for a recipe id. */
  collectionPickerFor: string | null;
  /** Viewing a collection's recipes. */
  openCollection: { id: string; name: string } | null;
  /** Hashtag feed overlay (the tag being browsed). */
  openTag: string | null;
  /** Followers/following list overlay. */
  followList: { id: string; mode: 'followers' | 'following'; name: string } | null;
  /** Global video playback prefs (persisted). */
  muted: boolean;
  autoplay: boolean;
  /** Appearance + behaviour prefs (persisted). */
  theme: ThemePref;
  reduceMotion: boolean;
  defaultFeed: FeedKindPref;
  units: UnitPref;
  dataSaver: boolean;
  appLockEnabled: boolean;

  // onboarding
  next: () => void;
  back: () => void;
  setPhase: (phase: Phase) => void;
  setOnbStep: (step: number) => void;
  /** Return to the first-run flow (used on sign-out). */
  resetToOnboarding: () => void;

  // generic toggles
  toggle: (map: ToggleMap, id: string) => void;

  // navigation
  setTab: (tab: Tab) => void;
  setFeed: (feed: FeedKind) => void;
  setImmersive: (on: boolean) => void;

  // sheets
  setOpenRecipe: (id: string | null) => void;
  setViewer: (v: { items: RecipeCard[]; index: number } | null) => void;
  /** Apply an optimistic patch to the open viewer's cards (keeps likes/saves/follows live in the full-screen player). */
  patchViewer: (fn: (c: RecipeCard) => RecipeCard) => void;
  setOpenCook: (id: string | null) => void;
  setCommentsFor: (id: string | null) => void;
  setSettingsFor: (id: string | null) => void;
  openMore: (recipeId: string, isOwn: boolean) => void;
  setMoreFor: (id: string | null) => void;
  setReportFor: (t: ReportTarget | null) => void;
  setTipFor: (t: { creatorId: string; recipeId?: string; name: string } | null) => void;
  setRepostFor: (id: string | null) => void;
  setEditPostFor: (id: string | null) => void;
  setCookFor: (v: { id: string; scale: number } | null) => void;
  setShowShopping: (v: boolean) => void;
  setShowCreator: (v: boolean) => void;
  setCollectionPickerFor: (id: string | null) => void;
  setOpenCollection: (v: { id: string; name: string } | null) => void;
  setOpenTag: (tag: string | null) => void;
  setFollowList: (v: { id: string; mode: 'followers' | 'following'; name: string } | null) => void;
  setShowUpload: (v: boolean) => void;
  setSharing: (v: boolean) => void;
  setShowCreate: (v: boolean) => void;
  setShowNotifications: (v: boolean) => void;
  setShowEditProfile: (v: boolean) => void;
  setShowAppSettings: (v: boolean) => void;
  setShowAnalytics: (v: boolean) => void;
  setShowRoadmap: (v: boolean) => void;
  setShowAdmin: (v: boolean) => void;
  setSendRecipeFor: (v: { id: string; title: string } | null) => void;
  setOpenBoard: (id: string | null) => void;
  setShareAfterPost: (v: { id: string; title: string } | null) => void;
  setUploadPrefill: (v: SizzleState['uploadPrefill']) => void;
  setMessagesOpen: (v: boolean) => void;
  setThreadWith: (id: string | null) => void;

  // playback + appearance prefs
  toggleMuted: () => void;
  setMuted: (v: boolean) => void;
  toggleAutoplay: () => void;
  setAutoplay: (v: boolean) => void;
  setTheme: (v: ThemePref) => void;
  setReduceMotion: (v: boolean) => void;
  setDefaultFeed: (v: FeedKindPref) => void;
  setUnits: (v: UnitPref) => void;
  setDataSaver: (v: boolean) => void;
  setAppLockEnabled: (v: boolean) => void;
  setAppUnlocked: (v: boolean) => void;
}

export const useSizzle = create<SizzleState>((set) => ({
  phase: START_IN_APP ? 'app' : 'onboarding',
  onbStep: 0,
  tastes: {},
  followed: {},
  // A fresh launch always opens on the FEED — it's the primed, instant surface
  // (restoring to e.g. Profile made the app "open slow" while that tab cold-
  // fetched). Mid-session resets were the real bug and are fixed at the root:
  // OTA updates now apply only on app kill, never on a backgrounding.
  tab: 'feed',
  feed: prefs0.defaultFeed,
  immersive: false,
  appUnlocked: false,
  openRecipe: null,
  viewer: null,
  openCook: null,
  showUpload: false,
  sharing: false,
  showCreate: false,
  showNotifications: false,
  showEditProfile: false,
  showAppSettings: false,
  showAnalytics: false,
  showRoadmap: false,
  showAdmin: false,
  sendRecipeFor: null,
  openBoard: null,
  shareAfterPost: null,
  uploadPrefill: null,
  messagesOpen: false,
  threadWith: null,
  commentsFor: null,
  settingsFor: null,
  moreFor: null,
  moreIsOwn: false,
  reportFor: null,
  tipFor: null,
  repostFor: null,
  editPostFor: null,
  cookFor: null,
  showShopping: false,
  showCreator: false,
  collectionPickerFor: null,
  openCollection: null,
  openTag: null,
  followList: null,
  muted: prefs0.muted,
  autoplay: prefs0.autoplay,
  theme: prefs0.theme,
  reduceMotion: prefs0.reduceMotion,
  appLockEnabled: prefs0.appLockEnabled,
  defaultFeed: prefs0.defaultFeed,
  units: prefs0.units,
  dataSaver: prefs0.dataSaver,

  next: () =>
    set((s) => {
      if (s.onbStep >= 3) return { phase: 'app' };
      return { onbStep: s.onbStep + 1 };
    }),
  back: () => set((s) => ({ onbStep: Math.max(0, s.onbStep - 1) })),
  setPhase: (phase) => set({ phase }),
  setOnbStep: (step) => set({ onbStep: step }),
  resetToOnboarding: () => set({ phase: 'onboarding', onbStep: 0 }),

  toggle: (map, id) =>
    set((s) => ({ [map]: { ...s[map], [id]: !s[map][id] } }) as Partial<SizzleState>),

  // Switching tabs dismisses every overlay covering the tab area (Messages
  // inbox, DM thread, cook/recipe views, pickers, notification/settings
  // sheets) — otherwise the nav appears to do nothing under an open sheet.
  // Sheets holding unsaved work (upload, edit post, edit profile) stay open.
  setTab: (tab) => {
    // Remember the tab across reloads/relaunches (OTA applies, jetsam, cold
    // start) — coming back to the app must not dump the user on the feed.
    try { localStorage.setItem('sizzle.lastTab', tab); } catch { /* private mode */ }
    return set({
    tab,
    immersive: false,
    commentsFor: null,
    tipFor: null,
    reportFor: null,
    moreFor: null,
    repostFor: null,
    collectionPickerFor: null,
    cookFor: null,
    followList: null,
    showShopping: false,
    showCreator: false,
    settingsFor: null,
    openCollection: null,
    openTag: null,
    threadWith: null,
    messagesOpen: false,
    showNotifications: false,
    showAnalytics: false,
    showRoadmap: false,
    showAdmin: false,
    showAppSettings: false,
    viewer: null,
    openCook: null,
    openRecipe: null,
    sendRecipeFor: null,
    openBoard: null,
  });
  },
  setFeed: (feed) => set({ feed, immersive: false, commentsFor: null }),
  setImmersive: (on) => set({ immersive: on }),
  setAppUnlocked: (v) => set({ appUnlocked: v }),

  setOpenRecipe: (id) => set({ openRecipe: id }),
  setViewer: (v) => set({ viewer: v }),
  patchViewer: (fn) => set((s) => (s.viewer ? { viewer: { ...s.viewer, items: s.viewer.items.map(fn) } } : {})),
  setOpenCook: (id) => set({ openCook: id }),
  setCommentsFor: (id) => set({ commentsFor: id }),
  setSettingsFor: (id) => set({ settingsFor: id }),
  openMore: (recipeId, isOwn) => set({ moreFor: recipeId, moreIsOwn: isOwn }),
  setMoreFor: (id) => set({ moreFor: id }),
  setReportFor: (id) => set({ reportFor: id }),
  setTipFor: (t) => set({ tipFor: t }),
  setRepostFor: (id) => set({ repostFor: id }),
  setEditPostFor: (id) => set({ editPostFor: id }),
  setCookFor: (v) => set({ cookFor: v }),
  setShowShopping: (v) => set({ showShopping: v }),
  setShowCreator: (v) => set({ showCreator: v }),
  setCollectionPickerFor: (id) => set({ collectionPickerFor: id }),
  setOpenCollection: (v) => set({ openCollection: v }),
  // Opening a hashtag page closes the recipe sheet (which sits above it, z-index 97 > 91), so
  // tapping a #tag inside a post lands you straight on the hashtag page instead of behind the recipe.
  setOpenTag: (tag) => set((s) => ({ openTag: tag, openRecipe: tag ? null : s.openRecipe })),
  setFollowList: (v) => set({ followList: v }),
  setShowUpload: (v) => set({ showUpload: v }),
  setSharing: (v) => set({ sharing: v }),
  setShowCreate: (v) => set({ showCreate: v }),
  setShowNotifications: (v) => set({ showNotifications: v }),
  setShowEditProfile: (v) => set({ showEditProfile: v }),
  setShowAppSettings: (v) => set({ showAppSettings: v }),
  setShowAnalytics: (v) => set({ showAnalytics: v }),
  setShowRoadmap: (v) => set({ showRoadmap: v }),
  setShowAdmin: (v) => set({ showAdmin: v }),
  setSendRecipeFor: (v) => set({ sendRecipeFor: v }),
  setOpenBoard: (id) => set({ openBoard: id }),
  setShareAfterPost: (v) => set({ shareAfterPost: v }),
  setUploadPrefill: (v) => set({ uploadPrefill: v }),
  setMessagesOpen: (v) => set({ messagesOpen: v }),
  setThreadWith: (id) => set({ threadWith: id }),

  toggleMuted: () => set((s) => { const muted = !s.muted; savePrefs(prefsFrom(s, { muted })); return { muted }; }),
  setMuted: (v) => set((s) => { savePrefs(prefsFrom(s, { muted: v })); return { muted: v }; }),
  toggleAutoplay: () => set((s) => { const autoplay = !s.autoplay; savePrefs(prefsFrom(s, { autoplay })); return { autoplay }; }),
  setAutoplay: (v) => set((s) => { savePrefs(prefsFrom(s, { autoplay: v })); return { autoplay: v }; }),
  setTheme: (v) => set((s) => { savePrefs(prefsFrom(s, { theme: v })); return { theme: v }; }),
  setReduceMotion: (v) => set((s) => { savePrefs(prefsFrom(s, { reduceMotion: v })); return { reduceMotion: v }; }),
  setDefaultFeed: (v) => set((s) => { savePrefs(prefsFrom(s, { defaultFeed: v })); return { defaultFeed: v }; }),
  setUnits: (v) => set((s) => { savePrefs(prefsFrom(s, { units: v })); return { units: v }; }),
  setDataSaver: (v) => set((s) => { savePrefs(prefsFrom(s, { dataSaver: v })); return { dataSaver: v }; }),
  setAppLockEnabled: (v) => set((s) => { savePrefs(prefsFrom(s, { appLockEnabled: v })); return { appLockEnabled: v }; }),
}));
