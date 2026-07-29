# Sizzle — system risk map

Per-system risk, entry points and **verified** invariants. Every claim here was checked against
the repository or the hosted database on the date noted. Anything not verified is marked
`Unknown — requires investigation` rather than guessed.

Last verified: **2026-07-29** against commit `4bb562f` and the hosted Supabase project.

How to use this: before changing anything in a system below, read its row, confirm the invariants
still hold, and update this file if you learn something new. See
`CHANGE_SAFETY_CHECKLIST.md` for the procedure.

---

## Risk tiers

| Tier | Systems |
| --- | --- |
| **Critical** | Payments & purchases · Creator earnings · Payouts · Premium entitlements · Auth & authorization · Database & migrations · Account/data deletion · Moderation enforcement |
| **High** | Cloudflare Stream & uploads · Recommendation ranking · Webhooks · Push notifications · Account switching & cache isolation · Native/Capacitor |
| **Medium** | Search · Hashtags & trending · Comments & social · Notifications · Email · Shared components · State management |
| **Low** | Documentation · Internal naming · Isolated visual refinement |

---

## Money: the verified model

**Representation — VERIFIED.** All money is **integer cents**. A schema sweep of every
money-named or float-typed column in `public` found no `numeric`, `money`, `real` or
`double precision` in any money column. The `numeric` columns that exist
(`hashtag_metrics.trend_score`, `recipes.avg_watch_ratio`, …) are ranking scores, and
`profiles.boost` is a `real` ranking multiplier — none are money.

Money-bearing columns: `recipes.price_cents`, `creator_products.price_cents`,
`creator_tiers.price_cents`, `subscriptions.price_cents`, `iap_transactions.price_cents`,
`payouts.amount_cents`, `tips.amount_cents / fee_cents / net_cents`,
`profiles.goal_cents / goal_raised_cents / sub_price_cents`, `notifications.amount_cents`.

**Ledger model — VERIFIED.** `public.tips` is the earnings record. A creator's balance is
**derived, not stored**: `public.creator_earnings(uid)`
(`supabase/migrations/20260701070000_creator_earnings_agg.sql`) is a `stable security definer`
function returning `sum(amount_cents), sum(fee_cents), sum(net_cents), count(*)` over
`tips where creator_id = uid and status = 'succeeded'`.

> **Invariant:** creator earnings are an aggregate over `succeeded` tips. There is no stored
> balance column to drift. Therefore **never delete or mutate a `tips` row to correct earnings** —
> doing so silently rewrites history with no audit trail. Corrections must be new rows or an
> explicit status transition.

**Idempotency keys — VERIFIED, all enforced by database constraints** (not by application logic
alone, which is the right design):

| Table | Constraint | Guarantees |
| --- | --- | --- |
| `iap_transactions` | `PRIMARY KEY (transaction_id)` | one Apple store transaction processed once |
| `tips` | `UNIQUE (provider, provider_ref) WHERE provider_ref IS NOT NULL` | one provider event → one tip |
| `payouts` | `UNIQUE (stripe_payout_id)` | a payout cannot be recorded twice |
| `subscriptions` | `UNIQUE (stripe_subscription_id)`, `UNIQUE (subscriber_id, creator_id)` | one sub per provider id; one active sub per pair |
| `recipe_unlocks` | `PRIMARY KEY (user_id, recipe_id)` | one unlock per user per recipe |
| `product_purchases` | `PRIMARY KEY (user_id, product_id)` | one purchase per user per product |

> **Invariant:** every money path has a DB-level uniqueness guarantee. If you add a new money
> path, add the constraint in the same migration — do not rely on an application-level check.

**Refunds and chargebacks — VERIFIED.** Reversal is a **guarded status transition on the tip row**,
not a compensating row. `tips.status` is `'pending' | 'succeeded' | 'refunded'`, and the webhook does
`update({ status: 'refunded' }) … .eq('status', 'succeeded')`. Because `creator_earnings` sums only
`succeeded` rows, the flip removes the earning from the balance automatically.

