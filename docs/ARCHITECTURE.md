# CONVERGE — Architecture

**Status:** current as of the master-prompt window, 2026-11-07. Suite
**294/294**, `npm run check` clean. This document describes the system as
it now stands — after the Phase Zero audit (`docs/COMPREHENSIVE-AUDIT.md`)
and the P0/P1 implementation (commits `eb479aa`, `5bcb9c2`, `390bae4`,
`3e18a86`). It does not describe aspirations; where a component is not
yet running, it says so.

## 1. The system in one paragraph

CONVERGE is a single Node.js process (zero runtime npm dependencies) that
serves a static web app and a JSON API from one in-memory JSON store.
A deterministic engine (`server/engine.js`) computes every financial
figure and owns the case state machine; the app server
(`server/server.js`) enforces a session-token approval boundary around
it. A separate long-lived agent runtime (`server/agent-runtime.js`)
holds one persistent connection to Switch (WebSocket primary, SSE
fallback), routes addressed human messages through a read/draft-only
tool registry, and asks a provider-independent LLM abstraction
(`server/llm.js`) to draft responses — never to approve, post, or
execute anything. Switch (switch-core 0.31.0 + Mattermost 11.9.0) is
the collaboration surface: one Mattermost room per case, with the
bridge delivering human messages into Switch's room timeline, which the
app reads with `read_context`.

## 2. Component map

```
                         ┌─────────────────────────────────┐
                         │  Switch stack (separate host    │
                         │  processes, same versions)      │
                         │  core 0.31.0 :8000              │
                         │  Mattermost 11.9.0 :8065        │
                         │  gateway :3000 · Postgres 16    │
                         └────────▲────────────────────────┘
                                  │  HTTP ops + WS / SSE
              ┌───────────────────┴───────────────────┐
              │                                       │
   ┌──────────┴──────────┐               ┌──────────────┴──────────┐
   │  App server :3100   │               │  Agent runtime          │
   │  server/server.js   │               │  server/agent-runtime.js│
   │  - static app/      │               │  - ONE long-lived WS    │
   │  - JSON API         │               │    connection (no room  │
   │  - session tokens   │               │    claims)              │
   │  - withRoomConnection│              │  - cursor + dedup +     │
   │    (transient, per  │               │    gap catch-up +       │
   │    call)            │               │    reconnect/backoff    │
   │  - /api/switch/*    │               │  - routes addressed     │
   │    read + post      │               │    human messages →     │
   └──────┬──────────────┘               │    tools → LLM draft    │
          │                              │  - drafts only, never   │
          │  load/save                   │    posts/approves       │
   ┌──────┴──────────────┐               └──────────────┬──────────┘
   │  JSON store         │                              │ read-only
   │  data/converge.json │                              │ file read
   │  atomic save +      │                              │
   │  rotating backups   │               ┌──────────────┴──────────┐
   └──────┬──────────────┘               │  LLM abstraction        │
          │                              │  server/llm.js          │
   ┌──────┴──────────────┐               │  openai-compatible /    │
   │  Deterministic      │               │  mock (tests only)      │
   │  engine             │               │  structured-output      │
   │  server/engine.js   │               │  JSON Schema validation │
   │  - HAGGLE maths     │               └──────────────┬──────────┘
   │  - state machine    │                              │
   │  - COURT tally      │               ┌──────────────┴──────────┐
   │  - CORRECTION       │               │  Tool registry          │
   │    extraction       │               │  server/tools.js        │
   └─────────────────────┘               │  6 tools, read/draft    │
                                         │  only — no approve tool │
                                         └─────────────────────────┘
```

The app server and the agent runtime are **two processes with one
connection each, by design**: the runtime owns the long-lived event
connection and claims no rooms, so the app server's transient
`withRoomConnection` (open stream → `connect_to_room` → op → close)
cannot evict anything the runtime holds. If `withRoomConnection` is
ever replaced, it should be replaced by calls on the runtime's
connection, not by a second long-lived one. See
`docs/AGENT-RUNTIME.md`.

## 3. The app server (`server/server.js`)

- Zero-dependency Node `http` server, binds `127.0.0.1` only
  (loopback-only demo — see `docs/SECURITY.md`).
- Serves the static app (`app/index.html`, `app/app.js`,
  `app/styles.css`) per request with no cache, so client changes go
  live without a restart.
- JSON API under `/api/*`. GETs are open; **every POST requires a
  valid session token** in the `X-Converge-Session` header
  (`POST /api/session` issues one; see §6).
- Request bodies are capped at 1 MB (413 over the cap); malformed JSON
  returns 400, not 500.
