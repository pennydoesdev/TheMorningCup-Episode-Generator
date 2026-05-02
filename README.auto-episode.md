# Auto-Episode

Production-ready Cloudflare Worker codebase for generating, validating,
synthesizing, assembling, and publishing daily/weekly podcast episodes.
**One codebase, many shows.** Each show is its own worker deployment
sharing the same engine.

---

## Getting started — your first run-through

If this is your first time landing on the repo, do these steps in order.
Each one is a single command or one click.

### 1. Clone this repo to your Mac

```bash
git clone https://github.com/Penny-Constellation/Auto-Episode.git \
  ~/Documents/Auto-Episode-Generator
cd ~/Documents/Auto-Episode-Generator
```

### 2. Install the local dependencies you'll need

```bash
brew install ffmpeg node
npm install -g wrangler
python3 -m pip install --user --break-system-packages mutagen cryptography boto3 requests
```

### 3. Set up your shared internal credentials (one-time, used across all shows)

Create `~/.auto-episode/.env` with the org-wide values:

```bash
mkdir -p ~/.auto-episode
cat > ~/.auto-episode/.env <<'ENVEOF'
WP_URL="https://thepennytribune.com"
WP_USERNAME="systems"
WP_APP_PASSWORD="<your WP application password — keep the spaces>"
S3_ACCESS_KEY="<from your AWS IAM uploader>"
S3_SECRET_KEY="<matching AWS secret>"
S3_REGION="us-east-2"
S3_BUCKET="<your audio S3 bucket>"
S3_CF_URL="<your CloudFront URL>"
GOOGLE_DRIVE_KEY_PATH="$HOME/.auto-episode/google-drive-key.json"
ENVEOF
chmod 600 ~/.auto-episode/.env
```

Place your Google service-account JSON at the path above:

```bash
mv ~/Downloads/<your-service-account>.json ~/.auto-episode/google-drive-key.json
chmod 600 ~/.auto-episode/google-drive-key.json
```

Authenticate Wrangler:

```bash
wrangler login
```

### 4. Create your first show

