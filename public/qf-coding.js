/* Coding, split in two:
 *  - Coding practice: minimal — the problem, the editor, Run / Submit / Debug,
 *    hints, Solution and Animate. No interviewer, timer or mock controls.
 *  - Coding interview: the timed mock — AI interviewer, Start / Stop, the
 *    Google-realistic option, pacing and the write-up.
 * Same page underneath; <html data-coding="practice|interview"> decides what
 * shows, so nothing in the coding engine changes.
 */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const root = document.documentElement;
  const mockRunning = () => Boolean(window.QF_SESSION?.running) || ($('stopBtn') && !$('stopBtn').disabled);

  function setFlavour(f) {
    // A running mock always stays in interview view, whatever was clicked.
    root.dataset.coding = mockRunning() ? 'interview' : f;
    paintBanner();
    window.QF?.paintNav?.();
  }

  // The shape of a 45-minute Google round (as app.js PHASES), scaled to the length.
  const PHASES = [['Intro', 5], ['Clarify &amp; approach', 15], ['Code', 35], ['Test &amp; follow-up', 45]];
  /** The mock length the Start dialog will offer: the last one chosen (app.js 'mockPrefs'). */
  function mockMinutes() {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem('mockPrefs') || '{}') || {}; } catch { /* defaults */ }
    return ['30', '45', '60'].includes(String(saved.minutes)) ? Number(saved.minutes) : 45;
  }
  function stepsHtml(min) {
    // Rounded at the boundaries so the steps always add up to the length.
    let prev = 0;
    return PHASES.map(([label, end], i) => {
      const at = Math.round((end / 45) * min), n = at - prev; prev = at;
      return `<li>${label} (${n}${i ? '' : ' min'})</li>`;
    }).join('');
  }

  function paintBanner() {
    const pane = $('promptPane');
    if (!pane) return;
    let b = $('qfCiBanner');
    if (!b) {
      b = document.createElement('div');
      b.id = 'qfCiBanner'; b.className = 'qf-ci';
      pane.prepend(b);
    }
    const running = mockRunning();
    const q = window.currentQuestion;
    // At Start the session state may not be published yet; the Start dialog
    // has already saved the chosen length to 'mockPrefs' by then.
    const runMin = window.QF_SESSION?.running ? Math.round((window.QF_SESSION.durationMs || 0) / 60000) : 0;
    const min = running && runMin ? runMin : mockMinutes();
    b.innerHTML = running
      ? `<div class="qf-ci-row"><b>Coding interview in progress</b><span class="qf-muted"> · ${min} minutes</span><span class="qf-muted">Talk through your approach before you code. Stop ends it and opens the write-up.</span></div>`
      : `<div class="qf-ci-row">
          <div><b>Coding interview</b><span class="qf-muted"> · ${min} minutes with an AI interviewer, scored like a Google round${q ? ` · on <b>${String(q.title || '').replace(/</g, '&lt;')}</b>` : ''}</span></div>
          <div class="qf-ci-act">
            <button type="button" class="qf-b sm" id="qfCiRandom">Random Google medium</button>
            <button type="button" class="qf-b sm pri" id="qfCiStart">Start interview</button>
          </div></div>
         <ol class="qf-ci-steps">${stepsHtml(min)}</ol>`;
    $('qfCiStart')?.addEventListener('click', () => $('startBtn')?.click());
    $('qfCiRandom')?.addEventListener('click', async () => {
      try {
        const r = await fetch('/api/google'); const d = await r.json();
        if (!r.ok) throw new Error(d.error || 'failed');
        // /api/google returns { questions: { '30d': [...], '3m': [...] } } — arrays per list.
        const seen = new Set(), list = [];
        for (const qs of Object.values(d.questions || {})) {
          for (const x of (Array.isArray(qs) ? qs : qs?.questions || [])) {
            if (String(x.difficulty).toLowerCase() !== 'medium' || x.paidOnly || seen.has(x.slug)) continue;
            seen.add(x.slug); list.push(x);
          }
        }
        // Prefer a different question from the one already open.
        const pool = list.length > 1 ? list.filter(x => x.slug !== window.currentQuestion?.slug) : list;
        const pick = pool[Math.floor(Math.random() * pool.length)];
        if (!pick) { window.QF?.toast?.('No Google medium questions found — choose one from the list.'); return; }
        window.QFCoding.keep = true;
        try { await window.openQuestion?.(pick.slug, pick.title); } finally { window.QFCoding.keep = false; }
        root.dataset.coding = 'interview'; paintBanner(); window.QF?.paintNav?.();
      } catch { window.QF?.toast?.('Could not pick a question — choose one from the list.'); }
    });
  }

  function boot() {
    if (!root.dataset.coding) root.dataset.coding = 'practice';
    window.QFCoding = { setFlavour, flavour: () => root.dataset.coding };
    // Starting or stopping a mock repaints the banner and the menu highlight.
    const stop = $('stopBtn');
    if (stop) new MutationObserver(() => { if (mockRunning()) root.dataset.coding = 'interview'; paintBanner(); window.QF?.paintNav?.(); })
      .observe(stop, { attributes: true, attributeFilter: ['disabled'] });
    window.addEventListener('question-changed', paintBanner);
    // Opening a problem from a list is practice, unless a mock is running.
    const oq = window.openQuestion;
    if (oq && !oq.qf) {
      window.openQuestion = async (...a) => { if (!mockRunning() && !window.QFCoding.keep) root.dataset.coding = 'practice'; const r = await oq(...a); paintBanner(); window.QF?.paintNav?.(); return r; };
      window.openQuestion.qf = true;
    }
    paintBanner();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
