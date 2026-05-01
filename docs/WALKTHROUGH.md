# Worked Example — Generating One Full Episode End-to-End

Real worked example: generating, assembling, tagging, and verifying The
Morning Cup: Weekly Rewind episode for **May 3, 2026** from a fresh boot. This is the
complete happy-path everyone should follow on day one.

> Already done first-time setup? Skip to **Sunday run, condensed** at the
> bottom for the two-command version.

If you haven't done first-time setup yet, do
[docs/SETUP.md](./SETUP.md) first.

---

## The full happy-path

### 1. Refresh your local scripts

The repo is the source of truth — your working `Scripts/` folder is just a
copy. Pull the latest before each run so you have the newest pipeline.

```bash
cd "$HOME/Documents/The Morning Cup - Weekly Rewind/Generator" && git pull origin main
cp "$HOME/Documents/The Morning Cup - Weekly Rewind/Generator/scripts/build-episode.sh" \
   "$HOME/Documents/The Morning Cup - Weekly Rewind/Scripts/build-episode.sh"
cp "$HOME/Documents/The Morning Cup - Weekly Rewind/Generator/scripts/fetch-chunks.sh" \
   "$HOME/Documents/The Morning Cup - Weekly Rewind/Scripts/fetch-chunks.sh"
cp "$HOME/Documents/The Morning Cup - Weekly Rewind/Generator/scripts/write-chapters.py" \
   "$HOME/Documents/The Morning Cup - Weekly Rewind/Scripts/write-chapters.py"
chmod +x "$HOME/Documents/The Morning Cup - Weekly Rewind/Scripts/"*.sh
```

### 2. Trigger the worker (or skip and let cron do it)

In production the cron fires at 5:00 AM America/New_York automatically — by
breakfast the chunks are already in R2 waiting. To manually trigger any
date:

In one terminal, watch the worker logs:
```bash
wrangler tail weeklycupgenerator --format pretty
```

In another, fire the run:
```bash
RUN_SECRET="<your run secret>"
DATE="2026-05-01"
curl --max-time 1500 -X POST \
  -H "Authorization: Bearer $RUN_SECRET" \
  "https://weeklycupgenerator.<your-subdomain>.workers.dev/run?date=$DATE&force=true"
```

Expected timeline of log lines:
```
{"msg":"run start", "episodeIso":"2026-05-01", ... }
   ↓ 60–180s (OpenAI generation + web_search)
{"msg":"validation failed — attempting repair"}            // sometimes
   ↓ 60–120s (repair pass)
{"msg":"standard repair still under length floor —          // rarely; new
         running extend pass"}                              // length-extend pass
   ↓ 60–120s (extend pass)
{"msg":"run complete", "chunkCount":21, "wordCount":3503}
```

The HTTP response returns `status: completed` plus the run record. Total
wall time ~3–9 minutes depending on which fallbacks were needed.

### 3. Pull chunks + manifest from R2

```bash
"$HOME/Documents/The Morning Cup - Weekly Rewind/Scripts/fetch-chunks.sh" 2026-05-01
```

This populates `~/Documents/The Morning Cup - Weekly Rewind/Chunks/2026-05-01/` with the
ordered MP3 chunks + the canonical manifest.

To see what arrived:
```bash
ls -la "$HOME/Documents/The Morning Cup - Weekly Rewind/Chunks/2026-05-01/"
```

### 4. Assemble the final episode

```bash
"$HOME/Documents/The Morning Cup - Weekly Rewind/Scripts/build-episode.sh" 2026-05-01
```

What it does, in order:
1. Reads the manifest for title / publisher / copyright / chapters / etc.
2. Normalizes every audio asset to MP3 44.1 kHz stereo 192k
3. Concatenates: Song → Coffee Pour → "Cream or sugar, hon?" → intro sting
   → 19–22 chunks interleaved with section stings → Thank You
4. Writes ID3v2 tags (title, artist, copyright, year, genre, comment)
5. Runs `write-chapters.py` to add MP3 chapter markers based on the
   manifest's chapters list and per-chunk `starts_section_indices`

You'll see something like:
```
Auto-detected date: 2026-05-01
Normalizing 41 input clips...
Concatenating to: /Users/.../Episodes/The Morning Cup - Weekly Rewind - 2026-05-01.mp3

Done.
  File:     /Users/.../Episodes/The Morning Cup - Weekly Rewind - 2026-05-01.mp3
  Size:     45M
  Duration: 32:57
ID3 tags: ...
Wrote 28 chapter markers to /Users/.../Episodes/The Morning Cup - Weekly Rewind - 2026-05-01.mp3
```

### 5. Verify the chapters

Embedded ID3 chapters come through to ffprobe with `-show_chapters`:

```bash
ffprobe -v error -show_chapters -of json \
  "$HOME/Documents/The Morning Cup - Weekly Rewind/Episodes/The Morning Cup - Weekly Rewind - 2026-05-01.mp3" \
  | python3 -m json.tool | head -120
```

