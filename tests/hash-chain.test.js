// CONVERGE audit-trail hash chain tests (§31.1, 2026-11-07).
// The audit trail is now an append-only hash chain: each event carries
// prevHash + hash = SHA-256(canonical(prevHash + event fields)), and a
// single chain-baseline event commits to all pre-existing (unhashed)
// events without rewriting them. verifyAuditChain must detect a
// modified event, a missing middle event, reordered events, and an
// invalid previous hash. The documented limitation is also pinned:
// deleting the TAIL still verifies (no external head hash exists).
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { audit, verifyAuditChain, ensureAuditBaseline, canonicalJson, sha256Hex } from '../server/engine.js';

// Scratch data dir for this file run. CONVERGE_DATA_FILE must be set
// before store.js is evaluated (static imports hoist), so load() and
// seedData() are imported dynamically below. engine.js is safe to
// import statically: it does NOT import store.js (that direction would
// evaluate the store before the env var is set — see the §31.1 note in
// engine.js).
const scratchDir = mkdtempSync(join(tmpdir(), 'converge-hash-chain-'));
const dataFile = join(scratchDir, 'converge.json');
process.env.CONVERGE_DATA_FILE = dataFile;
const { load, seedData } = await import('../server/store.js');

const ACTOR = { name: 'Mara · Owner', kind: 'human' };

function freshCase() {
  return { id: 'HAG-TEST', workflow: 'HAGGLE', state: 'DRAFT', audit: [] };
}
function chainedCase(n = 3) {
  const c = freshCase();
  for (let i = 0; i < n; i++) audit(c, ACTOR, `test-event-${i}`, { n: i });
  return c;
}

test('hash chain: a valid full chain verifies', () => {
  const c = chainedCase(3);
  assert.equal(c.audit.length, 3);
  assert.equal(c.audit[0].prevHash, 'GENESIS');
  assert.equal(c.audit[1].prevHash, c.audit[0].hash);
  assert.equal(c.audit[2].prevHash, c.audit[1].hash);
  assert.deepEqual(verifyAuditChain(c.audit), { valid: true });
});

test('hash chain: a modified event is detected', () => {
  const c = chainedCase(3);
  const tampered = JSON.parse(JSON.stringify(c.audit));
  tampered[1].n = 99; // change a detail field of the middle event
  const v = verifyAuditChain(tampered);
  assert.equal(v.valid, false);
  assert.equal(v.firstBadIndex, 1);
  assert.match(v.reason, /modified/);
});

test('hash chain: a missing middle event is detected', () => {
  const c = chainedCase(3);
  const shortened = [c.audit[0], c.audit[2]]; // event 1 removed
  const v = verifyAuditChain(shortened);
  assert.equal(v.valid, false);
  assert.equal(v.firstBadIndex, 1); // event 2's prevHash no longer matches
  assert.match(v.reason, /prevHash/);
});

test('hash chain: reordered events are detected', () => {
  const c = chainedCase(3);
  const reordered = [c.audit[0], c.audit[2], c.audit[1]];
  const v = verifyAuditChain(reordered);
  assert.equal(v.valid, false);
  assert.equal(v.firstBadIndex, 1);
});

test('hash chain: an invalid previous hash is detected', () => {
  const c = chainedCase(3);
  const tampered = JSON.parse(JSON.stringify(c.audit));
  tampered[1].prevHash = '0'.repeat(64);
  const v = verifyAuditChain(tampered);
  assert.equal(v.valid, false);
  assert.equal(v.firstBadIndex, 1);
  assert.match(v.reason, /prevHash/);
});

test('hash chain: tail deletion is NOT detected without an external head hash (documented limitation)', () => {
  const c = chainedCase(3);
  const truncated = c.audit.slice(0, 2); // last event deleted
  // A truncated chain is still a valid prefix — this is inherent to a
  // hash chain with no externally anchored checkpoint, and is stated
  // in docs/SECURITY.md rather than hidden.
  assert.deepEqual(verifyAuditChain(truncated), { valid: true });
});

