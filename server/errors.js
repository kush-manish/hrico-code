/**
 * The error vocabulary of the service. Every failure a route can raise is
 * one of these, each carrying the HTTP status it maps to and whether its
 * message is safe to show a client. The handler at the bottom is the only
 * place a status code is turned into a response.
 */
export class AppError extends Error {
  /**
   * @param {string} message
   * @param {number} status
   * @param {{ code?: string, expose?: boolean, cause?: unknown }} [opts]
   */
  constructor(message, status = 500, { code = 'internal', expose = status < 500, cause } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = this.constructor.name;
    this.status = status;
    this.code = code;
    this.expose = expose;
  }
}

export class BadRequest extends AppError {
  constructor(message = 'bad request', opts) { super(message, 400, { code: 'bad_request', ...opts }); }
}
export class NotFound extends AppError {
  constructor(message = 'not found', opts) { super(message, 404, { code: 'not_found', ...opts }); }
}
export class Conflict extends AppError {
  constructor(message = 'conflict', opts) { super(message, 409, { code: 'conflict', ...opts }); }
}
export class TooLarge extends AppError {
  constructor(message = 'payload too large', opts) { super(message, 413, { code: 'too_large', ...opts }); }
}
export class Unavailable extends AppError {
  constructor(message = 'feature unavailable', opts) { super(message, 503, { code: 'unavailable', expose: true, ...opts }); }
}
/** A dependency (LLM proxy, LeetCode, speech server) failed or timed out. */
export class UpstreamError extends AppError {
  constructor(message = 'upstream failure', status = 502, opts) {
    super(message, status, { code: status === 504 ? 'upstream_timeout' : 'upstream', expose: true, ...opts });
  }
}

/** Wraps an async route so a rejection reaches the error handler. */
export const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/**
 * Express error middleware. Client mistakes are logged at warn, faults at
 * error. Messages from below the 500 line are shown; anything else is
 * replaced, because upstream text can echo cookies or keys.
 */
export function errorHandler(log) {
  // eslint-disable-next-line no-unused-vars
  return (err, req, res, _next) => {
    const status = err instanceof AppError ? err.status : Number(err?.status) || 500;
    const expose = err instanceof AppError ? err.expose : status < 500;
    // The body parser's own errors carry a status but no code; name them, so a
    // client can tell a malformed or oversized request from a server fault.
    if (!(err instanceof AppError) && !err?.code && status < 500) {
      const PARSER = { 'entity.parse.failed': ['bad_json', 'The request body is not valid JSON.'], 'entity.too.large': ['too_large', 'The request is too large.'] };
      const [code, message] = PARSER[err.type] || ['bad_request', err.message];
      err = Object.assign(new AppError(message, status, { code, expose }), { stack: err.stack });
    }
    log[status >= 500 ? 'error' : 'warn']('request failed', {
      id: req.id, path: req.path, status, code: err?.code || 'internal', err: err?.message,
      ...(status >= 500 && err?.stack ? { stack: String(err.stack).split('\n').slice(0, 4).join(' | ') } : {}),
    });
    if (res.headersSent) { try { res.end(); } catch { /* already gone */ } return; }
    // Behind Cloudflare, any 5xx body is swapped for Cloudflare's own page, so
    // the reason (LeetCode unreachable, model timed out…) never reached the
    // user. A dependency failure (or a feature switched off) is sent as 424
    // there, which passes through; the JSON still carries the real code.
    const viaCloudflare = Boolean(req.headers['cf-ray']);
    const sent = viaCloudflare && expose && status >= 500 && /^(upstream|unavailable)/.test(String(err?.code || '')) ? 424 : status;
    res.status(sent).json({ error: expose ? err.message : 'internal error', code: err?.code || 'internal', requestId: req.id });
  };
}
