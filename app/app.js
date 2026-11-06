// CONVERGE — premium operations workspace (Direction B, elevated).
// All money/percentages come from the API (deterministic engine). Nothing
// is hard-coded except labelled demo seed data (COURT blind scores) and
// static product copy. Switch mode comes from /api/status: REAL-SWITCH
// when the app is pointed at a live server, SIMULATED-STUB otherwise.
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => '$' + Number(n).toFixed(2);
const pct = (n) => Number(n).toFixed(2) + '%';
const fmtTime = (iso) => { try { return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }); } catch { return '—'; } };
const fmtDateTime = (iso) => { try { return new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return '—'; } };

async function api(path, opts) {
  const r = await fetch(path, opts);
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.error || `Request failed (${r.status})`);
  return body;
}

// Valid next states — mirrors server/engine.js TRANSITIONS.
const TRANSITIONS = {
  DRAFT: ['INTAKE', 'CANCELLED'], INTAKE: ['INVESTIGATING', 'BLOCKED', 'CANCELLED'],
  INVESTIGATING: ['DISCUSSION', 'BLOCKED', 'CANCELLED'], DISCUSSION: ['PROPOSAL', 'BLOCKED', 'CANCELLED'],
  PROPOSAL: ['AWAITING_APPROVAL', 'DISCUSSION', 'REJECTED', 'CANCELLED'],
  AWAITING_APPROVAL: ['APPROVED', 'REJECTED', 'DISCUSSION'],
  APPROVED: ['COMPLETED', 'BLOCKED'], COMPLETED: [],
  REJECTED: ['DISCUSSION', 'CANCELLED'], BLOCKED: ['INTAKE', 'INVESTIGATING', 'DISCUSSION', 'CANCELLED'], CANCELLED: [],
};
const STEPS = ['Draft', 'Investigating', 'Discussion', 'Proposal', 'Awaiting approval', 'Approved'];
const STEP_INDEX = { DRAFT: 0, INTAKE: 0, INVESTIGATING: 1, DISCUSSION: 2, PROPOSAL: 3, AWAITING_APPROVAL: 4, APPROVED: 5, COMPLETED: 5 };
const TERMINAL_NEG = ['REJECTED', 'BLOCKED', 'CANCELLED'];

// HAGGLE strategy -> approval terms. Terms text is the exact wording the
// owner signs; the price/duration come from the strategy data itself.
const STRATEGY_TERMS = {
  'freeze': { short: '$0.16 / fl oz · 4 weeks', full: '$0.16/fl oz for 4 weeks, with a 25 L/week volume commitment' },
  'counter-019': { short: '$0.19 / fl oz · 6 weeks', full: '$0.19/fl oz for 6 weeks, in writing' },
  'volume-021': { short: '$0.21 / fl oz · 25 L/week', full: '$0.21/fl oz with a 25 L/week volume commitment' },
  'alternative-018': { short: '$0.18 / fl oz · alt. supplier', full: '$0.18/fl oz from the alternative supplier (quality and delivery to be verified before switching)' },
  'gradual': { short: '$0.20 / fl oz · review 4 wks', full: '$0.20/fl oz now, reviewed in 4 weeks (owner\u2019s max approved price)' },
  'substitute': { short: 'Trial blend · one dish', full: 'Trial of a lower-cost cream blend on one dish only, with a blind taste test before any menu change' },
};
const PROPOSAL_TO_STRATEGY = { P1: 'freeze', P2: 'counter-019' };

// COURT blind scores — FALLBACK only. The server now holds the ratings
// (GET /api/cases/CRT-007 returns ratings + tally; POST /api/court/rate
// persists new ones). This fallback is used only if the case carries no
// ratings at all — and it deliberately carries NO sample→version mapping
// and NO seed scores: the mapping is blind information the server
// withholds until every reader has submitted (hardening 2026-11-06), so
// it must not sit in the shipped bundle either. With no ratings the UI
// shows the blind empty state (codes only, tally hidden).
const COURT_DEMO = {
  samples: { S1: 'S1', S2: 'S2', S3: 'S3' },
  criteria: ['taste', 'texture', 'aroma', 'appearance', 'difficulty', 'overall'],
  readers: ['Reader A', 'Reader B', 'Reader C'],
  scores: {},
};
// CORRECTION claim -> evidence mapping, derived from the seeded evidence notes:
// E1 (co-led survey) bears on the "I led" claim; E2 (paper says 38%) on the "40%" claim.
const CLAIM_EVIDENCE = { C1: ['E1'], C2: ['E2'], C3: [] };

// ---------- state ----------
let statusData = null;
let cases = [];
let details = {};
let view = 'overview';
let currentCaseId = null;
let currentTab = 'overview';
let selectedStrategy = null;
let courtSample = 'S1';
let evidenceFilter = 'All';
let searchQuery = '';
let roomCaseId = null;
let claimLocal = {}; // caseId -> claimId -> {status, challenge:{text, evidence, by}}

function counterparty(c) {
  if (c.workflow === 'HAGGLE') return c.input?.supplier || '—';
  if (c.workflow === 'COURT') return 'Family group';
  if (c.workflow === 'CORRECTION') return (c.participants || []).find((p) => p.role === 'guest')?.name || '—';
  return '—';
}
function isActive(c) { return !['COMPLETED', 'REJECTED', 'CANCELLED'].includes(c.state); }
function statePill(state) {
  const cls = { AWAITING_APPROVAL: 'pill-amber', APPROVED: 'pill-teal', COMPLETED: 'pill-teal', REJECTED: 'pill-red', BLOCKED: 'pill-red', CANCELLED: 'pill-grey' }[state] || 'pill-grey';
  return `<span class="pill ${cls}">${esc(state.replace(/_/g, ' '))}</span>`;
}
function courtScoresFor(c) {
  // Prefer the server-held ratings; fall back to the seed only when the
  // case carries none (e.g. a fresh store).
  if (c && (c.ratings || []).length) {
    const samples = {};
    for (const s of (c.samples || [])) {
      const v = (c.versions || []).find((x) => x.id === s.version);
      samples[s.code] = v ? v.author : s.code;
    }
    const scores = {};
    for (const r of c.ratings) {
      scores[r.sampleCode] = scores[r.sampleCode] || {};
      scores[r.sampleCode][r.reader] = r.scores;
    }
    return { samples, criteria: COURT_DEMO.criteria, readers: c.readers || COURT_DEMO.readers, scores };
  }
  return COURT_DEMO;
}
function getClaim(c, claim) {
  // Server status is authoritative (persisted + audited); the local map
  // only carries a challenge drafted in this session before reload.
  const local = (claimLocal[c.id] || {})[claim.id] || {};
  return { ...claim, challenge: local.challenge || claim.guestChallenge || null };
}
async function reloadCase(c) { details[c.id] = await api(`/api/cases/${c.id}`); }

// ---------- data loading ----------
async function loadAll() {
  statusData = await api('/api/status');
  cases = await api('/api/cases');
  const ds = await Promise.all(cases.map((c) => api(`/api/cases/${c.id}`)));
  details = Object.fromEntries(ds.map((d) => [d.id, d]));
  renderSwitchStatus();
  $('#nav-case-count').textContent = String(cases.filter(isActive).length);
}
function renderSwitchStatus() {
  const mode = statusData?.switchMode || 'SIMULATED-STUB';
  const live = mode === 'REAL-SWITCH';
  const unreachable = mode === 'SWITCH-UNREACHABLE';
  // BUG-3 (QA 2026-11-06): the mode is health-derived on the server
  // now, so an unreachable server shows SWITCH-UNREACHABLE here instead
  // of a false LIVE. Nothing in this function may claim "live" unless
  // the health probe succeeded.
  const text = `${mode} — Console 0.40.1 / core 0.31.0`;
  $('#sidebar-switch').textContent = 'Switch: ' + text;
  const pill = $('#switch-pill');
  pill.textContent = '● ' + mode;
  pill.title = live
    ? 'Live Switch server (core 0.31.0) — rooms are real Mattermost channels via the Switch bridge.'
    : unreachable
    ? 'Switch is configured but the server did not answer the health probe. Rooms and messages are NOT live right now.'
    : 'Simulated stub — not a live Switch connection. No real Mattermost room yet.';
  const drawerLabel = $('#drawer-sim-label');
  if (drawerLabel) {
    drawerLabel.textContent = live
      ? 'LIVE — real Switch room (Mattermost channel via the Switch bridge). Messages here are real.'
      : unreachable
      ? 'UNREACHABLE — Switch server configured but not responding. Messages here will not be delivered.'
      : 'SIMULATED — stub server, not Switch. Messages here are demo transcript only.';
    drawerLabel.classList.toggle('live-label', live);
    drawerLabel.classList.toggle('warn-label', unreachable);
  }
  const footerNote = $('#footer-switch-note');
  if (footerNote) {
    footerNote.textContent = live
      ? 'Switch integration is LIVE — real switch-core 0.31.0 + Mattermost via the Switch bridge (see docs/switch-live-integration.md).'
      : unreachable
      ? 'Switch integration is configured but the server is currently unreachable — the pill above shows SWITCH-UNREACHABLE until the health probe succeeds.'
      : 'Switch integration is a labelled simulation until a real Switch server (Console 0.40.1 / core 0.31.0) is connected.';
  }
}

