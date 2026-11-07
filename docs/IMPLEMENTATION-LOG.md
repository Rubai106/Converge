# CONVERGE — Implementation Log (master-prompt window)

A chronological log of the master-prompt work, 2026-11-07. Every
claim here is grounded in a commit, a doc, or a test run listed in
the entry. Where a number was reported by another stream and not
re-verified by the documentation engineer, it is marked
"[reported]" — the documentation engineer was barred from port
3100 and did not re-run the live checks.

## 00:12 Dhaka — the commission

Rubai pasted the "MASTER ENGINEERING, AI AGENT & HACKATHON WINNING
PROMPT": transform CONVERGE into a genuinely functional
collaborative AI decision platform (target 95+/100, aspirational,
never fabricate scores/evidence). Phases: Phase Zero audit first,
then a real agent runtime (WebSocket per docs.switchagents.ai,
verified against the actual 0.31.0 server), a provider-independent
LLM abstraction, specialist roles as internal facilitator
responsibilities, a structured tool registry, a strict human-approval
security boundary, COURT/CORRECTION completion, a UX redesign (dark
charcoal/cyan/lime suggested), and the docs
ARCHITECTURE/SETUP/AGENT-RUNTIME/SECURITY/TESTING-REPORT/
JUDGE-SCORECARD/IMPLEMENTATION-LOG plus a final report answering his
12 questions honestly. "Do not repeatedly ask the user whether you
should continue with ordinary, reversible engineering work."

## 00:13–00:25 Dhaka — Phase Zero audit + seventh VM replacement recovery

- The audit began while production was down: a seventh VM
  replacement (~23:57 Dhaka) had wiped all processes. The stack was
  recovered first (restart, not rebuild): backup taken (inode and
  hash verified, data hash `f3a08d2e…` unchanged), postgres →
  Mattermost → switch-core (`/health/ready` 7/7) → nginx → app.
  Two-way delivery verified live; live drawer 15 messages; HAG-014
  approval intact. Two new recovery lessons recorded: this VM image
  shipped without postgres/nginx installed, and the nginx gateway
  config is a full `nginx.conf` that must replace
  `/etc/nginx/nginx.conf`, not live in `conf.d`. Report:
  `~/workspace/converge-qa-findings/switch-recovery-20261107/
  RECOVERY-REPORT-0016.md`.
- Three parallel read-only audits (server + Switch, client + UX,
  data + security + tests + docs) over the full codebase.
  `npm run check` clean; `npm test` **201/201** at audit time.
- **Result:** `docs/COMPREHENSIVE-AUDIT.md` — **2 Critical, 8 High,
  18 Medium, 25 Low**. The two Critical findings: (C1) no agent
  runtime exists — the facilitator is a registered identity, not an
  agent, with no persistent process, connection, subscription,
  inbound handling, or model; (C2) the human-only approval gate is
  self-asserted (`body.actorKind || 'human'`, defaulting to human)
  with no auth on any endpoint.
- The audit + a prioritised plan (P0/P1/P2) + four decisions were
  presented to Rubai with a single go-ahead option: build P0+P1
  keeping Direction B, or build P0+P1 switching to the dark
  redesign. The dark redesign was flagged as conflicting with his
  personally selected Direction B identity and with the demo video.

## 00:32 Dhaka — full go-ahead

Rubai: **"follow the prompt fuully"** — full go-ahead for the P0/P1
work, approving the dark redesign. The prompt's §13 (dark
charcoal/cyan/lime) governs the UI direction for this window; the
Direction B structure (232px sidebar, KPI strip, case workspace
grid, stepper, tabs) is kept — the redesign is a reskin, not a
layout rebuild.

## ~01:02 Dhaka — Stream 1: agent runtime + LLM abstraction

**Commit `eb479aa`** — "Agent runtime + LLM abstraction (master
prompt Phase 1)". 9 files, +2,347 lines.

- `server/switch-ws.js` (404 lines): WebSocket agent connection
  **verified live against switch-core 0.31.0** (protocol 9,
  ping/pong, `agent.event`/`agent.gap` frames); SSE fallback with
  `Last-Event-ID` resume + beat; frame parsing, dedup, cursor,
  backoff. The verification corrected the docs: the server sends
  `agent.event`/`agent.gap`, not the docs' `message`/`gap`.
- `server/llm.js` (266 lines): provider-independent abstraction
  (`CONVERGE_LLM_*` env); structured-output JSON Schema validation;
  mock provider labelled mock-only; unconfigured key is a
  first-class state, never faked.
- `server/tools.js` (277 lines): read/draft-only registry
  (`read_case`, `read_room_timeline`, `compute_haggle`,
  `draft_proposal`, `draft_court_summary`,
  `draft_correction_assessment`); no approve/adopt/publish tool
  exists by construction; every call audit-logged.
- `server/agent-runtime.js` (509 lines): one long-lived connection
  (`scope=all`, no room claims), cursor + dedup + gap catch-up +
  reconnect/backoff, human-message routing to the facilitator for
  DRAFTS ONLY (never posts, never approves, never holds a human
  session token). Specialist roles are internal prompt lenses, not
  agents.
- `docs/AGENT-RUNTIME.md` (224 lines): architecture, lifecycle, WS
  verification evidence, tool registry, key configuration, no-model
  state.
- **Tests: 58 new** (`tests/switch-ws.test.js` 16,
  `tests/llm.test.js` 16, `tests/tools.test.js` 12,
  `tests/agent-runtime.test.js` 14), all passing. No production data
  touched.

## ~01:11 Dhaka — Stream 2: P0 server core

**Commit `5bcb9c2`** — "P0 server core (2026-11-07): session auth,
atomic save, proposal versioning, derived strategies,
WITHDRAWN/EXPIRED". 20 files, +1,137/−183 lines. Server only;
no `app/` file touched.

- **Atomic save (audit H4):** `save()` writes
  `converge.json.tmp`, fsyncs, renames over the live file; rotating
  backups `converge.json.bak.1/.2/.3`; `load()` validates JSON and
  falls back to the newest valid backup, reseeding only if all are
  corrupt.
- **Session-token auth (audit C2):** `POST /api/session` issues a
  `crypto.randomUUID()` token (24h, server-side, 5/min per IP).
  Every POST requires `X-Converge-Session` → 401 without/invalid/
  expired. The actor for every privileged action comes from the
  stored session; `body.actor` / `body.actorKind` are ignored
  entirely. GETs stay open.
