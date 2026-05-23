# Troubleshooting

Real issues that came up while building this pipeline, and what fixed each one. If you hit something in this list, the answer is here.

---

## Worker side (Cloudflare)

### Secrets disappear after every `wrangler deploy`

**Symptom:** `POST /run` returns 401 after a fresh deploy. Secrets you set previously are gone. The worker can't reach OpenAI or ElevenLabs either.

**Root cause:** Using `wrangler versions secret put` ties a secret to a specific deployed version. Each `wrangler deploy` creates a new version that doesn't inherit those secrets.

**Fix:** Always use `wrangler secret put` (no `versions`). These secrets are stored at the worker level and survive all future deploys:

```bash
wrangler secret put OPENAI_API_KEY
wrangler secret put ELEVENLABS_API_KEY
wrangler secret put ELEVENLABS_VOICE_ID
wrangler secret put RUN_SECRET
```

If you need to reset your `RUN_SECRET`, generate a new one and update both the worker and your local `.env`:

```bash
openssl rand -hex 32
wrangler secret put RUN_SECRET
```

Then update `~/Documents/The Morning Cup/.env`:
```
RUN_SECRET="<new value>"
```

---

### Run record stuck at `status: "generating"` and never advances

**Symptom:** The status endpoint keeps showing `generating`, `updated_at` doesn't move, no logs after `run start` in `wrangler tail`. After a while you see:
```
waitUntil() tasks did not complete within the allowed time after invocation end and have been cancelled.
```

**Root cause:** The fetch handler used `ctx.waitUntil()` to run the long pipeline in the background. Cloudflare cancels `waitUntil` callbacks shortly after the response is sent — far less than the 60-180 seconds an OpenAI generation needs. The worker dies mid-call before it can update the run record to `"failed"`, leaving the record stranded at `"generating"`.

**Fix:** `await runEpisode(...)` directly inside the handler instead of using `waitUntil()`. Wall time on a fetch handler isn't capped while we're awaiting a network call (CPU is, but waiting on fetch consumes ~no CPU). The HTTP response stays open for the full duration. Same change applied to the scheduled handler.

Code is at `src/index.ts` — search for `await runEpisode`.

### OpenAI call returns immediately with `OpenAI 400: Unsupported parameter: 'temperature'`

**Symptom:** Logs show:
```
"err":"Error: OpenAI 400: ... Unsupported parameter: 'temperature' is not supported with this model."
```

**Root cause:** GPT-5 family models on the Responses API are reasoning-class models that don't accept `temperature`.

**Fix:** Detect reasoning models in `src/openai.ts` (`isReasoningModel()` function) and skip `temperature` for `gpt-5*`, `o1*`, `o3*`, `o4*`. Non-reasoning models (gpt-4.1, gpt-4o, etc.) still get the previous default of 0.4.

### Generation hangs and never finishes (no error, no completion)

**Symptom:** Worker fetch to OpenAI never returns; eventually the whole worker times out. No retry, no clear error.

**Root cause:** Non-streaming Responses API calls buffer the entire response server-side before sending the first byte. For long structured-JSON outputs (3300+ word script) that's ~60-120 seconds of zero bytes, which Cloudflare treats as a stalled subrequest and kills.

**Fix:** Stream the response (`stream: true` in the request body). Bytes flow continuously as the model generates, so the platform never sees an idle subrequest. SSE events are accumulated from `response.output_text.delta` and finalized on `response.output_text.done` / `response.completed`. There's also an 8-minute per-attempt `AbortController` so a genuinely hung call surfaces an error instead of hanging forever.

### Script first-pass underwrites (validates as too short)

**Symptom:** Logs show:
```
"validation failed — attempting repair","errors":["Word count 1420 is below MIN_SCRIPT_WORDS 3300", ...]
```
Sometimes the repair pass fixes it, sometimes it also underwrites and the run lands at `"failed"`.

**Root causes:**
- gpt-4.1 is generally too terse for 3300+ word structured JSON outputs.
- Even gpt-5-mini sometimes returns 2900 words on the first pass.

