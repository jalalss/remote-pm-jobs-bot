// Independent pipeline stages: fetch -> classify -> render, plus a free language
// sweep, a manual reject, and a one-time JSON->SQLite migration. All state lives in
// the SQLite DB (db.ts); each stage queries only what it needs.
import { writeFileSync } from "node:fs";
import { config, titleMatchesRole } from "./config.js";
import { effectiveVerdict, type Classification, type ClassifiedJob, type RawJob, type Verdict } from "./types.js";
import { classifyJob } from "./classify.js";
import {
  upsertJobs, allJobIds, pruneJobsOlderThan, allJobs, unclassifiedJobs,
  upsertClassification, classifiedJobs, forceReject, counts, setFitScore, unscoredJobs,
  type JobWithMeta,
} from "./db.js";
import { loadCandidate, personaHash } from "./candidate.js";
import { scoreJob } from "./score.js";
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
  let failed = 0;
  await pMap(needLLM, 5, async (job) => {
    try {
      const classification = await classifyJob(job);
      // null = the model could not be reached. Write NOTHING: under --force an upsert here would
      // overwrite a good verdict with a fabricated one. Leaving it alone is self-healing.
      if (classification) upsertClassification(job.id, classification, "llm");
      else failed++;
    } catch (e) {
      failed++;
      console.warn(`  classify failed for ${job.id}: ${e instanceof Error ? e.message : e}`);
    } finally {
      done++;
      if (done % 25 === 0 || done === needLLM.length) console.log(`  classified ${done}/${needLLM.length}`);
    }
  });
  const c = counts();
  console.log(
    `DB: ${c.classifications} classifications. By verdict: ${JSON.stringify(c.byVerdict)}` +
      (failed ? `\n  !! ${failed} FAILED — left unchanged, not overwritten. Re-run to retry.` : ""),
  );
}

/** SCORE: rate PASS/MAYBE jobs 0–10 for role fit against the candidate persona. Needs API key.
 *  Scores live in their own table, so `classify --force` can never destroy them. Editing the
 *  persona changes its hash, which marks every score stale so only those get re-scored. */
export async function runScore({ force = false, limit }: { force?: boolean; limit?: number } = {}): Promise<void> {
  const candidate = await loadCandidate();
  const hash = personaHash(candidate);
  const verdicts = [...config.scoringVerdicts] as Verdict[];
  const todo = unscoredJobs(verdicts, hash, { force, limit });

  const scope = [force ? "force: all" : null, limit ? `limit: ${limit}` : null].filter(Boolean).join(", ");
  console.log(`Scoring ${todo.length} ${verdicts.join("/")} jobs with ${config.scoringModel} (effort: ${config.scoringEffort})${scope ? ` [${scope}]` : ""}...`);
  console.log(`  persona ${hash} · PASS jobs first`);
  if (!todo.length) {
    console.log("  Nothing to score — all in-scope jobs are current for this persona.");
    return;
  }

  // Aggregators repost the same JD under different ids (Pennylane appears 7x, Bjak 4x). Score ONE
  // representative per byte-identical description and copy the result to its siblings. This saves
  // ~14% of the spend, but the real win is the ranking: without it, seven copies of one job crowd
  // the top of a score-sorted queue, each with a slightly different score (Opus 4.8 removed
  // `temperature`, so identical input varies ~±0.5).
  const groups = new Map<string, JobWithMeta[]>();
  for (const j of todo) {
    const key = `${j.company}\u0000${j.descriptionText}`;
    const g = groups.get(key);
    if (g) g.push(j);
    else groups.set(key, [j]);
  }
  const reps = [...groups.values()];
  const dupes = todo.length - reps.length;
  if (dupes) console.log(`  ${reps.length} unique postings (${dupes} exact duplicates will share their twin's score)`);

  let done = 0;
  let failed = 0;
  let newlyScored = 0; // jobs given a score in THIS run (siblings included), vs the DB total below
  await pMap(reps, 4, async (siblings) => {
    const fit = await scoreJob(siblings[0], candidate);
    if (fit) {
      for (const s of siblings) {
        setFitScore(s.id, fit, config.scoringModel, hash);
        newlyScored++;
      }
    } else failed++;
    done++;
    if (done % 10 === 0 || done === reps.length) console.log(`  scored ${done}/${reps.length} unique`);
  });

  // Distribution tells you at a glance whether the rubric is calibrated or bunched.
  const scored = classifiedJobs(verdicts).filter((r) => r.fit);
  const buckets: Record<string, number> = { "8–10": 0, "6–8": 0, "4–6": 0, "0–4": 0 };
  for (const { fit } of scored) {
    const s = fit!.score;
    buckets[s >= 8 ? "8–10" : s >= 6 ? "6–8" : s >= 4 ? "4–6" : "0–4"]++;
  }
  // Report this run's work distinctly from the cumulative DB total — otherwise "N scored" reads
  // as if the whole database was just re-scored (it usually wasn't; unchanged scores are kept).
  console.log(
    `\nScored ${newlyScored} job(s) this run (${reps.length - failed} unique call(s))` +
      `${failed ? `, ${failed} failed (left unscored, not faked)` : ""}.`,
  );
  console.log(`  ${scored.length} scored in total.`);
  console.log(`  Distribution: ${Object.entries(buckets).map(([k, v]) => `${k}: ${v}`).join(" · ")}`);
  const top = scored.sort((a, b) => b.fit!.score - a.fit!.score).slice(0, 5);
  if (top.length) {
    console.log(`  Top 5:`);
    for (const { job, fit } of top) console.log(`    ${fit!.score.toFixed(1)}  ${job.title.slice(0, 52)} — ${job.company}`);
  }
}

