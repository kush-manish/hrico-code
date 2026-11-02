/**
 * REALQ: real Google interview reports, parsed from the four markdown files
 * in server/data/realq. File 4 (the worked solutions, Q1–Q28) is the backbone;
 * files 1–3 become reference pages. Each Python snippet in a solution can be
 * animated on demand with the same frame format Pro-Learn uses, and the
 * frames are cached on disk so a trace is generated once.
 */
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { FileStore } from './cache/fileStore.js';
import { llm } from './llm/client.js';
import { log } from './log.js';
import { UpstreamError } from './errors.js';
import { normaliseWalkthrough } from './explain.js';
import { ANIM_SYSTEM } from './prolearn-simple.js';
import { lint } from './realq-lint.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(__dirname, 'data/realq');
const store = new FileStore(process.env.REALQ_ANIM_CACHE_DIR || path.join(__dirname, '../.cache/realq-anim'));
// Sonnet draws, Sonnet reviews; Opus is only brought in for an animation that
// still fails verification or review after Sonnet's repair rounds.
const ANIM_MODEL = process.env.REALQ_ANIM_MODEL || 'claude-sonnet-4-6';
const STRONG_MODEL = process.env.REALQ_STRONG_MODEL || 'claude-opus-4-6';

// Documents live on disk for good and in memory for the life of the process; the
// mtime check keeps a long-running server honest when the warmer rewrites a file.
const mem = new Map();
const pending = new Map();   // key -> in-flight generation, so two clicks never trace twice
async function getDoc(key) {
  const at = await store.mtime(key);
  if (at == null) { mem.delete(key); return null; }
  const hit = mem.get(key);
  if (hit && hit.at === at) return hit.doc;
  const doc = await store.get(key);
  if (doc) mem.set(key, { at, doc });
  return doc;
}
async function setDoc(key, doc) {
  await store.set(key, doc);
  mem.set(key, { at: await store.mtime(key), doc });
  return doc;
}
const failed = new Map();    // key -> { error, at }, so a poller learns why a generation died
const FAIL_TTL = 2 * 60_000;
/** Runs `make` once per key even when asked concurrently. */
function once(key, make) {
  if (pending.has(key)) return pending.get(key);
  const p = make().finally(() => pending.delete(key));
  p.then(() => failed.delete(key), error => failed.set(key, { error, at: Date.now() }));
  pending.set(key, p);
  return p;
}
export const inFlight = key => pending.has(key);
export const forget = key => failed.delete(key);
/** The error from a generation that ended in the last two minutes, or null. */
export function recentFailure(key) {
  const f = failed.get(key);
  if (!f) return null;
  if (Date.now() - f.at > FAIL_TTL) { failed.delete(key); return null; }
  return f.error;
}
/** The finished animation for a key, or null — never starts one. */
export async function finished(key) {
  const doc = await getDoc(key);
  return doc?.schema === SCHEMA && doc.anim ? strip(doc.anim) : null;
}
// 2: examples carry a runnable `call` and a `verified` flag from executing it.
const SCHEMA = 2;
const MAX_EXAMPLES = 6;

const read = f => { try { return fs.readFileSync(path.join(DATA, f), 'utf8'); } catch { return ''; } };
const PY_FENCE = /```python\n([\s\S]*?)```/g;

/** "Title (meta)" → { title, meta }; the meta is the trailing parenthetical, nested parens allowed. */
function splitTitle(s) {
  const m = s.match(/^(.*?)\s*\(([^()]*(?:\([^()]*\)[^()]*)*)\)\s*$/);
  return m ? { title: m[1].trim(), meta: m[2].trim() } : { title: s.trim(), meta: '' };
}

/** Python fences in order, each with the bold label that introduces it (if any). */
function snippets(md) {
  const out = [];
  const labelled = /(?:\*\*([^*\n]+)\*\*[^\n]*\n+)?```python\n([\s\S]*?)```/g;
  let m;
  while ((m = labelled.exec(md))) out.push({ idx: out.length, label: (m[1] || '').trim(), code: m[2].replace(/\s+$/, '') });
  return out;
}

