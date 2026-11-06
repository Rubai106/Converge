// CONVERGE — premium operations workspace (Direction B, elevated).
// All money/percentages come from the API (deterministic engine). Nothing
// is hard-coded except labelled demo seed data (COURT blind scores) and
// static product copy. Switch mode comes from /api/status: REAL-SWITCH
// when the app is pointed at a live server, SIMULATED-STUB otherwise.
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => '$' + Number(n).toFixed(2);
// A signed delta: '+$0.48' for a cost, '-$0.06' for a saving. money()
// alone prints '$-0.06' for a negative, so prefixing '+' gave the double
// sign '+$-0.06' in the approval modal (2026-11-06). Zero reads '+$0.00'.
const signedMoney = (n) => (Number(n) < 0 ? '-' : '+') + '$' + Math.abs(Number(n)).toFixed(2);
// Same for a percent delta: '+50%' / '-5%' (never '+-5%').
const signedPct = (n) => (Number(n) < 0 ? '' : '+') + Number(n);
const pct = (n) => Number(n).toFixed(2) + '%';
const fmtTime = (iso) => { try { return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }); } catch { return '—'; } };
const fmtDateTime = (iso) => { try { return new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return '—'; } };
// Accent-insensitive matching (H2): "ragu" must match "ragù".
// NFD splits accented letters into base + combining mark; stripping the
// marks makes the comparison diacritic-blind in both directions.
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const matchesQuery = (text, q) => !q || norm(text).includes(q);

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
const STEPS = ['Draft', 'Investigating', 'Discussion', 'Proposal', 'Awaiting approval', 'Approved', 'Completed'];
const STEP_INDEX = { DRAFT: 0, INTAKE: 0, INVESTIGATING: 1, DISCUSSION: 2, PROPOSAL: 3, AWAITING_APPROVAL: 4, APPROVED: 5, COMPLETED: 6 };
const TERMINAL_NEG = ['REJECTED', 'BLOCKED', 'CANCELLED'];

// H8 (remediation 2026-11-06): APPROVED and REJECTED are never offered
// The Move dropdown is for plain state moves only — it never offers a
// state the UI cannot reach honestly. APPROVED/REJECTED go through the
// approval modal / reject confirmation, which restate the terms. And
// AWAITING_APPROVAL is entered ONLY by submitting a proposal — the
// "Submit for approval" action on the selected strategy (GAP-2) or the
// modal's re-route when the owner changes strategy at approve time —
// which attach the proposal (proposalId + terms): the dropdown sends no
// proposal, so offering it stranded the case in AWAITING_APPROVAL with
// no pending approval and no Approve/Reject buttons (GAP-1, 2026-11-06).
// The server gate (human-kind + pending-exists) is unchanged; this is
// the UX path. Pure, so the static tests can exercise it directly.
function moveOptions(state) {
  return (TRANSITIONS[state] || []).filter((t) => t !== 'APPROVED' && t !== 'REJECTED' && t !== 'AWAITING_APPROVAL');
}

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
const PROPOSAL_TO_STRATEGY = { P1: 'freeze', P2: 'counter-019', P3: 'volume-021', P4: 'alternative-018', P5: 'gradual', P6: 'substitute' };
// GAP-2 (2026-11-06): proposal IDs are P-numbers, positional in the
// engine's strategy order (haggleStrategies: freeze, counter-019,
// volume-021, alternative-018, gradual, substitute). P1/P2 are the
// seeded proposals (HAG-014's approval is P2); P3–P6 extend the same
// convention so every strategy can be submitted for approval. The
// server validates a submitted proposalId positionally against the
// case's own strategies. STRATEGY_TO_PROPOSAL is the inverse, used by
// the Submit for approval action and the modal's re-route so both send
// the same canonical id — the modal used to send the strategy id,
// which broke the PROPOSAL_TO_STRATEGY lookup and the approved-impact
// panel (approvedStrategy returned null for it).
const STRATEGY_TO_PROPOSAL = Object.fromEntries(Object.entries(PROPOSAL_TO_STRATEGY).map(([pid, sid]) => [sid, pid]));
// Canonical proposalId for a strategy, or null for an unknown id.
// Pure, so the static tests can exercise it directly.
function proposalIdForStrategy(strategyId) { return STRATEGY_TO_PROPOSAL[strategyId] || null; }
// Exact terms text for a strategy (the wording the owner signs).
// Pure; the fallback matches the inline lookups it replaces.
function termsForStrategy(s) { return STRATEGY_TERMS[s.id] || { short: money(s.unitPrice) + ' / fl oz', full: money(s.unitPrice) + '/fl oz' }; }

// The strategy behind an approval (or a pending approval), from the
// already-computed deterministic engine data — never invented numbers.
// Returns null when the case carries no approval/pending record for a
// known strategy (e.g. a hand-entered proposalId).
function approvedStrategy(c) {
  const pid = c.approval?.proposalId;
  if (!pid) return null;
  return (c.strategies || []).find((s) => s.id === PROPOSAL_TO_STRATEGY[pid]) || null;
}
// One-line financial consequence of a strategy, from engine data:
// extra cost per serving + per month, food-cost %, and the mandate
// check against the owner's max approved price. Shared by the approval
// modal (H7) and the reject confirmation (H10) so both restate the
// same figures the impact panel shows.
function strategyImpactLine(c, s) {
  const a = c.analysis;
  const perServing = s.creamCostPerServing - a.oldCreamCostPerServing;
  const mandate = s.unitPrice <= c.input.maxApprovedPrice
    ? `within mandate max ${money(c.input.maxApprovedPrice)}`
    : `above mandate max ${money(c.input.maxApprovedPrice)}`;
  return `${signedMoney(perServing)} / serving · ${signedMoney(s.extraVsOldPerMonth)} / month · food cost ${pct(s.foodCostPct)} (target ${c.input.targetFoodCostPct}%) · ${mandate}`;
}

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
// ---------- state ----------
// A case is a QA copy when its id ends in -QA or its title says so
// (qa-seed.mjs clones). QA copies are the same negotiation/case run a
// second time for testing — headline metrics must not count them twice
// (remediation M4, 2026-11-06).
function isQaCopy(c) { return /-QA$/.test(c.id || '') || /QA copy/i.test(c.title || ''); }
function prettyState(s) { const t = String(s || '').replace(/_/g, ' ').toLowerCase(); return t ? t[0].toUpperCase() + t.slice(1) : '—'; }
function switchVersionText() {
  const v = statusData?.switchVersion;
  return v ? { console: v.console, core: v.core } : null;
}
let statusData = null;
let cases = [];
let details = {};
let view = 'overview';
let currentCaseId = null;
let currentTab = 'overview';
// NEW-1 (2026-11-06): a deep link to a case created after boot used to
// silently keep showing the previously selected case — applyRoute
// returned false when the client's details cache lacked the case, and
// the hashchange handler then did nothing. A case route now resolves
// on demand: while its detail is being fetched (or the fetch failed)
// routeState carries the pending/error state and render() shows a
// loading / error panel instead of stale content. routeSeq discards
// fetches superseded by a newer navigation (Back/forward races).
let routeState = null; // { id, tab, status: 'loading' | 'error', kind, message }
let routeSeq = 0;
let selectedStrategy = null;
let courtSample = 'S1';
let evidenceFilter = 'All';
let casesStatusFilter = 'All';
let activityCaseFilter = 'All';
let searchQuery = '';
let roomCaseId = null;
let claimLocal = {}; // caseId -> claimId -> {status, challenge:{text, evidence, by}}

// ---------- guided HAGGLE case creation ----------
// Step validators + payload builder are pure (no DOM, no fetch) so the
// static tests can extract and exercise them directly. They mirror the
// server's rules in server/server.js validateHaggleCreation: finite
// numbers, qtyPerServing/menuPrice/targetFoodCostPct > 0, the rest >= 0,
// targetPrice <= maxApprovedPrice, non-empty supplier/ingredient, unit
// from the supported set. targetFoodCostPct is collected in step 3:
// the server requires it (> 0) to compute the max sustainable price,
// and the preview/create calls 400 without it.
const WIZARD_UNITS = ['fl oz', 'oz', 'lb', 'kg', 'g', 'L', 'ml', 'each', 'serving'];
const WIZARD_STEPS = ['Supplier & ingredient', 'Prices & quantity', 'Menu & volume', 'Your mandate', 'Review & create'];
const WIZARD_FIELD_STEP = { supplier: 1, ingredient: 1, recipe: 1, oldPrice: 2, newPrice: 2, unit: 2, qtyPerServing: 2, menuPrice: 3, otherIngredientsCostPerServing: 3, monthlySales: 3, targetFoodCostPct: 3, targetPrice: 4, maxApprovedPrice: 4, evidenceSource: 5 };
let wizard = null;
function newWizard() {
  return { step: 1, values: { supplier: '', ingredient: '', recipe: '', oldPrice: '', newPrice: '', unit: 'fl oz', qtyPerServing: '', menuPrice: '', otherIngredientsCostPerServing: '', monthlySales: '', targetFoodCostPct: '30', targetPrice: '', maxApprovedPrice: '', evidenceSource: '' }, errors: {}, preview: null, previewError: null, previewLoading: false, createError: null, creating: false };
}
function validateWizardStep(step, v) {
  const errors = {};
  const num = (f, min, exclusiveMin, label) => {
    const raw = v[f];
    const n = Number(raw);
    if (raw === '' || raw === undefined || raw === null || !Number.isFinite(n)) errors[f] = `${label} must be a number.`;
    else if (exclusiveMin ? !(n > min) : !(n >= min)) errors[f] = `${label} must be ${exclusiveMin ? 'greater than' : 'at least'} ${min}.`;
  };
  if (step === 1) {
    if (!String(v.supplier || '').trim()) errors.supplier = 'Supplier must not be empty.';
    if (!String(v.ingredient || '').trim()) errors.ingredient = 'Ingredient must not be empty.';
  } else if (step === 2) {
    num('oldPrice', 0, false, 'Old price');
    num('newPrice', 0, false, 'New price');
    if (!WIZARD_UNITS.includes(v.unit)) errors.unit = `Unit must be one of: ${WIZARD_UNITS.join(', ')}.`;
    num('qtyPerServing', 0, true, 'Quantity per serving');
  } else if (step === 3) {
    num('menuPrice', 0, true, 'Menu price');
    num('otherIngredientsCostPerServing', 0, false, 'Other ingredient costs per serving');
    num('monthlySales', 0, false, 'Monthly volume');
    num('targetFoodCostPct', 0, true, 'Target food cost %');
  } else if (step === 4) {
    num('targetPrice', 0, false, 'Target price');
    num('maxApprovedPrice', 0, false, 'Max approved price');
    if (!errors.targetPrice && !errors.maxApprovedPrice && Number(v.targetPrice) > Number(v.maxApprovedPrice)) errors.targetPrice = 'Target price must be less than or equal to max approved price.';
  }
  return errors;
}
function wizardPayload(v) {
  return {
    supplier: String(v.supplier || '').trim(),
    ingredient: String(v.ingredient || '').trim(),
    recipe: String(v.recipe || '').trim(),
    oldPrice: Number(v.oldPrice), newPrice: Number(v.newPrice), unit: v.unit,
    qtyPerServing: Number(v.qtyPerServing),
    otherIngredientsCostPerServing: Number(v.otherIngredientsCostPerServing),
    menuPrice: Number(v.menuPrice), monthlySales: Number(v.monthlySales),
    targetFoodCostPct: Number(v.targetFoodCostPct),
    targetPrice: Number(v.targetPrice), maxApprovedPrice: Number(v.maxApprovedPrice),
    evidenceSource: String(v.evidenceSource || '').trim(),
  };
}

