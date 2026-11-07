// CONVERGE draft-handoff tests (§30, 2026-11-07) — the draft inbox
// (server/drafts.js), the runtime draft record (server/agent-runtime.js),
// and the app-server draft endpoints (server/server.js).
// Unit tests use explicit scratch files; the endpoint tests spawn the
// real server on a scratch port against isolated scratch data
// (seedData() + CONVERGE_DATA_FILE), never the shared data/converge.json
// and never port 3100. The server runs in SIMULATED-STUB mode, so a
// share posts to the stub room and records simulated:true.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { seedData } from '../server/store.js';
import {
  loadDrafts, saveDrafts, appendDraft, getDraft, listDraftsByCase,
  findOpenDraft, updateDraft, resolveDraftsFile,
} from '../server/drafts.js';
import { createAgentRuntime, buildFindings } from '../server/agent-runtime.js';
import { createMockProvider } from '../server/llm.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const HAG_ROOM = '177e6354-e07f-44eb-b385-8055faf021e6';
const COURT_ROOM = '478f26a8-a843-480e-9707-78c142000341';

function mockDraft(overrides = {}) {
  return {
    id: 'draft-1',
    caseId: 'HAG-014',
    roomId: HAG_ROOM,
    messageId: 'm1',
    request: 'What should we do about the cream price?',
    draft: 'Hold the price and ask the supplier in writing.',
    role: 'financial-analyst',
    confidence: 'high',
    caveats: ['mock provider: not a live model response'],
    toolsUsed: ['read_case', 'read_room_timeline', 'compute_haggle'],
    findings: { source: 'deterministic engine — no LLM maths', analysis: { newFoodCostPct: 31.62, monthlyExtraCost: 76.8 }, strategies: [] },
    needsHumanReview: true,
    status: 'GENERATED',
    provider: 'mock',
    model: 'mock',
    mock: true,
    supersedes: null,
    createdAt: '2026-11-07T01:00:00.000Z',
    at: '2026-11-07T01:00:00.000Z',
    ...overrides,
  };
}

// ---------- inbox (unit, explicit scratch file) ----------

