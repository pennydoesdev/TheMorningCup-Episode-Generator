// Generates a podcast episode title + description via a single lightweight
// OpenAI call, then assembles the full metadata .txt saved alongside the episode.

import type { Config } from "./config";
import type { Env, EpisodeJson } from "./types";
import { logger } from "./logger";

// ---------------------------------------------------------------------------
// AI & Voice Disclosure
// These blocks are injected into every metadata file and into the episode
// description so producers can copy-paste the correct text per platform.
// The voice actor (Penelope Rose) has licensed her likeness with consent and
// participates in revenue sharing — this is meaningfully different from a
// generic AI voice and the language reflects that.
// ---------------------------------------------------------------------------

export interface DisclosureTexts {
  showNotes: string;
  spotify: string;
  apple: string;
  youtube: string;
  spoken: string;
}

export function buildDisclosure(showTitle: string, hostName: string): DisclosureTexts {
  return {
    showNotes: [
      `A note on our production: ${showTitle} is hosted by a real person.`,
      `${hostName} is a voice actor who has licensed their voice and likeness to Fold 42`,
      `with full consent, and participates in ongoing revenue sharing for every episode`,
      `produced. To make daily publishing sustainable, we use professional voice cloning`,
      `technology to synthesize their delivery from AI-assisted scripts — a model they have`,
      `reviewed, agreed to, and are compensated for.`,
      ``,
      `Research and scripting are assisted by artificial intelligence. All editorial`,
      `decisions — what gets covered, how it's framed, what gets cut — are made by the`,
      `Fold 42 team and reviewed before publication.`,
      ``,
      `We are committed to ethical AI production: minimal computing resources, transparent`,
      `sourcing, fair compensation for the humans who make this show possible, and honest`,
      `disclosure to our listeners.`,
      ``,
      `AI-generated voice synthesis · AI-assisted research and scripting · Produced by Fold 42`,
    ].join("\n"),

    spotify: [
      `${showTitle} features ${hostName}, a real voice actor who has consented to`,
      `and is compensated for the use of their voice likeness in this production. Episodes`,
      `are produced using professional AI voice synthesis and AI-assisted scripting, with`,
      `full editorial oversight by Fold 42.`,
      ``,
      `AI-generated voice | Ethical production | Real person, real consent`,
    ].join("\n"),

    apple: [
      `Hosted by ${hostName} for Fold 42. ${hostName} is a real voice actor who licenses`,
      `their voice and participates in revenue sharing for this show. Episodes use AI voice`,
      `synthesis and AI-assisted research, reviewed and approved by the Fold 42 editorial`,
      `team before publication. We believe in transparent, ethical AI production —`,
      `real people, real consent, real compensation.`,
    ].join("\n"),

    youtube: [
      `⚠️ AI Voice Disclosure: This episode features an AI-synthesized voice based on`,
      `the real voice and likeness of ${hostName}, produced with their full consent and`,
      `under a revenue-sharing agreement with Fold 42. Research and scripting are`,
      `AI-assisted with editorial review.`,
      ``,
      `(In YouTube Studio → Details → check "Altered or synthetic content" to comply`,
      `with YouTube's AI labeling requirement.)`,
    ].join("\n"),

    spoken: [
      `Quick note for new listeners: I'm ${hostName}, and while you're hearing my voice`,
      `through AI synthesis, I'm a real person who reviewed and agreed to this production —`,
      `and yes, I get a cut. Fold 42 handles the research and editing. I handle sounding`,
      `like me.`,
    ].join("\n"),
  };
}

// Convenience export for The Morning Cup defaults (backwards-compatible)
export const DISCLOSURE = buildDisclosure("The Morning Cup", "Penelope Rose");

