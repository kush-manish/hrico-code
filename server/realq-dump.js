/**
 * Prints every slide of a question's animations as text, so a human (or a
 * review model) can read a whole question's teaching material in one go.
 *
 *   node server/realq-dump.js q3            # question explainer + all snippets
 *   node server/realq-dump.js q3.s1         # one animation
 *   node server/realq-dump.js q3 --json     # machine-readable
 */
import path from 'path';
import { fileURLToPath } from 'url';
import { FileStore } from './cache/fileStore.js';
import { realq } from './realq.js';
import { lint } from './realq-lint.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const store = new FileStore(process.env.REALQ_ANIM_CACHE_DIR || path.join(__dirname, '../.cache/realq-anim'));

const [target, ...flags] = process.argv.slice(2);
if (!target) { console.error('usage: realq-dump.js qN[.sM|.q] [--json]'); process.exit(2); }
const [qid, part] = target.split('.');
const q = realq().questions.find(x => x.id === qid);
if (!q) { console.error(`no question ${qid}`); process.exit(2); }

const keys = part ? [`${qid}.${part}`] : [`${qid}.q`, ...q.snippets.map(s => `${qid}.s${s.idx}`)];

const pic = (kind, f) => {
  if (kind === 'array' || kind === 'stack') {
    const row = f.cells.map((v, i) => {
      const m = f.highlight.includes(i) ? '*' : f.done.includes(i) ? '+' : f.bad.includes(i) ? 'x' : ' ';
      const ptr = Object.entries(f.pointers).filter(([, p]) => p === i).map(([n]) => `^${n}`).join('');
      const lab = f.labels[String(i)] ? `{${f.labels[String(i)]}}` : '';
      return `${m}${v}${ptr}${lab}`;
    }).join(' | ');
    const aux = Object.entries(f.aux || {}).map(([k, v]) => `\n      ${k}: [${v.join(', ')}]`).join('');
    const rg = (f.ranges || []).map(r => ` [${r.from}..${r.to} ${r.label}]`).join('');
    return `[${row}]${rg}${aux}`;
  }
  if (kind === 'grid') {
    const key = ([r, c]) => `${r},${c}`;
    const hl = new Set(f.highlight.map(key)), dn = new Set(f.done.map(key)), bd = new Set(f.bad.map(key));
    return f.grid.map((row, r) => '      ' + row.map((v, c) => {
      const k = `${r},${c}`;
      return `${hl.has(k) ? '*' : dn.has(k) ? '+' : bd.has(k) ? 'x' : ' '}${String(v).padStart(3)}`;
    }).join('')).join('\n').trimStart();
  }
  const mark = id => (f.highlight.includes(id) ? '*' : f.done.includes(id) ? '+' : f.bad.includes(id) ? 'x' : '');
  const lab = id => (f.labels?.[id] ? `{${f.labels[id]}}` : '');
  if (kind === 'tree') return f.nodes.map(n => `${mark(n.id)}${n.label}${n.parent != null ? `<${n.parent}${n.side ? n.side : ''}` : '(root)'}${lab(n.id)}`).join(' ');
  if (kind === 'list') return f.nodes.map(n => `${mark(n.id)}${n.label}${Object.entries(f.pointers).filter(([, v]) => v === n.id).map(([k]) => `^${k}`).join('')}`).join(' -> ');
  if (kind === 'graph') {
    const act = new Set(f.activeEdges.map(e => e.join('-')));
    return `nodes: ${f.nodes.map(n => `${mark(n.id)}${n.label}${lab(n.id)}`).join(' ')}\n      edges: ${f.edges.map(e => `${act.has(`${e[0]}-${e[1]}`) ? '*' : ''}${e[0]}${f.directed ? '->' : '-'}${e[1]}${e[2] != null ? `(${e[2]})` : ''}`).join(' ')}`;
  }
  return '';
};

const out = [];
for (const key of keys) {
  const doc = await store.get(key);
  if (!doc?.anim) { console.log(`\n##### ${key}: NOT GENERATED`); continue; }
  const a = doc.anim;
  const code = a.question ? '' : a.code;
  const issues = lint(a, code);
  if (flags.includes('--json')) { out.push({ key, ...a, issues }); continue; }
  const label = a.question ? 'THE QUESTION' : q.snippets[Number(key.split('.s')[1])]?.label;
  console.log(`\n##### ${key} · ${a.kind} · ${label}`);
  if (code) console.log(code.split('\n').map((l, i) => `  ${String(i + 1).padStart(2)} ${l}`).join('\n'));
  for (const e of a.examples) {
    console.log(`\n=== ${e.name}  ${a.question ? '' : e.verified ? '✓' : `✗ ${e.verifyError}`}`);
    console.log(`    input:    ${e.input}\n    expected: ${e.expected}\n    why:      ${e.why}`);
    for (const x of issues[e.name] || []) console.log(`    ! ${x}`);
    e.frames.forEach((f, i) => {
      const extra = [f.queue?.length ? `queue=[${f.queue.join(', ')}]` : '', f.stack?.length ? `stack=[${f.stack.join(', ')}]` : ''].filter(Boolean).join(' ');
      console.log(`  ${String(i + 1).padStart(2)}${f.line ? ` L${f.line}` : '    '} ${f.caption}\n      ${f.note}\n      ${pic(a.kind, f)}${extra ? `\n      ${extra}` : ''}${Object.keys(f.vars).length ? `\n      vars: ${JSON.stringify(f.vars)}` : ''}`);
    });
  }
}
if (flags.includes('--json')) console.log(JSON.stringify(out, null, 1));
