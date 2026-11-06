// Tests for server/agent-runtime.js — routing, dedup, cursor, gap,
// eviction/refusal policy, and the no-model state. The connection is
// mocked (no live server); cases come from the in-memory seed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createAgentRuntime, KNOWN_ROOM_CASES } from '../server/agent-runtime.js';
import { createMockProvider, createProvider } from '../server/llm.js';
import { seedData } from '../server/store.js';

const HAG_ROOM = '177e6354-e07f-44eb-b385-8055faf021e6';
const COURT_ROOM = '478f26a8-a843-480e-9707-78c142000341';

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

function makeRuntime(overrides = {}) {
  const drafts = [];
  const logs = [];
  const timelineReads = [];
  const runtime = createAgentRuntime({
    apiKey: 'test-key-not-real',
    provider: mockProvider(),
    getCases: () => seedData().cases,
    readTimeline: async (caseId) => { timelineReads.push(caseId); return []; },
    onDraft: (d) => drafts.push(d),
    logger: (level, msg, detail) => logs.push({ level, msg, detail }),
    ...overrides,
  });
  return { runtime, drafts, logs, timelineReads };
}

function humanMessage(roomId, seq, body, extra = {}) {
  return {
    kind: 'domain', seq, type: 'message', roomId,
    payload: {
      addressed: true, sender: '@mara:x', sender_name: 'Mara',
      sender_kind: 'user', message_id: `m${seq}`, body,
      timestamp: 1700000000000, thread_id: null, attachments: [],
      ...extra,
    },
  };
}

test('connection_state records generation and rooms', async () => {
  const { runtime } = makeRuntime();
  await runtime.handleEvent({ kind: 'connection_state', generation: 8589934691, rooms: [HAG_ROOM], cursor: 0, protocol: 9, heartbeat_interval_seconds: 2 });
  assert.equal(runtime.state.generation, 8589934691);
  assert.deepEqual(runtime.state.rooms, [HAG_ROOM]);
});

test('an addressed human message produces a labelled mock draft (never posted)', async () => {
  const { runtime, drafts } = makeRuntime();
  await runtime.handleEvent(humanMessage(HAG_ROOM, 1, 'What should we do about the cream price?'));
  assert.equal(drafts.length, 1);
  const d = drafts[0];
  assert.equal(d.caseId, 'HAG-014');
  assert.equal(d.roomId, HAG_ROOM);
  assert.equal(d.mock, true); // labelled mock, never a live model claim
  assert.equal(d.needsHumanReview, true);
  assert.equal(d.role, 'financial-analyst'); // HAGGLE + price wording -> analyst lens
  assert.equal(runtime.state.draftsProduced, 1);
});

test('a duplicate sequence is dropped, not drafted twice', async () => {
  const { runtime, drafts } = makeRuntime();
  const msg = humanMessage(HAG_ROOM, 7, 'What should we do?');
  await runtime.handleEvent(msg);
  await runtime.handleEvent(msg); // replayed on resume
  assert.equal(drafts.length, 1);
  assert.equal(runtime.state.duplicatesDropped, 1);
  assert.equal(runtime.cursor.value, 7);
});

test('messages not addressed to the facilitator are observed, not answered', async () => {
  const { runtime, drafts } = makeRuntime();
  await runtime.handleEvent(humanMessage(HAG_ROOM, 1, 'Just chatting', { addressed: false }));
  assert.equal(drafts.length, 0);
  assert.equal(runtime.state.eventsSeen, 1);
});

test('messages from agents (including our own echo) are never answered', async () => {
  const { runtime, drafts } = makeRuntime();
  await runtime.handleEvent(humanMessage(HAG_ROOM, 1, 'Agent talking', { sender_kind: 'agent', sender_name: 'converge-facilitator' }));
  assert.equal(drafts.length, 0);
});

test('a message in a room with no case produces no draft', async () => {
  const { runtime, drafts } = makeRuntime();
  await runtime.handleEvent(humanMessage('00000000-0000-0000-0000-000000000000', 1, 'Hello?'));
  assert.equal(drafts.length, 0);
});

test('no live model configured: no draft is fabricated, the skip is counted', async () => {
  const { runtime, drafts } = makeRuntime({ provider: createProvider({}) });
  assert.equal(runtime.state.draftsSkippedNoModel, 0);
  await runtime.handleEvent(humanMessage(HAG_ROOM, 1, 'What should we do?'));
  assert.equal(drafts.length, 0);
  assert.equal(runtime.state.draftsSkippedNoModel, 1);
});

test('COURT messages use the researcher lens', async () => {
  const { runtime, drafts } = makeRuntime({
    provider: createMockProvider({
      respond: () => ({ draft: 'Court draft', role: 'researcher', confidence: 'medium', caveats: [], needsHumanReview: true }),
    }),
  });
  await runtime.handleEvent(humanMessage(COURT_ROOM, 1, 'Which version won the blind test?'));
  assert.equal(drafts.length, 1);
  assert.equal(drafts[0].caseId, 'CRT-007');
  assert.equal(drafts[0].role, 'researcher');
});

