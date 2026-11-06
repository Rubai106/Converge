// CONVERGE fix-round regression tests (2026-11-06) — the four gate
// blockers left by the remediation pass: GAP-1 (dropdown trap), AXE-1
// (nested-interactive on Workflows), M21 (room drawer timeline), and
// the cosmetic double-sign in signed money deltas.
//
// Client behaviour is asserted statically against the shipped
// app/app.js + app/index.html in the style of
// tests/remediation-haggle.test.js (pure helpers extracted from the
// shipped source and run). Server behaviour is exercised live against
// a scratch data file (isolated seed data in a temp dir), never the
// shared data/converge.json — which is gitignored and absent after a
// fresh clone. See tests/case-creation.test.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { switchTimelineToMessages } from '../server/switch-client.js';
import { seedData } from '../server/store.js';

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
  const after = src.slice(start);
  const next = after.indexOf('\nfunction ', 1);
  return next === -1 ? after : after.slice(0, next);
}

// ---------- Cosmetic: signed money deltas never double-sign ----------
const signedMoney = new Function(
  `${extract(/const signedMoney = \(n\) => [^\n]+/, 'signedMoney')}\nreturn signedMoney;`,
)();
const signedPct = new Function(
  `${extract(/const signedPct = \(n\) => [^\n]+/, 'signedPct')}\nreturn signedPct;`,
)();

test('fixround: signedMoney prints a saving with one leading minus, a cost with one leading plus', () => {
  assert.equal(signedMoney(-0.06), '-$0.06');
  assert.equal(signedMoney(-86.4), '-$86.40');
  assert.equal(signedMoney(0.48), '+$0.48');
  assert.equal(signedMoney(0), '+$0.00');
  assert.ok(!signedMoney(-0.06).includes('$-'), 'no double sign');
});

test('fixround: signedPct prints a saving percent with one leading minus', () => {
  assert.equal(signedPct(-5), '-5');
  assert.equal(signedPct(50), '+50');
  assert.equal(signedPct(0), '+0');
});

const strategyImpactLine = new Function(
  `${extract(/const money = \(n\) => [^\n]+/, 'money')}\n${extract(/const signedMoney = \(n\) => [^\n]+/, 'signedMoney')}\n${extract(/const pct = \(n\) => [^\n]+/, 'pct')}\n${extract(/function strategyImpactLine\(c, s\) \{[\s\S]*?\n\}/, 'strategyImpactLine')}\nreturn strategyImpactLine;`,
)();
function impactCase() {
  return {
    analysis: { oldCreamCostPerServing: 1.68 },
    input: { maxApprovedPrice: 0.2, targetFoodCostPct: 30 },
  };
}

test('fixround: the modal impact line for a saving strategy reads -$0.54, never +$-0.54', () => {
  // HAG-015 repro (old $0.28/fl oz, counter-019 $0.19): per-serving
  // -0.54, per-month -86.40.
  const line = strategyImpactLine(impactCase(), {
    unitPrice: 0.19, creamCostPerServing: 1.14, extraVsOldPerMonth: -86.4, foodCostPct: 29.75,
  });
  assert.equal(line, '-$0.54 / serving · -$86.40 / month · food cost 29.75% (target 30%) · within mandate max $0.20');
  assert.ok(!line.includes('+$-'), 'double sign must be gone');
});

test('fixround: no signed money delta is rendered with a hardcoded + prefix anywhere', () => {
  assert.ok(!src.includes('+${money('), 'a +${money(...)} site would double-sign a negative');
  assert.ok(!src.includes('(+${a.pctChange}'), 'a +${pctChange} site would double-sign a negative');
});

// ---------- AXE-1: Workflows rows are no longer nested-interactive ----------
test('fixround AXE-1: the Workflows demo-case row carries no role="button", the link stays', () => {
  const body = fnBody('renderWorkflows');
  // Assert on the row template itself, not the whole body (the fix
  // comment mentions role="button" in prose).
  assert.ok(!body.includes('data-open="${r[3]}" role="button"'), 'link-bearing Workflows row must not carry role="button"');
  assert.ok(body.includes('<a href="?case=${r[3]}"'), 'the demo-case link must stay');
  assert.ok(body.includes('class="clickable" data-open="${r[3]}"'), 'the row must stay clickable');
});

