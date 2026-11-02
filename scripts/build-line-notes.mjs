#!/usr/bin/env node
/**
 * Writes a plain-English explanation for every line of every Short's optimal
 * code into server/data/shorts.json (`lineNotes`, one entry per code line, ""
 * for blank lines). The code scene walks the solution top to bottom, speaking
 * each note while its line is lit.
 *
 *   node scripts/build-line-notes.mjs            # fill what is missing or stale
 *   node scripts/build-line-notes.mjs --check    # report only, exit 1 if anything is missing
 *   node scripts/build-line-notes.mjs two-sum    # (re)write just these slugs
 *
 * `lineNotesFor` hashes the code the notes were written for, so editing a
 * Short's optimalCode makes its notes stale automatically.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { loadEnv } from '../server/env.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DATA = path.join(ROOT, 'server/data/shorts.json');
loadEnv();
const BASE = process.env.LLM_BASE_URL, KEY = process.env.LLM_API_KEY;
const MODEL = process.env.LINE_NOTES_MODEL || 'devin/claude-sonnet-5-5';
const CONCURRENCY = 6;

const args = process.argv.slice(2);
const check = args.includes('--check');
const only = args.filter(a => !a.startsWith('--'));

export const codeHash = code => crypto.createHash('sha1').update(code).digest('hex').slice(0, 12);

const shorts = JSON.parse(fs.readFileSync(DATA, 'utf8'));
const fresh = s => s.lineNotesFor === codeHash(s.optimalCode) && s.lineNotes?.length === s.optimalCode.split('\n').length;
const todo = Object.entries(shorts).filter(([slug, s]) => s.optimalCode && (only.length ? only.includes(slug) : !fresh(s)));

if (check) {
  console.log(`${Object.values(shorts).filter(s => s.optimalCode).length} shorts with code · ${todo.length} missing or stale`);
  process.exit(todo.length ? 1 : 0);
}

const SYSTEM = `You explain interview solutions to a candidate, one line of code at a time, as a narrated walkthrough.
For EVERY numbered line you get, write one short spoken sentence (8-22 words) saying what the line does and, where it matters, why.
Rules:
- Plain English that sounds natural read aloud. Name variables as words ("we set left to zero"), avoid symbols, brackets and code syntax.
- Exactly one sentence per line, ending with a period. No periods inside the sentence (write "dot" never; say "the length of nums" not "len(nums)").
- Follow the code's own logic and names; tie lines to the problem's idea, not generic filler.
- For a line that only closes or opens a block (else:, try:, a lone return) still explain its role in one sentence.
- Comment lines: restate the comment's point as part of the walkthrough.
Return ONLY JSON: {"notes": ["...", "..."]} with exactly one string per numbered line, in order.`;

async function notesFor(slug, s) {
  const lines = s.optimalCode.split('\n');
  const idx = lines.map((l, i) => (l.trim() ? i : -1)).filter(i => i >= 0);
  const numbered = idx.map((i, k) => `${k + 1}: ${lines[i]}`).join('\n');
  const user = `Problem: ${s.title || slug}${s.ask ? `\n${s.ask}` : ''}${s.optimal?.insight ? `\nKey idea: ${s.optimal.insight}` : ''}\n\nCode (${idx.length} numbered lines):\n${numbered}`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(`${BASE}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
        body: JSON.stringify({ model: MODEL, temperature: 0.2, max_tokens: 4000, messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: user }] }),
        signal: AbortSignal.timeout(120_000),
      });
      if (!res.ok) throw new Error(`llm ${res.status}`);
      const text = (await res.json()).choices?.[0]?.message?.content || '';
      const notes = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)).notes;
      if (!Array.isArray(notes) || notes.length !== idx.length || notes.some(n => typeof n !== 'string' || !n.trim())) {
        throw new Error(`got ${notes?.length} notes for ${idx.length} lines`);
      }
      const out = lines.map(() => '');
      idx.forEach((i, k) => { out[i] = notes[k].trim().replace(/\s+/g, ' '); });
      return out;
    } catch (err) {
      if (attempt === 3) throw err;
      await new Promise(r => setTimeout(r, 2000 * attempt));
    }
  }
}

let done = 0, failed = 0, sinceSave = 0;
const save = () => fs.writeFileSync(DATA, JSON.stringify(shorts, null, 1));
const queue = [...todo];
await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
  for (let job; (job = queue.shift());) {
    const [slug, s] = job;
    try {
      s.lineNotes = await notesFor(slug, s);
      s.lineNotesFor = codeHash(s.optimalCode);
      done++;
      if (++sinceSave >= 20) { save(); sinceSave = 0; }
    } catch (err) {
      failed++;
      console.error(`FAIL ${slug}: ${err.message}`);
    }
    if ((done + failed) % 25 === 0) console.log(`${done + failed}/${todo.length} (${failed} failed)`);
  }
}));
save();
console.log(`DONE ${done} written, ${failed} failed`);
process.exit(failed ? 1 : 0);
