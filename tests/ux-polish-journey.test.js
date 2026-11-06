// CONVERGE UX-polish journey tests (2026-11-06) — the fixes from
// Rubai's first Windows run, verified live in Chromium:
//   - a 600% food cost renders a bounded bar (never outside the track),
//     with the exact figure still shown, at desktop and mobile sizes;
//   - the wizard flags implausible inputs and needs an acknowledgement
//     before creating;
//   - the Overview is key figures + Next step (no chart); the chart
//     lives in Analysis;
//   - the Move dropdown offers no PROPOSAL; the header's primary action
//     takes the user to Negotiation.
// Runs against a scratch server on isolated seed data (seedData()),
// never the shared data/converge.json.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { seedData } from '../server/store.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 3217;
const base = `http://127.0.0.1:${PORT}`;
const evidenceDir = process.env.UX_POLISH_EVIDENCE_DIR || mkdtempSync(join(tmpdir(), 'converge-ux-polish-'));
mkdirSync(evidenceDir, { recursive: true });

const scratchDir = mkdtempSync(join(tmpdir(), 'converge-ux-polish-'));
const dataFile = join(scratchDir, 'converge.json');
let child;
let browser;
let token; // P0 (2026-11-07): the API case creations need a session token.

// Rubai's exact HAG-015 inputs from his Windows run.
const extremePayload = {
  supplier: 'dc', ingredient: 'hc', recipe: 'al',
  oldPrice: 4, newPrice: 5, unit: 'kg', qtyPerServing: 5,
  otherIngredientsCostPerServing: 5, menuPrice: 5, monthlySales: 5,
  targetFoodCostPct: 30, targetPrice: 4, maxApprovedPrice: 5, evidenceSource: '',
};

async function waitForServer() {
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch(`${base}/api/status`); if (r.ok) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('server did not start');
}
async function shot(page, name) {
  await page.screenshot({ path: join(evidenceDir, name) });
}
async function waitForText(page, selector, re, timeout = 10000) {
  await page.waitForFunction(
    ([sel, rx]) => {
      const el = document.querySelector(sel);
      return el && new RegExp(rx).test(el.innerText);
    },
    [selector, re.source],
    { timeout },
  );
}
function trackErrors(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const loc = (m.location() && m.location().url) || '';
    if (loc.includes('favicon.ico')) return;
    errors.push(m.text());
  });
  return errors;
}

test.before(async () => {
  writeFileSync(dataFile, JSON.stringify(seedData()));
  child = spawn('node', ['server/server.js'], { cwd: root, env: { ...process.env, PORT: String(PORT), CONVERGE_DATA_FILE: dataFile }, stdio: 'ignore' });
  await waitForServer();
  token = (await (await fetch(`${base}/api/session`, { method: 'POST' })).json()).token;
  browser = await chromium.launch();
});

test.after(async () => {
  await browser?.close();
  child?.kill();
  rmSync(scratchDir, { recursive: true, force: true });
});

