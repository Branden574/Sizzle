# Activating Cloudflare Stream (video) — runbook

**Status:** the API's Cloudflare Stream provider is fully implemented
(`apps/api/src/services/stream.ts` → `CloudflareStream`, plus the signed webhook
in `apps/api/src/routes/uploads.ts`). It stays dormant until the env below is
set. The **web upload flow still needs one change** (see step 5) to send bytes to
Cloudflare instead of Supabase Storage — do that with a test upload once the
token exists.

Until then the app uploads to **Supabase Storage** (works fine; Supabase Pro
includes 250 GB egress/mo — plenty for a TestFlight beta). Cloudflare is the
**cost move for scale** (R2/Stream = zero egress fees), not a launch blocker.

## Why Cloudflare for video
- Video delivery (egress) is the cost that scales with views. Supabase egress is
  metered (~$0.09/GB past the 250 GB included); Cloudflare R2/Stream has **no
  egress fees**, and Stream also does encoding + adaptive HLS.

## 1. Cloudflare dashboard
1. Create/Use a Cloudflare account → **Stream** (Stream is ~$5 per 1,000 min
   stored + $1 per 1,000 min delivered).
2. Note your **Account ID** (Dashboard → right sidebar, or any Stream URL).
3. **My Profile → API Tokens → Create Token** → custom token with permission
   **Account · Stream · Edit**. Copy the token (shown once).
4. (Optional, for instant "ready" status) Stream → **Settings → Webhooks** → add
   `https://<your-api-host>/uploads/webhook/cloudflare-stream`. Copy the
   **webhook signing secret**.

## 2. API environment variables (Vercel → sizzle-api project → Settings → Env)
```
VIDEO_PROVIDER=cloudflare
CLOUDFLARE_ACCOUNT_ID=<account id>
CLOUDFLARE_STREAM_TOKEN=<the Stream:Edit API token>
CLOUDFLARE_STREAM_WEBHOOK_SECRET=<webhook signing secret>   # optional
```
Redeploy. Confirm `GET /health` now shows
`"videoProvider":"cloudflare","cloudflareConfigured":true`.

## 3. How the server flow then works (already coded)
- `POST /uploads/video` (no `uploadedUrl`) → `CloudflareStream.createDirectUpload`
  returns a one-time `uploadURL` + `providerUid`; a `video_assets` row is created
  `status: pending`.
- The webhook (or a poll of `getAsset`) flips it to `ready` with `hls_url` +
  `poster_url` once Cloudflare finishes encoding.

## 4. Poster/thumbnails & playback
- Cloudflare returns an HLS playback URL + a thumbnail; the existing
  `VideoPlayer` already plays HLS via hls.js, so no client playback change.

## 5. The one remaining web change (do with a real token, then test)
Today `apps/web` uploads the file to Supabase Storage and passes `uploadedUrl`
to `POST /uploads/video` (creates a `storage` asset). To use Cloudflare:
1. Request the ticket first: `POST /uploads/video` with **no** `uploadedUrl` →
   `{ videoAssetId, uploadUrl, provider: 'cloudflare' }`.
2. Upload the file to `uploadUrl` (Cloudflare one-time direct-upload URL accepts a
   `multipart/form-data` POST with field `file`) — reuse the XHR progress bar.
3. Create the recipe with `videoAssetId` (asset goes `ready` via the webhook).
Gate this behind a `VITE_VIDEO_PROVIDER=cloudflare` flag so the Supabase path
stays the default/fallback. Verify with one real upload before flipping prod.

## 6. (Later) R2 for any non-Stream assets
If you also move avatars/banners off Supabase Storage, create an R2 bucket +
S3-compatible token and swap `uploadProfileImage` in `apps/web/src/lib/storage.ts`
to the R2 endpoint. Not needed for the video cost win.
