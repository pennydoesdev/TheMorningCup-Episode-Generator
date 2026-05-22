# Tuning Guide

All the knobs you can turn, what they do, and what's safe to change.

Most config lives in `wrangler.toml` under `[vars]` and is read in `src/config.ts`. Secrets (API keys) are set with `wrangler versions secret put NAME`.

## OpenAI model

`OPENAI_MODEL` — currently `gpt-5-mini`.

| Model | Speed | Length-following | Cost (rough) | Notes |
|-------|-------|------------------|--------------|-------|
| `gpt-5` | slow (~2min) | excellent | $$ | Best quality, sometimes too thoughtful |
| `gpt-5-mini` | fast (~1min) | good | $ | Current default — best speed/quality balance |
| `gpt-4.1` | fast | unreliable | $ | Tends to underwrite this prompt |
| `gpt-4o` | fast | spotty on long outputs | $ | Older; works but no longer recommended |

To swap: edit `wrangler.toml`, push to main. The `temperature` parameter is automatically omitted for reasoning-class models (`gpt-5*`, `o1*`, `o3*`, `o4*`) — they reject it.

## Script length targets

Drives the validator and the prompt's instruction.

```toml
MIN_SCRIPT_WORDS = "3300"
TARGET_SCRIPT_WORDS_MIN = "3300"
TARGET_SCRIPT_WORDS_MAX = "3700"
MAX_SCRIPT_WORDS = "3900"
WORDS_PER_MINUTE = "145"
```

A script with 3300 words at 145 WPM ≈ 22.7 minutes spoken. The repair pass triggers if validation fails, and tries once to fix length issues without breaking content.

To change target runtime, change all of these together. Going below ~2200 words risks the prompt's "must be at least 20 minutes" hard rule and you may need to soften that in `src/prompt.ts` (`MASTER_PROMPT`).

## Repair pass

```toml
ENABLE_REPAIR_PASS = "true"
```

If first generation fails validation (word count, missing sections, forbidden patterns), the worker calls OpenAI once more with the validation errors injected, asking it to preserve content and fix only the listed issues. Second OpenAI call costs about the same as the first; adds ~60-120s wall time when triggered.

Set to `"false"` if you want failures to land directly at `failed` status without retry — only useful if you're tracking cost more aggressively than runtime.

## TTS chunk size

```toml
MAX_TTS_CHARS_PER_CHUNK = "2500"
```

Maximum character count per ElevenLabs request. The chunker splits long sections at sentence boundaries so no chunk exceeds this. Higher values = fewer chunks (faster TTS phase, fewer audio files), lower values = smaller chunks (more granular for editing).

Don't push above ~3000 — ElevenLabs has its own limits and quality degrades on very long inputs.

The merge floor is hardcoded as `MIN_MERGE_CHARS = 600` in `src/chunker.ts:17`. Sections shorter than that are glued onto the previous section. Easy to make configurable if you care.

## Voice settings (ElevenLabs)

```toml
VOICE_STABILITY = "0.35"
VOICE_SIMILARITY_BOOST = "0.85"
VOICE_STYLE = "0.7"
VOICE_USE_SPEAKER_BOOST = "true"
```

| Setting | Range | Effect |
|---------|-------|--------|
| Stability | 0.0-1.0 | Lower = more emotive/varied. Higher = monotone/consistent. 0.30-0.45 is typical for podcast read. |
| Similarity Boost | 0.0-1.0 | How tightly to match the cloned voice. 0.75-0.90 typical. Too high can sound forced. |
| Style | 0.0-1.0 | How much expressive style to layer on. 0.5-0.8 for conversational news read. |
| Speaker Boost | bool | Adds extra cloned-voice fidelity. Usually leave on. |

Test changes in the ElevenLabs UI first with a sample paragraph. The worker's settings are passed through unmodified per request.

## Source providers (web search vs RSS)

Default behavior: the worker uses OpenAI's built-in **`web_search`** tool to research yesterday's news during generation. No external feeds required. This adds ~$0.30-0.50 per run in tool-call costs.

If you want to **supplement** web search with RSS (model uses RSS as starting hints, then verifies via web_search):

```toml
ENABLE_SOURCE_DIGEST = "true"
NEWS_RSS_FEEDS = "https://feeds.reuters.com/reuters/topNews,https://feeds.npr.org/1001/rss.xml,https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml,https://www.theguardian.com/us-news/rss,https://feeds.apnews.com/rss/apf-topnews,https://feeds.bbci.co.uk/news/world/us_and_canada/rss.xml,https://www.democracynow.org/democracynow.rss,https://prospect.org/rss.xml,https://jacobin.com/feed,https://truthout.org/feed/"
```

Or use NewsAPI:
```bash
wrangler versions secret put NEWSAPI_KEY
```

