#!/bin/bash
# Sizzle production watchdog — free detection, paid response.
#
# Runs every 5 minutes via launchd (com.sizzle.watchdog). Probes production; on
# an anomaly it SUMMONS a headless Claude Code session (full local powers: git,
# gh, vercel, capgo, MCP) to investigate and fix within its autonomy lanes.
# Detection costs nothing; tokens are only spent when something is wrong.
#
# Kill switch:  touch ~/.sizzle-ops/paused        (resume: rm the file)
# Cooldown:     one summon per incident per 60 min (~/.sizzle-ops/cooldown)
# Log:          ~/Library/Logs/sizzle-watchdog.log
set -u
OPS_DIR="$HOME/.sizzle-ops"
LOG="$HOME/Library/Logs/sizzle-watchdog.log"
REPO="/Users/brandenvincent-walker/Developer/Sizzle"
API_HEALTH="${SIZZLE_WATCHDOG_TEST_URL:-https://sizzle-chi.vercel.app/health}"
WEB_URL="https://getsizzle.app"
COOLDOWN_MIN=60
mkdir -p "$OPS_DIR"

ts() { date "+%Y-%m-%d %H:%M:%S"; }
log() { echo "$(ts) $*" >> "$LOG"; }

[ -f "$OPS_DIR/paused" ] && { log "paused — skipping"; exit 0; }

PROBLEMS=()

# --- Probe 1: API /health (honest endpoint — 503 = degraded, includes reason) ---
API_BODY=$(curl -sS --max-time 25 -w $'\n%{http_code}' "$API_HEALTH" 2>&1)
API_CODE=$(echo "$API_BODY" | tail -1)
API_JSON=$(echo "$API_BODY" | sed '$d')
if [ "$API_CODE" = "200" ]; then
  : # healthy
elif [ "$API_CODE" = "503" ]; then
  REASON=$(echo "$API_JSON" | /usr/bin/python3 -c "import sys,json;print(','.join(json.load(sys.stdin).get('problems',[])))" 2>/dev/null || echo "unparseable")
  PROBLEMS+=("API degraded (503): $REASON")
else
  PROBLEMS+=("API unreachable (HTTP $API_CODE)")
fi

# --- Probe 2: frontend ---
WEB_CODE=$(curl -sS -o /dev/null --max-time 25 -w "%{http_code}" "$WEB_URL" 2>/dev/null || echo "000")
case "$WEB_CODE" in 2*|3*) : ;; *) PROBLEMS+=("Frontend $WEB_URL HTTP $WEB_CODE") ;; esac

# --- Probe 3: latest completed CI run on main ---
CI=$(cd "$REPO" && /opt/homebrew/bin/gh run list --branch main --status completed --limit 1 \
  --json conclusion,displayTitle --jq '.[0] | .conclusion + "|" + .displayTitle' 2>/dev/null || echo "")
if [ -n "$CI" ]; then
  CONC="${CI%%|*}"
  [ "$CONC" = "failure" ] && PROBLEMS+=("CI failing on main: ${CI#*|}")
fi

if [ ${#PROBLEMS[@]} -eq 0 ]; then
  log "ok (api=$API_CODE web=$WEB_CODE ci=${CI%%|*})"
  rm -f "$OPS_DIR/cooldown"
  exit 0
fi

REASON_TEXT=$(printf '%s; ' "${PROBLEMS[@]}")
log "INCIDENT: $REASON_TEXT"

# --- Cooldown: don't re-summon every 5 min during one incident ---
if [ -f "$OPS_DIR/cooldown" ]; then
  AGE_MIN=$(( ( $(date +%s) - $(stat -f %m "$OPS_DIR/cooldown") ) / 60 ))
  if [ "$AGE_MIN" -lt "$COOLDOWN_MIN" ]; then
    log "in cooldown (${AGE_MIN}m/${COOLDOWN_MIN}m) — not re-summoning"
    exit 0
  fi
fi
touch "$OPS_DIR/cooldown"

# --- Alert locally (visible if he's at the Mac) ---
/usr/bin/osascript -e "display notification \"$REASON_TEXT\" with title \"Sizzle watchdog: summoning Claude\" sound name \"Basso\"" 2>/dev/null

# --- SUMMON: headless Claude with full local powers ---
PROMPT_FILE="$REPO/scripts/ops/incident-prompt.md"
PROMPT="$(cat "$PROMPT_FILE")

DETECTED PROBLEMS (from the watchdog, $(ts) local):
$REASON_TEXT

Raw /health response:
$API_JSON"
if [ "${SIZZLE_WATCHDOG_TEST_PROMPT:-}" != "" ]; then PROMPT="$SIZZLE_WATCHDOG_TEST_PROMPT"; fi

log "summoning claude -p ..."
export PATH="/Users/brandenvincent-walker/.local/bin:/Users/brandenvincent-walker/.nvm/versions/node/v22.22.2/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin"
cd "$REPO" || exit 1
/Users/brandenvincent-walker/.local/bin/claude -p "$PROMPT" \
  --permission-mode acceptEdits \
  --output-format text >> "$LOG" 2>&1
STATUS=$?
log "summon finished (exit $STATUS)"
exit 0
