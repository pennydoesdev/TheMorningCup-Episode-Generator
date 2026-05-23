#!/usr/bin/env python3
"""
Write MP3 chapter markers (ID3v2 CHAP + CTOC frames) onto a rendered episode.

Reads chapter titles from the episode's manifest and computes each chapter's
start time by measuring chunk + sting + intro durations with ffprobe. Modern
podcast clients (Apple Podcasts, Overcast, Pocket Casts, Spotify, etc.) will
display the chapters as a clickable section list.

Usage:
    write-chapters.py <mp3_path> <manifest_path> <sounds_dir> <chunks_dir>

The script:
  1. Loads the manifest to get the chapters list and chunk metadata.
  2. Measures durations of intro song, coffee pour, optional intro sting,
     each chunk, and the section sting (inserted at section boundaries only).
  3. Walks the timeline (matching build-episode.sh's order) and computes
     each chapter's start timestamp.
  4. Writes ID3v2.3 CTOC (table of contents) + CHAP frames to the MP3.

If a chapter index doesn't have a corresponding chunk start, it shares the
timestamp of the most recently started chapter (so merged sections still
appear in the chapter list).
"""

import json
import os
import subprocess
import sys


def ffprobe_duration_ms(path: str) -> int:
    """Return clip duration in milliseconds via ffprobe."""
    if not os.path.isfile(path):
        return 0
    try:
        out = subprocess.run(
            [
                "ffprobe", "-v", "error",
                "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1",
                path,
            ],
            check=True, capture_output=True, text=True,
        ).stdout.strip()
        return int(round(float(out) * 1000))
    except (subprocess.CalledProcessError, ValueError):
        return 0


