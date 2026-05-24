// Pronunciation scanner for The Morning Cup.
//
// After each episode is generated, scans the script for proper nouns that are
// not already in the pronunciation dictionary. Flags them for review by writing
// to R2 as "pronunciation-review/YYYY-MM-DD.json".

import type { Env } from "./types";
import { logger } from "./logger";

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export interface PronunciationReviewEntry {
  word: string;
  context: string;    // the sentence it appeared in
  occurrences: number;
}

// ---------------------------------------------------------------------------
// Known-dictionary words
//
// These are the keys from CASE_SENSITIVE_SUBSTITUTIONS and
// CASE_INSENSITIVE_SUBSTITUTIONS in tts.ts, plus their pronunciation targets
// (which are already handled). We skip words that are already covered.
// ---------------------------------------------------------------------------

const DICTIONARY_WORDS = new Set<string>([
  // Case-sensitive entries from tts.ts
  "pennydoesnews",
  "Fold 42",
  "Qatar", "Qatari",
  "Iran", "Iranian",
  "Iraq", "Iraqi",
  "Hezbollah",
  "Hamas",
  "Netanyahu",
  "Zelensky",
  "Macron",
  "Riyadh",
  "Dubai",
  "Beijing",
  "Xinjiang",
  "Navalny",
  "Guantanamo",
  "LGBTQ+",
  "COVID-19", "COVID",
  "Omicron",
  "Xi Jinping",
  "Kamala",
  "Buttigieg",
  "Boebert",
  "DeSantis",
  "Gavin Newsom",
  "Fetterman",
  "Warnock",
  "Ossoff",
  "Manchin",
  "Sinema",
  "Tuberville",
  "Ocasio-Cortez",
  "AOC",
  "MAGA",
  "NATO",
  "OPEC",
  "UNESCO",
  "UNICEF",
  "Pfizer",
  "Moderna",
  "AstraZeneca",
  "Elon",
  "Tesla",
  "SpaceX",
  "Neuralink",
  "TikTok",
  "Lyft",
  "Waymo",
  "Nvidia",
  "TSMC",
  "GPT",
  "ChatGPT",
  "OpenAI",
  // Case-insensitive entries
  "GIF",
]);

// ---------------------------------------------------------------------------
// Common English words and stop-words to exclude from proper noun detection.
// These are words that might appear capitalized at non-sentence-start positions
// (e.g., in titles, after colons) but are not proper nouns.
// ---------------------------------------------------------------------------

const COMMON_WORDS = new Set<string>([
  // Articles / conjunctions / prepositions
  "The", "A", "An", "And", "Or", "But", "Nor", "For", "Yet", "So",
  "In", "On", "At", "By", "To", "Of", "Up", "As", "If", "Is", "It",
  "Its", "He", "She", "We", "I", "You", "They", "His", "Her", "Our",
  "Their", "This", "That", "These", "Those", "With", "From", "Into",
  "Over", "Under", "After", "Before", "Between", "Through", "During",
  "About", "Against", "Among", "Within", "Without", "Beyond", "Along",
  // Common verbs that may appear capitalized
  "Are", "Was", "Were", "Has", "Had", "Have", "Can", "Could", "Will",
  "Would", "Should", "May", "Might", "Must", "Shall", "Does", "Did",
  "Do", "Be", "Been", "Being",
  // Common nouns/adjectives frequently capitalized in titles or after colons
  "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
  "January", "February", "March", "April", "May", "June", "July", "August",
  "September", "October", "November", "December",
  "American", "Americans", "United", "States", "Federal", "National",
  "New", "York", "Los", "Angeles", "San", "Francisco", "Washington",
  "Congress", "Senate", "House", "White", "House", "Court", "Supreme",
  "North", "South", "East", "West", "Central",
  "Department", "Secretary", "President", "Vice", "Senator", "Governor",
  "Representative", "Mayor", "General", "Justice", "Judge", "Director",
  "Chairman", "Chair", "Minister", "Chancellor", "Prime", "Attorney",
  "Bureau", "Agency", "Office", "Administration", "Committee",
  // Podcast-specific terms
  "Morning", "Cup", "Today", "Yesterday", "News",
]);

// ---------------------------------------------------------------------------
// Proper noun detection
// ---------------------------------------------------------------------------

/**
 * Split text into sentences using punctuation boundaries.
 */
