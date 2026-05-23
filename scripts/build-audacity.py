#!/usr/bin/env python3
"""
build-audacity.py — Generate a multi-track Audacity .aup3 project for a Morning Cup episode.

Each component of the episode gets its own named, colour-coded track at the correct
timeline offset so every element is independently editable:

  GREEN  — Intro (Hello.mp3)
  ORANGE — Coffee Pour.wav
  ORANGE — Intro Sting (intro-sting.wav, if present)
  BLUE   — [001] Chapter title  (one per TTS chunk)
  ORANGE — Section Transition   (between section-starting chunks)
   …
  GREEN  — Outro (Goodbye.mp3)
  YELLOW — Background Music (Podcast Background.mp3, if present; starts at 0)
  LABELS — Chapter Markers label track (one label per section, timestamps exact)

Usage:
    python3 scripts/build-audacity.py              # auto-detects latest date
    python3 scripts/build-audacity.py 2026-05-23   # specific date

Requires:
    ffmpeg / ffprobe  (already a pipeline dependency)
    numpy             pip install --user --break-system-packages numpy

Output (written to ~/Documents/The Morning Cup/Episodes/):
    The Morning Cup - DATE.aup3         ← open directly in Audacity 3.x
    The Morning Cup - DATE - labels.txt ← backup; File > Import > Labels
"""

import argparse
import json
import math
import os
import sqlite3
import subprocess
import sys
from pathlib import Path

# ── Paths ────────────────────────────────────────────────────────────────────
ROOT        = Path.home() / "Documents" / "The Morning Cup"
CHUNKS_BASE = ROOT / "Chunks"
EPISODES    = ROOT / "Episodes"
SOUNDS      = ROOT / "Sounds"

# ── Audacity constants ───────────────────────────────────────────────────────
BLOCK_SIZE   = 262144     # 2^18 samples — Audacity's internal block size
SAMPLE_RATE  = 44100
FLOAT32_FMT  = 0x0004000F # floatSample enum in Audacity source (= 262159)

# Track colour indices (Audacity 3.x colourindex attribute)
COLOR_GREEN  = 2
COLOR_ORANGE = 1
COLOR_BLUE   = 0
COLOR_YELLOW = 3
COLOR_RED    = 4


# ════════════════════════════════════════════════════════════════════════════
# Helpers
# ════════════════════════════════════════════════════════════════════════════

def _np():
    try:
        import numpy as np
        return np
    except ImportError:
        print("\nERROR: numpy is required for .aup3 generation.", file=sys.stderr)
        print("       Install it with:", file=sys.stderr)
        print("       pip install --user --break-system-packages numpy\n", file=sys.stderr)
        sys.exit(1)


def ffprobe_duration(path: Path) -> float:
    """Return exact duration of an audio file in seconds via ffprobe."""
    try:
        r = subprocess.run(
            ["ffprobe", "-v", "error",
             "-show_entries", "format=duration",
             "-of", "default=noprint_wrappers=1:nokey=1",
             str(path)],
            capture_output=True, text=True, check=True)
        return float(r.stdout.strip())
    except Exception:
        return 0.0


def decode_mono_f32(path: Path, label: str) -> bytes:
    """
    Decode any audio file to mono float32 PCM at SAMPLE_RATE using ffmpeg.
    Returns raw bytes (4 bytes per sample, little-endian float32).
    """
    print(f"    decoding  {label} ...", end="", flush=True)
    r = subprocess.run(
        ["ffmpeg", "-i", str(path),
         "-f", "f32le", "-ar", str(SAMPLE_RATE), "-ac", "1", "-"],
        capture_output=True)
    if r.returncode != 0:
        print(f" FAILED — {r.stderr[-200:].decode(errors='replace')}", file=sys.stderr)
        return b""
    n = len(r.stdout) // 4
    print(f" {n:,} samples ({n/SAMPLE_RATE:.1f}s)")
    return r.stdout


# ════════════════════════════════════════════════════════════════════════════
# SQLite sampleblocks encoder
# ════════════════════════════════════════════════════════════════════════════