/** Splits a document on `## ` headings; the text before the first one is the intro. */
function sections(md, prefix) {
  const lines = md.split('\n');
  const title = (lines.find(l => l.startsWith('# ')) || '').replace(/^#\s*/, '');
  const parts = md.split(/\n(?=## )/);
  const intro = parts[0].replace(/^# .*\n/, '').trim();
  const pages = parts.slice(1).map((chunk, i) => {
    const nl = chunk.indexOf('\n');
    const heading = chunk.slice(3, nl < 0 ? undefined : nl).trim();
    return { id: `${prefix}-${i + 1}`, title: heading, md: nl < 0 ? '' : chunk.slice(nl + 1).trim() };
  });
  return { title, intro, pages };
}

function parseSolutions(md) {
  const partRe = /^# Part (\d+) — (.+)$/m;
  const blocks = md.split(/\n(?=# Part \d+ — |## One-page recap)/);
  const intro = blocks[0].replace(/^# .*\n/, '').trim();
  const imports = (intro.match(PY_FENCE) || [''])[0].replace(/```python\n|```/g, '').trim();
  const parts = [];
  const questions = [];
  let recap = '';
  for (const block of blocks.slice(1)) {
    if (block.startsWith('## One-page recap')) { recap = block.replace(/^## .*\n/, '').trim(); continue; }
    const pm = block.match(partRe);
    if (!pm) continue;
    const part = { n: Number(pm[1]), title: pm[2].trim(), questions: [] };
    parts.push(part);
    for (const qchunk of block.split(/\n(?=## Q\d+\. )/).slice(1)) {
      const nl = qchunk.indexOf('\n');
      const head = qchunk.slice(3, nl < 0 ? undefined : nl).trim();
      const hm = head.match(/^Q(\d+)\.\s*(.+)$/);
      if (!hm) continue;
      const body = (nl < 0 ? '' : qchunk.slice(nl + 1)).replace(/\n---\s*$/, '').trim();
      const q = { id: `q${hm[1]}`, n: Number(hm[1]), part: part.n, ...splitTitle(hm[2]), md: body, snippets: snippets(body) };
      questions.push(q);
      part.questions.push(q.id);
    }
  }
  return { intro, imports, parts, questions, recap };
}

let cached = null;
export function realq() {
  if (cached) return cached;
  const sol = parseSolutions(read('4-solutions.md'));
  cached = {
    ...sol,
    asked: sections(read('1-asked.md'), 'asked'),
    behavioural: sections(read('2-behavioural.md'), 'bv'),
    process: sections(read('3-process.md'), 'proc'),
  };
  return cached;
}

export function snippet(qid, idx) {
  const q = realq().questions.find(x => x.id === qid);
  const s = q?.snippets[idx];
  return q && s ? { q, s } : null;
}

/**
 * Earlier snippets of the same question, so a follow-up that calls a helper
 * defined two fences above runs (and the model knows the helper exists).
 */
export function preamble(qid, idx) {
  const q = realq().questions.find(x => x.id === qid);
  return q ? q.snippets.filter(x => x.idx < idx).map(x => x.code).join('\n\n') : '';
}

const numbered = code => code.split('\n').map((l, i) => `${String(i + 1).padStart(3)}  ${l}`).join('\n');
const prose = q => q.md.replace(PY_FENCE, '').replace(/\*\*(.+?)\*\*/g, '$1').trim().slice(0, 3500);

/** What every example must carry on top of the frame format, so we can run it. */
const CALL_RULES = `EVERY example ALSO has a "call": one or more lines of plain Python that invoke the code above on
exactly the example's input and leave the answer in a variable named result, e.g.
  "call": "result = presence_sweep([['Mary', 10, 40], ['John', 30, 50]])"
For a class: construct it and call the methods in order, collecting what matters, e.g.
  "call": "d = Dedupe(5); result = [d.add('a', 1), d.add('a', 3), d.add('a', 7)]"
Use only literals and the names defined in the snippet — no imports, no random, no I/O.
"expected" must be exactly repr(result) as Python would print it (lists with [], strings quoted).
The frames must agree with that call: same input values, and the last frame's caption states the
same final answer. The caller RUNS the call to check "expected"; a wrong "expected" is rejected.`;

/** How the frames of a solution trace must be cut. */
const STEP_RULES = `PICTURE: the kind follows the INPUT'S SHAPE, not the data structure the code keeps. A 2-D grid/matrix
input is ALWAYS kind "grid" (draw it as rows × columns — never flatten it into a row of "(r,c)" cells);
a tree input is "tree"; nodes+edges are "graph"; a linked list is "list"; a flat sequence is "array".
The queue, stack or heap the code keeps is drawn UNDER any picture via "queue"/"stack" on each frame,
so use kind "stack" only when the input itself is a flat sequence and the stack/queue is the point.

FRAME RULES. Frame 1 shows the input as given and the call about to be made. Then ONE frame per
state change: each dequeue/pop, each push/enqueue, each cell or node whose value changes, each decision
(if-branch taken or not) — never "the eight cells are each processed" in one frame; if the input would
need more than 30 frames, choose a smaller input instead. Every frame marks exactly the cells/nodes its
caption talks about and shows the queue/stack/heap contents whenever the code keeps one. Captions state
facts ("dequeue (1,0); dist=1"), never hedge ("wait", "actually", "let me"). The LAST frame's caption
starts with "Returns " followed by the result written exactly as "expected", and marks the cells/nodes
that result is made of (for a returned matrix every cell carries its final value).`;

/** Names an earlier snippet defines that this one may call. */
const helperNote = (q, s) => {
  const pre = preamble(q.id, s.idx);
  const names = [...pre.matchAll(/^(?:def|class) (\w+)/gm)].map(m => m[1]);
  return names.length ? `\nAlso in scope, defined by earlier snippets of this question (do not re-trace them, just call them):\n${names.join(', ')}\n` : '';
};

const animPrompt = (q, s, imports) => `Animate this solution to a real Google interview question: "${q.title}".

THE QUESTION, with the worked examples the author drew and the complexity notes:
${prose(q)}

THE SOLUTION TO TRACE${s.label ? ` — ${s.label}` : ''}. Every frame's "line" refers to these numbers:
${numbered(s.code)}

The code assumes these imports are present:
${imports}
${helperNote(q, s)}
Trace the function on one of the drawn examples if it is small enough, otherwise invent a tiny input
with the same shape. If the code is a class, trace a short sequence of method calls on one instance.

Produce THREE examples, not two: "General case", one "Edge case: …" where a naive approach breaks
(empty / single element / ties / all equal / boundary), and one "Also: …" that exercises a different
branch of the code than the general case (the other side of an if, a wrap-around, a follow-up input).

${STEP_RULES}

${CALL_RULES}`;

const extraPrompt = (q, s, imports, input, anim) => `Animate this solution to a real Google interview question: "${q.title}".

THE QUESTION:
${prose(q)}

THE SOLUTION TO TRACE${s.label ? ` — ${s.label}` : ''}. Every frame's "line" refers to these numbers:
${numbered(s.code)}

The code assumes these imports are present:
${imports}
${helperNote(q, s)}
Use kind "${anim.kind}" — the same picture as the existing trace. Return ONE example only, in the
"examples" array, named after what this input exercises (3-7 words), traced on EXACTLY this input
that the learner typed:
${input}

If the input is not valid for this function, return {"error": "<one sentence why>"} instead.

${STEP_RULES}

${CALL_RULES}`;

/**
 * The separately-asked parts of a question (Warm-up / Main / Follow-up, or Q2a/Q2b/Q2c
 * sections), each with its first sentence, so the explainer covers every one of them.
 */
export function questionParts(q) {
  const md = q.md.replace(/```[\s\S]*?```/g, '');
  const out = [];
  const skip = s => /not coded|discussion only/i.test(s);
  // "**Q1.1 Warm-up.** text" statements at the top of the question.
  for (const m of md.matchAll(/^\*\*(Q\d+\.\d+)([^*\n]*)\*\*\s*([^\n]*)$/gm)) {
    if (skip(m[2])) continue;
    const tag = m[2].replace(/\([^)]*\)/g, '').replace(/[.:]\s*$/, '').trim();
    const text = m[3].trim();
    if (!text) continue;
    out.push({ name: tag ? `${m[1]} ${tag}` : m[1], text: text.slice(0, 220) });
  }
  if (!out.length) {
    // "### Q2.1 Title" sections: the title plus the first plain paragraph under it.
    const secs = md.split(/\n(?=### Q\d+\.\d+\s)/).slice(1);
    for (const sec of secs) {
      const lines = sec.split('\n');
      const hm = lines[0].match(/^### (Q\d+\.\d+)\s+(.+)$/);
      if (!hm || / and Q\d/.test(hm[2]) || skip(sec.slice(0, 400))) continue;
      const title = hm[2].replace(/\*\*/g, '').replace(/\s*\((?:my|not)[^)]*\)\s*$/i, '').trim();
      const para = lines.slice(1).find(l => l.trim() && !/^[*|#]/.test(l.trim()) && !/^\*/.test(l.trim()));
      out.push({ name: `${hm[1]} ${title.slice(0, 40)}`, text: (para || title).trim().slice(0, 220) });
    }
  }
  if (!out.length) {
    for (const m of md.matchAll(/\*\*((?:Warm-up|Main|Follow-up|Twist|Variant|Harder|Part|Bonus|Extension)[^*\n]{0,50}?)\*\*\s*([^*\n]*)/g)) {
      const name = m[1].replace(/[.:]\s*$/, '').replace(/\s+asked$/, '').trim();
      const text = m[2].trim();
      // "Follow-up, brute force" and "Optimal — …" are snippet titles, not parts of the question.
      if (/—|brute|optimal|closed form/i.test(name) || !text || /^\|/.test(text)) continue;
      out.push({ name, text: text.slice(0, 220) });
    }
  }
  return out.slice(0, 4);
}

/** The author's "Same call?" note: whether the parts were asked in one interview. */
export const sameCall = q => (q.md.match(/^\*\*Same call\?\*\*\s*(.+)$/m) || [])[1]?.trim() || '';

const partsNote = q => {
  const parts = questionParts(q);
  if (parts.length < 2) return `Produce THREE examples. Example 1 "General case": the author's own first example if it is small
enough, otherwise a tiny one with the same shape. Example 2 "Edge case: …": the smallest or most
easily misread legal input (empty, one element, ties, everything equal, no answer). Example 3
"Also: …": a second general input whose answer differs in an instructive way (a different branch
of the rules, the follow-up version of the question if the text has one).`;
  const sc = sameCall(q);
  return `THIS QUESTION HAS ${parts.length} SEPARATELY ASKED PARTS, and the interviewer expects an answer to each one:
${parts.map((p, i) => `${i + 1}. ${p.name}: ${p.text}`).join('\n')}
${sc ? `(Were they one interview? ${sc})` : ''}

Produce ONE example PER PART, in that order, named "${parts.map(p => `${p.name}: …`).join('", "')}" (fill
in 3-6 words saying what the input is), PLUS one final "Edge case: …" on the hardest part (the smallest or
most easily misread legal input: empty, one element, ties, no answer). Each part's example must end on
the output THAT PART asks for — if the warm-up asks "does a path exist" its expected is True/False; if
a part asks for a matrix, its expected is the full matrix drawn cell by cell on the picture; if a part
asks for a number, the number. Reuse the same small input across parts where that helps the reader see
how the question grows.`;
};

/** The question itself, animated with no code: what is asked, what the terms mean, how the answer forms. */
const questionPrompt = q => `EXPLAIN THIS GOOGLE INTERVIEW QUESTION ITSELF — NOT any algorithm or code. The reader is seeing
the problem for the first time and must end up able to restate it and predict the output by hand.

THE QUESTION, as the interviewer gave it, with the author's notes (ignore any solution talk):
${prose(q)}

Pick the visual kind that fits the INPUT (grid → "grid", tree → "tree", graph → "graph", a stream
or sequence of events / intervals / numbers → "array", a stack or queue of events → "stack").

${partsNote(q)}

For every example the frames go in this order:
1. Frame 1 shows the input exactly as given; the caption restates the task in plain words
   ("We are given … and must return …"). "vars" holds the parameters (k, target, …).
2. One frame per TERM the question uses, marking the cells/nodes the definition refers to
   ("these two intervals overlap because 3 < 5", "this is a lake: water fully enclosed by land").
3. Frames that build the EXPECTED OUTPUT piece by piece — use "done", "labels" or an "aux" row
   named "answer" so the output is seen forming on the picture.
4. One frame per RULE or TRAP that changes the answer (what "exactly", "unique", "at most",
   "in order" rules out; what happens at a boundary; what a careless reading would output instead
   — mark that wrong reading as "bad").
5. The last frame's caption starts with "Answer: " followed by the expected output written exactly
   as the "expected" literal, and the picture marks the cells/nodes that make up that answer.

Every frame draws something: never an empty picture, and every frame marks ("highlight"/"done"/"bad"
or "labels") exactly the cells/nodes its caption talks about. Each frame shows ONE change from the
frame before it; never summarise several steps in one frame ("the eight cells are each…") — give each
its own frame, or pick a smaller input. No solution talk: no algorithm names, no BFS/DFS/DP/heap/
binary-search, no "the trick is" — only what the question asks and what the output is for this input.
"line" is null in every frame — there is no code. "note" is the teaching sentence, written as the
interviewer would clarify it. 8-16 frames for the general case, 5-10 for the others. "expected" is
the correct output for that input written as a Python literal, and "input" the input as a Python
literal.`;

const lintPrompt = problems => `A reviewer checked the slides and found these problems:
${Object.entries(problems).map(([name, list]) => `- "${name}":\n${list.map(x => `    • ${x}`).join('\n')}`).join('\n')}

Return the SAME JSON object again with these fixed: every slide must mark the cell/node it is about,
carry a non-empty "note", queues and stacks must be drawn on every slide where they exist, no two
consecutive slides may be identical, a slide that collapsed several steps must be split into one slide
per step, no thinking-aloud, and the last slide's caption must state the final answer written exactly
as "expected" (a list or matrix in full). Keep everything that was not flagged exactly as it was.`;

const REVIEW_MODEL = process.env.REALQ_REVIEW_MODEL || 'claude-sonnet-4-6';

/** The slides as a reviewer reads them: every caption, note, and what is marked. */
function transcript(anim) {
  const marks = f => {
    const bits = [];
    if (f.cells?.length) bits.push(`cells=[${f.cells.join(',')}]`);
    if (f.grid?.length) bits.push(`grid=${JSON.stringify(f.grid)}`);
    if (f.nodes?.length) bits.push(`nodes=${f.nodes.map(n => n.label + (n.parent != null ? `<${n.parent}` : '')).join(' ')}`);
    if (f.edges?.length) bits.push(`edges=${f.edges.map(e => e.slice(0, 2).join('-') + (e[2] != null ? `(${e[2]})` : '')).join(' ')}`);
    for (const g of ['highlight', 'done', 'bad', 'activeEdges']) if (f[g]?.length) bits.push(`${g}=${JSON.stringify(f[g])}`);
    if (f.pointers && Object.keys(f.pointers).length) bits.push(`pointers=${JSON.stringify(f.pointers)}`);
    if (f.labels && Object.keys(f.labels).length) bits.push(`labels=${JSON.stringify(f.labels)}`);
    if (f.aux && Object.keys(f.aux).length) bits.push(`aux=${JSON.stringify(f.aux)}`);
    if (f.queue?.length) bits.push(`queue=[${f.queue.join(',')}]`);
    if (f.stack?.length) bits.push(`stack=[${f.stack.join(',')}]`);
    if (f.vars && Object.keys(f.vars).length) bits.push(`vars=${JSON.stringify(f.vars)}`);
    return bits.join(' ');
  };
  return anim.examples.map(e => `=== "${e.name}"  input: ${e.input}  expected: ${e.expected}\n${
    e.frames.map((f, i) => `${i + 1}.${f.line ? ` [L${f.line}]` : ''} ${f.caption}\n   note: ${f.note}\n   ${marks(f)}`).join('\n')}`).join('\n\n');
}

const reviewPrompt = (q, s, anim) => `You are reviewing teaching slides for a Google interview question: "${q.title}".
${s ? `The slides trace THIS code (line numbers refer to it):\n${numbered(s.code)}` : 'The slides explain the QUESTION ITSELF — no code — so a reader can predict the output by hand.'}

THE QUESTION:
${prose(q).slice(0, 2500)}

THE SLIDES (each: caption, teaching note, and what the picture marks):
${transcript(anim)}

Find every defect a careful tutor would fix. Look for:
- a false statement, wrong arithmetic, or a claim the picture contradicts (e.g. caption says "pop (0,1)" but the queue drawn does not contain it; "distance is 2" but the grid shows 1)
- hedging or thinking-aloud left in ("wait", "actually", "hmm", "let me", a question mark the slide then answers itself)
- a slide that marks the wrong cells/nodes for what the caption says, or marks nothing while talking about a specific cell
- a jump: two consecutive slides where a decision or state change happened in between but was never shown
- a last slide whose caption does not state the final answer, or states one that disagrees with "expected"
- a caption or note that teaches nothing (restates the code, "we continue", "next step")
- an example that does not show what its name promises
${s ? '- a slide whose [L] line is not the line that does what the caption says' : '- any solution talk: the slides must explain WHAT is asked, not HOW to solve it'}
- several steps collapsed into one slide ("the eight cells are each processed…") — each change needs its own slide
${!s && questionParts(q).length >= 2 ? `- a PART of the question with no example of its own: the question has these parts — ${questionParts(q).map(p => p.name).join(', ')} — and each must get an example ending on the output that part asks for` : ''}

Return ONLY JSON: {"verdict": "good" | "fix", "defects": [{"example": "<example name>", "slide": <number or null>, "severity": "major" | "minor", "problem": "<one sentence, concrete>", "fix": "<what the slide should say or mark instead>"}]}
"major" = would mislead a learner: a false statement, wrong number, wrong or missing marks for what the caption
names, hedging left in, a skipped state change, or a final slide that does not state the right answer.
"minor" = wording, a note that could teach more, a line number one off, a slide that could be split.
Up to 12 defects, worst first. "verdict" is "fix" only if there is at least one major defect.`;

const reviewFixPrompt = defects => `A tutor reviewed the slides and found these problems:
${defects.map(d => `- "${d.example}"${d.slide ? ` slide ${d.slide}` : ''}: ${d.problem} → ${d.fix}`).join('\n')}

Return the SAME JSON object again with every one fixed: correct the facts, remove all hedging and
thinking-aloud, mark exactly the cells/nodes each caption talks about, insert the missing step where a
state change was skipped, and make the last slide of each example state the final answer so it matches
"expected". Keep every "call", "input" and "expected" unchanged, and keep slides that were not flagged.`;

/** Asks the review model for defects; never throws (a review that fails just means no second pass). */
async function review(q, s, anim, model) {
  try {
    const r = await llm.chatJson({
      where: 'realq/review', model: model || REVIEW_MODEL, temperature: 0, maxTokens: 3000, timeoutMs: 180_000,
      messages: [{ role: 'user', content: reviewPrompt(q, s, anim) }],
    });
    const defects = (Array.isArray(r?.defects) ? r.defects : []).slice(0, 12).map(d => ({
      example: String(d?.example || '').slice(0, 80), slide: Number.isFinite(Number(d?.slide)) ? Number(d.slide) : null,
      severity: d?.severity === 'minor' ? 'minor' : 'major',
      problem: String(d?.problem || '').slice(0, 300), fix: String(d?.fix || '').slice(0, 300),
    })).filter(d => d.problem);
    // Only major defects fail the review; minor ones are kept as notes for the reader.
    const major = defects.filter(d => d.severity === 'major').length;
    return { verdict: major ? 'fix' : 'good', defects, major };
  } catch (err) {
    log.warn('realq: review unavailable', { err: err.message });
    return null;
  }
}

const fixPrompt = failures => `Some examples did not pass when the call was actually run:
${failures.map(f => `- "${f.name}": call ${JSON.stringify(f.call)} → ${f.error ? `raised ${f.error}` : `returned ${f.actual}, but "expected" said ${f.expected}`}`).join('\n')}

Return the SAME JSON object again, with every example corrected: fix the call if it was wrong, set
"expected" to what the code really returns, and redo the frames so the trace matches the real run.
Keep the examples that already passed exactly as they were.`;

// ------------------------------------------------------------- running ---

const RUNNER = path.join(__dirname, 'realq-run.py');
const PYTHON = process.env.PYTHON_BIN || 'python3';

/** Runs the snippet on each example's call; never throws, a broken runner just reports ok:false. */
function runCalls(code, calls, pre = '') {
  return new Promise(resolve => {
    const job = JSON.stringify({ imports: `${realq().imports}\n\n${pre}`, code, calls });
    let out = '', err = '';
    let p;
    try {
      p = spawn(PYTHON, [RUNNER], { stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (e) {
      return resolve({ error: `runner unavailable: ${e.message}` });
    }
    const timer = setTimeout(() => { try { p.kill('SIGKILL'); } catch { /* gone */ } }, 15_000);
    p.stdout.on('data', c => { out += c; });
    p.stderr.on('data', c => { err += c; });
    p.on('error', e => { clearTimeout(timer); resolve({ error: `runner failed: ${e.message}` }); });
    p.on('close', () => {
      clearTimeout(timer);
      try { resolve(JSON.parse(out)); } catch { resolve({ error: `runner produced no result${err ? `: ${err.slice(0, 200)}` : ''}` }); }
    });
    p.stdin.on('error', () => { /* the process died first; close reports it */ });
    p.stdin.end(job);
  });
}

/**
 * Executes every example's call and stamps each with `verified` (the code
 * returned exactly what the trace promised) or `verifyError`. Returns the
 * examples that failed so the model can be asked to repair them.
 */
async function verify(code, examples, pre = '') {
  const res = await runCalls(code, examples.map(e => ({ call: e.call, expected: e.expected })), pre);
  if (res.error) {
    for (const e of examples) { e.verified = false; e.verifyError = res.error; }
    log.warn('realq: verify unavailable', { err: res.error });
    return [];
  }
  const failed = [];
  examples.forEach((e, i) => {
    const r = res.results[i] || { ok: false, error: 'no result' };
    e.actual = r.actual == null ? '' : String(r.actual).slice(0, 300);
    e.verified = Boolean(r.ok && r.match);
    e.verifyError = r.error ? String(r.error).slice(0, 200) : r.ok && !r.match ? `code returned ${e.actual}` : '';
    if (!e.verified) failed.push({ name: e.name, call: e.call, expected: e.expected, actual: e.actual, error: r.error });
  });
  return failed;
}

/** The model's examples with their `call` kept (normaliseWalkthrough drops unknown fields). */
function withCalls(raw, out) {
  const calls = (Array.isArray(raw?.examples) ? raw.examples : []).map(e => String(e?.call || '').slice(0, 600));
  // normalise can drop examples with < 2 frames, so match by name rather than position.
  const byName = new Map((Array.isArray(raw?.examples) ? raw.examples : []).map((e, i) => [String(e?.name || '').slice(0, 80), calls[i]]));
  for (const e of out.examples) e.call = byName.get(e.name) || '';
  return out.examples;
}

const countIssues = problems => Object.values(problems).reduce((s, l) => s + l.length, 0);

/**
 * One model call, then up to two repair rounds: first for examples whose
 * "expected" the real code contradicts, then for slides the structural lint
 * flags (nothing marked, missing queue, no final answer…). Each round is kept
 * only if it is strictly better. With no code (a question explainer) only the
 * lint round runs. A tutor review follows, and anything still failing is
 * redrawn once by the stronger model.
 */
async function traceOnce({ key, q, s, model, reviewModel, user, system }) {
  const code = s?.code || '';
  const pre = s ? preamble(q.id, s.idx) : '';
  const messages = [{ role: 'system', content: system }, { role: 'user', content: user }];
  let drawModel = model || ANIM_MODEL;
  const ask = async msgs => llm.chatJson({
    where: 'realq/anim', model: drawModel, temperature: 0.2, maxTokens: 16000, timeoutMs: 300_000, messages: msgs,
  });
  const parse = raw => {
    const out = normaliseWalkthrough({ ...raw, code, approach: 'optimal' }, { slug: `realq-${key}` });
    const examples = code ? withCalls(raw, out) : out.examples;
    return { raw, out, examples };
  };
  let cur = parse(await ask(messages));
  if (cur.raw?.error && !cur.raw.examples) throw new UpstreamError(String(cur.raw.error).slice(0, 200), 422);
  if (!cur.examples.length) throw new UpstreamError('the model did not produce a usable trace', 502);
  let failed = code ? await verify(code, cur.examples, pre) : [];

  const again = async (followUp, better, keepIO = false) => {
    const next = parse(await ask([...messages, { role: 'assistant', content: JSON.stringify(cur.raw) }, { role: 'user', content: followUp }]));
    if (!next.examples.length) return;
    // A slide rewrite must not quietly change what the example is about.
    if (keepIO) {
      for (const e of next.examples) {
        const was = cur.examples.find(x => x.name === e.name);
        if (was) { e.input = was.input; e.expected = was.expected; if (code) e.call = was.call; }
      }
    }
    const nextFailed = code ? await verify(code, next.examples, pre) : [];
    if (better(next, nextFailed)) { cur = next; failed = nextFailed; }
  };

  if (failed.length) {
    log.info('realq: repairing trace', { key, failed: failed.map(f => f.name) });
    await again(fixPrompt(failed), (_n, f2) => f2.length < failed.length);
  }
  const problems = lint({ kind: cur.out.kind, examples: cur.examples }, code);
  if (countIssues(problems)) {
    log.info('realq: repairing slides', { key, issues: countIssues(problems) });
    const before = countIssues(problems);
    await again(lintPrompt(problems), (n, f2) =>
      f2.length <= failed.length && countIssues(lint({ kind: n.out.kind, examples: n.examples }, code)) < before, true);
  }
  // A second model reads the slides as a tutor would and the first fixes what it finds;
  // kept only if it still verifies and the lint did not get worse. Reviewed once more
  // afterwards so the stored verdict describes what is actually stored.
  let reviewed = await review(q, s, { kind: cur.out.kind, examples: cur.examples }, reviewModel);
  if (reviewed?.verdict === 'fix') {
    log.info('realq: tutor review', { key, major: reviewed.major, defects: reviewed.defects.length });
    const lintBefore = countIssues(lint({ kind: cur.out.kind, examples: cur.examples }, code));
    await again(reviewFixPrompt(reviewed.defects.filter(d => d.severity === 'major')), (n, f2) =>
      f2.length <= failed.length && countIssues(lint({ kind: n.out.kind, examples: n.examples }, code)) <= lintBefore, true);
    reviewed = (await review(q, s, { kind: cur.out.kind, examples: cur.examples }, reviewModel)) || reviewed;
  }
  // Still not right after Sonnet's rounds: hand the whole thing to the stronger
  // model once, with the open defects spelled out, and keep its answer only if
  // it is better on every count.
  const stillBad = () => failed.length || reviewed?.verdict === 'fix';
  if (stillBad() && !model && drawModel !== STRONG_MODEL) {
    log.info('realq: escalating to stronger model', { key, failed: failed.length, defects: reviewed?.defects?.length || 0 });
    drawModel = STRONG_MODEL;
    const notes = [
      ...(failed.length ? [fixPrompt(failed)] : []),
      ...(reviewed?.major ? [reviewFixPrompt(reviewed.defects.filter(d => d.severity === 'major'))] : []),
    ].join('\n\n');
    const lintBefore = countIssues(lint({ kind: cur.out.kind, examples: cur.examples }, code));
    const majorBefore = reviewed?.major || 0;
    let candidate = null, candFailed = [];
    try {
      candidate = parse(await ask([...messages, { role: 'assistant', content: JSON.stringify(cur.raw) }, { role: 'user', content: notes }]));
      if (candidate.examples.length) {
        for (const e of candidate.examples) {
          const was = cur.examples.find(x => x.name === e.name);
          if (was && !failed.some(f => f.name === e.name)) { e.input = was.input; e.expected = was.expected; if (code) e.call = was.call; }
        }
        candFailed = code ? await verify(code, candidate.examples, pre) : [];
      } else candidate = null;
    } catch (err) {
      log.warn('realq: stronger model unavailable', { key, err: err.message });
    }
    if (candidate && candFailed.length <= failed.length
        && countIssues(lint({ kind: candidate.out.kind, examples: candidate.examples }, code)) <= lintBefore) {
      const r2 = await review(q, s, { kind: candidate.out.kind, examples: candidate.examples }, reviewModel);
      if (!r2 || r2.verdict === 'good' || (r2.major < majorBefore && candFailed.length <= failed.length)) {
        cur = candidate; failed = candFailed; reviewed = r2 || reviewed;
      }
    }
  }
  const issues = lint({ kind: cur.out.kind, examples: cur.examples }, code);
  for (const e of cur.examples) {
    e.issues = issues[e.name] || [];
    e.defects = (reviewed?.defects || []).filter(d => d.example === e.name)
      .map(d => `${d.severity === 'minor' ? 'minor · ' : ''}${d.slide ? `slide ${d.slide}: ` : ''}${d.problem}`);
  }
  return { kind: cur.out.kind, code: cur.out.code, examples: cur.examples, review: reviewed?.verdict || 'unreviewed', model: drawModel };
}

const strip = anim => ({ ...anim, input: anim.examples[0]?.input || '', frames: anim.examples[0]?.frames || [] });

/**
 * Frames for one snippet, written on first request and then served from
 * disk. Each example is executed on the real code before it is kept.
 */
export async function animate(qid, idx, { model, refresh = false } = {}) {
  const hit = snippet(qid, idx);
  if (!hit) throw new UpstreamError('unknown snippet', 404);
  const key = `${qid}.s${idx}`;
  if (!refresh) {
    const doc = await getDoc(key);
    if (doc?.schema === SCHEMA && doc.anim) return strip(doc.anim);
  }
  const { q, s } = hit;
  return once(key, async () => {
    const anim = await traceOnce({ key, q, s, model, system: ANIM_SYSTEM, user: animPrompt(q, s, realq().imports) });
    if (anim.examples.length < 2) throw new UpstreamError('the model did not produce a usable trace', 502);
    await setDoc(key, { schema: SCHEMA, generatedAt: new Date().toISOString(), anim });
    return strip(anim);
  });
}

export const question = qid => realq().questions.find(x => x.id === qid) || null;

/**
 * The question itself as slides — no code — so a reader understands what is
 * being asked before seeing any solution. Cached under `qN.q`.
 */
export async function explainQuestion(qid, { model, refresh = false } = {}) {
  const q = question(qid);
  if (!q) throw new UpstreamError('unknown question', 404);
  const key = `${qid}.q`;
  if (!refresh) {
    const doc = await getDoc(key);
    if (doc?.schema === SCHEMA && doc.anim) return strip(doc.anim);
  }
  return once(key, async () => {
    const anim = await traceOnce({ key, q, s: null, model, system: ANIM_SYSTEM, user: questionPrompt(q) });
    if (anim.examples.length < 2) throw new UpstreamError('the model did not produce a usable explanation', 502);
    anim.question = true;
    await setDoc(key, { schema: SCHEMA, generatedAt: new Date().toISOString(), anim });
    return strip(anim);
  });
}

const extraQuestionPrompt = (q, input, anim) => `${questionPrompt(q)}

OVERRIDE: use kind "${anim.kind}" — the same picture as the existing slides — and return ONE example
only, in the "examples" array, named after what this input shows (3-7 words), on EXACTLY this input
that the learner typed:
${input}

If the input is not a valid instance of the question, return {"error": "<one sentence why>"} instead.`;

/** Snippet index `idx`, or 'q' for the question explainer. */
const animKey = (qid, idx) => (idx === 'q' ? `${qid}.q` : `${qid}.s${idx}`);

/**
 * A learner's own input, traced and verified, appended to the cached
 * animation so it is there next time. Up to MAX_EXAMPLES per snippet.
 */
export async function addExample(qid, idx, input, { model } = {}) {
  const isQ = idx === 'q';
  const hit = isQ ? (question(qid) ? { q: question(qid), s: null } : null) : snippet(qid, idx);
  if (!hit) throw new UpstreamError('unknown snippet', 404);
  const key = animKey(qid, idx);
  const doc = await getDoc(key);
  if (!(doc?.schema === SCHEMA && doc.anim)) throw new UpstreamError('animate the snippet first', 409);
  if (doc.anim.examples.length >= MAX_EXAMPLES) throw new UpstreamError(`at most ${MAX_EXAMPLES} examples per solution`, 409);
  const { q, s } = hit;
  const user = isQ ? extraQuestionPrompt(q, input, doc.anim) : extraPrompt(q, s, realq().imports, input, doc.anim);
  const anim = await traceOnce({ key, q, s, model, system: ANIM_SYSTEM, user });
  const ex = anim.examples[0];
  if (!ex) throw new UpstreamError('the model could not trace that input', 502);
  ex.name = ex.name.startsWith('Yours') ? ex.name : `Yours: ${ex.name}`;
  ex.yours = true;
  const next = { ...doc.anim, examples: [...doc.anim.examples, ex] };
  await setDoc(key, { ...doc, anim: next });
  return { anim: strip(next), added: doc.anim.examples.length };
}

/** Drops one user-added example. */
export async function removeExample(qid, idx, k) {
  const key = animKey(qid, idx);
  const doc = await getDoc(key);
  if (!(doc?.schema === SCHEMA && doc.anim)) throw new UpstreamError('no animation', 404);
  const ex = doc.anim.examples[k];
  if (!ex?.yours) throw new UpstreamError('only your own examples can be removed', 409);
  const next = { ...doc.anim, examples: doc.anim.examples.filter((_, i) => i !== k) };
  await setDoc(key, { ...doc, anim: next });
  return strip(next);
}

/** Verification and slide-lint summary of everything cached, for the warmer and for checking the set. */
export async function report() {
  const out = [];
  for (const key of await animated()) {
    const doc = await getDoc(key);
    if (!doc?.anim) continue;
    const code = doc.anim.question ? '' : doc.anim.code || '';
    const issues = lint(doc.anim, code);
    out.push({
      key, kind: doc.anim.kind, schema: doc.schema, question: Boolean(doc.anim.question), review: doc.anim.review || 'unreviewed',
      model: doc.anim.model || '',
      examples: doc.anim.examples.map(e => ({
        name: e.name, frames: e.frames.length, verified: e.verified === true, err: e.verifyError || '',
        issues: issues[e.name] || [], defects: e.defects || [],
      })),
    });
  }
  return out;
}

/** Which snippets and question explainers already have frames, so the UI can show them as ready. */
export async function animated() {
  const keys = [];
  for (const k of await store.keys()) {
    if (!/^q\d+\.(s\d+|q)$/.test(k)) continue;
    const doc = await getDoc(k);
    if (doc?.schema === SCHEMA && doc.anim) keys.push(k);
  }
  return keys;
}