test('hash chain: baseline migration does not alter pre-existing events', () => {
  const legacy = [
    { at: '2026-11-05T17:53:39.578Z', actor: 'Owner', kind: 'human', event: 'state:PROPOSAL->AWAITING_APPROVAL' },
    { at: '2026-11-05T17:54:01.000Z', actor: 'Owner', kind: 'human', event: 'state:AWAITING_APPROVAL->APPROVED' },
  ];
  const before = JSON.parse(JSON.stringify(legacy));
  const c = { id: 'HAG-014', workflow: 'HAGGLE', state: 'APPROVED', audit: legacy };
  assert.equal(ensureAuditBaseline(c), true);
  // Exactly one event appended; the old events are byte-identical.
  assert.equal(c.audit.length, before.length + 1);
  assert.deepEqual(c.audit.slice(0, before.length), before);
  const baseline = c.audit[c.audit.length - 1];
  assert.equal(baseline.event, 'chain-baseline');
  assert.equal(baseline.prevHash, 'GENESIS');
  assert.equal(baseline.baselineCount, before.length);
  assert.equal(baseline.hash, sha256Hex(canonicalJson(before)));
  // The migrated chain verifies, and a new event chains from it.
  assert.deepEqual(verifyAuditChain(c.audit), { valid: true });
  audit(c, ACTOR, 'test-after-baseline', {});
  assert.equal(c.audit[c.audit.length - 1].prevHash, baseline.hash);
  assert.deepEqual(verifyAuditChain(c.audit), { valid: true });
  // Second baseline call is a no-op (idempotent).
  assert.equal(ensureAuditBaseline(c), false);
  assert.equal(c.audit.filter((e) => e.event === 'chain-baseline').length, 1);
});

test('hash chain: tampering with a pre-baseline event breaks the baseline hash', () => {
  const legacy = [
    { at: '2026-11-05T17:53:39.578Z', actor: 'Owner', kind: 'human', event: 'state:PROPOSAL->AWAITING_APPROVAL' },
    { at: '2026-11-05T17:54:01.000Z', actor: 'Owner', kind: 'human', event: 'state:AWAITING_APPROVAL->APPROVED' },
  ];
  const c = { id: 'HAG-014', workflow: 'HAGGLE', state: 'APPROVED', audit: legacy };
  ensureAuditBaseline(c);
  const tampered = JSON.parse(JSON.stringify(c.audit));
  tampered[0].event = 'state:PROPOSAL->APPROVED'; // rewrite history
  const v = verifyAuditChain(tampered);
  assert.equal(v.valid, false);
  assert.match(v.reason, /baseline/);
});

test('hash chain: load() migrates legacy audit trails and leaves old events untouched', () => {
  const d = seedData();
  const legacyEvents = [
    { at: '2026-11-05T17:53:39.578Z', actor: 'Owner', kind: 'human', event: 'state:PROPOSAL->AWAITING_APPROVAL' },
    { at: '2026-11-05T17:54:01.000Z', actor: 'Owner', kind: 'human', event: 'state:AWAITING_APPROVAL->APPROVED' },
  ];
  d.cases.find((x) => x.id === 'HAG-014').audit = JSON.parse(JSON.stringify(legacyEvents));
  writeFileSync(dataFile, JSON.stringify(d, null, 2));
  const loaded = load();
  const c = loaded.cases.find((x) => x.id === 'HAG-014');
  assert.equal(c.audit.length, legacyEvents.length + 1);
  assert.deepEqual(c.audit.slice(0, legacyEvents.length), legacyEvents);
  assert.equal(c.audit[c.audit.length - 1].event, 'chain-baseline');
  assert.deepEqual(verifyAuditChain(c.audit), { valid: true });
  // A second load is a no-op: no second baseline.
  const loaded2 = load();
  const c2 = loaded2.cases.find((x) => x.id === 'HAG-014');
  assert.equal(c2.audit.filter((e) => e.event === 'chain-baseline').length, 1);
  rmSync(scratchDir, { recursive: true, force: true });
});
