// CONVERGE whole-app visual polish regression tests (2026-11-06).
//
// The HAGGLE polish round left COURT and CORRECTION without guidance
// and the mobile stepper colliding. This file pins the follow-up:
//   - courtNextStep / correctionNextStep orient the user (same teal
//     Next step treatment as HAGGLE), and the header's primary action
//     now covers every workflow;
//   - the COURT summary labels are short enough not to wrap, and the
//     versions list no longer stutters ("card Nonna (card)");
//   - the dashboard draws the eye to what awaits a human decision;
//   - the stepper scrolls at phone sizes instead of colliding.
//
// Pure helpers are extracted from the shipped app/app.js and run (the
// remediation pattern). Live rendering is covered by
// tests/visual-polish-journey.test.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractClaims } from '../server/engine.js';
import { seedData } from '../server/store.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'app', 'app.js'), 'utf8');
const css = readFileSync(join(root, 'app', 'styles.css'), 'utf8');

function extract(re, label) {
  const m = src.match(re);
  assert.ok(m, `${label} not found in app/app.js — the extractor needs updating`);
  return m[0];
}
function fnBody(name) {
  const start = src.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name}() not found in app/app.js`);
  const after = src.slice(start);
  const next = after.indexOf('\nfunction ', 1);
  return next === -1 ? after : after.slice(0, next);
}

const consts = [
  extract(/const esc = \(s\) => [^\n]+/, 'esc'),
  extract(/const money = \(n\) => [^\n]+/, 'money'),
  extract(/const signedMoney = \(n\) => [^\n]+/, 'signedMoney'),
  extract(/const pct = \(n\) => [^\n]+/, 'pct'),
].join('\n');

const { courtNextStep, correctionNextStep, caseNextStep, casePrimaryAction } = new Function(
  `${consts}\nconst claimLocal = {};\n`
  // P0 (2026-11-07): the hardcoded STRATEGY_TERMS table is gone —
  // haggleNextStep never used terms anyway, so no terms extraction.
  + `${extract(/function recommendedStrategy\([\s\S]*?\n\}/, 'recommendedStrategy')}\n`
  + `${extract(/function haggleNextStep\([\s\S]*?\n\}/, 'haggleNextStep')}\n`
  + `${extract(/const COURT_DEMO = \{[\s\S]*?\n\};/, 'COURT_DEMO')}\n`
  + `${extract(/function courtScoresFor\([\s\S]*?\n\}/, 'courtScoresFor')}\n`
  + `${extract(/function courtMeans\([\s\S]*?\n\}/, 'courtMeans')}\n`
  + `${extract(/function courtTallyState\([\s\S]*?\n\}/, 'courtTallyState')}\n`
  + `${extract(/function courtLeader\([\s\S]*?\n\}/, 'courtLeader')}\n`
  + `${extract(/function courtNextStep\([\s\S]*?\n\}/, 'courtNextStep')}\n`
  + `${extract(/function getClaim\([\s\S]*?\n\}/, 'getClaim')}\n`
  + `${extract(/function correctionNextStep\([\s\S]*?\n\}/, 'correctionNextStep')}\n`
  + `${extract(/function caseNextStep\([\s\S]*?\n\}/, 'caseNextStep')}\n`
  + `${extract(/function casePrimaryAction\([\s\S]*?\n\}/, 'casePrimaryAction')}\n`
  + `return { courtNextStep, correctionNextStep, caseNextStep, casePrimaryAction };`,
)();

// ---------- test data: the server enriches a stored case when it serves
// it, so the helpers build the case the way the server does ----------
function courtCase(overrides = {}) {
  const d = seedData();
  const c = JSON.parse(JSON.stringify(d.cases.find((x) => x.id === 'CRT-007')));
  Object.assign(c, overrides);
  return c;
}
function correctionCase(overrides = {}, statuses = {}) {
  const d = seedData();
  const c = JSON.parse(JSON.stringify(d.cases.find((x) => x.id === 'COR-003')));
  Object.assign(c, overrides);
  // The server attaches claims via extractClaims(transcript) with the
  // persisted status (default Unresolved) — mirror that here.
  c.claims = extractClaims(c.transcript).map((cl) => ({ ...cl, status: statuses[cl.id] || cl.status || 'Unresolved' }));
  return c;
}

// ---------- courtNextStep ----------
test('court next step: seed tally is complete, so adoption is the next step', () => {
  const ns = courtNextStep(courtCase());
  assert.equal(ns.button, 'Adopt the canonical version');
  assert.equal(ns.tab, 'negotiation');
  assert.match(ns.stage, /tally is complete/);
  assert.match(ns.action, /Nonna/);
});

test('court next step: ratings still coming in points at Analysis', () => {
  const c = courtCase({ ratings: courtCase().ratings.slice(0, 4) });
  const ns = courtNextStep(c);
  assert.equal(ns.button, 'Rate the samples →');
  assert.equal(ns.tab, 'analysis');
  assert.match(ns.action, /4 of 9 ratings in/);
});

test('court next step: canonical adopted points at the decision', () => {
  const c = courtCase({ canonicalVersion: 'card', canonicalAdoption: { adoptedBy: 'Mara (owner)', adoptedAt: '2026-11-06T10:00:00.000Z' } });
  const ns = courtNextStep(c);
  assert.equal(ns.button, 'View the decision');
  assert.equal(ns.tab, 'audit');
  assert.match(ns.action, /Nonna/);
});

test('court next step: rejected/blocked has no action', () => {
  assert.equal(courtNextStep(courtCase({ state: 'REJECTED' })).button, null);
  assert.equal(courtNextStep(courtCase({ state: 'BLOCKED' })).button, null);
});

// ---------- correctionNextStep ----------
test('correction next step: unresolved claims point at Negotiation', () => {
  const ns = correctionNextStep(correctionCase());
  assert.equal(ns.button, 'Review the claims →');
  assert.equal(ns.tab, 'negotiation');
  assert.match(ns.stage, /3 of 3 claims are still unresolved/);
});

test('correction next step: every claim resolved points at the errata', () => {
  const c = correctionCase({}, { C1: 'Corrected', C2: 'Corrected', C3: 'Corrected' });
  const ns = correctionNextStep(c);
  assert.equal(ns.button, 'Review the errata →');
  assert.equal(ns.tab, 'negotiation');
  assert.match(ns.stage, /Every claim is resolved/);
  assert.match(ns.action, /3 of 3 claims corrected/);
});

test('correction next step: no claims has no action', () => {
  const c = correctionCase({ transcript: 'I think this is a lovely day.' });
  assert.equal(correctionNextStep(c).button, null);
  assert.match(correctionNextStep(c).stage, /No factual claims/);
});

test('correction next step: rejected/blocked has no action', () => {
  assert.equal(correctionNextStep(correctionCase({ state: 'REJECTED' })).button, null);
});

// ---------- caseNextStep / casePrimaryAction cover every workflow ----------
test('primary action: every workflow gets one button, from the same Next step', () => {
  assert.deepEqual(casePrimaryAction(courtCase()), { label: 'Adopt the canonical version', tab: 'negotiation' });
  assert.deepEqual(casePrimaryAction(correctionCase()), { label: 'Review the claims →', tab: 'negotiation' });
  assert.equal(casePrimaryAction(courtCase({ state: 'REJECTED' })), null);
  // The header and the Overview agree by construction: both read
  // caseNextStep.
  assert.equal(caseNextStep(courtCase()).button, casePrimaryAction(courtCase()).label);
  assert.equal(caseNextStep(correctionCase()).button, casePrimaryAction(correctionCase()).label);
});

// ---------- placement: one shared Next step, readable summary, dashboard cue ----------
test('placement: the Overview has one shared Next step for every workflow', () => {
  const overview = fnBody('overviewTab');
  assert.ok(overview.includes('caseNextStep(c)'), 'overviewTab must use the shared caseNextStep');
  assert.ok(overview.includes('next-step-panel'), 'the Overview must render the Next step panel');
  assert.ok(!overview.includes('haggleNextStep(c)'), 'no workflow may keep its own Next step');
  const primary = fnBody('casePrimaryAction');
  assert.ok(!primary.includes("c.workflow !== 'HAGGLE'"), 'the primary action must not be HAGGLE-only');
  assert.ok(primary.includes('caseNextStep(c)'), 'the primary action must come from caseNextStep');
});

test('placement: the COURT summary labels are short and the versions list is clean', () => {
  const summary = fnBody('courtSummary');
  assert.ok(summary.includes('<dt>Conflicts</dt>'), 'the label must be short enough not to wrap');
  assert.ok(!summary.includes('Conflicting variables'), 'the long label must be gone');
  assert.ok(summary.includes('<dt>Leading</dt>'), 'the leader label must be short');
  assert.ok(!summary.includes('Leading by blind mean'), 'the long leader label must be gone');
  assert.ok(summary.includes("c.versions.map((v) => esc(v.author))"), 'the versions list must show author names only');
  assert.ok(!summary.includes('<span class="num">${esc(v.id)}</span>'), 'the id prefix that stuttered must be gone');
});

test('placement: the dashboard flags what awaits a human decision', () => {
  const dash = fnBody('renderDashboard');
  assert.ok(dash.includes('kpi-attention'), 'the Awaiting KPI must carry the attention class when > 0');
  assert.ok(dash.includes('decision-attention'), 'awaiting rows must carry the attention class');
  assert.ok(dash.includes("needsRows(awaiting, 'decision-attention')"), 'only awaiting rows get the cue, not open discussions');
});

// ---------- CSS: stepper scrolls at phone sizes, attention cue exists ----------
test('css: the stepper scrolls instead of colliding at phone sizes', () => {
  assert.ok(css.includes('.stepper{overflow-x:auto'), 'the stepper must scroll at phone sizes');
  assert.ok(css.includes('.stepper li{flex:0 0 auto'), 'step items must keep their natural width');
  assert.ok(css.includes('.stepper::-webkit-scrollbar{display:none}'), 'the scrollbar must be hidden');
  assert.ok(!css.includes('.stepper li{font-size:10px;padding:7px 1px'), 'the old shrink-the-type fix that collided must be gone');
});

test('css: the dashboard attention cue uses the existing amber tokens', () => {
  assert.ok(css.includes('.kpi-attention{background:var(--amber-bg)'), 'the KPI cue must use the amber background');
  assert.ok(css.includes('.decision-attention{border-left:3px solid var(--amber-dot)'), 'the row cue must use the amber edge');
});
