/**
 * Accounts over HTTP: sign up, sign in (password or Cloudflare Access/Google),
 * sign out, the signed-in user, their saved state, and the gate that keeps
 * every other /api route behind a session.
 */
import express from 'express';
import rateLimit from 'express-rate-limit';
import * as auth from '../auth.js';
import { log } from '../log.js';
import { clientIp } from '../middleware.js';

const AUTH_REQUIRED = process.env.AUTH_REQUIRED !== '0';
// The app listens on the docker bridge only cloudflared can reach, so the
// identity header Cloudflare Access adds after its Google sign-in is trusted.
// Off unless the site really sits behind Cloudflare Access: without Access in front,
// anyone can send this header and sign in as any email.
const TRUST_ACCESS = process.env.TRUST_CF_ACCESS === '1';

const authLimit = rateLimit({
  windowMs: 10 * 60_000, max: Number(process.env.AUTH_RATE_MAX) || 30, standardHeaders: true, legacyHeaders: false, keyGenerator: clientIp,
  handler: (_req, res) => res.status(429).json({ error: 'Too many sign-in attempts. Wait a few minutes.', code: 'rate_limited' }),
});

const accessEmail = req => (TRUST_ACCESS ? String(req.headers['cf-access-authenticated-user-email'] || '') : '') || null;
const tokenOf = req => auth.parseCookies(req.headers.cookie)[auth.SESSION_COOKIE];

function setSession(req, res, userId) {
  const token = auth.createSession(userId);
  res.cookie(auth.SESSION_COOKIE, token, {
    httpOnly: true, sameSite: 'lax', path: '/',
    secure: req.secure || req.headers['x-forwarded-proto'] === 'https',
    maxAge: auth.SESSION_DAYS * 864e5,
  });
}

const fail = (res, err) => {
  if (err instanceof auth.AuthError) return res.status(err.status).json({ error: err.message, code: err.code });
  log.error('auth failure', { err: err.message });
  return res.status(500).json({ error: 'Something went wrong. Try again.', code: 'internal' });
};

/** Attaches req.user on every request; cheap (two small JSON reads). */
export function attachUser(req, _res, next) {
  try { req.user = auth.userForToken(tokenOf(req)); } catch { req.user = null; }
  next();
}

/** Every /api route except the account ones needs a signed-in user. */
export function gate(req, res, next) {
  if (!AUTH_REQUIRED) return next();
  if (req.path.startsWith('/auth/')) return next();
  if (!req.user) return res.status(401).json({ error: 'Sign in to continue.', code: 'signed_out' });
  // Changing the shared LeetCode judge login is the box owner's job.
  // Normalise first: Express matches routes case-insensitively and ignores a
  // trailing slash, so a raw comparison could be sidestepped.
  const p = req.path.toLowerCase().replace(/\/+$/, '');
  if (req.method !== 'GET' && p === '/leetcode/credentials' && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Only the admin can change the LeetCode judge credentials.', code: 'forbidden' });
  }
  next();
}

export function mount(app) {
  const big = express.json({ limit: '18mb' });

  app.get('/api/auth/me', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({
      user: req.user || null,
      required: AUTH_REQUIRED,
      external: accessEmail(req),
      firstUser: auth.userCount() === 0,
      // The shell restores a user's saved tabs before the app boots.
      state: req.user && req.query.state === '1' ? auth.readState(req.user.id) : undefined,
    });
  });

  app.post('/api/auth/signup', authLimit, (req, res) => {
    try {
      const user = auth.signup(req.body || {});
      setSession(req, res, user.id);
      log.info('signup', { uid: user.id, role: user.role });
      res.status(201).json({ user });
    } catch (err) { fail(res, err); }
  });

  app.post('/api/auth/login', authLimit, (req, res) => {
    try {
      const user = auth.login(req.body || {});
      setSession(req, res, user.id);
      res.json({ user });
    } catch (err) {
      if (err.code === 'bad_credentials') log.warn('login failed', { ip: clientIp(req) });
      fail(res, err);
    }
  });

  /** "Continue with Google": the identity Cloudflare Access already verified. */
  app.post('/api/auth/google', authLimit, (req, res) => {
    try {
      const email = accessEmail(req);
      if (!email) throw new auth.AuthError('Google sign-in is available on the live site (through Cloudflare Access).', 400, 'no_identity');
      const user = auth.loginExternal(email, 'google');
      setSession(req, res, user.id);
      res.json({ user });
    } catch (err) { fail(res, err); }
  });

  app.post('/api/auth/logout', (req, res) => {
    auth.destroySession(tokenOf(req));
    res.clearCookie(auth.SESSION_COOKIE, { path: '/' });
    res.json({ ok: true });
  });

  const needUser = (req, res, next) => (req.user ? next() : res.status(401).json({ error: 'Sign in to continue.', code: 'signed_out' }));

  app.patch('/api/auth/me', needUser, (req, res) => {
    try { res.json({ user: auth.updateUser(req.user.id, req.body || {}) }); } catch (err) { fail(res, err); }
  });

  app.post('/api/auth/password', authLimit, needUser, (req, res) => {
    try {
      auth.changePassword(req.user.id, req.body?.current, req.body?.next);
      setSession(req, res, req.user.id);
      res.json({ ok: true });
    } catch (err) { fail(res, err); }
  });

  app.get('/api/auth/state', needUser, (req, res) => res.json(auth.readState(req.user.id)));

  app.put('/api/auth/state', big, needUser, (req, res) => {
    try {
      // Another device saved since this one last synced: hand back the newer
      // copy so the client can merge instead of overwriting it.
      const base = req.body?.base ?? null;
      const cur = auth.readState(req.user.id);
      if (cur.savedAt && base !== cur.savedAt) return res.status(409).json({ error: 'newer data on the server', code: 'stale', state: cur });
      res.json({ savedAt: auth.writeState(req.user.id, req.body?.keys) });
    } catch (err) { fail(res, err); }
  });
}
