// Renders classified jobs into a single self-contained HTML digest with sticky
// verdict + source + status filter chips at the top (inline JS; it's a local file, no CSP).
//
// Two modes:
//   static  (`jobs:render`)  — the shareable artifact; read-only. Shows funnel status but
//                              cannot change it: a static file has nowhere to write.
//   review  (`jobs:review`)  — served by review-server.ts; each card gets an ✎ button to
//                              override the verdict, and a status row to drive the funnel.
// Cards always display the EFFECTIVE verdict (the human's override if set, else the LLM's).
import { config } from "./config.js";
import { effectiveVerdict, type ApplicationStatus, type ClassifiedJob, type Verdict } from "./types.js";

const SOURCE_LABELS: Record<string, string> = {
  linkedin: "LinkedIn",
  himalayas: "Himalayas",
  remoteok: "Remote OK",
  wwr: "We Work Remotely",
  remotive: "Remotive",
};
const sourceLabel = (s: string) => SOURCE_LABELS[s] ?? s;

const STATUS_LABELS: Record<ApplicationStatus, string> = {
  shortlisted: "Shortlist",
  applied: "Applied",
  interview: "Interview",
  rejected: "Rejected",
};

/**
 * The funnel BUCKETS a card can fall into — what the filter chips and the funnel bar count.
 *
 * Not the same list as `config.applicationStatuses` (the things you can click): `none` is the
 * absence of any event, and `ghosted` is derived at read time from `applied` + elapsed days.
 * Buckets are mutually exclusive, so every card lands in exactly one.
 */
const BUCKETS = ["none", "shortlisted", "applied", "interview", "ghosted", "rejected"] as const;
const BUCKET_LABELS: Record<(typeof BUCKETS)[number], string> = {
  none: "No status",
  shortlisted: "Shortlisted",
  applied: "Applied",
  interview: "Interview",
  ghosted: "Ghosted",
  rejected: "Rejected",
};
/** Lit on load: the working queue — everything still needing a decision. */
const DEFAULT_BUCKETS = new Set(["none", "shortlisted"]);

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

// Absolute post time in epoch ms, or null when unknown/invalid.
function postedMs(job: ClassifiedJob): number | null {
  if (!job.postedAt) return null;
  const t = new Date(job.postedAt).getTime();
  return Number.isNaN(t) ? null : t;
}

// Flat display order: undated jobs first (so an edge-case posting with no date is
// never lost), then dated jobs newest → oldest.
function byPostedDesc(a: ClassifiedJob, b: ClassifiedJob): number {
  const am = postedMs(a);
  const bm = postedMs(b);
  if (am === null && bm === null) return 0;
  if (am === null) return -1;
  if (bm === null) return 1;
  return bm - am;
}

// Fit-score colour band: green ≥8, amber ≥6, grey ≥4, muted below.
const scoreBand = (s: number) => (s >= 8 ? "hi" : s >= 6 ? "mid" : s >= 4 ? "lo" : "vlo");

