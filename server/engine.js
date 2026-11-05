// CONVERGE shared decision engine — deterministic, no LLM maths.
// All money is calculated here, never by an LLM. Gross profit is shown
// separately from net profit; assumptions and units travel with every number.

export const STATES = [
  'DRAFT','INTAKE','INVESTIGATING','DISCUSSION','PROPOSAL',
  'AWAITING_APPROVAL','APPROVED','COMPLETED','REJECTED','BLOCKED','CANCELLED',
];

// Validated state transitions. Agents may never skip AWAITING_APPROVAL.
export const TRANSITIONS = {
  DRAFT: ['INTAKE','CANCELLED'],
  INTAKE: ['INVESTIGATING','BLOCKED','CANCELLED'],
  INVESTIGATING: ['DISCUSSION','BLOCKED','CANCELLED'],
  DISCUSSION: ['PROPOSAL','BLOCKED','CANCELLED'],
  PROPOSAL: ['AWAITING_APPROVAL','DISCUSSION','REJECTED','CANCELLED'],
  AWAITING_APPROVAL: ['APPROVED','REJECTED','DISCUSSION'],
  APPROVED: ['COMPLETED','BLOCKED'],
  COMPLETED: [],
  REJECTED: ['DISCUSSION','CANCELLED'],
  BLOCKED: ['INTAKE','INVESTIGATING','DISCUSSION','CANCELLED'],
  CANCELLED: [],
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
  const from = c.state;
  c.state = to;
  if (to === 'APPROVED') c.approval = { ...c.pendingApproval, approvedBy: actor.name, approvedAt: new Date().toISOString() };
  audit(c, actor, `state:${from}->${to}`);
  return c;
}

export function audit(c, actor, event, detail = {}) {
  c.audit = c.audit || [];
  c.audit.push({ at: new Date().toISOString(), actor: actor?.name || 'system', kind: actor?.kind || 'system', event, ...detail });
  return c.audit[c.audit.length - 1];
}

const round2 = (n) => Math.round(n * 100) / 100;
const round4 = (n) => Math.round(n * 10000) / 10000;

// ---------- HAGGLE: deterministic financial analysis ----------
// Inputs: supplier, ingredient, old/new unit price, unit, qtyPerServing,
// otherIngredientsCostPerServing, menuPrice, monthlySales (servings/month),
// targetFoodCostPct (e.g. 30), targetPrice, maxApprovedPrice.
export function haggleAnalysis(input) {
  const {
    oldPrice, newPrice, qtyPerServing, otherIngredientsCostPerServing,
    menuPrice, monthlySales, targetFoodCostPct,
  } = input;
  if (!(oldPrice >= 0 && newPrice >= 0 && qtyPerServing > 0 && menuPrice > 0 && monthlySales >= 0)) {
    throw new Error('Invalid HAGGLE inputs: prices, quantity, menu price and sales must be valid numbers.');
  }
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

export function haggleStrategies(analysis, input) {
  const { monthlySales, menuPrice } = input;
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
  return [
    { id: 'freeze', name: 'Price freeze', detail: `Hold $${input.oldPrice.toFixed(2)} for 4 weeks in exchange for a volume commitment.`, ...atPrice(input.oldPrice), recommendation: 'Best if the supplier values the volume commitment.' },
    { id: 'counter-019', name: 'Accept a counter at $0.19', detail: 'Supplier counter-offer: $0.19/fl oz for 6 weeks, in writing.', ...atPrice(0.19), recommendation: 'Balanced: stays under the 30% food-cost target.' },
    { id: 'volume-021', name: 'Volume discount at $0.21', detail: 'Commit to 25 L/week for $0.21/fl oz.', ...atPrice(0.21), recommendation: 'Useful if the freeze is refused and storage allows it.' },
    { id: 'alternative-018', name: 'Alternative supplier at $0.18', detail: 'Seeded quote from a second supplier, same quality grade. Verify before switching.', ...atPrice(0.18), recommendation: 'Strong fallback; verify quality and delivery before committing.', unverified: true },
    { id: 'gradual', name: 'Gradual adjustment to $0.20', detail: '$0.20/fl oz now, reviewed in 4 weeks. This is the owner\'s max approved price.', ...atPrice(0.20), recommendation: 'Ceiling option — never exceed without a new approval.' },
    { id: 'substitute', name: 'Ingredient substitution', detail: 'Trial a lower-cost cream blend on one dish only. Quality risk: taste/texture may change; test before any menu change.', ...atPrice(input.oldPrice), recommendation: 'Only as a tested trial, never as a silent swap.', risk: 'Quality risk — requires a blind taste test first.' },
  ];
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
      id: `C${i + 1}`, text, timestamp: null,
      kind: isOpinion ? 'opinion' : (hasNumber || hasVerifiable ? 'factual-assertion' : 'unclassified'),
      status: isOpinion ? 'Clarified' : 'Unresolved',
      evidence: [], guestChallenge: null,
    };
  }).filter((c) => c.kind === 'factual-assertion');
}

export function setClaimStatus(claim, status, actor) {
  if (!CLAIM_STATUSES.includes(status)) throw new Error(`Unknown claim status ${status}`);
  if (status !== 'Unresolved' && actor?.kind !== 'human') {
    throw new Error('Only a human (host/guest) may change a claim status. The verification agent proposes.');
  }
  claim.status = status;
  return claim;
}
