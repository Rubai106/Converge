// CONVERGE GAP-2 regression tests (2026-11-06) — "Submit for approval"
// on the selected HAGGLE strategy: a wizard-created case must reach
// approval through the UI alone (no API bridge, no hidden operations).
//
// Client behaviour is asserted statically against the shipped
// app/app.js (pure helpers extracted from the shipped source and run,
// in the style of tests/fixround.test.js). Server behaviour is
// exercised live against a scratch server on a temp copy of the demo
// data (seedData()), never the shared data/converge.json — see
// tests/case-creation.test.js. The full UI journey lives in
// tests/gap2-journey.test.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { seedData } from '../server/store.js';
import { haggleAnalysis, haggleStrategies } from '../server/engine.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'app', 'app.js'), 'utf8');

function extract(re, label) {
  const m = src.match(re);
  assert.ok(m, `${label} not found in app/app.js — the extractor needs updating`);
  return m[0];
}

// ---------- static: canonical proposal IDs ----------
const proposalIdForStrategy = new Function(
  `${extract(/const PROPOSAL_TO_STRATEGY = \{[^}]+\};/, 'PROPOSAL_TO_STRATEGY')}\n${extract(/const STRATEGY_TO_PROPOSAL = [^;]+;/, 'STRATEGY_TO_PROPOSAL')}\n${extract(/function proposalIdForStrategy\(strategyId\) \{[^}]+\}/, 'proposalIdForStrategy')}\nreturn proposalIdForStrategy;`,
)();
function fnBody(name) {
  const start = src.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name}() not found in app/app.js`);
  const after = src.slice(start);
  const next = after.indexOf('\nfunction ', 1);
  return next === -1 ? after : after.slice(0, next);
}
const termsForStrategy = new Function(
  // P0 (2026-11-07): the client agent rewrote termsForStrategy — the
  // hardcoded STRATEGY_TERMS table is gone; terms are now computed from
  // the strategy's own unitPrice/duration/unit (and the case's unit).
  // This extractor follows the client agent's new signature.
  `${extract(/const money = \(n\) => [^\n]+/, 'money')}\n${fnBody('termsForStrategy')}\nreturn termsForStrategy;`,
)();

test('gap2: proposalIdForStrategy maps every engine strategy to its canonical P-number', () => {
  assert.equal(proposalIdForStrategy('freeze'), 'P1');
  assert.equal(proposalIdForStrategy('counter-019'), 'P2');
  assert.equal(proposalIdForStrategy('volume-021'), 'P3');
  assert.equal(proposalIdForStrategy('alternative-018'), 'P4');
  assert.equal(proposalIdForStrategy('gradual'), 'P5');
  assert.equal(proposalIdForStrategy('substitute'), 'P6');
  assert.equal(proposalIdForStrategy('no-such-strategy'), null);
  assert.equal(proposalIdForStrategy(''), null);
  assert.equal(proposalIdForStrategy(undefined), null);
});

test('gap2: the P-number map is positional in the engine strategy order', () => {
  const analysis = haggleAnalysis({ oldPrice: 0.16, newPrice: 0.24, qtyPerServing: 6, otherIngredientsCostPerServing: 3.62, menuPrice: 16, monthlySales: 160, targetFoodCostPct: 30 });
  const ids = haggleStrategies(analysis, { oldPrice: 0.16, newPrice: 0.24, qtyPerServing: 6, otherIngredientsCostPerServing: 3.62, menuPrice: 16, monthlySales: 160, targetFoodCostPct: 30 }).map((s) => s.id);
  assert.deepEqual(ids, ['freeze', 'counter-019', 'volume-021', 'alternative-018', 'gradual', 'substitute']);
  ids.forEach((id, i) => assert.equal(proposalIdForStrategy(id), `P${i + 1}`, `${id} must be P${i + 1}`));
});

test('gap2: termsForStrategy returns the exact terms the owner signs', () => {
  // Terms are computed from the strategy's own unitPrice/duration/unit
  // (client rewrite, 2026-11-07) — no hardcoded table.
  assert.equal(termsForStrategy({ id: 'counter-019', unitPrice: 0.19, duration: '6 weeks', unit: 'fl oz' }).full, '$0.19 / fl oz for 6 weeks');
  assert.equal(termsForStrategy({ id: 'counter-019', unitPrice: 0.19, duration: '6 weeks', unit: 'fl oz' }).short, '$0.19 / fl oz · 6 weeks');
  assert.equal(termsForStrategy({ id: 'freeze', unitPrice: 0.16, duration: '4 weeks', unit: 'fl oz' }).full, '$0.16 / fl oz for 4 weeks');
  assert.equal(termsForStrategy({ id: 'volume-021', unitPrice: 0.21, duration: '4 weeks', unit: 'fl oz' }).full, '$0.21 / fl oz for 4 weeks');
  // The unit falls back to the case's unit when the strategy has none.
  assert.equal(termsForStrategy({ id: 'counter-019', unitPrice: 4.5, duration: '6 weeks' }, { input: { unit: 'kg' } }).full, '$4.50 / kg for 6 weeks');
  // Unknown strategy: falls back to a plain price, never a crash.
  assert.equal(termsForStrategy({ id: 'nope', unitPrice: 0.22 }).full, '$0.22 / fl oz');
});

// ---------- static: the Submit button exists, only where it may ----------
test('gap2: approvalControls renders a "Submit for approval" button with the exact terms, only in DISCUSSION/PROPOSAL', () => {
  assert.ok(src.includes('id="submit-btn">Submit for approval</button>'), 'button label is exactly "Submit for approval"');
  assert.ok(src.includes("if (c.state === 'DISCUSSION' || c.state === 'PROPOSAL')"), 'Submit renders only in DISCUSSION/PROPOSAL');
  assert.ok(src.includes('Proposed terms for'), 'the exact terms for the selected strategy are shown above the button');
  assert.ok(src.includes('id="submit-error"'), 'a failed submission has an error slot');
  // The old dead end is gone: the empty state no longer tells the user
  // to use "Move to" to submit a proposal (the dropdown cannot do that).
  assert.ok(!src.includes('Use “Move to” above to advance the case until a proposal is submitted'), 'the "Move to" dead-end copy is gone');
});

test('gap2: the approval modal re-routes through the shared submit helper with a canonical proposalId', () => {
  assert.ok(src.includes('await submitProposal(c, s, true);'), 'the modal re-route uses submitProposal');
  assert.ok(!src.includes('proposalId: s.id'), 'no path sends a strategy id as the proposalId any more');
  assert.ok(src.includes('function submitProposal(c, s, allowReplace = false)'), 'submitProposal is the single submission path');
  assert.ok(src.includes("throw new Error(`Unknown strategy ${s.id}"), 'an unknown strategy is refused client-side');
  assert.ok(src.includes('A proposal is already pending for this case'), 'a duplicate is refused client-side');
});

