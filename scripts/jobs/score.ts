// Role-fit scorer. The classifier asks "can I take this job from Thailand?"; this asks
// "is it worth applying to?" — a 0–10 fit score plus the raw material for a cover letter.
//
// Reads the candidate PERSONA (scripts/jobs/candidate.local.ts), which is the single source of
// truth about the candidate. Facts carry provenance, and that governs how they may be used:
//   cv       → recruiter can verify it → quote freely
//   evidence → provable + linkable, not on the CV → quote freely AND cite the link
//   stated   → true but the CV doesn't show it → shapes the SCORE; must be rephrased via
//              `claimableAs` before it appears in anything an employer reads
//
// API notes (verified, not remembered): Opus 4.8 REMOVED `temperature` (sending it 400s), and
// omitting `thinking` runs with thinking OFF — so adaptive thinking is set explicitly.
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { config } from "./config.js";
import type { Candidate } from "./candidate.js";
import type { FitScore, RawJob } from "./types.js";

export const FitSchema = z.object({
  score: z.number().min(0).max(10).describe("Role fit, 0.0–10.0. One decimal place."),
  strengths: z
    .array(z.string())
    .describe(
      "2–3 concrete reasons this role scores as high as it does. Evidence-backed, CV-defensible wording.",
    ),
  gaps: z
    .array(z.string())
    .describe(
      "1–3 things that actually pulled the score DOWN. Never unknowns or things to verify. May be empty.",
    ),
  angle: z
    .string()
    .describe("One line on how to pitch himself for THIS role. Must be usable verbatim in a cover letter."),
  reason: z.string().describe("One sentence justifying the score."),
});

/** Render the persona into the (stable, cacheable) system prompt. */
function personaPrompt(c: Candidate): string {
  const cv = c.cv;
  const roles = cv.experience
    .filter((e) => !e.isBreak)
    .map((e) => {
      const rs = e.roles
        .map((r) => `    - ${r.title} (${r.start}–${r.end}, ${r.duration})\n${r.highlights.map((h) => `        • ${h}`).join("\n")}`)
        .join("\n");
      return `  ${e.company} — ${e.location} (${e.totalDuration})\n${rs}`;
    })
    .join("\n");

  const skills = Object.entries(cv.skills)
    .map(([k, v]) => `  ${k}: ${(v as string[]).join(", ")}`)
    .join("\n");

  const evidence = c.evidence
    .map((e) => `  - ${e.what}\n    Link: ${e.link}\n    Proves: ${e.proves.join("; ")}`)
    .join("\n");

  const stated = c.stated
    .map((s) => `  - FACT (judgement only): ${s.fact}\n    SAY IT AS: ${s.claimableAs}`)
    .join("\n");

  const p = c.preferences;
  const list = (xs: string[]) => (xs.length ? xs.join(", ") : "(none specified)");
  const dislikes = c.engagement.dislikes.map((d) => `  - ${d.what} → ${d.penalty}`).join("\n");

  return `# The candidate

${cv.name} — ${cv.title}, based in ${cv.location}.
${cv.bio}

## TIER 1 — On the CV (a recruiter can verify this; quote freely)
${roles}

Skills:
${skills}

Education: ${cv.education.map((e) => `${e.degree}, ${e.institution} (${e.end})`).join(" | ")}
Languages: ${cv.languages.map((l) => `${l.name} (${l.level})`).join(", ")}

## TIER 2 — Evidence: provable and linkable, but NOT on the CV (quote freely, and cite the link)
${evidence}

## TIER 3 — Stated: true, but the one-page CV does not show it
These inform your JUDGEMENT (the score, and what to emphasise). Do NOT quote the FACT verbatim in
\`strengths\` or \`angle\` — a recruiter reading the CV would see an apparent contradiction. Use the
"SAY IT AS" phrasing instead.
${stated}

## Preferences
  Wants: ${list(p.wants)}
  Avoids: ${list(p.avoids)}
  Strongest product surfaces: ${list(p.productSurface)}
  Company stage: ${list(p.companyStage)}
  Dealbreakers: ${list(p.dealbreakers)}

## Compensation
${c.compensation.context}

## Engagement model — what employment shape he wants (separate from seniority)
  Prefers: ${list(c.engagement.prefers)}
  Dislikes:
${dislikes}

## Seniority — judge what the role ACTUALLY entails, not its title
${c.seniorityLadder.guidance}`;
}