// ---------- shell ----------
function setView(v) {
  view = v; currentCaseId = null; currentTab = 'overview';
  history.replaceState(null, '', location.pathname);
  $$('.nav-item').forEach((b) => {
    const on = b.dataset.view === v;
    b.classList.toggle('is-active', on);
    if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  render();
  $('#view').focus({ preventScroll: true });
}
function openCase(id, tab = 'overview') {
  currentCaseId = id; currentTab = tab;
  history.replaceState(null, '', `?case=${encodeURIComponent(id)}`);
  $$('.nav-item').forEach((b) => { b.classList.remove('is-active'); b.removeAttribute('aria-current'); });
  render();
  $('#view').focus({ preventScroll: true });
}
function backToDashboard() { setView('overview'); }
function setBreadcrumb(html) { $('#breadcrumb').innerHTML = html; }

function render() {
  if (currentCaseId && details[currentCaseId]) { renderCase(); return; }
  if (currentCaseId) { currentCaseId = null; }
  ({ overview: renderDashboard, cases: renderCasesView, workflows: renderWorkflows,
     evidence: renderEvidenceView, decisions: renderDecisionsView,
     activity: renderActivityView, settings: renderSettingsView }[view] || renderDashboard)();
}

// ---------- dashboard ----------
function kpiData() {
  const active = cases.filter(isActive).length;
  const awaiting = cases.filter((c) => c.state === 'AWAITING_APPROVAL').length;
  const extraMonth = Object.values(details)
    .filter((d) => d.workflow === 'HAGGLE' && d.analysis)
    .reduce((s, d) => s + d.analysis.monthlyExtraCost, 0);
  const weekAgo = Date.now() - 7 * 24 * 3600 * 1000;
  const decided = new Set();
  for (const d of Object.values(details)) {
    if (d.approval?.approvedAt && new Date(d.approval.approvedAt).getTime() >= weekAgo) decided.add(d.id);
    for (const a of (d.audit || [])) {
      if (/->APPROVED$/.test(a.event) && new Date(a.at).getTime() >= weekAgo) decided.add(d.id);
    }
  }
  return { active, awaiting, extraMonth, decided: decided.size };
}
function filteredCases() {
  const q = searchQuery.trim().toLowerCase();
  if (!q) return cases;
  return cases.filter((c) => [c.id, c.title, c.workflow, counterparty(c), c.state].join(' ').toLowerCase().includes(q));
}
function casesTableRows(list) {
  return list.map((c) => {
    const d = details[c.id] || c;
    const impact = d.workflow === 'HAGGLE' && d.analysis ? money(d.analysis.monthlyExtraCost) + '/mo' : '—';
    const updated = (d.audit && d.audit.length) ? fmtTime(d.audit[d.audit.length - 1].at) : '—';
    const owner = (d.participants || []).find((p) => p.role === 'owner' || p.role === 'host')?.name || '—';
    return `<tr class="clickable" data-open="${esc(c.id)}" tabindex="0">
      <td><span class="num">${esc(c.id)}</span><br><span class="muted small">${esc(c.title)}</span></td>
      <td>${esc(c.workflow)}</td><td>${esc(counterparty(c))}</td>
      <td class="num">${impact}</td><td>${statePill(c.state)}</td>
      <td>${esc(owner)}</td><td class="num">${updated}</td></tr>`;
  }).join('');
}
function bindCaseRows(root) {
  $$('[data-open]', root).forEach((row) => {
    // Rows are keyboard-operable: the Enter/Space handler below only
    // fires when the row can receive focus (QA 2026-11-06 — Workflows
    // and Evidence rows were mouse-only).
    row.tabIndex = 0;
    row.addEventListener('click', () => openCase(row.dataset.open));
    row.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openCase(row.dataset.open); } });
  });
}
function renderDashboard() {
  setBreadcrumb('Overview');
  const k = kpiData();
  const needs = cases.filter((c) => c.state === 'AWAITING_APPROVAL' || c.state === 'DISCUSSION');
  const activity = activityFeed().slice(0, 6);
  $('#view').innerHTML = `
    <h1 class="section-title">Overview</h1>
    <p class="section-sub">One shared decision engine across HAGGLE, COURT and CORRECTION. Humans approve; agents propose, calculate and investigate.</p>
    <div class="kpis" role="group" aria-label="Key figures">
      <div class="kpi"><small>Active cases</small><b>${k.active}</b><div class="kpi-note">${cases.length} total cases</div></div>
      <div class="kpi"><small>Awaiting approval</small><b>${k.awaiting}</b><div class="kpi-note">human decision required</div></div>
      <div class="kpi"><small>Extra cost this month</small><b>${money(k.extraMonth)}</b><div class="kpi-note">HAGGLE cases, deterministic</div></div>
      <div class="kpi"><small>Decisions this week</small><b>${k.decided}</b><div class="kpi-note">approved in the last 7 days</div></div>
    </div>
    <section class="panel" aria-labelledby="cases-h">
      <h2 id="cases-h">All cases</h2>
      <div class="table-wrap"><table>
        <caption>${searchQuery ? `Filtered by “${esc(searchQuery)}” — ` : ''}Click a row to open the case workspace.</caption>
        <thead><tr><th scope="col">Case</th><th scope="col">Workflow</th><th scope="col">Counterparty</th>
        <th scope="col" class="num">Impact</th><th scope="col">Stage</th><th scope="col">Owner</th><th scope="col" class="num">Updated</th></tr></thead>
        <tbody>${casesTableRows(filteredCases()) || `<tr><td colspan="7" class="empty">No cases match “${esc(searchQuery)}”.</td></tr>`}</tbody>
      </table></div>
    </section>
    <div class="dash-lower">
      <section class="panel" aria-labelledby="needs-h">
        <h2 id="needs-h">Needs a decision today</h2>
        ${needs.length ? needs.map((c) => {
          const d = details[c.id] || c;
          const need = c.state === 'AWAITING_APPROVAL'
            ? `Approve ${esc(d.pendingApproval?.terms || 'pending terms')}`
            : 'Discussion open — review the versions and vote';
          return `<div class="decision-row"><div><div class="dr-title"><span class="num">${esc(c.id)}</span> — ${esc(c.title)}</div>
            <div class="dr-sub">${need}</div></div>
            <button class="ghost-btn btn-sm" data-open="${esc(c.id)}">${c.state === 'AWAITING_APPROVAL' ? 'Review &amp; approve' : 'Open'}</button></div>`;
        }).join('') : '<p class="empty">Nothing needs a human decision today.</p>'}
      </section>
      <section class="panel" aria-labelledby="act-h">
        <h2 id="act-h">Recent agent activity</h2>
        ${activity.length ? activity.map((a) => `<div class="activity-item">${a.at ? `<span class="ai-time">${fmtTime(a.at)}</span>` : ''}${esc(a.text)}</div>`).join('') : '<p class="empty">No agent activity recorded yet in this demo session.</p>'}
        <p class="small muted" style="margin-top:8px">Derived from case records (proposals, approvals, audit events) — not a live feed.</p>
      </section>
    </div>`;
  bindCaseRows($('#view'));
}
function activityFeed() {
  const items = [];
  for (const d of Object.values(details)) {
    for (const a of (d.audit || [])) items.push({ at: a.at, text: `${a.actor} — ${a.event}` });
    for (const p of (d.proposals || [])) items.push({ at: null, text: `${p.by} submitted ${p.kind === 'counter-offer' ? 'a counter-offer' : 'a proposal'} on ${d.id}: ${p.text}` });
    if (d.pendingApproval) items.push({ at: null, text: `${d.pendingApproval.requestedBy} requested approval on ${d.id}: ${d.pendingApproval.terms}` });
  }
  return items.sort((a, b) => {
    if (a.at && b.at) return new Date(b.at) - new Date(a.at);
    return a.at ? -1 : 1;
  });
}

