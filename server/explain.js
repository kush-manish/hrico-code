/**
 * Interview-grade explanations for the Google question set, and the animated
 * walkthrough that goes with each one.
 *
 * Two artefacts per question, generated on demand and cached on disk so each
 * is written once and read forever:
 *   - the explanation: what to clarify, the brute force and why it fails, the
 *     optimal approach, the code, what to say out loud, the follow-ups; and
 *   - the walkthrough: a short trace of the optimal algorithm on a small
 *     input, as frames the browser animates (arrays, grids, linked lists,
 *     trees, graphs).
 *
 * Both are strict JSON from the model, run through a normaliser so the UI
 * never sees a shape it did not expect.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { UpstreamError } from './errors.js';
import { log } from './log.js';
import { llm, parseJson as parseJsonLoose } from './llm/client.js';
import { question, question as question_ } from './questions.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = process.env.EXPLAIN_CACHE_DIR || path.join(__dirname, '../.cache/explain');
const SCHEMA_VERSION = 1;        // explanations
const WALK_VERSION = 2;          // walkthroughs (v2: vars, notes, code line, ranges)

// ----------------------------------------------------------------- cache ---

function file(slug, kind) { return path.join(CACHE_DIR, `${slug}.${kind}.json`); }

function readCache(slug, kind) {
  try {
    const v = JSON.parse(fs.readFileSync(file(slug, kind), 'utf8'));
    if (v?.schema !== (kind.startsWith('walk2') ? WALK_VERSION : SCHEMA_VERSION)) return null;
    return kind.startsWith('walk2') ? withExamples(v) : v;
  } catch { return null; }
}

/** Walkthroughs written before examples existed carry one trace; present it as the general case. */
function withExamples(w) {
  if (Array.isArray(w.examples) && w.examples.length) return w;
  return { ...w, examples: [{ name: 'General case', input: w.input, frames: w.frames }] };
}
const edgeMarker = (slug, kind) => path.join(CACHE_DIR, `${slug}.${kind}.edge`);
function writeCache(slug, kind, value) {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    const tmp = `${file(slug, kind)}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(value));
    fs.renameSync(tmp, file(slug, kind));
  } catch (err) {
    log.error('explain cache write failed', { slug, kind, err: err.message });
  }
}

/** Cached artefacts only — never touches the model. */
export const APPROACHES = ['question', 'brute', 'optimal', 'best'];
const walkKind = approach => ({ question: 'walk2q', brute: 'walk2b', optimal: 'walk2', best: 'walk2i' })[approach] || 'walk2';
const KIND_TO_APPROACH = { walk2q: 'question', walk2: 'optimal', walk2b: 'brute', walk2i: 'best' };

export function cached(slug) {
  const walkthroughs = Object.fromEntries(APPROACHES.map(a => [a, readCache(slug, walkKind(a))]));
  return { explanation: readCache(slug, 'explain'), walkthrough: walkthroughs.optimal, walkthroughs };
}

/** Slugs that already have a cached explanation / walkthrough. */
export function cachedIndex() {
  const per = () => ({ question: [], optimal: [], brute: [], best: [] });
  const out = { explained: [], animated: [], brute: [], best: [], question: [], edge: per(), qa: per() };
  let names = [];
  try { names = fs.readdirSync(CACHE_DIR); } catch { return out; }
  for (const n of names) {
    const e = /^(.+)\.(walk2q|walk2|walk2b|walk2i)\.(edge|qa)$/.exec(n);
    if (e) { out[e[3]][KIND_TO_APPROACH[e[2]]].push(e[1]); continue; }
    const m = /^(.+)\.(explain|walk2q|walk2|walk2b|walk2i)\.json$/.exec(n);
    if (!m) continue;
    if (m[2] === 'explain') out.explained.push(m[1]);
    else if (m[2] === 'walk2') out.animated.push(m[1]);
    else out[KIND_TO_APPROACH[m[2]]].push(m[1]);
  }
  return out;
}

// ------------------------------------------------------------ the model ---

const htmlToText = html => String(html || '')
  .replace(/<sup>(.*?)<\/sup>/g, '^$1')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();

async function askJson({ system, user, model, maxTokens, where }) {
  return llm.chatJson({
    model, temperature: 0.2, maxTokens, timeoutMs: 120_000, where,
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
  });
}

/** Pull the first JSON object out of a reply that may be fenced or chatty. */
export function parseJson(text) {
  try { return parseJsonLoose(text); }
  catch { throw new UpstreamError('the model did not return valid JSON', 502); }
}

// ------------------------------------------------------------ explanation ---

const EXPLAIN_SYSTEM = `You are a senior Google engineer coaching a candidate for the London
onsite. For the problem given, write the explanation they need to SOLVE IT IN THE ROOM —
not a textbook entry. Plain British English, spoken register, contractions.

Return ONLY a JSON object with exactly these keys:
{
  "pattern": "the named technique, e.g. Sliding window (dynamic)",
  "oneLiner": "the whole idea in one sentence a candidate can say out loud",
  "clarify": ["3-5 clarifying questions to ask before coding, each with the answer you'd expect, as 'Q — A'"],
  "bruteForce": { "idea": "2-3 sentences", "code": "short, clean Python 3 brute force (under 25 lines, LeetCode signature)", "time": "O(...)", "space": "O(...)", "whyNot": "one sentence on why the interviewer will push past it" },
  "insight": "the single observation that unlocks the optimal solution, 2-4 sentences, concrete",
  "approach": ["6-10 numbered steps of the optimal algorithm, each one short and specific"],
  "dryRun": "walk the optimal algorithm through the sample input by hand in 4-8 short lines, showing state after each key step",
  "code": { "python": "complete, clean, interview-ready Python 3 with short comments, using the LeetCode signature" },
  "complexity": { "time": "O(...)", "space": "O(...)", "why": "2 sentences justifying both" },
  "sayOutLoud": ["5-7 sentences the candidate should actually say while solving, in order — narrating intent, trade-offs, and the check before coding"],
  "edgeCases": ["4-6 edge cases and what the code does with each"],
  "followUps": ["3-4 follow-ups a Google interviewer asks after this one, each with a one-line answer, as 'Q — A'"],
  "mistakes": ["3-5 mistakes candidates make on this exact problem"]
}
No markdown fences around the JSON. Strings only — no nested markdown headings.`;

export function normaliseExplain(raw, q) {
  const s = v => String(v ?? '').trim();
  const arr = (v, n) => (Array.isArray(v) ? v : []).map(s).filter(Boolean).slice(0, n);
  const r = raw && typeof raw === 'object' ? raw : {};
  const code = r.code && typeof r.code === 'object' ? r.code : {};
  return {
    schema: SCHEMA_VERSION,
    slug: q.slug, title: q.title, difficulty: q.difficulty, topics: q.topicTags || [],
    generatedAt: new Date().toISOString(),
    pattern: s(r.pattern) || 'General',
    oneLiner: s(r.oneLiner),
    clarify: arr(r.clarify, 6),
    bruteForce: {
      idea: s(r.bruteForce?.idea), code: s(r.bruteForce?.code).slice(0, 3000),
      time: s(r.bruteForce?.time), space: s(r.bruteForce?.space),
      whyNot: s(r.bruteForce?.whyNot),
    },
    insight: s(r.insight),
    approach: arr(r.approach, 12),
    dryRun: s(r.dryRun),
    code: {
      python: s(code.python),
      language2: s(code.language2).toLowerCase() || 'java',
      code2: s(code.code2),
    },
    complexity: { time: s(r.complexity?.time), space: s(r.complexity?.space), why: s(r.complexity?.why) },
    sayOutLoud: arr(r.sayOutLoud, 8),
    edgeCases: arr(r.edgeCases, 8),
    followUps: arr(r.followUps, 6),
    mistakes: arr(r.mistakes, 6),
  };
}

export async function explain({ slug, model, force = false }) {
  const q = question(slug);
  if (!q) throw new UpstreamError('unknown question', 404);
  if (!force) {
    const hit = readCache(slug, 'explain');
    if (hit) return { ...hit, cached: true };
  }
  const user = `PROBLEM: ${q.title} (${q.difficulty}; topics: ${(q.topicTags || []).join(', ') || 'n/a'})

${htmlToText(q.content).slice(0, 6000)}

SAMPLE INPUT: ${q.sampleTestCase || 'n/a'}
HINTS FROM THE SETTER: ${(q.hints || []).map(htmlToText).join(' | ').slice(0, 1200) || 'none'}`;
  const raw = await askJson({ system: EXPLAIN_SYSTEM, user, model, maxTokens: 3800, where: 'explain' });
  const out = normaliseExplain(raw, q);
  if (!out.approach.length || !out.code.python) throw new UpstreamError('the model returned an incomplete explanation', 502);
  writeCache(slug, 'explain', out);
  return { ...out, cached: false };
}

// ------------------------------------------------------------ walkthrough ---

const WALK_SYSTEM = `You produce a DETAILED step-by-step TRACE of the optimal algorithm for a coding problem
on a small input, as frames that a browser will animate next to the code. This is teaching
material: a candidate should be able to follow every decision the algorithm makes.

Pick the ONE visual kind that fits:
- "array": values with named pointers, highlighted indices, bracketed ranges and labels. Arrays, strings, two pointers, sliding window, prefix sums, 1-D DP, binary search (bracket the search range), intervals (one cell per interval, e.g. "[1,3]"), bit manipulation (cells are bits), hash maps and counters (use "aux" rows named after the map, e.g. "seen"), heaps as a sorted "aux" row, and 2-D DP tables go in "grid" instead.
- "grid": a 2-D matrix with highlighted cells. Matrix, 2-D DP, grid BFS/DFS.
- "list": a singly linked list, with named pointers (slow/fast/prev/cur) and "next" links that may form a cycle. Linked-list problems.
- "tree": nodes with parent links — a binary tree (use "side" L/R), AND ALSO: a union-find / disjoint-set forest (each node's "parent" is its parent pointer, roots have parent null, put rank or size in "labels"; a union re-parents a root and a find-with-path-compression re-parents nodes — show both as mutations), a trie (label = the character, mark word ends in "labels"), a heap (the array's tree view; also give the array in "labels" if useful), an n-ary tree.
- "graph": nodes and edges, with "activeEdges" for the edge being relaxed/traversed and "labels" for distances, in-degrees, colours or component ids. BFS, DFS, Dijkstra, topological sort, bipartite check, MST. Set "directed": true on frames of a directed graph. For union-find prefer the "tree" forest view.
- "stack": an input row of cells with pointers PLUS a vertical stack (bottom to top) and/or a queue/deque (front to back). Stack, monotonic stack, queue, monotonic deque, BFS queue on an array, min-stack, evaluate-RPN, valid parentheses. Show every push and pop as its own frame.

Return ONLY a JSON object:
{
  "kind": "array" | "grid" | "list" | "tree" | "graph" | "stack",
  "problem": {
    "restated": "the problem in plain words, 2-3 sentences, as you would explain it to a friend — no jargon, concrete",
    "input": "what you are given, described generically in one line — the TYPES and meaning (e.g. 'an array of integers and a target integer'), never the example's values",
    "output": "what you must return, described generically in one line (e.g. 'the two indices whose values add to the target'), never the example's values",
    "watch": "the one constraint or trap that decides the approach, in one sentence"
  },
  "examples": [
    { "name": "General case", "input": "the small input, as text", "expected": "the correct output for it", "why": "one sentence: what this example exercises", "frames": [ ...14 to 30 frames... ] },
    { "name": "Edge case: <what makes it tricky, 3-6 words>", "input": "...", "expected": "...", "why": "...", "frames": [ ...5 to 14 frames... ] }
  ]
}
EXACTLY TWO examples: the general case, and the single most important edge case — the
smallest legal input, an input with no answer, all-equal values, the wrap-around, the
duplicate that must be skipped, the empty tree, the disconnected graph — whichever this
problem actually has. Frames use the same schema in both, the same "kind", and the same
CODE (line numbers refer to it in both).

EVERY frame has:
- "caption": one sentence, present tense — WHAT happens in this step.
- "note": one or two sentences — WHY, and what it tells us (the invariant, the comparison result, what got ruled out). This is the teaching line; never leave it empty.
- "vars": an object of the live variables after this step, up to 6, short names, e.g. {"left": 0, "right": 4, "mid": 2, "sum": 12, "best": 3}. Keep the same keys throughout.
- "line": the 1-based line number in the CODE below that this step executes. Point at the real line (the comparison, the assignment, the return), not the def.
- ON ANY KIND, whenever the algorithm keeps one: "queue": [entries front to back] (BFS frontier — show it in EVERY frame, e.g. ["(0,1)", "(1,0)"]), "stack": [entries bottom to top] (DFS, recursion, monotonic stack, call stack), "queueHl"/"stackHl": [indices being popped or pushed]. A BFS or DFS trace without its queue or stack is wrong.

Then by kind:
- array:  "cells": [values], "pointers": {"i": index, ...} (0-3 pointers), "highlight": [indices being examined now], "done": [indices finalised], "bad": [indices ruled out], "ranges": [{"from": i, "to": j, "label": "window"}] (0-2 brackets, e.g. the current window or the binary-search range), "labels": {"index": "short text under that cell"}, "aux": {"name": [values]} (0-2 extra rows, e.g. a dp table, prefix sums, or the stack contents — keep the row the same length each frame unless it is a stack)
- grid:   "grid": [[values]], "highlight": [[r,c]], "done": [[r,c]], "bad": [[r,c]]
- list:   "nodes": [{"id": "a", "label": "1"}], "next": {"a": "b"}, "pointers": {"slow": "a"}, "highlight": ["a"], "done": ["b"]
- tree:   "nodes": [{"id": "1", "label": "5", "parent": null, "side": "L"|"R"}], "highlight": [ids], "done": [ids], "bad": [ids], "labels": {"id": "text under node"} — for forests/tries/n-ary trees omit "side" and list children in order; parents may change between frames (union, path compression, rotation)
- graph:  "nodes": [{"id": "A", "label": "A"}], "edges": [["A","B"], ["A","C", 5]], "directed": true|false, "highlight": [ids], "done": [ids], "bad": [ids], "activeEdges": [["A","B"]], "labels": {"id": "text under node, e.g. dist=3"}
- stack:  "cells": [input values], "pointers": {"i": index}, "highlight": [indices], "done": [indices], "stack": [values bottom to top], "stackHl": [stack indices being compared/popped], "queue": [values front to back], "queueHl": [queue indices], "labels": {"index": "text under an input cell"}

Granularity: one frame per decision — each comparison, each pointer move, each update to the answer, each push/pop, each recursion entry/return. Show the failed comparisons too, not just the successful ones. Frame 1 sets up the initial state; the last frame states the final answer in its caption.

Keep the input tiny (5-8 elements, 3x3 or 3x4 grids, 5-7 nodes) but chosen so the interesting cases occur (a duplicate, a wrap-around, a dead end). Keep node ids and cell values stable across frames unless the algorithm mutates them — then show the mutation. No markdown, no fences.`;

const APPROACH_BRIEF = {
  question: `EXPLAIN THE QUESTION ITSELF — NOT any algorithm. This trace is for someone reading the problem
for the first time. Using the example's input, walk them through what is being asked:
frame 1 shows the input exactly as given and the caption restates the problem in plain words;
the next frames show what the key terms MEAN on this input (mark the cells or nodes the
definition refers to, one idea per frame — e.g. "this cell is a zero, so its answer is 0",
"this cell's nearest zero is here, two steps away"); then build the EXPECTED OUTPUT up
piece by piece (use "aux", "labels" or "done" to show the answer forming); then one frame
per constraint or trap that matters (why the obvious reading is wrong, what "unique" or
"contiguous" or "in place" rules out); the last frame shows the complete expected output in
its caption. "note" carries the teaching sentence; "vars" may hold the ask (e.g. target, k).
No code: set "line" to null in every frame. 8-16 frames for the general case, 5-10 for the edge case.`,
  optimal: `TRACE THE OPTIMAL APPROACH given below. The frames' "line" numbers refer to the CODE given.`,
  brute: `TRACE THE BRUTE-FORCE APPROACH described below — NOT the optimal one. Make the wasted work
visible: show the repeated scans, the comparisons that are redone, the candidates that are
re-examined. Mark cells being re-checked as "highlight" and cells already ruled out as "bad".
Also return "code": a short, clean Python brute force (under 25 lines, LeetCode signature) —
the frames' "line" numbers refer to THAT code, not to any other. The last frame's caption states
the answer, the time complexity, and in one clause why an interviewer will push past it.`,
  best: `TRACE THE OPTIMAL APPROACH exactly as a strong candidate would DELIVER it in the interview.
Same algorithm and CODE as given, but every frame ALSO has "say": one sentence the candidate says
out loud at that moment — clarifying the input on frame 1, stating the invariant before the loop,
narrating each decision ("both are smaller than the target, so only a larger left can help"),
calling out the edge case when it appears, and giving the complexity in the last frame. Spoken
register, first person, British English, under 30 words each.`,
};