def insert_audio_blocks(pcm_bytes: bytes, db: sqlite3.Connection) -> list[tuple[int, int]]:
    """
    Split float32 PCM into BLOCK_SIZE blocks, compute Audacity summaries,
    insert into sampleblocks table.
    Returns list of (blockid, n_samples) in order.
    """
    if not pcm_bytes:
        return []

    np = _np()
    samples = np.frombuffer(pcm_bytes, dtype="<f4")
    n_total = len(samples)
    results = []
    cur = db.cursor()

    for i in range(max(1, math.ceil(n_total / BLOCK_SIZE))):
        chunk = samples[i * BLOCK_SIZE : (i + 1) * BLOCK_SIZE].astype(np.float32)
        n = len(chunk)
        if n == 0:
            break

        # ── summary256: one (min, max, rms) triple per 256-sample bucket ──
        pad256   = (-n) % 256
        s256     = np.concatenate([chunk, np.zeros(pad256, dtype=np.float32)])
        r256     = s256.reshape(-1, 256)
        mn256    = r256.min(axis=1).astype(np.float32)
        mx256    = r256.max(axis=1).astype(np.float32)
        rms256   = np.sqrt((r256.astype(np.float64) ** 2).mean(axis=1)).astype(np.float32)
        sum256   = np.stack([mn256, mx256, rms256], axis=1).tobytes()

        # ── summary64k: one triple per 65536-sample bucket ──
        pad64k   = (-n) % 65536
        s64k     = np.concatenate([chunk, np.zeros(pad64k, dtype=np.float32)])
        r64k     = s64k.reshape(-1, 65536)
        mn64k    = r64k.min(axis=1).astype(np.float32)
        mx64k    = r64k.max(axis=1).astype(np.float32)
        rms64k   = np.sqrt((r64k.astype(np.float64) ** 2).mean(axis=1)).astype(np.float32)
        sum64k   = np.stack([mn64k, mx64k, rms64k], axis=1).tobytes()

        summin = float(chunk.min())
        summax = float(chunk.max())
        sumrms = float(np.sqrt((chunk.astype(np.float64) ** 2).mean()))

        cur.execute(
            "INSERT INTO sampleblocks "
            "(sampleformat, summin, summax, sumrms, summary256, summary64k, samples) "
            "VALUES (?,?,?,?,?,?,?)",
            (FLOAT32_FMT, summin, summax, sumrms, sum256, sum64k, chunk.tobytes()))
        results.append((cur.lastrowid, n))

    db.commit()
    return results


# ════════════════════════════════════════════════════════════════════════════
# XML builders
# ════════════════════════════════════════════════════════════════════════════

def _esc(s: str) -> str:
    return s.replace("&", "&amp;").replace("<", "&lt;").replace('"', "&quot;")


def xml_wavetrack(name: str, offset_sec: float, blocks: list[tuple[int, int]],
                  n_total_samples: int, color: int = 0, height: int = 90) -> str:
    """Build one <wavetrack> XML element placed at offset_sec in the timeline."""
    block_xml = []
    pos = 0
    for blockid, n in blocks:
        block_xml.append(
            f'      <waveblock start="{pos}">'
            f'<blockfile blockid="{blockid}"/></waveblock>')
        pos += n

    return (
        f'  <wavetrack name="{_esc(name)}" rate="{SAMPLE_RATE}" '
        f'channel="0" linked="0" mute="0" solo="0" height="{height}" '
        f'minimized="0" isSelected="0" gain="1.0" pan="0.0" colorindex="{color}">\n'
        f'    <waveclip offset="{offset_sec:.8f}" colorindex="{color}">\n'
        f'      <sequence maxsamples="{BLOCK_SIZE}" sampleformat="{FLOAT32_FMT}" '
        f'numsamples="{n_total_samples}">\n'
        + "\n".join(block_xml)
        + f'\n      </sequence>\n'
          f'    </waveclip>\n'
          f'  </wavetrack>'
    )


def xml_labeltrack(labels: list[tuple[float, str]]) -> str:
    """Build the <labeltrack> Chapter Markers element."""
    lines = []
    for t, title in labels:
        lines.append(f'    <label t="{t:.8f}" t1="{t:.8f}" title="{_esc(title)}"/>')
    return (
        f'  <labeltrack name="Chapter Markers" numlabels="{len(labels)}" '
        f'height="73" minimized="0">\n'
        + "\n".join(lines)
        + f'\n  </labeltrack>'
    )


