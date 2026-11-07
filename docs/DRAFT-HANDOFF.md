# CONVERGE — Agent draft handoff (§30)

**Status:** current as of 2026-11-07. The suite was **294/294** before
this work; this work adds **16 draft tests** (15 in
`tests/drafts.test.js`, 1 in `tests/drafts-journey.test.js`). Other
agents are adding tests concurrently, so the suite total moves — the
draft tests are the 16 listed here.
This document describes how a model draft reaches a human, how the
human reviews and shares it, and what the security invariant is.

## The problem

The agent runtime (`server/agent-runtime.js`) produces drafts but
**cannot approve, publish, or send messages** — that is a structural
invariant, not a policy. Before this handoff existed, its default
`onDraft` only logged the draft to the server console: a human had no
way to see it in the product, review it, or choose to share it in the
Mattermost room. A draft that only exists in a log is not a
collaboration experience.

## The design

The smallest maintainable integration for this deployment (one VM,
two processes, a local JSON store):

```
Switch room (human message)
  -> agent runtime (WebSocket event -> routeHumanMessage -> model draft)
  -> local draft inbox (data/drafts.json, append-only)
  -> app server (GET /api/drafts)
  -> Drafts tab (human review)
  -> human clicks Share -> POST /api/drafts/:id/share
  -> app server posts to the Mattermost room via the EXISTING Switch
     integration (same path as /api/switch/post)
  -> draft status SHARED; the owner must still separately approve any
     agreement (sharing is NOT approval)
```

The runtime and the app server are separate processes that share one
file (`data/drafts.json`). The runtime **appends**; the app server
**reads and updates statuses**. The runtime never calls a mutating app
endpoint and never holds a human session token.

## The draft inbox — `server/drafts.js`

- **File:** `data/drafts.json`, next to the case store. Resolved from
  the same `CONVERGE_DATA_FILE` env var, so a scratch server gets a
  scratch drafts file and tests never touch production drafts.
  (`data/` is gitignored production data, same as `converge.json`.)
- **Append-only:** a new draft is a new record, never an overwrite.
  A revision requested by a human produces a new draft via the normal
  room path; the runtime links it with `supersedes` (the id of the
  open draft it replaces). The old record stays on the record.
- **Atomic save:** the same tmp + fsync + rename pattern as
  `server/store.js` — a crash mid-write never leaves a torn file.
- **Case-scoped:** every read is filtered by `caseId`. A draft for
  HAG-014 can never appear under CRT-007 (asserted in
  `tests/drafts.test.js`).
- **Stateless:** every operation reads the file fresh, so a draft
  written by the runtime process is visible to the app server
  immediately. Nothing is cached in memory.
- **Two-process race:** the atomic rename prevents torn reads, but a
  read-modify-write race can still lose an update if the runtime and
  the app server write at the same instant. Accepted for this
  single-VM demo deployment (drafts are written rarely — once per
  human request, once per human action). A production deployment
  would need a real store with row-level locking.

### Draft record

| Field | Meaning |
|---|---|
| `id` | `crypto.randomUUID()` — the draft's identity. |
| `caseId`, `roomId`, `messageId` | Which case, which Switch room, which source message. |
| `request` | The original human request text. |
| `draft` | The model-generated draft content. |
| `role` | Specialist role lens (`facilitator`, `financial-analyst`, `researcher`, `challenger`, `workflow-specialist`). |
| `confidence` | `low` / `medium` / `high` (from the model). |
| `caveats` | Risks and uncertainties, from the model. |
| `toolsUsed` | Tool names the runtime actually called (from the registry audit log, successful calls only). |
| `findings` | What the facilitator investigated. HAGGLE: the deterministic engine's output (analysis + strategies, labelled engine-computed). COURT/CORRECTION: the evidence ids from the case context. |
| `needsHumanReview` | Always `true`. |
| `status` | `GENERATED` → `UNDER_REVIEW` → `SHARED` / `REJECTED` / `ARCHIVED`. |
| `provider`, `model`, `mock` | Which provider produced the draft. `mock: true` means the mock provider — test output, **never** a live model response. |
| `supersedes` | Id of the open draft this one replaces, or `null`. |
| `createdAt` (+ `at`) | Creation timestamp. |
| `reviewedBy`, `reviewedAt`, `sharedBy`, `sharedAt`, `shareResult`, `shareError`, `rejectedBy`, `rejectedAt`, `archivedBy`, `archivedAt`, `revisionRequested`, `revisionHistory` | Human-decision records, set by the endpoints below. |

