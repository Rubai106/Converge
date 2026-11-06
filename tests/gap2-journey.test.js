// CONVERGE GAP-2 UI journey test (2026-11-06) — the entire
// wizard-to-approval journey through UI interactions ONLY (no API
// calls from the test to drive the workflow; the API is used only to
// set up the scratch server and to read back the recorded state).
// Runs Chromium against a scratch server on a temp copy of the demo
// data (seedData()), never the shared data/converge.json — see
// tests/new1-deeplink.test.js. Screenshots at each step and a screen
// recording are written to GAP2_EVIDENCE_DIR (default: a temp dir).
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, renameSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { seedData } from '../server/store.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const PORT = 3213;
const base = `http://127.0.0.1:${PORT}`;
const evidenceDir = process.env.GAP2_EVIDENCE_DIR || mkdtempSync(join(tmpdir(), 'converge-gap2-evidence-'));
mkdirSync(evidenceDir, { recursive: true });

const scratchDir = mkdtempSync(join(tmpdir(), 'converge-gap2-journey-'));
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
  const p = join(evidenceDir, name);
  await page.screenshot({ path: p });
  return p;
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

test('gap2: UI-only wizard-to-approval journey (create, submit, approve, complete)', { timeout: 120000 }, async () => {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: { dir: evidenceDir, size: { width: 1440, height: 900 } },
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  // The favicon 404 is a known benign resource miss (no favicon is
  // shipped); its URL is in the message location, not the text.
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const loc = (m.location() && m.location().url) || '';
    if (loc.includes('favicon.ico')) return;
    errors.push(m.text());
  });
  try {
    await page.goto(base + '/');
    await page.waitForSelector('#view h1');
    // 1. Wizard: open it from the dashboard.
    await page.locator('#new-case-btn').first().click();
    await page.waitForSelector('#wz-supplier');
    await shot(page, 'gap2-01-wizard-step1.png');
    await page.fill('#wz-supplier', 'GreenFields');
    await page.fill('#wz-ingredient', 'butter');
    await page.click('#wz-next');
    await page.waitForSelector('#wz-oldPrice');
    await page.fill('#wz-oldPrice', '0.16');
    await page.fill('#wz-newPrice', '0.24');
    await page.selectOption('#wz-unit', 'fl oz');
    await page.fill('#wz-qtyPerServing', '6');
    await page.click('#wz-next');
    await page.waitForSelector('#wz-menuPrice');
    await page.fill('#wz-menuPrice', '16');
    await page.fill('#wz-otherIngredientsCostPerServing', '3.62');
    await page.fill('#wz-monthlySales', '160');
    await page.fill('#wz-targetFoodCostPct', '30');
    await page.click('#wz-next');
    await page.waitForSelector('#wz-targetPrice');
    await page.fill('#wz-targetPrice', '0.16');
    await page.fill('#wz-maxApprovedPrice', '0.20');
    await page.click('#wz-next');
    // 2. Step 5: the deterministic preview loads, then Create enables.
    await page.waitForSelector('#wz-create:not([disabled])', { timeout: 15000 });
    await shot(page, 'gap2-02-wizard-review.png');
    await page.click('#wz-create');
    // 3. The case opens in DISCUSSION.
    await page.waitForFunction(() => {
      const h1 = document.querySelector('#view h1');
      return h1 && /^HAG-\d+ — GreenFields butter price rise/.test(h1.innerText);
    }, null, { timeout: 15000 });
    const heading = await page.$eval('#view h1', (el) => el.innerText.trim());
    const caseId = heading.split(' ')[0];
    assert.match(heading, /^HAG-\d+ — GreenFields butter price rise$/);
    const statePill = await page.$eval('.case-meta', (el) => el.innerText);
    assert.match(statePill, /DISCUSSION/);
    await shot(page, 'gap2-03-created-discussion.png');
    // 4. Negotiation tab: select the counter-019 strategy and review it.
    await page.click('[data-tab="negotiation"]');
    await page.waitForSelector('tr[data-strategy="counter-019"]');
    await page.click('tr[data-strategy="counter-019"]');
    await waitForText(page, '#impact-panel', /Accept a counter at \$0\.19/);
    const impact = await page.$eval('#impact-panel', (el) => el.innerText);
    assert.ok(impact.includes('$1.14'), 'impact panel shows the counter-019 cream cost $1.14/serving');
    assert.ok(impact.includes('29.75%'), 'impact panel shows food cost 29.75%');
    // 5. Submit for approval — the button shows the exact terms.
    const submitLabel = await page.$eval('#submit-btn', (el) => el.innerText.trim());
    assert.equal(submitLabel, 'Submit for approval');
    assert.ok(impact.includes('$0.19/fl oz for 6 weeks, in writing'), 'the exact proposed terms are shown above the button');
    await shot(page, 'gap2-04-selected-submit.png');
    await page.click('#submit-btn');
    await page.waitForSelector('#approve-btn', { timeout: 15000 });
    const approveLabel = await page.$eval('#approve-btn', (el) => el.innerText.trim());
    assert.match(approveLabel, /^Approve \$0\.19 \/ fl oz · 6 weeks$/);
    // The pending proposal is visible in the Approvals rail.
    await waitForText(page, '#view', /Pending: \$0\.19\/fl oz for 6 weeks, in writing/);
    await shot(page, 'gap2-05-submitted-awaiting.png');
    // 6. The approval modal: terms, financial consequences,
    // recommendation and mandate compliance.
    await page.click('#approve-btn');
    await page.waitForSelector('#modal-backdrop:not([hidden])');
    const modalTerms = await page.$eval('#modal-terms', (el) => el.innerText);
    assert.ok(modalTerms.includes('$0.19/fl oz for 6 weeks, in writing'), 'modal restates the exact terms');
    const modalImpact = await page.$eval('#modal-impact', (el) => el.innerText);
    assert.ok(modalImpact.includes('+$0.18 / serving'), `modal shows +$0.18/serving (got: ${modalImpact})`);
    assert.ok(modalImpact.includes('+$28.80 / month'), 'modal shows +$28.80/month');
    assert.ok(modalImpact.includes('food cost 29.75%'), 'modal shows food cost 29.75%');
    assert.ok(modalImpact.includes('within mandate max $0.20'), 'modal shows mandate compliance');
    const modalRec = await page.$eval('#modal-recommendation', (el) => el.innerText);
    assert.ok(modalRec.includes('Balanced: stays under the 30% food-cost target.'), 'modal shows the recommendation');
    await shot(page, 'gap2-06-approval-modal.png');
    // 7. Human approve -> APPROVED, audit tab shows the signed sentence.
    await page.click('#modal-confirm');
    await waitForText(page, '#view', /I approve \$0\.19\/fl oz for 6 weeks, in writing\./, 15000);
    await shot(page, 'gap2-07-approved-audit.png');
    // 8. Analysis: the financial impact panel reflects the APPROVED
    // strategy, not the unmitigated supplier shock. (The chart moved
    // here from the Overview in 2026-11-06; the Overview keeps the
    // same figures as key figures.)
    await page.click('[data-tab="analysis"]');
    await waitForText(page, '#view', /Approved terms: \$0\.19\/fl oz for 6 weeks, in writing/);
    const hero = await page.$eval('.hero', (el) => el.innerText);
    assert.ok(hero.includes('+$0.18'), `hero shows the approved +$0.18/serving (got: ${hero})`);
    assert.ok(!hero.includes('+$0.48'), 'hero must NOT show the unmitigated +$0.48/serving');
    await shot(page, 'gap2-08-approved-impact.png');
    // The Overview shows the same approved figures as key figures.
    await page.click('[data-tab="overview"]');
    await waitForText(page, '#view', /Approved terms: \$0\.19\/fl oz for 6 weeks, in writing/);
    const keyFigures = await page.$eval('.key-figures', (el) => el.innerText);
    assert.ok(keyFigures.includes('+$0.18'), `key figures show +$0.18/serving (got: ${keyFigures})`);
    assert.ok(keyFigures.includes('29.75%'), 'key figures show the approved food cost 29.75%');
    // 9. Mark completed -> COMPLETED; the audit history is correct.
    await page.click('[data-tab="negotiation"]');
    await page.waitForSelector('#complete-btn');
    await page.click('#complete-btn');
    await page.waitForFunction(() => {
      const meta = document.querySelector('.case-meta');
      return meta && /COMPLETED/.test(meta.innerText);
    }, null, { timeout: 15000 });
    await page.click('[data-tab="audit"]');
    const auditText = await page.$eval('#view', (el) => el.innerText);
    for (const want of ['state:DISCUSSION->PROPOSAL', 'state:PROPOSAL->AWAITING_APPROVAL', 'state:AWAITING_APPROVAL->APPROVED', 'state:APPROVED->COMPLETED']) {
      assert.ok(auditText.includes(want), `audit must record ${want}`);
    }
    await shot(page, 'gap2-09-completed-audit.png');
    // 10. The recorded state (read back, not driven by the API).
    const d = await (await fetch(`${base}/api/cases/${caseId}`)).json();
    assert.equal(d.state, 'COMPLETED');
    assert.equal(d.approval.proposalId, 'P2');
    assert.equal(d.approval.terms, '$0.19/fl oz for 6 weeks, in writing');
    assert.equal(d.approval.approvedBy, 'Mara (owner)');
    assert.equal(d.pendingApproval, null);
    assert.equal(errors.length, 0, `no page/console errors during the journey (got: ${errors.join(' | ')})`);
  } finally {
    await ctx.close();
    // The recording is finalised on context close; give it a stable name.
    const video = page.video();
    if (video) {
      const p = await video.path().catch(() => null);
      if (p && existsSync(p)) renameSync(p, join(evidenceDir, 'gap2-journey.webm'));
    }
  }
});

