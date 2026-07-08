// LinkedIn via public guest endpoints. LinkedIn search is non-deterministic (the same
// query returns varying partial subsets), so we REPEAT each configured search and UNION
// the job cards until it plateaus, then fetch each JD. We rely on OUR classifier to decide
// remote (not LinkedIn's f_WT). Uses a browser UA — LinkedIn 999-blocks obvious bot UAs.
//
// Efficiency: the role-title gate is applied BEFORE fetching JDs (skips ~40% non-PM noise),
// and jobs already in the classification cache skip the JD fetch entirely (they won't be
// re-classified) — so steady-state daily runs only fetch genuinely new postings.
import type { RawJob } from "../types.js";
import { config, titleMatchesRole } from "../config.js";
import { htmlToText } from "../html-to-text.js";

const SEARCH = "https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search";
const JOB = "https://www.linkedin.com/jobs-guest/jobs/api/jobPosting";

interface Card {
  id: string;
  title?: string;
  company?: string;
  location?: string;
  postedAt?: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const REGION_NAMES: Record<string, string> = {
  "91000000": "EU",
  "103644278": "US",
  "101165590": "UK",
  "91000003": "APAC",
};
const regionName = (geoId: string) => REGION_NAMES[geoId] ?? `geo:${geoId}`;

async function fetchHtml(url: string): Promise<{ ok: boolean; html: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": config.linkedinUserAgent, Accept: "text/html" },
      signal: controller.signal,
    });
    return { ok: res.ok, html: res.ok ? await res.text() : "" };
  } catch {
    return { ok: false, html: "" };
  } finally {
    clearTimeout(timer);
  }
}

// The guest jobPosting fragment wraps the JD in login-wall chrome; the actual description
// is inside `show-more-less-html__markup`. Extract just that (fallback: whole fragment).
function extractDescription(html: string): string {
  const m = html.match(/show-more-less-html__markup[^>]*>([\s\S]*?)<\/div>\s*<\/section>/);
  return htmlToText(m ? m[1] : html);
}

function toIso(datetime: string | undefined): string | undefined {
  if (!datetime) return undefined;
  const t = new Date(datetime).getTime();
  return Number.isNaN(t) ? undefined : new Date(t).toISOString();
}

function parseCards(html: string): Card[] {
  const out: Card[] = [];
  for (const c of html.split(/<li>/).slice(1)) {
    const id =
      (c.match(/urn:li:jobPosting:(\d+)/) || [])[1] ||
      (c.match(/\/jobs\/view\/[^"']*?-(\d+)/) || [])[1] ||
      (c.match(/\/jobs\/view\/(\d+)/) || [])[1];
    if (!id) continue;
    const title = (c.match(/base-search-card__title">([\s\S]*?)</) || [])[1];
    const company = (c.match(/base-search-card__subtitle">(?:\s*<a[^>]*>)?([\s\S]*?)</) || [])[1];
    const location = (c.match(/job-search-card__location">([\s\S]*?)</) || [])[1];
    const datetime = (c.match(/datetime="([^"]+)"/) || [])[1];
    out.push({
      id,
      title: title ? htmlToText(title) : undefined,
      company: company ? htmlToText(company) : undefined,
      location: location ? htmlToText(location) : undefined,
      postedAt: toIso(datetime),
    });
  }
  return out;
}

/** Repeat one search, unioning cards until it plateaus (LinkedIn is non-deterministic). */
async function collectSearch(
  s: { keywords: string; geoId: string; f_WT?: string; f_TPR?: string },
  union: Map<string, Card>,
): Promise<void> {
  const label = regionName(s.geoId);
  const query = [
    `keywords=${encodeURIComponent(s.keywords)}`,
    `geoId=${encodeURIComponent(s.geoId)}`,
    s.f_WT ? `f_WT=${s.f_WT}` : null,
    s.f_TPR ? `f_TPR=${s.f_TPR}` : null,
  ]
    .filter(Boolean)
    .join("&");

  console.log(`    linkedin[${label}]: searching (repeat+union)...`);
  let plateauStreak = 0;
  for (let rep = 0; rep < config.linkedinRepeats; rep++) {
    const before = union.size;
    let start = 0;
    for (let page = 0; page < config.linkedinMaxPagesPerQuery; page++) {
      if (union.size >= config.linkedinMaxJobs) return;
      const { ok, html } = await fetchHtml(`${SEARCH}?${query}&start=${start}`);
      if (!ok) break;
      const cards = parseCards(html);
      if (cards.length === 0) break;
      for (const c of cards) if (!union.has(c.id)) union.set(c.id, c);
      start += cards.length;
      await sleep(config.linkedinRequestDelayMs);
    }
    console.log(`    linkedin[${label}]: pass ${rep + 1} -> ${union.size} unique cards`);
    plateauStreak = union.size === before ? plateauStreak + 1 : 0;
    if (plateauStreak >= config.linkedinPlateauStreak) break;
    if (union.size >= config.linkedinMaxJobs) break;
  }
}

/**
 * @param knownIds Ids already in the classification cache (e.g. "linkedin:12345"); these
 *                 skip the JD fetch since they won't be re-classified.
 */
export async function fetchLinkedin(knownIds: Set<string>): Promise<RawJob[]> {
  const union = new Map<string, Card>();
  for (const s of config.linkedinSearches) {
    await collectSearch(s, union);
    if (union.size >= config.linkedinMaxJobs) break;
  }
  if (union.size === 0) throw new Error("no cards returned (blocked or empty search)");

  // Role-gate on title BEFORE fetching JDs, and cap, so we only spend fetches on PM roles.
  const pmCards = [...union.values()]
    .filter((c) => titleMatchesRole(c.title ?? ""))
    .slice(0, config.linkedinMaxJobs);
  const newCount = pmCards.filter((c) => !knownIds.has(`linkedin:${c.id}`)).length;
  console.log(
    `    linkedin: ${union.size} cards -> ${pmCards.length} PM roles; fetching ${newCount} new JDs (${pmCards.length - newCount} cached)...`,
  );

  const jobs: RawJob[] = [];
  let fetched = 0;
  for (const card of pmCards) {
    const rawId = `linkedin:${card.id}`;
    const base = {
      id: rawId,
      source: "linkedin",
      title: card.title ?? "",
      company: card.company ?? "Unknown",
      url: `https://www.linkedin.com/jobs/view/${card.id}/`,
      structuredLocation: card.location || undefined,
      postedAt: card.postedAt,
    };
    if (knownIds.has(rawId)) {
      // Already classified in a prior run — reuse from cache; no JD fetch needed.
      jobs.push({ ...base, descriptionText: "" });
      continue;
    }
    const { ok, html } = await fetchHtml(`${JOB}/${card.id}`);
    await sleep(config.linkedinRequestDelayMs);
    fetched++;
    if (fetched % 25 === 0 || fetched === newCount) {
      console.log(`    linkedin: fetched ${fetched}/${newCount} JDs`);
    }
    if (!ok || !html) continue; // expired / gated / blocked — skip this one
    jobs.push({ ...base, descriptionText: extractDescription(html) });
  }
  return jobs;
}
