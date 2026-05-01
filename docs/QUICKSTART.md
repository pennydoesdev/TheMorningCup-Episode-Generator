# Quickstart — Zero to First Episode

Complete end-to-end setup, every command in a copy-paste block (GitHub
adds a copy button to each one — hover the top-right of any block).

If you're already set up and just want today's morning routine, skip to
[Step 12](#step-12--daily-workflow).

---

## What you'll have when this is done

- Cloudflare worker that fires at 5:00 AM ET every weekday and generates a
  22–25 minute script via OpenAI + web search
- ElevenLabs synthesizes the script into MP3 chunks (parallel x4)
- Chunks land in R2; the worker writes a WordPress draft post (Apollo plugin
  `serve_episode`) and pushes everything to Google Drive
- Local `build-episode.sh` stitches chunks + intro/outro into one tagged MP3
  with chapter markers, uploads it to S3, and attaches it to the WP draft
- Two-command morning: `fetch-chunks.sh` + `build-episode.sh`
- Or a single ⌃⌥⌘ B Apple Shortcut

Total daily human time: ~30 seconds.

---

## Step 1 — Folder structure on your Mac

```bash
mkdir -p "$HOME/Documents/The Morning Cup/Sounds"
mkdir -p "$HOME/Documents/The Morning Cup/Scripts"
mkdir -p "$HOME/Documents/The Morning Cup/Chunks"
mkdir -p "$HOME/Documents/The Morning Cup/Episodes"
mkdir -p "$HOME/Documents/The Morning Cup/.secrets"
chmod 700 "$HOME/Documents/The Morning Cup/.secrets"
```

## Step 2 — Clone the repo

```bash
cd "$HOME/Documents/The Morning Cup"
git clone https://github.com/pennydoesdev/TheMorningCup-Episode-Generator.git Generator
```

To pull updates later:

```bash
cd "$HOME/Documents/The Morning Cup/Generator" && git pull origin main
```

## Step 3 — Mirror helper scripts to your working `Scripts/` folder

```bash
cd "$HOME/Documents/The Morning Cup/Generator"
cp scripts/build-episode.sh        "$HOME/Documents/The Morning Cup/Scripts/"
cp scripts/fetch-chunks.sh         "$HOME/Documents/The Morning Cup/Scripts/"
cp scripts/morning-cup.sh          "$HOME/Documents/The Morning Cup/Scripts/"
cp scripts/write-chapters.py       "$HOME/Documents/The Morning Cup/Scripts/"
cp scripts/push-final-to-drive.py  "$HOME/Documents/The Morning Cup/Scripts/"
cp scripts/upload-audio.py         "$HOME/Documents/The Morning Cup/Scripts/"
chmod +x "$HOME/Documents/The Morning Cup/Scripts/"*.sh
```

Re-run this block any time you `git pull` updates.

## Step 4 — Drop the six sound assets into `Sounds/`

The repo includes them under `assets/sounds/` (private repo). Copy them into your working folder:

```bash
cp "$HOME/Documents/The Morning Cup/Generator/assets/sounds/"*.{wav,mp3} \
   "$HOME/Documents/The Morning Cup/Sounds/" 2>/dev/null

ls -la "$HOME/Documents/The Morning Cup/Sounds/"
```

You should see six files:

```
The Morning Cup - Song.wav
Coffee Pour.wav
Cream or sugar, hon?.mp3
intro-sting.wav
morning-cup-sting.wav
The Morning Cup - Thank You.wav
```

## Step 5 — Install Mac dependencies

```bash
# Homebrew (skip if you already have it — check with `which brew`)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# ffmpeg for audio processing + duration probing
brew install ffmpeg

# Node + Wrangler for Cloudflare deploys + R2 reads
brew install node
npm install -g wrangler

# Python deps for the local pipeline
python3 -m pip install --user --break-system-packages mutagen cryptography boto3 requests
```

Verify:

```bash
which ffmpeg wrangler
python3 -c "import mutagen, boto3, requests, cryptography; print('all good')"
```

## Step 6 — Authenticate Wrangler

```bash
wrangler login
```

A browser window opens. Approve. After this, Wrangler can read R2 and
manage worker secrets.

## Step 7 — Set Cloudflare worker secrets

Five secrets. Each prompts you to paste the value, hit Enter when done.

```bash
cd "$HOME/Documents/The Morning Cup/Generator"

wrangler secret put OPENAI_API_KEY
wrangler secret put ELEVENLABS_API_KEY
wrangler secret put ELEVENLABS_VOICE_ID
wrangler secret put RUN_SECRET
wrangler secret put WP_APP_PASSWORD
```

For the Google service-account JSON (file already in `.secrets/`):

```bash
wrangler secret put GOOGLE_SERVICE_ACCOUNT_KEY \
  < "$HOME/Documents/The Morning Cup/.secrets/google-drive-key.json"
```

Verify all six are set:

```bash
wrangler secret list
```

If you don't have the service-account JSON yet, see [Step 9](#step-9--google-drive-service-account).

## Step 8 — AWS IAM user for S3 audio uploads

In the AWS Console:

1. **IAM → Users → Add user**
   - Name: `morning-cup-uploader`
   - Description: `Programmatic uploader for The Morning Cup daily podcast episodes.`
2. Attach this **inline policy** (Permissions → Add inline policy → JSON):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AudioUploads",
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:AbortMultipartUpload",
        "s3:ListMultipartUploadParts"
      ],
      "Resource": "arn:aws:s3:::pennytribune/audio/*"
    },
    {
      "Sid": "AudioUploadsBucket",
      "Effect": "Allow",
      "Action": ["s3:ListBucketMultipartUploads"],
      "Resource": "arn:aws:s3:::pennytribune"
    }
  ]
}
```

3. **Security credentials → Create access key → Application outside AWS**.
   Save the access key ID + secret — you'll paste them in [Step 10](#step-10--local-env-file).

## Step 9 — Google Drive service account

1. [Google Cloud Console](https://console.cloud.google.com) → New project named `Morning Cup Pipeline`.
2. Search **Google Drive API** → Enable.
3. **APIs & Services → Credentials → Create Credentials → Service account**
   - Name: `morning-cup-uploader`
   - Skip role steps.
4. Click the new service account → **Keys → Add Key → Create new key → JSON**. A `.json` file downloads.
5. Move it into your `.secrets/` folder:

```bash
mv ~/Downloads/morning-cup-pipeline-*.json \
   "$HOME/Documents/The Morning Cup/.secrets/google-drive-key.json"
