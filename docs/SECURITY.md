# CONVERGE — Security

**Status:** current as of the §31 security + audit window, 2026-11-07.
This document states the approval boundary as it now stands, what is
still demo-grade, and the residual risks — plainly, so a judge or a
reviewer can check every claim against the code. The §31 work
(2026-11-07 ~02:00–02:45 Dhaka) closed the audit hash chain, stable
claim ids, the CSRF/CORS verification, session revocation, the error
leak, the live XSS probe, and axe-core in the suite; see §2–§4.

## 1. The approval boundary (what changed in P0)

The Phase Zero audit's Critical C2 was: the human-only approval gate
was self-asserted — the server built the actor from the request body
and defaulted to human (`body.actorKind || 'human'`), so any local
caller could approve. That is fixed:

- **Session tokens.** `POST /api/session` issues a
  `crypto.randomUUID()` token (24h expiry, held server-side in an
  in-memory `Map`). Every other POST requires the token in the
  `X-Converge-Session` header; missing, invalid, or expired → **401**.
  Session issuance is rate-limited to 5 per minute per IP (429 when
  empty).
- **The actor comes from the session, never the body.** The token's
  actor is fixed: `{ name: 'Mara · Owner', kind: 'human' }`.
  `body.actor` / `body.actorKind` are **ignored entirely** — the
  client no longer sends them, and a request that tries to smuggle
  `actorKind: 'human'` in the body gets nothing from it.
- **The gate itself** lives in `transitionCase`
  (`server/engine.js`): `AWAITING_APPROVAL → APPROVED` requires a
  human actor **and** a pending approval. An agent approval returns
  400. GAP-1 (a bare move to `AWAITING_APPROVAL` without a proposalId
  → 400) and GAP-2 (duplicate pending → 400; `proposalId` validated
  against the engine's strategy list) are unchanged and still
  server-side.
- **Proposal binding.** An approval binds to
  `{ proposalId, version, contentHash }` — the exact proposal version
  and content, not a positional P-number and free text. Approve
  rejects with 400 on any hash mismatch (tampered record, changed
  case input, missing record). Proposals expire after 7 days
  (`PROPOSAL_TTL_MS`) to `EXPIRED` with an audit event. A retried
  approve of the same `proposalId`+`version` returns the existing
  approval (200), not a 400.
- **The agent can never approve.** There is no approve tool in the
  registry (`server/tools.js`), and `validateRegistry()` throws if
  any tool name matches approve/adopt/publish/transition/
  set-claim-status/execute/send-message, or if any tool claims a
  permission other than `read` or `draft`. The agent runtime never
  calls `/api/session`, never holds a human session token, and never
  calls a mutating app endpoint. The runtime's drafts are surfaced
  through `onDraft` (default: logged) and are never posted to a room
  by the runtime.
- **Guest challenges are attributed honestly.** A CORRECTION guest
  challenge's `by` is the episode guest participant on the case (e.g.
  `Dr Amara Osei (guest)`), not the session actor operating the UI;
  the audit event still records the session actor. (Integration
  commit `3e18a86`; a test asserts it.)

## 2. What else was hardened in P0

- **`/api/switch/register` removed.** It minted Switch agent
  credentials for any loopback caller and returned the new agent's
  `{id, api_key}`. Registration is a one-time ops action, not a web
  API.
- **Body cap.** Request bodies are capped at 1 MB (413 over the cap);
  malformed JSON returns 400, not 500.
- **Rate limiting.** Per-IP token buckets: 5 session issuances per
  minute, 60 other POSTs per minute; 429 when empty. Buckets are
  in-memory and per server instance.
- **Security headers.** Every response carries
  `X-Content-Type-Options: nosniff` and a strict
  Content-Security-Policy (`default-src 'self'`, `script-src 'self'`,
  `style-src 'self'`, `img-src 'self' data:`, `connect-src 'self'`,
  `font-src 'self'`, `object-src 'none'`, `base-uri 'self'`,
  `frame-ancestors 'none'`). The dark redesign removed all 42 inline
  style attributes so the CSP holds with no `'unsafe-inline'`.
- **Atomic persistence.** `save()` writes `converge.json.tmp`,
  fsyncs, then renames over the live file; a rotating backup
  (`converge.json.bak.1/.2/.3`) is kept and `load()` falls back to
  the newest valid backup. A crash mid-write cannot corrupt the only
  copy.
- **Error responses** no longer leak raw internals on the new paths:
  `readBody` throws typed `HttpError`s (413/400) answered directly
  instead of becoming 500s. (The outer catch still returns the raw
  message for unexpected errors — audit L5, open; see §4.)
