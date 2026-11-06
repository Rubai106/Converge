// CONVERGE store — JSON file store (SQLite-shaped, no native deps).
// Cases, evidence, proposals, approvals, messages and audit trail.
// Demo data is seeded, clearly labelled as demo/fictional.
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, copyFileSync, openSync, fsyncSync, closeSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// CONVERGE_DATA_FILE lets tests point the store at a scratch file
// instead of the shared demo data (the full suite runs test files in
// parallel; two files backing up/restoring the same file race).
// Default is the repo's data/converge.json.
const defaultDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const file = process.env.CONVERGE_DATA_FILE || join(defaultDir, 'converge.json');
const dir = dirname(file);

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
        switchRoom: '#haggle-dairyco', switchRoomId: null,
        proposals: [
          { id: 'P1', kind: 'proposal', text: 'Hold $0.16 / fl oz for 4 weeks for a 25 L/week volume commitment.', status: 'proposed', by: 'Negotiation Agent' },
          { id: 'P2', kind: 'counter-offer', text: 'Supplier counters: $0.18 / fl oz for 6 weeks, in writing.', status: 'proposed', by: 'DairyCo rep' },
        ],
        pendingApproval: { proposalId: 'P2', terms: '$0.18 / fl oz for 6 weeks', requestedBy: 'Negotiation Agent' },
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
        switchRoom: '#recipe-ragu', switchRoomId: null,
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
        switchRoom: '#episode-osei', switchRoomId: null,
        proposals: [], pendingApproval: null, approval: null, audit: [], messages: [],
        evidence: [
          { id: 'E1', type: 'source', source: 'Lab page (demo)', status: 'Verified', note: 'Survey was co-led with Dr Chen.' },
          { id: 'E2', type: 'source', source: 'Paper (demo)', status: 'Verified', note: 'Paper says 38%, not 40%.' },
        ],
      },
    ],
  };
}

const BACKUP_COUNT = 3;
const backupFile = (n) => `${file}.bak.${n}`;

// Atomic save (P0, 2026-11-07): the old bare writeFileSync could leave
// a truncated converge.json if the process died mid-write — and this VM
// has been replaced seven times. Write the full payload to a temp file,
// fsync it, then rename over the live file (rename is atomic on the
// same filesystem), and rotate the last 3 saves as backups.
export function save(data) {
  mkdirSync(dir, { recursive: true });
  const payload = JSON.stringify(data, null, 2);
  const tmp = `${file}.tmp`;
  const fd = openSync(tmp, 'w');
  try {
    writeFileSync(fd, payload);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(tmp, file);
  rotateBackups();
  return data;
}

function rotateBackups() {
  // Shift .bak.2 -> .bak.3, .bak.1 -> .bak.2, then copy the just-saved
  // live file to .bak.1. Missing backups are skipped, never fatal.
  try {
    for (let n = BACKUP_COUNT - 1; n >= 1; n--) {
      const from = backupFile(n);
      if (existsSync(from)) renameSync(from, backupFile(n + 1));
    }
    copyFileSync(file, backupFile(1));
  } catch {
    // Backups are best-effort: a failed rotation must never fail the save.
  }
}

// Read and parse a JSON store file; returns null when the file is
// missing or unparseable (a truncated write).
function tryReadJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

export function load() {
  if (!existsSync(file)) { mkdirSync(dir, { recursive: true }); const d = seedData(); save(d); return d; }
  let d = tryReadJson(file);
  if (!d) {
    // The live file is corrupt (a crash mid-write before the atomic
    // save existed, or a partial write from another process) — fall
    // back to the newest valid backup instead of losing everything.
    for (let n = 1; n <= BACKUP_COUNT; n++) {
      d = tryReadJson(backupFile(n));
      if (d) break;
    }
  }
  if (!d || !Array.isArray(d.cases)) {
    const fresh = seedData();
    save(fresh);
    return fresh;
  }
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
  // QA 2026-11-06 (P0 C3): cases recorded in any state other than
  // AWAITING_APPROVAL could still carry a stale pendingApproval (the
  // engine used to leave it set on APPROVED/REJECTED, and on the
  // DISCUSSION step-back). A case that is not awaiting approval has
  // nothing pending; clear it. The approval record and the audit trail
  // are untouched.
  for (const c of d.cases) {
    if (c.state !== 'AWAITING_APPROVAL' && c.pendingApproval) {
      c.pendingApproval = null; changed = true;
    }
  }
  if (changed) save(d);
  return d;
}
export function getCase(data, id) { return data.cases.find((c) => c.id === id); }