def build_project_xml(wavetracks_xml: list[str], labeltrack_xml: str,
                      title: str, year: str) -> str:
    body = "\n".join(wavetracks_xml) + "\n" + labeltrack_xml
    return (
        '<?xml version="1.0" standalone="no" ?>\n'
        '<!DOCTYPE project PUBLIC "-//audacityproject-1.3.0//DTD//EN" '
        '"http://audacity.sourceforge.net/xml/audacityproject-1.3.0.dtd" >\n'
        '<project xmlns="http://audacity.sourceforge.net/xml/"'
        f' projname="{_esc(title)}"'
        ' version="1.3.0" audacityversion="3.3.3"'
        ' sel0="0.0000000" sel1="0.0000000"'
        ' vpos="0" h="0.0" zoom="86.1328125"'
        f' rate="{float(SAMPLE_RATE)}"'
        ' snapto="off"'
        ' selectionformat="hh:mm:ss + milliseconds"'
        ' audiotimeformat="hh:mm:ss + milliseconds"'
        ' frequencyformat="MHz"'
        ' bandwidthformat="Octaves">\n'
        '  <tags>\n'
        f'    <tag name="TITLE" value="{_esc(title)}"/>\n'
        f'    <tag name="ARTIST" value="Fold 42"/>\n'
        f'    <tag name="ALBUM" value="The Morning Cup"/>\n'
        f'    <tag name="YEAR" value="{year}"/>\n'
        '  </tags>\n'
        + body + '\n'
        '</project>'
    )


# ════════════════════════════════════════════════════════════════════════════
# Track-list builder  (mirrors build-episode.sh assembly logic exactly)
# ════════════════════════════════════════════════════════════════════════════

class TrackSpec:
    def __init__(self, path: Path, name: str, offset_sec: float, color: int):
        self.path       = path
        self.name       = name
        self.offset_sec = offset_sec
        self.color      = color


def build_track_list(
    date: str, manifest: dict
) -> tuple[list[TrackSpec], list[tuple[float, str]]]:
    """
    Walk the assembly sequence identical to build-episode.sh and return:
      tracks  — one TrackSpec per audio file, with the correct timeline offset
      labels  — (time_sec, chapter_title) pairs for the label track
    """
    chunks_dir  = CHUNKS_BASE / date
    chunk_files = sorted(chunks_dir.glob("*.mp3"), key=lambda p: p.name)
    if not chunk_files:
        print(f"ERROR: no chunk MP3s found in {chunks_dir}", file=sys.stderr)
        sys.exit(1)

    chunks_meta = sorted(manifest.get("chunks", []), key=lambda c: c["order"])
    chapters    = manifest.get("chapters", [])

    hello_p   = SOUNDS / "Hello.mp3"
    coffee_p  = SOUNDS / "Coffee Pour.wav"
    sting_p   = SOUNDS / "intro-sting.wav"      # optional
    section_p = SOUNDS / "Topic Transition.mp3"
    outro_p   = SOUNDS / "Goodbye.mp3"
    bg_p      = SOUNDS / "Podcast Background.mp3"   # optional

    tracks : list[TrackSpec]         = []
    labels : list[tuple[float, str]] = []
    t = 0.0

    def add(path: Path, name: str, color: int, label: str = "") -> float:
        nonlocal t
        if not path.exists():
            return 0.0
        d = ffprobe_duration(path)
        tracks.append(TrackSpec(path, name, t, color))
        if label:
            labels.append((round(t, 6), label))
        t += d
        return d

    # ── Intro ──────────────────────────────────────────────────────────────
    add(hello_p,  "Intro — Hello.mp3",    COLOR_GREEN,  "Intro")
    add(coffee_p, "Coffee Pour.wav",       COLOR_ORANGE)
    add(sting_p,  "Intro Sting",           COLOR_ORANGE)

    # ── Chunks + section transitions ───────────────────────────────────────
    section_dur  = ffprobe_duration(section_p) if section_p.exists() else 0.0
    starts_sec   = [bool(c.get("starts_section_indices")) for c in chunks_meta]

    for i, cf in enumerate(chunk_files):
        if i >= len(chunks_meta):
            break
        meta      = chunks_meta[i]
        idx_list  = meta.get("starts_section_indices", [])
        chunk_dur = ffprobe_duration(cf)

        # Determine the most meaningful chapter title for this chunk
        if idx_list and idx_list[0] < len(chapters):
            ch_title = chapters[idx_list[0]].get("title", f"Section {idx_list[0]+1}")
        else:
            ch_title = f"Chunk {i+1:03d}"

        track_name = f"[{i+1:03d}]  {ch_title}"
        tracks.append(TrackSpec(cf, track_name, t, COLOR_BLUE))
        if idx_list:
            labels.append((round(t, 6), ch_title))
        t += chunk_dur

        # Insert transition sting before the next chunk if it opens a new section
        nxt = i + 1
        if nxt < len(chunks_meta) and section_p.exists():
            if nxt < len(starts_sec) and starts_sec[nxt]:
                tracks.append(TrackSpec(
                    section_p,
                    f"Section Transition  →  [{nxt+1:03d}]",
                    t, COLOR_ORANGE))
                t += section_dur

    # ── Outro ──────────────────────────────────────────────────────────────
    add(outro_p, "Outro — Goodbye.mp3", COLOR_GREEN, "Outro")

    # ── Background music (full-length loop starting at t=0) ────────────────
    if bg_p.exists():
        tracks.append(TrackSpec(
            bg_p,
            "Background Music  (loop — see note below)",
            0.0,
            COLOR_YELLOW))

    return tracks, labels


