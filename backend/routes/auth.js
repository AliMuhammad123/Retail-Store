// routes/auth.js
// Simple, dependency-free authentication:
//  - passwords hashed with scrypt (built into Node)
//  - login state kept in a signed, httpOnly cookie (HMAC-signed token)
//  - first run: if there are no users yet, the owner creates their account
//
// This is what makes it safe to put the app on the public internet: without a
// valid session cookie, none of the /api data routes will answer.

import { Router } from 'express';
import crypto from 'crypto';
import db from '../db/database.js';

const router = Router();
const COOKIE = 'rm_session';
const WEEK = 7 * 24 * 60 * 60 * 1000; // sessions last a week

// --- session signing key: generated once and stored so logins survive restarts ---
function sessionSecret() {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('session_secret');
  if (row) return row.value;
  const secret = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('session_secret', secret);
  return secret;
}

// --- password hashing (scrypt) ---
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return { hash, salt };
}
function verifyPassword(password, salt, expectedHash) {
  const { hash } = hashPassword(password, salt);
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(expectedHash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// --- signed token: base64(payload).hmac ---
function signToken(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', sessionSecret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}
function verifyToken(token) {
  if (!token || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', sessionSecret()).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

// --- tiny cookie helpers (avoids adding cookie-parser) ---
function readCookie(req, name) {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}
function setSessionCookie(res, token) {
  const secure = process.env.NODE_ENV === 'production'; // https-only once hosted
  const parts = [
    `${COOKIE}=${encodeURIComponent(token)}`,
    'HttpOnly',
    'Path=/',
    'SameSite=Lax',
    `Max-Age=${Math.floor(WEEK / 1000)}`,
  ];
  if (secure) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}
function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; Path=/; Max-Age=0`);
}

const userCount = () => db.prepare('SELECT COUNT(*) AS n FROM users').get().n;

// --- middleware other routes use to require a logged-in user ---
export function requireAuth(req, res, next) {
  const payload = verifyToken(readCookie(req, COOKIE));
  if (!payload) return res.status(401).json({ error: 'Not signed in' });
  // Load the current role/permissions fresh (so changes take effect immediately).
  const user = db.prepare('SELECT id, username, role, can_delete, can_discount FROM users WHERE id = ?').get(payload.uid);
  if (!user) return res.status(401).json({ error: 'Account no longer exists' });
  req.user = user;
  next();
}

// Only the owner may pass (staff management, etc.)
export function requireOwner(req, res, next) {
  if (!req.user || req.user.role !== 'owner') {
    return res.status(403).json({ error: 'Only the owner can do this' });
  }
  next();
}

// Owner always may delete; staff may delete only if granted permission.
export function requireDelete(req, res, next) {
  if (req.user && (req.user.role === 'owner' || req.user.can_delete)) return next();
  return res.status(403).json({ error: 'You don’t have permission to delete. Ask the owner.' });
}

// Owner always may apply discounts; staff only if granted.
export function canDiscount(user) {
  return !!(user && (user.role === 'owner' || user.can_discount));
}

// GET /api/auth/me -> tells the frontend whether to show login, setup, or the app
const DEMO = process.env.DEMO_MODE === '1';
const demoInfo = () => (DEMO ? { demo: true, demo_username: 'demo', demo_password: 'demo1234' } : { demo: false });

router.get('/me', (req, res) => {
  if (userCount() === 0) return res.json({ authenticated: false, needsSetup: true, ...demoInfo() });
  const payload = verifyToken(readCookie(req, COOKIE));
  if (!payload) return res.json({ authenticated: false, needsSetup: false, ...demoInfo() });
  const user = db.prepare('SELECT id, username, role, can_delete, can_discount FROM users WHERE id = ?').get(payload.uid);
  if (!user) return res.json({ authenticated: false, needsSetup: false, ...demoInfo() });
  res.json({
    authenticated: true,
    user: { id: user.id, username: user.username, role: user.role, can_delete: !!user.can_delete, can_discount: !!user.can_discount },
  });
});

// POST /api/auth/setup -> create the very first (owner) account; only works once
router.post('/setup', (req, res) => {
  if (userCount() > 0) return res.status(400).json({ error: 'Setup already completed' });
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');
  if (username.length < 3) return res.status(400).json({ error: 'Username must be at least 3 characters' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
  const { hash, salt } = hashPassword(password);
  const info = db.prepare(
    'INSERT INTO users (username, password_hash, password_salt, role, can_delete, can_discount) VALUES (?, ?, ?, ?, 1, 1)'
  ).run(username, hash, salt, 'owner');
  const token = signToken({ uid: Number(info.lastInsertRowid), username, exp: Date.now() + WEEK });
  setSessionCookie(res, token);
  res.json({ ok: true, user: { username, role: 'owner', can_delete: true, can_discount: true } });
});

// POST /api/auth/login
router.post('/login', (req, res) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !verifyPassword(password, user.password_salt, user.password_hash)) {
    return res.status(401).json({ error: 'Wrong username or password' });
  }
  const token = signToken({ uid: user.id, username: user.username, exp: Date.now() + WEEK });
  setSessionCookie(res, token);
  res.json({ ok: true, user: { username: user.username, role: user.role, can_delete: !!user.can_delete, can_discount: !!user.can_discount } });
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

// ---- Staff management (owner only) ----

// GET /api/auth/users -> list all accounts
router.get('/users', requireAuth, requireOwner, (req, res) => {
  const rows = db.prepare(
    'SELECT id, username, role, can_delete, can_discount, created_at FROM users ORDER BY role DESC, username'
  ).all();
  res.json({ list: rows.map((u) => ({ ...u, can_delete: !!u.can_delete, can_discount: !!u.can_discount, is_you: u.id === req.user.id })) });
});

// POST /api/auth/users -> owner adds a staff account
router.post('/users', requireAuth, requireOwner, (req, res) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');
  const canDelete = req.body.can_delete ? 1 : 0;
  const canDiscount = req.body.can_discount ? 1 : 0;
  if (username.length < 3) return res.status(400).json({ error: 'Username must be at least 3 characters' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
  if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(username)) {
    return res.status(400).json({ error: 'That username is already taken' });
  }
  const { hash, salt } = hashPassword(password);
  db.prepare('INSERT INTO users (username, password_hash, password_salt, role, can_delete, can_discount) VALUES (?, ?, ?, ?, ?, ?)')
    .run(username, hash, salt, 'staff', canDelete, canDiscount);
  res.json({ ok: true });
});

// PATCH /api/auth/users/:id -> owner changes a staff member's delete permission
router.patch('/users/:id', requireAuth, requireOwner, (req, res) => {
  const id = Number(req.params.id);
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!target) return res.status(404).json({ error: 'Staff member not found' });
  if (target.role === 'owner') return res.status(400).json({ error: 'The owner already has full rights' });
  const fields = [];
  const vals = [];
  if ('can_delete' in req.body) { fields.push('can_delete = ?'); vals.push(req.body.can_delete ? 1 : 0); }
  if ('can_discount' in req.body) { fields.push('can_discount = ?'); vals.push(req.body.can_discount ? 1 : 0); }
  if (!fields.length) return res.status(400).json({ error: 'Nothing to update' });
  vals.push(id);
  db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).run(...vals);
  res.json({ ok: true });
});

// DELETE /api/auth/users/:id -> owner removes a staff account
router.delete('/users/:id', requireAuth, requireOwner, (req, res) => {
  const id = Number(req.params.id);
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!target) return res.status(404).json({ error: 'Staff member not found' });
  if (target.role === 'owner') return res.status(400).json({ error: 'The owner account cannot be removed' });
  if (id === req.user.id) return res.status(400).json({ error: 'You cannot remove your own account' });
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  res.json({ ok: true });
});

export default router;
