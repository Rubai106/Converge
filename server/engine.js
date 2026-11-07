// CONVERGE shared decision engine — deterministic, no LLM maths.
// All money is calculated here, never by an LLM. Gross profit is shown
// separately from net profit; assumptions and units travel with every number.
import { createHash } from 'node:crypto';

export const STATES = [
  'DRAFT','INTAKE','INVESTIGATING','DISCUSSION','PROPOSAL',
  'AWAITING_APPROVAL','APPROVED','COMPLETED','REJECTED','BLOCKED','CANCELLED',
  // P0 (2026-11-07): WITHDRAWN / EXPIRED are additions, not a rewrite —
  // the eleven existing states stay (the demo data and the test suite
  // depend on them). Mapping for the brief's suggested names:
  // UNDER_REVIEW is covered by INVESTIGATING/DISCUSSION, and
  // PENDING_APPROVAL is AWAITING_APPROVAL.
  'WITHDRAWN','EXPIRED',
];

// Validated state transitions. Agents may never skip AWAITING_APPROVAL.
export const TRANSITIONS = {
  DRAFT: ['INTAKE','CANCELLED'],
  INTAKE: ['INVESTIGATING','BLOCKED','CANCELLED'],
  INVESTIGATING: ['DISCUSSION','BLOCKED','CANCELLED'],
  DISCUSSION: ['PROPOSAL','BLOCKED','CANCELLED'],
  PROPOSAL: ['AWAITING_APPROVAL','DISCUSSION','REJECTED','CANCELLED'],
  AWAITING_APPROVAL: ['APPROVED','REJECTED','DISCUSSION','WITHDRAWN','EXPIRED'],
  APPROVED: ['COMPLETED','BLOCKED'],
  COMPLETED: [],
  REJECTED: ['DISCUSSION','CANCELLED'],
  BLOCKED: ['INTAKE','INVESTIGATING','DISCUSSION','CANCELLED'],
  CANCELLED: [],
  WITHDRAWN: [],
  EXPIRED: [],
};

export function canTransition(from, to) {
  return (TRANSITIONS[from] || []).includes(to);
}

export function transitionCase(c, to, actor) {
  if (!canTransition(c.state, to)) {
    throw new Error(`Invalid transition ${c.state} -> ${to}`);
  }
  // Approval gate: only a human may move a case into APPROVED.
  if (to === 'APPROVED' && actor?.kind !== 'human') {
    throw new Error('Only a human may approve a case. Agents propose; humans approve.');
  }
  if (to === 'APPROVED' && !c.pendingApproval) {
    throw new Error('No pending approval to approve. A proposal must be submitted first.');
  }
  // Backstop for the TTL: the server expires stale proposals on read /
  // transition, but a direct engine call must refuse an expired one too.
  if (to === 'APPROVED' && c.pendingApproval?.requestedAt
    && Date.now() - new Date(c.pendingApproval.requestedAt).getTime() > PROPOSAL_TTL_MS) {
    throw new Error('This proposal has expired — resubmit it before approving.');
  }
  // The approval must match the submitted proposal record, hash for hash.
  if (to === 'APPROVED') verifyApprovalHash(c);
  const from = c.state;
  c.state = to;
  if (to === 'APPROVED') c.approval = { ...c.pendingApproval, approvedBy: actor.name, approvedAt: new Date().toISOString() };
  // M20 (remediation 2026-11-06): a rejection must keep a record of
  // WHICH terms were rejected — pendingApproval is cleared below, so
  // without this the rejected terms vanish from every surface. The
  // record is cleared when a fresh proposal is submitted (new pending
  // approval supersedes it) or when a later approval lands.
  let rejectedTerms = null;
  if (to === 'REJECTED' && c.pendingApproval) {
    rejectedTerms = c.pendingApproval.terms || '';
    c.rejectedTerms = { ...c.pendingApproval, rejectedBy: actor.name, rejectedAt: new Date().toISOString() };
  }
  if (to === 'APPROVED' || to === 'AWAITING_APPROVAL') c.rejectedTerms = null;
  // A pending approval is resolved by leaving AWAITING_APPROVAL for any
  // other state: APPROVED/REJECTED decide it, and stepping back to
  // DISCUSSION reopens the proposal, so nothing is pending any more.
  // (The server re-sets pendingApproval after the transition when a
  // proposal is submitted into AWAITING_APPROVAL — server.js — so
  // clearing here never breaks that path.) Leaving it set made the
  // Decisions view, the case overview and the Approvals panel all claim
  // a decision was still awaited on a case that was already decided or
  // sent back for discussion (QA 2026-11-06, P0 C3).
  if (to !== 'AWAITING_APPROVAL') c.pendingApproval = null;
  audit(c, actor, `state:${from}->${to}`, rejectedTerms ? { rejectedTerms } : {});
  return c;
}

