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
    const room = state.rooms.find((r) => r.id === args.roomId || r.name === args.room);
    if (!room) { const e = new Error('Room not found'); e.status = 404; throw e; }
    const msg = { at: new Date().toISOString(), author: args.author || 'agent', text: args.text || '', simulated: true };
    room.messages.push(msg); return msg;
  }
  if (opName === 'read_context') {
    const room = state.rooms.find((r) => r.id === args.roomId || r.name === args.room);
    return room ? room.messages : [];
  }
  return { ok: true, op: opName, simulated: true };
}
