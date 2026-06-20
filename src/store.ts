import { create } from 'zustand';
import { baseComments, recipeById } from './data';
import type { Comment, FeedKind, Phase, PostSettings, Tab } from './types';

/** Boolean sets keyed by id (taste labels, cook ids, recipe ids). */
type BoolMap = Record<string, boolean>;

/** Maps whose toggles share identical logic. */
type ToggleMap = 'tastes' | 'followed' | 'saves' | 'downloads';

/**
 * Set `true` to skip onboarding and boot straight into the app
 * (the original `startInApp` design prop).
 */
const START_IN_APP = false;

export interface SizzleState {
  phase: Phase;
  onbStep: number;
  tastes: BoolMap;
  followed: BoolMap;
  tab: Tab;
  feed: FeedKind;
  openRecipe: string | null;
  openCook: string | null;
  showUpload: boolean;
  commentsFor: string | null;
  settingsFor: string | null;
  likes: BoolMap;
  dislikes: BoolMap;
  saves: BoolMap;
  downloads: BoolMap;
  postSettings: Record<string, PostSettings>;
  comments: Record<string, Comment[]>;
  draft: string;

  // onboarding
  next: () => void;
  back: () => void;
  finish: () => void;

  // generic toggles
  toggle: (map: ToggleMap, id: string) => void;

  // reactions (mutually exclusive)
  onLike: (id: string) => void;
  onDislike: (id: string) => void;

  // navigation
  setTab: (tab: Tab) => void;
  setFeed: (feed: FeedKind) => void;

  // sheets
  setOpenRecipe: (id: string | null) => void;
  setOpenCook: (id: string | null) => void;
  openCookFromSheet: () => void;
  setCommentsFor: (id: string | null) => void;
  setSettingsFor: (id: string | null) => void;
  setShowUpload: (v: boolean) => void;

  // creator post controls
  togglePostSetting: (recipeId: string, key: keyof PostSettings) => void;

  // comments
  setDraft: (v: string) => void;
  sendComment: () => void;
}

export const useSizzle = create<SizzleState>((set) => ({
  phase: START_IN_APP ? 'app' : 'onboarding',
  onbStep: 0,
  tastes: {},
  followed: { mina: true, theo: true },
  tab: 'feed',
  feed: 'foryou',
  openRecipe: null,
  openCook: null,
  showUpload: false,
  commentsFor: null,
  settingsFor: null,
  likes: {},
  dislikes: {},
  saves: { r2: true, r4: true, r6: true },
  downloads: { r2: true, r6: true },
  postSettings: {},
  comments: {},
  draft: '',

  next: () =>
    set((s) => {
      if (s.onbStep >= 3) return { phase: 'app' };
      return { onbStep: s.onbStep + 1 };
    }),
  back: () => set((s) => ({ onbStep: Math.max(0, s.onbStep - 1) })),
  finish: () => set({ phase: 'app' }),

  toggle: (map, id) =>
    set((s) => ({ [map]: { ...s[map], [id]: !s[map][id] } }) as Partial<SizzleState>),

  onLike: (id) =>
    set((s) => ({
      likes: { ...s.likes, [id]: !s.likes[id] },
      dislikes: { ...s.dislikes, [id]: false },
    })),
  onDislike: (id) =>
    set((s) => ({
      dislikes: { ...s.dislikes, [id]: !s.dislikes[id] },
      likes: { ...s.likes, [id]: false },
    })),

  setTab: (tab) => set({ tab }),
  setFeed: (feed) => set({ feed }),

  setOpenRecipe: (id) => set({ openRecipe: id }),
  setOpenCook: (id) => set({ openCook: id }),
  // Jump from the recipe sheet to the recipe's cook profile.
  openCookFromSheet: () =>
    set((s) => ({ openCook: s.openRecipe ? (recipeById(s.openRecipe)?.cook ?? null) : null, openRecipe: null })),
  setCommentsFor: (id) => set({ commentsFor: id }),
  setSettingsFor: (id) => set({ settingsFor: id }),
  setShowUpload: (v) => set({ showUpload: v }),

  togglePostSetting: (recipeId, key) =>
    set((s) => {
      const cur = s.postSettings[recipeId] || {};
      return { postSettings: { ...s.postSettings, [recipeId]: { ...cur, [key]: !cur[key] } } };
    }),

  setDraft: (v) => set({ draft: v }),
  sendComment: () =>
    set((s) => {
      const text = (s.draft || '').trim();
      const id = s.commentsFor;
      if (!text || !id) return {};
      const mine: Comment = {
        name: 'alexcooks',
        init: 'A',
        bg: 'linear-gradient(135deg,#3a2a22,#1b1512)',
        text,
        time: 'now',
        likes: '0',
      };
      return {
        comments: { ...s.comments, [id]: [mine, ...(s.comments[id] || [])] },
        draft: '',
      };
    }),
}));

/** Comments shown for a recipe: the viewer's freshly-added ones, then the seeds. */
export const commentsForRecipe = (state: SizzleState, recipeId: string): Comment[] => [
  ...(state.comments[recipeId] || []),
  ...baseComments,
];
