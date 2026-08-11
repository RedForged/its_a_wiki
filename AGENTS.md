# AGENTS.md

Working notes for AI agents (and humans) contributing to **It's a Wiki!**.

## Project

Open-source Fandom-style wiki farm: everyone creates wikis; full wikitext; easy per-page and per-wiki custom CSS. Node.js (≥18) + Express, zero external services, JSON-file storage. Tests use the built-in `node:test` runner — no test framework dependency.

## Commands

```bash
npm start                 # run server (PORT / DATA_DIR / ADMIN_USER / ADMIN_PASS env)
npm test                  # node --test test/ — must stay green
node scripts/create-admin.js <username>   # promote user to instance admin
node --check <file>       # quick syntax gate before committing
```

## Code layout

- `server.js` — entrypoint: env config, express app, cookie parser, static mount, routes mount, error handler.
- `lib/server/routes.js` — every route + the built-in wiki skin CSS (`WIKI_SKIN_CSS`) + instance admin page.
- `lib/views/*` — plain-JS HTML string builders (`h()` = escape helper). No template engine.
- `lib/app.js` — models & permissions (`createApp(db, {dataDir, eventCap})`).
- `lib/wikitext.js` — wikitext renderer (`makeRenderer(options)`); `templateSource` hook for transclusion; returns `{html, toc, categories}`.
- `lib/css.js` — `sanitizeCss`/`buildPageStylesheet`. **The security-critical file.**
- `lib/store/*` — JSON document store; `db` helpers live in `lib/store/db.js`.
- `test/` — `node:test` suites; e2e boots the real server on an ephemeral port + temp DATA_DIR.

## Conventions & gotchas

- **Escaping is mandatory.** All dynamic HTML goes through `h()`/`escapeHtml`. Never trust title/key/username/form input.
- **Custom CSS is an XSS surface.** It is injected as an inline `<style>` block AND served as `text/css`. `sanitizeCss` strips `<`/`>` characters entirely — keep it that way; add regression tests in `test/css.test.js` when touching it.
- **Wikitext raw HTML** is escaped for normal editors; template expansion only restores an explicit `RESTORABLE_TAGS` allowlist (`lib/wikitext.js`). Any new tag added to a placeholder/whitelist must be a benign content tag.
- **Wiki keys** are lowercase `[a-z0-9-]`, 2–40 chars, and `lib/app.js` `RESERVED_KEYS` must not be handed out. `db.wikiByKey` is exact-match; routes lowercase the param first.
- **Settings**: `makeServer` receives settings as an object or factory; it snapshots once. `POST /admin` mutates the same live object — if the factory starts returning fresh objects, admin saves silently stop persisting.
- **Per-page CSS flow**: edit route with `?css=1` / `css_mode=1` saves `page.css`; page view injects it as `#iaw-page-css`. Wiki default CSS lives on the wiki doc and is served at `/w/:wiki/default.css`; structural skin is elsewhere in `WIKI_SKIN_CSS`.
- **Redirects** (`#REDIRECT [[X]]`) are followed on page view unless `?redirect=no`.
- The e2e test is stateful (one shared cookie jar + seeded admin) — new assertions must respect login context (a wiki's owner/editor vs instance admin are different roles).

## Testing policy

- New parser feature → a unit test in `test/wikitext.test.js`.
- New sanitizer rule → `test/css.test.js` (include an evil-input case).
- New route/flow → extend `test/e2e.test.js` journey, or add a unit test under `test/app.test.js` + `test/store.test.js`.
- Keep `npm test` green; the suite is the delivery gate.