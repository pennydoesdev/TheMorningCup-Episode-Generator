// Serialization sidecar for The Morning Cup.
//
// Generates a JSON audit trail for every episode and stores it in R2.
// IDs are NEVER spoken aloud — this file is a behind-the-scenes record only.

import type { Env } from "./types";
import type { EpisodeJson, SourceNote } from "./types";
import type { Config } from "./config";
import type { FactCheckReport } from "./factcheck";
import { logger } from "./logger";

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export interface EpisodeSidecar {
  schemaVersion: "1.0";
  episodeId: string;       // e.g. "TMC-20260523-001"
  generatedAt: string;     // ISO timestamp
  episodeDate: string;     // YYYY-MM-DD

  production: {
    aiModel: string;        // e.g. "o3"
    factCheckModel: string; // e.g. "gpt-4o-mini"
    voiceProvider: string;  // "ElevenLabs"
    voiceModel: string;     // e.g. "eleven_multilingual_v2"
    voiceId: string;        // ElevenLabs voice ID (last 8 chars only for security)
    workerVersion: string;  // Cloudflare worker version or "unknown"
  };

  storage: {
    r2Bucket: string;
    r2KeyPrefix: string;
    manifestKey: string;
    audioKey: string;
    sidecarKey: string;
  };

  factCheck: {
    ranAt: string;
    claimsChecked: number;
    claimsRemoved: number;
    averageTrustScore: number;
  };

  quotes: QuoteRecord[];
  sources: SourceRecord[];
  statistics: StatRecord[];
  weatherMetrics: WeatherRecord[];
}

export interface QuoteRecord {
  id: string;         // e.g. "Q-20260523-001"
  speaker: string;
  text: string;
  source: string;
  verifiedAt: string;
}

export interface SourceRecord {
  id: string;         // e.g. "S-20260523-001"
  url: string;
  outlet: string;
  publishedDate: string;
  accessedAt: string;
}

export interface StatRecord {
  id: string;         // e.g. "STAT-20260523-001"
  claim: string;
  value: string;
  source: string;
  dataDate: string;
}

export interface WeatherRecord {
  id: string;         // e.g. "WX-20260523-001"
  location: string;
  temperature: string;
  conditions: string;
  source: string;
  observedAt: string;
}

// ---------------------------------------------------------------------------
// ID generators
// ---------------------------------------------------------------------------

/** Format a date as YYYYMMDD from a YYYY-MM-DD string. */
function datePart(episodeDate: string): string {
  return episodeDate.replace(/-/g, "");
}

function padSeq(n: number): string {
  return String(n).padStart(3, "0");
}

// ---------------------------------------------------------------------------
// Quote extraction
// ---------------------------------------------------------------------------

// Heuristic: look for quoted text in the script that follows an attribution verb.
const QUOTE_PATTERN =
  /(?:(?:President|Senator|Secretary|Governor|Mayor|CEO|Director|Minister|Chancellor|Representative|Attorney General|General|Judge|Justice)\s+)?([A-Z][A-Za-z\-']+(?:\s+[A-Z][A-Za-z\-']+){0,3})\s+(?:said|announced|stated|told reporters|wrote|noted|warned|added|explained|declared|argued|testified)\s*[:,]?\s*[""]([^""]{10,300})[""]/g;

function extractQuotes(script: string, sourceNotes: SourceNote[], episodeDate: string): QuoteRecord[] {
  const records: QuoteRecord[] = [];
  const now = new Date().toISOString();
  let seq = 1;

  let match: RegExpExecArray | null;
  QUOTE_PATTERN.lastIndex = 0;
  while ((match = QUOTE_PATTERN.exec(script)) !== null) {
    const speaker = match[1].trim();
    const text = match[2].trim();

    // Find a matching source note for this speaker/context.
    const relatedSource = sourceNotes.find(
      (sn) =>
        sn.title.toLowerCase().includes(speaker.split(" ")[0].toLowerCase()) ||
        sn.source.toLowerCase().includes(speaker.split(" ")[0].toLowerCase()),
    );

    records.push({
      id: `Q-${datePart(episodeDate)}-${padSeq(seq++)}`,
      speaker,
      text,
      source: relatedSource?.source ?? "script",
      verifiedAt: now,
    });
  }

  return records;
}

