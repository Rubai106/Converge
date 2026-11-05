# CONVERGE — PROGRESS.md

## Current stage (2026-11-05, ~22:53 Dhaka)
Working v0.1.0: shared decision engine + HAGGLE end-to-end + COURT and CORRECTION slices + Switch protocol client + labelled stub + premium Direction B UI. Tests 12/12, `npm run check` passes, server verified live on localhost:3000 (`/api/status`, `/api/cases/HAG-014`, COURT tally, CORRECTION persistence). First push to the official repo verified (see below). Docker Engine install in progress for the genuine headless Switch deployment.

## Completed
- Switch protocol verified live (docs + repo): Console 0.40.1 / core 0.31.0, WebSocket + HTTP ops, POST /agents, GET /ops, GET /health. Correction: SSE is legacy only, not the protocol. Notes in docs/switch-protocol-notes.md.
- Competitor validation (docs/competitor-validation.md): HAGGLE most crowded, COURT strongest, CORRECTION split. Sofra + Happi Happi NOT FOUND — removed from pitch. HeyMato mischaracterised — corrected. Cupi chat flow unverified — not cited.
- UI/UX: 3 distinct directions + prototypes in docs/ui-directions/ (A Editorial, B Operations, C Spatial). **Direction B selected and built** (user viewed B and asked for more premium; premium operations workspace implemented in the app, commit 5aaa8ba), borrowing A's evidence discipline for Decision/Audit views.
- Shared engine (server/engine.js): validated state machine (DRAFT→…→APPROVED→COMPLETED), human-only approval gate, deterministic HAGGLE maths, COURT conflict + blind tally, CORRECTION rule-based claim extraction + statuses.
- HAGGLE: analysis + 6 priced strategies, demo case HAG-014 (DairyCo cream $0.16→$0.24, +$0.48/serving, +$76.80/mo, counter $0.19 saves $48/mo).
- COURT: CRT-007 ragù, 3 versions, conflict table (salt/fat/simmer conflict, tomato agrees).
- CORRECTION: COR-003 Osei episode, 3 factual claims extracted, opinion separated; claim statuses and guest challenges now persist server-side and are audited (commit 3eaa59e).
- Switch client + stub (server/switch-client.js, stub-switch.js): protocol-shaped, labelled SIMULATED everywhere.
- Tests: 12/12 (8 engine + 4 server persistence tests in tests/engine.test.js and tests/server.test.js).

## Pending
- Genuine Switch deployment on THIS VM (headless Docker Compose, `switch-v0.31.0`, profiles `collab` + `gateway`). Docker Engine install in progress since ~22:25 Dhaka; bottleneck is a very slow apt mirror (cogentco), log at /tmp/docker-install.log. **No laptop setup from Rubai — that path is retired.** Needs after Docker: `docker compose up -d`, `GET /health` evidence, agent registration, real HAGGLE room in Mattermost.
- Wispr voice log: entries only as Rubai dictates; genuine Insights screenshot at submission (never fake).
- Demo video (3-min HAGGLE arc + COURT/CORRECTION slices), final screenshots, submission pack.
- GitHub sync: repo Rubai106/accordweave is canonical (main). Sync via the connector snapshot push (see "GitHub sync strategy" below); the 7 PNG screenshots still await a binary-capable upload route.

## Known problems
- Server runs in SIMULATED-STUB mode here. Do not present stub transcripts as Switch rooms.
- UI prototype HAGGLE numbers used monthly = weekly×52/12 ($83.20/mo, $998/yr); app engine uses monthlySales=160 explicitly ($76.80/mo, $921.60/yr). Engine is the source of truth; prototype numbers are research, not app data.
- Node global WebSocket takes no headers argument — production Switch client needs a WS library supporting Authorization: Bearer. Recorded in switch-client.js, not hidden.
- Per-operation JSON payload shapes unverified (must come from live GET /ops).

## Technical decisions
- Node 24, zero npm dependencies (npm registry reachable, but zero-dep keeps the demo reproducible in the sandbox and on a laptop). JSON file store, not PostgreSQL — justified for a 2-day demo; schema in README §7 maps to Postgres tables if scaled.
- Deterministic maths in engine.js only; LLM/agents never invent financial numbers.
- One shared engine for all three workflows; agents are roles + instructions, not separate apps.

