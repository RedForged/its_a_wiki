'use strict';

const { h, avatar, fmtDate } = require('./base');

/**
 * Wiki-facing pages: hub, page view (with per-page + default CSS), edit,
 * history/diffs, categories, all pages, recent changes, media, special pages,
 * and member/admin consoles.
 */

function wikiLayout({ wiki, user, title, body, active, banner, flash, noShell }) {
  const admin = wiki.user_is_admin;
  const shell = noShell ? body : `
<div class="iaw-wiki-shell">
  <aside class="iaw-sidebar">
    <div class="iaw-sidebar-section">
      <div class="iaw-sidebar-title">Wiki</div>
      <a href="/w/${h(wiki.key)}" class="${active === 'home' ? 'iaw-active' : ''}"><span class="iaw-sidebar-icon">⌂</span> Home</a>
      <a href="/w/${h(wiki.key)}/all" class="${active === 'all' ? 'iaw-active' : ''}"><span class="iaw-sidebar-icon">▤</span> All pages</a>
      <a href="/w/${h(wiki.key)}/special/RecentChanges" class="${active === 'recent' ? 'iaw-active' : ''}"><span class="iaw-sidebar-icon">↻</span> Recent changes</a>
      <a href="/w/${h(wiki.key)}/special/Media" class="${active === 'media' ? 'iaw-active' : ''}"><span class="iaw-sidebar-icon">▧</span> Media</a>
      <a href="/w/${h(wiki.key)}/members" class="${active === 'members' ? 'iaw-active' : ''}"><span class="iaw-sidebar-icon">◎</span> Members</a>
      <a href="/w/${h(wiki.key)}/about" class="${active === 'about' ? 'iaw-active' : ''}"><span class="iaw-sidebar-icon">ⓘ</span> About</a>
    </div>
    <div class="iaw-sidebar-section">
      <div class="iaw-sidebar-title">Special pages</div>
      <a href="/w/${h(wiki.key)}/special/MissingPages" class="${active === 'missing' ? 'iaw-active' : ''}"><span class="iaw-sidebar-icon">?</span> Missing pages</a>
      <a href="/w/${h(wiki.key)}/special/Categories" class="${active === 'cats' ? 'iaw-active' : ''}"><span class="iaw-sidebar-icon">🏷️</span> Categories</a>
      <a href="/w/${h(wiki.key)}/special/WhatLinksHere" class="${active === 'links' ? 'iaw-active' : ''}"><span class="iaw-sidebar-icon">⇄</span> What links here</a>
    </div>
    ${admin ? `<div class="iaw-sidebar-section">
      <div class="iaw-sidebar-title">Tools</div>
      <a href="/w/${h(wiki.key)}/upload" class="${active === 'upload' ? 'iaw-active' : ''}"><span class="iaw-sidebar-icon">↑</span> Upload file</a>
      <a href="/w/${h(wiki.key)}/admin" class="${active === 'admin' ? 'iaw-active' : ''}"><span class="iaw-sidebar-icon">⚙</span> Admin console</a>
    </div>` : ''}
  </aside>
  <div class="iaw-wiki-main">${body}</div>
</div>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${h(title)} · ${h(wiki.name)}</title>
<link rel="stylesheet" href="/w/${h(wiki.key)}/wiki.css">
<link rel="stylesheet" href="/w/${h(wiki.key)}/default.css">
<link rel="icon" href="/static/favicon.svg" type="image/svg+xml">
</head>
<body class="iaw-wiki theme-${h(wiki.theme || 'dark')} ${banner || ''}" data-wiki-key="${h(wiki.key)}">
<header class="iaw-wikitop">
  <div class="iaw-wikitop-inner">
    <a class="iaw-wikilogo" href="/w/${h(wiki.key)}">
      <span class="iaw-wikilogo-badge">${h((wiki.name || '?')[0].toUpperCase())}</span>
      <span class="iaw-wikilogo-name">${h(wiki.name)}</span>
    </a>
    <div class="iaw-wikitop-right">
      <form action="/w/${h(wiki.key)}/search" method="get" class="iaw-wikisearch">
        <input type="search" name="q" placeholder="Search this wiki…" aria-label="Search this wiki">
      </form>
      ${user ? `<span class="iaw-userchip">${avatar(user.username)}<a href="/user/${h(encodeURIComponent(user.username))}">${h(user.username)}</a></span>
        <a class="iaw-btn iaw-btn-sm" href="/logout">Log out</a>`
        : `<a class="iaw-btn iaw-btn-sm" href="/login?next=/w/${h(wiki.key)}">Log in</a>`}
    </div>
  </div>
</header>
${flash ? `<div class="iaw-flash" role="status">${h(flash)}</div>` : ''}
${shell}
<footer class="iaw-wikifooter">
  <div class="iaw-wikifooter-inner">
    <span>${h(wiki.name)} on It's a Wiki! · <a href="/w/${h(wiki.key)}/about">about this wiki</a></span>
    <span>Powered by <a href="/">It's a Wiki!</a> — open source · no ads</span>
  </div>
</footer>
</body>
</html>`;
}

