#!/usr/bin/env python3
"""
Assemble a Morning Cup episode in DaVinci Resolve, render to MP3, and tag the
output with proper podcast metadata (title, artist, copyright, etc.).

Pipeline (in order on the timeline):
    [Song.wav]
    -> [Coffee Pour.wav]
    -> [Cream or sugar, hon?.mp3]
    -> [intro-sting.wav]                ← signals the news is starting
    -> chunk-001 -> [section sting] -> chunk-002 -> [section sting] -> ... -> chunk-N
    -> [Thank You.wav]

Folder layout the script expects (under ~/Documents/The Morning Cup/):
    Sounds/                            ← all reusable assets live here
        The Morning Cup - Song.wav
        Coffee Pour.wav
        Cream or sugar, hon?.mp3
        intro-sting.wav
        morning-cup-sting.wav
        The Morning Cup - Thank You.wav
    episodes/<YYYY-MM-DD>/             ← chunk MP3s + manifest for one episode
        001.mp3 ... NNN.mp3
        The Morning Cup - <YYYY-MM-DD> - manifest.json
    The Morning Cup - <YYYY-MM-DD>.mp3  ← rendered output

Episode date selection:
- If EPISODE_DATE is set below, that's used.
- Otherwise the script picks the most recent YYYY-MM-DD subfolder under
  episodes/ that contains chunks.

Two ways to run this:

A) From inside Resolve (easiest):
   1. Open DaVinci Resolve and create or open a project.
   2. Workspace > Console > Py3 tab.
   3. Edit the constants in CONFIG below if needed (or leave EPISODE_DATE
      = None for auto-detect).
   4. Paste the whole file into the console and hit Enter.

B) As a Resolve menu item (one-click):
   Symlink this file into Resolve's user-scripts folder so it appears under
   Workspace > Scripts. On macOS:

       mkdir -p "$HOME/Library/Application Support/Blackmagic Design/DaVinci Resolve/Fusion/Scripts/Edit"
       ln -sf "$PWD/scripts/build-resolve-timeline.py" \\
           "$HOME/Library/Application Support/Blackmagic Design/DaVinci Resolve/Fusion/Scripts/Edit/build-morning-cup.py"

   Restart Resolve. The script will then appear at:
       Workspace > Scripts > Edit > build-morning-cup
   You can also assign a keyboard shortcut via DaVinci Resolve > Keyboard
   Customization > Workspace > Scripts.

C) From a terminal (Resolve must be running):
       python3 build-resolve-timeline.py [EPISODE_DATE]

Notes:
- Free Resolve 18+ supports the scripting API; no Studio license needed.
- ID3 tagging on the output MP3 uses `mutagen` if installed (recommended:
  `pip3 install mutagen`). Falls back to `ffmpeg` subprocess if available.
  If neither is present, the file is rendered untagged with a warning.
- If the scripted MP3 render fails, the timeline is still assembled — you
  can hit Render manually on the Deliver page.
"""

import datetime
import glob
import json
import os
import re
import shutil
import subprocess
import sys
import time

# === CONFIG: edit for the "paste into Resolve console" workflow ===============
# Set EPISODE_DATE to None for auto-detect (uses the newest dated folder
# under episodes/ that has chunk MP3s).
EPISODE_DATE = None  # e.g. "2026-04-30"
ROOT_DIR = os.path.expanduser("~/Documents/The Morning Cup")
SOUNDS_DIR = os.path.join(ROOT_DIR, "Sounds")
EPISODES_DIR = os.path.join(ROOT_DIR, "episodes")
OUTPUT_DIR = ROOT_DIR
# ==============================================================================

INTRO_SONG_FILENAME = "The Morning Cup - Song.wav"
COFFEE_POUR_FILENAME = "Coffee Pour.wav"
CREAM_OR_SUGAR_FILENAME = "Cream or sugar, hon?.mp3"
INTRO_STING_FILENAME = "intro-sting.wav"
SECTION_STING_FILENAME = "morning-cup-sting.wav"
OUTRO_FILENAME = "The Morning Cup - Thank You.wav"

ISO_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def get_resolve():
    try:
        import DaVinciResolveScript as dvr_script
    except ImportError:
        candidates = [
            "/Library/Application Support/Blackmagic Design/DaVinci Resolve/Developer/Scripting/Modules",
            "C:\\ProgramData\\Blackmagic Design\\DaVinci Resolve\\Support\\Developer\\Scripting\\Modules",
            "/opt/resolve/Developer/Scripting/Modules",
        ]
        for p in candidates:
            if os.path.isdir(p):
                sys.path.append(p)
        try:
            import DaVinciResolveScript as dvr_script
        except ImportError:
            print(
                "Could not import DaVinciResolveScript. Either run this from "
                "Resolve's Python console, or set DAVINCI_RESOLVE_SCRIPT_API / "
                "DAVINCI_RESOLVE_SCRIPT_LIB env vars per Blackmagic's README."
            )
            sys.exit(1)
    return dvr_script.scriptapp("Resolve")


