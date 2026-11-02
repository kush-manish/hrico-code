/* Focus mode and pop-out pages.
 *
 * Focus hides the top bar and the left list so one page fills the screen —
 * what you want on a phone, or when stepping through an animation. Pop-out
 * opens a page in its own tab (`/?view=realq&id=q1&focus=1`), already in
 * focus mode, so a question can sit next to the editor. */
window.Focus = (function () {
  const KEY = 'focus';
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let bar = null;

  function pill() {
    if (bar) return bar;
    bar = document.createElement('div');
    bar.id = 'focusPill';
    bar.setAttribute('role', 'toolbar');
    bar.setAttribute('aria-label', 'Focus mode');
    // In the Coding tab the top bar (Run, Submit, Stop, clock) is hidden in
    // focus, so the pill carries them; each proxies the real button.
    bar.innerHTML = `
      <span class="fp-code">
        <span class="fp-timer" role="timer" aria-live="off"></span>
        <button type="button" data-proxy="runBtn" title="Run (Ctrl+Enter)">▷ Run</button>
        <button type="button" data-proxy="submitBtn" class="fp-submit" title="Submit (Ctrl+Shift+Enter)">↑ Submit</button>
        <button type="button" data-proxy="startBtn" title="Start a timed mock interview">▶ Start</button>
        <button type="button" data-proxy="stopBtn" class="fp-stop" title="End the interview and get the write-up">■ Stop</button>
      </span>
      <button type="button" data-act="side" title="Show or hide the list (L)">☰ List</button>
      <button type="button" data-act="exit" title="Show the top bar again (Esc)">⤢ Exit</button>`;
    bar.addEventListener('click', e => {
      const proxy = e.target.closest('button[data-proxy]');
      if (proxy) { $(proxy.dataset.proxy)?.click(); sync(); return; }
      const act = e.target.closest('button')?.dataset.act;
      if (act === 'exit') set(false);
      if (act === 'side') {
        // REALQ keeps its own list switch; in focus the pill drives that one.
        const on = document.body.classList.toggle('focus-side');
        if (on && document.body.dataset.mode === 'realq') window.realqShowSide?.(true);
      }
    });
    document.body.appendChild(bar);
    return bar;
  }

  /** Mirrors the real controls' state into the pill (clock, disabled, tooltips). */
  function sync() {
    if (!bar || !document.body.classList.contains('focus')) return;
    const coding = document.body.dataset.mode === 'coding';
    bar.classList.toggle('fp-coding', coding);
    if (!coding) return;
    const running = !!window.QF_SESSION?.running;
    bar.classList.toggle('fp-running', running);
    const t = $('timer');
    const timer = bar.querySelector('.fp-timer');
    timer.textContent = t?.textContent || '';
    timer.title = t?.title || '';
    timer.classList.toggle('warn', !!t?.classList.contains('warn'));
    // Practice view has no interview clock: no timer, no Start/Stop.
    const practice = document.documentElement.dataset.coding !== 'interview';
    timer.hidden = practice;
    bar.querySelectorAll('button[data-proxy]').forEach(b => {
      const real = $(b.dataset.proxy);
      if (!real) { b.hidden = true; return; }
      b.disabled = real.disabled;
      b.title = real.title || b.title;
      const clock = b.dataset.proxy === 'startBtn' || b.dataset.proxy === 'stopBtn';
      b.hidden = clock && practice ? true : b.dataset.proxy === 'startBtn' ? running : b.dataset.proxy === 'stopBtn' ? !running : false;
    });
  }
  setInterval(sync, 500);

  function set(on) {
    document.body.classList.toggle('focus', on);
    if (on) { pill(); sync(); } else document.body.classList.remove('focus-side');
    $('focusBtn')?.setAttribute('aria-pressed', String(on));
    try { sessionStorage.setItem(KEY, on ? '1' : '0'); } catch { /* private mode */ }
    // Editors and players size themselves to the pane; tell them it changed.
    window.dispatchEvent(new Event('resize'));
  }
  const toggle = () => set(!document.body.classList.contains('focus'));

  /** URL of a page on its own, in focus mode. */
  const url = (view, id) => `/?view=${encodeURIComponent(view)}${id ? `&id=${encodeURIComponent(id)}` : ''}&focus=1`;

  function popout(view, id) {
    const w = window.open(url(view, id), '_blank');
    if (w) w.opener = null;
  }

  /** The ⛶ button page heads render; delegated, so any module can print it. */
  const btn = (view, id, title = 'Open this page on its own, full screen') =>
    `<button type="button" class="ghost focus-pop" data-view="${esc(view)}" data-id="${esc(id || '')}" title="${esc(title)}" aria-label="${esc(title)}">⛶</button>`;

  document.addEventListener('click', e => {
    const b = e.target.closest('.focus-pop');
    if (b) { e.preventDefault(); popout(b.dataset.view, b.dataset.id); }
  });
  document.addEventListener('keydown', e => {
    // Escape exits focus even from the editor; the letter shortcuts skip text fields.
    if (e.key === 'Escape' && document.body.classList.contains('focus')) { set(false); return; }
    if (e.target.closest?.('input, textarea, select, [contenteditable]')) return;
    if (e.key === 'l' && document.body.classList.contains('focus') && document.body.dataset.mode !== 'realq') document.body.classList.toggle('focus-side');
    else if (e.key === 'f' && !e.metaKey && !e.ctrlKey && !e.altKey && document.body.dataset.mode !== 'coding') toggle();
  });

  function init() {
    $('focusBtn')?.addEventListener('click', toggle);
    const p = new URLSearchParams(location.search);
    let on = p.get('focus') === '1';
    if (!on) { try { on = sessionStorage.getItem(KEY) === '1'; } catch { /* fine */ } }
    if (on) set(true);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  return { set, toggle, popout, btn, url, sync };
})();