export function audit(c, actor, event, detail = {}) {
  c.audit = c.audit || [];
  // §31.1: chain the event. If the trail still holds unhashed legacy
  // events, baseline them first (a no-op once a baseline exists), so
  // the new event always chains from a hashed predecessor or GENESIS.
  ensureAuditBaseline(c);
  const prev = c.audit[c.audit.length - 1];
  const prevHash = prev?.hash || AUDIT_CHAIN_GENESIS;
  const fields = { at: new Date().toISOString(), actor: actor?.name || 'system', kind: actor?.kind || 'system', event, ...detail };
  const hash = auditChainHash(prevHash, fields);
  c.audit.push({ ...fields, prevHash, hash });
  return c.audit[c.audit.length - 1];
}

// ---------- Audit-trail hash chain (§31.1, 2026-11-07) ----------
// The audit trail used to be a plain array in the same JSON file —
// anyone with file access could edit or delete entries undetected
// (audit M4). New audit events now chain: each carries prevHash (the
// previous event's hash) and hash = SHA-256 of a canonical
// serialisation of (prevHash + the event's own fields). The chain is
// append-only: audit() above chains every new event.
//
// PLACEMENT NOTE: the brief said store.js, but audit() lives here in
// engine.js (not store.js), and the chain helpers reuse canonicalJson
// / sha256Hex defined below. Putting them here keeps the chain next to
// the code that creates events. store.js load() imports
// ensureAuditBaseline from here for the migration; engine.js does NOT
// import store.js (that direction would make tests that statically
// import the engine and then dynamically import the store with a
// scratch CONVERGE_DATA_FILE evaluate the store before the env var is
// set — and read the production file).
//
// LIMITATIONS, stated honestly (see docs/SECURITY.md): a hash chain on
// a local JSON store DETECTS tampering only if the verifier holds an
// independent copy of the head hash; it does not prevent someone with
// write access from recomputing the whole chain, there is no
// externally anchored checkpoint, and deleting the TAIL of the chain
// (a truncated chain) still verifies — only a middle deletion breaks
// the linkage. This is tamper EVIDENCE, not tamper-proof storage.
export const AUDIT_CHAIN_GENESIS = 'GENESIS';

// Hash for one chained event: SHA-256 of the canonical serialisation
// of { prevHash, ...eventFields } — the event's own fields excluding
// the `hash` field itself (which is what is being computed).
export function auditChainHash(prevHash, eventFields) {
  return sha256Hex(canonicalJson({ prevHash, ...eventFields }));
}

// A baseline event commits to every pre-existing (unhashed) audit
// event: its hash is SHA-256 of the canonical serialisation of the
// whole pre-existing array, in order. Old events are NEVER rewritten
// — the baseline is appended after them, and new events chain from it.
export function ensureAuditBaseline(c) {
  const events = c.audit || [];
  if (!events.length) return false;
  if (events.some((e) => e.event === 'chain-baseline')) return false;
  if (!events.some((e) => typeof e.hash !== 'string')) return false;
  const hash = sha256Hex(canonicalJson(events));
  const baselineCount = events.length; // evaluated before the push below
  events.push({
    at: new Date().toISOString(), actor: 'system', kind: 'system',
    event: 'chain-baseline', prevHash: AUDIT_CHAIN_GENESIS, hash,
    baselineCount,
  });
  return true;
}

