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
#     monitor [DATE]        live dashboard — auto-exits when completed or failed
#     status [DATE]         one-shot JSON status snapshot
#     fetch [DATE]          R2 chunks + manifest only
#     build [DATE]          ffmpeg assembly only (assumes chunks are local)
#     transcribe [DATE]     Whisper transcript -> .vtt alongside the MP3
#     latest                open the most-recently-rendered MP3
#     open [DATE]           open a specific date's MP3
#
# Flags:
#     --dry-run             print what would happen, don't execute
#     --skip-preflight      skip dependency checks (not recommended)
#     --no-color            disable ANSI colors
#     --force               re-generate even if today's episode is already completed
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
FORCE=0
ARGS=()

for arg in "$@"; do
  case "$arg" in
    --dry-run)        DRY_RUN=1 ;;
    --skip-preflight) SKIP_PREFLIGHT=1 ;;
    --no-color)       USE_COLOR=0 ;;
    --force)          FORCE=1 ;;
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
  if [ -f "$ENV_FILE" ]; then
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
    "Spark.mp3"
    "Coffee Pour.wav"
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
  for s in write-chapters.py transcribe-episode.py; do
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

  if [ "$STATUS" = "absent" ] || [ "$STATUS" = "unknown" ] || [ "$STATUS" = "failed" ] || [ "$FORCE" = "1" ]; then
    step "step 1b: triggering /run (force=true)..."
    worker_run "$DATE" >/dev/null || die "/run failed (network or auth error)"
    sleep 3
    STATUS=$(worker_status "$DATE" | parse_status)
    log "post-trigger status: $STATUS"
  fi

  if [ "$STATUS" != "completed" ]; then
    step "step 2/4: polling /status every 20s (max 30 min)..."
    log "  tip: open a second terminal and run 'morning-cup.sh monitor' for a live dashboard"
    local DEADLINE=$(( $(date +%s) + 1800 ))
    local STAGE_LABELS="pending=queued  generating=writing-script  validating=checking  tts=rendering-audio  completed=done"
    while [ "$STATUS" != "completed" ] && [ "$STATUS" != "failed" ]; do
      if [ "$(date +%s)" -ge "$DEADLINE" ]; then
        die "timed out after 30 minutes. Last status: $STATUS"
      fi
      sleep 20
      STATUS=$(worker_status "$DATE" | parse_status)
      local LABEL
      case "$STATUS" in
        pending)    LABEL="queued, waiting to start" ;;
        generating) LABEL="OpenAI writing script..." ;;
        validating) LABEL="checking word count + structure..." ;;
        tts)        LABEL="ElevenLabs rendering chunks..." ;;
        completed)  LABEL="done!" ;;
        failed)     LABEL="FAILED" ;;
        *)          LABEL="$STATUS" ;;
      esac
      printf "[mc]   %s  %-12s  %s\n" "$(date +%H:%M:%S)" "$STATUS" "$LABEL"
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

  # Auto-transcription: runs only if OPENAI_API_KEY is available.
  echo ""
  if [ -n "${OPENAI_API_KEY:-}" ]; then
    step "step 5 (bonus): generating Whisper transcript..."
    python3 "$SCRIPT_DIR/transcribe-episode.py" "$DATE" || \
      warn "transcription failed — run 'morning-cup.sh transcribe $DATE' to retry"
  else
    log "  transcript: skipped (add OPENAI_API_KEY to $ENV_FILE to enable auto-transcription)"
  fi

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

