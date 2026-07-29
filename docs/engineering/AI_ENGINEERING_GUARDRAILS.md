# Sizzle — AI engineering guardrails

The full rules. `CLAUDE.md` carries the 20-line summary; this is the detail behind it.
`SYSTEM_RISK_MAP.md` holds the verified facts about each system.
`CHANGE_SAFETY_CHECKLIST.md` is the procedure to follow per change.

Sizzle is live on the App Store with real users, creator balances, purchases and payouts.
Mistakes here cause financial loss, privacy incidents, unauthorized premium access, corrupted
recommendations, broken mobile releases, or irreversible production damage.

---

## 1. Never guess

Never guess about database structure, table relationships, financial logic, creator earnings,
payout calculations, entitlements, authentication, authorization, API behaviour, architecture,
environment variables, third-party integrations, business rules, migration history, native
configuration, recommendation behaviour, production data, or deployment infrastructure.

Before making a change: inspect the code, trace all callers, trace downstream effects, inspect the
schema and migrations, inspect tests, inspect configuration, inspect both the web and mobile
implementations, search for dynamic references, and verify each assumption against repository
evidence.

```
No evidence = no assumption.
No verified understanding = no destructive change.
```

When uncertain: **stop, preserve current behaviour, document the uncertainty, ask.**

Never invent a missing fact to finish a task.

**Worked example from this repo.** Four `public/recipes/*.jpg` files had zero references in all
source, CSS, HTML and docs — the obvious conclusion was "unused, delete". Querying production
showed six rows using them as `video_assets.poster_url`. Deleting them would have broken six live
posts. Code search alone cannot prove an asset is unused; check the database.

**Second worked example.** `apps/web/src/data.ts` mock fixtures looked dead after their last client
consumer was removed — until `tsc` failed on `apps/api/src/scripts/seed.ts`, which imports them
across the workspace boundary as its documented source of truth.

## 2. Never damage the database

Never drop a production table or column, truncate, bulk-delete production records, rewrite creator
balances or payment/earnings history, delete or edit deployed migrations, reset the production
database, run unreviewed SQL against production, remove RLS, disable foreign keys or constraints,
rename critical fields without a migration plan, change types without checking existing values,
backfill financial data without reconciliation, cascade-delete financial or audit records, or
assume local data resembles production.

Historical migrations are **immutable** once they may have been deployed. Create a new migration.

Every database change needs: current-schema inspection, migration-history inspection, existing-data
analysis, a forward migration, a rollback or recovery strategy, compatibility assessment, index and
constraint impact, query impact, deployment-order requirements, a backfill strategy, validation
queries, tests against production-like data, and human review before production execution.

Prefer additive migrations:

```
add new structure → backfill safely → support old and new paths → verify
→ switch reads → switch writes → remove old structure in a separate approved change
```

Do not combine expansion and destructive cleanup in one migration.

## 3. Financial data is append-only by default

Creator earnings, balances, payouts, purchases, refunds, fees and entitlements are financial
records. Never update a balance directly unless the established architecture requires it and you
fully understand it.

**In Sizzle specifically** (verified — see `SYSTEM_RISK_MAP.md`): money is **integer cents**
everywhere, and a creator's balance is **derived** by `public.creator_earnings(uid)` summing
`succeeded` rows in `tips`. There is no stored balance. Therefore **never delete or mutate a
`tips` row to correct earnings** — that rewrites history with no audit trail. Corrections are new
rows or explicit status transitions.

Prefer immutable entries, reversal/adjustment entries, idempotency keys, reconciliation, auditable
state transitions, explicit transaction status, database transactions, exact arithmetic and
server-authoritative calculation.

**Never use floating point for money.** Never introduce a second money representation.

Every financial mutation must verify: authenticated actor, authorization, account scope, currency,
amount, source event, idempotency, existing transaction state, duplicate-event risk, transaction
boundaries, audit logging, failure recovery and retry behaviour.

**Never let a client-supplied total determine creator earnings.** The server calculates.

## 4. Payment and webhook safety

Treat provider webhooks as untrusted input until verified. Before processing: verify the signature,
verify the environment, validate the schema, verify the event has not already been processed,
verify currency and amount, verify the referenced user/purchase/creator/product, confirm a valid
state transition, use a transaction, record the provider event id and the result.

**In Sizzle** the Stripe handler recomputes an HMAC-SHA256 over `` `${timestamp}.${rawBody}` `` and
rejects mismatches with 401 — it reads the **raw** body. Do not refactor it to parse JSON first;
verification needs the exact bytes.

