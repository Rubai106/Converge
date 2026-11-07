// CONVERGE server tests — persistence of COURT ratings and CORRECTION claim statuses.
// Spawns the real server on a test port against a SCRATCH data file
// (isolated seed data in a temp dir), never the shared data/converge.json
// — which is gitignored and absent after a fresh clone. The scratch
// case CRT-TEST is injected into the seed data before the server starts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { seedData } from '../server/store.js';
import { extractClaims } from '../server/engine.js';
import { nextHaggleId } from '../server/server.js';

// §31.2: claim ids are stable content-derived ids (C-<8 hex>), not
// positional C1/C2/C3. The seed transcript's claims, in order, with
// their legacy positional ids for the backward-compat check.
const SEED_COR_TRANSCRIPT = seedData().cases.find((x) => x.id === 'COR-003').transcript;
const SEED_CLAIMS = extractClaims(SEED_COR_TRANSCRIPT);
const claimId = (legacyId) => SEED_CLAIMS.find((cl) => cl.legacyId === legacyId).id;

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const scratchDir = mkdtempSync(join(tmpdir(), 'converge-server-'));
const dataFile = join(scratchDir, 'converge.json');
const PORT = 3199;
const base = `http://localhost:${PORT}`;

let child;
let token; // P0 (2026-11-07): every POST needs a session token.

async function waitForServer() {
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch(`${base}/api/status`); if (r.ok) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('server did not start');
}

test.before(async () => {
  // Inject a scratch incomplete COURT case (CRT-TEST: a clone of CRT-007
  // with only 4 of 9 ratings) into the isolated seed data, so the
  // blindness tests have a live incomplete case.
  const d = seedData();
  const seed = d.cases.find((x) => x.id === 'CRT-007');
  const clone = JSON.parse(JSON.stringify(seed));
  clone.id = 'CRT-TEST';
  clone.title = 'Scratch blind test — do not ship';
  clone.ratings = clone.ratings.slice(0, 4); // A/B/C on S1, A on S2
  d.cases.push(clone);
  writeFileSync(dataFile, JSON.stringify(d, null, 2));
  child = spawn('node', ['server/server.js'], { cwd: root, env: { ...process.env, PORT: String(PORT), CONVERGE_DATA_FILE: dataFile }, stdio: 'ignore' });
  await waitForServer();
  token = (await (await fetch(`${base}/api/session`, { method: 'POST' })).json()).token;
});

test.after(() => {
  child?.kill();
  rmSync(scratchDir, { recursive: true, force: true });
});

test('COURT: seeded ratings are complete and the tally matches the seed', async () => {
  const c = await (await fetch(`${base}/api/cases/CRT-007`)).json();
  assert.equal(c.ratings.length, 9);
  assert.equal(c.ratingsExpected, 9);
  assert.equal(c.ratingsComplete, true);
  assert.ok(c.tally);
  // S1 overall: (5+4+5)/3 = 4.67
  assert.equal(c.tally.S1.means.overall, 4.67);
  assert.equal(c.tally.S3.means.overall, 3.33);
});

test('COURT: duplicate rating is rejected, invalid score is rejected', async () => {
  const dup = await fetch(`${base}/api/court/rate`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Converge-Session': token },
    body: JSON.stringify({ caseId: 'CRT-007', reader: 'Reader A', sampleCode: 'S1', scores: { taste: 5, texture: 5, aroma: 5, appearance: 5, difficulty: 5, overall: 5 } }),
  });
  assert.equal(dup.status, 409);
  const bad = await fetch(`${base}/api/court/rate`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Converge-Session': token },
    body: JSON.stringify({ caseId: 'CRT-007', reader: 'Reader A', sampleCode: 'S1', scores: { taste: 9, texture: 5, aroma: 5, appearance: 5, difficulty: 5, overall: 5 } }),
  });
  assert.equal(bad.status, 400);
});

// Hardening 2026-11-06: the sample→version mapping is blind information.
// The UI used to hide it, but GET /api/cases and /api/cases/:id shipped
// it in JSON, so any client could read S1=card / S2=auntie / S3=cousin
// before the ratings were complete. Both endpoints must now return
// code-only samples until the ratings are complete.
test('COURT: incomplete case withholds the mapping in detail and list', async () => {
  const c = await (await fetch(`${base}/api/cases/CRT-TEST`)).json();
  assert.equal(c.ratings.length, 4);
  assert.equal(c.ratingsExpected, 9);
  assert.equal(c.ratingsComplete, false);
  assert.equal(c.tally, null);
  assert.equal(c.samples.length, 3);
  for (const s of c.samples) {
    assert.ok(s.code);
    assert.equal(s.version, undefined, `incomplete case must not leak the mapping for ${s.code}`);
  }
  // The versions themselves stay visible (the comparison matrix is an
  // analysis view); only the link from code to version is withheld.
  assert.equal(c.versions.length, 3);
  const list = await (await fetch(`${base}/api/cases`)).json();
  const listed = list.find((x) => x.id === 'CRT-TEST');
  assert.ok(listed);
  for (const s of listed.samples) assert.equal(s.version, undefined);
});

