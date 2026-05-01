// src/config.ts
//
// Runtime configuration. The active show is selected via SHOW_KEY (set in
// wrangler.<show-key>.toml). Per-show values come from shows/<show-key>/
// config.ts; worker-wide values come from env vars / secrets.

import type { Env } from "./types";
import { getShow, type ShowConfig } from "./show";

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

export interface Config extends ShowConfig {
  // Loaded from the show registry alongside the show config.
  prompt: string;

  // Worker-wide
  openaiModel: string;
  elevenLabsModelId: string;
  elevenLabsOutputFormat: string;
  workerTimezone: string;

  // Pipeline behavior
  enableEmail: boolean;
  enableSourceDigest: boolean;
  enableRepairPass: boolean;
  stripPacingTagsForTts: boolean;
  statusPublic: boolean;
  enablePublishing: boolean;

  // Email + R2 public access
  emailFrom: string;
  emailTo: string;
  r2PublicBaseUrl: string;

  // WordPress (org-wide; per-show pieces come from ShowConfig)
  wpUrl: string;
  wpCptSlug: string;
  wpPodcastShowTaxonomy: string;

  voice: {
    stability: number;
    similarityBoost: number;
    style: number;
    useSpeakerBoost: boolean;
  };
}

export function loadConfig(env: Env): Config {
  if (!env.SHOW_KEY) {
    throw new Error("SHOW_KEY env var is required (set in wrangler.<show-key>.toml)");
  }
  const { config: show, prompt } = getShow(env.SHOW_KEY);

  return {
    // Show config (per-show)
    ...show,

    // Active prompt for this show
    prompt,

    // Worker-wide
    openaiModel: str(env.OPENAI_MODEL, "gpt-5-mini"),
    elevenLabsModelId: str(env.ELEVENLABS_MODEL_ID, "eleven_multilingual_v2"),
    elevenLabsOutputFormat: str(env.ELEVENLABS_OUTPUT_FORMAT, "mp3_44100_128"),
    workerTimezone: str(env.WORKER_TIMEZONE, "America/New_York"),

    // Pipeline behavior
    enableEmail: bool(env.ENABLE_EMAIL, false),
    enableSourceDigest: bool(env.ENABLE_SOURCE_DIGEST, true),
    enableRepairPass: bool(env.ENABLE_REPAIR_PASS, true),
    stripPacingTagsForTts: bool(env.STRIP_PACING_TAGS_FOR_TTS, true),
    statusPublic: bool(env.STATUS_PUBLIC, false),
    enablePublishing: bool(env.ENABLE_PUBLISHING, false),

    emailFrom: str(env.EMAIL_FROM, ""),
    emailTo: str(env.EMAIL_TO, ""),
    r2PublicBaseUrl: str(env.R2_PUBLIC_BASE_URL, ""),

    // WordPress (org-wide)
    wpUrl: str(env.WP_URL, ""),
    wpCptSlug: str(env.WP_CPT_SLUG, "serve_episode"),
    wpPodcastShowTaxonomy: str(env.WP_PODCAST_SHOW_TAXONOMY, "serve_podcast_category"),

    voice: {
      stability: num(env.VOICE_STABILITY, 0.35),
      similarityBoost: num(env.VOICE_SIMILARITY_BOOST, 0.85),
      style: num(env.VOICE_STYLE, 0.7),
      useSpeakerBoost: bool(env.VOICE_USE_SPEAKER_BOOST, true),
    },
  };
}
