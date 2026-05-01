# Weekly Workflow

After [setup](./SETUP.md), your Sunday afternoon takes about 30 seconds of human time.

## Automated path (runs without you)

The Cloudflare cron triggers each Sunday at **2:00 PM America/New_York** so the finished episode lands well before the 6:00 PM ET publication target:

1. Worker builds source digest (web search via OpenAI, optionally RSS) for the previous 7 days.
2. Calls OpenAI Responses API with the master prompt.
3. Validates word count and structure; runs one repair pass and an optional length-extend pass if needed.
4. Splits the script into TTS-friendly chunks at section spacers.
5. Synthesizes 4 chunks in parallel via ElevenLabs.
6. Writes everything to R2.
7. (Optional) Emails completion summary via Resend.

By ~2:10-2:20 PM ET, the episode is complete in R2 — leaving roughly 3.5 hours of buffer before the 6:00 PM ET publication.

## Your two commands

```bash
"$HOME/Documents/The Morning Cup - Weekly Rewind/Scripts/fetch-chunks.sh"
"$HOME/Documents/The Morning Cup - Weekly Rewind/Scripts/build-episode.sh"
```

That's it.

The tagged MP3 lands at `~/Documents/The Morning Cup - Weekly Rewind/Episodes/The Morning Cup - Weekly Rewind - <Sunday>.mp3`.

## What each command does

### `fetch-chunks.sh`

Pulls the manifest + chunk MP3s from R2 into `~/Documents/The Morning Cup - Weekly Rewind/Chunks/<DATE>/`.

```bash
# Today's date in America/New_York (default)
fetch-chunks.sh

# Specific Sunday
fetch-chunks.sh 2026-05-03

# Auto-detect newest in R2
fetch-chunks.sh --latest
```

Idempotent — re-running it after a partial download skips chunks already on disk.

### `build-episode.sh`

ffmpeg-based assembler. Concatenates intro + chunks + stings + outro into one MP3 and writes ID3 tags from the manifest.

```bash
# Auto-detect newest dated folder in Chunks/ (default)
build-episode.sh

# Specific Sunday
build-episode.sh 2026-05-03
```

Output: `~/Documents/The Morning Cup - Weekly Rewind/Episodes/The Morning Cup - Weekly Rewind - <DATE>.mp3` with full ID3 metadata.

Takes ~10–20 seconds for a typical 45-minute episode.

## Manual override scenarios

### "I want to re-run this Sunday's generation"

```bash
RUN_SECRET="<your-secret>"
TODAY=$(TZ=America/New_York date +%Y-%m-%d)
curl --max-time 1200 -X POST \
  -H "Authorization: Bearer $RUN_SECRET" \
  "https://weeklycupgenerator.<subdomain>.workers.dev/run?date=$TODAY&force=true"
```

`force=true` overwrites any existing run record for that date.

### "I want to generate for a specific past Sunday"

Same call, change `date=`:

```bash
curl --max-time 1200 -X POST \
  -H "Authorization: Bearer $RUN_SECRET" \
  "https://weeklycupgenerator.<subdomain>.workers.dev/run?date=2026-04-26&force=true"
```

The episode for `2026-04-26` will summarize the 7 days from **April 19** through **April 25**.

### "I want to check status without triggering"

```bash
curl -H "Authorization: Bearer $RUN_SECRET" \
  "https://weeklycupgenerator.<subdomain>.workers.dev/status?date=2026-05-03"
```

Returns the run record JSON: `pending` / `generating` / `validating` / `tts` / `completed` / `failed` plus timestamps and word/chunk counts.

### "Health check (no auth needed)"

```bash
curl "https://weeklycupgenerator.<subdomain>.workers.dev/health"
```

## Timing budget

Typical run on `gpt-5-mini`:

| Phase | Wall time |
|-------|-----------|
| Generation (OpenAI + web_search) | 120-240 s |
| Repair pass (if first pass underwrites) | +90-180 s |
| Validation, R2 writes | <5 s |
| TTS (parallel ×4 across ~22 chunks) | 120-240 s |
| **Total worker run** | **5-12 min** |
| `fetch-chunks.sh` | 30-60 s (network speed) |
| `build-episode.sh` | 10-20 s |

Total wall time from blank slate to playable MP3 is ~12 minutes if run manually right now, or zero minutes of your time if the cron fires Sunday at 2 PM ET.

## Where things live

| What | Where |
|------|-------|
| Cron schedule | `wrangler.toml` `[triggers]` |
| Worker source | `src/` |
| OpenAI prompt | `src/prompt.ts` |
| Validation rules | `src/validator.ts` |
| Chunker (section split) | `src/chunker.ts` |
| ElevenLabs voice settings | `src/config.ts` |
| Run records | KV (binding `WEEKLY_CUP_KV`) + durable copy in R2 at `weekly-cup/<DATE>/run.json` |
| Audio chunks | R2 at `weekly-cup/<DATE>/chunks/` |
| Manifest (canonical metadata) | R2 at `weekly-cup/<DATE>/The Morning Cup - Weekly Rewind - <DATE> - manifest.json` |
