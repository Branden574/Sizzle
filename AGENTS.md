# AGENTS.md — engineering rules for ANY coding agent (or human) in this repo

Sizzle is a **live App Store product with real users and real money**. These rules are
tool-neutral: they apply to Claude Code, Codex, Cursor, GitHub agents, and people.
`CLAUDE.md` is the binding constitution; this file is the startup checklist that points at it.

## Session bootstrap — do this before editing anything

1. Read `CLAUDE.md` (the constitution — its rules override your preferences).
2. Read `PROGRESS.md` (current state; what's in flight).
3. Read `docs/ARCHITECTURE.md` (where every feature lives).
4. Read the guardrail doc for the area you're touching:
   - `docs/engineering/AI_ENGINEERING_GUARDRAILS.md` — general engineering rules
   - `docs/engineering/SYSTEM_RISK_MAP.md` — per-system risk tiers + verified invariants
   - `docs/engineering/CHANGE_SAFETY_CHECKLIST.md` — pre/post-change protocol
   - `docs/engineering/autonomy-policy.md` — what you may do without approval
5. `git status` — **never assume uncommitted files are yours; never overwrite them.**
6. Classify your change's risk level (autonomy-policy.md) BEFORE writing code.

## Absolute rules (no exceptions, no cleanup instincts)

- Never expose, print, or commit secrets. Never stage with `git add -A` / `git add .`.
- Never weaken security to fix functionality: a 401/403/RLS denial is a clue, not a bug.
  Do not disable RLS, widen a policy, make a bucket public, drop auth middleware, or
  accept unverified webhooks to make an error go away.
- Never destroy production data: no DROP/TRUNCATE/bulk DELETE, no `db reset` against
  production, no deleting users/recipes/media/payment records, no rewriting shipped
  migrations (`supabase/migrations` is append-only).
- Never rewrite a working subsystem because you'd have built it differently. Sizzle has
  deliberately unusual, load-bearing designs (native upload relay, local-clip playback,
  admin double-gate, reversed Vercel project names, identity-change cache clearing).
  Understand why code exists before changing it — `SYSTEM_RISK_MAP.md` documents most of it.
- Never delete failing tests, skip assertions, or add `@ts-ignore` to get a build green.
  Fix the actual problem or stop and report.
- Never commit, push, merge, deploy, publish, or run production migrations without
  explicit authorization from Branden.
- A localized bug authorizes a localized fix. If your diff is growing past the scope you
  stated at the start, stop and reassess (change-budget rule).
- Files that look unused may be entry points (crons, webhooks, deep links, native
  registration, older shipped app versions). "No importer found" ≠ dead code.

## Definition of done for any fix

Reproduce → root-cause with evidence → regression test (or documented manual validation
for device-only behavior) → smallest correct fix → typecheck + build + relevant tests →
verify on a real surface → update docs touched by the change → report honestly.
"I think this might fix it" is never a justification to ship.