# ════════════════════════════════════════════════════════════════════════════
# .aup3 writer
# ════════════════════════════════════════════════════════════════════════════

def write_aup3(output_path: Path, tracks: list[TrackSpec],
               labels: list[tuple[float, str]], title: str, year: str) -> None:
    """Create the Audacity .aup3 SQLite project file."""
    if output_path.exists():
        output_path.unlink()

    db = sqlite3.connect(str(output_path))
    db.execute("PRAGMA journal_mode=WAL")

    for stmt in [
        """CREATE TABLE project (
             id   INTEGER PRIMARY KEY,
             dict TEXT NOT NULL)""",
        """CREATE TABLE autosave (
             id   INTEGER PRIMARY KEY,
             dict TEXT NOT NULL)""",
        """CREATE TABLE tags (
             name  TEXT NOT NULL,
             value TEXT NOT NULL)""",
        """CREATE TABLE sampleblocks (
             blockid      INTEGER PRIMARY KEY AUTOINCREMENT,
             sampleformat INTEGER NOT NULL,
             summin       REAL    NOT NULL,
             summax       REAL    NOT NULL,
             sumrms       REAL    NOT NULL,
             summary256   BLOB    NOT NULL,
             summary64k   BLOB    NOT NULL,
             samples      BLOB    NOT NULL)""",
    ]:
        db.execute(stmt)
    db.commit()

    wavetracks_xml: list[str] = []

    total_tracks = len(tracks)
    for idx, spec in enumerate(tracks, 1):
        print(f"  [{idx}/{total_tracks}]  {spec.name}")
        pcm = decode_mono_f32(spec.path, spec.name)
        if not pcm:
            print(f"         ⚠️  skipped (decode failed)")
            continue

        n_total = len(pcm) // 4
        blocks  = insert_audio_blocks(pcm, db)

        # Use taller height for chunk tracks, shorter for stings
        is_chunk = spec.color == COLOR_BLUE
        h = 110 if is_chunk else 70

        wavetracks_xml.append(
            xml_wavetrack(spec.name, spec.offset_sec, blocks, n_total, spec.color, h))

    labeltrack_xml  = xml_labeltrack(labels)
    project_xml     = build_project_xml(wavetracks_xml, labeltrack_xml, title, year)

    db.execute("INSERT INTO project (id, dict) VALUES (1, ?)", (project_xml,))
    db.commit()
    db.close()

    print(f"\n  Project XML: {len(project_xml):,} chars, "
          f"{len(wavetracks_xml)} audio tracks, {len(labels)} labels")


# ════════════════════════════════════════════════════════════════════════════
# Labels .txt writer  (Audacity: File > Import > Labels)
# ════════════════════════════════════════════════════════════════════════════

def write_labels_txt(path: Path, labels: list[tuple[float, str]]) -> None:
    with open(path, "w") as f:
        for t, title in labels:
            f.write(f"{t:.6f}\t{t:.6f}\t{title}\n")
    print(f"  Labels backup: {path}")


