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

function requireApiKey() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ERROR: ANTHROPIC_API_KEY is not set. Add it to .env.local (see .env.local.example).");
    process.exit(1);
  }
}

async function main() {
  const [cmd = "all", ...args] = process.argv.slice(2);
  const force = args.includes("--force");
  const sourceIdx = args.indexOf("--source");
  const source = sourceIdx >= 0 ? args[sourceIdx + 1] : undefined;
  switch (cmd) {
    case "fetch":
      await runFetch();
      break;
    case "classify":
      requireApiKey();
      await runClassify({ force, source });
      break;
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
