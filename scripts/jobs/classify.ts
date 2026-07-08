// The classifier: judges each job against the candidate's 4 criteria using Claude,
// returning structured JSON with a verbatim evidence quote for debuggability.
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { config } from "./config.js";
import type { Classification, RawJob } from "./types.js";

const ClassificationSchema = z.object({
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

const SYSTEM_PROMPT = `You screen remote job postings for a Senior Product Manager based in Bangkok, Thailand (UTC+7). Your job is to decide whether each posting plausibly allows someone physically located in Thailand to take it. Output a structured judgement.

## The candidate's requirements
1. Truly remote — no hybrid, no required physical office presence. Occasional travel (a few times a year) is fine.
2. Either explicitly work-from-anywhere/worldwide, OR a stated timezone with enough overlap with UTC+7 (at least ${config.minTimezoneOverlapHours} hours of overlap), OR no country/region restriction that excludes Thailand/APAC.

## Verdicts
- PASS — truly remote AND (explicit work-from-anywhere/worldwide OR good timezone overlap OR no geographic lock at all).
- REJECT — hybrid/on-site (required office), OR a HARD region lock that excludes Thailand/APAC, OR a stated timezone that does NOT overlap enough with UTC+7.
- MAYBE — silent on location, OR a country/region list WITHOUT hard-lock language. These are worth applying to with a clarifying question.

## Non-English postings => REJECT
If the job description BODY is written predominantly in a language other than English (e.g. Greek, Russian/Cyrillic, German, Spanish, French, etc.), that signals the role targets a local-language audience — REJECT it, even if no geographic restriction is stated. Set evidence to a short verbatim snippet of the foreign-language text and name the language in the reason.
GUARDRAILS — do NOT reject for: a few foreign words (company names, place names, a single legal/benefits line), or a BILINGUAL posting that ALSO includes a substantial English version of the description. If a real English version is present, English-speakers are addressed — ignore the other language and judge normally on location.

## Country lists are NOT automatic rejects (critical)
A listed set of countries is often just recruiters targeting big job-seeker markets (they list India but not Bangladesh), NOT a statement that the job legally requires you to be there. So a bare country/region list defaults to MAYBE, not REJECT. Decide REJECT vs MAYBE by looking for WHY the restriction exists:

HARD-LOCK signals => REJECT (only these justify rejecting a geo restriction):
- Explicit binding language: "must be located in", "must be based in", "you will be expected to be located in this region".
- "<Country/region> only" patterns, e.g. "USA only", "US-only", "UK only", "EU only" — an "X-only" tag explicitly requires the candidate to be in X.
- Work-authorization / right-to-work requirements: "authorized to work in X", "eligible to work in X".
- A required physical office (hybrid or on-site).
- "401(k)" is a corroborating US-location hint ONLY — it supports a US read alongside other geo signals; it is NEVER a standalone reject on its own.

SOFT / representative signals => MAYBE:
- A country/region list with NO "must be based" language — especially alongside global/distributed language or a wide-open timezone range (e.g. -10 to +14).
- A BARE LOCATION LABEL is NOT hard-lock. A structured "Location: <place>" field, a job-board location value (e.g. candidate_required_location: "United States", or a "Location: Singapore" header), or a place name stated WITHOUT a binding verb, just names the role's default/home office or target market — it is not a legal requirement. Treat a bare location field/value as MAYBE unless binding language is ALSO present. The binding test: is there a requirement verb/phrase attached — "must be based/located in", "you must be in", "<place> only", "authorized/eligible to work in", or a required physical office? If yes => REJECT. If the location is merely labelled/named with no such phrase => MAYBE. ("Located in Raleigh (Hybrid)" is REJECT — it has a required office; a bare "Location: Singapore" with nothing else is MAYBE.)

Deliberately IGNORE these as signals (too weak or wrong target): "national holidays" (every country has them) and "federal/state law" (that is EEO boilerplate reflecting where the COMPANY is incorporated, not where the ROLE can be done — a US-incorporated company can still hire globally).

## Ignore market/footprint language entirely
Phrases like "customers worldwide", "across the globe", "operating in 37 countries", "1200+ colleagues in 75+ countries", "worldwide leader" describe the BUSINESS, not your eligibility. Never treat them as work-from-anywhere signals. The governing line is always the explicit "based in / located in / available to candidates in / home based in X region" statement — it overrides all marketing language.

## Bias
When genuinely ambiguous, prefer MAYBE over REJECT. A false MAYBE costs one recruiter question; a false REJECT silently drops a viable job.

## Evidence (required for auditing)
- \`evidence\` MUST be an exact, unaltered substring copied verbatim from the job description — the specific line/phrase that drove the verdict. For REJECT: the hard-lock phrase. For MAYBE: the ambiguous or missing-location line. For PASS: the work-from-anywhere/timezone phrase. Use null only if truly nothing relevant exists.
- \`reason\` is one plain sentence.
- For MAYBE, \`recruiterQuestion\` suggests a short question, typically about whether they can employ in Thailand (e.g. via an Employer of Record) or whether the location list is a hard requirement.`;

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

export async function classifyJob(job: RawJob): Promise<Classification> {
  const structuredHints = [
    job.structuredLocation
      ? `Job-board location value (a hint — a bare place name here is NOT by itself a hard lock; apply the binding test): "${job.structuredLocation}"`
      : null,
    job.structuredTimezone ? `Structured timezone field: "${job.structuredTimezone}"` : null,
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
        model: config.model,
        max_tokens: 1024,
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
