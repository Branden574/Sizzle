# SEV-1 — Supabase project `gsxoaurmsgqascxukony` unreachable (ongoing)

**Status: OPEN. Production is down for all users.** Started `2026-09-21T18:23:07Z`
(11:23 AM PDT Mon 09-21). **37h20m as of 2026-09-23 07:43Z** — re-verified by session 34.
Owner action is the ONLY fix — no repo change, rollback or redeploy can touch it.

> **🛑 READ §4 STEP 0 BEFORE YOU CLICK RESUME.** Session 18 found that the first
> `finalize-videos` cron tick after restore (within **60 seconds**) mass-flips every
> outage-stranded video to a **terminal `error` state that the finalizer refuses to
> re-poll** — which silently converts TD-29's prescribed backfill into a no-op and makes
> its counting query return `0`. One dashboard toggle before Resume avoids the whole mess.

> **⏳ Stripe auto-retry expires `2026-09-24T18:23Z` — ~34h39m of slack left (§2).**
> Restore before it and the **Stripe** half self-heals with zero manual work. Missing it is *not*
> a cliff — manual replay stays open to `2026-10-06` (dashboard) / `2026-10-21` (API). There is
> real time; this is urgent, not frantic.
> **In calendar terms (session 34):** that expiry is **11:23 AM PDT Thursday 09-24**, so
> **Wednesday 09-23 is the last full working day on which the cheap path is still available.**

> **🍎 NEW, session 23 — the Apple/RevenueCat half does NOT self-heal, and its window has
> ALREADY CLOSED.** RevenueCat retries a failing webhook **5 times over 155 minutes total**,
> not three days. Every Apple refund/chargeback event from the first ~24.5 h of this outage has
> therefore **permanently exhausted its automatic retries**, and restoring the database will not
> replay them. Consequence per missed event: a refunded buyer **keeps premium access forever**
> and the creator is **paid out for a purchase Apple reversed**. Recovery is the dashboard
> **Retry** button, and it is now a *manual* step that restore does not cover — see §2 "The
> Apple clock" and §4 step 6. Good news, also session 23: the **grant** side is safe and
> self-heals; nobody is charged without eventually getting their unlock (§2).

This page exists because twenty-three unattended watchdog sessions have now diagnosed the same
outage and appended well over 1,000 lines to `LOG.md`. The diagnosis is finished. This is
the one-page action sheet. **Read this, not the log.**

---

## 1. What you have to do (Level D — owner only, ~2 minutes)

0. **First, disable the crons** — Vercel → project **`sizzle`** (the API; naming is
   reversed) → Settings → Cron Jobs → click **Disable Cron Jobs**. No deploy needed.
   This is a 10-second toggle that buys you an unhurried capture window; see §4 step 0
   for why it matters and what to do if you forget. **Confirmed still required as of
   `2026-09-23T07:43Z`** — session 34 pulled the API's runtime logs and the crons are
   demonstrably live (21 `finalize-videos` + 22 `publish-scheduled` invocations in the
   21 minutes `07:22:34Z`–`07:43:34Z`), so the TD-34 trap is armed and nothing has
   disabled it.

   > **Corrected session 19 — the control is project-wide, not per-cron.** Sessions 18's
   > wording ("disable `/internal/finalize-videos`") implies a per-cron switch. Vercel's
   > own docs describe exactly one control — a **`Disable Cron Jobs`** button that stops
   > **all** of a project's crons ([manage-cron-jobs](https://vercel.com/docs/cron-jobs/manage-cron-jobs),
   > last updated 2026-08-11: *"Disabling Cron Jobs: Click the Disable Cron Jobs button"*;
   > updating or deleting an individual entry needs a `vercel.json` edit **and a redeploy**).
   > `vercel crons ls --project sizzle` likewise lists the five paths with no per-cron state.
   > **Don't go hunting for a per-cron toggle and conclude this step is impossible** — that
   > lands you on Resume with `finalize-videos` live, which is the exact TD-34 trap.
   >
   > **Disabling all five is safe, and is in fact better.** Audited session 19:
   > `publish-scheduled` has no lower `created_at` bound (`internal.ts:251-256`), so
   > anything scheduled mid-outage still publishes whenever the cron resumes — nothing
   > strands; both rollups recompute from source; `save-nudges` is daily and dedupes
   > forever via `save_nudges`. The bonus: zero DB write pressure at the moment of Resume,
   > which matters if the dashboard shows the **Fair Use / quota** branch below, where
   > *"pausing does not remove usage already accumulated."* Re-enable with the same button
   > once you have the stranded-video list.
