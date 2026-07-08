// Renders classified jobs into a single self-contained HTML digest with sticky
// verdict + source filter chips at the top (inline JS; it's a local file, no CSP).
import type { ClassifiedJob, Verdict } from "./types.js";

const SOURCE_LABELS: Record<string, string> = {
  linkedin: "LinkedIn",
  himalayas: "Himalayas",
  remoteok: "Remote OK",
  wwr: "We Work Remotely",
  remotive: "Remotive",
};
const sourceLabel = (s: string) => SOURCE_LABELS[s] ?? s;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function relativeAge(iso: string | undefined): string {
  if (!iso) return "date unknown";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "date unknown";
  const days = Math.floor((Date.now() - then) / 86_400_000);
  const date = iso.slice(0, 10);
  if (days <= 0) return `${date} · today`;
  if (days === 1) return `${date} · 1 day ago`;
  return `${date} · ${days} days ago`;
}

// Sort key: newest first; unknown/invalid dates sort last.
function postedTime(job: ClassifiedJob): number {
  if (!job.postedAt) return -Infinity;
  const t = new Date(job.postedAt).getTime();
  return Number.isNaN(t) ? -Infinity : t;
}

function card(job: ClassifiedJob): string {
  const c = job.classification;
  const newBadge = job.isNew ? `<span class="new">NEW</span>` : "";
  const evidence = c.evidence
    ? `<blockquote>${escapeHtml(c.evidence)}</blockquote>`
    : `<blockquote class="empty">No location line found in the posting.</blockquote>`;
  const recruiter = c.recruiterQuestion
    ? `<p class="ask"><strong>Ask the recruiter:</strong> ${escapeHtml(c.recruiterQuestion)}</p>`
    : "";
  const tz = c.timezoneRequirement
    ? `<span class="meta">Timezone: ${escapeHtml(c.timezoneRequirement)}</span>`
    : "";

  return `
  <article class="card ${c.verdict}" data-verdict="${c.verdict}" data-source="${escapeHtml(job.source)}">
    <div class="head">
      <span class="badge ${c.verdict}">${c.verdict}</span>
      ${newBadge}
      <h3>${escapeHtml(job.title)}</h3>
    </div>
    <div class="sub">
      <span>${escapeHtml(job.company)}</span>
      <span class="dot">·</span>
      <span class="src">${escapeHtml(sourceLabel(job.source))}</span>
      <span class="dot">·</span>
      <span>${escapeHtml(relativeAge(job.postedAt))}</span>
    </div>
    <p class="reason">${escapeHtml(c.reason)}</p>
    ${evidence}
    ${tz}
    ${recruiter}
    <p><a href="${escapeHtml(job.url)}" target="_blank" rel="noopener">Open posting →</a></p>
  </article>`;
}

function section(title: string, jobs: ClassifiedJob[], verdict: Verdict): string {
  const sorted = [...jobs].sort((a, b) => postedTime(b) - postedTime(a));
  const cards = sorted.map(card).join("\n") || `<p class="none">None.</p>`;
  return `<section class="group" data-verdict="${verdict}">
    <h2 class="${verdict}">${title} <span class="count">(${jobs.length})</span></h2>
    ${cards}
  </section>`;
}

