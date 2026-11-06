# CONVERGE — PROGRESS.md

## Current stage (2026-11-06, ~02:55 Dhaka)
REAL-SWITCH LIVE (rebuilt after a VM replacement — see below): switch-core 0.31.0 + Mattermost 11.9.0 running on this machine; agent converge-facilitator re-registered (new id); 53 live ops; 3 real rooms recreated (same names, new ids); HAGGLE approval preserved in CONVERGE's audit trail with a record note in the fresh room; bridge re-verified live. Tests **33/33**, `npm run check` passes. Night hardening pass complete (COURT server-side blindness, XSS review, security checks, LOW-nit fixes, docs, evidence package pending). See "2026-11-06 — night hardening" below.

## Completed
- Switch protocol verified LIVE (2026-11-06, real server): Console 0.40.1 / core 0.31.0, **WebSocket is the live connection; this client uses the SSE compatibility path with a `POST /connection/beat` tick every 2s (TTL 6s)** + per-agent HTTP ops (`GET /agents/{id}/ops`, `POST /agents/{id}/ops/{name}`), `POST /agents`, `GET /health`. Room messages are not pushed on the stream — the agent reads them from the room timeline via `read_context`. Notes in docs/switch-protocol-notes.md (live-corrections banner) and docs/switch-live-integration.md.
- Competitor validation (docs/competitor-validation.md): HAGGLE most crowded, COURT strongest, CORRECTION split. Sofra + Happi Happi NOT FOUND — removed from pitch. HeyMato mischaracterised — corrected. Cupi chat flow unverified — not cited.
- UI/UX: 3 distinct directions + prototypes in docs/ui-directions/ (A Editorial, B Operations, C Spatial). **Direction B selected and built** (user viewed B and asked for more premium; premium operations workspace implemented in the app, commit 5aaa8ba), borrowing A's evidence discipline for Decision/Audit views.
- Shared engine (server/engine.js): validated state machine (DRAFT→…→APPROVED→COMPLETED), human-only approval gate, deterministic HAGGLE maths, COURT conflict + blind tally, CORRECTION rule-based claim extraction + statuses.
- HAGGLE: analysis + 6 priced strategies, demo case HAG-014 (DairyCo cream $0.16→$0.24, +$0.48/serving, +$76.80/mo, counter $0.19 saves $48/mo).
- COURT: CRT-007 ragù, 3 versions, conflict table (salt/fat/simmer conflict, tomato agrees).
- CORRECTION: COR-003 Osei episode, 3 factual claims extracted, opinion separated; claim statuses and guest challenges now persist server-side and are audited (commit 3eaa59e).
- Switch client + stub (server/switch-client.js, stub-switch.js): protocol-shaped, labelled SIMULATED everywhere.
- Tests: 20/20 (8 engine + 4 server persistence + 8 Switch-client tests in tests/engine.test.js, tests/server.test.js, tests/switch-client.test.js).

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
- Before every sync: `npm test` (20/20), `npm run check`, live smoke test.
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
  current stage, UI selection, test count (20/20), CORRECTION claim count
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
- **Tests 20/20** (12 existing + 8 new Switch-client tests incl. per-agent URL/header checks and the 53-op catalogue). `npm run check` clean.

## 2026-11-06 ~00:05 Dhaka — third sync (ac9caef)
- Snapshot push ac9caef on top of 4e72071 (history preserved). 35 files,
  incl. docs/switch-live-integration.md, submission/evidence/switch-live/
  (4 files), tests/switch-client.test.js. Verified via public API (commit
  list) and by reading rooms-and-messages.md back from GitHub at the new
  head. Sync record now has 3 entries.

