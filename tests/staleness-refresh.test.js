// CONVERGE staleness-refresh tests (2026-11-06) — a case changed
// server-side outside the open tab (another tab, a direct API call,
// another user) used to stay stale until reload: the client fetched the
// detail once and cached it in `details`, with no polling and no
// cross-tab invalidation. The fix re-fetches the open case on
// visibilitychange -> visible and on window focus, and re-renders only
// if the server detail actually differs (no interval polling).
//
// Client behaviour is exercised live in Chromium against a scratch
// server (a temp copy of the demo data), never the shared
// data/converge.json — see tests/case-creation.test.js. Static checks
// pin the mechanism in the shipped app/app.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { seedData } from '../server/store.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'app', 'app.js'), 'utf8');
const require = createRequire(import.meta.url);
// playwright-core lives in a sibling workspace project (fieldwork);
// — the CONVERGE repo itself has no browser dependency.
const { chromium } = require('/home/hatch/workspace/fieldwork-portfolio/node_modules/playwright-core');
const CHROME = '/home/hatch/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome';

const PORT = 3215;
const base = `http://127.0.0.1:${PORT}`;

const validPayload = {
  supplier: 'DairyCo', ingredient: 'heavy cream', recipe: 'Alfredo',
  oldPrice: 0.16, newPrice: 0.24, unit: 'fl oz', qtyPerServing: 6,
  otherIngredientsCostPerServing: 3.62, menuPrice: 16.0, monthlySales: 160,
  targetFoodCostPct: 30, targetPrice: 0.16, maxApprovedPrice: 0.20,
  evidenceSource: 'DairyCo invoice (demo)',
};

// ---------- static: the mechanism is present, no polling ----------
test('staleness: a freshness check runs on visibilitychange and on focus', () => {
  assert.ok(src.includes("document.addEventListener('visibilitychange'"), 'visibilitychange listener exists');
  assert.ok(src.includes("window.addEventListener('focus', refreshOpenCase)"), 'focus listener calls refreshOpenCase');
  assert.ok(src.includes('if (!document.hidden) refreshOpenCase()'), 'visibility handler only refreshes when the tab becomes visible');
  assert.ok(src.includes('async function refreshOpenCase()'), 'refreshOpenCase is defined');
});

test('staleness: the check re-fetches the open case and re-renders only on a real difference', () => {
  assert.ok(src.includes("api(`/api/cases/${encodeURIComponent(id)}`)"), 'open case re-fetched from GET /api/cases/:id');
  assert.ok(src.includes('JSON.stringify(fresh) !== JSON.stringify(details[id])'), 're-render gated on the detail actually differing');
  assert.ok(src.includes('details[id] = fresh;'), 'fresh detail replaces the cache');
  assert.ok(!/setInterval\s*\(/.test(src), 'no interval polling anywhere in the client');
});

test('staleness: the check never wipes in-progress input or a modal', () => {
  assert.ok(src.includes("if (modal && !modal.hidden) return;"), 'skipped while the approval modal is open');
  assert.ok(src.includes("ae.tagName === 'INPUT'"), 'skipped while the user is typing in a form');
  assert.ok(src.includes('if (!id || !details[id] || routeState) return;'), 'skipped with no open case or while a route is loading');
});

// ---------- live: the reproduction from STALENESS.md, fixed ----------
const scratchDir = mkdtempSync(join(tmpdir(), 'converge-staleness-'));
const dataFile = join(scratchDir, 'converge.json');
let child = null;
let browser = null;

async function waitForServer() {
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch(`${base}/api/status`); if (r.ok) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('server did not start');
}

async function post(path, body) {
  return fetch(`${base}${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function pillText(page) {
  return page.evaluate(() => document.querySelector('#view .pill')?.textContent?.trim() || '');
}

async function waitForPill(page, text, timeout = 10000) {
  await page.waitForFunction(
    (t) => document.querySelector('#view .pill')?.textContent?.trim() === t,
    text, { timeout },
  );
}

test.before(async () => {
  writeFileSync(dataFile, JSON.stringify(seedData()));
  child = spawn('node', ['server/server.js'], { cwd: root, env: { ...process.env, PORT: String(PORT), CONVERGE_DATA_FILE: dataFile }, stdio: 'ignore' });
  await waitForServer();
  browser = await chromium.launch({ executablePath: CHROME });
});

test.after(async () => {
  await browser?.close();
  child?.kill();
  rmSync(scratchDir, { recursive: true, force: true });
});

test('staleness: an API mutation outside the tab appears after a focus event, with no reload', { timeout: 120000 }, async () => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const loc = (m.location() && m.location().url) || '';
    if (loc.includes('favicon.ico')) return;
    errors.push(m.text());
  });
  try {
    // A fresh case in DISCUSSION (created via the API, as another actor would).
    const created = await post('/api/cases', validPayload);
    assert.equal(created.status, 201);
    const c = await created.json();
    assert.equal(c.state, 'DISCUSSION');

    await page.goto(`${base}/#/case/${c.id}`);
    await page.waitForSelector('#view h1');
    await waitForPill(page, 'DISCUSSION');
    // A marker that a page reload would clear — proves the refresh is
    // in-place, not a reload.
    await page.evaluate(() => { window.__stalenessNoReload = 1; });

    // Another actor moves the case server-side; the open tab must not know yet.
    const moved = await post(`/api/cases/${c.id}/transition`, { to: 'PROPOSAL', actorKind: 'human', actor: 'Mara (owner)' });
    assert.equal(moved.status, 200);
    assert.equal((await moved.json()).state, 'PROPOSAL');
    await new Promise((r) => setTimeout(r, 500));
    assert.equal(await pillText(page), 'DISCUSSION', 'still stale before any focus event');

    // Returning to the tab refreshes the open case in place.
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await waitForPill(page, 'PROPOSAL');
    assert.equal(await page.evaluate(() => window.__stalenessNoReload), 1, 'no reload happened');
    assert.deepEqual(errors, []);
  } finally {
    await ctx.close();
  }
});

test('staleness: the same refresh runs on visibilitychange, and a no-change focus is a no-op', { timeout: 120000 }, async () => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const loc = (m.location() && m.location().url) || '';
    if (loc.includes('favicon.ico')) return;
    errors.push(m.text());
  });
  try {
    const created = await post('/api/cases', validPayload);
    assert.equal(created.status, 201);
    const c = await created.json();

    await page.goto(`${base}/#/case/${c.id}`);
    await page.waitForSelector('#view h1');
    await waitForPill(page, 'DISCUSSION');
    await page.evaluate(() => { window.__stalenessNoReload = 1; });

    // Move it server-side, then hide and show the tab.
    const moved = await post(`/api/cases/${c.id}/transition`, { to: 'PROPOSAL', actorKind: 'human', actor: 'Mara (owner)' });
    assert.equal(moved.status, 200);
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { get: () => true, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(await pillText(page), 'DISCUSSION', 'hidden tab does not refresh');
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { get: () => false, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await waitForPill(page, 'PROPOSAL');
    assert.equal(await page.evaluate(() => window.__stalenessNoReload), 1, 'no reload happened');

    // A focus event with no server change leaves the view untouched.
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await new Promise((r) => setTimeout(r, 500));
    assert.equal(await pillText(page), 'PROPOSAL');
    assert.equal(await page.evaluate(() => window.__stalenessNoReload), 1);
    assert.deepEqual(errors, []);
  } finally {
    await ctx.close();
  }
});
