#!/usr/bin/env python3
"""
applet.py — The Morning Cup Episode Generator TUI launcher

Navigate with arrow keys or type a number, then press Enter to run a command.
Press 'q' to quit.

Usage:
    python3 scripts/applet.py           # full TUI (requires a real TTY)
    python3 scripts/applet.py --no-tui  # plain numbered menu (pipe-friendly)
"""

import curses
import json
import os
import subprocess
import sys
from datetime import date
from pathlib import Path

# ── config ───────────────────────────────────────────────────────────────────

PREFS_FILE = Path.home() / ".morning-cup-prefs.json"

COMMANDS = [
    ("make",        "Full pipeline"),
    ("monitor",     "Live dashboard"),
    ("status",      "Quick status"),
    ("approve",     "Approve script"),
    ("reject",      "Reject script"),
    ("fetch",       "Download R2"),
    ("build",       "Assemble MP3"),
    ("transcribe",  "Whisper VTT"),
    ("audacity",    "Multi-track"),
    ("preflight",   "Check deps"),
]

# ── helpers ───────────────────────────────────────────────────────────────────

def find_generator_dir() -> Path:
    """Find the Generator/ directory, relative to this script's location."""
    here = Path(__file__).resolve().parent
    # scripts/ lives inside Generator/; so Generator/ is one level up.
    candidate = here.parent
    if (candidate / "package.json").exists():
        return candidate
    # Fallback: look for the conventional install path
    fallback = Path.home() / "Documents" / "The Morning Cup" / "Generator"
    if fallback.exists():
        return fallback
    return candidate  # best guess


def load_prefs() -> dict:
    try:
        if PREFS_FILE.exists():
            with open(PREFS_FILE) as f:
                return json.load(f)
    except Exception:
        pass
    return {}


def save_prefs(prefs: dict) -> None:
    try:
        with open(PREFS_FILE, "w") as f:
            json.dump(prefs, f, indent=2)
    except Exception:
        pass


def load_run_secret(generator_dir: Path) -> bool:
    """Return True if RUN_SECRET appears to be set."""
    env_paths = [
        Path.home() / "Documents" / "The Morning Cup" / ".env",
        generator_dir / ".env",
    ]
    for env_path in env_paths:
        if not env_path.exists():
            continue
        try:
            for line in env_path.read_text().splitlines():
                line = line.strip()
                if line.startswith("RUN_SECRET="):
                    val = line.split("=", 1)[1].strip().strip('"').strip("'")
                    if val:
                        return True
        except Exception:
            pass
    return bool(os.environ.get("RUN_SECRET"))


def today_str() -> str:
    return date.today().strftime("%Y-%m-%d")


# ── terminal detection / preference ──────────────────────────────────────────

LINUX_TERMINALS = [
    ("gnome-terminal",  ["gnome-terminal", "--"]),
    ("xterm",           ["xterm", "-e"]),
    ("xfce4-terminal",  ["xfce4-terminal", "--command"]),
    ("kitty",           ["kitty"]),
    ("alacritty",       ["alacritty", "-e"]),
    ("konsole",         ["konsole", "-e"]),
]

MACOS_TERMINALS = [
    ("Terminal.app", None),   # handled via `open -a Terminal`
    ("iTerm2",       None),   # handled via `open -a iTerm`
    ("Warp",         None),   # handled via `open -a Warp`
]


def detect_available_terminals() -> list[dict]:
    """Return a list of available terminal descriptors for this OS."""
    uname = os.uname().sysname if hasattr(os, "uname") else "Linux"
    available = []

    if uname == "Darwin":
        apps = {
            "Terminal.app": "/System/Applications/Utilities/Terminal.app",
            "iTerm2":        "/Applications/iTerm.app",
            "Warp":          "/Applications/Warp.app",
        }
        for name, app_path in apps.items():
            if os.path.exists(app_path):
                available.append({"name": name, "type": "macos_app", "app_path": app_path})
    else:
        for name, cmd_prefix in LINUX_TERMINALS:
            if _which(name):
                available.append({"name": name, "type": "linux", "cmd_prefix": cmd_prefix})

    return available


def _which(cmd: str) -> bool:
    import shutil
    return shutil.which(cmd) is not None


def choose_terminal_interactive(available: list[dict]) -> dict | None:
    """Prompt the user to choose a terminal from a plain-text menu."""
    if not available:
        return None
    if len(available) == 1:
        return available[0]

    print("\n  Choose your terminal emulator:")
    for i, t in enumerate(available, 1):
        print(f"  [{i}] {t['name']}")
    print("  [0] Run in this terminal (no new window)")

    while True:
        choice = input("  Choice: ").strip()
        if choice == "0":
            return None
        try:
            idx = int(choice) - 1
            if 0 <= idx < len(available):
                return available[idx]
        except ValueError:
            pass
        print("  Invalid choice. Try again.")