function wikiNavItems(wiki, active = '') {
  const items = [
    ['', 'Home', 'home'],
    ['/all', 'All pages', 'all'],
  ];
  return items.map(([suffix, label, key]) =>
    `<a class="iaw-wikinavitem${active === key ? ' iaw-active' : ''}" href="/w/${h(wiki.key)}${suffix}">${label}</a>`).join('');
}

/** The page-view wrapper: injects per-page CSS under the content rules. */
function pageShell({ wiki, user, page, requestedTitle, rendered, canEdit, isWatching, exists, flash }) {
  const pageCss = page && page.css ? `<style id="iaw-page-css">${page.css}</style>` : '';
  const title = page ? page.title : (requestedTitle || 'Missing page');
  let actions = '';
  if (user && page) {
    actions += `<a class="iaw-tab ${isWatching ? 'iaw-watching' : ''}" href="/w/${h(wiki.key)}/watch/${h(encodeURIComponent(page.title))}">${isWatching ? '★ Unwatch' : '☆ Watch'}</a>`;
  }
  if (canEdit && page) {
    actions += `<a class="iaw-tab" href="/w/${h(wiki.key)}/e/${h(encodeURIComponent(page.title))}">✎ Edit</a>`;
    actions += `<a class="iaw-tab" href="/w/${h(wiki.key)}/e/${h(encodeURIComponent(page.title))}?css=1">Design</a>`;
  }
  if (page) {
    actions += `<a class="iaw-tab" href="/w/${h(wiki.key)}/history/${h(encodeURIComponent(page.title))}">History</a>`;
  }
  if (wiki.user_is_admin && page) {
    actions += `<a class="iaw-tab iaw-tab-danger" href="/w/${h(wiki.key)}/delete/${h(encodeURIComponent(page.title))}">Delete</a>`;
  }

  const body = `
<div class="iaw-pageview ${exists ? 'iaw-exists' : 'iaw-missing'}">
  <div class="iaw-page-headbar">
    <h1 class="iaw-article-title">${h(title)}</h1>
    ${page && page.last_username ? `<span class="iaw-subline">Last edited by ${h(page.last_username)} · ${fmtDate(page.updated_at)}</span>` : ''}
  </div>
  <nav class="iaw-tabs" aria-label="Page actions">
    <a class="iaw-tab iaw-active" aria-current="page" href="/w/${h(wiki.key)}/p/${h(encodeURIComponent(title))}">Page</a>
    ${actions}
  </nav>
  <article class="iaw-article" id="iaw-article">
    ${exists ? `
      ${rendered.tocHtml || ''}
      <div class="iaw-article-body">${rendered.html}</div>
      ${rendered.categories && rendered.categories.length ? `<div class="iaw-categories"><span class="iaw-catlabel">Categories:</span> ${rendered.categories.map((c) => `<a class="iaw-catlink" href="/w/${h(wiki.key)}/c/${h(encodeURIComponent(c))}">${h(c)}</a>`).join('')}</div>` : ''}`
      : `<div class="iaw-missingpage">
          <p>This page doesn&rsquo;t exist yet.</p>
          ${canEdit ? `<a class="iaw-btn iaw-btn-primary" href="/w/${h(wiki.key)}/e/${h(encodeURIComponent(title))}">Create “${h(title)}”</a>` : '<p class="iaw-muted">Log in to create it.</p>'}
        </div>`}
    ${pageCss}
  </article>
</div>`;
  return wikiLayout({ wiki, user, title, body, active: 'home', flash });
}

