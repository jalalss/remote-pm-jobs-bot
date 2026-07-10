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

/** A job plus its classification, ready to render. */
export interface ClassifiedJob extends RawJob {
  classification: Classification;
  /** Human edit, if any. Its verdict wins over `classification.verdict` when set. */
  override?: JobOverride;
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
