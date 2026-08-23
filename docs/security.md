# Security posture

## Controls in place
- **AuthN/Z:** every mutating route is behind `requireAuth`; the acting user id always comes from the verified Supabase JWT (`supabaseAdmin.auth.getUser`), never from the body/params. Reads pass an explicit `viewerId`.
- **RLS** on every table (subselect-wrapped `auth.uid()`, role-targeted). `SECURITY DEFINER` functions pin `search_path = ''` and are granted only to `service_role`.
- **Secrets:** `service_role` key is server-only; `.env` is gitignored; the API refuses to boot with the public demo keys against a non-local Supabase URL.
- **Input:** zod on all bodies (with length caps); UUID validation on `:id` params (malformed → 404, not a 500); 1 MB body limit.
- **Rate limiting:** global IP limit + tighter per-user limits on write-heavy endpoints (comments, uploads, views, recipe create).
- **Content moderation hook** on recipe + comment creation (`services/moderation.ts` — placeholder blocklist + link-spam; swap in a real provider).
- **Error hygiene:** 5xx responses are generic (raw Postgres errors logged server-side only).
- **CORS** restricted to `WEB_ORIGIN`; **security headers** (nosniff, frame-deny, referrer, HSTS).
- **Webhook:** Cloudflare Stream webhook verifies an HMAC signature and is disabled (403) unless configured.
- **Reactions** toggle via an atomic, advisory-locked DB function (no count-inflation race).
- **Visibility:** draft/removed recipes + their comments are returned only to the owning cook.

## Review (independent security agent) — status
All CRITICAL/HIGH/MEDIUM findings resolved:
- C-1 webhook signature/uid — fixed. H-1 draft exposure — fixed. H-3 raw error leakage — fixed.
- M-1 search injection — fixed (parameterized `.ilike`). M-2 view spam — rate-limited. M-3 unfollow UUID — fixed. M-4 taste length — capped. M-5 reaction race — atomic RPC.
- H-2 X-Forwarded-For spoofing — **resolved in code** (verified 2026-08-23): per-user write limits key off the authenticated user id and were never spoofable, and the anon IP key now prefers `x-vercel-forwarded-for`, else the **right-most** XFF hop (the one the edge appends) — never the client-supplied left-most entry (`apps/api/src/middleware/rateLimit.ts:7-18`). This no longer depends on separate trusted-proxy config, but any move off Vercel must re-establish an equivalent trusted hop (see deploy.md §2).
- L-2 demo-key default — boot guard added. L-3 vite/esbuild dev CVE — dev-only, not production-exploitable; bump on next web dep update.

## Follow-ups before public launch
- Replace the moderation placeholder with a real provider (Cloudflare AI / OpenAI moderation).
- Configure trusted-proxy handling for the IP rate limiter; consider Redis-backed limiting if multi-instance.
- Add monitoring/APM (Sentry) and structured request logging.
