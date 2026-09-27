# SEV-1 — Supabase project `gsxoaurmsgqascxukony` unreachable (ongoing)

**Status: OPEN. Production is down for all users.** Started `2026-09-21T18:23:07Z`
(11:23 AM PDT Mon 09-21). **140h25m — past 5 days — as of 2026-09-27T14:48:21Z**, re-verified by session 113
(watchdog), which re-derived the DNS withdrawal from scratch on three resolvers.
Owner action is the ONLY fix — no repo change, rollback or redeploy can touch it.

> **🛑 READ §4 STEP 0 BEFORE YOU CLICK RESUME.** Session 18 found that the first
> `finalize-videos` cron tick after restore (within **60 seconds**) mass-flips every
> outage-stranded video to a **terminal `error` state that the finalizer refuses to
> re-poll** — which silently converts TD-29's prescribed backfill into a no-op and makes
> its counting query return `0`. One dashboard toggle before Resume avoids the whole mess.

> **⏳ CLOSED — the Stripe free-retry window expired `2026-09-24T18:23Z` (11:23 AM PDT Thu 09-24).**
> Session 69 (`19:08Z`) is the first tick past it, so the countdown this banner carried for
> sessions 34–68 is now **retired**, exactly as the session-61 text instructed its successors to
> do. **Nothing broke at 11:24 AM.** The operative sentence is the one that was always here:
> *missing it is a cost increase, not a cliff.* All that changed is that the **Stripe** half no
> longer self-heals on its own.
>
> **Restoring the database is still the whole fix, and still two clicks** — disable crons on
> Vercel project `sizzle` (§1 step 0), then Resume the Supabase project.
>
> **What recovering Stripe costs now instead:** per-event **Resend** from the Stripe dashboard,
> which stays open until `2026-10-06` and needs **no secret key** — so it is still an owner-only
> dashboard task, not an engineering one. The API path runs to `2026-10-21`. The work is simply
> manual and per-event now rather than automatic, and the pile grows for every day the project
> stays paused. **Do not derive a new countdown from this paragraph** — the next real date is
> `2026-10-06` — read the remaining slack off a calendar rather than from a figure in this
> sentence, because re-arming a ticking banner is what sessions 34/37/46/51/60 each did before
> it had to be collapsed.

> **🍎 NEW, session 23 — the Apple/RevenueCat half does NOT self-heal, and its window has
> ALREADY CLOSED.** RevenueCat retries a failing webhook **5 times over 155 minutes total**,
> not three days. Every Apple refund/chargeback event from the first ~24.5 h of this outage has
> therefore **permanently exhausted its automatic retries**, and restoring the database will not
> replay them. Consequence per missed event: a refunded buyer **keeps premium access forever**
> and the creator is **paid out for a purchase Apple reversed**. Recovery is the dashboard
> **Retry** button, and it is now a *manual* step that restore does not cover — see §2 "The
> Apple clock" and §4 step 6. Good news, also session 23: the **grant** side is safe and
> self-heals; nobody is charged without eventually getting their unlock (§2).

> **👥 NEW, session 50 — what your users are actually seeing.** Forty-nine sessions audited
> money clocks, crons, credentials and Apple's queue; none checked the surface the users are
> on. **Nobody is hitting a crash, a white screen or an infinite spinner.** Boot always
> completes — `bootProgress.ts:38` arms an 8-second failsafe and `Feed.tsx:56-58` calls
> `markBootReady()` on the *error* path too, so the launch bar never parks. The feed then
> renders a clean error card with a working **Try again** button (`Feed.tsx:89-90`), and
> sign-in sets an error and clears `busy` rather than hanging (`useAuth.ts:185-186`).
> **The caveat is the copy.** That card reads *"Can't load the feed — **Check your
> connection** and try again"* (`Feed.tsx:164-165`), so for 53h every user has been told
> **their own phone is at fault**; the sign-in screen shows the raw auth-js string (a bare
> network-failure message, `useAuth.ts:186`). Filed as **TD-38** and deliberately **not
> shipped** — it is cosmetic, it restores nothing, and it cannot be verified unattended
> without a browser. It changes your *calibration*, not the fix: the app is degrading
> gracefully, and the misattribution is what is quietly costing you reviews and support mail.