function counterparty(c) {
  if (c.workflow === 'HAGGLE') return c.input?.supplier || '—';
  if (c.workflow === 'COURT') return 'Family group';
  if (c.workflow === 'CORRECTION') return (c.participants || []).find((p) => p.role === 'guest')?.name || '—';
  return '—';
}
function isActive(c) { return !['COMPLETED', 'REJECTED', 'CANCELLED'].includes(c.state); }
function statePill(state) {
  const cls = { AWAITING_APPROVAL: 'pill-amber', APPROVED: 'pill-teal', COMPLETED: 'pill-blue', REJECTED: 'pill-red', BLOCKED: 'pill-red', CANCELLED: 'pill-grey' }[state] || 'pill-grey';
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
// Pure helpers (remediation H11/L8) — no DOM, no fetch, so the static
// tests can extract and exercise them directly.
// parseVersionIngredients: "salt: a pinch\nfat: lard" -> {salt:'a pinch', fat:'lard'}.
// Lines without a colon, or with an empty key/value, are skipped.
function parseVersionIngredients(text) {
  const out = {};
  for (const line of String(text || '').split(/\n/)) {
    const i = line.indexOf(':');
    if (i <= 0) continue;
    const k = line.slice(0, i).trim();
    const v = line.slice(i + 1).trim();
    if (k && v) out[k] = v;
  }
  return out;
}
// validateRatingScores: first offending dimension, or null when valid.
// Scores must be whole numbers 1-5 (L8); the server 400 stays the backstop.
const RATING_DIMS = ['taste', 'texture', 'aroma', 'appearance', 'difficulty', 'overall'];
function validateRatingScores(scores) {
  for (const d of RATING_DIMS) {
    const v = scores ? scores[d] : undefined;
    if (!Number.isInteger(v) || v < 1 || v > 5) return `${d} must be a whole number from 1 to 5.`;
  }
  return null;
}
async function reloadCase(c) { details[c.id] = await api(`/api/cases/${c.id}`); }

// STALENESS fix (2026-11-06): a case changed server-side outside this
// tab (another tab, a direct API call, another user) used to stay stale
// until reload — the client fetched the detail once and cached it in
// `details`. On returning to the tab (visibilitychange -> visible) and
// on window focus, re-fetch the open case and re-render only if the
// server detail actually differs, so a focus event with no server change
// is a silent no-op. No interval polling. Skipped while a case route is
// loading, while the approval modal is open, or while the user is typing
// in a form, so a refresh never wipes in-progress input; a failed check
// leaves the cached view in place and retries on the next event.
let refreshingCase = false;
async function refreshOpenCase() {
  if (refreshingCase) return;
  const id = currentCaseId;
  if (!id || !details[id] || routeState) return;
  const modal = document.querySelector('#modal-backdrop');
  if (modal && !modal.hidden) return;
  const ae = document.activeElement;
  if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.tagName === 'SELECT' || ae.isContentEditable)) return;
  refreshingCase = true;
  try {
    const fresh = await api(`/api/cases/${encodeURIComponent(id)}`);
    if (currentCaseId !== id || !details[id]) return;
    if (JSON.stringify(fresh) !== JSON.stringify(details[id])) {
      details[id] = fresh;
      const row = cases.find((c) => c.id === id);
      if (row) row.state = fresh.state;
      render();
      if (roomCaseId === id) renderRoom();
    }
  } catch (e) {
    // Keep the cached view; the next focus/visibility event retries.
  } finally {
    refreshingCase = false;
  }
}

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
  const ver = switchVersionText();
  const verText = ver ? `Console ${ver.console} / core ${ver.core}` : 'Console — / core —';
  const text = `${mode} — ${verText}`;
  $('#sidebar-switch').textContent = 'Switch: ' + text;
  const pill = $('#switch-pill');
  pill.textContent = '● ' + mode;
  pill.title = live
    ? `Live Switch server (core ${ver?.core || '—'}) — rooms are real Mattermost channels via the Switch bridge.`
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
      ? `Switch integration is LIVE — real switch-core ${ver?.core || '—'} + Mattermost via the Switch bridge (see docs/switch-live-integration.md).`
      : unreachable
      ? 'Switch integration is configured but the server is currently unreachable — the pill above shows SWITCH-UNREACHABLE until the health probe succeeds.'
      : `Switch integration is a labelled simulation until a real Switch server (${verText}) is connected.`;
  }
  // H6: recovery controls appear only while unreachable.
  const recheck = $('#switch-recheck');
  if (recheck) recheck.hidden = !unreachable;
  const note = $('#switch-note');
  if (note) {
    note.hidden = !unreachable;
    if (unreachable) note.textContent = 'Switch is unreachable — local case data and decisions still work; rooms and messages are unavailable until the connection recovers.';
  }
}

