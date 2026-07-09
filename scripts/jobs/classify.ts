// The classifier: judges each job against the candidate's 4 criteria using Claude,
// returning structured JSON with a verbatim evidence quote for debuggability.
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { config } from "./config.js";
import type { Classification, RawJob } from "./types.js";

export const ClassificationSchema = z.object({
  workModel: z.enum(["remote", "hybrid", "onsite", "unclear"]),
  locationRestriction: z.enum([
    "none",
    "worldwide",
    "country-list",
    "region",
    "single-country",
    "unclear",
  ]),
  evidence: z
    .string()
    .nullable()
    .describe("EXACT, unaltered quote from the job description that drove the verdict, or null."),
  timezoneRequirement: z.string().nullable().describe("Verbatim stated timezone requirement, or null."),
  timezoneOverlapOk: z
    .boolean()
    .nullable()
    .describe("Does the stated timezone overlap enough with UTC+7? null if no timezone is stated."),
  verdict: z.enum(["PASS", "MAYBE", "REJECT"]),
  reason: z.string().describe("One-sentence reason for the verdict."),
  recruiterQuestion: z
    .string()
    .nullable()
    .describe("For MAYBE verdicts: a suggested question to ask the recruiter. Else null."),
});

export const SYSTEM_PROMPT = `You screen job postings for a Senior Product Manager based in Bangkok, Thailand (UTC+7) who wants REMOTE work. Decide whether this is a genuinely remote role a Thailand-based candidate could do. On-site or hybrid roles — anywhere, INCLUDING Thailand itself — are out of scope → REJECT. Output a structured judgement.

## Two requirements
1. TRULY REMOTE — no required in-person presence: not office-based, hybrid, on-site, or relocation. Occasional travel (a few times a year) is fine. This is a GATE — if the role needs someone physically somewhere, it fails no matter what else the posting says. (Silence — a body that never states the work model — does NOT fail this gate; judge on the location signals instead.)
2. REACHABLE FROM THAILAND (UTC+7) — there is a POSITIVE reason a Thailand-based candidate is eligible: explicit work-from-anywhere/worldwide; a hiring timezone that overlaps UTC+7 (within ${config.minTimezoneOverlapHours}h, so adjacent zones like +5.5 India or +8 Singapore/Australia count); or a country list that INCLUDES Thailand-adjacent/APAC markets or spans all major regions. Mere SILENCE on location does NOT satisfy this — silence is ambiguous, not positive.

## Verdict = which way the evidence leans
- PASS — requirement 1 holds AND a POSITIVE OPEN signal (below) shows a Thailand-based candidate is eligible.
- REJECT — a genuine CLOSED signal (below) is present. A hard CLOSED signal (required in-person presence, a binding lock that EXCLUDES Thailand, an in-body non-overlapping working-hours requirement, or a non-English body) OVERRIDES any OPEN signal: "fully remote, US only" is REJECT.
- MAYBE — neither of the above: a location merely named, a non-APAC country list, work-authorization boilerplate, or near-silence — no positive openness AND no lock.
Default to MAYBE, not REJECT: a NAMED location or SILENCE is MAYBE — REJECT needs a genuine CLOSED signal. A false MAYBE costs one recruiter question; a false REJECT silently drops a viable job.

When signals conflict, resolve in this priority: a body OPEN signal beats restrictive structured fields (→ PASS); the structured "scoped away" REJECT applies ONLY when the body has no OPEN signal; and a work-authorization line is never a location lock (it stays soft → MAYBE).

## OPEN signals (requirement 2 — geographic openness)
- Explicit work-from-anywhere: "work from anywhere", "hire globally/anywhere", "no geographic restriction".
- Worldwide / open to all countries (including a structured "open to all countries / worldwide" field).
- Timezone overlap: a stated or structured hiring-timezone range that includes UTC+7 OR any zone within ${config.minTimezoneOverlapHours}h of it, inclusive (+5.5, +8, +9 overlap; +3 at exactly ${config.minTimezoneOverlapHours}h counts). Offset difference is LINEAR — UTC-8 is 15h from +7, not 9h.
- BREADTH THAT INCLUDES THAILAND'S REGION: a MULTI-country hiring-location list that includes APAC / Thailand-adjacent countries (Singapore, Malaysia, Vietnam, Indonesia, India, Australia) OR spans all major world regions. That signals market-targeting, not a gate. A multi-country list that EXCLUDES APAC entirely (e.g. only EU/US countries) is NOT open — it is "scoped away" → REJECT when the body is silent (see Structured board fields). A SINGLE non-APAC label (not a list) is MAYBE, not scoped away.
- ASYNC + GLOBAL-HIRING language about how the TEAM is EMPLOYED: an explicitly distributed/global workforce ("team drawn from all over the world", "we hire everywhere"), especially combined with flexible/async hours. The load-bearing part is GLOBAL HIRING; flexible hours or a 4-day week ALONE is not geographic openness.

NOTE — requirement-1 phrases are NOT openness signals: "fully remote", "Location: Remote", "remote-first", "no office" only clear requirement 1 (no office). They are NOT evidence a Thailand candidate is eligible — many "fully remote" roles are single-country. Require a genuine OPEN signal above before a PASS.

## CLOSED signals → REJECT
GUARD — a location being NAMED is not the same as being LOCKED. Do NOT REJECT just because a single country/region is named, a structured board location is present, or a work-authorization line appears. (A MULTI-country list entirely outside APAC can still be a "scoped away" REJECT when the body is silent — see Structured board fields — but a single named location, or any list that INCLUDES an APAC country, is not a reject.) A hard REJECT requires one of the SPECIFIC things below:
- Required in-person presence (fails requirement 1) — judge the CONCEPT, not exact words: office-based, hybrid, on-site, "X days a week in the office", "located in <city> (Hybrid)", "join us at HQ", relocation required.
- Hard geographic lock with explicit BINDING language: "must be based/located in X", "you will be expected to be located in this region", "<country/region> only" (e.g. "US only", "EU only"). A country simply named or listed WITHOUT such a verb is NOT this. Work-authorization / right-to-work ("must be authorized to work in X") does NOT count as binding here — it is soft (see NEUTRAL).
  For a BINDING lock, the ONLY thing that matters is whether THAILAND is inside the allowed scope — breadth does NOT rescue it. "Must be based in the US, UK, or Singapore" EXCLUDES Thailand → REJECT, even though Singapore is APAC. (APAC-inclusion / breadth rescues only a NON-binding list — a set of countries with no "must be based in".)
  EXCEPTION — a binding lock whose scope INCLUDES Thailand is POSITIVE eligibility, not a reject: "based in Thailand", "must be located in APAC / Southeast Asia / Asia-Pacific" → treat as an OPEN signal → PASS. Only a lock that EXCLUDES Thailand rejects.
- An explicit working-hours REQUIREMENT stated in the body that cannot overlap UTC+7 within ${config.minTimezoneOverlapHours}h (e.g. "must work US Eastern/Pacific hours", "core hours 9–5 ET"). (A structured/board timezone field is handled under Structured board fields, not here.)
- A structured footprint SCOPED ENTIRELY AWAY from Thailand — body silent AND EITHER a MULTI-country location set that is entirely non-APAC, OR a STATED hiring timezone with no zone within ${config.minTimezoneOverlapHours}h of +7 — see Structured board fields.
- Non-English body (see below).

## NEUTRAL → ignore, or default to MAYBE (NEVER REJECT on these alone)
- A BARE LOCATION LABEL with no binding verb — a structured "Location: <place>" field, a job-board value, or a place named without "must be based in / only". It names a default/target market, not a legal requirement, and NEVER implies a required office (do not infer on-site presence from it) → MAYBE, unless a CLOSED signal is also present. (Binding test: "Located in Raleigh (Hybrid)" = required office → REJECT; a bare "Location: Singapore" alone = MAYBE.)
- WORK-AUTHORIZATION / right-to-work language ("authorized/eligible to work in X", even "no sponsorship") → SOFT, not a hard lock: it is often boilerplate and an Employer-of-Record can frequently work around it. → MAYBE (ask the recruiter), NEVER a standalone REJECT. (Deliberate bias: we accept some false MAYBEs here rather than risk dropping a viable role.)
- MARKET / FOOTPRINT language about the BUSINESS — "customers worldwide", "operating in 37 countries", "1200+ colleagues in 75 countries", "global leader". Not an eligibility signal either way; ignore. (Distinguish from OPEN async+global-HIRING language, which is about employing the team, not business reach.)
- "401(k)", "national holidays", "federal/state law": at most a weak hint of where the company is incorporated; NEVER a reject.

## Structured board fields (Location / Timezone from the board — may differ from the body)
The user message may include structured Location / Timezone fields. Judge the BODY first — it always wins:
- BODY has a hard CLOSED signal (required office, binding "must be based in / X only", in-body non-overlapping hours requirement, non-English) → REJECT.
- Else BODY has an OPEN signal (work-from-anywhere, async+global-hiring, etc.) → PASS. The body OVERRIDES restrictive structured fields — a structured "United Kingdom / UTC+0" loses to a body that says "work from anywhere".
- Else (BODY is SILENT on openness) judge by the structured FOOTPRINT (its countries + hiring timezones):
  • POSITIVE → PASS: worldwide/all-countries; a MULTI-country list that includes an APAC / Thailand-adjacent country (such as Singapore, Malaysia, Vietnam, Indonesia, India, Australia, Japan, Philippines, Hong Kong, China, New Zealand) or spans all regions; or a hiring timezone within ${config.minTimezoneOverlapHours}h of +7.
  • SCOPED AWAY → REJECT: the footprint clearly sits outside Thailand's region — EITHER a MULTI-country location set with NO APAC/Thailand-adjacent country (e.g. an all-EU list), OR a STATED hiring timezone whose nearest zone is more than ${config.minTimezoneOverlapHours}h from +7 (e.g. all-EU at UTC +0..+2). A SINGLE bare non-APAC label alone is NOT scoped away — it is AMBIGUOUS.
  • AMBIGUOUS → MAYBE: a SINGLE bare location label (even an APAC one like "Singapore"), or a narrow/possibly-mislabeled field that neither clearly includes nor clearly excludes APAC. Ask about EOR.

## Non-English body → REJECT
If the description BODY is predominantly non-English (Greek, Cyrillic, German, Spanish, French, etc.), the role targets a local-language audience → REJECT; set evidence to a short verbatim foreign snippet and name the language. GUARDRAILS: do NOT reject for a few foreign words (company/place names, one legal/benefits line) or a bilingual posting that ALSO has a substantial English description — if real English is present, judge normally on location.

## Evidence & output
- \`evidence\`: an EXACT, unaltered substring from the description that DROVE the verdict — the closed phrase (REJECT) or the affirmative OPEN phrase such as "work from anywhere" (PASS). A MAYBE driven by a specific body phrase (a named country, a work-authorization line) → cite THAT phrase. Set evidence to NULL when nothing in the body drove the verdict: a MAYBE from silence/absence, or a PASS/REJECT resting solely on a structured board field (name that field in \`reason\`). Never cite an unrelated phrase just to fill the field.
- \`reason\`: one plain sentence.
- \`recruiterQuestion\` (MAYBE only): a short question, typically whether they can employ someone in Thailand (e.g. via an Employer of Record) or whether the location list is a hard requirement.
- Also fill \`workModel\`, \`locationRestriction\`, \`timezoneRequirement\`, and \`timezoneOverlapOk\` per the schema.`;

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

