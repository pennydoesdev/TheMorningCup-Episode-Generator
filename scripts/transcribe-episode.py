#!/usr/bin/env python3
"""
Transcribe a Morning Cup episode MP3 using OpenAI Whisper and write a
WebVTT transcript file (.vtt) alongside the MP3.

Usage:
    transcribe-episode.py [DATE]          # date defaults to today (America/New_York)
    transcribe-episode.py 2026-05-22

Output:
    ~/Documents/The Morning Cup/Episodes/The Morning Cup - <DATE>.vtt

Requirements:
    - OPENAI_API_KEY in environment or in ~/Documents/The Morning Cup/.env
    - requests  (pip install --user --break-system-packages requests)

The Whisper API charges ~$0.006/minute of audio. A 16-minute episode costs
roughly $0.10 per transcription.
"""

import json
import os
import re
import sys
from datetime import date, datetime, timezone
from pathlib import Path


# ---------------------------------------------------------------------------
# Environment
# ---------------------------------------------------------------------------

ROOT = Path.home() / "Documents" / "The Morning Cup"
ENV_FILE = ROOT / ".env"
EPISODES_DIR = ROOT / "Episodes"


def load_env_file():
    if not ENV_FILE.is_file():
        return
    with open(ENV_FILE) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, val = line.partition("=")
            val = val.strip().strip('"').strip("'")
            os.environ.setdefault(key.strip(), val)


load_env_file()


def require_env(name: str) -> str:
    v = os.environ.get(name, "")
    if not v:
        sys.exit(
            f"Error: {name} is not set.\n"
            f"Add it to {ENV_FILE} or export it in your shell:\n"
            f"  echo 'OPENAI_API_KEY=\"sk-...\"' >> \"{ENV_FILE}\""
        )
    return v


# ---------------------------------------------------------------------------
# Date resolution
# ---------------------------------------------------------------------------

def today_et() -> str:
    import subprocess
    try:
        out = subprocess.run(
            ["date", "+%Y-%m-%d"],
            env={**os.environ, "TZ": "America/New_York"},
            check=True, capture_output=True, text=True,
        ).stdout.strip()
        return out
    except Exception:
        return date.today().isoformat()


def resolve_date(arg: str | None) -> str:
    if not arg:
        return today_et()
    if not re.match(r"^\d{4}-\d{2}-\d{2}$", arg):
        sys.exit(f"Error: date '{arg}' must be YYYY-MM-DD")
    return arg


# ---------------------------------------------------------------------------
# Whisper transcription
# ---------------------------------------------------------------------------

MAX_FILE_BYTES = 25 * 1024 * 1024  # 25 MB Whisper limit


def transcribe(mp3_path: Path, api_key: str) -> str:
    try:
        import requests
    except ImportError:
        sys.exit(
            "Error: 'requests' is not installed.\n"
            "Fix: python3 -m pip install --user --break-system-packages requests"
        )

    size = mp3_path.stat().st_size
    if size > MAX_FILE_BYTES:
        sys.exit(
            f"Error: file is {size / 1024 / 1024:.1f} MB, "
            f"which exceeds the Whisper 25 MB limit.\n"
            f"The assembled episode may be too long."
        )

    print(f"Transcribing {mp3_path.name} ({size / 1024 / 1024:.1f} MB)...")
    print("This may take 1–3 minutes depending on episode length.")

    with open(mp3_path, "rb") as f:
        resp = requests.post(
            "https://api.openai.com/v1/audio/transcriptions",
            headers={"Authorization": f"Bearer {api_key}"},
            files={"file": (mp3_path.name, f, "audio/mpeg")},
            data={
                "model": "whisper-1",
                "response_format": "vtt",
                "language": "en",
            },
            timeout=300,
        )

    if not resp.ok:
        sys.exit(
            f"Error: Whisper API returned {resp.status_code}\n{resp.text[:500]}"
        )

    return resp.text


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    episode_date = resolve_date(sys.argv[1] if len(sys.argv) > 1 else None)
    api_key = require_env("OPENAI_API_KEY")

    mp3_path = EPISODES_DIR / f"The Morning Cup - {episode_date}.mp3"
    vtt_path = EPISODES_DIR / f"The Morning Cup - {episode_date}.vtt"

    if not mp3_path.is_file():
        sys.exit(
            f"Error: MP3 not found at {mp3_path}\n"
            f"Run 'scripts/morning-cup.sh build {episode_date}' first."
        )

    if vtt_path.is_file():
        print(f"Transcript already exists: {vtt_path}")
        print("Delete it first if you want to re-transcribe.")
        sys.exit(0)

    vtt_text = transcribe(mp3_path, api_key)

    vtt_path.write_text(vtt_text, encoding="utf-8")

    line_count = vtt_text.count("-->")
    print(f"\nDone. {line_count} caption segments written to:")
    print(f"  {vtt_path}")
    print()
    print("Upload the .vtt file to your podcast host as the episode transcript.")


if __name__ == "__main__":
    main()
