# Quickstart — Zero to First Episode

Complete end-to-end setup, every command in a copy-paste block.

If you're already set up and just want today's morning routine, skip to
[Step 8 — Daily workflow](#step-8--daily-workflow).

---

## What you'll have when this is done

- Cloudflare Worker that fires at 5:00 AM ET every day and generates a ~8-15 minute episode script via OpenAI
- Topic deduplication: last 7 days of covered stories stored in KV — no repeated news
- ElevenLabs synthesizes the script into MP3 chunks (parallel x4)
- Chunks land in R2; the Worker generates an episode title, description, SEO fields, and tags via `gpt-4o-mini`
- Local `morning-cup.sh make` assembles chunks + intro/outro, loudness-normalizes to -16 LUFS, adds chapter markers, transcribes to .srt/.vtt
- One-command morning: `morning-cup.sh make`

Total daily human time: ~30 seconds.

---

## Step 1 — Folder structure on your Mac

```bash
mkdir -p "$HOME/Documents/The Morning Cup/Sounds"
mkdir -p "$HOME/Documents/The Morning Cup/Scripts"
mkdir -p "$HOME/Documents/The Morning Cup/Chunks"
mkdir -p "$HOME/Documents/The Morning Cup/Episodes"
```

## Step 2 — Clone the repo

```bash
cd "$HOME/Documents/The Morning Cup"
git clone https://github.com/pennydoesdev/TheMorningCup-Episode-Generator.git Generator
```

To pull updates later:

```bash
cd "$HOME/Documents/The Morning Cup/Generator"
git pull origin main
```

## Step 3 — Mirror helper scripts to your working `Scripts/` folder

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

## Step 4 — Drop the sound assets into `Sounds/`

You need five files with these exact names:

```
Hello.mp3                           ← intro music
Coffee Pour.wav                     ← signature pour ambience
Topic Transition.mp3                ← section transition sting
Goodbye.mp3                         ← outro
intro-sting.wav                     ← optional: "now the news begins" sting
```

Copy from the repo's `assets/sounds/` if they're there:
```bash
cp "$HOME/Documents/The Morning Cup/Generator/assets/sounds/"*.{wav,mp3} \
   "$HOME/Documents/The Morning Cup/Sounds/" 2>/dev/null || true
```

## Step 5 — Install Mac dependencies

```bash
# Homebrew (skip if you have it)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# ffmpeg for audio processing
brew install ffmpeg

# Node + Wrangler for Cloudflare deploys + R2 reads
brew install node
npm install -g wrangler

# Python deps for the local pipeline
python3 -m pip install --user --break-system-packages mutagen requests
```

Verify:
```bash
which ffmpeg wrangler
python3 -c "import mutagen, requests; print('all good')"
```

## Step 6 — Authenticate Wrangler + deploy

```bash
cd "$HOME/Documents/The Morning Cup/Generator"
wrangler login   # browser window opens, approve it
npm install
wrangler deploy
```

## Step 7 — Set your local `.env` file

```bash
cat > "$HOME/Documents/The Morning Cup/.env" <<'ENVEOF'
# Must match the RUN_SECRET Cloudflare secret
RUN_SECRET="<paste your RUN_SECRET here>"

# Optional: add one of these for auto-transcription ($0.01/episode with Groq)
# GROQ_API_KEY="gsk_..."
# OPENAI_API_KEY="sk-..."
ENVEOF
chmod 600 "$HOME/Documents/The Morning Cup/.env"
```

## Step 7b — Verify Worker secrets are set

```bash
cd "$HOME/Documents/The Morning Cup/Generator"
wrangler secret list
```

You should see: `OPENAI_API_KEY`, `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, `RUN_SECRET`.

If any are missing:
```bash
wrangler secret put <SECRET_NAME>
```

## Step 8 — Daily workflow

Run preflight first:
```bash
"$HOME/Documents/The Morning Cup/Scripts/morning-cup.sh" preflight
```

All checks should be `PASS`. Then your one command every morning:

```bash
"$HOME/Documents/The Morning Cup/Scripts/morning-cup.sh" make
```

Total wall time: ~5-8 minutes. You'll get:

```
~/Documents/The Morning Cup/Episodes/
  The Morning Cup - 2026-05-22.mp3            ← finished episode
  The Morning Cup - 2026-05-22 - Metadata.txt ← post title, SEO, tags, description, etc.
  The Morning Cup - 2026-05-22.srt            ← transcript for podcast host
  The Morning Cup - 2026-05-22.vtt            ← transcript for web players
```

## Step 9 — Apple Shortcuts (optional)

Build the Shortcuts in [APPLE-SHORTCUTS.md](./APPLE-SHORTCUTS.md). After that:

| Hotkey | Action |
|--------|--------|
| ⌃⌥⌘ M | Make Today's Morning Cup (full end-to-end) |
| ⌃⌥⌘ O | Open Latest Episode |
| ⌃⌥⌘ S | Check Worker Status |

---

## Reference: where everything lives after setup

```
~/Documents/The Morning Cup/
├── .env                                       ← local credentials (chmod 600)
├── Generator/                                 ← cloned repo
├── Scripts/                                   ← runtime helpers
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
├── Chunks/<YYYY-MM-DD>/                       ← per-day raw chunks from R2
└── Episodes/                                  ← final tagged MP3s + metadata

Cloudflare:
  worker:  themorningcupgenerator
  R2:      vicinity (bucket)
  KV:      MORNING_CUP_KV (run records + topic memory)
```

---

## When something breaks

See [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) for the matrix of symptoms → fixes.