// ---------- shell: hash routing (H5) ----------
// Deep links are hash routes: #/cases, #/workflows, #/case/HAG-014 and
// #/case/HAG-014?tab=audit. The hash is the single source of truth for
// the view, so refresh, bookmark and Back all preserve it; the server
// still serves the SPA shell at / and /app/* only (no server change —
// the /cases path 404 is the old non-hash URL, not a deep link).
// NEW-1 (2026-11-06): a case route whose detail is not in the client
// cache (case created after boot) is fetched on demand by
// resolveCaseRoute instead of being dropped — the hash is still the
// source of truth, the server is the source of the detail.
const VIEWS = ['overview', 'cases', 'workflows', 'evidence', 'decisions', 'activity', 'settings', 'create'];
const CASE_TABS = ['overview', 'analysis', 'negotiation', 'evidence', 'audit'];
function hashFor(v, caseId, tab) {
  if (caseId) return `#/case/${encodeURIComponent(caseId)}${tab && tab !== 'overview' ? `?tab=${tab}` : ''}`;
  return `#/${v}`;
}
function parseHash() {
  const raw = location.hash.replace(/^#/, '');
  const [path, query] = raw.split('?');
  const parts = path.split('/').filter(Boolean);
  const params = new URLSearchParams(query || '');
  if (parts[0] === 'case' && parts[1]) {
    const tab = params.get('tab');
    return { caseId: decodeURIComponent(parts[1]), tab: CASE_TABS.includes(tab) ? tab : 'overview' };
  }
  if (parts.length === 1 && VIEWS.includes(parts[0])) return { view: parts[0] };
  if (!parts.length) return { view: 'overview' };
  return null;
}
// Resolve a case route, fetching the detail from the server when the
// client cache misses (case created after boot, or a bookmark/refresh
// in a stale tab). Never silently shows the wrong case: while the
// fetch is in flight the view is a loading panel; a 404 becomes a
// "case not found" panel; any other failure becomes an error panel
// with a retry button. A superseded fetch (Back/forward during the
// request) is discarded via routeSeq.
async function resolveCaseRoute(id, tab) {
  const seq = ++routeSeq;
  // GAP-2 staleness: the selected strategy is per-case — reset it when
  // opening a different case so the Submit button always submits the
  // strategy this case shows selected (its own approval/pending/default),
  // never a leftover selection from the previous case.
  if (id !== currentCaseId) selectedStrategy = null;
  currentCaseId = id; currentTab = tab || 'overview';
  $$('.nav-item').forEach((b) => { b.classList.remove('is-active'); b.removeAttribute('aria-current'); });
  if (details[id]) { routeState = null; render(); $('#view').focus({ preventScroll: true }); return true; }
  routeState = { id, tab: currentTab, status: 'loading' };
  render();
  $('#view').focus({ preventScroll: true });
  try {
    const d = await api(`/api/cases/${encodeURIComponent(id)}`);
    if (seq !== routeSeq) return true; // superseded by a newer navigation
    details[id] = d;
    if (!cases.some((c) => c.id === id)) {
      cases.push(d);
      $('#nav-case-count').textContent = String(cases.filter(isActive).length);
    }
    routeState = null;
    render();
    $('#view').focus({ preventScroll: true });
  } catch (e) {
    if (seq !== routeSeq) return true;
    const notFound = /not found/i.test(e.message || '');
    routeState = { id, tab: currentTab, status: 'error', kind: notFound ? 'not-found' : 'load', message: notFound ? '' : (e.message || 'Request failed') };
    render();
    $('#view').focus({ preventScroll: true });
  }
  return true;
}
function renderRouteState() {
  // Loading / error panel for a case route whose detail is not in the
  // client cache yet. Rendered instead of any case content, so stale
  // content is never presented as the requested case.
  setBreadcrumb('');
  const s = routeState;
  if (s.status === 'loading') {
    $('#view').innerHTML = `<section class="panel" role="status"><h1>Loading case…</h1><p>Fetching <span class="num">${esc(s.id)}</span>…</p></section>`;
    return;
  }
  if (s.kind === 'not-found') {
    $('#view').innerHTML = `<section class="panel"><h1>Case not found</h1><p>No case with ID <span class="num">${esc(s.id)}</span> exists. It may have been deleted, or the link may be wrong.</p><p><button class="btn" id="route-back">← All cases</button></p></section>`;
  } else {
    $('#view').innerHTML = `<section class="panel"><h1>Could not load case</h1><p>Fetching <span class="num">${esc(s.id)}</span> failed: ${esc(s.message)}.</p><p><button class="btn" id="route-retry">Retry</button> <button class="ghost-btn" id="route-back">← All cases</button></p></section>`;
    $('#route-retry').addEventListener('click', () => resolveCaseRoute(s.id, s.tab));
  }
  $('#route-back').addEventListener('click', () => setView('cases'));
}
async function applyRoute(route) {
  if (!route) return false;
  if (route.caseId) return resolveCaseRoute(route.caseId, route.tab || 'overview');
  routeState = null; view = route.view; currentCaseId = null; currentTab = 'overview';
  $$('.nav-item').forEach((b) => {
    const on = b.dataset.view === view;
    b.classList.toggle('is-active', on);
    if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  render();
  $('#view').focus({ preventScroll: true });
  return true;
}
function setView(v) {
  const target = hashFor(v, null, null);
  if (location.hash === target) {
    // Already on this route (e.g. re-clicking the active nav item):
    // render directly instead of waiting for a hashchange that won't fire.
    view = v; currentCaseId = null; currentTab = 'overview';
    $$('.nav-item').forEach((b) => {
      const on = b.dataset.view === v;
      b.classList.toggle('is-active', on);
      if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    render();
    $('#view').focus({ preventScroll: true });
    return;
  }
  // State is applied by the hashchange handler — do not pre-set view
  // here, or its "already on this route" guard would swallow the event.
  location.hash = target;
}
function openCase(id, tab = 'overview') {
  // NEW-1: never bail silently on a cache miss — navigating sets the
  // hash and resolveCaseRoute fetches the detail on demand.
  const target = hashFor(null, id, tab);
  if (location.hash === target) {
    resolveCaseRoute(id, tab);
    return;
  }
  location.hash = target; // hashchange -> applyRoute
}
function backToDashboard() { setView('overview'); }
function setBreadcrumb(html) {
  const el = $('#breadcrumb');
  el.innerHTML = html;
  el.hidden = !html; // M1: no breadcrumb at all when it would duplicate the H1
}
// Keep the hash in step with in-place tab changes (replaceState: no new
// history entry — the tab is part of the case view, not a new page).
function syncCaseHash() {
  if (!currentCaseId) return;
  history.replaceState(null, '', hashFor(null, currentCaseId, currentTab));
}
window.addEventListener('hashchange', () => {
  const route = parseHash();
  if (!route) return;
  // Ignore the event when the hash already matches current state
  // (e.g. a tab sync that only changed the query).
  if (route.caseId) {
    if (route.caseId === currentCaseId && (route.tab || 'overview') === currentTab) return;
  } else if (!currentCaseId && route.view === view) return;
  applyRoute(route);
});
// STALENESS fix (2026-11-06): refresh the open case when the user
// returns to the tab or the window regains focus — see refreshOpenCase
// above. No interval polling.
document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshOpenCase(); });
window.addEventListener('focus', refreshOpenCase);

// ---------- Switch status + re-probe (H6) ----------
// When Switch is unreachable there is a "Recheck connection" button
// beside the pill and a line under the topbar stating what still works
// (local case data and decisions) vs what doesn't (rooms/messages).
// Recovery no longer silently requires a full reload.
async function recheckSwitch() {
  const btn = $('#switch-recheck');
  if (btn) { btn.disabled = true; btn.textContent = 'Checking…'; }
  try {
    statusData = await api('/api/status');
    renderSwitchStatus();
    render();
  } catch (e) {
    renderSwitchStatus();
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Recheck connection'; }
  }
}

function render() {
  if (currentCaseId && details[currentCaseId]) { renderCase(); return; }
  // NEW-1: a case route whose detail is loading or failed to load
  // shows its own panel — never the dashboard, never a stale case.
  if (currentCaseId && routeState && routeState.id === currentCaseId) { renderRouteState(); return; }
  if (currentCaseId) { currentCaseId = null; }
  ({ overview: renderDashboard, cases: renderCasesView, workflows: renderWorkflows,
     evidence: renderEvidenceView, decisions: renderDecisionsView, create: renderCreateWizard,
     activity: renderActivityView, settings: renderSettingsView }[view] || renderDashboard)();
}

// ---------- dashboard ----------
function kpiData() {
  // M4: QA copies are excluded from every headline metric — HAG-QA is
  // a test copy of the HAG-014 negotiation, so counting it would double
  // the extra cost ($76.80 -> $153.60) and inflate the case counts.
  const real = cases.filter((c) => !isQaCopy(c));
  const realDetails = Object.values(details).filter((d) => !isQaCopy(d));
  const active = real.filter(isActive).length;
  const awaiting = real.filter((c) => c.state === 'AWAITING_APPROVAL').length;
  const extraMonth = realDetails
    .filter((d) => d.workflow === 'HAGGLE' && d.analysis)
    .reduce((s, d) => s + d.analysis.monthlyExtraCost, 0);
  const weekAgo = Date.now() - 7 * 24 * 3600 * 1000;
  const decided = new Set();
  for (const d of realDetails) {
    if (d.approval?.approvedAt && new Date(d.approval.approvedAt).getTime() >= weekAgo) decided.add(d.id);
    for (const a of (d.audit || [])) {
      if (/->APPROVED$/.test(a.event) && new Date(a.at).getTime() >= weekAgo) decided.add(d.id);
    }
  }
  return { active, awaiting, extraMonth, decided: decided.size, qaExcluded: cases.length - real.length };
}
function filteredCases() {
  const q = norm(searchQuery.trim());
  if (!q) return cases;
  return cases.filter((c) => matchesQuery([c.id, c.title, c.workflow, counterparty(c), c.state].join(' '), q));
}
// The dashboard search filters every panel on the page (H2), not just
// the table: the attention list and the activity feed use the same
// normalised query, so the "Filtered by …" caption never contradicts
// a panel below it.
function filteredNeeds() {
  const q = norm(searchQuery.trim());
  return cases.filter((c) => (c.state === 'AWAITING_APPROVAL' || c.state === 'DISCUSSION')
    && matchesQuery([c.id, c.title, c.state].join(' '), q));
}
function filteredActivity() {
  const q = norm(searchQuery.trim());
  return activityFeed().filter((a) => matchesQuery(a.text, q));
}
function casesTableRows(list) {
  return list.map((c) => {
    const d = details[c.id] || c;
    const impact = d.workflow === 'HAGGLE' && d.analysis ? money(d.analysis.monthlyExtraCost) + '/mo' : '—';
    const owner = (d.participants || []).find((p) => p.role === 'owner' || p.role === 'host')?.name || '—';
    // UPDATED column dropped (M5): no created/seeded timestamp exists in
    // the data model, so the column showed "—" for every seeded row and
    // only filled after a transition. Inventing a time would fabricate
    // provenance; the audit trail on each case carries real timestamps.
    // L2: clickable rows expose their action to assistive tech.
    return `<tr class="clickable" data-open="${esc(c.id)}" tabindex="0" role="button" aria-label="Open case ${esc(c.id)} — ${esc(c.title)}">
      <td><span class="num">${esc(c.id)}</span><br><span class="muted small">${esc(c.title)}</span></td>
      <td>${esc(c.workflow)}</td><td>${esc(counterparty(c))}</td>
      <td class="num">${impact}</td><td>${statePill(c.state)}</td>
      <td class="col-owner">${esc(owner)}</td></tr>`;
  }).join('');
}
function bindCaseRows(root) {
  // Case links (data-case anchors rendered inside feed/decisions text)
  // open in place instead of reloading the page.
  $$('a[data-case]', root).forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); openCase(a.dataset.case); }));
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
  // M1: the breadcrumb duplicated the H1 ("Overview" twice). Top-level
  // views carry no breadcrumb; the case workspace keeps its "Cases / …"
  // parent crumb, which does not duplicate its H1.
  setBreadcrumb('');
  const k = kpiData();
  const needs = filteredNeeds();
  const awaiting = needs.filter((c) => c.state === 'AWAITING_APPROVAL');
  const discussing = needs.filter((c) => c.state === 'DISCUSSION');
  const activity = filteredActivity().slice(0, 6);
  const needsRows = (list) => list.map((c) => {
    const d = details[c.id] || c;
    const need = c.state === 'AWAITING_APPROVAL'
      ? `Approve ${esc(d.pendingApproval?.terms || 'pending terms')}`
      : 'Discussion open — review the versions and vote';
    return `<div class="decision-row"><div><div class="dr-title"><span class="num">${esc(c.id)}</span> — ${esc(c.title)}</div>
      <div class="dr-sub">${need}</div></div>
      <button class="ghost-btn btn-sm" data-open="${esc(c.id)}">${c.state === 'AWAITING_APPROVAL' ? 'Review &amp; approve' : 'Open'}</button></div>`;
  }).join('');
  $('#view').innerHTML = `
    <h1 class="section-title">Overview</h1>
    <p class="section-sub">One shared decision engine across HAGGLE, COURT and CORRECTION. Humans approve; agents propose, calculate and investigate.</p>
    <p><button class="btn" id="new-case-btn">+ New supplier case</button></p>
    <div class="kpis" role="group" aria-label="Key figures">
      <div class="kpi"><small>Active cases</small><b>${k.active}</b><div class="kpi-note">${cases.length} total cases${k.qaExcluded ? ` · ${k.qaExcluded} QA ${k.qaExcluded === 1 ? 'copy' : 'copies'} excluded` : ''}</div></div>
      <div class="kpi"><small>Awaiting approval</small><b>${k.awaiting}</b><div class="kpi-note">human decision required</div></div>
      <div class="kpi"><small>Extra cost this month</small><b>${money(k.extraMonth)}</b><div class="kpi-note">HAGGLE cases, deterministic${k.qaExcluded ? ' · QA copies excluded' : ''}</div></div>
      <div class="kpi"><small>Decisions this week</small><b>${k.decided}</b><div class="kpi-note">approved in the last 7 days</div></div>
    </div>
    <section class="panel" aria-labelledby="needs-h">
      <h2 id="needs-h">Needs your attention</h2>
      ${needs.length ? `
        ${awaiting.length ? `<h3>Awaiting your approval</h3>${needsRows(awaiting)}` : ''}
        ${discussing.length ? `<h3>Open discussions</h3>${needsRows(discussing)}` : ''}`
        : `<p class="empty">${searchQuery ? `No attention items match “${esc(searchQuery)}”.` : 'Nothing needs a human decision right now.'}</p>`}
    </section>
    <section class="panel" aria-labelledby="cases-h">
      <h2 id="cases-h">All cases</h2>
      <div class="table-wrap"><table>
        <caption>${searchQuery ? `Filtered by “${esc(searchQuery)}” — cases, attention items and activity on this page.` : 'Click a row to open the case workspace.'}</caption>
        <thead><tr><th scope="col">Case</th><th scope="col">Workflow</th><th scope="col">Counterparty</th>
        <th scope="col" class="num">Impact</th><th scope="col">Stage</th><th scope="col" class="col-owner">Owner</th></tr></thead>
        <tbody>${casesTableRows(filteredCases()) || `<tr><td colspan="6" class="empty">No cases match “${esc(searchQuery)}”.</td></tr>`}</tbody>
      </table></div>
    </section>
    <section class="panel" aria-labelledby="act-h">
      <h2 id="act-h">Recent agent activity</h2>
      ${activity.length ? activity.map((a) => `<div class="activity-item">${activityItemHtml(a)}</div>`).join('') : `<p class="empty">${searchQuery ? `No activity matches “${esc(searchQuery)}”.` : 'No agent activity recorded yet in this demo session.'}</p>`}
      <p class="small muted" style="margin-top:8px">Derived from case records (proposals, approvals, audit events) — not a live feed.</p>
    </section>`;
  $('#new-case-btn').addEventListener('click', openWizard);
  bindCaseRows($('#view'));
}
function activityFeed() {
  const items = [];
  for (const d of Object.values(details)) {
    for (const a of (d.audit || [])) {
      // M6/M9: the feed used to render audit events verbatim —
      // "Facilitator Agent — room-message" with no message text, and
      // "Mara (owner) — state:AWAITING_APPROVAL->APPROVED" as raw enums.
      // Room-message events now carry the message excerpt (looked up in
      // the case's messages by event id); one with no displayable
      // content is omitted instead of rendered as an empty row.
      // Claim-status changes carry the claim and its new status.
      if (a.event === 'room-message') {
        const msg = (d.messages || []).find((m) => m.eventId === a.eventId || m.id === a.eventId || m.id === a.id);
        if (!msg || !String(msg.text || '').trim()) continue;
        const excerpt = msg.text.length > 160 ? msg.text.slice(0, 160) + '…' : msg.text;
        items.push({ at: a.at, caseId: d.id, text: `${a.actor} posted in ${d.switchRoom || 'the room'} on ${d.id}: “${excerpt}”` });
      } else if (/^state:/.test(a.event)) {
        const m = /^state:(\w+)->(\w+)$/.exec(a.event);
        items.push({ at: a.at, caseId: d.id, text: m ? `${a.actor} moved ${d.id} from ${prettyState(m[1])} to ${prettyState(m[2])}` : `${a.actor} — ${a.event}` });
      } else if (a.event === 'claim-status') {
        const claim = (d.claims || []).find((cl) => cl.id === a.claim);
        const challenge = claim?.guestChallenge?.text ? ` — guest challenge: “${claim.guestChallenge.text}”` : '';
        items.push({ at: a.at, caseId: d.id, text: a.claim && a.status ? `${a.actor} changed claim ${a.claim} on ${d.id} to ${a.status}${challenge}` : `${a.actor} changed a claim's status on ${d.id}` });
      } else {
        items.push({ at: a.at, caseId: d.id, text: `${a.actor} — ${a.event}` });
      }
    }
    for (const p of (d.proposals || [])) items.push({ at: null, caseId: d.id, text: `${p.by} submitted ${p.kind === 'counter-offer' ? 'a counter-offer' : 'a proposal'} on ${d.id}: ${p.text}` });
    if (d.pendingApproval) items.push({ at: null, caseId: d.id, text: `${d.pendingApproval.requestedBy} requested approval on ${d.id}: ${d.pendingApproval.terms}` });
  }
  return items.sort((a, b) => {
    if (a.at && b.at) return new Date(b.at) - new Date(a.at);
    return a.at ? -1 : 1;
  });
}
// Render a feed item's text with its case id as a real link (M9).
function activityItemHtml(a, withTime = true) {
  const linked = a.caseId ? esc(a.text).replace(new RegExp(esc(a.caseId).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), `<a href="?case=${esc(a.caseId)}" data-case="${esc(a.caseId)}">${esc(a.caseId)}</a>`) : esc(a.text);
  return `${withTime && a.at ? `<span class="ai-time">${fmtTime(a.at)}</span>` : ''}${linked}`;
}

