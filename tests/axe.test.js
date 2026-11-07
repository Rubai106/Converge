// CONVERGE axe-core accessibility test (§31.3, 2026-11-07).
// Runs axe-core 4.14.0 (devDependency) in a real browser against the
// live app on a scratch server: dashboard, a HAGGLE case overview, and
// a CORRECTION negotiation view. Asserts zero violations. This replaces
// the manual "0 violations on 13 pages" run from 2026-11-06 with a
// repeatable suite check (the manual run is still recorded in
// docs/TESTING-REPORT.md as a manual result, not a suite result).
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { seedData } from '../server/store.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const scratchDir = mkdtempSync(join(tmpdir(), 'converge-axe-'));
const dataFile = join(scratchDir, 'converge.json');
const PORT = 3415;
const base = `http://127.0.0.1:${PORT}`;
const axeSource = readFileSync(join(root, 'node_modules', 'axe-core', 'axe.js'), 'utf8');

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

async function axeViolations(page, url) {
  // The app's strict CSP (script-src 'self') blocks inline script
  // injection, so axe.js cannot be added via addScriptTag({content}).
  // Instead, serve it from the app's own origin via route
  // interception — a same-origin <script src>, which the CSP allows.
  // The CSP is NOT weakened for this test.
  await page.route('**/axe-test.js', (route) => route.fulfill({
    status: 200, contentType: 'text/javascript', body: axeSource,
  }));
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.addScriptTag({ url: `${base}/axe-test.js` });
  const results = await page.evaluate(() => window.axe.run(document, { resultTypes: ['violations'] }));
  await page.unroute('**/axe-test.js');
  return results.violations;
}

test('axe: dashboard, HAGGLE overview, and CORRECTION negotiation have zero violations', async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const pages = [
    ['dashboard', `${base}/`],
    ['HAG-014 overview', `${base}/#/case/HAG-014`],
    ['COR-003 negotiation', `${base}/#/case/COR-003?tab=negotiation`],
  ];
  for (const [name, url] of pages) {
    const violations = await axeViolations(page, url);
    assert.deepEqual(
      violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length })),
      [],
      `${name} has axe violations: ${JSON.stringify(violations.map((v) => v.id))}`,
    );
  }
  await page.close();
});
