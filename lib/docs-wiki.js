'use strict';

/**
 * Auto-generated documentation wiki.
 * On first boot (or when no docs wiki exists), creates a "Documentation" wiki
 * pre-populated with pages explaining how to use the wiki.
 *
 * Call ensureDocsWiki(db, app, admin) from server.js after ensureAdmin().
 */

const { uid, ts } = require('./util');

const DOCS_KEY = 'docs';

const PAGES = {
  Home: `== Welcome to It's a Wiki! ==

This wiki documents itself — it's a living manual for the software that powers it.

== What is It's a Wiki? ==

It's a Wiki! is an open-source, self-hostable Fandom successor. Everyone can create
their own wiki, write in full wikitext, and — the part Fandom makes painful — style
'''every individual page''' (and whole wikis) with your own CSS, effortlessly.

== Getting started ==

# Sign up for an account
# Create or join a wiki
# Edit your first page — save, preview, and publish!
# Customize the look with per-page CSS

== Navigation ==

Browse pages from the sidebar: Home, All pages, Recent changes, Media, Members, and
the special pages (Missing pages, Categories, What links here).

[[Category:Documentation]]`,

  Wikitext: `== Wikitext reference ==

It's a Wiki! uses a lightweight wikitext syntax inspired by MediaWiki/Fandom.

== Text formatting ==

<pre>'''bold'''  ''italic''  '''''bold italic'''''  ++underline++  --strikethrough--
</pre>

Renders as: '''bold''' text, ''italic'' text, '''''bold italic''''' text, ++underline++, --strikethrough--.
Inline HTML tags like &lt;u&gt;, &lt;s&gt;, &lt;sub&gt;, &lt;sup&gt;, &lt;code&gt; also work.

== Links ==

[[Page name]] — link to a page
Syntax: <nowiki>[[Page name|custom label]]</nowiki> — link with custom text
Syntax: <nowiki>[[Page name|]]</nowiki> — pipe trick (uses last segment as the label)
Syntax: <nowiki>[https://example.com label]</nowiki> — external link (opens in a new tab)

== Headings ==

<pre>== Level 2 ==
=== Level 3 ===
</pre>
Works up to 6 levels. Headings automatically generate a table of contents.

== Lists ==

* Bullet list
** Nested bullets
# Numbered list
## Nested numbered
; term : definition

Horizontal rule — four or more dashes on a line:<pre>----
</pre>

== Images and files ==

[[File:photo.jpg]] — inline image
Syntax: <nowiki>[[File:photo.jpg|thumb|Caption text]]</nowiki> — thumbnail with caption
Syntax: <nowiki>[[File:photo.jpg|100px]]</nowiki> — fixed width
Syntax: <nowiki>[[File:photo.jpg|right]]</nowiki> — alignment (left/right/center/none)

Browse all uploaded files at the Media page.

== Templates and transclusion ==

<nowiki>{{Template name|arg1|arg2|key=value}}</nowiki> transcludes a page from the Template: namespace.
Parameters use <nowiki>{{{1}}}</nowiki> (positional) or <nowiki>{{{name|default}}}</nowiki> (named with default).
Magic words: <nowiki>{{PAGENAME}}</nowiki>, <nowiki>{{FULLPAGENAME}}</nowiki>, <nowiki>{{SITENAME}}</nowiki>,
<nowiki>{{CURRENTYEAR}}</nowiki>, <nowiki>{{CURRENTMONTH}}</nowiki>, <nowiki>{{CURRENTDAY}}</nowiki>.

== Categories ==

<nowiki>[[Category:Name]]</nowiki> adds the page to a category; it appears at the bottom.
Each category gets its own index page at /w/<wiki>/c/<name>.

== Tables ==

<pre>{| class="wikitable"
! Header 1 !! Header 2
|-
| Cell 1 || Cell 2
|-
| Cell 3 || Cell 4
|}</pre>

== Redirects ==

<pre>#REDIRECT [[Target Page]]</pre>

== References ==

Text with a footnote &lt;ref&gt;Source&lt;/ref&gt;.
Place &lt;references/&gt; where you want the list to appear.

== Raw text ==

&lt;nowiki&gt;...&lt;/nowiki&gt; — escape all wikitext.
&lt;pre&gt;...&lt;/pre&gt; — preformatted block.
&lt;code&gt;...&lt;/code&gt; — inline code.

== Page CSS ==

On any page, click Edit → "CSS panel" (or append ?css=1) to write CSS scoped
to that page. The wiki also has a default CSS managed by the wiki owner.

[[Category:Documentation]]`,

  Editing: `== Editing pages ==

== How to edit ==

Every page has an "Edit" tab. Make your changes in the wikitext textarea and click
"Preview" to check before saving. A short edit summary helps others understand your change.

== Watching pages ==

Click the star (☆) on any page to add it to your watchlist. The star turns solid (★)
when watched. Recent changes to watched pages are highlighted.

== Page history ==

Every edit creates a revision. The History tab shows all revisions with diffs,
so you can compare any two versions and revert if needed.

== Creating pages ==

Visiting a non-existent page shows a "Create it" button. Alternatively, just start
linking to [[New Page]] from an existing page — it becomes a missing-page link you
can click through to create.

== Deleting pages ==

Wiki admins and owners can delete pages. Deleted pages are hidden but their history
is preserved for potential undeletion.

[[Category:Documentation]]`,

  CSS: `== Custom CSS ==

It's a Wiki! makes CSS a first-class editor control — no developer account needed.
Three layers of styling exist, from broadest to narrowest:

* Wiki default CSS — set by the wiki owner/admin in the wiki admin console, applies to every page.
* Per-page CSS — written on any page via Edit → "CSS panel" (or ?css=1), applies only to that page.
* Inline HTML — &lt;span style="…"&gt;, &lt;div style="…"&gt; etc. in wikitext (attributes are sanitized).

Per-page CSS overrides wiki CSS because it is injected later in the cascade.
Both are served from text/css routes only — they can never execute as script.

== Where to write CSS ==

* Wiki-wide: Admin console → "Wiki default CSS" textarea.
* Single page: Edit the page → "CSS panel" button (or append ?css=1 to the edit URL).
* Inline: use &lt;span style="color:red"&gt; in wikitext — allowed on a safe allowlist
  of properties, values stripped of ; { } &lt; &gt;.

== CSS variables (themes) ==

Every page exposes these CSS custom properties on :root / body. You can override
any of them in your wiki CSS to re-theme the whole wiki:

<pre>--iaw-bg:             page background
--iaw-panel:          cards, article, forms
--iaw-sidebar-bg:     left navigation rail
--iaw-ink:            default text color
--iaw-muted:          secondary text
--iaw-line:           borders & dividers
--iaw-accent:         links, buttons, active nav
--iaw-accent-ink:     text on accent background
--iaw-heading:        heading color
--iaw-hero-bg:        wiki hub hero gradient
--iaw-hover:          hover highlight
--iaw-th-bg:          table header background
--iaw-zebra:          alternating table row
--iaw-code-bg:        inline code background
--iaw-pre-bg:         preformatted block background
--iaw-preview-bg:     preview pane background
--iaw-redirect-bg:    redirect banner background
--iaw-redirect-line:  redirect banner border
--iaw-redirect-ink:   redirect banner text
--iaw-blockquote-bg:  blockquote background
--iaw-article-width:  max content width
--iaw-card-shadow:    default card shadow
--iaw-card-shadow-hover: card hover shadow</pre>

To re-theme the whole wiki, just override the variables:

<pre>:root {
  --iaw-bg: #f5f2ee;
  --iaw-panel: #ffffff;
  --iaw-ink: #241f18;
  --iaw-accent: #8a4b08;
  --iaw-heading: #1a140e;
  --iaw-line: #d8d2c8;
}</pre>

Built-in themes (dark, forest) are applied via <code>body.theme-dark</code> /
<code>body.theme-forest</code> — they only swap these variables, so overriding
variables beats theme selection.

== Selectors you can style ==

=== Layout & chrome ===

<pre>body                — the whole page (background, font)
body.theme-dark     — dark theme wrapper
body.theme-forest   — forest theme wrapper
.iaw-wikitop        — sticky top bar (logo, search, user chip)
.iaw-wikitop-inner  — top bar inner container
.iaw-wikilogo       — wiki name in the top bar
.iaw-wikilogo-badge — the colored logo square
.iaw-wikilogo-name  — the logo text
.iaw-wikisearch     — top bar search form
.iaw-userchip       — logged-in user chip
.iaw-wiki-shell     — the two-column shell (sidebar + content)
.iaw-sidebar        — left navigation rail
.iaw-sidebar-title  — sidebar section headers ("Wiki", "Special pages")
.iaw-sidebar a      — sidebar links
.iaw-sidebar a.iaw-active — current page link
.iaw-wiki-main      — main content column
.iaw-wikifooter     — page footer</pre>

=== Article page ===

<pre>.iaw-pageview       — page view wrapper
.iaw-page-headbar   — title + subtitle row
.iaw-article-title  — the big page title
.iaw-subline        — "Last edited by …" line
.iaw-tabs           — action tab bar (Page, Edit, History…)
.iaw-tab            — a single tab
.iaw-tab.iaw-active — the current tab
.iaw-tab.iaw-watching — watched-page star tab
.iaw-tab.iaw-tab-danger — the Delete tab
.iaw-article        — the article card
.iaw-article-body   — rendered wikitext content
.iaw-toc            — table of contents box
.iaw-toc-title      — "Contents" heading
.iaw-toc li[data-level="2|3"] — TOC indentation levels</pre>

=== Content elements ===

<pre>.iaw-article-body h1 … h6 — headings
.iaw-article-body p       — paragraphs
.iaw-article-body a       — links (also .iaw-link)
.iaw-link          — internal wiki links
.iaw-link.iaw-missing — red links to non-existent pages
.iaw-extlink       — external links (open in new tab)
.iaw-table         — wikitext tables (both in-article and standalone)
.iaw-table th      — header cells
.iaw-table td      — data cells
.iaw-img           — images
.iaw-figure        — thumb/framed figure wrapper
.iaw-figure.align-left/.align-right/.align-center — alignment
.iaw-figure figcaption — figure caption
.iaw-imgwrap       — plain image wrapper
.iaw-imgcap        — plain image caption
.iaw-gallery       — <gallery> grid
.iaw-gitem         — gallery item
.iaw-gitem img     — gallery thumbnail
.iaw-gitem figcaption — gallery caption
.iaw-article-body pre — preformatted blocks
.iaw-article-body code — inline code
.iaw-refs          — references section
.iaw-refs-list     — reference list
.iaw-ref           — reference superscript link
.iaw-redirect      — redirect banner
.iaw-categories    — category chips row
.iaw-catlabel      — "Categories:" label
.iaw-catlink       — a single category chip
.iaw-missingpage   — "page does not exist" block</pre>

=== Components on other pages ===

<pre>.iaw-btn           — buttons
.iaw-btn-sm/.iaw-btn-xs — smaller buttons
.iaw-btn-primary   — accent button
.iaw-btn-danger    — red destructive button
.iaw-page          — generic page wrapper
.iaw-narrow/.iaw-narrow2/.iaw-wide — page width variants
.iaw-page-head     — page header row
.iaw-pagelist      — grid of page cards
.iaw-pagecard      — a page card in lists
.iaw-recent        — recent changes list
.iaw-recentitem    — one recent change
.iaw-recentmeta    — timestamp in recent changes
.iaw-media-thumb   — media grid thumbnail
.iaw-mediacard     — media card
.iaw-fileicon      — non-image file icon
.iaw-mediainfo     — media card info
.iaw-fileview      — file page view
.iaw-filedl        — file metadata dl
.iaw-diffrow/.iaw-diffcol/.iaw-diffmeta — diff view
.iaw-letterbar     — A–Z letter bar on All pages
.iaw-editpage      — edit page wrapper
.iaw-preview       — preview pane
.iaw-edittips      — quick reference box under the editor
.iaw-form          — forms
.iaw-card          — generic card/panel
.iaw-inline-form   — inline forms
.iaw-flash         — toast notification
.iaw-error         — error box
.iaw-warn          — warning box
.iaw-muted         — muted secondary text
.iaw-empty         — "nothing here" placeholder
.iaw-hub-hero      — wiki hub hero banner
.iaw-hub-hero-inner — hero inner container
.iaw-section       — hub section
.iaw-section-head  — hub section header
.iaw-template-usage — rendered template preview</pre>

== Targeting a single page ==

Per-page CSS applies to that page only, so you can style the article without
affecting the rest of the wiki. Use the page-specific class hooks above.
There is no page-id class on the body (yet), but because per-page CSS is only
loaded on that page, plain selectors like <code>.iaw-article-title</code> already
only affect it.

== Common recipes ==

Accent color + rounded everything:
<pre>:root { --iaw-accent: #e02030; --iaw-accent-ink: #fff; }
.iaw-article { border-radius: 16px; }
.iaw-btn { border-radius: 999px; }</pre>

Make links underlined:
<pre>.iaw-article-body a { text-decoration: underline; }</pre>

Wide page layout:
<pre>:root { --iaw-article-width: 1600px; }</pre>

Serif article body:
<pre>.iaw-article-body { font-family: Georgia, "Times New Roman", serif; font-size: 17px; }</pre>

Custom blockquote styling:
<pre>.iaw-article-body blockquote {
  border-left: 4px solid var(--iaw-accent);
  background: var(--iaw-panel);
  padding: 10px 18px;
  font-style: italic;
}</pre>

Image frame tweaks:
<pre>.iaw-figure { border: 2px solid var(--iaw-line); border-radius: 10px; padding: 6px; background: var(--iaw-panel); }
.iaw-figure figcaption { text-align: center; font-weight: 600; }</pre>

Category chips as pills:
<pre>.iaw-catlink { border-radius: 999px; padding: 4px 14px; text-transform: uppercase; letter-spacing: .05em; font-size: 11px; }</pre>

Table stripes with a header accent:
<pre>.iaw-table th { background: var(--iaw-accent); color: var(--iaw-accent-ink); }
.iaw-table tr:nth-child(even) td { background: var(--iaw-zebra); }</pre>

== Inline styles ==

A safe allowlist of CSS properties is permitted in inline style="" attributes
on &lt;span&gt;, &lt;div&gt;, &lt;td&gt; etc: color, background, background-color,
border, border-color, text-align, text-decoration, font-size, font-weight,
font-style, margin, padding, width, height, float, clear, vertical-align,
max-width, display. Values may not contain ; { } &lt; &gt;.

== Safety ==

All custom CSS is sanitized before saving:

* Sizes capped: page CSS 256 KB, wiki CSS 1 MB.
* &lt; and &gt; are stripped entirely — no &lt;/style&gt; breakout is possible.
* @import and url(...) are removed — no remote fetch, no tracking, no data: images.
* expression(), javascript:, vbscript: are neutralized.
* Unknown at-rules (outside @media, @supports, @keyframes, @page, @font-face,
  @font-feature-values) are dropped.
* Braces must balance or the whole file is rejected with a clear error.
* Comments are stripped before validation so they cannot smuggle braces.
* CSS is served only from text/css routes under the wiki's own origin.

Because of these rules, background images via url() are not possible — use
uploaded files with wikitext images instead. @font-face is allowed if the
font files are reachable, but url() is stripped, so self-hosted fonts are
not practical yet.

[[Category:Documentation]]`,

  Administration: `== Administration ==

== Wiki administration ==

Wiki owners and wiki admins can:
# Manage members (promote to admin/editor, ban, remove)
# Set the wiki display name and description
# Change the theme (dark or forest)
# Set the wiki to private (members-only) or public
# Edit the wiki default CSS
# Delete the wiki (permanent)

Access the wiki admin console from the sidebar on any wiki page (if you have permission).
The URL is /w/<wiki-key>/admin.

== Instance administration ==

Instance admins (created via ADMIN_USER env var or promoted by another admin) can:
# Toggle whether new users can sign up
# Control wiki creation policy (open, admin-only, or disabled)
# Set a per-user wiki creation limit
# Reset any user's password
# Toggle other users' admin status
# Delete users (hard delete — removes the account and all sessions)
# Delete wikis (soft — hidden but recoverable)

Access the instance admin console at /admin.

== Changing the admin password ==

If you can log in: visit /settings and enter a new password (min 8 chars).
If you are locked out: an instance admin can reset your password from /admin,
or use the CLI:<pre>node scripts/change-password.js &lt;username&gt; &lt;new-password&gt;</pre>

== First boot ==

Set ADMIN_USER and ADMIN_PASS env vars before first start to configure the
initial admin account. Defaults are "itadmin" / "admin123" — change them!

[[Category:Documentation]]`,

  Templates: `== Templates ==

Templates enable reusable content. A template is just a page in the Template: namespace.

== Creating a template ==

Create a page named Template:YourName. Add content like:<pre>Hello {{{1}}}, welcome to {{{2|the wiki}}}!</pre>

Parameters are referenced as {{{1}}} (positional) or {{{name}}} (named).
{{{name|default}}} gives a default value when the parameter is omitted.

== Transcluding a template ==

Use {{YourName|Hello|my wiki}} to render the template with arguments.

== Examples ==

Infobox:<pre>{{Infobox
| title = Page Title
| image = File:photo.jpg
| caption = A photo
}}</pre>

Navigation:<pre>{{Navbox|prev=Prev Page|next=Next Page}}</pre>

== Self-transclusion ==

A template can invoke itself, but infinite recursion is prevented (max depth 8).
Circular references are detected and broken.

[[Category:Documentation]]`,

  Categories: `== Categories ==

Categories organize pages into groups. Add [[Category:Name]] to the bottom of any page
to assign it to a category. Each category gets its own index page at /w/<wiki>/c/<name>.

== Creating a category ==

Simply add [[Category:Your category]] to any page. The category is created
automatically and appears at the bottom of the page.

== Category pages ==

Each category has a page listing all member pages, sorted alphabetically.
Browse the full list of categories from the sidebar special pages.

== Sort keys ==

By default, pages are sorted by their title. You can specify a sort key:
[[Category:Name|sort key]]. A sort key of '' (empty) uses the default sort.
The pipe trick [[Category:Foo|]] preserves the category but uses a clean label.

[[Category:Documentation]]`,

  Users: `== Users and permissions ==

== Account creation ==

By default, anyone can sign up. Instance admins can disable signups from /admin.

== Roles ==

=== Instance-level ===
* Instance admin: full control over the entire instance. Can manage all users,
  wikis, and instance settings. Created via ADMIN_USER env var on first boot.

=== Wiki-level ===
* Owner: created the wiki; can do everything including deleting the wiki.
* Admin: can manage members, edit CSS, delete pages.
* Editor: can edit pages.
* Banned: blocked from viewing or editing (on private or public wikis depending on settings).
* Member: on private wikis, members can view and edit.

== Passwords ==
* PBKDF2-SHA256 with per-user salt, 120 000 iterations.
* Minimum 8 characters.
* Forgotten passwords can be reset by an instance admin from /admin,
  or via CLI:<pre>node scripts/change-password.js &lt;username&gt; &lt;new-password&gt;</pre>

[[Category:Documentation]]`,

  FAQ: `== Frequently asked questions ==

== Can I delete a wiki? ==
Yes — wiki owners and instance admins can delete wikis from the admin console.
Wiki deletion is permanent.

== Can I delete a user? ==
Instance admins can hard-delete users from /admin. This removes the account and
all sessions immediately. Wiki ownership is not transferred — pages created by a
deleted user will show "unknown" as the editor.

== What happens to edited history when a user is deleted? ==
Revision history is preserved with the original username intact (stored per-revision,
not looked up live), so page histories remain readable.

== Can I use HTML in pages? ==
Inline HTML tags like &lt;b&gt;, &lt;i&gt;, &lt;u&gt;, &lt;s&gt;, &lt;sub&gt;, &lt;sup&gt;,
&lt;code&gt;, &lt;span&gt;, &lt;div&gt;, &lt;blockquote&gt; are allowed and sanitized.
Tags like &lt;script&gt;, &lt;iframe&gt;, &lt;style&gt; are escaped (shown as text).
Templates can restore a safe allowlist of tags with attribute filtering.

== Can I style individual pages? ==
Yes! Click Edit → "CSS panel" to write CSS scoped to that page. Or set wiki-wide
default CSS from the wiki admin console.

== Is there a sandbox? ==
No dedicated sandbox page exists, but you can create one! Create any page and use
the Preview button to experiment.

[[Category:Documentation]]`,

};

