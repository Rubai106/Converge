// CONVERGE — Switch agent-connection transport (WebSocket + SSE fallback).
//
// WIRE FORMAT VERIFIED LIVE against switch-core 0.31.0 (2026-11-07):
//  - WS URL: ws://<base>/agents/{agent_id}/connection/ws
//    ?connection_id=<uuid>&scope=all|single&filter=all|addressed
//    &start_from=head|<seq>&rooms=<id,...>&expected_generation=<n>
//    &protocol=<n>&protocol_accepts=<n>&client=<name>&client_version=<v>
//    Auth: Authorization: Bearer <agent api_key> on the upgrade request.
//    Probe evidence: connection_state arrived first (protocol 9, heartbeat
//    2s, server 0.31.0); pings every 2s; a correct pong kept the socket
//    alive 10s+ with no eviction; missing connection_id -> refused frame +
//    close 4400; bad key -> close 4401 with no frame.
//  - Frames are JSON {"event", "data", "id"?}. `id` is the event sequence
//    number (a JSON number), present on domain events.
//  - Server frame names (protocol 9, as OBSERVED — the docs name some
//    frames differently; the observed names win):
//      connection_state  first frame; data: connection_id, agent_id,
//                        generation, scope, filter, rooms, cursor,
//                        position, protocol, heartbeat_interval_seconds,
//                        server {version, contracts}, client {…}
//      ping              {"event":"ping","data":{}} every 2s; answer with
//                        {"type":"pong","cursor":n}  (note: pong uses
//                        `type`, not `event` — verified in the server
//                        source, bridges/agent/api/handlers.py)
//      agent.event       domain event; data: {agent_id, seq,
//                        event: {type, room_id, bridge_id, channel_type,
//                        payload, sequence}}; payload is one of
//                        message {addressed, sender, sender_name,
//                        sender_kind, message_id, body, timestamp,
//                        thread_id, attachments},
//                        command {command, args, user_id, user_name,
//                        thread_id},
//                        room_join {member, member_name, timestamp,
//                        listening}
//      agent.gap         data: {agent_id, from_sequence, resumed_at,
//                        rooms, all_rooms, reason}
//      evicted           data: {code, reason, room_id}
//      refused           data: {status, detail}; socket then closes with
//                        code 4000+status
//      subscription_changed / room_released  control frames (docs-named;
//                        passed through as control events)
//  - SSE fallback (pre-revision-7 clients, kept for a compatibility
//    window): GET /agents/{id}/events?connection_id=<uuid> with
//    Accept: text/event-stream; frames arrive as `id: <seq>` /
//    `event: <name>` / `data: <json>`; resume with Last-Event-ID; the
//    client beats POST /agents/{id}/connection/beat every 2s (TTL 6s).
//    The same frame names and payloads apply.
//
// This module is transport only: it opens sockets/streams, parses frames,
// answers pings, and reports lifecycle events. Policy (reconnect, stop
// conditions, routing) lives in server/agent-runtime.js.
// No runtime dependencies — global fetch + global WebSocket (Node 24).

export const WS_PROTOCOL = { speaks: 9, accepts: 1 };
export const HEARTBEAT_INTERVAL_MS = 2000;
export const HEARTBEAT_TTL_MS = 6000;

// ---------------------------------------------------------------------------
// Frame parsing (pure — unit-tested without a network)
// ---------------------------------------------------------------------------

// Parse one raw WebSocket text message into {event, data, id}.
// Throws on malformed JSON or a missing event name; the caller logs and
// ignores such frames rather than dying on them.
export function parseWsFrame(raw) {
  let msg;
  try {
    msg = JSON.parse(raw);
  } catch {
    throw new Error('malformed WS frame: not JSON');
  }
  if (!msg || typeof msg !== 'object' || typeof msg.event !== 'string') {
    throw new Error('malformed WS frame: missing event name');
  }
  return {
    event: msg.event,
    data: msg.data !== undefined ? msg.data : {},
    id: typeof msg.id === 'number' ? msg.id : null,
  };
}

