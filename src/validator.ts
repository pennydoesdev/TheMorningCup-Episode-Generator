// Validates the structured episode JSON and the spoken script.

import type { Config } from "./config";
import type { EpisodeJson, ValidationResult } from "./types";
import { countSpacers, countWords } from "./utils/text";

const FORBIDDEN_PATTERNS: { name: string; regex: RegExp }[] = [
  { name: "music cue", regex: /music\s*cue/i },
  { name: "production note", regex: /production\s*note/i },
  { name: "voice description", regex: /voice\s*description/i },
  // The production word "Outro" must never be voiced — the outro CONTENT
  // (sign-off) plays, but the host signs off with natural language like
  // "Thanks for joining me on The Morning Cup."
  { name: "spoken outro word", regex: /\boutro\b/i },
  // Section labels written as standalone heading lines (the model treating
  // labels as headings instead of speaking them as natural intros after
  // each sting). "Power Map" inside a sentence is fine; "Power Map" alone
  // on a line is not.
  {
    name: "section heading line",
    regex:
      /^\s*(closing summary|power map|cost of living check|what comes next|positive opening|positive closing|riddle answer|section spacer)\s*[:.]?\s*$/im,
  },
];

const MARKDOWN_TABLE = /\|.*\|.*\n[\s-:]*\|[\s-:]*\|/m;
const URL_LIKE = /https?:\/\/\S+/;

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

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

  // Word count — hard floor and ceiling aligned to 15-17 min at wordsPerMinute.
  if (wordCount < config.minScriptWords) {
    errors.push(
      `Word count ${wordCount} is below minimum ${config.minScriptWords} words (15-minute floor). Script must be expanded.`,
    );
  } else if (wordCount < config.targetScriptWordsMin) {
    warnings.push(
      `Word count ${wordCount} is below target minimum ${config.targetScriptWordsMin}. Episode may run short.`,
    );
  }

  if (wordCount > config.maxScriptWords) {
    errors.push(
      `Word count ${wordCount} exceeds maximum ${config.maxScriptWords} words (17-minute ceiling). Script must be trimmed.`,
    );
  } else if (wordCount > config.targetScriptWordsMax) {
    errors.push(
      `Word count ${wordCount} exceeds target max ${config.targetScriptWordsMax} words (16.5-minute target ceiling). Trim to stay well within 17 minutes.`,
    );
  }

  // Runtime — hard enforcement of 15-17 minute window.
  if (runtime < 15) {
    errors.push(`Estimated runtime ${runtime.toFixed(1)} min is below the 15-minute floor. Script must be longer.`);
  }
  if (runtime > 17) {
    errors.push(`Estimated runtime ${runtime.toFixed(1)} min exceeds the 17-minute ceiling. Script must be shorter.`);
  }

  if (!/^Good morning, today is\b/i.test(script.trimStart())) {
    errors.push('Script must open with "Good morning, today is"');
  }

  if (!/the morning cup/i.test(script)) {
    errors.push('Script must include "The Morning Cup"');
  }

  // Host identity should appear in the script (opening + outro). One mention
  // is enough to clear validation; the prompt encourages two.
  if (config.hostName && !new RegExp(escapeRegex(config.hostName), "i").test(script)) {
    errors.push(`Script must include host name "${config.hostName}"`);
  }

  if (!script.includes("[TEN-SECOND SECTION SPACER]")) {
    errors.push("Script is missing [TEN-SECOND SECTION SPACER] markers");
  } else if (spacerCount < 12) {
    errors.push(`Found only ${spacerCount} spacer markers; need at least 12`);
  }

  // Riddle section before outro, riddle answer at end.
  const lower = script.toLowerCase();
  const riddleIdx = lower.indexOf("riddle");
  const outroIdx = lower.indexOf("outro");
  if (riddleIdx === -1) {
    errors.push("Script does not include a riddle section");
  } else if (outroIdx !== -1 && riddleIdx > outroIdx + 200 && lower.indexOf("riddle", outroIdx) === -1) {
    // Best-effort: riddle question should appear before the outro proper.
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
