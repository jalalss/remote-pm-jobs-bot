---
name: screen-remote-jobs
description: Screens a LinkedIn job URL or a pasted job description against a Bangkok-based (UTC+7) candidate's remote-work criteria and returns a PASS / MAYBE / REJECT verdict with the exact triggering quote. Use when the user pastes a LinkedIn job link or a job description and asks whether it fits their remote or work-from-anywhere criteria, whether they can apply from Thailand, or asks to screen/classify/assess a role's location eligibility.
---

<objective>
Judge whether a single job posting plausibly allows a Senior Product Manager based in Bangkok, Thailand (UTC+7) to take it while living in Thailand. Return PASS / MAYBE / REJECT with a one-line reason and the exact quote that drove the verdict.

This mirrors the automated job bot's classifier (`scripts/jobs/classify.ts`) so a manually-checked LinkedIn role gets the same judgement as the pipeline. The decision is about **location/remote eligibility only** — not role fit, seniority, or salary.
</objective>

<quick_start>
1. Resolve the input to job-description text (see `<input_handling>`).
2. Apply `<decision_logic>` to that text.
3. Reply in `<output_format>`.

No tools are needed to judge — only to fetch a URL. Read the description and apply the binding test.
</quick_start>

<input_handling>
The user gives one of: a LinkedIn job URL, another job URL, or pasted description text.

**LinkedIn URL** — extract the numeric job ID, then WebFetch `https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/<id>` and use the returned title/company/location/description as the job text. Three URL shapes you'll see:
- **Numeric (most common when logged in):** `https://www.linkedin.com/jobs/view/4432245179/?trackingId=…&refId=…` — the ID is the digits right after `/jobs/view/`.
- **Slug:** `https://www.linkedin.com/jobs/view/some-title-at-company-4433157829` — the ID is the trailing digits of that path segment.
- **Collection/search:** any LinkedIn URL containing `currentJobId=<digits>` — use that value.

Extraction rule: if `currentJobId=<digits>` is present in the query, use it; otherwise take the digit run in the URL **path** immediately after `/jobs/view/`. **Ignore everything after the `?`** — query params like `trackingId`, `refId`, `eBP`, `lipi` contain unrelated numbers and must not be mistaken for the job ID.

**Any other URL** (a job board, company careers page, etc.): WebFetch the URL directly and use the page's job description.

**Pasted text**: use it as-is.

**If the fetch fails** (HTTP 404, a login wall, a block, or empty/irrelevant content): do NOT guess a verdict. Tell the user the posting looks expired, private, or gated, and ask them to paste the job description text instead. A LinkedIn 404 almost always means the posting has closed.
</input_handling>

<candidate_context>
- Based in Bangkok, Thailand — timezone **UTC+7**.
- Wants genuinely remote / work-from-anywhere roles workable from Thailand.
- Will start work later in the day, but will NOT work European or US core hours that run to midnight+ local. A stated timezone needs at least ~4 hours of overlap with UTC+7.
- Open to APAC-based roles (Singapore, Australia, Japan) — those timezones need little shift.
</candidate_context>

<decision_logic>
**The candidate's requirements**
1. Truly remote — no hybrid, no required physical office presence. Occasional travel (a few times a year) is fine.
2. Either explicitly work-from-anywhere/worldwide, OR a stated timezone with enough overlap with UTC+7 (≥ ~4 hours), OR no country/region restriction that excludes Thailand/APAC.

**Verdicts**
- **PASS** — truly remote AND (explicit work-from-anywhere/worldwide OR good timezone overlap OR no geographic lock at all).
- **REJECT** — hybrid/on-site (required office), OR a HARD region lock that excludes Thailand/APAC, OR a stated timezone that does NOT overlap enough with UTC+7.
- **MAYBE** — silent on location, OR a country/region list or bare location WITHOUT hard-lock language. Worth applying to with a clarifying question.

**Non-English postings ⇒ REJECT**
If the job description body is written predominantly in a language other than English (Greek, Russian/Cyrillic, German, Spanish, French, etc.), it targets a local-language audience — REJECT even if no geographic restriction is stated. Evidence = a short verbatim snippet of the foreign text; name the language in the reason. Guardrails — do NOT reject for a few foreign words (company/place names, a single legal line) or a bilingual posting that ALSO includes a substantial English version (English present ⇒ judge normally on location).

**Country lists / locations are NOT automatic rejects (critical)**
A listed set of countries is often just recruiters targeting big job-seeker markets (they list India but not Bangladesh), NOT a statement that the job legally requires you to be there. So a bare country/region list or location defaults to **MAYBE, not REJECT**. Decide REJECT vs MAYBE by looking for WHY the restriction exists:

