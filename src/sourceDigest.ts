// Source digest builder. Pluggable: RSS feeds (Mode 1) or empty fallback (Mode 2).
// The output is the structured digest the prompt is anchored to.

import type { Env, SourceDigest, SourceItem } from "./types";
import { logger } from "./logger";

export const DIGEST_CATEGORIES = [
  "Positive opening",
  "Events and holidays",
  "Weather today",
  "Weather tomorrow",
  "U.S. politics",
  "Political trends",
  "National crime",
  "Immigration",
  "California governor race",
  "House/Senate primaries",
  "Business/economy",
  "Trade",
  "Technology",
  "Healthcare",
  "Environment/climate",
  "Positive science/ocean/conservation",
  "International",
  "Iran",
  "Gaza",
  "Social/culture trends",
] as const;

export type DigestCategory = (typeof DIGEST_CATEGORIES)[number];

interface FetchedItem {
  title: string;
  source: string;
  url: string;
  published: string;
  summary?: string;
}

const KEYWORDS: Record<DigestCategory, string[]> = {
  "Positive opening": [
    "rescue",
    "kindness",
    "mutual aid",
    "neighbors",
    "community",
    "volunteer",
    "saved",
    "heroic",
  ],
  "Events and holidays": ["holiday", "anniversary", "celebrat", "festival"],
  "Weather today": ["weather", "storm", "forecast", "heat", "cold front"],
  "Weather tomorrow": ["forecast", "tomorrow", "outlook"],
  "U.S. politics": [
    "white house",
    "congress",
    "senate",
    "house",
    "president",
    "biden",
    "trump",
    "harris",
    "speaker",
  ],
  "Political trends": ["polling", "trend", "shift", "movement", "narrative"],
  "National crime": ["crime", "shooting", "police", "arrest", "prosecutor", "homicide"],
  "Immigration": ["immigration", "border", "asylum", "ICE", "migrant", "deportation"],
  "California governor race": ["california", "governor", "gubernatorial", "newsom"],
  "House/Senate primaries": ["primary", "primaries", "house race", "senate race"],
  "Business/economy": ["economy", "inflation", "jobs", "labor", "wages", "fed", "earnings"],
  "Trade": ["trade", "tariff", "import", "export", "wto"],
  "Technology": ["ai", "openai", "tech", "silicon valley", "google", "apple", "meta", "microsoft"],
  "Healthcare": ["health", "medicare", "medicaid", "hospital", "drug", "fda", "cdc"],
  "Environment/climate": ["climate", "emission", "carbon", "wildfire", "drought", "flood"],
  "Positive science/ocean/conservation": [
    "ocean",
    "conservation",
    "species",
    "reef",
    "discovery",
    "research",
    "restoration",
  ],
  "International": ["united nations", "europe", "china", "russia", "ukraine", "africa", "summit"],
  "Iran": ["iran", "tehran", "revolutionary guard"],
  "Gaza": ["gaza", "israel", "hamas", "rafah", "west bank"],
  "Social/culture trends": ["viral", "trend", "tiktok", "threads", "twitter", "x platform", "culture"],
};

function categorize(title: string, summary: string | undefined): DigestCategory[] {
  const text = `${title} ${summary ?? ""}`.toLowerCase();
  const hits: DigestCategory[] = [];
  for (const [cat, keys] of Object.entries(KEYWORDS) as [DigestCategory, string[]][]) {
    if (keys.some((k) => text.includes(k))) hits.push(cat);
  }
  return hits;
}

