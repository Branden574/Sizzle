# Sizzle — incident response

## Severity

| SEV | Meaning | Examples |
|-----|---------|----------|
| 1 | Broadly unusable, or security/money/data at risk | login broken for all, payment double-charge, secret leaked, RLS bypass, data loss |
| 2 | Major feature broken for many users | uploads dead-ending, feed empty, push totally dead, OTA bricking startup |
| 3 | Feature degraded | slow feed, thumbnails failing, one notification type broken |
| 4 | Minor bug | cosmetic issues, copy errors |

SEV-1/2: stop unrelated work. Rollback first when rollback is safer than a speculative
fix — **it usually is**. Preserve evidence (Sentry event IDs, request IDs, DB rows,
Vercel deployment IDs) before changing anything.

## The loop

Detect → Contain (rollback / disable) → Preserve evidence → Root-cause → Patch →
Validate on a real surface → Deploy (verified) → Monitor → Postmortem in `docs/incidents/`.

## Rollback per surface (the part to know cold)

**Web frontend (getsizzle.app / Vercel project `sizzle-api`)** — Vercel dashboard →
Deployments → previous READY deployment → *Promote to Production* (instant). CLI:
`vercel rollback <deployment-url>` from the linked checkout. Remember the naming is
REVERSED (`sizzle-api` = frontend, `sizzle` = API).

**API (sizzle-chi.vercel.app / Vercel project `sizzle`)** — same mechanism on the
`sizzle` project. API rollback also rolls back webhook handlers — check Stripe's
dashboard for events delivered while broken and let Stripe's retries redeliver
(handlers are idempotent by design; verify the ledger afterwards).

**OTA (Capgo)** — Capgo console → app → channel `production` → assign the previous
bundle (or unlink the bad one). Users recover on second launch. A bundle that fails
`notifyAppReady` auto-rolls-back on-device. To halt distribution mid-rollout, disable
the channel. Never "fix" a bad OTA by shipping a second untested OTA on top.

**Native binary** — cannot be rolled back once installed. Mitigate with an OTA fix if
the defect is in JS/CSS; otherwise expedited review for a new build (Level D — owner
submits). This asymmetry is why native-touching changes get the strictest review.

**Database** — do NOT write "down" migrations against production. Fix forward with a
new migration (append-only history). If bad data was written, correct it with an
auditable append-only correction (financial rule #5), never by deleting history.

**Stripe/money incidents** — additionally: pause the affected product surface if
needed (e.g. temporarily price-gate off), reconcile the ledger against Stripe's
dashboard before and after, and never retry charges manually — idempotency keys and
Stripe's own retry machinery are the mechanism.

## Secret leak (compressed from the full playbook)

Treat any committed/printed secret as compromised even if deleted seconds later:
revoke/rotate at the provider first, then purge from history, then verify the new
credential works, then `npm run secrets:check`, then document in `docs/incidents/`.
Rotation is Level D (owner does credentials).

## Postmortem template (`docs/incidents/YYYY-MM-DD-slug.md`)

Impact (who/what/how long) · Timeline · Root cause (the actual first wrong state, not
the symptom) · What contained it · What would have caught it earlier (test? alert?
guardrail?) · Follow-ups filed (link to technical-debt.md entries or issues).
