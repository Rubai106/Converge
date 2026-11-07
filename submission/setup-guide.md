# CONVERGE — Setup guide

## Requirements
- Node.js >= 22 (`node --version`)
- No runtime npm dependencies, no database server. Playwright is a
  devDependency, used only by the browser tests (see below).

## Run the demo (app only)
```
git clone https://github.com/Rubai106/accordweave.git
cd accordweave
npm install                  # installs Playwright (devDependency)
npx playwright install chromium   # one-time browser download (see below)
npm test               # expect 351 (350 pass, 1 skipped — the opt-in live Switch test; verified 2026-11-07)
npm run check          # node --check on server files
PORT=3100 npm start
# open http://localhost:3100
```
(Port 3000 is the Switch gateway, not the app.)

## Browser tests (Windows and Linux)
Six test files drive a real browser (GAP-2 journey, NEW-1 deep links,
staleness refresh, UX polish journey, visual polish journey, dark
redesign journey). They use the `playwright` package, which finds its
own Chromium per OS — no paths to edit, no manual `npm start` before
`npm test` (each test spawns its own server on an isolated seed file
in a temp dir; the repo's `data/converge.json` is gitignored and is
never read by the tests).

One-time setup, same command on Windows (PowerShell/CMD) and Linux:
```
npm install
npx playwright install chromium
```
`npx playwright install chromium` downloads the Chromium build that
matches the pinned Playwright version (see `package-lock.json`) into
Playwright's per-user cache (`%USERPROFILE%\AppData\Local\ms-playwright`
on Windows, `~/.cache/ms-playwright` on Linux). If it is already
installed, the command is a no-op. On Linux, Playwright may also need
system libraries — run `npx playwright install-deps chromium` (needs
sudo) if the browser fails to launch with a missing-library error.
On Windows, no extra step is needed beyond the download.

## Real Switch — two paths
### A. Official path: Docker Compose (supported, on a Docker-capable machine)
The official self-host deployment is `docker compose --profile collab
--profile gateway` from the `switch-v0.31.0` tag of
`sandbox-quantum/switch` (see `docs/switch-deployment.md`). It starts
switch-core 0.31.0, the gateway, Postgres 16 and Mattermost 11.9.0.
**Docker Compose is NOT running on this VM** — the sandbox blocks
containers (runc setns denied). Do not claim otherwise.

### B. Sandbox workaround: native processes (what actually runs here)
On this VM the published images' code runs natively as host processes
with the Compose env — same software, same versions, same ports. Full
record + restart procedure: `docs/switch-live-integration.md`.
Evidence: `submission/evidence/switch-live/`.
This is a workaround for a sandbox restriction, not the official
deployment. If you have a Docker-capable machine, use path A.

## Connect the app to a real server
1. `GET /health` on the server address → `{"status":"ok"}`.
2. Create a registration key in the Gateway → `POST /agents` (capture
   `{id, api_key}` — returned once) → open the event stream
   `GET /agents/{id}/events?connection_id=<uuid>` (SSE compatibility path;
   tick `POST /agents/{id}/connection/beat` every 2s or the server evicts
   the stream — the live connection is the WebSocket
   `/agents/{id}/connection/ws`) → `GET /agents/{id}/ops` to read live
   operation schemas. Room messages are not pushed on the stream; the agent
   reads them from the room timeline via `read_context`.
3. Run CONVERGE with:
```
SWITCH_BASE_URL=http://localhost:8000 SWITCH_API_KEY=<agent-key> SWITCH_AGENT_ID=<agent-id> SWITCH_BRIDGE_ID=<bridge-id> PORT=3100 npm start
```
Verify: `/api/status` → `switchMode: REAL-SWITCH`, health `{ok: true}`.

## Environment variables
- `PORT` (default 3000 — set 3100; 3000 is the Switch gateway)
- `SWITCH_BASE_URL` (unset = SIMULATED-STUB)
- `SWITCH_API_KEY` (real agent key; never commit it)
- `SWITCH_AGENT_ID` (real agent id; never commit it)
- `SWITCH_BRIDGE_ID` (optional; defaults to the first active bridge)

Ports are deployment-specific and come from the environment, not the
code: on this VM the Switch stack is gateway 3000 / core API 8000 /
Mattermost 8065 / Postgres 5432; on the developer's Windows PC the same
services run on 60911–60914 (gateway 60911, API 60912, Mattermost 60913,
Postgres 60914). Point `SWITCH_BASE_URL` at the core API port for the
machine you are on.

## Demo data
Seeded fictional cases in `data/converge.json` (created on first run):
HAG-014 (HAGGLE), CRT-007 (COURT), COR-003 (CORRECTION). Delete the file to re-seed.
