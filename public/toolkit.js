/* Toolkit tab: how to declare and use each data structure and Python trick,
 * mined from every Pro-Learn topic and cached question solution. */
(function () {
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let data = null;
  let loading = null;
  let filter = '';
  let starOnly = false;

  function load() {
    if (data) return Promise.resolve(data);
    loading ||= fetch('/api/toolkit').then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    }).then(d => { data = d; return d; }).finally(() => { loading = null; });
    return loading;
  }

  const code = s => `<pre class="ln-code tk-code">${esc(s)}</pre>`;
  const matches = it => (!starOnly || it.priority) && (!filter || [it.name, it.group, it.when, it.define, it.use, ...(it.tricks || [])]
    .join(' ').toLowerCase().includes(filter));
  const star = it => it.priority
    ? `<span class="tk-star" title="Seen in ${it.priority} interview reports — learn this first">★ ${it.priority}</span>` : '';

  function card(it) {
    const refs = it.refs || [];
    const chip = r => r.type === 'topic'
      ? `<button class="pl-chip tk-ref" data-topic="${esc(r.slug)}" title="Open the Pro-Learn topic">${esc(r.title)}</button>`
      : `<button class="pl-chip tk-ref" data-q="${esc(r.slug)}" data-title="${esc(r.title)}" title="Open the question in Coding">${esc(r.title)}${r.difficulty ? `<span>${esc(r.difficulty[0])}</span>` : ''}</button>`;
    return `<article class="tk-card${it.priority ? ' tk-priority' : ''}" id="tk-${esc(it.id)}">
      <header class="tk-card-head">
        <h2>${esc(it.name)}</h2>
        ${star(it)}
        <span class="tk-count" title="Solutions in this app that use it">${it.topics} topics · ${it.questions} questions</span>
        ${window.Focus?.btn?.('toolkit', it.id) || ''}
      </header>
      <p class="tk-when"><b>Reach for it when</b> ${esc(it.when)}</p>
      <div class="tk-cols">
        <div style="min-width:0"><div class="tk-label">Define</div>${code(it.define)}</div>
        <div style="min-width:0"><div class="tk-label">Use</div>${code(it.use)}</div>
      </div>
      <ul class="tk-tricks">${(it.tricks || []).map(t => `<li>${esc(t)}</li>`).join('')}</ul>
      <div class="tk-cost"><b>Cost</b> ${esc(it.cost)}</div>
      ${it.examples?.length ? `<details class="tk-more"><summary>As written in our solutions (${it.examples.length})</summary>
        ${it.examples.map(e => `<div class="tk-ex"><div class="tk-label">${e.type === 'topic' ? 'Topic' : 'Question'} · ${esc(e.title)}</div>${code(e.code)}</div>`).join('')}
      </details>` : ''}
      ${refs.length ? `<details class="tk-more"><summary>Where it is used (${refs.length})</summary>
        <div class="pl-chips">${refs.map(chip).join('')}</div>
      </details>` : ''}
    </article>`;
  }

  function groups() {
    const out = new Map();
    for (const it of data.idioms) {
      if (!out.has(it.group)) out.set(it.group, []);
      out.get(it.group).push(it);
    }
    // Priority cards float to the top of their group, most-reported first.
    for (const items of out.values()) items.sort((a, b) => (b.priority || 0) - (a.priority || 0));
    return out;
  }

  const starCount = () => data.idioms.filter(it => it.priority).length;

  function renderSide() {
    const g = groups();
    $('tkList').innerHTML = `
      <div class="pl-side-head">
        <div class="pl-side-title">Interview toolkit</div>
        <div class="pl-side-sub">${data.idioms.length} patterns from ${data.scanned.topics} topics and ${data.scanned.questions} solutions</div>
        <input id="tkSearch" class="pl-search" type="search" placeholder="Search: heap, defaultdict, bisect…" value="${esc(filter)}">
        <button id="tkStarOnly" class="pl-star-filter${starOnly ? ' sel' : ''}" type="button" aria-pressed="${starOnly}"
          title="Only the patterns that came up in the interview reports">★ Priority only <span>${starCount()}</span></button>
      </div>
      <nav class="pl-tree">
        <button class="pl-art tk-jump" data-id="imports">Imports to type first</button>
        ${[...g].map(([name, items]) => {
          const shown = items.filter(matches);
          if (!shown.length) return '';
          return `<div class="pl-group-name">${esc(name)}</div>
            ${shown.map(it => `<button class="pl-art tk-jump${it.priority ? ' tk-side-star' : ''}" data-id="${esc(it.id)}">${it.priority ? '<span class="tk-side-mark">★</span>' : ''}${esc(it.name)}
              <span class="pl-chap-count">${it.priority ? it.priority : it.topics + it.questions}</span></button>`).join('')}`;
        }).join('')}
      </nav>`;
    $('tkStarOnly').onclick = () => { starOnly = !starOnly; renderSide(); renderMain(); };
    const s = $('tkSearch');
    let timer = null;
    s.oninput = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        filter = s.value.trim().toLowerCase();
        const pos = s.selectionStart;
        renderMain();
        renderSide();
        const n = $('tkSearch'); n.focus(); n.setSelectionRange(pos, pos);
      }, 120);
    };
    $('tkList').querySelectorAll('.tk-jump').forEach(b => {
      b.onclick = () => document.getElementById(`tk-${b.dataset.id}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
  }

  function renderMain() {
    const g = groups();
    const box = $('tkDetail');
    box.innerHTML = `<div class="tk-page">
      <h1>Interview toolkit</h1>
      <p class="pl-summary">Every container, template and Python trick our solutions rely on — how to declare it,
        how to use it, and the gotchas. Counts come from scanning the code of all ${data.scanned.topics} Pro-Learn topics
        (plus their alternative approaches) and ${data.scanned.questions} question solutions.
        <b class="tk-star">★ n</b> marks a pattern that showed up in <i>n</i> real interview reports — those come first in each group.</p>
      <article class="tk-card" id="tk-imports">
        <header class="tk-card-head"><h2>Imports to type first</h2></header>
        <p class="tk-when">Type these at the top so nothing stalls you mid-solution. LeetCode already imports most of them, but the interviewer's editor may not.</p>
        ${code(data.imports)}
      </article>
      ${[...g].map(([name, items]) => {
        const shown = items.filter(matches);
        return shown.length ? `<h3 class="tk-group">${esc(name)}</h3>${shown.map(card).join('')}` : '';
      }).join('') || '<p class="sol-loading">Nothing matches that search.</p>'}
    </div>`;
    box.querySelectorAll('.tk-ref[data-topic]').forEach(b => { b.onclick = () => window.openProLearn?.(b.dataset.topic); });
    box.querySelectorAll('.tk-ref[data-q]').forEach(b => { b.onclick = () => window.openQuestion?.(b.dataset.q, b.dataset.title); });
  }

  window.renderToolkit = () => {
    if (!data) $('tkDetail').innerHTML = '<p class="sol-loading">Scanning every solution…</p>';
    load().then(() => { renderSide(); renderMain(); })
      .catch(err => {
        $('tkDetail').innerHTML = `<p class="sol-loading">Could not load the toolkit (${esc(err.message === 'HTTP 429' ? 'too many requests — wait a few seconds' : err.message)}).
          <button class="ghost tk-retry" type="button">Try again</button></p>`;
        $('tkDetail').querySelector('.tk-retry').onclick = () => window.renderToolkit();
      });
  };

  /** Deep link from a handbook page straight to one card. */
  window.openToolkit = id => {
    filter = '';
    starOnly = false;                     // the card asked for may not be a priority one
    window.setInterviewMode?.('toolkit');
    load().then(() => {
      renderSide();
      renderMain();
      const card = document.getElementById(`tk-${id}`);
      if (!card) return;
      card.scrollIntoView({ block: 'start' });
      card.classList.add('tk-flash');
      setTimeout(() => card.classList.remove('tk-flash'), 1600);
    }).catch(() => {});
  };
})();
