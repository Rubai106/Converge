// CONVERGE Switch client — speaks the VERIFIED live protocol (switch-core 0.31.0).
// Verified live 2026-11-05/06 against a real switch-core 0.31.0 server
// (see docs/switch-live-integration.md):
//  - Transport: the live connection is the WebSocket at
//    /agents/{id}/connection/ws. This client uses the SSE compatibility path
//    (kept for pre-revision-7 runtimes): GET /agents/{id}/events?connection_id
//    =<uuid> with Accept: text/event-stream. The connection_id is
//    client-generated (a UUID); ops then carry it as X-Switch-Connection-Id.
//    An SSE client MUST tick POST /agents/{id}/connection/beat every 2s
//    (TTL 6s) or the server evicts it with `heartbeat_lapsed` — verified
//    live 2026-11-06. Room messages are NOT pushed on the stream (it carries
//    connection/subscription events); the agent reads human messages from the
//    room timeline via the read_context op.
//  - Auth: Authorization: Bearer <agent api_key> on the stream and every op.
//    Registration key is separate and is rejected everywhere else.
//  - Probe: GET /health (public, no auth) -> {"status":"ok"}.
//  - Register: POST /agents (Bearer registration key) -> {id, api_key} once.
//  - Ops are PER-AGENT, not global: GET /agents/{id}/ops lists them,
//    POST /agents/{id}/ops/{operation} runs one. The body IS the arguments
//    object (no {"operation":...} wrapper). This corrects the earlier
//    doc-based assumption of global /ops + /ops/{name}.
//  - A room op that needs a room binding (post_message) requires
//    connect_to_room first, on the same connection id.
//  - If no live server is reachable, the app runs against the local stub
//    (SIMULATED) — see stub-switch.js. A stub transcript is NEVER presented
//    as a Switch room.
export const SWITCH_VERSION = { console: '0.40.1', core: '0.31.0' };

// Operation names read from the live server's GET /agents/{id}/ops
// (2026-11-05, 53 ops). Kept as a catalogue for the UI; the client never
// hard-codes a payload shape — shapes come from the live registry.
export const OPERATION_CATALOG = [
  'add_users_to_room', 'archive_room', 'assume_role', 'attach_reference_to_room',
  'connect_to_room', 'create_reference', 'create_room', 'create_room_document',
  'create_room_from_yaml', 'create_room_group', 'define_role', 'delete_role',
  'delete_room_document', 'delete_template', 'edit_role', 'get_agent_detail',
  'get_my_context', 'get_role_detail', 'get_room_detail', 'get_room_group_detail',
  'get_template', 'get_template_guide', 'invite_agent_to_room', 'link_rooms',
  'list_agents', 'list_all_references', 'list_all_rooms', 'list_bridges',
  'list_linked_rooms', 'list_participants', 'list_reference_types',
  'list_references', 'list_roles', 'list_room_groups', 'list_rooms',
  'list_templates', 'load_internal_documents', 'post_message', 'read_context',
  'release_role', 'remove_agent_from_room', 'remove_agent_service',
  'request_agent_deletion', 'run_template', 'save_template',
  'send_targeted_message', 'set_agent_service', 'unarchive_room',
  'unlink_rooms', 'update_agent_detail', 'update_room', 'update_room_document',
  'update_template',
];

function base(u) { return u.replace(/\/$/, ''); }

export async function probeHealth(baseUrl) {
  const res = await fetch(`${base(baseUrl)}/health`);
  return { ok: res.ok, status: res.status, body: await res.text().catch(() => '') };
}

export async function registerAgent(baseUrl, registrationKey, profile) {
  const res = await fetch(`${base(baseUrl)}/agents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${registrationKey}` },
    body: JSON.stringify(profile),
  });
  if (!res.ok) throw new Error(`POST /agents failed: ${res.status}`);
  return res.json(); // {id, api_key} — returned once; caller must store it securely
}

export async function getOps(baseUrl, apiKey, agentId) {
  const res = await fetch(`${base(baseUrl)}/agents/${agentId}/ops`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) throw new Error(`GET /agents/${agentId}/ops failed: ${res.status}`);
  return res.json(); // {operations: {name: {description, input_schema}}}
}

