// CONVERGE — structured tool registry for the facilitator.
//
// The model NEVER invents numbers and NEVER decides anything: every
// financial figure comes from the deterministic engine (server/engine.js)
// through compute_haggle, and every draft is labelled draft-only. There
// is NO approve / adopt / claim-status / publish tool in this registry —
// that is a structural invariant, not a policy: validateRegistry() throws
// if any tool name or permission would allow a decision, and the test
// suite asserts the registry contains no such tool.
//
// Each tool has: name, description, parameters (JSON Schema for its
// arguments), permission ('read' | 'draft'), timeoutMs, and a handler.
// Every call — success, failure, or timeout — is appended to the audit
// log the caller supplies. Arguments are validated against the schema
// before the handler runs.
//
// Data access is dependency-injected ({getCase, readTimeline}) so the
// registry is testable without the store and cannot touch production
// data on its own. The registry makes NO HTTP calls to the app server and
// NEVER calls /api/session — it holds no human session token.

import { haggleAnalysis, haggleStrategies, courtTally, courtConflicts, extractClaims, claimEvidenceRefs } from './engine.js';
import { validateJson } from './llm.js';

// Tool names that must never exist in this registry. Any tool whose name
// matches, or whose permission is 'mutate', fails validation at creation.
const FORBIDDEN_NAME_PATTERN = /approv|adopt|publish|transition|setclaim|claimstatus|set.?status|execute|commit|send.?message|post.?message/i;
const ALLOWED_PERMISSIONS = new Set(['read', 'draft']);

export function validateRegistry(tools) {
  const names = new Set();
  for (const tool of tools) {
    if (!tool || typeof tool.name !== 'string' || !tool.name) {
      throw new Error('tool registry: every tool needs a non-empty name');
    }
    if (names.has(tool.name)) throw new Error(`tool registry: duplicate tool name "${tool.name}"`);
    names.add(tool.name);
    if (FORBIDDEN_NAME_PATTERN.test(tool.name)) {
      throw new Error(`tool registry: forbidden tool name "${tool.name}" — the facilitator must never approve, adopt, publish, or mutate state`);
    }
    if (!ALLOWED_PERMISSIONS.has(tool.permission)) {
      throw new Error(`tool registry: tool "${tool.name}" has permission "${tool.permission}" — only 'read' and 'draft' exist; there is no mutate permission`);
    }
    if (typeof tool.run !== 'function') throw new Error(`tool registry: tool "${tool.name}" has no run() handler`);
    if (!tool.parameters || typeof tool.parameters !== 'object') throw new Error(`tool registry: tool "${tool.name}" has no parameters schema`);
  }
  return true;
}

function caseSummary(c) {
  if (!c) return null;
  const out = {
    id: c.id, workflow: c.workflow, title: c.title, state: c.state,
    demo: Boolean(c.demo),
    participants: (c.participants || []).map((p) => ({ name: p.name, role: p.role, kind: p.kind })),
    evidence: (c.evidence || []).map((e) => ({ id: e.id, type: e.type, source: e.source, status: e.status, note: e.note })),
  };
  if (c.workflow === 'HAGGLE' && c.input) out.input = { ...c.input };
  if (c.workflow === 'COURT') {
    out.versions = (c.versions || []).map((v) => ({ id: v.id, author: v.author, ingredients: v.ingredients }));
    out.readers = c.readers || [];
    out.ratingsCount = (c.ratings || []).length;
    out.ratingsExpected = (c.readers?.length || 0) * (c.samples?.length || 0);
    out.canonicalVersion = c.canonicalVersion || null;
  }
  if (c.workflow === 'CORRECTION' && c.transcript) out.transcript = c.transcript;
  if (c.pendingApproval) out.pendingApproval = { proposalId: c.pendingApproval.proposalId, terms: c.pendingApproval.terms };
  if (c.approval) out.approval = { proposalId: c.approval.proposalId, terms: c.approval.terms, approvedBy: c.approval.approvedBy };
  return out;
}