// ---------- secondary views ----------
function renderCasesView() {
  setBreadcrumb('Active Cases');
  $('#view').innerHTML = `
    <h1 class="section-title">Active Cases</h1>
    <p class="section-sub">${cases.filter(isActive).length} active of ${cases.length} total. Click a row to open the case workspace.</p>
    <section class="panel"><div class="table-wrap"><table>
      <caption>${searchQuery ? `Filtered by “${esc(searchQuery)}”.` : 'All cases in this workspace.'}</caption>
      <thead><tr><th scope="col">Case</th><th scope="col">Workflow</th><th scope="col">Counterparty</th>
      <th scope="col" class="num">Impact</th><th scope="col">Stage</th><th scope="col">Owner</th><th scope="col" class="num">Updated</th></tr></thead>
      <tbody>${casesTableRows(filteredCases()) || `<tr><td colspan="7" class="empty">No cases match.</td></tr>`}</tbody>
    </table></div></section>`;
  bindCaseRows($('#view'));
}
function renderWorkflows() {
  setBreadcrumb('Workflows');
  const rows = [
    ['HAGGLE', 'Margin-aware supplier negotiation', 'Draft → Investigating → Discussion → Proposal → Awaiting approval → Approved → Completed', 'HAG-014', 'Negotiation Agent, Financial Analyst'],
    ['COURT', 'Blind recipe testing and adjudication', 'Intake → Investigating → Discussion → Proposal → Approved', 'CRT-007', 'Facilitator Agent'],
    ['CORRECTION', 'Evidence-backed factual correction', 'Intake → Investigating → Discussion → Proposal → Approved', 'COR-003', 'Verification Agent'],
  ];
  $('#view').innerHTML = `
    <h1 class="section-title">Workflows</h1>
    <p class="section-sub">Three configurable workflows on one shared decision engine. Same states, same approval gate, same audit trail.</p>
    <section class="panel"><div class="table-wrap"><table>
      <caption>Workflow templates and their demo cases.</caption>
      <thead><tr><th scope="col">Workflow</th><th scope="col">Purpose</th><th scope="col">Stages</th><th scope="col">Demo case</th><th scope="col">Agents</th></tr></thead>
      <tbody>${rows.map((r) => `<tr class="clickable" data-open="${r[3]}"><td><strong>${r[0]}</strong></td><td>${r[1]}</td><td>${r[2]}</td><td class="num">${r[3]}</td><td>${r[4]}</td></tr>`).join('')}</tbody>
    </table></div></section>`;
  bindCaseRows($('#view'));
}
function allEvidence() {
  const out = [];
  for (const d of Object.values(details)) for (const e of (d.evidence || [])) out.push({ ...e, caseId: d.id, caseTitle: d.title });
  return out;
}
function renderEvidenceView() {
  setBreadcrumb('Evidence');
  const items = allEvidence().filter((e) => evidenceFilter === 'All' || e.status === evidenceFilter);
  const filters = ['All', 'Verified', 'Unverified', 'Disputed'];
  $('#view').innerHTML = `
    <h1 class="section-title">Evidence</h1>
    <p class="section-sub">Every claim cites numbered evidence with provenance. No evidence without a source.</p>
    <div class="filter-row" role="group" aria-label="Filter evidence by status">
      ${filters.map((f) => `<button class="ghost-btn btn-sm ${evidenceFilter === f ? 'is-active' : ''}" data-filter="${f}" aria-pressed="${evidenceFilter === f}">${f}</button>`).join('')}
    </div>
    <section class="panel"><div class="table-wrap"><table>
      <caption>${items.length} item${items.length === 1 ? '' : 's'}${evidenceFilter === 'All' ? '' : ` — status ${evidenceFilter}`}.</caption>
      <thead><tr><th scope="col">ID</th><th scope="col">Type</th><th scope="col">Source</th><th scope="col">Case</th><th scope="col">Status</th><th scope="col">Note</th></tr></thead>
      <tbody>${items.map((e) => `<tr class="clickable" data-open="${e.caseId}"><td><span class="tag-ev">[${esc(e.id)}]</span></td><td>${esc(e.type)}</td><td>${esc(e.source)}</td><td class="num">${esc(e.caseId)}</td><td>${esc(e.status)}</td><td class="muted">${esc(e.note || '')}</td></tr>`).join('') || `<tr><td colspan="6" class="empty">No evidence with status ${esc(evidenceFilter)}.</td></tr>`}</tbody>
    </table></div></section>`;
  $$('[data-filter]', $('#view')).forEach((b) => b.addEventListener('click', () => { evidenceFilter = b.dataset.filter; renderEvidenceView(); }));
  bindCaseRows($('#view'));
}
function renderDecisionsView() {
  setBreadcrumb('Decisions');
  const pending = cases.filter((c) => (details[c.id] || c).pendingApproval);
  const decided = cases.filter((c) => (details[c.id] || c).approval);
  $('#view').innerHTML = `
    <h1 class="section-title">Decisions</h1>
    <p class="section-sub">Approvals are human-only and recorded as a signed sentence in the audit trail.</p>
    <section class="panel" aria-labelledby="pend-h"><h2 id="pend-h">Awaiting approval</h2>
      ${pending.length ? pending.map((c) => { const d = details[c.id]; return `<div class="decision-row"><div><div class="dr-title"><span class="num">${esc(c.id)}</span> — ${esc(c.title)}</div><div class="dr-sub">${esc(d.pendingApproval.terms)} · requested by ${esc(d.pendingApproval.requestedBy)}</div></div><button class="ghost-btn btn-sm" data-open="${esc(c.id)}">Review &amp; approve</button></div>`; }).join('') : '<p class="empty">No pending approvals.</p>'}
    </section>
    <section class="panel" aria-labelledby="dec-h"><h2 id="dec-h">Decided</h2>
      ${decided.length ? decided.map((c) => { const d = details[c.id]; const a = d.approval; return `<div class="decision-sentence">“I approve ${esc(a.terms)}.” — ${esc(a.approvedBy)}, ${fmtDateTime(a.approvedAt)} · case <span class="num">${esc(c.id)}</span></div>`; }).join('') : '<p class="empty">No decisions recorded yet. Approve HAG-014 to see the signed sentence here.</p>'}
    </section>`;
  bindCaseRows($('#view'));
}
function renderActivityView() {
  setBreadcrumb('Activity');
  const items = activityFeed();
  $('#view').innerHTML = `
    <h1 class="section-title">Activity</h1>
    <p class="section-sub">Audit trail across all cases. Every state change, proposal and room message is logged.</p>
    <section class="panel"><h2>All activity</h2>
      ${items.length ? `<ol class="audit-list">${items.map((a) => `<li>${a.at ? `<span class="au-time">${fmtDateTime(a.at)}</span>` : '<span class="au-time">seeded</span>'}${esc(a.text)}</li>`).join('')}</ol>` : '<p class="empty">No activity recorded yet.</p>'}
    </section>`;
}
function renderSettingsView() {
  setBreadcrumb('Settings');
  $('#view').innerHTML = `
    <h1 class="section-title">Settings</h1>
    <p class="section-sub">Environment and integration status for this workspace.</p>
    <section class="panel"><h2>Environment</h2>
      <dl class="kv">
        <dt>Switch mode</dt><dd>${esc(statusData?.switchMode || '—')}</dd>
        <dt>Switch Console / core</dt><dd>0.40.1 / 0.31.0</dd>
        <dt>Switch health</dt><dd>${esc((() => { const sh = statusData?.switchHealth; if (!sh) return '—'; if (sh.status !== undefined) return String(sh.status); if (sh.note) return sh.note; if (sh.ok === false) return `Unreachable — ${sh.error || 'health probe failed'}`; return '—'; })())}</dd>
        <dt>Cases in workspace</dt><dd>${cases.length}</dd>
        <dt>Demo data</dt><dd>Fictional — labelled throughout</dd>
      </dl>
      <p class="small muted" style="margin-top:10px">Point this app at a real Switch server by setting SWITCH_BASE_URL and a real agent key; the stub is used only while SWITCH_BASE_URL is unset. Keyboard: ⌘K focuses search.</p>
    </section>`;
}

