/**
 * Curated best answers for every behavioural / Googleyness question, written
 * for ONE candidate (the resume in data/resume.txt) and checked against the
 * same scorer the mock interview uses. Generated offline by
 * best-answers-warm.js, stored in data/best-answers.json, served read-only.
 *
 * Honesty rule: every fact comes from the resume or the REALQ story bank.
 * Anything the resume does not say is a [bracketed] placeholder the
 * candidate must replace with the real detail before using the answer.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { llm } from './llm/client.js';
import { score, isHypothetical } from './behavioural.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const FILE = path.join(__dirname, 'data/best-answers.json');
const RESUME = path.join(__dirname, 'data/resume.txt');
const REALQ_BV = path.join(__dirname, 'data/realq/2-behavioural.md');

let mem = { at: 0, data: null };
export function load() {
  try {
    const st = fs.statSync(FILE);
    if (!mem.data || st.mtimeMs !== mem.at) mem = { at: st.mtimeMs, data: JSON.parse(fs.readFileSync(FILE, 'utf8')) };
  } catch { mem = { at: 0, data: { answers: {} } }; }
  return mem.data;
}

/** The parts of the REALQ behavioural notes that guide story choice. */
function storyGuide() {
  const md = fs.readFileSync(REALQ_BV, 'utf8');
  const from = md.indexOf('## 3.'), to = md.indexOf('## 7.');
  return md.slice(from, to > from ? to : undefined).trim();
}

const WRITER = `You are coaching ONE specific candidate for Google's Googleyness & Leadership
interview (Software Engineer III / L4, London). You write the answer they will say out loud.

HARD RULES — honesty:
- Use ONLY the candidate's resume and the story bank below. Never invent employers, projects,
  products, team sizes, people's names or numbers.
- The resume's numbers (80M+ records/month, 10 days -> under 8 hours, 90% less manual
  intervention, 70% faster COB reports, 600+ hours/year, 3 min -> under 40 s, 98% uptime,
  2-3 day SLA, 1,000+ concurrent users, 15% latency, 100% compliance / zero audit failures)
  may be used freely and exactly as written.
- Any specific the answer needs that the resume does not contain (what a colleague's concern
  was, what the bottleneck was, the follow-up outcome) goes in [square brackets] as a short,
  concrete, plausible placeholder the candidate must confirm or replace, e.g.
  [the batch join was single-threaded]. Keep brackets few (0-4) and short.
- Questions about things not on the resume (credit taken, conflict with a manager, a failure)
  may use Al-Shala, Blue Yonder or JPMorgan as the setting, with the personal specifics in
  brackets. Hypotheticals do not need a story at all.

WHAT A 4/4 ON EVERY SIGNAL NEEDS (the scorer is strict):
- ownership: "I" for every action, a responsibility taken beyond the remit, driven to the end.
- impact: a quantified result WITH the baseline, and reach beyond the immediate team.
- judgement: the real alternatives named, the constraint that decided it, what it cost, and
  when they would choose differently.
- collaboration: someone's mind changed with evidence, AND the relationship preserved
  (or a disagreement where the other person was right, said honestly).
- reflection: a specific lesson AND a later situation where they applied it.
- communication: lead with the point in the first sentence, then a clear order.
For hypotheticals (GCA): Understand (clarifying questions + stated assumptions) -> Prepare (what
data, existing/historic/new, and from where) -> Identify a solution (options weighed, then one
recommendation) -> Support it (how success is measured and tracked over time). Mention who you
would involve and what would change your mind.

Spoken British English, contractions, no headings, first person. Main answer 230-300 words
(about two minutes). Motivation framed around users and the team — never personal convenience
(a reported red flag). Never blame anyone.

Return ONLY this JSON:
{
  "story": "which story id(s) from the bank this uses, e.g. S5, or 'hypothetical'",
  "answer": "the spoken answer",
  "star": {"situation":"", "task":"", "action":"", "result":"", "reflection":""},
  "evidence": ["2-4 resume facts it draws on"],
  "gaps": ["each [bracket] as a question the candidate must answer for themselves"],
  "why": "one sentence: why this story is the right pick for this question",
  "followUps": [{"q":"a probing follow-up Google interviewers ask after this", "a":"the 50-90 word spoken reply, same honesty rules"}]
}
"followUps" has exactly 3 items. No markdown fences.`;

const clip = (v, n) => String(v ?? '').trim().slice(0, n);

export function normalise(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const st = r.star && typeof r.star === 'object' ? r.star : {};
  const list = (v, n, k) => (Array.isArray(v) ? v : []).map(x => clip(x, k)).filter(Boolean).slice(0, n);
  const out = {
    story: clip(r.story, 60),
    answer: clip(r.answer, 3000),
    star: Object.fromEntries(['situation', 'task', 'action', 'result', 'reflection'].map(k => [k, clip(st[k], 700)])),
    evidence: list(r.evidence, 5, 200),
    gaps: list(r.gaps, 6, 240),
    why: clip(r.why, 300),
    followUps: (Array.isArray(r.followUps) ? r.followUps : []).slice(0, 4)
      .map(f => ({ q: clip(f?.q, 300), a: clip(f?.a, 900) })).filter(f => f.q && f.a),
  };
  if (!out.answer || out.followUps.length < 2) throw new Error('incomplete answer');
  return out;
}