function card(job: ClassifiedJob, review: boolean): string {
  const c = job.classification;
  const v = effectiveVerdict(job); // human's verdict wins over the classifier's
  const o = job.override;
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
  // Absolute timestamp for the client-side date filter (empty when unknown). The
  // window comparison runs against the browser's live clock at click time, so the
  // digest stays correct as days pass without re-rendering.
  const ms = postedMs(job);
  const postedAttr = ms === null ? "" : String(ms);

  // When a human has overridden the verdict, show that fact plus what the classifier said.
  const overridden = !!o?.verdict && o.verdict !== c.verdict;
  const editedBadge = o?.verdict ? `<span class="edited">EDITED</span>` : "";
  const overrideNote = o?.verdict
    ? `<p class="override">${overridden ? `<span class="llm-said">LLM said: ${c.verdict}</span>` : ""}
         ${o.reason ? `<span class="why">${escapeHtml(o.reason)}</span>` : ""}
         ${o.ruleTag ? `<span class="tag">${escapeHtml(o.ruleTag)}</span>` : ""}</p>`
    : "";
  const editBtn = review ? `<button class="edit" title="Edit this job" aria-label="Edit this job">✎</button>` : "";

  // Role fit: "is this worth applying to?" — distinct from the verdict's "can I take it?".
  const f = job.fit;
  const scoreChip = f
    ? `<span class="score ${scoreBand(f.score)}" title="Role fit (0–10)">${f.score.toFixed(1)}<span class="of-ten">/10</span></span>`
    : "";
  const li = (xs: string[]) => xs.map((x) => `<li>${escapeHtml(x)}</li>`).join("");
  // `f.angle` is deliberately not rendered: it is cover-letter raw material, not score rationale.
  const fitBlock = f
    ? `<div class="fit">
         <p class="fit-reason">${escapeHtml(f.reason)}</p>
         ${f.strengths.length ? `<div class="fit-col"><h4>Strengths</h4><ul class="good">${li(f.strengths)}</ul></div>` : ""}
         ${f.gaps.length ? `<div class="fit-col"><h4>Gaps</h4><ul class="bad">${li(f.gaps)}</ul></div>` : ""}
       </div>`
    : "";

  // Funnel. The pill's TEXT is filled in by the client (fillStatus) rather than baked in here,
  // because "APPLIED · 3d" and the GHOSTED threshold are both relative to *now*: a digest left
  // open overnight, or a static file opened a week later, must not show a stale day count.
  // Same reason `data-posted-ms` exists. The server only ships the raw facts.
  const app = job.application;
  const appliedMs = app?.appliedAt ? new Date(app.appliedAt).getTime() : "";
  const statusMs = app ? new Date(app.statusAt).getTime() : "";
  const statusPill = app ? `<span class="status" data-role="pill"></span>` : "";
  const noteText = app?.note
    ? `<p class="app-note" data-role="note">${escapeHtml(app.note)}</p>`
    : `<p class="app-note" data-role="note" hidden></p>`;
  const statusBtns = config.applicationStatuses
    .map(
      (s) =>
        `<button class="st" data-s="${s}" aria-pressed="${app?.status === s}">${STATUS_LABELS[s]}</button>`,
    )
    .join("");
  const actionRow = review
    ? `<div class="actions">
         ${statusBtns}
         <button class="note-btn" data-role="note-btn" title="Add a note" aria-label="Add a note"${app ? "" : " hidden"}>📝</button>
       </div>`
    : "";

  return `
  <article class="card ${v}" data-job-id="${escapeHtml(job.id)}" data-verdict="${v}" data-llm-verdict="${c.verdict}" data-edited="${o?.verdict ? "1" : ""}" data-source="${escapeHtml(job.source)}" data-posted-ms="${postedAttr}" data-score="${f ? f.score : ""}" data-title="${escapeHtml(job.title)}" data-company="${escapeHtml(job.company)}" data-reason="${escapeHtml(o?.reason ?? "")}" data-rule-tag="${escapeHtml(o?.ruleTag ?? "")}" data-status="${app?.status ?? ""}" data-applied-ms="${appliedMs}" data-status-ms="${statusMs}">
    <div class="head">
      ${scoreChip}
      <span class="badge ${v}">${v}</span>
      ${statusPill}
      ${editedBadge}
      ${newBadge}
      <h3><a href="${escapeHtml(job.url)}" target="_blank" rel="noopener">${escapeHtml(job.title)}</a></h3>
      ${editBtn}
    </div>
    <div class="sub">
      <span>${escapeHtml(job.company)}</span>
      <span class="dot">·</span>
      <span class="src">${escapeHtml(sourceLabel(job.source))}</span>
      <span class="dot">·</span>
      <span class="posted">${escapeHtml(relativeAge(job.postedAt))}</span>
    </div>
    ${overrideNote}
    ${fitBlock}
    <p class="reason">${escapeHtml(c.reason)}</p>
    ${evidence}
    ${tz}
    ${recruiter}
    ${noteText}
    ${actionRow}
  </article>`;
}

