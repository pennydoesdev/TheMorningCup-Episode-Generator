// Fact-checking pass for The Morning Cup.
//
// Runs AFTER script generation but BEFORE TTS. Verifies factual claims using
// gpt-4o-mini with THREE independent passes. Majority rules (2/3 must agree).
//
// Claims are extracted by scanning for sentences that contain:
//   - A 4-digit year
//   - A percentage
//   - A dollar amount
//   - A named person with a title (heuristic: Title Case word(s) followed by a
//     title keyword such as President, Senator, Secretary, etc.)
//   - Action verbs: announced, said, signed, voted, ruled, reported

import type { Env } from "./types";
import type { Config } from "./config";
import type { EpisodeJson } from "./types";
import { logger } from "./logger";

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export interface FactCheckResult {
  passed: boolean;
  removedClaims: string[];
  passCount: number;    // how many of 3 passes flagged this claim as OK
  sources: string[];
  trustScore: number;   // 0.0–1.0
}

export interface FactCheckReport {
  checkedAt: string;
  modelUsed: string;
  claimsChecked: number;
  claimsPassed: number;
  claimsRemoved: number;
  removedSummaries: string[];
  averageTrustScore: number;
}

// ---------------------------------------------------------------------------
// Claim extraction
// ---------------------------------------------------------------------------

const CLAIM_PATTERNS = [
  /\b\d{4}\b/,                                        // 4-digit year
  /\d+(?:\.\d+)?%/,                                   // percentage
  /\$\d[\d,]*(?:\.\d+)?(?:\s*(?:billion|million|trillion|thousand))?/i, // dollar amount
  /\b(?:President|Senator|Secretary|Governor|Mayor|CEO|Director|Minister|Chancellor|Prime Minister|General|Attorney General|Judge|Justice|Commissioner|Administrator|Representative|Congressman|Congresswoman)\b/, // titled person
  /\b(?:announced|said|signed|voted|ruled|reported)\b/i, // attribution verbs
];

/**
 * Extract verifiable claim sentences from a script.
 * Returns unique sentences that match at least one claim pattern.
 */
function extractClaims(script: string): string[] {
  // Split into sentences on sentence-ending punctuation.
  const raw = script.replace(/\n+/g, " ");
  const sentences = raw.split(/(?<=[.!?])\s+/);

  const seen = new Set<string>();
  const claims: string[] = [];

  for (const sentence of sentences) {
    const s = sentence.trim();
    if (s.length < 20) continue; // too short to be meaningful
    if (seen.has(s)) continue;

    const isVerifiable = CLAIM_PATTERNS.some((pattern) => pattern.test(s));
    if (isVerifiable) {
      seen.add(s);
      claims.push(s);
    }
  }

  return claims;
}

// ---------------------------------------------------------------------------
// OpenAI fact-check call (Chat Completions — gpt-4o-mini)
// ---------------------------------------------------------------------------

type FactVerdict = "pass" | "fail" | "uncertain";

interface FactCheckResponse {
  verdict: FactVerdict;
  source: string;
  note: string;
}

const FACT_CHECK_SYSTEM_PROMPT = `You are a rigorous fact-checker for a daily news podcast. Your job is to verify whether a specific factual claim is accurate and current.

Use your web search capability to look up the claim right now against real sources.

Rules:
- Search and verify against AP, Reuters, NYT, BBC, NPR, Washington Post, Guardian, ProPublica, and official government sources (.gov domains).
- A claim PASSES if you can verify it from at least one of the above sources right now.
- A claim FAILS if your search shows: a wrong date, a person in the wrong current role, an incorrect statistic, or a fabricated event.
- A claim is UNCERTAIN if your search cannot confirm or deny it either way.
- Respond ONLY with valid JSON: {"verdict": "pass"|"fail"|"uncertain", "source": "url or source name found", "note": "brief explanation of what you found"}`;

async function checkClaimOnce(
  env: Env,
  claim: string,
  episodeDate: string,
): Promise<FactCheckResponse> {
  const userMessage = `Search and verify this claim right now: "${claim}". Today's date is ${episodeDate}. Search for this specific claim and report what you find.`;

  // Use the Responses API with web_search — same endpoint as script generation
  // but with gpt-4o-mini for cost efficiency.
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini-search-preview",
      tools: [{ type: "web_search_preview" }],
      input: [
        {
          role: "system",
          content: [{ type: "input_text", text: FACT_CHECK_SYSTEM_PROMPT }],
        },
        {
          role: "user",
          content: [{ type: "input_text", text: userMessage }],
        },
      ],
      max_output_tokens: 512,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    logger.warn("factcheck api error", { status: res.status, body: errText.slice(0, 200) });
    // On API error, treat as uncertain so the claim is kept (safe default).
    return { verdict: "uncertain", source: "api-error", note: `HTTP ${res.status}` };
  }

  // Responses API shape: { output: [ { type: "message", content: [ { type: "output_text", text: "..." } ] } ] }
  const data = (await res.json()) as {
    output?: Array<{
      type?: string;
      content?: Array<{ type?: string; text?: string }>;
    }>;
  };

  // Extract text from the first message output item.
  let content = "{}";
  for (const item of data.output ?? []) {
    if (item.type === "message") {
      for (const c of item.content ?? []) {
        if (c.type === "output_text" && c.text) {
          content = c.text.trim();
          break;
        }
      }
      break;
    }
  }

  // The model may wrap the JSON in markdown — strip it.
  content = content.replace(/^```json\s*/i, "").replace(/\s*```$/, "").trim();
  // Extract the first JSON object if the model added surrounding text.
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (jsonMatch) content = jsonMatch[0];

  try {
    const parsed = JSON.parse(content) as Partial<FactCheckResponse>;
    const verdict: FactVerdict =
      parsed.verdict === "pass" || parsed.verdict === "fail" || parsed.verdict === "uncertain"
        ? parsed.verdict
        : "uncertain";
    return {
      verdict,
      source: parsed.source ?? "unknown",
      note: parsed.note ?? "",
    };
  } catch {
    return { verdict: "uncertain", source: "parse-error", note: "could not parse response" };
  }
}