function hubPage({ wiki, user, listing, listingEvents, flash }) {
  const body = `
<div class="iaw-hub">
  <section class="iaw-hub-hero">
    <div class="iaw-hub-hero-inner">
      <div class="iaw-wikilogo-badge iaw-big">${h((wiki.name || '?')[0].toUpperCase())}</div>
      <div>
        <h1>${h(wiki.name)}</h1>
        <p>${h(wiki.description || 'A wiki on It\'s a Wiki!')}</p>
        ${wiki.user_is_admin ? `<a class="iaw-btn iaw-btn-sm" href="/w/${h(wiki.key)}/admin">Admin console</a>` : ''}
      </div>
    </div>
  </section>
  <section class="iaw-section iaw-hub-listing">
    <div class="iaw-section-head"><h2>Browse pages</h2><a href="/w/${h(wiki.key)}/all">All pages →</a></div>
    ${listing.length ? `<div class="iaw-pagelist">${listing.map((p) => `
      <a class="iaw-pagecard" href="/w/${h(wiki.key)}/p/${h(encodeURIComponent(p.title))}">
        <b>${h(p.title)}</b>
        <span class="iaw-muted">${p.summary ? h(p.summary) : 'Last edited ' + fmtDate(p.updated_at)}</span>
      </a>`).join('')}</div>` : '<p class="iaw-empty">No pages yet. ' + (wiki.user_can_edit ? '<a href="/w/' + h(wiki.key) + '/e/Home">Create Home →</a>' : '') + '</p>'}
  </section>
  <section class="iaw-section">
    <div class="iaw-section-head"><h2>Recent changes</h2><a href="/w/${h(wiki.key)}/special/RecentChanges">More →</a></div>
    ${recentList(wiki, listingEvents, 6)}
  </section>
</div>`;
  return wikiLayout({ wiki, user, title: wiki.name, body, active: 'home', flash });
}

function recentList(wiki, events, limit) {
  const evs = (events || []).slice(0, limit);
  if (!evs.length) return '<p class="iaw-empty">Nothing yet.</p>';
  return `<div class="iaw-recent">${evs.map((e) => {
    const d = e.data || {};
    const link = e.type === 'page_created' || e.type === 'page_edited' || e.type === 'page_deleted'
      ? ` <a href="/w/${h(wiki.key)}/p/${h(encodeURIComponent(d.title || ''))}"><b>${h(d.title)}</b></a>` : '';
    return `<div class="iaw-recentitem">${avatar(e.username)}<div class="iaw-recentbody">
      <div>${h(e.username)} ${eventLabel(e.type)}${link}</div>
      <div class="iaw-recentmeta">${fmtDate(e.at)}</div>
    </div></div>`;
  }).join('')}</div>`;
}

function eventLabel(t) {
  return { page_created: 'created', page_edited: 'edited', page_deleted: 'deleted',
    media_uploaded: 'uploaded', media_replaced: 'updated file', wiki_created: 'founded the wiki' }[t] || t;
}

