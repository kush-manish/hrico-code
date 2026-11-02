/** The Nov 3 plan: a focused Google L3/L4 shortlist (the coding problems by day, and
 *  the Googleyness questions), solved and practised with the app's own tools. */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { readLimit, wrap } from '../middleware.js';
import { hasQuestion } from '../questions.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.join(__dirname, '../data/plan-nov3.json');
const SHORTS = path.join(__dirname, '../data/shorts.json');

let cache = null;
function load() {
  if (cache) return cache;
  const plan = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  let shorts = {};
  try { shorts = JSON.parse(fs.readFileSync(SHORTS, 'utf8')); } catch { /* no shorts: no badges */ }
  // `local`: already in the app's set (opens instantly); otherwise fetched from LeetCode on first open.
  plan.problems = plan.problems.map(p => ({ ...p, local: hasQuestion(p.slug), short: Boolean(shorts[p.slug]) }));
  return (cache = plan);
}

export function mount(app) {
  app.get('/api/plan-nov3', readLimit, wrap(async (_req, res) => res.json(load())));
}
