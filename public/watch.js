/* Watch tab: two agents run an interview while you observe.
 *
 * The point is the communication, not the answer — how a strong candidate
 * opens, what they check before coding, when they volunteer complexity. */
(function () {
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // Two different voices so it reads as two people rather than one narrator.
  // Voices come from Settings → Voice (interviewer / candidate); defaults differ in gender.
  const voiceFor = role => window.Voice?.voiceFor?.(role) || (role === 'candidate' ? 'bm_george' : 'bf_emma');

  /** Who the watched candidate is: you, from your resume, or the generic one. */
  function renderWho() {
    const el = document.getElementById('wtWho');
    if (!el) return;
    const p = window.Profile?.active();
    el.innerHTML = p
      ? `<span class="wt-cand-on">Candidate: <strong>${esc(p.name || 'you')}</strong>${p.headline ? ` — ${esc(p.headline)}` : ''}.</span>
         The answers draw on your resume; the interviewer has read it too. Change this in the Resume tab.`
      : `Candidate: a generic strong candidate. <button class="ln-inline" id="wtUseResume">Upload your resume</button>
         and the candidate becomes you — your systems, your numbers — and the interviewer asks about your CV.`;
    const b = document.getElementById('wtUseResume');
    if (b) b.onclick = () => window.setInterviewMode?.('resume');
  }

  const state = {
    mode: 'coding', question: null, statement: '', category: null,
    transcript: [], running: false, turns: 0, maxTurns: 12, code: '',
    // Off unless this browser can actually speak; set properly on first render.
    speak: null,
    // Each run gets a token. A loop that was awaiting a fetch when Stop was
    // pressed would otherwise resume against a flag that Start had since set
    // back to true, leaving two loops interleaving and cutting each other's
    // speech off mid-sentence.
    run: 0,
  };
  let questions = [];
  let categories = [];
  // Read-only view for the saved-interviews library (qf-watchlib.js).
  window.WatchState = () => state;

  async function loadOptions() {
    if (!questions.length) {
      try {
        const r = await fetch('/api/lists');
        const lists = await r.json();
        const name = lists[0]?.name;
        if (name) {
          const q = await fetch(`/api/lists/${encodeURIComponent(name)}`);
          questions = (await q.json()).slice(0, 400);
        }
      } catch { /* the picker simply stays empty */ }
    }
    if (!categories.length) {
      try {
        const r = await fetch('/api/behavioural/categories');
        categories = (await r.json()).categories || [];
      } catch { /* as above */ }
    }
    renderSetup();
  }

  function renderSetup() {
    const coding = state.mode === 'coding';
    const canSpeak = Boolean(window.Voice?.canSpeak?.());
    if (state.speak === null || !canSpeak) state.speak = canSpeak && state.speak !== false;
    $('wtSetup').innerHTML = `
      <div class="rs-filters wt-modes">
        <button class="wt-mode${coding ? ' active' : ''}" data-mode="coding">Coding</button>
        <button class="wt-mode${coding ? '' : ' active'}" data-mode="behavioural">Behavioural</button>
      </div>
      ${coding
        ? `<select id="wtQ" style="max-width:min(420px, 100%); min-width:0">${questions.map(q =>
            `<option value="${esc(q.slug)}">${esc(q.id)}. ${esc(q.title)} · ${esc(q.difficulty)}</option>`).join('')}</select>`
        : `<select id="wtC" style="max-width:min(420px, 100%); min-width:0">${categories.map(c =>
            `<option value="${esc(c.id)}">${esc(c.label)}</option>`).join('')}</select>`}
      <button id="wtGo" class="primary">Run the interview</button>
      <button id="wtStop" class="ghost" disabled>Stop</button>
      <label class="wt-voice"${canSpeak ? '' : ' title="Speech output is unavailable in this browser"'}><input type="checkbox" id="wtVoice"${state.speak ? ' checked' : ''}${canSpeak ? '' : ' disabled'}>
        Read it aloud${canSpeak ? '' : ' <span class="gl-muted">(unavailable here)</span>'}</label>`;

    document.querySelectorAll('.wt-mode').forEach(b => {
      // Switching mode mid-run would send the rest of a coding run as behavioural turns.
      b.onclick = () => { if (state.running) return; state.mode = b.dataset.mode; renderSetup(); };
    });
    $('wtVoice').onchange = e => {
      state.speak = e.target.checked;
      if (!state.speak) window.Voice?.stopSpeaking();
    };
    $('wtGo').onclick = start;
    $('wtStop').onclick = () => {
      state.running = false;
      state.run++;                           // retire the in-flight loop
      if (state.transcript.some(t => t.speaker === 'candidate')) {
        reportBox().innerHTML = '<button id="wtScoreNow" class="primary">Score what was said so far</button>';
        $('wtScoreNow').onclick = report;
      }
      window.Voice?.stopSpeaking();
      syncControls();
      render();                              // clear "thinking…" and "· in progress"
    };
    // Re-rendered (tab revisited, mode clicked) while a run is going: keep Go/Stop truthful.
    syncControls();
  }

  function syncControls() {
    const go = $('wtGo'), stop = $('wtStop');
    if (go) { go.disabled = state.running; go.textContent = state.running ? 'Running…' : 'Run the interview'; }
    if (stop) stop.disabled = !state.running;
    document.querySelectorAll('.wt-mode').forEach(b => { b.disabled = state.running; });
    const pick = $('wtQ') || $('wtC');
    if (pick) pick.disabled = state.running;
  }

  async function start() {
    if (state.running) return;
    state.transcript = []; state.turns = 0; state.code = '';
    $('wtReport')?.remove();
    // Lock the controls before the question is fetched: a mode switch or a
    // second click in that gap would otherwise start a mismatched run.
    state.running = true;
    const token = ++state.run;
    syncControls();
    if (state.mode === 'coding') {
      const slug = $('wtQ')?.value;
      const picked = questions.find(q => q.slug === slug);
      state.question = picked ? picked.title : 'Two Sum';
      try {
        const r = await fetch(`/api/question/${encodeURIComponent(slug)}`);
        const q = await r.json();
        state.statement = String(q.content || '').replace(/<[^>]+>/g, ' ').slice(0, 3000);
      } catch { state.statement = ''; }
    } else {
      const cat = $('wtC')?.value;
      try {
        const r = await fetch(`/api/behavioural/questions/${encodeURIComponent(cat)}`);
        const qs = (await r.json()).questions || [];
        state.question = qs[Math.floor(Math.random() * qs.length)] || 'Tell me about a difficult decision.';
      } catch { state.question = 'Tell me about a difficult decision.'; }
      state.statement = '';
    }
    if (!state.running || state.run !== token) return;   // stopped while the question loaded
    render();
    loop(token);
  }

  async function loop(token) {
    const live = () => state.running && state.run === token;
    while (live() && state.turns < state.maxTurns) {
      // The interviewer opens, then they alternate.
      const speaker = state.turns % 2 === 0 ? 'interviewer' : 'candidate';
      render(speaker);
      try {
        const r = await turnFetch(speaker, live);
        const d = await r.json().catch(() => ({}));
        if (!live()) return;                 // superseded while the turn was in flight
        if (!r.ok) throw new Error(d.error || 'The demo stopped.');
        state.transcript.push({ speaker, text: d.text });
        if (d.code) state.code = d.code;
        state.turns++;
        render();
        // Let the line finish before the next turn is generated, otherwise two
        // people talk over each other and the transcript races ahead of the audio.
        if (state.speak && window.Voice?.canSpeak()) {
          await window.Voice.speakAsync(spoken(d.text), { voice: voiceFor(speaker) });
        }
        if (!live()) return;
      } catch (e) {
        if (!live()) return;
        state.running = false;
        state.transcript.push({ speaker: 'system', text: e.message });
        render();
        syncControls();                      // otherwise Go stays stuck on "Running…"
        if (state.transcript.some(t => t.speaker === 'candidate')) {
          reportBox().innerHTML = '<button id="wtScoreNow" class="primary">Score what was said so far</button>';
          $('wtScoreNow').onclick = report;
        }
        return;
      }
    }
    if (!live()) return;                   // a newer run owns the UI now
    state.running = false;
    window.Voice?.stopSpeaking();
    syncControls();
    render();
    report();                              // the run finished on its own: score it
  }

  /** One turn's request. A twelve-turn run can meet the per-minute AI budget
   *  (especially a second run straight after the first); wait it out and carry
   *  on rather than ending the demo half-way. */
  async function turnFetch(speaker, live) {
    for (let attempt = 0; ; attempt++) {
      const r = await fetch('/api/demo/turn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: state.mode, speaker,
          question: state.question, statement: state.statement,
          profile: window.Profile?.active(),
          stories: state.mode === 'behavioural' ? (window.QFStories?.forQuestion?.(state.question) || []) : [],
          transcript: state.transcript,
          model: window.Settings?.modelFor('behaviouralChat'),
        }),
      });
      if (r.status !== 429 || attempt >= 3 || !live()) return r;
      const secs = Math.min(65, Math.max(5, Number(r.headers.get('RateLimit-Reset') || r.headers.get('Retry-After')) || 30));
      for (let left = secs; left > 0; left--) {
        if (!live()) return r;
        render(speaker, `pausing for the AI rate limit — carrying on in ${left}s…`);
        await new Promise(res => setTimeout(res, 1000));
      }
      if (!live()) return r;
      render(speaker);
    }
  }

  // ------------------------------------------------------------ report ---
  // Shown on the page only. Nothing here is written to History: this is a
  // demonstration, not the viewer's own interview.
  const asMessages = () => state.transcript
    .filter(t => t.speaker === 'candidate' || t.speaker === 'interviewer')
    .map(t => ({ role: t.speaker === 'candidate' ? 'user' : 'assistant', content: t.text }));

  function reportBox() {
    let el = $('wtReport');
    if (!el) { el = document.createElement('section'); el.id = 'wtReport'; el.className = 'wt-report'; $('wtLog').after(el); }
    return el;
  }

  async function report() {
    if (!state.transcript.some(t => t.speaker === 'candidate')) return;
    const box = reportBox();
    box.innerHTML = '<h3>How it went</h3><p class="gl-muted">Scoring the answers you just watched… 15–30 seconds.</p>';
    const model = window.Settings?.modelFor('behaviouralScore');
    try {
      if (state.mode === 'behavioural') {
        // Each half can fail on its own; one failing must not hide the other
        // or render as an empty "0 of 0" report.
        const [starR, cardR] = await Promise.allSettled([
          post('/api/behavioural/star', { question: state.question, messages: asMessages(), model }),
          post('/api/behavioural/score', { question: state.question, messages: asMessages(), model }),
        ]);
        if (starR.status === 'rejected' && cardR.status === 'rejected') throw starR.reason;
        const star = starR.status === 'fulfilled' ? starR.value : null;
        const starOk = star && Array.isArray(star.answers) && star.answers.length && star.total > 0;
        const card = cardR.status === 'fulfilled' ? cardR.value : null;
        const cardOk = card && Array.isArray(card.dimensions) && card.dimensions.length;
        box.innerHTML = `<h3>How it went</h3>
          <p class="gl-muted">A read on the answers you just watched — structure first, then the six signals a
             Google interviewer scores. Not saved to History.</p>
          ${starOk ? starHtml(star) : `<div class="bv-err bv-retry-row" role="alert"><span><strong>STAR check failed.</strong>
             ${esc(starR.reason?.message || 'The check came back without any answers to read.')}</span>
             <button type="button" class="ghost wt-retry">Retry</button></div>`}
          <h4 class="wt-report-h">Interviewer's scorecard</h4>
          ${cardOk ? (window.scorecardHtml ? window.scorecardHtml(card) : '') : `<div class="bv-err bv-retry-row" role="alert"><span><strong>Scoring failed — retry.</strong>
             ${esc(cardR.reason?.message || 'The scorer sent back something that was not a scorecard.')}</span>
             <button type="button" class="ghost wt-retry">Retry</button></div>`}`;
        box.querySelectorAll('.wt-retry').forEach(b => { b.onclick = report; });
      } else {
        const card = await post('/api/coding/score', {
          question: state.question, transcript: asMessages(), code: state.code || '', lang: 'python3', model,
        });
        box.innerHTML = `<h3>How it went</h3>
          <p class="gl-muted">The write-up an interviewer would file on this performance. Not saved to History.</p>
          ${window.scorecardHtml ? window.scorecardHtml(card) : ''}`;
      }
    } catch (e) {
      box.innerHTML = `<h3>How it went</h3><p class="bv-err">${esc(e.message)}</p>
        <button id="wtScoreRetry" class="ghost">Try again</button>`;
      $('wtScoreRetry').onclick = report;
    }
  }

  async function post(url, body) {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || `Request failed (${r.status})`);
    return d;
  }

  function starHtml(star) {
    const E = [['situation', 'S', 'Situation'], ['task', 'T', 'Task'], ['action', 'A', 'Action'], ['result', 'R', 'Result'], ['reflection', '+', 'Reflection']];
    const o = star.overall || {};
    return `
      <div class="wt-star">
        <div class="wt-star-head">
          <div class="wt-star-score"><strong>${o.score ?? '–'}</strong><span>/10 structure</span></div>
          <div>
            <div class="wt-star-title">STAR check · ${star.complete} of ${star.total} answers complete</div>
            <div class="gl-muted">${esc(o.summary)}${o.mostMissed && o.mostMissed !== 'None' ? ` Most often missing: <strong>${esc(o.mostMissed)}</strong>.` : ''}</div>
          </div>
        </div>
        ${star.answers.map(a => `
          <div class="wt-star-ans">
            <div class="wt-star-row">
              <span class="wt-star-n">Answer ${a.turn}</span>
              <span class="wt-star-chips">${E.map(([k, l, name]) => `<span class="wt-chip ${a[k].present ? 'on' : 'off'}" title="${name}${a[k].note ? ': ' + esc(a[k].note) : ''}">${l}</span>`).join('')}</span>
              <span class="wt-star-verdict ${a.complete ? 'ok' : 'bad'}">${esc(a.verdict)}</span>
            </div>
            <ul class="wt-star-detail">
              ${E.map(([k, , name]) => a[k].present
                ? `<li><b>${name}</b> ${a[k].quote ? `<q>${esc(a[k].quote)}</q>` : ''} <span class="gl-muted">${esc(a[k].note)}</span></li>`
                : `<li class="miss"><b>${name}</b> missing${a[k].note ? ` — <span class="gl-muted">${esc(a[k].note)}</span>` : ''}</li>`).join('')}
            </ul>
            ${a.fix ? `<div class="wt-star-fix"><b>Fix:</b> ${esc(a.fix)}</div>` : ''}
          </div>`).join('')}
      </div>`;
  }

  /** The question being worked on, above the transcript, for the whole run. */
  function renderQuestion() {
    const log = $('wtLog'); if (!log) return;
    let bar = $('wtQuestion');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'wtQuestion'; bar.className = 'wt-question';
      log.before(bar);
    }
    const show = Boolean(state.question) && (state.running || state.transcript.length);
    bar.hidden = !show;
    if (!show) return;
    const myN = state.mode === 'behavioural' ? (window.QFStories?.forQuestion?.(state.question) || []).length : 0;
    bar.innerHTML = `<div class="bv-qlabel">${state.mode === 'coding' ? 'Coding question' : 'Behavioural question'}${state.running ? ' · in progress' : ''}${myN ? ` · the candidate answers with your ${myN} stor${myN === 1 ? 'y' : 'ies'}` : ''}</div>
      <div class="wt-question-text">${esc(state.question)}</div>`;
  }

  function render(pending, pendingText) {
    renderQuestion();
    const who = s => s === 'candidate' ? 'Candidate' : s === 'interviewer' ? 'Interviewer' : 'System';
    $('wtLog').innerHTML = state.transcript.map(t => `
      <div class="wt-turn wt-${t.speaker}">
        <div class="wt-who">${who(t.speaker)}</div>
        <div class="wt-text">${format(t.text)}</div>
      </div>`).join('')
      + (pending ? `<div class="wt-turn wt-${pending}">
          <div class="wt-who">${who(pending)}</div>
          <div class="wt-text bv-typing">${esc(pendingText || 'thinking…')}</div></div>` : '');
    $('wtLog').scrollTop = $('wtLog').scrollHeight;

    // The shared editor is part of the room: show it for the whole coding
    // session, empty at first, rather than appearing once code exists.
    const panel = $('wtCode');
    if (state.mode !== 'coding' || !state.transcript.length) {
      panel.classList.add('hidden');
      return;
    }
    panel.classList.remove('hidden');
    const lines = state.code ? state.code.split('\n') : [];
    panel.innerHTML = `
      <div class="wt-code-head">
        <span>Shared editor</span>
        <span class="wt-code-meta">${lines.length ? `${lines.length} lines` : 'waiting for the candidate'}</span>
      </div>
      <div class="wt-code-body">
        <div class="wt-gutter">${lines.map((_, i) => i + 1).join('<br>') || '1'}</div>
        <pre class="wt-code-text">${lines.length ? esc(state.code) : '<span class="wt-code-empty" style="white-space:normal">The candidate has not started writing yet.</span>'}</pre>
      </div>`;
  }

  /** Code read character by character is unlistenable; summarise it instead. */
  function spoken(text) {
    return String(text)
      .replace(/```[a-z]*\n[\s\S]*?```/gi, ' — writing the code now — ')
      .replace(/`([^`]+)`/g, '$1');
  }

  /** Fenced code inside a turn reads far better as a block than as prose. */
  function format(text) {
    // Models reach for LaTeX for complexity even when told not to; strip the
    // delimiters rather than rendering $O(n^2)$ at the viewer.
    const plain = String(text).replace(/\$([^$\n]{1,60}?)\$/g, '$1');
    return esc(plain)
      .replace(/```[a-z]*\n([\s\S]*?)```/gi, (_, code) => `<pre class="wt-code">${code}</pre>`)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\n/g, '<br>');
  }

  window.renderWatch = () => { loadOptions(); renderWho(); render(); };
})();
