# Sizzle — change safety checklist

Run this per change. Scale the depth to the risk tier in `SYSTEM_RISK_MAP.md`; the pre/post
checklists apply to everything, the protocols apply to their domain.

---

## Pre-change

```
[ ] git status inspected; existing uncommitted work identified and preserved
[ ] Requirement rewritten precisely; ambiguities named (do not code through ambiguity)
[ ] Risk tier classified (Critical / High / Medium / Low)
[ ] Current behaviour reproduced (for a bug: reproduced BEFORE changing code)
[ ] Root cause identified — not just the visible symptom
[ ] All callers searched (static AND dynamic: import(), lazy(), string keys, route tables)
[ ] Non-code references searched: crons (vercel.json), webhooks, deep links, native
    registration, feature flags, the DATABASE, email templates, older shipped app versions
[ ] Database impact checked (schema, migrations, grants, RLS, indexes, constraints)
[ ] Financial impact checked (tips, payouts, unlocks, subscriptions, iap_transactions)
[ ] Security impact checked (auth, authorization, entitlements, cross-account, cache scope)
[ ] Web impact checked
[ ] iOS impact checked  — remember: native changes cannot ship via OTA
[ ] Android impact checked
[ ] API contract impact checked (packages/shared)
[ ] Cache impact checked (React Query keys, localStorage, Capacitor Preferences)
[ ] Analytics / recommendation signal impact checked
[ ] Existing tests identified; regression test planned
[ ] Rollback or recovery strategy identified
[ ] Specialist review completed, or explicitly marked unavailable
```

**Do not begin a Critical change with unchecked unknowns.**

---

## Post-change

```
[ ] Full diff reviewed line by line
[ ] No unrelated files changed
[ ] No features removed
[ ] No database history deleted; no deployed migration edited
[ ] No destructive migration added
[ ] No financial records overwritten
[ ] No authorization weakened
[ ] No secrets added (diff scanned for sbp_ sk_live sk_test whsec_ eyJ… re_ -----BEGIN acct_)
[ ] No forbidden file staged (.env*, .mcp.json, .vercel/, .vercelignore, plists)
[ ] No debug credentials, no sensitive logging added
[ ] No type safety weakened; still zero `any`
[ ] No tests deleted without justification
[ ] Regression tests added or updated
[ ] Targeted tests run — exact command and result recorded
[ ] Web typecheck:   cd apps/web && npx tsc -b --noEmit
[ ] API typecheck:   cd apps/api && npx tsc -p tsconfig.json --noEmit
[ ] Contract test:   cd apps/web && npm run test:controls
[ ] Web build:       cd apps/web && npm run build
[ ] API build:       cd apps/api && npm run build
[ ] Circular deps:   npx madge --extensions ts,tsx --circular apps/web/src   (expect exactly 1:
                     auth/useAuth.ts > lib/nativeOAuth.ts — deliberate, dynamic import)
[ ] Bundle delta measured; chunk count unchanged (no lazy chunk merged into the entry)
[ ] Capacitor config verified in BOTH modes when touched:
      npx tsx -e "import c from './capacitor.config.ts'; console.log(c.server)"
      SIZZLE_LAN=1 npx tsx -e "…"
[ ] iOS / Android verified when relevant (Simulator, not browser-mobile emulation)
[ ] Migration tested from empty AND against production-like data when relevant
[ ] Concurrency / idempotency tested when relevant
[ ] Financial invariants tested when relevant
[ ] Independent review performed (or its absence stated)
[ ] Remaining risks documented
[ ] SYSTEM_RISK_MAP.md updated if a new invariant or unknown was discovered
[ ] Work left uncommitted unless Branden authorized otherwise
```

---

## Database change protocol

