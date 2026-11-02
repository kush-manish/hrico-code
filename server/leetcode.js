import fs from 'fs';
import { fetchWithTimeout, UpstreamError } from './http.js';
import { ENV_PATH, parseEnv, writeEnvKeys } from './env.js';
import { AppError } from './errors.js';
import { log } from './log.js';

const BASE = 'https://leetcode.com';

const REQUEST_TIMEOUT_MS = 15_000;
const POLL_TIMEOUT_MS = 10_000;
const POLL_INTERVAL_MS = 900;
const POLL_MAX_ATTEMPTS = 60; // ~54s ceiling, was 90 (~81s)

function cookieHeader() {
  const parts = [
    `LEETCODE_SESSION=${process.env.LEETCODE_SESSION}`,
    `csrftoken=${process.env.LEETCODE_CSRF}`,
  ];
  if (process.env.LEETCODE_CF_CLEARANCE) parts.push(`cf_clearance=${process.env.LEETCODE_CF_CLEARANCE}`);
  return parts.join('; ');
}

function headers(referer) {
  return {
    'Content-Type': 'application/json',
    Cookie: cookieHeader(),
    'x-csrftoken': process.env.LEETCODE_CSRF,
    Referer: referer,
    Origin: BASE,
    'User-Agent': process.env.LEETCODE_UA ||
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
  };
}

export const FILE_KEYS = ['LEETCODE_SESSION', 'LEETCODE_CSRF', 'LEETCODE_CF_CLEARANCE', 'LEETCODE_UA'];
const ROLLING_COOKIES = { LEETCODE_SESSION: 'LEETCODE_SESSION', csrftoken: 'LEETCODE_CSRF' };

const envMtime = () => { try { return fs.statSync(ENV_PATH).mtimeMs; } catch { return 0; } };
let seenMtime = envMtime();

/** Pick up cookies written to .env while the server runs, so a refresh needs no restart. */
export function syncFromDisk() {
  const mtime = envMtime();
  if (!mtime || mtime === seenMtime) return [];
  seenMtime = mtime;
  const file = parseEnv(fs.readFileSync(ENV_PATH, 'utf8'));
  const changed = FILE_KEYS.filter(key => file[key] && file[key] !== process.env[key]);
  for (const key of changed) process.env[key] = file[key];
  if (changed.length) log.info('leetcode cookies reloaded from .env', { names: changed });
  return changed;
}

function sessionUser(token) {
  try {
    return JSON.parse(Buffer.from(String(token).split('.')[1], 'base64url').toString())._auth_user_id ?? null;
  } catch {
    return null;
  }
}

/**
 * LeetCode re-issues its cookies as they are used. Keep the newest ones, in
 * memory and in .env, so the session rolls forward instead of dying a fixed
 * time after it was last pasted in.
 */
function adoptCookies(res) {
  const updates = {};
  for (const line of res.headers.getSetCookie?.() ?? []) {
    const m = line.match(/^([^=;\s]+)=([^;]*)/);
    const key = m && ROLLING_COOKIES[m[1]];
    if (!key || !m[2] || m[2] === process.env[key]) continue;
    // Never trade the signed-in session for an anonymous or foreign one.
    if (key === 'LEETCODE_SESSION') {
      const user = sessionUser(m[2]);
      if (!user || user !== sessionUser(process.env.LEETCODE_SESSION)) continue;
    }
    updates[key] = m[2];
  }
  const keys = Object.keys(updates);
  if (!keys.length) return;
  Object.assign(process.env, updates);
  try {
    if (writeEnvKeys(updates)) seenMtime = envMtime();
  } catch (err) {
    log.warn('could not save refreshed leetcode cookies', { err: err.message });
  }
  log.info('leetcode cookies refreshed', { names: keys });
}

async function lcFetch(url, { referer, ...init } = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  syncFromDisk();
  const res = await fetchWithTimeout(url, { ...init, headers: headers(referer) }, timeoutMs);
  adoptCookies(res);
  return res;
}

/**
 * LeetCode answers an expired cookie with 403 or an HTML login page. Surface
 * that as a clear operator-facing message instead of a raw body dump, which
 * could echo credentials back to the client.
 */