Expected (truncated):
```json
{
  "chapters": [
    {"id": 0, "start_time": "0.000000",   "end_time": "120.500000",
     "tags": {"title": "Positive Opening"}},
    {"id": 1, "start_time": "120.500000", "end_time": "180.300000",
     "tags": {"title": "Events and Holidays"}},
    {"id": 7, "start_time": "428.100000", "end_time": "510.700000",
     "tags": {"title": "Power Map"}},
    {"id": 14, "start_time": "851.200000","end_time": "934.500000",
     "tags": {"title": "Cost of Living Check"}},
    ...
    {"id": 25, "start_time": "1612.400000","end_time": "1675.000000",
     "tags": {"title": "What Comes Next"}}
  ]
}
```

### 6. Listen / spot-check

```bash
open "$HOME/Documents/The Morning Cup - Weekly Rewind/Episodes/The Morning Cup - Weekly Rewind - 2026-05-01.mp3"
```

This opens in macOS Music. Music itself doesn't show chapter UI, but the
file is correct — chapter UI will appear in any modern podcast app.

For a quick visual check of all metadata at once:
```bash
mdls "$HOME/Documents/The Morning Cup - Weekly Rewind/Episodes/The Morning Cup - Weekly Rewind - 2026-05-01.mp3" \
  | grep -iE 'title|author|copyright|year|artist|album|publisher'
```

### 7. Upload to your podcast host

The MP3 is self-contained. Most platforms read the embedded ID3 tags
(including chapters) automatically:

| Platform | Chapters | Tags |
|----------|----------|------|
| **Apple Podcasts** | Read embedded automatically | Read embedded |
| **Spotify** (since 2024) | Read embedded | Read embedded |
| **Overcast** | Read embedded | Read embedded |
| **Pocket Casts** | Read embedded | Read embedded |
| **Spotify for Podcasters / Anchor** | Read embedded; UI lets you edit | Read embedded |
| **Buzzsprout** | Read embedded; UI lets you edit | Read embedded |
| **Captivate, Transistor, Podbean, Castos, Simplecast, RedCircle** | All read embedded | Read embedded |

**You almost never have to enter chapters by hand.** Just upload the file.

---

## Sunday run, condensed

After first-time setup is done, your two-command Sunday is:

```bash
"$HOME/Documents/The Morning Cup - Weekly Rewind/Scripts/fetch-chunks.sh" --latest
"$HOME/Documents/The Morning Cup - Weekly Rewind/Scripts/build-episode.sh"
```

That's it. The cron already generated the script + chunks at 5 AM ET.
You pull, you assemble, you upload.

---

## What can go wrong, and where to look

| Symptom | Where to look |
|---------|--------------|
| `status: failed` in the run record | [TROUBLESHOOTING.md — Generation hangs / underwrites / temperature errors](./TROUBLESHOOTING.md#worker-side-cloudflare) |
| Chapters missing from final MP3 | Re-run `build-episode.sh` after refreshing scripts; verify mutagen is installed (`python3 -c "import mutagen"`) |
| Wrangler R2 fetch errors | [TROUBLESHOOTING.md — wrangler r2 syntax](./TROUBLESHOOTING.md#wrangler-r2-object-get-fails-with-unknown-argument) |
| Free-Resolve scripting issues | Use `build-episode.sh` (no Resolve required); see [TROUBLESHOOTING.md — Free Resolve](./TROUBLESHOOTING.md#free-resolve-cant-run-the-python-script) |
| Episode duration looks wrong | [TROUBLESHOOTING.md — Built episode has wrong duration](./TROUBLESHOOTING.md#built-episode-has-wrong-duration) |

---

## What each piece of the pipeline produces

```
~/Documents/The Morning Cup - Weekly Rewind/
├── Sounds/                                           ← reusable, 6 files
├── Scripts/                                          ← runtime helpers
│   ├── build-episode.sh
│   ├── fetch-chunks.sh
│   └── write-chapters.py
├── Chunks/2026-05-01/                                ← STEP 3 output
│   ├── 001.mp3 ... NNN.mp3
│   └── The Morning Cup - Weekly Rewind - 2026-05-01 - manifest.json
└── Episodes/                                         ← STEP 4 output
    └── The Morning Cup - Weekly Rewind - 2026-05-01.mp3              ← upload this
```

And in the cloud:
```
Cloudflare R2 bucket "weekly-cup":
└── weekly-cup/2026-05-01/
    ├── chunks/                                       ← raw TTS output
    ├── The Morning Cup - Weekly Rewind - 2026-05-01.txt              ← clean script
    ├── The Morning Cup - Weekly Rewind - 2026-05-01.html             ← rendered HTML
    ├── The Morning Cup - Weekly Rewind - 2026-05-01.json             ← full episode JSON
    ├── The Morning Cup - Weekly Rewind - 2026-05-01 - manifest.json  ← canonical metadata
    ├── The Morning Cup - Weekly Rewind - 2026-05-01 - files.txt      ← ffmpeg concat list
    └── run.json                                      ← run status record
```