## 2026-11-06 ~00:10–00:20 Dhaka — final verification pass (Rubai's decision)
- **Decision accepted:** native-process deployment is the real integration; no more runc/Compose attempts. Docs corrected to the observed behaviour (see below); security hardened to loopback-only.
- **Security:** all services now bind 127.0.0.1 only (switch-core SERVER_HOST, Mattermost LISTENADDRESS, nginx listen, app listen; Postgres already loopback). Verified with `ss -tlnp`. VM has no public interface (lo + CGNAT host0 only).
- **Bridge outage found and fixed:** after a switch-core-first restart the Mattermost bridge crashed at startup (login before Mattermost was up) and never recovered — human messages posted during the outage were never ingested into Switch and were NOT backfilled. Restarting switch-core after Mattermost restored ingestion (verified: fresh marker message in `read_context` within 10s). Restart order is now Mattermost → switch-core, documented in docs/switch-live-integration.md.
- **How the agent receives human messages (corrected):** NOT via the event stream (connection/subscription events only) and NOT via the long-poll buffer (room_join only). Human messages are ingested by the bridge into Switch's room timeline; the agent reads them with `read_context`. Verified: owner's HAGGLE approval is in the HAG-014 timeline; fresh marker ingested post-restart.
- **Transport corrected (second look):** the live connection IS the WebSocket at `/agents/{id}/connection/ws`; SSE is the pre-revision-7 compatibility path. An SSE client must tick `POST /agents/{id}/connection/beat` every 2s (TTL 6s) or be evicted with `heartbeat_lapsed` — verified (unbeaten stream evicted, beaten stream alive 20s+). `openEventStream` now beats automatically; new test covers it.
- **Human-only approval gate re-verified live:** agent approval attempt on a synthetic AWAITING_APPROVAL case → rejected "Only a human may approve a case"; human approval → allowed. (Live API attempt on CRT-007 returned 400 for the invalid DISCUSSION → APPROVED transition; the gate itself is proven by engine.js:33-35 + tests/engine.test.js:42.)
- **Health re-verified after all restarts:** /health 200 {"status":"ok"}, /health/ready all healthy incl. bridges; app REAL-SWITCH, /api/switch/rooms lists all 3 real rooms; HAGGLE room read back from Mattermost (8 posts, full arc intact).
- **Tests 20/20** (12 existing + 8 Switch-client incl. the new beat test). `npm run check` clean.
- **Label fix verified:** room drawer + footer are mode-aware — the drawer now shows the teal LIVE banner in REAL-SWITCH mode (re-captured screenshots confirm). Fresh live screenshots (7) + demo video (147.8s webm) captured from the live app.

## 2026-11-06 ~00:21 Dhaka — fourth sync (c4305f5)
- Snapshot push c4305f5 on top of ac9caef (history preserved). 37 files,
  incl. the corrected protocol docs, loopback security section,
  re-verification evidence, live screenshots README + demo script
  (video file itself is binary and stays local — see screenshots README).
  Verified via public API (commit list) and by reading
  docs/switch-live-integration.md back from GitHub at the new head
  (loopback + beat sections present). Sync record now has 4 entries.

## 2026-11-06 ~00:30–01:10 Dhaka — full product QA, visual audit + screenshot delivery (Rubai's brief §1–15)
- **Verdict: PASS with minor limitations — ready for the final demo.** Full report: `submission/qa/QA-REPORT.md`.
- **Suite 26/26 pass, 0 fail, 0 skipped** (21 + 5 ported engine-edge regression tests). `npm run check` clean. API pass: 59 calls, 47 asserted PASS, 0 FAIL. Axe-core: **0 violations on 13 pages** after fixes (baseline was 4–14 contrast nodes/page + 1 label mismatch).
- **Bugs found and fixed (all re-verified live):** H1 stale `pendingApproval` (engine clears on APPROVED/REJECTED + store migration; production HAG-014 now COMPLETED with `pendingApproval: null`, approval + 3 audit events intact); H2 COURT tally not blind in the UI (client-side gating, codes-only samples); H3/H4 contrast (`--faint` 5.46:1, stamp 6.27:1); H5 drawer/modal focus trap + return; H6 rows keyboard-operable; M1 stepper (6 steps); M2 transcript panel; M3 blind rating form; M4 duplicate Participants; M5 amber pills incl. `.switch-pill` (6.26:1); M6 tabs ARIA + arrow keys; M7 drawer-close label; M8 skip link; strategy pill derived from state; room-message audit kind; BUG-1/2 engine validation (finite numbers only, strings coerced, no NaN/Infinity); BUG-3 false-live → `SWITCH-UNREACHABLE` (verified against dead server); BUG-4 stub auto-creates rooms; BUG-5 empty/overlong messages rejected (400); challenge history preserved; **N1 (found in a11y re-run): `#approve-btn` was bound as a strategy row, so keyboard users could not open the approval modal — binding scoped to `tr[data-strategy]`, attribute removed from the button, verified live (Enter/Space/click open, Escape returns focus).**
- **Switch re-verified:** /health ok, /health/ready 7/7 healthy, 53 ops, HAGGLE room 10 threads incl. owner approval + INGEST2 marker, bridge listening since 00:16, agent approval on live AWAITING_APPROVAL case → 400. Restart/reconnect behaviour NOT re-run live (risks the bridge; earlier verification stands).
- **Screenshots: 48 files** in `submission/qa/screenshots/` (42 numbered + 37b + 5 mobile) + 14 responsive captures; ZIP `submission/qa/converge-qa-screenshots.zip` (6.3 MB, integrity-checked). 20 re-captured post-fix (incl. hidden-tally, transcript panel, members panel, REAL-SWITCH status clip). **PNGs/ZIP are NOT on GitHub** (binary upload blocked from this VM) — delivered as conversation attachments.
- **Remaining limitations (honest):** COURT API payload still carries the sample mapping (true blindness needs server-side withholding); drawer shows only app-stored messages; agents may REJECT / set claims Unresolved by design; `POST /api/court/tally` open compute endpoint; no server-side search; no real usability sessions yet.
- **QA tooling added:** `scripts/qa-capture.py`, `scripts/qa-capture-2.py` (Playwright capture), `scripts/qa-seed.mjs` (QA data seeding — refuses the production data file). QA instance `~/workspace/converge-qa/` (disposable). Findings in `~/workspace/converge-qa-findings/` (`a11y.md`, `a11y-rerun.md`, `api-tests.md`, `recapture.md`).

