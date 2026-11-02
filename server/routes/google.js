/** Google tab: the LeetCode "Google" company lists (last 30 days, last 3
 *  months), grouped the way NeetCode groups its 150 — Arrays & Hashing, Two
 *  Pointers, Sliding Window … — with LeetCode's frequency and topic tags kept
 *  for filtering. Every question carries a Python solution with insight,
 *  approach and complexity (from the Google CSV exports); the ones also in
 *  the NeetCode 150 additionally offer the official NeetCode solution + video. */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { questionsIn, question } from '../questions.js';
import * as v from '../validate.js';
import { readLimit, wrap } from '../middleware.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const NEETCODE = path.join(__dirname, '../data/neetcode.json');
const SOLUTIONS = path.join(__dirname, '../data/google-solutions.json');

const LISTS = {
  '30d': { name: 'Google-Last-30-Days', label: 'Last 30 days' },
  '3m': { name: 'Google-Last-3-Months', label: 'Last 3 months' },
};

/** NeetCode's 18 patterns in neetcode.io order, plus one bucket for the
 *  design / simulation questions Google asks that NeetCode has no shelf for. */
export const PATTERNS = [
  'Arrays & Hashing', 'Two Pointers', 'Sliding Window', 'Stack', 'Binary Search',
  'Linked List', 'Trees', 'Heap / Priority Queue', 'Backtracking', 'Tries',
  'Graphs', 'Advanced Graphs', '1-D Dynamic Programming', '2-D Dynamic Programming',
  'Greedy', 'Intervals', 'Math & Geometry', 'Bit Manipulation', 'Design & Simulation',
];

/**
 * LeetCode topic tag -> NeetCode pattern, most specific first. A question is
 * filed under the first rule any of its tags matches, so "Sliding Window"
 * beats the "Array" / "Hash Table" tags that almost every question also has.
 */
const TAG_RULES = [
  ['Trie', 'Tries'],
  ['Sliding Window', 'Sliding Window'],
  ['Monotonic Queue', 'Sliding Window'],
  ['Monotonic Stack', 'Stack'],
  ['Bracket Sequences', 'Stack'],
  ['Linked List', 'Linked List'],
  ['Doubly-Linked List', 'Linked List'],
  ["Floyd's Cycle Finding Algorithm", 'Linked List'],
  ['Topological Sort', 'Advanced Graphs'],
  ["Dijkstra's Algorithm", 'Advanced Graphs'],
  ['Shortest Path', 'Advanced Graphs'],
  ['Minimum Spanning Tree', 'Advanced Graphs'],
  ["Kruskal's Algorithm", 'Advanced Graphs'],
  ["Prim's Algorithm", 'Advanced Graphs'],
  ['Strongly Connected Component', 'Advanced Graphs'],
  ['Biconnected Component', 'Advanced Graphs'],
  ['Eulerian Circuit', 'Advanced Graphs'],
  ['Union-Find', 'Graphs'],
  ['Graph', 'Graphs'],
  ['Graph Theory', 'Graphs'],
  ['Binary Search Tree', 'Trees'],
  ['Binary Tree', 'Trees'],
  ['Tree', 'Trees'],
  ['Segment Tree', 'Trees'],
  ['Binary Indexed Tree', 'Trees'],
  ['Backtracking', 'Backtracking'],
  ['Heap (Priority Queue)', 'Heap / Priority Queue'],
  ['Line Sweep', 'Intervals'],
  ['Sweep Line', 'Intervals'],
  ['Interval', 'Intervals'],
  ['Bit Manipulation', 'Bit Manipulation'],
  ['Bitmask', 'Bit Manipulation'],
  ['Binary Search', 'Binary Search'],
  ['Two Pointers', 'Two Pointers'],
  ['Design', 'Design & Simulation'],
  ['Data Stream', 'Design & Simulation'],
  ['Iterator', 'Design & Simulation'],
  ['Matrix', '2-D Dynamic Programming'],   // only reached when DP is also tagged (see below)
  ['Dynamic Programming', '1-D Dynamic Programming'],
  ['Memoization', '1-D Dynamic Programming'],
  ['Greedy', 'Greedy'],
  ['Depth-First Search', 'Graphs'],
  ['Breadth-First Search', 'Graphs'],
  ['Geometry', 'Math & Geometry'],
  ['Math', 'Math & Geometry'],
  ['Number Theory', 'Math & Geometry'],
  ['Combinatorics', 'Math & Geometry'],
  ['Game Theory', 'Math & Geometry'],
  ['Simulation', 'Design & Simulation'],
  ['Stack', 'Stack'],
  ['Queue', 'Design & Simulation'],
  ['Divide and Conquer', 'Arrays & Hashing'],
  ['Recursion', 'Arrays & Hashing'],
  ['Prefix Sum', 'Arrays & Hashing'],
  ['Hash Table', 'Arrays & Hashing'],
  ['Sorting', 'Arrays & Hashing'],
  ['Counting', 'Arrays & Hashing'],
  ['String', 'Arrays & Hashing'],
  ['Array', 'Arrays & Hashing'],
];
const RULE_INDEX = new Map(TAG_RULES.map(([tag, p], i) => [tag, { pattern: p, rank: i }]));

