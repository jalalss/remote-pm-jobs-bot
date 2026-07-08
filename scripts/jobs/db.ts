// SQLite data-access layer (better-sqlite3). Two tables: jobs + classifications (1:1).
// Replaces the JSON store/cache; each pipeline stage queries only what it needs.
import Database from "better-sqlite3";
import { config } from "./config.js";
import type { Classification, RawJob, Verdict } from "./types.js";

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
      title TEXT, company TEXT, url TEXT, description TEXT, location TEXT,
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
    CREATE INDEX IF NOT EXISTS idx_class_verdict ON classifications(verdict);
    CREATE INDEX IF NOT EXISTS idx_jobs_source ON jobs(source);
  `);
  return _db;
}

// ---- row <-> domain mapping ----

interface JobRow {
  id: string; source: string; external_id: string | null;
  title: string | null; company: string | null; url: string | null;
  description: string | null; location: string | null; post_date: string | null;
  first_seen_at: string; last_fetched_at: string;
}
interface ClassRow {
  verdict: string; reason: string | null; evidence: string | null;
  work_model: string | null; location_restriction: string | null;
  timezone_requirement: string | null; timezone_overlap_ok: number | null;
  recruiter_question: string | null; method: string; classified_at: string;
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
    INSERT INTO jobs (id, source, external_id, title, company, url, description, location, post_date, first_seen_at, last_fetched_at)
    VALUES (@id, @source, @external_id, @title, @company, @url, @description, @location, @post_date, @first_seen_at, @last_fetched_at)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title, company = excluded.company, url = excluded.url,
      description = CASE WHEN excluded.description IS NOT NULL AND excluded.description != ''
                        THEN excluded.description ELSE jobs.description END,
      location = excluded.location, post_date = excluded.post_date,
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

export function allJobs(): JobWithMeta[] {
  return (db().prepare(`SELECT * FROM jobs`).all() as JobRow[]).map(rowToJob);
}

export function unclassifiedJobs(): JobWithMeta[] {
  const rows = db()
    .prepare(`SELECT j.* FROM jobs j LEFT JOIN classifications c ON c.job_id = j.id WHERE c.job_id IS NULL`)
    .all() as JobRow[];
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

/** Jobs that have a classification, joined. Optionally filtered to specific verdicts. */
export function classifiedJobs(verdicts?: Verdict[]): { job: JobWithMeta; classification: Classification }[] {
  const where = verdicts && verdicts.length ? `WHERE c.verdict IN (${verdicts.map(() => "?").join(",")})` : "";
  const rows = db()
    .prepare(`SELECT j.*, c.verdict, c.reason, c.evidence, c.work_model, c.location_restriction,
                     c.timezone_requirement, c.timezone_overlap_ok, c.recruiter_question, c.method, c.classified_at
              FROM jobs j JOIN classifications c ON c.job_id = j.id ${where}`)
    .all(...(verdicts ?? [])) as (JobRow & ClassRow)[];
  return rows.map((r) => ({ job: rowToJob(r), classification: rowToClassification(r) }));
}

/** Force-REJECT specific jobs (method='manual'). Skips ids with no job row. */
export function forceReject(ids: string[]): { rejected: number; missing: string[] } {
  const exists = db().prepare(`SELECT 1 FROM jobs WHERE id = ?`);
  const rejection: Classification = {
    workModel: "unclear", locationRestriction: "unclear", evidence: null,
    timezoneRequirement: null, timezoneOverlapOk: null, verdict: "REJECT",
    reason: "Manually rejected.", recruiterQuestion: null,
  };
  let rejected = 0;
  const missing: string[] = [];
  for (const id of ids) {
    if (exists.get(id)) {
      upsertClassification(id, rejection, "manual");
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
  const byVerdict: Record<string, number> = {};
  for (const r of db().prepare(`SELECT verdict, COUNT(*) n FROM classifications GROUP BY verdict`).all() as { verdict: string; n: number }[])
    byVerdict[r.verdict] = r.n;
  const bySource: Record<string, number> = {};
  for (const r of db().prepare(`SELECT source, COUNT(*) n FROM jobs GROUP BY source`).all() as { source: string; n: number }[])
    bySource[r.source] = r.n;
  return { jobs, classifications, byVerdict, bySource };
}
