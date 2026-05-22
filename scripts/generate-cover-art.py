#!/usr/bin/env python3
"""
Generate per-episode cover art for The Morning Cup.

Overlays the episode title and metadata onto the show's cover image template,
producing a 1400x1400 JPEG alongside the finished MP3.

Usage:
    generate-cover-art.py [DATE] [--title "Episode Title"] [--episode N]
    generate-cover-art.py 2026-05-22 --title "Housing Costs, AI Bills & Your Morning Riddle"

    DATE defaults to today (America/New_York).
    If --title is omitted, reads the primary title from the episode metadata .txt.

Output:
    ~/Documents/The Morning Cup/Episodes/The Morning Cup - <DATE>.jpg

Template:
    ~/Documents/The Morning Cup/Sounds/cover-art.jpg
    (Save your 1400×1400+ show artwork there)

Requires:
    pip install --user --break-system-packages Pillow
"""

import argparse
import os
import re
import sys
from datetime import date
from pathlib import Path

ROOT      = Path.home() / "Documents" / "The Morning Cup"
SOUNDS    = ROOT / "Sounds"
EPISODES  = ROOT / "Episodes"
CHUNKS    = ROOT / "Chunks"
ENV_FILE  = ROOT / ".env"
TEMPLATE  = SOUNDS / "cover-art.jpg"

SIZE      = 1400          # output square in pixels
PANEL_H   = int(SIZE * 0.36)   # dark overlay panel height
CORNER_R  = 32            # rounded corner radius on panel top edge

# Brand colours matched to the show's cover art
YELLOW    = (230, 255, 10)   # title text (lime-yellow)
CYAN      = (0, 220, 255)    # title drop-shadow (cyan)
ORANGE    = (255, 130, 30)   # subtitle / meta text
WHITE     = (255, 255, 255)
PANEL_BG  = (18, 10, 28, 210)   # dark purple, ~82% opacity


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def load_env():
    if not ENV_FILE.is_file():
        return
    with open(ENV_FILE) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, val = line.partition("=")
            os.environ.setdefault(key.strip(), val.strip().strip('"').strip("'"))


def today_et() -> str:
    import subprocess
    try:
        return subprocess.run(
            ["date", "+%Y-%m-%d"],
            env={**os.environ, "TZ": "America/New_York"},
            check=True, capture_output=True, text=True,
        ).stdout.strip()
    except Exception:
        return date.today().isoformat()


def resolve_date(arg: str | None) -> str:
    if not arg:
        return today_et()
    if not re.match(r"^\d{4}-\d{2}-\d{2}$", arg):
        sys.exit(f"Error: date '{arg}' must be YYYY-MM-DD")
    return arg


def day_of_year(iso: str) -> int:
    d = date.fromisoformat(iso)
    return d.timetuple().tm_yday


def spoken_date(iso: str) -> str:
    d = date.fromisoformat(iso)
    day = d.day
    suffix = (
        "th" if 11 <= day <= 13 else
        {1: "st", 2: "nd", 3: "rd"}.get(day % 10, "th")
    )
    return d.strftime(f"%B {day}{suffix}, %Y")


def read_title_from_metadata(episode_date: str) -> str:
    """Parse the primary title from the episode's Metadata.txt file."""
    paths = [
        EPISODES / f"The Morning Cup - {episode_date} - Metadata.txt",
        CHUNKS / episode_date / f"The Morning Cup - {episode_date} - Metadata.txt",
    ]
    for p in paths:
        if p.is_file():
            for line in p.read_text(encoding="utf-8").splitlines():
                if line.startswith("Title:"):
                    raw = line.partition(":")[2].strip()
                    # Strip leading "The Morning Cup: " to get just the subtitle
                    if raw.startswith("The Morning Cup: "):
                        return raw[len("The Morning Cup: "):]
                    if raw.startswith("The Morning Cup — "):
                        return ""   # date-only fallback, no subtitle
                    return raw
    return ""


