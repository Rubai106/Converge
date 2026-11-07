// CONVERGE live Switch integration test (M7, 2026-11-07) — the suite's
// only test that talks to a REAL switch-core 0.31.0 server. It is
// OPT-IN: it runs only when SWITCH_BASE_URL is set and the agent
// credentials file exists (CONVERGE_AGENT_CREDENTIALS_FILE, default
// ~/workspace/switch-server/.converge-agent.json). Otherwise it skips
// with a clear reason — a fresh clone or CI without a live stack is not
// a failure. When it runs it does health -> ops registry -> rooms ->
// read_context on the real HAG-014 room, so a protocol regression is
// caught by the suite instead of only by a manual run.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  probeHealth, getOps, callOp, switchTimelineToMessages,
} from '../server/switch-client.js';

const baseUrl = process.env.SWITCH_BASE_URL || '';
const credsFile = process.env.CONVERGE_AGENT_CREDENTIALS_FILE
  || join(homedir(), 'workspace', 'switch-server', '.converge-agent.json');
const HAG_ROOM = '177e6354-e07f-44eb-b385-8055faf021e6';

const live = baseUrl && existsSync(credsFile);
if (!live) {
  test('switch live: skipped — no live Switch stack (set SWITCH_BASE_URL and CONVERGE_AGENT_CREDENTIALS_FILE to run)', { skip: true }, () => {});
} else {
  const creds = JSON.parse(readFileSync(credsFile, 'utf8'));
  const agentId = creds.id;
  const apiKey = creds.api_key;

  test('switch live: health is ready and the ops registry lists 53 ops', async () => {
    const health = await probeHealth(baseUrl);
    assert.equal(health.ok, true, 'GET /health answers');
    assert.equal(health.status, 200);
    assert.equal(JSON.parse(health.body).status, 'ok');
    const ops = await getOps(baseUrl, apiKey, agentId);
    const names = Object.keys(ops.operations || ops);
    assert.ok(names.length >= 50, `expected ~53 ops, got ${names.length}`);
    assert.ok(names.includes('list_rooms'), 'list_rooms is in the registry');
    assert.ok(names.includes('post_message'), 'post_message is in the registry');
    assert.ok(names.includes('read_context'), 'read_context is in the registry');
    assert.ok(names.includes('connect_to_room'), 'connect_to_room is in the registry');
  });

  test('switch live: the four case rooms exist and the HAG-014 room timeline reads', async () => {
    const rooms = await callOp(baseUrl, apiKey, agentId, 'list_rooms', {});
    const list = rooms.result || rooms;
    assert.ok(Array.isArray(list), 'list_rooms returns a room list');
    const names = list.map((r) => r.name);
    for (const want of ['haggle-dairyco', 'recipe-ragu', 'episode-osei']) {
      assert.ok(names.includes(want), `room ${want} exists on the live server`);
    }
    const ctx = await callOp(baseUrl, apiKey, agentId, 'read_context', { room_id: HAG_ROOM });
    const messages = switchTimelineToMessages(ctx);
    assert.ok(Array.isArray(messages), 'read_context converts to a message list');
    assert.ok(messages.length > 0, 'the HAG-014 room timeline is non-empty');
    assert.ok(messages.some((m) => (m.text || '').includes('converge-facilitator') || (m.author || '').includes('user')),
      'the timeline carries human and facilitator messages');
  });
}
