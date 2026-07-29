/**
 * Client-local types.
 *
 * `Cook` / `Recipe` / `Comment` type the design-prototype fixtures in `data.ts`, which exist
 * only to feed `apps/api/src/scripts/seed.ts`. They are NOT the app's data model — that is
 * `@sizzle/shared` (`CookProfile`, `RecipeCard`, `RecipeDetail`, `CommentDTO`). Never import
 * these three into a component.
 *
 * `Phase` / `Tab` / `FeedKind` are live client-only UI enums.
 */
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

// NOTE: a local `PostSettings` used to live here, backing a client-only `postSettings` map in
// the store. Per-post creator controls are server-authoritative — the real type is
// `PostControls` in `@sizzle/shared`, persisted via PATCH /recipes/:id/controls — so the
// client-only copy was removed rather than left as a second, divergent source of truth.

export type Phase = 'onboarding' | 'app';
export type Tab = 'feed' | 'discover' | 'saved' | 'profile';
export type FeedKind = 'foryou' | 'following';
