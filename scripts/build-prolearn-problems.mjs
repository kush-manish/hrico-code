#!/usr/bin/env node
/**
 * Marks which Pro-Learn handbook topics are practice problems, so the
 * handbook can highlight them and link straight to solving them.
 *
 *   node scripts/build-prolearn-problems.mjs
 *
 * For every topic slug (they are algo.monster's own slugs) it checks
 * https://algo.monster/problems/<slug>: a page with a "Try it yourself"
 * editor is a problem. Each problem is then tied to its LeetCode question —
 * by exact title first, then by asking the model for the equivalent, kept
 * only if that slug really exists in the LeetCode catalogue. The result is
 * written to server/data/prolearn-problems.json and shipped with the app.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadEnv } from '../server/env.js';
import { outline } from '../server/prolearn.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(ROOT, 'server/data/prolearn-problems.json');
const CATALOG = path.join(ROOT, 'server/.cache/lc/catalog.json');
loadEnv();
const MODEL = process.env.PROBLEMS_MODEL || 'devin/claude-sonnet-5';

const norm = t => String(t).toLowerCase().replace(/&#x27;/g, "'").replace(/[^a-z0-9]+/g, ' ').trim();
const catalog = JSON.parse(fs.readFileSync(CATALOG, 'utf8'));
const bySlug = new Map(catalog.map(q => [q.slug, q]));
const byTitle = new Map(catalog.map(q => [norm(q.title), q]));
const lcOf = q => (q ? { slug: q.slug, id: q.id, title: q.title, difficulty: q.difficulty, paid: !!q.paid } : null);

const topics = outline().flatMap(c => c.groups.flatMap(g => g.articles.map(a => ({ ...a, chapter: c.chapter, group: g.group }))));

async function page(slug) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const r = await fetch(`https://algo.monster/problems/${encodeURIComponent(slug)}`, { signal: AbortSignal.timeout(30_000), headers: { 'User-Agent': 'Mozilla/5.0 (dsa-prep handbook index)' } });
      if (r.status === 404) return { exists: false, problem: false };
      if (!r.ok) throw new Error(`status ${r.status}`);
      return { exists: true, problem: /try it yourself/i.test(await r.text()) };
    } catch (err) {
      if (attempt === 3) { console.error(`FAIL ${slug}: ${err.message}`); return { exists: null, problem: false }; }
      await new Promise(res => setTimeout(res, 2000 * attempt));
    }
  }
}

// Page checks are kept from a previous run (they are slow and polite); --refetch redoes them.
let prev = {};
try { if (!process.argv.includes('--refetch')) prev = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch { /* first run */ }
const out = {};
const queue = topics.filter(t => {
  const p = prev[t.slug];
  if (p && p.algomonster !== null) { out[t.slug] = p; return false; }
  return true;
});
await Promise.all(Array.from({ length: 4 }, async () => {
  for (let t; (t = queue.shift());) {
    const p = await page(t.slug);
    const base = t.title.replace(/\s*\([^)]*\)\s*$/, '');
    const lc = byTitle.get(norm(t.title)) || byTitle.get(norm(base));
    out[t.slug] = { title: t.title, algomonster: p.exists, problem: p.problem || !!lc, lc: lcOf(lc) };
    await new Promise(res => setTimeout(res, 250));   // polite to algo.monster
  }
}));

// Intro and overview pages carry a small "Try it yourself" exercise too; they teach, they are not problems.
const CONCEPT = /\b(intro|introduction|roadmap|overview|cheat sheet|summary)\b/i;
for (const v of Object.values(out)) if (CONCEPT.test(v.title) && !v.lc) v.problem = false;

const write = () => fs.writeFileSync(OUT, `${JSON.stringify(out, null, 1)}\n`);
write();

// Problems with their own algo.monster names: ask for the LeetCode equivalent, verify it exists.
// In batches, so one bad reply costs a batch, not the run.
const unmapped = Object.entries(out).filter(([, v]) => v.problem && !v.lc && !v.lcChecked);
let mapped = 0;
for (let i = 0; i < unmapped.length; i += 40) {
  const batch = unmapped.slice(i, i + 40);
  try {
    const res = await fetch(`${process.env.LLM_BASE_URL}/v1/chat/completions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.LLM_API_KEY}` },
      body: JSON.stringify({ model: MODEL, temperature: 0, max_tokens: 4000, messages: [
        { role: 'system', content: 'Map each algo.monster practice problem to the LeetCode problem that is the same problem (same task, possibly renamed). Answer null when there is no true equivalent — never a merely related problem. Return ONLY JSON: {"<topic slug>": "<leetcode title slug>" | null, ...}' },
        { role: 'user', content: batch.map(([slug, v]) => `${slug}: ${v.title}`).join('\n') },
      ] }),
      signal: AbortSignal.timeout(180_000),
    });
    if (!res.ok) throw new Error(`llm ${res.status}`);
    const text = (await res.json()).choices?.[0]?.message?.content || '{}';
    const map = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
    for (const [slug] of batch) {
      const q = bySlug.get(String(map[slug] || ''));
      if (q) { out[slug].lc = lcOf(q); out[slug].lcMatch = 'equivalent'; mapped++; }
      out[slug].lcChecked = true;
    }
    write();
  } catch (err) { console.error(`mapping batch ${i / 40 + 1} failed: ${err.message} (rerun to retry it)`); }
}
console.log(`model mapped ${mapped} of ${unmapped.length} algo.monster-named problems to LeetCode`);
const v = Object.values(out);
console.log(`${v.length} topics · ${v.filter(x => x.problem).length} problems · ${v.filter(x => x.lc).length} with a LeetCode link · ${v.filter(x => x.algomonster === false).length} not on algo.monster · ${v.filter(x => x.algomonster === null).length} unchecked`);
