# Operations Guide

Reference for configuring, tuning, troubleshooting, and monitoring The Morning Cup generator.

---

## Table of Contents

- [Configuration Reference](#configuration-reference)
- [Voice Tuning Guide](#voice-tuning-guide)
- [Pronunciation Dictionary](#pronunciation-dictionary)
- [Common Issues & Fixes](#common-issues--fixes)
- [Best Practices](#best-practices)
- [Advanced: Pending Corrections](#advanced-pending-corrections)
- [Monitoring Logs](#monitoring-logs)

---

## Configuration Reference

All variables live in `wrangler.toml` under `[vars]` and are read in `src/config.ts`. API keys and other secrets are set separately with `wrangler secret put NAME` — never put secrets in `wrangler.toml`.

| Variable | Default | Safe to Change? | Description |
|---|---|---|---|
| `OPENAI_MODEL` | `gpt-5.5` | No (requires 500K TPM) | Script generation model |
| `ELEVENLABS_MODEL_ID` | `eleven_multilingual_v2` | Yes | TTS model |
| `ELEVENLABS_OUTPUT_FORMAT` | `mp3_44100_128` | Yes | Audio format |
| `WORKER_TIMEZONE` | `America/New_York` | Yes | Cron timezone |
| `MIN_SCRIPT_WORDS` | `2175` | Careful | Hard floor — scripts below this word count fail immediately |
| `TARGET_SCRIPT_WORDS_MIN` | `2610` | Yes | Lower bound of the target word count window |
| `TARGET_SCRIPT_WORDS_MAX` | `2900` | Yes | Upper bound of the target word count window |
| `MAX_SCRIPT_WORDS` | `4350` | Careful | Hard ceiling — scripts above this word count fail immediately |
| `WORDS_PER_MINUTE` | `145` | Yes | Used to calculate estimated runtime from word count |
| `MAX_TTS_CHARS_PER_CHUNK` | `5000` | Yes | Maximum characters per ElevenLabs TTS request |
| `ENABLE_SOURCE_DIGEST` | `true` | Yes | Include RSS/news feeds as context for generation |
| `ENABLE_REPAIR_PASS` | `true` | Yes | Automatically retry with validation errors injected if first pass fails |
| `ENABLE_APPROVAL_GATE` | `false` | Yes | Pause pipeline after script generation and require approval before TTS |
| `STRIP_PACING_TAGS_FOR_TTS` | `true` | No | Strips `[bracket]` pacing tags before sending text to ElevenLabs |
| `STATUS_PUBLIC` | `false` | Yes | When `true`, `GET /status` does not require bearer auth |
| `HOST_NAME` | `Penelope Rose` | Yes | Host name injected into the script prompt |
| `SHOW_TITLE` | `The Morning Cup` | No | Used in output filenames — changing breaks file naming conventions |
| `R2_KEY_PREFIX` | `Generators/Podcasts/TheMorningCup` | No | Path prefix inside the shared R2 bucket — do not change without updating all downstream scripts |
| `VOICE_STABILITY` | `0.28` | Yes (0.1–0.9) | ElevenLabs stability setting — lower = more expressive |
| `VOICE_SIMILARITY_BOOST` | `0.85` | Yes (0.5–1.0) | How closely to match the cloned voice identity |
| `VOICE_STYLE` | `0.45` | Yes (0–1.0) | Expressiveness layering — higher = more theatrical |
| `VOICE_USE_SPEAKER_BOOST` | `true` | Yes | Enables ElevenLabs speaker boost for added clarity |
| `WORDPRESS_PODCAST_ID` | `2616` | Yes | VNewsOS parent `vicinity_podcast` post ID |
| `AUDIO_CDN_BASE_URL` | `https://cdn.fold42.com/podcasts/morning-cup` | Yes | New CDN base URL for audio files |
| `AUDIO_CDN_BASE_URL_LEGACY` | `https://cdn.vicinitynews.com/podcasts/morning-cup` | Yes | Legacy CDN base URL — kept as fallback during migration |

After changing any variable in `wrangler.toml`, deploy: `npx wrangler deploy`.

[↑ Back to top](#table-of-contents)

---

## Voice Tuning Guide

### Stability

Controls how consistent vs. expressive the delivery is. Lower = more natural variation between sentences. Higher = more uniform monotone.

| Range | Character |
|---|---|
| 0.10–0.30 | Very natural, emotional, varies noticeably utterance to utterance |
| 0.30–0.50 | Balanced — consistent but still expressive. **Current setting: 0.28** |
| 0.50–0.75 | Authoritative, broadcast-style — less emotive |
| 0.75–0.90 | Robotic monotone — avoid for podcast use |

### Style

Controls how much expressive character is layered on top of the base voice.

| Range | Character |
|---|---|
| 0–0.3 | Controlled, professional, restrained |
| 0.3–0.6 | Natural warmth and conversational flow. **Current setting: 0.45** |
| 0.6–1.0 | Theatrical, exaggerated — can feel performative |

### Similarity Boost

How tightly ElevenLabs adheres to the cloned voice. Values below 0.75 allow drift; values above 0.92 can sound rigid. The current setting of 0.85 is in the reliable range for identity lock.

### Per-Section Voice Presets

The `getVoicePreset()` function in `src/index.ts` applies different settings per section type:

| Section Type | Recommended Direction |
|---|---|
| Opening / closing | Lower stability, higher style — more expressive and personal |
| Hard news (crime, policy, international conflict) | Higher stability, lower style — more authoritative |
| Weather | Practical and calm — moderate stability, lower style |

Test any changes in the ElevenLabs UI with a sample paragraph before deploying. Settings are passed through per-request.

[↑ Back to top](#table-of-contents)

---

## Pronunciation Dictionary

### Location

`data/pronunciation-dictionary.json`

### Format

```json
{
  "word": "phonetic spelling"
}
```

Phonetic spellings must use plain English respelling with spaces only. No hyphens. No ALL-CAPS stress marking.

**Bad — hyphens cause ElevenLabs to pause:**
```json
{ "Qatar": "KAH-tar" }
```

**Good — plain respelling, spaces only:**
```json
{ "Qatar": "Kutter" }
```

### How to Add an Entry

1. Edit `data/pronunciation-dictionary.json`
2. Add the entry following the format above
3. Redeploy: `npx wrangler deploy`

The dictionary is read at runtime and applied as text substitutions before TTS.

### Inline Annotation System

Scripts may contain inline phonetic hints in the format `Word [phonetic]`, for example:

```
Iran [ee-RAN]
```

These are written by the prompt for the writer's reference and stripped before TTS by `stripInlineAnnotations()` in `src/tts.ts`. They do not need to be in the pronunciation dictionary — the dictionary handles substitutions independently.

[↑ Back to top](#table-of-contents)

---

## Common Issues & Fixes

### Quick Reference

| Symptom | Section |
|---|---|
| Validation fails — word count too low | [a](#a-validation-fails--word-count-too-low) |
| ElevenLabs 429 rate limit | [b](#b-elevenlabs-429-rate-limit) |
| Worker times out | [c](#c-worker-times-out) |
| OpenAI rate limit | [d](#d-openai-rate-limit) |
| Script has pronunciation issues | [e](#e-script-has-pronunciation-issues) |
| Initialisms being read as letters (e.g. "F-B-I") | [f](#f-initialisms-being-read-as-letters) |
| ffmpeg missing or wrong version | [g](#g-ffmpeg-missing-or-old-version) |
| Audacity .aup3 project not opening | [h](#h-audacity-aup3-project-not-opening) |
| Episode stuck at "awaiting_approval" | [i](#i-awaiting_approval--stuck-waiting) |
| KV namespace not found | [j](#j-kv-namespace-not-found) |
| Missing sound files (preflight fails) | [k](#k-missing-sound-files-preflight-fails) |
| wrangler: command not found | [l](#l-wrangler-command-not-found) |

---

#### a. Validation Fails — Word Count Too Low

The script came back below `MIN_SCRIPT_WORDS` (2175) or below the target range.

- Check that the source digest is producing articles — look at the generation log for source fetch errors
- Re-run with `--force`; OpenAI occasionally underperforms on the first attempt
- Confirm `ENABLE_REPAIR_PASS=true` in `wrangler.toml` — the repair pass fixes most first-pass underwriting

If repair also underwrites consistently, switch `OPENAI_MODEL` to a higher-quality model.

---

#### b. ElevenLabs 429 Rate Limit

The worker uses automatic retry with exponential backoff for 429 responses.

If rate limits persist:
- Check your ElevenLabs dashboard for quota usage
- Reduce `TTS_CONCURRENCY` from 4 to 2 in `src/index.ts` to reduce concurrent requests

---

#### c. Worker Times Out

TTS concurrency is the main bottleneck. Cloudflare Workers have a 30-second CPU limit, but network awaits do not count against CPU time.

If you are approaching timeout:
- Chunks are uploaded to R2 incrementally — already-uploaded chunks are not lost
- Re-run with `--force` to retry any failed chunks; the pipeline will skip chunks already present in R2

---

#### d. OpenAI Rate Limit

`gpt-5.5` has a 500K TPM rate limit — this should not be reachable under normal daily episode generation.

If you see OpenAI rate limit errors and are using an older model: switch to `gpt-5.5` in `wrangler.toml` under `OPENAI_MODEL`.

---

#### e. Script Has Pronunciation Issues

Two options depending on scope:

- **One-off word:** Add to `CASE_SENSITIVE_SUBSTITUTIONS` in `src/tts.ts`
- **Persistent dictionary entry:** Add to `data/pronunciation-dictionary.json`

Rule: use plain phonetic respelling with spaces. No hyphens. No ALL-CAPS.

---

#### f. Initialisms Being Read as Letters

Example: "FBI" is being read "F-B-I" instead of "Federal Bureau of Investigation."

The prompt enforces a FULL-NAME RULE — agency names must be spelled out fully on first use. Check the `FULL-NAME RULE` section in `src/prompt.ts`.

**PFAS exception:** The script uses the construction "P faas, the forever chemical" — this is intentional and should not be changed.

---

#### g. ffmpeg Missing or Old Version

**macOS:**
```bash
brew install ffmpeg
# or, if already installed:
brew upgrade ffmpeg
```

**Ubuntu / WSL:**
```bash
sudo apt install ffmpeg
```

**Verify installation:**
```bash
ffmpeg -version
```

---

#### h. Audacity .aup3 Project Not Opening

Audacity `.aup3` project files require **Audacity 3.x or later**. Audacity 2.x cannot open them.

- Download from: https://www.audacityteam.org/download/
- To open MP3 files, also install the FFmpeg library for Audacity: https://support.audacityteam.org/basics/installing-ffmpeg

---

#### i. "awaiting_approval" — Stuck Waiting

The episode is paused at the approval gate. To approve:

```bash
./scripts/morning-cup.sh approve 2026-05-24
```

Or approve from the WordPress editorial desk via the VNewsOS interface.

To reject and queue a regeneration:

```bash
./scripts/morning-cup.sh reject 2026-05-24 "reason for rejection"
```

---

#### j. KV Namespace Not Found

The KV namespace binding ID in `wrangler.toml` does not match your Cloudflare account.

Verify your KV namespaces:
```bash
npx wrangler kv namespace list
```

Copy the correct `id` value into the `kv_namespaces` block in `wrangler.toml` and redeploy.

---

#### k. Missing Sound Files (Preflight Fails)

The local build script performs a preflight check for required sound assets. If files are missing or have incorrect names, the check fails before any work is done.

- Verify the `Sounds/` folder contains all required files with the exact expected names
- See `docs/GETTING-STARTED.md` for the complete Sound Assets list and file naming requirements

---

#### l. wrangler: Command Not Found

Install Wrangler globally:
```bash
npm install -g wrangler
```

Or run it directly from the Generator directory without a global install:
```bash
npx wrangler
```

[↑ Back to top](#table-of-contents)

---

## Best Practices

**Prompt**
- Never modify `src/prompt.ts` without testing on a `force=true` run first — it is the core driver of content quality and any structural change can break the JSON schema, remove section spacers, or introduce validator-caught patterns
- Run `npx tsc --noEmit` before deploying to catch TypeScript errors before they reach production
- Audit the prompt quarterly and remove redundant or outdated rules — long prompts with overlapping instructions degrade model instruction-following

**Deployment**
- Always deploy after pulling code: `git pull` → `npm install` → `npx wrangler deploy`
- Any time you update `package.json`, regenerate the lock file before pushing: `npm install` then `git add package-lock.json`
- Do not put API keys or secrets in `wrangler.toml` — use `wrangler secret put`

**Reliability**
- Keep `ENABLE_REPAIR_PASS=true` — the repair pass catches approximately 80% of first-pass validation failures and adds only 60–120 seconds of wall time when triggered
- Do not weaken the validator to fix failures — if validation is rejecting valid episodes, fix the prompt instead
- Watch the repair pass trigger rate: if more than 1 in 10 episodes requires it, the prompt has a structural problem

**Monitoring**
- Monitor live generation with `npx wrangler tail` to see real-time logs
- After any string of failures, check `your-prefix/rejected/` in R2 — the rejected raw JSON shows exactly what the model produced and why it failed
- Periodically compare recent episode audio to early ones — ElevenLabs voice clones can drift subtly at lower stability settings

**Testing**
- Test TTS pronunciation changes with: `python3 scripts/test-chunk.py "test text"`
- Test prompt changes on a non-scheduled date before the next cron fires

**Security**
- Back up your `.env` file to a secure location — losing it means re-creating all secrets manually
- Rotate `RUN_SECRET` with `openssl rand -hex 32` and `wrangler secret put RUN_SECRET` if it may have been exposed

[↑ Back to top](#table-of-contents)

---

## Advanced: Pending Corrections

The KV corrections system lets you inject a one-time on-air correction into the next episode without a redeploy or manual script edit. The correction is read on-air before the story tease, then automatically deleted from KV after use.

```bash
npx wrangler kv key put --remote \
  --binding MORNING_CUP_KV \
  pending_corrections \
  "Please correct these issues: 1. The governor of Texas is Greg Abbott, not Abbott Gray. 2. The pronunciation of tirzepatide should be tur-ZEP-a-tide."
```

The value is plain text — write it as you want the host to read it. Keep it concise. The next scheduled run will pick it up automatically.

[↑ Back to top](#table-of-contents)

---

## Monitoring Logs

Use `wrangler tail` to stream real-time logs from the worker:

```bash
npx wrangler tail
```

Output is JSON-line format. Each line is a structured log event. To filter to error-level events only:

```bash
npx wrangler tail | grep '"level":"error"'
```

To get a formatted view of a specific date's run:

```bash
npx wrangler tail --format pretty
```

Other useful diagnostic commands:

```bash
# Check status for a specific date
curl -H "Authorization: Bearer $RUN_SECRET" \
  "https://themorningcupgenerator.itsmiarosemathews.workers.dev/status?date=2026-05-24"

# List recent deployments
npx wrangler deployments list | head -20

# List R2 objects for a specific date
npx wrangler r2 object list morning-cup \
  --prefix "Generators/Podcasts/TheMorningCup/2026-05-24/" --remote
```

[↑ Back to top](#table-of-contents)
