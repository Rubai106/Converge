// CONVERGE security tests (§31.3, 2026-11-07) — CSRF Origin check,
// explicit CORS policy, session revocation, cross-case isolation,
// orphaned-claim reporting, and error-leakage checks. Spawns the real
// server on a scratch port against isolated scratch data (seedData() +
// CONVERGE_DATA_FILE), never the shared data/converge.json and never
// port 3100.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { seedData } from '../server/store.js';
import { sanitizePublicError, revokeSession } from '../server/security.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const scratchDir = mkdtempSync(join(tmpdir(), 'converge-security-'));
const dataFile = join(scratchDir, 'converge.json');
const PORT = 3399;
const base = `http://127.0.0.1:${PORT}`;
const ALLOWED_ORIGIN = `http://127.0.0.1:${PORT}`;
const EVIL_ORIGIN = 'http://evil.example';

let child;
let token;

async function waitForServer() {
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch(`${base}/api/status`); if (r.ok) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('server did not start');
}

test.before(async () => {
  // Inject a scratch CORRECTION case whose stored status key matches
  // NO current claim (an orphaned pre-edit status), so the orphaned
  // reporting path has a live fixture.
  const d = seedData();
  const cor = JSON.parse(JSON.stringify(d.cases.find((x) => x.id === 'COR-003')));
  cor.id = 'COR-TEST';
  cor.title = 'Scratch orphan test — do not ship';
  cor.claimStatuses = { 'C-deadbeef': 'Verified' };
  cor.claimChallenges = {};
  d.cases.push(cor);
  writeFileSync(dataFile, JSON.stringify(d, null, 2));
  child = spawn('node', ['server/server.js'], { cwd: root, env: { ...process.env, PORT: String(PORT), CONVERGE_DATA_FILE: dataFile }, stdio: 'ignore' });
  await waitForServer();
  token = (await (await fetch(`${base}/api/session`, { method: 'POST' })).json()).token;
});

test.after(() => {
  child?.kill();
  rmSync(scratchDir, { recursive: true, force: true });
});