def main(mp3_path: str, manifest_path: str, sounds_dir: str, chunks_dir: str):
    if not os.path.isfile(mp3_path):
        sys.exit(f"MP3 not found: {mp3_path}")
    if not os.path.isfile(manifest_path):
        print(f"Manifest not found at {manifest_path}; skipping chapter markers.")
        return

    with open(manifest_path) as f:
        manifest = json.load(f)

    chapters = manifest.get("chapters", [])
    if not chapters:
        print("Manifest has no chapters; skipping chapter markers.")
        return

    chunks = manifest.get("chunks", [])
    if not chunks:
        print("Manifest has no chunks; skipping chapter markers.")
        return

    # Sound clip filenames must match build-episode.sh exactly.
    intro_song  = os.path.join(sounds_dir, "Hello.mp3")
    coffee_pour = os.path.join(sounds_dir, "Coffee Pour.wav")
    intro_sting = os.path.join(sounds_dir, "intro-sting.wav")
    section_st  = os.path.join(sounds_dir, "Topic Transition.mp3")

    intro_song_ms  = ffprobe_duration_ms(intro_song)
    coffee_pour_ms = ffprobe_duration_ms(coffee_pour)
    intro_sting_ms = ffprobe_duration_ms(intro_sting) if os.path.isfile(intro_sting) else 0
    section_st_ms  = ffprobe_duration_ms(section_st)

    # Build per-chunk full-path list, sorted by chunk order (manifest is
    # already ordered, but be defensive).
    sorted_chunks = sorted(chunks, key=lambda c: c["order"])

    # Walk the assembled timeline to find each chunk's start offset (ms).
    # Mirrors build-episode.sh: Spark.mp3 → Coffee Pour → [intro-sting] →
    # chunk[0] → [sting if chunk[1] starts a section] → chunk[1] → ...
    cursor_ms = intro_song_ms + coffee_pour_ms + intro_sting_ms
    chunk_starts_ms = []
    chunk_durations_ms = []
    for idx, ch in enumerate(sorted_chunks):
        path = os.path.join(chunks_dir, ch.get("filename", f"{idx+1:03d}.mp3"))
        # build-episode.sh saves chunks under Chunks/<DATE>/ as 001.mp3 etc;
        # the manifest filenames match the worker-side r2 names. Try the
        # short numeric form too if the long-name file doesn't exist.
        if not os.path.isfile(path):
            short = os.path.join(chunks_dir, f"{ch['order']:03d}.mp3")
            if os.path.isfile(short):
                path = short
        dur = ffprobe_duration_ms(path)
        chunk_starts_ms.append(cursor_ms)
        chunk_durations_ms.append(dur)
        cursor_ms += dur
        # Insert section sting only when the next chunk begins a new section
        # (starts_section_indices is non-empty). Matches smart sting logic in
        # build-episode.sh. Falls back to always inserting if no manifest data.
        if idx < len(sorted_chunks) - 1:
            next_chunk = sorted_chunks[idx + 1]
            starts_section = next_chunk.get("starts_section_indices", None)
            if starts_section is None or starts_section:
                cursor_ms += section_st_ms

    # Map each chapter index to its start timestamp.
    # A chunk's `starts_section_indices` lists section indices that begin in
    # that chunk. Walk chunks in order; for each section index found, that's
    # the start time of that chapter.
    chapter_starts = [None] * len(chapters)
    for i, ch in enumerate(sorted_chunks):
        for section_idx in ch.get("starts_section_indices", []):
            if 0 <= section_idx < len(chapter_starts):
                chapter_starts[section_idx] = chunk_starts_ms[i]

    # Fallback: any chapter that didn't get assigned a start time (shouldn't
    # happen if the model + chunker are aligned, but be defensive) inherits
    # the most recent assigned start.
    last_seen = 0
    for i in range(len(chapter_starts)):
        if chapter_starts[i] is None:
            chapter_starts[i] = last_seen
        else:
            last_seen = chapter_starts[i]

    # Total duration = current cursor + outro (read it from the file we just
    # rendered; cursor doesn't include outro).
    file_duration_ms = ffprobe_duration_ms(mp3_path)

    # Build (start_ms, end_ms, title) tuples.
    chapter_tuples = []
    for i, chap in enumerate(chapters):
        start = chapter_starts[i]
        end = chapter_starts[i + 1] if i + 1 < len(chapters) else file_duration_ms
        title = chap.get("title") or f"Chapter {i + 1}"
        chapter_tuples.append((start, max(end, start + 1), title))

    # Write CTOC + CHAP frames via mutagen.
    try:
        from mutagen.id3 import ID3, ID3NoHeaderError, CTOC, CHAP, TIT2, CTOCFlags
    except ImportError:
        print(
            "mutagen is not available; chapter markers were not written. "
            "Install with: python3 -m pip install --user --break-system-packages mutagen"
        )
        return

    try:
        audio = ID3(mp3_path)
    except ID3NoHeaderError:
        audio = ID3()

    # Remove any prior CHAP/CTOC frames so we don't double up.
    for key in list(audio.keys()):
        if key.startswith("CHAP") or key.startswith("CTOC"):
            del audio[key]

    chapter_ids = []
    for i, (start_ms, end_ms, title) in enumerate(chapter_tuples):
        elem_id = f"chp{i}"
        chapter_ids.append(elem_id)
        audio.add(CHAP(
            element_id=elem_id,
            start_time=int(start_ms),
            end_time=int(end_ms),
            start_offset=0xFFFFFFFF,
            end_offset=0xFFFFFFFF,
            sub_frames=[TIT2(encoding=3, text=title)],
        ))

    audio.add(CTOC(
        element_id="toc",
        flags=CTOCFlags.TOP_LEVEL | CTOCFlags.ORDERED,
        child_element_ids=chapter_ids,
        sub_frames=[TIT2(encoding=3, text="Chapters")],
    ))

    audio.save(mp3_path, v2_version=3)
    print(f"Wrote {len(chapter_tuples)} chapter markers to {mp3_path}")


if __name__ == "__main__":
    if len(sys.argv) != 5:
        print("Usage: write-chapters.py <mp3_path> <manifest_path> <sounds_dir> <chunks_dir>", file=sys.stderr)
        sys.exit(2)
    main(sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4])
