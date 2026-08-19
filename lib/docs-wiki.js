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

== Per-page CSS ==

While editing a page, click "CSS panel" (or append ?css=1 to the URL). Write CSS
that applies to that page only. It's injected as an inline &lt;style&gt; block.

Example:<pre>.iaw-article-title { color: #e02030; }
.iaw-table { border-radius: 8px; }</pre>

== Wiki default CSS ==

Wiki owners and admins can set a default stylesheet in the wiki admin console
("Wiki default CSS" textarea). It applies to every page in the wiki. Per-page CSS
overrides it.

== Built-in themes ==

Two themes ship built-in: dark (default) and forest.

== CSS classes ==

Pages get stable class hooks:
* .iaw-article-body — page content
* .iaw-article-title — page title
* .iaw-table — wikitext tables
* .iaw-img — images
* .iaw-link — wiki links
* .iaw-toc — table of contents
* .iaw-categories — category list

== Safety ==

All custom CSS is sanitized — &lt;style&gt; breakouts, @import, url(),
expression(), and javascript: schemes are stripped before saving. CSS is served only
from text/css routes, so it can never execute as HTML or script.

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

  const { pages } = regenerateDocsWiki(db, app, wiki, admin);
  console.log(`[itsawiki] generated documentation wiki at /w/${DOCS_KEY} (${pages} pages)`);
  return { wiki, pages };
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
