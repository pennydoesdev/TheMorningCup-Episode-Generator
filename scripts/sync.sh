#!/usr/bin/env bash
# sync.sh -- startup sync for The Morning Cup pipeline
#
# Checks for git updates, runs npm install if needed, verifies wrangler auth,
# and optionally pings the worker's /health endpoint.
#
# Add to your shell profile to run automatically:
#   macOS/Linux (bash): echo 'cd ~/Documents/"The Morning Cup"/Generator && bash scripts/sync.sh && cd -' >> ~/.bashrc
#   macOS (zsh):        echo 'cd ~/Documents/"The Morning Cup"/Generator && bash scripts/sync.sh && cd -' >> ~/.zshrc
#
# Or run manually: ./scripts/sync.sh

set -eo pipefail

# -- color helpers -------------------------------------------------------------

if [ -t 1 ]; then
  C_OK=$'\033[0;32m'
  C_WARN=$'\033[0;33m'
  C_ERR=$'\033[0;31m'
  C_DIM=$'\033[0;90m'
  C_BOLD=$'\033[1m'
  C_RESET=$'\033[0m'
else
  C_OK="" C_WARN="" C_ERR="" C_DIM="" C_BOLD="" C_RESET=""
fi

TAG="[sync]"

ok()   { printf "%s ${C_OK}OK${C_RESET}  %s\n"   "$TAG" "$*"; }
warn() { printf "%s ${C_WARN}!!${C_RESET}  %s\n" "$TAG" "$*" >&2; }
info() { printf "%s ${C_DIM}..${C_RESET}  %s\n"  "$TAG" "$*"; }
die()  { printf "%s ${C_ERR}FAIL${C_RESET}  %s\n" "$TAG" "$*" >&2; exit 1; }

# -- locate ourselves ----------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$HOME/Documents/The Morning Cup/.env"

# -- 1. verify we're in a git repo ---------------------------------------------

if ! git -C "$REPO_ROOT" rev-parse --git-dir >/dev/null 2>&1; then
  warn "Not inside a git repository ($REPO_ROOT). Skipping sync."
  exit 0
fi

cd "$REPO_ROOT"

# -- 2. fetch from origin (quiet, non-blocking) --------------------------------

info "Fetching from origin..."
FETCH_FAILED=0
if ! git fetch origin --quiet 2>/dev/null; then
  warn "git fetch failed (no network?). Running offline."
  FETCH_FAILED=1
fi

# -- 3. count commits behind ---------------------------------------------------

CURRENT_BRANCH="$(git branch --show-current 2>/dev/null || echo "main")"
REMOTE_REF="origin/${CURRENT_BRANCH}"

COMMITS_BEHIND=0
if [ "$FETCH_FAILED" = "0" ] && git rev-parse --verify "$REMOTE_REF" >/dev/null 2>&1; then
  COMMITS_BEHIND="$(git rev-list "HEAD..${REMOTE_REF}" --count 2>/dev/null || echo 0)"
fi

# -- 4. pull if behind ---------------------------------------------------------

PULLED=0
if [ "$COMMITS_BEHIND" -gt 0 ]; then
  info "Behind by $COMMITS_BEHIND commit(s) -- pulling..."

  # Record package.json hash before pull
  PKG_HASH_BEFORE=""
  if [ -f package.json ]; then
    PKG_HASH_BEFORE="$(git show HEAD:package.json 2>/dev/null | md5sum 2>/dev/null | cut -d' ' -f1 || true)"
  fi

  if git pull --quiet; then
    PULLED="$COMMITS_BEHIND"
  else
    warn "git pull failed. Local changes may conflict."
    PULLED=0
  fi

  # Re-run npm install only if package.json changed
  if [ -f package.json ] && [ -n "$PKG_HASH_BEFORE" ]; then
    PKG_HASH_AFTER="$(md5sum package.json 2>/dev/null | cut -d' ' -f1 || true)"
    if [ "$PKG_HASH_BEFORE" != "$PKG_HASH_AFTER" ]; then
      info "package.json changed -- running npm install..."
      npm install --quiet && ok "npm install complete"
    fi
  fi
fi

# -- 5. check wrangler auth ----------------------------------------------------

WRANGLER_OK=0
WRANGLER_USER=""
WRANGLER_OUT=""

