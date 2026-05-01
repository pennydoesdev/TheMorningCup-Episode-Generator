// Single-pass repair using OpenAI to fix listed validation errors.

import type { Env, EpisodeJson, ValidationResult } from "./types";
import type { Config } from "./config";
import { repairEpisode } from "./openai";
import { validateEpisode } from "./validator";

export interface RepairOutcome {
  episode: EpisodeJson;
  raw: string;
  validation: ValidationResult;
  attempted: boolean;
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
  const { json, raw } = await repairEpisode(env, config, episode, validation.errors, userPrompt);
  const repaired = validateEpisode(json, config);
  return { episode: json, raw, validation: repaired, attempted: true };
}
