# Remote PM Jobs Bot

A command-line tool that finds **genuinely remote Product Manager roles** — the ones you can actually take from anywhere — by pulling listings from several job boards and LinkedIn, then using an LLM to read each job description and decide whether it's truly location-flexible. Results land in a filterable HTML digest.

It also ships a companion **Claude Code skill** that classifies a single pasted LinkedIn URL or job description on demand.

> The portfolio site in `src/` ships with a **placeholder CV** ("Alex Morgan"); the bot in `scripts/jobs/` is the real project.

---

## The problem

"Remote" on job boards is unreliable. A posting tagged remote is often really:

- **region-locked** ("must be based in the EU", "US only"),
- **hybrid** with a required office, or
- **timezone-locked** to hours that don't work from Asia.

The restriction usually hides in the prose while the marketing intro shouts "we're global!". Manually opening and reading hundreds of listings to find the handful that are *actually* work-from-anywhere (and workable from a UTC+7 timezone) is slow and demoralizing.

## The solution

Automate the triage. For every listing the bot:

1. **Fetches** it from multiple sources (search-first where the API allows).
2. **Gates** it cheaply — only real PM/leadership titles, posted recently.
3. **Classifies** the full description with an LLM against a specific rubric:
   - **PASS** — truly remote *and* work-from-anywhere / good timezone overlap / no geo lock.
   - **MAYBE** — silent or ambiguous on location (worth applying + asking the recruiter).
   - **REJECT** — a *hard* location lock, a required office, or a non-English posting.
4. **Renders** a filterable digest grouped by verdict, each card showing the **exact quote** from the JD that drove the decision.

The classifier encodes hard-won nuances: it ignores "customers worldwide" marketing language, treats a bare country list as MAYBE (recruiters often target markets, not requirements) rather than an automatic reject, and only rejects on genuine binding language ("must be based in", "X only", right-to-work, a required office).

## How it works

The pipeline is split into **independent stages** so any one can run without the others — you can tweak the UI and re-render in seconds without re-fetching or re-classifying:

```
fetch  →  classify  →  render
  │          │           │
  └── SQLite database (jobs + classifications) ──┘
```

- **`fetch`** — pulls + normalizes listings, applies the title/recency gates, upserts into the DB (no API key, network only).
- **`classify`** — a free programmatic language check (rejects non-English postings with no LLM cost), then an LLM call for the rest, with structured JSON output and retry/backoff. Cached, so re-runs only pay for new jobs.
- **`render`** — joins jobs + verdicts into a self-contained, filterable HTML page (no API key, no network).
- **`langcheck`** / **`reject`** — free maintenance passes for cleanup.

### Sources

| Source | How it's queried |
|---|---|
| Remote OK | product tags (JSON API) |
| We Work Remotely | union of category RSS feeds |
| Himalayas | free-text search API (multi-query, deduped) |
| Remotive | public JSON API |
| LinkedIn | public **guest** endpoints — search results union + per-job description (unauthenticated, low-volume, personal use) |

LinkedIn's guest search is non-deterministic (the same query returns varying subsets), so the bot **repeats each search and unions the results until they plateau**, then fetches each job's description by ID.

## Tech

- **TypeScript** + **Node** (run via `tsx`)
- **Anthropic API** (Claude Haiku) with structured outputs (zod) for classification
- **SQLite** (`better-sqlite3`) — two tables, `jobs` and `classifications`, tracking verdict, method (`llm` / `language` / `manual`) and timestamp so you can re-classify targeted subsets after changing the rules
- **franc** for zero-cost language detection
- **rss-parser**, native `fetch`
- **Next.js** (the portfolio site)

## Running it

```bash
npm install
cp .env.local.example .env.local     # add your Anthropic API key (console.anthropic.com)

npm run jobs                         # fetch → classify → render
open jobs-digest.html
```

Individual stages:

```bash
npm run jobs:fetch        # refresh listings (no API cost)
npm run jobs:classify     # classify new jobs   (npm run jobs:classify -- --force to redo all)
npm run jobs:render       # rebuild the HTML     (instant, free)
npm run jobs:langcheck    # drop non-English PASS/MAYBE jobs (free)
npm run jobs:test         # regression test against hand-labeled fixtures
```

## The companion skill

`.claude/skills/screen-remote-jobs/` is a Claude Code skill using the *same* criteria. Paste a LinkedIn job URL or a raw description and it returns a PASS / MAYBE / REJECT with the triggering quote — handy for one-off checks without running the full pipeline.

## Project layout

```
scripts/jobs/
  index.ts          # CLI dispatcher (fetch / classify / render / …)
  pipeline.ts       # the stages
  db.ts             # SQLite data-access layer
  classify.ts       # LLM classifier (the rubric)
  lang.ts           # franc language check
  render.ts         # HTML digest
  sources/          # one adapter per job board
  fixtures/         # hand-labeled JDs for regression testing
src/                # Next.js portfolio site (placeholder CV data)
```

## Notes & limitations

- The LinkedIn integration uses **public, unauthenticated guest endpoints** for personal, low-volume use — not bulk scraping. Guest results are non-deterministic and won't perfectly mirror a logged-in search.
- The classification rubric is deliberately biased toward **MAYBE over REJECT** — a false MAYBE costs one recruiter question; a false REJECT silently drops a viable job.
- Classification criteria are a living thing; the fixture test (`npm run jobs:test`) guards against regressions when they change.