// Minimal RSS extractor — Workers-safe, no XML parser dependency.
function parseRssItems(xml: string, source: string): FetchedItem[] {
  const items: FetchedItem[] = [];
  const itemRegex = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
  const tag = (block: string, name: string): string => {
    const m = new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}>`, "i").exec(block);
    if (!m) return "";
    return decodeXml(stripCdata(m[1]).trim());
  };
  let m: RegExpExecArray | null;
  let safety = 0;
  while ((m = itemRegex.exec(xml)) !== null && safety < 200) {
    safety++;
    const block = m[1];
    const title = tag(block, "title");
    const link = tag(block, "link");
    const pub = tag(block, "pubDate") || tag(block, "dc:date");
    const desc = tag(block, "description") || tag(block, "content:encoded");
    if (!title) continue;
    items.push({
      title,
      source,
      url: link,
      published: pub,
      summary: desc.replace(/<[^>]+>/g, "").slice(0, 400),
    });
  }
  // Also try Atom <entry> blocks if the feed is Atom.
  if (items.length === 0) {
    const entryRegex = /<entry\b[^>]*>([\s\S]*?)<\/entry>/gi;
    while ((m = entryRegex.exec(xml)) !== null) {
      const block = m[1];
      const title = tag(block, "title");
      const linkMatch = /<link\b[^>]*href="([^"]+)"/i.exec(block);
      const link = linkMatch ? linkMatch[1] : "";
      const pub = tag(block, "updated") || tag(block, "published");
      const desc = tag(block, "summary") || tag(block, "content");
      if (!title) continue;
      items.push({
        title,
        source,
        url: link,
        published: pub,
        summary: desc.replace(/<[^>]+>/g, "").slice(0, 400),
      });
    }
  }
  return items;
}

function stripCdata(s: string): string {
  return s.replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "");
}

function decodeXml(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

function inferSource(feedUrl: string): string {
  try {
    const u = new URL(feedUrl);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return feedUrl;
  }
}

async function fetchRss(feedUrl: string, signal: AbortSignal): Promise<FetchedItem[]> {
  const res = await fetch(feedUrl, {
    headers: { "User-Agent": "MorningCupBot/1.0 (+Fold 42)" },
    signal,
  });
  if (!res.ok) {
    logger.warn("rss fetch failed", { feedUrl, status: res.status });
    return [];
  }
  const xml = await res.text();
  return parseRssItems(xml, inferSource(feedUrl));
}

interface NewsApiArticle {
  title?: string;
  url?: string;
  publishedAt?: string;
  description?: string;
  source?: { name?: string };
}

// --- Real-time weather APIs --------------------------------------------------

interface TomorrowIOValues {
  temperature?: number;
  temperatureApparent?: number;
  windSpeed?: number;
  precipitationProbability?: number;
  weatherCode?: number;
}

interface TomorrowIOResponse {
  data?: { values?: TomorrowIOValues };
}

function tomorrowWeatherDesc(code: number | undefined): string {
  if (code === undefined) return "";
  const MAP: Record<number, string> = {
    1000: "clear", 1100: "mostly clear", 1101: "partly cloudy",
    1102: "mostly cloudy", 1001: "cloudy", 2000: "foggy", 2100: "light fog",
    4000: "drizzle", 4001: "rain", 4200: "light rain", 4201: "heavy rain",
    5000: "snow", 5001: "flurries", 5100: "light snow", 5101: "heavy snow",
    6000: "freezing drizzle", 6001: "freezing rain", 7000: "ice pellets",
    8000: "thunderstorms",
  };
  return MAP[code] ?? "";
}

const WEATHER_METROS: { name: string; loc: string }[] = [
  { name: "New York",    loc: "40.7128,-74.0060"   },
  { name: "Boston",      loc: "42.3601,-71.0589"   },
  { name: "Atlanta",     loc: "33.7490,-84.3880"   },
  { name: "Miami",       loc: "25.7617,-80.1918"   },
  { name: "Chicago",     loc: "41.8781,-87.6298"   },
  { name: "Houston",     loc: "29.7604,-95.3698"   },
  { name: "Los Angeles", loc: "34.0522,-118.2437"  },
  { name: "Phoenix",     loc: "33.4484,-112.0740"  },
  { name: "Seattle",     loc: "47.6062,-122.3321"  },
  { name: "Denver",      loc: "39.7392,-104.9903"  },
];

async function fetchTomorrowIOMetro(
  apiKey: string,
  metro: { name: string; loc: string },
  signal: AbortSignal,
): Promise<string> {
  try {
    const url =
      `https://api.tomorrow.io/v4/weather/realtime` +
      `?location=${encodeURIComponent(metro.loc)}` +
      `&units=imperial` +
      `&apikey=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, { signal, headers: { Accept: "application/json" } });
    if (!res.ok) return "";
    const json = (await res.json()) as TomorrowIOResponse;
    const v = json.data?.values;
    if (!v) return "";
    const desc  = tomorrowWeatherDesc(v.weatherCode);
    const temp  = v.temperature          !== undefined ? `${Math.round(v.temperature)}°F`          : "";
    const feels = v.temperatureApparent  !== undefined ? `(feels ${Math.round(v.temperatureApparent)}°F)` : "";
    const wind  = v.windSpeed            !== undefined ? `wind ${Math.round(v.windSpeed)} mph`      : "";
    const precip = v.precipitationProbability !== undefined
      ? `${Math.round(v.precipitationProbability)}% precip chance` : "";
    const parts = [desc, temp, feels, wind, precip].filter(Boolean);
    return `${metro.name}: ${parts.join(", ")}`;
  } catch {
    return "";
  }
}

interface NWSAlertFeature {
  properties?: { event?: string; areaDesc?: string; severity?: string };
}

async function fetchWeatherGovAlerts(signal: AbortSignal): Promise<string> {
  try {
    const url =
      "https://api.weather.gov/alerts/active" +
      "?status=actual&message_type=alert&urgency=Immediate,Expected&severity=Extreme,Severe";
    const res = await fetch(url, {
      signal,
      headers: {
        "User-Agent": "MorningCupBot/1.0 (hello@vicinitynews.com)",
        Accept: "application/geo+json",
      },
    });
    if (!res.ok) return "";
    const json = (await res.json()) as { features?: NWSAlertFeature[] };
    const features = (json.features ?? []).slice(0, 15);
    if (features.length === 0) return "No active severe or extreme NWS alerts.";
    const lines = features
      .map((f) => {
        const p = f.properties;
        if (!p) return null;
        return `  • ${p.event ?? "Alert"} (${p.severity ?? "?"}) — ${p.areaDesc ?? ""}`;
      })
      .filter(Boolean) as string[];
    return `${features.length} active NWS alert(s):\n${lines.join("\n")}`;
  } catch {
    return "";
  }
}

async function buildRealTimeWeather(env: Env, signal: AbortSignal): Promise<string> {
  const sections: string[] = [];

  if (env.TOMORROW_IO_API_KEY) {
    const results = await Promise.allSettled(
      WEATHER_METROS.map((m) => fetchTomorrowIOMetro(env.TOMORROW_IO_API_KEY!, m, signal)),
    );
    const lines = results
      .map((r) => (r.status === "fulfilled" ? r.value : ""))
      .filter(Boolean);
    if (lines.length > 0) {
      sections.push(
        "=== REAL-TIME WEATHER — TODAY (tomorrow.io live API — use these as the AUTHORITATIVE current conditions, NOT yesterday's data) ===\n" +
        lines.join("\n"),
      );
    }
  }

  // weather.gov active alerts — no API key required; always fetch
  const alerts = await fetchWeatherGovAlerts(signal);
  if (alerts) {
    sections.push("=== NATIONAL WEATHER SERVICE ACTIVE ALERTS (weather.gov) ===\n" + alerts);
  }

  if (sections.length === 0) return "";
  return (
    sections.join("\n\n") +
    "\n\n⚠️  CRITICAL: The weather data above is TODAY's live data. Never substitute yesterday's conditions. Use these exact readings when writing weather sections."
  );
}

// ---------------------------------------------------------------------------

async function fetchNewsApi(env: Env, signal: AbortSignal): Promise<FetchedItem[]> {
  if (!env.NEWSAPI_KEY) return [];
  const endpoint = env.NEWSAPI_ENDPOINT || "https://newsapi.org/v2/top-headlines";
  const url = `${endpoint}?country=us&pageSize=50&apiKey=${encodeURIComponent(env.NEWSAPI_KEY)}`;
  try {
    const res = await fetch(url, { signal });
    if (!res.ok) {
      logger.warn("newsapi fetch failed", { status: res.status });
      return [];
    }
    const json = (await res.json()) as { articles?: NewsApiArticle[] };
    return (json.articles ?? []).map((a) => ({
      title: a.title ?? "",
      source: a.source?.name ?? "NewsAPI",
      url: a.url ?? "",
      published: a.publishedAt ?? "",
      summary: a.description ?? "",
    }));
  } catch (err) {
    logger.warn("newsapi error", { err: String(err) });
    return [];
  }
}

function withinSourceDay(item: FetchedItem, sourceIsoDate: string): boolean {
  if (!item.published) return true; // some feeds don't include dates; allow.
  const t = Date.parse(item.published);
  if (Number.isNaN(t)) return true;
  const d = new Date(t);
  const yyyymmdd = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  // Allow source day or items from <= 36h ago to absorb timezones.
  const sourceTs = Date.parse(`${sourceIsoDate}T00:00:00Z`);
  if (Number.isNaN(sourceTs)) return yyyymmdd === sourceIsoDate;
  const dayDiff = Math.abs(t - sourceTs) / 86400000;
  return dayDiff <= 1.5;
}

export async function buildSourceDigest(
  env: Env,
  sourceIsoDate: string,
  enabled: boolean,
): Promise<SourceDigest> {
  const empty: SourceDigest = {
    source_date: sourceIsoDate,
    generated_at: new Date().toISOString(),
    available: false,
    categories: {},
  };
  if (!enabled) {
    return { ...empty, notes: "Source digest disabled by config." };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const feedList = (env.NEWS_RSS_FEEDS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const fetches: Promise<FetchedItem[]>[] = [];
    for (const feed of feedList) fetches.push(fetchRss(feed, controller.signal));
    fetches.push(fetchNewsApi(env, controller.signal));

    const settled = await Promise.allSettled(fetches);
    const items: FetchedItem[] = [];
    for (const r of settled) {
      if (r.status === "fulfilled") items.push(...r.value);
    }

    if (items.length === 0) {
      return { ...empty, notes: "No source providers returned items." };
    }

    const filtered = items.filter((i) => withinSourceDay(i, sourceIsoDate));

    const buckets: Record<string, SourceItem[]> = {};
    for (const cat of DIGEST_CATEGORIES) buckets[cat] = [];
    for (const item of filtered) {
      const cats = categorize(item.title, item.summary);
      if (cats.length === 0) continue;
      for (const cat of cats) {
        if (buckets[cat].length < 8) {
          buckets[cat].push({
            title: item.title,
            source: item.source,
            url: item.url,
            published: item.published,
            summary: item.summary,
          });
        }
      }
    }

    const total = Object.values(buckets).reduce((n, arr) => n + arr.length, 0);

    // Fetch real-time weather (tomorrow.io + weather.gov) — runs concurrently
    // with the RSS fetch above (both share the same AbortController).
    let realTimeWeather: string | undefined;
    try {
      const weatherText = await buildRealTimeWeather(env, controller.signal);
      if (weatherText) realTimeWeather = weatherText;
    } catch (err) {
      logger.warn("real-time weather fetch error", { err: String(err) });
    }

    return {
      source_date: sourceIsoDate,
      generated_at: new Date().toISOString(),
      available: total > 0,
      categories: buckets,
      notes: total > 0 ? undefined : "No items matched any digest category.",
      realTimeWeather,
    };
  } finally {
    clearTimeout(timeout);
  }
}

// Render the structured digest into a readable block to inject into the prompt.
export function renderDigestForPrompt(digest: SourceDigest): string {
  const lines: string[] = [];

  // Real-time weather always comes first so the model sees it before any
  // RSS-sourced weather items, which may reflect yesterday's conditions.
  if (digest.realTimeWeather) {
    lines.push(digest.realTimeWeather);
    lines.push("");
  }

  if (!digest.available) {
    lines.push("(No news source digest available — produce a generic structural draft only and set source_limited=true.)");
    return lines.join("\n");
  }

  for (const cat of DIGEST_CATEGORIES) {
    const items = digest.categories[cat];
    if (!items || items.length === 0) continue;
    lines.push(`## ${cat}`);
    for (const it of items) {
      const date = it.published ? ` (${it.published})` : "";
      const url = it.url ? ` [${it.url}]` : "";
      const summary = it.summary ? ` — ${it.summary}` : "";
      lines.push(`- ${it.title}${url} — ${it.source}${date}${summary}`);
    }
    lines.push("");
  }
  return lines.join("\n").trim();
}
