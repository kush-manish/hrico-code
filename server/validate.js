import { BadRequest } from './errors.js';

export { BadRequest };

// LeetCode slugs are lowercase alphanumeric with hyphens.
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// Languages LeetCode's judge accepts.
const LANGS = new Set([
  'python3', 'python', 'java', 'cpp', 'c', 'csharp', 'javascript', 'typescript',
  'golang', 'ruby', 'swift', 'kotlin', 'scala', 'rust', 'php', 'racket',
  'erlang', 'elixir', 'dart',
]);

const MAX_CODE = 64 * 1024;
const MAX_INPUT = 16 * 1024;

export function slug(value, field = 'slug') {
  if (typeof value !== 'string' || !SLUG.test(value) || value.length > 120) {
    throw new BadRequest(`invalid ${field}`);
  }
  return value;
}

export function lang(value) {
  if (typeof value !== 'string' || !LANGS.has(value)) {
    throw new BadRequest('unsupported lang');
  }
  return value;
}

export function code(value) {
  if (typeof value !== 'string' || !value.trim()) throw new BadRequest('code is required');
  if (value.length > MAX_CODE) throw new BadRequest('code too large (64 KB max)');
  return value;
}

export function questionId(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0 || n > 10_000_000) throw new BadRequest('invalid questionId');
  return n;
}

export function dataInput(value) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') throw new BadRequest('dataInput must be a string');
  if (value.length > MAX_INPUT) throw new BadRequest('dataInput too large (16 KB max)');
  return value;
}

export function secret(value, field, max = 8192, { required = true } = {}) {
  if ((value === undefined || value === null || value === '') && !required) return '';
  if (typeof value !== 'string' || !value.trim()) throw new BadRequest(`${field} is required`);
  const clean = value.trim();
  if (/\r|\n/.test(clean)) throw new BadRequest(`${field} must be a single line`);
  if (clean.length > max) throw new BadRequest(`${field} is too long`);
  return clean;
}

/**
 * The chat endpoint previously forwarded any caller-supplied array straight to
 * the model, which made it an open LLM proxy. Shape, roles, count and size are
 * all bounded here.
 */
export function messages(value, { max = 40, total: cap = 24_000 } = {}) {
  if (!Array.isArray(value)) throw new BadRequest('messages must be an array');
  if (value.length === 0) throw new BadRequest('messages cannot be empty');
  if (value.length > max) throw new BadRequest(`too many messages (${max} max)`);
  let total = 0;
  return value.map((m, i) => {
    if (!m || typeof m !== 'object') throw new BadRequest(`messages[${i}] must be an object`);
    if (m.role !== 'user' && m.role !== 'assistant') {
      throw new BadRequest(`messages[${i}].role must be user or assistant`);
    }
    if (typeof m.content !== 'string') throw new BadRequest(`messages[${i}].content must be a string`);
    total += m.content.length;
    if (total > cap) throw new BadRequest('conversation too long');
    return { role: m.role, content: m.content.slice(0, 8000) };
  });
}

export function persona(value, allowed) {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !allowed.includes(value)) throw new BadRequest('unknown persona');
  return value;
}

const MAX_QUESTION = 400;

export function categoryId(value, allowed) {
  if (typeof value !== 'string' || !allowed.includes(value)) {
    throw new BadRequest('unknown category');
  }
  return value;
}

/**
 * The behavioural question travels with each turn so the interviewer stays on
 * brief. It is bounded here rather than trusted, since it reaches the model.
 */
export function questionText(value) {
  if (typeof value !== 'string' || !value.trim()) throw new BadRequest('question is required');
  if (value.length > MAX_QUESTION) throw new BadRequest('question too long');
  return value.trim();
}

export function timeLeft(value) {
  if (value === undefined || value === null) return undefined;
  const s = String(value);
  if (s.length > 12) throw new BadRequest('invalid timeLeft');
  return s;
}

/**
 * A candidate profile the browser sends back with an interview request. It
 * came from our own extractor, but it has been through localStorage since,
 * so it is re-normalised and size-capped rather than trusted.
 */
export function profile(value) {
  if (value == null) return null;
  if (typeof value !== 'object') throw new BadRequest('profile must be an object');
  if (JSON.stringify(value).length > 12_000) throw new BadRequest('profile too large');
  return value;
}
