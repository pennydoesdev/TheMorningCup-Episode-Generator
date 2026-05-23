#!/usr/bin/env python3
"""
generate-transcript.py — Build a clean text transcript and a section-timed
SRT subtitle file from a Morning Cup episode.

Usage:
    generate-transcript.py <manifest_path> <chunks_dir> [output_dir]

Inputs:
    manifest_path  Path to The Morning Cup - YYYY-MM-DD - manifest.json
    chunks_dir     Directory containing the episode's MP3 chunks
    output_dir     Where to write outputs (default: same dir as manifest)

Outputs:
    The Morning Cup - YYYY-MM-DD.txt  — clean plain-text transcript
    The Morning Cup - YYYY-MM-DD.srt  — SRT file with section timestamps

The episode JSON (The Morning Cup - YYYY-MM-DD.json) must be present in the
same directory as the manifest — fetch-chunks.sh downloads it automatically.

Requires: ffprobe (from ffmpeg)
"""

import json
import os
import re
import subprocess
import sys

SPACER = "[TEN-SECOND SECTION SPACER]"
PACING_TAGS = re.compile(
    r'\[(pause|gentle pause|beat|reflective pause|lower|firmer|warmly)\]',
    re.IGNORECASE,
)


def ffprobe_duration_ms(path: str) -> int:
    """Return clip duration in milliseconds via ffprobe."""
    if not os.path.isfile(path):
        return 0
    try:
        out = subprocess.run(
            ["ffprobe", "-v", "error",
             "-show_entries", "format=duration",
             "-of", "default=noprint_wrappers=1:nokey=1",
             path],
            check=True, capture_output=True, text=True,
        ).stdout.strip()
        return int(round(float(out) * 1000))
    except (subprocess.CalledProcessError, ValueError):
        return 0


def ms_to_srt(ms: int) -> str:
    """Convert milliseconds to SRT timestamp HH:MM:SS,mmm."""
    h = ms // 3_600_000
    ms %= 3_600_000
    m = ms // 60_000
    ms %= 60_000
    s = ms // 1000
    ms %= 1000
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def clean_text(text: str) -> str:
    """Strip pacing tags and normalize whitespace."""
    text = PACING_TAGS.sub("", text)
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()


def main(manifest_path: str, chunks_dir: str, output_dir: str) -> None:
    if not os.path.isfile(manifest_path):
        sys.exit(f"Manifest not found: {manifest_path}")

    with open(manifest_path) as f:
        manifest = json.load(f)

    date = manifest.get("episode_date", "unknown")
    chunks = sorted(manifest.get("chunks", []), key=lambda c: c["order"])
    chapters = manifest.get("chapters", [])

    if not chunks:
        sys.exit("Manifest has no chunks.")

    os.makedirs(output_dir, exist_ok=True)
    base = f"The Morning Cup - {date}"

    # ── Episode JSON (for script text) ──────────────────────────────────────
    episode_json = os.path.join(os.path.dirname(manifest_path), f"{base}.json")
    if not os.path.isfile(episode_json):
        sys.exit(
            f"Episode JSON not found: {episode_json}\n"
            "Run fetch-chunks.sh first — it downloads the episode JSON automatically."
        )

    with open(episode_json) as f:
        episode = json.load(f)

    script_raw = episode.get("elevenlabs_script", "")
    if not script_raw:
        sys.exit("Episode JSON has no elevenlabs_script field.")

    # ── Plain-text transcript ────────────────────────────────────────────────
    # Replace spacer markers with section headers from chapter list
    sections = [s.strip() for s in script_raw.split(SPACER)]
    txt_lines = [f"The Morning Cup — {date}", "=" * 50, ""]
    for i, section_text in enumerate(sections):
        if not section_text:
            continue
        if i < len(chapters):
            title = chapters[i]["title"]
            txt_lines.append(f"[{title}]")
            txt_lines.append("")
        txt_lines.append(clean_text(section_text))
        txt_lines.append("")

    txt_path = os.path.join(output_dir, f"{base}.txt")
    with open(txt_path, "w") as f:
        f.write("\n".join(txt_lines))
    print(f"Transcript: {txt_path}")

    # ── Section timestamps via ffprobe ───────────────────────────────────────
    # Mirror write-chapters.py duration logic to get accurate section times.
    sounds_dir = os.path.normpath(
        os.path.join(os.path.dirname(manifest_path), "..", "..", "..", "..", "Sounds")
    )

    intro_ms = (
        ffprobe_duration_ms(os.path.join(sounds_dir, "Hello.mp3"))
        + ffprobe_duration_ms(os.path.join(sounds_dir, "Coffee Pour.wav"))
    )
    intro_sting = os.path.join(sounds_dir, "intro-sting.wav")
    if os.path.isfile(intro_sting):
        intro_ms += ffprobe_duration_ms(intro_sting)

    section_sting_ms = ffprobe_duration_ms(
        os.path.join(sounds_dir, "Topic Transition.mp3")
    )

    cursor_ms = intro_ms
    chunk_starts: list[int] = []
    for i, ch in enumerate(chunks):
        path = os.path.join(chunks_dir, ch.get("filename", ""))
        if not os.path.isfile(path):
            path = os.path.join(chunks_dir, f"{ch['order']:03d}.mp3")
        chunk_starts.append(cursor_ms)
        cursor_ms += ffprobe_duration_ms(path)
        if i < len(chunks) - 1:
            starts = chunks[i + 1].get("starts_section_indices", None)
            if starts is None or starts:
                cursor_ms += section_sting_ms

    total_ms = cursor_ms

    # Map each chapter index → its start timestamp
    chapter_starts: list[int | None] = [None] * len(chapters)
    for i, ch in enumerate(chunks):
        for section_idx in ch.get("starts_section_indices", []):
            if 0 <= section_idx < len(chapter_starts):
                chapter_starts[section_idx] = chunk_starts[i]

    last_seen = intro_ms
    for i in range(len(chapter_starts)):
        if chapter_starts[i] is None:
            chapter_starts[i] = last_seen
        else:
            last_seen = chapter_starts[i]

    # ── SRT file ─────────────────────────────────────────────────────────────
    srt_path = os.path.join(output_dir, f"{base}.srt")
    with open(srt_path, "w") as f:
        for i, chapter in enumerate(chapters):
            start_ms = chapter_starts[i] if i < len(chapter_starts) else 0
            end_ms = (
                chapter_starts[i + 1]
                if i + 1 < len(chapter_starts) and chapter_starts[i + 1]
                else total_ms
            )
            if end_ms <= start_ms:
                end_ms = start_ms + 30_000

            # Get section text and truncate for subtitle readability
            section_text = sections[i] if i < len(sections) else ""
            section_text = clean_text(section_text)
            if len(section_text) > 600:
                section_text = section_text[:600].rsplit(" ", 1)[0] + " [...]"

            f.write(f"{i + 1}\n")
            f.write(f"{ms_to_srt(start_ms)} --> {ms_to_srt(end_ms)}\n")
            f.write(f"[{chapter['title']}]\n")
            f.write(f"{section_text}\n\n")

    print(f"SRT:        {srt_path}")
    print(f"Sections:   {len(chapters)}")
    print(f"Duration:   {ms_to_srt(total_ms)}")


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(
            "Usage: generate-transcript.py <manifest_path> <chunks_dir> [output_dir]",
            file=sys.stderr,
        )
        sys.exit(2)
    manifest_arg = sys.argv[1]
    chunks_arg = sys.argv[2]
    output_arg = sys.argv[3] if len(sys.argv) > 3 else os.path.dirname(manifest_arg)
    main(manifest_arg, chunks_arg, output_arg)
