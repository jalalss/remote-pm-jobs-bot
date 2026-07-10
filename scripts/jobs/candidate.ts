// The candidate PERSONA — the single canonical source of truth about the candidate.
//
// WHY THIS EXISTS: facts about the candidate are scattered. Some are on the one-page CV,
// some were told to Claude in conversation, some are only demonstrable by artifacts he has
// built. Without one canonical file, each consumer (the fit scorer, the screen-remote-jobs
// skill, any future cover-letter writer) reads a different subset and produces a different,
// partly-wrong picture of him. Everything reads THIS.
//
// Facts are split into three tiers by PROVENANCE, because that determines how they may be used:
//   cv       — on the one-page CV. A recruiter can verify it. Quote freely.
//   evidence — demonstrable and linkable, but NOT on the CV. Quote freely AND cite the link.
//   stated   — true, told by the candidate, currently unsubstantiated by the CV. It informs the
//              JUDGEMENT (the score, what to emphasise) but must be rephrased into CV-supported
//              wording before it appears in anything an employer will read.
//
// The real persona lives in `candidate.local.ts`, which is GITIGNORED — this repo is public and
// ships a placeholder CV. See `candidate.example.ts` for the shape.
import type { resume as Resume } from "../../src/data/resume.js";

/** Something the candidate can point an employer at. Not on the CV, but provable. */
export interface Evidence {
  what: string;
  /** Public URL a recruiter can open. */
  link: string;
  /** Job requirements this artifact demonstrates (e.g. "AI fluency"). */
  proves: string[];
}

/** True, but the one-page CV doesn't show it (or shows something misleading). */
export interface StatedFact {
  fact: string;
  /** How to say it in a way the CV alone supports. Never quote `fact` verbatim to an employer. */
  claimableAs: string;
}

export interface Preferences {
  /** Domains/industries he actively wants. */
  wants: string[];
  /** Domains/industries he'd rather avoid. */
  avoids: string[];
  /** Kinds of product work he's strongest at / enjoys. */
  productSurface: string[];
  /** Company stage: e.g. "scale-up", "big tech", "early startup". */
  companyStage: string[];
  /** Things that make a role a non-starter regardless of fit. */
  dealbreakers: string[];
}

/**
 * Pay, and what it's worth where he lives. Added after calibration: the scorer rated a
 * well-paid contract 5.0 while the human rated it 7.5, purely because it had no concept of
 * compensation or purchasing power.
 */
export interface Compensation {
  /** Stated pay below this is a dealbreaker. */
  floorUsd: number;
  /** Stated pay at or above this is a real positive that can offset structural negatives. */
  strongUsd: number;
  /** Free-text context for the scorer (cost of living, currency, etc.). */
  context: string;
}

/** Employment shape he wants — distinct from seniority. */
export interface Engagement {
  prefers: string[];
  /** Shapes he dislikes, with how hard each should count. */
  dislikes: { what: string; penalty: string }[];
}

/** How well each role shape fits — driven by PEOPLE-MANAGEMENT, not by job title. */
export interface SeniorityLadder {
  /** 0.0–1.0 multiplier-ish guidance the scorer reads as prose. */
  guidance: string;
}

export interface Candidate {
  cv: typeof Resume;
  evidence: Evidence[];
  stated: StatedFact[];
  preferences: Preferences;
  compensation: Compensation;
  engagement: Engagement;
  seniorityLadder: SeniorityLadder;
  /** Named factors the scorer is FORBIDDEN to weigh (already settled upstream). */
  excludeFromScoring: string[];
}

const MISSING = `
Candidate persona not found: scripts/jobs/candidate.local.ts

This file is gitignored because it contains real personal data and this repo is public.
Copy the template and fill it in:

    cp scripts/jobs/candidate.example.ts scripts/jobs/candidate.local.ts

It also expects your real CV at src/data/resume.local.ts (the tracked resume.ts is a placeholder).
`.trim();

/** Load the persona, or fail with an actionable message (public clones have no CV). */
export async function loadCandidate(): Promise<Candidate> {
  try {
    const mod = await import("./candidate.local.js");
    return mod.candidate as Candidate;
  } catch {
    throw new Error(MISSING);
  }
}

/**
 * Stable hash of the persona. Editing it invalidates existing fit scores.
 *
 * EVERY field that can move a score must be hashed here, or an edit to it leaves stale scores
 * looking fresh. `compensation` and `engagement` were originally omitted — adding pay thresholds
 * moved one calibration fixture by 2.5 points while its stored score still read as current.
 */
export function personaHash(c: Candidate): string {
  const material = JSON.stringify({
    cv: c.cv,
    evidence: c.evidence,
    stated: c.stated,
    preferences: c.preferences,
    compensation: c.compensation,
    engagement: c.engagement,
    seniorityLadder: c.seniorityLadder,
  });
  // Tiny non-crypto hash — we only need change detection, not security.
  let h = 0;
  for (let i = 0; i < material.length; i++) h = (Math.imul(31, h) + material.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16).padStart(8, "0");
}
