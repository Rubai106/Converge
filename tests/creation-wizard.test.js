// CONVERGE creation-wizard tests — guided HAGGLE case creation UI.
//
// Static tests in the style of tests/escaping.test.js: they extract the
// SHIPPED wizard code from app/app.js (not a copy) and exercise it.
// The validators and payload builder are pure functions in app.js, so
// they can be loaded directly; the fetch calls are asserted by locating
// them in the shipped source (the live server round-trip is covered by
// tests/case-creation.test.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'app', 'app.js'), 'utf8');

function extractFunction(name) {
  const start = src.indexOf(`function ${name}(`);
  assert.ok(start !== -1, `${name}() definition not found in app/app.js`);
  const brace = src.indexOf('{', start);
  let depth = 0;
  for (let i = brace; i < src.length; i++) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') { depth -= 1; if (depth === 0) return src.slice(start, i + 1); }
  }
  throw new Error(`unbalanced braces in ${name}()`);
}

function loadWizardCode() {
  const units = src.match(/const WIZARD_UNITS = \[[^\]]*\];/);
  assert.ok(units, 'WIZARD_UNITS definition not found in app/app.js');
  const code = `${units[0]}\n${extractFunction('validateWizardStep')}\n${extractFunction('wizardPayload')}`;
  return new Function(`${code}; return { WIZARD_UNITS, validateWizardStep, wizardPayload };`)();
}
const { WIZARD_UNITS, validateWizardStep, wizardPayload } = loadWizardCode();

const valid = {
  supplier: 'DairyCo', ingredient: 'heavy cream', recipe: 'Alfredo',
  oldPrice: '0.16', newPrice: '0.24', unit: 'fl oz', qtyPerServing: '6',
  otherIngredientsCostPerServing: '3.62', menuPrice: '16', monthlySales: '160',
  targetFoodCostPct: '30', targetPrice: '0.16', maxApprovedPrice: '0.20',
  evidenceSource: 'DairyCo invoice',
};

test('wizard create step posts to /api/cases and opens the new case workspace', () => {
  // The step-5 submit handler posts the wizard payload to /api/cases…
  assert.ok(src.includes("api('/api/cases', { method: 'POST'"), 'wizard must POST to /api/cases on Create');
  // …with the payload built by wizardPayload from the wizard values…
  assert.ok(src.includes('wizardPayload(wizard.values)') || src.includes('wizardPayload(w.values)'), 'create must send wizardPayload(wizard.values)');
  // …and on success opens the created case workspace.
  const createBlock = src.slice(src.indexOf("api('/api/cases', { method: 'POST'"));
  assert.ok(createBlock.slice(0, 800).includes('openCase(created.id)'), 'create success must open the new case workspace');
  // The button that triggers it is labelled "Create case".
  assert.ok(src.includes('Create case'), 'wizard must have a "Create case" button');
});

test('wizard review step posts to /api/cases/preview', () => {
  assert.ok(src.includes("api('/api/cases/preview', { method: 'POST'"), 'review step must POST to /api/cases/preview');
  const previewBlock = src.slice(src.indexOf("api('/api/cases/preview', { method: 'POST'"));
  assert.ok(previewBlock.slice(0, 400).includes('wizardPayload'), 'preview must send the wizard payload');
  // A 400 from preview is shown and the user can go back to fix the step.
  assert.ok(src.includes('previewError'), 'preview failure must be stored and shown');
  assert.ok(src.includes('Go to step'), 'preview failure must offer a way back to the offending step');
});

test('wizard is reachable from the dashboard and the Active Cases view', () => {
  const buttons = src.match(/id="new-case-btn"/g) || [];
  assert.ok(buttons.length >= 2, `expected a "New supplier case" button in dashboard + Active Cases, found ${buttons.length}`);
  assert.ok(src.includes('New supplier case'), 'wizard entry point must be labelled "New supplier case"');
  assert.ok(src.includes("addEventListener('click', openWizard)"), 'buttons must open the wizard');
});

test('wizard cancel returns to the dashboard without creating anything', () => {
  const cancel = extractFunction('cancelWizard');
  assert.ok(cancel.includes("setView('overview')"), 'cancel must return to the dashboard');
  assert.ok(!cancel.includes('api('), 'cancel must not call the API');
  assert.ok(src.includes('id="wz-cancel"'), 'wizard must have a Cancel action');
});

