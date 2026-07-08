// CLI dispatcher for the job bot's independent stages.
//   all (default)  fetch -> classify -> render
//   fetch          pull sources -> .jobs-raw.json           (no API key)
//   classify       .jobs-raw.json -> .job-cache.json        (needs API key; --force reclassifies all)
//   render         stores -> jobs-digest.html               (no API key, no network)
//   langcheck      free sweep: non-English PASS/MAYBE -> REJECT   (no API key)
//   reject <ids…>  force-REJECT specific jobs                (no API key)
import { runFetch, runClassify, runRender, runLangSweep, runReject, runMigrate } from "./pipeline.js";

function requireApiKey() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ERROR: ANTHROPIC_API_KEY is not set. Add it to .env.local (see .env.local.example).");
    process.exit(1);
  }
}

async function main() {
  const [cmd = "all", ...args] = process.argv.slice(2);
  const force = args.includes("--force");
  switch (cmd) {
    case "fetch":
      await runFetch();
      break;
    case "classify":
      requireApiKey();
      await runClassify(force);
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
    case "migrate":
      runMigrate();
      break;
    case "all":
      requireApiKey();
      await runFetch();
      await runClassify(force);
      runRender();
      break;
    default:
      console.error(`Unknown command "${cmd}". Use: all | fetch | classify [--force] | render | langcheck | reject <ids...> | migrate`);
      process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
