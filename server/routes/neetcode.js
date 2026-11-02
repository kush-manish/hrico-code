/** NeetCode 75 / 150: the curated lists with the official solutions.
 *
 * Data comes from the MIT-licensed neetcode-gh/leetcode repository plus the
 * public list metadata — no model involved. The list endpoint is light (no
 * solution bodies); the solution endpoint returns one question's code.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as v from '../validate.js';
import { readLimit, wrap } from '../middleware.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.join(__dirname, '../data/neetcode.json');
const YT_FILE = path.join(__dirname, '../data/neetcode-yt.json');

/** NeetCode's YouTube playlists (Easy / Medium / Hard), in video order. */
let yt = null;
export function loadYt() {
  if (yt) return yt;
  try { yt = JSON.parse(fs.readFileSync(YT_FILE, 'utf8')); }
  catch { yt = { source: '', lists: {} }; }
  return yt;
}
const ytFind = slug => { for (const l of Object.values(loadYt().lists)) { const q = l.find(x => x.slug === slug); if (q) return q; } return null; };

let data = null;
function load() {
  if (data) return data;
  try { data = JSON.parse(fs.readFileSync(FILE, 'utf8')); }
  catch { data = { source: '', patterns: [], questions: [] }; }
  return data;
}

export function mount(app) {
  app.get('/api/neetcode', readLimit, wrap(async (_req, res) => {
    const d = load();
    res.json({
      source: d.source,
      patterns: d.patterns,
      questions: d.questions.map(({ solution, ...q }) => ({ ...q, hasSolution: Boolean(solution) })),
      // Light rows only; statement and code come with /api/neetcode/solution/:slug.
      yt: Object.fromEntries(Object.entries(loadYt().lists).map(([k, l]) => [k, l.map(({ statement, brute, optimal, ...q }) => ({ ...q, hasSolution: Boolean(optimal?.code) }))])),
      ytSource: loadYt().source,
    });
  }));

  app.get('/api/neetcode/solution/:slug', readLimit, wrap(async (req, res) => {
    const slug = v.slug(req.params.slug);
    const q = load().questions.find(x => x.slug === slug);
    const y = ytFind(slug);
    if (!q && !y) return res.status(404).json({ error: 'not in the NeetCode lists' });
    res.json({
      slug, title: q?.title || y.title, video: q?.video || y.video, videos: y?.videos,
      // The 150's repository solution when there is one; otherwise the one shown in the video.
      solution: q?.solution || y?.optimal?.code || '', source: q ? load().source : loadYt().source,
      brute: y?.brute?.code ? y.brute : null, optimal: y ? { intuition: y.optimal.intuition, time: y.optimal.time, space: y.optimal.space } : null,
      statement: y?.statement || '',
    });
  }));
}