function post(path, body, tok = token, origin = undefined) {
  const headers = { 'Content-Type': 'application/json' };
  if (tok) headers['X-Converge-Session'] = tok;
  if (origin) headers.Origin = origin;
  return fetch(`${base}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
}

// ---------- CSRF: Origin check on mutating POSTs (§31.3) ----------
// The client sends the session token as a header, not a cookie, so
// classic cookie-CSRF does not directly apply — but a cross-origin
// page that somehow holds a token must still be refused. The server
// already had this check (P0); these tests pin it.

test('CSRF: a cross-origin POST carrying a valid token is refused (403)', async () => {
  const r = await post('/api/court/tally', { caseId: 'CRT-007' }, token, EVIL_ORIGIN);
  assert.equal(r.status, 403);
  assert.match((await r.json()).error, /Cross-origin/);
});

test('CSRF: the same POST without an Origin (curl / server-to-server) proceeds', async () => {
  const r = await post('/api/court/tally', { caseId: 'CRT-007' }, token);
  assert.equal(r.status, 200);
});

test('CSRF: the same POST from the app origin proceeds', async () => {
  const r = await post('/api/court/tally', { caseId: 'CRT-007' }, token, ALLOWED_ORIGIN);
  assert.equal(r.status, 200);
});

test('CSRF: a cross-origin POST without a token is refused before auth (403, not 401)', async () => {
  const r = await post('/api/court/tally', { caseId: 'CRT-007' }, null, EVIL_ORIGIN);
  assert.equal(r.status, 403);
});

// ---------- CORS: explicit policy (§31.3) ----------

test('CORS: an allowed origin gets an Access-Control-Allow-Origin header', async () => {
  const r = await fetch(`${base}/api/status`, { headers: { Origin: ALLOWED_ORIGIN } });
  assert.equal(r.headers.get('access-control-allow-origin'), ALLOWED_ORIGIN);
});

test('CORS: a disallowed origin gets no Access-Control-Allow-Origin header (no wildcard)', async () => {
  const r = await fetch(`${base}/api/status`, { headers: { Origin: EVIL_ORIGIN } });
  assert.equal(r.headers.get('access-control-allow-origin'), null);
});

test('CORS: preflight from an allowed origin is answered 204 with the session header allowed', async () => {
  const r = await fetch(`${base}/api/cases`, {
    method: 'OPTIONS',
    headers: { Origin: ALLOWED_ORIGIN, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'X-Converge-Session' },
  });
  assert.equal(r.status, 204);
  assert.match(r.headers.get('access-control-allow-headers') || '', /X-Converge-Session/);
});

// ---------- Session revocation (§31.3) ----------

test('session revoke: a revoked token gets 401 on the next mutation', async () => {
  // Issue a second token (the first stays valid for the other tests).
  const second = (await (await fetch(`${base}/api/session`, { method: 'POST' })).json()).token;
  assert.notEqual(second, token);
  const revoke = await post('/api/session/revoke', {}, second);
  assert.equal(revoke.status, 200);
  assert.deepEqual(await revoke.json(), { revoked: true });
  const after = await post('/api/court/tally', { caseId: 'CRT-007' }, second);
  assert.equal(after.status, 401);
  // The first token is unaffected.
  const stillGood = await post('/api/court/tally', { caseId: 'CRT-007' }, token);
  assert.equal(stillGood.status, 200);
});

test('session revoke: revoking without a valid token is 401 (the gate runs first)', async () => {
  const r = await post('/api/session/revoke', {}, 'not-a-real-token');
  assert.equal(r.status, 401);
});

test('session revoke: revokeSession() unit behaviour', () => {
  const sessions = new Map([['t1', { actor: { name: 'Mara · Owner', kind: 'human' }, expiresAt: '2099-01-01T00:00:00.000Z' }]]);
  assert.equal(revokeSession(sessions, 't1'), true);
  assert.equal(sessions.has('t1'), false);
  assert.equal(revokeSession(sessions, 't1'), false); // already gone
  assert.equal(revokeSession(sessions, null), false);
  assert.equal(revokeSession(sessions, 42), false);
});

// ---------- Cross-case data isolation (§31.3) ----------

test('isolation: a CORRECTION claim id cannot touch another case', async () => {
  // HAG-014 is not a CORRECTION case and has no transcript — a claim
  // id from COR-003 must not resolve against it.
  const r = await post('/api/correction/claim', { caseId: 'HAG-014', id: 'C1', status: 'Verified' }, token);
  assert.equal(r.status, 404);
  // And the HAG-014 record is unchanged by the attempt (the scratch
  // seed has it AWAITING_APPROVAL with no approval yet).
  const hag = await (await fetch(`${base}/api/cases/HAG-014`)).json();
  assert.equal(hag.state, 'AWAITING_APPROVAL');
  assert.equal(hag.approval, null);
  assert.equal(hag.pendingApproval?.proposalId, 'P2');
});

test('isolation: a claim status change on COR-003 does not alter HAG-014 or CRT-007', async () => {
  const before = await (await fetch(`${base}/api/cases/HAG-014`)).json();
  const claims = (await (await fetch(`${base}/api/cases/COR-003`)).json()).claims;
  const r = await post('/api/correction/claim', { caseId: 'COR-003', id: claims[0].id, status: 'Verified' }, token);
  assert.equal(r.status, 200);
  const after = await (await fetch(`${base}/api/cases/HAG-014`)).json();
  assert.deepEqual(after.audit, before.audit);
  assert.deepEqual(after.messages, before.messages);
});

// ---------- Orphaned claim reporting (§31.2, endpoint level) ----------

test('orphaned: a stored status whose claim no longer exists is flagged, not dropped', async () => {
  const c = await (await fetch(`${base}/api/cases/COR-TEST`)).json();
  assert.deepEqual(c.orphanedClaimStatuses, { 'C-deadbeef': 'Verified' });
  // The orphaned status is NOT applied to any current claim.
  assert.ok(c.claims.every((cl) => cl.status === 'Unresolved'));
  // Posting that old id reports it as orphaned instead of 404-without-context.
  const r = await post('/api/correction/claim', { caseId: 'COR-TEST', id: 'C-deadbeef', status: 'Corrected' }, token);
  assert.equal(r.status, 404);
  const body = await r.json();
  assert.equal(body.orphaned, true);
  assert.equal(body.storedStatus, 'Verified');
});

// ---------- Error leakage (§31.3) ----------

test('errors: a 404 carries no internal detail (no path, no stack)', async () => {
  const r = await fetch(`${base}/api/cases/NOPE`);
  assert.equal(r.status, 404);
  const body = await r.json();
  assert.equal(body.error, 'case not found');
  assert.doesNotMatch(JSON.stringify(body), /stack|node:|converge\.json|\/home\//);
});

test('errors: malformed JSON is a 400, not a 500, with no internals', async () => {
  const r = await fetch(`${base}/api/court/tally`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Converge-Session': token },
    body: '{not json',
  });
  assert.equal(r.status, 400);
  assert.match((await r.json()).error, /valid JSON/);
});

test('errors: sanitizePublicError returns validation messages but never internals', () => {
  const httpErr = new Error('Request body is too large (max 1 MB).');
  httpErr.statusCode = 413;
  assert.equal(sanitizePublicError(httpErr), 'Request body is too large (max 1 MB).');
  assert.equal(sanitizePublicError(new Error('connect ECONNREFUSED 127.0.0.1:8000')), 'internal error');
  assert.equal(sanitizePublicError(new Error('at Server.<anonymous> (server.js:1:1)')), 'internal error');
  assert.equal(sanitizePublicError(null), 'internal error');
  assert.equal(sanitizePublicError('a string, not an error'), 'internal error');
});

// ---------- No uploads exist (file-upload validation is N/A) ----------

test('uploads: the app has no file-upload surface', async () => {
  // Static check on the shipped client + server: no file input, no
  // multipart handling, no upload endpoint. Recorded as N/A in
  // docs/SECURITY.md — validation is not built for a feature that
  // does not exist.
  const { readFileSync } = await import('node:fs');
  const html = readFileSync(join(root, 'app', 'index.html'), 'utf8');
  const appJs = readFileSync(join(root, 'app', 'app.js'), 'utf8');
  const serverJs = readFileSync(join(root, 'server', 'server.js'), 'utf8');
  assert.doesNotMatch(html, /type="file"/);
  assert.doesNotMatch(appJs, /type="file"|FormData|multipart/);
  assert.doesNotMatch(serverJs, /multipart|form-data|upload/);
});
