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

// NOTE: use the guid/applicationLink URL EXACTLY as given — do NOT strip the trailing
// numeric job ID. Himalayas posts the same role once per country under a shared base slug
// (e.g. .../technical-product-manager-ai-systems-1945394021 and ...-5201307322), so the
// trailing ID is the canonical disambiguator; removing it makes the slug ambiguous and
// Himalayas redirects to /jobs. (An occasional numbered link that 404s is an EXPIRED
// posting, which no URL transform can fix.)

// A worldwide role shows up as an EMPTY locationRestrictions plus a globe-spanning
// timezone list. Require corroborating timezone breadth so a merely-missing location
// field isn't mislabelled worldwide.
function locationHint(j: HimalayasJob): string | undefined {
  const loc = j.locationRestrictions ?? [];
  if (loc.length) return loc.join(", ");
  const tz = j.timezoneRestrictions ?? [];
  const global = tz.includes(BANGKOK_OFFSET) || tz.length >= 30;
  return global ? "Open to all countries (worldwide) — Himalayas structured field" : undefined;
}

function timezoneHint(tz: number[] | undefined): string | undefined {
  if (!tz || !tz.length) return undefined;
  const fmt = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
  const list = tz.map(fmt).join(", ");
  if (tz.includes(BANGKOK_OFFSET)) {
    return tz.length >= 30
      ? "Hiring timezones include UTC+7 (Bangkok); range spans the globe"
      : `Hiring timezones (UTC ${list}) INCLUDE UTC+7 (Bangkok)`;
  }
  return `Hiring timezones (UTC ${list}) do NOT include UTC+7 (Bangkok)`;
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
