// Independent pipeline stages: fetch -> classify -> render, plus a free language
// sweep, a manual reject, and a one-time JSON->SQLite migration. All state lives in
// the SQLite DB (db.ts); each stage queries only what it needs.
import { writeFileSync } from "node:fs";
import { config, titleMatchesRole } from "./config.js";
import type { Classification, ClassifiedJob, RawJob, Verdict } from "./types.js";
import { classifyJob } from "./classify.js";
import {
  upsertJobs, allJobIds, pruneJobsOlderThan, allJobs, unclassifiedJobs,
  upsertClassification, classifiedJobs, forceReject, counts, type JobWithMeta,
} from "./db.js";
import { detectLang, snippet } from "./lang.js";
import { renderDigest } from "./render.js";
import { loadRawStore } from "./store.js";
import { loadCache } from "./cache.js";
import { fetchRemotive } from "./sources/remotive.js";
import { fetchRemoteOk } from "./sources/remoteok.js";
import { fetchWeWorkRemotely } from "./sources/weworkremotely.js";
import { fetchHimalayas } from "./sources/himalayas.js";
import { fetchLinkedin } from "./sources/linkedin.js";

// ---- helpers ----

const LANG_NAMES: Record<string, string> = {
  ell: "Greek", rus: "Russian", deu: "German", spa: "Spanish", fra: "French",
  ita: "Italian", por: "Portuguese", nld: "Dutch", pol: "Polish", ukr: "Ukrainian",
  ron: "Romanian", tur: "Turkish", swe: "Swedish", ces: "Czech", hun: "Hungarian",
};
const langName = (code: string) => LANG_NAMES[code] ?? code;

function nonEnglishRejection(text: string, code: string): Classification {
  return {
    workModel: "unclear",
    locationRestriction: "unclear",
    evidence: snippet(text),
    timezoneRequirement: null,
    timezoneOverlapOk: null,
    verdict: "REJECT",
    reason: `Job description written predominantly in ${langName(code)} (not English) — signals a local-market role.`,
    recruiterQuestion: null,
  };
}

function dedupe(jobs: RawJob[]): RawJob[] {
  const seen = new Set<string>();
  return jobs.filter((j) => (seen.has(j.id) ? false : (seen.add(j.id), true)));
}

function withinMaxAge(job: { postedAt?: string }): boolean {
  if (!job.postedAt) return true; // unknown date: keep
  const t = new Date(job.postedAt).getTime();
  if (Number.isNaN(t)) return true;
  return (Date.now() - t) / 86_400_000 <= config.maxAgeDays;
}

