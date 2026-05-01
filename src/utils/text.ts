// String/text helpers used by the chunker, validator, and HTML builder.

export const SPACER_MARKER = "[TEN-SECOND SECTION SPACER]";

const PACING_TAGS = [
  "[pause]",
  "[gentle pause]",
  "[beat]",
  "[reflective pause]",
  "[lower]",
  "[firmer]",
  "[warmly]",
];

const PACING_TAG_REGEX = /\[(pause|gentle pause|beat|reflective pause|lower|firmer|warmly)\]/gi;

export function countWords(text: string): number {
  if (!text) return 0;
  // Strip pacing tags and spacer markers from word count.
  const cleaned = text
    .replace(PACING_TAG_REGEX, " ")
    .replace(/\[TEN-SECOND SECTION SPACER\]/g, " ");
  const tokens = cleaned.match(/[A-Za-z0-9'’\-]+/g);
  return tokens ? tokens.length : 0;
}

export function countSpacers(text: string): number {
  if (!text) return 0;
  const matches = text.match(/\[TEN-SECOND SECTION SPACER\]/g);
  return matches ? matches.length : 0;
}

export function stripSpacerMarker(text: string): string {
  return text.replace(/\[TEN-SECOND SECTION SPACER\]/g, "");
}

export function stripPacingTags(text: string): string {
  return text.replace(PACING_TAG_REGEX, "");
}

export function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function pad3(n: number): string {
  const s = String(n);
  if (s.length >= 3) return s;
  return "0".repeat(3 - s.length) + s;
}

export { PACING_TAGS };
