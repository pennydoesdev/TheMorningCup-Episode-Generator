// Run locking and status records. Uses KV if bound, otherwise falls back to R2.

import type { Env, RunRecord, RunStage } from "./types";

const RUN_KEY_PREFIX = "morning-cup-run-";

function kvKey(episodeIso: string): string {
  return `${RUN_KEY_PREFIX}${episodeIso}`;
}

function r2Key(episodeIso: string): string {
  return `Generators/Podcasts/TheMorningCup/${episodeIso}/run.json`;
}

export async function readRunRecord(
  env: Env,
  episodeIso: string,
): Promise<RunRecord | null> {
  if (env.MORNING_CUP_KV) {
    const v = await env.MORNING_CUP_KV.get(kvKey(episodeIso), "json");
    if (v) return v as RunRecord;
  }
  const obj = await env.MORNING_CUP_BUCKET.get(r2Key(episodeIso));
  if (!obj) return null;
  try {
    const text = await obj.text();
    return JSON.parse(text) as RunRecord;
  } catch {
    return null;
  }
}

export async function writeRunRecord(
  env: Env,
  record: RunRecord,
): Promise<void> {
  const text = JSON.stringify(record, null, 2);
  await env.MORNING_CUP_BUCKET.put(r2Key(record.episode_date), text, {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
  });
  if (env.MORNING_CUP_KV) {
    await env.MORNING_CUP_KV.put(kvKey(record.episode_date), text, {
      // Auto-expire after 14 days; the R2 copy is the durable record.
      expirationTtl: 60 * 60 * 24 * 14,
    });
  }
}

export async function updateRunStage(
  env: Env,
  episodeIso: string,
  patch: Partial<RunRecord>,
): Promise<RunRecord> {
  const existing = (await readRunRecord(env, episodeIso)) ?? {
    episode_date: episodeIso,
    source_date: "",
    status: "pending" as RunStage,
    started_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const next: RunRecord = {
    ...existing,
    ...patch,
    updated_at: new Date().toISOString(),
  };
  await writeRunRecord(env, next);
  return next;
}

export function isCompleted(record: RunRecord | null): boolean {
  return record?.status === "completed";
}
