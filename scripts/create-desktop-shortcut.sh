#!/usr/bin/env bash
# create-desktop-shortcut.sh — creates a desktop icon for The Morning Cup applet
#
# Supports:
#   macOS  — ~/Desktop/The Morning Cup.command  (double-click to launch)
#   Linux  — ~/.local/share/applications/ + ~/Desktop/ .desktop entries
#   Windows (WSL) — prints instructions for a .bat launcher
#
# Usage: bash scripts/create-desktop-shortcut.sh

set -eo pipefail

# ── color helpers ─────────────────────────────────────────────────────────────

if [ -t 1 ]; then
  C_OK=$'\033[0;32m'
  C_WARN=$'\033[0;33m'
  C_ERR=$'\033[0;31m'
  C_BOLD=$'\033[1m'
  C_DIM=$'\033[0;90m'
  C_RESET=$'\033[0m'
else
  C_OK="" C_WARN="" C_ERR="" C_BOLD="" C_DIM="" C_RESET=""
fi

ok()   { printf "  ${C_OK}[ OK ]${C_RESET}  %s\n"   "$*"; }
warn() { printf "  ${C_WARN}[WARN]${C_RESET}  %s\n" "$*"; }
info() { printf "  ${C_DIM}       %s${C_RESET}\n"   "$*"; }
die()  { printf "  ${C_ERR}[FAIL]${C_RESET}  %s\n"  "$*" >&2; exit 1; }
step() { printf "\n${C_BOLD}%s${C_RESET}\n"          "$*"; }

# ── detect OS ─────────────────────────────────────────────────────────────────

OS_TYPE="unknown"
UNAME_S="$(uname -s)"

if [ "$UNAME_S" = "Darwin" ]; then
  OS_TYPE="macos"
elif [ "$UNAME_S" = "Linux" ]; then
  # Detect WSL
  if grep -qi microsoft /proc/version 2>/dev/null || \
     grep -qi wsl /proc/version 2>/dev/null || \
     [ -n "${WSL_DISTRO_NAME:-}" ]; then
    OS_TYPE="wsl"
  else
    OS_TYPE="linux"
  fi
elif [[ "$UNAME_S" == MINGW* ]] || [[ "$UNAME_S" == CYGWIN* ]] || [ -n "${WINDIR:-}" ]; then
  OS_TYPE="windows_native"
fi

# ── locate generator dir ─────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GENERATOR_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BASE="$HOME/Documents/The Morning Cup"

# ── macOS shortcut ────────────────────────────────────────────────────────────

create_macos_shortcut() {
  step "Creating macOS desktop shortcut"

  local desktop="$HOME/Desktop"
  local shortcut_name="The Morning Cup.command"
  local shortcut_path="$desktop/$shortcut_name"

  if [ ! -d "$desktop" ]; then
    warn "~/Desktop not found — creating it"
    mkdir -p "$desktop"
  fi

  cat > "$shortcut_path" <<SCRIPT
#!/bin/bash
# The Morning Cup — Episode Generator launcher
# Double-click this file in Finder to open the TUI applet.

cd "\$HOME/Documents/The Morning Cup/Generator"
python3 scripts/applet.py
SCRIPT

  chmod +x "$shortcut_path"
  ok "Created: $shortcut_path"
  info "Double-click \"The Morning Cup.command\" in ~/Desktop to launch the applet."

  # On macOS 10.15+ the file may be quarantined; strip the quarantine flag.
  if command -v xattr >/dev/null 2>&1; then
    xattr -d com.apple.quarantine "$shortcut_path" 2>/dev/null || true
    info "(Cleared quarantine flag so macOS won't block execution.)"
  fi
}

# ── Linux shortcut ────────────────────────────────────────────────────────────

create_linux_shortcut() {
  step "Creating Linux .desktop shortcut"

  local applications_dir="$HOME/.local/share/applications"
  local desktop_dir="$HOME/Desktop"
  local entry_name="morning-cup.desktop"

  # Choose a sensible icon — terminal icon is guaranteed to exist
  local icon="utilities-terminal"

  local entry_content
  entry_content="$(cat <<DESKTOP
[Desktop Entry]
Name=The Morning Cup
Comment=Episode Generator — daily podcast pipeline launcher
Exec=bash -c 'cd "\$HOME/Documents/The Morning Cup/Generator" && python3 scripts/applet.py'
Icon=${icon}
Terminal=true
Type=Application
Categories=AudioVideo;Utility;
StartupNotify=false
DESKTOP
)"

  # Install to applications dir (app launcher / Dock)
  mkdir -p "$applications_dir"
  printf '%s\n' "$entry_content" > "$applications_dir/$entry_name"
  ok "Installed: $applications_dir/$entry_name"

  # Install to Desktop
  if [ -d "$desktop_dir" ]; then
    printf '%s\n' "$entry_content" > "$desktop_dir/$entry_name"
    chmod +x "$desktop_dir/$entry_name"
    ok "Created:   $desktop_dir/$entry_name"

    # For GNOME: mark the desktop file as trusted so it shows the launch prompt
    if command -v gio >/dev/null 2>&1; then
      gio set "$desktop_dir/$entry_name" metadata::trusted true 2>/dev/null && \
        info "Marked as trusted (GNOME) — you can double-click to run without a prompt." || true
    fi

    # KDE Plasma: update desktop database
    if command -v kbuildsycoca5 >/dev/null 2>&1 || command -v kbuildsycoca6 >/dev/null 2>&1; then
      kbuildsycoca5 --noincremental 2>/dev/null || kbuildsycoca6 --noincremental 2>/dev/null || true
      info "Refreshed KDE application database."
    fi
  else
    warn "~/Desktop not found — skipping Desktop shortcut (application menu entry was still installed)."
  fi

  # Refresh the MIME/application database
  if command -v update-desktop-database >/dev/null 2>&1; then
    update-desktop-database "$applications_dir" 2>/dev/null && \
      info "Application database refreshed."
  fi

  info ""
  info "You can now search for 'The Morning Cup' in your application launcher."
}

