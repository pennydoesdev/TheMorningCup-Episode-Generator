# Setup Guide

End-to-end first-time setup of The Morning Cup: Weekly Rewind pipeline.

After this, your weekly workflow is two commands. See [DAILY-WORKFLOW.md](./DAILY-WORKFLOW.md).

---

## What you're setting up

```
                            5:00 AM ET cron
                                  │
                                  ▼
                ┌──────────────────────────────────┐
                │  Cloudflare Worker (this repo)   │
                │   - OpenAI Responses + web_search│
                │   - Validate + repair pass       │
                │   - ElevenLabs TTS (parallel x4) │
                │   - Write to R2                  │
                └────────────┬─────────────────────┘
                             │
                             ▼ (R2 bucket)
              weekly-cup/<DATE>/
                ├── chunks/001.mp3 … NNN.mp3
                ├── manifest.json (title, copyright, etc.)
                ├── files.txt
                ├── *.txt / *.html / *.json
                └── run.json

                   ┌─── on your Mac ────┐
                   │  fetch-chunks.sh   │  pulls chunks + manifest
                   │  build-episode.sh  │  ffmpeg assemble + tag
                   └────────┬───────────┘
                            ▼
       ~/Documents/The Morning Cup - Weekly Rewind/Episodes/
         The Morning Cup - Weekly Rewind - <DATE>.mp3
         (intro song → coffee pour → "cream or sugar?" →
          intro sting → 19 chunks with section stings →
          thank-you outro, all ID3-tagged)
```

---

## Prerequisites

On your Mac you'll need:

| Tool | Why | Install |
|------|-----|---------|
| Node 20+ | Wrangler runs on Node | `brew install node` |
| Wrangler CLI | Deploys + reads R2 | `npm install -g wrangler` |
| Python 3 | Reads manifest JSON, ID3 tagging | already on macOS |
| `mutagen` | ID3 tagging (preferred) | `python3 -m pip install --user --break-system-packages mutagen` |
| `ffmpeg` | Audio concat + MP3 encode + ID3 fallback | `brew install ffmpeg` |

Cloudflare account with these resources (created once):

- **R2 bucket** named `weekly-cup`
- **KV namespace** with binding `WEEKLY_CUP_KV` (id is in `wrangler.toml`)
- **OpenAI API key** with access to `gpt-5-mini` (or whichever model is in `wrangler.toml`)
- **ElevenLabs API key** + a cloned voice id

ElevenLabs account with:
- A cloned voice (used to read the news script)
- Sound Effects access (Creator plan or higher) for generating stings

---

## 1. Clone the repo into your working folder

The repo is the **source of truth** for the worker code and helper scripts. We mirror the helper scripts to a working folder you'll use day-to-day.

```bash
mkdir -p "$HOME/Documents/The Morning Cup - Weekly Rewind/Sounds"
mkdir -p "$HOME/Documents/The Morning Cup - Weekly Rewind/Scripts"
mkdir -p "$HOME/Documents/The Morning Cup - Weekly Rewind/Chunks"
mkdir -p "$HOME/Documents/The Morning Cup - Weekly Rewind/Episodes"

cd "$HOME/Documents/The Morning Cup"
git clone https://github.com/pennydoesdev/WeeklyCup-Episode-Generator.git Generator
```

## 2. Copy the helper scripts to the working `Scripts/` folder

```bash
cp "$HOME/Documents/The Morning Cup - Weekly Rewind/Generator/scripts/fetch-chunks.sh" \
   "$HOME/Documents/The Morning Cup - Weekly Rewind/Scripts/fetch-chunks.sh"
cp "$HOME/Documents/The Morning Cup - Weekly Rewind/Generator/scripts/build-episode.sh" \
   "$HOME/Documents/The Morning Cup - Weekly Rewind/Scripts/build-episode.sh"
chmod +x "$HOME/Documents/The Morning Cup - Weekly Rewind/Scripts/"*.sh
```

When the repo updates, refresh your local copies:
```bash
cd "$HOME/Documents/The Morning Cup - Weekly Rewind/Generator" && git pull origin main
cp "$HOME/Documents/The Morning Cup - Weekly Rewind/Generator/scripts/"*.sh \
   "$HOME/Documents/The Morning Cup - Weekly Rewind/Scripts/"
chmod +x "$HOME/Documents/The Morning Cup - Weekly Rewind/Scripts/"*.sh
```

## 3. Create the six sound assets

All six live in `~/Documents/The Morning Cup - Weekly Rewind/Sounds/` with these exact filenames:

| File | What | How to make |
|------|------|-------------|
| `The Morning Cup - Weekly Rewind - Song.wav` | Intro theme | DAW / commission / royalty-free track |
| `Coffee Pour.wav` | 2-second pour ambience | ElevenLabs Sound Effects ([prompts](./PROMPTS.md)) |
| `Cream or sugar, hon?.mp3` | Voice line in your cloned voice | ElevenLabs Speech (TTS), select your cloned voice |
| `intro-sting.wav` | Sting that says "now the news begins" | ElevenLabs Sound Effects |
| `weekly-rewind-sting.wav` | Section transition sting | ElevenLabs Sound Effects |
| `The Morning Cup - Weekly Rewind - Thank You.wav` | Outro thank-you bed | DAW / commission / royalty-free |

ElevenLabs prompt copy-paste templates are in [PROMPTS.md](./PROMPTS.md).

## 4. Install Python and ffmpeg dependencies

```bash
python3 -m pip install --user --break-system-packages mutagen
brew install ffmpeg

# verify
python3 -c "import mutagen; print('mutagen', mutagen.version_string)"
which ffmpeg
```

## 5. Worker secrets (one-time on Cloudflare)

If the worker isn't already deployed:

```bash
cd "$HOME/Documents/The Morning Cup - Weekly Rewind/Generator"
npm install
wrangler login            # browser auth

# Set these secrets — one at a time, paste value at prompt:
wrangler secret put OPENAI_API_KEY
wrangler secret put ELEVENLABS_API_KEY
wrangler secret put ELEVENLABS_VOICE_ID
wrangler secret put RUN_SECRET            # any random string; gates POST /run
# wrangler secret put RESEND_API_KEY      # only if you set ENABLE_EMAIL=true

wrangler deploy
```

## 6. Authenticate Wrangler for R2 reads

The `fetch-chunks.sh` script uses `wrangler r2 object get` to pull chunks down. If you ever see auth errors, run:
```bash
wrangler login
```

## 7. Test the full pipeline

Trigger a run for any past date manually:

```bash
RUN_SECRET="<your-secret>"
DATE="2026-04-30"
curl --max-time 900 -X POST \
  -H "Authorization: Bearer $RUN_SECRET" \
  "https://weeklycupgenerator.<your-subdomain>.workers.dev/run?date=$DATE&force=true"
```

When it returns (~6-9 min), pull and assemble:

```bash
"$HOME/Documents/The Morning Cup - Weekly Rewind/Scripts/fetch-chunks.sh" "$DATE"
"$HOME/Documents/The Morning Cup - Weekly Rewind/Scripts/build-episode.sh" "$DATE"
open "$HOME/Documents/The Morning Cup - Weekly Rewind/Episodes/The Morning Cup - $DATE.mp3"
```

If you hear: intro song → coffee pour → "cream or sugar, hon?" → intro sting → news → outro, you're done.

## 8. (Optional) DaVinci Resolve menu integration

Only useful if you have **DaVinci Resolve Studio** (paid). Free Resolve doesn't allow Terminal-driven scripting. See [TROUBLESHOOTING.md](./TROUBLESHOOTING.md#free-resolve-cant-run-the-python-script) for context.

```bash
mkdir -p "$HOME/Library/Application Support/Blackmagic Design/DaVinci Resolve/Fusion/Scripts/Edit"
ln -sf "$HOME/Documents/The Morning Cup - Weekly Rewind/Generator/scripts/build-resolve-timeline.py" \
       "$HOME/Library/Application Support/Blackmagic Design/DaVinci Resolve/Fusion/Scripts/Edit/build-weekly-rewind.py"
```

Restart Resolve. The script appears at **Workspace > Scripts > Edit > build-weekly-rewind**.

---

## Folder layout when you're done

```
~/Documents/The Morning Cup - Weekly Rewind/
├── Generator/                    ← cloned repo, source of truth
├── Scripts/
│   ├── fetch-chunks.sh
│   └── build-episode.sh
├── Sounds/
│   ├── The Morning Cup - Song.wav
│   ├── Coffee Pour.wav
│   ├── Cream or sugar, hon?.mp3
│   ├── intro-sting.wav
│   ├── weekly-rewind-sting.wav
│   └── The Morning Cup - Thank You.wav
├── Chunks/<YYYY-MM-DD>/          ← per-day raw chunks (created by fetch-chunks.sh)
└── Episodes/                     ← final tagged MP3s (created by build-episode.sh)
    └── The Morning Cup - <YYYY-MM-DD>.mp3
```