**Fixes that helped, in order:**
1. Switch `OPENAI_MODEL` to `gpt-5-mini` in `wrangler.toml`. Better instruction-following on length.
2. Keep `ENABLE_REPAIR_PASS=true` — repair fixes most underwriting cases.
3. If repair also underwrites consistently, switch to `gpt-5` (slower but more reliable).

If you want to push further, the structural fix is to break the prompt into outline + fill (two-pass). Not currently implemented.

### Script opens with "this episode is a structural draft, please update bracketed headlines..."

**Root cause:** The worker has no source providers configured (`NEWS_RSS_FEEDS` empty, `NEWSAPI_KEY` not set). The prompt path used to inject "no source digest available — produce a generic structural draft" instructions, and the model dutifully wrote that disclaimer into the script.

**Fix:** Use OpenAI's built-in `web_search` tool. The worker now passes `tools: [{ type: "web_search" }]` and the prompt instructs the model to research yesterday's actual news with multiple targeted searches. The "no digest" branch was removed entirely. Any RSS digest you do configure becomes "supplemental hints" rather than the sole basis.

Cost: web_search adds ~$0.03/call × 8-15 calls per episode = ~$0.30-0.50/run.

### Date pronunciation is "April thirty" instead of "April thirtieth"

**Root cause:** ElevenLabs TTS reads bare numbers as cardinals (thirty), not ordinals (thirtieth). The prompted date string was `April 30, 2026` with a bare number.

**Fix:** `spokenDate()` in `src/utils/date.ts` now emits ordinals: `April 30th, 2026`. TTS pronounces ordinals reliably. The 11/12/13 special case is handled (we say "11th" not "11st").

---

## Local pipeline (your Mac)

### Cloudflare dashboard build fails: `npm ci` lock file mismatch

**Symptom:** The Cloudflare Pages/Workers dashboard build log shows:
```
npm error Invalid: lock file's wrangler@X does not satisfy wrangler@Y
npm error Missing: some-package@X.Y.Z from lock file
Failed: error occurred while installing tools or dependencies
```

**Root cause:** `package.json` was updated (Wrangler version bump, new dependency, etc.) but `package-lock.json` wasn't regenerated before pushing. The CI uses `npm ci`, which requires the two files to be in perfect sync and fails hard when they're not.

**Fix:** Regenerate the lock file locally and push it:
```bash
cd "$HOME/Documents/The Morning Cup/Generator"
git pull origin claude/brave-gates-wbCkD
npm install           # regenerates package-lock.json
git add package-lock.json
git commit -m "Regenerate package-lock.json"
git push origin claude/brave-gates-wbCkD
```
Then retry the deployment in the Cloudflare dashboard. The build will pull the new commit and `npm ci` will pass.

**Prevention:** Any time you `git pull` and then run `wrangler deploy` locally, run `npm install` first. The local deploy doesn't need a matching lock file — the dashboard build does.

### `wrangler r2 object get` fails with "Unknown argument"

**Symptom:**
```
✘ [ERROR] Unknown argument: morning-cup/2026-04-30/The Morning Cup - 2026-04-30 - manifest.json
```

**Root cause:** Wrangler 4.x changed the CLI: bucket and key are now combined into one positional argument (`{bucket}/{key}`), and remote operations require `--remote` (default is local).

**Fix:** `fetch-chunks.sh` was updated to pass `"$BUCKET/$KEY"` as one argument and add `--remote`. Pull the latest if you're seeing this on an older copy.

### `push-final-to-drive.py` errors `Missing dependency: cryptography`

**Root cause:** The Drive upload helper signs a JWT for the Google
service-account OAuth flow using the `cryptography` Python package, and
it isn't installed.

**Fix:**
```bash
python3 -m pip install --user --break-system-packages cryptography
```

While you're there, install all four local-pipeline Python deps in one shot:
```bash
python3 -m pip install --user --break-system-packages mutagen cryptography boto3 requests
```

### `upload-audio.py` errors `Missing dep: boto3` or `Missing dep: requests`

Same fix — install the missing package(s):
```bash
python3 -m pip install --user --break-system-packages boto3 requests
```

### `pip3 install mutagen` fails with `externally-managed-environment`

**Root cause:** macOS Homebrew Python protects itself against system-wide pip installs.

