// CONVERGE server — Node 24, zero npm dependencies.
// Serves the app, exposes the shared decision-engine API, and hosts the
// SIMULATED Switch stub (see stub-switch.js) when no real server is set.
// Real Switch: set SWITCH_BASE_URL to a real server, SWITCH_API_KEY to a
// real agent key and SWITCH_AGENT_ID to that agent's id; the stub is used
// only when SWITCH_BASE_URL is unset. Verified live 2026-11-06 against
// switch-core 0.31.0 (see docs/switch-live-integration.md).
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { sanitizePublicError, revokeSession } from './security.js';
import { haggleAnalysis, haggleStrategies, normalizeHaggleInputs, courtConflicts, courtTally, extractClaims, claimEvidenceRefs, setClaimStatus, transitionCase, audit, canTransition, adoptCanonical, expirePendingApproval, proposalInputHash, proposalContentHash, migrateCorrectionClaimKeys } from './engine.js';
import { load, save, getCase } from './store.js';
import { listDraftsByCase, getDraft, updateDraft } from './drafts.js';
import { createStubState, stubHealth, stubGetOps, stubCallOp } from './stub-switch.js';
import { probeHealth, getOps, callOp, withRoomConnection, switchTimelineToMessages, SWITCH_VERSION } from './switch-client.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT || 3000);
const SWITCH_BASE_URL = process.env.SWITCH_BASE_URL || '';
const SWITCH_API_KEY = process.env.SWITCH_API_KEY || '';
const SWITCH_AGENT_ID = process.env.SWITCH_AGENT_ID || '';
const SWITCH_BRIDGE_ID = process.env.SWITCH_BRIDGE_ID || '';
const SWITCH_MODE = SWITCH_BASE_URL ? 'REAL-SWITCH' : 'SIMULATED-STUB';
const realSwitch = Boolean(SWITCH_BASE_URL && SWITCH_API_KEY && SWITCH_AGENT_ID);
const stub = createStubState();
let data = load();

// Ensure a real Switch room exists for a case (creates it on first use via
// the live create_room op, persists the room id on the case). Returns the
// room id. Only used when realSwitch is true.
async function ensureRealRoom(c) {
  if (c.switchRoomId) return c.switchRoomId;
  let bridgeId = SWITCH_BRIDGE_ID;
  if (!bridgeId) {
    const bridges = await callOp(SWITCH_BASE_URL, SWITCH_API_KEY, SWITCH_AGENT_ID, 'list_bridges', {});
    const def = (bridges.result || []).find((b) => b.is_default) || (bridges.result || [])[0];
    if (!def) throw new Error('no Switch bridge available');
    bridgeId = def.id;
  }
  const roomName = (c.switchRoom || `#${c.id.toLowerCase()}`).replace(/^#/, '');
  const res = await callOp(SWITCH_BASE_URL, SWITCH_API_KEY, SWITCH_AGENT_ID, 'create_room', {
    name: roomName,
    description: `${c.workflow}: ${c.title}`,
    agent_names: ['converge-facilitator'],
    user_names: ['user'],
    bridge_id: bridgeId,
    instructions: 'You are the CONVERGE facilitator. Use only the deterministic decision-engine maths. Never invent a price or a fact, never present a hypothetical agreement as real, never commit without the human owner approving it in this room.',
  });
  const roomId = res.result?.id;
  if (!roomId) throw new Error('create_room returned no room id');
  c.switchRoomId = roomId;
  save(data);
  return roomId;
}

// ---------- guided HAGGLE case creation (POST /api/cases, /api/cases/preview) ----------
// All money is computed by the deterministic engine (haggleAnalysis /
// haggleStrategies) — never by an LLM. Validation names the offending
// field in every 400 so the guided UI can point at the right input.
const HAGGLE_UNITS = ['fl oz', 'oz', 'lb', 'kg', 'g', 'L', 'ml', 'each', 'serving'];
const HAGGLE_NUMERIC_RANGES = {
  oldPrice: { min: 0, exclusiveMin: false },
  newPrice: { min: 0, exclusiveMin: false },
  qtyPerServing: { min: 0, exclusiveMin: true },
  otherIngredientsCostPerServing: { min: 0, exclusiveMin: false },
  menuPrice: { min: 0, exclusiveMin: true },
  monthlySales: { min: 0, exclusiveMin: false },
  targetFoodCostPct: { min: 0, exclusiveMin: true },
};

const slugify = (s) => String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

function nextHaggleId(d) {
  // Padded sequence, collision-safe: when no HAG-* id parses, max
  // stays 0 and the first id is HAG-001 (no Date.now() fallback —
  // two creations in the same millisecond must never collide).
  let max = 0;
  for (const c of d.cases) {
    const m = /^HAG-(\d+)$/.exec(c.id || '');
    if (m) { max = Math.max(max, Number(m[1])); }
  }
  let n = max + 1;
  let id = `HAG-${String(n).padStart(3, '0')}`;
  while (d.cases.some((c) => c.id === id)) { n += 1; id = `HAG-${String(n).padStart(3, '0')}`; }
  return id;
}

// Validates a HAGGLE creation payload. Returns the normalised input
// (engine-normalised numerics + validated strings). Throws an Error
// naming the field on any invalid input; callers turn it into a 400.
function validateHaggleCreation(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error('Request body must be a JSON object.');
  }
  if (body.workflow !== undefined && body.workflow !== null && body.workflow !== 'HAGGLE') {
    throw new Error('only HAGGLE creation is supported');
  }
  for (const f of ['supplier', 'ingredient']) {
    if (typeof body[f] !== 'string' || !body[f].trim()) {
      throw new Error(`${f} must be a non-empty string.`);
    }
  }
  if (typeof body.unit !== 'string' || !HAGGLE_UNITS.includes(body.unit)) {
    throw new Error(`unit must be one of: ${HAGGLE_UNITS.join(', ')}.`);
  }
  // Field-specific finite/range checks (so the message names the field),
  // then the engine's own normaliser as the canonical pass.
  for (const [k, { min, exclusiveMin }] of Object.entries(HAGGLE_NUMERIC_RANGES)) {
    const v = Number(body[k]);
    if (!Number.isFinite(v)) throw new Error(`${k} must be a finite number.`);
    if (exclusiveMin ? !(v > min) : !(v >= min)) {
      throw new Error(`${k} must be ${exclusiveMin ? 'greater than' : 'at least'} ${min}.`);
    }
  }
  for (const k of ['targetPrice', 'maxApprovedPrice']) {
    const v = Number(body[k]);
    if (!Number.isFinite(v)) throw new Error(`${k} must be a finite number.`);
    if (v < 0) throw new Error(`${k} must be at least 0.`);
  }
  if (Number(body.targetPrice) > Number(body.maxApprovedPrice)) {
    throw new Error('targetPrice must be less than or equal to maxApprovedPrice.');
  }
  if (body.recipe !== undefined && body.recipe !== null && typeof body.recipe !== 'string') {
    throw new Error('recipe must be a string.');
  }
  if (body.evidenceSource !== undefined && body.evidenceSource !== null && typeof body.evidenceSource !== 'string') {
    throw new Error('evidenceSource must be a string.');
  }
  const numeric = normalizeHaggleInputs(body);
  return {
    supplier: body.supplier.trim(),
    ingredient: body.ingredient.trim(),
    recipe: typeof body.recipe === 'string' ? body.recipe : '',
    oldPrice: numeric.oldPrice,
    newPrice: numeric.newPrice,
    unit: body.unit,
    qtyPerServing: numeric.qtyPerServing,
    otherIngredientsCostPerServing: numeric.otherIngredientsCostPerServing,
    menuPrice: numeric.menuPrice,
    monthlySales: numeric.monthlySales,
    targetFoodCostPct: numeric.targetFoodCostPct,
    targetPrice: Number(body.targetPrice),
    maxApprovedPrice: Number(body.maxApprovedPrice),
  };
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.md': 'text/markdown' };

// ---------- Session-token auth (P0, 2026-11-07) ----------
// The "human-only" approval gate used to be a client-supplied string
// (body.actorKind, defaulting to 'human') — any local caller could
// approve. Now every mutating endpoint (all POST routes) requires a
// session token issued by POST /api/session. The token is a random
// UUID held server-side in memory (24h expiry); the actor for every
// privileged action is derived from the stored session, NEVER from the
// request body — body.actor / body.actorKind are ignored entirely.
// The agent runtime never calls /api/session and never holds a token
// (that is enforced by the runtime, not by this server).
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const SESSION_ACTOR = { name: 'Mara · Owner', kind: 'human' };
const sessions = new Map(); // token -> { actor, expiresAt }
function issueSession() {
  const token = randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  sessions.set(token, { actor: SESSION_ACTOR, expiresAt });
  return { token, actor: SESSION_ACTOR, expiresAt };
}
function getSession(req) {
  const token = req.headers['x-converge-session'];
  if (!token || typeof token !== 'string') return null;
  const s = sessions.get(token);
  if (!s) return null;
  if (Date.now() > new Date(s.expiresAt).getTime()) { sessions.delete(token); return null; }
  return s;
}

// ---------- Rate limiting: per-IP token bucket (P0, 2026-11-07) ----------
// Session issuance is capped at 5 per minute per IP; all other POST
// routes share a 60-per-minute bucket per IP. Buckets are in-memory and
// per server instance. When empty the server answers 429.
const buckets = new Map(); // key -> { tokens, updatedAt }
function takeToken(key, capacity, refillPerMs) {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b) { b = { tokens: capacity, updatedAt: now }; buckets.set(key, b); }
  b.tokens = Math.min(capacity, b.tokens + (now - b.updatedAt) * refillPerMs);
  b.updatedAt = now;
  if (b.tokens < 1) return false;
  b.tokens -= 1;
  return true;
}
const SESSION_BUCKET = { capacity: 5, refillPerMs: 5 / 60000 };
const POST_BUCKET = { capacity: 60, refillPerMs: 60 / 60000 };

