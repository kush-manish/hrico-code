/**
 * Cross-cutting request middleware: rate-limit budgets, capability gates,
 * body validation, the resume upload and the profile normaliser. Routers
 * import from here; nothing here knows about a specific route.
 */
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import { capabilities } from './config.js';
import { log } from './log.js';
import * as v from './validate.js';
import { asyncHandler, Unavailable } from './errors.js';
import { normaliseProfile, isEmptyProfile } from './profile.js';
import { MAX_UPLOAD_BYTES } from './resume.js';
import { PLANS, planOf, aiAllowed, pendingFor } from './plans.js';

export const STARTED_AT = Date.now();

export const clientIp = req => req.headers['cf-connecting-ip'] || req.ip;

const limiter = (windowMs, max, message) => rateLimit({
  windowMs,
  max,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: clientIp,
  handler: (req, res) => {
    log.warn('rate limited', { id: req.id, path: req.path, ip: clientIp(req) });
    res.status(429).json({ error: message, code: 'rate_limited' });
  },
});

// Reads are cheap; the judge and the model are not. Separate budgets so a burst
// of chat cannot exhaust the allowance for browsing questions.
export const readLimit = limiter(60_000, Number(process.env.READ_RATE_MAX) || 120, 'too many requests, slow down');
export const judgeLimit = limiter(60_000, Number(process.env.JUDGE_RATE_MAX) || 12, 'too many judge runs, wait a minute');
export const llmLimit = limiter(60_000, 20, 'too many assistant requests, wait a minute');
export const solutionLimit = limiter(300_000, 10, 'too many solution generations, wait a few minutes');
/** Scoring is a single large generation over a whole transcript. */
export const scoreLimit = limiter(300_000, 8, 'too many scorecards, wait a few minutes');
/** Talk-call feedback gets its own budget so it never eats the mock write-ups'. */
export const talkScoreLimit = limiter(300_000, 8, 'too many call reviews, wait a few minutes');
/** Resume analysis is the largest single generation in the app. */
export const resumeLimit = limiter(600_000, 6, 'too many resume analyses, wait a few minutes');
/** Synthesis is CPU work on a shared box; a live call speaks a sentence at a time. */
export const ttsLimit = limiter(60_000, 150, 'too much speech at once, wait a moment');

/**
 * Memory storage only: an uploaded resume is personal data and never touches
 * the disk. The buffer lives for the life of the request and is then dropped.
 */
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 2 },
});

/** 503 when a feature's credentials are absent. Which ones is operator detail, on /readyz. */
export function requireCap(name) {
  return (_req, _res, next) => next(capabilities()[name] ? undefined : new Unavailable(`${name} is unavailable`));
}

/**
 * 402 when the signed-in user's plan has no AI access. The body carries
 * enough for the client to render the upsell popup without a second request:
 * the plan they are on, what unlocks AI, and whether they already have an
 * upgrade request pending.
 */
export function requireAi(req, res, next) {
  if (aiAllowed(req.user)) return next();
  const mine = planOf(req.user);
  res.status(402).json({
    error: 'This needs a plan with AI access.',
    code: 'plan_required',
    plan: mine,
    planLabel: PLANS[mine].label,
    pending: Boolean(pendingFor(req.user?.id)),
  });
}

export const wrap = asyncHandler;

/**
 * Runs a validator over the request body and stashes the clean result.
 * Registered ahead of requireCap so client errors are reported as 400 even
 * when the corresponding capability is switched off.
 */
export const validateBody = build => (req, _res, next) => {
  try {
    req.clean = build(req.body || {});
    next();
  } catch (err) {
    next(err);
  }
};

/** Profile from the browser: validated for size, then re-normalised; null when absent or empty. */
export const cleanProfile = raw => {
  const p = v.profile(raw);
  if (!p) return null;
  const n = normaliseProfile(p);
  return isEmptyProfile(n) ? null : n;
};
