// Calibration fixtures for the ROLE-FIT scorer (`npm run jobs:score-test`).
//
// ┌─ HOW TO READ THIS FILE ────────────────────────────────────────────────────────────────┐
// │ NEITHER the candidate's first pass NOR the model's first pass is ground truth.          │
// │ `agreed` is. It was reached by discussing each disagreement. Both sides were wrong:     │
// │   • F8 (director, gaming) — the MODEL was right; the human missed it was senior         │
// │     leadership and scored it nearly twice as high.                                      │
// │   • F6 (hourly contract) — the HUMAN was right. The model had no compensation data.     │
// │   • F5 (crypto growth PM) — BOTH were off. The model found the "must have shipped       │
// │     crypto" blocker, printed it as the top gap, then under-weighted it and said 6.5.    │
// │                                                                                         │
// │ `notes` are the candidate's own words. They are a PARTIAL explanation, not a complete   │
// │ list of the factors he weighed. NEVER infer from an unmentioned factor that he did not  │
// │ care about it. (An earlier analysis did exactly that: it read F8's gaps, saw only       │
// │ "gaming domain", and wrongly concluded the seniority ladder was too harsh.)             │
// │                                                                                         │
// │ DO NOT OVER-FIT. Eight scores is a tiny sample, Opus 4.8 removed `temperature` so       │
// │ scores carry ~±0.5 noise, and the model's value includes catching what the human        │
// │ misses. Optimise RANK (Spearman); keep magnitude within noise. Stop tuning at MAE ~0.8. │
// └─────────────────────────────────────────────────────────────────────────────────────────┘
//
// Blind protocol: the human scored these without seeing the model's output, and vice versa.
//
// PRIVACY: this repo is public. Companies are described, not named, and the notes are candid
// opinions about real employers — so the mapping from `ref` to a real job posting lives in
// `fit-fixtures.local.ts` (gitignored). Nothing here should let a reader identify the company.
export interface FitFixture {
  /** Stable handle. The real job id is resolved via the gitignored local map. */
  ref: string;
  /** Anonymised: enough to judge the score, not enough to name the employer. */
  role: string;
  /** THE CALIBRATION TARGET. Agreed by discussion; not either party's first pass. */
  agreed: number;
  humanFirstPass: number;
  modelFirstPass: number;
  /** Why the agreed number differs from the first passes (or why it doesn't). */
  resolution: string;
  /** The candidate's raw notes. Partial — see the header. */
  notes: string;
}

