'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');

const { openDb } = require('./lib/store/db');
const { createApp } = require('./lib/app');
const { makeServer } = require('./lib/server/routes');
const { ts } = require('./lib/util');

/**
 * It's a Wiki! — server entrypoint.
 *
 * Configuration via environment:
 *   PORT          listen port           (default 3000)
 *   DATA_DIR      data folder           (default ./data)
 *   ADMIN_USER    create admin on boot  (default itadmin)
 *   ADMIN_PASS    admin password        (default admin123 — CHANGE ME)
 */

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));

fs.mkdirSync(DATA_DIR, { recursive: true });

const db = openDb(DATA_DIR);

// settings (instance-wide)
const DEFAULT_SETTINGS = {
  id: 'instance',
  site_name: "It's a Wiki!",
  signup_open: true,
  wiki_creation: 'open',       // 'open' | 'admin_only' | 'deny'
  wiki_creation_limit: 0,      // 0 = unlimited
  created_at: ts(),
};
function settings() {
  let s = db.get('settings', 'instance');
  if (!s) {
    s = { ...DEFAULT_SETTINGS, updated_at: ts() };
    db.put('settings', 'instance', s);
  }
  return s;
}

const app = createApp(db, { dataDir: DATA_DIR, eventCap: 30000 });

// seed the admin account
function ensureAdmin() {
  const uname = process.env.ADMIN_USER || 'itadmin';
  let admin = db.userByUsername(uname);
  if (!admin) {
    const { hashPassword } = require('./lib/auth');
    const { uid } = require('./lib/util');
    admin = {
      id: uid('u_'),
      username: uname,
      email: null,
      pass: hashPassword(process.env.ADMIN_PASS || 'admin123'),
      is_admin: true,
      created_at: ts(),
      deleted_at: null,
      bio: 'Instance administrator',
    };
    db.put('users', admin.id, admin);
    console.log(`[itsawiki] created admin account "${uname}" (password from ADMIN_PASS, default "admin123" — change it!)`);
  }
  return admin;
}

const server = express();
server.disable('x-powered-by');
server.use((req, res, next) => {
  // global response headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});
server.use(express.urlencoded({ extended: false, limit: '2mb' }));
server.use(express.json({ limit: '1mb' }));

// simple cookie parser
server.use((req, res, next) => {
  const raw = req.headers.cookie || '';
  req.cookies = {};
  for (const part of raw.split(';')) {
    const idx = part.indexOf('=');
    if (idx > 0) {
      const k = part.slice(0, idx).trim();
      const v = part.slice(idx + 1).trim();
      req.cookies[decodeURIComponent(k)] = decodeURIComponent(v);
    }
  }
  next();
});

server.use('/static', express.static(path.join(__dirname, 'public'), {
  maxAge: '1h', immutable: false,
}));

server.use('/', makeServer({ db, app, settings, dataDir: DATA_DIR }));

// robots + favicon
server.get('/robots.txt', (req, res) => {
  res.type('text/plain').send('User-agent: *\nAllow: /\n');
});
server.get('/favicon.ico', (req, res) => res.redirect('/static/favicon.svg'));

server.use((err, req, res, next) => {
  console.error('[itsawiki] error:', err);
  if (!res.headersSent) {
    res.status(500).send('<h1>Something went wrong</h1><p>' + String(err.message || err) + '</p>');
  }
});

ensureAdmin();
server.listen(PORT, () => {
  console.log(`[itsawiki] It's a Wiki! running at http://localhost:${PORT}`);
  console.log(`[itsawiki] data dir: ${DATA_DIR}`);
  console.log(`[itsawiki] admin: ${process.env.ADMIN_USER || 'itadmin'}${process.env.ADMIN_PASS ? '' : ' (default password: admin123)'}`);
});