# ── WSL (Windows Subsystem for Linux) instructions ───────────────────────────

print_wsl_instructions() {
  step "Windows (WSL) — desktop shortcut instructions"

  # Detect the Windows Desktop path via cmd.exe / PowerShell
  local win_desktop=""
  if command -v powershell.exe >/dev/null 2>&1; then
    win_desktop="$(powershell.exe -NoProfile -Command "[Environment]::GetFolderPath('Desktop')" 2>/dev/null | tr -d '\r' || true)"
  fi

  printf "\n"
  printf "  WSL does not support native .desktop files on the Windows desktop.\n"
  printf "  Create a .bat launcher instead:\n"
  printf "\n"

  if [ -n "$win_desktop" ]; then
    local bat_path
    bat_path="$(wslpath -u "$win_desktop" 2>/dev/null || echo "$win_desktop")/The Morning Cup.bat"
    printf "  ${C_BOLD}Option A: Auto-create (run this in WSL):${C_RESET}\n"
    printf "\n"
    printf "    cat > %s <<'BAT'\n" "\"$bat_path\""
    printf "    @echo off\n"
    printf "    wsl bash -c \"cd ~/Documents/'The Morning Cup'/Generator && python3 scripts/applet.py\"\n"
    printf "    BAT\n"
    printf "\n"
  fi

  # Determine the WSL distro name for the shortcut
  local distro="${WSL_DISTRO_NAME:-Ubuntu}"

  printf "  ${C_BOLD}Or create the file manually on your Windows Desktop:${C_RESET}\n"
  printf "\n"
  printf "    File: The Morning Cup.bat\n"
  printf "    Contents:\n"
  printf "\n"
  printf "        @echo off\n"
  printf "        wsl -d %s bash -c \"cd ~/Documents/'The Morning Cup'/Generator && python3 scripts/applet.py\"\n" "$distro"
  printf "\n"
  printf "  ${C_DIM}(Adjust the distro name if you are not using %s)${C_RESET}\n" "$distro"
  printf "\n"
  printf "  Double-clicking the .bat file will open a WSL terminal and launch the applet.\n"
  printf "\n"

  # If we detected the Windows Desktop path, try to auto-create the .bat
  if [ -n "$win_desktop" ]; then
    local bat_wsl_path
    bat_wsl_path="$(wslpath -u "$win_desktop" 2>/dev/null)/$The Morning Cup.bat"
    # Build path properly (avoid subshell issue with spaces)
    local wsl_desktop
    wsl_desktop="$(wslpath -u "$win_desktop" 2>/dev/null || true)"
    if [ -n "$wsl_desktop" ]; then
      local bat_file="$wsl_desktop/The Morning Cup.bat"
      printf "  ${C_BOLD}Would you like to auto-create the .bat file now?${C_RESET} [y/N] "
      read -r answer
      case "$answer" in
        [yY]|[yY][eE][sS])
          {
            printf '@echo off\r\n'
            printf "wsl -d %s bash -c \"cd ~/Documents/'The Morning Cup'/Generator && python3 scripts/applet.py\"\r\n" "$distro"
          } > "$bat_file"
          ok "Created: $bat_file"
          ;;
        *)
          info "Skipped. Create the file manually using the instructions above."
          ;;
      esac
    fi
  fi
}

print_windows_native_instructions() {
  step "Windows (native) — desktop shortcut instructions"
  printf "\n"
  printf "  This script must run inside WSL2 to create a shortcut.\n"
  printf "  Install WSL2: https://learn.microsoft.com/en-us/windows/wsl/install\n"
  printf "\n"
  printf "  Once WSL2 is set up, re-run:\n"
  printf "    bash scripts/create-desktop-shortcut.sh\n"
  printf "\n"
}

# ── main ──────────────────────────────────────────────────────────────────────

printf "\n"
printf "${C_BOLD}  The Morning Cup — Desktop Shortcut Creator${C_RESET}\n"
printf "${C_DIM}  ──────────────────────────────────────────${C_RESET}\n"

case "$OS_TYPE" in
  macos)           create_macos_shortcut ;;
  linux)           create_linux_shortcut ;;
  wsl)             print_wsl_instructions ;;
  windows_native)  print_windows_native_instructions ;;
  unknown)
    warn "Could not detect OS type."
    info "Supported: macOS, Linux, WSL2."
    ;;
esac

printf "\n"
