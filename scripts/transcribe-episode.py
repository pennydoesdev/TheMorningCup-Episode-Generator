#!/usr/bin/env python3
"""
Transcribe a finished Morning Cup episode and write timestamped transcript files.

Outputs two files alongside the MP3:
    The Morning Cup - <DATE>.srt   (SubRip — most podcast hosts accept this)
    The Morning Cup - <DATE>.vtt   (WebVTT — for web players)

Usage:
    transcribe-episode.py [DATE]
    transcribe-episode.py 2026-05-22

    DATE defaults to today (America/New_York).

Provider auto-selection (fastest/cheapest first):
    1. Groq API         — $0.01/episode, ~16 sec  (set GROQ_API_KEY in .env)
    2. mlx-whisper      — free, ~2 min on Apple Silicon
                          pip install mlx-whisper
    3. faster-whisper   — free, ~3-5 min on CPU/GPU
                          pip install faster-whisper
    4. OpenAI API       — $0.10/episode, ~60 sec  (set OPENAI_API_KEY in .env)

Model used everywhere: whisper-large-v3-turbo
    Near-identical accuracy to large-v3 at 2-6x faster speed.
"""

import os
import re
import sys
from datetime import date
from pathlib import Path


ROOT         = Path.home() / "Documents" / "The Morning Cup"
ENV_FILE     = ROOT / ".env"
EPISODES_DIR = ROOT / "Episodes"

GROQ_BASE    = "https://api.groq.com/openai/v1"
OPENAI_BASE  = "https://api.openai.com/v1"
GROQ_MODEL   = "whisper-large-v3-turbo"
OPENAI_MODEL = "whisper-1"
LOCAL_MODEL  = "mlx-community/whisper-large-v3-turbo"     # mlx-whisper
FW_MODEL     = "large-v3-turbo"                            # faster-whisper

MAX_FILE_BYTES = 25 * 1024 * 1024  # Whisper API 25 MB limit


# ---------------------------------------------------------------------------
# Environment
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


# ---------------------------------------------------------------------------
# Date helpers
# ---------------------------------------------------------------------------

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
    d = arg or today_et()
    if not re.match(r"^\d{4}-\d{2}-\d{2}$", d):
        sys.exit(f"Error: date '{d}' must be YYYY-MM-DD")
    return d


# ---------------------------------------------------------------------------
# Timestamp formatting
# ---------------------------------------------------------------------------

def _fmt(seconds: float, sep: str) -> str:
    ms = int(round(seconds * 1000))
    s, ms = divmod(ms, 1000)
    m, s  = divmod(s, 60)
    h, m  = divmod(m, 60)
    return f"{h:02d}:{m:02d}:{s:02d}{sep}{ms:03d}"


def srt_time(s: float) -> str: return _fmt(s, ",")
def vtt_time(s: float) -> str: return _fmt(s, ".")


# ---------------------------------------------------------------------------
# Transcript builders
# ---------------------------------------------------------------------------

Segment = dict  # {"start": float, "end": float, "text": str}


def to_srt(segments: list[Segment]) -> str:
    lines = []
    for i, seg in enumerate(segments, 1):
        lines += [
            str(i),
            f"{srt_time(seg['start'])} --> {srt_time(seg['end'])}",
            seg["text"].strip(),
            "",
        ]
    return "\n".join(lines)


def to_vtt(segments: list[Segment]) -> str:
    lines = ["WEBVTT", ""]
    for seg in segments:
        lines += [
            f"{vtt_time(seg['start'])} --> {vtt_time(seg['end'])}",
            seg["text"].strip(),
            "",
        ]
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Provider: Groq or OpenAI (same request shape, different base URL + model)
# ---------------------------------------------------------------------------

def _transcribe_api(mp3_path: Path, api_key: str, base_url: str, model: str,
                    label: str) -> list[Segment]:
    try:
        import requests
    except ImportError:
        sys.exit("Error: requests not installed.\n"
                 "Fix: pip install --user --break-system-packages requests")

    size = mp3_path.stat().st_size
    if size > MAX_FILE_BYTES:
        sys.exit(f"Error: {mp3_path.name} is {size/1024/1024:.1f} MB — "
                 f"exceeds the 25 MB API limit.")

    print(f"Provider : {label}")
    print(f"File     : {mp3_path.name}  ({size/1024/1024:.1f} MB)")
    print("Sending to API…")

    with open(mp3_path, "rb") as fh:
        resp = requests.post(
            f"{base_url}/audio/transcriptions",
            headers={"Authorization": f"Bearer {api_key}"},
            files={"file": (mp3_path.name, fh, "audio/mpeg")},
            data={
                "model": model,
                "response_format": "verbose_json",
                "language": "en",
                "timestamp_granularities[]": "segment",
            },
            timeout=300,
        )

    if not resp.ok:
        sys.exit(f"API error {resp.status_code}:\n{resp.text[:600]}")

    return [
        {"start": s["start"], "end": s["end"], "text": s["text"]}
        for s in resp.json().get("segments", [])
    ]


def transcribe_groq(mp3_path: Path, api_key: str) -> list[Segment]:
    return _transcribe_api(mp3_path, api_key, GROQ_BASE, GROQ_MODEL, "Groq  (whisper-large-v3-turbo)")