chmod 600 "$HOME/Documents/The Morning Cup/.secrets/google-drive-key.json"
```

6. Open the JSON and copy the `client_email` value (looks like
   `morning-cup-uploader@morning-cup-pipeline.iam.gserviceaccount.com`).
7. Open [your destination Drive folder](https://drive.google.com/drive/folders/1FNlBn7-pYJLnd3ORFCDeli5f7Z9C8yoM) → **Share** → paste that email → role **Editor** → **Send**.

Now load the JSON into the Cloudflare worker (if you skipped this in Step 7):

```bash
cd "$HOME/Documents/The Morning Cup/Generator"
wrangler secret put GOOGLE_SERVICE_ACCOUNT_KEY \
  < "$HOME/Documents/The Morning Cup/.secrets/google-drive-key.json"
```

## Step 10 — Local `.env` file

Put all the local-pipeline credentials in one file. This is the single source of truth for `build-episode.sh`, `upload-audio.py`, `fetch-chunks.sh`, and the Apple Shortcuts.

```bash
cat > "$HOME/Documents/The Morning Cup/.env" <<'ENVEOF'
# Cloudflare worker manual trigger
RUN_SECRET="<paste your RUN_SECRET>"

# Google Drive (service account)
GOOGLE_DRIVE_FOLDER_ID="1FNlBn7-pYJLnd3ORFCDeli5f7Z9C8yoM"
GOOGLE_DRIVE_KEY_PATH="$HOME/Documents/The Morning Cup/.secrets/google-drive-key.json"

# AWS S3 audio bucket (Apollo plugin)
S3_ACCESS_KEY="<from Step 8>"
S3_SECRET_KEY="<from Step 8>"
S3_REGION="us-east-2"
S3_BUCKET="pennytribune"
S3_CF_URL="https://d2hqnemjmedd9s.cloudfront.net"

