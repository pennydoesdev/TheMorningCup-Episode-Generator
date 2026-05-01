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

  enableEmail: boolean;
  enableSourceDigest: boolean;
  enableRepairPass: boolean;
  stripPacingTagsForTts: boolean;
  statusPublic: boolean;

  emailFrom: string;
  emailTo: string;
  r2PublicBaseUrl: string;

  publisher: string;
  copyrightHolder: string;
  podcastGenre: string;
  hostName: string;

  // Publishing pipeline
  enablePublishing: boolean;
  googleDriveFolderId: string;
  wpUrl: string;
  wpCptSlug: string;
  wpPodcastShowTaxonomy: string;
  wpPodcastShowTerm: string;
  wpParentPodcastId: number;

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

    minScriptWords: num(env.MIN_SCRIPT_WORDS, 3300),
    targetScriptWordsMin: num(env.TARGET_SCRIPT_WORDS_MIN, 3300),
    targetScriptWordsMax: num(env.TARGET_SCRIPT_WORDS_MAX, 3700),
    maxScriptWords: num(env.MAX_SCRIPT_WORDS, 3900),
    wordsPerMinute: num(env.WORDS_PER_MINUTE, 145),

    maxTtsCharsPerChunk: num(env.MAX_TTS_CHARS_PER_CHUNK, 2500),

    enableEmail: bool(env.ENABLE_EMAIL, true),
    enableSourceDigest: bool(env.ENABLE_SOURCE_DIGEST, true),
    enableRepairPass: bool(env.ENABLE_REPAIR_PASS, true),
    stripPacingTagsForTts: bool(env.STRIP_PACING_TAGS_FOR_TTS, true),
    statusPublic: bool(env.STATUS_PUBLIC, false),

    emailFrom: str(env.EMAIL_FROM, ""),
    emailTo: str(env.EMAIL_TO, ""),
    r2PublicBaseUrl: str(env.R2_PUBLIC_BASE_URL, ""),

    publisher: str(env.PUBLISHER, "The Penny Tribune"),
    copyrightHolder: str(env.COPYRIGHT_HOLDER, "The Penny Tribune"),
    podcastGenre: str(env.PODCAST_GENRE, "News"),
    hostName: str(env.HOST_NAME, "Penelope Rose"),

    enablePublishing: bool(env.ENABLE_PUBLISHING, false),
    googleDriveFolderId: str(env.GOOGLE_DRIVE_FOLDER_ID, ""),
    wpUrl: str(env.WP_URL, ""),
    wpCptSlug: str(env.WP_CPT_SLUG, "serve_episode"),
    wpPodcastShowTaxonomy: str(env.WP_PODCAST_SHOW_TAXONOMY, "serve_podcast_category"),
    wpPodcastShowTerm: str(env.WP_PODCAST_SHOW_TERM, "The Morning Cup"),
    wpParentPodcastId: num(env.WP_PARENT_PODCAST_ID, 0),

    voice: {
      stability: num(env.VOICE_STABILITY, 0.35),
      similarityBoost: num(env.VOICE_SIMILARITY_BOOST, 0.85),
      style: num(env.VOICE_STYLE, 0.7),
      useSpeakerBoost: bool(env.VOICE_USE_SPEAKER_BOOST, true),
    },
  };
}
