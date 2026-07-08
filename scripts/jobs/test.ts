// Fixture test: runs the classifier against the 6 hand-labeled JDs and asserts it
// reproduces our verdicts. Run with `npm run jobs:test`. Exits non-zero on mismatch.
import { classifyJob } from "./classify.js";
import { fixtures } from "./fixtures/fixtures.js";

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ERROR: ANTHROPIC_API_KEY is not set. Add it to .env.local (see .env.local.example).");
    process.exit(1);
  }

  console.log(`Running ${fixtures.length} fixture classifications...\n`);
  let failures = 0;

  for (const fx of fixtures) {
    const c = await classifyJob(fx.job);
    const ok = c.verdict === fx.expected;
    if (!ok) failures++;
    const mark = ok ? "PASS ✓" : "FAIL ✗";
    console.log(`${mark}  ${fx.name}: expected ${fx.expected}, got ${c.verdict}`);
    console.log(`        reason: ${c.reason}`);
    console.log(`        evidence: ${c.evidence ? JSON.stringify(c.evidence) : "(none)"}`);
    if (!ok) console.log(`        WHY WE LABELED IT ${fx.expected}: ${fx.note}`);
    console.log();
  }

  if (failures === 0) {
    console.log(`All ${fixtures.length} fixtures reproduced. ✓`);
  } else {
    console.log(`${failures}/${fixtures.length} fixtures MISMATCHED. ✗`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
