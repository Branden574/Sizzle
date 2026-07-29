# Sizzle — code conventions

How this codebase is already written, so a new file looks like the ones around it.
These are descriptions of existing practice, not aspirations.

Read `docs/ARCHITECTURE.md` first for where things live.

---

## Types

`packages/shared` is the API contract. A response shape is declared once there and imported by
both sides, so changing it breaks compilation in both places rather than silently at runtime.

- Never redeclare a DTO locally — import it from `@sizzle/shared`.
- `packages/shared` stays dependency-free; it is bundled into both a browser and a serverless function.
- **`any` appears zero times in this repo.** Keep it that way.
- `strict`, `noUnusedLocals` and `noUnusedParameters` are on in both apps. Unused imports and
  variables are compile errors, not lint warnings — which is why there is never any dead-import
  cleanup to do in `.ts`/`.tsx`.
- The API additionally sets `verbatimModuleSyntax`, so type-only imports must say `import type`.

## API access (client)

Everything goes through `apps/web/src/lib/api.ts` — `apiGet` and `apiSend`. There are currently
**no raw API `fetch()` calls in any component**, and it should stay that way. That module is the
single place that:

- attaches the Supabase bearer token,
- attaches `x-admin-unlock` on `/admin/*` requests,
- converts a non-2xx response into a typed `ApiError { status, code, message }`.

The only other `fetch()` calls in the client read local `capacitor://` files or hit Sentry's
ingest endpoint. Both are deliberate.

## Server state vs UI state

| Put it in | When |
|---|---|
| React Query (`data/queries.ts`) | it came from the API |
| Zustand `useSizzle` (`store.ts`) | navigation/UI: current tab, which sheet is open |
| Zustand `useAuth` (`auth/useAuth.ts`) | session, user, profile |
| localStorage | first-paint snapshots only |
| Capacitor Preferences | the native session (secure, survives app kill) |

Never store the same server object in two of these.

### Query keys

Keys are `[resource, ...discriminators]`, e.g. `['hashtag-content', tag, sort]`. They do **not**
include the account id. That means the cache must be wiped whenever the signed-in identity
changes — see `ARCHITECTURE.md` §4. **If you add a cache holding user data, clear it on identity
change in both `App.tsx` and `auth/useAuth.ts`.**

Use `placeholderData: keepPreviousData` on any query whose key changes from a user toggle
(Top↔Recent, 24h↔7d, search text). Without it the grid blanks on every toggle.

## Errors

**Server** — throw one of the helpers in `apps/api/src/lib/errors.ts` (`badRequest`,
`unauthorized`, `forbidden`, `notFound`, `dbFail`). The central `onError` handler turns any thrown
value into an `ApiErrorBody`. It never leaks 5xx detail: 5xx is logged and reported to Sentry and
the client gets "Something went wrong". Do not hand-build error responses.

**Client** — catch `ApiError` and read `.code` / `.message`. Never render a raw provider error, a
stack trace, or a database message.

## Buttons and controls

Every interactive element goes through the primitives in `components/controls.tsx` — `Button`,
`IconButton`, `GlassButton`, `LoadingButton`, `ReactionButton`, `FollowButton`,
`FloatingActionButton`, `ButtonGroup`, `SegmentedControl`, `FilterChip`, `DismissBackdrop`.

Enforced by `components/controls.contract.test.mjs` (`npm run test:controls`), which fails if any
`.tsx` file contains a raw `<` + `button` tag, a click handler on a `div`/`span`/`img`, a
`role="button"`, or if a semantic CSS token goes missing.

Three things to know:
- It scans raw file text, so writing that tag name **in a comment** fails it. Say "the element it
  renders" instead.
- `Button` spreads unknown props straight onto the element, so `role`, `aria-*` and `onMouseDown`
  pass through unchanged.
- `.sz-button` applies `white-space: nowrap` and `display: inline-grid`. If the element you are
  converting relied on wrapping or a different display, set it explicitly inline — otherwise you
  silently change layout. (`HashtagCaptionField` sets `whiteSpace: 'normal'` for exactly this.)

Style with the `--button-*` custom properties in `index.css`, never hard-coded colours.

## Logging

- Keep structured application logs, audit logs, upload/video diagnostics and crash reporting.
- **Every admin moderation action must call `logModeration()`** (`services/audit.ts`) so it lands
  in `moderation_log` and appears in `/admin/log`. A `console.log` is not an audit trail.
- Never log passwords, tokens, session cookies, private messages, signed upload/playback URLs,
  Cloudflare provider UIDs, or raw payment data.

## Comments

Comments here explain **why**, and many are load-bearing: they record WebView bugs, Cloudflare
timing quirks and iOS-specific workarounds that cannot be reconstructed from the code. Before
deleting one, check whether it is documenting a constraint.

Worth a comment: a non-obvious business rule, a browser/WebView workaround, a security decision,
a performance trade-off, a deliberate import cycle, an ordering requirement.
Not worth it: restating what the line does.

## Native (Capacitor)

- `isNative` from `lib/native.ts` is the platform check. Do not re-derive it.
- Every `addListener` needs a matching `remove()` in the effect cleanup, or you get duplicate
  handlers after a remount or an app foreground.
- Anything touching `ios/`, `android/`, plugins, permissions or entitlements **cannot ship over
  the air** — it needs a new native build. JS/CSS-only changes ship via Capgo OTA.
- Do not remove a native permission because no JS references it; check the plugin first.
- iOS and Android plugin registration can drift. The Android project currently registers 4 of 13
  plugins — that is staleness, not evidence those plugins are unused. Fix with `npx cap sync android`.

## Assets

`apps/web/public/` assets can be referenced from three places, and code search alone is not
enough to prove one is unused:

1. source (`<img src="/recipes/foo.jpg">`),
2. **the production database** — the six `public/recipes/*.jpg` files are `video_assets.poster_url`
   values for the seeded demo posts,
3. native asset copies under `ios/App/App/public/` and `android/.../assets/public/`, which are
   generated by `cap sync` and must never be edited by hand.

Check the database before deleting any asset.

## Database

- Migrations in `supabase/migrations` are **append-only**. Never edit or delete a historical one,
  even when a later migration supersedes it.
- Any table holding user data or gated content needs RLS. The anon key is public and PostgREST is
  exposed, so an API-side filter is a convenience, not a security control.
- Prefer a column-scoped grant over `grant update on <table>` — a column-blind policy plus a
  table-wide grant lets a user rewrite fields the API never exposes.

## Testing

The repo has one automated test (`controls.contract.test.mjs`) and no unit/E2E framework, and no
ESLint. Until that changes the real gate is manual: exercise the full lifecycle of whatever you
touched (view / play / edit / delete, ownership rules, refresh) on the **iOS Simulator**, not
browser-mobile emulation. Camera work needs a physical device.

`npm run dev` points at *local* Supabase, so authed flows fail there. Verify authed flows against
production and do database work through migrations.