test('ux: a 600% food cost stays inside the chart at desktop size', { timeout: 120000 }, async () => {
  const created = await (await fetch(`${base}/api/cases`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Converge-Session': token }, body: JSON.stringify(extremePayload),
  })).json();
  assert.equal(created.analysis.newFoodCostPct, 600, 'the engine still computes 600%');
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = trackErrors(page);
  try {
    await page.goto(`${base}/#/case/${created.id}`);
    await page.waitForFunction(() => {
      const h1 = document.querySelector('#view h1');
      return h1 && /dc hc price rise/.test(h1.innerText);
    }, null, { timeout: 15000 });
    // Overview: key figures + Next step, no chart.
    assert.equal(await page.locator('.bullet').count(), 0, 'the Overview must not render the bullet chart');
    const keyFigures = await page.$eval('.key-figures', (el) => el.innerText);
    assert.ok(keyFigures.includes('600.00%'), `key figures show the exact 600% (got: ${keyFigures})`);
    assert.ok(keyFigures.includes('+$5.00'), 'key figures show +$5.00/serving');
    const nextStep = await page.$eval('.next-step-panel', (el) => el.innerText);
    assert.ok(nextStep.includes("You're in Discussion"), 'Next step names the stage in plain words');
    assert.ok(nextStep.includes('Review strategies'), 'Next step points at Negotiation');
    await shot(page, 'ux-01-overview-desktop.png');
    // Analysis: the bar is bounded by the track, the scale flags it.
    await page.click('[data-tab="analysis"]');
    await page.waitForSelector('.bullet');
    const track = await page.locator('.bullet').boundingBox();
    const bar = await page.locator('.bullet-bar').boundingBox();
    assert.ok(track && bar, 'chart track and bar must exist');
    assert.ok(bar.x >= track.x - 0.5, `bar starts at the track's left edge (bar.x ${bar.x}, track.x ${track.x})`);
    assert.ok(bar.x + bar.width <= track.x + track.width + 0.5, `bar ends at the track's right edge (bar right ${bar.x + bar.width}, track right ${track.x + track.width})`);
    assert.ok(bar.width <= track.width + 0.5, 'the bar is never wider than the track');
    const scale = await page.$eval('.bullet-scale', (el) => el.innerText);
    assert.ok(scale.includes('40%+'), `the scale flags the off-scale value (got: ${scale})`);
    const note = await page.$eval('.bullet-offscale', (el) => el.innerText);
    assert.ok(note.includes('600.00%'), `the off-scale note names the exact figure (got: ${note})`);
    const analysisText = await page.$eval('#view', (el) => el.innerText);
    assert.ok(analysisText.includes('600.00%'), 'the exact 600% is shown in text');
    // The mandate heading renders uppercase via CSS, so check the box's
    // own wording instead.
    assert.ok(analysisText.includes('Walk away'), 'the mandate lives in Analysis');
    await shot(page, 'ux-02-analysis-desktop.png');
    assert.equal(errors.length, 0, `no page/console errors (got: ${errors.join(' | ')})`);
  } finally {
    await ctx.close();
  }
});

test('ux: the extreme case does not overflow the page at mobile size', { timeout: 120000 }, async () => {
  const created = await (await fetch(`${base}/api/cases`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Converge-Session': token }, body: JSON.stringify({ ...extremePayload, supplier: 'dc2' }),
  })).json();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errors = trackErrors(page);
  try {
    await page.goto(`${base}/#/case/${created.id}`);
    await page.waitForFunction(() => {
      const h1 = document.querySelector('#view h1');
      return h1 && /dc2 hc price rise/.test(h1.innerText);
    }, null, { timeout: 15000 });
    await page.click('[data-tab="analysis"]');
    await page.waitForSelector('.bullet');
    const track = await page.locator('.bullet').boundingBox();
    const bar = await page.locator('.bullet-bar').boundingBox();
    assert.ok(bar.x + bar.width <= track.x + track.width + 0.5, 'the bar stays inside the track at 390px');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 0, `no horizontal page overflow at 390px (overflow ${overflow}px)`);
    await shot(page, 'ux-03-analysis-mobile.png');
    await page.click('[data-tab="overview"]');
    await page.waitForSelector('.next-step-panel');
    await shot(page, 'ux-04-overview-mobile.png');
    assert.equal(errors.length, 0, `no page/console errors (got: ${errors.join(' | ')})`);
  } finally {
    await ctx.close();
  }
});

