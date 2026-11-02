/* Talk to a Googler: a live practice call. Continuous listening, the reply
 * streamed and spoken a sentence at a time as it arrives, interrupt any
 * time, and coaching on how you came across at the end. */
(function () {
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

  const state = {
    running: false, topic: 'intro', mode: 'voice', interviewer: null,
    messages: [],                          // {role, content} as sent to the model
    status: 'idle',                        // idle | listening | thinking | speaking
    partial: '', pending: '', pendingTimer: null,
    error: '',                             // the last failed turn, shown with Retry; never sent to the model
    rec: null, recWanted: false, abort: null, q: null, startedAt: 0,
  };
  let topics = [];

  // ------------------------------------------------------------- setup ---
  async function loadTopics() {
    if (topics.length) return;
    try {
      const r = await fetch('/api/talk/topics');
      const d = await r.json();
      if (!r.ok || !Array.isArray(d) || !d.length) throw new Error('no topics');
      topics = d;
    } catch { topics = [{ id: 'intro', label: 'Introduce yourself', hint: '' }]; }
  }

  function renderSetup() {
    const canListen = Boolean(SR) && window.isSecureContext;
    const t = topics.find(x => x.id === state.topic) || topics[0];
    $('tkSetup').innerHTML = `
      <label class="field"><span>Call</span>
        <select id="tkTopic"${state.running ? ' disabled title="End the call to change it"' : ''}>${topics.map(x => `<option value="${esc(x.id)}"${x.id === state.topic ? ' selected' : ''}>${esc(x.label)}</option>`).join('')}</select></label>
      <div class="modeSwitch tk-mode" role="group" aria-label="How you answer">
        <button class="mode${state.mode === 'voice' ? ' active' : ''}" data-mode="voice" ${canListen ? '' : 'disabled title="This browser cannot listen — Chrome, Edge and Safari can"'}>&#127908; Voice</button>
        <button class="mode${state.mode === 'text' ? ' active' : ''}" data-mode="text">&#9000; Text</button>
      </div>
      <button id="tkStart" class="start" ${state.running ? 'disabled' : ''}>&#9654; Start the call</button>
      <button id="tkEnd" class="stop" ${state.running ? '' : 'disabled'}>&#9632; End the call</button>
      <p class="tk-hint">${esc(t?.hint || '')}</p>`;
    $('tkTopic').onchange = e => { state.topic = e.target.value; renderSetup(); };
    $('tkSetup').querySelectorAll('.tk-mode .mode').forEach(b => { b.onclick = () => switchMode(b.dataset.mode); });
    $('tkStart').onclick = start;
    $('tkEnd').onclick = end;
  }

  /** Voice <-> Text, also mid-call: the microphone follows the mode, so in
   *  Text it stops listening (it would otherwise keep sending what it hears). */
  function switchMode(mode) {
    if (mode === state.mode) return;
    state.mode = mode;
    renderSetup(); renderStage();
    if (!state.running) return;
    if (mode === 'text') {
      stopListening(); state.pending = ''; state.partial = '';
      if (state.status === 'listening') setStatus('idle');
    } else if (state.status === 'idle' && !state.error) startListening();
    showControls(true);
  }

  /** Keep the reply box on screen (phones: the log pushes it below the fold). */
  function showControls(focus) {
    const box = $('tkInput') || document.querySelector('.tk-controls');
    if (!box) return;
    const r = box.getBoundingClientRect();
    if (r.bottom > innerHeight - 70 || r.top < 0) box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    if (focus && $('tkInput') && !$('tkInput').disabled && matchMedia('(pointer: fine)').matches) $('tkInput').focus({ preventScroll: true });
  }

  function who() {
    const iv = state.interviewer;
    if (!iv) return '';
    return state.topic === 'phone'
      ? `<strong>${esc(iv.name)}</strong>, technical recruiter, Google London`
      : `<strong>${esc(iv.name)}</strong>, software engineer on ${esc(iv.team)}, ${iv.years} years at Google, ${esc(iv.office)}`;
  }

  function renderStage() {
    const p = window.Profile?.active();
    $('tkStage').innerHTML = `
      <div class="tk-card">
        <div class="tk-who">${state.interviewer ? who() : 'Press <b>Start the call</b> and a Googler will pick up.'}</div>
        <div class="tk-you">${p ? `You are <strong>${esc(p.name)}</strong> — they have read your CV.` : 'They have not seen your CV. <button class="ln-inline" id="tkResume">Upload it</button> and they will have.'}</div>
        <div class="tk-status" data-status="${state.status}"><i></i><span id="tkStatusText">${statusText()}</span><span id="tkVia" class="tk-via">${state.model ? `via ${esc(state.model)}` : ''}</span></div>
      </div>
      <div id="tkLog" class="bv-log tk-log"></div>
      <div id="tkPartial" class="tk-partial" hidden></div>
      <div class="tk-controls">
        ${state.mode === 'voice'
          ? `<button id="tkInterrupt" class="ghost" ${state.status === 'speaking' ? '' : 'disabled'} title="Or just start talking after they finish">&#9646;&#9646; Interrupt</button>
             <span class="tk-mic ${state.status === 'listening' ? 'on' : ''}" title="Microphone">&#127908;</span>
             <label class="tk-opt"><input type="checkbox" id="tkAutoSend" checked> Send when I pause</label>
             <button id="tkSendNow" class="primary" ${state.pending || state.partial ? '' : 'disabled'}>Send now</button>`
          : `<div class="bv-compose tk-compose">
               <textarea id="tkInput" rows="2" placeholder="${state.ended ? 'The call has ended — start a new one to talk again.' : `Type what you would say…${matchMedia('(pointer: coarse)').matches ? '' : ' (Enter to send, Shift+Enter for a new line)'}`}" ${canType() ? '' : 'disabled'}></textarea>
               <button id="tkSend" class="primary" ${canType() ? '' : 'disabled'}>Send</button>
             </div>
             <label class="tk-opt"><input type="checkbox" id="tkReadAloud" ${window.Voice?.prefs?.().output ? 'checked' : ''}> Read their replies aloud</label>`}
      </div>
      <div id="tkFeedback">${state.feedbackHtml || ''}</div>`;
    $('tkFbRetry') && ($('tkFbRetry').onclick = () => fetchFeedback());
    $('tkReadAloud') && ($('tkReadAloud').onchange = e => window.Voice?.setPrefs?.({ output: e.target.checked }));
    $('tkResume') && ($('tkResume').onclick = () => window.setInterviewMode?.('resume'));
    $('tkInterrupt') && ($('tkInterrupt').onclick = interrupt);
    $('tkSendNow') && ($('tkSendNow').onclick = () => flushUtterance(true));
    if ($('tkSend')) {
      $('tkSend').onclick = () => { const t = $('tkInput').value.trim(); if (t) { $('tkInput').value = ''; say(t); } };
      $('tkInput').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('tkSend').click(); } });
    }
    renderLog();
  }

  const statusText = () => ({
    idle: state.running ? 'Connected.' : 'Not on a call.',
    listening: 'Listening — speak whenever you like.',
    thinking: `${state.interviewer?.firstName || 'They'} is thinking…`,
    speaking: `${state.interviewer?.firstName || 'They'} is speaking — press Interrupt to cut in.`,
  })[state.status] || '';

  /** Typing is allowed on a live call while the Googler is not mid-turn. */
  const canType = () => state.running && state.status !== 'thinking' && state.status !== 'speaking';

  function setStatus(s) {
    state.status = s;
    for (const id of ['tkInput', 'tkSend']) { const x = $(id); if (x) x.disabled = !canType(); }
    const el = document.querySelector('.tk-status'); if (el) { el.dataset.status = s; $('tkStatusText').textContent = statusText(); }
    const mic = document.querySelector('.tk-mic'); if (mic) mic.classList.toggle('on', s === 'listening');
    const ib = $('tkInterrupt'); if (ib) ib.disabled = s !== 'speaking';
  }

  function renderLog(streamingText) {
    const log = $('tkLog'); if (!log) return;
    const name = state.interviewer?.firstName || 'Googler';
    log.innerHTML = state.messages.filter(m => !m.hidden).map(m => `
      <div class="bv-turn ${m.role === 'user' ? 'me' : ''}"><div class="bv-who">${m.role === 'user' ? 'You' : esc(name)}</div><div class="bv-text">${esc(m.content)}</div></div>`).join('')
      + (streamingText != null ? `<div class="bv-turn"><div class="bv-who">${esc(name)}</div><div class="bv-text">${esc(streamingText)}<span class="tk-cursor"></span></div></div>` : '')
      + (state.error && streamingText == null ? `<div class="tk-error" role="alert">
          <span><strong>${esc(name)}'s reply did not come through.</strong> ${esc(state.error)}</span>
          <button type="button" class="primary" id="tkRetry">Retry</button></div>` : '');
    log.scrollTop = log.scrollHeight;
    const retry = $('tkRetry');
    if (retry) retry.onclick = () => { if (state.running) reply(); };
  }

  // ------------------------------------------------------------- call ---
  async function start() {
    if (state.running) return;
    state.running = true; state.ended = false; state.messages = []; state.startedAt = Date.now();
    setFeedback('');
    try { state.interviewer = (await fetch('/api/interviewer').then(r => r.json())).interviewer || null; } catch { state.interviewer = null; }
    state.q = null;
    renderSetup(); renderStage();
    setStatus('thinking');
    await reply();                          // they open the call
  }

  async function end() {
    if (!state.running) return;
    state.running = false; state.ended = true;
    stopListening(); state.abort?.abort(); state.q?.stop();
    setStatus('idle'); renderSetup();
    state.error = ''; renderLog();
    // The call is over: nothing more can be sent.
    for (const id of ['tkInput', 'tkSend', 'tkSendNow', 'tkInterrupt']) { const x = $(id); if (x) x.disabled = true; }
    if ($('tkInput')) $('tkInput').placeholder = 'The call has ended — start a new one to talk again.';
    await fetchFeedback();
  }

  /** Kept in state so a re-render (Voice/Text switch after the call) keeps it. */
  function setFeedback(html) {
    state.feedbackHtml = html;
    const box = $('tkFeedback'); if (box) box.innerHTML = html;
  }

  async function fetchFeedback() {
    const box = $('tkFeedback');
    if (!box) return;
    if (!state.messages.some(m => m.role === 'user')) { setFeedback('<p class="gl-muted">Nothing to review — you did not say anything.</p>'); return; }
    const startedAt = state.startedAt;
    setFeedback('<p class="gl-muted">Working out how you came across… 10–20 seconds.</p>');
    if (box.offsetParent) box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    try {
      const r = await fetch('/api/talk/feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: state.messages.map(m => ({ role: m.role, content: m.content })), model: window.Settings?.modelFor('behaviouralScore') }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Feedback failed.');
      const sc = d.scores || {};
      const usable = Object.values(sc).some(x => x != null) || d.didWell?.length || d.fix?.length || d.oneLiner;
      if (!usable) throw new Error('The coach sent back an empty review.');
      if (state.startedAt !== startedAt || state.running) return;   // a new call has begun
      setFeedback(feedbackHtml(d));
    } catch (e) {
      if (state.startedAt !== startedAt || state.running) return;
      setFeedback(`<div class="bv-err bv-retry-row" role="alert"><span><strong>Feedback failed.</strong> ${esc(e.message)}</span>
        <button type="button" class="ghost" id="tkFbRetry">Retry</button></div>`);
      $('tkFbRetry') && ($('tkFbRetry').onclick = () => fetchFeedback());
    }
  }

  function feedbackHtml(f) {
    const dims = [['clarity', 'Clarity'], ['concision', 'Concision'], ['structure', 'Structure'], ['specificity', 'Specificity'], ['warmth', 'Warmth']];
    const mins = Math.max(1, Math.round((Date.now() - state.startedAt) / 60000));
    const sc = f.scores || {};
    const scored = dims.filter(([k]) => sc[k] != null);
    const didWell = f.didWell || [], fix = f.fix || [];
    return `<div class="tk-feedback">
      <h3>How you came across</h3>
      ${f.oneLiner ? `<p class="tk-oneliner">${esc(f.oneLiner)}</p>` : ''}
      ${scored.length ? `<div class="tk-scores">${scored.map(([k, l]) => `<div class="tk-score"><span>${l}</span><div class="tk-dots" role="img" aria-label="${l} ${sc[k]} of 5">${[1, 2, 3, 4, 5].map(n => `<i class="${sc[k] >= n ? 'on' : ''}"></i>`).join('')}</div></div>`).join('')}</div>` : ''}
      ${didWell.length || fix.length ? `<div class="tk-fb-grid">
        ${didWell.length ? `<div><h4>What worked</h4><ul>${didWell.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
        ${fix.length ? `<div><h4>Change next time</h4><ol>${fix.map(x => `<li>${esc(x)}</li>`).join('')}</ol></div>` : ''}
      </div>` : ''}
      ${f.fillers ? `<p class="gl-muted"><b>Fillers and hedging:</b> ${esc(f.fillers)}</p>` : ''}
      <p class="gl-muted">${mins} min call · ${state.messages.filter(m => m.role === 'user').length} of your turns · not saved to History</p>
    </div>`;
  }

  /** The candidate said something: append it and get the streamed reply. */
  async function say(text) {
    if (!state.running || !text) return;
    // One turn at a time: a second send while they are still answering would
    // abort that reply and stack two of the candidate's turns.
    if (state.status === 'thinking') return;
    state.messages.push({ role: 'user', content: text });
    renderLog();
    await reply();
  }

  /** Stream the Googler's next turn; speak it sentence by sentence as it arrives. */
  async function reply() {
    stopListening();
    setStatus('thinking');
    state.abort?.abort();
    const ac = new AbortController(); state.abort = ac;
    state.error = '';
    const speakIt = state.mode === 'voice' || $('tkReadAloud')?.checked;
    const q = speakIt && window.Voice?.canSpeak() ? window.Voice.queue({ voice: window.Voice.voiceFor?.('interviewer') }) : null;
    state.q?.stop(); state.q = q;
    let text = '', spoken = 0, firstAudio = false;
    const flushSentences = final => {
      // Speak each completed sentence as soon as it is complete.
      const re = /[^.!?…]+[.!?…]+["')\]]?\s+/g;
      let m;
      re.lastIndex = spoken;
      while ((m = re.exec(text))) { q?.add(m[0]); spoken = re.lastIndex; }
      if (final && spoken < text.length) { q?.add(text.slice(spoken)); spoken = text.length; }
    };
    try {
      const r = await fetch('/api/talk/stream', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ac.signal,
        body: JSON.stringify({
          topic: state.topic, interviewer: state.interviewer, profile: window.Profile?.active(),
          messages: state.messages.map(m => ({ role: m.role, content: m.content })),
          model: window.Settings?.modelFor('talk'),
        }),
      });
      if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error || `Request failed (${r.status})`); }
      state.model = r.headers.get('X-Talk-Model') || '';
      const via = $('tkVia'); if (via) via.textContent = state.model ? `via ${state.model}` : '';
      const reader = r.body.getReader(); const dec = new TextDecoder(); let buf = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf('\n\n')) >= 0) {
          const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 2);
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (payload === '[DONE]') continue;
          let msg;
          try { msg = JSON.parse(payload); } catch { continue; /* partial */ }
          if (msg.error) throw new Error(msg.error);
          const d = msg.d;
          if (d) { text += d; renderLog(text); flushSentences(false); if (q && !firstAudio) { firstAudio = true; setStatus('speaking'); } }
        }
      }
      if (!text.trim()) throw new Error('No reply came back.');
      flushSentences(true);
    } catch (e) {
      if (ac.signal.aborted) return;        // interrupted on purpose
      // A failure is not something the Googler said: keep it out of the
      // transcript (and out of the next request), and offer a retry.
      const transient = e instanceof TypeError || /load failed|network|fetch/i.test(e.message);
      state.error = transient ? 'Lost connection to the server.' : e.message;
      q?.stop();
      if (state.q === q) state.q = null;
      renderLog();
      setStatus('idle');
      $('tkStatusText') && ($('tkStatusText').textContent = 'The reply failed — press Retry.');
      $('tkRetry')?.focus();
      return;
    }
    if (ac.signal.aborted) return;
    state.messages.push({ role: 'assistant', content: text.trim() });
    renderLog();
    showControls(state.messages.length <= 1);
    if (q) { q.done(); if (q.busy) setStatus('speaking'); await q.idle; }
    if (!state.running || state.abort !== ac) return;
    if (/\b(goodbye|bye for now|speak soon|take care)\b/i.test(text) && state.messages.length > 6) { end(); return; }
    if (state.mode === 'voice') startListening();
    else { setStatus('idle'); showControls(true); }
  }

  /** Cut them off: stop the audio and the stream, keep what was said so far. */
  function interrupt() {
    if (state.status !== 'speaking' && state.status !== 'thinking') return;
    state.q?.stop();
    const partialText = document.querySelector('#tkLog .tk-cursor')?.parentElement?.textContent?.trim();
    state.abort?.abort();
    if (partialText && !state.messages.some(m => m.content === partialText)) state.messages.push({ role: 'assistant', content: partialText + ' —' });
    renderLog();
    if (state.mode === 'voice') startListening(); else setStatus('idle');
  }

  // ---------------------------------------------------------- listening ---
  // The recogniser is paused while the Googler speaks: it would otherwise
  // transcribe the loudspeaker. Interrupt (or the reply finishing) resumes it.
  function startListening() {
    if (!SR || !state.running || state.mode !== 'voice') return;
    state.recWanted = true;
    if (state.rec) { setStatus('listening'); return; }
    const rec = new SR();
    rec.lang = window.Voice?.prefs?.().lang || 'en-GB';
    rec.continuous = true; rec.interimResults = true; rec.maxAlternatives = 1;
    rec.onresult = e => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) state.pending = `${state.pending} ${t}`.trim(); else interim += t;
      }
      state.partial = interim;
      const p = $('tkPartial');
      if (p) { const shown = [state.pending, state.partial].filter(Boolean).join(' '); p.textContent = shown; p.hidden = !shown; }
      $('tkSendNow') && ($('tkSendNow').disabled = !(state.pending || state.partial));
      clearTimeout(state.pendingTimer);
      if ($('tkAutoSend')?.checked && state.pending) state.pendingTimer = setTimeout(() => flushUtterance(false), 1100);
    };
    rec.onerror = e => { if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { setStatus('idle'); $('tkStatusText').textContent = 'Microphone blocked — allow it in the browser, or switch to Text.'; state.recWanted = false; } };
    rec.onend = () => { state.rec = null; if (state.recWanted && state.running) setTimeout(startListening, 150); };   // Chrome stops after silence
    try { rec.start(); state.rec = rec; setStatus('listening'); } catch { state.rec = null; }
  }
  function stopListening() {
    state.recWanted = false;
    clearTimeout(state.pendingTimer);
    if (state.rec) { try { state.rec.onend = null; state.rec.stop(); } catch { /* ignore */ } state.rec = null; }
  }
  function flushUtterance(force) {
    clearTimeout(state.pendingTimer);
    const text = [state.pending, force ? state.partial : ''].filter(Boolean).join(' ').trim();
    state.pending = ''; state.partial = '';
    const p = $('tkPartial'); if (p) { p.textContent = ''; p.hidden = true; }
    if (text) say(window.Dictation?.normaliseTechnical?.(text) ?? text);
  }

  window.renderTalk = async () => { await loadTopics(); if (!$('tkTopic')) { renderSetup(); renderStage(); } };
  // Leaving Talk mid-call (sidebar, tabs, ⌘K) ends the call: otherwise the
  // Googler keeps speaking and the microphone keeps sending from another page.
  new MutationObserver(() => { if (state.running && document.body.dataset.mode && document.body.dataset.mode !== 'talk') end(); })
    .observe(document.body, { attributes: true, attributeFilter: ['data-mode'] });
  window.addEventListener('beforeunload', () => { if (state.running) { state.q?.stop(); stopListening(); } });
})();
