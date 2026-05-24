#!/usr/bin/env bash
# install.sh — first-time setup for The Morning Cup Episode Generator
# Usage: bash install.sh [--applet] [--no-color] [--skip-deps]
#
# Supported: macOS (brew), Ubuntu/Debian (apt), CentOS/RHEL (dnf),
#            Raspberry Pi (apt), Arch Linux (pacman), Chrome OS Crostini (apt)
# Windows:   Run inside WSL2 (Ubuntu recommended)

set -eo pipefail

# ── parse flags ──────────────────────────────────────────────────────────────

RUN_APPLET=0
USE_COLOR=1
SKIP_DEPS=0

for arg in "$@"; do
  case "$arg" in
    --applet)    RUN_APPLET=1 ;;
    --no-color)  USE_COLOR=0 ;;
    --skip-deps) SKIP_DEPS=1 ;;
  esac
done

# ── color helpers ─────────────────────────────────────────────────────────────

if [ "$USE_COLOR" = "1" ] && [ -t 1 ]; then
  C_OK=$'\033[0;32m'
  C_WARN=$'\033[0;33m'
  C_ERR=$'\033[0;31m'
  C_BOLD=$'\033[1m'
  C_DIM=$'\033[0;90m'
  C_CYAN=$'\033[0;36m'
  C_RESET=$'\033[0m'
else
  C_OK="" C_WARN="" C_ERR="" C_BOLD="" C_DIM="" C_CYAN="" C_RESET=""
fi

ok()   { printf "  ${C_OK}[ OK ]${C_RESET}  %s\n"   "$*"; }
warn() { printf "  ${C_WARN}[WARN]${C_RESET}  %s\n" "$*"; }
fail() { printf "  ${C_ERR}[FAIL]${C_RESET}  %s\n"  "$*" >&2; }
step() { printf "\n${C_BOLD}${C_CYAN}──── %s${C_RESET}\n" "$*"; }
info() { printf "  ${C_DIM}%s${C_RESET}\n"           "$*"; }
die()  { fail "$*"; exit 1; }

# ── windows guard ─────────────────────────────────────────────────────────────

if [[ "$(uname -s)" == MINGW* ]] || [[ "$(uname -s)" == CYGWIN* ]] || \
   [[ "$(uname -s)" == MSYS* ]]  || [[ -n "${WINDIR:-}" ]]; then
  echo ""
  echo "  Windows requires WSL2. Please install WSL2 first and run this script inside WSL."
  echo "  Guide: https://learn.microsoft.com/en-us/windows/wsl/install"
  echo ""
  exit 1
fi

# ── detect OS ─────────────────────────────────────────────────────────────────

detect_os() {
  local uname_s
  uname_s="$(uname -s)"

  if [ "$uname_s" = "Darwin" ]; then
    OS_TYPE="macos"
    return
  fi

  if [ "$uname_s" = "Linux" ]; then
    # Check /etc/os-release first (most modern distros)
    if [ -f /etc/os-release ]; then
      # shellcheck disable=SC1091
      . /etc/os-release
      ID_LOWER="${ID:-}"
      case "$ID_LOWER" in
        raspbian) OS_TYPE="raspbian"; return ;;
        arch)     OS_TYPE="arch";     return ;;
        ubuntu|debian|linuxmint|pop)
          # Chrome OS Crostini reports itself as debian/ubuntu but has
          # a ChromeOS marker in /etc/lsb-release.
          if [ -f /etc/.cros_milestone ] || grep -qi "chrome" /etc/lsb-release 2>/dev/null; then
            OS_TYPE="chromeos"
          else
            OS_TYPE="${ID_LOWER}"
          fi
          return
          ;;
        centos|rhel|fedora|rocky|almalinux)
          OS_TYPE="centos"; return ;;
      esac
      # Fallback: check ID_LIKE
      case "${ID_LIKE:-}" in
        *debian*|*ubuntu*) OS_TYPE="ubuntu"; return ;;
        *rhel*|*centos*|*fedora*) OS_TYPE="centos"; return ;;
        *arch*) OS_TYPE="arch"; return ;;
      esac
    fi
    # Last-resort: check for ARM (likely Raspberry Pi)
    if uname -m | grep -q "arm\|aarch64"; then
      OS_TYPE="raspbian"
      return
    fi
    OS_TYPE="unknown"
    return
  fi

  OS_TYPE="unknown"
}

# ── dependency check helper ───────────────────────────────────────────────────

check_dep() {
  local name="$1"
  local hint="${2:-}"
  if command -v "$name" >/dev/null 2>&1; then
    ok "$name is installed ($(command -v "$name"))"
    return 0
  else
    warn "$name not found${hint:+ — hint: $hint}"
    return 1
  fi
}