// Parse one SSE event block (the lines between blank lines) into a frame.
// Returns null for a bare comment/keepalive line.
export function parseSseBlock(block) {
  let id = null;
  let event = null;
  let data = '';
  for (const line of String(block).split('\n')) {
    if (line.startsWith(':')) continue; // comment / keepalive
    if (line.startsWith('id:')) id = line.slice(3).trim();
    else if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) data += line.slice(5).trimStart();
  }
  if (!event && !data) return null;
  let parsed = {};
  if (data) {
    try {
      parsed = JSON.parse(data);
    } catch {
      throw new Error('malformed SSE frame: data is not JSON');
    }
  }
  return { event: event || 'message', data: parsed, id: id !== null && id !== '' ? Number(id) : null };
}

// Normalise a parsed frame into one of:
//   {kind:'connection_state', ...data}
//   {kind:'domain', seq, type, roomId, payload, raw}
//   {kind:'gap', fromSequence, resumedAt, rooms, allRooms, reason}
//   {kind:'evicted', code, reason, roomId}
//   {kind:'refused', status, detail}
//   {kind:'control', event, data}   (ping handled by the transport;
//                                    subscription_changed, room_released,
//                                    anything else unrecognised)
//   {kind:'ping'}                   (ping is answered by the transport;
//                                    also surfaced so a caller can log it)
// The server's domain-event frame is `agent.event` (protocol 9); the docs
// describe domain frames named `message`/`command`/`room_join` directly —
// both shapes are accepted, observed shape first.
export function normalizeFrame(frame) {
  const { event, data, id } = frame;
  if (event === 'connection_state') return { kind: 'connection_state', ...data };
  if (event === 'ping') return { kind: 'ping' };
  if (event === 'evicted') {
    return { kind: 'evicted', code: data.code || 'closed', reason: data.reason || '', roomId: data.room_id || null };
  }
  if (event === 'refused') {
    return { kind: 'refused', status: data.status ?? 0, detail: data.detail || '' };
  }
  if (event === 'agent.gap') {
    return {
      kind: 'gap',
      fromSequence: data.from_sequence ?? null,
      resumedAt: data.resumed_at ?? null,
      rooms: data.rooms || [],
      allRooms: Boolean(data.all_rooms),
      reason: data.reason || '',
    };
  }
  if (event === 'agent.event') {
    const inner = data.event || {};
    const seq = typeof data.seq === 'number' ? data.seq : (typeof inner.sequence === 'number' ? inner.sequence : id);
    return {
      kind: 'domain',
      seq: seq ?? null,
      type: inner.type || 'unknown',
      roomId: inner.room_id || null,
      bridgeId: inner.bridge_id || null,
      payload: inner.payload || {},
      raw: data,
    };
  }
  if (event === 'message' || event === 'command' || event === 'room_join') {
    // Docs-shaped domain frame: the payload is the data itself.
    return {
      kind: 'domain',
      seq: id,
      type: event,
      roomId: data.room_id || null,
      bridgeId: data.bridge_id || null,
      payload: data.payload || data,
      raw: data,
    };
  }
  return { kind: 'control', event, data };
}

// ---------------------------------------------------------------------------
// Deduplication + cursor (pure — unit-tested without a network)
// ---------------------------------------------------------------------------

// Bounded set of already-processed sequence numbers. Domain events carry a
// per-agent sequence; the server can replay events on resume, so the
// runtime must not process the same sequence twice.
export class EventDeduper {
  constructor(maxSize = 5000) {
    this.maxSize = maxSize;
    this.seen = new Set();
    this.order = [];
  }
  // Returns true if this sequence was already processed (a duplicate).
  check(seq) {
    if (seq === null || seq === undefined) return false;
    if (this.seen.has(seq)) return true;
    this.seen.add(seq);
    this.order.push(seq);
    if (this.order.length > this.maxSize) {
      const old = this.order.shift();
      this.seen.delete(old);
    }
    return false;
  }
  size() { return this.seen.size; }
}

// The read cursor: the highest sequence processed. Only moves forward.
export class Cursor {
  constructor(start = 0) { this.value = start; }
  advance(seq) {
    if (typeof seq === 'number' && seq > this.value) this.value = seq;
    return this.value;
  }
  set(seq) {
    if (typeof seq === 'number') this.value = seq;
    return this.value;
  }
}

