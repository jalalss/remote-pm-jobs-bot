// SQLite data-access layer (better-sqlite3). Four tables:
//   jobs             — fetched listings
//   classifications  — the CLASSIFIER's verdict (rewritten freely by `classify --force`)
//   job_overrides    — the HUMAN's edits for a job, never touched by classify, so a manual
//                      verdict survives re-classification AND the LLM's opinion is preserved
//                      alongside it (that pairing is the rubric-refinement dataset).
//                      Deliberately a general "user edits" row: a `status` column
//                      (Viewed/Applied) can be added later via the guarded-ALTER pattern below.
//   fit_scores       — "is this worth applying to?" (0–10) vs the classifier's "can I take it?".
//                      Own table, so `classify --force` can never destroy it. `persona_hash`
//                      records which candidate persona produced the score, so editing the CV or
//                      preferences marks scores stale and only those get re-scored.
import Database from "better-sqlite3";
import { config } from "./config.js";
import type { Classification, FitScore, JobOverride, RawJob, Verdict } from "./types.js";

export type ClassificationMethod = "llm" | "language" | "manual";
export interface JobWithMeta extends RawJob {
  firstSeenAt: string;
}

let _db: Database.Database | null = null;
function db(): Database.Database {
  if (_db) return _db;
  _db = new Database(config.dbPath);
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");
  _db.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      external_id TEXT,
      title TEXT, company TEXT, url TEXT, description TEXT, location TEXT, timezone TEXT,
      post_date TEXT,
      first_seen_at TEXT NOT NULL,
      last_fetched_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS classifications (
      job_id TEXT PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
      verdict TEXT NOT NULL,
      reason TEXT, evidence TEXT, work_model TEXT, location_restriction TEXT,
      timezone_requirement TEXT, timezone_overlap_ok INTEGER, recruiter_question TEXT,
      method TEXT NOT NULL,
      classified_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS job_overrides (
      job_id TEXT PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
      verdict TEXT, reason TEXT, rule_tag TEXT,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS fit_scores (
      job_id TEXT PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
      score REAL NOT NULL,
      strengths TEXT, gaps TEXT, angle TEXT, reason TEXT,
      model TEXT NOT NULL,
      persona_hash TEXT NOT NULL,
      scored_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_class_verdict ON classifications(verdict);
    CREATE INDEX IF NOT EXISTS idx_jobs_source ON jobs(source);
  `);
  // Backward-compatible migration: add `timezone` to pre-existing jobs tables.
  const cols = _db.prepare(`PRAGMA table_info(jobs)`).all() as { name: string }[];
  if (!cols.some((c) => c.name === "timezone")) {
    _db.exec(`ALTER TABLE jobs ADD COLUMN timezone TEXT`);
  }
  return _db;
}

// ---- row <-> domain mapping ----

interface JobRow {
  id: string; source: string; external_id: string | null;
  title: string | null; company: string | null; url: string | null;
  description: string | null; location: string | null; timezone: string | null;
  post_date: string | null;
  first_seen_at: string; last_fetched_at: string;
}
interface ClassRow {
  verdict: string; reason: string | null; evidence: string | null;
  work_model: string | null; location_restriction: string | null;
  timezone_requirement: string | null; timezone_overlap_ok: number | null;
  recruiter_question: string | null; method: string; classified_at: string;
}
/** LEFT JOINed override columns, aliased to avoid colliding with `classifications`. */
interface OverrideRow {
  o_verdict: string | null; o_reason: string | null;
  o_rule_tag: string | null; o_updated_at: string | null;
}
/** LEFT JOINed fit-score columns, aliased the same way. */
interface FitRow {
  f_score: number | null; f_strengths: string | null; f_gaps: string | null;
  f_angle: string | null; f_reason: string | null; f_model: string | null;
  f_persona_hash: string | null; f_scored_at: string | null;
}

function rowToOverride(r: OverrideRow): JobOverride | undefined {
  if (!r.o_updated_at) return undefined; // no override row for this job
  return {
    verdict: (r.o_verdict as Verdict | null) ?? null,
    reason: r.o_reason,
    ruleTag: r.o_rule_tag,
    updatedAt: r.o_updated_at,
  };
}

const parseList = (s: string | null): string[] => {
  if (!s) return [];
  try { const v = JSON.parse(s); return Array.isArray(v) ? v.map(String) : []; } catch { return []; }
};

function rowToFit(r: FitRow): FitScore | undefined {
  if (r.f_scored_at === null || r.f_score === null) return undefined;
  return {
    score: r.f_score,
    strengths: parseList(r.f_strengths),
    gaps: parseList(r.f_gaps),
    angle: r.f_angle ?? "",
    reason: r.f_reason ?? "",
    model: r.f_model ?? "",
    personaHash: r.f_persona_hash ?? "",
    scoredAt: r.f_scored_at,
  };
}

function rowToJob(r: JobRow): JobWithMeta {
  return {
    id: r.id,
    source: r.source,
    title: r.title ?? "",
    company: r.company ?? "",
    url: r.url ?? "",
    descriptionText: r.description ?? "",
    structuredLocation: r.location ?? undefined,
    structuredTimezone: r.timezone ?? undefined,
    postedAt: r.post_date ?? undefined,
    firstSeenAt: r.first_seen_at,
  };
}
function rowToClassification(r: ClassRow): Classification {
  return {
    workModel: (r.work_model ?? "unclear") as Classification["workModel"],
    locationRestriction: (r.location_restriction ?? "unclear") as Classification["locationRestriction"],
    evidence: r.evidence,
    timezoneRequirement: r.timezone_requirement,
    timezoneOverlapOk: r.timezone_overlap_ok === null ? null : r.timezone_overlap_ok === 1,
    verdict: r.verdict as Verdict,
    reason: r.reason ?? "",
    recruiterQuestion: r.recruiter_question,
  };
}

const externalId = (id: string) => id.slice(id.indexOf(":") + 1);

// ---- jobs ----

/** Bulk upsert. Keeps first_seen_at; refreshes last_fetched_at + fields; keeps the stored
 *  description when the incoming one is empty (LinkedIn cache-skip). Accepts an optional
 *  firstSeenAt per job (used by migration to preserve original timestamps). */
export function upsertJobs(jobs: (RawJob & { firstSeenAt?: string })[]): void {
  const now = new Date().toISOString();
  const stmt = db().prepare(`
    INSERT INTO jobs (id, source, external_id, title, company, url, description, location, timezone, post_date, first_seen_at, last_fetched_at)
    VALUES (@id, @source, @external_id, @title, @company, @url, @description, @location, @timezone, @post_date, @first_seen_at, @last_fetched_at)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title, company = excluded.company, url = excluded.url,
      description = CASE WHEN excluded.description IS NOT NULL AND excluded.description != ''
                        THEN excluded.description ELSE jobs.description END,
      location = excluded.location, timezone = excluded.timezone, post_date = excluded.post_date,
      last_fetched_at = excluded.last_fetched_at
  `);
  const tx = db().transaction((rows: (RawJob & { firstSeenAt?: string })[]) => {
    for (const j of rows) {
      stmt.run({
        id: j.id,
        source: j.source,
        external_id: externalId(j.id),
        title: j.title ?? null,
        company: j.company ?? null,
        url: j.url ?? null,
        description: j.descriptionText ?? null,
        location: j.structuredLocation ?? null,
        timezone: j.structuredTimezone ?? null,
        post_date: j.postedAt ?? null,
        first_seen_at: j.firstSeenAt ?? now,
        last_fetched_at: now,
      });
    }
  });
  tx(jobs);
}

export function allJobIds(): Set<string> {
  const rows = db().prepare(`SELECT id FROM jobs`).all() as { id: string }[];
  return new Set(rows.map((r) => r.id));
}

export function pruneJobsOlderThan(days: number): number {
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
  // Keep jobs with unknown post_date; drop those clearly older than the window.
  const info = db().prepare(`DELETE FROM jobs WHERE post_date IS NOT NULL AND post_date < ?`).run(cutoff);
  return info.changes;
}

export function allJobs(source?: string): JobWithMeta[] {
  const sql = source ? `SELECT * FROM jobs WHERE source = ?` : `SELECT * FROM jobs`;
  return (db().prepare(sql).all(...(source ? [source] : [])) as JobRow[]).map(rowToJob);
}

export function unclassifiedJobs(source?: string): JobWithMeta[] {
  const sql = `SELECT j.* FROM jobs j LEFT JOIN classifications c ON c.job_id = j.id
               WHERE c.job_id IS NULL${source ? " AND j.source = ?" : ""}`;
  const rows = db().prepare(sql).all(...(source ? [source] : [])) as JobRow[];
  return rows.map(rowToJob);
}

// ---- classifications ----

export function upsertClassification(jobId: string, c: Classification, method: ClassificationMethod): void {
  db()
    .prepare(`
      INSERT INTO classifications (job_id, verdict, reason, evidence, work_model, location_restriction,
        timezone_requirement, timezone_overlap_ok, recruiter_question, method, classified_at)
      VALUES (@job_id, @verdict, @reason, @evidence, @work_model, @location_restriction,
        @timezone_requirement, @timezone_overlap_ok, @recruiter_question, @method, @classified_at)
      ON CONFLICT(job_id) DO UPDATE SET
        verdict=excluded.verdict, reason=excluded.reason, evidence=excluded.evidence,
        work_model=excluded.work_model, location_restriction=excluded.location_restriction,
        timezone_requirement=excluded.timezone_requirement, timezone_overlap_ok=excluded.timezone_overlap_ok,
        recruiter_question=excluded.recruiter_question, method=excluded.method, classified_at=excluded.classified_at
    `)
    .run({
      job_id: jobId,
      verdict: c.verdict,
      reason: c.reason ?? null,
      evidence: c.evidence ?? null,
      work_model: c.workModel ?? null,
      location_restriction: c.locationRestriction ?? null,
      timezone_requirement: c.timezoneRequirement ?? null,
      timezone_overlap_ok: c.timezoneOverlapOk === null || c.timezoneOverlapOk === undefined ? null : c.timezoneOverlapOk ? 1 : 0,
      recruiter_question: c.recruiterQuestion ?? null,
      method,
      classified_at: new Date().toISOString(),
    });
}

/** Jobs that have a classification, joined with any human override. The optional
 *  `verdicts` filter applies to the EFFECTIVE verdict (the human's if set, else the LLM's). */
export function classifiedJobs(
  verdicts?: Verdict[],
): { job: JobWithMeta; classification: Classification; override?: JobOverride; fit?: FitScore }[] {
  const where = verdicts && verdicts.length
    ? `WHERE COALESCE(o.verdict, c.verdict) IN (${verdicts.map(() => "?").join(",")})`
    : "";
  const rows = db()
    .prepare(`SELECT j.*, c.verdict, c.reason, c.evidence, c.work_model, c.location_restriction,
                     c.timezone_requirement, c.timezone_overlap_ok, c.recruiter_question, c.method, c.classified_at,
                     o.verdict AS o_verdict, o.reason AS o_reason, o.rule_tag AS o_rule_tag, o.updated_at AS o_updated_at,
                     f.score AS f_score, f.strengths AS f_strengths, f.gaps AS f_gaps, f.angle AS f_angle,
                     f.reason AS f_reason, f.model AS f_model, f.persona_hash AS f_persona_hash, f.scored_at AS f_scored_at
              FROM jobs j
              JOIN classifications c ON c.job_id = j.id
              LEFT JOIN job_overrides o ON o.job_id = j.id
              LEFT JOIN fit_scores f ON f.job_id = j.id
              ${where}`)
    .all(...(verdicts ?? [])) as (JobRow & ClassRow & OverrideRow & FitRow)[];
  return rows.map((r) => ({
    job: rowToJob(r),
    classification: rowToClassification(r),
    override: rowToOverride(r),
    fit: rowToFit(r),
  }));
}

// ---- fit scores (never written by the classifier) ----

/** Upsert the role-fit score for a job. */
export function setFitScore(
  jobId: string,
  fit: Pick<FitScore, "score" | "strengths" | "gaps" | "angle" | "reason">,
  model: string,
  personaHash: string,
): void {
  db()
    .prepare(`
      INSERT INTO fit_scores (job_id, score, strengths, gaps, angle, reason, model, persona_hash, scored_at)
      VALUES (@job_id, @score, @strengths, @gaps, @angle, @reason, @model, @persona_hash, @scored_at)
      ON CONFLICT(job_id) DO UPDATE SET
        score = excluded.score, strengths = excluded.strengths, gaps = excluded.gaps,
        angle = excluded.angle, reason = excluded.reason, model = excluded.model,
        persona_hash = excluded.persona_hash, scored_at = excluded.scored_at
    `)
    .run({
      job_id: jobId,
      score: fit.score,
      strengths: JSON.stringify(fit.strengths),
      gaps: JSON.stringify(fit.gaps),
      angle: fit.angle,
      reason: fit.reason,
      model,
      persona_hash: personaHash,
      scored_at: new Date().toISOString(),
    });
}

/**
 * Jobs that still need scoring: effective verdict in `verdicts`, and either never scored or
 * scored against a DIFFERENT persona (so editing the CV/preferences marks scores stale).
 * `force` re-scores everything in scope. Ordered so PASS jobs are scored before MAYBE.
 */
export function unscoredJobs(
  verdicts: Verdict[],
  personaHash: string,
  opts: { force?: boolean; limit?: number } = {},
): JobWithMeta[] {
  const placeholders = verdicts.map(() => "?").join(",");
  const staleness = opts.force ? "" : `AND (f.job_id IS NULL OR f.persona_hash != ?)`;
  const limit = opts.limit ? `LIMIT ${Math.max(1, Math.floor(opts.limit))}` : "";
  const sql = `SELECT j.* FROM jobs j
               JOIN classifications c ON c.job_id = j.id
               LEFT JOIN job_overrides o ON o.job_id = j.id
               LEFT JOIN fit_scores f ON f.job_id = j.id
               WHERE COALESCE(o.verdict, c.verdict) IN (${placeholders}) ${staleness}
               ORDER BY CASE COALESCE(o.verdict, c.verdict) WHEN 'PASS' THEN 0 ELSE 1 END,
                        j.post_date DESC
               ${limit}`;
  const params: unknown[] = [...verdicts];
  if (!opts.force) params.push(personaHash);
  return (db().prepare(sql).all(...params) as JobRow[]).map(rowToJob);
}

// ---- human overrides (never written by the classifier) ----

export function jobExists(id: string): boolean {
  return !!db().prepare(`SELECT 1 FROM jobs WHERE id = ?`).get(id);
}

/** Upsert the human's edits for a job. */
export function setOverride(
  jobId: string,
  patch: { verdict?: Verdict | null; reason?: string | null; ruleTag?: string | null },
): void {
  db()
    .prepare(`
      INSERT INTO job_overrides (job_id, verdict, reason, rule_tag, updated_at)
      VALUES (@job_id, @verdict, @reason, @rule_tag, @updated_at)
      ON CONFLICT(job_id) DO UPDATE SET
        verdict = excluded.verdict, reason = excluded.reason,
        rule_tag = excluded.rule_tag, updated_at = excluded.updated_at
    `)
    .run({
      job_id: jobId,
      verdict: patch.verdict ?? null,
      reason: patch.reason ?? null,
      rule_tag: patch.ruleTag ?? null,
      updated_at: new Date().toISOString(),
    });
}

/** Drop the human's edits, reverting the job to the classifier's verdict. */
export function clearOverride(jobId: string): boolean {
  return db().prepare(`DELETE FROM job_overrides WHERE job_id = ?`).run(jobId).changes > 0;
}

/** Force-REJECT specific jobs as a human override (sticky across `classify --force`). */
export function forceReject(ids: string[]): { rejected: number; missing: string[] } {
  let rejected = 0;
  const missing: string[] = [];
  for (const id of ids) {
    if (jobExists(id)) {
      setOverride(id, { verdict: "REJECT", reason: "Manually rejected." });
      rejected++;
    } else {
      missing.push(id);
    }
  }
  return { rejected, missing };
}

export function counts(): { jobs: number; classifications: number; byVerdict: Record<string, number>; bySource: Record<string, number> } {
  const jobs = (db().prepare(`SELECT COUNT(*) n FROM jobs`).get() as { n: number }).n;
  const classifications = (db().prepare(`SELECT COUNT(*) n FROM classifications`).get() as { n: number }).n;
  // Tally the EFFECTIVE verdict so logs match what the digest shows.
  const byVerdict: Record<string, number> = {};
  for (const r of db().prepare(`SELECT COALESCE(o.verdict, c.verdict) AS v, COUNT(*) n
                                FROM classifications c LEFT JOIN job_overrides o ON o.job_id = c.job_id
                                GROUP BY v`).all() as { v: string; n: number }[])
    byVerdict[r.v] = r.n;
  const bySource: Record<string, number> = {};
  for (const r of db().prepare(`SELECT source, COUNT(*) n FROM jobs GROUP BY source`).all() as { source: string; n: number }[])
    bySource[r.source] = r.n;
  return { jobs, classifications, byVerdict, bySource };
}