- Rate limiting: per-IP token buckets — 5 session issuances per minute,
  60 other POSTs per minute; 429 when empty.
- Security headers on every response: `X-Content-Type-Options:
  nosniff` and a strict Content-Security-Policy (`default-src 'self'`,
  no inline styles — the dark redesign removed all 42 inline style
  attributes so the CSP holds).
- `/api/switch/*` talks to the real Switch server when
  `SWITCH_BASE_URL` is set (REAL-SWITCH) and to the labelled in-memory
  stub otherwise (SIMULATED-STUB). The mode pill is health-derived:
  `SWITCH-UNREACHABLE` when the probe fails.
- `/api/switch/register` was **removed** (P0, 2026-11-07): it minted
  Switch agent credentials for any loopback caller. Agent registration
  is a one-time ops action, not a web API.

## 4. The deterministic engine (`server/engine.js`)

The engine is the single source of truth for every figure and every
state transition. It is the only place money is computed. An LLM never
invents a financial number.

- **HAGGLE analysis** (`haggleAnalysis`): one normaliser
  (`normalizeHaggleInputs`) with finite-number validation; computes
  old/new cream cost per serving, diff, % change, totals, food-cost %,
  gross margin %, monthly/annual extra, max sustainable price at the
  target food-cost %, with assumptions carried alongside every figure.
- **HAGGLE strategies** (`haggleStrategies`): six strategies, all
  prices **derived from the case input and the owner mandate** (P0,
  2026-11-07 — the hardcoded seed prices are gone):
  - `freeze` — the old (pre-rise) price, 4 weeks.
  - `counter-019` — midpoint of `(targetPrice + maxApprovedPrice) / 2`,
    capped at `maxApprovedPrice`, 6 weeks, in writing. For the seed
    case (target $0.16, max $0.20) that is **$0.18**.
  - `volume-021` — 10% off the new price, 4 weeks.
  - `alternative-018` — 25% below the new price, 4 weeks, flagged
    `unverified: true` (verify quality and delivery before switching).
  - `gradual` — `min(maxApprovedPrice, newPrice)`, 4 weeks.
  - `substitute` — old price as a trial, with a quality-risk note.
  Each strategy carries `unitPrice`, `duration`, `unit`, per-serving
  and monthly figures, and a **recommendation computed from its own
  figures** (whether its food-cost % sits within the target).
- **COURT** (`courtConflicts`, `courtTally`): version conflicts,
  blind means, disagreement analysis. The sample→version mapping is
  withheld server-side until all ratings are in.
- **CORRECTION** (`extractClaims`): rule-based, regex claim extraction
  — factual assertions separated from opinions; not a verified
  fact-checker. `claimEvidenceRefs` is token-overlap matching.
- The client formats server-computed values only. It does not
  duplicate engine maths (the two remaining client-side derived
  figures — a per-serving delta and an annual figure — are trivial
  arithmetic on server values; audit L7/L8).

## 5. The JSON store (`server/store.js`) — atomic save

- One file, `data/converge.json`, top-level key `cases` only, loaded
  once into memory at boot and rewritten in full on every mutation.
- **Atomic save (P0, 2026-11-07):** `save()` writes
  `converge.json.tmp`, fsyncs, then renames over the live file. A crash
  mid-write cannot leave a truncated live file. A rotating backup
  (`converge.json.bak.1/.2/.3`) is kept; `load()` validates JSON and
  falls back to the newest valid backup, reseeding only if all are
  corrupt.
- The audit trail is append-only via `audit()` — no endpoint rewrites
  audit entries. It has no hash chain (audit M4, deferred).
- Schema migration backfills missing fields for the three seed cases
  by id; wizard-created cases get no migration (audit L4, deferred).
- Case ids are unique; HAGGLE ids are sequential (`HAG-###`).

## 6. Session-token auth and the approval boundary

This is the fix for audit Critical C2. The full statement is in
`docs/SECURITY.md`; the architecture is:

- `POST /api/session` issues a `crypto.randomUUID()` token (24h,
  server-side, in-memory `Map`, 5/min per IP). The token's actor is
  fixed: `{ name: 'Mara · Owner', kind: 'human' }` — the single demo
  identity.
- Every other POST requires `X-Converge-Session`; missing, invalid, or
  expired → **401**. The actor for every privileged action is derived
  from the stored session. `body.actor` / `body.actorKind` are
  **ignored entirely** — the client no longer sends them.
- The client boots by POSTing `/api/session`, sends the token on all
  POSTs, and on a 401 clears the token and retries once.
