# /create-show

Walks the user through adding a new podcast show to the Auto-Episode codebase.

## How to invoke

In Claude Code, in a clone of the Auto-Episode repo:

```
/create-show
```

## What this command does

When the user runs `/create-show`, follow this two-step flow:

### Step 1 — List existing podcasts and ask which one to set up

Read the WordPress credentials from the user's local `.env` (path:
`~/.auto-episode/.env` or wherever they configured) — `WP_URL`,
`WP_USERNAME`, `WP_APP_PASSWORD`.

Call:

```
GET {WP_URL}/wp-json/wp/v2/serve_podcast?per_page=50&status=publish,draft,private
```

with Basic auth. Print a numbered list to the user:

```
Existing podcasts in WordPress:

  ID    Title                              Status
  ----  ---------------------------------  -------
  2616  The Morning Cup                    publish
  2811  The Tribune Weekly Rewind          draft
  2945  Tribune Election Briefing          publish

Type the post ID of the show you want to set up, OR
"new" if you haven't created the serve_podcast post yet.
```

If the user types "new":

> Create the show in WordPress first (Apollo plugin → Podcasts → Add
> New). Set the title, _pod_author, _pod_category, _pod_copyright fields,
> and the serve_podcast_category term. Save it as draft or publish.
> Then re-run /create-show.

Stop. Don't continue.

If the user types a numeric ID, proceed to Step 1a.

### Step 1a — Pull metadata from WordPress automatically

Once the user replies with a post ID, fetch the show's metadata via the
REST API. The `WP_URL`, `WP_USERNAME`, and `WP_APP_PASSWORD` are stored
in the user's `~/.auto-episode/.env` file (or whatever config the local
pipeline uses). Read them and call:

```
GET {WP_URL}/wp-json/wp/v2/serve_podcast/{post_id}
```

with Basic auth.

From the response, extract and pre-fill:
- `WP_PARENT_PODCAST_ID` = the post ID the user gave
- `SHOW_TITLE` = `title.rendered`
- `SHOW_KEY` = suggested from `slug` (lowercase, dashes only); the user
  can still override
- `HOST_NAME` = `meta._pod_author` (or `meta._pod_owner_name` if author
  is empty)
- `PODCAST_GENRE` = `meta._pod_category`
- `COPYRIGHT_HOLDER` = `meta._pod_copyright` if non-empty, else default
  to "The Penny Tribune"
- `WP_PODCAST_SHOW_TERM` = the first term name in
  `serve_podcast_category` for this post (do a second REST call to
  resolve the term ID → name)

If any field is missing on the WP side, leave the slot blank in the
template you'll print next so the user can fill it in.

### Step 1b — Print a SHORT variables template

Print only the values that couldn't be discovered from WP:

```
SHOW_KEY=<suggested-from-slug>     # confirm or override
ELEVENLABS_VOICE_ID=
GOOGLE_DRIVE_FOLDER_ID=
WORKER_NAME=<show-key>generator    # or override
KV_NAMESPACE_ID=
R2_BUCKET=auto-episode             # or per-show bucket
CRON=0 9-11 * * *                  # default daily 5 AM ET; override for weekly etc.
LOCAL_FIRE_HOUR=5
TOPIC_FLOW=Positive Opening,Top Story,Headlines,Closing
INTRO_SOUNDS=intro.wav,intro-sting.wav
SECTION_STING=section-sting.wav
OUTRO_SOUNDS=outro.wav

# --- Auto-pulled from WordPress (verify and edit if needed) ---
SHOW_TITLE=<from WP>
HOST_NAME=<from WP>
PODCAST_GENRE=<from WP>
COPYRIGHT_HOLDER=<from WP>
WP_PARENT_PODCAST_ID=<from WP>
WP_PODCAST_SHOW_TERM=<from WP>
PUBLISHER=The Penny Tribune

MASTER_PROMPT_BEGIN
(replace with the full master prompt for this show)
MASTER_PROMPT_END
```

Tell the user:

> I pulled what I could from the serve_podcast post you created. Verify
> the auto-filled values look right, fill in the missing ones, paste your
> master prompt between the BEGIN/END markers, and paste the whole block
> back to me.

### Step 2 — Wait for the user to paste the filled-in file

The user will paste a block that looks like the template but with values
filled in. Parse it.

Each line is one of:
- A comment (starts with `#`) — ignore.
- A `KEY=VALUE` pair — capture both sides, trim whitespace.
- A line between `MASTER_PROMPT_BEGIN` and `MASTER_PROMPT_END` — concatenate
  these into the multi-line master prompt body. Both markers must appear
  exactly on their own lines.

Validate that the following keys are present and non-empty:
- `SHOW_KEY` (must match `^[a-z0-9-]+$`, no spaces, no underscores)
- `SHOW_TITLE`
- `HOST_NAME`
- `WP_PARENT_PODCAST_ID` (must be a positive integer)
- `WP_PODCAST_SHOW_TERM`
- `WORKER_NAME`
- `KV_NAMESPACE_ID`
- `R2_BUCKET`
- `GOOGLE_DRIVE_FOLDER_ID`
- `ELEVENLABS_VOICE_ID`
- The master prompt body (between the BEGIN/END markers) must be at least
  500 characters.

If anything is missing, tell the user exactly which fields and stop. Do
not generate any files.

### Step 3 — Generate four files in the repo

When the validation passes, write these files:

#### a) `shows/<SHOW_KEY>/config.ts`

Use `shows/_template/config.ts` as the structure. Substitute every value
from the parsed variables. For lists like `INTRO_SOUNDS`, `OUTRO_SOUNDS`,
and `TOPIC_FLOW`, split on commas and trim each element.

