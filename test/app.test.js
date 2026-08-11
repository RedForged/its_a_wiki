'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { openDb } = require('../lib/store/db');
const { createApp, validWikiKey } = require('../lib/app');

function setup(settings = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'iaw-app-'));
  const db = openDb(dir);
  const app = createApp(db, { dataDir: dir, eventCap: 1000 });
  db.put('users', 'u1', { id: 'u1', username: 'Alice', pass: 'x' });
  db.put('users', 'u2', { id: 'u2', username: 'Bob', pass: 'x' });
  return { db, app, dir };
}

test('createWiki validates keys and uniqueness', () => {
  const { db, app } = setup();
  assert.strictEqual(validWikiKey('my-wiki-2'), true);
  assert.strictEqual(validWikiKey('a'), false);
  assert.strictEqual(validWikiKey('admin'), false); // reserved
  assert.strictEqual(validWikiKey('UPPER'), true); // normalized to lowercase
  assert.strictEqual(validWikiKey('bad key!'), false);
  const w = app.createWiki(db.get('users', 'u1'), { key: 'demo', name: 'Demo' });
  assert.strictEqual(w.key, 'demo');
  assert.throws(() => app.createWiki(db.get('users', 'u1'), { key: 'demo' }), /taken/);
});

test('permissions: owner is admin+editor, editors can edit, bans block', () => {
  const { db, app } = setup();
  const owner = db.get('users', 'u1');
  const bob = db.get('users', 'u2');
  const w = app.createWiki(owner, { key: 'demo' });
  assert.strictEqual(app.isAdmin(w, owner), true);
  assert.strictEqual(app.canEdit(w, owner), true);
  assert.strictEqual(app.canEdit(w, bob), false);
  w.editors = [bob.id];
  db.put('wikis', w.id, w);
  assert.strictEqual(app.canEdit(db.get('wikis', w.id), bob), true);
  app.isBanned; // reference
  const w2 = db.get('wikis', w.id);
  w2.banned = [bob.id];
  db.put('wikis', w2.id, w2);
  assert.strictEqual(app.isBanned(db.get('wikis', w2.id), bob), true);
});

test('savePage creates revisions + category metadata + increments stats', () => {
  const { db, app } = setup();
  const owner = db.get('users', 'u1');
  const w = app.createWiki(owner, { key: 'demo' });
  const page = {
    id: 'p1', wiki_id: w.id, title: 'Home', content: 'Text [[Category:Foo]]',
    summary: '', created_at: null, last_editor_id: null, last_username: null, css: '',
  };
  const { rev, isNew } = app.savePage(w, page, owner, { summary: 'first' });
  assert.strictEqual(isNew, true);
  assert.strictEqual(rev.rev, 1);
  assert.deepStrictEqual(page.categories, ['Foo']);
  const { rev: rev2 } = app.savePage(db.get('wikis', w.id), page, owner, { summary: 'edit' });
  assert.strictEqual(rev2.rev, 2);
  assert.strictEqual(db.revisionsForPage('p1').length, 2);
  const w2 = db.get('wikis', w.id);
  assert.strictEqual(w2.stats.pages, 1);
  assert.strictEqual(w2.stats.edits, 2);
});

test('getPage normalizes underscores/case', () => {
  const { db, app } = setup();
  const owner = db.get('users', 'u1');
  const w = app.createWiki(owner, { key: 'demo' });
  const page = { id: 'p1', wiki_id: w.id, title: 'Some Page', content: 'x' };
  db.put('pages', page.id, page);
  assert.strictEqual(app.getPage(w, 'some_page').id, 'p1');
  assert.strictEqual(app.getPage(w, 'SOME PAGE').id, 'p1');
});

test('deletePage marks deleted and decrements stats', () => {
  const { db, app } = setup();
  const owner = db.get('users', 'u1');
  const w = app.createWiki(owner, { key: 'demo' });
  const page = { id: 'p1', wiki_id: w.id, title: 'Home', content: 'x' };
  app.savePage(w, page, owner);
  app.deletePage(db.get('wikis', w.id), page, owner);
  assert.ok(page.deleted_at);
  assert.strictEqual(db.get('wikis', w.id).stats.pages, 0);
});

test('media save with name sanitization + replace', () => {
  const { db, app, dir } = setup();
  const owner = db.get('users', 'u1');
  const w = app.createWiki(owner, { key: 'demo' });
  const m = app.saveMedia(w, {
    filename: 'My Picture!.PNG', bytes: Buffer.from('img'), type: 'image/png', user: owner,
  });
  assert.strictEqual(m.name, 'my-picture-.png');
  assert.ok(fs.existsSync(path.join(dir, 'wikis', w.id, 'media', m.name)));
  const m2 = app.saveMedia(w, { filename: 'my-picture-.png', bytes: Buffer.from('img2'), type: 'image/png', user: owner });
  assert.strictEqual(m2.id, m.id);
  assert.strictEqual(m2.rev, 2);
  assert.strictEqual(db.get('wikis', w.id).stats.media, 1);
});

test('watchlist toggle', () => {
  const { db, app } = setup();
  assert.strictEqual(app.isWatching('u1', 'p1'), false);
  assert.strictEqual(app.toggleWatch('u1', 'w1', 'p1'), true);
  assert.strictEqual(app.isWatching('u1', 'p1'), true);
  assert.strictEqual(app.toggleWatch('u1', 'w1', 'p1'), false);
});

test('missingPageTitles finds dashed links', () => {
  const { db, app } = setup();
  const owner = db.get('users', 'u1');
  const w = app.createWiki(owner, { key: 'demo' });
  db.put('pages', 'p1', { id: 'p1', wiki_id: w.id, title: 'Existing', content: '[[Existing]] and [[Wanted]]' });
  const missing = app.missingPageTitles(w);
  assert.ok(missing.includes('Wanted'));
  assert.ok(!missing.includes('Existing'));
});