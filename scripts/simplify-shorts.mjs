#!/usr/bin/env node
/**
 * Rewrites Shorts' optimal solutions in plain interview style — the same
 * algorithm and complexity, but code a candidate can write on a whiteboard
 * and explain line by line: descriptive names, one idea per line, no clever
 * one-liners. Each rewrite must still return the Short's stated output under
 * the tracer, or the original is kept. The original stays in optimalCodeOriginal.
 *
 *   node scripts/simplify-shorts.mjs slugs.json        # a JSON array of slugs
 *   node scripts/simplify-shorts.mjs two-sum 3sum      # or slugs as arguments
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
const MODEL = process.env.SIMPLIFY_MODEL || 'devin/claude-sonnet-5';
const args = process.argv.slice(2);
const slugs = args.length === 1 && args[0].endsWith('.json') ? JSON.parse(fs.readFileSync(args[0], 'utf8')) : args;
const shorts = JSON.parse(fs.readFileSync(DATA, 'utf8'));

const SYSTEM = `You rewrite a LeetCode solution so a candidate can write it in a 45-minute Google interview and explain every line.
Keep EXACTLY the same algorithm and the same time/space complexity. Keep the class name, method name and signature.
Make it simple to write and simple to say out loud:
- Descriptive variable names (left, right, count, seen…), one idea per line, plain loops and ifs.
- No clever one-liners: no divmod, ljust/rjust tricks, nested or conditional comprehensions, lambdas in sort keys beyond a simple one, zip(*…), walrus, chained ternaries, bit tricks unless the problem is about bits.
- Standard tools are fine when they are what an interviewer expects (dict, set, collections.deque/defaultdict/Counter, heapq, bisect).
- At most four short comments, at the start of each step (e.g. "# 1. Count each character"). No docstrings.
- Prefer under ~30 lines. Do not add input validation or prints.
If the code is already this simple, return it unchanged and set "changed" to false.
Return ONLY JSON: {"changed": true|false, "code": "the complete solution"}. No markdown fences.`;

const norm = v => { try { return JSON.stringify(JSON.parse(String(v).replace(/'/g, '"').replace(/\bNone\b/g, 'null').replace(/\bTrue\b/g, 'true').replace(/\bFalse\b/g, 'false'))); } catch { return String(v).replace(/\s+/g, ''); } };

async function simplify(slug) {
  const s = shorts[slug];
  if (!s?.optimalCode) return 'no code';
  if (s.simplified) return 'already done';
  const base = s.optimalCodeOriginal || s.optimalCode;
  const messages = [{ role: 'system', content: SYSTEM }, { role: 'user', content:
    `PROBLEM: ${s.title}\n${s.ask || ''}\nKEY IDEA: ${s.optimal?.insight || ''}\nSTEPS: ${(s.optimal?.steps || []).join(' / ')}\nCOMPLEXITY: time ${s.optimal?.time}, space ${s.optimal?.space}\n\nCURRENT SOLUTION:\n${base}` }];
  for (let attempt = 1; attempt <= 3; attempt++) {
    const r = await fetch(`${process.env.LLM_BASE_URL}/v1/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.LLM_API_KEY}` },
      body: JSON.stringify({ model: MODEL, temperature: 0.2, max_tokens: 3000, messages }), signal: AbortSignal.timeout(180_000) }).catch(e => ({ ok: false, status: e.name }));
    if (!r.ok) { if (attempt === 3) return `llm ${r.status}`; await new Promise(res => setTimeout(res, 3000 * attempt)); continue; }
    const text = (await r.json()).choices?.[0]?.message?.content || '';
    let out;
    try { out = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)); } catch { if (attempt === 3) return 'bad JSON'; continue; }
    const code = String(out.code || '').replace(/\s+$/, '');
    if (!out.changed || !code || code === base.replace(/\s+$/, '')) { s.simplified = true; return 'kept (already simple)'; }
    const t = await runTrace({ code, meta: s.meta, args: argsOf(s.meta, s.input) }).catch(e => ({ error: e.message }));
    if ((t.error && t.error !== 'None') || norm(t.result) !== norm(s.output)) {
      messages.push({ role: 'assistant', content: text }, { role: 'user', content: `That version fails: ${t.error && t.error !== 'None' ? `it raised ${String(t.error).slice(0, 300)}` : `it returned ${String(t.result).slice(0, 200)} instead of ${s.output}`}. Fix it, same rules.` });
      if (attempt === 3) return 'rewrite failed the check — original kept';
      continue;
    }
    if (!s.optimalCodeOriginal) s.optimalCodeOriginal = s.optimalCode;
    s.optimalCode = code; s.simplified = true;
    return `simplified (${base.split('\n').length} → ${code.split('\n').length} lines)`;
  }
}

const queue = [...slugs], tally = {};
let n = 0;
await Promise.all(Array.from({ length: 5 }, async () => {
  for (let slug; (slug = queue.shift());) {
    let res;
    try { res = await simplify(slug); } catch (e) { res = `error ${e.message}`; }
    const key = res.split(' (')[0];
    tally[key] = (tally[key] || 0) + 1;
    console.log(`${++n}/${slugs.length} ${slug}: ${res}`);
    if (n % 10 === 0) fs.writeFileSync(DATA, JSON.stringify(shorts, null, 1));
  }
}));
fs.writeFileSync(DATA, JSON.stringify(shorts, null, 1));
console.log('DONE', JSON.stringify(tally));
