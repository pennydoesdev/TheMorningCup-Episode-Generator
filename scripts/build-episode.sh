#!/usr/bin/env bash
#
# build-episode.sh - Assemble a Morning Cup episode with ffmpeg.
#
# Concatenates Hello.mp3 -> Coffee Pour -> intro-sting ->
# 001.mp3 -> Topic Transition -> 002.mp3 -> ... -> Goodbye.mp3
# into one MP3, writes ID3 tags from the manifest, saves to:
#     ~/Documents/The Morning Cup/Episodes/The Morning Cup - <DATE>.mp3
#
# Usage:
#     scripts/build-episode.sh                # auto-detects newest date in Chunks/
#     scripts/build-episode.sh 2026-04-30     # specific date
#
# Requires: ffmpeg, python3 (for reading the manifest JSON).
# No Resolve required.
#

set -euo pipefail

ROOT="$HOME/Documents/The Morning Cup"
SOUNDS="$ROOT/Sounds"
CHUNKS_BASE="$ROOT/Chunks"
EPISODES="$ROOT/Episodes"

# --- prerequisites -----------------------------------------------------------

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "Error: ffmpeg not found. Install it: brew install ffmpeg" >&2
  exit 1
fi
if ! command -v python3 >/dev/null 2>&1; then
  echo "Error: python3 not found." >&2
  exit 1
fi

# --- determine episode date --------------------------------------------------

DATE="${1:-}"
if [ -z "$DATE" ]; then
  DATE=$(ls -1 "$CHUNKS_BASE" 2>/dev/null \
    | grep -E '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' \
    | sort -r | head -1)
  if [ -z "$DATE" ]; then
    echo "Error: no episode folders found in $CHUNKS_BASE" >&2
    exit 1
  fi
  echo "Auto-detected date: $DATE"
fi

