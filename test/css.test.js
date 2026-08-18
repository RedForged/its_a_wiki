'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { sanitizeCss, sanitizeReport, buildPageStylesheet } = require('../lib/css');

test('sanitizeCss strips angle brackets (style-breakout XSS)', () => {
  const evil = `.a { color: red; }</style><script>alert(1)</script><style>`;
  const out = sanitizeCss(evil);
  assert.ok(!out.includes('<'), 'no < survives');
  assert.ok(!out.includes('>'), 'no > survives');
  assert.ok(!out.includes('<script>'), 'no script tag survives');
  assert.ok(!out.includes('</style>'), 'no style breakout survives');
});

test('sanitizeCss removes @import and url()', () => {
  const out = sanitizeCss('@import url("https://evil.example/x.css");\n.a { background: url(https://evil.example/p.png); }');
  assert.ok(!out.includes('@import'));
  assert.ok(!out.includes('url('));
});

test('sanitizeCss kills script-y values', () => {
  const out = sanitizeCss('.a { width: expression(alert(1)); color: javascript:alert(1); }');
  assert.ok(!out.toLowerCase().includes('expression('));
  assert.ok(!out.toLowerCase().includes('javascript:'));
});

test('sanitizeCss rejects unbalanced braces', () => {
  assert.throws(() => sanitizeCss('.a { color: red;'));
  assert.throws(() => sanitizeCss('.a } color: red;'));
  const ok = sanitizeCss('.a { color: red; } .b { margin: 0; }');
  assert.ok(ok.includes('color: red'));
});

test('comments stripped so they cannot smuggle braces', () => {
  // a comment containing a } would previously break balance detection
  const out = sanitizeCss('.a { color: red; } /* } */');
  assert.ok(out.includes('color: red'));
});

test('allowlisted at-rules survive, unknown dropped', () => {
  const out = sanitizeCss('@media (max-width: 600px) { .a { display: none; } }\n@something-weird { color: red; }');
  assert.ok(out.includes('@media'));
  assert.ok(!out.includes('@something-weird {'), 'unknown at-rule body dropped');
});

test('oversized stylesheet rejected', () => {
  assert.throws(() => sanitizeCss('x'.repeat(2 * 1024 * 1024)), /too large/);
});

test('sanitizeReport returns ok/error shape', () => {
  assert.deepStrictEqual(sanitizeReport('.a{}'), { ok: true, output: '.a{}' });
  const bad = sanitizeReport('.a{');
  assert.strictEqual(bad.ok, false);
  assert.ok(bad.error);
});

test('buildPageStylesheet merges wiki + page css', () => {
  const out = buildPageStylesheet('body{}', '.a{color:red}');
  assert.ok(out.includes('body{}'));
  assert.ok(out.includes('.a{color:red}'));
  assert.ok(out.includes("this page's custom CSS"));
});

test('WIKI_SKIN_CSS defines themes and adaptive variables', () => {
  const { WIKI_SKIN_CSS } = require('../lib/skin');
  assert.ok(WIKI_SKIN_CSS.includes('--iaw-hero-bg'));
  assert.ok(WIKI_SKIN_CSS.includes('body.theme-dark'));
  assert.ok(WIKI_SKIN_CSS.includes('body.theme-forest'));
  assert.ok(!WIKI_SKIN_CSS.includes('body.theme-ocean'));
  assert.ok(!WIKI_SKIN_CSS.includes('body.theme-sunset'));
  assert.ok(WIKI_SKIN_CSS.includes('.iaw-hub-hero'));
});