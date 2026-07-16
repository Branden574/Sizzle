# Sizzle — Build Progress

Running log so any session can pick up cleanly. **Last updated:** 2026-07-16.

Stack: **Node + TypeScript**, **Hono** API, **Supabase** (Postgres/Auth/Storage), **Cloudflare Stream** (video, behind an interface — mock by default), Vite/React web client. Monorepo via npm workspaces.

---

## Phase roadmap

| Phase | Scope | Status |
|-------|-------|--------|
| **1** | Foundation + core loop (scaffold, schema, auth, upload, feeds, follow/like/save, seed, **UI wired**) | ✅ Core complete |
| 2 | Social depth + search (profiles, comments, search/discovery, notifications) | ✅ Done |
| 3 | Offline downloads | ✅ Done |
| 4 | Recommendation algorithm — For You ranking modeled on X's algorithm ([design](docs/recommendation-algorithm.md)) | 🟢 Stage 1 done (heuristic); Stage 2 (learned) needs training infra |
| 5 | Production hardening (rate limits, validation, moderation, security review) | ✅ Done (analytics/APM = noted follow-up) |

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

## Phase 5 — production hardening (done)
- **Rate limiting** (in-memory fixed-window): global IP + tighter per-user on writes (comments, uploads, views, recipe-create).
- **Security headers** (nosniff/frame-deny/referrer/HSTS), 1 MB body limit, CORS to `WEB_ORIGIN`.
- **Validation:** zod everywhere (+ length caps); UUID validation on `:id` params (malformed → 404).
- **Content moderation hook** on recipe + comment creation (placeholder blocklist + link-spam; swap in a real provider).
- **Independent security review** (security agent) — all CRITICAL/HIGH/MEDIUM resolved: webhook HMAC + uid validation, draft/removed hidden from non-owners, generic 5xx errors (no PG leak), parameterized search, atomic advisory-locked reaction RPC, demo-key boot guard. See [docs/security.md](docs/security.md).
- **Deploy guide** ([docs/deploy.md](docs/deploy.md)): Supabase hosted + Railway/Fly API + static web + Cloudflare Stream.
- Follow-ups (noted): real moderation provider, trusted-proxy config for IP limiter, analytics/APM (Sentry), vite/esbuild dev-CVE bump.

---

## Big feature batch — 2026-06-20 (all verified in-browser + API + DB)