# ── per-OS installers ─────────────────────────────────────────────────────────

install_macos() {
  step "Installing dependencies via Homebrew"

  if ! command -v brew >/dev/null 2>&1; then
    info "Homebrew not found. Installing..."
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    # Add brew to PATH for this session
    if [ -f /opt/homebrew/bin/brew ]; then
      eval "$(/opt/homebrew/bin/brew shellenv)"
    elif [ -f /usr/local/bin/brew ]; then
      eval "$(/usr/local/bin/brew shellenv)"
    fi
  else
    ok "Homebrew already installed"
  fi

  local pkgs=()
  command -v git    >/dev/null 2>&1 || pkgs+=(git)
  command -v node   >/dev/null 2>&1 || pkgs+=(node)
  command -v python3>/dev/null 2>&1 || pkgs+=(python3)
  command -v ffmpeg >/dev/null 2>&1 || pkgs+=(ffmpeg)

  if [ "${#pkgs[@]}" -gt 0 ]; then
    info "Installing: ${pkgs[*]}"
    brew install "${pkgs[@]}"
  else
    ok "git, node, python3, ffmpeg already installed"
  fi

  install_pip_packages
  install_wrangler
}

install_ubuntu() {
  step "Installing dependencies via apt"
  sudo apt-get update -qq

  local pkgs=()
  command -v git    >/dev/null 2>&1 || pkgs+=(git)
  command -v python3>/dev/null 2>&1 || pkgs+=(python3 python3-pip)
  command -v ffmpeg >/dev/null 2>&1 || pkgs+=(ffmpeg)
  command -v curl   >/dev/null 2>&1 || pkgs+=(curl)

  if [ "${#pkgs[@]}" -gt 0 ]; then
    sudo apt-get install -y "${pkgs[@]}"
  else
    ok "git, python3, ffmpeg already installed"
  fi

  # Node 20 via NodeSource if node is missing or older than v18
  if ! command -v node >/dev/null 2>&1 || \
     ! node --version 2>/dev/null | grep -qE "^v(1[89]|[2-9][0-9])"; then
    info "Installing Node.js 20 via NodeSource..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
  else
    ok "Node.js already installed ($(node --version))"
  fi

  install_pip_packages
  install_wrangler
}

install_centos() {
  step "Installing dependencies via dnf/yum"

  local PKG_MGR="dnf"
  command -v dnf >/dev/null 2>&1 || PKG_MGR="yum"

  sudo "$PKG_MGR" install -y epel-release 2>/dev/null || true

  local pkgs=()
  command -v git    >/dev/null 2>&1 || pkgs+=(git)
  command -v python3>/dev/null 2>&1 || pkgs+=(python3 python3-pip)
  command -v ffmpeg >/dev/null 2>&1 || pkgs+=(ffmpeg)
  command -v curl   >/dev/null 2>&1 || pkgs+=(curl)

  if [ "${#pkgs[@]}" -gt 0 ]; then
    sudo "$PKG_MGR" install -y "${pkgs[@]}"
  else
    ok "git, python3, ffmpeg already installed"
  fi

  if ! command -v node >/dev/null 2>&1 || \
     ! node --version 2>/dev/null | grep -qE "^v(1[89]|[2-9][0-9])"; then
    info "Installing Node.js 20 via NodeSource..."
    curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
    sudo "$PKG_MGR" install -y nodejs
  else
    ok "Node.js already installed ($(node --version))"
  fi

  install_pip_packages
  install_wrangler
}

install_arch() {
  step "Installing dependencies via pacman"
  sudo pacman -Syu --noconfirm

  local pkgs=()
  command -v git    >/dev/null 2>&1 || pkgs+=(git)
  command -v node   >/dev/null 2>&1 || pkgs+=(nodejs npm)
  command -v python3>/dev/null 2>&1 || pkgs+=(python python-pip)
  command -v ffmpeg >/dev/null 2>&1 || pkgs+=(ffmpeg)

  if [ "${#pkgs[@]}" -gt 0 ]; then
    sudo pacman -S --noconfirm "${pkgs[@]}"
  else
    ok "git, node, python3, ffmpeg already installed"
  fi

  install_pip_packages
  install_wrangler
}

install_pip_packages() {
  step "Installing Python packages (mutagen, requests, numpy)"

  local pip_cmd="pip3"
  command -v pip3  >/dev/null 2>&1 || pip_cmd="python3 -m pip"

  # --break-system-packages for PEP 668 (Debian 12+, Ubuntu 23.04+)
  local extra_flags=""
  if python3 -m pip install --help 2>&1 | grep -q "break-system-packages"; then
    extra_flags="--break-system-packages"
  fi

  for pkg in mutagen requests numpy; do
    if python3 -c "import $pkg" 2>/dev/null; then
      ok "python: $pkg already installed"
    else
      info "Installing $pkg..."
      # shellcheck disable=SC2086
      $pip_cmd install --user --quiet $extra_flags "$pkg" && ok "python: $pkg installed"
    fi
  done
}

