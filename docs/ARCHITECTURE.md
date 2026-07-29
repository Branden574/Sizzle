# Sizzle — architecture & feature map

The one page to read before changing anything. It answers "where does X live?" for every
major feature, and documents the boundaries that are load-bearing.

`README.md` covers setup and scripts. `CLAUDE.md` covers the hard guardrails (never `git add -A`,
never commit `.env*`, verify deploys promoted, etc). This file covers the code.

---

## 1. The shape of the repo

npm workspaces monorepo. Three packages, one database.

```
apps/web/        React 18 + Vite + TypeScript. Ships THREE ways from one codebase:
                   • the marketing site + web app at getsizzle.app
                   • a native iOS app (Capacitor 8 → WKWebView)
                   • a native Android app (Capacitor 8 → Android WebView)
apps/api/        Hono. Runs as a Vercel serverless function in production and as a
                 plain Node server locally. Holds the Supabase SERVICE-ROLE key.
packages/shared/ The API contract. Plain TypeScript DTOs imported by BOTH web and api,
                 so a response shape can only change in one place.
supabase/        Postgres migrations (95 files, append-only) + local-stack config.
emails/          Production email templates + their spec.
docs/            This file and the operational runbooks.
_handoff/        The original `Sizzle.dc.html` design prototype — the visual source of truth.
```

**Vercel project names are REVERSED and this bites everyone once:**

| Vercel project | What it actually is | Root | Domain |
|---|---|---|---|
| `sizzle` | the **API** | `apps/api` | sizzle-chi.vercel.app |
| `sizzle-api` | the **frontend** | `apps/web` | getsizzle.app |

---

## 2. Every entry point

A file with no static importer is not necessarily dead. These are all the ways code starts running.

### Web / native client
| Entry | File | Reached by |
|---|---|---|
| App bootstrap | `apps/web/src/main.tsx` | `index.html` script tag |
| Root component | `apps/web/src/App.tsx` | `main.tsx` |
| Marketing site | `components/Marketing.tsx` | `lazy()` — web only, when signed out and not yet "entered" |
| App shell | `components/AppShell.tsx` | `lazy()` — after auth |
| Admin dashboard | `components/AdminDashboard.tsx` | `lazy()` — admin only |
| Button showcase | `components/ButtonShowcase.tsx` | `lazy()` — **DEV only**, `?showcase=buttons` |
| Native deep links | `App.tsx` `appUrlOpen` listener | Universal Links, custom scheme, OAuth PKCE return |
| Android hardware back | `App.tsx` `backButton` listener | OS gesture/button |
| Push notifications | `lib/push.ts` | FCM / APNs |
| OTA update | `@capgo/capacitor-updater` | `autoUpdate: 'onLaunch'` → applies on the **second** cold launch |

There is **no client-side router**. Navigation is Zustand state (`store.ts`) — tabs plus a stack
of overlay "sheets" keyed by z-index. That is why Android back has a hand-written handler: there
is no WebView history to pop.

### API
| Entry | File | Reached by |
|---|---|---|
| Vercel handler | `apps/api/api/index.ts` | every production request |
| Local dev server | `apps/api/src/index.ts` | `npm run dev:api` |
| App assembly | `apps/api/src/app.ts` | both of the above; mounts all 18 route groups |
| Seed script | `apps/api/src/scripts/seed.ts` | `npm run seed` |

Route groups mounted in `app.ts`: `/health /me /feed /hashtags /recipes /cooks /search /messages
/uploads /admin /support /reports /monetize /r /u /b /internal /live /boards`.

`/r`, `/u`, `/b` are server-rendered crawlable pages for SEO and link previews — the frontend
`vercel.json` **rewrites** those paths to the API so shared links get real Open Graph tags.

### Scheduled work (`apps/api/vercel.json` → `/internal/*`)
| Cron | Schedule | Job |
|---|---|---|
| `/internal/publish-scheduled` | every minute | release scheduled posts |
| `/internal/finalize-videos` | every minute | drive Cloudflare assets to `ready` |
| `/internal/rollup-watch-ratios` | `17,47 * * * *` | recommendation signal rollup |
| `/internal/rollup-hashtag-trends` | every 15 min | hashtag momentum / trend scores |
| `/internal/save-nudges` | daily 21:00 | save-reminder notifications |

**These are entry points.** Code they call has no static importer from the client and must never
be treated as unused.

---

## 3. Feature map

