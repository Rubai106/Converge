// CONVERGE P0 server-core tests (2026-11-07) — the Phase Zero audit
// fixes: atomic save, session-token auth, proposal versioning + hash +
// expiry + idempotency, derived strategy prices, body cap, register
// removal, security headers/CORS/rate limiting, generic 500s,
// WITHDRAWN/EXPIRED states.
// The live tests spawn the real server on scratch ports against isolated
// scratch data (seedData() + CONVERGE_DATA_FILE), never the shared
// data/converge.json and never port 3100.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { seedData } from '../server/store.js';
import {
  haggleAnalysis, haggleStrategies, transitionCase, canTransition,
  expirePendingApproval, proposalInputHash, proposalContentHash, PROPOSAL_TTL_MS,
} from '../server/engine.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 3350;
const base = `http://127.0.0.1:${PORT}`;
const scratchDir = mkdtempSync(join(tmpdir(), 'converge-p0-core-'));
const dataFile = join(scratchDir, 'converge.json');
let child;
let token;

async function waitForServer(b) {
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch(`${b}/api/status`); if (r.ok) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('server did not start');
}
async function session(b = base) {
  const r = await fetch(`${b}/api/session`, { method: 'POST' });
  assert.equal(r.status, 200, 'session issuance must succeed');
  return (await r.json()).token;
}
function post(path, body, tok = token) {
  const headers = { 'Content-Type': 'application/json' };
  if (tok) headers['X-Converge-Session'] = tok;
  return fetch(`${base}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
}

const validPayload = {
  supplier: 'GreenFields', ingredient: 'butter', recipe: '',
  oldPrice: 0.16, newPrice: 0.24, unit: 'fl oz', qtyPerServing: 6,
  otherIngredientsCostPerServing: 3.62, menuPrice: 16.0, monthlySales: 160,
  targetFoodCostPct: 30, targetPrice: 0.16, maxApprovedPrice: 0.20,
  evidenceSource: '',
};
async function createCase(payload = validPayload) {
  const r = await post('/api/cases', payload);
  assert.equal(r.status, 201, 'case creation should succeed');
  return r.json();
}
async function submitProposal(id, proposalId) {
  let r = await post(`/api/cases/${id}/transition`, { to: 'PROPOSAL' });
  assert.equal(r.status, 200, `DISCUSSION -> PROPOSAL should succeed (got ${r.status})`);
  r = await post(`/api/cases/${id}/transition`, { to: 'AWAITING_APPROVAL', proposalId });
  assert.equal(r.status, 200, `PROPOSAL -> AWAITING_APPROVAL should succeed (got ${r.status})`);
  return r.json();
}

test.before(async () => {
  writeFileSync(dataFile, JSON.stringify(seedData()));
  child = spawn('node', ['server/server.js'], { cwd: root, env: { ...process.env, PORT: String(PORT), CONVERGE_DATA_FILE: dataFile }, stdio: 'ignore' });
  await waitForServer(base);
  token = await session();
});

test.after(() => {
  child?.kill();
  rmSync(scratchDir, { recursive: true, force: true });
});

// ---------- Atomic save (store-level, scratch file) ----------
test('p0: atomic save writes via tmp+rename, keeps 3 rotating backups, and load falls back to a backup', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'converge-atomic-'));
  const file = join(dir, 'converge.json');
  process.env.CONVERGE_DATA_FILE = file;
  // Fresh module instance so the store reads this scratch path.
  const store = await import(`../server/store.js?atomic=${Date.now()}`);
  try {
    const d = store.load();
    assert.equal(d.cases.length, 3);
    d.cases[0].title = 'mutated title';
    store.save(d);
    store.save(d);
    store.save(d);
    assert.equal(existsSync(`${file}.tmp`), false, 'no temp file is left behind');
    assert.equal(JSON.parse(readFileSync(file, 'utf8')).cases[0].title, 'mutated title');
    const backups = readdirSync(dir).filter((f) => f.startsWith('converge.json.bak.')).sort();
    assert.deepEqual(backups, ['converge.json.bak.1', 'converge.json.bak.2', 'converge.json.bak.3']);
    // Corrupt the live file: load must fall back to the newest backup.
    writeFileSync(file, '{"cases": [broken');
    const recovered = store.load();
    assert.equal(recovered.cases[0].title, 'mutated title', 'the newest backup restores the data');
    assert.equal(recovered.cases.length, 3);
    // Corrupt live + all backups: load reseeds rather than crashing.
    for (let n = 1; n <= 3; n++) writeFileSync(`${file}.bak.${n}`, 'garbage{');
    writeFileSync(file, 'garbage{');
    const reseeded = store.load();
    assert.equal(reseeded.cases.length, 3);
    assert.equal(reseeded.cases[0].id, 'HAG-014');
  } finally {
    rmSync(dir, { recursive: true, force: true });
    delete process.env.CONVERGE_DATA_FILE;
  }
});

// ---------- Session auth ----------
test('p0: POST /api/session issues a token with the human actor and a 24h expiry', async () => {
  const r = await fetch(`${base}/api/session`, { method: 'POST' });
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.ok(body.token, 'a token is issued');
  assert.deepEqual(body.actor, { name: 'Mara · Owner', kind: 'human' });
  const expiresIn = new Date(body.expiresAt).getTime() - Date.now();
  assert.ok(expiresIn > 23 * 60 * 60 * 1000 && expiresIn <= 24 * 60 * 60 * 1000, `expiry is ~24h out (got ${expiresIn}ms)`);
});

test('p0: mutating endpoints 401 without a token and with an invalid token', async () => {
  const noToken = await fetch(`${base}/api/cases`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(noToken.status, 401);
  const badToken = await post('/api/cases', {}, 'not-a-real-token');
  assert.equal(badToken.status, 401);
  // GET endpoints stay open.
  assert.equal((await fetch(`${base}/api/cases`)).status, 200);
  assert.equal((await fetch(`${base}/api/status`)).status, 200);
});

test('p0: a valid token authorises mutations; body actorKind is ignored', async () => {
  const c = await createCase();
  // The body claims to be an agent — the session actor is human, so the
  // approval must succeed and record the session actor, not the body.
  await submitProposal(c.id, 'P2');
  const r = await post(`/api/cases/${c.id}/transition`, { to: 'APPROVED', actorKind: 'agent', actor: 'Evil Agent' });
  assert.equal(r.status, 200, 'body actorKind=agent must not block a session-human approval');
  const body = await r.json();
  assert.equal(body.approval.approvedBy, 'Mara · Owner', 'the approval records the session actor');
});

// ---------- Proposal versioning + hash + expiry + idempotency ----------
test('p0: submitting a proposal creates a versioned record with a content hash; terms are canonical, never body text', async () => {
  const c = await createCase();
  const submitted = await submitProposal(c.id, 'P2');
  assert.equal(submitted.pendingApproval.proposalId, 'P2');
  assert.equal(submitted.pendingApproval.version, 1);
  assert.equal(submitted.pendingApproval.terms, '$0.18 / fl oz for 6 weeks', 'terms are derived from the strategy, not the request body');
  assert.ok(submitted.pendingApproval.contentHash, 'a content hash is bound to the pending approval');
  assert.ok(submitted.pendingApproval.requestedAt, 'a requestedAt is recorded');
  assert.equal(submitted.proposals.length, 1);
  const rec = submitted.proposals[0];
  assert.equal(rec.strategyId, 'counter-019');
  assert.equal(rec.terms, '$0.18 / fl oz for 6 weeks');
  assert.equal(rec.contentHash, submitted.pendingApproval.contentHash);
  assert.ok(rec.inputHash, 'an input hash is recorded');
  // A second submission of the same strategy is a new version.
  await post(`/api/cases/${c.id}/transition`, { to: 'REJECTED' });
  await post(`/api/cases/${c.id}/transition`, { to: 'DISCUSSION' });
  const again = await submitProposal(c.id, 'P2');
  assert.equal(again.pendingApproval.version, 2, 'a resubmission is version 2');
  assert.equal(again.proposals.length, 2);
});

test('p0: approve binds to the proposal hash — a tampered record is rejected 400 (engine level)', () => {
  const input = { ...validPayload };
  const analysis = haggleAnalysis(input);
  const strategy = haggleStrategies(analysis, input).find((s) => s.id === 'counter-019');
  const inputHash = proposalInputHash(input, strategy);
  const buildCase = () => {
    const rec = {
      id: 'P2', version: 1, strategyId: 'counter-019',
      terms: '$0.18 / fl oz for 6 weeks', inputHash,
      createdAt: new Date().toISOString(), requestedAt: new Date().toISOString(),
    };
    rec.contentHash = proposalContentHash(rec);
    return {
      state: 'AWAITING_APPROVAL', workflow: 'HAGGLE', input: { ...input },
      proposals: [rec],
      pendingApproval: { proposalId: 'P2', version: 1, contentHash: rec.contentHash, terms: rec.terms, requestedBy: 'Mara · Owner', requestedAt: rec.createdAt },
      audit: [],
    };
  };
  // Happy path: the matching record approves.
  const ok = buildCase();
  transitionCase(ok, 'APPROVED', { name: 'Mara · Owner', kind: 'human' });
  assert.equal(ok.approval.version, 1);
  assert.equal(ok.approval.contentHash, ok.proposals[0].contentHash);
  // Tampered terms: the pending hash no longer matches the record.
  const tamperedTerms = buildCase();
  tamperedTerms.proposals[0].terms = '$0.01 / fl oz for 6 weeks';
  assert.throws(() => transitionCase(tamperedTerms, 'APPROVED', { name: 'Mara · Owner', kind: 'human' }), /content hash mismatch/);
  // Tampered input hash: the record itself no longer hashes to its contentHash.
  const tamperedHash = buildCase();
  tamperedHash.proposals[0].inputHash = '0'.repeat(64);
  assert.throws(() => transitionCase(tamperedHash, 'APPROVED', { name: 'Mara · Owner', kind: 'human' }), /content hash mismatch/);
  // Changed case input after submission: the recomputed input hash differs.
  const changedInput = buildCase();
  changedInput.input.newPrice = 0.30;
  assert.throws(() => transitionCase(changedInput, 'APPROVED', { name: 'Mara · Owner', kind: 'human' }), /input changed/);
  // Missing record: the pending approval names a proposal that does not exist.
  const missing = buildCase();
  missing.proposals = [];
  assert.throws(() => transitionCase(missing, 'APPROVED', { name: 'Mara · Owner', kind: 'human' }), /No proposal record/);
});

test('p0: a stale pending proposal expires on read (EXPIRED + audit event) and cannot be approved after', async () => {
  // Fixture: a case awaiting approval with a requestedAt 8 days old.
  const dir = mkdtempSync(join(tmpdir(), 'converge-expire-'));
  const file = join(dir, 'converge.json');
  const d = seedData();
  const hag = d.cases.find((x) => x.id === 'HAG-014');
  const analysis = haggleAnalysis(hag.input);
  const strategy = haggleStrategies(analysis, hag.input).find((s) => s.id === 'counter-019');
  const old = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
  const rec = {
    id: 'P2', version: 1, strategyId: 'counter-019',
    terms: '$0.18 / fl oz for 6 weeks', inputHash: proposalInputHash(hag.input, strategy),
    createdAt: old, requestedAt: old,
  };
  rec.contentHash = proposalContentHash(rec);
  hag.proposals = [rec];
  hag.pendingApproval = { proposalId: 'P2', version: 1, contentHash: rec.contentHash, terms: rec.terms, requestedBy: 'Negotiation Agent', requestedAt: old };
  writeFileSync(file, JSON.stringify(d));
  const port = 3352;
  const b = `http://127.0.0.1:${port}`;
  const srv = spawn('node', ['server/server.js'], { cwd: root, env: { ...process.env, PORT: String(port), CONVERGE_DATA_FILE: file }, stdio: 'ignore' });
  try {
    await waitForServer(b);
    const tok = await session(b);
    const c = await (await fetch(`${b}/api/cases/HAG-014`)).json();
    assert.equal(c.state, 'EXPIRED', 'the stale proposal expires on read');
    assert.equal(c.pendingApproval, null);
    assert.ok(c.audit.some((a) => a.event === 'state:AWAITING_APPROVAL->EXPIRED' && a.reason === 'proposal-expired'), 'the expiry is audited');
    const approve = await fetch(`${b}/api/cases/HAG-014/transition`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Converge-Session': tok },
      body: JSON.stringify({ to: 'APPROVED', proposalId: 'P2', version: 1 }),
    });
    assert.equal(approve.status, 400, 'an expired case cannot be approved');
  } finally {
    srv.kill();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('p0: an expired proposal is refused by the engine even on a direct call', () => {
  const c = {
    state: 'AWAITING_APPROVAL', workflow: 'HAGGLE',
    pendingApproval: { proposalId: 'P2', terms: 'x', requestedAt: new Date(Date.now() - PROPOSAL_TTL_MS - 1000).toISOString() },
    audit: [],
  };
  assert.throws(() => transitionCase(c, 'APPROVED', { name: 'Mara · Owner', kind: 'human' }), /expired/);
  assert.equal(expirePendingApproval(c), true);
  assert.equal(c.state, 'EXPIRED');
});

test('p0: a retried approve after success returns the existing approval (200), not 400', async () => {
  const c = await createCase();
  await submitProposal(c.id, 'P2');
  const first = await post(`/api/cases/${c.id}/transition`, { to: 'APPROVED', proposalId: 'P2', version: 1 });
  assert.equal(first.status, 200);
  const replay = await post(`/api/cases/${c.id}/transition`, { to: 'APPROVED', proposalId: 'P2', version: 1 });
  assert.equal(replay.status, 200, 'a retried approve is idempotent');
  const body = await replay.json();
  assert.equal(body.approval.proposalId, 'P2');
  assert.equal(body.approval.version, 1);
  assert.equal(body.state, 'APPROVED');
  // A replay naming a different proposal is not the same approval.
  const wrong = await post(`/api/cases/${c.id}/transition`, { to: 'APPROVED', proposalId: 'P1', version: 1 });
  assert.equal(wrong.status, 400);
});

// ---------- Derived strategies ----------
test('p0: strategies are derived from the case input — a $4.00/kg case gets meaningful prices in kg', async () => {
  const kg = {
    supplier: 'dc', ingredient: 'hc', recipe: 'al',
    oldPrice: 4, newPrice: 5, unit: 'kg', qtyPerServing: 5,
    otherIngredientsCostPerServing: 5, menuPrice: 5, monthlySales: 5,
    targetFoodCostPct: 30, targetPrice: 4, maxApprovedPrice: 5, evidenceSource: '',
  };
  const created = await createCase(kg);
  const byId = Object.fromEntries(created.strategies.map((s) => [s.id, s]));
  assert.equal(byId['counter-019'].unitPrice, 4.5, 'counter is the midpoint of target 4 and max-approved 5');
  assert.equal(byId['volume-021'].unitPrice, 4.5, 'volume is a 10% discount on the new price 5');
  assert.equal(byId['alternative-018'].unitPrice, 3.75, 'alternative is 25% below the new price 5');
  assert.equal(byId.gradual.unitPrice, 5, 'gradual lands at the max-approved ceiling');
  assert.equal(byId.freeze.unitPrice, 4);
  assert.equal(byId.substitute.unitPrice, 4);
  for (const s of created.strategies) {
    assert.equal(s.unit, 'kg', `${s.id} carries the case unit`);
    assert.ok(s.duration, `${s.id} carries a duration`);
    assert.ok(!/0\.19|0\.21|0\.18/.test(s.name), `${s.id} name must not carry a seed price`);
  }
  // The engine-level derivation matches the live payload.
  const engine = haggleStrategies(haggleAnalysis(kg), kg);
  assert.deepEqual(engine.map((s) => s.unitPrice), created.strategies.map((s) => s.unitPrice));
});

test('p0: the seed case derives counter 0.18 (midpoint of 0.16 and 0.20) and the recommendation is computed, not hardcoded', () => {
  const analysis = haggleAnalysis(validPayload);
  const s = haggleStrategies(analysis, validPayload);
  const counter = s.find((x) => x.id === 'counter-019');
  assert.equal(counter.unitPrice, 0.18);
  assert.equal(counter.creamCostPerServing, 1.08);
  assert.equal(counter.foodCostPct, 29.38);
  assert.equal(counter.savingVsNewPerMonth, 57.6);
  assert.match(counter.recommendation, /Food cost 29\.38% vs the 30% target — within target/);
  const volume = s.find((x) => x.id === 'volume-021');
  assert.equal(volume.unitPrice, 0.216);
  assert.match(volume.recommendation, /above target/);
  assert.ok(!s.some((x) => x.recommendation.includes('stays under the 30% food-cost target')), 'no hardcoded target text remains');
});

// ---------- Body cap + malformed JSON ----------
test('p0: malformed JSON is a 400 (not a 500) and an over-cap body is a 413', async () => {
  const bad = await fetch(`${base}/api/cases`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Converge-Session': token }, body: '{not json',
  });
  assert.equal(bad.status, 400);
  const big = await fetch(`${base}/api/cases`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Converge-Session': token },
    body: JSON.stringify({ x: 'y'.repeat(1024 * 1024 + 100) }),
  });
  assert.equal(big.status, 413);
});

// ---------- Register endpoint removed ----------
test('p0: /api/switch/register is gone (404)', async () => {
  const r = await post('/api/switch/register', { name: 'x', registrationKey: 'x' });
  assert.equal(r.status, 404);
});

// ---------- Security headers + CORS + rate limiting ----------
test('p0: security headers on every response; CSP on the served HTML', async () => {
  const api = await fetch(`${base}/api/status`);
  assert.equal(api.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(api.headers.get('x-frame-options'), 'DENY');
  const html = await fetch(`${base}/`);
  assert.ok((html.headers.get('content-security-policy') || '').includes("default-src 'self'"), 'the app HTML carries a CSP');
  assert.ok((html.headers.get('content-security-policy') || '').includes("script-src 'self'"), 'the CSP allows only self scripts');
});

test('p0: same-origin CORS — preflight succeeds for this origin, cross-origin POST is refused', async () => {
  const preflight = await fetch(`${base}/api/cases`, {
    method: 'OPTIONS',
    headers: { Origin: base, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'X-Converge-Session' },
  });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), base);
  assert.ok((preflight.headers.get('access-control-allow-headers') || '').includes('X-Converge-Session'));
  const cross = await fetch(`${base}/api/cases`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Converge-Session': token, Origin: 'https://evil.example' }, body: '{}',
  });
  assert.equal(cross.status, 403);
});

