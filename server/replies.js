// CONVERGE — conversational replies (server/replies.js).
//
// The facilitator as a real conversational teammate: after the model
// produces a draft for an addressed human message, the runtime may
// publish a VALIDATED, informational model-generated response into the
// originating Mattermost room through Switch, under its own agent
// identity. This is the "agent-as-teammate" path the Flip the Switch
// demo requires — a human sharing a draft from the inbox is NOT the
// primary demonstration; the agent replying in the room is.
//
// This is a NARROWLY SCOPED system capability, NOT an unrestricted LLM
// tool. The distinction is structural, not a policy:
//
//  - The model NEVER posts. There is NO post/send tool in the registry
//    (tools.js forbids tool names matching /post.?message|send.?message/)
//    and this module is never reachable from a tool call. The MODEL
//    only drafts prose; the RUNTIME (this module + agent-runtime.js)
//    validates that prose and posts it. A compromised or confused
//    model cannot post anything — the runtime is the gate.
//  - The runtime posts with its OWN agent credentials (the
//    facilitator's api_key via withRoomConnection + post_message). It
//    NEVER holds a human session token and NEVER calls a mutating app
//    endpoint, so it cannot approve, adopt, publish, or transition a
//    case. Posting a room message changes no CONVERGE state: cases,
//    proposals, approvals, and claim statuses are only mutated through
//    the session-authenticated app endpoints.
//  - The reply is INFORMATIONAL only. validateReplyText() rejects any
//    approval / commitment / decision language, any credential request,
//    any claim to be human, and any instruction to contact a supplier.
//    It also rejects any money or percentage figure that does not
//    match the deterministic engine's output (or the case's own
//    numbers) — the model cannot invent a price. A rejected reply is
//    logged and NOT posted; the draft still reaches the inbox for
//    human review, so nothing is silently lost.
//  - The reply is ASCII-only (switch-core 500s on any non-ASCII
//    character). sanitizeReplyText() normalises dashes/quotes and
//    strips the rest BEFORE validation, so a model em dash never
//    blocks a reply — and the posted text is guaranteed printable
//    ASCII.
//  - Idempotency: every reply is recorded (PENDING, then POSTED with
//    the Switch event id) keyed by the SOURCE message id. A message
//    that already has a reply is never replied to twice — not on a
//    re-read, not after a reconnect, not after a restart. The record
//    carries a short ref id that is also printed in the posted text,
//    so a PENDING record left by a crash can be reconciled against
//    the room timeline (see reconcilePendingReplies()).
//  - Case/room association: a reply goes ONLY to the room the source
//    message came from, and only when that room maps to a known case.
//    The runtime enforces this before this module is ever called.
//  - The reply record NEVER contains hidden internal reasoning. It
//    holds the source message id, the posted text, the validation
//    outcome, and the model/provider metadata — the same fields a
//    human would need to audit it.
//
// Storage: data/replies.json next to the case store (gitignored
// production data, same as drafts.json), resolved from the same
// CONVERGE_DATA_FILE env var. Atomic save (tmp + fsync + rename).
// The same two-process read-modify-write race note as drafts.js
// applies (accepted for this single-VM demo; replies are written
// rarely — once per addressed human message).

import { readFileSync, writeFileSync, mkdirSync, renameSync, openSync, fsyncSync, closeSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withRoomConnection, callOp } from './switch-client.js';

const defaultDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const defaultDataFile = process.env.CONVERGE_DATA_FILE || join(defaultDir, 'converge.json');

export const REPLY_MAX_CHARS = 1500;

// The replies file lives next to the case store file, so a scratch
// CONVERGE_DATA_FILE gives a scratch replies file automatically.
export function resolveRepliesFile(env = process.env) {
  const dataFile = env.CONVERGE_DATA_FILE || defaultDataFile;
  return join(dirname(dataFile), 'replies.json');
}

function tryReadJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

// Read the reply store. Returns { replies: [] } when the file is
// missing or unparseable — a corrupt store must never crash the
// runtime; it just looks empty.
export function loadReplies(file) {
  const f = file || resolveRepliesFile();
  const d = tryReadJson(f);
  if (!d || !Array.isArray(d.replies)) return { replies: [] };
  return d;
}

