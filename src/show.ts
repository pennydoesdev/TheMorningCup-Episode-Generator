// src/show.ts
//
// Show configuration shape + the runtime registry that selects the active
// show based on the SHOW_KEY env var set in each per-show wrangler.toml.

export interface ShowSounds {
  intro: string[];          // ordered filenames played before chunk-001
  sectionSting: string;     // played between every two news chunks
  outro: string[];          // ordered filenames played after the last chunk
}

export interface ShowConfig {
  showKey: string;
  showTitle: string;
  hostName: string;
  publisher: string;
  copyrightHolder: string;
  podcastGenre: string;

  openingTemplate: string;
  closingTemplate: string;

  minScriptWords: number;
  targetScriptWordsMin: number;
  targetScriptWordsMax: number;
  maxScriptWords: number;
  wordsPerMinute: number;
  maxTtsCharsPerChunk: number;

  sounds: ShowSounds;
  topicFlow: string[];

  wpParentPodcastId: number;
  wpPodcastShowTerm: string;

  googleDriveFolderId: string;
}

// Registry — every show's config and prompt module is imported here.
// /create-show appends a new entry whenever a show is added.
import { config as exampleConfig } from "../shows/example/config";
import { PROMPT as examplePrompt } from "../shows/example/prompt";

export const SHOW_REGISTRY: Record<string, { config: ShowConfig; prompt: string }> = {
  example: { config: exampleConfig, prompt: examplePrompt },
};

export function getShow(showKey: string): { config: ShowConfig; prompt: string } {
  const entry = SHOW_REGISTRY[showKey];
  if (!entry) {
    const available = Object.keys(SHOW_REGISTRY).join(", ");
    throw new Error(
      `Unknown SHOW_KEY "${showKey}". Available shows: ${available}`,
    );
  }
  return entry;
}
