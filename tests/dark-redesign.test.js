// CONVERGE dark-redesign regression tests (2026-11-07) — the approved
// dark charcoal/cyan/lime reskin (§13) plus the P0 client fixes:
//   - H6: termsForStrategy computes terms from the strategy's own
//     unitPrice/duration/unit and the case unit — no hardcoded table;
//   - H7: haggleTimeline derives the Negotiation timeline from the case
//     and never invents a counter-offer;
//   - M9: stepperInfo resolves terminal states from the audit trail;
//   - M10: moveLabel is direction-aware; advanceTarget offers the next
//     forward step for early cases;
//   - L10: money()/pct()/signedMoney()/signedPct() render "—" for
//     non-finite input;
//   - WCAG AA: every text/background pair parsed from the :root tokens
//     in styles.css meets >= 4.5:1.
//
// Pure helpers are extracted from the shipped app/app.js and run (the
// remediation pattern). Live rendering is covered by
// tests/dark-redesign-journey.test.js.
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

const consts = [
  extract(/const esc = \(s\) => [^\n]+/, 'esc'),
  extract(/const money = \(n\) => [^\n]+/, 'money'),
  extract(/const signedMoney = \(n\) => [^\n]+/, 'signedMoney'),
  extract(/const signedPct = \(n\) => [^\n]+/, 'signedPct'),
  extract(/const pct = \(n\) => [^\n]+/, 'pct'),
].join('\n');
const money = new Function(`${consts}\nreturn money;`)();
const pct = new Function(`${consts}\nreturn pct;`)();
const signedMoney = new Function(`${consts}\nreturn signedMoney;`)();
const signedPct = new Function(`${consts}\nreturn signedPct;`)();

const termsForStrategy = new Function(
  `${consts}\n${fnBody('termsForStrategy')}\nreturn termsForStrategy;`,
)();
const haggleTimeline = new Function(
  `${consts}\n${extract(/const PROPOSAL_TO_STRATEGY = \{[^}]+\};/, 'PROPOSAL_TO_STRATEGY')}\n${fnBody('approvedStrategy')}\n${fnBody('haggleTimeline')}\nreturn haggleTimeline;`,
)();
const stepperInfo = new Function(
  `${extract(/const STEP_INDEX = \{[^}]+\};/, 'STEP_INDEX')}\n${extract(/const TERMINAL_NEG = \[[^\]]+\];/, 'TERMINAL_NEG')}\n${fnBody('stepperInfo')}\nreturn stepperInfo;`,
)();
const moveLabel = new Function(
  `${extract(/const STATE_ORDER = \[[^\]]+\];/, 'STATE_ORDER')}\n${fnBody('moveLabel')}\nreturn moveLabel;`,
)();
const advanceTarget = new Function(
  `${extract(/const TRANSITIONS = \{[\s\S]*?\n\};/, 'TRANSITIONS')}\n${extract(/const STATE_ORDER = \[[^\]]+\];/, 'STATE_ORDER')}\n${fnBody('advanceTarget')}\nreturn advanceTarget;`,
)();

// ---------- H6: terms derivation ----------
test('dark: terms come from the strategy and the case unit — a $4.00/kg case signs in kg', () => {
  const kg = { input: { unit: 'kg' } };
  assert.equal(termsForStrategy({ id: 'counter-019', unitPrice: 4.0, duration: '6 weeks', unit: 'kg' }, kg).full, '$4.00 / kg for 6 weeks');
  assert.equal(termsForStrategy({ id: 'counter-019', unitPrice: 4.0, duration: '6 weeks', unit: 'kg' }, kg).short, '$4.00 / kg · 6 weeks');
  // The strategy unit wins when present; the case unit is the fallback.
  assert.equal(termsForStrategy({ id: 'counter-019', unitPrice: 4.5, duration: '6 weeks' }, kg).full, '$4.50 / kg for 6 weeks');
  // A strategy with no duration signs the price alone.
  assert.equal(termsForStrategy({ id: 'substitute', unitPrice: 0.16, duration: 'trial', unit: 'fl oz' }).full, '$0.16 / fl oz for trial');
  assert.equal(termsForStrategy({ id: 'nope', unitPrice: 0.22 }).full, '$0.22 / fl oz');
  // No hardcoded table survives in the shipped client.
  assert.ok(!src.includes('STRATEGY_TERMS'), 'the hardcoded STRATEGY_TERMS table must be gone');
  assert.ok(!src.includes('MOVE_LABELS'), 'the static MOVE_LABELS table must be gone');
});