test('fixround AXE-1/L2: clickable rows WITHOUT inner links keep role="button"', () => {
  assert.ok(src.includes('role="button" aria-label="Open case ${esc(c.id)}'), 'dashboard rows keep role="button"');
  assert.ok(src.includes('role="button" aria-label="Open case ${esc(e.caseId)}'), 'evidence rows keep role="button"');
});

// ---------- M21: drawer shows the room timeline, no mandate box ----------
test('fixround M21: no mandate box in the drawer (HTML, CSS, or renderRoom)', () => {
  assert.ok(!html.includes('drawer-mandate'), 'index.html must not contain the drawer mandate box');
  assert.ok(!src.includes('drawer-mandate'), 'app.js must not reference the drawer mandate box');
  assert.ok(!css.includes('.drawer .mandate-box'), 'styles.css must not carry the drawer mandate rule');
  // The rail keeps its own mandate box (line ~1003) — only the drawer copy is gone.
  assert.ok(src.includes('<div class="mandate-box">'), 'the rail mandate box must stay');
});

test('fixround M21: renderRoom loads the timeline from /api/switch/messages', () => {
  const body = fnBody('renderRoom');
  assert.ok(body.includes('/api/switch/messages?caseId='), 'renderRoom must fetch the room timeline endpoint');
  assert.ok(body.includes('localOnly'), 'stored-only messages must be flagged, not silently merged');
  assert.ok(body.includes('No messages yet in this room'), 'the genuine empty state must stay');
});

// ---------- M21: read_context mapping (pure, server-side) ----------
function liveResult() {
  return {
    result: {
      threads: [
        { root: { id: 'sw_join1', kind: 'room_join', sender_name: 'bridge', body: 'bridge joined the room', timestamp: 1000 }, replies: [] },
        { root: { id: 'sw_msg1', kind: 'message', sender_name: 'user', body: 'Hello from the room', timestamp: 2000 }, replies: [
          { id: 'sw_msg2', kind: 'message', sender_name: 'converge-facilitator', body: 'Reply from the agent', timestamp: 3000 },
        ] },
        { root: { id: 'sw_msg3', kind: 'message', sender_name: 'user', body: 'No timestamp here', timestamp: null }, replies: [] },
      ],
      truncated: false,
    },
  };
}

test('fixround M21: switchTimelineToMessages keeps messages only, oldest first, mapped to the drawer shape', () => {
  const msgs = switchTimelineToMessages(liveResult());
  assert.deepEqual(msgs.map((m) => m.id), ['sw_msg1', 'sw_msg2', 'sw_msg3']);
  assert.equal(msgs[0].author, 'user');
  assert.equal(msgs[0].text, 'Hello from the room');
  assert.equal(msgs[0].at, new Date(2000).toISOString());
  assert.equal(msgs[0].real, true);
  assert.equal(msgs[0].eventId, 'sw_msg1');
  assert.equal(msgs[2].at, null);
});

test('fixround M21: switchTimelineToMessages tolerates an empty or missing result', () => {
  assert.deepEqual(switchTimelineToMessages({}), []);
  assert.deepEqual(switchTimelineToMessages({ result: { threads: [] } }), []);
  assert.deepEqual(switchTimelineToMessages(null), []);
});

// ---------- GAP-1 + messages endpoint: live server on a scratch file ----------
const scratchDir = mkdtempSync(join(tmpdir(), 'converge-fixround-'));
const dataFile = join(scratchDir, 'converge.json');
writeFileSync(dataFile, JSON.stringify(seedData()));
const PORT = 3197;
const base = `http://localhost:${PORT}`;
let child;