test('COURT: /api/court/tally is case-bound and cannot bypass completeness', async () => {
  // Caller-supplied ratings must be ignored: even a complete-looking
  // fabricated set must not produce a tally for an incomplete case.
  const fake = Array.from({ length: 9 }, (_, i) => ({
    reader: `Reader ${'ABC'[i % 3]}`, sampleCode: `S${(i % 3) + 1}`,
    scores: { taste: 5, texture: 5, aroma: 5, appearance: 5, difficulty: 5, overall: 5 },
  }));
  const bypass = await (await fetch(`${base}/api/court/tally`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Converge-Session': token },
    body: JSON.stringify({ caseId: 'CRT-TEST', ratings: fake }),
  })).json();
  assert.equal(bypass.tally, null);
  assert.equal(bypass.complete, false);
  assert.equal(bypass.submitted, 4);
  assert.equal(bypass.expected, 9);
  // The complete case still returns its real tally from stored ratings.
  const done = await (await fetch(`${base}/api/court/tally`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Converge-Session': token },
    body: JSON.stringify({ caseId: 'CRT-007' }),
  })).json();
  assert.equal(done.complete, true);
  assert.equal(done.tally.S1.means.overall, 4.67);
  assert.equal(done.tally.S3.means.overall, 3.33);
  // Unknown or non-COURT cases are rejected.
  assert.equal((await fetch(`${base}/api/court/tally`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Converge-Session': token }, body: JSON.stringify({}) })).status, 404);
  assert.equal((await fetch(`${base}/api/court/tally`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Converge-Session': token }, body: JSON.stringify({ caseId: 'HAG-014' }) })).status, 404);
});

test('COURT: completing the ratings reveals the mapping and the tally', async () => {
  // Submit the 5 remaining ratings with the seed's exact scores.
  const remaining = [
    { reader: 'Reader B', sampleCode: 'S2', scores: { taste: 4, texture: 3, aroma: 4, appearance: 3, difficulty: 4, overall: 4 } },
    { reader: 'Reader C', sampleCode: 'S2', scores: { taste: 5, texture: 4, aroma: 5, appearance: 4, difficulty: 3, overall: 5 } },
    { reader: 'Reader A', sampleCode: 'S3', scores: { taste: 3, texture: 3, aroma: 4, appearance: 3, difficulty: 5, overall: 3 } },
    { reader: 'Reader B', sampleCode: 'S3', scores: { taste: 4, texture: 3, aroma: 3, appearance: 4, difficulty: 5, overall: 4 } },
    { reader: 'Reader C', sampleCode: 'S3', scores: { taste: 3, texture: 4, aroma: 3, appearance: 3, difficulty: 4, overall: 3 } },
  ];
  for (let i = 0; i < remaining.length; i++) {
    const r = await (await fetch(`${base}/api/court/rate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Converge-Session': token },
      body: JSON.stringify({ caseId: 'CRT-TEST', ...remaining[i] }),
    })).json();
    assert.equal(r.submitted, 5 + i);
    if (i < remaining.length - 1) assert.equal(r.tally, null, 'tally stays hidden until the last rating');
    else { assert.equal(r.complete, true); assert.equal(r.tally.S1.means.overall, 4.67); }
  }
  const c = await (await fetch(`${base}/api/cases/CRT-TEST`)).json();
  assert.equal(c.ratingsComplete, true);
  assert.equal(c.tally.S1.means.overall, 4.67);
  assert.equal(c.tally.S3.means.overall, 3.33);
  assert.equal(c.samples.find((s) => s.code === 'S1').version, 'card');
  assert.equal(c.samples.find((s) => s.code === 'S2').version, 'auntie');
  assert.equal(c.samples.find((s) => s.code === 'S3').version, 'cousin');
});

test('CORRECTION: claim status persists across reads and is audited', async () => {
  const r = await fetch(`${base}/api/correction/claim`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Converge-Session': token },
    body: JSON.stringify({ caseId: 'COR-003', id: claimId('C1'), status: 'Corrected', actor: 'Host', actorKind: 'human' }),
  });
  assert.equal(r.status, 200);
  const c = await (await fetch(`${base}/api/cases/COR-003`)).json();
  assert.equal(c.claims.find((x) => x.id === claimId('C1')).status, 'Corrected');
  assert.ok(c.audit.some((a) => a.event === 'claim-status' && a.claim === claimId('C1') && a.status === 'Corrected'));
  // P0 (2026-11-07): the actor comes from the session, never the body.
  // No token: 401, and the claim is untouched.
  const noToken = await fetch(`${base}/api/correction/claim`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ caseId: 'COR-003', id: claimId('C2'), status: 'Verified' }),
  });
  assert.equal(noToken.status, 401);
  let after = await (await fetch(`${base}/api/cases/COR-003`)).json();
  assert.equal(after.claims.find((x) => x.id === claimId('C2')).status, 'Unresolved');
  // A body that claims actorKind 'agent' is ignored: the session actor
  // is human, so the change succeeds and records the session actor.
  const agentBody = await fetch(`${base}/api/correction/claim`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Converge-Session': token },
    body: JSON.stringify({ caseId: 'COR-003', id: claimId('C2'), status: 'Verified', actor: 'Verification Agent', actorKind: 'agent' }),
  });
  assert.equal(agentBody.status, 200);
  after = await (await fetch(`${base}/api/cases/COR-003`)).json();
  assert.equal(after.claims.find((x) => x.id === claimId('C2')).status, 'Verified');
});

test('CORRECTION: the legacy positional id is still accepted (backward compat)', async () => {
  // Old clients (and old audit references) send C1/C2/C3; the endpoint
  // resolves them to the same stable claim and stores under the stable id.
  const r = await fetch(`${base}/api/correction/claim`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Converge-Session': token },
    body: JSON.stringify({ caseId: 'COR-003', id: 'C1', status: 'Clarified' }),
  });
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.id, claimId('C1'));
  assert.equal(body.status, 'Clarified');
  const c = await (await fetch(`${base}/api/cases/COR-003`)).json();
  assert.equal(c.claims.find((x) => x.id === claimId('C1')).status, 'Clarified');
});

test('CORRECTION: guest challenge with evidence persists on the claim', async () => {
  const r = await fetch(`${base}/api/correction/claim`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Converge-Session': token },
    body: JSON.stringify({ caseId: 'COR-003', id: claimId('C2'), status: 'Disputed', actor: 'Dr Amara Osei (guest)', actorKind: 'human', challenge: { text: 'Paper says 38%', evidence: 'E2' } }),
  });
  assert.equal(r.status, 200);
  const c = await (await fetch(`${base}/api/cases/COR-003`)).json();
  const cl = c.claims.find((x) => x.id === claimId('C2'));
  assert.equal(cl.status, 'Disputed');
  assert.equal(cl.guestChallenge.text, 'Paper says 38%');
  assert.equal(cl.guestChallenge.evidence, 'E2');
  // Integration (2026-11-07): the challenge is submitted AS the episode
  // guest — its attribution is the guest participant on the case, not
  // the session actor operating the UI.
  assert.equal(cl.guestChallenge.by, 'Dr Amara Osei (guest)');
});

// ---------- nextHaggleId (L1/L3: no Date.now() fallback) ----------

test('nextHaggleId: padded sequence; no HAG ids gives HAG-001, never a timestamp id', () => {
  assert.equal(nextHaggleId({ cases: [] }), 'HAG-001');
  assert.equal(nextHaggleId({ cases: [{ id: 'CRT-007' }, { id: 'COR-003' }] }), 'HAG-001');
  assert.equal(nextHaggleId({ cases: [{ id: 'HAG-014' }] }), 'HAG-015');
  assert.equal(nextHaggleId({ cases: [{ id: 'HAG-014' }, { id: 'HAG-015' }] }), 'HAG-016');
  // A taken id is skipped, never duplicated.
  assert.equal(nextHaggleId({ cases: [{ id: 'HAG-001' }, { id: 'HAG-002' }] }), 'HAG-003');
  // Non-HAG ids do not affect the sequence.
  assert.equal(nextHaggleId({ cases: [{ id: 'HAG-009' }, { id: 'CRT-007' }] }), 'HAG-010');
  // The id is always the padded HAG-NNN form.
  assert.match(nextHaggleId({ cases: [] }), /^HAG-\d{3}$/);
});
