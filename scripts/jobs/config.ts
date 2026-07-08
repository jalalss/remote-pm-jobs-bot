// Central configuration for the job bot. Tweak these to recalibrate v1.

export const config = {
  /** Candidate is in Bangkok. UTC+7. Used by the classifier for overlap reasoning. */
  userUtcOffset: 7,
  /** Minimum acceptable overlap (hours) between a stated timezone and UTC+7. */
  minTimezoneOverlapHours: 4,

  /** Drop postings older than this many days before classifying. */
  maxAgeDays: 90,

  /**
   * Role gate (see titleMatchesRole below). Case-insensitive substring match.
   * IC terms always match — substring matching covers Senior/Lead/Group/Principal/
   * Staff/Technical Product Manager and Technical Product Owner too.
   */
  icRoleTerms: ["product manager", "product owner", "product management"],
  /**
   * Product-leadership titles. These match UNLESS an adjacent-discipline word is
   * present, so "Head of Product" passes but "Head of Product Marketing" / "Director
   * of Product Design" do not.
   */
  leadershipRoleTerms: [
    "head of product",
    "director of product",
    "vp product",
    "vp of product",
    "vice president of product",
    "product lead",
    "chief product officer",
  ],
  /** Veto words that disqualify a LEADERSHIP match (adjacent, non-PM disciplines). */
  adjacentDisciplines: ["marketing", "design", "sales"],

  /** Anthropic model for classification. Haiku 4.5 is cheap, fast, and supports structured outputs. */
  model: "claude-haiku-4-5",

  /**
   * Safety ceiling on listings pulled per source — NOT a real constraint. Each source
   * caps itself (Remote OK ~100/tag, WWR ~23, Remotive ~28, Himalayas by page count).
   * Real cost control is the role + recency gates and himalayasPagesPerQuery.
   */
  perSourceLimit: 500,

  /**
   * Himalayas is search-first: query each of these role terms against its search API
   * (distinct result sets per term), paginate himalayasPagesPerQuery pages each, dedupe.
   */
  himalayasQueries: [
    "product manager",
    "product owner",
    "technical product manager",
    "head of product",
    "director of product",
  ],
  himalayasPagesPerQuery: 5,

  /**
   * Remote OK PM tags. `product-manager` is the precise PM tag; `product` adds 0
   * net-new IC PMs but DOES carry product-leadership roles (VP Product, Product Lead)
   * that the leadership gate now wants — so it earns its place. (Verified: product-owner
   * / head-of-product / product-management tags all return zero.)
   */
  remoteOkTags: ["product-manager", "product"],

  /**
   * We Work Remotely category RSS slugs. WWR has no search feed AND miscategorizes
   * PM roles (e.g. a Staff PM filed under Full-Stack Programming), so we union all
   * categories and let the role gate filter. Enumerated from WWR's homepage.
   */
  wwrCategories: [
    "remote-full-stack-programming-jobs",
    "remote-front-end-programming-jobs",
    "remote-back-end-programming-jobs",
    "remote-design-jobs",
    "remote-devops-sysadmin-jobs",
    "remote-management-and-finance-jobs",
    "remote-product-jobs",
    "remote-customer-support-jobs",
    "remote-sales-and-marketing-jobs",
    "all-other-remote-jobs",
  ],

  /**
   * LinkedIn (public guest endpoints). LinkedIn's search is non-deterministic — the same
   * query returns varying partial subsets — so we REPEAT each search and UNION the results
   * until it plateaus. LinkedIn also has no "worldwide" location, so searches are segmented
   * by region (geoId). We rely on OUR classifier (not LinkedIn's f_WT) to decide remote.
   *
   * geoId cheatsheet: European Union 91000000 · United States 103644278 · United Kingdom
   * 101165590 · Germany 101282230 · Spain 105646813 · Canada 101174742 · India 102713980.
   * f_WT: 2=Remote. f_TPR: r604800=past 7 days.
   */
  linkedinSearches: [
    { keywords: '"product manager"', geoId: "91000000", f_WT: "2", f_TPR: "r604800" },  // EU · Remote · 7d
    { keywords: '"product manager"', geoId: "103644278", f_WT: "2", f_TPR: "r604800" }, // US · Remote · 7d
    { keywords: '"product manager"', geoId: "101165590", f_WT: "2", f_TPR: "r604800" }, // UK · Remote · 7d
  ] as { keywords: string; geoId: string; f_WT?: string; f_TPR?: string }[],
  /** Repeat each search up to this many times (union), stopping early once it plateaus. */
  linkedinRepeats: 10,
  /** Stop repeating a search after this many consecutive iterations add zero new jobs. */
  linkedinPlateauStreak: 3,
  /** Max result pages per single search iteration (each page ~10 cards). */
  linkedinMaxPagesPerQuery: 8,
  /** Hard ceiling on unique LinkedIn jobs per run (keeps JD fetches + cost bounded). */
  linkedinMaxJobs: 1000,
  /** Polite delay (ms) between LinkedIn requests. */
  linkedinRequestDelayMs: 500,
  /** Browser-like UA — LinkedIn 999-blocks obvious bot UAs. */
  linkedinUserAgent:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",

  /** Output digest path (relative to repo root). */
  outputPath: "jobs-digest.html",
  /** SQLite database path (jobs + classifications tables), gitignored. */
  dbPath: ".jobs.db",
  /** Legacy JSON paths — only read by `jobs:migrate` to import into the DB. */
  cachePath: ".job-cache.json",
  rawStorePath: ".jobs-raw.json",
  /** A job renders with a NEW badge if first seen within this many hours. */
  newBadgeHours: 24,
} as const;

/**
 * True if a title passes the role gate.
 * - IC PM titles always match (they bypass the veto — "Product Manager, Marketing" is
 *   still a real PM role).
 * - Leadership titles match only when no adjacent-discipline word is present.
 */
export function titleMatchesRole(title: string): boolean {
  const t = title.toLowerCase();
  if (config.icRoleTerms.some((term) => t.includes(term))) return true;
  if (config.leadershipRoleTerms.some((term) => t.includes(term))) {
    return !config.adjacentDisciplines.some((word) => t.includes(word));
  }
  return false;
}