## 2026-11-06 ~01:12 Dhaka — fifth sync (1a8cc21)
- Snapshot push 1a8cc21 on top of c4305f5 (history preserved). 43 text files,
  incl. all QA fixes, the 5 ported regression tests, QA capture/seed scripts,
  and `submission/qa/QA-REPORT.md` + capture log. Verified via public API
  (commit list) and by reading QA-REPORT.md back at the new head (36,380
  bytes). Screenshots (PNG) and the ZIP stay local — binary upload remains
  blocked; they are delivered to Rubai as conversation attachments.
  Sync record now has 5 entries.

## 2026-11-06 ~02:10–02:55 Dhaka — night hardening + release prep
- **Permissions:** Rubai approved everything in one consolidated request (incl. a Switch restart if needed) before sleeping. Standing rules held: main branch, QA env for destructive tests, HAG-014 history untouched, no force-push, no submission on his behalf, no credentials exposed. Work log: `NIGHT-WORK-LOG.md`.
- **COURT server-side blindness (was QA §12.1):** `server/server.js` — incomplete COURT cases return code-only samples on both case endpoints; `POST /api/court/tally` is case-bound and gated (caller ratings ignored). `app/app.js` — `COURT_DEMO` seed no longer carries the mapping or scores; heat-table Mean column hidden until complete (it WAS the tally, per-code); zero-rating empty state renders cleanly. Tests +3 (withholding, tally bypass rejected, completion reveals mapping + tally). Suite **29/29** at that point. Verified live on QA (CRT-QA 4/9 code-only; CRT-007 9/9 mapping + 4.67) and a scratch zero-rating case. Shots: `submission/qa/blindness-qa-court.png`, `blindness-empty-state.png`.
- **VM replacement + Switch rebuild (~02:17):** VM replaced overnight (uptime 45 min); whole stack down, /tmp wiped, `~/workspace` intact. Rebuilt per the documented procedure: postgres-16 + nginx reinstalled, DBs/roles recreated (`switch-server/rebuild-db.sh` — psql `:var` does NOT interpolate in `-c` on this build; SQL via stdin), Mattermost before switch-core, gateway, setup re-run. New bridge `ee7d9b4e-815d-4bd2-84a1-1a82d095667d`, new agent `1935ede7-afc2-4294-b4c6-5058e664be22` (53 ops), rooms recreated (same names, new ids). Bridge re-verified live (human marker ingested ~5s). **Lost:** first stack's Switch-side room timelines (incl. the original 10-thread approval arc) — unrecoverable. **Survived:** CONVERGE's record (HAG-014 COMPLETED, approval + audit + stored messages) + evidence files; fresh #haggle-dairyco carries a record note (approval NOT re-staged). Real env now at `~/workspace/switch-server/.converge-real.env` (survives replacements). Loopback binding re-verified.
- **XSS review:** static review complete (all user-controlled interpolations through `esc()`; no href/src surface; `money()`/`pct()` coerce via `Number()`). **Live payload probe BLOCKED by a platform safety filter, not retried** — recorded as an open limitation; QA data verified clean. Executable backstop: `tests/escaping.test.js` (4 tests, extracts the shipped `esc()`). Suite **33/33**.
- **Other security checks:** state machine + human-only gates re-checked; input validation re-checked; secret scan of tracked files clean; no key logging; no stack traces (malformed JSON → 500 parse message only, server stays up). Known limitation: the local app has no authentication (loopback-only demo).
- **LOW nits fixed:** mobile search full-width row at ≤480px (was 140px, truncated); drawer LIVE label #0e7c6b → #0A5C50 (4.52:1 → 6.98:1). Verified live + axe 0 on both views. Shots: `submission/qa/nit-mobile-search.png`, `nit-live-label.png`. Documented as-is: sparse Decisions/Workflows, duplicate headings, drawer empty space, row accent.
- **Docs updated:** README (33/33, stub-log wording, rebuild note), setup-guide + demo-script (19/19 → 33/33), submission-checklist (33/33, 5 syncs, 48 QA screenshots), switch-live-integration (rebuild record; corrected "re-registration is not needed"), rooms-and-messages (0.0.0.0 → 127.0.0.1 + addendum), QA-REPORT addendum.
- **Remaining limitations (honest):** no live XSS probe; no real usability sessions; first stack's Switch-side room timelines lost (CONVERGE-side record survives).
