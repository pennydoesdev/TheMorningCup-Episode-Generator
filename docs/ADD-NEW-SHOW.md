# Adding a New Show

The `/create-show` Claude Code slash command is the supported path. This
doc covers what happens, what you need to do manually, and how to debug
if something goes wrong.

## TL;DR

1. Create the podcast in WordPress (Apollo plugin → Podcasts → Add New).
2. In Claude Code, in your local Auto-Episode clone:
   ```
   /create-show
   ```
3. Pick the WordPress show ID from the list Claude shows you.
4. Claude pulls metadata from WordPress and prints a short variables
   block — fill in the values it couldn't auto-discover (voice ID,
   Drive folder, Cloudflare worker name, master prompt) and paste back.
5. Claude generates `shows/<show-key>/`, `wrangler.<show-key>.toml`,
   and updates the registry.
6. Add sound assets to `assets/sounds/<show-key>/`, push to git.
7. Set per-worker secrets, share Drive folder, deploy.

## What `/create-show` does

### Step 1 — Lists existing `serve_podcast` posts

Calls `/wp-json/wp/v2/serve_podcast` and shows a numbered list with IDs,
titles, and status. You type the ID of the show you want to wire up.

If the show doesn't exist in WP yet, type `new` — Claude tells you to
create it first and re-run.

### Step 2 — Auto-pulls metadata from WordPress

For the chosen post ID, Claude reads:
- `title.rendered` → `SHOW_TITLE`
- `slug` → suggested `SHOW_KEY`
- `meta._pod_author` → `HOST_NAME`
- `meta._pod_category` → `PODCAST_GENRE`
- `meta._pod_copyright` → `COPYRIGHT_HOLDER`
- The `serve_podcast_category` term assigned to the post →
  `WP_PODCAST_SHOW_TERM`

Anything missing on the WP side is left blank.

### Step 3 — Prints a short variables block

Only the values that *can't* be discovered from WordPress:

| Variable | Why you need it |
|---|---|
| `SHOW_KEY` | URL-safe slug (suggested from WP slug; override OK) |
| `ELEVENLABS_VOICE_ID` | The cloned voice for this host |
| `GOOGLE_DRIVE_FOLDER_ID` | Where this show's Drive archive lives |
| `WORKER_NAME` | Cloudflare worker name (must be unique account-wide) |
| `KV_NAMESPACE_ID` | Run-record KV namespace (create in CF dashboard) |
| `R2_BUCKET` | Either the shared `auto-episode` bucket or a per-show bucket |
| `CRON` | Schedule (default `0 9-11 * * *` for daily 5 AM ET) |
| `TOPIC_FLOW` | Comma-separated list of section names |
| `INTRO_SOUNDS`, `SECTION_STING`, `OUTRO_SOUNDS` | Filenames in `assets/sounds/<show-key>/` |
| `MASTER_PROMPT_BEGIN` / `MASTER_PROMPT_END` | The full editorial brief between the markers |

### Step 4 — Generates files

You paste the filled-in block back. Claude writes:

- `shows/<show-key>/config.ts` — the `ShowConfig` populated from your values
- `shows/<show-key>/prompt.ts` — the master prompt body wrapped as a TS module
- `wrangler.<show-key>.toml` — Cloudflare worker config for this show
- Updates `src/show.ts` to register the new show

### Step 5 — Prints your manual checklist

Claude prints the remaining steps. You do these on your Mac.

## Manual steps after `/create-show`

### 1. Sound assets

Drop the four standardized files into `assets/sounds/<show-key>/`:

- `intro.wav` — intro music bed
- `intro-sting.wav` — "now the news begins" transition
- `section-sting.wav` — between every two news sections
- `outro.wav` — outro / thank-you bed

(Filenames are case-sensitive. `.mp3` works equally well.)

If your show needs additional intro / outro elements (signature foley,
voiced greeting, etc.), add them to the same folder with descriptive
lowercase filenames AND update `shows/<show-key>/config.ts` →
`sounds.intro` or `sounds.outro` to list them in playback order.

