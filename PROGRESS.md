# CONVERGE — PROGRESS.md

## Current stage (2026-11-05, ~22:30 Dhaka)
Working v0.1.0: shared decision engine + HAGGLE end-to-end + COURT and CORRECTION slices + Switch protocol client + labelled stub + temporary dev UI. Tests 8/8, `npm run check` passes, server verified live on localhost:3000 (`/api/status`, `/api/cases/HAG-014`).

## Completed
- Switch protocol verified live (docs + repo): Console 0.40.1 / core 0.31.0, WebSocket + HTTP ops, POST /agents, GET /ops, GET /health. Correction: SSE is legacy only, not the protocol. Notes in docs/switch-protocol-notes.md.
- Competitor validation (docs/competitor-validation.md): HAGGLE most crowded, COURT strongest, CORRECTION split. Sofra + Happi Happi NOT FOUND — removed from pitch. HeyMato mischaracterised — corrected. Cupi chat flow unverified — not cited.
- UI/UX: 3 distinct directions + prototypes in docs/ui-directions/ (A Editorial, B Operations, C Spatial). Recommendation: B, with A's evidence discipline. **NOT finalised — awaiting Rubai's selection.**
- Shared engine (server/engine.js): validated state machine (DRAFT→…→APPROVED→COMPLETED), human-only approval gate, deterministic HAGGLE maths, COURT conflict + blind tally, CORRECTION rule-based claim extraction + statuses.
- HAGGLE: analysis + 6 priced strategies, demo case HAG-014 (DairyCo cream $0.16→$0.24, +$0.48/serving, +$76.80/mo, counter $0.19 saves $48/mo).
- COURT: CRT-007 ragù, 3 versions, conflict table (salt/fat/simmer conflict, tomato agrees).
- CORRECTION: COR-003 Osei episode, 2 factual claims extracted, opinion separated.
- Switch client + stub (server/switch-client.js, stub-switch.js): protocol-shaped, labelled SIMULATED everywhere.
- Tests: 8/8 in tests/engine.test.js (maths hand-checked, approval gate, conflicts, tally, claims, stub).

## Pending
- Real Switch run on Rubai's Docker-capable laptop (BLOCKED on this VM: no Docker/GUI). Needs: Docker + Console 0.40.1 install, GET /health evidence, room screenshots.
- UI/UX final selection (Rubai) → implement selected direction, replace temporary dev UI.
- Wispr voice log: entries only as Rubai dictates; genuine Insights screenshot at submission (never fake).
- Demo video (3-min HAGGLE arc + COURT/CORRECTION slices), final screenshots, submission pack.
- GitHub repo: no repo exists yet for CONVERGE. Create repo (Rubai106) and push — note: GitHub App write was 403 on PayCheckpoint earlier; verify Contents write before assuming push works.

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
