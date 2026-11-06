# CONVERGE — Security

**Status:** current as of the master-prompt window, 2026-11-07. This
document states the approval boundary as it now stands, what is still
demo-grade, and the residual risks — plainly, so a judge or a reviewer
can check every claim against the code.

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
  to disk by the runtime code.

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
  which reader is sitting at the keyboard.
- **Sessions are in-memory.** A server restart invalidates every
  token (the client re-issues on boot). There is no revocation list
  and no persistent session store.
- **No CSRF token.** POSTs are protected by the session header (a
  custom header, so a plain cross-origin form cannot send it), but
  there is no explicit Origin/Referer check and no CSRF token
  (audit L6, open).
- **No CORS policy.** The server sets no `Access-Control-*` headers.
  Cross-origin browser POSTs are currently blocked only by the
  browser's preflight (the app sends `Content-Type:
  application/json`), not by any server policy; non-browser local
  callers are unaffected.
- **The audit trail has no integrity protection.** It is append-only
  via `audit()` and no endpoint rewrites it, but it is a plain array
  in the same JSON file — anyone with file access can edit or delete
  entries undetected. No hash chain (audit M4, deferred).

## 4. Residual risks (open, not silently dropped)

| # | Risk | Status |
|---|---|---|
| R1 | A local process or page can obtain a session token and act as the demo owner (single identity, unauthenticated issuance) | Accepted for the demo; loopback-only. Real per-user auth is the fix, not attempted here |
| R2 | No CSRF token / Origin check on state-changing POSTs | Open (audit L6) |
| R3 | No CORS policy, no per-endpoint Origin allowlist | Open (audit M17, partially — headers added, CORS not set) |
| R4 | Audit trail is a plain JSON array — no hash chain, no separate append-only log | Open (audit M4, deferred) |
| R5 | Error responses can leak internal detail on unexpected errors (outer catch returns the raw message) | Open (audit L5) |
| R6 | Claim ids are positional (`C1`, `C2` by sentence order) and silently rebind if the transcript changes | Open (audit M6, deferred) |
| R7 | No live XSS probe — static review complete, `esc()` regression tests exist, but the live probe was blocked by a platform safety filter and not retried | Open (audit L22) |
| R8 | The Switch agent API key is held by the app server process; a compromise of the app server exposes it | Accepted for the demo; the key lives outside the repo and is never sent to the client or logged |
| R9 | VM replacements wipe the running stack; recovery is manual (proven seven times) and the runtime process is not auto-started | Operational risk; see `docs/switch-live-integration.md` §Restarting |

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

The claims **not** made here: per-user authentication, role-based
access control, CSRF protection, audit-trail tamper evidence,
production-grade hardening. None of those exist yet.
