# Premium Recipes — Launch Plan

**Decision (2026-07-17):** Apple IAP (compliant) · **Full premium before launch** · **per-recipe unlock** model.
Premium targets **iOS build 29** (IAP needs native code — not OTA). Build 28 remains the interim review build.

## What already exists (audit 2026-07-17 — ~70% built)
- DB: `recipes.price_cents` (CHECK null-or-≥500), `recipes.visibility` ('public'|'subscribers'), `recipe_unlocks`, `subscriptions`, `profiles.sub_price_cents`.
- Server-authoritative gating in `apps/api/src/mappers.ts` `toCard()`/`loadViewerCtx()`: locked cards get `hlsUrl`/`mp4Url` nulled + `images:[]`; `getRecipeDetail` strips ingredients/steps/macros/chefsNote.
- Owner-only RLS on recipes/ingredients/steps/video_assets (`20260701090000`); writes revoked (`20260717001356`).
- Price read server-side (never client-trusted); refund/dispute auto-revoke (webhook).
- Web purchase flow (Stripe) + creator pricing UI (`EditPostSheet`). Native purchases hidden via `canBuyInApp = !isNative`.
- Gold precedent: `VerifiedBadge` gold gradient + `sz-gold-shine` keyframe; `sz-glow` decorative-frame pattern; `--saffron` token.

## 🔴 P1 — SECURITY: premium video is not actually protected (MUST fix before any premium goes live)
Cloudflare Stream assets use `requireSignedURLs:false`; the locked card still returns `posterUrl` (the CF thumbnail, which contains the video UID), so `…/thumbnails/thumbnail.jpg` → `…/manifest/video.m3u8` streams the full premium video for free. The `videos` Supabase bucket is public too (raw source MP4).
**Fix:**
1. `requireSignedURLs:true` for premium/subscribers-only videos (toggle in stream.ts via PATCH; flip on when a recipe is priced/subscribers-only, off when freed).
2. On-demand signed playback: `GET /recipes/:id/playback` → verify entitlement (owner/unlocked/subscribed) → mint a short-lived Cloudflare signed token → return signed HLS URL. Premium cards carry `hlsUrl:null`; the player fetches on-demand (signed URLs expire, can't be cached in the feed payload).
3. Public **teaser poster**: signed videos' CF thumbnails won't load for non-entitled viewers → store a public teaser-poster copy (new `posters` bucket or Supabase public) so locked cards still look appealing without leaking a usable Stream URL. Redact the CF `posterUrl` from locked cards.
4. Lock down raw source: delete the Supabase source MP4 after successful CF relay (or make the bucket private).
5. Also: subscription entitlement should check `current_period_end`, not just `status='active'`.

## P2 — Premium at create (closes the free-window gap)
`POST /recipes` + `CreateRecipeInput` DTO don't accept price/visibility → a recipe is briefly free/public before the follow-up controls PATCH. Add `priceCents?`/`visibility?` to create (server-validated, ≥500 floor, monetization-active guard), and a premium toggle + price-tier picker to the upload flow (`UploadSheet`).

## P3 — Premium visuals (OTA-able)
Reusable premium thumbnail: refined gold frame + `PREMIUM` badge + locked/owned/creator states, driven ONLY by server `locked`/`price`/`subscribersOnly` (never a client guess). New per-theme gold tokens (light/dark calibrated — `--saffron` is uncalibrated). Shimmer via IntersectionObserver, `animation` not transition, honor OS `prefers-reduced-motion` + app `reduceMotion`. Apply to Profile grid (3-col, aspect 3/4) + CookSheet grid (2-col, fixed 180) — memoize tiles. Enhance RecipeSheet's gate into a proper purchase-preview sheet.

## P4 — Apple IAP (native build 29)
- Plugin: **RevenueCat (recommended)** — handles StoreKit + receipt validation + entitlement webhooks; free under $2.5k/mo tracked revenue. Alt: raw StoreKit via `cordova-plugin-purchase` + our own App Store Server API verification.
- **Consumable price-tier products** (per-recipe unlock): a fixed catalog ($4.99/$6.99/$9.99/$14.99/$19.99/$24.99). Creator picks a tier in-app; buyer purchases the matching consumable with the recipeId as `appAccountToken`.
- Purchase → server verifies the receipt (App Store Server API / RevenueCat webhook) → writes `recipe_unlocks` (same table the Stripe webhook writes; RLS unchanged). Refund via App Store Server Notifications v2 → revoke.
- Reconcile 90/10 split with Apple's cut: Apple remits ~85% (Small Business Program) to Sizzle; creator payout via Stripe funded from that. Show the live breakdown (Apple cut · Sizzle cut · creator take-home) in the creator pricing UI.
- Flip `canBuyInApp` for the IAP path only.

## P5 — Adversarial review + testing
Money/security adversarial review (Workflow) + the spec's state matrix (free/locked/owned/subscribed/creator/expired/refunded/offline/loading/light/dark/reduced-motion/account-switch/restore).

## Branden's action items (can start now, in parallel)
1. **Enroll Apple Small Business Program** (free; Apple cut 30%→15%).
2. **Create IAP products in App Store Connect** (list provided once plugin is chosen).
3. **Verify `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` are set live** on the `sizzle` (=API) Vercel project — else web unlocks settle for free (mock-mode bypass).

## Pricing transparency (creator-facing, always shown live)
Sticker → Apple (15% SBP) → Sizzle (10% of net) → creator take-home. E.g. $4.99 → $0.75 / $0.42 / **$3.82**.
