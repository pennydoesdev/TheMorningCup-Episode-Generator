# Editing & Compiling Automation

How the daily MP3 actually gets stitched together. This is the "post-production" half of the pipeline — the worker handles writing and synthesizing, this side handles editing and rendering.

## The timeline shape

Every episode is assembled in this exact order:

```
1.  The Morning Cup - Song.wav            ← intro music bed
2.  Coffee Pour.wav                       ← signature pour ambience
3.  Cream or sugar, hon?.mp3              ← cloned-voice greeting line
4.  intro-sting.wav                       ← "now the news begins" sting
5.  chunk-001.mp3                         ← first news section
6.  morning-cup-sting.wav                 ← section transition sting
7.  chunk-002.mp3
8.  morning-cup-sting.wav
…
N.  chunk-NNN.mp3                         ← last news section
N+1.The Morning Cup - Thank You.wav       ← outro thank-you bed
```

For a typical 19-chunk episode that's: `1 song + 1 pour + 1 voice + 1 intro sting + 19 chunks + 18 section stings + 1 outro = 42 clips`.

## Where chunks come from

The Cloudflare Worker's chunker (`src/chunker.ts`) splits the OpenAI-generated script on `[TEN-SECOND SECTION SPACER]` markers, then:

- **Merges** any segment under 600 characters into the previous one (so we don't ship a 5-second audio file).
- **Splits** any segment over `MAX_TTS_CHARS_PER_CHUNK` (default 2500) at the nearest sentence boundary.

Result: each chunk roughly maps to one news section (politics, economy, immigration, climate, etc.) but with short sections merged and long sections subdivided.

## Tool A — `build-episode.sh` (recommended)

The simplest path. Pure ffmpeg, ~5 seconds, works on any Mac.

```bash
"$HOME/Documents/The Morning Cup/Scripts/build-episode.sh" [YYYY-MM-DD]
```

Steps:
1. Auto-detects the newest dated folder under `Chunks/` (or use the optional date arg).
2. Reads `manifest.json` from that folder for tags (title, copyright, year, genre, runtime, word count).
3. Normalizes every input clip (mixed WAV + MP3 at varying sample rates) into uniform MP3 (44.1 kHz stereo, 192 kbps) in a temp folder.
4. Concats all normalized clips with ffmpeg's concat demuxer using `-c copy` (no re-encode of the concat output).
5. Writes ID3v2.3 tags inline.
6. Saves to `~/Documents/The Morning Cup/Episodes/The Morning Cup - <DATE>.mp3`.

Why normalize first: ffmpeg's concat demuxer requires all inputs to have identical codec, sample rate, and channel layout. Sounds in your library are at varying rates; chunks are at 44.1 kHz from ElevenLabs. The pre-normalize step makes them uniform so concat just works.

## Tool B — `build-resolve-timeline.py` (Resolve Studio only)

Drives DaVinci Resolve to build the same timeline programmatically and render via Resolve's encoder. Useful if you want a Resolve project file you can hand-edit.

**Requires DaVinci Resolve Studio** — free Resolve doesn't expose external scripting. See [TROUBLESHOOTING.md](./TROUBLESHOOTING.md#free-resolve-cant-run-the-python-script).

Two ways to run it:

**From Resolve menu** (one click):
- After [symlinking](./SETUP.md#8-optional-davinci-resolve-menu-integration), it appears under **Workspace > Scripts > Edit > build-morning-cup**.

**From Terminal** (Studio only):
```bash
export RESOLVE_SCRIPT_API="/Library/Application Support/Blackmagic Design/DaVinci Resolve/Developer/Scripting"
export RESOLVE_SCRIPT_LIB="/Applications/DaVinci Resolve/DaVinci Resolve.app/Contents/Libraries/Fusion/fusionscript.so"
export PYTHONPATH="$PYTHONPATH:$RESOLVE_SCRIPT_API/Modules/"
python3 "$HOME/Documents/The Morning Cup/Scripts/build-morning-cup.py"
```

The script imports all assets to the media pool, builds an ordered timeline, queues an MP3 render, and tags via mutagen.

## ID3 tags written

All from the manifest, falling back to defaults if a field is missing.

| ID3 frame | Source | Example |
|-----------|--------|---------|
| `TIT2` (title) | `manifest.title` | `The Morning Cup - 2026-04-30` |
| `TPE1` (artist) | `manifest.publisher` | `The Penny Tribune` |
| `TALB` (album) | `manifest.show_name` | `The Morning Cup` |
| `TYER` (year) / `TDRC` (date) | `manifest.year` / episode_date | `2026` / `2026-04-30` |
| `TCOP` (copyright) | `manifest.copyright` | `Copyright 2026 - The Penny Tribune` |
| `TCON` (genre) | `manifest.genre` | `News` |
| `TPUB` (publisher) | `manifest.publisher` | `The Penny Tribune` |
| `COMM` (comment) | runtime + word count + timestamp | `Generated 2026-05-01T08:14:00Z — ~24.2 min / 3503 words` |

## Customizing the assembly

### Swap which sound plays where

Edit the constants at the top of `scripts/build-episode.sh`:

```bash
INTRO_SONG="$SOUNDS/The Morning Cup - Song.wav"
COFFEE_POUR="$SOUNDS/Coffee Pour.wav"
CREAM_OR_SUGAR="$SOUNDS/Cream or sugar, hon?.mp3"
INTRO_STING="$SOUNDS/intro-sting.wav"
SECTION_STING="$SOUNDS/morning-cup-sting.wav"
OUTRO="$SOUNDS/The Morning Cup - Thank You.wav"
```

Just point at different files. The order is hardcoded a few lines below.

### Change the order

Find the `INPUTS=(...)` lines in `build-episode.sh` and re-arrange. To skip a slot, drop the line. To repeat one, add it twice.

### Add a sting after every Nth chunk instead of every chunk

Replace:
```bash
if [ $i -lt $((CHUNK_COUNT - 1)) ]; then
  INPUTS+=("$SECTION_STING")
fi
```

with:
```bash
# Sting after every 3 chunks (and not after the very last one)
if [ $i -lt $((CHUNK_COUNT - 1)) ] && [ $(( (i + 1) % 3 )) -eq 0 ]; then
  INPUTS+=("$SECTION_STING")
fi
```

### Different output bitrate / format

Find:
```bash
ffmpeg -y -loglevel error -i "$f" \
    -ar 44100 -ac 2 -b:a 192k -codec:a libmp3lame \
```

Tweak:
- `-b:a 192k` → `-b:a 128k` (smaller file, slightly less quality)
- `-ar 44100` → `-ar 48000` (matches video standards if needed)
- `-codec:a libmp3lame` → `-codec:a aac` (output as AAC; change file extension too)

### Add fade-ins or fade-outs at boundaries

ffmpeg supports `afade=t=in:st=0:d=2` and `afade=t=out:st=N:d=2` filters. Easiest path: pre-process the stings to have built-in fades before saving them, rather than complicating the assembler.

## Validating an output

```bash
# Basic info
ffprobe -v error -show_entries format=duration,bit_rate,size,tags \
  "$HOME/Documents/The Morning Cup/Episodes/The Morning Cup - 2026-04-30.mp3"

# macOS Finder metadata
mdls "$HOME/Documents/The Morning Cup/Episodes/The Morning Cup - 2026-04-30.mp3" \
  | grep -iE 'title|author|copyright|year|artist|album|publisher'

# Listen
open "$HOME/Documents/The Morning Cup/Episodes/The Morning Cup - 2026-04-30.mp3"
```

## What the dts warnings mean

When `build-episode.sh` runs you'll see:
```
[mp3 @ 0x...] Application provided invalid, non monotonically increasing dts to muxer in stream 0: 702259200 >= 702213120
```

Cosmetic. ffmpeg flags this when MP3 frame-level timestamps don't perfectly align across the source files we're stitching with `-c copy`. The output plays correctly — every audio player tolerates this. You can suppress the warnings entirely by:
- Switching the concat to a re-encode (`-c:a libmp3lame` instead of `-c copy`) — slower but fully clean.
- Or piping ffmpeg's stderr to `/dev/null` in the script.

We chose to leave them visible because they don't hurt anything and silencing them could mask a real issue in the future.
