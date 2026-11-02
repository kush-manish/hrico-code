#!/usr/bin/env node
/**
 * Writes the "Watch it run" narration of every Short from the frames the
 * player actually shows: the optimal trace is sampled exactly as the client
 * samples it (pick(n, 40)), each frame is summarised (line, code, what
 * changed), and the model writes 4–8 spoken sentences, each pinned to the
 * frame it describes (`animCues`). The player plays sentence k over frames
 * cues[k] … cues[k+1]-1, so the voice always describes what is on screen.
 *
 *   node scripts/build-anim-narration.mjs            # fill what is missing or stale
 *   node scripts/build-anim-narration.mjs --check    # report only, exit 1 if anything is missing
 *   node scripts/build-anim-narration.mjs two-sum    # (re)write just these slugs
 *
 * `animFor` hashes the optimal code, so editing it makes the narration stale.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { loadEnv } from '../server/env.js';
import { traceName } from '../server/routes/shorts.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DATA = path.join(ROOT, 'server/data/shorts.json');
const TRACES = path.join(ROOT, 'server/data/shorts-traces');
loadEnv();
const MODEL = process.env.ANIM_MODEL || 'devin/claude-sonnet-5';
const CONCURRENCY = 6;
const MAX_FRAMES = 40;                                   // same as the player's pick(steps, 40)

const args = process.argv.slice(2);
const check = args.includes('--check');
const only = args.filter(a => !a.startsWith('--'));
const hash = code => crypto.createHash('sha1').update(code).digest('hex').slice(0, 12);

const shorts = JSON.parse(fs.readFileSync(DATA, 'utf8'));
const traceOf = (slug, s) => { try { return JSON.parse(fs.readFileSync(path.join(TRACES, traceName(slug, 'optimal', s.optimalCode, s.meta, s.input)), 'utf8')); } catch { return null; } };
const fresh = s => s.animFor === hash(s.optimalCode) && Array.isArray(s.animCues) && s.animCues.length;
const todo = Object.entries(shorts).filter(([slug, s]) => s.optimalCode && (only.length ? only.includes(slug) : !fresh(s)));

if (check) {
  console.log(`${Object.values(shorts).filter(s => s.optimalCode).length} shorts with code · ${todo.length} narrations missing or stale`);
  process.exit(todo.length ? 1 : 0);
}

function pick(n, max) {
  if (n <= max) return [...Array(n).keys()];
  const out = [];
  for (let k = 0; k < max; k++) out.push(Math.round((k * (n - 1)) / (max - 1)));
  return [...new Set(out)];
}
const clip = (v, n = 70) => { const t = String(v); return t.length > n ? `${t.slice(0, n)}…` : t; };

/** One line per shown frame: what runs next and which variables changed since the last frame shown. */
function frames(trace, code) {
  const lines = code.split('\n'), idx = pick(trace.steps.length, MAX_FRAMES);
  let prev = {};
  return idx.map((i, k) => {
    const st = trace.steps[i], loc = st.locals || {};
    const changed = Object.entries(loc).filter(([n, v]) => n !== 'self' && prev[n] !== v).map(([n, v]) => `${n}=${clip(v)}`);
    prev = loc;
    const ret = st.event === 'return' && st.retval !== undefined ? ` returns ${clip(st.retval)}` : '';
    return `F${k}: line ${st.line} \`${(lines[st.line - 1] || '').trim()}\`${ret}${changed.length ? ` | ${changed.join(', ')}` : ''}`;
  });
}

const SYSTEM = `You narrate an animation of a coding-interview solution running on a small example, for a 2-minute video.
You get the frames that will be shown, in order (F0, F1, …): the line about to run and the variables that changed.
Write 4 to 8 short spoken sentences that walk the viewer through what they SEE, in order.
Rules:
- Each sentence gets "from": the index of the first frame it describes. from values strictly increase; the first is 0.
- Describe what is on screen at those frames, using the actual values and variable names from the frames (e.g. "i is 3 and the stack now holds 1 and 2").
- Plain spoken English, under 22 words each, no code syntax or symbols; name the key idea once (why the step happens).
- The last sentence states the final answer shown in the last frames.
Return ONLY JSON: {"sentences":[{"from":0,"text":"..."}, …]}`;

async function narrate(slug, s) {
  const trace = traceOf(slug, s);
  if (!trace?.steps?.length) throw new Error('no optimal trace (run build-short-traces first)');
  const fr = frames(trace, s.optimalCode);
  const user = `Problem: ${s.title}\nKey idea: ${s.optimal?.insight || ''}\nExample input:\n${s.input}\nExpected output: ${s.output}\n\nCode:\n${s.optimalCode}\n\nFrames shown (${fr.length}):\n${fr.join('\n')}\n\nWrite at most ${Math.min(8, fr.length)} sentences (one frame can start only one sentence).`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const r = await fetch(`${process.env.LLM_BASE_URL}/v1/chat/completions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.LLM_API_KEY}` },
        body: JSON.stringify({ model: MODEL, temperature: 0.3, max_tokens: 1500, messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: user }] }),
        signal: AbortSignal.timeout(120_000),
      });
      if (!r.ok) throw new Error(`llm ${r.status}`);
      const text = (await r.json()).choices?.[0]?.message?.content || '';
      const out = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)).sentences;
      if (!Array.isArray(out) || out.length < Math.min(3, fr.length) || out.length > Math.min(9, fr.length)) throw new Error(`got ${out?.length} sentences for ${fr.length} frames`);
      const cues = out.map(x => Number(x.from)), said = out.map(x => String(x.text || '').trim().replace(/\s+/g, ' '));
      if (cues[0] !== 0 || cues.some((c, k) => !Number.isInteger(c) || c < 0 || c >= fr.length || (k && c <= cues[k - 1]))) throw new Error(`bad cues ${cues}`);
      // The player splits narration on . ! ? — one sentence each, ending with exactly one stop.
      if (said.some(t => !t || /[.!?]\s+\S/.test(t))) throw new Error('a "sentence" holds more than one sentence');
      return { text: said.map(t => (/[.!?]$/.test(t) ? t : `${t}.`)).join(' '), cues };
    } catch (err) {
      if (attempt === 3) throw err;
      await new Promise(res => setTimeout(res, 2000 * attempt));
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
      const { text, cues } = await narrate(slug, s);
      s.say = { ...(s.say || {}), anim: text };
      s.animCues = cues; s.animFor = hash(s.optimalCode);
      done++;
      if (++sinceSave >= 20) { save(); sinceSave = 0; }
    } catch (err) { failed++; console.error(`FAIL ${slug}: ${err.message}`); }
    if ((done + failed) % 50 === 0) console.log(`${done + failed}/${todo.length} (${failed} failed)`);
  }
}));
save();
console.log(`DONE ${done} written, ${failed} failed`);
process.exit(failed ? 1 : 0);
