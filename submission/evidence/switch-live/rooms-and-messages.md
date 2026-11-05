# Switch live integration — evidence (2026-11-06, ~00:00 Dhaka)

All of this was verified against the real switch-core 0.31.0 server and the
real bundled Mattermost 11.9.0 running on this machine. No stub content is
presented as live here.

## Server
- switch-core **0.31.0** (published image `ghcr.io/sandbox-quantum/switch-core:0.31.0`),
  Python app `python -m switch_core.main`, uvicorn on **0.0.0.0:8000**.
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