// Atomic save: tmp + fsync + rename (same pattern as store.save).
export function saveReplies(payload, file) {
  const f = file || resolveRepliesFile();
  mkdirSync(dirname(f), { recursive: true });
  const tmp = `${f}.tmp`;
  const fd = openSync(tmp, 'w');
  try {
    writeFileSync(fd, JSON.stringify(payload, null, 2));
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(tmp, f);
  return payload;
}

// True when a reply already exists (PENDING or POSTED) for this source
// message id. The idempotency guard: a message is replied to at most
// once, however many times it is re-read or re-routed.
export function hasReplied(sourceMessageId, file) {
  if (!sourceMessageId) return false;
  return loadReplies(file).replies.some(
    (r) => r.sourceMessageId === sourceMessageId && (r.status === 'PENDING' || r.status === 'POSTED'),
  );
}

export function getReply(id, file) {
  return loadReplies(file).replies.find((r) => r.id === id) || null;
}

// Replies for one case only, newest first. Case isolation is enforced
// here — callers never see another case's replies.
export function listRepliesByCase(caseId, file) {
  return loadReplies(file).replies
    .filter((r) => r.caseId === caseId)
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

// Record a reply as PENDING before posting (the crash window). The
// caller marks it POSTED with completeReply() after a successful post.
// A PENDING record left by a crash is reconciled by
// reconcilePendingReplies() against the room timeline (the posted text
// carries the ref id, so a post that DID land is found and marked
// POSTED instead of re-posted).
export function beginReply(record, file) {
  const store = loadReplies(file);
  store.replies.push(record);
  saveReplies(store, file);
  return record;
}

export function completeReply(replyId, eventId, file) {
  const store = loadReplies(file);
  const r = store.replies.find((x) => x.id === replyId);
  if (!r) return null;
  r.status = 'POSTED';
  r.eventId = eventId || null;
  r.postedAt = new Date().toISOString();
  saveReplies(store, file);
  return r;
}

// Drop a PENDING record after a failed post, so a later re-route may
// retry it. (A post that SUCCEEDED but crashed before completeReply
// leaves a PENDING record that reconcilePendingReplies() resolves
// against the room timeline — that path never calls this.)
export function removeReply(replyId, file) {
  const store = loadReplies(file);
  const before = store.replies.length;
  store.replies = store.replies.filter((x) => x.id !== replyId);
  if (store.replies.length !== before) saveReplies(store, file);
  return before !== store.replies.length;
}

// Reconcile PENDING records left by a crash: for each PENDING reply,
// check whether its ref id appears in the room timeline (the posted
// text carries it). If it does, the post landed and the record becomes
// POSTED; if it does not, the post never happened and the record is
// dropped so a later re-route may post it. `timelineTexts` is the list
// of message texts currently in the room. Returns { posted, dropped }.
export function reconcilePendingReplies(timelineTexts, file) {
  const store = loadReplies(file);
  const texts = Array.isArray(timelineTexts) ? timelineTexts : [];
  let posted = 0;
  let dropped = 0;
  const kept = [];
  for (const r of store.replies) {
    if (r.status !== 'PENDING') { kept.push(r); continue; }
    const landed = r.refId && texts.some((t) => typeof t === 'string' && t.includes(r.refId));
    if (landed) {
      r.status = 'POSTED';
      r.postedAt = r.postedAt || new Date().toISOString();
      kept.push(r);
      posted += 1;
    } else {
      dropped += 1; // post never landed; drop so a re-route may post it
    }
  }
  if (posted || dropped) saveReplies({ replies: kept }, file);
  return { posted, dropped };
}

// ---------------------------------------------------------------------------
// Sanitisation (ASCII only — switch-core 500s on any non-ASCII character)
// ---------------------------------------------------------------------------
// Same normalisation as the draft-share path (server.js): em/en dashes
// become '-', curly quotes become straight quotes, everything else
// non-printable-ASCII is stripped. Applied BEFORE validation, so a
// model em dash never blocks a reply — and the posted text is
// guaranteed printable ASCII.
export function sanitizeReplyText(s) {
  return String(s || '')
    .replace(/[\u2014\u2013]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[^\x20-\x7E\n]/g, '');
}

// ---------------------------------------------------------------------------
// Figure extraction + known-figure collection (the no-invented-numbers gate)
// ---------------------------------------------------------------------------

export function extractMoneyAmounts(text) {
  const out = [];
  const re = /\$(\d+(?:\.\d{1,4})?)/g;
  let m;
  while ((m = re.exec(String(text || '')))) out.push(parseFloat(m[1]));
  return out;
}

export function extractPercentages(text) {
  const out = [];
  const re = /(\d+(?:\.\d+)?)\s*%/g;
  let m;
  while ((m = re.exec(String(text || '')))) out.push(parseFloat(m[1]));
  return out;
}

// The numbers the model is allowed to quote: the case's own input
// numbers, the deterministic engine's output, the strategy prices,
// and the terms of a past human approval / pending approval. Both the
// raw value and its 2-decimal rounding are kept, so $0.1967 and
// $0.20 both match the max-sustainable price.
export function collectKnownFigures(caseObj, engineCtx) {
  const money = new Set();
  const pct = new Set();
  const addMoney = (v) => {
    if (typeof v === 'number' && Number.isFinite(v)) {
      money.add(v);
      money.add(Math.round(v * 100) / 100);
    }
  };
  const addPct = (v) => {
    if (typeof v === 'number' && Number.isFinite(v)) {
      pct.add(v);
      pct.add(Math.round(v * 100) / 100);
    }
  };
  if (caseObj && caseObj.input) {
    const i = caseObj.input;
    addMoney(i.oldPrice); addMoney(i.newPrice);
    addMoney(i.otherIngredientsCostPerServing); addMoney(i.menuPrice);
    addMoney(i.targetPrice); addMoney(i.maxApprovedPrice);
    addPct(i.targetFoodCostPct);
  }
  if (engineCtx && engineCtx.analysis) {
    const a = engineCtx.analysis;
    addMoney(a.oldCreamCostPerServing); addMoney(a.newCreamCostPerServing);
    addMoney(a.costDiffPerServing); addMoney(a.oldTotalCostPerServing);
    addMoney(a.newTotalCostPerServing); addMoney(a.monthlyExtraCost);
    addMoney(a.annualExtraCost); addMoney(a.targetTotalCostPerServing);
    addMoney(a.maxSustainableUnitPrice);
    addPct(a.pctChange); addPct(a.oldFoodCostPct); addPct(a.newFoodCostPct);
    addPct(a.oldGrossMarginPct); addPct(a.newGrossMarginPct);
  }
  if (engineCtx && Array.isArray(engineCtx.strategies)) {
    for (const s of engineCtx.strategies) {
      addMoney(s.unitPrice); addPct(s.foodCostPct);
      addMoney(s.creamCostPerServing); addMoney(s.totalCostPerServing);
      addMoney(s.extraVsOldPerMonth); addMoney(s.savingVsNewPerMonth);
    }
  }
  for (const terms of [caseObj && caseObj.approval && caseObj.approval.terms, caseObj && caseObj.pendingApproval && caseObj.pendingApproval.terms]) {
    if (typeof terms === 'string') {
      for (const v of extractMoneyAmounts(terms)) addMoney(v);
      for (const v of extractPercentages(terms)) addPct(v);
    }
  }
  return { money: [...money], pct: [...pct] };
}

function closeEnough(value, known, tol) {
  return known.some((k) => Math.abs(value - k) <= tol);
}

// Every $ figure must match a known money figure (within a cent of
// rounding); every % must match a known % or be the difference of two
// known % (e.g. 31.62 - 28.63 = 2.99, so "rises ~3 points" is valid).
// A figure that matches nothing was invented by the model.
export function validateFigures(text, known) {
  const errors = [];
  const k = known || { money: [], pct: [] };
  for (const v of extractMoneyAmounts(text)) {
    if (!closeEnough(v, k.money || [], 0.011)) {
      errors.push(`money figure $${v.toFixed(2)} is not in the engine output`);
    }
  }
  for (const v of extractPercentages(text)) {
    if (closeEnough(v, k.pct || [], 0.11)) continue;
    const diffOk = (k.pct || []).some((a) => (k.pct || []).some((b) => Math.abs(Math.abs(a - b) - v) <= 0.11));
    if (!diffOk) errors.push(`percentage ${v}% is not in the engine output`);
  }
  return errors;
}

// ---------------------------------------------------------------------------
// Forbidden content — the agent ACTING, not describing
// ---------------------------------------------------------------------------
// These patterns target first-person approval / commitment / decision
// language ("I approve", "we agreed", "I will pay"), credential
// requests, claims to be human, and instructions to contact a supplier.
// They deliberately do NOT match factual descriptions of past human
// actions ("P2 was approved by the Owner", "the case is awaiting
// approval", "the owner agreed to review it") — those describe what a
// human did, not what the agent is doing.
export const FORBIDDEN_PATTERNS = [
  { re: /\bI (have )?(approved|approve|agreed|signed|confirmed)\b/i, reason: 'approval/decision language' },
  { re: /\bwe (have )?(approved|approve|agreed|signed|confirmed)\b/i, reason: 'approval/decision language' },
  { re: /\bI'?m (approving|signing|committing)\b/i, reason: 'approval/decision language' },
  { re: /\bI (will|shall) (pay|send|transfer|commit|sign|approve)\b/i, reason: 'commitment language' },
  { re: /\bwe will (pay|sign|approve)\b/i, reason: 'commitment language' },
  { re: /\bdeal (is )?done\b/i, reason: 'decision language' },
  { re: /\bgo ahead and (approve|accept|sign|pay)\b/i, reason: 'decision language' },
  { re: /\bPIN\b/, reason: 'credential request' },
  { re: /\bOTP\b/i, reason: 'credential request' },
  { re: /\bpassword\b/i, reason: 'credential request' },
  { re: /\bI am (a )?human\b/i, reason: 'claiming to be human' },
  { re: /\bas a human\b/i, reason: 'claiming to be human' },
  { re: /\b(tell|email|message|contact|call) (the )?supplier\b/i, reason: 'external supplier communication' },
  { re: /\bI (emailed|contacted|told|called) (the )?supplier\b/i, reason: 'external supplier communication' },
];

// Validate a reply's text (already sanitised) against the content
// rules and the engine figures. Returns { ok, errors }.
export function validateReplyText(text, knownFigures) {
  const errors = [];
  if (typeof text !== 'string' || !text.trim()) {
    errors.push('reply text is empty');
    return { ok: false, errors };
  }
  if (text.length > REPLY_MAX_CHARS) {
    errors.push(`reply is ${text.length} chars, over the ${REPLY_MAX_CHARS} cap`);
  }
  if (/[^\x20-\x7E\n]/.test(text)) {
    errors.push('reply contains non-ASCII characters');
  }
  for (const { re, reason } of FORBIDDEN_PATTERNS) {
    if (re.test(text)) errors.push(`forbidden content (${reason})`);
  }
  errors.push(...validateFigures(text, knownFigures));
  return { ok: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// Reply text — label + model text + engine figures + footer
// ---------------------------------------------------------------------------

export function buildReplyText({ draftText, findings, refId }) {
  const lines = [];
  lines.push('[CONVERGE facilitator - informational analysis, not a decision]');
  lines.push('');
  lines.push(sanitizeReplyText(String(draftText || '').trim()));
  if (findings && findings.analysis) {
    const a = findings.analysis;
    lines.push('');
    lines.push(
      `Engine figures (deterministic, not model-computed): food cost ${a.oldFoodCostPct}% -> ${a.newFoodCostPct}%; `
      + `+$${Number(a.monthlyExtraCost).toFixed(2)}/mo (+$${Number(a.annualExtraCost).toFixed(2)}/yr); `
      + `max sustainable $${Number(a.maxSustainableUnitPrice).toFixed(4)}/unit.`,
    );
  }
  lines.push('');
  lines.push(`Ref ${refId} - Final decisions stay with a human; this analysis does not approve or commit anything.`);
  return sanitizeReplyText(lines.join('\n'));
}

// ---------------------------------------------------------------------------
// Posting — the runtime's own agent credentials, never a human token
// ---------------------------------------------------------------------------

// Post a validated reply to a room through the verified
// withRoomConnection path (open SSE stream -> connect_to_room ->
// post_message). Returns the Switch result ({result:{event_id}}).
// The caller is responsible for validation and for recording the
// reply; this function only performs the post.
export async function postReplyToRoom({ baseUrl, apiKey, agentId, roomId, text }) {
  const clean = sanitizeReplyText(text);
  const result = await withRoomConnection(baseUrl, apiKey, agentId, roomId, async (connId) =>
    callOp(baseUrl, apiKey, agentId, 'post_message', { body: clean }, connId));
  return result;
}

export function extractEventId(postResult) {
  return postResult && postResult.result && postResult.result.event_id
    ? postResult.result.event_id
    : null;
}
