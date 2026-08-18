'use strict';

const { h, avatar, fmtDate, wantlist, recentRows, wikiCard, eventAction } = require('./base');

/** Instance-site pages: auth, browse, create-wiki, user pages, about. */

function authPage({ mode, error, settings, user, next }) {
  const isLogin = mode === 'login';
  const body = `
<main class="iaw-auth">
  <div class="iaw-authcard">
    <h1>${isLogin ? 'Welcome back' : 'Join It\'s a Wiki!'}</h1>
    ${isLogin ? '<p class="iaw-muted">Log in to edit wikis, keep watchlists, and create your own.</p>'
      : '<p class="iaw-muted">Free accounts. Create wikis, edit pages, style them with CSS.</p>'}
    ${error ? `<div class="iaw-error">${h(error)}</div>` : ''}
    <form method="post" action="${isLogin ? '/login' : '/signup'}" class="iaw-form">
      <input type="hidden" name="next" value="${h(next || '')}">
      <label>Username<input name="username" required minlength="2" maxlength="40" autocomplete="username" ${isLogin ? '' : 'autofocus'}></label>
      ${isLogin ? '' : '<label>Email <span class="iaw-muted">(optional)</span><input name="email" type="email" maxlength="120" autocomplete="email"></label>'}
      <label>Password<input name="password" type="password" required minlength="8" autocomplete="${isLogin ? 'current-password' : 'new-password'}"></label>
      <button class="iaw-btn iaw-btn-primary iaw-btn-block" type="submit">${isLogin ? 'Log in' : 'Create account'}</button>
    </form>
    <p class="iaw-switch">${isLogin ? `No account yet? <a href="/signup${next ? '?next=' + encodeURIComponent(next) : ''}">Join free</a>` : `Already a member? <a href="/login${next ? '?next=' + encodeURIComponent(next) : ''}">Log in</a>`}</p>
    ${!settings.signup_open && !isLogin ? '<p class="iaw-warn">This instance currently has sign-ups closed (admin setting).</p>' : ''}
  </div>
</main>`;
  return require('./base').instanceLayout({ title: isLogin ? 'Log in' : 'Join', user, body, activeNav: '' });
}

function wikisPage({ wikis, user, search, sort }) {
  const body = `
<main class="iaw-page">
  <div class="iaw-page-head">
    <h1>Wikis</h1>
    <a class="iaw-btn iaw-btn-primary" href="/create">New wiki</a>
  </div>
  <form class="iaw-searchbar" action="/wikis" method="get">
    <input type="search" name="q" placeholder="Search wikis by name or key…" value="${h(search || '')}">
    <select name="sort"><option value="new" ${sort !== 'active' ? 'selected' : ''}>Newest</option><option value="active" ${sort === 'active' ? 'selected' : ''}>Most active</option></select>
    <button class="iaw-btn">Search</button>
  </form>
  <div class="iaw-wikigrid">${wikis.length ? wikis.map(wikiCard).join('') : '<p class="iaw-empty">No wikis match.</p>'}</div>
</main>`;
  return require('./base').instanceLayout({ title: 'Wikis', user, body, activeNav: 'wikis' });
}

function createWikiPage({ user, error, settings, fields }) {
  const f = fields || {};
  const closedBecauseAdmin = settings.wiki_creation === 'admin_only';
  const body = `
<main class="iaw-page iaw-narrow">
  <div class="iaw-page-head"><h1>Create a wiki</h1></div>
  ${error ? `<div class="iaw-error">${h(error)}</div>` : ''}
  ${closedBecauseAdmin ? '<p class="iaw-warn">This instance only lets admins create wikis.</p>' : ''}
  <form method="post" action="/create" class="iaw-form iaw-card">
    <label>Wiki key <span class="iaw-muted">(part of the address: /w/your-key)</span>
      <input name="key" required placeholder="my-awesome-wiki" pattern="[a-z0-9-]{2,40}" value="${h(f.key || '')}">
    </label>
    <label>Display name<input name="name" required maxlength="120" placeholder="My Awesome Wiki" value="${h(f.name || '')}"></label>
    <label>Description <span class="iaw-muted">(shown on the front page)</span>
      <textarea name="description" rows="3" maxlength="400" placeholder="What is this wiki about?">${h(f.description || '')}</textarea>
    </label>
    <label>Theme
      <select name="theme">
        <option value="dark" ${f.theme !== 'forest' ? 'selected' : ''}>Dark</option>
        <option value="forest" ${f.theme === 'forest' ? 'selected' : ''}>Forest</option>
      </select>
    </label>
    <button class="iaw-btn iaw-btn-primary iaw-btn-block" type="submit">Create wiki</button>
  </form>
</main>`;
  return require('./base').instanceLayout({ title: 'Create a wiki', user, body, banner: 'creator', activeNav: 'mine' });
}

