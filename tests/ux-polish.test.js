// CONVERGE UX-polish regression tests (2026-11-06).
//
// Rubai's first Windows run (HAG-015: $4→$5/kg, 5 kg/serving, $5 menu)
// exposed a 600% food cost rendered as a 1500%-wide bar, a wizard that
// never flagged the inputs, a dense Overview, and a Move dropdown that
// competed with Submit for approval. These tests pin the fixes:
//   - bulletPositions bounds the chart (0–40% scale, off-scale flagged),
//   - haggleInputWarnings flags implausible inputs (confirmation only),
//   - recommendedStrategy / haggleNextStep orient the user,
//   - moveOptions no longer offers PROPOSAL; Move labels are plain words,
//   - the chart lives in Analysis, the Overview keeps key figures + Next step.
//
// Pure helpers are extracted from the shipped app/app.js and run (the
// remediation pattern), so the tests fail if the shipped code regresses.
// Live rendering is covered by tests/ux-polish-journey.test.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { haggleAnalysis, haggleStrategies } from '../server/engine.js';
import { seedData } from '../server/store.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'app', 'app.js'), 'utf8');
const css = readFileSync(join(root, 'app', 'styles.css'), 'utf8');
const readme = readFileSync(join(root, 'README.md'), 'utf8');