test('dark: the engine-derived counter terms agree with the client terms for the seed', () => {
  const d = seedData();
  const c = JSON.parse(JSON.stringify(d.cases.find((x) => x.id === 'HAG-014')));
  c.analysis = haggleAnalysis(c.input);
  c.strategies = haggleStrategies(c.analysis, c.input);
  const counter = c.strategies.find((s) => s.id === 'counter-019');
  assert.equal(counter.unitPrice, 0.18, 'the engine derives the counter at $0.18 for the seed');
  assert.equal(termsForStrategy(counter, c).full, '$0.18 / fl oz for 6 weeks');
  assert.equal(c.pendingApproval.terms, '$0.18 / fl oz for 6 weeks', 'the seed pending terms match the derived terms');
});

// ---------- H7: timeline derivation ----------
function hagCase(overrides = {}) {
  const d = seedData();
  const c = JSON.parse(JSON.stringify(d.cases.find((x) => x.id === 'HAG-014')));
  Object.assign(c, overrides);
  c.analysis = haggleAnalysis(c.input);
  c.strategies = haggleStrategies(c.analysis, c.input);
  return c;
}

test('dark: the timeline shows the real pending counter-offer, never a fabricated $0.19', () => {
  const rows = haggleTimeline(hagCase());
  assert.equal(rows.length, 4);
  assert.equal(rows[0].label, 'Old price — baseline');
  assert.equal(rows[0].who, 'DairyCo rate card');
  assert.equal(rows[1].label, 'Supplier proposal (+50%)');
  assert.equal(rows[1].who, 'DairyCo rep');
  assert.equal(rows[2].label, 'Counter-offer — $0.18 / fl oz for 6 weeks');
  assert.equal(rows[2].who, 'DairyCo rep · P2');
  assert.equal(rows[3].label, 'Approval — pending owner decision');
  assert.ok(!JSON.stringify(rows).includes('$0.19'), 'no $0.19 counter-offer may appear anywhere');
});

test('dark: with nothing pending, the timeline has no counter-offer row at all', () => {
  const c = hagCase({ state: 'DISCUSSION', pendingApproval: null, approval: null });
  const rows = haggleTimeline(c);
  assert.equal(rows.length, 3);
  assert.ok(!rows.some((r) => r.label.startsWith('Counter-offer')), 'no counter-offer row without a pending/approved proposal');
  assert.equal(rows[2].label, 'Approval — pending owner decision');
  assert.equal(rows[2].price, '?');
  assert.ok(!JSON.stringify(rows).includes('Counter-offer'), 'the word must not appear');
});

test('dark: the timeline uses the case supplier and unit, never DairyCo/fl oz for another case', () => {
  const input = { supplier: 'GreenFields', ingredient: 'butter', recipe: 'Croissant', oldPrice: 4, newPrice: 5, unit: 'kg', qtyPerServing: 5, otherIngredientsCostPerServing: 5, menuPrice: 50, monthlySales: 100, targetFoodCostPct: 30, targetPrice: 4, maxApprovedPrice: 5 };
  const c = hagCase({ input, state: 'DISCUSSION', pendingApproval: null, approval: null });
  const rows = haggleTimeline(c);
  assert.equal(rows[0].who, 'GreenFields rate card');
  assert.equal(rows[1].who, 'GreenFields rep');
  assert.ok(!JSON.stringify(rows).includes('DairyCo'), 'another supplier must not be named DairyCo');
  assert.ok(!JSON.stringify(rows).includes('fl oz'), 'another unit must not render as fl oz');
});

// ---------- M9: stepper terminal states ----------
test('dark: a terminal case keeps its last real step and marks nothing current', () => {
  const rejected = hagCase({
    state: 'REJECTED',
    audit: [{ at: '2026-11-07T00:00:00.000Z', actor: 'Mara · Owner', kind: 'human', event: 'state:DISCUSSION->REJECTED' }],
  });
  assert.deepEqual(stepperInfo(rejected), { idx: 3, terminal: 'REJECTED' });
  const blocked = hagCase({
    state: 'BLOCKED',
    audit: [{ at: '2026-11-07T00:00:00.000Z', actor: 'Mara · Owner', kind: 'human', event: 'state:INVESTIGATING->BLOCKED' }],
  });
  assert.deepEqual(stepperInfo(blocked), { idx: 2, terminal: 'BLOCKED' });
  // No audit transition into the terminal state: no highlight at all.
  assert.deepEqual(stepperInfo(hagCase({ state: 'CANCELLED', audit: [] })), { idx: null, terminal: 'CANCELLED' });
  // Non-terminal states resolve to their own step, INTAKE included.
  assert.deepEqual(stepperInfo(hagCase({ state: 'INTAKE' })), { idx: 1, terminal: null });
  assert.deepEqual(stepperInfo(hagCase({ state: 'AWAITING_APPROVAL' })), { idx: 5, terminal: null });
  assert.deepEqual(stepperInfo(hagCase({ state: 'COMPLETED' })), { idx: 7, terminal: null });
  // The stepper itself has eight steps with INTAKE its own step.
  assert.ok(src.includes("'Draft', 'Intake', 'Investigating', 'Discussion', 'Proposal', 'Awaiting approval', 'Approved', 'Completed'"), 'STEPS must have eight entries with INTAKE');
  assert.ok(src.includes('COMPLETED: 7'), 'STEP_INDEX must map COMPLETED to step 7');
  assert.ok(src.includes('INTAKE: 1'), 'STEP_INDEX must map INTAKE to step 1');
});

