// JSON Schema for the OpenAI Responses API structured-output mode.
// Mirrors the EpisodeJson shape defined in types.ts.

export const EPISODE_JSON_SCHEMA = {
  name: "weekly_rewind_episode",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: [
      "show_title",
      "episode_date",
      "source_date",
      "estimated_runtime",
      "elevenlabs_script",
      "riddle_question",
      "riddle_answer",
      "social_copy",
      "short_social_post",
      "social_image_concept",
      "source_notes",
      "self_validation",
      "chapters",
    ],
    properties: {
      show_title: { type: "string" },
      episode_date: { type: "string" },
      source_date: { type: "string" },
      estimated_runtime: { type: "string" },
      elevenlabs_script: { type: "string" },
      riddle_question: { type: "string" },
      riddle_answer: { type: "string" },
      social_copy: {
        type: "object",
        additionalProperties: false,
        required: ["main_post", "section_posts"],
        properties: {
          main_post: { type: "string" },
          section_posts: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["section", "post"],
              properties: {
                section: { type: "string" },
                post: { type: "string" },
              },
            },
          },
        },
      },
      short_social_post: { type: "string" },
      social_image_concept: { type: "string" },
      source_notes: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["category", "title", "source", "url", "date"],
          properties: {
            category: { type: "string" },
            title: { type: "string" },
            source: { type: "string" },
            url: { type: "string" },
            date: { type: "string" },
          },
        },
      },
      self_validation: {
        type: "object",
        additionalProperties: false,
        required: [
          "word_count_estimate",
          "all_sections_present",
          "has_spacers",
          "riddle_answer_at_end",
          "no_music_cues",
          "no_production_notes",
        ],
        properties: {
          word_count_estimate: { type: "integer" },
          all_sections_present: { type: "boolean" },
          has_spacers: { type: "boolean" },
          riddle_answer_at_end: { type: "boolean" },
          no_music_cues: { type: "boolean" },
          no_production_notes: { type: "boolean" },
        },
      },
      chapters: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["title"],
          properties: {
            title: { type: "string" },
          },
        },
      },
    },
  },
} as const;
