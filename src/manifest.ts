// Builds the manifest JSON and the ffmpeg files.txt concat list.

import type {
  ChapterEntry,
  ChunkPiece,
  Manifest,
  ManifestChunk,
  ValidationResult,
} from "./types";

export interface ManifestInputs {
  episodeIso: string; // YYYY-MM-DD
  sourceIso: string; // YYYY-MM-DD
  baseTitle: string; // "The Morning Cup"
  publisher: string; // "The Penny Tribune"
  copyrightHolder: string; // "The Penny Tribune"
  genre: string; // "Podcast" / "News"
  wordCount: number;
  estimatedRuntimeMinutes: number;
  validation: ValidationResult;
  chunks: ChunkPiece[];
  chapters: ChapterEntry[];
  sourceLimited: boolean;
}

export function buildManifest(inputs: ManifestInputs): Manifest {
  const chunks: ManifestChunk[] = inputs.chunks.map((c) => ({
    order: c.order,
    filename: c.filename,
    r2_key: c.r2_key,
    public_url: c.public_url,
    character_count: c.character_count,
    starts_section_indices: c.starts_section_indices,
  }));

  const year = Number(inputs.episodeIso.slice(0, 4));

  return {
    episode_date: inputs.episodeIso,
    source_date: inputs.sourceIso,
    title: `${inputs.baseTitle} - ${inputs.episodeIso}`,
    show_name: inputs.baseTitle,
    publisher: inputs.publisher,
    copyright: `Copyright ${year} - ${inputs.copyrightHolder}`,
    year,
    genre: inputs.genre,
    word_count: inputs.wordCount,
    estimated_runtime_minutes: inputs.estimatedRuntimeMinutes,
    chunk_count: chunks.length,
    chunks,
    chapters: inputs.chapters,
    generated_at: new Date().toISOString(),
    validation: {
      ok: inputs.validation.ok,
      errors: inputs.validation.errors,
      warnings: inputs.validation.warnings,
      word_count: inputs.validation.word_count,
      estimated_runtime_minutes: inputs.validation.estimated_runtime_minutes,
      spacer_count: inputs.validation.spacer_count,
    },
    source_limited: inputs.sourceLimited,
  };
}

// Generate ffmpeg concat-demuxer compatible list. Filenames are escaped per
// ffmpeg rules: single-quotes wrap, internal single quotes become '\''.
export function buildFilesTxt(chunks: ChunkPiece[]): string {
  const lines = chunks.map((c) => `file '${escapeFfmpeg(c.filename)}'`);
  return lines.join("\n") + "\n";
}

function escapeFfmpeg(name: string): string {
  return name.replace(/'/g, "'\\''");
}
