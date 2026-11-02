/**
 * The Simple view of a handbook page: the same topic cut down to what you can
 * hold in your head before a Google L4 loop — the gist, a recipe, an animated
 * trace, a few drill questions with answers, and where to go next.
 *
 * Built from the Full page rather than from scratch, so the two never disagree
 * and the expensive authoring model runs once per topic, not twice. Cached on
 * disk beside the full pages.
 */
import path from 'path';
import { fileURLToPath } from 'url';
import { FileStore } from './cache/fileStore.js';
import { llm } from './llm/client.js';
import { UpstreamError } from './errors.js';
import { resolveTitles } from './questions.js';
import { article, articleMeta, outline } from './prolearn.js';
import { normaliseWalkthrough } from './explain.js';
import { idiomsIn } from './toolkit.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const store = new FileStore(process.env.PROLEARN_SIMPLE_CACHE_DIR
  || path.join(__dirname, '../.cache/prolearn-simple'));
const SCHEMA = 1;

const DIGEST_MODEL = process.env.PROLEARN_SIMPLE_MODEL || 'gemini-3.7-flash-medium';
const ANIM_MODEL = process.env.PROLEARN_ANIM_MODEL || 'gemini-3.7-flash-medium';

// ------------------------------------------------------------------ digest ---

const DIGEST_SYSTEM = `You compress a long DSA handbook page into the short version a candidate
revises from the night before a Google L4 interview. Keep only what changes whether they solve the
problem: the mechanism, the trigger, the recipe, the traps. Cut all prose that merely restates.
Plain direct English, second person, no filler, no markdown, no motivational lines.
Return STRICT JSON only, exactly this shape:
{
  "gist": "2-3 sentences: what this technique actually does and why it is faster than the obvious way",
  "when": "one sentence: the signal in a problem statement that means use this",
  "steps": ["4-6 imperative steps that produce the solution, each under 20 words"],
  "keys": [ { "term": "the name of an idea, invariant or variable", "what": "one sentence explaining it" } ],
  "drills": [ { "ask": "a question an interviewer would actually ask about this technique",
                "answer": "the full correct answer in 2-4 sentences",
                "hint": "one nudge that would unstick someone, under 15 words" } ],
  "traps": ["3-5 mistakes, each one sentence, each concrete"],
  "complexity": { "time": "...", "space": "...", "why": "one sentence" }
}
"keys" has 3-5 entries. "drills" has 4-6 entries, ordered easiest first, and must include at
least one complexity question and one "what changes if..." variant question.`;

const digestPrompt = full => `Compress this handbook page on "${full.title}".

SUMMARY: ${full.summary}
CUE: ${full.cue}

${full.sections.map(s => `## ${s.heading}\n${s.body}`).join('\n\n')}

CODE (${full.code.lang}):
${full.code.source}

COMPLEXITY: ${full.complexity.time} time, ${full.complexity.space} space. ${full.complexity.why}

TRAPS:
${full.traps.map(t => `- ${t}`).join('\n')}

VARIANTS:
${full.variants.map(v => `- ${v.name}: ${v.change}`).join('\n')}`;

// --------------------------------------------------------------- animation ---

export const ANIM_SYSTEM = `You produce an ANIMATED TRACE of an algorithm on a tiny input, as frames a
browser draws next to the code. This is teaching material: a candidate should follow every decision.

Pick the ONE visual kind that fits the algorithm:
- "array": values with named pointers, highlighted indices, bracketed ranges. Arrays, strings, two
  pointers, sliding window, prefix sums, 1-D DP, binary search (bracket the search range), intervals
  (one cell per interval), bits, hash maps and counters (use "aux" rows named after the map).
- "grid": a 2-D matrix with highlighted cells. Matrix, 2-D DP, grid BFS/DFS.
- "list": a singly linked list with named pointers (slow/fast/prev/cur) and "next" links.
- "tree": nodes with parent links — binary tree (use "side" L/R), union-find forest, trie, heap, n-ary.
- "graph": nodes and edges, "activeEdges" for the edge being traversed, "labels" for distances or
  in-degrees. BFS, DFS, Dijkstra, topological sort, MST. Set "directed": true when directed.
- "stack": an input row PLUS a vertical stack and/or a queue. Monotonic stack, deque, BFS queue.

Return ONLY a JSON object:
{
  "kind": "array" | "grid" | "list" | "tree" | "graph" | "stack",
  "examples": [
    { "name": "General case", "input": "the small input as text", "expected": "the correct output",
      "why": "one sentence: what this example exercises", "frames": [ ...12 to 24 frames... ] },
    { "name": "Edge case: <what makes it tricky, 3-6 words>", "input": "...", "expected": "...",
      "why": "...", "frames": [ ...5 to 12 frames... ] }
  ]
}
EXACTLY TWO examples, same "kind" and same CODE in both.

EVERY frame has:
- "caption": one sentence, present tense — WHAT happens in this step.
- "note": one or two sentences — WHY, and what it rules in or out. This is the teaching line; never empty.
- "vars": the live variables after this step, up to 6, short names, the same keys throughout.
- "line": the 1-based line number in the CODE that this step executes. Point at the real line.
- whenever the algorithm keeps one: "queue" (front to back), "stack" (bottom to top), and
  "queueHl"/"stackHl" for entries being pushed or popped. A BFS or DFS trace without its
  queue or stack is wrong.

Then by kind:
- array:  "cells", "pointers": {"i": index}, "highlight": [indices], "done", "bad",
          "ranges": [{"from":i,"to":j,"label":"window"}], "labels": {"index":"text"}, "aux": {"dp":[...]}
