'use strict';

const { escapeHtml, stripNs, now } = require('./util');

/**
 * Lightweight wikitext engine.
 *
 * Supports the syntax most useful on a Fandom-style wiki:
 *   sections, tables, links ([[...]], [[...|label]]), external links, images,
 *   templates ({{...}}), basic transclusion of pages/templates, categories,
 *   bold/italic/underline/mono, headings, lists, indents, horizontal rules,
 *   blockquotes, <ref>/<references/>, <gallery>, <nowiki>/<pre>/<code>/<noinclude>,
 *   magic words ({{PAGENAME}}, {{CURRENTYEAR}} ...), {{DEFAULTSORT}}, and
 *   redirect pages. Output is HTML with class hooks for easy CSS.
 *
 * Securing: raw HTML is NOT trusted from any editor (everyone can edit
 * templates, so HTML authored there gets the same treatment). Normal
 * editors' raw HTML is escaped; the template phase only restores an explicit
 * tag allowlist whose attributes are parsed, entity-decoded, filtered
 * (no on* / javascript: / vbscript: / data:), sanitized for style, and
 * re-escaped. CSS files are served under a separate .css route with a strict
 * mirror policy, so they can never run as HTML/script.
 */

// magic words
const MAGIC = {
  PAGENAME: (ctx) => ctx.pageTitle || '',
  FULLPAGENAME: (ctx) => ctx.pageTitle || '',
  SITENAME: (ctx) => ctx.wikiName || '',
  CURRENTYEAR: () => String(new Date().getFullYear()),
  CURRENTMONTH: () => String(new Date().getMonth() + 1).padStart(2, '0'),
  CURRENTMONTHNAME: () => ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'][new Date().getMonth()],
  CURRENTDAY: () => String(new Date().getDate()),
  CURRENTTIME: () => new Date().toTimeString().slice(0, 8),
  NUMBEROFPAGES: (ctx) => String((ctx.db && ctx.db.pagesForWiki(ctx.wikiId) || []).length),
};

const TEMPLATE_NS = /^[Tt]emplate:/;

function parseTitle(fullTitle, options = {}) {
  const t = String(fullTitle || '').trim().replace(/^:/, '');
  const { ns, rest } = stripNs(t);
  const nsLower = ns.toLowerCase();
  let type = 'page';
  let name = t;
  if (nsLower === 'file' || nsLower === 'image') { type = 'file'; name = rest; }
  else if (nsLower === 'category') { type = 'category'; name = rest; }
  else if (nsLower === 'template') { type = 'template'; name = rest; }
  else if (nsLower === 'special' || nsLower === 'mediawiki') { type = 'special'; name = rest; }
  return { raw: t, ns, nsLower, type, name: name || t };
}

function classifyLink(fullTitle) {
  const p = parseTitle(fullTitle);
  const lower = p.name.toLowerCase();
  const isRedir = /^(redir(?:ect)?|转?向?|重定向)$/i.test(lower);
  switch (p.type) {
    case 'file': return { kind: 'file', title: p.raw, name: p.name };
    case 'category': return { kind: 'category', title: p.raw, name: p.name };
    case 'template': return { kind: 'template', title: p.raw, name: p.name };
    case 'special': return { kind: 'special', title: p.raw, name: p.name, isRedir };
    default: return { kind: 'page', title: p.raw, name: p.name, isRedir };
  }
}

// --------------------------------------------------------------------------
// scanning helpers

function findClosing(text, openIdx, openTok, closeTok, opts = {}) {
  let depth = opts.depth == null ? 1 : opts.depth;
  let i = openIdx + openTok.length;
  while (i < text.length) {
    const c2 = text.slice(i, i + 2);
    if (c2 === openTok) { depth++; i += 2; continue; }
    if (c2 === closeTok) {
      depth--;
      if (depth === 0) return i;
      i += 2;
      continue;
    }
    i++;
  }
  return -1;
}

function splitArgs(str) {
  const args = [];
  let cur = '';
  let depth = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === '{') {
      const c2 = str.slice(i, i + 2);
      if (c2 === '{{' || c2 === '{{{') { depth++; cur += c2; i += 1; continue; }
    }
    if (ch === '}') {
      const c2 = str.slice(i, i + 2);
      if (c2 === '}}' || c2 === '}}}') { depth--; cur += c2; i += 1; continue; }
    }
    if (ch === '|' && depth === 0) { args.push(cur); cur = ''; continue; }
    if (ch === '\n') { cur += ' '; continue; }
    cur += ch;
  }
  args.push(cur);
  return args;
}

// --------------------------------------------------------------------------
// the renderer

