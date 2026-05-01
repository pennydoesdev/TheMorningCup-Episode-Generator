# The Morning Cup — Full Pipeline

End-to-end picture of how a single episode goes from "5 AM cron tick" to
"published on the website" with zero human touch other than a final review
click. Components below the dotted line in the architecture diagram are
planned but not built yet — see the bottom of this doc for status.

> **PDF version:** mermaid diagrams render natively on GitHub. To export
> this page as a PDF, open it on GitHub and use your browser's *File →
> Print → Save as PDF*. For a polished PDF with mermaid baked in:
>
> ```bash
> # On macOS:
> brew install pandoc librsvg basictex
> # Cache fonts:
> sudo tlmgr install collection-fontsrecommended
> # Render:
> pandoc docs/PIPELINE.md -o pipeline.pdf \
>   --pdf-engine=xelatex \
>   --filter=mermaid-filter
> ```

---

## High-level architecture

```mermaid
flowchart TD
  Cron(["Cloudflare Cron — 5 AM ET"]) --> Worker
  subgraph Worker["Cloudflare Worker (themorningcupgenerator)"]
    Gen[Generate script via OpenAI + web_search]
    Val[Validate word count / structure]
    Rep[Repair pass]
    Ext[Length-extend pass]
    TTS[ElevenLabs TTS — 4 chunks in parallel]
    Pub[Publish step]
    Gen --> Val --> Rep --> Ext --> TTS --> Pub
  end
  Worker --> R2C[(R2 — chunks/manifest/txt/html/json)]
  Worker --> OpenAI2[OpenAI — body gen]
  Worker --> Drive1[(Google Drive folder)]
  Worker --> WP1[WordPress — serve_episode draft]

  R2C -.->|fetch-chunks.sh| Mac
  subgraph Mac["Local Mac"]
    Build[build-episode.sh]
    Build --> FF[ffmpeg concat + ID3 + chapters]
    FF --> Final[(Final MP3 in Episodes/)]
    FF --> PushDrive[push-final-to-drive.py]
    FF --> UploadAudio[upload-audio.py]
  end
  PushDrive --> Drive2[(Google Drive — same dated folder)]
  UploadAudio --> R2A[(R2 audio bucket — Apollo plugin)]
  UploadAudio --> WP2[WP draft updated with _ep_audio_url + meta]

  WP2 --> Reviewer{Penelope reviews + clicks Publish}
  Reviewer --> RSS[RSS feed publishes]
  Reviewer --> SocialPlanned[Publer plugin — auto social drafts]
  RSS --> Listeners[Listeners — Apple, Spotify, etc.]
  SocialPlanned -.->|future| Social[Facebook / Threads / Instagram / X drafts in Publer]

  classDef future stroke-dasharray: 5 5,fill:#fff8e1
  class SocialPlanned,Social future
```

---

## Component breakdown

### 1. Cloudflare Worker — content generation

Runs once daily at 5:00 AM `America/New_York`. The cron handler in
`src/index.ts:scheduled` ticks every UTC hour 9–11 and fires only when
the local hour is 5 (handles DST automatically).

```mermaid
sequenceDiagram
  autonumber
  participant Cron as Cloudflare Cron
  participant W as Worker
  participant OAI as OpenAI Responses + web_search
  participant V as Validator
  participant Rep as Repair / Extend
  participant EL as ElevenLabs TTS
  participant R2 as Cloudflare R2 (morning-cup)

  Cron->>W: 5 AM ET trigger
  W->>OAI: generate strict-JSON script (with web_search)
  OAI-->>W: episode JSON
  W->>V: validate (word count, runtime, structure)
  alt validation fails
    W->>Rep: repair pass
    Rep-->>W: revised episode
    W->>V: re-validate
    alt still under length
      W->>Rep: extend pass (named sections)
      Rep-->>W: extended episode
      W->>V: re-validate
    end
  end
  W->>R2: write chunks/, manifest, txt, html, json
  par (parallel x4 TTS)
    W->>EL: chunk 1
    W->>EL: chunk 2
    W->>EL: chunk 3
    W->>EL: chunk 4
  end
  EL-->>R2: ordered MP3 chunks
```