// ---------- case workspace ----------
function renderCase() {
  const c = details[currentCaseId];
  const a = c.analysis;
  setBreadcrumb(`<span class="crumb-soft">Cases</span><span class="crumb-sep">/</span>${esc(c.id)} — ${esc(c.title)}`);
  const stepIdx = STEP_INDEX[c.state] ?? 0;
  const neg = TERMINAL_NEG.includes(c.state);
  const stepper = STEPS.map((s, i) => {
    const cls = neg && i === stepIdx ? 'blocked' : (i < stepIdx ? 'done' : (i === stepIdx ? 'current' : ''));
    const cur = i === stepIdx ? ' aria-current="step"' : '';
    return `<li class="${cls}"${cur}>${s}</li>`;
  }).join('');
  const tabs = [['overview', 'Overview'], ['analysis', 'Analysis'], ['negotiation', 'Negotiation'], ['evidence', 'Evidence'], ['audit', 'Audit']];
  $('#view').innerHTML = `
    <div class="case-head">
      <div>
        <h1><span class="num">${esc(c.id)}</span> — ${esc(c.title)}</h1>
        <p class="case-meta">${esc(c.workflow)} · Room ${esc(c.switchRoom)} · ${statePill(c.state)}${c.demo ? ' · Demo data' : ''}</p>
      </div>
      <div class="move-to">
        <label class="visually-hidden" for="move-select">Move case to</label>
        <select id="move-select">${(TRANSITIONS[c.state] || []).map((t) => `<option value="${t}">Move to ${t.replace(/_/g, ' ')}</option>`).join('') || '<option value="">No moves available</option>'}</select>
        <button class="ghost-btn" id="move-btn" ${(TRANSITIONS[c.state] || []).length ? '' : 'disabled'}>Move</button>
        <button class="ghost-btn" id="back-btn">← All cases</button>
      </div>
    </div>
    <p class="inline-error" id="case-error" role="alert" hidden></p>
    <ol class="stepper" aria-label="Workflow stage">${stepper}</ol>
    <div class="tabs" role="tablist" aria-label="Case sections">
      ${tabs.map(([id, label]) => `<button class="tab ${currentTab === id ? 'is-active' : ''}" role="tab" id="tab-${id}" aria-selected="${currentTab === id}" aria-controls="case-main" data-tab="${id}">${label}</button>`).join('')}
    </div>
    <div class="case-grid">
      <div class="col-stack">${summaryPanel(c)}</div>
      <div class="col-stack" id="case-main" role="tabpanel" aria-labelledby="tab-${currentTab}">${tabContent(c)}</div>
      <div class="rail"><div class="col-stack">${railPanels(c)}</div></div>
    </div>`;
  $('#back-btn').addEventListener('click', backToDashboard);
  $('#move-btn').addEventListener('click', async () => {
    const to = $('#move-select').value; if (!to) return;
    try { await transition(c.id, to); } catch (e) { showCaseError(e.message); }
  });
  $$('.tab', $('#view')).forEach((t) => t.addEventListener('click', () => { currentTab = t.dataset.tab; renderCase(); }));
  // Arrow-key navigation across tabs (QA 2026-11-06): the tabs had
  // role=tab/aria-selected but no keyboard pattern.
  $$('.tab', $('#view')).forEach((t) => t.addEventListener('keydown', (e) => {
    const ids = tabs.map(([id]) => id);
    const i = ids.indexOf(t.dataset.tab);
    let next = null;
    if (e.key === 'ArrowRight') next = ids[(i + 1) % ids.length];
    else if (e.key === 'ArrowLeft') next = ids[(i - 1 + ids.length) % ids.length];
    else if (e.key === 'Home') next = ids[0];
    else if (e.key === 'End') next = ids[ids.length - 1];
    if (next) { e.preventDefault(); currentTab = next; renderCase(); const el = $(`#tab-${next}`); if (el) el.focus(); }
  }));
  bindCaseEvents(c);
}
function showCaseError(msg) {
  const el = $('#case-error'); el.textContent = msg; el.hidden = false;
}
async function transition(caseId, to, extra = {}) {
  await api(`/api/cases/${caseId}/transition`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to, actor: 'Mara (owner)', actorKind: 'human', ...extra }) });
  details[caseId] = await api(`/api/cases/${caseId}`);
  cases = await api('/api/cases');
  render();
}
function summaryPanel(c) {
  if (c.workflow === 'HAGGLE') return haggleSummary(c);
  if (c.workflow === 'COURT') return courtSummary(c);
  return correctionSummary(c);
}
function haggleSummary(c) {
  const a = c.analysis, i = c.input;
  return `<section class="panel" aria-labelledby="fin-h">
    <h2 id="fin-h">Financial impact — deterministic</h2>
    <div class="hero"><span class="hero-neg">+${money(a.costDiffPerServing)}</span> <small>/ serving · ${money(a.monthlyExtraCost)} / month</small></div>
    <p class="small muted" style="margin:6px 0 0">Cream ${money(i.oldPrice)} → ${money(i.newPrice)} / ${esc(i.unit)} (${a.pctChange === null ? '—' : '+' + a.pctChange + '%'}) · ${i.qtyPerServing} ${esc(i.unit)} / ${esc(i.recipe)} · menu ${money(i.menuPrice)}</p>
    <div class="bullet-wrap">
      <div class="bullet" role="img" aria-label="Food cost rises from ${pct(a.oldFoodCostPct)} to ${pct(a.newFoodCostPct)}; target is ${i.targetFoodCostPct} percent">
        <span class="bullet-bar" style="width:${(a.newFoodCostPct / 40 * 100).toFixed(1)}%"></span>
        <span class="bullet-target" style="left:${(i.targetFoodCostPct / 40 * 100).toFixed(1)}%" title="Target ${i.targetFoodCostPct}%"></span>
        <span class="bullet-old" style="left:${(a.oldFoodCostPct / 40 * 100).toFixed(1)}%" title="Before ${pct(a.oldFoodCostPct)}"></span>
      </div>
      <div class="bullet-scale" aria-hidden="true"><span>0%</span><span>20%</span><span>40%</span></div>
    </div>
    <p class="small">Food cost ${pct(a.oldFoodCostPct)} → <strong>${pct(a.newFoodCostPct)}</strong> · target ${i.targetFoodCostPct}% · ${money(a.annualExtraCost)}/yr</p>
    <h3>Financials</h3>
    <dl class="kv">
      <dt>Cream / serving</dt><dd>${money(a.oldCreamCostPerServing)} → ${money(a.newCreamCostPerServing)}</dd>
      <dt>Food cost / serving</dt><dd>${money(a.oldTotalCostPerServing)} → ${money(a.newTotalCostPerServing)}</dd>
      <dt>Gross margin</dt><dd>${pct(a.oldGrossMarginPct)} → ${pct(a.newGrossMarginPct)}</dd>
      <dt>Max sustainable price</dt><dd>${money(a.maxSustainableUnitPrice)} / ${esc(i.unit)}</dd>
      <dt>Volume</dt><dd>${i.monthlySales} servings / month</dd>
    </dl>
    <p class="small muted" style="margin-top:10px">Gross ≠ net: rent, labour and overhead are not in this model. Monthly = servings × per-serving difference; annual = monthly × 12.</p>
    <h3>Owner mandate</h3>
    <div class="mandate-box"><div class="mandate-title">Mandate — owner</div>
      Target <b>${money(i.targetPrice)}</b> · Max <b>${money(i.maxApprovedPrice)}</b> · Walk away &gt; <b>${money(i.maxApprovedPrice)}</b></div>
  </section>`;
}
// Blind-test completeness: the tally, the sample→version mapping and
// the leader stay hidden until every reader has rated every sample.
// QA 2026-11-06: with 4 of 9 ratings in, the UI already named the
// leader and labelled every sample with its version — the blind was
// never actually blind. The server already withholds its tally until
// complete; the client must do the same.
function courtTallyState(c) {
  const expected = (c.readers || []).length * (c.samples || []).length;
  const submitted = (c.ratings || []).length;
  return { expected, submitted, complete: expected > 0 && submitted >= expected };
}
function courtSummary(c) {
  const conflicts = (c.conflicts || []).filter((x) => x.conflict).length;
  const cs = courtScoresFor(c);
  const ts = courtTallyState(c);
  const tally = courtMeans(c);
  const leader = Object.entries(tally).sort((a, b) => b[1].overall - a[1].overall)[0];
  const leaderRow = ts.complete
    ? `<dt>Leading by blind mean</dt><dd>${esc(cs.samples[leader[0]])} — ${leader[1].overall.toFixed(2)} / 5</dd>`
    : `<dt>Tally</dt><dd>Hidden — ${ts.submitted} of ${ts.expected} ratings in</dd>`;
  return `<section class="panel" aria-labelledby="court-sum-h">
    <h2 id="court-sum-h">Recipe court — summary</h2>
    <dl class="kv">
      <dt>Versions</dt><dd>${c.versions.length}</dd>
      <dt>Conflicting variables</dt><dd>${conflicts} of ${c.conflicts.length}</dd>
      <dt>Blind readers</dt><dd>${cs.readers.length}</dd>
      ${leaderRow}
    </dl>
    <p class="small muted" style="margin-top:10px">Coded samples, independent ratings (1–5). Scores are shown as submitted; the tally, the version mapping and the leader stay hidden until every reader has submitted. The dissenting version is preserved, never deleted.</p>
    <h3>Versions</h3>
    <p class="small">${c.versions.map((v) => `<span class="num">${esc(v.id)}</span> ${esc(v.author)}`).join('<br>')}</p>
  </section>`;
}
function correctionSummary(c) {
  const claims = (c.claims || []).map((cl) => getClaim(c, cl));
  const counts = {};
  for (const cl of claims) counts[cl.status] = (counts[cl.status] || 0) + 1;
  return `<section class="panel" aria-labelledby="corr-sum-h">
    <h2 id="corr-sum-h">Episode correction — summary</h2>
    <dl class="kv">
      <dt>Factual claims found</dt><dd>${claims.length}</dd>
      ${Object.entries(counts).map(([s, n]) => `<dt>${esc(s)}</dt><dd>${n}</dd>`).join('')}
      <dt>Evidence items</dt><dd>${(c.evidence || []).length}</dd>
    </dl>
    <p class="small muted" style="margin-top:10px">Rule-based claim extraction only — sentences with a number, year, title or verifiable verb. Opinions are separated out, not claims. The original transcript is preserved.</p>
  </section>`;
}
function courtMeans(c) {
  const cs = courtScoresFor(c);
  const out = {};
  for (const [code, readers] of Object.entries(cs.scores)) {
    const means = {};
    for (const crit of cs.criteria) {
      const vals = Object.values(readers).map((r) => r[crit]);
      means[crit] = vals.reduce((a, b) => a + b, 0) / vals.length;
    }
    out[code] = means;
  }
  return out;
}
function tabContent(c) {
  if (currentTab === 'overview') return overviewTab(c);
  if (currentTab === 'analysis') return analysisTab(c);
  if (currentTab === 'negotiation') return negotiationTab(c);
  if (currentTab === 'evidence') return evidenceTab(c);
  if (currentTab === 'audit') return auditTab(c);
  return '';
}
function overviewTab(c) {
  const parts = [];
  if (c.workflow === 'HAGGLE') {
    const a = c.analysis;
    parts.push(`<section class="panel"><h2>What happened</h2>
      <p>${esc(c.input.supplier)} raised ${esc(c.input.ingredient)} from ${money(c.input.oldPrice)} to ${money(c.input.newPrice)} per ${esc(c.input.unit)} — ${a.pctChange}% — adding ${money(a.costDiffPerServing)} per ${esc(c.input.recipe)} serving, ${money(a.monthlyExtraCost)} a month at ${c.input.monthlySales} servings.</p>
      <p class="small muted" style="margin-top:8px">The Negotiation Agent priced ${c.strategies.length} strategies against the owner mandate; the Financial Analyst verified the maths against evidence <span class="tag-ev">[E1]</span> and <span class="tag-ev">[E2]</span>. ${c.pendingApproval ? `A counter-offer is awaiting your approval: <strong>${esc(c.pendingApproval.terms)}</strong>.` : (c.approval ? `Approved: <strong>${esc(c.approval.terms)}</strong> — ${esc(c.approval.approvedBy)}.` : '')}</p></section>`);
  }
  if (c.workflow === 'COURT') {
    parts.push(`<section class="panel"><h2>What happened</h2>
      <p>Three versions of Nonna's ragù disagree on ${c.conflicts.filter((x) => x.conflict).length} variables. A blind test-cook with coded samples settles which version becomes canonical — the dissent stays on the record.</p></section>`);
  }
  if (c.workflow === 'CORRECTION') {
    const claims = (c.claims || []).map((cl) => getClaim(c, cl));
    parts.push(`<section class="panel"><h2>What happened</h2>
      <p>The Verification Agent extracted ${claims.length} factual claims from the episode transcript. The guest corrects timestamped claims with evidence in the Switch room; the host approves the errata before publication.</p></section>`);
  }
  // Participants live in the right rail (railPanels) — the overview tab
  // used to render them a second time (QA 2026-11-06).
  return parts.join('');
}
function analysisTab(c) {
  if (c.workflow === 'HAGGLE') {
    const a = c.analysis, i = c.input;
    return `<section class="panel" aria-labelledby="an-h"><h2 id="an-h">Analysis — deterministic, no LLM maths</h2>
      <div class="table-wrap"><table>
        <caption>All figures from the shared decision engine; units travel with every number.</caption>
        <thead><tr><th scope="col">Measure</th><th scope="col" class="num">Before</th><th scope="col" class="num">Now</th></tr></thead>
        <tbody>
          <tr><td>Cream / serving</td><td class="num">${money(a.oldCreamCostPerServing)}</td><td class="num">${money(a.newCreamCostPerServing)}</td></tr>
          <tr><td>Food cost / serving</td><td class="num">${money(a.oldTotalCostPerServing)}</td><td class="num">${money(a.newTotalCostPerServing)}</td></tr>
          <tr><td>Food cost %</td><td class="num">${pct(a.oldFoodCostPct)}</td><td class="num">${pct(a.newFoodCostPct)}</td></tr>
          <tr><td>Gross margin</td><td class="num">${pct(a.oldGrossMarginPct)}</td><td class="num">${pct(a.newGrossMarginPct)}</td></tr>
          <tr><td>Extra cost</td><td class="num">—</td><td class="num">${money(a.monthlyExtraCost)} / mo · ${money(a.annualExtraCost)} / yr</td></tr>
          <tr><td>Max sustainable price (at ${i.targetFoodCostPct}% target)</td><td class="num" colspan="2">${money(a.maxSustainableUnitPrice)} / ${esc(i.unit)}</td></tr>
        </tbody></table></div>
      <p class="small muted" style="margin-top:10px">Assumptions: ${i.qtyPerServing} ${esc(i.unit)} per serving · other ingredients ${money(i.otherIngredientsCostPerServing)} · menu ${money(i.menuPrice)} · ${i.monthlySales} servings/month. Evidence: <span class="tag-ev">[E1]</span> invoice, <span class="tag-ev">[E2]</span> recipe.</p>
    </section>`;
  }
  if (c.workflow === 'COURT') return courtMatrix(c) + courtHeat(c);
  const claims = (c.claims || []).map((cl) => getClaim(c, cl));
  // The original transcript, sentence by sentence, with the
  // factual/opinion classification shown — QA 2026-11-06: the text
  // itself was never displayed, so the separation could not be seen.
  // Claim ids follow the extractor: C{n} where n is the 1-based
  // sentence index (the opinion sentence keeps its number but is not
  // a claim).
  const sentences = String(c.transcript || '').split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
  const transcriptRows = sentences.map((s, i) => {
    const isOpinion = /^(i think|i feel|in my opinion|i believe)/i.test(s);
    const claim = claims.find((cl) => cl.id === `C${i + 1}`);
    const tag = isOpinion
      ? '<span class="pill pill-grey">opinion — separated, not a claim</span>'
      : claim ? `<span class="pill pill-teal">factual claim ${esc(claim.id)}</span>`
      : '<span class="pill pill-grey">not a claim</span>';
    return `<li>${esc(s)} ${tag}</li>`;
  }).join('');
  const transcriptPanel = `<section class="panel" aria-labelledby="transcript-h"><h2 id="transcript-h">Original transcript — preserved</h2>
    <p class="small muted" style="margin-bottom:8px">The guest's words are kept verbatim. Factual assertions become claims below; opinions are separated out and never treated as facts.</p>
    <ol class="transcript-list">${transcriptRows}</ol></section>`;
  return transcriptPanel + claimsTable(c, claims, false);
}
function courtMatrix(c) {
  return `<section class="panel" aria-labelledby="mx-h"><h2 id="mx-h">Comparison matrix — versions of one dish</h2>
    <div class="table-wrap"><table>
      <caption>Differing cells are marked Δ; agreeing cells are plain. ${c.conflicts.filter((x) => x.conflict).length} of ${c.conflicts.length} variables conflict.</caption>
      <thead><tr><th scope="col">Variable</th>${c.versions.map((v) => `<th scope="col">${esc(v.author)}</th>`).join('')}<th scope="col">Δ</th></tr></thead>
      <tbody>${c.conflicts.map((cf) => {
        const distinct = [...new Set(cf.values.map((v) => v.value))];
        const delta = cf.conflict ? distinct.join(' vs ') : '— agree';
        return `<tr><td><strong>${esc(cf.variable)}</strong></td>${cf.values.map((v) => `<td class="${cf.conflict ? 'conflict-cell' : ''}">${esc(v.value)}${cf.conflict ? ' <span class="delta-tag">Δ</span>' : ''}</td>`).join('')}<td class="muted small">${esc(delta)}</td></tr>`;
      }).join('')}</tbody></table></div>
    <p class="small muted" style="margin-top:8px">Evidence: <span class="tag-ev">[E1]</span> handwritten card photo — the original.</p>
  </section>`;
}
function courtHeat(c) {
  const sample = courtSample;
  const cs = courtScoresFor(c);
  const ts = courtTallyState(c);
  // A case with no ratings at all (server fallback) has no scores for
  // any sample — render the blind empty state instead of crashing on
  // the missing means. The rating form below still accepts the first
  // rating, so the case can start from zero.
  const hasScores = Boolean(cs.scores[sample]);
  const means = hasScores ? courtMeans(c)[sample] : null;
  const rows = hasScores ? cs.criteria.map((crit) => {
    const vals = cs.readers.map((r) => cs.scores[sample][r][crit]);
    const range = Math.max(...vals) - Math.min(...vals);
    const heat = (v) => v >= 4.5 ? 'heat-5' : v >= 4 ? 'heat-4' : v >= 3.5 ? 'heat-3' : v >= 3 ? 'heat-2' : 'heat-1';
    return `<tr class="${range >= 2 ? 'disagree' : ''}"><th scope="row">${esc(crit)}${range >= 2 ? ' <span class="disagree-tag">DISAGREE</span>' : ''}</th>
      ${vals.map((v) => `<td class="num ${heat(v)}">${v}</td>`).join('')}
      <td class="num">${ts.complete ? means[crit].toFixed(2) : '—'}</td><td class="num">${range}</td></tr>`;
  }).join('') : `<tr><td colspan="${cs.readers.length + 3}">No ratings submitted yet for this sample — be the first to rate it below.</td></tr>`;
  const leader = Object.entries(courtMeans(c)).sort((a, b) => b[1].overall - a[1].overall)[0];
  // The sample→version mapping is blind information: show codes only
  // until the tally is complete (QA 2026-11-06).
  const sampleLabel = (code) => ts.complete ? `${code} — ${esc(cs.samples[code])}` : code;
  const tallyBlock = ts.complete
    ? `<h3>Canonical recipe — tally</h3>
    <p class="small">Leading by blind mean (overall): <strong>${esc(cs.samples[leader[0]])} — ${leader[1].overall.toFixed(2)} / 5</strong>.
    ${Object.entries(courtMeans(c)).map(([code, m]) => `${esc(cs.samples[code])} ${m.overall.toFixed(2)}`).join(' · ')}.</p>
    <p class="small muted" style="margin-top:6px">Dissent preserved: the other two versions stay on the record as footnotes to the canonical recipe — never deleted.</p>`
    : `<h3>Canonical recipe — tally</h3>
    <p class="small"><strong>Tally hidden — ${ts.submitted} of ${ts.expected} ratings submitted.</strong> The version mapping and the leader stay hidden until every reader has rated every sample; the tally appears here then.</p>`;
  return `<section class="panel" aria-labelledby="blind-h"><h2 id="blind-h">Blind scores — heat table (1–5)</h2>
    <p class="small muted" style="margin-bottom:10px">Blind scores held by the server — ${(c.ratings || []).length} ratings from ${cs.readers.length} readers on record. Rows where readers differ by ≥2 are highlighted. The version mapping is revealed in the tally, after all readers submitted.</p>
    <div class="sample-switch" role="group" aria-label="Choose a coded sample">
      ${Object.entries(cs.samples).map(([code, name]) => `<button class="ghost-btn btn-sm ${courtSample === code ? 'is-active' : ''}" data-sample="${code}" aria-pressed="${courtSample === code}">${sampleLabel(code)}</button>`).join('')}
    </div>
    <div class="table-wrap"><table>
      <caption>Coded sample ${sample}${ts.complete ? ` (${esc(cs.samples[sample])})` : ''} — scores by reader.</caption>
      <thead><tr><th scope="col">Criterion</th>${cs.readers.map((r) => `<th scope="col" class="num">${esc(r)}</th>`).join('')}<th scope="col" class="num">Mean</th><th scope="col" class="num">Range</th></tr></thead>
      <tbody>${rows}</tbody></table></div>
    ${tallyBlock}
    <h3>Submit a blind rating</h3>
    <form class="rating-form" id="rating-form">
      <label>Reader <select id="rating-reader" required>${(c.readers || []).map((r) => `<option value="${esc(r)}">${esc(r)}</option>`).join('')}</select></label>
      <label>Sample <select id="rating-sample" required>${(c.samples || []).map((s) => `<option value="${esc(s.code)}">${esc(s.code)}</option>`).join('')}</select></label>
      ${cs.criteria.map((crit) => `<label>${esc(crit)} <input type="number" min="1" max="5" step="1" required data-crit="${esc(crit)}" aria-label="${esc(crit)} score 1 to 5"></label>`).join('')}
      <button class="btn btn-sm" type="submit">Submit rating</button>
    </form>
    <p class="small muted" id="rating-note">Ratings are server-held and cannot be changed once submitted — a duplicate is rejected (409). Samples are codes only, so the rating stays blind.</p>
  </section>`;
}
function claimsTable(c, claims, interactive) {
  return `<section class="panel" aria-labelledby="cl-h"><h2 id="cl-h">Claims from the transcript</h2>
    <p class="small muted" style="margin-bottom:10px">Claim statuses are persisted by the server and recorded in the audit trail. Only a human (host/guest) may change a status — the Verification Agent proposes.</p>
    <div class="table-wrap"><table>
      <caption>${claims.length} factual claims extracted by rule, not by LLM.</caption>
      <thead><tr><th scope="col">Claim</th><th scope="col">Kind</th><th scope="col">Status</th><th scope="col">Evidence</th>${interactive ? '<th scope="col">Actions</th>' : ''}</tr></thead>
      <tbody>${claims.map((cl) => {
        const ev = (CLAIM_EVIDENCE[cl.id] || []).map((e) => `<span class="tag-ev">[${e}]</span>`).join(' ') || '—';
        const statusCls = { Verified: 'pill-teal', Corrected: 'pill-teal', Clarified: 'pill-grey', Disputed: 'pill-amber', Unresolved: 'pill-grey' }[cl.status] || 'pill-grey';
        let row = `<tr><td><span class="num">${esc(cl.id)}</span> ${esc(cl.text)}${cl.challenge ? `<div class="challenge-note">Guest challenge (${esc(cl.challenge.by)}): “${esc(cl.challenge.text)}”${cl.challenge.evidence ? ` · cites <span class="tag-ev">[${esc(cl.challenge.evidence)}]</span>` : ''}</div>` : ''}</td>
          <td>${esc(cl.kind)}</td><td><span class="pill ${statusCls}">${esc(cl.status)}</span></td><td>${ev}</td>`;
        if (interactive) {
          row += `<td>
            ${cl.status === 'Unresolved' ? `<button class="ghost-btn btn-sm" data-verify="${esc(cl.id)}">Host: mark verified</button> ` : ''}
            ${cl.status !== 'Corrected' ? `<button class="ghost-btn btn-sm" data-challenge="${esc(cl.id)}">Guest: challenge</button> ` : ''}
            ${cl.status === 'Disputed' ? `<button class="btn btn-sm" data-approve-claim="${esc(cl.id)}">Host: approve correction</button>` : ''}
          </td>`;
        }
        return row + '</tr>';
      }).join('')}</tbody></table></div>
    <div id="challenge-slot"></div>
  </section>`;
}
function negotiationTab(c) {
  if (c.workflow === 'HAGGLE') return haggleNegotiation(c);
  if (c.workflow === 'COURT') return courtMatrix(c) + courtHeat(c) + `<section class="panel"><h2>Family vote</h2><p>The family votes in the Switch room ${esc(c.switchRoom)} — the tally above is the blind result; the vote is the decision. <button class="ghost-btn btn-sm" data-room-btn>Open room transcript</button></p></section>`;
  const claims = (c.claims || []).map((cl) => getClaim(c, cl));
  const corrected = claims.filter((cl) => cl.status === 'Corrected');
  return claimsTable(c, claims, true) + `<section class="panel" aria-labelledby="err-h"><h2 id="err-h">Errata draft — pre-publish checklist</h2>
    ${corrected.length ? `<ol class="audit-list">${corrected.map((cl) => `<li><span class="num">${esc(cl.id)}</span> — ${esc(cl.text)}<br><span class="muted">Correction: ${esc(cl.challenge ? cl.challenge.text : 'approved by host')}</span></li>`).join('')}</ol><p class="small" style="margin-top:8px">Publish only after every Corrected claim is in the errata and every Disputed claim is resolved.</p>` : '<p class="empty">No corrections approved yet. Challenge a claim above, then the host approves it into this errata draft.</p>'}
    <p style="margin-top:10px"><button class="ghost-btn btn-sm" data-room-btn>Open room transcript ${esc(c.switchRoom)}</button></p>
  </section>`;
}
function haggleNegotiation(c) {
  const a = c.analysis, i = c.input;
  if (!selectedStrategy) {
    selectedStrategy = (c.pendingApproval && PROPOSAL_TO_STRATEGY[c.pendingApproval.proposalId]) || 'counter-019';
  }
  const sel = (c.strategies || []).find((s) => s.id === selectedStrategy) || c.strategies[0];
  const timeline = [
    { price: money(i.oldPrice), label: `Old price — baseline`, who: 'DairyCo rate card' },
    { price: money(i.newPrice), label: `Supplier proposal (+${a.pctChange}%)`, who: 'DairyCo rep' },
    { price: '$0.19', label: 'Counter-offer — 6 weeks, in writing', who: 'DairyCo rep · P2' },
    { price: c.approval ? money(0.19) : '?', label: c.approval ? `Approved — ${esc(c.approval.terms)}` : 'Approved — awaiting owner decision', who: c.approval ? c.approval.approvedBy : 'Owner' },
  ];
  return `<section class="panel" aria-labelledby="terms-h"><h2 id="terms-h">Negotiation — proposals &amp; terms</h2>
    <h3>Terms timeline</h3>
    <ol class="timeline">${timeline.map((t) => `<li><span class="tl-price">${esc(t.price)} / fl oz</span><span>${esc(t.label)}</span><span class="tl-who">${esc(t.who)}</span></li>`).join('')}</ol>
    <h3>Proposals — select a row to recompute impact</h3>
    <div class="table-wrap"><table>
      <caption>Strategies priced by the deterministic engine. Selecting a row updates the impact panel and the approval button.</caption>
      <thead><tr><th scope="col">Option</th><th scope="col" class="num">Price</th><th scope="col" class="num">Food cost</th><th scope="col" class="num">Monthly impact</th><th scope="col">Status</th></tr></thead>
      <tbody>${(c.strategies || []).map((s) => {
        // Status is derived from the case state, not hardcoded per
        // strategy: after approval the chosen row must read Approved,
        // not "Awaiting" (QA 2026-11-06).
        const approvedHere = c.approval && PROPOSAL_TO_STRATEGY[c.approval.proposalId] === s.id;
        const awaitingHere = c.pendingApproval && PROPOSAL_TO_STRATEGY[c.pendingApproval.proposalId] === s.id;
        const statusPill = approvedHere ? '<span class="pill pill-teal">Approved</span>'
          : awaitingHere ? '<span class="pill pill-amber">Awaiting</span>'
          : '<span class="pill pill-grey">Proposed</span>';
        return `<tr class="clickable ${s.id === selectedStrategy ? 'sel' : ''}" data-strategy="${esc(s.id)}" tabindex="0">
        <td><strong>${esc(s.name)}</strong><br><span class="muted small">${esc(s.detail)}</span>${s.unverified ? '<br><span class="pill pill-amber">Unverified quote</span>' : ''}${s.risk ? `<br><span class="small" style="color:var(--red)">${esc(s.risk)}</span>` : ''}</td>
        <td class="num">${money(s.unitPrice)}</td><td class="num">${pct(s.foodCostPct)}</td>
        <td class="num">${s.extraVsOldPerMonth >= 0 ? '+' : ''}${money(s.extraVsOldPerMonth)}</td>
        <td>${statusPill}</td></tr>`; }).join('')}</tbody></table></div>
    <div id="impact-panel">${impactPanel(c, sel)}</div>
  </section>`;
}
function impactPanel(c, s) {
  const a = c.analysis;
  const terms = STRATEGY_TERMS[s.id] || { short: money(s.unitPrice) + ' / fl oz', full: money(s.unitPrice) + '/fl oz' };
  const inside = s.foodCostPct <= c.input.targetFoodCostPct;
  return `<h3>Impact — ${esc(s.name)}</h3>
    <dl class="kv">
      <dt>Cream / serving</dt><dd>${money(s.creamCostPerServing)}</dd>
      <dt>Total food cost / serving</dt><dd>${money(s.totalCostPerServing)}</dd>
      <dt>Food cost %</dt><dd>${pct(s.foodCostPct)} ${inside ? '(inside 30% target)' : '(above 30% target)'}</dd>
      <dt>Extra vs old price</dt><dd>${s.extraVsOldPerMonth >= 0 ? '+' : ''}${money(s.extraVsOldPerMonth)} / month</dd>
      <dt>Saving vs ${money(c.input.newPrice)}</dt><dd>${money(s.savingVsNewPerMonth)} / month</dd>
    </dl>
    <p class="small" style="margin-top:8px">Recommendation: ${esc(s.recommendation || '')}</p>
    <div class="approve-bar" style="margin-top:12px">
      ${approvalControls(c, s, terms)}
    </div>`;
}
function approvalControls(c, s, terms) {
  if (c.approval) {
    return `<div class="approve-stamp"><span class="stamp-word">Approved ✓</span><br>
      “I approve ${esc(c.approval.terms)}.” — <b>${esc(c.approval.approvedBy)}</b>, ${fmtDateTime(c.approval.approvedAt)}</div>`;
  }
  if (c.state === 'AWAITING_APPROVAL' || c.state === 'PROPOSAL' || c.state === 'DISCUSSION') {
    return `<button class="btn" id="approve-btn">Approve ${esc(terms.short)}</button>
      <button class="ghost-btn" id="reject-btn">Reject pending terms</button>
      <p class="small muted">Two-step: this opens a confirmation restating the exact terms. Only a human (Mara, owner) may approve.</p>`;
  }
  return `<p class="empty">No pending approval — case is ${esc(c.state)}. Use “Move to” above to advance the case until a proposal is submitted for approval.</p>`;
}
function evidenceTab(c) {
  const items = c.evidence || [];
  return `<section class="panel" aria-labelledby="ev-h"><h2 id="ev-h">Evidence — numbered bibliography</h2>
    <div class="table-wrap"><table>
      <caption>Every item has a source and a status; citations link claims to evidence.</caption>
      <thead><tr><th scope="col">ID</th><th scope="col">Type</th><th scope="col">Source</th><th scope="col">Status</th><th scope="col">Note</th></tr></thead>
      <tbody>${items.map((e) => `<tr><td><span class="tag-ev">[${esc(e.id)}]</span></td><td>${esc(e.type)}</td><td>${esc(e.source)}</td><td>${esc(e.status)}</td><td class="muted">${esc(e.note || '')}</td></tr>`).join('') || `<tr><td colspan="5" class="empty">No evidence filed for this case.</td></tr>`}</tbody></table></div>
    <p class="small muted" style="margin-top:8px">Clicking a citation <span class="tag-ev">[E1]</span> in Analysis or Negotiation highlights the evidence it rests on.</p>
  </section>`;
}
function auditTab(c) {
  const events = c.audit || [];
  return `<section class="panel" aria-labelledby="au-h"><h2 id="au-h">Audit trail</h2>
    ${c.approval ? `<div class="decision-sentence">“I approve ${esc(c.approval.terms)}.” — ${esc(c.approval.approvedBy)}, ${fmtDateTime(c.approval.approvedAt)} · case <span class="num">${esc(c.id)}</span></div>` : '<p class="empty">No decision recorded yet — the signed sentence appears here once a human approves.</p>'}
    ${events.length ? `<ol class="audit-list">${events.map((e) => `<li><span class="au-time">${fmtDateTime(e.at)}</span><strong>${esc(e.actor)}</strong> (${esc(e.kind)}) — ${esc(e.event)}</li>`).join('')}</ol>` : '<p class="empty">No audit events yet in this session. State changes, proposals and room messages are logged here.</p>'}
  </section>`;
}
function railPanels(c) {
  const participants = `<section class="panel" aria-labelledby="part-h"><h2 id="part-h">Participants</h2>
    <p class="small">${(c.participants || []).map((p) => `${esc(p.name)} — ${esc(p.role)}${p.kind === 'agent' ? ' · <span style="color:var(--teal-dark);font-weight:600">AGENT</span>' : ''}`).join('<br>')}</p></section>`;
  const approvals = `<section class="panel" aria-labelledby="appr-h"><h2 id="appr-h">Approvals</h2>
    ${c.pendingApproval ? `<p class="small">Pending: <strong>${esc(c.pendingApproval.terms)}</strong><br><span class="muted">requested by ${esc(c.pendingApproval.requestedBy)}</span></p>` : ''}
    ${c.approval ? `<div class="approve-stamp" style="margin-top:8px"><span class="stamp-word">Approved ✓</span><br>“I approve ${esc(c.approval.terms)}.” — <b>${esc(c.approval.approvedBy)}</b></div>` : ''}
    ${!c.pendingApproval && !c.approval ? '<p class="empty">No pending approval on this case.</p>' : ''}
  </section>`;
  const room = `<section class="panel" aria-labelledby="room-h"><h2 id="room-h">Switch room</h2>
    <p class="small"><span class="num">${esc(c.switchRoom)}</span> · ${(c.participants || []).length} members</p>
    <p class="small muted" style="margin:6px 0 10px">${statusData?.switchMode === 'REAL-SWITCH' ? 'Live Switch room — a real Mattermost channel via the Switch bridge. Messages here are real.' : 'SIMULATED — stub server, not Switch. Transcript opens in a drawer.'}</p>
    <button class="ghost-btn btn-sm" data-room-btn>Open room transcript</button>
  </section>`;
  const ev = `<section class="panel" aria-labelledby="evsum-h"><h2 id="evsum-h">Evidence</h2>
    <p class="evidence-ref">${(c.evidence || []).map((e) => `<span class="tag-ev">[${esc(e.id)}]</span> ${esc(e.type)} — ${esc(e.status)}`).join('<br>') || 'None filed.'}</p>
  </section>`;
  return participants + approvals + room + ev;
}