function makeRenderer(options) {
  const opts = options || {};
  const db = opts.db;
  const TOC = opts.toc !== false;
  const MAX_TEMPLATE_DEPTH = 8;
  const categoryLinks = [];

  function renderPage(text, ctx) {
    categoryLinks.length = 0;
    const res = parseBlocks(String(text || ''), ctx, 0, {});
    let html = res.html;
    const toc = res.toc;
    let tocHtml = '';
    if (TOC && ctx.toc !== false && toc.length) {
      tocHtml = `<nav class="iaw-toc" role="navigation" aria-label="Table of contents"><div class="iaw-toc-title">Contents</div><ol>`;
      for (const h of toc) {
        tocHtml += `<li data-level="${h.level}"><a href="#${h.id}">${escapeHtml(h.text)}</a></li>`;
      }
      tocHtml += `</ol></nav>`;
    }
    let cats = '';
    const uniqCats = [...new Set(categoryLinks)];
    if (uniqCats.length) {
      cats = `<div class="iaw-categories">Categories: `;
      cats += uniqCats.map((c) => `<a class="iaw-catlink" href="/w/${encodeURIComponent(ctx.wikiKey || '')}/c/${encodeURIComponent(c)}">${escapeHtml(c)}</a>`).join(', ');
      cats += `</div>`;
    }
    return { html, toc: tocHtml, categories: uniqCats, categoryLinks: uniqCats };
  }

  /** Split into top-level blocks and render each. Returns html + toc entries. */
  function parseBlocks(text, ctx, depth, state) {
    const out = [];
    const toc = [];
    const lines = text.split('\n');
    let i = 0;
    let para = [];
    let paraStart = 0;

    const flushPara = () => {
      if (para.length) {
        const joined = para.join('\n');
        if (joined.trim()) {
          const inner = inline(joined, ctx, depth, state);
          if (inner.trim()) out.push({ type: 'raw', html: `<p>${inner}</p>` });
        }
        para = [];
      }
    };

    while (i < lines.length) {
      let line = lines[i];
      let stripped = line.trim();
      // ---- tables ----
      if (stripped.startsWith('{|')) {
        flushPara();
        const { table, consumed } = consumeTable(lines, i, ctx, depth, state);
        out.push({ type: 'table', html: table });
        i += consumed;
        continue;
      }
      // ---- section headings ----
      const h = /^={1,6}\s*(.*?)\s*={1,6}\s*$/.exec(stripped);
      if (h) {
        flushPara();
        const level = (stripped.match(/^=+/)[0].length);
        const text2 = inline(h[1], ctx, depth, state);
        const id = slugify(plainTextOf(h[1]));
        toc.push({ level, text: plainTextOf(h[1]), id });
        out.push({ type: 'raw', html: `<h${Math.min(6, level + 1)} id="${id}">${text2}</h${Math.min(6, level + 1)}>` });
        i++;
        continue;
      }
      // ---- hr ----
      if (stripped === '----' || stripped === '-----\n'.trim() || /^-{4,}$/.test(stripped)) {
        flushPara();
        out.push({ type: 'raw', html: '<hr>' });
        i++;
        continue;
      }
      // ---- redirect ----
      if (/^#redirect\b/i.test(stripped)) {
        flushPara();
        let targetMatch = stripped.replace(/^#redirect\b:?\s*/i, '').trim();
        // accept [[Target]] or plain Target
        targetMatch = targetMatch.replace(/^\[\[/, '').replace(/\]\]$/, '');
        if (targetMatch) {
          const l = inlineLink(targetMatch, ctx, depth, state) || '<span>target</span>';
          out.push({ type: 'raw', html: `<div class="iaw-redirect">Redirected from page: ${l}</div>` });
        } else {
          out.push({ type: 'raw', html: '' });
        }
        i++;
        continue;
      }
      // ---- lists / indents ----
      const listMatch = /^([*#;:]{1,10})\s*(.*)$/.exec(stripped);
      const quoteMatch = /^>+ ?(.*)$/.exec(stripped);
      if (listMatch) {
        flushPara();
        const consume = consumeList(lines, i, ctx, depth, state);
        out.push({ type: 'raw', html: consume.html });
        i += consume.consumed;
        continue;
      }
      if (quoteMatch) {
        flushPara();
        const consume = consumeQuote(lines, i, ctx, depth, state);
        out.push({ type: 'raw', html: consume.html });
        i += consume.consumed;
        continue;
      }
      // ---- <gallery> ----
      const gal = /^<gallery((?:[^>]*))>\s*$/.exec(stripped);
      if (gal) {
        flushPara();
        const end = findTagEndIndex(lines, i, 'gallery');
        if (end >= 0) {
          const inner = lines.slice(i + 1, end).join('\n');
          out.push({ type: 'raw', html: renderGallery(inner, ctx, depth, state) });
          i = end + 1;
          continue;
        }
      }
      // ---- block tags ----
      const selfClosingRef = /^<references\s*\/?\s*>/.test(stripped);
      if (selfClosingRef) {
        flushPara();
        state.refsDone = true;
        out.push({ type: 'raw', html: renderRefs(state.refs) });
        state.refs = [];
        i++;
        continue;
      }
      const tagM = /^<(pre|nowiki|code|noinclude|includeonly|ref|references|center)((?:\s[^>]*)?)>/.exec(stripped);
      if (tagM && stripped.startsWith('<' + tagM[1])) {
        flushPara();
        const tag = tagM[1];
        if (tag === 'noinclude' || tag === 'includeonly') {
          // transclusion semantics — just drop the wrapper when not transcluding
          const end = findTagEndIndex(lines, i, tag);
          if (end >= 0) { i = end + 1; continue; }
          i++;
          continue;
        }
        if (tag === 'ref' || tag === 'references') {
          const end = findTagEndIndex(lines, i, tag);
          if (end >= 0) {
            const inner = lines.slice(i + 1, end).join('\n');
            if (tag === 'ref') {
              state.refs = state.refs || [];
              state.refs.push({ html: inline(inner, ctx, depth, state) });
            } else {
              state.refsDone = true;
              out.push({ type: 'raw', html: renderRefs(state.refs) });
              state.refs = [];
            }
            i = end + 1;
            continue;
          }
          i++;
          continue;
        }
        // pre / nowiki / code / center: single or multi line
        // single-line form: <tag...>content</tag>
        const single = new RegExp('^<(' + tag + ')((?:\\s[^>]*)?)>(.*?)</\\1>\\s*$', 'i').exec(stripped);
        // Reject if the inner content contains a nested opening tag of the same
        // type — that means the regex greedily swallowed a second <tag>...</tag>
        // pair on the same line. Let the inline scanner handle those instead.
        if (single && !new RegExp('<' + tag + '\\b', 'i').test(single[3])) {
          out.push({ type: 'raw', html: renderBlockTag(tag, single[3], single[2] || '') });
          i++;
          continue;
        }
        const end = findTagEndIndex(lines, i, tag);
        if (end >= 0) {
          // content continues on the opening line and between
          const openRest = stripped.slice(tagM[0].length);
          const middle = lines.slice(i + 1, end).join('\n');
          let inner = openRest;
          if (middle) inner = openRest ? openRest + '\n' + middle : middle;
          const closeLine = lines[end].trim();
          const closeRest = closeLine.replace(new RegExp('</' + tag + '>\\s*$', 'i'), '').trim();
          if (closeRest) inner = inner ? inner + '\n' + closeRest : closeRest;
          out.push({ type: 'raw', html: renderBlockTag(tag, inner, tagM[2] || '') });
          i = end + 1;
          continue;
        }
        // unclosed: treat as paragraph text
        para.push(line);
        i++;
        continue;
      }

      // blank line ends paragraph
      if (stripped === '') {
        flushPara();
        i++;
        continue;
      }
      para.push(line);
      i++;
    }
    flushPara();

    // render blocks
    let html = '';
    for (const b of out) {
      html += b.html + '\n';
    }
    return { html, toc };
  }

  function inline(text, ctx, depth, state) {
    // first pass: templates (recursive), second: wiki markup
    let t = String(text || '');
    t = t.replace(/<noinclude>[\s\S]*?<\/noinclude>/g, '').replace(/<includeonly>([\s\S]*?)<\/includeonly>/g, '$1');
    // Protect content inside <nowiki>/<pre>/<code> from template expansion
    // so that {{...}} and {{{...}}} inside them are not processed.
    const pb = [];
    t = t.replace(/<(nowiki|pre|code)((?:\s[^>]*)?)>([\s\S]*?)<\/\1>/gi, (m) => {
      pb.push(m);
      return '\u001f' + (pb.length - 1) + '\u001f';
    });
    const placeholders = [];
    t = applyTemplates(t, ctx, depth + 1, state, state.templateSeen || {})
      .replace(/\x00/g, '');
    if (pb.length) {
      t = t.replace(/\u001f(\d+)\u001f/g, (m, n) => pb[Number(n)]);
    }
    // Protect HTML produced by template expansion from the text scanner.
    // Tags the scanner itself handles (nowiki/ref/pre/code/b/i/…) are left
    // untouched; everything else that looks like a tag becomes a placeholder.
    const scannerHandled = new Set(['nowiki', 'pre', 'code', 'ref', 'references', 'noinclude',
      'includeonly', 'gallery', 'span', 'div', 'center', 'b', 'i', 'u', 's', 'em', 'strong',
      'small', 'sub', 'sup']);
    // Only these tags may pass through from template expansion. Anything else
    // (script, iframe, link, meta, style, …) stays visible to the scanner,
    // which escapes its angle brackets character by character.
    const RESTORABLE_TAGS = new Set(['a', 'div', 'span', 'table', 'tbody', 'thead', 'tr', 'td',
      'th', 'ul', 'ol', 'li', 'sup', 'figure', 'figcaption', 'img', 'blockquote', 'p',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'pre', 'code', 'br', 'hr', 'center', 'nav',
      'section', 'dl', 'dt', 'dd', 'em', 'strong', 'small', 'sub', 'b', 'i', 'u', 's']);
    // Any tag NOT in the allowlist stays visible to the scanner below, which
    // escapes its angle brackets character-by-character — that is the actual
    // security boundary. Allowlisted tags are parsed and sanitized here
    // (entity-decoded attribute names/values filtered, then re-escaped) before
    // being stashed, so encoded payloads like on&#101;rror= or jav&#97;script:
    // cannot survive into the restored HTML.
    const decodeEntities = (s) => String(s).replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z][a-zA-Z0-9]*);/g, (m, ent) => {
      const lower = ent.toLowerCase();
      if (lower.startsWith('#x')) {
        try { return String.fromCodePoint(parseInt(ent.slice(2), 16)); } catch { return ''; }
      }
      if (lower.startsWith('#')) {
        try { return String.fromCodePoint(parseInt(ent.slice(1), 10)); } catch { return ''; }
      }
      const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", colon: ':', nbsp: ' ' };
      return named[lower] != null ? named[lower] : m;
    });
    const sanitizeTag = (tagHtml) => {
      const m = /^<\/?\s*([a-zA-Z][a-zA-Z0-9-]*)((?:\s[^>]*)?)\/?\s*>$/.exec(tagHtml);
      if (!m) return escapeHtml(tagHtml); // malformed — never emit raw
      const tagName = m[1];
      if (tagHtml.trim().startsWith('</')) return `</${tagName}>`;
      const kept = [];
      const attrRe = /([a-zA-Z_:][a-zA-Z0-9_:.-]*)\s*=\s*("[^"]*"|'[^']*'|[^\s"'=<>`]+)/g;
      let am;
      while ((am = attrRe.exec(m[2] || ''))) {
        let rawVal = am[2];
        if (rawVal[0] === '"' || rawVal[0] === "'") rawVal = rawVal.slice(1, -1);
        const name = decodeEntities(am[1]).trim().toLowerCase();
        const val = decodeEntities(rawVal).replace(/[\r\n\t]+/g, ' ').trim();
        if (/^on/i.test(name)) continue; // event handlers — drop
        if (/^(javascript|vbscript|data):/i.test(val)) continue; // script schemes — drop
        if (name === 'style') {
          const st = sanitizeCssDecls(val);
          if (!st) continue;
          kept.push(`style="${escapeHtml(st)}"`);
          continue;
        }
        if (val === '' && !rawVal.startsWith('"')) continue; // drop empty unquoted attrs
        // Values are quoted by construction before import, so escapeHtml's
        // suppression of angle brackets can't break out of the attribute;
        // keep that invariant if changing the quoting here.
        kept.push(`${name}="${escapeHtml(val)}"`);
      }
      return `<${tagName}${kept.length ? ' ' + kept.join(' ') : ''}>`;
    };
    t = t.replace(/<\/?[a-zA-Z][a-zA-Z0-9-]*(?:\s[^>]*)?>/g, (m) => {
      const name = ((m.match(/^<\/?([a-zA-Z][a-zA-Z0-9-]*)/) || [])[1] || '').toLowerCase();
      if (scannerHandled.has(name)) return m;
      if (!RESTORABLE_TAGS.has(name)) return m; // scanner will escape it
      const ph = '\u0001P' + placeholders.length + '\u0001';
      placeholders.push(sanitizeTag(m));
      return ph;
    });
    let out = '';
    let i = 0;
    const PROTECTED_INLINE = new Set(['nowiki', 'pre', 'code', 'ref', 'span', 'div', 'center', 'b', 'i', 'u', 's', 'em', 'strong', 'small', 'sub', 'sup']);
    while (i < t.length) {
      const c2 = t.slice(i, i + 2);
      // ---- template-produced HTML placeholders ----
      if (t[i] === '\u0001') {
        const close = t.indexOf('\u0001', i + 1);
        if (close > i) {
          const n = Number(t.slice(i + 2, close));
          out += (placeholders[n] == null ? '' : placeholders[n]);
          i = close + 1;
          continue;
        }
      }
      if (c2 === '[[') {
        const end = findClosing(t, i, '[[', ']]');
        if (end >= 0) {
          const inner = t.slice(i + 2, end);
          out += inlineLink(inner, ctx, depth, state);
          i = end + 2;
          continue;
        }
        out += '[[';
        i += 2;
        continue;
      }
      // ---- inline html-ish tags (balanced) ----
      if (t[i] === '<') {
        const gt = t.indexOf('>', i);
        if (gt > i + 1) {
          const tagContent = t.slice(i + 1, gt).trim();
          const isClosing = tagContent.startsWith('/');
          const tagName = (isClosing ? tagContent.slice(1) : tagContent).split(/[\s/]/)[0].toLowerCase();
          if (!isClosing && PROTECTED_INLINE.has(tagName) && /^[a-z0-9-]+$/.test(tagName)) {
            const closeEnd = findClosingTag(t, gt + 1, tagName);
            if (closeEnd > 0) {
              const innerRaw = t.slice(gt + 1, closeEnd);
              const closeLen = tagName.length;
              const outerClose = `</${tagName}>`;
              if (tagName === 'nowiki') {
                out += escapeHtml(innerRaw);
              } else if (tagName === 'pre') {
                out += `<pre>${escapeHtml(innerRaw)}</pre>`;
              } else if (tagName === 'code') {
                out += `<code>${escapeHtml(innerRaw)}</code>`;
              } else if (tagName === 'ref') {
                if (!state.refs) state.refs = [];
                state.refs.push({ html: inline(innerRaw, ctx, depth, state) });
                out += `<sup class="iaw-ref"><a href="#iaw-refs">&nbsp;[${state.refs.length}]</a></sup>`;
              } else {
                out += `<${tagName}>${inline(innerRaw, ctx, depth, state)}</${tagName}>`;
              }
              i = closeEnd + outerClose.length;
              continue;
            }
          }
        }
        out += escapeHtml('<');
        i++;
        continue;
      }
      if (c2 === '{{') {
        // already handled by applyTemplates, but catch leftovers
        const end = findClosing(t, i, '{{', '}}');
        if (end >= 0) {
          const inner = t.slice(i + 2, end);
          const argParts = splitArgs(inner);
          const name = argParts[0].trim();
          out += `{{${escapeHtml(name)}${argParts.length > 1 ? '|…' : ''}}}`;
          i = end + 2;
          continue;
        }
        out += '{{';
        i += 2;
        continue;
      }
      if (c2 === "''") {
        // bold+italic: '''''text'''''  (check 5-apostrophe before 3/2)
        const m5 = /^'''''(.*?)'''''/s.exec(t.slice(i));
        if (m5) {
          out += `<b><i>${inline(m5[1], ctx, depth, state)}</i></b>`;
          i += m5[0].length;
          continue;
        }
        // bold: '''text'''
        const m3 = /^'''(.*?)'''/s.exec(t.slice(i));
        if (m3) {
          out += `<b>${inline(m3[1], ctx, depth, state)}</b>`;
          i += m3[0].length;
          continue;
        }
        // italic: ''text''
        const m2 = /^''(.*?)''/s.exec(t.slice(i));
        if (m2) {
          out += `<i>${inline(m2[1], ctx, depth, state)}</i>`;
          i += m2[0].length;
          continue;
        }
        out += "''";
        i += 2;
        continue;
      }
      // underline: ++text++
      if (c2 === '++') {
        const close = t.indexOf('++', i + 2);
        if (close > i + 2) {
          out += `<u>${inline(t.slice(i + 2, close), ctx, depth, state)}</u>`;
          i = close + 2;
          continue;
        }
        out += '++';
        i += 2;
        continue;
      }
      // strikethrough: --text--
      if (c2 === '--') {
        const close = t.indexOf('--', i + 2);
        if (close > i + 2) {
          out += `<s>${inline(t.slice(i + 2, close), ctx, depth, state)}</s>`;
          i = close + 2;
          continue;
        }
        out += '--';
        i += 2;
        continue;
      }
      // external links [url text] or bare https://…
      if (t[i] === '[' && c2 !== '[[') {
        const closeIdx = t.indexOf(']', i);
        if (closeIdx > i + 1) {
          const parts = t.slice(i + 1, closeIdx).split(/\s+/, 2);
          const url = parts[0];
          if (isSafeUrl(url)) {
            const label = parts[1] != null ? inline(parts[1], ctx, depth, state) : escapeHtml(url);
            out += `<a class="iaw-extlink" href="${escapeHtml(url)}" target="_blank" rel="noopener nofollow">${label}</a>`;
            i = closeIdx + 1;
            continue;
          }
        }
        out += '[';
        i++;
        continue;
      }
      if (t[i] === 'h' && /^https?:\/\//i.test(t.slice(i))) {
        const m = /^https?:\/\/[^\s<>"']+/.exec(t.slice(i));
        if (m) {
          out += `<a class="iaw-extlink" href="${escapeHtml(m[0])}" target="_blank" rel="noopener nofollow">${escapeHtml(m[0])}</a>`;
          i += m[0].length;
          continue;
        }
      }
      if (t[i] === '&') {
        const semi = t.indexOf(';', i);
        const ent = t.slice(i, semi > 0 && semi < i + 12 ? semi + 1 : i + 1);
        if (/^&(#\d+|#x[0-9a-f]+|[a-zA-Z][a-zA-Z0-9]+);$/.test(ent)) {
          out += ent;
          i += ent.length;
          continue;
        }
      }
      out += escapeHtml(t[i]);
      i++;
    }
    // restore template-produced HTML placeholders — only allowlisted tags
    out = out.replace(/\u0001P(\d+)\u0001/g, (m, n) => {
      const val = placeholders[Number(n)];
      if (val == null) return '';
      const name = ((val.match(/^<\/?([a-zA-Z][a-zA-Z0-9-]*)/) || [])[1] || '').toLowerCase();
      return RESTORABLE_TAGS.has(name) ? val : escapeHtml(val);
    });
    return out;
  }

  /** Find the index of the closing tag line for a block tag spanning lines. */
  function findTagEndIndex(lines, startIdx, tag) {
    for (let j = startIdx + 1; j < lines.length; j++) {
      if (new RegExp(`</${tag}>\\s*$`, 'i').test(lines[j].trim())) return j;
    }
    return -1;
  }

  function findClosingTag(t, from, tagName) {
    let i = from;
    let depth = 1; // the tag we are inside already counts
    while (i < t.length) {
      const closer = t.indexOf(`</${tagName}>`, i);
      const opener = t.indexOf(`<${tagName}`, i);
      const closerLen = tagName.length + 3;
      if (opener >= 0 && (closer < 0 || opener < closer)) {
        depth++;
        i = opener + closerLen - 1;
        continue;
      }
      if (closer >= 0) {
        depth--;
        if (depth === 0) return closer;
        i = closer + closerLen;
        continue;
      }
      break;
    }
    return -1;
  }

  function inlineLink(inner, ctx, depth, state) {
    // embedded file syntax: [[File:x.jpg|thumb|Caption]]
    const parts = inner.split('|');
    const target = parts[0].trim();
    const cls = classifyLink(target);
    const rest = parts.slice(1);
    if (cls.kind === 'file') {
      return renderFileLink(cls, rest, ctx, depth, state);
    }
    if (cls.kind === 'category') {
      if (rest.length) {
        // sort key / silenced export — drop the link
        return '';
      }
      categoryLinks.push(cls.name);
      return '';
    }
    if (cls.kind === 'template') {
      // [[Template:...]] as a plain link
      return `<a class="iaw-link iaw-template-link" href="/w/${encodeURIComponent(ctx.wikiKey || '')}/t/${encodeURIComponent(cls.name)}">${escapeHtml(rest[0] || cls.name)}</a>`;
    }
    if (cls.kind === 'special') {
      return `<a class="iaw-link" href="/w/${encodeURIComponent(ctx.wikiKey || '')}/${encodeURIComponent(cls.title)}">${escapeHtml(rest[0] || cls.title)}</a>`;
    }
    // page link
    const isSelf = ctx.pageTitle && pageTitleEquals(cls.title, ctx.pageTitle);
    const href = `/w/${encodeURIComponent(ctx.wikiKey || '')}/p/${encodeURIComponent(cls.title)}`;
    const redirCls = cls.isRedir ? ' iaw-redir' : '';
    if (isSelf) {
      return `<b>${escapeHtml(rest.length && rest[0].trim() !== '' ? rest[0] : cls.title)}</b>`;
    }
    // pipe trick: [[Page name|]] → label is empty → use last segment of title
    const labelText = rest.length && rest[0].trim() !== '' ? rest[0] : pipeTrickLabel(cls.title);
    return `<a class="iaw-link${redirCls}" href="${href}">${inline(escapeHtml(labelText), ctx, depth, state)}</a>`;
  }

  function pipeTrickLabel(title) {
    // [[Page name|]] → "name"; [[User:John/Smith|]] → "Smith"
    const slashIdx = title.lastIndexOf('/');
    if (slashIdx >= 0) return title.slice(slashIdx + 1);
    const colonIdx = title.lastIndexOf(':');
    if (colonIdx >= 0) return title.slice(colonIdx + 1);
    return title;
  }

  function pageTitleEquals(a, b) {
    return String(a).replace(/_/g, ' ').trim().toLowerCase() ===
      String(b).replace(/_/g, ' ').trim().toLowerCase();
  }

  function renderFileLink(cls, rest, ctx, depth, state) {
    const wikiKey = ctx.wikiKey || '';
    const name = cls.name;
    // [[File:x]] with no options
    if (!rest.length) {
      return `<a href="/w/${encodeURIComponent(wikiKey)}/f/${encodeURIComponent(name)}"><img class="iaw-img" alt="${escapeHtml(name)}" src="/w/${encodeURIComponent(wikiKey)}/f/${encodeURIComponent(name)}/raw" loading="lazy"></a>`;
    }
    let thumb = false, framed = false, align = '', width = '', cap = '';
    const options = [];
    for (const r of rest) {
      const opt = r.trim();
      if (opt === 'thumb' || opt === 'thumbnail') thumb = true;
      else if (opt === 'frame' || opt === 'framed') framed = true;
      else if (opt === 'left' || opt === 'right' || opt === 'center' || opt === 'none') align = opt;
      else if (/^\d+px$/.test(opt)) width = opt;
      else if (/^x\d+px$/.test(opt)) width = opt;
      else cap = opt;
    }
    let src = `/w/${encodeURIComponent(wikiKey)}/f/${encodeURIComponent(name)}/raw`;
    if (thumb || framed) {
      const cls2 = `iaw-figure${align ? ' align-' + align : ''}`;
      return `<figure class="${cls2}"><a href="/w/${encodeURIComponent(wikiKey)}/f/${encodeURIComponent(name)}"><img class="iaw-img" alt="${escapeHtml(cap || name)}" src="${src}" loading="lazy"></a>${cap ? `<figcaption>${inline(cap, ctx, depth, state)}</figcaption>` : ''}</figure>`;
    }
    const cls2 = `iaw-imgwrap${align ? ' align-' + align : ''}`;
    return `<div class="${cls2}"><a href="/w/${encodeURIComponent(wikiKey)}/f/${encodeURIComponent(name)}"><img class="iaw-img" alt="${escapeHtml(cap || name)}" src="${src}" loading="lazy"></a>${cap ? `<div class="iaw-imgcap">${inline(cap, ctx, depth, state)}</div>` : ''}</div>`;
  }

  function renderGallery(inner, ctx, depth, state) {
    const items = [];
    let buf = '';
    const lines = inner.split('\n');
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      const parts = line.split('|');
      const target = parts[0].trim();
      const cls = classifyLink(target);
      if (cls.kind === 'file') {
        const cap = parts.slice(1).map((p) => p.trim()).filter(Boolean).join(' ');
        const src = `/w/${encodeURIComponent(ctx.wikiKey || '')}/f/${encodeURIComponent(cls.name)}/raw`;
        items.push(`<figure class="iaw-gitem"><img class="iaw-img" src="${src}" alt="${escapeHtml(cap || cls.name)}" loading="lazy"><figcaption>${cap ? inline(cap, ctx, depth, state) : ''}</figcaption></figure>`);
      } else if (line.startsWith('http')) {
        items.push(`<figure class="iaw-gitem"><img class="iaw-img" src="${escapeHtml(line)}" alt="" loading="lazy"></figure>`);
      }
    }
    return `<div class="iaw-gallery">${items.join('')}</div>`;
  }

  function renderBlockTag(tag, inner, attrs) {
    switch (tag) {
      case 'pre': return `<pre>${escapeHtml(inner)}</pre>`;
      case 'nowiki': return escapeHtml(inner);
      case 'code': return `<code>${escapeHtml(inner)}</code>`;
      case 'center': return `<div class="iaw-center">${inline(inner, ctx0(), 1, {})}</div>`;
      default: return `<div>${escapeHtml(inner)}</div>`;
    }
  }

  // tiny shim so renderBlockTag's inline call has a context
  let _ctxShim = {};
  function ctx0() { return _ctxShim; }
  function setCtxShim(c) { _ctxShim = c; }

  function renderRefs(refs) {
    if (!refs || !refs.length) return '';
    const items = refs.map((r, ix) => `<li id="iaw-ref-${ix + 1}">${r.html}</li>`).join('');
    return `<div class="iaw-refs" id="iaw-refs"><h3>References</h3><ol class="iaw-refs-list">${items}</ol></div>`;
  }

  // --------------------------------------------------------------------------
  // templates

  function applyTemplates(text, ctx, depth, state, seen) {
    if (depth > MAX_TEMPLATE_DEPTH || typeof text !== 'string') return text;
    let t = text;
    let iter = 0;
    while (t.includes('{{') && iter < 40) {
      iter++;
      const open = t.indexOf('{{');
      const close = findClosing(t, open, '{{', '}}');
      if (close < 0) break;
      const inner = t.slice(open + 2, close);
      const args = splitArgs(inner);
      const name = args[0].trim().replace(/^:\s*/, '');
      if (!name) { t = t.slice(0, open) + escapeHtml(inner) + t.slice(close + 2); continue; }
      const named = {};
      const positional = [];
      for (const a of args.slice(1)) {
        const eq = a.indexOf('=');
        if (eq > 0 && /^[A-Za-z0-9 _-]+$/.test(a.slice(0, eq).trim())) {
          named[a.slice(0, eq).trim().toLowerCase()] = a.slice(eq + 1).trim();
        } else {
          positional.push(a.trim());
        }
      }
      const magicVal = MAGIC[name.toUpperCase()] && MAGIC[name.toUpperCase()](ctx);
      if (magicVal !== undefined) {
        let mOut = magicVal;
        // substitute args inside magic expansion when possible
        if (name.toUpperCase() === 'NUMBEROFPAGES') mOut = magicVal;
        t = t.slice(0, open) + escapeHtml(mOut) + t.slice(close + 2);
        continue;
      }
      // {{!}} and {{=}} escapes
      if (name === '!') { t = t.slice(0, open) + '|' + t.slice(close + 2); continue; }
      if (name === '=') { t = t.slice(0, open) + '=' + t.slice(close + 2); continue; }
      if (/^<ref/.test(name) || /^<references/.test(name)) {
        // let the inline pass handle tags
        t = t.slice(0, open) + '{{' + inner + '}}' + t.slice(close + 2);
        break;
      }
      // transclusion
      const title = name.replace(/^[Tt]emplate:/, '');
      const key = 'T:' + title.toLowerCase();
      if (seen[key]) {
        t = t.slice(0, open) + `<!-- loop: ${escapeHtml(name)} -->` + t.slice(close + 2);
        continue;
      }
      const src = transcludeSource(title, ctx);
      if (src == null) {
        // red template: show redlinked name
        t = t.slice(0, open) +
          `<a class="iaw-link iaw-missing" href="/w/${encodeURIComponent(ctx.wikiKey || '')}/t/${encodeURIComponent(title)}">${escapeHtml('Template:' + title)}</a>` +
          t.slice(close + 2);
        continue;
      }
      // expand args inside the template text
      const expanded = expandTemplateBody(src, args, named, positional);
      const subSeen = { ...seen, [key]: true };
      const rendered = applyTemplates(expanded, ctx, depth + 1, state, subSeen);
      t = t.slice(0, open) + rendered + t.slice(close + 2);
    }
    return t;
  }

  function transcludeSource(title, ctx) {
    const full = TEMPLATE_NS.test(title) ? title : 'Template:' + title;
    let target;
    if (typeof opts.templateSource === 'function') {
      target = opts.templateSource(full, ctx);
    } else if (db) {
      const p = db.pageByTitle(ctx.wikiId, normalizeTitle(full));
      if (p) target = p;
    }
    return target ? normalizeTitle(target.title) === normalizeTitle(full) ? target.content : null : null;
  }

  function normalizeTitle(t) {
    return String(t || '').replace(/_/g, ' ').trim().replace(/\s+/g, ' ');
  }

  function expandTemplateBody(src, rawArgs, named, positional) {
    let body = src || '';
    // positional params
    body = body.replace(/\{\{\{\s*(\d+)\s*(?:\|([^}]*))?\}\}\}/g, (m, num, def) => {
      const idx = parseInt(num, 10) - 1;
      if (idx < positional.length) return positional[idx];
      return def != null ? def : '';
    });
    body = body.replace(/\{\{\{\s*([A-Za-z0-9 _-]+)\s*(?:\|([^}]*))?\}\}\}/g, (m, nm, def) => {
      const lower = nm.toLowerCase();
      if (named[lower] !== undefined) return named[lower];
      return def != null ? def : '';
    });
    return body;
  }

  // --------------------------------------------------------------------------
  // lists / quotes / tables

  function consumeList(lines, start, ctx, depth, state) {
    // collect consecutive list lines of the SAME kind (* vs # vs ;/:).
    // A blank line ends the block; a different kind starts a new block
    // (the main loop will catch it as a new list).
    const items = [];
    const kindOf = (line) => {
      const m = /^([*#;:])/.exec(line.trim());
      return m ? m[1] : null;
    };
    const firstKind = kindOf(lines[start]);
    let i = start;
    while (i < lines.length) {
      const trimmed = lines[i].trim();
      if (trimmed === '') break;
      const m = /^([*#;:]{1,10})\s*(.*)$/.exec(trimmed);
      if (!m) break;
      if (m[1][0] !== firstKind) break; // different list kind → stop; main loop re-enters
      items.push({ levels: m[1].split(''), text: inline(m[2], ctx, depth, state) });
      i++;
    }
    return { html: renderListItems(items), consumed: i - start };
  }

  function renderListItems(items) {
    if (!items || !items.length) return '';
    const first = items[0] || { levels: ['*'] };
    const bullet = first.levels[0] === '*' || first.levels[0] === ';' || first.levels[0] === ':';
    const tag = bullet ? 'ul' : 'ol';
    const lis = items.map((it) => {
      const d = Math.min(6, it.levels.length);
      const cls = it.levels[0] === ';' ? 'iaw-def' : it.levels[0] === ':' ? 'iaw-ind' : '';
      const content = it.levels[0] === ';' && it.text ? `<dt>${it.text}</dt>` : `<li data-depth="${d}">${it.text}</li>`;
      return content;
    });
    const wrapTag = itag(items);
    return `<${wrapTag}>${lis.join('')}</${wrapTag}>`;
  }

  function itag(items) {
    const first = (items[0] && items[0].levels[0]) || '*';
    return first === '#' ? 'ol' : 'ul';
  }

  function consumeQuote(lines, start, ctx, depth, state) {
    const qs = [];
    let i = start;
    while (i < lines.length) {
      const m = /^>+ ?(.*)$/.exec(lines[i].trim());
      if (!m) break;
      qs.push(inline(m[1], ctx, depth, state));
      i++;
    }
    return { html: `<blockquote>${qs.join('<br>')}</blockquote>`, consumed: i - start };
  }

  function consumeTable(lines, start, ctx, depth, state) {
    // lines from start: {| ... |- ... |+ ... ! ... | ... |}
    const openAttrs = attrFromLine(lines[start].slice(2));
    let i = start + 1;
    let caption = null;
    const rows = [];
    let curRow = null;
    while (i < lines.length) {
      const line = lines[i];
      const trimmed = line.trim();
      if (trimmed.startsWith('|}')) { i++; break; }
      if (trimmed.startsWith('|+')) {
        caption = inline(trimmed.slice(2).trim(), ctx, depth, state);
        i++;
        continue;
      }
      if (/^\|-/.test(trimmed)) {
        if (curRow) { rows.push(curRow); curRow = null; }
        i++;
        continue;
      }
      if (trimmed.startsWith('!')) {
        // header cells — starts a new row when none is open
        if (!curRow) curRow = { cells: [], header: true };
        const cells = splitCells(trimmed.slice(1));
        for (const c of cells) curRow.cells.push({ text: c, header: true });
        i++;
        continue;
      }
      if (trimmed.startsWith('|') && !trimmed.startsWith('|-')) {
        // data cells — starts a new row when none is open
        if (!curRow) curRow = { cells: [], header: false };
        const rest = trimmed.slice(1).replace(/^\s+/, '');
        const cells = splitCells(rest);
        for (const c of cells) curRow.cells.push({ text: c, header: false });
        i++;
        continue;
      }
      if (curRow && curRow.cells.length && trimmed !== '') {
        // continuation of previous cell
        const last = curRow.cells[curRow.cells.length - 1];
        last.text += ' ' + trimmed;
        i++;
        continue;
      }
      i++;
    }
    if (curRow) rows.push(curRow);

    let html = `<table class="iaw-table"${openAttrs ? ' ' + openAttrs : ''}>\n`;
    if (caption) html += `<caption>${caption}</caption>\n`;
    const renderRow = (r) => {
      const tds = r.cells.map((c) => {
        const cellAttrs = attrsFromCell(c.text);
        const tag = r.header ? 'th' : 'td';
        return `<${tag}${cellAttrs ? ' ' + cellAttrs : ''}>${inline(stripCellAttrs(c.text), ctx, depth, state)}</${tag}>`;
      });
      return `<tr>${tds.join('')}</tr>`;
    };
    if (rows.length && rows[0].header) {
      html += `<thead>${renderRow(rows[0])}</thead>\n`;
      rows.shift();
    }
    if (rows.length) {
      html += `<tbody>${rows.map(renderRow).join('\n')}</tbody>\n`;
    }
    html += `</table>\n`;
    return { table: html, consumed: i - start };
  }

  function splitCells(rest) {
    const cells = [];
    let cur = '';
    let i = 0;
    while (i < rest.length) {
      const ch = rest[i];
      // "||" or "!!" separators
      if ((ch === '|' || ch === '!') && rest[i + 1] === ch && i > 0 && cur.trim() !== '') {
        // inside [[...]] protection handled below; here treat as separator
        cells.push(cur.trim());
        cur = '';
        i += 2;
        continue;
      }
      if (ch === '[' && rest.slice(i, i + 2) === '[[') {
        const close2 = rest.indexOf(']]', i);
        if (close2 >= 0) { cur += rest.slice(i, close2 + 2); i = close2 + 2; continue; }
      }
      cur += ch;
      i++;
    }
    if (cur.trim() !== '' || cells.length === 0) cells.push(cur.trim());
    return cells;
  }

  function attrsFromCell(text) {
    // leading attribute syntax: style="..." etc up to "|"
    const m = /^([A-Za-z][A-Za-z0-9_-]*\s*=\s*"[^"]*"(?:\s+[A-Za-z][A-Za-z0-9_-]*\s*=\s*"[^"]*")*)\s*\|(.*)$/.exec(text);
    if (!m) return null;
    return sanitizeAttrs(m[1]);
  }

  function stripCellAttrs(text) {
    const m = /^([A-Za-z][A-Za-z0-9_-]*\s*=\s*"[^"]*"(?:\s+[A-Za-z][A-Za-z0-9_-]*\s*=\s*"[^"]*")*)\s*\|(.*)$/.exec(text);
    return m ? m[2] : text;
  }

  const ALLOWED_ATTR = new Set(['style', 'class', 'align', 'width', 'colspan', 'rowspan', 'scope', 'bgcolor']);

  function sanitizeAttrs(attrStr) {
    let out = '';
    const re = /([A-Za-z][A-Za-z0-9_-]*)\s*=\s*"([^"]*)"/g;
    let m;
    while ((m = re.exec(attrStr))) {
      const name = m[1].toLowerCase();
      let val = m[2];
      if (!ALLOWED_ATTR.has(name)) continue;
      if (name === 'style') {
        const st = sanitizeCssDecls(val);
        if (st) out += ` style="${escapeHtml(st)}"`;
      } else if (name === 'class') {
        out += ` class="${escapeHtml(val)}"`;
      } else {
        out += ` ${name}="${escapeHtml(val)}"`;
      }
    }
    return out;
  }

  function sanitizeCssDecls(decls) {
    // allow simple safe declarations only
    const parts = String(decls || '').split(';');
    const kept = [];
    for (const p of parts) {
      const p2 = p.trim();
      if (!p2) continue;
      const m = /^([a-z-]+)\s*:\s*(.+)$/i.exec(p2);
      if (!m) continue;
      const prop = m[1].toLowerCase();
      const val = m[2].trim();
      if (/^(color|background|background-color|border|border-color|text-align|text-decoration|font-size|font-weight|font-style|margin|padding|width|height|float|clear|vertical-align|max-width|display)$/.test(prop) &&
          !/[;{}<>]/.test(val) && val.length < 200) {
        kept.push(`${prop}: ${val}`);
      }
    }
    return kept.join('; ');
  }

  function attrFromLine(rest) {
    return sanitizeAttrs(rest);
  }

  function slugify(s) {
    return String(s || '').toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-').replace(/-+/g, '-') || 'sec';
  }

  function plainTextOf(s) {
    return String(s || '').replace(/'{2,}/g, '').replace(/\[\[([^\]|]*\|)?([^\]]*)\]\]/g, '$2')
      .replace(/\[([^\s\]]+)\s+([^\]]+)\]/g, '$2').replace(/\{\{[^}]*\}\}/g, '').trim();
  }

  function isSafeUrl(url) {
    return /^(https?|mailto|ftp):\/\//i.test(url) && !/[<>"']/.test(url);
  }

  return {
    render: (text, ctx) => {
      setCtxShim(ctx || {});
      return renderPage(text, ctx || {});
    },
    classifyLink,
    parseTitle,
    // exposed for tests
    _internals: { splitArgs, findClosing, slugify, plainTextOf, sanitizeCssDecls },
  };
}

module.exports = { makeRenderer, parseTitle, classifyLink };