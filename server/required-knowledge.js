/**
 * "Required knowledge" for one question: everything the handbook teaches about
 * it, folded into what to ask, what to say and what the interviewer is scoring
 * — written for a Google L4 loop.
 *
 * The Pro-Learn topics that cite this problem are the input, so the guidance
 * names the patterns the reader can go and revise rather than inventing its
 * own vocabulary. Two models, as elsewhere: the strong one writes, a fast one
 * folds the prose into the shape the pane renders. Cached, so it costs once.
 */
import path from 'path';
import { fileURLToPath } from 'url';
import { FileStore } from './cache/fileStore.js';
import { llm } from './llm/client.js';
import { question } from './questions.js';
import { article, topicsFor } from './prolearn.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const store = new FileStore(process.env.RK_CACHE_DIR
  || path.join(__dirname, '../.cache/required-knowledge'));
const SCHEMA = 1;

// Opus 5.5 is rejected by the proxy (it demands a newer Claude Code), so the
// strongest model actually reachable does the writing.
const AUTHOR_MODEL = process.env.RK_AUTHOR_MODEL || 'claude-opus-5';
const SHAPER_MODEL = process.env.RK_SHAPER_MODEL || 'gemini-3.7-flash-medium';

const MAX_TOPICS = 6;

export const AUTHOR_SYSTEM = `You are a Google staff engineer who has run hundreds of L4 coding interviews
and sat on the hiring committee. You are briefing one candidate on ONE problem, an hour before the
loop. You know exactly what earns "Strong Hire" and what quietly sinks a candidate.

Be specific to THIS problem. Never give generic interview advice that would read the same for any
question. No filler, no motivation, no "in this guide we will". Assume they can already code.

You MUST emit all six headings below, verbatim, in this order, and nothing else at the top level.
No preamble, no title, no closing summary, no reference solution section. Every heading must be
present even if you find it obvious. Do not rename, merge, reorder or add headings.

## Ask first
The 3-5 clarifying questions to ask before writing anything, each with the reason it matters AND
what the likely answer changes about the solution. Put the one that most changes the approach first.
A question whose answer changes nothing is a wasted question — do not include it.

## What to say, in order
The spoken script, beat by beat, from "here is what I think this is asking" to "here is my
complexity". 6-9 beats. For each, one line of what to actually say out loud — real sentences a
candidate can say, not topic labels. Include the moment to state the brute force and the moment to
abandon it.

## What you must already know
The concepts, invariants and data structures this problem assumes. For each: the idea in one or two
sentences, and the specific way THIS problem uses it.

## How the scoring works
What the interviewer is marking, and how to hit the top of each band at L4: the signal, then
concretely what earns full marks on this problem versus what looks merely adequate.

## Where candidates lose points
4-6 failure modes seen on this exact problem — wrong data structure, the off-by-one, the edge case
skipped, the silence while thinking. Each one sentence, each concrete.

## Follow-ups to expect
3-4 variations the interviewer pushes to when the main solution lands early, with one line on how
each changes the approach.`;

export const authorPrompt = (q, topics) => `Brief a candidate on this Google L4 coding interview problem.

PROBLEM: ${q.title} (${q.difficulty})
TAGS: ${q.topicTags.join(', ') || 'none'}

STATEMENT:
${stripHtml(q.content).slice(0, 6000)}

${q.hints?.length ? `OFFICIAL HINTS:\n${q.hints.map(h => `- ${stripHtml(h)}`).join('\n')}\n` : ''}
${topics.length ? `THE HANDBOOK TOPICS THAT TEACH THIS PROBLEM — use this vocabulary, and lean on
these patterns rather than inventing your own names for them:

${topics.map(t => `### ${t.title}  (${t.chapter} › ${t.group})
${t.summary}
Cue: ${t.cue}
Complexity: ${t.complexity.time} time, ${t.complexity.space} space.
${t.traps.length ? `Known traps: ${t.traps.slice(0, 4).join(' | ')}` : ''}`).join('\n\n')}` : ''}

Reply with exactly these six markdown headings, verbatim and in this order, each one filled in:

## Ask first
## What to say, in order
## What you must already know
## How the scoring works
## Where candidates lose points
## Follow-ups to expect

Nothing before the first heading and nothing after the last section.`;