- **Proposal versioning + hash + expiry + idempotency (audit H3):**
  submitting appends `{id, version, strategyId, terms, inputHash,
  contentHash, createdAt, requestedAt}` to `c.proposals`; approval
  stores `{proposalId, version, contentHash}`; approve rejects 400
  on any hash mismatch (tampered record, changed input, missing
  record). `inputHash` = SHA-256 of the canonical JSON of the case
  input + strategy. TTL 7 days: stale proposals expire to `EXPIRED`
  on read/transition with an audit event. A retried approve of the
  same proposal returns the existing approval (200), not 400.
- **Derived strategy prices (audit H5):** counter = midpoint
  (targetPrice, maxApprovedPrice) capped at maxApproved; volume =
  10% off new price; alternative = 25% below new price; gradual =
  min(maxApproved, newPrice); freeze/substitute = old price. All
  strategies carry unitPrice, duration, and a recommendation
  computed from their own figures.
- **WITHDRAWN/EXPIRED (audit M5):** two new terminal states, both
  reachable only from `AWAITING_APPROVAL`. The 11-state machine was
  not rewritten.
- **Also:** body cap 1 MB (413) + 400 on malformed JSON (audit M1);
  rate limiting (5 session issuances/min, 60 POSTs/min per IP, 429);
  security headers (`X-Content-Type-Options: nosniff`, strict CSP);
  `/api/switch/register` removed (audit H8).
- **Tests: 18 new** (`tests/p0-server-core.test.js`) + updates to
  19 existing files (session token on every POST). Full suite green
  for these files.

## ~01:14 Dhaka — Stream 3: dark redesign + P0 client fixes

**Commit `390bae4`** — "Dark redesign + P0 client fixes
(2026-11-07): charcoal/cyan/lime reskin, session auth, derived
terms/timeline, stepper, citations". 11 files, +905/−218 lines.

- **Dark reskin:** foundation `#16191D`, panels `#1F2329`, cyan
  `#22D3EE` (actions, links, live), lime `#A3E635` (positives,
  approvals). Direction B structure kept. All 39 text/background
  pairs meet WCAG AA ≥ 4.5:1 (computed in Node).
- **Session auth:** boot POSTs `/api/session`,
  `X-Converge-Session` on all POSTs, 401 clears and retries once;
  no `body.actor`/`body.actorKind` sent.
- **H6:** `STRATEGY_TERMS` deleted; terms derived from strategy
  unitPrice/duration/unit + case unit (a $4.00/kg case signs in kg).
- **H7:** Negotiation timeline derived from the case; the
  counter-offer row appears only when a proposal is pending or
  approved, with its real terms.
- **M9:** 8-step stepper (INTAKE its own step); terminal states keep
  the last real step from the audit trail + state chip, nothing
  marked current.
- **M10:** direction-aware Move labels + header Advance button for
  early cases.
- **M12:** evidence citations are buttons that jump to + flash the
  evidence row.
- **M11/M13/M14:** honest engine attribution; derived dish/count/
  evidence copy; per-workflow discussion sub-text; the Workflows
  column is "Roles", not "Agents".
- **Lows:** L5 port 3100, L6 clickable Cases crumb, L10 non-finite
  → em dash, L12 CmdK/Ctrl+K, L4 strategy row roles, L14 drawer
  inert + dialog role.
- **CSP:** all 42 inline style attributes removed (utility classes +
  CSSOM-set bullet widths); no inline styles survive in templates.
- **Tests: 16 new** (`tests/dark-redesign.test.js` 11,
  `tests/dark-redesign-journey.test.js` 5, Playwright). Suite
  294/294, `npm run check` clean (per the commit message).

## ~01:19 Dhaka — Integration

**Commit `3e18a86`** — "Integration (2026-11-07): Phase Zero audit
doc + guest-challenge attribution from the case guest". 3 files,
+515/−1.

- `docs/COMPREHENSIVE-AUDIT.md` committed (503 lines).
- **Guest-challenge fix:** a CORRECTION guest challenge's `by` is
  the episode guest participant on the case (Dr Amara Osei
  (guest)), not the session actor operating the UI. The audit event
  still records the session actor. A test asserts it.
- Full suite **294/294**, `npm run check` clean (per the commit
  message; re-verified by the documentation engineer — see below).

## Live verification (production app :3100, new code live)

Measured by the integration stream on the production app with the
new code live [reported — not re-verified by the documentation
engineer, who was barred from port 3100]:

- A POST without a session token returns **401**.
- A POST with a token on an invalid transition returns **400**.
- The room drawer is live: **15 messages** (`live: true`).
- **0 console errors** on the live dark UI.

Re-verified by the documentation engineer in this session (no port
3100 touched): `npm test` → **294 pass, 0 fail, 0 skipped** (55s,
29 files); `npm run check` → clean; per-file test counts sum to
294 (see `docs/TESTING-REPORT.md`); the four commits and their
stats were read from git; the agent runtime process is **not
running** (`ps` shows no `agent-runtime` process) — the runtime
code is complete and tested, but starting the process is a
remaining step.

## Audit findings — disposition