> **Invariant:** the `.eq('status','succeeded')` guard is what makes reversal idempotent — a
> redelivered webhook matches zero rows instead of double-reversing. Never remove it.

Handled Stripe events: `checkout.session.completed`, `.async_payment_succeeded`,
`.async_payment_failed`, `.expired`, `charge.refunded`, `charge.dispute.created`,
`charge.dispute.updated`. The code distinguishes an Amex/Discover **inquiry** from a real
chargeback, and deliberately does nothing on a dispute settled in our favour. A **partial** refund
does **not** reverse the earning: `fullReversal = isDispute || amount_refunded >= amount`. An
expired checkout deletes the still-`pending` tip (it never counted). The RevenueCat webhook revokes
the `recipe_unlocks` row on an Apple refund and retries rather than 200-ing on a read failure.

**Documented-but-unhandled case** (already noted in code, `monetize.ts` ~line 752): a Dashboard
transfer reversal done *without* also refunding the application fee settles the creator at minus the
fee. The code's stated fix is to refund in-app instead.

**Apple IAP idempotency key — VERIFIED and load-bearing.** `routes/monetize.ts` filters to
purchases that have a `store_transaction_id` and never falls back to RevenueCat's own id
(`.filter((p) => !!p.store_transaction_id …)`). The refund webhook keys off the same Apple id.
A helper that fell back to `p.id` was removed in `f58b458` precisely because adopting it would
have broken that pairing.

---

## Payments & purchases — CRITICAL

- **Entry points:** `apps/api/src/routes/monetize.ts` (1374 LOC), `services/payments.ts`,
  `services/revenuecat.ts`.
- **Providers:** Stripe Connect Express (web), Apple IAP via RevenueCat (native).
- **Webhooks:** `POST /monetize/webhook/stripe`, `POST /monetize/webhook/revenuecat`.
- **Stripe signature verification — VERIFIED.** The handler reads the **raw** body
  (`await c.req.text()`), reads `stripe-signature`, and recomputes
  `createHmac('sha256', secret).update(\`${t}.${raw}\`)`, rejecting a mismatch with 401. Do not
  refactor this to parse JSON first — verification requires the exact raw bytes.
- **RevenueCat webhook auth — VERIFIED.** Gated on `env.REVENUECAT_WEBHOOK_AUTH`.
- **Client-side purchase surfaces are gated off native** (`canBuyInApp` in `lib/native.ts`) for
  App Store guideline 3.1.1.
- **`ALLOW_SANDBOX_IAP` is a live paywall bypass.** When `true` the verifier accepts sandbox
  receipts, which are never charged. Must be unset/false in production. Its state is surfaced in
  the admin dashboard's Security tab (`GET /admin/security-status`), deliberately **not** on the
  public `/health`.
- **Failure impact:** duplicate charges, unpaid unlocks, phantom creator sales, refund/entitlement
  desync.
- **Required tests:** duplicate webhook delivery, timeout after DB success, timeout after provider
  success, refund after earnings, chargeback after payout, currency mismatch, concurrent purchase.

## Creator earnings & payouts — CRITICAL

- **Entry points:** `routes/monetize.ts`, `public.creator_earnings(uuid)`.
- **Balance is derived** from `tips` (see Money model above).
- `creator_earnings` is `revoke execute … from public, anon, authenticated` and granted only to
  `service_role` — VERIFIED in the migration.

### Payouts: Stripe is the source of truth, not our database — VERIFIED

`public.payouts` exists (`20260714160000`) with
`status in ('pending','in_transit','paid','failed','canceled')`, `stripe_payout_id` unique, and
an `on delete cascade` from `profiles`. **It has zero readers and zero writers in the entire API**
(`grep -rn "from('payouts')" apps/api/src` → no matches) and **zero rows in production**.