export interface EpisodeCopy {
  titles: [string, string, string]; // three subtitle options; first is used as primary
  description: string;              // 2–3 paragraph podcast directory description
  seoTitle: string;                 // ≤60 chars for WordPress/Yoast <title>
  seoDescription: string;           // 150–160 chars for meta description
  tags: string;                     // comma-separated tags for WordPress post
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
    description: `${episode.social_copy?.main_post ?? ""}\n\n---\n\n${buildDisclosure(config.showTitle, config.hostName).showNotes}`,
    seoTitle: `${config.showTitle} — ${config.hostName}`,
    seoDescription: episode.social_copy?.main_post?.slice(0, 155) ?? "",
    tags: `${config.showTitle}, Fold 42, ${config.hostName}, daily news, morning briefing`,
  };

  const prompt =
    `You are a podcast producer for "${config.showTitle}," a daily morning news show ` +
    `hosted by ${config.hostName} for ${config.publisher}.\n\n` +
    `Using the social summary and chapter list below, produce two things:\n\n` +
    `1. TITLES: Three distinct catchy episode subtitles, each 10 words or fewer, ` +
    `each capturing today's main stories in a different style (punchy/direct, warm/curious, sharp/witty). ` +
    `Do NOT start any with "${config.showTitle}". Use "&" not "and". ` +
    `Example options: ["Housing Costs, AI Bills & Your Morning Riddle", ` +
    `"Rising Rents, Tech Laws & a Quiet Riddle", "What You Need to Know This Morning"]\n\n` +
    `2. DESCRIPTION: A 2–3 paragraph episode description (150–220 words) for a podcast directory.\n` +
    `   - Paragraph 1: A hook capturing the main theme or feel of today's episode (2–3 sentences)\n` +
    `   - Paragraph 2: Preview the main topics covered, drawn from the chapter list\n` +
    `   - Paragraph 3: A short warm invite for listeners to tune in\n` +
    `   Tone: warm, conversational, approachable.\n\n` +
    `3. SEO_TITLE: A WordPress post/SEO title, up to 50 characters (NOT including the show prefix). ` +
    `Return ONLY the subtitle portion — e.g. "Housing Costs, AI Bills & a Morning Riddle". ` +
    `The episode number and show name will be prepended automatically.\n\n` +
    `4. SEO_DESCRIPTION: A meta description for the WordPress post, 150–160 characters. ` +
    `Hook the reader; include the show name and 1–2 key topics.\n\n` +
    `5. TAGS: 10–14 comma-separated tags for the WordPress post. ` +
    `Mix show constants (${config.showTitle}, Fold 42, daily news, morning briefing) ` +
    `with episode-specific tags drawn from the chapter topics (people, places, issues).\n\n` +
    `Return a JSON object with exactly five keys: "titles" (array of 3 strings), "description" (string), ` +
    `"seo_title" (string), "seo_description" (string), "tags" (string). ` +
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
        max_tokens: 900,
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
    const parsed = JSON.parse(raw) as {
      titles?: string[];
      description?: string;
      seo_title?: string;
      seo_description?: string;
      tags?: string;
    };
    const rawTitles = parsed.titles ?? [];
    const baseDescription = (parsed.description ?? fallback.description).trim();
    return {
      titles: [
        (rawTitles[0] ?? "").trim(),
        (rawTitles[1] ?? "").trim(),
        (rawTitles[2] ?? "").trim(),
      ] as [string, string, string],
      // Append the full disclosure block so it's present in every CMS import.
      description: `${baseDescription}\n\n---\n\n${buildDisclosure(config.showTitle, config.hostName).showNotes}`,
      seoTitle: (parsed.seo_title ?? fallback.seoTitle).trim().slice(0, 50),
      seoDescription: (parsed.seo_description ?? fallback.seoDescription).trim().slice(0, 160),
      tags: (parsed.tags ?? fallback.tags).trim(),
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
  showTitle: string;
  hostName: string;
  publisher: string;
  copyrightHolder: string;
  genre: string;
  estimatedRuntimeMinutes: number;
  wordCount: number;
  description: string;
  seoTitle?: string;
  seoDescription?: string;
  tags?: string;
  episode: EpisodeJson;
}): string {
  const year = opts.episodeIso.slice(0, 4);
  const divider = "-".repeat(60);
  const [t1, t2, t3] = opts.episodeTitles;
  const primaryTitle = t1
    ? `${opts.showTitle}: ${t1}`
    : `${opts.showTitle} — ${opts.spokenDate}`;

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
    t1 ? `  1. ${opts.showTitle}: ${t1}  ← primary (used in MP3 + feeds)` : "",
    t2 ? `  2. ${opts.showTitle}: ${t2}` : "",
    t3 ? `  3. ${opts.showTitle}: ${t3}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  // Build full SEO title: "Ep. 142: Subtitle | Show Title" (≤60 chars)
  const seoTitleFull = (() => {
    const base = opts.seoTitle?.trim() ?? t1 ?? "";
    const full = `Ep. ${opts.episodeNumber}: ${base} | ${opts.showTitle}`;
    return full.length <= 60 ? full : full.slice(0, 57) + "...";
  })();

  const lines = [
    `${opts.showTitle.toUpperCase()} — EPISODE METADATA`,
    ``,
    `Post Title:      ${t1 || primaryTitle}`,
    `Feed Title:      ${primaryTitle}  (used in MP3 tags + RSS)`,
    `Episode:         ${opts.episodeNumber}  (Season ${opts.season})`,
    `Date:            ${opts.episodeIso}  —  ${opts.spokenDate}`,
    `Host:            ${opts.hostName}`,
    `Publisher:       ${opts.publisher}`,
    `Runtime:         ~${opts.estimatedRuntimeMinutes.toFixed(1)} min  (${opts.wordCount} words)`,
    `Copyright:       Copyright ${year} — ${opts.copyrightHolder}`,
    `Genre:           ${opts.genre}`,
    ``,
    `-- WordPress / OpenPodcast (Yoast or RankMath) --`,
    `SEO Title:       ${seoTitleFull}`,
    `SEO Description: ${opts.seoDescription ?? ""}`,
    `Tags:            ${opts.tags ?? ""}`,
    ``,
    divider,
    `TITLE OPTIONS`,
    divider,
    ``,
    `  (Primary = Post Title + podcast host title. Pick any for MP3 feed title.)`,
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

  // ── AI & Voice Disclosure ────────────────────────────────────────────────
  // Copy the correct block for each platform when uploading the episode.
  const disclosure = buildDisclosure(opts.showTitle, opts.hostName);
  lines.push(
    ``,
    divider,
    `AI & VOICE DISCLOSURE — copy per platform`,
    divider,
    ``,
    `PODCAST DIRECTORY (show notes / episode description)`,
    `Paste this at the end of your episode description on every platform:`,
    ``,
    disclosure.showNotes,
    ``,
    divider,
    ``,
    `SPOTIFY  (also add "AI-generated voice" to your show description in Spotify for Podcasters)`,
    ``,
    disclosure.spotify,
    ``,
    divider,
    ``,
    `APPLE PODCASTS / iHEART / AMAZON MUSIC`,
    ``,
    disclosure.apple,
    ``,
    divider,
    ``,
    `YOUTUBE AUDIOGRAM`,
    `Paste in video description AND check "Altered or synthetic content" in`,
    `YouTube Studio → Details.`,
    ``,
    disclosure.youtube,
    ``,
    divider,
    ``,
    `OPTIONAL — spoken disclosure line (drop into outro for new-listener episodes):`,
    ``,
    `"${disclosure.spoken}"`,
    ``,
  );

  return lines.join("\n");
}