- **The agent runtime never calls `/api/session` and never holds a
  human session token.** It reads the case store read-only and only
  ever calls Switch read ops plus `read_context`. There is no approve
  tool in the registry, and `validateRegistry()` throws if any tool
  name matches approve/adopt/publish/transition/set-claim-status/
  execute/send-message.
- The human-only gate itself lives in `transitionCase`
  (`server/engine.js`): `AWAITING_APPROVAL → APPROVED` requires a
  human actor **and** a pending approval. An agent approval returns
  400. GAP-1 (a bare move to `AWAITING_APPROVAL` without a proposalId
  → 400) and GAP-2 (duplicate pending → 400; `proposalId` validated
  against the engine's strategy list) are unchanged.

## 7. Proposal versioning (audit High H3, fixed P0)

Submitting a proposal now appends a real record to `c.proposals`:

```json
{
  "id": "P2",
  "version": 1,
  "strategyId": "counter-019",
  "terms": "$0.18 / fl oz for 6 weeks, in writing",
  "inputHash": "<sha256 of canonical case input + strategy>",
  "contentHash": "<sha256 of the canonical proposal record>",
  "createdAt": "…",
  "requestedAt": "…"
}
```

- The approval stores `{ proposalId, version, contentHash }` — it
  binds to the exact proposal version and content, not to a positional
  P-number and free text.
- Approve rejects with 400 on any hash mismatch: a tampered record, a
  changed case input after submission, or a missing record. The terms
  shown to the owner are derived from the engine (strategy unitPrice +
  duration + case unit), never typed free text.
- **Expiry:** proposals carry `requestedAt` and a 7-day TTL
  (`PROPOSAL_TTL_MS`). A stale proposal expires to `EXPIRED` on
  read/transition, with an audit event.
- **Idempotency:** a retried approve of the same `proposalId`+`version`
  returns the existing approval (200), not a 400.
- **Legacy approvals** (like HAG-014's, recorded 2026-11-05 before
  versioning, with no `contentHash`) are approved on the human actor +
  pending approval, and stand as history. They are not rewritten — see
  `docs/IMPLEMENTATION-LOG.md` for the $0.19 vs $0.18 discrepancy.

## 8. State machine

13 states: the original 11 plus `WITHDRAWN` and `EXPIRED` (P0
additions, not a rewrite).

```
DRAFT → INTAKE → INVESTIGATING → DISCUSSION → PROPOSAL
  → AWAITING_APPROVAL → APPROVED → COMPLETED
```

Full transition table (`server/engine.js`):

| From | To |
|---|---|
| DRAFT | INTAKE, CANCELLED |
| INTAKE | INVESTIGATING, BLOCKED, CANCELLED |
| INVESTIGATING | DISCUSSION, BLOCKED, CANCELLED |
| DISCUSSION | PROPOSAL, BLOCKED, CANCELLED |
| PROPOSAL | AWAITING_APPROVAL, DISCUSSION, REJECTED, CANCELLED |
| AWAITING_APPROVAL | APPROVED, REJECTED, DISCUSSION, WITHDRAWN, EXPIRED |
| APPROVED | COMPLETED, BLOCKED |
| COMPLETED | — (terminal) |
| REJECTED | DISCUSSION, CANCELLED |
| BLOCKED | INTAKE, INVESTIGATING, DISCUSSION, CANCELLED |
| CANCELLED | — (terminal) |
| WITHDRAWN | — (terminal) |
| EXPIRED | — (terminal) |

**Mapping to the master prompt's suggested names:** `UNDER_REVIEW`
maps to `INVESTIGATING` / `DISCUSSION` (the work of reviewing happens
in those states; no separate state was added); `PENDING_APPROVAL`
maps to `AWAITING_APPROVAL` (the existing pending state). The
11-state machine was kept because it works and is heavily tested; the
two missing capabilities (withdraw, expire) were added as states, not
as a rewrite.

The client mirrors the transition table for its Move dropdown; the
server is the backstop and 400s invalid transitions. The stepper now
has 8 steps (INTAKE is its own step) and terminal states keep the last
real step from the audit trail with a state chip — nothing is marked
current on a rejected/blocked/cancelled case.

## 9. Switch transport — WebSocket primary, SSE fallback

Full protocol evidence is in `docs/AGENT-RUNTIME.md` and
`docs/switch-live-integration.md`. The short version:

- **WebSocket is the live connection**, verified against the actual
  running switch-core 0.31.0 (2026-11-07): `/agents/{id}/connection/ws`,
  `connection_id` (UUID, reused on reconnect), `scope=all`,
  `filter=all`, `start_from` (head, or the cursor on resume),
  `expected_generation`. First frame is always `connection_state`
  (protocol 9, heartbeat 2s, server 0.31.0). The server pings every
  2s; the client answers immediately with
  `{"type":"pong","cursor":<highest processed seq>}`. A connection
  unanswered for 6s is evicted with `heartbeat_lapsed`.
- **Wire-format correction vs the docs:** the docs name domain frames
  `message` / `gap`; the 0.31.0 server actually sends `agent.event`
  and `agent.gap`. `server/switch-ws.js` implements the observed
  shapes and also accepts the docs-shaped frames defensively.
- **Cursor and dedup:** domain events carry a per-agent `sequence`.
  The runtime dedupes by sequence (bounded set, 5000 entries) and
  advances its cursor only forward. Replays on resume are dropped,
  not re-processed.
- **Gap:** `agent.gap` means the server could not replay everything
  since the cursor. The runtime takes `resumed_at` as its new cursor
  and re-reads every subscribed room's timeline via `read_context` —
  a gap is never silently dropped.
- **Evicted / refused:** `taken_over` → stop, do not reconnect.
  `heartbeat_lapsed`, `no_stream`, `unfenced`, `connection_error` →
  reconnect with exponential backoff (1s base, doubling, 30s cap,
  ±20% jitter) and resume from the cursor. Refused (4400/4401/4403/
  4409) → stop; retrying cannot help.
- **SSE fallback:** if the WebSocket upgrade itself fails, the runtime
  falls back to the long-lived SSE stream
  (`GET /agents/{id}/events?connection_id=…`) with `Last-Event-ID`
  resume and a `POST /connection/beat` every 2s (TTL 6s). A refusal
  never falls back. SSE is the pre-revision-7 compatibility path; the
  server keeps it for a window and then removes it, so the WebSocket
  is the primary path.
- **The app server's read path is unchanged:** `GET
  /api/switch/messages` calls `read_context` via the transient
  `withRoomConnection` and merges the live timeline with app-stored
  messages (dedupe by event id; stored-only flagged `localOnly`).
  Room messages are not pushed on the stream — the agent reads human
  messages from the room timeline.
- **Ops are per-agent:** `GET /agents/{id}/ops` (53 ops),
  `POST /agents/{id}/ops/{name}` with the arguments object as the
  body. `post_message` takes `body` only and needs `connect_to_room`
  first on the same connection id.

## 10. LLM abstraction + tool registry (`server/llm.js`, `server/tools.js`)

- **Provider-independent.** Configured by `CONVERGE_LLM_PROVIDER`,
  `CONVERGE_LLM_API_KEY`, `CONVERGE_LLM_BASE_URL`,
  `CONVERGE_LLM_MODEL`. The `openai` provider speaks the
  OpenAI-compatible chat-completions shape; any OpenAI-compatible
  endpoint works by setting the base URL.
- **Structured output.** The model must return JSON validated against
  a JSON Schema (the draft schema: `draft`, `role`, `confidence`,
  `caveats`, `needsHumanReview: true`). Malformed output is rejected,
  not repaired silently.
- **Mock provider** (`CONVERGE_LLM_PROVIDER=mock`) exists for tests
  and local dev only. Every mock response carries `mock: true`, and
  the runtime logs that mock drafts are test output, never live AI.
- **No-model state is first-class, not an error.** If no provider key
  is configured, the runtime starts, connects, observes rooms, and
  logs — but produces **no drafts** and fabricates nothing. As of this
  writing **no provider key is configured** (see
  `docs/IMPLEMENTATION-LOG.md`); the live model path is unconfigured
  and the runtime reports it at startup.
- **Tool registry — six tools, two permissions, zero mutate
  permissions:**

  | Tool | Permission | What it does |
  |---|---|---|
  | `read_case` | read | Case summary (workflow, state, inputs, participants, evidence) |
  | `read_room_timeline` | read | Switch room timeline, oldest first |
  | `compute_haggle` | read | Deterministic HAGGLE analysis + strategies (engine only) |
  | `draft_proposal` | draft | Draft a HAGGLE strategy proposal with engine-derived terms |
  | `draft_court_summary` | draft | Draft a COURT tally/conflict summary |
  | `draft_correction_assessment` | draft | Draft a CORRECTION claim/evidence assessment |

  Arguments are validated against each tool's JSON Schema before the
  handler runs; every call (success, failure, timeout) is appended to
  the audit log with tool name, actor, duration, and error. The model
  never sees a figure the engine did not compute.

## 11. The agent runtime (`server/agent-runtime.js`)

One long-lived process: `node server/agent-runtime.js`. It owns the
one persistent Switch connection, subscribes to the three rooms
(`CONVERGE_ROOMS`, default `#haggle-dairyco`, `#recipe-ragu`,
`#episode-osei`), and routes messages:

1. Only `message` events from humans (`sender_kind === 'user'`) that
   are **addressed** to the facilitator (`payload.addressed === true`)
   are routed. Everything else is observed and logged, not answered.
   Messages from agents (including the facilitator's own echo) are
   ignored.
2. The room is resolved to a case (`switchRoomId`, falling back to the
   known room→case map). No case → no action.
3. Context is gathered **through the tools only**.
4. A role lens is selected internally (Facilitator, Financial Analyst,
   Researcher, Challenger/Auditor, Workflow Specialist — sections of
   the facilitator's system prompt, selected per message, **not**
   separate Switch agents) and the model drafts a JSON response.
5. The draft is surfaced through `onDraft` (default: logged). **It is
   never posted to the room by the runtime.** A human decides what to
   do with it.

The runtime reads the case store read-only (direct file read — no
migration, no save) and only ever calls Switch read ops plus
`read_context` for timeline re-reads. It never calls `/api/session`,
never holds a human session token, and never calls a mutating app
endpoint. SIGINT/SIGTERM stop it cleanly.

**Deployment status (honest):** the runtime code is complete and
tested (58 tests), but the long-lived runtime process is **not
currently running** in production — starting it is a remaining step
(see `docs/JUDGE-SCORECARD.md` and `docs/IMPLEMENTATION-LOG.md`). The
app server :3100 runs the new code; the runtime is a separate process
that must be started with the Switch env and, for drafting, the LLM
env.

## 12. The three workflows, one engine

| Stage | HAGGLE | COURT | CORRECTION |
|---|---|---|---|
| Intake | Supplier price rise | Three conflicting recipe versions | Transcript with factual claims |
| Evidence | Deterministic dish maths | Versions side by side | Rule-based claim extraction, each claim linked to evidence |
| Conflict | Supplier's price vs owner mandate | Conflict table + blind ratings | Guest's challenge vs the transcript |
| Proposal | Six priced strategies | The tally, revealed only when all ratings are in | The verification evaluation |
| Human approval | Owner approves in the room | Human approves the canonical recipe | Host approves the correction |
| Audited resolution | Agreed price recorded, re-checked next month | Canonical recipe recorded, dissent preserved | Errata published, original preserved |

The same state machine, the same stepper, the same tabs, the same
approval and audit pattern run in every workflow. The workflows differ
in their inputs and their evidence, not in their mechanism. HAGGLE is
the flagship business product; COURT proves the engine generalises;
CORRECTION is the supporting application.

## 13. The client (`app/`)

- Static files served by the app server; no build step, no framework.
  Inter + IBM Plex Mono; the dark charcoal/cyan/lime reskin (approved
  redesign, 2026-11-07) keeps Direction B's structure (232px sidebar,
  KPI strip, case workspace grid, stepper, tabs, panels, tables) —
  a reskin, not a layout rebuild. Foundation `#16191D`, panels
  `#1F2329`, cyan `#22D3EE` (actions, links, live), lime `#A3E635`
  (positives, approvals). Every text/background pair meets WCAG AA
  (≥ 4.5:1, computed in Node — see `tests/dark-redesign.test.js`).
