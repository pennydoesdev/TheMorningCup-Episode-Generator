// Run locking and status records. Uses KV if bound, otherwise falls back to R2.

import type { Env, RunRecord, RunStage } from "./types";

function kvKey(showKey: string, episodeIso: string): string {
  return `${showKey}-run-${episodeIso}`;
}

function r2Key(showKey: string, episodeIso: string): string {
  return `${showKey}/${episodeIso}/run.json`;
}

export async function readRunRecord(
  env: Env,
  episodeIso: string,
): Promise<RunRecord | null> {
  const showKey = env.SHOW_KEY;
  if (env.EPISODE_KV) {
    const v = await env.EPISODE_KV.get(kvKey(showKey, episodeIso), "json");
    if (v) return v as RunRecord;
  }
  const obj = await env.EPISODE_BUCKET.get(r2Key(showKey, episodeIso));
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
  const showKey = env.SHOW_KEY;
  const text = JSON.stringify(record, null, 2);
  await env.EPISODE_BUCKET.put(r2Key(showKey, record.episode_date), text, {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
  });
  if (env.EPISODE_KV) {
    await env.EPISODE_KV.put(kvKey(showKey, record.episode_date), text, {
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