# ════════════════════════════════════════════════════════════════════════════
# Entry point
# ════════════════════════════════════════════════════════════════════════════

def auto_date() -> str:
    try:
        dates = sorted(
            [d.name for d in CHUNKS_BASE.iterdir()
             if d.is_dir() and len(d.name) == 10 and d.name.count("-") == 2],
            reverse=True)
        if dates:
            return dates[0]
    except FileNotFoundError:
        pass
    print("ERROR: no episode folders found in " + str(CHUNKS_BASE), file=sys.stderr)
    sys.exit(1)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Build an Audacity .aup3 multi-track project for The Morning Cup.")
    parser.add_argument(
        "date", nargs="?",
        help="Episode date YYYY-MM-DD (default: auto-detects latest)")
    args = parser.parse_args()

    date = args.date or auto_date()
    if len(date) != 10 or date.count("-") != 2:
        print(f"ERROR: invalid date '{date}' — expected YYYY-MM-DD", file=sys.stderr)
        sys.exit(1)

    year        = date[:4]
    ep_title    = f"The Morning Cup — {date}"
    ep_mp3      = EPISODES / f"The Morning Cup - {date}.mp3"
    aup3_out    = EPISODES / f"The Morning Cup - {date}.aup3"
    labels_out  = EPISODES / f"The Morning Cup - {date} - labels.txt"
    manifest_p  = CHUNKS_BASE / date / f"The Morning Cup - {date} - manifest.json"

    if not ep_mp3.exists():
        print(f"ERROR: assembled MP3 not found: {ep_mp3}", file=sys.stderr)
        print("       Run 'morning-cup.sh build' first.", file=sys.stderr)
        sys.exit(1)

    if not manifest_p.exists():
        print(f"WARNING: manifest not found — chapter labels will be empty.")
        manifest = {}
    else:
        manifest = json.loads(manifest_p.read_text())

    EPISODES.mkdir(parents=True, exist_ok=True)

    print(f"\n{'='*60}")
    print(f"  build-audacity.py  —  {date}")
    print(f"{'='*60}")
    print(f"  Output: {aup3_out.name}")
    print()

    # ── 1. Build timeline track list ────────────────────────────────────────
    print("Step 1/3  Building timeline…")
    tracks, labels = build_track_list(date, manifest)
    total_dur = sum(ffprobe_duration(s.path) for s in tracks
                    if s.offset_sec == 0.0 and s.color != COLOR_YELLOW) + \
                max((s.offset_sec for s in tracks), default=0.0)

    print(f"  {len(tracks)} audio tracks, {len(labels)} chapter labels")
    print()

    # ── 2. Write labels backup immediately (no deps required) ───────────────
    print("Step 2/3  Writing labels backup…")
    write_labels_txt(labels_out, labels)
    print()

    # ── 3. Build .aup3 (requires numpy) ─────────────────────────────────────
    print("Step 3/3  Encoding tracks into Audacity .aup3…")
    print(f"  (This processes each audio file individually — may take a few minutes.)\n")
    write_aup3(aup3_out, tracks, labels, ep_title, year)

    size_mb = aup3_out.stat().st_size / 1_048_576
    print(f"\n{'='*60}")
    print(f"  Done.")
    print(f"  Audacity project : {aup3_out}  ({size_mb:.0f} MB)")
    print(f"  Labels backup    : {labels_out}")
    print(f"{'='*60}")
    print()
    print("  Track colour guide:")
    print("    GREEN  — Intro / Outro sound files")
    print("    ORANGE — Coffee Pour, Stings, Transitions")
    print("    BLUE   — TTS content chunks (one per section)")
    print("    YELLOW — Background Music (starts at 0; manually loop if needed)")
    print()
    print("  NOTE: Background music loops in the final MP3 but Audacity only")
    print("  includes one copy of the file. To loop it in Audacity: select the")
    print("  background track → Effect > Repeat.")
    print()
    print("  R2 upload (optional — the labels file is small and useful remotely):")
    print(f"  wrangler r2 object put vicinity/Generators/Podcasts/TheMorningCup/{date}/labels.txt \\")
    print(f"    --file \"{labels_out}\"")
    print()

    if sys.platform == "darwin":
        os.system(f'open "{aup3_out}"')


if __name__ == "__main__":
    main()
