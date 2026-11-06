# Switch live integration — evidence (2026-11-06, ~00:00 Dhaka)

All of this was verified against the real switch-core 0.31.0 server and the
real bundled Mattermost 11.9.0 running on this machine. No stub content is
presented as live here.

## Server
- switch-core **0.31.0** (published image `ghcr.io/sandbox-quantum/switch-core:0.31.0`),
  Python app `python -m switch_core.main`, uvicorn on **127.0.0.1:8000**
  (loopback only — the 0.0.0.0 bind from the first boot was hardened
  2026-11-06; verified with `ss -tlnp`).
- Gateway (nginx, published `gateway:0.31.0` files) on **localhost:3000**.
- Mattermost Team Edition **11.9.0** on **localhost:8065**, team `switch`.
- PostgreSQL **16.15** (Ubuntu package) with databases `switch` + `mattermost`.

## Health (files: health.json, health-ready.json)
- `GET /health` → HTTP 200 `{"status":"ok"}`
- `GET /health/ready` → HTTP 200, all checks healthy: database,
  message_listener, session_activity_listener, agent_event_listener,
  signal_bus, bridges, connectors.

## Agent (file: ops-summary.json)
- Registered via `POST /agents` (Bearer registration key) → HTTP 200.
- Agent: **converge-facilitator**, id `de9ceb8a-510c-4eef-9a31-c2094c346a12`.
- `GET /agents/{id}/ops` → HTTP 200, **53 operations** (names + required
  args in ops-summary.json). Ops are per-agent
  (`/agents/{id}/ops/{operation}`), not global — verified live.

## Bridge
- Mattermost bridge **bcdd5c54-fa46-4af2-a5a5-ccc097138ae0**, type
  mattermost, status **active**, default, can_create_channels: true
  (from `list_bridges`).

## Rooms (all real Mattermost channels in team `switch`)
- **haggle-dairyco** — Switch room `9a6bfe49-e686-41fe-b1a3-46f77484741b`,
  transport `sw_room_910b60eca8d345c0b49949473f9b5352`.
- **recipe-ragu** — Switch room `ef6e38af-64b7-47fe-9f4d-7648daa58193`
  (created through the CONVERGE app's real Switch wiring).
- **episode-osei** — created through the CONVERGE app's real Switch wiring.

## Addendum — VM replacement + rebuild (2026-11-06 ~02:17 Dhaka)
The runtime replaced the VM overnight; the Postgres data dir did not
survive, so the Switch-side room timelines above (including the original
10-thread HAGGLE approval arc) are unrecoverable. Everything in this
file stays valid as a record of the **first stack**. The stack was
rebuilt the same night (see `docs/switch-live-integration.md`): new
agent `1935ede7-afc2-4294-b4c6-5058e664be22`, new bridge
`ee7d9b4e-815d-4bd2-84a1-1a82d095667d`, rooms recreated with the same
names and new ids — #haggle-dairyco
`87c1575b-0a0e-4fab-95ec-072197846f0f` (event
`sw_a3f97628130c425ea0e8945fbedb5544`), #recipe-ragu
`429e7105-3025-42f3-9278-c95fed982dd9` (event
`sw_23ffc9ee6af34f7ab836000a1f83af69`), #episode-osei
`45eee999-1b64-404f-8d0b-861c0da82489` (event
`sw_a6aa7890e1c9445b83862729408ee3b9`). The bridge was re-verified live
(human marker posted in Mattermost appeared in Switch `read_context`
on the first attempt). CONVERGE's own record survived intact: HAG-014
COMPLETED, approval + audit events + app-stored messages in
`data/converge.json`, and the fresh #haggle-dairyco carries a record
note stating the approval happened in the original room on 2026-11-06
and was NOT re-staged.

## HAGGLE approval workflow (real, end to end)
1. Agent posted the deterministic HAG-014 analysis into #haggle-dairyco
   (event `sw_4bccf918927549e1900d3b681722753e`).
2. The human owner posted approval in Mattermost ("Approved: accept the
   DairyCo counter — $0.19/fl oz for 6 weeks...") — post `cw6x64synjg7tgbrnt1b8b8dxe`.
3. The bridge delivered it to the agent's event stream as a Switch
   `message` event (`sw_0f892e7a491c4877a7a328e3a6a9e610`, sender `user`).
4. CONVERGE recorded the approval: HAG-014
   `AWAITING_APPROVAL -> APPROVED` (actor Owner, kind human, audited),
   then `-> COMPLETED`.
5. The agent posted the approval confirmation back into the room
   (event `sw_6be113d1f4684f3b96135e6fc4927964`), and the CONVERGE app
   posted the case-closure note through its own live wiring
   (event `sw_62b21bea10264`).
6. All four messages were read back from the Mattermost API in the
   #haggle-dairyco channel — independently verified from the Mattermost side.

## COURT / CORRECTION (real rooms, posted through the app)
- COURT: `sw_2cf273c145d84c9ab8ed70c0d1459429` in #recipe-ragu.
- CORRECTION: `sw_288dce6a70004` in #episode-osei.

## CONVERGE app (live wiring)
- `GET /api/status` → `switchMode: REAL-SWITCH`, health
  `{ok: true, status: 200, body: {"status":"ok"}}`.
- `GET /api/switch/rooms` → the 3 real rooms from the live server.
- Tests: `npm test` **19/19** (12 existing + 7 new Switch-client tests).

## Re-verification (2026-11-06 ~00:10–00:20 Dhaka)
- After localhost-bind restarts: `GET /health` 200 `{"status":"ok"}`,
  `/health/ready` 200 all healthy (bridges healthy); app
  `switchMode: REAL-SWITCH`, health ok; `/api/switch/rooms` lists all 3
  real rooms. HAGGLE room read back from Mattermost: 8 posts, full arc
  intact (analysis → owner approval → confirmation → closure).
- Bridge outage found: a switch-core-first restart crashed the Mattermost
  bridge at startup (login before Mattermost was up); human messages posted
  during the outage were never ingested and NOT backfilled. Restarting
  switch-core after Mattermost restored ingestion — verified with a fresh
  marker message appearing in `read_context` within 10s.
- Agent receipt of human messages: via the bridge into Switch's room
  timeline, read with `read_context` (the owner's approval is in the
  HAG-014 timeline). NOT via the event stream (connection/subscription
  events only) and NOT via the long-poll buffer (room_join only).
- Transport: live connection is the WebSocket at
  `/agents/{id}/connection/ws`; SSE is the compatibility path with a
  `POST /agents/{id}/connection/beat` tick every 2s (TTL 6s) — verified
  (unbeaten stream evicted with `heartbeat_lapsed`, beaten stream alive).
- Approval gate: agent approval rejected ("Only a human may approve a
  case"), human approval allowed — verified against the live engine.
- Security: all services bind 127.0.0.1 only (verified with `ss -tlnp`).
