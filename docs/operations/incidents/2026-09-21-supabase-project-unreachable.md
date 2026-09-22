# SEV-1 — Supabase project `gsxoaurmsgqascxukony` unreachable (ongoing)

**Status: OPEN. Production is down for all users.** Started `2026-09-21T18:23:07Z`.
Owner action is the ONLY fix — no repo change, rollback or redeploy can touch it.

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

The DB is safe (restore window is **1 year**). **Stripe is not.** Two deadlines, both
counted from the first failure `2026-09-21T18:23:07Z`:

| Deadline | What expires | Consequence |
|---|---|---|
| **`2026-09-24T18:23Z`** | Stripe's automatic webhook retries (*"up to three days"*, live mode) | **Restore before this and the money self-heals with zero manual work.** |
| `2026-10-21T18:23Z` | List Events API 30-day window | Between the two dates, recovery needs a deliberate Events replay. **After it, loss is permanent.** |

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
- **Systemic (recommend, Level C):** a live App Store app runs its production database on a
  **pausable** tier with **no managed backups** (free tier self-serves `db dump`). Pro
  projects cannot be paused. *"Upgrade to Pro" is the real control here* — it removes both
  the pause risk and the Fair Use restriction mechanism in one step.
- **TD-21** — restore a DB path for the agent (PAT rotation; the connector grant alone is
  insufficient because the PAT behind it is revoked).
- **Alerting gap** — `PushNotification` has been returning *"Remote Control inactive"* for
  18 days, so unattended sessions cannot page you. `LOG.md` and this file are the only
  channels that carry anything. Worth fixing before the next SEV-1.
