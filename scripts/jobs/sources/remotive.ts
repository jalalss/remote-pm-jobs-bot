// Remotive — public JSON API. Has a structured `candidate_required_location` field.
// NOTE: Remotive's API ignores the `category`/`search` params for us and serves a
// throttled ~28-job GENERAL feed (~1 PM after the role gate). It's the one non-search
// source, kept by choice for its small trickle; the role gate downstream filters it.
import type { RawJob } from "../types.js";
import { htmlToText } from "../html-to-text.js";
import { fetchJson } from "./http.js";

interface RemotiveJob {
  id: number;
  url: string;
  title: string;
  company_name: string;
  publication_date: string; // e.g. "2026-07-04T16:53:04"
  candidate_required_location: string; // e.g. "Worldwide", "USA Only"
  description: string; // HTML
}

interface RemotiveResponse {
  jobs: RemotiveJob[];
}

export async function fetchRemotive(limit: number): Promise<RawJob[]> {
  const url = `https://remotive.com/api/remote-jobs?category=product&limit=${limit}`;
  const data = await fetchJson<RemotiveResponse>(url);
  return (data.jobs ?? []).map((j) => ({
    id: `remotive:${j.id}`,
    source: "remotive",
    title: j.title,
    company: j.company_name,
    url: j.url,
    descriptionText: htmlToText(j.description),
    structuredLocation: j.candidate_required_location || undefined,
    postedAt: j.publication_date ? new Date(j.publication_date).toISOString() : undefined,
  }));
}
