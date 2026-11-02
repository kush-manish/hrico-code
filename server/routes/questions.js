/** The question catalogue: lists, questions, statements. */
import * as v from '../validate.js';
import { listNames, questionsIn, question, resolveTitles, allQuestions, searchQuestions } from '../questions.js';
import { searchLeetCode, fetchQuestion, lookup } from '../lc-catalog.js';
import { readLimit } from '../middleware.js';

export function mount(app) {
  // ------------------------------------------------------------- questions ---

  app.get('/api/lists', readLimit, (_req, res) => res.json(listNames()));

  app.get('/api/lists/:name', readLimit, (req, res) => {
    // Only a real list name: "constructor" or "__proto__" would otherwise
    // reach Object.prototype in the membership map and throw.
    const name = req.params.name;
    const items = listNames().some(l => l.name === name) ? questionsIn(name) : [];
    if (!items.length) return res.status(404).json({ error: 'list not found' });
    res.json(items);
  });

  app.get('/api/question/:slug', readLimit, async (req, res) => {
    const slug = v.slug(req.params.slug);
    let q = question(slug);
    // Not in the local set: fetch it from LeetCode once and keep it.
    if (!q?.slug) {
      try { if (await fetchQuestion(slug)) q = question(slug); }
      catch { return res.status(424).json({ error: 'That problem is not in our set and LeetCode could not be reached to fetch it. Try again in a minute.', code: 'upstream' }); }
    }
    if (!q?.slug) return res.status(404).json({ error: 'not found' });   // "constructor" hits Object.prototype
    res.json(q);
  });

  /** Search by number or name: what we hold first, then the rest of LeetCode. */
  app.get('/api/search', readLimit, async (req, res) => {
    const term = String(req.query.q || '').slice(0, 80);
    const local = searchQuestions(term, 25);
    let leetcode = [];
    try {
      const held = new Set(local.map(x => x.slug));
      leetcode = (await searchLeetCode(term, 10)).filter(x => !held.has(x.slug));
    } catch { /* LeetCode unreachable: local results only */ }
    res.json({ local, leetcode });
  });

  /** "77" → fetch Combinations if needed → its slug, ready to open. */
  app.get('/api/lookup', readLimit, async (req, res) => {
    const term = String(req.query.q || '').slice(0, 120);
    try {
      const local = searchQuestions(term, 1)[0];
      const exact = local && (local.id === term.replace(/^#/, '').trim() || local.slug === term.trim().toLowerCase());
      const slug = exact ? local.slug : await lookup(term);
      if (!slug) return res.status(404).json({ error: `No LeetCode problem matches “${term}”.` });
      const q = question(slug);
      res.json({ slug, title: q?.title, id: q?.id });
    } catch (err) {
      res.status(424).json({ error: 'Could not reach LeetCode to fetch that problem. Try again in a minute.', code: 'upstream' });
    }
  });

}