HARD-LOCK signals ⇒ REJECT (only these justify rejecting a geo restriction):
- Explicit binding language: "must be located in", "must be based in", "you will be expected to be located in this region".
- "<Country/region> only" patterns — e.g. "USA only", "US-only", "UK only", "EU only". An "X-only" tag explicitly requires the candidate to be in X.
- Work-authorization / right-to-work: "authorized to work in X", "eligible to work in X".
- A required physical office (hybrid or on-site).
- "401(k)" is a corroborating US-location hint ONLY — it supports a US read alongside other geo signals; it is NEVER a standalone reject on its own.

SOFT / representative signals ⇒ MAYBE:
- A country/region list with NO "must be based" language — especially alongside global/distributed language or a wide-open timezone range (e.g. -10 to +14).
- **A BARE LOCATION LABEL is NOT hard-lock.** A structured "Location: <place>" field, a job-board location value (e.g. "United States", "Location: Singapore"), or a place name stated WITHOUT a binding verb, just names the role's default/home office or target market — it is not a legal requirement. Treat a bare location field/value as MAYBE unless binding language is ALSO present. **The binding test:** is there a requirement verb/phrase attached — "must be based/located in", "you must be in", "<place> only", "authorized/eligible to work in", or a required physical office? If yes ⇒ REJECT. If the location is merely labelled/named with no such phrase ⇒ MAYBE. ("Located in Raleigh (Hybrid)" is REJECT — required office; a bare "Location: Singapore" with nothing else is MAYBE.)

Deliberately IGNORE these as signals (too weak or wrong target): "national holidays" (every country has them) and "federal/state law" (EEO boilerplate reflecting where the COMPANY is incorporated, not where the ROLE can be done — a US-incorporated company can still hire globally).

**Ignore market/footprint language entirely**
Phrases like "customers worldwide", "across the globe", "operating in 37 countries", "1200+ colleagues in 75+ countries", "worldwide leader" describe the BUSINESS, not eligibility. Never treat them as work-from-anywhere signals. The governing line is always the explicit "based in / located in / available to candidates in / home based in X region" statement — it overrides all marketing language.

**Bias**
When genuinely ambiguous, prefer MAYBE over REJECT. A false MAYBE costs one recruiter question; a false REJECT silently drops a viable job.
</decision_logic>

<output_format>
Reply in this shape (plain, scannable — not JSON):

**Verdict: PASS** (or MAYBE / REJECT) — *<company> — <role title>*

**Why:** one plain sentence.

**Evidence:** "<exact, unaltered quote from the job description that drove the verdict>"
- The evidence MUST be copied verbatim from the posting. For REJECT: the hard-lock phrase. For MAYBE: the ambiguous or missing-location line (or note that location is not stated). For PASS: the work-from-anywhere/timezone phrase.

**For MAYBE only — Ask the recruiter:** a short suggested question, typically whether they can employ someone in Thailand (e.g. via an Employer of Record) or whether the location is a hard requirement.

Keep it tight. If a timezone is stated, add a one-line note on overlap with UTC+7.
</output_format>

<examples>
Calibration from hand-labeled real postings:

- **REJECT** — Booksy: "this role is available to candidates based in Spain, UK, Poland and Portugal" + "based in the country/region this role is advertised in" (binding language + country list).
- **REJECT** — Material Bank: "located in Raleigh, North Carolina (Hybrid) or Boston, MA (Remote)" (required office / US-only), corroborated by "401(k)".
- **REJECT** — Canonical: "home based in the EMEA time zone. You will be expected to be located in this region" (binding + non-overlapping timezone).
- **REJECT** — Okendo: "hybrid working model with the convenience of a Sydney CBD office" (required physical office).
- **MAYBE** — OneOcean: "Location: Singapore" and nothing else — a bare label with no binding verb; ask whether remote-from-Thailand / an EOR is possible.
- **PASS** — M32 AI (Wing): "Remote-first culture. Work from anywhere." (explicit work-from-anywhere; optional APAC hack-weeks are compatible).
</examples>

<success_criteria>
- The verdict follows the binding test: a bare location/country ⇒ MAYBE; a requirement verb, "X-only", right-to-work, or a required office ⇒ REJECT; explicit work-from-anywhere or good UTC+7 overlap ⇒ PASS.
- Evidence is an exact quote from the posting (never paraphrased).
- Ambiguous postings land on MAYBE, not REJECT.
- A failed URL fetch results in a request to paste the text — never a guessed verdict.
</success_criteria>

<keep_in_sync>
This decision logic is a mirror of `scripts/jobs/classify.ts` (the bot's SYSTEM_PROMPT). When either is recalibrated, update the other so the chat skill and the automated pipeline stay consistent.
</keep_in_sync>
