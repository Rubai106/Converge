// CONVERGE NEW-1 regression tests (2026-11-06) — hash deep links to a
// case created after boot used to silently keep showing the previously
// selected case: applyRoute returned false when the client's details
// cache lacked the case and the hashchange handler then did nothing.
// The fix resolves a case route on demand (GET /api/cases/:id) with a
// loading panel while fetching, a "case not found" panel for unknown
// IDs, and an error panel with retry for failed requests.
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
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { seedData } from '../server/store.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'app', 'app.js'), 'utf8');

const PORT = 3211;
const base = `http://127.0.0.1:${PORT}`;

// ---------- static: the mechanism is present, the silent drop is gone ----------
test('new1: applyRoute no longer returns false on a details-cache miss', () => {
  assert.ok(!/if \(!details\[route\.caseId\]\) return false/.test(src), 'the silent cache-miss drop is gone');
  assert.ok(src.includes('resolveCaseRoute(route.caseId'), 'applyRoute delegates case routes to resolveCaseRoute');
});

test('new1: resolveCaseRoute fetches the detail on demand and caches it', () => {
  assert.ok(src.includes("api(`/api/cases/${encodeURIComponent(id)}`)"), 'detail fetched from GET /api/cases/:id');
  assert.ok(src.includes('details[id] = d;'), 'fetched detail is cached');
  assert.ok(src.includes('cases.push(d);'), 'fetched case joins the list so rows/search see it');
});

test('new1: loading, not-found and retry states are rendered, never stale content', () => {
  assert.ok(src.includes("status: 'loading'"), 'loading state is set before the fetch');
  assert.ok(src.includes('Loading case…'), 'loading panel is rendered');
  assert.ok(src.includes('Case not found'), 'unknown IDs get a clear not-found panel');
  assert.ok(src.includes('id="route-retry"'), 'failed loads get a retry button');
  assert.ok(src.includes("routeState.id === currentCaseId"), 'render() shows the route panel instead of a stale case');
  assert.ok(src.includes('routeSeq'), 'superseded fetches are discarded (Back/forward races)');
});

// ---------- live: Chromium against a scratch server ----------
const scratchDir = mkdtempSync(join(tmpdir(), 'converge-new1-'));
const dataFile = join(scratchDir, 'converge.json');
let child;
let browser;

const validPayload = {
  supplier: 'GreenFields', ingredient: 'butter', recipe: '',
  oldPrice: 0.16, newPrice: 0.24, unit: 'fl oz', qtyPerServing: 6,
  otherIngredientsCostPerServing: 3.62, menuPrice: 16.0, monthlySales: 160,
  targetFoodCostPct: 30, targetPrice: 0.16, maxApprovedPrice: 0.20,
  evidenceSource: '',
};

async function waitForServer() {
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch(`${base}/api/status`); if (r.ok) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('server did not start');
}

async function createCaseAfterBoot() {
  const r = await fetch(`${base}/api/cases`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Converge-Session': token },
    body: JSON.stringify(validPayload),
  });
  assert.equal(r.status, 201, 'case creation should succeed');
  return (await r.json()).id;
}

async function shownHeading(page) {
  const h1 = await page.$('#view h1');
  return h1 ? (await h1.innerText()).trim() : '';
}

async function waitForHeading(page, re, timeout = 10000) {
  await page.waitForFunction((rx) => {
    const h1 = document.querySelector('#view h1');
    return h1 && new RegExp(rx).test(h1.innerText);
  }, re.source, { timeout });
}

