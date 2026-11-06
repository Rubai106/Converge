// CONVERGE remediation tests — COURT + CORRECTION (H11/H12, M13-M16, L6-L10).
// Server tests spawn the real server on a scratch data file
// (CONVERGE_DATA_FILE) so the shared demo data is never touched.
// Static client tests extract the shipped pure helpers from app/app.js
// (same pattern as tests/escaping.test.js) and assert the render paths
// contain the remediation affordances.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { seedData } from '../server/store.js';
import { adoptCanonical } from '../server/engine.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'app', 'app.js'), 'utf8');
const PORT = 3198;
const base = `http://localhost:${PORT}`;

// ---------- scratch data ----------
// CRT-007 (complete, 9/9) + CRT-QA (4/9, the qa-seed shape) +
// CRT-NEW (zero ratings — the only case a version may be added to).
const tmpDir = mkdtempSync(join(tmpdir(), 'converge-court-'));
const dataFile = join(tmpDir, 'converge.json');
const d = seedData();
const clone = (id, ratings) => {
  const c = JSON.parse(JSON.stringify(d.cases.find((x) => x.id === 'CRT-007')));
  c.id = id;
  c.ratings = ratings;
  c.audit = [];
  c.messages = [];
  return c;
};
const qa = clone('CRT-QA', []);
qa.ratings = JSON.parse(JSON.stringify(d.cases.find((x) => x.id === 'CRT-007').ratings)).slice(0, 4);
d.cases.push(qa);
const fresh = clone('CRT-NEW', []);
d.cases.push(fresh);
writeFileSync(dataFile, JSON.stringify(d, null, 2));