The record contains **no hidden internal reasoning**. There is none
to hide: the fields are the request, the tools, the findings, the
draft, the caveats, and the metadata.

## The runtime wiring — `server/agent-runtime.js`

Small changes only; the routing, dedup, connection, and tool
registry are untouched:

- `routeHumanMessage` builds the full draft record: `id`, `request`
  (the human message text), `provider`/`model` (normalised so a raw
  provider object never yields `undefined`), `toolsUsed` (snapshotted
  from the registry audit log around the tool calls), `findings`
  (`buildFindings`, exported for tests), `status: 'GENERATED'`,
  `createdAt`, and `supersedes` (the open draft for the case, read
  from the inbox just before producing the new one).
- The **default** `onDraft` writes the draft to the inbox (via
  `server/drafts.js`) **and** logs it. A failed inbox write is logged,
  never fatal — the draft is still logged, so it is not silently lost.
  Tests pass their own `onDraft`, so the default never runs in tests.
- `opts.draftsFile` lets tests point the runtime at a scratch inbox.
  The standalone entry point does not pass it, so production resolves
  the default (`data/drafts.json`).

## The app-server endpoints — `server/server.js`

One delimited block. All mutations require a valid human session
token (the central POST gate 401s without one); the actor for every
recorded decision is the session actor, never a client-supplied name.

| Endpoint | Method | Auth | Behaviour |
|---|---|---|---|
| `/api/drafts?caseId=<id>` | GET | none (read) | Drafts for one case, newest first. 400 without `caseId`, 404 for an unknown case. |
| `/api/drafts/:id/review` | POST | session | `GENERATED` → `UNDER_REVIEW` (records `reviewedBy`/`reviewedAt`). Re-review is idempotent 200. 400 for `SHARED`/`REJECTED`/`ARCHIVED`. |
| `/api/drafts/:id/share` | POST | session | The human-mediated Mattermost publication (below). |
| `/api/drafts/:id/reject` | POST | session | `GENERATED`/`UNDER_REVIEW` → `REJECTED` (records `rejectedBy`/`rejectedAt`). Re-reject is idempotent 200. 400 for `SHARED`/`ARCHIVED`. |
| `/api/drafts/:id/archive` | POST | session | Any status → `ARCHIVED` (records `archivedBy`/`archivedAt`). Re-archive is idempotent 200. |
| `/api/drafts/:id/request-revision` | POST | session | `GENERATED`/`UNDER_REVIEW` stay `UNDER_REVIEW` with `revisionRequested` (`note`, `by`, `at`) and an appended `revisionHistory` entry. The body `note` is capped at 1000 chars. 400 for `SHARED`/`REJECTED`/`ARCHIVED`. |

### Share — the human-mediated publication

`POST /api/drafts/:id/share` with `{ caseId }`:

1. The draft must exist (404 otherwise).
2. The draft must be `GENERATED` or `UNDER_REVIEW`. Already `SHARED`
   → **409**. `REJECTED`/`ARCHIVED` → **400**.
3. `caseId` is required (400) and must equal the draft's case (400
   on a mismatch — a draft cannot be shared as another case).
4. The case must exist (404).
5. The posted text is built from the draft, labelled as a draft, and
   states that sharing is not approval:
   `[CONVERGE draft - facilitator, <role>]` + draft + `Draft only,
   shared by <human> for review. Sharing is not approval: the owner
   must separately approve any agreement.` The text is ASCII-only
   (switch-core 500s on em dashes, so dashes and smart quotes are
   replaced; the stored draft keeps its original text and the
   replacement is recorded as `sanitized` in the share result) and
   truncated to Mattermost's 4000-character limit.
6. The post goes through the **existing** Switch integration — the
   same `ensureRealRoom` + `withRoomConnection` + `post_message` path
   as `/api/switch/post` in real mode, the stub in stub mode. No new
   Switch client was built.
7. On failure the draft keeps its status, the error is recorded as
   `shareError` on the draft, and the endpoint answers **502** with
   the error — never a claimed success.
