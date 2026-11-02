/**
 * The one way this service talks to the language-model proxy.
 *
 * Every feature used to build its own request, parse its own JSON and
 * classify its own failures, nine times over. This client owns the wire
 * format, timeouts, error classification and the JSON discipline models on
 * this proxy need (fences, chatter around the object, the odd model that
 * answers a JSON request with prose), so a feature module only says what it
 * wants and what shape it expects back.
 */
import { config } from '../config.js';
import { UpstreamError, Unavailable } from '../errors.js';
import { log as defaultLog } from '../log.js';

/** Reasoning models (Qwen3, DeepSeek-R1, …) put their thinking in <think> blocks; it is never the answer. */
export function stripThinking(text) {
  return String(text || '').replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/^[\s\S]*?<\/think>/i, '').trim();
}

/** The first balanced {...} in text, skipping braces inside strings. */
function firstObject(s) {
  for (let start = s.indexOf('{'); start >= 0; start = s.indexOf('{', start + 1)) {
    let depth = 0, inStr = false, esc = false;
    for (let i = start; i < s.length; i++) {
      const ch = s[i];
      if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue; }
      if (ch === '"') inStr = true;
      else if (ch === '{') depth++;
      else if (ch === '}' && --depth === 0) return s.slice(start, i + 1);
    }
  }
  return '';
}

/** Small local models' usual slips: curly quotes, trailing commas, // comments. */
function repair(c) {
  return c.replace(/[\u201C\u201D]/g, '"').replace(/[\u2018\u2019]/g, "'")
    .replace(/^\s*\/\/.*$/gm, '').replace(/,\s*([}\]])/g, '$1');
}

/** Pull the first JSON object out of text that may be fenced, chatty or slightly malformed. */
export function parseJson(text) {
  const s = stripThinking(text);
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(s);
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  const candidates = [fenced?.[1], s, firstObject(s), a >= 0 && b > a ? s.slice(a, b + 1) : ''];
  for (const fix of [x => x, repair]) {
    for (const c of candidates) {
      if (!c) continue;
      try { const v = JSON.parse(fix(c)); if (v && typeof v === 'object' && !Array.isArray(v)) return v; } catch { /* try the next shape */ }
    }
  }
  throw new Error('no JSON object found');
}

/** A score as small models write it: 3, "3", "3/4", "3 out of 4", "Score: 3". NaN when absent. */
export function num(v) {
  if (typeof v === 'number') return v;
  const m = /-?\d+(?:\.\d+)?/.exec(String(v ?? ''));
  return m ? Number(m[0]) : NaN;
}

/** Could a 400 be about the model (unknown, retired, not allowed) rather than this request's content? */
export function isModelRejection(text) {
  const t = String(text || '');
  if (/context[_ ]?(length|window)|max(imum)?[_ ]?tokens|too long|too many tokens|safety/i.test(t)
    && !/model[_ ]?not[_ ]?found|invalid model|unknown model|no such model/i.test(t)) return false;
  return true;
}

export class LlmClient {
  /**
   * @param {{ cfg?: typeof config.llm, fetchImpl?: typeof fetch, log?: typeof defaultLog }} [deps]
   */
  constructor({ cfg = config.llm, fetchImpl = globalThis.fetch, log = defaultLog } = {}) {
    this.cfg = cfg;
    this.fetch = fetchImpl;
    this.log = log;
  }

  get configured() { return Boolean(this.cfg.baseUrl && this.cfg.apiKey && this.cfg.model); }

  /** The model used when a caller names none: the configured one, or the
   *  fallback that last worked after the proxy rejected it. */
  get defaultModel() {
    // A fallback is remembered for a while, not for ever: a model the proxy
    // rejected during a hiccup gets another chance later.
    if (this.workingDefault && Date.now() - this.workingAt > 30 * 60_000) this.workingDefault = null;
    return this.workingDefault || this.cfg.model;
  }

  /** Models to try, in order, when the proxy rejects a model outright (400/404),
   *  for example after the proxy retires the one in .env. */
  fallbacks(tried) {
    const list = String(process.env.LLM_FALLBACK_MODELS || 'gemini-3.8-flash-high,claude-sonnet-4-6,claude-haiku-4-5,gemini-3.7-flash-medium')
      .split(',').map(s => s.trim()).filter(Boolean);
    return list.filter(m => !tried.includes(m));
  }

  /** Raw request. Resolves to the upstream Response (ok) or throws a typed error.
   *  A model the proxy rejects is swapped for a working fallback, once per model. */
  async request(opts) {
    // Naming the configured model explicitly (a saved picker choice) still uses
    // the fallback that replaced it, instead of paying for the rejection again.
    const first = !opts.model || opts.model === this.cfg.model ? this.defaultModel : opts.model;
    const tried = [first];
    for (;;) {
      try {
        const res = await this.requestOnce({ ...opts, model: tried[tried.length - 1] });
        const used = tried[tried.length - 1];
        if (tried.length > 1 && (!opts.model || opts.model === this.cfg.model)) { this.workingDefault = used; this.workingAt = Date.now(); }
        return res;
      } catch (err) {
        const next = err?.modelRejected ? this.fallbacks(tried)[0] : null;
        if (!next || tried.length >= 4) throw err;
        this.log.warn('llm model rejected, trying a fallback', { where: opts.where || 'llm', rejected: tried[tried.length - 1], next });
        tried.push(next);
      }
    }
  }