function allPagesPage({ wiki, user, pages, letter }) {
  const body = `
<div class="iaw-page iaw-narrow2">
  <div class="iaw-page-head"><h1>All pages</h1><span class="iaw-muted">${pages.length} page${pages.length === 1 ? '' : 's'}</span></div>
  <div class="iaw-letterbar">${'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((L) =>
    `<a class="${letter === L ? 'iaw-active' : ''}" href="/w/${h(wiki.key)}/all?l=${L}">${L}</a>`).join('')}</div>
  <div class="iaw-pagelist">${pages.map((p) => `
    <a class="iaw-pagecard" href="/w/${h(wiki.key)}/p/${h(encodeURIComponent(p.title))}">
      <b>${h(p.title)}</b><span class="iaw-muted">${fmtDate(p.updated_at)}</span>
    </a>`).join('')}</div>
  ${!pages.length ? '<p class="iaw-empty">No pages here yet.</p>' : ''}
</div>`;
  return wikiLayout({ wiki, user, title: 'All pages', body, active: 'all' });
}

function categoryPage({ wiki, user, category, pages }) {
  const body = `
<div class="iaw-page iaw-narrow2">
  <div class="iaw-page-head"><h1>Category: ${h(category)}</h1><span class="iaw-muted">${pages.length} member${pages.length === 1 ? '' : 's'}</span></div>
  <div class="iaw-pagelist">${pages.map((p) => `
    <a class="iaw-pagecard" href="/w/${h(wiki.key)}/p/${h(encodeURIComponent(p.title))}">
      <b>${h(p.title)}</b><span class="iaw-muted">${fmtDate(p.updated_at)}</span>
    </a>`).join('')}</div>
  ${!pages.length ? '<p class="iaw-empty">Empty category.</p>' : ''}
</div>`;
  return wikiLayout({ wiki, user, title: 'Category: ' + category, body, active: 'cats' });
}

function templatePage({ wiki, user, page, rendered, canEdit }) {
  const body = `
<div class="iaw-page iaw-narrow2">
  <div class="iaw-page-head"><h1>Template: ${h(page.title)}</h1>
    ${canEdit ? `<a class="iaw-btn iaw-btn-primary" href="/w/${h(wiki.key)}/e/${h(encodeURIComponent(page.title))}">Edit template</a>` : ''}
  </div>
  <p class="iaw-muted">This page is transcluded by <code>{{${h(page.title.replace(/^Template:/, ''))}}}</code>. For a list of pages using it, see <a href="/w/${h(wiki.key)}/special/WhatLinksHere?target=${h(encodeURIComponent(page.title))}">What links here</a>.</p>
  <div class="iaw-article-body iaw-template-usage">${rendered.html}</div>
</div>`;
  return wikiLayout({ wiki, user, title: 'Template:' + page.title, body, active: 'all' });
}

