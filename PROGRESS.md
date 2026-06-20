# Sizzle — Build Progress

Running log so any session can pick up cleanly. **Last updated:** 2026-06-19.

Stack: **Node + TypeScript**, **Hono** API, **Supabase** (Postgres/Auth/Storage), **Cloudflare Stream** (video, behind an interface — mock by default), Vite/React web client. Monorepo via npm workspaces.

---

## Phase roadmap

| Phase | Scope | Status |
|-------|-------|--------|
| **1** | Foundation + core loop (scaffold, schema, auth, upload, feeds, follow/like/save, seed, **UI wired**) | ✅ Core complete |
| 2 | Social depth + search (profiles, comments, search/discovery, notifications) | ✅ Done |
| 3 | Offline downloads | ✅ Done |
| 4 | Recommendation algorithm — For You ranking modeled on X's algorithm ([design](docs/recommendation-algorithm.md)) | 🟢 Stage 1 done (heuristic); Stage 2 (learned) needs training infra |
| 5 | Production hardening (rate limits, validation, moderation, transcoding cost, analytics, security) | ⬜ Not started |

> Rule: app runnable locally at every step. No later-phase work pulled forward unless trivial (and noted).

## Phase 2 — done (verified in-browser, all screens)
- **Comments (server-backed):** `comments` table; `GET/POST /recipes/:id/comments`; denormalized count via RPC; comments sheet wired with real authors/avatars/times + optimistic add; a few seeded per recipe.
- **Search:** `GET /search?q=` (recipes by title/cuisine, cooks by name/handle); Discover search box live with recipe tiles + cook results + clear button + trend-chip shortcuts.
- **Notifications:** `notifications` table; generated on follow/like/comment; `GET /me/notifications` + mark-read; bell on Profile with unread dot + a notifications sheet (all 3 types, tap-through).
- **Full profiles:** `PATCH /me` (name/handle/bio) + an Edit-profile sheet; Profile reads `/me`.
- Screens tested: feed (For You/Following), recipe sheet, cook sheet, discover+search, saved, profile, comments, notifications, edit-profile, settings, upload, onboarding.

## Phase 3 — done
- **`downloads` table** + `POST/DELETE /recipes/:id/download`; `viewer.downloaded` now server-driven (mapper reads the table).
- Recipe sheet download button wired to the real toggle (optimistic). Saved tab: real Offline badge + a working **All / Offline filter**.
- **Local offline cache** (`lib/offline.ts`, localStorage): downloading stores the full recipe (metadata + ingredients/steps + poster) so it's readable with no network. Saved + recipe sheet fall back to the cache when offline; an **offline banner** shows.
- Fixed: reaction/save/download mutations now also invalidate the recipe-detail query (was causing stale optimistic state). Vite dev `watch.ignored` for tsbuildinfo/dist (stop HMR reload flaps during testing).
- Note: true offline *video playback* needs the real Cloudflare MP4 + Cache API (poster is cached) — a follow-up.

## Phase 4 — Stage 1 ranking (done); Stage 2 learned model = future
- **Instrumentation:** `recipe_impressions` (logged server-side when the feed serves items) + `recipe_views` (`POST /recipes/:id/view` with dwell/completed/skipped; web logs via IntersectionObserver on feed cards).
- **Heuristic ranker** (`services/ranking.ts`): For You is now a real scoring pipeline — candidate window → multi-signal score (recency + taste + follow + cook-affinity + popularity − seen − dislike − skip) → greedy **cook-diversity** attenuation → impression-aware. Guests/pagination stay recency.
- **Verified**: with tastes=Japanese + follow Theo + like-a-Lila-recipe + dislike-a-Dev-recipe, the feed ordered Japanese/Theo top, Lila lifted, **Dev pushed to the bottom**, cooks interleaved; 30 impressions + 1 view logged.
- **Stage 2 (learned)** = two-tower retrieval + multi-action model trained on the now-collected signals — needs an offline training pipeline (out of scope for the app runtime); `scoreRecipe` is the swap-in point.

---

## Phase 1 — slice tracker

