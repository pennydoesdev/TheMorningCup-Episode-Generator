# The Morning Cup — Cloudflare Worker Episode Generator

A production-ready Cloudflare Worker that, every morning at 5:00 AM
America/New_York, generates the daily news podcast script for **The Penny
Tribune’s “The Morning Cup,”** validates and (if needed) repairs it, converts
it to ordered ElevenLabs MP3 chunks using your custom voice, stores everything
in Cloudflare R2, and emails you the script, metadata, and chunk links.

## Documentation

| Doc | What's in it |
|-----|--------------|
| [docs/NEW-SHOW.md](./docs/NEW-SHOW.md) | **Launch a new Fold 42 podcast** — white-label setup guide, API keys, voice cloning, prompt writing, step-by-step from concept to first episode |
| [docs/QUICKSTART.md](./docs/QUICKSTART.md) | **First-time setup** — every command in a copy-paste block, zero to first episode |
| [docs/PRODUCTION-WORKFLOW.md](./docs/PRODUCTION-WORKFLOW.md) | **Daily morning routine** — pull, build, upload, review, publish |
| [docs/PIPELINE.md](./docs/PIPELINE.md) | Full pipeline diagram + every component, end-to-end |
| [docs/SETUP.md](./docs/SETUP.md) | Original first-time setup notes (superseded by QUICKSTART) |
| [docs/WALKTHROUGH.md](./docs/WALKTHROUGH.md) | Worked example: generate one full episode end-to-end (with chapters) |
| [docs/DAILY-WORKFLOW.md](./docs/DAILY-WORKFLOW.md) | The two commands you run each morning |
| [docs/EDITING.md](./docs/EDITING.md) | How `build-episode.sh` (and the optional Resolve script) assembles the final MP3 |
| [docs/CHAPTERS.md](./docs/CHAPTERS.md) | How MP3 chapter markers work + which podcast platforms read them |
| [docs/TRANSCRIPTS.md](./docs/TRANSCRIPTS.md) | Where the script lives, how to fetch + search the .txt / .html / .json transcripts |
| [docs/APPLE-SHORTCUTS.md](./docs/APPLE-SHORTCUTS.md) | Run the pipeline from the menu bar / Spotlight / hotkey via Apple Shortcuts |
| [docs/TEAM-SHARING.md](./docs/TEAM-SHARING.md) | One-command onboarding, asset distribution, secret management, offboarding |
| [docs/PUBLISHING.md](./docs/PUBLISHING.md) | Auto-publish to Google Drive + create a WordPress draft after each run |
| [docs/PROMPTS.md](./docs/PROMPTS.md) | ElevenLabs prompts that have worked (stings, voice lines) |
| [docs/TUNING.md](./docs/TUNING.md) | All the config knobs and what's safe to change |
| [docs/TROUBLESHOOTING.md](./docs/TROUBLESHOOTING.md) | Real issues we hit + the fixes that worked |
| [docs/CHANGELOG.md](./docs/CHANGELOG.md) | What's changed in the pipeline since initial deployment |

---

## 1. Overview

Every morning the Worker:

1. Determines the episode date in `America/New_York` and the previous-day
   source date.
2. Builds a categorized **source digest** from configured RSS feeds (or a
   News API endpoint).
3. Generates the full episode JSON via the **OpenAI Responses API** using a
   strict JSON schema.
4. **Validates** runtime (≥ 20 min, ≤ 25 min, target 22–25), spacer count,
   forbidden patterns, required sections, and required fields.
5. If validation fails and `ENABLE_REPAIR_PASS=true`, runs **one** repair
   pass.
6. **Chunks** the ElevenLabs script (split on `[TEN-SECOND SECTION SPACER]`,
   merged short pieces, hard-capped at `MAX_TTS_CHARS_PER_CHUNK`).
7. Sends each chunk to **ElevenLabs** with your voice and saves an ordered
   MP3 to R2.
