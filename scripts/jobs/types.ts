// Shared types for the remote-PM job-filtering bot.

/** A job listing normalized across all sources, before classification. */
export interface RawJob {
  /** Stable dedupe key: `${source}:${externalId or url}`. */
  id: string;
  source: string;
  title: string;
  company: string;
  url: string;
  /** Description as plain text (HTML stripped). */
  descriptionText: string;
  /** Any structured location hint the source provides (e.g. Remotive's candidate_required_location). */
  structuredLocation?: string;
  /** Any structured timezone hint the source provides (e.g. Himalayas timezoneRestrictions). */
  structuredTimezone?: string;
  /** ISO date string when the job was posted, if the source provides it. */
  postedAt?: string;
}

export type Verdict = "PASS" | "MAYBE" | "REJECT";

/** The classifier's structured judgement for a single job. */
export interface Classification {
  workModel: "remote" | "hybrid" | "onsite" | "unclear";
  locationRestriction:
    | "none"
    | "worldwide"
    | "country-list"
    | "region"
    | "single-country"
    | "unclear";
  /** Exact, unaltered quote from the JD that drove the verdict (or null). */
  evidence: string | null;
  /** Stated timezone requirement, verbatim, or null. */
  timezoneRequirement: string | null;
  /** Whether the stated timezone overlaps enough with UTC+7 (null if not stated). */
  timezoneOverlapOk: boolean | null;
  verdict: Verdict;
  /** One-sentence reason for the verdict. */
  reason: string;
  /** Suggested recruiter question for MAYBE jobs, else null. */
  recruiterQuestion: string | null;
}

/**
 * A human edit for a job. Stored separately from `Classification` so it survives
 * `classify --force` and so the classifier's own verdict stays visible next to it.
 * Future attributes (e.g. a Viewed/Applied `status`) belong here too.
 */
export interface JobOverride {
  /** Human verdict; null means "no verdict override" (only other attributes were edited). */
  verdict: Verdict | null;
  /** Why the human disagreed with the classifier. */
  reason: string | null;
  /** Which rubric rule misfired (see config.ruleTags), or null. */
  ruleTag: string | null;
  updatedAt: string;
}

/**
 * How well this role fits the candidate (0–10). Answers "is this worth applying to?",
 * whereas `Classification` answers "can I even take it from Thailand?".
 * Stored in its own table so `classify --force` can never destroy it.
 */
export interface FitScore {
  /** 0.0–10.0. Higher = better fit. */
  score: number;
  /** 2–3 things to lead with in the application. */
  strengths: string[];
  /** 2–3 gaps to expect / prepare for. */
  gaps: string[];
  /** One line on how to pitch himself for this role. Cover-letter seed. */
  angle: string;
  /** One sentence justifying the score. */
  reason: string;
  model: string;
  /** Persona hash at scoring time — a mismatch means the score is stale. */
  personaHash: string;
  scoredAt: string;
}

/**
 * Where a job sits in the application funnel. Set by hand, one click per transition.
 *
 * NOTE there is no `ghosted` here: that state is DERIVED (status is `applied` and
 * `config.ghostedAfterDays` have passed with no reply), never stored. See `Application`.
 */
export type ApplicationStatus = "shortlisted" | "applied" | "interview" | "rejected";

/**
 * The candidate's current position in the funnel for one job, folded up from the
 * append-only `application_events` log.
 *
 * Every transition is its own immutable row, so a job that goes applied → interview →
 * rejected keeps ALL THREE timestamps — the rejection never overwrites the interview.
 * That is what makes response-latency analytics possible after the fact.
 */
export interface Application {
  /** The latest event's status. */
  status: ApplicationStatus;
  /** Note on the latest event, if any. */
  note: string | null;
  /** FIRST time this job entered `applied`. Undefined if it never has. Drives `ghosted`. */
  appliedAt?: string;
  /** When the current status was set. */
  statusAt: string;
}

/** A job plus its classification, ready to render. */
export interface ClassifiedJob extends RawJob {
  classification: Classification;
  /** Human edit, if any. Its verdict wins over `classification.verdict` when set. */
  override?: JobOverride;
  /** Role-fit score, if the job has been scored. */
  fit?: FitScore;
  /** Funnel status, if the candidate has acted on this job. */
  application?: Application;
  /** True if this job wasn't in the cache on a previous run. */
  isNew: boolean;
}

/** The verdict to display/filter on: the human's if they set one, else the classifier's. */
export function effectiveVerdict(job: {
  classification: Classification;
  override?: JobOverride;
}): Verdict {
  return job.override?.verdict ?? job.classification.verdict;
}
