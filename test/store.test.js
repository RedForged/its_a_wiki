'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { jsonStore } = require('../lib/store/json');
const { openDb } = require('../lib/store/db');
const { hashPassword, verifyPassword, createSession, userFromRequest, destroySession } = require('../lib/auth');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'iaw-store-'));
}

test('jsonStore write/read/remove/list', () => {
  const store = jsonStore(tmpDir());
  store.write('docs', 'a', { id: 'a', v: 1 });
  store.write('docs', 'b', { id: 'b', v: 2 });
  assert.deepStrictEqual(store.read('docs', 'a'), { id: 'a', v: 1 });
  assert.strictEqual(store.read('docs', 'zz'), null);
  assert.strictEqual(store.list('docs').length, 2);
  store.remove('docs', 'a');
  assert.strictEqual(store.read('docs', 'a'), null);
});

test('mutate does merge + touch updated_at', () => {
  const store = jsonStore(tmpDir());
  const out = store.mutate('docs', 'x', (d) => ({ ...d, count: (d.count || 0) + 1 }), { seed: true });
  assert.strictEqual(out.count, 1);
  assert.ok(out.updated_at);
  const out2 = store.mutate('docs', 'x', (d) => ({ ...d, count: d.count + 1 }));
  assert.strictEqual(out2.count, 2);
  assert.strictEqual(out2.seed, true);
});

test('db derived helpers', () => {
  const db = openDb(tmpDir());
  db.put('users', 'u1', { id: 'u1', username: 'Alice', email: 'a@x.com' });
  db.put('users', 'u2', { id: 'u2', username: 'alice', email: 'A@X.com' });
  const byU = db.userByUsername('ALICE'); // lookup is case-insensitive
  assert.ok(byU.id === 'u1' || byU.id === 'u2', 'case-insensitive username lookup');
  assert.strictEqual(db.userByEmail('a@x.com').id, 'u1');

  db.put('wikis', 'w1', { id: 'w1', key: 'demo', name: 'Demo' });
  // exact key match at the db layer (routes lowercase first)
  assert.strictEqual(db.wikiByKey('demo').id, 'w1');
  assert.strictEqual(db.wikiByKey('DEMO'), null);

  db.put('pages', 'p1', { id: 'p1', wiki_id: 'w1', title: 'Home', categories: ['Foo'] });
  db.put('pages', 'p2', { id: 'p2', wiki_id: 'w1', title: 'Other', categories: ['Foo', 'Bar'] });
  assert.strictEqual(db.pageByTitle('w1', 'Home').id, 'p1');
  assert.strictEqual(db.pageByTitle('w1', 'home'), null, 'raw helper is exact-match; app.getPage normalizes');
  assert.strictEqual(db.pagesByCategory('w1', 'Bar').length, 1);
});

test('password hash/verify round trip', () => {
  const h = hashPassword('s3cret');
  assert.ok(verifyPassword('s3cret', h));
  assert.ok(!verifyPassword('wrong', h));
  assert.ok(!verifyPassword('s3cret', 'garbage'));
});

test('session create / lookup / destroy', () => {
  const db = openDb(tmpDir());
  db.put('users', 'u1', { id: 'u1', username: 'Alice' });
  const req = { cookies: {}, ip: '1.2.3.4' };
  const token = createSession(db, db.get('users', 'u1'), req);
  req.cookies = { session: token };
  assert.strictEqual(userFromRequest(db, req).id, 'u1');
  destroySession(db, token);
  assert.strictEqual(userFromRequest(db, req), null);
});