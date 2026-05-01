// shows/example/config.ts
//
// Reference implementation. Copy this folder as the starting point for
// your real shows, or run /create-show in Claude Code to scaffold one
// from a filled-in variables file.

import type { ShowConfig } from "../../src/show";

export const config: ShowConfig = {
  showKey: "example",
  showTitle: "Example Show",
  hostName: "Example Host",
  publisher: "The Penny Tribune",
  copyrightHolder: "The Penny Tribune",
  podcastGenre: "News",

  openingTemplate:
    'Good morning, today is [CURRENT DATE]. I am [HOST NAME], and this is [SHOW TITLE] from [PUBLISHER].',
  closingTemplate:
    'I am [HOST NAME]. Thank you for listening to [SHOW TITLE]. We will be back soon.',

  minScriptWords: 3300,
  targetScriptWordsMin: 3300,
  targetScriptWordsMax: 3700,
  maxScriptWords: 3900,
  wordsPerMinute: 145,
  maxTtsCharsPerChunk: 2500,

  sounds: {
    intro: ["intro.wav", "intro-sting.wav"],
    sectionSting: "section-sting.wav",
    outro: ["outro.wav"],
  },

  topicFlow: [
    "Positive Opening",
    "Top Story",
    "Politics",
    "Economy",
    "International",
    "Closing Thoughts",
  ],

  wpParentPodcastId: 0,
  wpPodcastShowTerm: "Example Show",
  googleDriveFolderId: "",
};
