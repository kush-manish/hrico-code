import { randomUUID } from 'crypto';

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const threshold = LEVELS[process.env.LOG_LEVEL || 'info'] ?? LEVELS.info;

// Anything matching these is redacted before it can reach the log stream.
const SECRET_KEYS = /^(.*(token|secret|key|session|cookie|password|authorization).*)$/i;

function scrub(value, depth = 0) {
  if (depth > 4 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.slice(0, 20).map(v => scrub(v, depth + 1));
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = SECRET_KEYS.test(k) ? '[redacted]' : scrub(v, depth + 1);
  }
  return out;
}

function emit(level, msg, fields = {}) {
  if (LEVELS[level] < threshold) return;
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    msg,
    ...scrub(fields),
  });
  (level === 'error' || level === 'warn' ? process.stderr : process.stdout).write(line + '\n');
}

export const log = {
  debug: (m, f) => emit('debug', m, f),
  info: (m, f) => emit('info', m, f),
  warn: (m, f) => emit('warn', m, f),
  error: (m, f) => emit('error', m, f),
};

/** Attaches a request id and logs one structured line per completed request. */
export function requestLogger(req, res, next) {
  const id = req.headers['x-request-id'] || randomUUID();
  req.id = id;
  res.setHeader('X-Request-Id', id);
  const started = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    log.info('request', {
      id,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      ms: Math.round(ms),
    });
  });
  next();
}
