# Sizzle — Hosting runbook (Vercel + Supabase)

Stack: **Supabase** (database / auth / storage) · **Vercel** (web app + API).

🔒 = **secret** — only you ever paste these (Claude can't type secrets into fields).
🌐 = public — safe to share / ship in the web bundle.

---

## Stage 1 — Hosted Supabase project  *(you create it; Claude pushes the schema)*

1. supabase.com/dashboard → **New project**.
   - Name: `sizzle`  · Region: closest to you  · **Database password**: pick a strong one and **save it** 🔒
2. When it finishes provisioning, go to **Project Settings → API** and grab:
   - **Project URL** 🌐 — `https://<ref>.supabase.co`
   - **`anon` `public` key** 🌐
   - **`service_role` key** 🔒  (keep this one safe — it's full DB access)
   - The **`<ref>`** is the subdomain in the Project URL.
3. Push the schema (run these in the repo — `login` opens your browser, `link` asks for the DB password):
   ```bash
   npx supabase login
   npx supabase link --project-ref <ref>
   npx supabase db push          # applies every migration: tables, RLS, functions, storage buckets, cron
   ```
   This creates the `avatars` / `banners` / `videos` storage buckets and (if pg_cron is enabled) the daily account-purge job — the migrations are written to no-op safely if cron isn't available.
4. *(Optional)* demo content: `npm run seed` creates the demo cooks/recipes. Skip for a clean launch, or run it for a populated demo.

➡️ Paste Claude the **Project URL** + **anon key** (both public) and it wires up the rest.

---

> New API keys: Supabase now issues **`sb_publishable_…`** (public, replaces `anon`)
> and **`sb_secret_…`** (private, replaces `service_role`). Use those — supabase-js
> 2.108 supports them natively. The publishable key goes everywhere the old anon
> key did; the secret key is the one you paste into the API only.

## Stage 2 — API on Vercel  ✅ *config scaffolded (`apps/api/api/index.ts` + `apps/api/vercel.json`)*

New Vercel project → **Import `Branden574/Sizzle`** → **Root Directory = `apps/api`** → Framework Preset **Other**. Environment variables:

| Variable | Value | |
|---|---|---|
| `SUPABASE_URL` | `https://gsxoaurmsgqascxukony.supabase.co` | 🌐 |
| `SUPABASE_ANON_KEY` | your `sb_publishable_…` key | 🌐 |
| `SUPABASE_SERVICE_ROLE_KEY` | your `sb_secret_…` key | 🔒 **you paste** |
| `WEB_ORIGIN` | the web app's URL (set after Stage 3) | 🌐 |
| `VIDEO_PROVIDER` | `mock` (switch to `cloudflare` later for real video) | 🌐 |

The Hono app runs as one serverless function; `vercel.json` routes every path to it, so the API answers at the project's root URL (`https://<api>.vercel.app/me`, `/recipes`, …).

---

## Stage 3 — Web app on Vercel

New Vercel project → **Import the same repo** → **Root Directory = `apps/web`** → Framework Preset **Vite** (auto-detected; output `dist`). Build-time env:

| Variable | Value | |
|---|---|---|
| `VITE_SUPABASE_URL` | `https://gsxoaurmsgqascxukony.supabase.co` | 🌐 |
| `VITE_SUPABASE_ANON_KEY` | your `sb_publishable_…` key | 🌐 (public client key by design) |
| `VITE_API_URL` | the API project's URL from Stage 2 | 🌐 |

---

## Stage 4 — Wire-up

- Set the API project's `WEB_ORIGIN` to the web URL → redeploy the API (so CORS allows the site).
- Supabase **Authentication → URL Configuration**: set **Site URL** + **Redirect URLs** to the web URL (so password-reset / OAuth links work).
- **Native apps**: point `apps/web/.env.production` at the hosted URLs, then `npm run cap:sync` + rebuild iOS/Android.

## What's secret vs public (quick reference)

- 🔒 **service_role key** — API env only, NEVER in the web app or the repo.
- 🔒 **database password** — only used by `supabase link`.
- 🌐 **anon key** — fine in the web bundle (RLS protects the data); shared with the API too.
- 🌐 **all the URLs**.

## Notes / follow-ups for production

- The API's rate-limiter is in-memory; on serverless it resets per invocation. Fine for launch; move to a Supabase/Upstash-backed limiter when traffic grows.
- Video is `mock` until Cloudflare Stream creds are added (`CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_STREAM_TOKEN`, `CLOUDFLARE_STREAM_WEBHOOK_SECRET` 🔒). Recorded clips already upload to Supabase storage and work without it.
- `enable_confirmations` is off locally; turn on email confirmation in Supabase Auth for production.
