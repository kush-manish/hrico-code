const $ = id => document.getElementById(id);
const listSel = $('listSel'), qSel = $('qSel'), langSel = $('langSel');
const runBtn = $('runBtn'), submitBtn = $('submitBtn'), statusEl = $('status');
// Remember the chosen language across reloads (restored before the first applyLang).
try {
  const l = localStorage.getItem('qf.lang');
  if (l && [...langSel.options].some(o => o.value === l)) langSel.value = l;
} catch { /* storage blocked */ }
langSel.addEventListener('change', () => { try { localStorage.setItem('qf.lang', langSel.value); } catch { /* storage blocked */ } });

$('menuBtn').onclick = () => { const open = $('bar').classList.toggle('menu-open'); $('menuBtn').setAttribute('aria-expanded', String(open)); };

// Dark / light theme toggle (data-theme is set early in <head> to avoid flash)
(function () {
  var btn = $('themeBtn');
  if (!btn) return;
  function syncIcon() { btn.textContent = document.documentElement.getAttribute('data-theme') === 'dark' ? '\u2600' : '\u263E'; }
  syncIcon();
  btn.onclick = function () {
    var next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    syncIcon();
  };
})();

let current = null;

// --- coding session -------------------------------------------------------
// The clock only advances between Start and Stop, and is always derived from
// startedAt (see paintClock) rather than decremented.
const session = {
  running: false, startedAt: 0, endedAt: 0, durationMs: 45 * 60000,
  runs: 0, submits: 0, verdict: null, accepted: false, result: null,
  realistic: false, aidsUnlocked: false, aids: [], firstCodeAt: 0, samplesPassAt: 0,
  followUp: null, followUpPending: false, followUpTries: 0, followUpRetryAt: 0,
};
// Idle clock shows the length chosen last time.
try {
  const m = Number(JSON.parse(localStorage.getItem('mockPrefs') || '{}').minutes);
  if ([30, 45, 60].includes(m)) session.durationMs = m * 60000;
} catch { /* defaults */ }

const drafts = JSON.parse(localStorage.getItem('drafts') || '{}');

const draftKey = () => `${current.slug}:${langSel.value}:${plainMode ? 'plain' : 'code'}`;
// The key the editor's text belongs to — fixed when a draft or template is
// loaded. Recomputing it at save time lost up to 3s of typing on a language
// or question switch: by then langSel/current already named the new one.
let editorKey = null;

function saveDraft() {
  if (!current || !editorKey) return;
  if (drafts[editorKey] === Editor.value) return;
  drafts[editorKey] = Editor.value;
  try { localStorage.setItem('drafts', JSON.stringify(drafts)); } catch { /* quota / private mode */ }
}
setInterval(saveDraft, 3000);
window.addEventListener('pagehide', saveDraft);

async function api(path, opts) {
  const res = await fetch(path, opts);
  // Cloudflare swaps 5xx bodies for plain text, which res.json() reports as a cryptic parse error.
  const data = await res.json().catch(() => {
    throw new Error(`The server is busy or restarting (HTTP ${res.status}). Try again in a moment.`);
  });
  if (!res.ok) {
    // Keep the server's error code: "upstream" (LeetCode unreachable) is
    // handled differently from a bad request or an expired session.
    const err = new Error(data.error || 'Request failed');
    err.code = data.code || null;
    err.status = res.status;
    throw err;
  }
  return data;
}

// --- appearance -------------------------------------------------------------
// Two independent axes: the skin (visual identity) and light/dark. Choosing a
// skin must never silently change the user's light/dark preference, so they
// are stored and applied separately. Both are applied in <head> before first
// paint; this only keeps the control in sync and persists changes.
const SKINS = ['classic', 'glass', 'liquid', 'midnight', 'nord', 'paper',
  'qf', 'qf-calm', 'qf-terminal', 'qf-editorial', 'qf-coach', 'qf-mission', 'qf-swiss', 'qf-keys', 'qf-path', 'qf-zen', 'qf-nordic'];

(function initAppearance() {
  const sel = document.getElementById('skinSel');
  if (!sel) return;
  const saved = localStorage.getItem('skin');
  const current = SKINS.includes(saved) ? saved : 'qf';
  document.documentElement.setAttribute('data-skin', current);
  sel.value = current;
  sel.addEventListener('change', () => {
    const next = SKINS.includes(sel.value) ? sel.value : 'qf';
    document.documentElement.setAttribute('data-skin', next);
    try { localStorage.setItem('skin', next); } catch { /* private mode */ }
  });
})();

// --- server capabilities ----------------------------------------------------
// The judge needs a LeetCode cookie and the interviewer needs a model; either
// can be absent. Ask once on load and reflect it in the UI rather than letting
// the user click a button that is guaranteed to fail.
const caps = { leetcode: true, llm: true };

function banner(message) {
  let el = document.getElementById('capBanner');
  if (!el) {
    el = document.createElement('div');
    el.id = 'capBanner';
    el.className = 'cap-banner';
    document.body.insertBefore(el, document.body.firstChild.nextSibling);
  }
  el.textContent = message;
  el.hidden = !message;
}

function disable(btn, reason) {
  if (!btn) return;
  btn.disabled = true;
  btn.title = reason;
  btn.classList.add('is-disabled');
}

function enable(btn) {
  if (!btn) return;
  btn.disabled = false;
  btn.title = '';
  btn.classList.remove('is-disabled');
}

window.refreshCapabilities = loadCapabilities;
async function loadCapabilities() {
  try {
    const s = await api('/api/status');
    Object.assign(caps, s.capabilities || {});
  } catch {
    return; // status is advisory; never block the app on it
  }
  const off = [];
  if (!caps.leetcode) {
    off.push('Running and submitting code');
    // Start stays available: timing yourself against a question is useful
    // even when the judge is unreachable. Only Run/Submit actually need it.
    for (const id of ['runBtn', 'submitBtn']) {
      disable($(id), 'LeetCode session not configured on the server');
    }
  } else {
    enable($('runBtn'));
    enable($('submitBtn'));
  }
  codingControls();
  if (!caps.llm) {
    off.push('the AI interviewer and solution generator');
    disable($('solutionBtn'), 'Model not configured on the server');
    disable($('panelBtn'), 'Model not configured on the server');
  }
  // The behavioural tab is entirely model-driven, so gate the tab itself.
  if (typeof window.behaviouralSetAvailable === 'function') {
    window.behaviouralSetAvailable(caps.llm);
  }
  window.dispatchEvent(new CustomEvent('server-capabilities', { detail: caps }));
  if (!off.length) return banner('');

  const what = off.length === 2 ? `${off[0]}, and ${off[1]},` : `${off[0]}`;
  const verb = off.length === 2 ? 'are' : 'is';
  banner(`${what} ${verb} unavailable \u2014 the server has no credentials configured for ${
    off.length === 2 ? 'either' : 'this'}. Browsing questions and the editor still work.`);
}

function renderFailure(err, mode) {
  const message = String(err.message || 'Request failed');
  let hint = '';
  if (/unavailable/i.test(message)) {
    hint = mode === 'chat'
      ? 'The server has no model configured, so the interviewer is switched off.'
      : 'The server has no LeetCode session configured, so code cannot be run or submitted.';
  } else if (/session is invalid or expired/i.test(message)) {
    hint = 'The saved LeetCode session has expired and needs refreshing on the server.';
  } else if (/timed out/i.test(message)) {
    hint = 'LeetCode did not respond in time. Try again in a moment.';
  } else if (/too many/i.test(message)) {
    hint = 'Rate limit reached. Wait a minute and retry.';
  }
  return `<div class="verdict bad">Unavailable</div><dl class="kv">${row('Message', message)}` +
    (hint ? row('What this means', hint) : '') + '</dl>';
}

async function loadLists() {
  $('qListErr')?.remove();
  const lists = await api('/api/lists');
  listSel.innerHTML = lists.map(l => `<option value="${l.name}">${l.name} (${l.count})</option>`).join('');
  try {
    const f = JSON.parse(localStorage.getItem(FOLLOW_KEY) || 'null');
    if (f?.items?.length) { const val = addQueueOption(f); if (!deepLink || f.items.some(x => x.slug === deepLink.slug)) listSel.value = val; }
  } catch { /* none saved */ }
  await loadQuestions();
}

function fillPicker(qs) {
  const mark = t => {
    const s = window.Learn?.status?.(t);
    return s === 'solved' ? '✓ ' : s === 'attempted' ? '✱ ' : '';
  };
  const diff = d => (d ? ` · ${d[0] + d.slice(1).toLowerCase()}` : '');
  qSel.innerHTML = qs.map(q =>
    `<option value="${q.slug}">${mark(q.title)}${q.id ? `${q.id}. ` : ''}${q.title}${diff(q.difficulty)}</option>`
  ).join('');
}

// A question opened from Learn, Pro-Learn or Home arrives as /?q=slug in its own tab.
let deepLink = (() => {
  const p = new URLSearchParams(location.search);
  const slug = p.get('q');
  return slug && /^[a-z0-9-]{1,120}$/.test(slug) ? { slug, title: p.get('t') || slug } : null;
})();

function selectQuestion(slug, title) {
  if (![...qSel.options].some(o => o.value === slug)) {
    const opt = document.createElement('option');
    opt.value = slug;
    opt.textContent = title || slug;
    qSel.prepend(opt);
  }
  qSel.value = slug;
}

// --- "Following": the list you came from ----------------------------------
// Opening a problem from Today, NeetCode 150, the Google list (or anywhere
// that passes a queue) makes ‹ › and "Next" walk THAT list, in its order.
// It shows in the List picker under "Following", next to the Google lists.
const queues = {};
const FOLLOW_KEY = 'qf.follow';
function listItems(name) {
  if (name && name.startsWith('@')) return Promise.resolve(queues[name]?.items || []);
  return api(`/api/lists/${encodeURIComponent(name)}`);
}
function paintListLabel() {
  const lab = listSel.closest('label')?.querySelector('span');
  const following = listSel.value.startsWith('@');
  if (lab) lab.textContent = following ? 'Following' : 'List';
  listSel.closest('label')?.classList.toggle('following', following);
}
function addQueueOption(q) {
  const val = `@${q.key}`;
  queues[val] = q;
  let og = listSel.querySelector('optgroup[data-follow]');
  if (!og) { og = document.createElement('optgroup'); og.label = 'Following'; og.dataset.follow = '1'; listSel.prepend(og); }
  let o = [...og.querySelectorAll('option')].find(x => x.value === val);
  if (!o) { o = document.createElement('option'); o.value = val; og.insertBefore(o, og.querySelector('option[value="@@stop"]')); }
  o.textContent = `${q.label} (${q.items.length})`;
  if (!og.querySelector('option[value="@@stop"]')) {
    const st = document.createElement('option'); st.value = '@@stop'; st.textContent = '✕ Stop following'; og.appendChild(st);
  }
  return val;
}
/** "✕ Stop following": forget the followed list and go back to the first normal list. */
function stopFollowing() {
  const og = listSel.querySelector('optgroup[data-follow]');
  og?.querySelectorAll('option').forEach(o => delete queues[o.value]);
  og?.remove();
  try { localStorage.removeItem(FOLLOW_KEY); } catch { /* storage blocked */ }
  listSel.selectedIndex = 0;
  shownList = listSel.value;
  loadQuestions().catch(e => window.QF?.toast?.(`Could not open that question (${e.message || 'load failed'})`));
}
function setQueue(q) {
  if (!q || !Array.isArray(q.items) || !q.items.length) return;
  const items = q.items.filter(x => x && /^[a-z0-9-]{1,120}$/.test(x.slug || '')).slice(0, 2000)
    .map(x => ({ slug: x.slug, title: x.title || x.slug, id: x.id || '', difficulty: x.difficulty || '' }));
  const val = addQueueOption({ key: String(q.key || q.label || 'list').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40), label: String(q.label || 'Your list').slice(0, 60), items });
  listSel.value = val; shownList = val;
  fillPicker(items);
  paintListLabel();
  try { localStorage.setItem(FOLLOW_KEY, JSON.stringify({ ...queues[val], val })); } catch { /* storage full */ }
}
window.QFQueue = { set: setQueue, current: () => (listSel.value.startsWith('@') ? queues[listSel.value] : { label: listSel.value }) };

const LASTQ_KEY = 'qf.lastq';
let restoredPlace = false;
async function loadQuestions() {
  fillPicker(await listItems(listSel.value));
  paintListLabel();
  // First load after a reload: carry on where you were in this list.
  if (!restoredPlace && !deepLink) {
    restoredPlace = true;
    try {
      const last = JSON.parse(localStorage.getItem(LASTQ_KEY) || 'null');
      if (last?.list === listSel.value && [...qSel.options].some(o => o.value === last.slug)) qSel.value = last.slug;
    } catch { /* nothing saved */ }
  }
  if (deepLink) {
    selectQuestion(deepLink.slug, deepLink.title);
    window.setInterviewMode?.('coding');
    deepLink = null;
  }
  await loadQuestion();
}

function pythonMeta(q) {
  let meta = q.metaData || {};
  if (typeof meta === 'string') {
    try { meta = JSON.parse(meta); } catch { meta = {}; }
  }
  return meta;
}

function defaultPythonReturn(q) {
  const type = pythonMeta(q)?.return?.type;
  if (type === 'boolean') return 'False';
  if (type === 'string') return '""';
  if (type && /\[\]$/.test(type)) return '[]';
  return '0';
}

function snippetFor(q, lang) {
  const s = (q.codeSnippets || []).find(c => c.langSlug === lang);
  const code = s ? s.code : '';
  if ((lang === 'python3' || lang === 'python') && code && !/\b(return|pass)\b/.test(code)) {
    const indent = code.match(/\n([ \t]*)$/)?.[1];
    if (indent) return `${code}return ${defaultPythonReturn(q)}`;
  }
  return code;
}

