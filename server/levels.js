/**
 * Software-engineer pay per firm and location, read from levels.fyi's public
 * company pages. Each page embeds its data as __NEXT_DATA__ JSON: per-level
 * averages (USD) plus the location's currency and USD exchange rate, so the
 * figures are converted to local currency here exactly as the site shows them.
 *
 * Results are cached on disk for a week; a fresh process starts from the
 * snapshot in data/hft-pay.json so the first page view never waits on the
 * network. Fetches are serialised and spaced to stay polite.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { log } from './log.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.join(__dirname, '../.cache/levels');
const SNAPSHOT = path.join(__dirname, 'data/hft-pay.json');
const TTL_MS = 7 * 24 * 3600 * 1000;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128 Safari/537.36';
const SLUG_RE = /^[a-z0-9-]{1,80}$/;

export const pageUrl = (company, location) =>
  `https://www.levels.fyi/companies/${company}/salaries/software-engineer/locations/${location}`;

let snapshot = null;
function loadSnapshot() {
  if (snapshot) return snapshot;
  try { snapshot = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8')); } catch { snapshot = {}; }
  return snapshot;
}

const cacheFile = (c, l) => path.join(CACHE_DIR, `${c}__${l}.json`);
function readCache(c, l) {
  try {
    const rec = JSON.parse(fs.readFileSync(cacheFile(c, l), 'utf8'));
    return rec;
  } catch { return null; }
}
function writeCache(c, l, rec) {
  try { fs.mkdirSync(CACHE_DIR, { recursive: true }); fs.writeFileSync(cacheFile(c, l), JSON.stringify(rec)); }
  catch (err) { log.warn('levels: cache write failed', { err: err.message }); }
}

/** Turns one company/location page into { currency, median, p25, p75, p90, count, levels[] } in local currency. */
export function parsePage(html) {
  const m = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  if (!m) return null;
  let pp;
  try { pp = JSON.parse(m[1]).props?.pageProps; } catch { return null; }
  if (!pp || !pp.company) return null;
  const rate = Number(pp.locationExchangeRate) || 1;
  const cur = pp.locationCurrency || 'USD';
  const k = v => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.round(Number(v) * rate) : null);
  const tc = pp.percentiles?.tc || {};
  const levels = (pp.averages || []).map(a => ({
    level: a.primaryLevelName || a.level,
    alt: a.secondaryLevelName && a.secondaryLevelName !== a.primaryLevelName ? a.secondaryLevelName : '',
    total: k(a.rawValues?.total ?? a.total),
    base: k(a.rawValues?.baseSalary ?? a.base),
    stock: k(a.rawValues?.stockGrantValue ?? a.stock),
    bonus: k(a.rawValues?.bonus ?? a.bonus),
    yoe: a.yoeMedian ?? null,
    count: a.count ?? null,
  })).filter(x => x.total);
  const median = k(pp.median?.totalCompensation) || k(tc.p50);
  if (!median && !levels.length) return null;
  return {
    currency: cur,
    location: pp.locationMeta?.displayName || pp.locationMeta?.name || '',
    median,
    p25: k(tc.p25), p75: k(tc.p75), p90: k(tc.p90),
    count: pp.levels?.count ?? null,
    levels,
  };
}

async function fetchPage(company, location) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 20_000);
  try {
    const res = await fetch(pageUrl(company, location), { headers: { 'User-Agent': UA, Accept: 'text/html' }, signal: ac.signal, redirect: 'follow' });
    if (res.status === 404) return { ok: false, status: 404 };
    if (!res.ok) return { ok: false, status: res.status };
    return { ok: true, html: await res.text() };
  } finally { clearTimeout(t); }
}

// One fetch at a time with a gap between them, shared by every caller.
let chain = Promise.resolve();
const GAP_MS = 700;
function queued(fn) {
  const p = chain.then(fn, fn);
  chain = p.catch(() => {}).then(() => new Promise(r => setTimeout(r, GAP_MS)));
  return p;
}
const inflight = new Map();

/**
 * Pay for one firm at one location. Returns { status: 'ok'|'none'|'error', data?, fetchedAt, url }.
 * `none` means levels.fyi has no software-engineer data for that pair.
 */
export async function pay(company, location, { allowNetwork = true } = {}) {
  if (!SLUG_RE.test(company) || !SLUG_RE.test(location)) return { status: 'error', error: 'bad slug' };
  const url = pageUrl(company, location);
  const cached = readCache(company, location);
  if (cached && Date.now() - cached.fetchedAt < TTL_MS) return { ...cached, url };
  const snap = loadSnapshot()[`${company}__${location}`];
  const fallback = cached || snap || null;
  if (!allowNetwork) return fallback ? { ...fallback, url, stale: true } : { status: 'pending', url };

  const key = `${company}__${location}`;
  if (!inflight.has(key)) {
    inflight.set(key, queued(async () => {
      try {
        const r = await fetchPage(company, location);
        let rec;
        if (r.ok) {
          const data = parsePage(r.html);
          rec = data ? { status: 'ok', data, fetchedAt: Date.now() } : { status: 'none', fetchedAt: Date.now() };
        } else if (r.status === 404) {
          rec = { status: 'none', fetchedAt: Date.now() };
        } else {
          throw new Error(`levels.fyi ${r.status}`);
        }
        writeCache(company, location, rec);
        return rec;
      } catch (err) {
        log.warn('levels: fetch failed', { company, location, err: err.message });
        return fallback ? { ...fallback, stale: true } : { status: 'error', error: err.message, fetchedAt: Date.now() };
      } finally { inflight.delete(key); }
    }));
  }
  return { ...(await inflight.get(key)), url };
}

/** Writes every firm/location pair to the snapshot file (run: node server/levels.js --sweep). */
export async function sweep(pairs) {
  const out = {};
  for (const [c, l] of pairs) {
    const r = await pay(c, l);
    out[`${c}__${l}`] = { status: r.status, data: r.data, fetchedAt: r.fetchedAt };
    process.stdout.write(`${r.status.padEnd(5)} ${c} @ ${l}${r.data ? ` median ${r.data.currency} ${r.data.median}` : ''}\n`);
  }
  fs.writeFileSync(SNAPSHOT, JSON.stringify(out, null, 1));
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]) && process.argv.includes('--sweep')) {
  const { payPairs } = await import('./hft-firms.js');
  await sweep(payPairs());
}
