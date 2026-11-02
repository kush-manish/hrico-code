/**
 * Checks every cached simple-view animation for the faults that make a frame
 * draw wrong: indices that point outside the data, references to nodes that do
 * not exist, code lines that are not in the code, and frames that change shape
 * midway through an example.
 *
 *   node server/prolearn-audit.js [--fix] [--jobs=20]
 *
 * --fix regenerates every page that has a fault.
 */
import path from 'path';
import { fileURLToPath } from 'url';
import { FileStore } from './cache/fileStore.js';
import { outline } from './prolearn.js';
import { simple } from './prolearn-simple.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const store = new FileStore(process.env.PROLEARN_SIMPLE_CACHE_DIR
  || path.join(__dirname, '../.cache/prolearn-simple'));

const args = process.argv.slice(2);
const fix = args.includes('--fix');
const jobs = Math.max(1, Math.min(32, Number(args.find(a => a.startsWith('--jobs='))?.slice(7)) || 8));

/** Every fault is phrased so the message alone says what is wrong and where. */
function auditExample(ex, kind, codeLines, where) {
  const bad = [];
  const add = (i, msg) => bad.push(`${where} frame ${i + 1}: ${msg}`);
  const frames = ex.frames || [];
  if (frames.length < 3) bad.push(`${where}: only ${frames.length} frames`);

  let gridShape = null;

  frames.forEach((f, i) => {
    if (!f.caption) add(i, 'no caption');
    if (!f.note) add(i, 'no note (the teaching line)');
    if (f.line != null && codeLines && f.line > codeLines) {
      add(i, `line ${f.line} but the code has ${codeLines} lines`);
    }

    // Cell count may legitimately change — merge sort re-views the array, a
    // stack's input row shrinks — so only an empty picture is a fault.
    if (kind === 'array' || kind === 'stack') {
      const n = (f.cells || []).length;
      if (!n && !(f.stack || []).length && !(f.queue || []).length) add(i, 'nothing to draw');
      const inRange = (v, label) => {
        if (!Number.isInteger(v) || v < 0 || v >= n) add(i, `${label} ${v} is outside 0..${n - 1}`);
      };
      for (const [name, idx] of Object.entries(f.pointers || {})) inRange(idx, `pointer "${name}"`);
      for (const g of ['highlight', 'done', 'bad']) (f[g] || []).forEach(v => inRange(v, g));
      for (const r of f.ranges || []) {
        if (r.from > r.to) add(i, `range "${r.label}" runs backwards (${r.from}..${r.to})`);
        else { inRange(r.from, `range "${r.label}" from`); inRange(r.to, `range "${r.label}" to`); }
      }
      for (const k of Object.keys(f.labels || {})) inRange(Number(k), `label key`);
      (f.stackHl || []).forEach(v => {
        if (!Number.isInteger(v) || v < 0 || v >= (f.stack || []).length) add(i, `stackHl ${v} outside the stack`);
      });
      (f.queueHl || []).forEach(v => {
        if (!Number.isInteger(v) || v < 0 || v >= (f.queue || []).length) add(i, `queueHl ${v} outside the queue`);
      });
    } else if (kind === 'grid') {
      const g = f.grid || [];
      if (!g.length) add(i, 'no grid');
      const shape = `${g.length}x${g[0]?.length ?? 0}`;
      if (gridShape === null) gridShape = shape;
      else if (shape !== gridShape) add(i, `grid is ${shape} but frame 1 was ${gridShape}`);
      if (g.some(row => row.length !== (g[0]?.length ?? 0))) add(i, 'grid rows are ragged');
      for (const name of ['highlight', 'done', 'bad']) {
        for (const [r, c] of f[name] || []) {
          if (!g[r] || c < 0 || c >= g[r].length) add(i, `${name} cell [${r},${c}] is outside the grid`);
        }
      }
    } else {
      const ids = new Set((f.nodes || []).map(n => n.id));
      if (!ids.size) add(i, 'no nodes');
      const known = (v, label) => { if (!ids.has(v)) add(i, `${label} "${v}" is not a node in this frame`); };
      for (const g of ['highlight', 'done', 'bad']) (f[g] || []).forEach(v => known(v, g));
      for (const [name, id] of Object.entries(f.pointers || {})) known(id, `pointer "${name}"`);
      for (const k of Object.keys(f.labels || {})) known(k, 'label key');
      if (kind === 'list') {
        for (const [from, to] of Object.entries(f.next || {})) { known(from, 'next from'); known(to, 'next to'); }
      } else if (kind === 'tree') {
        for (const n of f.nodes || []) {
          if (n.parent != null && !ids.has(n.parent)) add(i, `node "${n.id}" has parent "${n.parent}" which is not in this frame`);
        }
        if (!(f.nodes || []).some(n => n.parent == null)) add(i, 'no root: every node has a parent');
      } else {
        for (const e of f.edges || []) { known(e[0], 'edge end'); known(e[1], 'edge end'); }
        for (const e of f.activeEdges || []) {
          const has = (f.edges || []).some(x => (x[0] === e[0] && x[1] === e[1]) || (x[0] === e[1] && x[1] === e[0]));
          if (!has) add(i, `activeEdge ${e[0]}-${e[1]} is not one of the edges`);
        }
      }
    }
  });
  return bad;
}

function auditDoc(doc) {
  const a = doc.anim;
  if (!a) return ['no animation'];
  const codeLines = String(a.code || '').split('\n').length;
  const bad = [];
  if (!a.examples?.length) return ['no examples'];
  a.examples.forEach((ex, k) => {
    if (!ex.input) bad.push(`example ${k + 1} "${ex.name}": no input`);
    if (!ex.expected) bad.push(`example ${k + 1} "${ex.name}": no expected output`);
    bad.push(...auditExample(ex, a.kind, codeLines, `example ${k + 1} "${ex.name}"`));
  });
  return bad;
}

const slugs = outline().flatMap(c => c.groups.flatMap(g => g.articles.map(a => a.slug)));
const faults = new Map();

for (const slug of slugs) {
  const doc = await store.get(slug);
  if (!doc) { faults.set(slug, ['not generated']); continue; }
  const bad = auditDoc(doc);
  if (bad.length) faults.set(slug, bad);
}

console.log(`${slugs.length} pages checked, ${faults.size} with faults\n`);
for (const [slug, bad] of faults) {
  console.log(`${slug} (${bad.length})`);
  for (const b of bad.slice(0, 6)) console.log(`    ${b}`);
  if (bad.length > 6) console.log(`    …and ${bad.length - 6} more`);
}

if (!fix || !faults.size) process.exit(faults.size ? 1 : 0);

// ------------------------------------------------------------------- fix ---

console.log(`\nregenerating ${faults.size} pages, ${jobs} at a time`);
const todo = [...faults.keys()];
let next = 0, fixed = 0, stillBad = 0, failed = 0;

async function worker() {
  while (next < todo.length) {
    const slug = todo[next++];
    try {
      const doc = await simple(slug, { refresh: true });
      const bad = auditDoc(doc);
      if (bad.length) { stillBad++; console.log(`  ${slug}: still ${bad.length} faults — ${bad[0]}`); }
      else { fixed++; console.log(`  ${slug}: clean`); }
    } catch (err) {
      failed++;
      console.error(`  ${slug}: FAILED ${err.message}`);
    }
  }
}
await Promise.all(Array.from({ length: jobs }, worker));
console.log(`\n${fixed} fixed, ${stillBad} still faulty, ${failed} errored`);