const LINE_COMMENT = { python3: '#', java: '//', cpp: '//', javascript: '//', golang: '//' };
const BANNER_END = 'END PROBLEM';

function htmlToText(html) {
  const el = document.createElement('div');
  el.innerHTML = (html || '')
    .replace(/<\/p>|<br\s*\/?>|<\/li>|<\/pre>|<\/div>/gi, '\n');
  return el.textContent.replace(/\n{3,}/g, '\n\n').trim();
}

function plainTemplate(q, lang) {
  const c = LINE_COMMENT[lang] || '//';
  const body = [`${q.id}. ${q.title}  [${q.difficulty}]`, '', htmlToText(q.content)]
    .join('\n').split('\n').map(l => (l ? `${c} ${l}` : c)).join('\n');
  return `${body}\n${c} ${BANNER_END}\n\n${snippetFor(q, lang)}`;
}

// The judge only needs the code, so drop the leading comment banner.
function stripBanner(text, lang) {
  const c = LINE_COMMENT[lang] || '//';
  const marker = text.indexOf(`${c} ${BANNER_END}`);
  return marker === -1 ? text : text.slice(text.indexOf('\n', marker) + 1).replace(/^\s*\n/, '');
}

function codingControls() {
  // Run/Submit only need the judge; no interview session required. Run also
  // works with no judge at all when the question/language can run locally.
  const judgeOk = caps.leetcode !== false;
  $('runBtn').disabled = !(judgeOk || canRunLocally());
  $('submitBtn').disabled = !judgeOk;
  $('startBtn').disabled = session.running;
  $('stopBtn').disabled = !session.running;
  applyAidLocks();
}

// --- Google realistic mode & aids --------------------------------------------
// A real Google round has no Run button, no hints and no solution. In
// realistic mode those are locked for the session; the candidate may unlock
// them, but anything opened is counted and goes into the write-up.
const REAL_TIP = 'Google realistic mode: real Google rounds don’t run code — trace it by hand and talk through your tests.';
const AID_BUTTONS = ['runBtn', 'submitBtn', 'debugBtn', 'solutionBtn'];

function aidsLocked() { return session.running && session.realistic && !session.aidsUnlocked; }
window.codingAidsLocked = aidsLocked;

function lockEl(el, locked) {
  if (!el) return;
  if (locked) {
    if (!('rlTitle' in el.dataset)) el.dataset.rlTitle = el.title || '';
    el.disabled = true;
    el.title = REAL_TIP;
    el.setAttribute('aria-disabled', 'true');
    el.classList.add('rl-locked');
  } else if ('rlTitle' in el.dataset) {
    el.title = el.dataset.rlTitle;
    delete el.dataset.rlTitle;
    el.disabled = false;
    el.removeAttribute('aria-disabled');
    el.classList.remove('rl-locked');
  }
}

function applyAidLocks() {
  const locked = aidsLocked();
  const wasLocked = $('runBtn').classList.contains('rl-locked');
  for (const id of AID_BUTTONS) lockEl($(id), locked);
  lockEl(document.querySelector('.q-tab[data-qtab="hints"]'), locked);
  if (locked) {
    if (document.querySelector('.q-tab.sel')?.dataset.qtab === 'hints') showQTab('description');
    $('solutionPane').classList.add('hidden');
    $('solutionBtn').classList.remove('active');
  } else if (wasLocked) {
    // Back to each control's own rules.
    const capable = caps.leetcode !== false;
    $('runBtn').disabled = !capable;
    $('submitBtn').disabled = !capable;
    if (!caps.llm) disable($('solutionBtn'), 'Model not configured on the server');
    window.syncDebugButton?.();
  }
  paintSessionBar();
}

/** Counts an aid once per session (opening Hints twice is still one aid). */
function noteAid(name) {
  if (!session.running || session.aids.includes(name)) return;
  session.aids.push(name);
  publishSession();
  paintSessionBar();
}
window.noteCodingAid = noteAid;

// --- pacing --------------------------------------------------------------------
// The shape of a 45-minute Google round, scaled to the chosen length.
const PHASES = [
  { id: 'intro', label: 'Intro', end: 5 },
  { id: 'clarify', label: 'Clarify & approach', end: 15 },
  { id: 'code', label: 'Code', end: 35 },
  { id: 'test', label: 'Test & follow-up', end: 45 },
];
const phaseAt = (elapsedMs, durationMs) => {
  const at = (elapsedMs / durationMs) * 45;
  return PHASES.find(p => at < p.end) || PHASES[PHASES.length - 1];
};
const phaseEndMs = (p, durationMs) => (p.end / 45) * durationMs;
const COMPLEXITY_RE = /\bO\s*\(\s*[^)\n]{1,24}\)|\bbig[\s-]?o\b|\b(?:time|space)\s+complexity\b|\b(?:linear|quadratic|logarithmic|constant|log[\s-]?linear)\s+(?:time|space)\b|\bn\s*log\s*n\b/i;

function mmss(ms) {
  const t = Math.max(0, Math.round(ms / 1000));
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

/** The status bar and other modules read the mock's state from here. */
function publishSession() {
  const elapsed = session.running ? Date.now() - session.startedAt
    : session.endedAt ? session.endedAt - session.startedAt : 0;
  window.QF_SESSION = {
    running: session.running,
    startedAt: session.startedAt || null,
    durationMs: session.durationMs,
    firstCodeAt: session.firstCodeAt || null,
    realistic: !!session.realistic,
    phase: session.running || session.endedAt ? phaseAt(elapsed, session.durationMs).id : null,
    phaseLabel: session.running || session.endedAt ? phaseAt(elapsed, session.durationMs).label : null,
    endedAt: session.endedAt || null,
    aidsUsed: session.aids.length,
  };
}

/** The candidate's first statement of complexity, from the timestamped chat. */
function complexityEvidence() {
  const timeline = window.Interviewer?.timeline?.() || [];
  const hit = timeline.find(m => m.role === 'user' && m.at >= session.startedAt && COMPLEXITY_RE.test(m.content || ''));
  if (hit) return { stated: true, atMs: hit.at - session.startedAt };
  const transcript = window.Interviewer?.transcript?.() || [];
  return { stated: transcript.some(m => m.role === 'user' && COMPLEXITY_RE.test(m.content || '')), atMs: null };
}

function pacingEvidence() {
  const end = session.endedAt || Date.now();
  const cx = complexityEvidence();
  const sec = ms => (ms == null ? null : Math.round(ms / 1000));
  return {
    durationMin: Math.round(session.durationMs / 60000),
    elapsedSec: sec(end - session.startedAt),
    firstCodeSec: session.firstCodeAt ? sec(session.firstCodeAt - session.startedAt) : null,
    codeTargetSec: sec(phaseEndMs(PHASES[1], session.durationMs)),
    complexityStated: cx.stated,
    complexityAtSec: sec(cx.atMs),
    samplesPassSec: session.samplesPassAt ? sec(session.samplesPassAt - session.startedAt) : null,
    phase: phaseAt(end - session.startedAt, session.durationMs).label,
    followUp: session.followUp === 'samples-pass' ? 'after the samples passed'
      : session.followUp === 'time' ? 'at about 70% of the time' : null,
  };
}

/** One Google-style follow-up per round: when the samples pass, or at ~70%. */
async function triggerFollowUp(reason) {
  if (!session.running || session.followUp || session.followUpPending || !caps.llm) return;
  // A failed attempt waits a minute before retrying, at most twice per session.
  if (session.followUpTries >= 2 || Date.now() < session.followUpRetryAt) return;
  if (typeof window.Interviewer?.followUp !== 'function') return;
  session.followUpPending = true;
  session.followUpTries++;
  const startedAt = session.startedAt;
  try {
    const ok = await window.Interviewer.followUp(reason);
    if (ok && session.startedAt === startedAt) {
      session.followUp = reason;
      if ($('chatPane').classList.contains('hidden')) window.QF?.toast?.('Your interviewer has a follow-up question.');
    } else if (session.startedAt === startedAt) session.followUpRetryAt = Date.now() + 60000;
  } catch {
    if (session.startedAt === startedAt) session.followUpRetryAt = Date.now() + 60000;
  } finally {
    session.followUpPending = false;
    publishSession();
  }
}

function noteSamplesPassed() {
  if (!session.running) return;
  if (!session.samplesPassAt) session.samplesPassAt = Date.now();
  triggerFollowUp('samples-pass');
}

/** A thin strip above the editor during a mock: phase, pacing and aids. */
function paintSessionBar() {
  let bar = $('mockBar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'mockBar';
    bar.className = 'mock-bar hidden';
    bar.setAttribute('role', 'status');
    bar.innerHTML = '<span class="mb-phase"></span><span class="mb-real"></span><span class="mb-aids"></span>' +
      '<button type="button" class="ghost mb-unlock">Unlock aids</button>';
    $('editorWrap').before(bar);
    bar.querySelector('.mb-unlock').onclick = () => {
      if (!confirm('Unlock Run, Submit, Debug, Solution and Hints for this interview? Anything you open is counted in the write-up.')) return;
      session.aidsUnlocked = true;
      applyAidLocks();
    };
  }
  bar.classList.toggle('hidden', !session.running);
  if (!session.running) return;
  const elapsed = Date.now() - session.startedAt;
  const p = phaseAt(elapsed, session.durationMs);
  const idx = PHASES.indexOf(p) + 1;
  let next = '';
  if (p.id === 'intro' || p.id === 'clarify') next = ` · aim to code by ${mmss(phaseEndMs(PHASES[1], session.durationMs))}`;
  else if (p.id === 'code') next = session.firstCodeAt ? ` · test from ${mmss(phaseEndMs(PHASES[2], session.durationMs))}` : ' · no code yet';
  bar.querySelector('.mb-phase').textContent = `Phase ${idx}/4 · ${p.label}${next}`;
  bar.querySelector('.mb-real').textContent = session.realistic ? (aidsLocked() ? 'Google realistic · no running code' : 'Google realistic · aids unlocked') : '';
  bar.querySelector('.mb-real').title = session.realistic ? REAL_TIP : '';
  bar.querySelector('.mb-aids').textContent = session.aids.length || session.realistic ? `Aids used: ${session.aids.length}` : '';
  bar.querySelector('.mb-aids').title = session.aids.join(', ');
  bar.querySelector('.mb-unlock').classList.toggle('hidden', !aidsLocked());
}

/** Realistic-mode and length controls, injected into the Start dialog. */
function ensureAskExtras() {
  let box = $('askCodingExtra');
  if (box) return box;
  const host = document.querySelector('#modeAsk .ask-options');
  if (!host) return null;
  box = document.createElement('div');
  box.id = 'askCodingExtra';
  box.className = 'ask-extra hidden';
  box.innerHTML = `
    <label class="ask-real">
      <input type="checkbox" id="askRealistic">
      <span><strong>Google realistic</strong>
        <small>No Run, Submit, Debug, Solution or Hints — like the real round, you test by tracing your code by hand. Aids can be unlocked, but they are counted.</small></span>
    </label>
    <label class="ask-dur"><span>Length</span>
      <select id="askDuration" aria-label="Interview length">
        <option value="30">30 min</option><option value="45">45 min</option><option value="60">60 min</option>
      </select></label>`;
  host.before(box);
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem('mockPrefs') || '{}'); } catch { /* defaults */ }
  $('askRealistic').checked = saved.realistic === true;
  $('askDuration').value = ['30', '45', '60'].includes(String(saved.minutes)) ? String(saved.minutes) : '45';
  return box;
}

// The dialog's Cancel button (added by behavioural.js) closes it through its
// Escape handler; note it here, in the capture phase, so Start can back out.
let askCancelled = false;
document.addEventListener('click', e => {
  if (e.target.closest?.('#modeAsk .ask-cancel')) askCancelled = true;
}, true);
// Escape in that dialog cancels too (voice.js resolves it as "text" otherwise).
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && $('modeAsk') && !$('modeAsk').classList.contains('hidden')) askCancelled = true;
}, true);

async function startSession() {
  if (session.running) return;
  // Ask once per interview rather than relying on a setting the candidate set
  // days ago and has forgotten about.
  const extras = ensureAskExtras();
  extras?.classList.remove('hidden');
  askCancelled = false;
  if (typeof window.askInterviewMode === 'function') await window.askInterviewMode();
  extras?.classList.add('hidden');
  if (askCancelled) { askCancelled = false; $('startBtn').focus(); return; }   // Cancel backs out
  const realistic = !!$('askRealistic')?.checked;
  const minutes = Number($('askDuration')?.value) || 45;
  try { localStorage.setItem('mockPrefs', JSON.stringify({ realistic, minutes })); } catch { /* private mode */ }
  Object.assign(session, {
    running: true, startedAt: Date.now(), endedAt: 0, durationMs: minutes * 60000,
    runs: 0, submits: 0, verdict: null, accepted: false, result: null,
    realistic, aidsUnlocked: false, aids: [], firstCodeAt: 0, samplesPassAt: 0,
    followUp: null, followUpPending: false, followUpTries: 0, followUpRetryAt: 0,
  });
  codingControls();
  $('timer').classList.add('live');
  $('timer').classList.remove('ended');
  paintClock();
  // Open the interviewer panel and let them introduce themselves.
  const pane = $('chatPane');
  if (pane.classList.contains('hidden')) $('panelBtn').click();
  window.beginCodingInterview?.();
  if (realistic) window.QF?.toast?.('Google realistic: Run, Submit, Debug, Solution and Hints are off. Trace your code by hand.');
}