def get_terminal_preference(prefs: dict) -> dict | None:
    """
    Return saved terminal preference, or prompt user to choose one.
    Returns None to mean "run inline / in current terminal".
    """
    if "terminal" in prefs:
        saved = prefs["terminal"]
        if saved is None:
            return None
        # Verify the saved terminal is still available
        available = detect_available_terminals()
        for t in available:
            if t["name"] == saved.get("name"):
                return t
        # Saved terminal no longer available; fall through to re-prompt

    available = detect_available_terminals()
    chosen = choose_terminal_interactive(available)
    prefs["terminal"] = chosen  # None is serialisable as JSON null
    save_prefs(prefs)
    return chosen


def launch_command_in_terminal(
    terminal: dict | None,
    shell_cmd: str,
    generator_dir: Path,
) -> subprocess.CompletedProcess | None:
    """
    Run shell_cmd, either in the same terminal or by spawning a new window.
    Returns the CompletedProcess if running inline, else None.
    """
    if terminal is None:
        # Inline: run in the current terminal, wait for it to finish.
        return subprocess.run(shell_cmd, shell=True, cwd=str(generator_dir))

    uname = os.uname().sysname if hasattr(os, "uname") else "Linux"

    if terminal["type"] == "macos_app":
        app_name = terminal["name"].replace(".app", "")
        # AppleScript-free approach: write a tmp launcher script
        import tempfile, stat
        tmp = tempfile.NamedTemporaryFile(
            mode="w", suffix=".command", delete=False
        )
        tmp.write("#!/bin/bash\n")
        tmp.write(f"cd {str(generator_dir)!r}\n")
        tmp.write(shell_cmd + "\n")
        tmp.write('echo "\\nPress any key to close..."; read -n1\n')
        tmp.close()
        os.chmod(tmp.name, stat.S_IRWXU)
        subprocess.Popen(["open", "-a", app_name, tmp.name])
        return None
    else:
        # Linux terminal with a --command / -e style prefix
        cmd_prefix = terminal["cmd_prefix"]
        full_cmd = cmd_prefix + ["bash", "-c", f"cd {str(generator_dir)!r} && {shell_cmd}; echo; read -n1 -p 'Press any key...'"]
        subprocess.Popen(full_cmd)
        return None


# ── plain-text menu (--no-tui fallback) ──────────────────────────────────────

def run_plain_menu(generator_dir: Path, has_secret: bool) -> None:
    today = today_str()
    secret_status = "present" if has_secret else "MISSING — edit .env"

    print()
    print("  ╔═══════════════════════════════════════╗")
    print("  ║  ☕  The Morning Cup                  ║")
    print("  ║  Episode Generator                    ║")
    print("  ╠═══════════════════════════════════════╣")
    for i, (cmd, desc) in enumerate(COMMANDS):
        num = str(i) if i < 10 else str(i - 10)
        num_display = num if i < len(COMMANDS) else "0"
        # Use 1-based but wrap 10 as 0
        display_num = str(i + 1) if i < 9 else ("0" if i == 9 else str(i - 9))
        print(f"  ║  [{display_num}] {cmd:<13} {desc:<22} ║")
    print("  ╠═══════════════════════════════════════╣")
    print(f"  ║  Date:   {today:<29} ║")
    print(f"  ║  Secret: {secret_status:<29} ║")
    print("  ╠═══════════════════════════════════════╣")
    print("  ║  Enter number to run  |  q to quit   ║")
    print("  ╚═══════════════════════════════════════╝")
    print()

    while True:
        try:
            choice = input("  Command number (or q): ").strip().lower()
        except (EOFError, KeyboardInterrupt):
            print()
            break

        if choice == "q":
            break

        try:
            idx = int(choice) - 1
            if choice == "0":
                idx = 9  # [0] maps to index 9 (preflight)
            if 0 <= idx < len(COMMANDS):
                cmd_name, _ = COMMANDS[idx]
                run_command(cmd_name, today, generator_dir, terminal=None)
            else:
                print("  Invalid choice.")
        except ValueError:
            print("  Enter a number between 1–0, or q.")


def run_command(
    cmd_name: str,
    episode_date: str,
    generator_dir: Path,
    terminal: dict | None,
) -> None:
    """Execute a morning-cup.sh subcommand and wait."""
    mc = generator_dir / "scripts" / "morning-cup.sh"
    if not mc.exists():
        print(f"  morning-cup.sh not found at {mc}")
        return

    # preflight and monitor don't take a date arg
    if cmd_name == "preflight":
        shell_cmd = f"bash {str(mc)!r} preflight"
    else:
        shell_cmd = f"bash {str(mc)!r} {cmd_name} {episode_date}"

    result = launch_command_in_terminal(terminal, shell_cmd, generator_dir)
    if result is not None:
        # Inline execution finished; caller will handle "press any key" prompt
        pass


# ── curses TUI ────────────────────────────────────────────────────────────────

