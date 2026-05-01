// OpenAI Responses API client using structured JSON output.
//
// Long structured generations (3300-3700 word scripts) take ~60-120s. A
// non-streaming fetch buffers the entire response server-side before any
// bytes are sent, so the Cloudflare Workers runtime can drop the subrequest
// for inactivity, leaving the run stuck mid-flight. Streaming the SSE
// response keeps bytes flowing continuously and lets us fail fast via
// AbortController if the call genuinely hangs.

import type { Env, EpisodeJson } from "./types";
import type { Config } from "./config";
import { EPISODE_JSON_SCHEMA } from "./schema";
import { logger } from "./logger";

interface ResponsesContentPart {
  type: string;
  text?: string;
}

interface ResponsesOutputItem {
  type: string;
  content?: ResponsesContentPart[];
}

interface ResponsesPayload {
  output_text?: string;
  output?: ResponsesOutputItem[];
  error?: { message?: string };
}

export interface OpenAiResult {
  json: EpisodeJson;
  raw: string;
}

interface CallOptions {
  systemInstruction?: string;
  userInput: string;
  temperature?: number;
  maxOutputTokens?: number;
}

// Per-attempt hard timeout. Generations should never legitimately take this
// long; if they do, abort and let the retry loop run again or fail cleanly so
// the run record can move to "failed" instead of being stranded.
const ATTEMPT_TIMEOUT_MS = 8 * 60 * 1000;

function isReasoningModel(model: string): boolean {
  // gpt-5 family and the o-series are reasoning models that reject the
  // `temperature` parameter on the Responses API.
  return (
    model.startsWith("gpt-5") ||
    model.startsWith("o1") ||
    model.startsWith("o3") ||
    model.startsWith("o4")
  );
}

async function callResponses(
  env: Env,
  config: Config,
  opts: CallOptions,
): Promise<{ raw: string }> {
  const url = "https://api.openai.com/v1/responses";

  const body: Record<string, unknown> = {
    model: config.openaiModel,
    input: [
      ...(opts.systemInstruction
        ? [
            {
              role: "system",
              content: [{ type: "input_text", text: opts.systemInstruction }],
            },
          ]
        : []),
      {
        role: "user",
        content: [{ type: "input_text", text: opts.userInput }],
      },
    ],
    max_output_tokens: opts.maxOutputTokens ?? 16000,
    text: {
      format: {
        type: "json_schema",
        name: EPISODE_JSON_SCHEMA.name,
        strict: EPISODE_JSON_SCHEMA.strict,
        schema: EPISODE_JSON_SCHEMA.schema,
      },
    },
    // Built-in web search lets the model research yesterday's actual news
    // instead of relying on an RSS-derived digest. The model decides when to
    // search based on the prompt instructions.
    tools: [{ type: "web_search" }],
    stream: true,
  };

  if (!isReasoningModel(config.openaiModel)) {
    body.temperature = opts.temperature ?? 0.4;
  }

  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ATTEMPT_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (res.status === 429 || res.status >= 500) {
        const retryAfter = Number(res.headers.get("retry-after"));
        const wait = Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : 1000 * Math.pow(2, attempt);
        const errBody = await res.text().catch(() => "");
        lastErr = new Error(`OpenAI ${res.status}: ${errBody.slice(0, 500)}`);
        logger.warn("openai retry", {
          status: res.status,
          attempt,
          wait,
          body: errBody.slice(0, 500),
        });
        await sleep(wait);
        continue;
      }

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`OpenAI ${res.status}: ${text.slice(0, 500)}`);
      }

      if (!res.body) {
        throw new Error("OpenAI returned empty response body");
      }

      const raw = await readResponsesStream(res.body);
      if (!raw) throw new Error("OpenAI returned empty output_text");
      return { raw };
    } catch (err) {
      lastErr = err;
      logger.warn("openai call failed", { attempt, err: String(err) });
      await sleep(1000 * Math.pow(2, attempt));
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error(`OpenAI call failed after 3 attempts: ${String(lastErr)}`);
}

interface SseEvent {
  type?: string;
  delta?: string;
  text?: string;
  response?: ResponsesPayload;
  error?: { message?: string };
  message?: string;
}

