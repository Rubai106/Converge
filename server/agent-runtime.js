// CONVERGE — agent runtime (the facilitator, as a real long-lived process).
//
// What this is: ONE persistent connection to Switch (WebSocket, with the
// SSE compatibility path as fallback), holding the agent's event stream
// for the three rooms, with a cursor, dedup, reconnect, and gap handling.
// Human messages that address the facilitator are routed to the model
// (server/llm.js) with the structured tool registry (server/tools.js) for
// DRAFT responses only.
//
// What this is NOT — structural invariants, not policies:
//  - It NEVER calls /api/session, NEVER holds a human session token, and
//    NEVER calls a mutating app endpoint. The agent can never approve:
//    there is no approval tool in the registry and this file contains no
//    transition/approve/adopt/publish call of any kind.
//  - It NEVER posts messages to a room on its own. Drafts are surfaced
//    through onDraft (default: logged) for a human to use. An agent that
//    posts unprompted is not this agent.
//  - Specialist roles (Facilitator, Financial Analyst, Researcher,
//    Challenger/Auditor, Workflow Specialist) are INTERNAL lenses inside
//    the facilitator's system prompt — not separate Switch agents. This
//    file registers no agents and creates no identities.
//  - It reads the case store READ-ONLY (direct file read, never the
//    store's load()/save()) and never writes production data.
//
// Connection ownership (integration point with server/switch-client.js):
//  - The runtime owns the ONE long-lived event connection: scope=all,
//    NO rooms claimed at open. It receives events in every room the agent
//    belongs to without holding a room claim, so it cannot fight
//    withRoomConnection: that helper opens a TRANSIENT connection and its
//    connect_to_room takes the act-claim only for the duration of one op,
//    which does not stop this connection's event delivery (claims govern
//    acting, not delivery). Timeline re-reads (gap catch-up, startup)
//    reuse withRoomConnection + read_context + switchTimelineToMessages —
//    the verified path the app server already uses.
//  - If withRoomConnection is ever replaced, it should be replaced by
//    calls on THIS runtime's connection, not by a second long-lived one.
//    Two long-lived connections for one agent fight over room claims and
//    event delivery; one connection is the whole point.
//
// Standalone: node server/agent-runtime.js
//   SWITCH_BASE_URL (default http://localhost:8000)
//   SWITCH_AGENT_ID, SWITCH_API_KEY — or CONVERGE_AGENT_CREDENTIALS_FILE
//     (default ~/workspace/switch-server/.converge-agent.json)
//   CONVERGE_ROOMS — comma-separated room ids (default: the three rooms)
//   CONVERGE_DATA_FILE — case store path (default repo data/converge.json)
//   CONVERGE_LLM_* — see server/llm.js
// Logs clearly on start whether a live model is configured or not.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { connectWithFallback, EventDeduper, Cursor, computeBackoffMs } from './switch-ws.js';
import { createProvider, LlmNotConfiguredError } from './llm.js';
import { createToolRegistry } from './tools.js';
import { withRoomConnection, callOp, switchTimelineToMessages } from './switch-client.js';

export const DEFAULT_ROOMS = [
  '177e6354-e07f-44eb-b385-8055faf021e6', // #haggle-dairyco   -> HAG-014
  '478f26a8-a843-480e-9707-78c142000341', // #recipe-ragu     -> CRT-007
  '04da8311-821b-4912-846b-93685e60b59d', // #episode-osei    -> COR-003
];

// Fallback room -> case map, used when a case has no switchRoomId recorded
// (seed data) or the store cannot be read. The live map is built from the
// store first; this is only the fallback.
export const KNOWN_ROOM_CASES = {
  '177e6354-e07f-44eb-b385-8055faf021e6': 'HAG-014',
  '478f26a8-a843-480e-9707-78c142000341': 'CRT-007',
  '04da8311-821b-4912-846b-93685e60b59d': 'COR-003',
};

export const ROLES = ['facilitator', 'financial-analyst', 'researcher', 'challenger', 'workflow-specialist'];