test('p0: session issuance is rate-limited to 5 per minute per IP (dedicated server)', async () => {
  const port = 3351;
  const b = `http://127.0.0.1:${port}`;
  const dir = mkdtempSync(join(tmpdir(), 'converge-ratelimit-'));
  const file = join(dir, 'converge.json');
  writeFileSync(file, JSON.stringify(seedData()));
  const srv = spawn('node', ['server/server.js'], { cwd: root, env: { ...process.env, PORT: String(port), CONVERGE_DATA_FILE: file }, stdio: 'ignore' });
  try {
    await waitForServer(b);
    const statuses = [];
    for (let i = 0; i < 6; i++) {
      statuses.push((await fetch(`${b}/api/session`, { method: 'POST' })).status);
    }
    assert.deepEqual(statuses.slice(0, 5), [200, 200, 200, 200, 200], 'the first five issuances succeed');
    assert.equal(statuses[5], 429, 'the sixth issuance inside a minute is rate-limited');
  } finally {
    srv.kill();
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------- Generic 500 ----------
test('p0: an unexpected server failure is a generic 500 that leaks no internals', async () => {
  // Fixture: a HAGGLE case whose stored input is invalid, so the detail
  // endpoint throws inside haggleAnalysis (no handler catches it).
  const dir = mkdtempSync(join(tmpdir(), 'converge-500-'));
  const file = join(dir, 'converge.json');
  const d = seedData();
  const hag = d.cases.find((x) => x.id === 'HAG-014');
  hag.input.newPrice = 'not-a-number';
  hag.state = 'DISCUSSION';
  hag.pendingApproval = null;
  writeFileSync(file, JSON.stringify(d));
  const port = 3353;
  const b = `http://127.0.0.1:${port}`;
  const srv = spawn('node', ['server/server.js'], { cwd: root, env: { ...process.env, PORT: String(port), CONVERGE_DATA_FILE: file }, stdio: 'ignore' });
  try {
    await waitForServer(b);
    const r = await fetch(`${b}/api/cases/HAG-014`);
    assert.equal(r.status, 500);
    const body = await r.json();
    assert.deepEqual(body, { error: 'internal error' });
    assert.ok(!JSON.stringify(body).includes('Invalid HAGGLE'), 'the internal detail must not leak to the client');
  } finally {
    srv.kill();
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------- WITHDRAWN / EXPIRED ----------
test('p0: AWAITING_APPROVAL can move to WITHDRAWN, and the pending proposal is cleared', async () => {
  const c = await createCase();
  await submitProposal(c.id, 'P1');
  const r = await post(`/api/cases/${c.id}/transition`, { to: 'WITHDRAWN' });
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.state, 'WITHDRAWN');
  assert.equal(body.pendingApproval, null);
  assert.ok(body.audit.some((a) => a.event === 'state:AWAITING_APPROVAL->WITHDRAWN'));
  // WITHDRAWN is terminal.
  assert.equal(canTransition('WITHDRAWN', 'DISCUSSION'), false);
  assert.equal(canTransition('EXPIRED', 'DISCUSSION'), false);
  assert.equal(canTransition('AWAITING_APPROVAL', 'WITHDRAWN'), true);
  assert.equal(canTransition('AWAITING_APPROVAL', 'EXPIRED'), true);
  // The existing eleven states are untouched.
  assert.equal(canTransition('DRAFT', 'INTAKE'), true);
  assert.equal(canTransition('AWAITING_APPROVAL', 'APPROVED'), true);
});
