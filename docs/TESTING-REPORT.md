# CONVERGE — Testing Report

**Status:** current as of the conversational-reply window, 2026-11-07 ~12:00 Dhaka.
Verified by running the suite in this session (not copied from a
brief): **`npm test` → 375 pass, 0 fail, 1 skipped (376 total)**;
**`npm run check` → clean**. `data/converge.json` was not touched by
the suite — every test seeds isolated data in a temp dir and spawns
its server with `CONVERGE_DATA_FILE` set to that temp file.

## 1. How to run it

```bash
npm install                  # Playwright (devDependency) for the browser tests
npx playwright install chromium   # one-time browser download
npm test                     # 375 pass, 0 fail, 1 skipped (376 total)
npm run check                # node --check on all server files
```

No server needs to be running before `npm test`, and the suite never
reads or writes the repo's `data/converge.json`. Browser tests spawn
their own server on an isolated seed file per test. On Windows the
same commands work (Playwright finds its own Chromium per OS).

## 2. The suite as it now stands

| File | Tests | What it covers |
|---|---|---|
| `tests/engine.test.js` | 9 | HAGGLE maths, strategy determinism, state machine, agent-approval gate |
| `tests/engine-edge.test.js` | 5 | Engine edge cases (finite-number validation, partial inputs) |
| `tests/server.test.js` | 9 | Server persistence, COURT blindness incl. case-bound tally, rating duplicates, claim persistence, guest-challenge attribution, L1/L3 id generation |
| `tests/switch-client.test.js` | 8 | Ops registry, `callOp` shape, heartbeat, 53-op catalogue — against a mocked `fetch` |
| `tests/case-creation.test.js` | 4 | Case creation validation, sequential ids |
| `tests/creation-wizard.test.js` | 10 | 5-step wizard validation and preview |
| `tests/p0-fixes.test.js` | 9 | C1/C2/C3 (sample code, heat table, pendingApproval clearing) |
| `tests/fixround.test.js` | 15 | GAP-1, signed money, M21 drawer, AXE-1, L25 stub shape |
| `tests/gap2-submit.test.js` | 15 | P-number mapping, duplicate-submission 400, agent-cannot-approve |
| `tests/gap2-journey.test.js` | 2 | UI-only create → submit for approval → approve journey (Playwright) |
| `tests/new1-deeplink.test.js` | 8 | Deep links to cases created after boot |
| `tests/staleness-refresh.test.js` | 5 | External mutations refresh on focus/visibility |
| `tests/remediation-appwide.test.js` | 12 | App-wide remediation findings |
| `tests/remediation-court.test.js` | 9 | COURT remediation findings |
| `tests/remediation-haggle.test.js` | 19 | HAGGLE remediation findings |
| `tests/remediation-shell.test.js` | 16 | Shell remediation findings |
| `tests/escaping.test.js` | 4 | `esc()` XSS-neutralising, extracted from the shipped code |
| `tests/portability.test.js` | 5 | No absolute paths, isolated `CONVERGE_DATA_FILE`, Playwright as devDependency |
| `tests/ux-polish.test.js` | 19 | Bullet chart bounds, wizard warnings, next-step, move options |
| `tests/ux-polish-journey.test.js` | 4 | UX polish journeys (Playwright) |
| `tests/visual-polish.test.js` | 14 | COURT/CORRECTION next steps, dashboard cue, mobile stepper |
| `tests/visual-polish-journey.test.js` | 4 | Visual polish journeys (Playwright) |
| **`tests/p0-server-core.test.js`** | **18** | **NEW (P0): atomic save + backup fallback, session-token auth (401 without token, token expiry, actor from session, body actor ignored), proposal versioning + content-hash binding + expiry + idempotent re-approve, derived strategy prices, WITHDRAWN/EXPIRED** |
| **`tests/switch-ws.test.js`** | **16** | **NEW (P1): WebSocket frame parsing and normalisation (observed `agent.event`/`agent.gap` shapes and docs-shaped frames), dedup by sequence, cursor advance, backoff, SSE fallback** |
| **`tests/llm.test.js`** | **16** | **NEW (P1): provider config resolution, mock labelling (`mock: true`), structured-output JSON Schema validation, rejection of malformed output, stubbed OpenAI transport** |
| **`tests/tools.test.js`** | **12** | **NEW (P1): registry contents, the no-approval invariant (no approve/adopt/publish/transition tool can exist), argument validation, timeout, audit logging of every call** |
| **`tests/agent-runtime.test.js`** | **14** | **NEW (P1): routing (addressed human messages only), dedup, gap catch-up, eviction/refusal policy, no-model state (observes, drafts nothing), lifecycle with a mocked connection** |
| **`tests/dark-redesign.test.js`** | **13** | **NEW (P1): dark palette tokens, every text/background pair ≥ 4.5:1 WCAG AA (computed in Node), no inline styles (CSP), derived terms/timeline, stepper terminal states, direction-aware Move labels, citation buttons, WITHDRAWN/EXPIRED client/server pin** |
| **`tests/dark-redesign-journey.test.js`** | **5** | **NEW (P1): dark UI journeys in a real browser (Playwright) — session auth end to end, derived approval terms, timeline, stepper** |
| **`tests/drafts.test.js`** | **16** | **NEW (§30): draft inbox (append-only, case isolation), draft record fields, supersedes, ASCII share text, the middle-dot share regression** |
| **`tests/drafts-journey.test.js`** | **1** | **NEW (§30): draft review/share journey in a real browser (Playwright)** |
| **`tests/hash-chain.test.js`** | **9** | **NEW (§31.1): hash-chained audit trail — valid chain, modified/missing/reordered/invalid-previous-hash detection, the tamper-evidence (not tamper-proof) limitation pinned** |
| **`tests/claim-ids.test.js`** | **6** | **NEW (§31.2): stable content-derived claim ids, reorder keeps ids+statuses, wording change is a new claim, orphaned statuses reported** |
| **`tests/security.test.js`** | **17** | **NEW (§31.3): CSRF/CORS pinned, session revocation, error-leakage fix, no-upload-surface pin, cross-case isolation, XSS probe (live, in `tests/xss-probe.test.js`)** |
| **`tests/axe.test.js`** | **1** | **NEW (§31.3): axe-core 4.14.0 in the suite — 0 violations on dashboard / HAG-014 overview / COR-003 negotiation** |
| **`tests/xss-probe.test.js`** | **1** | **NEW (§31.3): live XSS probe against a scratch instance — payloads escaped, 0 live elements, 0 console errors** |
| **`tests/switch-live.test.js`** | **1 passed, 1 skipped** | **NEW (M7): opt-in live Switch test (health → 53 ops → rooms → read_context) — passes 2/2 against the real server when `SWITCH_BASE_URL` is set, skips cleanly otherwise** |
| **`tests/replies.test.js`** | **25** | **NEW (conversational replies): sanitisation, figure extraction + known figures, figure validation (incl. percentage-point differences), forbidden content (approval/commitment/decision, credentials, claiming human, supplier contact), factual past-human-approval descriptions pass, reply text building (label + engine figures + footer, ASCII), reply store + idempotency, PENDING/POSTED reconciliation, runtime integration (post on valid, reject on forbidden/invented figures, `replyEnabled=false`, no-id skip, failed-post retry, COURT posts + COURT money rejection)** |
| **Total** | **375 pass + 1 skipped (376)** | **38 files** |

