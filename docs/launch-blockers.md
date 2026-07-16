# Launch blockers — what's left before resubmitting

Generated from the pre-submission audit (2026-07-16). Build 21 was submitted and
developer-rejected on purpose; nothing can ship until a new build is sent.

Every claim below was verified against live source, the production database, or
live infra. Where something could not be checked it says UNVERIFIED — treat that
as "go look", not "it's fine".

---

## DONE (shipped 2026-07-16, OTA 1.0.36 + API)

- **Fabricated engagement counts** — seeded follower/like/save/share numbers were
  fiction (smashlab: 44,501 followers vs 2 real; 803,001 total likes vs 1).
  Onboarding rendered them under "Top cooks on Sizzle" to every new user.
  `seed.ts` no longer fabricates; production counters rebuilt from real rows.
  `view_count` / `cook_count` were already real and were left alone.
- **Fake livestream** — Go Live inserted a Mux demo clip as the creator's stream
  and the API reported `provider: "cloudflare"` while serving it. Now gated on a
  real `liveConfigured` flag; the endpoint refuses (503) rather than faking.
- **False App Store badge** on the marketing site, wired to web signup.
- **Digital-product / subscription refund hole** — `charge.refunded` only revoked
  recipe unlocks. A chargeback on a cookbook kept the file and the entitlement.
- **Partial refunds** erased the whole earning ($1 refund on a $50 tip → $50 gone).
- **`/products/:id/buy` had no try/catch** — a Stripe throw left a pending row no
  expiry event would reap, permanently blocking that buyer from that product.
- **Guideline 1.2 commitment** — added a 24h review commitment to hosted Terms,
  in-app Terms, and the report confirmation. Removed Termly boilerplate claiming
  "absolutely no obligation to screen".
- **Review notes** rewritten — they described a `showMonetization` flag that no
  longer exists and claimed no external purchase links (untrue since payouts
  moved to an in-app browser).
- **Sandbox test artifacts** purged from prod; test-mode subscription canceled in
  Stripe so it can't renew and repopulate the ledger.

Restore points: `.backups/*.json` (gitignored).

---

## BLOCKERS — before resubmitting

### 1. Prove a video can be uploaded on production  ·  Branden + agent
Exactly one real Cloudflare upload has ever been attempted in prod: asset
`c870e5cb`, `status='error'`, `duration_seconds=-1`, attached to zero recipes.
Every playable video is `provider='mock'` seed content. Config is correct
(`/health` → `cloudflareConfigured: true`), but the production sample size for
"a creator can post a video" is one, and it failed.

**Do this first. If uploads are broken, nothing else on this list matters.**

### 2. Supabase Auth email — real users cannot sign up  ·  Branden, then agent
`smtp_host/user/pass = None`, `mailer_autoconfirm = False`, `rate_limit_email_sent
= 2/hr`. Supabase default SMTP refuses non-team addresses.
`terryleleasr@icloud.com` signed up 2026-06-26 — `email_confirmed_at` is still
null. Fails silently: `useAuth.ts:95-121` returns `'pending'` and
`Onboarding.tsx:403-414` shows "check your email" forever. Password reset
dead-ends identically. OAuth users are unaffected, which is why it went unnoticed.
Also a 2.1 risk if the reviewer signs up fresh.
Runbook: `docs/auth-provider-setup.md:65-88`.

### 3. Test-mode Connect account will hard-fail live payouts  ·  agent
`profiles.a91c655a…` (@Branden) has `stripe_account_id='acct_1TtLO4Jvi1AZ8fH2'`
(test mode) with `monetization_status='active'`. `monetize.ts:819-824` only
creates an account when `accountId` is null — under live keys Stripe returns 400
"No such account" and re-onboarding is impossible. `:846` only self-heals when the
id is NULL, so the stale `'active'` sticks.
Fix: null `stripe_account_id`, set `monetization_status='none'`, clear
`sub_price_cents`. Leave `creator_status='active'`. Do it in the same window as
the key swap.

