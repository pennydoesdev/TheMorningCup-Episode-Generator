// ElevenLabs TTS client — POSTs each chunk and returns ArrayBuffer audio.

import type { Env } from "./types";
import type { Config } from "./config";
import { logger } from "./logger";

export interface TtsRequest {
  text: string;
}

export interface TtsResult {
  audio: ArrayBuffer;
  contentType: string;
}

export async function synthesizeChunk(
  env: Env,
  config: Config,
  req: TtsRequest,
): Promise<TtsResult> {
  const voiceId = env.ELEVENLABS_VOICE_ID;
  if (!voiceId) throw new Error("ELEVENLABS_VOICE_ID is not set");

  const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=${encodeURIComponent(config.elevenLabsOutputFormat)}`;

  const body = {
    text: req.text,
    model_id: config.elevenLabsModelId,
    voice_settings: {
      stability: config.voice.stability,
      similarity_boost: config.voice.similarityBoost,
      style: config.voice.style,
      use_speaker_boost: config.voice.useSpeakerBoost,
    },
  };

  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "xi-api-key": env.ELEVENLABS_API_KEY,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify(body),
      });

      if (res.status === 429) {
        const retryAfter = Number(res.headers.get("retry-after"));
        const wait = Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : 2000 * Math.pow(2, attempt);
        logger.warn("elevenlabs 429", { wait, attempt });
        await sleep(wait);
        continue;
      }

      if (res.status >= 500) {
        const wait = 2000 * Math.pow(2, attempt);
        logger.warn("elevenlabs 5xx", { status: res.status, wait, attempt });
        await sleep(wait);
        continue;
      }

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`ElevenLabs ${res.status}: ${text.slice(0, 500)}`);
      }

      const audio = await res.arrayBuffer();
      const contentType = res.headers.get("content-type") || "audio/mpeg";
      return { audio, contentType };
    } catch (err) {
      lastErr = err;
      logger.warn("elevenlabs error", { attempt, err: String(err) });
      await sleep(1500 * Math.pow(2, attempt));
    }
  }
  throw new Error(`ElevenLabs failed after 3 attempts: ${String(lastErr)}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
