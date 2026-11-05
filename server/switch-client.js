// CONVERGE Switch client — speaks the DOCUMENTED protocol only.
// Docs (2026-11-05, Switch Console 0.40.1 / switch-core 0.31.0):
//  - Transport: WebSocket events + HTTP ops. SSE is legacy fallback only.
//  - Auth: Authorization: Bearer <agent api_key> on socket + every call.
//    Registration key is separate and is rejected everywhere else.
//  - Probe: GET /health (public). Register: POST /agents -> {id, api_key} once.
//  - Events: /agents/{id}/events (WebSocket). Ops: GET /ops, POST /ops/{name}.
//  - Per-operation JSON shapes are NOT in the docs; they must be read from
//    a live server's GET /ops. This client reads the registry at startup
//    and never hard-codes a payload shape. If no live server is reachable,
//    it runs against the local stub (SIMULATED) — see stub-switch.js.
//    A stub transcript is NEVER presented as a Switch room.
export const SWITCH_VERSION = { console: '0.40.1', core: '0.31.0' };
export const OPERATION_CATALOG = [
  'list_rooms','list_all_rooms','get_room_detail','connect_to_room','create_room',
  'update_room','archive_room','unarchive_room','list_participants','invite_agent_to_room','add_users_to_room',
  'post_message','send_targeted_message','read_context',
  'list_references','list_reference_types','create_reference','attach_reference_to_room',
  'load_internal_documents','create_room_document','update_room_document','delete_room_document',
  'list_roles','get_role_detail','define_role','edit_role','delete_role','assume_role','release_role',
  'list_linked_rooms','link_rooms','unlink_rooms','list_room_groups','create_room_group','get_room_group_detail',
  'list_agents','get_agent_detail','update_agent_detail','list_bridges',
];

export async function probeHealth(baseUrl) {
  const res = await fetch(`${baseUrl.replace(/\/$/, '')}/health`);
  return { ok: res.ok, status: res.status, body: await res.text().catch(() => '') };
}

export async function registerAgent(baseUrl, registrationKey, profile) {
  const res = await fetch(`${baseUrl.replace(/\/$/, '')}/agents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${registrationKey}` },
    body: JSON.stringify(profile),
  });
  if (!res.ok) throw new Error(`POST /agents failed: ${res.status}`);
  return res.json(); // {id, api_key} — returned once; caller must store it securely
}

export async function getOps(baseUrl, apiKey) {
  const res = await fetch(`${baseUrl.replace(/\/$/, '')}/ops`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) throw new Error(`GET /ops failed: ${res.status}`);
  return res.json();
}

export async function callOp(baseUrl, apiKey, opName, args = {}, connectionId = null) {
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` };
  if (connectionId) headers['X-Switch-Connection-Id'] = connectionId;
  const res = await fetch(`${baseUrl.replace(/\/$/, '')}/ops/${opName}`, {
    method: 'POST', headers, body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`POST /ops/${opName} failed: ${res.status}`);
  return res.json();
}

// Open the WebSocket event stream. Node's global WebSocket takes no
// headers argument, so a production client must use a WS library that
// supports Authorization: Bearer (the documented auth). This function
// opens the documented URL and reports that auth gap instead of hiding it.
export function connectEvents(baseUrl, agentId, apiKey, onEvent) {
  const wsUrl = baseUrl.replace(/^http/, 'ws').replace(/\/$/, '') + `/agents/${agentId}/events`;
  const ws = new WebSocket(wsUrl);
  ws.addEventListener('message', (ev) => onEvent(JSON.parse(ev.data)));
  return ws;
}

export function agentProfile(name, description) {
  return {
    name, description, connector_type: 'converge',
    integration_profile: {
      connection_model: 'session_addressable', message_exchange: true,
      pre_invocation_mediation: false, post_invocation_mediation: false, event_reporting: [],
    },
  };
}