const KINDS = new Set(['array', 'grid', 'list', 'tree', 'graph', 'stack']);

/** A frame with nothing to draw renders as a blank gap, so it is not a frame. */
function hasPicture(f, kind) {
  if (kind === 'array') return f.cells.length > 0;
  if (kind === 'stack') return f.cells.length > 0 || f.stack.length > 0 || f.queue.length > 0;
  if (kind === 'grid') return f.grid.length > 0 && f.grid.some(r => r.length > 0);
  return f.nodes.length > 0;
}

export function normaliseWalkthrough(raw, q) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const kind = KINDS.has(r.kind) ? r.kind : 'array';
  // Frames point into the stored (truncated) code; a line past its end
  // would highlight nothing.
  const code = String(r.code || '').slice(0, 4000);
  const lastLine = code.split('\n').length;
  const str = v => String(v ?? '').slice(0, 80);
  const ids = v => (Array.isArray(v) ? v : []).map(str).slice(0, 64);
  const vals = v => (Array.isArray(v) ? v : []).slice(0, 24).map(str);
  const pairs = v => (Array.isArray(v) ? v : []).filter(p => Array.isArray(p) && p.length >= 2)
    .map(p => [Number(p[0]) || 0, Number(p[1]) || 0]).slice(0, 64);
  const numMap = v => Object.fromEntries(Object.entries(v && typeof v === 'object' ? v : {})
    .slice(0, 4).map(([k, n]) => [str(k).slice(0, 8), Number(n)]).filter(([, n]) => Number.isFinite(n)));
  const strMap = v => Object.fromEntries(Object.entries(v && typeof v === 'object' ? v : {})
    .slice(0, 64).map(([k, s]) => [str(k), str(s)]));

  const nums = v => ids(v).map(Number).filter(Number.isFinite);
  const normFrames = list => (Array.isArray(list) ? list : []).slice(0, 40).map(f => {
    f = f && typeof f === 'object' ? f : {};
    const out = {
      caption: String(f.caption || '').slice(0, 300),
      note: String(f.note || '').slice(0, 500),
      vars: Object.fromEntries(Object.entries(f.vars && typeof f.vars === 'object' ? f.vars : {})
        .slice(0, 6).map(([k, v]) => [str(k).slice(0, 12), str(typeof v === 'object' ? JSON.stringify(v) : v).slice(0, 40)])),
      line: Number.isFinite(Number(f.line)) && Number(f.line) > 0 && Number(f.line) <= lastLine ? Math.floor(Number(f.line)) : null,
      say: String(f.say || '').slice(0, 300),
    };
    if (kind === 'array' || kind === 'stack') {
      out.cells = vals(f.cells); out.pointers = numMap(f.pointers);
      out.highlight = nums(f.highlight); out.done = nums(f.done); out.bad = nums(f.bad);
      out.ranges = (Array.isArray(f.ranges) ? f.ranges : []).slice(0, 2)
        .filter(g => g && Number.isFinite(Number(g.from)) && Number.isFinite(Number(g.to)))
        .map(g => ({ from: Number(g.from), to: Number(g.to), label: str(g.label).slice(0, 20) }));
      out.labels = strMap(f.labels);
      out.aux = Object.fromEntries(Object.entries(f.aux && typeof f.aux === 'object' ? f.aux : {})
        .slice(0, 2).map(([k, v]) => [str(k).slice(0, 12), vals(v)]));
    } else if (kind === 'grid') {
      out.grid = (Array.isArray(f.grid) ? f.grid : []).slice(0, 8).map(vals);
      out.highlight = pairs(f.highlight); out.done = pairs(f.done); out.bad = pairs(f.bad);
    } else if (kind === 'list') {
      out.nodes = (Array.isArray(f.nodes) ? f.nodes : []).slice(0, 12).map(n => ({ id: str(n?.id), label: str(n?.label) }));
      out.next = strMap(f.next); out.pointers = strMap(f.pointers); out.highlight = ids(f.highlight); out.done = ids(f.done);
    } else if (kind === 'tree') {
      out.nodes = (Array.isArray(f.nodes) ? f.nodes : []).slice(0, 15).map(n => ({
        id: str(n?.id), label: str(n?.label), parent: n?.parent == null ? null : str(n.parent),
        side: n?.side === 'R' ? 'R' : n?.side === 'L' ? 'L' : null,   // null: n-ary / forest / trie
      }));
      // A parent outside this frame draws nothing and leaves the tree rootless;
      // treating the node as a root is what the model meant.
      const present = new Set(out.nodes.map(n => n.id));
      for (const n of out.nodes) if (n.parent != null && !present.has(n.parent)) n.parent = null;
      out.highlight = ids(f.highlight); out.done = ids(f.done); out.bad = ids(f.bad); out.labels = strMap(f.labels);
    } else {
      out.nodes = (Array.isArray(f.nodes) ? f.nodes : []).slice(0, 12).map(n => ({ id: str(n?.id), label: str(n?.label) }));
      out.edges = (Array.isArray(f.edges) ? f.edges : []).filter(e => Array.isArray(e) && e.length >= 2)
        .slice(0, 40).map(e => [str(e[0]), str(e[1]), e[2] == null ? null : str(e[2])]);
      out.highlight = ids(f.highlight); out.done = ids(f.done); out.bad = ids(f.bad); out.labels = strMap(f.labels);
      out.directed = Boolean(f.directed);
      out.activeEdges = (Array.isArray(f.activeEdges) ? f.activeEdges : []).filter(e => Array.isArray(e) && e.length >= 2)
        .slice(0, 40).map(e => [str(e[0]), str(e[1])]);
    }
    // BFS queues, DFS/recursion stacks and the like ride along with any picture.
    if (Array.isArray(f.stack) && f.stack.length) { out.stack = vals(f.stack); out.stackHl = nums(f.stackHl); }
    if (Array.isArray(f.queue) && f.queue.length) { out.queue = vals(f.queue); out.queueHl = nums(f.queueHl); }
    if (kind === 'stack') { out.stack ||= []; out.queue ||= []; out.stackHl ||= []; out.queueHl ||= []; }
    // Models routinely index one past the end. Such entries draw nothing, or
    // worse highlight the wrong thing, so drop them rather than store them.
    const within = (v, n) => Number.isInteger(v) && v >= 0 && v < n;
    if (out.stack) out.stackHl = (out.stackHl || []).filter(v => within(v, out.stack.length));
    if (out.queue) out.queueHl = (out.queueHl || []).filter(v => within(v, out.queue.length));
    if (out.cells) {
      const n = out.cells.length;
      for (const g of ['highlight', 'done', 'bad']) out[g] = (out[g] || []).filter(v => within(v, n));
      out.pointers = Object.fromEntries(Object.entries(out.pointers).filter(([, v]) => within(v, n)));
      out.ranges = (out.ranges || []).filter(r => within(r.from, n) && within(r.to, n) && r.from <= r.to);
      out.labels = Object.fromEntries(Object.entries(out.labels).filter(([k]) => within(Number(k), n)));
    }
    return out;
  }).filter(f => f.caption && hasPicture(f, kind));

  const rawExamples = Array.isArray(r.examples) && r.examples.length
    ? r.examples
    : [{ name: 'General case', input: r.input, frames: r.frames }];
  const examples = rawExamples.slice(0, 5).map((e, i) => ({
    name: String(e?.name || (i === 0 ? 'General case' : `Edge case ${i}`)).slice(0, 80),
    input: String(e?.input || '').slice(0, 300),
    expected: String(e?.expected || '').slice(0, 300),
    why: String(e?.why || '').slice(0, 240),
    frames: normFrames(e?.frames),
  })).filter(e => e.frames.length >= 2);
  const pr = r.problem && typeof r.problem === 'object' ? r.problem : {};
  const problem = {
    restated: String(pr.restated || '').slice(0, 600),
    input: String(pr.input || '').slice(0, 200),
    output: String(pr.output || '').slice(0, 200),
    watch: String(pr.watch || '').slice(0, 300),
  };

  return {
    schema: WALK_VERSION, slug: q.slug, kind,
    approach: APPROACHES.includes(r.approach) ? r.approach : 'optimal',
    code,                                           // the code the frames' line numbers refer to
    generatedAt: new Date().toISOString(),
    problem: problem.restated ? problem : null,
    examples,
    // The first example also sits at the top level for anything older.
    input: examples[0]?.input || '', frames: examples[0]?.frames || [],
  };
}