test('gap2: GAP-1 safeguards are preserved (dropdown + server gate)', () => {
  assert.ok(src.includes("filter((t) => t !== 'APPROVED' && t !== 'REJECTED' && t !== 'AWAITING_APPROVAL' && t !== 'PROPOSAL')"), 'moveOptions still excludes AWAITING_APPROVAL and PROPOSAL');
  const serverSrc = readFileSync(join(root, 'server', 'server.js'), 'utf8');
  assert.ok(serverSrc.includes("proposalId is required to move a case to AWAITING_APPROVAL"), 'the bare-move 400 is intact');
  assert.ok(serverSrc.includes('A proposal is already pending for this case'), 'the duplicate 400 is present');
  assert.ok(serverSrc.includes('Unknown proposal'), 'the invalid-proposal 400 is present');
});

test('gap2: staleness guards — selection resets per case, drawer post re-renders the case view', () => {
  assert.ok(src.includes('if (id !== currentCaseId) selectedStrategy = null;'), 'opening a different case resets the selected strategy');
  // The drawer post re-fetches the case detail AND re-renders the case
  // view behind the drawer, so the audit tab shows the new event
  // without a reload.
  const postHandler = src.slice(src.indexOf("api('/api/switch/post'"));
  assert.ok(postHandler.includes('details[c.id] = await api(`/api/cases/${c.id}`);'), 'drawer post re-fetches the case detail');
  assert.ok(postHandler.slice(0, 1200).includes('render();'), 'drawer post re-renders the case view');
});

// ---------- live: scratch server ----------
const PORT = 3212;
const base = `http://127.0.0.1:${PORT}`;
const scratchDir = mkdtempSync(join(tmpdir(), 'converge-gap2-'));
const dataFile = join(scratchDir, 'converge.json');
let child;

const validPayload = {
  supplier: 'GreenFields', ingredient: 'butter', recipe: '',
  oldPrice: 0.16, newPrice: 0.24, unit: 'fl oz', qtyPerServing: 6,
  otherIngredientsCostPerServing: 3.62, menuPrice: 16.0, monthlySales: 160,
  targetFoodCostPct: 30, targetPrice: 0.16, maxApprovedPrice: 0.20,
  evidenceSource: '',
};

