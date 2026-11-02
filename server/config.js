/**
 * Configuration, read once. Every other module takes what it needs from
 * here instead of reaching into process.env, so the full set of knobs is
 * visible in one place and a test can construct a config without touching
 * the environment.
 */
import { loadEnv } from './env.js';

loadEnv();

const env = (key, fallback = '') => (process.env[key] === undefined ? fallback : String(process.env[key]));
const list = (key, fallback) => env(key, fallback).split(',').map(s => s.trim()).filter(Boolean);
const int = (key, fallback) => { const n = Number.parseInt(env(key, ''), 10); return Number.isFinite(n) ? n : fallback; };

export function buildConfig() {
  return Object.freeze({
    nodeEnv: env('NODE_ENV', 'development'),
    appVersion: env('APP_VERSION', 'dev'),
    port: int('PORT', 9225),
    bind: env('HOST', env('BIND', '127.0.0.1')),
    llm: Object.freeze({
      baseUrl: env('LLM_BASE_URL').replace(/\/+$/, ''),
      apiKey: env('LLM_API_KEY'),
      model: env('LLM_MODEL'),
      userAgent: 'interview-sim/1.0',
      // A live call needs words in seconds; these are tried in order.
      talkModels: list('TALK_MODELS', 'gemini-3.5-flash-lite'),
      timeoutMs: int('LLM_TIMEOUT_MS', 60_000),
      longTimeoutMs: int('LLM_LONG_TIMEOUT_MS', 90_000),
    }),
    leetcode: Object.freeze({
      session: env('LEETCODE_SESSION'),
      csrf: env('LEETCODE_CSRF'),
      cfClearance: env('LEETCODE_CF_CLEARANCE'),
    }),
    tts: Object.freeze({
      kokoroUrl: env('KOKORO_URL', 'http://127.0.0.1:9226'),
    }),
  });
}

export const config = buildConfig();

/** Feature gates: a missing credential disables one feature, not the app. */
export function capabilities(cfg) {
  const leetcode = cfg?.leetcode || {
    session: process.env.LEETCODE_SESSION,
    csrf: process.env.LEETCODE_CSRF,
  };
  const llm = cfg?.llm || {
    baseUrl: process.env.LLM_BASE_URL,
    apiKey: process.env.LLM_API_KEY,
    model: process.env.LLM_MODEL,
  };
  return {
    leetcode: Boolean(leetcode.session && leetcode.csrf),
    llm: Boolean(llm.baseUrl && llm.apiKey && llm.model),
  };
}

export function describeMissing(cfg) {
  const leetcode = cfg?.leetcode || {
    session: process.env.LEETCODE_SESSION,
    csrf: process.env.LEETCODE_CSRF,
  };
  const llm = cfg?.llm || {
    baseUrl: process.env.LLM_BASE_URL,
    apiKey: process.env.LLM_API_KEY,
    model: process.env.LLM_MODEL,
  };
  const missing = [];
  if (!leetcode.session) missing.push('LEETCODE_SESSION');
  if (!leetcode.csrf) missing.push('LEETCODE_CSRF');
  if (!llm.baseUrl) missing.push('LLM_BASE_URL');
  if (!llm.apiKey) missing.push('LLM_API_KEY');
  if (!llm.model) missing.push('LLM_MODEL');
  return missing;
}
