// CONVERGE whole-app visual polish journey tests (2026-11-06) — the
// follow-up to the HAGGLE polish round, verified live in Chromium:
//   - COURT and CORRECTION Overviews guide the user with a Next step
//     panel and a header primary action (same as HAGGLE);
//   - the dashboard draws the eye to what awaits a human decision;
//   - the mobile stepper no longer collides — it scrolls;
//   - the COURT summary reads cleanly.
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
const PORT = 3223;
const base = `http://127.0.0.1:${PORT}`;
const evidenceDir = process.env.VISUAL_POLISH_EVIDENCE_DIR || mkdtempSync(join(tmpdir(), 'converge-visual-polish-'));
mkdirSync(evidenceDir, { recursive: true });

const scratchDir = mkdtempSync(join(tmpdir(), 'converge-visual-polish-'));
const dataFile = join(scratchDir, 'converge.json');
let child;
let browser;

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
  browser = await chromium.launch();
});

test.after(async () => {
  await browser?.close();
  child?.kill();
  rmSync(scratchDir, { recursive: true, force: true });
});

test('visual: the dashboard flags what awaits a decision', { timeout: 60000 }, async () => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = trackErrors(page);
  try {
    await page.goto(base + '/');
    await page.waitForSelector('.kpi');
    // The seed has HAG-014 awaiting approval, so the cue must be on.
    assert.ok(await page.locator('.kpi-attention').count() >= 1, 'the Awaiting KPI must carry the attention tint');
    const kpiText = await page.$eval('.kpi-attention', (el) => el.innerText);
    // The KPI label renders uppercase via CSS, so match case-insensitively.
    assert.ok(kpiText.toLowerCase().includes('awaiting approval'), `the tinted KPI is the Awaiting one (got: ${kpiText})`);
    assert.ok(kpiText.includes('1'), 'it shows 1 awaiting');
    assert.ok(await page.locator('.decision-attention').count() >= 1, 'the awaiting row must carry the attention edge');
    const rowText = await page.$eval('.decision-attention', (el) => el.innerText);
    assert.ok(rowText.includes('HAG-014'), 'the flagged row is HAG-014');
    await shot(page, 'visual-01-dashboard.png');
    assert.equal(errors.length, 0, `no page/console errors (got: ${errors.join(' | ')})`);
  } finally {
    await ctx.close();
  }
});

test('visual: COURT guides the user to adoption', { timeout: 120000 }, async () => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = trackErrors(page);
  try {
    await page.goto(`${base}/#/case/CRT-007`);
    await page.waitForFunction(() => {
      const h1 = document.querySelector('#view h1');
      return h1 && /CRT-007/.test(h1.innerText);
    }, null, { timeout: 15000 });
    // The summary reads cleanly: short labels, no stutter.
    const summary = await page.$eval('.col-stack', (el) => el.innerText);
    assert.ok(summary.includes('Conflicts'), 'the summary uses the short Conflicts label');
    assert.ok(!summary.includes('Conflicting variables'), 'the long label is gone');
    assert.ok(summary.includes('Leading'), 'the summary uses the short Leading label');
    assert.ok(!summary.includes('card Nonna (card)'), 'the versions list no longer stutters');
    // Next step panel + header primary action agree: adopt.
    const nextStep = await page.$eval('.next-step-panel', (el) => el.innerText);
    assert.ok(nextStep.includes('The tally is complete'), 'Next step names the stage in plain words');
    assert.ok(nextStep.includes('Adopt the canonical version'), 'Next step points at adoption');
    const primary = await page.$eval('.move-to .btn', (el) => el.innerText.trim());
    assert.equal(primary, 'Adopt the canonical version');
    await shot(page, 'visual-02-court-overview.png');
    await page.click('.move-to .btn');
    await page.waitForFunction(() => {
      const tab = document.querySelector('#tab-negotiation');
      return tab && tab.classList.contains('is-active');
    }, null, { timeout: 10000 });
    await page.waitForSelector('#adopt-btn', { timeout: 10000 });
    const adoptLabel = await page.$eval('#adopt-btn', (el) => el.innerText);
    assert.ok(adoptLabel.includes('Adopt as canonical'), `the Negotiation tab offers adoption (got: ${adoptLabel})`);
    assert.equal(errors.length, 0, `no page/console errors (got: ${errors.join(' | ')})`);
  } finally {
    await ctx.close();
  }
});

test('visual: CORRECTION guides the user to the claims', { timeout: 120000 }, async () => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = trackErrors(page);
  try {
    await page.goto(`${base}/#/case/COR-003`);
    await page.waitForFunction(() => {
      const h1 = document.querySelector('#view h1');
      return h1 && /COR-003/.test(h1.innerText);
    }, null, { timeout: 15000 });
    const nextStep = await page.$eval('.next-step-panel', (el) => el.innerText);
    assert.ok(nextStep.includes('3 of 3 claims are still unresolved'), 'Next step names the unresolved claims');
    // The header primary action (data-goto-tab) — the Advance button
    // sits beside it for early cases, so the plain .btn selector would
    // pick Advance instead.
    const primary = await page.$eval('.move-to .btn[data-goto-tab]', (el) => el.innerText.trim());
    assert.equal(primary, 'Review the claims →');
    await shot(page, 'visual-03-correction-overview.png');
    await page.click('.move-to .btn[data-goto-tab]');
    await page.waitForFunction(() => {
      const tab = document.querySelector('#tab-negotiation');
      return tab && tab.classList.contains('is-active');
    }, null, { timeout: 10000 });
    await page.waitForSelector('text=Claims from the transcript', { timeout: 10000 });
    assert.equal(errors.length, 0, `no page/console errors (got: ${errors.join(' | ')})`);
  } finally {
    await ctx.close();
  }
});

test('visual: the mobile stepper no longer collides', { timeout: 120000 }, async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errors = trackErrors(page);
  try {
    await page.goto(`${base}/#/case/CRT-007`);
    await page.waitForFunction(() => {
      const h1 = document.querySelector('#view h1');
      return h1 && /CRT-007/.test(h1.innerText);
    }, null, { timeout: 15000 });
    const stepper = await page.evaluate(() => {
      const el = document.querySelector('.stepper');
      const items = [...el.querySelectorAll('li')].map((li) => {
        const r = li.getBoundingClientRect();
        return { text: li.innerText.trim(), left: r.left, right: r.right };
      });
      return { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth, items };
    });
    assert.ok(stepper.scrollWidth > stepper.clientWidth, 'the stepper scrolls at 390px instead of squeezing');
    for (let i = 1; i < stepper.items.length; i++) {
      assert.ok(stepper.items[i].left >= stepper.items[i - 1].right - 0.5,
        `stepper labels must not overlap: "${stepper.items[i - 1].text}" ends at ${stepper.items[i - 1].right}, "${stepper.items[i].text}" starts at ${stepper.items[i].left}`);
    }
    await shot(page, 'visual-04-court-mobile.png');
    await page.waitForSelector('.next-step-panel');
    const nextStep = await page.$eval('.next-step-panel', (el) => el.innerText);
    assert.ok(nextStep.includes('Adopt the canonical version'), 'the Next step is visible at 390px');
    assert.equal(errors.length, 0, `no page/console errors (got: ${errors.join(' | ')})`);
  } finally {
    await ctx.close();
  }
});
