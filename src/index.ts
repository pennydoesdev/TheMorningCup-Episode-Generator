// Cloudflare Worker entrypoint for The Morning Cup generator.
// Exposes a fetch handler (manual routes) and a scheduled handler (cron).

import type {
  ChunkPiece,
  EpisodeJson,
  Env,
  RunRecord,
  ValidationResult,
} from "./types";
import { loadConfig, type Config } from "./config";
import { logger } from "./logger";
import {
  dayOfYear,
  getZonedNow,
  isoDate,
  isValidIsoDate,
  previousIsoDate,
  spokenDate,
} from "./utils/date";
import {
  buildSourceDigest,
  renderDigestForPrompt,
} from "./sourceDigest";
import { buildUserPrompt } from "./prompt";
import { generateEpisode } from "./openai";
import { validateEpisode } from "./validator";
import { maybeRepair } from "./repair";
import { buildChunks } from "./chunker";
import { synthesizeChunk } from "./elevenlabs";
import {
  getPublicUrl,
  putArrayBuffer,
  putJson,
  putText,
} from "./r2";
import { buildEpisodeHtml } from "./html";
import { generateEpisodeCopy, buildMetadataTxt } from "./description";
import { buildFilesTxt, buildManifest } from "./manifest";
import { fetchRecentTopics, saveEpisodeTopics } from "./topics";
import {
  isCompleted,
  readRunRecord,
  updateRunStage,
} from "./locks";
import {
  normalizeWhitespace,
  stripPacingTags,
  stripSpacerMarker,
} from "./utils/text";

const BASE_TITLE = "The Morning Cup";

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const config = loadConfig(env);
    const url = new URL(req.url);

    if (req.method === "GET" && url.pathname === "/health") {
      return json({ ok: true, service: "morning-cup-generator", time: new Date().toISOString() });
    }

    if (req.method === "GET" && url.pathname === "/status") {
      if (!config.statusPublic) {
        const auth = checkAuth(req, env);
        if (!auth.ok) return auth.response;
      }
      const date = url.searchParams.get("date") ?? defaultEpisodeIso(config);
      if (!isValidIsoDate(date)) return json({ error: "invalid date" }, 400);
      const record = await readRunRecord(env, date);
      return json({ date, record });
    }

    if (req.method === "POST" && url.pathname === "/run") {
      const auth = checkAuth(req, env);
      if (!auth.ok) return auth.response;

      const date = url.searchParams.get("date") ?? defaultEpisodeIso(config);
      if (!isValidIsoDate(date)) return json({ error: "invalid date" }, 400);
      const force = url.searchParams.get("force") === "true";

      // Run the full episode pipeline inline so the process cannot be killed
      // mid-flight by Cloudflare's waitUntil CPU budget. The pipeline takes
      // 5-10 minutes; the curl caller fires this in the background and polls
      // /status, so the long-running HTTP connection is never a UX problem.
      try {
        await runEpisode(env, config, {
          episodeIso: date,
          force,
          trigger: "manual",
        });
        const record = await readRunRecord(env, date);
        return json({ accepted: true, date, force, record });
      } catch (err) {
        logger.error("manual run failed", { err: String(err), date });
        return json({ accepted: true, date, force, error: String(err) }, 500);
      }
    }

    return new Response("Not found", { status: 404 });
  },

  async scheduled(_event: ScheduledEvent, env: Env, _ctx: ExecutionContext): Promise<void> {
    const config = loadConfig(env);
    const zoned = getZonedNow(config.workerTimezone);
    const episodeIso = isoDate(zoned);

    // Only run when local time is 5 AM (5 <= hour < 6) in the configured tz.
    if (zoned.hour !== 5) {
      logger.info("cron skip — local hour is not 5", {
        hour: zoned.hour,
        episodeIso,
      });
      return;
    }

    const existing = await readRunRecord(env, episodeIso);
    if (isCompleted(existing)) {
      logger.info("cron skip — already completed", { episodeIso });
      return;
    }
    if (existing && existing.status !== "failed") {
      // Lock present and not failed/completed: another run in progress.
      logger.info("cron skip — run in progress", { episodeIso, status: existing.status });
      return;
    }

    // Await directly. Scheduled handlers block on the returned promise — that
    // budget is what we need for a 60-120s OpenAI call plus TTS chunking.
    await runEpisode(env, config, {
      episodeIso,
      force: false,
      trigger: "cron",
    }).catch((err) =>
      logger.error("cron run failed", { err: String(err), episodeIso }),
    );
  },
};

interface RunInputs {
  episodeIso: string;
  force: boolean;
  trigger: "cron" | "manual";
}