// Exponential backoff with jitter for reconnects. Attempt 0 -> ~1s,
// doubling to a cap. Jitter keeps reconnecting clients from stampeding.
export function computeBackoffMs(attempt, { baseMs = 1000, capMs = 30000, jitter = 0.2 } = {}) {
  const exp = Math.min(capMs, baseMs * 2 ** Math.max(0, attempt));
  const spread = exp * jitter * (Math.random() * 2 - 1);
  return Math.max(0, Math.round(exp + spread));
}

// ---------------------------------------------------------------------------
// WebSocket transport — one attempt
// ---------------------------------------------------------------------------

function wsUrl(baseUrl, agentId, { connectionId, scope = 'all', filter = 'all', startFrom = 'head', rooms = [], expectedGeneration = null, protocol = WS_PROTOCOL.speaks, protocolAccepts = WS_PROTOCOL.accepts, client = 'converge', clientVersion = '0.1.0' }) {
  const u = new URL(`${baseUrl.replace(/\/$/, '')}/agents/${agentId}/connection/ws`);
  u.searchParams.set('connection_id', connectionId);
  u.searchParams.set('scope', scope);
  u.searchParams.set('filter', filter);
  u.searchParams.set('start_from', String(startFrom));
  if (rooms.length) u.searchParams.set('rooms', rooms.join(','));
  if (expectedGeneration !== null && expectedGeneration !== undefined) u.searchParams.set('expected_generation', String(expectedGeneration));
  if (protocol !== null && protocol !== undefined) u.searchParams.set('protocol', String(protocol));
  if (protocolAccepts !== null && protocolAccepts !== undefined) u.searchParams.set('protocol_accepts', String(protocolAccepts));
  if (client) u.searchParams.set('client', client);
  if (clientVersion) u.searchParams.set('client_version', clientVersion);
  u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
  return u.toString();
}

// Open one WebSocket attempt. onEvent receives normalised frames
// (normalizeFrame output). The socket answers pings itself with the
// caller's current cursor (getCursor). Resolves with a handle when the
// socket opens; rejects if the upgrade fails. The handle's `closed`
// promise resolves with {code, reason} when the socket closes — the
// caller decides whether to reconnect. `close()` ends the attempt.
export function openAgentSocket({ baseUrl, agentId, apiKey, connectionId, scope, filter, startFrom, rooms, expectedGeneration, protocol, protocolAccepts, client, clientVersion, getCursor, onEvent }) {
  const url = wsUrl(baseUrl, agentId, { connectionId, scope, filter, startFrom, rooms, expectedGeneration, protocol, protocolAccepts, client, clientVersion });
  const ws = new WebSocket(url, { headers: { Authorization: `Bearer ${apiKey}` } });
  let closedResolve;
  const closed = new Promise((resolve) => { closedResolve = resolve; });
  let openedResolve;
  // Resolves true when the socket opens, false if it closes first (with
  // the close code available on `closed`). Lets connectWithFallback tell
  // a refusal apart from a transport failure.
  const opened = new Promise((resolve) => { openedResolve = resolve; });
  let didOpen = false;
  const handle = {
    transport: 'ws',
    connectionId,
    closed,
    opened,
    close: (code = 1000, reason = 'client close') => { try { ws.close(code, reason); } catch { /* already closed */ } },
    sendJson: (obj) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj)); },
  };
  ws.onopen = () => { didOpen = true; openedResolve(true); };
  ws.onmessage = (ev) => {
    let frame;
    try {
      frame = parseWsFrame(ev.data);
    } catch (err) {
      onEvent({ kind: 'malformed', error: err.message, raw: String(ev.data).slice(0, 200) });
      return;
    }
    const norm = normalizeFrame(frame);
    if (norm.kind === 'ping') {
      // Answer immediately, before processing events (docs: answer pings
      // before you process events, not behind them).
      try { ws.send(JSON.stringify({ type: 'pong', cursor: getCursor ? getCursor() : 0 })); } catch { /* socket closing */ }
    }
    onEvent(norm);
  };
  ws.onerror = () => { /* close follows with the code; nothing to do here */ };
  ws.onclose = (ev) => {
    openedResolve(false);
    closedResolve({ code: ev.code, reason: ev.reason || '', opened: didOpen });
  };
  return handle;
}

// ---------------------------------------------------------------------------
// SSE transport — one attempt (fallback for pre-WebSocket runtimes)
// ---------------------------------------------------------------------------

