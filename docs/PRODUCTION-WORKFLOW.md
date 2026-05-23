# Production Workflow — Morning Editing & Upload

What you actually do each morning, after the 5 AM cron has already
generated your episode. Every command is in a copy-paste block.

> **TL;DR** — Once setup is done, your morning is two commands and one
> click in WordPress. The rest is automated.

---

## What the cron already did while you slept

```
5:00 AM ET  Cloudflare worker fires
            ↓
            Generates 22-min script via OpenAI + web_search
            Validates word count + structure (with repair + extend fallbacks)
            Synthesizes 22 chunks via ElevenLabs (parallel x4)
            Writes everything to R2:
              morning-cup/<DATE>/chunks/001.mp3 ... NNN.mp3
              morning-cup/<DATE>/*.txt / *.html / *.json
              morning-cup/<DATE>/*-manifest.json
            ↓
            Calls OpenAI to generate a 400-500 word episode description
            ↓
            Pushes chunks/txt/html/json/manifest to Google Drive
              <YYYY-MM-DD>/  +  <YYYY-MM-DD>/chunks/
            ↓
            Creates a serve_episode draft on thefold42.com:
              - Title: "The Morning Cup — <Day>, <Month> <Date>, <Year>"
              - Status: draft
              - Body: AI-generated 400-500 word description
              - Excerpt: main social post
              - Tagged to "The Morning Cup" via serve_podcast_category
              - Meta: _ep_podcast_id=2616, _ep_episode_type=full
              - Audio meta: empty (filled in by Step 2 below)

5:08-5:12 AM ET  Worker run complete. Everything but the final MP3 exists.
```

When you wake up, all of this is already sitting waiting for you.

---

## Step 1 — Pull chunks from R2 and assemble the final MP3

Single command. ~30 seconds total.

```bash
"$HOME/Documents/The Morning Cup/Scripts/morning-cup.sh" fetch && \
"$HOME/Documents/The Morning Cup/Scripts/morning-cup.sh" build
```

What this does, in order:

1. **`fetch-chunks.sh`** — pulls today's manifest + 22 chunks from R2 into:
   ```
   ~/Documents/The Morning Cup/Chunks/<DATE>/
       The Morning Cup - <DATE> - manifest.json
       001.mp3 ... NNN.mp3
   ```
   Idempotent — skips chunks already on disk.

2. **`build-episode.sh`** — assembles + uploads. Specifically:
   - Normalizes every input clip to MP3 44.1 kHz stereo 192k
   - Concatenates: Song → Coffee Pour → "Cream or sugar, hon?" → intro sting → 22 chunks (with section stings between) → Thank You
   - Writes ID3 tags from the manifest (title, artist, copyright, year, genre, comment)
   - Embeds chapter markers (CTOC + CHAP) for each section
   - **Pushes the final MP3 to Google Drive** (same `<DATE>/` folder the worker already populated)
   - **Uploads the final MP3 to S3** at `audio/YYYY/MM/the-morning-cup-<DATE>-<ts>.mp3`
   - **Patches the WP draft** with `_ep_audio_url`, `_ep_audio_r2_key`, `_ep_file_size`, `_ep_mime_type`, `_ep_duration_sec`, `_ep_duration`

Final output lands at:
```
~/Documents/The Morning Cup/Episodes/The Morning Cup - <DATE>.mp3
```

If you'd rather watch what's happening step-by-step, run them separately:

```bash
"$HOME/Documents/The Morning Cup/Scripts/morning-cup.sh" fetch
```

then

```bash
"$HOME/Documents/The Morning Cup/Scripts/morning-cup.sh" build
```

## Step 2 — Verify everything landed