const SHAPER_SYSTEM = `You convert a finished interview briefing into JSON for a renderer.
You are a formatter, not an author: never shorten, summarise, rewrite or invent. Move the author's
words across verbatim, minus the markdown syntax itself.
Return STRICT JSON only, exactly this shape:
{
  "ask": [ { "q": "the question to ask, verbatim", "why": "why it matters and what the answer changes" } ],
  "say": [ { "beat": "the short name of this beat", "line": "what to say out loud, verbatim" } ],
  "know": [ { "topic": "the concept name", "what": "the idea", "here": "how this problem uses it" } ],
  "scoring": [ { "signal": "what is being marked", "full": "what earns full marks here",
                 "weak": "what looks merely adequate" } ],
  "lose": ["one string per failure mode"],
  "followups": [ { "ask": "the follow-up", "change": "how it changes the approach" } ]
}
Every bullet in the briefing becomes exactly one entry. Strip markdown emphasis and list markers
from the prose; keep the sentences themselves untouched.

The briefing may not use those exact headings. Never return an empty array because a heading was
missing: find the material that answers it wherever it sits and put it there. Clarifying questions
to ask the interviewer go in "ask" — if they are phrased as facts ('exactly one solution is
guaranteed'), turn each back into the question the candidate should ask. Concepts the problem
assumes, including any named pattern or data structure, go in "know". A reference solution or
complexity discussion is not a section of its own: fold it into "say" and "know".`;

const stripHtml = s => String(s || '')
  .replace(/<sup>/g, '^').replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();

function normalise(raw, q, topics) {
  const str = (v, max = 1500) => String(v ?? '').trim().slice(0, max);
  const arr = (v, n, f) => (Array.isArray(v) ? v : []).slice(0, n).map(f).filter(Boolean);
  const doc = {
    schema: SCHEMA,
    slug: q.slug,
    title: q.title,
    difficulty: q.difficulty,
    ask: arr(raw.ask, 6, a => {
      const qq = str(a?.q, 400), why = str(a?.why, 800);
      return qq ? { q: qq, why } : null;
    }),
    say: arr(raw.say, 10, s => {
      const line = str(s?.line, 900);
      return line ? { beat: str(s?.beat, 120), line } : null;
    }),
    know: arr(raw.know, 10, k => {
      const topic = str(k?.topic, 160);
      return topic ? { topic, what: str(k?.what, 900), here: str(k?.here, 900) } : null;
    }),
    scoring: arr(raw.scoring, 8, s => {
      const signal = str(s?.signal, 200);
      return signal ? { signal, full: str(s?.full, 900), weak: str(s?.weak, 900) } : null;
    }),
    lose: arr(raw.lose, 8, t => str(t, 600)),
    followups: arr(raw.followups, 6, f => {
      const ask = str(f?.ask, 400);
      return ask ? { ask, change: str(f?.change, 700) } : null;
    }),
    // The handbook pages behind the advice, so the pane can link into Pro-Learn.
    topics: topics.map(t => ({ slug: t.slug, title: t.title, chapter: t.chapter, group: t.group })),
    generatedAt: Date.now(),
  };
  if (doc.ask.length < 2 || doc.say.length < 3 || doc.know.length < 2) {
    throw new Error(`thin briefing: ${doc.ask.length} ask, ${doc.say.length} say, ${doc.know.length} know`);
  }
  return doc;
}

/** The handbook pages that teach this problem, with the parts the briefing needs. */
export async function sourceTopics(slug) {
  const metas = (await topicsFor(slug)).slice(0, MAX_TOPICS);
  const full = await Promise.all(metas.map(async m => {
    try {
      const a = await article(m.slug);
      return a && { ...m, summary: a.summary, cue: a.cue, complexity: a.complexity, traps: a.traps };
    } catch {
      return null;                        // a page that will not write must not sink the briefing
    }
  }));
  return full.filter(Boolean);
}

/**
 * The briefing for a question. Written once and kept: it does not change as
 * the reader's code does, and the strong model is slow.
 */
export async function requiredKnowledge(slug, { model, refresh = false } = {}) {
  const q = question(slug);
  if (!q) return null;

  let doc = refresh ? null : await store.get(slug);
  if (doc?.schema === SCHEMA) return doc;

  const topics = await sourceTopics(slug);

  const prose = await llm.chat({
    where: 'required-knowledge/author',
    model: model || AUTHOR_MODEL,
    temperature: 0.3,
    maxTokens: 8000,
    timeoutMs: 300_000,
    messages: [
      { role: 'system', content: AUTHOR_SYSTEM },
      { role: 'user', content: authorPrompt(q, topics) },
    ],
  });

  doc = await llm.chatJson({
    where: 'required-knowledge/shape',
    model: SHAPER_MODEL,
    temperature: 0,
    maxTokens: 9000,
    timeoutMs: 300_000,
    parse: raw => normalise(raw, q, topics),
    messages: [
      { role: 'system', content: SHAPER_SYSTEM },
      { role: 'user', content: `Convert this briefing on "${q.title}" to JSON.\n\n${prose}` },
    ],
  });

  await store.set(slug, doc);
  return doc;
}

export async function has(slug) {
  const doc = await store.get(slug);
  return doc?.schema === SCHEMA;
}
