// TEMPLATE for the candidate persona. Copy to `candidate.local.ts` (gitignored) and fill in.
//
//     cp scripts/jobs/candidate.example.ts scripts/jobs/candidate.local.ts
//
// The persona is the single source of truth about the candidate — the fit scorer, the
// screen-remote-jobs skill, and any cover-letter tooling all read it, so they can't drift.
// Keep it to about one page of decision-relevant signal: it rides in the prompt on EVERY
// scored job, so an autobiography costs tokens and dilutes the signal.
//
// Everything below is fictional placeholder data, matching the placeholder resume.ts.
import { resume } from "../../src/data/resume.js";
import type { Candidate } from "./candidate.js";

export const candidate: Candidate = {
  // Tier 1 — on the CV. A recruiter can verify it. Quote freely.
  cv: resume,

  // Tier 2 — demonstrable and linkable, but NOT on the CV. Quote freely AND cite the link.
  // This is where side projects, open-source work, and portfolio artifacts belong. They are
  // often the strongest evidence for a requirement the CV never mentions.
  evidence: [
    {
      what: "Describe an artifact you built, concretely enough that a hiring manager can judge it.",
      link: "https://github.com/example/your-project",
      proves: ["a job requirement this demonstrates", "another one"],
    },
  ],

  // Tier 3 — true, but the one-page CV doesn't show it (or shows something misleading).
  // These SHAPE the score. They must be rephrased via `claimableAs` before anything an
  // employer reads, so a recruiter never sees a claim the CV appears to contradict.
  stated: [
    {
      fact: "A true fact about you that the CV omits or understates.",
      claimableAs: "The same point, phrased so the CV alone supports it.",
    },
  ],

  preferences: {
    wants: ["domains you actively want"],
    avoids: ["domains you'd rather not"],
    productSurface: ["growth/funnel", "platform/API", "marketplace"],
    companyStage: ["scale-up"],
    dealbreakers: ["things that rule a role out regardless of fit"],
  },

  // Pay, and what it buys where you live. Without this the scorer cannot tell a well-paid
  // contract from a badly-paid one, and will under-rate the former.
  compensation: {
    floorUsd: 0,
    strongUsd: 0,
    context: "Where you live and what a given salary is worth there.",
  },

  // Employment shape — separate from seniority.
  engagement: {
    prefers: ["permanent, one organisation, long-term ownership"],
    dislikes: [{ what: "consultancy / agency / fractional", penalty: "moderate (~-1.5)" }],
  },

  // Fit is about what the role ACTUALLY entails, not its title. Spell out the ladder.
  seniorityLadder: {
    guidance: `
Senior / Staff / Principal PM (IC): best fit.
"Lead / Group PM" that is senior-IC scope with no direct reports: strong fit.
"Lead / Group PM" that means managing PMs (direct reports, hiring, perf reviews): a stretch — score down.
Head of Product / Director: well above current experience.
VP Product / CPO: effectively a non-starter.
Read the JD for what the role entails; do not pattern-match the title.
`.trim(),
  },

  // Factors the scorer must NOT weigh — they are settled elsewhere in the pipeline.
  excludeFromScoring: ["work authorization", "citizenship", "visa"],
};
