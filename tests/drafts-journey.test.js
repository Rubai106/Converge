// CONVERGE draft-handoff journey test (§30, 2026-11-07) — the full
// human-mediated flow through the UI ONLY (the API is used only to set
// up the scratch server, seed a mock draft, and verify the 409/401
// backstops): open the case, see the mock draft in the Drafts tab,
// review it, share it in Mattermost (with the confirm step), and see
// the recorded share result. Runs Chromium against a scratch server on
// a temp copy of the demo data (seedData()), never the shared
// data/converge.json and never port 3100.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { seedData } from '../server/store.js';
import { appendDraft } from '../server/drafts.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 3214;
const base = `http://127.0.0.1:${PORT}`;
const scratchDir = mkdtempSync(join(tmpdir(), 'converge-drafts-journey-'));
const dataFile = join(scratchDir, 'converge.json');
const draftsFile = join(scratchDir, 'drafts.json');
let child;
let browser;

async function waitForServer() {
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch(`${base}/api/status`); if (r.ok) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('server did not start');
}

test.before(async () => {
  writeFileSync(dataFile, JSON.stringify(seedData()));
  // Seed a mock draft (as the runtime would produce it) into the
  // scratch inbox. It is labelled mock:true — the UI must say so.
  appendDraft({
    id: 'journey-draft-1',
    caseId: 'HAG-014',
    roomId: '177e6354-e07f-44eb-b385-8055faf021e6',
    messageId: 'm1',
    request: 'What should we do about the cream price?',
    draft: 'Hold the price and ask the supplier in writing.',
    role: 'financial-analyst',
    confidence: 'high',
    caveats: ['mock provider: not a live model response'],
    toolsUsed: ['read_case', 'read_room_timeline', 'compute_haggle'],
    findings: {
      source: 'deterministic engine — no LLM maths',
      analysis: { oldFoodCostPct: 28.63, newFoodCostPct: 31.62, monthlyExtraCost: 76.8, annualExtraCost: 921.6, maxSustainableUnitPrice: 0.2, costDiffPerServing: 0.48, pctChange: 50 },
      strategies: [{ id: 'counter-019', name: 'Counter', unitPrice: 0.18, foodCostPct: 29.38, extraVsOldPerMonth: 19.2, savingVsNewPerMonth: 57.6 }],
    },
    needsHumanReview: true,
    status: 'GENERATED',
    provider: 'mock',
    model: 'mock',
    mock: true,
    supersedes: null,
    createdAt: '2026-11-07T01:00:00.000Z',
    at: '2026-11-07T01:00:00.000Z',
  }, draftsFile);
  child = spawn('node', ['server/server.js'], { cwd: root, env: { ...process.env, PORT: String(PORT), CONVERGE_DATA_FILE: dataFile }, stdio: 'ignore' });
  await waitForServer();
  browser = await chromium.launch();
});

test.after(async () => {
  await browser?.close();
  child?.kill();
  rmSync(scratchDir, { recursive: true, force: true });
});

test('drafts journey: review and share a mock draft from the Drafts tab', { timeout: 120000 }, async () => {
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
    await page.goto(`${base}/#/case/HAG-014`);
    await page.waitForSelector('#view h1');
    // The Drafts tab carries the open-draft count.
    await page.waitForSelector('[data-tab="drafts"]');
    assert.match(await page.locator('[data-tab="drafts"]').innerText(), /Drafts \(1\)/);
    await page.locator('[data-tab="drafts"]').click();
    // The seeded mock draft is visible, with its request, tools,
    // engine findings, and an explicit MOCK label — never presented
    // as a live model response.
    await page.waitForSelector('text=What should we do about the cream price?');
    assert.match(await page.locator('#view').innerText(), /MOCK — test output, NOT a live model response/);
    assert.match(await page.locator('#view').innerText(), /compute_haggle/);
    assert.match(await page.locator('#view').innerText(), /31\.62/);
    assert.match(await page.locator('#view').innerText(), /Hold the price and ask the supplier in writing/);
    // 1. Start review: GENERATED -> UNDER_REVIEW.
    await page.locator('[data-draft-action="review"]').click();
    await page.waitForSelector('text=UNDER REVIEW', { timeout: 10000 });
    // 2. Share: the confirm step states sharing is not approval.
    await page.locator('[data-draft-action="share"]').click();
    await page.waitForSelector('text=Sharing is NOT approval');
    await page.locator('[data-draft-action="share-confirm"]').click();
    // 3. The draft is SHARED and the actual result is shown: the room,
    // the sharer, and the SIMULATED label (stub mode — not real
    // Mattermost).
    await page.waitForSelector('text=Shared in #haggle-dairyco', { timeout: 10000 });
    assert.match(await page.locator('#view').innerText(), /SIMULATED — stub room, not real Mattermost/);
    assert.match(await page.locator('#view').innerText(), /SHARED/);
    assert.equal(errors.length, 0, `console/page errors: ${errors.join(' | ')}`);
  } finally {
    await ctx.close();
  }
  // 4. Backstops (direct API): a second share is rejected 409, and
  // every mutation without a session token returns 401.
  const noToken = await fetch(`${base}/api/drafts/journey-draft-1/share`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ caseId: 'HAG-014' }),
  });
  assert.equal(noToken.status, 401);
  const token = (await (await fetch(`${base}/api/session`, { method: 'POST' })).json()).token;
  const again = await fetch(`${base}/api/drafts/journey-draft-1/share`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Converge-Session': token }, body: JSON.stringify({ caseId: 'HAG-014' }),
  });
  assert.equal(again.status, 409);
  const noTokenReview = await fetch(`${base}/api/drafts/journey-draft-1/review`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
  });
  assert.equal(noTokenReview.status, 401);
});
