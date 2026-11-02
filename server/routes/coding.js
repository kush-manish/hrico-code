/** The coding interview: interviewer chat, solution breakdown, scorecard, watched demo turns. */
import * as v from '../validate.js';
import { BadRequest } from '../errors.js';
import { chat, personas, generateSolution, cacheSize, hasSolution } from '../agent.js';
import * as models from '../models.js';
import * as codingScore from '../coding-score.js';
import * as demo from '../demo.js';
import * as codeFix from '../code-fix.js';
import { requiredKnowledge } from '../required-knowledge.js';
import { readLimit, llmLimit, solutionLimit, scoreLimit, requireCap, requireAi, validateBody, wrap, cleanProfile } from '../middleware.js';

/** Seconds, or null when the event never happened. */
const secs = x => (x === null || x === undefined || !Number.isFinite(Number(x)) ? null
  : Math.max(0, Math.min(6 * 3600, Math.round(Number(x)))));

/** Pacing evidence measured by the client; only numbers and short labels pass. */
function cleanPacing(p) {
  if (!p || typeof p !== 'object') return null;
  return {
    durationMin: Math.max(5, Math.min(120, Math.round(Number(p.durationMin) || 45))),
    elapsedSec: secs(p.elapsedSec),
    firstCodeSec: secs(p.firstCodeSec),
    codeTargetSec: secs(p.codeTargetSec),
    complexityStated: p.complexityStated === true,
    complexityAtSec: secs(p.complexityAtSec),
    samplesPassSec: secs(p.samplesPassSec),
    phase: String(p.phase || '').slice(0, 40),
    followUp: p.followUp ? String(p.followUp).slice(0, 40) : null,
  };
}

/** Interview-flow hints for the chat prompt; anything else in context is ignored there. */
function cleanFlow(c) {
  const src = c && typeof c === 'object' ? c : {};
  return {
    ...src,
    realistic: src.realistic === true,
    phase: typeof src.phase === 'string' ? src.phase.slice(0, 40) : undefined,
    elapsed: typeof src.elapsed === 'string' ? src.elapsed.slice(0, 12) : undefined,
    followUp: ['samples-pass', 'time'].includes(src.followUp) ? src.followUp : undefined,
    approach: src.approach === true,
    notes: typeof src.notes === 'string' ? src.notes.slice(0, 6000) : undefined,
  };
}