// ---------- CORS: explicit same-origin policy (P0, 2026-11-07) ----------
// The app is served by this server, so a browser origin is only ever
// this server's own origin (localhost or 127.0.0.1 on this PORT).
// Requests without an Origin (curl, node fetch, server-to-server) are
// allowed; a present Origin outside the allowed set is refused.
function allowedOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return null;
  if (origin === `http://localhost:${PORT}` || origin === `http://127.0.0.1:${PORT}`) return origin;
  return false;
}
function applyCorsHeaders(req, res) {
  const origin = allowedOrigin(req);
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  return origin;
}

function send(res, status, body, type = 'application/json') {
  const headers = {
    'Content-Type': type,
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
  };
  // CSP for the served app: the app has no inline scripts, inline
  // styles, or inline event-handler attributes (all handlers are
  // assigned in app.js), so a strict self-only policy is safe.
  if (type === 'text/html') {
    headers['Content-Security-Policy'] = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'";
  }
  res.writeHead(status, headers);
  res.end(typeof body === 'string' ? body : JSON.stringify(body, null, 2));
}

// An error carrying the HTTP status it must be answered with. readBody
// throws these (413 over the cap, 400 on malformed JSON); the outer
// catch answers them directly instead of turning them into 500s.
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.statusCode = status;
  }
}
const MAX_BODY_BYTES = 1024 * 1024; // 1 MB
async function readBody(req) {
  let bytes = 0;
  const chunks = [];
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > MAX_BODY_BYTES) throw new HttpError(413, 'Request body is too large (max 1 MB).');
    chunks.push(chunk);
  }
  const s = Buffer.concat(chunks).toString('utf8');
  if (!s) return {};
  try {
    return JSON.parse(s);
  } catch {
    throw new HttpError(400, 'Request body must be valid JSON.');
  }
}

