// CONVERGE remediation regression tests — HAGGLE approval flow
// (H7–H10, M17–M20, 2026-11-06).
//
// Engine behaviour is exercised live (server/engine.js); client
// behaviour is asserted statically against the shipped app/app.js +
// app/index.html in the style of tests/escaping.test.js — the pure
// helpers (moveOptions, strategyImpactLine, approvedStrategy) are
// extracted from the shipped source and run, the render gating is
// asserted on the shipped source text.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { transitionCase } from '../server/engine.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'app', 'app.js'), 'utf8');
const html = readFileSync(join(root, 'app', 'index.html'), 'utf8');
const css = readFileSync(join(root, 'app', 'styles.css'), 'utf8');

function extract(re, label) {
  const m = src.match(re);
  assert.ok(m, `${label} not found in app/app.js — the extractor needs updating`);
  return m[0];
}
function fnBody(name) {
  const start = src.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name}() not found in app/app.js`);
  // Body runs to the next top-level "function " / end — slice generously
  // and cut at the following "\nfunction " after the opening brace.
  const after = src.slice(start);
  const next = after.indexOf('\nfunction ', 1);
  return next === -1 ? after : after.slice(0, next);
}

// ---------- M20 (engine): rejected terms are recorded ----------
function haggleCase(state = 'AWAITING_APPROVAL') {
  return {
    id: 'HAG-TEST', state,
    pendingApproval: { proposalId: 'P2', terms: '$0.19/fl oz for 6 weeks', requestedBy: 'Negotiation Agent' },
    approval: null, audit: [],
  };
}
const human = { name: 'Mara (owner)', kind: 'human' };

test('M20: rejecting a pending approval records the rejected terms on the case', () => {
  const c = haggleCase();
  transitionCase(c, 'REJECTED', human);
  assert.equal(c.state, 'REJECTED');
  assert.equal(c.pendingApproval, null);
  assert.deepEqual(c.rejectedTerms, {
    proposalId: 'P2', terms: '$0.19/fl oz for 6 weeks',
    requestedBy: 'Negotiation Agent', rejectedBy: 'Mara (owner)',
    rejectedAt: c.rejectedTerms.rejectedAt,
  });
  assert.ok(typeof c.rejectedTerms.rejectedAt === 'string');
});

test('M20: the rejection audit event carries the rejected terms', () => {
  const c = haggleCase();
  transitionCase(c, 'REJECTED', human);
  const ev = c.audit.find((e) => e.event === 'state:AWAITING_APPROVAL->REJECTED');
  assert.ok(ev, 'rejection audit event missing');
  assert.equal(ev.rejectedTerms, '$0.19/fl oz for 6 weeks');
});

test('M20: rejecting with no pending approval records no terms and does not crash', () => {
  const c = { id: 'HAG-TEST', state: 'PROPOSAL', pendingApproval: null, approval: null, audit: [] };
  transitionCase(c, 'REJECTED', human);
  assert.equal(c.rejectedTerms, undefined);
});

test('M20: a fresh proposal supersedes the rejected-terms record', () => {
  const c = haggleCase();
  transitionCase(c, 'REJECTED', human);
  assert.ok(c.rejectedTerms);
  transitionCase(c, 'DISCUSSION', human);
  transitionCase(c, 'PROPOSAL', human);
  transitionCase(c, 'AWAITING_APPROVAL', human);
  assert.equal(c.rejectedTerms, null);
});

// ---------- H8: Move dropdown never offers APPROVED / REJECTED ----------
const moveOptions = new Function(
  `${extract(/const TRANSITIONS = \{[\s\S]*?\n\};/, 'TRANSITIONS')}\n${extract(/function moveOptions\(state\) \{[\s\S]*?\n\}/, 'moveOptions')}\nreturn moveOptions;`,
)();

test('H8: AWAITING_APPROVAL offers DISCUSSION, WITHDRAWN and EXPIRED in the Move dropdown', () => {
  // WITHDRAWN/EXPIRED (P0) are legitimate Move options for an awaiting
  // approval — a human can withdraw it or let it expire. APPROVED and
  // REJECTED stay out: they go through the approval flow, never the
  // dropdown.
  assert.deepEqual(moveOptions('AWAITING_APPROVAL'), ['DISCUSSION', 'WITHDRAWN', 'EXPIRED']);
});

test('H8/GAP-1: PROPOSAL offers no AWAITING_APPROVAL or REJECTED; APPROVED still offers COMPLETED', () => {
  assert.deepEqual(moveOptions('PROPOSAL'), ['DISCUSSION', 'CANCELLED']);
  assert.deepEqual(moveOptions('APPROVED'), ['COMPLETED', 'BLOCKED']);
  // 2026-11-06: DISCUSSION no longer offers PROPOSAL — a proposal only
  // exists when Submit for approval attaches a strategy and terms, so
  // moving to PROPOSAL on its own just changed a label.
  assert.deepEqual(moveOptions('DISCUSSION'), ['BLOCKED', 'CANCELLED']);
  for (const state of ['DRAFT', 'DISCUSSION', 'PROPOSAL', 'AWAITING_APPROVAL', 'APPROVED', 'REJECTED']) {
    assert.ok(!moveOptions(state).includes('APPROVED'), `${state} still offers APPROVED`);
    assert.ok(!moveOptions(state).includes('REJECTED'), `${state} still offers REJECTED`);
    // GAP-1: the dropdown sends no proposal, so it must never offer
    // AWAITING_APPROVAL — entering it bare strands the case with no
    // pending approval and no Approve/Reject path.
    assert.ok(!moveOptions(state).includes('AWAITING_APPROVAL'), `${state} still offers AWAITING_APPROVAL`);
    assert.ok(!moveOptions(state).includes('PROPOSAL'), `${state} still offers PROPOSAL`);
  }
});

test('H8: renderCase builds the dropdown from moveOptions, not TRANSITIONS directly', () => {
  assert.ok(src.includes('moveOptions(c.state).map'), 'renderCase must use moveOptions(c.state)');
});

// ---------- H7: modal impact line is computed from engine data ----------
const strategyImpactLine = new Function(
  `${extract(/const money = \(n\) => [^\n]+/, 'money')}\n${extract(/const signedMoney = \(n\) => [^\n]+/, 'signedMoney')}\n${extract(/const pct = \(n\) => [^\n]+/, 'pct')}\n${extract(/function strategyImpactLine\(c, s\) \{[\s\S]*?\n\}/, 'strategyImpactLine')}\nreturn strategyImpactLine;`,
)();
function impactCase(unitPrice = 0.19) {
  return {
    analysis: { oldCreamCostPerServing: 0.96 },
    input: { maxApprovedPrice: 0.2, targetFoodCostPct: 30 },
  };
}
function impactStrategy(unitPrice = 0.19, foodCostPct = 29.75, extra = 28.8) {
  return { unitPrice, creamCostPerServing: 1.14, extraVsOldPerMonth: extra, foodCostPct };
}

test('H7: impact line states per-serving + monthly cost, food cost % and the mandate check', () => {
  const line = strategyImpactLine(impactCase(), impactStrategy());
  assert.equal(line, '+$0.18 / serving · +$28.80 / month · food cost 29.75% (target 30%) · within mandate max $0.20');
});

test('H7: a price above the mandate max is labelled as such, not silently passed', () => {
  const line = strategyImpactLine(impactCase(), { ...impactStrategy(), unitPrice: 0.21 });
  assert.ok(line.includes('above mandate max $0.20'), line);
});

test('H7: the approval modal renders the impact line and the recommendation', () => {
  assert.ok(html.includes('id="modal-impact"'), 'modal-impact element missing from index.html');
  assert.ok(html.includes('id="modal-recommendation"'), 'modal-recommendation element missing from index.html');
  const body = fnBody('openApproveModal');
  assert.ok(body.includes("$('#modal-impact').textContent"), 'openApproveModal must set #modal-impact');
  assert.ok(body.includes('strategyImpactLine(c, s)'), 'modal impact must come from strategyImpactLine');
  assert.ok(body.includes("$('#modal-recommendation').textContent"), 'openApproveModal must set #modal-recommendation');
  assert.ok(body.includes('s.recommendation'), 'modal recommendation must come from the strategy data');
});

// ---------- H9: approved strategy drives the financial panels ----------
const approvedStrategy = new Function(
  `${extract(/const PROPOSAL_TO_STRATEGY = \{[^}]+\};/, 'PROPOSAL_TO_STRATEGY')}\n${extract(/function approvedStrategy\(c\) \{[\s\S]*?\n\}/, 'approvedStrategy')}\nreturn approvedStrategy;`,
)();

test('H9: approvedStrategy resolves the approved proposal to its engine strategy', () => {
  const strategies = [{ id: 'freeze' }, { id: 'counter-019', unitPrice: 0.19 }];
  assert.deepEqual(approvedStrategy({ approval: { proposalId: 'P2' }, strategies }), { id: 'counter-019', unitPrice: 0.19 });
  assert.equal(approvedStrategy({ approval: { proposalId: 'P9' }, strategies }), null);
  assert.equal(approvedStrategy({ approval: null, strategies }), null);
});

test('H9: the summary panel shows the approved strategy impact, labelled when approved', () => {
  // The approved-strategy resolution lives in haggleHeroFigures
  // (2026-11-06), shared by the Overview key figures and the Analysis
  // chart so both panels always agree; haggleSummary consumes it.
  const hero = fnBody('haggleHeroFigures');
  assert.ok(hero.includes('approvedStrategy(c)'), 'haggleHeroFigures must resolve the approved strategy');
  assert.ok(hero.includes('Approved terms:'), 'approved hero must be labelled as approved terms');
  assert.ok(hero.includes('If the'), 'unapproved hero must be labelled as the if-accepted figure');
  const body = fnBody('haggleSummary');
  assert.ok(body.includes('haggleHeroFigures(c)'), 'haggleSummary must use the shared hero figures');
});

// ---------- H10: reject is a two-step confirmation ----------
test('H10: the Reject button opens the reject confirmation, never transitions directly', () => {
  const body = fnBody('bindCaseEvents');
  assert.ok(body.includes('openRejectModal(c)'), 'reject button must open the reject modal');
  assert.ok(!/rb\.addEventListener\('click', async \(\) => \{\s*try \{ await transition\(c\.id, 'REJECTED'\)/.test(body),
    'reject button must not transition directly');
  const modal = fnBody('openRejectModal');
  assert.ok(modal.includes("$('#modal-terms').textContent"), 'reject modal must restate the terms');
  assert.ok(modal.includes("transition(c.id, 'REJECTED')"), 'reject modal confirm must perform the transition');
  assert.ok(modal.includes('Reject these terms'), 'reject modal confirm must be labelled as rejection');
});

// ---------- M17: no phantom Approved step before approval ----------
test('M17: the timeline labels the pre-approval row as a pending decision, not Approved', () => {
  assert.ok(src.includes('Approval — pending owner decision'), 'timeline must use the pending wording');
  assert.ok(!src.includes('Approved — awaiting owner decision'), 'phantom "Approved — awaiting owner decision" row must be gone');
});

// ---------- M18: Completed step + visible Mark completed action ----------
test('M18: the stepper has a Completed step after Approved', () => {
  assert.ok(src.includes("'Approved', 'Completed'"), 'STEPS must end Approved → Completed');
  assert.ok(src.includes('COMPLETED: 7'), 'STEP_INDEX must map COMPLETED to the new step');
  assert.ok(src.includes('APPROVED: 6'), 'STEP_INDEX must keep APPROVED at its step');
});

test('M18: an approved case offers a visible Mark completed action (no new gate)', () => {
  const body = fnBody('approvalControls');
  assert.ok(body.includes('id="complete-btn"'), 'approvalControls must render the complete button');
  assert.ok(body.includes('Mark completed'), 'complete button must be labelled Mark completed');
  assert.ok(body.includes("c.state === 'APPROVED'"), 'complete button only while APPROVED');
  const bind = fnBody('bindCaseEvents');
  assert.ok(bind.includes("transition(c.id, 'COMPLETED')"), 'complete button must transition to COMPLETED');
});

// ---------- M19: Approve/Reject only while a pending approval exists ----------
test('M19: Approve/Reject render only when pendingApproval exists', () => {
  const body = fnBody('approvalControls');
  assert.ok(body.includes('if (c.pendingApproval)'), 'approvalControls must gate on pendingApproval');
  assert.ok(!body.includes("c.state === 'AWAITING_APPROVAL' || c.state === 'PROPOSAL' || c.state === 'DISCUSSION'"),
    'approvalControls must not offer Approve/Reject by state alone');
  assert.ok(body.includes('No pending approval'), 'the empty state must be shown otherwise');
});

// ---------- M20 (client): distinct COMPLETED pill + rejected-terms surfaces ----------
test('M20: COMPLETED has its own pill class, distinct from APPROVED', () => {
  assert.ok(src.includes("COMPLETED: 'pill-blue'"), 'statePill must map COMPLETED to pill-blue');
  assert.ok(src.includes("APPROVED: 'pill-teal'"), 'statePill must keep APPROVED on pill-teal');
  assert.ok(css.includes('.pill-blue'), 'styles.css must define .pill-blue');
});

test('M20: rejected terms are rendered in the Approvals panel and the audit tab', () => {
  assert.ok(src.includes('c.rejectedTerms.terms'), 'rejected terms must be rendered from the transition record');
  const rail = fnBody('railPanels');
  assert.ok(rail.includes('Rejected:'), 'Approvals panel must show the rejected terms');
  const auditTab = fnBody('auditTab');
  assert.ok(auditTab.includes('Rejected:'), 'audit tab must show the rejected terms');
  assert.ok(auditTab.includes('e.rejectedTerms'), 'audit events must carry their rejected terms');
});