- **COURT ratings** are still bound to a listed reader name, but the
  rating endpoint now requires a session token, so an unauthenticated
  caller cannot rate at all. Reader identity within the demo remains
  self-selected (see §3).
- **Secret hygiene (verified in the audit):** no `.env` in the repo;
  `.gitignore` covers `.env`, `.env.local`, `*.pem`, `*.key`,
  `data/`, `node_modules/`, `switch-server/`; `.env.example` has
  empty values only; no real credentials in tracked files; the
  Switch key lives in `~/workspace/switch-server/.env`, outside the
  repo; the frontend bundle exposes no keys. The LLM key, when
  configured, is sent only as an `Authorization: Bearer` header and
  is never logged, never returned by any function, and never written
  to disk by the runtime code. (`.env.example` now also lists the
  empty `CONVERGE_LLM_*` placeholders — §31, 2026-11-07.)

## 2b. What was hardened in §31 (2026-11-07)

- **Audit-trail hash chain (audit M4 — closed).** Every audit event
  now carries `prevHash` + `hash` = SHA-256 of the canonical
  serialisation of (prevHash + the event's own fields)
  (`server/engine.js`: `auditChainHash`, `ensureAuditBaseline`,
  `verifyAuditChain`). Old events are never rewritten: a single
  `chain-baseline` event commits to all pre-existing events (its hash
  is SHA-256 of the canonical serialisation of the pre-existing
  array), and new events chain from it. `verifyAuditChain` detects a
  modified event, a missing middle event, reordered events, and an
  invalid previous hash (tests: `tests/hash-chain.test.js`, 9 tests).
  LIMITATION (not a claim of tamper-proof storage): the chain
  DETECTS tampering only if the verifier holds an independent copy
  of the head hash; someone with write access can recompute the
  whole chain, there is no externally anchored checkpoint, and
  deleting the TAIL still verifies (a truncated chain is a valid
  prefix). This is tamper evidence, not tamper-proof storage.
  PLACEMENT NOTE: the brief said store.js, but `audit()` lives in
  engine.js (not store.js) and the chain reuses engine.js
  `canonicalJson`/`sha256Hex`; the helpers live next to `audit()`,
  and store.js `load()` imports `ensureAuditBaseline` for the
  migration. engine.js does NOT import store.js — the other
  direction would make tests that statically import the engine and
  then dynamically import the store with a scratch
  `CONVERGE_DATA_FILE` evaluate the store before the env var is set
  and read the production file. (That trap was hit once during this
  work: a test run baselined the production audit trails. The
  production file was restored byte-for-byte from the
  2026-11-07-0016 recovery backup — hash `f3a08d2e…` verified — and
  the import direction was fixed. See
  `docs/IMPLEMENTATION-LOG.md` §31.)
- **Stable CORRECTION claim ids (audit M6 — closed).** Claim ids are
  now `C-` + the first 8 hex chars of SHA-256 of the normalised claim
  text (`stableClaimId`, `server/engine.js`), not positional C1/C2/C3.
  A transcript reorder keeps every claim's id and status; a wording
  change is a different claim (new id) and the old status is
  preserved as orphaned, never rebound. Legacy positional ids are
  still carried as `legacyId` and the endpoint accepts both. Stored
  records migrate once (legacy → stable by current transcript
  position; unmapped keys are preserved as
  `orphanedClaimStatuses`, reported in the case detail response and
  in a 404 with `orphaned: true` when an old id is posted). The
  migration assumes the transcript has not changed since the
  statuses were set — true for production COR-003 (seed transcript).
  (Tests: `tests/claim-ids.test.js`, 6 tests; endpoint behaviour in
  `tests/security.test.js`.)
- **CSRF Origin check (audit L6 — closed).** The client sends the
  session token as a header, not a cookie, so classic cookie-CSRF
  does not directly apply — but a cross-origin POST carrying a
  session token is refused with 403 (`allowedOrigin` in
  server.js; the check was already present from P0 and is now
  pinned by tests: cross-origin + valid token → 403, no Origin →
  proceeds, app origin → proceeds, cross-origin without a token →
  403 before auth). This is the correct mitigation for this
  architecture: the custom header forces a preflight, and the
  Origin check is defence in depth.
- **Explicit CORS policy (audit M17 — closed).** The server sets an
  explicit same-origin policy: `Access-Control-Allow-Origin` only
  for `http://localhost:<PORT>` / `http://127.0.0.1:<PORT>` (no
  wildcard), `Vary: Origin`, preflight answered 204 with
  `Access-Control-Allow-Headers: Content-Type, X-Converge-Session`
  for allowed origins only, no credentials for cross-origin. (This
  was already present from P0; it is now pinned by tests.)
- **Session revocation.** `POST /api/session/revoke` (requires a
  valid token) invalidates that token immediately; the next mutation
  with it gets 401. A Log out button in the header calls it and
  clears the cached token. The next mutating call re-issues a fresh
  session automatically (the demo has no login screen); revocation
  ends THIS session. (Tests: `tests/security.test.js`; the revoke
  logic is `revokeSession()` in `server/security.js`.)
- **Sensitive error-message leakage (audit L5 — closed).** The outer
  catch already answered unexpected errors with a generic 500. The
  one remaining leak — `/api/switch/messages` interpolated raw
  Switch error text into its response — now returns a generic
  "Live room timeline unavailable." (`sanitizePublicError()` in
  `server/security.js` centralises the rule: deliberate validation
  messages pass through, anything else becomes "internal error".)
  400s still name the offending field/value from the caller's own
  input; that is validation, not a leak.
- **File uploads: N/A.** The app has no file-upload surface (no
  `<input type="file">`, no FormData/multipart handling, no upload
  endpoint — verified by a test in `tests/security.test.js`). No
  upload validation was built for a feature that does not exist.
- **Cross-case data isolation (verified).** The correction-claim
  endpoint is case-scoped: a claim id from COR-003 cannot resolve
  against HAG-014 (404), and a status change on COR-003 leaves
  HAG-014's audit and messages byte-identical (tests:
  `tests/security.test.js`).
