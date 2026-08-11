'use strict';

/** Shared small helpers. */

function now() {
  return Date.now();
}

function ts() {
  return new Date().toISOString();
}

/** Unique-enough id for files/documents. */
function uid(prefix) {
  const rnd = Math.random().toString(36).slice(2, 10);
  return (prefix || '') + Date.now().toString(36) + rnd;
}

/** Escape a string for safe use inside a single-quoted JS string literal. */
function jsesc(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")
    .replace(/\n/g, '\\n').replace(/\r/g, '\\r');
}

/** Escape for safe use inside a single-quoted shell string (defense in depth). */
function shellesc(s) {
  return "'" + String(s).replace(/'/g, "'\\''") + "'";
}

/**
 * Safe filename for attachments/revision files:
 * lowercase, [a-z0-9._-], ../ impossible, max length enforced.
 */
function safeFilename(name, maxLen = 180) {
  const base = String(name).toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^\.+/, '')
    .replace(/\.+$/, '');
  const clean = base || 'file';
  return clean.slice(0, maxLen);
}

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Normalize a search phrase: lowercase, collapse whitespace. */
function normPhrase(s) {
  return String(s || '').toLowerCase().trim().replace(/\s+/g, ' ');
}

/** Deterministic string hash (FNV-1a 32-bit) — for stable pseudo-random colors. */
function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const AVATAR_COLORS = ['#2d7dd2', '#d23c6d', '#34a85a', '#9c6ade', '#e08a1e', '#2aa5a5', '#c0504d', '#7a8a62'];

/** Stable color for a username / wiki name (avatar dots in CSS). */
function colorFor(name) {
  return AVATAR_COLORS[fnv1a(String(name)) % AVATAR_COLORS.length];
}

/** Format a length in bytes as human readable. */
function humanSize(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1024 / 1024).toFixed(1) + ' MB';
}

/** Strip a leading namespace prefix ("File:", "Category:" …) from a title. */
function stripNs(title) {
  const t = String(title || '').trim();
  const m = /^([A-Za-z][A-Za-z0-9 _-]*):(.*)$/.exec(t);
  if (m) return { ns: m[1], rest: m[2].trim() };
  return { ns: '', rest: t };
}

module.exports = {
  now, ts, uid, jsesc, shellesc, safeFilename, clamp, escapeHtml,
  normPhrase, fnv1a, colorFor, humanSize, stripNs,
};