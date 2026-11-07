// Tests for server/replies.js — the conversational reply mechanism —
// and its integration into server/agent-runtime.js (routeHumanMessage).
//
// The reply path is a NARROW system capability, not a model tool: the
// model drafts prose, the RUNTIME validates it (replies.js) and posts
// it with the runtime's own agent credentials. These tests pin:
//  - validation (forbidden content, ASCII, length, engine figures),
//  - sanitisation (non-ASCII normalisation),
//  - the reply record + idempotency (one reply per source message),
//  - the runtime integration (post on valid, skip/reject otherwise,
//    draft always reaches the inbox).
// Network is never touched here: the runtime's postReply is stubbed.

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  resolveRepliesFile, loadReplies, hasReplied, beginReply, completeReply,
  removeReply, listRepliesByCase, reconcilePendingReplies,
  sanitizeReplyText, extractMoneyAmounts, extractPercentages,
  collectKnownFigures, validateFigures, validateReplyText, buildReplyText,
  REPLY_MAX_CHARS,
} from '../server/replies.js';
import { createAgentRuntime } from '../server/agent-runtime.js';
import { createMockProvider } from '../server/llm.js';
import { seedData } from '../server/store.js';
import { haggleAnalysis, haggleStrategies } from '../server/engine.js';
import { buildFindings } from '../server/agent-runtime.js';

const HAG_ROOM = '177e6354-e07f-44eb-b385-8055faf021e6';
const COURT_ROOM = '478f26a8-a843-480e-9707-78c142000341';

function haggleCase() {
  return seedData().cases.find((c) => c.id === 'HAG-014');
}
function courtCase() {
  return seedData().cases.find((c) => c.id === 'CRT-007');
}
function haggleEngine() {
  const c = haggleCase();
  const analysis = haggleAnalysis(c.input);
  return { analysis, strategies: haggleStrategies(analysis, c.input) };
}
function knownHaggle() {
  return collectKnownFigures(haggleCase(), haggleEngine());
}
function tmpRepliesFile() {
  const dir = mkdtempSync(join(tmpdir(), 'converge-replies-'));
  return { dir, file: join(dir, 'replies.json') };
}

// ---------------------------------------------------------------------------
// Sanitisation
// ---------------------------------------------------------------------------

test('replies: sanitizeReplyText normalises dashes/quotes and strips the rest', () => {
  const out = sanitizeReplyText('Price — up 50% — "quoted" \u2018single\u2019 and a \u00b7 dot');
  assert.equal(out, "Price - up 50% - \"quoted\" 'single' and a  dot");
  assert.ok(/^[\x20-\x7E\n]*$/.test(out), 'result is printable ASCII only');
});

test('replies: sanitizeReplyText leaves plain ASCII untouched', () => {
  assert.equal(sanitizeReplyText('Food cost 28.63% -> 31.62%.'), 'Food cost 28.63% -> 31.62%.');
});

// ---------------------------------------------------------------------------
// Figure extraction + known figures
// ---------------------------------------------------------------------------

test('replies: extractMoneyAmounts and extractPercentages find every figure', () => {
  assert.deepEqual(extractMoneyAmounts('Costs $0.48 a serving, $76.80 a month, $921.60 a year.'), [0.48, 76.8, 921.6]);
  assert.deepEqual(extractPercentages('Food cost 28.63% to 31.62%, a 50% rise.'), [28.63, 31.62, 50]);
  assert.deepEqual(extractMoneyAmounts('No money here.'), []);
});

test('replies: collectKnownFigures covers engine, case input, strategies and approval terms', () => {
  const k = knownHaggle();
  for (const v of [0.16, 0.24, 0.48, 0.96, 1.44, 4.58, 5.06, 76.8, 921.6, 0.1967, 0.18, 0.216, 3.62, 16, 0.19]) {
    assert.ok(k.money.some((x) => Math.abs(x - v) <= 0.011), `money should include ${v}`);
  }
  for (const v of [28.63, 31.62, 50, 71.37, 68.38, 30, 29.38, 30.75]) {
    assert.ok(k.pct.some((x) => Math.abs(x - v) <= 0.11), `pct should include ${v}`);
  }
});

test('replies: validateFigures accepts engine figures and a percentage-point difference', () => {
  const k = knownHaggle();
  assert.deepEqual(validateFigures('Food cost 28.63% to 31.62% (+$76.80/mo). Counter $0.18.', k), []);
  // 31.62 - 28.63 = 2.99, so "rises ~3 points" is a valid difference.
  assert.deepEqual(validateFigures('Food cost rises about 3 points.', k), []);
});

