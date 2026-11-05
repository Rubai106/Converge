# Switch live integration — deployment record

How the real switch-core 0.31.0 + Mattermost 11.9.0 stack runs on this
machine, what blocked the straightforward path, and how to restart it.

## What is running (2026-11-06)
| Component | How it runs | Address |
| --- | --- | --- |
| switch-core 0.31.0 | Published image's files, run natively (`python -m switch_core.main`, uvicorn) | http://localhost:8000 |
| Gateway | Published image's nginx config + static files, Ubuntu nginx | http://localhost:3000 |
| Mattermost 11.9.0 | Published image's binary, run natively | http://localhost:8065 |
| PostgreSQL 16.15 | Ubuntu `postgresql-16` package | localhost:5432 |
| CONVERGE app | `node server/server.js`, REAL-SWITCH mode | http://localhost:3100 |

Secrets live in `~/workspace/switch-server/.env` (never in the repo).
Agent credentials: `~/workspace/switch-server/.converge-agent.json`
(never in the repo). Switch server code: `~/workspace/switch-server/rootfs/`.

## Why not Docker Compose (the honest blockers, in order)
1. **Dead apt mirror.** The VM's `mirror.cogentco.com` returns nothing
   (curl: 000 after 10s); `apt-get update` hung on it for 25 minutes.
   Fixed by removing that URI (azure.archive.ubuntu.com is fast).
   Docker Engine 29.9.3 + Compose v5.7.0 then installed cleanly.
2. **No NET_ADMIN.** `dockerd` cannot create iptables/nftables chains
   ("Permission denied (you must be root)") and cannot create the
   docker0 bridge ("operation not permitted"). Started with
   `--iptables=false --bridge=none` — the daemon runs.
3. **Go registry clients time out.** `docker pull` and `skopeo` fail with
   "TLS handshake timeout" to ghcr.io / registry-1.docker.io, while curl
   and Python reach the same hosts in <2s through the same proxy.
   Workaround: a Python OCI puller
   (`~/workspace/switch-server/scripts/oci-pull.py`) fetches manifests and
   blobs with urllib and assembles `docker load` tarballs. All 5 images
   were pulled this way and loaded into Docker.
4. **Containers cannot start at all.** `runc create` fails with
   "join container mntns: setns: operation not permitted" — even with
   `--network none`. The VM's user-namespace boundary denies setns into
   any namespace a container runtime creates. Docker can install, the
   daemon can run, images can load, but no container process can start.
   This is a sandbox restriction, not a configuration error.
5. **/tmp is a 512 MB tmpfs.** The Mattermost pull (459 MB) hit ENOSPC
   there; image work now lives under `~/workspace/switch-server/images/`.

## The native path (what actually works)
The published images are just files. Each image was extracted with
`docker save` + layer untar into `rootfs/<name>/` and run as a host
process with the same env the official Compose file would give it:
- switch-core: the image's own Python 3.12 + loader
  (`lib64/ld-linux-x86-64.so.2 --library-path ...`) because the image is
  Debian 13 (OpenSSL 3.3 / glibc 2.41) and the host is Ubuntu 24.04
  (OpenSSL 3.0). Mixing host and image libraries crashes with
  "stack smashing detected". Also unset the shell's proxy vars in the
  launcher: httpx chokes on the NO_PROXY list's `[::1]` entry.
- Mattermost: runs directly (host loader); the explicit-ld.so invocation
  crashes its Go binary the same way, direct execution works.
- Gateway: Ubuntu nginx with the image's `default.conf` (upstream
  rewritten to 127.0.0.1:8000) and the image's static files.
- Setup seeder: the image's `setup.py` run natively; it created the
  Mattermost admin/team/user and registered the bridge.
- Postgres: Ubuntu's postgresql-16 (the image is Alpine/musl and cannot
  run natively); databases/roles created per the Compose init-db logic.

## Restarting after a VM replacement
The runtime replaces this VM periodically and wipes everything outside
`~/workspace` (Docker, apt installs, /tmp). Everything needed to rebuild
is under `~/workspace/switch-server/`:
1. Re-run `scripts/install-docker.sh` (fixes the apt mirror, installs Docker).
2. `dockerd --iptables=false --bridge=none --storage-driver=vfs` (daemon only; used for `docker save` extraction).
3. Re-pull images with `scripts/oci-pull.py` and `docker load` (or reuse
   `images/*.tar` if they survived — they live under ~/workspace).