let child;
let token; // P0 (2026-11-07): every POST needs a session token.
async function waitForServer() {
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch(`${base}/api/status`); if (r.ok) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('server did not start');
}
const post = (path, body) => fetch(`${base}${path}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Converge-Session': token }, body: JSON.stringify(body),
});

test.before(async () => {
  child = spawn('node', ['server/server.js'], {
    cwd: root,
    env: { ...process.env, PORT: String(PORT), CONVERGE_DATA_FILE: dataFile },
    stdio: 'ignore',
  });
  await waitForServer();
  token = (await (await fetch(`${base}/api/session`, { method: 'POST' })).json()).token;
});
test.after(() => { child?.kill(); });

// ---------- H11: POST /api/court/version ----------
test('H11: version submission adds S4 with its version field; mapping stays blind', async () => {
  const r = await post('/api/court/version', {
    caseId: 'CRT-NEW', author: 'Zia',
    ingredients: { salt: 'a pinch', fat: 'olive oil', simmer: '2 hours' },
    steps: ['Brown the meat', 'Simmer 2 hours'],
    actor: 'Mara (owner)', actorKind: 'human',
  });
  assert.equal(r.status, 201);
  const body = await r.json();
  assert.equal(body.sampleCode, 'S4');
  assert.equal(body.version.id, 'zia');
  assert.equal(body.version.author, 'Zia');
  assert.deepEqual(body.version.steps, ['Brown the meat', 'Simmer 2 hours']);
  assert.equal(body.ratingsExpected, 12);
  // Code-only samples in the API: the mapping never leaves the server.
  assert.deepEqual(body.samples, [{ code: 'S1' }, { code: 'S2' }, { code: 'S3' }, { code: 'S4' }]);
  const c = await (await fetch(`${base}/api/cases/CRT-NEW`)).json();
  assert.equal(c.ratingsExpected, 12);
  assert.equal(c.ratingsComplete, false);
  assert.equal(c.tally, null);
  assert.ok(c.audit.some((a) => a.event === 'court-version-added' && a.sampleCode === 'S4' && a.version === 'zia'));
});

test('H11: version submission needs a session token; a body actorKind is ignored', async () => {
  // No token: 401, and no version is added.
  const noToken = await fetch(`${base}/api/court/version`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ caseId: 'CRT-NEW', author: 'Agent', ingredients: { salt: 'x' } }),
  });
  assert.equal(noToken.status, 401);
  // A body that claims actorKind 'agent' is ignored: the session actor
  // is human, so the submission succeeds (S5 on CRT-NEW).
  const agentBody = await post('/api/court/version', {
    caseId: 'CRT-NEW', author: 'Agent', ingredients: { salt: 'x' }, actorKind: 'agent',
  });
  assert.equal(agentBody.status, 201);
  const rated = await post('/api/court/version', {
    caseId: 'CRT-QA', author: 'Late', ingredients: { salt: 'x' }, actorKind: 'human',
  });
  assert.equal(rated.status, 400);
  assert.match((await rated.json()).error, /once ratings have begun/);
  const noAuthor = await post('/api/court/version', {
    caseId: 'CRT-NEW', ingredients: { salt: 'x' }, actorKind: 'human',
  });
  assert.equal(noAuthor.status, 400);
  const noIngredients = await post('/api/court/version', {
    caseId: 'CRT-NEW', author: 'NoIng', ingredients: {}, actorKind: 'human',
  });
  assert.equal(noIngredients.status, 400);
  assert.equal((await post('/api/court/version', {
    caseId: 'NOPE', author: 'X', ingredients: { salt: 'x' }, actorKind: 'human',
  })).status, 404);
});

// ---------- H12: POST /api/court/adopt + engine adoptCanonical ----------
test('H12: adoptCanonical picks the blind leader, is human-only and tally-gated', () => {
  const c = JSON.parse(JSON.stringify(d.cases.find((x) => x.id === 'CRT-007')));
  const adoption = adoptCanonical(c, null, { name: 'Mara (owner)', kind: 'human' });
  assert.equal(c.canonicalVersion, 'card');
  assert.equal(adoption.author, 'Nonna (card)');
  assert.equal(adoption.leaderMean, 4.67);
  assert.equal(adoption.means.auntie, 4.33);
  assert.equal(adoption.means.cousin, 3.33);
  assert.ok(c.audit.some((a) => a.event === 'court-adopted-canonical' && a.version === 'card'));
  // Dissent preserved: the losing versions stay on the record.
  assert.equal(c.versions.length, 3);
  assert.throws(() => adoptCanonical(c, null, { name: 'Mara (owner)', kind: 'human' }), /already adopted/);
  const agentCase = JSON.parse(JSON.stringify(d.cases.find((x) => x.id === 'CRT-007')));
  assert.throws(() => adoptCanonical(agentCase, null, { name: 'Facilitator Agent', kind: 'agent' }), /Only a human/);
  const incomplete = JSON.parse(JSON.stringify(qa));
  assert.throws(() => adoptCanonical(incomplete, null, { name: 'Mara (owner)', kind: 'human' }), /tally is not complete/);
  const unknown = JSON.parse(JSON.stringify(d.cases.find((x) => x.id === 'CRT-007')));
  assert.throws(() => adoptCanonical(unknown, 'nope', { name: 'Mara (owner)', kind: 'human' }), /Unknown version/);
});

test('H12: adopt endpoint records the canonical version and audit event', async () => {
  const r = await post('/api/court/adopt', { caseId: 'CRT-007', actor: 'Mara (owner)', actorKind: 'human' });
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.canonicalVersion, 'card');
  assert.equal(body.adoption.adoptedBy, 'Mara · Owner');
  const c = await (await fetch(`${base}/api/cases/CRT-007`)).json();
  assert.equal(c.canonicalVersion, 'card');
  assert.equal(c.versions.length, 3);
  assert.ok(c.audit.some((a) => a.event === 'court-adopted-canonical'));
  // Second adoption is rejected; unauthenticated adoption is rejected;
  // incomplete cases and non-COURT cases are rejected.
  assert.equal((await post('/api/court/adopt', { caseId: 'CRT-007', actorKind: 'human' })).status, 400);
  const noToken = await fetch(`${base}/api/court/adopt`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ caseId: 'CRT-QA' }),
  });
  assert.equal(noToken.status, 401);
  assert.equal((await post('/api/court/adopt', { caseId: 'CRT-QA', actorKind: 'human' })).status, 400);
  assert.equal((await post('/api/court/adopt', { caseId: 'HAG-014', actorKind: 'human' })).status, 404);
});

// ---------- L9: seed consistency ----------
test('L9: CRT-QA samples carry version fields (qa-seed clones CRT-007)', () => {
  const seed = seedData();
  const crt007 = seed.cases.find((x) => x.id === 'CRT-007');
  assert.deepEqual(crt007.samples.map((s) => s.version), ['card', 'auntie', 'cousin']);
  // The QA seed clones CRT-007, so CRT-QA inherits the mapping verbatim.
  const qaClone = JSON.parse(JSON.stringify(crt007));
  qaClone.id = 'CRT-QA';
  qaClone.ratings = qaClone.ratings.slice(0, 4);
  assert.deepEqual(qaClone.samples.map((s) => s.version), ['card', 'auntie', 'cousin']);
  assert.equal(qaClone.ratings.length, 4);
});

// ---------- static client tests ----------
function loadPureHelpers() {
  const dims = src.match(/const RATING_DIMS = \[[^\]]*\];/);
  const parse = src.match(/function parseVersionIngredients\(text\) \{[\s\S]*?\n\}/);
  const validate = src.match(/function validateRatingScores\(scores\) \{[\s\S]*?\n\}/);
  assert.ok(dims, 'RATING_DIMS not found in app/app.js');
  assert.ok(parse, 'parseVersionIngredients not found in app/app.js');
  assert.ok(validate, 'validateRatingScores not found in app/app.js');
  return new Function(`${dims[0]}\n${parse[0]}\n${validate[0]}\nreturn { parseVersionIngredients, validateRatingScores };`)();
}
const { parseVersionIngredients, validateRatingScores } = loadPureHelpers();

test('H11/L8 (client): parseVersionIngredients + validateRatingScores', () => {
  assert.deepEqual(parseVersionIngredients('salt: a pinch\nfat: lard\nsimmer: 3 hours'), { salt: 'a pinch', fat: 'lard', simmer: '3 hours' });
  assert.deepEqual(parseVersionIngredients('no colon here\nsalt: 1 tbsp\n: empty key\nfat: '), { salt: '1 tbsp' });
  assert.deepEqual(parseVersionIngredients(''), {});
  const good = { taste: 5, texture: 4, aroma: 3, appearance: 2, difficulty: 1, overall: 5 };
  assert.equal(validateRatingScores(good), null);
  assert.match(validateRatingScores({ ...good, taste: 6 }), /^taste must be a whole number/);
  assert.match(validateRatingScores({ ...good, aroma: 0 }), /^aroma must be a whole number/);
  assert.match(validateRatingScores({ ...good, overall: 4.5 }), /^overall must be a whole number/);
  assert.match(validateRatingScores({ ...good, texture: undefined }), /^texture must be a whole number/);
  assert.match(validateRatingScores(null), /^taste must be a whole number/);
});

test('M13 (client): Negotiation holds vote/adoption only; Analysis holds matrix + heat + rating + version form', () => {
  const neg = src.match(/function negotiationTab\(c\) \{[\s\S]*?\nfunction haggleNegotiation/);
  assert.ok(neg, 'negotiationTab not found');
  assert.ok(!/courtMatrix\(c\)/.test(neg[0]), 'Negotiation must not render the comparison matrix');
  assert.ok(!/courtHeat\(c\)/.test(neg[0]), 'Negotiation must not render the heat table');
  assert.ok(/courtTallyBlock\(c\)/.test(neg[0]), 'Negotiation shows the shared tally block');
  assert.ok(/adopt-btn/.test(neg[0]), 'Negotiation holds the adopt action');
  assert.ok(/Open room transcript/.test(neg[0]), 'Negotiation keeps the family-vote room link');
  const analysis = src.match(/if \(c\.workflow === 'COURT'\) return courtMatrix\(c\) \+ courtHeat\(c\) \+ courtVersionForm\(c\);/);
  assert.ok(analysis, 'Analysis must render matrix + heat + version form');
});

test('M14/M15/L7 (client): Clarified action, evidence notes in picker, row-anchored challenge form', () => {
  assert.ok(/data-clarify/.test(src), 'no Clarified host action in the claim UI');
  assert.ok(/status: 'Clarified'/.test(src), 'Clarified action does not POST status Clarified');
  assert.ok(/\$\{e\.note/.test(src) || /e\.note \? ` — \$\{esc\(e\.note\)\}`/.test(src), 'challenge evidence options do not include the note');
  assert.ok(/challenge-row/.test(src), 'challenge form is not anchored to a row');
  assert.ok(/previousElementSibling|insertAdjacentHTML\('afterend'/.test(src), 'challenge form is not inserted after the challenged row');
  assert.ok(/data-claim=/.test(src), 'claim rows carry no data-claim anchor');
});

test('M16/L6/L8/L10 (client): facilitator label, slim Δ column, inline rating error, bullet legend', () => {
  assert.ok(/Facilitator view — you can see all versions; tasters see codes only/.test(src), 'no facilitator-view label');
  assert.ok(!/distinct\.join\(' vs '\)/.test(src), 'Δ column still repeats the full value list');
  assert.ok(/id="rating-error"/.test(src), 'no inline rating error element');
  assert.ok(/aria-invalid/.test(src), 'rating inputs do not flag aria-invalid');
  assert.ok(/bullet-legend/.test(src), 'no bullet-graph legend');
  assert.ok(/Before \$\{pct\(a\.oldFoodCostPct\)\}/.test(src), 'bullet legend does not name the old price');
});
