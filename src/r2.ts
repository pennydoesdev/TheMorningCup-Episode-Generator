// R2 helpers for The Morning Cup.

import type { Env } from "./types";
import type { Config } from "./config";

export interface PutOptions {
  contentType?: string;
  cacheControl?: string;
  metadata?: Record<string, string>;
}

export async function putText(
  env: Env,
  key: string,
  text: string,
  opts: PutOptions = {},
): Promise<void> {
  await env.MORNING_CUP_BUCKET.put(key, text, {
    httpMetadata: {
      contentType: opts.contentType ?? "text/plain; charset=utf-8",
      cacheControl: opts.cacheControl,
    },
    customMetadata: opts.metadata,
  });
}

export async function putJson(
  env: Env,
  key: string,
  value: unknown,
  opts: PutOptions = {},
): Promise<void> {
  await env.MORNING_CUP_BUCKET.put(key, JSON.stringify(value, null, 2), {
    httpMetadata: {
      contentType: opts.contentType ?? "application/json; charset=utf-8",
      cacheControl: opts.cacheControl,
    },
    customMetadata: opts.metadata,
  });
}

export async function putArrayBuffer(
  env: Env,
  key: string,
  buf: ArrayBuffer,
  opts: PutOptions = {},
): Promise<void> {
  await env.MORNING_CUP_BUCKET.put(key, buf, {
    httpMetadata: {
      contentType: opts.contentType ?? "application/octet-stream",
      cacheControl: opts.cacheControl,
    },
    customMetadata: opts.metadata,
  });
}

export async function objectExists(env: Env, key: string): Promise<boolean> {
  const head = await env.MORNING_CUP_BUCKET.head(key);
  return head !== null;
}

export async function listEpisodeObjects(
  env: Env,
  episodeIso: string,
): Promise<R2Object[]> {
  const prefix = `Generators/Podcasts/TheMorningCup/${episodeIso}/`;
  const out: R2Object[] = [];
  let cursor: string | undefined = undefined;
  for (let i = 0; i < 10; i++) {
    const res: R2Objects = await env.MORNING_CUP_BUCKET.list({ prefix, cursor });
    out.push(...res.objects);
    if (!res.truncated) break;
    cursor = res.truncated ? res.cursor : undefined;
    if (!cursor) break;
  }
  return out;
}

export async function getJson<T>(env: Env, key: string): Promise<T | null> {
  const obj = await env.MORNING_CUP_BUCKET.get(key);
  if (!obj) return null;
  const text = await obj.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export function getPublicUrl(config: Config, key: string): string | undefined {
  if (!config.r2PublicBaseUrl) return undefined;
  const base = config.r2PublicBaseUrl.replace(/\/+$/, "");
  // R2 keys may contain spaces — encode each path segment.
  const encoded = key.split("/").map(encodeURIComponent).join("/");
  return `${base}/${encoded}`;
}
