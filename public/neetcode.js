/* NeetCode tab: the 150 and the Blind 75, grouped by pattern in neetcode.io
 * order, with the official MIT-licensed solutions — no model involved.
 *
 * Solved state is window.Learn's store (keyed by title), so ticking a problem
 * here counts everywhere else, and the two lists get separate progress bars
 * because the 75 is a subset of the 150.
 */
window.NeetCode = (function () {
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let data = null;            // {source, patterns, questions}
  let list = '150';           // '150' | '75' | 'easy' | 'medium' | 'hard' (NeetCode's YouTube playlists)
  const YT = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };
  const isYt = () => Object.hasOwn(YT, list);
  const listLabel = () => (isYt() ? `NeetCode YouTube · ${YT[list]}` : list === '75' ? 'Blind 75' : 'NeetCode 150');
  try { const l = localStorage.getItem('qf.ncList'); if (l && (l === '150' || l === '75' || l in YT)) list = l; } catch { /* default */ }
  let current = null;         // slug of the open question
  let search = '';
  let statusFilter = 'all';   // 'all' | 'todo' | 'attempted' | 'solved'
  let diffFilter = 'all';     // 'all' | 'Easy' | 'Medium' | 'Hard'
  const solutions = {};       // slug -> {solution, video}
  const openGroups = new Set();

  const solved = t => Boolean(window.Learn?.solved?.(t));
  const statusOf = t => (window.Learn?.status ? window.Learn.status(t) : (solved(t) ? 'solved' : 'todo'));
  const STATUS = [['todo', '○ To do'], ['attempted', '✱ Attempted'], ['solved', '✓ Solved']];
  const MARK = { solved: '<span class="nc-tick">✓</span> ', attempted: '<span class="nc-tick att">✱</span> ', todo: '' };

  // Progress changed in another tab (Coding, Learn): keep the list in step.
  window.addEventListener('progress-changed', () => {
    if (document.body.dataset.mode === 'neetcode' && data) renderSidebar();
  });

  async function load() {
    if (data) return data;
    const r = await fetch('/api/neetcode');
    if (!r.ok) throw new Error('NeetCode data unavailable');
    data = await r.json();
    window.QFShorts?.index?.().then(() => { if (document.body.dataset.mode === 'neetcode') renderSidebar(); });
    return data;
  }

  const rows = () => (isYt() ? (data?.yt?.[list] || []) : (data?.questions || []).filter(q => list === '150' || q.blind75));
  const findAny = slug => (data?.questions || []).find(x => x.slug === slug) || Object.values(data?.yt || {}).flat().find(x => x.slug === slug);
  const hasShort = slug => Boolean(window.QFShorts?.has?.(slug));

  // Your stars, shared with the Nov 3 plan (window.QFStars, qf-plan.js).
  const starred = slug => Boolean(window.QFStars?.has?.(slug));
  const starBtn = q => `<span class="nc-star${starred(q.slug) ? ' on' : ''}" role="button" tabindex="0" data-star="${esc(q.slug)}" aria-pressed="${starred(q.slug)}" title="${starred(q.slug) ? 'Starred — click to remove' : 'Star to revisit later'}">${starred(q.slug) ? '★' : '☆'}</span>`;
  window.addEventListener('stars-changed', () => { if (document.body.dataset.mode === 'neetcode' && data) renderSidebar(); });

  function visible(q) {
    if (statusFilter === 'starred') { if (!starred(q.slug)) return false; }
    else if (statusFilter !== 'all' && statusOf(q.title) !== statusFilter) return false;
    if (diffFilter !== 'all' && q.difficulty !== diffFilter) return false;
    if (search && !q.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }
  const filtering = () => Boolean(search) || statusFilter !== 'all' || diffFilter !== 'all';

  function pickRandom() {
    const pool = rows().filter(q => visible(q) && !solved(q.title));
    const from = pool.length ? pool : rows().filter(visible);
    if (!from.length) return;
    open(from[Math.floor(Math.random() * from.length)].slug);
  }

  // -------------------------------------------------------------- sidebar ---

  function renderSidebar() {
    const box = $('ncList');
    if (!data) { box.innerHTML = '<p class="hs-empty">Loading the NeetCode lists…</p>'; return; }
    const qs = rows();
    const done = qs.filter(q => solved(q.title)).length;
    const pct = qs.length ? Math.round((done / qs.length) * 100) : 0;
    const byDiff = d => { const a = qs.filter(q => q.difficulty === d); return `${a.filter(q => solved(q.title)).length}/${a.length}`; };

    const groups = data.patterns
      .map(p => ({ pattern: p, items: qs.filter(q => q.pattern === p && visible(q)) }))
      .filter(g => g.items.length || (!filtering() && qs.some(q => q.pattern === g.pattern)));

    box.innerHTML = `
      <div class="nc-tools">
        <div class="nc-lists" role="tablist">
          <button class="nc-list-btn${list === '150' ? ' sel' : ''}" data-list="150" role="tab">NeetCode 150</button>
          <button class="nc-list-btn${list === '75' ? ' sel' : ''}" data-list="75" role="tab">Blind 75</button>
        </div>
        <div class="nc-lists nc-yt" role="tablist" aria-label="NeetCode YouTube playlists">
          <span class="nc-yt-lbl">▶ Videos</span>
          ${Object.entries(YT).map(([k, l]) => `<button class="nc-list-btn${list === k ? ' sel' : ''}" data-list="${k}" role="tab" title="NeetCode's ${l} YouTube playlist, in video order">${l} <small>${(data.yt?.[k] || []).length}</small></button>`).join('')}
        </div>
        <div class="nc-progress">
          <div class="nc-prog-bar"><i style="width:${pct}%"></i></div>
          <span class="nc-prog-num"><strong>${done}</strong> / ${qs.length} solved</span>
        </div>
        <div class="nc-diffs" title="Solved by difficulty">
          <span class="easy">E ${byDiff('Easy')}</span><span class="medium">M ${byDiff('Medium')}</span><span class="hard">H ${byDiff('Hard')}</span>
        </div>
        <div class="nc-filter-row">
          <input id="ncSearch" type="search" placeholder="Search ${qs.length} problems" value="${esc(search)}">
          <button id="ncRandom" class="ghost icon-btn" title="Pick a random unsolved problem">&#127922;</button>
        </div>
        <div class="nc-filter-row">
          <select id="ncStatus" title="Filter by status">
            <option value="all"${statusFilter === 'all' ? ' selected' : ''}>All status</option>
            ${STATUS.map(([v, l]) => `<option value="${v}"${statusFilter === v ? ' selected' : ''}>${l}</option>`).join('')}
            <option value="starred"${statusFilter === 'starred' ? ' selected' : ''}>★ Starred (${window.QFStars?.count?.() ?? 0})</option>
          </select>
          <select id="ncDiff" title="Filter by difficulty">
            <option value="all"${diffFilter === 'all' ? ' selected' : ''}>All levels</option>
            ${['Easy', 'Medium', 'Hard'].map(d => `<option value="${d}"${diffFilter === d ? ' selected' : ''}>${d}</option>`).join('')}
          </select>
        </div>
      </div>
      ${isYt() ? `<div class="nc-groups nc-flat">${qs.filter(visible).map(q => `
            <button class="ln-item nc-q${current === q.slug ? ' sel' : ''}" data-slug="${esc(q.slug)}">
              <span class="ln-item-name">${starBtn(q)}<span class="nc-n">${q.n}</span>${MARK[statusOf(q.title)]}${esc(q.title)}</span>
              <span class="ln-item-cue">${hasShort(q.slug) ? '<span class="nc-cue nc-short" title="Has a 2-minute Short">⚡</span>' : ''}<span class="nc-cue" title="Video walkthrough">▶</span><span class="ln-diff ${esc(q.difficulty.toLowerCase())}">${esc(q.difficulty)}</span></span>
            </button>`).join('') || '<p class="nc-none">Nothing matches these filters.</p>'}</div>` : `<div class="nc-groups">${groups.map(g => {
        const all = qs.filter(q => q.pattern === g.pattern);
        const gDone = all.filter(q => solved(q.title)).length;
        const open = openGroups.has(g.pattern) || filtering();
        return `
        <div class="nc-group">
          <button class="nc-group-head" data-pattern="${esc(g.pattern)}">
            <span class="nc-caret">${open ? '▾' : '▸'}</span>
            <span class="nc-group-name">${esc(g.pattern)}</span>
            <span class="nc-group-count">${gDone}/${all.length}</span>
            <span class="nc-group-bar"><i style="width:${all.length ? (gDone / all.length) * 100 : 0}%"></i></span>
          </button>
          ${open ? `<div class="nc-group-items">${g.items.map(q => `
            <button class="ln-item nc-q${current === q.slug ? ' sel' : ''}" data-slug="${esc(q.slug)}">
              <span class="ln-item-name">${starBtn(q)}${MARK[statusOf(q.title)]}${esc(q.title)}</span>
              <span class="ln-item-cue">${q.video ? '<span class="nc-cue" title="Video walkthrough">▶</span>' : ''}<span class="ln-diff ${esc(q.difficulty.toLowerCase())}">${esc(q.difficulty)}</span><a class="nc-row-lc" href="https://leetcode.com/problems/${esc(q.slug)}/" target="_blank" rel="noopener" title="Open on leetcode.com" aria-label="Open on LeetCode">&#8599;</a></span>
            </button>`).join('') || '<p class="nc-none">Nothing matches here.</p>'}</div>` : ''}
        </div>`;
      }).join('') || '<p class="nc-none">Nothing matches these filters.</p>'}</div>`}
      <p class="nc-credit">${isYt() ? `Videos from <a href="https://www.youtube.com/@NeetCode" target="_blank" rel="noopener">NeetCode on YouTube</a> · solutions as shown in the videos<br>` : ''}Lists and solutions from <a href="https://neetcode.io/practice" target="_blank" rel="noopener">neetcode.io</a> · solutions MIT-licensed (neetcode-gh/leetcode)</p>`;

    box.querySelectorAll('.nc-list-btn').forEach(b => b.onclick = () => {
      list = b.dataset.list; try { localStorage.setItem('qf.ncList', list); } catch { /* fine */ }
      renderSidebar();
      // The open question may not be in the newly chosen list.
      if (current && !rows().some(q => q.slug === current)) { current = null; renderIntro(); }
      else if (current) open(current);      // header says "Blind 75 · n of 75" now
      else renderIntro();                   // intro heading names the list
    });
    box.querySelectorAll('.nc-group-head').forEach(b => b.onclick = () => {
      const p = b.dataset.pattern;
      if (openGroups.has(p)) openGroups.delete(p); else openGroups.add(p);
      renderSidebar();
    });
    box.querySelectorAll('.nc-q').forEach(b => b.onclick = e => {
      if (e.target.closest('.nc-row-lc')) return;     // the ↗ link opens LeetCode, not the detail
      const st = e.target.closest('.nc-star');
      if (st) { e.preventDefault(); e.stopPropagation(); window.QFStars?.toggle?.(st.dataset.star); return; }   // repaints via stars-changed
      open(b.dataset.slug);
    });
    const s = box.querySelector('#ncSearch');
    let t = null;
    s.oninput = () => { clearTimeout(t); t = setTimeout(() => {
      search = s.value.trim(); const p = s.selectionStart;
      renderSidebar(); const s2 = $('ncList').querySelector('#ncSearch'); s2.focus(); s2.setSelectionRange(p, p);
    }, 150); };
    box.querySelector('#ncStatus').onchange = e => { statusFilter = e.target.value; renderSidebar(); };
    box.querySelector('#ncDiff').onchange = e => { diffFilter = e.target.value; renderSidebar(); };
    box.querySelector('#ncRandom').onclick = pickRandom;
  }

  // --------------------------------------------------------------- detail ---

  function renderIntro() {
    $('ncDetail').innerHTML = `
      <div class="nc-intro">
        <h1>${esc(listLabel())}</h1>
        ${isYt() ? `<p><strong>${rows().length} problems</strong> from NeetCode's ${YT[list]} playlist, in video order. Each has the video, the brute force and the optimal solution from the video, and ⚡ a 2-minute animated Short.</p>` : ''}
        <p>The curated interview list, grouped by pattern in the official order. Pick a problem:
           read the statement, solve it in the coding editor against the real LeetCode judge, and
           check the official NeetCode solution when you want it — no AI involved.</p>
        <ul>
          <li><strong>✓ Solved</strong> ticks share one progress store with Learn, Home and the Coding tab.</li>
          <li><strong>Solution</strong> shows the official Python solution from NeetCode's repository, plus the video.</li>
          <li><strong>Solve in editor</strong> opens the problem in the Coding tab — Run, Submit, Debug and attempt history all work.</li>
        </ul>
      </div>`;
  }

  // ‹ › in the editor then walk this NeetCode list, in this order.
  const ncQueue = () => ({ key: `neetcode-${list}`, label: listLabel(), items: rows().map(x => ({ slug: x.slug, title: x.title, difficulty: x.difficulty })) });

  async function open(slug) {
    current = slug;
    const q = rows().find(x => x.slug === slug) || findAny(slug);
    if (q && !openGroups.has(q.pattern)) openGroups.add(q.pattern);
    renderSidebar();
    $('ncList').querySelector('.nc-q.sel')?.scrollIntoView({ block: 'nearest' });
    if (!q) return renderIntro();
    const box = $('ncDetail');
    box.innerHTML = '<p class="hs-empty">Loading…</p>';
    let full = null, missing = false;
    try {
      const r = await fetch(`/api/question/${encodeURIComponent(slug)}`);
      if (r.ok) full = await r.json(); else missing = r.status === 404;
    } catch { /* statement is optional; the actions still work */ }
    // No LeetCode statement (Premium, or LeetCode unreachable): use the playlist's own notes.
    let notes = '';
    if (!full?.content && findAny(slug)?.lc) {
      try { const d = await fetch(`/api/neetcode/solution/${encodeURIComponent(slug)}`).then(r => (r.ok ? r.json() : null)); notes = d?.statement || ''; } catch { /* optional */ }
    }
    if (current !== slug) return;     // moved on while the statement loaded
    // ~20 of the 150 (Premium ones like Meeting Rooms, plus a few others) are
    // not in the local question bank, so the Coding tab cannot open them.
    const local = !missing;
    const st = statusOf(q.title);
    const ordered = rows();
    const idx = ordered.findIndex(x => x.slug === slug);
    const prev = idx > 0 ? ordered[idx - 1] : null;
    const next = idx >= 0 && idx < ordered.length - 1 ? ordered[idx + 1] : null;
    box.innerHTML = `
      <div class="ln-head nc-head">
        <div>
          <div class="ln-fam">${esc(q.pattern)} · ${isYt() ? `${esc(listLabel())}${q.lc ? ` · LeetCode ${esc(q.lc)}` : ''}` : `NeetCode ${q.blind75 ? '150 · Blind 75' : '150'}`} · ${idx + 1} of ${ordered.length}</div>
          <h2>${full ? `${esc(full.id)}. ` : ''}${esc(q.title)}
            <span class="ln-diff ${esc(q.difficulty.toLowerCase())}">${esc(q.difficulty)}</span>
            ${full?.acRate ? `<span class="chip" title="LeetCode acceptance rate">${esc(full.acRate)}</span>` : ''}</h2>
        </div>
        <div class="gl-actions">
          <select id="ncStatusSel" class="q-status ${st}" title="Progress on this problem">
            ${STATUS.map(([v, l]) => `<option value="${v}"${st === v ? ' selected' : ''}>${l}</option>`).join('')}
          </select>
          <button id="ncPractise" class="primary"${local ? '' : ' disabled title="Not in the local question bank — solve it on LeetCode"'}>Solve in editor</button>
        </div>
      </div>
      <div class="nc-nav">
        <button class="ghost" id="ncPrev"${prev ? '' : ' disabled'} title="${prev ? esc(prev.title) : ''}">&#8249; Prev</button>
        <button class="ghost" id="ncNext"${next ? '' : ' disabled'} title="${next ? esc(next.title) : ''}">Next &#8250;</button>
        <span class="spacer"></span>
        <a class="nc-ext" href="https://leetcode.com/problems/${esc(slug)}/" target="_blank" rel="noopener" title="Open this problem on leetcode.com">LeetCode &#8599;</a>
        <a class="nc-ext" href="https://neetcode.io/problems/${esc(slug)}" target="_blank" rel="noopener" title="Open this problem on neetcode.io">NeetCode &#8599;</a>
      </div>
      ${full?.content ? `<details class="gl-statement" open><summary>Problem statement</summary>
        <div class="prose">${full.content}</div></details>` : notes ? `<details class="gl-statement" open><summary>Problem statement</summary>
        <div class="prose nc-md">${esc(notes)}</div></details>` : local
        ? '<p class="hs-empty">Statement not available right now — use the LeetCode link above.</p>'
        : '<p class="hs-empty">This problem is not in the local question bank (it is often a LeetCode Premium one), so it cannot be opened in the editor here. Read and solve it on LeetCode or NeetCode with the links above; the official solution and video are below.</p>'}
      <div class="nc-sol-wrap">
        <div class="nc-sol-actions">
          <button id="ncShowSol" class="ghost">${solutions[slug] ? 'Hide solution' : 'Show NeetCode solution'}</button>
          ${(q.videos || (q.video ? [q.video] : [])).map((v, i, all) => `<a class="nc-video" href="https://youtu.be/${esc(v)}" data-title="${esc(q.title)} · NeetCode walkthrough" target="_blank" rel="noopener">▶ Video walkthrough${all.length > 1 ? ` ${i + 1}` : ''}</a>`).join('')}
        </div>
        <div id="ncSolBox">${solutions[slug] ? solutionHtml(slug, local) : ''}</div>
      </div>`;

    $('ncStatusSel').onchange = e => {
      if (window.Learn?.setStatus) window.Learn.setStatus(q.title, e.target.value);
      else window.Learn?.setSolved?.(q.title, e.target.value === 'solved');
      e.target.className = `q-status ${e.target.value}`;
      renderSidebar();
    };
    $('ncPrev').onclick = () => prev && open(prev.slug);
    $('ncNext').onclick = () => next && open(next.slug);
    $('ncPractise').onclick = () => { if (local) window.openQuestion?.(slug, q.title, { queue: ncQueue() }); };
    $('ncShowSol').onclick = async () => {
      if (solutions[slug]) {       // toggle off
        delete solutions[slug];
        $('ncSolBox').innerHTML = '';
        $('ncShowSol').textContent = 'Show NeetCode solution';
        return;
      }
      $('ncShowSol').disabled = true;
      try {
        const d = await fetch(`/api/neetcode/solution/${encodeURIComponent(slug)}`).then(r => r.json());
        solutions[slug] = d;
        $('ncSolBox').innerHTML = solutionHtml(slug, local);
        $('ncShowSol').textContent = 'Hide solution';
        wireSolution(slug);
      } catch {
        $('ncSolBox').innerHTML = '<p class="bv-err">Could not load the solution.</p>';
      }
      $('ncShowSol').disabled = false;
    };
    if (solutions[slug]) wireSolution(slug);
  }

  function solutionHtml(slug, local = true) {
    const d = solutions[slug];
    if (!d?.solution) return '<p class="nc-none">No solution available for this one.</p>';
    const cx = o => (o && (o.time || o.space) ? ` <small class="nc-cx">${o.time ? `time ${esc(o.time)}` : ''}${o.time && o.space ? ' · ' : ''}${o.space ? `space ${esc(o.space)}` : ''}</small>` : '');
    const brute = d.brute?.code ? `
      <details class="nc-sol nc-brute">
        <summary class="nc-sol-head"><span>Brute force · Python${cx(d.brute)}</span></summary>
        ${d.brute.intuition ? `<p class="nc-intu">${esc(d.brute.intuition)}</p>` : ''}
        <pre class="ln-code nc-sol-code">${esc(d.brute.code)}</pre>
      </details>` : '';
    return `${brute}
      ${d.optimal?.intuition ? `<p class="nc-intu"><strong>Idea:</strong> ${esc(d.optimal.intuition)}</p>` : ''}
      <div class="nc-sol">
        <div class="nc-sol-head">
          <span>${d.brute || d.optimal ? 'Optimal · as in the video' : 'Official NeetCode solution'} · Python${cx(d.optimal)}</span>
          <span class="nc-sol-btns">
            <button class="ghost nc-sol-copy">Copy</button>
            ${local ? '<button class="ghost nc-sol-use">To editor</button>' : ''}
          </span>
        </div>
        <pre class="ln-code nc-sol-code">${esc(d.solution)}</pre>
      </div>`;
  }

  function wireSolution(slug) {
    const box = $('ncSolBox');
    box.querySelector('.nc-sol-copy')?.addEventListener('click', async ev => {
      const b = ev.currentTarget;
      const ok = await copyText(solutions[slug]?.solution || '');
      b.textContent = ok ? 'Copied' : 'Copy failed'; setTimeout(() => { b.textContent = 'Copy'; }, 1500);
    });
    box.querySelector('.nc-sol-use')?.addEventListener('click', () => {
      const q = findAny(slug);
      // Same queue as "Solve in editor", so ‹ › in Coding walk this list.
      toEditor(slug, q?.title, solutions[slug]?.solution || '', rows().some(x => x.slug === slug) ? ncQueue() : undefined);
    });
  }

  /** Clipboard with a fallback for browsers that refuse the async API (iOS, http). */
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch { /* fall back */ }
    try {
      const ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;';
      document.body.appendChild(ta); ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch { return false; }
  }

  /**
   * "To editor": open THAT question in the Coding tab first (so no other
   * question's draft is touched), switch the editor to Python because the
   * solution is Python (it used to land in the Java/C++ draft), and ask before
   * replacing real work the user already saved for this question.
   */
  async function toEditor(slug, title, code, queue) {
    if (!code || !window.openQuestion) return;
    try { await window.openQuestion(slug, title, queue ? { queue } : undefined); } catch (e) {
      window.QF?.toast?.(`Could not open "${title || slug}" in the editor (${e.message || 'load failed'}). Use Copy instead.`);
      return;
    }
    if (window.currentQuestion?.slug !== slug) return;      // mock running and declined
    const lang = $('langSel');
    if (lang && lang.value !== 'python3' && [...lang.options].some(o => o.value === 'python3')) {
      lang.value = 'python3';
      lang.dispatchEvent(new Event('change'));
    }
    // What the editor now shows is this question's Python draft (or its template).
    let draft = window.Editor && !window.Editor.plain ? window.Editor.value : '';
    if (!draft) { try { draft = JSON.parse(localStorage.getItem('drafts') || '{}')[`${slug}:python3:code`] || ''; } catch { /* none */ } }
    const n = s => String(s || '').replace(/\s+/g, '');
    const tpl = n((window.currentQuestion.codeSnippets || []).find(c => c.langSlug === 'python3')?.code);
    const d = n(draft);
    const isTemplate = tpl && d.startsWith(tpl) && d.length - tpl.length <= 16;
    if (d && d !== n(code) && !isTemplate &&
        !window.confirm(`Replace your saved Python code for "${title || slug}" with this solution? Your draft for this question will be lost.`)) return;
    window.loadIntoEditor?.(code);
  }
  window.qfSolutionToEditor = toEditor;
  window.qfCopyText = copyText;

  // --------------------------------------------------------------- render ---

  let loading = null;
  async function render() {
    loading ||= load().catch(e => { loading = null; $('ncList').innerHTML = `<p class="hs-empty">${esc(e.message)} — open the tab again to retry.</p>`; });
    await loading;
    if (!data) return;
    if (!openGroups.size && data.patterns.length) openGroups.add(data.patterns[0]);
    renderSidebar();
    if (current) open(current); else renderIntro();
  }

  window.renderNeetcode = render;
  return { render };
})();