export async function write({ question, category, resume, guide, feedback, previous, model, avoid = [] }) {
  const gca = isHypothetical(question) ? '\nThis is a HYPOTHETICAL (GCA) question: walk the four steps, no past story needed. Map star fields as situation=Understand, task=Prepare, action=Identify a solution, result=Support it, reflection=risks / what would change the call.' : '';
  const alt = avoid.length && !previous ? `\n\nALTERNATIVE ANSWER: the candidate already has the answer(s) below. Write a genuinely different one — a different story from the bank (or, for a hypothetical, a different framing and recommendation), still the strongest honest fit. Do not reuse their opening or their main example.\n${avoid.map((a, i) => `--- existing ${i + 1} (story ${a.story || '?'}):\n${a.answer}`).join('\n')}` : '';
  const revise = previous ? `\n\nYOUR PREVIOUS DRAFT scored below 4 on some signals. Fix exactly what the scorer said, keep what scored 4, stay honest:\n${JSON.stringify(previous)}\n\nSCORER FEEDBACK:\n${feedback}` : '';
  return llm.chatJson({
    model, temperature: 0.4, maxTokens: 3200, timeoutMs: 180_000, where: 'best-answer',
    messages: [
      { role: 'system', content: WRITER },
      { role: 'system', content: `CANDIDATE RESUME:\n${resume}` },
      { role: 'system', content: `STORY BANK AND ADVICE (from real 2025-26 Google interview reports):\n${guide}` },
      { role: 'user', content: `CATEGORY: ${category}\nQUESTION: ${question}${gca}${alt}${revise}` },
    ],
    parse: normalise,
  });
}

const SCORE_NOTE = `Square-bracketed spans like [the batch join was single-threaded] are facts the
candidate will state from their own experience; treat each as said. Score this as the opening
answer plus the interviewer's follow-ups in a real round.`;

export async function grade({ question, a, model }) {
  const messages = [
    { role: 'assistant', content: question },
    { role: 'user', content: a.answer },
    ...a.followUps.flatMap(f => [{ role: 'assistant', content: f.q }, { role: 'user', content: f.a }]),
  ];
  // The scorer sometimes returns a truncated scorecard; a retry nearly always works.
  let err;
  for (let i = 0; i < 3; i++) {
    try { return await score({ question, messages, model, note: SCORE_NOTE, timeoutMs: 180_000 }); }
    catch (e) { err = e; }
  }
  throw err;
}

export const inputs = () => ({ resume: fs.readFileSync(RESUME, 'utf8'), guide: storyGuide() });

// ------------------------------------------------------- alternatives ---
// On demand from the UI: Claude writes a different story for the same
// question, the mock's scorer grades it, one revision if it is below 100%.
// Kept in their own file so the warm script (which rewrites FILE) never
// clobbers them. Jobs run in the background; the client polls, because a
// two-minute request would be cut off by the proxy in front of the app.
export const ALT_FILE = path.join(__dirname, 'data/best-answers-alt.json');
export const ALT_WRITER = process.env.BEST_ANSWER_WRITER || 'claude-opus-4-8';
const MAX_ALTS = 4;

export function loadAlts() {
  try { return JSON.parse(fs.readFileSync(ALT_FILE, 'utf8')); } catch { return { alternatives: {} }; }
}
function saveAlts(d) {
  d.updatedAt = new Date().toISOString();
  fs.writeFileSync(`${ALT_FILE}.tmp`, JSON.stringify(d, null, 1));
  fs.renameSync(`${ALT_FILE}.tmp`, ALT_FILE);
}

const jobs = new Map();          // id -> {status, question, entry?, error?, at}
const running = new Map();       // question -> job id, so double clicks share one job

const toEntry = (a, s, r, model) => ({
  ...a, model, rounds: r, at: Date.now(),
  score: { percent: s.percent, overall: s.overall, dims: s.dimensions.map(d => ({ id: d.id, label: d.label, score: d.score, comment: d.comment })) },
});

export function startAlternative({ question, category }) {
  if (running.has(question)) return running.get(question);
  const id = Math.random().toString(36).slice(2, 10);
  const job = { status: 'running', question, at: Date.now(), stage: 'writing' };
  jobs.set(id, job); running.set(question, id);
  (async () => {
    try {
      const { resume, guide } = inputs();
      const main = load().answers?.[question];
      const avoid = [main, ...(loadAlts().alternatives[question] || [])].filter(Boolean);
      let best = null, prev = null, feedback = '';
      for (let r = 1; r <= 2; r++) {
        job.stage = r === 1 ? 'writing' : 'revising';
        const a = await write({ question, category, resume, guide, avoid, previous: prev, feedback, model: ALT_WRITER });
        job.stage = 'scoring';
        const s = await grade({ question, a });
        const e = toEntry(a, s, r, ALT_WRITER);
        if (!best || e.score.percent >= best.score.percent) best = e;
        if (s.percent === 100) break;
        prev = { answer: a.answer, followUps: a.followUps };
        feedback = e.score.dims.filter(d => d.score < 4).map(d => `${d.label}: ${d.score}/4 — ${d.comment}`).join('\n');
      }
      const d = loadAlts();
      d.alternatives ||= {};
      d.alternatives[question] = [best, ...(d.alternatives[question] || [])].slice(0, MAX_ALTS);
      saveAlts(d);
      Object.assign(job, { status: 'done', entry: best });
    } catch (e) {
      Object.assign(job, { status: 'error', error: e.message || 'failed' });
    } finally {
      running.delete(question);
      for (const [k, j] of jobs) if (Date.now() - j.at > 3600_000) jobs.delete(k);
    }
  })();
  return id;
}

export const job = id => jobs.get(id) || null;