export const fitFixtures: FitFixture[] = [
  {
    ref: "F1",
    role: "Product Manager — B2B SaaS marketplace, KPI/experimentation ownership, 3 yrs required",
    agreed: 9.5,
    humanFirstPass: 9.5,
    modelFirstPass: 8.5,
    resolution:
      "Undisputed (within the ±0.5 noise floor). KEY GUARD: the JD asks for only 3 years, and the " +
      "candidate explicitly forgave that ('given geography they will likely pay well'). A low " +
      "years-requirement must NOT be penalised — judge the scope, which here is KPI/experimentation " +
      "ownership.",
    notes:
      "Explicitly states measuring impact and KPIs, that's how I work. B2B SaaS marketplace. " +
      "Experimentation, data, UXR experience, startup env. Everything in how they frame the role resonates. " +
      "Might be somewhat junior (3 yrs) but given geography they will likely pay well, which translates " +
      "well to the local cost of living.",
  },
  {
    ref: "F2",
    role: "Technical Product Manager / Owner — AI, remote; AI expertise explicitly NOT required",
    agreed: 8.0,
    humanFirstPass: 8.0,
    modelFirstPass: 7.5,
    resolution:
      "Undisputed. KEY GUARD: the JD says AI expertise is explicitly NOT required (a nice-to-have). The " +
      "model listed it as a hard gap anyway. Required-vs-nice-to-have must be read from the JD's framing.",
    notes:
      "Tech-heavy role, my SW experience will shine. They explicitly say they don't require the candidate " +
      "to be an AI expert. My AI exp needs ramp-up but it's a strong nice-to-have, not a requirement. " +
      "Only short API-product experience (a few months). The 'You are' section strongly resonates.",
  },
  {
    ref: "F3",
    role: "Senior Product Manager — commerce operations; wants financial-systems fluency",
    agreed: 6.5,
    humanFirstPass: 6.5,
    modelFirstPass: 7.0,
    resolution: "Undisputed (within noise).",
    notes:
      "Experience level match. Important gaps on domain knowledge they explicitly call out: financial " +
      "systems fluency. I do have PIM systems experience though.",
  },
  {
    ref: "F4",
    role: "Product Manager — dev consultancy / fractional PM across portfolio startups",
    agreed: 7.0,
    humanFirstPass: 7.0,
    modelFirstPass: 6.5,
    resolution:
      "Undisputed on the number, but it surfaced a MISSING PERSONA FACT: the candidate dislikes the " +
      "consultancy 'mercenary' model and wants to own strategy inside one org long-term. Now encoded in " +
      "`engagement` (~-1.5). Also: execution-heavy roles with little strategy ownership should score lower.\n" +
      "Then it exposed TWO rubric bugs when those rules landed. (a) PENALTY STACKING: consultancy + " +
      "execution-heavy were each applied in full and the score collapsed to 4.0 — the human named the very " +
      "same two objections and still said 7.0. Soft penalties now cap at -2.5 combined. (b) CEILING " +
      "MISFIRE: the JD's non-negotiable is startup (1st-5th yr) product experience, which he HAS via his " +
      "early startup years; the model wrote 'lean on your startup days to clear it' and then capped him at " +
      "5.0 anyway. The ceiling now requires that he PLAINLY LACK the requirement. Lands ~5.5 — still 1.5 " +
      "light, but further tuning would be over-fitting one fixture.",
    notes:
      "Requirements clearly match my skills; no real gaps. But the role indexes a lot on execution and " +
      "little on product strategy. Also seems to be a consultancy firm, not my first choice — I'd much " +
      "rather own product strategy within an organisation long-term than the 'mercenary' consultancy aspect.",
  },
  {
    ref: "F5",
    role: "Product Manager, New User Growth — crypto exchange; MUST have shipped a crypto/Web3 product",
    agreed: 3.5,
    humanFirstPass: 4.5,
    modelFirstPass: 6.5,
    resolution:
      "BOTH were off. The model DID identify the explicit 'must have shipped crypto/Web3 product' as its " +
      "top gap — then scored 6.5 anyway. Naming a blocker is not enough; it has to move the number. The " +
      "human penalised the junior scope ('they mention not needing Senior PMs') but under-weighted the " +
      "crypto MUST. Two stacked hard blockers → 3.5. This fixture is why the HARD-REQUIREMENT CEILING exists.",
    notes:
      "Most requirements I meet and excel in; I'm actually more senior than the role suggests. Domain gap " +
      "on crypto and Web3, little experience with money-related regulations. Might be too junior: they " +
      "mention not needing Senior PMs.",
  },
  {
    ref: "F6",
    role: "Product Manager (remote) — hourly contract evaluating AI-generated PM artifacts; rate stated well above the strong threshold",
    agreed: 7.5,
    humanFirstPass: 7.5,
    modelFirstPass: 5.0,
    resolution:
      "The HUMAN was right; the model lacked a FACT, not a rule. He rated it high because the stated rate " +
      "annualises to well above his 'strong' threshold, which outweighs the contract setup given his cost " +
      "of living. The model had no concept of compensation or purchasing power. A proposed rule capping " +
      "contract/associate roles at 5.0 would have made this WORSE — the fix was `compensation` in the persona.\n" +
      "Adding `compensation` alone did NOT fix it: the JD quotes an HOURLY rate, and a rubric that only " +
      "understood annual salaries read that as 'no pay stated' and scored 4.0. The persona now tells the " +
      "model to ANNUALIZE hourly/daily/monthly rates first (rate x 1,800 hrs, less ~20% for a contract). " +
      "That single fact moved it 4.0 -> 6.5. It is the same arithmetic the human did in his head.\n" +
      "(Note: this JD is posted 3x under different board ids; the scorer now dedupes by identical description.)",
    notes:
      "Meet all requirements stated. The JD is not very informative for assessing fit, and contractor " +
      "per-project is not the best setup. But it pays really well — my math puts it comfortably above my " +
      "strong threshold.",
  },
  {
    ref: "F7",
    role: "Junior Product Manager — ecommerce search/discovery; execution support under senior PMs",
    agreed: 3.0,
    humanFirstPass: 3.0,
    modelFirstPass: 2.5,
    resolution:
      "Undisputed. Junior SCOPE (execution support under senior PMs) is the penalty — not the year-count. " +
      "Contrast with F1, which also asks few years but owns strategy. " +
      "NOTE: the source board mislabels the company. The scorer read the JD and ignored the bad label, " +
      "which is correct.",
    notes: "Waaay too junior.",
  },
  {
    ref: "F8",
    role: "Director of Product, Gaming — 5+ yrs managing cross-disciplinary teams, 5+ yrs gaming domain",
    agreed: 2.0,
    humanFirstPass: 4.0,
    modelFirstPass: 2.0,
    resolution:
      "THE MODEL WAS RIGHT. The human initially gave 4.0 having missed that this is a senior-leadership " +
      "role (5+ yrs managing cross-disciplinary teams), then revised to 2.0. Two hard blockers: people " +
      "leadership he has never done, and 5+ yrs of a domain he has none of. This fixture is the standing " +
      "warning against tuning the rubric to reproduce the human's numbers — here his number was the wrong one.",
    notes:
      "Very explicit and strong on domain knowledge, asking for 5 years of experience. I have 0. " +
      "[Later: 'I totally missed the role was for senior leadership. You were right to penalize harder.']",
  },
];
