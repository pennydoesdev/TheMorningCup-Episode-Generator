import type { Env } from "./types";

function num(value: string | undefined, fallback: number): number {
  if (value === undefined || value === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === "") return fallback;
  return value.toLowerCase() === "true" || value === "1";
}

function str(value: string | undefined, fallback: string): string {
  if (value === undefined || value === "") return fallback;
  return value;
}

export interface Config {
  openaiModel: string;
  elevenLabsModelId: string;
  elevenLabsOutputFormat: string;
  workerTimezone: string;

  minScriptWords: number;
  targetScriptWordsMin: number;
  targetScriptWordsMax: number;
  maxScriptWords: number;
  wordsPerMinute: number;

  maxTtsCharsPerChunk: number;

  enableSourceDigest: boolean;
  enableRepairPass: boolean;
  stripPacingTagsForTts: boolean;
  statusPublic: boolean;

  r2PublicBaseUrl: string;

  publisher: string;
  copyrightHolder: string;
  podcastGenre: string;
  hostName: string;
  showTitle: string;       // "The Morning Cup" — used in file names, titles, validator
  r2KeyPrefix: string;     // "Generators/Podcasts/TheMorningCup" — R2 storage path prefix

  wpPodcastId: number;          // vicinity_podcast WP post ID (0 = not configured)
  audioCdnBaseUrl: string;      // New CDN base URL for final stitched MP3 (empty = placeholder)
  audioCdnBaseUrlLegacy: string; // Legacy CDN base URL — written as Direct Audio: for migration fallback
  wpCategories: string;         // Comma-separated default WP category names for episode posts

  voice: {
    stability: number;
    similarityBoost: number;
    style: number;
    useSpeakerBoost: boolean;
  };
}

export function loadConfig(env: Env): Config {
  return {
    openaiModel: str(env.OPENAI_MODEL, "gpt-4.1"),
    elevenLabsModelId: str(env.ELEVENLABS_MODEL_ID, "eleven_multilingual_v2"),
    elevenLabsOutputFormat: str(env.ELEVENLABS_OUTPUT_FORMAT, "mp3_44100_128"),
    workerTimezone: str(env.WORKER_TIMEZONE, "America/New_York"),

    minScriptWords: num(env.MIN_SCRIPT_WORDS, 2175),
    targetScriptWordsMin: num(env.TARGET_SCRIPT_WORDS_MIN, 2200),
    targetScriptWordsMax: num(env.TARGET_SCRIPT_WORDS_MAX, 2400),
    maxScriptWords: num(env.MAX_SCRIPT_WORDS, 2465),
    wordsPerMinute: num(env.WORDS_PER_MINUTE, 145),

    maxTtsCharsPerChunk: num(env.MAX_TTS_CHARS_PER_CHUNK, 5000),

    enableSourceDigest: bool(env.ENABLE_SOURCE_DIGEST, true),
    enableRepairPass: bool(env.ENABLE_REPAIR_PASS, true),
    stripPacingTagsForTts: bool(env.STRIP_PACING_TAGS_FOR_TTS, true),
    statusPublic: bool(env.STATUS_PUBLIC, false),

    r2PublicBaseUrl: str(env.R2_PUBLIC_BASE_URL, ""),

    publisher: str(env.PUBLISHER, "Fold 42"),
    copyrightHolder: str(env.COPYRIGHT_HOLDER, "Fold 42"),
    podcastGenre: str(env.PODCAST_GENRE, "News"),
    hostName: str(env.HOST_NAME, "Penelope Rose"),
    showTitle: str(env.SHOW_TITLE, "The Morning Cup"),
    r2KeyPrefix: str(env.R2_KEY_PREFIX, "Generators/Podcasts/TheMorningCup"),

    wpPodcastId: num(env.WORDPRESS_PODCAST_ID, 0),
    audioCdnBaseUrl: str(env.AUDIO_CDN_BASE_URL, ""),
    audioCdnBaseUrlLegacy: str(env.AUDIO_CDN_BASE_URL_LEGACY, ""),
    wpCategories: str(env.WORDPRESS_CATEGORIES, ""),

    voice: {
      stability: num(env.VOICE_STABILITY, 0.35),
      similarityBoost: num(env.VOICE_SIMILARITY_BOOST, 0.85),
      style: num(env.VOICE_STYLE, 0.7),
      useSpeakerBoost: bool(env.VOICE_USE_SPEAKER_BOOST, true),
    },
  };
}