def transcribe_openai(mp3_path: Path, api_key: str) -> list[Segment]:
    return _transcribe_api(mp3_path, api_key, OPENAI_BASE, OPENAI_MODEL, "OpenAI (whisper-1)")


# ---------------------------------------------------------------------------
# Provider: mlx-whisper (Apple Silicon, fastest local option)
# ---------------------------------------------------------------------------

def transcribe_mlx(mp3_path: Path) -> list[Segment]:
    try:
        import mlx_whisper  # type: ignore
    except ImportError:
        return []

    print(f"Provider : mlx-whisper  ({LOCAL_MODEL})")
    print(f"File     : {mp3_path.name}")
    print("Transcribing locally (Apple Silicon)…")

    result = mlx_whisper.transcribe(
        str(mp3_path),
        path_or_hf_repo=LOCAL_MODEL,
        language="en",
    )
    return [
        {"start": s["start"], "end": s["end"], "text": s["text"]}
        for s in result.get("segments", [])
    ]


# ---------------------------------------------------------------------------
# Provider: faster-whisper (CPU/GPU, cross-platform)
# ---------------------------------------------------------------------------

def transcribe_faster_whisper(mp3_path: Path) -> list[Segment]:
    try:
        from faster_whisper import WhisperModel  # type: ignore
    except ImportError:
        return []

    print(f"Provider : faster-whisper  ({FW_MODEL})")
    print(f"File     : {mp3_path.name}")
    print("Transcribing locally (this may take a few minutes)…")

    model = WhisperModel(FW_MODEL, device="auto", compute_type="auto")
    segs, _ = model.transcribe(str(mp3_path), language="en")
    return [{"start": s.start, "end": s.end, "text": s.text} for s in segs]


# ---------------------------------------------------------------------------
# Provider selection
# ---------------------------------------------------------------------------

def pick_provider(mp3_path: Path) -> list[Segment]:
    # 1. Groq  — cheapest API (~$0.01/episode)
    groq_key = os.environ.get("GROQ_API_KEY", "")
    if groq_key:
        return transcribe_groq(mp3_path, groq_key)

    # 2. mlx-whisper — free, fastest on Apple Silicon
    try:
        import mlx_whisper  # type: ignore
        segs = transcribe_mlx(mp3_path)
        if segs:
            return segs
    except Exception:
        pass

    # 3. faster-whisper — free, cross-platform
    try:
        from faster_whisper import WhisperModel  # type: ignore
        segs = transcribe_faster_whisper(mp3_path)
        if segs:
            return segs
    except Exception:
        pass

    # 4. OpenAI — fallback API (~$0.10/episode)
    openai_key = os.environ.get("OPENAI_API_KEY", "")
    if openai_key:
        return transcribe_openai(mp3_path, openai_key)

    sys.exit(
        "No transcription provider available.\n\n"
        "Pick one of:\n"
        "  A) Groq API (cheapest, $0.01/episode):\n"
        f"       echo 'GROQ_API_KEY=\"gsk_...\"' >> \"{ENV_FILE}\"\n\n"
        "  B) Free local (Apple Silicon):\n"
        "       pip install --user --break-system-packages mlx-whisper\n\n"
        "  C) Free local (any Mac/Linux):\n"
        "       pip install --user --break-system-packages faster-whisper\n\n"
        "  D) OpenAI API ($0.10/episode):\n"
        f"       echo 'OPENAI_API_KEY=\"sk-...\"' >> \"{ENV_FILE}\""
    )


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    load_env()
    episode_date = resolve_date(sys.argv[1] if len(sys.argv) > 1 else None)

    mp3_path = EPISODES_DIR / f"The Morning Cup - {episode_date}.mp3"
    srt_path = EPISODES_DIR / f"The Morning Cup - {episode_date}.srt"
    vtt_path = EPISODES_DIR / f"The Morning Cup - {episode_date}.vtt"

    if not mp3_path.is_file():
        sys.exit(
            f"Error: MP3 not found:\n  {mp3_path}\n"
            f"Run 'morning-cup.sh build {episode_date}' first."
        )

    if srt_path.is_file() and vtt_path.is_file():
        print(f"Transcripts already exist for {episode_date}.")
        print(f"  {srt_path.name}")
        print(f"  {vtt_path.name}")
        print("Delete them first to re-transcribe.")
        sys.exit(0)

    print(f"\nTranscribing: The Morning Cup — {episode_date}")
    print("-" * 50)

    segments = pick_provider(mp3_path)

    if not segments:
        sys.exit("Error: transcription returned no segments.")

    srt_text = to_srt(segments)
    vtt_text = to_vtt(segments)

    srt_path.write_text(srt_text, encoding="utf-8")
    vtt_path.write_text(vtt_text, encoding="utf-8")

    duration = segments[-1]["end"] if segments else 0
    m, s = divmod(int(duration), 60)

    print(f"\nDone — {len(segments)} segments  ({m}:{s:02d} covered)")
    print(f"  {srt_path.name}  ← upload to your podcast host")
    print(f"  {vtt_path.name}  ← for web players")
    print()
    print("Most hosts (Buzzsprout, Transistor, Spotify for Podcasters) accept .srt directly.")


if __name__ == "__main__":
    main()