## 2026-11-05 ~22:35 Dhaka — premium UI + persistence hardening
- Premium Direction B UI built (commit 5aaa8ba): sidebar + KPI strip + dense tables, HAGGLE bullet graph, proposals recompute, two-step approval, COURT matrix + heat table, CORRECTION claims table. Verified: npm test 8/8 then, screenshots read clean (dashboard, HAGGLE, COURT, CORRECTION).
- Persistence fix (commit 3eaa59e, tests now 12/12): COURT ratings are server-held (seeded 9 ratings, POST /api/court/rate with 1-5 validation + duplicate 409, tally revealed only when all readers submitted); CORRECTION claim statuses + guest challenges persist in the store and are audited (agents still blocked from changing statuses). UI now reads both from the server; the "session-held" caveats are gone. Store migrates old data files (backfills missing fields, never overwrites recorded data). Demo data reset to pristine after verification.
- Docker: official install restarted with logging (/tmp/docker-install.log) after the first attempt stalled on a very slow apt update (~90s per update). Still installing at 22:40 — apt is on the Docker repo update. Switch deployment notes in docs/switch-deployment.md (correct page: docs.switchagents.ai/switch-rooms/deploy/self-host; Compose ghcr.io/sandbox-quantum/standalone-compose:0.31.0; profiles collab+gateway; ports 3000/8000/8065/5432).

## 2026-11-05 ~22:47 Dhaka — official repo accordweave, first push VERIFIED
- Official repo: https://github.com/Rubai106/accordweave (public, main). Local
  `~/workspace/converge/` connected as remote `origin`.
- `git push` over HTTPS cannot authenticate from this VM (no credential
  helper; "could not read Username for 'https://github.com'"). Push was done
  via the GitHub connector's snapshot push (`push_files`), approved by Rubai
  on the write card. GitHub main head: **a50f5a7** "CONVERGE v0.1.0
  foundation..." (contents = local commit 33cb894). A provider "Initial
  commit" (bb84ed0) sits underneath it; our README replaced the generated one.
  Local git history is NOT mirrored on GitHub — only file contents. Future
  pushes use the same snapshot procedure; sync record kept at
  `~/workspace/converge.muse-github-snapshot-sync.json` (28 paths).
- NOT on GitHub yet: the 7 PNG screenshots in submission/screenshots/
  (binary files are rejected by snapshot validation). They stay local until
  a binary-capable route is available (git push from a credentialed machine,
  or GitHub web upload). Do not claim they are on the repo.
- Audit before push: tests 12/12, `npm run check` clean, live smoke test
  (status SIMULATED-STUB, HAG-014 +$76.80/mo, CRT-007 tally 4.67). Added
  .gitignore (data/, .env, node_modules), .env.example (placeholders only),
  submission/wispr/README.md (genuine-scorecard instruction, no fabrication).
  README updated: tests 12/12, premium Direction B UI live, Switch status
  reflects the in-progress headless Docker deployment.

## GitHub sync strategy (from 2026-11-05)
- Canonical repo: Rubai106/accordweave, branch main. Local `~/workspace/converge/`
  is the working copy; remote `origin` is set but plain `git push` over HTTPS
  cannot authenticate from this VM (no credential helper).
- Sync route: the GitHub connector snapshot push (`push_files`) with Rubai's
  approval on the write card. Each sync is a new commit ON TOP of the current
  remote head — never force-push, never reset main, never rewrite history.
  Local git history is not mirrored on GitHub (only file contents); the
  snapshot commit message matches the local commit it carries.
- Sync record: `~/workspace/converge.muse-github-snapshot-sync.json` (sibling
  of the source dir, never inside the repo). Update it after every confirmed
  snapshot push with the new commit SHA and submitted paths.
- Before every sync: `npm test` (12/12), `npm run check`, live smoke test.
  After every sync: verify via the public GitHub API (commits list + root
  contents) and record the new head SHA here.
- Binary files (PNG screenshots) CANNOT go through this route: `push_files`
  validates UTF-8 and rejects binaries; `create_or_update_file` takes text
  only ("Do not base64-encode it"); the MCP catalogue (49 tools) contains no
  `create_blob` / `create_tree` / `create_commit` / `update_ref`. Binary
  upload stays blocked until a credentialed `git push` or the GitHub web
  upload is available. Screenshots are organized in
  `submission/screenshots/README.md` (4 premium submission assets, 3 archived
  temp-UI shots) and ready to upload the moment a route opens.

## Switch deployment status — four things, kept separate
- Protocol verified: yes, from official docs + repo (Console 0.40.1 /
  core 0.31.0, WebSocket + HTTP ops, POST /agents, GET /ops, GET /health).
  NOT yet verified against a live server; per-op JSON shapes still unknown.
- Deployment attempt: in progress on this VM — Docker Engine install
  (official Docker Ubuntu repo) since ~22:25 Dhaka, then official Compose
  stack `switch-v0.31.0` with profiles collab + gateway and bundled
  Mattermost. Bottleneck: slow apt mirror. No user laptop involvement.
- Demo today: SIMULATED-STUB only, every transcript captioned as simulated.
- Live integration: NOT achieved. No real server, no real Mattermost room,
  no real agent registration, no real HAGGLE room message yet.
