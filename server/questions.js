import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DETAILS = path.join(__dirname, '../../Companies/Google/.raw/details.json');
const MEMBERSHIP = path.join(__dirname, '../../Companies/Google/.raw/membership.json');

/**
 * Previously a bare readFileSync at import time: a missing or malformed data
 * file crashed the process on boot with a raw stack trace. Fail soft instead —
 * the server still starts and /readyz reports the problem.
 */
function loadJson(file, label) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    console.error(JSON.stringify({
      ts: new Date().toISOString(), level: 'error',
      msg: 'failed to load question data', file: label, err: err.message,
    }));
    return {};
  }
}

const details = loadJson(DETAILS, 'details.json');
const membership = loadJson(MEMBERSHIP, 'membership.json');
// NeetCode's YouTube playlists ship inside the app (the Google lists live outside it).
// Their names start with "NeetCode-" so they stay out of the Google set, like the 150.
{
  const yt = loadJson(path.join(__dirname, 'data/neetcode-yt.json'), 'neetcode-yt.json');
  for (const [level, items] of Object.entries(yt.lists || {})) {
    membership[`NeetCode-YouTube-${level[0].toUpperCase()}${level.slice(1)}`] = items.map(q => ({ id: String(q.lc || ''), slug: q.slug, title: q.title, difficulty: q.difficulty }));
  }
}

export function dataLoaded() {
  return { details: Object.keys(details).length, lists: Object.keys(membership).length };
}

export function listNames() {
  return Object.entries(membership).map(([name, items]) => ({ name, count: items.filter(q => !sqlSlugs.has(q.slug)).length }));   // same SQL filter as listQuestions
}

/** SQL questions are tagged Google on LeetCode but never appear in an SWE loop. */
const isSql = q => (q?.topicTags || []).some(t => (typeof t === 'string' ? t : t?.name) === 'Database');
const sqlSlugs = new Set(Object.entries(details).filter(([, q]) => isSql(q)).map(([slug]) => slug));

/**
 * The "Google set" is what SMART, Learn and the explainers aggregate over.
 * details.json also carries questions fetched only for curated lists such as
 * NeetCode-150, so membership in a Google/DP list — not presence in
 * details.json — is what makes a question part of the Google set.
 */
const googleSlugs = (() => {
  const s = new Set();
  for (const [name, items] of Object.entries(membership)) {
    if (name.startsWith('NeetCode-')) continue;
    for (const q of items || []) s.add(q.slug);
  }
  return s;
})();

/** Which Google lists a question is in (NeetCode lists excluded). */
export function googleListsOf(slug) {
  const out = [];
  for (const [name, items] of Object.entries(membership)) {
    if (name.startsWith('NeetCode-')) continue;
    if ((items || []).some(q => q.slug === slug)) out.push(name);
  }
  return out;
}

export function questionsIn(listName) {
  return (Object.hasOwn(membership, listName) ? membership[listName] : []).filter(q => !sqlSlugs.has(q.slug)).map(q => ({
    id: q.id,
    slug: q.slug,
    title: q.title,
    difficulty: q.difficulty,
    status: q.status,
    frequency: q.frequency,
  }));
}

/** "Similar questions" as LeetCode lists them, kept to what is solvable here. */
function similarTo(q) {
  let raw = q.similarQuestions;
  if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch { raw = []; } }
  return (Array.isArray(raw) ? raw : [])
    .filter(s => s?.titleSlug && details[s.titleSlug] && !sqlSlugs.has(s.titleSlug))
    .slice(0, 8)
    .map(s => ({ slug: s.titleSlug, title: s.title, difficulty: s.difficulty }));
}

function acceptance(q) {
  let s = q.stats;
  if (typeof s === 'string') { try { s = JSON.parse(s); } catch { s = null; } }
  return s?.acRate || null;
}

/**
 * Questions fetched from LeetCode on demand (anything not in the local set —
 * e.g. someone searches "77" or a brand-new problem). Same shape as
 * details.json; filled by lc-catalog.js and kept on disk across restarts.
 */
