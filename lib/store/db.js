'use strict';

const { jsonStore } = require('./json');
const { ts } = require('../util');

/**
 * Document DB on top of the JSON store.
 * Collections: users, wikis, pages, revisions, media, sessions, events, watchlists, settings.
 * Indexes are derived on demand (datasets here are small; the JSON store
 * reads every doc of a collection and filters — fine up to tens of thousands).
 */

function openDb(baseDir) {
  const store = jsonStore(baseDir);
  const db = { _store: store };

  db.get = (c, id) => store.read(c, id);
  db.put = (c, id, doc) => store.write(c, id, doc);
  db.del = (c, id) => store.remove(c, id);
  db.all = (c) => store.list(c);
  db.mutate = (c, id, fn, def) => store.mutate(c, id, fn, def);

  db.allSorted = (c, by = 'created_at', dir = 'desc') => {
    const arr = db.all(c);
    arr.sort((a, b) => {
      const av = a[by] ?? '', bv = b[by] ?? '';
      const r = av < bv ? -1 : av > bv ? 1 : 0;
      return dir === 'asc' ? r : -r;
    });
    return arr;
  };

  db.find = (c, pred) => db.all(c).filter(pred);
  db.findOne = (c, pred) => db.all(c).find(pred) || null;

  // ---- users ----
  db.userByUsername = (name) => db.findOne('users', (u) =>
    u.username.toLowerCase() === String(name).toLowerCase());
  db.userByEmail = (email) => db.findOne('users', (u) =>
    u.email && u.email.toLowerCase() === String(email).toLowerCase());

  // ---- wikis ----
  db.wikiByKey = (key) => db.findOne('wikis', (w) => w.key === key);
  db.wikisForUser = (userId) => db.find('wikis', (w) =>
    w.owner_id === userId || (w.admins || []).includes(userId));

  // ---- pages ----
  db.pageByTitle = (wikiId, title) => db.findOne('pages', (p) =>
    p.wiki_id === wikiId && p.title === title);
  db.pagesForWiki = (wikiId) => db.find('pages', (p) => p.wiki_id === wikiId);
  db.pagesByCategory = (wikiId, category) => db.find('pages', (p) =>
    p.wiki_id === wikiId && (p.categories || []).includes(category));

  // ---- revisions ----
  db.revisionsForPage = (pageId) => db.allSorted('revisions', 'rev', 'desc')
    .filter((r) => r.page_id === pageId);

  // ---- media ----
  db.mediaByName = (wikiId, name) => db.findOne('media', (m) =>
    m.wiki_id === wikiId && m.name.toLowerCase() === name.toLowerCase());

  // ---- events ----
  db.eventsForWiki = (wikiId, limit = 60) =>
    db.allSorted('events', 'at', 'desc').filter((e) => e.wiki_id === wikiId).slice(0, limit);
  db.eventsForUser = (userId, limit = 60) =>
    db.allSorted('events', 'at', 'desc').filter((e) => e.user_id === userId).slice(0, limit);

  // ---- sessions ----
  db.sessionByToken = (token) => db.get('sessions', token);
  db.sessionsForUser = (userId) => db.all('sessions').filter((s) => s.user_id === userId);

  // ---- watchlists ----
  db.watchlistFor = (userId) => db.get('watchlists', userId) || { id: userId, wiki_id: null, pages: [], created_at: ts() };

  return db;
}

module.exports = { openDb };