function systemPrompt(c: Candidate): string {
  return `You score how well a job posting fits a specific candidate. Output a structured judgement.

${personaPrompt(c)}

# Your task

Score this role 0.0–10.0 for FIT — how good a match it is for HIM, and how likely he is to be taken
seriously for it. Seniority is part of fit: a role well above his experience scores low even if the
domain is perfect.

## Scale
- 9–10  Excellent. Domain, product surface and seniority all line up; he'd be a strong candidate and would want it.
- 7–8   Good. Clear overlap, minor gaps.
- 5–6   Plausible. Real overlap but a notable mismatch in domain, surface, or level.
- 3–4   Weak. Significant seniority or domain mismatch.
- 0–2   Near non-starter (e.g. VP/CPO, or a different discipline entirely).

## CEILINGS — apply these BEFORE anything else, they cap the final score

- **A stated NON-NEGOTIABLE he plainly lacks caps the score at ~5.0, and usually lands 3–4.**
  If the JD says a requirement is a "must", "required", "non-negotiable", or "you must have shipped X",
  and he has not done X, no amount of overlap elsewhere rescues it. Identifying the blocker in \`gaps\` is
  NOT enough — it has to move the number. (Calibration miss: a JD demanded shipped crypto/Web3 product;
  the model correctly named it the top gap and then still scored 6.5. It should have been ~3.5.)

  **"Plainly lacks" is a strict test — apply it before you apply the ceiling.** Search his CV, evidence
  and stated facts for anything that substantiates the requirement. If ANY of it does, even partially or
  only via an earlier role, he does NOT plainly lack it: this is a framing problem, not a blocker. Say so
  in \`gaps\` ("lead with your early startup years to clear this") and take **no ceiling at all** — at most a
  small deduction. Only an outright absence of evidence triggers the ceiling.
  If you catch yourself writing "lean on X to clear it", you have just proved the ceiling does not apply.
  (Calibration miss: a JD required startup experience and discounted large-corporation product work; the
  model noted he could clear it with his early startup years, then capped him at 5.0 regardless. He has
  that experience — it should have been ~7.0.)
- **Junior SCOPE caps the score at ~4.0.** Scope means: execution support, working under senior PMs,
  organising tickets, "we don't need senior PMs for this", no roadmap or strategy ownership.
- **A dealbreaker** (see Preferences) caps the score at ~2.0.

### Years-required is NOT junior scope
A low years-of-experience requirement (e.g. "3+ years") is only a WEAK hint that the level or pay might be
junior. It is overridden by strong role framing (owns KPIs, experimentation, strategy) or good stated pay.
Do NOT deduct for a low year-count on its own — judge the SCOPE.

## SOFT PENALTIES DO NOT STACK — cap the total at −2.5
The engagement, strategy-vs-execution and preference penalties (factors 7–10) describe overlapping
discomfort with the SAME kind of role, so applying them additively double- and triple-counts one
objection. Decide the score on merit first, then subtract **at most −2.5 in total** for all of them
combined. These are soft deductions, not ceilings — a role he could do well, that pays well, stays in
the 7s even if it is a contract, execution-leaning, and at an agency.
(Calibration miss: a consultancy role the candidate scored 7.0 — naming the very same objections — collapsed
to 4.0 because consultancy, execution-heavy and weak-domain penalties were each applied in full.)

Only the CEILINGS above are hard. Nothing in factors 6–10 is a ceiling.

## REQUIRED vs NICE-TO-HAVE — read the JD's own framing
Before you call something a gap, check how the JD frames it. "Preferred", "nice to have", "bonus", or an
explicit "you do not need to be an expert in X" must NOT be weighted like a hard requirement. (Calibration
miss: a JD said AI expertise was explicitly not required; the model scored the AI gap as if it were.)
Put genuine hard requirements he lacks first in \`gaps\`; mention soft ones only briefly, or not at all.

## What drives the score
1. **Seniority shape** — the single biggest factor. Read the JD for direct reports / hiring / managing
   PMs versus senior-IC scope. See the ladder above. Do not pattern-match the title.
2. **Domain overlap** — marketplaces, two-sided platforms, on-demand delivery/logistics, travel/OTA,
   q-commerce, catalog/PIM, ecommerce.
3. **Product-surface overlap** — funnel & conversion optimisation, experimentation/A-B, growth,
   platform/APIs, internal tooling, data-heavy product, UX research.
4. **Technical depth** — he was a mobile engineer before product. Roles wanting a technical PM, or PMs
   who can hold their own on system design and API trade-offs, fit him better than a CV skim suggests.
5. **AI fluency** — if the role asks for it, weigh the Tier-2 evidence heavily: he designed and shipped
   an LLM classification pipeline with evals and human-in-the-loop correction. That is far stronger than
   "uses AI in workflows". Cite the link in \`angle\` when AI fluency is a stated requirement.
6. **Compensation** — see the Compensation section. Pay is often quoted as an HOURLY, daily or monthly
   rate rather than a salary: **annualize it first**, using the conversions given there, before judging
   it. A strong annualized figure is worth +2 to +3 and can outweigh a contract engagement, a thin JD,
   or weak domain overlap on its own. If no pay is stated anywhere, ignore it and do not speculate.
   (Calibration miss: a JD offering "USD 80-120 per hour" — well over $100k/yr — was read as if no pay
   had been stated, and scored 4.0 where it should have been ~7.5.)
7. **Engagement model** — permanent single-org ownership is what he wants. Apply the penalties listed
   under Engagement for consultancy/agency/fractional and for execution-only roles.
8. **Strategy vs execution** — a role that is heavy on delivery and light on owning product strategy
   scores lower even when he could obviously do the work.
9. **Role framing** — he responds strongly to JDs that explicitly talk about measuring impact, KPIs,
   experimentation, data and user research. Treat that as a genuine positive, not fluff.
10. **Preferences** — a role in an "avoids" domain scores low regardless of skill match.

## Explicitly OUT OF SCOPE — do not weigh these at all
${c.excludeFromScoring.map((x) => `- ${x}`).join("\n")}
Remote eligibility and right-to-work were already decided by an upstream classifier; this posting has
passed it. Re-judging them here would double-penalize. Say nothing about visas or relocation.

## Output rules

\`strengths\` and \`gaps\` together must EXPLAIN THE NUMBER. A reader who sees only the score and these two
lists should understand exactly how you arrived at it. They are not application advice.

- \`strengths\` — the 2–3 concrete things that make the score as HIGH as it is. Cite the specific evidence
  (a company, a result, a shipped surface), not a trait. They must be **defensible from the CV alone** (or
  cite a Tier-2 link), because they are also lifted into a cover letter. Never assert people-management he
  has not done. Never state a years-of-experience number the CV does not support.
- \`gaps\` — ONLY things that actually pulled the score DOWN, blunt and specific to this posting ("they
  want 3+ yrs managing PMs; you have none"). Say how much each one cost, briefly: "hard requirement he
  lacks — caps this near 4", "a plus, not a requirement — mild".
  **A factor that did not move the score is NOT a gap.** Do not list unknowns ("no compensation stated"),
  things to verify ("confirm the strategy scope"), or generic risks. If it did not cost points, either put
  it in \`reason\` or leave it out. An excellent role may have one gap or none — list only what you actually
  deducted for, however few that is.

  **Decide the score FIRST, then report the gaps that produced it.** These two fields describe a judgement
  you have already made; they must never revise it. Do not adjust the score to make the gap list look
  balanced, and do not add or drop a gap because of how many there are.
- \`angle\` is one sentence he could paste into a cover letter opener. It is stored for later drafting and
  is not shown next to the score, so it may repeat a strength.
- \`reason\` is one sentence explaining the number.`;
}

