# The Morning Cup — Episode Generator

**Cloudflare Worker + local pipeline that writes, fact-checks, voices, and assembles a daily news podcast episode — fully automated, with an optional editorial approval gate.**

![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6?logo=typescript&logoColor=white)
![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-f38020?logo=cloudflare&logoColor=white)

---

## Table of Contents

1. [What Is This?](#what-is-this)
2. [How an Episode Is Created — Pipeline Overview](#how-an-episode-is-created--pipeline-overview)
3. [Required Software](#required-software)
4. [Required Accounts](#required-accounts)
5. [First-Time Setup](#first-time-setup)
   - [macOS](#macos)
   - [Windows (WSL)](#windows-wsl)
   - [Ubuntu / Debian](#ubuntu--debian)
   - [CentOS / RHEL](#centos--rhel)
   - [Raspberry Pi](#raspberry-pi)
   - [Chrome OS (Crostini)](#chrome-os-crostini)
   - [All Platforms — Clone & Install](#all-platforms--clone--install)
6. [Audacity Setup](#audacity-setup)
7. [Folder Structure](#folder-structure)
8. [Environment File (.env)](#environment-file-env)
9. [Deploying the Worker](#deploying-the-worker)
10. [Daily Workflow](#daily-workflow)
11. [Approval Workflow](#approval-workflow)
12. [WordPress / VNewsOS Integration](#wordpress--vnewsos-integration)
13. [All Generated Files](#all-generated-files)
14. [Worker Configuration Reference](#worker-configuration-reference)
15. [Sync & Update](#sync--update)
16. [Desktop Applet](#desktop-applet)
17. [Security & Access Control](#security--access-control)
18. [Troubleshooting](#troubleshooting)
19. [Documentation Index](#documentation-index)
20. [License / Credits](#license--credits)

---

## What Is This?

The Morning Cup Episode Generator is the complete production system for *The Morning Cup*, a daily news podcast produced by Fold 42 and hosted by Penelope Rose. A Cloudflare Worker wakes each morning, ingests RSS and API news feeds into a structured source digest, calls OpenAI's gpt-5.5 Responses API with live `web_search` enabled, and generates a fully written, fact-checked, and validated episode script in one automated pass. That script then moves through ElevenLabs text-to-speech synthesis, where it is split into optimally-sized chunks and rendered in parallel before being reassembled into a broadcast-ready MP3 file on a local machine using ffmpeg.

The system is built around an optional editorial approval gate: when `ENABLE_APPROVAL_GATE=true`, the pipeline pauses after script generation and waits for a human editor to review the Serialized Script HTML — a rich review document that includes the complete episode script with inline source citations, three independent fact-check passes with a 2-of-3 majority ruling, a pronunciation flag report, and a DocuSign-style approval block. Only after an editor calls `/approve` (from the command line or from the WordPress editorial desk) does TTS synthesis begin. When the gate is off (the default), the pipeline runs straight through from trigger to completed MP3 with no human intervention required. Either way, the local `morning-cup.sh make` command handles polling, chunk download, and final assembly in a single command.

[↑ Back to top](#table-of-contents)

---

## How an Episode Is Created — Pipeline Overview

The following describes the complete sequence for a single episode, from trigger to published draft.

**Phase 1 — Script Generation (Cloudflare Worker)**

- **5 AM ET:** The Cloudflare Worker's scheduled handler fires (or a manual `POST /run` is called). The Worker checks the current Eastern time and skips if the hour is not 5, preventing double-runs across DST boundaries.
- **Lock check:** The Worker reads the KV run record for today's date. If a `completed` record already exists and `force=true` was not passed, the run is skipped immediately.
- **Source digest:** `sourceDigest.ts` fetches configured RSS feeds, NewsAPI endpoints, and real-time weather from tomorrow.io and weather.gov. The digest is serialized into structured categories and injected into the prompt.
- **Topic deduplication:** Recent episode topics are read from KV so the prompt can instruct the model to avoid repeating stories covered in recent episodes.
- **Corrections bridge:** If a `pending_corrections` KV key exists (set via `wrangler kv key put`), its content is injected into the prompt as an on-air correction read before the story tease, then deleted from KV after one use.
- **OpenAI generation:** `openai.ts` calls the gpt-5.5 Responses API with `web_search` enabled and the full show prompt from `prompt.ts`. The result is parsed as structured `EpisodeJson`.
- **Validation:** `validator.ts` checks word count (hard floor: 2,175 words / ~15 min; sweet spot: 2,610–2,900 words; hard ceiling: 4,350 words), spacer marker count (minimum 23 `[TEN-SECOND SECTION SPACER]` markers), required fields, forbidden patterns (music cues, production notes, markdown tables, raw URLs), and show title and host name presence.
- **Repair pass:** If validation fails and `ENABLE_REPAIR_PASS=true`, the Worker calls OpenAI a second time with the validation errors included, attempting to expand or fix the script. If the repair also fails, a rejected JSON is archived in R2 and the run is marked `failed`.
- **Fact-check:** `factcheck.ts` runs three independent OpenAI passes to verify factual claims in the script. A 2-of-3 majority determines each finding. Results are recorded in the audit trail.
- **Pronunciation scan:** `pronunciationScanner.ts` flags unknown proper nouns and unusual terms that ElevenLabs may mispronounce, writing a pronunciation report to R2.
- **Sidecar audit trail:** `sidecar.ts` builds `Sidecar.json` containing generation metadata, all three fact-check pass results, timing information, and the full validation report.
- **Serialized Script HTML:** `serializedScript.ts` builds the editorial review document — a self-contained HTML file with the complete episode script, inline source citations, fact-check results, a works-cited list, and an approval block with serial number and timestamp fields.
- **R2 uploads (Phase 1 outputs):** The Worker writes the clean script TXT, HTML-formatted script, full episode JSON, and Metadata.txt to R2 under `Generators/Podcasts/TheMorningCup/{YYYY-MM-DD}/`.
- **Status → `awaiting_approval`:** The KV run record is updated with all R2 file keys, word count, estimated runtime, and the primary episode title.

**Approval Gate**

- If `ENABLE_APPROVAL_GATE=true`: The pipeline pauses at `awaiting_approval`. An editor reviews the Serialized Script HTML (download from R2 or via the WordPress editorial desk) and calls `POST /approve` or `POST /reject`.
- If `ENABLE_APPROVAL_GATE=false` (default): The Worker proceeds immediately into Phase 2 without waiting for any human action.

**Phase 2 — TTS Synthesis (Cloudflare Worker)**

- **Status → `tts`:** The run record is updated.
- **Chunking:** `chunker.ts` splits `elevenlabs_script` into chunks of up to 5,000 characters, respecting natural sentence and paragraph boundaries. Each chunk is assigned an R2 key and an order number.
- **Parallel synthesis:** ElevenLabs renders 4 chunks concurrently. Per-section voice presets override the default stability/style settings based on chapter title: warm and expressive for the opening, closing, and historical segments; authoritative and steady for hard news (politics, crime, international); practical and calm for weather and cost-of-living.
- **Silence handling:** `[5-SECOND PAUSE]` markers in the script produce multiple audio segments that are concatenated into one file before upload.
- **Manifest + files.txt:** After all chunks succeed, `manifest.json` (chunk list, chapter list, word count, runtime, publisher info) and `files.txt` (ffmpeg concat demuxer list) are written to R2.
- **Status → `completed`:** The run record is finalized with `completed_at`, `chunk_count`, and the manifest and files list keys.

**Phase 3 — Local Assembly**

- **`morning-cup.sh make`:** The operator runs this on their local machine. The script polls `/status` every 20 seconds until `completed`. It then calls `fetch-chunks.sh` to download all TTS chunks and the manifest from R2, and calls `build-episode.sh` to run the ffmpeg assembly pipeline.
- **ffmpeg assembly:** `build-episode.sh` concatenates `Hello.mp3` → `Coffee Pour.wav` → optional `intro-sting.wav` → TTS chunks (with `Topic Transition.mp3` stings between sections) → `Goodbye.mp3`. ID3 tags are written from the manifest. Chapter markers are embedded. The optional `Podcast Background.mp3` is mixed in at ~10%. The final file is saved to `~/Documents/The Morning Cup/Episodes/`.
- **Auto-transcript:** If `OPENAI_API_KEY` is present in `.env`, `transcribe-episode.py` calls OpenAI Whisper and writes a `.vtt` WebVTT transcript alongside the MP3.
- **Auto-Audacity project:** If `numpy` is installed, `build-audacity.py` writes a color-coded multi-track `.aup3` project with chapter labels at exact timestamps.

**Phase 4 — WordPress Draft Creation**

- `Metadata.txt`, written during Phase 1, contains all fields needed for the VNewsOS CPT importer: title options, episode number, season, description, SEO fields, tags, audio CDN URLs, and category assignments.
- After `status = completed`, the WordPress integration creates a `vicinity_podcast` child episode post as a draft. The post is only publishable after approval is confirmed (when the gate is on, `approved_at` must be present in the run record before the post may move to published).

[↑ Back to top](#table-of-contents)

---

## Required Software

Install all of the following before running first-time setup.

| Tool | Used for | Download |
|------|----------|----------|
| **Node.js 20+** | Running Wrangler and `npm install` | https://nodejs.org |
| **Wrangler** (npm package) | Cloudflare Worker CLI — deploy, secrets, R2 access | `npm install -g wrangler` |
| **ffmpeg** | Audio assembly, ID3 tagging, chapter embedding | https://ffmpeg.org/download.html |
| **Python 3.9+** | Local pipeline scripts (transcript, Audacity project, chapter writer) | https://www.python.org/downloads/ |
| **Audacity 3.x** | Multi-track editing of assembled episodes | https://www.audacityteam.org/download/ |
| **Git** | Cloning and updating the repository | https://git-scm.com |
| **mutagen** (Python) | Writing ID3 tags and chapter data to the final MP3 | `pip install mutagen` |
| **requests** (Python) | HTTP calls in fetch and transcript scripts | `pip install requests` |
| **numpy** (Python, optional) | Building the `.aup3` Audacity project file | `pip install numpy` |
| **cryptography** (Python, optional) | Signing and verifying approval payloads | `pip install cryptography` |
| **boto3** (Python, optional) | Direct S3-compatible R2 access from local scripts | `pip install boto3` |

[↑ Back to top](#table-of-contents)

---

## Required Accounts

| Service | What it provides | Notes |
|---------|-----------------|-------|
| **Cloudflare** | Cloudflare Worker runtime, R2 object storage (bucket: `vicinity`), KV namespace for run records | Free tier covers typical daily usage; R2 egress to the internet is free |
| **OpenAI** | gpt-5.5 Responses API with `web_search` for script generation; Whisper API for transcription | gpt-5.5 access required; use a project API key (`sk-proj-...`) |
| **ElevenLabs** | Text-to-speech synthesis with a custom trained voice | Custom voice ID required; `eleven_multilingual_v2` model |

[↑ Back to top](#table-of-contents)

---

## First-Time Setup

> The local folder must be named exactly **`The Morning Cup`** — Title Case with spaces, no leading or trailing spaces.
> - macOS / Linux / WSL: `~/Documents/The Morning Cup/`
> - Windows: `%USERPROFILE%\Documents\The Morning Cup\`

### macOS

```bash
# Install Homebrew if needed
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install system tools
brew install node ffmpeg git

# Install Python packages
python3 -m pip install --user --break-system-packages mutagen requests numpy

# Install Wrangler globally
npm install -g wrangler
```

[↑ Back to top](#table-of-contents)

---

### Windows (WSL)

WSL (Windows Subsystem for Linux) is the recommended environment on Windows. Run the following in PowerShell **as Administrator**:

```powershell
# Enable WSL and install Ubuntu
wsl --install -d Ubuntu
# Restart when prompted, then open Ubuntu from the Start menu.
# Then follow the Ubuntu / Debian instructions below inside WSL.
```

[↑ Back to top](#table-of-contents)

---

### Ubuntu / Debian

```bash
sudo apt update && sudo apt install -y ffmpeg git python3 python3-pip curl

# Install Node.js 20 from NodeSource
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install Python packages
pip3 install --user mutagen requests numpy

# Install Wrangler globally
npm install -g wrangler
```

[↑ Back to top](#table-of-contents)

---

### CentOS / RHEL

```bash
sudo dnf install -y git python3 python3-pip

# ffmpeg via EPEL
sudo dnf install -y epel-release && sudo dnf install -y ffmpeg

# Node.js 20 from NodeSource
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo dnf install -y nodejs

# Install Python packages
pip3 install --user mutagen requests numpy

# Install Wrangler globally
npm install -g wrangler
```

[↑ Back to top](#table-of-contents)

---

### Raspberry Pi

Tested on Raspberry Pi OS (Bookworm, 64-bit). Runs well on Pi 4 and Pi 5; Pi 3 is not recommended due to memory constraints during ffmpeg assembly.

```bash
sudo apt update && sudo apt install -y ffmpeg git python3 python3-pip

# Install Node.js 20 from NodeSource
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install Python packages
pip3 install --user mutagen requests numpy

# Wrangler requires sudo on Pi due to npm global prefix permissions
sudo npm install -g wrangler
```

[↑ Back to top](#table-of-contents)

---

### Chrome OS (Crostini)

Enable the Linux development environment first: **Settings → Advanced → Developers → Linux development environment → Turn on**. Then open the Linux terminal:

```bash
sudo apt update && sudo apt install -y ffmpeg git python3 python3-pip nodejs npm

pip3 install --user mutagen requests numpy

sudo npm install -g wrangler
```

[↑ Back to top](#table-of-contents)

---

### All Platforms — Clone & Install

After completing the OS-specific steps above, run the following on every platform:

```bash
# Create the base folder — exact name, spacing, and casing are required
cd "$HOME/Documents"
mkdir -p "The Morning Cup"
cd "The Morning Cup"

# Clone the repository into the Generator subfolder
git clone https://github.com/pennydoesdev/TheMorningCup-Episode-Generator.git Generator
cd Generator

# Install Node dependencies
npm install
```

**Windows path equivalent:** `%USERPROFILE%\Documents\The Morning Cup\Generator`

> The folder must be named exactly `The Morning Cup` — Title Case, one space between each word, no leading or trailing spaces. All scripts hardcode `~/Documents/The Morning Cup/` (Mac/Linux) or `%USERPROFILE%\Documents\The Morning Cup\` (Windows/WSL) as the base directory. Deviating from this name will break all scripts.

[↑ Back to top](#table-of-contents)

---

## Audacity Setup

Audacity is used for detailed multi-track editing of assembled episodes. The `.aup3` project file is generated automatically by `morning-cup.sh audacity` — you do not need to import audio files manually.

**Step 1 — Download Audacity 3.x** from https://www.audacityteam.org/download/ and install it for your OS. Audacity 2.x is not compatible with the `.aup3` format.

**Step 2 — Install the FFmpeg library for Audacity** (required to export MP3 from within Audacity):

- Full instructions: https://support.audacityteam.org/basics/installing-ffmpeg
- macOS: `brew install ffmpeg` is sufficient; point Audacity to `/opt/homebrew/lib/libavcodec.dylib` in Audacity Preferences → Libraries.
- Windows: Download the Audacity FFmpeg installer from the link above.
- Linux / Pi / Chrome OS: `sudo apt install ffmpeg`, then set the library path in Audacity Preferences → Libraries.

**Step 3 — Track layout in the generated `.aup3` project:**

| Track color | Contents |
|-------------|----------|
| GREEN | Intro music (`Hello.mp3`) and outro music (`Goodbye.mp3`) |
| ORANGE | Sound effects and stings — `Coffee Pour.wav`, `Topic Transition.mp3`, `intro-sting.wav` |
| BLUE | TTS speech chunks — one track per chunk, sequenced in playback order |
| YELLOW | Background music (`Podcast Background.mp3`) at reduced gain (~10%) |

**Step 4 — Chapter markers** are embedded as an Audacity label track at the exact timestamps calculated from chunk durations. Each label matches a chapter title from the episode JSON.

**Step 5 — Generate the Audacity project** after `make` has completed:

```bash
cd ~/Documents/"The Morning Cup"/Generator
./scripts/morning-cup.sh audacity 2026-05-24
```

The `.aup3` file is saved to `~/Documents/The Morning Cup/Episodes/The Morning Cup - 2026-05-24.aup3`.

[↑ Back to top](#table-of-contents)

---

## Folder Structure

The following directory layout must exist locally before running the pipeline. The `Generator/` folder is this git repository. The `Sounds/` folder must be populated manually with the production audio assets. `Chunks/` and `Episodes/` are auto-created on first run.

```
~/Documents/The Morning Cup/
├── .env                            ← your local secrets (never committed to git)
├── Generator/                      ← git repository (this repo)
│   ├── scripts/
│   │   ├── morning-cup.sh          ← main daily runner (one command does everything)
│   │   ├── build-episode.sh        ← ffmpeg assembly pipeline
│   │   ├── fetch-chunks.sh         ← downloads TTS chunks from R2
│   │   ├── build-audacity.py       ← builds multi-track .aup3 project
│   │   ├── generate-transcript.py  ← Whisper transcript helper
│   │   ├── transcribe-episode.py   ← Whisper WebVTT generator
│   │   ├── write-chapters.py       ← chapter marker writer
│   │   ├── test-chunk.py           ← single-chunk TTS tester
│   │   └── team-setup.sh           ← team member onboarding script
│   ├── src/                        ← TypeScript Cloudflare Worker source
│   └── wrangler.toml               ← Cloudflare Worker configuration
├── Sounds/
│   ├── Hello.mp3                   ← intro music (REQUIRED)
│   ├── Goodbye.mp3                 ← outro music (REQUIRED)
│   ├── Coffee Pour.wav             ← signature pour SFX (REQUIRED)
│   ├── Topic Transition.mp3        ← section transition sting (REQUIRED)
│   ├── intro-sting.wav             ← news begins sting (optional)
│   └── Podcast Background.mp3      ← background music mixed at ~10% (optional)
├── Chunks/                         ← auto-created; TTS audio chunks downloaded here
│   └── 2026-05-24/
│       ├── The Morning Cup - 2026-05-24 - 001.mp3
│       ├── The Morning Cup - 2026-05-24 - 002.mp3
│       ├── ...
│       └── The Morning Cup - 2026-05-24 - manifest.json
└── Episodes/                       ← final MP3s, .aup3 projects, .vtt transcripts
    ├── The Morning Cup - 2026-05-24.mp3
    ├── The Morning Cup - 2026-05-24.aup3
    └── The Morning Cup - 2026-05-24.vtt
```

> Run `./scripts/morning-cup.sh preflight` at any time to verify that all required dependencies, secrets, and sound assets are present before triggering a run.

[↑ Back to top](#table-of-contents)

---

## Environment File (.env)

Create this file at `~/Documents/The Morning Cup/.env` — one level above the `Generator/` folder. All scripts in `scripts/` load it automatically at startup. This file is listed in `.gitignore` and must **never** be committed to git.

```
# Worker location and auth
WORKER_URL=https://themorningcupgenerator.itsmiarosemathews.workers.dev
RUN_SECRET=your-run-secret-here

# API keys (also set in Cloudflare via wrangler secret put — see Deploying the Worker)
# The Worker reads its own copies from Cloudflare Secrets.
# These local copies are used by local scripts (e.g. auto-transcription).
OPENAI_API_KEY=sk-proj-...
ELEVENLABS_API_KEY=...
ELEVENLABS_VOICE_ID=...
```

**Key notes:**

- `WORKER_URL` defaults to the production Worker URL if not set. Override this when testing with `wrangler dev` locally.
- `RUN_SECRET` is the Bearer token required for all `/run`, `/approve`, `/reject`, and (when `STATUS_PUBLIC=false`) `/status` requests. It must match the `RUN_SECRET` secret set in Cloudflare via `wrangler secret put RUN_SECRET`.
- `OPENAI_API_KEY` in `.env` enables the local Whisper auto-transcription step inside `morning-cup.sh make`. The deployed Worker reads its own copy from Cloudflare Secrets — these are separate values.
- Secrets are **never** stored in `wrangler.toml`. They live in `.env` locally and in Cloudflare Worker Secrets in production.
- `.dev.vars` (Wrangler's local dev file) is also in `.gitignore`. Do not commit it.

[↑ Back to top](#table-of-contents)

---

## Deploying the Worker

### Authenticate with Cloudflare

```bash
cd ~/Documents/"The Morning Cup"/Generator
wrangler login
```

This opens a browser to authorize your Cloudflare account. In headless environments (SSH, Raspberry Pi):

```bash
wrangler login --no-browser
# Copy the URL printed to the terminal, open it in a browser, authorize,
# then paste the callback URL back into the terminal.
```

### Deploy

```bash
cd ~/Documents/"The Morning Cup"/Generator
npx wrangler deploy
```

The Worker deploys to `themorningcupgenerator.itsmiarosemathews.workers.dev`. The full URL is printed on success.

### Set secrets

Secrets are stored exclusively in Cloudflare Worker Secrets — never in `wrangler.toml` or git. Set each one interactively (input is hidden):

```bash
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put ELEVENLABS_API_KEY
npx wrangler secret put ELEVENLABS_VOICE_ID
npx wrangler secret put RUN_SECRET
```

To confirm all secrets are configured:

```bash
npx wrangler secret list
```

### Verify the deployment

```bash
curl -s https://themorningcupgenerator.itsmiarosemathews.workers.dev/health
# Expected: {"ok":true,"service":"morning-cup-generator","time":"..."}
```

[↑ Back to top](#table-of-contents)

---

## Daily Workflow

### The one command

```bash
cd ~/Documents/"The Morning Cup"/Generator
./scripts/morning-cup.sh make
```

This single command does everything: runs preflight checks, triggers the Worker if today's episode has not yet been generated, polls `/status` every 20 seconds with live progress output, downloads the finished TTS chunks from R2, assembles the final MP3 with ffmpeg, generates a Whisper transcript (if `OPENAI_API_KEY` is set in `.env`), and builds the Audacity multi-track project (if `numpy` is installed).

### All subcommands

| Command | Description |
|---------|-------------|
| `make [DATE]` | Full pipeline: preflight → generate → poll → fetch → build. DATE defaults to today in America/New_York (YYYY-MM-DD). |
| `approve [DATE]` | Approve the script and trigger ElevenLabs TTS synthesis. Required when `ENABLE_APPROVAL_GATE=true`. |
| `reject [DATE] [reason]` | Reject the script and mark it for regeneration. Re-run with `--force` after rejecting. |
| `monitor [DATE]` | Live auto-refreshing dashboard showing pipeline stage, word count, estimated runtime, and approver info. Auto-exits on `completed` or `failed`. |
| `status [DATE]` | One-shot JSON status snapshot from the KV run record. |
| `fetch [DATE]` | Download TTS chunks and manifest from R2 only. Skips generation and polling. |
| `build [DATE]` | Assemble the final MP3 from locally downloaded chunks. Assumes chunks are already in `Chunks/`. |
| `transcribe [DATE]` | Generate a Whisper `.vtt` WebVTT transcript and save it alongside the MP3 in `Episodes/`. |
| `audacity [DATE]` | Build a multi-track Audacity `.aup3` project for the episode. Requires `numpy`. |
| `latest` | Open the most recently rendered episode in the system default audio player. |
| `open [DATE]` | Open a specific date's assembled MP3 in the system default audio player. |
| `preflight` | Check all required dependencies (ffmpeg, python3, wrangler auth, mutagen, requests), secrets, and sound assets. |

### Flags

| Flag | Effect |
|------|--------|
| `--force` | Re-generate even if today's episode is already `completed` in KV. |
| `--dry-run` | Print what would happen without executing any network calls. |
| `--skip-preflight` | Skip dependency checks. Not recommended for daily use. |
| `--no-color` | Disable ANSI terminal colors in output. |

### Generate a specific past date

```bash
./scripts/morning-cup.sh make 2026-05-20
```

### Monitor in a second terminal while `make` runs

```bash
# Terminal 1 — full pipeline
./scripts/morning-cup.sh make

# Terminal 2 — live dashboard
./scripts/morning-cup.sh monitor
```

### Re-run from scratch (force clear and regenerate)

```bash
cd ~/Documents/"The Morning Cup"/Generator

# 1. Deploy latest code
npx wrangler deploy

# 2. Clear today's KV run record
npx wrangler kv key delete --remote \
  --binding MORNING_CUP_KV \
  "morning-cup/$(TZ=America/New_York date +%Y-%m-%d)/run.json"

# 3. Force re-generate
./scripts/morning-cup.sh make --force
```

### Test a single TTS chunk

```bash
python3 scripts/test-chunk.py "Your test text here."
python3 scripts/test-chunk.py --file /path/to/excerpt.txt
```

Output is saved to `~/Documents/The Morning Cup/Chunks/test/` and opened automatically on macOS.

[↑ Back to top](#table-of-contents)

---

## Approval Workflow

The approval gate is an editorial checkpoint between script generation and TTS synthesis. It is **disabled by default**.

### Enabling the gate

In `wrangler.toml`, change:

```toml
ENABLE_APPROVAL_GATE = "true"
```

Then redeploy: `npx wrangler deploy`

### What happens when the gate is on

1. The Worker completes Phase 1 (script generation, validation, fact-check, all R2 uploads) as normal.
2. Status becomes `awaiting_approval` and the Worker stops — no TTS is started.
3. `morning-cup.sh make` detects `awaiting_approval` and prints the R2 key of the Serialized Script HTML, along with exact commands to approve or reject. Polling continues every 20 seconds.
4. The Serialized Script HTML contains the complete script with inline source citations, three-pass fact-check results with 2-of-3 majority rulings, a pronunciation flag report, a works-cited list, and an approval block with serial number and timestamp fields.
5. The editor reviews the script by downloading the HTML from R2 or via the WordPress editorial desk.

### Download the Serialized Script for review

The R2 key is printed when status first reaches `awaiting_approval`. To download it manually:

```bash
npx wrangler r2 object get vicinity \
  "Generators/Podcasts/TheMorningCup/2026-05-24/The Morning Cup - 2026-05-24 - Serialized Script-EPID-20260524.html" \
  --file review.html
open review.html       # macOS
# xdg-open review.html  # Linux
```

The exact key is also available via `morning-cup.sh status 2026-05-24`.

### Approve from the command line

```bash
./scripts/morning-cup.sh approve 2026-05-24

# With approver metadata (optional):
APPROVER_NAME="Penelope Rose" \
APPROVER_SERIAL="AP-2026-0524-001" \
APPROVAL_NOTES="Approved for broadcast" \
./scripts/morning-cup.sh approve 2026-05-24
```

### Approve from WordPress

WordPress sends:

```
POST https://themorningcupgenerator.itsmiarosemathews.workers.dev/approve?date=2026-05-24
Authorization: Bearer <RUN_SECRET>
Content-Type: application/json

{
  "approver_name": "Penelope Rose",
  "approver_serial": "AP-2026-0524-001",
  "approval_notes": "Approved for broadcast"
}
```

After a `200 OK` response, TTS synthesis starts automatically. Monitor progress with `morning-cup.sh monitor 2026-05-24`.

### Reject a script

```bash
./scripts/morning-cup.sh reject 2026-05-24 "Opening section too short; housing story needs more depth"
# Then regenerate:
./scripts/morning-cup.sh make --force 2026-05-24
```

### Default behavior — gate off

When `ENABLE_APPROVAL_GATE=false` (the default), the pipeline runs straight through from script generation to TTS to `completed` with no pause. This is the recommended setting for automated daily production once the show is in a stable cadence.

[↑ Back to top](#table-of-contents)

---

## WordPress / VNewsOS Integration

### How Metadata.txt drives episode import

During Phase 1 (script generation), the Worker calls `generateEpisodeCopy` to produce three title options, a show description, SEO title, SEO description, and content tags. These are combined with structural metadata (episode number, season, runtime, word count, CDN audio URLs) and assembled into `Metadata.txt`, which is written to R2 before the approval gate.

`Metadata.txt` contains every field required by the VNewsOS Auto-Episode CPT importer:

- Three title options (`Title 1`, `Title 2`, `Title 3`)
- `Episode Number` (day-of-year integer)
- `Season` (4-digit year)
- `Show Title`, `Host Name`, `Publisher`, `Copyright Holder`, `Genre`
- `Estimated Runtime (minutes)`, `Word Count`
- `Description` (short, for show notes)
- `SEO Title`, `SEO Description`
- `Tags` (comma-separated)
- `Audio CDN URL` (new: `cdn.fold42.com/podcasts/morning-cup`)
- `Direct Audio URL` (legacy: `cdn.vicinitynews.com/podcasts/morning-cup`, migration fallback)
- `WordPress Podcast ID` (`2616` — the parent `vicinity_podcast` post)
- `WordPress Categories` (comma-separated category names)

### When does WordPress pull in the approval?

After `status = approved` (when the gate is on) or `status = completed` (when the gate is off), WordPress can poll `/status` or be triggered by a webhook to initiate the import.

### Auto-Episode Import Flow

1. Worker reaches `completed` status.
2. `morning-cup.sh make` downloads the TTS chunks and `Metadata.txt` locally.
3. The VNewsOS CPT importer reads `Metadata.txt` and maps fields to WordPress custom post meta.
4. The `vicinity_podcast` post (ID `2616`) is the parent; the new episode post is created as a child.
5. Both CDN URLs are written: `_vicinity_audio_url` (new CDN — wins when live) and `_vnews_ep_audio_url` (legacy CDN — stays as fallback during migration). VNewsOS resolves audio in order: `_vicinity_audio_url` → `_vnews_ep_audio_url`.
6. The episode post is created as a **draft** and is not publishable until approval is confirmed.

### Approval validation before publish

When `ENABLE_APPROVAL_GATE=true`, VNewsOS should verify the run record contains an `approved_at` timestamp before allowing the episode draft to move to published. Check via:

```
GET https://themorningcupgenerator.itsmiarosemathews.workers.dev/status?date=2026-05-24
Authorization: Bearer <RUN_SECRET>
```

If `record.approved_at` is present and `record.status` is `completed`, the episode may be published.

### CDN URL configuration

Both CDN base URLs are configured in `wrangler.toml`:

```toml
# New CDN (set this when cdn.fold42.com is ready):
AUDIO_CDN_BASE_URL = "https://cdn.fold42.com/podcasts/morning-cup"

# Legacy CDN (keep until migration is complete):
AUDIO_CDN_BASE_URL_LEGACY = "https://cdn.vicinitynews.com/podcasts/morning-cup"
```

Final audio file name pattern: `The Morning Cup - YYYY-MM-DD.mp3`

### R2 key prefix

All files for a given date live under:

```
Generators/Podcasts/TheMorningCup/{YYYY-MM-DD}/
```

This prefix is set by `R2_KEY_PREFIX` in `wrangler.toml` and must not be changed once the show is in production — WordPress and CDN configurations depend on it.

[↑ Back to top](#table-of-contents)

---

## All Generated Files

The following files are created by the system for each episode. R2 paths are relative to the `vicinity` bucket root.

| File | Location | Description |
|------|----------|-------------|
| `The Morning Cup - YYYY-MM-DD.txt` | R2 `.../{date}/` | Clean script text — pacing tags and inline annotations stripped; suitable for printing or plain-text reading |
| `The Morning Cup - YYYY-MM-DD.html` | R2 `.../{date}/` | HTML-formatted script with paragraph structure and metadata header |
| `The Morning Cup - YYYY-MM-DD.json` | R2 `.../{date}/` | Full episode JSON: `elevenlabs_script`, `chapters`, `social_copy`, `source_notes`, `self_validation`, runtime estimate |
| `The Morning Cup - YYYY-MM-DD - Metadata.txt` | R2 `.../{date}/` | WordPress CPT import fields — all fields needed for VNewsOS Auto-Episode import |
| `The Morning Cup - YYYY-MM-DD - manifest.json` | R2 `.../{date}/` | Chunk metadata for ffmpeg assembly: chunk list with R2 keys, chapter list, word count, runtime, publisher info |
| `The Morning Cup - YYYY-MM-DD - files.txt` | R2 `.../{date}/` | ffmpeg concat demuxer list — used by `build-episode.sh` to assemble the final MP3 |
| `The Morning Cup - YYYY-MM-DD - Serialized Script-{serial}-{YYYYMMDD}.html` | R2 `.../{date}/` | Editorial review document: full script with inline citations, 3-pass fact-check, pronunciation flags, works cited, approval block |
| `The Morning Cup - YYYY-MM-DD - Sidecar.json` | R2 `.../{date}/` | Audit trail: generation metadata, all three fact-check pass results, timing breakdown, full validation report |
| `The Morning Cup - YYYY-MM-DD - Pronunciation-Flags.txt` | R2 `.../{date}/` | Proper nouns and unusual terms flagged by the pronunciation scanner |
| `The Morning Cup - YYYY-MM-DD - {NNN}.mp3` | R2 `.../{date}/chunks/` | Individual TTS audio chunk (001, 002, ...) synthesized by ElevenLabs |
| `run.json` | R2 `.../{date}/` | Pipeline status record — all stage timestamps, R2 file keys, approver info, word count, chunk count |
| `The Morning Cup - YYYY-MM-DD.mp3` | Local `Episodes/` | Final assembled MP3 — TTS chunks + music + SFX, ID3-tagged, chapter-marked |
| `The Morning Cup - YYYY-MM-DD.aup3` | Local `Episodes/` | Multi-track Audacity project: color-coded tracks, chapter labels, all source audio |
| `The Morning Cup - YYYY-MM-DD.vtt` | Local `Episodes/` | WebVTT transcript generated by OpenAI Whisper |

[↑ Back to top](#table-of-contents)

---

## Worker Configuration Reference

All variables below are set in the `[vars]` section of `wrangler.toml`. Secrets (marked below) are set via `wrangler secret put` and are never stored in `wrangler.toml` or in any file tracked by git.

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `OPENAI_MODEL` | var | `gpt-5.5` | OpenAI model for script generation, fact-checking, and repair passes |
| `ELEVENLABS_MODEL_ID` | var | `eleven_multilingual_v2` | ElevenLabs TTS model ID |
| `ELEVENLABS_OUTPUT_FORMAT` | var | `mp3_44100_128` | ElevenLabs audio output format (44.1 kHz, 128 kbps MP3) |
| `WORKER_TIMEZONE` | var | `America/New_York` | Timezone used for episode date calculation and cron hour check |
| `MIN_SCRIPT_WORDS` | var | `2175` | Hard floor: scripts below this word count fail validation (~15 min at 145 wpm) |
| `TARGET_SCRIPT_WORDS_MIN` | var | `2610` | Sweet-spot lower bound; scripts below this receive a warning (~18 min) |
| `TARGET_SCRIPT_WORDS_MAX` | var | `2900` | Sweet-spot upper bound; scripts above this receive a warning (~20 min) |
| `MAX_SCRIPT_WORDS` | var | `4350` | Hard ceiling: scripts above this word count fail validation |
| `WORDS_PER_MINUTE` | var | `145` | Speaking rate used to calculate estimated episode runtime |
| `MAX_TTS_CHARS_PER_CHUNK` | var | `5000` | Maximum characters per ElevenLabs TTS request |
| `ENABLE_SOURCE_DIGEST` | var | `true` | Fetch RSS and API news feeds and inject a source digest into the prompt |
| `ENABLE_REPAIR_PASS` | var | `true` | Attempt a second OpenAI call if the first generated script fails validation |
| `ENABLE_APPROVAL_GATE` | var | `false` | Pause before TTS and wait for editorial approval via `POST /approve` |
| `STRIP_PACING_TAGS_FOR_TTS` | var | `true` | Remove `[TEN-SECOND SECTION SPACER]` and pacing tags before sending to ElevenLabs |
| `STATUS_PUBLIC` | var | `false` | If `true`, the `/status` endpoint does not require a Bearer token |
| `R2_PUBLIC_BASE_URL` | var | _(empty)_ | Optional public base URL for R2 objects (custom domain or r2.dev bucket URL) |
| `PUBLISHER` | var | `Fold 42` | Publisher name written to ID3 tags and Metadata.txt |
| `COPYRIGHT_HOLDER` | var | `Fold 42` | Copyright holder written to ID3 tags and manifest |
| `PODCAST_GENRE` | var | `News` | Genre tag written to ID3 tags and manifest |
| `HOST_NAME` | var | `Penelope Rose` | Host name injected into the prompt and validated in the generated script |
| `SHOW_TITLE` | var | `The Morning Cup` | Show title used in file names, prompts, and ID3 tags |
| `R2_KEY_PREFIX` | var | `Generators/Podcasts/TheMorningCup` | R2 storage path prefix for all episode files |
| `WORDPRESS_PODCAST_ID` | var | `2616` | WP post ID of the parent `vicinity_podcast` post for Auto-Episode import |
| `AUDIO_CDN_BASE_URL` | var | `https://cdn.fold42.com/podcasts/morning-cup` | New CDN base URL for the final MP3 — written to `_vicinity_audio_url` |
| `AUDIO_CDN_BASE_URL_LEGACY` | var | `https://cdn.vicinitynews.com/podcasts/morning-cup` | Legacy CDN base URL — written to `_vnews_ep_audio_url` as a migration fallback |
| `WORDPRESS_CATEGORIES` | var | `News, The Morning Cup` | Comma-separated default WP category names assigned to new episode posts |
| `VOICE_STABILITY` | var | `0.28` | ElevenLabs stability (0–1; lower = more expressive and variable) |
| `VOICE_SIMILARITY_BOOST` | var | `0.85` | ElevenLabs similarity boost (0–1; higher = closer to the trained voice identity) |
| `VOICE_STYLE` | var | `0.45` | ElevenLabs style exaggeration (0–1) |
| `VOICE_USE_SPEAKER_BOOST` | var | `true` | ElevenLabs speaker boost — improves voice clarity at a small latency cost |
| `OPENAI_API_KEY` | **secret** | — | OpenAI API key. Set via `wrangler secret put OPENAI_API_KEY` |
| `ELEVENLABS_API_KEY` | **secret** | — | ElevenLabs API key. Set via `wrangler secret put ELEVENLABS_API_KEY` |
| `ELEVENLABS_VOICE_ID` | **secret** | — | ElevenLabs custom voice ID. Set via `wrangler secret put ELEVENLABS_VOICE_ID` |
| `RUN_SECRET` | **secret** | — | Bearer token for all authenticated endpoints. Set via `wrangler secret put RUN_SECRET` |

### Optional source provider variables

Set in `wrangler.toml` vars or in `.env` for local development:

| Variable | Description |
|----------|-------------|
| `NEWS_RSS_FEEDS` | Comma-separated RSS feed URLs to include in the source digest |
| `NEWSAPI_KEY` | API key for NewsAPI.org (https://newsapi.org) |
| `NEWSAPI_ENDPOINT` | NewsAPI endpoint URL (default: `https://newsapi.org/v2/top-headlines`) |
| `TOMORROW_IO_API_KEY` | API key for tomorrow.io real-time weather data |

[↑ Back to top](#table-of-contents)

---

## Sync & Update

### Pull the latest code and redeploy

```bash
cd ~/Documents/"The Morning Cup"/Generator
git pull origin claude/brave-gates-wbCkD
npm install
npx wrangler deploy
```

`npm install` is required after any pull that modifies `package.json` or `package-lock.json`. `npx wrangler deploy` is required to push Worker code changes to production.

### Auto-sync at terminal startup

`scripts/sync.sh` checks for upstream changes and pulls automatically. To enable it at every terminal session, add the following to your shell profile (`~/.zshrc`, `~/.bashrc`, etc.):

```bash
# Auto-sync The Morning Cup Generator
[ -f "$HOME/Documents/The Morning Cup/Generator/scripts/sync.sh" ] && \
  bash "$HOME/Documents/The Morning Cup/Generator/scripts/sync.sh" --quiet
```

### TypeScript type checking

Before deploying, confirm there are no TypeScript errors:

```bash
cd ~/Documents/"The Morning Cup"/Generator
npm run typecheck
```

This runs `tsc --noEmit` and reports any type errors without producing output files. Fix all errors before deploying.

[↑ Back to top](#table-of-contents)

---

## Desktop Applet

The desktop applet provides a point-and-click interface for running pipeline commands without opening a terminal manually.

### Installing the applet

```bash
cd ~/Documents/"The Morning Cup"/Generator
./scripts/install.sh --applet
```

This creates a "The Morning Cup" desktop shortcut appropriate for your OS — an `.app` bundle on macOS, a `.desktop` launcher on Linux.

### Using the applet

1. Double-click the "The Morning Cup" icon on your desktop.
2. A terminal window opens with a command panel alongside it.
3. The command panel lists all available `morning-cup.sh` subcommands as clickable buttons.
4. Click a command to run it in the terminal.
5. The terminal preference (Terminal.app, iTerm2, GNOME Terminal, Konsole, etc.) is detected automatically on first run and remembered for future launches.

### Running the command panel directly

```bash
python3 ~/Documents/"The Morning Cup"/Generator/scripts/applet.py
```

Full TUI implementation is in `scripts/applet.py`.

[↑ Back to top](#table-of-contents)

---

## Security & Access Control

### Who can do what

| Role | Access |
|------|--------|
| `@pennydoesdev` (infrastructure) | Merge to any branch; modify any file; rotate Cloudflare secrets; delete KV run records |
| Fold 42 developers | Open PRs against `main`; cannot merge without infrastructure approval |
| Show producers / prompt engineers | Open PRs for `src/prompt.ts` and `src/validator.ts` only |
| External contractors | PRs on scoped feature branches only; no access to secrets or production Worker |

### Branch protection

All merges to `main` require approval from `@pennydoesdev`. Force-pushes and branch deletions are disabled. Full rules are in `CONTRIBUTING.md`. The `.github/CODEOWNERS` file enforces reviewer requirements for every file in the repository.

### Secrets

- Secrets are **never** stored in `wrangler.toml`, in any git commit, in PR descriptions, in issues, or in any public message.
- Production secrets live exclusively in Cloudflare Worker Secrets, set via `wrangler secret put`.
- Local secrets live in `~/Documents/The Morning Cup/.env`. This file is in `.gitignore` and must never be staged or committed.
- `.dev.vars` (Wrangler's local dev secrets file) is also in `.gitignore`.
- `RUN_SECRET` is the Bearer token required for all `/run`, `/approve`, `/reject`, and (when `STATUS_PUBLIC=false`) `/status` endpoint calls. Treat it as a password.

### Files locked to infrastructure only

The following `src/` files require `@pennydoesdev` review and may not be modified by show creators or external contractors: `chunker.ts`, `elevenlabs.ts`, `tts.ts`, `index.ts`, `openai.ts`, `config.ts`, `types.ts`, `r2.ts`, `locks.ts`, `description.ts`, `manifest.ts`, `factcheck.ts`, `repair.ts`, `serializedScript.ts`, `sidecar.ts`, `sourceDigest.ts`, `topics.ts`, `pronunciationScanner.ts`, `schema.ts`, `html.ts`, `logger.ts`, and all files in `src/utils/`.

### Settings that must never change in forks

- `[[r2_buckets]]` binding: always `MORNING_CUP_BUCKET` pointing to bucket `vicinity`
- `PUBLISHER` and `COPYRIGHT_HOLDER`: always `Fold 42`
- AI disclosure blocks in `src/description.ts`

### Reporting security issues

Do not open a GitHub issue for security vulnerabilities. Contact Fold 42 infrastructure directly and privately. Do not include API keys, voice IDs, or secrets of any kind in issues, PR bodies, commit messages, or any public channel.

[↑ Back to top](#table-of-contents)

---

## Troubleshooting

### 1. Validation fails — word count too low

**Symptom:** Run status is `failed`; error contains `Word count ... is below minimum`.

**Fix:** Re-run with `--force`. If it fails repeatedly, check whether `ENABLE_SOURCE_DIGEST=true` is working — if RSS feeds are unreachable, the model may write a shorter script due to thin source material. Try adding more RSS feeds to `NEWS_RSS_FEEDS` in `wrangler.toml`, or set `ENABLE_SOURCE_DIGEST=false` temporarily to rule out a feed issue.

### 2. ElevenLabs 429 Too Many Requests

**Symptom:** Run fails during the `tts` stage with a 429 error in the Worker logs.

**Fix:** Wait 5–10 minutes and re-run with `--force`. Check your ElevenLabs dashboard for concurrent request limits and remaining character quota. The pipeline uses 4 concurrent TTS requests; if your plan has lower limits, contact Fold 42 infrastructure to discuss reducing `TTS_CONCURRENCY` in `src/tts.ts`.

### 3. Worker timeout — chunks are partial

**Symptom:** Run fails mid-TTS; some chunks exist in R2 but the run record shows `failed`.

**Fix:** Re-run with `--force`. The Worker re-generates the script and re-synthesizes all chunks from scratch. Orphaned partial chunks in R2 can be cleaned up manually if needed.

### 4. `npm install` fails

**Symptom:** Errors such as `Cannot read properties of null` or `ERESOLVE unable to resolve dependency tree`.

**Fix:**
```bash
cd ~/Documents/"The Morning Cup"/Generator
rm -rf node_modules package-lock.json
npm install
```

### 5. Wrangler not authenticated

**Symptom:** `wrangler deploy` fails with `You must be logged in` or `Authentication error`.

**Fix:**
```bash
wrangler login
# Headless environments:
wrangler login --no-browser
```

### 6. ffmpeg not found

**Symptom:** `build-episode.sh` exits with `Error: ffmpeg not found.`

**Fix:** Install ffmpeg for your OS (see [Required Software](#required-software)):

- macOS: `brew install ffmpeg`
- Ubuntu / Debian / Pi / Chrome OS: `sudo apt install ffmpeg`
- CentOS / RHEL: `sudo dnf install epel-release && sudo dnf install ffmpeg`

Then run `./scripts/morning-cup.sh preflight` to confirm the install is detected.

### 7. Required sounds missing from preflight

**Symptom:** Preflight fails with `sound missing: .../Sounds/Hello.mp3` (or similar).

**Fix:** Add the required audio assets to `~/Documents/The Morning Cup/Sounds/`. The four required files are `Hello.mp3`, `Goodbye.mp3`, `Coffee Pour.wav`, and `Topic Transition.mp3`. Contact Fold 42 production for the official show asset set.

### 8. RUN_SECRET not set

**Symptom:** Scripts exit with `RUN_SECRET not set.` or the Worker returns `401 Unauthorized`.

**Fix:** Add `RUN_SECRET=your-secret-here` to `~/Documents/The Morning Cup/.env`. The value must match the secret configured in Cloudflare via `wrangler secret put RUN_SECRET`.

### 9. Approval gate: stuck at `awaiting_approval`

**Symptom:** `make` is polling but the status never advances past `awaiting_approval`.

**Fix:** Review the Serialized Script (the R2 key is printed in the terminal when the status first reaches `awaiting_approval`), then approve or reject:

```bash
# Approve and start TTS
./scripts/morning-cup.sh approve 2026-05-24

# Or reject and regenerate
./scripts/morning-cup.sh reject 2026-05-24 "reason here"
./scripts/morning-cup.sh make --force 2026-05-24
```

### 10. TypeScript errors

**Symptom:** `wrangler deploy` fails with type errors, or the Worker behaves unexpectedly after a code change.

**Fix:**
```bash
cd ~/Documents/"The Morning Cup"/Generator
npx tsc --noEmit
```

This prints all type errors with file names and line numbers. Fix each error before deploying.

[↑ Back to top](#table-of-contents)

---

## Documentation Index

All extended documentation lives in the `docs/` folder. This README is the single source of truth for setup and daily operation. The documents below cover advanced topics.

| Document | Description |
|----------|-------------|
| `docs/QUICKSTART.md` | Abbreviated first-time setup for experienced users — copy-paste blocks, zero to first episode |
| `docs/SETUP.md` | Extended setup walkthrough with verification steps |
| `docs/WALKTHROUGH.md` | Complete first-time setup narrative with a worked end-to-end episode example |
| `docs/PIPELINE.md` | Architecture diagrams (Mermaid), component breakdown, and planned features |
| `docs/DAILY-WORKFLOW.md` | Day-to-day production guide with edge cases and recovery steps |
| `docs/PRODUCTION-WORKFLOW.md` | Full production checklist: pre-air, air, and post-air procedures |
| `docs/BEST-PRACTICES.md` | Prompt engineering guidance, voice settings tuning, and editorial best practices |
| `docs/TUNING.md` | Detailed guide to adjusting voice settings, word count targets, section weights, and source feeds |
| `docs/PUBLISHING.md` | WordPress / VNewsOS integration guide and CDN publishing configuration |
| `docs/EDITING.md` | Post-production editing guide: Audacity track layout, chapter markers, loudness normalization |
| `docs/CHAPTERS.md` | How chapter markers are generated, embedded in the MP3, and displayed in podcast apps |
| `docs/TRANSCRIPTS.md` | Whisper transcript generation, `.vtt` format, and transcript upload |
| `docs/PROMPTS.md` | Guide to reading and modifying `src/prompt.ts` — structure, constraints, and source rules |
| `docs/COMPLIANCE.md` | Legal requirements, AI disclosure obligations, and compliance audit trail documentation |
| `docs/AUDIT.md` | Audit log format, `Sidecar.json` schema, and fact-check methodology |
| `docs/APPLE-SHORTCUTS.md` | Run the pipeline from the macOS menu bar, Spotlight, and Shortcuts.app |
| `docs/TEAM-SHARING.md` | Onboarding additional team members; `scripts/team-setup.sh` walkthrough and offboarding |
| `docs/SHOW-PLANNER.md` | Planning new sections, seasonal content, and the episode calendar |
| `docs/NEW-SHOW.md` | Complete guide to launching a new Fold 42 podcast using this system as a template |
| `docs/TROUBLESHOOTING.md` | Extended troubleshooting reference: error codes, log inspection, and recovery procedures |
| `docs/CHANGELOG.md` | Version history — significant changes listed reverse-chronologically |
| `CONTRIBUTING.md` | Branch protection rules, PR process, CODEOWNERS policy, and access control |

[↑ Back to top](#table-of-contents)

---

## License / Credits

**The Morning Cup Episode Generator** is internal infrastructure created and maintained by **Fold 42**.

**Created by:** Penelope Rose — show creator, host, and lead engineer
**Infrastructure:** Fold 42 engineering team
**Repository:** https://github.com/pennydoesdev/TheMorningCup-Episode-Generator

This software is **not open source**. It is proprietary Fold 42 infrastructure. Access is restricted to authorized Fold 42 staff, contractors, and licensed partners. See `CONTRIBUTING.md` for access and contribution policies.

**Powered by:**

- [OpenAI](https://openai.com) — gpt-5.5 Responses API with `web_search` for script generation and fact-checking; Whisper API for transcription
- [ElevenLabs](https://elevenlabs.io) — custom voice text-to-speech synthesis
- [Cloudflare Workers](https://workers.cloudflare.com) — serverless Worker runtime, R2 object storage, KV namespace
- [ffmpeg](https://ffmpeg.org) — audio assembly, ID3 tagging, and chapter marker embedding

Copyright (c) 2026 Fold 42. All rights reserved.

[↑ Back to top](#table-of-contents)
