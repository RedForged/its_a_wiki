'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { makeRenderer, parseTitle, classifyLink } = require('../lib/wikitext');

test('headings + TOC appear only when headings exist', () => {
  const r = makeRenderer({});
  const withHeads = r.render('= One =\ntext\n== Two ==\nmore', { wikiKey: 'w', pageTitle: 'P' });
  assert.ok(withHeads.toc.includes('iaw-toc'));
  assert.ok(withHeads.toc.includes('>One<'));
  assert.ok(withHeads.html.includes('<h2 id="one">One</h2>'));

  const noHeads = r.render('just prose, no headings at all', { wikiKey: 'w', pageTitle: 'P' });
  assert.strictEqual(noHeads.toc, '');
});

test('tables render with thead/tbody and header cells', () => {
  const r = makeRenderer({});
  const out = r.render('{| class="wikitable"\n! Name !! Age\n|-\n| Alice || 30\n|-\n| Bob || 25\n|}', {});
  assert.ok(out.html.includes('<thead><tr><th>Name</th><th>Age</th></tr></thead>'));
  assert.ok(out.html.includes('<tr><td>Alice</td><td>30</td></tr>'));
  assert.ok(out.html.includes('<tr><td>Bob</td><td>25</td></tr>'));
});

test('links: page, labeled, file, special, external', () => {
  const r = makeRenderer({});
  const out = r.render(
    '[[Other Page]] [[Other Page|shown]] [[File:img.png|thumb|Cap]] [[Special:AllPages]] [https://x.example ext] https://plain.example',
    { wikiKey: 'demo', pageTitle: 'Home' });
  assert.ok(out.html.includes('href="/w/demo/p/Other%20Page">Other Page</a>'));
  assert.ok(out.html.includes('href="/w/demo/p/Other%20Page">shown</a>'));
  assert.ok(out.html.includes('src="/w/demo/f/img.png/raw"'));
  assert.ok(out.html.includes('href="/w/demo/Special%3AAllPages"'));
  assert.ok(out.html.includes('href="https://x.example" target="_blank" rel="noopener nofollow"'));
  assert.ok(out.html.includes('href="https://plain.example"'));
});

test('templates: args, defaults, transclusion, magic words, loop guard', () => {
  const templates = {
    'Template:Quote': '“{{{1}}}” — {{{2|anonymous}}}',
    'Template:Bold': "'''{{{1}}}'''",
  };
  const r = makeRenderer({ templateSource: (title) =>
    templates[title] ? { title, content: templates[title] } : null });
  const out = r.render(
    '{{Quote|Hello|World}}|{{Quote|Lonely}}|{{Bold|X}}|{{PAGENAME}}|{{CURRENTYEAR}}|{{NoSuchTemplate}}|{{Bold|{{Quote|a|b}}}}',
    { wikiKey: 'demo', pageTitle: 'MyPage' });
  assert.ok(out.html.includes('“Hello” — World'), 'args');
  assert.ok(out.html.includes('“Lonely” — anonymous'), 'default');
  assert.ok(out.html.includes('<b>X</b>'), 'bold template');
  assert.ok(out.html.includes('MyPage'), 'magic PAGENAME');
  assert.ok(out.html.includes(String(new Date().getFullYear())), 'magic CURRENTYEAR');
  assert.ok(out.html.includes('Template:NoSuchTemplate') && out.html.includes('iaw-missing'), 'red link');
});

test('categories collected; redirect rendered', () => {
  const r = makeRenderer({});
  const out = r.render('#REDIRECT [[Main Page]]\n\n[[Category:Foo]] [[Category:Bar]]', {
    wikiKey: 'demo', pageTitle: 'Old Page' });
  assert.ok(out.html.includes('class="iaw-redirect"'));
  assert.ok(out.html.includes('href="/w/demo/p/Main%20Page"'));
  assert.deepStrictEqual(out.categoryLinks, ['Foo', 'Bar']);
});

test('refs + references list', () => {
  const r = makeRenderer({});
  const out = r.render('A <ref>first source</ref> here<ref>second</ref>.\n<references/>', { wikiKey: 'd' });
  assert.ok(out.html.includes('iaw-refs-list'));
  assert.ok(out.html.includes('first source'));
  assert.ok(out.html.includes('second'));
});

test('nowiki, pre, code escape wikitext', () => {
  const r = makeRenderer({});
  const out = r.render('<nowiki>[[not a link]] <b>not bold</b></nowiki>\n<pre>raw & code</pre>', {});
  assert.ok(!out.html.includes('<a class="iaw-link"'));
  assert.ok(out.html.includes('[[not a link]]'));
  assert.ok(out.html.includes('<pre>raw &amp; code</pre>'));
});

test('nowiki protects templates and magic words from expansion', () => {
  const r = makeRenderer({});
  const out = r.render('<nowiki>{{PAGENAME}}</nowiki> and <nowiki>{{{1}}}</nowiki> and <nowiki>{{Template|arg}}</nowiki>', {
    wikiKey: 'demo', pageTitle: 'MyPage',
  });
  assert.ok(out.html.includes('{{PAGENAME}}'), 'magic word not expanded');
  assert.ok(out.html.includes('{{{1}}}'), 'template param not expanded');
  assert.ok(out.html.includes('{{Template|arg}}'), 'template call not expanded');
  assert.ok(!out.html.includes('MyPage'), 'PAGENAME value not substituted');
});