// Build the registry. `deps`:
//   getCase(caseId) -> case object or null (synchronous, read-only)
//   readTimeline(caseId) -> Promise<array of {id, author, at, text}>
//   audit(entry) -> appends a tool-call audit entry (optional; defaults
//     to an in-memory array the caller can read via registry.auditLog)
export function createToolRegistry(deps = {}) {
  const getCase = deps.getCase || (() => null);
  const readTimeline = deps.readTimeline || (async () => []);
  const auditLog = deps.auditLog || [];
  const audit = typeof deps.audit === 'function' ? deps.audit : (entry) => auditLog.push(entry);
  // Test hook: override every tool's timeout (the suite uses a small
  // value to exercise the timeout path without waiting 15s).
  const timeoutOverride = typeof deps.toolTimeoutMs === 'number' ? deps.toolTimeoutMs : null;

  const tools = [
    {
      name: 'read_case',
      description: 'Read a case: workflow, state, inputs, participants, evidence. Read-only.',
      permission: 'read',
      timeoutMs: 5000,
      parameters: {
        type: 'object',
        required: ['caseId'],
        properties: { caseId: { type: 'string', minLength: 1 } },
        additionalProperties: false,
      },
      run: async ({ caseId }) => {
        const c = getCase(caseId);
        if (!c) throw new Error(`unknown case ${caseId}`);
        return caseSummary(c);
      },
    },
    {
      name: 'read_room_timeline',
      description: 'Read the Switch room timeline for a case, oldest first. Read-only.',
      permission: 'read',
      timeoutMs: 15000,
      parameters: {
        type: 'object',
        required: ['caseId'],
        properties: { caseId: { type: 'string', minLength: 1 } },
        additionalProperties: false,
      },
      run: async ({ caseId }) => {
        const messages = await readTimeline(caseId);
        return { caseId, count: messages.length, messages };
      },
    },
    {
      name: 'compute_haggle',
      description: 'Run the deterministic HAGGLE engine for a case: full financial analysis plus every strategy, with assumptions. The model NEVER invents money figures — it uses these numbers only.',
      permission: 'read',
      timeoutMs: 5000,
      parameters: {
        type: 'object',
        required: ['caseId'],
        properties: { caseId: { type: 'string', minLength: 1 } },
        additionalProperties: false,
      },
      run: async ({ caseId }) => {
        const c = getCase(caseId);
        if (!c) throw new Error(`unknown case ${caseId}`);
        if (c.workflow !== 'HAGGLE') throw new Error(`case ${caseId} is not a HAGGLE case`);
        const analysis = haggleAnalysis(c.input);
        const strategies = haggleStrategies(analysis, c.input);
        return { caseId, analysis, strategies, source: 'deterministic engine — no LLM maths' };
      },
    },
    {
      name: 'draft_proposal',
      description: 'Draft (ONLY) a proposal for a HAGGLE strategy: the draft text plus the exact terms derived from the engine. Drafts are never submitted for approval by this tool — a human submits.',
      permission: 'draft',
      timeoutMs: 5000,
      parameters: {
        type: 'object',
        required: ['caseId', 'strategyId'],
        properties: {
          caseId: { type: 'string', minLength: 1 },
          strategyId: { type: 'string', minLength: 1 },
        },
        additionalProperties: false,
      },
      run: async ({ caseId, strategyId }) => {
        const c = getCase(caseId);
        if (!c) throw new Error(`unknown case ${caseId}`);
        if (c.workflow !== 'HAGGLE') throw new Error(`case ${caseId} is not a HAGGLE case`);
        const analysis = haggleAnalysis(c.input);
        const strategies = haggleStrategies(analysis, c.input);
        const s = strategies.find((x) => x.id === strategyId);
        if (!s) throw new Error(`unknown strategy ${strategyId} for case ${caseId}`);
        return {
          caseId,
          strategyId: s.id,
          draft: true,
          requiresHumanApproval: true,
          terms: `$${s.unitPrice.toFixed(2)} / ${c.input.unit}`,
          text: `${s.name}: ${s.detail} At $${s.unitPrice.toFixed(2)}/${c.input.unit} the food cost is ${s.foodCostPct}% (was ${analysis.newFoodCostPct}%). ${s.recommendation}`,
          figures: {
            unitPrice: s.unitPrice,
            creamCostPerServing: s.creamCostPerServing,
            totalCostPerServing: s.totalCostPerServing,
            foodCostPct: s.foodCostPct,
            extraVsOldPerMonth: s.extraVsOldPerMonth,
            savingVsNewPerMonth: s.savingVsNewPerMonth,
          },
        };
      },
    },
    {
      name: 'draft_court_summary',
      description: 'Draft (ONLY) a summary of a COURT blind test-cook: conflicts, tally, disagreement, and which version leads. Drafts never adopt a canonical version — a human adopts.',
      permission: 'draft',
      timeoutMs: 5000,
      parameters: {
        type: 'object',
        required: ['caseId'],
        properties: { caseId: { type: 'string', minLength: 1 } },
        additionalProperties: false,
      },
      run: async ({ caseId }) => {
        const c = getCase(caseId);
        if (!c) throw new Error(`unknown case ${caseId}`);
        if (c.workflow !== 'COURT') throw new Error(`case ${caseId} is not a COURT case`);
        const conflicts = courtConflicts(c.versions || []);
        const tally = courtTally(c.ratings || []);
        const expected = (c.readers?.length || 0) * (c.samples?.length || 0);
        return {
          caseId,
          draft: true,
          requiresHumanApproval: true,
          tallyComplete: expected > 0 && (c.ratings || []).length >= expected,
          ratingsCount: (c.ratings || []).length,
          ratingsExpected: expected,
          conflicts: conflicts.filter((x) => x.conflict),
          tally,
        };
      },
    },
    {
      name: 'draft_correction_assessment',
      description: 'Draft (ONLY) an assessment of a CORRECTION case: the factual claims extracted from the transcript and the evidence each one cites. Drafts never change a claim status — a human decides.',
      permission: 'draft',
      timeoutMs: 5000,
      parameters: {
        type: 'object',
        required: ['caseId'],
        properties: { caseId: { type: 'string', minLength: 1 } },
        additionalProperties: false,
      },
      run: async ({ caseId }) => {
        const c = getCase(caseId);
        if (!c) throw new Error(`unknown case ${caseId}`);
        if (c.workflow !== 'CORRECTION') throw new Error(`case ${caseId} is not a CORRECTION case`);
        const claims = extractClaims(c.transcript || '');
        const refs = claimEvidenceRefs(claims, c.evidence || []);
        return {
          caseId,
          draft: true,
          requiresHumanApproval: true,
          claims: claims.map((cl) => ({
            id: cl.id,
            legacyId: cl.legacyId,
            text: cl.text,
            kind: cl.kind,
            // §31.2: status by stable id first, then the legacy
            // positional id (a case whose keys have not migrated yet).
            status: (c.claimStatuses || {})[cl.id] ?? (c.claimStatuses || {})[cl.legacyId] ?? cl.status,
            evidence: refs[cl.id] || [],
          })),
        };
      },
    },
  ];

  validateRegistry(tools);
  const byName = new Map(tools.map((t) => [t.name, t]));

  async function callTool(name, args = {}, { actor = 'facilitator' } = {}) {
    const started = Date.now();
    const entry = { at: new Date().toISOString(), tool: name, actor, ok: false, ms: 0 };
    try {
      const tool = byName.get(name);
      if (!tool) throw new Error(`unknown tool ${name}`);
      const errors = validateJson(args, tool.parameters);
      if (errors.length) throw new Error(`invalid arguments for ${name}: ${errors.join('; ')}`);
      const result = await Promise.race([
        tool.run(args),
        new Promise((_, reject) => setTimeout(() => reject(new Error(`tool ${name} timed out after ${timeoutOverride ?? tool.timeoutMs}ms`)), timeoutOverride ?? tool.timeoutMs)),
      ]);
      entry.ok = true;
      entry.ms = Date.now() - started;
      audit(entry);
      return result;
    } catch (err) {
      entry.ok = false;
      entry.ms = Date.now() - started;
      entry.error = err.message;
      audit(entry);
      throw err;
    }
  }

  return {
    tools: tools.map(({ run, ...meta }) => meta),
    listTools: () => tools.map((t) => ({ name: t.name, description: t.description, permission: t.permission })),
    callTool,
    auditLog,
  };
}
