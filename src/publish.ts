// Publishing pipeline: after a successful run, generate a 400-500 word
// post body, upload artifacts to Google Drive, and create a WordPress
// draft post. All steps are best-effort — failures are logged but do not
// fail the worker run, since the chunks already landed in R2.

import type { Env, EpisodeJson, Manifest } from "./types";
import type { Config } from "./config";
import { logger } from "./logger";

interface ServiceAccountKey {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

// ---------------------------------------------------------------------------
// 1. OpenAI body generation
// ---------------------------------------------------------------------------

export async function generatePostBody(
  env: Env,
  config: Config,
  episode: EpisodeJson,
  manifest: Manifest,
): Promise<string> {
  const systemInstruction =
    "You write podcast episode descriptions for The Morning Cup, a leftist, working-class-centered morning news podcast hosted by Penelope Rose. " +
    "Voice: sharp, explanatory, humane, morally clear. Modern Vice/Vox register. Names power, ties stories to working-class impact. " +
    "Output exactly one block of plain prose, 400-500 words, ready to paste into a WordPress post body. " +
    "No headings. No markdown. No bullet lists. Just paragraphs.";

  const sections = (episode.social_copy?.section_posts ?? [])
    .map((s) => `${s.section}: ${s.post}`)
    .join("\n");

  const userInput = `Episode: ${manifest.title}
Date: ${manifest.episode_date}
Source date: ${manifest.source_date}
Word count: ${manifest.word_count}
Estimated runtime: ${manifest.estimated_runtime_minutes} min

Main social post: ${episode.social_copy?.main_post ?? "(none)"}

Per-section social posts:
${sections}

Riddle question: ${episode.riddle_question}

Source notes (top 8):
${(episode.source_notes ?? [])
  .slice(0, 8)
  .map((n) => `- [${n.category}] ${n.title} — ${n.source} — ${n.url}`)
  .join("\n")}

First 1500 characters of the spoken script (for editorial flavor):
${episode.elevenlabs_script.slice(0, 1500)}

Write a 400-500 word episode description for the WordPress post body. Hook in the first sentence. Cover the top 3-5 stories with named context. Hold the show's leftist editorial voice. Mention the riddle. End with a clear "press play" line that names the host (Penelope Rose) and The Penny Tribune.`;

  const url = "https://api.openai.com/v1/responses";
  const body: Record<string, unknown> = {
    model: config.openaiModel,
    input: [
      { role: "system", content: [{ type: "input_text", text: systemInstruction }] },
      { role: "user", content: [{ type: "input_text", text: userInput }] },
    ],
    max_output_tokens: 1500,
    stream: false,
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`OpenAI body generation failed: ${res.status} ${txt.slice(0, 300)}`);
  }
  const payload = (await res.json()) as {
    output_text?: string;
    output?: Array<{ content?: Array<{ text?: string }> }>;
  };
  if (payload.output_text) return payload.output_text.trim();
  const parts: string[] = [];
  for (const item of payload.output ?? []) {
    for (const c of item.content ?? []) {
      if (typeof c.text === "string") parts.push(c.text);
    }
  }
  return parts.join("").trim();
}

// ---------------------------------------------------------------------------
// 2. Google Drive — service-account auth + upload
// ---------------------------------------------------------------------------

function parseServiceAccountKey(raw: string): ServiceAccountKey {
  const key = JSON.parse(raw) as ServiceAccountKey;
  if (!key.client_email || !key.private_key) {
    throw new Error("Service account JSON missing client_email or private_key");
  }
  return key;
}

