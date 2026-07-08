// Remote OK — public JSON API (array; first element is a legal notice).
// We query the product-manager and product TAGS (not the general feed) for a much
// higher PM yield, then merge + dedupe. Needs a real User-Agent or it 403s.
import type { RawJob } from "../types.js";
import { config } from "../config.js";
import { htmlToText } from "../html-to-text.js";
import { fetchJson } from "./http.js";

interface RemoteOkJob {
  id?: string;
  slug?: string;
  company?: string;
  position?: string; // title
  description?: string; // HTML
  location?: string;
  url?: string;
  date?: string; // ISO
  legal?: string; // present only on the first (metadata) element
}

export async function fetchRemoteOk(limit: number): Promise<RawJob[]> {
  // Product-focused tag search (config.remoteOkTags). product-manager is highest
  // precision; product adds breadth. These are the only real PM tags on Remote OK.
  const tagUrls = config.remoteOkTags.map(
    (tag) => `https://remoteok.com/api?tags=${encodeURIComponent(tag)}`,
  );
  const responses = await Promise.allSettled(tagUrls.map((u) => fetchJson<RemoteOkJob[]>(u)));

  const byId = new Map<string, RawJob>();
  for (const res of responses) {
    if (res.status !== "fulfilled" || !Array.isArray(res.value)) continue;
    for (const j of res.value) {
      if (j.legal || !j.position || !j.id) continue;
      const id = `remoteok:${j.id}`;
      if (byId.has(id)) continue;
      byId.set(id, {
        id,
        source: "remoteok",
        title: j.position,
        company: j.company ?? "Unknown",
        url: j.url ?? `https://remoteok.com/remote-jobs/${j.slug ?? j.id}`,
        descriptionText: htmlToText(j.description ?? ""),
        structuredLocation: j.location || undefined,
        postedAt: j.date ? new Date(j.date).toISOString() : undefined,
      });
    }
  }

  // If every tag request failed, surface the error so the source is reported as failed.
  if (byId.size === 0 && responses.every((r) => r.status === "rejected")) {
    const reason = responses.find((r) => r.status === "rejected") as PromiseRejectedResult | undefined;
    throw new Error(reason?.reason instanceof Error ? reason.reason.message : "all Remote OK tag requests failed");
  }

  return [...byId.values()].slice(0, limit);
}
