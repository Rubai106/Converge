# CONVERGE — Setup

How to run CONVERGE from a fresh clone. Everything here is verified
against the current repo (suite **294/294**, `npm run check` clean,
2026-11-07). Where a step depends on a machine you control, it says
so.

## 1. Requirements

- **Node.js ≥ 22** (`node --version`). The app uses Node's built-in
  `http`, `crypto`, and `WebSocket` — there are **no runtime npm
  dependencies** and no database server.
- `git`, and `npm` (bundled with Node).
- For the browser tests only: Playwright (a devDependency) and its
  Chromium download — see §4.

## 2. From a fresh clone

```bash
git clone https://github.com/Rubai106/accordweave.git
cd accordweave
npm install                  # installs Playwright (devDependency only)
npm test                     # expect 294/294 — see docs/TESTING-REPORT.md
npm run check                # node --check on all server files
PORT=3100 npm start          # http://localhost:3100
```

Port 3000 is the Switch gateway, not the app — the app defaults to
3000 if `PORT` is unset, so set `PORT=3100` whenever the Switch
gateway occupies 3000.

Open `http://localhost:3100`. The three seeded demo cases are there:
**HAG-014** (HAGGLE), **CRT-007** (COURT), **COR-003**
(CORRECTION). The data file is `data/converge.json`, created on
first run and gitignored. Delete it to re-seed.

**Do not run `npm test` against the production data file.** Every
test seeds isolated data in a temp dir and spawns its server with
`CONVERGE_DATA_FILE` set to that temp file; the suite never reads or
writes the repo's `data/converge.json`. See `docs/TESTING-REPORT.md`.

## 3. The two modes

### SIMULATED-STUB (default — no Switch server)

Just `npm start` with `SWITCH_BASE_URL` unset. The room is a labelled
stub transcript, not Switch. Every stub surface says SIMULATED. This
is the mode for trying the app and running the demo without a Switch
stack. The multi-party room work — the thing the hackathon is about —
has no substitute in the stub: without the room there is no shared
decision, only a single-user calculator.

### REAL-SWITCH (live Switch + Mattermost)

Run the Switch stack first (see §5), then start the app with:

```bash
SWITCH_BASE_URL=http://localhost:8000 \
SWITCH_API_KEY=<agent-key> \
SWITCH_AGENT_ID=<agent-id> \
SWITCH_BRIDGE_ID=<bridge-id> \
PORT=3100 npm start
```

Verify: `GET /api/status` → `switchMode: REAL-SWITCH`,
`switchHealth: { ok: true }`. The mode pill in the UI is
health-derived — if the probe fails it reads `SWITCH-UNREACHABLE`,
never a false LIVE.

The app server reads the live room timeline with `read_context` and
merges it with app-stored messages in the drawer (`live: true`). The
agent runtime (see §6) is a separate process.

## 4. Browser tests (Windows and Linux)

Five test files drive a real browser (GAP-2 journey, NEW-1 deep
links, staleness refresh, UX polish journey, visual polish journey)
plus the dark-redesign journey. They use the `playwright` package,
which finds its own Chromium per OS — no paths to edit, no manual
`npm start` before `npm test`.

One-time setup, same command on Windows (PowerShell/CMD) and Linux:

```bash
npm install
npx playwright install chromium
```

`npx playwright install chromium` downloads the Chromium build that
matches the pinned Playwright version (`playwright@1.64.1`, see
`package-lock.json`) into Playwright's per-user cache
(`%USERPROFILE%\AppData\Local\ms-playwright` on Windows,
`~/.cache/ms-playwright` on Linux). If it is already installed, the
command is a no-op. On Linux, Playwright may also need system
libraries — run `npx playwright install-deps chromium` (needs sudo)
if the browser fails to launch with a missing-library error. On
Windows, no extra step is needed beyond the download.

## 5. The Switch stack — two paths

### A. Official path: Docker Compose (on a Docker-capable machine)

The official self-host deployment is
`docker compose --profile collab --profile gateway` from the
`switch-v0.31.0` tag of `sandbox-quantum/switch` (see
`docs/switch-deployment.md`). It starts switch-core 0.31.0, the
gateway, Postgres 16, and Mattermost 11.9.0. **Docker Compose is NOT
running on this VM** — the sandbox blocks containers (runc setns
denied). Do not claim otherwise.

### B. Sandbox workaround: native processes (what actually runs here)

On this VM the published images' code runs natively as host
processes with the Compose env — same software, same versions, same
ports. Full record + restart procedure:
`docs/switch-live-integration.md`. Evidence:
`submission/evidence/switch-live/`. This is a workaround for a
sandbox restriction, not the official deployment. If you have a
Docker-capable machine, use path A.

**Restart order matters:** Postgres → Mattermost → switch-core →
gateway → app. Starting switch-core before Mattermost is up crashes
its bridge at startup and it never recovers itself — messages posted
while the bridge is down are never backfilled.

### Connecting the app to a real server

