// Himalayas — documented search endpoint (https://himalayas.app/jobs/api/search).
// Search-first: we query several PM role terms (each returns a distinct result set),
// paginate each via `page`, and dedupe. Far higher yield than the general browse feed.
// `locationRestrictions` gives a structured location hint.
import type { RawJob } from "../types.js";
import { config } from "../config.js";
import { htmlToText } from "../html-to-text.js";
import { fetchJson } from "./http.js";

interface HimalayasJob {
  title: string;
  companyName: string;
  description: string; // HTML
  locationRestrictions?: string[]; // e.g. ["Switzerland"]; [] means open to all countries (worldwide)
  timezoneRestrictions?: number[]; // UTC offsets, e.g. [-5,-6]; full ~37-entry range = worldwide
  pubDate?: number; // unix seconds
  applicationLink?: string;
  guid?: string;
}

interface HimalayasResponse {
  jobs: HimalayasJob[];
  totalCount: number;
}

const BANGKOK_OFFSET = 7; // UTC+7
const fmtOffset = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

// NOTE: use the guid/applicationLink URL EXACTLY as given — do NOT strip the trailing
// numeric job ID. Himalayas posts the same role once per country under a shared base slug
// (e.g. .../technical-product-manager-ai-systems-1945394021 and ...-5201307322), so the
// trailing ID is the canonical disambiguator; removing it makes the slug ambiguous and
// Himalayas redirects to /jobs. (An occasional numbered link that 404s is an EXPIRED
// posting, which no URL transform can fix.)

// Location hint. Empty restrictions + a globe-spanning timezone list = worldwide. A list of
// several countries is reported as a BROAD list (breadth is a market-targeting signal the
// classifier reads as open); a short list is passed through as-is.
function locationHint(j: HimalayasJob): string | undefined {
  const loc = j.locationRestrictions ?? [];
  const tz = j.timezoneRestrictions ?? [];
  if (!loc.length) {
    const worldwide = tz.length >= 30 || tz.includes(BANGKOK_OFFSET);
    return worldwide ? "Open to all countries (worldwide) — Himalayas structured field" : undefined;
  }
  return loc.length >= 5
    ? `Broad multi-country list (${loc.length} countries): ${loc.join(", ")}`
    : loc.join(", ");
}

// Timezone hint. Reports the span and whether ANY hiring zone overlaps UTC+7 within the
// configured window — adjacent zones (e.g. +5.5 India, +8 Singapore/Australia) count as
// overlap, so proximity to Bangkok reads as a positive signal, not a miss.
function timezoneHint(tz: number[] | undefined): string | undefined {
  if (!tz || !tz.length) return undefined;
  const nearest = tz.reduce((b, o) => (Math.abs(o - BANGKOK_OFFSET) < Math.abs(b - BANGKOK_OFFSET) ? o : b), tz[0]);
  const dist = Math.abs(nearest - BANGKOK_OFFSET);
  const overlaps = dist <= config.minTimezoneOverlapHours;
  const lo = Math.min(...tz), hi = Math.max(...tz);
  const span = lo === hi ? `1 zone (UTC ${fmtOffset(lo)})` : `${tz.length} zones (UTC ${fmtOffset(lo)}..${fmtOffset(hi)})`;
  const near = `nearest to UTC+7 is UTC${fmtOffset(nearest)} (${dist}h away)`;
  return overlaps
    ? `Hiring timezones: ${span}; ${near} — OVERLAPS with UTC+7 (Bangkok, within ${config.minTimezoneOverlapHours}h).`
    : `Hiring timezones: ${span}; ${near} — no overlap with UTC+7 (Bangkok).`;
}

function mapJob(j: HimalayasJob): RawJob {
  return {
    id: `himalayas:${j.guid ?? j.applicationLink ?? j.title}`,
    source: "himalayas",
    title: j.title,
    company: j.companyName,
    url: j.applicationLink ?? j.guid ?? "",
    descriptionText: htmlToText(j.description),
    structuredLocation: locationHint(j),
    structuredTimezone: timezoneHint(j.timezoneRestrictions),
    postedAt: j.pubDate ? new Date(j.pubDate * 1000).toISOString() : undefined,
  };
}

export async function fetchHimalayas(): Promise<RawJob[]> {
  const byId = new Map<string, RawJob>();
  let anyOk = false;

  // Run queries SEQUENTIALLY (pages parallel within each). Himalayas rate-limits
  // bursts, so firing all query×page requests at once trips timeouts — capping
  // concurrency at ~pagesPerQuery keeps it reliable.
  for (const q of config.himalayasQueries) {
    const pageUrls = Array.from(
      { length: config.himalayasPagesPerQuery },
      (_, i) =>
        `https://himalayas.app/jobs/api/search?q=${encodeURIComponent(q)}&sort=recent&page=${i + 1}`,
    );
    const results = await Promise.allSettled(pageUrls.map((u) => fetchJson<HimalayasResponse>(u)));
    for (const r of results) {
      if (r.status !== "fulfilled") continue;
      anyOk = true;
      for (const j of r.value.jobs ?? []) {
        const job = mapJob(j);
        if (!byId.has(job.id)) byId.set(job.id, job);
      }
    }
  }

  if (!anyOk) throw new Error("all Himalayas search requests failed");
  return [...byId.values()];
}