function base64UrlEncode(input: ArrayBuffer | Uint8Array | string): string {
  let bytes: Uint8Array;
  if (typeof input === "string") {
    bytes = new TextEncoder().encode(input);
  } else if (input instanceof Uint8Array) {
    bytes = input;
  } else {
    bytes = new Uint8Array(input);
  }
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function importServiceAccountKey(pem: string): Promise<CryptoKey> {
  const cleaned = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const der = Uint8Array.from(atob(cleaned), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey(
    "pkcs8",
    der,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

async function getDriveAccessToken(rawKey: string): Promise<string> {
  const sa = parseServiceAccountKey(rawKey);
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/drive",
    aud: sa.token_uri || "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };
  const headerB64 = base64UrlEncode(JSON.stringify(header));
  const claimsB64 = base64UrlEncode(JSON.stringify(claims));
  const unsigned = `${headerB64}.${claimsB64}`;
  const cryptoKey = await importServiceAccountKey(sa.private_key);
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(unsigned),
  );
  const jwt = `${unsigned}.${base64UrlEncode(sig)}`;

  const tokenRes = await fetch(claims.aud, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }).toString(),
  });
  if (!tokenRes.ok) {
    const t = await tokenRes.text().catch(() => "");
    throw new Error(`Drive token exchange failed: ${tokenRes.status} ${t.slice(0, 300)}`);
  }
  const data = (await tokenRes.json()) as { access_token?: string };
  if (!data.access_token) throw new Error("Drive token response missing access_token");
  return data.access_token;
}

async function driveFindOrCreateFolder(
  accessToken: string,
  name: string,
  parentId: string,
): Promise<string> {
  // Look for an existing folder with this name under parentId.
  const q = encodeURIComponent(
    `'${parentId}' in parents and name = '${name.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
  );
  const listRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&supportsAllDrives=true&includeItemsFromAllDrives=true`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (listRes.ok) {
    const list = (await listRes.json()) as { files?: Array<{ id: string }> };
    if (list.files && list.files.length > 0) return list.files[0].id;
  }

  const createRes = await fetch(
    "https://www.googleapis.com/drive/v3/files?supportsAllDrives=true",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name,
        mimeType: "application/vnd.google-apps.folder",
        parents: [parentId],
      }),
    },
  );
  if (!createRes.ok) {
    const t = await createRes.text().catch(() => "");
    throw new Error(`Drive folder create failed: ${createRes.status} ${t.slice(0, 300)}`);
  }
  const created = (await createRes.json()) as { id: string };
  return created.id;
}