| Feature | UI | Client state / data | API | Notes |
|---|---|---|---|---|
| Auth | `Onboarding.tsx`, `ChooseUsername.tsx`, `ResetPasswordScreen.tsx` | `auth/useAuth.ts` (Zustand) | Supabase Auth directly (not via our API) | Google + Apple OAuth; native uses `lib/nativeOAuth.ts` |
| For You / Following feed | `components/Feed.tsx` | `useForYouFeed`, `useFollowingFeed` | `routes/feed.ts` | ranking design in `docs/recommendation-algorithm.md` |
| Video playback | `VideoPlayer.tsx`, `VideoViewer.tsx` | `lib/signedPlayback.ts` | Cloudflare Stream | own just-posted clips play from `lib/localClips.ts` |
| Video upload | `UploadSheet.tsx`, `CameraRecorder.tsx`, `NativeCameraRecorder.tsx` | `lib/uploadTask.ts`, `lib/storage.ts` | `routes/uploads.ts` | web → direct to Cloudflare; **native → Supabase Storage, server relays** |
| Profiles | `Profile.tsx`, `sheets/CookSheet.tsx`, `EditProfileSheet.tsx` | `useMe`, `useCook` | `routes/me.ts`, `routes/cooks.ts` | |
| Recipes | `sheets/RecipeSheet.tsx`, `CookModeSheet.tsx` | `useRecipe` | `routes/recipes.ts` | |
| Hashtags | `HashtagCaptionField.tsx`, `sheets/HashtagSheet.tsx`, `Hashtags.tsx` | `useHashtag`, `useHashtagContent` | `routes/hashtags.ts` | see §6 for the two trending systems |
| Search / Discover | `Discover.tsx` | `useSearch`, `usePantrySearch` | `routes/search.ts` | |
| Social actions | `controls.tsx` (`ReactionButton`, `FollowButton`) | `data/queries.ts` mutations | `routes/recipes.ts`, `routes/cooks.ts` | |
| Comments | `sheets/CommentsSheet.tsx` | `useComments` | `routes/recipes.ts` | |
| Messaging | `sheets/MessagesSheet.tsx`, `ThreadSheet.tsx` | `useThread` (optimistic) | `routes/messages.ts` | |
| Notifications | `sheets/NotificationsSheet.tsx` | `useNotifications` | `routes/me.ts` | + FCM push, `lib/push.ts`, `lib/badge.ts` |
| Premium / entitlements | `PremiumOverlay.tsx`, `PremiumPriceFields.tsx` | `lib/revenuecat.ts` | `routes/monetize.ts` | Stripe Connect (web) + Apple IAP (native) |
| Creator tools | `sheets/CreatorSheet.tsx`, `AnalyticsSheet.tsx` | `useCreatorAnalytics` | `routes/monetize.ts` | |
| Moderation / reports | `sheets/ReportSheet.tsx` | — | `routes/reports.ts`, `services/reports.ts` | |
| Admin | `AdminDashboard.tsx` | `useAdmin*` | `routes/admin.ts` | two factors: admin role **and** an unlock passphrase |
| Collections / boards | `CollectionSheet.tsx`, `BoardSheet.tsx` | `useCollections` | `routes/boards.ts` | |
| Live sessions | — | `useLive` | `routes/live.ts` | |
| Legal | `LegalDoc.tsx` | — | self-hosted on getsizzle.app | |

---

## 4. State: what lives where

Five stores. Putting data in the wrong one is the most common way to introduce a bug here.

| Store | Owns | File |
|---|---|---|
| **React Query** | all server data | `data/queries.ts` — also constructs the single `queryClient` |
| **Zustand `useSizzle`** | UI navigation: current tab, which sheets are open, feed mode | `store.ts` |
| **Zustand `useAuth`** | session, user, profile, auth status | `auth/useAuth.ts` |
| **localStorage** | first-paint snapshots (`sizzle.cache.me`, `sizzle.cache.cook`) | written in `data/queries.ts` |
| **Capacitor Preferences** | the native Supabase session (secure, survives app kill) | `lib/supabase.ts` |

### Query keys are NOT account-scoped
Keys look like `['me']`, `['notifications']`, `['thread', otherId]` — the viewer's identity is
**not** in the key. That is deliberate (it keeps keys short), and it means the cache MUST be
wiped whenever the signed-in identity changes. `App.tsx` does this, keyed on the user id rather
than on auth status, because an identity change does not always pass through the signed-out
state — a recovery or OAuth deep link arriving while another account is signed in swaps the
session straight from A to B. `auth/useAuth.ts` clears the sibling caches (signed playback URLs,
local clips, localStorage snapshots) on the same transition.

**If you add a cache that holds user data, clear it in both of those places.**

---

