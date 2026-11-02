/* Learn → Google interview: every question in the Google set, explained the
 * way you need to deliver it in the room, with an animated walkthrough. */
window.GoogleLearn = (function () {
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let data = null;                  // { questions, explained, animated }
  let current = null;               // slug
  let player = null;
  let approach = 'optimal';         // which walkthrough is showing
  const APPROACHES = [
    ['question', 'Understand the question', 'The question itself, on the example: what is given, what the terms mean, how the expected output forms, and the trap — before any algorithm.'],
    ['brute', 'Brute force', 'The naive approach, with its wasted work made visible — so you can see why it is not enough.'],
    ['optimal', 'Optimal', 'The algorithm you should actually write, one frame per decision, against the code.'],
    ['best', 'Interview delivery', 'The same optimal algorithm, with what you say out loud at each step — clarify, invariant, edge case, complexity.'],
  ];
  const filter = { q: '', diff: '', topic: '', only: 'all', list: '' };
  let lists = [];                   // the LeetCode Google lists, by name
  const listSlugs = {};             // name -> Set of slugs, fetched on first use
  const busy = { explain: false, walk: false };

  async function load() {
    if (data) return data;
    const r = await fetch('/api/google/questions');
    if (!r.ok) throw new Error('unavailable');
    data = await r.json();
    try { lists = (await fetch('/api/lists').then(x => x.json())) || []; } catch { lists = []; }
    return data;
  }

  const solved = t => window.Learn?.solved?.(t);

  function visible(q) {
    if (filter.list && !(listSlugs[filter.list]?.has(q.slug))) return false;
    if (filter.diff && q.difficulty !== filter.diff) return false;
    if (filter.topic && !(q.topics || []).includes(filter.topic)) return false;
    if (filter.only === 'explained' && !q.explained) return false;
    if (filter.only === 'todo' && q.explained) return false;
    if (filter.only === 'unsolved' && solved(q.title)) return false;
    if (filter.q) {
      const k = filter.q.toLowerCase();
      if (!q.title.toLowerCase().includes(k) && String(q.id) !== k) return false;
    }
    return true;
  }

  // -------------------------------------------------------------- sidebar ---
  function renderSidebar(container) {
    if (!data) { container.innerHTML = '<p class="hs-empty">Loading the Google set…</p>'; return; }
    const topics = [...new Set(data.questions.flatMap(q => q.topics || []))].sort();
    const rows = data.questions.filter(visible);
    container.innerHTML = `
      <div class="gl-tools">
        <input id="glSearch" type="search" placeholder="Search ${data.questions.length} questions" value="${esc(filter.q)}">
        <div class="gl-row">
          <select id="glDiff"><option value="">Any difficulty</option>
            ${['Easy', 'Medium', 'Hard'].map(d => `<option${filter.diff === d ? ' selected' : ''}>${d}</option>`).join('')}</select>
          <select id="glOnly">
            ${[['all', 'All'], ['explained', 'Explained'], ['todo', 'Not yet explained'], ['unsolved', 'Unsolved']]
              .map(([v, l]) => `<option value="${v}"${filter.only === v ? ' selected' : ''}>${l}</option>`).join('')}</select>
        </div>
        <select id="glList" title="LeetCode Google list"><option value="">Every Google list</option>
          ${lists.map(l => `<option value="${esc(l.name)}"${filter.list === l.name ? ' selected' : ''}>${esc(l.name)} (${l.count})</option>`).join('')}</select>
        <select id="glTopic"><option value="">Any topic</option>
          ${topics.map(t => `<option${filter.topic === t ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>
        <div class="gl-count" style="display:flex;align-items:center;justify-content:space-between;gap:6px;">
          <span>${rows.length} shown · ${data.explained} explained · ${(data.questions || []).filter(q => solved(q.title)).length} solved</span>
          <button id="glToggleSolved" class="ghost" type="button" style="padding:1px 6px;font-size:11px;cursor:pointer;white-space:nowrap;">${(data.questions || []).every(q => solved(q.title)) ? 'Clear' : '✓ Solve all'}</button>
        </div>
      </div>
      <div class="gl-list">${rows.map(q => `
        <button class="ln-item gl-q${current === q.slug ? ' sel' : ''}" data-slug="${esc(q.slug)}">
          <span class="ln-item-name">${solved(q.title) ? '✓ ' : ''}${esc(q.id)}. ${esc(q.title)}</span>
          <span class="ln-item-cue"><span class="ln-diff ${esc((q.difficulty || '').toLowerCase())}">${esc(q.difficulty)}</span>
            ${q.explained ? '<span class="gl-tag">explained</span>' : ''}${q.animated ? '<span class="gl-tag">animated</span>' : ''}</span>
        </button>`).join('')}</div>`;
    // Scoped to the container: two renders can overlap while the list loads,
    // and the first must not wire handlers onto the second's elements.
    const el = id => container.querySelector(`#${id}`);
    const search = el('glSearch');
    let t = null;
    search.oninput = () => { clearTimeout(t); t = setTimeout(() => {
      filter.q = search.value.trim(); const p = search.selectionStart;
      renderSidebar(container); const s = el('glSearch'); s.focus(); s.setSelectionRange(p, p);
    }, 150); };
    el('glDiff').onchange = e => { filter.diff = e.target.value; renderSidebar(container); };
    el('glOnly').onchange = e => { filter.only = e.target.value; renderSidebar(container); };
    el('glTopic').onchange = e => { filter.topic = e.target.value; renderSidebar(container); };
    el('glList').onchange = async e => {
      filter.list = e.target.value;
      if (filter.list && !listSlugs[filter.list]) {
        try {
          const rows = await fetch(`/api/lists/${encodeURIComponent(filter.list)}`).then(x => x.json());
          listSlugs[filter.list] = new Set((rows || []).map(x => x.slug));
        } catch { listSlugs[filter.list] = new Set(); }
      }
      renderSidebar(container);
    };
    const toggleBtn = el('glToggleSolved');
    if (toggleBtn) {
      toggleBtn.onclick = () => {
        const allSolved = (data.questions || []).every(q => solved(q.title));
        if (allSolved) {
          // Only this set: Learn.unsolveAll() wipes every tick in the app (NeetCode, AlgoMaster, Google list…).
          const qs = data.questions || [];
          if (!window.confirm(`Unmark all ${qs.length} questions in the Google set? Ticks on other lists are kept.`)) return;
          window.Learn?.unsolveAll?.(qs.map(q => q.title));   // undoes only the bulk tick if there was one
        } else {
          const n = (data.questions || []).length;
          if (!window.confirm(`Mark all ${n} questions as solved? You can undo this with the same button.`)) return;
          window.Learn?.solveAll?.((data.questions || []).map(q => q.title));
        }
        renderSidebar(container);
        // Keep the open question's Solved box in step with the bulk change.
        const box = document.getElementById('glSolved');
        const cq = (data.questions || []).find(x => x.slug === current);
        if (box && cq) box.checked = solved(cq.title);
      };
    }
    container.querySelectorAll('.gl-q').forEach(b => { b.onclick = () => open(b.dataset.slug); });
  }

  // --------------------------------------------------------------- detail ---
  async function open(slug) {
    current = slug;
    player?.destroy?.(); player = null;
    const side = $('lnList').querySelector('.gl-list');
    side?.querySelectorAll('.gl-q').forEach(b => b.classList.toggle('sel', b.dataset.slug === slug));
    const box = $('lnDetail');
    box.innerHTML = '<p class="hs-empty">Loading…</p>';
    try {
      const [q, c] = await Promise.all([
        fetch(`/api/question/${encodeURIComponent(slug)}`).then(r => r.json()),
        fetch(`/api/explain/${encodeURIComponent(slug)}`).then(r => r.json()),
      ]);
      renderDetail(q, c.explanation, c.walkthroughs || { optimal: c.walkthrough });
      box.scrollTop = 0;
    } catch {
      box.innerHTML = '<p class="hs-empty">Could not load this question.</p>';
    }
  }

  const list = (items, cls = '') => items?.length
    ? `<ul class="gl-ul ${cls}">${items.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '<p class="gl-none">—</p>';
  const qa = items => items?.length
    ? `<ul class="gl-ul gl-qa">${items.map(x => {
      const m = /^(.*?)\s+[—–-]{1,2}\s+(.*)$/.exec(x);
      return m ? `<li><strong>${esc(m[1])}</strong><br>${esc(m[2])}</li>` : `<li>${esc(x)}</li>`;
    }).join('')}</ul>` : '<p class="gl-none">—</p>';

  function renderDetail(q, ex, walks) {
    walks = walks || {};
    const walk = walks[approach] || null;
    const box = $('lnDetail');
    const mark = (data?.questions || []).find(x => x.slug === q.slug);
    const hint = APPROACHES.find(a => a[0] === approach)?.[2] || '';
    box.innerHTML = `
      <div class="ln-head gl-head">
        <div>
          <div class="ln-fam">Google set · ${esc((q.topicTags || []).join(' · ') || 'no topic')}</div>
          <h2>${esc(q.id)}. ${esc(q.title)} <span class="ln-diff ${esc((q.difficulty || '').toLowerCase())}">${esc(q.difficulty)}</span></h2>
        </div>
        <div class="gl-actions">
          <label class="gl-solved"><input type="checkbox" id="glSolved" ${solved(q.title) ? 'checked' : ''}> Solved</label>
          <button id="glPractise" class="primary">Practise in coding tab</button>
          <a class="nc-ext" href="https://leetcode.com/problems/${esc(q.slug)}/" target="_blank" rel="noopener" title="Open this problem on leetcode.com">LeetCode &#8599;</a>
        </div>
      </div>

      <details class="gl-statement" ${ex ? '' : 'open'}>
        <summary>Problem statement</summary>
        <div class="prose">${q.content || ''}</div>
      </details>

      <div id="glExplain">${ex ? explanationHtml(ex, walks.brute?.code || '') : `
        <div class="gl-gen">
          <h3>Interview-grade explanation</h3>
          <p>Not written yet. It covers what to clarify, the brute force and why it's not enough, the
             unlocking insight, the optimal approach step by step, a dry run, the code, what to say
             out loud, edge cases, follow-ups and the mistakes people make on this exact question.</p>
          <button id="glGen" class="primary">Explain this question</button>
          <span class="gl-wait hidden">Writing… 20–40 seconds.</span>
        </div>`}</div>

      <div id="glWalk" class="gl-walk">
        <h4>Animated walkthrough</h4>
        <div class="gl-appr" role="tablist">
          ${APPROACHES.map(([id, label]) => `<button class="gl-appr-btn${approach === id ? ' sel' : ''}" data-approach="${id}" role="tab" aria-selected="${approach === id}">
            ${label}<span class="gl-appr-dot ${walks[id] ? 'on' : ''}" title="${walks[id] ? 'ready' : 'not generated yet'}"></span></button>`).join('')}
        </div>
        <p class="gl-appr-hint">${esc(hint)}</p>
        ${walk ? '' : `<p class="gl-none">${ex ? 'Not generated yet for this approach.' : 'Explain the question first, then generate the animation.'}</p>
          <button id="glWalkGen" class="primary" ${ex ? '' : 'disabled'}>Generate ${esc(APPROACHES.find(a => a[0] === approach)?.[1].toLowerCase())} animation</button>
          <span class="gl-wait hidden">Tracing… 20–40 seconds.</span>`}
        <div id="glPlayer" class="gl-player"${walk ? '' : ' hidden'}></div>
        ${walk ? `<div class="gl-walk-meta">${(walk.examples || []).length} example${(walk.examples || []).length === 1 ? '' : 's'} ·
          ${(walk.examples || [{ frames: walk.frames }]).reduce((a, e) => a + (e.frames || []).length, 0)} steps in all, one per decision the algorithm makes ·
          ${(walk.examples || []).length < 2 ? `<button id="glWalkEdge" class="ln-inline">add edge cases</button> · ` : ''}<button id="glWalkRedo" class="ln-inline">regenerate</button>
          <span class="gl-wait hidden">Tracing… 20–40 seconds.</span></div>` : ''}
      </div>`;

    box.querySelectorAll('.gl-appr-btn').forEach(b => {
      b.onclick = () => { approach = b.dataset.approach; player?.destroy?.(); renderDetail(q, ex, walks); $('glWalk').scrollIntoView({ block: 'start', behavior: 'smooth' }); };
    });

    $('glPractise').onclick = () => window.openQuestion?.(q.slug, q.title);
    $('glSolved').onchange = e => { window.Learn?.setSolved?.(q.title, e.target.checked); if (mark) refreshSidebar(); };
    $('glGen') && ($('glGen').onclick = () => generate(q, 'explain'));
    $('glWalkGen') && ($('glWalkGen').onclick = () => generate(q, 'walk', false, approach));
    $('glWalkRedo') && ($('glWalkRedo').onclick = () => generate(q, 'walk', true, approach));
    $('glWalkEdge') && ($('glWalkEdge').onclick = () => generate(q, 'walk', false, approach, true));
    $('glRedo') && ($('glRedo').onclick = () => generate(q, 'explain', true));
    if (walk) {
      const onAsk = async ({ example, frame, question, messages }) => {
        const r = await fetch(`/api/explain/${encodeURIComponent(q.slug)}/ask`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ approach, example, frame, question, messages, model: window.Settings?.modelFor('codingChat') }),
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || 'The tutor is unavailable.');
        return d.reply;
      };
      player = window.Animate.mount($('glPlayer'), { ...walk, onAsk });
    }
  }

  function explanationHtml(ex, bruteCode = '') {
    const code = (lang, src) => src ? `<div class="gl-code"><div class="gl-code-lang">${esc(lang)}</div><pre class="ln-code">${esc(src)}</pre></div>` : '';
    return `
      <div class="gl-pattern"><strong>Pattern</strong> ${esc(ex.pattern)}<br><em>${esc(ex.oneLiner)}</em></div>

      <h4>1 · Clarify before you code</h4>${qa(ex.clarify)}
      <h4>2 · Brute force, and why it's not enough</h4>
      <p class="gl-p">${esc(ex.bruteForce.idea)}</p>
      ${code('Python 3 · brute force', ex.bruteForce.code || bruteCode)}
      <p class="ln-complexity">${esc(ex.bruteForce.time)} time · ${esc(ex.bruteForce.space)} space</p>
      <p class="gl-p gl-muted">${esc(ex.bruteForce.whyNot)}</p>
      <h4>3 · The insight</h4><p class="gl-p gl-insight">${esc(ex.insight)}</p>
      <h4>4 · Optimal approach</h4><ol class="gl-ol">${ex.approach.map(s => `<li>${esc(s)}</li>`).join('')}</ol>
      <h4>5 · Dry run on the sample</h4><pre class="ln-code gl-dry">${esc(ex.dryRun)}</pre>
      <h4>6 · Code — interview-ready</h4>${code('Python 3 · what you would write in the room', ex.code.python)}
      <h4>7 · Complexity</h4>
      <p class="ln-complexity">${esc(ex.complexity.time)} time · ${esc(ex.complexity.space)} space</p>
      <p class="gl-p">${esc(ex.complexity.why)}</p>
      <h4>8 · What to say out loud</h4>${list(ex.sayOutLoud, 'gl-say')}
      <h4>9 · Edge cases</h4>${list(ex.edgeCases)}
      <h4>10 · Follow-ups they'll ask</h4>${qa(ex.followUps)}
      <h4>11 · Mistakes people make here</h4>${list(ex.mistakes)}
      <p class="gl-muted gl-gen-meta">Written ${esc(new Date(ex.generatedAt).toLocaleString())} ·
        <button id="glRedo" class="ln-inline">regenerate</button></p>`;
  }

  async function generate(q, kind, force = false, appr = 'optimal', edge = false) {
    if (busy[kind]) return;
    busy[kind] = true;
    const wrap = kind === 'explain' ? $('glExplain') : $('glWalk');
    wrap.querySelector('.gl-wait')?.classList.remove('hidden');
    wrap.querySelectorAll(':scope > .bv-err').forEach(e => e.remove());   // one error at a time, not a pile
    wrap.querySelectorAll('button').forEach(b => { b.disabled = true; });
    try {
      const url = kind === 'explain' ? `/api/explain/${encodeURIComponent(q.slug)}` : `/api/explain/${encodeURIComponent(q.slug)}/walkthrough`;
      const r = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force, approach: appr, edge, model: window.Settings?.modelFor('explain') }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Generation failed.');
      const mark = (data?.questions || []).find(x => x.slug === q.slug);
      if (mark && kind === 'explain') mark.explained = true;
      if (mark && kind === 'walk' && appr === 'optimal') mark.animated = true;
      if (data && kind === 'explain' && !force) data.explained++;
      if (data && kind === 'walk' && appr === 'optimal' && !force) data.animated++;
      const c = await fetch(`/api/explain/${encodeURIComponent(q.slug)}`).then(x => x.json());
      if (current === q.slug) renderDetail(q, c.explanation, c.walkthroughs || { optimal: c.walkthrough });
      refreshSidebar();
    } catch (e) {
      wrap.querySelector('.gl-wait')?.classList.add('hidden');
      wrap.querySelectorAll('button').forEach(b => { b.disabled = false; });
      const err = document.createElement('p'); err.className = 'bv-err'; err.textContent = e.message;
      wrap.appendChild(err);
    } finally { busy[kind] = false; }
  }

  function refreshSidebar() {
    const side = $('lnList')?.querySelector('.gl-side');
    if (side) renderSidebar(side);
  }

  function renderEmpty() {
    $('lnDetail').innerHTML = `<div class="ln-empty">
      <h2>Google interview questions</h2>
      <p>Every question in your Google set, explained the way you need to deliver it in the room:
         what to clarify, the brute force and why it fails, the insight, the optimal approach,
         a dry run, clean code, what to say out loud, edge cases and the follow-ups.</p>
      <p>Each one also gets an <strong>animated walkthrough</strong> of the optimal algorithm on a small input,
         which you can play, pause and step through.</p>
      <p>Pick a question from the list.</p></div>`;
  }

  /** Called by learn.js when the Google mode is selected. */
  async function render(sidebar) {
    sidebar.innerHTML = '<div class="gl-side"></div>';
    const side = sidebar.querySelector('.gl-side');
    try { await load(); } catch { side.innerHTML = '<p class="hs-empty">Could not load the Google set.</p>'; return; }
    if (!side.isConnected) return;          // superseded by a later render
    renderSidebar(side);
    if (current) open(current); else renderEmpty();
  }

  return { render, open };
})();