if ! [[ "$DATE" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
  echo "Error: date '$DATE' must be YYYY-MM-DD." >&2
  exit 1
fi

CHUNKS="$CHUNKS_BASE/$DATE"
if [ ! -d "$CHUNKS" ]; then
  echo "Error: chunks folder not found: $CHUNKS" >&2
  exit 1
fi

# --- assets ------------------------------------------------------------------

INTRO_SONG="$SOUNDS/Hello.mp3"
COFFEE_POUR="$SOUNDS/Coffee Pour.wav"
INTRO_STING="$SOUNDS/intro-sting.wav"
SECTION_STING="$SOUNDS/Topic Transition.mp3"
OUTRO="$SOUNDS/Goodbye.mp3"

REQUIRED=("$INTRO_SONG" "$COFFEE_POUR" "$SECTION_STING" "$OUTRO")
for f in "${REQUIRED[@]}"; do
  if [ ! -f "$f" ]; then
    echo "Error: missing required asset: $f" >&2
    exit 1
  fi
done

CHUNKS_LIST=("$CHUNKS"/*.mp3)
if [ ${#CHUNKS_LIST[@]} -eq 0 ] || [ ! -f "${CHUNKS_LIST[0]}" ]; then
  echo "Error: no chunk MP3s found in $CHUNKS" >&2
  exit 1
fi
CHUNK_COUNT=${#CHUNKS_LIST[@]}

# --- read tags from manifest -------------------------------------------------

MANIFEST="$CHUNKS/The Morning Cup - $DATE - manifest.json"
read_manifest() {
  local key="$1"
  local default="$2"
  if [ -f "$MANIFEST" ]; then
    python3 -c "import json,sys; d=json.load(open(sys.argv[1])); print(d.get(sys.argv[2], sys.argv[3]))" \
      "$MANIFEST" "$key" "$default"
  else
    echo "$default"
  fi
}

YEAR="${DATE:0:4}"
SHOW=$(read_manifest show_name "The Morning Cup")
EPISODE_SUBTITLE=$(read_manifest episode_title "")
if [ -n "$EPISODE_SUBTITLE" ]; then
  TITLE="The Morning Cup: $EPISODE_SUBTITLE"
else
  TITLE=$(read_manifest title "The Morning Cup - $DATE")
fi
PUBLISHER=$(read_manifest publisher "Fold 42")
COPYRIGHT=$(read_manifest copyright "Copyright $YEAR - Fold 42")
GENRE=$(read_manifest genre "News")
WORD_COUNT=$(read_manifest word_count "?")
RUNTIME=$(read_manifest estimated_runtime_minutes "?")
EPISODE_NUM=$(python3 -c "from datetime import date; d=date.fromisoformat('$DATE'); print(d.timetuple().tm_yday)")

GEN_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
COMMENT="Generated $GEN_AT — ~$RUNTIME min / $WORD_COUNT words"

# --- detect section boundaries from manifest (smart sting placement) ---------
#
# Chunks with starts_section_indices = [] are continuations of a split section.
# The sting should only play before chunks that begin a new section, not before
# continuations. Falls back to always inserting the sting if manifest is absent.

CHUNK_STARTS_SECTION=()
if [ -f "$MANIFEST" ]; then
  while IFS= read -r line; do
    CHUNK_STARTS_SECTION+=("$line")
  done < <(python3 -c "
import json, sys
manifest = json.load(open(sys.argv[1]))
chunks = sorted(manifest.get('chunks', []), key=lambda c: c['order'])
for chunk in chunks:
    print('1' if chunk.get('starts_section_indices') else '0')
" "$MANIFEST")
fi

# --- build ordered input list ------------------------------------------------

INPUTS=("$INTRO_SONG" "$COFFEE_POUR")
[ -f "$INTRO_STING" ] && INPUTS+=("$INTRO_STING")
for i in "${!CHUNKS_LIST[@]}"; do
  INPUTS+=("${CHUNKS_LIST[$i]}")
  if [ $i -lt $((CHUNK_COUNT - 1)) ]; then
    NEXT_IDX=$((i + 1))
    # Insert sting only when the next chunk starts a new section.
    # If manifest data is unavailable (fallback 1), always insert.
    if [ "${CHUNK_STARTS_SECTION[$NEXT_IDX]:-1}" = "1" ]; then
      INPUTS+=("$SECTION_STING")
    fi
  fi
done
INPUTS+=("$OUTRO")

# --- normalize each input to a uniform MP3 (44.1 kHz stereo, 192k) -----------
#
# The concat demuxer requires identical codec/sample-rate/channel-layout for
# every input. Sounds are WAV at varying rates; chunks are MP3 from
# ElevenLabs at 44.1 kHz. The reliable path is to re-encode everything to a
# single consistent format first, then concat without re-encoding.

mkdir -p "$EPISODES"
TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

NORM_DIR="$TMPDIR/normalized"
mkdir -p "$NORM_DIR"

echo "Normalizing ${#INPUTS[@]} input clips..."
i=0
for f in "${INPUTS[@]}"; do
  num=$(printf "%04d" "$i")
  out="$NORM_DIR/$num.mp3"
  ffmpeg -y -loglevel error -i "$f" \
    -ar 44100 -ac 2 -b:a 192k -codec:a libmp3lame \
    "$out"
  i=$((i + 1))
done

# --- concat with 0.3-second crossfade between segments -----------------------
#
# Each normalized segment is crossfaded into the next using acrossfade.
# This produces smooth transitions with no audible hard cuts between chunks.
# The crossfade is 0.3 seconds — subtle enough to not blur the section stings
# but smooth enough to eliminate the click/pop of a hard splice.

NORM_FILES=("$NORM_DIR"/*.mp3)
NORM_COUNT=${#NORM_FILES[@]}

OUTPUT="$EPISODES/The Morning Cup - $DATE.mp3"
echo "Concatenating ${NORM_COUNT} segments with 0.3s crossfade..."

if [ "$NORM_COUNT" -eq 1 ]; then
  # Only one segment — no crossfade needed, just copy it.
  cp "${NORM_FILES[0]}" "$OUTPUT"
elif [ "$NORM_COUNT" -le 32 ]; then
  # Build a single ffmpeg command with acrossfade filter chain.
  # For N inputs we need N-1 acrossfade operations chained together.
  INPUT_ARGS=()
  for f in "${NORM_FILES[@]}"; do
    INPUT_ARGS+=(-i "$f")
  done

  # Build acrossfade filter chain.
  # For N=2: [0:a][1:a]acrossfade→[out]
  # For N>2: [0:a][1:a]→[cf0]; [cf0][2:a]→[cf1]; ... [cf(N-3)][N-1:a]→[out]
  FILTER_COMPLEX=""
  if [ "$NORM_COUNT" -eq 2 ]; then
    FILTER_COMPLEX="[0:a][1:a]acrossfade=d=0.3:c1=tri:c2=tri[out]"
  else
    # First pair: inputs 0 and 1 → [cf0]
    FILTER_COMPLEX="[0:a][1:a]acrossfade=d=0.3:c1=tri:c2=tri[cf0];"
    # Middle pairs: [cf(k-2)] and input k → [cf(k-1)]
    for ((k=2; k<NORM_COUNT-1; k++)); do
      prev=$((k-2))
      cur=$((k-1))
      FILTER_COMPLEX+="[cf${prev}][${k}:a]acrossfade=d=0.3:c1=tri:c2=tri[cf${cur}];"
    done
    # Final pair: last intermediate output and last input → [out]
    lastIntermediate=$((NORM_COUNT-3))
    lastInput=$((NORM_COUNT-1))
    FILTER_COMPLEX+="[cf${lastIntermediate}][${lastInput}:a]acrossfade=d=0.3:c1=tri:c2=tri[out]"
  fi

  ffmpeg -y -loglevel error \
    "${INPUT_ARGS[@]}" \
    -filter_complex "$FILTER_COMPLEX" \
    -map "[out]" \
    -ar 44100 -ac 2 -b:a 192k -codec:a libmp3lame \
    -id3v2_version 3 \
    -metadata title="$TITLE" \
    -metadata artist="$PUBLISHER" \
    -metadata album="$SHOW" \
    -metadata album_artist="$PUBLISHER" \
    -metadata date="$YEAR" \
    -metadata copyright="$COPYRIGHT" \
    -metadata genre="$GENRE" \
    -metadata publisher="$PUBLISHER" \
    -metadata comment="$COMMENT" \
    -metadata track="$EPISODE_NUM" \
    -metadata disc="$YEAR" \
    "$OUTPUT"
else
  # Fallback for >32 segments: use concat demuxer (hard cuts) to avoid
  # ffmpeg filter_complex limits, then warn.
  echo "  Warning: ${NORM_COUNT} segments exceeds crossfade limit (32). Using hard-cut concat."
  LIST="$TMPDIR/concat-list.txt"
  : > "$LIST"
  for f in "${NORM_FILES[@]}"; do
    esc="${f//\'/\'\\\'\'}"
    printf "file '%s'\n" "$esc" >> "$LIST"
  done
  ffmpeg -y -loglevel error -f concat -safe 0 -i "$LIST" \
    -c copy \
    -id3v2_version 3 \
    -metadata title="$TITLE" \
    -metadata artist="$PUBLISHER" \
    -metadata album="$SHOW" \
    -metadata album_artist="$PUBLISHER" \
    -metadata date="$YEAR" \
    -metadata copyright="$COPYRIGHT" \
    -metadata genre="$GENRE" \
    -metadata publisher="$PUBLISHER" \
    -metadata comment="$COMMENT" \
    -metadata track="$EPISODE_NUM" \
    -metadata disc="$YEAR" \
    "$OUTPUT"
fi

# --- loudness normalization to -16 LUFS (EBU R128 podcast standard) ----------
#
# Runs FIRST on the speech-only file, before background music is mixed in.
# This ensures the speech is at the correct loudness target before blending.

echo "Normalizing loudness to -16 LUFS (speech only, pre-music)..."
LOUDNORM_TMP="$TMPDIR/loudnorm.mp3"
ffmpeg -y -loglevel error \
  -i "$OUTPUT" \
  -filter:a "loudnorm=I=-16:TP=-1.5:LRA=11:print_format=none" \
  -ar 44100 -ac 2 -b:a 192k -codec:a libmp3lame \
  -map_metadata 0 -id3v2_version 3 \
  "$LOUDNORM_TMP" && mv "$LOUDNORM_TMP" "$OUTPUT"

# --- background music mix (Podcast Background.mp3, optional) -----------------
#
# Mixed in AFTER loudnorm so the speech level is already correct.
# Background music is looped seamlessly using aloop and mixed at 5% volume.
# The background track fades in gently at the start and fades out at the end.
# Speech does NOT fade — only the background music track fades.

BG_MUSIC="$SOUNDS/Podcast Background.mp3"
if [ -f "$BG_MUSIC" ]; then
  echo "Mixing background music (seamless loop, 5% volume, post-loudnorm)..."
  SPEECH_DURATION=$(ffprobe -v error -show_entries format=duration \
    -of default=noprint_wrappers=1:nokey=1 "$OUTPUT" 2>/dev/null || echo "0")
  # Compute fade-out start time (4 seconds before end, minimum 0).
  FADE_OUT_ST=$(python3 -c "print(max(0, float(${SPEECH_DURATION}) - 4))")
  BG_TMP="$TMPDIR/with-bg.mp3"
  ffmpeg -y -loglevel error \
    -i "$OUTPUT" \
    -stream_loop -1 -i "$BG_MUSIC" \
    -filter_complex "[1:a]aloop=loop=-1:size=2147483647,atrim=duration=${SPEECH_DURATION},afade=t=in:st=0:d=3,afade=t=out:st=${FADE_OUT_ST}:d=4,volume=0.05[bg];[0:a][bg]amix=inputs=2:duration=first:dropout_transition=0[out]" \
    -map "[out]" \
    -ar 44100 -ac 2 -b:a 192k -codec:a libmp3lame \
    "$BG_TMP" && mv "$BG_TMP" "$OUTPUT"
  echo "  Background music mixed (5% volume, ${SPEECH_DURATION}s loop)."
else
  echo "  (Podcast Background.mp3 not found in $SOUNDS — skipping background music)"
fi

# --- copy metadata file to Episodes + patch File Size -----------------------

METADATA_SRC="$CHUNKS/The Morning Cup - $DATE - Metadata.txt"
METADATA_OUT="$EPISODES/The Morning Cup - $DATE - Metadata.txt"
if [ -f "$METADATA_SRC" ]; then
  cp "$METADATA_SRC" "$METADATA_OUT"
  # Patch the File Size placeholder with the real byte count of the assembled MP3.
  # The VNewsOS Auto-Episode import block reads this field for the RSS enclosure.
  if [ -f "$OUTPUT" ]; then
    FILE_SIZE_BYTES=$(wc -c < "$OUTPUT" | tr -d ' ')
    sed -i.bak "s|^File Size: .*|File Size: $FILE_SIZE_BYTES|" "$METADATA_OUT" \
      && rm -f "$METADATA_OUT.bak"
    echo "Metadata: $METADATA_OUT  (File Size: ${FILE_SIZE_BYTES} bytes)"
  else
    echo "Metadata: $METADATA_OUT"
  fi
else
  echo "Warning: metadata file not found in chunks folder; run fetch-chunks.sh first." >&2
fi

# --- chapter markers (CTOC + CHAP ID3 frames) --------------------------------

WRITE_CHAPTERS_PY="$(dirname "$0")/write-chapters.py"
if [ -f "$WRITE_CHAPTERS_PY" ]; then
  python3 "$WRITE_CHAPTERS_PY" "$OUTPUT" "$MANIFEST" "$SOUNDS" "$CHUNKS" || \
    echo "Warning: chapter-marker writing failed; episode is still rendered." >&2
else
  echo "Warning: write-chapters.py not found alongside build-episode.sh; skipping chapter markers." >&2
fi

# --- summary -----------------------------------------------------------------

SIZE=$(du -h "$OUTPUT" | cut -f1)
DURATION=$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$OUTPUT" 2>/dev/null \
  | python3 -c "import sys; s=float(sys.stdin.read().strip()); m=int(s//60); sec=int(s%60); print(f'{m}:{sec:02d}')")

echo ""
echo "Done."
echo "  File:     $OUTPUT"
echo "  Size:     $SIZE"
echo "  Duration: $DURATION"
echo ""
echo "ID3 tags:"
echo "  title:     $TITLE"
echo "  artist:    $PUBLISHER"
echo "  album:     $SHOW"
echo "  date:      $YEAR"
echo "  copyright: $COPYRIGHT"
echo "  genre:     $GENRE"
echo "  comment:   $COMMENT"
echo "  track:     $EPISODE_NUM  (day of year)"
echo "  disc:      $YEAR  (season)"