/** Edit form — wikitext textarea + optional CSS panel. */
function editPage({ wiki, user, page, pageTitle, isNew, cssMode, preview, error, canEdit, isAdmin }) {
  if (!canEdit) {
    const body = `<div class="iaw-page"><h1>Page protected</h1><p>Only admins/editors can edit on this wiki.</p></div>`;
    return wikiLayout({ wiki, user, title: 'Protected', body });
  }
  const title = page ? page.title : (pageTitle || '');
  const content = page ? page.content : '';
  const css = (page && page.css) || '';
  const previewHtml = preview ? preview.html : '';
  const previewCats = preview ? preview.categories : [];
  const body = `
<div class="iaw-editpage">
  <div class="iaw-edit-head">
    <h1>${cssMode ? 'Edit CSS for' : isNew ? 'Create' : 'Edit'} <span>${h(title)}</span></h1>
    ${cssMode ? '' : `<a class="iaw-btn iaw-btn-sm" href="/w/${h(wiki.key)}/e/${h(encodeURIComponent(title))}?css=1">CSS panel →</a>`}
  </div>
  ${error ? `<div class="iaw-error">${h(error)}</div>` : ''}
  ${previewHtml ? `
    <div class="iaw-preview">
      <h2>Preview</h2>
      <div class="iaw-article-body">${previewHtml}</div>
      ${previewCats.length ? `<div class="iaw-categories">Categories: ${previewCats.map((c) => `<a href="/w/${h(wiki.key)}/c/${h(encodeURIComponent(c))}">${h(c)}</a>`).join(', ')}</div>` : ''}
    </div>` : ''}
  <form method="post" class="iaw-form" action="/w/${h(wiki.key)}/e/${h(encodeURIComponent(title))}">
    <input type="hidden" name="title" value="${h(title)}">
    <input type="hidden" name="css_mode" value="${cssMode ? '1' : '0'}">
    ${cssMode ? `<label><b>Page CSS</b> <span class="iaw-muted">(applies <i>only to this page</i>, overrides the wiki default)</span>
      <textarea name="css" class="iaw-css-editor" rows="16" spellcheck="false" placeholder=".iaw-article-title { color: #e02030; }
/* You can style anything that has an iaw- class, e.g. tables, images, links… */">${h(css)}</textarea>
    </label>`
    : `<label><b>Wikitext</b> <span class="iaw-muted">(full syntax: [[links]], == headers ==, {{templates}}, tables, [[File:…]]…)</span>
      <textarea name="content" class="iaw-wikitext-editor" rows="22" spellcheck="true">${h(content)}</textarea>
    </label>`}
    <label>Edit summary <span class="iaw-muted">(short)</span>
      <input name="summary" maxlength="300" placeholder="Describe your change" value="${h(page ? page.summary || '' : '')}">
    </label>
    <div class="iaw-edit-actions">
      <button class="iaw-btn iaw-btn-primary" type="submit" name="action" value="save">Save page</button>
      <button class="iaw-btn" type="submit" name="action" value="preview">Preview</button>
      <a class="iaw-btn" href="/w/${h(wiki.key)}/p/${h(encodeURIComponent(title))}">Cancel</a>
    </div>
  </form>
  <div class="iaw-edittips">
    <h3>Quick reference</h3>
    <ul>
      <li><code>'''bold'''</code> · <code>''italic''</code></li>
      <li><code>[[Page name]]</code> link · <code>[[Page name|label]]</code></li>
      <li><code>== Heading ==</code> (upto 6 =)</li>
      <li><code>[[File:img.jpg|thumb|caption]]</code> image</li>
      <li><code>{{Template|arg=value}}</code> template</li>
      <li><code>[[Category:Name]]</code> categories</li>
      <li>Tables: <code>{|</code> … <code>|}</code></li>
      <li><code>* item</code> bullet · <code># item</code> numbered · <code>#REDIRECT [[Target]]</code></li>
    </ul>
  </div>
</div>`;
  return wikiLayout({ wiki, user, title: 'Editing ' + title, body });
}

function historyPage({ wiki, user, page, revisions }) {
  const revRows = revisions.map((r, ix) => `
    <tr>
      <td><a href="/w/${h(wiki.key)}/diff/${h(encodeURIComponent(page.title))}?from=${r.rev}&to=${ix === 0 ? 0 : revisions[ix - 1].rev}">diff</a></td>
      <td><a href="/w/${h(wiki.key)}/rev/${h(encodeURIComponent(page.title))}/${r.rev}">${r.rev}</a></td>
      <td>${avatar(r.username)} ${h(r.username)}</td>
      <td>${h(r.summary || '')}</td>
      <td>${fmtDate(r.created_at)}</td>
    </tr>`).join('');
  const body = `
<div class="iaw-page iaw-narrow2">
  <div class="iaw-page-head"><h1>History: ${h(page.title)}</h1>
    <a class="iaw-btn iaw-btn-sm" href="/w/${h(wiki.key)}/p/${h(encodeURIComponent(page.title))}">Back to page</a>
  </div>
  <table class="iaw-table iaw-history">
    <thead><tr><th>Diff</th><th>Rev</th><th>Editor</th><th>Summary</th><th>Time</th></tr></thead>
    <tbody>${revRows}</tbody>
  </table>
  ${!revisions.length ? '<p class="iaw-empty">No revisions yet.</p>' : ''}
</div>`;
  return wikiLayout({ wiki, user, title: 'History: ' + page.title, body, active: 'home' });
}