/** Ends the session and records it. Called by Stop, at 00:00, and after the
 *  candidate confirms switching question or tab so the attempt is not lost. */
function stopSession(reason) {
  if (!session.running) return;
  session.running = false;
  // A throttled background tab can notice 00:00 late; time-up ends at the limit.
  session.endedAt = reason === 'time' ? Math.min(Date.now(), session.startedAt + session.durationMs) : Date.now();
  $('timer').classList.remove('live');
  $('timer').classList.add('ended');
  codingControls();
  paintClock();
  const durationSec = Math.round((session.endedAt - session.startedAt) / 1000);
  const transcript = window.Interviewer?.transcript?.() || [];
  const pacing = pacingEvidence();
  const facts = { realistic: session.realistic, aidsUsed: session.aids.length, aids: session.aids.slice(), pacing };
  if (current && durationSec >= 5) window.Learn?.noteAttempt?.(current.title, session.accepted);
  if (current && durationSec >= 5 && window.History) {
    const entryId = window.History.save({
      type: 'coding',
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      durationSec,
      slug: current.slug,
      questionId: current.id,
      title: current.title,
      difficulty: current.difficulty,
      topics: current.topicTags || [],
      lang: langSel.value,
      runs: session.runs,
      submits: session.submits,
      verdict: session.verdict,
      accepted: session.accepted,
      endedBy: reason || 'stopped',
      code: Editor.value,
      result: session.result,
      transcript,
      statement: current.plainStatement ? current.plainStatement.slice(0, 4000) : '',
      ...facts,
    });
    // The write-up is the point of ending an interview, so produce it now and
    // attach it to the entry that was just saved.
    scoreSession(entryId, transcript, facts, reason);
  }
  publishSession();
}

/** Plain facts the app measured, shown above the model's judgement. */
function sessionFactsHtml(f) {
  const p = f.pacing || {};
  const t = s => (s == null ? null : mmss(s * 1000));
  const rows = [
    ['Format', f.realistic ? 'Google realistic — no running code' : 'Practice mock (aids available)'],
    ['Aids used', f.aidsUsed ? `${f.aidsUsed} — ${f.aids.join(', ')}` : '0'],
    ['Time to first code', p.firstCodeSec != null ? `${t(p.firstCodeSec)} (aim: by ${t(p.codeTargetSec)})` : 'No code typed during the interview'],
    ['Complexity stated', p.complexityStated ? (p.complexityAtSec != null ? `Yes, first at ${t(p.complexityAtSec)}` : 'Yes') : 'Not found in the chat'],
    ['Phase reached', `${p.phase || '—'} · ${t(p.elapsedSec) || '00:00'} of ${p.durationMin || 45}:00`],
  ];
  if (p.samplesPassSec != null) rows.push(['Samples passed', `at ${t(p.samplesPassSec)}`]);
  rows.push(['Follow-up', p.followUp ? `Asked ${p.followUp}` : 'Not reached']);
  return `<div class="cs-facts"><h3>Session facts</h3><dl>${
    rows.map(([k, v]) => `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(String(v))}</dd>`).join('')}</dl></div>`;
}

/**
 * The shared scorecard puts its "Average ... across N dimensions" line after
 * the committee packet's four attributes, which reads as the wrong count. Recompute
 * it from the dimension rows actually rendered and put it beside them.
 */
function fixScoreMaths(box) {
  const rows = [...box.querySelectorAll('.bv-dims > .bv-dim')];
  const scores = rows.map(r => Number(r.querySelector('.bv-dim-score')?.textContent)).filter(Number.isFinite);
  [...box.querySelectorAll('p.bv-hint')].filter(p => /^\s*Average\b/.test(p.textContent)).forEach(p => p.remove());
  if (!scores.length) return;
  const total = scores.reduce((a, b) => a + b, 0), max = scores.length * 4;
  const ring = box.querySelector('.bv-ring span');
  if (ring) ring.textContent = `${total}/${max}`;
  const note = document.createElement('p');
  note.className = 'bv-hint cs-avg';
  note.textContent = `Interview signals: average ${(total / scores.length).toFixed(1)} / 4 across the ${scores.length} signals above (${total} of ${max}).`;
  box.querySelector('.bv-dims')?.after(note);
  const attrs = [...box.querySelectorAll('.pk-attrs .pk-attr > b')].map(b => Number(b.textContent)).filter(Number.isFinite);
  if (attrs.length) {
    const pk = document.createElement('p');
    pk.className = 'bv-hint cs-avg';
    pk.textContent = `Committee attributes: average ${(attrs.reduce((a, b) => a + b, 0) / attrs.length).toFixed(1)} / 4 across the ${attrs.length} attributes above.`;
    box.querySelector('.pk-attrs')?.after(pk);
  }
}
window.fixScorecardMaths = fixScoreMaths;

/** Scores the finished session and folds the result into its history entry. */
async function scoreSession(entryId, transcript, facts, reason) {
  const box = $('codeScoreBox');
  const overlay = $('codeScore');
  if (!box || !overlay) return;
  if (!transcript.length && !Editor.value.trim()) return;   // nothing happened

  overlay.classList.remove('hidden');
  const lead = reason === 'time' ? '<p class="cs-timeup" role="status">Time’s up — the interview has ended.</p>' : '';
  box.innerHTML = `${lead}${sessionFactsHtml(facts)}<p class="cs-pending">Writing up the interview…<br>This takes twenty seconds or so.</p>`;

  try {
    const res = await fetch('/api/coding/score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: current?.title,
        difficulty: current?.difficulty,
        transcript,
        code: Editor.value,
        lang: langSel.value,
        result: session.result,
        realistic: facts.realistic,
        aidsUsed: facts.aidsUsed,
        aids: facts.aids,
        pacing: facts.pacing,
        model: window.Settings?.modelFor('behaviouralScore'),
      }),
    });
    const card = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(card.error || `Request failed (${res.status})`);
    box.innerHTML = lead + (window.scorecardHtml ? window.scorecardHtml(card) : '');
    fixScoreMaths(box);
    (box.querySelector('.bv-verdict') || box.firstChild)?.insertAdjacentHTML('afterend', sessionFactsHtml(facts));
    window.History?.attachScore?.(entryId, card);
  } catch (e) {
    box.innerHTML = `${lead}${sessionFactsHtml(facts)}<p class="cs-pending bv-err">Could not write this one up: ${
      String(e.message).replace(/[<>&]/g, '')}<br>The session is still saved in History.</p>
      <p><button type="button" class="ghost" id="csRetry">Try again</button></p>`;
    $('csRetry').onclick = () => scoreSession(entryId, transcript, facts, reason);
  }
}
window.stopCodingSession = stopSession;

/** Back to an unstarted clock (a new question, after the last one ended). */
function resetTimer() {
  if (session.running) return;
  session.endedAt = 0;
  session.startedAt = 0;
  $('timer').classList.remove('ended');
  paintClock();
  publishSession();
}

/**
 * The clock is derived from session.startedAt on every paint, never counted
 * down, so a throttled background tab cannot drift. Running: time left.
 * Ended: the final elapsed time. Idle: the chosen length.
 */
function paintClock() {
  let text, warn = false, title;
  if (session.running) {
    const elapsed = Date.now() - session.startedAt;
    const left = session.durationMs - elapsed;
    if (left <= 0) { timeUp(); return; }
    text = mmss(Math.ceil(left / 1000) * 1000);
    warn = left <= 5 * 60000;
    title = `${mmss(elapsed)} elapsed · phase: ${phaseAt(elapsed, session.durationMs).label}`;
  } else if (session.endedAt) {
    const used = session.endedAt - session.startedAt;
    text = `Ended ${mmss(used)}`;
    title = `The interview ended after ${mmss(used)}`;
  } else {
    text = mmss(session.durationMs);
    title = 'Session clock — press Start for a timed mock';
  }
  for (const el of [$('timer'), $('chatTimer')]) {
    if (!el) continue;
    el.textContent = text;
    el.title = title;
    el.classList.toggle('warn', warn);
  }
  $('timer').setAttribute('aria-label', title);
}

function timeUp() {
  if (!session.running) return;
  stopSession('time');
  // The write-up says so itself; only announce it when there is no write-up.
  if ($('codeScore')?.classList.contains('hidden')) window.QF?.toast?.('Time\u2019s up \u2014 the interview has ended.');
}

/** The status pill beside the title (To do / Attempted / Solved), backed by
 *  the same progress store Learn, Home and NeetCode read. */
function renderSolved() {
  const sel = $('qStatus');
  if (!sel) return;
  const s = current && window.Learn?.status ? window.Learn.status(current.title) : 'todo';
  sel.value = s;
  sel.className = `q-status ${s}`;
  sel.disabled = !current;
}
$('qStatus').onchange = () => {
  if (!current || !window.Learn?.setStatus) return;
  window.Learn.setStatus(current.title, $('qStatus').value);
  renderSolved();
  refreshPickerTicks();
};
function refreshPickerTicks() {
  const keep = qSel.value;
  listItems(listSel.value).then(qs => { fillPicker(qs); if (keep) selectQuestion(keep, current?.slug === keep ? `${current.id}. ${current.title}` : keep); }).catch(() => {});
}
// Status changed in another tab (progress store) → repaint pill and ticks.
window.addEventListener('progress-changed', () => { renderSolved(); refreshPickerTicks(); });

// --- question pane tabs: Description / Hints / Submissions -----------------
function showQTab(name) {
  document.querySelectorAll('.q-tab').forEach(t => {
    const on = t.dataset.qtab === name;
    t.classList.toggle('sel', on);
    t.setAttribute('aria-selected', String(on));
  });
  const ids = { description: 'qTabDescription', hints: 'qTabHints', submissions: 'qTabSubmissions', animate: 'qTabAnimate', short: 'qTabShort', notes: 'qTabNotes' };
  Object.entries(ids).forEach(([k, id]) => $(id)?.classList.toggle('sel', k === name));
  if (name === 'submissions') renderSubmissions();
  if (name === 'hints') noteAid('Hints');
  if (name === 'animate') renderAnimTab();
  if (name === 'short') renderShortTab();
  if (name === 'notes') renderNotesTab();
}

// --- Animate / Short / Notes tabs (LeetCode-style panel, QuantFlash extras) --
const qExtra = { animFor: null, animState: { which: 'both', caseIdx: 0 } };
function renderAnimTab() {
  const box = $('qAnim');
  if (!box || !current) return;
  if (qExtra.animFor === current.slug && box.childElementCount) return;
  qExtra.animFor = current.slug; qExtra.animState = { which: 'both', caseIdx: 0 };
  if (!window.QFTrace?.mount) { box.innerHTML = '<p class="hs-empty">The animation player is still loading — try again in a moment.</p>'; return; }
  box.innerHTML = '';
  try { window.QFTrace.mount(box, current, qExtra.animState); }
  catch { box.innerHTML = '<p class="hs-empty">This problem could not be animated.</p>'; }
}
const escHtml = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
async function renderShortTab() {
  const box = $('qShort');
  if (!box || !current) return;
  const slug = current.slug;
  box.innerHTML = '<p class="hs-empty">Loading…</p>';
  const all = (await window.QFShorts?.index?.().catch(() => [])) || [];
  if (current?.slug !== slug) return;
  const s = all.find(x => x.slug === slug);
  const pat = s ? null : all.find(x => x.kind === 'pattern' && (current.topicTags || []).some(t => (x.pattern || '').toLowerCase().includes(String(t).toLowerCase().split(' ')[0])));
  if (s) {
    box.innerHTML = `<div class="qx-card">
      <div class="qx-kicker">2-minute Short · ${escHtml(s.pattern || '')}</div>
      <h3>${escHtml(s.title)}</h3>
      <p class="qx-hook">${escHtml(s.hook || '')}</p>
      <div class="qx-grid">
        <div><span>The trick</span>${escHtml(s.insight || '—')}</div>
        <div><span>Brute → optimal</span>${escHtml(s.bruteTime || '?')} → <b>${escHtml(s.time || '?')}</b></div>
      </div>
      <button type="button" class="primary qx-play">▶ Play the Short</button>
      <p class="qx-small">Problem → brute force → the insight → watch it run → code → quick check → remember it.</p>
    </div>`;
    box.querySelector('.qx-play').onclick = () => window.QFShorts.open(slug);
  } else {
    box.innerHTML = `<div class="qx-card"><h3>No Short for this problem yet</h3>
      <p class="qx-hook">${pat ? `The pattern it uses has one: <b>${escHtml(pat.title)}</b>.` : 'Try the Animate tab to watch the solution run step by step.'}</p>
      ${pat ? '<button type="button" class="primary qx-play">▶ Play the pattern Short</button>' : ''}</div>`;
    if (pat) box.querySelector('.qx-play').onclick = () => window.QFShorts.open(pat.slug);
  }
}
const NOTES_KEY = 'qf.qnotes';
const readNotes = () => { try { return JSON.parse(localStorage.getItem(NOTES_KEY) || '{}') || {}; } catch { return {}; } };
function renderNotesTab() {
  const box = $('qNotes');
  if (!box || !current) return;
  const slug = current.slug, n = readNotes()[slug] || {};
  const marked = !!window.QFShorts?.isMarked?.(slug);
  box.innerHTML = `<div class="qx-card">
    <label class="qx-label" for="qxTrick">The trick, in your own words — one line</label>
    <textarea id="qxTrick" rows="3" placeholder="e.g. keep days that are still waiting on a stack; a warmer day pops them">${escHtml(n.trick || '')}</textarea>
    <label class="qx-label" for="qxPit">What tripped you up (so you remember next time)</label>
    <textarea id="qxPit" rows="2" placeholder="e.g. stored values instead of indices">${escHtml(n.pitfall || '')}</textarea>
    <div class="qx-row">
      <button type="button" class="qx-mark${marked ? ' on' : ''}" aria-pressed="${marked}">${marked ? '★ Marked for revision' : '☆ Mark for revision'}</button>
      <span class="qx-saved" aria-live="polite">${n.at ? `Saved ${new Date(n.at).toLocaleDateString()}` : ''}</span>
    </div></div>`;
  let t = 0;
  const save = () => {
    clearTimeout(t);
    t = setTimeout(() => {
      const all = readNotes();
      all[slug] = { trick: $('qxTrick').value.trim(), pitfall: $('qxPit').value.trim(), at: Date.now() };
      if (!all[slug].trick && !all[slug].pitfall) delete all[slug];
      try { localStorage.setItem(NOTES_KEY, JSON.stringify(all)); } catch { /* storage full */ }
      box.querySelector('.qx-saved').textContent = 'Saved';
    }, 400);
  };
  $('qxTrick').oninput = save; $('qxPit').oninput = save;
  box.querySelector('.qx-mark').onclick = () => {
    const on = !window.QFShorts?.isMarked?.(slug);
    window.QFShorts?.setMarked?.(slug, on);
    renderNotesTab();
  };
}
window.addEventListener('question-changed', () => { qExtra.animFor = null; const a = $('qAnim'); if (a) a.innerHTML = ''; });
document.querySelectorAll('.q-tab').forEach(t => t.onclick = () => showQTab(t.dataset.qtab));