test('replies: validateFigures rejects an invented money figure and an invented percentage', () => {
  const k = knownHaggle();
  assert.ok(validateFigures('The extra cost is $99.99 a month.', k).some((e) => e.includes('$99.99')));
  assert.ok(validateFigures('Food cost jumps 99%.', k).some((e) => e.includes('99%')));
});

// ---------------------------------------------------------------------------
// Content validation
// ---------------------------------------------------------------------------

test('replies: a valid informational reply passes validation', () => {
  const k = knownHaggle();
  const text = 'The cream price rise adds $0.48 per serving. Food cost goes from 28.63% to 31.62%, which is +$76.80 a month. The counter at $0.18 keeps food cost at 29.38%.';
  const r = validateReplyText(text, k);
  assert.equal(r.ok, true, JSON.stringify(r.errors));
});

test('replies: approval / commitment / decision language is rejected', () => {
  const k = knownHaggle();
  const bad = [
    'I approve the $0.18 counteroffer.',
    'We approve this proposal.',
    'I have agreed to $0.18.',
    'We agreed to the new price.',
    'I will pay the supplier $0.24.',
    'The deal is done.',
    'Go ahead and approve it.',
    "I'm approving the terms.",
  ];
  for (const text of bad) {
    const r = validateReplyText(text, k);
    assert.equal(r.ok, false, `${text} should be rejected`);
    assert.ok(r.errors.some((e) => e.startsWith('forbidden content')), `${text}: ${JSON.stringify(r.errors)}`);
  }
});

test('replies: factual descriptions of past HUMAN approvals are NOT rejected', () => {
  const k = knownHaggle();
  // These describe what a human did — the agent is not acting.
  const ok = [
    'P2 was approved by the Owner on Nov 5.',
    'The case is awaiting approval by a human.',
    'The owner agreed to review the proposal.',
    'The approval record shows $0.19 for 6 weeks.',
  ];
  for (const text of ok) {
    const r = validateReplyText(text, k);
    assert.equal(r.ok, true, `${text} should pass: ${JSON.stringify(r.errors)}`);
  }
});

test('replies: credential requests, claiming to be human, and supplier contact are rejected', () => {
  const k = knownHaggle();
  const bad = [
    'Please send me your PIN to proceed.',
    'I need the OTP to verify.',
    'What is your password?',
    'I am a human just like you.',
    'As a human, I think we should accept.',
    'Email the supplier and tell them we accept.',
    'I emailed the supplier yesterday.',
  ];
  for (const text of bad) {
    const r = validateReplyText(text, k);
    assert.equal(r.ok, false, `${text} should be rejected`);
  }
});

test('replies: empty, over-long, and non-ASCII text are rejected', () => {
  const k = knownHaggle();
  assert.equal(validateReplyText('', k).ok, false);
  assert.equal(validateReplyText('   ', k).ok, false);
  assert.equal(validateReplyText('x'.repeat(REPLY_MAX_CHARS + 1), k).ok, false);
  assert.equal(validateReplyText('Price — up', k).ok, false, 'raw non-ASCII is rejected (sanitize first)');
});

// ---------------------------------------------------------------------------
// Reply text building
// ---------------------------------------------------------------------------

test('replies: buildReplyText labels the reply, adds engine figures, and is ASCII', () => {
  const c = haggleCase();
  const findings = buildFindings(c, haggleEngine());
  const text = buildReplyText({
    draftText: 'The cream price rise adds $0.48 per serving.',
    findings,
    refId: 'abc12345',
  });
  assert.ok(text.startsWith('[CONVERGE facilitator - informational analysis, not a decision]'));
  assert.ok(text.includes('The cream price rise adds $0.48 per serving.'));
  assert.ok(text.includes('Engine figures (deterministic, not model-computed):'));
  assert.ok(text.includes('28.63% -> 31.62%'));
  assert.ok(text.includes('Ref abc12345'));
  assert.ok(text.includes('Final decisions stay with a human'));
  assert.ok(/^[\x20-\x7E\n]*$/.test(text), 'built text is printable ASCII only');
  const r = validateReplyText(text, knownHaggle());
  assert.equal(r.ok, true, `built text must validate: ${JSON.stringify(r.errors)}`);
});

// ---------------------------------------------------------------------------
// Reply store + idempotency
// ---------------------------------------------------------------------------