cmd_monitor() {
  load_env
  [ -n "${RUN_SECRET:-}" ] || die "RUN_SECRET not set."
  local DATE
  DATE="$(resolve_date "${1:-}")"

  local TMPFILE
  TMPFILE=$(mktemp /tmp/mc-status.XXXX)
  trap "rm -f '$TMPFILE'" EXIT INT TERM

  local START_WALL
  START_WALL=$(date +%s)

  while true; do
    # Fetch status into temp file
    curl -sS --max-time 30 \
      -H "Authorization: Bearer $RUN_SECRET" \
      "$WORKER_URL/status?date=$DATE" > "$TMPFILE" 2>/dev/null \
      || printf '{}' > "$TMPFILE"

    local NOW ELAPSED MINS SECS
    NOW=$(date +%s)
    ELAPSED=$(( NOW - START_WALL ))
    MINS=$(( ELAPSED / 60 ))
    SECS=$(( ELAPSED % 60 ))

    clear
    printf "${C_BOLD}  The Morning Cup — Episode Monitor${C_RESET}\n"
    printf "  %-10s %s\n" "date:"    "$DATE"
    printf "  %-10s %02d:%02d\n\n"  "watching:" "$MINS" "$SECS"

    python3 - "$TMPFILE" "$C_OK" "$C_ERR" "$C_DIM" "$C_RESET" <<'PYEOF'
import json, sys
tmpfile, C_OK, C_ERR, C_DIM, C_RESET = sys.argv[1:]

STAGE_ORDER = ['pending','generating','validating','tts','completed']
STAGE_LABEL = {
  'pending':    'Pending      — queued, about to start',
  'generating': 'Generating   — OpenAI writing the script...',
  'validating': 'Validating   — checking word count + structure...',
  'tts':        'TTS          — ElevenLabs rendering MP3 chunks...',
  'completed':  'Completed',
  'failed':     'Failed',
  'absent':     'Not started yet',
  'unknown':    'Unknown',
}

try:
    with open(tmpfile) as f:
        d = json.load(f)
except Exception:
    print("  (waiting for worker to respond...)")
    sys.exit(0)

r = d.get('record')
if not r:
    print("  status:   not started yet")
    sys.exit(0)

status = r.get('status', 'unknown')
color  = C_OK if status == 'completed' else (C_ERR if status == 'failed' else '')
label  = STAGE_LABEL.get(status, status)
print(f"  status:   {color}{label}{C_RESET}")

# Progress bar for known stages
if status in STAGE_ORDER:
    idx  = STAGE_ORDER.index(status)
    bar  = ''.join(['[+] ' if i <= idx else '[ ] ' for i in range(len(STAGE_ORDER))])
    labs = ' '.join([s[:4].upper() for s in STAGE_ORDER])
    print(f"\n  {C_DIM}{labs}{C_RESET}")
    print(f"  {bar}\n")

for key, label in [
    ('started_at',                'started: '),
    ('updated_at',                'updated: '),
]:
    if r.get(key):
        print(f"  {label}{r[key]}")

if r.get('word_count') and int(r.get('word_count', 0)) > 0:
    print(f"  words:    {r['word_count']}")
if r.get('estimated_runtime_minutes') and float(r.get('estimated_runtime_minutes', 0)) > 0:
    rt = float(r['estimated_runtime_minutes'])
    m, s = int(rt), int((rt % 1) * 60)
    print(f"  runtime:  ~{m}m {s:02d}s")
if r.get('chunk_count') and int(r.get('chunk_count', 0)) > 0:
    print(f"  chunks:   {r['chunk_count']}")
if r.get('error'):
    print(f"\n  {C_ERR}error:{C_RESET}    {r['error']}")
PYEOF

    printf "\n  ${C_DIM}refreshing every 15s — Ctrl+C to stop${C_RESET}\n"

    # Check terminal status
    local STATUS
    STATUS=$(python3 -c "
import json, sys
try:
    with open('$(echo "$TMPFILE" | sed "s/'/'\\\\''/g")') as f:
        d = json.load(f)
    r = d.get('record')
    print(r.get('status','unknown') if r else 'absent')
except:
    print('unknown')
")

    if [ "$STATUS" = "completed" ]; then
      printf "\n  ${C_OK}Done!${C_RESET} Run this to build the MP3:\n"
      printf "  morning-cup.sh build %s\n\n" "$DATE"
      break
    elif [ "$STATUS" = "failed" ]; then
      printf "\n  ${C_ERR}Episode failed.${C_RESET} Re-run with:\n"
      printf "  morning-cup.sh make --force %s\n\n" "$DATE"
      break
    fi

    sleep 15
  done
  rm -f "$TMPFILE"
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

cmd_transcribe() {
  local DATE
  DATE="$(resolve_date "${1:-}")"
  load_env
  if ! command -v python3 >/dev/null 2>&1; then
    die "python3 not found"
  fi
  python3 "$SCRIPT_DIR/transcribe-episode.py" "$DATE"
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
  preflight)  shift; cmd_preflight ;;
  make)       shift; cmd_make      "${1:-}" ;;
  monitor)    shift; cmd_monitor   "${1:-}" ;;
  status)     shift; cmd_status    "${1:-}" ;;
  fetch)      shift; cmd_fetch     "${1:-}" ;;
  build)      shift; cmd_build     "${1:-}" ;;
  transcribe) shift; cmd_transcribe "${1:-}" ;;
  latest)     cmd_latest ;;
  open)       shift; cmd_open      "${1:-}" ;;
  -h|--help|"") usage ;;
  *) printf "[mc] unknown subcommand: %s\n\n" "$1" >&2; usage ;;
esac