8. Writes a **manifest.json** and an ffmpeg-compatible **files.txt**.
9. Sends a **completion email** via Resend with all links and chunk URLs.
10. Records the run status in KV (and a durable copy in R2) for idempotency.

## 2. Architecture

```
                         Cloudflare cron (hourly, 09–11 UTC)
                                    │
                                    ▼
                  ┌────────── scheduled() ───────────┐
                  │ check America/New_York hour == 5  │
                  │ check KV / R2 idempotency lock    │
                  └──────────────┬───────────────────┘
                                 ▼
                       ┌──── runEpisode() ────┐
                       │ source digest         │  ← RSS / News API
                       │ OpenAI Responses API  │  ← strict JSON schema
                       │ validate + repair     │
                       │ TXT / HTML / JSON     │ ─→ R2
                       │ chunker (spacer split)│
                       │ ElevenLabs TTS        │ ─→ R2  (chunks/*.mp3)
                       │ manifest + files.txt  │ ─→ R2
                       │ Resend email          │ ─→ EMAIL_TO
                       │ run status            │ ─→ KV + R2
                       └───────────────────────┘
```

Manual HTTP routes:

```
GET  /health
GET  /status?date=YYYY-MM-DD                       (auth optional)
POST /run                                           (Bearer RUN_SECRET)
POST /run?date=YYYY-MM-DD&force=true                (Bearer RUN_SECRET)
```

## 3. Why the Worker doesn’t stitch with ffmpeg

Cloudflare Workers cannot run ffmpeg or any other native binary, and they
don’t have a filesystem or `child_process`. We side-step this by:

- Generating one MP3 per **section spacer** (with hard cap at
  `MAX_TTS_CHARS_PER_CHUNK` chars, default 2,500).
- Storing chunks in R2 in playback order.
- Writing a `manifest.json` and a `files.txt` ffmpeg concat list.
- Letting you stitch the final episode externally with ffmpeg whenever and
  wherever you want (locally, GitHub Actions, a server, etc.).

An optional GitHub Actions workflow (`.github/workflows/stitch.yml`) is
included that downloads chunks via a public R2 URL and stitches them on a
runner.

## 4. Chunk naming

```
chunks/The Morning Cup - YYYY-MM-DD - 001.mp3
chunks/The Morning Cup - YYYY-MM-DD - 002.mp3
chunks/The Morning Cup - YYYY-MM-DD - 003.mp3
...
```

3-digit zero-padded numbering, no skips. Order is the playback order.

## 5. Deploy

**First-time deploy:**

```bash
npm install
npm run typecheck
wrangler login        # one time
wrangler deploy
```

**Updating an existing deployment** (do this every time you pull new code):

```bash
cd /path/to/your/Generator/clone
git fetch origin
git pull origin claude/brave-gates-wbCkD

# Regenerate the lock file — REQUIRED before pushing or the
# Cloudflare dashboard CI will fail with npm ci mismatch errors.
npm install

wrangler deploy
```

**Then copy updated scripts to your local Scripts/ folder:**

```bash
cp scripts/build-episode.sh \
   scripts/write-chapters.py \
   scripts/fetch-chunks.sh \
   scripts/generate-transcript.py \
   "$HOME/Documents/The Morning Cup/Scripts/"
```

## 6. Create the R2 bucket

```bash
wrangler r2 bucket create morning-cup
```

(Optional) Make a small range of the bucket publicly readable through a
**custom domain** or `r2.dev` so chunk links work in email.

## 7. Bind R2 (and KV) in `wrangler.toml`

```toml
name = "morning-cup-generator"
main = "src/index.ts"
compatibility_date = "2026-04-30"

[triggers]
crons = ["0 9-11 * * *"]   # hourly UTC; code only runs once at 5 AM ET

[[r2_buckets]]
binding = "MORNING_CUP_BUCKET"
bucket_name = "morning-cup"

[[kv_namespaces]]
binding = "MORNING_CUP_KV"
id = "REPLACE_ME"
```

Create the KV namespace:

```bash
wrangler kv namespace create MORNING_CUP_KV
# Paste the returned id into wrangler.toml.
```

> The cron is hourly (09–11 UTC) so we can detect 5 AM **America/New_York**
> across daylight-saving changes from inside the Worker. If the local hour is
> not 5, the scheduled handler returns immediately. A KV/R2 lock at
> `morning-cup/YYYY-MM-DD/run.json` prevents double-runs.

## 8. Set secrets

```bash
wrangler versions secret put OPENAI_API_KEY
wrangler versions secret put ELEVENLABS_API_KEY
wrangler versions secret put ELEVENLABS_VOICE_ID
wrangler versions secret put RESEND_API_KEY
wrangler versions secret put RUN_SECRET
```

`RUN_SECRET` is the bearer token required by `POST /run`. Choose a long random
string.

## 9. Configure email

- **EMAIL_FROM** must be a verified Resend sender (e.g.
  `Fold 42 <morningcup@yourdomain.com>`).
- **EMAIL_TO** is your inbox.
- Disable email entirely with `ENABLE_EMAIL=false` (the Worker will still run
  and write everything to R2).

## 10. Trigger manually

```bash
# Default to today's episode (in WORKER_TIMEZONE)
curl -X POST https://YOUR-WORKER.workers.dev/run \
  -H "Authorization: Bearer YOUR_RUN_SECRET"

# Specific date
curl -X POST "https://YOUR-WORKER.workers.dev/run?date=2026-05-01" \
  -H "Authorization: Bearer YOUR_RUN_SECRET"

# Force re-run an already-completed date
curl -X POST "https://YOUR-WORKER.workers.dev/run?date=2026-05-01&force=true" \
  -H "Authorization: Bearer YOUR_RUN_SECRET"
```

The Worker accepts the request immediately and runs in the background via
`ctx.waitUntil`. Check progress via `/status`.

## 11. Check status

```bash
curl -H "Authorization: Bearer YOUR_RUN_SECRET" \
  "https://YOUR-WORKER.workers.dev/status?date=2026-05-01"
```

Response includes status (`pending` → `generating` → `validating` → `tts` →
`completed`/`failed`), word count, runtime, chunk count, and R2 keys.

Set `STATUS_PUBLIC=true` if you want `/status` to be public (auth still
optional otherwise). `/health` is always public.

## 12. Download chunks

If `R2_PUBLIC_BASE_URL` is set, every email includes ordered chunk URLs.
Otherwise, list R2 with the included keys:

```bash
wrangler r2 object get morning-cup/2026-05-01/chunks/"The Morning Cup - 2026-05-01 - 001.mp3" --file 001.mp3
```

## 13. Stitch chunks locally with ffmpeg

```bash
# from a directory containing the .mp3 chunks and files.txt
ffmpeg -f concat -safe 0 -i "The Morning Cup - 2026-05-01 - files.txt" \
  -c copy "The Morning Cup - 2026-05-01.mp3"
```

## 14. Re-encode stitch (if `-c copy` fails)

```bash
ffmpeg -f concat -safe 0 -i "The Morning Cup - 2026-05-01 - files.txt" \
  -acodec libmp3lame -b:a 128k "The Morning Cup - 2026-05-01.mp3"
```

The optional `.github/workflows/stitch.yml` runs this in CI given the episode
date and the public R2 base URL.

## 15. Troubleshooting validation failures

If validation fails after the repair pass, the Worker:

- saves the rejected JSON to `morning-cup/rejected/YYYY-MM-DD-<ts>.json`
- emails a `FAILED:` alert with the validation error list
- marks the run `failed` (you can re-run with `force=true`)

Common causes:

- **Word count too low** → expand politics / international / Iran / Gaza
  sections; check the source digest is producing items.
- **Missing spacers** → the master prompt requires `[TEN-SECOND SECTION
  SPACER]` after every major section; a low spacer count almost always means
  the model truncated. Increase `max_output_tokens` in `src/openai.ts` if
  you’ve customized the prompt.
