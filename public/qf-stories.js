/* My stories: the story bank for Googleyness & behavioural rounds.
 *  - every scored interview answer is captured as a story automatically
 *    (your words + the Google-ready version), and older STAR drafts move in;
 *  - full create / read / update / delete, with STAR fields, the Google
 *    signals a story shows, and the questions it answers;
 *  - "Questions" view: every common question by theme, what a strong STAR
 *    answer needs, and your matching stories with a 1 / 2 / 3 … switcher.
 * Stored in localStorage 'qf.stories' (synced to the account by the shell).
 */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const KEY = 'qf.stories';
  const uid = () => `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const norm = t => String(t || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

  const SIGNALS = [
    ['ownership', 'Ownership & bias to action'], ['collab', 'Collaboration & inclusion'], ['ambiguity', 'Thriving in ambiguity'],
    ['user', 'Putting the user first'], ['feedback', 'Valuing feedback & growth'], ['status', 'Challenging the status quo'],
    ['right', 'Doing the right thing'], ['lead', 'Leading without authority'], ['impact', 'Measurable impact'], ['conflict', 'Handling conflict'],
  ];
  const SIG = Object.fromEntries(SIGNALS);
  // What interviewers listen for, per question theme (bank category id).
  const EXPECT = {
    googleyness: { sig: ['collab', 'ambiguity', 'user', 'feedback'], s: 'A real, specific moment — team, stakes, timeframe.', a: 'What YOU did, in order; how you brought others along; how you dealt with the unknown.', r: 'Outcome with a number; what changed for users or the team.', x: 'What you learnt and do differently now (humility counts).' },
    leadership: { sig: ['lead', 'ownership', 'impact'], s: 'You had no formal authority, or the team was stuck.', a: 'How you set direction, aligned people, unblocked others, made the call.', r: 'Delivered result + people outcome (someone grew, team sped up).', x: 'How you would lead it next time.' },
    conflict: { sig: ['conflict', 'collab', 'right'], s: 'The disagreement and why it mattered.', a: 'You listened first, used data, found shared goals, disagreed and committed.', r: 'Decision reached and the relationship kept or improved.', x: 'What you understood about the other person.' },
    failure: { sig: ['feedback', 'ownership'], s: 'A genuine failure you owned — not a disguised success.', a: 'How you noticed, owned it, fixed it, and told people.', r: 'Damage limited; the fix or process that stopped a repeat.', x: 'The lesson, and proof you applied it later.' },
    ambiguity: { sig: ['ambiguity', 'ownership'], s: 'No clear spec, owner or answer.', a: 'How you framed the problem, gathered data, made assumptions explicit and moved.', r: 'What shipped or got decided, and how you checked it.', x: 'How you handle ambiguity now.' },
    execution: { sig: ['impact', 'ownership'], s: 'A deadline, scale or quality bar at risk.', a: 'Prioritisation, trade-offs, what you cut, how you tracked progress.', r: 'Delivered on time with a measured outcome.', x: 'What you would plan differently.' },
    growth: { sig: ['feedback', 'status'], s: 'Something outside your comfort zone.', a: 'How you learnt fast, asked for help, practised.', r: 'Skill gained and how it paid off.', x: 'How you keep growing.' },
    realq: { sig: ['collab', 'ownership', 'impact'], s: 'Specific situation and stakes.', a: 'Your actions, step by step, with "I".', r: 'Measured result.', x: 'Reflection.' },
    opener: { sig: ['impact'], s: 'Who you are in one line.', a: 'Two highlights that match the role.', r: 'Why Google, why this team.', x: 'What you want to learn.' },
    gca: { sig: ['ambiguity'], s: 'Clarify the problem and assumptions.', a: 'Data you need, options weighed, one recommendation.', r: 'How you would measure success.', x: 'Risks and what would change your mind.' },
  };

  // ---------------------------------------------------------------- data --
  function read() { try { const v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } }
  function write(list) { try { localStorage.setItem(KEY, JSON.stringify(list.slice(-300))); } catch { window.QF?.toast?.('Could not save — storage is full.'); } }
  const full = s => [s.situation, s.task, s.action, s.result, s.reflection].filter(Boolean).join('\n\n') || s.text || '';

  function upsert(story) {
    const list = read();
    const i = list.findIndex(x => x.id === story.id);
    const now = Date.now();
    if (i >= 0) list[i] = { ...list[i], ...story, updatedAt: now };
    else list.push({ id: uid(), createdAt: now, updatedAt: now, signals: [], questions: [], ...story });
    write(list); return i >= 0 ? list[i] : list[list.length - 1];
  }
  function remove(id) { write(read().filter(x => x.id !== id)); }

  /** Called by the Googleyness tab after an answer is scored. */
  function addFromInterview({ question, said, improved, card, at }) {
    said = String(said || '').trim(); improved = String(improved || '').trim();
    if (!said && !improved) return null;
    const list = read();
    const dupe = list.find(x => x.source === 'interview' && norm(x.questions?.[0]) === norm(question) && norm(x.said) === norm(said));
    if (dupe) return dupe;
    const sig = new Set();
    // Scorecard dimension ids -> story signals (judgement is the "ambiguity" read).
    for (const d of card?.dimensions || []) {
      if (d.score >= 3) { const m = { ownership: 'ownership', collaboration: 'collab', judgement: 'ambiguity', ambiguity: 'ambiguity', user: 'user', impact: 'impact', reflection: 'feedback', leadership: 'lead', conflict: 'conflict' }[d.id]; if (m) sig.add(m); }
    }
    const title = (improved || said).split(/(?<=[.!?])\s/)[0].slice(0, 90);
    return upsert({ title, text: improved || said, said, questions: question ? [question] : [], signals: [...sig], source: 'interview',
      score: card && Number.isFinite(card.total) ? `${card.total}/${card.max}` : '', verdict: card?.overall || '',
      ...(at ? { createdAt: at, updatedAt: at } : {}) });
  }

  // Googleyness sessions scored before My stories existed live only in
  // History ('interviewHistory'). Bring each in once — tracked by history id,
  // so a story deleted afterwards is not re-imported — and skip any answer
  // that is already a story (addFromInterview dedupes on question + words).
  const HIST_DONE = 'qf.storiesFromHistory';
  const improvedText = card => (card?.improvedAnswer?.spans || []).map(sp => sp.text).join('');
  const saidOf = msgs => (msgs || []).filter(m => m.role === 'user').map(m => String(m.content || '').trim()).filter(Boolean).join('\n\n');
  function importHistory() {
    let rows, done;
    try { rows = JSON.parse(localStorage.getItem('interviewHistory') || '[]'); } catch { return; }
    try { done = new Set(JSON.parse(localStorage.getItem(HIST_DONE) || '[]')); } catch { done = new Set(); }
    if (!Array.isArray(rows)) return;
    for (const r of rows) {
      if (!r || r.type !== 'behavioural' || !r.id || done.has(r.id) || !Array.isArray(r.transcript)) continue;
      const at = Number(r.savedAt || r.endedAt) || Date.now();
      // Unscored just now: the score is probably still on its way.
      if (!r.score && Date.now() - at < 3600e3) continue;
      const round = Array.isArray(r.score?.round) ? r.score.round : null;
      if (round) {
        // A full G&L round: one story per answered question. Split the
        // transcript on its "[Question i of n · label: question]" markers.
        const parts = []; let cur = null;
        for (const m of r.transcript) {
          if (m.role === 'assistant' && /^\[Question \d+ of \d+/.test(m.content || '')) { cur = []; parts.push(cur); continue; }
          cur?.push(m);
        }
        round.forEach((q, i) => {
          const said = q.card?.said || saidOf(parts[i]);
          addFromInterview({ question: q.question, said, improved: improvedText(q.card), card: q.card, at });
        });
      } else {
        const said = r.score?.said || saidOf(r.transcript);
        addFromInterview({ question: r.score?.question || r.question, said, improved: improvedText(r.score), card: r.score, at });
      }
      done.add(r.id);
    }
    try { localStorage.setItem(HIST_DONE, JSON.stringify([...done].slice(-500))); } catch { /* storage full */ }
  }
  /** A session scored now was already captured live; mark its History row so
   *  deleting that story later does not bring it back through the import. */
  function markImported(historyId) {
    if (!historyId) return;
    try {
      const done = new Set(JSON.parse(localStorage.getItem(HIST_DONE) || '[]'));
      done.add(historyId);
      localStorage.setItem(HIST_DONE, JSON.stringify([...done].slice(-500)));
    } catch { /* storage full */ }
  }

  // Old STAR drafts from Today → My stories move in once.
  function migrate() {
    try { importHistory(); } catch { /* history unreadable */ }
    try {
      if (localStorage.getItem('qf.storiesMigrated')) return;
      const sp = JSON.parse(localStorage.getItem('qf.sprint') || '{}');
      const list = read();
      for (const x of sp.star || []) {
        if (list.some(s => s.migratedAt === x.at)) continue;
        list.push({ id: uid(), createdAt: x.at || Date.now(), updatedAt: x.at || Date.now(), migratedAt: x.at, source: x.source || 'star',
          title: (x.text || x.s || x.a || 'Story').split(/(?<=[.!?])\s/)[0].slice(0, 90),
          situation: x.s || '', task: x.t || '', action: x.text ? '' : (x.a || ''), result: x.r || '', text: x.text || '', questions: x.q ? [x.q] : [], signals: [] });
      }
      write(list);
      localStorage.setItem('qf.storiesMigrated', '1');
    } catch { /* nothing to move */ }
  }

  // ------------------------------------------------------- question bank --
  let BANK = null;
  async function bank() {
    if (BANK) return BANK;
    const r = await fetch('/api/behavioural/categories');
    if (!r.ok) throw new Error(r.status === 429 ? 'too many requests — wait a few seconds' : `server said ${r.status}`);
    const cats = (await r.json()).categories || [];
    const out = [];
    for (const c of cats) {
      const q = await fetch(`/api/behavioural/questions/${encodeURIComponent(c.id)}`).then(x => (x.ok ? x.json() : { questions: [] })).catch(() => ({ questions: [] }));
      out.push({ ...c, questions: q.questions || [] });
    }
    return (BANK = out);
  }
  const catOf = question => (BANK || []).find(c => c.questions.some(q => norm(q) === norm(question)));
  // Stories for a question: linked explicitly first, then ones whose signals fit its theme.
  function storiesFor(question, catId) {
    const list = read();
    const linked = list.filter(s => (s.questions || []).some(q => norm(q) === norm(question)));
    const want = EXPECT[catId]?.sig || [];
    const fits = list.filter(s => !linked.includes(s) && (s.signals || []).some(x => want.includes(x)));
    return { linked, fits };
  }

  // ---------------------------------------------------------------- view --
  let view = 'questions', query = '', openQ = null, pageIdx = {};
  function page() {
    let el = $('qfStoriesPage');
    if (!el) {
      el = document.createElement('div');
      el.id = 'qfStoriesPage'; el.className = 'qf-page'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-labelledby', 'qfStH');
      document.body.appendChild(el);
      el.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('qfStoryEdit')) close(); });
    }
    return el;
  }
  function close() { $('qfStoriesPage')?.remove(); document.documentElement.classList.remove('qf-page-open'); }

  async function open(v, focusQuestion) {
    migrate();
    if (v) view = v;
    if (focusQuestion) { openQ = norm(focusQuestion); query = ''; }
    document.documentElement.classList.add('qf-page-open');
    const el = page();
    // Sit under the header so Search, Design, the plan and the account menu stay usable.
    el.style.top = `${Math.max(0, Math.round((document.querySelector('#bar .bar-top') || $('bar'))?.getBoundingClientRect().bottom || 0))}px`;
    const list = read();
    el.innerHTML = `
      <div class="qf-page-in">
        <header class="qf-page-head">
          <div><h1 id="qfStH">My stories</h1>
            <p class="qf-muted">${list.length} stor${list.length === 1 ? 'y' : 'ies'} · every scored Googleyness answer is added here automatically.</p></div>
          <div class="qf-page-act">
            <button type="button" class="qf-b pri" id="qfStNew">+ New story</button>
            <button type="button" class="qf-x" id="qfStClose" aria-label="Close My stories">✕</button>
          </div>
        </header>
        <div class="qf-page-tools">
          <div class="qf-seg" role="group" aria-label="View">
            <button type="button" data-v="questions" aria-pressed="${view === 'questions'}">By question</button>
            <button type="button" data-v="stories" aria-pressed="${view === 'stories'}">All stories</button>
          </div>
          <label class="qf-sr" for="qfStQ">Search</label>
          <input id="qfStQ" class="qf-search" type="search" placeholder="${view === 'questions' ? 'Search questions…' : 'Search your stories…'}" value="${esc(query)}">
        </div>
        <div id="qfStBody"><p class="qf-muted">Loading…</p></div>
      </div>`;
    $('qfStClose').onclick = close;
    $('qfStNew').onclick = () => edit(null);
    el.querySelectorAll('[data-v]').forEach(b => { b.onclick = () => { view = b.dataset.v; open(); }; });
    const qIn = $('qfStQ');
    qIn.oninput = () => { query = qIn.value; renderBody(); };
    await renderBody();
    $('qfStClose').focus({ preventScroll: true });
    if (focusQuestion) {
      const row = el.querySelector('.qf-qrow.open');
      // A question outside the bank (attribute sheet, resume): show its story in All stories instead.
      if (row) row.scrollIntoView({ block: 'start' });
      else if (view === 'questions' && $('qfStBody')?.querySelector('.qf-qrow')) { query = focusQuestion; openQ = null; return open('stories'); }
    }
  }

  async function renderBody() {
    const body = $('qfStBody'); if (!body) return;
    if (view === 'stories') return renderStories(body);
    let cats;
    try { cats = await bank(); } catch (e) {
      body.innerHTML = `<p class="bv-err">Could not load the questions (${esc(e.message)}).</p><button type="button" class="qf-b" id="qfStRetry">Try again</button>`;
      $('qfStRetry').onclick = () => { BANK = null; renderBody(); }; return;
    }
    const q = norm(query);
    const total = cats.reduce((a, c) => a + c.questions.length, 0);
    const covered = cats.reduce((a, c) => a + c.questions.filter(x => storiesFor(x, c.id).linked.length).length, 0);
    body.innerHTML = `
      <div class="qf-cover"><span>${covered} of ${total} questions have a story</span><div class="qf-bar" aria-hidden="true"><i style="width:${Math.round(100 * covered / Math.max(1, total))}%"></i></div></div>
      ${cats.map(c => {
        const qs = c.questions.filter(x => !q || norm(x).includes(q));
        if (!qs.length) return '';
        const ex = EXPECT[c.id] || EXPECT.realq;
        return `<section class="qf-qcat"><h2>${esc(c.label)} <span class="qf-pill">${qs.length}</span></h2>
          <p class="qf-muted qf-qcat-sig">Interviewers listen for: ${ex.sig.map(x => esc(SIG[x])).join(' · ')}</p>
          <ul class="qf-qlist">${qs.map(x => {
            const { linked, fits } = storiesFor(x, c.id);
            const key = norm(x), isOpen = openQ === key;
            return `<li class="qf-qrow${isOpen ? ' open' : ''}">
              <button type="button" class="qf-qbtn" data-q="${esc(x)}" aria-expanded="${isOpen}">
                <span>${esc(x)}</span>
                <span class="qf-qbadge ${linked.length ? 'yes' : ''}">${linked.length ? `${linked.length} stor${linked.length === 1 ? 'y' : 'ies'}` : 'No story yet'}</span>
              </button>
              ${isOpen ? questionDetail(x, c, linked, fits) : ''}
            </li>`;
          }).join('')}</ul></section>`;
      }).join('') || '<p class="qf-muted">No question matches.</p>'}`;
    body.querySelectorAll('.qf-qbtn').forEach(b => { b.onclick = () => { const k = norm(b.dataset.q); openQ = openQ === k ? null : k; renderBody(); }; });
    wireDetail(body);
  }

  function starHtml(s) {
    const parts = [['situation', 'Situation'], ['task', 'Task'], ['action', 'Action'], ['result', 'Result'], ['reflection', 'Reflection']].filter(([k]) => s[k]);
    return parts.length
      ? `<dl class="qf-star-dl">${parts.map(([k, l]) => `<div><dt>${l}</dt><dd>${esc(s[k])}</dd></div>`).join('')}</dl>`
      : `<p class="qf-pre">${esc(s.text || '')}</p>`;
  }

  // ------------------------------------------- answers from my stories --
  // A question with no story (or wanting another answer): the model frames
  // up to three options, each from a different saved story. Options are kept
  // per question so reopening never asks the model again; "More options"
  // only sends stories not tried yet.
  const FKEY = 'qf.framed';
  const framed = () => { try { return JSON.parse(localStorage.getItem(FKEY) || '{}') || {}; } catch { return {}; } };
  const setFramed = (key, v) => { const all = framed(); all[key] = v; try { localStorage.setItem(FKEY, JSON.stringify(all)); } catch { /* quota */ } };
  const framing = new Set();
  const PARTS5 = [['situation', 'Situation'], ['task', 'Task'], ['action', 'Action'], ['result', 'Result'], ['reflection', 'Reflection']];
  const markGaps = t => esc(t).replace(/\[([^\]]+)\]/g, '<mark class="bk-gap">[$1]</mark>');
  /** Stories the model may still use for this question: your own, not already tried or linked here. */
  function sourcesFor(question) {
    const key = norm(question), f = framed()[key];
    const tried = new Set([...(f?.tried || []), ...read().filter(s => (s.questions || []).some(q => norm(q) === key)).map(s => s.fromStory || s.id)]);
    return read().filter(s => s.source !== 'framed' && !tried.has(s.id) && full(s).trim()).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 15);
  }
  /** Every story a reframe may use, and a fingerprint of them to tell whether anything changed since. */
  const allSources = () => read().filter(s => s.source !== 'framed' && full(s).trim()).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 15);
  const sig = list => list.map(s => `${s.id}:${s.updatedAt}`).sort().join('|');
  function framedHtml(question) {
    const key = norm(question), f = framed()[key], left = sourcesFor(question).length, busy = framing.has(key);
    if (!read().length) return '';
    const opts = f?.answers || [];
    const all = allSources(), fresh = f?.sig !== sig(all);
    const newCount = f ? all.filter(s => !(f.tried || []).includes(s.id)).length : 0;
    const best = opts.reduce((b, a, k) => ((a.fit ?? 0) > (opts[b]?.fit ?? 0) ? k : b), 0);
    return `<div class="qf-framed">
      ${opts.length ? `<h3>Answers framed from your stories <span class="qf-pill">${opts.length} option${opts.length === 1 ? '' : 's'}</span></h3>
        ${opts.map((a, k) => { const src = read().find(s => s.id === a.storyId); return `<article class="qf-story qf-framed-opt${k === best && opts.length > 1 ? ' best' : ''}">
          <h4>${k === best && opts.length > 1 ? '<span class="qf-pill qf-best">★ Best fit</span> ' : ''}Option ${k + 1} · from “${esc(src?.title || a.storyTitle || 'a saved story')}”${a.fit != null ? ` <span class="qf-pill">fit ${a.fit}/10</span>` : ''}</h4>
          ${a.why ? `<p class="qf-muted">${esc(a.why)}</p>` : ''}
          <dl class="qf-star-dl">${PARTS5.filter(([p]) => a[p]).map(([p, l]) => `<div><dt>${l}</dt><dd>${markGaps(a[p])}</dd></div>`).join('')}</dl>
          <div class="qf-m-act">${a.savedId ? '<span class="qf-pill">✓ Saved as a story for this question</span>' : `<button type="button" class="qf-b sm pri" data-fsave="${k}" data-q="${esc(question)}">Save as my story for this question</button>`}</div>
        </article>`; }).join('')}
        <p class="qf-muted">Framed by ${esc(f.model || 'model not recorded')} · ${esc(new Date(f.at).toLocaleString())}. Fill any <mark class="bk-gap">[bracket]</mark> with the real detail.</p>` : ''}
      <div class="qf-m-act">
        ${busy ? '<p class="qf-muted">Framing answers from your stories… about 30–60 seconds.</p>'
          : `${left ? `<button type="button" class="qf-b sm${opts.length ? '' : ' pri'}" data-frame="${esc(question)}">✦ ${opts.length ? 'More options from my other stories' : 'Frame an answer from my stories'}</button>
              <span class="qf-muted">${left} stor${left === 1 ? 'y' : 'ies'} not tried yet · up to 3 different answers</span>` : ''}
            ${opts.length ? `<button type="button" class="qf-b sm" data-reframe="${esc(question)}" title="Frame again from all your stories, including new ones; saved options are kept">↻ Reframe with all my stories${newCount ? ` (${newCount} new)` : ''}</button>` : ''}`}
      </div>
      ${!busy && opts.length && !fresh ? '<p class="qf-muted qf-reframe-note">Your stories have not changed since this was framed — Reframe will ask you to confirm before sending the same stories again.</p>' : ''}
      ${!busy && !left && !opts.length ? '<p class="qf-fb warn">⚠ All your saved stories have been tried for this question and none fits. Add a new story to get an option.</p>' : ''}
      </div>`;
  }
  async function frame(question, { reframe = false } = {}) {
    const key = norm(question), src = reframe ? allSources() : sourcesFor(question);
    if (!src.length || framing.has(key)) return;
    framing.add(key); renderBody();
    try {
      const r = await fetch('/api/behavioural/frame-from-stories', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, count: 3, model: window.Settings?.modelFor?.('starRewrite'), stories: src.map(s => ({ id: s.id, title: s.title, text: full(s) })) }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || `server said ${r.status}`);
      const prev = framed()[key] || { answers: [], tried: [] };
      const answers = (d.answers || []).map(a => ({ ...a, storyTitle: read().find(s => s.id === a.storyId)?.title || '' }));
      // A reframe replaces the options not saved yet; saved ones stay. Best fit first either way.
      const kept = reframe ? prev.answers.filter(a => a.savedId) : prev.answers;
      const merged = [...kept, ...answers.filter(a => !kept.some(k => k.storyId === a.storyId && k.savedId))].sort((a, b) => (b.fit ?? 0) - (a.fit ?? 0));
      // Everything sent counts as tried, used or not: the model judged the rest a poor fit.
      setFramed(key, { answers: merged, tried: [...new Set([...prev.tried, ...src.map(s => s.id)])], sig: sig(allSources()), model: d.model || prev.model, at: Date.now() });
      if (!answers.length) window.QF?.toast?.('None of those stories fits this question well — try writing a new one.');
    } catch (e) { window.QF?.toast?.(`Could not frame an answer: ${e.message}`); }
    framing.delete(key); renderBody();
  }

  function questionDetail(question, cat, linked, fits) {
    const ex = EXPECT[cat.id] || EXPECT.realq;
    const all = [...linked, ...fits];
    const key = norm(question);
    const i = Math.min(pageIdx[key] || 0, Math.max(0, all.length - 1));
    const s = all[i];
    return `<div class="qf-qdet">
      <div class="qf-expect">
        <h3>What a strong STAR answer needs</h3>
        <dl class="qf-star-dl">
          <div><dt>Situation</dt><dd>${esc(ex.s)}</dd></div>
          <div><dt>Action</dt><dd>${esc(ex.a)}</dd></div>
          <div><dt>Result</dt><dd>${esc(ex.r)}</dd></div>
          <div><dt>Reflection</dt><dd>${esc(ex.x)}</dd></div>
        </dl>
      </div>
      <div class="qf-mine">
        <div class="qf-mine-head"><h3>Your stor${all.length === 1 ? 'y' : 'ies'}</h3>
          ${all.length > 1 ? `<div class="qf-pager" role="group" aria-label="Choose a story">${all.map((_, k) => `<button type="button" data-page="${k}" data-key="${esc(key)}" aria-pressed="${k === i}" aria-label="Story ${k + 1}">${k + 1}</button>`).join('')}</div>` : ''}</div>
        ${s ? `<article class="qf-story">
            <h4>${esc(s.title || 'Untitled story')} ${linked.includes(s) ? '' : '<span class="qf-pill">fits this theme</span>'}</h4>
            ${starHtml(s)}
            ${(s.signals || []).length ? `<p class="qf-sigs">${s.signals.map(x => `<span class="qf-pill">${esc(SIG[x] || x)}</span>`).join(' ')}</p>` : ''}
            <div class="qf-m-act">
              <button type="button" class="qf-b sm" data-edit="${s.id}">Edit</button>
              ${linked.includes(s) ? '' : `<button type="button" class="qf-b sm" data-link="${s.id}" data-q="${esc(question)}">Use for this question</button>`}
              <button type="button" class="qf-b sm pri" data-practise="${esc(question)}">Practise with the AI</button>
            </div>
          </article>`
          : `<p class="qf-muted">No story yet. Write one, or answer this question in a Googleyness round and it will appear here.</p>
             <div class="qf-m-act"><button type="button" class="qf-b sm pri" data-new-for="${esc(question)}">Write a story for this</button>
             <button type="button" class="qf-b sm" data-practise="${esc(question)}">Practise with the AI</button></div>`}
        ${framedHtml(question)}
      </div></div>`;
  }

  function wireDetail(root) {
    root.querySelectorAll('[data-page]').forEach(b => { b.onclick = () => { pageIdx[b.dataset.key] = +b.dataset.page; renderBody(); }; });
    root.querySelectorAll('[data-edit]').forEach(b => { b.onclick = () => edit(read().find(x => x.id === b.dataset.edit)); });
    root.querySelectorAll('[data-link]').forEach(b => {
      b.onclick = () => { const s = read().find(x => x.id === b.dataset.link); if (s) { upsert({ ...s, questions: [...new Set([...(s.questions || []), b.dataset.q])] }); renderBody(); } };
    });
    root.querySelectorAll('[data-new-for]').forEach(b => { b.onclick = () => edit(null, b.dataset.newFor); });
    root.querySelectorAll('[data-frame]').forEach(b => { b.onclick = () => frame(b.dataset.frame); });
    root.querySelectorAll('[data-reframe]').forEach(b => {
      b.onclick = () => {
        const q = b.dataset.reframe, f = framed()[norm(q)];
        // Same stories as last time: confirm first, so the model is not asked the same thing by accident.
        if (f?.sig === sig(allSources()) && b.dataset.confirm !== '1') { b.dataset.confirm = '1'; b.textContent = '↻ Nothing changed — reframe anyway?'; return; }
        frame(q, { reframe: true });
      };
    });
    root.querySelectorAll('[data-fsave]').forEach(b => {
      b.onclick = () => {
        const question = b.dataset.q, key = norm(question), f = framed()[key], a = f?.answers?.[+b.dataset.fsave];
        if (!a || a.savedId) return;
        const s = upsert({ title: `${question.slice(0, 60)}${question.length > 60 ? '…' : ''}`, situation: a.situation, task: a.task, action: a.action, result: a.result, reflection: a.reflection,
          questions: [question], source: 'framed', fromStory: a.storyId, model: f.model });
        a.savedId = s.id; setFramed(key, f);
        window.QF?.toast?.('Saved to My stories for this question.'); renderBody();
      };
    });
    root.querySelectorAll('[data-practise]').forEach(b => {
      b.onclick = () => { close(); window.setInterviewMode?.('behavioural'); window.behaviouralPractise?.(b.dataset.practise, 'From My stories'); };
    });
  }

  function renderStories(body) {
    const q = norm(query);
    const list = read().filter(s => !q || norm(`${s.title} ${full(s)} ${(s.questions || []).join(' ')}`).includes(q)).sort((a, b) => b.updatedAt - a.updatedAt);
    body.innerHTML = list.length ? `<ul class="qf-stories-grid">${list.map(s => `
      <li class="qf-story">
        <h4>${esc(s.title || 'Untitled story')}</h4>
        <p class="qf-muted qf-story-meta">${s.source === 'interview' ? `From a mock${s.score ? ` · scored ${esc(s.score)}` : ''}` : s.source === 'framed' ? `Framed from your stories${s.model ? ` by ${esc(s.model)}` : ''}` : 'Written by you'} · ${esc(new Date(s.updatedAt).toLocaleDateString())}</p>
        <p class="qf-story-snip">${esc(full(s).slice(0, 260))}${full(s).length > 260 ? '…' : ''}</p>
        ${(s.questions || []).length ? `<p class="qf-muted">Answers: ${s.questions.slice(0, 3).map(esc).join(' · ')}${s.questions.length > 3 ? ` (+${s.questions.length - 3})` : ''}</p>` : ''}
        <div class="qf-m-act"><button type="button" class="qf-b sm" data-edit="${s.id}">View &amp; edit</button>
          <button type="button" class="qf-b sm" data-del="${s.id}">Delete</button></div>
      </li>`).join('')}</ul>` : (q
        ? `<p class="qf-muted">No story matches “${esc(String(query).trim())}”.</p>`
        : '<p class="qf-muted">No stories yet. Finish a Googleyness round or press + New story.</p>');
    body.querySelectorAll('[data-edit]').forEach(b => { b.onclick = () => edit(read().find(x => x.id === b.dataset.edit)); });
    body.querySelectorAll('[data-del]').forEach(b => {
      b.onclick = () => {
        if (b.dataset.confirm !== '1') { b.dataset.confirm = '1'; b.textContent = 'Really delete?'; return; }
        remove(b.dataset.del); window.QF?.toast?.('Story deleted.'); open();
      };
    });
  }

  // ------------------------------------------------------------- editor --
  async function edit(story, forQuestion) {
    let cats = []; try { cats = await bank(); } catch { /* the question picker is optional */ }
    const s = story || { title: '', situation: '', task: '', action: '', result: '', reflection: '', text: '', signals: [], questions: forQuestion ? [forQuestion] : [] };
    const back = document.createElement('div');
    back.className = 'qf-modal-back'; back.id = 'qfStoryEdit';
    const allQs = cats.flatMap(c => c.questions.map(q => [c.label, q]));
    back.innerHTML = `<div class="qf-modal" role="dialog" aria-modal="true" aria-labelledby="qfSeH">
      <div class="qf-modal-head"><h2 id="qfSeH">${story ? 'Edit story' : 'New story'}</h2><button type="button" class="qf-x" data-close aria-label="Close">✕</button></div>
      <form id="qfSeForm">
        <label class="qf-field"><span>Title</span><input name="title" value="${esc(s.title)}" maxlength="120" placeholder="e.g. Self-serve report upload that cut a 2-week wait to same day" required></label>
        ${s.said ? `<details class="qf-said"><summary>What you actually said in the mock</summary><p class="qf-pre">${esc(s.said)}</p></details>` : ''}
        ${s.text && !s.situation && !s.action ? `<label class="qf-field"><span>Full answer</span><textarea name="text" rows="6">${esc(s.text)}</textarea><small>Optional: split it into the STAR boxes below for practice.</small></label>` : ''}
        ${[['situation', 'Situation', 'Where, when, what was at stake.'], ['task', 'Task', 'What you specifically owned.'], ['action', 'Action', 'What YOU did, step by step. Use “I”.'], ['result', 'Result', 'Outcome with a number.'], ['reflection', 'Reflection', 'What you learnt / would do differently.']]
          .map(([k, l, h]) => `<label class="qf-field"><span>${l}</span><textarea name="${k}" rows="${k === 'action' ? 4 : 2}" placeholder="${esc(h)}">${esc(s[k] || '')}</textarea></label>`).join('')}
        <fieldset class="qf-fs"><legend>Google signals it shows</legend>
          <div class="qf-checks">${SIGNALS.map(([k, l]) => `<label class="qf-check"><input type="checkbox" name="sig" value="${k}" ${(s.signals || []).includes(k) ? 'checked' : ''}> ${esc(l)}</label>`).join('')}</div></fieldset>
        <fieldset class="qf-fs"><legend>Questions it answers</legend>
          <label class="qf-sr" for="qfSeQs">Filter questions</label>
          <input id="qfSeQs" class="qf-search" type="search" placeholder="Filter ${allQs.length} questions…">
          <div class="qf-qpick">${allQs.map(([cl, q]) => `<label class="qf-check" data-txt="${esc(norm(q))}"><input type="checkbox" name="q" value="${esc(q)}" ${(s.questions || []).some(x => norm(x) === norm(q)) ? 'checked' : ''}> <span>${esc(q)} <small class="qf-muted">${esc(cl)}</small></span></label>`).join('')}
            ${(s.questions || []).filter(x => !allQs.some(([, q]) => norm(q) === norm(x))).map(x => `<label class="qf-check"><input type="checkbox" name="q" value="${esc(x)}" checked> ${esc(x)}</label>`).join('')}</div></fieldset>
        <p class="qf-auth-err" id="qfSeErr" role="alert"></p>
        <div class="qf-m-act"><button type="submit" class="qf-b pri">${story ? 'Save changes' : 'Add story'}</button>
          <button type="button" class="qf-b" data-close>Cancel</button>
          ${story ? '<button type="button" class="qf-b" id="qfSeDel">Delete</button>' : ''}</div>
      </form></div>`;
    document.body.appendChild(back);
    const closeEd = () => back.remove();
    back.addEventListener('click', e => { if (e.target === back || e.target.closest('[data-close]')) closeEd(); });
    back.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); closeEd(); } });
    back.querySelector('input[name=title]').focus();
    $('qfSeQs').oninput = e => { const t = norm(e.target.value); back.querySelectorAll('.qf-qpick [data-txt]').forEach(l => { l.hidden = t && !l.dataset.txt.includes(t); }); };
    $('qfSeDel')?.addEventListener('click', e => {
      if (e.target.dataset.confirm !== '1') { e.target.dataset.confirm = '1'; e.target.textContent = 'Really delete?'; return; }
      remove(story.id); closeEd(); window.QF?.toast?.('Story deleted.'); open();
    });
    $('qfSeForm').onsubmit = e => {
      e.preventDefault();
      const f = new FormData(e.target);
      const v = k => String(f.get(k) || '').trim();
      const next = { ...(story || {}), title: v('title'), situation: v('situation'), task: v('task'), action: v('action'), result: v('result'), reflection: v('reflection'),
        text: f.has('text') ? v('text') : (s.text || ''), signals: f.getAll('sig'), questions: f.getAll('q'), source: story?.source || 'manual' };
      if (!next.title) { $('qfSeErr').textContent = 'Give the story a short title.'; return; }
      if (!full(next)) { $('qfSeErr').textContent = 'Write at least the situation and your actions.'; return; }
      upsert(next); closeEd(); window.QF?.toast?.(story ? 'Story saved.' : 'Story added.'); open();
    };
  }

  /** Best stories for a question, as {title, text}: linked ones first, then theme fits. */
  function forQuestion(question) {
    if (!question) return [];
    const cat = catOf(question);
    const { linked, fits } = storiesFor(question, cat?.id || 'realq');
    return [...linked, ...fits].slice(0, 4).map(s => ({ title: s.title || '', text: full(s) }));
  }

  // ------------------------------------- coach panel inside a live mock --
  // "How to crack it": what a strong answer needs and your matching stories,
  // folded away so you only look when you choose to.
  function coachPanel() {
    const qEl = $('bvQuestion');
    if (!qEl) return;
    let box = $('qfCoach');
    if (!box) {
      box = document.createElement('details');
      box.id = 'qfCoach'; box.className = 'qf-coach';
      document.querySelector('#bvInterview .bv-qbar')?.after(box);
    }
    const question = qEl.textContent.trim();
    migrate();
    // Re-draw when the question OR the bank changed (Practise again on the
    // question just scored should show the story that answer created).
    const stamp = `${question}|${read().length}|${Math.max(0, ...read().map(x => x.updatedAt || 0))}`;
    if (box.dataset.q === stamp) return;
    box.dataset.q = stamp;
    const cat = catOf(question);
    const ex = EXPECT[cat?.id] || EXPECT.googleyness;
    const { linked, fits } = storiesFor(question, cat?.id || 'googleyness');
    const all = [...linked, ...fits];
    let i = 0;
    const draw = () => {
      const st = all[i];
      box.innerHTML = `<summary>How to crack it — ${all.length ? `your ${all.length} matching stor${all.length === 1 ? 'y' : 'ies'}` : 'what a strong answer needs'} <span class="qf-muted">(peek only if stuck)</span></summary>
        <div class="qf-coach-in">
          <div><h4>Strong answer checklist</h4><ol class="qf-steps">
            <li><b>Situation</b> — ${esc(ex.s)}</li><li><b>Action</b> — ${esc(ex.a)}</li>
            <li><b>Result</b> — ${esc(ex.r)}</li><li><b>Reflection</b> — ${esc(ex.x)}</li></ol>
            <p class="qf-muted">Listens for: ${ex.sig.map(x => esc(SIG[x])).join(' · ')}</p></div>
          <div>${st ? `<div class="qf-mine-head"><h4>Your story${all.length > 1 ? `s` : ''}</h4>${all.length > 1 ? `<div class="qf-pager">${all.map((_, k) => `<button type="button" data-k="${k}" aria-pressed="${k === i}">${k + 1}</button>`).join('')}</div>` : ''}</div>
              <article class="qf-story"><h4>${esc(st.title || 'Story')}</h4>${starHtml(st)}</article>`
            : '<p class="qf-muted">No story for this yet — your answer here will be saved as one when it is scored.</p>'}</div>
        </div>`;
      box.querySelectorAll('[data-k]').forEach(b => { b.onclick = e => { e.preventDefault(); i = +b.dataset.k; const open = box.open; draw(); box.open = open; }; });
    };
    draw();
  }
  function watchInterview() {
    const qEl = $('bvQuestion');
    if (!qEl) return;
    new MutationObserver(() => { if (qEl.textContent.trim()) { bank().then(coachPanel).catch(coachPanel); } }).observe(qEl, { childList: true, characterData: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watchInterview); else watchInterview();

  window.QFStories = { open, close, addFromInterview, edit, read, upsert, remove, forQuestion, importHistory, markImported };
  // Anything in the header (search, design, plan, account) takes you out of the page.
  document.addEventListener('click', e => { if ($('qfStoriesPage') && e.target.closest('#bar button, #qfTabs [data-open]')) close(); }, true);
})();
