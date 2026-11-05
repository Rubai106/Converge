// CONVERGE store — JSON file store (SQLite-shaped, no native deps).
// Cases, evidence, proposals, approvals, messages and audit trail.
// Demo data is seeded, clearly labelled as demo/fictional.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const file = join(dir, 'converge.json');

export function seedData() {
  return {
    cases: [
      {
        id: 'HAG-014', workflow: 'HAGGLE', title: 'DairyCo heavy cream price rise',
        state: 'AWAITING_APPROVAL', demo: true,
        participants: [
          { name: 'Mara (owner)', role: 'owner', kind: 'human' },
          { name: 'DairyCo rep', role: 'supplier', kind: 'human', simulated: true },
          { name: 'Negotiation Agent', role: 'negotiator', kind: 'agent' },
          { name: 'Financial Analyst', role: 'analyst', kind: 'agent' },
        ],
        input: {
          supplier: 'DairyCo', ingredient: 'heavy cream', oldPrice: 0.16, newPrice: 0.24,
          unit: 'fl oz', qtyPerServing: 6, otherIngredientsCostPerServing: 3.62,
          menuPrice: 16.0, monthlySales: 160, targetFoodCostPct: 30,
          targetPrice: 0.16, maxApprovedPrice: 0.20, recipe: 'Alfredo',
        },
        switchRoom: '#haggle-dairyco',
        proposals: [
          { id: 'P1', kind: 'proposal', text: 'Hold $0.16/fl oz for 4 weeks for a 25 L/week volume commitment.', status: 'proposed', by: 'Negotiation Agent' },
          { id: 'P2', kind: 'counter-offer', text: 'Supplier counters: $0.19/fl oz for 6 weeks, in writing.', status: 'proposed', by: 'DairyCo rep' },
        ],
        pendingApproval: { proposalId: 'P2', terms: '$0.19/fl oz for 6 weeks', requestedBy: 'Negotiation Agent' },
        approval: null, audit: [], messages: [],
        evidence: [
          { id: 'E1', type: 'invoice', source: 'DairyCo invoice (demo)', status: 'Verified', note: 'Cream $0.16 → $0.24/fl oz.' },
          { id: 'E2', type: 'recipe', source: 'Alfredo recipe file (demo)', status: 'Verified', note: '6 fl oz cream per portion.' },
        ],
      },
      {
        id: 'CRT-007', workflow: 'COURT', title: "Nonna's ragù — which version is canonical?",
        state: 'DISCUSSION', demo: true,
        participants: [
          { name: 'Family group', role: 'tasters', kind: 'human' },
          { name: 'Facilitator Agent', role: 'facilitator', kind: 'agent' },
        ],
        versions: [
          { id: 'card', author: 'Nonna (card)', ingredients: { salt: 'a pinch', fat: 'lard', simmer: '3 hours', tomato: 'San Marzano' } },
          { id: 'auntie', author: 'Auntie', ingredients: { salt: '1 tbsp', fat: 'butter', simmer: '3 hours', tomato: 'San Marzano' } },
          { id: 'cousin', author: 'Cousin', ingredients: { salt: 'none', fat: 'butter', simmer: '90 min', tomato: 'San Marzano' } },
        ],
        // Blind test-cook: coded samples, 3 independent readers.
        // The sample→version mapping is revealed only in the tally,
        // after every reader has submitted. Ratings are persisted in
        // this store (POST /api/court/rate); the seed below is the
        // demo's completed test-cook.
        readers: ['Reader A', 'Reader B', 'Reader C'],
        samples: [
          { code: 'S1', version: 'card' },
          { code: 'S2', version: 'auntie' },
          { code: 'S3', version: 'cousin' },
        ],
        ratings: [
          { reader: 'Reader A', sampleCode: 'S1', scores: { taste: 5, texture: 4, aroma: 5, appearance: 4, difficulty: 3, overall: 5 } },
          { reader: 'Reader B', sampleCode: 'S1', scores: { taste: 4, texture: 4, aroma: 4, appearance: 5, difficulty: 3, overall: 4 } },
          { reader: 'Reader C', sampleCode: 'S1', scores: { taste: 5, texture: 5, aroma: 4, appearance: 4, difficulty: 4, overall: 5 } },
          { reader: 'Reader A', sampleCode: 'S2', scores: { taste: 4, texture: 5, aroma: 4, appearance: 4, difficulty: 4, overall: 4 } },
          { reader: 'Reader B', sampleCode: 'S2', scores: { taste: 4, texture: 3, aroma: 4, appearance: 3, difficulty: 4, overall: 4 } },
          { reader: 'Reader C', sampleCode: 'S2', scores: { taste: 5, texture: 4, aroma: 5, appearance: 4, difficulty: 3, overall: 5 } },
          { reader: 'Reader A', sampleCode: 'S3', scores: { taste: 3, texture: 3, aroma: 4, appearance: 3, difficulty: 5, overall: 3 } },
          { reader: 'Reader B', sampleCode: 'S3', scores: { taste: 4, texture: 3, aroma: 3, appearance: 4, difficulty: 5, overall: 4 } },
          { reader: 'Reader C', sampleCode: 'S3', scores: { taste: 3, texture: 4, aroma: 3, appearance: 3, difficulty: 4, overall: 3 } },
        ],
        switchRoom: '#recipe-ragu',
        proposals: [], pendingApproval: null, approval: null, audit: [], messages: [],
        evidence: [{ id: 'E1', type: 'photo', source: 'Handwritten card (demo)', status: 'Verified', note: 'Original card photo.' }],
      },
      {
        id: 'COR-003', workflow: 'CORRECTION', title: 'Episode 12 — Dr Amara Osei, deep-sea mining',
        state: 'INVESTIGATING', demo: true,
        participants: [
          { name: 'Host', role: 'host', kind: 'human' },
          { name: 'Dr Amara Osei (guest)', role: 'guest', kind: 'human' },
          { name: 'Verification Agent', role: 'verifier', kind: 'agent' },
        ],
        transcript: 'I led the 2023 Clarion-Clipperton survey. We found that 40 percent of species there are still undescribed. I am a Professor of Marine Biology. I think deep-sea mining is the most important ocean issue of our time.',
        claimStatuses: {}, // claimId -> status, persisted (POST /api/correction/claim)
        claimChallenges: {}, // claimId -> {text, evidence, by}, persisted
        switchRoom: '#episode-osei',
        proposals: [], pendingApproval: null, approval: null, audit: [], messages: [],
        evidence: [
          { id: 'E1', type: 'source', source: 'Lab page (demo)', status: 'Verified', note: 'Survey was co-led with Dr Chen.' },
          { id: 'E2', type: 'source', source: 'Paper (demo)', status: 'Verified', note: 'Paper says 38%, not 40%.' },
        ],
      },
    ],
  };
}

export function load() {
  if (!existsSync(file)) { mkdirSync(dir, { recursive: true }); const d = seedData(); writeFileSync(file, JSON.stringify(d, null, 2)); return d; }
  const d = JSON.parse(readFileSync(file, 'utf8'));
  // Migrate stores seeded before a field existed: backfill missing fields
  // from the current seed, never overwriting data already recorded.
  const seed = seedData();
  let changed = false;
  for (const sc of seed.cases) {
    const c = d.cases.find((x) => x.id === sc.id);
    if (!c) continue;
    for (const [k, v] of Object.entries(sc)) {
      if (c[k] === undefined) { c[k] = v; changed = true; }
    }
  }
  if (changed) writeFileSync(file, JSON.stringify(d, null, 2));
  return d;
}
export function save(data) { mkdirSync(dir, { recursive: true }); writeFileSync(file, JSON.stringify(data, null, 2)); return data; }
export function getCase(data, id) { return data.cases.find((c) => c.id === id); }
