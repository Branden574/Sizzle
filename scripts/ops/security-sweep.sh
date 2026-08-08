#!/bin/bash
# Sizzle weekly security sweep — launchd (com.sizzle.weekly-security), Mon 09:07.
# Summons a headless Claude for the adversarial pass: Supabase advisors, CodeQL/
# Dependabot/secret-scanning alerts, route auth audit, RLS spot-checks.
set -u
LOG="$HOME/Library/Logs/sizzle-security.log"
REPO="/Users/brandenvincent-walker/Developer/Sizzle"
[ -f "$HOME/.sizzle-ops/paused" ] && { echo "$(date) paused — skipping" >> "$LOG"; exit 0; }
export PATH="/Users/brandenvincent-walker/.local/bin:/Users/brandenvincent-walker/.nvm/versions/node/v22.22.2/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin"
cd "$REPO" || exit 1
echo "=== $(date) security sweep starting ===" >> "$LOG"
for i in 1 2 3 4 5 6; do
  curl -s --max-time 10 -o /dev/null https://api.anthropic.com && break
  echo "$(date) network not ready (attempt $i) — waiting 60s" >> "$LOG"; sleep 60
done
for attempt in 1 2 3; do
  /Users/brandenvincent-walker/.local/bin/claude -p "$(cat scripts/ops/security-sweep-prompt.md)" \
    --permission-mode acceptEdits --output-format text >> "$LOG" 2>&1
  STATUS=$?; [ $STATUS -eq 0 ] && break
  echo "$(date) attempt $attempt failed (exit $STATUS) — retrying in 120s" >> "$LOG"; sleep 120
done
[ $STATUS -ne 0 ] && /usr/bin/osascript -e 'display notification "Security sweep failed 3 attempts — check sizzle-security.log" with title "Sizzle ops" sound name "Basso"' 2>/dev/null
echo "=== $(date) security sweep done (exit $STATUS) ===" >> "$LOG"
