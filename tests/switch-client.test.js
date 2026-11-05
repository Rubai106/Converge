// Tests for the live Switch client (switch-client.js) — verified protocol
// shapes from the real switch-core 0.31.0 server (2026-11-05/06).
// fetch is stubbed here; no live server is needed for these tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getOps, callOp, registerAgent, probeHealth, agentProfile,
  openEventStream, OPERATION_CATALOG, SWITCH_VERSION,
} from '../server/switch-client.js';

const calls = [];
function mockFetch(responses) {
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url, init });
    const next = responses.shift() || {};
    return {
      ok: next.ok ?? true, status: next.status ?? 200,
      text: async () => next.text ?? '',
      json: async () => next.json ?? {},
      body: next.body ?? null,
    };
  };
}

test('getOps hits the per-agent ops registry with the agent key', async () => {
  calls.length = 0;
  mockFetch([{ json: { operations: { list_rooms: {} } } }]);
  const out = await getOps('http://localhost:8000/', 'key-123', 'agent-1');
  assert.equal(calls[0].url, 'http://localhost:8000/agents/agent-1/ops');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer key-123');
  assert.deepEqual(Object.keys(out.operations), ['list_rooms']);
});

test('callOp posts the arguments object itself to the per-agent op route', async () => {
  calls.length = 0;
  mockFetch([{ json: { result: { event_id: 'sw_x' } } }]);
  const out = await callOp('http://localhost:8000', 'key-123', 'agent-1', 'post_message', { body: 'hi' }, 'conn-9');
  assert.equal(calls[0].url, 'http://localhost:8000/agents/agent-1/ops/post_message');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers['X-Switch-Connection-Id'], 'conn-9');
  assert.equal(calls[0].init.body, JSON.stringify({ body: 'hi' }));
  assert.equal(out.result.event_id, 'sw_x');
});

test('callOp throws with the server detail on a failed op', async () => {
  mockFetch([{ ok: false, status: 400, text: '{"detail":"Not connected to a room."}' }]);
  await assert.rejects(
    () => callOp('http://localhost:8000', 'k', 'a', 'post_message', { body: 'x' }),
    /400/,
  );
});

test('registerAgent posts to /agents with the registration key', async () => {
  calls.length = 0;
  mockFetch([{ json: { id: 'agent-1', api_key: 'k' } }]);
  const out = await registerAgent('http://localhost:8000', 'reg-token', agentProfile('converge-facilitator', 'd'));
  assert.equal(calls[0].url, 'http://localhost:8000/agents');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer reg-token');
  assert.equal(out.id, 'agent-1');
});

test('agentProfile matches the live registration schema', () => {
  const p = agentProfile('converge-facilitator', 'CONVERGE facilitator');
  assert.equal(p.connector_type, 'converge');
  assert.equal(p.integration_profile.connection_model, 'session_passive');
  assert.equal(p.integration_profile.message_exchange, true);
  assert.deepEqual(p.integration_profile.pre_invocation_mediation, []);
  assert.deepEqual(p.integration_profile.post_invocation_mediation, []);
  assert.deepEqual(p.integration_profile.event_reporting, []);
});

test('probeHealth calls public GET /health', async () => {
  calls.length = 0;
  mockFetch([{ text: '{"status":"ok"}' }]);
  const out = await probeHealth('http://localhost:8000/');
  assert.equal(calls[0].url, 'http://localhost:8000/health');
  assert.equal(out.ok, true);
  assert.equal(out.status, 200);
});

test('openEventStream beats POST /agents/{id}/connection/beat on an interval', async () => {
  const seen = [];
  globalThis.fetch = async (url, init = {}) => {
    seen.push({ url: String(url), init });
    if (String(url).includes('/events')) {
      return {
        ok: true, status: 200,
        body: new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('event: connection_state\ndata: {"ok":true}\n\n')); } }),
      };
    }
    return { ok: true, status: 200, json: async () => ({ ok: true }), text: async () => '{}', body: null };
  };
  const stream = await openEventStream('http://localhost:8000', 'agent-1', 'key-123', 'conn-7', () => {}, { beatIntervalMs: 50 });
  await new Promise((r) => setTimeout(r, 220));
  const beats = seen.filter((c) => c.url.includes('/connection/beat'));
  assert.ok(beats.length >= 2, `expected >= 2 beats, saw ${beats.length}`);
  assert.equal(beats[0].init.method, 'POST');
  assert.equal(JSON.parse(beats[0].init.body).connection_id, 'conn-7');
  assert.equal(beats[0].init.headers.Authorization, 'Bearer key-123');
  stream.close();
  const countAtClose = seen.filter((c) => c.url.includes('/connection/beat')).length;
  await new Promise((r) => setTimeout(r, 150));
  assert.equal(seen.filter((c) => c.url.includes('/connection/beat')).length, countAtClose, 'beats must stop after close()');
});

test('operation catalogue matches the live registry (53 ops)', () => {
  assert.equal(OPERATION_CATALOG.length, 53);
  for (const name of ['create_room', 'connect_to_room', 'post_message', 'list_bridges', 'list_rooms']) {
    assert.ok(OPERATION_CATALOG.includes(name), `catalogue missing ${name}`);
  }
  assert.deepEqual(SWITCH_VERSION, { console: '0.40.1', core: '0.31.0' });
});