- **Comment likes + threaded replies + counts** — `comment_likes` table + `toggle_comment_like` advisory-lock RPC; `comments.parent_id` (single-level) + `reply_count`; `POST /recipes/:id/comments/:commentId/like`; replies via `parentId`. CommentsSheet: tappable hearts (likedByMe), reply composer, nested rendering; counts public. (migration `…210000_comment_social.sql`)
- **Video sound + autoplay setting** — VideoPlayer reads global `muted`/`autoplay` (zustand + localStorage); unmute button on the video; new app **Settings sheet** (gear → Autoplay / Start-with-sound toggles + Log out). Autoplay-off ⇒ active card waits for a tap.
- **Forgot password** — `useAuth.resetPassword`/`updatePassword`; "Forgot password?" → reset-request view; `PASSWORD_RECOVERY` deep-link → `ResetPasswordScreen` (strong-password rules). Verified via Mailpit → recovery link → new password → login.
- **Editable phone** — confirmed round-trips (EditProfileSheet → `PATCH /me` → `profiles.phone`).
- **Post reporting** — `reports` table (one per user/recipe) + RLS; `POST /recipes/:id/report` (category nudity/harassment/violence/spam/other, idempotent). Post "…" → **MoreSheet** (Report always; **Post controls only for the owner**) → ReportSheet reason picker.
- **Admin dashboard + verification + bans** (`…230000_admin.sql`) — `profiles.role/verified_tier/banned`; **guard trigger** blocks authenticated JWTs from changing privileged columns (service-role/admin only); `branden574@gmail.com` auto-admin on signup. Follower **milestone trigger**: 100k → blue, 1M → animated gold (sticky, notifies admins). `requireAdmin`/`requireNotBanned` middleware; banned users' writes 403 + content hidden from feeds (buildCards drops banned cooks). Admin API (`/admin/*`): stats, report queue (dismiss / remove-post), user mgmt (verify None/Blue/Gold, ban/unban, admin-protected). Web `AdminDashboard` gated to `me.role==='admin'`.
- **Verification badges** — `VerifiedBadge` (blue seal / animated gold via `sz-gold-shine` keyframe) on feed cards, cook profile, own profile, recipe detail, admin list.
- **Hashtags + algorithm** (`…240000_hashtags.sql`) — `recipes.tags text[]` (GIN) + `caption`, parsed via `services/hashtags.ts` (shared normalization write+read). Clickable `#tags` on cards + recipe detail → **HashtagSheet** feed; `GET /feed/tag/:tag`, `GET /feed/trending-tags`; Discover trending chips; `#tag` (and plain-text→tag) search. **Ranker**: new `tagAffinity` signal (engagement with a tag boosts same-tagged posts; weight 4.0) — verified a liked tag lifted a same-tagged post to #1. Upload caption field for hashtags.
- **4K / 30-min uploads** — provider `maxDurationSeconds` 120 → 1800; server rejects >30-min (400); storage `file_size_limit` 150MiB → **5GiB**; shared `MAX_DURATION_SECONDS`/`MAX_UPLOAD_BYTES`/`MAX_VIDEO_LONG_SIDE`; client size/duration guards; copy "Up to 30 min · 4K".

---

## Moderation, ban lifecycle, reposts, scrubber — 2026-06-20 (verified API + DB + in-browser)

**Security fixes (from an adversarial review of the prior batch):**
- **Profile column-lock** (`…250000_profile_column_lock.sql`) — `REVOKE UPDATE ON profiles FROM authenticated` + `GRANT UPDATE (display_name, handle, bio, avatar_url, banner_url, phone, tastes)`. Closes a real hole: a user could `PATCH /rest/v1/profiles` their own `follower_count` directly and the milestone trigger (which fires *after* the guard trigger, alphabetically) would self-grant them a gold badge. Verified the exploit now returns `permission denied`; legit edits still 204.
- **Ban enforcement** — added `requireNotBanned` to report / like / dislike / save / view / comment-like and DELETE follow (were ungated).
- **Admin bootstrap** (`branden574@gmail.com` auto-admin) kept per request; **flagged**: enable email confirmation in production so the email is verified before admin is granted (or seed admin by `auth.users.id`).

**Moderation queue + appeals (`…260000_moderation_repost.sql`):**
- Reports only surface to the admin once a post has **≥5 distinct reporters** (queue aggregates per-recipe with a category breakdown). Each entry: **View video**, **Mark false**, **Remove** (with reason).
- Removed posts (`status='removed'` + `removal_reason`) stay on the **owner's** profile with a "Video removed: reason" overlay; the recipe detail shows the reason + an **appeal** composer. Admin **Appeals** tab → **Restore** (republish) or **Deny**. Owner notified in-app on remove/restore.
- Accounts auto-**flagged** at >100 total reports (admin filter + ⚑ indicator).

**Ban → 45-day delete lifecycle:**
- Ban is immediate (`banned=true`) and sets `delete_at = now + 45 days`; the admin user card shows a live **"wipes in N days"** countdown + reason. Banned user gets a full-screen suspension screen with reason + countdown + **appeal**; admin sees ban appeals. Unban clears everything.
- **Auto-wipe**: `purge_expired_accounts()` deletes `auth.users` past `delete_at` (cascades all data), scheduled **daily via pg_cron** (`sizzle-purge-expired`); admin also has a "Run purge" button. Verified a past-due ban is fully wiped. *(Real email-on-ban needs an email provider — flagged.)*