### 4. Re-scope Stripe env vars to Production-only  ·  Branden
`STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are scoped `Preview, Production`
on project `sizzle`. Harmless on test keys. After the live swap, **every preview
deployment charges live cards against the production database.**

### 5. Live Stripe activation + key swap  ·  Branden
See the exact sequence below. Half a day plus Stripe's verification turnaround.

### 6. Build and submit build 22  ·  Branden
`project.pbxproj` — `CURRENT_PROJECT_VERSION = 22`, iPhone-only, team `6R2T984G9S`.
Land all JS fixes first, then archive **once**.

### 7. Decide what to do about seven recipes  ·  Branden
`count(*) from recipes` = 7, all seed rows, six of seven `provider='mock'`, ~6s
each. A first-time user gets ~42 seconds of content, then the feed dead-ends with
no end-of-feed UI. Session two re-serves the same 7 reordered (`seen` is a ranking
penalty, not a filter). Not a bug — a judgment call about whether this is a
product yet. An agent can build the end-of-feed state in an hour.

---

## THE STRIPE LIVE SEQUENCE — do not reorder

1. Activate the live platform (business details, bank, tax ID, statement
   descriptor). The live Connect responsibilities questionnaire must match
   `responsibilities: { fees_collector: 'application', losses_collector:
   'application' }` (`payments.ts:123`) — **permanent and unchangeable after
   account creation.**
2. Re-scope / delete the Preview copies of both Stripe env vars (blocker 4)
   **before** the swap.
3. Create the live webhook at `https://sizzle-chi.vercel.app/monetize/webhook/stripe`
   subscribing to exactly what the switch reads (`monetize.ts:651-768`):
   `checkout.session.completed`, `.async_payment_succeeded`,
   `.async_payment_failed`, `.expired`, `charge.refunded`,
   `charge.dispute.created`, `customer.subscription.created/updated/deleted`,
   `invoice.paid`. Payload style **Snapshot**, scope **"Your account"**.
4. Set **both** env vars together on project `sizzle` (the API — the naming is
   reversed). `env.ts:94-96` throws at boot if the key is set without the webhook
   secret: a half-swap takes the **whole API** down, not just payments.
5. Redeploy and **verify the deploy actually promoted**. A 200 from
   `/monetize/config` does NOT prove the new build is live — old code returns 200
   too. Check the commit is Ready in Vercel Deployments.
6. Agent nulls the test-mode Connect account (blocker 3) in this same window.
7. Re-onboard through live Connect.

UNVERIFIED: whether the live platform has Accounts v2 (`/v2/core/accounts`,
`payments.ts:109`) enabled — the sandbox did. If live 400s,
`STRIPE_V2_API_VERSION` (`env.ts:50`) is the escape hatch.

---

## SHOULD-FIX before launch (ordered by quality-per-hour)

- **8 `window.confirm`/`window.prompt` calls → one `<ConfirmSheet>`.** Delete
  draft, delete comment, delete collection, delete conversation, block user,
  cancel subscription, remove tier, remove product. A raw OS alert is the loudest
  "web app in a wrapper" tell and it sits on the highest-consequence actions.
  Best quality-per-hour item on this list.
- **Set `SENTRY_DSN` + `VITE_SENTRY_DSN`.** Neither is set. `lib/sentry.ts:25-30`
  no-ops. The catch at `monetize.ts:770-772` — the one that 500s so Stripe retries
  — logs to a console retained ~1h and alerts nobody. Stripe gives up after ~3
  days; you'd learn from an angry creator. Task #20 shipped the code; the provider
  was never turned on.
- **Set `RESEND_API_KEY`.** `services/email.ts:12` silent-no-ops. Ban /
  post-removed / post-restored notices never send — users get moderated with no
  explanation. Same key as blocker 2.
- **Add `keyMode` to `/health`.** `stripeConfigured = !!STRIPE_SECRET_KEY` is
  byte-identical for test and live keys. ~10 lines.
- **`charge.dispute.closed` handler.** Winning a dispute never restores the
  earning or the access — the row stays `refunded` forever.
