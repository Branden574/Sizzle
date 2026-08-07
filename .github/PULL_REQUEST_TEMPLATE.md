<!-- Sizzle PR — evidence over vibes. "Fixed bug" without a root cause is not done. -->

## Problem


## Root cause
<!-- The first wrong state and why it happens — not the visible symptom. -->

## Evidence
<!-- Repro steps, Sentry IDs, request IDs, DB rows, screenshots — what proves the diagnosis. -->

## Solution
<!-- Why THIS layer is the right place to fix it, and why the change is this small. -->

## Tests
<!-- The regression test that failed before and passes after. If device-only/manual, the exact validation performed. -->

## Commands run
```
npm run typecheck
npm test
npm run secrets:check:all
node scripts/safety-diff.mjs
```

## Risk & impact checklist
<!-- Any YES ⇒ minimum Level C per docs/engineering/autonomy-policy.md: owner approval before production. -->
- [ ] Touches auth / RLS / session / account deletion
- [ ] Touches payments / entitlements / payouts (Stripe, RevenueCat)
- [ ] Touches database schema or migrations
- [ ] Touches storage / media deletion
- [ ] Touches native code or native plugin versions → **new binary required, never OTA-only**
- [ ] Touches CI workflows / guardrail docs / production configuration
- [ ] Accepts new external URLs, files, or webhooks

## Deployment
<!-- Surface (web / api / OTA / binary), verification plan, and rollback path. -->

## Rollback plan
<!-- Vercel redeploy? Capgo bundle rollback? Forward-fix migration? Be concrete. -->
