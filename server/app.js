/**
 * Builds the Express app: security headers, logging, body parsing, every
 * router in order, the static site with version-stamped assets, and the
 * error handler last. No listening here, so a test can drive the app
 * in-process and the entry point stays a few lines.
 */
import express from 'express';
import helmet from 'helmet';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { log, requestLogger } from './log.js';
import { errorHandler, NotFound } from './errors.js';
import * as system from './routes/system.js';
import * as questions from './routes/questions.js';
import * as judge from './routes/judge.js';
import * as debug from './routes/debug.js';
import * as neetcode from './routes/neetcode.js';
import * as shorts from './routes/shorts.js';
import * as googleTab from './routes/google.js';
import * as coding from './routes/coding.js';
import * as learn from './routes/learn.js';
import * as talk from './routes/talk.js';
import * as behavioural from './routes/behavioural.js';
import * as resume from './routes/resume.js';
import * as hftRoutes from './routes/hft.js';
import * as planRoutes from './routes/plan.js';
import * as billingRoutes from './routes/billing.js';
import * as authRoutes from './routes/auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '../public');
const VERSIONED = ['focus.js', 'style.css', 'editor.js', 'app.js', 'chat.js', 'behavioural.js',
  'resume.js', 'history.js', 'settings.js', 'voice.js', 'dictation.js', 'visuals.js', 'learn.js', 'prolearn.js', 'smart.js', 'toolkit.js', 'realq.js', 'watch.js', 'animate.js', 'google.js', 'profile.js', 'talk.js', 'home.js', 'hft.js', 'hft-hub.js', 'bank.js', 'attempts.js', 'debugger.js', 'js-runner.js', 'py-runner.js', 'neetcode.js', 'testcases.js', 'gtab.js', 'qf-shell.js', 'qf.css', 'qf-sprint.js', 'qf-design.js', 'qf-anim.js', 'qf-trace.js', 'qf-stories.js', 'qf-watchlib.js', 'qf-coding.js', 'qf-approach.js', 'qf-buddy.js', 'qf-shorts.js', 'qf-plan.js', 'qf-fix.js', 'qf-discuss.js', 'plan-gate.js'];

/**
 * Cloudflare's zone setting rewrites our Cache-Control to max-age=14400, so
 * assets would stay stale for four hours after a deploy no matter what the
 * origin asks for. The HTML itself is not edge-cached, so stamp the asset
 * URLs with a token derived from file mtimes: a deploy changes the token,
 * which changes the URL, which defeats any downstream cache.
 */
function assetVersion() {
  let newest = 0;
  for (const f of VERSIONED) {
    try { newest = Math.max(newest, fs.statSync(path.join(PUBLIC_DIR, f)).mtimeMs); }
    catch { /* a missing asset simply does not contribute */ }
  }
  return Math.floor(newest).toString(36);
}

export function createApp() {
  const app = express();
  // Behind the Cloudflare tunnel, so the client IP arrives in a forwarded header.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        // The page sets its theme from an inline script before first paint, and
        // question HTML from LeetCode carries inline styles. 'wasm-unsafe-eval'
        // is only the WebAssembly compile gate (not general eval) — needed for
        // the vendored Pyodide runtime the Python "Run" path loads in a Worker.
        scriptSrc: ["'self'", "'unsafe-inline'", "'wasm-unsafe-eval'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'"],
        // The JS "Run" path executes the candidate's code in a Worker built
        // from a blob: URL, entirely client-side — 'self' alone does not
        // cover blob: for worker-src.
        workerSrc: ["'self'", 'blob:'],
        // Neural speech arrives as a WAV and plays from a blob: URL; the unlock
        // clip for Safari is a data: URI.
        mediaSrc: ["'self'", 'blob:', 'data:'],
        // Pro-Learn embeds chapter videos, loaded only on click.
        frameSrc: ['https://www.youtube-nocookie.com'],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        // Cloudflare already serves the live site over HTTPS. On a plain-HTTP
        // local preview this directive makes Safari fetch every asset over
        // https://localhost, which fails and leaves the page unstyled.
        upgradeInsecureRequests: null,
      },
    },
    strictTransportSecurity: process.env.QF_PREVIEW === '1' ? false : undefined,
    crossOriginEmbedderPolicy: false,
  }));
  app.use(requestLogger);
  // Only the API needs to know who is asking; static assets skip the session lookup.
  app.use('/api', authRoutes.attachUser);
  // Account routes first: the state sync carries its own, larger body limit.
  app.use((req, res, next) => (req.path === '/api/auth/state' ? next() : express.json({ limit: '256kb' })(req, res, next)));
  authRoutes.mount(app);
  app.use('/api', authRoutes.gate);

  for (const r of [system, questions, judge, debug, neetcode, shorts, googleTab, coding, learn, talk, behavioural, resume, hftRoutes, planRoutes, billingRoutes]) r.mount(app);
  app.use('/api', (_req, _res, next) => next(new NotFound('unknown endpoint')));

  // Re-derived from disk (at most every couple of seconds) rather than once at
  // boot: assets are served from disk, so a file copied in without a restart
  // must still get a new URL, or browsers keep the old one for a year
  // (immutable) while the page expects the new one.
  let indexCache = { at: 0, key: '', html: null };
  const indexHtml = () => {
    if (Date.now() - indexCache.at < 2000) return indexCache.html;
    const file = path.join(PUBLIC_DIR, 'index.html');
    try {
      const v = assetVersion();
      const key = `${v}:${fs.statSync(file).mtimeMs}`;
      if (key !== indexCache.key) indexCache = { key, html: fs.readFileSync(file, 'utf8').replaceAll('__ASSETV__', v) };
    } catch (err) {
      if (indexCache.html === null) log.error('failed to read index.html', { err: err.message });
    }
    indexCache.at = Date.now();
    return indexCache.html;
  };
  indexHtml();

  /**
   * Version-stamped asset paths. A query string (style.css?v=…) can still be
   * answered from a cache entry keyed on the path alone; a distinct path
   * cannot be: the browser has never seen this URL before, so it must fetch it.
   */
  app.get('/v/:token/:file', (req, res, next) => {
    const file = path.basename(req.params.file || '');       // the allowlist is what makes this safe
    if (!VERSIONED.includes(file)) return next();
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    res.sendFile(path.join(PUBLIC_DIR, file), err => { if (err) next(); });
  });
  app.get('/favicon.ico', (_req, res) => res.redirect(301, '/favicon.svg'));
  app.get(['/', '/index.html'], (_req, res) => {
    const html = indexHtml();
    if (!html) return res.status(500).send('index.html missing');
    res.set('Cache-Control', 'no-store');
    res.type('html').send(html);
  });
  // Assets carry no content hash, so revalidate: unchanged files still cost only a 304.
  app.use(express.static(PUBLIC_DIR, {
    etag: true, lastModified: true, maxAge: 0,
    setHeaders: res => res.setHeader('Cache-Control', 'no-cache, must-revalidate'),
  }));

  app.use(errorHandler(log));
  return app;
}
