# Getting Started — The Morning Cup Episode Generator

End-to-end setup, daily workflow, and everything in between.

---

## Table of Contents

1. [What You'll Have When Done](#1-what-youll-have-when-done)
2. [Prerequisites](#2-prerequisites)
3. [Step-by-Step First-Time Setup](#3-step-by-step-first-time-setup)
4. [The .env File](#4-the-env-file)
5. [Sound Assets](#5-sound-assets)
6. [Daily Workflow](#6-daily-workflow)
7. [When the Approval Gate Is On](#7-when-the-approval-gate-is-on)
8. [Walked Example](#8-walked-example)
9. [Keeping Up to Date](#9-keeping-up-to-date)
10. [Running the Startup Sync](#10-running-the-startup-sync)

---

## 1. What You'll Have When Done

After completing this guide you will have:

- A Cloudflare Worker that fires at 5:00 AM ET every day and generates a fully structured, ~18–22 minute episode script via OpenAI (gpt-5.5 + web_search)
- Topic deduplication — the last 7 days of covered stories are stored in KV so no story repeats
- Fact-checking (3 independent passes with majority vote) and a pronunciation scan run automatically before TTS
- ElevenLabs TTS synthesizes the approved script into MP3 chunks in parallel (4 at a time)
- All chunks, the manifest, script files, and metadata land in Cloudflare R2
- One command each morning (`./scripts/morning-cup.sh make`) assembles the final MP3, loudness-normalizes to -16 LUFS, embeds chapter markers, and generates a Whisper transcript
- An optional multi-track Audacity project (.aup3) generated automatically for post-production editing
- A Metadata.txt file alongside every episode containing post title, SEO fields, tags, description, chapters, sources, riddle, and social copy ready for WordPress
- Optional editorial approval gate: the pipeline pauses after script generation so an editor can review the Serialized Script HTML before TTS begins
- Total daily human time: approximately 30 seconds

[↑ Back to top](#table-of-contents)

---

## 2. Prerequisites

Install the following tools before proceeding. All commands assume a fresh system for each platform.

> **Windows note:** WSL2 (Windows Subsystem for Linux) is required. PowerShell alone is not supported. Install WSL2 first (`wsl --install` in an Administrator PowerShell), then follow the Ubuntu/Debian instructions below inside your WSL2 terminal.

---

### macOS

```bash
# Homebrew (skip if already installed)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Core tools
brew install node ffmpeg git python3

# Wrangler CLI (Cloudflare)
npm install -g wrangler

# Python packages
python3 -m pip install --user --break-system-packages mutagen requests numpy

# Verify
node --version        # should print v20.x or higher
ffmpeg -version       # should print ffmpeg version ...
git --version         # should print git version ...
python3 --version     # should print Python 3.x
wrangler --version    # should print wrangler x.x.x
python3 -c "import mutagen, requests, numpy; print('python packages OK')"
```

---

### Ubuntu / Debian (including WSL2)

```bash
sudo apt update && sudo apt upgrade -y

# Node (via NodeSource for a current LTS version)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# ffmpeg, git, python3
sudo apt install -y ffmpeg git python3 python3-pip

# Wrangler CLI
npm install -g wrangler

# Python packages
python3 -m pip install --user mutagen requests numpy

# Verify
node --version
ffmpeg -version
git --version
python3 --version
wrangler --version
python3 -c "import mutagen, requests, numpy; print('python packages OK')"
```

---

### CentOS / RHEL (8+)

```bash
sudo dnf update -y

# Node (via NodeSource)
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo dnf install -y nodejs

# ffmpeg (enable EPEL + RPM Fusion)
sudo dnf install -y epel-release
sudo dnf install -y https://download1.rpmfusion.org/free/el/rpmfusion-free-release-$(rpm -E %rhel).noarch.rpm
sudo dnf install -y ffmpeg

# git, python3
sudo dnf install -y git python3 python3-pip

# Wrangler CLI
npm install -g wrangler

# Python packages
python3 -m pip install --user mutagen requests numpy

# Verify
node --version
ffmpeg -version
git --version
python3 --version
wrangler --version
python3 -c "import mutagen, requests, numpy; print('python packages OK')"
```

---

### Raspberry Pi (Raspberry Pi OS / Debian-based)

```bash
sudo apt update && sudo apt upgrade -y

# Node (Raspberry Pi OS ships an older version; use NodeSource)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# ffmpeg, git, python3
sudo apt install -y ffmpeg git python3 python3-pip

# Wrangler CLI
npm install -g wrangler

# Python packages
# Note: on Raspberry Pi OS Bookworm, --break-system-packages is required
python3 -m pip install --user --break-system-packages mutagen requests numpy

# Verify
node --version
ffmpeg -version
git --version
python3 --version
wrangler --version
python3 -c "import mutagen, requests, numpy; print('python packages OK')"
```

---

### Chrome OS (Crostini — Linux development environment)

Enable the Linux development environment in Settings → Advanced → Developers → Linux development environment, then open the Linux terminal and follow the Ubuntu/Debian instructions above exactly.

[↑ Back to top](#table-of-contents)

---

## 3. Step-by-Step First-Time Setup

### a. Create the folder structure

**macOS / Linux / WSL2:**

```bash
mkdir -p ~/Documents/"The Morning Cup"/Sounds
mkdir -p ~/Documents/"The Morning Cup"/Chunks
mkdir -p ~/Documents/"The Morning Cup"/Episodes
```

**Windows (WSL2 — run in your WSL2 terminal):**

```bash
mkdir -p ~/Documents/"The Morning Cup"/Sounds
mkdir -p ~/Documents/"The Morning Cup"/Chunks
mkdir -p ~/Documents/"The Morning Cup"/Episodes
```

The folder is always named **The Morning Cup** — Title Case, with spaces, no leading or trailing space.

- Mac / Linux base path: `~/Documents/The Morning Cup/`
- Windows base path (native): `%USERPROFILE%\Documents\The Morning Cup\`
- Windows path inside WSL2: `~/Documents/The Morning Cup/` (maps to the same location)

---

### b. Clone the repository into Generator/

```bash
cd ~/Documents/"The Morning Cup"
git clone https://github.com/pennydoesdev/TheMorningCup-Episode-Generator.git Generator
```

After cloning, your structure will be:

```
~/Documents/The Morning Cup/
├── Generator/      ← cloned repo (source of truth for all scripts + Worker code)
├── Sounds/         ← sound assets go here (next step)
├── Chunks/         ← auto-populated on each run
└── Episodes/       ← final MP3s land here
```

---

### c. Run npm install

```bash
cd ~/Documents/"The Morning Cup"/Generator
npm install
```

This installs Wrangler and all Worker dependencies locally. Re-run this any time you pull new code.

---

### d. Copy sound assets to Sounds/

If the repository includes placeholder assets in `assets/sounds/`, copy them now:

```bash
cp ~/Documents/"The Morning Cup"/Generator/assets/sounds/*.{wav,mp3} \
   ~/Documents/"The Morning Cup"/Sounds/ 2>/dev/null || true
```

Then replace any placeholder files with your real production audio. See [Section 5 — Sound Assets](#5-sound-assets) for the exact filenames and what each file does.

---

### e. Create the .env file

```bash
cat > ~/Documents/"The Morning Cup"/.env <<'ENVEOF'
# Worker URL (update if you deploy to a custom domain)
WORKER_URL=https://themorningcupgenerator.itsmiarosemathews.workers.dev

# Worker auth — must match the RUN_SECRET Cloudflare secret (set in step g)
RUN_SECRET=your-run-secret-here

# Required for Whisper auto-transcription after each episode build
OPENAI_API_KEY=sk-...

# ElevenLabs credentials (same values as set via wrangler secret put)
ELEVENLABS_API_KEY=...
ELEVENLABS_VOICE_ID=...
ENVEOF

chmod 600 ~/Documents/"The Morning Cup"/.env
```

See [Section 4 — The .env File](#4-the-env-file) for a full description of every variable.

---

### f. Run wrangler login

```bash
cd ~/Documents/"The Morning Cup"/Generator
npx wrangler login
```

A browser window opens. Approve the Cloudflare authorization. You only need to do this once per machine.

---

### g. Set secrets via wrangler secret put

These secrets are stored securely in Cloudflare and injected into the Worker at runtime. They are never written to `wrangler.toml`.

```bash
cd ~/Documents/"The Morning Cup"/Generator

# Paste the value at the prompt for each one:
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put ELEVENLABS_API_KEY
npx wrangler secret put ELEVENLABS_VOICE_ID
npx wrangler secret put RUN_SECRET
```

To verify all secrets are set:

```bash
npx wrangler secret list
```

You should see all four names listed.

---

### h. Deploy the Worker

```bash
cd ~/Documents/"The Morning Cup"/Generator
npx wrangler deploy
```

Wrangler compiles the TypeScript and deploys it to Cloudflare. This takes about 30 seconds. The output will show your Worker URL.

---

### i. Run the preflight check

```bash
cd ~/Documents/"The Morning Cup"/Generator
./scripts/morning-cup.sh preflight
```

Preflight checks every dependency (node, ffmpeg, python3, wrangler, mutagen, requests), verifies your `.env` has `RUN_SECRET`, confirms Wrangler is authenticated, checks that the Worker is reachable, and verifies all required sound files are present.

All checks should show `PASS`. Fix any `FAIL` items before continuing.

---

### j. Generate your first episode

```bash
cd ~/Documents/"The Morning Cup"/Generator
./scripts/morning-cup.sh make
```

This runs the full pipeline: preflight → trigger Worker → poll status → fetch chunks from R2 → assemble final MP3 → transcribe. Allow 5–8 minutes for the first run.

[↑ Back to top](#table-of-contents)

---

## 4. The .env File

The `.env` file lives at `~/Documents/The Morning Cup/.env` (never inside the `Generator/` repo folder). It should be `chmod 600`.

**Full format:**

```
# Worker URL — update if you deploy to a custom workers.dev subdomain or custom domain
WORKER_URL=https://themorningcupgenerator.itsmiarosemathews.workers.dev

# Auth secret — must match the RUN_SECRET set via wrangler secret put
# Used by morning-cup.sh to authenticate POST /run, POST /approve, POST /reject
RUN_SECRET=your-long-random-secret

# OpenAI API key — used by transcribe-episode.py for Whisper transcription
# Also used by the Worker (set via wrangler secret put, not here)
OPENAI_API_KEY=sk-...

# ElevenLabs credentials — used by the Worker (set via wrangler secret put)
# Listed here for reference; local scripts do not call ElevenLabs directly
ELEVENLABS_API_KEY=...
ELEVENLABS_VOICE_ID=...
```

**Where to find each value:**

| Variable | Where to get it |
|---|---|
| `WORKER_URL` | Printed by `npx wrangler deploy`; also visible in the Cloudflare Workers dashboard |
| `RUN_SECRET` | You choose this — generate with `openssl rand -hex 32` |
| `OPENAI_API_KEY` | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |
| `ELEVENLABS_API_KEY` | ElevenLabs dashboard → Profile → API Keys |
| `ELEVENLABS_VOICE_ID` | ElevenLabs dashboard → Voices → click your voice → copy the Voice ID |

[↑ Back to top](#table-of-contents)

---

## 5. Sound Assets

All sound files live in `~/Documents/The Morning Cup/Sounds/`. The exact filenames are required — scripts reference them by name.

| Filename | Type | Required | What it does |
|---|---|---|---|
| `Hello.mp3` | Music bed | Required | Intro music; plays at the very start of every episode |
| `Coffee Pour.wav` | SFX | Required | Signature coffee pour sound effect; plays immediately after the intro music at the opening |
| `Topic Transition.mp3` | Sting | Required | Section transition sting; inserted between each news section in the episode |
| `Goodbye.mp3` | Music bed | Required | Outro music; plays at the end of every episode |
| `intro-sting.wav` | Sting | Optional | "Now the news begins" sting; plays after the coffee pour if present |
| `Podcast Background.mp3` | Music bed | Optional | Background music mixed under the TTS narration at 10% volume throughout the episode |

To copy any assets already included in the repository:

```bash
cp ~/Documents/"The Morning Cup"/Generator/assets/sounds/*.{wav,mp3} \
   ~/Documents/"The Morning Cup"/Sounds/ 2>/dev/null || true
```

For production use, replace placeholders with your own recorded or licensed audio assets. Prompt templates for generating stings with ElevenLabs are in `docs/PROMPTS.md`.

[↑ Back to top](#table-of-contents)

---

## 6. Daily Workflow

After first-time setup, every morning is two commands:

```bash
cd ~/Documents/"The Morning Cup"/Generator
./scripts/morning-cup.sh make
```

If the 5 AM cron already ran while you slept, `make` detects that the episode is `completed` and skips directly to fetching and building. If it has not run yet (or if you want to run manually), `make` triggers the Worker and waits.

**What happens step by step:**

1. **Preflight** — checks all dependencies, secrets, sound files, and Worker reachability
2. **Trigger** — fires `POST /run` to the Cloudflare Worker (skipped if today's episode is already completed)
3. **Poll** — polls `GET /status` every 20 seconds and prints the current stage:
   - `pending` → `generating` → `validating` → `awaiting_approval` (if gate is on) → `approved` → `tts` → `completed`
4. **Fetch** — runs `fetch-chunks.sh` to download the manifest + all MP3 chunks from R2 into `~/Documents/The Morning Cup/Chunks/YYYY-MM-DD/`
5. **Build** — runs `build-episode.sh` which concatenates audio, loudness-normalizes to -16 LUFS, writes ID3 tags, and embeds chapter markers
6. **Transcribe** *(bonus, requires `OPENAI_API_KEY` in `.env`)* — runs `transcribe-episode.py`, sends the finished MP3 to OpenAI Whisper, writes a `.vtt` transcript alongside the MP3
7. **Audacity** *(bonus, requires `numpy` installed)* — runs `build-audacity.py`, generates a multi-track `.aup3` project for editing

**Output files in `~/Documents/The Morning Cup/Episodes/`:**

```
The Morning Cup - YYYY-MM-DD.mp3
The Morning Cup - YYYY-MM-DD - Metadata.txt
The Morning Cup - YYYY-MM-DD.vtt
The Morning Cup - YYYY-MM-DD.aup3     (if Audacity step ran)
```

**Typical wall time:** ~5–8 minutes when triggered manually. Zero minutes of your time when the 5 AM cron has already done the generation overnight.

[↑ Back to top](#table-of-contents)

---

## 7. When the Approval Gate Is On

When `ENABLE_APPROVAL_GATE=true` is set in `wrangler.toml`, the Worker pauses after script generation and fact-checking. The episode will not proceed to TTS until an editor explicitly approves it.

**What you see in the terminal during polling:**

```
[mc]   07:14:32  awaiting_approval  script ready — waiting for editorial approval

  --- Editorial Review Required ---
  The script is ready and waiting for approval.

  Serialized Script (R2 key):
    Generators/Podcasts/TheMorningCup/2026-05-24/The Morning Cup - 2026-05-24 - Serialized Script-42-20260524.html

  Download to review:
    npx wrangler r2 object get vicinity "Generators/Podcasts/TheMorningCup/..." --file review.html

  To approve and start TTS:
    ./scripts/morning-cup.sh approve 2026-05-24

  To reject and regenerate:
    ./scripts/morning-cup.sh reject 2026-05-24
```

**How to download and review the Serialized Script HTML:**

```bash
npx wrangler r2 object get vicinity \
  "Generators/Podcasts/TheMorningCup/2026-05-24/The Morning Cup - 2026-05-24 - Serialized Script-42-20260524.html" \
  --file ~/Downloads/review.html --remote
open ~/Downloads/review.html   # macOS; on Linux: xdg-open ~/Downloads/review.html
```

The Serialized Script HTML is a self-contained review document containing the full script, fact-check results, pronunciation flags, and metadata. It is an audit artifact — once generated, it is never modified.

**How to approve:**

```bash
cd ~/Documents/"The Morning Cup"/Generator
./scripts/morning-cup.sh approve 2026-05-24
```

This sends `POST /approve?date=2026-05-24` to the Worker. The Worker moves the run record to `approved` and immediately starts TTS. Polling in the `make` command (if still running) will detect the transition to `tts` and then `completed` automatically.

**How to reject:**

```bash
cd ~/Documents/"The Morning Cup"/Generator
./scripts/morning-cup.sh reject 2026-05-24 "Intro section too long, needs revision"
```

This sets the run to `failed` with the reason attached. To regenerate:

```bash
./scripts/morning-cup.sh make --force 2026-05-24
```

[↑ Back to top](#table-of-contents)

---

## 8. Walked Example

Complete end-to-end example for **2026-05-24**.

### Run make

```bash
cd ~/Documents/"The Morning Cup"/Generator
./scripts/morning-cup.sh make
```

### Terminal output — preflight

```
[mc] preflight: checking dependencies, secrets, and assets...
  PASS  ffmpeg: /opt/homebrew/bin/ffmpeg
  PASS  python3: /opt/homebrew/bin/python3
  PASS  wrangler: via npx (npx wrangler)
  PASS  wrangler authenticated
  PASS  python: mutagen
  PASS  python: requests
  PASS  RUN_SECRET present (length=64)
  PASS  worker reachable: https://themorningcupgenerator.itsmiarosemathews.workers.dev (HTTP 200)
  PASS  sound: Hello.mp3
  PASS  sound: Coffee Pour.wav
  PASS  sound: Topic Transition.mp3
  PASS  sound: Goodbye.mp3
  WARN  sound: intro-sting.wav (optional, missing)
  PASS  script: fetch-chunks.sh
  PASS  script: build-episode.sh
[mc] preflight: all checks passed.
```

### Terminal output — trigger and poll

```
[mc] make: episode date=2026-05-24 worker=https://themorningcupgenerator...

[mc] step 1/4: querying worker status...
[mc] current status: absent

[mc] step 1b: triggering /run (force=true) — pipeline runs in Worker, polling for progress...
[mc] post-trigger status: pending

[mc] step 2/4: polling /status every 20s (max 30 min for script, then waits for approval)...
[mc]   tip: open a second terminal and run 'morning-cup.sh monitor' for a live dashboard

[mc]   07:14:05  pending              queued, waiting to start
[mc]   07:14:25  generating           OpenAI writing script...
[mc]   07:16:45  generating           OpenAI writing script...
[mc]   07:17:05  validating           checking word count + structure...
[mc]   07:17:25  tts                  ElevenLabs rendering chunks...
[mc]   07:19:05  tts                  ElevenLabs rendering chunks...
[mc]   07:20:45  completed            done!
```

### Example status JSON

```json
{
  "record": {
    "status": "completed",
    "episode_date": "2026-05-24",
    "episode_title": "The Morning Cup: Rates, AI Rules & Your Sunday Riddle",
    "started_at": "2026-05-24T11:14:06.123Z",
    "updated_at": "2026-05-24T11:20:41.987Z",
    "word_count": 3412,
    "estimated_runtime_minutes": 23.5,
    "chunk_count": 12,
    "approved_at": null
  }
}
```

### Terminal output — fetch and build

```
[mc] step 3/4: fetching chunks from R2...
  downloading manifest...
  downloading 12 chunks...
  [============================================================] 12/12

[mc] step 4/4: building final MP3...
  Normalizing 28 input clips...
  Concatenating...
  Loudness normalizing to -16 LUFS...
  Writing ID3 tags...
  Writing 14 chapter markers...

  Done.
    ~/Documents/The Morning Cup/Episodes/The Morning Cup - 2026-05-24.mp3
    Size: 42M  Duration: 23:31

[mc] step 5 (bonus): generating Whisper transcript...
  Transcribed: The Morning Cup - 2026-05-24.vtt

[mc] step 6 (bonus): building Audacity multi-track project...
  Written: The Morning Cup - 2026-05-24.aup3

[mc] make: done.
  ~/Documents/The Morning Cup/Episodes/The Morning Cup - 2026-05-24.mp3
```

### Result: file locations

| File | Location |
|---|---|
| Final MP3 | `~/Documents/The Morning Cup/Episodes/The Morning Cup - 2026-05-24.mp3` |
| Metadata | `~/Documents/The Morning Cup/Episodes/The Morning Cup - 2026-05-24 - Metadata.txt` |
| Transcript | `~/Documents/The Morning Cup/Episodes/The Morning Cup - 2026-05-24.vtt` |
| Audacity project | `~/Documents/The Morning Cup/Episodes/The Morning Cup - 2026-05-24.aup3` |
| Raw chunks | `~/Documents/The Morning Cup/Chunks/2026-05-24/` |

[↑ Back to top](#table-of-contents)

---

## 9. Keeping Up to Date

When new code is pushed to the repository, run these four commands:

```bash
cd ~/Documents/"The Morning Cup"/Generator
git pull origin claude/brave-gates-wbCkD
npm install
npx wrangler deploy
```

**Why each step matters:**

- `git pull` — fetches the latest Worker source and updated local scripts
- `npm install` — regenerates `package-lock.json`; the Cloudflare dashboard CI uses `npm ci` which requires the lock file to be in sync with `package.json`; skipping this step causes the dashboard build to fail with lock file mismatch errors
- `npx wrangler deploy` — pushes the compiled Worker to Cloudflare; without this, the live Worker is still running the old code

[↑ Back to top](#table-of-contents)

---

## 10. Running the Startup Sync

`scripts/sync.sh` runs automatically each time you open a terminal if your shell profile is configured to call it. This keeps your local scripts in sync with the repository without requiring a manual `git pull` every morning.

See the README for shell profile setup instructions. Once configured, opening a new terminal window is all you need to ensure your local scripts match the current branch.

[↑ Back to top](#table-of-contents)
