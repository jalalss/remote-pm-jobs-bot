# Remote-PM job-filtering bot

Pulls remote Product Manager listings from job-board APIs, runs each description
through Claude against a Bangkok-based (UTC+7) candidate's criteria, and writes a
ranked HTML digest: **PASS** (apply now) / **MAYBE** (apply + ask the recruiter) /
**REJECT** (filtered out, but auditable).

## Setup

1. Get an Anthropic API key: https://console.anthropic.com/ → API Keys
2. `cp .env.local.example .env.local` and paste your key into `ANTHROPIC_API_KEY`.

## Run

```bash
npm run jobs          # fetch → classify → write jobs-digest.html
open jobs-digest.html # view the digest

npm run jobs:test     # regression: classify the 6 hand-labeled JDs, assert verdicts
```

Cost is a few cents per run on Claude Haiku 4.5. Re-runs reuse cached
classifications (`.job-cache.json`) and only pay for new jobs.

## How it decides (v1 — expect to recalibrate)

- **Role gate** (title must contain a PM term) and **recency gate** (≤ 3 months old)
  run *before* any Claude call — see `config.ts`.
- The classifier (`classify.ts`) treats a bare country list as **MAYBE, not REJECT**
  (recruiters often list only big job-seeker markets). It only **REJECT**s a geo
  restriction on hard-lock language ("must be based in", "USA only", right-to-work,
  a required office). It ignores market/footprint language ("customers worldwide").
- Every REJECT/MAYBE shows the **verbatim JD quote** that triggered it, so you can
  audit false rejects and tune the rules in `config.ts` / the prompt in `classify.ts`.

## Sources

`sources/` — Remotive, Remote OK, We Work Remotely (RSS), Himalayas. Each adapter is
isolated: if a feed is down or rate-limited, that source is skipped and the run
continues. (Note: Remotive's public API currently ignores category filters and
serves a small generic set — the strongest yield is WWR + Himalayas + Remote OK.)

## Deferred (future phases)

LinkedIn (via your job-alert emails), CV-fit ranking, and scheduled/automated runs.
