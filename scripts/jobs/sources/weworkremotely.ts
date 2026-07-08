// We Work Remotely — RSS feeds, one per category. Parsed with rss-parser.
// WWR has NO search feed (search.rss 403; ?search= ignored) AND miscategorizes PM
// roles — e.g. a "Staff Product Manager" filed under Full-Stack Programming. So we
// UNION every category feed (config.wwrCategories) and let the central role gate keep
// the PM titles. Each category feed is capped ~23-40 items by WWR (no pagination),
// which is an external limit, not ours.
import Parser from "rss-parser";
import type { RawJob } from "../types.js";
import { config } from "../config.js";
import { htmlToText } from "../html-to-text.js";

// WWR item titles are usually "Company: Role Title".
function splitTitle(raw: string): { company: string; title: string } {
  const idx = raw.indexOf(":");
  if (idx > 0 && idx < raw.length - 1) {
    return { company: raw.slice(0, idx).trim(), title: raw.slice(idx + 1).trim() };
  }
  return { company: "Unknown", title: raw.trim() };
}

function itemToJob(item: Parser.Item): RawJob {
  const { company } = splitTitle(item.title ?? "");
  const html = (item as { content?: string }).content ?? item.contentSnippet ?? "";
  return {
    id: `wwr:${item.guid ?? item.link ?? item.title}`,
    source: "wwr",
    // Keep the full "Company: Role" string so the role gate still matches on it.
    title: item.title ?? "",
    company,
    url: item.link ?? "",
    descriptionText: htmlToText(html),
    postedAt: item.isoDate ?? (item.pubDate ? new Date(item.pubDate).toISOString() : undefined),
  };
}

export async function fetchWeWorkRemotely(limit: number): Promise<RawJob[]> {
  const parser = new Parser({ timeout: 20_000 });
  const feeds = await Promise.allSettled(
    config.wwrCategories.map((slug) =>
      parser.parseURL(`https://weworkremotely.com/categories/${slug}.rss`),
    ),
  );

  const byId = new Map<string, RawJob>();
  for (const f of feeds) {
    if (f.status !== "fulfilled") continue;
    for (const item of f.value.items ?? []) {
      const job = itemToJob(item);
      if (!byId.has(job.id)) byId.set(job.id, job);
    }
  }

  if (byId.size === 0 && feeds.every((f) => f.status === "rejected")) {
    const reason = feeds.find((f) => f.status === "rejected") as PromiseRejectedResult | undefined;
    throw new Error(reason?.reason instanceof Error ? reason.reason.message : "all WWR category feeds failed");
  }

  return [...byId.values()].slice(0, limit);
}