```
[ ] Read the complete relevant schema (live, via MCP — not just the migrations)
[ ] Read every migration affecting the structure
[ ] Search all code references and all raw SQL
[ ] Search background jobs, crons, analytics, mobile caches
[ ] NEW TABLE the API uses immediately: run `notify pgrst, 'reload schema'` after
    applying — PostgREST's schema cache does NOT reliably auto-reload on hosted
    Supabase, and the API's upserts fail silently until it does (verified
    2026-08-06: cron_runs heartbeats were no-ops until the manual reload)
[ ] Inspect constraints, indexes, RLS policies, table grants AND column grants
      relacl covers table grants; pg_attribute.attacl covers column grants — check both
[ ] Determine data volume; identify nullable / malformed values
[ ] Design an ADDITIVE migration
[ ] Design rollback or forward-recovery
[ ] Test from an empty database (supabase db reset)
[ ] Test against production-like data
[ ] Consider old-app compatibility if deployments overlap
[ ] Database specialist review
[ ] Human approval before applying to production
```

Migrations must be append-only, idempotent where appropriate, transaction-safe, documented and
recoverable. **Never edit a deployed migration.**

---

## Financial change protocol

```
[ ] Map all financial states and every transaction source
[ ] Map every webhook and every retry path
[ ] Map refund, chargeback and payout behaviour
[ ] Confirm money representation (Sizzle: integer cents — verify it has not changed)
[ ] Confirm rounding and currency behaviour
[ ] Confirm the idempotency key AND the DB constraint enforcing it
[ ] Confirm transaction boundaries
[ ] Write the financial invariants down before changing anything
[ ] Tests: duplicate webhook, timeout after DB success, timeout after provider success,
      refund after earnings, chargeback after payout, currency mismatch, rounding edge,
      concurrent purchase, suspended creator mid-payout, account switch, stale client retry
[ ] Finance + database specialist review
[ ] No production execution without authorization
```

Remember: a creator's balance is **derived** from `succeeded` rows in `tips`. Correct by appending
or transitioning status — never by deleting or editing a tip.

---

## Security change protocol

```
[ ] Identify the authenticated identity source and account scope
[ ] Identify server enforcement AND database (RLS + grants) enforcement
[ ] Identify cache scope, mobile token storage, session refresh, account switching,
      deep-link and background-task behaviour
[ ] Test: authorized user, unauthorized user, different account, suspended account,
      expired session, revoked session, stale cached data, direct API call,
      modified client payload, guessed resource id, private account, blocked in both
      directions, hidden/moderated content, offline replay
```

Never trust a client-supplied identifier without an authorization check.

**Pattern that works here:** write a harness that exercises the allow path plus every deny path,
run it against the **unpatched** code to prove the vulnerability is real, then against the fix.
A gate that only passes the happy path proves nothing.

---

## Native / Capacitor protocol

```
[ ] Capacitor config, iOS project, Android project, plugins, permissions inspected
[ ] Deep links / Universal Links / App Links checked
[ ] Push, camera, microphone, photos, sharing, filesystem, network, keyboard,
      lifecycle, background modes, status bar, splash, secure storage checked
[ ] Confirmed whether the change can ship via OTA (JS/CSS only) or needs a native build
[ ] npm run build; npx cap sync; iOS build; Android build where available
[ ] Physical-device test where the feature needs one (camera always does)
```

Do not assume an apparently unused native file is safe to remove. Do not claim mobile verification
from a desktop browser.

---

## Release checklist

```
[ ] Secret scan across the full diff before pushing
[ ] Explicit-path staging only — never git add -A / git add .
[ ] No AI attribution in the commit message
[ ] After push: BOTH Vercel projects confirmed READY
      sizzle     = the API      (sizzle-chi.vercel.app)
      sizzle-api = the frontend (getsizzle.app)
[ ] Live smoke test: /health, a guest read path, the changed endpoint
[ ] Deployed bundle verified to actually contain the change (hashes differ between local
      and Vercel builds — grep the deployed chunk for a distinctive new string)
[ ] OTA: version bumped in apps/web/package.json, built, uploaded to the production channel
[ ] Remember OTA applies on the user's SECOND cold launch
```
