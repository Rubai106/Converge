// Tests for server/switch-ws.js — frame parsing, normalisation, dedup,
// cursor, backoff. No network: every test here is pure.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseWsFrame, parseSseBlock, normalizeFrame,
  EventDeduper, Cursor, computeBackoffMs,
} from '../server/switch-ws.js';

test('parseWsFrame: parses the observed connection_state envelope', () => {
  const raw = JSON.stringify({
    event: 'connection_state',
    data: { connection_id: 'c1', agent_id: 'a1', generation: 7, cursor: 0, protocol: 9, heartbeat_interval_seconds: 2 },
  });
  const f = parseWsFrame(raw);
  assert.equal(f.event, 'connection_state');
  assert.equal(f.data.generation, 7);
  assert.equal(f.id, null);
});

test('parseWsFrame: domain events carry a numeric id', () => {
  const f = parseWsFrame(JSON.stringify({ event: 'agent.event', data: { agent_id: 'a', seq: 42, event: { type: 'message' } }, id: 42 }));
  assert.equal(f.id, 42);
});

test('parseWsFrame: rejects malformed JSON and frames without an event', () => {
  assert.throws(() => parseWsFrame('not json'), /not JSON/);
  assert.throws(() => parseWsFrame('{"data":{}}'), /missing event name/);
  assert.throws(() => parseWsFrame('{"event":1}'), /missing event name/);
});

test('parseSseBlock: parses id/event/data lines and skips keepalive comments', () => {
  assert.equal(parseSseBlock(': keepalive'), null);
  const f = parseSseBlock('id: 12\nevent: agent.event\ndata: {"agent_id":"a","seq":12}');
  assert.equal(f.event, 'agent.event');
  assert.equal(f.id, 12);
  assert.equal(f.data.seq, 12);
});

test('parseSseBlock: rejects non-JSON data', () => {
  assert.throws(() => parseSseBlock('event: agent.event\ndata: nope'), /not JSON/);
});

test('normalizeFrame: connection_state passes through', () => {
  const n = normalizeFrame({ event: 'connection_state', data: { generation: 8589934691, cursor: 0, protocol: 9, rooms: [] }, id: null });
  assert.equal(n.kind, 'connection_state');
  assert.equal(n.generation, 8589934691);
  assert.equal(n.protocol, 9);
});

test('normalizeFrame: ping is a ping', () => {
  assert.equal(normalizeFrame({ event: 'ping', data: {}, id: null }).kind, 'ping');
});

test('normalizeFrame: agent.event unwraps the observed protocol-9 envelope', () => {
  const n = normalizeFrame({
    event: 'agent.event',
    data: {
      agent_id: 'a1', seq: 17,
      event: {
        type: 'message', room_id: 'r1', bridge_id: null, channel_type: null,
        payload: { addressed: true, sender: '@u:x', sender_name: 'Mara', message_id: 'm1', body: 'hello', timestamp: 1 },
        sequence: 17,
      },
    },
    id: 17,
  });
  assert.equal(n.kind, 'domain');
  assert.equal(n.seq, 17);
  assert.equal(n.type, 'message');
  assert.equal(n.roomId, 'r1');
  assert.equal(n.payload.body, 'hello');
  assert.equal(n.payload.addressed, true);
});

test('normalizeFrame: docs-shaped domain frames are also accepted', () => {
  const n = normalizeFrame({ event: 'message', data: { room_id: 'r1', payload: { body: 'hi' } }, id: 5 });
  assert.equal(n.kind, 'domain');
  assert.equal(n.type, 'message');
  assert.equal(n.seq, 5);
});

test('normalizeFrame: agent.gap carries the resume point', () => {
  const n = normalizeFrame({
    event: 'agent.gap',
    data: { agent_id: 'a', from_sequence: 10, resumed_at: 25, rooms: ['r1'], all_rooms: false, reason: 'cursor expired' },
    id: null,
  });
  assert.equal(n.kind, 'gap');
  assert.equal(n.fromSequence, 10);
  assert.equal(n.resumedAt, 25);
  assert.deepEqual(n.rooms, ['r1']);
});

test('normalizeFrame: evicted and refused', () => {
  const e = normalizeFrame({ event: 'evicted', data: { code: 'taken_over', reason: 'another open took the connection', room_id: null }, id: null });
  assert.equal(e.kind, 'evicted');
  assert.equal(e.code, 'taken_over');
  const r = normalizeFrame({ event: 'refused', data: { status: 400, detail: 'connection_id is required' }, id: null });
  assert.equal(r.kind, 'refused');
  assert.equal(r.status, 400);
});

test('normalizeFrame: unknown control frames pass through as control', () => {
  const n = normalizeFrame({ event: 'subscription_changed', data: { rooms: ['r1'] }, id: null });
  assert.equal(n.kind, 'control');
  assert.equal(n.event, 'subscription_changed');
});

test('EventDeduper: first sight is new, second sight is a duplicate', () => {
  const d = new EventDeduper(10);
  assert.equal(d.check(1), false);
  assert.equal(d.check(2), false);
  assert.equal(d.check(1), true);
  assert.equal(d.check(2), true);
  assert.equal(d.check(null), false); // unsequenced frames are never deduped
  assert.equal(d.size(), 2);
});

test('EventDeduper: bounded — oldest entries fall out', () => {
  const d = new EventDeduper(3);
  d.check(1); d.check(2); d.check(3); d.check(4);
  assert.equal(d.size(), 3);
  assert.equal(d.check(1), false); // evicted, so seen as new again
});

test('Cursor: only moves forward', () => {
  const c = new Cursor(0);
  assert.equal(c.advance(5), 5);
  assert.equal(c.advance(3), 5);
  assert.equal(c.advance(5), 5);
  assert.equal(c.set(12), 12);
  assert.equal(c.value, 12);
});

test('computeBackoffMs: grows exponentially and is capped', () => {
  const b0 = computeBackoffMs(0, { jitter: 0 });
  const b1 = computeBackoffMs(1, { jitter: 0 });
  const b5 = computeBackoffMs(5, { jitter: 0 });
  const b20 = computeBackoffMs(20, { jitter: 0 });
  assert.equal(b0, 1000);
  assert.equal(b1, 2000);
  assert.equal(b5, 30000); // capped at 30s
  assert.equal(b20, 30000);
  const jittered = computeBackoffMs(2, { jitter: 0.2 });
  assert.ok(jittered >= 3200 && jittered <= 4800);
});