// ---------- case events ----------
function bindCaseEvents(c) {
  // N1 (QA 2026-11-06 re-run): this binding used to match
  // [data-strategy] anywhere — including #approve-btn, which carried
  // data-strategy too. Enter/Space on the button was swallowed by the
  // row handler (pick() re-rendered first), so keyboard users could
  // never open the approval modal. Scope it to the strategy rows only.
  $$('tr[data-strategy]', $('#view')).forEach((row) => {
    const pick = () => { selectedStrategy = row.dataset.strategy; renderCase(); const el = $(`tr[data-strategy="${selectedStrategy}"]`); if (el) { el.classList.add('flash'); el.focus(); } };
    row.addEventListener('click', pick);
    row.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
  });
  $$('[data-sample]', $('#view')).forEach((b) => b.addEventListener('click', () => { courtSample = b.dataset.sample; renderCase(); }));
  const rf = $('#rating-form');
  if (rf) rf.addEventListener('submit', async (e) => {
    e.preventDefault();
    const note = $('#rating-note');
    const scores = {};
    $$('#rating-form input[data-crit]').forEach((inp) => { scores[inp.dataset.crit] = Number(inp.value); });
    try {
      const res = await api('/api/court/rate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ caseId: c.id, reader: $('#rating-reader').value, sample: $('#rating-sample').value, scores }) });
      note.textContent = res.tally ? 'Rating saved — the tally is complete and is shown above.' : `Rating saved — ${res.count} of ${res.expected} ratings in. The tally stays hidden until all are submitted.`;
      await reloadCase(c); renderCase();
    } catch (err) { note.textContent = `Could not save the rating: ${err.message}`; }
  });
  const ab = $('#approve-btn');
  if (ab) ab.addEventListener('click', () => openApproveModal(c));
  const rb = $('#reject-btn');
  if (rb) rb.addEventListener('click', async () => {
    try { await transition(c.id, 'REJECTED'); } catch (e) { showCaseError(e.message); }
  });
  $$('[data-room-btn]', $('#view')).forEach((b) => b.addEventListener('click', () => openRoom(c.id)));
  $$('[data-verify]', $('#view')).forEach((b) => b.addEventListener('click', async () => {
    try {
      await api('/api/correction/claim', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ caseId: c.id, id: b.dataset.verify, status: 'Verified', actor: 'Host', actorKind: 'human' }) });
      await reloadCase(c); renderCase();
    } catch (e) { showCaseError(e.message); }
  }));
  $$('[data-approve-claim]', $('#view')).forEach((b) => b.addEventListener('click', async () => {
    try {
      await api('/api/correction/claim', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ caseId: c.id, id: b.dataset.approveClaim, status: 'Corrected', actor: 'Host', actorKind: 'human' }) });
      await reloadCase(c); renderCase();
    } catch (e) { showCaseError(e.message); }
  }));
  $$('[data-challenge]', $('#view')).forEach((b) => b.addEventListener('click', () => showChallengeForm(c, b.dataset.challenge)));
}
function setClaimLocal(caseId, claimId, status, challenge) {
  claimLocal[caseId] = claimLocal[caseId] || {};
  claimLocal[caseId][claimId] = { ...(claimLocal[caseId][claimId] || {}), status };
  if (challenge) claimLocal[caseId][claimId].challenge = challenge;
}
function showChallengeForm(c, claimId) {
  const slot = $('#challenge-slot');
  const claim = (c.claims || []).find((cl) => cl.id === claimId);
  slot.innerHTML = `<form class="challenge-form" id="challenge-form">
    <label class="visually-hidden" for="challenge-text">Correction for ${esc(claimId)}</label>
    <input id="challenge-text" placeholder="Correction for ${esc(claimId)} — e.g. “Survey was co-led with Dr Chen”" required>
    <select id="challenge-ev" aria-label="Evidence to cite">${(c.evidence || []).map((e) => `<option value="${esc(e.id)}">[${esc(e.id)}] ${esc(e.type)}</option>`).join('')}<option value="">No evidence</option></select>
    <button class="btn btn-sm" type="submit">Submit challenge as guest</button>
    <button class="ghost-btn btn-sm" type="button" id="challenge-cancel">Cancel</button>
  </form><p class="small muted">The guest challenges with evidence; the Verification Agent evaluates; the host approves. The original transcript is preserved.</p>`;
  $('#challenge-cancel').addEventListener('click', () => { slot.innerHTML = ''; });
  $('#challenge-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = $('#challenge-text').value.trim();
    const ev = $('#challenge-ev').value;
    try {
      await api('/api/correction/claim', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ caseId: c.id, id: claimId, text: claim?.text || '', status: 'Disputed', actor: 'Dr Amara Osei (guest)', actorKind: 'human', challenge: { text, evidence: ev || null } }) });
      await reloadCase(c); renderCase();
    } catch (err) { showCaseError(err.message); }
  });
  $('#challenge-text').focus();
}