install_wrangler() {
  step "Installing Wrangler (Cloudflare CLI)"
  if command -v wrangler >/dev/null 2>&1; then
    ok "wrangler already installed ($(wrangler --version 2>/dev/null | head -1))"
    return
  fi
  if command -v npm >/dev/null 2>&1; then
    info "Running: npm install -g wrangler"
    npm install -g wrangler
    ok "wrangler installed globally"
  else
    warn "npm not found — cannot install wrangler globally."
    info "After Node.js is installed, run: npm install -g wrangler"
  fi
}

# ── folder structure ──────────────────────────────────────────────────────────

BASE="$HOME/Documents/The Morning Cup"
GENERATOR="$BASE/Generator"
SCRIPTS_LOCAL="$BASE/Scripts"

create_folder_structure() {
  step "Creating folder structure under ~/Documents/The Morning Cup"

  local dirs=("$BASE" "$BASE/Sounds" "$BASE/Chunks" "$BASE/Episodes" "$GENERATOR" "$SCRIPTS_LOCAL")
  for d in "${dirs[@]}"; do
    if [ -d "$d" ]; then
      ok "exists: $d"
    else
      mkdir -p "$d"
      ok "created: $d"
    fi
  done
}

# ── clone or pull repo ────────────────────────────────────────────────────────

REPO_URL="https://github.com/pennydoesdev/TheMorningCup-Episode-Generator.git"

clone_or_pull() {
  step "Cloning / updating repository"

  if [ -d "$GENERATOR/.git" ]; then
    info "Repository already present at $GENERATOR — pulling latest..."
    git -C "$GENERATOR" pull --quiet && ok "git pull complete" || warn "git pull failed (continuing)"
  else
    info "Cloning into $GENERATOR..."
    git clone --quiet "$REPO_URL" "$GENERATOR"
    ok "Repository cloned to $GENERATOR"
  fi

  step "Running npm install"
  cd "$GENERATOR"
  npm install --quiet
  ok "npm install complete"
  cd - >/dev/null
}

# ── sync scripts to local Scripts/ folder ────────────────────────────────────

sync_scripts() {
  step "Syncing scripts to $SCRIPTS_LOCAL"

  if [ -d "$GENERATOR/scripts" ]; then
    cp -f "$GENERATOR/scripts/"*.sh  "$SCRIPTS_LOCAL/" 2>/dev/null && ok "*.sh scripts copied" || true
    cp -f "$GENERATOR/scripts/"*.py  "$SCRIPTS_LOCAL/" 2>/dev/null && ok "*.py scripts copied" || true
    chmod +x "$SCRIPTS_LOCAL/"*.sh   2>/dev/null || true
  else
    warn "Generator/scripts/ not found — skipping script sync"
  fi
}

# ── copy sound assets ─────────────────────────────────────────────────────────

copy_sound_assets() {
  step "Copying sound assets"

  local src=""

  # Check repo assets/sounds/ first
  if [ -d "$GENERATOR/assets/sounds" ]; then
    # Only copy real audio files (not the README)
    local count=0
    for f in "$GENERATOR/assets/sounds/"*.mp3 "$GENERATOR/assets/sounds/"*.wav; do
      [ -f "$f" ] || continue
      cp -f "$f" "$BASE/Sounds/"
      ok "copied: $(basename "$f")"
      count=$((count + 1))
    done
    if [ "$count" -eq 0 ]; then
      warn "assets/sounds/ exists but contains no audio files yet"
      info "Add your sound files to $BASE/Sounds/ manually."
      info "Required: Hello.mp3, Coffee Pour.wav, Topic Transition.mp3, Goodbye.mp3"
    fi
  else
    warn "No sound assets found in repo."
    info "Add your sound files to $BASE/Sounds/ manually."
    info "Required: Hello.mp3, Coffee Pour.wav, Topic Transition.mp3, Goodbye.mp3"
  fi
}

# ── .env template ─────────────────────────────────────────────────────────────

create_env_template() {
  step "Creating .env template"

  local env_file="$BASE/.env"

  if [ -f "$env_file" ]; then
    ok ".env already exists at $env_file — not overwriting"
    return
  fi

  cat > "$env_file" <<'EOF'
# The Morning Cup — environment secrets
# Fill in each value, then save this file.
# Do NOT commit this file to git.

WORKER_URL=https://themorningcupgenerator.itsmiarosemathews.workers.dev
RUN_SECRET=
OPENAI_API_KEY=
ELEVENLABS_API_KEY=
ELEVENLABS_VOICE_ID=
EOF

  ok ".env template created at $env_file"
  info "Edit $BASE/.env and fill in your secrets."
}

