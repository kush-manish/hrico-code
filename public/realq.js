/* REALQ tab: questions Google actually asked, from interview reports. The 28
 * worked solutions are the backbone, each Python snippet can be animated on
 * demand, and the reference pages (what was asked, behavioural, process) sit
 * below them. Progress is a checklist kept in localStorage. */
(function () {
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let data = null;
  let loading = null;
  let current = null;                    // page id on screen: q7 | asked-1 | bv-3 | proc-2 | recap
  let query = '';
  const animCache = {};                  // "q1.s0" -> anim
  const players = [];                    // mounted frame players on the current page

  const DONE = 'realq.done';
  const done = new Set();
  try { JSON.parse(localStorage.getItem(DONE) || '[]').forEach(s => done.add(s)); } catch { /* start clean */ }
  const persistDone = () => { try { localStorage.setItem(DONE, JSON.stringify([...done])); } catch { /* quota */ } };

  function load() {
    if (data) return Promise.resolve(data);
    loading ||= fetch('/api/realq').then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    }).then(d => { data = d; return d; }).finally(() => { loading = null; });
    return loading;
  }

  // -------------------------------------------------------------- markdown
  /** Inline markdown: code, bold, italics. Escapes first, so content is never raw HTML. */
  const inline = s => esc(s)
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*([^*\n]+)\*(?![*\w])/g, '$1<em>$2</em>');

  const table = rows => {
    const cells = r => r.replace(/^\||\|$/g, '').split('|').map(c => c.trim());
    const [head, , ...body] = rows;
    return `<table><thead><tr>${cells(head).map(c => `<th>${inline(c)}</th>`).join('')}</tr></thead>
      <tbody>${body.map(r => `<tr>${cells(r).map(c => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  };

  /**
   * Block markdown for the subset these files use: ###/#### headings, tables,
   * bullet and numbered lists, rules, fenced text blocks and paragraphs.
   * Python fences are handed to `onCode(index)` so the caller can draw them
   * as snippets with controls.
   */
  function md(src, onCode = () => '') {
    const lines = String(src || '').split('\n');
    const out = [];
    let i = 0, pyIdx = 0;
    const para = [];
    const flush = () => {
      if (!para.length) return;
      const text = para.join(' ');
      const cls = /^\*\*Same call\?\*\*/.test(text) ? ' class="rq-samecall"'
        : /^\*\*Q\d+\.\d+/.test(text) ? ' class="rq-partline"'
        : /^\*[^*].*\*$/.test(text) ? ' class="rq-source"' : '';
      out.push(`<p${cls}>${inline(text)}</p>`);
      para.length = 0;
    };
    while (i < lines.length) {
      const l = lines[i];
      if (/^```/.test(l)) {
        flush();
        const lang = l.slice(3).trim();
        const buf = [];
        i++;
        while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
        i++;
        if (lang === 'python') out.push(onCode(pyIdx++, buf.join('\n')));
        else out.push(`<pre class="rq-text">${esc(buf.join('\n'))}</pre>`);
        continue;
      }
      if (/^---\s*$/.test(l)) { flush(); out.push('<hr>'); i++; continue; }
      const h = l.match(/^(#{3,4})\s+(.+)$/);
      if (h) { flush(); out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); i++; continue; }
      if (/^\|/.test(l)) {
        flush();
        const rows = [];
        while (i < lines.length && /^\|/.test(lines[i])) rows.push(lines[i++]);
        out.push(rows.length >= 2 ? table(rows) : `<p>${inline(rows.join(' '))}</p>`);
        continue;
      }
      const li = l.match(/^(\s*)([-*]|\d+\.)\s+(.+)$/);
      if (li) {
        flush();
        const ordered = /\d/.test(li[2]);
        const items = [];
        while (i < lines.length) {
          const m = lines[i].match(/^(\s*)([-*]|\d+\.)\s+(.+)$/);
          if (!m) break;
          items.push(m[3]);
          i++;
          // Continuation lines indented under the bullet.
          while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !/^\s*([-*]|\d+\.)\s/.test(lines[i])) {
            items[items.length - 1] += ' ' + lines[i].trim();
            i++;
          }
        }
        out.push(`<${ordered ? 'ol' : 'ul'}>${items.map(t => `<li>${inline(t)}</li>`).join('')}</${ordered ? 'ol' : 'ul'}>`);
        continue;
      }
      if (/^\*\*[^*]+\*\*\s*$/.test(l)) { flush(); out.push(`<span class="rq-label">${inline(l)}</span>`); i++; continue; }
      if (!l.trim()) { flush(); i++; continue; }
      para.push(l.trim());
      i++;
    }
    flush();
    return out.join('\n');
  }

  // --------------------------------------------------------------- sidebar
  const allPages = () => [
    ...data.questions.map(q => ({ id: q.id, title: `Q${q.n}. ${q.title}`, kind: 'q' })),
    { id: 'recap', title: 'One-page recap', kind: 'ref' },
    ...data.asked.pages.map(p => ({ id: p.id, title: p.title, kind: 'ref' })),
    ...data.behavioural.pages.map(p => ({ id: p.id, title: p.title, kind: 'ref' })),
    ...data.process.pages.map(p => ({ id: p.id, title: p.title, kind: 'ref' })),
  ];

  const hit = t => !query || t.toLowerCase().includes(query);

  /** The list can be hidden to give the page the full width; remembered per device. */
  const SIDE = 'realq.side';
  function showSide(on) {
    $('rqLayout').classList.toggle('rq-noside', !on);
    const b = $('rqShowSide');
    if (b) b.hidden = on;
    try { localStorage.setItem(SIDE, on ? '1' : '0'); } catch { /* fine */ }
    window.dispatchEvent(new Event('resize'));
  }
  window.realqShowSide = showSide;
  function ensureShowBtn() {
    if ($('rqShowSide')) return;
    const b = document.createElement('button');
    b.id = 'rqShowSide'; b.type = 'button'; b.className = 'ghost rq-side-toggle rq-show-side'; b.title = 'Show the list (L)';
    b.textContent = '☰ List';
    b.onclick = () => showSide(true);
    $('rqLayout').prepend(b);
    let hidden = false;
    try { hidden = localStorage.getItem(SIDE) === '0'; } catch { /* fine */ }
    showSide(!hidden);
  }
  document.addEventListener('keydown', e => {
    if (e.key !== 'l' || e.metaKey || e.ctrlKey || e.altKey || document.body.dataset.mode !== 'realq') return;
    if (e.target.closest('input, textarea, select, [contenteditable]')) return;
    const body = document.body;
    if (body.classList.contains('focus')) {
      // In focus mode the list is also hidden by focus-side; flip that and make sure the list itself is on.
      const on = body.classList.toggle('focus-side');
      if (on) showSide(true);
      return;
    }
    showSide($('rqLayout').classList.contains('rq-noside'));
  });

  function renderSide() {
    ensureShowBtn();
    const qs = data.questions;
    const doneQ = qs.filter(q => done.has(q.id)).length;
    const art = (id, label, n) => `<button class="pl-art${id === current ? ' sel' : ''}${done.has(id) ? ' rq-done-art' : ''}" data-id="${esc(id)}">
        ${n != null ? `<span class="rq-art-n">${n}</span>` : ''}<span>${esc(label)}</span>
        ${done.has(id) ? '<span class="rq-art-done" title="Done">✓</span>' : ''}
      </button>`;
    const group = (name, items) => {
      // "7", "q7" and "Q7" also find question Q7 by its number.
      const qn = query.replace(/^q\s*/, '');
      const shown = items.filter(it => hit(it.label) || (it.n != null && /^\d+$/.test(qn) && String(it.n).toLowerCase().replace(/^q/, '') === qn));
      return shown.length ? `<div class="pl-group-name">${esc(name)}</div>${shown.map(it => art(it.id, it.label, it.n)).join('')}` : '';
    };
    const parts = data.parts.map(p => group(`Part ${p.n} — ${p.title}`,
      p.questions.map(id => { const q = qs.find(x => x.id === id); return { id, label: q.title, n: `Q${q.n}` }; })));
    const refs = [
      group('Recap', [{ id: 'recap', label: 'One-page recap: trigger words → technique' }]),
      group('What was asked', data.asked.pages.map(p => ({ id: p.id, label: p.title }))),
      group('Googlyness / behavioural', [{ id: 'bv-answers', label: '★ Your best answers to every asked question' }, ...data.behavioural.pages.map(p => ({ id: p.id, label: p.title }))]),
      group('How to pass', data.process.pages.map(p => ({ id: p.id, label: p.title }))),
    ];
    $('rqList').innerHTML = `
      <div class="pl-side-head">
        <div class="pl-side-title">Real Google questions
          <button id="rqHideSide" class="ghost rq-side-toggle" type="button" title="Hide the list (L)">Hide list</button></div>
        <div class="pl-side-sub">${doneQ} of ${qs.length} questions done · ${data.questions.reduce((a, q) => a + q.snippets.length, 0)} solutions</div>
        <input id="rqSearch" class="pl-search" type="search" placeholder="Search questions…" value="${esc(query)}">
      </div>
      <nav class="pl-tree">${[...parts, ...refs].join('') || '<p class="hs-empty">Nothing matches that.</p>'}</nav>`;
    $('rqList').querySelectorAll('.pl-art').forEach(b => { b.onclick = () => open(b.dataset.id); });
    $('rqHideSide').onclick = () => showSide(false);
    const s = $('rqSearch');
    let t = null;
    s.oninput = () => {
      clearTimeout(t);
      t = setTimeout(() => {
        query = s.value.trim().toLowerCase();
        const pos = s.selectionStart;
        renderSide();
        const n = $('rqSearch'); n.focus(); n.setSelectionRange(pos, pos);
      }, 150);
    };
  }

  // ------------------------------------------------------------------ pages
  function unmount() {
    players.splice(0).forEach(p => p?.destroy?.());
  }

  function welcome() {
    const qs = data.questions;
    $('rqDetail').innerHTML = `<div class="rq-page pl-welcome">
      <h1>Questions Google actually asked</h1>
      <p class="bv-lede">${qs.length} questions restated from LeetCode Discuss interview reports (June 2025 – Oct 2026),
        each with brute force and optimal Python, complexity, and the follow-ups the interviewer asked. Every
        solution can be animated step by step. Mark each one done as you work through it; the sidebar keeps count.</p>
      ${md(data.intro)}
      <div class="pl-chips">${data.parts.map(p =>
        `<button class="pl-chip" data-id="${esc(p.questions[0])}">Part ${p.n} — ${esc(p.title)} <span>${p.questions.length}</span></button>`).join('')}
        <button class="pl-chip" data-id="recap">One-page recap</button>
        <button class="pl-chip" data-id="bv-answers">★ Googlyness: your best answers</button>
      </div>
    </div>`;
    $('rqDetail').querySelectorAll('.pl-chip').forEach(b => { b.onclick = () => open(b.dataset.id); });
  }

  const doneBtn = id => `<button class="rq-done-btn ghost${done.has(id) ? ' sel' : ''}" type="button"
      aria-pressed="${done.has(id)}">${done.has(id) ? '✓ Done' : 'Mark done'}</button>`;
  const pop = id => window.Focus?.btn?.('realq', id) || '';

  function wireDone(box, id) {
    const b = box.querySelector('.rq-done-btn');
    if (!b) return;
    b.onclick = () => {
      if (done.has(id)) done.delete(id); else done.add(id);
      persistDone();
      const on = done.has(id);
      b.classList.toggle('sel', on);
      b.setAttribute('aria-pressed', String(on));
      b.textContent = on ? '✓ Done' : 'Mark done';
      renderSide();
    };
  }

  /** Related LeetCode problems for a real question: solve them with the judge, watch their Shorts. */
  function lcSection(q) {
    const list = data.leetcode?.[q.id] || [];
    if (!list.length) return `<section class="rq-lc"><h2>Practise on LeetCode</h2><p class="rq-lc-none">No close LeetCode equivalent — practise this one from the solutions below.</p></section>`;
    const exact = m => /^exact/.test(m);
    return `<section class="rq-lc"><h2>Practise on LeetCode <small>${list.length} related · also in your Nov 3 plan</small></h2>
      <ul>${list.map(x => `<li class="rq-lc-row">
        <span class="rq-lc-match${exact(x.match) ? ' exact' : ''}">${esc(x.match)}</span>
        <span class="rq-lc-t"><b>${esc(x.id)}. ${esc(x.title)}</b> <span class="ln-diff ${esc(String(x.difficulty).toLowerCase())}">${esc(x.difficulty)}</span>${x.premium ? ' <small>🔒 Premium</small>' : ''}
          <small class="rq-lc-why">${esc(x.why)}</small></span>
        <span class="rq-lc-act"><button type="button" class="primary" data-lc-solve="${esc(x.slug)}" data-title="${esc(x.title)}">Solve</button>
          ${x.short ? `<button type="button" class="ghost" data-lc-short="${esc(x.slug)}">▶ Short</button>` : ''}
          <a class="ghost rq-lc-ext" href="https://leetcode.com/problems/${esc(x.slug)}/" target="_blank" rel="noopener" title="Open on leetcode.com">↗</a></span>
      </li>`).join('')}</ul></section>`;
  }

  function paintQuestion(q) {
    const part = data.parts.find(p => p.n === q.part);
    const idx = data.questions.indexOf(q);
    const prev = data.questions[idx - 1], next = data.questions[idx + 1];
    const ready = new Set(data.animated || []);
    const snippet = (i, code) => {
      const s = q.snippets[i] || { label: '', code };
      const key = `${q.id}.s${i}`;
      return `<div class="rq-snip" data-key="${esc(key)}" data-idx="${i}">
        <div class="rq-snip-head">
          <span class="rq-snip-title">${esc(s.label || `Snippet ${i + 1}`)}</span>
          ${ready.has(key) || animCache[key] ? '<span class="rq-ready">● trace ready</span>' : ''}
          <button class="rq-animate ghost" type="button">▶ Watch it run</button>
          <button class="rq-editor ghost" type="button">Copy code</button>
        </div>
        <pre class="rq-code"><code>${esc(code)}</code></pre>
        <div class="rq-anim" hidden></div>
      </div>`;
    };
    $('rqDetail').innerHTML = `<article class="rq-page">
      <div class="rq-meta">
        <span class="rq-tag rq-part">Part ${q.part} — ${esc(part?.title || '')}</span>
        ${q.meta ? `<span class="rq-tag">${esc(q.meta)}</span>` : ''}
        ${doneBtn(q.id)}${pop(q.id)}
      </div>
      <h1>Q${q.n}. ${esc(q.title)}</h1>
      ${lcSection(q)}
      <div class="rq-snip rq-qexplain" data-key="${esc(q.id)}.q" data-idx="q">
        <div class="rq-snip-head">
          <span class="rq-snip-title">Understand the question first</span>
          ${ready.has(`${q.id}.q`) || animCache[`${q.id}.q`] ? '<span class="rq-ready">● slides ready</span>' : ''}
          <button class="rq-animate ghost" type="button">▶ Explain with pictures</button>
        </div>
        <p class="rq-qexplain-hint">What is being asked, what each term means on a concrete input, and how the expected output forms — no code, so you can attempt it yourself first.</p>
        <div class="rq-anim" hidden></div>
      </div>
      <div class="rq-md">${md(q.md, snippet)}</div>
      <nav class="rq-next">
        ${prev ? `<button class="pl-step ghost" data-id="${esc(prev.id)}">← Q${prev.n}. ${esc(prev.title)}</button>` : ''}
        ${next ? `<button class="pl-step ghost" data-id="${esc(next.id)}">Q${next.n}. ${esc(next.title)} →</button>` : ''}
      </nav>
    </article>`;
    const box = $('rqDetail');
    wireDone(box, q.id);
    box.querySelectorAll('[data-lc-solve]').forEach(b => { b.onclick = () => window.openQuestion?.(b.dataset.lcSolve, b.dataset.title)?.catch?.(() => { /* toast shown by openQuestion */ }); });
    box.querySelectorAll('[data-lc-short]').forEach(b => { b.onclick = () => window.QFShorts?.open?.(b.dataset.lcShort, (data.leetcode?.[q.id] || []).filter(x => x.short)); });
    box.querySelectorAll('.pl-step').forEach(b => { b.onclick = () => open(b.dataset.id); });
    box.querySelectorAll('.rq-snip').forEach(el => {
      const code = el.querySelector('code')?.textContent;
      const toEditor = el.querySelector('.rq-editor');
      if (toEditor) toEditor.onclick = async () => {
        // The snippet itself has no LeetCode twin to judge against (the related
        // problems above do); dropping it into the Coding tab would overwrite
        // whatever question was open.
        const text = `${data.imports}\n\n\n${code}`;
        let ok = false;
        if (window.qfCopyText) ok = await window.qfCopyText(text);
        else { try { await navigator.clipboard.writeText(text); ok = true; } catch { /* refused */ } }
        if (ok) {
          toEditor.textContent = 'Copied';
          setTimeout(() => { toEditor.textContent = 'Copy code'; }, 1500);
          window.QF?.toast?.('Code copied. To use the judge, solve one of the related LeetCode problems at the top of this page.');
        } else window.QF?.toast?.('Could not copy automatically — select the code and copy it.');
      };
      el.querySelector('.rq-animate').onclick = () => animate(q, el);
    });
  }

  const modelQuery = () => {
    const model = window.Settings?.modelFor?.('prolearn');
    return model ? `?model=${encodeURIComponent(model)}` : '';
  };

  /** Body as JSON, or a readable error when the proxy answered with HTML or nothing (Safari says "did not match the expected pattern"). */
  async function readJson(r) {
    const text = await r.text();
    try { return JSON.parse(text); }
    catch { throw new Error(r.ok ? 'The server answered with something that is not JSON' : `Server error ${r.status}${r.status === 524 || r.status === 504 ? ' (timed out)' : ''}`); }
  }

  /**
   * Kick off a generation, then poll until it is on disk. One long request
   * used to do this, but the proxy drops it after ~100 s and the first trace
   * takes longer than that.
   */
  async function fetchAnim(base, query, onTick) {
    const q = query ? `${query}&` : '?';
    let r = await fetch(`${base}${q}start=1`);
    let d = await readJson(r);
    if (r.status === 200) return d;
    if (r.status !== 202) throw new Error(d.error || `Server error ${r.status}`);
    const t0 = Date.now();
    for (;;) {
      await new Promise(res => setTimeout(res, 4000));
      onTick?.(Math.round((Date.now() - t0) / 1000));
      r = await fetch(base, { cache: 'no-store' });
      d = await readJson(r);
      if (r.status === 200) return d;
      if (r.status === 202) {
        if (d.pending === false) throw new Error('The server restarted while tracing — click again');
        continue;
      }
      throw new Error(d.error || `Server error ${r.status}`);
    }
  }

  /** "3 of 3 checked" under the snippet title, from the examples' verification flags. */
  function readyBadge(el, anim) {
    const n = anim.examples.length, v = anim.examples.filter(e => e.verified).length;
    const notes = anim.examples.flatMap(e => [...(e.issues || []), ...(e.defects || [])].map(x => `${e.name}: ${x}`));
    const checked = anim.question ? '' : v === n ? ', code run on each' : `, code run on ${v}`;
    const reviewed = anim.review === 'good' ? ' · tutor-reviewed ☆' : anim.review === 'fix' ? ' · reviewed, see notes' : '';
    const major = notes.filter(x => !/: minor · /.test(x)).length;
    let b = el.querySelector('.rq-ready');
    if (!b) { el.querySelector('.rq-snip-title').insertAdjacentHTML('afterend', '<span class="rq-ready"></span>'); b = el.querySelector('.rq-ready'); }
    b.textContent = `● ${n} examples${checked}${reviewed}`;
    b.title = notes.join('\n');
    b.classList.toggle('rq-ready-partial', (!anim.question && v < n) || anim.review === 'fix');
    let box = el.querySelector('.rq-notes');
    if (!notes.length) { box?.remove(); return; }
    if (!box) { el.querySelector('.rq-snip-head').insertAdjacentHTML('afterend', '<details class="rq-notes"></details>'); box = el.querySelector('.rq-notes'); }
    const head = major
      ? `${major} reviewer ${major === 1 ? 'note' : 'notes'} on these slides — read with that in mind`
      : `${notes.length} minor wording ${notes.length === 1 ? 'note' : 'notes'} from the reviewer`;
    box.innerHTML = `<summary>${head}</summary><ul>${notes.map(x => `<li${/: minor · /.test(x) ? ' class="rq-note-minor"' : ''}>${esc(x.replace(': minor · ', ': '))}</li>`).join('')}</ul>`;
  }

  async function animate(q, el) {
    const key = el.dataset.key;
    const isQ = el.dataset.idx === 'q';
    const idx = isQ ? 'q' : Number(el.dataset.idx);
    const pane = el.querySelector('.rq-anim');
    const btn = el.querySelector('.rq-animate');
    const openLabel = isQ ? '▶ Explain with pictures' : '▶ Watch it run';
    if (!pane.hidden) { pane.hidden = true; btn.textContent = openLabel; return; }
    pane.hidden = false;
    btn.textContent = 'Hide';
    const base = `/api/realq-anim/${encodeURIComponent(q.id)}/${idx}`;
    const mount = (anim, startAt = 0) => {
      pane.innerHTML = '<div class="pl-player"></div>';
      readyBadge(el, anim);
      const w = {
        ...anim, startAt,
        onAddExample: async input => {
          const r = await fetch(`${base}/example`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ input, model: window.Settings?.modelFor?.('prolearn') }),
          });
          const d = await readJson(r);
          if (!r.ok) throw new Error(d.error || 'Could not trace that input');
          animCache[key] = d.anim;
          if (current === q.id && !pane.hidden) mount(d.anim, d.added);
        },
        onRemoveExample: async k => {
          const r = await fetch(`${base}/example/${k}`, { method: 'DELETE' });
          const d = await r.json();
          if (!r.ok) return;
          animCache[key] = d;
          if (current === q.id && !pane.hidden) mount(d, 0);
        },
      };
      try { players.push(window.Animate?.mount?.(pane.firstElementChild, w) || null); }
      catch { pane.innerHTML = '<p class="sol-loading">Could not draw the animation.</p>'; }
    };
    if (animCache[key]) return mount(animCache[key]);
    pane.innerHTML = `<p class="sol-loading">${isQ
      ? 'Drawing the question on three inputs… under a minute, once ever.'
      : 'Tracing this solution on three inputs and running the code to check each one… under a minute, once ever.'}</p>`;
    btn.disabled = true;
    try {
      const d = await fetchAnim(base, modelQuery(), elapsed => {
        if (!pane.hidden && current === q.id && !pane.querySelector('.pl-player')) {
          pane.innerHTML = `<p class="sol-loading">${isQ ? 'Drawing the question' : 'Tracing this solution'} — ${elapsed}s so far. First time takes a few minutes; it is saved after that.</p>`;
        }
      });
      animCache[key] = d;
      if (current !== q.id) return;
      mount(d);
    } catch (e) {
      pane.innerHTML = `<p class="sol-loading" style="color:var(--red)">Could not trace it: ${esc(e.message)}</p>`;
    } finally {
      btn.disabled = false;
    }
  }

  // Googlyness reference pages carry the written answers too, so the page
  // that lists the questions also shows how to answer them.
  const BV_ANSWERS = { 'bv-1': ['opener', 'realq'], 'bv-2': ['realq'], 'bv-5': ['realq', 'googleyness', 'gca'], 'bv-7': ['opener'] };

  function paintRef(page, crumb) {
    const sets = page.id.startsWith('bv-') ? (BV_ANSWERS[page.id] || []) : [];
    $('rqDetail').innerHTML = `<article class="rq-page">
      <div class="rq-meta"><span class="rq-tag">${esc(crumb)}</span>${doneBtn(page.id)}${pop(page.id)}</div>
      <h1>${esc(page.title)}</h1>
      ${page.id.startsWith('bv-') ? `<p class="rq-ans-cta"><button class="pl-chip" data-id="bv-answers">★ Open all written answers (every question, Google STAR format)</button></p>` : ''}
      <div class="rq-md">${md(page.md, (_, code) => `<pre class="rq-text">${esc(code)}</pre>`)}</div>
      ${sets.length ? '<div class="rq-ans-embed"><p class="sol-loading">Loading your answers…</p></div>' : ''}
    </article>`;
    const box = $('rqDetail');
    wireDone(box, page.id);
    box.querySelectorAll('.rq-ans-cta .pl-chip').forEach(b => { b.onclick = () => open(b.dataset.id); });
    if (sets.length) {
      const id = page.id;
      answersBlock(ANSWER_SETS.filter(([k]) => sets.includes(k)))
        .then(html => { if (current === id) { const el = box.querySelector('.rq-ans-embed'); el.innerHTML = html; wireAnswers(el); } })
        .catch(e => { const el = box.querySelector('.rq-ans-embed'); if (el) el.innerHTML = `<p class="sol-loading">Could not load the answers (${esc(e.message)}).</p>`; });
    }
  }

  function paintRecap() {
    $('rqDetail').innerHTML = `<article class="rq-page rq-recap">
      <div class="rq-meta"><span class="rq-tag">Recap</span>${doneBtn('recap')}${pop('recap')}</div>
      <h1>One-page recap</h1>
      <p class="pl-summary">Trigger words in the problem statement, and what to reach for. Read it the morning of.</p>
      <div class="rq-md">${md(data.recap)}</div>
    </article>`;
    wireDone($('rqDetail'), 'recap');
    // Q numbers in the recap table link to the questions.
    $('rqDetail').querySelectorAll('tbody tr').forEach(tr => {
      const n = Number(tr.firstElementChild?.textContent.trim());
      if (!n || !data.questions.find(q => q.n === n)) return;
      tr.style.cursor = 'pointer';
      tr.title = `Open Q${n}`;
      tr.onclick = () => open(`q${n}`);
    });
  }

  /**
   * Every Googlyness question Google was reported asking, with the answer
   * written from the resume in Google's STAR shape and scored by the mock's
   * grader, plus Claude alternatives on demand.
   */
  const ANSWER_SETS = [
    ['opener', 'Opening & closing — every round'],
    ['realq', 'Asked in 2025–26 Googlyness rounds'],
    ['googleyness', 'Googleyness — the core themes'],
    ['gca', 'Hypotheticals (General Cognitive Ability, 4-step)'],
  ];
  const setCache = {};
  async function loadSets(list) {
    return Promise.all(list.map(([id, title]) => (setCache[id] ||= fetch(`/api/behavioural/questions/${id}`).then(r => r.json())
      .then(d => (d.questions || []).map(x => (typeof x === 'string' ? x : x.text || '')))).then(qs => ({ id, title, qs }))));
  }
  // Non-owner accounts never get the pre-written answers, so "being written" would be a false promise.
  const restrictedNote = '<p class="pl-summary rq-ans-restricted">Pre-written answers are only available on the owner\'s account — write your own in Googleyness › My stories.</p>';
  const ansBadge = (cur, q) => { const a = cur[q]; return a?.score ? `<span class="rq-ans-score${a.score.percent === 100 ? ' full' : ''}">${a.score.percent}%</span>` : window.BehaviouralBank?.restricted ? '' : '<span class="rq-ans-score none">being written</span>'; };
  const ansList = (sets, cur, openFirst) => sets.map(s => `<h2 class="rq-ans-h">${esc(s.title)} <span class="gl-muted">${s.qs.length}</span></h2>
    ${s.qs.map((q, i) => `<details class="rq-ans" data-q="${esc(q)}"${openFirst && i === 0 ? ' open' : ''}>
      <summary><span class="rq-ans-n">${i + 1}</span><span class="rq-ans-q">${esc(q)}</span>${ansBadge(cur, q)}</summary>
      <div class="rq-ans-body"></div>
    </details>`).join('')}`).join('');
  function wireAnswers(root) {
    const bank = window.BehaviouralBank;
    root.querySelectorAll('details.rq-ans').forEach(d => {
      const fill = () => {
        const body = d.querySelector('.rq-ans-body');
        if (d.open && !body.dataset.ready) { body.dataset.ready = '1'; bank.mountAnswer(body, d.dataset.q); }
      };
      d.addEventListener('toggle', fill);
      fill();
    });
  }
  /** The answers for some sets, as HTML, for embedding under a reference page. */
  async function answersBlock(list) {
    const bank = window.BehaviouralBank;
    await bank.loadCurated();
    const sets = await loadSets(list);
    if (bank.restricted) return `<hr><h2 class="rq-ans-h">★ Questions in these sets</h2>${restrictedNote}${ansList(sets, bank.curated, true)}`;
    return `<hr><h2 class="rq-ans-h">★ Your written answers for these questions</h2>
      <p class="pl-summary">Click a question to see the full answer, the STAR breakdown, the follow-ups with answers, and
        <em>Alternative answer</em> for a different story. <mark class="bk-gap">[Brackets]</mark> are details only you know.</p>
      ${ansList(sets, bank.curated, true)}`;
  }

  async function paintAnswers() {
    const box = $('rqDetail');
    box.innerHTML = '<p class="sol-loading">Loading your answers…</p>';
    const bank = window.BehaviouralBank;
    try {
      await bank.loadCurated(true);
      const sets = await loadSets(ANSWER_SETS);
      if (current !== 'bv-answers') return;
      const cur = bank.curated;
      const all = sets.flatMap(s => s.qs);
      const full = all.filter(q => cur[q]?.score?.percent === 100).length;
      box.innerHTML = `<article class="rq-page rq-answers">
        <div class="rq-meta"><span class="rq-tag">Googlyness / behavioural</span>${doneBtn('bv-answers')}${pop('bv-answers')}</div>
        <h1>Your best answers to every asked question</h1>
        ${bank.restricted ? restrictedNote : `<p class="pl-summary">Written from your CV — JPMorgan, Blue Yonder, Al-Shala — in Google's format:
          <strong>lead with the point → Situation → Task → Action ("I", not "we") → Result with the number → what you learned and used again</strong>.
          Hypotheticals follow the recruiter's four steps: <strong>Understand → Prepare → Identify a solution → Support it</strong>.
          Each is graded by the same scorer as the mock round; <strong>${full} of ${all.length}</strong> are at 100%.
          <mark class="bk-gap">[Brackets]</mark> are details only you know — swap in the real ones, then say it in your own words.
          Want a different story? Press <em>Alternative answer</em> under any answer.</p>`}
        ${ansList(sets, cur, false)}
      </article>`;
      wireDone(box, 'bv-answers');
      wireAnswers(box);
    } catch (e) {
      box.innerHTML = `<p class="sol-loading">Could not load the answers (${esc(e.message)}).</p>`;
    }
  }

  function open(id) {
    unmount();
    current = id;
    renderSide();
    const q = data.questions.find(x => x.id === id);
    if (q) paintQuestion(q);
    else if (id === 'recap') paintRecap();
    else if (id === 'bv-answers') paintAnswers();
    else {
      const find = (set, crumb) => { const p = set.pages.find(x => x.id === id); return p ? paintRef(p, crumb) || true : false; };
      if (!find(data.asked, data.asked.title) && !find(data.behavioural, data.behavioural.title) && !find(data.process, data.process.title)) welcome();
    }
    $('rqDetail').scrollTop = 0;
  }

  window.renderRealq = () => {
    if (!data) $('rqDetail').innerHTML = '<p class="sol-loading">Loading the reports…</p>';
    load().then(() => { if (current) open(current); else { renderSide(); welcome(); } })
      .catch(err => { $('rqDetail').innerHTML = `<p class="sol-loading">Could not load REALQ (${esc(err.message)}).</p>`; });
  };

  /** Deep link from elsewhere in the app. */
  window.openRealq = id => {
    window.setInterviewMode?.('realq');
    load().then(() => open(id)).catch(() => {});
  };
})();
