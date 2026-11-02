/**
 * Writes the best answer for every behavioural question, scores it with the
 * mock interview's own scorer, and revises until every signal is 4/4 (up to
 * --rounds attempts). Results go to data/best-answers.json; questions that
 * already scored 100% are skipped unless --force.
 *
 *   node server/best-answers-warm.js [--jobs=3] [--rounds=4] [--force] [--only=googleyness]
 *                                    [--writer=claude-opus-4-8] [--scorer=claude-sonnet-5-5]
 */
import fs from 'fs';
import './config.js';
import { categories, questionsIn } from './behavioural.js';
import { FILE, load, write, grade, inputs } from './best-answers.js';

const args = process.argv.slice(2);
const arg = (k, d) => args.find(a => a.startsWith(`--${k}=`))?.split('=')[1] ?? d;
const force = args.includes('--force');
const only = arg('only');
const jobs = Math.max(1, Math.min(6, Number(arg('jobs', 3))));
const rounds = Math.max(1, Math.min(6, Number(arg('rounds', 4))));
const writer = arg('writer', 'claude-opus-4-8');
const scorer = arg('scorer', undefined);   // default = the same model the live mock scores with

const data = load();
data.answers ||= {};
const { resume, guide } = inputs();
let saving = Promise.resolve();
const persist = () => (saving = saving.then(() => {
  data.updatedAt = new Date().toISOString();
  fs.writeFileSync(`${FILE}.tmp`, JSON.stringify(data, null, 1));
  fs.renameSync(`${FILE}.tmp`, FILE);
}));

const work = [];
for (const c of categories()) {
  if (only && c.id !== only) continue;
  for (const q of questionsIn(c.id)) {
    const have = data.answers[q];
    if (!force && have?.score?.percent === 100) continue;
    work.push({ q, cat: c.label, catId: c.id });
  }
}
const limit = Number(arg('limit', 0));
if (limit > 0) work.splice(limit);
console.log(`${work.length} questions to write · writer ${writer} · scorer ${scorer || 'default'} · up to ${rounds} rounds`);

async function one({ q, cat, catId }) {
  let best = data.answers[q] && !force ? data.answers[q] : null;
  let prev = best?.answer ? best : null, feedback = best?.score ? feedbackOf(best.score) : '';
  for (let r = 1; r <= rounds; r++) {
    try {
      const a = await write({ question: q, category: cat, resume, guide, previous: prev && { answer: prev.answer, followUps: prev.followUps }, feedback, model: writer });
      const s = await grade({ question: q, a, model: scorer });
      const entry = { ...a, category: catId, score: { percent: s.percent, overall: s.overall, dims: s.dimensions.map(d => ({ id: d.id, label: d.label, score: d.score, comment: d.comment })) }, rounds: r, at: Date.now() };
      if (!best?.score || s.percent >= best.score.percent) best = entry;
      console.log(`  ${String(s.percent).padStart(3)}% r${r} ${s.overall.padEnd(11)} ${q.slice(0, 70)}`);
      if (s.percent === 100) break;
      prev = a; feedback = feedbackOf(entry.score);
    } catch (e) {
      console.log(`  ERR r${r} ${q.slice(0, 60)}: ${e.message}`);
    }
  }
  if (best) { data.answers[q] = best; await persist(); }
}

function feedbackOf(s) {
  return s.dims.filter(d => d.score < 4).map(d => `${d.label}: ${d.score}/4 — ${d.comment}`).join('\n') || 'All 4/4.';
}

const queue = work.slice();
await Promise.all(Array.from({ length: jobs }, async () => { while (queue.length) await one(queue.shift()); }));
await saving;
const all = Object.values(data.answers);
console.log(`done · ${all.filter(a => a.score?.percent === 100).length}/${all.length} at 100%`);
