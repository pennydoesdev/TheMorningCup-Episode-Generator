# Transcripts

Every successful run writes the script in three formats to R2. This page
shows you how to view them, download them, and search through them.

## What gets written

For every episode at `morning-cup/<DATE>/` in the R2 bucket:

| File | Format | What's in it | When you'd use it |
|------|--------|------|------|
| `The Morning Cup - <DATE>.txt` | Plain text | Spoken script with pacing tags (`[pause]`, `[beat]`, `[firmer]`, etc.) and `[TEN-SECOND SECTION SPACER]` markers stripped — reads as clean prose | Show notes, transcript fields, archive, sharing, search |
| `The Morning Cup - <DATE>.html` | HTML | Same content, formatted for web display | Web embed, blog post, share link |
| `The Morning Cup - <DATE>.json` | JSON | The **full** episode object — script with all original tags/spacers intact, plus riddle Q+A, social copy, source URLs cited from web search, self-validation, **chapters list** | Programmatic re-use, audit, regeneration, social-media drafts |
| `The Morning Cup - <DATE> - manifest.json` | JSON | Title, publisher, copyright, year, genre, runtime, word count, chunk metadata, chapter titles, validation result | Build pipeline, deploys, telemetry |

## Browsing transcripts

### Option A: Cloudflare dashboard (visual)

```
https://dash.cloudflare.com/<your-account>/r2/default/buckets/morning-cup/objects?prefix=morning-cup%2F<DATE>%2F
```

Click any file, then "Download" or "Open."

### Option B: Wrangler CLI (download to disk)

```bash
DATE=2026-05-01

# Plain-text transcript (recommended for show notes)
wrangler r2 object get \
  "morning-cup/morning-cup/$DATE/The Morning Cup - $DATE.txt" \
  --file ~/Downloads/episode.txt --remote

# HTML transcript
wrangler r2 object get \
  "morning-cup/morning-cup/$DATE/The Morning Cup - $DATE.html" \
  --file ~/Downloads/episode.html --remote

# Full episode JSON (script + social copy + sources + chapters)
wrangler r2 object get \
  "morning-cup/morning-cup/$DATE/The Morning Cup - $DATE.json" \
  --file ~/Downloads/episode.json --remote

# Open them
open ~/Downloads/episode.txt
open ~/Downloads/episode.html      # opens in your default browser
```

> ℹ️ Wrangler 4.x takes the bucket and key as one positional in `bucket/key`
> form; the `morning-cup/morning-cup/` repetition is correct (bucket name +
> path inside the bucket).

### Option C: One-liner pipe to terminal (no file save)

```bash
DATE=2026-05-01
wrangler r2 object get \
  "morning-cup/morning-cup/$DATE/The Morning Cup - $DATE.txt" \
  --pipe --remote
```

## Searching transcripts

### Single episode

```bash
DATE=2026-05-01
TRANSCRIPT=~/Downloads/episode.txt

# Case-insensitive match
grep -in "iran" "$TRANSCRIPT"

# Show 2 lines of context around the match
grep -in -C 2 "supreme court" "$TRANSCRIPT"

# Multiple search terms
grep -inE "(rent|housing|tenants?)" "$TRANSCRIPT"

# Count occurrences of a phrase
grep -ic "working class" "$TRANSCRIPT"
```

### All episodes you've already pulled

```bash
# Search every transcript across every chunks-folder you've downloaded
grep -irn "ceasefire" ~/Documents/The\ Morning\ Cup/Chunks/

# Find every mention of a topic in episode JSONs (full script + social copy + sources)
grep -irln "tariff" ~/Documents/The\ Morning\ Cup/Chunks/ | xargs grep -in "tariff"
```

### Sharing a chunk with Claude or another tool

Pipe a region into your clipboard and paste:
```bash
sed -n '60,120p' ~/Downloads/episode.txt | pbcopy
```

Or for a specific section, find the section header and grep around it:
```bash
grep -n "Cost of Living" ~/Downloads/episode.txt
sed -n '180,260p' ~/Downloads/episode.txt | pbcopy
```

## Working with the JSON

The full episode JSON is the most flexible. You can pull out any field with
`jq`:

```bash
JSON=~/Downloads/episode.json

# Title
jq -r .show_title "$JSON"

# Estimated runtime
jq -r .estimated_runtime "$JSON"

# Just the spoken script (with all pacing tags + spacers preserved)
jq -r .elevenlabs_script "$JSON"

# Riddle question + answer
jq -r '.riddle_question, .riddle_answer' "$JSON"

# Social main post
jq -r '.social_copy.main_post' "$JSON"

# Per-section social posts (great for scheduling)
jq -r '.social_copy.section_posts[] | "\(.section)\n  \(.post)\n"' "$JSON"

# All cited source URLs (from web_search during generation)
jq -r '.source_notes[] | "[\(.category)] \(.title) — \(.source) — \(.url)"' "$JSON"

# Self-validation block (model's own structural checks)
jq '.self_validation' "$JSON"

# All 28 chapter titles in order
jq -r '.chapters[].title' "$JSON"
```

## Auto-pulling transcripts alongside chunks

If you'd rather have the .txt / .html / .json appear in
`~/Documents/The Morning Cup/Chunks/<DATE>/` automatically when you run
`fetch-chunks.sh`, edit the script and add lines like:

```bash
# (Optional) — pull the human-readable transcript files too
for ext in txt html json; do
  KEY="morning-cup/$DATE/The Morning Cup - $DATE.$ext"
  LOCAL="$DEST/The Morning Cup - $DATE.$ext"
  if [ ! -s "$LOCAL" ]; then
    wrangler r2 object get "$BUCKET/$KEY" --file "$LOCAL" --remote || true
  fi
done
```

This is opt-in — most days you only need the chunks, but if you publish
show notes daily it's worth adding.

## What's NOT in the transcripts (but is in the audio)

- Intro song
- Coffee pour foley
- "Cream or sugar, hon?" voice line
- Intro sting
- Section stings between sections
- Outro thank-you bed

These are added during local assembly by `build-episode.sh` from the
`Sounds/` folder. The transcripts only contain the host-read narration —
which is what you want for show notes.

## Searching with Claude

Paste relevant content into chat and I can:

- Pull quotes for social posts
- Identify which sections cover which stories
- Spot-check for editorial consistency, factual claims, or repeated phrasing
- Generate alternate social copy or pull-quote slates
- Compare two days' coverage of the same ongoing story

Tip: if the script is long, paste just one section at a time (split on
`[TEN-SECOND SECTION SPACER]` boundaries in the JSON, or grep around a
known section heading in the .txt).
