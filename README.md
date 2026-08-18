# It's a Wiki! 🗂️

**An open-source, self-hostable Fandom successor.** Everyone can create their own wiki, write in full wikitext, and — the part Fandom makes painful — style **every individual page** (and whole wikis) with your own CSS, effortlessly.

Goal: the friendly community-wiki experience of the 2000s wiki farms, with none of the ad clutter and none of the "you need a developer to change a color" friction.

## Features

### The whole farm

- **Anyone can start a wiki** — on any instance. No approval queue.
- **Admins control creation** — instance admins can choose per-wiki-creation policy:
  - *open* (everyone, unlimited),
  - *admin-accepted* (only instance admins),
  - *deny* (nobody), and
  - a **per-user limit** ("each user may own at most N wikis").
- **Full-fledged users**: signup/login, sessions, profiles, per-wiki roles (owner / admin / editor / banned), private (members-only) wikis, account settings.
- **Wiki hub pages**, browsing, search across wikis, recent activity, instance admin console (users, wikis, settings).

### The wiki itself

- **Full wikitext**:
  - headings & auto table-of-contents
  - tables (`{|` … `|}` with header rows)
  - `[[links]]`, `[[...|label]]`, external links
  - images and galleries (`[[File:x|thumb|caption]]`, `<gallery>`, `[[File:…]]/raw` routes)
  - templates with arguments + defaults + transclusion (`{{Infobox|name=…}}`, `{{PAGENAME}}`, `{{CURRENTYEAR}}`, …)
  - categories (`[[Category:Name]]`), category pages, per-category listings
  - redirects (`#REDIRECT [[Target]]`)
  - references (`<ref>…</ref>` + `<references/>`)
  - lists, quotes, indents, `<nowiki>/<pre>/<code>`, magic words
- **Page history** with revisions, per-revision viewing, and rendered diffs.
- **Special pages**: All pages, Recent changes, Missing pages, Categories, What links here, Media.
- **Media library** with uploads (10 MB cap), replacement, and embeds.
- **Search** within a wiki.
- **Watchlists** — one click to watch/unwatch a page.
- **Missing-page creation**: visiting `/p/NotHere` shows a "Create it" button that pre-fills the right title.

### The CSS system — the headline feature

Fandom makes custom CSS a backroom developer affair. Here it's a first-class editor control:

- **Per-page CSS**: on any page hit **Edit → "CSS panel"** (or append `?css=1`) and write CSS that applies *only to that page*, overriding the wiki default. No special rights, no developer account — any editor.
- **Wiki default CSS**: the wiki admin console has a "Wiki default CSS" textarea that styles the whole wiki.
- **Built-in themes**: dark (default) and forest.
- **Safely served**: all custom CSS runs through a sanitizer (strips `@import`, `url(...)`, `expression(...)`, `javascript:`, angle brackets, unbalanced braces, unknown at-rules) and is served **only** from `text/css` routes — it can never execute as HTML or script.

### Security & permissions

- PBKDF2-SHA256 salted password hashing, timing-safe comparisons, 90-day cookie sessions.
- Non-admin raw HTML is escaped; wikitext template expansion only restores an explicit tag allowlist; custom CSS is validated + served as `text/css` only.
- Per-wiki role system (admin/editor/ban), private-wiki gate, instance admin powers.
- Session deletion on logout/account deletion.

## Running

Requirements: Node.js ≥ 18. No database, no build step, no external services.

```bash
npm install
npm start
# → http://localhost:3000
```

First boot seeds an **instance admin**:

| Env var | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `DATA_DIR` | `./data` | where wikis/pages/media are stored |
| `ADMIN_USER` | `itadmin` | initial admin username |
| `ADMIN_PASS` | `admin123` | initial admin password ⚠️ **change on first boot** |

Promote an existing member to admin later:

```bash
node scripts/create-admin.js <username>
```

### Tests

```bash
npm test
```

35 tests: wikitext rendering (incl. the template-tag sanitizer and its encoded-payload bypasses), CSS sanitizer (incl. the `</style><script>` breakout regression), JSON store, app models, plus a live end-to-end journey (signup → create wiki → preview/save page → page CSS → history → admin → private-wiki gate).

## Layout & architecture

```
server.js                 entrypoint (config, express app, static + route mounting)
lib/
  auth.js                 password hashing, sessions, request→user
  app.js                  models: wikis, pages, revisions, media, events, permissions
  wikitext.js             the wikitext → HTML renderer (+ template engine)
  css.js                  custom-CSS sanitizer + page stylesheet builder
  multipart.js            dependency-free multipart/form-data parser
  util.js                 escaping, slugs, ids, formatting
  store/                  JSON-file document store (db.js, json.js)
  views/                  plain-JS HTML templates (base, instance, wiki)
  server/routes.js        the whole route table + built-in wiki skin CSS
public/                   static assets (app.css, favicon)
test/                     node:test suites
```

Storage is a simple **JSON-file document store** — atomic writes via tmp+rename, collections as folders, indexes scanned on demand. Perfectly fine up to tens of thousands of documents on one server; the store API is encapsulated behind `lib/store/db.js` so a SQL backend can be swapped in later.

## Roadmap (next steps)

- **Discussion**: talk pages & comments on pages (LiquidThreads-style).
- **Wikitext depth**: parser functions (`{{#if:}}`), named template slots, `{{DEFAULTSORT}}`, nested table-cell attributes.
- **Data**: structured data / portable infoboxes, JSON-backed page data.
- **Federation**: ActivityPub for cross-instance wiki sharing.
- **Import**: Fandom/MediaWiki XML dump importer.
- **Scaling**: SQLite/Postgres adapter, configurable upload storage.
- **Polish**: user rename, email verification, CSRF tokens, rate limiting, moderation queue, per-wiki theming UI (color pickers generating the CSS for you).

## License

GPL-3.0 — build your own successor, fork it, host it for your community.