async function pMap<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      out[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

async function gatherJobs(knownIds: Set<string>): Promise<RawJob[]> {
  const sources: { name: string; fetch: () => Promise<RawJob[]> }[] = [
    { name: "remotive", fetch: () => fetchRemotive(config.perSourceLimit) },
    { name: "remoteok", fetch: () => fetchRemoteOk(config.perSourceLimit) },
    { name: "wwr", fetch: () => fetchWeWorkRemotely(config.perSourceLimit) },
    { name: "himalayas", fetch: () => fetchHimalayas() },
    { name: "linkedin", fetch: () => fetchLinkedin(knownIds) },
  ];
  console.log(`Fetching from ${sources.length} sources (${sources.map((s) => s.name).join(", ")})...`);
  const settled = await Promise.allSettled(
    sources.map(async (s) => {
      const t0 = Date.now();
      try {
        const jobs = await s.fetch();
        console.log(`  ✓ ${s.name}: ${jobs.length} listings (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
        return jobs;
      } catch (e) {
        console.warn(`  ✗ ${s.name}: FAILED — ${e instanceof Error ? e.message : e} (skipping)`);
        return [] as RawJob[];
      }
    }),
  );
  return settled.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
}

// ---- stages ----

/** FETCH: gather -> gate -> upsert into DB (accumulate + prune). No API key. */
export async function runFetch(): Promise<void> {
  const knownIds = allJobIds(); // LinkedIn skips re-fetching JDs we already stored
  const raw = await gatherJobs(knownIds);
  const gated = dedupe(raw).filter((j) => titleMatchesRole(j.title)).filter(withinMaxAge);
  console.log(`\n${raw.length} fetched -> ${gated.length} after role + recency gates.`);
  upsertJobs(gated);
  const pruned = pruneJobsOlderThan(config.maxAgeDays);
  const c = counts();
  console.log(`DB: ${c.jobs} jobs (${pruned} pruned). By source: ${JSON.stringify(c.bySource)}`);
}

/** CLASSIFY: language pre-check (free REJECT) then LLM for the rest. Needs API key.
 *  `force` re-classifies already-classified jobs; `source` restricts to one board. */
export async function runClassify({ force = false, source }: { force?: boolean; source?: string } = {}): Promise<void> {
  const todo: JobWithMeta[] = force ? allJobs(source) : unclassifiedJobs(source);
  const scope = [force ? "force: all" : null, source ? `source: ${source}` : null].filter(Boolean).join(", ");
  console.log(`Classifying ${todo.length} jobs${scope ? ` (${scope})` : ""}...`);

  const needLLM: JobWithMeta[] = [];
  let langRejected = 0;
  for (const j of todo) {
    const code = detectLang(j.descriptionText);
    if (code !== "eng" && code !== "und") {
      upsertClassification(j.id, nonEnglishRejection(j.descriptionText, code), "language");
      langRejected++;
    } else {
      needLLM.push(j);
    }
  }
  console.log(`  ${langRejected} rejected by language check (free); ${needLLM.length} via LLM...`);

  let done = 0;
  await pMap(needLLM, 5, async (job) => {
    try {
      upsertClassification(job.id, await classifyJob(job), "llm");
    } catch (e) {
      console.warn(`  classify failed for ${job.id}: ${e instanceof Error ? e.message : e}`);
    } finally {
      done++;
      if (done % 25 === 0 || done === needLLM.length) console.log(`  classified ${done}/${needLLM.length}`);
    }
  });
  const c = counts();
  console.log(`DB: ${c.classifications} classifications. By verdict: ${JSON.stringify(c.byVerdict)}`);
}

/** RENDER: join jobs + classifications -> HTML. No API key, no network. */
export function runRender(): void {
  const cutoff = Date.now() - config.newBadgeHours * 3_600_000;
  const classified: ClassifiedJob[] = classifiedJobs().map(({ job, classification }) => ({
    ...job,
    classification,
    isNew: new Date(job.firstSeenAt).getTime() >= cutoff,
  }));
  writeFileSync(config.outputPath, renderDigest(classified), "utf8");
  const tally: Record<Verdict, number> = { PASS: 0, MAYBE: 0, REJECT: 0 };
  for (const j of classified) tally[j.classification.verdict]++;
  console.log(`Wrote ${config.outputPath} — ${classified.length} jobs · PASS ${tally.PASS} · MAYBE ${tally.MAYBE} · REJECT ${tally.REJECT}`);
  console.log(`  Open it: open "${config.outputPath}"`);
}

/** LANGCHECK: free sweep — flip non-English PASS/MAYBE jobs to REJECT. No API key. */
export function runLangSweep(): void {
  const rows = classifiedJobs(["PASS", "MAYBE"]);
  let flipped = 0;
  for (const { job } of rows) {
    if (!job.descriptionText) continue;
    const code = detectLang(job.descriptionText);
    if (code !== "eng" && code !== "und") {
      upsertClassification(job.id, nonEnglishRejection(job.descriptionText, code), "language");
      flipped++;
    }
  }
  console.log(`Language sweep: checked ${rows.length} PASS/MAYBE jobs, flipped ${flipped} non-English -> REJECT.`);
}

/** REJECT: force-REJECT specific jobs by id (accepts a bare LinkedIn numeric id / url too). */
export function runReject(tokens: string[]): void {
  const ids = tokens.map((t) => {
    const num = t.match(/(\d{6,})/)?.[1];
    return num ? `linkedin:${num}` : t;
  });
  const { rejected, missing } = forceReject(ids);
  console.log(`Force-rejected ${rejected} job(s).${missing.length ? ` Not found: ${missing.join(", ")}` : ""}`);
}

/** MIGRATE: one-time import of legacy JSON (.jobs-raw.json + .job-cache.json) into the DB. */
export function runMigrate(): void {
  const store = loadRawStore();
  const cache = loadCache();
  const jobs = Object.values(store); // StoredJob = RawJob + firstSeenAt
  upsertJobs(jobs);
  const present = allJobIds();
  let migrated = 0;
  let skipped = 0;
  for (const [id, c] of Object.entries(cache)) {
    if (present.has(id)) {
      upsertClassification(id, c, "llm");
      migrated++;
    } else {
      skipped++;
    }
  }
  const c = counts();
  console.log(`Migrated ${jobs.length} jobs and ${migrated} classifications (${skipped} orphan classifications skipped — no job row).`);
  console.log(`DB now: ${c.jobs} jobs, ${c.classifications} classifications. Verdicts: ${JSON.stringify(c.byVerdict)}`);
}