if command -v wrangler >/dev/null 2>&1; then
  WRANGLER_OUT="$(wrangler whoami 2>/dev/null || true)"
elif command -v npx >/dev/null 2>&1; then
  WRANGLER_OUT="$(npx wrangler whoami 2>/dev/null || true)"
fi

if echo "$WRANGLER_OUT" | grep -qiE "logged in|@"; then
  WRANGLER_OK=1
  WRANGLER_USER="$(echo "$WRANGLER_OUT" | grep -oE '[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}' | head -1 || true)"
fi

# -- 6. optional: /health check on the worker ----------------------------------

WORKER_HEALTH=""
RUN_SECRET=""

# Load RUN_SECRET from .env using python3 so we avoid all quoting hazards
if [ -f "$ENV_FILE" ] && command -v python3 >/dev/null 2>&1; then
  RUN_SECRET="$(python3 - "$ENV_FILE" <<'PYEOF'
import sys, re
env_file = sys.argv[1]
try:
    for line in open(env_file).read().splitlines():
        m = re.match(r'^RUN_SECRET\s*=\s*(.+)', line.strip())
        if m:
            val = m.group(1).strip().strip('"').strip("'")
            if val:
                print(val)
                break
except Exception:
    pass
PYEOF
)"
fi

# Allow env-variable override
if [ -z "$RUN_SECRET" ]; then
  RUN_SECRET="${RUN_SECRET_ENV:-}"
fi

if [ -n "$RUN_SECRET" ]; then
  WORKER_URL="${WORKER_URL:-https://themorningcupgenerator.itsmiarosemathews.workers.dev}"
  # Short timeout so we do not block shell startup
  HTTP_CODE="$(
    curl -sS -o /dev/null -w '%{http_code}' --max-time 5 \
      -H "Authorization: Bearer $RUN_SECRET" \
      "${WORKER_URL}/health" 2>/dev/null || echo "000"
  )"
  case "$HTTP_CODE" in
    200|204) WORKER_HEALTH="up (HTTP $HTTP_CODE)" ;;
    401)     WORKER_HEALTH="reachable - check RUN_SECRET (HTTP 401)" ;;
    000)     WORKER_HEALTH="unreachable (timeout or DNS)" ;;
    *)       WORKER_HEALTH="HTTP $HTTP_CODE" ;;
  esac
fi

# -- 7. print summary ----------------------------------------------------------

printf "\n"

if [ "$PULLED" -gt 0 ]; then
  printf "%s ${C_OK}DOWN${C_RESET}  ${C_BOLD}Pulled %d commit(s)${C_RESET} on %s\n" \
    "$TAG" "$PULLED" "$CURRENT_BRANCH"
  printf "%s ${C_WARN}HINT${C_RESET}  Deploy the worker to apply changes:\n" "$TAG"
  printf "%s      ${C_DIM}npx wrangler deploy${C_RESET}\n" "$TAG"
elif [ "$FETCH_FAILED" = "0" ]; then
  printf "%s ${C_OK}OK${C_RESET}    ${C_BOLD}Up to date${C_RESET} (%s)\n" "$TAG" "$CURRENT_BRANCH"
else
  printf "%s ${C_WARN}??${C_RESET}    ${C_BOLD}Offline -- could not fetch${C_RESET} (%s)\n" "$TAG" "$CURRENT_BRANCH"
fi

if [ "$WRANGLER_OK" = "1" ]; then
  if [ -n "$WRANGLER_USER" ]; then
    printf "%s ${C_OK}OK${C_RESET}    Cloudflare: authenticated as %s\n" "$TAG" "$WRANGLER_USER"
  else
    printf "%s ${C_OK}OK${C_RESET}    Cloudflare: authenticated\n" "$TAG"
  fi
else
  printf "%s ${C_WARN}!!${C_RESET}    Cloudflare: not authenticated -- run: wrangler login\n" "$TAG"
fi

if [ -n "$WORKER_HEALTH" ]; then
  case "$WORKER_HEALTH" in
    up*) printf "%s ${C_OK}OK${C_RESET}    Worker: %s\n" "$TAG" "$WORKER_HEALTH" ;;
    *)   printf "%s ${C_WARN}!!${C_RESET}    Worker: %s\n" "$TAG" "$WORKER_HEALTH" ;;
  esac
fi

printf "\n"
