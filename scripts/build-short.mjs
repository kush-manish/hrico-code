#!/usr/bin/env node
/**
 * Writes a new Short for LeetCode problems that do not have one yet, in the
 * same shape as server/data/shorts.json, and checks it the way the others were
 * checked: both solutions are run under the tracer on the Short's example and
 * must return the stated output. A Short that fails is retried with the error,
 * then skipped — nothing unverified is written.
 *
 *   node scripts/build-short.mjs longest-string-chain stock-price-fluctuation
 *
 * Afterwards: node scripts/build-line-notes.mjs && node scripts/build-short-traces.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadEnv } from '../server/env.js';
import { runTrace } from '../server/routes/debug.js';
import { argsOf } from '../server/routes/shorts.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DATA = path.join(ROOT, 'server/data/shorts.json');
loadEnv();
const MODEL = process.env.SHORT_MODEL || 'devin/claude-sonnet-5';
const slugs = process.argv.slice(2);
if (!slugs.length) { console.error('usage: node scripts/build-short.mjs <slug...>'); process.exit(1); }

const shorts = JSON.parse(fs.readFileSync(DATA, 'utf8'));
const PATTERNS = [...new Set(Object.values(shorts).map(s => s.pattern).filter(Boolean))];
// A finished Short shows the model the exact shape and tone; the generated fields are filled per problem.
const example = (({ lineNotes, lineNotesFor, meta, ...rest }) => rest)(shorts['two-sum']);

async function question(slug) {
  // A premium statement fetched by the app (signed-in cookie) is kept here; LeetCode answers anonymous requests without it.
  try { const c = JSON.parse(fs.readFileSync(path.join(ROOT, 'server/.cache/lc', `${slug}.json`), 'utf8')); if (c?.content) return c; } catch { /* not cached */ }
  const r = await fetch('https://leetcode.com/graphql/', { method: 'POST', headers: { 'Content-Type': 'application/json', Referer: `https://leetcode.com/problems/${slug}/` },
    body: JSON.stringify({ query: 'query q($s: String!) { question(titleSlug: $s) { questionFrontendId title titleSlug difficulty content metaData exampleTestcases topicTags { name } } }', variables: { s: slug } }) });
  const q = (await r.json()).data?.question;
  if (!q?.content) throw new Error('no statement (premium or unknown slug)');
  return q;
}

const SYSTEM = `You write "Shorts": 2-3 minute narrated explainers of one LeetCode problem, in the exact JSON shape of the example.
Rules:
- "input" is the Short's own small example in LeetCode's raw input format: one line per parameter (for a design class: the operations line, then the arguments line). Keep it small enough to trace (under ~40 steps of work) but non-trivial.
- "output" is EXACTLY what the optimal solution returns for that input, as compact JSON.
- "optimalCode" and "brute.code" are complete Python 3 LeetCode solutions (class Solution with the exact method name, or the design class), no imports beyond typing/collections/heapq/bisect/math, no prints. The brute force must be correct, just slower.
- "codeNotes": 4-7 items, each "match" a substring that appears verbatim in one optimalCode line.
- "say" is spoken narration: short sentences, plain British English, no symbols or code syntax.
- "pattern" must be one of: ${PATTERNS.join(', ')}.
- Return ONLY the JSON object, no markdown fences.`;

const norm = v => { try { return JSON.stringify(JSON.parse(String(v).replace(/'/g, '"').replace(/\bNone\b/g, 'null').replace(/\bTrue\b/g, 'true').replace(/\bFalse\b/g, 'false'))); } catch { return String(v).replace(/\s+/g, ''); } };

async function check(s) {
  for (const [which, code] of [['optimal', s.optimalCode], ['brute', s.brute?.code]]) {
    const t = await runTrace({ code, meta: s.meta, args: argsOf(s.meta, s.input) });
    if (t.error && t.error !== 'None') throw new Error(`${which} solution raised: ${String(t.error).slice(0, 300)}`);
    if (norm(t.result) !== norm(s.output)) throw new Error(`${which} solution returned ${String(t.result).slice(0, 200)} but "output" says ${s.output}`);
  }
}

for (const slug of slugs) {
  if (shorts[slug]) { console.log(`skip ${slug}: already has a Short`); continue; }
  let q;
  try { q = await question(slug); } catch (e) { console.error(`FAIL ${slug}: ${e.message}`); continue; }
  const meta = JSON.parse(q.metaData);
  const statement = q.content.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').slice(0, 5000);
  const messages = [{ role: 'system', content: SYSTEM },
    { role: 'user', content: `EXAMPLE SHORT (shape and tone only):\n${JSON.stringify(example)}\n\nPROBLEM ${q.questionFrontendId}. ${q.title} (${q.difficulty})\nMETADATA: ${q.metaData}\nSTATEMENT: ${statement}\nLeetCode examples:\n${q.exampleTestcases}\n\nWrite the Short for this problem.` }];
  let done = false;
  for (let attempt = 1; attempt <= 3 && !done; attempt++) {
    try {
      const r = await fetch(`${process.env.LLM_BASE_URL}/v1/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.LLM_API_KEY}` },
        body: JSON.stringify({ model: MODEL, temperature: 0.3, max_tokens: 7000, messages }), signal: AbortSignal.timeout(240_000) });
      if (!r.ok) throw new Error(`llm ${r.status}`);
      const text = (await r.json()).choices?.[0]?.message?.content || '';
      const s = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
      Object.assign(s, { meta, title: q.title, difficulty: q.difficulty, neetcode: false });
      try { await check(s); } catch (e) {
        // Show the model what went wrong and ask for a corrected Short.
        messages.push({ role: 'assistant', content: text }, { role: 'user', content: `The check failed: ${e.message}. Fix the code and/or "output" so both solutions return exactly "output" for "input". Return the full corrected JSON.` });
        throw e;
      }
      shorts[slug] = s;
      fs.writeFileSync(DATA, JSON.stringify(shorts, null, 1));
      console.log(`OK ${slug} (${s.pattern}) — both solutions return ${s.output}`);
      done = true;
    } catch (e) { console.error(`  attempt ${attempt} for ${slug}: ${e.message}`); }
  }
  if (!done) console.error(`FAIL ${slug}: not written`);
}
