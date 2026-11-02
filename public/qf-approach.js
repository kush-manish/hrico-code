/* Talk through the approach: pick a problem (Google list, NeetCode 150,
 * AlgoMaster 300, or random), read it, and explain how you would solve it to
 * an AI interviewer by voice or text, with an editable whiteboard the AI
 * reads as you go. No code required — this is the first 15 minutes of a
 * Google round, practised on its own.
 * Notes and the conversation are kept per problem ('qf.approach').
 */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const KEY = 'qf.approach';
  const store = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; } };
  const saveStore = s => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* full */ } };
  // The last problem opened, so the page reopens on it. Not a slug key.
  const LAST = '@last';
  /** The newest messages only: at most 40, and 20k characters in all. */
  function fitMessages(list, maxChars = 20000, maxN = 40) {
    const out = list.slice(-maxN);
    let total = out.reduce((a, m) => a + String(m.content || '').length, 0);
    while (out.length > 1 && total > maxChars) total -= String(out.shift().content || '').length;
    return out;
  }

  // ---------------------------------------------------------- the lists --
  const SOURCES = [['google', 'Google list'], ['neetcode', 'NeetCode 150'], ['algomaster', 'AlgoMaster 300']];
  const lists = {};
  async function list(src) {
    if (lists[src]) return lists[src];
    const get = async url => { const r = await fetch(url); if (!r.ok) throw new Error(r.status === 429 ? 'too many requests — wait a few seconds' : `server said ${r.status}`); return r.json(); };
    let out = [];
    if (src === 'google') {
      const d = await get('/api/google');
      const seen = new Set();
      for (const l of Object.values(d.questions || {})) for (const q of (Array.isArray(l) ? l : l.questions || [])) {
        if (seen.has(q.slug) || q.paidOnly) continue; seen.add(q.slug);
        out.push({ slug: q.slug, title: q.title, difficulty: q.difficulty, tag: q.pattern, freq: q.frequency ?? -1 });
      }
      out.sort((a, b) => b.freq - a.freq);
    } else if (src === 'neetcode') {
      const d = await get('/api/neetcode');
      out = (d.questions || []).map(q => ({ slug: q.slug, title: q.title, difficulty: q.difficulty, tag: q.pattern }));
    } else {
      const d = await get('/api/patterns/meta/algomaster');
      for (const s of d.sections || []) for (const q of s.problems || []) {
        if (q.available === false && !q.slug) continue;
        const slug = q.slug || String(q.title || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        out.push({ slug, title: q.title, difficulty: q.difficulty, tag: s.section || s.title || '' });
      }
    }
    return (lists[src] = out);
  }

  const qCache = {};
  async function problem(p) {
    if (qCache[p.slug]) return qCache[p.slug];
    try {
      const r = await fetch(`/api/question/${encodeURIComponent(p.slug)}`);
      if (!r.ok) throw new Error();
      const q = await r.json();
      const div = document.createElement('div'); div.innerHTML = q.content || '';
      return (qCache[p.slug] = { ...p, html: q.content || '', text: div.textContent || '', difficulty: q.difficulty || p.difficulty });
    } catch {
      return (qCache[p.slug] = { ...p, html: '', text: '' });
    }
  }

  // ------------------------------------------------------------ the page --
  const PAGE = 200;
  let src = 'google', query = '', limit = PAGE, cur = null, msgs = [], waiting = new Set(), speakOn = false, stopMic = null, flushNotes = null;
  const touch = () => matchMedia('(pointer: coarse)').matches;
  function micOff() { const s = stopMic; stopMic = null; s?.(); }
  function close() {
    if (!$('qfApproachPage')) return;
    flushNotes?.(); micOff(); window.Voice?.stopSpeaking?.();
    $('qfApproachPage')?.remove(); document.documentElement.classList.remove('qf-page-open');
    document.removeEventListener('keydown', onKey, true);
  }
  // Escape closes the page wherever focus is (not only inside it), unless a
  // modal on top of it (command palette, a sheet) is handling the key.
  function onKey(e) {
    if (e.key !== 'Escape' || e.defaultPrevented || !$('qfApproachPage')) return;
    if (document.querySelector('#qfModal, .qf-modal-back, .qf-sheet-back')) return;
    close();
  }
  // Navigating anywhere else (sidebar, the ⌘K palette, Home shortcuts) clicks
  // one of the mode buttons: leave this page so it does not cover the new one.
  document.addEventListener('click', e => {
    if ($('qfApproachPage') && e.target.closest?.('button[id^="mode"]') && !e.target.closest('#qfApproachPage')) close();
  }, true);

  async function open() {
    document.querySelectorAll('.qf-page').forEach(p => p.remove());
    document.documentElement.classList.add('qf-page-open');
    const el = document.createElement('div');
    el.id = 'qfApproachPage'; el.className = 'qf-page'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-labelledby', 'qfApH');
    el.style.top = `${Math.max(0, Math.round((document.querySelector('#bar .bar-top') || $('bar'))?.getBoundingClientRect().bottom || 0))}px`;
    el.tabIndex = -1;
    document.body.appendChild(el);
    // A work page: use the width of a big screen rather than the 1100px of the reading pages.
    el.innerHTML = `<div class="qf-page-in qf-ap" style="max-width:1480px">
      <header class="qf-page-head">
        <div><h1 id="qfApH">Talk through the approach</h1>
          <p class="qf-muted">Pick a problem, explain how you would solve it — by voice or text — and the AI interviewer probes it like the first 15 minutes of a Google round. Your notes box is shared with it.</p></div>
        <div class="qf-page-act"><button type="button" class="qf-x" id="qfApClose" aria-label="Close">✕</button></div>
      </header>
      <div class="qf-ap-grid">
        <aside class="qf-ap-pick" aria-label="Choose a problem">
          <div class="qf-seg qf-ap-src" role="group" aria-label="Problem list">${SOURCES.map(([k, l]) => `<button type="button" data-src="${k}" aria-pressed="${k === src}">${l}</button>`).join('')}</div>
          <div class="qf-ap-tools"><label class="qf-sr" for="qfApQ">Search problems</label><input id="qfApQ" class="qf-search" type="search" placeholder="Search…" value="${esc(query)}">
            <button type="button" class="qf-b" id="qfApRandom">Random</button></div>
          <ul class="qf-ap-list" id="qfApList"><li class="qf-muted">Loading…</li></ul>
          <small class="qf-muted" id="qfApCount" aria-live="polite"></small>
        </aside>
        <section class="qf-ap-main" id="qfApMain"><p class="qf-muted">Choose a problem from the list, or press <b>Random</b>.</p></section>
      </div></div>`;
    $('qfApClose').onclick = close;
    document.removeEventListener('keydown', onKey, true);
    document.addEventListener('keydown', onKey, true);
    if (!touch()) el.focus({ preventScroll: true });
    el.querySelectorAll('[data-src]').forEach(b => { b.onclick = () => { src = b.dataset.src; limit = PAGE; el.querySelectorAll('[data-src]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); $('qfApList').scrollTop = 0; paintList(); }; });
    $('qfApQ').oninput = e => { query = e.target.value; limit = PAGE; paintList(); };
    // Random respects the search box: type "graph" then Random for a random graph problem.
    $('qfApRandom').onclick = async () => {
      const l = matches(await list(src).catch(() => []));
      if (!l.length) { window.QF?.toast?.('No problem matches the search — clear it first.'); return; }
      const pool = l.length > 1 && cur ? l.filter(p => p.slug !== cur.slug) : l;
      choose(pool[Math.floor(Math.random() * pool.length)]);
    };
    if (!cur) {
      const last = store()[LAST];
      if (last?.slug) {
        cur = { slug: last.slug, title: last.title, difficulty: last.difficulty, tag: last.tag };
        if (last.src && SOURCES.some(([k]) => k === last.src) && last.src !== src) {
          src = last.src;
          el.querySelectorAll('[data-src]').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.src === src)));
        }
      }
    }
    await paintList();
    if (cur) choose(cur, false);
  }

  async function paintList() {
    const ul = $('qfApList'); if (!ul) return;
    let l;
    try { l = await list(src); } catch (e) {
      ul.innerHTML = `<li class="bv-err">Could not load the list (${esc(e.message)}). <button type="button" class="qf-b sm" id="qfApRetry">Try again</button></li>`;
      $('qfApRetry').onclick = paintList; return;
    }
    const all = matches(l), shown = all.slice(0, limit);
    const done = store();
    ul.innerHTML = shown.map(p => `<li><button type="button" class="qf-ap-item${cur?.slug === p.slug ? ' on' : ''}" data-slug="${esc(p.slug)}">
        <span>${esc(p.title)}</span><span class="qf-ap-meta">${done[p.slug]?.msgs?.length ? '● ' : ''}${esc(p.difficulty || '')}${p.tag ? ` · ${esc(p.tag)}` : ''}</span></button></li>`).join('')
      + (all.length > shown.length ? `<li><button type="button" class="qf-ap-item qf-ap-more" id="qfApMore">Show ${Math.min(PAGE, all.length - shown.length)} more <span class="qf-ap-meta">${all.length - shown.length} not shown</span></button></li>` : '')
      || '<li class="qf-muted">No problem matches.</li>';
    ul.querySelectorAll('[data-slug]').forEach(b => { b.onclick = () => choose(l.find(x => x.slug === b.dataset.slug)); });
    const more = $('qfApMore'); if (more) more.onclick = () => { limit += PAGE; paintList(); };
    const n = $('qfApCount');
    if (n) n.textContent = query.trim() ? `${all.length} of ${l.length} match` : `${l.length} problems${src === 'algomaster' ? ' with a LeetCode version' : ''}`;
  }

  /** Search by title, pattern or difficulty; every word must match. */
  function matches(l) {
    const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
    if (!words.length) return l;
    return l.filter(p => { const hay = `${p.title} ${p.tag || ''} ${p.difficulty || ''} ${p.slug}`.toLowerCase(); return words.every(w => hay.includes(w)); });
  }

  async function choose(p, userPick = true) {
    if (!p) return;
    flushNotes?.(); micOff(); window.Voice?.stopSpeaking?.();
    cur = p;
    { const s = store(); s[LAST] = { slug: p.slug, title: p.title, difficulty: p.difficulty, tag: p.tag, src }; saveStore(s); }
    document.querySelectorAll('.qf-ap-item').forEach(b => b.classList.toggle('on', b.dataset.slug === p.slug));
    const main = $('qfApMain'); if (!main) return;
    main.innerHTML = '<p class="qf-muted">Loading the problem…</p>';
    const full = await problem(p);
    if (cur !== p) return;
    const saved = store()[p.slug] || {};
    msgs = saved.msgs || [];
    const canListen = window.Voice?.canListen?.();
    const resumed = msgs.some(m => m.role === 'user');
    main.innerHTML = `
      <div class="qf-ap-head"><h2>${esc(full.title)} <span class="qf-pill">${esc(full.difficulty || '')}</span></h2>
        <a class="qf-b sm" href="https://leetcode.com/problems/${esc(full.slug)}/" target="_blank" rel="noopener">LeetCode ↗</a></div>
      <details class="qf-ap-stmt"${resumed ? '' : ' open'}><summary>Problem</summary>
        ${full.html ? `<div class="prose">${full.html}</div>` : '<p class="qf-muted">The statement is not stored locally for this problem — open it on LeetCode, then come back and talk it through.</p>'}</details>
      <div class="qf-ap-work">
        <label class="qf-field qf-ap-notes"><span>Your whiteboard — the AI reads this</span>
          <textarea id="qfApNotes" rows="10" placeholder="Jot the idea, the data structure, the steps, complexity, edge cases…&#10;e.g.&#10;- sort by start&#10;- sweep, merge if overlap&#10;- O(n log n) time, O(n) space">${esc(saved.notes || '')}</textarea>
          <small class="qf-muted" id="qfApSaved">Saved automatically.</small></label>
        <div class="qf-ap-chat">
          <div class="qf-ap-log" id="qfApLog" aria-live="polite"></div>
          <div class="qf-ap-compose">
            <label class="qf-sr" for="qfApIn">Explain your approach</label>
            <textarea id="qfApIn" rows="3" placeholder="Explain how you would solve it…${touch() ? '' : ' (Ctrl/⌘+Enter to send)'}"></textarea>
            <div class="qf-ap-btns">
              ${canListen ? '<button type="button" class="qf-b" id="qfApMic" aria-pressed="false">🎤 Speak</button>'
                : `<span class="qf-ap-micoff" title="${esc(window.Voice?.why?.() || 'Voice input is not available in this browser')}"><button type="button" class="qf-b" id="qfApMicOff" disabled title="${esc(window.Voice?.why?.() || 'Voice input is not available in this browser')}">🎤 Speak</button></span>`}
              <button type="button" class="qf-b" id="qfApVoice" aria-pressed="${speakOn}">${speakOn ? '🔊 Voice on' : '🔈 Voice off'}</button>
              <button type="button" class="qf-b" id="qfApFeedback">I'm done — feedback</button>
              <button type="button" class="qf-b pri" id="qfApSend">Send</button>
            </div>
            <div class="qf-ap-extra"><button type="button" class="qf-linkbtn" id="qfApReset">Start this problem over</button>
              <button type="button" class="qf-linkbtn" id="qfApCode">Open in Coding practice</button></div>
          </div>
        </div>
      </div>`;
    paintLog();
    const notes = $('qfApNotes');
    let t = null;
    // Save the notes now (on close, on switching problem) if a debounced save is pending.
    const slug = p.slug;
    flushNotes = () => { if (!t) return; clearTimeout(t); t = null; if (cur?.slug === slug) persist(); };
    notes.oninput = () => { clearTimeout(t); $('qfApSaved').textContent = 'Saving…'; t = setTimeout(() => { t = null; persist(); const s = $('qfApSaved'); if (s) s.textContent = 'Saved automatically.'; }, 600); };
    const input = $('qfApIn');
    input.onkeydown = e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); } };
    $('qfApSend').onclick = () => send();
    $('qfApFeedback').onclick = () => send('I think I am done. Give me your verdict on my approach: what was strong, what was missing or wrong, the time and space complexity I should have stated, and the one thing to improve.');
    $('qfApVoice').onclick = e => { speakOn = !speakOn; e.target.setAttribute('aria-pressed', String(speakOn)); e.target.textContent = speakOn ? '🔊 Voice on' : '🔈 Voice off'; if (!speakOn) window.Voice?.stopSpeaking?.(); };
    $('qfApReset').onclick = () => {
      if (waiting.has(cur?.slug)) return;
      if (!confirm('Start this problem over? This clears the conversation and your whiteboard notes.')) return;
      clearTimeout(t); t = null;
      notes.value = '';
      const sv = $('qfApSaved'); if (sv) sv.textContent = 'Saved automatically.';
      msgs = []; persist(); paintLog(); greet();
    };
    $('qfApCode').onclick = () => { close(); window.QFCoding?.setFlavour?.('practice'); window.openQuestion?.(full.slug, full.title); };
    $('qfApMic')?.addEventListener('click', e => {
      const btn = e.currentTarget;
      if (stopMic) { micOff(); return; }   // onEnd below resets the button and sends
      btn.setAttribute('aria-pressed', 'true'); btn.textContent = '■ Stop & send';
      const base = input.value ? `${input.value.trim()} ` : '';
      let stop = null;
      stop = window.Voice.listen({
        onPartial: txt => { input.value = base + txt; },
        onResult: txt => { input.value = base + txt; },
        onError: msg => window.QF?.toast?.(msg),
        onEnd: () => {
          if (stopMic === stop) stopMic = null;
          btn.setAttribute('aria-pressed', 'false'); btn.textContent = '🎤 Speak';
          // Only send if this is still the problem on screen (not after switching or closing).
          if (input.isConnected && cur?.slug === slug && input.value.trim()) send();
        },
      });
      if (btn.getAttribute('aria-pressed') === 'true') stopMic = stop;   // listen() may have ended at once (no mic)
    });
    if (!msgs.length) greet();
    if (matchMedia('(pointer: fine)').matches) input.focus({ preventScroll: true });
    // Bring the problem and the chat into view when the reply box would start
    // below the fold (phone, Z Fold, 1366x768 laptops).
    if (userPick) {
      const page = $('qfApproachPage'), box = $('qfApSend');
      if (page && box && (innerWidth < 760 || box.getBoundingClientRect().bottom > page.getBoundingClientRect().bottom)) main.scrollIntoView({ block: 'start' });
    }
  }

  function persist(p = cur, list = msgs) {
    if (!p) return;
    const s = store();
    const notes = p.slug === cur?.slug && $('qfApNotes') ? $('qfApNotes').value : s[p.slug]?.notes || '';
    s[p.slug] = { title: p.title, notes, msgs: list.slice(-60), at: Date.now() };
    saveStore(s);
  }

  function paintLog() {
    const log = $('qfApLog'); if (!log) return;
    log.innerHTML = msgs.map(m => `<div class="qf-ap-msg ${m.role}"><b>${m.role === 'user' ? 'You' : 'Interviewer'}</b><div class="qf-pre">${esc(m.content)}</div></div>`).join('')
      + (waiting.has(cur?.slug) ? '<div class="qf-ap-msg assistant"><b>Interviewer</b><div class="qf-muted">thinking…</div></div>' : '');
    log.scrollTop = log.scrollHeight;
  }

  function greet() {
    msgs.push({ role: 'assistant', content: `Let's talk through "${cur.title}". Before any code — how would you approach it? Start with what the input and output are, then your idea.` });
    persist(); paintLog();
  }

  async function send(text) {
    const input = $('qfApIn');
    const content = (text || input?.value || '').trim();
    if (!content || !cur || waiting.has(cur.slug)) return;
    if (!text && input) input.value = '';
    // The reply belongs to this problem's conversation even if the user
    // switches problem or closes the page while it is on its way.
    const p = cur, thread = msgs;
    thread.push({ role: 'user', content });
    waiting.add(p.slug); paintLog(); persist(p, thread);
    const full = await problem(p);
    const here = () => cur?.slug === p.slug && $('qfApLog');
    try {
      const r = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ persona: 'phonescreen', messages: fitMessages(thread), model: window.Settings?.modelFor?.('codingChat'),
          context: { title: full.title, difficulty: full.difficulty, statement: (full.text || '').slice(0, 6000), approach: true, notes: (here() ? $('qfApNotes')?.value : store()[p.slug]?.notes) || '' } }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || `server said ${r.status}`);
      thread.push({ role: 'assistant', content: d.reply || '(no reply)' });
      if (speakOn && d.reply && here()) window.Voice?.speak?.(d.reply, { voice: window.Voice.voiceFor?.('interviewer') });
    } catch (e) {
      thread.pop();
      if (here()) {
        if (input?.isConnected && !input.value) input.value = content;
        window.QF?.toast?.(`The interviewer did not answer (${e.message}). Your message is back in the box — try again.`);
      }
    } finally {
      waiting.delete(p.slug);
      if (cur?.slug === p.slug) msgs = thread;   // came back to it meanwhile: show the live thread
      persist(p, thread); paintLog();
    }
  }

  window.QFApproach = { open, close };
})();
