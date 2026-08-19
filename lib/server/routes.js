'use strict';

const path = require('path');
const fs = require('fs');
const express = require('express');

const { openDb } = require('../store/db');
const {
  hashPassword, verifyPassword, createSession, destroySession,
  destroyAllSessions, userFromRequest,
} = require('../auth');
const { createApp, normalizeTitle, validWikiKey } = require('../app');
const { sanitizeCss } = require('../css');
const { parseMultipart } = require('../multipart');
const { escapeHtml, ts, now, uid, safeFilename, humanSize, stripNs } = require('../util');

const base = require('../views/base');
const inst = require('../views/instance');
const wikiViews = require('../views/wiki');

function makeServer(options) {
  const { db, app, dataDir } = options;
  // settings may be an object or a factory function — resolve to a live object
  const settingsFn = typeof options.settings === 'function' ? options.settings : null;
  let settings = settingsFn ? settingsFn() : (options.settings || {});
  const router = express.Router();
  const flashDuration = 4 * 60 * 1000;

  // ---------- helpers ----------

  function getUser(req, res) {
    return userFromRequest(db, req);
  }

  function flash(req, res, msg) {
    const key = 'flash';
    const existing = req.sessionFlash || {};
    existing[key] = msg;
    req.sessionFlash = existing;
    const cookies = res.getHeader('Set-Cookie') || [];
    const val = encodeURIComponent(msg);
    // store flash in a signed-ish cookie readable on the next request
    res.setHeader('Set-Cookie', [...(Array.isArray(cookies) ? cookies : []), `iaw_flash=${val}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(flashDuration / 1000)}`]);
  }

  function getFlash(req, res) {
    const v = req.cookies && req.cookies.iaw_flash;
    if (v) {
      // one-shot: consume on read so it cannot linger on every page load.
      // (server.js cookie parser already decodeURIComponent's the value.)
      clearFlash(res);
      return v;
    }
    return null;
  }

  function clearFlash(res) {
    res.setHeader('Set-Cookie', [...((res.getHeader('Set-Cookie') || [])), 'iaw_flash=; Path=/; HttpOnly; Max-Age=0']);
  }

  // wiki middleware
  function loadWiki(req, res, next) {
    const key = (req.params.wiki || '').toLowerCase();
    const wiki = app.getWiki(key);
    if (!wiki || wiki.deleted_at) return res.status(404).send('No such wiki');
    const user = getUser(req, res);
    const instanceAdmin = user && user.is_admin;
    const docsWikiAccess = key === 'docs' && instanceAdmin;
    if (wiki.visibility === 'private') {
      const member = user && (wiki.members || []).includes(user.id);
      const adminOk = user && (app.isAdmin(wiki, user) || docsWikiAccess);
      if (!user) return res.redirect('/login?next=' + encodeURIComponent(req.originalUrl));
      if (!member && !adminOk) {
        return res.status(403).send('<h1>Private wiki</h1><p>Only members can view this wiki.</p>');
      }
    }
    req.wiki = wiki;
    req.user = user;
    req.userIsAdmin = app.isAdmin(wiki, user) || docsWikiAccess;
    req.userCanEdit = app.canEdit(wiki, user) || docsWikiAccess;
    req.userIsBanned = app.isBanned(wiki, user);
    next();
  }

  function requireLogin(req, res, next) {
    if (!req.user) return res.redirect('/login?next=' + encodeURIComponent(req.originalUrl));
    next();
  }

  function requireCanEdit(req, res, next) {
    if (!req.user) return res.redirect('/login?next=' + encodeURIComponent(req.originalUrl));
    if (req.userIsBanned) return res.status(403).send('<h1>Banned</h1><p>You are banned from editing this wiki.</p>');
    if (!req.userCanEdit) return res.status(403).send('<h1>Protected wiki</h1><p>Only admins and editors can edit this wiki.</p>');
    next();
  }

  /** Serve a rendered page with the right CSS headers/links. */
  function renderPageResponse(req, res, wiki, page, user) {
    const rendered = app.renderPage(page, wiki);
    const html = wikiViews.pageShell({
      wiki: { ...wiki, user_is_admin: req.userIsAdmin, user_can_edit: req.userCanEdit },
      user,
      page,
      rendered: {
        html: rendered.html,
        tocHtml: rendered.toc,
        categories: rendered.categories || [],
      },
      canEdit: req.userCanEdit,
      isWatching: app.isWatching(user && user.id, page.id),
      exists: true,
      flash: getFlash(req, res),
    });
    res.send(html);
  }

  // ---------- instance routes ----------

  router.get('/', (req, res) => {
    const user = getUser(req, res);
    const wikis = db.all('wikis').filter((w) => !w.deleted_at);
    const featured = wikis.sort((a, b) => ((b.stats && b.stats.edits) || 0) - ((a.stats && a.stats.edits) || 0)).slice(0, 6);
    const newest = wikis.slice().sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 6);
    const stats = {
      wikis: wikis.length,
      pages: wikis.reduce((s, w) => s + ((w.stats && w.stats.pages) || 0), 0),
      edits: wikis.reduce((s, w) => s + ((w.stats && w.stats.edits) || 0), 0),
      users: db.all('users').filter((u) => !u.deleted_at).length,
    };
    const recent = recentEvents(12);
    res.send(base.instanceIndex({ featuredWikis: featured, newest, stats, settings, user, recent }));
  });

  function recentEvents(limit, wikiId) {
    let evs = db.allSorted('events', 'at', 'desc');
    // attach wiki info
    const wmap = new Map(db.all('wikis').map((w) => [w.id, w]));
    evs = evs.map((e) => {
      const w = wmap.get(e.wiki_id);
      return { ...e, wikiKey: w ? w.key : null, wikiName: w ? w.name : null };
    }).filter((e) => !e.deleted_wiki);
    return evs.slice(0, limit);
  }

  router.get('/signup', (req, res) => {
    const user = getUser(req, res);
    if (user) return res.redirect('/');
    res.send(inst.authPage({ mode: 'signup', user: null, settings, error: null, next: req.query.next }));
  });

  router.post('/signup', (req, res) => {
    if (!settings.signup_open) {
      return res.status(403).send('<h1>Sign-ups closed</h1><p>This instance is not accepting new accounts right now.</p>');
    }
    const username = String(req.body.username || '').trim();
    const password = String(req.body.password || '');
    const email = String(req.body.email || '').trim().toLowerCase();
    if (username.length < 2 || username.length > 40 || !/^[A-Za-z0-9 _-]+$/.test(username)) {
      return res.send(inst.authPage({ mode: 'signup', user: null, settings, error: 'Username must be 2–40 characters, letters/numbers/space/_- only.' }));
    }
    if (password.length < 8) {
      return res.send(inst.authPage({ mode: 'signup', user: null, settings, error: 'Password must be at least 8 characters.' }));
    }
    if (db.userByUsername(username)) {
      return res.send(inst.authPage({ mode: 'signup', user: null, settings, error: 'That username is taken.' }));
    }
    if (email && db.userByEmail(email)) {
      return res.send(inst.authPage({ mode: 'signup', user: null, settings, error: 'That email is already registered.' }));
    }
    const u = {
      id: uid('u_'),
      username,
      email: email || null,
      pass: hashPassword(password),
      is_admin: false,
      created_at: ts(),
      deleted_at: null,
      bio: '',
    };
    db.put('users', u.id, u);
    const token = createSession(db, u, req);
    res.setHeader('Set-Cookie', `session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${90 * 86400}`);
    if (req.body.next && String(req.body.next).startsWith('/')) return res.redirect(req.body.next);
    return res.redirect('/');
  });

  router.get('/login', (req, res) => {
    if (getUser(req, res)) return res.redirect('/');
    res.send(inst.authPage({ mode: 'login', user: null, settings, error: null, next: req.query.next }));
  });

  router.post('/login', (req, res) => {
    const username = String(req.body.username || '').trim();
    const password = String(req.body.password || '');
    const u = db.userByUsername(username);
    if (!u || !verifyPassword(password, u.pass)) {
      return res.send(inst.authPage({ mode: 'login', user: null, settings, error: 'Wrong username or password.' }));
    }
    const token = createSession(db, u, req);
    res.setHeader('Set-Cookie', `session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${90 * 86400}`);
    const next = req.body.next;
    if (next && String(next).startsWith('/')) return res.redirect(next);
    return res.redirect('/');
  });

  router.get('/logout', (req, res) => {
    const token = req.cookies && req.cookies.session;
    destroySession(db, token);
    res.setHeader('Set-Cookie', 'session=; Path=/; HttpOnly; Max-Age=0');
    res.redirect('/');
  });

  router.get('/wikis', (req, res) => {
    const user = getUser(req, res);
    const q = String(req.query.q || '').toLowerCase().trim();
    const sort = req.query.sort === 'active' ? 'active' : 'new';
    let wikis = db.all('wikis').filter((w) => !w.deleted_at);
    if (q) {
      wikis = wikis.filter((w) =>
        w.key.toLowerCase().includes(q) || (w.name || '').toLowerCase().includes(q) ||
        (w.description || '').toLowerCase().includes(q));
    }
    wikis.sort((a, b) => sort === 'active'
      ? ((b.stats && b.stats.edits) || 0) - ((a.stats && a.stats.edits) || 0)
      : b.created_at.localeCompare(a.created_at));
    res.send(inst.wikisPage({ wikis, user, search: q, sort }));
  });

  router.get('/create', (req, res) => {
    const user = getUser(req, res);
    if (!user) return res.redirect('/login?next=/create');
    const err = wikiCreationError(user);
    res.send(inst.createWikiPage({ user, error: err || null, settings, fields: {} }));
  });

  function wikiCreationError(user) {
    if (settings.wiki_creation === 'deny') return 'This instance has wiki creation disabled.';
    if (settings.wiki_creation === 'admin_only' && !user.is_admin) return 'Only admins can create wikis on this instance.';
    const limit = Number(settings.wiki_creation_limit);
    if (limit > 0 && !user.is_admin) {
      const count = db.wikisForUser(user.id).filter((w) => !w.deleted_at).length;
      if (count >= limit) return `You have reached the limit of ${limit} wikis${limit === 1 ? '' : 's'} per user on this instance.`;
    }
    return null;
  }

  router.post('/create', (req, res) => {
    const user = getUser(req, res);
    if (!user) return res.redirect('/login?next=/create');
    const err = wikiCreationError(user);
    if (err) return res.send(inst.createWikiPage({ user, error: err, settings, fields: req.body }));
    const key = String(req.body.key || '').toLowerCase();
    const name = String(req.body.name || '').trim();
    const description = String(req.body.description || '').trim();
    const theme = String(req.body.theme || 'dark').slice(0, 20);
    try {
      const wiki = app.createWiki(user, { key, name, description, theme });
      return res.redirect('/w/' + wiki.key + '/e/Home');
    } catch (e) {
      return res.send(inst.createWikiPage({ user, error: e.message, settings, fields: req.body }));
    }
  });

  router.get('/recent', (req, res) => {
    const user = getUser(req, res);
    const events = recentEvents(200);
    res.send(base.instanceLayout({
      title: 'Recent activity', user, body: `
        <main class="iaw-page iaw-narrow2"><div class="iaw-page-head"><h1>Recent activity</h1></div>
        ${base.recentRows(events)}</main>`, activeNav: 'recent' }));
  });

  router.get('/search', (req, res) => {
    const user = getUser(req, res);
    const q = String(req.query.q || '').trim();
    if (!q) return res.redirect('/');
    const wq = q.toLowerCase();
    const wikis = db.all('wikis').filter((w) => !w.deleted_at &&
      (w.key.includes(wq) || (w.name || '').toLowerCase().includes(wq) || (w.description || '').toLowerCase().includes(wq)))
      .slice(0, 12);
    const pages = [];
    for (const w of wikis) {
      for (const p of db.pagesForWiki(w.id)) {
        if ((p.title || '').toLowerCase().includes(wq)) {
          pages.push({ wiki_key: w.key, wiki_name: w.name, title: p.title, summary: p.summary });
          if (pages.length >= 30) break;
        }
      }
      if (pages.length >= 30) break;
    }
    res.send(inst.searchPage({ user, q, wikis, pages }));
  });

  router.get('/user/:name', (req, res) => {
    const user = getUser(req, res);
    const uname = String(req.params.name || '');
    const profile = db.userByUsername(uname);
    if (!profile || profile.deleted_at) return res.status(404).send('<h1>No such user</h1>');
    const wikis = user && user.id === profile.id ? db.wikisForUser(profile.id).filter((w) => !w.deleted_at) : [];
    const recent = db.eventsForUser(profile.id, 30).map((e) => {
      const w = db.get('wikis', e.wiki_id);
      return { ...e, wikiKey: w ? w.key : null, wikiName: w ? w.name : null };
    });
    res.send(inst.userPage({ user, profile, wikis, recent }));
  });

  router.get('/settings', (req, res) => {
    const user = getUser(req, res);
    if (!user) return res.redirect('/login?next=/settings');
    res.send(inst.settingsPage({ user, error: null, ok: null }));
  });

  router.post('/settings', (req, res) => {
    const user = getUser(req, res);
    if (!user) return res.redirect('/login?next=/settings');
    if (req.body.delete_account) {
      if (req.body.delete_confirm === user.username) {
        db.del('users', user.id);
        destroyAllSessions(db, user.id);
        res.setHeader('Set-Cookie', 'session=; Path=/; HttpOnly; Max-Age=0');
        return res.redirect('/?acct=deleted');
      }
      return res.send(inst.settingsPage({ user, error: 'Confirmation did not match your username.', ok: null }));
    }
    const email = String(req.body.email || '').trim().toLowerCase();
    if (email && email !== user.email && db.userByEmail(email)) {
      return res.send(inst.settingsPage({ user, error: 'That email is already in use.', ok: null }));
    }
    user.email = email || null;
    const pw = String(req.body.password || '');
    if (pw) {
      if (pw.length < 8) return res.send(inst.settingsPage({ user, error: 'New password too short.', ok: null }));
      user.pass = hashPassword(pw);
    }
    db.put('users', user.id, user);
    res.send(inst.settingsPage({ user, error: null, ok: 'Saved.' }));
  });

  router.get('/about', (req, res) => {
    res.send(inst.aboutPage({ user: getUser(req, res) }));
  });

  // ---------- instance admin ----------
  function instanceAdminPage(req, res, { error, ok } = {}) {
    const user = getUser(req, res);
    if (!user || !user.is_admin) return res.status(403).send('<h1>Admins only</h1>');
    const h = base.h;
    const fmtDate = base.fmtDate;
    const body = `
<main class="iaw-page iaw-narrow2">
  <div class="iaw-page-head"><h1>Instance admin</h1></div>
  ${error ? `<div class="iaw-error">${h(error)}</div>` : ''}
  ${ok ? `<div class="iaw-flash">${h(ok)}</div>` : ''}
  <section class="iaw-card">
    <h2>Sign-ups</h2>
    <form method="post" class="iaw-form">
      <label class="iaw-checkline"><input type="checkbox" name="signup_open" ${settings.signup_open ? 'checked' : ''}> Allow new account registration</label>
      <button class="iaw-btn" name="save" value="1">Save</button>
    </form>
  </section>
  <section class="iaw-card">
    <h2>Wiki creation</h2>
    <form method="post" class="iaw-form">
      <label>Allow users to create wikis
        <select name="wiki_creation">
          <option value="open" ${settings.wiki_creation === 'open' ? 'selected' : ''}>Everyone</option>
          <option value="admin_only" ${settings.wiki_creation === 'admin_only' ? 'selected' : ''}>Admins only</option>
          <option value="deny" ${settings.wiki_creation === 'deny' ? 'selected' : ''}>No one</option>
        </select>
      </label>
      <label>Per-user wiki limit <span class="iaw-muted">(0 = unlimited)</span>
        <input type="number" name="wiki_creation_limit" min="0" max="100" value="${settings.wiki_creation_limit || 0}">
      </label>
      <button class="iaw-btn" name="save" value="1">Save</button>
    </form>
  </section>
  <section class="iaw-card">
    <h2>All wikis (${db.all('wikis').length})</h2>
    <table class="iaw-table">
      <thead><tr><th>Wiki</th><th>Owner</th><th>Pages</th><th>Edits</th><th>Created</th><th></th></tr></thead>
      <tbody>${db.allSorted('wikis', 'created_at', 'desc').slice(0, 50).map((w) => `
        <tr>
          <td><a href="/w/${h(w.key)}">${h(w.name || w.key)}</a></td>
          <td>${h((db.get('users', w.owner_id) || {}).username || '?')}</td>
          <td>${(w.stats && w.stats.pages) || 0}</td>
          <td>${(w.stats && w.stats.edits) || 0}</td>
          <td>${base.fmtDate(w.created_at, { relative: false })}</td>
          <td><form method="post" class="iaw-inline-form"><input type="hidden" name="wiki_id" value="${w.id}">
            <button class="iaw-btn iaw-btn-xs iaw-btn-danger" name="delete" value="1">Delete</button></form></td>
        </tr>`).join('')}
      </tbody>
    </table>
  </section>
  <section class="iaw-card">
    <h2>Users (${db.all('users').filter((u) => !u.deleted_at).length})</h2>
    <table class="iaw-table">
      <thead><tr><th>User</th><th>Joined</th><th>Admin</th><th>Reset pass</th><th></th></tr></thead>
      <tbody>${db.allSorted('users', 'created_at', 'desc').filter((u) => !u.deleted_at).slice(0, 50).map((u) => `
        <tr>
          <td>${base.avatar(u.username)} ${h(u.username)}</td>
          <td>${base.fmtDate(u.created_at, { relative: false })}</td>
          <td>${u.is_admin ? '✓' : ''}</td>
          <td><form method="post" class="iaw-inline-form"><input type="hidden" name="user_id" value="${u.id}">
            <input type="password" name="new_password" minlength="8" autocomplete="new-password" placeholder="new pass">
            <button class="iaw-btn iaw-btn-xs" name="reset_password" value="1" ${u.id === user.id ? 'disabled' : ''}>Reset</button></form></td>
          <td><form method="post" class="iaw-inline-form"><input type="hidden" name="user_id" value="${u.id}">
            <button class="iaw-btn iaw-btn-xs" name="toggle_admin" value="1">${u.is_admin ? 'Demote' : 'Make admin'}</button>
            <button class="iaw-btn iaw-btn-xs iaw-btn-danger" name="delete_user" value="1">Delete</button></form></td>
        </tr>`).join('')}
      </tbody>
    </table>
  </section>
</main>`;
    res.send(base.instanceLayout({ title: 'Instance admin', user, body, activeNav: 'admin' }));
  }

  router.get('/admin', (req, res) => instanceAdminPage(req, res));
  router.post('/admin', (req, res) => {
    const user = getUser(req, res);
    if (!user || !user.is_admin) return res.status(403).send('<h1>Admins only</h1>');
    if (req.body.save) {
      settings.signup_open = req.body.signup_open === 'on' || req.body.signup_open === 'true';
      settings.wiki_creation = ['open', 'admin_only', 'deny'].includes(req.body.wiki_creation) ? req.body.wiki_creation : 'open';
      settings.wiki_creation_limit = Math.min(100, Math.max(0, Number(req.body.wiki_creation_limit) || 0));
      db.put('settings', 'instance', settings);
      return instanceAdminPage(req, res, { ok: 'Settings saved.' });
    }
    if (req.body.delete) {
      const w = db.get('wikis', req.body.wiki_id);
      if (w) {
        w.deleted_at = ts();
        db.put('wikis', w.id, w);
      }
      return instanceAdminPage(req, res, { ok: 'Wiki deleted.' });
    }
    if (req.body.reset_password) {
      const u = db.get('users', req.body.user_id);
      const newPass = String(req.body.new_password || '');
      if (u && u.id !== user.id) {
        if (newPass.length < 8) {
          return instanceAdminPage(req, res, { error: 'Password must be at least 8 characters.' });
        }
        u.pass = hashPassword(newPass);
        db.put('users', u.id, u);
        destroyAllSessions(db, u.id);
        return instanceAdminPage(req, res, { ok: `Password reset for ${u.username}.` });
      }
      return instanceAdminPage(req, res, { ok: 'No changes made.' });
    }
    if (req.body.delete_user) {
      const u = db.get('users', req.body.user_id);
      if (u && u.id !== user.id) {
        db.del('users', u.id);
        destroyAllSessions(db, u.id);
      }
      return instanceAdminPage(req, res, { ok: 'User deleted.' });
    }
    if (req.body.toggle_admin) {
      const u = db.get('users', req.body.user_id);
      if (u && u.id !== user.id) {
        u.is_admin = !u.is_admin;
        db.put('users', u.id, u);
      }
      return instanceAdminPage(req, res, { ok: 'Admin flag toggled.' });
    }
    return instanceAdminPage(req, res);
  });

  // ---------- wiki routes ----------

  router.use('/w/:wiki', loadWiki);

  // CSS files (safe: text/css only)
  router.get('/w/:wiki/wiki.css', (req, res) => {
    res.type('text/css');
    // tiny reset + structural stylesheet shared by all wikis — the "skin"
    res.send(WIKI_SKIN_CSS);
  });
  router.get('/w/:wiki/default.css', (req, res) => {
    res.type('text/css');
    let css = req.wiki.default_css || '';
    try { css = sanitizeCss(css); } catch (e) { css = ''; }
    res.send(css);
  });

  // hub
  router.get('/w/:wiki', (req, res) => {
    if (req.userIsBanned && !req.userIsAdmin) {
      return res.status(403).send('<h1>Banned</h1><p>You have been banned from this wiki.</p>');
    }
    const wiki = req.wiki;
    const listing = db.pagesForWiki(wiki.id)
      .filter((p) => !p.deleted_at && !p.redirect)
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .slice(0, 12);
    const events = db.eventsForWiki(wiki.id, 10);
    res.send(wikiViews.hubPage({
      wiki: { ...wiki, user_is_admin: req.userIsAdmin, user_can_edit: req.userCanEdit },
      user: req.user,
      listing,
      listingEvents: events,
      flash: getFlash(req, res),
    }));
  });

  // page view (also handles missing pages)
  router.get('/w/:wiki/p/:title', (req, res) => {
    const wiki = req.wiki;
    const title = normalizeTitle(decodeURIComponent(req.params.title));
    const page = app.getPage(wiki, title);
    if (page && page.deleted_at) return res.status(404).send('<h1>Page deleted</h1>');
    if (page && page.redirect && req.query.redirect !== 'no') {
      // follow redirect
      const target = page.redirect;
      const tp = app.getPage(wiki, target);
      if (tp) {
        return res.redirect('/w/' + wiki.key + '/p/' + encodeURIComponent(tp.title));
      }
    }
    if (!page) {
      const body = wikiViews.pageShell({
        wiki: { ...wiki, user_is_admin: req.userIsAdmin, user_can_edit: req.userCanEdit },
        user: req.user,
        page: null,
        requestedTitle: title,
        rendered: { html: '', tocHtml: '', categories: [] },
        canEdit: req.userCanEdit,
        isWatching: false,
        exists: false,
        flash: getFlash(req, res),
      });
      return res.status(404).send(body);
    }
    renderPageResponse(req, res, wiki, page, req.user);
  });

  // categories / templates / files get normal page routes too
  router.get('/w/:wiki/c/:cat', (req, res) => {
    const cat = normalizeTitle(decodeURIComponent(req.params.cat));
    const pages = db.pagesByCategory(req.wiki.id, cat).filter((p) => !p.deleted_at)
      .sort((a, b) => a.title.localeCompare(b.title));
    res.send(wikiViews.categoryPage({ wiki: req.wiki, user: req.user, category: cat, pages }));
  });

  // edit
  router.get('/w/:wiki/e/:title', (req, res) => {
    if (!req.user) return res.redirect('/login?next=' + encodeURIComponent('/w/' + req.wiki.key + '/e/' + req.params.title));
    if (req.userIsBanned) return res.status(403).send('<h1>Banned</h1>');
    if (!req.userCanEdit) return res.status(403).send(wikiViews.editPage({ wiki: req.wiki, user: req.user, page: null, isNew: true, cssMode: false, preview: null, error: 'This wiki is protected — only admins and editors can edit.', canEdit: false }));
    const title = normalizeTitle(decodeURIComponent(req.params.title));
    const page = app.getPage(req.wiki, title);
    const cssMode = req.query.css === '1';
    res.send(wikiViews.editPage({
      wiki: req.wiki, user: req.user, page, pageTitle: title, isNew: !page, cssMode,
      preview: null, error: null, canEdit: true,
    }));
  });

  router.post('/w/:wiki/e/:title', (req, res) => {
    if (!req.user) return res.redirect('/login?next=' + encodeURIComponent('/w/' + req.wiki.key + '/e/' + req.params.title));
    if (req.userIsBanned) return res.status(403).send('<h1>Banned</h1>');
    if (!req.userCanEdit) return res.status(403).send('Protected wiki');
    const wiki = req.wiki;
    const titleIn = normalizeTitle(decodeURIComponent(req.params.title));
    const formTitle = normalizeTitle(String(req.body.title || titleIn || ''));
    if (!formTitle) {
      return res.send(wikiViews.editPage({
        wiki, user: req.user, page: null, pageTitle: titleIn || '', isNew: true, cssMode: req.body.css_mode === '1',
        preview: null, error: 'A page title is required.', canEdit: true,
      }));
    }
    const cssMode = req.body.css_mode === '1';
    const action = req.body.action;
    const page = app.getPage(wiki, formTitle);
    let content = String(req.body.content || '');
    let css = String(req.body.css || '');

    if (cssMode) {
      css = String(req.body.css || '');
      try { css = sanitizeCss(css); } catch (e) {
        return res.send(wikiViews.editPage({
          wiki, user: req.user, page, pageTitle: formTitle, isNew: !page, cssMode: true,
          preview: null, error: 'CSS problem: ' + e.message, canEdit: true,
        }));
      }
    }

    const draft = page ? { ...page } : {
      id: uid('p_'), wiki_id: wiki.id, title: formTitle, content: '', css: '',
      summary: '', redirect: null, categories: [],
      created_at: ts(), last_editor_id: null, last_username: null,
    };
    if (cssMode) {
      draft.css = css;
    } else {
      draft.content = content;
      if (!String(content || '').trim() && action === 'save') {
        return res.send(wikiViews.editPage({ wiki, user: req.user, page: draft, pageTitle: formTitle, isNew: !page, cssMode: false, preview: null, error: 'Content is empty.', canEdit: true }));
      }
    }
    draft.last_username = req.user.username;

    if (action === 'preview') {
      const rendered = app.renderPage(draft, wiki);
      return res.send(wikiViews.editPage({
        wiki, user: req.user, page: draft, isNew: !page, cssMode,
        preview: { html: rendered.html, categories: rendered.categories },
        error: null, canEdit: true,
      }));
    }
    try {
      app.savePage(wiki, draft, req.user, { summary: String(req.body.summary || '') });
    } catch (e) {
      return res.send(wikiViews.editPage({ wiki, user: req.user, page: draft, isNew: !page, cssMode, preview: null, error: e.message, canEdit: true }));
    }
    flash(req, res, 'Saved.');
    return res.redirect('/w/' + wiki.key + '/p/' + encodeURIComponent(draft.title));
  });

  // history
  router.get('/w/:wiki/history/:title', (req, res) => {
    const page = app.getPage(req.wiki, decodeURIComponent(req.params.title));
    if (!page) return res.redirect('/w/' + req.wiki.key + '/p/' + req.params.title);
    const revisions = db.revisionsForPage(page.id);
    res.send(wikiViews.historyPage({ wiki: req.wiki, user: req.user, page, revisions }));
  });

  router.get('/w/:wiki/rev/:title/:rev', (req, res) => {
    const page = app.getPage(req.wiki, decodeURIComponent(req.params.title));
    const revNum = Number(req.params.rev);
    const rev = page && db.revisionsForPage(page.id).find((r) => r.rev === revNum);
    if (!rev) return res.status(404).send('No such revision');
    const rendered = app.renderPage({ ...page, content: rev.content }, req.wiki);
    res.send(wikiViews.pageShell({
      wiki: req.wiki, user: req.user, page: { ...page, content: rev.content, title: page.title + ' (rev ' + rev.rev + ')' },
      rendered: { html: rendered.html, tocHtml: '', categories: rendered.categories },
      canEdit: false, isWatching: false, exists: true, flash: null,
    }));
  });

  router.get('/w/:wiki/diff/:title', (req, res) => {
    const page = app.getPage(req.wiki, decodeURIComponent(req.params.title));
    if (!page) return res.status(404).send('No such page');
    const revs = db.revisionsForPage(page.id);
    if (!revs.length) return res.redirect('/w/' + req.wiki.key + '/p/' + encodeURIComponent(page.title));
    const from = Number(req.query.from) || (revs.length > 1 ? revs[1].rev : revs[0].rev);
    const to = Number(req.query.to) || revs[0].rev;
    const revA = revs.find((r) => r.rev === from) || revs[revs.length - 1];
    const revB = revs.find((r) => r.rev === to) || revs[0];
    const htmlA = app.renderPage({ ...page, content: revA.content }, req.wiki).html;
    const htmlB = app.renderPage({ ...page, content: revB.content }, req.wiki).html;
    res.send(wikiViews.diffPage({ wiki: req.wiki, user: req.user, page, revA, revB, htmlA, htmlB }));
  });

  // delete / rename
  router.get('/w/:wiki/delete/:title', (req, res) => {
    if (!req.userIsAdmin) return res.status(403).send('<h1>Admins only</h1>');
    const page = app.getPage(req.wiki, decodeURIComponent(req.params.title));
    if (!page) return res.redirect('/w/' + req.wiki.key);
    const body = `<main class="iaw-page iaw-narrow2">
      <h1>Delete “${escapeHtml(page.title)}”?</h1>
      <p class="iaw-muted">This removes the page from the wiki. Its history is kept.</p>
      <form method="post" class="iaw-form"><input type="hidden" name="title" value="${escapeHtml(page.title)}">
        <label>Reason <input name="reason" placeholder="why are you deleting this?"></label>
        <button class="iaw-btn iaw-btn-danger" name="confirm" value="1">Delete page</button>
        <a class="iaw-btn" href="/w/${escapeHtml(req.wiki.key)}/p/${escapeHtml(encodeURIComponent(page.title))}">Cancel</a>
      </form>
    </main>`;
    res.send(wikiViews.wikiLayout({ wiki: req.wiki, user: req.user, title: 'Delete', body }));
  });

  router.post('/w/:wiki/delete/:title', (req, res) => {
    if (!req.userIsAdmin) return res.status(403).send('<h1>Admins only</h1>');
    const page = app.getPage(req.wiki, decodeURIComponent(req.params.title));
    if (page) {
      app.deletePage(req.wiki, page, req.user);
      flash(req, res, 'Page deleted.');
    }
    res.redirect('/w/' + req.wiki.key);
  });

  // watch
  router.get('/w/:wiki/watch/:title', (req, res) => {
    if (!req.user) return res.redirect('/login?next=' + encodeURIComponent(req.originalUrl));
    const page = app.getPage(req.wiki, decodeURIComponent(req.params.title));
    if (page) {
      app.toggleWatch(req.user.id, req.wiki.id, page.id);
      flash(req, res, 'Watchlist updated.');
      res.redirect('/w/' + req.wiki.key + '/p/' + encodeURIComponent(page.title));
    } else res.redirect('/w/' + req.wiki.key);
  });

  // all pages / categories list
  router.get('/w/:wiki/all', (req, res) => {
    const letter = String(req.query.l || '').toUpperCase()[0] || '';
    let pages = db.pagesForWiki(req.wiki.id).filter((p) => !p.deleted_at)
      .sort((a, b) => a.title.localeCompare(b.title));
    if (letter) pages = pages.filter((p) => p.title.toUpperCase().startsWith(letter));
    res.send(wikiViews.allPagesPage({ wiki: req.wiki, user: req.user, pages, letter }));
  });

  router.get('/w/:wiki/special/:name', (req, res) => {
    const name = String(req.params.name || '');
    switch (name) {
      case 'RecentChanges': {
        const events = db.eventsForWiki(req.wiki.id, 100);
        res.send(wikiViews.recentChangesPage({ wiki: req.wiki, user: req.user, events }));
        return;
      }
      case 'AllPages': {
        const pages = db.pagesForWiki(req.wiki.id).filter((p) => !p.deleted_at)
          .sort((a, b) => a.title.localeCompare(b.title));
        res.send(wikiViews.allPagesPage({ wiki: req.wiki, user: req.user, pages, letter: '' }));
        return;
      }
      case 'MissingPages': {
        const missing = app.missingPageTitles(req.wiki);
        const body = `<main class="iaw-page iaw-narrow2"><div class="iaw-page-head"><h1>Missing pages</h1></div>
          <div class="iaw-pagelist">${missing.map((t) => `
            <a class="iaw-pagecard" href="/w/${escapeHtml(req.wiki.key)}/p/${escapeHtml(encodeURIComponent(t))}"><b>${escapeHtml(t)}</b><span class="iaw-muted">create it →</span></a>`).join('')}</div>
          ${!missing.length ? '<p class="iaw-empty">Nothing is missing — all links resolve!</p>' : ''}
        </main>`;
        res.send(wikiViews.specialPage({ wiki: req.wiki, user: req.user, name: 'MissingPages', body }));
        return;
      }
      case 'Categories': {
        const all = db.pagesForWiki(req.wiki.id).filter((p) => !p.deleted_at);
        const counts = {};
        for (const p of all) for (const c of (p.categories || [])) counts[c] = (counts[c] || 0) + 1;
        const cats = Object.keys(counts).sort();
        const body = `<main class="iaw-page iaw-narrow2"><div class="iaw-page-head"><h1>All categories</h1></div>
          <div class="iaw-pagelist">${cats.map((c) => `
            <a class="iaw-pagecard" href="/w/${escapeHtml(req.wiki.key)}/c/${escapeHtml(encodeURIComponent(c))}"><b>${escapeHtml(c)}</b><span class="iaw-muted">${counts[c]} page${counts[c] === 1 ? '' : 's'}</span></a>`).join('')}</div>
          ${!cats.length ? '<p class="iaw-empty">No categories yet.</p>' : ''}
        </main>`;
        res.send(wikiViews.specialPage({ wiki: req.wiki, user: req.user, name: 'Categories', body }));
        return;
      }
      case 'WhatLinksHere': {
        const target = normalizeTitle(String(req.query.target || ''));
        const targetPage = app.getPage(req.wiki, target);
        const linked = [];
        if (targetPage) {
          for (const p of db.pagesForWiki(req.wiki.id)) {
            if (p.deleted_at) continue;
            const re = new RegExp('\\[\\[\\s*' + escapeRegExp(target) + '(?:\\||\\]\\])', 'i');
            if (re.test(p.content)) linked.push(p);
          }
        }
        const body = `<main class="iaw-page iaw-narrow2"><div class="iaw-page-head"><h1>What links here</h1></div>
          <form class="iaw-searchbar" method="get"><input name="target" value="${escapeHtml(target)}"><button class="iaw-btn">Find</button></form>
          ${linked.length ? `<div class="iaw-pagelist">${linked.map((p) => `<a class="iaw-pagecard" href="/w/${escapeHtml(req.wiki.key)}/p/${escapeHtml(encodeURIComponent(p.title))}"><b>${escapeHtml(p.title)}</b></a>`).join('')}</div>` : '<p class="iaw-empty">Nothing links here yet.</p>'}
        </main>`;
        res.send(wikiViews.specialPage({ wiki: req.wiki, user: req.user, name: 'WhatLinksHere', body }));
        return;
      }
      case 'Media': {
        const listing = db.all('media').filter((m) => m.wiki_id === req.wiki.id).map((m) => ({
          ...m, humanSize: humanSize(m.size),
          kind: (m.type || '').startsWith('image/') ? 'image' : 'file',
        }));
        res.send(wikiViews.mediaPage({ wiki: req.wiki, user: req.user, listing, canEdit: req.userCanEdit }));
        return;
      }
      default:
        res.send(wikiViews.specialPage({ wiki: req.wiki, user: req.user, name, body: '<h1>Special:' + escapeHtml(name) + '</h1><p class="iaw-muted">This special page does not exist.</p>' }));
    }
  });

  // templates
  router.get('/w/:wiki/t/:title', (req, res) => {
    const title = normalizeTitle('Template:' + decodeURIComponent(req.params.title));
    const page = app.getPage(req.wiki, title);
    if (!page) return res.status(404).send('<h1>No such template</h1>');
    const rendered = app.renderPage(page, req.wiki);
    res.send(wikiViews.templatePage({ wiki: req.wiki, user: req.user, page, rendered, canEdit: req.userCanEdit }));
  });

  // files
  router.get('/w/:wiki/f/:name', (req, res) => {
    const media = db.mediaByName(req.wiki.id, decodeURIComponent(req.params.name));
    if (!media) return res.status(404).send('<h1>File not found</h1>');
    res.send(wikiViews.filePage({ wiki: req.wiki, user: req.user, media: { ...media, humanSize: humanSize(media.size) }, canEdit: req.userCanEdit }));
  });

  router.get('/w/:wiki/f/:name/raw', (req, res) => {
    const media = db.mediaByName(req.wiki.id, decodeURIComponent(req.params.name));
    if (!media) return res.status(404).send('Not found');
    const fp = app.mediaPath(req.wiki, media.name);
    if (!fs.existsSync(fp)) return res.status(404).send('File missing on disk');
    res.type(media.type || 'application/octet-stream');
    res.setHeader('Content-Disposition', 'inline');
    res.sendFile(fp);
  });

  // upload
  router.get('/w/:wiki/upload', (req, res) => {
    if (!req.userCanEdit) return res.status(403).send('Protected wiki');
    const over = req.query.over ? String(req.query.over) : '';
    const body = `<main class="iaw-page iaw-narrow2"><div class="iaw-page-head"><h1>Upload a file</h1></div>
      <form method="post" enctype="multipart/form-data" action="/w/${escapeHtml(req.wiki.key)}/upload" class="iaw-form iaw-card">
        <label>File <input type="file" name="file" required></label>
        <label>Filename override <span class="iaw-muted">(optional)</span><input name="filename" value="${escapeHtml(over)}"></label>
        <button class="iaw-btn iaw-btn-primary">Upload (max 10 MB)</button>
      </form>
    </main>`;
    res.send(wikiViews.wikiLayout({ wiki: req.wiki, user: req.user, title: 'Upload', body, active: 'upload' }));
  });

  router.post('/w/:wiki/upload', (req, res) => {
    if (!req.userCanEdit) return res.status(403).send('Protected wiki');
    const wiki = req.wiki;
    parseMultipart(req).then(({ fields, file }) => {
      if (!file || !file.bytes.length) {
        return res.send(wikiViews.wikiLayout({ wiki, user: req.user, title: 'Upload', body: '<main class="iaw-page"><div class="iaw-error">No file selected.</div><a class="iaw-btn" href="/w/' + escapeHtml(wiki.key) + '/upload">Try again</a></main>' }));
      }
      const name = fields.filename && fields.filename.trim()
        ? fields.filename.trim() : file.filename;
      try {
        const media = app.saveMedia(wiki, {
          filename: name, bytes: file.bytes, type: file.type, user: req.user,
        });
        flash(req, res, 'Uploaded ' + media.name + '.');
        res.redirect('/w/' + wiki.key + '/f/' + encodeURIComponent(media.name));
      } catch (e) {
        const body = `<main class="iaw-page"><h1>Upload failed</h1><p>${escapeHtml(e.message)}</p><a class="iaw-btn" href="/w/${escapeHtml(wiki.key)}/upload">Try again</a></main>`;
        res.send(wikiViews.wikiLayout({ wiki, user: req.user, title: 'Upload failed', body }));
      }
    }).catch((err) => {
      const body = `<main class="iaw-page"><h1>Upload failed</h1><p>${escapeHtml(err.message)}</p><a class="iaw-btn" href="/w/${escapeHtml(wiki.key)}/upload">Try again</a></main>`;
      res.send(wikiViews.wikiLayout({ wiki, user: req.user, title: 'Upload failed', body }));
    });
  });

  // wiki search
  router.get('/w/:wiki/search', (req, res) => {
    const q = String(req.query.q || '').trim();
    const wiki = req.wiki;
    let results = [];
    const wants = q.toLowerCase();
    if (wants) {
      results = db.pagesForWiki(wiki.id).filter((p) => !p.deleted_at &&
        ((p.title || '').toLowerCase().includes(wants) || (p.content || '').toLowerCase().includes(wants)))
        .slice(0, 60);
    }
    const body = `<main class="iaw-page iaw-narrow2"><div class="iaw-page-head"><h1>Search “${escapeHtml(q)}”</h1></div>
      <form class="iaw-searchbar" method="get" action="/w/${escapeHtml(wiki.key)}/search"><input type="search" name="q" value="${escapeHtml(q)}"><button class="iaw-btn">Search</button></form>
      ${results.length ? `<div class="iaw-pagelist">${results.map((p) => `<a class="iaw-pagecard" href="/w/${escapeHtml(wiki.key)}/p/${escapeHtml(encodeURIComponent(p.title))}"><b>${escapeHtml(p.title)}</b><span class="iaw-muted">${escapeHtml(p.summary || '')}</span></a>`).join('')}</div>`
      : q ? '<p class="iaw-empty">No results.</p>' : ''}
    </main>`;
    res.send(wikiViews.wikiLayout({ wiki, user: req.user, title: 'Search', body }));
  });

  // members
  router.get('/w/:wiki/members', (req, res) => {
    const users = [];
    const seen = new Set();
    for (const id of [req.wiki.owner_id, ...(req.wiki.admins || []), ...(req.wiki.editors || [])]) {
      if (seen.has(id)) continue;
      seen.add(id);
      const u = db.get('users', id);
      if (u && !u.deleted_at) users.push(u);
    }
    res.send(wikiViews.membersPage({ wiki: req.wiki, user: req.user, users }));
  });

  // wiki admin
  router.get('/w/:wiki/admin', (req, res) => {
    if (!req.userIsAdmin) return res.status(403).send('<h1>Admins only</h1>');
    const wiki = req.wiki;
    const users = [];
    const seen = new Set();
    const ids = new Set([wiki.owner_id, ...(wiki.admins || []), ...(wiki.editors || []), ...(wiki.banned || [])]);
    for (const id of ids) {
      const u = db.get('users', id);
      if (u && !u.deleted_at) users.push(u);
    }
    // also include editors referenced by edits
    for (const e of db.eventsForWiki(wiki.id, 200)) {
      if (e.user_id && !ids.has(e.user_id)) {
        const u = db.get('users', e.user_id);
        if (u && !u.deleted_at && !seen.has(u.id)) { users.push(u); seen.add(u.id); }
      }
    }
    res.send(wikiViews.wikiAdminPage({
      wiki: { ...wiki, user_is_admin: true }, user: req.user, users, events: [],
      error: null, ok: null,
    }));
  });

  router.post('/w/:wiki/admin', (req, res) => {
    if (!req.userIsAdmin) return res.status(403).send('<h1>Admins only</h1>');
    const wiki = req.wiki;
    const user = req.user;
    const render = (err, ok) => wikiViews.wikiAdminPage({
      wiki: { ...wiki, user_is_admin: true }, user, users: [], events: [], error: err, ok,
    });
    if (req.body.save_settings) {
      wiki.name = String(req.body.name || wiki.name).trim().slice(0, 120) || wiki.name;
      wiki.description = String(req.body.description || '').trim().slice(0, 400);
      wiki.theme = String(req.body.theme || 'dark').slice(0, 20);
      wiki.visibility = req.body.private === 'on' ? 'private' : 'public';
      if (wiki.members && !wiki.members.includes(wiki.owner_id)) wiki.members.push(wiki.owner_id);
      db.put('wikis', wiki.id, wiki);
      return res.send(render(null, 'Wiki settings saved.'));
    }
    if (req.body.save_css) {
      const css = String(req.body.default_css || '');
      try {
        wiki.default_css = sanitizeCss(css);
        db.put('wikis', wiki.id, wiki);
        return res.send(render(null, 'Default CSS saved.'));
      } catch (e) {
        return res.send(render(e.message, null));
      }
    }
    if (req.body.action === 'add_editor') {
      const uname = String(req.body.add_user || '').trim();
      const u = db.userByUsername(uname);
      if (!u) return res.send(render('No such user: ' + uname, null));
      wiki.editors = [...new Set([...(wiki.editors || []), u.id])];
      wiki.banned = (wiki.banned || []).filter((x) => x !== u.id);
      db.put('wikis', wiki.id, wiki);
      return res.send(render(null, 'Added ' + uname + ' as editor.'));
    }
    if (req.body.set_role) {
      const uname = String(req.body.target || '').trim();
      const u = db.userByUsername(uname);
      if (!u) return res.send(render('No such user', null));
      const role = req.body.set_role;
      wiki.admins = (wiki.admins || []).filter((x) => x !== u.id);
      wiki.editors = (wiki.editors || []).filter((x) => x !== u.id);
      wiki.banned = (wiki.banned || []).filter((x) => x !== u.id);
      if (role === 'admin') wiki.admins.push(u.id);
      else if (role === 'editor') wiki.editors.push(u.id);
      else if (role === 'ban') wiki.banned.push(u.id);
      db.put('wikis', wiki.id, wiki);
      return res.send(render(null, 'Role updated for ' + uname + '.'));
    }
    if (req.body.delete_wiki) {
      if (req.body.confirm_key === wiki.key) {
        wiki.deleted_at = ts();
        db.put('wikis', wiki.id, wiki);
        flash(req, res, 'Wiki deleted.');
        return res.redirect('/');
      }
      return res.send(render('Type the wiki key to confirm deletion.', null));
    }
    return res.send(render(null, null));
  });

  // wiki about
  router.get('/w/:wiki/about', (req, res) => {
    const wiki = req.wiki;
    const owner = db.get('users', wiki.owner_id);
    const body = `<main class="iaw-page iaw-narrow2">
      <div class="iaw-page-head"><h1>About ${escapeHtml(wiki.name)}</h1></div>
      <p>${escapeHtml(wiki.description || '')}</p>
      <dl class="iaw-filedl">
        <dt>Created</dt><dd>${base.fmtDate(wiki.created_at, { relative: false })}</dd>
        <dt>Owner</dt><dd>${owner ? escapeHtml(owner.username) : '?'}</dd>
        <dt>Pages</dt><dd>${(wiki.stats && wiki.stats.pages) || 0}</dd>
        <dt>Edits</dt><dd>${(wiki.stats && wiki.stats.edits) || 0}</dd>
        <dt>Visibility</dt><dd>${escapeHtml(wiki.visibility || 'public')}</dd>
      </dl>
      ${wiki.user_is_admin ? '<p><a class="iaw-btn" href="/w/' + escapeHtml(wiki.key) + '/admin">Admin console</a></p>' : ''}
    </main>`;
    res.send(wikiViews.wikiLayout({ wiki, user: req.user, title: 'About', body, active: 'about' }));
  });

  return router;
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const { WIKI_SKIN_CSS } = require('../skin');

module.exports = { makeServer, WIKI_SKIN_CSS };