Phase 1 is being built in slices. Each slice keeps the app runnable.

### ✅ Slice A — Foundation + Auth  *(done)*
- **Monorepo**: restructured to `apps/web`, `apps/api`, `packages/shared`, `supabase/`. npm workspaces; root scripts for dev/build/db.
- **API skeleton (Hono)**: env (zod, local Supabase defaults), CORS, logger, central error handler, `GET /health`, JWT auth middleware (`requireAuth` / `optionalAuth`) verifying Supabase sessions. Deployable bundle via esbuild.
- **DB schema + migration** (`supabase/migrations/`): `profiles`, `video_assets`, `recipes`, `recipe_ingredients`, `recipe_steps`, `follows`, `reactions`, `saves`. RLS on every table (subselect-wrapped `auth.uid()`, role-targeted, indexed FKs). Signup→profile trigger.
- **Auth wired to onboarding**: real typeable email + password, **Log in** entry (hero + toggle), Apple/Google buttons (OAuth-wired; need provider creds), **"Skip for now" preserved as guest**, sign-out (via Profile gear, temporary). Session persisted; returning users skip onboarding.
- **`GET /me`** + **`POST /me/tastes`**: real, RLS-scoped, proves end-to-end auth.
- **Video pipeline abstraction**: `VideoStreamProvider` interface with `MockStream` (default, no account needed) + `CloudflareStream` (real, behind `VIDEO_PROVIDER=cloudflare`).
- **Shared DTOs** (`@sizzle/shared`): the API contract, consumed by web + api.

### ✅ Slice B — Data endpoints + seed  *(done — verified end-to-end)*
- `GET /feed/for-you` (recent) and `GET /feed/following` — cursor-paginated, viewer state hydrated.
- `GET /recipes/:id` (ingredients/steps + viewer state); `POST /recipes` (+ ingredients/steps, marks cook).
- `POST /recipes/:id/{like,dislike,save}` (reactions mutually exclusive) + `POST/DELETE /cooks/:id/follow`, with atomic denormalized counter RPCs.
- `GET /cooks/:id`, `GET /me/saved`.
- `POST /uploads/video` (direct upload via stream provider; mock = ready instantly) + Cloudflare webhook.
- **Seed script** from `apps/web/src/data.ts` → 5 cooks (as auth users) + 10 recipes + ingredients/steps + ready mock video assets + seeded counts. Idempotent. Run: `npm run seed`.
- **Verified live**: guest feed (10 items), signup→`/me`, recipe detail, like (counter +1), save, follow, following feed, `/me/saved`.

### ✅ Slice B2 — Web wired to the API  *(done — verified end-to-end in-browser)*
- **TanStack Query** for server state (`apps/web/src/data/queries.ts`); `QueryClientProvider` in main.
- Feed (For You + Following), Discover, Saved, Profile, Recipe sheet, Cook sheet all read the API (no more mock `data.ts` for app content). `formatCount()` client-side.
- **Optimistic mutations** for like / dislike / save / follow (patch every cache the item appears in; rollback on error; invalidate on settle).
- **Upload button → real recipe**: a create form → `POST /uploads/video` → `POST /recipes`, then the feed refetches and shows it.
- Profile → `/me`; onboarding taste picks persisted via `POST /me/tastes` on first auth.
- **Guest gating**: guests browse For You; gated actions (like/save/follow/upload) route to sign-in.
- Verified in-browser: signup → live feed → like (persists across reload) → upload (lands in feed, ordered newest) → real profile.

**Phase 1 goal achieved:** create an account → upload a recipe → see it in a feed → like/save/follow, end-to-end locally.

### ➕ Onboarding personalization (taste → creators)  *(done — verified in-browser)*
An early, heuristic slice of the Phase 4 ranking design (the cold-start front-half; learned model still Phase 4):
- `GET /cooks/suggested?tastes=…` ranks creators by taste overlap (keyword signals in `apps/api/src/services/taste.ts`); **Step 2 "Follow a few cooks" now shows real, taste-ranked cooks** with the matched taste shown as the "why".
- Cooks followed in onboarding are **replayed to the account on first auth**; tastes persist via `/me/tastes`.
- `GET /feed/for-you` gives an authed viewer with tastes a **taste-boosted cold-start** ordering (taste-match-first, then recency).
- Verified: pick *Japanese + Spicy* → Step 2 surfaces Dev/Mina/Lila → follow → signup → follow persists → Following feed shows that cook; For You leads with taste-matching recipes.

