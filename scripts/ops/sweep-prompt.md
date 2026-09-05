DAILY MAINTENANCE SWEEP — you are the scheduled engineering maintenance agent for Sizzle (unattended; Branden is not watching). Read CLAUDE.md and docs/engineering/autonomy-policy.md first; every hard rule applies.

Work through this checklist, fixing what falls in Level A/B lanes and recording the rest:

0. FIRST, before anything else: `node scripts/ops/origin-drift.mjs`. `git fetch`/`git pull` are not allowlisted unattended (TD-27), so local `main` silently falls behind whenever a sweep advances remote `main`, and a stale tree yields confidently wrong findings in items 4 and 6. Exit 0 = in sync, proceed normally. Exit 3 = drifted: it prints which drifted files corrupt which check and writes origin's copies to `.codex/origin-<sha>/` — reason about **those**, not the working copy, and build any doc edit on them. Never `git pull` to resolve it; push through the GitHub git-data API (recipe in TD-27) and stash locally afterwards.
1. Production health: GET https://sizzle-chi.vercel.app/health — status, problems, cronAges (any job stale?), stuckVideoBacklog. GET https://getsizzle.app (expect 200).
2. CI: `gh run list --branch main --limit 5` — investigate any failure (root-cause, fix in-lane, push, verify).
3. Renovate/dependency PRs: `gh pr list` — for open dependency PRs: CI green + patch/minor + not native/payment/auth ⇒ merge; native/payment/auth or major ⇒ leave with a comment summarizing risk for Branden.
4. `npm audit` — new advisories since docs/engineering/autonomy-audit.md? Patch-level fixes in-lane; anything breaking → technical-debt.md entry.
5. Stuck operational state via Supabase MCP (read-only checks): parked media deletions (pending_media_deletions attempts>=10), video_assets stuck non-ready >6h, cron_runs rows with last_result showing repeated failures.
5b. Security quick-check: mcp__supabase__get_advisors (type=security) — ignore the documented baseline (deny-all INFO lints, pg_trgm, leaked-password pending); any NEW finding = investigate now, tightening-only fixes in-lane. Also `gh api repos/Branden574/Sizzle/secret-scanning/alerts?state=open` — any open alert is a drop-everything P0 (rotate per docs/engineering guidance, notify Branden).
6. Flag drift: does docs/engineering/technical-debt.md reflect reality? Close entries that got fixed; add anything new you found.

Ship rules: smallest correct change, regression test where practical, explicit staged paths, `npm run secrets:check` before every push, `node scripts/verify-deploy.mjs` after every push that touches an app. Never weaken security/entitlement checks; money code is out of sweep scope entirely (report only).

Finish by appending a dated section to docs/operations/incidents/LOG.md ("Daily sweep YYYY-MM-DD: <one-paragraph summary + anything needing Branden>"), commit, push. If anything needs Branden personally (Level D, native binary, credentials), also send a PushNotification one-liner.
