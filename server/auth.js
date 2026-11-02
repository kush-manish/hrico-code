/**
 * Accounts: email + password users, server-side sessions, and one saved
 * state blob per user (the tabs keep their data in localStorage; the shell
 * mirrors it here so each person's history follows them between devices).
 *
 * Storage is plain JSON under AUTH_DIR (default ../.data), written atomically.
 * Passwords use scrypt with a per-user salt; session ids are random 32-byte
 * tokens stored hashed, so a copy of the data folder cannot be replayed.
 * The deploy script never touches .data, exactly as it never touches .env.
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { isAdminEmail } from './admin.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const AUTH_DIR = process.env.AUTH_DIR || path.join(__dirname, '../.data');
const USERS = () => path.join(AUTH_DIR, 'users.json');
const SESSIONS = () => path.join(AUTH_DIR, 'sessions.json');
const STATE_DIR = () => path.join(AUTH_DIR, 'state');

export const SESSION_COOKIE = 'qf_session';
export const SESSION_DAYS = 30;
const MAX_STATE_BYTES = 16 * 1024 * 1024;

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value), { mode: 0o600 });
  fs.renameSync(tmp, file);
}

const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const normEmail = e => String(e || '').trim().toLowerCase();

export class AuthError extends Error {
  constructor(message, status = 400, code = 'auth_error') { super(message); this.status = status; this.code = code; }
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex');
  return { salt, hash };
}
function checkPassword(password, user) {
  if (!user?.pw) return false;
  const { hash } = hashPassword(password, user.pw.salt);
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(user.pw.hash, 'hex'));
}

const publicUser = u => u && ({
  id: u.id, email: u.email, name: u.name, role: u.role,
  target: u.target || null, createdAt: u.createdAt, provider: u.provider || 'password',
  plan: u.plan || 'free',
});

/** The operator account always lands on admin/pro; the box owner (first
 * signup) stays admin too but is not auto-upgraded to pro by this check. */
function roleAndPlanFor(email, isFirstUser) {
  if (isAdminEmail(email)) return { role: 'admin', plan: 'pro' };
  if (isFirstUser) return { role: 'admin', plan: 'free' };
  return { role: 'member', plan: 'free' };
}

export function listUsers() { return readJson(USERS(), []); }
export function userCount() { return listUsers().length; }

function validEmail(e) { return /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/.test(e); }
function cleanTarget(t) {
  if (!t || typeof t !== 'object') return null;
  const s = (v, n) => String(v ?? '').slice(0, n).trim();
  const date = s(t.date, 10);
  return {
    company: s(t.company, 60) || 'Google',
    role: s(t.role, 80) || 'Software Engineer',
    level: s(t.level, 20),
    date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : '',
  };
}

export function signup({ name, email, password, target }) {
  email = normEmail(email);
  name = (typeof name === 'string' ? name : '').trim().slice(0, 80);
  if (!validEmail(email)) throw new AuthError('Enter a valid email address.');
  if (typeof password !== 'string' || password.length < 8) throw new AuthError('Use a password of at least 8 characters.');
  if (password.length > 200) throw new AuthError('That password is too long.');
  const users = listUsers();
  if (users.some(u => u.email === email)) throw new AuthError('An account with that email already exists. Sign in instead.', 409, 'exists');
  const user = {
    id: crypto.randomUUID(), email, name: name || email.split('@')[0],
    // The first account on a fresh install runs the box: it alone may change
    // the LeetCode judge credentials and model settings. The admin email is
    // promoted the same way no matter when it signs up.
    ...roleAndPlanFor(email, users.length === 0),
    pw: hashPassword(password), target: cleanTarget(target), createdAt: new Date().toISOString(),
  };
  users.push(user);
  writeJson(USERS(), users);
  return publicUser(user);
}

export function login({ email, password }) {
  const user = listUsers().find(u => u.email === normEmail(email));
  // Same message either way: do not reveal which emails have accounts.
  if (!user || typeof password !== 'string' || !checkPassword(password, user)) {
    throw new AuthError('Email or password is incorrect.', 401, 'bad_credentials');
  }
  return publicUser(user);
}

/** A user vouched for by Cloudflare Access (its Google sign-in), created on first visit. */
export function loginExternal(email, provider = 'google') {
  email = normEmail(email);
  if (!validEmail(email)) throw new AuthError('No verified identity on this request.', 401, 'no_identity');
  const users = listUsers();
  let user = users.find(u => u.email === email);
  if (!user) {
    user = { id: crypto.randomUUID(), email, name: email.split('@')[0],
      ...roleAndPlanFor(email, users.length === 0),
      provider, target: null, createdAt: new Date().toISOString() };
    users.push(user);
    writeJson(USERS(), users);
  } else if (isAdminEmail(email) && (user.role !== 'admin' || user.plan !== 'pro')) {
    // Covers an account that existed before ADMIN_EMAIL was set to it.
    user.role = 'admin'; user.plan = 'pro';
    writeJson(USERS(), users);
  }
  return publicUser(user);
}