/** LeetCode-style hints: collapsed, revealed one at a time so they do not spoil. */
function renderHints(q) {
  const box = $('qHints');
  const hints = (q.hints || []).filter(Boolean);
  const tab = document.querySelector('.q-tab[data-qtab="hints"]');
  tab.textContent = hints.length ? `Hints (${hints.length})` : 'Hints';
  if (!hints.length) {
    box.innerHTML = '<p class="hs-empty">No hints for this question.' +
      (caps.llm ? ' Ask the interviewer for a nudge instead.' : '') + '</p>' +
      (caps.llm ? '<button class="ghost ai-hint-btn" type="button">&#10024; Ask for a hint</button>' : '');
    box.querySelector('.ai-hint-btn')?.addEventListener('click', aiHint);
    return;
  }
  box.innerHTML = hints.map((h, i) =>
    `<details class="q-hint"><summary>Hint ${i + 1}</summary><div class="prose">${h}</div></details>`).join('') +
    (caps.llm ? '<button class="ghost ai-hint-btn" type="button" title="A hint tailored to the code you have written so far">&#10024; Hint for my code</button>' : '');
  box.querySelector('.ai-hint-btn')?.addEventListener('click', aiHint);
}

/** Difficulty, acceptance and topic chips under the title. */
function renderMeta(q) {
  const diff = q.difficulty[0] + q.difficulty.slice(1).toLowerCase();
  const chips = [`<span class="chip diff ${q.difficulty.toLowerCase()}">${diff}</span>`];
  if (q.acRate) chips.push(`<span class="chip" title="LeetCode acceptance rate">${escapeHtml(q.acRate)} acc.</span>`);
  if (q.paidOnly) chips.push('<span class="chip premium" title="Premium on LeetCode; statement paraphrased here">Premium</span>');
  // Topic tags behind a toggle, like LeetCode, so they do not spoil the approach.
  if (q.topicTags.length) {
    chips.push(`<details class="chip-topics"><summary class="chip">Topics</summary><span>${
      q.topicTags.map(t => `<span class="chip">${escapeHtml(t)}</span>`).join('')}</span></details>`);
  }
  $('qMeta').innerHTML = chips.join('');
  // Topic tags give the approach away, so opening them is an aid.
  $('qMeta').querySelector('.chip-topics')?.addEventListener('toggle', e => { if (e.target.open) noteAid('Topic tags'); });
}

function renderSimilar(q) {
  const box = $('qSimilar');
  if (!q.similar?.length) { box.innerHTML = ''; return; }
  box.innerHTML = `<details class="q-similar-box"><summary>Similar questions (${q.similar.length})</summary><ul>${
    q.similar.map(s => `<li><button type="button" class="link" data-slug="${escapeHtml(s.slug)}" data-title="${escapeHtml(s.title)}">${
      escapeHtml(s.title)}</button> <span class="chip diff ${String(s.difficulty).toLowerCase()}">${escapeHtml(s.difficulty)}</span></li>`).join('')}</ul></details>`;
  box.onclick = e => {
    const b = e.target.closest('button[data-slug]');
    if (!b) return;
    if (!confirmEndMock('Opening a similar question', 'question-changed')) return;
    selectQuestion(b.dataset.slug, b.dataset.title);
    qSel.dispatchEvent(new Event('change'));
  };
}

/** Submissions tab in the question pane: the same rows as the console
 *  History tab, where LeetCode puts them. */
function renderSubmissions() {
  const box = $('qSubs');
  if (!current || !window.Attempts) { box.innerHTML = '<p class="hs-empty">Open a question first.</p>'; return; }
  const rows = window.Attempts.forQuestion(current.slug).filter(r => r.mode === 'submit');
  const subTab = document.querySelector('.q-tab[data-qtab="submissions"]');
  subTab.textContent = rows.length ? `Submissions (${rows.length})` : 'Submissions';
  if (!rows.length) {
    box.innerHTML = '<p class="hs-empty">No submissions yet. Runs are listed in the console History tab.</p>';
    return;
  }
  const when = ts => new Date(ts).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  box.innerHTML = `<table class="subs"><thead><tr><th>Status</th><th>Lang</th><th>Runtime</th><th>Memory</th><th></th></tr></thead><tbody>${
    rows.map(r => `<tr>
      <td><span class="${r.ok ? 'ok' : 'bad'}">${escapeHtml(r.verdict || '')}</span><small>${escapeHtml(when(r.at))}</small></td>
      <td>${escapeHtml(r.lang || '')}</td>
      <td>${escapeHtml(r.result?.runtime || '—')}</td>
      <td>${escapeHtml(r.result?.memory || '—')}</td>
      <td><button class="ghost" data-id="${r.id}" title="Load this code into the editor">Load</button></td>
    </tr>`).join('')}</tbody></table>`;
  box.onclick = e => {
    const b = e.target.closest('button[data-id]');
    if (!b) return;
    const r = window.Attempts.get(b.dataset.id);
    if (r?.code) window.loadIntoEditor?.(r.code, { lang: r.lang });
  };
}

/** Coding practice has no interviewer pane (CSS hides #chatPane there), so a
 *  hint or failure explanation sent to the chat was never seen. In practice
 *  the answer is shown inline instead, under the button that asked for it. */
const isPracticeView = () => !session.running && document.documentElement.dataset.coding !== 'interview';

async function practiceAsk(prompt, host, label) {
  if (!host) return;
  const result = $('result');
  const lastResult = result && !result.classList.contains('result-empty')
    ? result.innerText.replace(/^(Why it failed|Hint): [\s\S]*$/m, '').slice(0, 4000) : '';
  let out = host.querySelector('.ai-inline');
  if (!out) {
    out = document.createElement('div');
    out.className = 'ai-inline';
    out.setAttribute('role', 'status');
    out.style.cssText = 'margin:10px 0;padding:10px 12px;border:1px solid var(--line);border-radius:10px;background:var(--bg-alt);white-space:pre-wrap;line-height:1.5;font-size:13.5px;overflow-wrap:anywhere';
    host.append(out);
  }
  out.textContent = `${label}: thinking…`;
  try {
    const d = await api('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: prompt }],
        model: window.Settings?.modelFor?.('codingChat'),
        profile: window.Profile?.active?.(),
        context: {
          title: current?.title,
          difficulty: current?.difficulty,
          statement: current?.plainStatement,
          code: Editor.value.split('\n').map((l, i) => `${i + 1}: ${l}`).join('\n'),
          lang: langSel.value,
          testInput: $('testInput').value,
          lastResult,
        },
      }),
    });
    if (!out.isConnected) return;
    out.textContent = `${label}: ${d.reply || '(no reply)'}`;
  } catch (e) {
    if (out.isConnected) out.textContent = `${label}: could not get an answer — ${e.message}`;
  }
}

/** Asks the interviewer for a hint about the current code, in the chat pane. */
function aiHint() {
  if (!caps.llm || aidsLocked()) return;
  noteAid('AI hint');
  if (isPracticeView()) {
    practiceAsk('Give me one small hint for where I am right now — look at my code and nudge me toward the next step without giving the solution.', $('qHints'), 'Hint');
    return;
  }
  const pane = $('chatPane');
  if (pane.classList.contains('hidden')) $('panelBtn').click();
  window.Interviewer?.ask?.('Give me one small hint for where I am right now — look at my code and nudge me toward the next step without giving the solution.');
}

/** "Suggest fixes": a reviewable diff of the smallest changes that fix the code in the editor. */
function suggestFixes() {
  if (!caps.llm || !session.result || aidsLocked()) return;
  noteAid('Suggest fixes');
  window.QFFix?.open({
    code: Editor.value, title: current?.title, statement: current?.plainStatement, lang: langSel.value,
    result: session.result, testInput: $('testInput').value, model: window.Settings?.modelFor?.('codingSolution'),
  }, (code, { run }) => window.loadIntoEditor(code, { run }));
}

/** "Explain this failure": sends the judge output to the interviewer. */
function aiExplainFailure() {
  if (!caps.llm || !session.result || aidsLocked()) return;
  noteAid('Explain failure');
  const explain = 'My last run failed. Look at the result (verdict, failing input, expected vs actual output, any error) and my code, and explain in two or three sentences what is wrong and which line to look at. Do not paste a full solution.';
  if (isPracticeView()) { practiceAsk(explain, $('result'), 'Why it failed'); return; }
  const pane = $('chatPane');
  if (pane.classList.contains('hidden')) $('panelBtn').click();
  window.Interviewer?.ask?.(explain);
}

// --- leaving a running mock ----------------------------------------------------
/**
 * Anything that would end a running mock asks first — once. Confirming ends
 * the session (and opens its write-up) before the move happens, so the
 * follow-on handlers see no running session and do not ask again.
 */
function confirmEndMock(what, reason) {
  if (!session.running) return true;
  const ok = confirm(`${what} will end your mock interview (${mmss(Date.now() - session.startedAt)} in) and open the write-up.\n\nEnd the interview and continue?`);
  if (ok) stopSession(reason);
  return ok;
}

// The mode buttons switch tabs from their own click handlers (and the shell's
// nav clicks them), so intercept in the capture phase, before they run.
document.addEventListener('click', e => {
  if (!session.running) return;
  const b = e.target.closest?.('button.mode[id^="mode"]');
  if (!b || b.id === 'modeCoding' || document.body.dataset.mode !== 'coding') return;
  if (!confirmEndMock('Leaving the Coding tab', 'left-tab')) { e.preventDefault(); e.stopImmediatePropagation(); }
}, true);

