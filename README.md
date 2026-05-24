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
- [First-Time Setup](#first-time-setup)
  - [macOS](#macos)
  - [Windows (WSL2)](#windows-wsl2)
  - [Ubuntu / Debian](#ubuntu--debian)
  - [CentOS / RHEL](#centos--rhel)
  - [Raspberry Pi](#raspberry-pi)
  - [Chrome OS (Crostini)](#chrome-os-crostini)
  - [All Platforms — Clone & Configure](#all-platforms--clone--configure)
- [Audacity Setup](#audacity-setup)
- [Folder Structure](#folder-structure)
- [Environment File (.env)](#environment-file-env)
- [Deploy the Worker](#deploy-the-worker)
- [Daily Workflow](#daily-workflow)
- [Approval Workflow](#approval-workflow)
- [WordPress / VNewsOS Integration](#wordpress--vnewsos-integration)
- [All Generated Files](#all-generated-files)
- [Worker Configuration Reference](#worker-configuration-reference)
- [Sync & Update](#sync--update)
- [Desktop Applet](#desktop-applet)
- [Security & Access Control](#security--access-control)
- [Troubleshooting](#troubleshooting)
- [Documentation Index](#documentation-index)

---

## What Is This?

The Morning Cup is a **fully automated daily news podcast** system. Every morning at 5:00 AM Eastern Time, a Cloudflare Worker:

1. Pulls today's news from RSS feeds and the News API into a source digest
2. Calls OpenAI **gpt-5.5** via the Responses API (with live web search) to write a ~20-minute episode script
3. Validates structure, word count, and runtime — runs a repair pass if needed
4. Fact-checks every claim with 3 independent verification passes (2/3 majority required)
5. Generates a Serialized Script HTML review document with inline citations
6. Pauses at `awaiting_approval` if the editorial gate is on, or continues to TTS if it's off
7. Synthesizes the script into MP3 chunks via **ElevenLabs** (4 chunks in parallel)
8. Stores everything in **Cloudflare R2** — chunks, manifest, script files, and metadata

Your local machine then assembles the final MP3 using `ffmpeg`, adds ID3 chapter markers, generates a Whisper transcript, and builds a multi-track **Audacity** project. The WordPress / VNewsOS integration creates a podcast episode draft automatically from the `Metadata.txt` file.

**Total daily human time: ~30 seconds.**

[↑ Back to top](#table-of-contents)

---

## How an Episode Is Created

```
5 AM ET — Cloudflare Worker wakes
  │
  ├─ 1. Build source digest (RSS feeds / News API)
  ├─ 2. Generate script via OpenAI gpt-5.5 + web_search (~2,700 words)
  ├─ 3. Validate (word count, spacer count, runtime, structure)
  ├─ 4. Repair pass if validation failed (gpt-5-mini)
  ├─ 5. Fact-check: 3 independent passes, 2/3 majority vote
  ├─ 6. Pronunciation scan (flags unknown proper nouns to R2)
  ├─ 7. Build Sidecar JSON (audit trail) + Serialized Script HTML (review doc)
  ├─ 8. Write TXT / HTML / JSON / Metadata.txt → R2
  │
  ├─ [ENABLE_APPROVAL_GATE=true]  → Status: awaiting_approval
  │      ↓ WordPress or CLI calls POST /approve
  │
  ├─ 9. ElevenLabs TTS — 4 chunks synthesized in parallel
  ├─ 10. Build manifest.json + files.txt → R2
  └─ Status: completed
       │
       ▼
  morning-cup.sh make (your local machine)
  ├─ Downloads all chunks from R2
  ├─ Assembles final MP3 (ffmpeg: concat + loudnorm + ID3 + chapters)
  ├─ Generates Whisper .vtt transcript (if OPENAI_API_KEY in .env)
  └─ Builds multi-track Audacity .aup3 project (if numpy installed)
       │
       ▼
  WordPress / VNewsOS
  ├─ Reads Metadata.txt from R2
  ├─ Creates draft vicinity_podcast episode (CPT import)
  ├─ Populates audio URL, title, description, tags, categories
  └─ Draft publishable only after editorial confirmation
```

[↑ Back to top](#table-of-contents)

---

## Required Software

Install everything in this table before setup. Click the links for official downloads.

| Tool | Version | Used For | Download |
|------|---------|----------|----------|
| **Node.js** | 20+ | Wrangler CLI, `npm install` | [nodejs.org](https://nodejs.org) |
| **Wrangler** | 4.x | Cloudflare CLI (deploy, secrets, R2) | `npm install -g wrangler` |
| **ffmpeg** | 6+ | Audio assembly, loudness normalization | [ffmpeg.org/download.html](https://ffmpeg.org/download.html) |
| **Python** | 3.9+ | Local pipeline scripts | [python.org/downloads](https://www.python.org/downloads/) |
| **Git** | 2.x | Code updates | [git-scm.com](https://git-scm.com) |
| **Audacity** | 3.x | Multi-track editing (.aup3 projects) | [audacityteam.org/download](https://www.audacityteam.org/download/) |

**Required Python packages:**
```bash
pip3 install mutagen requests
pip3 install numpy          # for Audacity multi-track project builder
```

**Optional Python packages (for Google Drive + S3 publishing):**
```bash
pip3 install cryptography boto3
```

> **Audacity FFmpeg Library** — Required to export audio from Audacity projects.
> Download from: [support.audacityteam.org/basics/installing-ffmpeg](https://support.audacityteam.org/basics/installing-ffmpeg)

[↑ Back to top](#table-of-contents)

---

## Required Accounts

| Service | What It Provides | Sign Up |
|---------|-----------------|---------|
| **Cloudflare** | Worker hosting, R2 storage, KV database | [cloudflare.com](https://cloudflare.com) |
| **OpenAI** | Script generation (gpt-5.5), fact-checking, metadata | [platform.openai.com](https://platform.openai.com) |
| **ElevenLabs** | Text-to-speech synthesis (your custom voice) | [elevenlabs.io](https://elevenlabs.io) |

[↑ Back to top](#table-of-contents)

---

## First-Time Setup

> The local folder must be named exactly **`The Morning Cup`** — Title Case with spaces, no leading or trailing spaces.
> - macOS / Linux: `~/Documents/The Morning Cup/`
> - Windows: `%USERPROFILE%\Documents\The Morning Cup\`

### macOS

```bash
# 1. Install Homebrew (if not already installed)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# 2. Install tools
brew install node ffmpeg git

# 3. Install Python packages
pip3 install --user --break-system-packages mutagen requests numpy

# 4. Install Wrangler
npm install -g wrangler

# Verify
ffmpeg -version && node --version && python3 -c "import mutagen, requests; print('OK')"
```

[↑ Back to top](#table-of-contents)

---

### Windows (WSL2)

Windows users must use **WSL2** (Windows Subsystem for Linux). PowerShell alone is not supported.

```powershell
# Run in PowerShell as Administrator
wsl --install -d Ubuntu
# Restart your computer, then open "Ubuntu" from Start Menu
# Follow the Ubuntu/Debian instructions below inside WSL
```

> **Why WSL2?** The pipeline uses bash scripts, Python, and ffmpeg — all of which
> work natively in WSL2. Windows paths are accessible at `/mnt/c/Users/YourName/`.
> Your Documents folder: `/mnt/c/Users/YourName/Documents/`

Inside WSL Ubuntu, follow the [Ubuntu / Debian](#ubuntu--debian) steps.

For the folder path in WSL, use:
```bash
# Your Windows Documents folder in WSL
export DOCS="/mnt/c/Users/$(cmd.exe /c "echo %USERNAME%" 2>/dev/null | tr -d '\r')/Documents"
mkdir -p "$DOCS/The Morning Cup"
```

Or simply use the WSL home directory:
```bash
mkdir -p "$HOME/Documents/The Morning Cup"
```

[↑ Back to top](#table-of-contents)

---

### Ubuntu / Debian

```bash
# Update package list
sudo apt update

# Install system packages
sudo apt install -y ffmpeg git python3 python3-pip curl build-essential

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install Python packages
pip3 install --user mutagen requests numpy

# Install Wrangler
npm install -g wrangler

# Verify
ffmpeg -version && node --version && python3 -c "import mutagen, requests; print('OK')"
```

[↑ Back to top](#table-of-contents)

---

### CentOS / RHEL

```bash
# Enable EPEL for ffmpeg
sudo dnf install -y epel-release
sudo dnf install -y git python3 python3-pip ffmpeg

# Install Node.js 20
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo dnf install -y nodejs

# Install Python packages
pip3 install --user mutagen requests numpy

# Install Wrangler
npm install -g wrangler

# Verify
ffmpeg -version && node --version && python3 -c "import mutagen, requests; print('OK')"
```

[↑ Back to top](#table-of-contents)

---

### Raspberry Pi

Tested on Raspberry Pi OS (Bookworm / Bullseye, 64-bit recommended).

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install tools
sudo apt install -y ffmpeg git python3 python3-pip

# Install Node.js 20 (ARM build)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install Python packages
pip3 install --user mutagen requests numpy

# Install Wrangler
sudo npm install -g wrangler

# Note: wrangler deploy from Pi is slow but works.
# Consider deploying from a faster machine and using Pi only for local assembly.

# Verify
ffmpeg -version && node --version
```

[↑ Back to top](#table-of-contents)

---

### Chrome OS (Crostini)

Enable Linux in Chrome OS: **Settings → Advanced → Developers → Linux development environment → Turn on**

Then in the Linux terminal:
```bash
sudo apt update
sudo apt install -y ffmpeg git python3 python3-pip nodejs npm
pip3 install --user mutagen requests numpy
sudo npm install -g wrangler

# Verify
ffmpeg -version && node --version && python3 -c "import mutagen, requests; print('OK')"
```

[↑ Back to top](#table-of-contents)

---

### All Platforms — Clone & Configure

After installing the tools above, run these steps on every platform:

```bash
# 1. Create the base folder (exact name required)
mkdir -p "$HOME/Documents/The Morning Cup"
cd "$HOME/Documents/The Morning Cup"

# 2. Clone the repository
git clone https://github.com/pennydoesdev/TheMorningCup-Episode-Generator.git Generator
cd Generator

# 3. Install Node dependencies
npm install

# 4. Authenticate with Cloudflare
npx wrangler login

# 5. Set Worker Secrets (you will be prompted for each value)
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put ELEVENLABS_API_KEY
npx wrangler secret put ELEVENLABS_VOICE_ID
npx wrangler secret put RUN_SECRET

# 6. Deploy the Worker
npx wrangler deploy

# 7. Create your local .env file
cp .env.example "$HOME/Documents/The Morning Cup/.env"
# Edit the .env file and fill in WORKER_URL and RUN_SECRET

# 8. Run preflight check
./scripts/morning-cup.sh preflight

# 9. Generate your first episode
./scripts/morning-cup.sh make
```

[↑ Back to top](#table-of-contents)

---

## Audacity Setup

Audacity is used for multi-track editing of episodes. The pipeline builds a ready-to-edit `.aup3` project automatically.

**Step 1 — Download Audacity 3.x**
→ [audacityteam.org/download](https://www.audacityteam.org/download/)

> ⚠️ **Audacity 2.x is NOT compatible** with the `.aup3` format. You must use Audacity 3.x.

**Step 2 — Install the FFmpeg Library for Audacity**
This is required to export audio from Audacity in MP3/AAC format.
→ [support.audacityteam.org/basics/installing-ffmpeg](https://support.audacityteam.org/basics/installing-ffmpeg)

- macOS: Download `ffmpeg-mac-3.0.2.pkg` and run it
- Windows: Download `ffmpeg-win-3.0.2.exe` and run it  
- Linux: `sudo apt install libavcodec-dev` (Ubuntu/Debian)

**Step 3 — Verify**
Open Audacity → Edit → Preferences → Libraries. You should see "FFmpeg Library Version: F(55.33.100)..." or similar.

**Step 4 — Generate your first Audacity project**
```bash
./scripts/morning-cup.sh audacity 2026-05-24
```

Opens `~/Documents/The Morning Cup/Episodes/The Morning Cup - 2026-05-24.aup3` with:
- 🟢 **GREEN** — Intro / Outro music
- 🟠 **ORANGE** — Coffee Pour, Stings, Transition sounds
- 🔵 **BLUE** — TTS content chunks (one track per section)
- 🟡 **YELLOW** — Background music (mixed at 10% volume)
- 🏷️ **Labels** — Chapter markers at exact timestamps

[↑ Back to top](#table-of-contents)

---

## Folder Structure

Your local machine needs this layout. The installer creates it automatically:

```
~/Documents/The Morning Cup/          ← base folder (EXACT name required)
│
├── .env                              ← your secrets (NEVER committed to git)
│
├── Generator/                        ← this git repository
│   ├── scripts/                      ← morning-cup.sh and helpers
│   ├── src/                          ← Cloudflare Worker TypeScript
│   ├── wrangler.toml                 ← Worker configuration
│   └── package.json
│
├── Sounds/                           ← audio assets (required)
│   ├── Hello.mp3                     ← intro music (REQUIRED)
│   ├── Coffee Pour.wav               ← pour SFX at opening (REQUIRED)
│   ├── Topic Transition.mp3          ← section transition sting (REQUIRED)
│   ├── Goodbye.mp3                   ← outro music (REQUIRED)
│   ├── intro-sting.wav               ← "news begins" sting (optional)
│   ├── morning-cup-sting.wav         ← alternate sting (optional)
│   ├── Spark.mp3                     ← alternate sting (optional)
│   └── Podcast Background.mp3        ← background music at 10% (optional)
│
├── Chunks/                           ← auto-created; TTS chunks land here
│   └── YYYY-MM-DD/
│       ├── The Morning Cup - YYYY-MM-DD - 001.mp3
│       ├── The Morning Cup - YYYY-MM-DD - 002.mp3
│       └── ...
│
└── Episodes/                         ← final rendered episodes
    ├── The Morning Cup - YYYY-MM-DD.mp3
    ├── The Morning Cup - YYYY-MM-DD.aup3
    └── The Morning Cup - YYYY-MM-DD.vtt
```

[↑ Back to top](#table-of-contents)

---

## Environment File (.env)

Create this file at `~/Documents/The Morning Cup/.env` (never inside the `Generator/` folder):

```bash
# Worker URL — from your Cloudflare dashboard or wrangler deploy output
WORKER_URL=https://themorningcupgenerator.itsmiarosemathews.workers.dev

# RUN_SECRET — Bearer token for /run, /approve, /reject endpoints
# Set this BOTH here AND in Cloudflare via: npx wrangler secret put RUN_SECRET
RUN_SECRET=your-run-secret-here

# Optional: only needed if running local generation tools
# These are already set as Cloudflare Worker Secrets — you don't need
# them locally unless running scripts that call the APIs directly.
# OPENAI_API_KEY=sk-proj-...
# ELEVENLABS_API_KEY=...
# ELEVENLABS_VOICE_ID=...
```

> **Security:** `.env` is in `.gitignore` and must NEVER be committed.
> Team members only need `WORKER_URL` and `RUN_SECRET` in their `.env`.

[↑ Back to top](#table-of-contents)

---

## Deploy the Worker

```bash
cd ~/Documents/"The Morning Cup"/Generator

# First time
npx wrangler login
npx wrangler deploy

# After pulling code updates
git pull origin claude/brave-gates-wbCkD
npm install
npx wrangler deploy
```

**Set all secrets** (do this once; values persist in Cloudflare):
```bash
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put ELEVENLABS_API_KEY
npx wrangler secret put ELEVENLABS_VOICE_ID
npx wrangler secret put RUN_SECRET
```

**Verify secrets are set:**
```bash
npx wrangler secret list
```

[↑ Back to top](#table-of-contents)

---

## Daily Workflow

One command does everything:

```bash
cd ~/Documents/"The Morning Cup"/Generator
./scripts/morning-cup.sh make
```

**What it does:**
1. ✅ Preflight checks (tools, secrets, sound files)
2. 🚀 Triggers the Worker (`POST /run`)
3. 📊 Polls status every 20 seconds
4. ⬇️ Downloads chunks from R2 when complete
5. 🎙️ Assembles final MP3 (ffmpeg: concat + loudnorm −16 LUFS + ID3 + chapters)
6. 📝 Generates Whisper transcript (if `OPENAI_API_KEY` in `.env`)
7. 🎛️ Builds multi-track Audacity project (if `numpy` installed)

### All Subcommands

```bash
./scripts/morning-cup.sh preflight              # check all deps + assets
./scripts/morning-cup.sh make [YYYY-MM-DD]      # full pipeline
./scripts/morning-cup.sh make --force           # re-run even if already done
./scripts/morning-cup.sh approve [DATE]         # approve script, start TTS
./scripts/morning-cup.sh reject [DATE] [reason] # reject script for re-gen
./scripts/morning-cup.sh monitor [DATE]         # live dashboard
./scripts/morning-cup.sh status [DATE]          # one-shot JSON status
./scripts/morning-cup.sh fetch [DATE]           # download R2 chunks only
./scripts/morning-cup.sh build [DATE]           # assemble MP3 (chunks local)
./scripts/morning-cup.sh transcribe [DATE]      # Whisper .vtt transcript
./scripts/morning-cup.sh audacity [DATE]        # multi-track Audacity project
./scripts/morning-cup.sh latest                 # open most recent MP3
./scripts/morning-cup.sh open [DATE]            # open specific date's MP3
```

### Re-run from scratch

```bash
cd ~/Documents/"The Morning Cup"/Generator

# 1. Deploy latest code
npx wrangler deploy

# 2. Clear the KV run record for this date
npx wrangler kv key delete --remote \
  --binding MORNING_CUP_KV \
  "morning-cup/$(TZ=America/New_York date +%Y-%m-%d)/run.json"

# 3. Force re-generate
./scripts/morning-cup.sh make --force
```

[↑ Back to top](#table-of-contents)

---

## Approval Workflow

The editorial approval gate pauses the pipeline after script generation, before TTS.
This lets you review the Serialized Script (with inline citations and fact-check results)
before committing to audio synthesis.

**Enable the gate** in `wrangler.toml`:
```toml
ENABLE_APPROVAL_GATE = "true"
```

**When the gate is on:**

1. `./scripts/morning-cup.sh make` runs the script phase and shows:
   ```
   --- Editorial Review Required ---
   The script is ready and waiting for approval.

   Serialized Script (R2 key):
     Generators/Podcasts/TheMorningCup/2026-05-24/The Morning Cup - 2026-05-24 - Serialized Script-...html

   Download to review:
     npx wrangler r2 object get vicinity "..." --file review.html

   To approve and start TTS:
     ./scripts/morning-cup.sh approve 2026-05-24
   ```

2. **Review** the Serialized Script HTML (inline citations, fact-check, works cited, approval block)

3. **Approve** from CLI:
   ```bash
   ./scripts/morning-cup.sh approve 2026-05-24

   # With approver metadata (optional):
   APPROVER_NAME="Jane" APPROVER_SERIAL="WP-2026-001" \
     ./scripts/morning-cup.sh approve 2026-05-24
   ```

4. **Or approve from WordPress** — VNewsOS calls `POST /approve` via REST

5. **Reject** if the script needs regeneration:
   ```bash
   ./scripts/morning-cup.sh reject 2026-05-24 "Weather section has wrong city"
   # Then regenerate:
   ./scripts/morning-cup.sh make --force 2026-05-24
   ```

**With the gate off (default):** the pipeline runs straight through — no human step.

[↑ Back to top](#table-of-contents)

---

## WordPress / VNewsOS Integration

### When does WordPress get the episode?

After `status = completed`, the episode data is available in R2:

1. **Metadata.txt** is written to R2 during Phase 1 (before approval/TTS)
2. After TTS completes, `morning-cup.sh make` downloads everything locally
3. VNewsOS reads Metadata.txt and creates a draft `vicinity_podcast` episode

### Metadata.txt fields

The Metadata.txt file in R2 contains everything VNewsOS needs:

```
Show-Title: The Morning Cup
Episode-Date: 2026-05-24
Episode-Number: 144
Season: 2026
Title-1: [primary episode title]
Title-2: [alternate title]
Title-3: [alternate title]
Episode-Type: full
Explicit: no
Host: Penelope Rose
Publisher: Fold 42
Copyright: Fold 42
Word-Count: 2847
Estimated-Runtime-Minutes: 19.6
Description: [400-500 word post body]
SEO-Title: [SEO-optimized title]
SEO-Description: [meta description]
Tags: [comma-separated tags]
WP-Podcast-ID: 2616
Audio-URL: https://cdn.fold42.com/podcasts/morning-cup/2026-05-24.mp3
Direct-Audio: https://cdn.vicinitynews.com/podcasts/morning-cup/2026-05-24.mp3
Categories: News, The Morning Cup
```

### Audio CDN resolution

VNewsOS resolves audio in this order:
1. `_vicinity_audio_url` → `Audio-URL` (new CDN: cdn.fold42.com)
2. `_vnews_ep_audio_url` → `Direct-Audio` (legacy CDN: cdn.vicinitynews.com)

The legacy URL stays as fallback until cdn.fold42.com is fully live.

### Approval validation before WordPress publish

If `ENABLE_APPROVAL_GATE=true`, VNewsOS can verify the script was approved before
allowing the WordPress post to be published:

```
GET /status?date=YYYY-MM-DD
Authorization: Bearer {RUN_SECRET}

Response includes:
  record.status          — must be "completed"
  record.approved_at     — approval timestamp (populated only after /approve)
  record.approver_name   — who approved
  record.approver_serial — approval serial number
```

Only enable WordPress "Publish" when `approved_at` is populated.

### WordPress REST API calls (for VNewsOS developers)

```bash
# Approve from WordPress (triggers TTS)
POST /approve?date=YYYY-MM-DD
Authorization: Bearer {RUN_SECRET}
Content-Type: application/json
{"approver_name": "Jane Smith", "approver_serial": "WP-2026-001-A", "approval_notes": "LGTM"}

# Reject from WordPress
POST /reject?date=YYYY-MM-DD
Authorization: Bearer {RUN_SECRET}
Content-Type: application/json
{"reason": "Factual error in international section"}

# Check status
GET /status?date=YYYY-MM-DD
Authorization: Bearer {RUN_SECRET}
```

[↑ Back to top](#table-of-contents)

---

## All Generated Files

Every file the system creates, and where it lives:

| File | Location | Phase | Description |
|------|----------|-------|-------------|
| `The Morning Cup - YYYY-MM-DD.txt` | R2 | Script | Clean script text (no pacing tags) |
| `The Morning Cup - YYYY-MM-DD.html` | R2 | Script | HTML-formatted script |
| `The Morning Cup - YYYY-MM-DD.json` | R2 | Script | Full episode JSON (script + chapters + social copy + source notes) |
| `The Morning Cup - YYYY-MM-DD - Metadata.txt` | R2 | Script | WordPress CPT import fields + audio CDN URLs |
| `The Morning Cup - YYYY-MM-DD - Serialized Script-{serial}-{YYYYMMDD}.html` | R2 | Script | Editorial review doc: inline citations, fact-check, works cited, approval block |
| `The Morning Cup - YYYY-MM-DD - Sidecar.json` | R2 | Script | Audit trail: timing, fact-check results, source references |
| `The Morning Cup - YYYY-MM-DD - Pronunciation-Flags.json` | R2 | Script | Unknown proper nouns flagged for pronunciation review |
| `The Morning Cup - YYYY-MM-DD - manifest.json` | R2 | TTS | Chunk metadata for ID3 chapters and playback ordering |
| `The Morning Cup - YYYY-MM-DD - files.txt` | R2 | TTS | ffmpeg concat list |
| `The Morning Cup - YYYY-MM-DD - {NNN}.mp3` | R2 chunks/ | TTS | Individual ElevenLabs audio chunk |
| `run.json` | R2 | Both | Pipeline status record (all stage timestamps, approver info, R2 keys) |
| `The Morning Cup - YYYY-MM-DD.mp3` | Local Episodes/ | Local | Final assembled episode MP3 (−16 LUFS, chapters, ID3 tags) |
| `The Morning Cup - YYYY-MM-DD.aup3` | Local Episodes/ | Local | Multi-track Audacity project |
| `The Morning Cup - YYYY-MM-DD.vtt` | Local Episodes/ | Local | Whisper WebVTT transcript |

**R2 key prefix:** `Generators/Podcasts/TheMorningCup/{YYYY-MM-DD}/`

[↑ Back to top](#table-of-contents)

---

## Worker Configuration Reference

All in `wrangler.toml`. Secrets are set via `wrangler secret put`, never in this file.

| Variable | Default | Safe to Change | Description |
|---|---|---|---|
| `OPENAI_MODEL` | `gpt-5.5` | ⚠️ No (needs 500K TPM) | Script generation model |
| `ELEVENLABS_MODEL_ID` | `eleven_multilingual_v2` | ✅ Yes | TTS model |
| `ELEVENLABS_OUTPUT_FORMAT` | `mp3_44100_128` | ✅ Yes | Audio output format |
| `WORKER_TIMEZONE` | `America/New_York` | ✅ Yes | Cron reference timezone |
| `MIN_SCRIPT_WORDS` | `2175` | ⚠️ Careful | Hard floor — below this = fail |
| `TARGET_SCRIPT_WORDS_MIN` | `2610` | ✅ Yes | Target range lower bound |
| `TARGET_SCRIPT_WORDS_MAX` | `2900` | ✅ Yes | Target range upper bound |
| `MAX_SCRIPT_WORDS` | `4350` | ⚠️ Careful | Hard ceiling — above this = fail |
| `WORDS_PER_MINUTE` | `145` | ✅ Yes | Runtime estimation |
| `MAX_TTS_CHARS_PER_CHUNK` | `5000` | ✅ Yes | ElevenLabs chunk size limit |
| `ENABLE_SOURCE_DIGEST` | `true` | ✅ Yes | Use RSS/news for context |
| `ENABLE_REPAIR_PASS` | `true` | ✅ Yes | Auto-repair failed validation |
| `ENABLE_APPROVAL_GATE` | `false` | ✅ Yes | Pause before TTS for editorial review |
| `STRIP_PACING_TAGS_FOR_TTS` | `true` | ⛔ No | Strip [bracket] annotations before TTS |
| `STATUS_PUBLIC` | `false` | ✅ Yes | Make /status endpoint public |
| `HOST_NAME` | `Penelope Rose` | ✅ Yes | Host name used in script |
| `SHOW_TITLE` | `The Morning Cup` | ⛔ No | Used in all file names |
| `R2_KEY_PREFIX` | `Generators/Podcasts/TheMorningCup` | ⛔ No | R2 storage path |
| `VOICE_STABILITY` | `0.28` | ✅ Yes (0.1–0.9) | ElevenLabs: lower = more natural |
| `VOICE_SIMILARITY_BOOST` | `0.85` | ✅ Yes (0.5–1.0) | Voice identity lock |
| `VOICE_STYLE` | `0.45` | ✅ Yes (0.0–1.0) | Expressiveness |
| `VOICE_USE_SPEAKER_BOOST` | `true` | ✅ Yes | Clarity enhancement |
| `WORDPRESS_PODCAST_ID` | `2616` | ✅ Yes | VNewsOS parent podcast post ID |
| `AUDIO_CDN_BASE_URL` | `https://cdn.fold42.com/…` | ✅ Yes | New CDN (when live) |
| `AUDIO_CDN_BASE_URL_LEGACY` | `https://cdn.vicinitynews.com/…` | ✅ Yes | Legacy CDN |
| `WORDPRESS_CATEGORIES` | `News, The Morning Cup` | ✅ Yes | Default WP categories |

[↑ Back to top](#table-of-contents)

---

## Sync & Update

### Pull latest code and redeploy

```bash
cd ~/Documents/"The Morning Cup"/Generator
git pull origin claude/brave-gates-wbCkD
npm install
npx wrangler deploy
```

### Startup sync (automatic)

Add to your shell profile to auto-sync when opening a terminal:

```bash
# macOS / Linux — add to ~/.zshrc or ~/.bashrc:
echo 'cd ~/Documents/"The Morning Cup"/Generator && bash scripts/sync.sh && cd - > /dev/null' >> ~/.zshrc
source ~/.zshrc
```

The `sync.sh` script:
- Checks for git updates and pulls if available
- Runs `npm install` if `package.json` changed
- Prints: `[sync] ✓ Up to date` or `[sync] ↓ Pulled 3 commits — run: npx wrangler deploy`

[↑ Back to top](#table-of-contents)

---

## Desktop Applet

The desktop applet gives you a clickable command panel that opens directly in your terminal.

**Create the desktop shortcut:**
```bash
cd ~/Documents/"The Morning Cup"/Generator
bash scripts/create-desktop-shortcut.sh
```

**What it creates:**
- **macOS:** `~/Desktop/The Morning Cup.command` — double-click opens Terminal + applet
- **Linux:** `~/.local/share/applications/morning-cup.desktop` + `~/Desktop/` icon
- **Windows (WSL):** Instructions printed for creating a `.bat` shortcut on Windows Desktop

**What the applet does:**
- Shows all available commands in a left panel
- Navigate with arrow keys, press Enter to run, or type the number
- Remembers your preferred terminal (saved to `~/.morning-cup-prefs.json`)
- Injects the selected command into the terminal

```bash
# Run directly at any time:
python3 scripts/applet.py

# No-TUI mode (plain numbered menu):
python3 scripts/applet.py --no-tui
```

[↑ Back to top](#table-of-contents)

---

## Security & Access Control

### The rules

- **Secrets are NEVER committed to git** — they live in Cloudflare Worker Secrets only
- **Only @pennydoesdev** can delete KV records, modify secrets, or approve merges
- **RUN_SECRET** is required for all `/run`, `/approve`, `/reject` endpoints
- **`.env` is in `.gitignore`** and must never be pushed

### Who can do what

| Action | Who |
|--------|-----|
| Merge PRs | `@pennydoesdev` only |
| Rotate secrets | `@pennydoesdev` only |
| Delete KV run records | `@pennydoesdev` only |
| Generate episodes | Anyone with `RUN_SECRET` |
| Approve scripts | Anyone with `RUN_SECRET` |
| View status | Anyone (if `STATUS_PUBLIC=true`) or `RUN_SECRET` bearer |

### Rotate a secret

```bash
# Generate a new secret, then:
npx wrangler secret put RUN_SECRET
# Update ~/Documents/"The Morning Cup"/.env with the new value
# Notify team members of the new RUN_SECRET
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full access control policy and team onboarding guide.

[↑ Back to top](#table-of-contents)

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| **Validation fails — word count too low** | Re-run with `--force`; check source digest is producing news items |
| **ElevenLabs 429 rate limit** | Wait and retry; check quota at elevenlabs.io dashboard |
| **Worker times out** | Re-run with `--force`; partial chunks are saved |
| **`wrangler: command not found`** | Run `npm install -g wrangler` or use `npx wrangler` |
| **`ffmpeg: command not found`** | Install ffmpeg — see [Required Software](#required-software) |
| **Preflight fails: missing sounds** | Add required .mp3/.wav files to `Sounds/` — see [Folder Structure](#folder-structure) |
| **`RUN_SECRET not set`** | Add `RUN_SECRET=...` to `~/Documents/The Morning Cup/.env` |
| **Stuck at `awaiting_approval`** | Run `./scripts/morning-cup.sh approve 2026-05-24` |
| **TypeScript errors** | Run `npx tsc --noEmit` to see details; check you ran `npm install` |
| **KV namespace not found** | Verify `wrangler.toml` KV namespace ID matches Cloudflare account |
| **Audacity won't open .aup3** | You need Audacity 3.x (not 2.x) — [download here](https://www.audacityteam.org/download/) |
| **Audacity FFmpeg error** | Install the [FFmpeg library for Audacity](https://support.audacityteam.org/basics/installing-ffmpeg) |
| **Pronunciation issues** | Add entry to `data/pronunciation-dictionary.json` — plain phonetic with spaces, no hyphens |

For advanced troubleshooting and configuration tuning, see [docs/OPERATIONS.md](./docs/OPERATIONS.md).

[↑ Back to top](#table-of-contents)

---

## Documentation Index

| Document | Description |
|----------|-------------|
| [docs/GETTING-STARTED.md](./docs/GETTING-STARTED.md) | Complete first-time setup walkthrough with worked example |
| [docs/PIPELINE.md](./docs/PIPELINE.md) | Architecture diagrams, component breakdown, API endpoints |
| [docs/OPERATIONS.md](./docs/OPERATIONS.md) | Configuration tuning, voice tuning, best practices, advanced troubleshooting |
| [docs/PUBLISHING.md](./docs/PUBLISHING.md) | WordPress integration, Metadata.txt format, CDN migration, Google Drive |
| [docs/COMPLIANCE.md](./docs/COMPLIANCE.md) | AI disclosure requirements, copyright, compliance checklists, incident response |
| [docs/NEW-SHOW.md](./docs/NEW-SHOW.md) | Launch a new Fold 42 podcast (white-label setup guide) |
| [docs/SHOW-PLANNER.md](./docs/SHOW-PLANNER.md) | Pre-coding questionnaire — answer before writing any code |
| [docs/APPLE-SHORTCUTS.md](./docs/APPLE-SHORTCUTS.md) | Run the pipeline from the macOS menu bar / Spotlight / hotkey |
| [docs/CHANGELOG.md](./docs/CHANGELOG.md) | Version history and change log |
| [docs/PROMPTS.md](./docs/PROMPTS.md) | ElevenLabs voice prompts library |
| [CONTRIBUTING.md](./CONTRIBUTING.md) | Branch protection, PR process, team onboarding, offboarding, secret management |

[↑ Back to top](#table-of-contents)

---

*Built with ☕ by [Fold 42](https://fold42.com) · Host: Penelope Rose · © Fold 42*