# WordPress
WP_URL="https://thepennytribune.com"
WP_USERNAME="systems"
WP_APP_PASSWORD="<your WP application password, with spaces>"
ENVEOF
chmod 600 "$HOME/Documents/The Morning Cup/.env"
```

Replace the four `<...>` placeholders with real values.

## Step 11 — First test run

In one terminal, watch the worker logs:

```bash
wrangler tail themorningcupgenerator --format pretty
```

In another, fire today's run:

```bash
"$HOME/Documents/The Morning Cup/Scripts/morning-cup.sh" make
```

(Or for a specific date: `morning-cup.sh make 2026-05-01`.)

Total wall time: ~6–10 minutes. You should see:

```
→ Triggering worker run for 2026-05-01…
→ Run complete. Fetching chunks…
→ Building final MP3…
✓ Done.
  /Users/.../Episodes/The Morning Cup - 2026-05-01.mp3
```

Verify the output:

```bash
DATE=$(TZ=America/New_York date +%Y-%m-%d)

# Final MP3 exists locally
ls -la "$HOME/Documents/The Morning Cup/Episodes/The Morning Cup - $DATE.mp3"

# Chapter markers embedded
ffprobe -v error -show_chapters -of json \
  "$HOME/Documents/The Morning Cup/Episodes/The Morning Cup - $DATE.mp3" \
  | python3 -m json.tool | head -40

# Audio attached to a WP draft
curl -s -u "systems:$(grep WP_APP_PASSWORD "$HOME/Documents/The Morning Cup/.env" | cut -d'"' -f2)" \
  "https://thepennytribune.com/wp-json/wp/v2/serve_episode?status=draft&per_page=5&orderby=date&order=desc" \
  | python3 -c "import json,sys; [print(p['id'], p['title']['rendered'], p['meta'].get('_ep_audio_url','(no audio)')) for p in json.load(sys.stdin)]"
```

## Step 12 — Daily workflow

Once everything's set up, your morning is two commands (the cron has already run while you slept):

```bash
"$HOME/Documents/The Morning Cup/Scripts/morning-cup.sh" fetch && \
"$HOME/Documents/The Morning Cup/Scripts/morning-cup.sh" build
```

Or one command that does both:

```bash
"$HOME/Documents/The Morning Cup/Scripts/morning-cup.sh" fetch && \
"$HOME/Documents/The Morning Cup/Scripts/morning-cup.sh" build && \
"$HOME/Documents/The Morning Cup/Scripts/morning-cup.sh" latest
```

(`latest` opens the newest rendered episode in your default audio player.)

After it finishes:

1. Open https://thepennytribune.com/wp-admin/edit.php?post_type=serve_episode
2. Find today's draft (auto-created by the worker)
3. Review the AI-generated body, edit if needed
4. Hit **Publish**

RSS feed updates automatically.

## Step 13 — Apple Shortcuts (optional but worth it)

Build the four Shortcuts in [APPLE-SHORTCUTS.md](./APPLE-SHORTCUTS.md). After that:

| Hotkey | Action |
|--------|--------|
| ⌃⌥⌘ M | Make Today's Morning Cup (full end-to-end, ~6–10 min) |
| ⌃⌥⌘ B | Fetch & Build Latest (the daily one) |
| ⌃⌥⌘ O | Open Latest Episode |
| ⌃⌥⌘ S | Check Worker Status |

---

## Reference: where everything lives after setup

```
~/Documents/The Morning Cup/
├── .env                                       ← local credentials
├── .secrets/
│   └── google-drive-key.json
├── Generator/                                 ← cloned repo
├── Scripts/                                   ← runtime helpers
├── Sounds/                                    ← reusable audio
├── Chunks/<YYYY-MM-DD>/                       ← per-day raw chunks from R2
└── Episodes/                                  ← final tagged MP3s
```

```
Cloudflare:
  worker:  themorningcupgenerator
  R2:      morning-cup
  KV:      MORNING_CUP_KV (run records)

AWS:
  IAM user: morning-cup-uploader
  S3 bucket: pennytribune (audio/ prefix)
  CloudFront: d2hqnemjmedd9s.cloudfront.net

Google:
  Project: Morning Cup Pipeline
  Service account: morning-cup-uploader@...iam.gserviceaccount.com
  Drive folder: 1FNlBn7-pYJLnd3ORFCDeli5f7Z9C8yoM

WordPress:
  Site: thepennytribune.com
  CPT: serve_episode
  Parent show: post 2616 (The Morning Cup)
  Taxonomy: serve_podcast_category
  User: systems (Application Password auth)
```

---

## When something breaks

See [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) for the matrix of symptoms → fixes.