// Programmatic switches (Home cards, Learn links, …) go through
// window.setInterviewMode, which behavioural.js defines after this file loads.
function guardModeSwitch() {
  const orig = window.setInterviewMode;
  if (typeof orig !== 'function' || orig.guarded) return;
  const guarded = function (mode, ...rest) {
    if (mode !== 'coding' && document.body.dataset.mode === 'coding' && !confirmEndMock('Leaving the Coding tab', 'left-tab')) return;
    return orig.call(this, mode, ...rest);
  };
  guarded.guarded = true;
  window.setInterviewMode = guarded;
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', guardModeSwitch); else setTimeout(guardModeSwitch, 0);

window.addEventListener('beforeunload', e => {
  if (!session.running) return;
  e.preventDefault();
  e.returnValue = '';   // the browser shows its own "leave site?" prompt
});

// --- prev / next question ----------------------------------------------------
function stepQuestion(delta) {
  const opts = [...qSel.options];
  if (!opts.length) return;
  if (!confirmEndMock('Moving to another question', 'question-changed')) return;
  const i = Math.max(0, opts.findIndex(o => o.value === qSel.value));
  const next = (i + delta + opts.length) % opts.length;
  qSel.value = opts[next].value;
  qSel.dispatchEvent(new Event('change'));
}
$('qPrev').onclick = () => stepQuestion(-1);
$('qNext').onclick = () => stepQuestion(1);

/** Loads the question selected in the picker. Returns false when the
 *  candidate chose to keep a running mock instead. */
async function loadQuestion() {
  if (session.running && current && qSel.value !== current.slug &&
      !confirmEndMock('Changing question', 'question-changed')) {
    qSel.value = current.slug;
    return false;
  }
  if (session.running && current && qSel.value === current.slug) return true;
  saveDraft();   // keep the last few seconds of typing on the question being left
  const q = await api(`/api/question/${qSel.value}`);
  current = q;
  q.plainStatement = htmlToText(q.content);
  window.currentQuestion = q;
  window.Interviewer?.reset();
  window.resetSolutionPane?.();
  resetTimer();
  $('qTitle').textContent = `${q.id}. ${q.title}`;
  renderSolved();
  if (document.body.dataset.mode === 'coding') window.syncDocumentTitle?.('coding');
  renderMeta(q);
  $('qBody').innerHTML = q.content || '<p>Premium content unavailable.</p>';
  renderHints(q);
  renderSimilar(q);
  renderSubmissions();
  showQTab('description');
  $('promptPane').scrollTop = 0;
  $('testInput').value = q.exampleTestcases || q.sampleTestCase || '';
  window.TestCases?.setQuestion?.(q);
  applyLang();
  renderTopicLinks(q.slug);
  window.AttemptsUI?.setQuestion?.(q.slug);
  window.dispatchEvent(new CustomEvent('question-changed', { detail: { slug: q.slug } }));
  try { localStorage.setItem(LASTQ_KEY, JSON.stringify({ list: listSel.value, slug: q.slug })); } catch { /* storage full */ }
  return true;
}

/** "Learn the pattern" links to the handbook topics that teach this question. */
async function renderTopicLinks(slug) {
  let row = $('qTopics');
  if (!row) {
    row = document.createElement('div');
    row.id = 'qTopics';
    row.className = 'q-topics';
    $('qMeta').insertAdjacentElement('afterend', row);
    row.onclick = e => {
      const b = e.target.closest('button[data-topic]');
      if (!b) return;
      if (session.running && !confirmEndMock('Opening the pattern handbook', 'left-tab')) return;
      window.openProLearn?.(b.dataset.topic);
    };
  }
  row.textContent = '';
  try {
    const { topics } = await api(`/api/prolearn-for/${encodeURIComponent(slug)}`);
    if (!topics.length || slug !== current?.slug) return;
    const label = document.createElement('span');
    label.className = 'q-topics-label';
    label.textContent = 'Learn the pattern';
    row.append(label, ...topics.slice(0, 4).map(t => {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.topic = t.slug;
      b.title = `${t.chapter} › ${t.group}`;
      b.textContent = t.title;
      return b;
    }));
  } catch { /* the handbook is optional; leave the row empty */ }
}

let plainMode = localStorage.getItem('plainMode') === '1';

function templateForCurrent() {
  return plainMode ? plainTemplate(current, langSel.value) : snippetFor(current, langSel.value);
}

function applyLang() {
  if (!current) return;
  Editor.plain = plainMode;
  // A blank draft (e.g. autosaved while the template was missing) must not
  // shadow the real template.
  const key = draftKey();
  const draft = drafts[key];
  Editor.value = (draft && draft.trim()) ? draft : templateForCurrent();
  editorKey = key;
  // Whether Run needs the judge depends on the language (canRunLocally()).
  codingControls();
}

// chat.js (and the inline practice answers) only read the result when
// #result lacks .result-empty, but nothing ever removed that class, so the
// interviewer's "Explain" never saw the verdict it was asked to explain.
// Keep the class in step with whether a real result is showing.
new MutationObserver(() => {
  const r = $('result');
  r.classList.toggle('result-empty', !r.querySelector('.verdict, .rs-local-banner, .res-unavail'));
}).observe($('result'), { childList: true });

function markResultStale(message = 'Code changed — run or submit again.') {
  const result = $('result');
  if (!result) return;
  result.innerHTML = `<p class="sol-placeholder">${escapeHtml(message)}</p>`;
}

function resetTemplate() {
  if (!current) return;
  const key = draftKey();
  delete drafts[key];
  localStorage.setItem('drafts', JSON.stringify(drafts));
  plainMode = false;
  localStorage.setItem('plainMode', '0');
  syncPlainButton();
  Editor.plain = false;
  Editor.value = snippetFor(current, langSel.value);
  window.dispatchEvent(new Event('editor-replaced'));
  editorKey = draftKey();
  delete drafts[editorKey];
  try { localStorage.setItem('drafts', JSON.stringify(drafts)); } catch { /* quota */ }
  markResultStale('Code template reset — run or submit again.');
  statusEl.textContent = 'Code template reset';
  setTimeout(() => statusEl.textContent = '', 1200);
}

function showTab(name) {
  // The debugger panel replaces the console panes while it is open; a tab
  // click or a fresh result must close it, or the pane stays invisible.
  window.stopDebugger?.();
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  document.querySelectorAll('.tabpane').forEach(p => p.classList.toggle('active', p.id === `tab-${name}`));
  // Stacked phone layout that scrolls: bring a fresh result on screen. Only
  // when the page itself scrolls — scrollIntoView would otherwise shift an
  // overflow:hidden ancestor and push the toolbar out of view.
  const pageScrolls = getComputedStyle(document.body).overflowY !== 'hidden' &&
    document.scrollingElement.scrollHeight > innerHeight + 4;
  if (name === 'result' && pageScrolls && matchMedia('(max-width: 768px)').matches) {
    const r = $('console').getBoundingClientRect();
    if (r.top > innerHeight - 120 || r.bottom < 0) $('console').scrollIntoView({ block: 'start', behavior: 'smooth' });
  }
}
document.querySelectorAll('.tab[data-tab]').forEach(t => t.onclick = () => showTab(t.dataset.tab));   // 💬 Discuss is a window, not a pane

function row(label, value) {
  return value === undefined || value === null || value === '' ? '' : `<dt>${label}</dt><dd>${escapeHtml(String(value))}</dd>`;
}
const escapeHtml = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

function renderResult(d, mode) {
  let ok = d.status_msg === 'Accepted';
  let verdict = d.status_msg || 'Unknown';
  session.verdict = verdict;
  if (mode === 'submit') session.accepted = ok;
  // Keep the judge detail: without it a history entry can say "Wrong Answer"
  // but not which case failed or how fast it ran.
  session.result = {
    mode,
    status: d.status_msg || null,
    runtime: d.status_runtime || null,
    memory: d.status_memory || null,
    runtimePercentile: d.runtime_percentile ?? null,
    memoryPercentile: d.memory_percentile ?? null,
    passed: d.total_correct ?? null,
    total: d.total_testcases ?? null,
    lastTestcase: d.last_testcase || null,
    actual: Array.isArray(d.code_answer) ? d.code_answer.join('\n') : (d.code_answer || null),
    expected: Array.isArray(d.expected_code_answer)
      ? d.expected_code_answer.join('\n') : (d.expected_code_answer || null),
    stdout: Array.isArray(d.std_output_list) ? d.std_output_list.join('\n').trim() : null,
    error: d.runtime_error || d.compile_error || d.full_compile_error || null,
  };
  // The judge's last word on this question, for the "Review for Google" panel.
  window.QF_LAST_RESULT = { ...session.result, slug: current?.slug, at: Date.now() };
  let answers, expected;

  // The run endpoint only reports execution success, so compare outputs ourselves.
  if (mode === 'run' && ok) {
    answers = (d.code_answer || []).filter(x => x !== '');
    expected = (d.expected_code_answer || []).filter(x => x !== '');
    if (expected.length) {
      const passed = answers.filter((_, i) => casePasses(d, answers, expected, i)).length;
      ok = passed === expected.length && answers.length === expected.length;
      verdict = ok ? `Accepted · ${passed}/${expected.length} sample cases`
                   : `Wrong Answer · ${passed}/${expected.length} sample cases`;
    } else {
      verdict = 'Finished';
    }
  }

  const err = d.runtime_error || d.compile_error || d.full_compile_error;
  const stats = [];
  if (d.status_runtime && d.status_runtime !== 'N/A') stats.push(`<span class="rs-stat"><b>${escapeHtml(d.status_runtime)}</b>${
    d.runtime_percentile ? ` · beats ${d.runtime_percentile.toFixed(1)}%` : ''}</span>`);
  if (mode === 'submit' && d.status_memory) stats.push(`<span class="rs-stat"><b>${escapeHtml(d.status_memory)}</b>${
    d.memory_percentile ? ` · beats ${d.memory_percentile.toFixed(1)}%` : ''}</span>`);
  if (mode === 'submit' && d.total_correct !== undefined) stats.push(`<span class="rs-stat">${d.total_correct} / ${d.total_testcases} cases</span>`);

  let html = `<div class="rs-head"><div class="verdict ${ok ? 'ok' : 'bad'}">${escapeHtml(verdict)}</div>${stats.join('')}` +
    (!ok && caps.llm ? '<button class="ghost rs-explain" id="rsExplain" type="button" title="Ask the interviewer why this failed">&#10024; Explain</button>' : '') +
    (!ok && caps.llm && window.QFFix ? '<button class="ghost rs-explain" id="rsFix" type="button" title="See the smallest changes that fix YOUR code, and accept them one by one">&#129657; Suggest fixes</button>' : '') +
    '</div>';

  if (err) html += `<pre class="rs-err">${escapeHtml(String(err))}</pre>`;
  if (mode === 'run' && err && d.last_testcase) {
    html += `<div class="rs-row"><label>Failing input</label><pre>${escapeHtml(String(d.last_testcase))}</pre></div>`;
  }

  // Run mode: one pill per sample case, click to see input / output / expected.
  if (mode === 'run' && expected && expected.length) {
    const cases = window.TestCases?.cases?.() || [];
    const stdout = d.std_output_list || [];
    html += `<div class="rs-cases">${expected.map((e, i) =>
      `<button type="button" class="rs-case ${casePasses(d, answers, expected, i) ? 'ok' : 'bad'}${i === 0 ? ' sel' : ''}" data-i="${i}">` +
      `<span class="dot"></span>Case ${i + 1}</button>`).join('')}</div>` +
    `<div class="rs-detail">${expected.map((e, i) => {
      const input = cases[i] ? cases[i].map(p => `${p.name} = ${p.value}`).join('\n') : '';
      return `<div class="rs-case-body${i === 0 ? ' sel' : ''}" data-i="${i}">` +
        (input ? `<div class="rs-row"><label>Input</label><pre>${escapeHtml(input)}</pre></div>` : '') +
        (stdout[i] ? `<div class="rs-row"><label>Stdout</label><pre>${escapeHtml(stdout[i])}</pre></div>` : '') +
        `<div class="rs-row"><label>Output</label><pre class="${casePasses(d, answers, expected, i) ? '' : 'bad'}">${escapeHtml(answers[i] ?? '(none)')}</pre></div>` +
        `<div class="rs-row"><label>Expected</label><pre>${escapeHtml(e)}</pre></div></div>`;
    }).join('')}</div>`;
  } else if (mode === 'run' && ok) {
    html += `<div class="rs-row"><label>Output</label><pre>${escapeHtml((d.code_answer || []).join('\n'))}</pre></div>`;
    const so = (d.std_output_list || []).filter(Boolean).join('\n');
    if (so) html += `<div class="rs-row"><label>Stdout</label><pre>${escapeHtml(so)}</pre></div>`;
  }

  if (mode === 'submit' && !ok && (d.last_testcase || d.input)) {
    html += `<div class="rs-row"><label>Failing input</label><pre>${escapeHtml(d.last_testcase || d.input)}</pre></div>`;
    if (d.code_output) html += `<div class="rs-row"><label>Output</label><pre class="bad">${escapeHtml(String(d.code_output))}</pre></div>`;
    if (d.expected_output) html += `<div class="rs-row"><label>Expected</label><pre>${escapeHtml(String(d.expected_output))}</pre></div>`;
  }

  if (d.submission_id) {
    html += `<p class="rs-link"><a href="https://leetcode.com/submissions/detail/${d.submission_id}/" target="_blank" rel="noopener">View on LeetCode &#8599;</a></p>`;
  }
  // Accepted: the next problem in the list you are following, one click away.
  if (ok && mode === 'submit') {
    const opts = [...qSel.options], i = opts.findIndex(o => o.value === qSel.value);
    const nx = i >= 0 && i < opts.length - 1 ? opts[i + 1] : null;
    const src = listSel.selectedOptions[0]?.textContent?.replace(/\s*\(\d+\)$/, '') || 'this list';
    html += nx
      ? `<div class="rs-next"><span>Next in <b>${escapeHtml(src)}</b>:</span><button type="button" class="primary" id="rsNext">${escapeHtml(nx.textContent.replace(/^[✓✱]\s*/, ''))} →</button></div>`
      : `<div class="rs-next"><span>That was the last one in <b>${escapeHtml(src)}</b>. 🎉</span></div>`;
  }
  const box = $('result');
  box.innerHTML = html;
  box.querySelector('#rsNext')?.addEventListener('click', () => stepQuestion(1));
  box.querySelectorAll('.rs-case').forEach(b => b.onclick = () => {
    box.querySelectorAll('.rs-case, .rs-case-body').forEach(el => el.classList.toggle('sel', el.dataset.i === b.dataset.i));
  });
  box.querySelector('#rsExplain')?.addEventListener('click', aiExplainFailure);
  box.querySelector('#rsFix')?.addEventListener('click', suggestFixes);
  showTab('result');

  if (ok && (mode === 'submit' || (expected && expected.length))) noteSamplesPassed();

  // Progress follows the judge like LeetCode: any run marks Attempted, an
  // accepted submit marks Solved. The pill updates without a reload.
  if (current && window.Learn?.noteAttempt) {
    window.Learn.noteAttempt(current.title, mode === 'submit' && ok);
    renderSolved();
    if (mode === 'submit' && ok) refreshPickerTicks();
  }
}

// Run/Submit and the console are always available, regardless of interviewer mode.
window.syncConsoleVisibility = function () {
  $('console').style.display = '';
  $('hsplit').style.display = '';
  runBtn.style.display = '';
  submitBtn.style.display = '';
};
window.syncConsoleVisibility();

async function judge(mode) {
  if (!current) return;
  if (aidsLocked()) { window.QF?.toast?.(REAL_TIP); return; }
  if (session.realistic) noteAid(mode === 'run' ? 'Run' : 'Submit');
  saveDraft();
  runBtn.disabled = submitBtn.disabled = true;
  statusEl.textContent = mode === 'run' ? 'Running on LeetCode…' : 'Submitting to LeetCode…';
  const body = {
    slug: current.slug,
    questionId: current.questionId,
    lang: langSel.value,
    code: plainMode ? stripBanner(Editor.value, langSel.value) : Editor.value,
  };
  if (mode === 'run') body.dataInput = $('testInput').value;
  try {
    if (mode === 'run') session.runs++; else session.submits++;
    const d = await api(`/api/${mode}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    window.QF?.setJudge?.(true);
    renderResult(d, mode);
    recordAttempt(d, mode);
    statusEl.textContent = '';
  } catch (e) {
    statusEl.textContent = '';
    if (e.code === 'judge_auth') {
      window.QF?.setJudge?.(false, 'LeetCode cookie expired — update it in Settings');
      $('result').innerHTML = `<div class="res-unavail"><h3 style="color:var(--red)">LeetCode cookie expired</h3>
        <p>${escapeHtml(e.message)}</p><p><button type="button" class="primary" id="goJudgeSettings">Open Settings → LeetCode judge</button>
        ${mode === 'run' && langSel.value === 'python3' ? '<button type="button" class="ghost" id="runLocalNow">Run the examples here instead</button>' : ''}</p></div>`;
      $('goJudgeSettings').onclick = () => $('modeSettings')?.click();
      if ($('runLocalNow')) $('runLocalNow').onclick = () => runLocal(body.code, body.dataInput);
      showTab('result');
    } else if (e.code === 'upstream' || e.code === 'upstream_timeout') {
      window.QF?.setJudge?.(false, 'LeetCode unreachable');
      if (mode === 'run' && langSel.value === 'python3') {
        try { await runLocal(body.code, body.dataInput); }
        catch (le) {
          $('result').innerHTML = `<div class="rs-local-banner bad" role="status">LeetCode unreachable — and the local run failed: ${escapeHtml(le?.message || String(le))}</div>`;
          showTab('result');
        }
      } else {
        renderUnreachable(mode, e);
      }
    } else {
      $('result').innerHTML = renderFailure(e, mode);
      showTab('result');
    }
  } finally {
    codingControls();
  }
}

/** Plain (non-class) functions can run without LeetCode: JavaScript right
 *  here in the browser, Python 3 on our own server (never on LeetCode's). */
function canRunLocally(q = current) {
  if (!q) return false;
  const meta = pythonMeta(q);
  if (meta.classname || meta.systemdesign) return false;
  if (langSel.value === 'python3') return true;
  if (langSel.value === 'javascript') return !!meta.name;
  return false;
}

function localBanner(via) {
  if (via === 'server') return 'Ran your code on the examples here, on our own server — not on LeetCode’s judge (expected outputs shown when known)';
  return langSel.value === 'javascript'
    ? 'Ran your code right here in the browser — no server or LeetCode round trip (expected outputs shown when known)'
    : 'Ran your code right here in the browser, in a local Python runtime — no server or LeetCode round trip (expected outputs shown when known)';
}

/** LeetCode is down and there is no local fallback for this case. */
function renderUnreachable(mode, err) {
  const py = langSel.value === 'python3';
  const why = mode === 'submit'
    ? 'Submitting needs LeetCode’s full judge, which cannot be reached right now.'
    : 'Running on the examples locally works for Python 3 only.';
  const plain = err.code === 'upstream_timeout' || /timed out/i.test(err.message || '')
    ? 'LeetCode did not answer in time.'
    : 'The server could not connect to leetcode.com.';
  $('result').innerHTML = `<div class="rs-local-banner bad" role="status">LeetCode unreachable — ${mode === 'submit' ? 'not submitted' : 'not run'}</div>` +
    `<dl class="kv">${row('What happened', plain)}${row('What this means', why)}${row('Details', err.message)}</dl>` +
    (py ? '<button type="button" class="ghost" id="rsLocalRun">Run the examples locally instead</button>'
        : '<p class="sol-placeholder">Switch Language to Python 3 to try your code on the examples here.</p>');
  $('rsLocalRun')?.addEventListener('click', () => {
    if (aidsLocked()) return;
    runLocal(plainMode ? stripBanner(Editor.value, langSel.value) : Editor.value, $('testInput').value);
  });
  showTab('result');
}

function designQuestion(q) {
  const m = pythonMeta(q || {});
  return !!(m.classname || m.systemdesign);
}

/** Splits judge input into cases of `per` lines each. */
function splitCases(text, per) {
  const lines = String(text || '').split('\n').map(l => l.trim()).filter(Boolean);
  const out = [];
  if (!per) return out;
  for (let i = 0; i + per <= lines.length; i += per) out.push(lines.slice(i, i + per));
  return out;
}

/** The "Output:" of each worked example in the statement, in order. */
function exampleOutputs(q) {
  const lines = (q.plainStatement || htmlToText(q.content)).split('\n');
  const outs = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^\s*Output\s*:?\s*(.*)$/);
    if (!m) continue;
    let v = m[1].trim();
    if (!v) { let j = i + 1; while (j < lines.length && !lines[j].trim()) j++; v = (lines[j] || '').trim(); }
    if (v) outs.push(v);
  }
  return outs;
}

function parseLoose(text) {
  try { return { ok: true, v: JSON.parse(text) }; } catch { return { ok: false, v: String(text).replace(/\s+/g, '') }; }
}
function sameValue(a, b) {
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) <= 1e-5 * Math.max(1, Math.abs(b));
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => sameValue(x, b[i]));
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a), kb = Object.keys(b);
    return ka.length === kb.length && ka.every(k => sameValue(a[k], b[k]));
  }
  return a === b;
}
const sortDeep = v => (Array.isArray(v) ? v.map(sortDeep).map(x => JSON.stringify(x)).sort().map(x => JSON.parse(x)) : v);

/** Compares only when the expected value is known; null means "unknown". */
function compareOutput(actual, expected, anyOrder) {
  if (expected == null || actual == null) return null;
  const a = parseLoose(actual), e = parseLoose(expected);
  if (!a.ok || !e.ok) return String(a.v) === String(e.v) ? 'match' : 'differ';
  if (sameValue(a.v, e.v)) return 'match';
  if (anyOrder && sameValue(sortDeep(a.v), sortDeep(e.v))) return 'match';
  return 'differ';
}

/**
 * Runs the example cases without LeetCode: JavaScript executes right here in
 * a sandboxed Worker, Python 3 in a second Worker running a local build of
 * CPython (Pyodide) — neither needs the network once the runtime is cached.
 * Any other local case, or a Python runtime that failed to load, falls back
 * to our own server's debug runner, which still never calls LeetCode's judge.
 * Expected outputs come from the statement's worked examples, and only for
 * cases that are still exactly those examples — anything else is shown
 * without a verdict.
 */
async function getLocalResults(q, code, dataInput) {
  const meta = pythonMeta(q);
  const per = (meta.params || []).length;
  const cases = splitCases(dataInput, per).map(lines => lines.map(l => { try { return JSON.parse(l); } catch { return l; } }));
  const viaServer = async () => {
    const d = await api('/api/run-local', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: q.slug, code, dataInput }),
    });
    return { ...d, via: 'server' };
  };
  if (langSel.value === 'javascript') {
    try {
      const out = await window.JsRunner.run(code, meta.name, cases);
      return { design: false, cases: cases.length, results: out.cases || [], error: out.error || null, via: 'browser' };
    } catch (e) {
      return { design: false, cases: 0, results: [], error: e.message, via: 'browser' };
    }
  }
  if (langSel.value === 'python3') {
    try {
      const out = await window.PyRunner.run(code, meta, cases);
      return { design: false, cases: cases.length, results: out.cases || [], error: out.error || null, via: 'browser' };
    } catch (e) {
      // The in-browser Python runtime failed to load or crashed: fall back to
      // our own server (never LeetCode's judge) rather than losing Run entirely.
      return viaServer();
    }
  }
  return viaServer();
}

async function runLocal(code, dataInput) {
  if (!current) return;
  const q = current;
  statusEl.textContent = langSel.value === 'javascript' || langSel.value === 'python3' ? 'Running in your browser…' : 'Running the examples…';
  let d;
  try {
    d = await getLocalResults(q, code, dataInput);
  } catch (e) {
    statusEl.textContent = '';
    const banner = `<div class="rs-local-banner" role="status">${escapeHtml(localBanner('browser'))}</div>`;
    $('result').innerHTML = banner + `<div class="verdict bad">Could not run locally</div><dl class="kv">${row('Message', e.message)}</dl>`;
    showTab('result');
    return;
  }
  statusEl.textContent = '';
  const banner = `<div class="rs-local-banner" role="status">${escapeHtml(localBanner(d.via))}</div>`;
  if (current?.slug !== q.slug) return;
  const per = d.design ? 2 : (pythonMeta(q).params || []).length;
  const given = splitCases(dataInput, per);
  const samples = splitCases(q.exampleTestcases || q.sampleTestCase || '', per);
  const outs = exampleOutputs(q);
  const outsUsable = outs.length === samples.length;
  const norm = c => (c || []).join('\n').replace(/\s+/g, '');
  const anyOrder = /\bany order\b/i.test(q.plainStatement || '');
  const labels = window.TestCases?.cases?.() || [];

  const rows = (d.results || []).map((r, i) => {
    const known = outsUsable && samples[i] && norm(samples[i]) === norm(given[i]) ? outs[i] : null;
    const cmp = r.error ? 'error' : compareOutput(r.output, known, anyOrder);
    return { ...r, input: given[i] || [], expected: known, cmp };
  });
  const knownRows = rows.filter(r => r.expected != null);
  const matched = rows.filter(r => r.cmp === 'match').length;
  const errors = rows.filter(r => r.cmp === 'error').length;
  const unknown = rows.length - knownRows.length;
  const allPass = rows.length > 0 && !unknown && matched === rows.length;

  let verdict;
  if (d.error) verdict = 'Error before any case ran';
  else if (!rows.length) verdict = 'No cases ran';
  else if (!knownRows.length) verdict = `ran ${rows.length} case${rows.length === 1 ? '' : 's'}, no expected outputs known`;
  else verdict = `${matched}/${knownRows.length} examples match${unknown ? ` · ${unknown} unchecked (no expected output)` : ''}`;
  const cls = d.error || errors || matched < knownRows.length ? 'bad' : allPass ? 'ok' : 'unk';

  const pillCls = { match: 'ok', differ: 'bad', error: 'bad', null: 'unk' };
  const pillTip = { match: 'Matches the expected output', differ: 'Differs from the expected output', error: 'Raised an error', null: 'No expected output known, so no verdict' };
  let html = banner + `<div class="rs-head"><div class="verdict ${cls}">Local run · ${escapeHtml(verdict)}</div></div>`;
  if (d.error) html += `<pre class="rs-err">${escapeHtml(String(d.error))}</pre>`;
  if (rows.length) {
    html += `<div class="rs-cases">${rows.map((r, i) =>
      `<button type="button" class="rs-case ${pillCls[r.cmp]}${i === 0 ? ' sel' : ''}" data-i="${i}" title="${pillTip[r.cmp]}">` +
      `<span class="dot"></span>Case ${i + 1}</button>`).join('')}</div><div class="rs-detail">${rows.map((r, i) => {
      const names = labels[i]?.map(p => p.name) || [];
      const input = r.input.map((v, j) => (names[j] ? `${names[j]} = ${v}` : v)).join('\n');
      return `<div class="rs-case-body${i === 0 ? ' sel' : ''}" data-i="${i}">` +
        (input ? `<div class="rs-row"><label>Input</label><pre>${escapeHtml(input)}</pre></div>` : '') +
        (r.stdout ? `<div class="rs-row"><label>Stdout</label><pre>${escapeHtml(r.stdout)}</pre></div>` : '') +
        (r.error ? `<div class="rs-row"><label>Error</label><pre class="bad">${escapeHtml(r.error)}</pre></div>`
          : `<div class="rs-row"><label>Output</label><pre class="${r.cmp === 'differ' ? 'bad' : ''}">${escapeHtml(r.output ?? '(none)')}</pre></div>`) +
        (r.expected != null
          ? `<div class="rs-row"><label>Expected</label><pre>${escapeHtml(r.expected)}</pre></div>`
          : '<div class="rs-row"><label>Expected</label><p class="rs-unknown">Unknown — this case is not one of the statement’s examples, so there is no pass/fail.</p></div>') +
        (r.cmp === 'differ' && anyOrder ? '<p class="rs-unknown">The problem allows any order; check whether this is the same answer reordered.</p>' : '') +
        '</div>';
    }).join('')}</div>`;
  }
  const box = $('result');
  box.innerHTML = html;
  box.querySelector('#rsNext')?.addEventListener('click', () => stepQuestion(1));
  box.querySelectorAll('.rs-case').forEach(b => b.onclick = () => {
    box.querySelectorAll('.rs-case, .rs-case-body').forEach(el => el.classList.toggle('sel', el.dataset.i === b.dataset.i));
  });
  showTab('result');

  session.verdict = `Local run · ${verdict}`;
  session.result = {
    mode: 'run-local',
    status: session.verdict,
    passed: knownRows.length ? matched : null,
    total: knownRows.length || null,
    actual: rows.map(r => r.output ?? '').join('\n') || null,
    expected: knownRows.length ? rows.map(r => r.expected ?? '?').join('\n') : null,
    stdout: rows.map(r => r.stdout).filter(Boolean).join('\n').trim() || null,
    error: d.error || rows.find(r => r.error)?.error || null,
  };
  if (current && window.Attempts) {
    window.Attempts.save({
      slug: current.slug, title: current.title, lang: langSel.value, mode: 'run',
      ok: allPass, verdict: session.verdict, result: session.result, code: Editor.value,
    });
    window.AttemptsUI?.refresh?.();
  }
  if (current && window.Learn?.noteAttempt) { window.Learn.noteAttempt(current.title, false); renderSolved(); }
  // The statement's examples all pass (extra custom cases have no verdict).
  if (!d.error && !errors && knownRows.length && matched === knownRows.length) noteSamplesPassed();
}

/**
 * Whether sample case i passed. LeetCode's own checker result (compare_result,
 * one "1"/"0" per case) is the truth when present: it knows problems whose
 * answer may come "in any order". Otherwise compare ourselves, order-free when
 * the statement says any order is fine (e.g. Group Anagrams).
 */
function casePasses(d, answers, expected, i) {
  const cr = typeof d?.compare_result === 'string' ? d.compare_result : '';
  if (cr.length === expected.length && /^[01]+$/.test(cr)) return cr[i] === '1';
  if (answers[i] === expected[i]) return true;
  const anyOrder = /\bany order\b/i.test(current?.plainStatement || '');
  return compareOutput(answers[i], expected[i], anyOrder) === 'match';
}

/** Saves every judge attempt against the open question so the History tab can
 *  list them, filter by status, and load an older submission back into the
 *  editor. session.result is already filled in by renderResult. */
function recordAttempt(d, mode) {
  if (!current || !window.Attempts) return;
  const err = d.runtime_error || d.compile_error || d.full_compile_error;
  let ok = d.status_msg === 'Accepted';
  let verdict = d.status_msg || (err ? 'Error' : 'Unknown');
  if (mode === 'run' && ok) {
    const answers = (d.code_answer || []).filter(x => x !== '');
    const expected = (d.expected_code_answer || []).filter(x => x !== '');
    if (expected.length) {
      const passed = answers.filter((_, i) => casePasses(d, answers, expected, i)).length;
      ok = passed === expected.length && answers.length === expected.length;
      verdict = ok ? `Accepted · ${passed}/${expected.length} sample cases`
                   : `Wrong Answer · ${passed}/${expected.length} sample cases`;
    } else {
      verdict = 'Finished';
    }
  } else if (err && !d.status_msg) {
    verdict = d.compile_error || d.full_compile_error ? 'Compile Error' : 'Runtime Error';
  }
  window.Attempts.save({
    slug: current.slug,
    title: current.title,
    lang: langSel.value,
    mode,
    ok,
    verdict,
    result: session.result,
    code: Editor.value,
  });
  window.AttemptsUI?.refresh?.();
  renderSubmissions();
}

runBtn.onclick = () => {
  // Run defaults to a local path when one exists, so the shared LeetCode
  // judge and our own server are only touched for Submit, or for languages
  // with no local runner. See getLocalResults().
  if (canRunLocally()) {
    if (aidsLocked()) { window.QF?.toast?.(REAL_TIP); return; }
    if (session.realistic) noteAid('Run');
    saveDraft();
    session.runs++;
    runBtn.disabled = submitBtn.disabled = true;
    runLocal(plainMode ? stripBanner(Editor.value, langSel.value) : Editor.value, $('testInput').value)
      .finally(codingControls);
    return;
  }
  judge('run');
};
submitBtn.onclick = () => judge('submit');
let shownList = '';
listSel.addEventListener('focus', () => { shownList = listSel.value; });
listSel.onchange = () => {
  if (!confirmEndMock('Switching question list', 'question-changed')) {
    if (shownList) listSel.value = shownList;
    return;
  }
  if (listSel.value === '@@stop') { stopFollowing(); return; }
  const prevList = shownList, prevQ = qSel.value, prevOpts = qSel.innerHTML;
  shownList = listSel.value;
  loadQuestions().catch(e => {
    listSel.value = shownList = prevList;
    qSel.innerHTML = prevOpts; qSel.value = prevQ;
    paintListLabel();
    window.QF?.toast?.(`Could not open that question (${e.message || 'load failed'})`);
  });
};
let shownQ = '';
qSel.addEventListener('focus', () => { shownQ = current?.slug || qSel.value; });
qSel.onchange = () => {
  const prev = current?.slug || shownQ;
  loadQuestion().catch(e => {
    if (prev) qSel.value = prev;
    window.QF?.toast?.(`Could not open that question (${e.message || 'load failed'})`);
  });
};
langSel.onchange = () => { saveDraft(); applyLang(); syncEditorHint(); };

function setPromptHidden(hidden) {
  const pane = $('promptPane');
  pane.classList.toggle('hidden', hidden);
  $('vsplit').style.display = hidden ? 'none' : '';
  $('promptShowBtn').classList.toggle('hidden', !hidden);
}
$('promptBtn').onclick = () => { promptAutoHidden = false; setPromptHidden(true); };
$('promptShowBtn').onclick = () => { promptAutoHidden = false; setPromptHidden(false); };

function syncPlainButton() {
  $('plainBtn').classList.toggle('active', plainMode);
  $('plainBtn').setAttribute('aria-pressed', String(plainMode));
  $('plainBtn').title = plainMode ? 'Plain-text mode is on — click for code mode' : 'Plain-text mode: the statement as comments above the code';
}

function syncEditorHint() {
  const el = $('edHint');
  if (!el) return;
  const mac = /Mac|iPhone|iPad/.test(navigator.platform);
  const mod = mac ? '⌘' : 'Ctrl';
  el.textContent = `${mod}+Enter run · ${mod}+⇧+Enter submit`;
}
syncEditorHint();

$('plainBtn').onclick = () => {
  saveDraft();
  plainMode = !plainMode;
  localStorage.setItem('plainMode', plainMode ? '1' : '0');
  syncPlainButton();
  applyLang();
};
$('resetTemplateBtn').onclick = () => {
  if (!current) return;
  if (Editor.value.trim() && Editor.value !== templateForCurrent() && !confirm('Reset the editor to the code template? Your current code will be lost.')) return;
  resetTemplate();
};
$('edFullBtn').onclick = () => window.Focus?.toggle?.();
$('edFullBtn').title = 'Fullscreen editor (Esc to exit)';
// A bare "f" anywhere outside a text field toggles Focus mode (focus.js),
// which hides the whole toolbar — question picker, Run, Submit. In Coding
// that fired when the Run button or a result pill still had focus and the
// candidate started typing, so the menu "disappeared" after a result.
// focus.js means to skip Coding but tests a class that is never set; guard
// here, in the capture phase, before its document listener runs.
window.addEventListener('keydown', e => {
  if (document.body.dataset.mode !== 'coding' || e.key.toLowerCase() !== 'f') return;
  if (e.metaKey || e.ctrlKey || e.altKey || document.body.classList.contains('focus')) return;
  if (e.target.closest?.('input, textarea, select, [contenteditable]')) return;
  e.stopImmediatePropagation();
}, true);
syncPlainButton();

$('code').addEventListener('input', e => {
  markResultStale();
  // Pacing: the first keystroke in the editor after Start is "first code".
  if (session.running && !session.firstCodeAt && e.isTrusted) {
    session.firstCodeAt = Date.now();
    publishSession();
    paintSessionBar();
  }
});

document.addEventListener('keydown', e => {
  if (document.body.dataset.mode && document.body.dataset.mode !== 'coding') return;
  // Chat inputs and overlay pages own their own Ctrl+Enter etc.
  if (e.defaultPrevented || e.target.closest?.('#chatPane, .qf-page, #qfApproachPage')) return;
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.key === 'Enter') { e.preventDefault(); judge(e.shiftKey ? 'submit' : 'run'); return; }
  if (mod && e.key === "'") { e.preventDefault(); judge('submit'); return; }
  if (mod && e.key === 's') { e.preventDefault(); saveDraft(); statusEl.textContent = 'Saved'; setTimeout(() => statusEl.textContent = '', 1200); return; }
  if (e.altKey && !mod && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
    if (e.target.closest?.('input, textarea, select, [contenteditable]')) return;   // word-jumps etc. in fields
    e.preventDefault(); stepQuestion(e.key === 'ArrowLeft' ? -1 : 1); }
});

function tickSession() {
  paintClock();
  if (!session.running) return;
  const elapsed = Date.now() - session.startedAt;
  if (elapsed >= 0.7 * session.durationMs) triggerFollowUp('time');
  publishSession();
  paintSessionBar();
}
setInterval(tickSession, 500);
// A background tab's timers are throttled; catch up the moment it is visible.
document.addEventListener('visibilitychange', () => { if (!document.hidden) tickSession(); });

// draggable splitters
function drag(el, onMove) {
  el.addEventListener('mousedown', e => {
    e.preventDefault();
    const move = ev => onMove(ev);
    const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  });
}
// The question pane is sized as a percentage so it survives window resizing,
// but like the side panes it should remember where you put it.
try {
  const saved = Number(localStorage.getItem('questionPaneWidth'));
  if (saved >= 15 && saved <= 70) $('promptPane').style.width = `${saved}%`;
} catch { /* private mode */ }
drag($('vsplit'), e => {
  const pct = Math.min(70, Math.max(15, (e.clientX / window.innerWidth) * 100));
  $('promptPane').style.width = `${pct}%`;
  try { localStorage.setItem('questionPaneWidth', pct.toFixed(1)); } catch { /* ignore */ }
});
drag($('hsplit'), e => {
  const h = Math.min(500, Math.max(80, window.innerHeight - e.clientY));
  $('console').style.height = `${h}px`;
});

// The interviewer and solution panes were fixed-width with no handle, so
// neither could be widened. Each now has its own splitter, and the chosen
// width is remembered.
function sideSplit(splitId, paneId, min, max, storeKey) {
  const pane = $(paneId);
  try {
    const saved = Number(localStorage.getItem(storeKey));
    if (saved >= min && saved <= max) pane.style.width = `${saved}px`;
  } catch { /* private mode */ }
  drag($(splitId), e => {
    const w = Math.min(max, Math.max(min, window.innerWidth - e.clientX));
    pane.style.width = `${w}px`;
    try { localStorage.setItem(storeKey, String(Math.round(w))); } catch { /* ignore */ }
  });
}
sideSplit('chatsplit', 'chatPane', 260, 900, 'chatPaneWidth');
sideSplit('solsplit', 'solutionPane', 320, 1100, 'solutionPaneWidth');

/** A splitter is only meaningful while the pane it resizes is on screen. */
function syncSideSplitters() {
  $('chatsplit').classList.toggle('hidden', $('chatPane').classList.contains('hidden'));
  $('solsplit').classList.toggle('hidden', $('solutionPane').classList.contains('hidden'));
  fitEditor();
}

// On a Fold or a small laptop, question + editor + a 480px side pane left the
// editor a sliver (~20px on an unfolded Fold). When a side pane opens and the
// editor would drop below a usable width, fold the question away (the ⇥
// button brings it back) and restore it once the side pane closes.
let promptAutoHidden = false;
function fitEditor() {
  if (matchMedia('(max-width: 768px)').matches) return;   // panes are stacked there
  const MIN_EDITOR = 320;
  const FLOOR = { chatPane: 300, solutionPane: 400 };   // narrower clips their headers
  const open = ['chatPane', 'solutionPane'].filter(id => $(id).offsetWidth > 0);
  const sideOpen = open.length > 0;
  const prompt = $('promptPane');
  const editorShort = () => MIN_EDITOR - $('editorPane').offsetWidth;
  if (sideOpen && !prompt.classList.contains('hidden') && editorShort() > 0) {
    // First try giving back what the side pane can spare…
    const before = open.map(id => [id, $(id).style.width]);
    for (const id of open) {
      const pane = $(id), short = editorShort();
      if (short > 0 && pane.offsetWidth > FLOOR[id]) pane.style.width = `${Math.max(FLOOR[id], pane.offsetWidth - short)}px`;
    }
    if (editorShort() <= 0) return;
    // …and if that is not enough, keep the side pane as it was and fold the question away.
    for (const [id, w] of before) $(id).style.width = w;
    setPromptHidden(true);
    promptAutoHidden = true;
    window.QF?.toast?.('Question folded away to make room for the editor — ⇥ beside the language shows it.');
  } else if (!sideOpen && promptAutoHidden) {
    promptAutoHidden = false;
    if (prompt.classList.contains('hidden')) setPromptHidden(false);
  }
}
window.addEventListener('resize', () => { if (document.body.dataset.mode === 'coding') fitEditor(); });
window.syncSideSplitters = syncSideSplitters;
new MutationObserver(syncSideSplitters).observe($('chatPane'), { attributes: true, attributeFilter: ['class'] });
new MutationObserver(syncSideSplitters).observe($('solutionPane'), { attributes: true, attributeFilter: ['class'] });
syncSideSplitters();

/**
 * Open a question by slug from anywhere in the app. The slug may not be in the
 * list currently selected, so an option is inserted when it is missing rather
 * than hunting through every list.
 */
/** Drops code into the editor and shows the coding tab; used by the handbook and the solution pane. */
window.loadIntoEditor = function (code, { run = false, lang = null } = {}) {
  if (!code) return;
  window.setInterviewMode?.('coding');
  if (plainMode) $('plainBtn').click();   // handbook code is raw code, not a commented sheet
  // A saved attempt carries its language: Java code must not land in (and be
  // run as) the Python draft.
  if (lang && lang !== langSel.value && [...langSel.options].some(o => o.value === lang)) {
    langSel.value = lang;
    langSel.dispatchEvent(new Event('change'));
  }
  Editor.value = String(code).trimEnd() + '\n';
  window.dispatchEvent(new Event('editor-replaced'));   // debugger.js drops stale breakpoints
  saveDraft();
  if (run) return judge('run');
  statusEl.textContent = 'Code copied to editor';
  setTimeout(() => { if (statusEl.textContent === 'Code copied to editor') statusEl.textContent = ''; }, 1500);
};

/**
 * Opens a question in the Coding tab, in this tab. Resolves once it has
 * loaded; `code` (optional) then goes into the editor for THAT question, so a
 * "To editor" from another tab can never land on whatever was selected before.
 */
window.openQuestion = async function (slug, title, { code, queue } = {}) {
  if (!slug) return;
  window.setInterviewMode?.('coding');
  const prev = current?.slug;
  if (queue) setQueue(queue);
  const inserted = ![...qSel.options].some(o => o.value === slug);
  selectQuestion(slug, title);
  let ok;
  try { ok = await loadQuestion(); }
  catch (e) {
    if (inserted) [...qSel.options].find(o => o.value === slug)?.remove();   // drop the option selectQuestion added
    if (prev) qSel.value = prev;          // the picker must keep naming the question on screen
    window.QF?.toast?.(`Could not open that question (${e.message || 'load failed'}).`);
    throw e;
  }
  if (ok === false) return;
  if (code) window.loadIntoEditor(code);
};

// ---------------------------------------------------- question search --
// Find any problem by number or name. What we hold comes first; anything else
// on LeetCode is fetched on demand ("77" opens Combinations even if no list
// has it), then behaves like every other question, judge included.
(function questionSearch() {
  const box = $('qSearch'), list = $('qSearchList');
  if (!box || !list) return;
  let timer = 0, seq = 0, items = [], active = -1;
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const close = () => { list.hidden = true; box.setAttribute('aria-expanded', 'false'); active = -1; };
  const paint = (data, term) => {
    items = [...(data.local || []), ...(data.leetcode || [])];
    const row = (x, i) => `<button type="button" role="option" data-i="${i}" class="q-search-row${i === active ? ' on' : ''}">
        <span class="q-search-id">${esc(x.id || '')}</span><span class="q-search-t">${esc(x.title)}${x.paidOnly ? ' <small>🔒 Premium</small>' : ''}</span>
        <span class="q-search-d d-${esc((x.difficulty || '').toLowerCase())}">${esc(x.difficulty || '')}</span>
        ${x.lists === 'leetcode' ? '<span class="q-search-src" title="Not in our set yet: fetched from LeetCode when you open it">LeetCode</span>' : ''}</button>`;
    const loc = (data.local || []).map(row).join('');
    const off = (data.leetcode || []).map((x, i) => row(x, i + (data.local || []).length)).join('');
    list.innerHTML = (loc || '') + (off ? `<div class="q-search-h">More on LeetCode</div>${off}` : '')
      || `<div class="q-search-empty">Nothing matches “${esc(term)}”. Press Enter to look it up on LeetCode.</div>`;
    list.hidden = false; box.setAttribute('aria-expanded', 'true');
  };
  const run = async () => {
    const term = box.value.trim();
    if (!term) { close(); return; }
    const my = ++seq;
    try {
      const data = await api(`/api/search?q=${encodeURIComponent(term)}`);
      if (my === seq) { active = -1; paint(data, term); }
    } catch { /* keep the last results */ }
  };
  const open = async x => {
    close(); box.blur();
    if (!confirmEndMock('Opening another question', 'question-changed')) return;
    box.value = '';
    try { await window.openQuestion(x.slug, `${x.id ? x.id + '. ' : ''}${x.title}`); }
    catch { /* openQuestion already told the user */ }
  };
  const lookupAndOpen = async term => {
    window.QF?.toast?.(`Looking up “${term}” on LeetCode…`);
    try {
      const r = await api(`/api/lookup?q=${encodeURIComponent(term)}`);
      await open({ slug: r.slug, title: r.title || r.slug, id: r.id });
    } catch (e) { window.QF?.toast?.(e.message || `Could not find “${term}”.`); }
  };
  box.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 180); });
  box.addEventListener('focus', () => { if (box.value.trim()) run(); });
  box.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!items.length) return;
      e.preventDefault();
      active = (active + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      list.querySelectorAll('.q-search-row').forEach(b => b.classList.toggle('on', +b.dataset.i === active));
      list.querySelector('.q-search-row.on')?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const term = box.value.trim();
      if (!term) return;
      const pick = items[active >= 0 ? active : 0];
      const exact = pick && (pick.id === term.replace(/^#/, '') || pick.title.toLowerCase() === term.toLowerCase());
      if (pick && (active >= 0 || exact || !/^#?\d+$/.test(term))) open(pick);
      else lookupAndOpen(term);
    } else if (e.key === 'Escape') { close(); box.blur(); }
  });
  list.addEventListener('mousedown', e => e.preventDefault());   // keep focus on the box
  list.addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (b) open(items[+b.dataset.i]); });
  document.addEventListener('click', e => { if (!e.target.closest('#qSearchWrap')) close(); });
  // "/" jumps to the search box, as on LeetCode.
  document.addEventListener('keydown', e => {
    if (e.key !== '/' || e.target.closest?.('input, textarea, select, [contenteditable], .cm-editor')) return;
    if (document.body.dataset.mode !== 'coding' || !box.offsetParent) return;
    e.preventDefault(); box.focus();
  });
})();

$('randomBtn').onclick = () => {
  // Pick from the whole list, not just what is on screen, so practice is not
  // biased toward whichever list happens to be selected.
  const opts = [...qSel.options];
  if (!opts.length) return;
  if (!confirmEndMock('Picking a random question', 'question-changed')) return;
  qSel.value = opts[Math.floor(Math.random() * opts.length)].value;
  qSel.dispatchEvent(new Event('change'));
};

$('csClose').onclick = () => $('codeScore').classList.add('hidden');
$('csHistory').onclick = () => {
  $('codeScore').classList.add('hidden');
  window.setInterviewMode?.('history');
};

$('startBtn').onclick = startSession;
$('stopBtn').onclick = () => stopSession('stopped');
codingControls();
publishSession();
paintClock();

loadCapabilities();
/** The question lists are the first thing the tab needs; a failure gets a
 *  readable error and a Retry rather than a dead pane. */
function bootLists() {
  loadLists().catch(e => {
    $('qTitle').textContent = 'Could not load the question lists';
    $('qMeta').innerHTML = '';
    $('qBody').innerHTML = `<div id="qListErr" class="q-load-err" role="alert"><p>${escapeHtml(String(e.message || 'Request failed'))}</p>` +
      '<p class="q-load-hint">Check your connection, or wait a moment if the server is restarting.</p>' +
      '<button type="button" class="primary" id="qListRetry">Retry</button></div>';
    $('qListRetry').onclick = () => {
      $('qListRetry').disabled = true;
      $('qListRetry').textContent = 'Retrying\u2026';
      $('qTitle').textContent = 'Loading\u2026';
      bootLists();
    };
  });
}
bootLists();

// Solution pane
(function () {
  const solPane = $('solutionPane');
  const solBtn = $('solutionBtn');
  const solContent = $('solContent');
  const solGenerate = $('solGenerate');
  const cache = {};

  function renderMd(text) {
    return text
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) =>
        `<div class="sol-code"><pre><code>${code}</code></pre>` +
        `<div class="sol-actions"><button class="sol-use ghost">To editor</button>` +
        `<button class="sol-run primary">Run</button></div></div>`)
      .replace(/`([^`\n]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/^# (.+)$/gm, '<h1>$1</h1>')
      .replace(/^---$/gm, '<hr>')
      .replace(/^- (.+)$/gm, '<li>$1</li>')
      .replace(/(<li>.*<\/li>\n?)+/g, m => `<ul>${m}</ul>`)
      .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
      .replace(/\n{2,}/g, '</p><p>')
      .replace(/^/, '<p>').replace(/$/, '</p>')
      .replace(/<p>\s*(<h[123]|<hr|<pre|<ul|<ol)/g, '$1')
      .replace(/(<\/h[123]>|<\/pre>|<\/ul>|<\/ol>|<hr>)\s*<\/p>/g, '$1');
  }

  // Buttons on solution code blocks: copy code into the editor, optionally run it.
  solContent.addEventListener('click', e => {
    const btn = e.target.closest('.sol-use, .sol-run');
    if (!btn) return;
    const code = btn.closest('.sol-code')?.querySelector('pre code')?.textContent;
    window.loadIntoEditor(code, { run: btn.classList.contains('sol-run') });
  });

  solBtn.onclick = () => {
    const chatPane = $('chatPane');
    if (!chatPane.classList.contains('hidden')) {
      chatPane.classList.add('hidden');
      $('panelBtn').classList.remove('active');
    }
    solPane.classList.toggle('hidden');
    const open = !solPane.classList.contains('hidden');
    solBtn.classList.toggle('active', open);
    if (open) noteAid('Solution');
  };

  solGenerate.onclick = async () => {
    if (!window.currentQuestion) return;
    const q = window.currentQuestion;
    const key = `${q.slug}:${$('langSel').value}`;
    if (cache[key]) { solContent.innerHTML = renderMd(cache[key]); return; }

    solGenerate.disabled = true;
    solContent.innerHTML = '<p class="sol-loading">Generating solution breakdown\u2026 this takes 10\u201320 seconds.</p>';
    try {
      const res = await fetch('/api/solution', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: q.slug,
          title: q.title,
          difficulty: q.difficulty,
          statement: q.plainStatement,
          lang: $('langSel').value,
                  model: window.Settings?.modelFor('codingSolution'),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      cache[key] = data.markdown;
      solContent.innerHTML = renderMd(data.markdown);
    } catch (e) {
      solContent.innerHTML = `<p class="sol-loading" style="color:var(--red)">Error: ${e.message}</p>`;
    } finally {
      solGenerate.disabled = false;
    }
  };

  // ---------------------------------------------------------- required knowledge ---

  const rkContent = $('rkContent');
  const rkCache = {};
  let pane = 'solution';

  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  function renderRk(d) {
    const sec = (title, body) => body ? `<h2>${title}</h2>${body}` : '';
    return `
      <h1>${esc(d.title)}</h1>
      <p class="rk-lede">Everything below is specific to this problem, compiled from the handbook
        topics that teach it.</p>

      ${sec('Ask first', d.ask?.length ? `<ol class="rk-ask">${d.ask.map(a =>
        `<li><strong>${esc(a.q)}</strong>${a.why ? `<span>${esc(a.why)}</span>` : ''}</li>`).join('')}</ol>` : '')}

      ${sec('What to say, in order', d.say?.length ? `<ol class="rk-say">${d.say.map(s =>
        `<li>${s.beat ? `<em>${esc(s.beat)}</em>` : ''}<span>${esc(s.line)}</span></li>`).join('')}</ol>` : '')}

      ${sec('What you must already know', d.know?.length ? `<dl class="rk-know">${d.know.map(k =>
        `<dt>${esc(k.topic)}</dt><dd>${esc(k.what)}${k.here ? ` <strong>Here:</strong> ${esc(k.here)}` : ''}</dd>`).join('')}</dl>` : '')}

      ${sec('How the scoring works', d.scoring?.length ? `<div class="rk-score">${d.scoring.map(s => `
        <div class="rk-band">
          <div class="rk-signal">${esc(s.signal)}</div>
          ${s.full ? `<div class="rk-full"><span>Full marks</span>${esc(s.full)}</div>` : ''}
          ${s.weak ? `<div class="rk-weak"><span>Merely adequate</span>${esc(s.weak)}</div>` : ''}
        </div>`).join('')}</div>` : '')}

      ${sec('Where candidates lose points', d.lose?.length
        ? `<ul class="rk-lose">${d.lose.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : '')}

      ${sec('Follow-ups to expect', d.followups?.length ? `<dl class="rk-know">${d.followups.map(f =>
        `<dt>${esc(f.ask)}</dt><dd>${esc(f.change)}</dd>`).join('')}</dl>` : '')}

      ${d.topics?.length ? `<h2>Revise these</h2>
        <div class="rk-topics">${d.topics.map(t =>
          `<button class="rk-topic" data-slug="${esc(t.slug)}">${esc(t.title)}</button>`).join('')}</div>` : ''}`;
  }

  rkContent.addEventListener('click', e => {
    const b = e.target.closest('.rk-topic');
    if (b) window.openProLearn?.(b.dataset.slug);
  });

  function setPane(next) {
    pane = next;
    document.querySelectorAll('.sol-tab').forEach(t => {
      const on = t.dataset.pane === next;
      t.classList.toggle('sel', on);
      t.setAttribute('aria-selected', String(on));
    });
    solContent.classList.toggle('hidden', next !== 'solution');
    rkContent.classList.toggle('hidden', next !== 'rk');
  }
  document.querySelectorAll('.sol-tab').forEach(t => { t.onclick = () => setPane(t.dataset.pane); });

  async function generateRk() {
    if (!window.currentQuestion) return;
    const slug = window.currentQuestion.slug;
    if (rkCache[slug]) { rkContent.innerHTML = renderRk(rkCache[slug]); return; }

    solGenerate.disabled = true;
    rkContent.innerHTML = '<p class="sol-loading">Writing the briefing\u2026 the strong model takes a minute, once ever.</p>';
    try {
      const res = await fetch(`/api/required-knowledge/${encodeURIComponent(slug)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      rkCache[slug] = data;
      if (window.currentQuestion?.slug !== slug) return;    // moved on while it wrote
      rkContent.innerHTML = renderRk(data);
    } catch (e) {
      rkContent.innerHTML = `<p class="sol-loading" style="color:var(--red)">Error: ${e.message}</p>`;
    } finally {
      solGenerate.disabled = false;
    }
  }

  const generateSolution = solGenerate.onclick;
  solGenerate.onclick = () => (pane === 'rk' ? generateRk() : generateSolution());

  window.resetSolutionPane = () => {
    solContent.innerHTML = '<p class="sol-placeholder">Click <strong>Generate</strong> to get a full solution breakdown with brute-force, optimal, and best approaches \u2014 including time &amp; space complexity analysis.</p>';
    rkContent.innerHTML = '<p class="sol-placeholder">Click <strong>Generate</strong> for the interview briefing on this problem: what to ask before you code, what to say at each beat, what the interviewer is scoring, and where candidates lose points.</p>';
  };
})();
