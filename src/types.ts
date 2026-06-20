export interface Cook {
  id: string;
  name: string;
  handle: string;
  init: string;
  /** CSS gradient used for the cook's avatar / header. */
  bg: string;
  blurb: string;
  bio: string;
  followers: string;
  following: string;
  likes: string;
  /** Recipe ids authored by this cook. */
  recipes: string[];
}

export interface Recipe {
  id: string;
  title: string;
  /** Cook id. */
  cook: string;
  cuisine: string;
  time: string;
  servings: number;
  level: string;
  likeCount: string;
  dislikeCount: string;
  shareCount: string;
  commentCount: string;
  /** CSS gradient standing in for the recipe video poster. */
  bg: string;
  ingredients: string[];
  steps: string[];
}

export interface Comment {
  name: string;
  init: string;
  bg: string;
  text: string;
  time: string;
  likes: string;
}

/** Per-post creator controls. A flag being `true` means the feature is OFF. */
export interface PostSettings {
  likesOff?: boolean;
  commentsOff?: boolean;
  hideCount?: boolean;
}

export type Phase = 'onboarding' | 'app';
export type Tab = 'feed' | 'discover' | 'saved' | 'profile';
export type FeedKind = 'foryou' | 'following';