function diffPage({ wiki, user, page, revA, revB, htmlA, htmlB }) {
  const body = `
<div class="iaw-page iaw-wide">
  <div class="iaw-page-head"><h1>Diff: ${h(page.title)}</h1>
    <a class="iaw-btn iaw-btn-sm" href="/w/${h(wiki.key)}/p/${h(encodeURIComponent(page.title))}">Back to page</a>
  </div>
  <div class="iaw-diffmeta">
    <span>Rev ${revB.rev} by <b>${h(revB.username)}</b> (${fmtDate(revB.created_at)})</span>
    <span>← Rev ${revA.rev} by <b>${h(revA.username)}</b> (${fmtDate(revA.created_at)})</span>
  </div>
  <div class="iaw-diffrow">
    <div class="iaw-diffcol"><h3>Before</h3><div class="iaw-article-body">${htmlA}</div></div>
    <div class="iaw-diffcol"><h3>After</h3><div class="iaw-article-body">${htmlB}</div></div>
  </div>
</div>`;
  return wikiLayout({ wiki, user, title: 'Diff', body });
}

function recentChangesPage({ wiki, user, events }) {
  const body = `
<div class="iaw-page iaw-narrow2">
  <div class="iaw-page-head"><h1>Recent changes</h1></div>
  <div class="iaw-recent">${(events || []).map((e) => {
    const d = e.data || {};
    const link = ['page_created', 'page_edited'].includes(e.type)
      ? `<a href="/w/${h(wiki.key)}/p/${h(encodeURIComponent(d.title || ''))}"><b>${h(d.title)}</b></a>` : h(d.title || '');
    return `<div class="iaw-recentitem">${avatar(e.username)}<div class="iaw-recentbody">
      <div><b>${h(e.username)}</b> ${eventLabel(e.type)} ${link} ${d.rev ? `<span class="iaw-muted">(rev ${d.rev})</span>` : ''}</div>
      <div class="iaw-recentmeta">${fmtDate(e.at, { time: true })}</div>
    </div></div>`;
  }).join('')}</div>
  ${!events.length ? '<p class="iaw-empty">Nothing yet.</p>' : ''}
</div>`;
  return wikiLayout({ wiki, user, title: 'Recent changes', body, active: 'recent' });
}

function mediaPage({ wiki, user, listing, canEdit }) {
  const body = `
<div class="iaw-page">
  <div class="iaw-page-head"><h1>Media</h1>
    ${canEdit ? `<a class="iaw-btn iaw-btn-primary" href="/w/${h(wiki.key)}/upload">Upload file</a>` : ''}
  </div>
  <div class="iaw-mediagrid">${listing.map((m) => `
    <div class="iaw-mediacard">
      <a href="/w/${h(wiki.key)}/f/${h(encodeURIComponent(m.name))}" class="iaw-media-thumb">
        ${m.kind === 'image' ? `<img src="/w/${h(wiki.key)}/f/${h(encodeURIComponent(m.name))}/raw" alt="${h(m.name)}" loading="lazy">` : `<span class="iaw-fileicon">${h(m.name.split('.').pop().toUpperCase())}</span>`}
      </a>
      <div class="iaw-mediainfo">
        <b>${h(m.name)}</b>
        <span class="iaw-muted">${h(m.type)} · ${m.humanSize}</span>
        <span class="iaw-muted">by ${h(m.uploader || '?')}</span>
      </div>
    </div>`).join('')}</div>
  ${!listing.length ? '<p class="iaw-empty">No files yet.</p>' : ''}
</div>`;
  return wikiLayout({ wiki, user, title: 'Media', body, active: 'media' });
}

