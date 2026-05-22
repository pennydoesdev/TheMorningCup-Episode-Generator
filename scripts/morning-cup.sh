#!/usr/bin/env bash
#
# morning-cup.sh - Sure-fire daily runner for The Morning Cup pipeline.
#
# One command does everything:
#     ./scripts/morning-cup.sh make
#
# Subcommands:
#     preflight             check every dependency + asset + secret
#     make [DATE]           full pipeline: preflight -> run -> poll -> fetch -> build
#     status [DATE]         show the worker's current run record
#     fetch [DATE]          R2 chunks + manifest only
#     build [DATE]          ffmpeg assembly only (assumes chunks are local)
#     latest                open the most-recently-rendered MP3
#     open [DATE]           open a specific date's MP3
#
# Flags:
#     --dry-run             print what would happen, don't execute
#     --skip-preflight      skip dependency checks (not recommended)
#     --no-color            disable ANSI colors
#
# DATE defaults to today in America/New_York. All output is ASCII so it
# survives any terminal locale.
#
# This script is the single entry point for the daily pipeline; all other
# scripts in this directory (fetch-chunks.sh, build-episode.sh, *.py) are
# called from here. To run them directly, see their own --help text.

set -eo pipefail

# --- locations ---------------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$HOME/Documents/The Morning Cup"
EPISODES="$ROOT/Episodes"
CHUNKS_BASE="$ROOT/Chunks"
SOUNDS="$ROOT/Sounds"
ENV_FILE="$ROOT/.env"

# Apple Shortcuts-friendly PATH (so this works under Run Shell Script too).
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

# --- flags / state -----------------------------------------------------------

DRY_RUN=0
SKIP_PREFLIGHT=0
USE_COLOR=1
ARGS=()

for arg in "$@"; do
  case "$arg" in
    --dry-run)        DRY_RUN=1 ;;
    --skip-preflight) SKIP_PREFLIGHT=1 ;;
    --no-color)       USE_COLOR=0 ;;
    *)                ARGS+=("$arg") ;;
  esac
done
set -- "${ARGS[@]+"${ARGS[@]}"}"

# --- output helpers (ASCII-only) ---------------------------------------------

if [ "$USE_COLOR" = "1" ] && [ -t 1 ]; then
  C_OK=$'\033[0;32m'; C_WARN=$'\033[0;33m'; C_ERR=$'\033[0;31m'
  C_DIM=$'\033[0;90m'; C_BOLD=$'\033[1m'; C_RESET=$'\033[0m'
else
  C_OK=""; C_WARN=""; C_ERR=""; C_DIM=""; C_BOLD=""; C_RESET=""
fi

log()   { printf "[mc] %s\n" "$*"; }
ok()    { printf "  ${C_OK}PASS${C_RESET}  %s\n" "$*"; }
warn()  { printf "  ${C_WARN}WARN${C_RESET}  %s\n" "$*" >&2; }
fail()  { printf "  ${C_ERR}FAIL${C_RESET}  %s\n" "$*" >&2; }
step()  { printf "${C_BOLD}[mc] %s${C_RESET}\n" "$*"; }
hint()  { printf "        ${C_DIM}%s${C_RESET}\n" "$*"; }
die()   { fail "$*"; exit 1; }

# --- env loading -------------------------------------------------------------

load_env() {
  if [ -z "${RUN_SECRET:-}" ] && [ -f "$ENV_FILE" ]; then
    set -o allexport
    # shellcheck disable=SC1090
    source "$ENV_FILE"
    set +o allexport
  fi
  WORKER_URL="${WORKER_URL:-https://themorningcupgenerator.itsmiarosemathews.workers.dev}"
}

today_iso() {
  TZ=America/New_York date +%Y-%m-%d
}