`GET /monetize/payout` reads the live balance from Stripe (`stripeBalance(accountId)`) and mints an
Express dashboard link; it deliberately returns **no payout date**, because the real date depends on
each charge's rolling availability delay (a code comment records that our old estimate said Jul 16
where Stripe said Jul 22).

> **Consequences of this design, which are good to know before "fixing" anything:**
>
> - Sizzle does not record payouts, so the "double payout" risk class does not apply to our code.
>   Stripe Connect owns payout scheduling, thresholds and state.
> - There is therefore **no server-side minimum payout threshold in our code** — that was an open
>   question and the answer is that Stripe governs it.
> - `public.payouts` is **unused scaffolding**. Do not treat it as a live ledger, and do not start
>   writing to it without deciding whether Stripe or Postgres is authoritative — having both write
>   payout state is how double-counting starts.

- **Failure impact:** wrong creator balances, missing earnings. (Double payout is Stripe's domain.)

## Premium entitlements — CRITICAL

- **Source of truth:** `public.recipe_unlocks` (PK `user_id, recipe_id`) and `subscriptions`.
- **Read paths that must gate:** `mappers.ts` `buildCards` (feed cards),
  `routes/recipes.ts` `GET /:id/playback` (signed HLS URL).
- **Server-authoritative.** Client state, hidden buttons and cached flags never grant access.
- **Signed playback URLs are entitlement-scoped to one account** — `lib/signedPlayback.ts` cache is
  cleared on any identity change in `auth/useAuth.ts`.
- **Known gap — characterized 2026-07-29, not yet fixed.** `GET /recipes/:id/playback` is
  `optionalAuth`. Its premium branch is correct and thorough (owner / `recipe_unlocks` / active
  non-expired subscription). The **non-premium** branch —
  `if (!premium) return c.json({ hlsUrl: asset.hls_url })` — returns the URL with **no** check on
  recipe `status`, `auto_hidden`, private-account follower state, or blocks.
  - Verified the client only ever calls this endpoint for **premium** videos: free videos carry
    their URL in the card payload (`Feed.tsx:340`, `lib/signedPlayback.ts`). So that branch is a
    defensive fallback that never runs legitimately, and its own comment says so.
  - **No premium content is exposed.** The exposure is limited to free videos whose card would
    *not* be served: a **removed** or **auto-hidden** post, a draft, a private account's post, or a
    post by someone who blocked the viewer. For a genuinely public post the URL is public anyway.
  - **Most consequential case: an admin removes a post for a policy violation, and anyone holding
    the recipe UUID can still stream it.** Moderation takedown does not stop playback here.
  - Bounded by needing the recipe UUID (not enumerable) and `video_assets.status = 'ready'`.
  - Note `recipeCookId()` cannot be dropped in as-is: it skips every check when `viewerId` is
    undefined, which is exactly the anonymous case this route allows.
- **Required tests:** authorized, unauthorized, different account, refunded, chargeback,
  account switch, deep link, expiry.

## Authentication & authorization — CRITICAL

- **Identity source:** Supabase Auth. The client holds a session; the API validates the bearer.
- **Middleware — VERIFIED** (`apps/api/src/middleware/auth.ts`): `optionalAuth`, `requireAuth`,
  `requireAdmin`, `requireNotBanned`. Admin routes additionally require
  `requireAdminUnlock` (`middleware/adminUnlock.ts`) — a second factor, **fail-closed**, exempting
  only `/admin/unlock`, `/admin/passphrase` and `/admin/security-status` (the client needs the last
  one to choose between the "set" and "unlock" screens, i.e. before a token can exist).
- **Two Supabase clients — VERIFIED** (`apps/api/src/lib/supabase.ts`):
  - `supabaseAdmin` — service-role, bypasses RLS. Used for nearly everything.
  - `userClient(accessToken)` — anon key + caller JWT, runs under **that user's RLS**. Used in
    exactly **four** places, all in `routes/me.ts`, touching exactly **two** tables:
    `profiles → update` and `saves → select`. This is the only anon/authenticated code path in
    the entire system; changing grants on those two tables can break the app.
- **Content-visibility helpers:** `recipeCookId` (status/private gate), `recipeCookIdUnblocked`
  (adds both directions of a block), `canViewCookContent` (private-account follower check),
  `loadBlockedIds` (reads `user_blocks`, both directions).
- **Failure impact:** cross-account data exposure, block bypass, premium bypass.

## Database & migrations — CRITICAL

- **96 migrations** in `supabase/migrations`, applied to the hosted project. **Append-only.**
- **PostgREST is exposed and the anon key is public**, so table grants + RLS are a real security
  boundary, not an implementation detail.
- **Write lockdown — VERIFIED.** `anon` and `authenticated` have **SELECT only** (no
  INSERT/UPDATE/DELETE) on `recipes`, `video_assets` (`20260717001356`) and on `comments`,
  `notifications`, `reactions`, `reposts`, `saves`, `collections`, `user_blocks`
  (`20260729190000`). `service_role` retains full DML. `profiles` uses **column-level** grants
  (`tastes`, `push_enabled`, `phone` are `authenticated=w`; social URLs are `rw`) — those live in
  `pg_attribute.attacl`, not `pg_class.relacl`, so a `relacl` check alone will look wrong.
- **The client never touches a table directly — VERIFIED.** `supabase.from(` has **never** appeared
  anywhere in `apps/web` in the entire git history (`git log -S`). The client uses Supabase for
  `auth` and `storage` only.
- **`user_blocks` has RLS enabled with zero policies** — fail-closed by design.
- **`profiles` has three layers**, which is the pattern to copy: column-level grants, the
  `profiles_update_self` RLS policy, **and** a `guard_profile_privileged()` trigger that raises if
  `current_user` is `authenticated`/`anon` and `role`, `verified_tier`, `banned` or
  `creator_status` changed.

### Which column-blind policies still matter — VERIFIED empirically 2026-07-29

Policies are column-blind everywhere (`with check (user_id = auth.uid())` style), so what matters
is whether a table still grants writes to `anon`/`authenticated`. Tested against the local stack
with real user JWTs through PostgREST:

| Table | Write grant | Result |
| --- | --- | --- |
| `comments` | revoked | `permission denied` — lockdown confirmed working |
| `recipes`, `video_assets`, `notifications`, `reactions`, `reposts`, `saves`, `collections` | revoked | unreachable |
| `follows`, `follow_requests`, `user_mutes`, `cook_logs`, `cook_events` | never granted | unreachable |
| **`recipe_steps`, `recipe_ingredients`** | **still granted** | **owner CAN rewrite published content — moderation bypass, see below** |
| **`comment_likes`** | **still granted** | a user can insert a like row for any comment id |
| **`reports`** | **still granted** | a user can file a report directly, skipping `fileReport()` |
| `collection_recipes`, `downloads`, `recipe_views` | still granted | owner-scoped; low impact |

**Moderation bypass — CONFIRMED EXPLOITABLE, not yet fixed.** `20260717001356` locked `recipes`
but not its child content tables. `recipe_steps` / `recipe_ingredients` grant `authenticated` full
DML with an owner-write policy, so a creator can publish a clean recipe (which passes
`moderate(title, cuisine, ingredients, steps, caption)` at `recipes.ts:133` on create and `:1257`
on edit) and then `PATCH` the step text straight through PostgREST. Measured: owner update →
`rowsAffected=1`, text replaced. Non-owner → `rowsAffected=0`, unchanged, so **RLS access control
is sound; the gap is that moderation never runs**. The fix is the same one-line revoke pattern.

`comment_likes` and `reports` are lower impact: a forged `comment_likes` row only affects the
viewer's own "did I like this" flag (`comments.like_count` is maintained by the SECURITY DEFINER
`toggle_comment_like` RPC and `comments` is write-locked), and `reports` has a
`UNIQUE (target_type, target_id, reporter_id)` index so one account cannot mass-file toward the
20-report auto-hide threshold — the bypass is only of the reporter-abuse throttle.