function filePage({ wiki, user, media, canEdit }) {
  const isImg = (media.type || '').startsWith('image/');
  const body = `
<div class="iaw-page iaw-narrow2">
  <div class="iaw-page-head"><h1>File: ${h(media.name)}</h1>
    ${canEdit ? `<a class="iaw-btn iaw-btn-primary" href="/w/${h(wiki.key)}/upload?over=${h(encodeURIComponent(media.name))}">Replace</a>` : ''}
  </div>
  <div class="iaw-fileview">
    ${isImg ? `<a href="/w/${h(wiki.key)}/f/${h(encodeURIComponent(media.name))}/raw"><img src="/w/${h(wiki.key)}/f/${h(encodeURIComponent(media.name))}/raw" alt="${h(media.name)}"></a>`
      : `<a class="iaw-btn" href="/w/${h(wiki.key)}/f/${h(encodeURIComponent(media.name))}/raw">Download</a>`}
    <dl class="iaw-filedl">
      <dt>Type</dt><dd>${h(media.type)}</dd>
      <dt>Size</dt><dd>${h(media.humanSize || '')}</dd>
      <dt>Uploaded</dt><dd>${fmtDate(media.created_at)} by ${h(media.uploader || '?')}</dd>
      <dt>Revisions</dt><dd>${media.rev}</dd>
    </dl>
    <p class="iaw-muted">Embed on a page with: <code>[[File:${h(media.name)}|thumb|Your caption]]</code></p>
  </div>
</div>`;
  return wikiLayout({ wiki, user, title: 'File: ' + media.name, body, active: 'media' });
}

function specialPage({ wiki, user, name, body }) {
  const activeMap = {
    RecentChanges: 'recent',
    AllPages: 'all',
    MissingPages: 'missing',
    Categories: 'cats',
    WhatLinksHere: 'links',
    Media: 'media',
  };
  return wikiLayout({ wiki, user, title: 'Special: ' + name, body, active: activeMap[name] || 'all' });
}

