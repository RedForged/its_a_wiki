'use strict';

const fs = require('fs');
const path = require('path');
const { makeRenderer } = require('./wikitext');
const { now, ts, uid, safeFilename, stripNs, clamp, humanSize } = require('./util');

/**
 * Application layer: wiki/page/media models, permission checks, rendering
 * pipeline (wikitext → HTML + CSS), and event recording.
 */

const NAMESPACES = ['page', 'file', 'category', 'template', 'special'];

function normalizeTitle(t) {
  return String(t || '').replace(/_/g, ' ')
    .trim().replace(/\s+/g, ' ')
    .replace(/^:+/, '');
}

/** Validate a wiki key for creation: [a-z0-9-], 2..40 chars, not reserved. */
const RESERVED_KEYS = new Set(['api', 'admin', 'login', 'signup', 'logout', 'search',
  'explore', 'settings', 'users', 'user', 'w', 'static', 'favicon.ico', 'robots.txt', 'about']);

function validWikiKey(key) {
  const k = String(key || '').toLowerCase();
  if (!/^[a-z0-9-]{2,40}$/.test(k)) return false;
  if (RESERVED_KEYS.has(k)) return false;
  return true;
}

function createApp(db, options = {}) {
  const dataDir = options.dataDir;
  const eventCap = options.eventCap || 20000;

  function ctxFor(wiki, extra = {}) {
    return { wikiId: wiki.id, wikiKey: wiki.key, wikiName: wiki.name, ...extra };
  }

  // ---- wikis ----
  function getWiki(key) {
    return db.wikiByKey(String(key).toLowerCase());
  }

  function createWiki(owner, { key, name, description, theme, visibility }) {
    const k = String(key || '').toLowerCase();
    if (!validWikiKey(k)) {
      throw Object.assign(new Error('Wiki key must be 2–40 chars, letters/digits/hyphens only'), { code: 'VALIDATION' });
    }
    if (db.wikiByKey(k)) throw Object.assign(new Error('That wiki key is already taken'), { code: 'TAKEN' });
    const wiki = {
      id: uid('w_'),
      key: k,
      name: String(name || '').trim().slice(0, 120) || k,
      description: String(description || '').trim().slice(0, 400),
      owner_id: owner.id,
      admins: [owner.id],
      editors: [],
      banned: [],
      visibility: 'public',
      theme: String(theme || 'dark').slice(0, 20),
      default_css: '',
      created_at: ts(),
      deleted_at: null,
      stats: { pages: 0, edits: 0, media: 0 },
    };
    db.put('wikis', wiki.id, wiki);
    logEvent(owner, wiki.id, 'wiki_created', { key: k, name: wiki.name });
    return wiki;
  }

  function isAdmin(wiki, user) {
    if (!user) return false;
    if (wiki.owner_id === user.id) return true;
    return (wiki.admins || []).includes(user.id);
  }

  function canEdit(wiki, user) {
    if (!user) return false;
    if (isAdmin(wiki, user)) return true;
    return (wiki.editors || []).includes(user.id);
  }

  function isBanned(wiki, user) {
    return !!user && (wiki.banned || []).includes(user.id);
  }

  // ---- pages ----
  function getPage(wiki, title) {
    const t = normalizeTitle(title);
    if (!t) return null;
    let p = db.pageByTitle(wiki.id, t);
    if (p) return p;
    const lower = t.toLowerCase();
    const all = db.pagesForWiki(wiki.id);
    for (const x of all) if (x.title.toLowerCase() === lower) return x;
    for (const x of all) if (normalizeTitle(x.title).toLowerCase() === lower) return x;
    return null;
  }

  function renderPage(p, wiki, opts = {}) {
    const toc = opts.toc !== false;
    const ctx = ctxFor(wiki, { pageTitle: p.title });
    const renderer = makeRenderer({
      db,
      toc,
      templateSource: (title) => {
        const t = normalizeTitle(title);
        const found = getPage(wiki, t);
        return found && found.deleted_at == null ? found : null;
      },
    });
    return renderer.render(p.content, ctx);
  }

  /** Extract categories + detect redirect target from rendered output + content. */
  function pageMetadata(wiki, page) {
    const rendered = renderPage(page, wiki, { toc: false });
    const redirect = /^#redirect\b:?\s*\[?\[?([^\][|\n]+)/im.exec(page.content || '');
    return {
      categories: rendered.categories || [],
      redirectTarget: redirect ? normalizeTitle(redirect[1]) : null,
    };
  }

  function savePage(wiki, page, user, { summary = '' } = {}) {
    const existing = db.get('pages', page.id);
    const isNew = !existing;
    page.updated_at = ts();
    page.last_editor_id = user.id;
    page.summary = String(summary || '').slice(0, 300);
    if (isNew) page.created_at = page.created_at || ts();
    const meta = pageMetadata(wiki, page);
    page.categories = meta.categories;
    page.redirect = meta.redirectTarget;
    db.put('pages', page.id, page);
    const lastRev = db.revisionsForPage(page.id)[0];
    const rev = {
      id: uid('r_'),
      page_id: page.id,
      rev: (lastRev ? lastRev.rev : 0) + 1,
      wiki_id: wiki.id,
      user_id: user.id,
      username: user.username,
      summary,
      content: page.content,
      title: page.title,
      css: page.css || '',
      created_at: ts(),
    };
    db.put('revisions', rev.id, rev);
    wiki.stats = wiki.stats || { pages: 0, edits: 0, media: 0 };
    if (isNew) wiki.stats.pages = (wiki.stats.pages || 0) + 1;
    wiki.stats.edits = (wiki.stats.edits || 0) + 1;
    db.put('wikis', wiki.id, wiki);
    logEvent(user, wiki.id, isNew ? 'page_created' : 'page_edited', {
      page_id: page.id, title: page.title, rev: rev.rev,
    });
    return { page, rev, isNew };
  }

  function deletePage(wiki, page, user) {
    page.deleted_at = ts();
    page.deleted_by = user.id;
    db.put('pages', page.id, page);
    wiki.stats.pages = Math.max(0, (wiki.stats.pages || 0) - 1);
    db.put('wikis', wiki.id, wiki);
    logEvent(user, wiki.id, 'page_deleted', { page_id: page.id, title: page.title });
  }

  function renamePage(dbPage, newTitle) {
    const t = normalizeTitle(newTitle);
    if (db.pageByTitle(dbPage.wiki_id, t) && dbPage.title !== t) {
      throw Object.assign(new Error(`A page named "${t}" already exists`), { code: 'TAKEN' });
    }
    dbPage.title = t;
    dbPage.updated_at = ts();
    db.put('pages', dbPage.id, dbPage);
    return dbPage;
  }

  // ---- media ----
  function mediaDirFor(wikiId) {
    return path.join(dataDir, 'wikis', wikiId, 'media');
  }
  function mediaPath(wiki, name) {
    return path.join(mediaDirFor(wiki.id), String(name).toLowerCase());
  }

  function normalizeFilename(fn) {
    return safeFilename(String(fn || '').replace(/^.*[\\/]/, ''), 160);
  }

  function saveMedia(wiki, { filename, bytes, type, user }) {
    const name = normalizeFilename(filename);
    if (!name) throw Object.assign(new Error('Invalid filename'), { code: 'VALIDATION' });
    if (bytes.length > 10 * 1024 * 1024) {
      throw Object.assign(new Error('File too large (max 10 MB)'), { code: 'VALIDATION' });
    }
    const existing = db.mediaByName(wiki.id, name);
    const id = existing ? existing.id : uid('m_');
    const media = existing || {
      id, wiki_id: wiki.id, name,
      uploader_id: user.id, uploader: user.username,
      created_at: ts(),
      size: bytes.length, type, rev: 0,
    };
    media.rev++;
    media.size = bytes.length;
    media.type = type;
    media.updated_at = ts();
    db.put('media', id, media);
    const dir = mediaPath(wiki, name);
    fs.mkdirSync(path.dirname(dir), { recursive: true });
    const tmp = dir + '.tmp' + process.pid;
    fs.writeFileSync(tmp, bytes);
    fs.renameSync(tmp, dir);
    wiki.stats.media = (wiki.stats.media || 0) + (existing ? 0 : 1);
    db.put('wikis', wiki.id, wiki);
    logEvent(user, wiki.id, existing ? 'media_replaced' : 'media_uploaded', { name });
    return media;
  }

  // ---- events ----
  function logEvent(user, wikiId, type, data) {
    const cap = eventCap;
    if (cap > 0 && db.all('events').length > cap) {
      const olds = db.allSorted('events', 'at', 'asc').slice(0, Math.min(200, Math.floor(cap / 100)));
      for (const o of olds) db.del('events', o.id);
    }
    const ev = {
      id: uid('e_'),
      wiki_id: wikiId,
      user_id: user ? user.id : null,
      username: user ? user.username : 'system',
      type,
      data: data || {},
      at: ts(),
    };
    db.put('events', ev.id, ev);
    return ev;
  }

  // ---- watchlists ----
  function toggleWatch(userId, wikiId, pageId) {
    const wl = db.watchlistFor(userId);
    if (wl.wiki_id && wl.wiki_id !== wikiId) wl.pages = [];
    wl.wiki_id = wikiId;
    const idx = (wl.pages || []).indexOf(pageId);
    if (idx >= 0) wl.pages.splice(idx, 1);
    else wl.pages.push(pageId);
    db.put('watchlists', userId, wl);
    return wl.pages.includes(pageId);
  }

  function isWatching(userId, pageId) {
    if (!userId) return false;
    return (db.watchlistFor(userId).pages || []).includes(pageId);
  }

  /** Enrich page objects for lists (missing-link detection friendly). */
  function pageCards(pages) {
    return (pages || []).map((p) => ({
      id: p.id,
      title: p.title,
      summary: p.summary || '',
      updated_at: p.updated_at,
      last_editor: (db.get('users', p.last_editor_id) || {}).username || 'unknown',
    }));
  }

  function missingPageTitles(wiki) {
    const existing = new Set(db.pagesForWiki(wiki.id).map((p) => p.title.toLowerCase()));
    const missing = new Set();
    for (const p of db.pagesForWiki(wiki.id)) {
      const re = /\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g;
      let m;
      while ((m = re.exec(p.content))) {
        const t = m[1].trim().replace(/^:/, '');
        if (!t) continue;
        const { ns, rest } = stripNs(t);
        if (['file', 'category', 'template', 'special'].includes(ns.toLowerCase())) continue;
        if (!existing.has(rest.toLowerCase()) && !existing.has(t.toLowerCase())) missing.add(t);
      }
    }
    return [...missing].slice(0, 200);
  }

  return {
    ctxFor, getWiki, createWiki, isAdmin, canEdit, isBanned,
    getPage, renderPage, savePage, deletePage, renamePage,
    saveMedia, mediaDirFor, mediaPath, normalizeFilename,
    logEvent, toggleWatch, isWatching, pageCards, missingPageTitles,
    normalizeTitle, validWikiKey,
  };
}

module.exports = { createApp, normalizeTitle, validWikiKey, RESERVED_KEYS };