// Open one long-lived SSE attempt. Same normalised events as the WS
// transport. Beats POST /agents/{id}/connection/beat every 2s (TTL 6s).
// Resumes with Last-Event-ID when startFrom is a sequence number.
// Resolves with a handle when the stream opens; `closed` resolves with
// {code, reason} — code 0 means the stream ended without an HTTP error.
export async function openSseStream({ baseUrl, agentId, apiKey, connectionId, scope = 'all', filter = 'all', startFrom = 'head', rooms = [], getCursor, onEvent }) {
  const base = baseUrl.replace(/\/$/, '');
  const params = new URLSearchParams({ connection_id: connectionId, scope, filter, start_from: String(startFrom) });
  if (rooms.length) params.set('rooms', rooms.join(','));
  const headers = { Authorization: `Bearer ${apiKey}`, Accept: 'text/event-stream' };
  if (typeof startFrom === 'number') headers['Last-Event-ID'] = String(startFrom);
  const controller = new AbortController();
  const res = await fetch(`${base}/agents/${agentId}/events?${params}`, { headers, signal: controller.signal });
  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => '');
    const err = new Error(`GET /agents/${agentId}/events failed: ${res.status} ${body.slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }
  let closedResolve;
  const closed = new Promise((resolve) => { closedResolve = resolve; });
  const beatTimer = setInterval(() => {
    fetch(`${base}/agents/${agentId}/connection/beat`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ connection_id: connectionId }),
      signal: controller.signal,
    }).catch(() => { /* retried on the next tick; close() aborts in-flight beats */ });
  }, HEARTBEAT_INTERVAL_MS);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let ended = false;
  const finish = (code, reason) => {
    if (ended) return;
    ended = true;
    clearInterval(beatTimer);
    controller.abort();
    closedResolve({ code, reason });
  };
  (async () => {
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const blocks = buf.split('\n\n');
        buf = blocks.pop();
        for (const block of blocks) {
          if (!block.trim()) continue;
          let frame;
          try {
            frame = parseSseBlock(block);
          } catch (err) {
            onEvent({ kind: 'malformed', error: err.message, raw: block.slice(0, 200) });
            continue;
          }
          if (!frame) continue;
          onEvent(normalizeFrame(frame));
        }
      }
      finish(0, 'stream ended');
    } catch {
      finish(0, 'stream aborted');
    }
  })();
  return {
    transport: 'sse',
    connectionId,
    closed,
    close: () => finish(0, 'client close'),
    sendJson: () => { /* SSE is receive-only; beats go over HTTP */ },
  };
}

// ---------------------------------------------------------------------------
// Transport selection
// ---------------------------------------------------------------------------

// Open a connection, preferring WebSocket and falling back to SSE when the
// WebSocket upgrade itself fails (transport unavailable). A refusal is NOT
// a transport failure: a close with 4401 (bad key) or 4409 (taken over /
// protocol mismatch / too many connections) before open throws a refusal
// error and must stop the caller, not silently downgrade. `onTransport`
// is called with 'ws' or 'sse' once the transport is known.
export async function connectWithFallback(opts) {
  const { onTransport, ...rest } = opts;
  let handle;
  try {
    handle = openAgentSocket(rest);
  } catch (err) {
    // The constructor threw (bad URL, no network): transport failure.
    if (opts.onEvent) opts.onEvent({ kind: 'transport_fallback', from: 'ws', to: 'sse', error: err.message });
    const sse = await openSseStream(rest);
    if (onTransport) onTransport('sse');
    return sse;
  }
  const opened = await handle.opened;
  if (opened) {
    if (onTransport) onTransport('ws');
    return handle;
  }
  // Closed before opening: inspect the close code.
  const close = await handle.closed;
  if (close.code === 4401 || close.code === 4409) {
    const err = new Error(`websocket refused: close ${close.code} ${close.reason || ''}`);
    err.code = close.code;
    throw err;
  }
  if (opts.onEvent) opts.onEvent({ kind: 'transport_fallback', from: 'ws', to: 'sse', error: `websocket closed before open (code ${close.code})` });
  const sse = await openSseStream(rest);
  if (onTransport) onTransport('sse');
  return sse;
}