test('ux: the wizard flags the extreme inputs and needs an acknowledgement', { timeout: 120000 }, async () => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = trackErrors(page);
  try {
    await page.goto(base + '/');
    await page.waitForSelector('#view h1');
    await page.locator('#new-case-btn').first().click();
    await page.waitForSelector('#wz-supplier');
    await page.fill('#wz-supplier', 'dc');
    await page.fill('#wz-ingredient', 'hc');
    await page.fill('#wz-recipe', 'al');
    await page.click('#wz-next');
    await page.waitForSelector('#wz-oldPrice');
    // Step 2 explains the unit relationship.
    const step2Text = await page.$eval('#wizard-form', (el) => el.innerText);
    assert.ok(step2Text.includes('Price is per the unit'), 'step 2 explains price-per-unit');
    assert.ok(step2Text.includes('6 fl oz, 0.15 kg or 150 g'), 'step 2 gives unit-aware examples');
    await page.fill('#wz-oldPrice', '4');
    await page.fill('#wz-newPrice', '5');
    await page.selectOption('#wz-unit', 'kg');
    await page.fill('#wz-qtyPerServing', '5');
    await page.click('#wz-next');
    await page.waitForSelector('#wz-menuPrice');
    await page.fill('#wz-menuPrice', '5');
    await page.fill('#wz-otherIngredientsCostPerServing', '5');
    await page.fill('#wz-monthlySales', '5');
    await page.fill('#wz-targetFoodCostPct', '30');
    await page.click('#wz-next');
    await page.waitForSelector('#wz-targetPrice');
    await page.fill('#wz-targetPrice', '4');
    await page.fill('#wz-maxApprovedPrice', '5');
    await page.click('#wz-next');
    // Review: all four warnings, Create disabled until acknowledged.
    await page.waitForSelector('.warn-box', { timeout: 15000 });
    const warnText = await page.$eval('.warn-box', (el) => el.innerText);
    assert.ok(warnText.includes('5 kg per serving is unusually large'), 'quantity warning is shown');
    assert.ok(warnText.includes('Menu price $5.00 is below the ingredient cost'), 'menu-below-cost warning is shown');
    assert.ok(warnText.includes('Food cost is 600.00%'), 'food-cost warning is shown');
    assert.ok(warnText.includes('No ingredient price can meet the 30%'), 'unreachable-target warning is shown');
    assert.ok(await page.locator('#wz-create').isDisabled(), 'Create is disabled while warnings are unacknowledged');
    await shot(page, 'ux-05-wizard-warnings.png');
    await page.check('#wz-ack');
    await page.waitForSelector('#wz-create:not([disabled])', { timeout: 10000 });
    await page.click('#wz-create');
    await page.waitForFunction(() => {
      const h1 = document.querySelector('#view h1');
      return h1 && /dc hc price rise/.test(h1.innerText);
    }, null, { timeout: 15000 });
    const statePill = await page.$eval('.case-meta', (el) => el.innerText);
    assert.match(statePill, /DISCUSSION/, 'the acknowledged case is created in DISCUSSION');
    assert.equal(errors.length, 0, `no page/console errors (got: ${errors.join(' | ')})`);
  } finally {
    await ctx.close();
  }
});

test('ux: the Move dropdown offers no PROPOSAL and the header guides to Negotiation', { timeout: 120000 }, async () => {
  const created = await (await fetch(`${base}/api/cases`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Converge-Session': token }, body: JSON.stringify({ ...extremePayload, supplier: 'dc3' }),
  })).json();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = trackErrors(page);
  try {
    await page.goto(`${base}/#/case/${created.id}`);
    await page.waitForFunction(() => {
      const h1 = document.querySelector('#view h1');
      return h1 && /dc3 hc price rise/.test(h1.innerText);
    }, null, { timeout: 15000 });
    const moveOptions = await page.$$eval('#move-select option', (els) => els.map((o) => o.innerText));
    assert.ok(!moveOptions.some((t) => /Proposal/i.test(t)), `Move must offer no PROPOSAL (got: ${moveOptions.join(', ')})`);
    assert.ok(moveOptions.some((t) => /Cancel case/i.test(t)), 'Move still offers Cancel case');
    const primary = await page.$eval('.move-to .btn', (el) => el.innerText.trim());
    assert.equal(primary, 'Review strategies →');
    await page.click('.move-to .btn');
    await page.waitForFunction(() => {
      const tab = document.querySelector('#tab-negotiation');
      return tab && tab.classList.contains('is-active');
    }, null, { timeout: 10000 });
    await waitForText(page, '#view', /Submit for approval/, 10000);
    assert.equal(errors.length, 0, `no page/console errors (got: ${errors.join(' | ')})`);
  } finally {
    await ctx.close();
  }
});
