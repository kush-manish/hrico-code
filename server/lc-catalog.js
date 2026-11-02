/**
 * Any LeetCode problem, on demand. The local set holds ~640 questions; when
 * someone searches for one we do not have ("77", "Combinations", a new
 * contest problem), find it on LeetCode, fetch its statement, examples,
 * starter code and metadata, and keep it on disk so the Coding tab — and the
 * judge — treat it like any other question from then on.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { graphql } from './leetcode.js';
import { fetchWithTimeout } from './http.js';
import { registerRemote, hasQuestion } from './questions.js';
import { log } from './log.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIR = process.env.LC_CACHE_DIR || path.join(__dirname, '.cache/lc');
const CATALOG_TTL = 24 * 3600e3;

// Fetched questions survive restarts.
try {
  fs.mkdirSync(DIR, { recursive: true });
  for (const f of fs.readdirSync(DIR)) {
    if (!f.endsWith('.json') || f === 'catalog.json') continue;
    try { registerRemote(JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'))); } catch { /* skip a bad file */ }
  }
} catch (err) { log.warn('lc cache unavailable', { err: err.message }); }

/** Every problem's number, slug and title: one public LeetCode call a day. */
let catalog = null, catalogAt = 0, catalogLoading = null;
async function loadCatalog() {
  if (catalog && Date.now() - catalogAt < CATALOG_TTL) return catalog;
  if (catalogLoading) return catalogLoading;
  catalogLoading = (async () => {
    const file = path.join(DIR, 'catalog.json');
    try {
      const st = fs.statSync(file);
      if (Date.now() - st.mtimeMs < CATALOG_TTL) {
        catalog = JSON.parse(fs.readFileSync(file, 'utf8')); catalogAt = st.mtimeMs; return catalog;
      }
    } catch { /* no saved copy yet */ }
    try {
      const res = await fetchWithTimeout('https://leetcode.com/api/problems/all/', {
        headers: { 'User-Agent': process.env.LEETCODE_UA || 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36', Referer: 'https://leetcode.com/problemset/' },
      }, 20_000);
      if (!res.ok) throw new Error(`catalog ${res.status}`);
      const data = await res.json();
      catalog = (data.stat_status_pairs || []).map(p => ({
        id: String(p.stat?.frontend_question_id ?? ''),
        slug: p.stat?.question__title_slug,
        title: p.stat?.question__title,
        paid: Boolean(p.paid_only),
        difficulty: ['', 'Easy', 'Medium', 'Hard'][p.difficulty?.level] || '',
      })).filter(p => p.slug);
      catalogAt = Date.now();
      try { fs.writeFileSync(file, JSON.stringify(catalog)); } catch { /* memory is enough */ }
      return catalog;
    } catch (err) {
      log.warn('lc catalog fetch failed', { err: err.message });
      return catalog || [];
    } finally { catalogLoading = null; }
  })();
  return catalogLoading;
}

const norm = t => String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** LeetCode's own search, when the catalog is unreachable. */
async function searchViaGraphql(term) {
  const q = `query problemsetQuestionList($categorySlug: String, $limit: Int, $skip: Int, $filters: QuestionListFilterInput) {
    problemsetQuestionList: questionList(categorySlug: $categorySlug, limit: $limit, skip: $skip, filters: $filters) {
      questions: data { frontendQuestionId: questionFrontendId title titleSlug difficulty paidOnly: isPaidOnly }
    } }`;
  const data = await graphql(q, { categorySlug: '', skip: 0, limit: 20, filters: { searchKeywords: term } });
  return (data?.problemsetQuestionList?.questions || []).map(x => ({
    id: String(x.frontendQuestionId), slug: x.titleSlug, title: x.title, paid: Boolean(x.paidOnly), difficulty: x.difficulty,
  }));
}

/** LeetCode problems matching a number, slug or title (not fetched yet). */
export async function searchLeetCode(term, limit = 10) {
  const raw = String(term || '').trim().toLowerCase().replace(/^#/, '');
  if (!raw) return [];
  const num = /^\d+$/.test(raw) ? raw : null;
  let list = await loadCatalog();
  if (!list.length) list = await searchViaGraphql(raw).catch(() => []);
  const words = norm(raw);
  const rank = p => {
    if (num) return p.id === num ? 0 : -1;
    const t = norm(p.title);
    return t === words || p.slug === raw ? 0 : t.startsWith(words) ? 1 : t.includes(words) ? 2 : -1;
  };
  return list.map(p => ({ ...p, r: rank(p) })).filter(p => p.r >= 0)
    .sort((a, b) => a.r - b.r || (+a.id || 1e9) - (+b.id || 1e9)).slice(0, limit)
    .map(({ r, paid, ...p }) => ({ ...p, paidOnly: paid, lists: 'leetcode' }));
}

const DETAIL = `query questionData($titleSlug: String!) {
  question(titleSlug: $titleSlug) {
    questionId questionFrontendId title titleSlug content isPaidOnly difficulty
    similarQuestions exampleTestcases sampleTestCase metaData stats hints
    topicTags { name slug }
    codeSnippets { lang langSlug code }
  } }`;

const inflight = new Map();
/** Fetch one problem by slug and keep it. Resolves to the slug, or null. */
export async function fetchQuestion(slug) {
  if (!/^[a-z0-9-]{1,120}$/.test(slug || '')) return null;
  if (hasQuestion(slug)) return slug;
  if (inflight.has(slug)) return inflight.get(slug);
  const job = (async () => {
    const data = await graphql(DETAIL, { titleSlug: slug });
    const q = data?.question;
    if (!q?.titleSlug) return null;
    if (!q.content) q.content = q.isPaidOnly
      ? '<p>This is a LeetCode Premium problem, so its statement is not available here. Open it on LeetCode to read it.</p>'
      : '<p>No statement was returned for this problem.</p>';
    registerRemote(q);
    try { fs.writeFileSync(path.join(DIR, `${q.titleSlug}.json`), JSON.stringify(q)); } catch { /* memory is enough */ }
    log.info('fetched question from leetcode', { slug: q.titleSlug });
    return q.titleSlug;
  })().finally(() => inflight.delete(slug));
  inflight.set(slug, job);
  return job;
}

/** "77" / "combinations" / a slug → the slug of a problem we now hold. */
export async function lookup(term) {
  const raw = String(term || '').trim().toLowerCase().replace(/^#/, '');
  if (/^[a-z0-9-]+$/.test(raw) && !/^\d+$/.test(raw) && raw.includes('-')) {
    const s = await fetchQuestion(raw).catch(() => null);
    if (s) return s;
  }
  const [best] = await searchLeetCode(raw, 1);
  if (!best) return null;
  return fetchQuestion(best.slug);
}
