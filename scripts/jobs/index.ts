// CLI dispatcher for the job bot's independent stages.
//   all (default)  fetch -> classify -> render
//   fetch          pull sources -> .jobs-raw.json           (no API key)
//   classify       score jobs in the DB                     (needs API key; --force reclassifies all, --source <name> limits to one board)
//   render         stores -> jobs-digest.html               (no API key, no network)
//   review         serve the digest with edit controls      (localhost only; writes job_overrides)
//   labels         export human overrides -> JSONL          (the human-vs-LLM dataset)
//   langcheck      free sweep: non-English PASS/MAYBE -> REJECT   (no API key)
//   reject <ids…>  force-REJECT specific jobs                (no API key)
import { runFetch, runClassify, runRender, runLangSweep, runReject, runMigrate, runLabelsExport, runScore } from "./pipeline.js";
import { runReview } from "./review-server.js";
import { config } from "./config.js";
import { counts, unscoredJobs } from "./db.js";
import { loadCandidate, personaHash } from "./candidate.js";
import type { Verdict } from "./types.js";

function requireApiKey() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ERROR: ANTHROPIC_API_KEY is not set. Add it to .env.local (see .env.local.example).");
    process.exit(1);
  }
}

/**
 * Flags each command accepts. An UNRECOGNIZED flag is a hard error, never a silent no-op.
 *
 * This exists because `jobs:classify --force --only <id>` was once run against real data: `--only`
 * is not a flag, it was quietly dropped, and `--force` re-classified all 1,664 jobs. A typo must
 * not silently widen a destructive command's blast radius.
 */
const KNOWN_FLAGS: Record<string, string[]> = {
  all: ["--force", "--source", "--yes"],
  fetch: [],
  classify: ["--force", "--source", "--yes"],
  score: ["--force", "--limit", "--yes"],
  render: [],
  review: ["--port"],
  labels: [],
  langcheck: [],
  reject: [],
  migrate: [],
};

/** Rough per-job cost, USD. Haiku ~$1/$5 per MTok; Opus 4.8 ~$5/$25 and thinks before answering. */
const COST_PER_JOB = { classify: 0.004, score: 0.033 };
/** Spend above this needs an explicit --yes. Below it, just run. */
const AUTO_APPROVE_USD = 1.0;

function validateFlags(cmd: string, args: string[]): void {
  const known = KNOWN_FLAGS[cmd] ?? [];
  const unknown = args.filter((a) => a.startsWith("--") && !known.includes(a));
  if (unknown.length) {
    console.error(`ERROR: unknown flag(s) for "${cmd}": ${unknown.join(", ")}`);
    console.error(`  "${cmd}" accepts: ${known.length ? known.join(", ") : "(no flags)"}`);
    console.error(`  Refusing to run — an ignored flag could silently change what this touches.`);
    process.exit(1);
  }
}

/** Print what a paid run will cost and how much it can destroy, and stop unless --yes. */
function confirmSpend(what: "classify" | "score", jobs: number, args: string[], force: boolean): void {
  const usd = jobs * COST_PER_JOB[what];
  const model = what === "score" ? config.scoringModel : config.model;
  console.log(`  ${jobs} jobs · ${model}`);
  console.log(`  ESTIMATED COST: ~$${usd.toFixed(2)}`);
  if (force) {
    console.log(`  --force OVERWRITES ${jobs} existing row(s). Fit scores, overrides and the`);
    console.log(`  application funnel live in separate tables and are NOT affected.`);
  }
  if (usd <= AUTO_APPROVE_USD && !force) return;
  if (args.includes("--yes")) return;
  console.error(`\n  Refusing to spend $${usd.toFixed(2)}${force ? " on a --force overwrite" : ""} without confirmation.`);
  console.error(`  Re-run with --yes if that is what you want.`);
  process.exit(1);
}

async function main() {
  const [cmd = "all", ...args] = process.argv.slice(2);
  validateFlags(cmd, args);
  const force = args.includes("--force");
  const sourceIdx = args.indexOf("--source");
  const source = sourceIdx >= 0 ? args[sourceIdx + 1] : undefined;
  switch (cmd) {
    case "fetch":
      await runFetch();
      break;
    case "classify": {
      requireApiKey();
      const c = counts();
      // --force rewrites every existing classification; without it only new jobs are touched.
      const at_risk = force ? c.classifications : Math.max(0, c.jobs - c.classifications);
      confirmSpend("classify", at_risk, args, force);
      await runClassify({ force, source });
      break;
    }
    case "render":
      runRender();
      break;
    case "langcheck":
      runLangSweep();
      break;
    case "reject":
      runReject(args.filter((a) => !a.startsWith("--")));
      break;
    case "score": {
      requireApiKey();
      const limitIdx = args.indexOf("--limit");
      const limit = limitIdx >= 0 ? Number(args[limitIdx + 1]) : undefined;
      // Opus scoring is the expensive stage. Estimate against the jobs that would ACTUALLY be
      // scored (unscored + persona-stale), not everything in scope — otherwise the routine
      // "score whatever is new" run would demand confirmation for work it isn't going to do.
      const candidate = await loadCandidate();
      const todo = unscoredJobs([...config.scoringVerdicts] as Verdict[], personaHash(candidate), {
        force,
        limit,
      }).length;
      if (todo === 0) {
        console.log("Nothing to score — all in-scope jobs are current for this persona.");
        break;
      }
      confirmSpend("score", todo, args, force);
      await runScore({ force, limit });
      break;
    }
    case "review": {
      const portIdx = args.indexOf("--port");
      runReview(portIdx >= 0 ? Number(args[portIdx + 1]) : undefined);
      break;
    }
    case "labels":
      runLabelsExport();
      break;
    case "migrate":
      runMigrate();
      break;
    case "all":
      requireApiKey();
      await runFetch();
      await runClassify({ force, source });
      runRender();
      break;
    default:
      console.error(`Unknown command "${cmd}". Use: all | fetch | classify [--force] [--source <name>] | score [--force] [--limit N] | render | review [--port N] | labels | langcheck | reject <ids...> | migrate`);
      process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