test('multiple nowiki tags on one line each escape independently', () => {
  const r = makeRenderer({});
  const out = r.render('<nowiki>aaa</nowiki> · <nowiki>bbb</nowiki>', {});
  assert.ok(out.html.includes('aaa'));
  assert.ok(out.html.includes('bbb'));
  assert.ok(!out.html.includes('</nowiki>'), 'no stray closing tag leaks');
  assert.ok(!out.html.includes('&lt;nowiki&gt;'), 'tags are consumed, not escaped');
});

test('nowiki single-line block form still works', () => {
  const r = makeRenderer({});
  const out = r.render('<nowiki>hello</nowiki>', {});
  assert.strictEqual(out.html.trim(), 'hello');
});

test('template-produced tags are sanitized (no event handlers, no javascript: urls, incl. encoded)', () => {
  const templates = {
    'Template:Img': '<img src="/pic.png" onerror="alert(1)">',
    'Template:Link': '<a href="javascript:alert(1)">click</a>',
    'Template:Div': '<div onclick="x()">inner</div>',
    'Template:Enc': '<img src="/p.png" on&#101;rror="a(1)"><a href="jav&#97;script:alert(1)">bad</a>',
    'Template:Hex': '<img src="/q.png" on&#x65;rror="a(1)"><a href="javascript&colon;alert(1)">worse</a>',
  };
  const r = makeRenderer({ templateSource: (title) =>
    templates[title] ? { title, content: templates[title] } : null });
  const out = r.render('{{Img}} {{Link}} {{Div}} {{Enc}} {{Hex}}', { wikiKey: 'demo', pageTitle: 'P' });
  const html = out.html;
  assert.ok(!/on\w+\s*=/.test(html.replace(/&[a-zA-Z0-9#]+;/g, '')), 'no event handler survives (decoded)');
  assert.ok(!/javascript\s*:/i.test(html.replace(/&[a-zA-Z0-9#]+;/g, '')), 'no javascript: url survives (decoded)');
  assert.ok(!html.includes('onerror=') && !html.includes('onclick='), 'literal handlers stripped');
  assert.ok(html.includes('<img src="/pic.png"'), 'img tag survives without handler');
  assert.ok(html.includes('>click</a>') && html.includes('>bad</a>'), 'anchor text survives');
});

test('raw html from editors is escaped, safe tags survive', () => {
  const r = makeRenderer({});
  const out = r.render('<script>alert(1)</script> <b>ok</b>', {});
  assert.ok(!out.html.includes('<script>'));
  assert.ok(out.html.includes('&lt;script&gt;'));
  assert.ok(out.html.includes('<b>ok</b>'));
});

test('lists, quotes, hr', () => {
  const r = makeRenderer({});
  const out = r.render('* a\n* b\n** nested\n\n# 1\n# 2\n\n> quote\n\n----', {});
  assert.ok(out.html.includes('<ul><li data-depth="1">a</li>'));
  assert.ok(out.html.includes('<ol>'));
  assert.ok(out.html.includes('<blockquote>quote</blockquote>'));
  assert.ok(out.html.includes('<hr>'));
});

test('parseTitle / classifyLink', () => {
  assert.strictEqual(parseTitle('File:pic.jpg').type, 'file');
  assert.strictEqual(parseTitle('Category:Food').type, 'category');
  assert.strictEqual(parseTitle('Template:Box').type, 'template');
  assert.strictEqual(parseTitle('Special:AllPages').type, 'special');
  assert.strictEqual(parseTitle('Plain Page').type, 'page');
  assert.strictEqual(classifyLink('[[x]]').kind, 'page');
});

test("bold+italic '''''text''''' produces <b><i>", () => {
  const r = makeRenderer({});
  const out = r.render("'''''bold italic'''''", {});
  assert.ok(out.html.includes("<b><i>bold italic</i></b>"));
  assert.ok(!out.html.includes("'''"));
});

test("bold and italic separately still work", () => {
  const r = makeRenderer({});
  const out = r.render("'''bold''' text ''italic''", {});
  assert.ok(out.html.includes("<b>bold</b>"));
  assert.ok(out.html.includes("<i>italic</i>"));
});

test("underline ++text++", () => {
  const r = makeRenderer({});
  const out = r.render("++underlined text++", {});
  assert.ok(out.html.includes("<u>underlined text</u>"));
});

test("strikethrough --text--", () => {
  const r = makeRenderer({});
  const out = r.render("--struck text--", {});
  assert.ok(out.html.includes("<s>struck text</s>"));
});

test("strikethrough does not match single --", () => {
  const r = makeRenderer({});
  const out = r.render("well--known", {});
  assert.ok(!out.html.includes("<s>"));
  assert.ok(out.html.includes("well--known"));
});

test("pipe trick [[Page name|]] uses last segment as label", () => {
  const r = makeRenderer({});
  const out = r.render("[[User:John/Smith|]]", { wikiKey: "demo" });
  assert.ok(out.html.includes(">Smith</a>"));
  assert.ok(out.html.includes("href=\"/w/demo/p/User%3AJohn%2FSmith\""));
});

test("pipe trick strips namespace when no slash", () => {
  const r = makeRenderer({});
  const out = r.render("[[User:Foo|]]", { wikiKey: "demo" });
  assert.ok(out.html.includes(">Foo</a>"));
  assert.ok(out.html.includes("href=\"/w/demo/p/User%3AFoo\""));
});

test("explicit label overrides pipe trick", () => {
  const r = makeRenderer({});
  const out = r.render("[[Page name|My Label]]", { wikiKey: "demo", pageTitle: "Other" });
  assert.ok(out.html.includes(">My Label</a>"));
});