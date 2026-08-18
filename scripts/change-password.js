#!/usr/bin/env node
'use strict';

/** Reset a user's password from the command line. Usage:
 *  node scripts/change-password.js <username> <new-password>
 *  (set DATA_DIR if not using the default ./data)
 */

const path = require('path');
const { openDb } = require('../lib/store/db');
const { hashPassword } = require('../lib/auth');

const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, '..', 'data'));
const db = openDb(DATA_DIR);

const [,, username, newPass] = process.argv;
if (!username || !newPass) {
  console.error('usage: node scripts/change-password.js <username> <new-password>');
  process.exit(1);
}

const u = db.userByUsername(username);
if (!u) {
  console.error(`no user "${username}"`);
  process.exit(1);
}

if (newPass.length < 8) {
  console.error('password must be at least 8 characters');
  process.exit(1);
}

u.pass = hashPassword(newPass);
db.put('users', u.id, u);
console.log(`password reset for "${username}" (id: ${u.id})`);
