#!/usr/bin/env python3
"""
Assemble The Morning Cup chunks into a DaVinci Resolve timeline with a
transition sting between every section.

Two ways to run this:

A) From inside Resolve (easiest — no env-var setup):
   1. Open DaVinci Resolve and create or open a project.
   2. Workspace > Console > switch to the Py3 tab.
   3. Edit CHUNKS_DIR / STING_PATH / EPISODE_NAME below to match your paths.
   4. Paste the whole file into the console and hit Enter.

B) From a terminal (Resolve must be running):
   python3 build-resolve-timeline.py /path/to/chunks /path/to/sting.wav "Episode Name"
   You may need to set DAVINCI_RESOLVE_SCRIPT_API and DAVINCI_RESOLVE_SCRIPT_LIB
   for your platform — see the Blackmagic README at
   /Library/Application Support/Blackmagic Design/DaVinci Resolve/Developer/Scripting/

What it does:
- Finds all .mp3 files in CHUNKS_DIR, sorted by filename (so 001, 002, ... play in order).
- Imports them plus the sting into the current project's media pool.
- Creates a new empty timeline and appends:
      chunk-001, sting, chunk-002, sting, ..., sting, chunk-N
  (No sting after the final chunk.)
- Leaves the timeline as the active timeline so you can preview / export.
"""

import glob
import os
import sys

# === Edit these for the "paste into Resolve console" workflow =================
CHUNKS_DIR = "/Users/penelope/morning-cup-2026-04-30"
STING_PATH = "/Users/penelope/morning-cup-sting.wav"
EPISODE_NAME = "The Morning Cup - 2026-04-30"
# ==============================================================================


def get_resolve():
    try:
        import DaVinciResolveScript as dvr_script
    except ImportError:
        # Common default install paths — extend if yours differs.
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


def assemble(chunks_dir, sting_path, episode_name):
    if not os.path.isdir(chunks_dir):
        sys.exit(f"Chunks directory not found: {chunks_dir}")
    if not os.path.isfile(sting_path):
        sys.exit(f"Sting file not found: {sting_path}")

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

    print(f"Importing {len(chunk_paths)} chunk(s) + sting into the media pool...")
    chunk_items = media_storage.AddItemListToMediaPool(chunk_paths)
    sting_items = media_storage.AddItemListToMediaPool([sting_path])

    if not chunk_items:
        sys.exit("Failed to import chunk audio into the media pool.")
    if not sting_items:
        sys.exit("Failed to import sting audio into the media pool.")
    sting_clip = sting_items[0]

    timeline_name = f"{episode_name} — assembled"
    timeline = media_pool.CreateEmptyTimeline(timeline_name)
    if not timeline:
        sys.exit(f"Failed to create timeline '{timeline_name}'.")
    project.SetCurrentTimeline(timeline)

    interleaved = []
    for idx, chunk in enumerate(chunk_items):
        interleaved.append({"mediaPoolItem": chunk})
        if idx < len(chunk_items) - 1:
            interleaved.append({"mediaPoolItem": sting_clip})

    media_pool.AppendToTimeline(interleaved)
    print(
        f"Done. Timeline '{timeline_name}' now contains "
        f"{len(chunk_items)} chunks and {len(chunk_items) - 1} stings."
    )


if __name__ == "__main__":
    if len(sys.argv) >= 3:
        chunks_dir = sys.argv[1]
        sting_path = sys.argv[2]
        episode_name = sys.argv[3] if len(sys.argv) > 3 else "The Morning Cup"
    else:
        chunks_dir = CHUNKS_DIR
        sting_path = STING_PATH
        episode_name = EPISODE_NAME
    assemble(chunks_dir, sting_path, episode_name)