**Fix:**
```bash
python3 -m pip install --user --break-system-packages mutagen
```
Mutagen lands in `~/Library/Python/3.x/lib/python/site-packages` — your user only.

### `find /Applications -maxdepth 5 -name "fusionscript*"` returns nothing

**Root cause:** The library is at depth 6: `/Applications/DaVinci Resolve/DaVinci Resolve.app/Contents/Libraries/Fusion/fusionscript.so`.

**Fix:** Drop `-maxdepth 5` or use `mdfind -name fusionscript.so`.

### Free Resolve can't run the Python script

**Symptom (from Terminal):**
```
Auto-detected episode date: 2026-04-30
Could not connect to DaVinci Resolve. Is the app running?
```

The script gets to `dvr_script.scriptapp("Resolve")` and gets `None` back — Resolve's external scripting bridge is refusing the connection.

**Root cause:** External Python scripting from Terminal requires **DaVinci Resolve Studio** (paid version, ~$300 perpetual). Free Resolve only allows scripting from the in-app Console window — and even that has its quirks.

**Fix:** Use `build-episode.sh` (ffmpeg-only) instead. It does the same job with no Resolve dependency at all. See [EDITING.md](./EDITING.md). Resolve becomes optional — useful only if you want to hand-edit a project file before exporting.

### "Python 2.7 was not found" popup when launching Workspace > Scripts > Edit > build-morning-cup

**Root cause:** Resolve's menu launcher tries Python 2.7 first by default. If 2.7 isn't installed (deprecated since 2020), this popup appears. After you dismiss it, Resolve tries Python 3 — but on **free Resolve** the script still can't access the API.

**Fix on free Resolve:** Skip the menu entirely; use `build-episode.sh`.

**Fix on Resolve Studio:** Find the "External scripting using" preference (location varies by version) and set to `Local`. In Resolve 21 this preference moved — it may not be a single checkbox anymore. The Advanced tab is a free-form config field; you can usually just enable Studio scripting via Preferences and the popup becomes a one-time dismiss.

### `build-episode.sh` prints lots of `non monotonically increasing dts` warnings

**Root cause:** ffmpeg flags this when concatenating MP3 files with `-c copy` and the per-frame timestamps don't perfectly line up across files.

**Fix:** It's cosmetic — output is valid and plays correctly. If they bother you:
- Change the concat to re-encode (`-codec:a libmp3lame` on the concat step) — adds ~10 seconds.
- Or pipe stderr to `/dev/null` in the script.

We left them visible by default because suppressing could hide real future issues.

### Built episode has wrong duration

**Symptom:** Final MP3 is much shorter or longer than the script's `estimated_runtime_minutes`.

**Common causes:**
- The intro `Song.wav` is longer than expected (e.g. 5+ minutes). The total MP3 includes intro + chunks + outro, so a 24-min news script becomes a 32-min episode. That's correct.
- A required asset is missing or empty — `build-episode.sh` would error before producing a file, but if you swapped a sound file with a 0-byte placeholder, this could happen.

**Verification:**
```bash
ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 \
  "$HOME/Documents/The Morning Cup/Episodes/The Morning Cup - 2026-04-30.mp3"
```
Compare to the manifest's `estimated_runtime_minutes`. The total should equal manifest runtime + intro song length + outro length + (chunks − 1) × section-sting length.

---

## Useful diagnostic commands

```bash
# Worker status for any date
curl -H "Authorization: Bearer $RUN_SECRET" \
  "https://themorningcupgenerator.<sub>.workers.dev/status?date=2026-05-01"

# Live worker logs
wrangler tail themorningcupgenerator --format pretty

# Latest deployments
wrangler deployments list --name themorningcupgenerator | head -20

# Object listing in R2 for a date
wrangler r2 object list morning-cup --prefix "morning-cup/2026-04-30/" --remote

# Verify ID3 tags on a finished episode
mdls "$HOME/Documents/The Morning Cup/Episodes/The Morning Cup - 2026-04-30.mp3" \
  | grep -iE 'title|author|copyright|year|artist|album|publisher'

# Quick duration check
ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 \
  "$HOME/Documents/The Morning Cup/Episodes/The Morning Cup - 2026-04-30.mp3"
```
