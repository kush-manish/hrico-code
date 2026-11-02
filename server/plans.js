/**
 * Feature tiers. Three plans, all free of charge for now — "free" is not a
 * fourth tier, it is what every non-admin account starts on. Moving up is
 * not self-serve: a member raises a request and the admin (see admin.js)
 * approves or declines it. Storage mirrors auth.js — plain JSON under
 * AUTH_DIR, written atomically — so there is no second database to run.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { AUTH_DIR } from './auth.js';

const REQUESTS = () => path.join(AUTH_DIR, 'plan-requests.json');

export const PLANS = Object.freeze({
  free: Object.freeze({ id: 'free', label: 'Free', order: 0, aiAccess: false,
    blurb: 'Browse every question bank, pattern and judge run. No AI-backed features.' }),
  basic: Object.freeze({ id: 'basic', label: 'Basic', order: 1, aiAccess: false,
    blurb: 'Everything in Free. Still no AI access — ask for Pro to unlock the interviewer, tutor and scoring tools.' }),
  pro: Object.freeze({ id: 'pro', label: 'Pro', order: 2, aiAccess: true,
    blurb: 'Full access: AI interviewer chat, scoring, explanations, resume analysis and the Talk/HFT coaches.' }),
});

export const PLAN_IDS = Object.freeze(Object.keys(PLANS));
export const isValidPlan = id => Object.prototype.hasOwnProperty.call(PLANS, id);
export const planOf = user => (user?.plan && isValidPlan(user.plan) ? user.plan : 'free');

/** Admins bypass the plan system entirely; everyone else needs an AI-capable plan. */
export const aiAllowed = user => Boolean(user) && (user.role === 'admin' || PLANS[planOf(user)].aiAccess);

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value), { mode: 0o600 });
  fs.renameSync(tmp, file);
}

export class PlanError extends Error {
  constructor(message, status = 400, code = 'plan_error') { super(message); this.status = status; this.code = code; }
}

export function listRequests() { return readJson(REQUESTS(), []); }

/** One pending request per user at a time — a second ask replaces the first rather than queuing beside it. */
export function createRequest(user, toPlan) {
  if (!isValidPlan(toPlan)) throw new PlanError('Not a plan this app offers.', 400, 'bad_plan');
  const mine = planOf(user);
  if (toPlan === mine) throw new PlanError(`You are already on ${PLANS[mine].label}.`, 409, 'already_on_plan');
  if (PLANS[toPlan].order < PLANS[mine].order) throw new PlanError('Ask the admin directly to move down a plan.', 400, 'downgrade');
  const all = listRequests();
  const existing = all.find(r => r.userId === user.id && r.status === 'pending');
  const req = {
    id: existing?.id || crypto.randomUUID(),
    userId: user.id,
    email: user.email,
    fromPlan: mine,
    toPlan,
    status: 'pending',
    createdAt: existing?.createdAt || new Date().toISOString(),
    decidedAt: null,
    decidedBy: null,
  };
  const next = existing ? all.map(r => (r.id === existing.id ? req : r)) : [...all, req];
  writeJson(REQUESTS(), next);
  return req;
}

export function pendingFor(userId) {
  return listRequests().find(r => r.userId === userId && r.status === 'pending') || null;
}

/** @param {'approved'|'declined'} decision */
export function decideRequest(id, decision, admin) {
  const all = listRequests();
  const req = all.find(r => r.id === id);
  if (!req) throw new PlanError('No such request.', 404, 'not_found');
  if (req.status !== 'pending') throw new PlanError('That request was already decided.', 409, 'already_decided');
  req.status = decision;
  req.decidedAt = new Date().toISOString();
  req.decidedBy = admin?.email || null;
  writeJson(REQUESTS(), all);
  return req;
}