**Reposts (TikTok-style, `reposts` table):**
- Post "…" → **Repost** → optional quote comment. Reposts surface **only to mutual-follow friends** (you follow them and they follow you), merged into the **Following** feed with a "↻ Reposted by X · comment" header. Verified: a mutual sees it, a one-way follower does not.

**Video scrubber** — `VideoPlayer` draws a progress bar just above the nav; pointer-drag seeks (smooth + accurate, time label while scrubbing), `stopPropagation` so it doesn't toggle play/pause. Verified a drag to 50% jumps to the midpoint.

**Admin extras (`…270000_admin_extras.sql`):**
- **Auto-hide** at **20 distinct reporters** (`recipes.auto_hidden`) — hidden from public feeds (one report per person is enforced by `unique(recipe_id, reporter_id)`, so 20 = 20 people); owner sees an "Under review" overlay; admin queue chips it; Mark-false / Remove clear it. Verified end-to-end.
- **Audit log** (`moderation_log`) — every admin action (remove/restore/mark-false/deny/ban/unban/verify) + system auto-hide recorded; **Log** tab in the dashboard. `GET /admin/log`.
- **Repeat-offender** — accounts with ≥3 removed videos surfaced (chip + flagged filter). **Reporter-abuse throttle** — a user with ≥5 dismissed-as-false reports is blocked from new reports (403). Verified.