let client: Anthropic | null = null;
const getClient = () => (client ??= new Anthropic());

// Transient errors worth retrying: overload / rate limit / 5xx / grammar-compile timeouts, plus a
// truncated structured-output response. The last one looks permanent but isn't: a job whose JSON
// came back cut short ("Unexpected end of JSON input") scored fine on a plain retry.
function isRetryable(e: unknown): boolean {
  const status = (e as { status?: number })?.status;
  const message = (e as { message?: string })?.message ?? "";
  if (status && [408, 409, 429, 500, 502, 503, 504, 529].includes(status)) return true;
  return /grammar compilation|overloaded|timed? ?out|rate.?limit|parse structured output/i.test(message);
}

const MAX_DESC_CHARS = 12_000;

/**
 * Score one job. Returns null rather than a fabricated score if the model can't be reached —
 * an unscored job is honest; a made-up 5.0 silently corrupts the ranking.
 */
export async function scoreJob(
  job: RawJob,
  candidate: Candidate,
  model: string = config.scoringModel,
): Promise<Pick<FitScore, "score" | "strengths" | "gaps" | "angle" | "reason"> | null> {
  const userContent = [
    `Title: ${job.title}`,
    `Company: ${job.company}`,
    job.structuredLocation ? `Board location field: ${job.structuredLocation}` : null,
    "",
    "Job description:",
    job.descriptionText.slice(0, MAX_DESC_CHARS),
  ]
    .filter((s) => s !== null)
    .join("\n");

  const maxAttempts = 4;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await getClient().messages.parse({
        model,
        max_tokens: 16_000, // headroom for adaptive thinking; stays under the non-streaming timeout
        // NOTE: no `temperature` — Opus 4.8 / Sonnet 5 / Fable 5 removed it (400 if sent).
        thinking: { type: "adaptive" }, // on Opus 4.8, omitting this runs with thinking OFF
        system: systemPrompt(candidate),
        messages: [{ role: "user", content: userContent }],
        output_config: {
          format: zodOutputFormat(FitSchema),
          effort: config.scoringEffort as "low" | "medium" | "high" | "xhigh" | "max",
        },
        // The persona + rubric prefix is identical across all 195 calls — cache it.
        cache_control: { type: "ephemeral" },
      });
      if (response.parsed_output) {
        const p = response.parsed_output;
        return {
          score: Math.round(Math.min(10, Math.max(0, p.score)) * 10) / 10,
          strengths: p.strengths,
          gaps: p.gaps,
          angle: p.angle,
          reason: p.reason,
        };
      }
      if (attempt === maxAttempts) return null;
    } catch (e) {
      if (attempt === maxAttempts || !isRetryable(e)) {
        console.warn(`  ! score(${model}) failed for ${job.id}: ${e instanceof Error ? e.message.slice(0, 140) : e}`);
        return null;
      }
    }
    await new Promise((r) => setTimeout(r, 1000 * 2 ** (attempt - 1))); // 1s, 2s, 4s
  }
  return null;
}