Open this repo in [Claude Code](https://claude.ai/code) and run:

```
/create-show
```

The slash command will:

1. List every existing `serve_podcast` post in your WordPress site.
2. Ask you to pick the ID of the show you want to set up. (If the show
   doesn't exist in WP yet, type `new` and Claude will pause so you can
   create it first.)
3. Pull metadata from WP automatically (title, host, copyright, taxonomy
   term).
4. Print a short variables block for the values it couldn't auto-discover
   — voice ID, Drive folder, Cloudflare worker name, master prompt, etc.
5. After you fill those in and paste back, generate:
   - `shows/<show-key>/config.ts`
   - `shows/<show-key>/prompt.ts`
   - `wrangler.<show-key>.toml`
   - Updated `src/show.ts` registry entry

Then it prints a manual checklist for the rest:
- Push sound assets to `assets/sounds/<show-key>/`
- Set per-worker secrets via `wrangler secret put`
- Share the Drive folder with the service account
- Deploy with `wrangler deploy --config wrangler.<show-key>.toml`

Full walkthrough: [docs/ADD-NEW-SHOW.md](./docs/ADD-NEW-SHOW.md).

### 5. Daily morning routine (after your show is live)

Once a show is generating episodes daily via cron, your morning workflow
is two commands per show:

```bash
scripts/fetch-chunks.sh <show-key>
scripts/build-episode.sh <show-key>
```

Then open the WordPress draft, review, hit Publish.

Full daily-ops doc: [docs/PRODUCTION-WORKFLOW.md](./docs/PRODUCTION-WORKFLOW.md).

---

## How it works at a glance

1. A Cloudflare Worker fires on a cron (default 5 AM local).
2. It generates a script via OpenAI's Responses API + the built-in
   `web_search` tool, validates it, and runs repair / length-extend
   passes if needed.
3. ElevenLabs TTS (4 chunks in parallel) synthesizes the script into
   ordered MP3 chunks, written to R2.
4. The worker creates a WordPress draft post (Apollo plugin
   `serve_episode`) tagged to the right `serve_podcast_category` term,
   pre-filled with an AI-generated 400–500 word description.
5. The producer's local script (`build-episode.sh`) stitches the
   chunks with intro / outro / sting sounds into one tagged MP3, embeds
   chapter markers, uploads to S3 / CloudFront, and attaches the audio
   meta to the WordPress draft.
6. Producer reviews the draft and clicks Publish. RSS feed updates
   automatically; Apple Podcasts / Spotify / Overcast pull within their
   refresh interval.

---

## Repository layout

```
Auto-Episode/
├── README.md                              this file
├── package.json
├── tsconfig.json
├── wrangler.example.toml                   reference template
├── wrangler.<show-key>.toml                generated per show by /create-show
├── shows/
│   ├── _template/                          blank template /create-show copies from
│   │   ├── config.ts
│   │   └── prompt.ts
│   ├── example/                            working reference implementation
│   │   ├── config.ts
│   │   └── prompt.ts
│   └── <show-key>/                         one folder per show
│       ├── config.ts
│       └── prompt.ts
├── src/
│   ├── index.ts                            worker fetch + scheduled handlers
│   ├── show.ts                             ShowConfig type + SHOW_REGISTRY
│   ├── config.ts                           loads active show via env.SHOW_KEY
│   ├── prompt.ts                           builds the runtime user prompt
│   ├── openai.ts                           Responses API client + repair + extend
│   ├── elevenlabs.ts                       TTS chunk synthesis
│   ├── chunker.ts                          script -> ordered audio chunks
│   ├── validator.ts                        word count + structural rules
│   ├── manifest.ts                         per-episode metadata
│   ├── publish.ts                          Drive + WP draft creation
│   ├── locks.ts                            run state in KV + R2
│   └── ... (utilities)
├── assets/
│   └── sounds/
│       └── <show-key>/                     real per-show audio assets
│         ├── intro.wav
│         ├── intro-sting.wav
│         ├── section-sting.wav
│         └── outro.wav
├── scripts/
│   ├── new-show-template.txt               variables file /create-show prints
│   ├── build-episode.sh                    local: pull chunks + ffmpeg assemble
│   ├── fetch-chunks.sh                     local: pull from R2
│   ├── upload-audio.py                     local: S3 upload + WP attach
│   ├── push-final-to-drive.py              local: final MP3 to Drive
│   └── write-chapters.py                   local: ID3 chapter markers
├── docs/
│   ├── ADD-NEW-SHOW.md                     how /create-show works
│   ├── PIPELINE.md                         architecture diagrams
│   ├── PUBLISHING.md                       Drive + WP draft setup
│   ├── PRODUCTION-WORKFLOW.md              daily morning routine
│   ├── TROUBLESHOOTING.md                  symptom -> fix matrix
│   ├── CHAPTERS.md                         MP3 chapter markers
│   └── ...
└── .claude/
    └── commands/
        └── create-show.md                  slash command spec
```

---

## Shared internal credentials

The same set of secrets is used across every show in the org:

- `OPENAI_API_KEY` — single OpenAI account
- `ELEVENLABS_API_KEY` — single ElevenLabs account
- `GOOGLE_SERVICE_ACCOUNT_KEY` — single service account JSON; share the
  destination Drive folder per show with the same email
- `WP_APP_PASSWORD` — single Application Password for the `systems`
  WordPress user

Per-show **values** that change for each show:
- `ELEVENLABS_VOICE_ID` (one voice clone per host)
- `GOOGLE_DRIVE_FOLDER_ID`
- WP `serve_podcast` parent post ID
- WP `serve_podcast_category` taxonomy term
- Cloudflare worker name, KV namespace, optional R2 bucket
- `RUN_SECRET` (recommend unique per worker for least-privilege manual
  triggers)
- `MASTER_PROMPT` (entirely different per show)

---

## Documentation index

| Doc | What's in it |
|-----|--------------|
| [docs/ADD-NEW-SHOW.md](./docs/ADD-NEW-SHOW.md) | The `/create-show` flow + variables reference |
| [docs/PRODUCTION-WORKFLOW.md](./docs/PRODUCTION-WORKFLOW.md) | Daily morning routine |
| [docs/PIPELINE.md](./docs/PIPELINE.md) | Architecture diagrams (mermaid) |
| [docs/PUBLISHING.md](./docs/PUBLISHING.md) | Drive + WP draft setup |
| [docs/CHAPTERS.md](./docs/CHAPTERS.md) | MP3 chapter markers + platform support |
| [docs/APPLE-SHORTCUTS.md](./docs/APPLE-SHORTCUTS.md) | Mac menu-bar / hotkey integration |
| [docs/TEAM-SHARING.md](./docs/TEAM-SHARING.md) | Onboarding, asset distribution, secret rotation |
| [docs/TROUBLESHOOTING.md](./docs/TROUBLESHOOTING.md) | Common errors → fixes |

---

## Production status

| Component | Status |
|---|---|
| Worker generation + validation + repair + extend | Verified working |
| ElevenLabs TTS x4 parallel | Verified working |
| Local fetch + build + chapter markers | Verified working |
| Final MP3 → Google Drive | Verified working |
| Final MP3 → S3 / CloudFront | Verified working |
| Audio attached to WP draft | Verified working |
| Multi-show via `/create-show` | Built — exercise it on show #2 |
