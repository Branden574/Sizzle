PRODUCTION INCIDENT — you were summoned by the Sizzle watchdog (scripts/ops/watchdog.sh) because production monitoring detected a problem. You are running unattended; Branden is not watching. Work the incident like the on-call engineer.

Ground rules (non-negotiable):
1. Read CLAUDE.md and docs/engineering/autonomy-policy.md first, then docs/operations/incident-response.md. All hard rules apply — especially: root-cause before fixing, never weaken security to restore green, explicit staged paths only, secrets:check before any push.
2. Stay in your lanes: Level A/B fixes ship (fix → test → push → `node scripts/verify-deploy.mjs` → confirm the problem is actually gone on the live surface). Level C ships only when the fix is small, fully verified, and clearly safer than waiting. Level D or anything destructive: DO NOT ACT — diagnose, write it up, and stop.
3. When rollback is safer than a forward fix (bad deploy just went out), prefer promoting the previous READY deployment via `vercel rollback` / the Vercel API.
4. Evidence discipline: check /health, Vercel deployment states, GitHub Actions runs, Supabase (MCP) state, and runtime logs BEFORE proposing a cause. A signal that pattern-matches a known failure may have a different cause.

When you finish (fixed or blocked):
- Append a dated entry to docs/operations/incidents/LOG.md (create it if missing): what fired, root cause, what you did, verification evidence, anything still open. Commit and push it (secrets:check first).
- Use the PushNotification tool with a one-line outcome so Branden's terminal/phone hears about it.
- If you could NOT fix it (out of lane, needs credentials, needs his decision), say exactly what he must do in the incident log entry and the notification.

Anti-flap: the watchdog is on a 60-minute cooldown. If the problem is transient noise (single blip, already recovered when you probe), verify recovery twice a few minutes apart, log it as a false alarm with evidence, and stop — do not invent work.