To **disable web search entirely** (rely on RSS/NewsAPI only) you'd need to modify `src/openai.ts` and remove the `tools: [{ type: "web_search" }]` line. Not recommended — leaves the model without grounding when feeds are stale.

## Editorial lens

Lives in `src/prompt.ts` as `MASTER_PROMPT`. ~250 lines of editorial direction covering:
- Required runtime (20-25 min)
- Date opening rule
- Editorial perspective ("explicitly leftist, anti-capitalist, working-class-centered")
- Topic flow (25 sections in order)
- Section depth targets
- Source requirements
- Riddle requirement
- ElevenLabs formatting rules
- Section spacer markers
- Output JSON shape

Editing this file changes the show's voice. The repair pass uses the same prompt, so your edits propagate to both passes. Validation rules in `src/validator.ts` enforce structural requirements — if you change `MASTER_PROMPT` to require a new section, update the validator too.

## Schedule

```toml
[triggers]
crons = ["0 9-11 * * *"]
```

Runs every hour from 9 to 11 UTC. The handler in `src/index.ts` checks the local hour in `WORKER_TIMEZONE` and only fires once when the local hour is 5 — handles DST automatically.

Change the timezone:
```toml
WORKER_TIMEZONE = "America/New_York"     # default
# WORKER_TIMEZONE = "America/Los_Angeles"
# WORKER_TIMEZONE = "Europe/London"
```

If you change the daily hour, also widen the cron's UTC range to cover that hour ± DST.

## Email notifications

```toml
ENABLE_EMAIL = "false"
EMAIL_FROM = "The Penny Tribune <morningcup@yourdomain.com>"
EMAIL_TO = "your-email@example.com"
```

Currently disabled. To enable:
1. Set up Resend, get an API key.
2. `wrangler versions secret put RESEND_API_KEY`
3. Set `ENABLE_EMAIL = "true"` and update `EMAIL_FROM`/`EMAIL_TO`.
4. `wrangler deploy`.

Sent emails:
- Completion email: links to all output files in R2 (txt, html, json, manifest, files.txt, every chunk URL).
- Failure email: stage that failed, error message, validation errors if applicable.

## Metadata defaults

```toml
PUBLISHER = "The Penny Tribune"
COPYRIGHT_HOLDER = "The Penny Tribune"
PODCAST_GENRE = "News"
```

Used both for the manifest written to R2 and for ID3 tags on the rendered MP3. The copyright string is built as `Copyright {YEAR} - {COPYRIGHT_HOLDER}`.

## Output bitrate / format

ElevenLabs side (worker):
```toml
ELEVENLABS_OUTPUT_FORMAT = "mp3_44100_128"   # default
```
Other options: `mp3_44100_192`, `mp3_22050_32` (smaller), `pcm_44100`. Higher bitrate → bigger chunk files but cleaner audio.

Final episode side (`build-episode.sh`):
```bash
ffmpeg -y -i "$f" -ar 44100 -ac 2 -b:a 192k -codec:a libmp3lame ...
```
Edit `-b:a 192k` to taste. 128k is podcast-acceptable; 256k is overkill for spoken word.

## Concurrency knobs

```typescript
// src/index.ts
const TTS_CONCURRENCY = 4;
```

Number of ElevenLabs TTS calls in flight at once. ElevenLabs tolerates 4-8 concurrent fine; pushing to 10+ may hit rate limits depending on your subscription tier. For ~19 chunks, going from 1 → 4 cuts TTS phase from ~5 min to ~90 seconds.

## Status endpoint visibility

```toml
STATUS_PUBLIC = "false"
```

If `false`, `GET /status?date=...` requires bearer auth. If `true`, anyone can query status (useful if you want to wire up a public status page).

## Where to make each change quickly

| Change | Edit |
|--------|------|
| Faster generation | `wrangler.toml` → `OPENAI_MODEL` |
| Different runtime target | `wrangler.toml` → MIN/TARGET/MAX_SCRIPT_WORDS |
| New editorial direction | `src/prompt.ts` → `MASTER_PROMPT` |
| Tweak voice expressiveness | `wrangler.toml` → `VOICE_*` |
| New ID3 tag values | `src/manifest.ts` → `buildManifest()` |
| Different timeline order | `scripts/build-episode.sh` → `INPUTS=(...)` |
| Different section sting frequency | `scripts/build-episode.sh` (loop) |
| Different cron schedule | `wrangler.toml` → `[triggers]` + `WORKER_TIMEZONE` |

After any worker-side change, deploy: `wrangler deploy` (or push to main if you have Cloudflare's Git auto-deploy hooked up).

After any local-script change, also re-copy from `Generator/scripts/` to `Scripts/`:
```bash
cp "$HOME/Documents/The Morning Cup/Generator/scripts/"*.sh \
   "$HOME/Documents/The Morning Cup/Scripts/"
chmod +x "$HOME/Documents/The Morning Cup/Scripts/"*.sh
```