const ROLE_LENSES = {
  facilitator: 'Facilitator: keep the discussion moving. Name the decision that is waiting, who must make it, and the single next step. Short, plain sentences.',
  'financial-analyst': 'Financial Analyst: check every number against the engine output in the context. State the assumption and the unit with each figure. If a figure is not in the context, say it is unknown — never estimate, never round a price into a different one.',
  researcher: 'Researcher: check each claim against the evidence cited in the context. Quote the evidence id ([E1]) with every factual statement. Say plainly when evidence is missing or unverified.',
  challenger: 'Challenger / Auditor: find the strongest objection to the current direction and the evidence that would settle it. Name what could go wrong if the group proceeds as proposed.',
  'workflow-specialist': 'Workflow Specialist: name the case state, what blocks progress, and the exact step that unblocks it. Never suggest skipping the human approval gate.',
};

const DRAFT_SCHEMA = {
  type: 'object',
  required: ['draft', 'role', 'confidence', 'caveats', 'needsHumanReview'],
  properties: {
    draft: { type: 'string', minLength: 1 },
    role: { type: 'string', enum: ROLES },
    confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
    caveats: { type: 'array', items: { type: 'string' } },
    needsHumanReview: { type: 'boolean' },
  },
  additionalProperties: false,
};

function defaultLogger(level, msg, detail) {
  const line = `[agent-runtime ${level}] ${msg}`;
  if (detail !== undefined) console.log(line, JSON.stringify(detail));
  else console.log(line);
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// Read the case store without ever writing to it (no migration, no save).
export function loadCasesReadOnly(dataFile) {
  const file = dataFile || process.env.CONVERGE_DATA_FILE || join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'converge.json');
  try {
    const data = JSON.parse(readFileSync(file, 'utf8'));
    return Array.isArray(data.cases) ? data.cases : [];
  } catch {
    return [];
  }
}