Every handler must be safe to retry. Every money path has a DB-level uniqueness constraint — if you
add a path, add the constraint in the same migration.

Never grant access before payment confirmation, remove replay protection, expose webhook secrets,
log full payloads, treat a client redirect as proof of payment, or mark a payout complete on
request submission.

## 5. Entitlements and premium content

Premium access is **server-authoritative**. Never rely on hidden buttons, client state, local
storage, URL parameters, cached purchase state, optimistic UI or JavaScript checks.

Before exposing protected content verify identity, purchase/subscription state, entitlement
validity, refund status, chargeback status, expiration, product identity, creator identity and
revocation state.

Never expose protected URLs, recipe details, videos, downloads or media metadata to unauthorized
clients. Changes here require authorization, refund, chargeback, account-switch, cache-isolation,
deep-link and expiration tests.

## 6. Never commit secrets

Never commit, print, paste, log or hardcode API keys, database credentials, service-role keys,
private/signing keys, OAuth secrets, JWT secrets, webhook secrets, encryption keys, Cloudflare
tokens, payment or email provider keys, push credentials, Apple/Android signing material, access or
refresh tokens, session cookies, signed URLs, PATs, or production connection strings.

Before finishing, inspect the diff, new files, logs, fixtures, screenshots, docs, `.env` files and
build output. Use environment-variable references. Use explicit placeholders like
`YOUR_CLOUDFLARE_API_TOKEN` — never invent realistic-looking fake secrets.

If an exposed secret is found: do not repeat the value, identify the file and category, recommend
immediate rotation, remove it from current files, note that deleting it does **not** remove it from
git history, and do not rewrite history without explicit authorization.

## 7. Never commit or deploy without authorization

Do not run `git commit`, `git push`, `git merge`, `git rebase`, `git tag`, `git reset --hard`,
`git clean`, `git checkout -- .`, `git restore .`, `npm publish`, deployment commands or production
migration commands unless Branden explicitly asks.

Do not open or merge PRs, trigger deploys, publish packages, upload builds, submit apps, change
production environment variables, modify live infrastructure or modify live database records.

Inspecting git history is fine. Creating uncommitted changes for review is fine.

At the end: show changed files, show a diff summary, suggest commit groupings, do not commit.

## 8. Protect existing user work

Run `git status`, `git diff` and `git diff --staged` before modifying anything. Identify modified,
staged and untracked files. Never discard user changes, overwrite unrelated modifications, reset
the worktree, delete untracked files, or silently resolve a conflict in your own favour.

Untracked files cannot be recovered by git — if you must remove one, copy it somewhere safe first
and say where.

## 9. Impact analysis before every change

Build a change-impact table before writing code:

| Area | Potentially affected | Evidence | Risk | Required validation |
| --- | --- | --- | --- | --- |
| Database | | | | |
| Financial ledger | | | | |
| Web | | | | |
| iOS | | | | |
| Android | | | | |
| API | | | | |
| Security | | | | |
| Tests | | | | |

Cover: user-facing behaviour, web and mobile components, hooks, state stores, query caches, API
endpoints, services, tables, migrations, background jobs, webhooks, email, push, analytics,
recommendation signals, moderation, permissions, feature flags, tests, native code, Capacitor
plugins, Cloudflare Stream, payments, earnings, entitlements, security, performance, accessibility
and deployment order.

## 10. Risk classification

**Critical** — schema, data migrations, earnings, payments, payouts, refunds, entitlements, auth,
authorization, security, encryption, data deletion, video deletion, account deletion, moderation
enforcement, production infrastructure.
→ Full trace, written plan, rollback plan, independent specialist review, expanded tests, human
approval before any destructive action, no production execution without authorization.

**High** — recommendation ranking, upload pipelines, video processing, push, webhooks, account
switching, offline sync, native plugins, query behaviour, cache isolation.
→ Impact analysis, before/after tests, independent review, staged implementation, feature flag
where practical.

**Medium** — shared components, forms, API-client refactors, search, hashtags, navigation, state
management, performance.
→ Caller analysis, regression testing, cross-platform verification.

**Low** — verified dead imports, documentation, internal naming, isolated visual refinement.
→ Still must preserve behaviour.

## 11. Use specialist reviewers

For critical and high-risk work, run independent review passes — database, financial, security,
backend, web, mobile, QA. The implementing agent must not be the only reviewer.

When subagents are unavailable, perform separate labelled review passes and **say so**. Never claim
an independent review that did not happen.

## 12. Root-cause fixes, not surface patches