8. On success the draft becomes `SHARED` with `sharedBy`,
   `sharedAt`, and `shareResult` (`eventId`, `roomId`, `room`,
   `simulated`). The shared message is also recorded on the case
   (so the room drawer shows it) and the case audit trail gets a
   `draft-shared` event.

The agent **never** calls this endpoint. It holds no session token
and has no code path to it.

The case audit is a secondary record (the drafts file is
authoritative). A failed case save is logged server-side and does not
turn a completed draft action into a 500.

## The review interface — Drafts tab

A **Drafts** tab in the case workspace (alongside Overview, Analysis,
Negotiation, Evidence, Audit), carrying the count of open drafts
(`Drafts (1)`). It lists the case's drafts (newest first) and shows
the selected draft's:

- Original human request.
- What the facilitator investigated (tools used; engine-computed
  findings for HAGGLE — food cost, monthly/annual extra, max
  sustainable price, the strategy table — or the evidence ids
  examined for COURT/CORRECTION).
- The recommendation (the draft content, labelled "model-generated
  draft — interpretation, needs human review").
- Risks and uncertainties (the caveats).
- The human-review requirement.
- Status + model/provider metadata — with a prominent **MOCK** label
  when `mock: true` ("MOCK — test output, NOT a live model response").
- The share result (room, event id, simulated/live) or the share
  error, when present; the revision request, when present; the
  supersedes link, when present.

Verified facts, assumptions, and model interpretations are kept
apart by construction: the findings panel is labelled
engine-computed (verified by the deterministic engine), the draft
panel is labelled model-generated interpretation, and the caveats
carry the uncertainties. No hidden internal reasoning is displayed —
there is none in the record.

Human actions (all session-authenticated via the client's `api()`):

- **Start review** (GENERATED only) → `UNDER_REVIEW`.
- **Share in Mattermost** (GENERATED/UNDER_REVIEW) → a two-step
  confirm panel restating that sharing is not approval → `SHARED`.
- **Reject** (GENERATED/UNDER_REVIEW) → `REJECTED`.
- **Archive** (any non-ARCHIVED status) → `ARCHIVED`.
- **Request revision** (GENERATED/UNDER_REVIEW) → a note form; the
  draft stays `UNDER_REVIEW` with the request recorded. The human
  asks the facilitator in the room for the revision, which arrives
  here as a **new** draft (linked by `supersedes`).

After every action the inbox is re-fetched and the tab re-renders,
so the shown status is what the server recorded — never an
optimistic local guess. A failed action shows the error without
losing the draft from view.

The drafts cache is loaded when a case opens (both the cached-detail
fast path and the fetch path in `resolveCaseRoute`), refreshed when
the Drafts tab opens, refreshed by the focus/visibility staleness
check, and refreshed after every draft action.

## How to trigger a draft with the mock provider (demo)

The mock provider is for tests and local demo only — its drafts are
labelled `mock: true` everywhere and must never be presented as live
model responses.

```bash
# In one terminal: the app server (stub mode is fine for the UI demo).
PORT=3100 npm start

# In another: the runtime with the mock provider.
CONVERGE_LLM_PROVIDER=mock node server/agent-runtime.js
```

Then, in the Switch room (or via the runtime's event path), send a
message addressed to the facilitator. The runtime drafts, appends to
`data/drafts.json`, and the draft appears in the case's Drafts tab
(open the tab or refocus the window to refresh). Review it, and share
it — in stub mode the share is recorded as `simulated: true`.

For a **live** model draft, set the four `CONVERGE_LLM_*` variables
(see `.env.example` — all four are empty placeholders; no key is
configured) and restart the runtime. The draft then carries
`mock: false` and the real provider/model names.

## What this does NOT do

- The runtime does not start itself, and this change does not start
  it. Starting it is an operational step (`node
  server/agent-runtime.js`).
- No live model call has been verified — that needs a provider key,
  which only the user can supply.
- No real-user evaluation has been done.
- The demo video predates this UI.
- The audit hash chain, stable claim ids, CSRF/CORS hardening, live
  XSS probe, and axe-core in the suite are now delivered (§31,
  2026-11-07 — see `docs/SECURITY.md`).
