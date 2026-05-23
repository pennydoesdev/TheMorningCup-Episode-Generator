# Sound Assets

The six audio files used by `build-episode.sh` to assemble each daily
episode. `team-setup.sh` automatically copies these into a teammate's
`~/Documents/The Morning Cup/Sounds/` folder during onboarding.

## Required filenames (case-sensitive)

| File | Role | Approx duration |
|------|------|-----------------|
| `Hello.mp3` | Intro music bed (plays first) | 30s – 5 min |
| `Coffee Pour.wav` | Signature pour ambience | ~2 sec |
| `Topic Transition.mp3` | Section transition sting | ~2 sec |
| `intro-sting.wav` | "Now the news begins" sting | optional, ~2 sec |
| `Goodbye.mp3` | Outro music bed (plays last) | 30s – 90s |

## Adding / replacing assets

From your Mac, with the repo cloned locally:

```bash
# Copy the six files in (one-time, or whenever you regenerate one)
cp ~/Documents/The\ Morning\ Cup/Sounds/* \
   "$HOME/Documents/The Morning Cup/Generator/assets/sounds/"

cd "$HOME/Documents/The Morning Cup/Generator"
git add assets/sounds
git commit -m "Update team sound assets"
git push origin main
```

After teammates `git pull` (or run `team-setup.sh`), the new files
populate their local `Sounds/` folder.

## A note on what's safe to share

- **Coffee pour, section sting, intro sting** — generic foley/music. Safe.
- **Cloned voice greeting** — this contains the host's voice. **Anyone
  with access to this file can use it as a voice clone sample.** Make
  sure the repo is private before committing this asset, or use the
  external-storage option in [docs/TEAM-SHARING.md](../../docs/TEAM-SHARING.md#option-b--public-repo-private-r2-prefix-for-assets).
- **Intro / outro music** — depends on whether commissioned, owned, or
  licensed. Check redistribution rights before pushing licensed tracks
  to any repo.
