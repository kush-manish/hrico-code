/* Suggest fixes: after a failed run, the model returns YOUR code corrected as
 * little as possible; this diffs it against what is in the editor and shows
 * each change GitHub-style (red removed, green added, a little context).
 * Accept or reject each change — one line, several lines or a whole method —
 * then apply only the accepted ones to the editor, optionally running it.
 */
(function () {
  'use strict';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const CONTEXT = 2;                               // unchanged lines shown around each change

  /** Line diff (LCS). Returns ops: { t: 'eq' | 'del' | 'add', a: old index, b: new index, s: text }. */
  function diff(oldText, newText) {
    const A = oldText.split('\n'), B = newText.split('\n');
    const n = A.length, m = B.length;
    const L = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    const ops = [];
    let i = 0, j = 0;
    while (i < n && j < m) {
      if (A[i] === B[j]) { ops.push({ t: 'eq', a: i, b: j, s: A[i] }); i++; j++; }
      else if (L[i + 1][j] >= L[i][j + 1]) { ops.push({ t: 'del', a: i, b: j, s: A[i] }); i++; }
      else { ops.push({ t: 'add', a: i, b: j, s: B[j] }); j++; }
    }
    while (i < n) { ops.push({ t: 'del', a: i, b: j, s: A[i] }); i++; }
    while (j < m) { ops.push({ t: 'add', a: i, b: j, s: B[j] }); j++; }
    return ops;
  }

  /** Consecutive changed lines form one change (a hunk) that is accepted or rejected as a unit. */
  function hunks(ops) {
    const out = [];
    for (let k = 0; k < ops.length; k++) {
      if (ops[k].t === 'eq') continue;
      const h = { from: k, to: k, dels: [], adds: [] };
      while (k < ops.length && ops[k].t !== 'eq') { (ops[k].t === 'del' ? h.dels : h.adds).push(ops[k]); h.to = k; k++; }
      out.push(h);
    }
    return out;
  }

  /** The editor code with only the accepted changes applied. */
  function apply(ops, hs, accepted) {
    const lines = [];
    let k = 0;
    for (const [n, h] of hs.entries()) {
      for (; k < h.from; k++) lines.push(ops[k].s);
      for (const o of accepted.has(n) ? h.adds : h.dels) lines.push(o.s);
      k = h.to + 1;
    }
    for (; k < ops.length; k++) lines.push(ops[k].s);
    return lines.join('\n');
  }

  /**
   * Opens the review. ctx: { code, title, statement, lang, result, testInput, model }.
   * onApply(code, { run }) puts the result in the editor.
   */
  async function open(ctx, onApply) {
    document.getElementById('qfFixModal')?.remove();
    const back = document.createElement('div');
    back.className = 'qf-modal-back'; back.id = 'qfFixModal';
    back.innerHTML = `<div class="qf-modal" role="dialog" aria-modal="true" aria-labelledby="qfFixT">
      <div class="qf-modal-head"><h2 id="qfFixT">Suggested fixes</h2><button type="button" class="qf-x" data-close aria-label="Close">✕</button></div>
      <div id="qfFixBody"><p class="qf-muted">Reading your code and the failing case, and making the smallest change that passes… 10–40 seconds.</p></div></div>`;
    document.body.appendChild(back);
    const close = () => back.remove();
    back.addEventListener('click', e => { if (e.target === back || e.target.closest('[data-close]')) close(); });
    back.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
    const body = back.querySelector('#qfFixBody');
    let d;
    try {
      const r = await fetch('/api/coding/fix', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ctx) });
      d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || `server said ${r.status}`);
    } catch (e) { body.innerHTML = `<p class="qf-fb no">Could not suggest fixes: ${esc(e.message)}</p>`; return; }
    if (!document.body.contains(back)) return;

    const original = ctx.code.replace(/\s+$/, ''), fixed = d.fixed.replace(/\s+$/, '');
    const ops = diff(original, fixed), hs = hunks(ops);
    if (!hs.length) { body.innerHTML = `<p class="qf-fb ok">No change needed — the model thinks your code is already correct.${d.summary ? ` ${esc(d.summary)}` : ''}</p>`; return; }
    // Each change gets the reasons the model gave for lines inside it.
    const notesFor = h => {
      const lo = (h.adds[0]?.b ?? h.dels[0]?.b ?? 0) + 1, hi = h.adds.length ? h.adds[h.adds.length - 1].b + 1 : lo;
      return d.notes.filter(n => n.line >= lo - (h.adds.length ? 0 : 1) && n.line <= hi).map(n => n.why);
    };
    const decided = new Map();                       // hunk index -> true (accept) | false (reject)
    const accepted = () => new Set([...decided].filter(([, v]) => v).map(([k]) => k));

    const paint = () => {
      const acc = accepted();
      body.innerHTML = `
        ${d.summary ? `<p class="qf-fix-sum">${esc(d.summary)}</p>` : ''}
        <div class="qf-m-act">
          <button type="button" class="qf-b sm" data-all="1">✓ Accept all</button>
          <button type="button" class="qf-b sm" data-all="0">✕ Reject all</button>
          <span class="qf-muted">${hs.length} change${hs.length === 1 ? '' : 's'} · ${acc.size} accepted · ${[...decided.values()].filter(v => !v).length} rejected${d.model ? ` · suggested by ${esc(d.model)}` : ''}</span>
        </div>
        ${hs.map((h, n) => {
          const before = ops.slice(Math.max(0, h.from - CONTEXT), h.from).filter(o => o.t === 'eq');
          const after = ops.slice(h.to + 1, h.to + 1 + CONTEXT).filter(o => o.t === 'eq');
          const first = (h.dels[0] ?? h.adds[0]).a + 1, state = decided.get(n);
          const kind = !h.dels.length ? 'added' : !h.adds.length ? 'removed' : 'changed';
          const span = h.dels.length > 1 ? `lines ${first}–${first + h.dels.length - 1}` : `line ${first}`;
          return `<section class="qf-fix-h${state === true ? ' acc' : state === false ? ' rej' : ''}">
            <div class="qf-fix-hh"><b>Change ${n + 1}</b><span class="qf-muted">${kind} · your ${span}</span>
              <span class="qf-fix-btns"><button type="button" class="qf-b sm${state === true ? ' pri' : ''}" data-acc="${n}" aria-pressed="${state === true}">✓ Accept</button>
              <button type="button" class="qf-b sm" data-rej="${n}" aria-pressed="${state === false}">✕ Reject</button></span></div>
            ${notesFor(h).map(w => `<p class="qf-fix-why">💡 ${esc(w)}</p>`).join('')}
            <pre class="qf-fix-code">${before.map(o => `<div class="ctx"><i>${o.a + 1}</i><span> </span><code>${esc(o.s) || ' '}</code></div>`).join('')}${h.dels.map(o => `<div class="del"><i>${o.a + 1}</i><span>-</span><code>${esc(o.s) || ' '}</code></div>`).join('')}${h.adds.map(o => `<div class="add"><i></i><span>+</span><code>${esc(o.s) || ' '}</code></div>`).join('')}${after.map(o => `<div class="ctx"><i>${o.a + 1}</i><span> </span><code>${esc(o.s) || ' '}</code></div>`).join('')}</pre>
          </section>`;
        }).join('')}
        <div class="qf-m-act qf-fix-foot">
          <button type="button" class="qf-b pri" data-apply="run"${acc.size ? '' : ' disabled'}>Apply ${acc.size || ''} accepted & Run</button>
          <button type="button" class="qf-b" data-apply="1"${acc.size ? '' : ' disabled'}>Apply accepted to editor</button>
          <span class="qf-muted">Rejected and undecided changes keep your original lines.</span>
        </div>`;
      body.querySelectorAll('[data-acc]').forEach(b => { b.onclick = () => { decided.set(+b.dataset.acc, true); paint(); }; });
      body.querySelectorAll('[data-rej]').forEach(b => { b.onclick = () => { decided.set(+b.dataset.rej, false); paint(); }; });
      body.querySelectorAll('[data-all]').forEach(b => { b.onclick = () => { hs.forEach((_, n) => decided.set(n, b.dataset.all === '1')); paint(); }; });
      body.querySelectorAll('[data-apply]').forEach(b => {
        b.onclick = () => { const code = apply(ops, hs, accepted()); close(); onApply(code, { run: b.dataset.apply === 'run' }); };
      });
    };
    paint();
  }

  window.QFFix = { open, diff, hunks, apply };
})();
