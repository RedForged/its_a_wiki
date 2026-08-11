'use strict';

const { escapeHtml, ts, humanSize, colorFor } = require('../util');

/**
 * Views: plain-JS HTML string builders. No template engine dependency.
 * `h()` = escape helper.
 */

function h(s) { return escapeHtml(s); }
function attr(s) { return escapeHtml(s); }

function avatar(name, size = 28) {
  const color = colorFor(name || '?');
  return `<span class="iaw-avatar" style="background:${color}" title="${h(name || '')}" data-name="${h(name || '')}">${h((name || '?')[0].toUpperCase())}</span>`;
}

function fmtDate(iso, opts = {}) {
  if (!iso) return '—';
  const d = new Date(iso);
  const now2 = new Date();
  const diff = now2 - d;
  const rel = opts.relative !== false;
  if (rel) {
    const min = Math.floor(diff / 60000);
    if (min < 1) return 'just now';
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    const day = Math.floor(hr / 24);
    if (day < 7) return `${day}d ago`;
  }
  return d.toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' }) +
    (opts.time ? ' ' + d.toTimeString().slice(0, 5) : '');
}

function wantlist(recent) {
  return recent.map((e) => ({ ...e, humanDate: fmtDate(e.at) }));
}

/** Top-level layout shared by instance pages (not wiki pages). */
function instanceLayout({ title, user, settings, currentUser, banner, body, flash, activeNav = '' }) {
  const nav = navItems(user, activeNav);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${h(title)} · It's a Wiki!</title>
<link rel="stylesheet" href="/static/app.css">
<link rel="icon" href="/static/favicon.svg" type="image/svg+xml">
</head>
<body class="iaw-instance ${banner === 'creator' ? 'iaw-creator' : ''}">
<header class="iaw-topbar">
  <div class="iaw-topbar-inner">
    <a class="iaw-logo" href="/">
      <svg viewBox="0 0 32 32" width="24" height="24" aria-hidden="true"><path d="M6 4h14l6 6v18H6z" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M14 11v10l4-3 4 3V11" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>
      <span class="iaw-logotype">It&rsquo;s a&nbsp;Wiki!</span>
    </a>
    <nav class="iaw-nav">
      ${navItems(user, activeNav)}
    </nav>
    <div class="iaw-topbar-right">
      <form action="/search" method="get" class="iaw-topsearch">
        <input type="search" name="q" placeholder="Search wikis…" aria-label="Search wikis">
      </form>
      ${user ? `<div class="iaw-userchip">${avatar(user.username)}<span>${h(user.username)}</span><a class="iaw-btn iaw-btn-sm" href="/logout">Log out</a></div>`
        : `<a class="iaw-btn" href="/login">Log in</a> <a class="iaw-btn iaw-btn-primary" href="/signup">Join</a>`}
    </div>
  </div>
</header>
${flash ? `<div class="iaw-flash">${h(flash)}</div>` : ''}
${body}
<footer class="iaw-footer">
  <div class="iaw-footer-inner">
    <span><b>It's a Wiki!</b> — the open-source, self-hostable home for wikis.</span>
    <span>Everyone can start a wiki. Admins control how many. <a href="/about">About</a></span>
  </div>
</footer>
</body>
</html>`;
}

function navItems(user, active = '') {
  const items = [
    ['/', 'Explore', 'explore'],
    ['/wikis', 'Wikis', 'wikis'],
    ['/recent', 'Recent activity', 'recent'],
  ];
  if (user) {
    items.push([`/user/${encodeURIComponent(user.username)}`, 'My wikis', 'mine']);
    if (user.is_admin) items.push(['/admin', 'Admin', 'admin']);
  }
  return items.map(([href, label, key]) =>
    `<a class="iaw-navitem${active === key ? ' iaw-active' : ''}" href="${href}">${label}</a>`).join('');
}

function instanceIndex({ featuredWikis, newest, stats, settings, user, recent }) {
  const body = `
<main class="iaw-home">
  <section class="iaw-hero">
    <div class="iaw-hero-inner">
      <h1>Every wiki starts here.</h1>
      <p class="iaw-hero-sub">It&rsquo;s a Wiki! is a free, open-source home for your community&rsquo;s knowledge —
        full wikitext, your own per-page CSS, and none of the ad-clutter.</p>
      <div class="iaw-hero-actions">
        <a class="iaw-btn iaw-btn-primary iaw-btn-lg" href="${user ? '/create' : '/signup'}">${user ? 'Create a wiki' : 'Join & create a wiki'} →</a>
        <a class="iaw-btn iaw-btn-lg" href="#browse">Browse wikis</a>
      </div>
      <div class="iaw-hero-stats">
        <span><b>${stats.wikis}</b> wikis</span>
        <span><b>${stats.pages}</b> pages</span>
        <span><b>${stats.edits}</b> edits</span>
        <span><b>${stats.users}</b> users</span>
      </div>
    </div>
  </section>
  <section class="iaw-section" id="browse">
    <div class="iaw-section-head"><h2>Featured wikis</h2><a href="/wikis">See all →</a></div>
    <div class="iaw-wikigrid">
      ${featuredWikis.length ? featuredWikis.map(wikiCard).join('') : '<p class="iaw-empty">No wikis yet — be the first!</p>'}
    </div>
  </section>
  <section class="iaw-section">
    <div class="iaw-section-head"><h2>Newest additions</h2><a href="/recent">All activity →</a></div>
    ${recentRows(recent)}
  </section>
</main>`;
  return instanceLayout({ title: 'Explore', user, body, activeNav: 'explore' });
}

function wikiCard(w) {
  const initial = (w.name || w.key || '?')[0].toUpperCase();
  return `<a class="iaw-wikicard" href="/w/${h(w.key)}">
    <div class="iaw-wikicard-badge">${h(initial)}</div>
    <div class="iaw-wikicard-body">
      <h3>${h(w.name || w.key)}</h3>
      <p>${h(w.description || 'A brand-new wiki.')}</p>
      <span class="iaw-wikicard-meta">${w.stats ? `${w.stats.pages} pages · ${w.stats.edits} edits` : 'new'} · ${fmtDate(w.created_at)}</span>
    </div>
  </a>`;
}

function recentRows(events, wikiKey = null) {
  if (!events || !events.length) return '<p class="iaw-empty">Nothing yet.</p>';
  return `<div class="iaw-recent">${events.map((e) => {
    const e2 = wantlist([e])[0];
    const wiki = e.wikiKey ? `<a class="iaw-wiki-link" href="/w/${h(e.wikiKey)}">${h(e.wikiName || e.wikiKey)}</a> · ` : '';
    let action = eventAction(e);
    return `<div class="iaw-recentitem">
      ${avatar(e.username)}
      <div class="iaw-recentbody">
        <div>${action}</div>
        <div class="iaw-recentmeta">${wiki}${h(e.username)} · ${fmtDate(e.at)}</div>
      </div>
    </div>`;
  }).join('')}</div>`;
}

function eventAction(e) {
  const d = e.data || {};
  const user = `<b>${h(e.username)}</b>`;
  switch (e.type) {
    case 'wiki_created': return `${user} created wiki <b>${h(e.wikiName || d.name || d.key)}</b>`;
    case 'page_created': return `${user} created page <a href="/w/${h(e.wikiKey)}/p/${h(encodeURIComponent(d.title || ''))}"><b>${h(d.title)}</b></a>`;
    case 'page_edited': return `${user} edited <a href="/w/${h(e.wikiKey)}/p/${h(encodeURIComponent(d.title || ''))}"><b>${h(d.title)}</b></a>`;
    case 'page_deleted': return `${user} deleted page <b>${h(d.title)}</b>`;
    case 'media_uploaded': return `${user} uploaded <b>${h(d.name)}</b>`;
    case 'media_replaced': return `${user} updated file <b>${h(d.name)}</b>`;
    case 'wiki_joined': return `${user} joined wiki <b>${h(e.wikiName || '')}</b>`;
    default: return `${user} ${h(e.type)}`;
  }
}

module.exports = {
  h, attr, avatar, fmtDate, wantlist,
  instanceLayout, instanceIndex, wikiCard, recentRows, eventAction,
};