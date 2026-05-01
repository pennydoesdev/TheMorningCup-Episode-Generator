# Team Sharing & Onboarding

How to roll The Morning Cup pipeline out to multiple producers on a team.

After this, a new teammate is producing episodes in ~10 minutes:
1. They run `team-setup.sh` (one command).
2. They drop the six audio assets into `Sounds/`.
3. They run `wrangler login`.
4. They put their RUN_SECRET in `.env`.
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
- Mirrors `build-episode.sh`, `fetch-chunks.sh`, `morning-cup.sh`, and `write-chapters.py` into their local `Scripts/`
- Installs `ffmpeg`, `wrangler`, and `mutagen` if missing (via Homebrew + npm + pip)
- Prints the remaining manual steps

Reading the script before piping it to `bash` is the responsible move:
```bash
curl -fsSL https://raw.githubusercontent.com/pennydoesdev/TheMorningCup-Episode-Generator/main/scripts/team-setup.sh | less
```

## Distributing the six audio assets

**Current setup: assets ship inside the repo at `assets/sounds/`.** When
a teammate runs `team-setup.sh`, the helper copies anything in that
folder into their `~/Documents/The Morning Cup/Sounds/`. No external
storage required.

> ⚠️ The cloned-voice file (`Cream or sugar, hon?.mp3`) is in the repo.
> **Make sure the repo is private** (GitHub → Settings → Change
> repository visibility → Private) before committing this asset, or
> switch to Option B below.

### Option A (current) — Repo carries assets

To add or update an asset:

```bash
# From your local clone
cp ~/Documents/The\ Morning\ Cup/Sounds/* \
   "$HOME/Documents/The Morning Cup/Generator/assets/sounds/"

cd "$HOME/Documents/The Morning Cup/Generator"
git add assets/sounds
git commit -m "Update team sound assets"
git push origin main
```

After teammates `git pull` (or rerun `team-setup.sh`), they have the
new files.

**Pros:** Zero extra infrastructure. One command for new teammates.
**Cons:** Repo size grows with every asset change; rotating an asset
permanently bloats git history; everyone with repo access has the
cloned voice file.

### Option B — Public repo, private R2 prefix for assets

Best if you want the codebase public for transparency / collaboration but
the cloned voice and licensed music to stay private.

1. Upload the six files to a private prefix in your R2 bucket:
   ```bash
   for f in "$HOME/Documents/The Morning Cup/Sounds/"*.{wav,mp3}; do
     name=$(basename "$f")
     wrangler r2 object put "morning-cup/_assets/sounds/$name" \
       --file "$f" --remote
   done
   ```
2. Append a download step to `team-setup.sh`:
   ```bash
   for name in "The Morning Cup - Song.wav" "Coffee Pour.wav" \
               "Cream or sugar, hon?.mp3" "intro-sting.wav" \
               "morning-cup-sting.wav" "The Morning Cup - Thank You.wav"; do
     wrangler r2 object get "morning-cup/_assets/sounds/$name" \
       --file "$ROOT/Sounds/$name" --remote 2>/dev/null || true
   done
   ```
3. Each teammate runs `wrangler login` against your team's Cloudflare
   account to gain R2 read access. After that, the download step in
   `team-setup.sh` succeeds.

**Pros:** Repo stays public; assets stay gated by Cloudflare auth;
revocation = removing someone from the Cloudflare account.
**Cons:** Two systems to manage; setup script depends on `wrangler`
being authenticated before sounds download.

### Option C — Public repo, GitHub Releases for assets

Easiest technically, but **the assets become fully public.** Anyone who
finds the repo can download them. **Do not use this for the cloned
voice clip.**

1. Tag a release: `git tag v1.0-assets && git push origin v1.0-assets`
2. Go to GitHub → Releases → Draft a new release → upload the assets
3. `team-setup.sh` downloads from the release URL with `curl`

Skip this option for The Morning Cup unless you've decided it's fine for
the cloned voice and music to be downloadable by anyone.

## Distributing the Apple Shortcuts

In Shortcuts.app on the lead's Mac:
1. Right-click each of the four shortcuts → **Share** → **Copy iCloud
   Link**.
2. Send the four URLs in your team channel.
3. Each teammate clicks → Shortcuts.app opens → "Add Shortcut."

If you want them gated/centralized:
- **Without inline secret** — share the Shortcut as-is. Each user adds
  their `RUN_SECRET` to `~/Documents/The Morning Cup/.env` (Option B in
  APPLE-SHORTCUTS.md).
- **With inline secret** — easier (one-click ready-to-run) but every user
  has the same secret embedded in their copy of the Shortcut. If the
  secret is rotated, every user needs an updated Shortcut.

## Secret management

| Approach | Revocation cost | Best for |
|---|---|---|
| Shared `RUN_SECRET` everyone gets | Rotate centrally + redistribute | Small fixed team |
| Per-user `RUN_SECRET` each in `.env` | Rotate per-user, no redistribution | Teams that change |
| Cloudflare Access SSO (replaces bearer auth) | Revoke via dashboard | Larger orgs, compliance |

Per-user secrets are the strongest tradeoff for a multi-person team. To
rotate one user's secret without affecting others, you'd need to switch
the worker from a single `RUN_SECRET` to a list of accepted secrets —
small change, ~15 min to ship. Ping if you want this.

## Onboarding checklist (paste this into your team docs)

```
□ Run team-setup.sh from your terminal:
  curl -fsSL https://raw.githubusercontent.com/pennydoesdev/TheMorningCup-Episode-Generator/main/scripts/team-setup.sh | bash

□ Drop the six audio files into ~/Documents/The Morning Cup/Sounds/
  (Get them from <wherever your team distributes them>)

□ Authenticate with Cloudflare:
  wrangler login

□ Save your RUN_SECRET:
  echo 'RUN_SECRET="..."' > "$HOME/Documents/The Morning Cup/.env"
  chmod 600 "$HOME/Documents/The Morning Cup/.env"

□ Import the team's Apple Shortcuts via the iCloud links posted in
  #morning-cup-team

□ Smoke-test:
  "$HOME/Documents/The Morning Cup/Scripts/morning-cup.sh" status

□ You're ready. Daily morning: ⌃⌥⌘ B (Fetch & Build Latest)
```

## Offboarding checklist

When someone leaves:

```
□ Remove them from the Cloudflare account (revokes R2 + worker access)
□ Remove them from the GitHub repo (Settings → Collaborators)
□ Rotate RUN_SECRET if it was shared:
    wrangler secret put RUN_SECRET
□ Send the new RUN_SECRET to remaining teammates
□ If using inline-secret Shortcuts, distribute updated Shortcuts
```