// ---------- secondary views ----------
function renderCasesView() {
  setBreadcrumb('');
  // M2: this page used to duplicate the dashboard table exactly. It
  // now has its own value — status filter chips over the same list.
  const chips = [['All', 'All'], ['AWAITING_APPROVAL', 'Awaiting approval'], ['DISCUSSION', 'Discussion'], ['COMPLETED', 'Completed']];
  const list = filteredCases().filter((c) => casesStatusFilter === 'All' || c.state === casesStatusFilter);
  $('#view').innerHTML = `
    <h1 class="section-title">Active Cases</h1>
    <p class="section-sub">${cases.filter(isActive).length} active of ${cases.length} total. Click a row to open the case workspace.</p>
    <p><button class="btn" id="new-case-btn">+ New supplier case</button></p>
    <div class="filter-row" role="group" aria-label="Filter cases by stage">
      ${chips.map(([v, label]) => `<button class="ghost-btn btn-sm ${casesStatusFilter === v ? 'is-active' : ''}" data-cases-filter="${v}" aria-pressed="${casesStatusFilter === v}">${label}</button>`).join('')}
    </div>
    <section class="panel"><div class="table-wrap"><table>
      <caption>${list.length} case${list.length === 1 ? '' : 's'}${casesStatusFilter === 'All' ? '' : ` — stage ${prettyState(casesStatusFilter)}`}${searchQuery ? ` · filtered by “${esc(searchQuery)}”` : ''}.</caption>
      <thead><tr><th scope="col">Case</th><th scope="col">Workflow</th><th scope="col">Counterparty</th>
      <th scope="col" class="num">Impact</th><th scope="col">Stage</th><th scope="col" class="col-owner">Owner</th></tr></thead>
      <tbody>${casesTableRows(list) || `<tr><td colspan="6" class="empty">No cases match.</td></tr>`}</tbody>
    </table></div></section>`;
  $('#new-case-btn').addEventListener('click', openWizard);
  $$('[data-cases-filter]', $('#view')).forEach((b) => b.addEventListener('click', () => { casesStatusFilter = b.dataset.casesFilter; renderCasesView(); }));
  bindCaseRows($('#view'));
}
function renderWorkflows() {
  setBreadcrumb('');
  // M7: "configurable" is dropped — no configuration exists. Each demo
  // case is now a link to its case, and the demo case's current stage
  // is highlighted inside its chain.
  const stagesOf = (chain) => chain.split(' → ').map((s) => s.trim());
  const rows = [
    ['HAGGLE', 'Margin-aware supplier negotiation', 'Draft → Investigating → Discussion → Proposal → Awaiting approval → Approved → Completed', 'HAG-014', 'Negotiation Agent, Financial Analyst'],
    ['COURT', 'Blind recipe testing and adjudication', 'Intake → Investigating → Discussion → Proposal → Approved', 'CRT-007', 'Facilitator Agent'],
    ['CORRECTION', 'Evidence-backed factual correction', 'Intake → Investigating → Discussion → Proposal → Approved', 'COR-003', 'Verification Agent'],
  ];
  $('#view').innerHTML = `
    <h1 class="section-title">Workflows</h1>
    <p class="section-sub">Three workflows on one shared decision engine. Same states, same approval gate, same audit trail.</p>
    <section class="panel"><div class="table-wrap"><table>
      <caption>Workflow templates and their demo cases. The highlighted stage is where the demo case sits now.</caption>
      <thead><tr><th scope="col">Workflow</th><th scope="col">Purpose</th><th scope="col">Stages</th><th scope="col">Demo case</th><th scope="col">Agents</th></tr></thead>
      <tbody>${rows.map((r) => {
        const demo = cases.find((c) => c.id === r[3]) || details[r[3]];
        const current = demo ? prettyState(demo.state) : null;
        const chain = stagesOf(r[2]).map((s) => s === current ? `<strong class="stage-current" aria-current="true">${esc(s)}</strong>` : esc(s)).join(' → ');
        // AXE-1 (2026-11-06): this row carries an inner demo-case link,
        // so it must NOT also carry role="button" — a link inside a
        // button-role row is a nested-interactive axe violation. The row
        // stays clickable (bindCaseRows: click + Enter/Space) and the
        // link is the accessible control; other clickable rows without
        // inner links keep role="button" (L2).
        return `<tr class="clickable" data-open="${r[3]}"><td><strong>${r[0]}</strong></td><td>${r[1]}</td><td>${chain}</td><td class="num"><a href="?case=${r[3]}" data-case="${r[3]}">${r[3]}</a></td><td>${r[4]}</td></tr>`;
      }).join('')}</tbody>
    </table></div></section>`;
  bindCaseRows($('#view'));
}
function allEvidence() {
  const out = [];
  for (const d of Object.values(details)) for (const e of (d.evidence || [])) out.push({ ...e, caseId: d.id, caseTitle: d.title });
  return out;
}
function renderEvidenceView() {
  setBreadcrumb('');
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
      <tbody>${items.map((e) => `<tr class="clickable" data-open="${e.caseId}" role="button" aria-label="Open case ${esc(e.caseId)} — ${esc(e.caseTitle)}"><td><span class="tag-ev">[${esc(e.caseId)} · ${esc(e.id)}]</span></td><td>${esc(e.type)}</td><td>${esc(e.source)}</td><td class="num">${esc(e.caseId)}<br><span class="muted small">${esc(e.caseTitle)}</span></td><td>${esc(e.status)}</td><td class="muted">${esc(e.note || '')}</td></tr>`).join('') || `<tr><td colspan="6" class="empty">No evidence with status ${esc(evidenceFilter)}.</td></tr>`}</tbody>
    </table></div></section>`;
  $$('[data-filter]', $('#view')).forEach((b) => b.addEventListener('click', () => { evidenceFilter = b.dataset.filter; renderEvidenceView(); }));
  bindCaseRows($('#view'));
}
function renderDecisionsView() {
  setBreadcrumb('');
  const pending = cases.filter((c) => (details[c.id] || c).pendingApproval);
  const decided = cases.filter((c) => (details[c.id] || c).approval);
  $('#view').innerHTML = `
    <h1 class="section-title">Decisions</h1>
    <p class="section-sub">Approvals are human-only and recorded as a signed sentence in the audit trail.</p>
    <section class="panel" aria-labelledby="pend-h"><h2 id="pend-h">Awaiting approval</h2>
      ${pending.length ? pending.map((c) => { const d = details[c.id]; return `<div class="decision-row"><div><div class="dr-title"><span class="num">${esc(c.id)}</span> — ${esc(c.title)}</div><div class="dr-sub">${esc(d.pendingApproval.terms)} · requested by ${esc(d.pendingApproval.requestedBy)}</div></div><button class="ghost-btn btn-sm" data-open="${esc(c.id)}">Review &amp; approve</button></div>`; }).join('') : '<p class="empty">No pending approvals.</p><p class="small muted">Approvals are requested from a case workspace — open a case in Awaiting approval.</p>'}
    </section>
    <section class="panel" aria-labelledby="dec-h"><h2 id="dec-h">Decided</h2>
      ${decided.length ? decided.map((c) => { const d = details[c.id]; const a = d.approval; return `<div class="decision-sentence">“I approve ${esc(a.terms)}.” — ${esc(a.approvedBy)}, ${fmtDateTime(a.approvedAt)} · case <a href="?case=${esc(c.id)}" data-case="${esc(c.id)}"><span class="num">${esc(c.id)}</span></a></div>`; }).join('') : '<p class="empty">No decisions recorded yet. Approve HAG-014 to see the signed sentence here.</p>'}
    </section>`;
  bindCaseRows($('#view'));
}
function renderActivityView() {
  setBreadcrumb('');
  const items = activityFeed().filter((a) => activityCaseFilter === 'All' || a.caseId === activityCaseFilter);
  $('#view').innerHTML = `
    <h1 class="section-title">Activity</h1>
    <p class="section-sub">Audit trail across all cases. Every state change, proposal and room message is logged.</p>
    <div class="filter-row" role="group" aria-label="Filter activity by case">
      <button class="ghost-btn btn-sm ${activityCaseFilter === 'All' ? 'is-active' : ''}" data-activity-filter="All" aria-pressed="${activityCaseFilter === 'All'}">All cases</button>
      ${cases.map((c) => `<button class="ghost-btn btn-sm ${activityCaseFilter === c.id ? 'is-active' : ''}" data-activity-filter="${esc(c.id)}" aria-pressed="${activityCaseFilter === c.id}">${esc(c.id)}</button>`).join('')}
    </div>
    <section class="panel"><h2>All activity</h2>
      ${items.length ? `<ol class="audit-list">${items.map((a) => `<li>${a.at ? `<span class="au-time">${fmtDateTime(a.at)}</span>` : '<span class="au-time">date not recorded</span>'}${activityItemHtml(a, false)}</li>`).join('')}</ol>` : '<p class="empty">No activity recorded yet.</p>'}
    </section>`;
  $$('[data-activity-filter]', $('#view')).forEach((b) => b.addEventListener('click', () => { activityCaseFilter = b.dataset.activityFilter; renderActivityView(); }));
  bindCaseRows($('#view'));
}
function renderSettingsView() {
  setBreadcrumb('');
  // M11: this was labelled "Settings" but is a status readout with no
  // controls — renamed to Environment. Health is plain words (the raw
  // error stays in a title attribute); Switch versions come from
  // /api/status, not hardcoded client text. L1: the demo identity is
  // labelled here as fixed, with no sign-in.
  const ver = switchVersionText();
  const sh = statusData?.switchHealth;
  const health = !sh ? { text: '—', title: '' }
    : sh.ok === false ? { text: 'Server did not answer the health check', title: sh.error || 'health probe failed' }
    : sh.status !== undefined ? { text: String(sh.status), title: sh.note || '' }
    : sh.note ? { text: sh.note, title: '' } : { text: '—', title: '' };
  $('#view').innerHTML = `
    <h1 class="section-title">Environment</h1>
    <p class="section-sub">Environment and integration status for this workspace.</p>
    <section class="panel"><h2>Integration status</h2>
      <dl class="kv">
        <dt>Switch mode</dt><dd>${esc(statusData?.switchMode || '—')}</dd>
        <dt>Switch Console / core</dt><dd>${ver ? `${esc(ver.console)} / ${esc(ver.core)}` : '—'}</dd>
        <dt>Switch health</dt><dd${health.title ? ` title="${esc(health.title)}"` : ''}>${esc(health.text)}</dd>
        <dt>Cases in workspace</dt><dd>${cases.length}</dd>
        <dt>Demo data</dt><dd>Fictional — labelled throughout</dd>
        <dt>Identity</dt><dd>Demo identity — Mara (owner). No sign-in; every visitor sees the same identity. This is a demo limitation, not production authorization.</dd>
      </dl>
      <p class="small muted" style="margin-top:10px">Point this app at a real Switch server by setting SWITCH_BASE_URL and a real agent key; the stub is used only while SWITCH_BASE_URL is unset. Keyboard: ⌘K focuses search.</p>
    </section>`;
}

// ---------- guided HAGGLE case creation wizard ----------
function openWizard() {
  wizard = newWizard();
  setView('create');
}
function cancelWizard() { wizard = null; setView('overview'); }
function wizardFieldError(field) {
  const msg = wizard.errors[field];
  return msg ? `<span class="inline-error" role="alert">${esc(msg)}</span>` : '';
}
function wizardStepFields() {
  const v = wizard.values;
  const num = (id, label, val, extra = '') => `<label>${esc(label)} <input type="number" step="any" min="0" id="wz-${id}" value="${esc(val)}" ${extra}>${wizardFieldError(id)}</label>`;
  if (wizard.step === 1) return `
    <label>Supplier <input type="text" id="wz-supplier" value="${esc(v.supplier)}" placeholder="e.g. DairyCo" autocomplete="off">${wizardFieldError('supplier')}</label>
    <label>Ingredient <input type="text" id="wz-ingredient" value="${esc(v.ingredient)}" placeholder="e.g. heavy cream" autocomplete="off">${wizardFieldError('ingredient')}</label>
    <label>Recipe (optional) <input type="text" id="wz-recipe" value="${esc(v.recipe)}" placeholder="e.g. Alfredo" autocomplete="off">${wizardFieldError('recipe')}</label>`;
  if (wizard.step === 2) return `
    ${num('oldPrice', 'Old price ($)', v.oldPrice)}
    ${num('newPrice', 'New price ($)', v.newPrice)}
    <label>Unit <select id="wz-unit">${WIZARD_UNITS.map((u) => `<option value="${esc(u)}" ${v.unit === u ? 'selected' : ''}>${esc(u)}</option>`).join('')}</select>${wizardFieldError('unit')}</label>
    ${num('qtyPerServing', 'Quantity per serving', v.qtyPerServing)}`;
  if (wizard.step === 3) return `
    ${num('menuPrice', 'Menu price ($)', v.menuPrice)}
    ${num('otherIngredientsCostPerServing', 'Other ingredient costs per serving ($)', v.otherIngredientsCostPerServing)}
    ${num('monthlySales', 'Monthly volume (servings)', v.monthlySales, 'step="1"')}
    ${num('targetFoodCostPct', 'Target food cost (%)', v.targetFoodCostPct)}`;
  if (wizard.step === 4) return `
    ${num('targetPrice', 'Target price ($)', v.targetPrice)}
    ${num('maxApprovedPrice', 'Max approved price ($)', v.maxApprovedPrice)}
    <p class="small muted">Walk away above <strong>${v.maxApprovedPrice !== '' && Number.isFinite(Number(v.maxApprovedPrice)) ? money(Number(v.maxApprovedPrice)) : '—'}</strong> — the owner will not pay more than the max approved price.</p>`;
  return wizardReviewStep();
}
function wizardReviewStep() {
  const v = wizard.values;
  const a = wizard.preview?.analysis;
  const strategies = wizard.preview?.strategies || [];
  let body = '';
  if (wizard.previewLoading) {
    body = '<p>Calculating the preview — food cost, margin and strategies…</p>';
  } else if (wizard.previewError) {
    // The server names the offending field; point the user at its step.
    const field = Object.keys(WIZARD_FIELD_STEP).find((f) => new RegExp(`\\b${f}\\b`).test(wizard.previewError));
    const step = field ? WIZARD_FIELD_STEP[field] : null;
    body = `<p class="inline-error" role="alert">${esc(wizard.previewError)}</p>
      ${step ? `<p><button class="ghost-btn btn-sm" type="button" id="wz-fix-step">Go to step ${step} to fix it</button></p>` : ''}`;
  } else if (a) {
    body = `
    <h3>Calculation — deterministic, no LLM maths</h3>
    <dl class="kv">
      <dt>Cream / serving</dt><dd>${money(a.oldCreamCostPerServing)} → ${money(a.newCreamCostPerServing)}</dd>
      <dt>Extra cost</dt><dd>${signedMoney(a.costDiffPerServing)} / serving · ${money(a.monthlyExtraCost)} / month · ${money(a.annualExtraCost)} / year</dd>
      <dt>Food cost</dt><dd>${pct(a.oldFoodCostPct)} → ${pct(a.newFoodCostPct)} (target ${esc(String(v.targetFoodCostPct))}%)</dd>
      <dt>Gross margin</dt><dd>${pct(a.oldGrossMarginPct)} → ${pct(a.newGrossMarginPct)}</dd>
      <dt>Max sustainable price</dt><dd>${money(a.maxSustainableUnitPrice)} / ${esc(v.unit)}</dd>
    </dl>
    <h3>Assumptions</h3>
    <p class="small">${esc(v.qtyPerServing)} ${esc(v.unit)} per serving · other ingredients ${money(Number(v.otherIngredientsCostPerServing))} · menu ${money(Number(v.menuPrice))} · ${esc(v.monthlySales)} servings/month · target ${esc(v.targetPrice)} / max ${money(Number(v.maxApprovedPrice))} — walk away above ${money(Number(v.maxApprovedPrice))}</p>
    <h3>Strategies</h3>
    <div class="table-wrap"><table>
      <caption>Strategies priced by the deterministic engine.</caption>
      <thead><tr><th scope="col">Option</th><th scope="col" class="num">Price</th><th scope="col" class="num">Food cost</th><th scope="col" class="num">Monthly impact</th></tr></thead>
      <tbody>${strategies.map((s) => `<tr><td><strong>${esc(s.name)}</strong><br><span class="muted small">${esc(s.detail || '')}</span></td><td class="num">${money(s.unitPrice)}</td><td class="num">${pct(s.foodCostPct)}</td><td class="num">${s.extraVsOldPerMonth >= 0 ? '+' : ''}${money(s.extraVsOldPerMonth)}</td></tr>`).join('')}</tbody>
    </table></div>`;
  }
  return `${body}
    <label>Evidence source (optional) <input type="text" id="wz-evidenceSource" value="${esc(v.evidenceSource)}" placeholder="Where the price information came from — e.g. DairyCo invoice" autocomplete="off">${wizardFieldError('evidenceSource')}</label>`;
}
function renderCreateWizard() {
  if (!wizard) wizard = newWizard();
  setBreadcrumb('<span class="crumb-soft">Cases</span><span class="crumb-sep">/</span>New supplier case');
  const stepper = WIZARD_STEPS.map((s, i) => {
    const n = i + 1;
    const cls = n < wizard.step ? 'done' : (n === wizard.step ? 'current' : '');
    const cur = n === wizard.step ? ' aria-current="step"' : '';
    return `<li class="${cls}"${cur}>${n}. ${esc(s)}</li>`;
  }).join('');
  const isLast = wizard.step === 5;
  $('#view').innerHTML = `
    <h1 class="section-title">New supplier case</h1>
    <p class="section-sub">Guided HAGGLE case — the numbers are checked by the deterministic engine before anything is created. Nothing is saved until you press “Create case”.</p>
    <ol class="stepper" aria-label="Creation steps">${stepper}</ol>
    <section class="panel" aria-labelledby="wz-h">
      <h2 id="wz-h">Step ${wizard.step} of 5 — ${esc(WIZARD_STEPS[wizard.step - 1])}</h2>
      <form class="rating-form" id="wizard-form" novalidate>
        ${wizardStepFields()}
        ${wizard.createError ? `<p class="inline-error" role="alert">${esc(wizard.createError)}</p>` : ''}
        <div style="display:flex;gap:8px;flex-wrap:wrap;width:100%">
          ${wizard.step > 1 ? '<button class="ghost-btn" type="button" id="wz-back">← Back</button>' : ''}
          ${isLast
            ? `<button class="btn" type="submit" id="wz-create" ${wizard.creating || wizard.previewLoading || !wizard.preview ? 'disabled' : ''}>Create case</button>`
            : '<button class="btn" type="submit" id="wz-next">Continue →</button>'}
          <button class="ghost-btn" type="button" id="wz-cancel">Cancel</button>
        </div>
      </form>
    </section>`;
  $('#wz-cancel').addEventListener('click', cancelWizard);
  const back = $('#wz-back');
  if (back) back.addEventListener('click', () => { wizard.errors = {}; wizard.createError = null; wizard.step -= 1; renderCreateWizard(); });
  const fix = $('#wz-fix-step');
  if (fix) fix.addEventListener('click', () => {
    const field = Object.keys(WIZARD_FIELD_STEP).find((f) => new RegExp(`\\b${f}\\b`).test(wizard.previewError || ''));
    if (field) { wizard.previewError = null; wizard.preview = null; wizard.step = WIZARD_FIELD_STEP[field]; renderCreateWizard(); }
  });
  $('#wizard-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    readWizardStep();
    if (wizard.step < 5) {
      wizard.errors = validateWizardStep(wizard.step, wizard.values);
      if (Object.keys(wizard.errors).length) {
        renderCreateWizard();
        const first = Object.keys(wizard.errors)[0];
        const el = $(`#wz-${first}`);
        if (el) el.focus();
        return;
      }
      wizard.errors = {};
      wizard.step += 1;
      renderCreateWizard();
      if (wizard.step === 5) loadWizardPreview();
      return;
    }
    // Step 5: create the case.
    const w = wizard;
    wizard.creating = true; wizard.createError = null; renderCreateWizard();
    try {
      const created = await api('/api/cases', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(wizardPayload(w.values)) });
      if (wizard !== w) return; // user cancelled while the request was in flight
      cases.push(created);
      details[created.id] = created;
      $('#nav-case-count').textContent = String(cases.filter(isActive).length);
      wizard = null;
      openCase(created.id);
    } catch (err) {
      if (wizard !== w) return;
      wizard.creating = false;
      wizard.createError = err.message;
      renderCreateWizard();
    }
  });
}
function readWizardStep() {
  const ids = { 1: ['supplier', 'ingredient', 'recipe'], 2: ['oldPrice', 'newPrice', 'unit', 'qtyPerServing'], 3: ['menuPrice', 'otherIngredientsCostPerServing', 'monthlySales', 'targetFoodCostPct'], 4: ['targetPrice', 'maxApprovedPrice'], 5: ['evidenceSource'] }[wizard.step] || [];
  for (const id of ids) {
    const el = $(`#wz-${id}`);
    if (el) wizard.values[id] = el.value;
  }
}
async function loadWizardPreview() {
  const w = wizard;
  w.previewLoading = true; w.preview = null; w.previewError = null; renderCreateWizard();
  try {
    w.preview = await api('/api/cases/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(wizardPayload(w.values)) });
  } catch (err) {
    w.previewError = err.message;
  } finally {
    if (wizard !== w) return; // user cancelled or left while the preview was loading
    w.previewLoading = false;
    // Keep anything typed into the evidence-source box while loading.
    const ev = $('#wz-evidenceSource');
    if (ev) w.values.evidenceSource = ev.value;
    if (view === 'create') renderCreateWizard();
  }
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
        <select id="move-select">${moveOptions(c.state).map((t) => `<option value="${t}">Move to ${t.replace(/_/g, ' ')}</option>`).join('') || '<option value="">No moves available</option>'}</select>
        <button class="ghost-btn" id="move-btn" ${moveOptions(c.state).length ? '' : 'disabled'}>Move</button>
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
  $$('.tab', $('#view')).forEach((t) => t.addEventListener('click', () => { currentTab = t.dataset.tab; renderCase(); syncCaseHash(); }));
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
    if (next) { e.preventDefault(); currentTab = next; renderCase(); syncCaseHash(); const el = $(`#tab-${next}`); if (el) { el.focus(); el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } }
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
// GAP-2 (2026-11-06): submit a strategy for approval — the ONLY UI
// path into AWAITING_APPROVAL (the Move dropdown cannot send a
// proposal, GAP-1). DISCUSSION -> PROPOSAL -> AWAITING_APPROVAL with
// the canonical proposalId + the exact terms for the selected strategy,
// all from the deterministic engine data — never invented. allowReplace
// (the approval modal's re-route only) steps back from AWAITING first
// when the owner changes strategy at approve time; the Submit button
// refuses when a proposal is already pending (the server 400s a
// duplicate as the backstop). Re-fetches the case detail + list
// afterwards so the UI never shows a stale workflow state after the
// action. Throws a clear error on an unknown strategy, a duplicate, or
// a failed step — the case is left unchanged on a client-side refusal,
// and a server failure mid-sequence leaves it in a retryable state
// (PROPOSAL still offers Submit; the error is shown, not swallowed).
async function submitProposal(c, s, allowReplace = false) {
  const proposalId = proposalIdForStrategy(s.id);
  if (!proposalId) throw new Error(`Unknown strategy ${s.id} — cannot submit a proposal for it.`);
  const terms = termsForStrategy(s);
  const cur = await api(`/api/cases/${c.id}`);
  if (cur.pendingApproval || cur.state === 'AWAITING_APPROVAL') {
    if (!allowReplace) throw new Error('A proposal is already pending for this case — approve or reject it before submitting another.');
    await api(`/api/cases/${c.id}/transition`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to: 'DISCUSSION', actor: 'Mara (owner)', actorKind: 'human' }) });
  }
  const cur2 = await api(`/api/cases/${c.id}`);
  if (cur2.state === 'DISCUSSION') await api(`/api/cases/${c.id}/transition`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to: 'PROPOSAL', actor: 'Mara (owner)', actorKind: 'human' }) });
  await api(`/api/cases/${c.id}/transition`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to: 'AWAITING_APPROVAL', actor: 'Mara (owner)', actorKind: 'human', proposalId, terms: terms.full }) });
  details[c.id] = await api(`/api/cases/${c.id}`);
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
  // H9 (remediation 2026-11-06): once an approval exists, the hero and
  // every figure in this panel show the APPROVED strategy's impact —
  // never the unmitigated supplier shock. The supplier's $0.24 proposal
  // stays visible only as labelled context (Analysis tab). When the
  // approval carries no known strategy, the hero is explicitly labelled
  // as the unmitigated "if accepted" figure instead of silently
  // implying it is the outcome.
  const ap = c.approval ? approvedStrategy(c) : null;
  const heroPerServing = ap ? ap.creamCostPerServing - a.oldCreamCostPerServing : a.costDiffPerServing;
  const heroMonthly = ap ? ap.extraVsOldPerMonth : a.monthlyExtraCost;
  const heroFoodPct = ap ? ap.foodCostPct : a.newFoodCostPct;
  const heroCream = ap ? ap.creamCostPerServing : a.newCreamCostPerServing;
  const heroTotal = ap ? ap.totalCostPerServing : a.newTotalCostPerServing;
  const heroMargin = 100 - heroFoodPct;
  const heroNote = ap
    ? `Approved terms: ${esc(c.approval.terms)} — impact of the approved price, not the supplier's ${money(i.newPrice)} proposal (which would be ${signedMoney(a.monthlyExtraCost)}/mo, ${pct(a.newFoodCostPct)} food cost).`
    : (c.approval
      ? `If the ${money(i.newPrice)} rise were accepted — no priced strategy is recorded for this approval.`
      : `If the ${money(i.newPrice)} rise were accepted.`);
  return `<section class="panel" aria-labelledby="fin-h">
    <h2 id="fin-h">Financial impact — deterministic</h2>
    <div class="hero"><span class="hero-neg">${signedMoney(heroPerServing)}</span> <small>/ serving · ${money(heroMonthly)} / month</small></div>
    <p class="small muted" style="margin:6px 0 0">${heroNote}</p>
    <p class="small muted" style="margin:6px 0 0">Cream ${money(i.oldPrice)} → ${money(i.newPrice)} / ${esc(i.unit)} (${a.pctChange === null ? '—' : '+' + a.pctChange + '%'}) · ${i.qtyPerServing} ${esc(i.unit)} / ${esc(i.recipe)} · menu ${money(i.menuPrice)}</p>
    <div class="bullet-wrap">
      <div class="bullet" role="img" aria-label="Food cost rises from ${pct(a.oldFoodCostPct)} to ${pct(heroFoodPct)}; target is ${i.targetFoodCostPct} percent">
        <span class="bullet-bar" style="width:${(heroFoodPct / 40 * 100).toFixed(1)}%"></span>
        <span class="bullet-target" style="left:${(i.targetFoodCostPct / 40 * 100).toFixed(1)}%" title="Target ${i.targetFoodCostPct}%"></span>
        <span class="bullet-old" style="left:${(a.oldFoodCostPct / 40 * 100).toFixed(1)}%" title="Before ${pct(a.oldFoodCostPct)}"></span>
      </div>
      <div class="bullet-scale" aria-hidden="true"><span>0%</span><span>20%</span><span>40%</span></div>
      <p class="small bullet-legend" aria-hidden="true"><span><span class="legend-old">—</span> Before ${pct(a.oldFoodCostPct)}</span><span><span class="legend-target">|</span> Target ${i.targetFoodCostPct}%</span></p>
    </div>
    <p class="small">Food cost ${pct(a.oldFoodCostPct)} → <strong>${pct(heroFoodPct)}</strong> · target ${i.targetFoodCostPct}% · ${money(heroMonthly * 12)}/yr</p>
    <h3>Financials</h3>
    <dl class="kv">
      <dt>Cream / serving</dt><dd>${money(a.oldCreamCostPerServing)} → ${money(heroCream)}</dd>
      <dt>Food cost / serving</dt><dd>${money(a.oldTotalCostPerServing)} → ${money(heroTotal)}</dd>
      <dt>Gross margin</dt><dd>${pct(a.oldGrossMarginPct)} → ${pct(heroMargin)}</dd>
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
  const canonicalRow = c.canonicalVersion
    ? `<dt>Canonical version</dt><dd>${esc((c.versions.find((v) => v.id === c.canonicalVersion) || {}).author || c.canonicalVersion)} — adopted by ${esc(c.canonicalAdoption?.adoptedBy || '')}</dd>`
    : '';
  return `<section class="panel" aria-labelledby="court-sum-h">
    <h2 id="court-sum-h">Recipe court — summary</h2>
    <p class="small" style="margin-bottom:10px">Facilitator view — you can see all versions; tasters see codes only.</p>
    <dl class="kv">
      <dt>Versions</dt><dd>${c.versions.length}</dd>
      <dt>Conflicting variables</dt><dd>${conflicts} of ${c.conflicts.length}</dd>
      <dt>Blind readers</dt><dd>${cs.readers.length}</dd>
      ${leaderRow}
      ${canonicalRow}
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
      // Average only the scores actually submitted for this sample:
      // a partially-rated sample has no entry for readers who have not
      // rated yet, and they must not drag the mean toward 0 or NaN
      // (P0 C2, QA 2026-11-06).
      const vals = Object.values(readers).map((r) => r[crit]).filter((v) => typeof v === 'number');
      means[crit] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
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
      <p>The Verification Agent extracted ${claims.length} factual claims from the episode transcript. The guest corrects factual claims with evidence in the Switch room; the host approves the errata before publication.</p></section>`);
  }
  // Participants live in the right rail (railPanels) — the overview tab
  // used to render them a second time (QA 2026-11-06).
  return parts.join('');
}
function analysisTab(c) {
  if (c.workflow === 'HAGGLE') {
    const a = c.analysis, i = c.input;
    // H9: the table below is the supplier proposal's unmitigated shock;
    // when an approval exists, say so up front with the approved figures
    // so this panel cannot be read as the current outcome.
    const ap = c.approval ? approvedStrategy(c) : null;
    const approvedBanner = ap
      ? `<p class="small" style="margin-bottom:10px"><strong>Approved impact: ${signedMoney(ap.extraVsOldPerMonth)} / month · food cost ${pct(ap.foodCostPct)}</strong> (${esc(c.approval.terms)}). The table below is the supplier's ${money(i.newPrice)} proposal if it had been accepted in full.</p>`
      : '';
    return `<section class="panel" aria-labelledby="an-h"><h2 id="an-h">Analysis — deterministic, no LLM maths</h2>
      ${approvedBanner}
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
  if (c.workflow === 'COURT') return courtMatrix(c) + courtHeat(c) + courtVersionForm(c);
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
// Leading sample by blind overall mean, or null while the tally is hidden.
function courtLeader(c) {
  const ts = courtTallyState(c);
  if (!ts.complete) return null;
  const cs = courtScoresFor(c);
  const means = courtMeans(c);
  const [code, m] = Object.entries(means).sort((a, b) => b[1].overall - a[1].overall)[0];
  return { code, author: cs.samples[code], overall: m.overall, means };
}
// The tally block, shared by the Analysis heat table and the Negotiation
// vote/adoption section (M13: one source, no duplicated content).
// Names the leader and every losing version with its mean, records
// dissent, and — once adopted — names the canonical version (H12, L3).
function courtTallyBlock(c) {
  const cs = courtScoresFor(c);
  const ts = courtTallyState(c);
  if (!ts.complete) {
    return `<h3>Canonical recipe — tally</h3>
    <p class="small"><strong>Tally hidden — ${ts.submitted} of ${ts.expected} ratings submitted.</strong> The version mapping and the leader stay hidden until every reader has rated every sample; the tally appears here then.</p>`;
  }
  const leader = courtLeader(c);
  const meansLine = Object.entries(leader.means).map(([code, m]) => `${esc(cs.samples[code])} ${m.overall.toFixed(2)}`).join(' · ');
  const losing = Object.entries(leader.means)
    .filter(([code]) => code !== leader.code)
    .map(([code, m]) => `${esc(cs.samples[code])} ${m.overall.toFixed(2)}`).join(' · ');
  const canonical = c.canonicalVersion
    ? `<p class="small" style="margin-top:6px"><strong>Canonical version: ${esc((c.versions.find((v) => v.id === c.canonicalVersion) || {}).author || c.canonicalVersion)}</strong> — adopted by ${esc(c.canonicalAdoption?.adoptedBy || '')}, ${fmtDateTime(c.canonicalAdoption?.adoptedAt)}. The other versions stay on the record as footnotes to the canonical recipe — never deleted.</p>`
    : '';
  return `<h3>Canonical recipe — tally</h3>
    <p class="small">Leading by blind mean (overall): <strong>${esc(leader.author)} — ${leader.overall.toFixed(2)} / 5</strong>.
    ${meansLine}.</p>
    <p class="small muted" style="margin-top:6px">Dissent preserved: ${losing} — the other versions stay on the record as footnotes to the canonical recipe — never deleted.</p>${canonical}`;
}
function courtMatrix(c) {
  return `<section class="panel" aria-labelledby="mx-h"><h2 id="mx-h">Comparison matrix — versions of one dish</h2>
    <div class="table-wrap"><table>
      <caption>Differing cells are marked Δ; agreeing cells are plain. ${c.conflicts.filter((x) => x.conflict).length} of ${c.conflicts.length} variables conflict.</caption>
      <thead><tr><th scope="col">Variable</th>${c.versions.map((v) => `<th scope="col">${esc(v.author)}</th>`).join('')}<th scope="col">Δ</th></tr></thead>
      <tbody>${c.conflicts.map((cf) => {
        // L6: the Δ column used to repeat the full "a pinch vs 1 tbsp
        // vs none" list — duplicating what the Δ-marked cells already
        // show and cramping the column at 390px. Now it is just Δ / —.
        const delta = cf.conflict ? 'Δ' : '—';
        return `<tr><td><strong>${esc(cf.variable)}</strong></td>${cf.values.map((v) => `<td class="${cf.conflict ? 'conflict-cell' : ''}">${esc(v.value)}${cf.conflict ? ' <span class="delta-tag">Δ</span>' : ''}</td>`).join('')}<td class="muted small delta-col">${esc(delta)}</td></tr>`;
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
  // rating, so the case can start from zero. A sample with SOME ratings
  // (partial: some readers rated, others not) also renders: a missing
  // reader score is '—', and range/mean use only the scores present
  // (P0 C2, QA 2026-11-06 — the old code indexed
  // cs.scores[sample][r][crit] unconditionally and threw).
  const hasScores = Boolean(cs.scores[sample] && Object.keys(cs.scores[sample]).length);
  const means = hasScores ? courtMeans(c)[sample] : null;
  const rows = hasScores ? cs.criteria.map((crit) => {
    const vals = cs.readers.map((r) => cs.scores[sample]?.[r]?.[crit]);
    const present = vals.filter((v) => typeof v === 'number');
    const range = present.length ? Math.max(...present) - Math.min(...present) : 0;
    const heat = (v) => typeof v !== 'number' ? '' : v >= 4.5 ? 'heat-5' : v >= 4 ? 'heat-4' : v >= 3.5 ? 'heat-3' : v >= 3 ? 'heat-2' : 'heat-1';
    return `<tr class="${range >= 2 ? 'disagree' : ''}"><th scope="row">${esc(crit)}${range >= 2 ? ' <span class="disagree-tag">DISAGREE</span>' : ''}</th>
      ${vals.map((v) => `<td class="num ${heat(v)}">${typeof v === 'number' ? v : '—'}</td>`).join('')}
      <td class="num">${ts.complete && means && typeof means[crit] === 'number' ? means[crit].toFixed(2) : '—'}</td><td class="num">${range}</td></tr>`;
  }).join('') : `<tr><td colspan="${cs.readers.length + 3}">No ratings submitted yet for this sample — be the first to rate it below.</td></tr>`;
  // The tally block is inlined here (rather than calling courtTallyBlock)
  // because tests/p0-fixes.test.js extracts courtHeat standalone with
  // only esc/courtScoresFor/courtTallyState/courtMeans in scope. The
  // Negotiation tab uses the shared courtTallyBlock below; keep the two
  // renderings identical in wording.
  const leader = Object.entries(courtMeans(c)).sort((a, b) => b[1].overall - a[1].overall)[0];
  // The sample→version mapping is blind information: show codes only
  // until the tally is complete (QA 2026-11-06).
  const sampleLabel = (code) => ts.complete ? `${code} — ${esc(cs.samples[code])}` : code;
  const tallyBlock = ts.complete
    ? `<h3>Canonical recipe — tally</h3>
    <p class="small">Leading by blind mean (overall): <strong>${esc(cs.samples[leader[0]])} — ${leader[1].overall.toFixed(2)} / 5</strong>.
    ${Object.entries(courtMeans(c)).map(([code, m]) => `${esc(cs.samples[code])} ${m.overall.toFixed(2)}`).join(' · ')}.</p>
    <p class="small muted" style="margin-top:6px">Dissent preserved: ${Object.entries(courtMeans(c)).filter(([code]) => code !== leader[0]).map(([code, m]) => `${esc(cs.samples[code])} ${m.overall.toFixed(2)}`).join(' · ')} — the other versions stay on the record as footnotes to the canonical recipe — never deleted.</p>${c.canonicalVersion ? `<p class="small" style="margin-top:6px"><strong>Canonical version: ${esc((c.versions.find((v) => v.id === c.canonicalVersion) || {}).author || c.canonicalVersion)}</strong> — adopted by ${esc(c.canonicalAdoption?.adoptedBy || '')}. The other versions stay on the record as footnotes to the canonical recipe — never deleted.</p>` : ''}`
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
      <p class="inline-error" id="rating-error" role="alert" hidden></p>
      <button class="btn btn-sm" type="submit">Submit rating</button>
    </form>
    <p class="small muted" id="rating-note">Ratings are server-held and cannot be changed once submitted — a duplicate is rejected (409). Samples are codes only, so the rating stays blind.</p>
  </section>`;
}
// H11 — version submission. A version may be added only while the case
// has zero ratings; once ratings have begun the form explains why it
// is closed (adding a sample mid-test would change the tally's
// expected count). The server enforces the same rule.
function courtVersionForm(c) {
  const ts = courtTallyState(c);
  if (ts.submitted > 0) {
    return `<section class="panel" aria-labelledby="ver-h"><h2 id="ver-h">Submit a version</h2>
      <p class="small">Versions cannot be added once ratings have begun — ${ts.submitted} of ${ts.expected} ratings are already in. Adding a sample mid-test would change the tally's expected count, so new versions must be submitted before the first rating.</p>
    </section>`;
  }
  return `<section class="panel" aria-labelledby="ver-h"><h2 id="ver-h">Submit a version</h2>
    <p class="small muted" style="margin-bottom:10px">Add your version of the dish before any ratings are submitted. It becomes the next coded sample (${'S' + (c.samples.length + 1)}) — the mapping stays blind until the tally is complete, and every version stays on the record.</p>
    <form class="rating-form" id="version-form">
      <label>Author <input type="text" id="version-author" required placeholder="e.g. Zia" autocomplete="off"></label>
      <label style="flex:1 1 100%">Ingredients — one per line, “name: amount” <textarea id="version-ingredients" rows="3" required placeholder="salt: a pinch&#10;fat: lard&#10;simmer: 3 hours"></textarea></label>
      <label style="flex:1 1 100%">Steps — one per line (optional) <textarea id="version-steps" rows="3" placeholder="Brown the meat&#10;Simmer 3 hours"></textarea></label>
      <button class="btn btn-sm" type="submit">Submit version</button>
    </form>
    <p class="small muted" id="version-note"></p>
  </section>`;
}
function claimsTable(c, claims, interactive) {
  return `<section class="panel" aria-labelledby="cl-h"><h2 id="cl-h">Claims from the transcript</h2>
    <p class="small muted" style="margin-bottom:10px">Claim statuses are persisted by the server and recorded in the audit trail. Only a human (host/guest) may change a status — the Verification Agent proposes.</p>
    <div class="table-wrap"><table class="claims-table">
      <caption>${claims.length} factual claims extracted by rule, not by LLM.</caption>
      <thead><tr><th scope="col">Claim</th><th scope="col">Kind</th><th scope="col">Status</th><th scope="col">Evidence</th>${interactive ? '<th scope="col">Actions</th>' : ''}</tr></thead>
      <tbody>${claims.map((cl) => {
        // L5: evidence references come from the server (detail endpoint),
        // matched against the case's evidence notes — no client map.
        const ev = (cl.evidence || []).map((e) => `<span class="tag-ev">[${e}]</span>`).join(' ') || '—';
        const statusCls = { Verified: 'pill-teal', Corrected: 'pill-teal', Clarified: 'pill-grey', Disputed: 'pill-amber', Unresolved: 'pill-grey' }[cl.status] || 'pill-grey';
        let row = `<tr data-claim="${esc(cl.id)}"><td><span class="num">${esc(cl.id)}</span> ${esc(cl.text)}${cl.challenge ? `<div class="challenge-note">Guest challenge (${esc(cl.challenge.by)}): “${esc(cl.challenge.text)}”${cl.challenge.evidence ? ` · cites <span class="tag-ev">[${esc(cl.challenge.evidence)}]</span>` : ''}</div>` : ''}</td>
          <td>${esc(cl.kind)}</td><td><span class="pill ${statusCls}">${esc(cl.status)}</span></td><td>${ev}</td>`;
        if (interactive) {
          row += `<td>
            ${cl.status === 'Unresolved' ? `<button class="ghost-btn btn-sm" data-verify="${esc(cl.id)}">Host: mark verified</button> ` : ''}
            ${cl.status !== 'Clarified' ? `<button class="ghost-btn btn-sm" data-clarify="${esc(cl.id)}">Host: mark clarified</button> ` : ''}
            ${cl.status !== 'Corrected' ? `<button class="ghost-btn btn-sm" data-challenge="${esc(cl.id)}">Guest: challenge</button> ` : ''}
            ${cl.status === 'Disputed' ? `<button class="btn btn-sm" data-approve-claim="${esc(cl.id)}">Host: approve correction</button>` : ''}
          </td>`;
        }
        return row + '</tr>';
      }).join('')}</tbody></table></div>
  </section>`;
}
function negotiationTab(c) {
  if (c.workflow === 'HAGGLE') return haggleNegotiation(c);
  // M13: Negotiation holds the vote/adoption content only — the matrix,
  // heat table and rating form live in Analysis and are not duplicated here.
  if (c.workflow === 'COURT') {
    const ts = courtTallyState(c);
    const leader = courtLeader(c);
    let decision;
    if (c.canonicalVersion) {
      const author = (c.versions.find((v) => v.id === c.canonicalVersion) || {}).author || c.canonicalVersion;
      decision = `<div class="approve-stamp"><span class="stamp-word">Canonical ✓</span><br>
        “${esc(author)} is the canonical version.” — <b>${esc(c.canonicalAdoption?.adoptedBy || '')}</b>, ${fmtDateTime(c.canonicalAdoption?.adoptedAt)}</div>
        <p class="small muted" style="margin-top:8px">The losing versions stay on the record as footnotes — never deleted.</p>`;
    } else if (ts.complete && leader) {
      decision = `<p class="small">The tally is complete. Adopting records the decision in the audit trail, like a HAGGLE approval — the losing versions stay on the record as footnotes.</p>
        <p><button class="btn" id="adopt-btn">Adopt as canonical — ${esc(leader.author)} (${leader.overall.toFixed(2)} / 5)</button></p>
        <p class="small muted">Human-only: only a human may adopt a version.</p>`;
    } else {
      decision = `<p class="empty">Adoption unlocks when the tally is complete — ${ts.submitted} of ${ts.expected} ratings in. Rate the remaining samples in the Analysis tab.</p>`;
    }
    return `<section class="panel" aria-labelledby="vote-h"><h2 id="vote-h">Family vote — adopt the canonical version</h2>
      ${courtTallyBlock(c)}
      <div style="margin-top:10px">${decision}</div>
      <p class="small muted" id="adopt-note"></p>
    </section>
    <section class="panel"><h2>Family vote</h2><p>The family votes in the Switch room ${esc(c.switchRoom)} — the tally above is the blind result; the vote is the decision. <button class="ghost-btn btn-sm" data-room-btn>Open room transcript</button></p></section>`;
  }
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
    selectedStrategy = (c.approval && PROPOSAL_TO_STRATEGY[c.approval.proposalId])
      || (c.pendingApproval && PROPOSAL_TO_STRATEGY[c.pendingApproval.proposalId]) || 'counter-019';
  }
  const sel = (c.strategies || []).find((s) => s.id === selectedStrategy) || c.strategies[0];
  const timeline = [
    { price: money(i.oldPrice), label: `Old price — baseline`, who: 'DairyCo rate card' },
    { price: money(i.newPrice), label: `Supplier proposal (${signedPct(a.pctChange)}%)`, who: 'DairyCo rep' },
    { price: '$0.19', label: 'Counter-offer — 6 weeks, in writing', who: 'DairyCo rep · P2' },
    // M17: before approval there is no Approved step — the row is the
    // decision still to come, not a completed one. After approval it
    // names the approved terms and their price (from engine data).
    { price: c.approval ? money((approvedStrategy(c) || { unitPrice: 0.19 }).unitPrice) : '?', label: c.approval ? `Approved — ${esc(c.approval.terms)}` : 'Approval — pending owner decision', who: c.approval ? c.approval.approvedBy : 'Owner' },
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
  const terms = termsForStrategy(s);
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
    // M18: a visible next step after approval — completion needs no
    // further approval (unchanged behaviour), it just records the
    // agreement as complete. Only offered while APPROVED, not once
    // the case is already COMPLETED.
    const completeBtn = c.state === 'APPROVED'
      ? `<button class="btn" id="complete-btn" style="margin-top:10px">Mark completed — record agreement</button>
      <p class="small muted">Completion needs no further approval; this records the agreed terms as complete.</p>` : '';
    return `<div class="approve-stamp"><span class="stamp-word">Approved ✓</span><br>
      “I approve ${esc(c.approval.terms)}.” — <b>${esc(c.approval.approvedBy)}</b>, ${fmtDateTime(c.approval.approvedAt)}</div>${completeBtn}`;
  }
  // M19: Approve/Reject exist ONLY while a pending approval exists.
  // In DISCUSSION/PROPOSAL (or any other state with nothing pending)
  // the buttons used to silently re-route the case through the state
  // machine with hardcoded terms — now the empty state points at the
  // next step instead.
  if (c.pendingApproval) {
    return `<button class="btn" id="approve-btn">Approve ${esc(terms.short)}</button>
      <button class="ghost-btn" id="reject-btn">Reject pending terms</button>
      <p class="small muted">Two-step: approve opens a confirmation restating the exact terms and their financial impact; reject asks for confirmation too. Only a human (Mara, owner) may approve.</p>`;
  }
  // GAP-2 (2026-11-06): the Submit for approval action — the only UI
  // path that creates a pending proposal. Shown while the case is
  // DISCUSSION or PROPOSAL with nothing pending and nothing approved.
  // The exact terms for the selected strategy are shown above the
  // button so the owner reviews them before submitting; the button
  // label is exactly "Submit for approval" and the click is explicit
  // (no auto-submit). A second submission while one is pending is
  // impossible here (Approve/Reject render instead) and the server
  // 400s a duplicate as the backstop.
  if (c.state === 'DISCUSSION' || c.state === 'PROPOSAL') {
    return `<p class="small">Proposed terms for <strong>${esc(s.name)}</strong>: ${esc(terms.full)}</p>
      <button class="btn" id="submit-btn">Submit for approval</button>
      <p class="small muted">Submitting creates a pending proposal for these exact terms. Only a human (Mara, owner) may approve or reject it.</p>
      <p class="inline-error" id="submit-error" role="alert" hidden></p>`;
  }
  const guidance = (c.state === 'REJECTED' || c.state === 'BLOCKED')
    ? 'Move the case back to DISCUSSION to submit a proposal.'
    : 'This case cannot accept a new proposal.';
  return `<p class="empty">No pending approval — case is ${esc(c.state)}. ${guidance}</p>`;
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
    ${c.rejectedTerms ? `<div class="decision-sentence">“Rejected: ${esc(c.rejectedTerms.terms)}.” — ${esc(c.rejectedTerms.rejectedBy)}, ${fmtDateTime(c.rejectedTerms.rejectedAt)} · case <span class="num">${esc(c.id)}</span></div>` : ''}
    ${events.length ? `<ol class="audit-list">${events.map((e) => `<li><span class="au-time">${fmtDateTime(e.at)}</span><strong>${esc(e.actor)}</strong> (${esc(e.kind)}) — ${esc(e.event)}${e.rejectedTerms ? ` — rejected terms: ${esc(e.rejectedTerms)}` : ''}</li>`).join('')}</ol>` : '<p class="empty">No audit events yet in this session. State changes, proposals and room messages are logged here.</p>'}
  </section>`;
}
function railPanels(c) {
  const participants = `<section class="panel" aria-labelledby="part-h"><h2 id="part-h">Participants</h2>
    <p class="small">${(c.participants || []).map((p) => `${esc(p.name)} — ${esc(p.role)}${p.kind === 'agent' ? ' · <span style="color:var(--teal-dark);font-weight:600">AGENT</span>' : ''}`).join('<br>')}</p></section>`;
  const approvals = `<section class="panel" aria-labelledby="appr-h"><h2 id="appr-h">Approvals</h2>
    ${c.pendingApproval ? `<p class="small">Pending: <strong>${esc(c.pendingApproval.terms)}</strong><br><span class="muted">requested by ${esc(c.pendingApproval.requestedBy)}</span></p>` : ''}
    ${c.approval ? `<div class="approve-stamp" style="margin-top:8px"><span class="stamp-word">Approved ✓</span><br>“I approve ${esc(c.approval.terms)}.” — <b>${esc(c.approval.approvedBy)}</b></div>` : ''}
    ${c.rejectedTerms ? `<p class="small" style="margin-top:8px">Rejected: <strong>${esc(c.rejectedTerms.terms)}</strong><br><span class="muted">rejected by ${esc(c.rejectedTerms.rejectedBy)}, ${fmtDateTime(c.rejectedTerms.rejectedAt)}</span></p>` : ''}
    ${!c.pendingApproval && !c.approval && !c.rejectedTerms ? '<p class="empty">No pending approval on this case.</p>' : ''}
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
  // L8: inline validation — an out-of-range or non-integer score names
  // its dimension as you type, instead of failing only after submit.
  // The server-side 400 stays the backstop.
  if (rf) {
    const showRatingError = (msg) => {
      const el = $('#rating-error');
      if (el) { el.textContent = msg || ''; el.hidden = !msg; }
    };
    $$('#rating-form input[data-crit]').forEach((inp) => inp.addEventListener('input', () => {
      const v = inp.value === '' ? undefined : Number(inp.value);
      const err = (inp.value !== '' && (!Number.isInteger(v) || v < 1 || v > 5))
        ? `${inp.dataset.crit} must be a whole number from 1 to 5.` : null;
      inp.setAttribute('aria-invalid', err ? 'true' : 'false');
      showRatingError(err);
    }));
  }
  if (rf) rf.addEventListener('submit', async (e) => {
    e.preventDefault();
    const note = $('#rating-note');
    const scores = {};
    $$('#rating-form input[data-crit]').forEach((inp) => { scores[inp.dataset.crit] = inp.value === '' ? undefined : Number(inp.value); });
    const inlineErr = validateRatingScores(scores);
    if (inlineErr) {
      const el = $('#rating-error');
      if (el) { el.textContent = inlineErr; el.hidden = false; }
      const bad = $$('#rating-form input[data-crit]').find((inp) => { const v = scores[inp.dataset.crit]; return !Number.isInteger(v) || v < 1 || v > 5; });
      if (bad) bad.focus();
      return;
    }
    try {
      const res = await api('/api/court/rate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ caseId: c.id, reader: $('#rating-reader').value, sampleCode: $('#rating-sample').value, scores }) });
      // The confirmation must be set AFTER the re-render: renderCase()
      // rebuilds the view (including #rating-note), so a note set before
      // it is wiped within milliseconds and the user never sees it.
      const msg = res.tally ? 'Rating saved — the tally is complete and is shown above.' : `Rating saved — ${res.submitted} of ${res.expected} ratings in. The tally stays hidden until all are submitted.`;
      await reloadCase(c); renderCase();
      const fresh = $('#rating-note');
      if (fresh) fresh.textContent = msg;
    } catch (err) { note.textContent = `Could not save the rating: ${err.message}`; }
  });
  // H11 — version submission (Analysis tab).
  const vf = $('#version-form');
  if (vf) vf.addEventListener('submit', async (e) => {
    e.preventDefault();
    const note = $('#version-note');
    const author = $('#version-author').value.trim();
    const ingredients = parseVersionIngredients($('#version-ingredients').value);
    const steps = $('#version-steps').value.split(/\n/).map((s) => s.trim()).filter(Boolean);
    if (!author) { note.textContent = 'Author must not be empty.'; return; }
    if (!Object.keys(ingredients).length) { note.textContent = 'Ingredients must list at least one “name: amount” line.'; return; }
    try {
      const res = await api('/api/court/version', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ caseId: c.id, author, ingredients, steps: steps.length ? steps : undefined, actor: 'Mara (owner)', actorKind: 'human' }) });
      const msg = `Version submitted — ${author} is now coded sample ${res.sampleCode}. The mapping stays blind until the tally is complete.`;
      await reloadCase(c); renderCase();
      const fresh = $('#version-note');
      if (fresh) fresh.textContent = msg;
    } catch (err) { note.textContent = `Could not submit the version: ${err.message}`; }
  });
  // H12 — adopt as canonical (Negotiation tab, tally-complete only).
  const adoptBtn = $('#adopt-btn');
  if (adoptBtn) adoptBtn.addEventListener('click', async () => {
    try {
      await api('/api/court/adopt', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ caseId: c.id, actor: 'Mara (owner)', actorKind: 'human' }) });
      await reloadCase(c); renderCase();
      const fresh = $('#adopt-note');
      if (fresh) fresh.textContent = 'Canonical version adopted — recorded in the audit trail. The losing versions stay on the record as footnotes.';
    } catch (err) {
      const el = $('#adopt-note');
      if (el) el.textContent = `Could not adopt: ${err.message}`;
    }
  });
  const ab = $('#approve-btn');
  if (ab) ab.addEventListener('click', () => openApproveModal(c));
  const rb = $('#reject-btn');
  // H10: reject is two-step like approve — a confirmation restating the
  // terms being rejected, never a one-click state change.
  if (rb) rb.addEventListener('click', () => openRejectModal(c));
  // GAP-2: Submit for approval — the only UI path that creates a
  // pending proposal. Disabled immediately on click so a double-click
  // cannot fire twice (the server 400s a duplicate as the backstop);
  // a failure shows the error and re-enables it, leaving the case
  // unchanged. On success submitProposal re-fetches + re-renders and
  // the Approve/Reject buttons replace this one.
  const sb = $('#submit-btn');
  if (sb) sb.addEventListener('click', async () => {
    sb.disabled = true;
    const err = $('#submit-error');
    try {
      const sel = (c.strategies || []).find((x) => x.id === selectedStrategy) || c.strategies[0];
      await submitProposal(c, sel);
    } catch (e) {
      if (err) { err.textContent = e.message; err.hidden = false; }
      sb.disabled = false;
    }
  });
  const cb = $('#complete-btn');
  // M18: completion needs no human gate (unchanged behaviour) — this
  // is the visible "Mark completed" action after approval.
  if (cb) cb.addEventListener('click', async () => {
    try { await transition(c.id, 'COMPLETED'); } catch (e) { showCaseError(e.message); }
  });
  $$('[data-room-btn]', $('#view')).forEach((b) => b.addEventListener('click', () => openRoom(c.id)));
  $$('[data-verify]', $('#view')).forEach((b) => b.addEventListener('click', async () => {
    try {
      await api('/api/correction/claim', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ caseId: c.id, id: b.dataset.verify, status: 'Verified', actor: 'Host', actorKind: 'human' }) });
      await reloadCase(c); renderCase();
    } catch (e) { showCaseError(e.message); }
  }));
  $$('[data-clarify]', $('#view')).forEach((b) => b.addEventListener('click', async () => {
    try {
      await api('/api/correction/claim', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ caseId: c.id, id: b.dataset.clarify, status: 'Clarified', actor: 'Host', actorKind: 'human' }) });
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
  // L7: the form opens in a row directly below the challenged claim,
  // not below the whole table (below the fold on long tables).
  $$('.challenge-row', $('#view')).forEach((r) => r.remove());
  const row = $(`tr[data-claim="${claimId}"]`, $('#view'));
  const claim = (c.claims || []).find((cl) => cl.id === claimId);
  // M15: each evidence option names what the evidence says, not just its code.
  const evOptions = (c.evidence || []).map((e) => `<option value="${esc(e.id)}">[${esc(e.id)}] ${esc(e.type)}${e.note ? ` — ${esc(e.note)}` : ''}</option>`).join('');
  const formHtml = `<form class="challenge-form" id="challenge-form">
    <label class="visually-hidden" for="challenge-text">Correction for ${esc(claimId)}</label>
    <input id="challenge-text" placeholder="Correction for ${esc(claimId)} — e.g. “Survey was co-led with Dr Chen”" required>
    <select id="challenge-ev" aria-label="Evidence to cite">${evOptions}<option value="">No evidence</option></select>
    <button class="btn btn-sm" type="submit">Submit challenge as guest</button>
    <button class="ghost-btn btn-sm" type="button" id="challenge-cancel">Cancel</button>
  </form><p class="small muted">The guest challenges with evidence; the Verification Agent evaluates; the host approves. The original transcript is preserved.</p>`;
  if (row) {
    row.insertAdjacentHTML('afterend', `<tr class="challenge-row"><td colspan="5">${formHtml}</td></tr>`);
  } else {
    // Fallback: no matching row (e.g. Analysis tab) — render below the table.
    const slot = $('#challenge-slot');
    if (slot) slot.innerHTML = formHtml; else return;
  }
  $('#challenge-cancel').addEventListener('click', () => { $$('.challenge-row', $('#view')).forEach((r) => r.remove()); const s = $('#challenge-slot'); if (s) s.innerHTML = ''; });
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
  const terms = termsForStrategy(s);
  $('#modal-title').textContent = 'Confirm approval';
  $('#modal-terms').textContent = `I approve ${terms.full}. — Mara (owner), case ${c.id}`;
  // H7: the financial consequences and the recommendation, from the
  // already-computed strategy data — the owner signs with them in view.
  $('#modal-impact').textContent = `Impact: ${strategyImpactLine(c, s)}`;
  $('#modal-recommendation').textContent = `Recommendation: ${s.recommendation || '—'}`;
  $('#modal-confirm').textContent = 'Approve these terms';
  $('#modal-note').textContent = 'This records a human approval in the audit trail. Agents propose; only a human may approve.';
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
        // recorded approval carries exactly these terms (GAP-2: shared
        // submitProposal helper with the canonical P-number proposalId).
        await submitProposal(c, s, true);
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
// H10 (remediation 2026-11-06): reject mirrors the approve pattern —
// a two-step confirmation restating the terms being rejected, in the
// same dialog. The rejected terms are recorded by the engine
// (rejectedTerms) and surfaced in the Approvals panel + audit (M20).
function openRejectModal(c) {
  rememberFocus();
  const s = (c.strategies || []).find((x) => x.id === selectedStrategy) || c.strategies[0];
  const terms = c.pendingApproval?.terms
    || (STRATEGY_TERMS[s.id]?.full) || 'pending terms';
  $('#modal-title').textContent = 'Confirm rejection';
  $('#modal-terms').textContent = `I reject ${terms}. — Mara (owner), case ${c.id}`;
  $('#modal-impact').textContent = `Impact if rejected: ${strategyImpactLine(c, s)} — the supplier's ${money(c.input.newPrice)} proposal stays unresolved; the case moves to REJECTED and the rejected terms are recorded in the audit trail.`;
  $('#modal-recommendation').textContent = `Recommendation: ${s.recommendation || '—'}`;
  $('#modal-confirm').textContent = 'Reject these terms';
  $('#modal-note').textContent = 'This records a human rejection in the audit trail. The rejected terms stay on the record.';
  $('#modal-error').hidden = true;
  $('#modal-backdrop').hidden = false;
  $('#modal-confirm').focus();
  $('#modal-confirm').onclick = async () => {
    const btn = $('#modal-confirm');
    btn.disabled = true;
    try {
      await transition(c.id, 'REJECTED');
      closeModal();
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
// M21 (2026-11-06): the drawer shows the room's message timeline —
// live Switch messages in real mode (GET /api/switch/messages), the
// app-stored transcript in stub mode. The mandate box that used to sit
// here duplicated the rail; it is gone. The empty state renders only
// when the room truly has no messages.
async function renderRoom() {
  const caseId = roomCaseId;
  const c = details[caseId]; if (!c) return;
  $('#drawer-title').textContent = `Room ${c.switchRoom}`;
  $('#drawer-sub').textContent = `${c.id} — ${c.title} · ${(c.participants || []).map((p) => p.name).join(', ')}`;
  let msgs = c.messages || [];
  let notice = '';
  try {
    const r = await api(`/api/switch/messages?caseId=${encodeURIComponent(c.id)}`);
    if (roomCaseId !== caseId) return; // drawer moved on while loading
    msgs = r.messages || [];
    if (r.error) notice = `<p class="inline-error">${esc(r.error)} Showing stored messages.</p>`;
  } catch (e) {
    if (roomCaseId !== caseId) return;
    notice = `<p class="inline-error">Could not load the room timeline (${esc(e.message)}). Showing stored messages.</p>`;
  }
  $('#room-log').innerHTML = notice + (msgs.length
    ? msgs.map((msg) => `<div class="room-msg"><div class="rm-head"><b>${esc(msg.author)}</b> · ${msg.at ? fmtTime(msg.at) : '—'} ${/agent/i.test(msg.author) ? '<span class="agent-tag">AGENT</span>' : ''}${msg.localOnly ? ' <span class="muted small">(stored locally — not in the live room)</span>' : ''}</div>${esc(msg.text)}</div>`).join('')
    : '<p class="empty">No messages yet in this room. Post below — ' + (statusData?.switchMode === 'REAL-SWITCH' ? 'it goes to the live Switch room (real Mattermost channel) and is logged in the audit trail.' : statusData?.switchMode === 'SWITCH-UNREACHABLE' ? 'the Switch server is currently unreachable, so the message will not be delivered. Check the server and retry.' : 'it goes to the SIMULATED stub transcript and is logged in the audit trail.') + '</p>');
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
    // GAP-2 staleness: the post adds a message + audit event to the
    // case, so re-render the case view behind the drawer — otherwise
    // the audit tab still shows the pre-post state when the drawer
    // closes, until the next tab switch or reload. The drawer itself
    // is outside #view, so this render does not disturb it or its focus.
    render();
    renderRoom();
  } catch (err) { $('#room-log').insertAdjacentHTML('beforeend', `<p class="inline-error">${esc(err.message)}</p>`); }
});

// ---------- nav / search / boot ----------
$$('.nav-item').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
$('#switch-recheck').addEventListener('click', recheckSwitch);
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
    // Hash route first; the legacy ?case=…&tab=… URL still works and is
    // rewritten to its hash form.
    const params = new URLSearchParams(location.search);
    const deep = params.get('case');
    if (deep) {
      // NEW-1: openCase resolves on demand — a ?case= link to a case
      // created after boot no longer falls through to the dashboard.
      const tab = params.get('tab');
      openCase(deep, CASE_TABS.includes(tab) ? tab : 'overview');
    } else if (!(await applyRoute(parseHash()))) {
      render();
    }
  } catch (e) {
    $('#view').innerHTML = `<section class="panel"><h2>Could not load CONVERGE</h2><p>${esc(e.message)}</p><p class="small muted">Is the server running? <span class="num">npm start</span> (port 3000).</p></section>`;
  }
})();
