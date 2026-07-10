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
  "92000000": "WW",
};
const regionName = (geoId: string) => REGION_NAMES[geoId] ?? `geo:${geoId}`;

/** LinkedIn throttled us. Callers must NOT mistake this for an exhausted result set. */
export class RateLimited extends Error {
  constructor(readonly status: number) {
    super(`LinkedIn rate-limited the request (HTTP ${status || "network error"})`);
    this.name = "RateLimited";
  }
}

/**
 * Fetch one guest page, retrying throttles with backoff.
 *
 * The caller breaks its pagination loop on `!ok`, so a 429 returned as `{ok:false}` would look
 * exactly like "no more results": the run would quietly return fewer jobs and still report success.
 * Retry, then THROW — a rate-limit must never be silently absorbed.
 */
async function fetchHtml(url: string): Promise<{ ok: boolean; html: string; status: number }> {
  const RETRY_ON = [429, 500, 502, 503, 504, 999]; // 999 = LinkedIn's bot-block status
  let lastStatus = 0;

  for (let attempt = 0; attempt < 4; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": config.linkedinUserAgent, Accept: "text/html" },
        signal: controller.signal,
      });
      lastStatus = res.status;
      if (res.ok) return { ok: true, html: await res.text(), status: res.status };
      // A genuine 404/400 is not a throttle; let the caller stop this search normally.
      if (!RETRY_ON.includes(res.status)) return { ok: false, html: "", status: res.status };
    } catch {
      lastStatus = 0; // network error or timeout — worth retrying
    } finally {
      clearTimeout(timer);
    }
    if (attempt < 3) {
      const backoff = 2000 * 2 ** attempt; // 2s, 4s, 8s
      console.warn(
        `    linkedin: HTTP ${lastStatus || "network error"} — backing off ${backoff / 1000}s (retry ${attempt + 1}/3)`,
      );
      await sleep(backoff);
    }
  }
  throw new RateLimited(lastStatus);
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

/**
 * Repeat one search, unioning cards until it plateaus (LinkedIn is non-deterministic).
 *
 * Returns how many cards THIS search contributed that no earlier search had. `union` is shared
 * across every configured search, so cumulative size can't show whether a given search earned its
 * rate-limit budget — only the delta can.
 */
async function collectSearch(
  s: { keywords: string; geoId: string; f_WT?: string; f_TPR?: string },
  union: Map<string, Card>,
): Promise<number> {
  // Two searches can share a geo and differ only in facet + keywords (the WW pair), so the label
  // has to carry both or the yield logs are unreadable a month from now.
  const label = `${regionName(s.geoId)} ${s.f_WT ? "f_WT=2" : "anyWT"} kw='${s.keywords}'`;
  const contributed = union.size;
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
      if (union.size >= config.linkedinMaxJobs) return union.size - contributed;
      const { ok, html } = await fetchHtml(`${SEARCH}?${query}&start=${start}`);
      if (!ok) break; // a real 4xx; throttles throw RateLimited instead of landing here
      const cards = parseCards(html);
      if (cards.length === 0) break;
      for (const c of cards) if (!union.has(c.id)) union.set(c.id, c);
      start += cards.length;
      await sleep(config.linkedinRequestDelayMs);
    }
    plateauStreak = union.size === before ? plateauStreak + 1 : 0;
    if (plateauStreak >= config.linkedinPlateauStreak) break;
    if (union.size >= config.linkedinMaxJobs) break;
  }
  const gained = union.size - contributed;
  console.log(`    linkedin[${label}]: +${gained} new cards (union now ${union.size})`);
  return gained;
}

/**
 * @param knownIds Ids already in the classification cache (e.g. "linkedin:12345"); these
 *                 skip the JD fetch since they won't be re-classified.
 */
export async function fetchLinkedin(knownIds: Set<string>): Promise<RawJob[]> {
  const union = new Map<string, Card>();
  let throttled = false;

  for (const s of config.linkedinSearches) {
    try {
      await collectSearch(s, union);
    } catch (e) {
      if (!(e instanceof RateLimited)) throw e;
      // Stop searching rather than hammer a throttling host. Keep what we have; the JD loop
      // below will decide for itself whether LinkedIn is answering again.
      console.warn(`\n  !! LINKEDIN RATE-LIMITED (${e.message}).`);
      console.warn(`  !! Stopped after ${union.size} cards; remaining searches skipped.`);
      console.warn(`  !! Change your IP (VPN) and re-run \`npm run jobs:fetch\` to collect the rest.\n`);
      throttled = true;
      break;
    }
    if (union.size >= config.linkedinMaxJobs) {
      console.warn(`    linkedin: hit linkedinMaxJobs (${config.linkedinMaxJobs}); later searches skipped.`);
      break;
    }
  }
  if (union.size === 0) throw new Error("no cards returned (blocked or empty search)");
  if (throttled) console.warn(`    linkedin: proceeding with a PARTIAL card set (${union.size}).`);

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
    let ok: boolean;
    let html: string;
    try {
      ({ ok, html } = await fetchHtml(`${JOB}/${card.id}`));
    } catch (e) {
      if (!(e instanceof RateLimited)) throw e;
      // Without this, a throttle would look like "this posting expired" for every remaining card,
      // and the run would report success having silently dropped hundreds of JDs.
      console.warn(`\n  !! LINKEDIN RATE-LIMITED while fetching JDs (${e.message}).`);
      console.warn(`  !! Keeping the ${jobs.length} JDs fetched so far; ${pmCards.length - fetched} not fetched.`);
      console.warn(`  !! Change your IP (VPN) and re-run \`npm run jobs:fetch\` — cached jobs are skipped.\n`);
      break;
    }
    await sleep(config.linkedinRequestDelayMs);
    fetched++;
    if (fetched % 25 === 0 || fetched === newCount) {
      console.log(`    linkedin: fetched ${fetched}/${newCount} JDs`);
    }
    if (!ok || !html) continue; // expired / gated — skip this one
    jobs.push({ ...base, descriptionText: extractDescription(html) });
  }
  return jobs;
}
