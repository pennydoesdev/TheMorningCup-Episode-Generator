// Generates a podcast episode title + description via a single lightweight
// OpenAI call, then assembles the full metadata .txt saved alongside the episode.

import type { Config } from "./config";
import type { Env, EpisodeJson } from "./types";
import { logger } from "./logger";

export interface EpisodeCopy {
  titles: [string, string, string]; // three subtitle options; first is used as primary
  description: string;              // 2–3 paragraph podcast directory description
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
    titles: ["", "", ""],
    description: episode.social_copy?.main_post ?? "",
  };

  const prompt =
    `You are a podcast producer for "The Morning Cup," a daily morning news show ` +
    `hosted by ${config.hostName} for ${config.publisher}.\n\n` +
    `Using the social summary and chapter list below, produce two things:\n\n` +
    `1. TITLES: Three distinct catchy episode subtitles, each 10 words or fewer, ` +
    `each capturing today's main stories in a different style (punchy/direct, warm/curious, sharp/witty). ` +
    `Do NOT start any with "The Morning Cup". Use "&" not "and". ` +
    `Example options: ["Housing Costs, AI Bills & Your Morning Riddle", ` +
    `"Rising Rents, Tech Laws & a Quiet Riddle", "What You Need to Know This Morning"]\n\n` +
    `2. DESCRIPTION: A 2–3 paragraph episode description (150–220 words) for a podcast directory.\n` +
    `   - Paragraph 1: A hook capturing the main theme or feel of today's episode (2–3 sentences)\n` +
    `   - Paragraph 2: Preview the main topics covered, drawn from the chapter list\n` +
    `   - Paragraph 3: A short warm invite for listeners to tune in\n` +
    `   Tone: warm, conversational, approachable.\n\n` +
    `Return a JSON object with exactly two keys: "titles" (array of 3 strings) and "description" (string). ` +
    `No markdown, no extra text.\n\n` +
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
    const parsed = JSON.parse(raw) as { titles?: string[]; description?: string };
    const rawTitles = parsed.titles ?? [];
    return {
      titles: [
        (rawTitles[0] ?? "").trim(),
        (rawTitles[1] ?? "").trim(),
        (rawTitles[2] ?? "").trim(),
      ] as [string, string, string],
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
  episodeTitles: [string, string, string];
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
  const [t1, t2, t3] = opts.episodeTitles;
  const primaryTitle = t1
    ? `The Morning Cup: ${t1}`
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

  const titleOptions = [
    t1 ? `  1. The Morning Cup: ${t1}  ← primary (used in MP3 + feeds)` : "",
    t2 ? `  2. The Morning Cup: ${t2}` : "",
    t3 ? `  3. The Morning Cup: ${t3}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const lines = [
    `THE MORNING CUP — EPISODE METADATA`,
    ``,
    `Title:      ${primaryTitle}`,
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
    `TITLE OPTIONS (pick one for your podcast host)`,
    divider,
    ``,
    titleOptions || `  (no titles generated)`,
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
