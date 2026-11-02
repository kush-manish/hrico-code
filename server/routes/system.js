/** Health, readiness, status, models, the interviewer identity and speech. */
import { config } from '../config.js';
import { capabilities } from '../config.js';
import { describeMissing } from '../config.js';
import * as models from '../models.js';
import * as v from '../validate.js';
import { saveCredentials, syncFromDisk, validateCredentials } from '../leetcode.js';
import { newInterviewer, greeting } from '../interviewer.js';
import * as tts from '../tts.js';
import { chat, personas, generateSolution, cacheSize } from '../agent.js';
import { readLimit, ttsLimit, requireCap, requireAi, wrap, STARTED_AT } from '../middleware.js';
import { llm } from '../llm/client.js';

export function mount(app) {
  // ---------------------------------------------------------------- health ---

  app.get('/healthz', (_req, res) => res.set('Cache-Control', 'no-store').json({ ok: true }));

  app.get('/readyz', (_req, res) => {
    res.set('Cache-Control', 'no-store');     // a probe must never see a cached answer
    syncFromDisk();
    const caps = capabilities();
    const ready = caps.leetcode && caps.llm;
    res.status(ready ? 200 : 503).json({
      ok: ready,
      uptimeSeconds: Math.floor((Date.now() - STARTED_AT) / 1000),
      capabilities: caps,
      missing: describeMissing(),
      solutionCache: cacheSize(),
      version: config.appVersion,
    });
  });

  /**
   * What the UI needs to know, and nothing more. Unlike /readyz this never names
   * unset environment variables, so it is safe to expose to the page.
   */
  app.get('/api/models', readLimit, requireCap('llm'), requireAi, wrap(async (_req, res) => {
    const ids = await models.listModels();
    // After the proxy rejected the configured model, the fallback in use is the real default.
    res.json({ groups: models.group(ids), default: llm.defaultModel || null });
  }));

  /** A fresh interviewer per session; the client holds it and sends it back. */
  app.get('/api/interviewer', readLimit, (_req, res) => {
    const iv = newInterviewer();
    res.json({ interviewer: iv, greeting: greeting(iv) });
  });

  app.get('/api/tts/voices', readLimit, wrap(async (_req, res) => {
    await tts.checkKokoro();
    res.json({
      available: tts.isAvailable(),
      voices: tts.allVoices(),
      default: tts.defaultVoice(),
    });
  }));

  app.post('/api/tts', ttsLimit, wrap(async (req, res) => {
    const { audio, voice, cached } = await tts.synthesise(req.body?.text, req.body?.voice, req.body?.pace);
    res.set('Content-Type', 'audio/wav');
    res.set('Cache-Control', 'no-store');
    res.set('X-Voice', voice);
    res.set('X-Cached', String(cached));
    res.send(audio);
  }));

  app.get('/api/status', readLimit, (_req, res) => {
    syncFromDisk();
    res.json({
      capabilities: { ...capabilities(), tts: tts.isAvailable() },
      version: config.appVersion,
    });
  });

  app.get('/api/leetcode/credentials', readLimit, wrap(async (_req, res) => {
    const result = await validateCredentials();
    res.json(result);
  }));

  app.post('/api/leetcode/credentials', readLimit, wrap(async (req, res) => {
    const result = await saveCredentials({
      session: v.secret(req.body?.session, 'LEETCODE_SESSION'),
      csrf: v.secret(req.body?.csrf, 'LEETCODE_CSRF', 512),
      cfClearance: v.secret(req.body?.cfClearance, 'LEETCODE_CF_CLEARANCE', 8192, { required: false }),
      userAgent: v.secret(req.body?.userAgent, 'LEETCODE_UA', 512, { required: false }),
    });
    res.json(result);
  }));

  app.post('/api/leetcode/credentials/validate', readLimit, wrap(async (_req, res) => {
    res.json(await validateCredentials());
  }));


}
