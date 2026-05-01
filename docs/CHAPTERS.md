# Chapter Markers

Every rendered episode has **MP3 ID3 chapter markers** embedded directly in
the file. Modern podcast clients display them as a clickable section list
so listeners can jump to any segment. There's nothing extra to configure
on the hosting side for almost any platform.

## What it looks like to a listener

Open the rendered MP3 in **Apple Podcasts**, **Overcast**, **Pocket Casts**,
**Spotify**, etc. and you'll see something like:

```
00:00   Intro & Welcome
01:30   Positive Opening
03:15   Events and Holidays
04:30   Weather Today
05:50   U.S. Politics
09:30   Power Map
12:45   Crime
14:00   Immigration
16:30   Cost of Living Check
19:00   Healthcare
…
27:00   What Comes Next
28:30   Closing Summary
```

Tap any title and the player jumps to that timestamp.

## How it works under the hood

Two ID3v2 frame types are written into the MP3 by `scripts/write-chapters.py`:

- **CHAP** — one per chapter; carries the chapter's element id, start time
  (ms), end time (ms), and a `TIT2` sub-frame holding the title.
- **CTOC** — the table of contents listing all chapter element ids in order
  with `TOP_LEVEL` + `ORDERED` flags.

This is the same standard Apple uses for "Enhanced Podcasts" (the original
chapter spec from 2005) and what every modern podcast client reads.

## How chapters are decided

Three pieces have to align:

1. **The model emits chapter titles.** The master prompt's
   `CHAPTERS REQUIREMENT` block tells the model to output a
   `chapters: [{ title }]` array — one entry per spacer-separated section,
   in the order they appear, Title Case, under 40 characters.

2. **The chunker tracks where each section starts in the audio timeline.**
   `src/chunker.ts` records `starts_section_indices` on every chunk. Most
   chunks have one entry; chunks that merged a short section into the
   previous one carry multiple indices; chunks that are continuations of a
   long split section carry an empty array.

3. **`scripts/write-chapters.py` measures durations and writes frames.**
   After `build-episode.sh` concatenates the final MP3, this Python helper:
   - Reads the manifest's `chapters` and `chunks` lists
   - Measures intro, coffee pour, "cream or sugar?", intro sting, every
     chunk, the section sting, and the outro with `ffprobe`
   - Walks the assembled timeline and computes each chapter's start time
     in milliseconds based on its corresponding chunk's offset
   - Writes CHAP + CTOC frames via mutagen, removing any prior chapters
     first so re-runs don't double up

The mapping is section-aligned. If the model emits 28 chapter titles for
28 spacer-separated sections, you get 28 chapter markers in the file —
even when 4 short sections were merged into 2 chunks at the audio layer
(merged-away sections share a timestamp with the chapter that contains
them, which is fine in podcast UIs).

## Verifying chapters made it into a finished MP3

```bash
DATE=2026-05-01
ffprobe -v error -show_chapters -of json \
  "$HOME/Documents/The Morning Cup/Episodes/The Morning Cup - $DATE.mp3" \
  | python3 -m json.tool | head -120
```

Expected output (truncated):

```json
{
  "chapters": [
    {
      "id": 0,
      "time_base": "1/1000",
      "start": 0,
      "start_time": "0.000000",
      "end": 90500,
      "end_time": "90.500000",
      "tags": { "title": "Positive Opening" }
    },
    {
      "id": 7,
      "start_time": "509.000000",
      "end_time": "612.700000",
      "tags": { "title": "Power Map" }
    },
    …
  ]
}
```

## Platform behavior cheat-sheet

| Platform | Reads embedded chapters | Notes |
|----------|------------------------|------|
| **Apple Podcasts** | ✅ | Best-in-class display, no UI configuration needed |
| **Spotify** | ✅ (since 2024) | Reads embedded; also lets you edit in Spotify for Podcasters UI |
| **Overcast** | ✅ | Has been first-class chapter support since launch |
| **Pocket Casts** | ✅ | Reads embedded |
| **Spotify for Podcasters / Anchor** (uploader UI) | ✅ | Reads embedded; UI also lets you edit after upload |
| **Buzzsprout** | ✅ | Reads embedded; UI also lets you add/edit |
| **Captivate** | ✅ | Reads embedded |
| **Transistor** | ✅ | Reads embedded |
| **Podbean** | ✅ | Reads embedded |
| **Castos** | ✅ | Reads embedded |
| **Simplecast** | ✅ | Reads embedded |
| **RedCircle** | ✅ | Reads embedded |
| **Older / generic players** | ✅ | The CHAP/CTOC spec is from 2005; widely supported |

**Bottom line:** for every modern podcast platform, you upload the MP3 and
chapters appear automatically. No manual entry, no extra metadata file, no
chapter-image upload.

## Re-rendering chapters on an existing episode

If you change something — chapter titles, a sting, an intro — and want to
update the episode without re-running the full worker:

```bash
DATE=2026-05-01
"$HOME/Documents/The Morning Cup/Scripts/build-episode.sh" "$DATE"
```

`build-episode.sh` is idempotent — it overwrites the existing MP3 in
`Episodes/` and re-writes the chapters cleanly. Re-upload the new file to
your podcast host (most hosts allow file replacement on an existing
episode without changing the public URL).

## Edge cases the script handles

- **Merged short sections** (e.g. weather sometimes ≤ 600 chars merged into
  the prior chunk): both sections still get chapter markers; they share a
  start time, so listeners see two adjacent items in the chapter list and
  taps go to the same place. This is fine — the alternative (silently
  dropping a chapter) confuses listeners.

- **Long sections split into multiple chunks**: only the first chunk
  begins the section; subsequent chunks have an empty
  `starts_section_indices` and don't trigger a new chapter. The
  long section reads as a single chapter that spans the multi-chunk audio.

- **Mutagen not installed**: the script exits with a warning. The MP3 is
  still rendered correctly — just without chapter markers. Install with:
  ```bash
  python3 -m pip install --user --break-system-packages mutagen
  ```

- **Manifest missing** (run record incomplete or never written): the
  script exits with a warning, no chapter frames written, MP3 still
  valid otherwise.

## Tweaking chapter behavior

| Want | How |
|------|------|
| Different chapter titles for the show's editorial tone | Edit the `CHAPTERS REQUIREMENT` block in `src/prompt.ts`; the model will emit titles in the new style |
| Skip chapters entirely | Comment out the `WRITE_CHAPTERS_PY` block at the bottom of `scripts/build-episode.sh` |
| Custom chapter title overrides for specific episodes | After `build-episode.sh` renders, run a one-off mutagen Python snippet that loads the file and rewrites specific CHAP titles |
| Chapter images | Not currently implemented; would require adding `APIC` sub-frames inside each `CHAP` and a per-chapter image asset |

## Why we're using embedded chapters and not an RSS-side `<podcast:chapters>` JSON

Two main reasons:

1. **Simplicity.** Embedded chapters live in the file. You upload one
   thing. No second URL to host, no JSON to keep in sync.

2. **Compatibility.** A few apps (Apple Podcasts being the most important)
   prefer embedded chapters to the RSS-side spec. If you ever want to add
   a `<podcast:chapters url="...">` JSON pointer to your RSS feed too,
   you can — the two coexist fine — but embedded chapters cover the
   majority case alone.
