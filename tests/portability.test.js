// CONVERGE portability regression tests (2026-11-06).
//
// A fresh clone on Windows exposed two portability bugs: tests copied
// data/converge.json (gitignored, absent after clone) and three browser
// tests required a hardcoded Linux playwright-core path + Chromium
// executable. These static checks guard the fix — no test may:
//
//   - construct the production/demo data path (data/converge.json) in
//     code (comments may mention it as the thing NOT to use),
//   - require an absolute path or a hardcoded browser executable,
//   - spawn a server without CONVERGE_DATA_FILE pointing at an
//     isolated temp file.
//
// The browser tests use the Playwright package (devDependency), which
// discovers its own browser per OS — see submission/setup-guide.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
// This file is the checker, not the checked: it necessarily names the
// forbidden patterns as string literals, so it is excluded from its own
// scan. Every other test file is scanned.
const testFiles = readdirSync(join(root, 'tests'))
  .filter((f) => f.endsWith('.test.js') && f !== 'portability.test.js');

// Strip // comment lines before searching, so the "never use X" notes
// in file headers do not trip the checks.
function codeOf(file) {
  return readFileSync(join(root, 'tests', file), 'utf8')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('//'))
    .join('\n');
}

test('portability: no test constructs the production data path in code', () => {
  for (const file of testFiles) {
    const src = codeOf(file);
    assert.ok(!src.includes("join(root, 'data', 'converge.json')"), `${file} builds the production data path`);
    assert.ok(!src.includes('realDataFile'), `${file} references the production data file`);
    assert.ok(!src.includes('copyFileSync(realDataFile'), `${file} copies the production data file`);
    assert.ok(!src.includes("join(root, 'data'"), `${file} builds a path under the repo data/ dir`);
  }
});

test('portability: no absolute Linux path or hardcoded browser executable', () => {
  for (const file of testFiles) {
    const src = codeOf(file);
    assert.ok(!src.includes('/home/'), `${file} contains an absolute Linux home path`);
    assert.ok(!src.includes('playwright-core'), `${file} requires playwright-core directly`);
    assert.ok(!src.includes('chromium-'), `${file} pins a Chromium revision`);
    assert.ok(!src.includes('executablePath'), `${file} hardcodes a browser executable`);
    assert.ok(!src.includes("require('/"), `${file} requires an absolute path`);
  }
});

test('portability: every spawned server gets an isolated CONVERGE_DATA_FILE', () => {
  for (const file of testFiles) {
    const src = codeOf(file);
    if (!src.includes("spawn('node'")) continue;
    assert.ok(src.includes('CONVERGE_DATA_FILE'), `${file} spawns a server without CONVERGE_DATA_FILE`);
    assert.ok(src.includes('mkdtempSync'), `${file} spawns a server without a temp dir`);
    assert.ok(src.includes('seedData()'), `${file} does not seed isolated data with seedData()`);
  }
});

test('portability: browser tests use the Playwright package, not a path', () => {
  const browserFiles = testFiles.filter((f) => codeOf(f).includes('chromium.launch'));
  assert.ok(browserFiles.length >= 3, `expected at least 3 browser test files, found ${browserFiles.length}`);
  for (const file of browserFiles) {
    const src = codeOf(file);
    assert.ok(src.includes("from 'playwright'"), `${file} does not import chromium from the 'playwright' package`);
    assert.ok(src.includes('chromium.launch()'), `${file} passes a hardcoded path to chromium.launch`);
  }
});

test('portability: Playwright is a devDependency with a lockfile', () => {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  assert.ok(pkg.devDependencies?.playwright, 'playwright is not in devDependencies');
  assert.ok(existsSync(join(root, 'package-lock.json')), 'package-lock.json is missing');
  const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'));
  assert.ok(lock.packages?.['node_modules/playwright'], 'package-lock.json does not pin playwright');
});
