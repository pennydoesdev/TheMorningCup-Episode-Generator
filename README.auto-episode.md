# Auto-Episode

Production-ready Cloudflare Worker codebase for generating, validating,
synthesizing, assembling, and publishing daily/weekly podcast episodes.
**One codebase, many shows.** Each show is its own worker deployment
sharing the same engine.

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

## Adding a new show

```
/create-show
```

Run that slash command in Claude Code (in a clone of this repo). The
command will:

1. Ask for the WordPress `serve_podcast` post ID for the new show.
2. Pull metadata from WordPress (title, host, copyright, taxonomy term)
   automatically.
3. Print a short variables file with only the values that couldn't be
   discovered — voice ID, Drive folder, Cloudflare worker / KV / R2
   names, schedule, topic flow, sound filenames, and the master prompt.
4. After you fill those in and paste back, generate:
   - `shows/<show-key>/config.ts`
   - `shows/<show-key>/prompt.ts`
   - `wrangler.<show-key>.toml`
   - Updates `src/show.ts` registry
5. Print a checklist of remaining manual steps (set worker secrets,
   share Drive folder with service account, push sound assets to
   `assets/sounds/<show-key>/`, deploy).

Full walkthrough: [docs/ADD-NEW-SHOW.md](./docs/ADD-NEW-SHOW.md).

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
│       ├── example/                         reference sound files
│       └── <show-key>/                     real per-show audio assets
├── scripts/
│   ├── new-show-template.txt               variables file /create-show prints
│   ├── build-episode.sh                    local: pull chunks + ffmpeg assemble
│   ├── fetch-chunks.sh                     local: pull from R2
│   ├── upload-audio.py                     local: S3 upload + WP attach
│   ├── push-final-to-drive.py              local: final MP3 to Drive
│   ├── write-chapters.py                   local: ID3 chapter markers
│   └── morning-cup.sh                      local: wrapper subcommands
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

## Documentation index

| Doc | What's in it |
|-----|--------------|
| [docs/ADD-NEW-SHOW.md](./docs/ADD-NEW-SHOW.md) | The `/create-show` flow + variables reference |
| [docs/PIPELINE.md](./docs/PIPELINE.md) | Architecture diagrams (mermaid) |
| [docs/PUBLISHING.md](./docs/PUBLISHING.md) | Drive + WP draft setup |
| [docs/PRODUCTION-WORKFLOW.md](./docs/PRODUCTION-WORKFLOW.md) | Daily morning routine |
| [docs/CHAPTERS.md](./docs/CHAPTERS.md) | MP3 chapter markers + platform support |
| [docs/TROUBLESHOOTING.md](./docs/TROUBLESHOOTING.md) | Common errors → fixes |
| [docs/CHANGELOG.md](./docs/CHANGELOG.md) | What's changed |
