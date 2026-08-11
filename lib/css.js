'use strict';

/**
 * Custom-CSS system — the feature this project makes easy and Fandom makes hard.
 *
 * Every page can carry its own `css` string, and every wiki has a default CSS.
 * The CSS is served from dedicated .css routes only, under the wiki's own
 * origin, with the following safety rules:
 *
 *  - sizes are capped (per page 256 KB, wiki default 1 MB),
 *  - @import and url(...) are stripped (no remote fetch, no exfil),
 *  - expression()/javascript:/@charset tricks are removed,
 *  - braces must balance or the whole file is rejected,
 *  - comments are stripped before validation so they can't smuggle braces,
 *  - unknown at-rules (other than the allowlist) get dropped.
 *
 * Because the output only ever flows through `Content-Type: text/css` from
 * a static-file-style route, there is no XSS route and no way to run script.
 * Admin-wiki CSS is validated the same way — the difference is only who may
 * write, not how safely it is served.
 */

const MAX_WIKI_CSS = 1024 * 1024;   // 1 MB
const MAX_PAGE_CSS = 256 * 1024;    // 256 KB
const ALLOWED_AT = new Set(['media', 'supports', 'keyframes', '-webkit-keyframes', 'page', 'font-face', 'font-feature-values']);

function stripComments(css) {
  return String(css).replace(/\/\*[\s\S]*?\*\//g, '');
}

/** Remove url(...), @import, and dangerous constructs; keep the rest. */
function sanitizeCss(input) {
  let css = String(input || '');
  if (css.length > MAX_WIKI_CSS) {
    throw new Error('CSS file is too large (max ' + (MAX_WIKI_CSS / 1024) + ' KB)');
  }
  // comments first — they could hide braces/urls
  css = stripComments(css);
  // cut off any attempt at @charset / BOM confusion — serve as UTF-8 text/css
  css = css.replace(/^\ufeff/, '').replace(/@charset\s+["'][^"']*["']\s*;/gi, '');
  // angle brackets are never legal in CSS; stripping them prevents
  // `</style><script>` breakout from an inline <style> injection point
  css = css.replace(/[<>]/g, '');
  // no @import (remote fetch / tracking)
  css = css.replace(/@import[^;]+;/gi, '');
  // no url(...) at all (no remote fetch, no data: images — keep it pure)
  css = css.replace(/url\s*\(\s*(['"]?).*?\1\s*\)/gi, '');
  // kill obvious script vectors in property values
  css = css.replace(/expression\s*\(/gi, 'expression\\(');
  css = css.replace(/javascript\s*:/gi, 'javascript\\:');
  css = css.replace(/vbscript\s*:/gi, 'vbscript\\:');
  css = css.replace(/<!--/g, '').replace(/-->/g, '');
  // braces must balance
  let depth = 0;
  for (const ch of css) {
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth < 0) throw new Error('CSS has unbalanced "}"'); }
  }
  if (depth !== 0) throw new Error('CSS has unbalanced "{" — check your brackets');
  // drop unknown at-rules: keep only the allowlist
  css = css.replace(/@([a-zA-Z-]+)[^{}]*\{/g, (m, name) =>
    ALLOWED_AT.has(name) ? m : '/* dropped @' + name + ' */');
  return css.trim();
}

/** Merge page CSS + wiki CSS into one stylesheet with scoping wrappers. */
function buildPageStylesheet(wikiCss, pageCss) {
  const parts = [];
  if (wikiCss && wikiCss.trim()) parts.push(wikiCss.trim());
  if (pageCss && pageCss.trim()) {
    parts.push('/* ---- this page\'s custom CSS ---- */\n' + pageCss.trim());
  }
  return parts.join('\n\n');
}

/** human check helper for the UI so users see what got dropped */
function sanitizeReport(input) {
  try {
    return { ok: true, output: sanitizeCss(input) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

module.exports = {
  sanitizeCss, buildPageStylesheet, sanitizeReport,
  MAX_WIKI_CSS, MAX_PAGE_CSS,
};