// TEMPLATE. Copy to `fit-fixtures.local.ts` (gitignored) and fill in with real job ids.
//
//     cp scripts/jobs/fixtures/fit-fixtures.example.ts scripts/jobs/fixtures/fit-fixtures.local.ts
//
// Each key is a `ref` from `fit-fixtures.ts`; each value is the job's id in your local `.jobs.db`
// (`sqlite3 .jobs.db "SELECT id, company, title FROM jobs LIMIT 20"`).
export const fixtureJobIds: Record<string, string> = {
  F1: "linkedin:0000000000",
};