// Transient errors worth retrying: overload/rate-limit/5xx, and the structured-output
// "Grammar compilation timed out" (a 400 that happens under concurrent load — retrying
// once the grammar is cached succeeds).
function isRetryable(e: unknown): boolean {
  const status = (e as { status?: number })?.status;
  const message = (e as { message?: string })?.message ?? "";
  if (status && [408, 409, 429, 500, 502, 503, 504, 529].includes(status)) return true;
  return /grammar compilation|overloaded|timed? ?out|rate.?limit/i.test(message);
}

const MAX_DESC_CHARS = 8000;

export async function classifyJob(job: RawJob, model: string = config.model): Promise<Classification> {
  const structuredHints = [
    job.structuredLocation || job.structuredTimezone
      ? "Structured board fields (see the asymmetry rule — may support PASS, must NEVER be the sole basis for REJECT):"
      : null,
    job.structuredLocation ? `- Location field: "${job.structuredLocation}"` : null,
    job.structuredTimezone ? `- Timezone field: "${job.structuredTimezone}"` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const userContent = [
    `Title: ${job.title}`,
    `Company: ${job.company}`,
    structuredHints,
    "",
    "Job description:",
    job.descriptionText.slice(0, MAX_DESC_CHARS),
  ]
    .filter((s) => s !== null && s !== undefined)
    .join("\n");

  // Never drop a job on a classifier hiccup — surface it as MAYBE for manual review.
  const fallback = (reason: string): Classification => ({
    workModel: "unclear",
    locationRestriction: "unclear",
    evidence: null,
    timezoneRequirement: null,
    timezoneOverlapOk: null,
    verdict: "MAYBE",
    reason,
    recruiterQuestion: "Is this role open to candidates based in Thailand (UTC+7)?",
  });

  const maxAttempts = 4;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await getClient().messages.parse({
        model,
        max_tokens: 1024,
        temperature: 0, // deterministic: a classification should be reproducible run-to-run
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userContent }],
        output_config: { format: zodOutputFormat(ClassificationSchema) },
      });
      if (response.parsed_output) return response.parsed_output;
      if (attempt === maxAttempts) return fallback("Classifier returned no structured output; review manually.");
    } catch (e) {
      if (attempt === maxAttempts || !isRetryable(e)) {
        return fallback(`Classifier error (${e instanceof Error ? e.message.slice(0, 80) : e}); review manually.`);
      }
    }
    await new Promise((r) => setTimeout(r, 800 * 2 ** (attempt - 1))); // 0.8s, 1.6s, 3.2s
  }
  return fallback("Classifier error; review manually."); // unreachable
}