1. `GET /health` on the server address → `{"status":"ok"}`.
2. Create a registration key in the Gateway → `POST /agents`
   (capture `{id, api_key}` — returned once) → `GET
   /agents/{id}/ops` to read the live operation schemas. The live
   connection is the WebSocket `/agents/{id}/connection/ws`; the
   SSE compatibility path is `GET
   /agents/{id}/events?connection_id=<uuid>` with a
   `POST /agents/{id}/connection/beat` tick every 2s. Room messages
   are not pushed on the stream; the agent reads them from the room
   timeline via `read_context`.
3. Run CONVERGE with the env vars in §7 and verify `/api/status`.

## 6. The agent runtime (separate process)

The runtime is a second process — it is **not** started by
`npm start`:

```bash
node server/agent-runtime.js
```

Environment (in addition to the Switch vars in §7):

| Variable | Default | Meaning |
|---|---|---|
| `SWITCH_BASE_URL` | `http://localhost:8000` | Switch core API |
| `SWITCH_AGENT_ID` / `SWITCH_API_KEY` | — | Agent credentials (or `CONVERGE_AGENT_CREDENTIALS_FILE`, default `~/workspace/switch-server/.converge-agent.json`) |
| `CONVERGE_ROOMS` | the three case rooms | Comma-separated room ids to subscribe to |
| `CONVERGE_DATA_FILE` | repo `data/converge.json` | Read-only; the runtime never writes the store |
| `CONVERGE_LLM_*` | — | See §7; unset = observe-only, no drafts |

SIGINT/SIGTERM stop it cleanly. Full detail:
`docs/AGENT-RUNTIME.md`.

**As of 2026-11-07 the runtime process is not running in
production** — the code is complete and tested (58 tests), but
starting the process is a remaining step. The app server :3100 runs
the new code; the runtime must be started separately.

## 7. Environment variables

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | 3000 | App port — set 3100 when the Switch gateway occupies 3000 |
| `SWITCH_BASE_URL` | unset | Real Switch core API. Unset = SIMULATED-STUB |
| `SWITCH_API_KEY` | — | Real agent key (returned once by `POST /agents`). Never commit it |
| `SWITCH_AGENT_ID` | — | Real agent id |
| `SWITCH_BRIDGE_ID` | first active bridge | Bridge id for room creation |
| `CONVERGE_DATA_FILE` | repo `data/converge.json` | Store path (tests set this to a temp file) |
| `CONVERGE_LLM_PROVIDER` | unset | `openai` (OpenAI-compatible) or `mock` (tests/dev only) |
| `CONVERGE_LLM_API_KEY` | — | Provider key. Never commit it |
| `CONVERGE_LLM_BASE_URL` | `https://api.openai.com/v1` | Provider endpoint |
| `CONVERGE_LLM_MODEL` | `gpt-4o-mini` | Model name |

**Note:** `.env.example` in the repo lists the Switch variables but
does not yet list the `CONVERGE_LLM_*` variables — the LLM variables
are documented here and in `docs/AGENT-RUNTIME.md`. Copy
`.env.example` to `.env` when you need a real Switch server; never
commit `.env`.

**Ports are deployment-specific and come from the environment, not
the code.** On this VM the Switch stack is gateway 3000 / core API
8000 / Mattermost 8065 / Postgres 5432. On Rubai's Windows PC the
same services run on 60911–60914 (gateway 60911, API 60912,
Mattermost 60913, Postgres 60914). Point `SWITCH_BASE_URL` at the
core API port for the machine you are on, and `PORT` at a free port
for the app.

## 8. The session-token flow (what a user actually does)

Nothing to configure. On boot the client POSTs `/api/session` and
receives a token (24h, server-side). The client sends it as
`X-Converge-Session` on every POST. If the token is missing, invalid,
or expired, POSTs return 401 and the client re-issues once and
retries. The demo identity is fixed — `Mara · Owner` — and is shown
in the UI as the demo identity, not as a signed-in user. There is no
login screen and no per-user auth (see `docs/SECURITY.md`).

## 9. Troubleshooting

- **App shows SIMULATED-STUB:** `SWITCH_BASE_URL` is unset, or the
  health probe failed — check `/api/status`; the pill reads
  `SWITCH-UNREACHABLE` when the server is down.
- **POSTs return 401:** the session expired or the server restarted
  (sessions are in-memory). Reload the page — the client re-issues
  the token on boot.
- **POSTs return 429:** the per-IP rate limit (5 session issuances or
  60 POSTs per minute). Wait a minute.
- **Drawer shows no live messages:** the room timeline comes from
  `read_context`; check the Switch stack is up (`GET /health` →
  200, `/health/ready` → 7/7) and that the bridge is active. If the
  stack was restarted in the wrong order, restart switch-core after
  Mattermost is up.
- **Tests fail on a fresh clone:** run `npm install` first, then
  `npx playwright install chromium` for the browser tests. The suite
  needs no server running and never reads `data/converge.json`.
- **A VM replacement wiped the stack:** the data directory survives
  under `~/workspace/switch-server/pgdata`; restart per
  `docs/switch-live-integration.md` §Restarting — do not rebuild.