- **Live XSS probe (audit L22 — closed).** A benign payload
  (`<img src=x onerror="window.__xss=1">` in a scratch case's
  supplier field, plus a `<script>` payload in the ingredient field)
  was run against the real server in a real browser (Playwright)
  and did NOT execute on the case page or the dashboard: no live
  `<img>` element, the payload text visible escaped, 0 console
  errors. Pinned as a repeatable test (`tests/xss-probe.test.js`).
  The probe ran against a scratch instance (same code as
  production) so it never mutated the production data file.
- **axe-core in the suite (audit L23 — closed).** axe-core 4.14.0 is
  now a devDependency and `tests/axe.test.js` runs it in a real
  browser against the dashboard, the HAG-014 overview, and the
  COR-003 negotiation view: **0 violations**. The test serves axe.js
  from the app's own origin via route interception — the strict CSP
  (`script-src 'self'`) is NOT weakened for it. The run found two
  real bugs, both fixed: (1) clickable case/evidence rows carried
  an `aria-label` override that failed WCAG 2.5.3
  (label-content-name-mismatch) — the name now comes from the row's
  visible content; (2) breadcrumb links had no underline and
  1.84:1 contrast (link-in-text-block) — they are now underlined by
  default.
- **`.env.example`** now lists the empty `CONVERGE_LLM_*`
  placeholders (§29.2).

## 3. What is still demo-grade (stated plainly)

- **Loopback-only is the boundary.** The app binds `127.0.0.1`
  only. There is no TLS, no reverse-proxy auth, and no network
  exposure by design. Anyone who can reach the loopback interface
  can obtain a session token (issuance is unauthenticated, capped at
  5/min per IP) and then call every POST endpoint as the demo owner.
  The session token is a **demo boundary**, not production
  authentication: it stops an unauthenticated remote caller and an
  accidental client bug, it does not stop a determined local actor.
  Do not deploy this server on a shared host or expose it beyond
  loopback.
- **Single demo identity.** There is one actor — `Mara · Owner` —
  and one session token per boot. There is no per-user auth, no
  roles (owner vs guest vs agent), and no way to tell two humans
  apart in the audit trail. COURT reader identity is self-selected
  from the listed readers; the token proves a session exists, not
  which reader is sitting at the keyboard. **This is not
  production-ready multi-user authentication and must not be
  described as such.**
- **Sessions are in-memory, with revocation.** A server restart
  invalidates every token (the client re-issues on boot). A live
  token can be revoked immediately (`POST /api/session/revoke`,
  Log out button), but there is no persistent session store and no
  revocation list that survives a restart.
- **No CSRF token.** POSTs are protected by the session header (a
  custom header, so a plain cross-origin form cannot send it) plus
  an explicit Origin check on mutating POSTs (cross-origin + token
  → 403, §2b). There is no CSRF token; the Origin check is the
  mitigation for this architecture, not a substitute for one in a
  cookie-based app.