| Finding | Disposition in this window |
|---|---|
| C1 No agent runtime | Fixed — `eb479aa` (runtime + WS + tools + LLM abstraction). The process is not yet running |
| C2 Self-asserted approval gate | Fixed — `5bcb9c2` (session tokens, actor from session) + `390bae4` (client) |
| H1 No LLM | Fixed as an abstraction — `eb479aa`. No live key configured; the live path is unconfigured, never faked |
| H2 No WebSocket | Fixed — `eb479aa` (WS verified live against 0.31.0, SSE fallback) |
| H3 No proposal versioning | Fixed — `5bcb9c2` (version + content hash + expiry + idempotency) |
| H4 Non-atomic persistence | Fixed — `5bcb9c2` (atomic rename + backup rotation + fallback) |
| H5 Hardcoded strategy prices | Fixed — `5bcb9c2` (derived from input + mandate) |
| H6 Hardcoded approval terms | Fixed — `390bae4` (`STRATEGY_TERMS` deleted, terms derived) |
| H7 Fabricated timeline | Fixed — `390bae4` (timeline derived from the case) |
| H8 Register mints credentials | Fixed — `5bcb9c2` (endpoint removed) |
| M1 Unbounded bodies | Fixed — `5bcb9c2` (1 MB cap, 413; 400 on malformed JSON) |
| M2/M3 Reader/agent identity | Partially fixed — session token required on all POSTs; reader identity within the demo is still self-selected |
| M4 Audit hash chain | Deferred — no hash chain |
| M5 No WITHDRAWN/EXPIRED | Fixed — `5bcb9c2` (both states added, terminal, from AWAITING_APPROVAL) |
| M6 Positional claim ids | Deferred — claim ids still positional |
| M7 No live Switch test | Deferred — live verification remains manual |
| M8 No security/negative tests | Fixed in part — `p0-server-core.test.js` adds negative tests for auth, hash mismatch, expiry, replay |
| M9–M16 Client/UX mediums | Fixed — `390bae4` (stepper, Move labels, agent copy, citations, seed copy, dashboard text, contrast, stepper affordance) |
| M17 Headers/rate limiting/CORS | Partially fixed — headers + rate limiting added; no CORS policy set |
| M18 Stale docs | Fixed in this window — this log + ARCHITECTURE/SETUP/SECURITY/TESTING-REPORT/JUDGE-SCORECARD; README §9, setup guide, and positioning §5 counts corrected to 294/294 |
| L1–L25 Lows | Mostly fixed where touched (L4, L5, L6, L10, L12, L14 in `390bae4`); L22 live XSS probe, L23 axe in suite, L24 `npm audit` unverified, L25 stub shape divergence remain open |

## KNOWN discrepancies (do not silently resolve these)

### (a) HAG-014: the approval says $0.19, the engine now says $0.18

The production HAG-014 approval is **$0.19/fl oz for 6 weeks**,
recorded 2026-11-05T17:53:39Z by Owner (proposal P2). The engine
now derives the counter as **$0.18** — the midpoint of the mandate
(target $0.16, max approved $0.20). The $0.19 was the hardcoded
seed price; the $0.18 is what the mandate actually implies.

**The approval record stands as history and must NOT be
rewritten.** It was a real approval of the terms as they were
presented at the time, and rewriting it would falsify the audit
trail. The discrepancy is disclosed here, in README §10, and in
`docs/JUDGE-SCORECARD.md` §7 (the answer to "Why is the approval
$0.19 in the record but $0.18 in the app?"). A fresh HAGGLE case
created now would offer and approve $0.18, not $0.19.

### (b) The demo video is stale — three documented elements, plus two more

`submission/demo/converge-demo.mp4` (2:28, recorded 2026-11-06)
has the three stale elements named in the commission:

1. The counter figure shown ($0.19) is now $0.18 — the engine
   derives strategy prices from the case input (P0, 2026-11-07).
2. The room timelines shown are the first stack's (lost to the VM
   replacement; current rooms carry a record note).
3. It predates the Submit for approval flow (GAP-2) — the live app
   has it, the video does not show it.

Two further staleness items are in the record and must not be
hidden:

4. The HAG-014 overview shows a stale "Pending: $0.19/fl oz for 6
   weeks" line above the APPROVED stamp (recorded before the fix;
   the live app no longer shows it) — documented in
   `docs/positioning.md` §7 and README §10.
5. **New in this window:** the video shows the old **light**
   Direction B UI. The live app is now the dark charcoal/cyan/lime
   redesign. The video predates the redesign.

Recommendation (unchanged): retain the original recording; do not
re-record, do not edit it. The staleness is disclosed in writing
(demo script §9, README §10, `docs/JUDGE-SCORECARD.md` §4). The
original must not be destroyed.

### (c) The live model path is unconfigured (no provider key)

No `CONVERGE_LLM_API_KEY` is configured. The runtime code is
complete and tested, but it starts in the **no-model state**: it
connects, observes rooms, and logs — and produces **no drafts** and
fabricates nothing. The mock provider (`CONVERGE_LLM_PROVIDER=mock`)
exists for tests and local dev only; every mock response carries
`mock: true`, and the runtime logs that mock drafts are test output,
never live AI. **A mock draft must never be presented as a model
response.** Enabling the live path needs a provider key from Rubai
(see `docs/SETUP.md` §7 and `docs/AGENT-RUNTIME.md`).

Separately, the long-lived runtime **process is not running** in
production (verified by the documentation engineer: no
`agent-runtime` process). Starting it (`node
server/agent-runtime.js`, with the Switch env and, for drafting,
the LLM env) is a remaining step — see
`docs/JUDGE-SCORECARD.md` §5.

## What was not done in this window

- **No live model call.** No provider key was configured, and none
  was invented. The abstraction, the mock provider, and the tests
  are done; the live path is unconfigured by design until a key is
  provided.
- **No re-recorded demo video.** The original is retained with its
  staleness disclosed (see (b)).
- **No real users.** No usability sessions, no independent
  evaluation. Still the biggest gap.
- **No live XSS probe, no axe-core in the suite.** Both remain open
  (audit L22, L23).
- **No per-user auth, no CSRF token, no CORS policy, no audit hash
  chain, no content-hashed claim ids.** All documented as residual
  risks in `docs/SECURITY.md` §4.
- **No state-machine rewrite.** WITHDRAWN/EXPIRED were added; the
  11-state machine was kept. `UNDER_REVIEW` maps to
  INVESTIGATING/DISCUSSION; `PENDING_APPROVAL` maps to
  AWAITING_APPROVAL (see `docs/ARCHITECTURE.md` §8).
- **No `.env.example` update for the LLM variables.** The
  `CONVERGE_LLM_*` variables are documented in `docs/SETUP.md` §7
  and `docs/AGENT-RUNTIME.md` but are not yet listed in
  `.env.example`.

## ~02:00–02:45 Dhaka — §31 security + audit work

The master-prompt window's "What was not done" list (§31 of the
brief) is the work for this round: the audit hash chain, stable
claim ids, the outstanding security improvements, and the security
reporting. No new features, no redesign, no draft-endpoint changes
(another agent owns `server/drafts.js` and the draft endpoints).

### §31.1 Audit-trail hash chain — done

