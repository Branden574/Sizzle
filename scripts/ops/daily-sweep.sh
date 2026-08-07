#!/bin/bash
# Sizzle daily maintenance sweep — launchd (com.sizzle.daily-sweep) at 08:13.
# Summons a headless Claude for the routine engineering pass: health, CI
# history, Renovate PRs, audit, debt. Log: ~/Library/Logs/sizzle-sweep.log
set -u
LOG="$HOME/Library/Logs/sizzle-sweep.log"
REPO="/Users/brandenvincent-walker/Developer/Sizzle"
[ -f "$HOME/.sizzle-ops/paused" ] && { echo "$(date) paused — skipping" >> "$LOG"; exit 0; }
export PATH="/Users/brandenvincent-walker/.local/bin:/Users/brandenvincent-walker/.nvm/versions/node/v22.22.2/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin"
cd "$REPO" || exit 1
echo "=== $(date) daily sweep starting ===" >> "$LOG"
/Users/brandenvincent-walker/.local/bin/claude -p "$(cat scripts/ops/sweep-prompt.md)" \
  --permission-mode acceptEdits \
  --output-format text >> "$LOG" 2>&1
echo "=== $(date) daily sweep done (exit $?) ===" >> "$LOG"
