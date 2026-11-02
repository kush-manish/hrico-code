/* Learn tab: the pattern catalogue with diagrams and a tutor, plus the full
 * AlgoMaster 300 problem list with per-device progress. */
(function () {
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const key = t => String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const leetSlug = t => String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  let mode = 'patterns';                 // 'patterns' | 'problems' | 'google'
  const MODES = ['patterns', 'problems', 'google'];
  let families = [];
  let current = null;
  let chat = [];
  let busy = false;
  let coverage = null;
  let list = null;                       // the AlgoMaster 300, once fetched
  const filter = { q: '', diff: '', only: 'all', open: new Set() };
  try { const m = localStorage.getItem('learn.mode'); if (MODES.includes(m)) mode = m; } catch { /* default */ }

  // ---------------------------------------------------------------- progress
  // Solved and starred problems, keyed by a loose form of the title so the
  // coding tab and the list agree even when punctuation differs.
  const PKEY = 'learn.progress';
  // `bulk` lists the keys the last "Solve all" ticked, so its undo clears only
  // those and never the problems actually solved.
  const progress = { solved: {}, starred: {}, attempted: {}, bulk: [] };
  try {
    const raw = JSON.parse(localStorage.getItem(PKEY) || '{}');
    Object.assign(progress.solved, raw.solved || {});
    Object.assign(progress.starred, raw.starred || {});
    Object.assign(progress.attempted, raw.attempted || {});
    if (Array.isArray(raw.bulk)) progress.bulk = raw.bulk.filter(k => typeof k === 'string');
  } catch { /* start clean */ }
  function persist() {
    try { localStorage.setItem(PKEY, JSON.stringify(progress)); } catch { /* quota or private mode */ }
    window.dispatchEvent(new CustomEvent('progress-changed'));
  }
  const solved = t => !!progress.solved[key(t)];
  const starred = t => !!progress.starred[key(t)];
  const attempted = t => !!progress.attempted[key(t)];
  function setSolved(t, on) {
    const k = key(t);
    if (on) progress.solved[k] = Date.now(); else delete progress.solved[k];
    if (progress.bulk.includes(k)) progress.bulk = progress.bulk.filter(x => x !== k);   // a real tick now
    persist();
  }
  function setAttempted(t, on) { if (on) progress.attempted[key(t)] = Date.now(); else delete progress.attempted[key(t)]; persist(); }
  /** Three-way status like the NeetCode list: 'solved' | 'attempted' | 'todo'. */
  const status = t => (solved(t) ? 'solved' : attempted(t) ? 'attempted' : 'todo');
  function setStatus(t, s) {
    if (s === 'solved') { setSolved(t, true); return; }
    if (solved(t)) setSolved(t, false);
    setAttempted(t, s === 'attempted');
  }
  function setStarred(t, on) { if (on) progress.starred[key(t)] = true; else delete progress.starred[key(t)]; persist(); }

  // ------------------------------------------------------------------ load
  async function load() {
    if (families.length) return;
    try {
      // Fetch both at once; coverage is optional and must not block the list.
      const cov = fetch('/api/patterns/meta/coverage').then(c => (c.ok ? c.json() : null)).catch(() => null);
      const r = await fetch('/api/patterns');
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(r.status === 429 ? 'Too many requests — wait a few seconds' : d.error || `server said ${r.status}`);
      families = d.families || [];
      coverage = (await cov) || coverage;
      renderList();
    } catch (e) {
      $('lnList').innerHTML = `<p class="hs-empty">Could not load the patterns (${e.message || 'network error'}). <button class="ghost ln-retry" type="button">Try again</button></p>`;
      $('lnList').querySelector('.ln-retry').onclick = () => load();
    }
  }

  async function loadProblems() {
    if (list) return list;
    const r = await fetch('/api/patterns/meta/algomaster');
    if (!r.ok) throw new Error('unavailable');
    list = await r.json();
    return list;
  }

  function setMode(m) {
    mode = m;
    try { localStorage.setItem('learn.mode', m); } catch { /* fine */ }
    renderList();
    if (mode === 'problems') renderProblems();
    else if (mode === 'google') renderGoogle();
    else renderDetail();
  }

  function renderGoogle() {
    $('lnList').innerHTML = modeBar() + '<div id="glSide"></div>';
    wireModes();
    window.GoogleLearn?.render($('glSide'));
  }

  // --------------------------------------------------------------- sidebar
  function modeBar() {
    return `<div class="ln-modes">
      <button class="ln-mode${mode === 'patterns' ? ' sel' : ''}" data-mode="patterns">Patterns</button>
      <button class="ln-mode${mode === 'problems' ? ' sel' : ''}" data-mode="problems">AlgoMaster 300</button>
      <button class="ln-mode${mode === 'google' ? ' sel' : ''}" data-mode="google">Google interview</button>
    </div>`;
  }

  function renderList() {
    if (mode === 'problems') return renderSectionList();
    if (mode === 'google') { if (!$('glSide')) renderGoogle(); return; }
    const head = coverage
      ? `<div class="ln-cover">
           <strong>${coverage.patterns.length} patterns</strong> · every shape a Google loop draws on
           <span>${coverage.covered} of ${coverage.patterns.reduce((a, p) => a + p.total, 0)}
             practice problems are in your question set</span>
         </div>`
      : '';
    $('lnList').innerHTML = modeBar() + head + families.map(f => `
      <div class="ln-family">
        <h3>${esc(f.family)}</h3>
        ${f.items.map(i => `
          <button class="ln-item${current?.id === i.id ? ' sel' : ''}" data-id="${esc(i.id)}">
            <span class="ln-item-name">${esc(i.name)}</span>
            <span class="ln-item-cue">${esc(i.cue)}</span>
          </button>`).join('')}
      </div>`).join('');
    wireModes();
    $('lnList').querySelectorAll('.ln-item').forEach(b => {
      b.onclick = () => open(b.dataset.id);
    });
  }

  function renderSectionList() {
    if (!list) {
      $('lnList').innerHTML = modeBar() + '<p class="hs-empty">Loading the list…</p>';
      wireModes();
      return;
    }
    const groups = new Map();
    for (const s of list.sections) {
      if (!groups.has(s.group)) groups.set(s.group, []);
      groups.get(s.group).push(s);
    }
    $('lnList').innerHTML = modeBar() + [...groups.entries()].map(([g, secs]) => `
      <div class="ln-family">
        <h3>${esc(g)}</h3>
        ${secs.map(s => {
          const done = s.problems.filter(p => solved(p.title)).length;
          return `<button class="ln-item ln-sec${done === s.problems.length ? ' done' : ''}" data-sec="${esc(s.section)}">
            <span class="ln-item-name">${esc(s.section)}</span>
            <span class="ln-item-cue">${done} / ${s.problems.length}</span>
          </button>`;
        }).join('')}
      </div>`).join('');
    wireModes();
    $('lnList').querySelectorAll('.ln-sec').forEach(b => {
      b.onclick = () => {
        filter.open.add(b.dataset.sec);
        renderProblems();
        document.getElementById(`sec-${cssId(b.dataset.sec)}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      };
    });
  }

  function wireModes() {
    $('lnList').querySelectorAll('.ln-mode').forEach(b => { b.onclick = () => setMode(b.dataset.mode); });
  }

  const MISFIT_VISUALS = new Set(['bits', 'heap']);
  const cssId = s => String(s).replace(/[^a-z0-9]+/gi, '-').toLowerCase();

  // ---------------------------------------------------------- problems view
  function visible(p) {
    if (filter.diff && p.difficulty !== filter.diff) return false;
    if (filter.only === 'unsolved' && solved(p.title)) return false;
    if (filter.only === 'starred' && !starred(p.title)) return false;
    if (filter.only === 'here' && !p.available) return false;
    if (filter.q && !key(p.title).includes(key(filter.q))) return false;
    return true;
  }

  async function renderProblems() {
    const box = $('lnDetail');
    try { await loadProblems(); } catch {
      box.innerHTML = '<p class="hs-empty">Could not load the AlgoMaster list. <button class="ghost ln-retry" type="button">Try again</button></p>';
      box.querySelector('.ln-retry').onclick = () => renderProblems();
      return;
    }
    // Always repaint the sidebar so its per-section counts follow every tick.
    if (mode === 'problems' || !$('lnList').querySelector('.ln-sec')) renderSectionList();
    const all = list.sections.flatMap(s => s.problems);
    const tally = d => {
      const rows = d ? all.filter(p => p.difficulty === d) : all;
      const done = rows.filter(p => solved(p.title)).length;
      return { done, total: rows.length, pct: rows.length ? Math.round(100 * done / rows.length) : 0 };
    };
    const t = tally(), e = tally('Easy'), m = tally('Medium'), h = tally('Hard');
    const shown = all.filter(visible).length;

    box.innerHTML = `
      <div class="ln-head">
        <div>
          <div class="ln-fam">Curated problem list</div>
          <h2>AlgoMaster 300</h2>
          <p class="ln-sub">300 problems in ${list.sections.length} sections, organised by pattern — the 3-month plan
            from <a href="${esc(list.source)}" target="_blank" rel="noopener">algomaster.io</a>.
            ${list.available} of them open straight in the coding tab; the rest link to LeetCode.</p>
        </div>
      </div>

      <div class="ln-progress">
        <div class="ln-prog-main">
          <div class="ln-prog-num"><strong>${t.done}</strong> / ${t.total} solved</div>
          <div class="hs-bar"><i style="width:${t.pct}%"></i></div>
        </div>
        ${[['Easy', e, 'easy'], ['Medium', m, 'medium'], ['Hard', h, 'hard']].map(([n, x, c]) => `
          <div class="ln-prog-diff">
            <span class="ln-diff ${c}">${n}</span>
            <span>${x.done}/${x.total} <em>(${x.pct}%)</em></span>
            <div class="hs-bar"><i class="${c}" style="width:${x.pct}%"></i></div>
          </div>`).join('')}
      </div>

      <div class="ln-tools">
        <input id="lnSearch" type="search" placeholder="Search ${t.total} problems" value="${esc(filter.q)}">
        <select id="lnDiff" aria-label="Difficulty">
          <option value="">Any difficulty</option>
          ${['Easy', 'Medium', 'Hard'].map(d => `<option${filter.diff === d ? ' selected' : ''}>${d}</option>`).join('')}
        </select>
        <select id="lnOnly" aria-label="Show">
          ${[['all', 'All problems'], ['unsolved', 'Unsolved'], ['starred', 'Starred'], ['here', 'In my Google set']]
            .map(([v, l]) => `<option value="${v}"${filter.only === v ? ' selected' : ''}>${l}</option>`).join('')}
        </select>
        <button id="lnRandom" class="primary" title="Open a random unsolved problem in the coding tab">Pick random unsolved</button>
        <button id="lnExpand" class="ghost">${filter.open.size >= list.sections.length ? 'Collapse all' : 'Expand all'}</button>
        <span class="ln-shown">${shown} shown</span>
      </div>

      ${list.sections.map(s => {
        const rows = s.problems.filter(visible);
        if (!rows.length && (filter.q || filter.diff || filter.only !== 'all')) return '';
        const done = s.problems.filter(p => solved(p.title)).length;
        const isOpen = filter.open.has(s.section) || !!filter.q;
        return `<section class="ln-section${isOpen ? ' open' : ''}" id="sec-${cssId(s.section)}">
          <div class="ln-sec-head" role="button" tabindex="0" data-sec="${esc(s.section)}" aria-expanded="${isOpen}">
            <span class="ln-sec-caret">${isOpen ? '▾' : '▸'}</span>
            <span class="ln-sec-name">${esc(s.section)}</span>
            ${s.pattern ? `<button class="ln-sec-pat" type="button" data-pat="${esc(s.pattern)}" title="Read the pattern behind this section">pattern</button>` : ''}
            <span class="ln-sec-count">${done} / ${s.problems.length}</span>
          </div>
          ${isOpen ? `<table class="ln-table"><thead><tr>
              <th class="c-st">Status</th><th>Problem</th><th class="c-diff">Difficulty</th><th class="c-act">Open</th><th class="c-star"></th>
            </tr></thead><tbody>${rows.map(row).join('')}</tbody></table>` : ''}
        </section>`;
      }).join('')}`;

    wireProblems();
  }

  function row(p) {
    const done = solved(p.title), star = starred(p.title), tried = !done && attempted(p.title);
    const diff = (p.difficulty || '').toLowerCase();
    return `<tr class="${done ? 'done' : tried ? 'tried' : ''}" data-title="${esc(p.title)}">
      <td class="c-st"><input type="checkbox" class="ln-tick" ${done ? 'checked' : ''} aria-label="Solved"${tried ? ' title="Attempted"' : ''}></td>
      <td class="c-name">${p.available
        ? `<button class="ln-open" data-slug="${esc(p.slug)}" data-title="${esc(p.title)}">${esc(p.title)}</button>`
        : `<span class="ln-ext-name">${esc(p.title)}</span>`}</td>
      <td class="c-diff"><span class="ln-diff ${esc(diff)}">${esc(p.difficulty)}</span></td>
      <td class="c-act">${p.available
        ? `<button class="ln-open ln-open-btn ghost" data-slug="${esc(p.slug)}" data-title="${esc(p.title)}">Practise</button>`
        : `<a class="ln-ext" href="https://leetcode.com/problems/${esc(leetSlug(p.title))}/" target="_blank" rel="noopener" title="Not in the local Google set — opens LeetCode">LeetCode ↗</a>`}</td>
      <td class="c-star"><button class="ln-star${star ? ' on' : ''}" aria-label="Star" title="Star this problem">${star ? '★' : '☆'}</button></td>
    </tr>`;
  }

  function wireProblems() {
    const box = $('lnDetail');
    // A div with role=button, not a <button>: the "pattern" link sits inside it
    // and a button nested in a button is split apart by the HTML parser.
    box.querySelectorAll('.ln-sec-head').forEach(h => {
      h.onclick = e => {
        if (e.target.closest('.ln-sec-pat')) return;
        const s = h.dataset.sec;
        if (filter.open.has(s)) filter.open.delete(s); else filter.open.add(s);
        renderProblems();
      };
      h.onkeydown = e => {
        if (e.target !== h || (e.key !== 'Enter' && e.key !== ' ')) return;
        e.preventDefault(); h.click();
      };
    });
    box.querySelectorAll('.ln-sec-pat').forEach(b => {
      b.onclick = e => { e.stopPropagation(); setMode('patterns'); open(b.dataset.pat); };
    });
    box.querySelectorAll('.ln-open').forEach(b => {
      b.onclick = () => window.openQuestion?.(b.dataset.slug, b.dataset.title);
    });
    box.querySelectorAll('.ln-tick').forEach(c => {
      c.onchange = () => { setSolved(c.closest('tr').dataset.title, c.checked); renderProblems(); };
    });
    box.querySelectorAll('.ln-star').forEach(b => {
      b.onclick = () => { const t = b.closest('tr').dataset.title; setStarred(t, !starred(t)); renderProblems(); };
    });
    // The checkbox and star are small; on touch the whole cell is the target.
    box.querySelectorAll('.ln-table td.c-st, .ln-table td.c-star').forEach(td => {
      td.onclick = e => {
        if (e.target.closest('input, button')) return;
        td.querySelector('.ln-tick, .ln-star')?.click();
      };
    });
    const search = $('lnSearch');
    let timer = null;
    search.oninput = () => { clearTimeout(timer); timer = setTimeout(() => {
      filter.q = search.value.trim(); const pos = search.selectionStart;
      renderProblems().then(() => { const s = $('lnSearch'); s.focus(); s.setSelectionRange(pos, pos); });
    }, 150); };
    $('lnDiff').onchange = e => { filter.diff = e.target.value; renderProblems(); };
    $('lnOnly').onchange = e => { filter.only = e.target.value; renderProblems(); };
    $('lnExpand').onclick = () => {
      if (filter.open.size >= list.sections.length) filter.open.clear();
      else list.sections.forEach(s => filter.open.add(s.section));
      renderProblems();
    };
    $('lnRandom').onclick = () => {
      const pool = list.sections.flatMap(s => s.problems)
        .filter(p => p.available && !solved(p.title) && visible(p));
      if (!pool.length) { window.QF?.toast?.('Nothing unsolved matches these filters'); return; }
      const pick = pool[Math.floor(Math.random() * pool.length)];
      window.openQuestion?.(pick.slug, pick.title);
    };
  }

  // ----------------------------------------------------------- pattern view
  async function open(id) {
    try {
      const r = await fetch(`/api/patterns/${encodeURIComponent(id)}`);
      if (!r.ok) throw new Error(r.status === 429 ? 'too many requests — wait a few seconds' : r.status === 404 ? 'unknown pattern' : `server said ${r.status}`);
      current = await r.json();
    } catch (e) {
      // Say so, rather than leaving the click looking dead.
      $('lnDetail').innerHTML = `<p class="hs-empty">Could not open that pattern (${esc(e.message || 'network error')}).
        <button class="ghost ln-retry" type="button">Try again</button></p>`;
      $('lnDetail').querySelector('.ln-retry').onclick = () => open(id);
      return;
    }
    chat = [];
    if (mode !== 'patterns') { mode = 'patterns'; try { localStorage.setItem('learn.mode', mode); } catch { /* fine */ } }
    renderList();
    renderDetail();
    $('lnDetail').scrollTop = 0;
  }

  function renderDetail() {
    const p = current;
    if (!p) {
      $('lnDetail').innerHTML = `<div class="ln-empty">
        <h2>Coding patterns</h2>
        <p>Interview questions are recombinations of a small number of shapes. Pick one
           from the list to see what it is, when to reach for it, the skeleton worth
           memorising, and the traps that actually cost people offers.</p>
        <p>Every pattern has a tutor you can interrogate — ask it why something works,
           or to walk a specific problem through the pattern.</p>
        <p>Switch to <button class="ln-inline" id="lnGoList">AlgoMaster 300</button> for the
           curated problem list with progress tracking, or
           <button class="ln-inline" id="lnGoGoogle">Google interview</button> for every question in
           your Google set explained with an animated walkthrough.</p>
      </div>`;
      $('lnGoList').onclick = () => setMode('problems');
      $('lnGoGoogle').onclick = () => setMode('google');
      return;
    }
    // 'bits' and 'heap' are aliases in visuals.js for the hash-map and
    // monotonic-stack drawings, which teach the wrong idea on those pages.
    const viz = !MISFIT_VISUALS.has(p.visual) && window.Visuals?.has(p.visual) ? window.Visuals.render(p.visual) : '';
    $('lnDetail').innerHTML = `
      <div class="ln-head">
        <div>
          <div class="ln-fam">${esc(p.family)}</div>
          <h2>${esc(p.name)}</h2>
        </div>
        ${window.Focus?.btn?.('learn', p.id) || ''}
      </div>
      <div class="ln-cue"><strong>Reach for it when</strong> ${esc(p.cue)}</div>
      ${viz ? `<div class="ln-viz">${viz}</div>` : ''}
      <p class="ln-idea">${esc(p.idea)}</p>
      <h4>Skeleton</h4>
      <pre class="ln-code">${esc(p.skeleton)}</pre>
      <h4>Complexity</h4>
      <p class="ln-complexity">${esc(p.complexity)}</p>
      <h4>Where people lose marks</h4>
      <ul class="ln-traps">${p.traps.map(t => `<li>${esc(t)}</li>`).join('')}</ul>
      <h4>Practise on <span class="ln-count">${p.problems.filter(q => q.available).length} of
        ${p.problems.length} are in your Google set · ${p.problems.filter(q => solved(q.title)).length} solved</span></h4>
      <div class="ln-problems">${p.problems.map(q => q.available
        ? `<button class="ln-prob ln-prob-go${solved(q.title) ? ' solved' : ''}" data-slug="${esc(q.slug)}" data-title="${esc(q.title)}"
             title="Open this question in the coding tab">${solved(q.title) ? '✓ ' : ''}${esc(q.title)}
             <span class="ln-diff ${esc((q.difficulty || '').toLowerCase())}">${esc(q.difficulty || '')}</span></button>`
        : `<a class="ln-prob ln-prob-off" href="https://leetcode.com/problems/${esc(leetSlug(q.title))}/" target="_blank" rel="noopener"
             title="Not in the local Google set — opens LeetCode">${esc(q.title)} ↗</a>`).join('')}</div>

      <div class="ln-tutor">
        <h4>Ask about this pattern</h4>
        <div id="lnChat" class="bv-log"></div>
        <div class="bv-compose">
          <textarea id="lnInput" rows="2" placeholder="Why does the window never need to move backwards?"></textarea>
          <button id="lnMic" class="ghost voice-btn" title="Ask by voice">&#127908;</button>
          <button id="lnSend" class="primary">Ask</button>
        </div>
        <div class="ln-prompts">
          ${['Walk me through this on a small example', 'When would this be the wrong choice?', 'What would an interviewer push me on?']
            .map(q => `<button class="ln-chip" data-q="${esc(q)}">${esc(q)}</button>`).join('')}
        </div>
      </div>`;

    document.querySelectorAll('.ln-prob-go').forEach(b => {
      b.onclick = () => window.openQuestion?.(b.dataset.slug, b.dataset.title);
    });

    $('lnSend').onclick = send;
    $('lnInput').addEventListener('keydown', e => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); send(); }
    });
    document.querySelectorAll('.ln-chip').forEach(c => {
      c.onclick = () => { $('lnInput').value = c.dataset.q; send(); };
    });
    $('lnMic').onclick = () => {
      if (!window.Voice?.canListen()) return;
      const box = $('lnInput');
      if (window.Voice.listening()) { window.Voice.stopListening(); return; }
      $('lnMic').classList.add('recording');
      window.Voice.listen({
        onPartial: t => { box.value = window.Dictation?.normaliseTechnical(t) ?? t; },
        onEnd: () => $('lnMic').classList.remove('recording'),
      });
    };
    renderChat();
  }

  function renderChat(thinking) {
    const el = $('lnChat');
    if (!el) return;
    el.innerHTML = chat.map(m => `
      <div class="bv-turn ${m.role === 'user' ? 'me' : ''}">
        <div class="bv-who">${m.role === 'user' ? 'You' : 'Tutor'}</div>
        <div class="bv-text">${esc(m.content)}</div>
      </div>`).join('')
      + (thinking ? '<div class="bv-turn"><div class="bv-who">Tutor</div><div class="bv-text bv-typing">thinking…</div></div>' : '');
    el.scrollTop = el.scrollHeight;
  }

  async function send() {
    const box = $('lnInput');
    const text = box.value.trim();
    if (!text || busy || !current) return;
    busy = true;
    box.value = '';
    chat.push({ role: 'user', content: text });
    renderChat(true);
    try {
      const r = await fetch('/api/patterns/tutor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patternId: current.id,
          messages: chat.slice(-12),
          model: window.Settings?.modelFor('codingChat'),
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'The tutor is unavailable.');
      chat.push({ role: 'assistant', content: d.reply });
    } catch (e) {
      chat.push({ role: 'assistant', content: `[${e.message}]` });
      box.value = text;                    // hand the question back
    } finally {
      busy = false;
      renderChat(false);
    }
  }

  /** Ticks every title; remembers which ones were not already solved. */
  function solveAll(titles) {
    if (Array.isArray(titles)) {
      const added = new Set(progress.bulk);
      for (const t of titles) {
        const k = key(t);
        if (!k || progress.solved[k]) continue;              // keep the real solve time
        progress.solved[k] = Date.now();
        added.add(k);
      }
      progress.bulk = [...added];
    }
    persist();
  }
  /**
   * Undo for solveAll. It used to wipe every solved mark in the app, so one
   * "Solve all" then "Clear" erased the AlgoMaster / NeetCode / coding-tab
   * progress too. Now it undoes the bulk tick if there was one, else clears
   * only the titles given, and only clears everything when called bare with
   * nothing to undo.
   */
  function unsolveAll(titles) {
    if (progress.bulk.length) {
      for (const k of progress.bulk) delete progress.solved[k];
      progress.bulk = [];
    } else if (Array.isArray(titles)) {
      for (const t of titles) delete progress.solved[key(t)];
    } else {
      progress.solved = {};
    }
    persist();
  }

  /** The coding tab reports each finished attempt; an accepted submit ticks the problem. */
  function noteAttempt(title, accepted) {
    if (!title) return;
    if (accepted) { if (solved(title)) return; setSolved(title, true); }
    else { if (solved(title) || attempted(title)) return; setAttempted(title, true); }
    if (mode === 'problems' && !$('lnLayout').classList.contains('hidden')) renderProblems();
  }

  window.Learn = {
    noteAttempt, setSolved, solved, solveAll, unsolveAll, attempted, setAttempted, status, setStatus,
    explain: slug => { setMode('google'); window.GoogleLearn?.open(slug); },
    // Used by the pop-out (/?view=learn&id=…) and other tabs, so it switches to the Learn tab too.
    openPattern: id => { window.setInterviewMode?.('learn'); setMode('patterns'); open(id); },
  };
  window.renderLearn = () => {
    load().then(() => {
      if (mode === 'problems') { renderSectionList(); renderProblems(); }
      else if (mode === 'google') renderGoogle();
      else if (!current) renderDetail();
    });
  };
})();