### ➕ Instagram-style metric privacy  *(done — verified)*
- Like / dislike / comment / share **count numbers are visible only to the recipe's creator**. Viewers + guests see the actions (Like / No / icons) but not the totals. Driven by a per-viewer `controls.countsVisible = (viewer === cook)` on every RecipeCard (`apps/api/src/mappers.ts`).
- Applies to: feed rail, Discover tiles, comments-sheet header. Comments themselves stay readable/postable by everyone (IG keeps the thread public — only the metrics are hidden). Cook **profile** aggregates (followers/likes) are left public, like IG follower counts.
- Verified: viewer feed shows "Like"/"No" + bare icons; creator sees full counts on their own posts only.

Deferred polish / later phases: real HLS **video playback** (cards show poster + play affordance; player is a follow-up), scroll-to-top after posting, onboarding **cook-follow** replay (follows work everywhere in-app), and **comments** (local-only until Phase 2).

---

## What's real vs. stubbed (today)

| Area | State |
|------|-------|
| Auth (email/password, sessions, guest, sign-out) | **Real** |
| Apple / Google OAuth | Wired, **needs provider config** to function |
| API: `/health`, `/me`, `/me/tastes`, `/me/saved` | **Real** |
| API: feeds, recipe detail, `POST /recipes`, like/dislike/save, follow, cook profile, uploads | **Real** (verified against Postgres) |
| **Web** feeds/discover/saved/profile/recipe/cook | **Real** (TanStack Query + optimistic mutations) |
| Video upload (metadata + asset) | **Real**; playback is poster-only (HLS player is a follow-up) |
| Onboarding tastes | Persisted via `/me/tastes` on first auth; cook-follow replay deferred |
| Comments | Local-only (Phase 2) |

---

## Run locally (full stack)

Prereqs: Node 20+, **Docker Desktop running** (for Supabase).

```bash
npm install

# 1) start Supabase (Postgres+Auth+Storage) — applies migrations
npm run db:start          # = supabase start ; prints local URLs + keys
# (npm run db:reset re-applies migrations from scratch)

# 2) env files (defaults already match local Supabase; copy once)
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env

# 3) run web + api together
npm run dev:all           # web → http://localhost:5173 , api → http://localhost:8787
#   or separately: npm run dev:web   |   npm run dev:api
```

### Test the auth slice
1. Open http://localhost:5173 → **Get started** → pick tastes → follow cooks → **Create account** (real email + password) → lands in the app.
2. Reload → you stay signed in (session persisted).
3. Profile tab → **gear icon** = sign out → back to onboarding.
4. **Log in** (hero or toggle) with the same credentials → back in.
5. **Skip for now** → guest browsing (no account).
6. API check: `curl localhost:8787/health` → ok. `curl localhost:8787/me` → 401 (needs token).

> Without Docker/Supabase the web UI still loads and is fully navigable; only auth calls error (friendly message).

---

## Key decisions
- **Hono** over Express (TS-first, lighter, edge-portable later).
- **Local Supabase** for dev; well-known local keys are the env defaults so it runs with no config.
- **Cloudflare Stream behind an interface** — mock by default so Phase 1 needs no video account.
- Counts are **integers** in the API; the client formats them. Recipe `bg` gradient is a **loading fallback** for the real poster/HLS.
- Denormalized display counters on `profiles`/`recipes` so seeded sample data shows realistic totals.

## Deploy (later)
API bundles to `apps/api/dist/index.js` (`npm run build -w @sizzle/api`), runs with `node dist/index.js`. Target Railway/Fly with env = a hosted Supabase project + (optional) Cloudflare Stream creds. Web is a static Vite build.
