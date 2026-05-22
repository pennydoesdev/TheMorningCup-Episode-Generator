#!/usr/bin/env bash
#
# fetch-chunks.sh - Pull a Morning Cup episode's chunks (and manifest) from R2
#                   into ~/Documents/The Morning Cup/Chunks/<DATE>/
#
# Usage:
#     scripts/fetch-chunks.sh                # uses today's date in America/New_York
#     scripts/fetch-chunks.sh 2026-04-30     # specific date
#     scripts/fetch-chunks.sh --latest       # whatever's most recent in the bucket
#
# Requires: wrangler CLI authenticated against the morning-cup R2 bucket
# (`wrangler login` once if you haven't, then it stays authenticated).
# Skips chunks that are already on disk so re-running is fast and safe.
#

set -euo pipefail

ROOT="$HOME/Documents/The Morning Cup"
BUCKET="vicinity"
R2_PREFIX="Generators/Podcasts/TheMorningCup"

# --- argument parsing --------------------------------------------------------

DATE=""
if [ $# -ge 1 ]; then
  case "$1" in
    --latest)
      # Discover the most recent date by listing the bucket.
      DATE=$(wrangler r2 object list "$BUCKET" --prefix "$R2_PREFIX/" --remote 2>/dev/null \
        | grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}' \
        | sort -u \
        | tail -1)
      if [ -z "$DATE" ]; then
        echo "Could not auto-detect a date from R2 listing." >&2
        exit 1
      fi
      echo "Latest episode in R2: $DATE"
      ;;
    -h|--help)
      sed -n '2,16p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      DATE="$1"
      ;;
  esac
else
  DATE=$(TZ=America/New_York date +%Y-%m-%d)
  echo "No date passed — using today (America/New_York): $DATE"
fi

if ! [[ "$DATE" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
  echo "Error: date '$DATE' must be YYYY-MM-DD." >&2
  exit 1
fi

DEST="$ROOT/Chunks/$DATE"
mkdir -p "$DEST"

# --- pull manifest first; the chunk count comes from it ----------------------

MANIFEST_FILE="$DEST/The Morning Cup - $DATE - manifest.json"
MANIFEST_KEY="$R2_PREFIX/$DATE/The Morning Cup - $DATE - manifest.json"

echo "Fetching manifest from R2..."
if ! wrangler r2 object get "$BUCKET/$MANIFEST_KEY" --file "$MANIFEST_FILE" --remote; then
  echo "" >&2
  echo "Error: could not fetch manifest at $BUCKET/$MANIFEST_KEY" >&2
  echo "Has the episode for $DATE finished generating? Check status with:" >&2
  echo "  curl -H \"Authorization: Bearer \$RUN_SECRET\" \\" >&2
  echo "    \"https://themorningcupgenerator.itsmiarosemathews.workers.dev/status?date=$DATE\"" >&2
  exit 1
fi

if [ ! -s "$MANIFEST_FILE" ]; then
  echo "Manifest file is empty: $MANIFEST_FILE" >&2
  exit 1
fi

COUNT=$(python3 -c "import json,sys; print(json.load(open(sys.argv[1]))['chunk_count'])" "$MANIFEST_FILE")
TITLE=$(python3 -c "import json,sys; print(json.load(open(sys.argv[1])).get('title','(no title)'))" "$MANIFEST_FILE")
WORDS=$(python3 -c "import json,sys; print(json.load(open(sys.argv[1])).get('word_count','?'))" "$MANIFEST_FILE")
RUNTIME=$(python3 -c "import json,sys; print(json.load(open(sys.argv[1])).get('estimated_runtime_minutes','?'))" "$MANIFEST_FILE")

echo "Manifest: $TITLE"
echo "          $WORDS words, ~$RUNTIME min, $COUNT chunks"
echo "Destination: $DEST"
echo ""

# --- pull each chunk; skip ones already present ------------------------------

DOWNLOADED=0
SKIPPED=0
for i in $(seq -f "%03g" 1 "$COUNT"); do
  LOCAL="$DEST/$i.mp3"
  if [ -s "$LOCAL" ]; then
    SKIPPED=$((SKIPPED+1))
    continue
  fi
  KEY="$R2_PREFIX/$DATE/chunks/The Morning Cup - $DATE - $i.mp3"
  echo "  $i.mp3"
  wrangler r2 object get "$BUCKET/$KEY" --file "$LOCAL" --remote
  DOWNLOADED=$((DOWNLOADED+1))
done

echo ""
echo "Done: $DOWNLOADED downloaded, $SKIPPED already present."

# --- pull metadata file (for podcast upload) ---------------------------------

METADATA_LOCAL="$DEST/The Morning Cup - $DATE - Metadata.txt"
METADATA_KEY="$R2_PREFIX/$DATE/The Morning Cup - $DATE - Metadata.txt"

if [ ! -f "$METADATA_LOCAL" ]; then
  echo ""
  echo "Fetching metadata file..."
  if wrangler r2 object get "$BUCKET/$METADATA_KEY" --file "$METADATA_LOCAL" --remote 2>/dev/null; then
    echo "  Saved: $METADATA_LOCAL"
  else
    echo "  (metadata file not found in R2 — skipping)"
  fi
fi

echo ""
ls -la "$DEST"
echo ""
echo "Next: run scripts/build-episode.sh $DATE"