let token; // P0 (2026-11-07): case creation needs a session token.
async function newCtx() {
  // The server issues at most 5 sessions a minute per instance, and
  // every fresh browser context boots a new session — five page boots
  // would burn the bucket and the last boot would 429. Seed the one
  // token from before() into each context's sessionStorage instead.
  const ctx = await browser.newContext();
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

test('new1: direct navigation to a case created after boot shows that case, not the previous one', { timeout: 30000 }, async () => {
  const ctx = await newCtx();
  const page = await ctx.newPage();
  await page.goto(base + '/');
  await page.waitForSelector('#view h1');
  // A case is on screen (the previously selected one).
  await page.evaluate("location.hash = '#/case/HAG-014'");
  await waitForHeading(page, /^HAG-014/);
  // Case created AFTER this tab booted (e.g. wizard in another tab).
  const id = await createCaseAfterBoot();
  await page.evaluate((cid) => { location.hash = `#/case/${cid}`; }, id);
  await waitForHeading(page, new RegExp(`^${id}`));
  assert.match(await shownHeading(page), new RegExp(`^${id} — GreenFields butter price rise`));
  await ctx.close();
});

test('new1: refresh on a case URL shows that case', { timeout: 30000 }, async () => {
  const id = await createCaseAfterBoot();
  const ctx = await newCtx();
  const page = await ctx.newPage();
  await page.goto(`${base}/#/case/${id}`);
  await waitForHeading(page, new RegExp(`^${id}`));
  await page.reload();
  await waitForHeading(page, new RegExp(`^${id}`));
  assert.match(await shownHeading(page), new RegExp(`^${id} — GreenFields butter price rise`));
  await ctx.close();
});

test('new1: browser back/forward between cases resolves the correct case each time', { timeout: 30000 }, async () => {
  const id = await createCaseAfterBoot();
  const ctx = await newCtx();
  const page = await ctx.newPage();
  await page.goto(base + '/');
  await page.waitForSelector('#view h1');
  await page.evaluate("location.hash = '#/case/HAG-014'");
  await waitForHeading(page, /^HAG-014/);
  await page.evaluate((cid) => { location.hash = `#/case/${cid}`; }, id);
  await waitForHeading(page, new RegExp(`^${id}`));
  await page.goBack();
  await waitForHeading(page, /^HAG-014/);
  assert.match(await shownHeading(page), /^HAG-014/);
  await page.goForward();
  await waitForHeading(page, new RegExp(`^${id}`));
  assert.match(await shownHeading(page), new RegExp(`^${id}`));
  await ctx.close();
});

test('new1: unknown case ID shows "case not found", never a stale case', { timeout: 30000 }, async () => {
  const ctx = await newCtx();
  const page = await ctx.newPage();
  await page.goto(base + '/');
  await page.waitForSelector('#view h1');
  await page.evaluate("location.hash = '#/case/HAG-014'");
  await waitForHeading(page, /^HAG-014/);
  await page.evaluate("location.hash = '#/case/HAG-999'");
  await waitForHeading(page, /^Case not found/);
  assert.match(await shownHeading(page), /^Case not found/);
  const viewText = await page.$eval('#view', (el) => el.innerText);
  assert.ok(!viewText.includes('HAG-014'), 'the previously selected case must not leak into the error view');
  // The error panel offers a way back to the list.
  await page.click('#route-back');
  await page.waitForSelector('#view h1');
  assert.match(await shownHeading(page), /^Active Cases/);
  await ctx.close();
});

test('new1: a loading indicator is shown while the detail is being fetched', { timeout: 30000 }, async () => {
  const ctx = await newCtx();
  const page = await ctx.newPage();
  await page.goto(base + '/');
  await page.waitForSelector('#view h1');
  // The case must be created AFTER this tab boots, or loadAll would
  // already have its detail cached and there would be no fetch to stall.
  const id = await createCaseAfterBoot();
  // Stall the detail fetch so the loading panel is observable.
  await page.route(`**/api/cases/${id}`, async (route) => {
    await new Promise((r) => setTimeout(r, 1200));
    await route.continue();
  });
  await page.evaluate((cid) => { location.hash = `#/case/${cid}`; }, id);
  await waitForHeading(page, /^Loading case…/);
  await waitForHeading(page, new RegExp(`^${id}`), 15000);
  await ctx.close();
});
