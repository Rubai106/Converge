import test from 'node:test';
import assert from 'node:assert/strict';
import { haggleAnalysis, haggleStrategies, courtConflicts, courtTally, extractClaims, setClaimStatus, transitionCase, canTransition } from '../server/engine.js';
import { createStubState, stubHealth, stubRegisterAgent, stubGetOps, stubCallOp } from '../server/stub-switch.js';
import { OPERATION_CATALOG } from '../server/switch-client.js';

const input = { supplier: 'DairyCo', ingredient: 'heavy cream', oldPrice: 0.16, newPrice: 0.24, unit: 'fl oz', qtyPerServing: 6, otherIngredientsCostPerServing: 3.62, menuPrice: 16, monthlySales: 160, targetFoodCostPct: 30, targetPrice: 0.16, maxApprovedPrice: 0.20 };

test('HAGGLE maths matches hand-checked values', () => {
  const a = haggleAnalysis(input);
  assert.equal(a.oldCreamCostPerServing, 0.96);
  assert.equal(a.newCreamCostPerServing, 1.44);
  assert.equal(a.costDiffPerServing, 0.48);
  assert.equal(a.pctChange, 50);
  assert.equal(a.oldTotalCostPerServing, 4.58);
  assert.equal(a.newTotalCostPerServing, 5.06);
  assert.equal(a.oldFoodCostPct, 28.63); // 4.58/16 = 28.625 -> 28.63
  assert.equal(a.newFoodCostPct, 31.62); // 5.06/16 = 31.625, binary rounding gives 31.62
  assert.equal(a.monthlyExtraCost, 76.8);
  assert.equal(a.annualExtraCost, 921.6);
  assert.equal(a.maxSustainableUnitPrice, 0.1967);
});

test('HAGGLE strategies are deterministic and priced', () => {
  const a = haggleAnalysis(input);
  const s = haggleStrategies(a, input);
  const counter = s.find((x) => x.id === 'counter-019');
  assert.equal(counter.unitPrice, 0.19);
  assert.equal(counter.savingVsNewPerMonth, 48);
  assert.equal(counter.foodCostPct, 29.75);
  assert.ok(s.find((x) => x.id === 'freeze').extraVsOldPerMonth === 0);
});

test('State machine blocks invalid transitions and agent approval', () => {
  const c = { state: 'DRAFT', audit: [] };
  assert.equal(canTransition('DRAFT', 'APPROVED'), false);
  assert.throws(() => transitionCase(c, 'APPROVED', { name: 'Agent', kind: 'agent' }), /Invalid transition/);
  transitionCase(c, 'INTAKE', { name: 'Owner', kind: 'human' });
  assert.equal(c.state, 'INTAKE');
});

test('Approval gate: agent cannot approve, human can only with pending approval', () => {
  const c = { state: 'AWAITING_APPROVAL', pendingApproval: { proposalId: 'P2', terms: '$0.19' }, audit: [] };
  assert.throws(() => transitionCase({ ...c, audit: [] }, 'APPROVED', { name: 'Agent', kind: 'agent' }), /Only a human/);
  const ok = transitionCase(c, 'APPROVED', { name: 'Mara', kind: 'human' });
  assert.equal(ok.state, 'APPROVED');
  assert.equal(ok.approval.approvedBy, 'Mara');
});

// QA 2026-11-06 (H1): approving a case must clear the pending approval,
// otherwise a COMPLETED case still shows "awaiting your approval" in the
// Decisions view, the case overview and the rail panel at the same time.
test('Approving or rejecting a case clears its pending approval', () => {
  const approved = { state: 'AWAITING_APPROVAL', pendingApproval: { proposalId: 'P2', terms: '$0.19' }, audit: [] };
  transitionCase(approved, 'APPROVED', { name: 'Mara', kind: 'human' });
  assert.equal(approved.pendingApproval, null);
  assert.ok(approved.approval, 'approval record is kept');

  const rejected = { state: 'AWAITING_APPROVAL', pendingApproval: { proposalId: 'P2', terms: '$0.19' }, audit: [] };
  transitionCase(rejected, 'REJECTED', { name: 'Mara', kind: 'human' });
  assert.equal(rejected.pendingApproval, null);
});

test('COURT conflict detection finds salt/fat/simmer conflicts, not tomato', () => {
  const versions = [
    { id: 'card', author: 'Nonna', ingredients: { salt: 'a pinch', fat: 'lard', simmer: '3 hours', tomato: 'San Marzano' } },
    { id: 'auntie', author: 'Auntie', ingredients: { salt: '1 tbsp', fat: 'butter', simmer: '3 hours', tomato: 'San Marzano' } },
    { id: 'cousin', author: 'Cousin', ingredients: { salt: 'none', fat: 'butter', simmer: '90 min', tomato: 'San Marzano' } },
  ];
  const conf = courtConflicts(versions);
  const byVar = Object.fromEntries(conf.map((x) => [x.variable, x.conflict]));
  assert.equal(byVar.salt, true); assert.equal(byVar.fat, true); assert.equal(byVar.simmer, true); assert.equal(byVar.tomato, false);
});

test('COURT tally computes means and flags disagreement >=2', () => {
  const tally = courtTally([
    { reader: 'A', sampleCode: 'A', scores: { taste: 5, texture: 4, aroma: 4, appearance: 4, difficulty: 3, overall: 5 } },
    { reader: 'B', sampleCode: 'A', scores: { taste: 2, texture: 4, aroma: 3, appearance: 4, difficulty: 3, overall: 2 } },
  ]);
  assert.equal(tally.A.means.taste, 3.5);
  assert.equal(tally.A.maxDisagreement, 3);
});

test('CORRECTION extracts factual claims, separates opinions, human-only status change', () => {
  const claims = extractClaims('I led the 2023 Clarion-Clipperton survey. We found that 40 percent of species there are still undescribed. I think deep-sea mining is the most important ocean issue of our time.');
  assert.equal(claims.length, 2);
  assert.equal(claims[0].kind, 'factual-assertion');
  assert.equal(claims[0].status, 'Unresolved');
  assert.throws(() => setClaimStatus(claims[0], 'Corrected', { kind: 'agent', name: 'Agent' }), /Only a human/);
  setClaimStatus(claims[0], 'Corrected', { kind: 'human', name: 'Host' });
  assert.equal(claims[0].status, 'Corrected');
});

test('Switch stub: health, register, ops catalog, post/read', () => {
  const stub = createStubState();
  assert.equal(stub.mode, 'SIMULATED');
  assert.equal(stubHealth().mode, 'SIMULATED');
  const agent = stubRegisterAgent(stub, { name: 'converge-negotiator', description: 'test' });
  assert.ok(agent.id && agent.api_key);
  assert.ok(stubGetOps().some((o) => o.name === 'post_message'));
  assert.ok(OPERATION_CATALOG.includes('post_message'));
  const msg = stubCallOp(stub, 'post_message', { room: '#haggle-dairyco', author: 'Owner', text: 'Approve $0.19?' });
  assert.equal(msg.simulated, true);
  assert.throws(() => stubCallOp(stub, 'no_such_op', {}), /Unknown operation/);
});