- Every audit event now carries `prevHash` + `hash` = SHA-256 of
  the canonical serialisation of (prevHash + the event's own
  fields). `audit()` chains every new event; `verifyAuditChain`
  detects a modified event, a missing middle event, reordered
  events, and an invalid previous hash.
- Migration: old events are NEVER rewritten. A single
  `chain-baseline` event commits to all pre-existing events (its
  hash is SHA-256 of the canonical serialisation of the
  pre-existing array); new events chain from it. The baseline is
  established by `store.js load()` and by `audit()` itself
  (idempotent, a no-op once a baseline exists).
- PLACEMENT: the brief said store.js, but `audit()` lives in
  engine.js (not store.js) and the chain reuses engine.js
  `canonicalJson`/`sha256Hex` — so the helpers live in engine.js
  next to `audit()`, and store.js `load()` imports
  `ensureAuditBaseline` from engine.js. engine.js does NOT import
  store.js.
- INCIDENT (recovered, no data lost): the first implementation had
  engine.js import store.js. A test that statically imported the
  engine and then dynamically imported the store with a scratch
  `CONVERGE_DATA_FILE` evaluated the store BEFORE the env var was
  set — so its `load()` read and baselined the PRODUCTION
  `data/converge.json` (one baseline event appended to each of
  HAG-014, CRT-007, COR-003; hash changed f3a08d2e → 1c7440b1).
  The production file was restored byte-for-byte from the
  2026-11-07-0016 recovery backup (`cp --reflink=never`, inode
  differs, SHA-256 `f3a08d2e080f26fc` verified, all legacy events
  and the $0.19 approval confirmed identical), the `.bak.1` was
  re-synced to the restored file, and the import direction was
  fixed. The production app was NOT restarted and its in-memory
  data was the pre-migration version throughout, so the restore
  is consistent with the running server.
- LIMITATIONS (also in `docs/SECURITY.md` §2b): tamper evidence,
  not tamper-proof storage. No external checkpoint; tail deletion
  still verifies.
- Tests: `tests/hash-chain.test.js` (9 tests, incl. the
  tail-deletion limitation pinned as a test).

### §31.2 Stable CORRECTION claim identifiers — done

- Claim ids are `C-` + 8 hex chars of SHA-256 of the normalised
  claim text (`stableClaimId`). A reorder keeps every claim's id
  and status; a wording change is a new claim and the old status
  is orphaned, never rebound. Legacy positional ids are carried
  as `legacyId` and the endpoint accepts both.
- Migration (`migrateCorrectionClaimKeys`): stored
  claimStatuses/claimChallenges/claimChallengeHistory are re-keyed
  legacy → stable by current transcript position; unmapped keys
  are preserved as `orphanedClaim*` and reported in the case
  detail response and in a 404 with `orphaned: true`. ASSUMPTION:
  correct only if the transcript has not changed since the
  statuses were set — true for production COR-003 (seed
  transcript). After migration all keys are stable ids.
- Client: the transcript view matches sentences by text (not
  position); the activity feed resolves audit claim references by
  stable or legacy id. The claims table already used `cl.id`.
- The `draft_correction_assessment` tool's claim projection now
  includes `legacyId` and resolves status by stable id first,
  then legacy id (same rule as the server).
- Tests: `tests/claim-ids.test.js` (6 tests); endpoint behaviour
  in `tests/security.test.js`. Existing tests that asserted C1/C2/C3
  were updated (server, remediation-appwide, visual-polish, tools).

### §31.3 Security improvements — done (with two honest non-results)

- **CSRF Origin check + explicit CORS: already implemented in P0,
  now verified.** The code already had `allowedOrigin` /
  `applyCorsHeaders` and the cross-origin POST 403 — the SECURITY.md
  claim that they did not exist was stale. They were NOT rebuilt;
  they are now pinned by tests (cross-origin + valid token → 403;
  no Origin → proceeds; app origin → proceeds; allowed origin
  gets ACAO, disallowed gets none, preflight 204). The correct
  mitigation for this architecture: the token travels as a custom
  header (not a cookie), so classic cookie-CSRF does not apply,
  and the Origin check is defence in depth.
- **Session revocation: done.** `POST /api/session/revoke`
  (requires a valid token) invalidates that token immediately;
  the next mutation with it gets 401. Log out button in the
  header calls it and clears the cached token. New helpers live in
  `server/security.js` (`revokeSession`, `sanitizePublicError`);
  the sessions Map stays in server.js (moving it would have been
  a restructure the brief forbade).
- **Error leakage: done.** The one leak — `/api/switch/messages`
  interpolated raw Switch error text — now returns a generic
  message. The outer catch was already generic.
- **File uploads: N/A.** No upload surface exists (verified by a
  test); no validation built for a feature that does not exist.
- **Cross-case isolation: verified by test.** A COR-003 claim id
  cannot resolve against HAG-014 (404); a COR-003 status change
  leaves HAG-014 byte-identical.
- **Live XSS probe: done and passing.** Benign payloads in a
  scratch case's supplier/ingredient fields did NOT execute in a
  real browser (no live element, payload visible escaped, 0
  console errors). Pinned as `tests/xss-probe.test.js`. The probe
  ran against a scratch instance (same code as production) so it
  never mutated the production data file. The earlier "blocked by
  a platform safety filter" outcome did NOT recur here.
- **axe-core: done and in the suite.** axe-core 4.14.0 is a
  devDependency; `tests/axe.test.js` runs it in a real browser on
  the dashboard, HAG-014 overview, and COR-003 negotiation: **0
  violations**. axe.js is served from the app's own origin via
  route interception — the strict CSP is NOT weakened. The run
  found two real bugs, both fixed: (1) clickable rows carried an
  `aria-label` override failing WCAG 2.5.3
  (label-content-name-mismatch) — the name now comes from the
  row's visible content (the two pinning tests were updated with
  the reason); (2) breadcrumb links had no underline and 1.84:1
  contrast (link-in-text-block) — now underlined by default.
- **`.env.example`: done.** Empty `CONVERGE_LLM_*` placeholders
  added (§29.2).
- **NOT verified (honest): `npm audit` could NOT run.** The
  registry proxy denies the audit endpoint (403 policy_denied),
  same as before. Dependencies are NOT claimed clean. Re-run
  outside the sandbox.

