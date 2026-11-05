// REGRESSION tests for genuine bugs found in the 2026-11-06 QA pass.
// They pin the desired behaviour for the HAGGLE engine edge cases
// (Infinity/NaN leaks, string-price crash). Run with npm test.
// Do NOT edit them to pass; fix the engine instead.
import test from 'node:test';
import assert from 'node:assert/strict';
import { haggleAnalysis, haggleStrategies } from '../server/engine.js';

const base = {
  supplier: 'DairyCo', ingredient: 'heavy cream', oldPrice: 0.16, newPrice: 0.24,
  unit: 'fl oz', qtyPerServing: 6, otherIngredientsCostPerServing: 3.62,
  menuPrice: 16.0, monthlySales: 160, targetFoodCostPct: 30,
};
const finiteCheck = (o, label) => {
  const bad = [];
  JSON.stringify(o, (k, v) => {
    if (typeof v === 'number' && !Number.isFinite(v)) bad.push(`${label}.${k}=${v}`);
    return v;
  });
  assert.deepEqual(bad, [], `non-finite numbers in ${label}: ${bad.join(', ')}`);
};

// BUG-1a: Infinity prices pass the guard and leak Infinity into every
// downstream field (monthlyExtraCost, annualExtraCost, food-cost %, ...).
test('REGRESSION: Infinity prices must be rejected', () => {
  assert.throws(() => haggleAnalysis({ ...base, newPrice: Infinity }), /Invalid HAGGLE inputs/);
  assert.throws(() => haggleAnalysis({ ...base, oldPrice: Infinity }), /Invalid HAGGLE inputs/);
  assert.throws(() => haggleAnalysis({ ...base, qtyPerServing: Infinity }), /Invalid HAGGLE inputs/);
  assert.throws(() => haggleAnalysis({ ...base, menuPrice: Infinity }), /Invalid HAGGLE inputs/);
});

// BUG-1b: missing otherIngredientsCostPerServing is not validated;
// oldTotal/newTotal/food %/margins/maxSustainable all come back NaN.
test('REGRESSION: missing otherIngredientsCostPerServing must not yield NaN', () => {
  const { otherIngredientsCostPerServing, ...rest } = base;
  assert.throws(() => haggleAnalysis(rest), /Invalid HAGGLE inputs/);
});

// BUG-1c: missing targetFoodCostPct is not validated; targetTotal and
// maxSustainableUnitPrice come back NaN.
test('REGRESSION: missing targetFoodCostPct must not yield NaN', () => {
  const { targetFoodCostPct, ...rest } = base;
  assert.throws(() => haggleAnalysis(rest), /Invalid HAGGLE inputs/);
});

// BUG-2: string prices coerce silently in haggleAnalysis (returns numbers)
// but haggleStrategies crashes with TypeError: oldPrice.toFixed is not a
// function — so GET /api/cases/:id 500s for a HAGGLE case whose input
// prices are strings. Either reject non-number inputs in the analysis
// guard, or make strategies type-safe; the two must agree.
test('REGRESSION: string prices must not crash haggleStrategies', () => {
  const a = haggleAnalysis({ ...base, oldPrice: '0.16', newPrice: '0.24' });
  finiteCheck(a, 'analysis');
  assert.doesNotThrow(() => haggleStrategies(a, { ...base, oldPrice: '0.16', newPrice: '0.24' }));
});

// Safety net: no malformed input may ever produce NaN/Infinity output.
test('REGRESSION: malformed-input battery never yields non-finite output', () => {
  const variants = [
    { ...base, newPrice: Infinity },
    { ...base, oldPrice: -0 },
    { ...base, monthlySales: 1e12, newPrice: 1e12 },
    { ...base, targetFoodCostPct: 0 },
    { ...base, targetFoodCostPct: 100 },
    { ...base, qtyPerServing: 0.001, newPrice: 0.001 },
  ];
  for (const v of variants) {
    let out;
    try { out = haggleAnalysis(v); } catch { continue; } // rejection is fine
    finiteCheck(out, 'analysis');
  }
});