export function mount(app) {
  // ------------------------------------------------------------------- llm ---

  app.post('/api/coding/score', scoreLimit, validateBody(b => {
    // A whole 45-minute mock, not just the last few turns.
    const transcript = Array.isArray(b.transcript) ? v.messages(b.transcript.slice(-120), { max: 120, total: 80_000 }) : [];
    const code = typeof b.code === 'string' ? b.code.slice(0, 20_000) : '';
    // Nothing said and nothing written is not an interview to score.
    if (!transcript.length && !code.trim()) {
      throw new BadRequest('nothing to score — no conversation or code in this session');
    }
    return {
      question: String(b.question || 'Unknown problem').slice(0, 200),
      difficulty: String(b.difficulty || '').slice(0, 40),
      transcript,
      code,
      lang: String(b.lang || '').slice(0, 40),
      result: b.result && typeof b.result === 'object' ? b.result : null,
      realistic: b.realistic === true,
      aidsUsed: Math.max(0, Math.min(99, Math.floor(Number(b.aidsUsed) || 0))),
      aids: (Array.isArray(b.aids) ? b.aids : []).slice(0, 12).map(a => String(a).slice(0, 40)),
      pacing: cleanPacing(b.pacing),
    };
  }), requireCap('llm'), requireAi, wrap(async (req, res) => {
    const model = await models.resolve(req.body?.model);
    res.json(await codingScore.score({ ...req.clean, model }));
  }));


  // ------------------------------------------------------------------- demo ---

  app.post('/api/demo/turn', llmLimit, validateBody(b => {
    const speaker = b.speaker === 'candidate' ? 'candidate' : 'interviewer';
    const transcript = (Array.isArray(b.transcript) ? b.transcript : []).slice(-24).map(t => ({
      speaker: t?.speaker === 'candidate' ? 'candidate' : 'interviewer',
      text: String(t?.text || '').slice(0, 4000),
    })).filter(t => t.text);
    return {
      mode: b.mode === 'behavioural' ? 'behavioural' : 'coding',
      speaker,
      question: String(b.question || '').slice(0, 300),
      statement: String(b.statement || '').slice(0, 6000),
      transcript,
      profile: cleanProfile(b.profile),
      // The candidate's own story bank, so the demo shows how THEIR stories land.
      stories: (Array.isArray(b.stories) ? b.stories : []).slice(0, 15).map(x => ({
        title: String(x?.title || '').slice(0, 160), text: String(x?.text || '').slice(0, 1800),
      })).filter(x => x.text),
    };
  }), requireCap('llm'), requireAi, wrap(async (req, res) => {
    // A Grok id this proxy does not list still gets Grok (through devin), not the generic default.
    const want = req.body?.model;
    const model = (await models.resolve(want)) || (/grok/i.test(String(want || '')) ? await models.resolve(demo.GROK_FALLBACK) : undefined);
    const out = await demo.turn({ ...req.clean, model });
    res.json({ ...out, code: demo.extractCode([...req.clean.transcript, out]) });
  }));

  /** "Suggest fixes": the candidate's code, minimally corrected, for a per-change diff in the browser. */
  app.post('/api/coding/fix', llmLimit, validateBody(b => {
    const code = v.code(b.code);
    if (!code.trim()) throw new BadRequest('nothing to fix — the editor is empty');
    const r = b.result && typeof b.result === 'object' ? b.result : null;
    const s = (x, n) => (x === null || x === undefined ? null : String(x).slice(0, n));
    return {
      title: String(b.title || '').slice(0, 200), statement: String(b.statement || '').slice(0, 6000),
      code, lang: v.lang(b.lang), testInput: String(b.testInput || '').slice(0, 2000),
      result: r && { status: s(r.status, 80), lastTestcase: s(r.lastTestcase, 2000), expected: s(r.expected, 2000), actual: s(r.actual, 2000), error: s(r.error, 3000) },
    };
  }), requireCap('llm'), requireAi, wrap(async (req, res) => {
    const model = await models.resolve(req.body?.model);
    res.json(await codeFix.suggestFix({ ...req.clean, model }));
  }));

  app.get('/api/personas', readLimit, (_req, res) => res.json(personas()));

  app.post('/api/chat', llmLimit, validateBody(b => ({
    persona: v.persona(b.persona, personas().map(p => p.id)),
    messages: v.messages(b.messages),
    context: cleanFlow(b.context),
    profile: cleanProfile(b.profile),
  })), requireCap('llm'), requireAi, wrap(async (req, res) => {
    const model = await models.resolve(req.body?.model);
    res.json({ reply: await chat({ ...req.clean, model, interviewer: req.body?.interviewer }) });
  }));

  // Re-reading a solution that is already written is free, so it does not
  // count against the generation budget (the Animate views re-read often).
  const solutionGate = (req, res, next) => (hasSolution(String(req.body?.slug || ''), String(req.body?.lang || '')) ? next() : solutionLimit(req, res, next));
  app.post('/api/solution', solutionGate, validateBody(b => ({
    slug: v.slug(b.slug),
    title: String(b.title || '').slice(0, 200),
    difficulty: String(b.difficulty || '').slice(0, 40),
    statement: String(b.statement || '').slice(0, 20_000),
    lang: v.lang(b.lang),
  })), requireCap('llm'), requireAi, wrap(async (req, res) => {
    const model = await models.resolve(req.body?.model);
    res.json({ markdown: await generateSolution({ ...req.clean, model }) });
  }));

  /** What to ask, what to say and what is being scored, compiled from the handbook. */
  app.get('/api/required-knowledge/:slug', solutionLimit, requireCap('llm'), requireAi, wrap(async (req, res) => {
    const slug = v.slug(req.params.slug);
    const doc = await requiredKnowledge(slug, { refresh: req.query?.refresh === '1' });
    if (!doc) return res.status(404).json({ error: 'unknown question' });
    res.json(doc);
  }));

}
