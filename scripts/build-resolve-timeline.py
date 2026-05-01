#!/usr/bin/env python3
"""
Assemble a Morning Cup episode in DaVinci Resolve and render it to MP3.

Pipeline:
    [Song.wav]
    -> chunk-001 -> [sting] -> chunk-002 -> [sting] -> ... -> chunk-N
    -> [Thank You.wav]

Output: ~/Documents/The Morning Cup/The Morning Cup - {EPISODE_DATE}.mp3

Two ways to run this:

A) From inside Resolve (easiest — no env-var setup):
   1. Open DaVinci Resolve and create or open a project.
   2. Workspace > Console > switch to the Py3 tab.
   3. Edit the constants in the CONFIG block below.
   4. Paste the whole file into the console and hit Enter.

B) From a terminal (Resolve must be running):
   python3 build-resolve-timeline.py <CHUNKS_DIR> <EPISODE_DATE>
   You may need to set DAVINCI_RESOLVE_SCRIPT_API and DAVINCI_RESOLVE_SCRIPT_LIB
   per Blackmagic's README at:
   /Library/Application Support/Blackmagic Design/DaVinci Resolve/Developer/Scripting/

Notes:
- Free Resolve 18+ supports the scripting API; no Studio license needed.
- If the scripted MP3 render fails (Resolve sometimes refuses MP3 codec depending
  on system FFmpeg), the timeline is still assembled and queued — you can hit
  Render manually on the Deliver page.
"""

import glob
import os
import sys
import time

# === CONFIG: edit for the "paste into Resolve console" workflow ===============
EPISODE_DATE = "2026-04-30"  # used for output filename and default chunks dir
ASSETS_DIR = os.path.expanduser("~/Documents/The Morning Cup")
CHUNKS_DIR = os.path.expanduser(f"~/Documents/The Morning Cup/episodes/{EPISODE_DATE}")
OUTPUT_DIR = ASSETS_DIR
# ==============================================================================

INTRO_FILENAME = "The Morning Cup - Song.wav"
STING_FILENAME = "morning-cup-sting.wav"
OUTRO_FILENAME = "The Morning Cup - Thank You.wav"


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


def import_clip(media_storage, path, label):
    if not os.path.isfile(path):
        sys.exit(f"{label} not found at: {path}")
    items = media_storage.AddItemListToMediaPool([path])
    if not items:
        sys.exit(f"Failed to import {label}: {path}")
    return items[0]


def configure_render(project, output_dir, output_basename):
    """Try to render audio-only MP3. Returns the queued job id, or None on failure."""
    if not os.path.isdir(output_dir):
        os.makedirs(output_dir, exist_ok=True)

    # Best-effort: load Resolve's bundled "Audio Only" preset if it exists, then
    # override the format-specific settings to force MP3.
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
            "Warning: SetRenderSettings returned False. The timeline is still "
            "assembled — you can adjust render settings manually on the Deliver page."
        )
        return None

    job_id = project.AddRenderJob()
    if not job_id:
        print(
            "Warning: AddRenderJob failed. Open the Deliver page and queue the "
            "render manually."
        )
        return None
    return job_id


def render_and_wait(project, job_id, expected_path):
    print(f"Queued render job {job_id}. Starting render...")
    if not project.StartRendering(job_id):
        print(
            "Warning: StartRendering returned False. The job is queued — open "
            "the Deliver page and click Start Render."
        )
        return False
    while project.IsRenderingInProgress():
        time.sleep(2)
    print(f"Render finished. File should be at: {expected_path}")
    return True


def assemble(chunks_dir, episode_date, assets_dir, output_dir):
    intro_path = os.path.join(assets_dir, INTRO_FILENAME)
    sting_path = os.path.join(assets_dir, STING_FILENAME)
    outro_path = os.path.join(assets_dir, OUTRO_FILENAME)

    if not os.path.isdir(chunks_dir):
        sys.exit(f"Chunks directory not found: {chunks_dir}")

    chunk_paths = sorted(glob.glob(os.path.join(chunks_dir, "*.mp3")))
    if not chunk_paths:
        sys.exit(f"No .mp3 files found in {chunks_dir}")

    resolve = get_resolve()
    if not resolve:
        sys.exit("Could not connect to DaVinci Resolve. Is the app running?")

    project = resolve.GetProjectManager().GetCurrentProject()
    if not project:
        sys.exit("No project is open. Open or create a project in Resolve first.")

    media_pool = project.GetMediaPool()
    media_storage = resolve.GetMediaStorage()

    print(
        f"Importing intro, sting, outro, and {len(chunk_paths)} chunk(s) "
        f"into the media pool..."
    )
    intro_clip = import_clip(media_storage, intro_path, "Intro song")
    sting_clip = import_clip(media_storage, sting_path, "Sting")
    outro_clip = import_clip(media_storage, outro_path, "Outro thank-you")
    chunk_items = media_storage.AddItemListToMediaPool(chunk_paths)
    if not chunk_items:
        sys.exit("Failed to import chunk audio into the media pool.")

    timeline_name = f"The Morning Cup - {episode_date}"
    timeline = media_pool.CreateEmptyTimeline(timeline_name)
    if not timeline:
        sys.exit(f"Failed to create timeline '{timeline_name}'.")
    project.SetCurrentTimeline(timeline)

    sequence = [{"mediaPoolItem": intro_clip}]
    for idx, chunk in enumerate(chunk_items):
        sequence.append({"mediaPoolItem": chunk})
        if idx < len(chunk_items) - 1:
            sequence.append({"mediaPoolItem": sting_clip})
    sequence.append({"mediaPoolItem": outro_clip})

    media_pool.AppendToTimeline(sequence)
    print(
        f"Timeline '{timeline_name}' assembled: 1 intro + {len(chunk_items)} "
        f"chunks + {len(chunk_items) - 1} stings + 1 outro "
        f"= {len(sequence)} clips."
    )

    output_basename = f"The Morning Cup - {episode_date}"
    expected_path = os.path.join(output_dir, f"{output_basename}.mp3")
    job_id = configure_render(project, output_dir, output_basename)
    if job_id:
        render_and_wait(project, job_id, expected_path)
    else:
        print(
            f"Render not auto-started. Open the Deliver page in Resolve, set "
            f"output dir to {output_dir}, filename '{output_basename}', "
            f"format MP3 (audio only), then Start Render."
        )


if __name__ == "__main__":
    if len(sys.argv) >= 3:
        chunks_dir = os.path.expanduser(sys.argv[1])
        episode_date = sys.argv[2]
        assets_dir = (
            os.path.expanduser(sys.argv[3]) if len(sys.argv) > 3 else ASSETS_DIR
        )
        output_dir = (
            os.path.expanduser(sys.argv[4]) if len(sys.argv) > 4 else assets_dir
        )
    else:
        chunks_dir = CHUNKS_DIR
        episode_date = EPISODE_DATE
        assets_dir = ASSETS_DIR
        output_dir = OUTPUT_DIR
    assemble(chunks_dir, episode_date, assets_dir, output_dir)
