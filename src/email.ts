// Resend API email delivery.

import type { Env } from "./types";
import type { Config } from "./config";
import { logger } from "./logger";

interface ResendPayload {
  from: string;
  to: string[];
  subject: string;
  html: string;
  text?: string;
}

async function sendResend(env: Env, payload: ResendPayload): Promise<void> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    logger.warn("resend send failed", { status: res.status, text: text.slice(0, 300) });
    throw new Error(`Resend ${res.status}: ${text.slice(0, 300)}`);
  }
}

export interface CompletionEmailInputs {
  episodeIso: string;
  sourceIso: string;
  wordCount: number;
  estimatedRuntimeMinutes: number;
  validationOk: boolean;
  validationWarnings: string[];
  chunkCount: number;
  links: {
    txt?: string;
    html?: string;
    json?: string;
    manifest?: string;
    filesTxt?: string;
    chunks: { order: number; filename: string; url?: string; r2_key: string }[];
  };
  sourceLimited: boolean;
}

export async function sendCompletionEmail(
  env: Env,
  config: Config,
  inputs: CompletionEmailInputs,
): Promise<void> {
  if (!config.enableEmail) return;
  if (!config.emailFrom || !config.emailTo) {
    logger.warn("email disabled: missing EMAIL_FROM or EMAIL_TO");
    return;
  }

  const subject = `The Morning Cup - Weekly Rewind - ${inputs.episodeIso}`;
  const linkLine = (label: string, val?: string): string =>
    val ? `<li><strong>${label}:</strong> <a href="${val}">${val}</a></li>` : `<li><strong>${label}:</strong> (no public URL — see R2 key)</li>`;

  const chunkRows = inputs.links.chunks
    .map(
      (c) =>
        `<li>${String(c.order).padStart(3, "0")} — ${
          c.url ? `<a href="${c.url}">${c.filename}</a>` : `${c.filename} <code>${c.r2_key}</code>`
        }</li>`,
    )
    .join("\n");

  const warningsBlock =
    inputs.validationWarnings.length > 0
      ? `<p><strong>Warnings:</strong></p><ul>${inputs.validationWarnings
          .map((w) => `<li>${escape(w)}</li>`)
          .join("")}</ul>`
      : "";

  const sourceWarning = inputs.sourceLimited
    ? `<p><strong>⚠ Source digest was unavailable.</strong> Episode produced as a structural draft only.</p>`
    : "";

  const html = `<!doctype html>
<html><body style="font-family:system-ui,sans-serif;line-height:1.5;">
<h1>The Morning Cup - Weekly Rewind — ${inputs.episodeIso}</h1>
${sourceWarning}
<ul>
  <li><strong>Episode date (Sunday of publication):</strong> ${inputs.episodeIso}</li>
  <li><strong>Source window start:</strong> ${inputs.sourceIso}</li>
  <li><strong>Word count:</strong> ${inputs.wordCount.toLocaleString()}</li>
  <li><strong>Estimated runtime:</strong> ${inputs.estimatedRuntimeMinutes.toFixed(1)} min</li>
  <li><strong>Validation:</strong> ${inputs.validationOk ? "OK" : "WITH ERRORS"}</li>
  <li><strong>Chunk count:</strong> ${inputs.chunkCount}</li>
</ul>
${warningsBlock}
<h2>Files</h2>
<ul>
  ${linkLine("TXT", inputs.links.txt)}
  ${linkLine("HTML", inputs.links.html)}
  ${linkLine("JSON", inputs.links.json)}
  ${linkLine("Manifest", inputs.links.manifest)}
  ${linkLine("files.txt (ffmpeg concat list)", inputs.links.filesTxt)}
</ul>
<h2>Chunks (in playback order)</h2>
<ol>
${chunkRows}
</ol>
<p>Chunks are numbered in order. Stitch externally with ffmpeg:<br>
<code>ffmpeg -f concat -safe 0 -i files.txt -c copy "The Morning Cup - Weekly Rewind - ${inputs.episodeIso}.mp3"</code></p>
</body></html>`;

  await sendResend(env, {
    from: config.emailFrom,
    to: [config.emailTo],
    subject,
    html,
  });
}

export interface FailureEmailInputs {
  episodeIso: string;
  stage: string;
  error: string;
  validationErrors?: string[];
  rejectedKey?: string;
  rejectedUrl?: string;
}

export async function sendFailureEmail(
  env: Env,
  config: Config,
  inputs: FailureEmailInputs,
): Promise<void> {
  if (!config.enableEmail) return;
  if (!config.emailFrom || !config.emailTo) return;

  const subject = `FAILED: The Morning Cup - Weekly Rewind - ${inputs.episodeIso}`;
  const validationBlock = inputs.validationErrors?.length
    ? `<p><strong>Validation errors:</strong></p><ul>${inputs.validationErrors
        .map((e) => `<li>${escape(e)}</li>`)
        .join("")}</ul>`
    : "";

  const rejected = inputs.rejectedUrl
    ? `<p><strong>Rejected raw output:</strong> <a href="${inputs.rejectedUrl}">${inputs.rejectedUrl}</a></p>`
    : inputs.rejectedKey
    ? `<p><strong>Rejected raw output R2 key:</strong> ${escape(inputs.rejectedKey)}</p>`
    : "";

  const html = `<!doctype html>
<html><body style="font-family:system-ui,sans-serif;line-height:1.5;">
<h1>The Morning Cup - Weekly Rewind — Generation failure (${inputs.episodeIso})</h1>
<p><strong>Stage failed:</strong> ${escape(inputs.stage)}</p>
<p><strong>Error:</strong> <code>${escape(inputs.error)}</code></p>
${validationBlock}
${rejected}
</body></html>`;

  await sendResend(env, {
    from: config.emailFrom,
    to: [config.emailTo],
    subject,
    html,
  });
}

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
