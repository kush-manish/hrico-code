/* Saved interviews for "Watch a mock": keep a demo you liked, re-read the
 * whole conversation with its write-up, and listen to it again with the two
 * voices. Stored in localStorage 'watch.saved' (synced to the account).
 */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const KEY = 'watch.saved';
  const read = () => { try { const v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } };
  const write = list => { try { localStorage.setItem(KEY, JSON.stringify(list.slice(-40))); return true; } catch { window.QF?.toast?.('Could not save — storage is full. Delete an old saved interview.'); return false; } };
  const who = s => (s === 'candidate' ? 'Candidate' : s === 'interviewer' ? 'Interviewer' : 'Note');
  const qText = q => (typeof q === 'string' ? q : q?.title || q?.question || '');

  function current() {
    const st = window.WatchState?.();
    if (!st || !st.transcript?.some(t => t.speaker === 'candidate')) return null;
    // Error lines ("too many requests…") are the app talking, not the interview.
    const transcript = st.transcript.filter(t => t.speaker === 'candidate' || t.speaker === 'interviewer').map(t => ({ speaker: t.speaker, text: t.text }));
    return { mode: st.mode, question: qText(st.question), transcript, code: st.code || '' };
  }

  function saveCurrent(btn) {
    const c = current();
    if (!c) { window.QF?.toast?.('Run the interview first — there is nothing to save yet.'); return; }
    const list = read();
    const dupe = list.find(x => x.question === c.question && x.transcript.length === c.transcript.length && x.transcript.at(-1)?.text === c.transcript.at(-1)?.text);
    if (dupe) { window.QF?.toast?.('Already saved.'); return; }
    const report = $('wtReport')?.cloneNode(true);
    report?.querySelectorAll('button, .wt-qf-save').forEach(b => b.remove());
    list.push({ id: `w${Date.now().toString(36)}`, at: Date.now(), ...c, reportHtml: report ? report.innerHTML : '' });
    if (write(list)) { if (btn) { btn.textContent = 'Saved ✓'; btn.disabled = true; } window.QF?.toast?.('Saved. Find it under Saved interviews at the top of Watch.'); paintLibrary(); }
  }

  // ------------------------------------------------------------ playback --
  let playing = null;
  async function listen(item, box) {
    stop();
    // Without a voice, speakAsync never ends a line and each one would sit highlighted for 90 s.
    if (!window.Voice?.speakAsync || window.Voice.canSpeak?.() === false) { setPlayLabel(box, false); window.QF?.toast?.('Speech is not available in this browser — check Settings → Voice.'); return; }
    const token = playing = {};
    const lines = box.querySelectorAll('.wl-line');
    for (let i = 0; i < item.transcript.length; i++) {
      if (playing !== token || !document.body.contains(box)) return;
      lines.forEach((l, k) => l.classList.toggle('speaking', k === i));
      lines[i]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      const t = item.transcript[i];
      if (t.speaker !== 'candidate' && t.speaker !== 'interviewer') continue;   // an app note, not speech
      const text = t.text.replace(/```[\s\S]*?```/g, ' (code shown on screen) ');
      await window.Voice.speakAsync(text, { voice: window.Voice.voiceFor?.(t.speaker) });
    }
    if (playing === token) { lines.forEach(l => l.classList.remove('speaking')); playing = null; setPlayLabel(box, false); }
  }
  function stop() { playing = null; window.Voice?.stopSpeaking?.(); document.querySelectorAll('.wl-line.speaking').forEach(l => l.classList.remove('speaking')); }
  function setPlayLabel(box, on) { const b = box.querySelector('[data-wl="play"]'); if (b) b.textContent = on ? '■ Stop listening' : '▶ Listen again'; }

  function openItem(item) {
    stop();
    window.QFDesign?.closeModal?.();
    const back = document.createElement('div');
    back.className = 'qf-modal-back'; back.id = 'qfModal';
    back.innerHTML = `<div class="qf-modal" role="dialog" aria-modal="true" aria-labelledby="wlH">
      <div class="qf-modal-head"><div><h2 id="wlH">${esc(item.question || 'Saved interview')}</h2>
        <p class="qf-muted" style="margin:4px 0 0">${item.mode === 'coding' ? 'Coding' : 'Behavioural'} · saved ${esc(new Date(item.at).toLocaleString())} · ${item.transcript.length} turns</p></div>
        <button type="button" class="qf-x" data-close aria-label="Close">✕</button></div>
      <div class="qf-m-act" style="margin:0 0 12px"><button type="button" class="qf-b pri" data-wl="play">▶ Listen again</button>
        <button type="button" class="qf-b" data-wl="copy">Copy transcript</button></div>
      <ol class="wl-log">${item.transcript.map(t => `<li class="wl-line ${t.speaker}"><b>${who(t.speaker)}</b><div class="qf-pre">${esc(t.text)}</div></li>`).join('')}</ol>
      ${item.code ? `<h3>Final code</h3><pre class="qf-code"><code>${esc(item.code)}</code></pre>` : ''}
      ${item.reportHtml ? `<details class="wl-report"><summary>The write-up from that run</summary><div>${item.reportHtml}</div></details>` : ''}
    </div>`;
    document.body.appendChild(back);
    const close = () => { stop(); back.remove(); };
    back.addEventListener('click', e => { if (e.target === back || e.target.closest('[data-close]')) close(); });
    back.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
    back.querySelector('[data-wl="play"]').onclick = () => {
      if (playing) { stop(); setPlayLabel(back, false); return; }
      setPlayLabel(back, true); listen(item, back);
    };
    back.querySelector('[data-wl="copy"]').onclick = async e => {
      const text = item.transcript.map(t => `${who(t.speaker)}: ${t.text}`).join('\n\n');
      try { await navigator.clipboard.writeText(text); e.target.textContent = 'Copied ✓'; } catch { e.target.textContent = 'Select and copy above'; }
    };
    back.querySelector('[data-wl="play"]').focus();
  }

  // ------------------------------------------------------------- library --
  function paintLibrary() {
    const host = $('wtLayout')?.querySelector('.bv-stage') || $('wtLayout');
    if (!host) return;
    let lib = $('wlLib');
    if (!lib) { lib = document.createElement('details'); lib.id = 'wlLib'; lib.className = 'qt-embed wl-lib'; host.prepend(lib); }
    const list = read().slice().reverse();
    const wasOpen = lib.open;
    lib.innerHTML = `<summary><span class="qt-play-ic" aria-hidden="true">▶</span> Saved interviews (${list.length})</summary>
      <div class="qt-embed-body">${list.length ? `<ul class="wl-list">${list.map(x => `<li>
          <div><b>${esc(x.question || 'Interview')}</b><span class="qf-muted">${x.mode === 'coding' ? 'Coding' : 'Behavioural'} · ${esc(new Date(x.at).toLocaleDateString())} · ${x.transcript.length} turns</span></div>
          <div class="qf-m-act" style="margin:0"><button type="button" class="qf-b sm pri" data-open="${x.id}">Open &amp; listen</button>
          <button type="button" class="qf-b sm" data-del="${x.id}">Delete</button></div></li>`).join('')}</ul>`
        : '<p class="qf-muted">Nothing saved yet. Run an interview below and press <b>Save this interview</b> when it ends.</p>'}</div>`;
    lib.open = wasOpen;
    lib.querySelectorAll('[data-open]').forEach(b => { b.onclick = () => { const it = read().find(x => x.id === b.dataset.open); if (it) openItem(it); }; });
    lib.querySelectorAll('[data-del]').forEach(b => {
      b.onclick = () => {
        if (b.dataset.confirm !== '1') { b.dataset.confirm = '1'; b.textContent = 'Really delete?'; return; }
        write(read().filter(x => x.id !== b.dataset.del)); paintLibrary();
      };
    });
  }

  // A Save button under every finished run (and its write-up).
  function addSaveButton() {
    const rep = $('wtReport');
    const log = $('wtLog');
    const anchor = rep || log;
    if (!anchor || !current() || anchor.parentElement.querySelector('.wt-qf-save')) return;
    const bar = document.createElement('div');
    bar.className = 'qf-m-act wt-qf-save';
    bar.innerHTML = '<button type="button" class="qf-b pri">Save this interview</button><span class="qf-muted">Keep it to re-read and listen to again.</span>';
    bar.querySelector('button').onclick = e => saveCurrent(e.target);
    anchor.after(bar);
  }

  function boot() {
    const layout = $('wtLayout');
    if (!layout) return;
    paintLibrary();
    new MutationObserver(() => {
      const st = window.WatchState?.();
      // A new run: the previous run's bar ("Saved ✓", disabled) must not carry over.
      if (st?.running) layout.querySelectorAll('.wt-qf-save').forEach(b => b.remove());
      if (st && !st.running) addSaveButton();
      if (!$('wlLib')) paintLibrary();
    }).observe(layout, { childList: true, subtree: true });
  }
  window.QFWatchLib = { read, saveCurrent, openItem };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
