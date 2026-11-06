// CONVERGE case-creation tests — guided HAGGLE creation (POST /api/cases)
// and its no-persistence preview (POST /api/cases/preview).
// Spawns the real server on a test port against a SCRATCH data file
// (isolated seed data in a temp dir), never the shared data/converge.json
// — which is gitignored and absent after a fresh clone. The full suite
// runs test files in parallel, and two files sharing one data file race.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { haggleAnalysis, haggleStrategies } from '../server/engine.js';
import { seedData } from '../server/store.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const scratchDir = mkdtempSync(join(tmpdir(), 'converge-create-'));
const dataFile = join(scratchDir, 'converge.json');
writeFileSync(dataFile, JSON.stringify(seedData()));
const PORT = 3198;
const base = `http://localhost:${PORT}`;

let child;

async function waitForServer() {
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch(`${base}/api/status`); if (r.ok) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('server did not start');
}

const validPayload = {
  supplier: 'DairyCo', ingredient: 'heavy cream', recipe: 'Alfredo',
  oldPrice: 0.16, newPrice: 0.24, unit: 'fl oz', qtyPerServing: 6,
  otherIngredientsCostPerServing: 3.62, menuPrice: 16.0, monthlySales: 160,
  targetFoodCostPct: 30, targetPrice: 0.16, maxApprovedPrice: 0.20,
  evidenceSource: 'DairyCo invoice (demo)',
};

