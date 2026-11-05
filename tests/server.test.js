// CONVERGE server tests — persistence of COURT ratings and CORRECTION claim statuses.
// Spawns the real server on a test port, backs up data/converge.json first,
// restores it afterwards, so the demo data is left pristine.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dataFile = join(root, 'data', 'converge.json');
const PORT = 3199;
const base = `http://localhost:${PORT}`;

let child;
let backup = null;
let hadData = false;

async function waitForServer() {
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch(`${base}/api/status`); if (r.ok) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('server did not start');
}

test.before(async () => {
  hadData = existsSync(dataFile);
  if (hadData) backup = readFileSync(dataFile, 'utf8');
  child = spawn('node', ['server/server.js'], { cwd: root, env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
  await waitForServer();
});

test.after(() => {
  child?.kill();
  if (hadData) writeFileSync(dataFile, backup);
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
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ caseId: 'CRT-007', reader: 'Reader A', sampleCode: 'S1', scores: { taste: 5, texture: 5, aroma: 5, appearance: 5, difficulty: 5, overall: 5 } }),
  });
  assert.equal(dup.status, 409);
  const bad = await fetch(`${base}/api/court/rate`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ caseId: 'CRT-007', reader: 'Reader A', sampleCode: 'S1', scores: { taste: 9, texture: 5, aroma: 5, appearance: 5, difficulty: 5, overall: 5 } }),
  });
  assert.equal(bad.status, 400);
});

test('CORRECTION: claim status persists across reads and is audited', async () => {
  const r = await fetch(`${base}/api/correction/claim`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ caseId: 'COR-003', id: 'C1', status: 'Corrected', actor: 'Host', actorKind: 'human' }),
  });
  assert.equal(r.status, 200);
  const c = await (await fetch(`${base}/api/cases/COR-003`)).json();
  assert.equal(c.claims.find((x) => x.id === 'C1').status, 'Corrected');
  assert.ok(c.audit.some((a) => a.event === 'claim-status' && a.claim === 'C1' && a.status === 'Corrected'));
  // Agent may not change a claim status.
  const agent = await fetch(`${base}/api/correction/claim`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ caseId: 'COR-003', id: 'C2', status: 'Verified', actor: 'Verification Agent', actorKind: 'agent' }),
  });
  assert.equal(agent.status, 400);
});

test('CORRECTION: guest challenge with evidence persists on the claim', async () => {
  const r = await fetch(`${base}/api/correction/claim`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ caseId: 'COR-003', id: 'C2', status: 'Disputed', actor: 'Dr Amara Osei (guest)', actorKind: 'human', challenge: { text: 'Paper says 38%', evidence: 'E2' } }),
  });
  assert.equal(r.status, 200);
  const c = await (await fetch(`${base}/api/cases/COR-003`)).json();
  const cl = c.claims.find((x) => x.id === 'C2');
  assert.equal(cl.status, 'Disputed');
  assert.equal(cl.guestChallenge.text, 'Paper says 38%');
  assert.equal(cl.guestChallenge.evidence, 'E2');
});
