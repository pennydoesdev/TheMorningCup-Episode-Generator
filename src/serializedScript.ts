// Serialized Script — HTML approval document for editorial review before TTS.
//
// Generates a full-page HTML document containing the episode script, fact-check
// summary, works-cited list, and a DocuSign-style editorial approval block.
// Stored in R2 alongside all other episode files.

import type { EpisodeJson, SourceNote } from "./types";
import type { Config } from "./config";
import type { FactCheckReport } from "./factcheck";

// ---------------------------------------------------------------------------
// R2 key helper
// ---------------------------------------------------------------------------

/**
 * Returns the R2 key for the serialized script HTML file.
 *
 * Pattern: {r2KeyPrefix}/{episodeIso}/{Show Title} - {episodeIso} - Serialized Script-{episodeSerial}-{YYYYMMDD}.html
 */
export function getSerializedScriptKey(
  r2KeyPrefix: string,
  episodeIso: string,
  episodeSerial: string,
  showTitle: string,
): string {
  const yyyymmdd = episodeIso.replace(/-/g, "");
  const safeName = `${showTitle} - ${episodeIso} - Serialized Script-${episodeSerial}-${yyyymmdd}.html`;
  return `${r2KeyPrefix}/${episodeIso}/${safeName}`;
}

// ---------------------------------------------------------------------------
// HTML builder
// ---------------------------------------------------------------------------

/**
 * Format an ISO timestamp string as "YYYY-MM-DD HH:MM:SS" (24-hour, UTC).
 */