## Cloudflare Stream, uploads & video — HIGH

- **Entry points:** `services/stream.ts`, `services/videoFinalize.ts`, `routes/uploads.ts`,
  `lib/uploadTask.ts` (client), `internal/finalize-videos` cron.
- Web uploads go **direct to a Cloudflare ticket**; **native uploads to Supabase Storage and the
  server relays into Cloudflare** — iOS WKWebView cannot deliver the multipart body to Cloudflare.
- `video_assets` is write-locked to `service_role` (see above): a client could otherwise set
  `status='ready'` to skip thumbnail moderation, or inject an off-domain `hls_url` served through
  the trusted app.
- Deletion is queued through `pending_media_deletions` and drained by the finalize cron with a
  time budget, priority for `account_delete`/`ban_purge` (GDPR), and attempt counting.
- **Known gap — requires review:** `services/videoFinalize.ts` logs raw Cloudflare provider UIDs
  and, on some error paths, the raw Supabase Storage source URL of an uploaded video.
- **Never** expose Cloudflare credentials to the client, trust client-reported ownership, or treat
  upload completion as processing completion.

## Recommendation system — HIGH

- **Design doc:** `docs/recommendation-algorithm.md`.
- **Signals:** watch ratio (rolled up by `internal/rollup-watch-ratios`), likes, dislikes,
  comments, shares, reposts, saves, follows, Not Interested, blocks, reports, hashtag affinity,
  trend score (`internal/rollup-hashtag-trends`, every 15 min).
