#!/usr/bin/env bash
#
# team-setup.sh - One-command setup for a new Morning Cup teammate.
#
# Creates the canonical folder layout in ~/Documents/The Morning Cup/,
# clones (or refreshes) the Generator repo, mirrors helper scripts to the
# user's Scripts/ folder, and installs ffmpeg + mutagen.
#
# What it does NOT do:
#   - Drop the six sound assets into Sounds/. Those need to come from
#     wherever your team distributes them (private R2 prefix, Google
#     Drive, GitHub Release, etc.). See docs/TEAM-SHARING.md.
#   - Set up the RUN_SECRET. Each user adds their own to either ~/Documents/
#     The Morning Cup/.env or directly into their Apple Shortcuts.
#   - Run `wrangler login`. Each user runs that themselves to authenticate
#     against your team's Cloudflare account.
#
# Run from anywhere:
#   curl -fsSL https://raw.githubusercontent.com/pennydoesdev/TheMorningCup-Episode-Generator/main/scripts/team-setup.sh | bash
#
# Or after cloning the repo:
#   bash scripts/team-setup.sh
#

set -euo pipefail

REPO_URL="${MORNING_CUP_REPO_URL:-https://github.com/pennydoesdev/TheMorningCup-Episode-Generator.git}"
ROOT="$HOME/Documents/The Morning Cup"

bold()  { printf "\033[1m%s\033[0m\n" "$*"; }
green() { printf "\033[32m%s\033[0m\n" "$*"; }
yellow(){ printf "\033[33m%s\033[0m\n" "$*"; }
red()   { printf "\033[31m%s\033[0m\n" "$*" >&2; }

step()  { printf "\n\033[1m→ %s\033[0m\n" "$*"; }

# --- folder layout -----------------------------------------------------------

step "Creating folder layout under ~/Documents/The Morning Cup/"
mkdir -p "$ROOT/Sounds"
mkdir -p "$ROOT/Scripts"
mkdir -p "$ROOT/Chunks"
mkdir -p "$ROOT/Episodes"
green "✓ Folders ready: Sounds, Scripts, Chunks, Episodes"

# --- repo (clone or refresh) -------------------------------------------------

step "Setting up the Generator repo"
if [ -d "$ROOT/Generator/.git" ]; then
  (cd "$ROOT/Generator" && git pull --ff-only origin main)
  green "✓ Refreshed existing clone at $ROOT/Generator"
else
  git clone "$REPO_URL" "$ROOT/Generator"
  green "✓ Cloned $REPO_URL → $ROOT/Generator"
fi

# --- helper scripts ----------------------------------------------------------

step "Mirroring helper scripts into ~/Documents/The Morning Cup/Scripts/"
for f in build-episode.sh fetch-chunks.sh morning-cup.sh write-chapters.py; do
  src="$ROOT/Generator/scripts/$f"
  if [ -f "$src" ]; then
    cp "$src" "$ROOT/Scripts/$f"
  else
    yellow "  (skipping $f — not present in repo)"
  fi
done
chmod +x "$ROOT/Scripts/"*.sh 2>/dev/null || true
green "✓ Scripts mirrored"

# --- sound assets ------------------------------------------------------------

step "Copying shared sound assets into ~/Documents/The Morning Cup/Sounds/"
ASSETS_DIR="$ROOT/Generator/assets/sounds"
if [ -d "$ASSETS_DIR" ]; then
  installed=0
  for f in "$ASSETS_DIR"/*.wav "$ASSETS_DIR"/*.mp3; do
    [ -f "$f" ] || continue
    name=$(basename "$f")
    cp "$f" "$ROOT/Sounds/$name"
    installed=$((installed + 1))
  done
  if [ "$installed" -gt 0 ]; then
    green "✓ Copied $installed asset(s) from repo into Sounds/"
  else
    yellow "  Repo's assets/sounds/ is empty — get the audio files from your team lead and drop into $ROOT/Sounds/"
  fi
else
  yellow "  No assets/sounds/ folder in the repo — get the audio files from your team lead and drop into $ROOT/Sounds/"
fi

# --- dependencies ------------------------------------------------------------

step "Checking dependencies"

# Homebrew (required for ffmpeg)
if ! command -v brew >/dev/null 2>&1; then
  yellow "Homebrew not found. Install it from https://brew.sh and re-run this script."
  red "Cannot continue without Homebrew."
  exit 1
fi
green "✓ Homebrew present at $(command -v brew)"

# ffmpeg
if command -v ffmpeg >/dev/null 2>&1; then
  green "✓ ffmpeg present ($(ffmpeg -version | head -1))"
else
  step "Installing ffmpeg via Homebrew (this may take a few minutes)"
  brew install ffmpeg
fi

# wrangler
if command -v wrangler >/dev/null 2>&1; then
  green "✓ wrangler present ($(wrangler --version 2>&1 | head -1))"
else
  step "Installing wrangler via npm"
  if ! command -v npm >/dev/null 2>&1; then
    yellow "npm not found; installing Node via Homebrew"
    brew install node
  fi
  npm install -g wrangler
fi

# mutagen (Python ID3 lib for chapter markers + tags)
if python3 -c "import mutagen" >/dev/null 2>&1; then
  green "✓ mutagen present"
else
  step "Installing mutagen for the current user"
  python3 -m pip install --user --break-system-packages mutagen
fi

# --- summary -----------------------------------------------------------------

step "Almost done. What's left for you to do manually:"
cat <<EOF

  1. Authenticate with the team's Cloudflare account:
       wrangler login

  2. Add your RUN_SECRET to:
       $ROOT/.env
     The line should be:
       RUN_SECRET="<your-secret>"
     Then: chmod 600 "$ROOT/.env"
     (Or paste the secret directly into each Apple Shortcut — see
     docs/APPLE-SHORTCUTS.md.)

  3. (Optional) Import the team's shared Apple Shortcuts via the iCloud
     links your team lead posts. See docs/APPLE-SHORTCUTS.md.

  4. If any sound assets are missing from $ROOT/Sounds/ above, ask your
     team lead — they should be in the repo's assets/sounds/ folder
     after a fresh git pull.

EOF
bold "Once 1–2 are done, your morning command is:"
green "  $ROOT/Scripts/morning-cup.sh make"
echo
