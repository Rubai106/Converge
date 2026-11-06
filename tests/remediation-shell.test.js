// CONVERGE remediation — shell / nav / search / tables (H2–H6,
// M1/M3/M5/M8/M22, L2/L11/L13–L17). Static regression tests in the
// style of tests/escaping.test.js: they assert on the SHIPPED client
// source (app/app.js, app/index.html, app/styles.css), not on copies.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const js = readFileSync(join(root, 'app', 'app.js'), 'utf8');
const html = readFileSync(join(root, 'app', 'index.html'), 'utf8');
const css = readFileSync(join(root, 'app', 'styles.css'), 'utf8');

function loadNorm() {
  const m = js.match(/const norm = \(s\) => [^\n]+/);
  assert.ok(m, 'norm() definition not found in app/app.js');
  return new Function(`${m[0]}; return norm;`)();
}

test('H2: search normalises diacritics before matching', () => {
  const norm = loadNorm();
  assert.equal(norm('ragù'), 'ragu');
  assert.equal(norm('RAGÙ'), 'ragu');
  assert.equal(norm('café'), 'cafe');
  assert.equal(norm('plain'), 'plain');
  assert.ok(js.includes('norm(searchQuery.trim())'), 'filteredCases must normalise the query');
  assert.ok(js.includes('matchesQuery('), 'a shared normalised matcher must exist');
});

test('H2: the dashboard search filters the attention list and activity, not just the table', () => {
  assert.ok(js.includes('function filteredNeeds()'), 'attention list must be query-filtered');
  assert.ok(js.includes('function filteredActivity()'), 'activity feed must be query-filtered');
  assert.ok(js.includes('No attention items match'), 'filtered-empty attention state must exist');
  assert.ok(js.includes('No activity matches'), 'filtered-empty activity state must exist');
  assert.ok(js.includes('cases, attention items and activity on this page'), 'caption must describe the real filter scope');
});

test('H5: hash routing exists — #/cases, #/case/<id>?tab=…, hashchange drives the view', () => {
  assert.ok(js.includes('function parseHash()'), 'parseHash must exist');
  assert.ok(js.includes('function hashFor('), 'hashFor must exist');
  assert.ok(js.includes("`#/case/${encodeURIComponent(caseId)}"), 'case deep link must be #/case/<id>');
  assert.ok(js.includes("`#/${v}`"), 'view deep link must be #/<view>');
  assert.ok(js.includes("window.addEventListener('hashchange'"), 'hashchange must drive routing');
  assert.ok(js.includes('applyRoute(parseHash())'), 'boot must route from the hash');
  assert.ok(js.includes('location.hash = target'), 'setView/openCase must push the hash (Back works)');
});

test('H6: unreachable state has a recheck button and a works/doesn\'t-work note', () => {
  assert.ok(html.includes('id="switch-recheck"'), 'Recheck connection button must exist in the topbar');
  assert.ok(html.includes('id="switch-note"'), 'unreachable note element must exist under the topbar');
  assert.ok(js.includes('async function recheckSwitch()'), 'recheckSwitch must exist');
  assert.ok(js.includes("statusData = await api('/api/status')"), 'recheck must re-fetch /api/status');
  assert.ok(js.includes('local case data and decisions still work; rooms and messages are unavailable'),
    'note must state what still works vs what does not');
  assert.ok(js.includes("recheck.hidden = !unreachable"), 'recheck button must appear only while unreachable');
});

test('M1: breadcrumb no longer duplicates the H1 on top-level views', () => {
  for (const fn of ['renderDashboard', 'renderCasesView', 'renderWorkflows', 'renderEvidenceView', 'renderDecisionsView', 'renderActivityView', 'renderSettingsView']) {
    const body = js.slice(js.indexOf(`function ${fn}()`), js.indexOf(`function ${fn}()`) + 400);
    assert.ok(body.includes("setBreadcrumb('')"), `${fn} must clear the breadcrumb`);
  }
  assert.ok(js.includes('el.hidden = !html'), 'an empty breadcrumb must be hidden, not an empty nav landmark');
  assert.ok(js.includes("setBreadcrumb(`<a href=\"#/cases\">Cases</a>"), 'case workspace keeps its non-duplicating parent crumb — now a link (L6, 2026-11-07)');
});

test('M3: "Needs a decision today" is split into approval vs discussion', () => {
  assert.ok(!js.includes('Needs a decision today'), 'the mislabelling heading must be gone');
  assert.ok(js.includes('Needs your attention'), 'panel must be renamed');
  assert.ok(js.includes('Awaiting your approval'), 'awaiting-approval group must exist');
  assert.ok(js.includes('Open discussions'), 'open-discussion group must exist');
});

