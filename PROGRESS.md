# CONVERGE — PROGRESS.md

## Current stage (2026-11-06, ~00:00 Dhaka)
REAL-SWITCH LIVE: switch-core 0.31.0 + Mattermost 11.9.0 running on this machine; agent converge-facilitator registered; 53 live ops; 3 real rooms; HAGGLE approval completed end to end in the real room; CONVERGE app wired to the real server (REAL-SWITCH mode, /api/status health ok). Tests 19/19, `npm run check` passes. See "2026-11-06 — real Switch integration" below.

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
- Demo video (3-min HAGGLE arc + COURT/CORRECTION slices) — script exists (submission/demo-script.md); record against the live rooms.
- Wispr voice log: entries only as Rubai dictates; genuine Insights screenshot at submission (never fake).
- GitHub sync: repo Rubai106/accordweave is canonical (main). Sync via the connector snapshot push (see "GitHub sync strategy" below); the 7 PNG screenshots still await a binary-capable upload route.

## Known problems
- The app runs in REAL-SWITCH mode when SWITCH_BASE_URL/API key/agent id are set, and in SIMULATED-STUB mode otherwise. The stub is still shipped as the fallback — do not present stub transcripts as Switch rooms.
- UI prototype HAGGLE numbers used monthly = weekly×52/12 ($83.20/mo, $998/yr); app engine uses monthlySales=160 explicitly ($76.80/mo, $921.60/yr). Engine is the source of truth; prototype numbers are research, not app data.
- Node global WebSocket takes no headers argument, so the live client uses the SSE event stream (verified live). The old "needs a WS library" note is superseded — see switch-client.js.
- The live Switch stack runs natively (not in containers) because the sandbox denies runc setns; a VM replacement wipes Docker/Postgres/nginx and the stack must be rebuilt from ~/workspace/switch-server/ (see docs/switch-live-integration.md §Restarting). The agent id/key and bridge id survive in ~/workspace, so re-registration is not needed.

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

## 2026-11-05 ~22:53 Dhaka — second sync + screenshot/binary investigation
- Investigated the Git Data API binary route as requested: the GitHub MCP
  catalogue has 49 tools and NONE of `create_blob` / `create_tree` /
  `create_commit` / `update_ref`. `create_or_update_file` takes text only
  ("Do not base64-encode it; this server does that before calling the REST
  API") and `push_files` validates UTF-8 and rejects binaries. Direct REST
  calls would need a token we do not have and must not invent. Conclusion:
  binary upload is genuinely blocked from this VM until a credentialed
  `git push` or the GitHub web upload is available. Nothing was fabricated
  to work around it.
- Screenshots organized: 4 premium submission assets at
  submission/screenshots/ (dashboard, HAGGLE, COURT, CORRECTION); 3 temp-UI
  shots moved to submission/screenshots/archive/temp-ui-2026-11-05/.
  submission/screenshots/README.md documents both + the GitHub status.
- README/PROGRESS/checklist inconsistencies fixed: README now has a Switch
  status table (protocol verified / deployment in progress / stub today /
  live integration not yet), the laptop run sheet is marked superseded,
  screenshot references no longer imply GitHub-hosted images; PROGRESS.md
  current stage, UI selection, test count (12/12), CORRECTION claim count
  (3) and the stale laptop/GitHub-pending items corrected.
- Second sync VERIFIED: snapshot push 4e72071 on top of a50f5a7 (history
  preserved, no force-push). 29 files. Verified via public API (commit list)
  and by reading submission/screenshots/README.md back from GitHub at the
  new head. Sync record now has 2 entries.

## 2026-11-06 ~00:00 Dhaka — REAL Switch integration (live)
- **GET /health → 200 {"status":"ok"}; /health/ready → 200, all 7 checks healthy.** Real switch-core 0.31.0 + Mattermost 11.9.0 + gateway on this machine. Deployment record: docs/switch-live-integration.md. Evidence: submission/evidence/switch-live/ (health.json, health-ready.json, ops-summary.json, rooms-and-messages.md).
- **Docker Compose path BLOCKED by the sandbox, worked around honestly:** dead apt mirror fixed (cogentco removed); Docker 29.9.3 installed but dockerd has no NET_ADMIN (no iptables/bridge); Go registry clients time out (Python OCI puller fetched all 5 images); containers cannot start at all (runc setns EPERM). The published images' code runs natively as host processes with the Compose env — same software, versions, ports. A VM replacement wiped Docker once mid-work; everything rebuildable is under ~/workspace/switch-server/.
- **Agent registered live:** converge-facilitator, id de9ceb8a-510c-4eef-9a31-c2094c346a12 (POST /agents → 200). **53 live ops** from GET /agents/{id}/ops. Protocol corrections verified: ops are per-agent, event stream is SSE with client-generated connection_id, post_message needs connect_to_room first, /healthz needs auth (401).
- **Mattermost bridge active** (bcdd5c54…, default). **3 real rooms** in team switch: #haggle-dairyco, #recipe-ragu, #episode-osei — all verified from the Mattermost API.
- **HAGGLE approval end to end in the real room:** agent analysis (event sw_4bccf918…) → owner approval posted in Mattermost → bridge delivered it to the agent's event stream → CONVERGE recorded APPROVED (human Owner, audited) → COMPLETED → confirmation posted back (event sw_6be113d1…). All four messages read back from Mattermost.
- **CONVERGE app wired to the real server:** switch-client.js rewritten to the verified per-agent protocol (SSE stream, correct op paths, fixed agentProfile mediation arrays); server.js /api/switch/* use the live server when configured (rooms created on first post, ids persisted on cases); UI captions are mode-aware (REAL-SWITCH vs SIMULATED-STUB). App runs on :3100 with REAL-SWITCH mode; /api/status health {ok:true, status:200}; /api/switch/rooms lists the 3 real rooms. COURT post (sw_2cf273c1…) and CORRECTION post (sw_288dce6a…) went through the app and landed in Mattermost.
- **Tests 19/19** (12 existing + 7 new switch-client tests incl. per-agent URL/header checks and the 53-op catalogue). `npm run check` clean.