  async requestOnce({ messages, model, temperature = 0.4, maxTokens = 600, stream = false, timeoutMs, signal, where = 'llm' }) {
    if (!this.cfg.baseUrl || !this.cfg.apiKey) throw new Unavailable('the language model is not configured on this server');
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    signal?.addEventListener('abort', onAbort, { once: true });
    const timer = setTimeout(() => controller.abort(), timeoutMs ?? this.cfg.timeoutMs);
    try {
      const res = await this.fetch(`${this.cfg.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.cfg.apiKey}`,
          'User-Agent': this.cfg.userAgent,
        },
        body: JSON.stringify({ model: model || this.cfg.model, temperature, max_tokens: maxTokens, stream, messages }),
        signal: controller.signal,
      });
      if (!res.ok) {
        this.log.error('llm error', { where, model: model || this.cfg.model, status: res.status });
        const status = res.status === 429 ? 429 : 502;
        const e = new UpstreamError(res.status === 429 ? 'the model is rate-limited, try again shortly' : `model request failed (${res.status})`, status);
        // Only a rejection of the model itself is worth a fallback. A 400 for
        // this request's content (too long, bad message) would fail on every
        // model, and must not switch the server's default for everyone.
        let detail = '';
        if (res.status === 400) { try { detail = (await res.text()).slice(0, 2000); } catch { /* body unreadable */ } }
        e.modelRejected = res.status === 404 || (res.status === 400 && isModelRejection(detail));
        throw e;
      }
      if (stream) {
        // The caller consumes the body; the deadline stops covering it here.
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
      }
      return res;
    } catch (err) {
      if (err instanceof UpstreamError || err instanceof Unavailable) throw err;
      if (err.name === 'AbortError') {
        if (signal?.aborted) throw err;                                // the client went away; not a fault
        throw new UpstreamError(`model request timed out after ${timeoutMs ?? this.cfg.timeoutMs}ms`, 504);
      }
      throw new UpstreamError(`model request failed: ${err.message}`, 502, { cause: err });
    } finally {
      if (!stream) { clearTimeout(timer); signal?.removeEventListener('abort', onAbort); }
    }
  }

  /** A completed reply's text. */
  async chat(opts) {
    const res = await this.request({ ...opts, stream: false });
    const json = await res.json();
    const choice = json.choices?.[0];
    // A reply cut off at the token budget is the usual reason JSON will not
    // parse; say so in the log instead of leaving it to be guessed.
    if (choice?.finish_reason === 'length') this.log.warn(`${opts.where || 'llm'}: reply truncated at max_tokens`, { model: opts.model || this.cfg.model, maxTokens: opts.maxTokens });
    return stripThinking(choice?.message?.content || '');
  }

  /**
   * A reply that must be JSON. `parse` turns the object into the caller's
   * shape and may throw to reject it. If the chosen model answers with prose
   * (the Claude models on this proxy do), the default model is tried once.
   */
  async chatJson({ parse = x => x, where = 'llm', ...opts }) {
    const own = opts.model && opts.model !== this.defaultModel && opts.model !== this.cfg.model;
    // One model only: ask it once more, plainly, for the object alone — small local models often comply the second time.
    const attempts = own ? [opts.model, this.defaultModel] : [opts.model, opts.model];
    let lastErr = null, lastSample = '';
    for (const model of attempts) {
      const again = lastErr && model === opts.model && !own;
      const messages = again ? [...opts.messages, { role: 'user', content: 'Reply with only the JSON object, no other text.' }] : opts.messages;
      const text = await this.chat({ ...opts, messages, model, where });
      try { return parse(parseJson(text)); } catch (err) {
        lastErr = err; lastSample = text.slice(0, 200);
        this.log.warn(`${where}: reply was not the expected JSON`, { model: model || 'default', err: err.message, sample: lastSample, retrying: model !== attempts[attempts.length - 1] });
      }
    }
    throw new UpstreamError(`the model did not return usable ${where} output`, 502, { cause: lastErr });
  }

  /** Streams content deltas of a reply, one string per chunk. */
  async *stream(opts) {
    const res = await this.request({ ...opts, stream: true });
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '', think = '', thinking = null;
    try {
      for (;;) {
        // A reply that stalls mid-stream would otherwise hold the request open
        // for ever: give up when no chunk arrives within the request deadline.
        let idle;
        const stalled = new Promise((_, reject) => { idle = setTimeout(() => reject(new UpstreamError('model reply stalled', 504)), opts.timeoutMs ?? this.cfg.timeoutMs); });
        let chunk;
        try { chunk = await Promise.race([reader.read(), stalled]); } finally { clearTimeout(idle); }
        const { value, done } = chunk;
        if (done) { if (thinking === null && think) yield think; break; }
        buf += dec.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (payload === '[DONE]') { if (thinking === null && think) yield think; return; }
          let delta;
          try { delta = JSON.parse(payload).choices?.[0]?.delta?.content; } catch { continue; }
          if (!delta) continue;
          // Hide a reasoning model's <think>…</think> block from the reader.
          think += delta;
          if (thinking === null) {
            const t = think.trimStart();
            if (t.length < 7 && '<think>'.startsWith(t)) continue;      // not sure yet
            thinking = t.startsWith('<think>');
            if (!thinking) { yield think; think = ''; continue; }
          }
          if (thinking) {
            const end = think.indexOf('</think>');
            if (end < 0) continue;
            thinking = false; delta = think.slice(end + 8).replace(/^\s+/, ''); think = '';
            if (delta) yield delta;
            continue;
          }
          think = ''; yield delta;
        }
      }
    } finally {
      try { reader.cancel(); } catch { /* already closed */ }
    }
  }
}

export const llm = new LlmClient();