### §31.4 Security reporting — done

`docs/SECURITY.md` rewritten for the §31 state: fixed issues (§2b),
partially fixed (R2 — Origin check, no CSRF token), unresolved
risks (R1 single identity, R10 npm audit unverified, R11 no
per-user auth, R12 the production app still runs pre-§31 server
code), demonstration-only restrictions, and verified test evidence
with actual counts. The single-owner loopback-only session is
stated as a demo boundary, never as production multi-user auth.

### Verification

- `npm run check` clean. Full suite **345/345 pass, 0 fail**
  (was 294/294; +34 from this round: hash-chain 9, claim-ids 6,
  security 17, xss-probe 1, axe 1; the drafts agent's tests make
  up the rest of the +51).
- The first full-suite run during this round showed 19 failures
  (15 pre-existing + 4 drafts) — all parallel-load flakiness from
  running during a service restart and concurrent agent activity:
  every pre-existing failure passed in isolation and on re-run
  (344/345, then 345/345 after fixing one real failure: a
  portability test caught a `/home/` path in a fake stack trace
  inside my security test — fixed by rephrasing the string).
- Production data hash `f3a08d2e…` unchanged at the end (after the
  incident restore above). The production app on :3100 was NOT
  restarted: it serves the new client (Log out button renders, 0
  console errors — verified read-only) but runs the pre-§31 server
  code, so the revoke endpoint and the claim migration go live on
  the next restart. Until then, a Log out click only clears the
  token locally.

## ~02:27–03:30 Dhaka — eighth VM replacement recovery, integration, §30 live verification, bug-fix round

### Eighth VM replacement recovery — done (restart, not rebuild)

Uptime showed 13 minutes; every process was down (postgres, Mattermost,
switch-core, nginx, app, runtime) but `~/workspace/switch-server/pgdata`
survived. Backup first (`~/workspace/backups/switch-recovery-20261107-0227`,
converge.json inode differs, SHA-256 `f3a08d2e…` verified). Reinstalled
postgresql-16 + nginx (cogentco apt-source fix), recreated the `pgdata`
passwd entry (uid 1000), started postgres against the surviving data dir,
then Mattermost → switch-core (`/health/ready` 7/7 after the cold-start
listeners settled) → nginx (gateway :3000 → 200). Bridge
`c004c85d-…` (active) and all four case rooms verified preserved via the
Switch API (same ids as before). No re-registration, no room recreation.

### §30 draft handoff — done (commit 3894630)

See `docs/DRAFT-HANDOFF.md` for the full design. Append-only inbox
(`server/drafts.js`, `data/drafts.json`), runtime default `onDraft`
writes to the inbox and logs, six session-authenticated endpoints in
`server/server.js` (GET list, POST review/share/reject/archive/
request-revision), Drafts tab in the case workspace with the §30.2
review display and a prominent MOCK label. 16 draft tests.

### Integration — done

- The §30 (3894630) and §31 (57ac52f) commits land cleanly on top of
  each other; `server/server.js` carries BOTH the draft endpoints and
  the security wiring (verified by grep + the full suite). No merge
  conflict. The `.env.example` CONVERGE_LLM_* placeholders are present
  (one block, no duplicate).
- `docs/positioning.md` §5 corrected to the scorecard (Technical 9,
  Demo 7, 351 tests, XSS probe PASS, five stale video elements).
- `docs/DRAFT-HANDOFF.md` stale "§31 remains deferred" line updated.

### §30 pipeline — verified end to end, LIVE (mock provider, labelled)

1. A real human message was posted to `#haggle-dairyco` via the
   Mattermost API as the human user (post `cbwnp61srjgnpxxn9bahcjjd4c`):
   "@converge-facilitator Analyze the supplier price increase, calculate
   its impact, compare negotiation strategies, check the owner's mandate
   and prepare a counteroffer. Do not approve anything."
2. The runtime (mock provider) routed it to HAG-014 and produced a
   draft (`cabd5ba9-…`, mock:true, tools read_case/read_room_timeline/
   compute_haggle, engine findings 28.63% → 31.62%, $76.80/mo,
   $921.60/yr, max sustainable $0.1967 — all correct).
3. The draft landed in `data/drafts.json` and `GET /api/drafts`.
4. A human session reviewed it (GENERATED → UNDER_REVIEW).
5. A human session shared it: it appeared in the REAL `#haggle-dairyco`
   room (event `sw_cfd988fa…`, simulated:false, live drawer 19
   messages). Status SHARED.
6. A second share → **409** (no double-post).
7. The runtime log has 0 post_message/approve calls — the agent never
   posted or approved on its own.

**BUG FOUND + FIXED (share ASCII):** the first share failed with a
switch-core 500 (`asyncpg UntranslatableCharacterError`). The `clean`
sanitiser was applied only to the draft text, not to the footer —
and the footer carries the session actor name "Mara · Owner", whose
middle dot (U+00B7) is non-ASCII. Fix: `clean` is now defined first,
applied to the footer too, and extended to drop any remaining
non-ASCII character (true ASCII sanitiser). Regression test added
(`tests/drafts.test.js`: share text is fully ASCII with an em dash in
the draft and the middle dot in the actor name; the stored draft keeps
its original text). After the fix the share succeeded.
**Production data:** the hash changed `f3a08d2e…` → `b379c656…` — this
is the AUTHORISED share (draft-reviewed + draft-shared audit events
+ the shared message recorded on HAG-014). The HAG-014 approval
(P2, "$0.19/fl oz for 6 weeks", 2026-11-05) is intact, and the audit
hash chain verifies valid for all three cases (`verifyAuditChain`).

### Bug-fix round — done (audit Medium/Low, end to end)

- **L1/L3** (nextHaggleId Date.now() fallback): removed — the fallback
  is now the padded sequence (no HAG ids → HAG-001). `nextHaggleId`
  exported for tests; 7-case unit test added. **L2** (message-id
  collision) was already fixed (`randomUUID()` at the post path).
- **M7** (no live Switch test): new opt-in `tests/switch-live.test.js`
  (health → 53 ops → rooms → read_context on the real HAG-014 room).
  Skips cleanly without SWITCH_BASE_URL; passes 2/2 against the live
  stack.