test('M5: UPDATED column is dropped (no created/seeded time exists to fall back to)', () => {
  assert.ok(!js.includes('Updated</th>'), 'no UPDATED header may remain in the case tables');
  assert.ok(js.includes('colspan="6"'), 'empty-state colspan must match the 6 remaining columns');
  assert.ok(js.includes('UPDATED column dropped (M5)'), 'the reason must be recorded at the site of the change');
});

test('M8: the attention panel renders above the All cases table', () => {
  const dash = js.slice(js.indexOf('function renderDashboard()'), js.indexOf('function activityFeed()'));
  assert.ok(dash.indexOf('needs-h') !== -1 && dash.indexOf('needs-h') < dash.indexOf('cases-h'),
    'needs-h must come before cases-h in renderDashboard');
});

test('M22: tab arrow-key navigation scrolls the focused tab into view', () => {
  const handler = js.slice(js.indexOf("ArrowRight') next"), js.indexOf("ArrowRight') next") + 600);
  assert.ok(handler.includes("el.scrollIntoView({ block: 'nearest', inline: 'nearest' })"),
    'focused tab must be scrolled into view after focus()');
});

test('L2: clickable case rows carry role=button and an aria-label', () => {
  assert.ok(js.includes('role="button" aria-label="Open case'), 'case rows must expose their action');
  // AXE-1 (fix-round 2026-11-06): the Workflows rows carry an inner
  // demo-case link, so they must NOT also carry role="button" (a link
  // inside a button-role row is a nested-interactive axe violation).
  // The row exposes its action through the demo-case link instead.
  assert.ok(!js.includes('role="button" aria-label="Open demo case'), 'workflow rows must not nest a link inside role="button"');
  assert.ok(js.includes('<a href="?case=${r[3]}"'), 'workflow rows must expose their action via the demo-case link');
});

test('H3: bottom nav shrinks at <=480px so all 7 items fit', () => {
  const m = css.match(/@media \(max-width:480px\)\{[\s\S]*?\n\}/);
  assert.ok(m, '<=480px block not found');
  assert.ok(m[0].includes('.bottomnav .nav-item{flex:1 1 0'), 'bottom-nav items must share the width');
  assert.ok(m[0].includes('font-size:11px'), 'bottom-nav type must shrink');
});

test('H4/L13/L15: tables get a scroll shadow and the Owner column drops at narrow widths', () => {
  assert.ok(css.includes('background-attachment:local,local,scroll,scroll'), 'table-wrap must show a scroll shadow only while scrollable');
  assert.ok(css.includes('@media (max-width:720px)') && css.includes('.col-owner{display:none}'),
    'Owner column must be hidden at narrow widths');
  assert.ok(js.includes('class="col-owner"'), 'owner cells must carry the col-owner class');
});

test('L14: primary touch targets reach 44px at <=480px', () => {
  const m = css.match(/@media \(max-width:480px\)\{[\s\S]*?\n\}/);
  assert.ok(m[0].includes('.btn,.ghost-btn{min-height:44px}'), 'buttons must be 44px tall');
  assert.ok(m[0].includes('.search-wrap input{min-height:44px}'), 'search input must be 44px tall');
});

test('L11: selected strategy row regains its left padding; tab row has a scroll cue', () => {
  assert.ok(css.includes('tbody tr.sel td:first-child{padding-left:8px}'), 'selected row padding must be restored');
  assert.ok(css.includes('.tabs{display:flex'), 'tab row rule must exist');
  const tabs = css.slice(css.indexOf('.tabs{display:flex'), css.indexOf('.tabs{display:flex') + 800);
  assert.ok(tabs.includes('background-attachment:local,local,scroll,scroll'), 'tab row must carry the scroll-shadow cue');
});

test('L16: claims table has a min-width so the Claim column gets room', () => {
  assert.ok(css.includes('.claims-table{min-width:560px}'), 'claims table min-width must be set');
  assert.ok(js.includes('<table class="claims-table">'), 'claims table must carry the class');
});

// L17 (revised 2026-11-06): shrinking the type only made the labels
// collide ("InvestigatingDiscussion") — the 7 labels never fit a 390px
// row. At phone sizes the stepper scrolls and each label keeps its
// natural width.
test('L17: the stepper scrolls at <=480px so its labels never collide', () => {
  const m = css.match(/@media \(max-width:480px\)\{[\s\S]*?\n\}/);
  assert.ok(m[0].includes('.stepper{overflow-x:auto'), 'the stepper must scroll at phone sizes');
  assert.ok(m[0].includes('.stepper li{flex:0 0 auto'), 'step items must keep their natural width');
  assert.ok(m[0].includes('white-space:nowrap'), 'stepper labels must not wrap');
  assert.ok(!m[0].includes('.stepper li{font-size:10px'), 'the old shrink-the-type fix that collided must be gone');
});