New since the master prompt: **§30 draft handoff** (17 tests),
**§31 security** (33 tests: hash chain 9 + claim ids 6 + security 17
+ axe 1), **M7 live Switch test** (2, 1 skipped without env),
**audit bug-fix round** (L1/L3, L9, L13, L19, L25, timeline wrinkle),
and **conversational replies** (25 tests). 294 + 17 + 33 + 2 + 4 +
25 = **376** (375 pass, 1 skipped).

## 3. What the new tests prove

- **The approval boundary is real.** `p0-server-core.test.js`
  asserts: a POST without a token returns 401; a token is required
  on every mutating endpoint; the actor comes from the session, not
  the body (a body claiming `actorKind: 'human'` changes nothing);
  an expired token is rejected; an agent cannot approve.
- **Approval terms cannot be tampered with.** The same file asserts:
  approve rejects with 400 on a content-hash mismatch, on a changed
  case input after submission, and on a missing proposal record; a
  retried approve of the same proposal returns the existing approval
  (200); a proposal older than 7 days expires.
- **The store survives a crash mid-write.** Atomic rename + backup
  rotation + fallback to the newest valid backup are tested with a
  corrupt live file.
- **Strategies generalise.** Derived prices are tested on
  non-seed inputs (e.g. a $4.00/kg case gets kg terms, not
  "$0.19/fl oz").
