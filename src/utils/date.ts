// Timezone-aware date helpers using the Intl API (Workers-safe).

export interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: string;
}

function intlParts(date: Date, timeZone: string): ZonedParts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "long",
    hour12: false,
  });
  const parts = fmt.formatToParts(date);
  const get = (type: string): string =>
    parts.find((p) => p.type === type)?.value ?? "";
  // Note: `hour` may come back as "24" in some Intl impls when local time is midnight.
  const rawHour = get("hour");
  const hour = rawHour === "24" ? 0 : Number(rawHour);
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour,
    minute: Number(get("minute")),
    second: Number(get("second")),
    weekday: get("weekday"),
  };
}

export function getZonedNow(timeZone: string, now: Date = new Date()): ZonedParts {
  return intlParts(now, timeZone);
}

export function isoDate(parts: ZonedParts): string {
  const m = String(parts.month).padStart(2, "0");
  const d = String(parts.day).padStart(2, "0");
  return `${parts.year}-${m}-${d}`;
}

export function previousIsoDate(yyyymmdd: string): string {
  const [y, m, d] = yyyymmdd.split("-").map((s) => Number(s));
  // Construct UTC midnight, subtract one day. Date math at UTC midnight
  // does not get bitten by DST.
  const t = Date.UTC(y, m - 1, d);
  const prev = new Date(t - 24 * 60 * 60 * 1000);
  const yy = prev.getUTCFullYear();
  const mm = String(prev.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(prev.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function ordinal(n: number): string {
  // 11/12/13 are always "th" (not "11st"/"12nd"/"13rd"); the rest follow last digit.
  const lastTwo = n % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

export function spokenDate(yyyymmdd: string): string {
  const [y, m, d] = yyyymmdd.split("-").map((s) => Number(s));
  return `${MONTH_NAMES[m - 1]} ${ordinal(d)}, ${y}`;
}

export function dayOfYear(yyyymmdd: string): number {
  const [y, m, d] = yyyymmdd.split("-").map(Number);
  const jan1 = Date.UTC(y, 0, 1);
  const day = Date.UTC(y, m - 1, d);
  return Math.round((day - jan1) / 86_400_000) + 1;
}

export function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  if (m < 1 || m > 12) return false;
  if (d < 1 || d > 31) return false;
  // Round-trip to confirm it's a real day.
  const t = Date.UTC(y, m - 1, d);
  const dt = new Date(t);
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}
