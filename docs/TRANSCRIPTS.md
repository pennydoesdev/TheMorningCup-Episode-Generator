# Transcripts & Episode Files

Every successful run writes script files to R2 and a Metadata.txt alongside the episode. The local pipeline also generates timestamped transcripts from the finished MP3.

---

## What lands in `Episodes/` after a full run

```
The Morning Cup - 2026-05-22.mp3            ← final tagged + loudness-normalized episode
The Morning Cup - 2026-05-22 - Metadata.txt ← all upload metadata in one file
The Morning Cup - 2026-05-22.srt            ← timestamped transcript (SubRip) — upload to podcast host
The Morning Cup - 2026-05-22.vtt            ← timestamped transcript (WebVTT) — for web players
```

## What's in the Metadata.txt

The metadata file is your one-stop upload sheet. At the top:

```
THE MORNING CUP — EPISODE METADATA

Post Title:      Housing Costs, AI Bills & Your Morning Riddle
Feed Title:      The Morning Cup: Housing Costs & AI Bills  (used in MP3 tags + RSS)
Episode:         142  (Season 2026)
Date:            2026-05-22  —  May 22nd, 2026
Host:            Penelope Rose
Publisher:       Fold 42
Runtime:         ~8.5 min  (1420 words)
Copyright:       Copyright 2026 — Fold 42
Genre:           News

-- WordPress / OpenPodcast (Yoast or RankMath) --
SEO Title:       Ep. 142: Housing Costs & AI Bills | The Morning Cup
SEO Description: Start your morning with The Morning Cup — today we cover...
Tags:            The Morning Cup, Fold 42, daily news, morning briefing, housing costs, ...
```

Further down it contains:
- 3 title options (pick any for your podcast host)
- Full 2-3 paragraph episode description (paste into WordPress post body / show notes)
- Chapter list
- Show notes / sources with URLs
- Today's riddle Q+A
- Social media copy (main post + per-section posts)

## What gets written to R2

For every episode at `Generators/Podcasts/TheMorningCup/<DATE>/` in the R2 bucket:

| File | Format | What's in it |
|------|--------|------|
| `The Morning Cup - <DATE>.txt` | Plain text | Spoken script, pacing tags stripped — clean prose |
| `The Morning Cup - <DATE>.html` | HTML | Same content, formatted for web display |
| `The Morning Cup - <DATE>.json` | JSON | Full episode object — script, riddle, social copy, sources, chapters |
| `The Morning Cup - <DATE> - manifest.json` | JSON | Title, publisher, copyright, runtime, word count, chunk metadata, chapters |
| `The Morning Cup - <DATE> - Metadata.txt` | Plain text | All upload metadata (same file that lands in `Episodes/`) |

## Timestamped transcripts (.srt and .vtt)

Generated locally by `scripts/transcribe-episode.py` after the episode is built.

**SRT** (`.srt`) — SubRip format, accepted by most podcast hosts (Buzzsprout, Transistor, Spotify for Podcasters, Apple Podcasts Connect).

**VTT** (`.vtt`) — WebVTT format, for web players and HTML5 `<track>` elements.

Both are generated in the same run. The script auto-selects the cheapest/fastest available provider:

| Provider | Cost | Speed | Requires |
|----------|------|-------|---------|
| Groq API | $0.01/episode | ~16 s | `GROQ_API_KEY` in `.env` |
| mlx-whisper | free | ~2 min | `pip install mlx-whisper` (Apple Silicon) |
| faster-whisper | free | ~3-5 min | `pip install faster-whisper` |
| OpenAI API | $0.10/episode | ~60 s | `OPENAI_API_KEY` in `.env` |

To add Groq (recommended):
```bash
echo 'GROQ_API_KEY="gsk_..."' >> "$HOME/Documents/The Morning Cup/.env"
```

To run transcription manually on an existing episode:
```bash
"$HOME/Documents/The Morning Cup/Scripts/morning-cup.sh" transcribe 2026-05-22
```

If both `.srt` and `.vtt` already exist, the script skips and prints "Transcripts already exist." Delete them to force a re-transcription.

## Browsing R2 script files

### Option A: Cloudflare dashboard (visual)

```
https://dash.cloudflare.com/<your-account>/r2/default/buckets/vicinity/objects?prefix=Generators%2FPodcasts%2FTheMorningCup%2F<DATE>%2F
```

Click any file → Download or Open.

### Option B: Wrangler CLI (download to disk)

```bash
DATE=2026-05-22

# Plain-text script (for show notes)
wrangler r2 object get \
  "vicinity/Generators/Podcasts/TheMorningCup/$DATE/The Morning Cup - $DATE.txt" \
  --file ~/Downloads/episode.txt --remote

# Full episode JSON
wrangler r2 object get \
  "vicinity/Generators/Podcasts/TheMorningCup/$DATE/The Morning Cup - $DATE.json" \
  --file ~/Downloads/episode.json --remote

open ~/Downloads/episode.txt
```

### Option C: One-liner pipe to terminal

```bash
DATE=2026-05-22
wrangler r2 object get \
  "vicinity/Generators/Podcasts/TheMorningCup/$DATE/The Morning Cup - $DATE.txt" \
  --pipe --remote
```

## Searching transcripts

### Single episode

```bash
TRANSCRIPT=~/Documents/The\ Morning\ Cup/Episodes/The\ Morning\ Cup\ -\ 2026-05-22.srt

grep -in "housing" "$TRANSCRIPT"
grep -in -C 2 "supreme court" "$TRANSCRIPT"
```

### All downloaded episodes

```bash
grep -irn "ceasefire" ~/Documents/The\ Morning\ Cup/Chunks/
```

## Working with the JSON

```bash
JSON=~/Downloads/episode.json

# Episode title
jq -r '.show_title' "$JSON"

# Riddle
jq -r '.riddle_question, .riddle_answer' "$JSON"

# Social main post
jq -r '.social_copy.main_post' "$JSON"

# All cited source URLs
jq -r '.source_notes[] | "[\(.category)] \(.title) — \(.url)"' "$JSON"

# All chapter titles in order
jq -r '.chapters[].title' "$JSON"
```

## What's NOT in the script transcripts (but IS in the audio)

- Intro song (`Hello.mp3`)
- Coffee pour foley
- Intro sting
- Section transition stings between sections
- Outro thank-you bed

These are added during local assembly. The `.txt`/`.srt`/`.vtt` files contain only the host-read narration — which is what you want for show notes and captions.

## Searching with Claude

Paste relevant content from the `.txt` or `.srt` and I can:

- Pull quotes for social posts
- Identify which sections cover which stories
- Spot-check for editorial consistency or repeated phrasing
- Generate alternate social copy
- Compare two days' coverage of the same ongoing story
