/** HFT hub: firm catalogue, levels.fyi pay per location, and the streamed AI coach. */
import { log } from '../log.js';
import * as v from '../validate.js';
import { BadRequest } from '../errors.js';
import { FIRMS, LOCATIONS, TYPE_LABELS, cityById } from '../hft-firms.js';
import { pay } from '../levels.js';
import { question } from '../questions.js';
import * as hft from '../hft.js';
import { readLimit, llmLimit, requireCap, requireAi, validateBody, wrap } from '../middleware.js';

export function mount(app) {
  app.get('/api/hft/catalog', readLimit, (_req, res) => {
    res.set('Cache-Control', 'no-cache');
    res.json({
      locations: LOCATIONS,
      types: TYPE_LABELS,
      firms: FIRMS.map(f => ({
        ...f,
        // Only questions the site can open in its own editor link there; the rest go to LeetCode.
        coding: f.coding.map(slug => {
          const q = question(slug);
          return { slug, title: q?.title || slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), difficulty: q?.difficulty || '', local: Boolean(q) };
        }),
      })),
    });
  });

  /**
   * Pay for every firm with an office in one city. Cached pairs answer
   * immediately; with ?fresh=1 missing ones are fetched (serially, politely).
   */
  app.get('/api/hft/pay/:city', readLimit, wrap(async (req, res) => {
    const city = cityById(String(req.params.city || ''));
    if (!city) throw new BadRequest('unknown city');
    const firms = FIRMS.filter(f => f.cities.includes(city.id));
    const allowNetwork = req.query.fresh === '1';
    const rows = await Promise.all(firms.map(async f => ({ firm: f.id, ...(await pay(f.levels, city.levels, { allowNetwork })) })));
    res.json({ city: city.id, name: city.name, currency: city.currency, rows });
  }));

  app.post('/api/hft/coach', llmLimit, validateBody(b => ({
    mode: Object.keys(hft.MODES).includes(b.mode) ? b.mode : 'coach',
    firm: typeof b.firm === 'string' && /^[a-z0-9-]{1,40}$/.test(b.firm) ? b.firm : '',
    messages: v.messages(b.messages),
    payNote: typeof b.payNote === 'string' ? b.payNote.slice(0, 800) : '',
    profile: b.profile && typeof b.profile === 'object' && typeof b.profile.summary === 'string'
      ? { summary: b.profile.summary.slice(0, 1200) } : null,
  })), requireCap('llm'), requireAi, wrap(async (req, res) => {
    const ac = new AbortController();
    res.on('close', () => { if (!res.writableEnded) ac.abort(); });
    let served = null;
    const sse = () => res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    const stream = hft.coach({
      ...req.clean, requestedModel: req.body?.model, signal: ac.signal,
      // Only the box owner gets the built-in personal persona as a fallback.
      owner: req.user?.role === 'admin',
      onModel: m => { served = m; res.set('X-Coach-Model', m); sse(); res.flushHeaders?.(); },
    });
    for await (const d of stream) res.write(`data: ${JSON.stringify({ d })}\n\n`);
    if (!res.headersSent) sse();
    log.info('hft coach turn', { model: served, mode: req.clean.mode, firm: req.clean.firm, turns: req.clean.messages.length });
    res.write('data: [DONE]\n\n');
    res.end();
  }));
}
