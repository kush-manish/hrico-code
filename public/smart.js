/* SMART tab: a map from question wording/tags to the Learn pattern,
 * Pro-Learn subtopics and Google questions to solve. */
(function () {
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let data = null;
  let loading = null;
  let current = null;
  let query = '';
  const PROG = 'smart.done';
  const done = new Set();
  try { JSON.parse(localStorage.getItem(PROG) || '[]').forEach(x => done.add(x)); } catch { /* clean */ }
  const save = () => { try { localStorage.setItem(PROG, JSON.stringify([...done])); } catch { /* private */ } };

  function load() {
    if (data) return Promise.resolve(data);
    loading ||= fetch('/api/smart-map').then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    }).then(d => { data = d; return d; }).finally(() => { loading = null; });
    return loading;
  }

  const hit = t => !query || String(t || '').toLowerCase().includes(query);
  const diff = d => `<span class="ln-diff ${esc(String(d || '').toLowerCase())}">${esc(d || '')}</span>`;
  const slugify = t => String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  // ------------------------------------------------- what makes it smart --
  // Every topic is scored for YOU: how much Google asks it (frequency of its
  // questions) against how much of it you have already solved. The biggest
  // gap is the best next topic.
  const SORT_KEY = 'smart.sort';
  let sortBy = 'next';
  try { sortBy = localStorage.getItem(SORT_KEY) || 'next'; } catch { /* default */ }
  const statusOf = q => (window.Learn?.status ? window.Learn.status(q.title) : 'todo');
  function stats(t) {
    let solved = 0, tried = 0, demand = 0, left = 0;
    for (const q of t.questions) {
      const st = statusOf(q), w = 1 + Math.max(0, Number(q.frequency) || 0) / 10;
      demand += w;
      if (st === 'solved') solved++; else { if (st === 'attempted') tried++; left += w; }
    }
    // Mastery saturates: ~8 solved in a tag is "you have it" for interviews.
    const mastery = Math.min(1, solved / Math.min(8, Math.max(1, t.questions.length)));
    const next = t.questions.find(q => statusOf(q) !== 'solved');
    // Broad tags (Array, String…) are not patterns you can study: rank the
    // real techniques ahead of them.
    const broad = /^(array|string|math|sorting|matrix|simulation|counting|enumeration|brainteaser|database|interactive|iterator|geometry|number theory)$/i.test(t.name) ? 0.3 : 1;
    // A topic the user marked as known counts as strong and drops out of the plan.
    const known = done.has(t.id);
    return { solved, tried, total: t.questions.length, demand, mastery, next, known, score: known ? 0 : left * (1 - mastery) * (t.count >= 5 ? 1 : 0.5) * broad };
  }
  const level = st => (st.known || st.mastery >= 0.7 ? 'strong' : st.solved || st.tried ? 'learning' : 'new');
  function sortedTopics(list) {
    const withS = list.map(t => ({ t, st: stats(t) }));
    const by = {
      next: (a, b) => b.st.score - a.st.score,
      asked: (a, b) => b.t.count - a.t.count,
      weak: (a, b) => a.st.mastery - b.st.mastery || b.t.count - a.t.count,
      az: (a, b) => a.t.name.localeCompare(b.t.name),
    }[sortBy] || ((a, b) => b.st.score - a.st.score);
    return withS.sort(by);
  }
  const bar = st => `<span class="sm-bar ${level(st)}" title="${st.solved} of ${st.total} solved${st.known ? ' · marked as known' : ''}"><i style="width:${st.known ? 100 : Math.round(100 * st.mastery)}%"></i></span>`;
  // Big tags have hundreds of questions; draw a capped grid, count them all.
  const CHIP_CAP = 200;
  const chipGrid = (qs, stOf) => qs.slice(0, CHIP_CAP).map(q => probChip(q, stOf(q))).join('')
    + (qs.length > CHIP_CAP ? `<p class="gl-muted">Showing the first ${CHIP_CAP} of ${qs.length}.</p>` : '');

  // Paste a problem: the wording that gives the pattern away.
  const SIGNALS = [
    [/\b(contiguous|subarray|substring)\b[\s\S]*\b(longest|shortest|at most|at least|maximum|minimum|k distinct|window|without repeating)\b|\bsliding window\b/i, 'Sliding Window', 'a contiguous range with a best length → grow and shrink a window'],
    [/\bsorted\b[\s\S]*\b(pair|two (numbers|elements)|target|triplet|sum)\b|\b(palindrome|reverse)\b[\s\S]*\bin[- ]place\b|\bcontainer\b/i, 'Two Pointers', 'sorted input + a pair/target → move two pointers inward'],
    [/\b(minimi[sz]e the maximum|maximi[sz]e the minimum|minimum (speed|capacity|time|days|eating)|kth smallest|search in (a )?rotated|log ?n|sorted array)\b/i, 'Binary Search', 'a sorted space or a "smallest value that works" → binary search (on the answer)'],
    [/\b(next (greater|smaller|warmer)|daily temperatures|valid parenthes|brackets?|evaluate|reverse polish|histogram|stock span|decode string)\b/i, 'Stack', 'the most recent unresolved item settles first → (monotonic) stack'],
    [/\b(top k|k (most|least) frequent|kth largest|k closest|k smallest|median|merge k|scheduler)\b/i, 'Heap / Priority Queue', '"k best" or a running median → heap'],
    [/\b(all (possible )?(combinations|permutations|subsets|partitions)|generate all|n-queens|word search|letter combinations)\b/i, 'Backtracking', 'list every valid arrangement → backtracking with pruning'],
    [/\b(prerequisites?|course schedule|order of (tasks|courses)|dependenc(y|ies)|alien dictionary)\b/i, 'Advanced Graphs', 'dependencies between items → topological sort'],
    [/\b(network delay|cheapest|weighted|minimum cost path|shortest path with)\b/i, 'Advanced Graphs', 'weighted shortest path → Dijkstra'],
    [/\b(islands?|grid|connected|provinces|rotting|flood fill|surrounded regions|number of components)\b/i, 'Graphs', 'cells or nodes linked together → BFS / DFS'],
    [/\b(number of (distinct )?ways|how many ways|minimum (number of )?(coins|steps|operations|cost)|climb|house robber|longest (common|increasing)|edit distance|can you reach)\b/i, '1-D Dynamic Programming', 'overlapping choices and a best/count answer → dynamic programming'],
    [/\b(intervals?|meeting rooms?|overlap|merge (the )?ranges|non-overlapping)\b/i, 'Intervals', 'ranges on a line → sort by start, then merge or count'],
    [/\b(anagram|frequency|duplicate|seen before|group|count of each|two sum|unique)\b/i, 'Arrays & Hashing', '"have I seen this?" or counts → hash map / set'],
    [/\b(linked list|cycle|middle of the list|reorder list)\b/i, 'Linked List', 'list pointers → fast/slow pointers or reversal'],
    [/\b(prefix(es)?|starts with|word dictionary|autocomplete|search word)\b/i, 'Tries', 'many words sharing prefixes → trie'],
    [/\b(binary tree|bst|root|ancestor|depth|leaf|subtree)\b/i, 'Trees', 'a tree → DFS (recursion) or BFS by level'],
    [/\b(redundant connection|accounts merge|union|disjoint)\b/i, 'Graphs', 'merging groups → union-find'],
    [/\b(xor|bits?|single number|power of two|hamming)\b/i, 'Bit Manipulation', 'bit tricks → XOR / masks'],
    [/\b(range sum|subarray sum equals|sum equals k|pivot index)\b/i, 'Arrays & Hashing', 'sums over ranges → prefix sums (+ hash map)'],
    [/\b(jump|gas station|maximum subarray|partition labels)\b/i, 'Greedy', 'a locally best choice is safe → greedy'],
  ];
  function detect(text) {
    const out = [];
    for (const [re, pat, why] of SIGNALS) {
      const m = re.exec(text);
      if (m && !out.some(o => o.pat === pat)) out.push({ pat, why, word: m[0].slice(0, 40) });
    }
    return out.slice(0, 3);
  }
  const topicFor = pat => {
    const key = { 'Sliding Window': 'sliding window', 'Two Pointers': 'two pointers', 'Binary Search': 'binary search', Stack: 'stack', 'Heap / Priority Queue': 'heap', Backtracking: 'backtracking', 'Advanced Graphs': 'graph', Graphs: 'breadth-first', '1-D Dynamic Programming': 'dynamic programming', Intervals: 'sorting', 'Arrays & Hashing': 'hash table', 'Linked List': 'linked list', Tries: 'trie', Trees: 'tree', 'Bit Manipulation': 'bit manipulation', Greedy: 'greedy' }[pat] || pat.toLowerCase();
    return (data?.topics || []).find(t => t.name.toLowerCase().includes(key));
  };

  function renderSide() {
    const topics = sortedTopics((data?.topics || []).filter(t => hit(`${t.name} ${t.questions.map(q => q.title).join(' ')}`)));
    const all = (data?.topics || []).map(stats);
    const strongN = all.filter(st => level(st) === 'strong').length;
    $('smList').innerHTML = `
      <div class="pl-side-head">
        <div class="pl-side-title">SMART map</div>
        <div class="pl-side-sub">${strongN} of ${data?.topics?.length || 0} topics strong · ${data?.questionCount || 0} Google questions</div>
        <input id="smSearch" class="pl-search" type="search" placeholder="Search topic or question…" value="${esc(query)}">
        <label class="sm-sort">Order
          <select id="smSort">
            <option value="next"${sortBy === 'next' ? ' selected' : ''}>Best for you next</option>
            <option value="asked"${sortBy === 'asked' ? ' selected' : ''}>Most asked at Google</option>
            <option value="weak"${sortBy === 'weak' ? ' selected' : ''}>Weakest first</option>
            <option value="az"${sortBy === 'az' ? ' selected' : ''}>A–Z</option>
          </select></label>
      </div>
      <nav class="pl-tree">
        <div class="pl-group-name">${sortBy === 'next' ? 'Your priority order' : 'LeetCode / Google tags'}</div>
        ${topics.map(({ t, st }) => `<button class="pl-art sm-row${current === t.id ? ' sel' : ''}${done.has(t.id) ? ' read' : ''}" data-id="${esc(t.id)}" title="${st.solved} of ${st.total} solved · asked ${t.count}×">
          <span class="pl-art-dot"></span><span class="sm-row-n">${esc(t.name)}</span>${bar(st)}<span class="sm-count">${st.solved}/${t.count}</span>
        </button>`).join('') || '<p class="hs-empty">Nothing matches.</p>'}
      </nav>`;
    $('smList').querySelectorAll('.pl-art').forEach(b => { b.onclick = () => open(b.dataset.id); });
    $('smSort').onchange = e => { sortBy = e.target.value; try { localStorage.setItem(SORT_KEY, sortBy); } catch { /* fine */ } renderSide(); };
    const s = $('smSearch');
    let timer = null;
    s.oninput = () => {
      clearTimeout(timer);
      // renderSide replaces the input, so put the caret back where it was;
      // otherwise focus is lost after the first letter typed.
      timer = setTimeout(() => {
        query = s.value.trim().toLowerCase();
        const pos = s.selectionStart;
        renderSide();
        const n = $('smSearch'); n.focus(); n.setSelectionRange(pos, pos);
      }, 120);
    };
  }

  const learnCard = p => `<article class="sm-card">
    <h3>${esc(p.name)} <span>${esc(p.family)}</span></h3>
    <p>${esc(p.cue || '')}</p>
    <div class="sm-actions"><button class="pl-open sm-learn" data-id="${esc(p.id)}">Open Learn pattern</button></div>
    ${p.problems?.length ? `<div class="sm-mini"><b>Pattern practice</b>${p.problems.map(x => probChip(x)).join('')}</div>` : ''}
  </article>`;

  const probChip = (p, st) => p.available
    ? `<button class="pl-open sm-q${st ? ` st-${st}` : ''}" data-slug="${esc(p.slug)}" data-title="${esc(p.title)}">${st === 'solved' ? '✓ ' : st === 'attempted' ? '✱ ' : ''}${esc(p.title)}${diff(p.difficulty)}</button>`
    : `<a class="pl-open ext" href="https://leetcode.com/problems/${esc(slugify(p.title))}/" target="_blank" rel="noopener">${esc(p.title)} ↗</a>`;

  const proTree = topic => topic.tree.map(c => `<details class="sm-tree-chap" open>
    <summary>${esc(c.chapter)}</summary>
    ${c.groups.map(g => `<div class="sm-tree-group"><b>${esc(g.group)}</b>
      ${g.articles.map(a => `<button class="pl-art sm-pro" data-slug="${esc(a.slug)}"><span class="pl-art-dot"></span><span>${esc(a.title)}</span></button>`).join('')}
    </div>`).join('')}
  </details>`).join('');

  function solveQueue(t, from) {
    const items = t.questions.filter(q => statusOf(q) !== 'solved').map(q => ({ slug: q.slug, title: q.title, difficulty: q.difficulty }));
    const q = from || items[0];
    if (!q) return;
    window.openQuestion?.(q.slug, q.title, { queue: { key: `smart-${t.id}`, label: `SMART · ${t.name}`, items } });
  }
  function welcome() {
    const ranked = sortedTopics(data.topics.slice()).filter(x => x.st.next);
    const plan = [...ranked].sort((a, b) => b.st.score - a.st.score).slice(0, 3);
    const strong = data.topics.map(t => ({ t, st: stats(t) })).filter(x => level(x.st) === 'strong').slice(0, 8);
    const weighted = data.topics.map(t => ({ t, st: stats(t) }));
    const cov = Math.round(100 * weighted.reduce((a, x) => a + x.st.mastery * x.t.count, 0) / Math.max(1, weighted.reduce((a, x) => a + x.t.count, 0)));
    $('smDetail').innerHTML = `<article class="rq-page sm-page">
      <h1>Your SMART plan</h1>
      <p class="pl-summary">Ranked for you: how often Google asks each topic, against what you have already solved. You cover <b>${cov}%</b> of what Google asks, weighted by how often it asks it.</p>
      <div class="sm-cov"><i style="width:${cov}%"></i></div>

      <h2>Do these next</h2>
      <div class="sm-plan">${plan.map(({ t, st }, i) => `<section class="sm-pcard">
        <div class="sm-pnum">${i + 1}</div>
        <div class="sm-pbody">
          <h3>${esc(t.name)}</h3>
          <p class="gl-muted">Asked in <b>${t.count}</b> Google questions · you have solved <b>${st.solved}</b>${st.tried ? `, tried ${st.tried}` : ''}.</p>
          ${t.learn[0] ? `<p class="sm-why">Use: <b>${esc(t.learn[0].name)}</b> — ${esc(t.learn[0].cue || '')}</p>` : ''}
          <div class="sm-actions">
            <button class="primary sm-solve" data-id="${esc(t.id)}">Solve next: ${esc(st.next.title)} →</button>
            <button class="ghost sm-short" data-pat="${esc(t.learn[0]?.name || t.name)}">▶ Watch the Short</button>
            <button class="ghost sm-open" data-id="${esc(t.id)}">Open topic</button>
          </div>
        </div></section>`).join('') || '<p class="gl-muted">You have solved something in every topic. Pick any from the left.</p>'}</div>

      <h2>Which pattern is this?</h2>
      <p class="gl-muted">Paste a problem statement (or just its key sentence). SMART points at the words that give the pattern away.</p>
      <textarea id="smDetect" class="sm-detect" rows="4" placeholder="e.g. Given an array of temperatures, return how many days you have to wait until a warmer temperature…"></textarea>
      <div id="smDetectOut" class="sm-detect-out" aria-live="polite"></div>

      ${strong.length ? `<h2>Already strong</h2><div class="pl-chips">${strong.map(({ t, st }) => `<button class="pl-chip sm-open" data-id="${esc(t.id)}">✓ ${esc(t.name)} <span>${st.solved}</span></button>`).join('')}</div>` : ''}
    </article>`;
    const box = $('smDetail');
    box.querySelectorAll('.sm-open').forEach(b => { b.onclick = () => open(b.dataset.id); });
    box.querySelectorAll('.sm-solve').forEach(b => { b.onclick = () => solveQueue(data.topics.find(t => t.id === b.dataset.id)); });
    wireShorts(box);
    const ta = $('smDetect'), out = $('smDetectOut');
    let tm = 0;
    ta.oninput = () => {
      clearTimeout(tm);
      tm = setTimeout(() => {
        const text = ta.value.trim();
        if (text.length < 12) { out.innerHTML = ''; return; }
        const hits = detect(text);
        out.innerHTML = hits.length ? hits.map(h => {
          const t = topicFor(h.pat);
          return `<div class="sm-hit"><b>${esc(h.pat)}</b><span>“${esc(h.word)}” — ${esc(h.why)}</span>
            <span class="sm-actions">${t ? `<button class="ghost sm-open" data-id="${esc(t.id)}">Open ${esc(t.name)}</button>` : ''}<button class="ghost sm-short" data-pat="${esc(h.pat)}">▶ Short</button></span></div>`;
        }).join('') : '<p class="gl-muted">No strong signal yet — add the sentence that says what to return (e.g. "longest", "number of ways", "k most").</p>';
        out.querySelectorAll('.sm-open').forEach(b => { b.onclick = () => open(b.dataset.id); });
        wireShorts(out);
      }, 250);
    };
  }
  /** "▶ Short" opens the pattern Short whose pattern name best matches. */
  function wireShorts(box) {
    box.querySelectorAll('.sm-short').forEach(b => {
      b.onclick = async () => {
        const all = (await window.QFShorts?.index?.().catch(() => [])) || [];
        const want = b.dataset.pat.toLowerCase();
        const words = want.split(/[^a-z0-9]+/).filter(w => w.length > 2);
        const pats = all.filter(x => x.kind === 'pattern');
        const best = pats.find(x => (x.pattern || '').toLowerCase() === want || (x.name || '').toLowerCase() === want)
          || pats.find(x => words.some(w => `${x.pattern} ${x.name || ''} ${x.title}`.toLowerCase().includes(w)));
        if (best) window.QFShorts.open(best.slug); else window.QFShorts?.picker?.();
      };
    });
  }

  function paint(topic) {
    const st = stats(topic);
    $('smDetail').innerHTML = `<article class="rq-page sm-page">
      <div class="rq-meta"><span class="rq-tag">SMART</span>
        <button class="rq-done-btn ghost${done.has(topic.id) ? ' sel' : ''}" type="button">${done.has(topic.id) ? '✓ I know this topic' : 'Mark as known'}</button>
      </div>
      <h1>${esc(topic.name)}</h1>
      <p class="pl-summary">${topic.count} Google questions mention this tag. You have solved <b>${st.solved}</b>${st.tried ? ` and tried ${st.tried}` : ''}. ${level(st) === 'strong' ? 'This one is strong — keep it warm with one a week.' : st.next ? `Next up: <b>${esc(st.next.title)}</b>.` : ''}</p>
      <div class="sm-cov ${level(st)}"><i style="width:${Math.round(100 * st.mastery)}%"></i></div>
      ${st.next ? `<div class="sm-actions"><button class="primary sm-solve-all">Solve the unsolved ones in order →</button><button class="ghost sm-short" data-pat="${esc(topic.learn[0]?.name || topic.name)}">▶ Watch the Short</button></div>` : ''}

      <section class="sm-panel"><h2>What to use</h2>
        <div class="sm-cards">${topic.learn.map(learnCard).join('') || '<p class="gl-muted">No Learn pattern matched yet.</p>'}</div>
      </section>

      <section class="sm-panel"><h2>Pro-Learn subtopics</h2>
        <p class="gl-muted">This is the study tree for the topic. Click any page to open Pro-Learn.</p>
        <div class="sm-tree">${proTree(topic) || '<p class="gl-muted">No Pro-Learn page matched yet.</p>'}</div>
      </section>

      <section class="sm-panel"><h2>Next up <span class="gl-muted">· most asked first</span></h2>
        <div class="sm-qgrid">${chipGrid(topic.questions.filter(q => statusOf(q) !== 'solved'), statusOf) || '<p class="gl-muted">All solved. 🎉</p>'}</div>
      </section>
      ${st.solved ? `<details class="sm-panel"><summary><h2 style="display:inline">Solved (${st.solved})</h2></summary>
        <div class="sm-qgrid">${chipGrid(topic.questions.filter(q => statusOf(q) === 'solved'), () => 'solved')}</div></details>` : ''}
    </article>`;
    const box = $('smDetail');
    box.querySelector('.rq-done-btn').onclick = () => {
      if (done.has(topic.id)) done.delete(topic.id); else done.add(topic.id);
      save(); paint(topic); renderSide();
    };
    wire(box);
    box.querySelector('.sm-solve-all')?.addEventListener('click', () => solveQueue(topic));
    // Only the topic's own grids queue the topic; Learn-card chips stay plain opens.
    box.querySelectorAll('.sm-qgrid .sm-q').forEach(b => { b.onclick = () => solveQueue(topic, { slug: b.dataset.slug, title: b.dataset.title }); });
    wireShorts(box);
  }

  function wire(box) {
    box.querySelectorAll('.sm-learn').forEach(b => { b.onclick = () => { window.setInterviewMode?.('learn'); window.Learn?.openPattern?.(b.dataset.id); }; });
    box.querySelectorAll('.sm-pro').forEach(b => { b.onclick = () => window.openProLearn?.(b.dataset.slug); });
    box.querySelectorAll('.sm-q').forEach(b => { b.onclick = () => window.openQuestion?.(b.dataset.slug, b.dataset.title); });
  }

  function open(id) {
    current = id;
    renderSide();
    const topic = data.topics.find(t => t.id === id);
    if (topic) paint(topic); else welcome();
    $('smDetail').scrollTop = 0;
  }

  window.addEventListener('progress-changed', () => { if (data && document.body.dataset.mode === 'smart') { renderSide(); current ? open(current) : welcome(); } });
  window.renderSmart = () => {
    if (!data) $('smDetail').innerHTML = '<p class="sol-loading">Building the SMART map…</p>';
    load().then(() => { renderSide(); current ? open(current) : welcome(); })
      .catch(e => {
        $('smDetail').innerHTML = `<p class="sol-loading">Could not load SMART (${esc(e.message === 'HTTP 429' ? 'too many requests — wait a few seconds' : e.message)}).
          <button class="ghost sm-retry" type="button">Try again</button></p>`;
        $('smDetail').querySelector('.sm-retry').onclick = () => window.renderSmart();
      });
  };
  window.openSmart = id => { window.setInterviewMode?.('smart'); load().then(() => open(id)).catch(() => {}); };
})();