// Verify an audit trail's hash chain. Returns { valid: true } or
// { valid: false, firstBadIndex, reason }. Detects: a modified event
// (its hash no longer matches its fields), a missing middle event (the
// next event's prevHash no longer matches the previous event's hash),
// reordered events (same break, or the baseline hash no longer
// matches the pre-baseline array), and an invalid previous hash.
// Unhashed (legacy) events are allowed ONLY before the baseline —
// after it, an unhashed event means the chain was broken. A truncated
// chain (tail deleted) still verifies: see the limitations above.
export function verifyAuditChain(events) {
  const list = events || [];
  let expectedPrev = AUDIT_CHAIN_GENESIS;
  let baselineSeen = false;
  let hashedSeen = false;
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (e.event === 'chain-baseline') {
      if (baselineSeen) return { valid: false, firstBadIndex: i, reason: 'duplicate chain-baseline event' };
      if (hashedSeen) return { valid: false, firstBadIndex: i, reason: 'chain-baseline appears after chained events' };
      if (e.prevHash !== AUDIT_CHAIN_GENESIS) return { valid: false, firstBadIndex: i, reason: 'baseline prevHash is not GENESIS' };
      const committed = sha256Hex(canonicalJson(list.slice(0, i)));
      if (e.hash !== committed) return { valid: false, firstBadIndex: i, reason: 'baseline hash does not match the pre-existing events (a pre-baseline event was modified, removed, or reordered)' };
      baselineSeen = true;
      expectedPrev = e.hash;
      continue;
    }
    if (typeof e.hash !== 'string') {
      if (baselineSeen || hashedSeen) return { valid: false, firstBadIndex: i, reason: 'unhashed event after the chain started' };
      continue; // legacy event before the baseline — committed to by it
    }
    hashedSeen = true;
    if (e.prevHash !== expectedPrev) return { valid: false, firstBadIndex: i, reason: 'prevHash does not match the previous event hash (an event is missing, reordered, or a prevHash was tampered with)' };
    const { hash, ...fields } = e;
    if (hash !== auditChainHash(e.prevHash, fields)) return { valid: false, firstBadIndex: i, reason: 'event hash does not match its fields (the event was modified)' };
    expectedPrev = hash;
  }
  return { valid: true };
}