let token; // P0 (2026-11-07): every POST needs a session token.
async function post(path, body) {
  return fetch(`${base}${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Converge-Session': token },
    body: JSON.stringify(body),
  });
}

async function maxHaggleNumber() {
  const list = await (await fetch(`${base}/api/cases`)).json();
  return list.reduce((m, c) => {
    const n = /^HAG-(\d+)$/.exec(c.id || '');
    return n ? Math.max(m, Number(n[1])) : m;
  }, 0);
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

test('HAGGLE creation: valid payload creates a case with engine analysis + stub room', async () => {
  const expectedId = `HAG-${String((await maxHaggleNumber()) + 1).padStart(3, '0')}`;
  const r = await post('/api/cases', validPayload);
  assert.equal(r.status, 201);
  const c = await r.json();
  assert.equal(c.id, expectedId);
  assert.equal(c.workflow, 'HAGGLE');
  assert.equal(c.title, 'DairyCo heavy cream price rise');
  assert.equal(c.state, 'DISCUSSION');
  assert.equal(c.demo, true);
  assert.equal(c.switchRoom, '#haggle-dairyco-heavy-cream');
  assert.deepEqual(c.participants.map((p) => p.name), ['Mara (owner)', 'Negotiation Agent', 'Financial Analyst']);
  assert.deepEqual(c.proposals, []);
  assert.equal(c.pendingApproval, null);
  assert.equal(c.approval, null);
  assert.deepEqual(c.messages, []);
  assert.equal(c.evidence.length, 1);
  assert.equal(c.evidence[0].type, 'source');
  assert.equal(c.evidence[0].status, 'Unverified');
  assert.equal(c.evidence[0].source, 'DairyCo invoice (demo)');
  // P0 (2026-11-07): the audit actor is the session actor, never 'Owner'.
  assert.ok(c.audit.some((a) => a.event === 'case-created' && a.actor === 'Mara · Owner' && a.kind === 'human'));
  // Computed analysis + strategies match the deterministic engine exactly.
  const expectedAnalysis = haggleAnalysis(validPayload);
  assert.equal(c.analysis.newCreamCostPerServing, expectedAnalysis.newCreamCostPerServing);
  assert.equal(c.analysis.newCreamCostPerServing, 1.44);
  assert.equal(c.analysis.monthlyExtraCost, 76.8);
  assert.equal(c.analysis.pctChange, 50);
  assert.deepEqual(c.strategies, haggleStrategies(expectedAnalysis, validPayload));
  assert.equal(c.strategies.length, 6);
  // Stub mode: the stub room is created eagerly and its id persisted,
  // labelled SIMULATED (never presented as a real Switch room).
  assert.match(c.switchRoomId, /^room-/);
  assert.equal(c.switchRoomSimulated, true);
  assert.equal(c.roomError, undefined);
  // Persisted: a fresh read of the case shows the same room id.
  const again = await (await fetch(`${base}/api/cases/${c.id}`)).json();
  assert.equal(again.switchRoomId, c.switchRoomId);
  assert.equal(again.analysis.monthlyExtraCost, 76.8);
});

test('HAGGLE creation: sequential ids are unique and increment', async () => {
  const before = await maxHaggleNumber();
  const r1 = await post('/api/cases', { ...validPayload, supplier: 'GreenFields', ingredient: 'butter', recipe: '' });
  assert.equal(r1.status, 201);
  const c1 = await r1.json();
  const r2 = await post('/api/cases', { ...validPayload, supplier: 'GreenFields', ingredient: 'cream cheese', evidenceSource: '' });
  assert.equal(r2.status, 201);
  const c2 = await r2.json();
  assert.notEqual(c1.id, c2.id);
  assert.equal(c1.id, `HAG-${String(before + 1).padStart(3, '0')}`);
  assert.equal(c2.id, `HAG-${String(before + 2).padStart(3, '0')}`);
  assert.equal(c1.switchRoom, '#haggle-greenfields-butter');
  assert.equal(c2.switchRoom, '#haggle-greenfields-cream-cheese');
  // No evidenceSource on the second case -> empty evidence list.
  assert.deepEqual(c2.evidence, []);
});

test('HAGGLE creation: invalid inputs are rejected with a field-naming 400', async () => {
  const cases = [
    [{ ...validPayload, newPrice: undefined }, /newPrice/, 'missing newPrice'],
    [{ ...validPayload, newPrice: 'NaN' }, /newPrice/, 'NaN newPrice'],
    [{ ...validPayload, newPrice: 'Infinity' }, /newPrice/, 'Infinity newPrice'],
    [{ ...validPayload, oldPrice: -0.5 }, /oldPrice/, 'negative oldPrice'],
    [{ ...validPayload, targetPrice: 0.3, maxApprovedPrice: 0.2 }, /targetPrice/, 'targetPrice > maxApprovedPrice'],
    [{ ...validPayload, unit: 'gallon' }, /unit/, 'unsupported unit'],
    [{ ...validPayload, supplier: '' }, /supplier/, 'empty supplier'],
    [{ ...validPayload, supplier: '   ' }, /supplier/, 'blank supplier'],
    [{ ...validPayload, ingredient: '' }, /ingredient/, 'empty ingredient'],
    [{ ...validPayload, qtyPerServing: 0 }, /qtyPerServing/, 'zero qtyPerServing'],
    [{ ...validPayload, menuPrice: 'not-a-number' }, /menuPrice/, 'non-numeric menuPrice'],
    [{ ...validPayload, workflow: 'COURT' }, /only HAGGLE/, 'non-HAGGLE workflow'],
  ];
  for (const [payload, pattern, label] of cases) {
    const r = await post('/api/cases', payload);
    assert.equal(r.status, 400, `${label}: expected 400, got ${r.status}`);
    const body = await r.json();
    assert.match(body.error, pattern, `${label}: error should name the field, got: ${body.error}`);
  }
  // The unsupported-unit message lists the supported units.
  const unitErr = await (await post('/api/cases', { ...validPayload, unit: 'gallon' })).json();
  assert.match(unitErr.error, /fl oz/);
  assert.match(unitErr.error, /serving/);
});

test('HAGGLE preview: valid returns analysis + strategies, invalid 400s, nothing persists', async () => {
  const countBefore = (await (await fetch(`${base}/api/cases`)).json()).length;
  const r = await post('/api/cases/preview', validPayload);
  assert.equal(r.status, 200);
  const out = await r.json();
  const expectedAnalysis = haggleAnalysis(validPayload);
  assert.equal(out.analysis.newCreamCostPerServing, 1.44);
  assert.equal(out.analysis.monthlyExtraCost, 76.8);
  assert.deepEqual(out.strategies, haggleStrategies(expectedAnalysis, validPayload));
  const bad = await post('/api/cases/preview', { ...validPayload, unit: 'gallon' });
  assert.equal(bad.status, 400);
  assert.match((await bad.json()).error, /unit/);
  const badWorkflow = await post('/api/cases/preview', { ...validPayload, workflow: 'CORRECTION' });
  assert.equal(badWorkflow.status, 400);
  assert.match((await badWorkflow.json()).error, /only HAGGLE/);
  const countAfter = (await (await fetch(`${base}/api/cases`)).json()).length;
  assert.equal(countAfter, countBefore, 'preview must not persist any case');
});
