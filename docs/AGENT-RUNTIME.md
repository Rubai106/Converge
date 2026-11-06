# CONVERGE — Agent Runtime

The facilitator as a real long-lived process: one persistent connection to
Switch, a cursor, dedup, reconnect, and a model behind a structured tool
registry. Drafts only — the agent never approves, never adopts, never
publishes, never changes a claim status, and never posts on its own.

## What exists

| File | Role |
|---|---|
| `server/switch-ws.js` | Transport: WebSocket client + SSE fallback, frame parsing, dedup, cursor, backoff |
| `server/llm.js` | Provider-independent LLM abstraction + structured-output validation + mock provider |
| `server/tools.js` | Structured tool registry (read/draft only — no approval tool exists) |
| `server/agent-runtime.js` | The long-lived runtime: one connection, routing, role lenses, standalone entry point |

## WebSocket verification (live, switch-core 0.31.0, 2026-11-07)

**Supported — verified against the actual running server, not assumed.**

Evidence (probe scripts in `/tmp`, not committed; read-only, no rooms
claimed, no messages posted):

- Docs: `docs.switchagents.ai/switch-rooms/internals/agent-connection`
  (updated 2026-11-04) — "The connection is how events reach an agent
  client: one WebSocket, kept alive with pings and resumed after a drop."
  WS URL `/agents/{agent_id}/connection/ws`, `connection_id` (UUID, reused
  on reconnect), `scope`, `filter`, `start_from`, `rooms`,
  `expected_generation`, `protocol`/`protocol_accepts`.
- Live probe 1: WS opened with `Authorization: Bearer <agent key>`,
  `scope=all`, no rooms claimed. First frame `connection_state`
  (protocol 9, heartbeat 2s, server 0.31.0, generation 8589934691,
  cursor 0, per-room positions including the three CONVERGE rooms).
  Pings arrived every 2s.
- Live probe 2 (correct pong): 4 pings answered with 4 pongs over 10s,
  **no eviction**, clean close 1000. The pong is
  `{"type": "pong", "cursor": n}` — confirmed in the server source
  (`bridges/agent/api/handlers.py`, `_receive_pongs`).
- Negative probes: missing `connection_id` → `refused` frame + close
  4400; bad key → close 4401 with no frame.
- **Wire-format correction vs the docs:** the docs name domain frames
  `message` / `gap`; the 0.31.0 server actually sends `agent.event`
  (`data: {agent_id, seq, event: {type, room_id, bridge_id, channel_type,
  payload, sequence}}`) and `agent.gap`
  (`data: {agent_id, from_sequence, resumed_at, rooms, all_rooms,
  reason}`). `server/switch-ws.js` implements the observed shapes and
  also accepts the docs-shaped frames defensively. Frame envelope is
  `{"event", "data", "id"?}`; `id` is the sequence number (JSON number).
- Message payloads (confirmed in the server source,
  `bridges/agent/protocol/types.py`): `message` carries `addressed`,
  `sender`, `sender_name`, `sender_kind` ("user" | "agent" |
  "platform"), `message_id`, `body`, `timestamp` (ms), `thread_id`,
  `attachments`; `command` carries `command`, `args`, `user_id`,
  `user_name`, `thread_id`; `room_join` carries `member`, `member_name`,
  `timestamp`, `listening`.

## Connection lifecycle

1. **Open** with a client-generated `connection_id` (UUID), kept stable
   across reconnects. `scope=all`, `filter=all`, `start_from=head` on
   first connect (or the cursor on resume), `expected_generation` from
   the last `connection_state`. No rooms are claimed at open — the
   runtime receives events in every room the agent belongs to without
   holding a room claim, so it cannot fight `withRoomConnection`.
2. **First frame** is always `connection_state`: record `generation`,
   `rooms`, `cursor`, `protocol`, `heartbeat_interval_seconds`.
3. **Liveness:** the server pings every 2s; the runtime answers
   immediately with `{"type":"pong","cursor":<highest processed seq>}`,
   before processing events. A connection unanswered for 6s is evicted
   with `heartbeat_lapsed`.
4. **Domain events** (`agent.event`) carry a per-agent `sequence`. The
   runtime dedupes by sequence (bounded set, 5000 entries) and advances
   its cursor only forward. Replays on resume are dropped, not
   re-processed.
5. **Gap** (`agent.gap`): the server could not replay everything since
   the cursor. The runtime takes `resumed_at` as its new cursor and
   re-reads every subscribed room's timeline via `read_context` — a gap
   is never silently dropped.
6. **Evicted:** `taken_over` → stop, do not reconnect (another open
   owns the connection). `heartbeat_lapsed`, `no_stream`, `unfenced`,
   `connection_error` → reconnect with backoff and resume from the
   cursor. `closed` → read the reason; stop if permanent (agent
   deleted, now run by an agent controller), else reconnect.
7. **Refused** (4400/4401/4403/4409) → stop. Retrying a refused
   connection cannot help.
8. **Reconnect** uses the same `connection_id`, `start_from=<cursor>`,
   `expected_generation=<generation>`, exponential backoff (1s base,
   doubling, 30s cap, ±20% jitter).

## SSE fallback

If the WebSocket upgrade itself fails (transport unavailable), the
runtime falls back to the long-lived SSE stream
(`GET /agents/{id}/events?connection_id=…`, `Accept: text/event-stream`)
with `Last-Event-ID` resume and a `POST /connection/beat` every 2s
(TTL 6s). A refusal (4401/4409) never falls back — it stops. The same
frame parser and normaliser serve both transports. SSE is the
pre-revision-7 compatibility path; the server keeps it for a window
and then removes it, so the WebSocket is the primary path.