// ---------------------------------------------------------------------------
// Source extraction
// ---------------------------------------------------------------------------

function extractSources(sourceNotes: SourceNote[], episodeDate: string): SourceRecord[] {
  const now = new Date().toISOString();
  return sourceNotes.map((sn, i) => ({
    id: `S-${datePart(episodeDate)}-${padSeq(i + 1)}`,
    url: sn.url,
    outlet: sn.source,
    publishedDate: sn.date || episodeDate,
    accessedAt: now,
  }));
}

// ---------------------------------------------------------------------------
// Statistic extraction
// ---------------------------------------------------------------------------

// Match sentences with a number+unit or percentage that look like statistics.
const STAT_SENTENCE_PATTERN =
  /[^.!?]*(?:\$\d[\d,]*(?:\.\d+)?(?:\s*(?:billion|million|trillion|thousand))?|\d+(?:\.\d+)?%|\d+(?:\.\d+)?\s*(?:million|billion|trillion))[^.!?]*[.!?]/gi;

function extractStatistics(script: string, sourceNotes: SourceNote[], episodeDate: string): StatRecord[] {
  const records: StatRecord[] = [];
  let seq = 1;
  const now = episodeDate;

  let match: RegExpExecArray | null;
  STAT_SENTENCE_PATTERN.lastIndex = 0;
  while ((match = STAT_SENTENCE_PATTERN.exec(script)) !== null) {
    const sentence = match[0].trim();
    if (sentence.length < 20 || sentence.length > 300) continue;

    // Extract the numeric value(s) from the sentence for the "value" field.
    const valueMatch = sentence.match(
      /\$\d[\d,]*(?:\.\d+)?(?:\s*(?:billion|million|trillion|thousand))?|\d+(?:\.\d+)?%|\d+(?:\.\d+)?\s*(?:million|billion|trillion)/i,
    );
    const value = valueMatch ? valueMatch[0] : "—";

    // Best-guess source from notes.
    const relatedSource = sourceNotes.find((sn) =>
      sentence.toLowerCase().includes(sn.source.toLowerCase().split(" ")[0]),
    );

    records.push({
      id: `STAT-${datePart(episodeDate)}-${padSeq(seq++)}`,
      claim: sentence.slice(0, 200),
      value,
      source: relatedSource?.source ?? "script",
      dataDate: now,
    });

    if (records.length >= 50) break; // cap at 50 stats
  }

  return records;
}

// ---------------------------------------------------------------------------
// Weather extraction
// ---------------------------------------------------------------------------

// Look for weather-like sentences: temperature + condition words.
const WEATHER_PATTERN =
  /([A-Z][a-z]+(?:,\s*[A-Z]{2})?)[^.!?]*?(?:(\d+)\s*(?:degrees?|°F|°C))[^.!?]*?(?:sunny|cloudy|rain|snow|fog|storm|clear|wind|humid|heat|cold|warm|cool|partly|thunderstorm|drizzle|hazy|showers?|overcast)[^.!?]*[.!?]/gi;

function extractWeather(script: string, sourceNotes: SourceNote[], episodeDate: string): WeatherRecord[] {
  const records: WeatherRecord[] = [];
  let seq = 1;

  let match: RegExpExecArray | null;
  WEATHER_PATTERN.lastIndex = 0;
  while ((match = WEATHER_PATTERN.exec(script)) !== null) {
    const sentence = match[0].trim();
    const location = match[1]?.trim() ?? "Unknown";
    const temp = match[2] ? `${match[2]}°F` : "—";

    // Extract condition word.
    const condMatch = sentence.match(
      /\b(sunny|cloudy|rain(?:ing|y)?|snow(?:ing|y)?|fog(?:gy)?|storm(?:y)?|clear|wind(?:y)?|humid(?:ity)?|heat(?:wave)?|cold|warm|cool|partly cloudy|thunderstorm|drizzle|hazy|showers?|overcast)\b/i,
    );
    const conditions = condMatch ? condMatch[1] : sentence.slice(0, 60);

    const weatherSource = sourceNotes.find((sn) =>
      /weather|forecast|tomorrow\.io|noaa|nws|weather\.gov/i.test(sn.source + sn.url),
    );

    records.push({
      id: `WX-${datePart(episodeDate)}-${padSeq(seq++)}`,
      location,
      temperature: temp,
      conditions,
      source: weatherSource?.source ?? "script",
      observedAt: episodeDate,
    });

    if (records.length >= 10) break; // cap at 10 weather records
  }

  return records;
}

