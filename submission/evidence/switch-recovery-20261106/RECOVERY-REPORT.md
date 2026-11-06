# Switch recovery report — 2026-11-06 ~16:40-18:36 Dhaka

Recovery of the EXISTING Switch environment from durable data.
Approved scope: recovery only — no fresh install, no rebuild, no
re-registration, no room recreation, no pointer changes.

## What happened during this task

A FOURTH VM replacement wiped the stack at ~16:29-16:33 Dhaka; the
recovery below was completed and verified on that VM (backup 1640,
restart, identities preserved, /health/ready 7/7, REAL-SWITCH, two-way
delivery verified). Then a FIFTH VM replacement hit at ~18:28-18:31
Dhaka (new VM up 1 min at 12:31 UTC) and wiped the running processes
again — including the just-restarted stack and the production app.
The whole recovery was REDONE on the new VM (backup 1831, same
procedure). The durable pgdata survived both replacements. The
procedure is now proven twice end to end.

Wall-clock note: an early `psql` call sat at a password prompt for
~1h46m (empty PGPASSWORD, scram auth) — that is the gap in which the
fifth replacement landed. Later queries used the owner role from .env
and returned immediately.

## Preconditions (verified twice, both VMs)

- pgdata exists, PG_VERSION 16, global/pg_control present.
- `pg_controldata` before each start: cluster state **shut down**
  (clean); last checkpoint 10:33:26 UTC (4th VM) / 12:30:25 UTC (5th VM).
- Production data hash **fdce2d30…** before the delivery test;
  HAG-014 COMPLETED, P2, 4 messages, 6 audit events.
- Room pointers match the third-rebuild identities (see below).

## Backups (independent copies, never hardlinks)

- `~/workspace/backups/switch-recovery-20261106-1640/` — pgdata copy
  (81M). Dir inode 1145333 vs source 1092752 (differ ✓).
  PG_VERSION sha256 e6c21e8d… matches; global/pg_control sha256
  0876266c… matches; file counts 2565 = 2565 ✓.
  (`cp -a` fails on this volume — ownership preservation needs chown,
  which btrfs refuses; used `cp -r --reflink=never
  --no-preserve=ownership` instead.)
- `~/workspace/backups/switch-recovery-20261106-1831/` — pgdata copy
  (81M) before the second restart. Dir inode 1148332 vs source
  1092752 (differ ✓). PG_VERSION sha256 e6c21e8d… matches;
  global/pg_control sha256 20e17b23… matches (differs from the 1640
  copy's 0876266c… because the server ran and checkpointed in
  between — expected). File counts 2564 = 2564 ✓.
- Recovery point 1622 re-verified both times: converge.json inode
  1142070 (live 1012377, differ ✓), sha256 fdce2d30… matches ✓.

## Identities preserved (queried from the `switch` DB, both restarts)

- Bridge: `c004c85d-c9a4-4e7b-8c39-13902311e21b` | mattermost | active | default ✓
- Agent: `4b6d039c-c2db-45df-8e10-a10769ad2cfa` | converge-facilitator ✓
- Rooms: `177e6354-e07f-44eb-b385-8055faf021e6` haggle-dairyco ✓
  `478f26a8-a843-480e-9707-78c142000341` recipe-ragu ✓
  `04da8311-821b-4912-846b-93685e60b59d` episode-osei ✓
- Databases `switch` + `mattermost` present. No re-registration,
  no room recreation, no pointer changes.

## Stack (restarted from durable pgdata, order postgres -> mattermost -> core -> nginx)

- Postgres 16 (binaries reinstalled via apt on each new VM; data dir
  untouched, never re-initialized). Socket in the data dir, log
  pgdata.log. `pg_isready` accepting connections.
- Mattermost 11.9.0 — ping 200, status OK.
- switch-core 0.31.0 — /health {"status":"ok"}.
- nginx gateway — dashboard :3000 200.
- /health/ready: **7/7 healthy** (database, message_listener,
  session_activity_listener, agent_event_listener, signal_bus,
  bridges, connectors). The first restart showed a transient LISTEN
  backoff (4 checks unhealthy, recovered within 30s); the second
  restart was 7/7 immediately.

## Live verification (on the fifth-replacement VM)

- Production CONVERGE :3100 (restarted after the stack was verified
  live — it had died with the VM; RECOVERY.md §2 step 5 and the
  go-live approval cover this): /api/status **REAL-SWITCH**, health
  ok, 3 cases; served app.js contains "Submit for approval" x6.
- Two-way delivery (script `switch-server/two-way-delivery-recovery.py`,
  evidence `two-way-delivery.json`):
  (a) human Mattermost post `pw7kgyztz78h3ncemou7tw5h7h` ->
  read_context (9 threads, marker present on attempt 1).
  (b) agent event `sw_7df1f383fbd54850b72d4fc92e76cee0` ->
  Mattermost post `ukhfcz38widm9mxhfsgy33ykyy` (create_at
  1793968504375). NOTE: the script first recorded the stale
  third-rebuild post id `tcbsob9pypbuxxjofsa9b4fsfh` (same text, old
  marker); caught on review and corrected to the post carrying the
  NEW marker. All test messages ASCII-only (no em dashes).
- Live drawer: GET /api/switch/messages?caseId=HAG-014 ->
  `live: true`, room 177e6354…, 9 messages before the delivery test
  (3 localOnly + 6 live from the preserved timeline), 10 after.
- Production delivery test: POST /api/switch/post -> event
  `sw_52741e9063134cdf80c1f12f0dcc301a` (Mara, real, #haggle-dairyco).
  HAG-014 stays COMPLETED, P2 intact, messages 4 -> 5, audit 6 -> 7.
  Hash fdce2d30… -> **f3a08d2e…** (only the authorized test change).
- Read-only smoke tests: homepage 200, /api/cases 3 cases
  (HAG-014, CRT-007, COR-003), /api/status REAL-SWITCH + health ok.

## Production readiness: READY

The recovered stack is live with the preserved identities, two-way
delivery verified, the live drawer loading real messages, and the
production app reporting REAL-SWITCH on the synced code.

## Remaining limitations (visible, not claimed otherwise)

- External staleness across another tab or an API mutation remains
  documented in STALENESS.md — no instant cross-session sync.
- QA instances :3200/:3300 are down after the fifth replacement
  (they were never part of this recovery; restart them from the QA
  copies before any further QA work).
- Demo messages must avoid em dashes (switch-core 500s on them).
- Demo video's 2 stale frames unchanged (outside scope).
