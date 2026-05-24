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
import { stripInlineAnnotations } from "./utils/text";

// ---------------------------------------------------------------------------
// Pronunciation dictionary — hardcoded from data/pronunciation-dictionary.json.
// The JSON file is the source of truth; this object is the embedded runtime
// copy for the Cloudflare Worker (Workers cannot read files at runtime).
// ---------------------------------------------------------------------------

// Entries where the key is a proper noun or acronym (case-sensitive match).
//
// IMPORTANT — ElevenLabs is a neural TTS engine, NOT a phoneme synthesizer.
// It reads text as written. Rules for substitutions:
//   ✅ Use plain phonetic respellings ElevenLabs can read as one natural word
//   ✅ Use spaces to separate syllables that need a beat between them
//   ❌ NEVER use hyphens — ElevenLabs renders them as audible pauses/breaks
//   ❌ NEVER use ALL-CAPS stress markers — ElevenLabs may read them as acronyms
//   ❌ Don't add an entry for words ElevenLabs already pronounces correctly
//
// Trim this list aggressively. Most international proper nouns (Iran, Qatar,
// Hamas, Netanyahu, Zelensky, Macron, Beijing, etc.) are already in
// ElevenLabs' training data and pronounced correctly. Only add entries for
// words that have been confirmed broken in a real episode.
const CASE_SENSITIVE_SUBSTITUTIONS: Record<string, string> = {
  // Show-specific terms ElevenLabs has no training data for
  "pennydoesnews": "penny does news",
  "Fold 42": "Fold forty two",

  // Acronyms / initialisms — spell them out with spaces so each letter is read
  "LGBTQ+": "L G B T Q plus",
  "COVID-19": "COVID nineteen",
  "AOC": "A O C",
  "TSMC": "T S M C",
  "GPT": "G P T",
  "ChatGPT": "Chat G P T",
  "OpenAI": "Open A I",
  "PFAS": "P faas",
  "PFOA": "P F O A",
  "PFOS": "P F O S",
  "PCBs": "P C Bs",

  // Words ElevenLabs consistently gets wrong — confirmed from real episodes.
  // Add entries here only after hearing the mispronunciation in a generated MP3.
  // Use plain respelling without hyphens, e.g. "Buttigieg": "Boota jej"
  "Buttigieg": "Boota jej",
  "Xinjiang": "Shin jyang",
  "Guantanamo": "Gwahn tahnamo",

  // World leaders / politicians — Arabic and Persian names
  "Khamenei": "Kha meh nay ee",
  "Rouhani": "Roo hah nee",
  "Zarif": "Zah reef",
  "Raisi": "Rah ee see",
  "Nasrallah": "Nas rah lah",
  "Sinwar": "Sin war",
  "Haniyeh": "Hah nee yeh",
  "Mahmoud Khalil": "Mahmood Kahleel",

  // World leaders / politicians — Slavic names
  "Zelenskyy": "Zeh LEN skee",
  "Zelensky": "Zeh LEN skee",
  "Lukashenko": "Loo kah SHEN koh",
  "Medvedev": "Med VEH dev",
  "Lavrov": "Lah vrof",
  "Shoigu": "Shoy goo",
  "Volodymyr": "Vohlohdimeer",

  // World leaders / politicians — Turkish names
  "Erdogan": "Airdohahn",

  // East Asian names
  "Xi Jinping": "Shee Jin ping",

  // Key names from recent news
  "Alejandro Mayorkas": "Alehhandro MyORkahs",
  "Ilhan Omar": "Ilhan Ohmar",
  "Rashida Tlaib": "Rahsheedah Tlayib",
  "Jamal Khashoggi": "Jahmal Kahshohgee",

  // Geography — places ElevenLabs mispronounces
  "Kyiv": "Keev",
  "Qatar": "Kutter",
  "Riyadh": "Ree yahd",
  "Tehran": "Tehrahn",
  "Kabul": "Kahbool",
  "Rafah": "Rahfah",
  "Tigray": "Tih gray",
  "Sahel": "Sahell",
  "Mogadishu": "Mohgadishoo",
  "Houthis": "Hootheez",

  // Medications — phonetic aliases for names that appear in news coverage
  "mifepristone": "my feh pris tone",
  "semaglutide": "sema glootide",
  "tirzepatide": "tur zeh pah tide",
  "pembrolizumab": "pem broh liz oo mab",
  "nivolumab": "ny vol yoo mab",
  "adalimumab": "adalihmyoomab",
  "empagliflozin": "empagliflohzin",
  "dapagliflozin": "dapagliflohzin",
  "buprenorphine": "byooprehnorfeen",
  "naloxone": "naloxohn",
  "hydroxychloroquine": "hy droxy chloro kwin",
  "ivermectin": "eyevermektin",
  "remdesivir": "remdehsiveer",
  "molnupiravir": "molnoopeeraveer",
  "nirmatrelvir": "nirmahtrelveer",
  "fentanyl": "fentanil",
  "naltrexone": "naltrexohn",
  "methotrexate": "methohtreksate",
  "trastuzumab": "trastooozoomab",
  "bevacizumab": "behvahsizyoomab",
  "atezolizumab": "atezohlizooomab",
  "cabozantinib": "kabohzantinib",

  // Chemical names that appear in news
  "trichloroethylene": "triklohrohethileen",
  "perchloroethylene": "perklohrohethileen",
  "polychlorinated biphenyls": "polykhlorinayted bifeehnilz",
  "hexavalent chromium": "hexavaylent krohmeeuhm",
};