const remote = new Map();
export function registerRemote(q) {
  if (q?.titleSlug) remote.set(q.titleSlug, q);
}
export const hasQuestion = slug => Object.hasOwn(details, slug) || remote.has(slug);

/**
 * Search everything we hold by number, title or slug. "77", "#77",
 * "combinations" and "comb" all find Combinations. SQL problems are left out
 * (they never come up in an SWE loop and the editor cannot run them).
 */
export function searchQuestions(term, limit = 25) {
  const raw = String(term || '').trim().toLowerCase().replace(/^#/, '');
  if (!raw) return [];
  const num = /^\d+$/.test(raw) ? raw : null;
  const words = normaliseTitle(raw);
  const pool = [...Object.values(details), ...remote.values()];
  const seen = new Set(), hits = [];
  for (const q of pool) {
    if (!q?.titleSlug || seen.has(q.titleSlug) || isSql(q)) continue;
    seen.add(q.titleSlug);
    const id = String(q.questionFrontendId || '');
    const title = normaliseTitle(q.title);
    let rank = -1;
    if (num) rank = id === num ? 0 : id.startsWith(num) ? 2 : -1;
    else if (title === words || q.titleSlug === raw) rank = 0;
    else if (title.startsWith(words)) rank = 1;
    else if (title.includes(words) || q.titleSlug.includes(raw.replace(/\s+/g, '-'))) rank = 2;
    if (rank < 0) continue;
    hits.push({ rank, id, slug: q.titleSlug, title: q.title, difficulty: q.difficulty, paidOnly: Boolean(q.isPaidOnly),
      lists: googleListsOf(q.titleSlug).length ? 'google' : (Object.hasOwn(details, q.titleSlug) ? 'local' : 'leetcode') });
  }
  return hits.sort((a, b) => a.rank - b.rank || (+a.id || 1e9) - (+b.id || 1e9)).slice(0, limit).map(({ rank, ...h }) => h);
}

export function question(slug) {
  const q = Object.hasOwn(details, slug) ? details[slug] : remote.get(slug) || null;
  if (!q) return null;
  return {
    similar: similarTo(q),
    acRate: acceptance(q),
    paidOnly: Boolean(q.isPaidOnly),
    questionId: q.questionId,
    id: q.questionFrontendId,
    title: q.title,
    slug: q.titleSlug,
    difficulty: q.difficulty,
    content: q.content,
    hints: q.hints || [],
    topicTags: (q.topicTags || []).map(t => t.name),
    exampleTestcases: q.exampleTestcases || '',
    sampleTestCase: q.sampleTestCase || '',
    metaData: q.metaData || '',
    codeSnippets: q.codeSnippets || [],
  };
}

/**
 * Title -> slug, for anything that knows a problem by name rather than slug
 * (the pattern catalogue does). Built once; titles are compared loosely so
 * "Two Sum II - Input Array Is Sorted" still matches punctuation variants.
 */
const normaliseTitle = t => String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

let titleIndex = null;
function index() {
  if (titleIndex) return titleIndex;
  titleIndex = new Map();
  for (const [slug, q] of Object.entries(details)) {
    if (sqlSlugs.has(slug) || !googleSlugs.has(slug)) continue;
    if (q?.title) titleIndex.set(normaliseTitle(q.title), {
      slug, title: q.title, difficulty: q.difficulty, id: q.questionFrontendId,
      topics: (q.topicTags || []).map(t => t.name),
    });
  }
  return titleIndex;
}

/** Which of these titles exist in the local Google set, and under what slug. */
export function resolveTitles(titles) {
  const idx = index();
  return (titles || []).map(title => {
    const hit = idx.get(normaliseTitle(title));
    return hit
      ? { title, slug: hit.slug, difficulty: hit.difficulty, available: true }
      : { title, slug: null, difficulty: null, available: false };
  });
}

/** Every question in the local set, for pickers. */
export function allQuestions() {
  return [...index().values()].sort((a, b) => a.title.localeCompare(b.title));
}
