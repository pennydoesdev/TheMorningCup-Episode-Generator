# Publishing — Google Drive + WordPress Draft

Once a worker run completes, the publishing pipeline:

1. Generates a **400–500 word episode description** via OpenAI from the
   manifest + social copy + script.
2. Uploads **chunks, transcripts, and metadata** to Google Drive in
   `<root>/<YYYY-MM-DD>/` and `<root>/<YYYY-MM-DD>/chunks/`.
3. Creates a **draft WordPress post** (Seriously Simple Podcasting custom
   post type `serve_episode`) on `thepennytribune.com`, tagged to the
   "Podcast Show" taxonomy with term *The Morning Cup*.

The final stitched MP3 is rendered locally by `build-episode.sh` and
then:
- pushed to the same Drive folder by `push-final-to-drive.py`
- uploaded to the R2 audio bucket and attached to the WP draft (with
  Apollo `_ep_*` meta) by `upload-audio.py`

After both steps, the draft in WordPress has the audio URL plus full
runtime/file-size/MIME metadata, ready for review and one-click publish.

For the bird's-eye view of the whole pipeline including the planned
Publer auto-social plugin, see [PIPELINE.md](./PIPELINE.md).

The publishing step is **best-effort** — if any of the three sub-steps
fails (Drive auth, WP credentials, OpenAI rate-limit), the worker run
itself still succeeds, the chunks stay in R2, and the failure shows up in
`wrangler tail` so you can re-run.

---

## One-time setup

### 1. Service account (Google Drive)

If you haven't yet, walk through it:

1. [Google Cloud Console](https://console.cloud.google.com) → New Project
   → name `Morning Cup Pipeline`.
2. Top search: **Google Drive API** → Enable.
3. **APIs & Services → Credentials → + Create Credentials → Service
   account**. Name `morning-cup-uploader`. Skip the optional role steps.
4. Click the new service account → **Keys** tab → **Add Key → Create new
   key → JSON**. The file downloads (named like
   `morning-cup-pipeline-XXXXXXXX.json`).
5. Note the service account's email (looks like
   `morning-cup-uploader@morning-cup-pipeline.iam.gserviceaccount.com`).
   Open your destination Drive folder
   ([`1FNlBn7…`](https://drive.google.com/drive/folders/1FNlBn7-pYJLnd3ORFCDeli5f7Z9C8yoM))
   → **Share** → paste that email → role **Editor** → Send.

### 2. Save the service account JSON locally (for the final-MP3 push step)

```bash
mkdir -p "$HOME/Documents/The Morning Cup/.secrets"
mv ~/Downloads/morning-cup-pipeline-*.json \
   "$HOME/Documents/The Morning Cup/.secrets/google-drive-key.json"
chmod 600 "$HOME/Documents/The Morning Cup/.secrets/google-drive-key.json"

cat >> "$HOME/Documents/The Morning Cup/.env" <<'ENVEOF'
GOOGLE_DRIVE_FOLDER_ID="1FNlBn7-pYJLnd3ORFCDeli5f7Z9C8yoM"
GOOGLE_DRIVE_KEY_PATH="$HOME/Documents/The Morning Cup/.secrets/google-drive-key.json"
ENVEOF
chmod 600 "$HOME/Documents/The Morning Cup/.env"
```

The local Python helpers need three packages — `cryptography` (JWT
signing for Drive), `boto3` (R2 audio upload), and `requests` (WP REST):

```bash
python3 -m pip install --user --break-system-packages cryptography boto3 requests
```

### 2b. S3 audio bucket credentials (for upload-audio.py)

`upload-audio.py` uploads the final MP3 to the S3 audio bucket the
Apollo plugin reads from, then PATCHes the WP draft's `_ep_audio_url`
and related meta. It needs AWS credentials with `s3:PutObject` on the
audio bucket. Add these to `~/Documents/The Morning Cup/.env`:

```bash
cat >> "$HOME/Documents/The Morning Cup/.env" <<'ENVEOF'
S3_ACCESS_KEY="<AWS access key with PutObject on the audio bucket>"
S3_SECRET_KEY="<matching AWS secret>"
S3_REGION="us-east-1"
S3_BUCKET="<bucket name, same as APOLLO_S3_BUCKET in wp-config>"
S3_CF_URL="<CloudFront URL, e.g. https://d1abc.cloudfront.net>"
WP_URL="https://thepennytribune.com"
WP_USERNAME="systems"
WP_APP_PASSWORD="<same value as the Cloudflare WP_APP_PASSWORD secret>"
ENVEOF
chmod 600 "$HOME/Documents/The Morning Cup/.env"
```

These mirror the Apollo plugin's `APOLLO_S3_*` constants in your
wp-config.php — same AWS account, same bucket, same CloudFront
distribution. You can reuse the existing access key, or create a new
IAM user scoped to just `s3:PutObject` on this bucket.

If `S3_CF_URL` is empty, the script falls back to the direct S3 URL
(`https://<bucket>.s3.<region>.amazonaws.com/<key>`) — but for
production you'll want CloudFront for caching and HTTPS.

### 3. Set the Cloudflare worker secrets

The worker needs both the service-account JSON (for Drive uploads) and
your WordPress Application Password (for draft creation). These are
encrypted secrets — paste-once, never visible again.

From the repo working directory:

```bash
cd "$HOME/Documents/The Morning Cup/Generator"

# Service account JSON — when prompted, paste the FULL contents of the
# JSON file you downloaded (open it in TextEdit, ⌘A, ⌘C, then ⌘V into
# the wrangler prompt and hit Enter).
wrangler secret put GOOGLE_SERVICE_ACCOUNT_KEY

# WordPress Application Password — paste the value when prompted.
wrangler secret put WP_APP_PASSWORD
```

Verify both are set:

```bash
wrangler secret list
```

You should see both `GOOGLE_SERVICE_ACCOUNT_KEY` and `WP_APP_PASSWORD`
along with the others (`OPENAI_API_KEY`, `ELEVENLABS_API_KEY`, etc.).

### 4. Variables in `wrangler.toml`

These are already set with sensible defaults:

```toml
ENABLE_PUBLISHING        = "true"
GOOGLE_DRIVE_FOLDER_ID   = "1FNlBn7-pYJLnd3ORFCDeli5f7Z9C8yoM"
WP_URL                   = "https://thepennytribune.com"
WP_USERNAME              = "systems"
WP_CPT_SLUG              = "serve_episode"
WP_PODCAST_SHOW_TAXONOMY = "serve_podcast_category"
WP_PODCAST_SHOW_TERM     = "The Morning Cup"
```

To change any of them, edit `wrangler.toml` and `wrangler deploy`.

### 5. Deploy

```bash
wrangler deploy
```

Cloudflare's auto-deploy on `git push` to `main` will also work — the
deploy on push picks up the new code automatically.

---

## What gets created

Per successful worker run:

**Google Drive**
```
<your shared root>/
  2026-05-01/
    The Morning Cup - 2026-05-01.txt
    The Morning Cup - 2026-05-01.html
    The Morning Cup - 2026-05-01.json
    The Morning Cup - 2026-05-01 - manifest.json
    The Morning Cup - 2026-05-01.mp3        ← added by push-final-to-drive.py
    chunks/
      The Morning Cup - 2026-05-01 - 001.mp3
      …
      The Morning Cup - 2026-05-01 - NNN.mp3
```

**WordPress** (`https://thepennytribune.com/wp-admin/edit.php?post_type=serve_episode`)
- Status: **Draft**
- Title: e.g. *"The Morning Cup — Friday, May 1st, 2026"*
- Content: AI-generated 400–500 word episode description
- Excerpt: the main social post from the JSON
- Podcast Show: *The Morning Cup* (resolved by name to its term ID in
  `serve_podcast_category`)

Audio file URL is **not** auto-attached — you upload the MP3 via your
theme's existing S3 uploader during draft review, then publish.

---

## How the pipeline runs

End-to-end automated path (after 5 AM ET cron):

```
┌── 5 AM cron fires worker ─────────────────┐
│  generate -> validate -> repair if needed │
│  -> TTS x4 -> R2                          │
│  -> generatePostBody (OpenAI)             │
│  -> uploadEpisodeToDrive (chunks + meta)  │
│  -> createWordPressDraft                  │
└────────────────────────────────────────────┘
                       │
                       ▼
       ~/Documents/The Morning Cup/Scripts/morning-cup.sh fetch
       ~/Documents/The Morning Cup/Scripts/morning-cup.sh build
                       │
                       ▼
       build-episode.sh assembles + tags + chapters
       push-final-to-drive.py uploads final MP3 to Drive folder
                       │
                       ▼
       You open the WP draft, attach the audio via theme uploader,
       publish.
```

## Manually re-publishing an episode

If a publish step failed and you want to re-run just the publish, use
`?force=true` against the `/run` endpoint — that re-fires the entire
pipeline including publishing. There's no separate "publish only"
endpoint yet.

If you want to add one, ping me — it'd be a 30-min change.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `wrangler tail` shows `publish: drive upload failed` with `403` | Service account not added as Editor to the destination Drive folder |
| `publish: drive upload failed` with `404` | `GOOGLE_DRIVE_FOLDER_ID` wrong or folder is in a Shared Drive without permission propagation |
| `publish: wp draft failed` with `401` | `WP_APP_PASSWORD` wrong or revoked. Regenerate from WP profile + `wrangler secret put WP_APP_PASSWORD` again |
| `publish: wp draft failed` with `404 rest_no_route` | `WP_CPT_SLUG` doesn't match — verify with `curl https://thepennytribune.com/wp-json/wp/v2/types` |
| `publish: wp draft failed` with `403 rest_cannot_create` | The `systems` user doesn't have `edit_posts` on the CPT. Bump role to Editor or grant the capability via the SSP plugin's settings |
| Drafts created but the Podcast Show dropdown is empty | The taxonomy slug is different. Check `curl https://thepennytribune.com/wp-json/wp/v2/taxonomies` and update `WP_PODCAST_SHOW_TAXONOMY` |
| `publish: body generation failed` | OpenAI rate-limit or transient. Falls back to social-copy concatenation; the WP draft still gets created |

## Costs added by publishing

| Line | Per run | Per month (daily) |
|---|---|---|
| OpenAI body generation (~3k input + 1k output) | ~$0.01 | ~$0.30 |
| Google Drive API | $0 (free quota covers this volume comfortably) | $0 |
| WordPress REST | $0 | $0 |

So publishing adds about **30 cents per month** to the existing pipeline cost.

## Disabling publishing temporarily

```toml
# wrangler.toml
ENABLE_PUBLISHING = "false"
```

Then `wrangler deploy`. The worker still produces chunks and writes
them to R2; just the post-run publishing step is skipped.