// Entries for common words/acronyms — case-insensitive match.
// Same rules: plain respelling, no hyphens, no ALL-CAPS stress markers.
// Covers medical and chemical terms that may appear in various casing in scripts.
const CASE_INSENSITIVE_SUBSTITUTIONS: Record<string, string> = {
  // Add confirmed mispronunciations from real episodes here.
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
 *
 * Uses MPEG1 Layer 3, 192 kbps, 44100 Hz, stereo — matching the output format
 * used for all ElevenLabs chunks. Frame size for 192 kbps at 44100 Hz:
 *   144 × 192000 / 44100 = 626 bytes per frame, 26.122 ms per frame.
 *
 * Frame header bytes (RFC MPEG1/Layer3):
 *   0xFF 0xFB — sync word (12 bits) + MPEG1 (11) + Layer3 (01) + no CRC (1)
 *   0xB0      — bitrate 1011=192kbps + sample rate 00=44100Hz + no pad + priv=0
 *   0x00      — stereo (00) + no mode ext + no copyright + not original + no emphasis
 *
 * Remaining 622 bytes are zero-filled audio data (valid silent frame).
 * new Uint8Array(n) is zero-initialized per spec, so only the 4-byte header
 * needs to be written per frame — the rest is already correct.
 */
function generateSilentMp3(durationSeconds: number): ArrayBuffer {
  // 192 kbps, 44100 Hz stereo: frame = 626 bytes, duration = 26.122 ms
  const FRAME_SIZE_BYTES = 626;
  const FRAME_DURATION_MS = 26.122;

  const framesNeeded = Math.ceil((durationSeconds * 1000) / FRAME_DURATION_MS);
  // Uint8Array is zero-initialized — only write the 4-byte header per frame.
  const buffer = new Uint8Array(framesNeeded * FRAME_SIZE_BYTES);
  for (let i = 0; i < framesNeeded; i++) {
    const offset = i * FRAME_SIZE_BYTES;
    buffer[offset]     = 0xff; // sync
    buffer[offset + 1] = 0xfb; // sync + MPEG1 + Layer3 + no-CRC
    buffer[offset + 2] = 0xb0; // 192kbps + 44100Hz + no-pad
    buffer[offset + 3] = 0x00; // stereo + no emphasis
    // bytes [4..625] remain 0x00 — valid silent audio data
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
      // Strip inline phonetic annotations the model sometimes writes, e.g.
      // "Iran [ee-RAN]" — brackets are read literally by ElevenLabs.
      const annotationStripped = stripInlineAnnotations(part);
      const processed = applyPronunciationDictionary(annotationStripped);
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