Do not hide a bug by disabling a button, swallowing an error, adding a timeout, forcing a refresh,
clearing the entire cache, wrapping in a broad `try/catch`, casting away a type error, making a
field globally optional, bypassing validation, removing a constraint, hardcoding a user or
environment, duplicating state, retrying indefinitely, or suppressing a warning.

```
A UI restriction is not authorization.
A client calculation is not financial authority.
A hidden field is not security.
A successful local build is not proof of production safety.
```

## 13. Type safety

Never solve a problem by weakening types. No `any` without documented necessity, no broad casts, no
unproven non-null assertions, no disabling strict mode, no global suppression, no making required
fields optional just to compile, no accepting unvalidated API responses, no duplicate incompatible
domain types.

**Sizzle currently has zero `any` in `apps/web`, `apps/api` and `packages/shared`.** Keep it there.
Type errors often reveal real business bugs — understand them before silencing them.

## 14. Error handling and logging

Never swallow errors silently. Each error path should answer: what failed, is retry safe, was data
already committed, could it have partially succeeded, must the user act, should monitoring alert, is
reconciliation required, is anything sensitive being exposed.

Never surface raw SQL, stack traces, secrets, provider payloads, signed URLs, internal moderation
logic or financial internals to a client. **Sizzle's `onError` already does this** — 5xx detail is
logged and reported to Sentry while the client receives a generic message. Use the helpers in
`lib/errors.ts`; do not hand-build error responses.

Never log passwords, tokens, session cookies, private keys, API keys, payment details, full
financial payloads, tax data, private messages, signed upload/playback URLs, Cloudflare provider
UIDs, or unredacted webhook payloads. Remove temporary `console.log` before finishing.

## 15. Account-scoped cache safety

Personalized caches must never leak across accounts. In Sizzle the React Query keys are **not**
account-scoped, so the whole cache is wiped on identity change (keyed on user id, in `App.tsx`) and
the sibling caches are cleared in `auth/useAuth.ts`. **Any new cache holding user data must be
cleared in both places.** Keying on auth *status* is not enough — a deep link can swap A → B
without ever passing through signed-out.

## 16. Concurrency and idempotency

Any operation involving money, entitlements, uploads or state transitions must handle: double click,
network retry, mobile retry, background retry, duplicate webhook, two devices, two tabs, two
admins, stale client, timeout after success, partial failure, app backgrounding, offline replay.

Use idempotency keys, unique constraints, compare-and-set, versions, transactions and provider event
ids. **A disabled button is not duplicate protection.**

## 17. Change scope

Implement the smallest complete solution. Do not bundle a bug fix with a schema redesign, dependency
upgrade, UI redesign, file reorganization, formatting sweep or feature removal. Document valuable
adjacent refactors separately instead of smuggling them in.

## 18. Testing

Determine what the change requires: unit, integration, API, database, migration, authorization,
financial-invariant, concurrency, retry, idempotency, web UI, mobile, accessibility, performance or
E2E tests.

Do not delete a failing test — determine whether the test or the implementation is wrong. Do not
bulk-update snapshots. **Never claim a test passed unless it was executed**; record the exact
command and result.

Given Sizzle has almost no test infrastructure, writing a throwaway harness for a risky change is
often the right move — and running it against the **unpatched** code first proves the bug was real.

## 19. Comments and documentation

Document non-obvious decisions about financial logic, database invariants, security,
recommendation behaviour, native workarounds, Cloudflare behaviour, webhook idempotency, retry
semantics, cache isolation, migration order and backward compatibility.

A comment should say **why this exists, what breaks if removed, which invariant it protects.** Do
not restate the code. Many comments in this repo record WebView bugs and Cloudflare timing quirks
that cannot be reconstructed — check before deleting one.

## 20. Stop conditions

Stop and report when: the business rule is ambiguous, the database state is unknown, a destructive
migration seems necessary, financial invariants cannot be determined, production behaviour cannot
be reproduced, required services are unavailable, existing uncommitted work conflicts, tests reveal
unrelated critical failures, the change could expose private data, a safe rollback cannot be
designed, an integration contract is unknown, or a review identifies unresolved critical risk.

Do not force a solution through uncertainty.

## 21. Final report

Every meaningful task ends with: requirement understood, root cause, impact analysis, changes made,
database impact, financial impact, security impact, tests run (exact commands and results), tests
**not** run and why, which independent reviews occurred, remaining risks, changed files categorized
created/modified/deleted, and a suggested commit plan.

Make no unsupported claims. If something was not verified, say so.
