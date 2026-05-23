# Setup Guide

End-to-end first-time setup of The Morning Cup pipeline.

After this, your daily workflow is one command: `morning-cup.sh make`. See [DAILY-WORKFLOW.md](./DAILY-WORKFLOW.md).

---

## What you're setting up

```
                            5:00 AM ET cron
                                  │
                                  ▼
                ┌──────────────────────────────────┐
                │  Cloudflare Worker (this repo)   │
                │   - OpenAI script generation     │
                │   - Topic dedup (7-day KV memory)│
                │   - Validate + repair pass       │
                │   - ElevenLabs TTS (parallel x4) │
                │   - gpt-4o-mini title + metadata │
                │   - Write to R2                  │
                └────────────┬─────────────────────┘
                             │
                             ▼ (R2 bucket)
              Generators/Podcasts/TheMorningCup/<DATE>/
                ├── chunks/001.mp3 … NNN.mp3
                ├── manifest.json (title, copyright, etc.)
                ├── files.txt
                ├── Metadata.txt (post title, SEO, tags, description…)
                ├── *.txt / *.html / *.json
                └── run.json

                   ┌─── on your Mac ────────────────────┐
                   │  morning-cup.sh make               │
                   │    → fetch chunks + manifest       │
                   │    → ffmpeg assemble + loudnorm    │
                   │    → write chapters                │
                   │    → Whisper transcribe → .srt/.vtt│
                   └────────┬───────────────────────────┘
                            ▼
       ~/Documents/The Morning Cup/Episodes/
         The Morning Cup - <DATE>.mp3
         The Morning Cup - <DATE> - Metadata.txt
         The Morning Cup - <DATE>.srt
         The Morning Cup - <DATE>.vtt
```

---

## Prerequisites

On your Mac you'll need:

| Tool | Why | Install |
|------|-----|---------|
| Node 20+ | Wrangler runs on Node | `brew install node` |
| Wrangler CLI | Deploys + reads R2 | `npm install -g wrangler` |
| Python 3 | Reads manifest JSON, transcription | already on macOS |
| `mutagen` | ID3 tagging | `python3 -m pip install --user --break-system-packages mutagen` |
| `requests` | API calls in pipeline scripts | `python3 -m pip install --user --break-system-packages requests` |
| `ffmpeg` | Audio concat + MP3 encode + ID3 fallback | `brew install ffmpeg` |

Cloudflare account with these resources (created once):

- **R2 bucket** named `vicinity`
- **KV namespace** with binding `MORNING_CUP_KV` (id is in `wrangler.toml`)
- **OpenAI API key** with access to `o3` and `gpt-4o-mini`
- **ElevenLabs API key** + a cloned voice id

---

## 1. Clone the repo into your working folder

The repo is the **source of truth** for the worker code and helper scripts.

```bash
mkdir -p "$HOME/Documents/The Morning Cup/Sounds"
mkdir -p "$HOME/Documents/The Morning Cup/Scripts"
mkdir -p "$HOME/Documents/The Morning Cup/Chunks"
mkdir -p "$HOME/Documents/The Morning Cup/Episodes"

cd "$HOME/Documents/The Morning Cup"
git clone https://github.com/pennydoesdev/TheMorningCup-Episode-Generator.git Generator
```

## 2. Copy the helper scripts to the working `Scripts/` folder

```bash
cd "$HOME/Documents/The Morning Cup/Generator"
cp scripts/build-episode.sh        "$HOME/Documents/The Morning Cup/Scripts/"
cp scripts/fetch-chunks.sh         "$HOME/Documents/The Morning Cup/Scripts/"
cp scripts/morning-cup.sh          "$HOME/Documents/The Morning Cup/Scripts/"
cp scripts/write-chapters.py       "$HOME/Documents/The Morning Cup/Scripts/"
cp scripts/transcribe-episode.py   "$HOME/Documents/The Morning Cup/Scripts/"
cp scripts/generate-transcript.py  "$HOME/Documents/The Morning Cup/Scripts/"
chmod +x "$HOME/Documents/The Morning Cup/Scripts/"*.sh
```

Re-run this block any time you `git pull` updates.

## Updating the code

**Run this every time you pull new changes from GitHub.** Skipping any step can result in a stale Worker, a broken Cloudflare dashboard build, or scripts that don't match.

