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
- **OpenAI API key** with access to `gpt-5-mini`
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
chmod +x "$HOME/Documents/The Morning Cup/Scripts/"*.sh
```

Re-run this block any time you `git pull` updates.

## 3. Create the five sound assets

All five live in `~/Documents/The Morning Cup/Sounds/` with these exact filenames:

| File | What | Required |
|------|------|---------|
| `Spark.mp3` | Intro theme | ✓ required |
| `Coffee Pour.wav` | 2-second pour ambience | ✓ required |
| `Topic Transition.mp3` | Section transition sting | ✓ required |
| `The Morning Cup - Thank You.wav` | Outro thank-you bed | ✓ required |
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
│   └── transcribe-episode.py
├── Sounds/
│   ├── Spark.mp3
│   ├── Coffee Pour.wav
│   ├── Topic Transition.mp3
│   ├── The Morning Cup - Thank You.wav
│   └── intro-sting.wav  (optional)
├── Chunks/<YYYY-MM-DD>/                       ← per-day raw chunks (created by fetch)
└── Episodes/                                  ← final tagged MP3s
    ├── The Morning Cup - <YYYY-MM-DD>.mp3
    ├── The Morning Cup - <YYYY-MM-DD> - Metadata.txt
    ├── The Morning Cup - <YYYY-MM-DD>.srt
    └── The Morning Cup - <YYYY-MM-DD>.vtt
```