// ---------- Proposals: versioning, content hash, expiry (P0, 2026-11-07) ----------
// A submitted proposal is a real record, not a positional P-number plus
// free text. The approval binds to {proposalId, version, contentHash};
// an approval whose hash does not match the stored record is rejected,
// so an approval can never authorise terms that were never proposed.
// inputHash = SHA-256 of the canonical JSON of the case input + the
// strategy at submit time; contentHash = SHA-256 of the canonical JSON
// of the proposal record's identity fields. Canonical JSON sorts object
// keys recursively, so the hash is stable across serialisations.
export const PROPOSAL_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(',')}}`;
}
export function sha256Hex(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}
export function proposalInputHash(input, strategy) {
  return sha256Hex(canonicalJson({ input, strategy }));
}
export function proposalContentHash(record) {
  return sha256Hex(canonicalJson({
    id: record.id, version: record.version, strategyId: record.strategyId,
    terms: record.terms, inputHash: record.inputHash,
  }));
}

// Expire a stale pending proposal: a case that has waited in
// AWAITING_APPROVAL longer than the TTL moves to EXPIRED with an audit
// event. Returns true when it expired the case. Legacy pending
// approvals without a requestedAt predate versioning and cannot be aged,
// so they are left alone (they can still be approved or rejected).
export function expirePendingApproval(c, now = new Date()) {
  const p = c.pendingApproval;
  if (!p || !p.requestedAt) return false;
  if (c.state !== 'AWAITING_APPROVAL') return false;
  if (new Date(now).getTime() - new Date(p.requestedAt).getTime() <= PROPOSAL_TTL_MS) return false;
  const from = c.state;
  c.state = 'EXPIRED';
  c.pendingApproval = null;
  audit(c, { name: 'system', kind: 'system' }, `state:${from}->EXPIRED`, { reason: 'proposal-expired', proposalId: p.proposalId, version: p.version });
  return true;
}

// Verify a pending approval against its stored proposal record before
// it may be approved. Throws on any mismatch. Legacy pending approvals
// (no contentHash) predate versioning and are approved on the human
// gate alone — the record they reference was never hashed.
export function verifyApprovalHash(c) {
  const p = c.pendingApproval;
  if (!p || !p.contentHash) return;
  const rec = (c.proposals || []).find((x) => x.id === p.proposalId && x.version === p.version);
  if (!rec) {
    throw new Error('No proposal record matches this pending approval — it cannot be verified.');
  }
  if (rec.contentHash !== p.contentHash) {
    throw new Error('Approval does not match the submitted proposal (content hash mismatch).');
  }
  if (proposalContentHash(rec) !== rec.contentHash) {
    throw new Error('The stored proposal record has been tampered with (content hash mismatch).');
  }
  // The case input must be unchanged since the proposal was submitted:
  // recompute the strategy from the current input and re-hash.
  if (c.workflow === 'HAGGLE' && c.input) {
    const strategies = haggleStrategies(haggleAnalysis(c.input), c.input);
    const strategy = strategies.find((s) => s.id === rec.strategyId);
    if (!strategy) {
      throw new Error('The approved strategy no longer exists for this case.');
    }
    if (proposalInputHash(c.input, strategy) !== rec.inputHash) {
      throw new Error('The case input changed after the proposal was submitted — resubmit the proposal.');
    }
  }
}

const round2 = (n) => Math.round(n * 100) / 100;
const round4 = (n) => Math.round(n * 10000) / 10000;

// ---------- HAGGLE: deterministic financial analysis ----------
// Inputs: supplier, ingredient, old/new unit price, unit, qtyPerServing,
// otherIngredientsCostPerServing, menuPrice, monthlySales (servings/month),
// targetFoodCostPct (e.g. 30), targetPrice, maxApprovedPrice.
// All HAGGLE money inputs must be finite numbers. Numeric strings are
// coerced (JSON data sometimes carries them); Infinity, NaN, missing
// fields and non-numeric strings are rejected — never let them leak
// NaN/Infinity into financial output (QA 2026-11-06, BUG-1/BUG-2).
// Both haggleAnalysis and haggleStrategies normalise through here so
// the two can never disagree about what counts as valid input.
const HAGGLE_NUMERIC = ['oldPrice', 'newPrice', 'qtyPerServing', 'otherIngredientsCostPerServing', 'menuPrice', 'monthlySales', 'targetFoodCostPct'];
export function normalizeHaggleInputs(raw) {
  const input = { ...raw };
  for (const k of HAGGLE_NUMERIC) {
    const v = Number(raw[k]);
    if (!Number.isFinite(v)) throw new Error(`Invalid HAGGLE inputs: ${k} must be a finite number.`);
    input[k] = v;
  }
  if (!(input.oldPrice >= 0 && input.newPrice >= 0 && input.qtyPerServing > 0 && input.menuPrice > 0 && input.monthlySales >= 0 && input.otherIngredientsCostPerServing >= 0 && input.targetFoodCostPct > 0)) {
    throw new Error('Invalid HAGGLE inputs: prices, quantity, menu price and sales must be valid numbers.');
  }
  return input;
}
export function haggleAnalysis(rawInput) {
  const input = normalizeHaggleInputs(rawInput);
  const {
    oldPrice, newPrice, qtyPerServing, otherIngredientsCostPerServing,
    menuPrice, monthlySales, targetFoodCostPct,
  } = input;
  const oldCream = round4(oldPrice * qtyPerServing);
  const newCream = round4(newPrice * qtyPerServing);
  const diffPerServing = round4(newCream - oldCream);
  const pctChange = oldPrice === 0 ? null : round2(((newPrice - oldPrice) / oldPrice) * 100);
  const oldTotal = round2(oldCream + otherIngredientsCostPerServing);
  const newTotal = round2(newCream + otherIngredientsCostPerServing);
  const oldFoodPct = round2((oldTotal / menuPrice) * 100);
  const newFoodPct = round2((newTotal / menuPrice) * 100);
  const oldGrossMarginPct = round2(100 - oldFoodPct);
  const newGrossMarginPct = round2(100 - newFoodPct);
  const monthlyExtra = round2(diffPerServing * monthlySales);
  const annualExtra = round2(monthlyExtra * 12);
  // Max sustainable unit price at the target food-cost %:
  // targetTotal = target% * menuPrice; maxCream = targetTotal - other; / qty.
  const targetTotal = round2((targetFoodCostPct / 100) * menuPrice);
  const maxSustainablePrice = round4(Math.max(0, (targetTotal - otherIngredientsCostPerServing) / qtyPerServing));
  return {
    oldCreamCostPerServing: oldCream, newCreamCostPerServing: newCream,
    costDiffPerServing: diffPerServing, pctChange,
    oldTotalCostPerServing: oldTotal, newTotalCostPerServing: newTotal,
    oldFoodCostPct: oldFoodPct, newFoodCostPct: newFoodPct, oldGrossMarginPct, newGrossMarginPct,
    monthlyExtraCost: monthlyExtra, annualExtraCost: annualExtra,
    targetTotalCostPerServing: targetTotal, maxSustainableUnitPrice: maxSustainablePrice,
    assumptions: {
      unit: input.unit, qtyPerServing, otherIngredientsCostPerServing,
      menuPrice, monthlySales, targetFoodCostPct,
      note: 'Monthly = monthlySales servings × per-serving difference. Annual = monthly × 12. Gross margin = 100% − food-cost %. Net profit is NOT shown: rent, labour and overhead are not in this model.',
    },
  };
}

// Strategy prices are DERIVED from the case input and the owner mandate
// (P0, 2026-11-07) — the old $0.19/$0.21/$0.18/$0.20 constants were the
// seed case's prices and were meaningless for any wizard-created case.
//   freeze:      hold the old price (unchanged)
//   counter:     midpoint between targetPrice and maxApprovedPrice,
//                capped at maxApprovedPrice
//   volume:      a 10% discount on the new price
//   alternative: 25% below the new price (a second supplier's quote)
//   gradual:     a step from the new price toward maxApprovedPrice,
//                landing at the ceiling (never above it)
//   substitute:  trial at the old price (unchanged)
// Strategy ids stay as they are (the P-number mapping and the client
// depend on them); the names and details carry the derived prices.
// Every strategy carries unitPrice, duration and unit so the client can
// compute the approval terms as money(unitPrice) + ' / ' + unit +
// ' for ' + duration. The recommendation is computed from the
// strategy's own food-cost % against the target — no hardcoded "stays
// under the 30% target" text.
export function haggleStrategies(analysis, rawInput) {
  const input = normalizeHaggleInputs(rawInput);
  const { monthlySales, menuPrice, newPrice, oldPrice, unit } = input;
  const target = input.targetFoodCostPct;
  // The owner mandate is optional for the engine: a case created through
  // the API always carries targetPrice/maxApprovedPrice (creation
  // validates them), but a partial input — a regression fixture, a
  // read-only strategy listing — must not throw (engine-edge BUG-2 pins
  // this: haggleStrategies must not crash on an input the analysis
  // accepted). Fall back to the prices the mandate would most plausibly
  // be: the target is the old (pre-rise) price, the ceiling is the
  // supplier's new price. Both are finite here — normalizeHaggleInputs
  // already validated old/newPrice.
  const targetPrice = Number.isFinite(Number(input.targetPrice)) ? Number(input.targetPrice) : oldPrice;
  const maxApprovedPrice = Number.isFinite(Number(input.maxApprovedPrice)) ? Number(input.maxApprovedPrice) : newPrice;
  const counterPrice = round4(Math.min((targetPrice + maxApprovedPrice) / 2, maxApprovedPrice));
  const volumePrice = round4(newPrice * 0.9);
  const alternativePrice = round4(newPrice * 0.75);
  const gradualPrice = round4(Math.min(maxApprovedPrice, newPrice));
  const money2 = (n) => `$${Number(n).toFixed(2)}`;
  const atPrice = (unitPrice) => {
    const cream = round4(unitPrice * input.qtyPerServing);
    const total = round2(cream + input.otherIngredientsCostPerServing);
    return {
      unitPrice, creamCostPerServing: cream, totalCostPerServing: total,
      foodCostPct: round2((total / menuPrice) * 100),
      extraVsOldPerMonth: round2((cream - analysis.oldCreamCostPerServing) * monthlySales),
      savingVsNewPerMonth: round2((analysis.newCreamCostPerServing - cream) * monthlySales),
    };
  };
  // Recommendation, computed from the strategy's own figures: whether
  // its food-cost % sits within the target, plus one line of guidance.
  const recommend = (s, note) => {
    const within = s.foodCostPct <= target;
    return `Food cost ${s.foodCostPct}% vs the ${target}% target — ${within ? 'within target' : 'above target'}. ${note}`;
  };
  const freeze = { id: 'freeze', name: 'Price freeze', detail: `Hold ${money2(oldPrice)} / ${unit} for 4 weeks in exchange for a volume commitment.`, duration: '4 weeks', unit, ...atPrice(oldPrice) };
  freeze.recommendation = recommend(freeze, 'Best if the supplier values the volume commitment.');
  const counter = { id: 'counter-019', name: `Accept a counter at ${money2(counterPrice)}`, detail: `Supplier counter-offer: ${money2(counterPrice)} / ${unit} for 6 weeks, in writing.`, duration: '6 weeks', unit, ...atPrice(counterPrice) };
  counter.recommendation = recommend(counter, 'A negotiated middle ground; get it in writing.');
  const volume = { id: 'volume-021', name: `Volume discount at ${money2(volumePrice)}`, detail: `Commit to a weekly volume for 4 weeks at ${money2(volumePrice)} / ${unit}.`, duration: '4 weeks', unit, ...atPrice(volumePrice) };
  volume.recommendation = recommend(volume, 'Useful if the freeze is refused and storage allows it.');
  const alternative = { id: 'alternative-018', name: `Alternative supplier at ${money2(alternativePrice)}`, detail: `Seeded quote from a second supplier at ${money2(alternativePrice)} / ${unit}, same quality grade. Verify before switching.`, duration: '4 weeks', unit, unverified: true, ...atPrice(alternativePrice) };
  alternative.recommendation = recommend(alternative, 'Strong fallback; verify quality and delivery before committing.');
  const gradual = { id: 'gradual', name: `Gradual adjustment to ${money2(gradualPrice)}`, detail: maxApprovedPrice < newPrice
    ? `${money2(gradualPrice)} / ${unit} now, reviewed in 4 weeks. This is the owner's max approved price.`
    : `${money2(gradualPrice)} / ${unit} now, reviewed in 4 weeks.`, duration: '4 weeks', unit, ...atPrice(gradualPrice) };
  gradual.recommendation = recommend(gradual, 'Ceiling option — never exceed without a new approval.');
  const substitute = { id: 'substitute', name: 'Ingredient substitution', detail: 'Trial a lower-cost cream blend on one dish only. Quality risk: taste/texture may change; test before any menu change.', duration: 'trial', unit, risk: 'Quality risk — requires a blind taste test first.', ...atPrice(oldPrice) };
  substitute.recommendation = recommend(substitute, 'Only as a tested trial, never as a silent swap.');
  return [freeze, counter, volume, alternative, gradual, substitute];
}