test('gap2: drawer post refreshes the audit tab without a reload (staleness fix)', { timeout: 60000 }, async () => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  try {
    // A fresh case created via the API (setup only — the UI drives the rest).
    const created = await (await fetch(`${base}/api/cases`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        supplier: 'GreenFields', ingredient: 'butter', recipe: '',
        oldPrice: 0.16, newPrice: 0.24, unit: 'fl oz', qtyPerServing: 6,
        otherIngredientsCostPerServing: 3.62, menuPrice: 16.0, monthlySales: 160,
        targetFoodCostPct: 30, targetPrice: 0.16, maxApprovedPrice: 0.20, evidenceSource: '',
      }),
    })).json();
    await page.goto(`${base}/#/case/${created.id}`);
    await page.waitForFunction(() => {
      const h1 = document.querySelector('#view h1');
      return h1 && /GreenFields butter price rise/.test(h1.innerText);
    }, null, { timeout: 15000 });
    // Open the drawer from the case view and post a message.
    await page.click('[data-tab="audit"]');
    await page.waitForSelector('#view .audit-list, #view .empty');
    const before = await page.$eval('#view', (el) => el.innerText);
    await page.locator('[data-room-btn]').first().click();
    await page.waitForSelector('#room-drawer:not([hidden])');
    await page.fill('#room-text', 'GAP2-STALENESS-PROBE — drawer post');
    await page.click('#room-form button[type="submit"], #room-form .btn');
    await waitForText(page, '#room-log', /GAP2-STALENESS-PROBE/, 15000);
    await page.click('#drawer-close');
    await page.waitForSelector('#room-drawer', { state: 'hidden' });
    // No reload: the audit tab must already show the new room-message event.
    const after = await page.$eval('#view', (el) => el.innerText);
    assert.ok(after.includes('room-message'), 'the audit tab shows the drawer post without a reload');
    assert.ok(after.length > before.length, 'the audit list grew by the posted message');
    assert.equal(errors.length, 0, `no page errors (got: ${errors.join(' | ')})`);
  } finally {
    await ctx.close();
  }
});
