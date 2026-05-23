# Editing & Compiling Automation

How the daily MP3 actually gets stitched together. This is the "post-production" half of the pipeline — the worker handles writing and synthesizing, this side handles editing and rendering.

## The timeline shape

Every episode is assembled in this exact order:

```
1.  Spark.mp3                             ← intro music bed
2.  Coffee Pour.wav                       ← signature pour ambience
3.  intro-sting.wav                       ← "now the news begins" sting (optional)
4.  chunk-001.mp3                         ← first news section
5.  Topic Transition.mp3                  ← section transition sting (only before new sections)
6.  chunk-002.mp3
7.  Topic Transition.mp3
…
N.  chunk-NNN.mp3                         ← last news section
N+1.The Morning Cup - Thank You.wav       ← outro thank-you bed
```

For a typical 19-chunk episode: `1 song + 1 pour + 1 intro sting + 19 chunks + 18 section stings + 1 outro = 41 clips`.

Note: section stings only insert before chunks that *begin a new section* — continuation chunks (from a split section) don't get a sting. This is driven by `starts_section_indices` in the manifest.

## Where chunks come from

The Cloudflare Worker's chunker (`src/chunker.ts`) splits the OpenAI-generated script on `[TEN-SECOND SECTION SPACER]` markers, then:

- **Merges** any segment under 600 characters into the previous one (so we don't ship a 5-second audio file).
- **Splits** any segment over `MAX_TTS_CHARS_PER_CHUNK` (default 5000) at the nearest sentence boundary.

Result: each chunk roughly maps to one news section (politics, economy, immigration, climate, etc.) but with short sections merged and long sections subdivided.

## `build-episode.sh` steps

1. Auto-detects the newest dated folder under `Chunks/` (or use the optional date arg).
2. Reads `manifest.json` from that folder for tags (title, copyright, year, genre, runtime, word count).
3. Normalizes every input clip (mixed WAV + MP3 at varying sample rates) into uniform MP3 (44.1 kHz stereo, 192 kbps) in a temp folder.
4. Concats all normalized clips with ffmpeg's concat demuxer using `-c copy` (no re-encode of the concat output).
5. Writes ID3v2.3 tags inline.
6. **Loudness-normalizes** the assembled episode to **-16 LUFS** (EBU R128 podcast standard), true peak -1.5 dBFS. This is a separate second ffmpeg pass.
7. Copies the `Metadata.txt` file from `Chunks/<DATE>/` to `Episodes/`.
8. Calls `write-chapters.py` to embed CTOC + CHAP ID3 chapter markers.
9. Saves to `~/Documents/The Morning Cup/Episodes/The Morning Cup - <DATE>.mp3`.

Why normalize first (step 3): ffmpeg's concat demuxer requires all inputs to have identical codec, sample rate, and channel layout. Sounds in your library are at varying rates; chunks are at 44.1 kHz from ElevenLabs. The pre-normalize step makes them uniform so concat just works.

## ID3 tags written

All from the manifest, falling back to defaults if a field is missing.

| ID3 frame | Source | Example |
|-----------|--------|---------|
| `TIT2` (title) | `manifest.title` | `The Morning Cup: Housing Costs & AI Bills` |
| `TPE1` (artist) | `manifest.publisher` | `Fold 42` |
| `TALB` (album) | `manifest.show_name` | `The Morning Cup` |
| `TYER` (year) / `TDRC` (date) | episode year / date | `2026` / `2026-05-22` |
| `TCOP` (copyright) | `manifest.copyright` | `Copyright 2026 — Fold 42` |
| `TCON` (genre) | `manifest.genre` | `News` |
| `TPUB` (publisher) | `manifest.publisher` | `Fold 42` |
| `COMM` (comment) | runtime + word count + timestamp | `Generated 2026-05-22T08:14:00Z — ~8.5 min / 1420 words` |
| `TRCK` (track) | day of year | `142` (episode number) |
| `TPOS` (disc) | year | `2026` (season) |

## What lands in `Episodes/` after a run

```
The Morning Cup - 2026-05-22.mp3           ← final tagged + loudness-normalized episode
The Morning Cup - 2026-05-22 - Metadata.txt ← post title, SEO, tags, description, chapters, sources
The Morning Cup - 2026-05-22.srt           ← timestamped transcript (SubRip) — upload to podcast host
The Morning Cup - 2026-05-22.vtt           ← timestamped transcript (WebVTT) — for web players
```

## Customizing the assembly

### Swap which sound plays where

Edit the constants at the top of `scripts/build-episode.sh`:

```bash
INTRO_SONG="$SOUNDS/Spark.mp3"
COFFEE_POUR="$SOUNDS/Coffee Pour.wav"
INTRO_STING="$SOUNDS/intro-sting.wav"
SECTION_STING="$SOUNDS/Topic Transition.mp3"
OUTRO="$SOUNDS/The Morning Cup - Thank You.wav"
```

Just point at different files. The order is hardcoded a few lines below.

### Change the order

Find the `INPUTS=(...)` lines in `build-episode.sh` and re-arrange. To skip a slot, drop the line. To repeat one, add it twice.

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

### Change the loudness target

Find the loudnorm pass in `build-episode.sh`:
```bash
-filter:a "loudnorm=I=-16:TP=-1.5:LRA=11:print_format=none"
```
- `I=-16` is the integrated loudness target (LUFS). `-16` is the podcast standard (Apple Podcasts, Spotify).
- `TP=-1.5` is the true peak ceiling in dBFS.
- `LRA=11` is the loudness range target.

### Add fade-ins or fade-outs at boundaries

ffmpeg supports `afade=t=in:st=0:d=2` and `afade=t=out:st=N:d=2` filters. Easiest path: pre-process the stings to have built-in fades before saving them, rather than complicating the assembler.

## Validating an output

```bash
# Basic info
ffprobe -v error -show_entries format=duration,bit_rate,size,tags \
  "$HOME/Documents/The Morning Cup/Episodes/The Morning Cup - 2026-05-22.mp3"

# macOS Finder metadata
mdls "$HOME/Documents/The Morning Cup/Episodes/The Morning Cup - 2026-05-22.mp3" \
  | grep -iE 'title|author|copyright|year|artist|album|publisher'

# Listen
open "$HOME/Documents/The Morning Cup/Episodes/The Morning Cup - 2026-05-22.mp3"
```

## What the dts warnings mean

When `build-episode.sh` runs you'll see:
```
[mp3 @ 0x...] Application provided invalid, non monotonically increasing dts to muxer in stream 0: 702259200 >= 702213120
```

Cosmetic. ffmpeg flags this when MP3 frame-level timestamps don't perfectly align across the source files we're stitching with `-c copy`. The output plays correctly. You can suppress the warnings by switching the concat to a re-encode (`-c:a libmp3lame` instead of `-c copy`) — slower but fully clean.
