// Tests for server/tools.js — the registry, the no-approval invariant,
// argument validation, timeouts, and audit logging. Uses the seed cases
// (in-memory) — no production data, no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createToolRegistry, validateRegistry } from '../server/tools.js';
import { seedData } from '../server/store.js';

function registryWithSeed(deps = {}) {
  const data = seedData();
  const getCase = (id) => data.cases.find((c) => c.id === id) || null;
  return createToolRegistry({ getCase, readTimeline: async () => [], ...deps });
}

test('registry lists exactly the six read/draft tools', () => {
  const r = registryWithSeed();
  const names = r.listTools().map((t) => t.name).sort();
  assert.deepEqual(names, [
    'compute_haggle',
    'draft_correction_assessment',
    'draft_court_summary',
    'draft_proposal',
    'read_case',
    'read_room_timeline',
  ]);
});

test('INVARIANT: the registry contains no approve / adopt / publish / mutate tool', () => {
  const r = registryWithSeed();
  const forbidden = /approv|adopt|publish|transition|setclaim|claimstatus|set.?status|execute|commit|send.?message|post.?message/i;
  for (const t of r.listTools()) {
    assert.doesNotMatch(t.name, forbidden, `tool "${t.name}" must not exist`);
    assert.ok(t.permission === 'read' || t.permission === 'draft', `tool "${t.name}" has no mutate permission`);
  }
});

test('validateRegistry rejects a forbidden tool name and a mutate permission', () => {
  const base = { description: 'x', parameters: { type: 'object' }, permission: 'read', timeoutMs: 1, run: async () => ({}) };
  assert.throws(() => validateRegistry([{ ...base, name: 'approve_case' }]), /forbidden tool name/);
  assert.throws(() => validateRegistry([{ ...base, name: 'adopt_canonical' }]), /forbidden tool name/);
  assert.throws(() => validateRegistry([{ ...base, name: 'publish_errata' }]), /forbidden tool name/);
  assert.throws(() => validateRegistry([{ ...base, name: 'do_thing', permission: 'mutate' }]), /only 'read' and 'draft'/);
  assert.throws(() => validateRegistry([{ ...base, name: 'read_case' }, { ...base, name: 'read_case' }]), /duplicate tool name/);
});

test('read_case returns the case summary, read-only', async () => {
  const r = registryWithSeed();
  const c = await r.callTool('read_case', { caseId: 'HAG-014' });
  assert.equal(c.id, 'HAG-014');
  assert.equal(c.workflow, 'HAGGLE');
  assert.equal(c.input.supplier, 'DairyCo');
  assert.equal(c.input.oldPrice, 0.16);
  assert.equal(c.evidence.length, 2);
});

test('read_case rejects unknown cases and bad arguments', async () => {
  const r = registryWithSeed();
  await assert.rejects(() => r.callTool('read_case', { caseId: 'NOPE' }), /unknown case/);
  await assert.rejects(() => r.callTool('read_case', {}), /invalid arguments/);
  await assert.rejects(() => r.callTool('read_case', { caseId: 'HAG-014', extra: 1 }), /invalid arguments/);
  await assert.rejects(() => r.callTool('no_such_tool', {}), /unknown tool/);
});

test('compute_haggle uses the deterministic engine — no invented numbers', async () => {
  const r = registryWithSeed();
  const out = await r.callTool('compute_haggle', { caseId: 'HAG-014' });
  // Seed figures, from the engine: cream $0.96 -> $1.44/serving, +$0.48.
  assert.equal(out.analysis.oldCreamCostPerServing, 0.96);
  assert.equal(out.analysis.newCreamCostPerServing, 1.44);
  assert.equal(out.analysis.costDiffPerServing, 0.48);
  assert.equal(out.analysis.monthlyExtraCost, 76.8);
  assert.equal(out.strategies.length, 6);
  assert.match(out.source, /deterministic engine/);
  await assert.rejects(() => r.callTool('compute_haggle', { caseId: 'CRT-007' }), /not a HAGGLE case/);
});

