# The Morning Cup: Weekly Rewind — Cloudflare Worker Episode Generator

<p align="center">
  <img src="docs/artwork/weekly-rewind-1x1.png" alt="The Morning Cup: Weekly Rewind — original podcast cover art" width="420">
</p>

<p align="center">
  <img src="docs/artwork/weekly-rewind-16x9.png" alt="The Morning Cup: Weekly Rewind — 16:9 banner" width="900">
</p>

A production-ready Cloudflare Worker that, every Sunday at 2:00 PM
America/New_York, generates the weekly news podcast script for **The Penny
Tribune’s “The Morning Cup: Weekly Rewind,”** validates and (if needed)
repairs it, converts it to ordered ElevenLabs MP3 chunks using your custom
voice, stores everything in Cloudflare R2, and emails you the script,
metadata, and chunk links — all comfortably ahead of the 6:00 PM ET
publication target.

## About the show

The Morning Cup: Weekly Rewind is The Penny Tribune's long-form Sunday news podcast — a calm, intelligent, working-class-centered look back at the week that was. Every Sunday, host and producer-side AI workflow team up to deliver a forty-five minute briefing that sounds like a real conversation about real power: who gained it, who lost it, who paid the bill, and who got missed entirely.

The show begins where weekend evenings should — with a positive, human story. From there it walks through the week's most consequential developments: U.S. politics and the deeper trend lines underneath, immigration, the California governor's race, House and Senate primaries, the economy and labor, technology and AI, healthcare, climate, international news, and the wars in Iran and Gaza. Three mandatory weekly segments anchor every episode: **What Got Ignored This Week**, **Who Won and Who Lost This Week**, and **Number of the Week** — a single statistic that captures the seven days behind us.

Editorially, Weekly Rewind is explicitly leftist, anti-capitalist, and grounded in the lived reality of workers, tenants, immigrants, patients, students, and ordinary communities. It names corporate power, billionaire influence, war profiteering, healthcare profiteering, fossil fuel power, landlord power, and union-busting clearly — but stays factual, sourced, and humane. The show always asks who benefits, who pays, who is protected, and who is sacrificed. Think Vice/Vox-style explanatory journalism with a clear moral compass.

Each episode ends the way Sunday should: a positive closing story, a short family-safe riddle, a closing summary that revisits the week's through-lines, and a calm outro. No cable-news theatrics. No both-sides framing when power is asymmetric. No filler.

Sourced from Reuters, AP, The New York Times, CNN, BBC, the Guardian, NPR, Democracy Now, Jacobin, and other credible national, international, and independent leftist reporting.

Produced by The Penny Tribune. **New episodes every Sunday at 6 PM Eastern.**

> Short-form copies of this description (≤500 chars and ≤150 chars) live in [`docs/DESCRIPTIONS.md`](./docs/DESCRIPTIONS.md) for podcast directories and social platforms.

This repository is a sibling of [TheMorningCup-Episode-Generator]
(the daily show generator). The architecture and code paths are the same;
the prompt, schedule, runtime targets, source window, and required sections
are tuned for the weekly long-form rewind.

## Documentation

| Doc | What's in it |
|-----|--------------|
| [docs/SETUP.md](./docs/SETUP.md) | First-time setup — folders, secrets, sound assets, Wrangler |
| [docs/WALKTHROUGH.md](./docs/WALKTHROUGH.md) | Worked example: generate one full episode end-to-end (with chapters) |
| [docs/DAILY-WORKFLOW.md](./docs/DAILY-WORKFLOW.md) | The two commands you run each Sunday |
| [docs/EDITING.md](./docs/EDITING.md) | How `build-episode.sh` (and the optional Resolve script) assembles the final MP3 |
| [docs/PROMPTS.md](./docs/PROMPTS.md) | ElevenLabs prompts that have worked (stings, voice lines) |
| [docs/TUNING.md](./docs/TUNING.md) | All the config knobs and what's safe to change |
| [docs/TROUBLESHOOTING.md](./docs/TROUBLESHOOTING.md) | Real issues we hit + the fixes that worked |

---

## 1. Overview

Every Sunday at 2:00 PM ET the Worker:

1. Determines the episode date (the current Sunday in `America/New_York`)
   and the previous 7-day source window (the prior Sunday through Saturday).
2. Builds a categorized **source digest** from configured RSS feeds (or a
   News API endpoint) covering the past 7 days.
