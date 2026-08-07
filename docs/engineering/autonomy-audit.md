# Sizzle — engineering autonomy audit (2026-08-06)

Seven-dimension parallel audit (testing, CI/CD, observability, dependencies, docs,
security automation, native/OTA) run read-only with per-finding evidence. 54 findings:
**0 P0, 15 P1, 23 P2, 16 P3.** No emergency exists — the security *design* is sound;
the gaps are almost entirely in **automation, regression protection, and doc freshness**.
Full machine-readable findings live in the session workflow output; this file is the
durable synthesis plus the implementation ledger.

## Headline verdicts

- **Next.js: not applicable.** Sizzle does not use Next.js (React 18 + Vite 5 + Capacitor 8
  client; Hono 4 API on Vercel serverless). No migration performed or planned — a framework
  swap would be an unrelated high-risk project.
- **Security design verified clean where it matters:** service-role appears nowhere in
  client code; all five `VITE_` vars are public-by-design; all three webhooks (Stripe,
  RevenueCat, Cloudflare) verify signatures with timing-safe compares; rate limiting is
  Postgres-durable; .gitignore secret layering correct; tracked-file secret scan: zero hits.
- **The automation layer was absent:** before today, zero CI workflows, one test file,
  no lint, no secret-scan tooling, no dependency automation, manual-only deploy checks.
- **Dependencies fundamentally sound** (every prod dep on its current major, nothing
  deprecated), but `npm audit` shows 10 advisories; the one production-path item is
  **hono 4.12.26 ≤ 4.12.33 — ReDoS in the exact CORS middleware the API mounts app-wide**
  (in-range fix: 4.13.0). The critical/high tier is all transitive build tooling
  (tar/brace-expansion via @capacitor/cli, postcss via vite, shell-quote via concurrently).

## Top priorities (consolidated P1s)