test('draft_proposal is a draft only, with engine-derived terms', async () => {
  const r = registryWithSeed();
  const d = await r.callTool('draft_proposal', { caseId: 'HAG-014', strategyId: 'counter-019' });
  assert.equal(d.draft, true);
  assert.equal(d.requiresHumanApproval, true);
  assert.equal(d.strategyId, 'counter-019');
  // Terms come from the engine's own strategy figures — never hardcoded
  // here, so the test survives the engine deriving prices from the input.
  const { haggleAnalysis, haggleStrategies } = await import('../server/engine.js');
  const data = seedData();
  const hag = data.cases.find((c) => c.id === 'HAG-014');
  const expected = haggleStrategies(haggleAnalysis(hag.input), hag.input).find((s) => s.id === 'counter-019');
  assert.equal(d.figures.unitPrice, expected.unitPrice);
  assert.equal(d.terms, `$${expected.unitPrice.toFixed(2)} / fl oz`);
  assert.equal(d.figures.foodCostPct, expected.foodCostPct);
  await assert.rejects(() => r.callTool('draft_proposal', { caseId: 'HAG-014', strategyId: 'nope' }), /unknown strategy/);
});

test('draft_court_summary reports the tally without adopting anything', async () => {
  const r = registryWithSeed();
  const d = await r.callTool('draft_court_summary', { caseId: 'CRT-007' });
  assert.equal(d.draft, true);
  assert.equal(d.tallyComplete, true);
  assert.equal(d.ratingsCount, 9);
  assert.equal(d.ratingsExpected, 9);
  assert.ok(d.tally.S1.means.overall > 0);
  assert.equal(d.conflicts.length, 3); // salt, fat, simmer disagree
});

test('draft_correction_assessment extracts claims with evidence refs', async () => {
  const r = registryWithSeed();
  const d = await r.callTool('draft_correction_assessment', { caseId: 'COR-003' });
  assert.equal(d.draft, true);
  assert.equal(d.claims.length, 3);
  assert.match(d.claims[0].id, /^C-[0-9a-f]{8}$/); // stable content-derived id
  assert.equal(d.claims[0].legacyId, 'C1');
  assert.deepEqual(d.claims[0].evidence, ['E1']);
  assert.deepEqual(d.claims[1].evidence, ['E2']);
  assert.deepEqual(d.claims[2].evidence, []);
});

test('read_room_timeline returns the injected timeline', async () => {
  const r = registryWithSeed({
    readTimeline: async (caseId) => [{ id: 'm1', author: 'Mara', at: '2026-11-07T00:00:00.000Z', text: 'hi' }],
  });
  const out = await r.callTool('read_room_timeline', { caseId: 'HAG-014' });
  assert.equal(out.count, 1);
  assert.equal(out.messages[0].text, 'hi');
});

test('every call is audit-logged — success and failure', async () => {
  const auditLog = [];
  const r = registryWithSeed({ auditLog });
  await r.callTool('read_case', { caseId: 'HAG-014' });
  await assert.rejects(() => r.callTool('read_case', { caseId: 'NOPE' }), /unknown case/);
  assert.equal(auditLog.length, 2);
  assert.equal(auditLog[0].tool, 'read_case');
  assert.equal(auditLog[0].ok, true);
  assert.equal(typeof auditLog[0].ms, 'number');
  assert.equal(auditLog[1].ok, false);
  assert.match(auditLog[1].error, /unknown case/);
});

test('a tool that never resolves hits the timeout and is audit-logged', async () => {
  const auditLog = [];
  const r = registryWithSeed({
    auditLog,
    toolTimeoutMs: 50,
    readTimeline: () => new Promise(() => {}), // never resolves
  });
  await assert.rejects(() => r.callTool('read_room_timeline', { caseId: 'HAG-014' }), /timed out after 50ms/);
  assert.equal(auditLog.length, 1);
  assert.equal(auditLog[0].ok, false);
  assert.match(auditLog[0].error, /timed out/);
});