**Output to R2** under `morning-cup/<DATE>/`:
- `chunks/001.mp3 … NNN.mp3`
- `The Morning Cup - <DATE>.txt` (clean script for show notes)
- `The Morning Cup - <DATE>.html`
- `The Morning Cup - <DATE>.json` (full episode object including chapters)
- `The Morning Cup - <DATE> - manifest.json` (canonical metadata)
- `run.json` (run state record)

### 2. Cloudflare Worker — publish step

Immediately after a successful run, the worker pushes artifacts out and
creates a WordPress draft. All sub-steps are best-effort; a failure here
does NOT fail the worker run.

```mermaid
sequenceDiagram
  autonumber
  participant W as Worker
  participant OAI as OpenAI (body gen)
  participant GD as Google Drive
  participant WP as WordPress REST

  W->>OAI: generate 400–500 word post body
  OAI-->>W: body text

  Note over W,GD: Service-account JWT auth
  W->>GD: create folder <DATE>/
  W->>GD: upload txt, html, json, manifest
  W->>GD: create chunks/ subfolder
  loop each chunk
    W->>GD: upload chunk MP3
  end

  Note over W,WP: Basic auth (Application Password)
  W->>WP: POST /wp-json/wp/v2/serve_episode
  Note right of WP: title, status=draft, content (body),<br/>excerpt (main social post),<br/>serve_podcast_category=[term-id],<br/>meta._ep_podcast_id=2616,<br/>meta._ep_episode_type="full",<br/>meta._ep_explicit=false
  WP-->>W: { id, link }
```

### 3. Local Mac — assembly and upload

You (or the daily Apple Shortcut) runs the local pipeline after the
worker finishes. ~30 seconds of human time.

```mermaid
sequenceDiagram
  autonumber
  participant U as You (or Shortcut)
  participant FC as fetch-chunks.sh
  participant R2 as R2 (morning-cup)
  participant BE as build-episode.sh
  participant FF as ffmpeg
  participant Tag as write-chapters.py
  participant PD as push-final-to-drive.py
  participant UA as upload-audio.py
  participant GD as Google Drive
  participant R2A as R2 (audio bucket)
  participant WP as WordPress REST

  U->>FC: fetch-chunks.sh <DATE>
  FC->>R2: download manifest + 22 chunks
  R2-->>FC: files into Chunks/<DATE>/
  U->>BE: build-episode.sh <DATE>
  BE->>FF: normalize + concat (Sounds/ + Chunks/)
  FF-->>BE: Episodes/The Morning Cup - <DATE>.mp3
  BE->>Tag: write CTOC + CHAP markers
  Tag-->>BE: chapters embedded
  BE->>PD: push-final-to-drive.py
  PD->>GD: upload final MP3 into <DATE>/
  BE->>UA: upload-audio.py <DATE>
  UA->>R2A: PUT podcast/YYYY/MM/the-morning-cup-<DATE>-<ts>.mp3
  UA->>WP: search serve_episode draft by title
  WP-->>UA: { id }
  UA->>WP: POST .../serve_episode/<id> with _ep_audio_url + meta
  WP-->>UA: 200 OK
```

### 4. WordPress — Apollo plugin

```mermaid
flowchart LR
  Draft[serve_episode draft\nstatus=draft\n_ep_podcast_id=2616\n_ep_audio_url set] -->|review + publish| Pub[serve_episode published]
  Pub --> RSS[/feed/podcast/the-morning-cup/]
  Pub --> Hub[Custom media hub UI]
  RSS --> Apple[Apple Podcasts]
  RSS --> Spotify[Spotify]
  RSS --> Overcast[Overcast]
  RSS --> Pocket[Pocket Casts]
```

The post type `serve_episode` is registered by the Apollo plugin with
these meta fields exposed to the REST API:

| Meta key | Set by | Value |
|----------|--------|-------|
| `_ep_podcast_id` | Worker | `2616` (parent serve_podcast: The Morning Cup) |
| `_ep_episode_type` | Worker | `"full"` |
| `_ep_explicit` | Worker | `false` |
| `_ep_audio_url` | Local upload-audio.py | `https://serve.pennycdn.com/podcast/2026/05/...mp3` |
| `_ep_audio_r2_key` | Local upload-audio.py | `podcast/2026/05/the-morning-cup-2026-05-01-…mp3` |
| `_ep_file_size` | Local upload-audio.py | bytes |
| `_ep_mime_type` | Local upload-audio.py | `audio/mpeg` |
| `_ep_duration_sec` | Local upload-audio.py | seconds (ffprobe) |
| `_ep_duration` | Local upload-audio.py | `MM:SS` or `HH:MM:SS` |

### 5. Future — Publer auto social drafts

A separate plugin (`tpt-publer-auto-social-drafts`) hooks the
`transition_post_status` action. When a `serve_episode` is published, it
schedules a WP-Cron job that:

1. Generates a [Short.io](https://short.io) link from the permalink (or
   the configured Podcast Landing Page URL for podcast post types).
2. Calls OpenAI / Gemini to produce platform-specific copy (Facebook,
   Threads, Instagram, X) with hashtags, topic suggestions, etc.
3. Creates **draft** posts in Publer for each enabled platform — both a
   main post and a link-focused follow-up.
4. Saves Publer job IDs back to post meta for de-duplication.

Status: **specced, not built.** When ready, will live as its own GitHub
repo + WP plugin so other Penny Tribune post types (articles, videos,
elections) get the same treatment.

---

## Configuration map

```mermaid
flowchart TB
  WT[wrangler.toml vars] --> W
  WS[wrangler secrets] --> W
  ENV[~/Documents/The Morning Cup/.env] --> Local[Local scripts]
  SVC[~/.../.secrets/google-drive-key.json] --> Local
  WPCONF[wp-config.php constants] --> WPS[WordPress / Apollo plugin]
  DBO[wp_options] --> WPS

  W[Worker]
  Local --> R2A
  Local --> WP
  W --> R2C
  W --> Drive
  W --> WP

  classDef cfg fill:#e3f2fd
  class WT,WS,ENV,SVC,WPCONF,DBO cfg
```

### Worker side (`wrangler.toml` + `wrangler secret put`)

| Variable | Type | Purpose |
|----------|------|---------|
| `OPENAI_MODEL` | var | Currently `gpt-5-mini` |
| `WORKER_TIMEZONE` | var | `America/New_York` |
| `MIN_SCRIPT_WORDS` / `TARGET_*` | var | Validator thresholds |
| `MAX_TTS_CHARS_PER_CHUNK` | var | ElevenLabs chunking limit |
| `ENABLE_PUBLISHING` | var | `true` to push Drive + create WP drafts |
| `GOOGLE_DRIVE_FOLDER_ID` | var | Shared destination folder ID |
| `WP_URL` / `WP_USERNAME` | var | WordPress endpoint + login |
| `WP_CPT_SLUG` | var | `serve_episode` |
| `WP_PODCAST_SHOW_TAXONOMY` | var | `serve_podcast_category` |
| `WP_PODCAST_SHOW_TERM` | var | `The Morning Cup` |
| `WP_PARENT_PODCAST_ID` | var | `2616` |
| `HOST_NAME` | var | `Penelope Rose` |
| `PUBLISHER` / `COPYRIGHT_HOLDER` | var | ID3 metadata defaults |
| **secret** `OPENAI_API_KEY` | secret | OpenAI auth |
| **secret** `ELEVENLABS_API_KEY` / `ELEVENLABS_VOICE_ID` | secret | TTS auth |
| **secret** `GOOGLE_SERVICE_ACCOUNT_KEY` | secret | Drive auth (full JSON) |
| **secret** `WP_APP_PASSWORD` | secret | WordPress draft creation |
| **secret** `RUN_SECRET` | secret | Gates `POST /run` |