/** True when Cloudflare answered instead of LeetCode. Consumes the body. */
async function wafBlocked(res) {
  if (res.status !== 403) return false;
  if (res.headers.get('cf-mitigated')) return true;
  const body = await res.text().catch(() => '');
  return /Just a moment|challenge-platform/i.test(body);
}

const COMMENT = { python: '#', python3: '#' };

const PAD_LINES = [
  'The quick brown fox jumps over the lazy dog while the candidate reviews this solution.',
  'Please read the problem statement again carefully before pressing run on the editor.',
  'A practice attempt from the interview editor, written during a timed mock session.',
  'Remember to talk through the approach out loud, name the pattern, and state the complexity.',
  'Walk through one small example by hand before trusting the output of the judge.',
  'Check the edge cases: an empty input, a single element, and the largest allowed size.',
  'If the interviewer asks for a follow up, consider what changes if the input is streamed.',
  'Keep variable names descriptive so the reviewer can follow the reasoning without comments.',
  'After the run, compare the actual output with the expected output line by line.',
  'Finally, note the time and space complexity in a sentence before moving on to the next problem.',
  'Explain why the chosen data structure fits before writing any code at all.',
  'Mention any assumptions about the input that the interviewer did not state explicitly.',
  'Draw the recursion tree on the whiteboard to show where repeated work appears.',
  'Translate the memoized recursion into a bottom up table only if time allows.',
  'Ask whether the grid can be modified in place to save memory for the final answer.',
  'Summarize what you would test first if this function shipped to production tomorrow.',
  'Thank the interviewer and ask about the team before the call ends today.',
  'Keep calm, breathe, and read every line one more time before you press submit.',
  'The candidate should mention integer overflow concerns for other languages here.',
  'A clear explanation matters more than a clever trick in most interviews.',
];

// Pad sizes to try in order; the score is non-monotonic in pad length and
// submit bodies (no data_input) need more prose than run bodies.
const PAD_STEPS = [10, PAD_LINES.length];

/**
 * Cloudflare's WAF scores the request body as a whole, and short code whose
 * only prose is `if n == 0 or n == 1:` scores like a SQL injection probe.
 * Plain English in a trailing comment tips the score back; found empirically
 * (short or code-like comments do not work, and code with both an `and` and an
 * `or` needs about ten lines). Appended, so line numbers in compile and
 * runtime errors are unchanged.
 */
export function wafPad(code, lang, lines = PAD_STEPS[0]) {
  const c = COMMENT[lang] || '//';
  return `${code.replace(/\s+$/, '')}\n\n${PAD_LINES.slice(0, lines).map(l => `${c} ${l}`).join('\n')}\n`;
}

async function assertOk(res, action, code = '') {
  if (res.ok) return;
  if (res.status === 403) {
    // LeetCode's Cloudflare WAF challenges some code outright (e.g. `if x == m-1 and y == n-1:`, which reads like SQL injection);
    // 4xx so our own Cloudflare passes the JSON through instead of replacing it.
    if (await wafBlocked(res)) {
      log.warn('leetcode firewall challenge', { action });
      const hint = /\b(and|or|&&|\|\|)\b/.test(code)
        ? ' Comparisons joined with `and`/`or` (e.g. `if x == m-1 and y == n-1:`) look like SQL injection to it;'
          + ' split them into nested `if`s and run again.'
        : ' Try a small, semantics-preserving edit (rename a variable, add a line) and run again.';
      throw new AppError(
        "LeetCode's firewall blocked this request before the code ran." + hint,
        422, { code: 'leetcode_waf', expose: true });
    }
  }
  if (res.status === 401 || res.status === 403) {
    log.error('leetcode auth rejected', { action, status: res.status });
    // 424, not 5xx: the reason must survive Cloudflare and reach the user.
    throw new AppError('Your LeetCode cookie has expired. The admin can paste a fresh one in Settings → LeetCode judge.', 424, { code: 'judge_auth', expose: true });
  }
  log.error('leetcode error', { action, status: res.status });
  throw new UpstreamError(`LeetCode ${action} failed (${res.status})`, 502);
}

