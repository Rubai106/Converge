// CONVERGE QA seeding — writes the disposable QA dataset (seed cases +
// three isolated QA cases) into a data file. Usage:
//   node scripts/qa-seed.mjs <target-data-file>
// The target must NOT be this repo's production data/converge.json —
// the script refuses to touch it, so a stray run can never wipe the
// real demo data or the HAG-014 approval history.
// QA cases (disposable; production HAG-014 stays pristine here):
//   CRT-QA — clone of CRT-007 with only the first 4 of 9 ratings
//            (S1 complete, S2 partial, S3 empty: the blind-tally state)
//   COR-QA — clone of COR-003 with fresh claims (no statuses/challenges)
//   HAG-QA — clone of HAG-014 forced back to DISCUSSION, no pending
//            approval (destructive approval/transition tests go here)
import { seedData } from '../server/store.js';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

const target = resolve(process.argv[2] || '');
// The production data file lives in the real repo only. Compare
// against its absolute path (not a path relative to this script: the
// script is also copied into the QA instance, where a relative
// resolution would wrongly point at the QA copy's own data file).
const production = '/home/hatch/workspace/converge/data/converge.json';
if (!target || target === production) {
  console.error('Refusing: give an explicit QA data file, never the production data/converge.json.');
  process.exit(1);
}

const d = seedData();
const clone = (id) => JSON.parse(JSON.stringify(d.cases.find((c) => c.id === id)));

const crt = clone('CRT-007');
crt.id = 'CRT-QA';
crt.title = 'Nonna’s ragù — QA copy (4 of 9 ratings)';
crt.switchRoom = '#qa-recipe-ragu';
crt.switchRoomId = null;
crt.ratings = crt.ratings.slice(0, 4);
crt.audit = [];
crt.messages = [];
d.cases.push(crt);

const cor = clone('COR-003');
cor.id = 'COR-QA';
cor.title = 'Episode 12 — QA copy (fresh claims)';
cor.switchRoom = '#qa-episode-osei';
cor.switchRoomId = null;
cor.claimStatuses = {};
cor.claimChallenges = {};
cor.audit = [];
cor.messages = [];
d.cases.push(cor);

const hag = clone('HAG-014');
hag.id = 'HAG-QA';
hag.title = 'DairyCo cream — QA copy (DISCUSSION)';
hag.switchRoom = '#qa-haggle-dairyco';
hag.switchRoomId = null;
hag.state = 'DISCUSSION';
hag.pendingApproval = null;
hag.approval = null;
hag.audit = [];
hag.messages = [];
d.cases.push(hag);

mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, JSON.stringify(d, null, 2));
console.log(`QA data written to ${target}: ${d.cases.length} cases (HAG-014 ${d.cases.find((c) => c.id === 'HAG-014').state}, CRT-QA ${crt.ratings.length}/9 ratings, HAG-QA DISCUSSION)`);
