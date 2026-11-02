/* Interview history, kept under localStorage 'interviewHistory'.
 *
 * The app is behind sign-in and qf-shell.js syncs every non-device key to the
 * signed-in account on the server, so this list follows the user across their
 * devices. The read/write surface below is narrow on purpose so it can be
 * repointed at a dedicated server API later without touching the callers.
 */
window.History = (function () {
  const KEY = 'interviewHistory';
  // Entries now carry full reports - judge output, both transcripts, the
  // scorecard - so each is larger and the cap is lower to stay well inside
  // the ~5 MB localStorage budget.
  const MAX_ENTRIES = 80;
  const MAX_STAR = 300;
  const MAX_CODE = 24_000;
  const MAX_TRANSCRIPT_CHARS = 40_000;

  function read() {
    try {
      const raw = localStorage.getItem(KEY);
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch {
      return [];   // corrupt or unavailable storage must not break the app
    }
  }

  function write(list) {
    try {
      localStorage.setItem(KEY, JSON.stringify(list));
      return true;
    } catch (err) {
      // Quota exceeded: drop the oldest quarter and try once more rather than
      // failing the save outright.
      try {
        const trimmed = list.slice(0, Math.floor(list.length * 0.75));
        localStorage.setItem(KEY, JSON.stringify(trimmed));
        return true;
      } catch {
        return false;
      }
    }
  }

  function clip(s, n) { return typeof s === 'string' ? s.slice(0, n) : ''; }

  function save(entry) {
    const list = read();
    const row = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      savedAt: Date.now(),
      ...entry,
    };
    if (row.code) row.code = clip(row.code, MAX_CODE);
    if (Array.isArray(row.transcript)) {
      let budget = MAX_TRANSCRIPT_CHARS;
      row.transcript = row.transcript.map(m => {
        const content = clip(m.content, Math.max(0, budget));
        budget -= content.length;
        return { role: m.role, content };
      }).filter(m => m.content);
    }
    list.unshift(row);
    // STAR practice rows are small: they get their own budget, so practising
    // never pushes an interview session out (or the other way round).
    let sessions = 0, stars = 0;
    write(list.filter(r => (r.type === 'star' ? ++stars <= MAX_STAR : ++sessions <= MAX_ENTRIES)));
    try { window.dispatchEvent(new CustomEvent('history-saved', { detail: { type: row.type } })); } catch { /* old browser */ }
    return row.id;
  }

  /** Folds a scorecard into an entry saved moments earlier, so a write-up
   *  that arrives after the session does not become a separate row. */
  function attachScore(id, score) {
    if (!id || !score) return false;
    const rows = read();
    const row = rows.find(r => r.id === id);
    if (!row) return false;
    row.score = score;
    write(rows);
    return true;
  }

  /** Merges fields into an existing row (the STAR drill adds its review and rewrite to one row). */
  function update(id, patch) {
    const rows = read();
    const row = id && rows.find(r => r.id === id);
    if (!row) return false;
    Object.assign(row, patch);
    write(rows);
    try { window.dispatchEvent(new CustomEvent('history-saved', { detail: { type: row.type } })); } catch { /* old browser */ }
    return true;
  }

  const list = () => read();
  const get = id => read().find(r => r.id === id) || null;

  function remove(id) {
    write(read().filter(r => r.id !== id));
  }

  function clear() {
    try { localStorage.removeItem(KEY); } catch { /* nothing to do */ }
  }

  /** Everything the progress panel draws, derived from the stored rows only.
   *  - series: every scored session (coding write-up or behavioural card),
   *    oldest first, as { at, type, percent, title }.
   *  - behavioural: average per Googleyness / behavioural dimension (0-4).
   *  - weakTopics: the coding topics that appear most in sessions that did
   *    not end accepted, worst first, at most three.
   *  - mocks: coding + behavioural sessions done. */
  /** Imported or older rows may carry a non-array here; never let one row break the whole tab. */
  const arr = v => (Array.isArray(v) ? v : []);
  function progress() {
    const rows = read();
    const at = r => r.endedAt || r.startedAt || r.savedAt || 0;
    const series = rows
      .filter(r => Number.isFinite(r.score?.percent))
      .map(r => ({ at: at(r), type: r.type, percent: Math.max(0, Math.min(100, r.score.percent)),
        title: r.type === 'coding' ? (r.title || r.slug || 'Coding') : (r.category || r.question || 'Behavioural') }))
      .sort((a, b) => a.at - b.at);

    const dims = new Map();
    for (const r of rows) {
      if (r.type !== 'behavioural') continue;
      for (const d of arr(r.score?.dimensions)) {
        if (!Number.isFinite(d?.score)) continue;
        const cur = dims.get(d.id) || { id: d.id, label: d.label || d.id, sum: 0, n: 0 };
        cur.sum += d.score; cur.n += 1;
        dims.set(d.id, cur);
      }
    }
    const behavioural = [...dims.values()].map(v => ({ id: v.id, label: v.label, avg: v.sum / v.n, n: v.n }));

    const topicName = t => (typeof t === 'string' ? t : t?.name || '').trim();
    const seen = new Map();
    for (const r of rows) {
      if (r.type !== 'coding') continue;
      for (const t of new Set(arr(r.topics).map(topicName).filter(Boolean))) {
        const cur = seen.get(t) || { topic: t, failed: 0, total: 0 };
        cur.total += 1;
        if (!r.accepted) cur.failed += 1;
        seen.set(t, cur);
      }
    }
    const weakTopics = [...seen.values()].filter(t => t.failed > 0)
      .sort((a, b) => b.failed - a.failed || (b.failed / b.total) - (a.failed / a.total) || a.topic.localeCompare(b.topic))
      .slice(0, 3);

    const coding = rows.filter(r => r.type === 'coding').length;
    const bhv = rows.filter(r => r.type === 'behavioural').length;
    return { series, behavioural, weakTopics, mocks: coding + bhv, coding, bhv,
      failedCoding: rows.filter(r => r.type === 'coding' && !r.accepted).length };
  }

  /** Aggregates for the summary strip. */
  function stats() {
    const rows = read();
    const coding = rows.filter(r => r.type === 'coding');
    const bhv = rows.filter(r => r.type === 'behavioural');
    const accepted = coding.filter(r => r.accepted).length;

    const dimTotals = new Map();
    // Signal averages span both interview types; they use different rubrics,
    // so they are keyed by dimension id and never mixed.
    for (const r of rows) {
      for (const d of arr(r.score?.dimensions)) {
        if (!Number.isFinite(d?.score)) continue;     // an unscored signal must not turn the average into NaN
        const cur = dimTotals.get(d.id) || { label: d.label, sum: 0, n: 0 };
        cur.sum += d.score; cur.n += 1;
        dimTotals.set(d.id, cur);
      }
    }
    const perSignal = [...dimTotals.entries()]
      .map(([id, v]) => ({ id, label: v.label, avg: v.sum / v.n }))
      .sort((a, b) => a.avg - b.avg);

    const scored = rows.filter(r => Number.isFinite(r.score?.percent));
    return {
      total: rows.length,
      coding: coding.length,
      behavioural: bhv.length,
      accepted,
      acceptRate: coding.length ? Math.round((accepted / coding.length) * 100) : null,
      scoredCount: scored.length,
      avgPercent: scored.length
        ? Math.round(scored.reduce((a, r) => a + r.score.percent, 0) / scored.length)
        : null,
      perSignal,
      totalMinutes: Math.round(rows.reduce((a, r) => a + (r.durationSec || 0), 0) / 60),
    };
  }

  /** Merge rows from an export. Existing ids win, so re-importing the same
   *  file is a no-op rather than a duplicator. */
  function importRows(rows) {
    if (!Array.isArray(rows)) throw new Error('expected a JSON array of sessions');
    const valid = rows.filter(r => r && typeof r === 'object' && !Array.isArray(r)
      && (r.type === 'coding' || r.type === 'behavioural' || r.type === 'star'))
      .map(r => {
        // Clean the shape so a hand-edited or old export cannot break rendering.
        const o = { ...r };
        if (typeof o.id === 'number') o.id = String(o.id);
        if (typeof o.id !== 'string' || !o.id) o.id = `imp-${o.startedAt || o.savedAt || ''}-${Math.random().toString(36).slice(2, 8)}`;
        if (o.topics != null && !Array.isArray(o.topics)) delete o.topics;
        if (o.score != null && (typeof o.score !== 'object' || Array.isArray(o.score))) delete o.score;
        if (o.score && o.score.dimensions != null && !Array.isArray(o.score.dimensions)) delete o.score.dimensions;
        for (const k of ['startedAt', 'endedAt', 'savedAt']) if (o[k] != null && !Number.isFinite(new Date(o[k]).getTime())) delete o[k];
        return o;
      });
    if (!valid.length) throw new Error('no coding or behavioural sessions in that file');
    const existing = read();
    const seen = new Set(existing.map(r => r.id));
    const added = valid.filter(r => !seen.has(r.id));
    const merged = [...existing, ...added]
      .sort((a, b) => (b.startedAt || b.savedAt || 0) - (a.startedAt || a.savedAt || 0))
      .slice(0, MAX_ENTRIES);
    write(merged);
    return { added: added.length, skipped: valid.length - added.length };
  }

  return { save, update, list, get, remove, clear, stats, progress, importRows, attachScore, MAX_ENTRIES };
})();