/** RENDER: join jobs + classifications (+ any human override) -> HTML. No API key, no network. */
export function runRender(): void {
  const cutoff = Date.now() - config.newBadgeHours * 3_600_000;
  const classified: ClassifiedJob[] = classifiedJobs().map(
    ({ job, classification, override, fit, application }) => ({
      ...job,
      classification,
      override,
      fit,
      application, // shown read-only here; only the review server can write it
      isNew: new Date(job.firstSeenAt).getTime() >= cutoff,
    }),
  );
  writeFileSync(config.outputPath, renderDigest(classified), "utf8");
  const tally: Record<Verdict, number> = { PASS: 0, MAYBE: 0, REJECT: 0 };
  for (const j of classified) tally[effectiveVerdict(j)]++;
  const edited = classified.filter((j) => j.override?.verdict).length;
  console.log(`Wrote ${config.outputPath} — ${classified.length} jobs · PASS ${tally.PASS} · MAYBE ${tally.MAYBE} · REJECT ${tally.REJECT}${edited ? ` · ${edited} hand-edited` : ""}`);
  console.log(`  Open it: open "${config.outputPath}"`);
}

/** LABELS: export every human override as JSONL — the human-vs-LLM dataset used to refine
 *  the rubric (and, later, to train a model). No API key, no network. */
export function runLabelsExport(): void {
  const rows = classifiedJobs()
    .filter((r) => r.override?.verdict)
    .map(({ job, classification, override }) => ({
      jobId: job.id,
      source: job.source,
      title: job.title,
      company: job.company,
      url: job.url,
      postedAt: job.postedAt ?? null,
      structuredLocation: job.structuredLocation ?? null,
      structuredTimezone: job.structuredTimezone ?? null,
      llmVerdict: classification.verdict,
      llmReason: classification.reason,
      llmEvidence: classification.evidence,
      humanVerdict: override!.verdict,
      humanReason: override!.reason,
      ruleTag: override!.ruleTag,
      labeledAt: override!.updatedAt,
    }));
  writeFileSync(config.labelsExportPath, rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : ""), "utf8");
  const disagreements = rows.filter((r) => r.humanVerdict !== r.llmVerdict).length;
  console.log(`Wrote ${config.labelsExportPath} — ${rows.length} labels (${disagreements} disagree with the classifier).`);
  const byTag: Record<string, number> = {};
  for (const r of rows) if (r.ruleTag) byTag[r.ruleTag] = (byTag[r.ruleTag] ?? 0) + 1;
  if (Object.keys(byTag).length) console.log(`  By rule tag: ${JSON.stringify(byTag)}`);
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