function ensureDocsWiki(db, app, admin) {
  if (!app || !app.createWiki || !admin) return null;

  // Repair: if docs wiki exists but owner is deleted, ensure all instance admins
  // have admin access so the wiki remains editable.
  const existing = db.wikiByKey(DOCS_KEY);
  if (existing) {
    const ownerAlive = db.get('users', existing.owner_id) != null;
    if (!ownerAlive) {
      const admins = db.all('users').filter((u) => !u.deleted_at && u.is_admin).map((u) => u.id);
      if (!admins.some((id) => (existing.admins || []).includes(id))) {
        existing.admins = [...new Set([...(existing.admins || []), ...admins])];
        db.put('wikis', existing.id, existing);
      }
    }
    return null;
  }

  // Add all current instance admins so the wiki stays editable if one is deleted
  const allAdmins = db.all('users').filter((u) => !u.deleted_at && u.is_admin).map((u) => u.id);
  const wiki = app.createWiki(admin, {
    key: DOCS_KEY,
    name: 'Documentation',
    description: 'Auto-generated documentation for It\'s a Wiki!',
    theme: 'dark',
    visibility: 'public',
  });
  // expand the admin list beyond just the creating admin
  wiki.admins = [...new Set([...(wiki.admins || []), ...allAdmins])];
  db.put('wikis', wiki.id, wiki);

  const { created } = regenerateDocsWiki(db, app, wiki, admin);
  console.log(`[itsawiki] generated documentation wiki at /w/${DOCS_KEY} (${created} pages)`);
  return { wiki, pages: created };
}

/**
 * (Re)write every docs page from PAGES. Used on first boot and by the
 * "Regenerate docs" button in the instance admin panel.
 * Returns { created, updated } counts.
 */
function regenerateDocsWiki(db, app, wiki, admin) {
  let created = 0;
  let updated = 0;
  for (const [title, content] of Object.entries(PAGES)) {
    let page = app.getPage(wiki, title);
    if (!page) {
      page = {
        id: uid('p_'), wiki_id: wiki.id, title, content, css: '',
        summary: '', redirect: null, categories: [],
        created_at: ts(), last_editor_id: admin.id, last_username: admin.username,
      };
      created++;
    } else {
      page.content = content;
      updated++;
    }
    app.savePage(wiki, page, admin, { summary: 'Regenerated documentation' });
  }
  return { created, updated };
}

module.exports = { ensureDocsWiki, regenerateDocsWiki, DOCS_KEY, PAGES };