// ---------- focus management (QA 2026-11-06) ----------
// Dialogs return focus to the element that opened them and keep Tab
// inside while open; without this, keyboard users lose their place
// (the drawer used to return focus to <body> on close).
let lastFocusBeforeDialog = null;
function focusables(container) {
  return [...container.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
    .filter((el) => !el.disabled && el.offsetParent !== null);
}
function trapTab(container, e) {
  if (e.key !== 'Tab') return;
  const els = focusables(container);
  if (!els.length) return;
  const first = els[0], last = els[els.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}
function rememberFocus() { lastFocusBeforeDialog = document.activeElement; }
function restoreFocus() {
  if (lastFocusBeforeDialog && document.contains(lastFocusBeforeDialog)) lastFocusBeforeDialog.focus();
  lastFocusBeforeDialog = null;
}

// ---------- approval modal ----------
function closeModal() {
  $('#modal-backdrop').hidden = true;
  restoreFocus();
}
function openApproveModal(c) {
  rememberFocus();
  const s = (c.strategies || []).find((x) => x.id === selectedStrategy) || c.strategies[0];
  const terms = STRATEGY_TERMS[s.id] || { short: money(s.unitPrice) + ' / fl oz', full: money(s.unitPrice) + '/fl oz' };
  $('#modal-terms').textContent = `I approve ${terms.full}. — Mara (owner), case ${c.id}`;
  $('#modal-error').hidden = true;
  $('#modal-backdrop').hidden = false;
  $('#modal-confirm').focus();
  $('#modal-confirm').onclick = async () => {
    const btn = $('#modal-confirm');
    btn.disabled = true;
    try {
      const pending = c.pendingApproval;
      // Same proposal as the pending one (e.g. P2 = counter-019) → approve it directly.
      const sameProposal = pending && PROPOSAL_TO_STRATEGY[pending.proposalId] === s.id;
      if (!sameProposal) {
        // Re-route the pending approval through the state machine so the
        // recorded approval carries exactly these terms.
        const cur0 = await api(`/api/cases/${c.id}`);
        if (cur0.state === 'AWAITING_APPROVAL') await api(`/api/cases/${c.id}/transition`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to: 'DISCUSSION', actor: 'Mara (owner)', actorKind: 'human' }) });
        const cur = await api(`/api/cases/${c.id}`);
        if (cur.state === 'DISCUSSION') await api(`/api/cases/${c.id}/transition`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to: 'PROPOSAL', actor: 'Mara (owner)', actorKind: 'human' }) });
        await api(`/api/cases/${c.id}/transition`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to: 'AWAITING_APPROVAL', actor: 'Mara (owner)', actorKind: 'human', proposalId: s.id, terms: terms.full }) });
      }
      await api(`/api/cases/${c.id}/transition`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to: 'APPROVED', actor: 'Mara (owner)', actorKind: 'human' }) });
      closeModal();
      details[c.id] = await api(`/api/cases/${c.id}`);
      cases = await api('/api/cases');
      currentTab = 'audit';
      render();
    } catch (e) {
      const err = $('#modal-error'); err.textContent = e.message; err.hidden = false;
    } finally { btn.disabled = false; }
  };
}
$('#modal-cancel').addEventListener('click', closeModal);
$('#modal-backdrop').addEventListener('click', (e) => { if (e.target === $('#modal-backdrop')) closeModal(); });
$('#modal-backdrop').addEventListener('keydown', (e) => trapTab($('#modal-backdrop'), e));

