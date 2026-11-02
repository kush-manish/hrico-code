/**
 * Traces every REALQ question explainer and solution snippet ahead of time,
 * verifies each example by running the code, and lints every slide, so a
 * reader never waits on the model and every "Expected" shown is one the
 * code really produced.
 *
 *   node server/realq-warm.js [--jobs=4] [--force] [--only=q3 | --only=q3.s1 | --only=q3.q]
 *                             [--questions | --snippets] [--report] [--issues]
 *
 * --report prints the verification + lint summary of what is cached and exits;
 * --issues lists only entries that still have problems.
 */
import { realq, animate, explainQuestion, report } from './realq.js';

const args = process.argv.slice(2);
const force = args.includes('--force');
const only = args.find(a => a.startsWith('--only='))?.slice(7);
const jobs = Math.max(1, Math.min(8, Number(args.find(a => a.startsWith('--jobs='))?.slice(7)) || 3));
const onlyQuestions = args.includes('--questions');
const onlySnippets = args.includes('--snippets');

async function printReport(issuesOnly = false) {
  const rows = await report();
  let ok = 0, total = 0, clean = 0, problems = 0;
  rows.sort((a, b) => Number(a.key.match(/\d+/)[0]) - Number(b.key.match(/\d+/)[0]) || a.key.localeCompare(b.key));
  for (const r of rows) {
    const n = r.examples.reduce((s, e) => s + e.issues.length + e.defects.filter(d => !d.startsWith('minor')).length, 0);
    total += r.examples.length; ok += r.examples.filter(e => e.verified).length;
    if (n) problems += n; else clean++;
    if (issuesOnly && !n) continue;
    const marks = r.examples.map(e => `${r.question ? '·' : e.verified ? '✓' : '✗'} ${e.name} (${e.frames}f)`);
    const rv = r.review === 'good' ? '☆' : r.review === 'fix' ? '△' : '?';
    const by = r.model ? ` [${r.model.replace(/^claude-/, '')}]` : '';
    console.log(`${r.key.padEnd(8)} ${rv} ${r.kind.padEnd(6)} ${marks.join(' | ')}${by}`);
    for (const e of r.examples) {
      for (const x of e.issues) console.log(`           ! ${e.name}: ${x}`);
      for (const x of e.defects) console.log(`           △ ${e.name}: ${x}`);
    }
  }
  const snippets = rows.filter(r => !r.question);
  const snipTotal = snippets.reduce((s, r) => s + r.examples.length, 0);
  const snipOk = snippets.reduce((s, r) => s + r.examples.filter(e => e.verified).length, 0);
  console.log(`\n${rows.length} animations (${rows.length - snippets.length} question explainers, ${snippets.length} solutions)`);
  const good = rows.filter(r => r.review === 'good').length;
  console.log(`${snipOk}/${snipTotal} solution examples verified by execution; ${good}/${rows.length} passed tutor review (☆); ${clean}/${rows.length} with no open problems, ${problems} problems left (minor wording notes not counted)`);
  return rows;
}

if (args.includes('--report') || args.includes('--issues')) { await printReport(args.includes('--issues')); process.exit(0); }

const [onlyQ, onlyPart] = only ? only.split('.') : [];
const targets = realq().questions
  .filter(q => !onlyQ || q.id === onlyQ)
  .flatMap(q => [
    ...(onlySnippets || (onlyPart && onlyPart !== 'q') ? [] : [{ qid: q.id, idx: 'q', label: 'the question itself' }]),
    ...(onlyQuestions || onlyPart === 'q' ? [] : q.snippets
      .filter(s => !onlyPart || onlyPart === `s${s.idx}`)
      .map(s => ({ qid: q.id, idx: s.idx, label: s.label }))),
  ]);

const ATTEMPTS = 3;
const sleep = ms => new Promise(r => setTimeout(r, ms));
let next = 0, done = 0, written = 0, cached = 0, failed = 0;

async function one(t) {
  const at = `[${++done}/${targets.length}] ${t.qid}.${t.idx === 'q' ? 'q' : `s${t.idx}`}`;
  for (let attempt = 1; ; attempt++) {
    const started = Date.now();
    try {
      const anim = t.idx === 'q'
        ? await explainQuestion(t.qid, { refresh: force })
        : await animate(t.qid, t.idx, { refresh: force });
      const secs = (Date.now() - started) / 1000;
      if (secs < 2 && !force) { cached++; console.log(`${at} cached`); return; }
      written++;
      const v = anim.examples.filter(e => e.verified).length;
      const issues = anim.examples.reduce((s, e) => s + (e.issues?.length || 0) + (e.defects?.length || 0), 0);
      const check = t.idx === 'q' ? '' : `, ${v} verified`;
      const by = anim.model ? ` · ${anim.model.replace(/^claude-/, '')}` : '';
      console.log(`${at} ${secs.toFixed(0)}s · ${anim.kind} · ${anim.examples.length} examples${check}, review ${anim.review}, ${issues} notes${by} · ${t.label.slice(0, 50)}`);
      return;
    } catch (err) {
      if (attempt >= ATTEMPTS) { failed++; console.error(`${at} FAILED: ${err.message}`); return; }
      const wait = 5000 * 2 ** (attempt - 1);
      console.warn(`${at} attempt ${attempt} failed (${err.message}), retrying in ${wait / 1000}s`);
      await sleep(wait);
    }
  }
}

async function worker() { while (next < targets.length) await one(targets[next++]); }

console.log(`${targets.length} animations, ${jobs} at a time${force ? ' (forced)' : ''}`);
const t0 = Date.now();
await Promise.all(Array.from({ length: jobs }, worker));
console.log(`\ndone in ${((Date.now() - t0) / 60000).toFixed(1)}min: ${written} written, ${cached} cached, ${failed} failed\n`);
await printReport();
if (failed) process.exitCode = 1;