## What the runtime does with a message

1. Only `message` events from humans (`sender_kind === 'user'`) that
   are **addressed** to the facilitator (`payload.addressed === true`)
   are routed. Everything else is observed and logged, not answered.
   Messages from agents (including the facilitator's own echo) are
   ignored.
2. The room is resolved to a case (`switchRoomId`, falling back to the
   known room→case map). No case → no action.
3. Context is gathered **through the tools only**: `read_case`,
   `read_room_timeline`, and for HAGGLE `compute_haggle` (deterministic
   engine numbers — the model never sees a figure the engine did not
   compute).
4. A role lens is selected internally (see below) and the model drafts a
   JSON response validated against the draft schema
   (`draft`, `role`, `confidence`, `caveats`, `needsHumanReview: true`).
5. The draft is surfaced through `onDraft` (default: logged). **It is
   never posted to the room by the runtime.** A human decides what to do
   with it.

## No-model state (first-class, not an error)

If no provider key is configured, the runtime starts, connects, observes
rooms, and logs — but produces **no drafts** and fabricates nothing.
Startup logs say so plainly:

```
[live model not configured] — the runtime will observe rooms and log,
but produce no drafts. Set CONVERGE_LLM_PROVIDER and CONVERGE_LLM_API_KEY
to enable drafting.
```

The mock provider (`CONVERGE_LLM_PROVIDER=mock`) exists for tests and
local dev only. Every mock response carries `mock: true`, and the
runtime logs `MOCK provider active — drafts are test output, NEVER live
AI`. A mock draft must never be presented as a model response.

## Configuring a provider key

```bash
export CONVERGE_LLM_PROVIDER=openai            # or openai-compatible
export CONVERGE_LLM_API_KEY=<your key>          # never commit this
export CONVERGE_LLM_BASE_URL=https://api.openai.com/v1   # default
export CONVERGE_LLM_MODEL=gpt-4o-mini           # default
```

The key is sent only as an `Authorization: Bearer` header and is never
logged, never returned by any function, and never written to disk by
this code. `resolveLlmConfig()` exposes only `apiKeyPresent: boolean`.

## Tool registry

Six tools, two permissions, zero mutate permissions:

| Tool | Permission | What it does |
|---|---|---|
| `read_case` | read | Case summary (workflow, state, inputs, participants, evidence) |
| `read_room_timeline` | read | Switch room timeline, oldest first |
| `compute_haggle` | read | Deterministic HAGGLE analysis + strategies (engine only) |
| `draft_proposal` | draft | Draft a HAGGLE strategy proposal with engine-derived terms |
| `draft_court_summary` | draft | Draft a COURT tally/conflict summary |
| `draft_correction_assessment` | draft | Draft a CORRECTION claim/evidence assessment |

**No-approval invariant:** `validateRegistry()` throws if any tool name
matches approve/adopt/publish/transition/set-claim-status/execute/
send-message, or if any tool claims a permission other than `read` or
`draft`. The test suite asserts the registry contains no such tool.
Every call (success, failure, timeout) is appended to the audit log
with tool name, actor, duration, and error — arguments are validated
against each tool's JSON Schema before the handler runs.

## Specialist roles (internal lenses, not agents)

Facilitator, Financial Analyst, Researcher, Challenger/Auditor, and
Workflow Specialist are sections of the facilitator's system prompt,
selected per message: HAGGLE + money wording → Financial Analyst;
COURT/CORRECTION + dispute wording → Challenger; COURT/CORRECTION
otherwise → Researcher; anything else → Facilitator. The runtime
registers no agents, creates no identities, and never claims these
roles are separate Switch agents.

## Integration point with server/switch-client.js

The runtime owns the ONE long-lived event connection. The app server's
`withRoomConnection` opens a **transient** connection per call (open
stream → `connect_to_room` → op → close). Because the runtime claims
no rooms, a transient `connect_to_room` cannot evict anything the
runtime holds, and the runtime's event delivery continues regardless
of who holds the act-claim. Timeline re-reads (startup catch-up, gap
recovery) reuse `withRoomConnection` + `read_context` +
`switchTimelineToMessages` — the path the app server already verifies.
If `withRoomConnection` is ever replaced, it should be replaced by
calls on this runtime's connection, not by a second long-lived one.

## Running it

```bash
node server/agent-runtime.js
```

Env: `SWITCH_BASE_URL` (default `http://localhost:8000`),
`SWITCH_AGENT_ID` / `SWITCH_API_KEY` (or
`CONVERGE_AGENT_CREDENTIALS_FILE`, default
`~/workspace/switch-server/.converge-agent.json`),
`CONVERGE_ROOMS` (comma-separated, default the three rooms),
`CONVERGE_DATA_FILE` (default repo `data/converge.json`, read-only),
`CONVERGE_LLM_*` (see above). SIGINT/SIGTERM stop it cleanly.

The runtime NEVER calls `/api/session`, NEVER holds a human session
token, and NEVER calls a mutating app endpoint. It reads the case
store read-only (direct file read — no migration, no save) and only
ever calls Switch read ops plus `read_context` for timeline re-reads.

## Tests

`tests/switch-ws.test.js` (frame parsing, normalisation, dedup, cursor,
backoff), `tests/llm.test.js` (provider config, mock labelling,
structured-output validation, rejection of malformed output, stubbed
OpenAI transport), `tests/tools.test.js` (registry contents, the
no-approval invariant, argument validation, timeout, audit logging),
`tests/agent-runtime.test.js` (routing, dedup, gap, eviction/refusal
policy, no-model state, lifecycle with a mocked connection). All use
in-memory seed data and mocked connections — the suite never touches
the live server or production data.