#### b) `shows/<SHOW_KEY>/prompt.ts`

```typescript
// shows/<SHOW_KEY>/prompt.ts
//
// Master prompt for <SHOW_TITLE>. Generated by /create-show on <ISO timestamp>.

export const PROMPT = `<the multi-line master prompt body>`;
```

If the prompt body contains backticks, escape them as `` \` ``.

#### c) `wrangler.<SHOW_KEY>.toml`

Copy `wrangler.toml` (or the example template) and substitute:
- `name = "<WORKER_NAME>"`
- `crons = ["<CRON>"]`
- The KV namespace `id = "<KV_NAMESPACE_ID>"`
- The R2 bucket `bucket_name = "<R2_BUCKET>"`
- All `[vars]` per-show values: `SHOW_KEY`, `WORKER_TIMEZONE`,
  `MIN_SCRIPT_WORDS`, etc., plus `WP_PARENT_PODCAST_ID`,
  `WP_PODCAST_SHOW_TERM`, `GOOGLE_DRIVE_FOLDER_ID`, etc.
- Keep the shared values (`PUBLISHER`, `COPYRIGHT_HOLDER`, `WP_URL`,
  `WP_USERNAME`, etc.) at the existing defaults.

#### d) Update `src/show.ts`

Add an import and a registry entry for the new show:

```typescript
import { config as <camelCaseShowKey>Config } from "../shows/<SHOW_KEY>/config";
import { PROMPT as <camelCaseShowKey>Prompt } from "../shows/<SHOW_KEY>/prompt";

// in SHOW_REGISTRY:
"<SHOW_KEY>": { config: <camelCaseShowKey>Config, prompt: <camelCaseShowKey>Prompt },
```

Camel-case conversion: `weekly-rewind` → `weeklyRewind`.

### Step 4 — Print the post-creation checklist

After generating the files, print this checklist for the user (substitute
their values):

```
✓ Files generated:
   shows/<SHOW_KEY>/config.ts
   shows/<SHOW_KEY>/prompt.ts
   wrangler.<SHOW_KEY>.toml
   src/show.ts (registry entry added)

Manual steps remaining:

1. Add the show's sound assets to the repo and push them.

   Sound files for this show live at:

     assets/sounds/<SHOW_KEY>/

   Required filenames (case-sensitive — every show uses the same names,
   scoped by its own subfolder):

     intro.wav           or .mp3   intro music bed
     intro-sting.wav     or .mp3   "now the news begins" transition
     section-sting.wav   or .mp3   between every two news sections
     outro.wav           or .mp3   outro music / thank-you bed

   On your Mac, in your local clone of the Auto-Episode repo:

     mkdir -p assets/sounds/<SHOW_KEY>

   Drop the four audio files into that folder, named EXACTLY as above
   (matching extension is fine — .wav or .mp3).

   Then commit and push:

     git add assets/sounds/<SHOW_KEY>
     git commit -m "Add sound assets for <SHOW_TITLE>"
     git push origin main

   Every other producer on the team will get these on their next
   git pull — no need to share files separately.

   Need extra intro or outro elements (signature foley, voiced
   greeting, etc.)? Add the additional files to the same folder with
   descriptive lowercase names (no spaces), then edit
   shows/<SHOW_KEY>/config.ts → sounds.intro or sounds.outro to list
   them in playback order.

2. Set the per-show Cloudflare worker secrets. Each takes a paste:

     cd <your local clone of Auto-Episode>
     wrangler secret put OPENAI_API_KEY              --config wrangler.<SHOW_KEY>.toml
     wrangler secret put ELEVENLABS_API_KEY          --config wrangler.<SHOW_KEY>.toml
     wrangler secret put ELEVENLABS_VOICE_ID         --config wrangler.<SHOW_KEY>.toml
     wrangler secret put RUN_SECRET                  --config wrangler.<SHOW_KEY>.toml
     wrangler secret put WP_APP_PASSWORD             --config wrangler.<SHOW_KEY>.toml
     wrangler secret put GOOGLE_SERVICE_ACCOUNT_KEY  --config wrangler.<SHOW_KEY>.toml \
         < "$HOME/.auto-episode/google-drive-key.json"

   The values are the SAME values you've already used for other
   shows in this org — same OpenAI key, same ElevenLabs key, same
   service-account JSON, same WP_APP_PASSWORD. Only ELEVENLABS_VOICE_ID
   is unique per show (one voice clone per host).

3. Share the destination Drive folder with the service account email
   (open the JSON if you don't remember it — the client_email field).
   Add as Editor.

4. In WordPress admin, confirm:
   - The serve_podcast post for this show exists at id <WP_PARENT_PODCAST_ID>.
   - The serve_podcast_category term "<WP_PODCAST_SHOW_TERM>" exists.

5. Deploy the new worker:

     wrangler deploy --config wrangler.<SHOW_KEY>.toml

6. Smoke-test:

     curl -X POST -H "Authorization: Bearer <RUN_SECRET>" \
       "https://<WORKER_NAME>.<your-subdomain>.workers.dev/run?date=$(date -u +%Y-%m-%d)&force=true"

   Watch with:

     wrangler tail <WORKER_NAME> --format pretty
```

## Notes for Claude executing this command

- Be precise about file paths and TypeScript syntax — these files will
  compile via `npm run typecheck` immediately.
- After generating, run `npm run typecheck` and report any errors.
- Do NOT modify any other show's files. Only create the new ones and
  add to the registry.
- If `shows/<SHOW_KEY>/` already exists, ASK the user whether to
  overwrite or pick a different `SHOW_KEY` before proceeding.
