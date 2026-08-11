#!/usr/bin/env node
'use strict';

/** One-off: promote an existing user to instance admin. Usage: node scripts/create-admin.js <username> */

const path = require('path');
const fs = require('fs');

const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, '..', 'data'));
const { openDb } = require('../lib/store/db');

const db = openDb(DATA_DIR);
const username = process.argv[2];
if (!username) {
  console.error('usage: node scripts/create-admin.js <username>');
  process.exit(1);
}
const u = db.userByUsername(username);
if (!u) {
  console.error(`no user "${username}" — sign up on the site first, or set ADMIN_USER/ADMIN_PASS env vars on first boot`);
  process.exit(1);
}
u.is_admin = true;
db.put('users', u.id, u);
console.log(`promoted ${username} to instance admin ✓`);