3. Generates the full episode JSON via the **OpenAI Responses API** using a
   strict JSON schema.
4. **Validates** runtime (≥ 40 min, ≤ 50 min, target 45), spacer count,
   forbidden patterns, required weekly sections (What Got Ignored, Who Won /
   Who Lost, Number of the Week), spelled-out ordinals, and required JSON
   fields.
5. If validation fails and `ENABLE_REPAIR_PASS=true`, runs **one** repair
   pass and, if needed, a length-extend pass.
6. **Chunks** the ElevenLabs script (split on `[TEN-SECOND SECTION SPACER]`,
   merged short pieces, hard-capped at `MAX_TTS_CHARS_PER_CHUNK`).
7. Sends each chunk to **ElevenLabs** with your voice and saves an ordered
   MP3 to R2.
8. Writes a **manifest.json** and an ffmpeg-compatible **files.txt**.
9. Sends a **completion email** via Resend with all links and chunk URLs.
10. Records the run status in KV (and a durable copy in R2) for idempotency.

## 2. Architecture

```
                Cloudflare cron (hourly Sunday, 18–19 UTC)
                                    │
                                    ▼
                  ┌────────── scheduled() ───────────────┐
                  │ check America/New_York weekday=Sunday │
                  │ check local hour == 14 (2 PM ET)      │
                  │ check KV / R2 idempotency lock        │
                  └──────────────┬───────────────────────┘
                                 ▼
                       ┌──── runEpisode() ────┐
                       │ source digest (7d)    │  ← RSS / News API
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
chunks/The Morning Cup - Weekly Rewind - YYYY-MM-DD - 001.mp3
chunks/The Morning Cup - Weekly Rewind - YYYY-MM-DD - 002.mp3
chunks/The Morning Cup - Weekly Rewind - YYYY-MM-DD - 003.mp3
...
```

3-digit zero-padded numbering, no skips. Order is the playback order.

## 5. Deploy

```bash
npm install
npm run typecheck
npx wrangler login        # one time
npx wrangler deploy
```

## 6. Create the R2 bucket

```bash
npx wrangler r2 bucket create weekly-cup
```

(Optional) Make a small range of the bucket publicly readable through a
**custom domain** or `r2.dev` so chunk links work in email.

## 7. Bind R2 (and KV) in `wrangler.toml`

```toml
name = "weekly-cup-generator"
main = "src/index.ts"
compatibility_date = "2026-04-30"

[triggers]
crons = ["0 18-19 * * 0"]   # hourly Sunday UTC; code only runs once at 2 PM ET

[[r2_buckets]]
binding = "WEEKLY_CUP_BUCKET"
bucket_name = "weekly-cup"

[[kv_namespaces]]
binding = "WEEKLY_CUP_KV"
id = "REPLACE_ME"
```

Create the KV namespace:

```bash
npx wrangler kv namespace create WEEKLY_CUP_KV
# Paste the returned id into wrangler.toml.
```

> The cron is hourly (18–19 UTC) on Sundays so we can detect 2 PM
> **America/New_York** across daylight-saving changes from inside the
> Worker. If the local weekday is not Sunday or the local hour is not 14,
> the scheduled handler returns immediately. The 2 PM ET start gives the
> generation, repair, and TTS pipeline a comfortable buffer to finish
> before the 6 PM ET publication target. A KV/R2 lock at
> `weekly-cup/YYYY-MM-DD/run.json` prevents double-runs.

## 8. Set secrets

```bash
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put ELEVENLABS_API_KEY
npx wrangler secret put ELEVENLABS_VOICE_ID
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put RUN_SECRET
```

`RUN_SECRET` is the bearer token required by `POST /run`. Choose a long random
string.

## 9. Configure email

- **EMAIL_FROM** must be a verified Resend sender (e.g.
  `The Penny Tribune <weeklyrewind@yourdomain.com>`).
- **EMAIL_TO** is your inbox.
- Disable email entirely with `ENABLE_EMAIL=false` (the Worker will still run
  and write everything to R2).

## 10. Trigger manually

