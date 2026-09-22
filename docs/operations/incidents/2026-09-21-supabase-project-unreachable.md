# SEV-1 — Supabase project `gsxoaurmsgqascxukony` unreachable (ongoing)

**Status: OPEN. Production is down for all users.** Started `2026-09-21T18:23:07Z`
(11:23 AM PDT Mon 09-21). **20h44m as of 2026-09-22 15:07Z** — re-verified by session 17.
Owner action is the ONLY fix — no repo change, rollback or redeploy can touch it.

> **⏳ Stripe auto-retry expires `2026-09-24T18:23Z` — 51h16m of slack left (§2).**
> Restore before it and the money self-heals with zero manual work. Missing it is *not* a
> cliff — manual replay stays open to `2026-10-06` (dashboard) / `2026-10-21` (API). There is
> real time; this is urgent, not frantic.

This page exists because eleven unattended watchdog sessions have now diagnosed the same
outage and appended ~1,100 lines to `LOG.md`. The diagnosis is finished. This is the
one-page action sheet. **Read this, not the log.**

---

## 1. What you have to do (Level D — owner only, ~2 minutes)

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

The DB is safe (restore window is **1 year**). **Stripe is not** — but it has **three**
recovery layers, not one. Each window is counted from *event creation*, so the oldest
undelivered events (from the first failure `2026-09-21T18:23:07Z`) expire first:

| Deadline | What expires | Consequence |
|---|---|---|
| **`2026-09-24T18:23Z`** | Stripe's automatic webhook retries (*"up to three days"*, live mode) | **Restore before this and the money self-heals with zero manual work.** |
| `2026-10-06T18:23Z` | Dashboard per-event **`Resend`** button (15 days) | Recovery needs **no secret key** — open the event in the Stripe dashboard and click Resend. This is the owner path. |
| `2026-10-21T18:23Z` | CLI `stripe events resend` + List Events API (30 days) | Last resort; needs `sk_live`. **After it, loss is permanent.** |

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
# 5. TD-29 — videos stranded by the finalizer's 6h window (NEW, found session 13).
#    The outage outran `finalize-videos`' lookback floor (internal.ts:61-74 filters
#    created_at >= now-6h), so any asset left pending/uploading/processing at
#    2026-09-21T18:23Z will NEVER be picked up again — Stream webhooks are skipped and
#    the client poll is long gone. Nothing self-heals these. Count them first:
#      select id, status, created_at from video_assets
#       where provider='cloudflare' and status in ('pending','uploading','processing')
#         and created_at < now() - interval '6 hours';
#    If the count is > 0, re-drive those ids through the finalizer once (a one-off
#    backfill). Not time-critical — the rows persist — but it never fixes itself.
```

Then reconcile money: compare Stripe's dashboard events since `2026-09-21T17:54:46Z` (last
known-good) against the ledger. Handlers are idempotent — **let Stripe's retries redeliver;
never retry charges manually.**

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
- **Paused-vs-deleted is unanswerable from inside a session.** All three paths are closed:
  the claude.ai Supabase connector and the local `supabase` MCP server are both
  permission-gated (the gate is *connector-level* — even `search_docs` is denied), and
  `api.supabase.com` direct returns **401, PAT revoked** (TD-21). Only the dashboard or the
  ops inbox answers it.
- **Cron `responseStatusCode: 0` rows are noise** — timing jitter from the ~7s DB-connect
  stall crossing the invocation budget. Their absence is *not* recovery.

## 6. Open follow-ups (after recovery, not during)

- **TD-28** — false-green cron heartbeats: `internal.ts:67,103,110,251,280,296-298,344,361`
  destructure `const { data } = …` without checking `error`, so a failed run reports success
  at the HTTP-status layer. Level B PR, deliberately **not** shipped mid-outage (unverifiable
  against a dead DB, and it perturbs the signals being watched for recovery).
- **TD-29 (NEW, session 13)** — `finalize-videos` silently abandons work after a >6h
  outage: `internal.ts:61-74` floors the sweep at `created_at >= now-6h`, and nothing else
  re-drives a stuck asset (Stream webhooks skipped `:54`; client poll caps ~10 min). Any
  outage longer than 6h permanently orphans whatever was mid-transcode. Needs a one-off
  backfill (§4 step 5) **and** a resilience fix so duration alone cannot strand user content.
  Level B, but deliberately not shipped mid-outage — unverifiable against a dead DB.
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
