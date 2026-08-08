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

# The 08:13 slot can race the Mac's network coming up after sleep (first firing
# failed with ConnectionRefused before any work happened). Wait for real
# connectivity, then retry the summon up to 3x with backoff.
for i in 1 2 3 4 5 6; do
  curl -s --max-time 10 -o /dev/null https://api.anthropic.com && break
  echo "$(date) network not ready (attempt $i) — waiting 60s" >> "$LOG"
  sleep 60
done

for attempt in 1 2 3; do
  /Users/brandenvincent-walker/.local/bin/claude -p "$(cat scripts/ops/sweep-prompt.md)" \
    --permission-mode acceptEdits \
    --output-format text >> "$LOG" 2>&1
  STATUS=$?
  [ $STATUS -eq 0 ] && break
  echo "$(date) sweep attempt $attempt failed (exit $STATUS) — retrying in 120s" >> "$LOG"
  sleep 120
done
if [ $STATUS -ne 0 ]; then
  /usr/bin/osascript -e 'display notification "Daily sweep failed 3 attempts — check sizzle-sweep.log" with title "Sizzle ops" sound name "Basso"' 2>/dev/null
  echo "$(date) ALERT: sweep failed all attempts" >> "$LOG"
fi
echo "=== $(date) daily sweep done (exit $STATUS) ===" >> "$LOG"
