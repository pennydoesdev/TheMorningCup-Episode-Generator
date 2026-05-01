#!/usr/bin/env bash
#
# morning-cup.sh - Command wrapper for the daily Morning Cup pipeline.
#
# Reads RUN_SECRET from ~/Documents/The Morning Cup/.env and exposes the
# whole pipeline behind named subcommands so Apple Shortcuts (or any
# launcher) can call them with a single line.
#
# Usage:
#     morning-cup.sh make    [YYYY-MM-DD]   trigger worker, wait, fetch, build
#     morning-cup.sh fetch   [YYYY-MM-DD]   pull chunks + manifest from R2
#     morning-cup.sh build   [YYYY-MM-DD]   ffmpeg-assemble final MP3 + chapters
#     morning-cup.sh status  [YYYY-MM-DD]   show the worker's run record
#     morning-cup.sh latest                 open most recent rendered episode
#     morning-cup.sh open    [YYYY-MM-DD]   open a specific episode
#
# DATE defaults to today in America/New_York.
#

set -euo pipefail

ROOT="$HOME/Documents/The Morning Cup"
SCRIPTS="$ROOT/Scripts"
EPISODES="$ROOT/Episodes"

# Apple Shortcuts' Run Shell Script doesn't load your interactive shell's
# PATH. Add the common locations for tools we need (ffmpeg, wrangler).
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

# --- secret/env loading ------------------------------------------------------

if [ -z "${RUN_SECRET:-}" ] && [ -f "$ROOT/.env" ]; then
  # shellcheck disable=SC1091
  set -o allexport
  source "$ROOT/.env"
  set +o allexport
fi

WORKER_URL="${WORKER_URL:-https://themorningcupgenerator.itsmiarosemathews.workers.dev}"

# --- helpers -----------------------------------------------------------------

today_iso() {
  TZ=America/New_York date +%Y-%m-%d
}

require_secret() {
  if [ -z "${RUN_SECRET:-}" ]; then
    echo "Error: RUN_SECRET not set." >&2
    echo "Add it to $ROOT/.env:" >&2
    echo '  echo "RUN_SECRET=\"<your-secret>\"" > "$HOME/Documents/The Morning Cup/.env"' >&2
    echo '  chmod 600 "$HOME/Documents/The Morning Cup/.env"' >&2
    exit 2
  fi
}

# --- subcommands -------------------------------------------------------------

cmd_make() {
  local DATE="${1:-$(today_iso)}"
  require_secret
  echo "→ Triggering worker run for $DATE…"
  RESPONSE=$(curl -sS --max-time 1500 -X POST \
    -H "Authorization: Bearer $RUN_SECRET" \
    "$WORKER_URL/run?date=$DATE&force=true")
  STATUS=$(echo "$RESPONSE" | python3 -c \
    "import json,sys; r=json.load(sys.stdin).get('record',{}); print(r.get('status','unknown'))")

  if [ "$STATUS" != "completed" ]; then
    echo "Worker run did not complete cleanly. status=$STATUS" >&2
    echo "$RESPONSE" | python3 -m json.tool >&2
    exit 1
  fi

  echo "→ Run complete. Fetching chunks…"
  cmd_fetch "$DATE"
  echo "→ Building final MP3…"
  cmd_build "$DATE"
  echo ""
  echo "✓ Done."
  echo "  $EPISODES/The Morning Cup - $DATE.mp3"
}

cmd_fetch() {
  local DATE="${1:-$(today_iso)}"
  "$SCRIPTS/fetch-chunks.sh" "$DATE"
}

cmd_build() {
  local DATE="${1:-$(today_iso)}"
  "$SCRIPTS/build-episode.sh" "$DATE"
}

cmd_status() {
  local DATE="${1:-$(today_iso)}"
  require_secret
  curl -sS -H "Authorization: Bearer $RUN_SECRET" \
    "$WORKER_URL/status?date=$DATE" | python3 -m json.tool
}

cmd_latest() {
  local LATEST
  LATEST=$(ls -t "$EPISODES"/*.mp3 2>/dev/null | head -1 || true)
  if [ -z "$LATEST" ]; then
    echo "No episodes found in $EPISODES" >&2
    exit 1
  fi
  echo "Opening: $LATEST"
  open "$LATEST"
}

cmd_open() {
  local DATE="${1:-$(today_iso)}"
  local FILE="$EPISODES/The Morning Cup - $DATE.mp3"
  if [ ! -f "$FILE" ]; then
    echo "No rendered episode for $DATE at $FILE" >&2
    exit 1
  fi
  echo "Opening: $FILE"
  open "$FILE"
}

# --- dispatch ----------------------------------------------------------------

case "${1:-}" in
  make)   shift; cmd_make   "${1:-}" ;;
  fetch)  shift; cmd_fetch  "${1:-}" ;;
  build)  shift; cmd_build  "${1:-}" ;;
  status) shift; cmd_status "${1:-}" ;;
  latest) cmd_latest ;;
  open)   shift; cmd_open   "${1:-}" ;;
  *)
    echo "Usage: $0 {make|fetch|build|status|latest|open} [YYYY-MM-DD]" >&2
    exit 2
    ;;
esac