```bash
# 1. Pull latest from the branch
cd "$HOME/Documents/The Morning Cup/Generator"
git fetch origin
git pull origin claude/brave-gates-wbCkD

# 2. Regenerate the lock file (REQUIRED after any dependency change)
#    Skipping this causes the Cloudflare dashboard build to fail with
#    "npm ci" lock file mismatch errors.
npm install

# 3. Copy updated scripts to your working Scripts/ folder
cp scripts/build-episode.sh \
   scripts/write-chapters.py \
   scripts/fetch-chunks.sh \
   scripts/generate-transcript.py \
   "$HOME/Documents/The Morning Cup/Scripts/"

# 4. Deploy the updated Worker to Cloudflare
wrangler deploy
```

> **Why `npm install` every time?**  
> The Cloudflare dashboard CI uses `npm ci`, which requires `package.json`
> and `package-lock.json` to be in perfect sync. When Wrangler or any
> dependency bumps a version, the lock file goes stale. Running `npm install`
> regenerates it. If you skip this step and push, the dashboard build will
> fail with a wall of "lock file's X does not satisfy Y" errors.

## 3. Create the five sound assets

All five live in `~/Documents/The Morning Cup/Sounds/` with these exact filenames:

| File | What | Required |
|------|------|---------|
| `Hello.mp3` | Intro theme (plays first) | ✓ required |
| `Coffee Pour.wav` | 2-second pour ambience | ✓ required |
| `Topic Transition.mp3` | Section transition sting | ✓ required |
| `Goodbye.mp3` | Outro music bed (plays last) | ✓ required |
| `intro-sting.wav` | Sting that says "now the news begins" | optional |

ElevenLabs prompt copy-paste templates are in [PROMPTS.md](./PROMPTS.md).

## 4. Install Python and ffmpeg dependencies

```bash
python3 -m pip install --user --break-system-packages mutagen requests
brew install ffmpeg

# verify
python3 -c "import mutagen, requests; print('all good')"
which ffmpeg
```

## 5. Worker secrets (one-time on Cloudflare)

If the worker isn't already deployed:

```bash
cd "$HOME/Documents/The Morning Cup/Generator"
npm install
wrangler login            # browser auth

# Set these secrets — one at a time, paste value at prompt:
wrangler versions secret put OPENAI_API_KEY
wrangler versions secret put ELEVENLABS_API_KEY
wrangler versions secret put ELEVENLABS_VOICE_ID
wrangler versions secret put RUN_SECRET            # any random string; gates POST /run

wrangler deploy
```

## 6. Local `.env` file

```bash
cat > "$HOME/Documents/The Morning Cup/.env" <<'ENVEOF'
# Worker auth (must match the RUN_SECRET you set above)
RUN_SECRET="<paste your RUN_SECRET>"

# Optional: add one of these for auto-transcription after each episode build
# GROQ_API_KEY="gsk_..."        ← $0.01/episode, ~16 seconds (recommended)
# OPENAI_API_KEY="sk-..."       ← $0.10/episode, ~60 seconds (fallback)
ENVEOF
chmod 600 "$HOME/Documents/The Morning Cup/.env"
```

## 7. Test the full pipeline

Run preflight first to check everything is in order:

```bash
"$HOME/Documents/The Morning Cup/Scripts/morning-cup.sh" preflight
```

All checks should show `PASS`. Then run the full pipeline:

```bash
"$HOME/Documents/The Morning Cup/Scripts/morning-cup.sh" make
```

Total wall time: ~5-8 minutes. You should hear: intro song → coffee pour → intro sting → news sections → outro.

---

## Folder layout when you're done

```
~/Documents/The Morning Cup/
├── .env                                       ← local credentials (chmod 600)
├── Generator/                                 ← cloned repo, source of truth
├── Scripts/                                   ← runtime copies of helper scripts
│   ├── morning-cup.sh
│   ├── fetch-chunks.sh
│   ├── build-episode.sh
│   ├── write-chapters.py
│   ├── transcribe-episode.py
│   └── generate-transcript.py
├── Sounds/
│   ├── Hello.mp3
│   ├── Coffee Pour.wav
│   ├── Topic Transition.mp3
│   ├── Goodbye.mp3
│   └── intro-sting.wav  (optional)
├── Chunks/<YYYY-MM-DD>/                       ← per-day raw chunks (created by fetch)
└── Episodes/                                  ← final tagged MP3s
    ├── The Morning Cup - <YYYY-MM-DD>.mp3
    ├── The Morning Cup - <YYYY-MM-DD> - Metadata.txt
    ├── The Morning Cup - <YYYY-MM-DD>.srt
    └── The Morning Cup - <YYYY-MM-DD>.vtt
```