async function readResponsesStream(body: ReadableStream<Uint8Array>): Promise<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let accumulated = "";
  let finalText: string | null = null;
  let failureMsg: string | null = null;

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });

      let idx: number;
      while ((idx = buf.indexOf("\n\n")) !== -1) {
        const block = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        const data = parseSseDataLines(block);
        if (data === null) continue;
        if (data === "[DONE]") continue;
        let evt: SseEvent;
        try {
          evt = JSON.parse(data) as SseEvent;
        } catch {
          continue;
        }
        const t = evt.type;
        if (t === "response.output_text.delta" && typeof evt.delta === "string") {
          accumulated += evt.delta;
        } else if (t === "response.output_text.done" && typeof evt.text === "string") {
          finalText = evt.text;
        } else if (t === "response.completed" && evt.response) {
          const candidate = extractText(evt.response);
          if (candidate) finalText = candidate;
        } else if (
          t === "response.failed" ||
          t === "response.error" ||
          t === "error"
        ) {
          failureMsg = evt.error?.message || evt.message || "stream error";
        }
      }
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // ignore
    }
  }
  if (failureMsg) throw new Error(`OpenAI stream error: ${failureMsg}`);
  return finalText ?? accumulated;
}

function parseSseDataLines(block: string): string | null {
  const lines = block.split("\n");
  const dataLines: string[] = [];
  for (const line of lines) {
    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).replace(/^ /, ""));
    }
  }
  if (dataLines.length === 0) return null;
  return dataLines.join("\n");
}

function extractText(payload: ResponsesPayload): string {
  if (payload.output_text && payload.output_text.length > 0) {
    return payload.output_text;
  }
  const parts: string[] = [];
  for (const item of payload.output ?? []) {
    for (const c of item.content ?? []) {
      if (typeof c.text === "string") parts.push(c.text);
    }
  }
  return parts.join("");
}

export function safeParseEpisodeJson(raw: string): EpisodeJson | null {
  // Strip code-fences if any model wraps the response.
  let trimmed = raw.trim();
  if (trimmed.startsWith("```")) {
    trimmed = trimmed.replace(/^```[a-zA-Z]*\n/, "").replace(/```$/, "").trim();
  }
  try {
    return JSON.parse(trimmed) as EpisodeJson;
  } catch {
    // Heuristic: find the first balanced JSON object.
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1)) as EpisodeJson;
      } catch {
        return null;
      }
    }
    return null;
  }
}

export async function generateEpisode(
  env: Env,
  config: Config,
  userPrompt: string,
): Promise<OpenAiResult> {
  const { raw } = await callResponses(env, config, {
    systemInstruction:
      "You are a senior morning news producer. Return strict JSON matching the provided schema. No markdown. No commentary outside JSON.",
    userInput: userPrompt,
    temperature: 0.4,
    maxOutputTokens: 16000,
  });
  const json = safeParseEpisodeJson(raw);
  if (!json) {
    throw Object.assign(new Error("Failed to parse OpenAI JSON response"), { raw });
  }
  return { json, raw };
}

export async function repairEpisode(
  env: Env,
  config: Config,
  prior: EpisodeJson,
  errors: string[],
  userPrompt: string,
): Promise<OpenAiResult> {
  const repairInput = `${userPrompt}

The previous JSON output failed validation. Preserve all valid content. Fix ONLY the listed validation errors. Return strict JSON only.

VALIDATION ERRORS:
${errors.map((e) => `- ${e}`).join("\n")}

PREVIOUS JSON OUTPUT:
${JSON.stringify(prior)}`;

  const { raw } = await callResponses(env, config, {
    systemInstruction:
      "You are repairing a structured JSON podcast script. Fix only the listed errors. Preserve unchanged content verbatim. Return strict JSON only.",
    userInput: repairInput,
    temperature: 0.3,
    maxOutputTokens: 16000,
  });
  const json = safeParseEpisodeJson(raw);
  if (!json) {
    throw Object.assign(new Error("Failed to parse repair JSON response"), { raw });
  }
  return { json, raw };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
