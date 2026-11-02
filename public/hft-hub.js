/* HFT hub: firms by country/city with levels.fyi pay, per-firm interview loops,
 * a topic map with coding questions, and a streamed AI coach. */
(function () {
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const SYM = { GBP: '£', EUR: '€', USD: '$', CHF: 'CHF ', SGD: 'S$', HKD: 'HK$', AUD: 'A$' };
  const money = (v, cur) => v == null ? '—' : `${SYM[cur] || cur + ' '}${v >= 1e6 ? (v / 1e6).toFixed(2) + 'M' : Math.round(v / 1000) + 'K'}`;
  const LS = { city: 'hub.city', firm: 'hub.firm', type: 'hub.type', chat: 'hub.chat', me: 'hub.me', shortlist: 'hub.shortlist' };
  const get = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } };
  const put = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private */ } };

  // The hub's JPMorgan baseline and first-person prompts describe the box
  // owner (the admin). Everyone else gets neutral wording and no personal
  // claims in the prompts sent to the coach.
  const isOwner = () => window.QF?.user?.role === 'admin';
  const who = (owner, other) => (isOwner() ? owner : other);
  const OWNER_ME = 'SDE3 (VP-level) software engineer at JPMorgan Chase, UK (London). Strong Java / distributed systems. Targeting senior SWE roles at HFT / market makers / quant funds in London and Amsterdam.';
  const firmName = f => (f.id === 'jpmc' ? who('JPMorgan Chase (your baseline)', 'JPMorgan Chase (bank baseline)') : f.name.replace(/\s*\(your baseline\)/i, ''));
  const firmBlurb = f => (f.id === 'jpmc' && isOwner() ? 'Your current employer — shown as the pay baseline to compare offers against.' : f.blurb);

  let cat = null, catP = null;
  const payByCity = {};
  const payErr = {};          // city -> message of the last failed pay load
  const payInflight = {};     // `${city}|${fresh}` -> promise, so callers share one request
  const freshAt = {};         // city -> when ?fresh=1 last succeeded
  const FRESH_TTL = 5 * 60_000;
  const state = {
    view: 'hub', city: get(LS.city, 'london'), firm: get(LS.firm, ''), type: get(LS.type, 'all'), sort: 'pay',
    q: '', topicFilter: 'all', chat: get(LS.chat, []), mode: 'coach', busy: false, abort: null,
    me: get(LS.me, { summary: isOwner() ? OWNER_ME : '' }),
    shortlist: get(LS.shortlist, []),
  };

  async function getJson(url, what) {
    const r = await fetch(url);
    const d = await r.json().catch(() => null);
    if (!r.ok) throw new Error(r.status === 429 ? `too many requests for ${what} just now (429)` : (d?.error || `${what} request failed (${r.status})`));
    if (!d || typeof d !== 'object') throw new Error(`${what}: empty response`);
    return d;
  }
  function loadCatalog() {
    // A failed load must not be cached: drop the promise so Retry refetches.
    if (!catP) catP = getJson('/api/hft/catalog', 'firm list')
      .then(d => { if (!Array.isArray(d.firms) || !Array.isArray(d.locations)) throw new Error('firm list was empty'); return (cat = d); })
      .catch(e => { catP = null; throw e; });
    return catP;
  }
  /** One request per (city, fresh) at a time, and ?fresh=1 at most once per
   *  FRESH_TTL per city unless forced by the Refresh button. */
  function loadPay(city, fresh, force) {
    if (!fresh && payByCity[city]) return Promise.resolve(payByCity[city]);
    if (fresh && !force && payByCity[city] && Date.now() - (freshAt[city] || 0) < FRESH_TTL) return Promise.resolve(payByCity[city]);
    const k = `${city}|${fresh ? 1 : 0}`;
    if (!payInflight[k]) {
      payInflight[k] = getJson(`/api/hft/pay/${encodeURIComponent(city)}${fresh ? '?fresh=1' : ''}`, 'pay')
        .then(d => {
          if (!Array.isArray(d.rows)) throw new Error('pay data was empty');
          payByCity[city] = d; delete payErr[city];
          if (fresh) freshAt[city] = Date.now();
          return d;
        })
        .catch(e => { payErr[city] = e.message; throw e; })
        .finally(() => { delete payInflight[k]; });
    }
    return payInflight[k];
  }
  const firmById = id => cat?.firms.find(f => f.id === id);
  const cityObj = id => { for (const c of cat.locations) for (const x of c.cities) if (x.id === id) return { ...x, country: c.country, flag: c.flag }; return null; };
  const payRow = (firmId, city = state.city) => payByCity[city]?.rows.find(r => r.firm === firmId);

  // ------------------------------------------------------------------ shell --
  function shell(inner) {
    $('hubView').innerHTML = `<div class="hub-wrap">${inner}</div>`;
  }
  function tabs() {
    const t = [['hub', '🏢 Firms & Pay'], ['topics', '📚 Topics & Coding'], ['coach', '🤖 AI Coach']];
    return `<div class="hub-tabs">${t.map(([id, l]) => `<button class="hub-tab${state.view === id ? ' on' : ''}" data-v="${id}">${l}</button>`).join('')}
      <span class="spacer"></span><button class="hub-tab ghost" data-go="hftprep">80-in-8 & Zap-N prep →</button></div>`;
  }
  function bindTabs() {
    $('hubView').querySelectorAll('[data-v]').forEach(b => b.onclick = () => window.setInterviewMode?.(`hft${b.dataset.v}`));
    $('hubView').querySelectorAll('[data-go]').forEach(b => b.onclick = () => window.setInterviewMode?.(b.dataset.go));
  }

  async function renderHub(view) {
    state.view = view || state.view;
    if (!cat) {
      shell(`${tabs()}<div class="hub-loading">Loading firms…</div>`); bindTabs();
      try { await loadCatalog(); } catch (e) {
        shell(`${tabs()}<div class="hub-err" role="alert">Could not load the hub: ${esc(e.message)}.
          <div><button type="button" class="hub-btn qf-retry" id="hubRetry">Retry</button></div></div>`);
        bindTabs();
        $('hubRetry').onclick = () => renderHub(state.view);
        return;
      }
    }
    if (state.view === 'hub') return drawFirms();
    if (state.view === 'topics') return drawTopics();
    return drawCoach();
  }
  window.renderHub = renderHub;

  // ------------------------------------------------------------ firms & pay --
  async function drawFirms() {
    const city = cityObj(state.city) || cityObj('london');
    state.city = city.id;
    const countryChips = cat.locations.map(c => {
      const on = c.cities.some(x => x.id === state.city);
      return `<button class="hub-chip${on ? ' on' : ''}" data-country="${esc(c.code)}">${c.flag} ${esc(c.country)}</button>`;
    }).join('');
    const country = cat.locations.find(c => c.cities.some(x => x.id === state.city));
    const cityChips = country.cities.length > 1
      ? `<div class="hub-row">${country.cities.map(x => `<button class="hub-chip sm${x.id === state.city ? ' on' : ''}" data-city="${esc(x.id)}">${esc(x.name)}</button>`).join('')}</div>` : '';
    const types = ['all', ...new Set(cat.firms.filter(f => f.type !== 'bank').map(f => f.type))];
    shell(`${tabs()}
      <header class="hub-hero">
        <div><div class="hub-kicker">HFT · Market makers · Quant funds</div>
          <h1>${city.flag} Trading firms in ${esc(city.name)}</h1>
          <p class="hub-lede">Pay is software-engineer total compensation from <a href="https://www.levels.fyi" target="_blank" rel="noopener">levels.fyi</a>, converted to ${esc(city.currency)}. ${who('Your JPMC pay is shown as the baseline.', 'JPMorgan Chase is shown as a big-bank baseline for comparison.')}</p></div>
        <div class="hub-stats" id="hubStats"></div>
      </header>
      <div class="hub-filters">
        <div class="hub-row">${countryChips}</div>${cityChips}
        <div class="hub-row">
          ${types.map(t => `<button class="hub-chip sm${state.type === t ? ' on' : ''}" data-type="${t}">${t === 'all' ? 'All types' : esc(cat.types[t] || t)}</button>`).join('')}
          <span class="spacer"></span>
          <input id="hubSearch" class="hub-search" placeholder="Search firm, language, topic…" value="${esc(state.q)}">
          <select id="hubSort" class="hub-select"><option value="pay"${state.sort === 'pay' ? ' selected' : ''}>Sort: median pay</option><option value="tier"${state.sort === 'tier' ? ' selected' : ''}>Sort: tier</option><option value="name"${state.sort === 'name' ? ' selected' : ''}>Sort: name</option></select>
          <button id="hubRefresh" class="hub-btn" title="Fetch missing / stale pay from levels.fyi">↻ Refresh pay</button>
        </div>
      </div>
      <div class="hub-split"><div id="hubGrid" class="hub-grid"></div><aside id="hubFirm" class="hub-firm"></aside></div>`);
    bindTabs();
    $('hubView').querySelectorAll('[data-country]').forEach(b => b.onclick = () => {
      const c = cat.locations.find(x => x.code === b.dataset.country); state.city = c.cities[0].id; put(LS.city, state.city); drawFirms();
    });
    $('hubView').querySelectorAll('[data-city]').forEach(b => b.onclick = () => { state.city = b.dataset.city; put(LS.city, state.city); drawFirms(); });
    $('hubView').querySelectorAll('[data-type]').forEach(b => b.onclick = () => { state.type = b.dataset.type; put(LS.type, state.type); drawGrid(); $('hubView').querySelectorAll('[data-type]').forEach(x => x.classList.toggle('on', x === b)); });
    $('hubSearch').oninput = e => { state.q = e.target.value; drawGrid(); };
    $('hubSort').onchange = e => { state.sort = e.target.value; drawGrid(); };
    $('hubRefresh').onclick = () => refreshPay(true, true);
    drawGrid(); drawFirmPanel();
    refreshPay(false);
  }

  async function refreshPay(fresh, force) {
    const city = state.city;
    const btn = $('hubRefresh');
    if (btn) { btn.disabled = true; btn.textContent = fresh ? '↻ Fetching… (~1s per firm)' : '↻ Loading…'; }
    const redraw = () => { if (state.city === city && state.view === 'hub') { drawGrid(); drawFirmPanel(); } };
    try {
      let d = await loadPay(city, false);
      redraw();
      const missing = d.rows.some(r => r.status === 'pending' || r.stale);
      if (fresh || missing) { d = await loadPay(city, true, force); redraw(); }
    } catch (e) {
      redraw();
    } finally {
      if ($('hubRefresh')) { $('hubRefresh').disabled = false; $('hubRefresh').textContent = '↻ Refresh pay'; }
    }
  }

  function visibleFirms() {
    const q = state.q.trim().toLowerCase();
    let fs = cat.firms.filter(f => f.cities.includes(state.city));
    if (state.type !== 'all') fs = fs.filter(f => f.type === state.type || f.type === 'bank');
    if (q) fs = fs.filter(f => [f.name, f.blurb, f.langs.join(' '), f.topics.join(' '), f.type].join(' ').toLowerCase().includes(q) || f.type === 'bank');
    const med = f => payRow(f.id)?.data?.median || 0;
    const by = { pay: (a, b) => med(b) - med(a), tier: (a, b) => (a.tier || 9) - (b.tier || 9) || med(b) - med(a), name: (a, b) => a.name.localeCompare(b.name) };
    return fs.sort(by[state.sort]);
  }

  function drawGrid() {
    const grid = $('hubGrid'); if (!grid) return;
    const city = cityObj(state.city);
    const all = visibleFirms();
    // The bank baseline card is always kept by the filters; on its own it is
    // not a result, so an empty search says so instead of showing only it.
    const fs = all.some(f => f.type !== 'bank') ? all : [];
    const err = payErr[state.city] && !payByCity[state.city] ? payErr[state.city] : '';
    const base = payRow('jpmc')?.data?.median;
    const meds = fs.filter(f => f.type !== 'bank').map(f => payRow(f.id)?.data?.median).filter(Boolean);
    const top = Math.max(1, ...meds, base || 0);
    if ($('hubStats') && err) {
      $('hubStats').innerHTML = `<div class="hub-err hub-pay-err" role="alert">Pay unavailable: ${esc(err)}.
        <button type="button" class="hub-btn qf-retry" id="hubPayRetry">Retry</button></div>`;
      $('hubPayRetry').onclick = () => refreshPay(false);
    } else if ($('hubStats')) {
      const sorted = [...meds].sort((a, b) => a - b), mid = sorted.length ? sorted[Math.floor(sorted.length / 2)] : null;
      $('hubStats').innerHTML = `<div class="hub-stat"><b>${fs.filter(f => f.type !== 'bank').length}</b><span>firms here</span></div>
        <div class="hub-stat"><b>${money(mid, city.currency)}</b><span>median of firm medians</span></div>
        <div class="hub-stat"><b>${money(base, city.currency)}</b><span>JPMC median (baseline)</span></div>
        <div class="hub-stat"><b>${base && mid ? `${(mid / base).toFixed(1)}×` : '—'}</b><span>uplift vs JPMC</span></div>`;
    }
    grid.innerHTML = fs.map(f => {
      const r = payRow(f.id), d = r?.data;
      const pct = d?.median ? Math.round(100 * d.median / top) : 0;
      const status = !r && err ? '<span class="hub-pill muted">pay unavailable</span>'
        : !r || r.status === 'pending' ? '<span class="hub-pill muted">loading pay…</span>'
        : r.status === 'none' ? '<span class="hub-pill muted">no levels.fyi data here</span>'
        : r.status === 'error' ? '<span class="hub-pill muted">pay unavailable</span>' : '';
      const sl = state.shortlist.includes(f.id);
      return `<article class="hub-card${state.firm === f.id ? ' sel' : ''}${f.type === 'bank' ? ' bank' : ''}" data-firm="${esc(f.id)}" tabindex="0">
        <div class="hub-card-top"><div class="hub-logo">${esc(f.name.split(/\s|\(/)[0].slice(0, 2))}</div>
          <div class="hub-card-name"><b>${esc(firmName(f))}</b><span>${esc(cat.types[f.type] || f.type)}${f.tier ? ` · Tier ${f.tier}` : ''} · ${esc(f.langs.join(', '))}</span></div>
          ${f.type !== 'bank' ? `<button class="hub-star${sl ? ' on' : ''}" data-star="${esc(f.id)}" title="Shortlist">${sl ? '★' : '☆'}</button>` : ''}</div>
        <div class="hub-pay">${d?.median ? `<b>${money(d.median, d.currency)}</b><span>median TC</span>${d.p90 ? `<em>p90 ${money(d.p90, d.currency)}</em>` : ''}` : status}</div>
        <div class="hub-bar"><i style="width:${pct}%"></i>${base && f.type !== 'bank' ? `<u style="left:${Math.round(100 * base / top)}%" title="JPMC median"></u>` : ''}</div>
        <p>${esc(firmBlurb(f))}</p>
      </article>`;
    }).join('') || `<div class="hub-empty" role="status">No firms match${state.q.trim() ? ` “${esc(state.q.trim())}”` : ' these filters'} in ${esc(city.name)}.
        ${state.q.trim() || state.type !== 'all' ? '<div><button type="button" class="hub-btn" id="hubClearFilters">Clear search and filters</button></div>' : ''}</div>`;
    if ($('hubClearFilters')) $('hubClearFilters').onclick = () => {
      state.q = ''; state.type = 'all'; put(LS.type, 'all');
      if ($('hubSearch')) $('hubSearch').value = '';
      $('hubView').querySelectorAll('[data-type]').forEach(x => x.classList.toggle('on', x.dataset.type === 'all'));
      drawGrid();
    };
    grid.querySelectorAll('[data-firm]').forEach(c => {
      c.onclick = e => { if (e.target.closest('[data-star]')) return; state.firm = c.dataset.firm; put(LS.firm, state.firm); grid.querySelectorAll('.hub-card').forEach(x => x.classList.toggle('sel', x === c)); drawFirmPanel(); showPanel(); };
      c.onkeydown = e => { if (e.key === 'Enter') c.click(); };
    });
    grid.querySelectorAll('[data-star]').forEach(b => b.onclick = () => {
      const id = b.dataset.star; state.shortlist = state.shortlist.includes(id) ? state.shortlist.filter(x => x !== id) : [...state.shortlist, id];
      put(LS.shortlist, state.shortlist); drawGrid(); drawFirmPanel();
    });
  }

  // Below 1100px the firm panel stacks under the whole grid: bring it into
  // view on a pick, and give it a way back up to the cards.
  const stacked = () => window.matchMedia?.('(max-width: 1100px)').matches;
  function showPanel() {
    if (!stacked()) return;
    const el = $('hubFirm');
    if (!el) return;
    // Clear the sticky tab bar (and app header) so the firm name is not hidden under them.
    const tabs = $('hubView')?.querySelector('.hub-tabs');
    el.style.scrollMarginTop = `${Math.round((tabs?.getBoundingClientRect().bottom || 60) + 8)}px`;
    requestAnimationFrame(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  function levelsTable(d) {
    if (!d?.levels?.length) return '';
    return `<table class="hub-levels"><thead><tr><th>Level</th><th>Total</th><th>Base</th><th>Bonus</th><th>Stock</th><th>YoE</th></tr></thead><tbody>
      ${d.levels.map(l => `<tr><td>${esc(l.level)}${l.alt ? ` <small>${esc(l.alt)}</small>` : ''}</td><td><b>${money(l.total, d.currency)}</b></td><td>${money(l.base, d.currency)}</td><td>${money(l.bonus, d.currency)}</td><td>${money(l.stock, d.currency)}</td><td>${l.yoe ?? '—'}</td></tr>`).join('')}
    </tbody></table>`;
  }

  function drawFirmPanel() {
    const el = $('hubFirm'); if (!el) return;
    const f = firmById(state.firm) && firmById(state.firm).cities.includes(state.city) ? firmById(state.firm) : null;
    if (!f) {
      const sl = state.shortlist.map(firmById).filter(Boolean);
      el.innerHTML = `<div class="hub-panel-empty"><h3>Pick a firm</h3><p>Click a card to see its interview loop, the topics it tests, coding questions and pay by level.</p>
        ${sl.length ? `<h4>★ Your shortlist</h4><ul class="hub-sl">${sl.map(x => `<li><button data-open="${esc(x.id)}">${esc(firmName(x))}</button></li>`).join('')}</ul>` : ''}
        <button class="hub-btn primary" data-ask="Given my profile, which of the firms in ${esc(cityObj(state.city).name)} should I target first, and why? Rank the top 5 and give a 6-week plan.">🤖 Ask AI which firms fit me</button></div>`;
      bindPanel(el); return;
    }
    const r = payRow(f.id), d = r?.data, base = payRow('jpmc')?.data;
    const uplift = d?.median && base?.median && f.type !== 'bank' ? `<div class="hub-uplift">${(d.median / base.median).toFixed(2)}× ${who('your JPMC baseline median', 'the JPMorgan Chase bank median')} (${money(base.median, base.currency)})</div>` : '';
    el.innerHTML = `<div class="hub-panel">
      ${stacked() ? '<button type="button" class="hub-btn hub-back" id="hubBackToGrid">↑ Back to all firms</button>' : ''}
      <div class="hub-panel-head"><div class="hub-logo lg">${esc(f.name.slice(0, 2))}</div><div><h2>${esc(firmName(f))}</h2><span>${esc(cat.types[f.type] || f.type)} · HQ ${esc(f.hq)}</span></div></div>
      <p>${esc(firmBlurb(f))}</p>
      <div class="hub-tags">${f.cities.map(c => `<span class="hub-pill${c === state.city ? ' on' : ''}">${esc(cityObj(c)?.name || c)}</span>`).join('')}</div>
      <h3>💷 Pay in ${esc(cityObj(state.city).name)}</h3>
      ${d?.median ? `<div class="hub-paybox"><div><b>${money(d.median, d.currency)}</b><span>median</span></div><div><b>${money(d.p25, d.currency)}</b><span>p25</span></div><div><b>${money(d.p75, d.currency)}</b><span>p75</span></div><div><b>${money(d.p90, d.currency)}</b><span>p90</span></div></div>${uplift}${levelsTable(d)}`
        : `<p class="muted">${r?.status === 'none' ? 'levels.fyi has no software-engineer data for this firm here yet.' : payErr[state.city] && !r ? `Pay unavailable: ${esc(payErr[state.city])}.` : 'Pay is loading or unavailable.'}</p>`}
      ${r?.url ? `<a class="hub-link" href="${esc(r.url)}" target="_blank" rel="noopener">Open on levels.fyi ↗</a>` : ''}
      ${f.process.length ? `<h3>🧭 Interview loop (reported)</h3><ol class="hub-steps">${f.process.map(p => `<li>${esc(p)}</li>`).join('')}</ol>` : ''}
      ${f.topics.length ? `<h3>📚 What they test</h3><div class="hub-tags">${f.topics.map(t => `<button class="hub-pill btn" data-ask="Explain '${esc(t)}' the way ${esc(f.name)} would test it in a senior SWE interview, with an example question and a model answer outline." data-mode="explain">${esc(t)}</button>`).join('')}</div>` : ''}
      ${f.coding.length ? `<h3>💻 Coding questions</h3><ul class="hub-qs">${f.coding.map(q => qItem(q)).join('')}</ul>` : ''}
      ${f.type !== 'bank' ? `<div class="hub-actions">
        <button class="hub-btn primary" data-ask="${who("I'm an SDE3 at JPMC in the UK. ", '')}Build me a focused prep plan for ${esc(f.name)} (${esc(cityObj(state.city).name)}): what to study each week, how to pitch my ${who('bank ', '')}background, and red flags to avoid." data-mode="coach">🤖 Plan for ${esc(f.name)}</button>
        <button class="hub-btn" data-ask="Run a mock ${esc(f.name)} senior software engineer interview question for me. Start with the question only." data-mode="mock">🎯 Mock interview</button>
        <button class="hub-btn" data-ask="Compare a ${esc(f.name)} ${esc(cityObj(state.city).name)} senior SWE package with ${who('my JPMC VP package', 'a typical big-bank senior engineer package')}. How do bonuses, deferrals and sign-on work there, and how should I negotiate?" data-mode="negotiate">💷 Offer advice</button>
        ${f.careers ? `<a class="hub-btn" href="${esc(f.careers)}" target="_blank" rel="noopener">Careers ↗</a>` : ''}
        ${f.practice?.length ? `<button class="hub-btn" data-go="hftpractice">⏱ Practice tests</button>` : ''}
      </div>` : ''}
    </div>`;
    bindPanel(el);
    if ($('hubBackToGrid')) $('hubBackToGrid').onclick = () => {
      const card = $('hubGrid')?.querySelector(`[data-firm="${CSS.escape(f.id)}"]`) || $('hubGrid');
      card?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };
  }

  function qItem(q) {
    const diff = q.difficulty ? `<span class="hub-diff ${esc(q.difficulty.toLowerCase())}">${esc(q.difficulty[0] + q.difficulty.slice(1).toLowerCase())}</span>` : '';
    const open = q.local ? `<button class="hub-q-open" data-q="${esc(q.slug)}" data-t="${esc(q.title)}">Solve here</button>` : '';
    return `<li><span>${esc(q.title)}</span>${diff}${open}<a href="https://leetcode.com/problems/${esc(q.slug)}/" target="_blank" rel="noopener">LeetCode ↗</a><button class="hub-q-ai" data-ask="Explain how to solve LeetCode '${esc(q.title)}' and why trading firms like it. Give the key insight, the optimal approach with complexity, and a clean C++ or Java solution." data-mode="explain">🤖</button></li>`;
  }

  function bindPanel(el) {
    el.querySelectorAll('[data-open]').forEach(b => b.onclick = () => { state.firm = b.dataset.open; put(LS.firm, state.firm); drawGrid(); drawFirmPanel(); showPanel(); });
    el.querySelectorAll('[data-ask]').forEach(b => b.onclick = () => askCoach(b.dataset.ask, b.dataset.mode || 'coach'));
    el.querySelectorAll('[data-go]').forEach(b => b.onclick = () => window.setInterviewMode?.(b.dataset.go));
    el.querySelectorAll('[data-q]').forEach(b => b.onclick = () => window.openQuestion?.(b.dataset.q, b.dataset.t));
  }

  // ---------------------------------------------------------- topics & coding --
  const TOPICS = [
    { id: 'cpp', icon: '⚙️', name: 'C++ & low-latency', for: ['optiver', 'hrt', 'jump', 'imc', 'tower', 'citadel'], points: [
      'Value categories, move semantics, RVO/NRVO; rule of 0/3/5.', 'Templates, constexpr, CRTP vs virtual dispatch cost.',
      'Memory: stack vs heap, allocators, object pools, avoiding allocation on the hot path.', 'Cache lines, false sharing, data-oriented design, branch prediction.',
      'std::atomic, memory_order (acquire/release), SPSC lock-free ring buffer.', 'Measuring latency: rdtsc, percentiles (p50/p99/p99.9), jitter sources.'] },
    { id: 'java', icon: '☕', name: 'Java for trading', ownerName: 'Java for trading (from your JPMC stack)', for: ['imc', 'two-sigma', 'drw', 'millennium'], points: [
      'GC tuning, allocation-free code, object reuse, off-heap (Chronicle / Agrona).', 'JIT warm-up, escape analysis, JMH micro-benchmarks.',
      'Disruptor pattern; mechanical sympathy.', 'Concurrency: happens-before, volatile, VarHandles, ConcurrentHashMap internals.'] },
    { id: 'systems', icon: '🖥️', name: 'OS, Linux & networking', for: ['hrt', 'jump', 'optiver', 'citadel', 'tower'], points: [
      'Processes vs threads, context switches, CPU pinning / isolcpus, NUMA.', 'Virtual memory, page faults, huge pages, mmap.',
      'TCP vs UDP; multicast market data; Nagle, kernel bypass (DPDK / Solarflare).', 'syscalls cost, epoll, busy-polling vs interrupts.'] },
    { id: 'market', icon: '📈', name: 'Market microstructure', for: ['optiver', 'imc', 'flow', 'jane-street', 'citadel', 'sig'], points: [
      'Limit order book: bids/asks, price-time priority, matching engine.', 'Market making: spread, inventory risk, adverse selection.',
      'Options basics: calls/puts, put-call parity, delta / gamma / vega intuition.', 'ETFs: NAV, creation/redemption, arbitrage.', 'Latency arbitrage & why microseconds matter.'] },
    { id: 'design', icon: '🏗️', name: 'Trading system design (senior)', for: ['optiver', 'citadel', 'imc', 'gresearch', 'two-sigma', 'drw'], points: [
      'Design an exchange gateway / order router with risk checks.', 'Market-data feed handler: gap detection, recovery, sequencing.',
      'Real-time risk / P&L service; position aggregation.', 'Rate limiter, throttling, kill switch; failover & determinism (event sourcing / replay).'] },
    { id: 'algo', icon: '🧩', name: 'Algorithms & data structures', for: ['jane-street', 'citadel', 'hrt', 'xtx', 'gresearch', 'two-sigma'], points: [
      'Heaps & streaming medians, monotonic queues, sliding windows.', 'Hash maps + linked lists (LRU/LFU), ordered maps (order book levels).',
      'Graphs: BFS/Dijkstra/topological sort.', 'Parsing / interpreters (Jane Street loves these).', 'Clean, tested, extensible code over clever tricks.'] },
    { id: 'prob', icon: '🎲', name: 'Probability & mental math', for: ['optiver', 'sig', 'imc', 'jane-street', 'flow'], points: [
      'Expected value, conditional probability, Bayes.', 'Dice / cards / coin puzzles; linearity of expectation.',
      'Fermi estimation; 80-in-8 speed arithmetic.', 'Market-making games: make a two-sided price, update on information.'] },
    { id: 'behav', icon: '🗣️', name: 'Behavioural for trading firms', for: ['optiver', 'imc', 'citadel', 'jane-street'], points: [
      '"Why trading, why leave your current role?" — ownership, speed of impact, tight feedback loops.', 'Stories: a latency/perf win with numbers; an incident you owned; a decision under uncertainty.',
      'Show you can work directly with traders; small-team ownership.', 'Be honest about what you do not know; firms test intellectual honesty.'] },
  ];
  const TOPIC_Q = {
    cpp: ['lru-cache', 'design-circular-queue', 'min-stack', 'insert-delete-getrandom-o1'],
    java: ['lru-cache', 'time-based-key-value-store', 'task-scheduler'],
    systems: ['network-delay-time', 'course-schedule', 'task-scheduler'],
    market: ['online-stock-span', 'best-time-to-buy-and-sell-stock', 'find-median-from-data-stream', 'sliding-window-maximum', 'number-of-orders-in-the-backlog', 'stock-price-fluctuation'],
    design: ['lru-cache', 'lfu-cache', 'time-based-key-value-store', 'snapshot-array', 'logger-rate-limiter', 'design-hit-counter'],
    algo: ['merge-k-sorted-lists', 'median-of-two-sorted-arrays', 'trapping-rain-water', 'basic-calculator-ii', 'serialize-and-deserialize-binary-tree', 'word-ladder', 'minimum-window-substring', 'count-of-smaller-numbers-after-self'],
    prob: ['random-pick-with-weight', 'max-points-on-a-line'],
    behav: [],
  };

  function topicQs(id) {
    const known = new Map(cat.firms.flatMap(f => f.coding).map(q => [q.slug, q]));
    return (TOPIC_Q[id] || []).map(s => known.get(s) || { slug: s, title: s.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), difficulty: '', local: false });
  }

  function drawTopics() {
    const firms = cat.firms.filter(f => f.type !== 'bank');
    const list = state.topicFilter === 'all' ? TOPICS : TOPICS.filter(t => t.for.includes(state.topicFilter));
    shell(`${tabs()}
      <header class="hub-hero"><div><div class="hub-kicker">What to study</div><h1>Topics & coding for trading-firm SWE loops</h1>
        <p class="hub-lede">Pick a firm to filter. Every topic has an AI explainer and matching coding questions you can solve here or on LeetCode.</p></div></header>
      <div class="hub-filters"><div class="hub-row"><button class="hub-chip sm${state.topicFilter === 'all' ? ' on' : ''}" data-tf="all">All firms</button>
        ${firms.map(f => `<button class="hub-chip sm${state.topicFilter === f.id ? ' on' : ''}" data-tf="${esc(f.id)}">${esc(f.name.split(' (')[0])}</button>`).join('')}</div></div>
      <div class="hub-topics">${list.length ? '' : '<p class="hub-lede">No topic notes for this firm yet — pick "All firms" to see everything.</p>'}${list.map(t => `<section class="hub-topic">
        <h2><span>${t.icon}</span>${esc(isOwner() && t.ownerName ? t.ownerName : t.name)}</h2>
        <div class="hub-tags">${t.for.map(id => `<span class="hub-pill">${esc(firmById(id)?.name.split(' (')[0] || id)}</span>`).join('')}</div>
        <ul class="hub-points">${t.points.map(p => `<li><span>${esc(p)}</span><button class="hub-q-ai" data-ask="Teach me: ${esc(p)} — explain from first principles, give a concrete example (code if relevant), and show how a trading firm would ask about it in a senior SWE interview." data-mode="explain" title="Explain with AI">🤖</button></li>`).join('')}</ul>
        ${topicQs(t.id).length ? `<h3>💻 Practice</h3><ul class="hub-qs">${topicQs(t.id).map(qItem).join('')}</ul>` : ''}
      </section>`).join('')}</div>`);
    bindTabs();
    $('hubView').querySelectorAll('[data-tf]').forEach(b => b.onclick = () => { state.topicFilter = b.dataset.tf; drawTopics(); });
    bindPanel($('hubView'));
  }

  // --------------------------------------------------------------- AI coach --
  const MODES = [
    ['coach', '🧭 Career coach', 'Which firms fit me, how to pitch my background, prep plan'],
    ['explain', '📖 Explain', 'Teach a concept or coding problem'],
    ['mock', '🎯 Mock interview', 'One realistic question, step by step'],
    ['negotiate', '💷 Offers & pay', 'Compare packages, negotiation lines'],
  ];
  const STARTERS = () => [
    ['coach', who('I am an SDE3 at JPMorgan in London. Which HFT / market-making firms should I target first, and what is a realistic 8-week plan?',
      'Which HFT / market-making firms should I target first given my profile, and what is a realistic 8-week plan?')],
    ['coach', who('How do I explain my move from a bank to a trading firm in the "why trading?" question?',
      'How do I explain my move to a trading firm in the "why trading?" question?')],
    ['explain', 'Explain how a limit order book and matching engine work, and how I would implement one in C++.'],
    ['explain', 'Explain memory_order acquire/release with a lock-free SPSC queue example.'],
    ['mock', 'Give me an Optiver-style senior SWE system design question.'],
    ['negotiate', who('How are bonuses structured at Optiver / IMC vs a JPMC VP, and what should my total comp target be in London?',
      'How are bonuses structured at Optiver / IMC vs a big bank, and what is a realistic senior SWE total comp target in London?')],
  ];

  function askCoach(text, mode) {
    state.mode = mode || 'coach';
    window.setInterviewMode?.('hftcoach');
    setTimeout(() => { if ($('hubInput')) { $('hubInput').value = text; send(); } }, 30);
  }

  function md(src) {
    const blocks = [];
    let s = String(src).replace(/```(\w*)\n?([\s\S]*?)(```|$)/g, (_, l, c) => { blocks.push(`<pre><code>${esc(c.replace(/\n$/, ''))}</code></pre>`); return `\u0000${blocks.length - 1}\u0000`; });
    s = esc(s)
      .replace(/^### (.+)$/gm, '<h4>$1</h4>').replace(/^## (.+)$/gm, '<h3>$1</h3>').replace(/^# (.+)$/gm, '<h3>$1</h3>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/`([^`\n]+)`/g, '<code>$1</code>')
      .replace(/^(?:\s*[-*] .+\n?)+/gm, m => `<ul>${m.trim().split('\n').map(l => `<li>${l.replace(/^\s*[-*] /, '')}</li>`).join('')}</ul>`)
      .replace(/^(?:\s*\d+\. .+\n?)+/gm, m => `<ol>${m.trim().split('\n').map(l => `<li>${l.replace(/^\s*\d+\. /, '')}</li>`).join('')}</ol>`)
      .replace(/\n{2,}/g, '<br><br>').replace(/\n/g, '<br>');
    return s.replace(/\u0000(\d+)\u0000/g, (_, i) => blocks[i]);
  }

  function drawCoach() {
    const firms = cat.firms.filter(f => f.type !== 'bank');
    shell(`${tabs()}
      <div class="hub-coach">
        <aside class="hub-coach-side">
          <h3>Mode</h3>
          ${MODES.map(([id, l, s]) => `<button class="hub-mode${state.mode === id ? ' on' : ''}" data-mode-set="${id}"><b>${l}</b><span>${esc(s)}</span></button>`).join('')}
          <h3>Firm context</h3>
          <select id="hubCoachFirm" class="hub-select wide"><option value="">Any firm</option>${firms.map(f => `<option value="${esc(f.id)}"${state.firm === f.id ? ' selected' : ''}>${esc(f.name)}</option>`).join('')}</select>
          <h3>About me</h3>
          <textarea id="hubMe" class="hub-me" rows="5" aria-label="About me" placeholder="Your current role, years of experience, languages, and the firms or cities you are aiming for.">${esc(state.me.summary)}</textarea>
          <p class="muted small">Saved to your account and synced across your devices; sent with each question so answers fit you.</p>
          <button id="hubClear" class="hub-btn">Clear conversation</button>
        </aside>
        <section class="hub-chat">
          <div id="hubLog" class="hub-log"></div>
          <div class="hub-starters" id="hubStarters"></div>
          <div class="hub-compose"><textarea id="hubInput" rows="2" placeholder="Ask about firms, pay, a topic, or say 'mock me'…  (Enter to send, Shift+Enter = new line)"></textarea>
            <button id="hubSend" class="hub-btn primary">Send</button></div>
          <div class="muted small" id="hubVia"></div>
        </section>
      </div>`);
    bindTabs();
    $('hubView').querySelectorAll('[data-mode-set]').forEach(b => b.onclick = () => { state.mode = b.dataset.modeSet; $('hubView').querySelectorAll('[data-mode-set]').forEach(x => x.classList.toggle('on', x === b)); });
    $('hubCoachFirm').onchange = e => { state.firm = e.target.value; put(LS.firm, state.firm); };
    $('hubMe').oninput = e => { state.me = { summary: e.target.value.slice(0, 1200) }; put(LS.me, state.me); };
    $('hubClear').onclick = () => { if (state.abort) state.abort.abort(); state.chat = []; put(LS.chat, []); drawLog(); };
    $('hubSend').onclick = send;
    $('hubInput').onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } };
    drawLog();
  }

  function drawLog(streaming) {
    const log = $('hubLog'); if (!log) return;
    const msgs = streaming ? [...state.chat, streaming] : state.chat;
    log.innerHTML = msgs.length ? msgs.map(m => `<div class="hub-msg ${m.role}"><div class="hub-who">${m.role === 'user' ? 'You' : '🤖 Coach'}</div><div class="hub-bubble">${m.role === 'user' ? esc(m.content).replace(/\n/g, '<br>') : md(m.content || '…')}</div></div>`).join('')
      : `<div class="hub-welcome"><h2>🤖 Your HFT career coach</h2><p>Ask anything about moving ${who('from JPMC ', '')}into trading-firm engineering: which firms fit, how their loops work, any concept explained simply, mock questions, and offer advice. It uses the firm data and pay from this hub.</p></div>`;
    const st = $('hubStarters');
    if (st) {
      st.innerHTML = state.chat.length ? '' : STARTERS().map(([m, t]) => `<button class="hub-starter" data-m="${m}">${esc(t)}</button>`).join('');
      st.querySelectorAll('.hub-starter').forEach(b => b.onclick = () => { state.mode = b.dataset.m; $('hubView').querySelectorAll('[data-mode-set]').forEach(x => x.classList.toggle('on', x.dataset.modeSet === state.mode)); $('hubInput').value = b.textContent; send(); });
    }
    log.scrollTop = log.scrollHeight;
  }

  function payNote() {
    const city = cityObj(state.city), rows = payByCity[state.city]?.rows || [];
    const parts = rows.filter(r => r.data?.median).map(r => `${firmById(r.firm) ? firmName(firmById(r.firm)) : r.firm}: median ${money(r.data.median, r.data.currency)}`);
    return parts.length ? `${city.name} SWE total comp — ${parts.join('; ')}` : '';
  }

  /** "About me" text, or else the resume profile (when switched on) in one paragraph. */
  function aboutMe() {
    if (state.me?.summary?.trim()) return state.me;
    const p = window.Profile?.active();
    if (!p) return null;
    const bits = [p.headline, p.targetRole && `target: ${p.targetRole}`, p.yearsExperience != null && `${p.yearsExperience} yrs experience`, p.location,
      Array.isArray(p.companies) && p.companies.length && `experience: ${p.companies.map(c => [c.role, c.name].filter(Boolean).join(' at ')).join('; ')}`,
      Array.isArray(p.stack) && p.stack.length && `stack: ${p.stack.join(', ')}`].filter(Boolean);
    return bits.length ? { summary: bits.join('. ').slice(0, 1200) } : null;
  }

  async function send() {
    const input = $('hubInput'); if (!input) return;
    const text = input.value.trim();
    if (!text || state.busy) return;
    input.value = '';
    state.chat.push({ role: 'user', content: text });
    state.chat = state.chat.slice(-30);
    const live = { role: 'assistant', content: '' };
    drawLog(live);
    state.busy = true; $('hubSend').disabled = true;
    const ac = new AbortController(); state.abort = ac;
    try {
      if (!payByCity[state.city]) await loadPay(state.city, false).catch(() => {});
      const r = await fetch('/api/hft/coach', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ac.signal,
        body: JSON.stringify({ mode: state.mode, firm: state.firm, messages: state.chat.filter(m => !m.err).slice(-20).map(m => ({ role: m.role, content: m.content })), profile: aboutMe(), payNote: payNote(), model: window.Settings?.modelFor('hftCoach') }),
      });
      if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(r.status === 429 ? 'Too many requests just now (429). Wait a moment and send again.' : (d.error || `Request failed (${r.status})`)); }
      if ($('hubVia')) $('hubVia').textContent = r.headers.get('X-Coach-Model') ? `via ${r.headers.get('X-Coach-Model')}` : '';
      const reader = r.body.getReader(), dec = new TextDecoder(); let buf = '', last = 0;
      for (;;) {
        const { value, done } = await reader.read(); if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf('\n\n')) >= 0) {
          const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 2);
          if (!line.startsWith('data:')) continue;
          const p = line.slice(5).trim(); if (p === '[DONE]') continue;
          try { const d = JSON.parse(p).d; if (d) live.content += d; } catch { /* partial */ }
        }
        if (Date.now() - last > 60) { last = Date.now(); drawLog(live); }
      }
    } catch (e) {
      if (!ac.signal.aborted && !live.content) { live.content = `⚠️ ${e.message}`; live.err = true; }
    } finally {
      state.busy = false; state.abort = null;
      if ($('hubSend')) $('hubSend').disabled = false;
    }
    // Cleared mid-stream: the half reply must not come back into the empty chat.
    if (live.content && !ac.signal.aborted) state.chat.push(live);
    put(LS.chat, state.chat);
    drawLog();
  }
})();