async function waitForServer() {
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch(`${base}/api/status`); if (r.ok) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('server did not start');
}
let token; // P0 (2026-11-07): every POST needs a session token.
async function req(path, opts = {}) {
  const r = await fetch(`${base}${path}`, opts);
  const body = await r.json().catch(() => ({}));
  return { status: r.status, body };
}
async function post(path, body) {
  return req(path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Converge-Session': token }, body: JSON.stringify(body) });
}

test.before(async () => {
  child = spawn('node', ['server/server.js'], { cwd: root, env: { ...process.env, PORT: String(PORT), CONVERGE_DATA_FILE: dataFile }, stdio: 'ignore' });
  await waitForServer();
  token = (await (await fetch(`${base}/api/session`, { method: 'POST' })).json()).token;
});
test.after(() => {
  child?.kill();
  rmSync(scratchDir, { recursive: true, force: true });
});

const validPayload = {
  supplier: 'DairyCo', ingredient: 'heavy cream', recipe: 'Alfredo',
  oldPrice: 0.16, newPrice: 0.24, unit: 'fl oz', qtyPerServing: 6,
  otherIngredientsCostPerServing: 3.62, menuPrice: 16.0, monthlySales: 160,
  targetFoodCostPct: 30, targetPrice: 0.16, maxApprovedPrice: 0.20,
  evidenceSource: 'DairyCo invoice (demo)',
};
const human = { actor: 'Mara (owner)', actorKind: 'human' };

test('fixround GAP-1: a bare transition to AWAITING_APPROVAL is rejected 400 naming proposalId, state unchanged', async () => {
  const created = await post('/api/cases', validPayload);
  assert.equal(created.status, 201);
  const id = created.body.id;
  const toProposal = await post(`/api/cases/${id}/transition`, { to: 'PROPOSAL', ...human });
  assert.equal(toProposal.status, 200);
  const bare = await post(`/api/cases/${id}/transition`, { to: 'AWAITING_APPROVAL', ...human });
  assert.equal(bare.status, 400);
  assert.match(bare.body.error, /proposalId/);
  const after = await req(`/api/cases/${id}`);
  assert.equal(after.body.state, 'PROPOSAL');
  assert.equal(after.body.pendingApproval, null);
});

test('fixround GAP-1: the same transition WITH a proposalId succeeds and sets pendingApproval', async () => {
  const created = await post('/api/cases', validPayload);
  assert.equal(created.status, 201);
  const id = created.body.id;
  await post(`/api/cases/${id}/transition`, { to: 'PROPOSAL', ...human });
  const withProposal = await post(`/api/cases/${id}/transition`, {
    to: 'AWAITING_APPROVAL', ...human, proposalId: 'P2', terms: '$0.19/fl oz for 6 weeks, in writing',
  });
  assert.equal(withProposal.status, 200);
  assert.equal(withProposal.body.state, 'AWAITING_APPROVAL');
  assert.equal(withProposal.body.pendingApproval.proposalId, 'P2');
});

test('fixround M21: /api/switch/messages returns the stored transcript in stub mode, then the posted message', async () => {
  const before = await req('/api/switch/messages?caseId=HAG-014');
  assert.equal(before.status, 200);
  assert.equal(before.body.live, false);
  assert.equal(before.body.simulated, true);
  assert.ok(Array.isArray(before.body.messages));
  const n0 = before.body.messages.length;
  const posted = await post('/api/switch/post', { caseId: 'HAG-014', room: '#haggle-dairyco', author: 'Mara (owner)', text: 'Fix-round drawer check' });
  assert.equal(posted.status, 200);
  const after = await req('/api/switch/messages?caseId=HAG-014');
  assert.equal(after.body.messages.length, n0 + 1);
  assert.ok(after.body.messages.some((m) => m.text === 'Fix-round drawer check'));
});

test('fixround M21: /api/switch/messages 404s for an unknown case or a missing caseId', async () => {
  assert.equal((await req('/api/switch/messages?caseId=NOPE-000')).status, 404);
  assert.equal((await req('/api/switch/messages')).status, 404);
});
