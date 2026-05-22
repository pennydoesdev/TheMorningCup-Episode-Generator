// Generates a podcast episode description via a lightweight OpenAI call, then
// assembles the full metadata .txt that gets saved alongside the episode.

import type { Config } from "./config";
import type { Env, EpisodeJson } from "./types";
import { logger } from "./logger";

export async function generateDescription(
  env: Env,
  config: Config,
  episode: EpisodeJson,
): Promise<string> {
  const chapters = (episode.chapters ?? [])
    .map((c, i) => `${i + 1}. ${c.title}`)
    .join("\n");

  const prompt =
    `You are writing a podcast episode description for "The Morning Cup," ` +
    `a daily morning news podcast hosted by ${config.hostName} for ${config.publisher}.\n\n` +
    `Using the social summary and chapter list below, write a 2–3 paragraph ` +
    `episode description (150–220 words) for a podcast directory listing.\n` +
    `- Paragraph 1: A hook capturing the main theme or feel of today's episode (2–3 sentences)\n` +
    `- Paragraph 2: Preview the main topics covered, drawn from the chapter list\n` +
    `- Paragraph 3: A short warm invite for listeners to tune in\n\n` +
    `Tone: warm, conversational, approachable. Return only the description text with no labels or headers.\n\n` +
    `Social summary: ${episode.social_copy?.main_post ?? ""}\n\n` +
    `Chapters:\n${chapters}`;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.7,
        max_tokens: 400,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      logger.warn("description generation failed", { status: res.status });
      return episode.social_copy?.main_post ?? "";
    }

    const data = await res.json() as { choices: { message: { content: string } }[] };
    return data.choices?.[0]?.message?.content?.trim() ?? episode.social_copy?.main_post ?? "";
  } catch (err) {
    logger.warn("description generation error", { err: String(err) });
    return episode.social_copy?.main_post ?? "";
  }
}

export function buildMetadataTxt(opts: {
  episodeIso: string;
  spokenDate: string;
  episodeNumber: number;
  season: number;
  hostName: string;
  publisher: string;
  copyrightHolder: string;
  genre: string;
  estimatedRuntimeMinutes: number;
  wordCount: number;
  description: string;
  episode: EpisodeJson;
}): string {
  const year = opts.episodeIso.slice(0, 4);
  const divider = "-".repeat(60);

  const chapters =
    (opts.episode.chapters ?? [])
      .map((c, i) => `  ${i + 1}. ${c.title}`)
      .join("\n") || "  (no chapters)";

  const sourceLines =
    (opts.episode.source_notes ?? [])
      .map(
        (s) =>
          `  • ${s.title}\n    ${s.source}${s.date ? ` (${s.date})` : ""}\n    ${s.url}`,
      )
      .join("\n\n") || "  (no source notes)";

  const sectionPosts = (opts.episode.social_copy?.section_posts ?? [])
    .map((p) => `  [${p.section}]\n  ${p.post}`)
    .join("\n\n");

  const lines = [
    `THE MORNING CUP — EPISODE METADATA`,
    ``,
    `Title:      The Morning Cup — ${opts.spokenDate}`,
    `Episode:    ${opts.episodeNumber}`,
    `Season:     ${opts.season}`,
    `Date:       ${opts.episodeIso}`,
    `Host:       ${opts.hostName}`,
    `Publisher:  ${opts.publisher}`,
    `Runtime:    ~${opts.estimatedRuntimeMinutes.toFixed(1)} min  (${opts.wordCount} words)`,
    `Copyright:  Copyright ${year} — ${opts.copyrightHolder}`,
    `Genre:      ${opts.genre}`,
    ``,
    divider,
    `EPISODE DESCRIPTION`,
    divider,
    ``,
    opts.description,
    ``,
    divider,
    `CHAPTERS`,
    divider,
    ``,
    chapters,
    ``,
    divider,
    `SHOW NOTES / SOURCES`,
    divider,
    ``,
    sourceLines,
    ``,
    divider,
    `TODAY'S RIDDLE`,
    divider,
    ``,
    `  Q: ${opts.episode.riddle_question ?? ""}`,
    `  A: ${opts.episode.riddle_answer ?? ""}`,
    ``,
    divider,
    `SOCIAL MEDIA`,
    divider,
    ``,
    `  Main post:`,
    `  ${opts.episode.social_copy?.main_post ?? ""}`,
  ];

  if (sectionPosts) {
    lines.push(``, `  Section posts:`, ``, sectionPosts);
  }

  lines.push(
    ``,
    divider,
    `KEYWORDS (suggested)`,
    divider,
    ``,
    `  The Morning Cup, Vicinity News, ${opts.hostName}, daily news, morning briefing, ${opts.episodeIso}`,
    ``,
  );

  return lines.join("\n");
}
