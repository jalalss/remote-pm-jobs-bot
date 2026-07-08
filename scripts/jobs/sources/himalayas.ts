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
  locationRestrictions?: string[]; // e.g. ["Switzerland"], ["Worldwide"]
  pubDate?: number; // unix seconds
  applicationLink?: string;
  guid?: string;
}

interface HimalayasResponse {
  jobs: HimalayasJob[];
  totalCount: number;
}

function mapJob(j: HimalayasJob): RawJob {
  return {
    id: `himalayas:${j.guid ?? j.applicationLink ?? j.title}`,
    source: "himalayas",
    title: j.title,
    company: j.companyName,
    url: j.applicationLink ?? j.guid ?? "",
    descriptionText: htmlToText(j.description),
    structuredLocation:
      j.locationRestrictions && j.locationRestrictions.length
        ? j.locationRestrictions.join(", ")
        : undefined,
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
