# Team Sharing & Onboarding

How to roll The Morning Cup pipeline out to multiple producers on a team.

After this, a new teammate is producing episodes in ~10 minutes:
1. They clone the repo and copy the scripts.
2. They drop the five audio assets into `Sounds/`.
3. They run `wrangler login`.
4. They put their `RUN_SECRET` in `.env`.
5. They import the team's shared Apple Shortcuts.

Done.

## One-command setup

Send each new teammate this command:

```bash
curl -fsSL https://raw.githubusercontent.com/pennydoesdev/TheMorningCup-Episode-Generator/main/scripts/team-setup.sh | bash
```

It does:
- Creates `~/Documents/The Morning Cup/{Sounds,Scripts,Chunks,Episodes}/`
- Clones (or refreshes) the Generator repo into `~/Documents/The Morning Cup/Generator/`
- Mirrors `build-episode.sh`, `fetch-chunks.sh`, `morning-cup.sh`, `write-chapters.py`, and `transcribe-episode.py` into their local `Scripts/`
- Installs `ffmpeg`, `wrangler`, `mutagen`, and `requests` if missing (via Homebrew + npm + pip)
- Prints the remaining manual steps

Reading the script before piping it to `bash` is the responsible move:
```bash
curl -fsSL https://raw.githubusercontent.com/pennydoesdev/TheMorningCup-Episode-Generator/main/scripts/team-setup.sh | less
```

## Distributing the five audio assets

**Current setup: assets ship inside the repo at `assets/sounds/`.** When
a teammate runs `team-setup.sh`, the helper copies anything in that
folder into their `~/Documents/The Morning Cup/Sounds/`. No external
storage required.

The five required assets:

```
Spark.mp3
Coffee Pour.wav
Topic Transition.mp3
The Morning Cup - Thank You.wav
intro-sting.wav  (optional)
```

### Option A (current) — Repo carries assets

To add or update an asset:

```bash
cp ~/Documents/The\ Morning\ Cup/Sounds/* \
   "$HOME/Documents/The Morning Cup/Generator/assets/sounds/"

cd "$HOME/Documents/The Morning Cup/Generator"
git add assets/sounds
git commit -m "Update team sound assets"
git push origin main
```

After teammates `git pull` (or rerun `team-setup.sh`), they have the new files.

**Pros:** Zero extra infrastructure. One command for new teammates.
**Cons:** Repo size grows with every asset change.

### Option B — Public repo, private R2 prefix for assets

Best if you want the codebase public but the music to stay private.

1. Upload the five files to a private prefix in your R2 bucket:
   ```bash
   for f in "$HOME/Documents/The Morning Cup/Sounds/"*.{wav,mp3}; do
     name=$(basename "$f")
     wrangler r2 object put "vicinity/_assets/sounds/$name" \
       --file "$f" --remote
   done
   ```
2. Each teammate runs `wrangler login` to gain R2 read access, then downloads:
   ```bash
   for name in "Spark.mp3" "Coffee Pour.wav" \
               "Topic Transition.mp3" "intro-sting.wav" \
               "The Morning Cup - Thank You.wav"; do
     wrangler r2 object get "vicinity/_assets/sounds/$name" \
       --file "$ROOT/Sounds/$name" --remote 2>/dev/null || true
   done
   ```

**Pros:** Repo stays public; assets stay gated by Cloudflare auth.
**Cons:** Two systems to manage.

## Distributing the Apple Shortcuts

In Shortcuts.app on the lead's Mac:
1. Right-click each shortcut → **Share** → **Copy iCloud Link**.
2. Send the URLs to your team.
3. Each teammate clicks → Shortcuts.app opens → "Add Shortcut."

## Secret management

| Approach | Revocation cost | Best for |
|---|---|---|
| Shared `RUN_SECRET` everyone gets | Rotate centrally + redistribute | Small fixed team |
| Per-user `RUN_SECRET` each in `.env` | Rotate per-user, no redistribution | Teams that change |
| Cloudflare Access SSO | Revoke via dashboard | Larger orgs |

## Onboarding checklist (paste this into your team docs)

```
□ Run team-setup.sh from your terminal:
  curl -fsSL https://raw.githubusercontent.com/pennydoesdev/TheMorningCup-Episode-Generator/main/scripts/team-setup.sh | bash

□ Drop the five audio files into ~/Documents/The Morning Cup/Sounds/
  (Get them from <wherever your team distributes them>)

□ Authenticate with Cloudflare:
  wrangler login

□ Save your RUN_SECRET:
  echo 'RUN_SECRET="..."' > "$HOME/Documents/The Morning Cup/.env"
  chmod 600 "$HOME/Documents/The Morning Cup/.env"

□ (Optional) Add GROQ_API_KEY for $0.01/episode auto-transcription:
  echo 'GROQ_API_KEY="gsk_..."' >> "$HOME/Documents/The Morning Cup/.env"

□ Import the team's Apple Shortcuts via the iCloud links posted in
  #morning-cup-team

□ Smoke-test:
  "$HOME/Documents/The Morning Cup/Scripts/morning-cup.sh" preflight

□ You're ready. Daily morning: morning-cup.sh make
```

## Offboarding checklist

When someone leaves:

```
□ Remove them from the Cloudflare account (revokes R2 + worker access)
□ Remove them from the GitHub repo (Settings → Collaborators)
□ Rotate RUN_SECRET if it was shared:
    wrangler versions secret put RUN_SECRET
□ Send the new RUN_SECRET to remaining teammates
□ If using inline-secret Shortcuts, distribute updated Shortcuts
```