Commit and push:

```bash
git add assets/sounds/<show-key> shows/<show-key> wrangler.<show-key>.toml src/show.ts
git commit -m "Add show: <Show Title>"
git push origin main
```

### 2. Cloudflare worker secrets

Each new worker needs its own copy of the shared org-wide secrets,
plus its own `ELEVENLABS_VOICE_ID`:

```bash
cd Auto-Episode

wrangler secret put OPENAI_API_KEY              --config wrangler.<show-key>.toml
wrangler secret put ELEVENLABS_API_KEY          --config wrangler.<show-key>.toml
wrangler secret put ELEVENLABS_VOICE_ID         --config wrangler.<show-key>.toml
wrangler secret put RUN_SECRET                  --config wrangler.<show-key>.toml
wrangler secret put WP_APP_PASSWORD             --config wrangler.<show-key>.toml
wrangler secret put GOOGLE_SERVICE_ACCOUNT_KEY  --config wrangler.<show-key>.toml \
    < "$HOME/.auto-episode/google-drive-key.json"
```

`OPENAI_API_KEY`, `ELEVENLABS_API_KEY`, `WP_APP_PASSWORD`, and
`GOOGLE_SERVICE_ACCOUNT_KEY` are the **same values** you've used for
other shows. Only `ELEVENLABS_VOICE_ID` and `RUN_SECRET` are unique
per show.

### 3. Share the Drive folder

Open the destination Drive folder for this show. Click **Share**, paste
the service account's `client_email` (find it in
`google-drive-key.json` → `client_email` field), set role to **Editor**,
**Send**.

### 4. Verify WordPress side

- The `serve_podcast` post for this show is published / saved.
- The `serve_podcast_category` term that matches the show name exists.
- (If you're using a separate KV / R2 bucket per show, double-check those
  are created in the Cloudflare dashboard.)

### 5. Deploy

```bash
wrangler deploy --config wrangler.<show-key>.toml
```

### 6. Smoke-test

```bash
DATE=$(TZ=America/New_York date +%Y-%m-%d)
curl -X POST -H "Authorization: Bearer <RUN_SECRET-for-this-show>" \
  "https://<WORKER_NAME>.<your-subdomain>.workers.dev/run?date=$DATE&force=true"

# Watch in another terminal:
wrangler tail <WORKER_NAME> --format pretty
```

You should see the same sequence we use for any show:

```
run start  (showKey=<show-key> ...)
validation failed — attempting repair        (sometimes)
run complete  (chunkCount=N wordCount=NNNN)
publish: drive upload complete
publish: wp draft created
```

## Debugging

| Symptom | Likely cause |
|---|---|
| `/create-show` can't list shows | WP credentials missing in your `.env`. Set `WP_URL`, `WP_USERNAME`, `WP_APP_PASSWORD`. |
| Worker errors `Unknown SHOW_KEY "<key>"` at runtime | The new show's import wasn't added to `src/show.ts` registry. Re-run `/create-show` or add manually. |
| Worker can't bind `EPISODE_BUCKET` | `wrangler.<show-key>.toml` references a bucket name that doesn't exist in your CF account. Create it. |
| WP draft never appears | `WP_APP_PASSWORD` secret on this worker is missing or wrong. `wrangler secret put` it again. |
| Drive upload fails 403 | Service account email isn't shared on this show's Drive folder as Editor. |
| Sound assets missing in build | Filenames in `shows/<show-key>/config.ts` → `sounds.intro` etc. don't match what's in `assets/sounds/<show-key>/`. Check exact spelling + extensions. |

## When NOT to use `/create-show`

- You're **migrating an existing show** from another generator. Start by
  copying its prompt + sounds into `shows/<show-key>/` and
  `assets/sounds/<show-key>/` directly, then run `/create-show` only to
  generate the wrangler config + registry entry.
- You want to **change the master prompt** for an existing show. Just
  edit `shows/<show-key>/prompt.ts` directly and redeploy that worker.
