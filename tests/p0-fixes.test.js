// CONVERGE P0 critical-fix regression tests (QA audit 2026-11-06).
//
// C1: COURT rating form posted `sample:` but the server reads
//     `body.sampleCode`, so every UI submit 400'd; the success message
//     also read `res.count` where the server returns `submitted`.
// C2: a partially-rated COURT sample crashed the heat table
//     (cs.scores[sample][r][crit] threw for readers who had not rated).
// C3: pendingApproval survived the AWAITING_APPROVAL -> DISCUSSION
//     step-back in the engine and in the store load() migration.
//
// Server tests use a SCRATCH data file (a temp copy of the demo data),
// never the shared data/converge.json: the full suite runs test files
// in parallel, and two files backing up/restoring the same file race
// (a scratch case once survived on disk). Port 3299 (not 3199) so this
// file can run alongside server.test.js in the full suite.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { transitionCase } from '../server/engine.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const appSrc = readFileSync(join(root, 'app', 'app.js'), 'utf8');
const realDataFile = join(root, 'data', 'converge.json');
// Scratch data dir for this file run. CONVERGE_DATA_FILE must be set
// before store.js is evaluated (static imports hoist), so load() is
// imported dynamically below.
const scratchDir = mkdtempSync(join(tmpdir(), 'converge-p0-'));
const dataFile = join(scratchDir, 'converge.json');
copyFileSync(realDataFile, dataFile);
process.env.CONVERGE_DATA_FILE = dataFile;
const { load } = await import('../server/store.js');
const PORT = 3299;
const base = `http://localhost:${PORT}`;

