# Daily Workflow

After [setup](./SETUP.md), your morning takes about 30 seconds of human time.

## Automated path (runs without you)

The Cloudflare cron triggers daily at **5:00 AM America/New_York**:

1. Worker builds source digest (web search via OpenAI, optionally RSS).
2. Calls OpenAI with the master prompt; checks last 7 days of covered topics to avoid repeating stories.
3. Validates word count and structure; runs one repair pass if needed.
4. Generates 3 episode title options + full description + SEO title + SEO description + tags via `gpt-4o-mini`.
5. Splits the script into TTS-friendly chunks at section spacers.
6. Synthesizes 4 chunks in parallel via ElevenLabs.
7. Writes everything (chunks, manifest, metadata .txt, script files) to R2.

By ~5:08-5:12 AM ET, the episode is complete in R2.

## Your one command

```bash
"$HOME/Documents/The Morning Cup/Scripts/morning-cup.sh" make
```

That's it. `make` does: preflight → trigger worker → poll until complete → fetch chunks from R2 → assemble MP3 → transcribe.

The tagged, loudness-normalized MP3 lands at:
`~/Documents/The Morning Cup/Episodes/The Morning Cup - <today>.mp3`

Alongside it you'll also get:
- `The Morning Cup - <DATE> - Metadata.txt` — post title, SEO title, SEO description, tags, episode description, chapters, sources, riddle, social posts
- `The Morning Cup - <DATE>.srt` — timestamped transcript for your podcast host
- `The Morning Cup - <DATE>.vtt` — timestamped transcript for web players

(Transcription runs automatically if `GROQ_API_KEY` or `OPENAI_API_KEY` is in your `.env`.)

## What each step does

### `morning-cup.sh make`

All-in-one pipeline. Equivalent to running these in sequence:

```bash
morning-cup.sh preflight       # check deps, secrets, sound assets
                               # trigger worker POST /run, poll /status
morning-cup.sh fetch [DATE]    # pull manifest + chunks from R2
morning-cup.sh build [DATE]    # ffmpeg assemble + loudnorm + tag + chapters
morning-cup.sh transcribe [DATE]  # Whisper → .srt + .vtt
```

### `morning-cup.sh fetch`

Pulls the manifest + chunk MP3s from R2 into `~/Documents/The Morning Cup/Chunks/<DATE>/`. Also downloads the Metadata.txt.

```bash
morning-cup.sh fetch           # today's date in ET
morning-cup.sh fetch 2026-05-01
```

Idempotent — re-running after a partial download skips chunks already on disk.

### `morning-cup.sh build`

ffmpeg-based assembler. Concatenates intro + chunks + stings + outro → loudness-normalizes to -16 LUFS → writes ID3 tags + chapter markers.

```bash
morning-cup.sh build           # auto-detect newest folder in Chunks/
morning-cup.sh build 2026-05-01
```

Output: `~/Documents/The Morning Cup/Episodes/The Morning Cup - <DATE>.mp3`

Takes ~10 seconds for a typical episode.

### `morning-cup.sh transcribe`

Runs Whisper on the finished MP3 and writes a `.srt` and `.vtt` transcript.

```bash
morning-cup.sh transcribe       # today's date
morning-cup.sh transcribe 2026-05-01
```

Provider auto-selection: Groq ($0.01) → mlx-whisper (free) → faster-whisper (free) → OpenAI ($0.10).
Add `GROQ_API_KEY="gsk_..."` to your `.env` for the cheapest/fastest option.

### `morning-cup.sh status`

Check the worker's current run record without triggering anything.

```bash
morning-cup.sh status
morning-cup.sh status 2026-05-01
```

Returns the run record JSON: `pending` / `generating` / `validating` / `tts` / `completed` / `failed` plus timestamps and word/chunk counts.

## Manual override scenarios

### "I want to re-run today's generation"

```bash
"$HOME/Documents/The Morning Cup/Scripts/morning-cup.sh" make
```

If today's run already completed and you want to force a regeneration, the `/run?force=true` flag is used automatically by `make`.

### "I want to generate for a specific past date"

```bash
"$HOME/Documents/The Morning Cup/Scripts/morning-cup.sh" make 2026-05-01
```

### "Health check (no auth needed)"

```bash
curl "https://themorningcupgenerator.itsmiarosemathews.workers.dev/health"
```

## Timing budget

Typical run on `o3` + `gpt-4o-mini`:

| Phase | Wall time |
|-------|-----------|
| Generation (OpenAI + web_search) | 60-180 s |
| Repair pass (if first pass underwrites) | +60-120 s |
| Validation, R2 writes, metadata generation | <10 s |
| TTS (parallel ×4 across ~12-19 chunks) | 60-120 s |
| `fetch-chunks.sh` | 10-30 s (network speed) |
| `build-episode.sh` (assemble + loudnorm) | 10-15 s |
| Transcription (Groq) | ~16 s |
| **Total `morning-cup.sh make`** | **~5-8 min** |

Total wall time from blank slate to playable MP3 is ~5-8 minutes if run manually, or zero minutes of your time if the cron fires while you sleep.

## Where things live

| What | Where |
|------|-------|
| Cron schedule | `wrangler.toml` `[triggers]` |
| Worker source | `src/` |
| OpenAI prompt | `src/prompt.ts` |
| Validation rules | `src/validator.ts` |
| Chunker (section split) | `src/chunker.ts` |
| ElevenLabs voice settings | `src/config.ts` |
| Episode copy / metadata generation | `src/description.ts` |
| Topic memory (dedup) | `src/topics.ts` |
| Run records | KV (binding `MORNING_CUP_KV`) |
| Audio chunks | R2 at `Generators/Podcasts/TheMorningCup/<DATE>/chunks/` |
| Manifest | R2 at `Generators/Podcasts/TheMorningCup/<DATE>/The Morning Cup - <DATE> - manifest.json` |
| Metadata .txt | R2 at `Generators/Podcasts/TheMorningCup/<DATE>/The Morning Cup - <DATE> - Metadata.txt` |
