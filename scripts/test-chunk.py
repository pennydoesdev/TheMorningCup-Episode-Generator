#!/usr/bin/env python3
"""
test-chunk.py  —  Generate a single TTS test chunk via ElevenLabs.

Usage:
    python3 scripts/test-chunk.py "Your script text here."
    python3 scripts/test-chunk.py --file /path/to/script-excerpt.txt
    python3 scripts/test-chunk.py --stdin              # reads from stdin

Output:
    ~/Documents/The Morning Cup/Chunks/test/test-chunk-<timestamp>.mp3

Requires:
    - ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID in ~/Documents/The Morning Cup/.env
    - pip install requests python-dotenv
"""

import argparse
import json
import os
import sys
import time
from pathlib import Path

ROOT = Path.home() / "Documents" / "The Morning Cup"
ENV_FILE = ROOT / ".env"
CHUNKS_BASE = ROOT / "Chunks"

# --- load env ----------------------------------------------------------------

def load_env():
    env = {}
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" in line:
                k, _, v = line.partition("=")
                env[k.strip()] = v.strip().strip('"').strip("'")
    # Override with real environment variables
    for k in ("ELEVENLABS_API_KEY", "ELEVENLABS_VOICE_ID",
              "VOICE_STABILITY", "VOICE_SIMILARITY_BOOST",
              "VOICE_STYLE", "VOICE_USE_SPEAKER_BOOST",
              "ELEVENLABS_MODEL_ID", "ELEVENLABS_OUTPUT_FORMAT"):
        if k in os.environ:
            env[k] = os.environ[k]
    return env


# --- strip pacing tags -------------------------------------------------------

import re

def strip_pacing_tags(text: str) -> str:
    """Remove [TEN-SECOND SECTION SPACER] and other bracketed pacing markers."""
    # Remove spacer markers
    text = re.sub(r'\[TEN-SECOND SECTION SPACER\]', '', text, flags=re.IGNORECASE)
    # Remove delivery markers like [beat], [pause], [warmly], [lower], etc.
    text = re.sub(r'\[(pause|beat|gentle pause|reflective pause|lower|firmer|warmly|gently|softly)\]',
                  '', text, flags=re.IGNORECASE)
    # Collapse multiple blank lines
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()


# --- ElevenLabs TTS ----------------------------------------------------------

def generate_chunk(text: str, env: dict, output_path: Path) -> None:
    try:
        import requests
    except ImportError:
        print("ERROR: 'requests' not installed. Run: pip install requests", file=sys.stderr)
        sys.exit(1)

    api_key  = env.get("ELEVENLABS_API_KEY", "")
    voice_id = env.get("ELEVENLABS_VOICE_ID", "")
    if not api_key or not voice_id:
        print("ERROR: ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID must be set.", file=sys.stderr)
        print(f"       Add them to {ENV_FILE}", file=sys.stderr)
        sys.exit(1)

    model_id      = env.get("ELEVENLABS_MODEL_ID", "eleven_multilingual_v2")
    output_format = env.get("ELEVENLABS_OUTPUT_FORMAT", "mp3_44100_128")
    stability     = float(env.get("VOICE_STABILITY", "0.28"))
    similarity    = float(env.get("VOICE_SIMILARITY_BOOST", "0.85"))
    style         = float(env.get("VOICE_STYLE", "0.45"))
    speaker_boost = env.get("VOICE_USE_SPEAKER_BOOST", "true").lower() == "true"

    cleaned = strip_pacing_tags(text)
    char_count = len(cleaned)
    print(f"  Text length: {char_count} characters")
    if char_count > 5000:
        print(f"WARNING: text is {char_count} chars — ElevenLabs limit is 5000 per request.")
        print("         Truncating to 5000 chars for this test.")
        cleaned = cleaned[:5000]

    url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
    headers = {
        "xi-api-key":   api_key,
        "Content-Type": "application/json",
        "Accept":       "audio/mpeg",
    }
    params = {"output_format": output_format}
    payload = {
        "text":       cleaned,
        "model_id":   model_id,
        "voice_settings": {
            "stability":         stability,
            "similarity_boost":  similarity,
            "style":             style,
            "use_speaker_boost": speaker_boost,
        },
    }

    print(f"  Calling ElevenLabs ({model_id}, stability={stability}, style={style})...")
    resp = requests.post(url, headers=headers, params=params, json=payload, timeout=120)
    if not resp.ok:
        print(f"ERROR: ElevenLabs returned HTTP {resp.status_code}", file=sys.stderr)
        try:
            print(json.dumps(resp.json(), indent=2), file=sys.stderr)
        except Exception:
            print(resp.text[:500], file=sys.stderr)
        sys.exit(1)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_bytes(resp.content)
    size_kb = len(resp.content) // 1024
    print(f"  Saved: {output_path}  ({size_kb} KB)")


# --- main --------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Generate a single TTS test chunk via ElevenLabs."
    )
    group = parser.add_mutually_exclusive_group()
    group.add_argument("text", nargs="?", help="Script text as a CLI argument.")
    group.add_argument("--file", "-f", help="Path to a .txt file containing the script excerpt.")
    group.add_argument("--stdin", action="store_true", help="Read script text from stdin.")
    parser.add_argument("--output", "-o", help="Output MP3 path (default: auto-named in Chunks/test/).")
    args = parser.parse_args()

    # --- get text ---
    if args.stdin:
        print("Reading from stdin (Ctrl-D to finish)...")
        text = sys.stdin.read()
    elif args.file:
        p = Path(args.file)
        if not p.exists():
            print(f"ERROR: file not found: {p}", file=sys.stderr)
            sys.exit(1)
        text = p.read_text()
    elif args.text:
        text = args.text
    else:
        parser.print_help()
        sys.exit(2)

    text = text.strip()
    if not text:
        print("ERROR: no text provided.", file=sys.stderr)
        sys.exit(1)

    # --- output path ---
    if args.output:
        output_path = Path(args.output)
    else:
        ts = time.strftime("%Y%m%d-%H%M%S")
        output_path = CHUNKS_BASE / "test" / f"test-chunk-{ts}.mp3"

    # --- run ---
    env = load_env()
    print(f"\ntest-chunk.py — generating TTS test")
    print(f"  output: {output_path}")
    generate_chunk(text, env, output_path)

    # Try to open the file automatically on macOS
    if sys.platform == "darwin":
        os.system(f'open "{output_path}"')
    print("\nDone.")


if __name__ == "__main__":
    main()