def find_font(size: int, bold: bool = True):
    """Return an ImageFont, trying Mac system fonts before falling back."""
    from PIL import ImageFont
    candidates = []
    if bold:
        candidates = [
            "/System/Library/Fonts/Supplemental/Impact.ttf",
            "/System/Library/Fonts/HelveticaNeue.ttc",
            "/Library/Fonts/Arial Bold.ttf",
            "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        ]
    else:
        candidates = [
            "/System/Library/Fonts/HelveticaNeue.ttc",
            "/Library/Fonts/Arial.ttf",
            "/System/Library/Fonts/Supplemental/Arial.ttf",
        ]
    for path in candidates:
        try:
            return ImageFont.truetype(path, size)
        except (OSError, IOError):
            continue
    return ImageFont.load_default()


def wrap_text(text: str, font, max_width: int, draw) -> list[str]:
    """Break text into lines that fit within max_width pixels."""
    words = text.split()
    lines, current = [], ""
    for word in words:
        test = f"{current} {word}".strip()
        bbox = draw.textbbox((0, 0), test, font=font)
        if bbox[2] > max_width and current:
            lines.append(current)
            current = word
        else:
            current = test
    if current:
        lines.append(current)
    return lines


def draw_text_with_shadow(draw, pos, text, font, fill, shadow_color, offset=(4, 4)):
    sx, sy = pos[0] + offset[0], pos[1] + offset[1]
    draw.text((sx, sy), text, font=font, fill=shadow_color)
    draw.text(pos, text, font=font, fill=fill)


# ---------------------------------------------------------------------------
# Core render
# ---------------------------------------------------------------------------

def render(episode_date: str, subtitle: str) -> Path:
    try:
        from PIL import Image, ImageDraw, ImageFilter
    except ImportError:
        sys.exit(
            "Error: Pillow is not installed.\n"
            "Fix: python3 -m pip install --user --break-system-packages Pillow"
        )

    # --- load / create base image ---
    if TEMPLATE.is_file():
        base = Image.open(TEMPLATE).convert("RGBA").resize((SIZE, SIZE), Image.LANCZOS)
    else:
        print(f"Warning: template not found at {TEMPLATE}")
        print("         Using a solid background for the mockup.")
        # Gradient placeholder matching the show's purple/rainbow feel
        base = Image.new("RGBA", (SIZE, SIZE), (80, 20, 120, 255))
        draw_placeholder = ImageDraw.Draw(base)
        for i in range(SIZE):
            r = int(80  + (i / SIZE) * 60)
            g = int(20  + (i / SIZE) * 80)
            b = int(120 + (i / SIZE) * 80)
            draw_placeholder.line([(0, i), (SIZE, i)], fill=(r, g, b, 255))

    # --- dark panel overlay at bottom ---
    panel_top = SIZE - PANEL_H
    overlay = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)

    # Rounded top edge on the panel
    r = CORNER_R
    od.rectangle([(0, panel_top + r), (SIZE, SIZE)], fill=PANEL_BG)
    od.rectangle([(r, panel_top),     (SIZE - r, SIZE)], fill=PANEL_BG)
    od.ellipse(  [(0, panel_top),     (2*r, panel_top + 2*r)], fill=PANEL_BG)
    od.ellipse(  [(SIZE - 2*r, panel_top), (SIZE, panel_top + 2*r)], fill=PANEL_BG)

    base = Image.alpha_composite(base, overlay)
    draw = ImageDraw.Draw(base)

    # --- layout constants ---
    pad_x  = 56
    pad_y  = panel_top + 28
    inner_w = SIZE - (2 * pad_x)

    # --- episode badge (top-left corner of panel) ---
    ep_num  = day_of_year(episode_date)
    year    = episode_date[:4]
    badge   = f"EP. {ep_num}  ·  {spoken_date(episode_date)}"
    badge_font = find_font(30, bold=False)
    draw.text((pad_x, pad_y), badge, font=badge_font, fill=ORANGE)
    badge_h = draw.textbbox((0, 0), badge, font=badge_font)[3] + 14

    # --- episode title ---
    title_font_size = 82
    title_font = find_font(title_font_size, bold=True)

    if subtitle:
        lines = wrap_text(subtitle, title_font, inner_w, draw)
        # If more than 2 lines, shrink font
        if len(lines) > 2:
            title_font_size = 62
            title_font = find_font(title_font_size, bold=True)
            lines = wrap_text(subtitle, title_font, inner_w, draw)
    else:
        lines = ["The Morning Cup"]

    y = pad_y + badge_h
    line_h = draw.textbbox((0, 0), "Ay", font=title_font)[3] + 8
    for line in lines:
        draw_text_with_shadow(
            draw, (pad_x, y), line,
            font=title_font,
            fill=YELLOW,
            shadow_color=CYAN,
            offset=(4, 5),
        )
        y += line_h

    # --- show name watermark bottom-right ---
    show_font = find_font(28, bold=False)
    show_text = "The Morning Cup  ·  Vicinity News"
    bbox = draw.textbbox((0, 0), show_text, font=show_font)
    show_x = SIZE - pad_x - bbox[2]
    show_y = SIZE - 36 - bbox[3]
    draw.text((show_x, show_y), show_text, font=show_font, fill=(*WHITE, 160))

    # --- save ---
    out_path = EPISODES / f"The Morning Cup - {episode_date}.jpg"
    EPISODES.mkdir(parents=True, exist_ok=True)
    base.convert("RGB").save(str(out_path), "JPEG", quality=92)
    return out_path


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    load_env()

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("date",    nargs="?", help="YYYY-MM-DD (default: today ET)")
    parser.add_argument("--title", help="Episode subtitle (≤10 words)")
    parser.add_argument("--episode", type=int, help="Episode number override")
    args = parser.parse_args()

    episode_date = resolve_date(args.date)
    subtitle = args.title or read_title_from_metadata(episode_date)

    if not subtitle:
        print(f"No title found for {episode_date}; using show name only.")

    print(f"Generating cover art for {episode_date}...")
    if subtitle:
        print(f"  Title: The Morning Cup: {subtitle}")

    out = render(episode_date, subtitle)
    print(f"  Saved: {out}")


if __name__ == "__main__":
    main()
