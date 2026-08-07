# 24/7 Automation — how Claude gets summoned

Verified working 2026-08-06 (full chain tested: forced failure → summon → response).

## Architecture

**Detection is free; tokens are only spent when something is wrong.**

```
launchd (this Mac, survives reboots)
├── com.sizzle.watchdog        every 5 min → scripts/ops/watchdog.sh
│     probes: API /health (honest 503s) · getsizzle.app · latest CI run on main
│     on anomaly: macOS notification + SUMMONS headless Claude
│     (scripts/ops/incident-prompt.md) with full local powers —
│     git/gh/vercel/capgo/MCP — 60-min cooldown per incident
└── com.sizzle.daily-sweep     daily 08:13 → scripts/ops/daily-sweep.sh
      SUMMONS Claude for the maintenance pass (scripts/ops/sweep-prompt.md):
      health, CI history, Renovate PRs, npm audit, stuck DB state, debt drift
```

Plus a **cloud routine** (claude.ai — see below) as backup triage when the Mac
is off, and CI/branch-protection/Renovate enforcing quality with nobody around.

## Summoned-session boundaries

- Permissions come from `.claude/settings.json` (committed): ops commands
  allowed; force-push/reset/clean/rm -rf and reading `.env*`/`.mcp.json`
  **denied**. `--permission-mode acceptEdits` — anything not allowlisted stalls
  rather than runs.
- Autonomy lanes per `docs/engineering/autonomy-policy.md`: A/B fixes ship with
  verification; C only when clearly safer than waiting; **D never** (credentials,
  App Store, destructive DB, payment config). Migrations are deliberately NOT
  possible headless (apply_migration not allowlisted) — they wait for an
  attended session.
- Every incident/sweep ends with an entry in `docs/operations/incidents/LOG.md`
  (committed) + a PushNotification.

## Controls

```bash
touch ~/.sizzle-ops/paused      # pause ALL automation (watchdog + sweep)
rm ~/.sizzle-ops/paused         # resume
tail -f ~/Library/Logs/sizzle-watchdog.log   # watch the watchdog
tail -f ~/Library/Logs/sizzle-sweep.log      # read sweep transcripts
launchctl bootout gui/$(id -u)/com.sizzle.watchdog     # uninstall
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.sizzle.watchdog.plist  # reinstall
```

Anti-flap: one summon per incident per 60 min (cooldown file, cleared
automatically when probes go green). Watchdog skips silently while paused.

## Requirements & limits

- The Mac must be awake for launchd to fire (System Settings → prevent sleep
  while on power, or `caffeinate`). When it's asleep, the cloud routine and an
  external uptime monitor are the safety net.
- Summons cost tokens only when fired: rare incidents + one sweep/day.
- launchd plists live in `~/Library/LaunchAgents/` (machine-local); the scripts
  and prompts are committed in `scripts/ops/` so any machine can reinstall.
- Native binaries, credentials, App Store submissions remain Branden-only; a
  summoned session that hits such a wall documents it and notifies instead.