// ---------------------------------------------------------------------------
// Main exports
// ---------------------------------------------------------------------------

export function buildSidecar(
  episode: EpisodeJson,
  episodeDate: string,
  config: Config,
  factCheckReport: FactCheckReport,
  r2KeyPrefix: string,
): EpisodeSidecar {
  const generatedAt = new Date().toISOString();
  const dp = datePart(episodeDate);
  const episodeId = `TMC-${dp}-001`;
  const baseTitle = config.showTitle;

  // Derive storage keys (mirrors the pattern in index.ts).
  const baseDir = `${r2KeyPrefix}/${episodeDate}/`;
  const manifestKey = `${baseDir}${baseTitle} - ${episodeDate} - manifest.json`;
  // The "audio key" is the files.txt that lists all chunks; a single combined
  // file doesn't exist until the build-episode.sh pipeline runs offline.
  const audioKey = `${baseDir}${baseTitle} - ${episodeDate} - files.txt`;
  const sidecarKey = `${baseDir}${baseTitle} - ${episodeDate} - sidecar.json`;

  // Voice ID: last 8 chars only for security.
  const rawVoiceId = config ? (episode as unknown as Record<string, unknown>).__voiceId as string | undefined : undefined;
  const voiceIdSafe = (rawVoiceId ?? "unknown").slice(-8);

  const script = episode.elevenlabs_script;
  const sourceNotes = episode.source_notes ?? [];

  const quotes = extractQuotes(script, sourceNotes, episodeDate);
  const sources = extractSources(sourceNotes, episodeDate);
  const statistics = extractStatistics(script, sourceNotes, episodeDate);
  const weatherMetrics = extractWeather(script, sourceNotes, episodeDate);

  const sidecar: EpisodeSidecar = {
    schemaVersion: "1.0",
    episodeId,
    generatedAt,
    episodeDate,

    production: {
      aiModel: config.openaiModel,
      factCheckModel: factCheckReport.modelUsed,
      voiceProvider: "ElevenLabs",
      voiceModel: config.elevenLabsModelId,
      voiceId: voiceIdSafe,
      workerVersion: "unknown",
    },

    storage: {
      r2Bucket: "MORNING_CUP_BUCKET",
      r2KeyPrefix,
      manifestKey,
      audioKey,
      sidecarKey,
    },

    factCheck: {
      ranAt: factCheckReport.checkedAt,
      claimsChecked: factCheckReport.claimsChecked,
      claimsRemoved: factCheckReport.claimsRemoved,
      averageTrustScore: factCheckReport.averageTrustScore,
    },

    quotes,
    sources,
    statistics,
    weatherMetrics,
  };

  return sidecar;
}

export async function uploadSidecar(
  sidecar: EpisodeSidecar,
  env: Env,
  r2KeyPrefix: string,
  episodeDate: string,
): Promise<string> {
  const baseTitle = sidecar.storage.sidecarKey
    .split("/")
    .pop()
    ?.replace(" - sidecar.json", "") ?? episodeDate;

  const key = sidecar.storage.sidecarKey;
  const body = JSON.stringify(sidecar, null, 2);

  await env.MORNING_CUP_BUCKET.put(key, body, {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
  });

  logger.info("sidecar uploaded", { key, episodeDate, episodeId: sidecar.episodeId });

  // Suppress unused variable warning — baseTitle only used in log context.
  void baseTitle;
  void r2KeyPrefix;

  return key;
}