export function createAgentRuntime(opts = {}) {
  const baseUrl = opts.baseUrl || process.env.SWITCH_BASE_URL || 'http://localhost:8000';
  const agentId = opts.agentId || process.env.SWITCH_AGENT_ID || '4b6d039c-c2db-45df-8e10-a10769ad2cfa';
  const apiKey = opts.apiKey || process.env.SWITCH_API_KEY || '';
  const roomIds = opts.roomIds || (process.env.CONVERGE_ROOMS ? process.env.CONVERGE_ROOMS.split(',').map((s) => s.trim()).filter(Boolean) : DEFAULT_ROOMS);
  const log = opts.logger || defaultLogger;
  const provider = opts.provider || createProvider();
  const connect = opts.connect || connectWithFallback;
  const getCases = opts.getCases || (() => loadCasesReadOnly(opts.dataFile));
  const onDraft = opts.onDraft || ((draft) => log('info', 'draft ready (not posted — a human decides)', { caseId: draft.caseId, role: draft.role, mock: draft.mock }));
  const onEventLog = opts.onEventLog || (() => {});

  const cursor = new Cursor(0);
  const deduper = new EventDeduper();
  const connectionId = opts.connectionId || crypto.randomUUID();
  const state = {
    running: false,
    transport: null,
    generation: null,
    rooms: [],
    draftsProduced: 0,
    draftsSkippedNoModel: 0,
    eventsSeen: 0,
    duplicatesDropped: 0,
    gapsSeen: 0,
    reconnects: 0,
    stopReason: null,
    lastEviction: null,
    lastRefusal: null,
  };

  // Case resolution: live store first (switchRoomId), known map as fallback.
  function resolveCaseId(roomId) {
    for (const c of getCases()) {
      if (c.switchRoomId === roomId) return c.id;
    }
    return KNOWN_ROOM_CASES[roomId] || null;
  }
  function getCase(caseId) {
    return getCases().find((c) => c.id === caseId) || null;
  }

  // Timeline re-read through the verified withRoomConnection path.
  // Read-only; used at startup and after a gap, never on the hot path.
  // Injectable (opts.readTimeline) so tests never touch the network.
  async function defaultReadTimeline(caseId) {
    const c = getCase(caseId);
    if (!c) return [];
    const roomId = c.switchRoomId || Object.keys(KNOWN_ROOM_CASES).find((r) => KNOWN_ROOM_CASES[r] === caseId);
    if (!roomId) return c.messages || [];
    try {
      const result = await withRoomConnection(baseUrl, apiKey, agentId, roomId, async (connId) =>
        callOp(baseUrl, apiKey, agentId, 'read_context', { room_id: roomId, limit: 50 }, connId));
      return switchTimelineToMessages(result);
    } catch (err) {
      log('warn', 'timeline re-read failed; using stored messages', { caseId, error: err.message });
      return c.messages || [];
    }
  }
  const readTimeline = opts.readTimeline || defaultReadTimeline;

  const registry = opts.registry || createToolRegistry({ getCase, readTimeline });

  function roleLensFor(c, messageText) {
    const text = String(messageText || '').toLowerCase();
    if (c.workflow === 'HAGGLE') {
      if (/price|cost|margin|afford|budget|number|figure|math/i.test(text)) return 'financial-analyst';
      return 'facilitator';
    }
    if (c.workflow === 'COURT') {
      if (/wrong|disagree|bias|unfair|flaw|risk/i.test(text)) return 'challenger';
      return 'researcher';
    }
    if (c.workflow === 'CORRECTION') {
      if (/wrong|disagree|dispute|false|incorrect/i.test(text)) return 'challenger';
      return 'researcher';
    }
    return 'facilitator';
  }

  async function routeHumanMessage({ roomId, messageId, senderName, text }) {
    const caseId = resolveCaseId(roomId);
    if (!caseId) {
      log('warn', 'human message in a room with no case — no action', { roomId, sender: senderName });
      return null;
    }
    const c = getCase(caseId);
    if (!c) {
      log('warn', 'room resolves to an unknown case — no action', { roomId, caseId });
      return null;
    }
    if (!provider.configured) {
      state.draftsSkippedNoModel += 1;
      log('info', 'LIVE MODEL NOT CONFIGURED — no draft produced (set CONVERGE_LLM_API_KEY to enable)', { caseId, roomId, sender: senderName });
      return null;
    }
    const role = roleLensFor(c, text);
    // Gather context through the tools, never by hand: the numbers the
    // model sees are the engine's numbers.
    const caseCtx = await registry.callTool('read_case', { caseId });
    const timelineCtx = await registry.callTool('read_room_timeline', { caseId });
    let engineCtx = null;
    if (c.workflow === 'HAGGLE') engineCtx = await registry.callTool('compute_haggle', { caseId });
    const system = [
      'You are the CONVERGE facilitator, the single agent in this room. You draft responses for a human to use; you never decide anything yourself.',
      'HARD RULES:',
      '- Use ONLY the numbers in the tool context. Never invent a price, a percentage, a date, or a fact that is not in the context.',
      '- You NEVER approve, adopt, publish, or change a claim status. If asked to, say a human must decide and stop there.',
      '- Every draft is labelled draft-only and needs human review. State your uncertainty plainly.',
      `- Your role lens for this message: ${ROLE_LENSES[role]}`,
      '- Reply as JSON matching the schema: {draft, role, confidence, caveats, needsHumanReview:true}.',
    ].join('\n');
    const user = JSON.stringify({
      room: roomId,
      case: caseCtx,
      engine: engineCtx,
      recentTimeline: (timelineCtx.messages || []).slice(-10),
      humanMessage: { from: senderName, text, messageId },
    });
    let result;
    try {
      result = await provider.complete({
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        schema: DRAFT_SCHEMA,
      });
    } catch (err) {
      if (err instanceof LlmNotConfiguredError) {
        state.draftsSkippedNoModel += 1;
        log('info', 'LIVE MODEL NOT CONFIGURED — no draft produced', { caseId });
        return null;
      }
      log('error', 'draft failed — no draft produced', { caseId, error: err.message });
      return null;
    }
    const draft = {
      caseId, roomId, messageId, from: senderName,
      draft: result.data.draft,
      role: result.data.role,
      confidence: result.data.confidence,
      caveats: result.data.caveats || [],
      needsHumanReview: true,
      model: provider.model,
      mock: Boolean(result.mock),
      at: new Date().toISOString(),
    };
    state.draftsProduced += 1;
    if (draft.mock) log('warn', 'MOCK draft produced — test mock, NOT a live model response', { caseId, role: draft.role });
    onDraft(draft);
    return draft;
  }

  // Catch-up: re-read every subscribed room's timeline and log what is
  // there. Used at startup and after a gap, so a missed event is never
  // silently dropped — the room's own log is the source of truth.
  async function catchUp(reason) {
    for (const roomId of roomIds) {
      const caseId = resolveCaseId(roomId);
      if (!caseId) continue;
      const messages = await readTimeline(caseId);
      log('info', `catch-up (${reason}): room timeline re-read`, { roomId, caseId, messages: messages.length });
    }
  }

  function decideReconnect(close) {
    if (state.stopReason) return 'stop';
    if (state.lastRefusal) return 'stop';
    const ev = state.lastEviction;
    if (ev) {
      if (ev.code === 'taken_over') return 'stop';
      if (ev.code === 'closed' && /deleted|managed_by_controller|controller/i.test(ev.reason || '')) return 'stop';
    }
    if (close && [4400, 4401, 4403, 4409].includes(close.code)) return 'stop';
    return 'reconnect';
  }

  async function handleEvent(ev) {
    onEventLog(ev);
    if (!ev || typeof ev !== 'object') return;
    switch (ev.kind) {
      case 'connection_state': {
        state.generation = ev.generation ?? state.generation;
        state.rooms = ev.rooms || state.rooms;
        state.transport = state.transport; // set by the connect call
        log('info', 'connection_state', {
          generation: state.generation,
          rooms: state.rooms,
          cursor: ev.cursor,
          protocol: ev.protocol,
          heartbeatSeconds: ev.heartbeat_interval_seconds,
        });
        return;
      }
      case 'domain': {
        state.eventsSeen += 1;
        if (ev.seq !== null && ev.seq !== undefined) {
          if (deduper.check(ev.seq)) {
            state.duplicatesDropped += 1;
            log('info', 'duplicate event dropped', { seq: ev.seq, type: ev.type });
            return;
          }
          cursor.advance(ev.seq);
        }
        if (ev.type !== 'message') {
          log('info', 'non-message domain event observed', { type: ev.type, roomId: ev.roomId });
          return;
        }
        const p = ev.payload || {};
        const senderKind = p.sender_kind || null;
        if (senderKind === 'agent') return; // another agent (or our own echo) — never reply to it
        if (p.sender_name && /converge-facilitator/i.test(p.sender_name)) return;
        if (!p.addressed) {
          log('info', 'message observed but not addressed to the facilitator — no action', { roomId: ev.roomId, sender: p.sender_name });
          return;
        }
        await routeHumanMessage({
          roomId: ev.roomId,
          messageId: p.message_id || null,
          senderName: p.sender_name || p.sender || 'unknown',
          text: p.body || '',
        });
        return;
      }
      case 'gap': {
        state.gapsSeen += 1;
        log('warn', 'GAP in the event stream — resuming from the server cursor and re-reading history', {
          fromSequence: ev.fromSequence,
          resumedAt: ev.resumedAt,
          rooms: ev.rooms,
          allRooms: ev.allRooms,
          reason: ev.reason,
        });
        if (typeof ev.resumedAt === 'number') cursor.set(ev.resumedAt);
        await catchUp('gap');
        return;
      }
      case 'evicted': {
        state.lastEviction = { code: ev.code, reason: ev.reason };
        log('warn', 'evicted from the connection', { code: ev.code, reason: ev.reason });
        return;
      }
      case 'refused': {
        state.lastRefusal = { status: ev.status, detail: ev.detail };
        state.stopReason = `refused (${ev.status}): ${ev.detail}`;
        log('error', 'connection refused — stopping', { status: ev.status, detail: ev.detail });
        return;
      }
      case 'transport_fallback': {
        state.transport = 'sse';
        log('warn', 'websocket unavailable — falling back to the SSE compatibility path', { error: ev.error });
        return;
      }
      case 'malformed': {
        log('warn', 'malformed frame ignored', { error: ev.error });
        return;
      }
      default: {
        // ping / control / subscription_changed / room_released: logged
        // at debug level by the caller if it cares; nothing to do.
        return;
      }
    }
  }

  async function start() {
    if (state.running) return state;
    state.running = true;
    state.stopReason = null;
    log('info', 'CONVERGE agent runtime starting', {
      agentId,
      rooms: roomIds,
      baseUrl,
      model: provider.configured ? `${provider.provider}/${provider.model}` : 'LIVE MODEL NOT CONFIGURED',
      mock: Boolean(provider.isMock),
    });
    if (!provider.configured) {
      log('info', 'LIVE MODEL NOT CONFIGURED — the runtime will observe rooms and log, but produce no drafts. Set CONVERGE_LLM_PROVIDER and CONVERGE_LLM_API_KEY to enable drafting.');
    }
    if (provider.isMock) {
      log('warn', 'MOCK provider active — drafts are test output, NEVER live AI. Do not present them as model responses.');
    }
    if (!apiKey) {
      state.running = false;
      throw new Error('no Switch API key: set SWITCH_API_KEY or CONVERGE_AGENT_CREDENTIALS_FILE');
    }
    await catchUp('startup');
    let attempt = 0;
    while (state.running) {
      const startFrom = cursor.value === 0 ? 'head' : cursor.value;
      let handle;
      try {
        handle = await connect({
          baseUrl, agentId, apiKey, connectionId,
          scope: 'all', filter: 'all', startFrom,
          rooms: [],
          expectedGeneration: state.generation,
          getCursor: () => cursor.value,
          onEvent: (ev) => { void handleEvent(ev); },
          onTransport: (t) => { state.transport = t; },
        });
      } catch (err) {
        if (!state.running) break;
        if (err && (err.code === 4401 || err.code === 4409)) {
          state.stopReason = `connection refused (${err.code}): ${err.message}`;
          log('error', 'connection refused — stopping', { code: err.code, error: err.message });
          break;
        }
        attempt += 1;
        const wait = computeBackoffMs(attempt);
        log('warn', 'connect failed — retrying with backoff', { attempt, waitMs: wait, error: err.message });
        await sleep(wait);
        continue;
      }
      state.reconnects = attempt;
      attempt = 0;
      state.handle = handle;
      const close = await handle.closed;
      state.handle = null;
      if (!state.running) break;
      const action = decideReconnect(close);
      if (action === 'stop') {
        state.stopReason = state.stopReason || `connection closed (code ${close.code}) — not retrying`;
        log('error', 'stopping the runtime', { reason: state.stopReason, closeCode: close.code });
        break;
      }
      attempt += 1;
      state.reconnects = attempt;
      const wait = computeBackoffMs(attempt);
      log('warn', 'connection closed — reconnecting with backoff', { attempt, waitMs: wait, closeCode: close.code, cursor: cursor.value });
      await sleep(wait);
    }
    state.running = false;
    log('info', 'CONVERGE agent runtime stopped', {
      eventsSeen: state.eventsSeen,
      duplicatesDropped: state.duplicatesDropped,
      gapsSeen: state.gapsSeen,
      draftsProduced: state.draftsProduced,
      draftsSkippedNoModel: state.draftsSkippedNoModel,
      stopReason: state.stopReason,
    });
    return state;
  }

  function stop() {
    state.running = false;
    if (state.handle) { try { state.handle.close(); } catch { /* already closed */ } }
  }

  return {
    state,
    cursor,
    deduper,
    registry,
    start,
    stop,
    handleEvent,
    routeHumanMessage,
    resolveCaseId,
    catchUp,
    decideReconnect,
  };
}

// ---------------------------------------------------------------------------
// Standalone entry point: node server/agent-runtime.js
// ---------------------------------------------------------------------------

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const credsFile = process.env.CONVERGE_AGENT_CREDENTIALS_FILE
    || join(process.env.HOME || '', 'workspace', 'switch-server', '.converge-agent.json');
  let apiKey = process.env.SWITCH_API_KEY || '';
  let agentId = process.env.SWITCH_AGENT_ID || '';
  if (!apiKey || !agentId) {
    try {
      const creds = JSON.parse(readFileSync(credsFile, 'utf8'));
      apiKey = apiKey || creds.api_key || '';
      agentId = agentId || creds.id || '';
    } catch {
      // No credentials file: the runtime reports the missing key and exits.
    }
  }
  const runtime = createAgentRuntime({ apiKey, agentId });
  const shutdown = () => {
    defaultLogger('info', 'shutdown requested');
    runtime.stop();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  runtime.start().catch((err) => {
    defaultLogger('error', `runtime failed to start: ${err.message}`);
    process.exit(1);
  });
}
