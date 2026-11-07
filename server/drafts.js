// CONVERGE — agent draft inbox (server/drafts.js).
//
// The handoff between the agent runtime and the app: the runtime
// APPENDS a draft record here (it never calls a mutating app endpoint
// and never holds a human session token); the app server READS the
// inbox and lets a human review / share / reject / archive it. The
// file lives alongside the case store (data/drafts.json — gitignored
// production data, same as converge.json) and is resolved from the
// same CONVERGE_DATA_FILE env var, so scratch servers get scratch
// draft files and tests never touch production drafts.
//
// Design:
//  - Append-only for new drafts: a new draft is a NEW record, never an
//    overwrite. A revision requested by a human produces a new draft
//    via the normal room path (the runtime links it with `supersedes`);
//    the old record stays on the record.
//  - Atomic save (same pattern as server/store.js): write the full
//    payload to a temp file, fsync, rename over the live file — a
//    crash mid-write never leaves a torn drafts.json.
//  - Case-scoped: every read/write is scoped by caseId. A draft for
//    HAG-014 can never appear under CRT-007.
//  - Stateless: every operation reads the file fresh, so a draft
//    written by the runtime process (a separate process) is visible
//    to the app server immediately. Nothing is cached in memory.
//  - Two processes (runtime + app server) share this file. The atomic
//    rename prevents torn reads, but a read-modify-write race can
//    still lose an update if both write at the same instant. That is
//    accepted for this single-VM demo deployment (drafts are written
//    rarely — once per human request, once per human action) and is
//    documented, not hidden. A production deployment would need a
//    real store with row-level locking.
//  - A draft record NEVER contains hidden internal reasoning. The
//    fields are the ones a human needs to review the draft: the
//    original request, the tools used, the engine-computed findings,
//    the draft text, the caveats, and the model/provider metadata.

import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, openSync, fsyncSync, closeSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const defaultDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const defaultDataFile = process.env.CONVERGE_DATA_FILE || join(defaultDir, 'converge.json');

// The drafts file lives next to the case store file, so a scratch
// CONVERGE_DATA_FILE gives a scratch drafts file automatically.
export function resolveDraftsFile(env = process.env) {
  const dataFile = env.CONVERGE_DATA_FILE || defaultDataFile;
  return join(dirname(dataFile), 'drafts.json');
}

function tryReadJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

// Read the inbox. Returns { drafts: [] } when the file is missing or
// unparseable — a corrupt inbox must never crash the app server or
// the runtime; it just looks empty (the corruption is logged by the
// caller if it cares).
export function loadDrafts(file) {
  const f = file || resolveDraftsFile();
  const d = tryReadJson(f);
  if (!d || !Array.isArray(d.drafts)) return { drafts: [] };
  return d;
}

// Atomic save: tmp + fsync + rename (same pattern as store.save).
export function saveDrafts(payload, file) {
  const f = file || resolveDraftsFile();
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

// Append a new draft record. Returns the stored draft.
export function appendDraft(draft, file) {
  const inbox = loadDrafts(file);
  inbox.drafts.push(draft);
  saveDrafts(inbox, file);
  return draft;
}

export function getDraft(id, file) {
  return loadDrafts(file).drafts.find((d) => d.id === id) || null;
}

// Drafts for one case only, newest first. Case isolation is enforced
// here — callers never see another case's drafts.
export function listDraftsByCase(caseId, file) {
  return loadDrafts(file).drafts
    .filter((d) => d.caseId === caseId)
    .sort((a, b) => String(b.createdAt || b.at || '').localeCompare(String(a.createdAt || a.at || '')));
}

// The open draft for a case (GENERATED or UNDER_REVIEW, newest first),
// or null. Used by the runtime to set `supersedes` on a new draft.
export function findOpenDraft(caseId, file) {
  return listDraftsByCase(caseId, file).find((d) => d.status === 'GENERATED' || d.status === 'UNDER_REVIEW') || null;
}

// Apply a mutation to one draft and persist. Returns the updated draft,
// or null when no draft with that id exists. The mutator receives the
// draft object; it must not change id, caseId, or the draft content.
export function updateDraft(id, mutate, file) {
  const inbox = loadDrafts(file);
  const d = inbox.drafts.find((x) => x.id === id);
  if (!d) return null;
  mutate(d);
  saveDrafts(inbox, file);
  return d;
}
