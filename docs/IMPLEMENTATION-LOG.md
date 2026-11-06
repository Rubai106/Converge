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
