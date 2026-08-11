'use strict';

const fs = require('fs');
const path = require('path');
const { ts } = require('../util');

/**
 * Tiny JSON-file document store with atomic-ish writes (tmp + rename).
 * Each document is a JSON file under <base>/<collection>/<id>.json
 */

function jsonStore(baseDir) {
  fs.mkdirSync(baseDir, { recursive: true });

  function fileFor(collection, id) {
    if (!/^[a-zA-Z0-9_-]+$/.test(collection)) throw new Error('bad collection');
    if (!/^[a-zA-Z0-9._-]+$/.test(id)) throw new Error('bad id: ' + id);
    return path.join(baseDir, collection, id + '.json');
  }

  function read(collection, id) {
    const f = fileFor(collection, id);
    try {
      return JSON.parse(fs.readFileSync(f, 'utf8'));
    } catch (e) {
      if (e.code === 'ENOENT') return null;
      throw e;
    }
  }

  function write(collection, id, doc) {
    const f = fileFor(collection, id);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    const tmp = f + '.tmp' + process.pid;
    fs.writeFileSync(tmp, JSON.stringify(doc, null, 1));
    fs.renameSync(tmp, f);
    return doc;
  }

  function remove(collection, id) {
    const f = fileFor(collection, id);
    try {
      fs.unlinkSync(f);
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }
  }

  function list(collection) {
    const dir = path.join(baseDir, collection);
    let names;
    try {
      names = fs.readdirSync(dir);
    } catch (e) {
      if (e.code === 'ENOENT') return [];
      throw e;
    }
    const out = [];
    for (const n of names) {
      if (!n.endsWith('.json') || n.startsWith('.')) continue;
      const id = n.slice(0, -5);
      const doc = read(collection, id);
      if (doc) out.push(doc);
    }
    return out;
  }

  /** Merge-only update with optimistic concurrency. */
  function mutate(collection, id, mutator, defaultDoc = {}) {
    let doc = read(collection, id);
    if (!doc) doc = { id, ...defaultDoc };
    const next = mutator(doc);
    next.id = id;
    next.updated_at = next.updated_at || ts();
    write(collection, id, next);
    return next;
  }

  return { read, write, remove, list, mutate };
}

module.exports = { jsonStore };