// ---------- COURT: conflict detection + blind tally ----------
export function courtConflicts(versions) {
  // versions: [{id, author, ingredients: {name: value}, steps: [...]}]
  const keys = [...new Set(versions.flatMap((v) => Object.keys(v.ingredients)))];
  return keys.map((key) => {
    const values = versions.map((v) => ({ version: v.id, author: v.author, value: v.ingredients[key] ?? '(not stated)' }));
    const distinct = new Set(values.map((x) => String(x.value).toLowerCase()));
    return { variable: key, values, conflict: distinct.size > 1 };
  });
}

// ---------- COURT: canonical adoption ----------
// Adopting the canonical version is the decision step of the COURT
// workflow (remediation H12, 2026-11-06). Human-only, tally-complete
// only, recorded in the audit like HAGGLE's approval. Dissent is
// preserved: the losing versions stay on the record (they are never
// deleted, and the adoption record carries every version's mean).
export function adoptCanonical(c, versionId, actor) {
  if (actor?.kind !== 'human') {
    throw new Error('Only a human may adopt a canonical version. Agents propose; humans decide.');
  }
  const expected = (c.readers?.length || 0) * (c.samples?.length || 0);
  const complete = expected > 0 && (c.ratings || []).length >= expected;
  if (!complete) {
    throw new Error('The tally is not complete — every reader must rate every sample before a version can be adopted.');
  }
  if (c.canonicalVersion) {
    throw new Error(`A canonical version is already adopted (${c.canonicalVersion}).`);
  }
  const tally = courtTally(c.ratings);
  const means = {};
  for (const s of (c.samples || [])) {
    if (tally[s.code]) means[s.version] = tally[s.code].means.overall;
  }
  const version = versionId || Object.entries(means).sort((a, b) => b[1] - a[1])[0]?.[0];
  if (!version || !(c.versions || []).some((v) => v.id === version)) {
    throw new Error(`Unknown version ${version}`);
  }
  const author = (c.versions.find((v) => v.id === version) || {}).author || version;
  c.canonicalVersion = version;
  c.canonicalAdoption = {
    version, author, adoptedBy: actor.name, adoptedAt: new Date().toISOString(),
    leaderMean: means[version], means,
  };
  audit(c, actor, 'court-adopted-canonical', { version, adoptedBy: actor.name });
  return c.canonicalAdoption;
}

