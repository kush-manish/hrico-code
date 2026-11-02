/* Behavioural question bank: every question the interviewer can ask, and
 * for each the best answer for YOU — drafted from your resume profile,
 * STAR-shaped, with what the CV is missing called out. Drafts and your own
 * edits are kept in this browser only. */
(function () {
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const KEY = 'bhv.answers';
  let bank = null;                        // [{id,label,blurb,questions:[...]}], only ever a complete, good load
  const busy = new Set();

  const store = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } };
  const save = v => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* quota */ } };
  const profileKey = () => (window.Profile?.active()?.name || 'no-profile');
  const akey = q => `${profileKey()}::${q}`;
  let curated = {};                       // question -> pre-scored best answer (admin account only)
  let alts = {};                          // question -> [alternative answers written by the model]
  let writer = 'Claude';
  let restricted = false;                 // true when this account may not see the pre-written answers
  /** Your own edit wins over everything; then the pre-written answer; then a draft. */
  const getAnswer = q => {
    const own = store()[akey(q)];
    return (own?.edited ? own : null) || curated[q] || own || null;
  };
  const gapsIn = t => String(t || '').match(/\[[^\]]+\]/g) || [];

  let curatedLoading = null;
  function loadCurated(force) {
    if (curatedLoading && !force) return curatedLoading;
    curatedLoading = (async () => {
      const r = await fetch('/api/behavioural/best-answers', { cache: 'no-store' });
      if (r.status === 403) {                 // not the owner's account: no private answers, by design
        restricted = true; curated = {}; alts = {};
        return;
      }
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || `Request failed (${r.status})`);
      restricted = false;
      curated = d.answers || {}; alts = d.alternatives || {}; writer = d.writer || writer;
    })().catch(() => { curatedLoading = null; });   // a blip must not stick; the bank still works without them
    return curatedLoading;
  }
  const putAnswer = (q, a) => { const s = store(); s[akey(q)] = { ...a, at: Date.now() }; save(s); };

  async function getJson(url) {
    const r = await fetch(url);
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || `Request failed (${r.status})`);
    return d;
  }

  async function load() {
    if (bank) return bank;
    await loadCurated();
    const d = await getJson('/api/behavioural/categories');
    if (!Array.isArray(d.categories) || !d.categories.length) throw new Error('the server returned no question areas');
    const full = await Promise.all(d.categories.map(async c => {
      const q = await getJson(`/api/behavioural/questions/${encodeURIComponent(c.id)}`);
      return { ...c, questions: (q.questions || []).map(x => (typeof x === 'string' ? x : x.text || x.q || String(x))) };
    }));
    bank = full;                          // cached only once every area loaded
    return bank;
  }

  function introHtml(total) {
    const p = window.Profile?.active();
    const prewritten = Object.keys(curated).length;
    if (prewritten) {
      const full = Object.values(curated).filter(a => a.score?.percent === 100).length;
      return `Answers are pre-written from the resume on file and scored by the same grader the mock uses —
        <strong>${full}</strong> at 100%. <mark class="bk-gap">[Brackets]</mark> are details only you know: replace them
        with the real ones (use <em>Edit</em>) before you use the answer.`;
    }
    if (restricted) {
      return `<span class="bk-empty-own"><strong>Your own pre-written answers appear here once your resume is added.</strong></span>
        ${p
          ? `Your resume (<strong>${esc(p.name)}</strong>) is on file — press <em>Best answer for me</em> on any question to draft yours from it.`
          : `<button type="button" class="ln-inline" id="bkResume">Add your resume</button> and every answer is drafted from your own CV; until then they are templates with placeholders.`}`;
    }
    return p
      ? `Answers are drafted from <strong>${esc(p.name)}</strong>'s CV only — real systems and numbers, with anything the CV lacks shown as a bracket to fill.`
      : `<button type="button" class="ln-inline" id="bkResume">Upload your resume</button> and the answers will be built from your CV; until then they are templates with placeholders.`;
  }

  function render() {
    const host = $('bvBank'); if (!host) return;
    const total = bank.reduce((a, c) => a + c.questions.length, 0);
    const drafted = bank.reduce((a, c) => a + c.questions.filter(q => getAnswer(q)).length, 0);
    host.innerHTML = `
      <div class="bk-head">
        <div>
          <h2>Every question, and your best answer</h2>
          <p class="gl-muted">${total} questions across ${bank.length} areas. ${introHtml(total)}
            ${drafted} of ${total} answered so far.</p>
        </div>
        <button type="button" id="bkClose" class="ghost">Back to the interview</button>
      </div>
      ${bank.map(c => {
        const left = c.questions.filter(q => !getAnswer(q)).length;
        return `
        <section class="bk-cat" id="bk-${esc(c.id)}" aria-labelledby="bkh-${esc(c.id)}">
          <div class="bk-cat-head">
            <div><h3 id="bkh-${esc(c.id)}">${esc(c.label)}</h3><div class="gl-muted">${esc(c.blurb || '')}</div></div>
            <button type="button" class="ghost bk-draft-all" data-cat="${esc(c.id)}">Draft all ${left ? `(${left} left)` : '✓'}</button>
          </div>
          ${c.questions.map((q, i) => {
            const a = getAnswer(q);
            return `<div class="bk-q" data-q="${esc(q)}" data-cat="${esc(c.id)}">
              <div class="bk-q-row">
                <span class="bk-q-n">${i + 1}</span>
                <span class="bk-q-text">${esc(q)}</span>
                <span class="bk-q-actions">
                  <button type="button" class="ghost bk-answer" aria-expanded="false">${a ? 'Show my answer' : 'Best answer for me'}</button>
                  <button type="button" class="ghost bk-practise" title="Answer it yourself, scored">Practise</button>
                </span>
              </div>
              <div class="bk-a" hidden></div>
            </div>`;
          }).join('')}
        </section>`;
      }).join('')}`;
    $('bkClose').onclick = () => toggle(false);
    $('bkResume') && ($('bkResume').onclick = () => window.setInterviewMode?.('resume'));
    host.querySelectorAll('.bk-q').forEach(row => {
      const q = row.dataset.q, cat = row.dataset.cat, panel = row.querySelector('.bk-a');
      const btn = row.querySelector('.bk-answer');
      btn.onclick = async () => {
        if (!panel.hidden && panel.innerHTML) {
          panel.hidden = true; btn.textContent = 'Show my answer'; btn.setAttribute('aria-expanded', 'false'); return;
        }
        panel.hidden = false;
        btn.setAttribute('aria-expanded', 'true');
        if (!getAnswer(q)) await draft(q, cat, panel, row);
        else { panel.innerHTML = fullHtml(q); wireFull(panel); }
        btn.textContent = 'Hide';
      };
      row.querySelector('.bk-practise').onclick = () => window.behaviouralPractise?.(q, bank.find(c => c.id === cat)?.label || '');
    });
    host.querySelectorAll('.bk-draft-all').forEach(b => {
      b.onclick = async () => {
        const c = bank.find(x => x.id === b.dataset.cat); b.disabled = true;
        for (const q of c.questions) {
          if (getAnswer(q)) continue;
          const row = host.querySelector(`.bk-q[data-q="${CSS.escape(q)}"]`); const panel = row?.querySelector('.bk-a');
          if (panel) { panel.hidden = false; await draft(q, c.id, panel, row); }
          await new Promise(r => setTimeout(r, 3500));          // stay under the per-minute limit
        }
        b.disabled = false; render();
      };
    });
  }

  async function draft(q, cat, panel, row) {
    if (busy.has(q)) return;
    busy.add(q);
    panel.innerHTML = '<p class="gl-muted">Drafting from your CV… 10–20 seconds.</p>';
    try {
      const r = await fetch('/api/behavioural/model-answer', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, category: bank.find(c => c.id === cat)?.label || cat, profile: window.Profile?.active(), model: window.Settings?.modelFor('behaviouralScore') }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || `Request failed (${r.status})`);
      putAnswer(q, d);
      panel.innerHTML = fullHtml(q);
      wireFull(panel);
      row.querySelector('.bk-answer').textContent = 'Hide';
    } catch (e) {
      panel.innerHTML = `<div class="bv-err bv-retry-row" role="alert"><span>Could not draft this answer: ${esc(e.message)}</span>
        <button type="button" class="ghost bk-redraft">Retry</button></div>`;
    } finally { busy.delete(q); }
  }

  const mark = t => esc(t).replace(/\[([^\]]+)\]/g, '<mark class="bk-gap">[$1]</mark>');

  function answerHtml(a, { editable = false } = {}) {
    const star = a.star || {};
    const sc = a.edited ? null : a.score;
    const badge = a.edited
      ? `<div class="bk-score bk-edited">Your edited answer · not re-scored since the edit</div>`
      : sc ? `<div class="bk-score ${sc.percent === 100 ? 'full' : ''}">
        <strong>${sc.percent}%</strong> on the interview scorer · ${esc(String(sc.overall || '').replace(/_/g, ' '))}${a.story ? ` · story ${esc(a.story)}` : ''}
        <span class="bk-dims">${(sc.dims || []).map(d => `<span title="${esc(d.comment || '')}">${esc(d.label)} ${d.score}/4</span>`).join('')}</span>
      </div>` : '';
    const gaps = gapsIn(a.answer);
    const fu = (a.followUps || []).map(f => (typeof f === 'string' ? `<li>${esc(f)}</li>` : `<li><b>${esc(f.q)}</b><div class="bk-fu-a">${mark(f.a)}</div></li>`)).join('');
    const rows = [['S', 'Situation', star.situation], ['T', 'Task', star.task], ['A', 'Action', star.action], ['R', 'Result', star.result], ['L', 'Learned', star.reflection]];
    return `
      <div class="bk-ans">
      ${badge}
      ${gaps.length ? `<p class="bk-gapcount"><mark class="bk-gap">${gaps.length}</mark> bracketed gap${gaps.length === 1 ? '' : 's'} left to fill${editable ? ' — press Edit and replace each with the real detail' : ''}.</p>` : ''}
      <div class="bk-answer-text">${mark(a.answer)}</div>
      ${editable ? `<div class="bk-edit-row">
          <button type="button" class="ghost bk-edit">Edit</button>
          ${a.edited ? '<button type="button" class="ghost bk-revert">Revert to the original</button>' : ''}
        </div>` : ''}
      ${a.edited ? '' : `<div class="bk-star">
        ${rows.map(([l, n, t]) => t ? `<div class="bk-star-row"><span class="wt-chip on" title="${n}">${l}</span><div><b>${n}</b> ${mark(t)}</div></div>` : '').join('')}
      </div>`}
      <div class="bk-meta">
        ${a.why ? `<div><b>Why this story</b> ${esc(a.why)}</div>` : ''}
        ${a.evidence?.length ? `<div><b>From your CV</b> ${a.evidence.map(esc).join(' · ')}</div>` : ''}
        ${a.gaps?.length && !a.edited ? `<div class="bk-gaps"><b>Fill these in before you use it</b><ul>${a.gaps.map(g => `<li>${esc(g)}</li>`).join('')}</ul></div>` : ''}
        ${fu ? `<div><b>They will follow up with</b><ul class="bk-fu">${fu}</ul></div>` : ''}
        ${a.score || a.edited ? '' : '<button type="button" class="ln-inline bk-redraft">Redraft</button>'}
      </div>
      </div>`;
  }

  /**
   * The main answer plus every alternative, as tabs, and the button that asks
   * the model for another one. Used by the bank and by the REALQ Googlyness page.
   */
  function fullHtml(q) {
    const main = getAnswer(q);
    const list = [main, ...(alts[q] || [])].filter(Boolean);
    const label = (a, i) => `${i ? `Alternative ${i}` : a.edited ? 'Your edited answer' : 'Best answer'}${a.score && !a.edited ? ` · ${a.score.percent}%` : ''}`;
    return `<div class="bk-full" data-q="${esc(q)}">
      ${list.length > 1 ? `<div class="bk-tabs" role="tablist">${list.map((a, i) => `<button type="button" role="tab" aria-selected="${i ? 'false' : 'true'}" class="bk-tab${i ? '' : ' on'}" data-i="${i}">${esc(label(a, i))}</button>`).join('')}</div>` : ''}
      ${list.map((a, i) => `<div class="bk-pane" data-i="${i}"${i ? ' hidden' : ''}>${answerHtml(a, { editable: i === 0 })}${a.model ? `<div class="gl-muted bk-by">Written by ${esc(a.model)}</div>` : ''}</div>`).join('') || '<p class="gl-muted">No answer written yet for this question.</p>'}
      ${restricted ? '' : `<div class="bk-alt-row">
        <button class="ghost bk-alt" type="button">✦ Alternative answer with ${esc(writer.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()))}</button>
        <span class="gl-muted bk-alt-status" aria-live="polite">A different story from the resume, Google STAR format, scored by the mock grader. About 1–3 minutes.</span>
      </div>`}
    </div>`;
  }

  /** Re-render one question's answer block wherever it is mounted. */
  function refreshFull(box) {
    const q = box.dataset.q, parent = box.parentElement;
    const fresh = document.createElement('div');
    fresh.innerHTML = fullHtml(q);
    const nb = fresh.firstElementChild;
    box.replaceWith(nb);
    wireFull(parent);
    return nb;
  }

  function wireFull(root) {
    root.querySelectorAll('.bk-full').forEach(box => {
      if (box.dataset.wired) return; box.dataset.wired = '1';
      box.querySelectorAll('.bk-tab').forEach(t => {
        t.onclick = () => {
          box.querySelectorAll('.bk-tab').forEach(x => { x.classList.toggle('on', x === t); x.setAttribute('aria-selected', String(x === t)); });
          box.querySelectorAll('.bk-pane').forEach(p => { p.hidden = p.dataset.i !== t.dataset.i; });
        };
      });
      box.querySelector('.bk-edit')?.addEventListener('click', () => openEditor(box));
      box.querySelector('.bk-revert')?.addEventListener('click', () => {
        const q = box.dataset.q, s = store(), own = s[akey(q)];
        if (own?.original) s[akey(q)] = own.original; else delete s[akey(q)];
        save(s);
        refreshFull(box).querySelector('.bk-edit')?.focus();
      });
      const btn = box.querySelector('.bk-alt'), st = box.querySelector('.bk-alt-status');
      if (!btn) return;
      btn.onclick = async () => {
        const q = box.dataset.q;
        btn.disabled = true;
        try {
          const r = await fetch('/api/behavioural/best-answers/alternative', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: q }),
          });
          const d = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(d.error || `Request failed (${r.status})`);
          const t0 = Date.now();
          for (;;) {
            await new Promise(res => setTimeout(res, 4000));
            const j = await fetch(`/api/behavioural/best-answers/alternative/${d.job}`, { cache: 'no-store' }).then(x => x.json());
            if (j.status === 'done') break;
            if (j.status === 'error' || j.error) throw new Error(j.error || 'failed');
            st.textContent = `${writer} is ${j.stage || 'working'}… ${Math.round((Date.now() - t0) / 1000)} s`;
          }
          await loadCurated(true);
          refreshFull(box).querySelector('.bk-tab:last-child')?.click();
        } catch (e) {
          st.textContent = `Could not write one: ${e.message}`;
          btn.disabled = false;
        }
      };
    });
  }

  /** Edit the main answer in place. Saved to bhv.answers, preferred over the
   *  server copy, with the remaining [bracket] gaps counted as you type. */
  function openEditor(box) {
    const q = box.dataset.q;
    const base = getAnswer(q);
    if (!base) return;
    const pane = box.querySelector('.bk-pane[data-i="0"]') || box;
    const textEl = pane.querySelector('.bk-answer-text');
    const row = pane.querySelector('.bk-edit-row');
    if (!textEl || pane.querySelector('.bk-editor')) return;
    const id = `bkEd${Math.random().toString(36).slice(2, 8)}`;
    const ed = document.createElement('div');
    ed.className = 'bk-editor';
    ed.innerHTML = `
      <label for="${id}">Your answer — replace every <mark class="bk-gap">[bracket]</mark> with what really happened</label>
      <textarea id="${id}" rows="10">${esc(base.answer)}</textarea>
      <div class="bk-editor-gaps" aria-live="polite"></div>
      <div class="bk-editor-actions">
        <button type="button" class="primary bk-save">Save my version</button>
        <button type="button" class="ghost bk-cancel">Cancel</button>
      </div>`;
    textEl.hidden = true; if (row) row.hidden = true;
    textEl.after(ed);
    const ta = ed.querySelector('textarea'), info = ed.querySelector('.bk-editor-gaps');
    const sync = () => {
      const g = gapsIn(ta.value);
      info.innerHTML = g.length
        ? `<strong>${g.length}</strong> gap${g.length === 1 ? '' : 's'} left: ${g.map(x => `<mark class="bk-gap">${esc(x)}</mark>`).join(' ')}`
        : '<span class="bk-nogaps">No bracketed gaps left.</span>';
    };
    ta.addEventListener('input', sync); sync();
    ta.focus();
    const close = () => { ed.remove(); textEl.hidden = false; if (row) row.hidden = false; pane.querySelector('.bk-edit')?.focus(); };
    ed.querySelector('.bk-cancel').onclick = close;
    ta.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); close(); } });
    ed.querySelector('.bk-save').onclick = () => {
      const text = ta.value.trim();
      if (!text) { info.innerHTML = '<span class="bv-err">An empty answer cannot be saved — Cancel keeps the current one.</span>'; return; }
      const s = store();
      const prev = s[akey(q)];
      // Keep what it replaced so Revert can restore a draft; a pre-written
      // answer needs no copy, it is still on the server.
      const original = prev?.edited ? prev.original : (curated[q] ? null : prev || null);
      s[akey(q)] = { ...base, answer: text, edited: true, original, at: Date.now() };
      delete s[akey(q)].score;
      save(s);
      refreshFull(box).querySelector('.bk-edit')?.focus();
    };
  }

  /** Redraft/Retry, wired once on the bank host (not once per open). */
  function onHostClick(e) {
    const b = e.target.closest('.bk-redraft'); if (!b) return;
    const row = b.closest('.bk-q'); if (!row) return;
    const s = store(); if (!s[akey(row.dataset.q)]?.edited) { delete s[akey(row.dataset.q)]; save(s); }
    draft(row.dataset.q, row.dataset.cat, row.querySelector('.bk-a'), row);
  }

  const SETUP_PARTS = '.bv-cats, .bv-setup-row, .ga-sheet, .bv-round-note';

  async function toggle(on) {
    const host = $('bvBank'), setup = $('bvSetup');
    if (!host) return;
    if (on) {
      setup.querySelector('.bv-intro')?.classList.add('hidden');
      setup.querySelectorAll(SETUP_PARTS).forEach(e => e.classList.add('hidden'));
      host.hidden = false;
      host.innerHTML = '<p class="gl-muted">Loading the question bank…</p>';
      try { await load(); render(); } catch (e) {
        host.innerHTML = `<div class="bv-err bv-retry-row" role="alert">
            <span>Could not load the question bank: ${esc(e.message)}</span>
            <button type="button" class="ghost" id="bkRetry">Retry</button>
            <button type="button" class="ghost" id="bkErrClose">Back</button>
          </div>`;
        $('bkRetry').onclick = () => toggle(true);
        $('bkErrClose').onclick = () => toggle(false);
      }
    } else {
      host.hidden = true;
      setup.querySelector('.bv-intro')?.classList.remove('hidden');
      setup.querySelectorAll(SETUP_PARTS).forEach(e => e.classList.remove('hidden'));
    }
  }

  function init() {
    const btn = $('bvBankBtn'); if (!btn) return;
    btn.onclick = () => toggle(true);
    $('bvBank')?.addEventListener('click', onHostClick);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  window.BehaviouralBank = {
    open: () => { window.setInterviewMode?.('behavioural'); toggle(true); },
    close: () => { if ($('bvBank') && !$('bvBank').hidden) toggle(false); },
    // For REALQ: render a question's answers (with alternatives) into any element.
    async mountAnswer(el, q) {
      await loadCurated();
      el.innerHTML = fullHtml(q);
      wireFull(el);
    },
    loadCurated,
    get curated() { return curated; },
    get restricted() { return restricted; },
  };
})();
