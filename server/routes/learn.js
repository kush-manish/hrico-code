/** Patterns, the AlgoMaster 300, the Google set with explanations, walkthroughs and the step tutor. */
import * as v from '../validate.js';
import * as models from '../models.js';
import * as patterns from '../patterns.js';
import * as algomaster from '../algomaster.js';
import * as explain from '../explain.js';
import * as prolearn from '../prolearn.js';
import * as prolearnSimple from '../prolearn-simple.js';
import * as prolearnApproaches from '../prolearn-approaches.js';
import { tutor, buddyChat } from '../tutor.js';
import { toolkit } from '../toolkit.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

/** Real question id -> related LeetCode problems, each marked with whether it has a Short and is in the Nov 3 plan. */
const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../data');
function realqLeetcode() {
  const read = f => { try { return JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8')); } catch { return null; } };
  const map = read('realq-leetcode.json') || {}, shorts = read('shorts.json') || {};
  const plan = new Set((read('plan-nov3.json')?.problems || []).map(p => p.slug));
  return Object.fromEntries(Object.entries(map).map(([q, list]) => [q, list.map(x => ({ ...x, short: Boolean(shorts[x.slug]), plan: plan.has(x.slug) }))]));
}
import * as realq from '../realq.js';
import { BadRequest } from '../errors.js';
import { listNames, questionsIn, question, resolveTitles, allQuestions } from '../questions.js';
import { readLimit, llmLimit, requireCap, requireAi, validateBody, wrap } from '../middleware.js';

const smartNorm = s => String(s || '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
const smartSlug = s => smartNorm(s).replace(/\s+/g, '-');
const smartWords = s => new Set(smartNorm(s).split(/\s+/).filter(w => w.length > 2 && !['and', 'the', 'for', 'with', 'algorithm', 'problem'].includes(w)));

const SMART_ALIASES = {
  array: ['arrays hashing', 'two pointers', 'sliding window', 'prefix sum', 'sorting', 'simulation', 'matrix'],
  string: ['strings', 'pattern matching', 'kmp', 'rabin karp', 'z algorithm', 'manacher', 'trie'],
  'hash table': ['hashing', 'hash map', 'group anagrams', 'top k frequent'],
  'dynamic programming': ['dynamic prog', 'dp', 'grid dp', 'interval dp', 'knapsack', 'state machine', 'string dp', 'digit dp'],
  math: ['math bits', 'number theory', 'combinatorics', 'geometry'],
  sorting: ['sorting', 'custom comparator', 'quickselect', 'merge sort', 'line sweep'],
  'two pointers': ['two pointers', 'same direction', 'opposite direction', 'sliding window'],
  'binary search': ['binary search', 'binary search on answer', 'search 2d matrix'],
  'depth first search': ['depth first search', 'dfs', 'tree traversal', 'backtracking'],
  'breadth first search': ['breadth first search', 'bfs', 'multi source bfs', 'zero one bfs', 'bidirectional bfs'],
  greedy: ['greedy', 'exchange argument', 'interval'],
  matrix: ['matrix', 'grid', 'matrix as graph', 'simulation'],
  tree: ['tree', 'binary tree', 'bst', 'tree dp', 'binary lifting', 'rerooting'],
  'binary tree': ['binary tree', 'tree', 'tree traversal', 'binary lifting'],
  stack: ['stack', 'monotonic stack', 'calculator'],
  'heap priority queue': ['heap', 'priority queue', 'top k', 'k way merge', 'two heaps'],
  'bit manipulation': ['bit manipulation', 'bitmask', 'subsets bitmask'],
  'prefix sum': ['prefix sum', 'difference array', 'range sum'],
  'sliding window': ['sliding window', 'minimum window', 'subarrays with k distinct'],
  'linked list': ['linked list', 'fast slow', 'cycle'],
  'graph theory': ['graph', 'topological sort', 'dijkstra', 'shortest path', 'mst', 'tarjan', 'bipartite'],
  design: ['design', 'data structure design', 'lru', 'lfu', 'hit counter', 'twitter'],
  simulation: ['simulation', 'matrix', 'game of life'],
  counting: ['counting', 'hashing', 'counting sort'],
  'union find': ['disjoint set union', 'union find', 'dsu'],
  backtracking: ['backtracking', 'combinatorial search', 'pruning'],
  'divide and conquer': ['divide and conquer', 'merge sort', 'quickselect'],
  recursion: ['recursion', 'dfs', 'backtracking'],
  'monotonic stack': ['monotonic stack', 'daily temperatures', 'largest rectangle', 'next greater'],
  queue: ['queue', 'deque', 'monotonic queue', 'bfs'],
  'ordered set': ['ordered sets', 'sparse table', 'contains duplicate iii'],
  'segment tree': ['segment tree', 'fenwick', 'range query', 'lazy propagation'],
  trie: ['trie', 'autocomplete', 'word search ii'],
  'topological sort': ['topological sort', 'course schedule', 'alien dictionary', 'dag'],
  'shortest path': ['shortest path', 'dijkstra', 'bellman ford', 'floyd warshall', 'a star', 'bfs'],
  'string matching': ['kmp', 'rabin karp', 'z algorithm', 'manacher', 'rolling hash'],
  bitmask: ['bitmask', 'bitmask dp', 'subsets bitmask'],
  geometry: ['geometry', 'line sweep', 'rectangle'],
};

function smartScore(topic, hay) {
  const t = smartNorm(topic), h = smartNorm(hay);
  let score = h.includes(t) ? 6 : 0;
  const aliases = SMART_ALIASES[t] || [];
  for (const a of aliases) if (h.includes(smartNorm(a))) score += 5;
  const tw = smartWords(topic), hw = smartWords(hay);
  for (const w of tw) if (hw.has(w)) score += 2;
  return score;
}

async function smartMap() {
  const qs = allQuestions();
  let freq = new Map();
  try { freq = (await import('./google.js')).googleFrequency(); } catch { /* ranking only */ }
  const tagCounts = new Map();
  for (const q of qs) for (const t of q.topics || []) tagCounts.set(t, (tagCounts.get(t) || 0) + 1);
  const pats = patterns.patterns();
  const pro = prolearn.outline();
  const proArticles = pro.flatMap(c => c.groups.flatMap(g => g.articles.map(a => ({ ...a, chapter: c.chapter, group: g.group }))));
  const topicRows = [...tagCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([name, count]) => {
    // Most-asked at Google first, then by difficulty; every one opens in Coding.
    const rank = { Easy: 0, Medium: 1, Hard: 2 };
    const questions = qs.filter(q => (q.topics || []).includes(name))
      .map(({ slug, title, difficulty, topics }) => ({ slug, title, difficulty, topics, available: true, frequency: freq.get(slug) ?? null }))
      .sort((a, b) => (b.frequency ?? -1) - (a.frequency ?? -1) || (rank[a.difficulty] ?? 3) - (rank[b.difficulty] ?? 3) || a.title.localeCompare(b.title));
    const learn = pats.map(p => ({ ...p, _s: smartScore(name, `${p.name} ${p.family} ${p.cue} ${p.problems.join(' ')}`) }))
      .filter(p => p._s > 0).sort((a, b) => b._s - a._s).slice(0, 8)
      .map(p => ({ id: p.id, name: p.name, family: p.family, cue: p.cue, problems: resolveTitles(p.problems).slice(0, 8) }));
    const prolearnHits = proArticles.map(a => ({ ...a, _s: smartScore(name, `${a.chapter} ${a.group} ${a.title} ${a.slug}`) }))
      .filter(a => a._s > 0).sort((a, b) => b._s - a._s).slice(0, 18)
      .map(({ _s, ...a }) => a);
    const tree = [];
    for (const a of prolearnHits) {
      let ch = tree.find(x => x.chapter === a.chapter);
      if (!ch) tree.push(ch = { chapter: a.chapter, groups: [] });
      let gr = ch.groups.find(x => x.group === a.group);
      if (!gr) ch.groups.push(gr = { group: a.group, articles: [] });
      gr.articles.push({ slug: a.slug, title: a.title });
    }
    return { id: smartSlug(name), name, count, learn, prolearn: prolearnHits, tree, questions };
  });
  return { generatedAt: new Date().toISOString(), questionCount: qs.length, topics: topicRows };
}

export function mount(app) {
  // ------------------------------------------------------------------ learn ---

  app.get('/api/patterns', readLimit, (_req, res) => res.json({
    families: patterns.families(),
    count: patterns.patterns().length,
  }));

  app.get('/api/patterns/:id', readLimit, (req, res) => {
    const p = patterns.pattern(String(req.params.id || '').slice(0, 60));
    if (!p) return res.status(404).json({ error: 'unknown pattern' });
    // The pattern's own practice list first, then every AlgoMaster 300 problem
    // filed under this pattern, resolved against the local Google set so the UI
    // can link the ones that are actually here and mark the rest as external.
    const titles = [...new Set([...p.problems, ...algomaster.forPattern(p.id)])];
    res.json({ ...p, problems: resolveTitles(titles) });
  });

  /** Every question in the Google set, for the Learn tab's Google view. */
  app.get('/api/google/questions', readLimit, (_req, res) => {
    const idx = explain.cachedIndex();
    const explained = new Set(idx.explained), animated = new Set(idx.animated);
    const brute = new Set(idx.brute), best = new Set(idx.best), question = new Set(idx.question);
    const edge = { question: new Set(idx.edge.question), optimal: new Set(idx.edge.optimal), brute: new Set(idx.edge.brute), best: new Set(idx.edge.best) };
    const qa = { question: new Set(idx.qa.question), optimal: new Set(idx.qa.optimal), brute: new Set(idx.qa.brute), best: new Set(idx.qa.best) };
    const questions = allQuestions().map(q => ({
      ...q, explained: explained.has(q.slug), animated: animated.has(q.slug),
      brute: brute.has(q.slug), best: best.has(q.slug), question: question.has(q.slug),
      edge: { question: edge.question.has(q.slug), optimal: edge.optimal.has(q.slug), brute: edge.brute.has(q.slug), best: edge.best.has(q.slug) },
      qa: { question: qa.question.has(q.slug), optimal: qa.optimal.has(q.slug), brute: qa.brute.has(q.slug), best: qa.best.has(q.slug) },
    }));
    // Counts are over the question set, not the raw cache index: the cache can
    // hold explanations for questions since filtered out of the set (SQL ones),
    // which would make "explained" exceed the total.
    res.json({
      questions,
      edges: idx.edge.optimal.length + idx.edge.brute.length + idx.edge.best.length,
      explained: questions.filter(q => q.explained).length,
      animated: questions.filter(q => q.animated).length,
      brute: questions.filter(q => q.brute).length,
      best: questions.filter(q => q.best).length,
      question: questions.filter(q => q.question).length,
    });
  });

  /** SMART map: each LeetCode tag -> Learn pattern, Pro-Learn subtopics, and questions to solve. */
  app.get('/api/smart-map', readLimit, wrap(async (_req, res) => res.json(await smartMap())));


  // -------------------------------------------------------------- explain ---
  // GET returns only what is cached (cheap, unlimited); POST generates.

  app.get('/api/explain/:slug', readLimit, (req, res) => {
    const slug = v.slug(req.params.slug);
    if (!question(slug)) return res.status(404).json({ error: 'not found' });
    res.json(explain.cached(slug));
  });

  app.post('/api/explain/:slug', llmLimit, validateBody(b => ({ force: Boolean(b.force) })), requireCap('llm'), requireAi,
    wrap(async (req, res) => {
      const model = await models.resolve(req.body?.model);
      res.json(await explain.explain({ slug: v.slug(req.params.slug), model, force: req.clean.force }));
    }));

  app.post('/api/explain/:slug/walkthrough', llmLimit, validateBody(b => ({
    force: Boolean(b.force),
    edge: Boolean(b.edge),                 // add edge-case examples to an existing trace
    approach: explain.APPROACHES.includes(b.approach) ? b.approach : 'optimal',
  })), requireCap('llm'), requireAi, wrap(async (req, res) => {
    const model = await models.resolve(req.body?.model);
    const { edge, ...rest } = req.clean;
    const slug = v.slug(req.params.slug);
    res.json(edge
      ? await explain.addEdgeCases({ slug, model, approach: rest.approach })
      : await explain.walkthrough({ slug, model, ...rest }));
  }));

  /** Ask the tutor about the walkthrough step on screen. */
  app.post('/api/explain/:slug/ask', llmLimit, validateBody(b => ({
    approach: explain.APPROACHES.includes(b.approach) ? b.approach : 'optimal',
    example: Number.isInteger(b.example) ? b.example : 0,
    frame: Number.isInteger(b.frame) ? b.frame : 0,
    question: v.questionText(b.question),
    messages: Array.isArray(b.messages) && b.messages.length ? v.messages(b.messages) : [],
  })), requireCap('llm'), requireAi, wrap(async (req, res) => {
    const model = await models.resolve(req.body?.model);
    res.json(await explain.askStep({ slug: v.slug(req.params.slug), model, ...req.clean }));
  }));


  app.get('/api/patterns/meta/algomaster', readLimit, (_req, res) => {
    const sections = algomaster.sections().map(s => ({
      ...s,
      problems: resolveTitles(s.problems.map(q => q.title)).map((r, i) => ({
        ...r, difficulty: s.problems[i].difficulty,     // the list's own rating
      })),
    }));
    const flat = sections.flatMap(s => s.problems);
    res.json({
      source: 'https://algomaster.io/practice/dsa-patterns',
      total: flat.length,
      available: flat.filter(q => q.available).length,
      byDifficulty: flat.reduce((a, q) => { a[q.difficulty] = (a[q.difficulty] || 0) + 1; return a; }, {}),
      sections,
    });
  });

  /** Coverage: which patterns the local question set can actually support. */
  app.get('/api/patterns/meta/coverage', readLimit, (_req, res) => {
    const all = patterns.patterns().map(p => {
      // The same set /api/patterns/:id shows: its own list plus the AlgoMaster ones.
      const resolved = resolveTitles([...new Set([...p.problems, ...algomaster.forPattern(p.id)])]);
      return {
        id: p.id, name: p.name, family: p.family,
        total: resolved.length,
        available: resolved.filter(r => r.available).length,
      };
    });
    res.json({
      patterns: all,
      questionsInSet: allQuestions().length,
      covered: all.reduce((a, p) => a + p.available, 0),
    });
  });

  app.post('/api/patterns/tutor', llmLimit, validateBody(b => ({
    patternId: String(b.patternId || '').slice(0, 60),
    messages: v.messages(b.messages),
  })), requireCap('llm'), requireAi, wrap(async (req, res) => {
    const model = await models.resolve(req.body?.model);
    res.json({ reply: await tutor({ ...req.clean, model }) });
  }));

  /** Chat with Nibble, the study buddy: short, hint-first, aware of the screen. */
  app.post('/api/buddy/chat', llmLimit, validateBody(b => {
    const c = b.context && typeof b.context === 'object' ? b.context : {};
    const str = (x, n) => (typeof x === 'string' ? x.slice(0, n) : undefined);
    return {
      messages: v.messages((Array.isArray(b.messages) ? b.messages : []).slice(-12)),
      context: {
        page: str(c.page, 60), question: str(c.question, 160), difficulty: str(c.difficulty, 20), pattern: str(c.pattern, 60),
        statement: str(c.statement, 1500), code: str(c.code, 3000), weak: str(c.weak, 60),
        daysLeft: Number.isFinite(c.daysLeft) ? Math.max(-30, Math.min(400, Math.round(c.daysLeft))) : undefined,
      },
    };
  }), requireCap('llm'), requireAi, wrap(async (req, res) => {
    const model = await models.resolve(req.body?.model);
    res.json({ reply: await buddyChat({ ...req.clean, model }) });
  }));

  // -------------------------------------------------------------- pro-learn ---
  app.get('/api/toolkit', readLimit, wrap(async (_req, res) => res.json(await toolkit())));

  // ------------------------------------------------------------------ realq ---
  /** Real Google interview reports: the worked questions plus the reference pages. */
  app.get('/api/realq', readLimit, wrap(async (_req, res) => res.json({
    ...realq.realq(),
    animated: await realq.animated(),
    leetcode: realqLeetcode(),
  })));

  /** :idx is a snippet number, or "q" for the question explainer. */
  const realqSnippet = (req, res, next) => {
    const qid = String(req.params.qid || '').slice(0, 8);
    const isQ = req.params.idx === 'q';
    const idx = isQ ? 'q' : Number(req.params.idx);
    const known = /^q\d{1,3}$/.test(qid) && (isQ ? realq.question(qid) : Number.isInteger(idx) && idx >= 0 && idx <= 40 && realq.snippet(qid, idx));
    if (!known) return res.status(404).json({ error: 'unknown snippet' });
    req.realq = { qid, idx };
    next();
  };

  /**
   * An animated trace of one solution snippet (or of the question itself); written once, then served from disk.
   * A generation takes minutes — longer than the proxy keeps a connection open — so by default
   * `?start=1` kicks it off and answers 202, and plain polls answer 200 (done), 202 (busy) or 502 (failed).
   * `?wait=1` keeps the old blocking behaviour for scripts.
   */
  const realqLimit = (req, res, next) => (req.query?.start === '1' || req.query?.wait === '1' ? llmLimit : readLimit)(req, res, next);
  app.get('/api/realq-anim/:qid/:idx', realqLimit, requireCap('llm'), requireAi, realqSnippet, wrap(async (req, res) => {
    const { qid, idx } = req.realq;
    const key = idx === 'q' ? `${qid}.q` : `${qid}.s${idx}`;
    const refresh = req.query?.refresh === '1';
    res.set('Cache-Control', 'no-store');
    const run = async () => {
      const model = await models.resolve(req.query?.model);
      const opts = { model, refresh };
      return idx === 'q' ? realq.explainQuestion(qid, opts) : realq.animate(qid, idx, opts);
    };
    if (req.query?.wait === '1') return res.json(await run());
    if (!refresh) {
      const hit = await realq.finished(key);
      if (hit) return res.json(hit);
    }
    if (req.query?.start === '1') {
      realq.forget(key);
      run().catch(() => { /* recorded by once(); the next poll reports it */ });
      return res.status(202).json({ pending: true });
    }
    if (realq.inFlight(key)) return res.status(202).json({ pending: true });
    const err = realq.recentFailure(key);
    if (err) return res.status(err.status || 502).json({ error: err.message || 'generation failed' });
    res.status(202).json({ pending: false });
  }));

  /** Trace the learner's own input and keep it with the snippet's examples. */
  app.post('/api/realq-anim/:qid/:idx/example', llmLimit, validateBody(b => {
    const input = String(b.input || '').trim().slice(0, 400);
    if (!input) throw new BadRequest('type an input first');
    return { input, model: b.model };
  }), requireCap('llm'), requireAi, realqSnippet, wrap(async (req, res) => {
    const model = await models.resolve(req.clean.model);
    res.json(await realq.addExample(req.realq.qid, req.realq.idx, req.clean.input, { model }));
  }));

  app.delete('/api/realq-anim/:qid/:idx/example/:k', readLimit, realqSnippet, wrap(async (req, res) => {
    if (req.user && req.user.role !== 'admin') return res.status(403).json({ error: 'Only the admin can remove shared examples.', code: 'forbidden' });
    const k = Number(req.params.k);
    if (!Number.isInteger(k) || k < 0 || k > 10) return res.status(400).json({ error: 'bad example index' });
    res.json(await realq.removeExample(req.realq.qid, req.realq.idx, k));
  }));

  app.get('/api/prolearn', readLimit, wrap(async (_req, res) => res.json({
    chapters: prolearn.outline(),
    written: await prolearn.writtenSlugs(),
  })));

  /** The handbook topics that teach a given question, for the coding tab. */
  app.get('/api/prolearn-for/:slug', readLimit, wrap(async (req, res) => {
    const slug = String(req.params.slug || '').slice(0, 120);
    res.json({ topics: await prolearn.topicsFor(slug) });
  }));

  /** Raw problem statements for a topic, solution-free, so it can be practised cold. */
  app.get('/api/prolearn-practice/:slug', readLimit, wrap(async (req, res) => {
    const slug = String(req.params.slug || '').slice(0, 80);
    const doc = await prolearn.practice(slug);
    if (!doc) return res.status(404).json({ error: 'unknown topic' });
    res.json(doc);
  }));

  /**
   * A page already on disk is a plain read: it should not spend the 20-a-minute
   * assistant budget (shared with every chat in the app) or need the model to
   * be up. Only a page that will actually be written goes through llmLimit.
   */
  const cachedOrLlm = has => (req, res, next) => {
    const slug = String(req.params.slug || '').slice(0, 80);
    const viaLlm = () => llmLimit(req, res, err => (err ? next(err) : requireCap('llm'), requireAi(req, res, next)));
    if (req.query?.refresh === '1' || !prolearn.articleMeta(slug)) return viaLlm();
    Promise.resolve().then(() => has(slug)).then(hit => (hit ? readLimit(req, res, next) : viaLlm()), viaLlm);
  };
  const fullWritten = async slug => (await prolearn.writtenSlugs()).includes(slug);

  /** Writes the page on first request, then serves it from disk. */
  app.get('/api/prolearn/:slug', cachedOrLlm(fullWritten), wrap(async (req, res) => {
    const slug = String(req.params.slug || '').slice(0, 80);
    if (!prolearn.articleMeta(slug)) return res.status(404).json({ error: 'unknown topic' });
    const model = await models.resolve(req.query?.model);
    const doc = await prolearn.article(slug, { model, refresh: req.query?.refresh === '1' });
    res.json(doc);
  }));

  /** The short revision view of the same topic, with its animated trace. */
  app.get('/api/prolearn-simple/:slug', cachedOrLlm(prolearnSimple.has), wrap(async (req, res) => {
    const slug = String(req.params.slug || '').slice(0, 80);
    if (!prolearn.articleMeta(slug)) return res.status(404).json({ error: 'unknown topic' });
    const model = await models.resolve(req.query?.model);
    const doc = await prolearnSimple.simple(slug, { model, refresh: req.query?.refresh === '1' });
    res.json(doc);
  }));

  /** Brute force and each named variant, every one with its own code and trace. */
  app.get('/api/prolearn-approaches/:slug', cachedOrLlm(prolearnApproaches.has), wrap(async (req, res) => {
    const slug = String(req.params.slug || '').slice(0, 80);
    if (!prolearn.articleMeta(slug)) return res.status(404).json({ error: 'unknown topic' });
    const model = await models.resolve(req.query?.model);
    const doc = await prolearnApproaches.approaches(slug, { model, refresh: req.query?.refresh === '1' });
    res.json(doc);
  }));

}
