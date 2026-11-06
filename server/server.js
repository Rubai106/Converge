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
import { haggleAnalysis, haggleStrategies, normalizeHaggleInputs, courtConflicts, courtTally, extractClaims, claimEvidenceRefs, setClaimStatus, transitionCase, audit, canTransition, adoptCanonical } from './engine.js';
import { load, save, getCase } from './store.js';
import { createStubState, stubHealth, stubRegisterAgent, stubGetOps, stubCallOp } from './stub-switch.js';
import { probeHealth, getOps, callOp, withRoomConnection, registerAgent, agentProfile, switchTimelineToMessages, SWITCH_VERSION } from './switch-client.js';

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
  let max = 0;
  let any = false;
  for (const c of d.cases) {
    const m = /^HAG-(\d+)$/.exec(c.id || '');
    if (m) { any = true; max = Math.max(max, Number(m[1])); }
  }
  if (!any) return `HAG-${Date.now()}`; // Fallback when no HAG-* id parses.
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

function send(res, status, body, type = 'application/json') {
  res.writeHead(status, { 'Content-Type': type });
  res.end(typeof body === 'string' ? body : JSON.stringify(body, null, 2));
}
async function readBody(req) {
  let s = '';
  for await (const chunk of req) s += chunk;
  return s ? JSON.parse(s) : {};
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
    // --- static app ---
    if (url.pathname === '/' || url.pathname.startsWith('/app/')) {
      const p = url.pathname === '/' ? '/app/index.html' : url.pathname;
      const file = join(root, p);
      if (existsSync(file)) return send(res, 200, readFileSync(file, 'utf8'), MIME[extname(file)] || 'text/plain');
      return send(res, 404, { error: 'not found' });
    }
    // --- API: cases ---
    if (url.pathname === '/api/cases' && req.method === 'GET') return send(res, 200, data.cases.map(publicCaseView));
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
      audit(c, { name: 'Owner', kind: 'human' }, 'case-created', { supplier: input.supplier, ingredient: input.ingredient });
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
        const claims = extractClaims(c.transcript).map((cl) => ({
          ...cl,
          status: c.claimStatuses?.[cl.id] || cl.status,
          guestChallenge: c.claimChallenges?.[cl.id] || null,
        }));
        // L5: each claim's evidence references come from the server
        // (matched against the case's evidence notes), not a client map.
        const refs = claimEvidenceRefs(claims, c.evidence || []);
        out.claims = claims.map((cl) => ({ ...cl, evidence: refs[cl.id] || [] }));
      }
      return send(res, 200, out);
    }
    // --- API: transition / approve (human only for APPROVED) ---
    const transMatch = url.pathname.match(/^\/api\/cases\/([\w-]+)\/transition$/);
    if (transMatch && req.method === 'POST') {
      const c = getCase(data, transMatch[1]);
      if (!c) return send(res, 404, { error: 'case not found' });
      const body = await readBody(req);
      const actor = { name: body.actor || 'Owner', kind: body.actorKind || 'human' };
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
      // GAP-2: a proposalId must name a real strategy for this HAGGLE
      // case. Proposal IDs are P-numbers, positional in the engine's
      // strategy order (P1 = first strategy, …); a strategy id, a
      // P-number beyond the case's strategies, or a malformed id is
      // rejected. Non-HAGGLE cases carry no strategies, so the check
      // is HAGGLE-only and their existing behaviour is unchanged.
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
      }
      try {
        transitionCase(c, body.to, actor);
        if (body.to === 'AWAITING_APPROVAL' && body.proposalId) c.pendingApproval = { proposalId: body.proposalId, terms: body.terms || '', requestedBy: actor.name };
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
      audit(c, { name: body.reader, kind: 'human' }, 'court-rating', { sampleCode: body.sampleCode });
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
      if (body.actorKind !== 'human') return send(res, 400, { error: 'Only a human may submit a version.' });
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
      audit(c, { name: body.actor || 'Facilitator', kind: 'human' }, 'court-version-added', { version: id, sampleCode, author });
      save(data);
      const expected = (c.readers?.length || 0) * c.samples.length;
      return send(res, 201, { caseId: c.id, version, sampleCode, samples: c.samples.map((s) => ({ code: s.code })), ratingsExpected: expected });
    }
    if (url.pathname === '/api/court/adopt' && req.method === 'POST') {
      const body = await readBody(req);
      if (body.actorKind !== 'human') return send(res, 400, { error: 'Only a human may adopt a canonical version.' });
      const c = getCase(data, body.caseId);
      if (!c || c.workflow !== 'COURT') return send(res, 404, { error: 'COURT case not found' });
      try {
        const adoption = adoptCanonical(c, body.version || null, { name: body.actor || 'Mara (owner)', kind: 'human' });
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
      const claims = extractClaims(c.transcript);
      const base = claims.find((cl) => cl.id === body.id);
      if (!base) return send(res, 404, { error: `Claim ${body.id} not found` });
      const claim = { ...base, status: c.claimStatuses?.[base.id] || base.status };
      try {
        setClaimStatus(claim, body.status, { kind: body.actorKind || 'human', name: body.actor || 'Host' });
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
          c.claimChallenges[base.id] = { text: body.challenge.text || '', evidence: body.challenge.evidence || null, by: body.actor || 'Guest' };
          claim.guestChallenge = c.claimChallenges[base.id];
          if (c.claimChallengeHistory?.[base.id]?.length) claim.challengeHistory = c.claimChallengeHistory[base.id];
        }
        audit(c, { name: body.actor || 'Host', kind: body.actorKind || 'human' }, 'claim-status', { claim: base.id, status: claim.status });
        save(data);
        return send(res, 200, claim);
      } catch (e) { return send(res, 400, { error: String(e.message || e) }); }
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
        return send(res, 200, { messages: stored, live: false, error: `Live room timeline unavailable: ${String(e.message || e).slice(0, 200)}` });
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
      if (realSwitch) {
        const roomId = await ensureRealRoom(c);
        const result = await withRoomConnection(SWITCH_BASE_URL, SWITCH_API_KEY, SWITCH_AGENT_ID, roomId, async (connectionId) => {
          return callOp(SWITCH_BASE_URL, SWITCH_API_KEY, SWITCH_AGENT_ID, 'post_message', { body: body.text }, connectionId);
        });
        const eventId = result.result?.event_id || null;
        const author = body.author || 'Mara (owner)';
        const kind = /agent/i.test(author) ? 'agent' : 'human';
        const msg = { id: eventId || `real-${Date.now()}`, author, kind, text: body.text, at: new Date().toISOString(), room: c.switchRoom, roomId, eventId, real: true };
        c.messages.push(msg);
        audit(c, { name: author, kind }, 'room-message', { room: c.switchRoom, roomId, eventId });
        save(data);
        return send(res, 200, msg);
      }
      const msg = stubCallOp(stub, 'post_message', body);
      if (c) { c.messages.push(msg); audit(c, { name: body.author || 'agent', kind: /agent/i.test(body.author || '') ? 'agent' : 'human' }, 'room-message', { room: body.room }); save(data); }
      return send(res, 200, { ...msg, simulated: true, caption: 'SIMULATED — stub server, not Switch' });
    }
    if (url.pathname === '/api/switch/register' && req.method === 'POST') {
      const body = await readBody(req);
      if (realSwitch) {
        const profile = agentProfile(body.name || 'converge-facilitator', body.description || 'CONVERGE decision facilitator');
        return send(res, 200, await registerAgent(SWITCH_BASE_URL, body.registrationKey, profile));
      }
      return send(res, 200, { ...stubRegisterAgent(stub, body), simulated: true, caption: 'SIMULATED — stub server, not Switch' });
    }
    return send(res, 404, { error: 'not found' });
  } catch (e) {
    return send(res, 500, { error: String(e.message || e) });
  }
});

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('server.js')) {
  // SECURITY: loopback only — the app, like the Switch stack, is local-only.
  server.listen(PORT, '127.0.0.1', () => console.log(`CONVERGE on http://localhost:${PORT} — Switch mode: ${SWITCH_MODE}`));
}
export { server };