export function updateUser(id, patch) {
  const users = listUsers();
  const u = users.find(x => x.id === id);
  if (!u) throw new AuthError('No such user.', 404, 'not_found');
  if (typeof patch.name === 'string') u.name = patch.name.trim().slice(0, 80) || u.name;
  if (patch.target !== undefined) u.target = cleanTarget(patch.target);
  writeJson(USERS(), users);
  return publicUser(u);
}

/** Admin-only: moves a member onto a different plan (e.g. approving an upgrade request). */
export function setPlan(id, plan) {
  const users = listUsers();
  const u = users.find(x => x.id === id);
  if (!u) throw new AuthError('No such user.', 404, 'not_found');
  u.plan = plan;
  writeJson(USERS(), users);
  return publicUser(u);
}

export function changePassword(id, current, next) {
  const users = listUsers();
  const u = users.find(x => x.id === id);
  if (!u) throw new AuthError('No such user.', 404, 'not_found');
  if (u.pw && !checkPassword(String(current || ''), u)) throw new AuthError('Current password is incorrect.', 401, 'bad_credentials');
  if (typeof next !== 'string' || next.length < 8) throw new AuthError('Use a password of at least 8 characters.');
  if (next.length > 200) throw new AuthError('That password is too long.');
  u.pw = hashPassword(next);
  writeJson(USERS(), users);
  dropSessionsFor(id);
}

// ---------------------------------------------------------------- sessions ---

function sessions() {
  const now = Date.now();
  const all = readJson(SESSIONS(), {});
  let dirty = false;
  for (const [k, s] of Object.entries(all)) if (s.exp < now) { delete all[k]; dirty = true; }
  if (dirty) writeJson(SESSIONS(), all);
  return all;
}

export function createSession(userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const all = sessions();
  all[sha(token)] = { uid: userId, exp: Date.now() + SESSION_DAYS * 864e5, at: Date.now() };
  writeJson(SESSIONS(), all);
  return token;
}

export function userForToken(token) {
  if (!token || typeof token !== 'string' || token.length > 100) return null;
  const s = sessions()[sha(token)];
  if (!s) return null;
  return publicUser(listUsers().find(u => u.id === s.uid)) || null;
}

export function destroySession(token) {
  if (!token) return;
  const all = sessions();
  delete all[sha(token)];
  writeJson(SESSIONS(), all);
}

function dropSessionsFor(uid) {
  const all = sessions();
  for (const [k, s] of Object.entries(all)) if (s.uid === uid) delete all[k];
  writeJson(SESSIONS(), all);
}

// ------------------------------------------------------------- user state ---

const stateFile = uid => path.join(STATE_DIR(), `${uid.replace(/[^a-f0-9-]/gi, '')}.json`);

export function readState(uid) { return readJson(stateFile(uid), { keys: {}, savedAt: null }); }

export function writeState(uid, keys) {
  if (!keys || typeof keys !== 'object' || Array.isArray(keys)) throw new AuthError('Bad state.');
  const clean = {};
  for (const [k, v] of Object.entries(keys)) {
    // Keys embed a question slug (dbgWatch:<slug> runs to 83 characters), so
    // the cap is generous: a dropped key is history silently lost.
    if (typeof k !== 'string' || k.length > 200) continue;
    if (v === null || v === undefined) continue;
    clean[k] = typeof v === 'string' ? v : JSON.stringify(v);
  }
  // savedAt is the version the 409 check compares, so it must change on every
  // save: two saves inside one millisecond would otherwise share a version and
  // a stale device could overwrite the newer copy.
  const prev = Date.parse(readState(uid).savedAt || '') || 0;
  const body = { keys: clean, savedAt: new Date(Math.max(Date.now(), prev + 1)).toISOString() };
  if (Buffer.byteLength(JSON.stringify(body)) > MAX_STATE_BYTES) throw new AuthError('Saved data is too large.', 413, 'too_large');
  writeJson(stateFile(uid), body);
  return body.savedAt;
}

export function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    if (k) { try { out[k] = decodeURIComponent(part.slice(i + 1).trim()); } catch { out[k] = part.slice(i + 1).trim(); } }
  }
  return out;
}