// ---------- M10: direction-aware moves + Advance ----------
test('dark: move labels follow direction and an early case has an Advance target', () => {
  assert.equal(moveLabel('INTAKE', 'DRAFT'), 'Move to Intake');
  assert.equal(moveLabel('INVESTIGATING', 'INTAKE'), 'Move to Investigating');
  assert.equal(moveLabel('DISCUSSION', 'INVESTIGATING'), 'Move to Discussion');
  assert.equal(moveLabel('INTAKE', 'DISCUSSION'), 'Back to Intake');
  assert.equal(moveLabel('BLOCKED', 'DISCUSSION'), 'Mark as blocked');
  assert.equal(advanceTarget({ state: 'DRAFT' }), 'INTAKE');
  assert.equal(advanceTarget({ state: 'INTAKE' }), 'INVESTIGATING');
  assert.equal(advanceTarget({ state: 'INVESTIGATING' }), 'DISCUSSION');
  assert.equal(advanceTarget({ state: 'DISCUSSION' }), null);
  assert.equal(advanceTarget({ state: 'COMPLETED' }), null);
  assert.ok(src.includes('id="advance-btn"'), 'the case header must render an Advance button');
});

// ---------- L10: non-finite money/percent ----------
test('dark: money and percent helpers render — for non-finite input', () => {
  // null coerces to 0 via Number() and renders $0.00 — it is finite,
  // so it is not in the non-finite list (L10 is about non-finite input).
  for (const bad of [NaN, undefined, Infinity, -Infinity, 'x']) {
    assert.equal(money(bad), '—', `money(${String(bad)}) must be —`);
    assert.equal(pct(bad), '—', `pct(${String(bad)}) must be —`);
    assert.equal(signedMoney(bad), '—', `signedMoney(${String(bad)}) must be —`);
    assert.equal(signedPct(bad), '—', `signedPct(${String(bad)}) must be —`);
  }
  assert.equal(money(0.19), '$0.19');
  assert.equal(money(-0.06), '$-0.06');
  assert.equal(signedMoney(-0.06), '-$0.06');
  assert.equal(signedMoney(0.48), '+$0.48');
  assert.equal(signedPct(-5), '-5');
  assert.equal(signedPct(50), '+50');
  assert.equal(pct(29.38), '29.38%');
});

