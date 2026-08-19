'use strict';

const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

/**
 * End-to-end: boot the real server on an ephemeral port + temp data dir,
 * then walk the core journey with real HTTP requests + cookie jar.
 *
 * ⚠️ Order-dependent: tests share one server (booted in `before`) and one
 * cookie jar, so they must run sequentially in this file. Do not parallelize.
 */

const ROOT = path.join(__dirname, '..');
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'iaw-e2e-'));
const PORT = 3900 + Math.floor(Math.random() * 1000);

let server;
let cookie = '';

function req(method, urlPath, { form, cookies, follow } = {}) {
  return new Promise((resolve, reject) => {
    const headers = {};
    if (form) headers['content-type'] = 'application/x-www-form-urlencoded';
    if (cookies || cookie) headers.cookie = cookies || cookie;
    let body;
    if (form) body = new URLSearchParams(form).toString();
    const r = http.request({
      port: PORT, method, path: urlPath, headers: {
        ...headers,
        ...(body ? { 'content-length': Buffer.byteLength(body) } : {}),
      },
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        const setCookie = res.headers['set-cookie'];
        if (setCookie) {
          const m = /session=([^;]+)/.exec(setCookie.join(';'));
          if (m) cookie = 'session=' + m[1];
        }
        const out = { status: res.statusCode, headers: res.headers, body: data };
        if (follow && [301, 302, 303].includes(res.statusCode) && res.headers.location) {
          return req('GET', res.headers.location, { cookies }).then(resolve).catch(reject);
        }
        resolve(out);
      });
    });
    r.on('error', reject);
    if (body) r.write(body);
    r.end();
  });
}

