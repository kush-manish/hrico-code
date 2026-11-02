/** Shorts: 2–3 minute narrated explainers, one per NeetCode 150 problem.
 *
 * The scripts (data/shorts.json) were written ahead of time and checked by
 * running both solutions under the tracer. The traces themselves are made on
 * first view and kept on disk, so a short loads instantly afterwards and never
 * spends the judge's per-minute budget.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import * as v from '../validate.js';
import { readLimit, wrap } from '../middleware.js';
import { runTrace } from './debug.js';
import { googleListsOf } from '../questions.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.join(__dirname, '../data/shorts.json');
const CACHE = process.env.SHORTS_CACHE_DIR || path.join(__dirname, '../.cache/shorts');
// Traces built ahead of time (npm run build:shorts) and shipped with the release,
// so a short never has to run its code on the live server.
const BUNDLED = path.join(__dirname, '../data/shorts-traces');

/** File name of one trace: changes whenever the code, signature or input does. */
export function traceName(slug, which, code, meta, input) {
  const h = crypto.createHash('sha1').update(JSON.stringify([code, meta, input])).digest('hex').slice(0, 12);
  return `${slug}-${which}-${h}.json`;
}

let data = null, mtime = 0;
function load() {
  try {
    const m = fs.statSync(FILE).mtimeMs;
    if (data && m === mtime) return data;
    data = JSON.parse(fs.readFileSync(FILE, 'utf8')); mtime = m;
  } catch { data ||= {}; }
  return data;
}

export function argsOf(meta, input) {
  const n = meta.classname ? 2 : (meta.params || []).length;
  return String(input || '').split('\n').map(l => l.trim()).filter(Boolean).slice(0, n)
    .map(l => { try { return JSON.parse(l); } catch { return l; } });
}

let listCache = null;
const inflight = new Map();
async function trace(slug, which, code, meta, input) {
  const name = traceName(slug, which, code, meta, input);
  try { return JSON.parse(fs.readFileSync(path.join(BUNDLED, name), 'utf8')); } catch { /* not bundled */ }
  const file = path.join(CACHE, name);
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* not yet */ }
  if (inflight.has(file)) return inflight.get(file);
  const p = (async () => {
    let d;
    try { d = await runTrace({ code, meta, args: argsOf(meta, input) }); }
    catch (e) { return { steps: [], error: e.message }; }
    try { fs.mkdirSync(CACHE, { recursive: true }); fs.writeFileSync(file, JSON.stringify(d)); } catch { /* read-only disk: serve anyway */ }
    return d;
  })().finally(() => inflight.delete(file));
  inflight.set(file, p);
  return p;
}

export function mount(app) {
  app.get('/api/shorts', readLimit, wrap(async (_req, res) => {
    const d = load();
    if (!listCache || listCache.of !== d) listCache = { of: d, lists: Object.fromEntries(Object.keys(d).map(slug => [slug, googleListsOf(slug)])) };
    res.json({ shorts: Object.entries(d).map(([slug, s]) => ({ slug, title: s.title, pattern: s.pattern, difficulty: s.difficulty, hook: s.hook, neetcode: !!s.neetcode, lists: listCache.lists[slug] || [], insight: s.optimal?.insight || '', time: s.optimal?.time || '', bruteTime: s.brute?.time || '', kind: s.kind || 'problem', name: s.name || undefined, sources: s.sources || undefined, signals: s.signals || undefined, problems: s.problems || undefined })) });
  }));

  app.get('/api/shorts/:slug', readLimit, wrap(async (req, res) => {
    const slug = v.slug(req.params.slug);
    const s = load()[slug];
    if (!s) return res.status(404).json({ error: 'no short for this problem yet' });
    const [optimal, brute] = await Promise.all([
      trace(slug, 'optimal', s.optimalCode, s.meta, s.input),
      s.brute?.code ? trace(slug, 'brute', s.brute.code, s.meta, s.input) : Promise.resolve(null),
    ]);
    res.set('Cache-Control', 'private, max-age=300');
    res.json({ slug, ...s, traces: { optimal, brute } });
  }));
}
