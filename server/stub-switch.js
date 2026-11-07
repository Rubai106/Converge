// SIMULATED Switch stub — NOT Switch, NOT a Mattermost room.
// Purpose: prove the CONVERGE agent client speaks the documented protocol
// shape (GET /health, POST /agents, GET /ops, POST /ops/{name}) against a
// local server, with every room event logged to a transcript.
// Any screenshot/demo from this stub MUST be captioned:
//   "SIMULATED — stub server, not Switch"
// Never present it as a Switch room. Point the client at a real Switch
// server (Console 0.40.1 / core 0.31.0, GET /health first) by changing
// only SWITCH_BASE_URL + keys — see README.
import { OPERATION_CATALOG } from './switch-client.js';

export function createStubState() {
  return {
    mode: 'SIMULATED',
    agents: [], rooms: [
      { id: 'room-haggle-dairyco', name: '#haggle-dairyco', members: ['Mara (owner)', 'DairyCo rep', 'Negotiation Agent', 'Financial Analyst'], messages: [] },
      { id: 'room-recipe-ragu', name: '#recipe-ragu', members: ['Family group', 'Facilitator Agent'], messages: [] },
      { id: 'room-episode-osei', name: '#episode-osei', members: ['Host', 'Dr Amara Osei (guest)', 'Verification Agent'], messages: [] },
    ],
  };
}

export function stubHealth() { return { status: 'ok', mode: 'SIMULATED', note: 'Stub server, not Switch.' }; }

export function stubRegisterAgent(state, profile) {
  const agent = { id: `agent-${state.agents.length + 1}`, api_key: `stub-key-${Date.now()}`, ...profile };
  state.agents.push(agent);
  // Real Switch returns {id, api_key} once. The stub mirrors that shape.
  return { id: agent.id, api_key: agent.api_key };
}

export function stubGetOps() {
  return OPERATION_CATALOG.map((name) => ({ name, input_schema: 'UNVERIFIED — read from a live server GET /ops' }));
}

export function stubCallOp(state, opName, args = {}) {
  if (!OPERATION_CATALOG.includes(opName)) { const e = new Error(`Unknown operation ${opName}`); e.status = 404; throw e; }
  if (opName === 'list_rooms') return state.rooms.map((r) => ({ id: r.id, name: r.name, members: r.members }));
  if (opName === 'create_room') {
    const room = { id: `room-${Date.now()}`, name: args.name || 'unnamed', members: args.members || [], messages: [] };
    state.rooms.push(room); return room;
  }
  if (opName === 'post_message') {
    // BUG-4 (QA 2026-11-06): posting to a case's own room used to 500
    // ("Room not found") when the room was not one of the three seeded
    // ones. The real path creates a room on demand (ensureRealRoom);
    // the stub mirrors that instead of failing.
    let room = state.rooms.find((r) => r.id === args.roomId || r.name === args.room);
    if (!room) {
      room = { id: `room-${Date.now()}`, name: args.room || args.roomId || 'unnamed', members: [], messages: [] };
      state.rooms.push(room);
    }
    const msg = { id: `stub-msg-${room.messages.length + 1}-${Date.now()}`, at: new Date().toISOString(), author: args.author || 'agent', text: args.text || '', simulated: true };
    room.messages.push(msg); return msg;
  }
  if (opName === 'read_context') {
    // L25: return the REAL shape {result:{threads:[{root, replies}]}}
    // so switchTimelineToMessages can be exercised against the stub.
    // A flat message array is not the real contract.
    const room = state.rooms.find((r) => r.id === args.roomId || r.name === args.room);
    if (!room) return { result: { threads: [] } };
    return {
      result: {
        threads: room.messages.map((m) => ({
          root: {
            id: m.id || 'stub-msg-unknown',
            kind: 'message',
            sender_name: m.author || 'unknown',
            sender: m.author || 'unknown',
            timestamp: m.at || null,
            body: m.text || '',
          },
          replies: [],
        })),
      },
    };
  }
  return { ok: true, op: opName, simulated: true };
}