- **A signal with no obvious caller is not dead** — it may be event-driven, background-processed,
  feature-flagged, or consumed by a cron. Require strong evidence before removing anything here.
- Safety, privacy and block filtering must run **before** ranking.
- **Note:** `useTrendingHashtags` / `GET /hashtags/trending` (the momentum leaderboard) is computed
  by a live cron but currently has **no UI consumer**. It is unfinished, not dead.

## Moderation & reports — CRITICAL

- **Entry points:** `services/reports.ts`, `services/moderation.ts`, `routes/admin.ts`,
  `routes/reports.ts`, `services/audit.ts`.
- **Every admin moderation action must call `logModeration()`** so it lands in `moderation_log`
  and appears in `/admin/log`. A `console.log` is not an audit trail (fixed for hashtags in
  `18d1040`).
- Auto-hide threshold and reporter-abuse throttle live in `services/reports.ts` as named constants.
- Moderation emails escape user content via `escapeHtml` in `services/email.ts`.

## Account switching & cache isolation — HIGH

- **React Query keys are NOT account-scoped** (`['me']`, `['notifications']`, `['thread', id]`…).
  The cache is therefore wiped on **identity change**, keyed on the user id, in `App.tsx`.
  Keying on auth *status* alone is insufficient: a recovery or OAuth deep link arriving while
  another account is signed in swaps A → B without ever reporting `anon`.
- `auth/useAuth.ts` clears the sibling caches on the same transition: signed playback URLs, local
  clips, `sizzle.cache.me`, `sizzle.cache.cook`, `sz_offline_*` (downloaded recipe bodies),
  `sz-recent-searches`.
- **If you add any cache holding user data, clear it in both places.**

## Native / Capacitor — HIGH

- `capacitor.config.ts`, `apps/web/ios/`, `apps/web/android/`, `lib/native.ts`.
- **Native changes cannot ship over the air.** OTA (Capgo) carries JS/CSS only; anything touching
  `ios/`, `android/`, plugins, permissions or entitlements needs a new build.
- Cleartext HTTP + `androidScheme:'http'` are gated behind `SIZZLE_LAN=1` (dev only) as of
  `6715f4f`. Changing `androidScheme` changes the WebView origin and orphans local storage.
