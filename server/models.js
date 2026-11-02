import { fetchWithTimeout, UpstreamError } from './http.js';
import { log } from './log.js';

const TTL_MS = 10 * 60 * 1000;
let cache = { at: 0, ids: [] };

/**
 * The model list is fetched from the proxy and cached. It is also the
 * allowlist: a client may choose a model, but only one the proxy actually
 * offers, so a caller cannot invent an id or point the app somewhere else.
 */
export async function listModels() {
  if (cache.ids.length && Date.now() - cache.at < TTL_MS) return cache.ids;
  const base = process.env.LLM_BASE_URL;
  if (!base) throw new UpstreamError('LLM_BASE_URL not configured', 503);

  const res = await fetchWithTimeout(`${base}/v1/models`, {
    headers: {
      Authorization: `Bearer ${process.env.LLM_API_KEY}`,
      'User-Agent': 'interview-sim/1.0',
    },
  }, 20_000);
  if (!res.ok) {
    log.error('model list failed', { status: res.status });
    throw new UpstreamError(`could not list models (${res.status})`, 502);
  }
  const json = await res.json();
  const ids = (json?.data || [])
    .map(m => m?.id)
    .filter(id => typeof id === 'string' && id.length < 120)
    .sort();
  if (ids.length) cache = { at: Date.now(), ids };
  return ids;
}

/** Groups the flat list into something a picker can render sensibly. */
export function group(ids) {
  const family = id => {
    const l = id.toLowerCase();
    if (/claude|sonnet|opus|haiku|fable/.test(l)) return 'Claude';
    if (l.startsWith('gemini')) return 'Gemini';
    if (l.startsWith('gpt') || l.startsWith('o1') || l.startsWith('o3') || l.includes('codex')) return 'OpenAI';
    if (l.startsWith('grok')) return 'Grok';
    return 'Other';
  };
  const out = new Map();
  for (const id of ids) {
    const f = family(id);
    if (!out.has(f)) out.set(f, []);
    out.get(f).push(id);
  }
  const order = ['Claude', 'Gemini', 'OpenAI', 'Grok', 'Other'];
  return order.filter(f => out.has(f)).map(f => ({ family: f, models: out.get(f) }));
}

/**
 * Validates a caller-supplied model. Returns undefined when none was given,
 * so callers fall back to the server default.
 */
export async function resolve(requested) {
  if (requested === undefined || requested === null || requested === '') return undefined;
  if (typeof requested !== 'string' || requested.length > 120) return undefined;
  let ids = [];
  try {
    ids = await listModels();
  } catch {
    return undefined;   // cannot verify, so fall back rather than trust input
  }
  return ids.includes(requested) ? requested : undefined;
}