function userPage({ user, profile, wikis, recent, watchPageCount }) {
  const body = `
<main class="iaw-page">
  <div class="iaw-profile-head">
    ${avatar(profile.username, 56)}
    <div>
      <h1>${h(profile.username)}</h1>
      <p class="iaw-muted">Joined ${fmtDate(profile.created_at, { relative: false })}${user && user.id === profile.id ? ' · <a href="/settings">settings</a>' : ''}</p>
    </div>
  </div>
  ${user && user.id === profile.id ? `
  <section class="iaw-section">
    <div class="iaw-section-head"><h2>My wikis</h2><a href="/create">＋ Create wiki</a></div>
    <div class="iaw-wikigrid">${wikis.length ? wikis.map(wikiCard).join('') : '<p class="iaw-empty">You haven\'t created any wikis yet.</p>'}</div>
  </section>` : ''}
  <section class="iaw-section">
    <div class="iaw-section-head"><h2>Recent activity</h2></div>
    ${recentRows(recent)}
  </section>
</main>`;
  return require('./base').instanceLayout({ title: profile.username + ' — profile', user, body, activeNav: 'mine' });
}

function searchPage({ user, q, wikis, pages }) {
  const body = `
<main class="iaw-page">
  <div class="iaw-page-head"><h1>Search “${h(q)}”</h1></div>
  ${wikis.length ? `<h2>Wikis</h2><div class="iaw-wikigrid">${wikis.map(wikiCard).join('')}</div>` : ''}
  ${pages.length ? `<h2>Pages across wikis</h2><div class="iaw-recent">${pages.map((p) => `
    <div class="iaw-recentitem"><div class="iaw-recentbody">
      <div><a href="/w/${h(p.wiki_key)}/p/${h(encodeURIComponent(p.title))}"><b>${h(p.title)}</b></a>
      <span class="iaw-muted">on <a href="/w/${h(p.wiki_key)}">${h(p.wiki_name || p.wiki_key)}</a></span></div>
      <div class="iaw-recentmeta">${h(p.summary || '')}</div>
    </div></div>`).join('')}</div>` : ''}
  ${!wikis.length && !pages.length ? '<p class="iaw-empty">Nothing found for “' + h(q) + '”.</p>' : ''}
</main>`;
  return require('./base').instanceLayout({ title: 'Search', user, body });
}

function aboutPage({ user }) {
  const body = `<main class="iaw-page iaw-narrow">
    <h1>About It's a Wiki!</h1>
    <p><b>It's a Wiki!</b> is an open-source (GPL-3.0) wiki farm — a modern, self-hostable successor
    to the wiki-hosting sites of the 2000s. It aims to be <i>Fandom, but better</i>:</p>
    <ul class="iaw-feature-list">
      <li><b>Everyone can create a wiki</b> on any instance — or admins can restrict creation (deny entirely, or a per-user limit).</li>
      <li><b>Full wikitext</b>: sections, tables, links, images, templates with arguments, transclusion, categories, redirects, references, galleries, magic words, and more.</li>
      <li><b>Custom CSS that's easy.</b> Every individual page can have its own stylesheet, and every wiki has a default stylesheet — edit them from the page itself, no developer account required.</li>
      <li><b>Batteries included</b>: users, roles (owner/admin/editor), bans, per-wiki private access, watchlists, page history with diffs, recent changes, special pages, image uploads.</li>
      <li><b>Runs on a single server.</b> JSON-file storage, zero external services, Node.js only. Self-host for your community.</li>
    </ul>
    <p>Roadmap: comments/disccussion pages, structured data (portable infoboxes), LiquidThreads-style
    talk pages, federation with <code>ActivityPub</code>, and an import tool for Fandom dumps.</p>
  </main>`;
  return require('./base').instanceLayout({ title: 'About', user, body });
}

function settingsPage({ user, error, ok }) {
  const body = `
<main class="iaw-page iaw-narrow">
  <div class="iaw-page-head"><h1>Settings</h1></div>
  ${error ? `<div class="iaw-error">${h(error)}</div>` : ''}
  ${ok ? `<div class="iaw-flash">${h(ok)}</div>` : ''}
  <form method="post" action="/settings" class="iaw-form iaw-card">
    <label>Username<input value="${h(user.username)}" disabled><span class="iaw-muted">Usernames are permanent for now (rename coming later).</span></label>
    <label>Email<input name="email" type="email" value="${h(user.email || '')}" maxlength="120"></label>
    <label>New password <span class="iaw-muted">(leave blank to keep current)</span><input name="password" type="password" minlength="8" autocomplete="new-password"></label>
    <button class="iaw-btn iaw-btn-primary" type="submit">Save changes</button>
  </form>
  <form method="post" action="/settings" class="iaw-form iaw-card iaw-danger-zone">
    <h2>Danger zone</h2>
    <label>Confirm username to delete account<input name="delete_confirm" placeholder="${h(user.username)}"></label>
    <button class="iaw-btn iaw-btn-danger" type="submit" name="delete_account" value="1">Delete my account</button>
  </form>
</main>`;
  return require('./base').instanceLayout({ title: 'Settings', user, body, activeNav: 'mine' });
}

module.exports = {
  authPage, wikisPage, createWikiPage, userPage, searchPage, aboutPage, settingsPage,
};