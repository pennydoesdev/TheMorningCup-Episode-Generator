// Builds the clean HTML version of the episode from the ElevenLabs script.

import type { EpisodeJson } from "./types";
import {
  escapeHtml,
  normalizeWhitespace,
  stripPacingTags,
  stripSpacerMarker,
} from "./utils/text";

export interface HtmlInputs {
  episode: EpisodeJson;
  episodeIso: string;
  estimatedRuntimeMinutes: number;
  wordCount: number;
}

export function buildEpisodeHtml(inputs: HtmlInputs): string {
  const { episode, episodeIso, estimatedRuntimeMinutes, wordCount } = inputs;
  const cleanScript = normalizeWhitespace(
    stripSpacerMarker(stripPacingTags(episode.elevenlabs_script)),
  );
  const paragraphs = cleanScript
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const title = `${episode.show_title} - ${episodeIso}`;
  const main = paragraphs
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("\n");

  const sectionPosts = (episode.social_copy?.section_posts ?? [])
    .map(
      (s) =>
        `<li><strong>${escapeHtml(s.section)}</strong>: ${escapeHtml(s.post)}</li>`,
    )
    .join("\n");

  const sourceList = (episode.source_notes ?? [])
    .map(
      (n) =>
        `<li><strong>${escapeHtml(n.category)}</strong> — ${escapeHtml(n.title)} (${escapeHtml(n.source)}, ${escapeHtml(n.date)}) ${
          n.url ? `<a href="${escapeHtml(n.url)}">link</a>` : ""
        }</li>`,
    )
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  :root { color-scheme: light dark; }
  body { font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; max-width: 760px; margin: 2.5rem auto; padding: 0 1.25rem; line-height: 1.6; }
  h1 { margin-bottom: 0.25rem; }
  .meta { color: #666; margin-bottom: 1.5rem; font-size: 0.95rem; }
  .meta span { margin-right: 1rem; }
  h2 { margin-top: 2rem; }
  p { margin: 0.75rem 0; }
  blockquote { border-left: 3px solid #999; margin: 1rem 0; padding: 0.25rem 1rem; color: #444; }
  ul { padding-left: 1.25rem; }
</style>
</head>
<body>
<header>
  <h1>${escapeHtml(episode.show_title)}</h1>
  <p class="meta">
    <span><strong>Episode:</strong> ${escapeHtml(episode.episode_date)}</span>
    <span><strong>Source date:</strong> ${escapeHtml(episode.source_date)}</span>
    <span><strong>Runtime:</strong> ~${estimatedRuntimeMinutes.toFixed(1)} min</span>
    <span><strong>Words:</strong> ${wordCount.toLocaleString()}</span>
  </p>
</header>

<main>
${main}
</main>

<section>
  <h2>Riddle</h2>
  <p><strong>Q:</strong> ${escapeHtml(episode.riddle_question || "")}</p>
  <p><strong>A:</strong> ${escapeHtml(episode.riddle_answer || "")}</p>
</section>

<section>
  <h2>Social copy</h2>
  <p><strong>Main:</strong> ${escapeHtml(episode.social_copy?.main_post || "")}</p>
  <ul>
${sectionPosts}
  </ul>
</section>

<section>
  <h2>Source notes</h2>
  <ul>
${sourceList}
  </ul>
</section>
</body>
</html>`;
}
