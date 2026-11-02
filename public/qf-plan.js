/* Nov 3 plan: a focused Google L3/L4 shortlist — its coding problems laid out
 * day by day up to the interview, and the Googleyness questions — worked with
 * the app's own tools: Solve opens the editor and judge, ▶ Short plays the
 * explainer, and every behavioural question opens the Today STAR drill (save,
 * AI feedback, 10/10 rewrite, history) or a live AI mock.
 * Data: /api/plan-nov3. Progress is read from what the app already records
 * (accepted submissions, saved STAR answers), so it syncs with the account.
 */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = t => String(t || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  const PREF = 'qf.plan';
  const pref = () => { try { return JSON.parse(localStorage.getItem(PREF)) || {}; } catch { return {}; } };
  const setPref = p => { try { localStorage.setItem(PREF, JSON.stringify({ ...pref(), ...p })); } catch { /* fine */ } };

  let DATA = null;
  const hints = new Set();                       // problems whose approach is shown
  async function data() {
    if (DATA) return DATA;
    const r = await fetch('/api/plan-nov3');
    if (!r.ok) throw new Error(r.status === 429 ? 'too many requests — wait a few seconds' : `server said ${r.status}`);
    return (DATA = await r.json());
  }

  // ------------------------------------------------------------ progress --
  function solved() {
    const set = new Set();
    try { for (const a of window.Attempts?.all?.() || []) if (a.mode === 'submit' && a.ok) set.add(a.slug); } catch { /* none */ }
    return set;
  }
  /** Saved STAR answers for a question (Today drill), newest last. */
  function starOf(q) {
    try { return (JSON.parse(localStorage.getItem('qf.sprint') || '{}').star || []).filter(x => norm(x.q) === norm(q)); } catch { return []; }
  }
  const bestScore = vs => vs.reduce((b, x) => Math.max(b, x.review?.overall?.score ?? -1, x.rewrite?.score ?? -1), -1);
  const daysLeft = iso => Math.max(0, Math.ceil((new Date(`${iso}T00:00:00`) - Date.now()) / 864e5));
  const todayLabel = () => new Date().toLocaleDateString('en-GB', { month: 'short', day: 'numeric' }).replace(/(\d+) (\w+)/, '$2 $1');

  // ---------------------------------------------------------------- page --
  function page() {
    let el = $('qfPlanPage');
    if (!el) {
      el = document.createElement('div');
      el.id = 'qfPlanPage'; el.className = 'qf-page'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-labelledby', 'qfPlH');
      document.body.appendChild(el);
      el.addEventListener('keydown', e => { if (e.key === 'Escape' && !document.querySelector('.qf-modal, .qs-back')) close(); });
    }
    return el;
  }
  function close() { $('qfPlanPage')?.remove(); document.documentElement.classList.remove('qf-page-open'); }

  async function open(tab) {
    if (tab) setPref({ tab });
    document.documentElement.classList.add('qf-page-open');
    const el = page();
    el.style.top = `${Math.max(0, Math.round((document.querySelector('#bar .bar-top') || $('bar'))?.getBoundingClientRect().bottom || 0))}px`;
    el.innerHTML = '<div class="qf-page-in"><p class="qf-muted">Loading the plan…</p></div>';
    let d;
    try { d = await data(); } catch (e) {
      el.innerHTML = `<div class="qf-page-in"><p class="bv-err">Could not load the plan (${esc(e.message)}).</p><button type="button" class="qf-b" id="qfPlRetry">Try again</button> <button type="button" class="qf-b" id="qfPlX">Close</button></div>`;
      $('qfPlRetry').onclick = () => open(); $('qfPlX').onclick = close; return;
    }
    render(d);
  }

  function render(d) {
    const el = $('qfPlanPage');
    if (!el) return;
    const tab = pref().tab || 'day';
    const done = solved();
    const P = d.problems, B = d.behavioural;
    const nSolved = P.filter(p => done.has(p.slug)).length, nStar = P.filter(p => p.star).length, nStarDone = P.filter(p => p.star && done.has(p.slug)).length;
    const nAns = B.filter(b => starOf(b.q).length).length;
    const scroll = el.querySelector('.qf-page-in')?.scrollTop || el.scrollTop;
    el.innerHTML = `
      <div class="qf-page-in">
        <header class="qf-page-head">
          <div><h1 id="qfPlH">${esc(d.title)}</h1>
            <p class="qf-muted">${daysLeft(d.interview)} days to go · ${esc(d.source)}</p></div>
          <div class="qf-page-act"><button type="button" class="qf-x" id="qfPlClose" aria-label="Close the plan">✕</button></div>
        </header>
        <div class="qf-pl-stats">
          <div><b>${nSolved}/${P.length}</b><span>coding solved</span><i style="width:${Math.round(100 * nSolved / P.length)}%"></i></div>
          <div><b>${nStarDone}/${nStar}</b><span>🔥 solved (most reported + real Google Qs)</span><i style="width:${Math.round(100 * nStarDone / nStar)}%"></i></div>
          <div><b>${nAns}/${B.length}</b><span>behavioural answered</span><i style="width:${Math.round(100 * nAns / B.length)}%"></i></div>
        </div>
        <p class="qf-muted qf-pl-note">ⓘ ${esc(d.note)}</p>
        <div class="qf-page-tools">
          <div class="qf-seg" role="group" aria-label="View">
            <button type="button" data-tab="day" aria-pressed="${tab === 'day'}">Day by day</button>
            <button type="button" data-tab="coding" aria-pressed="${tab === 'coding'}">Coding · ${P.length}</button>
            <button type="button" data-tab="behavioural" aria-pressed="${tab === 'behavioural'}">Behavioural · ${B.length}</button>
          </div>
          ${tab === 'coding' ? filtersHtml(d) : ''}
        </div>
        <div id="qfPlBody">${tab === 'behavioural' ? behaviouralHtml(B) : tab === 'coding' ? codingHtml(filtered(P, done), done) : dayHtml(d, done)}</div>
      </div>`;
    wire(el, d);
    const inner = el.querySelector('.qf-page-in');
    if (inner) inner.scrollTop = scroll; el.scrollTop = scroll;
  }

  // ------------------------------------------------------------- coding --
  const DIFF = { Easy: 'easy', Medium: 'medium', Hard: 'hard' };
  // Your own stars (to revisit), kept apart from the fixed "most reported" badge.
  // One store for every list (Nov 3 plan, NeetCode): starring in one shows in the other.
  const SKEY = 'qf.starred';
  const myStars = () => {
    let s = null;
    try { s = JSON.parse(localStorage.getItem(SKEY) || 'null'); } catch { /* start clean */ }
    if (!Array.isArray(s)) {                     // first use: bring over stars made in the plan before
      s = pref().stars || [];
      try { localStorage.setItem(SKEY, JSON.stringify(s)); } catch { /* quota */ }
    }
    return new Set(s);
  };
  const toggleStar = slug => {
    const s = myStars();
    s.has(slug) ? s.delete(slug) : s.add(slug);
    try { localStorage.setItem(SKEY, JSON.stringify([...s])); } catch { /* quota */ }
    window.dispatchEvent(new CustomEvent('stars-changed'));
    return s.has(slug);
  };
  window.QFStars = { has: slug => myStars().has(slug), toggle: toggleStar, count: () => myStars().size };
  function problemRow(p, done) {
    const ok = done.has(p.slug), open = hints.has(p.slug), mine = myStars().has(p.slug);
    return `<li class="qf-pl-p${ok ? ' done' : ''}">
      <span class="qf-pl-ok" title="${ok ? 'Solved (accepted)' : 'Not solved yet'}">${ok ? '✓' : '○'}</span>
      <div class="qf-pl-main">
        <div class="qf-pl-title"><b>${esc(p.id)}. ${esc(p.title)}</b>
          <span class="qf-pl-diff ${DIFF[p.difficulty] || ''}">${esc(p.difficulty)}</span>
          ${p.star ? (p.realq ? `<span class="qf-pill qf-pl-star" title="Related to a question actually asked at Google (Real questions ${esc(p.realq.toUpperCase())})">🔥 real Google Q</span>` : '<span class="qf-pill qf-pl-star" title="Very commonly reported at Google — fixed by the source list">🔥 most reported</span>') : ''}${p.premium ? '<span class="qf-pill">Premium</span>' : ''}
          <span class="qf-muted qf-pl-topic">${esc(p.topic)} · ${esc(p.day)}</span></div>
        ${open ? `<p class="qf-pl-hint"><b>Approach:</b> ${esc(p.approach)}</p>` : ''}
        <p class="qf-muted qf-pl-ev">${esc(p.evidence)}</p>
      </div>
      <div class="qf-pl-act">
        <button type="button" class="qf-b sm pri" data-solve="${esc(p.slug)}" data-title="${esc(p.title)}">${ok ? 'Solve again' : 'Solve'}</button>
        ${p.short ? `<button type="button" class="qf-b sm" data-short="${esc(p.slug)}" title="2-minute explainer">▶ Short</button>` : ''}
        <button type="button" class="qf-b sm" data-hint="${esc(p.slug)}" aria-pressed="${open}">${open ? 'Hide hint' : 'Hint'}</button>
        <button type="button" class="qf-b sm qf-pl-mystar" data-mystar="${esc(p.slug)}" aria-pressed="${mine}" title="${mine ? 'Starred by you — click to remove' : 'Star it to revisit later'}">${mine ? '★ Starred' : '☆ Star'}</button>
      </div>
    </li>`;
  }
  function filtersHtml(d) {
    const f = pref().f || {};
    const topics = [...new Set(d.problems.map(p => p.topic))];
    return `<div class="qf-pl-filters">
      <select data-f="topic" aria-label="Topic"><option value="">All topics</option>${topics.map(t => `<option${f.topic === t ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>
      <select data-f="diff" aria-label="Difficulty"><option value="">Any difficulty</option>${['Easy', 'Medium', 'Hard'].map(t => `<option${f.diff === t ? ' selected' : ''}>${t}</option>`).join('')}</select>
      <label><input type="checkbox" data-f="star"${f.star ? ' checked' : ''}> 🔥 only</label>
      <label><input type="checkbox" data-f="mine"${f.mine ? ' checked' : ''}> ★ My starred (${myStars().size})</label>
      <label><input type="checkbox" data-f="open"${f.open ? ' checked' : ''}> Unsolved only</label>
    </div>`;
  }
  function filtered(P, done) {
    const f = pref().f || {};
    return P.filter(p => (!f.topic || p.topic === f.topic) && (!f.diff || p.difficulty === f.diff) && (!f.star || p.star) && (!f.mine || myStars().has(p.slug)) && (!f.open || !done.has(p.slug)));
  }
  const codingHtml = (list, done) => (list.length ? `<ul class="qf-pl-list">${list.map(p => problemRow(p, done)).join('')}</ul>`
    : (pref().f || {}).mine && !myStars().size
      ? '<p class="qf-fb warn">You have not starred anything yet. Untick <b>★ My starred</b> to see every problem, then press <b>☆ Star</b> on any you want to revisit — it shows here and in NeetCode lists.</p>'
      : '<p class="qf-muted">Nothing matches these filters.</p>');

  function dayHtml(d, done) {
    const today = todayLabel();
    return d.plan.map(day => {
      const label = day.day.replace(/\s*\(.*\)/, '');
      const list = /review/i.test(day.focus) && day.count >= 20 ? d.problems.filter(p => p.star && !p.realq) : d.problems.filter(p => p.day === label);   // the timed review stays on the frequency list
      const n = list.filter(p => done.has(p.slug)).length;
      const isToday = label === today;
      return `<section class="qf-pl-day${isToday ? ' today' : ''}" ${isToday ? 'id="qfPlToday"' : ''}>
        <h2>${esc(day.day)}${isToday ? ' <span class="qf-pill qf-best">Today</span>' : ''} <span class="qf-muted">· ${esc(day.focus)}</span> <span class="qf-pill">${n}/${list.length}</span></h2>
        ${/review/i.test(day.focus) && day.count >= 20 ? '<p class="qf-muted">Re-solve every 🔥 most-reported problem timed (25 minutes each), no new topics.</p>' : '<p class="qf-muted">Do the 🔥 most-reported problems first under a 45-minute timer, talking out loud; the rest are stretch.</p>'}
        <ul class="qf-pl-list">${list.sort((a, b) => b.star - a.star).map(p => problemRow(p, done)).join('')}</ul>
      </section>`;
    }).join('') + `<section class="qf-pl-day"><h2>Nov 3 (Tue) <span class="qf-muted">· Interview day</span></h2><p class="qf-muted">Rest. No new problems.</p></section>`;
  }

  // ------------------------------------------------ your stories (Grok) --
  // Both new buttons draw on EVERY story saved in My stories, so each story
  // added is used from then on.
  const GROK = 'grok-4.6';                       // your xAI subscription (listed by this proxy); the server falls back to devin/grok-4-6
  const grokModel = () => window.Settings?.modelFor?.('grokCoach') || GROK;
  const fullStory = s => [s.situation, s.task, s.action, s.result, s.reflection].filter(Boolean).join('\n\n') || s.text || '';
  const myStories = () => {
    try { return (JSON.parse(localStorage.getItem('qf.stories') || '[]') || []).filter(s => s.source !== 'framed' && fullStory(s).trim()).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, 15); } catch { return []; }
  };
  const sig = list => list.map(s => `${s.id}:${s.updatedAt}`).sort().join('|');
  // Same store and shape as My stories' "Frame an answer", so both show the same options.
  const FKEY = 'qf.framed';
  const FRAME_V = 2;                             // v2: one answer per story; older sets reframe without asking
  const framed = () => { try { return JSON.parse(localStorage.getItem(FKEY) || '{}') || {}; } catch { return {}; } };
  const setFramed = (key, v) => { const all = framed(); all[key] = v; try { localStorage.setItem(FKEY, JSON.stringify(all)); } catch { /* quota */ } };
  const openAns = new Set(), framing = new Map();   // rows showing answers · in-flight requests (key -> error text or '')
  const gaps = t => esc(t).replace(/\[([^\]]+)\]/g, '<mark class="bk-gap">[$1]</mark>');
  const PARTS = [['situation', 'Situation'], ['task', 'Task'], ['action', 'Action'], ['result', 'Result'], ['reflection', 'Reflection']];

  // Two different numbers, kept apart: how well the story suits the question
  // (from the framing), and how the answer itself scores with the STAR reviewer.
  const fitPill = a => (a.fit != null ? ` <span class="qf-pill" title="How closely this story matches what the question tests — not the answer's score. Raise it by filling the brackets with real detail or adding a story that fits better.">story fit ${a.fit}/10</span>` : '');
  const scoring = new Set();
  function scoreHtml(q, i, a) {
    const s = a.star;
    if (s) return `<p class="qf-fb ${s.score >= 9 ? 'ok' : 'warn'}"><b>Answer STAR ${s.score ?? '?'}/10</b> · ${PARTS.map(([k, l]) => `${s.parts?.[k] ? '✓' : '✕'} ${l}`).join(' · ')}${s.fix ? `<br><b>Fix:</b> ${esc(s.fix)}` : ''}${/\[/.test(PARTS.map(([k]) => a[k] || '').join(' ')) ? '<br>Fill the <mark class="bk-gap">[brackets]</mark> with what really happened — a placeholder never earns full marks.' : ''}</p>`;
    return `<button type="button" class="qf-b sm" data-score-q="${esc(q)}" data-score-i="${i}"${scoring.has(`${norm(q)}:${i}`) ? ' disabled' : ''}>${scoring.has(`${norm(q)}:${i}`) ? 'Scoring…' : 'Score this answer (STAR)'}</button>`;
  }
  // One handler for the page and the popup; a score is kept with the answer, so it is never asked for twice.
  document.addEventListener('click', async e => {
    const b = e.target.closest?.('[data-score-q]');
    if (!b) return;
    const q = b.dataset.scoreQ, i = +b.dataset.scoreI, key = norm(q), f = framed()[key], a = f?.answers?.[i];
    if (!a || a.star || scoring.has(`${key}:${i}`)) return;
    scoring.add(`${key}:${i}`); b.disabled = true; b.textContent = 'Scoring…';
    try {
      const text = PARTS.filter(([k]) => a[k]).map(([k, l]) => `${l}: ${a[k]}`).join('\n');
      const r = await fetch('/api/behavioural/star', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        question: q, model: window.Settings?.modelFor?.('behaviouralScore'), messages: [{ role: 'assistant', content: q }, { role: 'user', content: text }] }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'scoring unavailable');
      const x = d.answers?.[0] || {};
      const cur = framed()[key];
      cur.answers[i].star = { score: d.overall?.score ?? null, parts: Object.fromEntries(PARTS.map(([k]) => [k, Boolean(x[k]?.present)])), fix: x.fix || '', model: d.model || null };
      setFramed(key, cur);
    } catch (err) { window.QF?.toast?.(`Could not score it: ${err.message}`); }
    scoring.delete(`${key}:${i}`);
    refresh();
    const m = document.getElementById('qfWatchModal');
    if (m) m.querySelector('[data-wt-tab="answers"][aria-selected="true"]')?.click();
  });

  function answersHtml(q) {
    const key = norm(q), f = framed()[key], all = myStories();
    if (framing.get(key) === '') return '<div class="qf-pl-ans"><p class="qf-muted">Framing an answer from your stories… about 30–60 seconds.</p></div>';
    const err = framing.get(key) ? `<p class="qf-fb no">${esc(framing.get(key))}</p>` : '';
    if (!f?.answers?.length) return `<div class="qf-pl-ans">${err}<p class="qf-muted">${f ? 'None of your stories fitted this question — add one in My stories and reframe.' : ''}</p>
      ${f ? `<button type="button" class="qf-b sm" data-reframe="${esc(q)}">↻ Reframe with all my stories</button>` : ''}</div>`;
    const [best, ...rest] = f.answers;
    const fresh = all.filter(s => !(f.tried || []).includes(s.id)).length;
    const opt = (a, top) => {
      const src = all.find(s => s.id === a.storyId);
      return `<article class="qf-pl-opt${top ? ' best' : ''}">
        <h4>${top ? '<span class="qf-pill qf-best">★ Best fit</span> ' : ''}from “${esc(src?.title || a.storyTitle || 'a saved story')}”${fitPill(a)}</h4>
        ${a.why ? `<p class="qf-muted">${esc(a.why)}</p>` : ''}
        <dl class="qf-star-dl">${PARTS.filter(([p]) => a[p]).map(([p, l]) => `<div><dt>${l}</dt><dd>${gaps(a[p])}</dd></div>`).join('')}</dl>
        ${scoreHtml(q, f.answers.indexOf(a), a)}
        <button type="button" class="qf-b sm pri" data-use="${esc(q)}" data-i="${f.answers.indexOf(a)}">Use as my STAR answer</button>
      </article>`;
    };
    return `<div class="qf-pl-ans">${err}
      ${opt(best, true)}
      ${rest.length ? `<h4 class="qf-pl-alt-h">Alternative answers from your other stories (${rest.length})</h4>${rest.map(a => opt(a, false)).join('')}` : ''}
      <p class="qf-muted">Framed by ${esc(f.model || 'model not recorded')} from ${(f.tried || []).length} stor${(f.tried || []).length === 1 ? 'y' : 'ies'} · ${esc(new Date(f.at).toLocaleString())}. Fill any <mark class="bk-gap">[bracket]</mark> with the real detail.</p>
      <button type="button" class="qf-b sm" data-reframe="${esc(q)}">↻ Reframe with all my stories${fresh ? ` (${fresh} new)` : ''}</button>
    </div>`;
  }

  async function frameAnswer(q) {
    const key = norm(q), src = myStories();
    if (!src.length) { window.QF?.toast?.('Add a story first — the answer is built only from your own stories.'); window.QFStories?.open?.(); return; }
    framing.set(key, ''); openAns.add(key); refresh();
    try {
      const r = await fetch('/api/behavioural/frame-from-stories', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        // One answer per story (up to five), so every story shows as an alternative to the best fit.
        body: JSON.stringify({ question: q, count: Math.min(5, src.length), model: grokModel(), stories: src.map(s => ({ id: s.id, title: s.title, text: fullStory(s) })) }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || `server said ${r.status}`);
      const prev = framed()[key] || { answers: [], tried: [] };
      const answers = (d.answers || []).map(a => ({ ...a, storyTitle: src.find(s => s.id === a.storyId)?.title || '' }));
      // Options already turned into stories stay; the rest are replaced. Best fit first.
      const kept = prev.answers.filter(a => a.savedId);
      setFramed(key, { answers: [...kept, ...answers].sort((a, b) => (b.fit ?? 0) - (a.fit ?? 0)), tried: src.map(s => s.id), sig: sig(src), v: FRAME_V, model: d.model || grokModel(), at: Date.now() });
      framing.delete(key);
    } catch (e) { framing.set(key, `Could not frame an answer: ${e.message}`); }
    refresh();
  }

  // ----------------------------------------------------- watch a mock --
  // A realistic Googleyness round played by two AI voices: the interviewer
  // asks and probes, the candidate answers from YOUR stories. Every round is
  // kept per question, so reopening shows it again instead of generating a
  // new one; "Generate a new mock" asks for a fresh round. The second tab
  // shows every answer framed from your stories, from history or on request.
  const WKEY = 'qf.watched';
  const watched = q => { try { return (JSON.parse(localStorage.getItem(WKEY) || '{}') || {})[norm(q)] || []; } catch { return []; } };
  function keepWatched(q, round) {
    let all = {};
    try { all = JSON.parse(localStorage.getItem(WKEY) || '{}') || {}; } catch { /* start clean */ }
    all[norm(q)] = [...(all[norm(q)] || []), round].slice(-10);      // the last ten rounds per question
    try { localStorage.setItem(WKEY, JSON.stringify(all)); } catch { /* quota */ }
  }
  const turnsHtml = (transcript, who, note) => transcript.map(t => `<div class="qf-wt-turn ${t.speaker}"><b>${t.speaker === 'candidate' ? 'Candidate' : 'Interviewer'}</b><p>${esc(t.text)}</p></div>`).join('')
    + (who ? `<div class="qf-wt-turn ${who} wait"><b>${who === 'candidate' ? 'Candidate' : 'Interviewer'}</b><p>${esc(note || 'thinking…')}</p></div>` : '');
  const starLine = s => (s ? `<p class="qf-fb ok"><b>STAR ${s.score ?? '?'}/10</b> · ${PARTS.map(([k, l]) => `${s.parts?.[k] ? '✓' : '✕'} ${l}`).join(' · ')}${s.summary ? `<br>${esc(s.summary)}` : ''}</p>` : '');

  let watchRun = 0;
  function watch(q, { tab = 'mocks' } = {}) {
    document.getElementById('qfWatchModal')?.remove();
    const canSpeak = Boolean(window.Voice?.canSpeak?.());
    const back = document.createElement('div');
    back.className = 'qf-modal-back'; back.id = 'qfWatchModal';
    back.innerHTML = `<div class="qf-modal" role="dialog" aria-modal="true" aria-labelledby="qfWtT">
      <div class="qf-modal-head"><h2 id="qfWtT">Watch: a Googleyness round</h2><button type="button" class="qf-x" data-close aria-label="Close">✕</button></div>
      <p class="qf-q">${esc(q)}</p>
      <div class="qf-star-tabs" role="tablist">
        <button type="button" role="tab" data-wt-tab="mocks">Watched mocks (<span id="qfWtNM">0</span>)</button>
        <button type="button" role="tab" data-wt-tab="answers">Answers from my stories (<span id="qfWtNA">0</span>)</button>
      </div>
      <div id="qfWtBody"></div></div>`;
    document.body.appendChild(back);
    const body = back.querySelector('#qfWtBody');
    const stop = () => { watchRun++; window.Voice?.stopSpeaking?.(); };
    const closeIt = () => { stop(); back.remove(); };
    back.addEventListener('click', e => { if (e.target === back || e.target.closest('[data-close]')) closeIt(); });
    back.addEventListener('keydown', e => { if (e.key === 'Escape') closeIt(); });
    const counts = () => { back.querySelector('#qfWtNM').textContent = watched(q).length; back.querySelector('#qfWtNA').textContent = framed()[norm(q)]?.answers?.length || 0; };
    const show = name => {
      stop();
      back.querySelectorAll('[data-wt-tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.wtTab === name)));
      counts();
      if (name === 'answers') return showAnswers();
      return watched(q).length ? showHistory(watched(q).length - 1) : runMock();
    };
    back.querySelectorAll('[data-wt-tab]').forEach(b => { b.onclick = () => show(b.dataset.wtTab); });

    // A saved round: replayed from history, never regenerated unless asked.
    function showHistory(i) {
      const rounds = watched(q), r = rounds[i];
      body.innerHTML = `
        <p class="qf-fb warn">⚠ From history — this round was saved ${esc(new Date(r.at).toLocaleString())}, so nothing was generated. Generate a new mock for a fresh round.</p>
        <div class="qf-m-act">
          <button type="button" class="qf-b pri" id="qfWtNew">▶ Generate a new mock</button>
          ${rounds.length > 1 ? `<span class="qf-pager" aria-label="Saved rounds">${rounds.map((x, k) => `<button type="button" data-round="${k}" aria-pressed="${k === i}" title="${esc(new Date(x.at).toLocaleString())}">${k + 1}</button>`).join('')}</span>` : ''}
          <button type="button" class="qf-b" id="qfWtPlay"${canSpeak ? '' : ' disabled'}>🔊 Read it aloud</button>
          <button type="button" class="qf-b" id="qfWtPractise">Practise it yourself</button>
        </div>
        <p class="qf-muted">Played by ${esc(r.model || 'model not recorded')} · candidate used ${r.stories?.length ? `your stories: ${r.stories.map(esc).join(', ')}` : 'no saved stories (generic strong candidate)'}.</p>
        <div class="qf-wt-log">${turnsHtml(r.transcript)}</div>
        ${starLine(r.star)}`;
      body.querySelector('#qfWtNew').onclick = runMock;
      body.querySelector('#qfWtPractise').onclick = () => { closeIt(); window.QFSprint?.star?.(q); };
      body.querySelectorAll('[data-round]').forEach(b => { b.onclick = () => showHistory(+b.dataset.round); });
      body.querySelector('#qfWtPlay').onclick = async () => {
        const run = ++watchRun;
        for (const t of r.transcript) {
          if (run !== watchRun || !document.body.contains(back)) return;
          await window.Voice.speakAsync(t.text, { voice: window.Voice?.voiceFor?.(t.speaker) || (t.speaker === 'candidate' ? 'bm_george' : 'bf_emma') });
        }
      };
    }

    // A fresh round, generated turn by turn, then saved to history.
    function runMock() {
      const stories = myStories();
      body.innerHTML = `
        <p class="qf-muted">${stories.length ? `The candidate answers from your ${stories.length} saved stor${stories.length === 1 ? 'y' : 'ies'} — your facts, delivered at strong-hire level. The interviewer probes like the real round.` : 'You have no saved stories yet, so the candidate answers as a generic strong candidate. Add stories in My stories to see YOUR stories delivered.'}</p>
        <div class="qf-m-act"><button type="button" class="qf-b" id="qfWtStop">Stop</button>
          <label class="qf-wt-voice"><input type="checkbox" id="qfWtVoice"${canSpeak ? ' checked' : ' disabled'}> Read aloud</label>
          <span class="qf-muted" id="qfWtState" aria-live="polite"></span></div>
        <div class="qf-wt-log" id="qfWtLog"></div>
        <div id="qfWtEnd"></div>`;
      const run = ++watchRun, live = () => run === watchRun && document.body.contains(back);
      const log = body.querySelector('#qfWtLog'), state = body.querySelector('#qfWtState'), voice = body.querySelector('#qfWtVoice');
      const transcript = [];
      let model = null;
      const paint = (who, note) => { log.innerHTML = turnsHtml(transcript, who, note); log.scrollTop = log.scrollHeight; };
      const finish = async why => {
        state.textContent = why;
        body.querySelector('#qfWtStop').disabled = true;
        const end = body.querySelector('#qfWtEnd');
        end.innerHTML = `<div class="qf-m-act"><button type="button" class="qf-b pri" id="qfWtPractise">Practise it yourself</button>
          <button type="button" class="qf-b" id="qfWtAgain">▶ Generate another mock</button></div><div id="qfWtScore"></div>`;
        end.querySelector('#qfWtPractise').onclick = () => { closeIt(); window.QFSprint?.star?.(q); };
        end.querySelector('#qfWtAgain').onclick = runMock;
        if (!transcript.some(t => t.speaker === 'candidate')) return;
        const round = { at: Date.now(), model, stories: stories.map(s => s.title || fullStory(s).slice(0, 40)), transcript: [...transcript], star: null };
        const box = end.querySelector('#qfWtScore');
        box.innerHTML = '<p class="qf-muted">Checking the candidate’s STAR structure…</p>';
        try {
          const r = await fetch('/api/behavioural/star', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
            question: q, model: window.Settings?.modelFor?.('behaviouralScore'),
            messages: transcript.map(t => ({ role: t.speaker === 'candidate' ? 'user' : 'assistant', content: t.text })) }) });
          const b = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(b.error || 'check unavailable');
          const a = b.answers?.[0] || {};
          round.star = { score: b.overall?.score ?? null, summary: b.overall?.summary || '', parts: Object.fromEntries(PARTS.map(([k]) => [k, Boolean(a[k]?.present)])) };
          box.innerHTML = starLine(round.star);
        } catch (e) { box.innerHTML = `<p class="qf-muted">STAR check unavailable (${esc(e.message)}).</p>`; }
        keepWatched(q, round);
        if (document.body.contains(back)) { counts(); state.textContent = `${why} Saved to this question's history.`; }
      };
      body.querySelector('#qfWtStop').onclick = () => { stop(); paint(); finish('Stopped.'); };
      (async () => {
        for (let turn = 0; turn < 9 && live(); turn++) {
          const speaker = turn % 2 === 0 ? 'interviewer' : 'candidate';
          paint(speaker);
          let r, d = {};
          for (let attempt = 0; attempt < 4 && live(); attempt++) {
            r = await fetch('/api/demo/turn', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
              mode: 'behavioural', speaker, question: q, statement: '', profile: window.Profile?.active?.(),
              stories: stories.map(s => ({ title: s.title, text: fullStory(s) })), transcript, model: grokModel() }) }).catch(e => ({ ok: false, status: 0, json: async () => ({ error: e.message }) }));
            // A passing proxy error: one retry before the round is given up.
            if (r.status >= 500 && attempt === 0) { paint(speaker, 'the model hiccuped — retrying…'); await new Promise(res => setTimeout(res, 3000)); continue; }
            if (r.status !== 429) break;
            // The per-minute AI budget: wait it out rather than end the round half-way.
            const secs = Math.min(65, Math.max(5, Number(r.headers?.get?.('RateLimit-Reset') || r.headers?.get?.('Retry-After')) || 30));
            for (let left = secs; left > 0 && live(); left--) { paint(speaker, `pausing for the AI rate limit — carrying on in ${left}s…`); await new Promise(res => setTimeout(res, 1000)); }
          }
          if (!live()) return;
          d = await r.json().catch(() => ({}));
          if (!r.ok) { paint(); return finish(`The round stopped: ${d.error || `server said ${r.status}`}`); }
          model = d.model || model || grokModel();
          transcript.push({ speaker, text: d.text });
          paint();
          if (voice.checked && window.Voice?.canSpeak?.()) {
            await window.Voice.speakAsync(d.text, { voice: window.Voice?.voiceFor?.(speaker) || (speaker === 'candidate' ? 'bm_george' : 'bf_emma') });
          }
          if (speaker === 'interviewer' && turn >= 6 && /\bthank(s| you)\b/i.test(d.text)) break;
        }
        if (live()) finish('Round finished.');
      })();
    }

    // Every answer framed from your stories, best fit first: from history, or generated on request.
    function showAnswers() {
      const key = norm(q), f = framed()[key], all = myStories(), busy = framing.get(key) === '';
      const fresh = f ? all.filter(s => !(f.tried || []).includes(s.id)).length : 0;
      const opts = f?.answers || [];
      body.innerHTML = `
        ${busy ? '<p class="qf-muted">Framing answers from your stories… about 30–60 seconds.</p>'
          : opts.length ? `<p class="qf-fb warn">⚠ From history — framed ${esc(new Date(f.at).toLocaleString())} by ${esc(f.model || 'model not recorded')} from ${(f.tried || []).length} stor${(f.tried || []).length === 1 ? 'y' : 'ies'}, so nothing was generated.${fresh ? ` ${fresh} new stor${fresh === 1 ? 'y has' : 'ies have'} been added since.` : ''}</p>`
          : `<p class="qf-muted">${all.length ? `No answers yet. Generate them from your ${all.length} saved stor${all.length === 1 ? 'y' : 'ies'} — one answer per story that fits, best fit first.` : 'Add a story in My stories first — answers are built only from your own stories.'}</p>`}
        ${framing.get(key) ? `<p class="qf-fb no">${esc(framing.get(key))}</p>` : ''}
        <div class="qf-m-act">${busy ? '' : `<button type="button" class="qf-b${opts.length ? '' : ' pri'}" id="qfWtGen"${all.length ? '' : ' disabled'}>${opts.length ? `↻ Generate again from all my stories${fresh ? ` (${fresh} new)` : ''}` : '✦ Generate answers from my stories'}</button>`}</div>
        ${opts.map((a, i) => {
          const src = all.find(s => s.id === a.storyId);
          return `<article class="qf-pl-opt${i === 0 ? ' best' : ''}">
            <h4>${i === 0 ? '<span class="qf-pill qf-best">★ Best fit</span> ' : ''}from “${esc(src?.title || a.storyTitle || 'a saved story')}”${fitPill(a)}</h4>
            ${a.why ? `<p class="qf-muted">${esc(a.why)}</p>` : ''}
            <dl class="qf-star-dl">${PARTS.filter(([p]) => a[p]).map(([p, l]) => `<div><dt>${l}</dt><dd>${gaps(a[p])}</dd></div>`).join('')}</dl>
            ${scoreHtml(q, i, a)}
            <button type="button" class="qf-b sm pri" data-wt-use="${i}">Use as my STAR answer</button>
          </article>`;
        }).join('')}`;
      const gen = body.querySelector('#qfWtGen');
      if (gen) gen.onclick = () => {
        // Nothing changed since the last framing: confirm before asking the model the same thing again.
        if (f?.v === FRAME_V && f?.sig === sig(all) && gen.dataset.confirm !== '1') { gen.dataset.confirm = '1'; gen.textContent = '↻ Nothing changed — generate anyway?'; return; }
        frameAnswer(q).then(() => { if (document.body.contains(back)) { counts(); showAnswers(); } });
        showAnswers();
      };
      body.querySelectorAll('[data-wt-use]').forEach(b => {
        b.onclick = () => {
          const a = opts[+b.dataset.wtUse];
          if (!a || !window.QFSprint?.addStarVersion) return;
          window.QFSprint.addStarVersion(q, { s: a.situation, t: a.task, a: a.action, r: [a.result, a.reflection].filter(Boolean).join(' ') });
          window.QF?.toast?.('Saved as your STAR answer — Open my answer to get feedback or the 10/10 version.');
          refresh();
        };
      });
    }

    show(tab);
  }

  // -------------------------------------------------------- behavioural --
  function behaviouralHtml(B) {
    const themes = [...new Set(B.map(b => b.theme))];
    const mine = myStories(), n = mine.length;
    return `<div class="qf-pl-mine"><b>Your stories (${n})</b> ${n ? mine.map(s => `<span class="qf-pill">${esc((s.title || fullStory(s)).slice(0, 60))}</span>`).join(' ') : '<span class="qf-muted">none yet</span>'}
        <button type="button" class="qf-b sm" id="qfPlStories">${n ? 'Manage in My stories' : '+ Add a story'}</button></div>
      <p class="qf-muted">Prepare 5–6 STAR stories that flex across these. <b>Practise (STAR)</b> opens the same drill as Today — save, AI feedback, ✦ 10/10 rewrite and the History tab.
      <b>✦ Answer from my stories</b> frames the answer from your saved stories, and <b>▶ Watch a mock</b> plays a realistic round where the candidate answers from them — using all ${n} of your stories, and every new one you add. <b>AI mock</b> asks it to you live.</p>
      ${themes.map(t => `<section class="qf-pl-day"><h2>${esc(t)}</h2><ul class="qf-pl-list">${B.filter(b => b.theme === t).map(b => {
        const vs = starOf(b.q), best = bestScore(vs), last = vs[vs.length - 1], key = norm(b.q), has = framed()[key]?.answers?.length;
        return `<li class="qf-pl-p qf-pl-b${vs.length ? ' done' : ''}">
          <span class="qf-pl-ok">${vs.length ? '✓' : '○'}</span>
          <div class="qf-pl-main"><div class="qf-pl-title"><b>${esc(b.q)}</b></div>
            <p class="qf-muted">${vs.length ? `Answered ${vs.length === 1 ? 'once' : `${vs.length} times`}${best >= 0 ? ` · best score ${best}/10` : ''}${last?.rewrite ? ' · 10/10 version ready' : ''} · last ${esc(new Date(last.at).toLocaleDateString())}` : 'Not answered yet'}${has ? ' · answer from your stories ready' : ''}</p></div>
          <div class="qf-pl-act">
            <button type="button" class="qf-b sm pri" data-star="${esc(b.q)}">${vs.length ? 'Open my answer' : 'Practise (STAR)'}</button>
            <button type="button" class="qf-b sm" data-frame="${esc(b.q)}" aria-expanded="${openAns.has(key)}">✦ ${has ? (openAns.has(key) ? 'Hide answer' : 'Answer from my stories') : 'Answer from my stories'}</button>
            <button type="button" class="qf-b sm" data-watch="${esc(b.q)}">▶ Watch a mock</button>
            <button type="button" class="qf-b sm" data-mock="${esc(b.q)}">AI mock</button>
          </div>
          ${openAns.has(key) ? answersHtml(b.q) : ''}</li>`;
      }).join('')}</ul></section>`).join('')}`;
  }

  // ---------------------------------------------------------------- wire --
  function wire(el, d) {
    $('qfPlClose').onclick = close;
    el.querySelectorAll('[data-tab]').forEach(b => { b.onclick = () => { setPref({ tab: b.dataset.tab }); render(d); }; });
    el.querySelectorAll('[data-f]').forEach(i => {
      i.onchange = () => { const f = { ...(pref().f || {}) }; f[i.dataset.f] = i.type === 'checkbox' ? i.checked : i.value; setPref({ f }); render(d); };
    });
    el.querySelectorAll('[data-mystar]').forEach(b => {
      b.onclick = () => { toggleStar(b.dataset.mystar); render(d); };
    });
    el.querySelectorAll('[data-hint]').forEach(b => { b.onclick = () => { const s = b.dataset.hint; hints.has(s) ? hints.delete(s) : hints.add(s); render(d); }; });
    el.querySelectorAll('[data-solve]').forEach(b => {
      b.onclick = () => { close(); window.openQuestion?.(b.dataset.solve, b.dataset.title).catch?.(() => { /* toast shown by openQuestion */ }); };
    });
    // ↑/↓ in the player walk THIS list, in the order shown (day, filters and stars included), not another topic.
    el.querySelectorAll('[data-short]').forEach(b => {
      b.onclick = () => {
        const seen = new Set(), items = [];
        for (const x of el.querySelectorAll('[data-short]')) {
          if (seen.has(x.dataset.short)) continue;
          seen.add(x.dataset.short);
          items.push({ slug: x.dataset.short, title: d.problems.find(p => p.slug === x.dataset.short)?.title || x.dataset.short });
        }
        window.QFShorts?.open?.(b.dataset.short, items);
      };
    });
    el.querySelectorAll('[data-star]').forEach(b => { b.onclick = () => window.QFSprint?.star?.(b.dataset.star); });
    el.querySelectorAll('[data-mock]').forEach(b => {
      b.onclick = () => { close(); window.setInterviewMode?.('behavioural'); window.behaviouralPractise?.(b.dataset.mock, 'Nov 3 plan'); };
    });
    el.querySelectorAll('[data-watch]').forEach(b => { b.onclick = () => watch(b.dataset.watch); });
    $('qfPlStories') && ($('qfPlStories').onclick = () => { close(); window.QFStories?.open?.('stories'); });
    el.querySelectorAll('[data-frame]').forEach(b => {
      b.onclick = () => {
        const q = b.dataset.frame, key = norm(q);
        // Already framed: just show or hide it — no new request.
        if (framed()[key]?.answers?.length || framing.has(key)) { openAns.has(key) ? openAns.delete(key) : openAns.add(key); render(d); return; }
        frameAnswer(q);
      };
    });
    el.querySelectorAll('[data-reframe]').forEach(b => {
      b.onclick = () => {
        const q = b.dataset.reframe, f = framed()[norm(q)];
        // Same stories as last time: confirm first, so the model is not asked the same thing by accident.
        if (f?.v === FRAME_V && f?.sig === sig(myStories()) && b.dataset.confirm !== '1') { b.dataset.confirm = '1'; b.textContent = '↻ Nothing changed — reframe anyway?'; return; }
        frameAnswer(q);
      };
    });
    el.querySelectorAll('[data-use]').forEach(b => {
      b.onclick = () => {
        const q = b.dataset.use, a = framed()[norm(q)]?.answers?.[+b.dataset.i];
        if (!a || !window.QFSprint?.addStarVersion) return;
        window.QFSprint.addStarVersion(q, { s: a.situation, t: a.task, a: a.action, r: [a.result, a.reflection].filter(Boolean).join(' ') });
        window.QF?.toast?.('Saved as your STAR answer — Open my answer to get feedback or the 10/10 version.');
        render(d);
      };
    });
    if ((pref().tab || 'day') === 'day' && !el.dataset.jumped) { el.dataset.jumped = '1'; $('qfPlToday')?.scrollIntoView({ block: 'start' }); }
  }

  // Back from the STAR drill (or a solve in another tab): repaint the progress.
  const refresh = () => { if ($('qfPlanPage') && DATA) render(DATA); };
  new MutationObserver(muts => { if (muts.some(m => [...m.removedNodes].some(n => n.nodeType === 1 && (n.classList?.contains('qf-modal') || n.querySelector?.('.qf-modal'))))) refresh(); })
    .observe(document.body, { childList: true });
  window.addEventListener('storage', refresh);

  window.QFPlan = { open, close };
})();
