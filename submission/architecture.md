# CONVERGE — Architecture

## Overview
One shared decision engine, three workflows, one Switch room surface.
Node 24, zero npm dependencies, JSON file store. No microservices.

```
Browser (temporary dev UI)
  │ fetch /api/*
  ▼
server/server.js  (node:http, static + API)
  ├─ server/engine.js   — deterministic maths, state machine, COURT tally, CORRECTION extraction
  ├─ server/store.js    — JSON store, seeded demo cases
  ├─ server/switch-client.js — Switch client (SSE events + per-agent HTTP ops, verified live)
  └─ server/stub-switch.js   — SIMULATED stub implementing the same routes
        │
        │ (real deployment: SWITCH_BASE_URL + SWITCH_API_KEY)
        ▼
Switch server 0.31.0 (Docker / Console 0.40.1) → Mattermost (bundled, collab profile)
  Rooms: #haggle-dairyco, #recipe-ragu, #episode-osei
```

## Domain entities
User, Organization (implicit: demo workspace), Workspace, Room, WorkflowTemplate
(HAGGLE/COURT/CORRECTION), DecisionCase, Participant, ParticipantRole, Agent,
Evidence, Claim, Proposal, CounterOffer, Evaluation, Approval, Message, Decision,
Outcome, AuditEvent, Attachment.

In code today: a case has id, workflow, title, state, participants[], input (HAGGLE)
or versions (COURT) or transcript (CORRECTION), switchRoom, proposals[],
pendingApproval, approval, audit[], messages[], evidence[].

## State machine
DRAFT → INTAKE → INVESTIGATING → DISCUSSION → PROPOSAL → AWAITING_APPROVAL →
APPROVED → COMPLETED, with REJECTED / BLOCKED / CANCELLED branches.
Validated in `transitionCase()`. `APPROVED` requires a human actor AND a pending
approval — agents cannot approve, and cannot skip the approval step (tested).

## Agents (roles + instructions, not separate apps)
- FACILITATOR — coordinates, tracks progress, blocks premature completion.
- RESEARCHER — collects evidence, records uncertainty.
- ANALYST — deterministic calculations only (`engine.js`); never invents money.
- CHALLENGER / AUDITOR — challenges unsupported conclusions, checks assumptions.
- WORKFLOW SPECIALIST — negotiation / adjudication / correction instructions per room.

Agents communicate by message/mention in the room. There is no separate task
protocol (per Switch docs).

## Switch integration
Protocol: live connection is the WebSocket (`/agents/{id}/connection/ws`);
this client uses the SSE compatibility path
(`GET /agents/{id}/events?connection_id=<uuid>`,
`Accept: text/event-stream`) with a `POST /agents/{id}/connection/beat`
tick every 2s (TTL 6s). Per-agent HTTP ops (`GET /agents/{id}/ops`,
`POST /agents/{id}/ops/{name}`, arguments object as the body),
`Authorization: Bearer` agent key, registration `POST /agents` →
`{id, api_key}` once, probe `GET /health`. `post_message` needs
`connect_to_room` first on the same connection id
(`X-Switch-Connection-Id`). Room messages are NOT pushed on the stream —
the agent reads human messages from the room timeline via `read_context`.
Per-operation payloads are read from a live server's
`GET /agents/{id}/ops`, never hard-coded. This is the OBSERVED live
behaviour (2026-11-06); the earlier global-`GET /ops` reading is
superseded — see `docs/switch-live-integration.md`.
Mattermost: bundled via the `collab` Compose profile (official path) or the
native run on this machine (same software, same versions — see
`docs/switch-live-integration.md`); per-agent bot accounts; adding an agent
bot to a channel creates the room.
See `docs/switch-protocol-notes.md` for the verified details and the
unverified items (switch-core image name, per-op JSON shapes, WS URL scheme).

## Data & security
- JSON file store (`data/converge.json`), seeded fictional demo data.
- Role-based access in the model: participants have roles; approval is human-only.
  (An earlier draft of this bullet claimed CORRECTION separates a `#research`
  room from `#episode-*` — that room does not exist; the claim was removed
  2026-11-06 during the night hardening pass. Do not re-add it without
  building the feature.)
- Secrets via environment only (`SWITCH_BASE_URL`, `SWITCH_API_KEY`,
  `AGENT_REGISTRATION_TOKEN` on the server). No secrets in the repo.
- Audit trail is append-only per case; every state change, message and approval
  is recorded with actor, kind (human/agent) and timestamp.

## Scaling note
The JSON store maps 1:1 to Postgres tables (cases, participants, evidence,
proposals, approvals, messages, audit_events) if the product is taken further.
Agent connections must stay in a persistent worker, not serverless functions.
