'use strict';

const crypto = require('crypto');
const { ts, now } = require('./util');

/**
 * Auth: password hashing (PBKDF2-SHA256, per-user salt), session tokens.
 * Self-contained so the server can run with zero external dependencies.
 */

const PBKDF2_ITER = 120000;

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(String(password), salt, PBKDF2_ITER, 32, 'sha256').toString('hex');
  return `pbkdf2$${PBKDF2_ITER}$${salt}$${hash}`;
}

function verifyPassword(password, stored) {
  try {
    const [algo, iterStr, salt, hash] = String(stored).split('$');
    if (algo !== 'pbkdf2') return false;
    const iter = parseInt(iterStr, 10);
    const calc = crypto.pbkdf2Sync(String(password), salt, iter, 32, 'sha256').toString('hex');
    const a = Buffer.from(hash, 'hex');
    const b = Buffer.from(calc, 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch (e) {
    return false;
  }
}

const SESSION_DAYS = 90;

function createSession(db, user, req) {
  const token = crypto.randomBytes(32).toString('hex');
  const ip = (req && req.ip) || '';
  db.put('sessions', token, {
    token,
    user_id: user.id,
    username: user.username,
    created_at: ts(),
    expires_at: now() + SESSION_DAYS * 86400000,
    ip,
  });
  return token;
}

function destroySession(db, token) {
  if (token) db.del('sessions', token);
}

function destroyAllSessions(db, userId) {
  for (const s of db.sessionsForUser(userId)) db.del('sessions', s.token);
}

function sessionFromRequest(db, req) {
  const token = req.cookies && req.cookies.session;
  if (!token) return null;
  const s = db.sessionByToken(token);
  if (!s) return null;
  if (s.expires_at < now()) {
    destroySession(db, token);
    return null;
  }
  return s;
}

function userFromRequest(db, req) {
  const s = sessionFromRequest(db, req);
  if (!s) return null;
  const u = db.get('users', s.user_id);
  return u && u.deleted_at ? null : u;
}

module.exports = {
  hashPassword, verifyPassword, createSession, destroySession,
  destroyAllSessions, sessionFromRequest, userFromRequest,
  SESSION_DAYS,
};