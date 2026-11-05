# CONVERGE — Setup guide

## Requirements
- Node.js >= 22 (`node --version`)
- No npm dependencies, no database server, no Docker needed for the demo build.
- For a REAL Switch run: Docker + Switch Console 0.40.1 on a laptop
  (see `docs/switch-protocol-notes.md` §4). This repo's demo runs in
  SIMULATED-STUB mode unless `SWITCH_BASE_URL` is set.

## Run the demo
```
git clone <repo-url>   # repo to be created — see submission-checklist.md
cd converge
npm test               # expect 8/8
npm run check          # node --check on server files
PORT=3000 npm start
# open http://localhost:3000
```

## Real Switch (on a Docker-capable laptop)
1. Install Docker and start the daemon.
2. Install Switch Console 0.40.1 (Windows .exe/.msi, macOS .dmg, Linux .AppImage/.deb).
3. Open Console; let it run a server (starts the Docker stack + bundled Mattermost).
4. Connect a coding agent (Claude Code / Codex / OpenCode / Cursor / Antigravity).
5. Give switch-buddy its first task; create a room in Console (or add an agent bot
   to a Mattermost channel — that creates the room).
6. Verify the agent answers in Mattermost.
7. Only then, for the CONVERGE agent: `GET /health` on the server address →
   create a registration key in the Gateway → `POST /agents` (capture
   `{id, api_key}` — returned once) → open WebSocket `/agents/{id}/events` →
   `GET /ops` to read live operation schemas.
8. Run CONVERGE with:
```
SWITCH_BASE_URL=http://<your-switch-server>:8000 SWITCH_API_KEY=<agent-key> npm start
```

## Environment variables
- `PORT` (default 3000)
- `SWITCH_BASE_URL` (unset = SIMULATED-STUB)
- `SWITCH_API_KEY` (real agent key; never commit it)

## Demo data
Seeded fictional cases in `data/converge.json` (created on first run):
HAG-014 (HAGGLE), CRT-007 (COURT), COR-003 (CORRECTION). Delete the file to re-seed.
