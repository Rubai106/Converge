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
import { haggleAnalysis, haggleStrategies, courtConflicts, courtTally, extractClaims, setClaimStatus, transitionCase, audit, canTransition } from './engine.js';
import { load, save, getCase } from './store.js';
import { createStubState, stubHealth, stubRegisterAgent, stubGetOps, stubCallOp } from './stub-switch.js';
import { probeHealth, getOps, callOp, withRoomConnection, registerAgent, agentProfile, SWITCH_VERSION } from './switch-client.js';

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
        out.claims = extractClaims(c.transcript).map((cl) => ({
          ...cl,
          status: c.claimStatuses?.[cl.id] || cl.status,
          guestChallenge: c.claimChallenges?.[cl.id] || null,
        }));
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