def detect_episode_date(episodes_dir):
    """Pick the most recent YYYY-MM-DD subfolder that contains *.mp3 files."""
    if not os.path.isdir(episodes_dir):
        sys.exit(f"Episodes directory not found: {episodes_dir}")
    candidates = []
    for entry in os.listdir(episodes_dir):
        if not ISO_DATE_RE.match(entry):
            continue
        full = os.path.join(episodes_dir, entry)
        if not os.path.isdir(full):
            continue
        if glob.glob(os.path.join(full, "*.mp3")):
            candidates.append(entry)
    if not candidates:
        sys.exit(
            f"No episode folders with chunk MP3s found under {episodes_dir}. "
            f"Expected subfolders named YYYY-MM-DD."
        )
    candidates.sort(reverse=True)
    chosen = candidates[0]
    print(f"Auto-detected episode date: {chosen}")
    return chosen


def load_manifest(chunks_dir, episode_date):
    """Load manifest.json for the episode if present. Returns dict or None."""
    pattern = os.path.join(
        chunks_dir, f"*{episode_date}*manifest*.json"
    )
    matches = glob.glob(pattern)
    if not matches:
        # Fall back to a plain manifest.json in the same folder
        plain = os.path.join(chunks_dir, "manifest.json")
        if os.path.isfile(plain):
            matches = [plain]
    if not matches:
        return None
    try:
        with open(matches[0]) as f:
            return json.load(f)
    except Exception as e:
        print(f"Warning: failed to read manifest at {matches[0]}: {e}")
        return None


def import_clip(media_storage, path, label, required=True):
    if not os.path.isfile(path):
        if required:
            sys.exit(f"{label} not found at: {path}")
        print(f"Warning: optional {label} not found at {path} — skipping.")
        return None
    items = media_storage.AddItemListToMediaPool([path])
    if not items:
        if required:
            sys.exit(f"Failed to import {label}: {path}")
        print(f"Warning: failed to import optional {label} — skipping.")
        return None
    return items[0]


def configure_render(project, output_dir, output_basename):
    if not os.path.isdir(output_dir):
        os.makedirs(output_dir, exist_ok=True)
    try:
        project.LoadRenderPreset("Audio Only")
    except Exception:
        pass
    settings = {
        "SelectAllFrames": True,
        "TargetDir": output_dir,
        "CustomName": output_basename,
        "ExportVideo": False,
        "ExportAudio": True,
        "AudioCodec": "mp3",
        "AudioBitDepth": "16",
        "AudioSampleRate": "48000",
    }
    if not project.SetRenderSettings(settings):
        print(
            "Warning: SetRenderSettings returned False. Adjust render settings "
            "manually on the Deliver page."
        )
        return None
    job_id = project.AddRenderJob()
    if not job_id:
        print("Warning: AddRenderJob failed. Queue the render manually on Deliver.")
        return None
    return job_id


def render_and_wait(project, job_id, expected_path):
    print(f"Queued render job {job_id}. Starting render...")
    if not project.StartRendering(job_id):
        print(
            "Warning: StartRendering returned False. Open Deliver and click Start Render."
        )
        return False
    while project.IsRenderingInProgress():
        time.sleep(2)
    print(f"Render finished. File should be at: {expected_path}")
    return True