- grid:   "grid": [[values]], "highlight": [[r,c]], "done": [[r,c]], "bad": [[r,c]]
- list:   "nodes": [{"id","label"}], "next": {"a":"b"}, "pointers": {"slow":"a"}, "highlight", "done"
- tree:   "nodes": [{"id","label","parent","side"}], "highlight", "done", "bad", "labels"
- graph:  "nodes": [{"id","label"}], "edges": [["A","B",5]], "directed", "highlight", "done",
          "bad", "activeEdges", "labels"
- stack:  "cells", "pointers", "highlight", "done", "stack", "stackHl", "queue", "queueHl", "labels"

One frame per decision: each comparison, pointer move, answer update, push/pop, recursion entry and
return. Show the failed comparisons too. Frame 1 sets up the initial state; the last frame states the
final answer in its caption. Keep the input tiny (5-8 elements, 3x3 grids, 5-7 nodes) but chosen so
the interesting case occurs. No markdown, no fences.`;

const animPrompt = full => {
  const numbered = full.code.source.split('\n')
    .map((l, i) => `${String(i + 1).padStart(3)}  ${l}`).join('\n');
  return `Animate the algorithm taught by the handbook topic "${full.title}".

WHAT IT DOES: ${full.summary}

CODE (every frame's "line" refers to these numbers):
${numbered}

The author traced it on this input, which you may reuse or replace with a clearer one:
${full.walkthrough.input}
${full.walkthrough.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}`;
};

// -------------------------------------------------------------- normalise ---

function normalise(raw, full) {
  const str = (v, max = 600) => String(v ?? '').trim().slice(0, max);
  const arr = (v, n, f) => (Array.isArray(v) ? v : []).slice(0, n).map(f).filter(Boolean);
  const doc = {
    gist: str(raw.gist, 1200),
    when: str(raw.when, 400),
    steps: arr(raw.steps, 8, s => str(s, 300)),
    keys: arr(raw.keys, 6, k => {
      const term = str(k?.term, 120), what = str(k?.what, 500);
      return term && what ? { term, what } : null;
    }),
    drills: arr(raw.drills, 8, d => {
      const ask = str(d?.ask, 400), answer = str(d?.answer, 1200);
      return ask && answer ? { ask, answer, hint: str(d?.hint, 200) } : null;
    }),
    traps: arr(raw.traps, 6, t => str(t, 400)),
    complexity: {
      time: str(raw.complexity?.time, 120) || full.complexity.time,
      space: str(raw.complexity?.space, 120) || full.complexity.space,
      why: str(raw.complexity?.why, 500) || full.complexity.why,
    },
  };
  if (!doc.gist || doc.steps.length < 3 || doc.drills.length < 2) {
    throw new Error(`thin digest: ${doc.steps.length} steps, ${doc.drills.length} drills`);
  }
  return doc;
}

/** Sibling topics in the same group, so the page offers somewhere to go next. */
function related(slug) {
  for (const c of outline()) {
    for (const g of c.groups) {
      if (!g.articles.some(a => a.slug === slug)) continue;
      return g.articles.filter(a => a.slug !== slug).slice(0, 6)
        .map(a => ({ slug: a.slug, title: a.title, chapter: c.chapter, group: g.group }));
    }
  }
  return [];
}

// ------------------------------------------------------------------- build ---

/**
 * The simple view for a topic. Generated from the full page, so requesting it
 * for a topic nobody has opened writes the full page first.
 */
export async function simple(slug, { model, refresh = false } = {}) {
  const meta = articleMeta(slug);
  if (!meta) return null;

  let doc = refresh ? null : await store.get(slug);
  if (doc?.schema !== SCHEMA) doc = null;

  if (!doc) {
    const full = await article(slug, { model });
    if (!full) return null;

    // The digest and the frames are independent; neither needs the other.
    const [digest, anim] = await Promise.all([
      llm.chatJson({
        where: 'prolearn/simple',
        model: model || DIGEST_MODEL,
        temperature: 0.2,
        maxTokens: 8000,
        timeoutMs: 300_000,
        parse: raw => normalise(raw, full),
        messages: [
          { role: 'system', content: DIGEST_SYSTEM },
          { role: 'user', content: digestPrompt(full) },
        ],
      }),
      animate(slug, full, model),
    ]);

    doc = {
      schema: SCHEMA,
      slug, title: meta.title, chapter: meta.chapter, group: meta.group,
      ...digest,
      code: full.code,
      anim,
      problems: full.problems,
      generatedAt: Date.now(),
    };
    await store.set(slug, doc);
  }

  return {
    ...doc,
    // Resolved on every read so links follow the question set, not the cache.
    problems: resolveTitles(doc.problems.map(p => p.title || p)),
    toolkit: idiomsIn(doc.code?.source),
    related: related(slug),
  };
}

/** Frames are the flakiest part of the page, so a failure degrades rather than throws. */
async function animate(slug, full, model) {
  try {
    const raw = await llm.chatJson({
      where: 'prolearn/anim',
      model: model || ANIM_MODEL,
      temperature: 0.2,
      maxTokens: 14000,
      timeoutMs: 300_000,
      messages: [
        { role: 'system', content: ANIM_SYSTEM },
        { role: 'user', content: animPrompt(full) },
      ],
    });
    const out = normaliseWalkthrough({ ...raw, code: full.code.source, approach: 'optimal' }, { slug });
    if (!out.examples.length || out.frames.length < 3) return null;
    return { kind: out.kind, code: out.code, examples: out.examples, input: out.input, frames: out.frames };
  } catch {
    return null;
  }
}

export async function writtenSlugs() {
  return store.keys();
}

export async function has(slug) {
  const doc = await store.get(slug);
  return doc?.schema === SCHEMA;
}