function formatGeneratedAt(iso: string): string {
  // Accept either a full ISO string or anything Date can parse.
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`
  );
}

/** Escape characters that are special in HTML. */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Extract the first HTTP/HTTPS URL from a string, or null. */
function extractUrl(text: string): string | null {
  const m = text.match(/https?:\/\/[^\s"'>)]+/);
  return m ? m[0] : null;
}

// ---------------------------------------------------------------------------
// Script body rendering
// ---------------------------------------------------------------------------

/**
 * Split and render the elevenlabs_script into HTML blocks.
 *
 * Splits on [TEN-SECOND SECTION SPACER] to produce discrete script blocks.
 * Within each block:
 *   - [5-SECOND PAUSE] → visible pause marker span
 *   - Lines separated by \n\n or \n become <p> tags
 *   - A citation superscript is appended after the first sentence of the
 *     first paragraph in each block, cycling through available source notes.
 */
function renderScriptBody(script: string, sourceNotes: SourceNote[]): string {
  const SPACER_TAG = "[TEN-SECOND SECTION SPACER]";
  const PAUSE_TAG = "[5-SECOND PAUSE]";

  const rawBlocks = script.split(SPACER_TAG);
  const parts: string[] = [];

  rawBlocks.forEach((rawBlock, blockIndex) => {
    const trimmedBlock = rawBlock.trim();
    if (!trimmedBlock) return;

    // Determine a citation number for this block (1-based, cycling).
    const citeIndex = blockIndex < sourceNotes.length ? blockIndex : -1;
    const citeNum = citeIndex >= 0 ? citeIndex + 1 : -1;

    // Split into paragraphs on blank lines or single newlines.
    const paragraphs = trimmedBlock
      .split(/\n{2,}|\n/)
      .map((p) => p.trim())
      .filter(Boolean);

    const renderedParagraphs = paragraphs.map((para, paraIndex) => {
      // Replace pause tags inside paragraph text.
      let html = esc(para).replace(
        /\[5-SECOND PAUSE\]/gi,
        `<span class="pause-marker">[5-second pause]</span>`,
      );

      // Place a citation superscript after the first sentence of the first
      // paragraph of each block (if we have a matching source note).
      if (paraIndex === 0 && citeNum > 0) {
        // Try to find the end of the first sentence (.  !  ?)
        const sentenceEnd = html.search(/[.!?](?:\s|$)/);
        const citeSup = `<sup><a href="#cite-${citeNum}" class="cite-ref">[${citeNum}]</a></sup>`;
        if (sentenceEnd !== -1) {
          // Insert after the punctuation character.
          const insertAt = sentenceEnd + 1;
          html = html.slice(0, insertAt) + citeSup + html.slice(insertAt);
        } else {
          // Append at end of paragraph.
          html = html + citeSup;
        }
      }

      return `        <p>${html}</p>`;
    });

    // Build the block, prepending a spacer divider for all blocks after the first.
    let blockHtml = "";
    if (blockIndex > 0) {
      blockHtml +=
        `      <hr class="section-spacer">\n` +
        `      <span class="spacer-label">— Section Break —</span>\n`;
    }
    blockHtml +=
      `      <div class="script-block" data-block-id="block-${blockIndex}">\n` +
      renderedParagraphs.join("\n") +
      `\n      </div>`;

    parts.push(blockHtml);
  });

  // Handle any stray [5-SECOND PAUSE] that survived (shouldn't normally occur
  // after the per-paragraph replacement, but just in case).
  return parts.join("\n");
}

// ---------------------------------------------------------------------------
// Works Cited rendering
// ---------------------------------------------------------------------------

function renderWorksCited(sourceNotes: SourceNote[]): string {
  if (sourceNotes.length === 0) {
    return `    <p class="no-sources">No source notes recorded for this episode.</p>`;
  }

  const items = sourceNotes.map((note, i) => {
    const num = i + 1;
    const url = note.url || extractUrl(note.source) || null;
    const title = esc(note.title || "(Untitled)");
    const source = esc(note.source || "");
    const date = esc(note.date || "");
    const category = esc(note.category || "");

    let citation = `<strong>${title}</strong>`;
    if (source) citation += ` — ${source}`;
    if (date) citation += ` (${date})`;
    if (category) citation += ` <span class="cite-category">[${category}]</span>`;
    if (url) {
      citation += ` <a href="${esc(url)}" target="_blank" rel="noopener noreferrer" class="cite-url">${esc(url)}</a>`;
    }

    return `      <li id="cite-${num}" class="citation-entry">${citation}</li>`;
  });

  return `    <ol class="citation-list">\n${items.join("\n")}\n    </ol>`;
}

// ---------------------------------------------------------------------------
// Fact-check summary rendering
// ---------------------------------------------------------------------------

function renderFactCheckSummary(report: FactCheckReport): string {
  const trustPct = (report.averageTrustScore * 100).toFixed(1);
  const trustBadgeClass =
    report.averageTrustScore >= 0.85
      ? "badge-pass"
      : report.averageTrustScore >= 0.60
        ? "badge-warn"
        : "badge-fail";

  let removedSection = "";
  if (report.claimsRemoved > 0) {
    const items = report.removedSummaries
      .map((s) => `        <li class="removed-claim">${esc(s)}</li>`)
      .join("\n");
    removedSection = `
    <div class="removed-claims-block">
      <h3>Removed Claims</h3>
      <ol>
${items}
      </ol>
    </div>`;
  }

  return `    <table class="factcheck-table">
      <tbody>
        <tr><th>Claims Checked</th><td>${report.claimsChecked}</td></tr>
        <tr><th>Claims Passed</th><td class="badge-pass">${report.claimsPassed}</td></tr>
        <tr><th>Claims Removed</th><td class="${report.claimsRemoved > 0 ? "badge-fail" : "badge-pass"}">${report.claimsRemoved}</td></tr>
        <tr><th>Average Trust Score</th><td><span class="badge ${trustBadgeClass}">${trustPct}%</span></td></tr>
        <tr><th>Model Used</th><td><code>${esc(report.modelUsed)}</code></td></tr>
        <tr><th>Checked At</th><td>${esc(report.checkedAt)}</td></tr>
      </tbody>
    </table>${removedSection}`;
}

// ---------------------------------------------------------------------------
// CSS
// ---------------------------------------------------------------------------

const STYLES = `
  /* ── Reset & base ───────────────────────────────────────────────── */
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html { font-size: 16px; }
  body {
    font-family: 'Georgia', 'Times New Roman', Times, serif;
    background: #ffffff;
    color: #1a1a1a;
    line-height: 1.7;
    padding: 0 0 4rem;
  }

  /* ── Stage pipeline bar ─────────────────────────────────────────── */
  .pipeline {
    display: flex;
    gap: 0;
    background: #f1f5f9;
    border-bottom: 1px solid #e2e8f0;
    padding: 0;
    flex-wrap: wrap;
  }
  .pipeline .stage {
    flex: 1 1 auto;
    text-align: center;
    padding: 0.55rem 1rem;
    font-family: 'Helvetica Neue', Arial, sans-serif;
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: #94a3b8;
    border-right: 1px solid #e2e8f0;
    position: relative;
  }
  .pipeline .stage:last-child { border-right: none; }
  .pipeline .stage.active {
    background: #1e293b;
    color: #f8fafc;
  }
  .pipeline .stage.active::after {
    content: '';
    position: absolute;
    bottom: -6px;
    left: 50%;
    transform: translateX(-50%);
    border-left: 6px solid transparent;
    border-right: 6px solid transparent;
    border-top: 6px solid #1e293b;
  }

  /* ── Document header ────────────────────────────────────────────── */
  .doc-header {
    max-width: 860px;
    margin: 2.5rem auto 2rem;
    padding: 0 2rem;
    border-bottom: 2px solid #1a1a1a;
    padding-bottom: 1.25rem;
  }
  .title-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 1rem;
    flex-wrap: wrap;
  }
  .episode-name {
    font-size: 1.75rem;
    font-weight: 700;
    letter-spacing: -0.01em;
    color: #0f172a;
  }
  .episode-date {
    font-family: 'Helvetica Neue', Arial, sans-serif;
    font-size: 1rem;
    font-weight: 600;
    color: #475569;
    white-space: nowrap;
  }
  .meta-block {
    margin-top: 0.75rem;
    font-family: 'Helvetica Neue', Arial, sans-serif;
    font-size: 0.8rem;
    color: #64748b;
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 2rem;
  }
  .meta-block div { line-height: 1.5; }

  /* ── Content wrapper ────────────────────────────────────────────── */
  .content-section {
    max-width: 860px;
    margin: 2rem auto;
    padding: 0 2rem;
  }
  .content-section h2 {
    font-family: 'Helvetica Neue', Arial, sans-serif;
    font-size: 0.85rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #94a3b8;
    border-bottom: 1px solid #e2e8f0;
    padding-bottom: 0.5rem;
    margin-bottom: 1.25rem;
  }

  /* ── Script body ────────────────────────────────────────────────── */
  .script-body { }
  .script-block {
    margin-bottom: 1.5rem;
  }
  .script-block p {
    margin-bottom: 1em;
    text-align: justify;
    hyphens: auto;
  }
  .section-spacer {
    border: none;
    border-top: 1px dashed #cbd5e1;
    margin: 1.75rem 0 0.5rem;
  }
  .spacer-label {
    display: block;
    text-align: center;
    font-family: 'Helvetica Neue', Arial, sans-serif;
    font-size: 0.7rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #94a3b8;
    margin-bottom: 1.25rem;
  }
  .pause-marker {
    font-family: 'Helvetica Neue', Arial, sans-serif;
    font-size: 0.72rem;
    font-style: italic;
    color: #94a3b8;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 3px;
    padding: 0.1em 0.45em;
    margin: 0 0.2em;
    vertical-align: middle;
  }

  /* ── Citation superscripts ──────────────────────────────────────── */
  sup { line-height: 0; }
  a.cite-ref {
    font-family: 'Helvetica Neue', Arial, sans-serif;
    font-size: 0.65rem;
    font-weight: 700;
    color: #2563eb;
    text-decoration: none;
    margin-left: 1px;
  }
  a.cite-ref:hover { text-decoration: underline; }

  /* ── Fact-check section ─────────────────────────────────────────── */
  .factcheck-table {
    width: 100%;
    border-collapse: collapse;
    font-family: 'Helvetica Neue', Arial, sans-serif;
    font-size: 0.85rem;
  }
  .factcheck-table th, .factcheck-table td {
    padding: 0.55rem 0.75rem;
    text-align: left;
    border-bottom: 1px solid #f1f5f9;
  }
  .factcheck-table th {
    color: #475569;
    font-weight: 600;
    width: 200px;
  }
  .factcheck-table tr:last-child th,
  .factcheck-table tr:last-child td { border-bottom: none; }
  .badge {
    display: inline-block;
    padding: 0.15em 0.55em;
    border-radius: 999px;
    font-size: 0.78rem;
    font-weight: 700;
    font-family: 'Helvetica Neue', Arial, sans-serif;
  }
  .badge-pass, td.badge-pass { color: #15803d; }
  .badge-warn, td.badge-warn { color: #b45309; }
  .badge-fail, td.badge-fail { color: #dc2626; }
  .badge.badge-pass { background: #dcfce7; }
  .badge.badge-warn { background: #fef9c3; }
  .badge.badge-fail { background: #fee2e2; }
  .removed-claims-block {
    margin-top: 1.25rem;
  }
  .removed-claims-block h3 {
    font-family: 'Helvetica Neue', Arial, sans-serif;
    font-size: 0.8rem;
    font-weight: 700;
    color: #dc2626;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin-bottom: 0.6rem;
  }
  .removed-claims-block ol {
    padding-left: 1.5rem;
  }
  .removed-claim {
    font-family: 'Helvetica Neue', Arial, sans-serif;
    font-size: 0.82rem;
    color: #7f1d1d;
    text-decoration: line-through;
    margin-bottom: 0.4rem;
    line-height: 1.5;
  }
  .no-sources {
    font-family: 'Helvetica Neue', Arial, sans-serif;
    font-size: 0.85rem;
    color: #94a3b8;
    font-style: italic;
  }

  /* ── Works Cited ────────────────────────────────────────────────── */
  .citation-list {
    padding-left: 1.75rem;
  }
  .citation-entry {
    font-family: 'Helvetica Neue', Arial, sans-serif;
    font-size: 0.82rem;
    line-height: 1.6;
    margin-bottom: 0.65rem;
    color: #374151;
  }
  .citation-entry strong { color: #1a1a1a; }
  .cite-category {
    color: #94a3b8;
    font-style: italic;
  }
  .cite-url {
    color: #2563eb;
    word-break: break-all;
    font-size: 0.78rem;
  }

  /* ── Approval block ─────────────────────────────────────────────── */
  .approval-block {
    border: 2px solid #22c55e;
    border-radius: 8px;
    padding: 2rem;
    background: #f0fdf4;
  }
  .approval-block h2 {
    color: #15803d !important;
    border-bottom-color: #bbf7d0 !important;
  }
  .approval-note {
    font-family: 'Helvetica Neue', Arial, sans-serif;
    font-size: 0.85rem;
    color: #166534;
    margin-bottom: 1.75rem;
    line-height: 1.5;
  }
  .signature-row {
    display: flex;
    gap: 2rem;
    flex-wrap: wrap;
    margin-bottom: 1.5rem;
  }
  .signature-field {
    flex: 1 1 260px;
  }
  .sig-line {
    border-bottom: 2px solid #15803d;
    height: 2.5rem;
    margin-bottom: 0.5rem;
    background: repeating-linear-gradient(
      90deg,
      transparent,
      transparent 4px,
      rgba(21,128,61,0.08) 4px,
      rgba(21,128,61,0.08) 8px
    );
  }
  .sig-label {
    font-family: 'Helvetica Neue', Arial, sans-serif;
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #15803d;
    margin-bottom: 0.75rem;
  }
  .sig-meta {
    font-family: 'Helvetica Neue', Arial, sans-serif;
    font-size: 0.82rem;
    color: #374151;
    margin-bottom: 0.35rem;
    line-height: 1.5;
  }
  .legal-note {
    font-family: 'Helvetica Neue', Arial, sans-serif;
    font-size: 0.72rem;
    color: #6b7280;
    line-height: 1.5;
    border-top: 1px solid #bbf7d0;
    padding-top: 1rem;
    font-style: italic;
  }

  /* ── Print ──────────────────────────────────────────────────────── */
  @media print {
    .pipeline { display: none; }
    body { padding: 0; }
    .approval-block { border-color: #000; background: #fff; }
    a { color: inherit; text-decoration: none; }
  }
`;

// ---------------------------------------------------------------------------
// Main builder
// ---------------------------------------------------------------------------

/**
 * Build the full HTML serialized script document for editorial approval.
 */
export function buildSerializedScriptHtml(
  episode: EpisodeJson,
  episodeIso: string,
  config: Config,
  factCheckReport: FactCheckReport,
  episodeSerial: string,
  generatedAt: string,
): string {
  const showTitle = episode.show_title || config.showTitle;
  const formattedAt = formatGeneratedAt(generatedAt);
  const sourceNotes: SourceNote[] = Array.isArray(episode.source_notes)
    ? episode.source_notes
    : [];

  const scriptBodyHtml = renderScriptBody(episode.elevenlabs_script, sourceNotes);
  const factCheckHtml = renderFactCheckSummary(factCheckReport);
  const worksCitedHtml = renderWorksCited(sourceNotes);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(showTitle)} — Serialized Script — ${esc(episodeIso)}</title>
  <style>${STYLES}
  </style>
</head>
<body>

  <!-- Stage pipeline bar -->
  <div class="pipeline">
    <span class="stage active">First Draft</span>
    <span class="stage">Reviewing</span>
    <span class="stage">Edited</span>
    <span class="stage">Approved</span>
    <span class="stage">Generated</span>
    <span class="stage">Finalized</span>
  </div>

  <!-- Document header -->
  <header class="doc-header">
    <div class="title-row">
      <h1 class="episode-name">${esc(showTitle)}.</h1>
      <span class="episode-date">${esc(episodeIso)}</span>
    </div>
    <div class="meta-block">
      <div>Episode Serial: ${esc(episodeSerial)}</div>
      <div>AI Provider: OpenAI ${esc(config.openaiModel)}</div>
      <div>Generated: ${esc(formattedAt)}</div>
    </div>
  </header>

  <!-- Script body -->
  <section class="content-section script-body">
    <h2>Script</h2>
${scriptBodyHtml}
  </section>

  <!-- Fact-check summary -->
  <section class="content-section factcheck-summary">
    <h2>Fact-Check Report</h2>
${factCheckHtml}
  </section>

  <!-- Works Cited -->
  <section class="content-section works-cited">
    <h2>Works Cited</h2>
${worksCitedHtml}
  </section>

  <!-- Approval block (DocuSign style) -->
  <section class="content-section">
    <div class="approval-block">
      <h2>Editorial Approval</h2>
      <p class="approval-note">This document requires editorial approval before TTS generation. Sign below to approve for publication.</p>
      <div class="signature-row">
        <div class="signature-field">
          <div class="sig-line"></div>
          <div class="sig-label">Approver Signature</div>
          <div class="sig-meta">Name: ____________________</div>
          <div class="sig-meta">Title: ____________________</div>
          <div class="sig-meta">Date: ____________________</div>
          <div class="sig-meta">Serial: ____________________</div>
        </div>
      </div>
      <p class="legal-note">By signing, approver attests that the script has been reviewed for accuracy, editorial standards compliance, and readiness for audio generation. This signature constitutes a binding editorial approval record.</p>
    </div>
  </section>

</body>
</html>`;
}