def write_id3_tags(mp3_path, tags):
    """
    Write ID3v2 tags onto the MP3. Tries mutagen first, then ffmpeg subprocess.
    `tags` is a dict with: title, artist, album, year, copyright, genre, comment, track.
    """
    if not os.path.isfile(mp3_path):
        print(f"Warning: rendered MP3 not found at {mp3_path}; skipping tagging.")
        return False

    # Try mutagen.
    try:
        from mutagen.id3 import (
            ID3, ID3NoHeaderError, TIT2, TPE1, TALB, TYER, TDRC, TCOP, TCON,
            TPUB, COMM,
        )
        try:
            audio = ID3(mp3_path)
        except ID3NoHeaderError:
            audio = ID3()
        audio.delete()
        if tags.get("title"):     audio.add(TIT2(encoding=3, text=tags["title"]))
        if tags.get("artist"):    audio.add(TPE1(encoding=3, text=tags["artist"]))
        if tags.get("album"):     audio.add(TALB(encoding=3, text=tags["album"]))
        if tags.get("year"):      audio.add(TYER(encoding=3, text=str(tags["year"])))
        if tags.get("date"):      audio.add(TDRC(encoding=3, text=tags["date"]))
        if tags.get("copyright"): audio.add(TCOP(encoding=3, text=tags["copyright"]))
        if tags.get("genre"):     audio.add(TCON(encoding=3, text=tags["genre"]))
        if tags.get("publisher"): audio.add(TPUB(encoding=3, text=tags["publisher"]))
        if tags.get("comment"):
            audio.add(COMM(encoding=3, lang="eng", desc="desc", text=tags["comment"]))
        audio.save(mp3_path, v2_version=3)
        print("Tagged MP3 via mutagen.")
        return True
    except ImportError:
        pass
    except Exception as e:
        print(f"Warning: mutagen tagging failed ({e}); trying ffmpeg fallback.")

    # Fallback: ffmpeg subprocess (re-mux without re-encoding).
    if shutil.which("ffmpeg") is None:
        print(
            "Warning: neither mutagen nor ffmpeg is available. The MP3 was "
            "rendered without ID3 tags. Install mutagen with `pip3 install "
            "mutagen` (recommended) or install ffmpeg."
        )
        return False

    tmp_path = mp3_path + ".tagging.mp3"
    cmd = ["ffmpeg", "-y", "-i", mp3_path, "-c", "copy", "-id3v2_version", "3"]
    if tags.get("title"):     cmd += ["-metadata", f"title={tags['title']}"]
    if tags.get("artist"):    cmd += ["-metadata", f"artist={tags['artist']}"]
    if tags.get("album"):     cmd += ["-metadata", f"album={tags['album']}"]
    if tags.get("year"):      cmd += ["-metadata", f"date={tags['year']}"]
    if tags.get("copyright"): cmd += ["-metadata", f"copyright={tags['copyright']}"]
    if tags.get("genre"):     cmd += ["-metadata", f"genre={tags['genre']}"]
    if tags.get("publisher"): cmd += ["-metadata", f"publisher={tags['publisher']}"]
    if tags.get("comment"):   cmd += ["-metadata", f"comment={tags['comment']}"]
    cmd += [tmp_path]
    try:
        subprocess.run(cmd, check=True, capture_output=True)
        os.replace(tmp_path, mp3_path)
        print("Tagged MP3 via ffmpeg.")
        return True
    except subprocess.CalledProcessError as e:
        print(f"Warning: ffmpeg tagging failed: {e.stderr.decode()[:200]}")
        if os.path.isfile(tmp_path):
            os.remove(tmp_path)
        return False


def build_tags(manifest, episode_date):
    """Build the ID3 tag dict from manifest if present, else sensible defaults."""
    if manifest:
        title = manifest.get("title") or f"The Morning Cup - {episode_date}"
        show = manifest.get("show_name") or "The Morning Cup"
        publisher = manifest.get("publisher") or "The Penny Tribune"
        copyright_ = manifest.get("copyright") or f"Copyright {episode_date[:4]} - The Penny Tribune"
        year = manifest.get("year") or int(episode_date[:4])
        genre = manifest.get("genre") or "News"
        runtime_min = manifest.get("estimated_runtime_minutes")
        word_count = manifest.get("word_count")
        comment_bits = []
        if runtime_min:
            comment_bits.append(f"~{runtime_min} min")
        if word_count:
            comment_bits.append(f"{word_count} words")
        comment = (
            f"Generated {datetime.datetime.now().isoformat(timespec='seconds')}"
            + (f" — {' / '.join(comment_bits)}" if comment_bits else "")
        )
    else:
        title = f"The Morning Cup - {episode_date}"
        show = "The Morning Cup"
        publisher = "The Penny Tribune"
        copyright_ = f"Copyright {episode_date[:4]} - The Penny Tribune"
        year = int(episode_date[:4])
        genre = "News"
        comment = f"Generated {datetime.datetime.now().isoformat(timespec='seconds')}"

    return {
        "title": title,
        "artist": publisher,
        "album": show,
        "year": year,
        "date": episode_date,
        "copyright": copyright_,
        "genre": genre,
        "publisher": publisher,
        "comment": comment,
    }


