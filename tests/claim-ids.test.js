// CONVERGE stable CORRECTION claim ids (§31.2, 2026-11-07).
// Claim ids are derived from the claim TEXT (C-<8 hex of SHA-256 of
// the normalised text), not from sentence position. A transcript
// reorder must keep every claim's id and status; a wording change is
// a different claim (new id) and the old status is orphaned, never
// rebound to a different claim. Legacy positional ids (C1/C2/C3) are
// still carried as legacyId for old clients and audit references.
import test from 'node:test';
import assert from 'node:assert/strict';
import { extractClaims, stableClaimId, migrateCorrectionClaimKeys } from '../server/engine.js';
import { seedData } from '../server/store.js';

const TRANSCRIPT = seedData().cases.find((x) => x.id === 'COR-003').transcript;
const SENTENCES = [
  'I led the 2023 Clarion-Clipperton survey.',
  'We found that 40 percent of species there are still undescribed.',
  'I am a Professor of Marine Biology.',
];

test('claim ids: stable ids are derived from the claim text', () => {
  const claims = extractClaims(TRANSCRIPT);
  assert.equal(claims.length, 3);
  for (const [i, cl] of claims.entries()) {
    assert.equal(cl.id, stableClaimId(SENTENCES[i]));
    assert.match(cl.id, /^C-[0-9a-f]{8}$/);
    assert.equal(cl.legacyId, `C${i + 1}`);
  }
});

test('claim ids: repeated ingestion yields the same ids', () => {
  const a = extractClaims(TRANSCRIPT).map((cl) => cl.id);
  const b = extractClaims(TRANSCRIPT).map((cl) => cl.id);
  assert.deepEqual(a, b);
  // Whitespace/case-only edits do not churn the id.
  const c = extractClaims(TRANSCRIPT.replace('40 percent', '  40   PERCENT ')).map((cl) => cl.id);
  assert.deepEqual(a, c);
});

test('claim ids: reordered claims keep their ids and their statuses', () => {
  const reordered = [SENTENCES[2], SENTENCES[0], SENTENCES[1]].join(' ');
  const claims = extractClaims(reordered);
  assert.equal(claims.length, 3);
  // Same texts -> same stable ids, regardless of position.
  const byText = new Map(extractClaims(TRANSCRIPT).map((cl) => [cl.text, cl.id]));
  for (const cl of claims) assert.equal(cl.id, byText.get(cl.text));
  // ... and the legacy positions moved, so a positional lookup would
  // have rebound the statuses. Simulate stored statuses keyed by the
  // ORIGINAL stable ids: they follow the text, not the position.
  const c = { workflow: 'CORRECTION', transcript: reordered, claimStatuses: {}, claimChallenges: {} };
  const original = extractClaims(TRANSCRIPT);
  c.claimStatuses[original[0].id] = 'Corrected'; // survey claim
  c.claimStatuses[original[1].id] = 'Disputed'; // 40-percent claim
  const migrated = extractClaims(reordered).map((cl) => ({ ...cl, status: c.claimStatuses[cl.id] || cl.status }));
  assert.equal(migrated.find((cl) => cl.text === SENTENCES[0]).status, 'Corrected');
  assert.equal(migrated.find((cl) => cl.text === SENTENCES[1]).status, 'Disputed');
  assert.equal(migrated.find((cl) => cl.text === SENTENCES[2]).status, 'Unresolved');
});

test('claim ids: a changed claim text gets a new id and the old status is orphaned, not rebound', () => {
  const original = extractClaims(TRANSCRIPT);
  const c = {
    workflow: 'CORRECTION',
    transcript: TRANSCRIPT,
    claimStatuses: { [original[1].id]: 'Disputed' }, // 40-percent claim
    claimChallenges: {},
  };
  // Edit the 40-percent claim's wording (38% instead of 40%).
  c.transcript = TRANSCRIPT.replace('40 percent', '38 percent');
  assert.equal(migrateCorrectionClaimKeys(c), true);
  const edited = extractClaims(c.transcript);
  const editedClaim = edited.find((cl) => cl.text.includes('38 percent'));
  assert.notEqual(editedClaim.id, original[1].id); // new id for new text
  // The old status was NOT moved onto the edited claim (or any other):
  assert.equal(c.claimStatuses[editedClaim.id], undefined);
  // It was preserved as orphaned, keyed by the old stable id.
  assert.equal(c.orphanedClaimStatuses[original[1].id], 'Disputed');
  assert.deepEqual(verifyNoRebind(c), true);
  function verifyNoRebind(cc) {
    return !Object.keys(cc.claimStatuses).some((id) => !edited.some((cl) => cl.id === id));
  }
});

test('claim ids: legacy positional keys migrate to stable ids without losing a status', () => {
  const original = extractClaims(TRANSCRIPT);
  const c = {
    workflow: 'CORRECTION',
    transcript: TRANSCRIPT,
    claimStatuses: { C1: 'Corrected', C2: 'Disputed', C3: 'Verified' },
    claimChallenges: { C2: { text: 'Paper says 38%', evidence: 'E2', by: 'Dr Amara Osei (guest)' } },
    claimChallengeHistory: { C2: [{ text: 'older challenge', evidence: null, by: 'Dr Amara Osei (guest)' }] },
  };
  assert.equal(migrateCorrectionClaimKeys(c), true);
  assert.deepEqual(c.claimStatuses, {
    [original[0].id]: 'Corrected',
    [original[1].id]: 'Disputed',
    [original[2].id]: 'Verified',
  });
  assert.deepEqual(Object.keys(c.claimChallenges), [original[1].id]);
  assert.deepEqual(Object.keys(c.claimChallengeHistory), [original[1].id]);
  assert.equal(c.orphanedClaimStatuses, undefined);
  // Idempotent: a second migration is a no-op.
  assert.equal(migrateCorrectionClaimKeys(c), false);
});

test('claim ids: a legacy key with no matching claim is orphaned, not dropped', () => {
  const c = {
    workflow: 'CORRECTION',
    transcript: TRANSCRIPT,
    claimStatuses: { C9: 'Verified', C1: 'Corrected' },
    claimChallenges: {},
  };
  assert.equal(migrateCorrectionClaimKeys(c), true);
  const original = extractClaims(TRANSCRIPT);
  assert.equal(c.claimStatuses[original[0].id], 'Corrected');
  assert.equal(c.claimStatuses.C9, undefined);
  assert.equal(c.orphanedClaimStatuses.C9, 'Verified');
});