function splitSentences(text: string): string[] {
  return text
    .replace(/\n+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Determine if a token is likely a proper noun requiring pronunciation review:
 * - Starts with an uppercase letter
 * - Is not in the dictionary (already handled)
 * - Is not a common English word
 * - Is not a pure number or punctuation
 * - Has at least 3 characters
 */
function isUnknownProperNoun(token: string): boolean {
  if (token.length < 3) return false;
  if (!/^[A-Z]/.test(token)) return false;
  if (DICTIONARY_WORDS.has(token)) return false;
  if (COMMON_WORDS.has(token)) return false;
  // Skip pure numbers, ordinals, years.
  if (/^\d/.test(token)) return false;
  // Skip tokens that are all-caps acronyms already handled generically
  // (they tend to be pronounced letter-by-letter fine by ElevenLabs).
  if (/^[A-Z]{2,5}$/.test(token)) return false;
  // Must contain at least one lowercase letter to be a name (not an acronym).
  if (!/[a-z]/.test(token)) return false;
  return true;
}

/**
 * Extract capitalized multi-word sequences (2+ consecutive tokens starting
 * with uppercase) and single proper-noun candidates from a sentence.
 *
 * Words at the very start of a sentence are excluded (they're always
 * capitalized regardless of proper-noun status).
 */
function extractProperNounCandidates(sentence: string): string[] {
  // Tokenize: split on whitespace and strip leading/trailing punctuation.
  const rawTokens = sentence.split(/\s+/).map((t) => t.replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, ""));

  const candidates: string[] = [];

  // Build multi-word sequences first (greedy, 2+ consecutive caps tokens).
  let i = 0;
  while (i < rawTokens.length) {
    // Skip the first token of the sentence (always capitalized).
    if (i === 0) { i++; continue; }

    const token = rawTokens[i];
    if (!token || !/^[A-Z]/.test(token)) { i++; continue; }

    // Try to form a multi-word sequence.
    let j = i + 1;
    while (j < rawTokens.length && rawTokens[j] && /^[A-Z]/.test(rawTokens[j])) {
      j++;
    }

    if (j > i + 1) {
      // Multi-word sequence found.
      const phrase = rawTokens.slice(i, j).join(" ");
      if (!DICTIONARY_WORDS.has(phrase) && !COMMON_WORDS.has(phrase)) {
        candidates.push(phrase);
      }
      i = j;
    } else {
      // Single token — check if it's an unknown proper noun.
      if (isUnknownProperNoun(token)) {
        candidates.push(token);
      }
      i++;
    }
  }

  return candidates;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function scanAndFlagProperNouns(
  script: string,
  episodeDate: string,
  env: Env,
  r2KeyPrefix: string,
): Promise<PronunciationReviewEntry[]> {
  const sentences = splitSentences(script);

  // Collect all candidates with their context and occurrence counts.
  const wordMap = new Map<string, { contexts: string[]; count: number }>();

  for (const sentence of sentences) {
    const candidates = extractProperNounCandidates(sentence);
    for (const candidate of candidates) {
      const existing = wordMap.get(candidate);
      if (existing) {
        existing.count++;
        // Keep only unique contexts (up to 3).
        if (existing.contexts.length < 3 && !existing.contexts.includes(sentence)) {
          existing.contexts.push(sentence);
        }
      } else {
        wordMap.set(candidate, { contexts: [sentence], count: 1 });
      }
    }
  }

  // Build result entries, sorted by occurrence count descending.
  const entries: PronunciationReviewEntry[] = Array.from(wordMap.entries())
    .map(([word, { contexts, count }]) => ({
      word,
      context: contexts[0] ?? "",
      occurrences: count,
    }))
    .sort((a, b) => b.occurrences - a.occurrences);

  // Write to R2.
  const r2Key = `${r2KeyPrefix}/${episodeDate}/pronunciation-review.json`;
  const body = JSON.stringify(
    {
      episodeDate,
      generatedAt: new Date().toISOString(),
      totalFlagged: entries.length,
      entries,
    },
    null,
    2,
  );

  await env.MORNING_CUP_BUCKET.put(r2Key, body, {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
  });

  logger.info("pronunciation scan complete", {
    episodeDate,
    flaggedCount: entries.length,
    r2Key,
  });

  return entries;
}
