/** Talk to a Googler: topics, the streamed call, feedback. */
import { log } from '../log.js';
import * as v from '../validate.js';
import { BadRequest } from '../errors.js';
import * as models from '../models.js';
import { newInterviewer, greeting } from '../interviewer.js';
import * as talk from '../talk.js';
import { readLimit, llmLimit, scoreLimit, talkScoreLimit, requireCap, requireAi, validateBody, wrap, cleanProfile } from '../middleware.js';

export function mount(app) {
  // ----------------------------------------------------------------- talk ---

  app.get('/api/talk/topics', readLimit, (_req, res) => res.json(
    Object.entries(talk.TOPICS).map(([id, t]) => ({ id, label: t.label, hint: t.hint }))));

  /** Streams the Googler's reply as SSE: data: {"d": "..."} chunks, then data: [DONE]. */
  app.post('/api/talk/stream', llmLimit, validateBody(b => ({
    topic: Object.keys(talk.TOPICS).includes(b.topic) ? b.topic : 'intro',
    messages: Array.isArray(b.messages) && b.messages.length ? v.messages(b.messages) : [],
    interviewer: b.interviewer && typeof b.interviewer === 'object' ? {
      name: String(b.interviewer.name || 'Sam Patel').slice(0, 60), firstName: String(b.interviewer.firstName || 'Sam').slice(0, 30),
      team: String(b.interviewer.team || 'Maps').slice(0, 60), work: String(b.interviewer.work || 'routing').slice(0, 120),
      years: Number(b.interviewer.years) || 4, office: String(b.interviewer.office || 'King’s Cross, London').slice(0, 60),
    } : null,
    profile: cleanProfile(b.profile),
  })), requireCap('llm'), requireAi, wrap(async (req, res) => {
    const interviewer = req.clean.interviewer || newInterviewer();
    const ac = new AbortController();
    req.on('close', () => ac.abort());
    const sse = () => {
      res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    };
    let served = null;
    const turn = talk.turn({
      ...req.clean, interviewer, requestedModel: req.body?.model, signal: ac.signal,
      onModel: model => { served = model; res.set('X-Talk-Model', model); sse(); res.flushHeaders?.(); },
    });
    // Nothing is written before the first passing chunk, so a failure before
    // then still becomes a normal JSON error response.
    try {
      for await (const d of turn) res.write(`data: ${JSON.stringify({ d })}\n\n`);
    } catch (err) {
      // Before the first chunk nothing has been sent, so it stays a normal
      // JSON error. After it, the only way to say so is an error event.
      if (!res.headersSent) throw err;
      log.warn('talk turn failed mid-stream', { model: served, err: err.message });
      res.write(`data: ${JSON.stringify({ error: err.message || 'the reply was cut off' })}\n\n`);
    }
    if (!served) { if (!res.headersSent) sse(); }
    log.info('talk turn', { model: served, requested: req.body?.model || null, turns: req.clean.messages.length });
    res.write('data: [DONE]\n\n');
    res.end();
  }));

  app.post('/api/talk/feedback', talkScoreLimit, validateBody(b => {
    const messages = v.messages(b.messages);
    if (!messages.some(m => m.role === 'user')) throw new BadRequest('nothing to review — you have not said anything yet');
    return { messages };
  }), requireCap('llm'), requireAi, wrap(async (req, res) => {
    const model = await models.resolve(req.body?.model);
    res.json(await talk.feedback({ ...req.clean, model }));
  }));

  /** The AlgoMaster 300, section by section, resolved against the local set. */
}
