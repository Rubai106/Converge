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
    if (url.pathname === '/api/cases' && req.method === 'GET') return send(res, 200, data.cases);
    if (url.pathname === '/api/status' && req.method === 'GET') {
      let switchHealth = stubHealth();
      if (SWITCH_BASE_URL) { try { switchHealth = await probeHealth(SWITCH_BASE_URL); } catch (e) { switchHealth = { ok: false, error: String(e) }; } }
      return send(res, 200, { switchMode: SWITCH_MODE, switchVersion: SWITCH_VERSION, switchHealth, cases: data.cases.length });
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
        out.samples = c.samples || [];
        out.ratings = c.ratings || [];
        out.ratingsExpected = (c.readers?.length || 0) * (c.samples?.length || 0);
        out.ratingsComplete = out.ratingsExpected > 0 && out.ratings.length >= out.ratingsExpected;
        // Scores are revealed only after every reader has submitted.
        out.tally = out.ratingsComplete ? courtTally(out.ratings) : null;
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
      return send(res, 200, { tally: courtTally(body.ratings || []), note: 'Scores are revealed only after every reader has submitted. In this demo, submit all readers first.' });
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
          c.claimChallenges[base.id] = { text: body.challenge.text || '', evidence: body.challenge.evidence || null, by: body.actor || 'Guest' };
          claim.guestChallenge = c.claimChallenges[base.id];
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
      if (realSwitch) {
        const roomId = await ensureRealRoom(c);
        const result = await withRoomConnection(SWITCH_BASE_URL, SWITCH_API_KEY, SWITCH_AGENT_ID, roomId, async (connectionId) => {
          return callOp(SWITCH_BASE_URL, SWITCH_API_KEY, SWITCH_AGENT_ID, 'post_message', { body: body.text }, connectionId);
        });
        const eventId = result.result?.event_id || null;
        const msg = { id: eventId || `real-${Date.now()}`, author: body.author || 'Mara (owner)', kind: 'human', text: body.text, at: new Date().toISOString(), room: c.switchRoom, roomId, eventId, real: true };
        c.messages.push(msg);
        audit(c, { name: body.author || 'Mara (owner)', kind: 'human' }, 'room-message', { room: c.switchRoom, roomId, eventId });
        save(data);
        return send(res, 200, msg);
      }
      const msg = stubCallOp(stub, 'post_message', body);
      if (c) { c.messages.push(msg); audit(c, { name: body.author || 'agent', kind: 'agent' }, 'room-message', { room: body.room }); save(data); }
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
  server.listen(PORT, () => console.log(`CONVERGE on http://localhost:${PORT} — Switch mode: ${SWITCH_MODE}`));
}
export { server };
