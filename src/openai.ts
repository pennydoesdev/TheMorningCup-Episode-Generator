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
import { MASTER_PROMPT } from "./prompt";
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
  // Override model for this specific call (e.g. cheaper model for repair passes)
  modelOverride?: string;
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

  const model = opts.modelOverride ?? config.openaiModel;
  const body: Record<string, unknown> = {
    model,
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

  if (!isReasoningModel(model)) {
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
          // OpenAI puts the error in different places depending on event type:
          // - "error" events: evt.message or evt.code
          // - "response.failed" events: evt.response.error.message
          const r = (evt as Record<string, unknown>).response as Record<string, unknown> | undefined;
          const rErr = r?.error as Record<string, unknown> | undefined;
          failureMsg =
            (evt.error?.message) ||
            (evt.message) ||
            (rErr?.message as string | undefined) ||
            (rErr?.code as string | undefined) ||
            JSON.stringify(evt).slice(0, 300);
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
  // MASTER_PROMPT goes in the system instruction so OpenAI's automatic prompt
  // caching kicks in after the first daily run — cached tokens cost 75% less.
  // The userPrompt is only the dynamic context (date, host, source digest).
  const { raw } = await callResponses(env, config, {
    systemInstruction:
      MASTER_PROMPT +
      "\n\nReturn strict JSON matching the provided schema. No markdown. No commentary outside JSON.",
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

  const repairRuntimeFloor = (config.minScriptWords / config.wordsPerMinute).toFixed(1);
  const repairRuntimeCeil  = (config.maxScriptWords / config.wordsPerMinute).toFixed(1);
  const { raw } = await callResponses(env, config, {
    systemInstruction:
      `You are repairing a structured JSON podcast script. Fix ONLY the listed validation errors. Preserve all unchanged content verbatim. Return strict JSON only.\n\nLENGTH CONSTRAINTS (do not violate):\n- elevenlabs_script must be ${config.minScriptWords}–${config.maxScriptWords} spoken words.\n- At ${config.wordsPerMinute} wpm that is ${repairRuntimeFloor}–${repairRuntimeCeil} minutes.\n- Sweet spot: ${config.targetScriptWordsMin}–${config.targetScriptWordsMax} words.\n- If fixing a "too short" error, ADD content to underweight sections. Do not delete anything.\n- If fixing a "too long" error, TRIM carefully. Do not add anything.`,
    userInput: repairInput,
    temperature: 0.3,
    maxOutputTokens: 16000,
    modelOverride: "gpt-4.1-mini",
  });
  const json = safeParseEpisodeJson(raw);
  if (!json) {
    throw Object.assign(new Error("Failed to parse repair JSON response"), { raw });
  }
  return { json, raw };
}

// Aggressive length-extension pass. Use this when the script is too short and
// the standard repair pass didn't get it over the floor. Tells the model
// exactly which sections to deepen and forbids deletion of existing content.
export async function extendEpisode(
  env: Env,
  config: Config,
  prior: EpisodeJson,
  validation: { word_count: number; estimated_runtime_minutes: number; errors: string[] },
  minWords: number,
  userPrompt: string,
): Promise<OpenAiResult> {
  const wordsNeeded = Math.max(minWords - validation.word_count, 300);
  const runtimeFloor = (minWords / config.wordsPerMinute).toFixed(1);
  const runtimeCeil  = (config.maxScriptWords / config.wordsPerMinute).toFixed(1);

  const extendInput = `${userPrompt}

LENGTH-EXTEND PASS (mandatory).

Your previous draft is too short: ${validation.word_count} spoken words (~${validation.estimated_runtime_minutes} min). You MUST add at least ${wordsNeeded} words to reach the floor of ${minWords} words (${runtimeFloor} min at ${config.wordsPerMinute} wpm).

HARD CEILING: ${config.maxScriptWords} words / ${runtimeCeil} min. Do NOT exceed it.
SWEET SPOT TARGET: ${config.targetScriptWordsMin}–${config.targetScriptWordsMax} words.

DO NOT delete or shorten anything already in the script. ADD content to these underweight sections:
- U.S. politics + political trends: add 100–200 words (expand with specific policy stakes)
- Business/economy + trade: add 75–150 words (worker impact, prices, supply chain)
- Healthcare + environment/climate: add 75–150 words (patient/community impact)
- International + Iran + Gaza: add 100–200 words (civilian impact, policy stakes)
- Closing summary: add 50–100 words (revisit the day's through-lines)

Note: these are ADD targets per section, not total section sizes. Stop adding once the script reaches ${config.targetScriptWordsMax} words.

Use web_search to verify any new facts. Stay factual, leftist, working-class-centered. No invention.

Return strict JSON only — same schema. Update self_validation word count and runtime.

PREVIOUS VALIDATION ERRORS:
${validation.errors.map((e) => `- ${e}`).join("\n")}

PREVIOUS JSON OUTPUT:
${JSON.stringify(prior)}`;

  const { raw } = await callResponses(env, config, {
    systemInstruction:
      `You are extending a structured JSON podcast script that is too short. Preserve every existing line verbatim — only ADD to underweight sections. Use web_search to verify any new facts. Return strict JSON only.\n\nLENGTH CONSTRAINTS: ${minWords}–${config.maxScriptWords} words (${runtimeFloor}–${runtimeCeil} min at ${config.wordsPerMinute} wpm). Do not exceed the ceiling.`,
    userInput: extendInput,
    temperature: 0.4,
    maxOutputTokens: 16000,
    modelOverride: "gpt-4.1-mini",
  });
  const json = safeParseEpisodeJson(raw);
  if (!json) {
    throw Object.assign(new Error("Failed to parse extend JSON response"), { raw });
  }
  return { json, raw };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