# Box-drawing characters
BOX = {
    "tl": "╔", "tr": "╗", "bl": "╚", "br": "╝",
    "h":  "═", "v":  "║", "ml": "╠", "mr": "╣",
}
WIDTH = 41   # inner content width + 2 border chars = 43 total chars


def _box_row(content: str, width: int = WIDTH) -> str:
    """Return a single row padded to `width` with vertical borders."""
    inner = content[:width - 2]
    return BOX["v"] + inner.ljust(width - 2) + BOX["v"]


def _separator(width: int = WIDTH) -> str:
    return BOX["ml"] + BOX["h"] * (width - 2) + BOX["mr"]


def draw_panel(
    win: "curses.window",
    selected: int,
    today: str,
    status_line: str,
    width: int = WIDTH,
) -> None:
    win.erase()
    rows, cols = win.getmaxyx()

    lines = []
    lines.append(BOX["tl"] + BOX["h"] * (width - 2) + BOX["tr"])
    lines.append(_box_row("  ☕  The Morning Cup"))
    lines.append(_box_row("  Episode Generator"))
    lines.append(_separator())
    for i, (cmd, desc) in enumerate(COMMANDS):
        display_num = str(i + 1) if i < 9 else "0"
        content = f"  [{display_num}] {cmd:<13} {desc}"
        lines.append(_box_row(content))
    lines.append(_separator())
    lines.append(_box_row(f"  Date: {today}"))
    lines.append(_box_row(f"  Status: {status_line}"))
    lines.append(_separator())
    lines.append(_box_row("  ↑↓ navigate  Enter run  q quit"))
    lines.append(BOX["bl"] + BOX["h"] * (width - 2) + BOX["br"])

    # Find the row index that matches the selected command (offset by header rows)
    HEADER_ROWS = 4   # top border + 2 title lines + separator
    selected_row = HEADER_ROWS + selected

    for row_idx, line in enumerate(lines):
        if row_idx >= rows:
            break
        try:
            if row_idx == selected_row:
                win.addstr(row_idx, 0, line, curses.A_REVERSE)
            else:
                win.addstr(row_idx, 0, line)
        except curses.error:
            pass  # terminal too small — gracefully skip

    win.refresh()


def tui_main(stdscr: "curses.window", generator_dir: Path, prefs: dict, has_secret: bool) -> None:
    curses.curs_set(0)
    try:
        curses.use_default_colors()
    except curses.error:
        pass

    today = today_str()
    status_line = "ready" if has_secret else "RUN_SECRET missing"
    selected = 0
    terminal = get_terminal_preference(prefs)

    draw_panel(stdscr, selected, today, status_line)

    while True:
        key = stdscr.getch()

        if key in (ord("q"), ord("Q"), 27):   # q or ESC
            break

        elif key == curses.KEY_UP:
            selected = (selected - 1) % len(COMMANDS)
            draw_panel(stdscr, selected, today, status_line)

        elif key == curses.KEY_DOWN:
            selected = (selected + 1) % len(COMMANDS)
            draw_panel(stdscr, selected, today, status_line)

        elif key in (curses.KEY_ENTER, 10, 13):
            cmd_name, _ = COMMANDS[selected]
            # Suspend curses, run the command, resume
            curses.endwin()
            print(f"\n  Running: morning-cup.sh {cmd_name} {today}\n")
            run_command(cmd_name, today, generator_dir, terminal=None)
            print("\n  Press any key to return to the menu...")
            try:
                input()
            except (EOFError, KeyboardInterrupt):
                pass
            # Reinitialise curses
            stdscr = curses.initscr()
            curses.curs_set(0)
            try:
                curses.use_default_colors()
            except curses.error:
                pass
            draw_panel(stdscr, selected, today, status_line)

        elif key in range(ord("1"), ord("9") + 1):
            # Number shortcut: 1–9 selects items 0–8
            idx = key - ord("1")
            if 0 <= idx < len(COMMANDS):
                selected = idx
                draw_panel(stdscr, selected, today, status_line)

        elif key == ord("0"):
            # "0" maps to the last item (preflight, index 9)
            selected = 9
            draw_panel(stdscr, selected, today, status_line)


# ── entry point ───────────────────────────────────────────────────────────────

def main() -> None:
    no_tui = "--no-tui" in sys.argv

    generator_dir = find_generator_dir()
    has_secret    = load_run_secret(generator_dir)
    prefs         = load_prefs()

    if no_tui:
        run_plain_menu(generator_dir, has_secret)
        return

    # Try the curses TUI; fall back gracefully if curses is unavailable or
    # the terminal doesn't support it.
    try:
        curses.wrapper(tui_main, generator_dir, prefs, has_secret)
    except curses.error as e:
        print(f"  [applet] curses error: {e}. Falling back to plain menu.", file=sys.stderr)
        run_plain_menu(generator_dir, has_secret)
    except KeyboardInterrupt:
        pass
    finally:
        # Ensure terminal is restored on any exit
        try:
            curses.endwin()
        except Exception:
            pass


if __name__ == "__main__":
    main()