export function renderDigest(jobs: ClassifiedJob[]): string {
  const pass = jobs.filter((j) => j.classification.verdict === "PASS");
  const maybe = jobs.filter((j) => j.classification.verdict === "MAYBE");
  const reject = jobs.filter((j) => j.classification.verdict === "REJECT");
  const now = new Date().toISOString().replace("T", " ").slice(0, 16);

  const sourceCounts = new Map<string, number>();
  for (const j of jobs) sourceCounts.set(j.source, (sourceCounts.get(j.source) ?? 0) + 1);
  const sources = [...sourceCounts.keys()].sort();

  // REJECT starts OFF (not active); everything else starts ON.
  const verdictChips = (["PASS", "MAYBE", "REJECT"] as Verdict[])
    .map(
      (v) =>
        `<button class="chip verdict ${v}${v === "REJECT" ? "" : " active"}" data-type="verdict" data-value="${v}">${v}</button>`,
    )
    .join("");
  const sourceChips = sources
    .map(
      (s) =>
        `<button class="chip source active" data-type="source" data-value="${escapeHtml(s)}">${escapeHtml(sourceLabel(s))} <span class="chip-n">${sourceCounts.get(s)}</span></button>`,
    )
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Remote PM Job Digest</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body { font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
         max-width: 820px; margin: 0 auto; padding: 24px; color: #1a1a1a; background: #fafafa; }
  header { margin-bottom: 8px; }
  h1 { font-size: 24px; margin: 0 0 4px; }
  .summary { color: #666; font-size: 13px; }
  .filters { position: sticky; top: 0; z-index: 10; background: #fafafa;
             padding: 12px 0 10px; margin-bottom: 8px; border-bottom: 1px solid #e5e5e5; }
  .filter-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin: 5px 0; }
  .filter-label { font-size: 11px; font-weight: 700; color: #888; text-transform: uppercase;
                  letter-spacing: .04em; min-width: 54px; }
  .chip { cursor: pointer; font: inherit; font-size: 12px; padding: 3px 11px; border-radius: 999px;
          border: 1px solid #ccc; background: transparent; color: #8a8a8a; transition: all .12s; }
  .chip.active { color: #fff; border-color: transparent; background: #57606a; }
  .chip.verdict.PASS.active { background: #1a7f37; }
  .chip.verdict.MAYBE.active { background: #bf8700; }
  .chip.verdict.REJECT.active { background: #cf222e; }
  .chip-n { opacity: .7; font-size: 11px; }
  .showing { font-size: 12px; color: #888; margin-top: 8px; }
  h2 { font-size: 18px; margin: 28px 0 12px; padding-bottom: 6px; border-bottom: 2px solid #eee; }
  h2.PASS { color: #1a7f37; } h2.MAYBE { color: #9a6700; } h2.REJECT { color: #82071e; }
  .count { color: #999; font-weight: normal; font-size: 14px; }
  .card { background: #fff; border: 1px solid #e5e5e5; border-left-width: 4px;
          border-radius: 8px; padding: 14px 16px; margin: 10px 0; }
  .card.PASS { border-left-color: #1a7f37; }
  .card.MAYBE { border-left-color: #bf8700; }
  .card.REJECT { border-left-color: #cf222e; }
  .head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .head h3 { font-size: 16px; margin: 0; }
  .badge { font-size: 11px; font-weight: 700; padding: 2px 7px; border-radius: 4px; color: #fff; }
  .badge.PASS { background: #1a7f37; } .badge.MAYBE { background: #bf8700; } .badge.REJECT { background: #cf222e; }
  .new { font-size: 10px; font-weight: 700; color: #0969da; border: 1px solid #0969da; border-radius: 4px; padding: 1px 5px; }
  .sub { color: #666; font-size: 13px; margin: 4px 0 8px; }
  .sub .src { font-weight: 600; }
  .dot { margin: 0 4px; color: #ccc; }
  .reason { margin: 6px 0; }
  blockquote { margin: 8px 0; padding: 6px 12px; background: #f6f8fa; border-left: 3px solid #d0d7de;
               font-size: 13px; color: #333; border-radius: 0 4px 4px 0; white-space: pre-wrap; }
  blockquote.empty { color: #999; font-style: italic; }
  .meta { display: inline-block; font-size: 12px; color: #666; margin: 4px 0; }
  .ask { font-size: 13px; background: #fff8e5; padding: 8px 12px; border-radius: 6px; }
  a { color: #0969da; text-decoration: none; } a:hover { text-decoration: underline; }
  .none { color: #999; }
  @media (prefers-color-scheme: dark) {
    body { color: #e6edf3; background: #0d1117; }
    .filters { background: #0d1117; border-color: #30363d; }
    .chip { border-color: #444c56; color: #8b949e; }
    .card { background: #161b22; border-color: #30363d; }
    h2 { border-color: #30363d; }
    blockquote { background: #21262d; border-left-color: #444c56; color: #c9d1d9; }
    .ask { background: #2d2410; }
    .summary, .sub, .meta, .showing { color: #8b949e; }
  }
</style>
</head>
<body>
<header>
  <h1>Remote PM Job Digest</h1>
  <div class="summary">Generated ${now} · ${jobs.length} classified · ${pass.length} PASS · ${maybe.length} MAYBE · ${reject.length} REJECT · candidate UTC+7 (Bangkok)</div>
</header>
<div class="filters">
  <div class="filter-row"><span class="filter-label">Verdict</span>${verdictChips}</div>
  <div class="filter-row"><span class="filter-label">Source</span>${sourceChips}</div>
  <div class="showing">Showing <span id="shown-count">0</span> of ${jobs.length} jobs · click chips to toggle</div>
</div>
${section("✅ PASS — worth applying now", pass, "PASS")}
${section("🟡 MAYBE — apply + ask the recruiter", maybe, "MAYBE")}
${section("❌ REJECT — filtered out", reject, "REJECT")}
<script>
(function () {
  var state = { verdict: {}, source: {} };
  var chips = document.querySelectorAll('.chip');
  chips.forEach(function (c) { state[c.dataset.type][c.dataset.value] = c.classList.contains('active'); });
  var cards = Array.prototype.slice.call(document.querySelectorAll('.card'));
  var groups = Array.prototype.slice.call(document.querySelectorAll('.group'));
  var countEl = document.getElementById('shown-count');
  function apply() {
    var shown = 0;
    cards.forEach(function (card) {
      var show = state.verdict[card.dataset.verdict] && state.source[card.dataset.source];
      card.style.display = show ? '' : 'none';
      if (show) shown++;
    });
    groups.forEach(function (g) {
      var any = Array.prototype.slice.call(g.querySelectorAll('.card')).some(function (c) { return c.style.display !== 'none'; });
      g.style.display = any ? '' : 'none';
    });
    if (countEl) countEl.textContent = shown;
  }
  chips.forEach(function (chip) {
    chip.addEventListener('click', function () {
      var t = chip.dataset.type, v = chip.dataset.value;
      state[t][v] = !state[t][v];
      chip.classList.toggle('active', state[t][v]);
      apply();
    });
  });
  apply();
})();
</script>
</body>
</html>`;
}
