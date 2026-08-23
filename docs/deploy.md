# Deploying Sizzle

> **Rewritten 2026-08-23.** This guide previously described the API on **Railway / Fly.io** and the
> web client on "Vercel / Netlify / any static host". Sizzle has never run in production that way:
> both deployables are **Vercel** projects, the API is a **serverless function** (not a long-lived
> `node dist/index.js` process), and the old trusted-proxy note had the header precedence
> backwards. Everything below is verified against the files it cites.

Three deploy surfaces: the **API**, the **web client**, and the **native apps**. Data is
**Supabase** (hosted). Video is **Cloudflare Stream**.

## 0. The two Vercel projects — the naming is REVERSED

This trips up every first deploy, so read it before touching anything:

| Vercel project | Is actually the | Root dir   | Production URL          | Project id (`scripts/verify-deploy.mjs:25-26`) |
| -------------- | --------------- | ---------- | ----------------------- | ---------------------------------------------- |
| `sizzle`       | **API**         | `apps/api` | `sizzle-chi.vercel.app` | `prj_UMPAxzfttxlSOPMJXLO7WpthZezr`              |
| `sizzle-api`   | **frontend**    | `apps/web` | `getsizzle.app`         | `prj_Pmds5j99CiPpw41773VfeYEiTBws`              |

`git push origin main` auto-deploys both. A CANCELED build on the *other* project for a
single-app commit is normal (ignored-build-step). **The GitHub→Vercel webhook has silently died
before** — never assume a push deployed; see §5.

## 1. Supabase (hosted)

1. Create a project at supabase.com.
2. Link + push migrations: `supabase link --project-ref <ref>` then `supabase db push` (applies
   everything in `supabase/migrations/`, which is **append-only** — see CLAUDE.md rule 3).
3. From API settings copy the **Project URL**, **anon** key, and **service_role** key.

Running production migrations requires explicit authorization from Branden (CLAUDE.md rule 10).

## 2. API — Vercel project `sizzle` (root `apps/api`)

- **Build:** `node scripts/build-vercel.mjs` (`apps/api/vercel.json`). It esbuild-bundles
  `apps/api/api/index.ts` into **one self-contained ESM file** under `.vercel/output` via the Build
  Output API, so Vercel's loader never resolves workspace imports at runtime. Runtime
  `nodejs22.x` (supabase-js realtime needs native `WebSocket`, which Node 20 lacks),
  `maxDuration` **30s**. All paths route to that single function
  (`config.json` → `{ src: '/(.*)', dest: '/api' }`).
- **Local dev is a different entry point:** `apps/api/src/index.ts` under `@hono/node-server`.
  `PORT` applies there only — Vercel does not use it.
- **Required env vars** (`apps/api/src/env.ts`; the app throws at boot if these are missing):
  - `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. The API **refuses to start**
    if the public local-demo keys (`iss: "supabase-demo"`) are set against a non-local URL.
  - `WEB_ORIGIN` — drives CORS. Defaults to `http://localhost:5173`, so it must be set in prod.
  - `CRON_SECRET` — gates the whole `/internal` router (`apps/api/src/routes/internal.ts:38-45`).
    Vercel Cron sends it as `Authorization: Bearer <CRON_SECRET>`. Absent ⇒ everything is rejected.
- **Optional, feature-gating env vars** (each is a safe no-op when unset): `VIDEO_PROVIDER` +
  `CLOUDFLARE_*` (§4), `FCM_SERVICE_ACCOUNT` (push), `OPENAI_API_KEY` (moderation),
  `SENTRY_DSN`, `RESEND_API_KEY`/`EMAIL_FROM`, `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET`,
  `REVENUECAT_API_KEY`/`REVENUECAT_WEBHOOK_AUTH`, `APP_ORIGIN`, `ADMIN_BOOTSTRAP_SECRET`.
  Two boot-time guards worth knowing: `STRIPE_SECRET_KEY` **without** `STRIPE_WEBHOOK_SECRET`
  throws (tips would be charged but never settle), and `ALLOW_SANDBOX_IAP` must stay unset in
  production or a sandbox Apple ID unlocks premium recipes for free.
