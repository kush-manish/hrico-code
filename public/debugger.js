/* LeetCode-style step debugger for the coding tab.
 *
 * The server traces the whole run once (/api/debug) and returns every step
 * with locals, watch values and stdout progress; this module replays that
 * trace: step forward/back, continue to breakpoint, with the current line
 * highlighted in the editor and breakpoints toggled from the gutter.
 * Python only — the judge teaches in Python and so does the tracer.
 */
(function () {
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const ta = $('code');
  const gutter = $('gutter');
  const codeArea = $('codeArea');

  const state = {
    active: false,
    trace: null,        // {steps, stdout, result, error, truncated}
    idx: 0,
    breakpoints: new Set(),
    watch: [],
    running: false,
  };

  // ------------------------------------------------------------ edit DOM ---

  const hl = document.createElement('div');
  hl.id = 'dbgLine';
  hl.className = 'hidden';
  codeArea.insertBefore(hl, codeArea.firstChild);

  const marks = document.createElement('div');
  marks.id = 'dbgMarks';
  gutter.style.position = 'relative';
  gutter.appendChild(marks);

  const panel = document.createElement('div');
  panel.id = 'dbgPanel';
  panel.className = 'hidden';
  $('console').insertBefore(panel, $('tab-input'));

  function lineMetrics() {
    const cs = getComputedStyle(ta);
    return { pad: parseFloat(cs.paddingTop) || 12, lh: parseFloat(cs.lineHeight) || 19 };
  }

  // ---------------------------------------------------------- breakpoints ---

  gutter.addEventListener('click', ev => {
    const { pad, lh } = lineMetrics();
    const y = ev.clientY - gutter.getBoundingClientRect().top + ta.scrollTop;
    const line = Math.floor((y - pad) / lh) + 1;
    const total = ta.value.split('\n').length;
    if (line < 1 || line > total) return;
    if (state.breakpoints.has(line)) state.breakpoints.delete(line);
    else state.breakpoints.add(line);
    drawMarks();
    render();   // refresh the "N breakpoints" hint (no-op when not debugging)
  });

  function drawMarks() {
    // editor.js render() rewrites gutter.textContent, which drops this overlay.
    if (marks.parentElement !== gutter) gutter.appendChild(marks);
    const { pad, lh } = lineMetrics();
    let html = '';
    for (const line of state.breakpoints) {
      html += `<i class="dbg-bp" style="top:${pad + (line - 1) * lh + lh / 2 - 4 - ta.scrollTop}px"></i>`;
    }
    if (state.active && state.trace?.steps?.length) {
      const cur = state.trace.steps[state.idx];
      if (cur) html += `<i class="dbg-arrow" style="top:${pad + (cur.line - 1) * lh - ta.scrollTop}px">▶</i>`;
    }
    marks.innerHTML = html;
  }

  function drawLine() {
    if (!state.active || !state.trace?.steps?.length) { hl.classList.add('hidden'); return; }
    const cur = state.trace.steps[state.idx];
    if (!cur) { hl.classList.add('hidden'); return; }
    const { pad, lh } = lineMetrics();
    hl.style.top = `${pad + (cur.line - 1) * lh - ta.scrollTop}px`;
    hl.style.height = `${lh}px`;
    hl.classList.remove('hidden');
    // keep the current line on screen
    const top = pad + (cur.line - 1) * lh;
    if (top < ta.scrollTop + 10) ta.scrollTop = Math.max(0, top - 3 * lh);
    else if (top > ta.scrollTop + ta.clientHeight - 2 * lh) ta.scrollTop = top - ta.clientHeight / 2;
  }

  ta.addEventListener('scroll', () => { drawLine(); drawMarks(); });

  // --------------------------------------------------------------- panel ---

  function controlsHtml() {
    const n = state.trace?.steps?.length || 0;
    return `
      <div class="dbg-bar">
        <button id="dbgRestart" title="Back to the first step">⏮</button>
        <button id="dbgBack" title="Step back">⬅</button>
        <button id="dbgFwd" title="Step forward">➡</button>
        <button id="dbgCont" title="Continue to next breakpoint">▶▶</button>
        <input id="dbgSlider" type="range" min="0" max="${Math.max(0, n - 1)}" value="${state.idx}">
        <span class="dbg-pos">${n ? `${state.idx + 1} / ${n}` : '—'}</span>
        <span class="spacer"></span>
        <span class="dbg-hint">${state.breakpoints.size ? `${state.breakpoints.size} breakpoint${state.breakpoints.size > 1 ? 's' : ''}` : 'Click the gutter to set breakpoints'}</span>
        <button id="dbgStop" class="dbg-stop" title="Stop debugging">✕ Stop</button>
      </div>`;
  }

  function render() {
    if (!state.active) return;
    const t = state.trace;
    if (!t) {
      panel.innerHTML = `${controlsHtml()}<p class="dbg-wait">Tracing your code…</p>`;
      return;
    }
    if (t.error) {
      panel.innerHTML = `${controlsHtml()}
        <div class="dbg-cols"><div class="dbg-col dbg-err-col">
          <h5>Error</h5><pre class="dbg-pre dbg-err">${esc(t.error)}</pre>
        </div></div>`;
      wire();
      return;
    }
    const cur = t.steps[state.idx] || { locals: {}, watch: {}, out: 0 };
    const atEnd = state.idx >= t.steps.length - 1;
    const stdoutNow = t.stdout.slice(0, cur.out);
    const kv = (obj, cls) => Object.keys(obj).length
      ? Object.entries(obj).map(([k, v]) =>
          `<div class="dbg-kv ${cls}"><span class="dbg-k">${esc(k)}</span><span class="dbg-v">${esc(String(v).replace(/TreeNode\((.*?)#\d+\)/g, "TreeNode($1)"))}</span></div>`).join('')
      : '<p class="dbg-none">—</p>';
    panel.innerHTML = `${controlsHtml()}
      <div class="dbg-cols">
        <div class="dbg-col">
          <h5>Local variables ${cur.func && cur.func !== '<module>' ? `· <code>${esc(cur.func)}()</code>` : ''}</h5>
          ${kv(cur.locals, '')}
          ${cur.event === 'return' ? `<div class="dbg-kv dbg-ret"><span class="dbg-k">return</span><span class="dbg-v">${esc(cur.retval ?? '')}</span></div>` : ''}
          ${cur.event === 'exception' ? `<div class="dbg-kv dbg-exc"><span class="dbg-k">raises</span><span class="dbg-v">${esc(cur.exc ?? '')}</span></div>` : ''}
        </div>
        <div class="dbg-col">
          <h5>Watch expressions</h5>
          ${kv(cur.watch, '')}
          <form id="dbgWatchForm" class="dbg-watch-form">
            <input id="dbgWatchInput" type="text" placeholder="e.g. len(seen) or nums[i:]" maxlength="200">
            <button type="submit" class="ghost">Add</button>
          </form>
          ${state.watch.map((w, i) => `<button class="dbg-watch-del" data-i="${i}" title="Remove">× ${esc(w)}</button>`).join('')}
        </div>
        <div class="dbg-col">
          <h5>Stdout ${t.truncated ? '· trace truncated at 3000 steps' : ''}</h5>
          <pre class="dbg-pre">${esc(stdoutNow) || '—'}</pre>
          ${atEnd ? `<h5>Result</h5><pre class="dbg-pre dbg-result">${esc(t.result ?? '')}</pre>` : ''}
        </div>
      </div>`;
    wire();
    drawLine();
    drawMarks();
  }

  function wire() {
    $('dbgRestart') && ($('dbgRestart').onclick = () => { state.idx = 0; render(); });
    $('dbgBack') && ($('dbgBack').onclick = () => { if (state.idx > 0) { state.idx--; render(); } });
    $('dbgFwd') && ($('dbgFwd').onclick = () => {
      if (state.trace && state.idx < state.trace.steps.length - 1) { state.idx++; render(); }
    });
    $('dbgCont') && ($('dbgCont').onclick = () => {
      const steps = state.trace?.steps || [];
      for (let i = state.idx + 1; i < steps.length; i++) {
        if (state.breakpoints.has(steps[i].line)) { state.idx = i; render(); return; }
      }
      state.idx = Math.max(0, steps.length - 1);   // no breakpoint ahead: run to end
      render();
    });
    $('dbgStop') && ($('dbgStop').onclick = stop);
    const slider = $('dbgSlider');
    if (slider) slider.oninput = () => { state.idx = Number(slider.value); render(); };
    const form = $('dbgWatchForm');
    if (form) form.onsubmit = ev => {
      ev.preventDefault();
      const val = $('dbgWatchInput').value.trim();
      if (!val || state.watch.includes(val) || state.watch.length >= 8) return;
      state.watch.push(val);
      saveWatch();
      start(true);          // re-trace so every step carries the new expression
    };
    panel.querySelectorAll('.dbg-watch-del').forEach(b => b.onclick = () => {
      state.watch.splice(Number(b.dataset.i), 1);
      saveWatch();
      start(true);
    });
  }

  const watchKey = () => `dbgWatch:${window.currentQuestion?.slug || ''}`;
  function saveWatch() {
    try { localStorage.setItem(watchKey(), JSON.stringify(state.watch)); } catch { /* private mode */ }
  }
  function loadWatch() {
    try { state.watch = JSON.parse(localStorage.getItem(watchKey()) || '[]').slice(0, 8); }
    catch { state.watch = []; }
  }

  // ------------------------------------------------------------- session ---

  async function start(keepPosition = false) {
    const q = window.currentQuestion;
    if (!q || state.running) return;
    const keptIdx = keepPosition ? state.idx : 0;
    state.active = true;
    state.running = true;
    state.trace = null;
    panel.classList.remove('hidden');
    document.querySelectorAll('#console .tabpane').forEach(p => p.classList.add('hidden'));
    render();
    try {
      const res = await fetch('/api/debug', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: q.slug,
          code: window.Editor.value,
          dataInput: $('testInput').value,
          watch: state.watch,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Debug run failed.');
      state.trace = data;
      state.idx = Math.min(keptIdx, Math.max(0, (data.steps?.length || 1) - 1));
    } catch (e) {
      state.trace = { steps: [], stdout: '', result: null, error: e.message, truncated: false };
      state.idx = 0;
    }
    state.running = false;
    render();
  }

  function stop() {
    state.active = false;
    state.trace = null;
    panel.classList.add('hidden');
    document.querySelectorAll('#console .tabpane').forEach(p => p.classList.remove('hidden'));
    hl.classList.add('hidden');
    drawMarks();
  }

  window.stopDebugger = () => { if (state.active) stop(); };

  // Editing the code invalidates the recorded trace.
  ta.addEventListener('input', () => { if (state.active) stop(); });

  // -------------------------------------------------------------- button ---

  const btn = document.createElement('button');
  btn.id = 'debugBtn';
  btn.className = 'ghost';
  btn.textContent = '🐞 Debug';
  btn.title = 'Step through your code locally with breakpoints and watches (Python)';
  $('runBtn').parentElement.insertBefore(btn, $('runBtn'));

  function syncButton() {
    // Google realistic mode locks the debugger for the session; app.js owns
    // that lock and its tooltip, so leave the button alone while it holds.
    if (window.codingAidsLocked?.()) return;
    const py = $('langSel').value === 'python3';
    btn.disabled = !py;
    btn.title = py
      ? 'Step through your code locally with breakpoints and watches'
      : 'The debugger runs locally in Python — switch Language to Python 3';
  }
  window.syncDebugButton = syncButton;
  $('langSel').addEventListener('change', () => { syncButton(); stop(); });
  syncButton();

  btn.onclick = () => {
    if (state.active) { stop(); return; }
    if (window.codingAidsLocked?.()) return;
    if (window.QF_SESSION?.realistic) window.noteCodingAid?.('Debugger');
    loadWatch();
    start();
  };

  // New question: clear the session and its breakpoints.
  window.addEventListener('question-changed', () => { state.breakpoints.clear(); stop(); });
  // Code replaced (Load from History, Reset): old line numbers mean nothing.
  window.addEventListener('editor-replaced', () => { state.breakpoints.clear(); drawMarks(); render(); });
})();