// Review-mode client script. Runs inside the main IIFE, so it reuses `cards`, `apply()` and
// `recount()`. Edits repaint the card in place rather than reloading, so scroll position and
// the active filter chips survive. No `${` or backticks in here — it's a template literal.
const REVIEW_JS = `
  var modal = document.getElementById('edit-modal');
  var mTitle = document.getElementById('m-title');
  var mCompany = document.getElementById('m-company');
  var mLlm = document.getElementById('m-llm');
  var mReason = document.getElementById('m-reason');
  var mTag = document.getElementById('m-tag');
  var mErr = document.getElementById('m-error');
  var mRevert = document.getElementById('m-revert');
  var vBtns = Array.prototype.slice.call(document.querySelectorAll('#m-verdict button'));
  var current = null, picked = null;

  function pick(v) {
    picked = v;
    vBtns.forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.v === v)); });
  }
  vBtns.forEach(function (b) { b.addEventListener('click', function () { pick(b.dataset.v); }); });

  function openFor(card) {
    current = card;
    mErr.textContent = '';
    mTitle.textContent = card.dataset.title;
    mCompany.textContent = card.dataset.company;
    mLlm.textContent = card.dataset.llmVerdict;
    mReason.value = card.dataset.reason || '';
    mTag.value = card.dataset.ruleTag || '';
    pick(card.dataset.verdict);
    mRevert.hidden = !card.dataset.edited;
    modal.showModal();
  }
  document.querySelectorAll('.edit').forEach(function (btn) {
    btn.addEventListener('click', function () { openFor(btn.closest('.card')); });
  });

  function paint(card, verdict, reason, tag, edited) {
    card.className = 'card ' + verdict;
    card.dataset.verdict = verdict;
    card.dataset.reason = reason || '';
    card.dataset.ruleTag = tag || '';
    if (edited) { card.dataset.edited = '1'; } else { delete card.dataset.edited; }

    var badge = card.querySelector('.badge');
    badge.className = 'badge ' + verdict;
    badge.textContent = verdict;

    var editedBadge = card.querySelector('.edited');
    if (edited && !editedBadge) {
      editedBadge = document.createElement('span');
      editedBadge.className = 'edited';
      editedBadge.textContent = 'EDITED';
      badge.insertAdjacentElement('afterend', editedBadge);
    } else if (!edited && editedBadge) {
      editedBadge.remove();
    }

    var note = card.querySelector('.override');
    if (!edited) {
      if (note) note.remove();
    } else {
      if (!note) {
        note = document.createElement('p');
        note.className = 'override';
        card.querySelector('.sub').insertAdjacentElement('afterend', note);
      }
      note.innerHTML = '';
      var llm = card.dataset.llmVerdict;
      if (llm !== verdict) {
        var s = document.createElement('span');
        s.className = 'llm-said';
        s.textContent = 'LLM said: ' + llm;
        note.appendChild(s);
      }
      if (reason) {
        var w = document.createElement('span');
        w.className = 'why';
        w.textContent = reason;
        note.appendChild(w);
      }
      if (tag) {
        var t = document.createElement('span');
        t.className = 'tag';
        t.textContent = tag;
        note.appendChild(t);
      }
    }
    apply();
    recount();
  }

  function post(url, body) {
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function (r) {
      return r.json().then(function (j) {
        if (!r.ok || !j.ok) throw new Error(j.error || 'save failed');
        return j;
      });
    });
  }

  document.getElementById('m-save').addEventListener('click', function () {
    if (!current) return;
    mErr.textContent = '';
    var body = { jobId: current.dataset.jobId, verdict: picked, reason: mReason.value.trim(), ruleTag: mTag.value };
    post('/label', body).then(function () {
      paint(current, picked, body.reason, body.ruleTag, true);
      modal.close();
    }).catch(function (e) { mErr.textContent = e.message; });
  });

  mRevert.addEventListener('click', function () {
    if (!current) return;
    mErr.textContent = '';
    post('/label/clear', { jobId: current.dataset.jobId }).then(function () {
      paint(current, current.dataset.llmVerdict, '', '', false);
      modal.close();
    }).catch(function (e) { mErr.textContent = e.message; });
  });

  document.getElementById('m-cancel').addEventListener('click', function () { modal.close(); });

  // ---- application funnel ----
  // Repaint in place (never reload): mid-queue, a reload would lose scroll position and the
  // active filter chips. Same reason the verdict modal repaints rather than refreshing.
  function paintStatus(card, app) {
    card.dataset.status = app ? app.status : '';
    card.dataset.appliedMs = app && app.appliedAt ? String(new Date(app.appliedAt).getTime()) : '';
    card.dataset.statusMs = app ? String(new Date(app.statusAt).getTime()) : '';

    card.querySelectorAll('.st').forEach(function (b) {
      b.setAttribute('aria-pressed', String(!!app && b.dataset.s === app.status));
    });
    var noteBtn = card.querySelector('[data-role="note-btn"]');
    if (noteBtn) noteBtn.hidden = !app;
    var noteEl = card.querySelector('[data-role="note"]');
    if (noteEl) {
      noteEl.textContent = (app && app.note) || '';
      noteEl.hidden = !(app && app.note);
    }
    fillStatus(card);
    apply();
    refunnel();
  }

  document.querySelectorAll('.st').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var card = btn.closest('.card');
      var want = btn.dataset.s;
      // Clicking the ACTIVE status undoes it — the mis-click path. Anything else is a new event.
      var isActive = btn.getAttribute('aria-pressed') === 'true';
      var url = isActive ? '/status/undo' : '/status';
      var body = isActive ? { jobId: card.dataset.jobId } : { jobId: card.dataset.jobId, status: want };
      btn.disabled = true;
      post(url, body).then(function (j) {
        if (isActive) {
          paintStatus(card, j.application || null); // may fall back to an EARLIER event, not none
        } else {
          var prevApplied = card.dataset.appliedMs;
          paintStatus(card, {
            status: want,
            note: (card.querySelector('[data-role="note"]') || {}).textContent || null,
            // applied_at is the FIRST time it entered 'applied' and survives later stages,
            // so an interview/rejection must not clear the clock it was measured against.
            appliedAt: want === 'applied' && !prevApplied ? j.at
                     : prevApplied ? new Date(parseInt(prevApplied, 10)).toISOString() : undefined,
            statusAt: j.at
          });
        }
      }).catch(function (e) { alert(e.message); })
        .then(function () { btn.disabled = false; });
    });
  });

  var noteModal = document.getElementById('note-modal');
  var nText = document.getElementById('n-text');
  var nCompany = document.getElementById('n-company');
  var nErr = document.getElementById('n-error');
  var noteCard = null;

  document.querySelectorAll('[data-role="note-btn"]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      noteCard = btn.closest('.card');
      nErr.textContent = '';
      nCompany.textContent = noteCard.dataset.company;
      var el = noteCard.querySelector('[data-role="note"]');
      nText.value = (el && el.textContent) || '';
      noteModal.showModal();
    });
  });
  document.getElementById('n-cancel').addEventListener('click', function () { noteModal.close(); });
  document.getElementById('n-save').addEventListener('click', function () {
    if (!noteCard) return;
    nErr.textContent = '';
    var text = nText.value.trim();
    post('/status/note', { jobId: noteCard.dataset.jobId, note: text }).then(function () {
      var el = noteCard.querySelector('[data-role="note"]');
      if (el) { el.textContent = text; el.hidden = !text; }
      noteModal.close();
    }).catch(function (e) { nErr.textContent = e.message; });
  });
`;