Run these one at a time. If anything fails, see the [Troubleshooting](#troubleshooting) section.

**The final MP3 exists locally:**

```bash
DATE=$(TZ=America/New_York date +%Y-%m-%d)
ls -la "$HOME/Documents/The Morning Cup/Episodes/The Morning Cup - $DATE.mp3"
```

**Chapter markers were embedded** (you should see ~28 chapters with timestamps):

```bash
DATE=$(TZ=America/New_York date +%Y-%m-%d)
ffprobe -v error -show_chapters -of json \
  "$HOME/Documents/The Morning Cup/Episodes/The Morning Cup - $DATE.mp3" \
  | python3 -m json.tool | head -40
```

**ID3 tags wrote correctly:**

```bash
DATE=$(TZ=America/New_York date +%Y-%m-%d)
mdls "$HOME/Documents/The Morning Cup/Episodes/The Morning Cup - $DATE.mp3" \
  | grep -iE 'title|author|copyright|year|artist|album|publisher'
```

**The MP3 is reachable from CloudFront** (replace the URL with the one printed by `build-episode.sh`):

```bash
curl -sI "<paste the public URL from build-episode.sh output>" | head -5
```

Looking for `HTTP/2 200` and `content-type: audio/mpeg`.

**The WP draft has audio attached.** Open the URL the script printed at the end (looks like `https://thefold42.com/wp-admin/post.php?post=<id>&action=edit`) and check that the Apollo plugin's audio panel shows duration, file size, and a play button.

## Step 3 — Review & publish in WordPress

Open the draft directly:

```bash
open "https://thefold42.com/wp-admin/edit.php?post_type=serve_episode&post_status=draft"
```

For today's episode you'll see a row at the top with the title `The Morning Cup — <Day>, <Month> <Date>, <Year>`. Click it.

**What to review:**

| Field | Auto-populated value | What to check |
|---|---|---|
| Title | `The Morning Cup — Friday, May 1st, 2026` | Spelling / day of week |
| Body | AI-generated 400–500 word description | Read once, edit if needed |
| Excerpt | Main social post from the JSON | Tighten if too long |
| Podcast Show | `The Morning Cup` | Should be pre-selected |
| Featured image | Empty | **Add one if your show requires it** |
| Audio (Apollo panel) | URL + duration filled in | Click play, confirm it streams |

If the body needs trimming or the title needs a tweak, edit in place.

When ready: **Publish**.

## Step 4 — Confirm the live episode

After hitting publish:

1. Front-end page loads at `https://thefold42.com/episodes/<slug>/`
2. RSS feed updates at `https://thefold42.com/feed/podcast/the-morning-cup/`
3. Podcast platforms (Apple, Spotify, Overcast, Pocket Casts) pull the new episode within their refresh interval (5–60 minutes typically)

Quick RSS sanity check from terminal:

```bash
curl -s "https://thefold42.com/feed/podcast/the-morning-cup/" \
  | head -200 | grep -E "<title>|<enclosure"
```

You should see your new episode's title and an `<enclosure url="...mp3" .../>` line pointing at the CloudFront URL.

---

## Quick re-runs

**Re-build the MP3** (e.g. after swapping a sound asset):

```bash
"$HOME/Documents/The Morning Cup/Scripts/morning-cup.sh" build
```

`build-episode.sh` is idempotent. It overwrites the previous render and re-uploads to S3 + re-attaches to the WP draft.

**Re-fire the worker** (e.g. if the AI output was bad and you want a fresh script):

```bash
DATE=$(TZ=America/New_York date +%Y-%m-%d)
RUN_SECRET=$(grep '^RUN_SECRET=' "$HOME/Documents/The Morning Cup/.env" | cut -d'"' -f2)
curl --max-time 1500 -X POST \
  -H "Authorization: Bearer $RUN_SECRET" \
  "https://themorningcupgenerator.itsmiarosemathews.workers.dev/run?date=$DATE&force=true"
```

This regenerates chunks AND creates a fresh WP draft. Then re-pull + re-build.

**Pull a specific past date** (for re-publishing or backfill):

```bash
"$HOME/Documents/The Morning Cup/Scripts/fetch-chunks.sh" 2026-04-30
"$HOME/Documents/The Morning Cup/Scripts/build-episode.sh" 2026-04-30
```

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `fetch-chunks.sh` shows `manifest not found` | Worker hasn't run yet for this date | Run `morning-cup.sh status <DATE>` to check; if not run, fire it manually |
| `build-episode.sh` errors `No .mp3 files found in Chunks/<DATE>/` | Chunks weren't pulled | Re-run `fetch-chunks.sh <DATE>` |
| `upload-audio.py` errors `No matching WP serve_episode found` | Worker's publish step failed or hasn't run with the publish code deployed | Check `wrangler tail` for `publish: wp draft created`; if missing, re-fire the worker run |
| WP draft body is the social-copy fallback (not 400 words) | OpenAI body generation failed during publish step | Check `wrangler tail` for `publish: body generation failed`; usually rate-limit, retries on next run |
| Audio plays in WP admin but not on the public episode page | CloudFront cache or RSS cache | Wait 5–10 min, or invalidate CloudFront for the audio key |
| RSS feed doesn't show the new episode | Apollo plugin caches the feed | WP admin → Settings → Permalinks → Save (forces a flush) |

Full matrix of failure modes: [TROUBLESHOOTING.md](./TROUBLESHOOTING.md).

---

## What you do NOT need to do daily

These all happen automatically — you should never run them manually:

- ❌ Generate the script (worker, 5 AM)
- ❌ Validate / repair / extend the script (worker)
- ❌ Synthesize TTS chunks (worker)
- ❌ Upload chunks to R2 (worker)
- ❌ Generate the AI episode description (worker, after TTS)
- ❌ Push artifacts to Google Drive (worker; final MP3 by build-episode.sh)
- ❌ Create the WP draft (worker)
- ❌ Upload audio to S3 (build-episode.sh)
- ❌ Attach audio to draft (build-episode.sh)
- ❌ Add chapter markers (build-episode.sh)
- ❌ Tag ID3 metadata (build-episode.sh)

Your job each morning: **Step 1 (one command) → Step 2 (verify) → Step 3 (review + publish)**.

If you've set up Apple Shortcuts, Step 1 is one keystroke: ⌃⌥⌘ B.