def assemble(episode_date=None, sounds_dir=None, episodes_dir=None, output_dir=None):
    sounds_dir = sounds_dir or SOUNDS_DIR
    episodes_dir = episodes_dir or EPISODES_DIR
    output_dir = output_dir or OUTPUT_DIR

    if not episode_date:
        episode_date = detect_episode_date(episodes_dir)

    chunks_dir = os.path.join(episodes_dir, episode_date)
    if not os.path.isdir(chunks_dir):
        sys.exit(f"Chunks directory not found: {chunks_dir}")

    chunk_paths = sorted(glob.glob(os.path.join(chunks_dir, "*.mp3")))
    if not chunk_paths:
        sys.exit(f"No .mp3 files found in {chunks_dir}")

    intro_song_path = os.path.join(sounds_dir, INTRO_SONG_FILENAME)
    coffee_pour_path = os.path.join(sounds_dir, COFFEE_POUR_FILENAME)
    cream_or_sugar_path = os.path.join(sounds_dir, CREAM_OR_SUGAR_FILENAME)
    intro_sting_path = os.path.join(sounds_dir, INTRO_STING_FILENAME)
    section_sting_path = os.path.join(sounds_dir, SECTION_STING_FILENAME)
    outro_path = os.path.join(sounds_dir, OUTRO_FILENAME)

    manifest = load_manifest(chunks_dir, episode_date)

    resolve = get_resolve()
    if not resolve:
        sys.exit("Could not connect to DaVinci Resolve. Is the app running?")

    project = resolve.GetProjectManager().GetCurrentProject()
    if not project:
        sys.exit("No project is open. Open or create a project in Resolve first.")

    media_pool = project.GetMediaPool()
    media_storage = resolve.GetMediaStorage()

    print(f"Importing assets from {sounds_dir} and {len(chunk_paths)} chunk(s)...")
    intro_song = import_clip(media_storage, intro_song_path, "Intro song")
    coffee_pour = import_clip(media_storage, coffee_pour_path, "Coffee Pour")
    cream_or_sugar = import_clip(media_storage, cream_or_sugar_path, "Cream or sugar voice line")
    intro_sting = import_clip(media_storage, intro_sting_path, "Intro sting", required=False)
    section_sting = import_clip(media_storage, section_sting_path, "Section sting")
    outro = import_clip(media_storage, outro_path, "Outro thank-you")

    chunk_items = media_storage.AddItemListToMediaPool(chunk_paths)
    if not chunk_items:
        sys.exit("Failed to import chunk audio into the media pool.")

    timeline_name = f"The Morning Cup - {episode_date}"
    timeline = media_pool.CreateEmptyTimeline(timeline_name)
    if not timeline:
        sys.exit(f"Failed to create timeline '{timeline_name}'.")
    project.SetCurrentTimeline(timeline)

    sequence = [
        {"mediaPoolItem": intro_song},
        {"mediaPoolItem": coffee_pour},
        {"mediaPoolItem": cream_or_sugar},
    ]
    if intro_sting:
        sequence.append({"mediaPoolItem": intro_sting})
    for idx, chunk in enumerate(chunk_items):
        sequence.append({"mediaPoolItem": chunk})
        if idx < len(chunk_items) - 1:
            sequence.append({"mediaPoolItem": section_sting})
    sequence.append({"mediaPoolItem": outro})

    media_pool.AppendToTimeline(sequence)
    intro_label = "+ intro sting " if intro_sting else ""
    print(
        f"Timeline '{timeline_name}' assembled: song + pour + voice {intro_label}"
        f"+ {len(chunk_items)} chunks + {len(chunk_items) - 1} section stings + outro "
        f"= {len(sequence)} clips."
    )

    # Set Resolve project metadata too — visible in the Deliver page.
    tags = build_tags(manifest, episode_date)
    try:
        project.SetMetadata("Description", tags["title"])
        project.SetMetadata("Comments", tags["comment"])
        project.SetMetadata("Copyright", tags["copyright"])
    except Exception:
        pass

    output_basename = f"The Morning Cup - {episode_date}"
    expected_path = os.path.join(output_dir, f"{output_basename}.mp3")
    job_id = configure_render(project, output_dir, output_basename)
    rendered = False
    if job_id:
        rendered = render_and_wait(project, job_id, expected_path)
    if not rendered:
        print(
            f"Render not auto-completed. Open the Deliver page in Resolve, set "
            f"output dir to {output_dir}, filename '{output_basename}', "
            f"format MP3 audio-only, then Start Render."
        )
        return

    write_id3_tags(expected_path, tags)
    print("\nFinal output:")
    print(f"  {expected_path}")
    print("ID3 tags written:")
    for k, v in tags.items():
        print(f"  {k}: {v}")


if __name__ == "__main__":
    arg_date = sys.argv[1] if len(sys.argv) > 1 else EPISODE_DATE
    assemble(episode_date=arg_date)