- **The audit trail has tamper EVIDENCE, not tamper-proof storage.**
  New events chain (prevHash + hash) with a baseline committing to
  old events, and `verifyAuditChain` detects modification, middle
  deletion, reordering, and bad previous hashes — but only if the
  verifier holds an independent copy of the head hash; someone with
  write access can recompute the whole chain, there is no externally
  anchored checkpoint, and deleting the tail still verifies. See
  §2b for the full limitations.

## 4. Residual risks (open, not silently dropped)

| # | Risk | Status |
|---|---|---|
| R1 | A local process or page can obtain a session token and act as the demo owner (single identity, unauthenticated issuance) | Accepted for the demo; loopback-only. Real per-user auth is the fix, not attempted here |
| R2 | No CSRF token on state-changing POSTs (Origin check is the mitigation) | Partially fixed (§31): Origin check + custom header; no token |
| R3 | No CORS policy, no per-endpoint Origin allowlist | **Fixed (§31): explicit same-origin policy, no wildcard, no cross-origin credentials** |
| R4 | Audit trail is a plain JSON array — no hash chain, no separate append-only log | **Fixed (§31) as tamper evidence (see §2b limitations); no separate log, no external checkpoint** |
| R5 | Error responses can leak internal detail on unexpected errors (outer catch returns the raw message) | **Fixed (§31): outer catch generic, Switch error text removed from /api/switch/messages** |
| R6 | Claim ids are positional (`C1`, `C2` by sentence order) and silently rebind if the transcript changes | **Fixed (§31): stable content-derived ids, legacy ids accepted, orphaned statuses preserved** |
| R7 | No live XSS probe — static review complete, `esc()` regression tests exist, but the live probe was blocked by a platform safety filter and not retried | **Fixed (§31): live probe run in a real browser against a scratch instance — payload did not execute; pinned as tests/xss-probe.test.js** |
| R8 | The Switch agent API key is held by the app server process; a compromise of the app server exposes it | Accepted for the demo; the key lives outside the repo and is never sent to the client or logged |
| R9 | VM replacements wipe the running stack; recovery is manual (proven seven times) and the runtime process is not auto-started | Operational risk; see `docs/switch-live-integration.md` §Restarting |
| R10 | `npm audit` cannot run in this sandbox (the registry proxy denies the audit endpoint with 403 policy_denied) — dependency vulnerabilities are unverified | Open; not claimed clean. Re-run outside the sandbox |
| R11 | No per-user auth, no roles, no CSRF token, no persistent sessions | Open by design (demo boundary); see §3 |
| R12 | The production app on :3100 is still running the pre-§31 server code (it was not restarted); the revoke endpoint and the claim migration go live on the next restart. The new client (Log out button) is already served, but on the old server a Log out click only clears the token locally (the server-side token is not revoked until the endpoint exists) | Operational; restart the app to deploy the §31 server code |

## 5. What to check before claiming "secure"

Do not claim more than this document states. The defensible claims
are:

- Unauthenticated POSTs return **401** (verified: a POST without a
  token is rejected; a POST with a token on an invalid transition
  returns 400 — see `docs/IMPLEMENTATION-LOG.md`).
- An agent cannot approve: there is no approve tool, the runtime
  holds no token, and `transitionCase` requires a human actor plus a
  pending approval (tests: `tests/p0-server-core.test.js`,
  `tests/tools.test.js`).
- Approval terms cannot be tampered with after submission without
  the hash check failing (tests: `tests/p0-server-core.test.js`).
- The store survives a crash mid-write (atomic rename + backups;
  tests: `tests/p0-server-core.test.js`).
- The audit trail is hash-chained: a modified, missing (middle),
  reordered, or bad-prevHash event is detected by
  `verifyAuditChain` (tests: `tests/hash-chain.test.js`, 9 tests).
  Tail deletion is NOT detected without an external head hash —
  that limitation is stated, not hidden.
- Claim ids are stable: a reorder keeps every claim's id and
  status; a wording change orphans the old status instead of
  rebinding it (tests: `tests/claim-ids.test.js`, 6 tests).
- A revoked session token gets **401** on the next mutation; a
  cross-origin POST with a token gets **403** (tests:
  `tests/security.test.js`, 17 tests).
- A benign XSS payload in a case field does not execute in a real
  browser (tests: `tests/xss-probe.test.js`).
- The dashboard, HAG-014 overview, and COR-003 negotiation views
  have **0 axe violations** (tests: `tests/axe.test.js`).
- `npm audit` could NOT be run here (registry proxy denies the
  audit endpoint) — dependencies are NOT claimed clean.

The claims **not** made here: per-user authentication, role-based
access control, a CSRF token, tamper-proof audit storage,
production-grade hardening, or a clean dependency audit. None of
those exist yet.
