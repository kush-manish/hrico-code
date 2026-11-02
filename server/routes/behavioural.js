/** The behavioural interview: bank, chat, scorecard, STAR check, model answers. */
import * as v from '../validate.js';
import { BadRequest } from '../errors.js';
import * as behavioural from '../behavioural.js';
import { GROK_FALLBACK } from '../demo.js';
import * as bestAnswers from '../best-answers.js';
import * as models from '../models.js';
import { listNames, questionsIn, question, resolveTitles, allQuestions } from '../questions.js';
import { readLimit, llmLimit, scoreLimit, solutionLimit, requireCap, requireAi, validateBody, wrap, cleanProfile } from '../middleware.js';

export function mount(app) {
  // ----------------------------------------------------- behavioural mock ---

  app.get('/api/behavioural/categories', readLimit, (_req, res) => res.json({
    categories: behavioural.categories(),
    dimensions: behavioural.dimensions(),
  }));

  /**
   * The curated answers are written from the site owner's own CV, so only
   * admins see them; every other account gets a 403 the bank turns into a
   * "your answers appear here once your resume is added" state.
   */
  const adminOnly = (req, res, next) => {
    if (req.user?.role === 'admin') return next();
    return res.status(403).json({ error: 'Pre-written answers are private to the account they were written for.', code: 'admin_only' });
  };

  /** Curated, pre-scored best answers for the candidate's own resume. */
  app.get('/api/behavioural/best-answers', readLimit, adminOnly, (_req, res) => {
    const d = bestAnswers.load();
    res.json({ updatedAt: d.updatedAt || null, answers: d.answers || {}, alternatives: bestAnswers.loadAlts().alternatives || {}, writer: bestAnswers.ALT_WRITER });
  });

  /** Ask Claude for a different, scored answer to one bank question. Runs in the background. */
  app.post('/api/behavioural/best-answers/alternative', solutionLimit, adminOnly, validateBody(b => {
    const question = v.questionText(b.question);
    const known = behavioural.categories().some(c => behavioural.questionsIn(c.id).includes(question));
    if (!known) throw new BadRequest('alternatives are only written for questions in the bank');
    const cat = behavioural.categories().find(c => behavioural.questionsIn(c.id).includes(question));
    return { question, category: cat?.label || '' };
  }), requireCap('llm'), requireAi, (req, res) => {
    res.status(202).json({ job: bestAnswers.startAlternative(req.clean) });
  });

  app.get('/api/behavioural/best-answers/alternative/:job', readLimit, adminOnly, (req, res) => {
    const j = bestAnswers.job(String(req.params.job).slice(0, 20));
    if (!j) return res.status(404).json({ error: 'no such job (the server may have restarted)' });
    res.json({ status: j.status, stage: j.stage, entry: j.entry || null, error: j.error || null });
  });

  app.get('/api/behavioural/questions/:category', readLimit, (req, res) => {
    const ids = behavioural.categories().map(c => c.id);
    const id = v.categoryId(req.params.category, ids);
    res.json({ category: id, questions: behavioural.questionsIn(id) });
  });

  app.post('/api/behavioural/chat', llmLimit, validateBody(b => ({
    question: v.questionText(b.question),
    messages: v.messages(b.messages),
    timeLeft: v.timeLeft(b.timeLeft),
    profile: cleanProfile(b.profile),
  })), requireCap('llm'), requireAi, wrap(async (req, res) => {
    const model = await models.resolve(req.body?.model);
    res.json({ reply: await behavioural.interview({ ...req.clean, model }) });
  }));

  app.post('/api/behavioural/score', scoreLimit, validateBody(b => {
    const messages = v.messages(b.messages);
    // A transcript with no candidate turns cannot be scored honestly. This lives
    // in validation so it answers 400 even when the model is switched off.
    if (!messages.some(m => m.role === 'user')) {
      throw new BadRequest('nothing to score — the interview has no answers yet');
    }
    return { question: v.questionText(b.question), messages };
  }), requireCap('llm'), requireAi, wrap(async (req, res) => {
    const model = await models.resolve(req.body?.model);
    res.json(await behavioural.score({ ...req.clean, model }));
  }));

  /** STAR structure check on the candidate's answers — the Watch tab's end-of-run report. */
  /** The best answer to a behavioural question for this candidate, from their profile. */
  app.post('/api/behavioural/model-answer', llmLimit, validateBody(b => ({
    question: v.questionText(b.question),
    category: String(b.category || '').slice(0, 80),
    profile: cleanProfile(b.profile),
  })), requireCap('llm'), requireAi, wrap(async (req, res) => {
    const model = await models.resolve(req.body?.model);
    res.json(await behavioural.modelAnswer({ ...req.clean, model }));
  }));

  app.post('/api/behavioural/star', scoreLimit, validateBody(b => {
    const messages = v.messages(b.messages);
    if (!messages.some(m => m.role === 'user')) throw new BadRequest('nothing to review — no answers yet');
    return { question: v.questionText(b.question), messages };
  }), requireCap('llm'), requireAi, wrap(async (req, res) => {
    const model = await models.resolve(req.body?.model);
    res.json(await behavioural.starReview({ ...req.clean, model }));
  }));

  // A question with no story yet, answered from the stories already saved (My stories).
  app.post('/api/behavioural/frame-from-stories', scoreLimit, validateBody(b => {
    const stories = (Array.isArray(b.stories) ? b.stories : []).slice(0, 15).map(x => ({
      id: String(x?.id ?? '').slice(0, 80), title: String(x?.title ?? '').slice(0, 200), text: String(x?.text ?? '').trim().slice(0, 4000),
    })).filter(x => x.id && x.text);
    if (!stories.length) throw new BadRequest('no saved stories to frame an answer from yet');
    const count = Math.max(1, Math.min(5, parseInt(b.count, 10) || 3));
    return { question: v.questionText(b.question), stories, count };
  }), requireCap('llm'), requireAi, wrap(async (req, res) => {
    // A Grok id this proxy does not list still gets Grok (through devin) rather than a non-Grok model.
    const want = req.body?.model;
    const model = (await models.resolve(want))
      || (/grok/i.test(String(want || '')) ? await models.resolve(GROK_FALLBACK) : undefined)
      || (await models.resolve(behavioural.REWRITE_MODEL));
    res.json(await behavioural.frameFromStories({ ...req.clean, model }));
  }));

  // The candidate's own STAR answer, reframed to score 10/10 (Today → Googleyness STAR).
  app.post('/api/behavioural/star-rewrite', scoreLimit, validateBody(b => {
    const a = b.answer && typeof b.answer === 'object' ? b.answer : {};
    const part = k => String(a[k] ?? '').trim().slice(0, 3000);
    const answer = { s: part('s'), t: part('t'), a: part('a'), r: part('r') };
    if (!answer.s && !answer.a) throw new BadRequest('write at least the situation and your actions first');
    return { question: v.questionText(b.question), answer };
  }), requireCap('llm'), requireAi, wrap(async (req, res) => {
    const model = (await models.resolve(req.body?.model)) || (await models.resolve(behavioural.REWRITE_MODEL));
    const reviewModel = await models.resolve(req.body?.reviewModel);
    res.json(await behavioural.starRewrite({ ...req.clean, model, reviewModel }));
  }));

}