- Boot POSTs `/api/session`, sends `X-Converge-Session` on all POSTs,
  retries once on 401. No `body.actor`/`body.actorKind` is sent.
- The room drawer is async: `GET /api/switch/messages` merges the
  live timeline with stored messages. The open case refreshes on
  `visibilitychange`/`focus` (re-fetch only if the detail differs; no
  polling).
- Evidence citations are buttons that jump to and flash the matching
  evidence row. The Negotiation timeline is derived from the case —
  the counter-offer row appears only when a proposal is pending or
  approved, with its real terms. Approval terms are derived from the
  strategy's unitPrice/duration and the case's unit (a $4.00/kg case
  signs in kg).
- The 5-step HAGGLE creation wizard calls server-side
  `/api/cases/preview` (deterministic engine only); plausibility
  warnings gate creation on an acknowledgement checkbox, never by
  silently changing input.

## 14. What is not in this architecture

- No database server. The JSON store is justified for a demo; a
  Postgres mapping is in README §7 if it is ever scaled. The audit
  trail has no hash chain; claim ids are positional (audit M4/M6,
  deferred).
- No per-user auth. One demo identity (`Mara · Owner`), one session
  token per boot, loopback-only. See `docs/SECURITY.md`.
- No live model call. The LLM abstraction and the mock provider are
  built and tested; the live path needs a provider key.
- No separate agent identities. The specialist roles are prompt
  lenses inside the one facilitator runtime.