- **Known gap:** the Android project registers **4 of 13** Capacitor plugins
  (`android/app/src/main/assets/capacitor.plugins.json`) while iOS registers 13. Android has never
  been uploaded. Fix with `npx cap sync android` before any Play Store attempt — the missing
  entries are staleness, **not** evidence the plugins are unused.
- `ios/App/App/capacitor.config.json` is gitignored build output; `release-ios.sh` runs
  `npx cap sync ios`, so it regenerates. Using `SKIP_WEB_BUILD=1` skips that and can bake a stale
  config (e.g. `autoUpdate:false`, disabling OTA) into a build.

## Deployment, secrets & environment — CRITICAL

- **Vercel names are reversed:** project `sizzle` = the **API**; project `sizzle-api` = the
  **frontend**. Always confirm both reached READY after a push.
- **24 environment variables**, all documented by name in `apps/api/.env.example` (`e3738a7`).
  Most fail **silently** when unset: no `CRON_SECRET` means all five crons 401 and stop; no
  `RESEND_API_KEY` means moderated users get no explanation; an unparseable `FCM_SERVICE_ACCOUNT`
  means every push is a no-op while notification rows keep appearing.
- **Never** put a real value in `.env.example` — it is committed.
- **Known finding:** `docs/stripe-review-response.md` contains a live Stripe **account id**
  (`acct_…`). Not a credential, but an unnecessary production identifier in the repo.

## Testing — current state

- **One** automated test in the whole repo: `apps/web/src/components/controls.contract.test.mjs`
  (`npm run test:controls`). No unit/integration/E2E framework.
- **No ESLint is installed**, despite `eslint-disable-next-line react-hooks/exhaustive-deps`
  comments in eight places — those rules have never run. The eight suppressed effects were audited
  by hand on 2026-07-29 and are correct (they use refs to avoid stale closures).
- `noUnusedLocals` and `noUnusedParameters` are on in both apps and both typecheck clean, so there
  are no unused imports or variables to find in `.ts`/`.tsx`.
- Meaningful verification is therefore manual, on the **iOS Simulator**, plus targeted harnesses
  written per change (see the 14-case authorization harness described in `39ff972`).

---

## Open findings — evidence gathered, decision pending

Ranked. Each was verified; none is fixed.

1. **Recipe-content moderation bypass** (medium-high). `recipe_steps` / `recipe_ingredients` still
   grant `authenticated` full DML, so a creator can publish clean and then rewrite the text through
   PostgREST, skipping `moderate()`. Confirmed exploitable end to end. Fix is the same revoke
   pattern as `20260717001356` / `20260729190000`; the client never writes these tables directly
   (it has never contained a `supabase.from(` call), so a revoke is safe by the same argument.
2. **`GET /recipes/:id/playback` non-premium branch** (medium). A removed / auto-hidden / private /
   blocked post's free video is still streamable by anyone holding the recipe UUID. Defeats
   moderation takedown. No premium exposure.
3. **`videoFinalize.ts` logging** (low-medium). Logs raw Cloudflare provider UIDs and, on some
   error paths, the raw Supabase Storage source URL of an uploaded video — the same identifiers the
   file otherwise works hard to keep off premium posters.
4. **`comment_likes` / `reports` direct writes** (low). Bounded as described above.
5. **Live Stripe account id in `docs/stripe-review-response.md`** (low). Not a credential, but an
   unnecessary production identifier committed to the repo.

## Known unknowns

Genuinely not established. Do not guess at these.

- Whether the unused `public.payouts` table is intended to become a real ledger later, or should be
  dropped. Both are defensible; the decision is product/finance, not engineering.
- Android end-to-end state. Nothing has ever been uploaded, the native project registers 4 of 13
  plugins, and no build has been verified. Everything about Android is unverified.
- Whether any RLS policy should additionally become column-scoped now that the write grants are
  revoked — the grants make it moot for the locked tables, but a future `grant` would re-expose it.