// ---------- public case view (COURT blindness) ----------
// COURT server-side blindness (hardening 2026-11-06): the sample→version
// mapping is blind information. Until every reader has submitted, the API
// returns samples as code-only [{code}] — the mapping never leaves the
// server, so no client can recover it by inspecting JSON. Once the
// ratings are complete the full mapping is revealed with the tally.
// Individual scores stay visible by design (the heat table shows scores
// as submitted; the UI copy says so). What is withheld is the mapping
// and the official tally — the derived result, not the raw scores. A
// caller could average visible scores by hand; that is inherent to the
// chosen transparency and is documented, not hidden.
function courtRatingsComplete(c) {
  const expected = (c.readers?.length || 0) * (c.samples?.length || 0);
  return expected > 0 && (c.ratings || []).length >= expected;
}
function publicCaseView(c) {
  if (c.workflow !== 'COURT' || courtRatingsComplete(c)) return c;
  const { samples, ...rest } = c;
  return { ...rest, samples: (samples || []).map((s) => ({ code: s.code })) };
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  try {
    // CORS preflight: answered without auth, only for an allowed origin.
    if (req.method === 'OPTIONS') {
      const origin = applyCorsHeaders(req, res);
      if (origin) {
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Converge-Session');
        res.setHeader('Access-Control-Max-Age', '600');
      }
      res.writeHead(204);
      return res.end();
    }
    applyCorsHeaders(req, res);
    // Same-origin policy for state-changing requests: a present Origin
    // outside this server's own origin is refused outright (the
    // X-Converge-Session header already forces a preflight for browsers,
    // so this is defence in depth, not the only control).
    if (req.method === 'POST' && allowedOrigin(req) === false) {
      return send(res, 403, { error: 'Cross-origin requests are not allowed.' });
    }
    // Session issuance: rate-limited, no token required (it issues one).
    if (url.pathname === '/api/session' && req.method === 'POST') {
      const ip = req.socket.remoteAddress || 'unknown';
      if (!takeToken(`${ip}:session`, SESSION_BUCKET.capacity, SESSION_BUCKET.refillPerMs)) {
        return send(res, 429, { error: 'Too many session requests — try again in a minute.' });
      }
      return send(res, 200, issueSession());
    }
    // Every other POST route requires a valid, unexpired session token.
    if (req.method === 'POST') {
      const ip = req.socket.remoteAddress || 'unknown';
      if (!takeToken(`${ip}:post`, POST_BUCKET.capacity, POST_BUCKET.refillPerMs)) {
        return send(res, 429, { error: 'Too many requests — slow down and try again.' });
      }
      const session = getSession(req);
      if (!session) {
        return send(res, 401, { error: 'A valid session token is required — POST /api/session and send the token as the X-Converge-Session header.' });
      }
      req.session = session;
    }
    // --- API: session revocation (§31.3, 2026-11-07) ---
    // Requires a valid session token (the POST gate above already
    // validated it). Revokes the token presented — an authenticated
    // self-revocation; the next mutation with this token gets 401.
    // The client Log out button calls this, then clears its cached
    // token. Note the next mutating call re-issues a fresh session
    // automatically (the demo has no login screen); revocation ends
    // THIS session, it does not lock the browser out.
    if (url.pathname === '/api/session/revoke' && req.method === 'POST') {
      const revoked = revokeSession(sessions, req.headers['x-converge-session']);
      return send(res, 200, { revoked });
    }
    // --- static app ---
    if (url.pathname === '/' || url.pathname.startsWith('/app/')) {
      const p = url.pathname === '/' ? '/app/index.html' : url.pathname;
      const file = join(root, p);
      if (existsSync(file)) return send(res, 200, readFileSync(file, 'utf8'), MIME[extname(file)] || 'text/plain');
      return send(res, 404, { error: 'not found' });
    }
    // --- API: cases ---
    if (url.pathname === '/api/cases' && req.method === 'GET') {
      // A stale pending proposal expires on read, with an audit event.
      let changed = false;
      for (const c of data.cases) if (expirePendingApproval(c)) changed = true;
      if (changed) save(data);
      return send(res, 200, data.cases.map(publicCaseView));
    }
    // --- API: guided HAGGLE case creation (no LLM money maths) ---
    if (url.pathname === '/api/cases/preview' && req.method === 'POST') {
      const body = await readBody(req);
      try {
        const input = validateHaggleCreation(body);
        const analysis = haggleAnalysis(input);
        return send(res, 200, { analysis, strategies: haggleStrategies(analysis, input) });
      } catch (e) { return send(res, 400, { error: String(e.message || e) }); }
    }
    if (url.pathname === '/api/cases' && req.method === 'POST') {
      const body = await readBody(req);
      let input;
      try { input = validateHaggleCreation(body); } catch (e) { return send(res, 400, { error: String(e.message || e) }); }
      const id = nextHaggleId(data);
      const evidenceSource = typeof body.evidenceSource === 'string' ? body.evidenceSource.trim() : '';
      const c = {
        id, workflow: 'HAGGLE', title: `${input.supplier} ${input.ingredient} price rise`,
        state: 'DISCUSSION', demo: true,
        participants: [
          { name: 'Mara (owner)', role: 'owner', kind: 'human' },
          { name: 'Negotiation Agent', role: 'negotiator', kind: 'agent' },
          { name: 'Financial Analyst', role: 'analyst', kind: 'agent' },
        ],
        input,
        switchRoom: `#haggle-${slugify(input.supplier)}-${slugify(input.ingredient)}`,
        switchRoomId: null,
        proposals: [], pendingApproval: null, approval: null,
        audit: [], messages: [],
        evidence: evidenceSource
          ? [{ id: 'E1', type: 'source', source: evidenceSource, status: 'Unverified', note: 'Source provided at case creation; not verified.' }]
          : [],
      };
      audit(c, req.session.actor, 'case-created', { supplier: input.supplier, ingredient: input.ingredient });
      data.cases.push(c);
      // Room creation must never fail the case: a room failure is
      // reported as roomError on the 201 response, and the case stands.
      let roomError = null;
      try {
        if (realSwitch) {
          await ensureRealRoom(c);
        } else {
          const room = stubCallOp(stub, 'create_room', { name: c.switchRoom, members: c.participants.map((p) => p.name) });
          if (!room?.id) throw new Error('stub create_room returned no room id');
          c.switchRoomId = room.id;
          c.switchRoomSimulated = true;
        }
      } catch (e) { roomError = String(e.message || e); }
      save(data);
      const analysis = haggleAnalysis(c.input);
      const out = { ...c, analysis, strategies: haggleStrategies(analysis, c.input) };
      if (roomError) out.roomError = roomError;
      return send(res, 201, out);
    }
    if (url.pathname === '/api/status' && req.method === 'GET') {
      let switchHealth = stubHealth();
      if (SWITCH_BASE_URL) { try { switchHealth = await probeHealth(SWITCH_BASE_URL); } catch (e) { switchHealth = { ok: false, error: String(e) }; } }
      // BUG-3 (QA 2026-11-06): the reported mode is health-derived, not
      // config-derived. A configured-but-dead server used to report
      // REAL-SWITCH while switchHealth.ok was false, so the UI pill,
      // drawer and footer all claimed the integration was live when it
      // was not. Now the mode says UNREACHABLE until the probe succeeds.
      const effectiveMode = !SWITCH_BASE_URL ? 'SIMULATED-STUB' : (switchHealth.ok ? 'REAL-SWITCH' : 'SWITCH-UNREACHABLE');
      return send(res, 200, { switchMode: effectiveMode, switchConfigured: Boolean(SWITCH_BASE_URL), switchVersion: SWITCH_VERSION, switchHealth, cases: data.cases.length });
    }
    const caseMatch = url.pathname.match(/^\/api\/cases\/([\w-]+)$/);
    if (caseMatch && req.method === 'GET') {
      const c = getCase(data, caseMatch[1]);
      if (!c) return send(res, 404, { error: 'case not found' });
      // A stale pending proposal expires on read, with an audit event.
      if (expirePendingApproval(c)) save(data);
      const out = { ...c };
      if (c.workflow === 'HAGGLE') { out.analysis = haggleAnalysis(c.input); out.strategies = haggleStrategies(out.analysis, c.input); }
      if (c.workflow === 'COURT') {
        out.conflicts = courtConflicts(c.versions);
        out.readers = c.readers || [];
        out.ratings = c.ratings || [];
        out.ratingsExpected = (c.readers?.length || 0) * (c.samples?.length || 0);
        out.ratingsComplete = out.ratingsExpected > 0 && out.ratings.length >= out.ratingsExpected;
        // Scores are revealed only after every reader has submitted.
        out.tally = out.ratingsComplete ? courtTally(out.ratings) : null;
        // The sample→version mapping is withheld until the ratings are
        // complete (see publicCaseView). Code-only samples here, too —
        // the detail endpoint used to leak the mapping even though the
        // list endpoint was fixed.
        out.samples = out.ratingsComplete ? (c.samples || []) : (c.samples || []).map((s) => ({ code: s.code }));
      }
      if (c.workflow === 'CORRECTION') {
        // §31.2: one-time migration of legacy positional claim keys
        // (C1/C2/C3) to stable content-derived ids; orphaned records
        // are preserved on the case, never silently dropped.
        if (migrateCorrectionClaimKeys(c)) save(data);
        const claims = extractClaims(c.transcript).map((cl) => ({
          ...cl,
          status: c.claimStatuses?.[cl.id] || cl.status,
          guestChallenge: c.claimChallenges?.[cl.id] || null,
        }));
        // L5: each claim's evidence references come from the server
        // (matched against the case's evidence notes), not a client map.
        const refs = claimEvidenceRefs(claims, c.evidence || []);
        out.claims = claims.map((cl) => ({ ...cl, evidence: refs[cl.id] || [] }));
        if (c.orphanedClaimStatuses && Object.keys(c.orphanedClaimStatuses).length) {
          out.orphanedClaimStatuses = c.orphanedClaimStatuses;
        }
      }
      return send(res, 200, out);
    }
    // --- API: transition / approve (human only for APPROVED) ---
    // The actor is the session actor — body.actor / body.actorKind are
    // ignored entirely (P0: the old self-asserted gate defaulted to
    // human). A proposal submission creates a versioned proposal record
    // with a content hash; the approval binds to it and is rejected if
    // the hash does not match.
    const transMatch = url.pathname.match(/^\/api\/cases\/([\w-]+)\/transition$/);
    if (transMatch && req.method === 'POST') {
      const c = getCase(data, transMatch[1]);
      if (!c) return send(res, 404, { error: 'case not found' });
      const body = await readBody(req);
      const actor = req.session.actor;
      // A stale pending proposal expires before anything acts on it.
      if (expirePendingApproval(c)) save(data);
      // Idempotent re-approve: a retried approve after success returns
      // the existing approval (200) instead of 400 — the client cannot
      // otherwise tell "already approved" from "never submitted".
      if (body.to === 'APPROVED' && !c.pendingApproval && c.approval && body.proposalId
        && c.approval.proposalId === body.proposalId
        && (body.version === undefined || Number(body.version) === c.approval.version)) {
        return send(res, 200, c);
      }
      // GAP-1 (2026-11-06): entering AWAITING_APPROVAL without a proposal
      // strands the case — no pendingApproval, so no Approve/Reject
      // buttons and no path forward. The ONLY way in is the approval
      // modal, which sends proposalId + terms. Reject the bare move here
      // so the strand is impossible even via a direct API call.
      if (body.to === 'AWAITING_APPROVAL' && !body.proposalId) {
        return send(res, 400, { error: 'proposalId is required to move a case to AWAITING_APPROVAL — submit a proposal through the approval flow.' });
      }
      // GAP-2 (2026-11-06): a second proposal while one is already
      // pending would silently overwrite it. The Submit button never
      // offers this (Approve/Reject render instead), but the API must
      // enforce it — including against a double-click racing the UI.
      if (body.to === 'AWAITING_APPROVAL' && c.pendingApproval) {
        return send(res, 400, { error: 'A proposal is already pending for this case — approve or reject it before submitting another.' });
      }
      // Resolve the strategy for a HAGGLE proposal and build its
      // versioned record (GAP-2 validation + hash binding). A
      // proposalId must name a real strategy for this HAGGLE case:
      // P-numbers are positional in the engine's strategy order (P1 =
      // first strategy, …); a strategy id, a P-number beyond the
      // case's strategies, or a malformed id is rejected. Non-HAGGLE
      // cases carry no strategies, so the record is HAGGLE-only and
      // their existing behaviour is unchanged.
      let proposalRecord = null;
      if (body.to === 'AWAITING_APPROVAL' && c.workflow === 'HAGGLE') {
        let strategies;
        try {
          strategies = haggleStrategies(haggleAnalysis(c.input), c.input);
        } catch (e) {
          return send(res, 400, { error: `Cannot validate the proposal — this case's inputs are invalid: ${String(e.message || e)}` });
        }
        const m = /^P([1-9]\d*)$/.exec(String(body.proposalId || ''));
        if (!m || Number(m[1]) > strategies.length) {
          return send(res, 400, { error: `Unknown proposal ${body.proposalId} — submit a proposal for one of this case's strategies (P1–P${strategies.length}).` });
        }
        const strategy = strategies[Number(m[1]) - 1];
        // Canonical terms, derived from the strategy — never the
        // client-supplied free text (the old flow stored body.terms
        // unvalidated, so an approval could record terms never
        // proposed). Same format the client computes: money(unitPrice)
        // + ' / ' + unit + ' for ' + duration.
        const terms = `$${strategy.unitPrice.toFixed(2)} / ${c.input.unit} for ${strategy.duration}`;
        const inputHash = proposalInputHash(c.input, strategy);
        const version = (c.proposals || [])
          .filter((p) => p.id === body.proposalId && typeof p.version === 'number')
          .reduce((max, p) => Math.max(max, p.version), 0) + 1;
        const now = new Date().toISOString();
        proposalRecord = {
          id: body.proposalId, version, strategyId: strategy.id, terms,
          inputHash, createdAt: now, requestedAt: now,
        };
        proposalRecord.contentHash = proposalContentHash(proposalRecord);
      }
      try {
        transitionCase(c, body.to, actor);
        if (body.to === 'AWAITING_APPROVAL' && body.proposalId) {
          if (proposalRecord) {
            c.proposals = c.proposals || [];
            c.proposals.push(proposalRecord);
            c.pendingApproval = {
              proposalId: proposalRecord.id, version: proposalRecord.version,
              contentHash: proposalRecord.contentHash, terms: proposalRecord.terms,
              requestedBy: actor.name, requestedAt: proposalRecord.requestedAt,
            };
          } else {
            c.pendingApproval = { proposalId: body.proposalId, terms: body.terms || '', requestedBy: actor.name, requestedAt: new Date().toISOString() };
          }
        }
        save(data);
        return send(res, 200, c);
      } catch (e) { return send(res, 400, { error: String(e.message || e) }); }
    }
    // --- API: court ratings (blind until all submitted; persisted) ---
    if (url.pathname === '/api/court/rate' && req.method === 'POST') {
      const body = await readBody(req);
      const c = getCase(data, body.caseId);
      if (!c || c.workflow !== 'COURT') return send(res, 404, { error: 'COURT case not found' });
      const readers = c.readers || [];
      const samples = (c.samples || []).map((s) => s.code);
      const dims = ['taste', 'texture', 'aroma', 'appearance', 'difficulty', 'overall'];
      if (!readers.includes(body.reader)) return send(res, 400, { error: `Unknown reader ${body.reader}` });
      if (!samples.includes(body.sampleCode)) return send(res, 400, { error: `Unknown sample ${body.sampleCode}` });
      if (!body.scores || !dims.every((d) => Number.isInteger(body.scores[d]) && body.scores[d] >= 1 && body.scores[d] <= 5)) {
        return send(res, 400, { error: 'Scores must be integers 1-5 for taste, texture, aroma, appearance, difficulty, overall' });
      }
      c.ratings = c.ratings || [];
      if (c.ratings.some((r) => r.reader === body.reader && r.sampleCode === body.sampleCode)) {
        return send(res, 409, { error: `${body.reader} already rated ${body.sampleCode}` });
      }
      c.ratings.push({ reader: body.reader, sampleCode: body.sampleCode, scores: body.scores });
      audit(c, req.session.actor, 'court-rating', { sampleCode: body.sampleCode, reader: body.reader });
      save(data);
      const expected = readers.length * samples.length;
      const complete = c.ratings.length >= expected;
      return send(res, 200, { submitted: c.ratings.length, expected, complete, tally: complete ? courtTally(c.ratings) : null });
    }
    // --- API: court version submission (H11) + canonical adoption (H12) ---
    // A version may be added only while the case has zero ratings:
    // adding a sample mid-test would change the tally's expected count.
    // Human-only, like the other human-only endpoints. The new sample
    // gets the next code (S4, S5, ...) with its version field, so the
    // blind mapping stays server-held until the tally completes.
    if (url.pathname === '/api/court/version' && req.method === 'POST') {
      const body = await readBody(req);
      // Human-only: the session actor is always human (the agent runtime
      // never holds a session token), so no body.actorKind check remains.
      const c = getCase(data, body.caseId);
      if (!c || c.workflow !== 'COURT') return send(res, 404, { error: 'COURT case not found' });
      const author = typeof body.author === 'string' ? body.author.trim() : '';
      if (!author) return send(res, 400, { error: 'author must be a non-empty string.' });
      if (!body.ingredients || typeof body.ingredients !== 'object' || Array.isArray(body.ingredients) || !Object.keys(body.ingredients).length) {
        return send(res, 400, { error: 'ingredients must be a non-empty object of ingredient to amount.' });
      }
      for (const [k, v] of Object.entries(body.ingredients)) {
        if (typeof v !== 'string' || !v.trim()) return send(res, 400, { error: `ingredients.${k} must be a non-empty string.` });
      }
      if (body.steps !== undefined && body.steps !== null && (!Array.isArray(body.steps) || body.steps.some((s) => typeof s !== 'string' || !s.trim()))) {
        return send(res, 400, { error: 'steps must be an array of non-empty strings.' });
      }
      if ((c.ratings || []).length > 0) {
        return send(res, 400, { error: `Versions cannot be added once ratings have begun — ${c.ratings.length} rating(s) already submitted. Adding a sample mid-test would change the tally's expected count.` });
      }
      let base = slugify(author) || 'version';
      let id = base; let n = 2;
      while ((c.versions || []).some((v) => v.id === id)) { id = `${base}-${n}`; n += 1; }
      const version = { id, author, ingredients: body.ingredients };
      if (body.steps) version.steps = body.steps;
      c.versions = c.versions || [];
      c.versions.push(version);
      const sampleCode = `S${(c.samples || []).length + 1}`;
      c.samples = c.samples || [];
      c.samples.push({ code: sampleCode, version: id });
      audit(c, req.session.actor, 'court-version-added', { version: id, sampleCode, author });
      save(data);
      const expected = (c.readers?.length || 0) * c.samples.length;
      return send(res, 201, { caseId: c.id, version, sampleCode, samples: c.samples.map((s) => ({ code: s.code })), ratingsExpected: expected });
    }
    if (url.pathname === '/api/court/adopt' && req.method === 'POST') {
      const body = await readBody(req);
      // Human-only: the session actor is always human (see /api/court/version).
      const c = getCase(data, body.caseId);
      if (!c || c.workflow !== 'COURT') return send(res, 404, { error: 'COURT case not found' });
      try {
        const adoption = adoptCanonical(c, body.version || null, req.session.actor);
        save(data);
        return send(res, 200, { caseId: c.id, canonicalVersion: c.canonicalVersion, adoption });
      } catch (e) { return send(res, 400, { error: String(e.message || e) }); }
    }
    if (url.pathname === '/api/court/tally' && req.method === 'POST') {
      const body = await readBody(req);
      // Hardening 2026-11-06: this used to be an open compute endpoint —
      // any caller could POST arbitrary ratings (including the case's own
      // visible scores) and get the tally before the case was complete,
      // bypassing the tally-completeness rule. It is now case-bound: the
      // tally is computed only from the case's stored ratings, and only
      // when that case's ratings are complete. Caller-supplied ratings
      // are ignored entirely. The engine maths (courtTally) is unchanged.
      const c = body.caseId ? getCase(data, body.caseId) : null;
      if (!c || c.workflow !== 'COURT') return send(res, 404, { error: 'COURT case not found' });
      const expected = (c.readers?.length || 0) * (c.samples?.length || 0);
      const complete = expected > 0 && (c.ratings || []).length >= expected;
      if (!complete) return send(res, 200, { tally: null, complete: false, submitted: (c.ratings || []).length, expected, note: 'Scores are revealed only after every reader has submitted.' });
      return send(res, 200, { tally: courtTally(c.ratings), complete: true, submitted: c.ratings.length, expected });
    }
    // --- API: correction claim status (human only; persisted + audited) ---
    if (url.pathname === '/api/correction/claim' && req.method === 'POST') {
      const body = await readBody(req);
      const c = body.caseId ? getCase(data, body.caseId) : data.cases.find((x) => x.workflow === 'CORRECTION');
      if (!c) return send(res, 404, { error: 'CORRECTION case not found' });
      // §31.2: migrate legacy positional claim keys to stable ids
      // before resolving — after migration, stored keys are stable.
      if (migrateCorrectionClaimKeys(c)) save(data);
      const claims = extractClaims(c.transcript);
      // Accept BOTH ids: the stable content-derived id (current) and
      // the legacy positional id (C1/C2/C3, for old clients and old
      // audit references). Both resolve to the same claim; all stored
      // records are keyed by the stable id.
      const base = claims.find((cl) => cl.id === body.id) || claims.find((cl) => cl.legacyId === body.id);
      if (!base) {
        const orphaned = c.orphanedClaimStatuses?.[body.id] ?? c.claimStatuses?.[body.id];
        if (orphaned !== undefined) {
          return send(res, 404, { error: `Claim ${body.id} no longer matches any current claim — its text changed and its status was preserved as orphaned, not rebound to another claim.`, orphaned: true, storedStatus: orphaned });
        }
        return send(res, 404, { error: `Claim ${body.id} not found` });
      }
      const claim = { ...base, status: c.claimStatuses?.[base.id] || base.status };
      try {
        // Human-only: the session actor is always human; body.actor /
        // body.actorKind are ignored entirely.
        setClaimStatus(claim, body.status, req.session.actor);
        c.claimStatuses = c.claimStatuses || {};
        c.claimStatuses[base.id] = claim.status;
        if (body.challenge) {
          c.claimChallenges = c.claimChallenges || {};
          // A re-challenge used to overwrite the previous one, losing
          // the original text (QA 2026-11-06 observation). Keep the
          // history; the newest challenge stays the current one.
          const prev = c.claimChallenges[base.id];
          if (prev) {
            c.claimChallengeHistory = c.claimChallengeHistory || {};
            (c.claimChallengeHistory[base.id] = c.claimChallengeHistory[base.id] || []).push(prev);
          }
          // The challenge is submitted AS the episode guest (the "Submit
          // challenge as guest" form) — its attribution is the guest
          // participant recorded on the case, not the session actor
          // operating the UI (the audit event still records the session
          // actor). Falls back to the session actor if the case has no
          // guest participant.
          const guest = (c.participants || []).find((p) => p.role === 'guest');
          c.claimChallenges[base.id] = { text: body.challenge.text || '', evidence: body.challenge.evidence || null, by: guest?.name || req.session.actor.name };
          claim.guestChallenge = c.claimChallenges[base.id];
          if (c.claimChallengeHistory?.[base.id]?.length) claim.challengeHistory = c.claimChallengeHistory[base.id];
        }
        audit(c, req.session.actor, 'claim-status', { claim: base.id, status: claim.status });
        save(data);
        return send(res, 200, claim);
      } catch (e) { return send(res, 400, { error: String(e.message || e) }); }
    }
    // --- API: agent drafts — the human-mediated handoff (§30) ---
    // The runtime appends drafts to the local inbox (server/drafts.js);
    // it never calls these endpoints and never holds a session token.
    // Every mutation here requires a valid human session (the central
    // POST gate above 401s without one). Sharing a draft is NOT an
    // approval: the posted text says so, and the owner must still
    // separately approve any consequential agreement.
    if (url.pathname === '/api/drafts' && req.method === 'GET') {
      const caseId = url.searchParams.get('caseId') || '';
      if (!caseId) return send(res, 400, { error: 'caseId is required.' });
      const c = getCase(data, caseId);
      if (!c) return send(res, 404, { error: 'case not found' });
      return send(res, 200, { caseId, drafts: listDraftsByCase(caseId) });
    }
    const draftMatch = url.pathname.match(/^\/api\/drafts\/([\w-]+)\/(review|share|reject|archive|request-revision)$/);
    if (draftMatch && req.method === 'POST') {
      const [, draftId, action] = draftMatch;
      const body = await readBody(req);
      const draft = getDraft(draftId);
      if (!draft) return send(res, 404, { error: 'draft not found' });
      const actor = req.session.actor;
      const now = new Date().toISOString();
      // The case audit is a secondary record (the drafts file is the
      // authoritative state). A failed case save must never turn a
      // completed draft action into a 500 — it is logged, not hidden.
      const auditCase = (event, detail) => {
        try {
          const c = getCase(data, draft.caseId);
          if (c) { audit(c, actor, event, detail); save(data); }
        } catch (e) { console.error('CONVERGE draft audit failed:', e); }
      };
      if (action === 'review') {
        if (draft.status === 'UNDER_REVIEW') return send(res, 200, draft);
        if (draft.status !== 'GENERATED') {
          return send(res, 400, { error: `Cannot review a draft in status ${draft.status}.` });
        }
        const updated = updateDraft(draftId, (d) => { d.status = 'UNDER_REVIEW'; d.reviewedBy = actor.name; d.reviewedAt = now; });
        auditCase('draft-reviewed', { draftId, caseId: draft.caseId });
        return send(res, 200, updated);
      }
      if (action === 'reject') {
        if (draft.status === 'REJECTED') return send(res, 200, draft);
        if (draft.status !== 'GENERATED' && draft.status !== 'UNDER_REVIEW') {
          return send(res, 400, { error: `Cannot reject a draft in status ${draft.status}.` });
        }
        const updated = updateDraft(draftId, (d) => { d.status = 'REJECTED'; d.rejectedBy = actor.name; d.rejectedAt = now; });
        auditCase('draft-rejected', { draftId, caseId: draft.caseId });
        return send(res, 200, updated);
      }
      if (action === 'archive') {
        if (draft.status === 'ARCHIVED') return send(res, 200, draft);
        const updated = updateDraft(draftId, (d) => { d.status = 'ARCHIVED'; d.archivedBy = actor.name; d.archivedAt = now; });
        auditCase('draft-archived', { draftId, caseId: draft.caseId });
        return send(res, 200, updated);
      }
      if (action === 'request-revision') {
        if (draft.status !== 'GENERATED' && draft.status !== 'UNDER_REVIEW') {
          return send(res, 400, { error: `Cannot request a revision for a draft in status ${draft.status}.` });
        }
        const note = typeof body.note === 'string' ? body.note.trim().slice(0, 1000) : '';
        const updated = updateDraft(draftId, (d) => {
          d.status = 'UNDER_REVIEW';
          d.revisionRequested = { note, by: actor.name, at: now };
          d.revisionHistory = d.revisionHistory || [];
          d.revisionHistory.push({ note, by: actor.name, at: now });
        });
        auditCase('draft-revision-requested', { draftId, caseId: draft.caseId });
        return send(res, 200, updated);
      }
      // --- share: the human-mediated Mattermost publication ---
      if (draft.status === 'SHARED') {
        return send(res, 409, { error: 'This draft has already been shared.' });
      }
      if (draft.status !== 'GENERATED' && draft.status !== 'UNDER_REVIEW') {
        return send(res, 400, { error: `Cannot share a draft in status ${draft.status}.` });
      }
      const caseId = typeof body.caseId === 'string' ? body.caseId : '';
      if (!caseId) return send(res, 400, { error: 'caseId is required.' });
      if (draft.caseId !== caseId) {
        return send(res, 400, { error: `Draft ${draftId} belongs to case ${draft.caseId}, not ${caseId}.` });
      }
      const c = getCase(data, caseId);
      if (!c) return send(res, 404, { error: 'case not found' });
      // The posted text is labelled a draft and states plainly that
      // sharing is not approval. ASCII only: switch-core 500s on em
      // dashes, so dashes and smart quotes are replaced (the stored
      // draft keeps its original text; the replacement is recorded).
      // ASCII only: switch-core 500s on any non-ASCII character
      // (em dash, smart quotes, the middle dot in "Mara · Owner").
      // Replace the known punctuation, then drop anything else
      // outside printable ASCII so the posted text is always safe.
      const clean = (s) => String(s || '').replace(/[\u2014\u2013]/g, '-').replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/[^\x20-\x7E\n]/g, '');
      const header = `[CONVERGE draft - facilitator, ${draft.role}]`;
      const footer = clean(`Draft only, shared by ${actor.name} for review. Sharing is not approval: the owner must separately approve any agreement.`);
      const draftText = clean(draft.draft);
      const sanitized = draftText !== String(draft.draft || '');
      const budget = 4000 - header.length - footer.length - 4; // blank lines
      const shown = draftText.length > budget ? `${draftText.slice(0, Math.max(0, budget - 3))}...` : draftText;
      const shareText = `${header}\n\n${shown}\n\n${footer}`;
      let shareResult;
      try {
        if (realSwitch) {
          const roomId = await ensureRealRoom(c);
          const result = await withRoomConnection(SWITCH_BASE_URL, SWITCH_API_KEY, SWITCH_AGENT_ID, roomId, async (connectionId) => {
            return callOp(SWITCH_BASE_URL, SWITCH_API_KEY, SWITCH_AGENT_ID, 'post_message', { body: shareText }, connectionId);
          });
          shareResult = { eventId: result.result?.event_id || null, roomId, room: c.switchRoom, simulated: false, sanitized };
        } else {
          const msg = stubCallOp(stub, 'post_message', { room: c.switchRoom, roomId: c.switchRoomId, text: shareText, author: actor.name });
          shareResult = { eventId: msg?.id || null, roomId: c.switchRoomId || null, room: c.switchRoom, simulated: true, sanitized };
        }
      } catch (e) {
        // The post failed: record the failure on the draft, keep the
        // status unchanged, and report the failure honestly — never
        // claim a share that did not happen.
        const failed = updateDraft(draftId, (d) => { d.shareError = { message: String(e.message || e).slice(0, 500), at: now }; });
        return send(res, 502, { error: `Sharing failed: ${String(e.message || e).slice(0, 200)}`, draft: failed });
      }
      const updated = updateDraft(draftId, (d) => {
        d.status = 'SHARED';
        d.sharedBy = actor.name;
        d.sharedAt = now;
        d.shareResult = shareResult;
        d.shareError = null;
      });
      // The shared message is also recorded on the case (same as a
      // room post through /api/switch/post) so the drawer shows it.
      try {
        c.messages = c.messages || [];
        c.messages.push({ id: shareResult.eventId || `draft-${draftId}`, author: actor.name, kind: 'human', text: shareText, at: now, room: c.switchRoom, roomId: shareResult.roomId, eventId: shareResult.eventId, real: !shareResult.simulated, draftId });
        audit(c, actor, 'draft-shared', { draftId, caseId, room: c.switchRoom, eventId: shareResult.eventId });
        save(data);
      } catch (e) { console.error('CONVERGE draft share audit failed:', e); }
      return send(res, 200, updated);
    }
    // --- API: Switch — real server when configured, stub otherwise ---
    if (url.pathname === '/api/switch/health' && req.method === 'GET') {
      if (SWITCH_BASE_URL) return send(res, 200, await probeHealth(SWITCH_BASE_URL));
      return send(res, 200, stubHealth());
    }
    if (url.pathname === '/api/switch/ops' && req.method === 'GET') {
      if (realSwitch) return send(res, 200, await getOps(SWITCH_BASE_URL, SWITCH_API_KEY, SWITCH_AGENT_ID));
      return send(res, 200, stubGetOps());
    }
    if (url.pathname === '/api/switch/rooms' && req.method === 'GET') {
      if (realSwitch) return send(res, 200, await callOp(SWITCH_BASE_URL, SWITCH_API_KEY, SWITCH_AGENT_ID, 'list_rooms', {}));
      return send(res, 200, stubCallOp(stub, 'list_rooms'));
    }
    // --- API: Switch room timeline for the drawer (M21, 2026-11-06) ---
    // Real mode: the live Switch room timeline via read_context — the
    // drawer used to show only app-stored messages, so a room with real
    // history looked empty. Stub mode: the app-stored transcript.
    // Stored messages whose event id is already in the live timeline are
    // the same message (posted through the app) and are deduped; stored
    // messages with no live counterpart are kept, flagged localOnly, so
    // nothing the app recorded is lost from the drawer.
    if (url.pathname === '/api/switch/messages' && req.method === 'GET') {
      const c = getCase(data, url.searchParams.get('caseId') || '');
      if (!c) return send(res, 404, { error: 'case not found' });
      const stored = (c.messages || []).map((m) => ({ ...m }));
      if (!realSwitch) return send(res, 200, { messages: stored, live: false, simulated: true });
      try {
        const roomId = await ensureRealRoom(c);
        const result = await withRoomConnection(SWITCH_BASE_URL, SWITCH_API_KEY, SWITCH_AGENT_ID, roomId, async (connectionId) => {
          return callOp(SWITCH_BASE_URL, SWITCH_API_KEY, SWITCH_AGENT_ID, 'read_context', {}, connectionId);
        });
        const live = switchTimelineToMessages(result);
        const liveIds = new Set(live.map((m) => m.eventId));
        const localOnly = stored.filter((m) => !m.eventId || !liveIds.has(m.eventId)).map((m) => ({ ...m, localOnly: true }));
        // Undated messages sort last, never first.
        const messages = [...live, ...localOnly].sort((a, b) => {
          if (!a.at) return 1;
          if (!b.at) return -1;
          return a.at.localeCompare(b.at);
        });
        return send(res, 200, { messages, live: true, roomId });
      } catch (e) {
        // §31.3: the error text used to be interpolated into the
        // response, leaking raw Switch error detail. A generic
        // message only; the detail is logged server-side by the
        // outer catch path (console.error there).
        return send(res, 200, { messages: stored, live: false, error: 'Live room timeline unavailable.' });
      }
    }
    if (url.pathname === '/api/switch/post' && req.method === 'POST') {
      const body = await readBody(req);
      const c = getCase(data, body.caseId);
      if (!c) return send(res, 404, { error: 'case not found' });
      // BUG-5 (QA 2026-11-06): empty and 100k-char messages used to be
      // accepted, stored and audited. The drawer already blocks empty
      // input client-side; the API enforces it too (4000 chars is
      // Mattermost's default max post length).
      const text = typeof body.text === 'string' ? body.text.trim() : '';
      if (!text) return send(res, 400, { error: 'Message text is required.' });
      if (text.length > 4000) return send(res, 400, { error: 'Message is too long (max 4000 characters).' });
      body.text = text;
      // The message author is the session actor — never a client-supplied
      // name (the old code derived "agent" kind by regex on the author
      // string, so anyone could post as an agent).
      body.author = req.session.actor.name;
      if (realSwitch) {
        const roomId = await ensureRealRoom(c);
        const result = await withRoomConnection(SWITCH_BASE_URL, SWITCH_API_KEY, SWITCH_AGENT_ID, roomId, async (connectionId) => {
          return callOp(SWITCH_BASE_URL, SWITCH_API_KEY, SWITCH_AGENT_ID, 'post_message', { body: body.text }, connectionId);
        });
        const eventId = result.result?.event_id || null;
        const author = body.author;
        const kind = 'human';
        const msg = { id: eventId || `real-${randomUUID()}`, author, kind, text: body.text, at: new Date().toISOString(), room: c.switchRoom, roomId, eventId, real: true };
        c.messages.push(msg);
        audit(c, req.session.actor, 'room-message', { room: c.switchRoom, roomId, eventId });
        save(data);
        return send(res, 200, msg);
      }
      const msg = stubCallOp(stub, 'post_message', body);
      if (c) { c.messages.push(msg); audit(c, req.session.actor, 'room-message', { room: body.room }); save(data); }
      return send(res, 200, { ...msg, simulated: true, caption: 'SIMULATED — stub server, not Switch' });
    }
    // /api/switch/register was REMOVED (P0, 2026-11-07): it minted Switch
    // agent credentials for any unauthenticated caller. Registration is
    // a one-time ops action via ~/workspace/switch-server/
    // register-converge-agent.py — it has no place on the public server.
    return send(res, 404, { error: 'not found' });
  } catch (e) {
    // A status-carrying error (readBody 400/413) is answered as-is; any
    // other failure is logged server-side and answered with a generic
    // 500 so internals (Switch error text, stack traces) never leak.
    // sanitizePublicError (§31.3) centralises that rule.
    if (e && typeof e.statusCode === 'number') return send(res, e.statusCode, { error: e.message });
    console.error('CONVERGE server error:', e);
    return send(res, 500, { error: sanitizePublicError(e) });
  }
});

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('server.js')) {
  // SECURITY: loopback only — the app, like the Switch stack, is local-only.
  server.listen(PORT, '127.0.0.1', () => console.log(`CONVERGE on http://localhost:${PORT} — Switch mode: ${SWITCH_MODE}`));
}
export { server, nextHaggleId };