/** Admin console for wiki owners/admins. */
function wikiAdminPage({ wiki, user, users, events, error, ok }) {
  const body = `
<div class="iaw-page iaw-narrow2">
  <div class="iaw-page-head"><h1>Admin · ${h(wiki.name)}</h1></div>
  ${error ? `<div class="iaw-error">${h(error)}</div>` : ''}${ok ? `<div class="iaw-flash">${h(ok)}</div>` : ''}

  <section class="iaw-card">
    <h2>Wiki settings</h2>
    <form method="post" action="/w/${h(wiki.key)}/admin" class="iaw-form">
      <label>Display name<input name="name" maxlength="120" value="${h(wiki.name)}"></label>
      <label>Description<textarea name="description" rows="2" maxlength="400">${h(wiki.description || '')}</textarea></label>
      <label>Theme<select name="theme">
        ${['dark', 'forest'].map((t) => `<option ${wiki.theme === t || (!wiki.theme && t === 'dark') ? 'selected' : ''}>${t}</option>`).join('')}
      </select></label>
      <label class="iaw-checkline"><input type="checkbox" name="private" ${wiki.visibility === 'private' ? 'checked' : ''}> Private wiki (only members can view)</label>
      <button class="iaw-btn iaw-btn-primary" name="save_settings" value="1">Save settings</button>
    </form>
  </section>

  <section class="iaw-card">
    <h2>Wiki default CSS</h2>
    <p class="iaw-muted">Applies to every page in this wiki. Per-page CSS overrides it. Validated before saving (no url(), no @import).</p>
    <form method="post" action="/w/${h(wiki.key)}/admin" class="iaw-form">
      <textarea name="default_css" class="iaw-css-editor" rows="10" spellcheck="false">${h(wiki.default_css || '')}</textarea>
      <button class="iaw-btn iaw-btn-primary" name="save_css" value="1">Save default CSS</button>
    </form>
  </section>

  <section class="iaw-card">
    <h2>Members</h2>
    <table class="iaw-table">
      <thead><tr><th>User</th><th>Role</th><th>Actions</th></tr></thead>
      <tbody>${users.map((u) => `
        <tr>
          <td>${avatar(u.username)} ${h(u.username)}</td>
          <td>${u.id === wiki.owner_id ? '<b>Owner</b>' : (wiki.admins || []).includes(u.id) ? 'Admin' : (wiki.editors || []).includes(u.id) ? 'Editor' : (wiki.banned || []).includes(u.id) ? '<span class="iaw-banned">Banned</span>' : ''}</td>
          <td>
            ${u.id !== user.id ? `<form method="post" action="/w/${h(wiki.key)}/admin" class="iaw-inline-form">
              <input type="hidden" name="target" value="${h(u.username)}">
              <button class="iaw-btn iaw-btn-xs" name="set_role" value="admin" ${(wiki.admins || []).includes(u.id) ? 'disabled' : ''}>Admin</button>
              <button class="iaw-btn iaw-btn-xs" name="set_role" value="editor" ${(wiki.editors || []).includes(u.id) ? 'disabled' : ''}>Editor</button>
              <button class="iaw-btn iaw-btn-xs" name="set_role" value="none" ${![...wiki.admins, ...wiki.editors].includes(u.id) ? 'disabled' : ''}>Remove</button>
              <button class="iaw-btn iaw-btn-xs iaw-btn-danger" name="set_role" value="ban" ${(wiki.banned || []).includes(u.id) ? 'disabled' : ''}>Ban</button>
              <button class="iaw-btn iaw-btn-xs" name="set_role" value="unban" ${!(wiki.banned || []).includes(u.id) ? 'disabled' : ''}>Unban</button>
            </form>` : '<span class="iaw-muted">you</span>'}
          </td>
        </tr>`).join('')}
      </tbody>
    </table>
    <form method="post" action="/w/${h(wiki.key)}/admin" class="iaw-form iaw-inline-row">
      <input name="add_user" placeholder="username to add as editor">
      <button class="iaw-btn" name="action" value="add_editor">Add editor</button>
    </form>
  </section>

  <section class="iaw-card">
    <h2>Danger zone</h2>
    <form method="post" action="/w/${h(wiki.key)}/admin" class="iaw-form">
      <label>Type the wiki key <b>${h(wiki.key)}</b> to confirm deletion
        <input name="confirm_key" placeholder="${h(wiki.key)}"></label>
      <button class="iaw-btn iaw-btn-danger" name="delete_wiki" value="1">Delete this wiki (permanent)</button>
    </form>
  </section>
</div>`;
  return wikiLayout({ wiki, user, title: 'Admin', body, active: 'admin' });
}

function membersPage({ wiki, user, users }) {
  const body = `<div class="iaw-page iaw-narrow2"><h1>Members</h1>
    <div class="iaw-pagelist">${users.map((u) => `<div class="iaw-pagecard">${avatar(u.username)} <b>${h(u.username)}</b> <span class="iaw-muted">${u.id === wiki.owner_id ? 'owner' : (wiki.admins || []).includes(u.id) ? 'admin' : (wiki.editors || []).includes(u.id) ? 'editor' : ''}</span></div>`).join('')}</div>
  </div>`;
  return wikiLayout({ wiki, user, title: 'Members', body, active: 'members' });
}

module.exports = {
  wikiLayout, pageShell, hubPage, allPagesPage, categoryPage, templatePage,
  editPage, historyPage, diffPage, recentChangesPage, mediaPage, filePage,
  specialPage, wikiAdminPage, membersPage, recentList,
};