## 5. Boundaries that are load-bearing

- **Security lives at RLS, not in the API mapper.** The Supabase anon key is public and PostgREST
  is exposed, so any gated table (paywall, PII) must be enforced with row-level security. An API
  route that filters rows is a convenience, not a control.
- **`packages/shared` is the contract.** Change a response shape there and both sides fail to
  compile — that is the point. Do not redeclare DTOs locally.
- **`packages/shared` must stay dependency-free and platform-neutral.** It is imported by a
  browser bundle and a serverless function.
- **The service-role key never leaves `apps/api`.**
- **Money code** (`routes/monetize.ts`, `services/payments.ts`) requires adversarial review and
  live-fire webhook testing. Model B pricing: processing off the top, then a 90/10 creator/platform
  split, $5 floors, loss-protection on refunds and disputes.
- **Admin routes need two factors**: `requireAdmin` (role) *and* `requireAdminUnlock` (passphrase).
  Only `/admin/unlock`, `/admin/passphrase` and `/admin/security-status` are exempt from the second
  — the client needs the last one to decide between the "set a passphrase" and "unlock" screens,
  i.e. before any unlock token can exist.

---

## 6. Things that will confuse you (read this before "cleaning up")

**`apps/web/src/data.ts` and `apps/web/src/types.ts` are prototype residue, not the data model.**
The real model is `@sizzle/shared`. `data.ts` still exports mock `cooks`/`recipes`/`baseComments`
left over from the `Sizzle.dc.html` port, alongside three constants that ARE live (`tasteDefs`,
`discoverHeights`). Do not use the mock exports for anything.

**There are two trending systems.** `useTrendingTags()` → `/feed/trending-tags` is the one wired
into `Discover.tsx`. `useTrendingHashtags(window)` → `/hashtags/trending` is the newer
momentum-based leaderboard; the cron that computes it runs every 15 minutes, but no UI reads it
yet. Both are real; neither is dead.

**`auth/useAuth.ts ↔ lib/nativeOAuth.ts` is a deliberate import cycle**, broken with a dynamic
`import()` and commented as such. `madge --circular` reports it. Leave it alone.

**`noUnusedLocals` and `noUnusedParameters` are on** in both apps, and both typecheck clean.
There are no unused imports or variables to find in `.ts`/`.tsx` — the compiler already enforces it.

**There is no ESLint.** The repo contains `eslint-disable-next-line react-hooks/exhaustive-deps`
comments, but no ESLint is installed and no config exists, so those rules have never run. The
suppressed effects were reviewed by hand and are correct (they use refs to avoid stale closures),
but be aware the safety net is not actually there.

---

## 7. The video pipeline

The single most intricate subsystem. Do not simplify it without tracing every step.

1. **Record** — web uses `CameraRecorder.tsx` (MediaRecorder); native uses
   `NativeCameraRecorder.tsx` (`@capgo/camera-preview`, HEVC, mid-record flip, zoom).
2. **Upload** — web browsers upload **direct to a Cloudflare ticket**. Native uploads to
   **Supabase Storage** and the server relays it into Cloudflare (`POST /uploads/video` with
   `uploadedUrl` → `/copy`), because iOS WKWebView cannot deliver the multipart body to
   Cloudflare. Both paths go through `lib/uploadTask.ts`, which is resumable across app kills.
3. **Transcode** — Cloudflare Stream. The `/internal/finalize-videos` cron (every minute) plus
   client polling (up to 10 minutes) drive the asset to `ready`.
4. **Play** — your own just-posted clip plays from the on-device file (`lib/localClips.ts`) while
   transcoding runs. Never show the poster a "Processing" spinner for their own post.
5. **Posters** — always render through `PosterImg`, which retries with backoff. Cloudflare
   thumbnails 404 for a few seconds right after `ready`.

---

## 8. Release paths

| Change | How it ships | Latency |
|---|---|---|
| JS / CSS only | Capgo OTA: bump `apps/web/package.json`, `npm run build`, `npx @capgo/cli bundle upload --channel production --node-modules ../../node_modules` | ~10 min, applies on the **second** app launch |
| Native code, plugins, permissions | new Xcode build → TestFlight → App Store | days |
| API | `git push origin main` → Vercel project `sizzle` | minutes |
| Web | `git push origin main` → Vercel project `sizzle-api` | minutes |
| Database | a new file in `supabase/migrations`, applied to the hosted DB | manual |

The GitHub → Vercel webhook has silently died before. **Always confirm a new deployment reached
READY** after a push; a CANCELED build on the *other* project is normal (ignored-build-step).
