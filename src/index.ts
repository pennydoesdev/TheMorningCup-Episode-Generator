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
import { buildFilesTxt, buildManifest } from "./manifest";
import {
  isCompleted,
  readRunRecord,
  updateRunStage,
} from "./locks";
import {
  sendCompletionEmail,
  sendFailureEmail,
} from "./email";
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

      // Run in the background — return immediately so the HTTP request can finish.
      ctx.waitUntil(
        runEpisode(env, config, { episodeIso: date, force, trigger: "manual" }).catch(
          (err) => logger.error("manual run failed", { err: String(err), date }),
        ),
      );
      return json({ accepted: true, date, force });
    }

    return new Response("Not found", { status: 404 });
  },

  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
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

    ctx.waitUntil(
      runEpisode(env, config, { episodeIso, force: false, trigger: "cron" }).catch((err) =>
        logger.error("cron run failed", { err: String(err), episodeIso }),
      ),
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

    // 2. Build prompt + call OpenAI
    const userPrompt = buildUserPrompt({
      episodeDateSpoken: spokenDate(episodeIso),
      sourceDateSpoken: spokenDate(sourceIso),
      sourceDigestText: digestText,
      sourceLimited: !digest.available,
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
      const rejectedKey = `morning-cup/rejected/${episodeIso}-${Date.now()}.json`;
      await putJson(env, rejectedKey, {
        episode_iso: episodeIso,
        validation,
        episode,
        raw,
      });
      const rejectedUrl = getPublicUrl(config, rejectedKey);

      await updateRunStage(env, episodeIso, {
        status: "failed",
        error: `Validation failed: ${validation.errors.join("; ")}`,
      });

      try {
        await sendFailureEmail(env, config, {
          episodeIso,
          stage: "validating",
          error: "Script validation failed (incl. repair pass).",
          validationErrors: validation.errors,
          rejectedKey,
          rejectedUrl,
        });
      } catch (err) {
        logger.error("failure email failed", { err: String(err) });
      }
      return;
    }

    // 4. Write TXT, HTML, JSON
    const baseDir = `morning-cup/${episodeIso}/`;
    const txtKey = `${baseDir}${baseTitle} - ${episodeIso}.txt`;
    const htmlKey = `${baseDir}${baseTitle} - ${episodeIso}.html`;
    const jsonKey = `${baseDir}${baseTitle} - ${episodeIso}.json`;
    const manifestKey = `${baseDir}${baseTitle} - ${episodeIso} - manifest.json`;
    const filesTxtKey = `${baseDir}${baseTitle} - ${episodeIso} - files.txt`;

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

    const completedChunks: ChunkPiece[] = [];
    for (const chunk of chunks) {
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
        completedChunks.push({ ...chunk, public_url: publicUrl });
      } catch (err) {
        logger.error("chunk synth failed", { err: String(err), order: chunk.order });
        // Save partial progress and email failure alert, then abort.
        await updateRunStage(env, episodeIso, {
          status: "failed",
          error: `TTS failed at chunk ${chunk.order}: ${String(err)}`,
          chunk_count: completedChunks.length,
        });
        try {
          await sendFailureEmail(env, config, {
            episodeIso,
            stage: "tts",
            error: `TTS failed at chunk ${chunk.order}: ${String(err)}`,
          });
        } catch (e) {
          logger.error("failure email failed", { err: String(e) });
        }
        return;
      }
    }

    // 6. Manifest + files.txt
    const manifest = buildManifest({
      episodeIso,
      sourceIso,
      baseTitle,
      wordCount: validation.word_count,
      estimatedRuntimeMinutes: validation.estimated_runtime_minutes,
      validation,
      chunks: completedChunks,
      sourceLimited: !digest.available,
    });

    await putJson(env, manifestKey, manifest);
    await putText(env, filesTxtKey, buildFilesTxt(completedChunks), {
      contentType: "text/plain; charset=utf-8",
    });

    // 7. Email
    try {
      await sendCompletionEmail(env, config, {
        episodeIso,
        sourceIso,
        wordCount: validation.word_count,
        estimatedRuntimeMinutes: validation.estimated_runtime_minutes,
        validationOk: validation.ok,
        validationWarnings: validation.warnings,
        chunkCount: completedChunks.length,
        sourceLimited: !digest.available,
        links: {
          txt: getPublicUrl(config, txtKey),
          html: getPublicUrl(config, htmlKey),
          json: getPublicUrl(config, jsonKey),
          manifest: getPublicUrl(config, manifestKey),
          filesTxt: getPublicUrl(config, filesTxtKey),
          chunks: completedChunks.map((c) => ({
            order: c.order,
            filename: c.filename,
            url: c.public_url,
            r2_key: c.r2_key,
          })),
        },
      });
    } catch (err) {
      logger.error("completion email failed", { err: String(err) });
    }

    // 8. Mark complete
    await updateRunStage(env, episodeIso, {
      status: "completed",
      completed_at: new Date().toISOString(),
      chunk_count: completedChunks.length,
      manifest_key: manifestKey,
      files_txt_key: filesTxtKey,
      txt_key: txtKey,
      html_key: htmlKey,
      json_key: jsonKey,
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
    try {
      await sendFailureEmail(env, config, {
        episodeIso,
        stage,
        error: String(err),
      });
    } catch (e) {
      logger.error("failure email failed", { err: String(e) });
    }
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
