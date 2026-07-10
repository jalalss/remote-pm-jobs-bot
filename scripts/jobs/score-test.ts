// Calibration harness for the role-fit scorer: `npm run jobs:score-test`.
//
// Scores the 8 fixture jobs fresh and compares against the AGREED column (see fit-fixtures.ts —
// neither the human's nor the model's first pass is ground truth).
//
// RANK FIRST, MAGNITUDE SECOND. The digest is a sorted queue, so getting the ORDER right matters
// more than the exact numbers. And Opus 4.8 removed `temperature`, so every score carries ~±0.5
// noise — chasing MAE below ~0.6 is fitting noise, not judgement.
import { allJobs } from "./db.js";
import { loadCandidate } from "./candidate.js";
import { scoreJob } from "./score.js";
import { fitFixtures } from "./fixtures/fit-fixtures.js";

/**
 * The fixture -> real-posting map is gitignored (fit-fixtures.ts is public and holds candid
 * opinions about named employers). Resolve it lazily so the failure is actionable.
 */
async function loadFixtureJobIds(): Promise<Record<string, string>> {
  try {
    const mod = await import("./fixtures/fit-fixtures.local.js");
    return mod.fixtureJobIds;
  } catch {
    throw new Error(
      "Missing scripts/jobs/fixtures/fit-fixtures.local.ts (gitignored).\n" +
        "  cp scripts/jobs/fixtures/fit-fixtures.example.ts scripts/jobs/fixtures/fit-fixtures.local.ts\n" +
        "then map each fixture ref to a job id in your local .jobs.db.",
    );
  }
}

const TARGET_SPEARMAN = 0.85;
const TARGET_MAE = 0.8;
const FLAG_DELTA = 1.5;

/** Average ranks (ties share the mean rank), descending — rank 1 = best fit. */
function ranks(xs: number[]): number[] {
  const order = xs.map((v, i) => ({ v, i })).sort((a, b) => b.v - a.v);
  const r = new Array<number>(xs.length);
  let i = 0;
  while (i < order.length) {
    let j = i;
    while (j + 1 < order.length && order[j + 1].v === order[i].v) j++;
    const shared = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) r[order[k].i] = shared;
    i = j + 1;
  }
  return r;
}

/** Spearman ρ via Pearson on the ranks (correct in the presence of ties). */
function spearman(a: number[], b: number[]): number {
  const ra = ranks(a);
  const rb = ranks(b);
  const n = a.length;
  const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / n;
  const ma = mean(ra);
  const mb = mean(rb);
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    num += (ra[i] - ma) * (rb[i] - mb);
    da += (ra[i] - ma) ** 2;
    db += (rb[i] - mb) ** 2;
  }
  return da === 0 || db === 0 ? 0 : num / Math.sqrt(da * db);
}

async function main() {
  const candidate = await loadCandidate();
  const jobIds = await loadFixtureJobIds();
  const byId = new Map(allJobs().map((j) => [j.id, j]));

  console.log(`Scoring ${fitFixtures.length} calibration fixtures...\n`);
  const results = await Promise.all(
    fitFixtures.map(async (f) => {
      const jobId = jobIds[f.ref];
      if (!jobId) throw new Error(`fixture ${f.ref} has no id in fit-fixtures.local.ts`);
      const job = byId.get(jobId);
      if (!job) throw new Error(`fixture ${f.ref} -> job not in DB: ${jobId}`);
      const fit = await scoreJob(job, candidate);
      return { f, got: fit?.score ?? null, fit };
    }),
  );

  const usable = results.filter((r) => r.got !== null) as { f: (typeof fitFixtures)[0]; got: number; fit: NonNullable<Awaited<ReturnType<typeof scoreJob>>> }[];
  if (usable.length !== results.length) console.warn(`! ${results.length - usable.length} fixture(s) failed to score\n`);

  const pad = (s: string, n: number) => s.slice(0, n).padEnd(n);
  console.log(`${pad("fixture", 46)} ${pad("agreed", 7)} ${pad("now", 6)} ${pad("Δ", 6)}  ${pad("(1st: human / model)", 20)}`);
  console.log("─".repeat(94));

  let sumAbs = 0;
  const flagged: string[] = [];
  for (const { f, got } of usable) {
    const d = got - f.agreed;
    sumAbs += Math.abs(d);
    const mark = Math.abs(d) > FLAG_DELTA ? " ⚠" : "";
    if (Math.abs(d) > FLAG_DELTA) flagged.push(`${f.ref} (${f.role.slice(0, 40)}): agreed ${f.agreed}, got ${got.toFixed(1)}`);
    console.log(
      `${pad(`${f.ref}  ${f.role}`, 46)} ${pad(f.agreed.toFixed(1), 7)} ${pad(got.toFixed(1), 6)} ${pad((d >= 0 ? "+" : "") + d.toFixed(1), 6)}  ${pad(`${f.humanFirstPass} / ${f.modelFirstPass}`, 20)}${mark}`,
    );
  }

  const mae = sumAbs / usable.length;
  const rho = spearman(usable.map((r) => r.f.agreed), usable.map((r) => r.got));

  console.log("─".repeat(74));
  const ok = (b: boolean) => (b ? "PASS ✓" : "FAIL ✗");
  console.log(`\nSpearman rank correlation : ${rho.toFixed(3)}  (target ≥ ${TARGET_SPEARMAN})  ${ok(rho >= TARGET_SPEARMAN)}   <- primary`);
  console.log(`Mean absolute error       : ${mae.toFixed(3)}  (target ≤ ${TARGET_MAE})  ${ok(mae <= TARGET_MAE)}   <- secondary`);
  if (mae < 0.6) console.log(`  NOTE: MAE below ~0.6 is inside the ±0.5 noise floor. Stop tuning — you are fitting noise.`);
  if (flagged.length) {
    console.log(`\n${flagged.length} fixture(s) off by more than ${FLAG_DELTA} — investigate:`);
    for (const s of flagged) console.log(`  ⚠ ${s}`);
  }

  const pass = rho >= TARGET_SPEARMAN && mae <= TARGET_MAE;
  console.log(`\n${pass ? "Calibrated. ✓" : "Not yet calibrated."}`);
  if (!pass) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
