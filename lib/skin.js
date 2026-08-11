'use strict';

/**
 * It's a Wiki! — wiki skin (structural CSS).
 * A MediaWiki/Fandom-style layout: slim sticky topbar with search,
 * a left navigation rail, a wide article area, tabbed page actions,
 * in-article TOC, category chips, and a pinned footer.
 *
 * Custom wiki CSS (/w/:key/default.css and per-page CSS) layers on top of
 * this via the `iaw-` class hooks. Themes only swap CSS variables.
 */

const WIKI_SKIN_CSS = `
/* ================================================================
   It's a Wiki! — wiki skin
   ================================================================ */
:root {
  --iaw-bg: #f6f6f4;
  --iaw-panel: #ffffff;
  --iaw-ink: #202122;
  --iaw-muted: #72777d;
  --iaw-line: #d9d9d6;
  --iaw-accent: #3d6de0;
  --iaw-accent-ink: #ffffff;
  --iaw-heading: #101418;
  --iaw-sidebar-bg: #fbfbfa;
  --iaw-article-width: 1280px;
}
html { -webkit-text-size-adjust: 100%; }
body {
  margin: 0; background: var(--iaw-bg); color: var(--iaw-ink);
  font: 15px/1.6 -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  display: flex; flex-direction: column; min-height: 100vh;
}
a { color: var(--iaw-accent); text-decoration: none; }
a:hover { text-decoration: underline; }
code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }

/* ---------------- topbar ---------------- */
.iaw-wikitop {
  background: var(--iaw-panel); border-bottom: 1px solid var(--iaw-line);
  position: sticky; top: 0; z-index: 100; box-shadow: 0 1px 3px rgba(0,0,0,.05);
}
.iaw-wikitop-inner {
  width: 100%; padding: 6px 18px; height: 52px;
  display: flex; align-items: center; gap: 14px;
}
.iaw-wikilogo { display: inline-flex; align-items: center; gap: 9px; font-weight: 750; font-size: 17px; color: var(--iaw-heading); min-width: 0; }
.iaw-wikilogo:hover { text-decoration: none; }
.iaw-wikilogo-badge {
  width: 30px; height: 30px; border-radius: 8px; background: var(--iaw-accent); color: #fff;
  display: inline-flex; align-items: center; justify-content: center; font-size: 16px; font-weight: 800; flex-shrink: 0;
}
.iaw-wikilogo-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.iaw-big { width: 54px; height: 54px; font-size: 28px; border-radius: 12px; }
.iaw-wikitop-right { margin-left: auto; display: flex; align-items: center; gap: 10px; }
.iaw-wikisearch input {
  padding: 6px 12px; border: 1px solid var(--iaw-line); border-radius: 18px;
  font: inherit; width: 200px; background: var(--iaw-bg);
}
.iaw-userchip { display: inline-flex; align-items: center; gap: 7px; font-weight: 600; font-size: 13.5px; }

/* ---------------- buttons ---------------- */
.iaw-btn {
  display: inline-block; padding: 7px 14px; border-radius: 6px; border: 1px solid var(--iaw-line);
  background: var(--iaw-panel); color: var(--iaw-ink); font: inherit; font-size: 14px; cursor: pointer; text-decoration: none;
}
.iaw-btn:hover { border-color: var(--iaw-accent); text-decoration: none; }
.iaw-btn-sm { padding: 4px 10px; font-size: 13px; }
.iaw-btn-xs { padding: 2px 8px; font-size: 12px; }
.iaw-btn-primary { background: var(--iaw-accent); border-color: var(--iaw-accent); color: var(--iaw-accent-ink); }
.iaw-btn-primary:hover { filter: brightness(1.08); }
.iaw-btn-danger { background: #d33; border-color: #d33; color: #fff; }
.iaw-btn-danger:hover { filter: brightness(1.05); }
.iaw-btn-block { display: block; width: 100%; text-align: center; }
.iaw-btn-lg { padding: 12px 22px; font-size: 16px; }

/* ---------------- layout shell: sidebar + main ---------------- */
.iaw-wiki-shell {
  flex: 1 0 auto; display: grid; grid-template-columns: 230px minmax(0, 1fr);
  width: 100%; box-sizing: border-box;
}
@media (max-width: 900px) { .iaw-wiki-shell { grid-template-columns: 1fr; } }

.iaw-sidebar {
  background: var(--iaw-sidebar-bg); border-right: 1px solid var(--iaw-line);
  padding: 16px 10px 22px; position: sticky; top: 52px; align-self: start;
  height: calc(100vh - 52px); overflow-y: auto; box-sizing: border-box;
}
@media (max-width: 900px) { .iaw-sidebar { display: none; } }
.iaw-sidebar-section { margin: 0 0 18px; }
.iaw-sidebar-title {
  font-size: 11px; text-transform: uppercase; letter-spacing: .07em;
  color: var(--iaw-muted); margin: 0 10px 6px; font-weight: 700;
}
.iaw-sidebar a {
  display: flex; align-items: center; gap: 9px; padding: 6px 10px; margin: 1px 0;
  border-radius: 6px; color: var(--iaw-ink); font-size: 14px; line-height: 1.3;
}
.iaw-sidebar a:hover { background: rgba(0,0,0,.06); text-decoration: none; }
.iaw-sidebar a.iaw-active { background: var(--iaw-accent); color: var(--iaw-accent-ink); font-weight: 600; }
.iaw-sidebar-icon { width: 18px; text-align: center; flex-shrink: 0; opacity: .75; }
.iaw-sidebar a.iaw-active .iaw-sidebar-icon { opacity: 1; }

.iaw-wiki-main { min-width: 0; padding: 0 28px 44px; }
@media (max-width: 900px) { .iaw-wiki-main { padding: 0 14px 30px; } }

/* ---------------- page view ---------------- */
.iaw-pageview { max-width: var(--iaw-article-width); margin: 0 auto; padding: 22px 0 20px; }
.iaw-page-headbar { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin-bottom: 2px; }
.iaw-article-title { font-size: 30px; line-height: 1.25; color: var(--iaw-heading); margin: 0; font-weight: 700; }

/* MediaWiki-style action tabs */
.iaw-tabs { display: flex; gap: 2px; border-bottom: 2px solid var(--iaw-line); margin: 14px 0 0; }
.iaw-tab {
  display: inline-block; padding: 7px 14px 8px; font-size: 13.5px; color: var(--iaw-muted);
  border: 1px solid transparent; border-bottom: none; border-radius: 6px 6px 0 0; margin-bottom: -2px;
}
.iaw-tab:hover { background: rgba(0,0,0,.04); color: var(--iaw-ink); text-decoration: none; }
.iaw-tab.iaw-active { background: var(--iaw-panel); border-color: var(--iaw-line); border-bottom-color: var(--iaw-panel); color: var(--iaw-heading); font-weight: 600; }
.iaw-tab.iaw-watching { color: #9c7a00; }
.iaw-tab.iaw-tab-danger { color: #c0392b; }

.iaw-subline { font-size: 12.5px; color: var(--iaw-muted); margin: 10px 0 2px; }

/* article area: white surface over subtle page background */
.iaw-article {
  background: var(--iaw-panel); border: 1px solid var(--iaw-line); border-radius: 8px;
  padding: 26px 38px 30px; margin-top: 4px;
}
@media (max-width: 700px) { .iaw-article { padding: 18px 18px 22px; } }
.iaw-article-body { font-size: 15px; line-height: 1.7; }
.iaw-article-body h1, .iaw-article-body h2, .iaw-article-body h3, .iaw-article-body h4 {
  line-height: 1.25; color: var(--iaw-heading); margin: 1.3em 0 .45em; scroll-margin-top: 70px;
}
.iaw-article-body h1 { font-size: 1.75em; border-bottom: 1px solid var(--iaw-line); padding-bottom: .25em; }
.iaw-article-body h2 { font-size: 1.5em; border-bottom: 1px solid var(--iaw-line); padding-bottom: .22em; }
.iaw-article-body h3 { font-size: 1.25em; }
.iaw-article-body h4 { font-size: 1.08em; }
.iaw-article-body p { margin: .55em 0; }
.iaw-article-body ul, .iaw-article-body ol { padding-left: 28px; }
.iaw-article-body blockquote { border-left: 3px solid var(--iaw-accent); margin: 1em 0; padding: 4px 16px; color: #444; background: rgba(0,0,0,.02); }

/* in-article TOC (MediaWiki style compact box) */
.iaw-article .iaw-toc {
  border: 1px solid var(--iaw-line); background: var(--iaw-sidebar-bg);
  font-size: 13px; padding: 8px 14px 10px; border-radius: 8px;
  width: fit-content; max-width: 100%; margin: 16px 0 20px;
}
.iaw-toc .iaw-toc-title { font-weight: 700; font-size: 13px; margin-bottom: 2px; }
.iaw-toc ol { list-style: none; margin: 2px 0; padding: 0; }
.iaw-toc li { padding: 1px 0; }
.iaw-toc li[data-level="2"] { padding-left: 14px; }
.iaw-toc li[data-level="3"] { padding-left: 28px; }
.iaw-toc a { color: var(--iaw-accent); }

/* tables */
.iaw-article-body table.iaw-table { border-collapse: collapse; margin: 1em 0; }
.iaw-article-body th, .iaw-article-body td { border: 1px solid var(--iaw-line); padding: 6px 12px; }
.iaw-article-body th { background: rgba(0,0,0,.045); text-align: left; }
.iaw-article-body tr:nth-child(even) td { background: rgba(0,0,0,.015); }

/* images / galleries */
.iaw-article-body img.iaw-img { max-width: 100%; height: auto; border-radius: 4px; }
.iaw-figure { margin: 1em 0; max-width: 45%; }
.iaw-figure figcaption { font-size: 13px; color: var(--iaw-muted); padding: 4px 0; }
.iaw-figure.align-right { float: right; margin-left: 1.2em; }
.iaw-figure.align-left { float: left; margin-right: 1.2em; }
.iaw-figure.align-center { margin: 1em auto; }
.iaw-imgwrap { margin: .8em 0; }
.iaw-imgwrap.align-right { float: right; margin-left: 1em; }
.iaw-imgcap { font-size: 13px; color: var(--iaw-muted); }
.iaw-gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 12px; margin: 1em 0; }
.iaw-gitem { margin: 0; }
.iaw-gitem img { width: 100%; height: 132px; object-fit: cover; border-radius: 6px; }
.iaw-gitem figcaption { font-size: 12.5px; color: var(--iaw-muted); }

/* pre / code */
.iaw-article-body pre {
  background: #f4f4f2; border: 1px solid var(--iaw-line); border-radius: 8px;
  padding: 10px 14px; overflow-x: auto; font: 13px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
.iaw-article-body code { background: rgba(0,0,0,.06); padding: 1px 5px; border-radius: 4px; font-size: 13px; }

/* references */
.iaw-refs { font-size: 13.5px; border-top: 1px solid var(--iaw-line); margin-top: 28px; padding-top: 12px; }
.iaw-refs-list { padding-left: 24px; }

/* categories — chips at bottom of article */
.iaw-categories { border-top: 1px solid var(--iaw-line); margin-top: 26px; padding: 14px 0 2px; font-size: 13px; color: var(--iaw-muted); display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.iaw-catlabel { font-weight: 700; }
.iaw-catlink { display: inline-block; background: var(--iaw-sidebar-bg); border: 1px solid var(--iaw-line); color: var(--iaw-accent); border-radius: 20px; padding: 2px 12px; font-size: 12.5px; }
.iaw-catlink:hover { border-color: var(--iaw-accent); text-decoration: none; }

/* redirect / missing page */
.iaw-redirect { background: #fff8dc; border: 1px solid #f0e6b2; border-radius: 8px; padding: 8px 12px; margin-bottom: 14px; font-size: 14px; }
.iaw-missingpage { padding: 18px 0 8px; }

/* ---------------- flash toast (one-shot, fixed, auto-dismiss) ---------------- */
.iaw-flash {
  position: fixed; top: 64px; right: 18px; z-index: 300;
  background: #1f2937; color: #fff; padding: 10px 18px; border-radius: 10px;
  box-shadow: 0 8px 28px rgba(0,0,0,.22); font-size: 14px;
  animation: iaw-toast 3.6s forwards;
  pointer-events: none;
}
@keyframes iaw-toast {
  0%   { opacity: 0; transform: translateY(-8px); }
  7%   { opacity: 1; transform: none; }
  82%  { opacity: 1; }
  100% { opacity: 0; transform: translateY(-6px); }
}

.iaw-error { background: #fdecea; border: 1px solid #f5c6c0; color: #8f1a13; padding: 10px 14px; border-radius: 8px; margin: 12px 0; }
.iaw-warn { background: #fff7e0; border: 1px solid #f0e0a8; color: #6b5200; padding: 10px 14px; border-radius: 8px; }
.iaw-muted { color: var(--iaw-muted); font-size: 13px; }
.iaw-empty { color: var(--iaw-muted); padding: 16px 0; }
.iaw-avatar { width: 26px; height: 26px; border-radius: 50%; color: #fff; display: inline-flex; align-items: center; justify-content: center; font-weight: 700; font-size: 13px; flex-shrink: 0; }

/* ---------------- generic pages (all-pages, admin, edit, special) ---------------- */
.iaw-page { max-width: var(--iaw-article-width); margin: 0 auto; padding: 24px 0 40px; }
.iaw-narrow, .iaw-narrow2 { max-width: 860px; }
.iaw-wide { max-width: 1240px; }
.iaw-page-head { display: flex; align-items: baseline; justify-content: space-between; gap: 14px; flex-wrap: wrap; margin-bottom: 14px; }
.iaw-page-head h1 { font-size: 26px; margin: 0; }
.iaw-searchbar { display: flex; gap: 8px; margin: 14px 0; flex-wrap: wrap; }
.iaw-searchbar input { flex: 1; min-width: 200px; padding: 8px 12px; border: 1px solid var(--iaw-line); border-radius: 8px; font: inherit; background: var(--iaw-panel); }
.iaw-searchbar select { padding: 8px; border: 1px solid var(--iaw-line); border-radius: 8px; background: var(--iaw-panel); font: inherit; }

.iaw-pagelist { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; }
.iaw-pagecard { background: var(--iaw-panel); border: 1px solid var(--iaw-line); border-radius: 8px; padding: 12px 16px; display: flex; flex-direction: column; gap: 3px; color: inherit; }
.iaw-pagecard:hover { border-color: var(--iaw-accent); text-decoration: none; box-shadow: 0 2px 6px rgba(0,0,0,.06); }
.iaw-pagecard b { font-size: 15px; }

.iaw-recent { display: flex; flex-direction: column; gap: 8px; }
.iaw-recentitem { display: flex; gap: 10px; align-items: flex-start; background: var(--iaw-panel); border: 1px solid var(--iaw-line); border-radius: 8px; padding: 10px 14px; font-size: 14px; }
.iaw-recentmeta { color: var(--iaw-muted); font-size: 12.5px; }

.iaw-table { border-collapse: collapse; width: 100%; background: var(--iaw-panel); border: 1px solid var(--iaw-line); font-size: 14px; }
.iaw-table th, .iaw-table td { border: 1px solid var(--iaw-line); padding: 7px 10px; text-align: left; }
.iaw-table th { background: rgba(0,0,0,.04); }
.iaw-history td { font-size: 13.5px; }

.iaw-letterbar { display: flex; gap: 4px; flex-wrap: wrap; margin: 12px 0; }
.iaw-letterbar a { padding: 4px 9px; border: 1px solid var(--iaw-line); border-radius: 6px; background: var(--iaw-panel); }
.iaw-letterbar a.iaw-active { background: var(--iaw-accent); color: #fff; }

.iaw-diffrow { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
@media (max-width: 800px) { .iaw-diffrow { grid-template-columns: 1fr; } }
.iaw-diffcol { background: var(--iaw-panel); border: 1px solid var(--iaw-line); border-radius: 8px; padding: 14px 20px; }
.iaw-diffmeta { display: flex; gap: 20px; margin: 10px 0; }

.iaw-mediagrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 14px; }
.iaw-mediacard { background: var(--iaw-panel); border: 1px solid var(--iaw-line); border-radius: 10px; overflow: hidden; }
.iaw-media-thumb { display: flex; height: 140px; background: #eee; align-items: center; justify-content: center; }
.iaw-media-thumb img { max-width: 100%; max-height: 140px; object-fit: cover; }
.iaw-fileicon { font-weight: 800; color: #888; font-size: 18px; }
.iaw-mediainfo { padding: 10px 12px; display: flex; flex-direction: column; gap: 2px; font-size: 13px; }
.iaw-fileview img { max-width: 100%; border-radius: 10px; }
.iaw-filedl { display: grid; grid-template-columns: 100px 1fr; gap: 4px 12px; }
.iaw-filedl dt { color: var(--iaw-muted); font-weight: 600; }

/* forms / edit page */
.iaw-form label { display: block; margin: 10px 0; font-weight: 600; }
.iaw-form input[type=text], .iaw-form input:not([type]), .iaw-form input[type=password],
.iaw-form input[type=email], .iaw-form input[type=search], .iaw-form input[type=number],
.iaw-form textarea, .iaw-form select {
  width: 100%; box-sizing: border-box; margin-top: 4px; padding: 8px 10px; border: 1px solid var(--iaw-line);
  border-radius: 8px; font: inherit; background: var(--iaw-panel); font-weight: 400;
}
.iaw-form textarea { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.iaw-css-editor, .iaw-wikitext-editor { min-height: 300px; resize: vertical; }
.iaw-card { background: var(--iaw-panel); border: 1px solid var(--iaw-line); border-radius: 10px; padding: 20px 24px; margin: 16px 0; }
.iaw-inline-form { display: inline-flex; gap: 4px; }
.iaw-inline-row { display: flex; gap: 8px; align-items: center; }
.iaw-inline-row input { flex: 1; }
.iaw-banned { color: #d33; font-weight: 600; }
.iaw-danger-zone { border-color: #f0b7b0; }
.iaw-checkline { display: flex !important; align-items: center; gap: 8px; font-weight: 500 !important; }
.iaw-checkline input { width: auto !important; }

.iaw-editpage { max-width: 1010px; margin: 0 auto; padding: 22px 0 50px; }
.iaw-edit-head, .iaw-edit-actions { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.iaw-preview { border: 2px dashed var(--iaw-accent); border-radius: 10px; padding: 16px 20px; margin: 14px 0; background: #fbfcff; }
.iaw-edittips { background: var(--iaw-panel); border: 1px solid var(--iaw-line); border-radius: 10px; padding: 14px 18px; margin-top: 18px; font-size: 13.5px; }
.iaw-edittips code { background: rgba(0,0,0,.06); padding: 1px 5px; border-radius: 4px; }

/* hub (wiki front page) */
.iaw-hub-hero { background: linear-gradient(120deg, #eef3ff, #fdf3e7); border-bottom: 1px solid var(--iaw-line); border-radius: 0 0 10px 10px; }
.iaw-hub-hero-inner { max-width: var(--iaw-article-width); margin: 0 auto; padding: 26px 0 24px; display: flex; gap: 18px; align-items: center; }
.iaw-hub-hero h1 { margin: 0; font-size: 28px; }
.iaw-hub-hero p { margin: 4px 0 0; color: var(--iaw-muted); }
.iaw-section { max-width: var(--iaw-article-width); margin: 0 auto; padding: 20px 0; }
.iaw-section-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 12px; }
.iaw-section-head h2 { font-size: 19px; margin: 0; }

/* wiki footer */
.iaw-wikifooter { border-top: 1px solid var(--iaw-line); background: var(--iaw-panel); margin-top: 30px; flex-shrink: 0; }
.iaw-wikifooter-inner { width: 100%; padding: 14px 22px; display: flex; justify-content: space-between; gap: 10px; font-size: 13px; color: var(--iaw-muted); flex-wrap: wrap; }

.iaw-template-usage { border: 1px dashed var(--iaw-line); padding: 8px 12px; border-radius: 8px; }

/* ---------------- themes ---------------- */
body.theme-dark {
  --iaw-bg: #17181c; --iaw-panel: #202228; --iaw-sidebar-bg: #1c1d22;
  --iaw-ink: #e8e8ea; --iaw-muted: #9aa0a6; --iaw-line: #34363d; --iaw-heading: #f2f2f4; --iaw-accent: #6f9bff;
}
body.theme-dark .iaw-article-body code { background: rgba(255,255,255,.12); }
body.theme-dark .iaw-article-body pre { background: #26282f; }
body.theme-ocean { --iaw-bg: #eef5fb; --iaw-panel: #fbfdff; --iaw-sidebar-bg: #f2f8fc; --iaw-accent: #0e7490; --iaw-heading: #134e5a; }
body.theme-forest { --iaw-bg: #f0f6ee; --iaw-panel: #fbfffa; --iaw-sidebar-bg: #f2f8f0; --iaw-accent: #3f7d3a; --iaw-heading: #1f4d1c; }
body.theme-sunset { --iaw-bg: #fdf2ee; --iaw-panel: #fffaf8; --iaw-sidebar-bg: #fdf5f1; --iaw-accent: #c2410c; --iaw-heading: #7c2d12; }
`;

module.exports = { WIKI_SKIN_CSS };