resolve_date() {
  local d="${1:-}"
  if [ -z "$d" ]; then
    d="$(today_iso)"
  fi
  if ! [[ "$d" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
    die "Invalid date '$d' (expected YYYY-MM-DD)."
  fi
  echo "$d"
}

# --- preflight ---------------------------------------------------------------

preflight() {
  step "preflight: checking dependencies, secrets, and assets..."
  local fails=0

  # Binaries
  for bin in curl python3 ffmpeg ffprobe; do
    if command -v "$bin" >/dev/null 2>&1; then
      ok "$bin: $(command -v "$bin")"
    else
      fail "$bin not found"
      case "$bin" in
        ffmpeg|ffprobe) hint "fix: brew install ffmpeg" ;;
        python3)        hint "fix: install Xcode CLT or brew install python" ;;
        curl)           hint "fix: should be on every Mac; check \$PATH" ;;
      esac
      fails=$((fails+1))
    fi
  done

  # Wrangler (via npx if not installed globally)
  if command -v wrangler >/dev/null 2>&1; then
    ok "wrangler: $(command -v wrangler)"
    WRANGLER_CMD="wrangler"
  elif command -v npx >/dev/null 2>&1; then
    ok "wrangler: via npx (npx wrangler)"
    WRANGLER_CMD="npx wrangler"
  else
    fail "wrangler not found and npx unavailable"
    hint "fix: cd into the repo and run 'npm install', then retry"
    fails=$((fails+1))
    WRANGLER_CMD=""
  fi

  # Wrangler auth
  if [ -n "$WRANGLER_CMD" ]; then
    if $WRANGLER_CMD whoami >/dev/null 2>&1; then
      ok "wrangler authenticated"
    else
      fail "wrangler not authenticated"
      hint "fix: run '$WRANGLER_CMD login'"
      fails=$((fails+1))
    fi
  fi

  # Python modules (only the ones the local pipeline needs)
  for mod in mutagen requests; do
    if python3 -c "import $mod" 2>/dev/null; then
      ok "python: $mod"
    else
      fail "python module missing: $mod"
      hint "fix: python3 -m pip install --user --break-system-packages $mod"
      fails=$((fails+1))
    fi
  done

  # Secret
  load_env
  if [ -n "${RUN_SECRET:-}" ]; then
    ok "RUN_SECRET present (length=${#RUN_SECRET})"
  else
    fail "RUN_SECRET not set"
    hint "fix: echo 'RUN_SECRET=\"<value>\"' >> '$ENV_FILE'"
    hint "     or: export RUN_SECRET=\"<value>\""
    fails=$((fails+1))
  fi

  # Worker reachability
  if [ -n "${RUN_SECRET:-}" ]; then
    local probe
    probe=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 10 \
      -H "Authorization: Bearer $RUN_SECRET" \
      "$WORKER_URL/health" 2>/dev/null || echo "000")
    if [ "$probe" = "200" ] || [ "$probe" = "204" ] || [ "$probe" = "401" ]; then
      ok "worker reachable: $WORKER_URL (HTTP $probe)"
    else
      fail "worker unreachable or returning $probe"
      hint "url: $WORKER_URL/health"
      fails=$((fails+1))
    fi
  fi

  # Sound assets (build-episode.sh requires these)
  local missing_sounds=0
  local required_sounds=(
    "The Morning Cup - Song.wav"
    "Coffee Pour.wav"
    "Cream or sugar, hon?.mp3"
    "Topic Transition.mp3"
    "The Morning Cup - Thank You.wav"
  )
  for s in "${required_sounds[@]}"; do
    if [ -f "$SOUNDS/$s" ]; then
      ok "sound: $s"
    else
      fail "sound missing: $SOUNDS/$s"
      missing_sounds=$((missing_sounds+1))
      fails=$((fails+1))
    fi
  done
  if [ -f "$SOUNDS/intro-sting.wav" ]; then
    ok "sound: intro-sting.wav (optional)"
  else
    warn "sound: intro-sting.wav (optional, missing)"
  fi

  # Sister scripts
  for s in fetch-chunks.sh build-episode.sh; do
    if [ -x "$SCRIPT_DIR/$s" ]; then
      ok "script: $s"
    elif [ -f "$SCRIPT_DIR/$s" ]; then
      ok "script: $s (chmod +x will run on first use)"
      chmod +x "$SCRIPT_DIR/$s" 2>/dev/null || true
    else
      fail "missing: $SCRIPT_DIR/$s"
      fails=$((fails+1))
    fi
  done
  for s in write-chapters.py; do
    if [ -f "$SCRIPT_DIR/$s" ]; then
      ok "script: $s"
    else
      warn "script: $s (optional, missing)"
    fi
  done

  # Output dirs
  for d in "$EPISODES" "$CHUNKS_BASE"; do
    if [ -d "$d" ]; then
      ok "dir: $d"
    else
      mkdir -p "$d"
      ok "dir: $d (created)"
    fi
  done

  echo ""
  if [ "$fails" -gt 0 ]; then
    die "preflight failed with $fails error(s) above. Fix and re-run."
  fi
  step "preflight: all checks passed."
}

# --- worker state ------------------------------------------------------------

worker_status() {
  local DATE="$1"
  curl -sS --max-time 30 \
    -H "Authorization: Bearer $RUN_SECRET" \
    "$WORKER_URL/status?date=$DATE"
}

# Returns "completed" | "failed" | "pending" | "generating" | "validating" |
# "tts" | "absent" | "unknown" on stdout.
parse_status() {
  python3 -c "
import json, sys
try:
    d = json.loads(sys.stdin.read())
except Exception:
    print('unknown'); sys.exit(0)
if not d:
    print('unknown'); sys.exit(0)
record = d.get('record')
if not record:
    print('absent'); sys.exit(0)
print(record.get('status', 'unknown'))
"
}