function extract(re, label) {
  const m = src.match(re);
  assert.ok(m, `${label} not found in app/app.js — the extractor needs updating`);
  return m[0];
}
function fnBody(name) {
  const start = src.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name}() not found in app/app.js`);
  const after = src.slice(start);
  const next = after.indexOf('\nfunction ', 1);
  return next === -1 ? after : after.slice(0, next);
}

// Shipped one-liners the helpers depend on.
const consts = [
  extract(/const esc = \(s\) => [^\n]+/, 'esc'),
  extract(/const money = \(n\) => [^\n]+/, 'money'),
  extract(/const signedMoney = \(n\) => [^\n]+/, 'signedMoney'),
  extract(/const pct = \(n\) => [^\n]+/, 'pct'),
].join('\n');

const bulletPositions = new Function(
  `${extract(/const BULLET_SCALE_MAX = \d+;/, 'BULLET_SCALE_MAX')}\n${extract(/function bulletPositions\([\s\S]*?\n\}/, 'bulletPositions')}\nreturn bulletPositions;`,
)();
const haggleInputWarnings = new Function(
  `${consts}\n${extract(/const WIZARD_QTY_PLAUSIBLE_MAX = \{[^}]+\};/, 'WIZARD_QTY_PLAUSIBLE_MAX')}\n${extract(/function haggleInputWarnings\([\s\S]*?\n\}/, 'haggleInputWarnings')}\nreturn haggleInputWarnings;`,
)();
const recommendedStrategy = new Function(
  `${extract(/function recommendedStrategy\([\s\S]*?\n\}/, 'recommendedStrategy')}\nreturn recommendedStrategy;`,
)();
const haggleNextStep = new Function(
  `${consts}\n${extract(/const STRATEGY_TERMS = \{[\s\S]*?\n\};/, 'STRATEGY_TERMS')}\n${extract(/function termsForStrategy\([\s\S]*?\n\}/, 'termsForStrategy')}\n${extract(/function recommendedStrategy\([\s\S]*?\n\}/, 'recommendedStrategy')}\n${extract(/function haggleNextStep\([\s\S]*?\n\}/, 'haggleNextStep')}\nreturn haggleNextStep;`,
)();
const moveOptions = new Function(
  `${extract(/const TRANSITIONS = \{[\s\S]*?\n\};/, 'TRANSITIONS')}\n${extract(/function moveOptions\([\s\S]*?\n\}/, 'moveOptions')}\nreturn moveOptions;`,
)();
const moveLabel = new Function(
  `${extract(/const MOVE_LABELS = \{[^}]+\};/, 'MOVE_LABELS')}\n${extract(/function moveLabel\([\s\S]*?\n\}/, 'moveLabel')}\nreturn moveLabel;`,
)();

// ---------- bulletPositions: bounded, off-scale flagged ----------
test('bullet: 0%, normal and 40% map inside the track, nothing off-scale', () => {
  assert.deepEqual(bulletPositions(0, 0, 30), { bar: 0, old: 0, target: 75, heroOffScale: false, oldOffScale: false, targetOffScale: false });
  assert.deepEqual(bulletPositions(15, 10, 30), { bar: 37.5, old: 25, target: 75, heroOffScale: false, oldOffScale: false, targetOffScale: false });
  assert.deepEqual(bulletPositions(30, 28.63, 30), { bar: 75, old: 71.575, target: 75, heroOffScale: false, oldOffScale: false, targetOffScale: false });
  assert.deepEqual(bulletPositions(40, 40, 40), { bar: 100, old: 100, target: 100, heroOffScale: false, oldOffScale: false, targetOffScale: false });
});

test('bullet: 100% and 600% fill the track and are flagged off-scale', () => {
  const at100 = bulletPositions(100, 50, 30);
  assert.equal(at100.bar, 100);
  assert.equal(at100.heroOffScale, true);
  const extreme = bulletPositions(600, 500, 30);
  assert.equal(extreme.bar, 100, 'a 600% food cost must not draw a 1500%-wide bar');
  assert.equal(extreme.old, 100, 'a 500% old value must not draw outside the track');
  assert.equal(extreme.heroOffScale, true);
  assert.equal(extreme.oldOffScale, true);
  assert.equal(extreme.targetOffScale, false);
});

test('bullet: negative values clamp to 0, an off-scale target is flagged', () => {
  assert.equal(bulletPositions(-10, 0, 30).bar, 0);
  const t = bulletPositions(30, 20, 50);
  assert.equal(t.target, 100);
  assert.equal(t.targetOffScale, true);
});

// ---------- haggleInputWarnings: confirmation only, never a block ----------
const normalValues = { supplier: 'DairyCo', ingredient: 'heavy cream', recipe: 'Alfredo', oldPrice: '0.16', newPrice: '0.24', unit: 'fl oz', qtyPerServing: '6', otherIngredientsCostPerServing: '3.62', menuPrice: '16', monthlySales: '160', targetFoodCostPct: '30', targetPrice: '0.16', maxApprovedPrice: '0.20' };
const hag015Values = { supplier: 'dc', ingredient: 'hc', recipe: 'al', oldPrice: '4', newPrice: '5', unit: 'kg', qtyPerServing: '5', otherIngredientsCostPerServing: '5', menuPrice: '5', monthlySales: '5', targetFoodCostPct: '30', targetPrice: '4', maxApprovedPrice: '5' };

test('warnings: a normal case warns about nothing', () => {
  const a = haggleAnalysis({ ...normalValues, oldPrice: 0.16, newPrice: 0.24, qtyPerServing: 6, otherIngredientsCostPerServing: 3.62, menuPrice: 16, monthlySales: 160, targetFoodCostPct: 30 });
  assert.deepEqual(haggleInputWarnings(normalValues, a), []);
});

test('warnings: Rubai’s HAG-015 values raise all four warnings', () => {
  const a = haggleAnalysis({ ...hag015Values, oldPrice: 4, newPrice: 5, qtyPerServing: 5, otherIngredientsCostPerServing: 5, menuPrice: 5, monthlySales: 5, targetFoodCostPct: 30 });
  assert.equal(a.newFoodCostPct, 600, 'the engine still computes 600% — the warnings are about the inputs, not the maths');
  const ids = haggleInputWarnings(hag015Values, a).map((w) => w.id);
  assert.deepEqual(ids, ['qty', 'menu', 'foodcost', 'sustainable']);
});

test('warnings: an oversized quantity alone warns, even when the maths is fine', () => {
  const v = { ...normalValues, unit: 'kg', qtyPerServing: '5' };
  const a = haggleAnalysis({ ...v, oldPrice: 0.16, newPrice: 0.24, qtyPerServing: 5, otherIngredientsCostPerServing: 3.62, menuPrice: 100, monthlySales: 160, targetFoodCostPct: 30 });
  assert.ok(a.newFoodCostPct < 100 && a.maxSustainableUnitPrice > 0, 'sanity: the maths is fine here');
  assert.deepEqual(haggleInputWarnings(v, a).map((w) => w.id), ['qty']);
});

test('warnings: without a preview only the quantity check applies', () => {
  assert.deepEqual(haggleInputWarnings(hag015Values, null).map((w) => w.id), ['qty']);
  assert.deepEqual(haggleInputWarnings(normalValues, null), []);
});

// ---------- recommendedStrategy / haggleNextStep ----------
// The server enriches a stored case with the engine's analysis +
// strategies when it serves it; the seed alone has neither, so the
// helper builds the case the way the server does.
function hagCase(overrides = {}) {
  const d = seedData();
  const c = JSON.parse(JSON.stringify(d.cases.find((x) => x.id === 'HAG-014')));
  Object.assign(c, overrides);
  const analysis = haggleAnalysis(c.input);
  c.analysis = analysis;
  c.strategies = haggleStrategies(analysis, c.input);
  return c;
}

test('recommendation: HAG-014 recommends the freeze (in mandate, under target)', () => {
  const rec = recommendedStrategy(hagCase());
  assert.equal(rec.id, 'freeze');
});

test('recommendation: when the cheapest option misses the target, the next in-mandate one wins', () => {
  // Old food cost 30.13% > 30% target, so the freeze misses; the $0.19
  // counter lands at 29.75% and is in mandate.
  const input = { supplier: 'DairyCo', ingredient: 'heavy cream', recipe: 'Alfredo', oldPrice: 0.20, newPrice: 0.24, unit: 'fl oz', qtyPerServing: 6, otherIngredientsCostPerServing: 3.62, menuPrice: 16, monthlySales: 160, targetFoodCostPct: 30, targetPrice: 0.16, maxApprovedPrice: 0.20 };
  const c = hagCase({ input });
  assert.equal(recommendedStrategy(c).id, 'counter-019');
});

test('recommendation: no in-mandate strategy means no recommendation', () => {
  const c = hagCase({ input: { ...hagCase().input, maxApprovedPrice: 0.10 } });
  assert.equal(recommendedStrategy(c), null);
});

test('next step: DISCUSSION points at Negotiation with the recommendation', () => {
  const ns = haggleNextStep(hagCase({ state: 'DISCUSSION' }));
  assert.equal(ns.button, 'Review strategies →');
  assert.equal(ns.tab, 'negotiation');
  assert.match(ns.stage, /Discussion/);
  assert.match(ns.action, /Price freeze/);
});

test('next step: AWAITING_APPROVAL points at review, APPROVED/COMPLETED at the decision', () => {
  const awaiting = hagCase({ state: 'AWAITING_APPROVAL', pendingApproval: { terms: '$0.19/fl oz for 6 weeks, in writing', requestedBy: 'Negotiation Agent' } });
  assert.equal(haggleNextStep(awaiting).button, 'Review approval');
  assert.equal(haggleNextStep(awaiting).tab, 'negotiation');
  const approved = hagCase({ state: 'APPROVED' });
  assert.equal(haggleNextStep(approved).button, 'View the decision');
  assert.equal(haggleNextStep(approved).tab, 'audit');
  assert.equal(haggleNextStep(hagCase({ state: 'COMPLETED' })).button, 'View the decision');
  assert.equal(haggleNextStep(hagCase({ state: 'REJECTED' })).button, null);
});

// ---------- moveOptions / moveLabel: plain words, no PROPOSAL ----------
test('move: DISCUSSION offers no PROPOSAL; labels are plain words', () => {
  assert.deepEqual(moveOptions('DISCUSSION'), ['BLOCKED', 'CANCELLED']);
  assert.equal(moveLabel('DISCUSSION'), 'Back to Discussion');
  assert.equal(moveLabel('BLOCKED'), 'Mark as blocked');
  assert.equal(moveLabel('CANCELLED'), 'Cancel case');
  assert.equal(moveLabel('COMPLETED'), 'Mark as completed');
});

// ---------- placement: chart in Analysis, key figures + Next step in Overview ----------
test('placement: the Overview keeps key figures and Next step, not the chart', () => {
  const summary = fnBody('haggleSummary');
  assert.ok(summary.includes('Key figures'), 'Overview left column must be Key figures');
  assert.ok(!summary.includes('bullet'), 'the chart must not be in the Overview summary');
  assert.ok(!summary.includes('Financial impact'), 'the detailed panel must not be in the Overview');
  assert.ok(summary.includes('data-goto-tab="analysis"'), 'Key figures must link to Analysis');
  const overview = fnBody('overviewTab');
  assert.ok(overview.includes('Next step'), 'Overview must have a Next step panel');
  // Revised 2026-11-06: one shared Next step (caseNextStep) for every
  // workflow, not a HAGGLE-only one.
  assert.ok(overview.includes('caseNextStep'), 'Next step must come from the shared caseNextStep');
  assert.ok(!overview.includes('haggleNextStep'), 'no workflow may keep its own Next step');
  const analysis = fnBody('analysisTab');
  assert.ok(analysis.includes('bullet-wrap'), 'the chart must live in Analysis');
  assert.ok(analysis.includes('bullet-offscale'), 'Analysis must flag off-scale values');
  assert.ok(analysis.includes('Owner mandate'), 'the mandate must live in Analysis');
});

test('placement: the header has one primary action; the rail hides an empty Approvals panel', () => {
  const render = fnBody('renderCase');
  assert.ok(render.includes('casePrimaryAction(c)'), 'the header must use the primary action');
  assert.ok(render.includes('moveLabel(t)'), 'Move options must use plain labels');
  const rail = fnBody('railPanels');
  assert.ok(rail.includes("(c.pendingApproval || c.approval || c.rejectedTerms) ?"), 'Approvals must render only when there is something to show');
  assert.ok(!rail.includes('No pending approval on this case'), 'the empty Approvals panel must be gone');
});

test('placement: the wizard explains units and confirms warnings', () => {
  const fields = fnBody('wizardStepFields');
  assert.ok(fields.includes('Price is per the unit'), 'step 2 must explain price-per-unit');
  assert.ok(fields.includes('6 fl oz, 0.15 kg or 150 g'), 'step 2 must give unit-aware examples');
  const review = fnBody('wizardReviewStep');
  assert.ok(review.includes('warn-box'), 'the review step must show the warning box');
  assert.ok(review.includes('wz-ack'), 'the review step must have the acknowledgement checkbox');
  assert.ok(review.includes('haggleInputWarnings'), 'warnings must come from haggleInputWarnings');
  assert.ok(src.includes('wizard.acknowledged'), 'acknowledgement must be tracked in wizard state');
});

// ---------- CSS + docs ----------
test('css: the bullet cannot escape its track; the new panels are styled', () => {
  assert.ok(css.includes('.bullet .bullet-bar{position:absolute;left:0;top:0;bottom:0;background:var(--red);border-radius:2px;max-width:100%}'), 'the bar must be capped at the track width');
  assert.ok(css.includes('.bullet-offscale'), 'the off-scale note must be styled');
  assert.ok(css.includes('.next-step-panel'), 'the Next step panel must be styled');
  assert.ok(css.includes('.warn-box'), 'the warning box must be styled');
  assert.ok(css.includes('.link-btn'), 'the text link must be styled');
  // The new panels use solid colours from the existing palette (the
  // only linear-gradients in the file are the pre-existing table
  // scroll shadows).
  assert.ok(css.includes('.next-step-panel{background:var(--teal-bg)'), 'the Next step panel must use the solid teal tint');
  assert.ok(css.includes('.warn-box{border:1px solid #E3D3A8;background:#FDF8E7'), 'the warning box must use the solid amber treatment');
});

test('docs: README names Playwright as a devDependency and separates STUB from REAL', () => {
  assert.ok(readme.includes('development dependency'), 'README must say Playwright is a development dependency');
  assert.ok(readme.includes('SIMULATED-STUB'), 'README must name the stub mode');
  assert.ok(readme.includes('REAL-SWITCH'), 'README must name the real mode');
  assert.ok(!readme.includes('No npm dependencies'), 'the old "no dependencies" line must be gone');
});