// ---------- room drawer ----------
function openRoom(caseId) {
  rememberFocus();
  roomCaseId = caseId;
  renderRoom();
  $('#room-drawer').hidden = false;
  $('#drawer-backdrop').hidden = false;
  $('#room-text').focus();
}
function closeRoom() {
  if ($('#room-drawer').hidden) return;
  $('#room-drawer').hidden = true;
  $('#drawer-backdrop').hidden = true;
  roomCaseId = null;
  restoreFocus();
}
$('#room-drawer').addEventListener('keydown', (e) => trapTab($('#room-drawer'), e));
function renderRoom() {
  const c = details[roomCaseId]; if (!c) return;
  $('#drawer-title').textContent = `Room ${c.switchRoom}`;
  $('#drawer-sub').textContent = `${c.id} — ${c.title} · ${(c.participants || []).map((p) => p.name).join(', ')}`;
  const m = $('#drawer-mandate');
  if (c.workflow === 'HAGGLE') {
    m.hidden = false;
    m.innerHTML = `<div class="mandate-title">Mandate — owner</div>Target <b>${money(c.input.targetPrice)}</b> · Max <b>${money(c.input.maxApprovedPrice)}</b> · Walk away &gt; <b>${money(c.input.maxApprovedPrice)}</b>`;
  } else m.hidden = true;
  const msgs = c.messages || [];
  $('#room-log').innerHTML = msgs.length
    ? msgs.map((msg) => `<div class="room-msg"><div class="rm-head"><b>${esc(msg.author)}</b> · ${fmtTime(msg.at)} ${/agent/i.test(msg.author) ? '<span class="agent-tag">AGENT</span>' : ''}</div>${esc(msg.text)}</div>`).join('')
    : '<p class="empty">No messages yet in this room. Post below — ' + (statusData?.switchMode === 'REAL-SWITCH' ? 'it goes to the live Switch room (real Mattermost channel) and is logged in the audit trail.' : statusData?.switchMode === 'SWITCH-UNREACHABLE' ? 'the Switch server is currently unreachable, so the message will not be delivered. Check the server and retry.' : 'it goes to the SIMULATED stub transcript and is logged in the audit trail.') + '</p>';
}
$('#drawer-close').addEventListener('click', closeRoom);
$('#drawer-backdrop').addEventListener('click', closeRoom);
$('#room-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const c = details[roomCaseId]; if (!c) return;
  const text = $('#room-text').value.trim(); if (!text) return;
  try {
    await api('/api/switch/post', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ caseId: c.id, room: c.switchRoom, author: 'Mara (owner)', text }) });
    $('#room-text').value = '';
    details[c.id] = await api(`/api/cases/${c.id}`);
    renderRoom();
  } catch (err) { $('#room-log').insertAdjacentHTML('beforeend', `<p class="inline-error">${esc(err.message)}</p>`); }
});

// ---------- nav / search / boot ----------
$$('.nav-item').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
$('#search').addEventListener('input', (e) => {
  searchQuery = e.target.value;
  if (currentCaseId || (view !== 'overview' && view !== 'cases')) setView('cases');
  else render();
});
$('#search').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { const first = filteredCases()[0]; if (first) openCase(first.id); }
});
document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); $('#search').focus(); }
  if (e.key === 'Escape') { closeRoom(); if (!$('#modal-backdrop').hidden) closeModal(); }
});

(async function boot() {
  try {
    await loadAll();
    const params = new URLSearchParams(location.search);
    const deep = params.get('case');
    const tab = params.get('tab');
    if (tab && ['overview', 'analysis', 'negotiation', 'evidence', 'audit'].includes(tab)) currentTab = tab;
    if (deep && details[deep]) openCase(deep, currentTab); else render();
  } catch (e) {
    $('#view').innerHTML = `<section class="panel"><h2>Could not load CONVERGE</h2><p>${esc(e.message)}</p><p class="small muted">Is the server running? <span class="num">npm start</span> (port 3000).</p></section>`;
  }
})();
