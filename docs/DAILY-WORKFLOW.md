# Daily Workflow

After [setup](./SETUP.md), your morning takes about 30 seconds of human time.

## Automated path (runs without you)

The Cloudflare cron triggers daily at **5:00 AM America/New_York**:

1. Worker builds source digest (web search via OpenAI, optionally RSS).
2. Calls OpenAI Responses API with the master prompt.
3. Validates word count and structure; runs one repair pass if needed.
4. Splits the script into TTS-friendly chunks at section spacers.
5. Synthesizes 4 chunks in parallel via ElevenLabs.
6. Writes everything to R2.
7. (Optional) Emails completion summary via Resend.

By ~5:08-5:12 AM ET, the episode is complete in R2.

## Your two commands

```bash
"$HOME/Documents/The Morning Cup/Scripts/fetch-chunks.sh"
"$HOME/Documents/The Morning Cup/Scripts/build-episode.sh"
```

That's it.

The tagged MP3 lands at `~/Documents/The Morning Cup/Episodes/The Morning Cup - <today>.mp3`.

## What each command does

### `fetch-chunks.sh`

Pulls the manifest + chunk MP3s from R2 into `~/Documents/The Morning Cup/Chunks/<DATE>/`.

```bash
# Today's date in America/New_York (default)
fetch-chunks.sh

# Specific date
fetch-chunks.sh 2026-05-01

# Auto-detect newest in R2
fetch-chunks.sh --latest
```

Idempotent — re-running it after a partial download skips chunks already on disk.

### `build-episode.sh`

ffmpeg-based assembler. Concatenates intro + chunks + stings + outro into one MP3 and writes ID3 tags from the manifest.

```bash
# Auto-detect newest dated folder in Chunks/ (default)
build-episode.sh

# Specific date
build-episode.sh 2026-05-01
```

Output: `~/Documents/The Morning Cup/Episodes/The Morning Cup - <DATE>.mp3` with full ID3 metadata.

Takes ~5 seconds for a typical 24-minute episode.

## Manual override scenarios

### "I want to re-run today's generation"

```bash
RUN_SECRET="<your-secret>"
TODAY=$(TZ=America/New_York date +%Y-%m-%d)
curl --max-time 900 -X POST \
  -H "Authorization: Bearer $RUN_SECRET" \
  "https://themorningcupgenerator.<subdomain>.workers.dev/run?date=$TODAY&force=true"
```

`force=true` overwrites any existing run record for that date.

### "I want to generate for a specific past date"

Same call, change `date=`:

```bash
curl --max-time 900 -X POST \
  -H "Authorization: Bearer $RUN_SECRET" \
  "https://themorningcupgenerator.<subdomain>.workers.dev/run?date=2026-04-25&force=true"
```

The episode for `2026-04-25` will summarize **April 24th** news (one day prior).

### "I want to check status without triggering"

```bash
curl -H "Authorization: Bearer $RUN_SECRET" \
  "https://themorningcupgenerator.<subdomain>.workers.dev/status?date=2026-05-01"
```

Returns the run record JSON: `pending` / `generating` / `validating` / `tts` / `completed` / `failed` plus timestamps and word/chunk counts.

### "Health check (no auth needed)"

```bash
curl "https://themorningcupgenerator.<subdomain>.workers.dev/health"
```

## Timing budget

Typical run on `gpt-5-mini`:

| Phase | Wall time |
|-------|-----------|
| Generation (OpenAI + web_search) | 60-180 s |
| Repair pass (if first pass underwrites) | +60-120 s |
| Validation, R2 writes | <5 s |
| TTS (parallel ×4 across ~19 chunks) | 60-120 s |
| **Total worker run** | **3-7 min** |
| `fetch-chunks.sh` | 10-30 s (network speed) |
| `build-episode.sh` | 5-10 s |

Total wall time from blank slate to playable MP3 is ~8 minutes if run manually right now, or zero minutes of your time if the cron fires while you sleep.

## Where things live

| What | Where |
|------|-------|
| Cron schedule | `wrangler.toml` `[triggers]` |
| Worker source | `src/` |
| OpenAI prompt | `src/prompt.ts` |
| Validation rules | `src/validator.ts` |
| Chunker (section split) | `src/chunker.ts` |
| ElevenLabs voice settings | `src/config.ts` |
| Run records | KV (binding `MORNING_CUP_KV`) + durable copy in R2 at `morning-cup/<DATE>/run.json` |
| Audio chunks | R2 at `morning-cup/<DATE>/chunks/` |
| Manifest (canonical metadata) | R2 at `morning-cup/<DATE>/The Morning Cup - <DATE> - manifest.json` |