export async function callOp(baseUrl, apiKey, agentId, opName, args = {}, connectionId = null) {
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` };
  if (connectionId) headers['X-Switch-Connection-Id'] = connectionId;
  const res = await fetch(`${base(baseUrl)}/agents/${agentId}/ops/${opName}`, {
    method: 'POST', headers, body: JSON.stringify(args),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`POST /agents/${agentId}/ops/${opName} failed: ${res.status} ${text.slice(0, 200)}`);
  }
  return res.json();
}

// Open the live SSE event stream for one connection id. Returns a handle
// with close(); events arrive via onEvent as raw SSE lines. The stream is
// long-lived; callers close it when their room work is done.
export async function openEventStream(baseUrl, agentId, apiKey, connectionId, onEvent, { beatIntervalMs = 2000 } = {}) {
  const controller = new AbortController();
  const res = await fetch(
    `${base(baseUrl)}/agents/${agentId}/events?connection_id=${connectionId}`,
    { headers: { Authorization: `Bearer ${apiKey}`, Accept: 'text/event-stream' }, signal: controller.signal },
  );
  if (!res.ok || !res.body) throw new Error(`GET /agents/${agentId}/events failed: ${res.status}`);
  // The SSE stream is the pre-WebSocket compatibility path: the client must
  // tick POST /agents/{id}/connection/beat every 2s (TTL 6s) or the server
  // evicts the connection with `heartbeat_lapsed` (verified live 2026-11-06:
  // an unbeaten stream was evicted; a beaten one stayed alive). The beat
  // stops when the stream is closed.
  const beatTimer = setInterval(() => {
    fetch(`${base(baseUrl)}/agents/${agentId}/connection/beat`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ connection_id: connectionId }),
      signal: controller.signal,
    }).catch(() => { /* a failed beat is retried on the next tick; close() aborts in-flight beats */ });
  }, beatIntervalMs);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  (async () => {
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop();
        for (const line of lines) if (line.trim()) onEvent(line.trim());
      }
    } catch { /* aborted */ }
  })();
  return { connectionId, close: () => { clearInterval(beatTimer); controller.abort(); } };
}

// Run one room-bound op (e.g. post_message) the way a live agent does it:
// open a stream, connect to the room, run the op, close the stream.
export async function withRoomConnection(baseUrl, apiKey, agentId, roomId, fn) {
  const connectionId = crypto.randomUUID();
  const stream = await openEventStream(baseUrl, agentId, apiKey, connectionId, () => {});
  try {
    await callOp(baseUrl, apiKey, agentId, 'connect_to_room', { room_id: roomId }, connectionId);
    return await fn(connectionId);
  } finally {
    stream.close();
  }
}

// Map a read_context result ({result:{threads:[{root, replies}]}}) to a
// flat message timeline, oldest first. Only kind === 'message' events are
// messages — room_join / system events are dropped. Pure, so the server
// tests can exercise it directly (M21, 2026-11-06).
export function switchTimelineToMessages(readResult) {
  const threads = readResult?.result?.threads || readResult?.threads || [];
  const out = [];
  for (const t of threads) {
    for (const ev of [t?.root, ...(t?.replies || [])]) {
      if (!ev || ev.kind !== 'message') continue;
      out.push({
        id: ev.id,
        author: ev.sender_name || ev.sender || 'unknown',
        at: ev.timestamp ? new Date(ev.timestamp).toISOString() : null,
        text: ev.body || '',
        real: true,
        eventId: ev.id,
      });
    }
  }
  // Undated messages (no timestamp) sort last, never first — an empty
  // sort key would put them before every dated message.
  out.sort((a, b) => {
    if (!a.at) return 1;
    if (!b.at) return -1;
    return a.at.localeCompare(b.at);
  });
  return out;
}

export function agentProfile(name, description) {
  return {
    name, description, connector_type: 'converge',
    integration_profile: {
      connection_model: 'session_passive', message_exchange: true,
      pre_invocation_mediation: [], post_invocation_mediation: [], event_reporting: [],
    },
  };
}