- **Trusted proxy:** the anon rate-limit key is **not** the left-most `X-Forwarded-For` entry —
  that one is client-supplied and spoofable per request. `apps/api/src/middleware/rateLimit.ts:7-18`
  prefers `x-vercel-forwarded-for`, else the **right-most** XFF hop (the one Vercel appends).
  Per-user write limits key off the authenticated user id and are not spoofable at all. Any move
  off Vercel must re-establish an equivalent trusted hop. (This corrects the claim in
  `docs/security.md` H-2.)
- **Crons** — five, declared in `apps/api/vercel.json`, all hitting `/internal`:

  | Schedule        | Path                              | `/health` stale limit |
  | --------------- | --------------------------------- | --------------------- |
  | `* * * * *`     | `/internal/publish-scheduled`     | 600s                  |
  | `* * * * *`     | `/internal/finalize-videos`       | 600s                  |
  | `*/15 * * * *`  | `/internal/rollup-hashtag-trends` | 7,200s                |
  | `17,47 * * * *` | `/internal/rollup-watch-ratios`   | 7,200s                |
  | `0 21 * * *`    | `/internal/save-nudges`           | 93,600s               |

- The `service_role` key is server-only and must never reach the client.

## 3. Web — Vercel project `sizzle-api` (root `apps/web`)

- **Build:** `npm run build -w @sizzle/web` (`tsc -b && vite build`) → `apps/web/dist`.
- **Env vars** (all `VITE_*` are **public** — baked into the bundle; never put a secret here):
  `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (anon only), `VITE_API_URL`, `VITE_SITE_ORIGIN`,
  `VITE_SENTRY_DSN`.
- **`apps/web/vercel.json`** rewrites the crawlable SEO paths `/r/:id`, `/u/:handle`, `/b/:id` to
  the API (server-rendered), and pins the `Content-Type` of
  `/.well-known/apple-app-site-association` to `application/json` (universal links break otherwise).
- Point the API's `WEB_ORIGIN` at this deployment.

## 4. Cloudflare Stream (video)

- Enable Stream, create an API token with Stream edit permissions.
- Set `VIDEO_PROVIDER=cloudflare` + `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_STREAM_TOKEN`,
  `CLOUDFLARE_STREAM_WEBHOOK_SECRET` on the API.
- Configure the Stream webhook to `POST {API}/uploads/webhook/cloudflare-stream`; the endpoint
  verifies the HMAC signature and is disabled (403) until the secret is configured.
- Live (`CLOUDFLARE_LIVE_INPUT_TOKEN`) is deliberately **not** implied by the VOD config — leave it
  unset until a capture/RTMP pipeline exists.

## 5. Verifying a deploy — mandatory, never assumed

```
node scripts/verify-deploy.mjs [--api] [--web] [--sha <sha>]   # no flags = both projects
```

For each project it polls the Vercel API until a deployment carrying HEAD's SHA reaches READY,
probes the live surface, and — for the API — compares `/health`'s `commit` against HEAD. A stale
Vercel CLI token is refreshed automatically (`vercel login` only if that fails).

Fallback when the webhook is dead: `vercel deploy --prod --yes` (the frontend also needs
`--archive=tgz`); the per-project link-swap recipe lives in the local `.vercelignore` comments.

## 6. Native (iOS / Android)

JS/CSS-only changes ship **over the air via Capgo** in ~10 min and reach users on their second app
launch. Native code changes need a new Xcode build → TestFlight, and submission is owner-only
(Level D). Full recipe in CLAUDE.md → *Capgo OTA*; release checklist in
`docs/engineering/CHANGE_SAFETY_CHECKLIST.md`.

## Health

`GET /health` returns `status` (`ok` / degraded / 503 — it does **not** always return 200),
`problems[]`, `commit` (the deployed SHA — this is what verify-deploy compares), `videoProvider`,
`cloudflareConfigured`, `stuckVideoBacklog`, `parkedMediaDeletions`, `cronAges` (per-job seconds
since last success, thresholds in the §2 table), `moderationConfigured`, `push`, `payments`,
`paymentsKeyMode`, `emailConfigured`, `sentryConfigured`, `time`.
