/* LeetCode-style test cases: "Case 1 / Case 2 / +" pills with one field per
 * parameter, instead of a raw textarea of one JSON value per line.
 *
 * The raw textarea (#testInput) stays the source of truth — Run and Debug
 * read it — so this module only renders a friendlier view over it and writes
 * back on every edit. A "Raw" toggle shows the textarea for anyone who
 * prefers to paste. */
window.TestCases = (function () {
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const MAX_CASES = 8;
  let params = [];          // [{name, type}] from the question's metaData
  let cases = [];           // [[value, value, ...]] one string per param
  let sel = 0;
  let raw = false;
  let host = null;

  // Design questions (RangeModule, LRUCache) take two lines per case: the
  // operations to call and the argument list for each. Their metaData also
  // carries a params array, but it describes LeetCode's harness, not the
  // input, so it must not be used for the labels.
  const DESIGN_PARAMS = [
    { name: 'operations', type: 'string[] · constructor, then method calls', design: true },
    { name: 'arguments', type: 'one list per operation', design: true },
  ];

  function meta(q) {
    let m = q?.metaData || {};
    if (typeof m === 'string') { try { m = JSON.parse(m); } catch { m = {}; } }
    if (m.classname || m.systemdesign) return DESIGN_PARAMS;
    return Array.isArray(m.params) && m.params.length ? m.params : [];
  }

  function parse(text) {
    const lines = String(text || '').split('\n').filter((l, i, a) => l.trim() !== '' || i < a.length - 1);
    const n = params.length;
    if (!n) return [];
    const out = [];
    for (let i = 0; i + n <= lines.length; i += n) out.push(lines.slice(i, i + n));
    return out;
  }

  function serialise() {
    return cases.map(c => c.join('\n')).join('\n');
  }

  function writeBack() {
    const ta = $('testInput');
    if (!ta) return;
    ta.value = serialise();
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function render() {
    if (!host) return;
    const ta = $('testInput');
    if (!params.length || raw) {
      host.classList.add('hidden');
      ta.classList.remove('hidden');
      ensureRawToggle(true);
      return;
    }
    ta.classList.add('hidden');
    host.classList.remove('hidden');
    ensureRawToggle(false);
    if (!cases.length) cases = [params.map(() => '')];
    sel = Math.min(sel, cases.length - 1);
    host.innerHTML = `
      <div class="tc-pills">
        ${cases.map((_, i) => `<button type="button" class="tc-pill${i === sel ? ' sel' : ''}" data-i="${i}">Case ${i + 1}${
          cases.length > 1 ? `<span class="tc-x" data-del="${i}" title="Remove this case">&times;</span>` : ''}</button>`).join('')}
        ${cases.length < MAX_CASES ? '<button type="button" class="tc-pill tc-add" title="Add a case (copies the current one)">+</button>' : ''}
        <span class="spacer"></span>
        <button type="button" class="ghost tc-raw" title="Edit the raw judge input">Raw</button>
        <button type="button" class="ghost tc-reset" title="Back to the sample cases">Reset</button>
      </div>
      <div class="tc-fields">
        ${params.map((p, j) => `
          <label class="tc-field">
            <span>${esc(p.name)} <em>${esc(p.type || '')}</em></span>
            <textarea rows="1" data-j="${j}" spellcheck="false" wrap="off">${esc(cases[sel][j] ?? '')}</textarea>
          </label>`).join('')}
      </div>`;
    host.querySelectorAll('.tc-pill[data-i]').forEach(b => b.onclick = e => {
      const del = e.target.closest('[data-del]');
      if (del) {
        const d = Number(del.dataset.del);
        cases.splice(d, 1);
        if (d < sel || sel >= cases.length) sel = Math.max(0, sel - 1);   // keep the same case selected
        writeBack(); render(); return;
      }
      sel = Number(b.dataset.i); render();
    });
    host.querySelector('.tc-add')?.addEventListener('click', () => {
      cases.push([...cases[sel]]); sel = cases.length - 1; writeBack(); render();
      host.querySelector('textarea')?.focus();
    });
    host.querySelector('.tc-raw').onclick = () => { raw = true; render(); };
    host.querySelector('.tc-reset').onclick = () => {
      const q = window.currentQuestion;
      $('testInput').value = q?.exampleTestcases || q?.sampleTestCase || '';
      cases = parse($('testInput').value); sel = 0; writeBack(); render();
    };
    host.querySelectorAll('textarea').forEach(t => {
      autosize(t);
      t.addEventListener('input', () => { cases[sel][Number(t.dataset.j)] = t.value; autosize(t); writeBack(); });
    });
  }

  function autosize(t) {
    t.style.height = 'auto';
    // scrollHeight is 0 while the pane is hidden; keep at least one line.
    t.style.height = `${Math.min(120, Math.max(30, t.scrollHeight))}px`;
  }
  function autosizeAll() { host?.querySelectorAll('textarea').forEach(autosize); }

  /** Small "Cases" link shown on the raw textarea so the user can get back. */
  function ensureRawToggle(show) {
    let b = $('tcBack');
    if (!b) {
      b = document.createElement('button');
      b.id = 'tcBack'; b.type = 'button'; b.className = 'ghost tc-back';
      b.textContent = 'Cases view';
      b.title = 'Back to one field per parameter';
      b.onclick = () => { cases = parse($('testInput').value); if (cases.length) writeBack(); raw = false; render(); };   // writeBack drops dangling raw lines
      $('tab-input').appendChild(b);
    }
    b.classList.toggle('hidden', !show || !params.length);
  }

  function setQuestion(q) {
    params = meta(q);
    raw = false;
    sel = 0;
    cases = parse($('testInput').value);
    render();
  }

  function init() {
    const pane = $('tab-input');
    if (!pane || host) return;
    host = document.createElement('div');
    host.id = 'tcHost';
    host.className = 'tc-host hidden';
    pane.prepend(host);
    // Typing in the raw box keeps the structured view in step.
    $('testInput').addEventListener('input', e => { if (raw || !e.isTrusted) return; cases = parse(e.target.value); });
    // Re-measure when the pane becomes visible again (tab switch, debugger closing).
    new MutationObserver(() => { if (!pane.classList.contains('hidden') && pane.classList.contains('active')) autosizeAll(); })
      .observe(pane, { attributes: true, attributeFilter: ['class'] });
    if (window.currentQuestion) setQuestion(window.currentQuestion);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

  return {
    setQuestion,
    /** Cases as [{name, value}] rows, for the result view. */
    cases: () => cases.map(c => params.map((p, j) => ({ name: p.name, value: c[j] ?? '' }))),
  };
})();