// ---------------------------------------------------------------------------
// Three-pass majority logic
// ---------------------------------------------------------------------------

function verdictScore(verdict: FactVerdict): number {
  switch (verdict) {
    case "pass":      return 1.0;
    case "uncertain": return 0.5;
    case "fail":      return 0.0;
  }
}

interface ClaimAnalysis {
  claim: string;
  verdicts: FactVerdict[];
  sources: string[];
  trustScore: number;
  shouldRemove: boolean; // true only if 2+ passes say "fail"
}

async function analyzeClaimThreePasses(
  env: Env,
  claim: string,
  episodeDate: string,
): Promise<ClaimAnalysis> {
  // Run three passes sequentially to avoid hammering the API simultaneously.
  const responses: FactCheckResponse[] = [];
  for (let i = 0; i < 3; i++) {
    const resp = await checkClaimOnce(env, claim, episodeDate);
    responses.push(resp);
  }

  const verdicts = responses.map((r) => r.verdict);
  const sources = responses.map((r) => r.source).filter(Boolean);
  const failCount = verdicts.filter((v) => v === "fail").length;
  const passCount = verdicts.filter((v) => v === "pass").length;

  const trustScore =
    responses.reduce((sum, r) => sum + verdictScore(r.verdict), 0) / responses.length;

  // Remove only if 2 or more passes explicitly say "fail".
  const shouldRemove = failCount >= 2;

  logger.info("factcheck claim result", {
    claim: claim.slice(0, 80),
    verdicts,
    passCount,
    failCount,
    shouldRemove,
    trustScore,
  });

  return { claim, verdicts, sources, trustScore, shouldRemove };
}

// ---------------------------------------------------------------------------
// Script cleaning — strip removed sentences
// ---------------------------------------------------------------------------

/**
 * Replace a removed claim with a marker, then strip the marker + surrounding
 * sentence from the final script so TTS never reads it.
 */
function removeSentenceFromScript(script: string, claim: string): string {
  // Mark the claim first (exact string match, safe because claim came from script).
  const escaped = claim.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const marked = script.replace(new RegExp(escaped, "g"), "[CLAIM REMOVED — UNVERIFIED]");

  // Now strip any sentence that contains the marker.
  // Sentences end with . ! ? — we split on them.
  const cleaned = marked
    .split(/(?<=[.!?])\s+/)
    .filter((s) => !s.includes("[CLAIM REMOVED — UNVERIFIED]"))
    .join(" ");

  return cleaned;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function runFactCheck(
  env: Env,
  _config: Config,
  episode: EpisodeJson,
  episodeDate: string,
): Promise<{ episode: EpisodeJson; report: FactCheckReport }> {
  const checkedAt = new Date().toISOString();
  const modelUsed = "gpt-4o-mini-search-preview";

  const script = episode.elevenlabs_script;
  const claims = extractClaims(script);

  logger.info("factcheck start", { episodeDate, claimsFound: claims.length });

  if (claims.length === 0) {
    // Nothing to check — return episode unchanged.
    return {
      episode,
      report: {
        checkedAt,
        modelUsed,
        claimsChecked: 0,
        claimsPassed: 0,
        claimsRemoved: 0,
        removedSummaries: [],
        averageTrustScore: 1.0,
      },
    };
  }

  // Analyze each claim with three passes.
  const analyses: ClaimAnalysis[] = [];
  for (const claim of claims) {
    const analysis = await analyzeClaimThreePasses(env, claim, episodeDate);
    analyses.push(analysis);
  }

  // Build cleaned script by removing failed claims.
  let cleanedScript = script;
  const removedSummaries: string[] = [];

  for (const analysis of analyses) {
    if (analysis.shouldRemove) {
      cleanedScript = removeSentenceFromScript(cleanedScript, analysis.claim);
      removedSummaries.push(analysis.claim.slice(0, 120));
    }
  }

  const claimsPassed = analyses.filter((a) => !a.shouldRemove).length;
  const claimsRemoved = analyses.filter((a) => a.shouldRemove).length;
  const averageTrustScore =
    analyses.reduce((sum, a) => sum + a.trustScore, 0) / analyses.length;

  const checkedEpisode: EpisodeJson = {
    ...episode,
    elevenlabs_script: cleanedScript,
  };

  const report: FactCheckReport = {
    checkedAt,
    modelUsed,
    claimsChecked: claims.length,
    claimsPassed,
    claimsRemoved,
    removedSummaries,
    averageTrustScore,
  };

  logger.info("factcheck complete", {
    episodeDate,
    claimsChecked: claims.length,
    claimsPassed,
    claimsRemoved,
    averageTrustScore,
  });

  return { episode: checkedEpisode, report };
}
