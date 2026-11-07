// CONVERGE live XSS probe (§31.3, 2026-11-07).
// A benign payload in a scratch case's supplier/ingredient fields must
// render as escaped TEXT, never execute. Runs the real server on a
// scratch port against isolated scratch data and drives it with a real
// browser (Playwright) — this is a live probe, not a static review.
// It runs against a scratch instance (same code as production) so the
// probe never mutates the production data file.
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
const scratchDir = mkdtempSync(join(tmpdir(), 'converge-xss-'));
const dataFile = join(scratchDir, 'converge.json');
const PORT = 3413;
const base = `http://127.0.0.1:${PORT}`;

let child;
let browser;

test.before(async () => {
  writeFileSync(dataFile, JSON.stringify(seedData()));
  child = spawn('node', ['server/server.js'], { cwd: root, env: { ...process.env, PORT: String(PORT), CONVERGE_DATA_FILE: dataFile }, stdio: 'ignore' });
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch(`${base}/api/status`); if (r.ok) break; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  browser = await chromium.launch();
});

test.after(async () => {
  await browser?.close();
  child?.kill();
  rmSync(scratchDir, { recursive: true, force: true });
});

test('XSS: a benign payload in a case field renders as text and never executes', async () => {
  const token = (await (await fetch(`${base}/api/session`, { method: 'POST' })).json()).token;
  const payload = '<img src=x onerror="window.__xss=1">';
  const r = await fetch(`${base}/api/cases`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Converge-Session': token },
    body: JSON.stringify({
      supplier: payload, ingredient: '<script>window.__xss=2</script>', recipe: '',
      oldPrice: 0.16, newPrice: 0.24, unit: 'fl oz', qtyPerServing: 6,
      otherIngredientsCostPerServing: 3.62, menuPrice: 16.0, monthlySales: 160,
      targetFoodCostPct: 30, targetPrice: 0.16, maxApprovedPrice: 0.20, evidenceSource: '',
    }),
  });
  assert.equal(r.status, 201);
  const created = await r.json();

  const page = await browser.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${base}/#/case/${created.id}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  assert.equal(await page.evaluate(() => window.__xss), undefined, 'payload must not execute on the case page');
  assert.equal(await page.evaluate(() => document.querySelectorAll('img[src="x"]').length), 0, 'no live img element from the payload');
  assert.ok((await page.textContent('body')).includes('<img src=x'), 'payload text is visible, escaped');
  await page.goto(`${base}/#/cases`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  assert.equal(await page.evaluate(() => window.__xss), undefined, 'payload must not execute on the dashboard');
  assert.deepEqual(errors, []);
  await page.close();
});