### Local side (`~/Documents/The Morning Cup/.env`)

| Variable | Purpose |
|----------|---------|
| `RUN_SECRET` | Same value as Cloudflare; used by `morning-cup.sh` to fire the worker manually |
| `GOOGLE_DRIVE_FOLDER_ID` | Same value as Cloudflare; used by `push-final-to-drive.py` |
| `GOOGLE_DRIVE_KEY_PATH` | Path to the service-account JSON locally |
| `R2_ACCOUNT_ID` | Cloudflare account ID for R2 audio bucket |
| `R2_AUDIO_ACCESS_KEY_ID` | R2 access key with PutObject on the audio bucket |
| `R2_AUDIO_SECRET_ACCESS_KEY` | matching secret |
| `R2_AUDIO_BUCKET` | Audio R2 bucket name (the one the Apollo plugin reads) |
| `R2_AUDIO_PUBLIC_URL` | e.g. `https://serve.pennycdn.com` |
| `WP_URL` | `https://thepennytribune.com` |
| `WP_USERNAME` | `systems` |
| `WP_APP_PASSWORD` | Application Password (same value as the worker secret) |

---

## Daily ops flow (the actual human routine)

```mermaid
journey
  title Penelope's morning
  section Background (no human touch)
    5:00 AM cron fires: 5: Worker
    Generation + TTS: 5: Worker
    Drive folder created: 5: Worker
    WP draft created: 5: Worker
  section Penelope's 1 minute
    Run Apple Shortcut (⌃⌥⌘ B): 4: Penelope
    build-episode.sh assembles + uploads: 5: Mac
    Open WP draft: 4: Penelope
    Review + publish: 5: Penelope
  section After publish (auto)
    RSS feed updates: 5: Apollo
    Listeners hear it: 5: Listeners
    Publer drafts (when built): 5: Publer plugin
```

---

## Failure modes + recovery

```mermaid
flowchart LR
  R[Worker run failed] -->|status=failed in run record| Look[Check wrangler tail logs]
  Look --> A1{What stage?}
  A1 -->|generating| Refire1[curl /run with force=true]
  A1 -->|tts| Refire1
  A1 -->|publishing| Skip[Chunks safe in R2.\nRe-publish manually]

  P[Publish sub-step failed] -->|Drive 403| FixPerm[Re-share Drive folder with service account]
  P -->|WP 401| RotatePW[Rotate WP App Password]
  P -->|WP 404| ConfirmCPT[Confirm WP_CPT_SLUG matches]

  L[Local upload failed] -->|R2 auth| FixR2[Check .env R2 keys]
  L -->|WP draft missing| Wait[Worker hasn't created it yet — wait or re-fire]
  L -->|wrong post matched| RenameCheck[Title format must match — see upload-audio.py]
```

Detailed troubleshooting matrix: [TROUBLESHOOTING.md](./TROUBLESHOOTING.md).

---

## Cost summary

| Line | Per run | Per month (daily) |
|------|---------|-------------------|
| OpenAI (gpt-5-mini, ~7k in / 6k out) | ~$0.05 | ~$1.50 |
| OpenAI web_search (8–15 calls) | ~$0.30–0.50 | ~$10–15 |
| OpenAI body gen | ~$0.01 | ~$0.30 |
| ElevenLabs TTS (~22k chars) | depends on plan | $22–99 base + overage |
| Cloudflare Workers + R2 + KV | ~$0 | <$1 |
| Google Drive API | $0 | $0 |
| WordPress REST | $0 | $0 |
| **Total compute** | | **~$30–115** |
| Publer subscription (when added) | — | $9–24 |
| Short.io subscription (when added) | — | $0–20 |

ElevenLabs is the dominant variable. At Pro tier (`$99/mo`, 500k chars
included) you'll be slightly under or just over depending on episode
length.
