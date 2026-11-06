// CONVERGE output-escaping regression tests.
//
// The app renders with innerHTML + template literals, so every
// user-controlled value must pass through esc() (app/app.js). The live
// XSS probe planned for the 2026-11-06 hardening pass was blocked by a
// platform safety filter and was NOT run, so this test is the executable
// backstop: it extracts the SHIPPED esc function from app/app.js (not a
// copy) and asserts it neutralises the standard payload shapes. The
// static review behind it (2026-11-06) verified every user-controlled
// interpolation in app.js goes through esc(), and that there is no
// href=/src= surface at all. Live-probe coverage remains an open
// limitation — see QA-REPORT.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'app', 'app.js'), 'utf8');

function loadEsc() {
  const m = src.match(/const esc = \(s\) => String\(s \?\? ''\)\.replace\(\/\[\&<>\"'\]\/g, \(c\) => \(\{[^\}]*\}\[c\]\)\);/);
  assert.ok(m, 'esc() definition not found in app/app.js — the extractor needs updating');
  return new Function(`${m[0]}; return esc;`)();
}
const esc = loadEsc();

test('esc() escapes the five HTML-significant characters', () => {
  assert.equal(esc('<'), '&lt;');
  assert.equal(esc('>'), '&gt;');
  assert.equal(esc('&'), '&amp;');
  assert.equal(esc('"'), '&quot;');
  assert.equal(esc("'"), '&#39;');
  assert.equal(esc('plain text 123'), 'plain text 123');
  assert.equal(esc(''), '');
  assert.equal(esc(null), '');
  assert.equal(esc(undefined), '');
  assert.equal(esc(42), '42');
});

test('esc() neutralises tag-injection payloads (no raw < > " survive)', () => {
  const payloads = [
    '<img src=x onerror="window.__xss=1">',
    '<svg onload="window.__xss=1">',
    '<script>window.__xss=1</script>',
    '<details open ontoggle="window.__xss=1">x</details>',
    '<a href="javascript:window.__xss=1">click</a>',
    '<math><mi//xlink:href="data:x,<script>window.__xss=1</script>">',
  ];
  for (const p of payloads) {
    const out = esc(p);
    assert.ok(!out.includes('<'), `raw < survived in: ${p}`);
    assert.ok(!out.includes('>'), `raw > survived in: ${p}`);
    assert.ok(!out.includes('"'), `raw " survived in: ${p}`);
    assert.ok(out.includes('&lt;'), `expected escaped tag in: ${p}`);
  }
});

test('esc() neutralises attribute-breakout payloads', () => {
  const out = esc('x" onmouseover="window.__xss=1');
  assert.ok(!out.includes('"'), 'raw double-quote survived');
  assert.ok(out.includes('&quot;'), 'quote was not escaped');
  assert.equal(esc("x' onfocus='window.__xss=1").includes("'"), false);
});

test('esc() is actually the function the render paths call', () => {
  // Every user-controlled value flowing into innerHTML must call esc().
  // A field used only as a boolean (regex test, comparison, ternary
  // condition) is not rendered, and textContent / document.title are
  // safe sinks (no HTML parsing), so those are excluded. Anything else
  // that outputs the field must go through esc().
  const userFields = ['msg.text', 'msg.author', 'c.title', 'cl.text', 'cl.challenge.text'];
  const interp = /\$\{([^{}]*)\}/g;
  const safeSinks = ['.textContent', 'document.title'];
  const htmlSinks = ['.innerHTML', 'insertAdjacentHTML', '.outerHTML'];
  for (const f of userFields) {
    const fe = f.replace('.', '\\.');
    for (const hit of src.matchAll(interp)) {
      const expr = hit[1];
      if (!new RegExp(`\\b${fe}\\b`).test(expr)) continue;
      const boolOnly = expr
        .replace(new RegExp(`[\\w$./]+\\.test\\(\\s*${fe}\\s*\\)`, 'g'), '')
        .replace(new RegExp(`${fe}\\s*(===|!==|==|!=|>=|<=|>|<)`, 'g'), '')
        .replace(new RegExp(`!\\s*${fe}\\b`, 'g'), '')
        .replace(new RegExp(`${fe}\\s*\\?`, 'g'), '');
      if (!new RegExp(`\\b${fe}\\b`).test(boolOnly)) continue; // boolean use only
      // Nearest sink before this interpolation decides the context.
      const before = src.slice(0, hit.index);
      let nearest = '', at = -1;
      for (const s of [...safeSinks, ...htmlSinks]) {
        const i = before.lastIndexOf(s);
        if (i > at) { at = i; nearest = s; }
      }
      if (safeSinks.includes(nearest)) continue; // textContent / title: safe
      assert.ok(expr.includes('esc('), `unescaped interpolation of ${f} into HTML: \${${expr}}`);
    }
  }
});
