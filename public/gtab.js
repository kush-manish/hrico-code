/* Google tab: LeetCode's Google company list (last 30 days / last 3 months)
 * arranged the way the NeetCode tab is — collapsible pattern groups (Arrays &
 * Hashing, Two Pointers, Sliding Window …) with per-group progress — plus a
 * "by topic" view that mirrors leetcode.com/company/google's tag chips.
 *
 * Every question has a Python solution with insight, approach and complexity.
 * Questions that are also in the NeetCode 150 additionally offer the official
 * NeetCode solution and video; every question has a LeetCode shortcut.
 *
 * Progress is window.Learn's store (keyed by title), shared with every tab. */
window.GoogleTab = (function () {
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let data = null;            // {patterns, lists:[{key,label,count,topics}], questions:{key:[...]}}
  let list = '30d';           // '30d' | '3m'
  let view = 'pattern';       // 'pattern' (NeetCode groups) | 'topic' (LeetCode tags)
  let topic = 'all';          // 'all' | tag name — topic view only
  let search = '';
  let statusFilter = 'all';   // 'all' | 'todo' | 'attempted' | 'solved'
  let diffFilter = 'all';     // 'all' | 'Easy' | 'Medium' | 'Hard'
  let sort = 'freq';          // 'freq' | 'id' | 'diff' | 'ac'
  let current = null;         // slug of the open question
  const openGroups = new Set();
  const allOpen = () => patterns().length > 0 && patterns().every(p => openGroups.has(p));
  const solutions = {};       // slug -> {insight, approach, time, space, solution}
  const ncSolutions = {};     // slug -> {solution, video}

  const solved = t => Boolean(window.Learn?.solved?.(t));
  const statusOf = t => (window.Learn?.status ? window.Learn.status(t) : (solved(t) ? 'solved' : 'todo'));
  const STATUS = [['todo', '○ To do'], ['attempted', '✱ Attempted'], ['solved', '✓ Solved']];
  const MARK = { solved: '<span class="nc-tick">✓</span> ', attempted: '<span class="nc-tick att">✱</span> ', todo: '' };
  const DIFF_ORDER = { Easy: 0, Medium: 1, Hard: 2 };

  try {
    const s = JSON.parse(localStorage.getItem('gtab.view') || '{}');
    if (s.list) list = s.list; if (s.sort) sort = s.sort; if (s.view) view = s.view;
    if (Array.isArray(s.open)) s.open.forEach(p => openGroups.add(p));
  } catch { /* defaults */ }
  const remember = () => { try { localStorage.setItem('gtab.view', JSON.stringify({ list, sort, view, open: [...openGroups] })); } catch { /* fine */ } };

  window.addEventListener('progress-changed', () => {
    if (document.body.dataset.mode === 'google' && data) renderSidebar();
  });

  async function load() {
    if (data) return data;
    const r = await fetch('/api/google');
    if (!r.ok) throw new Error('Google list unavailable');
    data = await r.json();
    return data;
  }

  const listMeta = () => data.lists.find(l => l.key === list) || data.lists[0];
  const rows = () => data.questions[list] || [];
  const patterns = () => data.patterns || [];

  function visible(q) {
    if (view === 'topic' && topic !== 'all' && !q.topics.includes(topic)) return false;
    if (statusFilter !== 'all' && statusOf(q.title) !== statusFilter) return false;
    if (diffFilter !== 'all' && q.difficulty !== diffFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      if (!q.title.toLowerCase().includes(s) && String(q.id) !== s) return false;
    }
    return true;
  }
  const filtering = () => Boolean(search) || statusFilter !== 'all' || diffFilter !== 'all';

  function sorted(qs) {
    const by = {
      freq: (a, b) => (b.frequency ?? -1) - (a.frequency ?? -1) || Number(a.id) - Number(b.id),
      id: (a, b) => Number(a.id) - Number(b.id),
      diff: (a, b) => DIFF_ORDER[a.difficulty] - DIFF_ORDER[b.difficulty] || (b.frequency ?? -1) - (a.frequency ?? -1),
      ac: (a, b) => parseFloat(b.acRate || 0) - parseFloat(a.acRate || 0),
    };
    return [...qs].sort(by[sort] || by.freq);
  }

  /** The list as the sidebar shows it: grouped by pattern, each group sorted. */
  function orderedAll() {
    if (view === 'topic') return sorted(rows().filter(visible));
    const out = [];
    for (const p of patterns()) out.push(...sorted(rows().filter(q => q.pattern === p && visible(q))));
    return out;
  }

  function pickRandom() {
    const pool = rows().filter(q => visible(q) && !solved(q.title));
    const from = pool.length ? pool : rows().filter(visible);
    if (!from.length) return;
    open(from[Math.floor(Math.random() * from.length)].slug);
  }

  // -------------------------------------------------------------- sidebar ---

  const rowHtml = q => `
    <button class="ln-item nc-q gg-q${current === q.slug ? ' sel' : ''}" data-slug="${esc(q.slug)}">
      <span class="ln-item-name">${MARK[statusOf(q.title)]}<span class="gg-id">${esc(q.id)}.</span> ${esc(q.title)}</span>
      <span class="ln-item-cue">
        ${q.neetcode ? '<span class="nc-cue gg-nc" title="Also in the NeetCode 150 — official solution + video">NC</span>' : ''}
        ${q.frequency != null ? `<span class="gg-freq" title="Frequency ${q.frequency}"><i style="width:${Math.max(4, Math.round(q.frequency))}%"></i></span>` : ''}
        <span class="ln-diff ${esc(q.difficulty.toLowerCase())}">${esc(q.difficulty)}</span>
        <a class="nc-row-lc" href="https://leetcode.com/problems/${esc(q.slug)}/" target="_blank" rel="noopener" title="Open on leetcode.com" aria-label="Open on LeetCode">&#8599;</a>
      </span>
    </button>`;

  function groupsHtml(all) {
    const groups = patterns()
      .map(p => ({ pattern: p, all: all.filter(q => q.pattern === p) }))
      .filter(g => g.all.length)
      .map(g => ({ ...g, items: sorted(g.all.filter(visible)) }))
      .filter(g => g.items.length || !filtering());
    if (!groups.length) return '<p class="nc-none">Nothing matches these filters.</p>';
    return `<div class="nc-groups">${groups.map(g => {
      const gDone = g.all.filter(q => solved(q.title)).length;
      const isOpen = openGroups.has(g.pattern) || filtering();
      return `
        <div class="nc-group">
          <button class="nc-group-head" data-pattern="${esc(g.pattern)}" aria-expanded="${isOpen}">
            <span class="nc-caret">${isOpen ? '▾' : '▸'}</span>
            <span class="nc-group-name">${esc(g.pattern)}</span>
            <span class="nc-group-count">${gDone}/${g.all.length}</span>
            <span class="nc-group-bar"><i style="width:${(gDone / g.all.length) * 100}%"></i></span>
          </button>
          ${isOpen ? `<div class="nc-group-items">${g.items.map(rowHtml).join('') || '<p class="nc-none">Nothing matches here.</p>'}</div>` : ''}
        </div>`;
    }).join('')}</div>`;
  }

  function topicsHtml(all, meta) {
    const shown = sorted(all.filter(visible));
    const topicDone = t => all.filter(q => q.topics.includes(t) && solved(q.title)).length;
    return `
      <div class="gg-topics" role="tablist" aria-label="Topics">
        <button class="gg-topic${topic === 'all' ? ' sel' : ''}" data-topic="all">All topics <span>${all.length}</span></button>
        ${meta.topics.map(t => `<button class="gg-topic${topic === t.name ? ' sel' : ''}" data-topic="${esc(t.name)}" title="${topicDone(t.name)} of ${t.count} solved">${esc(t.name)} <span>${t.count}</span></button>`).join('')}
      </div>
      <div class="gg-rows">
        <div class="gg-rows-head"><span>${shown.length} problem${shown.length === 1 ? '' : 's'}${topic !== 'all' ? ` · ${esc(topic)}` : ''}</span></div>
        ${shown.map(rowHtml).join('') || '<p class="nc-none">Nothing matches these filters.</p>'}
      </div>`;
  }

  /** Order/filter changed: redraw, and redraw the open problem too so its
   *  "N of M", Prev/Next and editor queue follow the new order. */
  const reflow = () => (current ? open(current) : renderSidebar());

  function renderSidebar() {
    const box = $('ggList');
    if (!data) { box.innerHTML = '<p class="hs-empty">Loading the Google list…</p>'; return; }
    const meta = listMeta();
    const all = rows();
    const done = all.filter(q => solved(q.title)).length;
    const pct = all.length ? Math.round((done / all.length) * 100) : 0;
    const byDiff = d => { const a = all.filter(q => q.difficulty === d); return `${a.filter(q => solved(q.title)).length}/${a.length}`; };

    box.innerHTML = `
      <div class="nc-tools">
        <div class="nc-lists" role="tablist" aria-label="Google question windows">
          ${data.lists.map(l => `<button class="nc-list-btn${list === l.key ? ' sel' : ''}" data-list="${esc(l.key)}" role="tab" aria-selected="${list === l.key}" title="${esc(l.name)}">${esc(l.label)} <small>${l.count}</small></button>`).join('')}
        </div>
        <div class="nc-progress">
          <div class="nc-prog-bar"><i style="width:${pct}%"></i></div>
          <span class="nc-prog-num"><strong>${done}</strong> / ${all.length} solved</span>
        </div>
        <div class="nc-diffs" title="Solved by difficulty">
          <span class="easy">E ${byDiff('Easy')}</span><span class="medium">M ${byDiff('Medium')}</span><span class="hard">H ${byDiff('Hard')}</span>
        </div>
        <div class="nc-filter-row">
          <input id="ggSearch" type="search" placeholder="Search ${all.length} problems" value="${esc(search)}">
          <button id="ggRandom" class="ghost icon-btn" title="Pick a random unsolved problem">&#127922;</button>
        </div>
        <div class="nc-filter-row">
          <select id="ggStatus" title="Filter by status">
            <option value="all"${statusFilter === 'all' ? ' selected' : ''}>All status</option>
            ${STATUS.map(([v, l]) => `<option value="${v}"${statusFilter === v ? ' selected' : ''}>${l}</option>`).join('')}
          </select>
          <select id="ggDiff" title="Filter by difficulty">
            <option value="all"${diffFilter === 'all' ? ' selected' : ''}>All levels</option>
            ${['Easy', 'Medium', 'Hard'].map(d => `<option value="${d}"${diffFilter === d ? ' selected' : ''}>${d}</option>`).join('')}
          </select>
          <select id="ggSort" title="Sort within each group">
            <option value="freq"${sort === 'freq' ? ' selected' : ''}>Frequency</option>
            <option value="id"${sort === 'id' ? ' selected' : ''}>Number</option>
            <option value="diff"${sort === 'diff' ? ' selected' : ''}>Difficulty</option>
            <option value="ac"${sort === 'ac' ? ' selected' : ''}>Acceptance</option>
          </select>
        </div>
        <div class="gg-view" role="tablist" aria-label="Group by">
          <button class="gg-view-btn${view === 'pattern' ? ' sel' : ''}" data-view="pattern" role="tab" aria-selected="${view === 'pattern'}" title="NeetCode's pattern groups: Arrays & Hashing, Two Pointers, Sliding Window…">By pattern</button>
          <button class="gg-view-btn${view === 'topic' ? ' sel' : ''}" data-view="topic" role="tab" aria-selected="${view === 'topic'}" title="LeetCode's topic tags, as on the company page">By topic</button>
          ${view === 'pattern' ? `<button class="ghost gg-expand" id="ggExpand" title="${allOpen() ? 'Collapse all groups' : 'Expand all groups'}">${allOpen() ? 'Collapse' : 'Expand'} all</button>` : ''}
        </div>
      </div>
      ${view === 'pattern' ? groupsHtml(all) : topicsHtml(all, meta)}
      <p class="nc-credit">Lists from LeetCode's Google company page · grouped by NeetCode's patterns · NeetCode solutions MIT-licensed (neetcode-gh/leetcode)</p>`;

    box.querySelectorAll('.nc-list-btn').forEach(b => b.onclick = () => {
      list = b.dataset.list; remember();
      if (topic !== 'all' && !listMeta().topics.some(t => t.name === topic)) topic = 'all';
      renderSidebar();
      if (current && !rows().some(q => q.slug === current)) { current = null; renderIntro(); }
      // Still in the new list: redraw so the header, position and Prev/Next follow it.
      else if (current) open(current);
      else renderIntro();
    });
    box.querySelectorAll('.gg-view-btn').forEach(b => b.onclick = () => { view = b.dataset.view; remember(); reflow(); });
    const expand = box.querySelector('#ggExpand');
    if (expand) expand.onclick = () => {
      if (allOpen()) openGroups.clear(); else patterns().forEach(p => openGroups.add(p));
      remember(); renderSidebar();
    };
    box.querySelectorAll('.nc-group-head').forEach(b => b.onclick = () => {
      const p = b.dataset.pattern;
      if (openGroups.has(p)) openGroups.delete(p); else openGroups.add(p);
      remember(); renderSidebar();
    });
    box.querySelectorAll('.gg-topic').forEach(b => b.onclick = () => { topic = b.dataset.topic; reflow(); });
    box.querySelectorAll('.gg-q').forEach(b => b.onclick = e => {
      if (e.target.closest('.nc-row-lc')) return;
      open(b.dataset.slug);
    });
    const s = box.querySelector('#ggSearch');
    let t = null;
    s.oninput = () => { clearTimeout(t); t = setTimeout(() => {
      search = s.value.trim(); const p = s.selectionStart;
      reflow(); const s2 = $('ggList').querySelector('#ggSearch'); s2.focus(); s2.setSelectionRange(p, p);
    }, 150); };
    box.querySelector('#ggStatus').onchange = e => { statusFilter = e.target.value; reflow(); };
    box.querySelector('#ggDiff').onchange = e => { diffFilter = e.target.value; reflow(); };
    box.querySelector('#ggSort').onchange = e => { sort = e.target.value; remember(); reflow(); };
    box.querySelector('#ggRandom').onclick = pickRandom;
  }

  // --------------------------------------------------------------- detail ---

  function renderIntro() {
    const meta = data ? listMeta() : null;
    $('ggDetail').innerHTML = `
      <div class="nc-intro">
        <h1>Google · ${meta ? esc(meta.label) : ''}</h1>
        <p>Every question LeetCode tags as asked at Google in this window, arranged like the
           NeetCode 150: open a pattern group on the left, work down it, and each solved question
           is ticked here, in NeetCode, Learn and on Home.</p>
        <ul>
          <li><strong>By pattern</strong> uses NeetCode's shelves — Arrays &amp; Hashing, Two Pointers, Sliding Window, Trees, Graphs, DP… Questions that are also in the NeetCode 150 sit on the same shelf there.</li>
          <li><strong>By topic</strong> switches to LeetCode's own tag chips, as on the company page.</li>
          <li><strong>Solution</strong> — every question has a Python solution with the key insight, step-by-step approach and complexity. <strong>NC</strong> questions also show the official NeetCode solution and video.</li>
          <li><strong>Frequency bar</strong> is LeetCode's signal for how often it comes up; <strong>↗</strong> opens it on leetcode.com.</li>
        </ul>
      </div>`;
  }

  // ‹ › in the editor walk the list in the order the sidebar shows it.
  const ggQueue = () => ({ key: `google-${list}`, label: `Google · ${listMeta().label}`, items: orderedAll().map(x => ({ slug: x.slug, title: x.title, id: x.id, difficulty: x.difficulty })) });

  async function open(slug) {
    current = slug;
    const q = rows().find(x => x.slug === slug);
    if (q && view === 'pattern' && !openGroups.has(q.pattern)) { openGroups.add(q.pattern); remember(); }
    renderSidebar();
    $('ggList').querySelector('.gg-q.sel')?.scrollIntoView({ block: 'nearest' });
    if (!q) return renderIntro();
    const box = $('ggDetail');
    box.innerHTML = '<p class="hs-empty">Loading…</p>';
    let full = null;
    try { full = await fetch(`/api/question/${encodeURIComponent(slug)}`).then(r => r.ok ? r.json() : null); }
    catch { /* statement is optional; the actions still work */ }
    if (current !== slug) return;
    const st = statusOf(q.title);
    const ordered = orderedAll();
    const idx = ordered.findIndex(x => x.slug === slug);
    const prev = idx > 0 ? ordered[idx - 1] : null;
    const next = idx >= 0 && idx < ordered.length - 1 ? ordered[idx + 1] : null;
    const nc = q.neetcode;
    box.innerHTML = `
      <div class="ln-head nc-head">
        <div>
          <div class="ln-fam">${esc(q.pattern)} · Google · ${esc(listMeta().label)}${q.frequency != null ? ` · frequency ${esc(q.frequency)}` : ''}${idx >= 0 ? ` · ${idx + 1} of ${ordered.length}` : ''}</div>
          <h2>${esc(q.id)}. ${esc(q.title)}
            <span class="ln-diff ${esc(q.difficulty.toLowerCase())}">${esc(q.difficulty)}</span>
            ${q.acRate ? `<span class="chip" title="LeetCode acceptance rate">${esc(q.acRate)}</span>` : ''}
            ${q.paidOnly ? '<span class="chip premium">Premium</span>' : ''}</h2>
          <div class="gg-tags">${q.topics.map(t => `<button class="chip gg-tag" data-topic="${esc(t)}" title="Show every ${esc(t)} question">${esc(t)}</button>`).join('')}</div>
        </div>
        <div class="gl-actions">
          <select id="ggStatusSel" class="q-status ${st}" title="Progress on this problem">
            ${STATUS.map(([v, l]) => `<option value="${v}"${st === v ? ' selected' : ''}>${l}</option>`).join('')}
          </select>
          <button id="ggPractise" class="primary">Solve in editor</button>
        </div>
      </div>
      <div class="nc-nav">
        <button class="ghost" id="ggPrev"${prev ? '' : ' disabled'} title="${prev ? esc(prev.title) : ''}">&#8249; Prev</button>
        <button class="ghost" id="ggNext"${next ? '' : ' disabled'} title="${next ? esc(next.title) : ''}">Next &#8250;</button>
        <span class="spacer"></span>
        <a class="nc-ext" href="https://leetcode.com/problems/${esc(slug)}/" target="_blank" rel="noopener" title="Open this problem on leetcode.com">LeetCode &#8599;</a>
        ${nc ? `<a class="nc-ext" href="https://neetcode.io/problems/${esc(slug)}" target="_blank" rel="noopener" title="Open this problem on neetcode.io">NeetCode &#8599;</a>` : ''}
      </div>
      ${full?.content ? `<details class="gl-statement" open><summary>Problem statement</summary>
        <div class="prose">${full.content}</div></details>` : '<p class="hs-empty">Statement not available locally — use the LeetCode link above.</p>'}
      <div class="nc-sol-wrap">
        <div class="ln-fam">Solution${nc ? ` · also in NeetCode 150 · ${esc(nc.pattern)}${nc.blind75 ? ' · Blind 75' : ''}` : ''}</div>
        <div class="nc-sol-actions">
          ${q.hasSolution ? `<button id="ggShowSol" class="ghost">${solutions[slug] ? 'Hide solution' : 'Show solution'}</button>` : ''}
          ${nc?.hasSolution ? `<button id="ggShowNc" class="ghost">${ncSolutions[slug] ? 'Hide NeetCode solution' : 'Show NeetCode solution'}</button>` : ''}
          ${nc?.video ? `<a class="nc-video" href="https://youtu.be/${esc(nc.video)}" data-title="${esc(q.title)} · NeetCode walkthrough" target="_blank" rel="noopener">▶ NeetCode video walkthrough</a>` : ''}
        </div>
        <div id="ggSolBox">${solutions[slug] ? solutionHtml(slug) : ''}</div>
        <div id="ggNcBox">${ncSolutions[slug] ? ncSolutionHtml(slug) : ''}</div>
      </div>`;

    $('ggStatusSel').onchange = e => {
      if (window.Learn?.setStatus) window.Learn.setStatus(q.title, e.target.value);
      else window.Learn?.setSolved?.(q.title, e.target.value === 'solved');
      e.target.className = `q-status ${e.target.value}`;
      renderSidebar();
    };
    $('ggPrev').onclick = () => prev && open(prev.slug);
    $('ggNext').onclick = () => next && open(next.slug);
    $('ggPractise').onclick = () => window.openQuestion?.(slug, q.title, { queue: ggQueue() });
    box.querySelectorAll('.gg-tag').forEach(b => b.onclick = () => { view = 'topic'; topic = b.dataset.topic; remember(); open(slug); });

    const showSol = $('ggShowSol');
    if (showSol) showSol.onclick = () => toggle(showSol, slug, 'ggSolBox', solutions, `/api/google/solution/${encodeURIComponent(slug)}`, solutionHtml, 'Show solution', 'Hide solution');
    const showNc = $('ggShowNc');
    if (showNc) showNc.onclick = () => toggle(showNc, slug, 'ggNcBox', ncSolutions, `/api/neetcode/solution/${encodeURIComponent(slug)}`, ncSolutionHtml, 'Show NeetCode solution', 'Hide NeetCode solution');
    if (solutions[slug]) wireSolution('ggSolBox', slug, solutions);
    if (ncSolutions[slug]) wireSolution('ggNcBox', slug, ncSolutions);
  }

  async function toggle(btn, slug, boxId, store, url, html, showText, hideText) {
    if (store[slug]) {
      delete store[slug];
      $(boxId).innerHTML = '';
      btn.textContent = showText;
      return;
    }
    btn.disabled = true;
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error('unavailable');
      store[slug] = await r.json();
      $(boxId).innerHTML = html(slug);
      btn.textContent = hideText;
      wireSolution(boxId, slug, store);
    } catch {
      $(boxId).innerHTML = '<p class="bv-err">Could not load the solution.</p>';
    }
    btn.disabled = false;
  }

  /** "1. Do x. 2. Do y." arrives as one string; show it as numbered steps. */
  function stepsHtml(text) {
    const src = String(text || '').trim();
    let steps;
    if (src.includes('\n')) {
      // One step per line, "N. " prefix optional.
      steps = src.split('\n').map(s => s.trim().replace(/^\d{1,2}[.)]\s*/, '')).filter(Boolean);
    } else {
      // Single line: accept "N. " only where N is the next expected step, so
      // "count to 0. 2. Loop" splits at "2." and not at "0.".
      steps = [];
      let expect = 2, start = (src.match(/^1[.)]\s*/) || [''])[0].length;
      const re = /(?<=\s)(\d{1,2})[.)](?=\s)/g;
      let m;
      while ((m = re.exec(src))) {
        if (Number(m[1]) !== expect) continue;
        steps.push(src.slice(start, m.index).trim());
        start = m.index + m[0].length;
        expect++;
      }
      steps.push(src.slice(start).trim());
      steps = steps.filter(Boolean);
    }
    if (steps.length < 2) return `<p>${esc(src)}</p>`;
    return `<ol class="gg-steps">${steps.map(p => `<li>${esc(p)}</li>`).join('')}</ol>`;
  }

  function solutionHtml(slug) {
    const d = solutions[slug];
    if (!d?.solution) return '<p class="nc-none">No solution available for this one.</p>';
    return `
      <div class="gg-sol">
        ${d.insight ? `<div class="ln-cue gg-insight"><strong>Key insight.</strong> ${esc(d.insight)}</div>` : ''}
        ${d.approach ? `<h4>Approach</h4>${stepsHtml(d.approach)}` : ''}
        ${d.time || d.space ? `<h4>Complexity</h4><p class="ln-complexity">${d.time ? `Time ${esc(d.time)}` : ''}${d.time && d.space ? ' · ' : ''}${d.space ? `Space ${esc(d.space)}` : ''}</p>` : ''}
        <div class="nc-sol">
          <div class="nc-sol-head">
            <span>Solution · Python</span>
            <span class="nc-sol-btns">
              <button class="ghost nc-sol-copy">Copy</button>
              <button class="ghost nc-sol-use">To editor</button>
            </span>
          </div>
          <pre class="ln-code nc-sol-code">${esc(d.solution)}</pre>
        </div>
      </div>`;
  }

  function ncSolutionHtml(slug) {
    const d = ncSolutions[slug];
    if (!d?.solution) return '<p class="nc-none">No NeetCode solution for this one.</p>';
    return `
      <div class="nc-sol gg-ncsol">
        <div class="nc-sol-head">
          <span>Official NeetCode solution · Python</span>
          <span class="nc-sol-btns">
            <button class="ghost nc-sol-copy">Copy</button>
            <button class="ghost nc-sol-use">To editor</button>
          </span>
        </div>
        <pre class="ln-code nc-sol-code">${esc(d.solution)}</pre>
      </div>`;
  }

  function wireSolution(boxId, slug, store) {
    const box = $(boxId);
    box.querySelector('.nc-sol-copy')?.addEventListener('click', async ev => {
      const b = ev.currentTarget;
      const text = store[slug]?.solution || '';
      let ok = false;
      if (window.qfCopyText) ok = await window.qfCopyText(text);
      else { try { await navigator.clipboard.writeText(text); ok = true; } catch { /* refused */ } }
      b.textContent = ok ? 'Copied' : 'Copy failed'; setTimeout(() => { b.textContent = 'Copy'; }, 1500);
    });
    box.querySelector('.nc-sol-use')?.addEventListener('click', () => {
      const q = rows().find(x => x.slug === slug);
      // Shared with the NeetCode tab: opens this question, switches to Python, asks before replacing a draft.
      // Same queue as "Solve in editor", so ‹ › in Coding follow this list.
      const queue = q ? ggQueue() : undefined;
      if (window.qfSolutionToEditor) window.qfSolutionToEditor(slug, q?.title, store[slug]?.solution || '', queue);
      else window.openQuestion?.(slug, q?.title, { code: store[slug]?.solution || '', queue });
    });
  }

  // --------------------------------------------------------------- render ---

  let loading = null;
  async function render() {
    loading ||= load().catch(e => { loading = null; $('ggList').innerHTML = `<p class="hs-empty">${esc(e.message)} — open the tab again to retry.</p>`; });
    await loading;
    if (!data) return;
    if (!openGroups.size && patterns().length) openGroups.add(patterns()[0]);
    renderSidebar();
    if (current) open(current); else renderIntro();
  }

  window.renderGoogleTab = render;
  return { render, open };
})();