export function courtTally(ratings) {
  // ratings: [{reader, sampleCode, scores: {taste, texture, aroma, appearance, difficulty, overall}}]
  // Readers submit blind: scores are only revealed once every reader has submitted.
  const bySample = {};
  for (const r of ratings) {
    bySample[r.sampleCode] = bySample[r.sampleCode] || [];
    bySample[r.sampleCode].push(r);
  }
  const result = {};
  for (const [code, rs] of Object.entries(bySample)) {
    const dims = ['taste','texture','aroma','appearance','difficulty','overall'];
    const means = {};
    const disagreement = {};
    for (const d of dims) {
      const vals = rs.map((r) => r.scores[d]).filter((v) => typeof v === 'number');
      means[d] = vals.length ? round2(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
      disagreement[d] = vals.length ? Math.max(...vals) - Math.min(...vals) : 0;
    }
    result[code] = { n: rs.length, means, maxDisagreement: Math.max(...Object.values(disagreement)), disagreement };
  }
  return result;
}

// ---------- CORRECTION: claim extraction + statuses ----------
export const CLAIM_STATUSES = ['Verified','Corrected','Clarified','Disputed','Unresolved'];

// Stable claim id (§31.2, 2026-11-07): derived from the claim TEXT,
// not its position. A transcript reorder or an inserted sentence must
// never silently rebind an existing challenge or status to a different
// claim (audit M6). Normalisation collapses whitespace and case so
// trivial formatting edits do not churn the id; a real wording change
// is a different claim and gets a new id (the old status is orphaned,
// not rebound — see migrateCorrectionClaimKeys).
export function stableClaimId(text) {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim().toLowerCase();
  return `C-${sha256Hex(normalized).slice(0, 8)}`;
}
export function extractClaims(transcript) {
  // Rule-based only: sentences containing a number, year, title, or
  // a verifiable verb (led/co-led, founded, published, won). Opinions
  // (I think / I feel / in my opinion) are separated out, not claims.
  const sentences = String(transcript || '').split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
  return sentences.map((text, i) => {
    const isOpinion = /^(i think|i feel|in my opinion|i believe)/i.test(text);
    const hasNumber = /\d/.test(text);
    const hasVerifiable = /(led|co-led|founded|published|won|survey|professor|lecturer|director|ceo|%|percent)/i.test(text);
    return {
      id: stableClaimId(text), legacyId: `C${i + 1}`, text, timestamp: null,
      kind: isOpinion ? 'opinion' : (hasNumber || hasVerifiable ? 'factual-assertion' : 'unclassified'),
      status: isOpinion ? 'Clarified' : 'Unresolved',
      evidence: [], guestChallenge: null,
    };
  }).filter((c) => c.kind === 'factual-assertion');
}

// One-time migration for stored CORRECTION claim records (§31.2).
// claimStatuses / claimChallenges / claimChallengeHistory were keyed
// by POSITIONAL ids (C1/C2/C3). Re-key them to the stable ids of the
// claims at those legacy positions in the CURRENT transcript, and
// preserve anything that no longer maps as orphaned (never silently
// dropped). ASSUMPTION, documented: the migration is correct only if
// the transcript has not changed since the statuses were set — true
// for the production COR-003 (seed transcript, statuses set against
// it). After migration, all keys are stable ids, so later reorders
// and edits can never rebind a status to a different claim; a
// changed claim's old status is orphaned, not moved. Idempotent:
// after migration no legacy keys remain, so it is a no-op.
export function migrateCorrectionClaimKeys(c) {
  if (!c || c.workflow !== 'CORRECTION') return false;
  const claims = extractClaims(c.transcript);
  const byLegacy = new Map(claims.map((cl) => [cl.legacyId, cl.id]));
  const byStable = new Set(claims.map((cl) => cl.id));
  let changed = false;
  const maps = [
    ['claimStatuses', 'orphanedClaimStatuses'],
    ['claimChallenges', 'orphanedClaimChallenges'],
    ['claimChallengeHistory', 'orphanedClaimChallengeHistory'],
  ];
  for (const [key, orphanKey] of maps) {
    const m = c[key];
    if (!m || typeof m !== 'object') continue;
    for (const oldId of Object.keys(m)) {
      if (byStable.has(oldId)) continue; // already a stable id
      const stableId = byLegacy.get(oldId);
      if (stableId) {
        // Only move if the stable slot is empty — a duplicate legacy
        // key must never overwrite a status already recorded there.
        if (m[stableId] === undefined) m[stableId] = m[oldId];
        delete m[oldId];
      } else {
        c[orphanKey] = c[orphanKey] || {};
        c[orphanKey][oldId] = m[oldId];
        delete m[oldId];
      }
      changed = true;
    }
  }
  return changed;
}

// CORRECTION claim -> evidence linkage, computed server-side from the
// case's own evidence notes (remediation L5, 2026-11-06): the client
// used to hardcode C1->E1, C2->E2, which broke silently if claims or
// evidence changed. A claim cites the evidence item whose note shares
// the most content words with the claim text (numbers included, so
// "40 percent" matches a note saying "40%"); a claim sharing no content
// word with any item cites nothing. Seed behaviour is unchanged:
// C1->E1 ("survey"/"led"), C2->E2 ("40"), C3->none.
const CLAIM_EVIDENCE_STOPWORDS = new Set(['i', 'we', 'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'was', 'is', 'are', 'were', 'be', 'been', 'by', 'with', 'not', 'that', 'this', 'it', 'its', 'as', 'at', 'from', 'there', 'still', 'am', 'my', 'me']);
function claimTokens(text) {
  return new Set(String(text || '').toLowerCase().replace(/%/g, ' ').split(/[^a-z0-9]+/).filter((t) => t && !CLAIM_EVIDENCE_STOPWORDS.has(t)));
}
export function claimEvidenceRefs(claims, evidence) {
  const refs = {};
  for (const cl of claims || []) {
    const ct = claimTokens(cl.text);
    let best = null, bestScore = 0;
    for (const e of evidence || []) {
      const et = claimTokens(e.note || '');
      let score = 0;
      for (const t of ct) if (et.has(t)) score += 1;
      if (score > bestScore) { bestScore = score; best = e; }
    }
    refs[cl.id] = bestScore > 0 ? [best.id] : [];
  }
  return refs;
}

export function setClaimStatus(claim, status, actor) {
  if (!CLAIM_STATUSES.includes(status)) throw new Error(`Unknown claim status ${status}`);
  if (status !== 'Unresolved' && actor?.kind !== 'human') {
    throw new Error('Only a human (host/guest) may change a claim status. The verification agent proposes.');
  }
  claim.status = status;
  return claim;
}