/* History tab rendering. */
(function () {
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let filter = 'all';
  const open = new Set();

  const REC = {
    strong_no_hire: ['Strong no hire', 'var(--red)'], no_hire: ['No hire', 'var(--red)'],
    lean_hire: ['Lean hire', 'var(--orange)'], hire: ['Hire', 'var(--green)'],
    strong_hire: ['Strong hire', 'var(--green)'],
  };

  function when(ts) {
    const d = new Date(ts);
    if (!ts || !Number.isFinite(d.getTime())) return '—';
    const days = Math.floor((Date.now() - ts) / 86400000);
    const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (days === 0) return `Today ${time}`;
    if (days === 1) return `Yesterday ${time}`;
    if (days < 7) return `${days} days ago`;
    return d.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
  }
  const mmss = s => `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;

  function renderStats() {
    const st = window.History.stats();
    if (!st.total) { $('hsStats').innerHTML = ''; return; }
    const weakest = st.perSignal[0];
    const tile = (v, l) => `<div class="hs-tile"><div class="hs-v">${v}</div><div class="hs-l">${l}</div></div>`;
    $('hsStats').innerHTML =
      tile(st.total, 'sessions') +
      tile(`${st.totalMinutes}m`, 'time practised') +
      (st.coding ? tile(`${st.acceptRate}%`, `accepted (${st.coding} coding)`) : '') +
      (st.scoredCount ? tile(`${st.avgPercent}%`, `avg score (${st.scoredCount} scored)`) : '') +
      (weakest ? tile(weakest.avg.toFixed(1), `weakest: ${esc(weakest.label)}`) : '');
  }

  // ------------------------------------------------------- progress panel --
  const day = ts => new Date(ts).toLocaleDateString([], { day: 'numeric', month: 'short' });

  /** Inline SVG line chart of score percent per session. Text alternatives:
   *  the aria-label summarises it and a table below lists every point. */
  function chartSvg(series, width) {
    // Drawn at the card's real pixel width so the axis text stays legible
    // on a phone instead of being scaled down with the viewBox.
    const W = Math.max(260, Math.round(width || 560)), H = W < 420 ? 180 : 220, L = 40, R = 14, T = 14, B = 30;
    const iw = W - L - R, ih = H - T - B;
    const n = series.length;
    const x = i => L + (n === 1 ? iw / 2 : (i * iw) / (n - 1));
    const y = v => T + ih - (v / 100) * ih;
    const grid = [0, 25, 50, 75, 100].map(v => `
      <line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="hp-gl"/>
      <text x="${L - 8}" y="${y(v) + 4}" text-anchor="end" class="hp-axis">${v}%</text>`).join('');
    const path = series.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.percent).toFixed(1)}`).join(' ');
    const dots = series.map((p, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(p.percent).toFixed(1)}" r="4.5"
        class="hp-dot ${p.type}"><title>${esc(day(p.at))} · ${p.type} · ${p.percent}%</title></circle>`).join('');
    const ticks = n > 1
      ? `<text x="${x(0)}" y="${H - 8}" class="hp-axis" text-anchor="start">${esc(day(series[0].at))}</text>
         <text x="${x(n - 1)}" y="${H - 8}" class="hp-axis" text-anchor="end">${esc(day(series[n - 1].at))}</text>`
      : `<text x="${x(0)}" y="${H - 8}" class="hp-axis" text-anchor="middle">${esc(day(series[0].at))}</text>`;
    const first = series[0], last = series[n - 1];
    const avg = Math.round(series.reduce((a, p) => a + p.percent, 0) / n);
    const label = n === 1
      ? `Score per session: one scored session, ${last.percent}% on ${day(last.at)}.`
      : `Score per session over ${n} scored sessions: from ${first.percent}% on ${day(first.at)} to ${last.percent}% on ${day(last.at)}, average ${avg}%.`;
    return `<svg class="hp-chart" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}" preserveAspectRatio="xMidYMid meet">
      ${grid}
      ${n > 1 ? `<path d="${path}" class="hp-line"/>` : ''}
      ${dots}${ticks}
    </svg>`;
  }

  function renderProgress() {
    let host = $('hsProgress');
    if (!host) {
      const stats = $('hsStats');
      if (!stats) return;
      host = document.createElement('section');
      host.id = 'hsProgress';
      host.className = 'hp-panel';
      host.setAttribute('aria-labelledby', 'hpTitle');
      stats.insertAdjacentElement('afterend', host);
    }
    const p = window.History.progress();
    if (!p.mocks) { host.innerHTML = ''; host.hidden = true; return; }
    host.hidden = false;
    const s = p.series;
    const avg = s.length ? Math.round(s.reduce((a, x) => a + x.percent, 0) / s.length) : null;
    const best = s.length ? Math.max(...s.map(x => x.percent)) : null;
    const last = s.length ? s[s.length - 1].percent : null;
    const trend = s.length > 1 ? last - s[0].percent : null;

    const chart = s.length
      ? `<div class="hp-chart-box">${chartSvg(s)}</div>
         <p class="hp-legend"><span class="hp-key coding"></span>Coding <span class="hp-key behavioural"></span>Behavioural</p>
         <p class="hp-nums">Latest <strong>${last}%</strong> · best <strong>${best}%</strong> · average <strong>${avg}%</strong>${
           trend != null ? ` · ${trend >= 0 ? 'up' : 'down'} <strong>${Math.abs(trend)}</strong> points since the first` : ''}</p>
         <details class="hp-data"><summary>Show the numbers (${s.length} session${s.length === 1 ? '' : 's'})</summary>
           <table><thead><tr><th scope="col">Date</th><th scope="col">Type</th><th scope="col">Session</th><th scope="col">Score</th></tr></thead>
           <tbody>${s.slice().reverse().map(x => `<tr><td>${esc(day(x.at))}</td><td>${esc(x.type)}</td><td>${esc(x.title)}</td><td>${x.percent}%</td></tr>`).join('')}</tbody></table>
         </details>`
      : `<p class="hs-empty">No scored sessions yet. End a coding interview with a write-up or score a behavioural answer to start the trend.</p>`;

    const dims = p.behavioural.length
      ? `<ul class="hp-dims">${p.behavioural.map(d => `<li>
          <span class="hp-dim-label">${esc(d.label)}</span>
          <span class="hp-dim-v">${d.avg.toFixed(1)} / 4</span>
          <span class="hs-bar" aria-hidden="true"><i style="width:${(d.avg / 4) * 100}%"></i></span></li>`).join('')}</ul>`
      : `<p class="hs-empty">No behavioural sessions scored yet.</p>`;

    const weak = p.weakTopics.length
      ? `<ol class="hp-weak">${p.weakTopics.map(t => `<li><strong>${esc(t.topic)}</strong>
          <span>${t.failed} not accepted of ${t.total} attempt${t.total === 1 ? '' : 's'}</span></li>`).join('')}</ol>`
      : `<p class="hs-empty">${p.coding ? 'No failed coding attempts with topic tags yet.' : 'No coding sessions yet.'}</p>`;

    host.innerHTML = `
      <div class="hp-head">
        <h2 id="hpTitle">Progress</h2>
        <div class="hp-count" aria-label="${p.mocks} mocks done"><strong>${p.mocks}</strong> mocks done
          <span>${p.coding} coding · ${p.bhv} behavioural</span></div>
      </div>
      <div class="hp-grid">
        <div class="hp-card hp-trend"><h3>Score per session</h3>${chart}</div>
        <div class="hp-card"><h3>Behavioural average by dimension</h3>${dims}</div>
        <div class="hp-card"><h3>Weakest coding topics</h3>${weak}</div>
      </div>`;
    fitChart();
  }

  /** Redraws the chart at the width its box actually has. */
  function fitChart() {
    const box = document.querySelector('#hsProgress .hp-chart-box');
    if (!box || !box.clientWidth) return;
    const w = box.clientWidth;
    if (Number(box.dataset.w) === w) return;
    box.dataset.w = String(w);
    box.innerHTML = chartSvg(window.History.progress().series, w);
  }
  let fitTimer = null;
  window.addEventListener('resize', () => { clearTimeout(fitTimer); fitTimer = setTimeout(fitChart, 150); });

  function rowHtml(r) {
    const isCoding = r.type === 'coding';
    const expanded = open.has(r.id);
    let badge;
    if (r.type === 'star') {
      const sc = r.review?.overall?.score, best = r.rewrite?.score;
      badge = `<span class="hs-badge${sc >= 8 ? ' ok' : ''}">${sc != null ? `STAR ${sc}/10` : 'saved'}${best != null ? ` · rewrite ${best}/10` : ''}</span>`;
    } else if (isCoding) {
      if (r.score?.overall) {
        // A written-up session leads with its verdict; the judge result is
        // still in the detail.
        const [lbl, col] = REC[r.score.overall] || ['—', 'var(--muted)'];
        badge = `<span class="hs-badge" style="color:${col};border-color:${col}">${
          esc(lbl)} · ${r.score.total}/${r.score.max}</span>`;
      } else {
        const ok = r.accepted;
        badge = `<span class="hs-badge ${ok ? 'ok' : (r.verdict ? 'bad' : '')}">${
          esc(r.verdict || 'not submitted')}</span>`;
      }
    } else {
      const [label, colour] = REC[r.score?.overall] || ['—', 'var(--muted)'];
      badge = `<span class="hs-badge" style="color:${colour};border-color:${colour}">${
        esc(label)} · ${r.score?.total ?? '?'}/${r.score?.max ?? '?'}</span>`;
    }
    return `
      <div class="hs-row ${expanded ? 'open' : ''}" data-id="${esc(r.id)}">
        <button type="button" class="hs-head" data-toggle="${esc(r.id)}" aria-expanded="${expanded}">
          <span class="hs-type ${r.type}">${isCoding ? 'Coding' : r.type === 'star' ? 'Today · STAR' : 'Behavioural'}</span>
          <span class="hs-title">${esc(isCoding ? `${r.questionId ? `${r.questionId}. ` : ''}${r.title || r.slug || 'Coding session'}` : (r.question || r.category || 'Behavioural session'))}</span>
          ${badge}
          <span class="hs-meta">${mmss(r.durationSec || 0)} · ${when(r.startedAt || r.savedAt)}</span>
        </button>
        ${expanded ? `<div class="hs-detail">${detailHtml(r)}</div>` : ''}
      </div>`;
  }

  function codingReport(r) {
    const res = r.result;
    const pct = v => (v === null || v === undefined) ? '' : ` (beats ${Number(v).toFixed(0)}%)`;
    const judge = res ? `
      <div class="hs-verdict ${r.accepted ? 'ok' : 'bad'}">
        ${esc(res.status || 'Unknown')}
        ${res.passed !== null && res.total !== null
          ? ` · ${res.passed}/${res.total} cases` : ''}
        <span class="hs-verdict-sub">via ${esc(res.mode)}</span>
      </div>
      <dl class="hs-kv">
        ${res.runtime ? `<dt>Runtime</dt><dd>${esc(res.runtime)}${esc(pct(res.runtimePercentile))}</dd>` : ''}
        ${res.memory ? `<dt>Memory</dt><dd>${esc(res.memory)}${esc(pct(res.memoryPercentile))}</dd>` : ''}
      </dl>
      ${res.error ? `<div class="hs-err"><strong>Error</strong><pre>${esc(res.error)}</pre></div>` : ''}
      ${res.lastTestcase ? `<div class="hs-case">
        <div><strong>Failing input</strong><pre>${esc(res.lastTestcase)}</pre></div>
        ${res.actual !== null ? `<div><strong>Your output</strong><pre>${esc(res.actual)}</pre></div>` : ''}
        ${res.expected !== null ? `<div><strong>Expected</strong><pre>${esc(res.expected)}</pre></div>` : ''}
      </div>` : ''}
      ${res.stdout ? `<div><strong>stdout</strong><pre class="hs-code">${esc(res.stdout)}</pre></div>` : ''}`
      : `<p class="hs-empty">No code was run or submitted in this session.</p>`;

    const chat = (r.transcript || []).map(m => `
      <div class="bv-turn ${m.role === 'user' ? 'me' : ''}">
        <div class="bv-who">${m.role === 'user' ? 'You' : 'Interviewer'}</div>
        <div class="bv-text">${esc(m.content)}</div>
      </div>`).join('');

    // The write-up, rendered by the same builder the end-of-interview panel
    // uses, so the saved report and the live one cannot diverge.
    const card = r.score;
    const isFull = !!card?.dimensions?.length && 'anchor' in card.dimensions[0];
    const writeup = isFull && typeof window.scorecardHtml === 'function'
      ? `<div class="hs-report">${safeCard(card)}</div>`
      : '';

    // What the app measured during the mock, saved with the row.
    const p = r.pacing || {};
    const t = sec => (sec == null ? null : `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(Math.round(sec) % 60).padStart(2, '0')}`);
    const facts = [];
    if (r.realistic !== undefined) facts.push(['Format', r.realistic ? 'Google realistic — no running code' : 'Practice mock (aids available)']);
    if (r.aidsUsed !== undefined || Array.isArray(r.aids)) {
      const n = r.aidsUsed ?? (r.aids || []).length;
      facts.push(['Aids used', n ? `${n}${r.aids?.length ? ` — ${r.aids.join(', ')}` : ''}` : '0']);
    }
    if (r.pacing) {
      facts.push(['Time to first code', p.firstCodeSec != null ? `${t(p.firstCodeSec)}${p.codeTargetSec != null ? ` (aim: by ${t(p.codeTargetSec)})` : ''}` : 'No code typed during the interview']);
      facts.push(['Complexity stated', p.complexityStated ? (p.complexityAtSec != null ? `Yes, first at ${t(p.complexityAtSec)}` : 'Yes') : 'Not found in the chat']);
      facts.push(['Phase reached', `${p.phase || '—'} · ${t(p.elapsedSec) || '00:00'} of ${p.durationMin || 45}:00`]);
      if (p.samplesPassSec != null) facts.push(['Samples passed', `at ${t(p.samplesPassSec)}`]);
      facts.push(['Follow-up', p.followUp ? `Asked ${p.followUp}` : 'Not reached']);
    }
    const factsHtml = facts.length
      ? `<dl class="hs-kv hs-facts">${facts.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>` : '';
    // No write-up (it failed, or the page closed first): offer to make one
    // from what was saved.
    const canWrite = !r.score && ((r.transcript || []).length || String(r.code || '').trim());
    const writeNow = canWrite ? `<div class="hs-writeup-now"><p class="hs-empty">This session has no write-up yet.</p>
        <button type="button" class="qf-b pri hs-writeup-btn" data-writeup="${esc(r.id)}">Write it up now</button>
        <span class="hs-writeup-msg" role="status" aria-live="polite"></span></div>` : '';

    return `
      ${writeup}${writeNow}
      ${factsHtml}
      <dl class="hs-kv">
        <dt>Difficulty</dt><dd>${esc(r.difficulty || '—')}</dd>
        <dt>Language</dt><dd>${esc(r.lang || '—')}</dd>
        <dt>Attempts</dt><dd>${r.runs || 0} run, ${r.submits || 0} submit</dd>
        <dt>Ended</dt><dd>${esc(r.endedBy || 'stopped')}</dd>
        ${r.topics?.length ? `<dt>Topics</dt><dd>${esc(r.topics.join(', '))}</dd>` : ''}
      </dl>
      ${judge}
      ${r.transcript?.length ? `<details class="hs-transcript">
        <summary>Interviewer conversation (${r.transcript.length} turns)</summary>
        <div class="bv-log">${chat}</div></details>` : ''}
      <details class="hs-transcript"><summary>Your code (${(r.code || '').split('\n').length} lines)</summary>
        <pre class="hs-code">${esc(r.code || '')}</pre></details>
      <button type="button" class="ghost hs-del" data-del="${esc(r.id)}">Delete</button>`;
  }

  function behaviouralReport(r) {
    // Rendered by the same builder the live scorecard uses, so the saved
    // report is the report - evidence, anchors, model answer and all.
    const card = r.score;
    // Entries saved before full reports were kept have dimensions but no
    // anchor/evidence fields; rendering those through the live builder would
    // print "undefined" into the report, so detect the old shape explicitly.
    const isFull = !!card?.dimensions?.length && 'anchor' in card.dimensions[0];
    const full = (isFull && typeof window.scorecardHtml === 'function')
      ? safeCard(card)
      : `<p class="hs-empty">This session was saved before full reports were kept,
         so only the score is available.</p>`;
    const turns = (r.transcript || []).map(m => `
      <div class="bv-turn ${m.role === 'user' ? 'me' : ''}">
        <div class="bv-who">${m.role === 'user' ? 'You' : 'Interviewer'}</div>
        <div class="bv-text">${esc(m.content)}</div>
      </div>`).join('');
    return `
      <div class="hs-report">${full}</div>
      <details class="hs-transcript"><summary>Transcript (${(r.transcript || []).length} turns)</summary>
        <div class="bv-log">${turns}</div></details>
      <button type="button" class="ghost hs-del" data-del="${esc(r.id)}">Delete</button>`;
  }

  /** The live builder assumes a complete card; a saved one from an older
   *  build (or another tab: Talk, Watch, a coding write-up) may lack a list.
   *  Fill the gaps and never let one odd entry stop the row from opening. */
  function safeCard(card) {
    try {
      return window.scorecardHtml({ strengths: [], improvements: [], dimensions: [], percent: 0, total: '?', max: '?', headline: '', ...card });
    } catch {
      return `<ul class="hp-dims">${(card.dimensions || []).map(d => `<li><span class="hp-dim-label">${esc(d.label || d.id)}</span>
        <span class="hp-dim-v">${Number.isFinite(d.score) ? d.score : '?'} / 4</span></li>`).join('')}</ul>`;
    }
  }
  /** A STAR answer from Today: your words, the reviewer's verdict, and the 10/10 rewrite. */
  function starReport(r) {
    const a = r.answer || {}, rv = r.review, rw = r.rewrite?.rewrite;
    const part = (l, t) => (t ? `<p><b>${l}</b> ${esc(t)}</p>` : '');
    const parts = [['situation', 'Situation'], ['task', 'Task'], ['action', 'Action'], ['result', 'Result'], ['reflection', 'Reflection']];
    const ans = rv?.answers?.[0];
    return `
      <div class="hs-star"><h4>Your answer</h4>${part('S', a.s)}${part('T', a.t)}${part('A', a.a)}${part('R', a.r)}</div>
      ${rv ? `<div class="hs-star"><h4>Review · ${rv.overall?.score ?? '?'}/10</h4>${rv.overall?.summary ? `<p>${esc(rv.overall.summary)}</p>` : ''}
        ${ans ? `<ul>${parts.map(([k, l]) => `<li>${ans[k]?.present ? '✓' : '✕'} <b>${l}</b>${ans[k]?.note ? ` — ${esc(ans[k].note)}` : ''}</li>`).join('')}</ul>` : ''}
        ${ans?.fix ? `<p><b>Fix:</b> ${esc(ans.fix)}</p>` : ''}</div>` : ''}
      ${rw ? `<div class="hs-star"><h4>Framed for 10/10${r.rewrite.score != null ? ` · checked ${r.rewrite.score}/10` : ''}</h4>
        ${parts.map(([k, l]) => part(l, rw[k])).join('')}</div>` : ''}
      <button type="button" class="ghost hs-del" data-del="${esc(r.id)}">Delete</button>`;
  }
  const detailHtml = r => {
    try { return r.type === 'star' ? starReport(r) : r.type === 'coding' ? codingReport(r) : behaviouralReport(r); }
    catch { return `<p class="hs-empty">This session could not be shown in full.</p><button type="button" class="ghost hs-del" data-del="${esc(r.id)}">Delete</button>`; }
  };

  function render() {
    const rows = window.History.list().filter(r => filter === 'all' || r.type === filter);
    renderStats();
    renderProgress();
    $('hsList').innerHTML = rows.length
      ? rows.map(rowHtml).join('')
      : `<p class="hs-empty">No ${filter === 'all' ? '' : filter + ' '}sessions yet.
         Finish a coding interview with Stop, or score a behavioural interview, and it will appear here.</p>`;

    $('hsList').querySelectorAll('[data-toggle]').forEach(b => {
      b.onclick = () => {
        const id = b.dataset.toggle;
        open.has(id) ? open.delete(id) : open.add(id);
        render();
        [...$('hsList').querySelectorAll('[data-toggle]')].find(x => x.dataset.toggle === id)?.focus({ preventScroll: true });
      };
    });
    $('hsList').querySelectorAll('[data-writeup]').forEach(b => {
      b.onclick = e => { e.stopPropagation(); writeUp(b); };
    });
    $('hsList').querySelectorAll('[data-del]').forEach(b => {
      b.onclick = e => {
        e.stopPropagation();
        // One tap used to erase a whole write-up with no way back.
        if (!confirm('Delete this session and its write-up? This cannot be undone.')) return;
        window.History.remove(b.dataset.del);
        open.delete(b.dataset.del);
        render();
      };
    });
  }
  window.renderHistory = render;

  /** Scores a saved coding session the way the end-of-interview panel does
   *  (app.js scoreSession) and folds the card into the row. */
  async function writeUp(btn) {
    const id = btn.dataset.writeup;
    const r = window.History.get(id);
    if (!r || btn.disabled) return;
    const msg = btn.parentElement?.querySelector('.hs-writeup-msg');
    btn.disabled = true;
    btn.textContent = 'Writing it up…';
    if (msg) msg.textContent = 'This takes twenty seconds or so.';
    try {
      const res = await fetch('/api/coding/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: r.title,
          difficulty: r.difficulty,
          transcript: r.transcript || [],
          code: r.code || '',
          lang: r.lang,
          result: r.result || null,
          realistic: !!r.realistic,
          aidsUsed: r.aidsUsed ?? (r.aids || []).length,
          aids: r.aids || [],
          pacing: r.pacing,
          model: window.Settings?.modelFor?.('behaviouralScore'),
        }),
      });
      const card = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(card.error || `Request failed (${res.status})`);
      if (!window.History.attachScore(id, card)) throw new Error('the session is no longer in History');
      open.add(id);
      render();
    } catch (err) {
      if (!btn.isConnected) return;
      btn.disabled = false;
      btn.textContent = 'Write it up now';
      if (msg) msg.textContent = `Could not write it up: ${err.message}. Try again.`;
    }
  }

  function init() {
    if (!$('hsList')) return;
    // The static intro in index.html predates accounts; keep it accurate.
    const lede = document.querySelector('#hsLayout .bv-intro .bv-lede');
    if (lede) lede.textContent = 'Every coding and behavioural session you have finished. ' +
      'Saved to your account and synced across your devices.';
    document.querySelectorAll('.hs-filter').forEach(b => {
      b.setAttribute('aria-pressed', String(b.classList.contains('active')));
      b.onclick = () => {
        filter = b.dataset.type;
        document.querySelectorAll('.hs-filter').forEach(x => { x.classList.toggle('active', x === b); x.setAttribute('aria-pressed', String(x === b)); });
        render();
      };
    });
    // No wholesale clear: sessions are removed one at a time from inside
    // the opened write-up, where it is clear what is being deleted.
    $('hsImport').onclick = () => $('hsFile').click();
    $('hsFile').onchange = async e => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const { added, skipped } = window.History.importRows(JSON.parse(await file.text()));
        render();
        $('hsNote').textContent = `Imported ${added} session${added === 1 ? '' : 's'}` +
          (skipped ? `, skipped ${skipped} already present.` : '.');
      } catch (err) {
        $('hsNote').textContent = `Could not import that file: ${err.message}`;
      }
      $('hsNote').classList.remove('hidden');
      e.target.value = '';
    };

    $('hsExport').onclick = () => {
      const blob = new Blob([JSON.stringify(window.History.list(), null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `interview-history-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
