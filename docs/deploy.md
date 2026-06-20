# Deploying Sizzle

Two deployables: the **API** (`apps/api`, Node/Hono) and the **web** client (`apps/web`, static Vite build). Data is **Supabase** (hosted).

## 1. Supabase (hosted)
1. Create a project at supabase.com.
2. Link + push migrations: `supabase link --project-ref <ref>` then `supabase db push` (applies everything in `supabase/migrations/`).
3. From the project's API settings, copy the **Project URL**, **anon** key, and **service_role** key.

## 2. API (Railway / Fly.io)
- Build: `npm run build -w @sizzle/api` → `apps/api/dist/index.js`. Start: `node apps/api/dist/index.js`.
- Env vars (required in production):
  - `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` — from your hosted project. **Never** the local demo keys (the API refuses to boot if the demo keys are set against a non-local URL).
  - `WEB_ORIGIN` — your web app's origin (drives CORS).
  - `PORT` — provided by the platform.
  - Video: `VIDEO_PROVIDER=cloudflare` + `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_STREAM_TOKEN`, `CLOUDFLARE_STREAM_WEBHOOK_SECRET` (when going off mock).
- **Trusted proxy:** the global IP rate limiter reads `X-Forwarded-For`. Railway/Fly set this from their edge; ensure no untrusted hop can spoof it. (Per-user write limits — comments/uploads/views/recipe-create — key off the authenticated user id and are not spoofable.)
- The `service_role` key is server-only and must never reach the client.

## 3. Web (Vercel / Netlify / any static host)
- Build: `npm run build -w @sizzle/web` → `apps/web/dist`.
- Env vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (anon only — never the service key), `VITE_API_URL` (your deployed API origin).
- Point `WEB_ORIGIN` (API) at this deployment.

## 4. Cloudflare Stream (real video)
- Enable Stream, create an API token with Stream edit perms.
- Set `VIDEO_PROVIDER=cloudflare` + the three `CLOUDFLARE_*` vars on the API.
- Configure the Stream webhook to `POST {API}/uploads/webhook/cloudflare-stream`; the endpoint verifies the HMAC signature with `CLOUDFLARE_STREAM_WEBHOOK_SECRET` (and is disabled/403 until configured).

## Health
`GET /health` returns `{ status, videoProvider, cloudflareConfigured }`.