test('a gap moves the cursor to resumed_at and re-reads history (never silently dropped)', async () => {
  const { runtime, timelineReads } = makeRuntime();
  runtime.cursor.set(3);
  await runtime.handleEvent({ kind: 'gap', fromSequence: 3, resumedAt: 9, rooms: [HAG_ROOM], allRooms: false, reason: 'cursor expired' });
  assert.equal(runtime.cursor.value, 9);
  assert.equal(runtime.state.gapsSeen, 1);
  assert.ok(timelineReads.includes('HAG-014'));
  assert.ok(timelineReads.includes('CRT-007'));
  assert.ok(timelineReads.includes('COR-003'));
});

test('evicted taken_over stops; heartbeat_lapsed reconnects', async () => {
  const { runtime } = makeRuntime();
  await runtime.handleEvent({ kind: 'evicted', code: 'taken_over', reason: 'another open took the connection' });
  assert.equal(runtime.decideReconnect({ code: 1000 }), 'stop');

  const r2 = makeRuntime().runtime;
  await r2.handleEvent({ kind: 'evicted', code: 'heartbeat_lapsed', reason: 'heartbeat lapsed; reopen the stream and resume from your cursor' });
  assert.equal(r2.decideReconnect({ code: 1000 }), 'reconnect');

  const r3 = makeRuntime().runtime;
  await r3.handleEvent({ kind: 'evicted', code: 'closed', reason: 'the agent is now run by an agent controller' });
  assert.equal(r3.decideReconnect({ code: 1000 }), 'stop');
});

test('refused stops the runtime', async () => {
  const { runtime } = makeRuntime();
  await runtime.handleEvent({ kind: 'refused', status: 400, detail: 'connection_id is required' });
  assert.match(runtime.state.stopReason, /refused/);
  assert.equal(runtime.decideReconnect({ code: 4400 }), 'stop');
});

test('close codes 4401/4409 stop; 1011/1012 reconnect', () => {
  const { runtime } = makeRuntime();
  assert.equal(runtime.decideReconnect({ code: 4401 }), 'stop');
  assert.equal(runtime.decideReconnect({ code: 4409 }), 'stop');
  assert.equal(runtime.decideReconnect({ code: 1011 }), 'reconnect');
  assert.equal(runtime.decideReconnect({ code: 1012 }), 'reconnect');
  assert.equal(runtime.decideReconnect({ code: 1006 }), 'reconnect');
});

test('resolveCaseId maps rooms to cases, known map as fallback', () => {
  const { runtime } = makeRuntime();
  assert.equal(runtime.resolveCaseId(HAG_ROOM), 'HAG-014');
  assert.equal(runtime.resolveCaseId(COURT_ROOM), 'CRT-007');
  assert.equal(runtime.resolveCaseId('nope'), null);
  assert.equal(KNOWN_ROOM_CASES[HAG_ROOM], 'HAG-014');
});

test('lifecycle: start connects, routes, and stop ends the run', async () => {
  const drafts = [];
  let connectOpts = null;
  let closedResolve;
  const closed = new Promise((r) => { closedResolve = r; });
  const fakeConnect = async (opts) => {
    connectOpts = opts;
    return {
      transport: 'ws',
      connectionId: opts.connectionId,
      closed,
      close: () => closedResolve({ code: 1000, reason: 'test close' }),
      sendJson: () => {},
    };
  };
  const runtime = createAgentRuntime({
    apiKey: 'test-key-not-real',
    provider: mockProvider(),
    connect: fakeConnect,
    getCases: () => seedData().cases,
    readTimeline: async () => [],
    onDraft: (d) => drafts.push(d),
    logger: () => {},
  });
  const run = runtime.start();
  // Wait for the connect to happen.
  for (let i = 0; i < 50 && !connectOpts; i++) await new Promise((r) => setTimeout(r, 10));
  assert.ok(connectOpts, 'runtime connected');
  assert.equal(connectOpts.scope, 'all');
  assert.equal(connectOpts.connectionId.length, 36); // a UUID, reused on reconnect
  assert.equal(typeof connectOpts.getCursor, 'function');
  connectOpts.onEvent({ kind: 'connection_state', generation: 3, rooms: [HAG_ROOM], cursor: 0, protocol: 9 });
  connectOpts.onEvent(humanMessage(HAG_ROOM, 1, 'What should we do about the price?'));
  for (let i = 0; i < 50 && drafts.length === 0; i++) await new Promise((r) => setTimeout(r, 10));
  assert.equal(drafts.length, 1);
  runtime.stop();
  const state = await run;
  assert.equal(state.running, false);
  assert.equal(state.eventsSeen, 1);
});
