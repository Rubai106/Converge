// CONVERGE security helpers (§31.3, 2026-11-07) — pure, testable
// functions behind the server's security boundary. The session store
// itself (the sessions Map) stays in server.js; the revocation logic
// lives here and takes the Map as an argument so it can be unit-tested
// without a server.
//
// What is NOT in this file (already implemented, verified by tests in
// tests/security.test.js, documented in docs/SECURITY.md): the
// Origin/Referer check on mutating POSTs and the explicit CORS policy
// — both already exist in server.js (allowedOrigin /
// applyCorsHeaders, added in P0) and are not duplicated here.

// Safe public error text for a response. Deliberate validation errors
// (HttpError: 400/413 with a field-naming message) are safe to return
// as-is — they name the caller's own input, never internals. Anything
// else (Switch error text, stack traces, file paths, internal ids)
// becomes the generic 'internal error'. The outer catch in server.js
// already answered unexpected errors generically; this helper is used
// where an error is interpolated into a response body (notably
// /api/switch/messages, which used to include raw Switch error text).
export function sanitizePublicError(e) {
  if (e && typeof e.statusCode === 'number' && typeof e.message === 'string') return e.message;
  return 'internal error';
}

// Revoke one session token immediately. Returns true when a live
// token was removed, false when the token was unknown or already gone.
// The caller (server.js) requires a valid session before reaching
// this, so revocation is always an authenticated self-revocation —
// one session cannot revoke another's token without holding it.
export function revokeSession(sessions, token) {
  if (!token || typeof token !== 'string') return false;
  return sessions.delete(token);
}