- **The agent cannot approve, by construction.**
  `tools.test.js` asserts the registry contains no approve/adopt/
  publish/transition/set-claim-status/execute/send-message tool, and
  that `validateRegistry()` throws if one is added.
- **The WebSocket client handles the real server's shapes.**
  `switch-ws.test.js` asserts parsing of the observed
  `agent.event`/`agent.gap` frames (not just the docs' shapes),
  dedup, cursor advance, and backoff.
- **The mock is never live AI.** `llm.test.js` asserts every mock
  response carries `mock: true`, and `agent-runtime.test.js`
  asserts the no-model state produces no drafts.
- **The conversational reply cannot decide anything.**
  `replies.test.js` asserts: approval/commitment/decision language,
  credential requests, claims to be human, and supplier contact are
  all rejected (never posted); factual descriptions of past human
  approvals pass. Every money/percentage figure in a reply must
  match the deterministic engine's output (a % is valid if it matches
  a known % or is the difference of two known %); an invented figure
  is rejected. A reply is posted at most once per source message
  (idempotency), a failed post drops the PENDING record so a re-route
  may retry, and a crashed PENDING record is reconciled against the
  room timeline. The draft always reaches the inbox even when the
  reply is rejected or fails — the human-review path is never lost.

## 4. What is NOT tested

- **No live model call.** There is no provider key configured, so
  no test calls a real model. The LLM tests use a stubbed transport
  and the mock provider. A live model call is unverified by design
  until a key is provided.
- **Live Switch integration is opt-in, not in the default suite.**
  `tests/switch-live.test.js` (M7) runs 2/2 against the real server
  when `SWITCH_BASE_URL` is set and skips cleanly otherwise
  (1 skipped in the default run). `switch-client.test.js` mocks
  `fetch`; the runtime tests use mocked connections. Live
  verification is manual (health → ops → room → read_context →
  two-way delivery; see `docs/switch-live-integration.md` and
  `docs/IMPLEMENTATION-LOG.md`).
- **No concurrency test.** Two simultaneous writes to the same case
  are not tested; handlers share one in-memory `data` object and
  async interleaving at `await` points can still lose an update
  (audit H4, partially addressed by the atomic save).
- **No per-user auth test** — there is no per-user auth to test.
  The session token is a single demo identity (see
  `docs/SECURITY.md`).
- **`npm audit` is unverified in this environment.** The sandbox's
  managed registry proxy denies the audit endpoint
  (`policy_denied`). There are zero runtime dependencies; Playwright
  is dev-only. Its vulnerability status should be checked where the
  endpoint is reachable (audit L24).

## 5. Test data and isolation

- Every test seeds its own data with `seedData()` in a temp dir.
  No test reads the repo's `data/converge.json`; the suite never
  recreates it.
- The seed data is the three fictional demo cases (HAG-014, CRT-007,
  COR-003) plus scratch cases created by the tests themselves.
  Production data (`data/converge.json`, hash `f3a08d2e…`) is
  untouched by the suite — verified by comparing its hash before and
  after a full run.
- Destructive tests run against isolated scratch servers on free
  ports, never against the production app :3100.