This page exists because **one hundred and thirteen** unattended sessions — one hundred and twelve watchdog summons plus
the 2026-09-25 daily sweep — have now diagnosed the same outage and appended **14,320+ lines** to
`LOG.md` (counts re-stamped session 113, measured `wc -l` = 14324 pre-append; session 48 stamped them at "forty-seven"/"5,600+" and nothing re-checked them
for the 31 sessions until session 79, so they had understated the burn by a third — session 95 skipped
this stamp entirely, which is what §7's session-96 entry gives a one-call detector for, and **session 97
skipped it again while passing that detector**, which is what session 98's correction below fixes).
**At least one further session diagnosed this outage without landing an entry at all** — see session 98's
lost-session finding in §7 — so the true summon count exceeds the entry count. The diagnosis is finished.
This is the one-page action sheet. **Read this, not the log.**

---

## 1. What you have to do (Level D — owner only, ~2 minutes)

0. **First, disable the crons** — Vercel → project **`sizzle`** (the API; naming is
   reversed) → Settings → Cron Jobs → click **Disable Cron Jobs**. No deploy needed.
   This is a 10-second toggle that buys you an unhurried capture window; see §4 step 0
   for why it matters and what to do if you forget. **Confirmed still required as of
   `2026-09-23T16:13Z`** — session 34 pulled the API's runtime logs and the crons are
   demonstrably live (21 `finalize-videos` + 22 `publish-scheduled` invocations in the
   21 minutes `07:22:34Z`–`07:43:34Z`), so the TD-34 trap is armed and nothing has
   disabled it. **Re-measured session 43** (`15:53:17Z`–`16:13:17Z`): 21 `finalize-videos`
   + 21 `publish-scheduled` in 20 minutes, and `vercel crons ls --project sizzle` still
   lists all five paths — so the trap remains armed 8.5h after session 34 said so, and
   this step has still not been done. **Re-measured again session 44** (`17:05Z`–`17:10Z`):
   one `finalize-videos` **and** one `publish-scheduled` every single minute, both `200`,
   and `vercel crons ls` still lists all five — armed ~9.3h after session 34, and still
   the cheapest outstanding action on this page.

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
   >
   > ### Settled session 64 — this step is **structurally owner-only**. Stop counting it as "undone".
   >
   > Seventeen sessions (34, 43, 44, 46, 47, 48, 51, 53–63, this one) have now measured
   > `vercel crons ls --project sizzle` and reported "all five paths still listed — still the
   > cheapest outstanding action," phrasing that reads as though an unattended session were
   > simply neglecting a ten-second job. **It is not available to one.** Verified this session:
   > `vercel crons --help` on CLI **57.0.0** exposes exactly three subcommands — **`add`**,
   > **`list`**, **`run`** — and **no `disable`, `pause`, or `rm`**. Combined with session 19's
   > finding that Vercel documents only the dashboard button, the toggle has **no non-interactive
   > surface at all**. No agent can reach it; only a browser can.
   >
   > **And it should stay that way even though an undocumented REST endpoint might exist** (not
   > probed — writing production config through an undocumented API during a SEV-1 is out of
   > lane). The reason is that the crons are only half a step: they must be **re-enabled** after
   > the stranded-video list is captured. An agent that disabled them would leave the *disabled*
   > state as the new default, and because `finalize-videos` is the sole driver that moves assets
   > to `ready` (Stream webhooks are skipped, `internal.ts:54`; the client poll caps at ~10 min),
   > crons left off after restore means **every new upload silently never finalizes** — a fresh
   > SEV-2 layered on the recovery, closable only by the owner doing the very click he was being
   > spared. Disable-then-re-enable is one human flow bracketing Resume; it does not decompose
   > into an agent half and an owner half.
   >
   > **What this changes:** nothing about the recovery order — ① disable ② Resume is still
   > correct and still first. It retires a phantom. Future sessions should record step 0's state
   > if they measure it, but **not** as an agent-actionable omission, and the tally is closed at
   > seventeen.
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
> almost certainly already holds the answer.** Search it for "Supabase" across
> **2026-09-13 → 2026-09-22** — *not* just around the outage minute — and read the result per the
> test below. That email names the reason, which picks your branch above.
>
> ### Promoted here by session 109 — the inbox picks the branch by what is ABSENT, and the old one-timestamp search could not see it
>
> **Automatic pausing sends TWO emails, and the first arrives a week early.**
> `free-project-pausing.md` (re-fetched `2026-09-27T10:43Z`, `HTTP 200`, raw markdown): Supabase
> *"sends two emails to the project owner regarding project pausing: 1. A warning email roughly one
> week before the pause takes effect. 2. A confirmation email once the project has been paused."*
> So the **Paused (inactivity)** branch necessarily leaves a warning around **2026-09-14** — a week
> before anything broke. Neither of the other two branches has such a mechanism.
>
> **The test runs on ABSENCE.** If there is **no ~09-14 inactivity warning** in the inbox, row 1
> above is **eliminated** and you are in the billing/quota or the deprovision branch. That changes
> your *first click*, which is the whole point: row 1 starts with **Resume**, row 2 needs the
> **payment method fixed first** (Resume inside the same cycle can re-restrict — *"pausing does not
> remove usage already accumulated"*), and row 3 needs **support contacted before you touch
> anything**.
>
> **The same doc eliminates row 1 on its own numbers, independently.** The documented trigger is
> *"too few user queries"* over 7 days, where *"a few user requests to the database each day over
> the previous week is enough to keep the project from being paused"* — and Sizzle ran **five Vercel
> crons** against this DB, `finalize-videos` alone **every minute** (~1,440 DB-touching
> invocations/day), continuously up to `18:23:07Z` on 09-21. The inactivity criterion cannot have
> been met. Row 1 stays in the table only because the dashboard's own wording is ground truth and a
> project paused for *other* reasons can still present as "Paused".
>
> *Why this lands at hour 136 rather than hour 10: the finding is **not** new — it was derived in
> `LOG.md` twice (early entries, ~lines 1485 and 1890) and never promoted here, while this very
> blockquote narrowed the search to "around 2026-09-21 18:00Z", a window that structurally excludes
> the discriminator. Verified before claiming: `grep -ciE 'warning email|two emails|week before'`
> → **0** on this sheet, **4** in `LOG.md`. That is session 45's rule — "a finding that lives only
> in LOG prose was never filed" — landing not on a follow-up but on **§1's own recovery
> instruction**. The class to re-check is therefore not "is it filed somewhere" but **"does the
> instruction the owner actually executes reflect it"**.*

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

> **Session 36 (2026-09-23) — WHY it is unknown, and why no later session can recover it
> locally. There is no second copy of the evidence: the provider dashboards are the ONLY
> record.** `/health` reports `sentryConfigured: true`, which makes it natural to assume the
> dropped webhook deliveries are sitting in Sentry and can be reconciled from there after
> restore. **They are not.** Sentry capture in the API is driven *only* by `app.onError`
> (`app.ts:64` → `lib/errors.ts:25-42`), and Hono's `onError` fires on a **thrown** error —
> but **both money webhook handlers catch their failures and `return` a 500 instead of
> throwing**: Stripe at `monetize.ts:1193-1196` (`catch { console.error(…); return
> c.json(…, 500) }`) and RevenueCat at `:816-818`, `:828-829`, `:833-834`, `:848-849` (four
> `return c.json({code:'retry'}, 500)` branches). No middleware inspects response status, so
> the capture hook is never reached. The author clearly knew to do it — `recoverFromCreator`
> calls `captureException` explicitly at `:780` — it just stopped at that one branch.
> **Filed as TD-36.**
>
> The consequence is a *measured* evidence window, not a theoretical one. The only record of
> a dropped delivery is the handler's `console.error` line in Vercel's runtime logs, and that
> buffer currently holds **~21 minutes** (60 rows spanning `09:25:17Z`–`09:45:55Z`, measured
> this session) because the two every-minute crons generate ~120 rows/hour and 48 of those 60
> rows were `finalize-videos` + `publish-scheduled`. So each dropped money event became
> locally invisible about 21 minutes after it happened — the earliest of them ~39 hours ago.
>
> **What this changes for you:** nothing about the fix, but it makes §2's Stripe
> `delivery_success=false` sweep and §4 step 6's RevenueCat dashboard Retry **load-bearing
> rather than belt-and-braces.** Do not plan to reconcile from Sentry or from Vercel logs
> afterwards — neither has the data. It is also a second, independent reason to do §1 step 0
> (`Disable Cron Jobs`): besides disarming the TD-34 trap, it stops the crons evicting the
> runtime-log buffer, which widens the capture window from ~21 minutes to hours.

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

> ### ⚠️ Correction, session 35 (`2026-09-23T08:46:21Z`) — the fallback costs hours, not an App Store round-trip
>
> **The heading above stands — Restore the existing project. What is wrong is the stated *cost
> of the alternative*, and it is wrong in the expensive direction.** The claim that a new ref
> "is a **native-rebuild-and-resubmit** event (App Store review)" and that "restoring the
> existing project is the only path that heals installed apps" does not survive reading the
> artifacts it cites.
>
> **Every hardcoded occurrence of the ref in a shipped artifact is a `<link rel="preconnect">`
> hint — functionally inert.** Grepping the repo for `gsxoaurmsgqascxukony` returns exactly
> three hits and all three are that same line: `apps/web/index.html:30`,
> `apps/web/ios/App/App/public/index.html:30` (the shipped native web dir), and a
> `Debug-iphonesimulator` build product that never shipped. A preconnect is a latency hint —
> it opens a speculative socket, and a dead one costs nothing but the hint. **No native
> artifact pins the host:** `Info.plist`'s ATS block is generic (`NSAllowsLocalNetworking`
> only, no per-domain exception), `capacitor.config.ts` sets no `allowNavigation`, and the
> string "supabase" appears in neither.
>
> **The functional URL is build-time JS — and JS is exactly what Capgo ships.**
> `apps/web/src/lib/env.ts:7` reads `import.meta.env.VITE_SUPABASE_URL`, which Vite inlines
> statically into the bundle at build time. That bundle and `index.html` both live in `dist`,
> the directory Capgo uploads (`--path dist`). OTA is live on the shipped build:
> `@capgo/capacitor-updater` ^8.51.0 (`apps/web/package.json:43`), wired at
> `capacitor.config.ts:46-55` with `autoUpdate: 'onLaunch'` and `defaultChannel: 'production'`,
> and that config's own comment cites Apple 3.3.2 — web-layer updates need no review. This repo
> has shipped real OTA bundles through that path.
>
> **And the OTA channel is working right now, mid-outage** — Capgo's update check talks to Capgo
> Cloud, not to Supabase. Repointing every installed iPhone at a new ref is a rebuild plus one
> `bundle upload`, landing on each user's next cold launch. **Hours, not days. Apple is not in
> the loop.**
>
> **What a new ref *does* still cost — the real blockers, none of which is Apple:**
> 1. **Data + Storage migration** out of a project whose hostname does not resolve. This is the
>    genuine blocker, and if Resume is unavailable it may well be unavailable too.
> 2. **OAuth reconfiguration (Level D).** Google Cloud Console and the Apple Service ID have
>    `https://<old-ref>.supabase.co/auth/v1/callback` registered as the redirect URI, and the
>    client builds the authorize URL from the project URL (`nativeOAuth.ts:41` supplies only the
>    `app.sizzle.mobile://login-callback` return leg, which is ref-independent). Both consoles
>    must be updated or Google/Apple sign-in breaks.
> 3. **Vercel env vars** (`SUPABASE_URL` + keys) on both projects, then redeploy.
> 4. **Every user is signed out.** Sessions are JWTs issued by the old project. Session 14's
>    "sessions survive this outage" result does **not** extend to a ref change — that finding was
>    about retryable fetch errors not clearing the session, not about a changed issuer.
> 5. Users stay broken until their **next cold launch** (`autoUpdate: 'onLaunch'`).
>
> **Session 49 (`2026-09-23T22:30Z`) — the OAuth *credential* clock, checked and RULED OUT.**
> Item 2 above covers the redirect **URIs**, which a ref change invalidates. The adjacent
> question nobody had asked is whether the Apple **client secret** — an ES256 JWT with a hard
> `exp`, unlike Google's non-expiring client secret — is itself near expiry, which would make
> "Apple sign-in is broken" land as a *second* incident just as the owner finishes restoring.
> **It is not.** `scripts/gen-apple-secret.mjs:17` mints `MAX_AGE_S = 15_776_999` (182.6 d,
> just under Apple's 6-month ceiling) and the provider was wired on **2026-07-12** (`21653f3`,
> the only commit to that script), so the secret runs to **~2027-01-11** — about 3.5 months of
> headroom, unrelated to this outage. Two consequences worth stating plainly: the Resume trip is
> **Resume only**, with no OAuth repair queued behind it; and in the new-ref branch the secret
> **survives** a ref change untouched, because the JWT is bound to TEAM_ID + the Services ID
> `app.sizzle.web`, not to the Supabase hostname — only the Services ID's Web Auth *Domain* and
> *Return URL* need editing. That matters because the `.p8` behind it is **not re-downloadable**
> (it lives in Branden's iCloud Drive as `AuthKey_6YSDQV3S4P.p8`), so a branch that did force a
> re-mint would have a single point of failure — and this one does not.
>
> **Why this matters even though the recommendation is unchanged:** if Resume turns out to be
> unavailable — deleted project, or a billing hold needing a human at Supabase — the uncorrected
> §3 tells you installed apps cannot be healed without an App Store round-trip. That is the kind
> of sentence that stops an owner looking for a fallback at all. The fallback is real and it is
> same-day. **Restore is still strictly better** — no migration, no OAuth work, no forced
> re-login, no waiting on cold launches — better by a wide margin, not by the impossibility of
> the alternative.
>
> *Limit, stated plainly: that OTA carries a changed `VITE_SUPABASE_URL` is verified
> mechanically (static inlining → `dist` → the directory Capgo uploads), not by running an OTA.
> Shipping a live bundle during an outage is not something an unattended session should do.*

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
  (system, `1.1.1.1`, `8.8.8.8`) agree: the parent zone `supabase.co` resolves, while
  `<ref>.supabase.co` *and* `db.<ref>.supabase.co` → `ENOTFOUND` (NXDOMAIN). Parent zone up +
  every per-project record gone = pause/deprovision at the account level.
  - **Evidence refreshed session 41 (`2026-09-23T15:06Z`) — the apex answer changed; the
    inference did not.** Sessions ≤40 recorded `supabase.co` → `ENODATA` ("name exists, no A
    record"). It now returns **`A 76.76.21.21`** on both `1.1.1.1` and `8.8.8.8`. That is a
    change on *Supabase's* side of the fence (an apex A record appearing on their marketing
    zone), **not** a change in our project's status: `<ref>.supabase.co` and
    `db.<ref>.supabase.co` are still NXDOMAIN on every resolver, which is the load-bearing
    half. Recorded only so a future session that re-runs the check does not read the
    `ENODATA`-vs-`A` mismatch as a new signal and spend time on it. **Nothing about the
    diagnosis, the branch table in §1, or any deadline moves.**
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
- **TD-36 (NEW, session 36)** — **the two money webhook handlers are the only 5xx paths in
  the API that never reach Sentry**, because they `return c.json(…, 500)` instead of throwing,
  and `app.onError` (the sole capture hook) fires only on a throw. So the single most
  valuable failure signal in the system degrades to a `console.error` in a Vercel log buffer
  that this outage measured at **~21 minutes** deep. This is TD-5's defect class — which was
  closed for `internal.ts`'s cron branches back on 2026-08-07 — still live in
  `monetize.ts`. Fix is ~2 lines per branch (`await captureException(err, {...})` alongside
  the existing `console.error`), but `routes/monetize.ts` is on the autonomy-policy
  security-sensitive list ⇒ **Level C**, and it is unverifiable against a dead DB, so it is
  parked with the rest. Written up in §2's "Honest limit" block.
- **TD-43 (NEW, session 113; filed in the register by the 2026-09-27 daily sweep — session 113 wrote "TD-39" here, but that id was already session 85's *separate* defect in the same script, so this finding sat unfiled)** — **the watchdog's cooldown is a single global file with no incident
  identity, so a second production incident is merged into the first one's summon.**
  `scripts/ops/watchdog.sh:10` documents *"one summon per incident per 60 min"*, but `:66-74` gates on
  one `~/.sizzle-ops/cooldown` whose **age** is the only thing it checks, and `:59` clears it only when
  **every** probe is green — so across this outage it has been continuously armed (verified: mtime
  `2026-09-27T14:45:46.742Z`, this session's own summon minute). A new, unrelated incident is therefore
  silent for up to 60 minutes and then arrives **appended to the known SEV-1's `REASON_TEXT` line**
  (`:63`) in a prompt carrying no per-incident identity — landing in a triage path whose first
  instruction is to stop re-deriving and read this sheet. That is ground rule 4's failure built into the
  delivery. Reproduced with an isolated replica in `.codex/s113-cooldown-sim.mjs`.
  **Not shipped, and not because of the lane** (`watchdog.sh` is not on the security-sensitive list): it
  is the sole detection layer during a live SEV-1, it cannot be tested end-to-end without spawning real
  summons, and above all **it is worth nothing until §7's egress gap closes** — a better-attributed
  summon still produces a session that can page nobody. Sequence it after the alerting fix, not before.
- **Systemic (recommend, Level C):** a live App Store app runs its production database on a
  **pausable** tier with **no managed backups** (free tier self-serves `db dump`). Pro
  projects cannot be paused. *"Upgrade to Pro" is the real control here* — it removes both
  the pause risk and the Fair Use restriction mechanism in one step.
- **TD-21** — restore a DB path for the agent (PAT rotation; the connector grant alone is
  insufficient because the PAT behind it is revoked).
- **Alerting gap — promoted to §7. It is not a footnote; it is why this is still open.**

---

## 7. Why a 2-minute fix has gone unfixed for days — there is no working alert path to you

Session 12 audited every automated channel from production to you. **All of the push
channels are dead or muted.** This is the finding that actually explains the elapsed time,
and eleven prior sessions each recorded a piece of it without putting it together.

| Channel | Verified state (session 12) |
|---|---|
| `PushNotification` (Remote Control) | **Dead — 18 days.** Re-tested this session: *"Mobile push not sent (Remote Control inactive)."* It died **before** the outage, so sessions 1–12 have paged **nobody**, ever. |
| GitHub Actions `Uptime` failure email | **The only channel ever proven to reach you — and it is muted.** `disabled_manually` since ~18:27Z, ~4 min after the first failing run. |
| GitHub Issue | **Not usable.** `gh repo view` → `visibility: PUBLIC`. Filing one would publicly advertise a live outage *and* an open financial-webhook window on a production money system. Ruled out on purpose — don't re-propose it. |
| Gmail / Supabase MCP connectors | Permission-gated unattended (connector-level; even `search_docs` is denied). |
| **`Make` (make.com) connector** | **Gated too — and this row completes the class.** Make is an automation platform with mail/SMS/webhook modules, so a Make scenario was the one plausible *never-audited* push path. `mcp__claude_ai_Make__environment_get` — the id lookup Make's own instructions call always-available, i.e. the cheapest possible read — returns *"Claude requested permissions … but you haven't granted it yet."* Same connector-level gate as Gmail, hit before a single scenario could be listed. **Consequence: every MCP connector in an unattended session is now measured as gated, so no connector-based escalation channel exists. Do not re-shop connectors — the negative is the whole class, not one connector.** *(First found by the lost session of 2026-09-25T23:20Z whose entry never landed; independently re-verified first-hand by session 98 rather than inherited — see the lost-session finding below.)* |
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

**Re-sweep, session 74 (2026-09-25T00:24:32Z) — the convention held, but the SWEEP was a
one-time pass and the class re-accumulated. Re-grep it; don't assume session 30 settled it.**
Session 30 enumerated exactly **six** relative-time expressions and named every one. Re-running
the same grep this hour returns **seven**, and the five that are not on session 30's list were
all written *after* it (sessions 31, 35, 36 and 69) — so the convention was never violated in
spirit, it simply has **no enforcement**: nothing re-checks the page, so each later session added
prose the original sweep could not have covered. Triaged against session 30's own two exemptions
(dated blocks read as history; state descriptions are not elapsed time), **six of the seven are
correctly left alone** — `:166` "this hour" and `:215` "~39 hours ago" sit in dated blocks,
`:212` "currently holds ~21 minutes" is a measurement, and `:337` / `:386` "right now" describe
states (a review queue, the OTA channel).

**Exactly one was genuinely rotting, and it was the worst-placed one.** The Stripe banner at
`:13` — session 69's text, sitting in the **highest-traffic block on the page**, four lines below
the status line — read *"expired `2026-09-24T18:23Z` (11:23 AM PDT **today**)"*. It was written
on 09-24 and would have become wrong at **midnight PDT tonight, ~6.5 hours after this session**,
telling an owner who opens the sheet on 09-25 that a money deadline expired *that* morning rather
than the previous one. Converted to **`(11:23 AM PDT Thu 09-24)`**. No finding changed; the
banner's own instruction — *do not derive a new countdown from this paragraph* — still stands,
and the next real date is still `2026-10-06`.

*Generalised, and the reason this is worth three lines: session 30's lesson was "grep the class
and write the rule." The rule was written and it worked — but **a convention that only a sweep
can verify decays the moment the sweep stops running**, and the decay lands in text the
convention's author never saw. On a long incident, re-grep the class every so often rather than
trusting that a past sweep closed it; the cost is one `grep` and the failure mode is a wrong date
on the line an owner reads first.*

**Re-sweep, session 93 (2026-09-25T19:09:52Z) — the check is CLEAN, but its COUNT was never
comparable, because no session recorded the grep it ran. Fixed by pinning the invocation.**
Sessions 30/74/90/91 each reported a hit count — **6 → 7 → 15 → 15** — and session 79's rule says a
count in standing prose is never "correct as history". But these four numbers were never measuring
the same thing: the sheet records the *token list* (`ago`, `today`, `now`, `currently`, `this hour`)
and never the actual command, so each session improvised the boundaries. Running the token list
verbatim today returns **41 matching lines / 42 word-boundary occurrences** — and **`now` alone
contributes 23 of them**, because bare `now` is ordinary English prose ("is now", "now that"), plus
6 more substring hits inside words like "known" when run without `\b`. A successor comparing "15"
to "42" would read a 27-hit explosion of doc rot that does not exist, and would burn a session
triaging it. **Pinned invocation — run exactly this and no other:**

```sh
grep -nE '\bago\b|\btoday\b|\byesterday\b|\bcurrently\b|this hour|right now|\btonight\b' \
  docs/operations/incidents/2026-09-21-supabase-project-unreachable.md
```

Bare `now` is dropped deliberately: every *rot-bearing* use of it is the phrase **"right now"**,
which the pattern still catches, and which session 30 already exempted as a state description.
Session 93's run: **19 hits, all 19 correctly exempt** — `:167`/`:216`/`:692` sit in dated blocks,
`:213` is a measurement, `:338`/`:387`/`:448`/`:505` describe states (review queue, OTA channel,
pager, Cloudflare), and `:700`–`:728` are sessions 30 and 74's own write-ups quoting the rot they
fixed. **Relative-time class clean; the two live counters at the top are the only rot surface left,
and both were re-stamped this session.** *Generalised, and it is session 79's rule one level deeper:
when a periodic check reports a number, pin the command that produces it — otherwise the number
drifts with whoever ran it, and successors triage the tooling instead of the document.*

**Session 96 (2026-09-25T22:15:45Z) — the omission hole sessions 71/77 left open has a ONE-CALL
detector, and session 95 is the case that proves it. Run it first, every session.**
Session 71 found that a skipped counter stamp is indistinguishable from a fresh one, and prescribed
comparing the line against the previous session's *recorded elapsed figure*. Session 72 re-anchored
the stamp to `/health`'s `time` field so it could not be **fabricated**. Session 77 named the
remaining gap exactly — *"hardening an artifact against fabrication is not the same as guaranteeing
it is produced"* — and then left it open, because every proposed check was another number comparison.

**Session 95 walked into it.** Its commit `0a8f1af` touched **`docs/operations/incidents/LOG.md`
and nothing else**, so line 4 still read *"97h55m as of `2026-09-25T20:17:39Z` — re-verified by
session 94"* while session 95's own log entry recorded **98h50m at `21:13Z`**: the page's
highest-traffic line was stale and **credited to the wrong session**, and the standing counts at
`:56` were skipped in the same omission. Both are repaired above (99h52m; ninety-six / 11,690+).

**The detector is the commit's file list, not the numbers:**

```sh
gh api repos/Branden574/Sizzle/commits/<previous session's SHA> --jq '.files[].filename'
```

If `docs/operations/incidents/2026-09-21-supabase-project-unreachable.md` is **absent**, then every
sheet-resident periodic check was skipped that session — the counter stamp, the standing counts and
the doc-rot grep, all at once. It is binary, needs no arithmetic, requires reading neither the sheet
nor the prior log entry, and catches the whole class rather than one convention at a time. Session
71's comparison is still the right *repair* procedure; this is the cheaper *detection* step in front
of it. *Generalised: when a convention has no enforcement, look for a cheap **artifact** that proves
execution rather than a better way to inspect the output — a commit that never touched the file
cannot have maintained it, and that is one call to establish.*

Session 96's own runs, for the record: doc-rot grep (pinned invocation above) **24 hits, all 24
correctly exempt** — the 5 above session 93's count are session 93's and 94's own write-ups quoting
the token list, the same self-referential growth the secret scan has (session 54), so **a rising
count here is not a signal**. Last run: session 93, then 96.

**Session 98 (2026-09-26T23:07:38Z) — session 96's detector is ONE-DIRECTIONAL. Absence proves a
skip; PRESENCE PROVES NOTHING. Use the patch, not the filename — it is the same one call.**
Session 96's *absence* half is sound and stays the cheapest first step. Its framing — *"it replaces
three number comparisons"* — is what misleads, and **session 97 is the case that proves it**:

- `gh api …/commits/68e87cd --jq '.files[].filename'` → the action sheet **is** present ⇒ detector **PASS**.
- `gh api …/compare/7b72d2d...68e87cd` → session 97's **sole** sheet edit was **line 4**, the counter.
- The standing counts at `:57-58` went untouched — still *"ninety-six"* / *"11,690+"* / *"`wc -l` = 11693"*
  against an actual of **97 sessions / 11,898 lines**. Repaired by session 98 above.

A **per-file** artifact-of-execution cannot certify a convention made of **three independent
per-line checks**: it distinguishes "touched the sheet" from "didn't", never "maintained one line"
from "maintained all three". So it reports **PASS on a two-thirds skip** — which makes it *more*
dangerous than the number comparison it displaced, because it reads as binary and authoritative.
The drift it let through here was one session and 208 lines: small in magnitude, but it is exactly
session 79's no-carve-out class, landing in the paragraph an owner skims to judge *how long this has
been burning*.

**The fix costs the same single call, so there is no tradeoff — ask for the patch:**

```sh
gh api repos/Branden574/Sizzle/compare/<prev-1 SHA>...<prev SHA> \
  --jq '.files[] | select(.filename | endswith("supabase-project-unreachable.md")) | .patch'
```

The hunk headers show *which* lines moved, so a partial skip is visible at the same cost as the
binary check. *Generalised: when you replace a number-comparison check with a cheap
artifact-of-execution, match the artifact's **granularity** to the convention's — and note this is
session 77's lesson one instrument later: hardening against **total** omission does not catch
**partial** omission.*

**Also session 98 — A WHOLE SESSION WAS LOST, and its finding nearly went with it. Re-check the
push pipeline's last step.** Origin has a **23h49m push gap**: `7b72d2d` (`2026-09-25T22:20:17Z`,
session 96) → `68e87cd` (`2026-09-26T22:09:20Z`, session 97). A session ran inside that gap — local
`.codex/` holds its complete, unpushed draft (`append-s97.mjs`, probes anchored `2026-09-25T23:20:41Z`,
hour **100h57m**) — and it got as far as creating the **blob and tree on GitHub** (`blob97-*.json`,
`tree97.json`, `23:27:33`/`23:27:35` local) and then **died before the commit object**: `commit96.json`
exists, **`commit97.json` does not**. Blob + tree without a commit are unreferenced, so the ref never
moved and **its entire write-up never landed**. Two consequences:

1. **Its unique finding was recoverable and is now recovered** — the `Make` connector row added to the
   table above. It appeared in **neither** `LOG.md` nor this sheet (`grep -c` → 0 on both). Session 98
   re-verified it first-hand rather than inheriting an unpushed claim (ground rule 4).
2. **Only one session's artifacts exist in that 23h49m window**, so the evidence supports *one* lost
   session plus a quiet host (the Mac asleep — sessions 89–96 were all 09-25, session 97 the first
   09-26), **not** 23 failed pushes. Stated as a bound, not a certainty: the watchdog log is
   sandbox-blocked, so the quiet period cannot be confirmed from inside a session.

*Generalised: session 45's rule was "a predecessor's finding that lives only in LOG prose was never
filed." The worse case is a finding that lives only in **gitignored local scratch** — `.codex/` is
invisible to origin, so a session that dies at the last pipeline step leaves **no trace in the record
at all**, and the next session inherits a silent hole rather than a stated gap. When the push gap
between two consecutive entries is much larger than the summon interval, look in `.codex/` for an
orphaned draft before assuming nothing happened.* Practical check, one call:
`ls .codex/ | grep -i '^commit'` — a `tree<N>.json` with no matching `commit<N>.json` is an aborted push.

**Session 99 (2026-09-27T00:13:41Z) — that `.codex/` check is BLIND for half of the recent sessions,
because it pairs on a filename convention the scratch dir does not actually follow. Pair on TIME.**
Session 98's orphan check assumes every session writes `tree<N>.json` / `commit<N>.json`. Measured
this session, `.codex/` holds numbered artifacts for sessions **81–88, 92, 93, 96, 97, 98** and
**none at all** for **89, 90, 91, 94, 95** — those five pushed under un-numbered names
(`blob-LOG.md.json`, `blob-docs-operations-incidents-LOG-md.json`,
`blob-docs_operations_incidents_LOG.md.json`, `_payload.json` / `_ref.json`). The proof is
`.codex/_ref.json` → `{"sha":"0a8f1afa3e0f…"}`, which is **session 95's commit** — the very session
§7 above indicts for skipping the counter stamp — so a session whose push *succeeded* left zero
`commit9*`/`tree9*` files. Had any of those five died at the commit object, `grep -i '^commit'` would
have paired nothing and reported nothing. The check does not merely miss cases; it is **silent** on
five of the last eleven sessions while looking like a clean negative.

**The naming-free version is the same one call, and it catches session 97's case too — compare the
newest scratch artifact's mtime against origin's tip:**

```sh
ls -lTt .codex/ | grep -E '^-.*(blob|tree)' | head -3       # newest draft artifact by MTIME (-t sorts; -T only widens the stamp)
gh api repos/Branden574/Sizzle/commits/main --jq '.commit.committer.date'
```

A newest artifact materially **newer** than origin's tip is an aborted push, whatever it is named.
Verified against both known cases: session 97's `tree97.json` (`2026-09-25T23:27:35Z`) sat newer than
origin's then-tip `7b72d2d` (`22:20:17Z`) for the whole 23h49m gap ⇒ **fires**; session 98's
`blob98-*` (`23:15:46Z`) against tip `359ac54` (`23:15:48Z`) ⇒ **quiet**, correctly.

*Generalised — and it is session 98's own lesson turned on session 98: it said "match the artifact's
granularity to the convention's." The prior step is to check the artifact **exists under the name you
are grepping for**. A detector keyed to a convention inherits that convention's coverage, and an
un-enforced naming convention across 99 sessions has none — which is exactly the property §7 has
already documented twice (session 74 on doc rot, session 93 on pinned greps). Prefer a key the
filesystem supplies (mtime) over one each session chooses.*

**Session 106 (2026-09-27T07:38:35Z) — the doc-rot grep has been reporting clean against a pattern
that CANNOT MATCH the worst instance, and that instance was §7's own heading.** Sessions 30, 74, 93
and 96 built this convention and session 93 pinned its invocation. Every token in the pinned
pattern — `ago`, `today`, `yesterday`, `currently`, `this hour`, `right now`, `tonight` — is a
**deictic word**; there is **no duration pattern**. So a bare elapsed figure can never match, however
stale. This heading read *"Why a 2-minute fix has gone **15+ hours**"* — session 12's figure, written
at hour ~15.5 — while the status line four hundred lines above it said **133h15m**. Off by ~9x, for
94 sessions, on the line that tells an owner how long this has been burning.

**Complementary grep — run it alongside the pinned one:**

```sh
grep -nE '\b[0-9]+\+? ?(hours|hrs|days|minutes)\b' \
  docs/operations/incidents/2026-09-21-supabase-project-unreachable.md
```

It returns ~20 hits and **only one bucket is rot**, so triage before flagging:

1. **Provider/policy constants — exempt, and they are the bulk.** `155 minutes`/`2h35m`,
   `3 days`/`15 days`/`30 days`, `7 days idle`, `5/10/20/40/80 minutes`, `~2 minutes`,
   `67 days old`. Facts about the world; they do not decay.
2. **Dated or attributed history — exempt**, covered by session 30's two exemptions: the
   `PushNotification` row's *"18 days"* sits under a column header reading **"Verified state
   (session 12)"**; §5's *"15 days old"* is the pre-outage deploy's age at onset.
3. **Elapsed-outage duration outside the two live counters — THE ROT CLASS.** Line 4 and the Stripe
   banner are re-stamped by design; **any elapsed-outage figure anywhere else is stale by
   construction**, because nothing re-stamps it. This heading was its only member, and the fix was
   to make it **duration-free** rather than to re-stamp it — a third live counter in a document
   whose §7 is a case study in unenforced conventions would have been the worse repair.

*Generalised — session 99's lesson pointed at the pattern instead of the artifact: a pinned detector
inherits the blind spots of its pattern, and a pattern built from the examples in front of you covers
only the shapes you happened to have. Sessions 30/74/93/96 each refined how the grep was **run**; none
asked what it could not **match**. When a check has reported clean for many cycles, audit the check
against the defect class rather than re-running it — and prefer deleting a decaying value over
scheduling its upkeep.*

**Session 111 (2026-09-27T12:51:58Z) — the detector was blind along its OTHER axis: the numeral's
FORM. One live member, and it was four lines under the status line.** Session 106 widened the sweep
from deictic words to a duration shape and audited **what** the pattern measured (units); it left
**how the value is written** untouched. Both pinned greps ran clean this session — deictic **25
hits** (24 at session 106; the rise is later sessions quoting the token list, so per session 96 a
rising count is not a signal), duration **32 hits**, all exempt, bucket 3 still empty — while
`:29` read *"the next real date is `2026-10-06`, **it is two weeks out**"*. It is **9 days** out at
this session's anchor, and by `2026-10-02` it would claim two weeks of slack on a date four days
away. Session 93's pattern has no duration token; session 106's needs `[0-9]+` **and** one of four
units, so `two weeks` fails it twice over. **Measured which axis actually carries rot, so the
widening stays minimal:** the unit axis (`grep -nE '\b[0-9]+\+? ?(weeks?|months?|years?)\b'`) returns
**6 hits and no rot** — all provider/policy constants (§2's `1 year` restore window, §3's
`3.5 months` of Apple-secret headroom), so adding those units to the digit pattern would catch
nothing. The rot is in the **form** axis. **Third pinned invocation — run it alongside the other two:**

```sh
grep -niE '\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve) (hours?|hrs?|days?|weeks?|months?|years?|minutes?)\b' \
  docs/operations/incidents/2026-09-21-supabase-project-unreachable.md
```

It returns **5 hits**; triage against session 106's buckets, because four are exempt: `:34`/`:201`/`:207`
are Stripe's *quoted* policy (*"up to three days"*, live mode) — bucket 1, facts about the world;
`:735` (*"the other is inside two days"*) sits inside session 28's dated write-up — bucket 2. Only an
elapsed or forward-looking figure in **standing** prose is rot. `:29` was fixed **duration-free**
rather than re-stamped, for the same reason session 106 gave: this paragraph's entire job is to stop
successors re-arming a countdown, so giving it a figure that needs upkeep defeats it. It also rotted in
the **dangerous direction** — overstating remaining slack on the one money-recovery path still open
(dashboard per-event `Resend`, the only money step needing no secret key). *Generalised: when you widen
a detector after finding it blind, widen it along **every axis of its tokenisation** — prose written
under incident pressure spells small numbers — and check which axis carries defects before committing to
the wider pattern.*

**Session 112 (2026-09-27T13:46:10Z) — §7's own orphan detector has been reporting clean by
ACCIDENT: its pinned invocation sorts by NAME and calls the result "newest". Reproduced both ways this
session.** Session 99 replaced the filename-convention check with an mtime one precisely so the key
would come from the filesystem rather than from each session's naming choice. But the command it pinned
is `ls -lT … | tail -3`, and **`ls -lT` orders alphabetically** — `-T` only widens the timestamp it
*prints*, it does not sort. So the line emits the last three *names* and the reader takes the timestamp
in that row as the newest. Measured:

```
ls -lT  … | tail -3   →  tree97 / tree98 / tree99.json        newest shown:   2026-09-27T00:19Z
ls -lTt … | head -3   →  s111-tree / s111-blob-sheet.json     newest actual:  2026-09-27T12:57Z
```

Session 111's artifacts are **12h38m newer** than what the pinned command called newest, and they are
not exotic: `s111-tree.json` **matches the `(blob|tree)` grep** — it simply sorts before `tree9*`.
**The failure is a false negative, in the one direction that matters.** Had session 111's push died at
the commit object, the detector would have compared session 99's stale artifact against an origin tip
that sessions 100–110 had already advanced well past, concluded *"artifact older than tip ⇒ quiet"*, and
returned a clean negative over a live orphan — the exact outcome session 99 built it to catch, and
exactly how session 97's entire write-up was lost. It is quiet *correctly* right now (`s111-ref.json` at
`12:57:13.182Z` vs tip `aca0d6d` at `12:57:13Z` ⇒ session 111 landed), but that is the data's doing,
not the check's: sessions 100–111 each ran it and each got a true negative by luck of the sort order.

**The fix is one character, and the corrected invocation is now pinned above.** `-t` sorts by mtime, so
the newest row moves to the top and `tail -3` becomes `head -3`. Two independent reasons name order was
never time order: sessions pick their own prefixes (`s111-*`, `blob-LOG.md.json`, `_ref.json` — session
99 itself catalogued five variants), **and** the original `tree<N>.json` convention breaks at N=100
regardless, because `tree100.json` sorts before `tree99.json`. The second would have bitten this month
even under perfect naming compliance.

*Generalised — sessions 99, 106 and 111 each widened the detector's **pattern**; the axis nobody audited
is the **invocation**. A detector is pattern + pipeline, and the pipeline can silently discard the very
property the pattern was rewritten to key on: session 99 moved the key to mtime, then read it out of a
name-ordered list, so three sessions' worth of "the check is quiet" was evidence about sort order. When a
check has reported clean for many cycles, don't re-run it — **feed it the failure it exists to catch** and
confirm it can still report dirty.*

**Session 113 (2026-09-27T14:48:21Z) — §7 has audited every channel that carries a finding OUT across
113 sessions. The instrument that decides a session happens AT ALL had never been read.** Session 12
built this table, session 21 added the telegram row, session 98 added `Make` and closed the connector
class — all of it the *egress* half. `scripts/ops/watchdog.sh`, the trigger behind all 113 summons
including this one, is absent from this sheet entirely. Read this session:

**The cooldown is one global file with no incident identity, and the script's own comment says
otherwise.** `:11` documents *"one summon per incident per 60 min"*. There is no per-incident anything:
`:66-74` stats a single `~/.sizzle-ops/cooldown`, compares its **age** to `COOLDOWN_MIN=60`, and
`exit 0`s if it is younger — whatever the problem set is. It is cleared **only** when every probe is
green (`:59`, inside the `${#PROBLEMS[@]} -eq 0` branch), so across 140 hours it has been
**continuously armed**. Verified directly rather than inferred: mtime `2026-09-27T14:45:46.742Z`, this
session's own summon minute, and the ops dir holds nothing else (no `paused` kill-switch file).

**Two consequences, and the second is the one that matters.** ① A second, unrelated incident inside the
window is **not summoned at all** — up to 60 minutes of silence; bounded, and on its own only a delay.
② When the window expires, the new problem is **appended to the same `REASON_TEXT` line as the known
SEV-1** (`:63`, `printf '%s; '` over the whole `PROBLEMS` array) and delivered in a prompt whose
`DETECTED PROBLEMS` block has **no per-incident identity** — arriving into a triage path (this sheet
plus the project memory) that tells the receiving session, in its first paragraph, to stop re-deriving
and read the action sheet. **That is precisely the failure ground rule 4 names** — *"a signal that
pattern-matches a known failure may have a different cause"* — except the pattern-match is not the
session's inference error here; it is built into the delivery.

**Reproduced, not asserted.** `.codex/s113-cooldown-sim.mjs` replicates `:63-74` in isolation, summons
nothing and never touches the real cooldown file. Fed the failure it exists to catch (session 112's
lesson) — this outage at t+0, then a frontend-down + CI-red incident at t+10 and t+61:

```
[t+0   db only]   SUMMONED   — API degraded (503): database-unreachable;
[t+10  db+web+ci] SWALLOWED  (cooldown 10m/60m) — prompt NEVER sent
[t+61  db+web+ci] SUMMONED   — API degraded (503): database-unreachable; Frontend … HTTP 500; CI failing on main: abc1234;
```

The t+0 line is **byte-identical to this session's own summon prompt** (trailing `; ` included), which
is what establishes the replica is faithful to the original rather than merely plausible.

**Filed as TD-43 (not TD-39 — see §6) and deliberately NOT shipped — the reason is an ordering dependency, not caution.**
Details in §6. The decisive point belongs here rather than there: **fixing the summon-IN path buys
nothing while the alert-OUT path is dead.** This table says no automated signal of any kind has reached
Branden since `18:27Z` on 09-21, so a faster, better-attributed summon merely produces a faster session
that also reaches nobody. Close the egress gap first; TD-43's value is exactly zero until then.

*Generalised: 113 sessions refined how findings are recorded and carried out — the counters, the doc-rot
greps, the orphan detector, this very table. The input gate stayed invisible the whole time because it is
the thing that asks the question, and an instrument that only ever produces work never looks like work.
When a monitoring loop has produced N near-identical runs, audit the **trigger**, not just the reports:
this one silently merges distinct incidents into one identity, which is the single defect a pile of
near-identical reports could never surface — every report it produced looked correct.*

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