# ── wrangler login prompt ─────────────────────────────────────────────────────

prompt_wrangler_login() {
  step "Wrangler authentication"

  if command -v wrangler >/dev/null 2>&1 && wrangler whoami >/dev/null 2>&1; then
    ok "Already authenticated with Cloudflare"
    return
  fi

  printf "\n  ${C_BOLD}Would you like to run 'wrangler login' now?${C_RESET} [y/N] "
  read -r answer
  case "$answer" in
    [yY]|[yY][eE][sS])
      wrangler login || warn "wrangler login did not complete — run it manually later"
      ;;
    *)
      info "Skipping. Run 'wrangler login' before deploying the worker."
      ;;
  esac
}

# ── preflight ─────────────────────────────────────────────────────────────────

run_preflight() {
  step "Running preflight check"

  if [ -f "$GENERATOR/scripts/morning-cup.sh" ]; then
    chmod +x "$GENERATOR/scripts/morning-cup.sh"
    cd "$GENERATOR"
    bash scripts/morning-cup.sh preflight || warn "Preflight reported issues (see above) — fix before first run"
    cd - >/dev/null
  else
    warn "morning-cup.sh not found — skipping preflight"
  fi
}

# ── desktop shortcut ──────────────────────────────────────────────────────────

create_desktop_shortcut() {
  if [ -f "$GENERATOR/scripts/create-desktop-shortcut.sh" ]; then
    chmod +x "$GENERATOR/scripts/create-desktop-shortcut.sh"
    bash "$GENERATOR/scripts/create-desktop-shortcut.sh"
  else
    warn "create-desktop-shortcut.sh not found — skipping shortcut creation"
  fi
}

# ── completion banner ─────────────────────────────────────────────────────────

print_next_steps() {
  printf "\n"
  printf "${C_OK}${C_BOLD}══════════════════════════════════════════════${C_RESET}\n"
  printf "${C_OK}${C_BOLD}  Setup complete!${C_RESET}\n"
  printf "${C_OK}${C_BOLD}══════════════════════════════════════════════${C_RESET}\n"
  printf "\n"
  printf "  ${C_BOLD}Next steps:${C_RESET}\n"
  printf "\n"
  printf "  1. Fill in your secrets:\n"
  printf "     ${C_DIM}nano \"%s/.env\"${C_RESET}\n" "$BASE"
  printf "\n"
  printf "  2. Authenticate with Cloudflare (if not done):\n"
  printf "     ${C_DIM}wrangler login${C_RESET}\n"
  printf "\n"
  printf "  3. Deploy your worker:\n"
  printf "     ${C_DIM}cd \"%s\" && npx wrangler deploy${C_RESET}\n" "$GENERATOR"
  printf "\n"
  printf "  4. Run your first episode:\n"
  printf "     ${C_DIM}cd ~/Documents/'The Morning Cup'/Generator && ./scripts/morning-cup.sh make${C_RESET}\n"
  printf "\n"
  printf "  5. (Optional) Launch the applet:\n"
  printf "     ${C_DIM}python3 \"%s/scripts/applet.py\"${C_RESET}\n" "$GENERATOR"
  printf "\n"
}

# ── main ──────────────────────────────────────────────────────────────────────

main() {
  printf "\n"
  printf "${C_BOLD}${C_CYAN}  ☕  The Morning Cup — First-Time Setup${C_RESET}\n"
  printf "${C_DIM}  ────────────────────────────────────────${C_RESET}\n"
  printf "\n"

  detect_os
  info "Detected OS: $OS_TYPE"

  if [ "$SKIP_DEPS" = "0" ]; then
    case "$OS_TYPE" in
      macos)                    install_macos   ;;
      ubuntu|debian|chromeos)   install_ubuntu  ;;
      raspbian)                 install_ubuntu  ;;
      centos)                   install_centos  ;;
      arch)                     install_arch    ;;
      unknown)
        warn "Unknown OS — skipping automatic dependency install."
        warn "Please install manually: git, node (v20), ffmpeg, python3, pip packages (mutagen requests numpy), wrangler"
        ;;
    esac
  else
    info "--skip-deps set: skipping dependency installation"
  fi

  create_folder_structure
  clone_or_pull
  sync_scripts
  copy_sound_assets
  create_env_template
  prompt_wrangler_login

  run_preflight

  if [ "$RUN_APPLET" = "1" ]; then
    create_desktop_shortcut
  fi

  print_next_steps
}

main
