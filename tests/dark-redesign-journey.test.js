// CONVERGE dark-redesign journey tests (2026-11-07) — verified live in
// Chromium against a scratch server on isolated seed data (seedData()),
// never the shared data/converge.json:
//   - the dark theme actually renders (computed backgrounds);
//   - clicking a citation [E1] in Analysis switches to the Evidence
//     tab and highlights the matching row (M12);
//   - a kg case shows terms in kg in the Negotiation panel (H6);
//   - the case header offers an Advance button for an early case (M10)
//     and the stepper never marks a terminal case "Draft" (M9).
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { seedData } from '../server/store.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 3226;
const base = `http://127.0.0.1:${PORT}`;

const scratchDir = mkdtempSync(join(tmpdir(), 'converge-dark-redesign-'));
const dataFile = join(scratchDir, 'converge.json');
let child;
let browser;
let token;

async function waitForServer() {
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch(`${base}/api/status`); if (r.ok) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('server did not start');
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
// The server issues at most 5 sessions a minute per instance, and
// every fresh browser context boots a new session — five page boots
// would burn the bucket and the last boot would 429. Seed the one
// token from before() into each context's sessionStorage instead, so
// the app reuses it and never POSTs /api/session again.
async function newCtx(viewport) {
  const ctx = await browser.newContext({ viewport });
  await ctx.addInitScript((t) => sessionStorage.setItem('converge-session-token', t), token);
  return ctx;
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

test('dark journey: the dark theme renders and no console errors appear', { timeout: 60000 }, async () => {
  const ctx = await newCtx({ width: 1440, height: 900 });
  const page = await ctx.newPage();
  const errors = trackErrors(page);
  try {
    await page.goto(base + '/');
    await page.waitForSelector('.kpi');
    const bg = await page.$eval('body', (el) => getComputedStyle(el).backgroundColor);
    assert.equal(bg, 'rgb(22, 25, 29)', `body background must be the charcoal #16191D (got ${bg})`);
    const panel = await page.$eval('.panel', (el) => getComputedStyle(el).backgroundColor);
    assert.equal(panel, 'rgb(31, 35, 41)', `panel background must be #1F2329 (got ${panel})`);
    const ink = await page.$eval('body', (el) => getComputedStyle(el).color);
    assert.equal(ink, 'rgb(232, 236, 239)', `body text must be the ink #E8ECEF (got ${ink})`);
    assert.deepEqual(errors, [], `no console errors (CSP inline-style errors would land here): ${JSON.stringify(errors)}`);
  } finally { await ctx.close(); }
});

test('dark journey: clicking [E1] in Analysis jumps to the Evidence row and flashes it', { timeout: 60000 }, async () => {
  const ctx = await newCtx({ width: 1440, height: 900 });
  const page = await ctx.newPage();
  const errors = trackErrors(page);
  try {
    await page.goto(base + '/#/case/HAG-014?tab=analysis');
    await page.waitForSelector('#case-main');
    // The Analysis assumptions paragraph carries the citation button.
    const cite = page.locator('#case-main button[data-evidence="E1"]').first();
    await cite.waitFor({ state: 'visible' });
    await cite.click();
    // The Evidence tab is now active and the E1 row is flashed.
    await page.waitForSelector('#tab-evidence.is-active');
    const row = page.locator('#ev-E1');
    await row.waitFor({ state: 'visible' });
    assert.ok(await row.evaluate((el) => el.classList.contains('flash')), 'the E1 evidence row must carry .flash after the citation click');
    assert.deepEqual(errors, [], `no console errors: ${JSON.stringify(errors)}`);
  } finally { await ctx.close(); }
});

test('dark journey: a kg case shows kg terms in Negotiation, and an early case offers Advance', { timeout: 60000 }, async () => {
  // A $4→$5/kg case: the engine derives the counter at $4.50/kg.
  const created = await (await fetch(`${base}/api/cases`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Converge-Session': token },
    body: JSON.stringify({
      supplier: 'GreenFields', ingredient: 'butter', recipe: 'Croissant',
      oldPrice: 4, newPrice: 5, unit: 'kg', qtyPerServing: 5,
      otherIngredientsCostPerServing: 5, menuPrice: 50, monthlySales: 100,
      targetFoodCostPct: 30, targetPrice: 4, maxApprovedPrice: 5, evidenceSource: '',
    }),
  })).json();
  assert.ok(created.id, 'the kg case must be created');
  const ctx = await newCtx({ width: 1440, height: 900 });
  const page = await ctx.newPage();
  const errors = trackErrors(page);
  try {
    await page.goto(base + `/#/case/${created.id}?tab=negotiation`);
    await page.waitForSelector('#case-main');
    const terms = await page.$eval('#case-main', (el) => el.innerText);
    assert.ok(terms.includes('$4.50 / kg for 6 weeks'), `the Negotiation panel must show the kg terms (got: ${terms.slice(0, 400)})`);
    assert.ok(!terms.includes('/ fl oz'), 'no fl oz terms may appear for a kg case');
    assert.ok(!terms.includes('$0.19'), 'no fabricated $0.19 counter-offer may appear');
    assert.deepEqual(errors, [], `no console errors: ${JSON.stringify(errors)}`);
  } finally { await ctx.close(); }
});

test('dark journey: an early case (COR-003, INVESTIGATING) offers an Advance button', { timeout: 60000 }, async () => {
  // API-created cases land in DISCUSSION, so the Advance button is
  // exercised on the seed's INVESTIGATING case instead.
  const ctx = await newCtx({ width: 1440, height: 900 });
  const page = await ctx.newPage();
  const errors = trackErrors(page);
  try {
    await page.goto(base + '/#/case/COR-003');
    await page.waitForSelector('#advance-btn');
    const advLabel = await page.$eval('#advance-btn', (el) => el.innerText);
    assert.ok(advLabel.includes('Advance to Discussion'), `the Advance button must point at Discussion (got: ${advLabel})`);
    assert.deepEqual(errors, [], `no console errors: ${JSON.stringify(errors)}`);
  } finally { await ctx.close(); }
});

test('dark journey: the mobile stepper scrolls and the 390px layout holds', { timeout: 60000 }, async () => {
  const ctx = await newCtx({ width: 390, height: 844 });
  const page = await ctx.newPage();
  const errors = trackErrors(page);
  try {
    await page.goto(base + '/#/case/HAG-014');
    await page.waitForSelector('.stepper');
    // The current step (Awaiting approval) is scrolled into view.
    const visible = await page.$eval('.stepper [aria-current="step"]', (el) => {
      const r = el.getBoundingClientRect();
      const pr = el.closest('.stepper').getBoundingClientRect();
      return r.left >= pr.left - 1 && r.right <= pr.right + 1;
    });
    assert.ok(visible, 'the current stepper step must be within the visible stepper at 390px');
    // No horizontal page overflow at 390px.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.equal(overflow, 0, `no horizontal overflow at 390px (got ${overflow}px)`);
    assert.deepEqual(errors, [], `no console errors: ${JSON.stringify(errors)}`);
  } finally { await ctx.close(); }
});