/** Only the edge-case examples, for a walkthrough that has just the general case. */
export function normaliseExtraExamples(raw, base) {
  const merged = normaliseWalkthrough({ ...raw, kind: base.kind, code: base.code, approach: base.approach }, { slug: base.slug });
  return merged.examples.filter(e => e.frames.length >= 2).slice(0, 3);
}

export async function walkthrough({ slug, model, force = false, approach = 'optimal' }) {
  const q = question(slug);
  if (!q) throw new UpstreamError('unknown question', 404);
  if (!APPROACHES.includes(approach)) approach = 'optimal';
  const kind = walkKind(approach);
  if (!force) {
    const hit = readCache(slug, kind);
    if (hit) return { ...hit, cached: true };
  }
  // The explanation's Python is the code the frames point into; write it
  // first if it is not there yet so the line numbers mean something.
  const ex = readCache(slug, 'explain') || await explain({ slug, model });
  const code = ex.code.python;
  const numbered = code.split('\n').map((l, i) => `${String(i + 1).padStart(3)}  ${l}`).join('\n');
  const bruteText = `BRUTE-FORCE APPROACH: ${ex.bruteForce.idea} (${ex.bruteForce.time} time, ${ex.bruteForce.space} space). ${ex.bruteForce.whyNot}`;
  const user = `PROBLEM: ${q.title} (${q.difficulty})

${htmlToText(q.content).slice(0, 4000)}

${APPROACH_BRIEF[approach]}

${approach === 'question' ? `THE INSIGHT (for the trap frames only; do not trace the algorithm): ${ex.insight}\nCLARIFICATIONS: ${ex.clarify.join(' | ')}` : approach === 'brute' ? bruteText : `OPTIMAL APPROACH TO TRACE:
${ex.approach.map((s, i) => `${i + 1}. ${s}`).join('\n')}

CODE (frames' "line" numbers refer to these):
${numbered}`}`;
  const raw = await askJson({ system: WALK_SYSTEM, user, model, maxTokens: 12000, where: `walkthrough:${approach}` });
  const out = normaliseWalkthrough({ ...raw, code: approach === 'brute' ? String(raw.code || '') : approach === 'question' ? '' : code, approach }, q);
  if (out.frames.length < 3) throw new UpstreamError('the model returned too few frames to animate', 502);
  writeCache(slug, kind, out);
  markEdge(slug, kind, out);
  return { ...out, cached: false };
}

function markEdge(slug, kind, w) {
  try {
    if ((w.examples || []).length >= 2) fs.writeFileSync(edgeMarker(slug, kind), '');
    if (w.problem) fs.writeFileSync(path.join(CACHE_DIR, `${slug}.${kind}.qa`), '');
  } catch { /* the index just will not know */ }
}

/** Question panel + expected outputs for a trace that already has both examples. */
const DESCRIBE_SYSTEM = `You are given a coding problem and the inputs of two worked examples. Return ONLY:
{
  "problem": { "restated": "the problem in plain words, 2-3 sentences, as to a friend", "input": "what is given, described generically (types and meaning, never example values)", "output": "what to return, described generically", "watch": "the one constraint or trap that decides the approach, one sentence" },
  "examples": [ { "expected": "the correct output for example 1's input", "why": "one sentence: what that example exercises" }, { "expected": "...for example 2", "why": "..." } ]
}
Same order as the examples given. No markdown fences.`;

async function describe({ q, base, model }) {
  const user = `PROBLEM: ${q.title} (${q.difficulty})\n\n${htmlToText(q.content).slice(0, 3000)}\n\nEXAMPLES:\n${base.examples.map((e, i) => `${i + 1}. ${e.name}: ${e.input}`).join('\n')}`;
  const raw = await askJson({ system: DESCRIBE_SYSTEM, user, model, maxTokens: 1200, where: 'describe' });
  const merged = normaliseWalkthrough({ ...raw, kind: base.kind, code: base.code, approach: base.approach, examples: [] }, { slug: base.slug });
  const desc = Array.isArray(raw.examples) ? raw.examples : [];
  return {
    ...base,
    problem: merged.problem,
    examples: base.examples.map((e, i) => ({
      ...e,
      expected: e.expected || String(desc[i]?.expected || '').slice(0, 300),
      why: e.why || String(desc[i]?.why || '').slice(0, 240),
    })),
    generatedAt: new Date().toISOString(),
  };
}

const EDGE_SYSTEM = `You add an EDGE-CASE example to an existing animated trace of an algorithm. You are given the
problem, the code, the visual kind, and the general-case input that is already covered. Return
ONLY a JSON object:
{
  "problem": { "restated": "the problem in plain words, 2-3 sentences, as to a friend", "input": "what is given, described generically (types and meaning, never example values)", "output": "what to return, described generically", "watch": "the one constraint or trap that decides the approach" },
  "general": { "expected": "the correct output for the general-case input given", "why": "one sentence: what that example exercises" },
  "examples": [ { "name": "Edge case: <what makes it tricky, 3-6 words>", "input": "...", "expected": "...", "why": "...", "frames": [ ...5 to 14 frames... ] } ]
}
EXACTLY ONE edge example — the single most important one.
Pick the traps this problem actually has: the smallest legal input, no answer, all-equal values,
wrap-around, a duplicate to skip, an empty tree, a disconnected graph. Do NOT repeat the general
case. Frames follow exactly the schema below; "line" numbers refer to the CODE given.

` + WALK_SYSTEM.slice(WALK_SYSTEM.indexOf('EVERY frame has:'));

/** Append edge-case examples to a cached walkthrough that only has the general case. */
export async function addEdgeCases({ slug, model, approach = 'optimal' }) {
  const q = question(slug);
  if (!q) throw new UpstreamError('unknown question', 404);
  if (!APPROACHES.includes(approach)) approach = 'optimal';
  const kind = walkKind(approach);
  const base = readCache(slug, kind);
  if (!base) throw new UpstreamError('generate the walkthrough first', 409);
  if (base.examples.length >= 2) {
    if (base.problem) return { ...base, cached: true };
    const out = await describe({ q, base, model });      // both examples exist; only the panel is missing
    writeCache(slug, kind, out);
    markEdge(slug, kind, out);
    return { ...out, cached: false };
  }
  const numbered = base.code.split('\n').map((l, i) => `${String(i + 1).padStart(3)}  ${l}`).join('\n');
  const user = `PROBLEM: ${q.title} (${q.difficulty})

${htmlToText(q.content).slice(0, 3000)}

VISUAL KIND: ${base.kind}
GENERAL CASE ALREADY COVERED: ${base.examples[0].input}
${approach === 'brute' ? 'This trace is of the BRUTE-FORCE approach — trace that, not the optimal one.' : ''}
${approach === 'question' ? 'This trace EXPLAINS THE QUESTION ITSELF on the example (what is asked, what the terms mean, how the expected output forms, the trap) — no algorithm, "line" is null.' : ''}
${approach === 'best' ? 'This is the interview-delivery trace: every frame also has "say", one spoken sentence.' : ''}

CODE (frames' "line" numbers refer to these):
${numbered}`;
  const raw = await askJson({ system: EDGE_SYSTEM, user, model, maxTokens: 6000, where: `edge:${approach}` });
  const extra = normaliseExtraExamples(raw, base).filter(e => !/general/i.test(e.name)).slice(0, 1);
  if (!extra.length) throw new UpstreamError('the model returned no usable edge case', 502);
  const merged = normaliseWalkthrough({ ...raw, kind: base.kind, code: base.code, approach: base.approach, examples: [] }, { slug: base.slug });
  const general = { ...base.examples[0],
    expected: base.examples[0].expected || String(raw.general?.expected || '').slice(0, 300),
    why: base.examples[0].why || String(raw.general?.why || '').slice(0, 240) };
  const out = { ...base, problem: base.problem || merged.problem, examples: [general, ...base.examples.slice(1), ...extra], generatedAt: new Date().toISOString() };
  writeCache(slug, kind, out);
  markEdge(slug, kind, out);
  return { ...out, cached: false };
}


// -------------------------------------------------------------- ask a step ---
// A tutor that knows exactly which frame the learner is looking at.

const ASK_SYSTEM = `You are a patient senior engineer sitting next to someone stepping through an animated
walkthrough of a coding-interview problem. They are on ONE specific step and have a question
about it. Answer that question, for that step, concretely — refer to the actual values on
screen (the cells, pointers, queue, variables named below). Plain British English, spoken
register, contractions. Under 150 words unless they ask for more. Complexity in plain text
(O(n log n)). No markdown headings; short paragraphs or a short list are fine. If the question
is really about a different step or the whole approach, say so in a clause and answer anyway.`;

export async function askStep({ slug, approach = 'optimal', example = 0, frame = 0, question, messages = [], model }) {
  const q = question_(slug);
  if (!q) throw new UpstreamError('unknown question', 404);
  const w = readCache(slug, walkKind(APPROACHES.includes(approach) ? approach : 'optimal'));
  if (!w) throw new UpstreamError('no walkthrough to ask about yet', 409);
  const ex = w.examples[Math.max(0, Math.min(w.examples.length - 1, example))];
  const i = Math.max(0, Math.min(ex.frames.length - 1, frame));
  const f = ex.frames[i];
  const before = ex.frames.slice(Math.max(0, i - 2), i).map((x, k) => `  step ${i - 1 + k}: ${x.caption}`).join('\n');
  const codeLine = f.line && w.code ? w.code.split('\n')[f.line - 1] : '';
  const APPROACH_NAME = { question: 'understanding the question itself', brute: 'the brute-force approach', optimal: 'the optimal approach', best: 'the optimal approach as delivered in the interview' };
  const context = `PROBLEM: ${q.title} (${q.difficulty})
${htmlToText(q.content).slice(0, 1500)}

WALKTHROUGH: ${APPROACH_NAME[w.approach] || w.approach}; example "${ex.name}" — input ${ex.input}${ex.expected ? `; expected ${ex.expected}` : ''}.
${before ? `PREVIOUS STEPS:\n${before}\n` : ''}THE STEP THEY ARE ON (step ${i + 1} of ${ex.frames.length}): ${f.caption}
Why: ${f.note || '—'}
${f.say ? `What the candidate says here: "${f.say}"\n` : ''}Variables now: ${Object.entries(f.vars || {}).map(([k, v]) => `${k}=${v}`).join(', ') || '—'}
${f.queue?.length ? `Queue (front→back): ${f.queue.join(', ')}\n` : ''}${f.stack?.length ? `Stack (bottom→top): ${f.stack.join(', ')}\n` : ''}${f.cells ? `Cells: [${f.cells.join(', ')}]${f.pointers && Object.keys(f.pointers).length ? `; pointers ${Object.entries(f.pointers).map(([k, v]) => `${k}=${v}`).join(', ')}` : ''}\n` : ''}${codeLine ? `Code line ${f.line}: ${codeLine.trim()}\n` : ''}${w.code ? `\nFULL CODE:\n${w.code.slice(0, 3000)}` : ''}`;

  const history = messages.slice(-8).map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '').slice(0, 2000) }));
  const reply = await llm.chat({
    model, temperature: 0.4, maxTokens: 600, where: 'ask-step',
    messages: [{ role: 'system', content: ASK_SYSTEM }, { role: 'system', content: context }, ...history, { role: 'user', content: String(question).slice(0, 1500) }],
  });
  return { reply: reply || '(no response)', step: i + 1, of: ex.frames.length };
}