- **Refund runbook / admin refund endpoint.** No `reverse_transfer` or
  `refund_application_fee` anywhere. On destination charges, refunding without
  reversing the transfer leaves the creator's 90% with them and debits you 100%
  of gross. A disputed $10 tip ≈ **−$25** for you.
  (`losses_collector: 'application'` is the correct permanent architecture — the
  gap is the missing reversal call, not the model.)
- **`account.updated` handler.** `monetization_status` only refreshes via a poll
  that upgrades pending→active and never downgrades. Stripe re-requests documents
  at volume thresholds; you'd keep taking checkouts whose destination now fails.
- **Premium-video leak** — `stream.ts:64` sets `requireSignedURLs: false`;
  `mappers.ts:252` nulls `hlsUrl` for locked recipes but keeps `posterUrl`, which
  embeds the Stream UID. String-replace `/thumbnails/thumbnail.jpg` →
  `/manifest/video.m3u8` and the paid video plays. A refunded unlocker keeps a
  working manifest forever. Not an App Review risk, and priced recipes = 0 today —
  so it can trail submission, but **not your first sale.** Needs a Cloudflare
  Stream signing key.
- **SEO pages leak gated content** — `seo.ts:33-38` ignores `auto_hidden`, so a
  post auto-hidden by report threshold vanishes from the app while `/r/:id` still
  serves it to Google. And `seo.ts:52` falls back to `image_urls[0]` with no gated
  check — for a premium photo carousel that image *is* the paid content.
- **Owned products invisible on iOS** — `CookSheet.tsx:173` gates the whole
  ProductShelf on `canBuyInApp`, so a fan who bought a cookbook on web can't
  download it in the app. Premium recipes handle this correctly, which is what
  makes it look like an oversight.
- **Failed transcodes** — `queries.ts:1125` discards the `pollVideoReady` result.
  A failed transcode leaves a published post in the feed forever showing "This
  video couldn't be processed." Given your one real upload is `status='error'`,
  this is the live failure mode.
- **`bump_goal` only ever adds** — nothing decrements on refund. A public number
  that can only drift up, farmable by tip-then-chargeback.
- **Stale fee docs + competitor claims** — `packages/shared/src/index.ts:294` says
  "never exceeds the stated 5.5%" directly above `PLATFORM_FEE_PCT = 10`. And
  `PLATFORM_FEE_RATIONALE` ships "YouTube takes 30–45%, TikTok up to 50%,
  Patreon 8–12%" and "we never sell your data" as fact, in-product. Verify each or
  soften. *The fee disclosure itself is genuinely well done — `TipSheet.tsx:91`
  itemizes the 10% in dollars before payment and `platformFeeCents` floors so
  rounding favors the creator. Don't rebuild it.*
- **Leaked-password protection off, password minimum 6.** One dashboard toggle.
- **"Save for offline" doesn't download the video** — `lib/offline.ts:3-7` says so
  outright: only the poster is cached. Cache the MP4 or retitle.
- **Dead code**: `GET /live` (zero callers), `POST /uploads/captions` (zero
  callers; `transcribe.ts:19-27` has an empty openai branch that always returns a
  placeholder string even though the key IS set), `store.ts:283-284` fake seed
  state and `sendComment` which hardcodes author `'alexcooks'`.
- **`liveConfigured` is duplicated as a local constant** in `CookSheet.tsx` and
  `CreateSheet.tsx` — no config endpoint carries it. Hoist to `lib/native.ts` or
  add it to a config endpoint when live is wired for real.

---

## POST-LAUNCH — stop worrying about these

- **Task #76 (Apple external purchase link).** Keep it out. It adds a genuine
  3.1.1 surface in exchange for nothing; fan purchases are already correctly
  hidden and applied consistently.
- **Tasks #65/#66 (perf).** No measurement supports pulling them forward.
  `hls.js` is lazily imported and never touches first paint; on native the bundle
  is local disk. Virtualization is meaningless at 7 items and carries real
  snap-scroll-jump risk.
