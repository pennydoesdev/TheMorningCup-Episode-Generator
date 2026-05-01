// OpenAI Responses API client using structured JSON output.

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
    temperature: opts.temperature ?? 0.4,
    max_output_tokens: opts.maxOutputTokens ?? 16000,
    text: {
      format: {
        type: "json_schema",
        name: EPISODE_JSON_SCHEMA.name,
        strict: EPISODE_JSON_SCHEMA.strict,
        schema: EPISODE_JSON_SCHEMA.schema,
      },
    },
  };

  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (res.status === 429 || res.status >= 500) {
        const retryAfter = Number(res.headers.get("retry-after"));
        const wait = Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : 1000 * Math.pow(2, attempt);
        const body = await res.text().catch(() => "");
        lastErr = new Error(`OpenAI ${res.status}: ${body.slice(0, 500)}`);
        logger.warn("openai retry", {
          status: res.status,
          attempt,
          wait,
          body: body.slice(0, 500),
        });
        await sleep(wait);
        continue;
      }

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`OpenAI ${res.status}: ${text.slice(0, 500)}`);
      }

      const payload = (await res.json()) as ResponsesPayload;
      if (payload.error?.message) {
        throw new Error(`OpenAI error: ${payload.error.message}`);
      }

      const raw = extractText(payload);
      if (!raw) throw new Error("OpenAI returned empty output_text");
      return { raw };
    } catch (err) {
      lastErr = err;
      logger.warn("openai call failed", { attempt, err: String(err) });
      await sleep(1000 * Math.pow(2, attempt));
    }
  }
  throw new Error(`OpenAI call failed after 3 attempts: ${String(lastErr)}`);
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