**Second adversarial review — all confirmed findings fixed + verified:**
- HIGH: a **banned admin kept full admin powers** (admin gate never checked `banned`) → added `requireNotBanned` to the admin chain.
- HIGH: `/me/saved` **leaked a removed post's moderation reason** to a non-owner who'd saved it → `buildCards` now drops removed/auto-hidden posts for non-owners (closes the whole class).
- MEDIUM: **PostgREST filter injection** in `/admin/users` search → strip `, . ( ) * : \` too.
- HIGH: **Following-feed pagination gap** (reposts displaced recipes, then the cursor skipped them) → reposts are now additive, never sliced against the recipe page.

**Follow lists, repost discoverability, count consistency + a 3rd review:**
- **Repost button** added to the feed rail (was only in the "…" menu).
- **Followers / Following are tappable** → a list sheet of the actual accounts (badge + tap-through). New `GET /cooks/:id/{followers,following}`; seed now creates cross-follows so the lists have content.
- **Count consistency** — `/me` now reads the denormalized `follower_count`/`following_count` (matching the cook profile + badge) instead of live follows-table counts, so a verified cook no longer shows "0 followers".
- Whole-codebase audit (rate-limited mid-run) confirmed + fixed: **reporter-abuse throttle was permanent** (a single admin bulk-dismiss penalized every honest reporter) → now a rolling 30-day window; **`profiles.total_likes` was never updated** on the live like path → `toggle_reaction` now maintains it + backfilled.
- **Error boundary** added (per-feed-card + app-level) so one bad component can't white-screen the app.

---

## Onboarding, foodie reviews, immersive UI, landscape video — 2026-06-20 (verified API + DB + in-browser)

- **Onboarding rework** — following cooks is now **optional** (step 2 always continues; CTA reads "Skip for now"). Suggested cooks are the platform's **top 5 by follower count** (`/cooks/suggested` sorts by `follower_count`, taste overlap is a tiebreaker only) and each card shows the cook's **follower count**. `SuggestedCook` DTO gained `followers`. Verified via curl (Dev Anand 401k → Theo 308k → …). Added **Halal / Kosher / Soul food** to the "what makes you hungry" taste grid.
- **Foodie reviews** (`…290000_post_type.sql`) — `recipes.post_type ('recipe'|'review')` + optional `rating smallint (1–5)` with CHECKs (rating only on a review). Upload composer has a **Recipe / Food review** segmented toggle: reviews swap ingredients/method for a **★ star picker** + review text, and drop time/serves. Feed card + RecipeSheet show a **★ Review** badge with the rating; "View review" CTA. Create endpoint validates (`rating` on a recipe → 400). Seed marks ~1 in 5 posts a review. Verified all three create paths + DB constraints via curl.
- **Hold-to-hide immersive UI** — a **long-press** on a feed card toggles `immersive` (zustand): all overlays (rail, cook info, more/mute/rotate buttons, scrubber, gradient, For-You/Following tabs) fade out and the **bottom nav slides off-screen** for distraction-free full-screen viewing; long-press again restores. Resets on tab/feed switch. Verified in-browser (overlays → opacity 0, nav → translateY(100%)).
- **Landscape video** — `VideoPlayer` detects intrinsic aspect; landscape clips are **letterboxed** (`contain`, no crop) and get a **rotate-to-full-screen** button that rotates the video 90° to fill the portrait viewport (the "turn your phone" experience), un-rotating when the card scrolls away. Upload preview adapts its aspect/fit to the picked clip; copy now reads "Portrait or landscape · up to 30 min · 4K". Verified in-browser with a real landscape clip.
- **Asymmetric follow seed** — the seed previously made every cook follow every other (complete graph) so a cook's *followers* list equalled their *following* list. Now each cook follows the **next 3 cooks (mod n)**, so the two lists differ (e.g. theocooks follows {devheat, lilamoreno, sorabakes} but is followed by {devheat, minapark, sorabakes}) while keeping mutual pairs for reposts. Verified via the `/cooks/:id/{followers,following}` endpoints.

> Note: the shared preview browser is currently signed into a seeded **theo** account (leftover from earlier test sign-ins). To use the real admin, sign in as **branden574@gmail.com** (confirmed `role='admin'` in the DB).

---

## Bug fixes, dark mode, expanded settings — 2026-06-20 (verified in-browser + adversarial review)

**Bug fixes (reported + found via a 5-agent diagnosis workflow):**
- **Sheet "opens behind"** — tapping a recipe inside the Hashtag feed (and Cook profile, and Admin "View video") opened RecipeSheet *behind* the opaque launcher. Root cause: RecipeSheet zIndex 80 < those sheets. Fixed by raising RecipeSheet to **97** and CommentsSheet to **98** (so comments open above a recipe). Verified hashtag→recipe→comments stacks correctly.
- **RecipeSheet action bar overlap** — the scroll content (zIndex 2) painted over the un-z-indexed bottom bar, and its gradient was half-transparent, so Save/Download bled behind the ingredients. Fixed: bar `zIndex 4` + solid `var(--bg)` + a 24px top feather.
- **Video "not playing in background"** — my landscape `objectFit:contain` letterboxed every (landscape sample) feed clip into a black band, and a play()/src race left the active card paused. Fixed: feed uses `cover` (full-bleed; rotate button still reveals the full landscape frame), and the autoplay effect now keys on `[active,autoplay,src]` with a `canplay` retry.
- **Other QA fixes**: dead **Share** button → native share / clipboard; **Comments** entry added to RecipeSheet; **repost is now toggleable** (`viewer.reposted` added to the DTO + mapper reads the reposts table; feed button shows active state + un-reposts); **Edit profile** re-seeds state when `me` loads (no more wiping the profile from a cold cache) and blocks empty/<2-char handle; **notifications** mark-read only when there's something unread.

**Dynamic Light / Dark / System theme:**
- A semantic **CSS-variable token system** in `index.css` (`--bg/--surface/--surface-2,3/--text/--text-2/-muted/-soft/-faint/-faint-2/--line*/--track/--invert-bg,-fg/--warn-bg/--danger-bg/--nav-bg/--accent/--feed-bg/--scrim`), light defaults byte-identical to the prototype, dark overrides under `.sz-stage[data-theme="dark"]`. `theme.ts` tokens now resolve to `var(--…)`.
- Store gains a persisted **`theme: 'system'|'light'|'dark'`** pref; `App.tsx` resolves it (a `prefers-color-scheme` matchMedia listener tracks the OS live for "System"), sets `data-theme` on the stage, makes the status-bar/home-indicator glyphs theme-aware, and updates the `<meta name=theme-color>`.
- ~360 inline hex colors across **31 files** migrated to tokens via a 16-agent workflow (feed/video/upload stay intentionally dark). An adversarial review found 13 residual issues (cream gradient fades over dark bg, a few admin chips, low-contrast moderation text, a video mute/pause regression, etc.) — **all fixed**. Verified both modes in-browser; light mode unchanged.

**Expanded profile settings** (`AppSettingsSheet`): Appearance (System/Light/Dark) · Reduce motion (wired to a `.sz-reduce-motion` class) · Autoplay · Start with sound · Default feed (For You/Following) · Clear downloaded recipes · Log out · version.

---

## Cook Mode · serving scaler · collections · shopping list — 2026-06-20 (verified in-browser + curl)

A user-requested batch of four recipe-utility features. Ingredient amounts are parsed **client-side** from the existing free-text lines (`lib/ingredients.ts`: leading qty + unit + name, handles fractions/unicode/units; `scaleIngredient`/`formatQuantity`) — no schema change needed.

- **Serving scaler** — a **½× / 1× / 2×** control on the RecipeSheet Ingredients header recomputes every ingredient's quantity (lines with no number are left alone) and the "Serves" stat. Verified: 1× → 2× doubled "1 nest wheat noodles" → "2", "2 tbsp chili crisp" → "4", etc.
- **Cook Mode** (`CookModeSheet`, launched by "▶ Start cooking") — full-screen, one step at a time with progress dots, a **Steps ⇄ Items** toggle (checkable ingredient list), per-step **countdown timers** parsed from step text ("simmer 10 min"), and the **Screen Wake Lock API** so the phone won't sleep mid-cook (re-acquired on tab refocus).
- **Saved Collections** (cookbooks) — `…300000_collections.sql` (`collections` + `collection_recipes`, RLS owner-only). API on `/me/collections` (list with counts + cover + `hasRecipe`, create, delete, add/remove recipe, list recipes). A **"📁 Save to…"** picker (create + multi-toggle membership) on RecipeSheet; a **Collections** row in the Saved tab → `CollectionSheet` grid → recipe; delete. Full CRUD curl-verified.
- **Shopping list** (`lib/shopping.ts`, zustand+localStorage) — **"🛒 Shopping list"** on RecipeSheet adds the (scaled) ingredients, deduped per recipe; a **🛒 List** entry in the Saved tab opens `ShoppingListSheet` — items grouped by recipe, checkable, remove, Clear checked / Clear all.

Bug found + fixed during testing: the collection picker (z95) opened *behind* RecipeSheet (z97) — raised to z100. All four verified in dark mode.

A follow-up adversarial review (15 agents) found 7 real issues in the new code — all fixed: ingredient ranges ("2-3 sprigs") no longer mangled by the scaler; `formatQuantity` fraction-snap tightened (0.1 no longer shows ⅛); shopping-list ids made unique + re-adding a recipe replaces its prior lines (no dup/collision); Cook Mode timer side-effects moved out of the state updater; moderation-banner text given `--danger-fg`/`--warn-fg` tokens for dark-mode contrast. Also fixed: `useVerifyUser` now invalidates `me` so an admin granting *themselves* a check sees their badge update live.

---

## In-app camera recorder + permissions — 2026-06-20

- **Record straight from the app** (`CameraRecorder.tsx`, launched from the Upload sheet's "Record a video"). Requests **camera + microphone** via `getUserMedia` (the browser's native permission prompt) with a privacy-respectful rationale card for the prompt/denied/unsupported states and a "Use library" fallback. **No tracking** — copy states nothing is recorded or stored until you post; the camera is released on close/unmount.
- **TikTok-style capture**: **hold** the button to record while held, or **tap** for hands-free and tap again to stop — either way you can **stop and keep going**; segments accumulate into one continuous clip via `MediaRecorder` pause/resume. Segmented progress bar, elapsed/60s cap, flip front/back camera, Retake, Done. The recorded `File` flows into the existing probe → upload pipeline (so duration/4K limits + landscape handling all apply). Library upload remains as the alternative.
- **Permission UX hardened** (after the user hit a dead "Allow camera"): request is now on a **user gesture** (not on mount — iOS Safari only prompts from a gesture and re-prompts only after a tap), opens to a "Record your dish" rationale first, and on failure shows the **specific** `getUserMedia` error with steps (blocked → "tap the address-bar camera/lock icon → Allow → Try again"; no camera; camera-in-use; insecure context) instead of silently re-denying.
- **Demo camera fallback**: the embedded preview pane (and any blocked context) returns `NotAllowedError`, so a "Demo camera" button feeds a **synthetic animated canvas + quiet tone** through the *identical* MediaRecorder pipeline. This makes the whole record → segment → finalize → upload flow testable anywhere; real recording still uses the real camera when granted.
- **Verified end-to-end via the demo camera**: tapped record (hands-free), recorded, hit Done → produced a `File` → it showed as the composer's video preview → posted → uploaded to Supabase storage (`mp4_url`, 60s, status `ready`) → recipe created. (Test artifact deleted afterward.)
- **For a future native build** (Capacitor/wrapper): add the OS permission strings — iOS `NSCameraUsageDescription`, `NSMicrophoneUsageDescription`, `NSPhotoLibraryUsageDescription`; Android `CAMERA`, `RECORD_AUDIO`, media permissions. On the web these are handled by the browser at `getUserMedia`/file-input time.

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

### ➕ Public engagement counts + per-post hide toggle  *(done — verified)*
- Like / dislike / comment / **save** / share **count numbers are visible to everyone** (incl. guests) on posts — per the product decision to surface engagement publicly. `DEFAULT_CONTROLS.countsVisible = true` for all viewers (`apps/api/src/mappers.ts`).
- A creator can still hide counts on an individual post via the per-post **"Show counts"** control (client-local `postSettings[id].hideCount`); the rail then shows action labels (Like / No / Save) instead of totals.
- Save totals are denormalized (`recipes.save_count` + `adjust_save_count` RPC) and seeded, so cards show realistic save numbers.
- (Earlier this was creator-only "Instagram-style"; reversed on request so all metrics are public.)

### ➕ Video playback + real upload  *(done — verified in-browser)*
- **Playback:** new `VideoPlayer` (`apps/web/src/components/VideoPlayer.tsx`) plays the active feed card. HLS (`.m3u8`, seeded mock-provider clips) uses **hls.js** (lazy-loaded, code-split) where the browser lacks native HLS; **MP4** (user uploads) plays natively. Active card (≥60% on screen, via the card's IntersectionObserver) autoplays muted+looped; off-screen cards pause; **tap toggles** play/pause with a play overlay. Source selection prefers `mp4Url` then `hlsUrl`.
- **Real upload:** Upload sheet now picks a clip (`<input type=file accept=video/*>`), shows a live preview, captures a poster frame + duration client-side (`probeVideo`), uploads the clip + poster to a public, owner-scoped **`videos`** Storage bucket (`uploadVideo`/`uploadPoster`), then registers it via `POST /uploads/video {uploadedUrl,posterUrl,durationSeconds}` → a `provider:'storage'`, `status:'ready'` `video_asset` with `mp4_url`. The mock provider still supplies sample HLS for seeded recipes.
- Schema: migration `20260620200000_video_storage.sql` adds `video_assets.mp4_url` + the `videos` bucket/RLS; `VideoAssetDTO.mp4Url` carries it to the client.
- Verified: seeded cards stream HLS via hls.js (exactly one playing at a time, handoff on scroll, tap pause/resume); an uploaded recipe plays its MP4 natively; production build clean (hls.js split into its own chunk).

Deferred polish / later phases: scroll-to-top after posting, onboarding **cook-follow** replay (follows work everywhere in-app).

---

## What's real vs. stubbed (today)

| Area | State |
|------|-------|
| Auth (email/password, sessions, guest, sign-out) | **Real** |
| Apple / Google OAuth | Wired, **needs provider config** to function |
| API: `/health`, `/me`, `/me/tastes`, `/me/saved` | **Real** |
| API: feeds, recipe detail, `POST /recipes`, like/dislike/save, follow, cook profile, uploads | **Real** (verified against Postgres) |
| **Web** feeds/discover/saved/profile/recipe/cook | **Real** (TanStack Query + optimistic mutations) |
| Video playback (feed) | **Real** — HLS via hls.js + native MP4; active card autoplays, tap to pause |
| Video upload (pick clip → Storage → recipe) | **Real** — `videos` bucket + poster capture; mock HLS still backs seeded recipes |
| Onboarding tastes | Persisted via `/me/tastes` on first auth; cook-follow replay deferred |
| Comments (likes, threaded replies, counts) | **Real** — server-backed; tappable hearts + reply composer |
| Hashtags (parse, clickable feed, search, trending, ranking signal) | **Real** — `tags text[]` + GIN; X-style tag affinity in the ranker |
| Reporting + Admin dashboard (verify / ban / report queue) | **Real** — admin-gated; RLS-hardened privileged columns; milestone badges |
| Verification badges (blue 100k / animated gold 1M) | **Real** — auto via follower trigger + manual admin override |
| Forgot password + app Settings (autoplay / sound) | **Real** — Supabase recovery flow; client-persisted playback prefs |
| Upload limits | 4K · up to 30 min (storage 5GiB; provider cap 1800s) |

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

---

## Trust & safety + messaging + observability — 2026-06-26 (deployed)

- **Comment moderation (owner hide/unhide + delete)** — recipe owner/admin can delete OR hide/unhide any comment on their post; hidden = shadow-hide (author still sees their own, owner sees it tagged "Hidden"). `comments.hidden`; `POST /recipes/:id/comments/:commentId/hide`; visibility enforced in GET /comments.
- **Block / mute users** (`…030000_user_blocks_and_mutes.sql`) — Block = mutual invisibility everywhere (feed/search/profile/followers/suggested/comments/notifications/direct links via the `buildCards` chokepoint + `loadBlockedIds` both-directions); tears down follows both ways; blocked users can't follow/comment/like/dislike/view/repost/DM the blocker (guarded — no row, no push). Mute = silent feed-only. UI: profile "···" menu, blocked shell, Settings → Blocked accounts.
- **Direct messages** (`…040000_direct_messages.sql`) — 1:1 DMs (canonical-pair `conversations` + `messages`), inbox (Profile paper-plane icon + unread badge), chat thread (polling, optimistic send), "Message" button on profiles. Block- + ban-aware. `routes/messages.ts` at `/messages`. Realtime = future (polling for now).
- **Real moderation provider** — `services/moderation.ts` `moderate()` runs OpenAI's moderation model when `OPENAI_API_KEY` set, on top of the local blocklist; fails OPEN. Callers now `await moderate(...)`.
- **Observability** — dependency-free Sentry capture (API error handler + web global handlers/ErrorBoundary) gated on `SENTRY_DSN`/`VITE_SENTRY_DSN`; Resend email (`services/email.ts`) for ban/removal/restore, gated on `RESEND_API_KEY`. Both no-op + best-effort.

### Launch credential checklist (code is ready; these light up on configure)
- **Video (A1)**: Cloudflare Stream provider already coded (`services/stream.ts`). Set on `sizzle-api`: `VIDEO_PROVIDER=cloudflare`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_STREAM_TOKEN`.
- **Moderation (B3)**: `OPENAI_API_KEY` on `sizzle-api`.
- **Email + monitoring (A5)**: `RESEND_API_KEY` (+ `EMAIL_FROM`) and `SENTRY_DSN` on `sizzle-api`; `VITE_SENTRY_DSN` on `sizzle` (web).
- **Google (A4)**: OAuth consent screen → "Publish app" (no code).
- **Apple Sign-In (A2)**: Apple Services ID + key → Supabase Auth → Apple provider (client button already wired).
- **Vercel note**: the `sizzle-api` "Ignored Build Step" mis-skips some api-only commits — verify deploys via `gh api repos/Branden574/Sizzle/commits/<sha>/status` (look for "Deployment has completed", not "Skipped"/"inactive").

---

## Launch sprint — 2026-07-16 (payments live, video fixed, submission prep)

**Shipped + verified today:**
- **Stripe LIVE end-to-end** — Connect Express (v2 with v1 fallback), destination charges, Model B pricing (processing fee off the top, then 90/10 split, $5 floors), transparent charge breakdown, loss-protection (transfer reversals, dispute lifecycle incl. redelivery + hour-bucketed idempotency — live-fire tested against the deployed webhook), payouts onboarding lands on `payouts-done.html`.
- **Reviewer email chain proven** — `review@getsizzle.app` → Cloudflare Email Routing → dedicated ops Gmail; Resend suppression cleared; delivery confirmed. 12 production email templates in `emails/` (+ SPEC, partials, txt mirrors); Supabase recovery template installed.
- **Video posting on native FIXED** — root cause: iOS WKWebView never delivers the multipart body to Cloudflare direct upload. Native now uploads to Supabase Storage; the API relays into Cloudflare via `/copy` (normalizes HEVC→H.264/HLS). Proven E2E on production + a real post from the device.
- **TikTok-instant playback** — own posts play immediately from the local file (`localClips`); transcode poll extended 2min→10min adaptive (the old cap left cards stuck on "Processing"); posters retry transient 404s (`PosterImg`) instead of showing a broken-image icon. OTA 1.0.40–1.0.42.
- **Recipe macros per serving** — `calories/protein_g/carbs_g/fat_g` on `recipes`, DTOs, create/edit API (gated behind premium locks), composer + edit inputs, recipe-sheet display. Roundtrip-verified on production.
- **Compliance pass** — real support/privacy contacts, "Get Paid" roadmap gated off iOS, reports view fixes, SEO hides auto-hidden posts; expired auth links now explain themselves.
- **App Store Connect** — build 22 (VALID) attached, MANUAL release, export compliance answered.

**Still needed before submitting:**
1. Branden on build 22: one fresh email signup, one demo-account sign-in (`review@getsizzle.app`), confirm the posted video plays end-to-end. (Video posting itself re-verified ✓.)
2. ASC listing forms (agent drives, Branden approves): privacy nutrition labels, age rating questionnaire → 13+, copyright `© 2026 Branden Vincent-Walker`, subtitle, corrected review notes → then Submit for review.
3. Decision: landscape orientation is unlocked — ship build 22 as-is, lock in the first post-launch binary.
4. **Reconnect the Vercel GitHub webhook** (dashboard → either project → Settings → Git; disconnect/reconnect or reinstall the GitHub App). Pushes currently do NOT auto-deploy; CLI deploys are the workaround.
5. Email templates: final hex-by-hex design pass; wire the remaining templates into Supabase Auth + API send paths.

**Deferred / post-launch:** PO Box before promoting paid content; Stripe 1099 tax setting; premium-media signed URLs (Cloudflare `requireSignedURLs`); Supabase leaked-password protection toggle; feed virtualization; Creator Phase 2b notifications; Apple external-purchase link (Option C); Apple client secret regen ~every 6 months (`scripts/gen-apple-secret.mjs`).