export function renderDigest(jobs: ClassifiedJob[], opts: { review?: boolean } = {}): string {
  const review = opts.review ?? false;
  const pass = jobs.filter((j) => effectiveVerdict(j) === "PASS");
  const maybe = jobs.filter((j) => effectiveVerdict(j) === "MAYBE");
  const reject = jobs.filter((j) => effectiveVerdict(j) === "REJECT");
  const edited = jobs.filter((j) => j.override?.verdict).length;
  const scored = jobs.filter((j) => j.fit).length; // drives the default sort
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
  // Status chips default to the working queue (no-status + shortlisted): open the digest and
  // you see only what still needs a decision. Everything acted on is one click away.
  const statusChips = BUCKETS.map(
    (b) =>
      `<button class="chip status-chip ${b}${DEFAULT_BUCKETS.has(b) ? " active" : ""}" data-type="status" data-value="${b}">${BUCKET_LABELS[b]}</button>`,
  ).join("");
  // Counts are filled in by refunnel() against the live clock — `ghosted` depends on elapsed
  // days, so a server-rendered number would be wrong the moment the page sat open.
  const funnelBar = BUCKETS.filter((b) => b !== "none")
    .map(
      (b) =>
        `<button class="fn ${b}" data-bucket="${b}"><b>0</b> <span>${BUCKET_LABELS[b].toLowerCase()}</span></button>`,
    )
    .join("");

  // Flat list: undated first, then newest → oldest.
  const listCards =
    [...jobs].sort(byPostedDesc).map((j) => card(j, review)).join("\n") || `<p class="none">No jobs.</p>`;

  // One shared modal for editing a job's VERDICT (review mode only) — reason + rule tag.
  // Funnel status is deliberately NOT here: it lives on the card as a one-click button row,
  // because it is used two or three times a day and a modal would cost three clicks each time.
  const tagOptions = config.ruleTags.map((t) => `<option value="${t}">${t}</option>`).join("");
  const modal = review
    ? `
<dialog id="edit-modal">
  <form method="dialog" id="edit-form">
    <h2 id="m-title">Edit job</h2>
    <p class="m-sub"><span id="m-company"></span> · <span class="m-llm">LLM said: <b id="m-llm"></b></span></p>

    <label class="m-label">Categorization</label>
    <div class="segmented" id="m-verdict">
      <button type="button" data-v="PASS">PASS</button>
      <button type="button" data-v="MAYBE">MAYBE</button>
      <button type="button" data-v="REJECT">REJECT</button>
    </div>

    <label class="m-label" for="m-reason">Why are you changing it?</label>
    <textarea id="m-reason" rows="3" placeholder="e.g. JD explicitly says they hire worldwide"></textarea>

    <label class="m-label" for="m-tag">Which rule got it wrong? (optional)</label>
    <select id="m-tag"><option value="">— none —</option>${tagOptions}</select>

    <div class="m-actions">
      <button type="button" id="m-revert" class="danger">Revert to LLM</button>
      <span class="m-spacer"></span>
      <button type="button" id="m-cancel">Cancel</button>
      <button type="button" id="m-save" class="primary">Save</button>
    </div>
    <p class="m-error" id="m-error"></p>
  </form>
</dialog>
<dialog id="note-modal">
  <form method="dialog">
    <h2>Note</h2>
    <p class="m-sub"><span id="n-company"></span></p>
    <label class="m-label" for="n-text">Anything worth remembering about this application?</label>
    <textarea id="n-text" rows="3" placeholder="e.g. referred by X · recruiter said they'd reply in 2 weeks"></textarea>
    <div class="m-actions">
      <span class="m-spacer"></span>
      <button type="button" id="n-cancel">Cancel</button>
      <button type="button" id="n-save" class="primary">Save</button>
    </div>
    <p class="m-error" id="n-error"></p>
  </form>
</dialog>`
    : "";

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
  #date-filter, #sort-by, #min-score { font: inherit; font-size: 12px; padding: 3px 8px; border-radius: 999px;
                 border: 1px solid #ccc; background: transparent; color: #444; cursor: pointer; }
  .showing { font-size: 12px; color: #888; margin-top: 8px; }
  .card { background: #fff; border: 1px solid #e5e5e5; border-left-width: 4px;
          border-radius: 8px; padding: 14px 16px; margin: 10px 0; }
  .card.PASS { border-left-color: #1a7f37; }
  .card.MAYBE { border-left-color: #bf8700; }
  .card.REJECT { border-left-color: #cf222e; }
  .head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .head h3 { font-size: 16px; margin: 0; }
  /* The title is the link to the posting; keep it looking like a title until hovered. */
  .head h3 a { color: inherit; text-decoration: none; }
  .head h3 a:hover, .head h3 a:focus-visible { text-decoration: underline; }
  /* Role-fit score chip */
  .score { font-size: 13px; font-weight: 700; padding: 2px 8px; border-radius: 6px; color: #fff; min-width: 34px; text-align: center; }
  .of-ten { font-size: 10px; font-weight: 600; opacity: .75; margin-left: 1px; }
  .score.hi  { background: #1a7f37; }
  .score.mid { background: #bf8700; }
  .score.lo  { background: #6e7781; }
  .score.vlo { background: #b0b6bd; }
  .fit { margin: 8px 0; padding: 10px 12px; background: #f6f8fa; border: 1px solid #e5e5e5; border-radius: 6px; }
  .fit-reason { margin: 0 0 8px; font-size: 13px; color: #333; }
  .fit-col h4 { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em;
                color: #888; margin: 8px 0 3px; }
  .fit ul { margin: 0; padding-left: 18px; font-size: 13px; }
  .fit ul.good li { color: #1a7f37; }
  .fit ul.bad li { color: #9a3412; }
  .fit ul li span, .fit ul li { color: inherit; }
  /* Funnel: status pill on the card, action row, filter chips, funnel bar. */
  .status { font-size: 10px; font-weight: 700; letter-spacing: .04em; padding: 2px 7px;
            border-radius: 999px; color: #fff; white-space: nowrap; }
  .status.shortlisted { background: #6e7781; }
  .status.applied     { background: #0969da; }
  .status.interview   { background: #1a7f37; }
  .status.ghosted     { background: #bf8700; }  /* same warning colour as a weak fit band */
  .status.rejected    { background: #cf222e; }
  .actions { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin: 10px 0 0;
             padding-top: 10px; border-top: 1px solid #eee; }
  .st { font: inherit; font-size: 12px; padding: 4px 10px; border-radius: 999px; cursor: pointer;
        border: 1px solid #d0d7de; background: transparent; color: #57606a; }
  .st:hover { background: #f0f2f4; color: #1a1a1a; }
  .st[aria-pressed="true"] { background: #1a1a1a; border-color: #1a1a1a; color: #fff; }
  .note-btn { font-size: 12px; padding: 4px 8px; border-radius: 6px; cursor: pointer;
              border: 1px solid #d0d7de; background: transparent; margin-left: auto; }
  .app-note { margin: 8px 0 0; font-size: 13px; color: #57606a; font-style: italic; }
  .chip.status-chip.active { background: #1a1a1a; border-color: #1a1a1a; color: #fff; }
  .funnel-row { gap: 4px; }
  .fn { font: inherit; font-size: 12px; padding: 3px 9px; border-radius: 999px; cursor: pointer;
        border: 1px solid transparent; background: #f0f2f4; color: #57606a; }
  .fn:hover { border-color: #d0d7de; }
  .fn b { color: #1a1a1a; }
  /* Edit button pinned to the card's top-right. */
  .edit { margin-left: auto; cursor: pointer; font-size: 14px; line-height: 1; padding: 4px 8px;
          border: 1px solid #d0d7de; border-radius: 6px; background: transparent; color: #57606a; }
  .edit:hover { background: #f0f2f4; color: #1a1a1a; }
  .edited { font-size: 10px; font-weight: 700; color: #8250df; border: 1px solid #8250df;
            border-radius: 4px; padding: 1px 5px; }
  .override { margin: 6px 0; font-size: 13px; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .override .llm-said { color: #999; text-decoration: line-through; }
  .override .why { color: #333; }
  .override .tag { font-size: 11px; background: #eee; color: #555; border-radius: 999px; padding: 1px 8px; }
  /* Edit modal */
  #edit-modal { border: 1px solid #d0d7de; border-radius: 10px; padding: 0; max-width: 520px; width: 92%;
                color: #1a1a1a; background: #fff; }
  #edit-modal::backdrop { background: rgba(0,0,0,.45); }
  #edit-form { padding: 18px 20px; margin: 0; }
  #edit-form h2 { font-size: 17px; margin: 0 0 2px; }
  .m-sub { color: #666; font-size: 13px; margin: 0 0 14px; }
  .m-label { display: block; font-size: 11px; font-weight: 700; color: #888; text-transform: uppercase;
             letter-spacing: .04em; margin: 12px 0 6px; }
  .segmented { display: flex; gap: 6px; }
  .segmented button { flex: 1; cursor: pointer; font: inherit; font-size: 13px; font-weight: 600; padding: 7px 0;
                      border: 1px solid #d0d7de; border-radius: 6px; background: transparent; color: #57606a; }
  .segmented button[aria-pressed="true"] { color: #fff; border-color: transparent; }
  .segmented button[data-v="PASS"][aria-pressed="true"] { background: #1a7f37; }
  .segmented button[data-v="MAYBE"][aria-pressed="true"] { background: #bf8700; }
  .segmented button[data-v="REJECT"][aria-pressed="true"] { background: #cf222e; }
  #m-reason, #m-tag { width: 100%; font: inherit; font-size: 13px; padding: 7px 9px;
                      border: 1px solid #d0d7de; border-radius: 6px; background: transparent; color: inherit; }
  .m-actions { display: flex; align-items: center; gap: 8px; margin-top: 18px; }
  .m-spacer { flex: 1; }
  .m-actions button { cursor: pointer; font: inherit; font-size: 13px; padding: 7px 14px; border-radius: 6px;
                      border: 1px solid #d0d7de; background: transparent; color: inherit; }
  .m-actions .primary { background: #0969da; border-color: transparent; color: #fff; font-weight: 600; }
  .m-actions .danger { color: #cf222e; border-color: #f0c4c8; }
  .m-actions .danger[hidden] { display: none; }
  .m-error { color: #cf222e; font-size: 12px; margin: 10px 0 0; min-height: 1em; }
  .badge { font-size: 11px; font-weight: 700; padding: 2px 7px; border-radius: 4px; color: #fff; }
  .badge.PASS { background: #1a7f37; } .badge.MAYBE { background: #bf8700; } .badge.REJECT { background: #cf222e; }
  .new { font-size: 10px; font-weight: 700; color: #0969da; border: 1px solid #0969da; border-radius: 4px; padding: 1px 5px; }
  .sub { color: #666; font-size: 13px; margin: 4px 0 8px; }
  .sub .src { font-weight: 600; }
  .sub .posted { font-weight: 600; color: #444; }
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
    #date-filter, #sort-by, #min-score { border-color: #444c56; color: #c9d1d9; }
    .card { background: #161b22; border-color: #30363d; }
    blockquote { background: #21262d; border-left-color: #444c56; color: #c9d1d9; }
    .ask { background: #2d2410; }
    .summary, .sub, .meta, .showing { color: #8b949e; }
    .sub .posted { color: #c9d1d9; }
    .fit { background: #21262d; border-color: #30363d; }
    .fit-reason { color: #c9d1d9; }
    .fit ul.good li { color: #3fb950; }
    .fit ul.bad li { color: #f0883e; }
    .edit { border-color: #444c56; color: #8b949e; }
    .edit:hover { background: #21262d; color: #e6edf3; }
    .override .why { color: #c9d1d9; }
    .override .tag { background: #21262d; color: #8b949e; }
    #edit-modal, #note-modal { background: #161b22; border-color: #30363d; color: #e6edf3; }
    .segmented button, .m-actions button, #m-reason, #m-tag, #n-text { border-color: #444c56; color: #c9d1d9; }
    #m-reason, #m-tag, #n-text { background: #0d1117; }
    .m-actions .primary { background: #1f6feb; color: #fff; }
    .actions { border-top-color: #30363d; }
    .st, .note-btn { border-color: #444c56; color: #8b949e; }
    .st:hover, .note-btn:hover { background: #21262d; color: #e6edf3; }
    .st[aria-pressed="true"] { background: #e6edf3; border-color: #e6edf3; color: #0d1117; }
    .app-note { color: #8b949e; }
    .chip.status-chip.active { background: #e6edf3; border-color: #e6edf3; color: #0d1117; }
    .fn { background: #21262d; color: #8b949e; }
    .fn b { color: #e6edf3; }
    .fn:hover { border-color: #444c56; }
  }
</style>
</head>
<body>
<header>
  <h1>Remote PM Job Digest${review ? ` <span class="edited">REVIEW MODE</span>` : ""}</h1>
  <div class="summary">Generated ${now} · <span id="tally">${jobs.length} classified · ${pass.length} PASS · ${maybe.length} MAYBE · ${reject.length} REJECT${edited ? ` · ${edited} edited by hand` : ""}</span>${scored ? ` · ${scored} scored for fit` : ""} · candidate UTC+7 (Bangkok)</div>
</header>
<div class="filters">
  <div class="filter-row funnel-row"><span class="filter-label">Funnel</span><span id="funnel">${funnelBar}</span></div>
  <div class="filter-row"><span class="filter-label">Status</span>${statusChips}</div>
  <div class="filter-row"><span class="filter-label">Verdict</span>${verdictChips}</div>
  <div class="filter-row"><span class="filter-label">Source</span>${sourceChips}</div>
  <div class="filter-row"><span class="filter-label">Posted</span>
    <select id="date-filter">
      <option value="0" selected>Anytime</option>
      <option value="1">Last 24 hours</option>
      <option value="7">Last 7 days</option>
      <option value="30">Last 30 days</option>
    </select>
  </div>
  <div class="filter-row"><span class="filter-label">Fit</span>
    <select id="sort-by">
      <option value="score" ${scored ? "selected" : ""}>Sort: fit score (high→low)</option>
      <option value="date" ${scored ? "" : "selected"}>Sort: date posted (newest)</option>
    </select>
    <select id="min-score">
      <option value="0" selected>Any score</option>
      <option value="5">5.0+</option>
      <option value="6">6.0+</option>
      <option value="7">7.0+</option>
      <option value="8">8.0+</option>
    </select>
  </div>
  <div class="showing">Showing <span id="shown-count">0</span> of ${jobs.length} jobs · click chips to toggle</div>
</div>
<div id="job-list">
${listCards}
</div>
${modal}
<script>
(function () {
  var DAY_MS = 86400000;
  var GHOST_DAYS = ${config.ghostedAfterDays};
  var BUCKET_LABELS = ${JSON.stringify(BUCKET_LABELS)};
  var state = { verdict: {}, source: {}, status: {} };
  var chips = document.querySelectorAll('.chip');
  chips.forEach(function (c) { state[c.dataset.type][c.dataset.value] = c.classList.contains('active'); });
  var cards = Array.prototype.slice.call(document.querySelectorAll('.card'));
  var countEl = document.getElementById('shown-count');
  var dateSel = document.getElementById('date-filter');
  var sortSel = document.getElementById('sort-by');
  var minScoreSel = document.getElementById('min-score');
  var listEl = document.getElementById('job-list');
  function withinWindow(card) {
    var days = parseInt(dateSel.value, 10);
    if (!days) return true;                 // Anytime
    var raw = card.dataset.postedMs;
    if (!raw) return true;                   // undated → always visible, never lost
    return (Date.now() - parseInt(raw, 10)) <= days * DAY_MS;
  }
  function meetsScore(card) {
    var min = parseFloat(minScoreSel.value);
    if (!min) return true;                   // Any score
    var raw = card.dataset.score;
    if (!raw) return true;                   // unscored → never silently lost
    return parseFloat(raw) >= min;
  }
  // Which funnel bucket a card is in, RIGHT NOW. 'ghosted' is derived here rather than stored:
  // it is 'applied' plus elapsed silence, so it can only be decided against the live clock.
  // A digest left open overnight re-derives it on the next apply(); a stored flag would rot.
  function bucketOf(card) {
    var s = card.dataset.status;
    if (!s) return 'none';
    if (s === 'applied') {
      var raw = card.dataset.appliedMs;
      if (raw && (Date.now() - parseInt(raw, 10)) >= GHOST_DAYS * DAY_MS) return 'ghosted';
    }
    return s;
  }
  function meetsStatus(card) { return !!state.status[bucketOf(card)]; }
  // Paint the pill: "APPLIED · 3d". Text lives here, not in the server-rendered HTML, for the
  // same reason bucketOf() does — the day count is relative to now.
  function fillStatus(card) {
    var pill = card.querySelector('[data-role="pill"]');
    var b = bucketOf(card);
    if (!pill) return;
    if (b === 'none') { pill.hidden = true; return; }
    pill.hidden = false;
    pill.className = 'status ' + b;
    // APPLIED/GHOSTED count from the application date (how long the silence has run).
    // INTERVIEW/REJECTED/SHORTLISTED count from when that status was set.
    var since = (b === 'applied' || b === 'ghosted') ? card.dataset.appliedMs : card.dataset.statusMs;
    var label = BUCKET_LABELS[b].toUpperCase();
    if (since) {
      var d = Math.floor((Date.now() - parseInt(since, 10)) / DAY_MS);
      label += ' · ' + d + 'd';
    }
    pill.textContent = label;
  }
  // Re-order the DOM. Unscored jobs sort last under "fit score"; undated first under "date".
  function sortCards() {
    var byScore = sortSel.value === 'score';
    var sorted = cards.slice().sort(function (a, b) {
      if (byScore) {
        var as = a.dataset.score === '' ? -1 : parseFloat(a.dataset.score);
        var bs = b.dataset.score === '' ? -1 : parseFloat(b.dataset.score);
        if (as !== bs) return bs - as;
      }
      var am = a.dataset.postedMs === '' ? Infinity : parseInt(a.dataset.postedMs, 10);
      var bm = b.dataset.postedMs === '' ? Infinity : parseInt(b.dataset.postedMs, 10);
      if (am === Infinity && bm === Infinity) return 0;
      if (am === Infinity) return -1;
      if (bm === Infinity) return 1;
      return bm - am;
    });
    var frag = document.createDocumentFragment();
    sorted.forEach(function (c) { frag.appendChild(c); });
    listEl.appendChild(frag);
  }
  var tallyEl = document.getElementById('tally');
  // Header tally reflects the EFFECTIVE verdicts currently on the page, so it stays
  // truthful after a hand-edit changes a card's verdict.
  function recount() {
    if (!tallyEl) return;
    var t = { PASS: 0, MAYBE: 0, REJECT: 0 }, edited = 0;
    cards.forEach(function (c) { t[c.dataset.verdict]++; if (c.dataset.edited) edited++; });
    tallyEl.textContent = cards.length + ' classified · ' + t.PASS + ' PASS · ' + t.MAYBE +
      ' MAYBE · ' + t.REJECT + ' REJECT' + (edited ? ' · ' + edited + ' edited by hand' : '');
  }
  // Funnel counts, recomputed from the live DOM so they stay true after a status change.
  var funnelEl = document.getElementById('funnel');
  function refunnel() {
    if (!funnelEl) return;
    var t = {};
    cards.forEach(function (c) { var b = bucketOf(c); t[b] = (t[b] || 0) + 1; });
    funnelEl.querySelectorAll('[data-bucket]').forEach(function (el) {
      el.querySelector('b').textContent = t[el.dataset.bucket] || 0;
    });
  }
  function apply() {
    var shown = 0;
    cards.forEach(function (card) {
      var show = state.verdict[card.dataset.verdict] && state.source[card.dataset.source]
        && meetsStatus(card) && withinWindow(card) && meetsScore(card);
      card.style.display = show ? '' : 'none';
      if (show) shown++;
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
  dateSel.addEventListener('change', apply);
  minScoreSel.addEventListener('change', apply);
  sortSel.addEventListener('change', sortCards);

  // Funnel bar doubles as a shortcut: clicking a bucket isolates it.
  if (funnelEl) {
    funnelEl.querySelectorAll('[data-bucket]').forEach(function (el) {
      el.addEventListener('click', function () {
        var want = el.dataset.bucket;
        chips.forEach(function (c) {
          if (c.dataset.type !== 'status') return;
          var on = c.dataset.value === want;
          state.status[c.dataset.value] = on;
          c.classList.toggle('active', on);
        });
        apply();
      });
    });
  }

  cards.forEach(fillStatus);
  sortCards();
  apply();
  recount();
  refunnel();
${review ? REVIEW_JS : ""}
})();
</script>
</body>
</html>`;
}