- **Forbidden patterns** ("music cue", "production note", "voice
  description") → bug in the model’s adherence; re-run usually fixes it.
- **JSON parse failure** → raw response is saved under `morning-cup/rejected/`
  for inspection.

## 16. Troubleshooting ElevenLabs limits

- **429** is automatically retried with exponential backoff and honors
  `retry-after`.
- The default `MAX_TTS_CHARS_PER_CHUNK=2500` is below ElevenLabs free-tier
  limits; raise it to use longer chunks if your plan allows.
- If a chunk repeatedly fails, the Worker saves partial progress, marks the
  run failed, and emails a failure alert. Re-running with `force=true`
  re-generates the script and re-renders all chunks.

## 17. Cost notes

- **OpenAI** — one `gpt-4.1` Responses call per day for ~3,500 words of
  output, plus an optional repair pass. Roughly a few cents per episode at
  current pricing; check Anthropic-equivalent / OpenAI rate cards.
- **ElevenLabs** — each chunk is one TTS call. A 3,500-word episode produces
  roughly 8–14 chunks; cost depends on your plan and per-character rate.
- **Cloudflare** — Workers (cron + small fetch handler), R2 storage (an
  episode is ~10–25 MB), and KV ops. Far below the free tier for a daily
  show.
- **Resend** — one transactional email per successful run plus any failure
  alerts.

## 18. Security notes

- **No secrets in `wrangler.toml`** — only Workers Secrets via
  `wrangler versions secret put`.
- `POST /run` requires `Authorization: Bearer ${RUN_SECRET}`. The Worker
  rejects 401 if the secret is missing or wrong.
- `/health` is public.
- `/status` is gated by `STATUS_PUBLIC` (default `false`, requires the same
  bearer).
- `R2_PUBLIC_BASE_URL` is opt-in. If you don’t set it, no public links are
  generated and emails reference R2 keys only.
- The Worker never executes user-provided code, never calls `fs` /
  `child_process` (neither exists in Workers), and never scrapes ChatGPT or
  uses stored ChatGPT credentials.
- The OpenAI call uses the **Responses API with strict JSON schema** so
  malformed output is rejected at the API boundary.

---

## Repository layout

```
package.json
wrangler.toml
tsconfig.json
README.md
.env.example
.github/workflows/stitch.yml      # optional ffmpeg stitching workflow
src/
  index.ts          # fetch + scheduled handlers
  config.ts         # env/var loader
  types.ts          # shared TypeScript types
  prompt.ts         # master prompt (do not modify)
  schema.ts         # OpenAI Responses JSON schema
  openai.ts         # Responses API client + repair
  sourceDigest.ts   # RSS/News API source digest builder
  validator.ts      # runtime/format validation rules
  repair.ts         # one-shot repair orchestration
  chunker.ts        # spacer split + sentence-boundary chunking
  elevenlabs.ts     # TTS client with retry + 429 handling
  r2.ts             # R2 helpers (text/json/buffer/list/url)
  email.ts          # Resend completion + failure emails
  html.ts           # clean HTML script renderer
  manifest.ts       # manifest.json + files.txt builders
  locks.ts          # KV/R2 idempotency + status records
  logger.ts         # JSON line logger
  utils/
    date.ts         # tz-aware Intl date helpers
    text.ts         # word count, spacer count, escapes, pad3
```

## R2 layout

```
morning-cup/
  YYYY-MM-DD/
    The Morning Cup - YYYY-MM-DD.txt
    The Morning Cup - YYYY-MM-DD.html
    The Morning Cup - YYYY-MM-DD.json
    The Morning Cup - YYYY-MM-DD - manifest.json
    The Morning Cup - YYYY-MM-DD - files.txt
    run.json                                  # idempotency / status record
    chunks/
      The Morning Cup - YYYY-MM-DD - 001.mp3
      The Morning Cup - YYYY-MM-DD - 002.mp3
      ...
  rejected/
    YYYY-MM-DD-<timestamp>.json               # failed runs land here
```
