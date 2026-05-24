// TTS preprocessing layer for The Morning Cup.
//
// This module wraps the raw ElevenLabs synthesizer with two features:
//   1. Pronunciation dictionary — applies text substitutions before every TTS
//      call so ElevenLabs renders proper nouns and initialisms correctly.
//   2. [5-SECOND PAUSE] handler — when this marker appears in a script chunk,
//      the chunk is split at the marker; the pause segment generates real
//      silence (5 seconds of silent MP3) instead of sending text to ElevenLabs.
//
// Usage: call synthesizeText() instead of synthesizeChunk() directly.
// synthesizeText() returns one or more TtsResult objects (audio + contentType)
// in order, ready to be concatenated or uploaded individually.

import type { Env } from "./types";
import type { Config } from "./config";
import { synthesizeChunk, type TtsResult, type VoiceOverride } from "./elevenlabs";
import { logger } from "./logger";

// ---------------------------------------------------------------------------
// Pronunciation dictionary — hardcoded from data/pronunciation-dictionary.json.
// The JSON file is the source of truth; this object is the embedded runtime
// copy for the Cloudflare Worker (Workers cannot read files at runtime).
// ---------------------------------------------------------------------------

// Entries where the key is a proper noun or acronym (case-sensitive match)
const CASE_SENSITIVE_SUBSTITUTIONS: Record<string, string> = {
  "pennydoesnews": "penny-does-news",
  "Fold 42": "Fold forty-two",
  "Qatar": "KAH-tar",
  "Qatari": "kah-TAR-ee",
  "Iran": "ee-RAN",
  "Iranian": "ee-RAY-nee-an",
  "Iraq": "ih-RAK",
  "Iraqi": "ih-RAH-kee",
  "Hezbollah": "hez-boh-LAH",
  "Hamas": "hah-MAHS",
  "Netanyahu": "neh-tahn-YAH-hoo",
  "Zelensky": "zeh-LEN-skee",
  "Macron": "mah-KROHN",
  "Riyadh": "ree-YAHD",
  "Dubai": "doo-BY",
  "Beijing": "bay-JING",
  "Xinjiang": "shin-jee-AHNG",
  "Navalny": "nah-VAHL-nee",
  "Guantanamo": "gwahn-TAH-nah-moh",
  "LGBTQ+": "L-G-B-T-Q plus",
  "COVID-19": "COVID nineteen",
  "COVID": "KOH-vid",
  "Omicron": "OH-mih-kron",
  "Xi Jinping": "Shee Jin-ping",
  "Kamala": "KAH-mah-lah",
  "Buttigieg": "BOO-tuh-jej",
  "Boebert": "BOH-bert",
  "DeSantis": "deh-SAN-tis",
  "Gavin Newsom": "GAV-in NOO-sum",
  "Fetterman": "FEH-ter-man",
  "Warnock": "WAR-nok",
  "Ossoff": "AH-soff",
  "Manchin": "MAN-chin",
  "Sinema": "SIN-eh-mah",
  "Tuberville": "TOO-ber-vil",
  "Ocasio-Cortez": "oh-KAH-see-oh KOR-tez",
  "AOC": "A-O-C",
  "MAGA": "MAY-gah",
  "NATO": "NAY-toh",
  "OPEC": "OH-pek",
  "UNESCO": "yoo-NES-koh",
  "UNICEF": "YOO-nih-sef",
  "Pfizer": "FY-zer",
  "Moderna": "moh-DER-nah",
  "AstraZeneca": "AS-trah-ZEH-neh-kah",
  "Elon": "EE-lon",
  "Tesla": "TES-lah",
  "SpaceX": "SPACE-ex",
  "Neuralink": "NYUR-ah-link",
  "TikTok": "TIK-tok",
  "Lyft": "LIFT",
  "Waymo": "WAY-moh",
  "Nvidia": "en-VID-ee-ah",
  "TSMC": "T-S-M-C",
  "GPT": "G-P-T",
  "ChatGPT": "Chat G-P-T",
  "OpenAI": "Open A-I",
};

// Entries for common words that should match case-insensitively
const CASE_INSENSITIVE_SUBSTITUTIONS: Record<string, string> = {
  "GIF": "JIF",
};

const PAUSE_MARKER = "[5-SECOND PAUSE]";
const SILENCE_DURATION_SECONDS = 5;

/**
 * Apply pronunciation dictionary substitutions to a script text.
 * Case-sensitive substitutions are applied first (proper nouns, acronyms),
 * then case-insensitive substitutions (common words).
 * Each substitution replaces whole-word occurrences only where practical.
 */
