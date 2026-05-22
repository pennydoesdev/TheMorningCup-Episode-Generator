// Episode topic memory — stores and retrieves recent chapter/story titles from
// KV so the prompt can avoid repeating the same stories across consecutive days.

import type { ChapterEntry, Env, SourceNote } from "./types";
import { logger } from "./logger";
import { previousIsoDate } from "./utils/date";

const TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

interface StoredTopics {
  chapters: string[];
  stories: string[];
}

export async function saveEpisodeTopics(
  env: Env,
  episodeIso: string,
  chapters: ChapterEntry[],
  sourceNotes: SourceNote[],
): Promise<void> {
  if (!env.MORNING_CUP_KV) return;
  const data: StoredTopics = {
    chapters: chapters.map((c) => c.title).filter(Boolean),
    stories: sourceNotes.map((s) => s.title).filter(Boolean),
  };
  try {
    await env.MORNING_CUP_KV.put(
      `topics:${episodeIso}`,
      JSON.stringify(data),
      { expirationTtl: TTL_SECONDS },
    );
  } catch (err) {
    logger.warn("failed to save episode topics", { err: String(err) });
  }
}

export async function fetchRecentTopics(
  env: Env,
  episodeIso: string,
  days: number = 7,
): Promise<{ chapters: string[]; stories: string[] }> {
  if (!env.MORNING_CUP_KV) return { chapters: [], stories: [] };
  const allChapters = new Set<string>();
  const allStories = new Set<string>();
  let date = episodeIso;
  for (let i = 0; i < days; i++) {
    date = previousIsoDate(date);
    try {
      const raw = await env.MORNING_CUP_KV.get(`topics:${date}`);
      if (raw) {
        const parsed = JSON.parse(raw) as StoredTopics;
        (parsed.chapters ?? []).forEach((c) => allChapters.add(c));
        (parsed.stories ?? []).forEach((s) => allStories.add(s));
      }
    } catch {
      // KV miss or parse error — skip silently
    }
  }
  return { chapters: [...allChapters], stories: [...allStories] };
}