async function driveUploadFile(
  accessToken: string,
  folderId: string,
  filename: string,
  mimeType: string,
  body: ArrayBuffer | string,
): Promise<void> {
  const boundary = `morningcup_${Math.random().toString(36).slice(2)}`;
  const metadata = JSON.stringify({ name: filename, parents: [folderId] });
  const enc = new TextEncoder();
  const head = enc.encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
  );
  const tail = enc.encode(`\r\n--${boundary}--`);
  const bodyBytes =
    typeof body === "string" ? enc.encode(body) : new Uint8Array(body);

  const merged = new Uint8Array(head.length + bodyBytes.length + tail.length);
  merged.set(head, 0);
  merged.set(bodyBytes, head.length);
  merged.set(tail, head.length + bodyBytes.length);

  const res = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body: merged,
    },
  );
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Drive upload failed for ${filename}: ${res.status} ${t.slice(0, 300)}`);
  }
}

export interface DriveArtifact {
  name: string;
  mimeType: string;
  body: ArrayBuffer | string;
}

export async function uploadEpisodeToDrive(
  env: Env,
  config: Config,
  episodeIso: string,
  rootFiles: DriveArtifact[],
  chunkFiles: DriveArtifact[],
): Promise<string> {
  if (!env.GOOGLE_SERVICE_ACCOUNT_KEY) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY secret not set");
  }
  if (!config.googleDriveFolderId) {
    throw new Error("GOOGLE_DRIVE_FOLDER_ID var not set");
  }

  const token = await getDriveAccessToken(env.GOOGLE_SERVICE_ACCOUNT_KEY);
  const dateFolder = await driveFindOrCreateFolder(
    token,
    episodeIso,
    config.googleDriveFolderId,
  );

  for (const f of rootFiles) {
    await driveUploadFile(token, dateFolder, f.name, f.mimeType, f.body);
  }

  if (chunkFiles.length > 0) {
    const chunksFolder = await driveFindOrCreateFolder(token, "chunks", dateFolder);
    for (const f of chunkFiles) {
      await driveUploadFile(token, chunksFolder, f.name, f.mimeType, f.body);
    }
  }

  return dateFolder;
}

// ---------------------------------------------------------------------------
// 3. WordPress draft creation
// ---------------------------------------------------------------------------

interface WPCreateResult {
  id: number;
  link: string;
}

async function wpResolveTaxonomyTermId(
  config: Config,
  basicAuth: string,
  termName: string,
): Promise<number | null> {
  if (!config.wpPodcastShowTaxonomy) return null;
  const base = `${config.wpUrl.replace(/\/+$/, "")}/wp-json/wp/v2/${config.wpPodcastShowTaxonomy}`;
  const res = await fetch(`${base}?search=${encodeURIComponent(termName)}&per_page=10`, {
    headers: { Authorization: basicAuth },
  });
  if (!res.ok) {
    logger.warn("wp taxonomy lookup failed", { status: res.status });
    return null;
  }
  const terms = (await res.json()) as Array<{ id: number; name: string; slug: string }>;
  const exact = terms.find(
    (t) =>
      t.name.toLowerCase() === termName.toLowerCase() ||
      t.slug === termName.toLowerCase().replace(/\s+/g, "-"),
  );
  return exact?.id ?? terms[0]?.id ?? null;
}

export async function createWordPressDraft(
  env: Env,
  config: Config,
  episodeIso: string,
  episode: EpisodeJson,
  manifest: Manifest,
  postBody: string,
): Promise<WPCreateResult> {
  if (!config.wpUrl || !env.WP_USERNAME || !env.WP_APP_PASSWORD) {
    throw new Error("WordPress credentials missing (WP_URL / WP_USERNAME / WP_APP_PASSWORD)");
  }

  const basicAuth =
    "Basic " + btoa(`${env.WP_USERNAME}:${env.WP_APP_PASSWORD}`);

  // Title format: "The Morning Cup — Friday, May 1st, 2026"
  const dateObj = new Date(`${episodeIso}T12:00:00Z`);
  const weekday = dateObj.toLocaleDateString("en-US", {
    weekday: "long",
    timeZone: "America/New_York",
  });
  const title = `${manifest.show_name} — ${weekday}, ${spokenDateFromIso(episodeIso)}`;

  const payload: Record<string, unknown> = {
    title,
    status: "draft",
    content: postBody,
    excerpt: episode.social_copy?.main_post ?? "",
  };

  // Try to resolve and attach the "Podcast Show" taxonomy term.
  if (config.wpPodcastShowTaxonomy && config.wpPodcastShowTerm) {
    const termId = await wpResolveTaxonomyTermId(
      config,
      basicAuth,
      config.wpPodcastShowTerm,
    );
    if (termId !== null) {
      payload[config.wpPodcastShowTaxonomy] = [termId];
    }
  }

  const endpoint = `${config.wpUrl.replace(/\/+$/, "")}/wp-json/wp/v2/${config.wpCptSlug}`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: basicAuth,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`WP draft create failed: ${res.status} ${t.slice(0, 400)}`);
  }
  const created = (await res.json()) as { id: number; link: string };
  return { id: created.id, link: created.link };
}

function spokenDateFromIso(yyyymmdd: string): string {
  const months = [
    "January","February","March","April","May","June","July",
    "August","September","October","November","December",
  ];
  const [y, m, d] = yyyymmdd.split("-").map(Number);
  const lastTwo = d % 100;
  let suffix = "th";
  if (lastTwo < 11 || lastTwo > 13) {
    switch (d % 10) {
      case 1: suffix = "st"; break;
      case 2: suffix = "nd"; break;
      case 3: suffix = "rd"; break;
    }
  }
  return `${months[m - 1]} ${d}${suffix}, ${y}`;
}