export function classify(tags) {
  const set = new Set(tags || []);
  // DP on a grid is NeetCode's "2-D DP"; the Matrix rule alone must not fire.
  const dp = set.has('Dynamic Programming') || set.has('Memoization');
  let best = null;
  for (const t of set) {
    const r = RULE_INDEX.get(t);
    if (!r) continue;
    if (t === 'Matrix' && !dp) continue;
    if (!best || r.rank < best.rank) best = r;
  }
  if (best?.pattern === '1-D Dynamic Programming' && set.has('Matrix')) return '2-D Dynamic Programming';
  return best?.pattern || 'Arrays & Hashing';
}

let neet = null;
function neetIndex() {
  if (neet) return neet;
  neet = new Map();
  try {
    const d = JSON.parse(fs.readFileSync(NEETCODE, 'utf8'));
    for (const q of d.questions || []) neet.set(q.slug, { pattern: q.pattern, blind75: Boolean(q.blind75), video: q.video || null, hasSolution: Boolean(q.solution) });
  } catch { /* NeetCode data is optional here */ }
  return neet;
}

let sols = null;
function solutions() {
  if (sols) return sols;
  try { sols = JSON.parse(fs.readFileSync(SOLUTIONS, 'utf8')); }
  catch { sols = {}; }
  return sols;
}

let cache = null;
function build() {
  if (cache) return cache;
  const nc = neetIndex();
  const sol = solutions();
  const lists = {};
  for (const [key, { name, label }] of Object.entries(LISTS)) {
    const seen = new Set();
    const items = questionsIn(name).filter(q => {
      if (seen.has(q.slug)) return false;
      seen.add(q.slug);
      // JavaScript-only puzzles (e.g. "Create Hello World Function") cannot be
      // practised in the Python editor the rest of the app teaches in.
      const langs = (question(q.slug)?.codeSnippets || []).map(c => c.langSlug);
      return !langs.length || langs.includes('python3') || langs.includes('python');
    }).map(q => {
      const full = question(q.slug) || {};
      const topics = full.topicTags || [];
      const n = nc.get(q.slug);
      return {
        id: q.id, slug: q.slug, title: q.title,
        difficulty: q.difficulty ? q.difficulty[0] + q.difficulty.slice(1).toLowerCase() : '',
        frequency: Number.isFinite(q.frequency) ? q.frequency : null,
        acRate: full.acRate || null,
        paidOnly: Boolean(full.paidOnly),
        topics,
        // A NeetCode question keeps its official shelf; the rest are filed by tag.
        pattern: n?.pattern || classify(topics),
        hasSolution: Boolean(sol[q.slug]?.solution),
        neetcode: n ? { pattern: n.pattern, blind75: n.blind75, video: n.video, hasSolution: n.hasSolution } : null,
      };
    });
    const counts = new Map();
    for (const q of items) for (const t of q.topics) counts.set(t, (counts.get(t) || 0) + 1);
    const topics = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([name, count]) => ({ name, count }));
    lists[key] = { key, label, name, questions: items, topics };
  }
  cache = {
    patterns: PATTERNS,
    lists: Object.values(lists).map(({ key, label, name, questions, topics }) => ({ key, label, name, count: questions.length, topics })),
    questions: lists,
  };
  return cache;
}

/** slug → highest Google frequency across the lists (for ranking elsewhere). */
export function googleFrequency() {
  const m = new Map();
  for (const l of Object.values(build().questions)) for (const q of l.questions) {
    if (q.frequency != null && !(m.get(q.slug) >= q.frequency)) m.set(q.slug, q.frequency);
  }
  return m;
}

export function mount(app) {
  app.get('/api/google', readLimit, wrap(async (_req, res) => {
    const b = build();
    res.json({ patterns: b.patterns, lists: b.lists, questions: Object.fromEntries(Object.entries(b.questions).map(([k, v]) => [k, v.questions])) });
  }));

  app.get('/api/google/solution/:slug', readLimit, wrap(async (req, res) => {
    const slug = v.slug(req.params.slug);
    const s = solutions()[slug];
    if (!s?.solution) return res.status(404).json({ error: 'no solution for this question' });
    res.json({ slug, ...s });
  }));
}
