// Validates the structured episode JSON and the spoken script.

import type { Config } from "./config";
import type { EpisodeJson, ValidationResult } from "./types";
import { countSpacers, countWords } from "./utils/text";

const FORBIDDEN_PATTERNS: { name: string; regex: RegExp }[] = [
  { name: "music cue", regex: /music\s*cue/i },
  { name: "production note", regex: /production\s*note/i },
  { name: "voice description", regex: /voice\s*description/i },
];

const MARKDOWN_TABLE = /\|.*\|.*\n[\s-:]*\|[\s-:]*\|/m;
const URL_LIKE = /https?:\/\/\S+/;

// Numeric-ordinal shorthand should never appear in the spoken script per the
// ENUNCIATION RULE — they must always be spelled out (e.g. "first", "twenty-second").
const NUMERIC_ORDINAL = /\b\d+(st|nd|rd|th)\b/i;

const REQUIRED_WEEKLY_SECTIONS: { name: string; regex: RegExp }[] = [
  { name: "What Got Ignored This Week", regex: /what\s+got\s+ignored/i },
  { name: "Who Won / Who Lost This Week", regex: /who\s+won.*who\s+lost|who\s+won\s*\/\s*who\s+lost/i },
  { name: "Number of the Week", regex: /number\s+of\s+the\s+week/i },
];

export function validateEpisode(
  episode: EpisodeJson,
  config: Config,
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const script = episode.elevenlabs_script ?? "";

  if (!script || script.trim().length === 0) {
    errors.push("elevenlabs_script is missing or empty");
  }

  const wordCount = countWords(script);
  const runtime = wordCount / Math.max(1, config.wordsPerMinute);
  const spacerCount = countSpacers(script);

  if (wordCount < config.minScriptWords) {
    errors.push(
      `Word count ${wordCount} is below MIN_SCRIPT_WORDS ${config.minScriptWords}`,
    );
  }

  if (wordCount > config.maxScriptWords) {
    errors.push(
      `Word count ${wordCount} exceeds MAX_SCRIPT_WORDS ${config.maxScriptWords}`,
    );
  } else if (
    wordCount > config.targetScriptWordsMax &&
    wordCount <= config.maxScriptWords
  ) {
    warnings.push(
      `Word count ${wordCount} above target max ${config.targetScriptWordsMax} but within hard cap`,
    );
  }

  if (runtime < config.minRuntimeMinutes) {
    errors.push(
      `Estimated runtime ${runtime.toFixed(1)} min is below ${config.minRuntimeMinutes}-minute floor`,
    );
  }
  if (runtime > config.maxRuntimeMinutes) {
    if (wordCount > config.maxScriptWords) {
      errors.push(
        `Estimated runtime ${runtime.toFixed(1)} min exceeds ${config.maxRuntimeMinutes}-minute ceiling`,
      );
    } else {
      warnings.push(
        `Estimated runtime ${runtime.toFixed(1)} min slightly over ${config.maxRuntimeMinutes} minutes`,
      );
    }
  }

  if (!/^Good evening, today is Sunday,/i.test(script.trimStart())) {
    errors.push('Script must open with "Good evening, today is Sunday,"');
  }

  if (!/the morning cup/i.test(script)) {
    errors.push('Script must include "The Morning Cup"');
  }

  if (!script.includes("[TEN-SECOND SECTION SPACER]")) {
    errors.push("Script is missing [TEN-SECOND SECTION SPACER] markers");
  } else if (spacerCount < 25) {
    errors.push(`Found only ${spacerCount} spacer markers; need at least 25`);
  }

  // Required weekly sections.
  for (const section of REQUIRED_WEEKLY_SECTIONS) {
    if (!section.regex.test(script)) {
      errors.push(`Script is missing required section: ${section.name}`);
    }
  }

  // Riddle section before outro, riddle answer at end.
  const lower = script.toLowerCase();
  const riddleIdx = lower.indexOf("riddle");
  const outroIdx = lower.indexOf("outro");
  if (riddleIdx === -1) {
    errors.push("Script does not include a riddle section");
  } else if (outroIdx !== -1 && riddleIdx > outroIdx + 200 && lower.indexOf("riddle", outroIdx) === -1) {
    warnings.push("Riddle section appears after outro");
  }

  // Riddle answer at very end.
  const tail = script.slice(-Math.min(800, script.length)).toLowerCase();
  if (!tail.includes("riddle answer") && !tail.includes("the answer")) {
    if (!episode.riddle_answer || episode.riddle_answer.trim().length === 0) {
      errors.push("Riddle answer not present at end of script");
    } else {
      warnings.push("Riddle answer present in JSON but not clearly tagged at end of script");
    }
  }

  for (const f of FORBIDDEN_PATTERNS) {
    if (f.regex.test(script)) errors.push(`Spoken script contains "${f.name}"`);
  }

  if (NUMERIC_ORDINAL.test(script)) {
    errors.push(
      'Spoken script contains numeric ordinal shorthand (e.g. "1st", "21st"); spell out as words instead',
    );
  }

  if (MARKDOWN_TABLE.test(script)) {
    errors.push("Spoken script contains a markdown table");
  }

  if (URL_LIKE.test(script)) {
    errors.push("Spoken script contains a citation URL");
  }

  // Required JSON fields beyond the script.
  if (!episode.show_title) errors.push("show_title is missing");
  if (!episode.episode_date) errors.push("episode_date is missing");
  if (!episode.source_date) errors.push("source_date is missing");
  if (!episode.estimated_runtime) errors.push("estimated_runtime is missing");
  if (!episode.riddle_question) errors.push("riddle_question is missing");
  if (!episode.riddle_answer) errors.push("riddle_answer is missing");
  if (!episode.social_copy?.main_post) errors.push("social_copy.main_post is missing");
  if (!Array.isArray(episode.social_copy?.section_posts)) {
    errors.push("social_copy.section_posts must be an array");
  }
  if (!episode.short_social_post) {
    errors.push("short_social_post is missing");
  } else if (episode.short_social_post.length > 500) {
    errors.push(
      `short_social_post is ${episode.short_social_post.length} characters; must be 500 or fewer`,
    );
  }
  if (!episode.social_image_concept) {
    errors.push("social_image_concept is missing");
  }
  if (!Array.isArray(episode.source_notes)) {
    errors.push("source_notes must be an array");
  }
  if (!episode.self_validation) errors.push("self_validation is missing");

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    word_count: wordCount,
    estimated_runtime_minutes: Number(runtime.toFixed(2)),
    spacer_count: spacerCount,
  };
}
