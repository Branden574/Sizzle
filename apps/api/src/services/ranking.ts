import type { RecipeRow } from '../mappers';
import { tasteScore } from './taste';

/**
 * Stage 1 heuristic For You ranker — the explainable front-half of the
 * X-algorithm design (docs/recommendation-algorithm.md). Scores each candidate
 * by a weighted blend of signals, then attenuates repeated cooks for diversity.
 * A learned model replaces `scoreRecipe` in Stage 2; the pipeline stays.
 */
export interface ViewerSignals {
  tastes: string[];
  followedCooks: Set<string>;
  /** cook id -> positive engagement count (likes + saves + completed watches). */
  affinity: Map<string, number>;
  /** hashtag -> positive engagement count (the X-style topic/hashtag signal). */
  tagAffinity: Map<string, number>;
  /** cooks whose recipes the viewer disliked. */
  dislikedCooks: Set<string>;
  /** recipes already served recently (served history). */
  impressed: Set<string>;
  /** cook id -> number of fast-skips. */
  skips: Map<string, number>;
  /** cook id -> admin boost factor (0 = none). A per-creator ranking lift set
   *  from the admin dashboard; folded in as one more signal so a boosted creator
   *  rises naturally rather than pinning to the top. */
  boosts: Map<string, number>;
}

export const RANK_WEIGHTS = {
  recency: 1.0,
  taste: 6.0,
  follow: 5.0,
  affinity: 2.0,
  hashtag: 4.0,
  popular: 1.5,
  // Qualified cooks: someone actually finished cooking it. The strongest
  // quality signal on the platform — weighted above raw popularity, and
  // log-scaled so early recipes aren't buried by old hits.
  cooked: 2.5,
  // Sends-per-reach: DM'ing a recipe to a friend is a personal endorsement —
  // Instagram ranks it #1. Log-scaled like cooks.
  sends: 2.0,
  // Admin boost: factor 1 ≈ the pull of a follow. Bounded to [0,3] in the DB.
  boost: 5.0,
  seenPenalty: 4.0,
  dislikePenalty: 8.0,
  skipPenalty: 1.0,
  diversityPenalty: 3.0,
};

function recencyScore(createdAt: string, now: number): number {
  const ageDays = (now - new Date(createdAt).getTime()) / 86_400_000;
  return Math.max(0, 1 - ageDays / 14); // decays to 0 over ~2 weeks
}

function popularityScore(likeCount: number): number {
  return Math.min(1, Math.log10(likeCount + 1) / 6); // ~1.0 around 1M likes
}

function cookedScore(cookCount: number): number {
  return Math.min(1, Math.log10(cookCount + 1) / 3); // ~1.0 around 1K cooks
}

function sendsScore(sendCount: number): number {
  return Math.min(1, Math.log10(sendCount + 1) / 3); // ~1.0 around 1K sends
}

export function scoreRecipe(r: RecipeRow, s: ViewerSignals, now: number): number {
  const W = RANK_WEIGHTS;
  let score = W.recency * recencyScore(r.created_at, now);
  // Tastes match against cuisine + title + hashtags, so a recipe tagged
  // #korean lifts a viewer who picked "Korean" even if its cuisine field differs.
  if (tasteScore(`${r.cuisine} ${r.title} ${(r.tags ?? []).join(' ')}`, s.tastes) > 0) score += W.taste;
  if (s.followedCooks.has(r.cook_id)) score += W.follow;
  score += W.affinity * Math.min(1, (s.affinity.get(r.cook_id) ?? 0) / 5);
  // Hashtag affinity: sum the viewer's engagement with this recipe's tags.
  let tagPull = 0;
  for (const t of r.tags ?? []) tagPull += s.tagAffinity.get(t) ?? 0;
  if (tagPull > 0) score += W.hashtag * Math.min(1, tagPull / 5);
  score += W.popular * popularityScore(r.like_count);
  score += W.cooked * cookedScore(r.cook_count ?? 0);
  score += W.sends * sendsScore(r.send_count ?? 0);
  // Admin boost — one more positive signal, so a boosted creator still competes
  // with taste/follow/recency (and the diversity cap) instead of pinning to #1.
  const boost = s.boosts.get(r.cook_id) ?? 0;
  if (boost > 0) score += W.boost * boost;
  if (s.impressed.has(r.id)) score -= W.seenPenalty;
  if (s.dislikedCooks.has(r.cook_id)) score -= W.dislikePenalty;
  score -= W.skipPenalty * Math.min(3, s.skips.get(r.cook_id) ?? 0);
  return score;
}

/**
 * Greedy ranking with cook-diversity attenuation: each already-picked recipe
 * from the same cook lowers that cook's remaining recipes' effective score.
 */
export function rankRecipes(rows: RecipeRow[], s: ViewerSignals, now: number): RecipeRow[] {
  const pool = rows.map((r) => ({ r, base: scoreRecipe(r, s, now) }));
  const out: RecipeRow[] = [];
  const cookCount = new Map<string, number>();

  while (pool.length) {
    let bestIdx = 0;
    let bestScore = -Infinity;
    for (let i = 0; i < pool.length; i++) {
      const { r, base } = pool[i]!;
      const effective = base - (cookCount.get(r.cook_id) ?? 0) * RANK_WEIGHTS.diversityPenalty;
      if (effective > bestScore) {
        bestScore = effective;
        bestIdx = i;
      }
    }
    const picked = pool.splice(bestIdx, 1)[0]!;
    cookCount.set(picked.r.cook_id, (cookCount.get(picked.r.cook_id) ?? 0) + 1);
    out.push(picked.r);
  }
  return out;
}
