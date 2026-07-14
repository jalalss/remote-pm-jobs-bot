// Local review server: serves the digest in REVIEW mode and persists the human's edits.
//
// The digest is normally a static file, so there is nowhere for a click to write. This
// binds a tiny localhost-only HTTP server (Node built-ins, no deps) that re-renders from
// SQLite on every GET and takes label writes over POST. Single-user, no auth by design.
import { createServer } from "node:http";
import { config } from "./config.js";
import {
  addApplicationEvent,
  classifiedJobs,
  clearOverride,
  currentApplication,
  jobExists,
  setApplicationNote,
  setOverride,
  undoLastApplicationEvent,
} from "./db.js";
import { renderDigest } from "./render.js";
import type { ApplicationStatus, ClassifiedJob, Verdict } from "./types.js";

const VERDICTS: Verdict[] = ["PASS", "MAYBE", "REJECT"];
const STATUSES = [...config.applicationStatuses] as ApplicationStatus[];

function digestHtml(): string {
  const cutoff = Date.now() - config.newBadgeHours * 3_600_000;
  const jobs: ClassifiedJob[] = classifiedJobs().map(
    ({ job, classification, override, fit, application }) => ({
      ...job,
      classification,
      override,
      fit,
      application,
      isNew: new Date(job.firstSeenAt).getTime() >= cutoff,
    }),
  );
  return renderDigest(jobs, { review: true });
}

function readJson(req: import("node:http").IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1e6) reject(new Error("body too large")); // basic guard
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

export function runReview(port: number = config.reviewPort): void {
  const server = createServer(async (req, res) => {
    const json = (status: number, payload: unknown) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(payload));
    };

    try {
      if (req.method === "GET" && (req.url === "/" || req.url?.startsWith("/?"))) {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(digestHtml());
        return;
      }

      if (req.method === "POST" && req.url === "/label") {
        const body = await readJson(req);
        const jobId = String(body.jobId ?? "");
        const verdict = String(body.verdict ?? "") as Verdict;
        const reason = body.reason ? String(body.reason) : null;
        const ruleTag = body.ruleTag ? String(body.ruleTag) : null;

        if (!jobExists(jobId)) return json(404, { ok: false, error: "unknown job id" });
        if (!VERDICTS.includes(verdict)) return json(400, { ok: false, error: "bad verdict" });
        if (ruleTag && !(config.ruleTags as readonly string[]).includes(ruleTag))
          return json(400, { ok: false, error: "bad rule tag" });

        setOverride(jobId, { verdict, reason, ruleTag });
        console.log(`  ✎ ${verdict.padEnd(6)} ${jobId}${reason ? ` — ${reason}` : ""}`);
        return json(200, { ok: true });
      }

      if (req.method === "POST" && req.url === "/label/clear") {
        const body = await readJson(req);
        const jobId = String(body.jobId ?? "");
        if (!jobExists(jobId)) return json(404, { ok: false, error: "unknown job id" });
        clearOverride(jobId);
        console.log(`  ↩ reverted to LLM verdict: ${jobId}`);
        return json(200, { ok: true });
      }

      // ---- application funnel ----

      if (req.method === "POST" && req.url === "/status") {
        const body = await readJson(req);
        const jobId = String(body.jobId ?? "");
        const status = String(body.status ?? "") as ApplicationStatus;

        if (!jobExists(jobId)) return json(404, { ok: false, error: "unknown job id" });
        if (!STATUSES.includes(status)) return json(400, { ok: false, error: "bad status" });

        addApplicationEvent(jobId, status);
        console.log(`  → ${status.padEnd(11)} ${jobId}`);
        return json(200, { ok: true, at: new Date().toISOString() });
      }

      if (req.method === "POST" && req.url === "/status/undo") {
        const body = await readJson(req);
        const jobId = String(body.jobId ?? "");
        if (!jobExists(jobId)) return json(404, { ok: false, error: "unknown job id" });

        undoLastApplicationEvent(jobId);
        // The card needs the status it fell back to, which may be an earlier event or none.
        const now = currentApplication(jobId);
        console.log(`  ↩ undo → ${now?.status ?? "(no status)"}  ${jobId}`);
        return json(200, { ok: true, application: now });
      }

      if (req.method === "POST" && req.url === "/status/note") {
        const body = await readJson(req);
        const jobId = String(body.jobId ?? "");
        const note = body.note ? String(body.note) : null;
        if (!jobExists(jobId)) return json(404, { ok: false, error: "unknown job id" });
        if (!setApplicationNote(jobId, note))
          return json(400, { ok: false, error: "no status set yet — set one before adding a note" });
        return json(200, { ok: true });
      }

      json(404, { ok: false, error: "not found" });
    } catch (e) {
      json(400, { ok: false, error: e instanceof Error ? e.message : "bad request" });
    }
  });

  server.on("error", (e: NodeJS.ErrnoException) => {
    if (e.code === "EADDRINUSE") {
      console.error(`ERROR: port ${port} is already in use — another review server is probably running.`);
      console.error(`  Stop it, or pick another port:  npm run jobs:review -- --port ${port + 1}`);
      process.exit(1);
    }
    throw e;
  });

  // Localhost only — this has no auth and writes straight to the DB.
  server.listen(port, "127.0.0.1", () => {
    console.log(`Review server on http://127.0.0.1:${port}`);
    console.log(`  Click ✎ on a card to change its verdict and record why. Ctrl-C to stop.`);
  });
}