- **L25** (stub read_context shape): the stub now returns the real
  `{result:{threads:[{root, replies}]}}` shape (messages get an id),
  and `switchTimelineToMessages` is exercised against it in a test.
- **L9** (client/server TRANSITIONS diverged): the client was missing
  WITHDRAWN/EXPIRED (added to the server by P0 but never to the
  client), so the Move dropdown could not offer them. Client table
  updated to match the server; a pin test asserts them deep-equal;
  the H8 test now expects `['DISCUSSION','WITHDRAWN','EXPIRED']` for
  AWAITING_APPROVAL (the correct new behaviour).
- **L13** (#challenge-slot dead fallback): removed — the element never
  existed in any template, so the branch could only return silently.
- **L19** (wizard stepper not clickable): completed steps are now
  buttons that go back to that step (same as Back, but direct), with
  a hover/focus cue in CSS.
- **Timeline $0.19/$0.18 wrinkle:** the Negotiation timeline showed
  the engine-derived $0.18 in the price column next to the historical
  "$0.19/fl oz for 6 weeks" label. New `termsPrice()` helper reads
  the AGREED price from the terms text; the counter-offer and
  approved rows now show the agreed price ($0.19) matching their
  labels. Display only — the engine never reads terms text. Test
  added (approved case shows $0.19 in both column and label).
- **M18** (stale docs): setup guide 294/294 → 351; README recovery
  count four → five (eighth replacement ~02:27) and drawer 15 → 19
  messages; positioning.md §5/§6 corrected (Technical 9, Demo 7,
  XSS probe done, five stale video elements).
- **L24** (dependency pinning): playwright `^1.64.1` → `1.64.1`,
  axe-core `^4.14.0` → `4.14.0`, lockfile synced. `npm audit` is
  STILL blocked by the registry proxy (403 policy_denied) — the
  audit itself remains unverified; the install summary reported
  0 vulnerabilities among the 4 installed packages, which is not
  a full audit.

### Already fixed (verified, not re-done)

M14 (per-workflow dashboard sub-text), M15/M16 (amber contrast,
stepper scroll-shadow + scrollIntoView), L5/L6 (generic 500s, CSRF
Origin check), L10/L12/L14 (strategy-row roles, breadcrumb link,
search behaviour), L11 (boot message port 3100), L16 (money/pct
return "—" for non-finite), L18 (⌘K/Ctrl+K copy), L20 (drawer
role="dialog" aria-modal), L22/L23 (live XSS probe, axe in suite),
M1/M2/M3/M5/M8/M10/M11/M13/M17 (P0 + dark redesign).

### Accepted as-is (correct, not bugs)

- **L7** (courtMeans called several times per render): the means are
  cheap and the code is correct; the server tally is only sent when
  ratings are complete, while courtMeans handles partial ratings —
  a swap would change behaviour. Left as-is.
- **L8** (monthly * 12 for the annual figure): trivially correct
  arithmetic on an engine-derived monthly; the analysis already
  carries annualExtraCost where it applies. Left as-is.
- **L21** (COURT tally block duplicated): the code comment records
  the test-extraction reason; extracting a shared renderer risks the
  journey tests for no user-facing gain. Left as-is.
- **L17** (bottomnav at 390px at the edge): cosmetic, scrolls rather
  than breaks. Accepted.

### Verification (this window)

- `npm run check` clean. Full suite **351 tests (350 pass, 1 skipped
  — the opt-in live Switch test), 0 fail**. With SWITCH_BASE_URL set
  the live test runs 2/2 (health, ops, rooms, read_context).
- Production app :3100 restarted with the new code (draft endpoints
  + revoke live, verified: GET /api/drafts → 200, POST
  /api/session/revoke without a token → 401). Runtime restarted
  wired to the draft inbox (mock provider, labelled; exactly one
  runtime process, PID 15615; WebSocket protocol 9, heartbeat 2s).
- Production data hash `b379c656…` (authorised share, see above);
  audit hash chain valid for all three cases.

## ~11:22–12:00 Dhaka — conversational replies (agent-as-teammate), demo plans, video rework

Rubai checked the official Flip the Switch brief: the demo must
explicitly show the AI agent working in a REAL team chat with human
teammates. A dashboard walkthrough or a human sharing an
AI-generated draft is not sufficient as the primary demonstration.
He commissioned a controlled, secure conversational reply mechanism,
genuine teammate-collaboration demo plans for Track 01 (HAGGLE) and
Track 02 (COURT), and a chat-first rework of the video plan, with a
release gate. Work done in this window:

### Conversational replies — done (`server/replies.js`, new; `server/agent-runtime.js`)

- **The mechanism.** After the model produces a draft for an
  addressed human message, the runtime may publish a VALIDATED
  informational model response into the originating Mattermost room
  through Switch, under its own agent identity. The model never
  posts — there is no post/send tool in the registry (`tools.js`
  forbids tool names matching `/post.?message|send.?message/`), and
  `server/replies.js` is never reachable from a tool call. The
  runtime validates the draft text and posts it with its own agent
  credentials (`withRoomConnection` + `post_message`); it never holds
  a human session token and never calls a mutating app endpoint, so
  it cannot approve, adopt, publish, or transition a case.
- **Validation (`validateReplyText`).** Rejects approval/commitment/
  decision language (first-person: "I approve", "we agreed", "I will
  pay"), credential requests (PIN/OTP/password), claims to be human,
  and instructions to contact a supplier. Deliberately does NOT
  reject factual descriptions of past human actions ("P2 was
  approved by the Owner"). Every money/percentage figure must match
  the deterministic engine's output or the case's own numbers
  (`collectKnownFigures` + `validateFigures`); a % is valid if it
  matches a known % or is the difference of two known %. ASCII-only
  (sanitised before validation — switch-core 500s on non-ASCII).
  Reply text: label line, validated model text, a compact
  engine-figures line for HAGGLE (labelled deterministic), a footer
  ("Final decisions stay with a human"). Max 1500 chars. A rejected
  reply is logged and never posted; the draft still reaches the
  inbox.
- **Idempotency (`data/replies.json`, gitignored).** Every reply is
  recorded PENDING before posting, then POSTED with the Switch event
  id. A source message with a PENDING or POSTED reply is never
  handled again. A failed post drops the PENDING record so a later
  re-route may retry; a post that succeeded but crashed before the
  record was completed is reconciled by `reconcilePendingReplies()`
  against the room timeline (the posted text carries the ref id).
  Kill switch: `CONVERGE_REPLY_ENABLED=false`. A message with no
  source message id is never replied to.
- **Tests — 25 new (`tests/replies.test.js`).** Sanitisation, figure
  extraction + known figures, figure validation (incl. percentage-
  point differences), forbidden content, factual past-human-approval
  descriptions pass, reply text building (ASCII), reply store +
  idempotency, PENDING/POSTED reconciliation, runtime integration
  (post on valid, reject on forbidden/invented figures,
  `replyEnabled=false`, no-id skip, failed-post retry, COURT posts
  + COURT money rejection). Existing routing tests
  (`tests/agent-runtime.test.js`, `tests/drafts.test.js`) now pass
  `replyEnabled: false` so they assert on drafts, not posts.
- **Verified live (mock provider, labelled) — 2026-11-07 ~11:40
  Dhaka.** A real human message in `#haggle-dairyco`
  ("@converge-facilitator What is the financial impact of the
  DairyCo price rise, and which counter should we offer? Do not
  approve anything.") produced a mock reply in the real room
  1 second later (event `sw_e4e5c560572741b89cc8c157ad307b6d`, ref
  `89be10b7`, live drawer 23 messages). The reply is clearly
  labelled MOCK and carries the correct engine figures (28.63% →
  31.62%, +$76.80/mo, +$921.60/yr, max sustainable $0.1967). A
  re-route of the same source message was skipped (0 posts) —
  idempotency proven live. (One false alarm during the check: the
  first idempotency probe used a truncated source id, so it posted a
  second record to the stub only — not to the real room; the bogus
  record was removed from `data/replies.json` and the check re-run
  with the full id, which passed.) The runtime was then restarted
  observe-only (PID 18570, `LIVE MODEL NOT CONFIGURED`, `mock:
  false`, replies enabled). This proves the mechanism; it does NOT
  prove a live model response — no provider key is configured yet.
- **Data note.** The production data hash moved `b379c656…` →
  `71a83bcfa7d680f2` in this window. The change is ONLY the §31.2
  stable-claim-id migration on COR-003 (legacy positional keys C1/C2
  → content-derived C-3e8e58e6/C-97c7980b; values 'Corrected' /
  'Disputed' preserved). HAG-014 and CRT-007 are byte-identical;
  HAG-014 approval P2 "$0.19/fl oz for 6 weeks" intact; audit chains
  valid for all three cases (10 / 3 / 5 events).

### Demo plans + video rework — done (delegated, reviewed)

- **Track 01** (`submission/demo-track01-haggle.md`): HAGGLE demo
  plan — room setup, the exact 8-step rehearsal sequence (human
  spots the problem → another human tags the facilitator → agent
  investigates + replies → teammate challenges → agent responds with
  more investigation + engine numbers → owner reviews the proposal
  → human approval, separate and secure), what each step proves,
  and what is blocked on the Cloudflare token vs already proven.
  States plainly that Rubai must invite at least one real teammate
  (only the `user` account exists on this Mattermost); no fake
  accounts, no fabricated screenshots; fallbacks if only one
  teammate or none can be invited.
- **Track 02** (`submission/demo-track02-court.md`): same structure
  for COURT (blind recipe disagreement) — the tally means (S1 4.67
  / S2 4.33 / S3 3.33), the disagreement analysis, a teammate
  challenge, the human adoption of the canonical version.
- **Video script** (`submission/demo-script.md`): reworked chat-first
  — Mattermost dominates (Scene 3 is the room full-screen for the
  whole scene), the dashboard appears only for calculations,
  evidence, proposals and approvals. The original script is
  preserved as an appendix. Release gate added (do not record until:
  real model provider configured, genuine agent response verified,
  agent responses in the actual room, two-way conversation works,
  HAGGLE + COURT verified, human approval protected, tests pass,
  at least one real teammate invited). Never present the
  mock-labelled reply as live AI.

### Docs updated

- `docs/ARCHITECTURE.md` (§1, §2 component map, §11 + new §11.1):
  the reply mechanism, its controls, and its live verification.
- `README.md` (§6 protocol + Switch status, §9 test count,
  §10 demo video): replies, tenth recovery, 375/376, chat-first
  script.
- `docs/TESTING-REPORT.md`: suite now 376 (375 pass, 1 skipped),
  38 files; §30/§31/M7/reply rows added; §4 "NOT tested" items
  corrected (live Switch test and live XSS probe and axe-core are
  now in the suite).
- `docs/JUDGE-SCORECARD.md`: Use of Switch 8 (reply evidence added,
  still mock — the live-model bar is unmet); Technical 10 (376
  tests + reply mechanism); Presentation 7 (video now has SIX stale
  elements — added "predates the conversational reply"); §3
  60-second proof rewritten to lead with the conversational reply;
  §4 feasibility re-checked (only blocker: the provider key);
  §5 moves table updated (live-model reply → Use of Switch 9;
  chat-first re-record → Presentation 9). Headline unchanged:
  **~40/50**.

### Verification (this window)

- `npm run check` clean. Full suite **376 tests (375 pass, 1 skipped
  — the opt-in live Switch test), 0 fail**. With SWITCH_BASE_URL set
  the live test runs 2/2.
- Live end-to-end check before the push (2026-11-07 ~11:22 Dhaka):
  suite 351/350/1 at that time; Playwright against the production
  app :3100 — dashboard shows all 3 cases, HAG-014 COMPLETED, Drafts
  tab shows the SHARED mock draft with the MOCK label, Negotiation
  shows the $0.19 agreed terms, Audit shows the approval +
  draft-shared event, 0 console errors.
- Reply mechanism verified live with the mock provider (above).
- Production app :3100 still running the new code (HTTP 200).
  Runtime observe-only (PID 18570). Data hash `71a83bcfa7d680f2`
  (explained above); audit chains valid for all three cases.

## ~12:05–12:20 Dhaka — eleventh VM replacement recovery + live-model verification (Cloudflare Workers AI)

### Eleventh VM replacement recovery — done (restart, not rebuild)

The VM was replaced an eleventh time (~11:53 UTC; uptime 10 minutes,
every process down, all ports down) just as Rubai sent the Cloudflare
token. Recovery ran on his go-ahead ("Run the recovery", 12:05 Dhaka),
per `RECOVERY.md` §2 — a restart, not a rebuild. Backup first
(`~/workspace/backups/switch-recovery-20261107-1205`; converge.json
inode 1302596 vs backup 1304292, SHA-256 `71a83bcf…` matches on both).
Postgres up (switch + mattermost DBs present), Mattermost :8065 → 200,
switch-core `/health` ok + `/health/ready` 7/7, nginx :3000 → 200, app
:3100 → 200. Bridge `c004c85d-…` active/default and all rooms verified
preserved via the Switch API (same ids). Two-way delivery verified
(human marker → `read_context`; agent marker → Mattermost). Production
data hash unchanged (`71a83bcf…`); HAG-014 COMPLETED, approval P2
intact; audit chains valid for all three cases.

### Cloudflare Workers AI — configured and verified live

Rubai provided his Cloudflare Account ID in chat
(`18103063db0eb43221413a0e9561a711` — not secret) and the API token
for the runtime. Configuration is in the backend runtime environment
only: `~/workspace/switch-server/.converge-llm.env` (mode 600,
outside the repo) — provider `openai-compatible`, model
`@cf/qwen/qwen3-30b-a3b-fp8`, base URL
`https://api.cloudflare.com/client/v4/accounts/18103063db0eb43221413a0e9561a711/ai/v1`.
The token is in that file only — never in the repo, the frontend,
logs, memory, or any doc. **Known limitation (also in
`docs/ARCHITECTURE.md` §10):** the Cloudflare vault link
(`custom.cloudflare`) stores the token for Muse's own API calls, but
it cannot inject the key into the standalone Node runtime's
environment — the runtime reads it from the private env file. The
token value passed through chat in Rubai's message; he was told it is
only in that file and can rotate it in the Cloudflare dashboard if he
prefers it not to have passed through chat.

### Two real model-shape bugs found and fixed live

Qwen3's structured output did not match the draft schema on the first
live calls:

1. **Wrong enum values.** The model returned role "CONVERGE
   facilitator" and confidence 0.7 (a number) instead of the exact
   enum values (`facilitator`, `medium`). Fix: the system prompt in
   `server/agent-runtime.js` now spells out the exact allowed values
   — the role field must be EXACTLY the role lens (`"${role}"`), the
   confidence field EXACTLY one of `low`/`medium`/`high` (a word, not
   a number). A direct re-test with the strengthened prompt returned
   role `facilitator`, confidence `medium`, all figures correct.
   (Llama 3.1 8B instant was also tried and rejected the request —
   HTTP 400 on the `response_format` + `json_schema` body — so Qwen3
   stays the model.)
2. **String `caveats`.** The model returned `caveats` as a single
   string instead of an array, which rejected the first live draft.
   Fix: `normalizeStructuredOutput()` in `server/llm.js` (shape-only:
   wraps a string `caveats` into `[string]`, content preserved
   verbatim; anything else still fails validation), plus a prompt
   line. Both fixes are covered by 3 new tests in
   `tests/llm.test.js` (now 19).

The first `llm.js` test call timed out at 30s (a cold-start /
long-reasoning first call); direct calls afterwards answered in
~1–5s, so no timeout change was made.

### Live end-to-end verification — genuine model response, 5 checks

A real human question was posted in `#haggle-dairyco` ("What is the
financial impact of the DairyCo price rise, and which counter should
we offer? Do not approve anything."). The runtime (PID 9897, live
model, `mock: false`, replies enabled) produced:

- **Draft** `4a8bbe65-c4b4-45ec-b0ff-3a16bc398d4d` — `mock: false`,
  provider `openai-compatible`, role financial-analyst, confidence
  medium, status GENERATED, needsHumanReview true, toolsUsed
  read_case / read_room_timeline / compute_haggle.
- **Reply** in the real room 1 second later — event
  `sw_92703c3079cd495993d854491dbd6c57`, ref `4a8bbe65`, `mock: false`,
  status POSTED. Live drawer now 28 messages.

The five checks, all verified:

1. **Real model response** — draft `mock: false`, provider
   `openai-compatible`, model `@cf/qwen/qwen3-30b-a3b-fp8`. Not a mock.
2. **Passes reply validation** — the reply text used ONLY correct
   engine figures ($0.48, $0.96 → $1.44, $4.58 → $5.06, 28.63% →
   31.62%, $76.80/mo, $921.60/yr, $0.1967); it correctly states the
   approved counteroffer ($0.19/fl oz for 6 weeks, approved by the
   owner) as a past human decision; it contains no
   approval/commitment language ("The owner must review and decide
   on the final terms").
3. **In the correct room under the facilitator's identity** — the
   reply is in `#haggle-dairyco` under `converge-facilitator`,
   event `sw_92703c30…`.
4. **The model cannot approve** — HAG-014 is still COMPLETED,
   approval P2 "$0.19/fl oz for 6 weeks" intact (approvedBy Owner,
   2026-11-05), audit events still 10, all three audit chains VALID,
   `data/converge.json` hash UNCHANGED (`71a83bcfa7d680f2…`). The
   draft is GENERATED, not approved.
5. **Logs do not expose the token** — 0 matches for the token
   pattern in the agent-runtime / app / switch-core / mattermost
   logs; 0 files contain the full token value.

The Drafts tab now shows 4 drafts for HAG-014: the new LIVE one
(`4a8bbe65`, `mock: false`) plus 3 old MOCK ones (clearly labelled
`mock: true`) — the mock fallback is clearly labelled and
distinguished. The demo video is NOT recorded — the release gate is
now met except for the real-teammate requirement (Rubai must still
invite at least one real teammate; only the `user` account exists on
this Mattermost).

### Score change — ~40/50 → ~41/50

`docs/JUDGE-SCORECARD.md` updated: Use of Switch **8 → 9** (the
live-model reply in the room is now demonstrated); Technical stays 10
(379 tests — 378 pass, 1 skipped — plus the two live model-shape
fixes); Creativity stays 7 (no real users); Presentation stays 7
(video still stale with SIX elements). **Total 33/40 ≈ 41/50.**
The path to 45/50 is now: real users (+2) + re-recorded video (+2).
The live-model step is done — it is no longer on the moves list.