test('drafts: append + read round-trips, and a missing file reads empty', () => {
  const dir = mkdtempSync(join(tmpdir(), 'converge-drafts-unit-'));
  const file = join(dir, 'drafts.json');
  try {
    assert.deepEqual(loadDrafts(file), { drafts: [] });
    const d = appendDraft(mockDraft(), file);
    assert.equal(d.id, 'draft-1');
    assert.equal(getDraft('draft-1', file).draft, 'Hold the price and ask the supplier in writing.');
    assert.equal(getDraft('nope', file), null);
    assert.equal(loadDrafts(file).drafts.length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('drafts: list is newest first and never leaks between cases', () => {
  const dir = mkdtempSync(join(tmpdir(), 'converge-drafts-unit-'));
  const file = join(dir, 'drafts.json');
  try {
    appendDraft(mockDraft({ id: 'd-old', createdAt: '2026-11-07T01:00:00.000Z' }), file);
    appendDraft(mockDraft({ id: 'd-new', createdAt: '2026-11-07T02:00:00.000Z' }), file);
    appendDraft(mockDraft({ id: 'd-court', caseId: 'CRT-007', roomId: COURT_ROOM, createdAt: '2026-11-07T03:00:00.000Z' }), file);
    const hag = listDraftsByCase('HAG-014', file);
    assert.deepEqual(hag.map((d) => d.id), ['d-new', 'd-old']);
    const court = listDraftsByCase('CRT-007', file);
    assert.deepEqual(court.map((d) => d.id), ['d-court']);
    // A draft for HAG-014 must never appear under CRT-007.
    assert.ok(!court.some((d) => d.caseId === 'HAG-014'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('drafts: findOpenDraft returns the newest open draft, null when none', () => {
  const dir = mkdtempSync(join(tmpdir(), 'converge-drafts-unit-'));
  const file = join(dir, 'drafts.json');
  try {
    assert.equal(findOpenDraft('HAG-014', file), null);
    appendDraft(mockDraft({ id: 'd1', status: 'SHARED' }), file);
    assert.equal(findOpenDraft('HAG-014', file), null);
    appendDraft(mockDraft({ id: 'd2', status: 'GENERATED', createdAt: '2026-11-07T01:00:00.000Z' }), file);
    appendDraft(mockDraft({ id: 'd3', status: 'UNDER_REVIEW', createdAt: '2026-11-07T02:00:00.000Z' }), file);
    assert.equal(findOpenDraft('HAG-014', file).id, 'd3');
    appendDraft(mockDraft({ id: 'd4', status: 'REJECTED' }), file);
    assert.equal(findOpenDraft('HAG-014', file).id, 'd3');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('drafts: updateDraft mutates and persists; unknown id returns null', () => {
  const dir = mkdtempSync(join(tmpdir(), 'converge-drafts-unit-'));
  const file = join(dir, 'drafts.json');
  try {
    appendDraft(mockDraft(), file);
    assert.equal(updateDraft('nope', () => {}, file), null);
    const updated = updateDraft('draft-1', (d) => { d.status = 'UNDER_REVIEW'; d.reviewedBy = 'Mara · Owner'; }, file);
    assert.equal(updated.status, 'UNDER_REVIEW');
    assert.equal(getDraft('draft-1', file).reviewedBy, 'Mara · Owner');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('drafts: resolveDraftsFile follows CONVERGE_DATA_FILE', () => {
  const p = resolveDraftsFile({ CONVERGE_DATA_FILE: '/tmp/scratch/converge.json' });
  assert.equal(p, '/tmp/scratch/drafts.json');
  const def = resolveDraftsFile({});
  assert.ok(def.endsWith('data/drafts.json'), def);
});

// ---------- findings (pure) ----------

test('drafts: buildFindings carries the engine output for HAGGLE', () => {
  const c = seedData().cases.find((x) => x.id === 'HAG-014');
  const engineCtx = {
    analysis: { oldFoodCostPct: 28.63, newFoodCostPct: 31.62, monthlyExtraCost: 76.8, annualExtraCost: 921.6, maxSustainableUnitPrice: 0.2, costDiffPerServing: 0.48, pctChange: 50 },
    strategies: [{ id: 'counter-019', name: 'Counter', unitPrice: 0.18, foodCostPct: 29.38, extraVsOldPerMonth: 19.2, savingVsNewPerMonth: 57.6 }],
  };
  const f = buildFindings(c, engineCtx);
  assert.equal(f.source, 'deterministic engine — no LLM maths');
  assert.equal(f.analysis.newFoodCostPct, 31.62);
  assert.equal(f.analysis.monthlyExtraCost, 76.8);
  assert.equal(f.strategies[0].unitPrice, 0.18);
});

test('drafts: buildFindings records evidence ids for COURT/CORRECTION', () => {
  const c = seedData().cases.find((x) => x.id === 'CRT-007');
  const f = buildFindings(c, null);
  assert.deepEqual(f.evidenceIds, ['E1']);
  assert.equal(f.source, 'case evidence (read_case context)');
});

// ---------- runtime draft record (in-process, mock provider) ----------

function mockProvider() {
  return createMockProvider({
    respond: () => ({
      draft: 'Test draft: hold the price and ask the supplier in writing.',
      role: 'financial-analyst',
      confidence: 'high',
      caveats: ['mock'],
      needsHumanReview: true,
    }),
  });
}

test('drafts: the runtime draft record carries id, request, provider, tools and findings', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'converge-drafts-runtime-'));
  const draftsFile = join(dir, 'drafts.json');
  try {
    const runtime = createAgentRuntime({
      apiKey: 'test-key',
      provider: mockProvider(),
      getCases: () => seedData().cases,
      readTimeline: async () => [],
      draftsFile,
      // Replies disabled here: these tests assert on drafts, not posts.
      replyEnabled: false,
    });
    const d = await runtime.routeHumanMessage({ roomId: HAG_ROOM, messageId: 'm1', senderName: 'Mara', text: 'What should we do about the cream price?' });
    assert.ok(d, 'a draft is produced');
    assert.equal(typeof d.id, 'string');
    assert.ok(d.id.length >= 8, 'draft id is a UUID');
    assert.equal(d.request, 'What should we do about the cream price?');
    assert.equal(d.provider, 'mock');
    assert.equal(d.model, 'mock');
    assert.equal(d.mock, true);
    assert.equal(d.status, 'GENERATED');
    assert.equal(d.needsHumanReview, true);
    assert.deepEqual(d.toolsUsed, ['read_case', 'read_room_timeline', 'compute_haggle']);
    assert.equal(d.findings.source, 'deterministic engine — no LLM maths');
    assert.equal(d.findings.analysis.newFoodCostPct, 31.62);
    assert.equal(d.supersedes, null);
    assert.equal(typeof d.createdAt, 'string');
    // The DEFAULT onDraft appended the draft to the inbox.
    const stored = getDraft(d.id, draftsFile);
    assert.ok(stored, 'the draft reached the inbox');
    assert.equal(stored.status, 'GENERATED');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('drafts: a new draft supersedes the open draft for the case (old record kept)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'converge-drafts-runtime-'));
  const draftsFile = join(dir, 'drafts.json');
  try {
    appendDraft(mockDraft({ id: 'old-draft', status: 'UNDER_REVIEW' }), draftsFile);
    const runtime = createAgentRuntime({
      apiKey: 'test-key',
      provider: mockProvider(),
      getCases: () => seedData().cases,
      readTimeline: async () => [],
      draftsFile,
      // Replies disabled here: these tests assert on drafts, not posts.
      replyEnabled: false,
    });
    const d = await runtime.routeHumanMessage({ roomId: HAG_ROOM, messageId: 'm2', senderName: 'Mara', text: 'And the volume option?' });
    assert.equal(d.supersedes, 'old-draft');
    // The old record is still in the inbox, untouched.
    assert.equal(getDraft('old-draft', draftsFile).status, 'UNDER_REVIEW');
    assert.equal(listDraftsByCase('HAG-014', draftsFile).length, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('drafts: COURT drafts record evidence ids, not engine maths', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'converge-drafts-runtime-'));
  const draftsFile = join(dir, 'drafts.json');
  try {
    const runtime = createAgentRuntime({
      apiKey: 'test-key',
      provider: createMockProvider({
        respond: () => ({ draft: 'Court draft', role: 'researcher', confidence: 'medium', caveats: [], needsHumanReview: true }),
      }),
      getCases: () => seedData().cases,
      readTimeline: async () => [],
      draftsFile,
      // Replies disabled here: these tests assert on drafts, not posts.
      replyEnabled: false,
    });
    const d = await runtime.routeHumanMessage({ roomId: COURT_ROOM, messageId: 'm1', senderName: 'Mara', text: 'Which version won the blind test?' });
    assert.deepEqual(d.toolsUsed, ['read_case', 'read_room_timeline']);
    assert.deepEqual(d.findings.evidenceIds, ['E1']);
    assert.equal(d.findings.source, 'case evidence (read_case context)');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------- endpoints (scratch server) ----------

const PORT = 3351;
const base = `http://127.0.0.1:${PORT}`;
const scratchDir = mkdtempSync(join(tmpdir(), 'converge-drafts-server-'));
const dataFile = join(scratchDir, 'converge.json');
const draftsFile = join(scratchDir, 'drafts.json');
let child;
let token;

async function waitForServer() {
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch(`${base}/api/status`); if (r.ok) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('server did not start');
}
function post(path, body, tok = token) {
  const headers = { 'Content-Type': 'application/json' };
  if (tok) headers['X-Converge-Session'] = tok;
  return fetch(`${base}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
}
async function seedDraft(overrides = {}) {
  const d = mockDraft(overrides);
  appendDraft(d, draftsFile);
  return d;
}

test.before(async () => {
  writeFileSync(dataFile, JSON.stringify(seedData()));
  child = spawn('node', ['server/server.js'], { cwd: root, env: { ...process.env, PORT: String(PORT), CONVERGE_DATA_FILE: dataFile }, stdio: 'ignore' });
  await waitForServer();
  token = (await (await fetch(`${base}/api/session`, { method: 'POST' })).json()).token;
});

test.after(() => {
  child?.kill();
  rmSync(scratchDir, { recursive: true, force: true });
});

test('drafts endpoints: list is case-scoped; missing caseId 400; unknown case 404', async () => {
  const d = await seedDraft({ id: 'list-1' });
  let r = await fetch(`${base}/api/drafts?caseId=HAG-014`);
  assert.equal(r.status, 200);
  const hag = await r.json();
  assert.ok(hag.drafts.some((x) => x.id === 'list-1'));
  r = await fetch(`${base}/api/drafts?caseId=CRT-007`);
  assert.equal(r.status, 200);
  const court = await r.json();
  assert.ok(!court.drafts.some((x) => x.id === 'list-1'), 'a HAG-014 draft must never appear under CRT-007');
  r = await fetch(`${base}/api/drafts`);
  assert.equal(r.status, 400);
  r = await fetch(`${base}/api/drafts?caseId=NOPE-000`);
  assert.equal(r.status, 404);
  assert.equal(d.id, 'list-1');
});

test('drafts endpoints: review moves GENERATED to UNDER_REVIEW; unknown draft 404', async () => {
  await seedDraft({ id: 'rev-1' });
  let r = await post('/api/drafts/rev-1/review', {}, null);
  assert.equal(r.status, 401, 'review without a session token must 401');
  r = await post('/api/drafts/rev-1/review', {});
  assert.equal(r.status, 200);
  assert.equal((await r.json()).status, 'UNDER_REVIEW');
  r = await post('/api/drafts/rev-1/review', {});
  assert.equal(r.status, 200, 're-review is idempotent');
  r = await post('/api/drafts/nope/review', {});
  assert.equal(r.status, 404);
});

test('drafts endpoints: share posts to the room, marks SHARED, and a second share 409s', async () => {
  await seedDraft({ id: 'share-1' });
  let r = await post('/api/drafts/share-1/share', { caseId: 'HAG-014' }, null);
  assert.equal(r.status, 401, 'share without a session token must 401');
  r = await post('/api/drafts/share-1/share', { caseId: 'HAG-014' });
  assert.equal(r.status, 200);
  const shared = await r.json();
  assert.equal(shared.status, 'SHARED');
  assert.equal(shared.sharedBy, 'Mara · Owner');
  assert.ok(shared.shareResult, 'the actual share result is recorded');
  assert.equal(shared.shareResult.simulated, true, 'stub mode: the share is simulated, not real Mattermost');
  assert.equal(shared.shareResult.room, '#haggle-dairyco');
  // The share is recorded in the case audit trail.
  const c = await (await fetch(`${base}/api/cases/HAG-014`)).json();
  assert.ok(c.audit.some((a) => a.event === 'draft-shared' && a.draftId === 'share-1'));
  // A second share is rejected.
  r = await post('/api/drafts/share-1/share', { caseId: 'HAG-014' });
  assert.equal(r.status, 409);
});

test('drafts endpoints: share text is fully ASCII even with an em dash in the draft and the middle dot in the actor name', async () => {
  // Regression: the share footer carries the session actor name
  // ("Mara · Owner") and the draft text can hold an em dash. The
  // real Switch path 500s on any non-ASCII character, so the posted
  // text must be printable ASCII only. The stored draft is untouched.
  const d = await seedDraft({ id: 'ascii-1', draft: 'Hold the price — ask in writing, “in writing”.' });
  const r = await post('/api/drafts/ascii-1/share', { caseId: 'HAG-014' });
  assert.equal(r.status, 200);
  const c = await (await fetch(`${base}/api/cases/HAG-014`)).json();
  const msg = c.messages.find((m) => m.draftId === 'ascii-1');
  assert.ok(msg, 'the shared message is recorded on the case');
  assert.ok(!/[^\x20-\x7E\n]/.test(msg.text), 'the posted share text must be printable ASCII only');
  assert.ok(!msg.text.includes('—') && !msg.text.includes('·'), 'no em dash or middle dot survives in the posted text');
  assert.ok(msg.text.includes('Hold the price - ask in writing'), 'the em dash is replaced with a hyphen');
  const stored = (await (await fetch(`${base}/api/drafts?caseId=HAG-014`)).json()).drafts.find((x) => x.id === 'ascii-1');
  assert.equal(stored.draft, 'Hold the price — ask in writing, “in writing”.', 'the stored draft keeps its original text');
  assert.equal(stored.shareResult.sanitized, true);
});

test('drafts endpoints: share with the wrong case is refused; reject/archive/revision lifecycle', async () => {
  await seedDraft({ id: 'life-1' });
  let r = await post('/api/drafts/life-1/share', { caseId: 'CRT-007' });
  assert.equal(r.status, 400, 'a draft cannot be shared as another case');
  r = await post('/api/drafts/life-1/share', {});
  assert.equal(r.status, 400, 'caseId is required');
  // Request a revision: stays UNDER_REVIEW with the note recorded.
  r = await post('/api/drafts/life-1/request-revision', { note: 'Check the volume math.' });
  assert.equal(r.status, 200);
  let d = await r.json();
  assert.equal(d.status, 'UNDER_REVIEW');
  assert.equal(d.revisionRequested.note, 'Check the volume math.');
  assert.equal(d.revisionRequested.by, 'Mara · Owner');
  assert.equal(d.revisionHistory.length, 1);
  // Reject: UNDER_REVIEW -> REJECTED.
  r = await post('/api/drafts/life-1/reject', {});
  assert.equal(r.status, 200);
  d = await r.json();
  assert.equal(d.status, 'REJECTED');
  // A rejected draft cannot be shared or reviewed.
  r = await post('/api/drafts/life-1/share', { caseId: 'HAG-014' });
  assert.equal(r.status, 400);
  r = await post('/api/drafts/life-1/review', {});
  assert.equal(r.status, 400);
  // Archive: REJECTED -> ARCHIVED; re-archive is idempotent.
  r = await post('/api/drafts/life-1/archive', {});
  assert.equal(r.status, 200);
  assert.equal((await r.json()).status, 'ARCHIVED');
  r = await post('/api/drafts/life-1/archive', {});
  assert.equal(r.status, 200);
  // A revision cannot be requested for an archived draft.
  r = await post('/api/drafts/life-1/request-revision', { note: 'Too late.' });
  assert.equal(r.status, 400);
});

test('drafts endpoints: every mutation without a token returns 401', async () => {
  await seedDraft({ id: 'auth-1' });
  for (const [path, body] of [
    ['/api/drafts/auth-1/review', {}],
    ['/api/drafts/auth-1/share', { caseId: 'HAG-014' }],
    ['/api/drafts/auth-1/reject', {}],
    ['/api/drafts/auth-1/archive', {}],
    ['/api/drafts/auth-1/request-revision', { note: 'x' }],
  ]) {
    const r = await post(path, body, null);
    assert.equal(r.status, 401, `${path} without a token must 401`);
  }
  // And the draft is untouched.
  assert.equal(getDraft('auth-1', draftsFile).status, 'GENERATED');
});