test.before(async () => {
  await new Promise((resolve, reject) => {
    server = spawn(process.execPath, [path.join(ROOT, 'server.js')], {
      env: { ...process.env, PORT: String(PORT), DATA_DIR: DATA, ADMIN_USER: 'admin', ADMIN_PASS: 'testpass123' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let log = '';
    server.stderr.on('data', (d) => { log += d; });
    const deadline = Date.now() + 8000;
    const ping = () => {
      if (Date.now() > deadline) return reject(new Error('server did not start: ' + log));
      req('GET', '/').then(() => resolve()).catch(() => setTimeout(ping, 200));
    };
    ping();
  });
});

test.after(() => {
  if (server) server.kill('SIGTERM');
});

test('full journey: signup → create wiki → page → css → history → admin', async () => {
  // signup
  let r = await req('POST', '/signup', {
    form: { username: 'alice', password: 'correct-horse-battery', email: 'alice@example.com' },
  });
  assert.strictEqual(r.status, 302, 'signup redirects');

  // create wiki → redirects to editor
  r = await req('POST', '/create', { form: { key: 'testwiki', name: 'Test Wiki', description: 'demo', theme: 'dark' } });
  assert.strictEqual(r.status, 302);
  assert.ok(r.headers.location.includes('/w/testwiki/e/Home'));

  // preview a NEW page (the reported bug: Cannot POST /w/testwiki/e/)
  r = await req('POST', '/w/testwiki/e/Hello', {
    form: { title: 'Hello', css_mode: '0', content: "Hello '''world'''", summary: 'draft', action: 'preview' },
  });
  assert.strictEqual(r.status, 200);
  assert.ok(r.body.includes('Preview'), 'preview block rendered');

  // save it
  r = await req('POST', '/w/testwiki/e/Hello', {
    form: { title: 'Hello', css_mode: '0', content: "Hello '''world'''", summary: 'first', action: 'save' },
  });
  assert.strictEqual(r.status, 302);
  assert.ok(r.headers.location.includes('/p/Hello'));

  // view it
  r = await req('GET', '/w/testwiki/p/Hello');
  assert.strictEqual(r.status, 200);
  assert.ok(r.body.includes('<h1 class="iaw-article-title">Hello</h1>'));
  assert.ok(r.body.includes('<b>world</b>'));

  // missing page → 404 with real title
  r = await req('GET', '/w/testwiki/p/Ghost');
  assert.strictEqual(r.status, 404);
  assert.ok(r.body.includes('Create “Ghost”'));

  // page CSS
  r = await req('POST', '/w/testwiki/e/Styled', {
    form: { title: 'Styled', css_mode: '1', css: '.iaw-article-title { color: #e02030; }', summary: 'css', action: 'save' },
  });
  assert.strictEqual(r.status, 302);
  r = await req('GET', '/w/testwiki/p/Styled');
  assert.ok(r.body.includes('iaw-page-css'));

  // history exists
  r = await req('GET', '/w/testwiki/history/Hello');
  assert.strictEqual(r.status, 200);
  assert.ok(r.body.includes('History: Hello'));

  // wiki admin console reachable for owner
  r = await req('GET', '/w/testwiki/admin');
  assert.strictEqual(r.status, 200);
  assert.ok(r.body.includes('Admin · Test Wiki'));

  // CSS sanitizer rejects a breakout attempt via the API (alice owns testwiki)
  r = await req('POST', '/w/testwiki/e/Xss', {
    form: { title: 'Xss', css_mode: '1', css: 'a{color:red}</style><script>alert(1)</script>', action: 'save' },
  });
  assert.strictEqual(r.status, 302, 'saved (sanitized)');
  r = await req('GET', '/w/testwiki/p/Xss');
  assert.ok(r.body.includes('iaw-page-css'), 'page css injected');
  assert.ok(!r.body.includes('<script>alert(1)</script>'), 'script breakout removed');

  // instance admin (seeded) works
  cookie = '';
  r = await req('POST', '/login', { form: { username: 'admin', password: 'testpass123' } });
  assert.strictEqual(r.status, 302);
  r = await req('GET', '/admin');
  assert.strictEqual(r.status, 200);
  assert.ok(r.body.includes('Instance admin'));
});

test('private wiki blocks anonymous viewers', async () => {
  // alice owns testwiki — she flips it private via the wiki admin console
  cookie = '';
  await req('POST', '/login', { form: { username: 'alice', password: 'correct-horse-battery' } });
  const adminRes = await req('POST', '/w/testwiki/admin', {
    form: { save_settings: '1', name: 'Test Wiki', description: 'demo', theme: 'dark', private: 'on' },
  });
  assert.strictEqual(adminRes.status, 200);
  assert.ok(adminRes.body.includes('Wiki settings saved'));
  // anonymous viewer is now bounced to login
  cookie = '';
  const r = await req('GET', '/w/testwiki/p/Hello');
  assert.strictEqual(r.status, 302, 'anonymous redirected to login');
  assert.ok(r.headers.location.includes('/login'));
});

test('docs wiki auto-generated and editable by instance admin', async () => {
  cookie = '';
  await req('POST', '/login', { form: { username: 'admin', password: 'testpass123' } });

  // docs wiki exists and renders
  const home = await req('GET', '/w/docs/p/Home');
  assert.strictEqual(home.status, 200, 'docs wiki Home page loads');
  assert.ok(home.body.includes('Welcome to It&#39;s a Wiki'));
  assert.ok(home.body.includes('Getting started'));

  // instance admin can access the edit form of a docs page
  const edit = await req('GET', '/w/docs/e/Home');
  assert.strictEqual(edit.status, 200, 'instance admin can edit docs pages');

  // docs pages are saved
  assert.ok(home.body.includes('Categories'));
});

test('admin panel can regenerate docs wiki', async () => {
  cookie = '';
  await req('POST', '/login', { form: { username: 'admin', password: 'testpass123' } });

  // admin panel has the button
  let page = await req('GET', '/admin');
  assert.ok(page.body.includes('Regenerate docs'), 'regenerate button present');

  // click it
  const res = await req('POST', '/admin', { form: { regenerate_docs: '1' } });
  assert.strictEqual(res.status, 200);
  assert.ok(res.body.includes('Docs regenerated'), 'regeneration confirms');

  // docs pages still render after regeneration
  const home = await req('GET', '/w/docs/p/Home');
  assert.strictEqual(home.status, 200);
  assert.ok(home.body.includes('Welcome to It&#39;s a Wiki'));
});

test('regenerate restores a deleted docs wiki', async () => {
  cookie = '';
  await req('POST', '/login', { form: { username: 'admin', password: 'testpass123' } });

  // soft-delete the docs wiki from the wiki admin console
  let res = await req('POST', '/w/docs/admin', {
    form: { delete_wiki: '1', confirm_key: 'docs' },
  });
  assert.strictEqual(res.status, 302, 'docs wiki deletion redirects');

  // it is now 404
  let home = await req('GET', '/w/docs/p/Home');
  assert.strictEqual(home.status, 404, 'docs wiki gone after deletion');

  // regenerate restores it
  res = await req('POST', '/admin', { form: { regenerate_docs: '1' } });
  assert.strictEqual(res.status, 200);
  assert.ok(res.body.includes('Docs regenerated'), 'regeneration confirms');

  home = await req('GET', '/w/docs/p/Home');
  assert.strictEqual(home.status, 200, 'docs wiki restored');
  assert.ok(home.body.includes('Welcome to It&#39;s a Wiki'));
});

test('deleted wikis disappear from the admin wiki list', async () => {
  cookie = '';
  await req('POST', '/login', { form: { username: 'admin', password: 'testpass123' } });

  // admin panel lists testwiki
  let page = await req('GET', '/admin');
  assert.ok(page.body.includes('testwiki'), 'wiki listed before deletion');

  // find its wiki_id from the delete form
  const m = /name="wiki_id" value="([^"]+)"[^>]*>[\s\S]*?name="delete"/.exec(page.body);
  assert.ok(m, 'wiki delete form present');

  // delete it
  await req('POST', '/admin', { form: { wiki_id: m[1], delete: '1' } });

  // after deletion it is gone from the list
  page = await req('GET', '/admin');
  assert.ok(!page.body.includes('testwiki'), 'deleted wiki hidden from admin list');
});

test('user deletion is a hard delete', async () => {
  cookie = '';
  await req('POST', '/login', { form: { username: 'admin', password: 'testpass123' } });

  // alice exists
  let alice = await req('GET', '/user/alice');
  assert.strictEqual(alice.status, 200);

  // admin deletes alice from the instance admin panel — find her user_id first
  const adminPage = await req('GET', '/admin');
  const idMatch = /name="user_id" value="([^"]+)"/.exec(adminPage.body);
  assert.ok(idMatch, 'found user_id field in admin panel');
  const aliceId = idMatch[1];

  await req('POST', '/admin', { form: { user_id: aliceId, delete_user: '1' } });

  // alice is hard-deleted — profile returns 404
  alice = await req('GET', '/user/alice');
  assert.strictEqual(alice.status, 404, 'deleted user no longer found');
});