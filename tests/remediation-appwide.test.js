// Remediation: app-wide correctness (M2/M4/M6/M7/M9-M12, L1/L4/L5/L12).
// Static client tests in the style of tests/escaping.test.js (the
// shipped app.js source is the subject, not a copy) + engine unit
// tests for the server-side claim->evidence mapping (L5).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractClaims, claimEvidenceRefs } from '../server/engine.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'app', 'app.js'), 'utf8');
const html = readFileSync(join(root, 'app', 'index.html'), 'utf8');
const serverSrc = readFileSync(join(root, 'server', 'server.js'), 'utf8');

const SEED_TRANSCRIPT = 'I led the 2023 Clarion-Clipperton survey. We found that 40 percent of species there are still undescribed. I am a Professor of Marine Biology. I think deep-sea mining is the most important ocean issue of our time.';
const SEED_EVIDENCE = [
  { id: 'E1', note: 'Survey was co-led with Dr Chen.' },
  { id: 'E2', note: 'Paper says 38%, not 40%.' },
];

test('L5: server-side claim->evidence mapping matches the seed behaviour', () => {
  const claims = extractClaims(SEED_TRANSCRIPT);
  const refs = claimEvidenceRefs(claims, SEED_EVIDENCE);
  // Seed behaviour: survey claim -> E1, "40 percent" claim -> E2,
  // title claim -> none. Keys are the stable content-derived ids.
  assert.deepEqual(refs, { [claims[0].id]: ['E1'], [claims[1].id]: ['E2'], [claims[2].id]: [] });
});

test('L5: a claim sharing no content word with any evidence cites nothing', () => {
  const refs = claimEvidenceRefs([{ id: 'C9', text: 'The harbourmaster retired in 2019.' }], SEED_EVIDENCE);
  assert.deepEqual(refs.C9, []);
});

test('L5: the client no longer carries a hardcoded claim->evidence map', () => {
  assert.ok(!src.includes('CLAIM_EVIDENCE'), 'CLAIM_EVIDENCE still in app.js');
  assert.ok(src.includes('cl.evidence'), 'claims table should read cl.evidence from the server');
  assert.ok(serverSrc.includes('claimEvidenceRefs'), 'server.js should compute claim evidence refs');
});

test('M4: headline metrics exclude QA copies', () => {
  assert.ok(src.includes('isQaCopy'), 'isQaCopy helper missing');
  assert.ok(src.includes('QA copies excluded'), 'KPI strip should say QA copies are excluded');
});

test('M2: Active Cases has its own status filter chips', () => {
  assert.ok(src.includes('casesStatusFilter'), 'cases status filter state missing');
  assert.ok(src.includes('Awaiting approval'), 'Awaiting approval chip missing');
});

test('M6/M9: feed renders room-message excerpts and plain-word state changes', () => {
  assert.ok(src.includes('posted in'), 'room-message excerpt rendering missing');
  assert.ok(src.includes('moved'), 'plain-word state-change rendering missing');
  assert.ok(src.includes('changed claim'), 'claim-status change text missing');
  assert.ok(src.includes('data-case'), 'case-id links missing');
  assert.ok(src.includes('activityCaseFilter'), 'activity case filter missing');
});

test('M7: Workflows links demo cases, highlights the current stage, drops "configurable"', () => {
  assert.ok(!src.includes('Three configurable workflows'), '"configurable" claim still rendered');
  assert.ok(src.includes('stage-current'), 'current-stage highlight missing');
  assert.ok(src.includes('data-case'), 'demo-case link missing');
});

test('M10: Decisions links the decided case id and points at the case workspace', () => {
  assert.ok(src.includes('Approvals are requested from a case workspace'), 'empty-panel pointer missing');
});

test('M11: Environment is a status readout in plain words, versions from /api/status', () => {
  assert.ok(src.includes('Server did not answer the health check'), 'plain-words health text missing');
  assert.ok(src.includes('switchVersionText'), 'versions should come from /api/status');
  assert.ok(!/0\.40\.1 \/ 0\.31\.0/.test(src), 'hardcoded Switch versions still in app.js');
  assert.ok(!html.includes('Settings'), 'nav/H1 should say Environment, not Settings');
  assert.ok(html.includes('Environment'), 'Environment label missing from index.html');
});

test('M12: evidence tags are qualified per case and the case title is shown', () => {
  assert.ok(src.includes('[${esc(e.caseId)} · ${esc(e.id)}]'), 'qualified evidence tag missing');
  assert.ok(src.includes('e.caseTitle'), 'case title next to the evidence case id missing');
});

test('L1: the session identity is labelled (P0 2026-11-07: sessions replaced the fixed demo identity)', () => {
  assert.ok(html.includes('Signed-in identity from the session — Mara (owner).'), 'header chip tooltip missing');
  assert.ok(src.includes('Session identity — Mara (owner). The server issues a session on load'), 'Environment identity note missing');
  assert.ok(!src.includes('No sign-in; every visitor sees the same identity'), 'the old no-sign-in copy must be gone');
  assert.ok(!src.includes('Signed in as the case owner'), 'old sign-in tooltip still present');
});

test('L4: "timestamped claims" copy is gone', () => {
  assert.ok(!src.includes('timestamped'), '"timestamped" still in app.js');
});
