# CONVERGE — Testing Report

**Status:** current as of the master-prompt window, 2026-11-07.
Verified by running the suite in this session (not copied from a
brief): **`npm test` → 294 pass, 0 fail, 0 skipped** (55s, 29 files);
**`npm run check` → clean**. `data/converge.json` was not touched by
the suite — every test seeds isolated data in a temp dir and spawns
its server with `CONVERGE_DATA_FILE` set to that temp file.

## 1. How to run it

```bash
npm install                  # Playwright (devDependency) for the browser tests
npx playwright install chromium   # one-time browser download
npm test                     # 294/294
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
| `tests/server.test.js` | 7 | Server persistence, COURT blindness incl. case-bound tally, rating duplicates, claim persistence, guest-challenge attribution |
| `tests/switch-client.test.js` | 8 | Ops registry, `callOp` shape, heartbeat, 53-op catalogue — against a mocked `fetch` |
| `tests/case-creation.test.js` | 4 | Case creation validation, sequential ids |
| `tests/creation-wizard.test.js` | 10 | 5-step wizard validation and preview |
| `tests/p0-fixes.test.js` | 9 | C1/C2/C3 (sample code, heat table, pendingApproval clearing) |
| `tests/fixround.test.js` | 14 | GAP-1, signed money, M21 drawer, AXE-1 |
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
| **`tests/dark-redesign.test.js`** | **11** | **NEW (P1): dark palette tokens, every text/background pair ≥ 4.5:1 WCAG AA (computed in Node), no inline styles (CSP), derived terms/timeline, stepper terminal states, direction-aware Move labels, citation buttons** |
| **`tests/dark-redesign-journey.test.js`** | **5** | **NEW (P1): dark UI journeys in a real browser (Playwright) — session auth end to end, derived approval terms, timeline, stepper** |
| **Total** | **294** | **29 files** |

New in this window: **92 tests** (18 P0 server core + 58 runtime
files + 16 dark redesign) plus 1 integration test (guest-challenge
attribution, `tests/server.test.js`). 201 + 92 + 1 = **294**.

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

## 4. What is NOT tested

- **No live model call.** There is no provider key configured, so
  no test calls a real model. The LLM tests use a stubbed transport
  and the mock provider. A live model call is unverified by design
  until a key is provided.
- **No live Switch integration test in the suite.**
  `switch-client.test.js` mocks `fetch`; the runtime tests use
  mocked connections. Live verification is manual (health → ops →
  room → read_context → two-way delivery; see
  `docs/switch-live-integration.md` and
  `docs/IMPLEMENTATION-LOG.md`). A regression in the real protocol
  would only be caught by a manual run.
- **No live XSS probe.** `escaping.test.js` covers `esc()`
  statically only (4 tests, extracted from the shipped code). The
  live probe was blocked by a platform safety filter and not
  retried (audit L22).
- **No accessibility test in the suite.** axe-core 0 violations on
  13 pages is a manual run from 2026-11-06, not part of `npm test`
  (audit L23). The dark redesign's contrast is asserted in
  `tests/dark-redesign.test.js` (every pair ≥ 4.5:1, computed in
  Node), which is the part of accessibility that changed.
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