- **PITR.** 7 completed daily backups exist. Worst case ≤24h loss, and the money
  ledger has Stripe as its upstream source of truth. Enable when paid content
  exists.
- **Stripe webhook behind the global rate limit.** A 429 is safe — Stripe retries
  and settlement is genuinely idempotent (conditional `.eq('status','pending')`
  plus the `tips_provider_ref_uidx` unique index).
- **Cron heartbeats** (all three crons verified enabled and failing closed),
  **live viewer counts**, **native email-confirm redirect**, **video-provider
  fail-open**, **IP-keyed rate limit**, **view-count dedup**, **Stripe Tax**.

---

## NOT BLOCKERS — verified false, don't spend a day on them

- **There is no RLS paywall hole.** Every gated table was attacked with the
  production anon key: `subscriptions`, `recipe_unlocks`, `tips`, `payouts`,
  `product_purchases`, `messages`, `conversations`, `admin_credentials`,
  `admin_sessions`, `cook_logs`, `creator_products`, `push_tokens`,
  `moderation_log`, `rate_limits`, `support_requests`, `comments` — all return
  `[]` or `42501`. Profiles column grants deny phone/role/banned/
  stripe_account_id/country/region/notif_prefs/fraud_flag/delete_at.
- **The 24 `rls_enabled_no_policy` advisor lints are not findings.** RLS on with
  no policy = deny-all, which is correct for service_role-only tables.
- **Showing creator earnings on iOS does not violate 3.1.1.** It governs purchases
  *by* the user; money flowing *to* a creator isn't a purchase and a payout
  onboarding link isn't a purchasing mechanism. Moot anyway: the review account is
  `creator_status='regular'` and can't reach the Stripe surface.
  Caveat: **don't hand the reviewer a creator-active account.**
- **`CRON_SECRET` is set** and `internal.ts:15-21` fails closed (401).
  **`GoogleService-Info.plist` is the real Firebase file.** **`aps-environment` is
  already `production`.** Three stale lines in `docs/app-store-deployment.md`.
- **No secrets are leaked.** `.mcp.json` is gitignored and was never committed.
  The client bundle references only `VITE_SUPABASE_URL/ANON_KEY/API_URL/
  SENTRY_DSN/SITE_ORIGIN`; the anon key is the new `sb_publishable_` format.
  `ButtonShowcase` requires `import.meta.env.DEV` and is unreachable in prod.

---

## BRANDEN-ONLY — the critical path

Start these today; Stripe verification and DNS propagation are wall-clock, not
work.

1. **Resend** — verify `getsizzle.app` (SPF + DKIM at your registrar), mint an API
   key. Unblocks blocker 2 *and* the moderation emails. `env.ts:39` already
   defaults `EMAIL_FROM` to that domain.
2. **Stripe live activation** — see the sequence above.
3. **Sentry** — create the project, set the DSN.
4. **Confirm 1099 reporting with Stripe support and an accountant.**
   `monetize.ts:325` and `:342` tell creators verbatim: *"A 1099-K is issued by our
   payment processor when thresholds are met."* Connect Express tax reporting is
   **not automatic** — the platform enables 1099 e-filing in Dashboard → Connect →
   Tax reporting, billed per form. If it isn't enabled, that string is false and
   the filing obligation is yours. Resolve before any creator earns.
5. **Set billing alerts on Cloudflare, Vercel, Supabase.** Supabase and Vercel are
   both `pro` with no cliff at 10k. Cloudflare Stream is the only real cost cliff —
   per-minute delivered, no free tier; 10k users × ~20 min/day ≈ order-of-magnitude
   ~$6k/mo. UNVERIFIED (token is encrypted, usage not queryable). Ten minutes.
6. **Calendar reminder: the Apple client secret expires ~6 months out**
   (`scripts/gen-apple-secret.mjs`).
7. **Publish the Terms update** and paste the rewritten review notes into ASC.
8. **Find and stop whatever ran Stripe sandbox E2E against the production
   database at 04:43 on 2026-07-16.**