async function runEpisode(env: Env, config: Config, inputs: RunInputs): Promise<void> {
  const { episodeIso, force } = inputs;
  const sourceIso = previousIsoDate(episodeIso);
  const baseTitle = BASE_TITLE;

  logger.info("run start", { episodeIso, sourceIso, force, trigger: inputs.trigger });

  const existing = await readRunRecord(env, episodeIso);
  if (isCompleted(existing) && !force) {
    logger.info("skip — already completed", { episodeIso });
    return;
  }

  await updateRunStage(env, episodeIso, {
    episode_date: episodeIso,
    source_date: sourceIso,
    status: "pending",
    started_at: existing?.started_at ?? new Date().toISOString(),
    error: undefined,
  });

  let stage: RunRecord["status"] = "pending";

  try {
    // 1. Source digest
    stage = "generating";
    await updateRunStage(env, episodeIso, { status: stage });
    const digest = await buildSourceDigest(env, sourceIso, config.enableSourceDigest);
    const digestText = renderDigestForPrompt(digest);

    // 2. Build prompt + call OpenAI (inject recent topics for dedup)
    const recentTopics = await fetchRecentTopics(env, episodeIso);
    const userPrompt = buildUserPrompt({
      episodeDateSpoken: spokenDate(episodeIso),
      sourceDateSpoken: spokenDate(sourceIso),
      sourceDigestText: digestText,
      sourceLimited: !digest.available,
      hostName: config.hostName,
      recentTopics,
    });

    const generated = await generateEpisode(env, config, userPrompt);
    let episode: EpisodeJson = generated.json;
    let raw: string = generated.raw;

    // 3. Validate
    stage = "validating";
    await updateRunStage(env, episodeIso, { status: stage });
    let validation: ValidationResult = validateEpisode(episode, config);

    if (!validation.ok && config.enableRepairPass) {
      logger.warn("validation failed — attempting repair", {
        episodeIso,
        errors: validation.errors,
      });
      try {
        const repaired = await maybeRepair(env, config, episode, validation, userPrompt);
        if (repaired.attempted) {
          episode = repaired.episode;
          raw = repaired.raw || raw;
          validation = repaired.validation;
        }
      } catch (err) {
        logger.error("repair pass failed", { err: String(err) });
      }
    }

    if (!validation.ok) {
      // Save rejected raw and email failure alert.
      const rejectedKey = `Generators/Podcasts/TheMorningCup/rejected/${episodeIso}-${Date.now()}.json`;
      await putJson(env, rejectedKey, {
        episode_iso: episodeIso,
        validation,
        episode,
        raw,
      });

      await updateRunStage(env, episodeIso, {
        status: "failed",
        error: `Validation failed: ${validation.errors.join("; ")}`,
      });
      return;
    }

    // 4. Write TXT, HTML, JSON
    const baseDir = `Generators/Podcasts/TheMorningCup/${episodeIso}/`;
    const txtKey = `${baseDir}${baseTitle} - ${episodeIso}.txt`;
    const htmlKey = `${baseDir}${baseTitle} - ${episodeIso}.html`;
    const jsonKey = `${baseDir}${baseTitle} - ${episodeIso}.json`;
    const manifestKey = `${baseDir}${baseTitle} - ${episodeIso} - manifest.json`;
    const filesTxtKey = `${baseDir}${baseTitle} - ${episodeIso} - files.txt`;
    const metadataKey = `${baseDir}${baseTitle} - ${episodeIso} - Metadata.txt`;

    const cleanForTxt = normalizeWhitespace(
      stripSpacerMarker(stripPacingTags(episode.elevenlabs_script)),
    );
    await putText(env, txtKey, cleanForTxt);

    const html = buildEpisodeHtml({
      episode,
      episodeIso,
      estimatedRuntimeMinutes: validation.estimated_runtime_minutes,
      wordCount: validation.word_count,
    });
    await putText(env, htmlKey, html, { contentType: "text/html; charset=utf-8" });

    await putJson(env, jsonKey, episode);

    // Generate episode titles (3 options) + description, write the metadata file.
    const copy = await generateEpisodeCopy(env, config, episode);
    const primaryTitle = copy.titles[0] || "";
    const metadataTxt = buildMetadataTxt({
      episodeIso,
      spokenDate: spokenDate(episodeIso),
      episodeTitles: copy.titles,
      episodeNumber: dayOfYear(episodeIso),
      season: Number(episodeIso.slice(0, 4)),
      hostName: config.hostName,
      publisher: config.publisher,
      copyrightHolder: config.copyrightHolder,
      genre: config.podcastGenre,
      estimatedRuntimeMinutes: validation.estimated_runtime_minutes,
      wordCount: validation.word_count,
      description: copy.description,
      seoTitle: copy.seoTitle,
      seoDescription: copy.seoDescription,
      tags: copy.tags,
      episode,
    });
    await putText(env, metadataKey, metadataTxt);

    // 5. Chunk + TTS
    stage = "tts";
    await updateRunStage(env, episodeIso, {
      status: stage,
      word_count: validation.word_count,
      estimated_runtime_minutes: validation.estimated_runtime_minutes,
    });

    const chunks = buildChunks({
      script: episode.elevenlabs_script,
      episodeIso,
      baseTitle,
      config,
    });

    if (chunks.length === 0) {
      throw new Error("Chunker produced 0 chunks");
    }

    // Synthesize chunks in parallel with bounded concurrency. ElevenLabs
    // tolerates a handful of concurrent requests fine, and the wall-time
    // saving is significant (~4x for ~12 chunks vs sequential).
    const TTS_CONCURRENCY = 4;
    const slots: (ChunkPiece | undefined)[] = new Array(chunks.length);
    type ChunkFailure = { order: number; err: unknown };
    // Wrapped in an object so TS doesn't narrow the variable to null after
    // declaration — closures mutate it and we need the union type to survive.
    const failureState: { value: ChunkFailure | null } = { value: null };
    let nextChunkIdx = 0;

    const workers = Array.from(
      { length: Math.min(TTS_CONCURRENCY, chunks.length) },
      async () => {
        while (true) {
          const i = nextChunkIdx++;
          if (i >= chunks.length) return;
          if (failureState.value) return;
          const chunk = chunks[i];
          try {
            const tts = await synthesizeChunk(env, config, { text: chunk.text });
            await putArrayBuffer(env, chunk.r2_key, tts.audio, {
              contentType: tts.contentType || "audio/mpeg",
              metadata: {
                episode: episodeIso,
                order: String(chunk.order),
                characters: String(chunk.character_count),
              },
            });
            const publicUrl = getPublicUrl(config, chunk.r2_key);
            slots[i] = { ...chunk, public_url: publicUrl };
          } catch (err) {
            if (!failureState.value) failureState.value = { order: chunk.order, err };
          }
        }
      },
    );
    await Promise.all(workers);

    const failure = failureState.value;
    if (failure) {
      const partialCount = slots.filter((c) => c !== undefined).length;
      const errMsg = `TTS failed at chunk ${failure.order}: ${String(failure.err)}`;
      logger.error("chunk synth failed", {
        err: String(failure.err),
        order: failure.order,
      });
      await updateRunStage(env, episodeIso, {
        status: "failed",
        error: errMsg,
        chunk_count: partialCount,
      });
      return;
    }

    const completedChunks: ChunkPiece[] = slots as ChunkPiece[];

    // 6. Manifest + files.txt
    const manifest = buildManifest({
      episodeIso,
      sourceIso,
      baseTitle,
      episodeTitle: primaryTitle || undefined,
      publisher: config.publisher,
      copyrightHolder: config.copyrightHolder,
      genre: config.podcastGenre,
      wordCount: validation.word_count,
      estimatedRuntimeMinutes: validation.estimated_runtime_minutes,
      validation,
      chunks: completedChunks,
      chapters: episode.chapters ?? [],
      sourceLimited: !digest.available,
    });

    await putJson(env, manifestKey, manifest);
    await putText(env, filesTxtKey, buildFilesTxt(completedChunks), {
      contentType: "text/plain; charset=utf-8",
    });

    // 7. Save topics to KV for dedup on future episodes, then mark complete.
    await saveEpisodeTopics(env, episodeIso, episode.chapters ?? [], episode.source_notes ?? []);

    await updateRunStage(env, episodeIso, {
      status: "completed",
      completed_at: new Date().toISOString(),
      chunk_count: completedChunks.length,
      manifest_key: manifestKey,
      files_txt_key: filesTxtKey,
      txt_key: txtKey,
      html_key: htmlKey,
      json_key: jsonKey,
      metadata_key: metadataKey,
    });

    logger.info("run complete", {
      episodeIso,
      chunkCount: completedChunks.length,
      wordCount: validation.word_count,
    });
  } catch (err) {
    logger.error("run errored", { err: String(err), stage });
    await updateRunStage(env, episodeIso, {
      status: "failed",
      error: String(err),
    });
  }
}

function checkAuth(req: Request, env: Env): { ok: true } | { ok: false; response: Response } {
  if (!env.RUN_SECRET) {
    return { ok: false, response: json({ error: "RUN_SECRET not configured" }, 500) };
  }
  const header = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${env.RUN_SECRET}`;
  if (header !== expected) {
    return { ok: false, response: json({ error: "unauthorized" }, 401) };
  }
  return { ok: true };
}

function defaultEpisodeIso(config: Config): string {
  return isoDate(getZonedNow(config.workerTimezone));
}

function json(body: unknown, status: number = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