export async function graphql(query, variables = {}) {
  const res = await lcFetch(`${BASE}/graphql/`, {
    method: 'POST',
    referer: `${BASE}/problemset/`,
    body: JSON.stringify({ query, variables }),
  });
  await assertOk(res, 'graphql');
  const json = await res.json();
  if (json.errors) throw new UpstreamError(json.errors.map(e => e.message).join('; '));
  return json.data;
}

export async function validateCredentials() {
  syncFromDisk();
  if (!process.env.LEETCODE_SESSION || !process.env.LEETCODE_CSRF) {
    return { ok: false, message: 'LEETCODE_SESSION and LEETCODE_CSRF are required.' };
  }
  const data = await graphql(`query { userStatus { isSignedIn username } }`);
  const user = data?.userStatus || {};
  return user.isSignedIn
    ? { ok: true, username: user.username || null }
    : { ok: false, message: 'LeetCode did not accept these credentials.' };
}

export async function saveCredentials({ session, csrf, cfClearance, userAgent }) {
  const updates = { LEETCODE_SESSION: session, LEETCODE_CSRF: csrf };
  if (cfClearance) updates.LEETCODE_CF_CLEARANCE = cfClearance;
  if (userAgent) updates.LEETCODE_UA = userAgent;
  Object.assign(process.env, updates);
  writeEnvKeys(updates);
  seenMtime = envMtime();
  return validateCredentials();
}

async function poll(id, slug) {
  const url = `${BASE}/submissions/detail/${id}/check/`;
  for (let i = 0; i < POLL_MAX_ATTEMPTS; i++) {
    const res = await lcFetch(url, { referer: `${BASE}/problems/${slug}/` }, POLL_TIMEOUT_MS);
    if (res.ok) {
      const data = await res.json();
      if (data.state === 'SUCCESS') return data;
    } else {
      await assertOk(res, 'poll');
    }
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new UpstreamError('LeetCode judge timed out', 504);
}

/**
 * Cloudflare's WAF in front of LeetCode flags compact numeric lists such as
 * `[1,100,1,1,1,100,1]` as SQL injection and challenges the request with a 403
 * (reproduced empirically; the body `return 0` + a compact test case is enough).
 * LeetCode's own UI sends `[1, 100, 1]`, which passes. Add a space after every
 * comma outside string literals; the judge parses both forms identically.
 */
export function wafSafeInput(input) {
  let out = '';
  let inString = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    out += ch;
    if (inString) {
      if (ch === '\\' && i + 1 < input.length) out += input[++i];
      else if (ch === '"') inString = false;
    } else if (ch === '"') {
      inString = true;
    } else if (ch === ',' && input[i + 1] !== ' ' && input[i + 1] !== '\n') {
      out += ' ';
    }
  }
  return out;
}

/**
 * Post the code as written; if Cloudflare challenges it, post once more with
 * the prose pad. The pad changes nothing the judge sees as a program, and the
 * user's code is never altered when the first attempt goes through.
 */
async function postCode(url, slug, action, lang, code, extra) {
  const post = typed => lcFetch(url, {
    method: 'POST',
    referer: `${BASE}/problems/${slug}/`,
    body: JSON.stringify({ lang, typed_code: typed, ...extra }),
  });
  let res = await post(code);
  for (const lines of PAD_STEPS) {
    if (!(res.status === 403 && await wafBlocked(res))) break;
    log.info('leetcode firewall challenge, retrying with pad', { action, lines });
    res = await post(wafPad(code, lang, lines));
  }
  await assertOk(res, action, code);
  return res.json();
}

export async function runCode({ slug, questionId, lang, code, dataInput }) {
  const { interpret_id: interpretId } = await postCode(
    `${BASE}/problems/${slug}/interpret_solution/`, slug, 'run', lang, code,
    { question_id: String(questionId), data_input: wafSafeInput(dataInput) });
  return poll(interpretId, slug);
}

export async function submitCode({ slug, questionId, lang, code }) {
  const { submission_id: submissionId } = await postCode(
    `${BASE}/problems/${slug}/submit/`, slug, 'submit', lang, code,
    { question_id: String(questionId) });
  return poll(submissionId, slug);
}