// ---------- M12 + CSP: citations are buttons, no inline styles ----------
test('dark: citations are buttons that jump to evidence rows; no inline styles survive', () => {
  assert.ok(src.includes('class="tag-ev tag-ev-link"'), 'citations must be tag-ev-link buttons');
  assert.ok(src.includes('data-evidence='), 'citation buttons must carry the evidence id');
  assert.ok(src.includes('id="ev-${esc(e.id)}"'), 'evidence rows must carry ev-<id> anchors');
  assert.ok(src.includes('pendingEvidenceHighlight'), 'the citation jump must be wired through renderCase');
  assert.ok(src.includes("row.classList.add('flash')"), 'the jumped-to row must be flashed');
  // The only style=" left in app.js is a code comment explaining the
  // CSP rule — no template carries an inline style attribute.
  const styleAttrs = [...src.matchAll(/style="/g)].map((m) => src.slice(Math.max(0, m.index - 60), m.index + 20));
  assert.equal(styleAttrs.length, 1, `expected exactly one style=" (the comment), got ${styleAttrs.length}: ${JSON.stringify(styleAttrs)}`);
  assert.ok(styleAttrs[0].includes('//'), 'the remaining style=" must be in a comment');
});

// ---------- M11/M13/M14: honest, derived copy ----------
test('dark: no named agent is credited with engine work; copy is derived from the case', () => {
  assert.ok(!src.includes('The Negotiation Agent priced'), 'the overview must not credit a Negotiation Agent');
  assert.ok(!src.includes('The Verification Agent extracted'), 'the overview must not credit a Verification Agent');
  assert.ok(!src.includes('the Verification Agent evaluates'), 'the challenge form must not credit a Verification Agent');
  assert.ok(src.includes('CONVERGE calculated'), 'the HAGGLE overview attributes the work to CONVERGE/the engine');
  assert.ok(src.includes('the deterministic engine verified the maths'), 'the HAGGLE overview names the deterministic engine');
  assert.ok(src.includes('the engine extracts claims; humans decide'), 'the claims table states the engine/human split');
  assert.ok(src.includes('<th scope="col">Roles</th>'), 'the Workflows table column is Roles, not Agents');
  assert.ok(!src.includes('<th scope="col">Agents</th>'), 'no Agents column may remain');
  // No hardcoded dish, version count or evidence list in the overview.
  assert.ok(!src.includes('Three versions of Nonna'), 'the COURT overview must derive the dish and count');
  assert.ok(!src.includes('[E1]</span> invoice, <span class="tag-ev">[E2]</span> recipe'), 'the Analysis evidence list must be derived');
  assert.ok(!src.includes('[E1]</span> handwritten card photo'), 'the COURT evidence line must be derived');
});

// ---------- WCAG AA: every text/background pair from the :root tokens ----------
function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function ratio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

test('dark: every text/background pair in the palette meets WCAG AA (>= 4.5:1)', () => {
  const rootBlock = css.match(/:root\{([^}]+)\}/);
  assert.ok(rootBlock, ':root tokens must exist in styles.css');
  const tokens = Object.fromEntries([...rootBlock[1].matchAll(/--([\w-]+):\s*(#[0-9A-Fa-f]{6});/g)].map((m) => [m[1], m[2]]));
  // [text token, background token, where the pair is used]
  const pairs = [
    ['ink', 'bg', 'body text'], ['soft', 'bg', 'muted on app bg'], ['faint', 'bg', 'faint on app bg'],
    ['ink', 'panel', 'text on panels'], ['soft', 'panel', 'muted on panels'], ['faint', 'panel', 'faint on panels'],
    ['ink', 'panel-2', 'text on raised panels'], ['soft', 'panel-2', 'muted on raised panels'],
    ['ink', 'input-bg', 'input text'], ['soft', 'input-bg', 'muted on inputs'], ['faint', 'input-bg', 'placeholder text'],
    ['cyan', 'bg', 'links on app bg'], ['cyan', 'panel', 'links on panels'],
    ['cyan-text', 'cyan-bg', 'cyan text on cyan tint'], ['cyan-text', 'panel', 'cyan text on panels'],
    ['cyan-text', 'bg', 'cyan text on app bg'],
    ['lime', 'bg', 'lime on app bg'], ['lime', 'panel', 'lime on panels'],
    ['lime-text', 'lime-bg', 'lime text on lime tint'], ['lime-text', 'bg', 'lime text on app bg'],
    ['red', 'bg', 'red on app bg'], ['red-text', 'red-bg', 'red text on red tint'], ['red-text', 'bg', 'red text on app bg'],
    ['amber', 'bg', 'amber on app bg'], ['amber-text', 'amber-bg', 'amber text on amber tint'], ['amber-text', 'bg', 'amber text on app bg'],
    ['blue-text', 'blue-bg', 'blue text on blue tint'],
    ['ink', 'heat-1', 'ink on heat 1'], ['ink', 'heat-2', 'ink on heat 2'], ['ink', 'heat-3', 'ink on heat 3'],
    ['ink', 'heat-4', 'ink on heat 4'], ['ink', 'heat-5', 'ink on heat 5'],
    ['btn-ink', 'cyan', 'dark text on the cyan primary button'],
    ['ink', 'warn-bg', 'ink on the warning tint'], ['soft', 'warn-bg', 'muted on the warning tint'],
    ['ink', 'flash-bg', 'ink on the flashed row'], ['ink', 'grey-bg', 'ink on grey tint'], ['soft', 'grey-bg', 'muted on grey tint'],
    ['cyan-text', 'grey-bg', 'facilitator tag on grey tint'],
  ];
  const results = [];
  for (const [fg, bg, where] of pairs) {
    assert.ok(tokens[fg], `token --${fg} must exist`);
    assert.ok(tokens[bg], `token --${bg} must exist`);
    const r = ratio(tokens[fg], tokens[bg]);
    results.push(`${fg} on ${bg}: ${r.toFixed(2)} (${where})`);
    assert.ok(r >= 4.5, `${fg} on ${bg} is ${r.toFixed(2)}:1 — below WCAG AA 4.5:1 (${where})`);
  }
  // The one documented non-pair: cyan-dark on cyan-bg is 2.87:1, so it
  // must never be used as text on the cyan tint (use cyan-text instead).
  assert.ok(ratio(tokens['cyan-dark'], tokens['cyan-bg']) < 4.5, 'cyan-dark on cyan-bg must stay below AA (it is not a text pair)');
  // eslint-disable-next-line no-console
  console.log(`dark WCAG: ${results.length} pairs all >= 4.5:1\n  ` + results.join('\n  '));
});
