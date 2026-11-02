/**
 * One animation per APPROACH to a topic, not just one per topic: the brute
 * force you would be asked to improve on, the canonical optimal solution, and
 * each named variant from the handbook page. Every approach carries its own
 * code, so the trace and the listing always agree.
 *
 * Cached apart from the simple view so adding approaches does not invalidate
 * the 222 digests, and a topic can gain them lazily.
 */
import path from 'path';
import { fileURLToPath } from 'url';
import { FileStore } from './cache/fileStore.js';
import { llm } from './llm/client.js';
import { article, articleMeta } from './prolearn.js';
import { normaliseWalkthrough } from './explain.js';
import { ANIM_SYSTEM } from './prolearn-simple.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const store = new FileStore(process.env.PROLEARN_APPROACH_CACHE_DIR
  || path.join(__dirname, '../.cache/prolearn-approaches'));
const SCHEMA = 1;

const MODEL = process.env.PROLEARN_ANIM_MODEL || 'gemini-3.7-flash-medium';
const MAX_VARIANTS = 4;          // beyond this a page becomes a wall of tabs

/** The brute force and the variants need code of their own before they can be traced. */
const CODE_SYSTEM = `You write the reference implementation of ONE stated approach to a DSA topic.
Return STRICT JSON only: { "code": "...", "time": "O(...)", "space": "O(...)",
"why": "1-2 sentences: how this approach differs from the canonical one and what it costs or saves" }
The code is complete, runnable, idiomatic, self-contained, no ellipses, no markdown, no commentary.
Same language and naming style as the canonical code you are shown. Keep it under 40 lines.`;

const codePrompt = (full, kindLine) => `Topic: "${full.title}".
${full.summary}

CANONICAL (optimal) IMPLEMENTATION, for style and naming:
${full.code.source}

WRITE THE IMPLEMENTATION FOR THIS APPROACH INSTEAD:
${kindLine}`;

const BRUTE_LINE = `The obvious brute-force solution a candidate writes first — the one the optimal
approach above exists to improve on. It must be correct but asymptotically worse, and the wasted
work must be visible when traced step by step.`;

async function approachCode(full, kindLine, model) {
  const raw = await llm.chatJson({
    where: 'prolearn/approach-code',
    model: model || MODEL,
    temperature: 0.2,
    maxTokens: 3000,
    timeoutMs: 300_000,
    messages: [
      { role: 'system', content: CODE_SYSTEM },
      { role: 'user', content: codePrompt(full, kindLine) },
    ],
  });
  const code = String(raw?.code || '').trim();
  if (!code) throw new Error('no code for approach');
  return {
    code,
    time: String(raw?.time || '').trim().slice(0, 120),
    space: String(raw?.space || '').trim().slice(0, 120),
    why: String(raw?.why || '').trim().slice(0, 600),
  };
}

const animPrompt = (title, what, code) => {
  const numbered = code.split('\n')
    .map((l, i) => `${String(i + 1).padStart(3)}  ${l}`).join('\n');
  return `Animate this specific approach to the topic "${title}".

THE APPROACH: ${what}

CODE (every frame's "line" refers to these numbers):
${numbered}`;
};

async function animate(slug, title, what, code, model) {
  const raw = await llm.chatJson({
    where: 'prolearn/approach-anim',
    model: model || MODEL,
    temperature: 0.2,
    maxTokens: 14000,
    timeoutMs: 300_000,
    messages: [
      { role: 'system', content: ANIM_SYSTEM },
      { role: 'user', content: animPrompt(title, what, code) },
    ],
  });
  const out = normaliseWalkthrough({ ...raw, code, approach: 'optimal' }, { slug });
  if (!out.examples.length || out.frames.length < 3) throw new Error('too few frames');
  return { kind: out.kind, code: out.code, examples: out.examples, input: out.input, frames: out.frames };
}

/** Code and frames for one approach. Returns null rather than throwing: one dud tab is not a dud page. */
async function build(slug, full, { id, name, what }, model) {
  try {
    const c = await approachCode(full, what, model);
    const anim = await animate(slug, full.title, what, c.code, model);
    return { id, name, what, code: c.code, lang: full.code.lang, complexity: { time: c.time, space: c.space, why: c.why }, anim };
  } catch {
    return null;
  }
}

/**
 * Every approach for a topic, in the order a candidate should meet them:
 * brute force first, then the optimal one, then the variants.
 *
 * The optimal entry reuses the page's existing animation, so nothing is
 * regenerated for the traces that are already correct.
 */
export async function approaches(slug, { model, refresh = false } = {}) {
  const meta = articleMeta(slug);
  if (!meta) return null;

  let doc = refresh ? null : await store.get(slug);
  if (doc?.schema !== SCHEMA) doc = null;

  if (!doc) {
    const full = await article(slug, { model });
    if (!full) return null;

    const wanted = [
      { id: 'brute', name: 'Brute force', what: BRUTE_LINE },
      ...full.variants.slice(0, MAX_VARIANTS).map((v, i) => ({
        id: `variant${i + 1}`,
        name: v.name.replace(/\.$/, ''),
        what: `${v.name} — ${v.change}`,
      })),
    ];

    const built = await Promise.all(wanted.map(w => build(slug, full, w, model)));
    doc = { schema: SCHEMA, slug, title: meta.title, items: built.filter(Boolean), generatedAt: Date.now() };
    await store.set(slug, doc);
  }

  return doc;
}

export async function writtenSlugs() {
  return store.keys();
}

export async function has(slug) {
  const doc = await store.get(slug);
  return doc?.schema === SCHEMA;
}