test('step 1 validator rejects empty supplier / ingredient, accepts valid input', () => {
  assert.deepEqual(validateWizardStep(1, valid), {});
  assert.match(validateWizardStep(1, { ...valid, supplier: '' }).supplier, /Supplier/);
  assert.match(validateWizardStep(1, { ...valid, supplier: '   ' }).supplier, /Supplier/);
  assert.match(validateWizardStep(1, { ...valid, ingredient: '' }).ingredient, /Ingredient/);
  // Recipe is optional.
  assert.deepEqual(validateWizardStep(1, { ...valid, recipe: '' }), {});
});

test('step 2 validator rejects negative prices and unsupported units', () => {
  assert.deepEqual(validateWizardStep(2, valid), {});
  assert.match(validateWizardStep(2, { ...valid, oldPrice: '-0.5' }).oldPrice, /Old price/);
  assert.match(validateWizardStep(2, { ...valid, newPrice: '-1' }).newPrice, /New price/);
  assert.match(validateWizardStep(2, { ...valid, oldPrice: '' }).oldPrice, /Old price/);
  assert.match(validateWizardStep(2, { ...valid, oldPrice: 'not-a-number' }).oldPrice, /Old price/);
  const unitErr = validateWizardStep(2, { ...valid, unit: 'gallon' }).unit;
  assert.match(unitErr, /Unit must be one of:/);
  for (const u of ['fl oz', 'oz', 'lb', 'kg', 'g', 'L', 'ml', 'each', 'serving']) {
    assert.match(unitErr, new RegExp(u.replace(' ', '\\s')), `unsupported-unit error must list ${u}`);
  }
  assert.match(validateWizardStep(2, { ...valid, qtyPerServing: '0' }).qtyPerServing, /Quantity per serving/);
  assert.match(validateWizardStep(2, { ...valid, qtyPerServing: '-2' }).qtyPerServing, /Quantity per serving/);
});

test('step 3 validator mirrors the server ranges (menu price and target % must be > 0)', () => {
  assert.deepEqual(validateWizardStep(3, valid), {});
  assert.match(validateWizardStep(3, { ...valid, menuPrice: '0' }).menuPrice, /Menu price/);
  assert.match(validateWizardStep(3, { ...valid, targetFoodCostPct: '0' }).targetFoodCostPct, /Target food cost/);
  assert.match(validateWizardStep(3, { ...valid, otherIngredientsCostPerServing: '-1' }).otherIngredientsCostPerServing, /Other ingredient costs/);
  // Monthly volume may be zero (server allows >= 0).
  assert.deepEqual(validateWizardStep(3, { ...valid, monthlySales: '0' }), {});
});

test('step 4 validator rejects targetPrice above maxApprovedPrice', () => {
  assert.deepEqual(validateWizardStep(4, valid), {});
  const err = validateWizardStep(4, { ...valid, targetPrice: '0.30', maxApprovedPrice: '0.20' });
  assert.match(err.targetPrice, /less than or equal to max approved price/);
  // Equal is allowed.
  assert.deepEqual(validateWizardStep(4, { ...valid, targetPrice: '0.20', maxApprovedPrice: '0.20' }), {});
  assert.match(validateWizardStep(4, { ...valid, targetPrice: '-0.1' }).targetPrice, /Target price/);
  assert.match(validateWizardStep(4, { ...valid, maxApprovedPrice: '' }).maxApprovedPrice, /Max approved price/);
});

test('wizardPayload normalises the wizard values for the API', () => {
  const p = wizardPayload({ ...valid, supplier: '  DairyCo  ', recipe: '' });
  assert.equal(p.supplier, 'DairyCo');
  assert.equal(p.oldPrice, 0.16);
  assert.equal(p.newPrice, 0.24);
  assert.equal(p.qtyPerServing, 6);
  assert.equal(p.menuPrice, 16);
  assert.equal(p.monthlySales, 160);
  assert.equal(p.targetFoodCostPct, 30);
  assert.equal(p.targetPrice, 0.16);
  assert.equal(p.maxApprovedPrice, 0.2);
  assert.equal(p.unit, 'fl oz');
  assert.equal(p.evidenceSource, 'DairyCo invoice');
});

test('wizard walk-away copy labels the max price clearly', () => {
  assert.ok(src.includes('Walk away above'), 'step 4 must label the walk-away price as "above $max"');
  assert.ok(src.includes('walk away above'), 'review assumptions must restate the walk-away price');
});
