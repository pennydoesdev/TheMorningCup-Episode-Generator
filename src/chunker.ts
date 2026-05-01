// Splits the ElevenLabs script into ordered TTS-ready chunks.

import type { ChunkPiece } from "./types";
import type { Config } from "./config";
import {
  SPACER_MARKER,
  pad3,
  stripPacingTags,
  stripSpacerMarker,
} from "./utils/text";

interface PreparedSegment {
  text: string;
  isFinal: boolean;
  // Indices (0-based, in the order spacers appear) of the sections that BEGIN
  // in this segment. Empty array means this is a continuation piece of a
  // previously-split long section.
  startsSectionIndices: number[];
}

const MIN_MERGE_CHARS = 600;

export interface ChunkInputs {
  script: string;
  episodeIso: string; // YYYY-MM-DD
  baseTitle: string; // "The Morning Cup"
  config: Config;
}

export function buildChunks(inputs: ChunkInputs): ChunkPiece[] {
  const { script, episodeIso, baseTitle, config } = inputs;
  const segments = splitBySpacer(script);
  const merged = mergeShortSegments(segments, MIN_MERGE_CHARS);
  const sized = enforceMaxSize(merged, config.maxTtsCharsPerChunk);

  const chunks: ChunkPiece[] = [];
  let order = 1;
  for (const seg of sized) {
    let text = seg.text;
    if (config.stripPacingTagsForTts) text = stripPacingTags(text);
    text = stripSpacerMarker(text).trim();
    if (text.length === 0) continue;
    const filename = `${baseTitle} - ${episodeIso} - ${pad3(order)}.mp3`;
    const r2_key = `${config.showKey}/${episodeIso}/chunks/${filename}`;
    chunks.push({
      order,
      filename,
      r2_key,
      character_count: text.length,
      text,
      starts_section_indices: seg.startsSectionIndices,
    });
    order++;
  }
  return chunks;
}

function splitBySpacer(script: string): PreparedSegment[] {
  const parts = script.split(SPACER_MARKER);
  const out: PreparedSegment[] = [];
  // Track section index from the original script — every non-empty part is
  // one major section, in order.
  let sectionIndex = 0;
  for (let i = 0; i < parts.length; i++) {
    const text = parts[i].trim();
    if (text.length === 0) continue;
    out.push({
      text,
      isFinal: i === parts.length - 1,
      startsSectionIndices: [sectionIndex],
    });
    sectionIndex++;
  }
  return out;
}

function mergeShortSegments(
  segments: PreparedSegment[],
  minChars: number,
): PreparedSegment[] {
  if (segments.length === 0) return [];
  const out: PreparedSegment[] = [];
  for (const seg of segments) {
    const last = out[out.length - 1];
    if (
      last &&
      last.text.length < minChars &&
      !last.isFinal &&
      // Never merge into the final riddle answer segment.
      !seg.isFinal
    ) {
      last.text = `${last.text}\n\n${seg.text}`;
      last.isFinal = seg.isFinal;
      // Both sections now begin in this merged chunk — preserve indices.
      last.startsSectionIndices = [
        ...last.startsSectionIndices,
        ...seg.startsSectionIndices,
      ];
    } else {
      out.push({
        text: seg.text,
        isFinal: seg.isFinal,
        startsSectionIndices: [...seg.startsSectionIndices],
      });
    }
  }
  return out;
}

function enforceMaxSize(
  segments: PreparedSegment[],
  maxChars: number,
): PreparedSegment[] {
  const out: PreparedSegment[] = [];
  for (const seg of segments) {
    if (seg.text.length <= maxChars) {
      out.push(seg);
      continue;
    }
    const pieces = sentenceSplit(seg.text, maxChars);
    for (let i = 0; i < pieces.length; i++) {
      // Only the FIRST split piece begins the section(s). Continuation
      // pieces don't start a new section.
      out.push({
        text: pieces[i],
        isFinal: seg.isFinal && i === pieces.length - 1,
        startsSectionIndices: i === 0 ? [...seg.startsSectionIndices] : [],
      });
    }
  }
  return out;
}

// Split a long block into <= maxChars windows, preferring sentence boundaries.
function sentenceSplit(text: string, maxChars: number): string[] {
  const result: string[] = [];
  let remaining = text.trim();
  while (remaining.length > maxChars) {
    let cut = findBoundary(remaining, maxChars);
    if (cut <= 0) cut = maxChars; // hard cut as last resort, never inside a word
    // Avoid cutting inside a word: walk back to the previous space.
    while (cut > 0 && cut < remaining.length && /\S/.test(remaining[cut]) && /\S/.test(remaining[cut - 1])) {
      cut--;
    }
    if (cut <= 0) cut = maxChars;
    const head = remaining.slice(0, cut).trim();
    if (head.length > 0) result.push(head);
    remaining = remaining.slice(cut).trim();
  }
  if (remaining.length > 0) result.push(remaining);
  return result;
}

// Prefer boundaries: blank line, then ". ", "? ", "! ", then any whitespace.
function findBoundary(text: string, maxChars: number): number {
  const window = text.slice(0, maxChars);
  const blankLine = window.lastIndexOf("\n\n");
  if (blankLine >= maxChars * 0.4) return blankLine + 2;
  const candidates = [". ", "? ", "! ", ".\n", "?\n", "!\n"];
  let best = -1;
  for (const c of candidates) {
    const idx = window.lastIndexOf(c);
    if (idx > best) best = idx + c.length;
  }
  if (best >= maxChars * 0.4) return best;
  const lastSpace = window.lastIndexOf(" ");
  if (lastSpace > 0) return lastSpace + 1;
  return -1;
}
