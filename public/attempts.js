/* Code-attempt history: every Run and Submit, per question and language.
 * Client-side like window.History — each entry keeps the verdict, the judge
 * detail and the submitted code so it can be dropped back into the editor.
 */
window.Attempts = (function () {
  const KEY = 'codeAttempts';
  const MAX_ENTRIES = 400;
  const MAX_CODE = 24_000;

  function read() {
    try {
      const list = JSON.parse(localStorage.getItem(KEY) || '[]');
      return Array.isArray(list) ? list : [];
    } catch { return []; }
  }

  function write(list) {
    try { localStorage.setItem(KEY, JSON.stringify(list)); }
    catch { /* quota: drop the oldest quarter and retry once */
      try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, Math.floor(list.length * 0.75)))); }
      catch { /* give up silently; losing one attempt is not worth breaking the judge flow */ }
    }
  }

  /** Record one judge attempt. `entry` carries slug, title, lang, mode
   *  ('run'|'submit'), ok, verdict, result and code. */
  function save(entry) {
    const list = read();
    const row = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      at: Date.now(),
      ...entry,
    };
    if (typeof row.code === 'string') row.code = row.code.slice(0, MAX_CODE);
    list.unshift(row);
    write(list.slice(0, MAX_ENTRIES));
    return row.id;
  }

  const all = () => read();
  const forQuestion = slug => read().filter(r => r.slug === slug);
  const get = id => read().find(r => r.id === id) || null;

  function remove(id) { write(read().filter(r => r.id !== id)); }

  function setStatus(id, status) {
    const rows = read();
    const row = rows.find(r => r.id === id);
    if (!row) return;
    row.solved = status;          // 'solved' | 'attempted' | 'todo'
    write(rows);
  }

  return { save, all, forQuestion, get, remove, setStatus };
})();

/* Console "History" tab: last attempts for the open question, filterable by
 * status like the NeetCode list, each with a Load button that puts that code
 * back in the editor. */
(function () {
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const LIMIT = 5;
  let expanded = false;
  let filter = 'all';             // 'all' | 'submit' | 'run' | 'accepted' | 'wrong'
  let slug = null;

  const FILTERS = [
    ['all', 'All'], ['submit', 'Submits'], ['run', 'Runs'],
    ['accepted', 'Accepted'], ['wrong', 'Wrong'],
  ];

  function when(ts) {
    const d = new Date(ts);
    const days = Math.floor((Date.now() - ts) / 86400000);
    const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (days === 0) return `Today ${time}`;
    if (days === 1) return `Yesterday ${time}`;
    if (days < 7) return `${days} days ago`;
    return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
  }

  const matches = r =>
    filter === 'all' ? true :
    filter === 'run' || filter === 'submit' ? r.mode === filter :
    filter === 'accepted' ? r.ok :
    !r.ok;

  function render() {
    const box = $('attList');
    if (!box) return;
    if (!slug) { box.innerHTML = '<p class="hs-empty">Open a question to see its attempts.</p>'; return; }
    const rows = window.Attempts.forQuestion(slug).filter(matches);
    const shown = expanded ? rows : rows.slice(0, LIMIT);
    box.innerHTML = `
      <div class="att-tools">
        <select id="attFilter" title="Filter attempts">
          ${FILTERS.map(([v, l]) => `<option value="${v}"${filter === v ? ' selected' : ''}>${l}</option>`).join('')}
        </select>
        <span class="att-count">${rows.length} attempt${rows.length === 1 ? '' : 's'} for this question</span>
      </div>
      ${rows.length ? shown.map(rowHtml).join('') : '<p class="hs-empty">No attempts match this filter yet.</p>'}
      ${rows.length > LIMIT ? `<button id="attMore" class="ghost att-more">${expanded ? 'Show less' : `Show all ${rows.length}`}</button>` : ''}`;

    box.querySelector('#attFilter').onchange = e => { filter = e.target.value; render(); };
    box.querySelector('#attMore')?.addEventListener('click', () => { expanded = !expanded; render(); });
    box.querySelectorAll('.att-load').forEach(b => b.onclick = () => {
      const r = window.Attempts.get(b.dataset.id);
      if (r?.code) window.loadIntoEditor?.(r.code, { lang: r.lang });
    });
    box.querySelectorAll('.att-run').forEach(b => b.onclick = () => {
      const r = window.Attempts.get(b.dataset.id);
      if (r?.code) window.loadIntoEditor?.(r.code, { run: true, lang: r.lang });
    });
    box.querySelectorAll('.att-del').forEach(b => b.onclick = () => {
      window.Attempts.remove(b.dataset.id);
      render();
    });
  }

  function rowHtml(r) {
    const verdictCls = r.ok ? 'ok' : 'bad';
    const bits = [
      r.result?.runtime,
      Number.isFinite(r.result?.passed) && Number.isFinite(r.result?.total)
        ? `${r.result.passed}/${r.result.total} cases` : null,
      r.lang,
    ].filter(Boolean).join(' · ');
    return `
      <div class="att-row">
        <button class="att-head" data-id="${r.id}" title="${esc(r.verdict || '')}">
          <span class="att-mode ${r.mode}">${r.mode === 'submit' ? 'Submit' : 'Run'}</span>
          <span class="att-verdict ${verdictCls}">${esc(r.verdict || 'Unknown')}</span>
          <span class="att-meta">${esc(when(r.at))}${bits ? ` · ${esc(bits)}` : ''}</span>
        </button>
        <button class="ghost att-load" data-id="${r.id}" title="Put this code back in the editor">Load</button>
        <button class="ghost att-run" data-id="${r.id}" title="Load and run">Run</button>
        <button class="ghost att-del" data-id="${r.id}" title="Delete this attempt">×</button>
      </div>`;
  }

  window.AttemptsUI = {
    /** Called by app.js whenever a question opens. */
    setQuestion(s) { slug = s; expanded = false; render(); },
    /** Called after every judge response so a new row appears immediately. */
    refresh: render,
  };
})();
