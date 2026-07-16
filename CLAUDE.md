# CLAUDE.md — Sizzle

TikTok-style recipe video app (getsizzle.app) shipping to the Apple App Store.
**Read `PROGRESS.md` first every session** — it is the running log of what's done and what's next.

## Hard rules (non-negotiable guardrails)

1. **Never `git add -A` or `git add .`** — a blanket add once leaked a Supabase token to public GitHub. Stage explicit paths only, and grep the staged diff for secret patterns (`sbp_`, `sk_live`, `whsec_`, `eyJ…`, `-----BEGIN`) before every push.
2. **Never commit:** `.env*`, `.mcp.json`, `.vercel/`, `.vercelignore`, `**/GoogleService-Info.plist`, `**/google-services.json`. They are gitignored on purpose — some hold secrets, and a committed repo-root `.vercelignore` would break the other Vercel project's build.
3. **No AI attribution** in commits or PRs — no `Co-Authored-By`/"Generated with" lines. Branden is the sole author.
4. **Root-cause before fixing.** Never ship a guessed fix. Gather evidence at each component boundary, confirm the cause, then fix — and verify on a real surface (live API, simulator, production web) before saying "fixed".
5. **Test every feature end-to-end after building it** — every button, box, and flow, in the browser or simulator. Ship the whole lifecycle (view/play/edit/delete, ownership rules, refresh) without being asked.
6. **Security lives at RLS, not the API mapper.** The Supabase anon key is public and PostgREST is exposed — any gated table (paywall, PII) must be enforced with row-level security.
7. **Branden does credentials himself.** Never create accounts, enter passwords, or type payment details/API keys into forms — walk him through it instead. Never print secret values into the chat or logs.
8. **Verify every deploy actually promoted** (see Deploys below). Never assume a push went live.
9. **Verify mobile UI on the iOS Simulator**, not browser-mobile emulation. Camera features need a real device.

## Architecture map

- **Monorepo** (npm workspaces): `apps/web` (React 18 + Vite + TS + Capacitor 8 → iOS/Android), `apps/api` (Hono on Vercel serverless, Supabase service-role), `packages/shared` (DTOs — single source of truth for API types), `supabase/migrations`, `emails/` (production email templates + SPEC).
- **Supabase** = Postgres + Auth + Storage (hosted; free tier). DB changes go through migrations (`supabase/migrations`) applied to the hosted DB. Custom SMTP via Resend.
- **Cloudflare Stream** = video hosting/transcoding. Web browsers upload direct to a Cloudflare ticket; **native uploads to Supabase Storage and the server relays it into Cloudflare** (`POST /uploads/video` with `uploadedUrl` → `/copy`) because iOS WKWebView can't deliver the multipart body to Cloudflare. A finalize cron (`/internal/finalize-videos`, every minute) + client polling (up to 10 min) drive assets to `ready`.
- **Instant self-playback:** your own just-posted clip plays from the on-device file (`apps/web/src/lib/localClips.ts`) while transcoding runs — never show the poster a "Processing" spinner for their own post.
- **Posters/thumbnails** render through `PosterImg` (retry with backoff) — Cloudflare thumbnails 404 for a few seconds right after `ready`.
- **Stripe** Connect Express, destination charges, Model B pricing (processing off the top, then 90/10 creator/platform split, $5 floors), loss-protection on refunds/disputes. Money code changes require adversarial review + live-fire webhook testing.
- **Capgo OTA** ships JS/CSS to native in ~10 min: bump `apps/web/package.json` version → `npm run build` → `npx @capgo/cli@latest bundle upload --channel production --node-modules ../../node_modules` (run from `apps/web`). Users get it on the second app launch. Native-code changes need a new Xcode build → TestFlight instead.
- **Vercel naming is REVERSED:** project **`sizzle` = the API** (sizzle-chi.vercel.app, root `apps/api`); project **`sizzle-api` = the frontend** (getsizzle.app, root `apps/web`).

## Deploys

`git push origin main` should auto-deploy both Vercel projects — **but the GitHub webhook has silently died before** (no deployment created at all). After every push, confirm a new deployment reached READY for the affected project(s); a CANCELED build on the *other* project for cross-app commits is normal (ignored-build-step). Fallback when the webhook is dead: deploy via Vercel CLI (`vercel deploy --prod --yes`; the frontend needs `--archive=tgz`) — the exact recipe incl. per-project link swap lives in the local `.vercelignore` comments and Claude's project memory.

## Local-only files (do NOT expect these from a fresh clone)

`.env` files, `.mcp.json` (Supabase access), `.vercel/`, `.vercelignore`, Firebase plists. Copy them manually when setting up a new machine — never through git.

## Test accounts

- App Store reviewer demo: `review@getsizzle.app` (inbox routes to the Sizzle ops Gmail).
- Local dev web server points at *local* Supabase, so authed flows fail there — verify authed flows against production, DB work via migrations/MCP.
