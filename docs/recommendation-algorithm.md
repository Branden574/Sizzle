# For You Ranking — Design (Phase 4)

> **Decision:** Sizzle's For You feed is modeled on X's open-sourced recommendation system
> ([xai-org/x-algorithm](https://github.com/xai-org/x-algorithm), May 2026 release), adapted from
> tweets to recipe videos. We adopt X's **architecture and scoring philosophy**; we do **not** ship a
> Grok transformer. The ranker starts as an explainable heuristic and is swapped for a learned model
> behind the same interface.
>
> This is **Phase 4**. It is not built yet. The current `GET /feed/for-you` returns recent published
> recipes as a placeholder — its response shape (RecipeCards) is the stable contract the ranker slots behind.

## How X's algorithm works (the parts we mirror)

X's `Home Mixer` orchestrates a `candidate-pipeline` with composable traits — **Source → Hydrator →
Filter → Scorer → Selector → SideEffect** — run in parallel where possible:

1. **Query hydration** — load the viewer's engagement history + context (follows, preferences).
2. **Candidate sources** — two of them:
   - `Thunder` = **in-network**: recent posts from accounts you follow.
   - `Phoenix Retrieval` = **out-of-network**: a **two-tower** model (user tower + item tower) that
     retrieves top-K by embedding dot-product over the global corpus.
3. **Hydration** — enrich candidates with metadata/author/media.
4. **Pre-scoring filters** — dedup, age, self-authored, blocked/muted, muted keywords, already
     seen/served.
5. **Scoring** —
   - `Phoenix` ranker (Grok transformer) predicts **multi-action probabilities** with **candidate
     isolation** (a candidate attends only to user context, never to sibling candidates → scores are
     consistent and cacheable).
   - `Weighted Scorer`: `Final = Σ(weight_i × P(action_i))` — positive actions positive weight,
     negative actions (block/mute/report/not-interested) negative weight.
   - `Author Diversity Scorer`: attenuate repeated authors. `OON Scorer`: adjust out-of-network.
6. **Selection** — sort by final score, take top K.
7. **Post-selection filters** — visibility/moderation.
8. **Side effects** — record served history (impressions) for future requests.

**Headline design choices we keep:** multi-action prediction (not a single relevance score),
candidate isolation (cacheable per-item scores), author/creator diversity, two-source (in/out of
network) candidate generation, a composable pipeline so sources/filters/scorers are pluggable, and
served-history tracking so the feed doesn't repeat.

## Mapping to Sizzle (tweets → recipe videos)

| X concept | Sizzle equivalent |
|---|---|
| Post / tweet | Recipe video |
| Author | Cook |
| Thunder (in-network) | Recent recipes from cooks the viewer **follows** |
| Phoenix retrieval (out-of-network) | Recipes from non-followed cooks, retrieved by **taste + content + collaborative** similarity |
| User engagement sequence | like / dislike / save / download / open-recipe / **watch-through** / skip / share / follow / comment |
| Author diversity scorer | **Cook** diversity attenuation |
| Visibility filtering | Removed/flagged recipes; content moderation (Phase 5) |
| Served-history side effect | `recipe_impressions` (don't re-serve recently seen) |

### Our action set + initial weights (heuristic stage)

Positive intent (high → low): **save (download > save) ≈ watch-complete > follow-after-watch >
open-recipe > like > share > comment**. Negative: **dislike, fast-skip, not-interested, hide-cook,
report**.

```
score = Σ ( w_action · P(action) )
  w_save = 1.0   w_complete = 0.9   w_follow = 0.8   w_open = 0.6
  w_like = 0.5   w_share = 0.5      w_comment = 0.4
  w_skip = -0.6  w_dislike = -0.8   w_not_interested = -1.0
  w_report = -2.0
```

`P(action)` is estimated per (viewer, recipe). In the **heuristic stage** these come from cheap
priors: the recipe's historical engagement *rates* (likes/saves per impression), recency decay,
**taste match** (onboarding `profiles.tastes` ∩ recipe cuisine/tags), **cook affinity** (your
past engagement with this cook / similar cooks), and **hashtag affinity** (see below). In the
**learned stage** they come from the model.

### Hashtag affinity (the topic/hashtag signal — X's "SimClusters"/topic analogue)

Recipes carry normalized `tags text[]` parsed from the caption + title (`services/hashtags.ts`;
the **same** normalization is used on the write path and on search/feed read paths). `loadViewerSignals`
builds a per-viewer `tagAffinity: Map<tag, count>` by summing the tags of every recipe the viewer
**liked / saved / watched-to-completion**. `scoreRecipe` then adds `w_hashtag · min(1, Σ tagAffinity[t] / 5)`
over the candidate's tags (weight `4.0`, between follow and popularity). Net effect: engaging with a
hashtag boosts other posts carrying it (clickable `#tags` → `GET /feed/tag/:tag`; trending via
`GET /feed/trending-tags`), giving tagged posts extra reach — the same topic-affinity loop X runs over
its topic/community embeddings, at our scale and explainable.

## Our pipeline (same shape as X, our scale)

Implemented in `apps/api` as a small composable pipeline mirroring `candidate-pipeline`:

```
Sources:    InNetworkRecent  +  OutOfNetworkRetrieval(taste/content/collab)
Hydrators:  counts, cook, video, viewer-state, content features
Filters:    dedup · self · already-engaged · impression-seen · taste-hard-excludes · age(in-net)
Scorers:    MultiActionScorer → WeightedScorer → CookDiversityScorer → OONScorer
Selector:   sort by score, take top K (cursor-paginated)
Post-filter: visibility / moderation (Phase 5)
SideEffect: write recipe_impressions(viewer, recipe, served_at)
```

Each stage is an interface, so we can add sources/filters/scorers without touching the others —
exactly X's "composable pipeline" decision.

## Phased build

- **Stage 0 — now (Phase 1):** `for-you` = recent published. Endpoint shape frozen.
- **Stage 1 — Phase 4a (heuristic ranker, no ML):** full pipeline above with the weighted
  multi-action **heuristic** scorer + cook diversity + impression filtering + out-of-network taste
  retrieval. Real, explainable, debuggable ranking with zero training.
- **Stage 2 — Phase 4b (learned ranker):** log engagement+watch sequences, train (a) a **two-tower
  retrieval** model for out-of-network candidates and (b) a **multi-action ranker** (gradient-boosted
  trees first; a small candidate-isolated transformer later) that outputs the `P(action)` vector.
  Serve behind the same `Scorer` interface; the heuristic stays as fallback / cold-start.

## Prerequisites (instrumentation we must add before Stage 1/2)

The model is only as good as the signals. Before ranking we need to capture, which the current schema
does **not** yet have:

- `recipe_impressions(user_id, recipe_id, served_at)` — served history (powers de-dup + CTR).
- `recipe_views(user_id, recipe_id, dwell_ms, completed bool, skipped bool, created_at)` — **watch
  behavior** (the strongest signal; Phase 4 in the roadmap explicitly calls this out).
- Recipe **content features / embedding** (from cuisine + tags + ingredients + title) for retrieval.
- A per-user **taste vector** (seeded from onboarding `profiles.tastes`, updated by behavior).

These are added at the start of Phase 4, not now.

## References
- X algorithm (source of this design): https://github.com/xai-org/x-algorithm
- Phoenix (retrieval two-tower + candidate-isolated ranking transformer): `phoenix/README.md` in that repo.