async function waitForServer() {
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch(`${base}/api/status`); if (r.ok) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('server did not start');
}
let token;
async function post(path, body, actorKind = 'human') {
  // P0 (2026-11-07): every POST needs a session token. The body actor /
  // actorKind are still sent (as the old client did) but the server
  // ignores them — the actor comes from the session.
  return fetch(`${base}${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Converge-Session': token },
    body: JSON.stringify({ actor: 'Mara (owner)', actorKind, ...body }),
  });
}
async function transition(id, to, extra = {}, actorKind = 'human') {
  const r = await post(`/api/cases/${id}/transition`, { to, ...extra }, actorKind);
  return { status: r.status, body: await r.json().catch(() => ({})) };
}
async function getCase(id) {
  const r = await fetch(`${base}/api/cases/${id}`);
  assert.equal(r.status, 200, `GET /api/cases/${id} should succeed`);
  return r.json();
}
async function createCase(payload = validPayload) {
  const r = await post('/api/cases', payload);
  assert.equal(r.status, 201, 'case creation should succeed');
  return r.json();
}
// The transitions the UI's Submit for approval performs.
async function submitProposal(id, proposalId, terms) {
  let r = await transition(id, 'PROPOSAL');
  assert.equal(r.status, 200, `DISCUSSION -> PROPOSAL should succeed (got ${r.status}: ${r.body.error || ''})`);
  r = await transition(id, 'AWAITING_APPROVAL', { proposalId, terms });
  assert.equal(r.status, 200, `PROPOSAL -> AWAITING_APPROVAL should succeed (got ${r.status}: ${r.body.error || ''})`);
  return r.body;
}

test.before(async () => {
  writeFileSync(dataFile, JSON.stringify(seedData()));
  child = spawn('node', ['server/server.js'], { cwd: root, env: { ...process.env, PORT: String(PORT), CONVERGE_DATA_FILE: dataFile }, stdio: 'ignore' });
  await waitForServer();
  token = (await (await fetch(`${base}/api/session`, { method: 'POST' })).json()).token;
});

test.after(async () => {
  child?.kill();
  rmSync(scratchDir, { recursive: true, force: true });
});

test('gap2: submit P2 creates the pending proposal with the correct id and terms', async () => {
  const c = await createCase();
  assert.equal(c.state, 'DISCUSSION');
  await submitProposal(c.id, 'P2', '$0.18 / fl oz for 6 weeks');
  const d = await getCase(c.id);
  assert.equal(d.state, 'AWAITING_APPROVAL');
  assert.equal(d.pendingApproval.proposalId, 'P2');
  assert.equal(d.pendingApproval.terms, '$0.18 / fl oz for 6 weeks');
  assert.equal(d.pendingApproval.requestedBy, 'Mara · Owner');
});

test('gap2: a duplicate submission is rejected 400 and the pending proposal is unchanged', async () => {
  const c = await createCase();
  await submitProposal(c.id, 'P2', '$0.18 / fl oz for 6 weeks');
  const dup = await transition(c.id, 'AWAITING_APPROVAL', { proposalId: 'P1', terms: '$0.16 / fl oz for 4 weeks' });
  assert.equal(dup.status, 400);
  assert.match(dup.body.error, /already pending/);
  const d = await getCase(c.id);
  assert.equal(d.state, 'AWAITING_APPROVAL');
  assert.equal(d.pendingApproval.proposalId, 'P2');
  assert.equal(d.pendingApproval.terms, '$0.18 / fl oz for 6 weeks');
});

test('gap2: invalid strategies are rejected 400 and the case is unchanged', async () => {
  const c = await createCase();
  for (const bad of ['P99', 'P0', 'P-1', 'counter-019', 'freeze', 'p2']) {
    await transition(c.id, 'PROPOSAL');
    const r = await transition(c.id, 'AWAITING_APPROVAL', { proposalId: bad, terms: 'x' });
    assert.equal(r.status, 400, `proposalId ${JSON.stringify(bad)} must be rejected`);
    assert.match(r.body.error, /Unknown proposal/);
    const d = await getCase(c.id);
    assert.equal(d.state, 'PROPOSAL', 'the case must not advance on a rejected submission');
    assert.equal(d.pendingApproval, null, 'no pending proposal may be created by a rejected submission');
    // Back to DISCUSSION for the next attempt (the state machine's step-back).
    const back = await transition(c.id, 'DISCUSSION');
    assert.equal(back.status, 200);
  }
  // An empty proposalId is caught by the GAP-1 guard instead (it is
  // falsy) — still a 400, still no state change.
  await transition(c.id, 'PROPOSAL');
  const empty = await transition(c.id, 'AWAITING_APPROVAL', { proposalId: '', terms: 'x' });
  assert.equal(empty.status, 400);
  assert.match(empty.body.error, /proposalId is required/);
  const d = await getCase(c.id);
  assert.equal(d.state, 'PROPOSAL');
  assert.equal(d.pendingApproval, null);
});

test('gap2: a bare transition to AWAITING_APPROVAL is still rejected (GAP-1 preserved)', async () => {
  const c = await createCase();
  await transition(c.id, 'PROPOSAL');
  const r = await transition(c.id, 'AWAITING_APPROVAL', {});
  assert.equal(r.status, 400);
  assert.match(r.body.error, /proposalId is required/);
  const d = await getCase(c.id);
  assert.equal(d.state, 'PROPOSAL');
  assert.equal(d.pendingApproval, null);
});

test('gap2: approval needs a session token; a body actorKind is ignored (the session actor decides)', async () => {
  const c = await createCase();
  await submitProposal(c.id, 'P2', '$0.18 / fl oz for 6 weeks');
  // No session token: 401, and the case is untouched.
  const noToken = await fetch(`${base}/api/cases/${c.id}/transition`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to: 'APPROVED' }),
  });
  assert.equal(noToken.status, 401);
  let d = await getCase(c.id);
  assert.equal(d.state, 'AWAITING_APPROVAL', 'the unauthenticated attempt must not change the state');
  assert.equal(d.pendingApproval.proposalId, 'P2', 'the pending proposal must survive the unauthenticated attempt');
  assert.equal(d.approval, null);
  // A body that claims actorKind 'agent' is ignored: the session actor
  // is human, so the approval succeeds and records the session actor.
  // (P0 2026-11-07: the actor comes from the session, never the body —
  // the engine-level human-only gate is still the backstop.)
  const agentBody = await transition(c.id, 'APPROVED', {}, 'agent');
  assert.equal(agentBody.status, 200);
  assert.equal(agentBody.body.approval.approvedBy, 'Mara · Owner');
});

test('gap2: full journey — submit P2, human approve, complete; terms and engine figures agree throughout', async () => {
  const c = await createCase();
  await submitProposal(c.id, 'P2', '$0.18 / fl oz for 6 weeks');
  const approved = await transition(c.id, 'APPROVED');
  assert.equal(approved.status, 200);
  assert.equal(approved.body.state, 'APPROVED');
  assert.equal(approved.body.approval.proposalId, 'P2');
  assert.equal(approved.body.approval.terms, '$0.18 / fl oz for 6 weeks');
  assert.equal(approved.body.approval.approvedBy, 'Mara · Owner');
  assert.equal(approved.body.pendingApproval, null, 'the pending proposal is consumed by the approval');
  // The engine figures for the approved strategy (counter-019) must
  // match the numbers the modal and the impact panel show.
  const d = await getCase(c.id);
  const s = d.strategies.find((x) => x.id === 'counter-019');
  assert.equal(s.creamCostPerServing, 1.08);
  assert.equal(s.foodCostPct, 29.38);
  assert.equal(s.extraVsOldPerMonth, 19.2);
  assert.equal(s.savingVsNewPerMonth, 57.6);
  const done = await transition(c.id, 'COMPLETED');
  assert.equal(done.status, 200);
  assert.equal(done.body.state, 'COMPLETED');
  const events = done.body.audit.map((e) => e.event);
  for (const want of ['state:DISCUSSION->PROPOSAL', 'state:PROPOSAL->AWAITING_APPROVAL', 'state:AWAITING_APPROVAL->APPROVED', 'state:APPROVED->COMPLETED']) {
    assert.ok(events.includes(want), `audit must record ${want}`);
  }
});

test('gap2: a non-seeded strategy (P3 volume-021) submits and approves end to end', async () => {
  const c = await createCase();
  await submitProposal(c.id, 'P3', '$0.22 / fl oz for 4 weeks');
  const d = await getCase(c.id);
  assert.equal(d.pendingApproval.proposalId, 'P3');
  assert.equal(d.pendingApproval.terms, '$0.22 / fl oz for 4 weeks');
  const approved = await transition(c.id, 'APPROVED');
  assert.equal(approved.status, 200);
  assert.equal(approved.body.approval.proposalId, 'P3');
  const s = d.strategies.find((x) => x.id === 'volume-021');
  assert.equal(s.creamCostPerServing, 1.296);
  assert.equal(s.foodCostPct, 30.75);
});

test('gap2: reject records the terms, clears the pending proposal, and a fresh proposal can follow', async () => {
  const c = await createCase();
  await submitProposal(c.id, 'P2', '$0.18 / fl oz for 6 weeks');
  const rejected = await transition(c.id, 'REJECTED');
  assert.equal(rejected.status, 200);
  assert.equal(rejected.body.state, 'REJECTED');
  assert.equal(rejected.body.rejectedTerms.terms, '$0.18 / fl oz for 6 weeks');
  assert.equal(rejected.body.pendingApproval, null);
  // A fresh proposal after rejection is NOT a duplicate — it must work.
  await transition(c.id, 'DISCUSSION');
  await submitProposal(c.id, 'P1', '$0.16 / fl oz for 4 weeks');
  const d = await getCase(c.id);
  assert.equal(d.state, 'AWAITING_APPROVAL');
  assert.equal(d.pendingApproval.proposalId, 'P1');
  assert.equal(d.rejectedTerms, null, 'a fresh proposal supersedes the rejected terms');
});