```bash
# Default to today's episode (in WORKER_TIMEZONE)
curl -X POST https://YOUR-WORKER.workers.dev/run \
  -H "Authorization: Bearer YOUR_RUN_SECRET"

# Specific Sunday
curl -X POST "https://YOUR-WORKER.workers.dev/run?date=2026-05-03" \
  -H "Authorization: Bearer YOUR_RUN_SECRET"

# Force re-run an already-completed Sunday
curl -X POST "https://YOUR-WORKER.workers.dev/run?date=2026-05-03&force=true" \
  -H "Authorization: Bearer YOUR_RUN_SECRET"
```

The Worker accepts the request immediately and runs in the background via
`ctx.waitUntil`. Check progress via `/status`.

## 11. Check status

```bash
curl -H "Authorization: Bearer YOUR_RUN_SECRET" \
  "https://YOUR-WORKER.workers.dev/status?date=2026-05-03"
```

Response includes status (`pending` → `generating` → `validating` → `tts` →
`completed`/`failed`), word count, runtime, chunk count, and R2 keys.

Set `STATUS_PUBLIC=true` if you want `/status` to be public (auth still
optional otherwise). `/health` is always public.

## 12. Download chunks

If `R2_PUBLIC_BASE_URL` is set, every email includes ordered chunk URLs.
Otherwise, list R2 with the included keys:

```bash
npx wrangler r2 object get weekly-cup/2026-05-03/chunks/"The Morning Cup - Weekly Rewind - 2026-05-03 - 001.mp3" --file 001.mp3
```

## 13. Stitch chunks locally with ffmpeg

```bash
# from a directory containing the .mp3 chunks and files.txt
ffmpeg -f concat -safe 0 -i "The Morning Cup - Weekly Rewind - 2026-05-03 - files.txt" \
  -c copy "The Morning Cup - Weekly Rewind - 2026-05-03.mp3"
```

## 14. Re-encode stitch (if `-c copy` fails)

```bash
ffmpeg -f concat -safe 0 -i "The Morning Cup - Weekly Rewind - 2026-05-03 - files.txt" \
  -acodec libmp3lame -b:a 128k "The Morning Cup - Weekly Rewind - 2026-05-03.mp3"
```

The optional `.github/workflows/stitch.yml` runs this in CI given the episode
date and the public R2 base URL.

## 15. Troubleshooting validation failures

If validation fails after the repair pass, the Worker:

- saves the rejected JSON to `weekly-cup/rejected/YYYY-MM-DD-<ts>.json`
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
- **Numeric ordinal shorthand** (e.g. "1st", "21st") → the spoken script must
  always spell out ordinals ("first", "twenty-first"); the prompt enforces
  this and validation rejects any leakage.
- **JSON parse failure** → raw response is saved under `weekly-cup/rejected/`
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

- **OpenAI** — one Responses call per week for ~6,400–7,200 words of output,
  plus an optional repair pass and an optional length-extend pass. Roughly a
  few cents to a few dimes per episode at current pricing; check the OpenAI
  rate card.
- **ElevenLabs** — each chunk is one TTS call. A 7,000-word episode produces
  roughly 18–28 chunks; cost depends on your plan and per-character rate.
- **Cloudflare** — Workers (cron + small fetch handler), R2 storage (an
  episode is ~25–50 MB), and KV ops. Far below the free tier for a weekly
  show.
- **Resend** — one transactional email per successful run plus any failure
  alerts.

## 18. Security notes

- **No secrets in `wrangler.toml`** — only Workers Secrets via
  `wrangler secret put`.
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
  openai.ts         # Responses API client + repair + length-extend
  sourceDigest.ts   # RSS/News API source digest builder (7-day window)
  validator.ts      # runtime/format validation rules
  repair.ts         # repair + length-extend orchestration
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
weekly-cup/
  YYYY-MM-DD/                                                       (Sunday of publication)
    The Morning Cup - Weekly Rewind - YYYY-MM-DD.txt
    The Morning Cup - Weekly Rewind - YYYY-MM-DD.html
    The Morning Cup - Weekly Rewind - YYYY-MM-DD.json
    The Morning Cup - Weekly Rewind - YYYY-MM-DD - manifest.json
    The Morning Cup - Weekly Rewind - YYYY-MM-DD - files.txt
    run.json                                  # idempotency / status record
    chunks/
      The Morning Cup - Weekly Rewind - YYYY-MM-DD - 001.mp3
      The Morning Cup - Weekly Rewind - YYYY-MM-DD - 002.mp3
      ...
  rejected/
    YYYY-MM-DD-<timestamp>.json               # failed runs land here
```
