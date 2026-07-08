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

/** A job plus its classification, ready to render. */
export interface ClassifiedJob extends RawJob {
  classification: Classification;
  /** True if this job wasn't in the cache on a previous run. */
  isNew: boolean;
}