4. Re-extract rootfs dirs if missing (the `docker save` + untar steps).
5. `sudo apt-get install -y postgresql-16 nginx`, start postgres, recreate
   DBs/roles from `.env` (see `docs/switch-deployment.md` for the SQL).
6. Start in order — **Mattermost BEFORE switch-core**: `./run-mattermost.sh`,
   wait for `GET /api/v4/system/ping` → `{"status":"OK"}`,
   then `./run-switch-core.sh`, `nginx -c nginx/gateway.conf`,
   `./run-setup.sh` (idempotent), then the CONVERGE app with the real
   Switch env (see below). The order matters: the Mattermost bridge logs
   into Mattermost at startup, and if Mattermost is not up yet the bridge
   **crashes and does not recover** — observed 2026-11-06: after a
   switch-core-first restart the bridge was down, human messages posted
   to Mattermost were never ingested into Switch, and they were NOT
   backfilled after the bridge was restarted. Restarting switch-core once
   Mattermost was up restored ingestion (verified with a fresh marker
   message appearing in `read_context`).
7. The agent id/key in `.converge-agent.json` and the bridge id survive
   in ~/workspace, so re-registration is not needed; the rooms survive in
   Postgres only if its data dir survives (it does not — `/var/lib/postgresql`
   is outside ~/workspace, so a replacement means re-running setup and
   re-creating rooms; the evidence in this repo stays valid as a record).

## Security — loopback only (verified 2026-11-06)
This VM has no public interface (only `lo` and a CGNAT `host0`
198.19.0.2/30 behind the sandbox NAT), but the services were still bound
to 0.0.0.0 at first — switch-core's log even said "Switch is running on
http://0.0.0.0:8000". They are now bound to loopback only, verified with
`ss -tlnp`:
- switch-core: `SERVER_HOST=127.0.0.1` in `run-switch-core.sh`
  (pydantic setting `server_host`, default `0.0.0.0`).
- Mattermost: `MM_SERVICESETTINGS_LISTENADDRESS=127.0.0.1:8065`.
- Gateway: `listen 127.0.0.1:3000;` in `nginx/gateway.conf`.
- CONVERGE app: `server.listen(PORT, '127.0.0.1', …)`.
- Postgres already listened on 127.0.0.1:5432 only.
Nothing here is reachable from another machine. The Switch API and its
registration endpoints are never public.

## CONVERGE app — real Switch env
```
PORT=3100
SWITCH_BASE_URL=http://localhost:8000
SWITCH_API_KEY=<from .converge-agent.json>
SWITCH_AGENT_ID=<from .converge-agent.json>
SWITCH_BRIDGE_ID=bcdd5c54-fa46-4af2-a5a5-ccc097138ae0
```
With these set, `/api/status` reports REAL-SWITCH with the live health
probe, and `/api/switch/*` talks to the real server (per-agent ops,
SSE event stream with heartbeat, room creation on first post).

## Verified protocol corrections (live server vs docs)
- Ops are per-agent: `GET /agents/{id}/ops`, `POST /agents/{id}/ops/{op}`.
  The body is the arguments object itself.
- The live connection is the WebSocket at `/agents/{id}/connection/ws`.
  This client uses the SSE compatibility path (kept for pre-revision-7
  runtimes): `GET /agents/{id}/events?connection_id=<uuid>` with
  `Accept: text/event-stream`; the connection id is client-generated.
  An SSE client MUST tick `POST /agents/{id}/connection/beat` every 2s
  (TTL 6s) or the server evicts it with `heartbeat_lapsed` — verified
  live: an unbeaten stream was evicted after ~6s; a beaten stream stayed
  alive 20s+. The app's `openEventStream` now beats automatically
  (tests/switch-client.test.js covers it).
- `post_message` needs `connect_to_room` first, on the same connection id
  (header `X-Switch-Connection-Id`).
- `GET /health` is public → `{"status":"ok"}`; `/healthz` needs auth (401).
- Registration: `POST /agents` with `Authorization: Bearer <registration key>`.
- **How the agent receives human messages:** NOT via the event stream —
  the stream carries connection/subscription events only, and the
  long-poll buffer holds room_join events, not messages. Human messages
  posted in Mattermost are ingested by the bridge into Switch's room
  timeline; the agent reads them with the `read_context` op (verified
  2026-11-06: the owner's HAGGLE approval is in the HAG-014 timeline;
  a fresh marker message posted after the bridge restart appeared in
  `read_context` within 10s). Messages posted while the bridge was down
  are never backfilled — they stay in Mattermost only.