1. Open the [Supabase dashboard](https://supabase.com/dashboard) → org → project `gsxoaurmsgqascxukony`.
2. The dashboard tells you *why* it stopped. Act per the branch below.
3. **Restore the existing project. Never create a new one** — see §3.

| What the dashboard shows | What it means | What to do |
|---|---|---|
| **Paused** (inactivity) | 7 days idle — *doesn't fit us, we had live traffic* | Click **Resume project**. Data + config return intact. |
| **Restricted / over quota** (Fair Use) | Free-tier quota overrun, overdue invoice, or expired card — **the mechanism that fits Sizzle** | Fix the cause first. Restrictions lift at billing-cycle reset or **immediately on upgrading to Pro**. Resuming inside the same cycle can re-restrict — *"pausing does not remove usage already accumulated."* |
| **Project not found / deprovisioned** | Deleted | **Stop. Contact Supabase support about PITR before doing anything else.** |

Why Fair Use is the likely branch: Supabase's inactivity pause needs ~a week with no
queries, and session 3 proved live user traffic right up to the outage. Sizzle is a video
app whose **native uploads relay through Supabase Storage**, which burns exactly the
free-tier quota that Fair Use restricts.

> Supabase emails the account owner when it pauses or restricts a project. **The ops inbox
> almost certainly already holds the answer.** Search it for "Supabase" around
> 2026-09-21 18:00Z — that email names the reason, which picks your branch above.

---

## 2. The money clock — this is the part with a deadline

The DB is safe — restore window **1 year**, **source-audited session 33**:
`supabase.com/docs/guides/platform/free-project-pausing.md` (fetched as raw markdown,
`HTTP 200`) — *"You can restore a paused project for up to 1 year after it was paused"*,
and *"The project will return to its previous state, including data and configurations."*
**Read the caveat before relying on it:** that page governs the **Paused** branch *only* —
it says nothing about billing suspension or deletion, so the 1-year guarantee is proven for
the branch §1 treats as most likely, **not** for all three. Check which branch the dashboard
actually shows (§1 step 2). **Stripe is not** — but it has **three**
recovery layers, not one. Each window is counted from *event creation*, so the oldest
undelivered events (from the first failure `2026-09-21T18:23:07Z`) expire first:

| Deadline | What expires | Consequence |
|---|---|---|
| **`2026-09-24T18:23Z`** | Stripe's automatic webhook retries (*"up to three days"*, live mode) | **Restore before this and the money self-heals with zero manual work.** |
| `2026-10-06T18:23Z` | Dashboard per-event **`Resend`** button (15 days) | Recovery needs **no secret key** — open the event in the Stripe dashboard and click Resend. This is the owner path. |
| `2026-10-21T18:23Z` | CLI `stripe events resend` + List Events API (30 days) | Last resort; needs `sk_live`. **After it, loss is permanent.** |

> **Source-audited 2026-09-23 (session 29).** Every figure in the table above and in the
> Apple table below was re-fetched from the providers' own current docs this hour, not carried
> forward from an earlier session: `docs.stripe.com/webhooks.md` → *"up to three days … in live
> mode"*, Dashboard **Resend** *"up to 15 days after the event creation"*, CLI `stripe events
> resend` *"up to 30 days"*; `docs.stripe.com/api/events/list.md` → List Events goes back
> **30 days**, and `webhooks/process-undelivered-events.md` documents the
> `delivery_success=false` reconciliation sweep that backs the 30-day row. RevenueCat's
> `integrations/webhooks` page confirms **5 retries at 5/10/20/40/80 min** and a manual
> **Retry** with **no stated deadline**. `webhooks.md` still contains **no** endpoint
> auto-disable policy — re-confirming session 24 from source, so nothing can cut the 3-day
> window short on its own. **All three Stripe deadlines and both Apple figures hold as written.**

**Verified mechanism** (all in `apps/api/src/routes/monetize.ts`):

- The webhook handler **500s on DB failure** (`:1195`), so events **queue in Stripe's retry
  machinery rather than drop**. This is why the deadline exists at all.
- **User-initiated purchases are fail-closed** — the pending ledger row is inserted
  *before* the checkout session (`:538`→`:541`), so the insert throws and **no card is
  charged**. Nobody is being charged for a broken checkout.
- **Stripe-originated events are NOT fail-closed.** `invoice.paid` (`:1138`),
  `customer.subscription.*` (`:1109`–`:1111`), `charge.refunded` / `dispute.*`
  (`:908`–`:910`) fire on *Stripe's* schedule regardless of our DB. A subscription renewal
  **charges the fan for real**, the webhook 500s, the entitlement is never extended →
  **paid and lost access.** Same exposure for refunds and disputes.
- Recovery is automatic because the handlers are idempotent: `invoice.paid` dedupes on the
  unique `provider_ref` index (`:1151`).

**Honest limit:** the *number* of affected events is unverifiable from an unattended
session — it needs either the DB or the live Stripe key (Level D). Mechanism and deadlines
are verified; **exposure size is unknown.**

### The Apple clock (TD-35) — 2h35m, not 3 days, and it expired `2026-09-21T20:58Z`

**Found session 23.** Sessions 1–22 read "the money clock" as *the Stripe clock*. Sizzle has a
**second, independent payment rail** — Apple IAP via RevenueCat — and it is live in production:
`vercel env ls production` shows **`REVENUECAT_API_KEY` and `REVENUECAT_WEBHOOK_AUTH` both set,
67 days old**. Its retry budget is an order of magnitude smaller than Stripe's:

> RevenueCat *"will retry later (up to 5 times) with an increasing delay (5, 10, 20, 40, and
> 80 minutes)"* — [docs/integrations/webhooks](https://www.revenuecat.com/docs/integrations/webhooks)

That is **155 minutes ≈ 2h35m** of automatic retries, total, from first failure.

| | Stripe | **RevenueCat** |
|---|---|---|
| Automatic retries | 3 days → `2026-09-24T18:23Z` | **155 min → `2026-09-21T20:58Z` — GONE** |
| Manual replay | dashboard to `10-06`, API to `10-21` | dashboard **Retry** button, no documented deadline |
| Does restore fix it? | **Yes**, if it beats the deadline | **No.** Manual, per event. |

Rolling form: any RevenueCat event older than ~2h35m has exhausted. As of 21:25Z that means
**everything from `18:23Z` on 09-21 through ~`18:50Z` on 09-22**, and the boundary advances with the
clock — an event only survives if restore happens within 2h35m of *it*.

**What is lost per missed event** (verified by reading `apps/api/src/routes/monetize.ts:796-859`,
not assumed). The handler is *correctly* written — it returns **500 on any DB failure**
(`:818`, `:829`, `:834`, `:849`) precisely so RevenueCat redelivers, and its own comment at
`:814-815` states the stake: *"A read FAILURE must retry, not silently 200 — otherwise the
refunded unlock would survive forever."* The defect is not in our code; it is that **the
external retry budget is smaller than the outage**. Once the 5 retries are spent, on a
`REFUND` / `CANCELLATION` that never landed:

1. `recipe_unlocks` is never deleted → **the refunded buyer keeps premium access permanently.**
2. `iap_transactions.revoked_at` is never stamped → no record that a reversal was owed.
3. The `tips` ledger row stays `status='succeeded'`, `provider='apple'` → **the creator is
   credited and paid out for a purchase Apple reversed.** Real money, and the loss-protection
   the Stripe path gets from `charge.refunded` / `dispute.*` (`:908-910`) is simply absent here.
4. `bumpGoal` never unwinds the funding goal.

**Nothing else repairs it.** Verified: `fetchNonSubscriptions` is called *only* on the grant path
(`:326`), nothing else in the codebase reads or writes `revoked_at`, and none of the five crons in
`apps/api/vercel.json` reconciles IAP refunds. This webhook is the **sole** revocation mechanism.

**Scope is genuinely narrow, and that is worth saying.** Only `REFUND` and `CANCELLATION` events
touch the database (`:806`); every other RevenueCat event type short-circuits to a 200 at `:858`
without a query, so the outage cost it nothing. The exposed set is *Apple refunds and chargebacks
that occurred during the outage window* — plausibly zero. **Volume is unverifiable from an
unattended session** (it needs the RevenueCat dashboard or the DB); mechanism and deadline are
verified, **exposure size is unknown** — the same honest limit as the Stripe half.

**Replay is safe** — same standard as session 17 applied to Stripe, re-derived here by reading the
writes: the `recipe_unlocks` delete is idempotent by construction (documented at `:824`), the
`revoked_at` stamp is a plain overwrite, the ledger reversal is filtered on `status='succeeded'`
(`:845`) so it cannot double-reverse, and `bumpGoal` only runs for rows that filter actually
matched. Retrying a delivered event is a no-op.

### The grant side is SAFE and self-heals — nobody is charged into a void

Checked in the same pass, because "Apple charged me and I got nothing" is the obvious fear.
`apps/web/src/data/queries.ts:161-181` is **confirm-first**: the next time the buyer taps Unlock,
`/iap/confirm` runs *before* any new purchase and claims a still-unconsumed purchase of that tier
(`:165-169`) — explicitly "what prevents a double-charge when the buyer taps Unlock a second
time". During the outage the 5 in-flight retries (`:173-177`) fail, the UI settles on a
**`pending` / "processing"** state rather than resetting to a buy button (`:178-180`), and the
purchase stays unconsumed on RevenueCat's side. After restore the next tap grants it. The server
half is fail-closed too: `/iap/confirm` needs `requireAuth` and a live DB, so no grant is ever
half-written. **Residual, stated honestly:** the heal is user-triggered, so a buyer who never
returns stays charged-without-unlock indefinitely — the unconsumed purchase persists, so it heals
whenever they do come back, but nothing pushes it.

### Replaying the backlog is safe for money — one non-financial duplicate (TD-30)

Verified session 17 by reading the handlers, not assuming. Every financial write is durably
guarded, so a replay cannot double-charge or double-pay: `invoice.paid` dedupes on the unique
`provider_ref` index (`:1151`), subscriptions upsert on `subscriber_id,creator_id` (`:1129`),
unlocks/purchases upsert with `ignoreDuplicates` (`:1095`, `:1099`), the tips flip is
status-filtered (`:1092`), and the dispute re-pay is guarded by `hasTransferInGroup` *before*
the transfer (`:1083`) — its hour-bucketed idempotency key (`:1088`) looks wrong but is
deliberate and documented at `:1076-1081`.

The one exception: **`sendWelcomeDm` (`:98-110`) re-sends on redelivery.** The conversation
upsert dedupes (`:104`) but the message insert (`:107`) has no dedupe and `messages` has no
unique constraint to backstop it. Caller is `customer.subscription.created` when active
(`:1132-1134`). Impact is a duplicate welcome DM + one duplicate push per affected new
subscriber — annoying, not financial.

**Mitigation when you replay:** use the documented `delivery_success=false` filter on List
Events, which returns only events that were never successfully delivered, so nothing that
already succeeded gets re-run. Let the automatic retries drain first and only replay what
their 3-day window missed — Stripe warns that a manual resend does *not* cancel the automatic
retry, so running both at once is how you would get duplicates.

### ⚠️ Do NOT disable the Stripe webhook endpoint to quiet alert noise

Stripe **prevents future retries** for a destination that is disabled or deleted at retry
time. That converts a fully recoverable backlog into **permanent** financial loss.

---

## 3. Restore the project — never recreate it under a new ref

The project ref is **hardcoded into shipped artifacts**, including the iOS app already on
users' phones:

- `apps/web/index.html:30` — `<link rel="preconnect">`
- `apps/web/ios/App/App/public/index.html:30` — **the shipped native bundle**
- `HOSTING.md:43,59` — `SUPABASE_URL`, `VITE_SUPABASE_URL`

So a new ref is not a config toggle — it is a **native-rebuild-and-resubmit** event
(App Store review), on top of migrating data. Restoring the existing project is the only
path that heals installed apps.

> **Checked `2026-09-23T04:34Z` (session 31) — nothing is in Apple's review queue, so App
> Store review is NOT a clock on this incident.** The paragraph above asks the forward
> question (a new ref would *force* a resubmit); the sharper reverse question had never been
> asked: **is a build sitting in review right now?** If one were, an Apple reviewer would open
> Sizzle against a dead database — and because sign-in is Supabase Auth, whose host is exactly
> the record that no longer resolves, the `review@getsizzle.app` demo account cannot
> authenticate **at all**. That is an automatic **Guideline 2.1** rejection plus days of
> requeue, landing on top of a live outage.
>
> **Verified read-only against the App Store Connect API** (GETs only; probes in
> `.codex/asc-review-state.mjs` / `-state2.mjs`, which never print the key): the sole
> `appStoreVersion` is **`1.0` `READY_FOR_SALE`**, and **all ten `reviewSubmissions` are
> `COMPLETE`**, newest submitted `2026-07-28T17:45:34Z`. Nothing is `WAITING_FOR_REVIEW` or
> `IN_REVIEW`. **There is no Apple-side deadline to race** — a negative result, and the useful
> kind.
>
> **The prohibition it creates — do not ship an iOS build until §4 steps 1–3 pass.** There is
> nothing to cancel and no rush, but a submission *opened* during the outage is a guaranteed
> rejection. This guard is the paragraph you are reading: `asc-prepare-version.mjs:63-68`
> keeps an `EDITABLE` set of
> `PREPARE_FOR_SUBMISSION`/`DEVELOPER_REJECTED`/`REJECTED`/`METADATA_REJECTED`, so it will
> not clobber a version already in review — but **nothing anywhere stops a brand-new
> submission being opened into an outage**, and `npm run release:ios:full`
> (`docs/app-store-auto-submit.md`) would do exactly that, hands-off.

---

## 4. After you restore — verification (any session can run this)

```sh
# 1. DNS must come back first — an A record, not ENOTFOUND. Nothing else can pass until this does.
node -e "require('dns').promises.resolve4('gsxoaurmsgqascxukony.supabase.co').then(a=>console.log('UP',a),e=>console.log('STILL DOWN:',e.code))"

# 2. API health — expect status:"ok", problems:[]  (503 + database-unreachable = still down)
curl -s https://sizzle-chi.vercel.app/health

# 3. A real user path, not just liveness — expect 200, not 500 db_error
curl -s "https://sizzle-chi.vercel.app/feed/for-you?limit=3"

# 4. Re-arm the pager (it is currently disabled_manually)
gh workflow enable uptime.yml
# 5. TD-29/TD-34 — videos stranded by the outage. SEE STEP 0 BELOW FIRST: if the
#    finalize-videos cron was running when you resumed, the counting query returns 0
#    for the wrong reason and you need the TD-34 reconstruction query instead.
# 6. TD-35 — Apple refunds that were dropped. THIS ONE IS NOT AUTOMATIC (see below).
```

### Step 6 (do this AFTER restore) — TD-35, the Apple refunds restore will NOT replay

Unlike the Stripe backlog, **nothing happens on its own here** — RevenueCat's 5 automatic retries
expired `2026-09-21T20:58Z` (§2). This is a manual, per-event dashboard action:

1. **app.revenuecat.com** → your project → **Integrations → Webhooks** (or a customer's
   **Customer History**) → find events in a **failed / retrying** state since
   `2026-09-21T18:23Z`. Per the docs: *"Find the failed (or retrying) event in the table and
   click Retry."*
2. Filter to **`REFUND`** and **`CANCELLATION`** types — those are the only two this endpoint
   acts on (`monetize.ts:806`); anything else was 200'd during the outage and needs nothing.
3. **Retry each one.** Replay is idempotent (§2), so retrying an already-delivered event is a
   no-op — when in doubt, retry.
4. **If the dashboard no longer lists them** (retention is not documented publicly, so assume it
   may not go back far enough), reconcile by hand instead: for each Apple refund Apple reports
   over the outage window, confirm `iap_transactions.revoked_at` is set, the matching
   `recipe_unlocks` row is gone, and the `tips` row for that `provider_ref` is `refunded` not
   `succeeded`. Any correction must be **append-only and auditable** (financial rule #5).

**Do this before the next payout run**, because item 3 in §2's loss list is a creator being paid
for a reversed sale — that is the one consequence that gets harder to unwind after money moves.

### Step 0 (do this BEFORE Resume) — TD-34, the 60-second trap

**Found session 18 by reading the cron rather than trusting TD-29's write-up.** TD-29 said
stranded assets "will never be picked up again." That is true but incomplete, and the missing
half inverts the recovery procedure:

`finalize-videos` runs **every minute** (`apps/api/vercel.json:10-11`). Its *rescue* SELECT is
floored at `created_at >= now-6h` (`internal.ts:61-74`) — that is TD-29. But the two *abandon*
UPDATEs immediately after it have **no lower bound at all** and run unconditionally, outside the
`if (pending.length)` block:

```js
.in('status',['pending','uploading']).lt('created_at', twoHoursAgo).update({status:'error'})
.eq('status','processing')      .lt('created_at', sixHoursAgo).update({status:'error'})
```

After a >6h outage the two windows no longer overlap, so every stranded asset falls *only* in
the abandon window. Consequences, in order of severity:

1. **`error` is terminal and the finalizer refuses to re-poll it** — `videoFinalize.ts:213`
   returns immediately for `ready`/`error`. So TD-29's prescribed remedy ("re-drive those ids
   through the finalizer once") becomes a **silent no-op** once the flip has happened.
2. **The old counting query returns `0`**, because it filters on
   `status in ('pending','uploading','processing')` — all of which have just been overwritten.
   It reads as "nothing was stranded," which would close TD-29 for exactly the wrong reason.
3. **The flip is probably destroying recoverable content.** Cloudflare was up for the whole
   outage, so assets that were `processing` at 18:23Z very likely finished transcoding and sit
   `ready` on Cloudflare right now. Only our record of them is wrong.

**Good news: it is reversible, and the rows are not lost.** The UPDATE sets `status` only, so
`provider_uid` survives — and `video_assets` has **no `updated_at`** (`init_schema.sql:29-40`),
but `last_polled_at` (`20260717002042_…`) is never touched by the abandon path, so it stays
frozen at its last pre-outage value. That is the reconstruction handle.

```sql
-- IF YOU DISABLED THE CRONS FIRST: the original TD-29 query is still correct.
select id, status, created_at, provider_uid from video_assets
 where provider='cloudflare' and status in ('pending','uploading','processing');

-- IF THE CRON ALREADY RAN (status was overwritten to 'error'): reconstruct the cohort.
-- No rows could be CREATED during the outage (DB unreachable), so the stranded set is
-- exactly the non-ready assets from the ~6h before it started.
select id, created_at, last_polled_at, provider_uid from video_assets
 where provider='cloudflare' and status='error' and provider_uid is not null
   and created_at   >= timestamptz '2026-09-21T12:23:07Z'
   and created_at   <  timestamptz '2026-09-21T18:23:07Z'
   and (last_polled_at is null or last_polled_at < timestamptz '2026-09-21T18:23:07Z');

-- To actually recover them you must clear the terminal state first, or the finalizer
-- short-circuits at videoFinalize.ts:213 and does nothing. Check each uid against
-- Cloudflare before flipping, then for the ones CF reports ready:
--   update video_assets set status='processing', last_polled_at=null where id in (...);
-- and let the (re-enabled) cron pick them up.
```

Re-enable the crons (same project-wide button) once you have the list. **Not
time-critical** — the rows persist
indefinitely — but it does not fix itself, and it gets harder to identify the longer normal
traffic accumulates around it.

Then reconcile money on **both** rails: compare Stripe's dashboard events since
`2026-09-21T17:54:46Z` (last known-good) against the ledger, **and** run step 6 for Apple.
Handlers are idempotent — **let Stripe's retries redeliver; never retry charges manually.**
RevenueCat is the opposite case and the easy one to forget: its retries are already spent, so
its events only come back if you press Retry.

---

## 5. Already settled — don't re-derive these

- **Root cause is project-level DNS withdrawal, not a platform fault.** All three resolvers
  (system, `1.1.1.1`, `8.8.8.8`) agree: `supabase.co` → `ENODATA` (name exists), while
  `<ref>.supabase.co` *and* `db.<ref>.supabase.co` → `ENOTFOUND` (NXDOMAIN). Parent zone up +
  every per-project record gone = pause/deprovision at the account level.
- **Not a bad deploy.** The last *pre-outage* production deploy was 15 days old. Rollback is
  not a candidate and never was. Hourly READY deploys since are these sessions' own docs-only
  log pushes.
- **`status.supabase.com` is a red herring.** Its open incidents (JWT 401s since 2026-08-14;
  project-creation latency 2026-09-22) both state existing-project availability is
  unaffected. A resolving host returning 401 is not NXDOMAIN.
- **Paused-vs-deleted is unanswerable from inside a session.** All paths are closed: the
  claude.ai Supabase connector and Gmail connector are permission-gated (re-tested session
  25 — both return "requested permissions … not granted" unattended), and
  `api.supabase.com` direct returns **401, PAT revoked** (TD-21). Only the dashboard or the
  ops inbox answers it.
  - **Refined session 25 — the local `supabase` MCP server is NOT permission-gated; it is
    tokenless.** Sessions ≤24 recorded it under the same connector-level gate as the
    claude.ai one. It is in fact *connected and reachable* this session, and
    `mcp__supabase__get_advisors` returns a server-side error, not a permission prompt:
    *"Unauthorized. Please provide a valid access token to the MCP server via the
    `--access-token` flag or `SUPABASE_ACCESS_TOKEN`."* That is an **independent second
    confirmation of TD-21's diagnosis** (the PAT, not the grant, is the blocker) and it
    hands TD-21 a concrete close condition: rotate the PAT and expose it to the server as
    `SUPABASE_ACCESS_TOKEN`. Rotation is **Level D** (owner does credentials), so no
    unattended session can do it — but it means the agent DB path is *one owner-side token*
    away, not blocked on a permission grant that would also have to be negotiated.
- **Cron `responseStatusCode: 0` rows are noise** — timing jitter from the ~7s DB-connect
  stall crossing the invocation budget. Their absence is *not* recovery.
- **SETTLED session 33 — §2's `restore window is **1 year**` is now cited.** Session 32
  left this as the sheet's one unsourced number and recorded the cause as "the `.md` suffix
  **404s** on `supabase.com/docs`". **That blocker was wrong.**
  `curl -s https://supabase.com/docs/guides/platform/free-project-pausing.md` returns
  **`HTTP 200`, 2,582 bytes of raw markdown** — the same §8 gate-bypass session 15 already
  used on this exact path. The page states *"You can restore a paused project for up to 1 year
  after it was paused"* and *"will return to its previous state, including data and
  configurations"*; its "Restore window" heading still carries the stale legacy anchor
  `#90-day-window-to-restore`, but the prose says 1 year. §2 now quotes it.
  **The narrowing matters more than the confirmation:** the page governs the **Paused** branch
  only and is silent on billing suspension and deletion, so the guarantee does not cover all
  three branches — and paused-vs-suspended-vs-deleted is still unanswerable unattended. No
  action or priority changed.
  *Lesson for the next session: a predecessor's recorded "I tried and it's gated" is worth one
  cheap re-test before you inherit it as fact — this one cost a single `curl` and retired the
  last open item in §5.*

## 6. Open follow-ups (after recovery, not during)

- **TD-28** — false-green cron heartbeats: `internal.ts:67,103,110,251,280,296-298,344,361`
  destructure `const { data } = …` without checking `error`, so a failed run reports success
  at the HTTP-status layer. Level B PR, deliberately **not** shipped mid-outage (unverifiable
  against a dead DB, and it perturbs the signals being watched for recovery).
  **Observed in production, not just read out of the code** — every runtime-log window since
  the 02:12Z session shows `publish-scheduled` and `finalize-videos` returning **200**
  against a database with no DNS record while `rollup-hashtag-trends`, which *does* check
  `error` (`:355-360`), returns **500** in the same window; re-confirmed `2026-09-23T07:43Z`
  (session 34). **This is settled — do not log the 200-vs-500 contrast as a new finding.**
- **TD-29 (NEW, session 13)** — `finalize-videos` silently abandons work after a >6h
  outage: `internal.ts:61-74` floors the sweep at `created_at >= now-6h`, and nothing else
  re-drives a stuck asset (Stream webhooks skipped `:54`; client poll caps ~10 min). Any
  outage longer than 6h permanently orphans whatever was mid-transcode. Needs a one-off
  backfill (§4 step 5) **and** a resilience fix so duration alone cannot strand user content.
  Level B, but deliberately not shipped mid-outage — unverifiable against a dead DB.
- **TD-34 (NEW, session 18)** — the same cron's *abandon* UPDATEs have **no lower
  `created_at` bound**, so the first tick after restore mass-flips the stranded cohort to
  terminal `error`, which `videoFinalize.ts:213` then refuses to re-poll. This makes TD-29's
  own remedy a no-op and its counting query return `0`. **Fully written up as §4 step 0 —
  it is the one finding in this incident with a pre-Resume action.** The code fix (floor the
  abandon windows, or exempt a known outage interval) is Level B and also not shipped
  mid-outage, for the same unverifiability reason.
- **TD-35 (NEW, session 23)** — **the Apple/RevenueCat refund webhook has a 155-minute total
  retry budget, so a >2h35m outage permanently drops refund revocations.** Our handler is
  correct (it 500s so RevenueCat redelivers); the external budget is simply smaller than the
  outage, and no cron or other code path reconciles refunds. Per dropped event a refunded buyer
  keeps access forever and a creator is paid for a reversed sale. **Fully written up as §2 "The
  Apple clock" + §4 step 6 — it is the second finding in this incident with a manual owner
  action, and the only deadline that has already passed.** Resilience fix (Level C, payments
  path): persist inbound RevenueCat events to a durable queue and drain them with a reconciling
  job, so revocation survives an outage longer than the provider's retry budget — the same
  at-least-once discipline the Stripe path gets for free from a 3-day window. Not shipped
  mid-outage, same reason as TD-28/29/30/31/33/34.
- **Systemic (recommend, Level C):** a live App Store app runs its production database on a
  **pausable** tier with **no managed backups** (free tier self-serves `db dump`). Pro
  projects cannot be paused. *"Upgrade to Pro" is the real control here* — it removes both
  the pause risk and the Fair Use restriction mechanism in one step.
- **TD-21** — restore a DB path for the agent (PAT rotation; the connector grant alone is
  insufficient because the PAT behind it is revoked).
- **Alerting gap — promoted to §7. It is not a footnote; it is why this is still open.**

---

## 7. Why a 2-minute fix has gone 15+ hours — there is no working alert path to you

Session 12 audited every automated channel from production to you. **All of the push
channels are dead or muted.** This is the finding that actually explains the elapsed time,
and eleven prior sessions each recorded a piece of it without putting it together.

| Channel | Verified state (session 12) |
|---|---|
| `PushNotification` (Remote Control) | **Dead — 18 days.** Re-tested this session: *"Mobile push not sent (Remote Control inactive)."* It died **before** the outage, so sessions 1–12 have paged **nobody**, ever. |
| GitHub Actions `Uptime` failure email | **The only channel ever proven to reach you — and it is muted.** `disabled_manually` since ~18:27Z, ~4 min after the first failing run. |
| GitHub Issue | **Not usable.** `gh repo view` → `visibility: PUBLIC`. Filing one would publicly advertise a live outage *and* an open financial-webhook window on a production money system. Ruled out on purpose — don't re-propose it. |
| Gmail / Supabase MCP connectors | Permission-gated unattended (connector-level; even `search_docs` is denied). |
| **`telegram` plugin** (session 21) | **Unknown — worth 5 attended minutes.** A `telegram` plugin *is* installed (skills `telegram:access` / `telegram:configure`), which no session 1–20 had noticed. Both skills **fail to load** unattended, and the sandbox blocks reading their config, so this session could not tell unconfigured from broken. If it can be made to work it is the push channel this table otherwise says does not exist — and unlike `uptime.yml` it cannot be silenced by one click, and unlike `PushNotification` it does not depend on Remote Control. **Re-tested session 25: both skills still fail to load and the plugin directory read is still sandbox-blocked — reproduced, not resolved. Treat this as "needs 5 attended minutes", not as an open investigation; no further unattended session should spend time on it.** |
| `LOG.md` + this page | The only channels carrying anything — but **pull, not push.** They require you to come and look. |

**The reframe that matters.** Sessions 6–11 read the 4-minute mute as *"proof of awareness —
so this is an action gap, not an awareness gap."* With the push channel now confirmed dead
*since before the outage*, the sharper reading is: **muting `Uptime` removed the last working
push path.** Since 18:27Z on 09-21 there has been **no automated signal of any kind** from
production to you — only files you would have to open unprompted. You were told once, in
minute 4, and never again.

**Calibration, stated honestly rather than alarmingly.** The elapsed 15h34m splits roughly
into **~11.5h of waking hours** (11:27 AM → ~11 PM PDT Mon) and **~4h overnight**. The waking
gap is real and is what this section is about. But the escalating *"still zero owner action"*
refrain in eleven LOG entries is miscalibrated for the current moment: the last stretch is
overnight, the next realistic action window is Tuesday morning PDT, and the money deadline
still has **56h** of slack. Urgent, with room.

**Correction, session 28 (2026-09-23 01:26Z) — that calibration has expired; read the paragraph
above as a session-12 artifact, not as current guidance.** Its two load-bearing claims are now
falsified by the clock: the "next realistic action window" it pointed at (**Tuesday morning
PDT**) has come *and gone* — it is now Tuesday **evening** (18:26 PDT 09-22) — and the money
slack it quoted as **56h** is down to **~40h57m** on the Stripe side. More importantly the
paragraph predates session 23, which found a **second** money clock that does not behave like
Stripe's: the Apple/RevenueCat retry budget **expired `2026-09-21T20:58Z`, 28h28m ago**, and
restore will not replay it (§2, §4 step 6). So the honest current framing is **not** "urgent,
with room" — one deadline has already been missed and is accruing manual cleanup, while the
other is inside two days. The *tone* correction session 12 made was right for session 12; do not
carry it forward as a reason to treat hour 31 as relaxed.

**Sweep, session 30 (2026-09-23 03:30Z) — session 28 fixed one instance of doc rot; this
hour the whole page was swept for the class.** Every relative time expression in the sheet
(`ago`, `today`, `now`, `currently`, `this hour`) was checked against the clock. Two were
still decaying and have been converted to absolute timestamps, changing no finding: §2’s
heading *"The Apple clock … it expired **~24h ago**"* was written at hour 27 and was
**30h32m** by this hour — it now names `2026-09-21T20:58Z`; and §2’s rolling-boundary
sentence said *"through ~`18:50Z` **today**"*, which a reader on 09-23 resolves to the wrong
day — it now says `09-22`. The other four are safe and were deliberately left: the "this
hour" in §2’s source-audit note and the "28h28m ago" in the paragraph above sit inside
*dated* blocks, so they read correctly as historical statements, and §4’s "currently
`disabled_manually`" / "`ready` on Cloudflare right now" describe **states**, not elapsed
time. **Standing convention for every future session: in this sheet write absolute
timestamps, not elapsed offsets — except the two live counters at the top of the page (the
status line and the Stripe banner), which are re-stamped each session by design.**

### The one follow-up that makes the next SEV-1 different

```sh
gh workflow enable uptime.yml     # re-arms the only channel that has ever reached you
```

Do this **after** the restore (while the DB is down it would just re-fire into a muted void,
and re-enabling it now would override a deliberate human mute — `.github/workflows/**` is
minimum Level C, so no unattended session will do it for you). Then reconnect Remote Control
so `PushNotification` works again. **A monitor whose only delivery path can be switched off
by one click, with no fallback, is a single point of failure in the alerting layer** — worth a
`SYSTEM_RISK_MAP` row alongside the pausable-free-tier finding in §6.
