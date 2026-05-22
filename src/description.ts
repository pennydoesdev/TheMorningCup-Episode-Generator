// Generates a podcast episode title + description via a single lightweight
// OpenAI call, then assembles the full metadata .txt saved alongside the episode.

import type { Config } from "./config";
import type { Env, EpisodeJson } from "./types";
import { logger } from "./logger";

export interface EpisodeCopy {
  title: string;       // ≤10-word subtitle, e.g. "Housing Costs, AI Bills & Your Morning Riddle"
  description: string; // 2–3 paragraph podcast directory description
}

export async function generateEpisodeCopy(
  env: Env,
  config: Config,
  episode: EpisodeJson,
): Promise<EpisodeCopy> {
  const chapters = (episode.chapters ?? [])
    .map((c, i) => `${i + 1}. ${c.title}`)
    .join("\n");

  const fallback: EpisodeCopy = {
    title: "",
    description: episode.social_copy?.main_post ?? "",
  };

  const prompt =
    `You are a podcast producer for "The Morning Cup," a daily morning news show ` +
    `hosted by ${config.hostName} for ${config.publisher}.\n\n` +
    `Using the social summary and chapter list below, produce two things:\n\n` +
    `1. TITLE: A catchy episode subtitle of 10 words or fewer that captures today's main stories. ` +
    `Do NOT start with "The Morning Cup" — just the subtitle. ` +
    `Use "&" not "and". Example: "Housing Costs, AI Regulation & a Puzzling Riddle"\n\n` +
    `2. DESCRIPTION: A 2–3 paragraph episode description (150–220 words) for a podcast directory.\n` +
    `   - Paragraph 1: A hook capturing the main theme or feel of today's episode (2–3 sentences)\n` +
    `   - Paragraph 2: Preview the main topics covered, drawn from the chapter list\n` +
    `   - Paragraph 3: A short warm invite for listeners to tune in\n` +
    `   Tone: warm, conversational, approachable.\n\n` +
    `Return a JSON object with exactly two keys: "title" and "description". No markdown, no extra text.\n\n` +
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
        max_tokens: 600,
        response_format: { type: "json_object" },
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      logger.warn("episode copy generation failed", { status: res.status });
      return fallback;
    }

    const data = await res.json() as { choices: { message: { content: string } }[] };
    const raw = data.choices?.[0]?.message?.content?.trim() ?? "";
    const parsed = JSON.parse(raw) as { title?: string; description?: string };
    return {
      title: (parsed.title ?? "").trim(),
      description: (parsed.description ?? fallback.description).trim(),
    };
  } catch (err) {
    logger.warn("episode copy generation error", { err: String(err) });
    return fallback;
  }
}

export function buildMetadataTxt(opts: {
  episodeIso: string;
  spokenDate: string;
  episodeTitle: string;
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
  const fullTitle = opts.episodeTitle
    ? `The Morning Cup: ${opts.episodeTitle}`
    : `The Morning Cup — ${opts.spokenDate}`;

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
    `Title:      ${fullTitle}`,
    `Subtitle:   ${opts.episodeTitle || opts.spokenDate}`,
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
