// Two-stage repair: standard "fix listed errors" pass, then a length-extend
// fallback if the script is still under the word-count floor.

import type { Env, EpisodeJson, ValidationResult } from "./types";
import type { Config } from "./config";
import { extendEpisode, repairEpisode } from "./openai";
import { validateEpisode } from "./validator";
import { logger } from "./logger";

export interface RepairOutcome {
  episode: EpisodeJson;
  raw: string;
  validation: ValidationResult;
  attempted: boolean;
}

function isLengthFailure(validation: ValidationResult, config: Config): boolean {
  if (validation.word_count < config.minScriptWords) return true;
  // Use the actual configured floor, not a hardcoded value.
  const runtimeFloor = (config.minScriptWords / config.wordsPerMinute);
  if (validation.estimated_runtime_minutes < runtimeFloor) return true;
  return validation.errors.some(
    (e) => /word count|runtime|below/i.test(e) && /min|floor/i.test(e),
  );
}

export async function maybeRepair(
  env: Env,
  config: Config,
  episode: EpisodeJson,
  validation: ValidationResult,
  userPrompt: string,
): Promise<RepairOutcome> {
  if (validation.ok || !config.enableRepairPass) {
    return { episode, raw: "", validation, attempted: false };
  }

  // Pass 1: standard "fix the listed errors" repair.
  const first = await repairEpisode(env, config, episode, validation.errors, userPrompt);
  let currentEpisode = first.json;
  let currentRaw = first.raw;
  let currentValidation = validateEpisode(currentEpisode, config);

  // Pass 2: aggressive length-extend fallback when the script is still short.
  // Only triggers on length failures — formatting/structural errors that the
  // standard repair already handled don't get a second pass.
  if (!currentValidation.ok && isLengthFailure(currentValidation, config)) {
    logger.warn("standard repair still under length floor — running extend pass", {
      wordCount: currentValidation.word_count,
      estimatedRuntimeMinutes: currentValidation.estimated_runtime_minutes,
      minWords: config.minScriptWords,
    });
    try {
      const extended = await extendEpisode(
        env,
        config,
        currentEpisode,
        {
          word_count: currentValidation.word_count,
          estimated_runtime_minutes: currentValidation.estimated_runtime_minutes,
          errors: currentValidation.errors,
        },
        config.minScriptWords,
        userPrompt,
      );
      currentEpisode = extended.json;
      currentRaw = extended.raw;
      currentValidation = validateEpisode(currentEpisode, config);
    } catch (err) {
      logger.error("extend pass failed", { err: String(err) });
    }
  }

  return {
    episode: currentEpisode,
    raw: currentRaw,
    validation: currentValidation,
    attempted: true,
  };
}