worker_run() {
  local DATE="$1"
  curl -sS --max-time 60 -X POST \
    -H "Authorization: Bearer $RUN_SECRET" \
    "$WORKER_URL/run?date=$DATE&force=true"
}

# --- subcommands -------------------------------------------------------------

cmd_preflight() {
  preflight
}

cmd_make() {
  local DATE
  DATE="$(resolve_date "${1:-}")"

  if [ "$SKIP_PREFLIGHT" != "1" ]; then
    preflight
    echo ""
  fi
  load_env
  [ -n "${RUN_SECRET:-}" ] || die "RUN_SECRET not set."

  step "make: episode date=$DATE worker=$WORKER_URL"
  if [ "$DRY_RUN" = "1" ]; then
    log "(dry-run) would: GET /status?date=$DATE"
    log "(dry-run) would: poll until completed"
    log "(dry-run) would: fetch-chunks.sh $DATE"
    log "(dry-run) would: build-episode.sh $DATE"
    return 0
  fi

  step "step 1/4: querying worker status..."
  local STATUS
  STATUS=$(worker_status "$DATE" | parse_status)
  log "current status: $STATUS"

  if [ "$STATUS" = "absent" ] || [ "$STATUS" = "unknown" ] || [ "$STATUS" = "failed" ]; then
    step "step 1b: triggering /run (force=true)..."
    worker_run "$DATE" >/dev/null || die "/run failed (network or auth error)"
    sleep 3
    STATUS=$(worker_status "$DATE" | parse_status)
    log "post-trigger status: $STATUS"
  fi

  if [ "$STATUS" != "completed" ]; then
    step "step 2/4: polling /status every 20s (max 30 min)..."
    local DEADLINE=$(( $(date +%s) + 1800 ))
    while [ "$STATUS" != "completed" ] && [ "$STATUS" != "failed" ]; do
      if [ "$(date +%s)" -ge "$DEADLINE" ]; then
        die "timed out after 30 minutes. Last status: $STATUS"
      fi
      sleep 20
      STATUS=$(worker_status "$DATE" | parse_status)
      printf "[mc]   %s status=%s\n" "$(date +%H:%M:%S)" "$STATUS"
    done
  fi

  if [ "$STATUS" = "failed" ]; then
    log "worker reports FAILED. Full record:"
    worker_status "$DATE" | python3 -m json.tool >&2 || true
    die "worker run failed."
  fi

  step "step 3/4: fetching chunks from R2..."
  "$SCRIPT_DIR/fetch-chunks.sh" "$DATE"

  step "step 4/4: building final MP3..."
  "$SCRIPT_DIR/build-episode.sh" "$DATE"

  echo ""
  step "make: done."
  log "  $EPISODES/The Morning Cup - $DATE.mp3"
}

cmd_status() {
  load_env
  [ -n "${RUN_SECRET:-}" ] || die "RUN_SECRET not set."
  local DATE
  DATE="$(resolve_date "${1:-}")"
  worker_status "$DATE" | python3 -m json.tool
}

cmd_fetch() {
  local DATE
  DATE="$(resolve_date "${1:-}")"
  "$SCRIPT_DIR/fetch-chunks.sh" "$DATE"
}

cmd_build() {
  local DATE
  DATE="$(resolve_date "${1:-}")"
  "$SCRIPT_DIR/build-episode.sh" "$DATE"
}

cmd_latest() {
  local LATEST
  LATEST=$(ls -t "$EPISODES"/*.mp3 2>/dev/null | head -1 || true)
  [ -n "$LATEST" ] || die "No episodes found in $EPISODES"
  log "opening: $LATEST"
  open "$LATEST"
}

cmd_open() {
  local DATE FILE
  DATE="$(resolve_date "${1:-}")"
  FILE="$EPISODES/The Morning Cup - $DATE.mp3"
  [ -f "$FILE" ] || die "No rendered episode for $DATE at $FILE"
  log "opening: $FILE"
  open "$FILE"
}

usage() {
  awk '/^#/ && NR>1 {sub(/^# ?/, ""); print; next} NR>1 {exit}' "$0" >&2
  exit 2
}

# --- dispatch ----------------------------------------------------------------

case "${1:-}" in
  preflight) shift; cmd_preflight ;;
  make)      shift; cmd_make   "${1:-}" ;;
  status)    shift; cmd_status "${1:-}" ;;
  fetch)     shift; cmd_fetch  "${1:-}" ;;
  build)     shift; cmd_build  "${1:-}" ;;
  latest)    cmd_latest ;;
  open)      shift; cmd_open   "${1:-}" ;;
  -h|--help|"") usage ;;
  *) printf "[mc] unknown subcommand: %s\n\n" "$1" >&2; usage ;;
esac