| # | Finding | Evidence anchor | Status |
|---|---------|-----------------|--------|
| 1 | Money math had zero tests (penny-exactness "verified by hand at $5.00" once) | packages/shared/src/index.ts:346-375 | ✅ **Fixed today** — pricing.test.ts sweeps every cent $5–$500, both splits |
| 2 | No CI at all; nothing runs on push | `.github/` empty | ✅ **Built today** — ci.yml (typecheck, tests, secret scan, migration gate, builds, artifact validation) |
| 3 | No secret-scan tooling despite a real prior PAT leak | CLAUDE.md hard rule 1 | ✅ **Built today** — secrets-check.mjs (proven to fire), local + CI |
| 4 | hono CORS ReDoS advisory in production request path | app.ts:44-59, GHSA-8j4g-w8fx-2239 | ⏳ `npm update hono` → 4.13.0 — needs owner-authorized deploy (money-path dep) |
| 5 | No cron heartbeats: 4 of 5 crons can die silently forever | vercel.json crons; grep cron_runs = ∅ | ⏳ planned — `cron_runs` table + `/health` cron ages |
| 6 | `/health` always returns 200 "ok" even when its own DB probe fails; no uptime monitor anywhere | health.ts:24-66 | ⏳ planned — honest degraded/503 + external monitor (owner account) |
| 7 | Sentry events carry no release/version tags; multiple JS versions run in the field (OTA) | web+api sentry.ts envelopes | ⏳ trivial addition, ride the next OTA |
| 8 | Stripe/RevenueCat webhook handlers have none of the tests SYSTEM_RISK_MAP declares "Required" | monetize.ts:796,866 | ⏳ integration harness vs local stack — the big test build-out |
| 9 | RLS/grant matrix has no repeatable check (grant drift already caused one real bypass) | SYSTEM_RISK_MAP:212-243 | ⏳ commit the 2026-07-29 verification as a runnable script |
| 10 | Deploy verification has no tooling and neither surface exposes its commit SHA | health.ts (no version field) | ⏳ stamp `VERCEL_GIT_COMMIT_SHA` into /health + verify-deploy script |
| 11 | PROGRESS.md (mandated first-read) is ~6 builds behind; deploy.md still says Railway/Fly; README describes a pre-launch prototype | docs-drift dimension | ⏳ doc catch-up pass, owner-authorized commit |
| 12 | Admin second-factor bypass: `POST /hashtags/:tag/moderate` skips requireAdminUnlock (contradicts SYSTEM_RISK_MAP) | hashtags.ts:224 vs admin.ts:33 | ⏳ **real security fix** — Level C, small diff, needs client header check |
| 13 | No min-native-version/bundle-compat gating in Capgo; OTA upload is a raw manual command nothing can fail | capacitor.config.ts:46-55 | ⏳ `ota:release` wrapper that hard-fails on native diffs + `--min-update-version` |
| 14 | ESLint never actually existed (stale directives referenced absent plugins) | AdminDashboard.tsx jsx-a11y directive | ✅ **Built today** — flat config, correctness rules; 31→15 findings, 9 = real hook bugs (debt #TD-1) |
| 15 | React conditional-hooks violations in 3 shipped components (latent crash class) | RecipeSheet.tsx:75-91, CommentsSheet.tsx:41, CookSheet.tsx:357 | ⏳ TD-1 — fix with simulator verification, then lint enters CI |

Notable P2s: DTO/DB drift unguarded (Supabase client untyped — generate DB types);
`@capacitor/cli` in `dependencies` pollutes prod audits (move to dev); per-route rate
limits missing on `/me/export`, poster moderation, follows; upload own-folder check
accepts `..`/percent-encoding (tighten with URL normalization); four stale "MUST fix"
docs need closure banners; `.github/modernize/` is unowned Java-tool residue to delete.

## What exists vs what was believed

The audit *corrected the master prompt's assumptions* in several places: guardrail docs
already existed and are current (2026-07-29 suite); webhooks already verify signatures;
admin already double-gates (one route excepted — #12); diagnostics already exist in
Settings (OTA bundle + native build visible); `notifyAppReady` rollback already armed.
The right move was extending, not rebuilding — which is what today's work did.

## Implemented in this pass (all uncommitted, awaiting review — CLAUDE.md rule 20)

Tooling: `scripts/secrets-check.mjs` · `scripts/safety-diff.mjs` (incl. the two defects
the audit itself found in it — base-range + lockfile blindness — fixed) · root scripts
`test`, `test:unit`, `test:invariants`, `secrets:check[:all]`, `safety:diff`, `lint`, `ci`.
Tests (24 green): money-math sweep (7) · security invariants incl. service-role isolation,
webhook verification presence, admin double-gate, migration append-only, guardrail-doc
existence, local-clips account-switch teardown (11) · existing controls contract (6).
CI: `.github/workflows/ci.yml` + dependency-review, least-privilege, zero secrets.
Policy/docs: `AGENTS.md` · `docs/engineering/autonomy-policy.md` (Levels A–D + SAFETY
gate) · `docs/operations/incident-response.md` (SEV + per-surface rollback) · PR template ·
issue forms (bug/incident/security) · `renovate.json` (patch automerge only; native/money
never) · ESLint flat config + 16 mechanical correctness fixes (typecheck + tests still green).

## Owner actions required (Level D — cannot be done by an agent)

1. Authorize the commit/push of this work, which also activates CI on GitHub.
2. Install the Renovate GitHub App (or say the word and I switch the config to Dependabot).
3. Branch protection on `main`: require the `checks` job; block force-push.
4. Uptime monitor on `/health` + getsizzle.app (any provider, ~10 min) once /health
   reports honest degraded states.
5. Approve the hono bump deploy and the hashtag-moderate unlock fix when proposed.

## Recommended next three (impact × effort)

1. **Webhook/entitlement integration harness** against the local stack (finding #8+#9) —
  converts the two highest-risk money paths from comment-protected to test-protected.
2. **Deploy verification + version stamping** (#10) — closes the dead-webhook class for good.
3. **Cron heartbeats + honest /health + uptime monitor** (#5+#6) — makes silent failure loud.