// ---------- static helpers: extract the SHIPPED functions ----------
// Same approach as tests/escaping.test.js: run the code from app/app.js,
// not a copy of it, so the tests fail if the shipped code regresses.
function extractFn(src, name) {
  const start = src.indexOf(`function ${name}(`);
  assert.ok(start !== -1, `${name} not found in app/app.js — the extractor needs updating`);
  let i = src.indexOf('{', start);
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); }
  }
  throw new Error(`unbalanced braces in ${name}`);
}
function loadCourtFns(sampleCode = 'S1') {
  const escMatch = appSrc.match(/const esc = \(s\) => String\(s \?\? ''\)\.replace\(\/\[\&<>\"'\]\/g, \(c\) => \(\{[^\}]*\}\[c\]\)\);/);
  assert.ok(escMatch, 'esc() definition not found in app/app.js — the extractor needs updating');
  const code = [
    escMatch[0],
    extractFn(appSrc, 'courtScoresFor'),
    extractFn(appSrc, 'courtTallyState'),
    extractFn(appSrc, 'courtMeans'),
    extractFn(appSrc, 'courtHeat'),
  ].join('\n');
  const COURT_DEMO = {
    samples: { S1: 'S1', S2: 'S2', S3: 'S3' },
    criteria: ['taste', 'texture', 'aroma', 'appearance', 'difficulty', 'overall'],
    readers: ['Reader A', 'Reader B', 'Reader C'],
    scores: {},
  };
  return new Function('COURT_DEMO', 'courtSample', `${code}; return { courtScoresFor, courtMeans, courtHeat };`)(COURT_DEMO, sampleCode);
}

// A COURT case with a partially-rated sample: Reader A and Reader B
// rated S1, Reader C has not; only Reader A rated S2; nobody rated S3.
function partialCase() {
  const scores = (v) => ({ taste: v, texture: v, aroma: v, appearance: v, difficulty: v, overall: v });
  return {
    workflow: 'COURT',
    readers: ['Reader A', 'Reader B', 'Reader C'],
    samples: [{ code: 'S1', version: 'V1' }, { code: 'S2', version: 'V2' }, { code: 'S3', version: 'V3' }],
    versions: [{ id: 'V1', author: 'Ana' }, { id: 'V2', author: 'Bo' }, { id: 'V3', author: 'Cy' }],
    ratings: [
      { reader: 'Reader A', sampleCode: 'S1', scores: scores(5) },
      { reader: 'Reader B', sampleCode: 'S1', scores: scores(4) },
      { reader: 'Reader A', sampleCode: 'S2', scores: scores(3) },
    ],
  };
}

// ---------- C1: static — the shipped submit handler ----------
test('C1: rating submit posts sampleCode (not sample) and reads res.submitted', () => {
  const idx = appSrc.indexOf("api('/api/court/rate'");
  assert.ok(idx !== -1, 'court/rate call not found in app/app.js');
  const region = appSrc.slice(idx, idx + 900);
  assert.ok(/sampleCode\s*:/.test(region), 'submit body must post sampleCode');
  // A bare `sample:` field (the old bug) — but not `sampleCode:` and
  // not `rating-sample` (a DOM id, not a body field).
  assert.ok(!/(?<![A-Za-z0-9_$-])sample\s*:/.test(region), 'submit body must not post a bare sample: field');
  assert.ok(region.includes('res.submitted'), 'success message must read res.submitted');
  assert.ok(!region.includes('res.count'), 'success message must not read res.count (server returns submitted)');
});

// ---------- C2: partial ratings ----------
test('C2: courtMeans averages only submitted scores for a partial sample', () => {
  const { courtMeans } = loadCourtFns();
  const means = courtMeans(partialCase());
  assert.equal(means.S1.taste, 4.5); // (5+4)/2 — Reader C has not rated
  assert.equal(means.S1.overall, 4.5);
  assert.equal(means.S2.taste, 3); // only Reader A rated S2
  assert.equal(means.S3, undefined); // nobody rated S3
  for (const m of Object.values(means)) {
    for (const v of Object.values(m)) assert.ok(typeof v === 'number' && Number.isFinite(v), `mean must be a finite number, got ${v}`);
  }
});

test('C2: courtHeat renders a partially-rated sample without throwing (missing cells are —)', () => {
  const { courtHeat } = loadCourtFns('S1');
  const html = courtHeat(partialCase());
  assert.ok(typeof html === 'string' && html.length > 0, 'heat table must render');
  assert.ok(html.includes('—'), 'a missing reader score must render as —');
  assert.ok(!html.includes('NaN'), 'no NaN may leak into the rendered table');
  assert.ok(!html.includes('undefined'), 'no undefined may leak into the rendered table');
  // Reader A=5, Reader B=4 on S1: range 1, so no DISAGREE highlight.
  assert.ok(!html.includes('DISAGREE'), 'range 1 must not flag disagreement');
});

test('C2: courtHeat still flags disagreement when present values differ by >= 2', () => {
  const { courtHeat } = loadCourtFns('S1');
  const c = partialCase();
  c.ratings[1].scores = { taste: 2, texture: 2, aroma: 2, appearance: 2, difficulty: 2, overall: 2 };
  const html = courtHeat(c);
  assert.ok(html.includes('DISAGREE'), 'range 5-2=3 must flag disagreement');
});

// ---------- C3: engine ----------
test('C3: AWAITING_APPROVAL -> DISCUSSION clears pendingApproval; APPROVED still captures it first', () => {
  const pending = { proposalId: 'P2', terms: '$0.19/fl oz for 6 weeks', requestedBy: 'Negotiation Agent' };
  const back = { state: 'AWAITING_APPROVAL', audit: [], pendingApproval: { ...pending } };
  transitionCase(back, 'DISCUSSION', { name: 'Owner', kind: 'human' });
  assert.equal(back.state, 'DISCUSSION');
  assert.equal(back.pendingApproval, null);
  assert.equal(back.approval, undefined);

  const approved = { state: 'AWAITING_APPROVAL', audit: [], pendingApproval: { ...pending } };
  transitionCase(approved, 'APPROVED', { name: 'Owner', kind: 'human' });
  assert.equal(approved.state, 'APPROVED');
  assert.equal(approved.pendingApproval, null);
  assert.equal(approved.approval.proposalId, 'P2');
  assert.equal(approved.approval.approvedBy, 'Owner');
  assert.ok(approved.approval.approvedAt);

  const rejected = { state: 'AWAITING_APPROVAL', audit: [], pendingApproval: { ...pending } };
  transitionCase(rejected, 'REJECTED', { name: 'Owner', kind: 'human' });
  assert.equal(rejected.pendingApproval, null);
});

test('C3: entering AWAITING_APPROVAL leaves pendingApproval for the server to set (server.js:150)', () => {
  const c = { state: 'PROPOSAL', audit: [], pendingApproval: { proposalId: 'P1', terms: 'old', requestedBy: 'Agent' } };
  transitionCase(c, 'AWAITING_APPROVAL', { name: 'Agent', kind: 'agent' });
  assert.equal(c.state, 'AWAITING_APPROVAL');
  assert.equal(c.pendingApproval.proposalId, 'P1');
});

// ---------- C3: store load() migration ----------
test('C3: load() clears a stale pendingApproval off AWAITING_APPROVAL cases and keeps a genuine one', () => {
  const before = readFileSync(dataFile, 'utf8');
  try {
    const d = JSON.parse(before);
    const seed = d.cases.find((x) => x.id === 'CRT-007');
    const stale = JSON.parse(JSON.stringify(seed));
    stale.id = 'CRT-P0MIG'; stale.title = 'Scratch migration test — do not ship';
    stale.state = 'DISCUSSION';
    stale.pendingApproval = { proposalId: 'P1', terms: 'test', requestedBy: 'Agent' };
    const keep = JSON.parse(JSON.stringify(seed));
    keep.id = 'CRT-P0KEEP'; keep.title = 'Scratch migration test — do not ship';
    keep.state = 'AWAITING_APPROVAL';
    keep.pendingApproval = { proposalId: 'P1', terms: 'test', requestedBy: 'Agent' };
    d.cases.push(stale, keep);
    writeFileSync(dataFile, JSON.stringify(d, null, 2));
    const loaded = load();
    assert.equal(loaded.cases.find((x) => x.id === 'CRT-P0MIG').pendingApproval, null);
    assert.ok(loaded.cases.find((x) => x.id === 'CRT-P0KEEP').pendingApproval, 'a genuine AWAITING_APPROVAL pendingApproval must survive load()');
  } finally {
    writeFileSync(dataFile, before);
  }
});

// ---------- C1: live server ----------
let child;

async function waitForServer() {
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch(`${base}/api/status`); if (r.ok) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('server did not start');
}

test.before(async () => {
  // Scratch incomplete COURT case (CRT-P0: a clone of CRT-007 with only
  // 4 of 9 ratings) so the rate tests have a live incomplete case.
  // Written to the scratch data file only; the shared demo data is
  // never touched.
  const d = JSON.parse(readFileSync(dataFile, 'utf8'));
  const seed = d.cases.find((x) => x.id === 'CRT-007');
  const clone = JSON.parse(JSON.stringify(seed));
  clone.id = 'CRT-P0';
  clone.title = 'Scratch P0 test — do not ship';
  clone.ratings = clone.ratings.slice(0, 4); // A/B/C on S1, A on S2
  d.cases.push(clone);
  writeFileSync(dataFile, JSON.stringify(d, null, 2));
  child = spawn('node', ['server/server.js'], { cwd: root, env: { ...process.env, PORT: String(PORT), CONVERGE_DATA_FILE: dataFile }, stdio: 'ignore' });
  await waitForServer();
});

test.after(() => {
  child?.kill();
  rmSync(scratchDir, { recursive: true, force: true });
});

test('C1: POST /api/court/rate with the old sample field 400s (Unknown sample undefined)', async () => {
  const r = await fetch(`${base}/api/court/rate`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ caseId: 'CRT-P0', reader: 'Reader B', sample: 'S3', scores: { taste: 5, texture: 5, aroma: 5, appearance: 5, difficulty: 5, overall: 5 } }),
  });
  assert.equal(r.status, 400);
  const body = await r.json();
  assert.match(body.error, /Unknown sample undefined/);
});

test('C1: POST /api/court/rate with sampleCode succeeds and reports submitted', async () => {
  const r = await fetch(`${base}/api/court/rate`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ caseId: 'CRT-P0', reader: 'Reader B', sampleCode: 'S2', scores: { taste: 5, texture: 5, aroma: 5, appearance: 5, difficulty: 5, overall: 5 } }),
  });
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.submitted, 5); // 4 seeded + 1
  assert.equal(body.expected, 9);
  assert.equal(body.complete, false);
  assert.equal(body.tally, null);
});