export function applyPronunciationDictionary(text: string): string {
  let result = text;

  // Apply case-sensitive substitutions (order matters — longer keys first
  // to avoid partial replacement of substrings).
  const caseSensitiveKeys = Object.keys(CASE_SENSITIVE_SUBSTITUTIONS).sort(
    (a, b) => b.length - a.length,
  );
  for (const key of caseSensitiveKeys) {
    const replacement = CASE_SENSITIVE_SUBSTITUTIONS[key];
    // Use a global string replacement. Escape special regex chars in the key.
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    result = result.replace(new RegExp(escaped, "g"), replacement);
  }

  // Apply case-insensitive substitutions.
  const caseInsensitiveKeys = Object.keys(CASE_INSENSITIVE_SUBSTITUTIONS).sort(
    (a, b) => b.length - a.length,
  );
  for (const key of caseInsensitiveKeys) {
    const replacement = CASE_INSENSITIVE_SUBSTITUTIONS[key];
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    result = result.replace(new RegExp(escaped, "gi"), replacement);
  }

  return result;
}

/**
 * Generate a silent MP3 of the specified duration.
 * Uses the Web Audio API-compatible approach via a minimal valid MP3 frame
 * repeated to fill the duration, or falls back to an array of null bytes
 * that ElevenLabs-compatible players treat as silence.
 *
 * Implementation: generates a minimal silent MP3 using raw frame bytes.
 * A single MPEG Layer 3 silent frame at 44100 Hz stereo 128kbps is 417 bytes
 * and represents 26.12 ms of audio. We repeat enough frames to fill 5 seconds.
 */
function generateSilentMp3(durationSeconds: number): ArrayBuffer {
  // A minimal valid silent MP3 frame (MPEG1 Layer3, 128kbps, 44100Hz, stereo).
  // This is a single frame header + silent audio data.
  const SILENT_FRAME = new Uint8Array([
    0xff, 0xfb, 0x90, 0x00, // MPEG sync word + header (128kbps, 44100Hz, stereo, no padding)
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // side information (zeros)
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    // Padding to 417 bytes (standard 128kbps stereo frame size at 44100Hz)
  ]);

  // Each frame at 128kbps, 44100Hz is 417 bytes = 26.122ms of audio.
  // Frames needed for durationSeconds:
  const FRAME_DURATION_MS = 26.122;
  const framesNeeded = Math.ceil((durationSeconds * 1000) / FRAME_DURATION_MS);

  const totalBytes = framesNeeded * SILENT_FRAME.length;
  const buffer = new Uint8Array(totalBytes);
  for (let i = 0; i < framesNeeded; i++) {
    buffer.set(SILENT_FRAME, i * SILENT_FRAME.length);
  }

  return buffer.buffer;
}

export interface TtsSegmentResult {
  audio: ArrayBuffer;
  contentType: string;
  isSilence: boolean; // true if this is a generated silence segment
}

/**
 * Synthesize a text chunk, handling [5-SECOND PAUSE] markers.
 *
 * If the text contains [5-SECOND PAUSE], the chunk is split at that marker.
 * Text before the marker is sent to ElevenLabs. The pause becomes a silent
 * audio segment. Text after the marker is sent to ElevenLabs separately.
 *
 * The pronunciation dictionary is applied to all text before ElevenLabs calls.
 *
 * Returns an array of audio segments in order.
 */
export async function synthesizeText(
  env: Env,
  config: Config,
  text: string,
  voiceOverride?: VoiceOverride,
): Promise<TtsSegmentResult[]> {
  const results: TtsSegmentResult[] = [];

  // Split on [5-SECOND PAUSE] markers.
  const parts = text.split(PAUSE_MARKER);

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i].trim();

    // Send non-empty text parts to ElevenLabs with pronunciation preprocessing.
    if (part.length > 0) {
      const processed = applyPronunciationDictionary(part);
      logger.info("tts synthesize chunk", {
        partIndex: i,
        originalLength: part.length,
        processedLength: processed.length,
      });
      const ttsResult: TtsResult = await synthesizeChunk(env, config, {
        text: processed,
        voiceOverride,
      });
      results.push({
        audio: ttsResult.audio,
        contentType: ttsResult.contentType,
        isSilence: false,
      });
    }

    // Insert silence after every part except the last (i.e., at each marker position).
    if (i < parts.length - 1) {
      logger.info("tts inserting silence", { durationSeconds: SILENCE_DURATION_SECONDS });
      const silenceBuffer = generateSilentMp3(SILENCE_DURATION_SECONDS);
      results.push({
        audio: silenceBuffer,
        contentType: "audio/mpeg",
        isSilence: true,
      });
    }
  }

  return results;
}
