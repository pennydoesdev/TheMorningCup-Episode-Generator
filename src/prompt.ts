// src/prompt.ts
//
// Builds the user prompt for the active show. The show's master prompt body
// lives in shows/<show-key>/prompt.ts. This module just appends per-run
// context (date, host, source digest) on top.

export interface PromptInputs {
  masterPrompt: string;        // the show's master prompt (from registry)
  showTitle: string;           // human-readable show name
  hostName: string;            // host name spoken in the script
  publisher: string;           // publisher name spoken in the script
  episodeDateSpoken: string;   // e.g. "May 1st, 2026"
  sourceDateSpoken: string;    // e.g. "April 30th, 2026"
  sourceDigestText: string;
  sourceLimited: boolean;
}

export function buildUserPrompt(inputs: PromptInputs): string {
  const supplementalDigest =
    inputs.sourceDigestText && inputs.sourceDigestText.length > 100
      ? `\nSUPPLEMENTAL CONTEXT (starting hints only — verify and expand with web_search before relying on any item):\n${inputs.sourceDigestText}\n`
      : "";

  return `${inputs.masterPrompt}

SHOW: ${inputs.showTitle}
HOST: ${inputs.hostName}
PUBLISHER: ${inputs.publisher}
CURRENT DATE (episode_date): ${inputs.episodeDateSpoken}
SOURCE DATE (previous day to summarize): ${inputs.sourceDateSpoken}

RESEARCH INSTRUCTIONS:
You have a web_search tool available. You MUST use it to research the actual news from ${inputs.sourceDateSpoken}. Run multiple targeted searches across the topic flow declared in the master prompt above. Pull facts from credible outlets and cite real source URLs in source_notes. If web_search returns nothing meaningful for a category, say so briefly in the script and move on — do NOT invent or fabricate facts under any circumstance.

Do NOT preface the script with a disclaimer about source availability or describe the script as a draft. Open with the show's required opening sentence (substituting CURRENT DATE / HOST / SHOW / PUBLISHER above) and proceed directly into the show.
${supplementalDigest}
Return STRICT JSON ONLY. No markdown. No commentary.`;
}
