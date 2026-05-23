# Creating a New Fold 42 Podcast

This guide walks a Fold 42 team member through launching a new AI-assisted podcast
using the same infrastructure that powers The Morning Cup. By the end you will have
your own daily (or scheduled) podcast generator — your own show name, your own host
voice, your own editorial sections, and your own Cloudflare Worker — completely
independent of The Morning Cup.

**You will need a developer to help with steps 4–9.** Everything else can be done by a producer.

---

## What stays the same across all Fold 42 shows

- The Cloudflare Worker infrastructure (R2 storage, KV state, cron trigger)
- The OpenAI + ElevenLabs pipeline
- The audio assembly scripts (`build-episode.sh`, `write-chapters.py`, etc.)
- The Metadata.txt format, SEO generation, and AI disclosure system
- The validator, chunker, and TTS client code

## What you customize for your show

- Show name, host name, and branding
- The master prompt (your editorial voice, topics, sections)
- The ElevenLabs voice model (your host's voice)
- Sound assets (intro/outro music, transition sting)
- Cloudflare Worker name and R2 storage path

---

## Step 1 — Define your show

Before touching any code, answer these questions. Write them down — you'll use them throughout setup.

**Show identity:**
- What is the show's name? (e.g. "The Evening Brief", "Fold 42 Business Daily")
- Who is the host? (name and a one-sentence bio)
- What is the show's tagline? (one sentence)
- What is the publishing schedule? (daily, weekday, weekly)
- What time should it publish? (and in what timezone)

**Editorial concept:**
- What is the show about? (topic area, audience, tone)
- What sections will every episode have? (list them — these become your chapter structure)
- How long should each episode be? (target runtime in minutes)
- What are your mandatory sources? (government sites, official feeds, specific outlets)

**Voice:**
- Has your host consented to voice cloning and revenue sharing? (required before proceeding)
- Do you have a high-quality voice recording of your host? (minimum 30 minutes, see Step 2)

Write all of this down before continuing.

---

## Step 2 — Clone your host's voice in ElevenLabs

Your host's cloned voice is what makes the show sound like a real person.

**What you need:**
- An ElevenLabs account (Creator plan or higher — required for Professional Voice Cloning)
- A clean audio recording of your host: **minimum 30 minutes**, ideally 60+ minutes
  - No background music or noise
  - Consistent recording environment
  - Natural speech, not overly performed
  - Different types of delivery: conversational, serious, warm, upbeat

**Steps:**
1. Log into [elevenlabs.io](https://elevenlabs.io)
2. Go to **Voices** → **Add Voice** → **Professional Voice Clone**
3. Upload your audio samples
4. Give the voice a name (e.g. "Jordan Kim — Fold 42")
5. Submit — ElevenLabs will email you when the clone is ready (usually 24–48 hours)
6. Once ready, open the voice and copy the **Voice ID** (a long string of letters and numbers)
   — you will need this in Step 5

**Test the voice** before proceeding: use the ElevenLabs playground to make sure it sounds like your host at a few different stability/style settings.

---

## Step 3 — Get your API keys

You need four services. All of these are accounts your developer will need access to.

### OpenAI
1. Go to [platform.openai.com](https://platform.openai.com)
2. **Settings** → **API Keys** → **Create new secret key**
3. Name it (e.g. "Fold 42 — The Evening Brief")
4. Copy the key — you will not be able to see it again
5. Add billing at **Settings** → **Billing** → add a credit card

### ElevenLabs
1. Log into [elevenlabs.io](https://elevenlabs.io)
2. **Profile** → **API Keys** → create a new key
3. Copy it

### Cloudflare
1. Log into [dash.cloudflare.com](https://dash.cloudflare.com)
2. **My Profile** → **API Tokens** → **Create Token**
3. Use the "Edit Cloudflare Workers" template
4. Copy the token
5. Note your **Account ID** (visible in the right sidebar on any Workers page)

### Resend (for completion emails)
1. Go to [resend.com](https://resend.com) and sign in with the Fold 42 account
2. **API Keys** → **Create API Key**
3. Verify the sender domain if you want emails from a custom address

---

## Step 4 — Fork the repository

**Your developer does this.**

```bash
# Clone the Morning Cup repo into a new folder with your show's name
# Replace "the-evening-brief" with your show's slug
git clone https://github.com/pennydoesdev/TheMorningCup-Episode-Generator.git \
  TheEveningBrief-Episode-Generator
cd TheEveningBrief-Episode-Generator

# Create a new branch for your show
git checkout -b main

# Create a new GitHub repo under the Fold 42 org for your show, then push to it:
git remote set-url origin https://github.com/pennydoesdev/TheEveningBrief-Episode-Generator.git
git push -u origin main
```

---

## Step 5 — Configure wrangler.toml

**Your developer does this.** Open `wrangler.toml` — this is the single file that defines your show's identity and all tunable settings.

Change these values (everything else can stay the same initially):

```toml
name = "the-evening-brief-generator"        # your Cloudflare Worker name (no spaces)

[vars]
SHOW_TITLE = "The Evening Brief"            # your show name
HOST_NAME = "Jordan Kim"                    # your host's name
PUBLISHER = "Fold 42"                       # always Fold 42
COPYRIGHT_HOLDER = "Fold 42"               # always Fold 42

R2_KEY_PREFIX = "Generators/Podcasts/TheEveningBrief"  # R2 storage path (no spaces)

OPENAI_MODEL = "o3"                         # keep — best model for complex scripts
ELEVENLABS_MODEL_ID = "eleven_multilingual_v2"  # keep

# Runtime targets — adjust to your show length
WORDS_PER_MINUTE = "145"                    # typical spoken pace; adjust after testing
MIN_SCRIPT_WORDS = "2175"                   # hard floor (15 min)
TARGET_SCRIPT_WORDS_MIN = "2610"           # sweet spot low (18 min)
TARGET_SCRIPT_WORDS_MAX = "2900"           # sweet spot high (20 min)
MAX_SCRIPT_WORDS = "3625"                   # hard ceiling (25 min)

# Voice settings — tune these after testing your voice clone
VOICE_STABILITY = "0.35"                    # lower = more expressive; higher = more consistent
VOICE_SIMILARITY_BOOST = "0.85"            # how closely to match the cloned voice
VOICE_STYLE = "0.70"                        # speaking style intensity
VOICE_USE_SPEAKER_BOOST = "true"           # improves clarity; keep true

# Cron — when the episode generates
# Format: "0 HOUR * * *" where HOUR is UTC. America/New_York 5 AM = UTC 9 or 10 (DST)
# Change WORKER_TIMEZONE and the cron hour for your publish time.
WORKER_TIMEZONE = "America/New_York"
```

**Cron timing examples:**
| Publish time | WORKER_TIMEZONE | wrangler.toml crons |
|---|---|---|
| 5 AM ET | America/New_York | `["0 9-11 * * *"]` |
| 6 AM PT | America/Los_Angeles | `["0 13-15 * * *"]` |
| 7 AM CT | America/Chicago | `["0 12-14 * * *"]` |

---

## Step 6 — Write your master prompt

**This is the most important step.** The master prompt in `src/prompt.ts` is what the AI reads every morning to understand what kind of show it is, what topics to cover, and how to write the script. The Morning Cup's prompt took weeks to develop and tune.

### What the prompt MUST contain (non-negotiable — the pipeline requires these)

These are technical requirements that the validator and chunker enforce. Leave them out and the episode will fail validation every time.

**1. JSON output format**
The AI must output valid JSON with these exact fields. Copy this schema description into your prompt:

```
You must output valid JSON with these fields:
- show_title: string — your show's name
- episode_date: string — YYYY-MM-DD
- source_date: string — YYYY-MM-DD (yesterday)
- estimated_runtime: string — e.g. "18 minutes"
- elevenlabs_script: string — the full spoken script (see rules below)
- riddle_question: string
- riddle_answer: string
- social_copy: { main_post: string, section_posts: [{section: string, post: string}] }
- source_notes: [{title: string, source: string, url: string, date: string}]
- self_validation: {word_count: number, spacer_count: number, passes: boolean, notes: string}
- chapters: [{title: string, starts_at_spacer: number}]
```

**2. Section spacers — REQUIRED**
Between every major section of the script, the AI must write exactly:
```
[TEN-SECOND SECTION SPACER]
```
This is what the chunker splits on. One spacer = one audio chunk = one section transition sting.
**If your show has N sections, your script needs at least N-1 spacers.** Add this rule to your prompt:
> After every major section, write exactly `[TEN-SECOND SECTION SPACER]` on its own line.
> These mark where transition audio plays. Every section change needs one.

**3. Script must include the show name**
The validator checks that the script mentions your show by name at least once.

**4. Script must open with a date reference**
The validator checks that the script starts with "Good morning, today is" (or you can customize this check in `src/validator.ts` line 82).

**5. Word count**
The script must hit the word count range you set in `wrangler.toml`. Build this into your prompt:
> The script must be between [MIN] and [MAX] words. Target [TARGET] words.

### What makes a great prompt

Think of your prompt as the complete editorial handbook for your show. It should answer every question the AI might have about how to write an episode. Here is what The Morning Cup's prompt covers — adapt each one for your show:

**Show identity block**
```
SHOW IDENTITY
Show: [Your Show Name]
Host: [Host Name]
Publisher: Fold 42
Tone: [e.g. "Warm but authoritative. Conversational without being casual.
        The host knows the audience and respects their time."]
Audience: [Who listens and why]
```

**Runtime and word count rules**
```
RUNTIME RULES
- Hard floor: [X] minutes / [words] words
- Sweet spot: [X]–[Y] minutes / [words]–[words] words
- Hard ceiling: [Z] minutes / [words] words
- Speaking pace: 145 words per minute
```

**Topic flow** — list every section in order with what goes in each one
```
TOPIC FLOW (produce in this order, one [TEN-SECOND SECTION SPACER] between each)
1. Opening — "Good morning, today is [DATE]..." — host intro, listening time, story tease
2. [Your Section 1] — [what goes here, depth target in words]
3. [Your Section 2] — [what goes here, depth target in words]
...
N. Outro — sign-off, CTA, riddle answer
```

**Research sources** — tell the AI exactly where to look for each section
```
MANDATORY RESEARCH SOURCES
[Section name]: must check [source URLs]
```

**Voice and delivery rules** — how the host speaks
```
VOICE RULES
- Write for the ear, not the eye. Every sentence should sound natural when read aloud.
- Numbers as spoken: write "twenty twenty-six" not "2026", "four-point-seven billion dollars" not "$4.7B"
- Abbreviations expanded on first mention: "the Federal Bureau of Investigation (the FBI)"
- Difficult names: add phonetic guide in [brackets] after first use
- No sentence longer than 25 words
- No lists longer than 3 items
- Active voice. Present tense where possible.
```

**Coverage rules** — your editorial standards
```
COVERAGE RULES
- [Any topics you never cover or always cover a certain way]
- [Framing rules — e.g. "Climate change is settled science. Report it as fact."]
- [Language rules — e.g. "Never use the word 'alleged' for documented actions"]
```

**Required elements**
```
REQUIRED ELEMENTS
- Riddle question somewhere before the outro
- Riddle answer at the very end of the script
- Host name mentioned at least once (opening and outro)
- Show name mentioned at least once
- CTA in outro: [your call to action]
```

**Forbidden patterns** (anything in this list will fail validation — add yours to `src/validator.ts`)
```
FORBIDDEN IN SPOKEN SCRIPT
- [music cue] — never write music directions in the script
- [production note] — these are for producers, not the voice
- URLs — never read out a web address
- Markdown tables — never format data as a table
```

### Prompt writing tips

- **Be specific, not vague.** "Cover the economy" fails. "Check the Bureau of Labor Statistics (bls.gov) press releases from the last 48 hours for jobs, inflation, and wage data" succeeds.
- **Tell it what to do when there's no news.** "If there are no new BLS releases, cover the most recent economic indicator and what it means for working people."
- **Give it your tone in examples.** Copy 2–3 sentences from a script you love and say "this is the tone: [example]."
- **Set depth targets.** "This section should be 200–300 words" is more reliable than "cover this thoroughly."
- **Build collision detection in.** Tell the AI explicitly: "Never repeat a fact, statistic, or story in more than one section."

---

## Step 7 — Update the validator for your show

Open `src/validator.ts`. These are the checks that must match your show:

**Line ~82 — opening phrase check:**
The Morning Cup requires "Good morning, today is". Change to match your show's opening.

**Line ~98 — spacer count floor:**
Change `spacerCount < 23` to match your section count minus 1.
(If your show has 15 sections, set `spacerCount < 14`)

**Word count floors/ceilings** are read from `wrangler.toml` — no code change needed.

**Forbidden patterns** (line ~7): Add any words or phrases that should never appear in your show's script. The validator will reject any episode containing them.

---

## Step 8 — Create your sound assets

You need 4 audio files in `~/Documents/[YourShow]/Sounds/` on your Mac.

| File | What it is | How to get it |
|------|-----------|---------------|
| `Hello.mp3` | Intro theme — plays before anything else | Commission from a composer, license a track, or generate with AI music tools (Suno, Udio). Should match your show's tone. |
| `Coffee Pour.wav` | Ambient sound or brief foley | Optional — can be any 1–3 second ambience clip, or skip it entirely (edit build-episode.sh to remove it) |
| `Topic Transition.mp3` | Section sting — ~2 seconds | ElevenLabs or a short composed sting. This plays between every section. |
| `Goodbye.mp3` | Outro theme — plays last | Can be the same as Hello.mp3, faded differently |

**All filenames are case-sensitive and must match exactly.**

If your sound files have different names, update `scripts/build-episode.sh`:
```bash
INTRO_SONG="$SOUNDS/YourIntroName.mp3"    # line ~63
OUTRO="$SOUNDS/YourOutroName.mp3"          # line ~67
```

Also update `scripts/write-chapters.py`:
```python
intro_song = os.path.join(sounds_dir, "YourIntroName.mp3")   # line ~72
```

---

## Step 9 — Set secrets and deploy

**Your developer does this.**

```bash
cd your-show-generator/

# Install dependencies
npm install

# Log into Cloudflare (one time)
wrangler login

# Set secrets — paste value at each prompt
wrangler secret put OPENAI_API_KEY
wrangler secret put ELEVENLABS_API_KEY
wrangler secret put ELEVENLABS_VOICE_ID     # paste the Voice ID from Step 2
wrangler secret put RESEND_API_KEY
wrangler secret put RUN_SECRET              # make up a long random password

# Create the R2 bucket (if using a dedicated bucket for your show)
wrangler r2 bucket create your-show-bucket-name

# Create the KV namespace
wrangler kv namespace create YOUR_SHOW_KV
# Paste the returned id into wrangler.toml under [[kv_namespaces]]

# Deploy
wrangler deploy
```

---

## Step 10 — Set up your local Scripts folder

```bash
# Create your show's working folders
mkdir -p "$HOME/Documents/[Your Show Name]/Sounds"
mkdir -p "$HOME/Documents/[Your Show Name]/Scripts"
mkdir -p "$HOME/Documents/[Your Show Name]/Chunks"
mkdir -p "$HOME/Documents/[Your Show Name]/Episodes"

# Copy the helper scripts
cd your-show-generator/
cp scripts/build-episode.sh \
   scripts/write-chapters.py \
   scripts/fetch-chunks.sh \
   scripts/generate-transcript.py \
   "$HOME/Documents/[Your Show Name]/Scripts/"
chmod +x "$HOME/Documents/[Your Show Name]/Scripts/"*.sh
```

Then create a `.env` file:
```bash
cat > "$HOME/Documents/[Your Show Name]/.env" <<'EOF'
RUN_SECRET="your-run-secret-from-step-9"
GROQ_API_KEY="gsk_..."    # optional, for cheap transcription
EOF
chmod 600 "$HOME/Documents/[Your Show Name]/.env"
```

---

## Step 11 — Test your first episode

```bash
# Trigger a test run for today
curl -X POST "https://your-worker-name.your-account.workers.dev/run" \
  -H "Authorization: Bearer YOUR_RUN_SECRET"

# Check status
curl -H "Authorization: Bearer YOUR_RUN_SECRET" \
  "https://your-worker-name.your-account.workers.dev/status"
```

**Common first-run failures:**

| Error | Fix |
|-------|-----|
| Word count too low | Add more sections or increase depth targets in your prompt |
| Missing spacers | Count your sections and make sure your prompt requires N-1 spacers |
| Validation: "Script must include show title" | Make sure your prompt says the show name must appear in the script |
| ElevenLabs 401 | Check that ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID secrets are set correctly |
| Script opens with wrong phrase | Update the opening phrase check in `src/validator.ts` line ~82 |
| JSON parse failure | Your prompt needs a clearer JSON output instruction; check the rejected JSON in R2 under `your-prefix/rejected/` |

---

## Step 12 — Tune your voice settings

After your first successful episode, listen carefully and tune these in `wrangler.toml`:

| Setting | Effect | Start here |
|---------|--------|------------|
| `VOICE_STABILITY` | Lower = more expressive, more variation. Higher = more consistent, less dynamic. | 0.35 |
| `VOICE_SIMILARITY_BOOST` | How closely to match the cloned voice. Too high = robotic. | 0.85 |
| `VOICE_STYLE` | Style intensity. Higher = more pronounced delivery style. | 0.70 |

After changing: `wrangler deploy` then test again. No code changes needed.

---

## Step 13 — Updating your show going forward

Any time you pull code updates from GitHub:

```bash
cd your-show-generator/
git fetch origin
git pull origin main

npm install          # always — keeps the lock file in sync
wrangler deploy

# Copy updated scripts
cp scripts/build-episode.sh scripts/write-chapters.py \
   scripts/fetch-chunks.sh scripts/generate-transcript.py \
   "$HOME/Documents/[Your Show Name]/Scripts/"
```

---

## Quick reference — files you changed from the original

| File | What you changed |
|------|-----------------|
| `wrangler.toml` | Show name, host name, R2 prefix, Worker name, voice settings, runtime targets |
| `src/prompt.ts` | Complete rewrite — your editorial voice, topics, sections, research sources |
| `src/validator.ts` | Opening phrase check, spacer count floor, any show-specific forbidden patterns |
| `scripts/build-episode.sh` | Sound file names (if different from Hello/Goodbye) |
| `scripts/write-chapters.py` | Intro song name (if different) |

**Everything else is identical to The Morning Cup.** The infrastructure, chunker, TTS client, description generator, AI disclosure, manifest builder, and all scripts work the same for any show.

---

## Need help?

- Something failed? → `docs/TROUBLESHOOTING.md`
- Want to tune the AI output? → `docs/TUNING.md`
- Setting up for a team? → `docs/TEAM-SHARING.md`
- Voice settings reference → `docs/TUNING.md`