test('replies: hasReplied is false until a reply is recorded, then true', () => {
  const { dir, file } = tmpRepliesFile();
  try {
    assert.equal(hasReplied('m1', file), false);
    beginReply({ id: 'r1', refId: 'r1ref', caseId: 'HAG-014', roomId: HAG_ROOM, sourceMessageId: 'm1', text: 'hi', status: 'PENDING', createdAt: new Date().toISOString() }, file);
    assert.equal(hasReplied('m1', file), true);
    assert.equal(hasReplied('m2', file), false, 'a different message is not blocked');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('replies: completeReply marks POSTED with the event id; removeReply drops a PENDING record', () => {
  const { dir, file } = tmpRepliesFile();
  try {
    beginReply({ id: 'r1', refId: 'a', caseId: 'HAG-014', roomId: HAG_ROOM, sourceMessageId: 'm1', text: 'hi', status: 'PENDING', createdAt: new Date().toISOString() }, file);
    const done = completeReply('r1', 'sw_evt_1', file);
    assert.equal(done.status, 'POSTED');
    assert.equal(done.eventId, 'sw_evt_1');
    assert.ok(done.postedAt);
    assert.equal(hasReplied('m1', file), true, 'POSTED still blocks a re-reply');
    beginReply({ id: 'r2', refId: 'b', caseId: 'HAG-014', roomId: HAG_ROOM, sourceMessageId: 'm2', text: 'hi', status: 'PENDING', createdAt: new Date().toISOString() }, file);
    assert.equal(removeReply('r2', file), true);
    assert.equal(hasReplied('m2', file), false, 'a dropped PENDING record no longer blocks');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('replies: listRepliesByCase isolates cases', () => {
  const { dir, file } = tmpRepliesFile();
  try {
    beginReply({ id: 'r1', refId: 'a', caseId: 'HAG-014', roomId: HAG_ROOM, sourceMessageId: 'm1', text: 'hi', status: 'POSTED', createdAt: new Date().toISOString() }, file);
    beginReply({ id: 'r2', refId: 'b', caseId: 'CRT-007', roomId: COURT_ROOM, sourceMessageId: 'm2', text: 'hi', status: 'POSTED', createdAt: new Date().toISOString() }, file);
    assert.deepEqual(listRepliesByCase('HAG-014', file).map((r) => r.id), ['r1']);
    assert.deepEqual(listRepliesByCase('CRT-007', file).map((r) => r.id), ['r2']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('replies: reconcilePendingReplies marks POSTED when the ref id is in the timeline, drops it otherwise', () => {
  const { dir, file } = tmpRepliesFile();
  try {
    beginReply({ id: 'r1', refId: 'ref-landed', caseId: 'HAG-014', roomId: HAG_ROOM, sourceMessageId: 'm1', text: 'hi', status: 'PENDING', createdAt: new Date().toISOString() }, file);
    beginReply({ id: 'r2', refId: 'ref-lost', caseId: 'HAG-014', roomId: HAG_ROOM, sourceMessageId: 'm2', text: 'hi', status: 'PENDING', createdAt: new Date().toISOString() }, file);
    const out = reconcilePendingReplies(['[CONVERGE facilitator] something Ref ref-landed - Final decisions'], file);
    assert.deepEqual(out, { posted: 1, dropped: 1 });
    const kept = loadReplies(file).replies;
    assert.equal(kept.find((r) => r.id === 'r1').status, 'POSTED');
    assert.equal(kept.find((r) => r.id === 'r2'), undefined, 'the lost post is dropped so a re-route may retry');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Runtime integration (stubbed postReply — no network)
// ---------------------------------------------------------------------------

function makeReplyRuntime({ draftText, repliesFile, draftsFile, postImpl } = {}) {
  const posts = [];
  const logs = [];
  const runtime = createAgentRuntime({
    apiKey: 'test-key-not-real',
    provider: createMockProvider({
      respond: () => ({
        draft: draftText,
        role: 'financial-analyst',
        confidence: 'high',
        caveats: [],
        needsHumanReview: true,
      }),
    }),
    getCases: () => seedData().cases,
    readTimeline: async () => [],
    draftsFile,
    repliesFile,
    replyEnabled: true,
    postReply: postImpl || (async ({ roomId, text }) => {
      posts.push({ roomId, text });
      return { result: { event_id: `sw_test_${posts.length}` } };
    }),
    logger: (level, msg, detail) => logs.push({ level, msg, detail }),
  });
  return { runtime, posts, logs };
}

const VALID_DRAFT = 'The cream price rise adds $0.48 per serving. Food cost goes from 28.63% to 31.62%, which is +$76.80 a month. The counter at $0.18 keeps food cost at 29.38%.';

test('replies: a valid addressed message posts a reply AND the draft still reaches the inbox', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'converge-replies-int-'));
  const draftsFile = join(dir, 'drafts.json');
  const repliesFile = join(dir, 'replies.json');
  try {
    const { runtime, posts, logs } = makeReplyRuntime({ draftText: VALID_DRAFT, draftsFile, repliesFile });
    const d = await runtime.routeHumanMessage({ roomId: HAG_ROOM, messageId: 'm10', senderName: 'Mara', text: 'What is the impact?' });
    assert.ok(d, 'a draft is produced');
    assert.equal(posts.length, 1, 'exactly one reply is posted');
    assert.equal(posts[0].roomId, HAG_ROOM, 'the reply goes to the originating room');
    assert.ok(posts[0].text.includes('[CONVERGE facilitator - informational analysis, not a decision]'));
    assert.ok(posts[0].text.includes('$0.48 per serving'));
    assert.ok(posts[0].text.includes('Engine figures (deterministic, not model-computed):'));
    assert.ok(/^[\x20-\x7E\n]*$/.test(posts[0].text), 'posted text is ASCII');
    assert.equal(runtime.state.repliesPosted, 1);
    // The reply record is POSTED with the event id.
    assert.equal(hasReplied('m10', repliesFile), true);
    const stored = listRepliesByCase('HAG-014', repliesFile);
    assert.equal(stored.length, 1);
    assert.equal(stored[0].status, 'POSTED');
    assert.equal(stored[0].eventId, 'sw_test_1');
    assert.equal(stored[0].mock, true, 'the mock reply is labelled mock in the record');
    // The draft is still in the inbox for human review.
    const { getDraft } = await import('../server/drafts.js');
    assert.ok(getDraft(d.id, draftsFile), 'the draft reached the inbox');
    assert.ok(!logs.some((l) => l.level === 'error'), 'no error logged');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('replies: routing the SAME message twice posts only once (idempotency)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'converge-replies-idem-'));
  const draftsFile = join(dir, 'drafts.json');
  const repliesFile = join(dir, 'replies.json');
  try {
    const { runtime, posts } = makeReplyRuntime({ draftText: VALID_DRAFT, draftsFile, repliesFile });
    const d1 = await runtime.routeHumanMessage({ roomId: HAG_ROOM, messageId: 'm11', senderName: 'Mara', text: 'What is the impact?' });
    assert.ok(d1);
    assert.equal(posts.length, 1);
    const d2 = await runtime.routeHumanMessage({ roomId: HAG_ROOM, messageId: 'm11', senderName: 'Mara', text: 'What is the impact?' });
    assert.equal(d2, null, 'the duplicate is skipped entirely');
    assert.equal(posts.length, 1, 'no second post');
    assert.equal(runtime.state.repliesPosted, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('replies: a reply with forbidden content is rejected — NOT posted, draft still in the inbox', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'converge-replies-forbid-'));
  const draftsFile = join(dir, 'drafts.json');
  const repliesFile = join(dir, 'replies.json');
  try {
    const { runtime, posts, logs } = makeReplyRuntime({ draftText: 'I approve the $0.18 counteroffer.', draftsFile, repliesFile });
    const d = await runtime.routeHumanMessage({ roomId: HAG_ROOM, messageId: 'm12', senderName: 'Mara', text: 'Should we approve?' });
    assert.ok(d, 'the draft is still produced');
    assert.equal(posts.length, 0, 'nothing is posted');
    assert.equal(runtime.state.repliesRejected, 1);
    assert.ok(logs.some((l) => l.msg.includes('reply rejected by validation')), 'the rejection is logged');
    const { getDraft } = await import('../server/drafts.js');
    assert.ok(getDraft(d.id, draftsFile), 'the draft reached the inbox for human review');
    assert.equal(hasReplied('m12', repliesFile), false, 'no reply record blocks a later human share');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('replies: a reply with an invented figure is rejected — NOT posted', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'converge-replies-fig-'));
  const draftsFile = join(dir, 'drafts.json');
  const repliesFile = join(dir, 'replies.json');
  try {
    const { runtime, posts } = makeReplyRuntime({ draftText: 'The extra cost is $99.99 a month.', draftsFile, repliesFile });
    const d = await runtime.routeHumanMessage({ roomId: HAG_ROOM, messageId: 'm13', senderName: 'Mara', text: 'What is the impact?' });
    assert.ok(d);
    assert.equal(posts.length, 0, 'nothing is posted');
    assert.equal(runtime.state.repliesRejected, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('replies: replyEnabled=false posts nothing (draft only)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'converge-replies-off-'));
  const draftsFile = join(dir, 'drafts.json');
  const repliesFile = join(dir, 'replies.json');
  try {
    const posts = [];
    const runtime = createAgentRuntime({
      apiKey: 'test-key-not-real',
      provider: createMockProvider({ respond: () => ({ draft: VALID_DRAFT, role: 'financial-analyst', confidence: 'high', caveats: [], needsHumanReview: true }) }),
      getCases: () => seedData().cases,
      readTimeline: async () => [],
      draftsFile,
      repliesFile,
      replyEnabled: false,
      postReply: async ({ roomId, text }) => { posts.push({ roomId, text }); return { result: { event_id: 'sw_x' } }; },
    });
    const d = await runtime.routeHumanMessage({ roomId: HAG_ROOM, messageId: 'm14', senderName: 'Mara', text: 'What is the impact?' });
    assert.ok(d);
    assert.equal(posts.length, 0, 'nothing is posted when replies are disabled');
    assert.equal(runtime.state.repliesSkipped, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('replies: a message with no id is not replied to (idempotency unavailable)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'converge-replies-noid-'));
  const draftsFile = join(dir, 'drafts.json');
  const repliesFile = join(dir, 'replies.json');
  try {
    const { runtime, posts } = makeReplyRuntime({ draftText: VALID_DRAFT, draftsFile, repliesFile });
    const d = await runtime.routeHumanMessage({ roomId: HAG_ROOM, messageId: null, senderName: 'Mara', text: 'What is the impact?' });
    assert.ok(d, 'the draft is still produced');
    assert.equal(posts.length, 0, 'nothing is posted without a source message id');
    assert.equal(runtime.state.repliesSkipped, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('replies: a failed post drops the PENDING record so a re-route may retry (draft still in inbox)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'converge-replies-fail-'));
  const draftsFile = join(dir, 'drafts.json');
  const repliesFile = join(dir, 'replies.json');
  try {
    let attempts = 0;
    const { runtime, posts } = makeReplyRuntime({
      draftText: VALID_DRAFT,
      draftsFile,
      repliesFile,
      postImpl: async () => { attempts += 1; throw new Error('post_message failed: 500'); },
    });
    const d = await runtime.routeHumanMessage({ roomId: HAG_ROOM, messageId: 'm15', senderName: 'Mara', text: 'What is the impact?' });
    assert.ok(d);
    assert.equal(posts.length, 0);
    assert.equal(attempts, 1);
    assert.equal(hasReplied('m15', repliesFile), false, 'the failed PENDING record is dropped');
    assert.equal(runtime.state.repliesRejected, 1);
    const { getDraft } = await import('../server/drafts.js');
    assert.ok(getDraft(d.id, draftsFile), 'the draft reached the inbox');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('replies: a COURT message posts a reply too (no money figures to invent)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'converge-replies-court-'));
  const draftsFile = join(dir, 'drafts.json');
  const repliesFile = join(dir, 'replies.json');
  try {
    const { runtime, posts } = makeReplyRuntime({
      draftText: 'Nonna leads with a mean of 4.67 against 4.33 for Auntie. The main conflict is salt: a pinch, a tablespoon, or none.',
      draftsFile,
      repliesFile,
    });
    // COURT uses the researcher lens; route it directly.
    const d = await runtime.routeHumanMessage({ roomId: COURT_ROOM, messageId: 'm16', senderName: 'Mara', text: 'Which version leads?' });
    assert.ok(d);
    assert.equal(posts.length, 1, 'the COURT reply is posted');
    assert.equal(posts[0].roomId, COURT_ROOM);
    assert.ok(!posts[0].text.includes('Engine figures'), 'no engine block for COURT (no HAGGLE maths)');
    assert.equal(runtime.state.repliesPosted, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('replies: a COURT reply with a money figure is rejected', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'converge-replies-courtfig-'));
  const draftsFile = join(dir, 'drafts.json');
  const repliesFile = join(dir, 'replies.json');
  try {
    const { runtime, posts } = makeReplyRuntime({
      draftText: 'Nonna leads. The recipe costs $12.50 to make.',
      draftsFile,
      repliesFile,
    });
    const d = await runtime.routeHumanMessage({ roomId: COURT_ROOM, messageId: 'm17', senderName: 'Mara', text: 'Which version leads?' });
    assert.ok(d);
    assert.equal(posts.length, 0, 'a COURT reply inventing money is rejected');
    assert.equal(runtime.state.repliesRejected, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
