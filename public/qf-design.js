/* QuantFlash designs: the ten directions from the design review, selectable at
 * any time. Each one is a skin (colours, type, corners) plus a layout
 * (top tabs, left rail, or command palette first). Also the ⌘K palette,
 * which works in every design.
 */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = {
    get: k => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
  };

  // id, name, idea, best for, layout, fonts to load, preview swatch [bg, surface, accent, text]
  const DESIGNS = [
    ['qf', 'QuantFlash (recommended)', 'The combined design: Zen workspace, Nordic readability, live status bar and coach.', 'Everyday prep', 'top',
      'Atkinson+Hyperlegible:wght@400;700&family=Lexend:wght@500;600;700&family=JetBrains+Mono:wght@400;600', ['#f4f7fb', '#e8eef6', '#2c5d9c', '#14202e']],
    ['qf-calm', '01 · Calm Focus', 'Quiet notes-app feel; problems read like an article.', 'Long reading sessions', 'rail',
      'IBM+Plex+Sans:wght@400;600&family=Newsreader:opsz,wght@6..72,500;6..72,600&family=IBM+Plex+Mono:wght@400;600', ['#faf8f3', '#f1ede4', '#34507d', '#1f1d1a']],
    ['qf-terminal', '02 · Quant Terminal', 'Trading-desk density, amber highlights, keyboard first.', 'HFT / quant prep', 'top',
      'JetBrains+Mono:wght@400;600;700&family=Space+Mono:wght@700', ['#0b0d10', '#12161b', '#f5a524', '#e3e8ee']],
    ['qf-editorial', '03 · Editorial', 'Your day as a front page: lead story, columns, hairlines.', 'Planning the day', 'rail',
      'Fraunces:opsz,wght@9..144,600;9..144,700&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600&family=JetBrains+Mono:wght@400', ['#fbfaf7', '#f2efe8', '#7a1f1f', '#151515']],
    ['qf-coach', '04 · Coach-first', 'Soft and friendly; the AI coach is front and centre.', 'Behavioural & Googleyness', 'top',
      'DM+Sans:opsz,wght@9..40,400;9..40,600;9..40,700&family=DM+Serif+Display&family=DM+Mono:wght@400;500', ['#f6f7f5', '#eceee9', '#0f766e', '#18201d']],
    ['qf-mission', '05 · Mission Control', 'Countdown, telemetry and status lights on deep navy.', 'Last-week intensity', 'top',
      'Space+Grotesk:wght@500;700&family=IBM+Plex+Sans:wght@400;600&family=IBM+Plex+Mono:wght@400;600', ['#0a1020', '#0f1830', '#3b8bff', '#e6ecff']],
    ['qf-swiss', '06 · Swiss Grid', 'Black on white, big numbers, one red for what matters.', 'No-distraction focus', 'top',
      'Archivo:wght@400;600;800&family=IBM+Plex+Mono:wght@400;600', ['#ffffff', '#f3f3f3', '#d1001f', '#0a0a0a']],
    ['qf-keys', '07 · Keyboard-first', 'Dark dev tool; ⌘K palette instead of menus.', 'Fast navigation', 'palette',
      'Onest:wght@400;600;700&family=JetBrains+Mono:wght@400;600', ['#111214', '#17181b', '#a78bfa', '#e7e8ea']],
    ['qf-path', '08 · Path', 'A roadmap with streaks and a weekly goal.', 'Motivation & habit', 'rail',
      'Bricolage+Grotesque:opsz,wght@12..96,600;12..96,800&family=Plus+Jakarta+Sans:wght@400;600;700&family=JetBrains+Mono:wght@400', ['#fbfaf5', '#f1efe6', '#0f766e', '#1b1f1c']],
    ['qf-zen', '09 · Zen Workspace', 'Graphite and mint; the coding workspace gets the screen.', 'Deep coding practice', 'palette',
      'Figtree:wght@400;600;700&family=Fira+Code:wght@400;600', ['#16181b', '#1c1f23', '#8fd3b0', '#e6e9ec']],
    ['qf-nordic', '10 · Nordic Clarity', 'Largest text, big buttons, status as icon + number.', 'Easiest to read', 'top',
      'Atkinson+Hyperlegible:wght@400;700&family=Lexend:wght@500;600;700&family=IBM+Plex+Mono:wght@400;600', ['#eef2f7', '#e2e8f0', '#3b5e8c', '#1b2533']],
  ].map(([id, name, idea, best, layout, fonts, sw]) => ({ id, name, idea, best, layout, fonts, sw }));
  const byId = id => DESIGNS.find(d => d.id === id);

  function loadFonts(d) {
    if (!d || !d.fonts) return;
    const href = `https://fonts.googleapis.com/css2?family=${d.fonts}&display=swap`;
    let link = $('qfFonts');
    if (!link) { link = document.createElement('link'); link.id = 'qfFonts'; link.rel = 'stylesheet'; document.head.appendChild(link); }
    if (link.getAttribute('href') !== href) link.setAttribute('href', href);
  }

  function currentLayout(d) {
    const pref = store.get('qf.layout');
    return pref && pref !== 'auto' ? pref : (d ? d.layout : 'top');
  }

  function apply(id, { persist = true } = {}) {
    const d = byId(id) || byId('qf');
    const root = document.documentElement;
    root.setAttribute('data-skin', d.id);
    loadFonts(d);
    if (persist) store.set('skin', d.id);
    const sel = $('skinSel');
    if (sel && [...sel.options].some(o => o.value === d.id)) sel.value = d.id;
    placeRail();
    window.QF?.paintBar?.();
  }

  function placeRail() { /* sidebar layout is CSS-only now */ }
  function paintRail() { /* kept for callers */ }

  // ---------------------------------------------------------- the picker --
  function preview(d) {
    const [bg, surf, acc, text] = d.sw;
    const rail = d.layout === 'rail';
    return `<div class="qf-design-prev" style="background:${bg};${rail ? '' : 'grid-template-columns:1fr;grid-template-rows:14px 1fr'}" aria-hidden="true">
      <i style="background:${surf};${rail ? '' : 'height:14px'}"></i>
      <div style="display:grid;gap:5px;align-content:start">
        <i style="height:10px;width:60%;background:${text};opacity:.85"></i>
        <i style="height:6px;width:90%;background:${text};opacity:.35"></i>
        <i style="height:6px;width:75%;background:${text};opacity:.35"></i>
        <i style="height:16px;width:38%;background:${acc};margin-top:4px"></i>
      </div></div>`;
  }

  function openPicker() {
    closeModal();
    const cur = document.documentElement.getAttribute('data-skin');
    const theme = document.documentElement.getAttribute('data-theme');
    const lay = store.get('qf.layout') || 'auto';
    const back = document.createElement('div');
    back.className = 'qf-modal-back'; back.id = 'qfModal';
    back.innerHTML = `
      <div class="qf-modal" role="dialog" aria-modal="true" aria-labelledby="qfPickTitle">
        <div class="qf-modal-head">
          <div><h2 id="qfPickTitle">Choose your design</h2>
          <p class="qf-muted" style="margin:4px 0 0">The recommended QuantFlash design plus ten directions from the design review. Your choice is saved to your account.</p></div>
          <button type="button" class="qf-x" data-close aria-label="Close">✕</button>
        </div>
        <div class="qf-picker-opts">
          <span class="qf-muted">Mode</span>
          <div class="qf-seg" role="group" aria-label="Light or dark">
            <button type="button" data-theme="light" aria-pressed="${theme === 'light'}">Light</button>
            <button type="button" data-theme="dark" aria-pressed="${theme === 'dark'}">Dark</button>
          </div>
        </div>
        <div class="qf-designs">
          ${DESIGNS.map(d => `
            <button type="button" class="qf-design" data-design="${d.id}" aria-pressed="${d.id === cur}">
              ${preview(d)}
              <span class="qf-design-body"><b>${esc(d.name)}</b><span>${esc(d.idea)}</span><em>Best for: ${esc(d.best)}</em></span>
            </button>`).join('')}
        </div>
      </div>`;
    document.body.appendChild(back);
    const sync = () => {
      const s = document.documentElement.getAttribute('data-skin'), t = document.documentElement.getAttribute('data-theme'), l = store.get('qf.layout') || 'auto';
      back.querySelectorAll('[data-design]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.design === s)));
      back.querySelectorAll('[data-theme]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.theme === t)));
      back.querySelectorAll('[data-layout]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.layout === l)));
    };
    back.querySelectorAll('[data-design]').forEach(b => { b.onclick = () => { apply(b.dataset.design); sync(); }; });
    back.querySelectorAll('[data-theme]').forEach(b => {
      b.onclick = () => {
        document.documentElement.setAttribute('data-theme', b.dataset.theme); store.set('theme', b.dataset.theme); sync();
        const t = $('themeBtn'); if (t) t.textContent = b.dataset.theme === 'dark' ? '\u2600' : '\u263E';   // keep the header toggle's icon true
      };
    });
    back.querySelectorAll('[data-layout]').forEach(b => {
      b.onclick = () => { store.set('qf.layout', b.dataset.layout); apply(document.documentElement.getAttribute('data-skin')); sync(); };
    });
    wireModal(back);
    back.querySelector('[aria-pressed="true"].qf-design, .qf-design')?.focus({ preventScroll: true });
  }

  // --------------------------------------------------------- ⌘K palette --
  function actions() {
    const out = [];
    for (const g of window.QF?.groups || []) for (const [id, label] of g.items) {
      // Same route as the sidebar, so a full-page view (approach, stories)
      // is closed instead of staying on top of the page just opened.
      if (window.QF.visible(id) && window.QF.enabled(id)) out.push({ label: `Go to ${label}`, hint: g.label, run: () => window.QF.open(id) });
    }
    // The sprint/drill actions belong to the Google (MAANG) plan; on the HFT track they would open an empty Today page.
    const onHft = $('trackSel')?.value === 'hft';
    if (!onHft) {
    out.push({ label: 'Start today\'s sprint task', hint: 'Today', run: () => { $('modeHome')?.click(); setTimeout(() => window.QFSprint?.startNext?.(), 60); } });
    out.push({ label: 'Pattern drill (2 minutes)', hint: 'Drill', run: () => { $('modeHome')?.click(); setTimeout(() => window.QFSprint?.drill?.(), 60); } });
    out.push({ label: 'Recall flashcards', hint: 'Drill', run: () => { $('modeHome')?.click(); setTimeout(() => window.QFSprint?.flash?.(), 60); } });
    out.push({ label: 'Googleyness STAR practice', hint: 'Drill', run: () => { $('modeHome')?.click(); setTimeout(() => window.QFSprint?.star?.(), 60); } });
    }
    const tr = $('trackSel')?.value === 'hft' ? 'maang' : 'hft';
    out.push({ label: `Switch to the ${tr.toUpperCase()} track`, hint: 'Track', run: () => window.QF?.setTrack?.(tr) });
    out.push({ label: 'Plans & your week', hint: 'Today', run: () => window.QFSprint?.plansModal?.('list') });
    out.push({ label: 'Watch a pattern animation', hint: 'Learn', run: () => { $('modeHome')?.click(); setTimeout(() => window.QFSprint?.gallery?.(), 60); } });
    if (window.QFBuddy?.wake) out.push({ label: 'Show Nibble', hint: 'Helper', run: () => window.QFBuddy.wake() });
    out.push({ label: 'Choose design', hint: 'Appearance', run: openPicker });
    out.push({ label: 'Toggle light / dark', hint: 'Appearance', run: () => $('themeBtn')?.click() });
    if (window.QF?.user) out.push({ label: 'Sign out', hint: 'Account', run: () => window.QF.logout() });
    return out;
  }
  function openPalette() {
    closeModal();
    const all = actions();
    const back = document.createElement('div');
    back.className = 'qf-modal-back'; back.id = 'qfModal';
    back.innerHTML = `<div class="qf-modal qf-pal" role="dialog" aria-modal="true" aria-label="Command palette">
      <label class="qf-sr" for="qfPalIn">Search actions</label>
      <input id="qfPalIn" placeholder="Type a page, action or problem (e.g. 77)…" autocomplete="off" role="combobox" aria-expanded="true" aria-controls="qfPalList">
      <ul id="qfPalList" role="listbox"></ul></div>`;
    document.body.appendChild(back);
    const input = $('qfPalIn'), list = $('qfPalList');
    let shown = all, sel = 0;
    const paint = () => {
      input.setAttribute('aria-activedescendant', shown.length ? `qfPalO${sel}` : '');
      list.innerHTML = shown.map((a, i) => `<li role="option" id="qfPalO${i}" aria-selected="${i === sel}"><button type="button" tabindex="-1" data-i="${i}" class="${i === sel ? 'sel' : ''}">${esc(a.label)}<span>${esc(a.hint)}</span></button></li>`).join('') ||
        '<li class="qf-muted" style="padding:12px 14px">No match</li>';
      list.querySelectorAll('[data-i]').forEach(b => { b.onclick = () => run(+b.dataset.i); });
      list.querySelector('.sel')?.scrollIntoView({ block: 'nearest' });
    };
    const run = i => { const a = shown[i]; if (!a) return; closeModal(); a.run(); };
    // Problems too: "77", "combinations", "two sum" open in the Coding tab;
    // anything not in our set is fetched from LeetCode when picked.
    let qSeq = 0, qTimer = 0, pending = false, enterQueued = false;
    const openQ = (slug, title) => window.openQuestion?.(slug, title).catch?.(() => {});
    const lookup = async term => {
      window.QF?.toast?.(`Looking up “${term}” on LeetCode…`);
      try {
        const r = await fetch(`/api/lookup?q=${encodeURIComponent(term)}`);
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || 'Not found');
        openQ(d.slug, `${d.id ? d.id + '. ' : ''}${d.title || d.slug}`);
      } catch (e) { window.QF?.toast?.(e.message); }
    };
    const searchQuestions = q => {
      clearTimeout(qTimer);
      if (!q) { pending = false; return; }
      const my = ++qSeq; pending = true;
      qTimer = setTimeout(async () => {
        try {
          const d = await fetch(`/api/search?q=${encodeURIComponent(q)}`).then(r => (r.ok ? r.json() : { local: [], leetcode: [] }));
          if (my !== qSeq) return;
          const qs = [...(d.local || []).slice(0, 8), ...(d.leetcode || []).slice(0, 4)].map(x => ({
            label: `${x.id ? x.id + '. ' : ''}${x.title}`,
            hint: `${x.difficulty || ''}${x.lists === 'leetcode' ? ' · from LeetCode' : ' · Problem'}`,
            run: () => openQ(x.slug, `${x.id ? x.id + '. ' : ''}${x.title}`),
          }));
          const num = q.replace(/^#/, '');
          if (/^\d+$/.test(num) && !qs.some(x => x.label.startsWith(num + '. '))) qs.unshift({ label: `Look up problem ${num} on LeetCode`, hint: 'Problem', run: () => lookup(num) });
          const acts = all.filter(a => (a.label + ' ' + a.hint).toLowerCase().includes(q));
          shown = /^#?\d+$/.test(q) ? [...qs, ...acts] : [...acts, ...qs]; sel = 0; paint();
        } catch { /* actions only */ }
        if (my === qSeq) { pending = false; if (enterQueued) { enterQueued = false; run(sel); } }
      }, 160);
    };
    input.oninput = () => {
      const q = input.value.toLowerCase().trim();
      shown = q ? all.filter(a => (a.label + ' ' + a.hint).toLowerCase().includes(q)) : all; sel = 0; paint();
      searchQuestions(q);
    };
    input.onkeydown = e => {
      if (e.key === 'ArrowDown') { sel = Math.min(sel + 1, shown.length - 1); paint(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { sel = Math.max(sel - 1, 0); paint(); e.preventDefault(); }
      else if (e.key === 'Enter') {
        e.preventDefault();
        // Typed "77" and hit Enter before the search came back: open problem 77, not the first menu action.
        const q = input.value.trim().replace(/^#/, '');
        if (pending && /^\d+$/.test(q)) { clearTimeout(qTimer); qSeq++; pending = false; closeModal(); lookup(q); }
        else if (pending) enterQueued = true;
        else run(sel);
      }
    };
    paint(); wireModal(back); input.focus();
  }

  // ------------------------------------------------------------ modals --
  let lastFocus = null, onEsc = null;
  function wireModal(back) {
    lastFocus = document.activeElement;
    // Escape closes it even when a click inside left focus on the page body.
    onEsc = e => { if (e.key === 'Escape' && $('qfModal') === back && !back.contains(document.activeElement)) { closeModal(); e.stopPropagation(); } };
    document.addEventListener('keydown', onEsc);
    back.addEventListener('click', e => { if (e.target === back || e.target.closest('[data-close]')) closeModal(); });
    back.addEventListener('keydown', e => {
      if (e.key === 'Escape') { closeModal(); e.stopPropagation(); }
      if (e.key === 'Tab') {   // keep focus inside the dialog
        const f = [...back.querySelectorAll('button, input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter(x => !x.disabled && x.offsetParent);
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { f[f.length - 1].focus(); e.preventDefault(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { f[0].focus(); e.preventDefault(); }
      }
    });
  }
  function closeModal() {
    if (onEsc) { document.removeEventListener('keydown', onEsc); onEsc = null; }
    const m = $('qfModal'); if (m) { m.remove(); lastFocus?.focus?.(); }
  }

  // -------------------------------------------------------------- boot --
  function boot() {
    const top = document.querySelector('.bar-top');
    if (top && !$('qfCmd')) {
      const b = document.createElement('button');
      b.type = 'button'; b.id = 'qfCmd'; b.className = 'qf-kbd-btn'; b.setAttribute('aria-label', 'Open command palette');
      b.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><span class="qf-kbd-label">Search</span><kbd>⌘K</kbd>';
      b.onclick = openPalette;
      const user = $('qfUser');
      (user ? user.before(b) : top.appendChild(b));
      const d = document.createElement('button');
      d.type = 'button'; d.id = 'qfDesignBtn'; d.className = 'qf-kbd-btn'; d.setAttribute('aria-label', 'Choose design');
      d.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="13.5" cy="6.5" r="1.5"/><circle cx="17.5" cy="10.5" r="1.5"/><circle cx="8.5" cy="7.5" r="1.5"/><circle cx="6.5" cy="12.5" r="1.5"/><path d="M12 2a10 10 0 1 0 0 20c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.3 0-1.1.9-2 2-2h2.4A5.6 5.6 0 0 0 22 9.8C22 5.5 17.5 2 12 2z"/></svg><span class="qf-kbd-label">Design</span>';
      d.onclick = openPicker;
      b.before(d);
    }
    // The old "Look" select keeps working; it now lists the ten designs too.
    const sel = $('skinSel');
    if (sel && !sel.querySelector('optgroup')) {
      const og = document.createElement('optgroup'); og.label = 'QuantFlash designs';
      DESIGNS.forEach(d => { const o = document.createElement('option'); o.value = d.id; o.textContent = d.name; og.appendChild(o); });
      sel.prepend(og);
      sel.addEventListener('change', () => { if (byId(sel.value)) apply(sel.value);  });
    }
    const s = document.documentElement.getAttribute('data-skin');
    if (byId(s)) apply(s, { persist: false });
    document.addEventListener('keydown', e => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); $('qfModal') ? closeModal() : openPalette(); }
    });
    window.addEventListener('resize', placeRail);
    const old = document.querySelector('.modeSwitch');
    if (old) new MutationObserver(paintRail).observe(old, { subtree: true, attributes: true, attributeFilter: ['aria-selected'] });
    $('trackSel')?.addEventListener('change', () => setTimeout(paintRail, 0));
    setTimeout(placeRail, 300);
  }

  window.QFDesign = { DESIGNS, apply, openPicker, openPalette, closeModal, paintRail };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
