# Sizzle — autonomy policy (risk lanes for agent-driven changes)

Which changes an engineering agent may handle on its own, and which stop for Branden.
Companion to `AI_ENGINEERING_GUARDRAILS.md` (how to work) and `SYSTEM_RISK_MAP.md`
(what's dangerous where). When this file and CLAUDE.md disagree, CLAUDE.md wins.

The rule that generates all the others: **autonomy shrinks as blast radius grows.**

## Level A — safe autonomous (may implement; may merge once CI exists and is green)

- Documentation typos/clarifications (not guardrail docs — those are Level C).
- New tests that only add coverage.
- Non-behavioral cleanup inside a single file (comment fixes, dead local variable).
- Patch-level dependency updates of non-native, non-payment, non-auth packages.
- Dev-only tooling that doesn't run in production or CI-with-secrets.

Conditions (ALL required): CI green · touches no security-sensitive path (list below) ·
no native file · no migration · no payment/auth/entitlement code · no production config ·
diff under ~150 lines. Anything failing one condition escalates to Level B.

## Level B — autonomous implementation, reviewed merge (the default lane)

Agent investigates, reproduces, writes the regression test, implements, opens a PR with
full evidence (see PR template), CI runs. **Branden (or a designated reviewer) merges.**

Typical: UI bugs, API bugs, feed issues, performance regressions, notification issues,
upload-pipeline bug fixes that don't change the pipeline's design, minor dependency
updates, refactors within one subsystem.

## Level C — high risk: explicit approval BEFORE any production effect

Agent may investigate and open a proposal PR, but nothing lands or deploys without
Branden's explicit sign-off, and the PR must carry a rollback/forward-fix plan.

- Supabase migrations (any DDL), RLS policies, security-definer functions.
- Authentication, session, account switching, account deletion.
- Storage lifecycle / media deletion (Cloudflare or Supabase).
- Payments: Stripe, RevenueCat, entitlements, payouts, refunds, ledgers.
- Moderation enforcement, admin authorization (role + unlock double-gate).
- Native plugin changes, Capacitor config, iOS/Android project files.
- OTA infrastructure/channels, webhook verification, CORS, rate limits.
- The guardrail docs themselves (CLAUDE.md, AGENTS.md, docs/engineering/*).
- Architecture rewrites of any working subsystem (needs the full case: evidence the
  current design can't solve it, alternatives, migration + rollback plan).

## Level D — never autonomous; owner acts personally

Credentials and keys (creation, entry, rotation) · production secret changes ·
destructive database operations · App Store / TestFlight submission · production
payment configuration · domain/DNS · Apple Developer / Firebase console changes ·
granting or revoking admin · deleting or banning users outside the shipped product flow.

## Security-sensitive paths (any touch ⇒ minimum Level C)

```
supabase/migrations/**
apps/api/src/middleware/auth.ts
apps/api/src/routes/admin.ts
apps/api/src/routes/monetize.ts
apps/api/src/routes/uploads.ts        (webhook verification + URL validation live here)
apps/api/src/services/payments.ts
apps/api/src/services/stream.ts
apps/api/src/services/videoFinalize.ts
apps/web/ios/**  apps/web/android/**  apps/web/capacitor.config.ts
.github/workflows/**
CLAUDE.md  AGENTS.md  docs/engineering/**
```

`npm run safety:diff` classifies a working-tree diff against this list.

## The SAFETY gate — answer all six before merging anything

- **S**cope — is this the smallest reasonable change? Did the diff stay inside the
  budget stated when work began?
- **A**uthorization — auth, RLS, and ownership checks preserved? (Nothing weakened to
  make something work.)
- **F**ailure — what happens if this fails halfway in production? Idempotent? Retried?
- **E**xposure — any secret, PII, or private content newly logged, returned, or bundled?
- **T**ests — is the regression protected by a test that failed before the fix?
- **Y**ield — after release, how do we observe it, and how do we roll back
  (Vercel redeploy / Capgo rollback / forward-fix migration)?

## Deployment lanes

A green PR is not a deployment. Deploys follow `CLAUDE.md` → Deploys: push (with
authorization) → verify the Vercel deployment reached READY for the affected project →
health probe. OTA ships only OTA-safe diffs (`safety:diff` must show no native paths).
Native binaries follow `docs/engineering/CHANGE_SAFETY_CHECKLIST.md` → Release checklist
and always end at Level D (owner submits).
