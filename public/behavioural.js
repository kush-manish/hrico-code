/* Behavioural mock interview: setup -> live interview -> scorecard. */
(function () {
  const $ = id => document.getElementById(id);
  const api = async (path, opts) => {
    const res = await fetch(path, opts);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  };

  const state = {
    categories: [],
    dimensions: [],
    category: null,
    question: '',
    messages: [],      // {role:'user'|'assistant', content}
    endsAt: 0,
    tick: null,
    busy: false,
    startedAt: 0,
    label: '',
  };

  // --- mode switching -------------------------------------------------------
  // Three modes share the header, so this is the one place that decides which
  // <main> is visible and which chrome applies.
  const MODES = ['home', 'coding', 'learn', 'prolearn', 'smart', 'neetcode', 'google', 'toolkit', 'realq', 'watch', 'talk', 'behavioural', 'resume', 'history', 'settings', 'hftprep', 'hftpractice', 'hfthub', 'hfttopics', 'hftcoach'];
  // Which track (MAANG vs HFT) each mode belongs to. Shared modes list none.
  const HFT_MODES = ['hftprep', 'hftpractice', 'hfthub', 'hfttopics', 'hftcoach'];
  const HUB_MODES = ['hfthub', 'hfttopics', 'hftcoach'];
  const SHARED_MODES = ['history', 'settings', 'coding'];   // the HFT track solves problems too

  // Every tab used to report the same document title, so several windows of
  // this app were indistinguishable in the browser's tab strip.
  const TITLES = {
    coding: 'Coding interview',
    behavioural: 'Behavioural interview',
    resume: 'Resume questions',
    history: 'Interview history',
    settings: 'Models & settings',
    learn: 'DSA patterns',
    prolearn: 'DSA handbook',
    smart: 'SMART topic map',
    toolkit: 'DSA toolkit',
    realq: 'Real Google questions',
    watch: 'Watch an interview',
    talk: 'Talk to a Googler',
    hftprep: 'Optiver prep · Zap-N & 80 in 8',
    hftpractice: 'Optiver practice',
    hfthub: 'HFT hub · firms & pay',
    hfttopics: 'HFT topics & coding',
    hftcoach: 'HFT AI coach',
    home: 'Interview prep' };

  // --- track switching ------------------------------------------------------
  // The top-left Track select decides which family of tabs is shown. The
  // active mode follows along when it belongs to the other track.
  function currentTrack() {
    try { return localStorage.getItem('track') === 'hft' ? 'hft' : 'maang'; } catch { return 'maang'; }
  }
  function setTrack(track, { keepMode = false } = {}) {
    track = track === 'hft' ? 'hft' : 'maang';
    document.body.classList.toggle('track-hft', track === 'hft');
    document.body.classList.toggle('track-maang', track === 'maang');
    document.body.dataset.track = track;
    const sel = $('trackSel');
    if (sel && sel.value !== track) sel.value = track;
    try { localStorage.setItem('track', track); } catch { /* private mode */ }
    if (keepMode) return;
    const mode = document.body.dataset.mode;
    const isHft = HFT_MODES.includes(mode);
    if (SHARED_MODES.includes(mode)) return;
    if (track === 'hft' && !isHft) setMode('hfthub');
    if (track === 'maang' && isHft) setMode('home');
  }
  window.setInterviewTrack = setTrack;

  /** Coding names the current question, since that is what identifies the tab. */
  window.syncDocumentTitle = function (mode) {
    const m = mode || document.body.dataset.mode || 'coding';
    let title = TITLES[m] || 'Interview';
    if (m === 'coding' && window.currentQuestion?.title) {
      title = `${window.currentQuestion.title} · Coding`;
    }
    document.title = title;
  };

  function setMode(mode) {
    if (!MODES.includes(mode)) mode = 'coding';
    document.body.classList.toggle('mode-behavioural', mode === 'behavioural');
    document.body.classList.toggle('mode-resume', mode === 'resume');
    document.body.classList.toggle('mode-history', mode === 'history');
    document.body.classList.toggle('mode-settings', mode === 'settings');
    document.body.classList.toggle('mode-learn', mode === 'learn');
    document.body.classList.toggle('mode-toolkit', mode === 'toolkit');
    document.body.classList.toggle('mode-realq', mode === 'realq');
    document.body.classList.toggle('mode-prolearn', mode === 'prolearn');
    document.body.classList.toggle('mode-smart', mode === 'smart');
    document.body.classList.toggle('mode-neetcode', mode === 'neetcode');
    document.body.classList.toggle('mode-google', mode === 'google');
    document.body.classList.toggle('mode-watch', mode === 'watch');
    document.body.classList.toggle('mode-talk', mode === 'talk');
    document.body.classList.toggle('mode-home', mode === 'home');
    document.body.classList.toggle('mode-hft', HFT_MODES.includes(mode));
    // Opening an HFT tab from a link flips the track so its tabs are visible.
    if (HFT_MODES.includes(mode) && currentTrack() !== 'hft') setTrack('hft', { keepMode: true });
    else if (!HFT_MODES.includes(mode) && !SHARED_MODES.includes(mode) && currentTrack() !== 'maang') setTrack('maang', { keepMode: true });
    $('layout').classList.toggle('hidden', mode !== 'coding');
    const hft = $('hftLayout');
    if (hft) hft.classList.toggle('hidden', !['hftprep', 'hftpractice'].includes(mode));
    const hub = $('hubLayout');
    if (hub) hub.classList.toggle('hidden', !HUB_MODES.includes(mode));
    $('bvLayout').classList.toggle('hidden', mode !== 'behavioural');
    const rs = $('rsLayout');
    if (rs) rs.classList.toggle('hidden', mode !== 'resume');
    const hs = $('hsLayout');
    if (hs) hs.classList.toggle('hidden', mode !== 'history');
    const st = $('stLayout');
    if (st) st.classList.toggle('hidden', mode !== 'settings');
    const ln = $('lnLayout');
    if (ln) ln.classList.toggle('hidden', mode !== 'learn');
    const tl = $('toolLayout');
    if (tl) tl.classList.toggle('hidden', mode !== 'toolkit');
    const rq = $('rqLayout');
    if (rq) rq.classList.toggle('hidden', mode !== 'realq');
    const pl = $('plLayout');
    if (pl) pl.classList.toggle('hidden', mode !== 'prolearn');
    const sm = $('smLayout');
    if (sm) sm.classList.toggle('hidden', mode !== 'smart');
    const nc = $('ncLayout');
    if (nc) nc.classList.toggle('hidden', mode !== 'neetcode');
    const gg = $('ggLayout');
    if (gg) gg.classList.toggle('hidden', mode !== 'google');
    const wt = $('wtLayout');
    if (wt) wt.classList.toggle('hidden', mode !== 'watch');
    const tk = $('tkLayout');
    if (tk) tk.classList.toggle('hidden', mode !== 'talk');
    const hm = $('hmLayout');
    if (hm) hm.classList.toggle('hidden', mode !== 'home');
    // Leaving the coding tab mid-session would otherwise lose the attempt.
    if (mode !== 'coding' && typeof window.stopCodingSession === 'function') {
      window.stopCodingSession('left-tab');
    }
    for (const [id, m] of [['modeCoding', 'coding'], ['modeBehavioural', 'behavioural'],
                           ['modeResume', 'resume'], ['modeHistory', 'history'],
                           ['modeSettings', 'settings'], ['modeLearn', 'learn'],
                           ['modeProLearn', 'prolearn'],
                           ['modeSmart', 'smart'],
                           ['modeNeetcode', 'neetcode'], ['modeGoogle', 'google'],
                           ['modeToolkit', 'toolkit'], ['modeRealq', 'realq'], ['modeWatch', 'watch'], ['modeTalk', 'talk'], ['modeHome', 'home'],
                           ['modeHftPrep', 'hftprep'], ['modeHftPractice', 'hftpractice'],
                           ['modeHftHub', 'hfthub'], ['modeHftTopics', 'hfttopics'], ['modeHftCoach', 'hftcoach']]) {
      const btn = $(id);
      if (!btn) continue;
      btn.classList.toggle('active', mode === m);
      btn.setAttribute('aria-selected', String(mode === m));
    }
    $('timer').style.display = mode === 'coding' ? '' : 'none';
    document.body.dataset.mode = mode;
    window.syncDocumentTitle(mode);
    try { localStorage.setItem('mode', mode); } catch { /* private mode */ }
    if (mode === 'behavioural' && !state.categories.length) loadCategories();
    if (mode === 'toolkit' && typeof window.renderToolkit === 'function') window.renderToolkit();
    if (mode === 'realq' && typeof window.renderRealq === 'function') window.renderRealq();
    if (mode === 'history' && typeof window.renderHistory === 'function') window.renderHistory();
    if (mode === 'settings' && typeof window.renderSettings === 'function') window.renderSettings();
    if (mode === 'learn' && typeof window.renderLearn === 'function') window.renderLearn();
    if (mode === 'prolearn' && typeof window.renderProLearn === 'function') window.renderProLearn();
    if (mode === 'smart' && typeof window.renderSmart === 'function') window.renderSmart();
    if (mode === 'neetcode' && typeof window.renderNeetcode === 'function') window.renderNeetcode();
    if (mode === 'google' && typeof window.renderGoogleTab === 'function') window.renderGoogleTab();
    if (mode === 'watch' && typeof window.renderWatch === 'function') window.renderWatch();
    if (mode === 'talk' && typeof window.renderTalk === 'function') window.renderTalk();
    if (mode === 'home' && typeof window.renderHome === 'function') window.renderHome();
    if (mode === 'resume' && typeof window.renderResume === 'function') window.renderResume();
    if (['hftprep', 'hftpractice'].includes(mode) && typeof window.renderHft === 'function') window.renderHft(mode === 'hftprep' ? 'prep' : 'practice');
    else if (typeof window.stopHft === 'function') window.stopHft();
    if (HUB_MODES.includes(mode) && typeof window.renderHub === 'function') window.renderHub(mode.slice(3));
  }
  window.setInterviewMode = setMode;

  // --- setup ----------------------------------------------------------------
  let categoriesLoading = null;
  function loadCategories() {
    // One request at a time; a failure clears it so Retry really retries.
    if (!categoriesLoading) categoriesLoading = loadCategoriesOnce().finally(() => { categoriesLoading = null; });
    return categoriesLoading;
  }
  async function loadCategoriesOnce() {
    $('bvCats').innerHTML = '<p class="gl-muted">Loading question areas…</p>';
    try {
      const data = await api('/api/behavioural/categories');
      const cats = Array.isArray(data.categories) ? data.categories : [];
      if (!cats.length) throw new Error('the server returned no question areas');
      // Only cache a good answer: an empty list would stick until reload.
      state.categories = cats;
      state.dimensions = data.dimensions || [];
      $('bvCats').innerHTML = state.categories.map(c =>
        `<button type="button" class="bv-cat" data-id="${esc(c.id)}" aria-pressed="false">
           <div class="t">${esc(c.label)}</div>
           <div class="d">${esc(c.blurb)}</div>
         </button>`).join('');
      $('bvCats').querySelectorAll('.bv-cat').forEach(btn => {
        btn.onclick = () => {
          if ($('bvSurprise')) $('bvSurprise').checked = false;
          state.category = btn.dataset.id;
          $('bvCats').querySelectorAll('.bv-cat').forEach(b => {
            b.classList.toggle('sel', b === btn);
            b.setAttribute('aria-pressed', String(b === btn));
          });
          syncStartButton();
        };
      });
      syncStartButton();
    } catch (e) {
      state.categories = [];
      $('bvCats').innerHTML = `<div class="bv-err bv-retry-row" role="alert">
          <span>Could not load the question areas: ${esc(e.message)}</span>
          <button type="button" class="ghost" id="bvCatsRetry">Retry</button>
        </div>`;
      $('bvCatsRetry').onclick = () => loadCategories();
    }
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // --- timer ----------------------------------------------------------------
  const fmtMs = ms => {
    const t = Math.max(0, ms);
    const m = Math.floor(t / 60000), s = Math.floor((t % 60000) / 1000);
    return `${m}:${String(s).padStart(2, '0')}`;
  };
  function timeLeftText() { return fmtMs(state.endsAt - Date.now()); }
  /** What the interviewer is told: the whole interview, or this question's
   *  share of a full round, so it wraps each question up on time. */
  function interviewerTimeLeft() {
    if (!state.round) return timeLeftText();
    return fmtMs(Math.min(state.round.qEndsAt, state.endsAt) - Date.now());
  }
  function onTick() {
    $('bvTimer').textContent = timeLeftText();
    if (state.round) roundTick();
    if (Date.now() >= state.endsAt) {
      clearInterval(state.tick);
      // Say so, rather than leaving a silent 0:00 (a full round too).
      if (!$('bvInterview').classList.contains('hidden')) {
        flashHint('Time is up — finish your last sentence, then press <strong>End &amp; score</strong>.');
      }
    }
  }
  function startTimer(minutes) {
    state.startedAt = Date.now();
    state.endsAt = Date.now() + minutes * 60000;
    clearInterval(state.tick);
    state.tick = setInterval(onTick, 1000);
    onTick();
  }

  // --- transcript rendering -------------------------------------------------
  /** The live interview log. A failed turn is shown as its own row with
   *  Retry; it is never part of the transcript sent, scored or saved. */
  function renderLive(typing) {
    const err = typing ? null : state.error;
    renderLog($('bvLog'), state.messages, typing, err);
    const retry = $('bvTurnRetry');
    if (retry && err) retry.onclick = () => {
      if (state.busy || state.error !== err) return;
      if (!err.hide) {
        // The answer is still in the transcript; send it again rather than twice.
        const last = state.messages[state.messages.length - 1];
        if (last?.role === 'user' && last.content === err.text) state.messages.pop();
      }
      turn(err.text, { hideFirstUserTurn: err.hide });
    };
  }

  function renderLog(el, messages, typing, err) {
    el.innerHTML = messages.map(m => m.marker
      ? `<div class="bv-round-mark">${esc(m.content)}</div>`
      : `<div class="bv-turn ${m.role === 'user' ? 'me' : ''}">
         <div class="bv-who">${m.role === 'user' ? 'You' : 'Interviewer'}</div>
         <div class="bv-text">${esc(m.content)}</div>
       </div>`).join('') +
      (typing ? `<div class="bv-turn"><div class="bv-who">Interviewer</div>
         <div class="bv-text bv-typing">thinking…</div></div>` : '') +
      (err ? `<div class="bv-err bv-retry-row" role="alert">
         <span><strong>The interviewer's reply did not come through.</strong> ${esc(err.message)}</span>
         <button type="button" class="primary" id="bvTurnRetry">Retry</button></div>` : '');
    el.scrollTop = el.scrollHeight;
  }

  // --- setup helpers ----------------------------------------------------------
  const isRoundLength = () => [40, 45].includes(Number($('bvLen')?.value));

  function syncStartButton() {
    const b = $('bvStart'); if (!b) return;
    const round = isRoundLength();
    b.disabled = !state.categories.length || !(round || $('bvSurprise')?.checked || state.category);
    b.textContent = round ? 'Start full G&L round' : 'Start interview';
    const note = $('bvRoundNote'); if (note) note.hidden = !round;
  }

  function setupError(msg) {
    clearSetupError();
    $('bvStart')?.closest('.bv-setup-row')?.insertAdjacentHTML('afterend',
      `<p class="bv-err" id="bvSetupErr" role="alert">${esc(msg)}</p>`);
  }
  function clearSetupError() { $('bvSetupErr')?.remove(); }

  function showInterview() {
    $('bvSetup').classList.add('hidden');
    $('bvScore').classList.add('hidden');
    $('bvTranscript').classList.add('hidden');
    $('bvInterview').classList.remove('hidden');
    // A new interview starts with an empty box, not the last one's leftovers.
    $('bvInput').value = '';
    syncHint();
    syncRoundControls();
  }

  // --- interview ------------------------------------------------------------
  // Set by the dialog's Cancel button, so start() can back out of the chooser.
  let askCancelled = false;

  async function start() {
    askCancelled = false;
    if (typeof window.askInterviewMode === 'function') await window.askInterviewMode();
    if (askCancelled) { askCancelled = false; $('bvStart')?.focus(); return; }
    clearSetupError();
    state.historyId = null;
    if (isRoundLength()) { await startRound(); return; }
    state.round = null;
    // A surprise pick is for this interview only: kept local, it cannot
    // linger as a hidden selection once Surprise me is unticked.
    let catId = state.category;
    if ($('bvSurprise')?.checked && state.categories.length) {
      catId = state.categories[Math.floor(Math.random() * state.categories.length)].id;
    }
    if (!catId) return;
    const cat = state.categories.find(c => c.id === catId);
    try {
      const { questions } = await api(`/api/behavioural/questions/${encodeURIComponent(catId)}`);
      state.question = questions[Math.floor(Math.random() * questions.length)];
    } catch (e) {
      setupError(e.message);
      return;
    }
    state.messages = [];
    newSession();
    state.label = cat ? cat.label : '';
    $('bvCatLabel').textContent = state.label;
    $('bvQuestion').textContent = state.question;
    showInterview();
    startTimer(Number($('bvLen').value) || 25);
    renderLive(true);
    // Opening turn: the interviewer greets and asks the assigned question.
    await turn('Hello — I am ready to begin.', { hideFirstUserTurn: true });
    $('bvInput').focus();
  }

  const STAR_HINT = 'Tip: structure with <strong>STAR</strong> — Situation, Task, Action, Result. Be specific about what <em>you</em> did, and quantify the result.';
  const GCA_HINT = 'Hypothetical: <strong>Understand</strong> (clarify, state assumptions) → <strong>Prepare</strong> (what data, from where) → <strong>Identify a solution</strong> (weigh options, commit) → <strong>Support it</strong> (outcome, how you track it).';
  function syncHint() {
    const el = $('bvHint'); if (!el) return;
    el.classList.remove('bv-err');
    el.innerHTML = state.label === 'General Cognitive Ability' ? GCA_HINT : STAR_HINT;
  }
  function flashHint(html) {
    const el = $('bvHint'); if (!el) return;
    el.innerHTML = html;
    el.classList.add('bv-err');
  }

  /** A new interview orphans any reply still in flight from the last one,
   *  so it cannot land in (or block) the new transcript. */
  function newSession() {
    state.session = (state.session || 0) + 1;
    state.busy = false;
    state.error = null;
  }

  /** Stop any dictation so it cannot keep writing into the box. */
  function stopDictation() {
    dictating = false;
    window.Voice?.stopListening?.();
    $('bvMic')?.classList.remove('recording');
  }

  async function turn(text, { hideFirstUserTurn = false } = {}) {
    if (state.busy) return;
    const sid = state.session;
    if (hideFirstUserTurn) syncHint();
    state.busy = true;
    state.error = null;
    $('bvSend').disabled = true;
    if ($('bvNext')) $('bvNext').disabled = true;
    const outgoing = state.messages.concat([{ role: 'user', content: text }]);
    if (!hideFirstUserTurn) state.messages = outgoing;
    renderLive(true);
    try {
      const { reply } = await api('/api/behavioural/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: state.question,
          messages: outgoing,
          timeLeft: interviewerTimeLeft(),
          profile: window.Profile?.active(),
          model: window.Settings?.modelFor('behaviouralChat'),
        }),
      });
      if (sid !== state.session) return;
      state.messages.push({ role: 'assistant', content: reply });
      maybeSpeak(reply);
    } catch (e) {
      if (sid !== state.session) return;
      // A failure is not something the interviewer said: keep it out of the
      // transcript (and the next request, the score and History), and offer
      // Retry, which sends the same text again. Their answer stays as said.
      const transient = e instanceof TypeError || /load failed|network|fetch/i.test(e.message);
      state.error = {
        message: transient ? 'Lost connection to the server.' : e.message,
        text, hide: hideFirstUserTurn,
      };
    } finally {
      // eslint-disable-next-line no-unsafe-finally
      if (sid !== state.session) return;
      state.busy = false;
      $('bvSend').disabled = false;
      syncRoundControls();
      renderLive(false);
      if (state.error) $('bvTurnRetry')?.focus();
    }
  }

  function send() {
    const box = $('bvInput');
    const text = box.value.trim();
    if (!text || state.busy) return;
    dictating = false;
    window.Voice?.stopListening();
    $('bvMic')?.classList.remove('recording');
    box.value = '';
    turn(text);
  }

  // --- full Googleyness & Leadership round ------------------------------------
  // A real G&L round is several questions across themes in one sitting, not
  // one story probed for 45 minutes. Picking 40 or 45 minutes runs that: four
  // questions, a time share each, every answer scored with the same scorer.
  const ROUND_THEMES = [['googleyness'], ['realq'], ['conflict', 'ambiguity'], ['leadership']];
  // REALQ also holds motivation and process questions; a round wants stories.
  const NOT_A_STORY = /^(why google|what would you want|what do you want|what is your approach|how do you use ai)/i;

  async function buildRound() {
    const used = new Set();
    const items = [];
    for (const options of ROUND_THEMES) {
      const cat = options[Math.floor(Math.random() * options.length)];
      const { questions } = await api(`/api/behavioural/questions/${encodeURIComponent(cat)}`);
      const pool = (questions || []).filter(q => !used.has(q) && !NOT_A_STORY.test(q));
      if (!pool.length) throw new Error(`no questions available for ${cat}`);
      const question = pool[Math.floor(Math.random() * pool.length)];
      used.add(question);
      const label = state.categories.find(c => c.id === cat)?.label || cat;
      items.push({ cat, label, question, messages: [], card: null, error: '', scoring: null });
    }
    return items;
  }

  async function startRound() {
    const minutes = Number($('bvLen').value) || 45;
    let items;
    try { items = await buildRound(); } catch (e) { setupError(`Could not set up the round: ${e.message}`); return; }
    state.round = { items, idx: -1, shareMs: (minutes * 60000) / items.length, historyId: null, advancing: false };
    state.messages = [];
    newSession();
    showInterview();
    startTimer(minutes);
    await openQuestion(0);
  }

  async function openQuestion(i) {
    const r = state.round;
    r.idx = i;
    r.qEndsAt = Date.now() + r.shareMs;
    r.warned = false;
    const it = r.items[i];
    state.question = it.question;
    state.messages = [];
    state.label = it.label;
    $('bvCatLabel').textContent = `Question ${i + 1} of ${r.items.length} · ${it.label}`;
    $('bvQuestion').textContent = it.question;
    syncHint();
    syncRoundControls();
    roundTick();
    renderLog($('bvLog'), [], true);
    await turn(i === 0 ? 'Hello — I am ready to begin.' : 'I am ready for the next question.', { hideFirstUserTurn: true });
    $('bvInput').focus();
  }

  /** Typed-but-unsent text is part of their answer; never drop it on a move. */
  function takePendingAnswer() {
    const box = $('bvInput');
    const pending = box.value.trim();
    if (pending) { state.messages.push({ role: 'user', content: pending }); box.value = ''; }
  }

  const answered = it => it.messages.some(m => m.role === 'user');

  function finishCurrent() {
    const r = state.round;
    const it = r.items[r.idx];
    it.messages = state.messages.slice();
    // Score in the background while the next question runs.
    if (answered(it) && !it.card && !it.scoring) it.scoring = scoreItem(it);
  }

  function scoreItem(it) {
    it.error = '';
    return (async () => {
      try {
        it.card = await requestScore(it.question, it.messages);
        it.card.said = saidIn(it.messages);
        it.card.question = it.question;
        captureStory(it.card);
      } catch (e) { it.error = e.message; }
      finally { it.scoring = null; }
    })();
  }

  async function nextQuestion() {
    const r = state.round;
    if (!r || r.advancing || state.busy || r.idx >= r.items.length - 1) return;
    r.advancing = true;
    dictating = false;
    window.Voice?.stopListening();
    window.Voice?.stopSpeaking?.();
    takePendingAnswer();
    finishCurrent();
    try { await openQuestion(r.idx + 1); } finally { r.advancing = false; syncRoundControls(); }
  }

  function roundTick() {
    const r = state.round;
    if (!r || r.idx < 0) return;
    const left = r.qEndsAt - Date.now();
    const last = r.idx >= r.items.length - 1;
    const el = $('bvRoundLeft');
    if (el) el.textContent = last ? 'Last question' : `${fmtMs(left)} left on this question`;
    if (last || r.advancing) return;
    if (left <= 60000 && !r.warned) {
      r.warned = true;
      flashHint('About a minute left on this question — wrap up. The next question starts automatically.');
    }
    // Do not cut someone off mid-sentence; give a typing candidate a minute's grace.
    const typing = Boolean($('bvInput').value.trim()) || dictating;
    if (left <= 0 && !state.busy && (!typing || left <= -60000)) nextQuestion();
  }

  function syncRoundControls() {
    const r = state.round;
    const next = $('bvNext'), left = $('bvRoundLeft');
    const show = Boolean(r) && r.idx < r.items.length - 1;
    if (next) { next.hidden = !show; next.disabled = state.busy || Boolean(r?.advancing); }
    if (left) left.hidden = !r;
  }

  function roundTranscript() {
    const r = state.round;
    return r.items.flatMap((it, i) => [
      { role: 'assistant', marker: true, content: `Question ${i + 1} of ${r.items.length} · ${it.label}: ${it.question}` },
      ...it.messages,
    ]);
  }

  /** The round's verdict is the typical per-question verdict, so it never
   *  reads "Hire" over four "Lean hire"s. */
  const REC_ORDER = ['strong_no_hire', 'no_hire', 'lean_hire', 'hire', 'strong_hire'];
  function overallFor(cards) {
    const ranks = cards.map(c => REC_ORDER.indexOf(c.overall)).filter(i => i >= 0);
    if (!ranks.length) return 'no_hire';
    return REC_ORDER[Math.round(ranks.reduce((a, x) => a + x, 0) / ranks.length)];
  }

  /** The combined card: every signal averaged over the answered questions,
   *  in the same shape as a single scorecard so History renders it too. */
  function roundCard() {
    const r = state.round;
    const scored = r.items.filter(it => it.card);
    if (!scored.length) return null;
    const dims = scored[0].card.dimensions.map(d => {
      const vals = scored.map(it => it.card.dimensions.find(x => x.id === d.id)?.score).filter(Number.isFinite);
      const avg = vals.reduce((a, x) => a + x, 0) / (vals.length || 1);
      return {
        id: d.id, label: d.label, hint: d.hint, score: Math.round(avg * 10) / 10, anchor: '',
        evidence: '', comment: `Average over ${vals.length} scored answer${vals.length === 1 ? '' : 's'}.`,
      };
    });
    const sum = dims.reduce((a, d) => a + d.score, 0);
    const avg = sum / dims.length;
    const uniq = list => [...new Set(list)].slice(0, 6);
    return {
      round: r.items.map(it => ({
        label: it.label, question: it.question, answered: answered(it),
        card: it.card, error: it.card ? '' : it.error,
      })),
      dimensions: dims,
      overall: overallFor(scored.map(it => it.card)),
      total: Math.round(sum * 10) / 10,
      max: dims.length * 4,
      percent: Math.round((sum / (dims.length * 4)) * 100),
      headline: `Round read across ${scored.length} of ${r.items.length} questions — average ${avg.toFixed(1)} / 4 per signal.`,
      strengths: uniq(scored.flatMap(it => it.card.strengths.slice(0, 2))),
      improvements: uniq(scored.flatMap(it => it.card.improvements.slice(0, 2))),
      modelAnswer: '',
      improvedAnswer: null,
    };
  }

  async function endRound() {
    const r = state.round;
    stopDictation();
    takePendingAnswer();
    const it = r.items[r.idx];
    it.messages = state.messages.slice();
    if (!r.items.some(answered)) {
      // Nothing to score yet; the round (and its clock) carries on.
      flashHint('Answer at least one question before scoring — the clock is still running.');
      return;
    }
    clearInterval(state.tick);
    state.endedAt = Date.now();
    window.Voice?.stopSpeaking?.();
    $('bvInterview').classList.add('hidden');
    $('bvScore').classList.remove('hidden');
    renderLog($('bvTranscript'), roundTranscript(), false);
    // Saved now, unscored, so a failed scorer cannot lose the round.
    if (!r.historyId) saveRoundHistory(null);
    $('bvScoreBody').innerHTML = `<p class="bv-typing">Scoring ${r.items.filter(answered).length} answers…</p>`;
    await Promise.all(r.items.map(x => x.scoring || (answered(x) && !x.card ? (x.scoring = scoreItem(x)) : null)));
    renderRoundSummary();
  }

  function renderRoundSummary() {
    const r = state.round;
    const card = roundCard();
    if (!card) {
      $('bvScoreBody').innerHTML = scoreFailedHtml(r.items.find(x => x.error)?.error || 'no answer could be scored', 'bvRoundRetryAll');
      $('bvRoundRetryAll').onclick = async () => {
        $('bvScoreBody').innerHTML = '<p class="bv-typing">Scoring again…</p>';
        await Promise.all(r.items.filter(x => answered(x) && !x.card).map(x => x.scoring || (x.scoring = scoreItem(x))));
        renderRoundSummary();
      };
      return;
    }
    $('bvScoreBody').innerHTML = scorecardHtml(card, { live: true });
    $('bvScoreBody').querySelectorAll('[data-round-retry]').forEach(btn => {
      btn.onclick = async () => {
        const x = r.items[Number(btn.dataset.roundRetry)];
        btn.disabled = true; btn.textContent = 'Scoring…';
        await (x.scoring || (x.scoring = scoreItem(x)));
        renderRoundSummary();
      };
    });
    saveRoundHistory(card);
  }

  function saveRoundHistory(card) {
    if (!window.History) return;
    const r = state.round;
    if (r.historyId && window.History.attachScore?.(r.historyId, card)) return;
    r.historyId = window.History.save({
      type: 'behavioural',
      startedAt: state.startedAt || Date.now(),
      endedAt: state.endedAt || Date.now(),
      durationSec: Math.round(((state.endedAt || Date.now()) - (state.startedAt || Date.now())) / 1000),
      category: `Full G&L round · ${r.items.length} questions`,
      question: `Full G&L round — ${r.items.map((x, i) => `Q${i + 1}. ${x.question}`).join(' ')}`,
      transcript: roundTranscript().map(m => ({ role: m.role, content: m.marker ? `[${m.content}]` : m.content })),
      score: card,
    });
    window.QFStories?.markImported?.(r.historyId);
  }

  // --- scoring --------------------------------------------------------------
  const REC = {
    strong_no_hire: ['Strong no hire', 'var(--red)'],
    no_hire: ['No hire', 'var(--red)'],
    lean_hire: ['Lean hire', 'var(--orange)'],
    hire: ['Hire', 'var(--green)'],
    strong_hire: ['Strong hire', 'var(--green)'],
  };
  const scoreColour = n => (n >= 3.5 ? 'var(--green)' : n >= 2.5 ? 'var(--blue)'
    : n >= 1.5 ? 'var(--orange)' : 'var(--red)');

  /** A reply that is not a real scorecard is a failure, never a low score. */
  async function requestScore(question, messages) {
    const card = await api('/api/behavioural/score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, messages, model: window.Settings?.modelFor('behaviouralScore') }),
    });
    if (!card || !Array.isArray(card.dimensions) || !card.dimensions.length
        || !Number.isFinite(card.total) || !REC[card.overall]) {
      throw new Error('the scorer sent back something that was not a scorecard');
    }
    return card;
  }

  const scoreFailedHtml = (msg, id) => `
    <div class="bv-err bv-retry-row" role="alert">
      <span><strong>Scoring failed — retry.</strong> ${esc(msg)}</span>
      <button type="button" class="primary" id="${id}">Retry scoring</button>
    </div>
    <p class="gl-muted">Your interview is already saved to History; the score is added there as soon as it comes through.</p>`;

  async function endAndScore() {
    stopDictation();
    // Typed-but-unsent text is part of the answer being scored.
    takePendingAnswer();
    if (state.round) { await endRound(); return; }
    if (!state.messages.some(m => m.role === 'user')) {
      // The interview carries on, so the clock does too.
      flashHint('Answer at least one question before scoring — the clock is still running.');
      return;
    }
    clearInterval(state.tick);
    state.endedAt = Date.now();
    window.Voice?.stopSpeaking?.();
    $('bvInterview').classList.add('hidden');
    $('bvScore').classList.remove('hidden');
    renderLog($('bvTranscript'), state.messages, false);
    await scoreSingle();
  }

  async function scoreSingle() {
    $('bvScoreBody').innerHTML = '<p class="bv-typing">Scoring your interview…</p>';
    // Save the session first, unscored: a failed or rate-limited scorer must
    // never lose a whole interview. The score is attached when it arrives.
    if (window.History && !state.historyId) {
      state.historyId = window.History.save({
        type: 'behavioural',
        startedAt: state.startedAt || Date.now(),
        endedAt: state.endedAt || Date.now(),
        durationSec: Math.round(((state.endedAt || Date.now()) - (state.startedAt || Date.now())) / 1000),
        category: state.label,
        question: state.question,
        transcript: state.messages,
        score: null,
      });
    }
    try {
      const card = await requestScore(state.question, state.messages);
      card.said = saidIn(state.messages);
      card.question = state.question;
      captureStory(card);
      renderScorecard(card);
      if (window.History) {
        // The full card: per-dimension evidence, comments and anchors plus
        // the model answer are the actual feedback.
        if (!(state.historyId && window.History.attachScore?.(state.historyId, card))) {
          state.historyId = window.History.save({
            type: 'behavioural',
            startedAt: state.startedAt || Date.now(),
            endedAt: state.endedAt || Date.now(),
            durationSec: Math.round(((state.endedAt || Date.now()) - (state.startedAt || Date.now())) / 1000),
            category: state.label, question: state.question, transcript: state.messages, score: card,
          });
        }
        window.QFStories?.markImported?.(state.historyId);
      }
    } catch (e) {
      $('bvScoreBody').innerHTML = scoreFailedHtml(e.message, 'bvScoreRetry');
      $('bvScoreRetry').onclick = scoreSingle;
    }
  }

  /** The write-up a Google interviewer files for the hiring committee. They
   *  do not decide; they submit evidence against four attributes and the
   *  committee decides. Rendered here so the practice artefact matches. */
  function packetHtml(p) {
    if (!p || !Array.isArray(p.attributes) || !p.attributes.length) return '';
    const bar = n => `<span class="hs-bar"><i style="width:${(n / 4) * 100}%;
      background:${scoreColour(n)}"></i></span>`;
    return `
      <div class="pk">
        <div class="pk-head">
          <h3>Hiring committee packet</h3>
          <span class="pk-level">Level read: ${esc(p.level)}</span>
        </div>
        <p class="pk-sub">What the interviewer submits. Google interviewers do not
          decide — they file evidence against four attributes and a committee decides.</p>
        ${p.questionAsked ? `<div class="pk-q"><strong>Question asked</strong><div>${esc(p.questionAsked)}</div></div>` : ''}
        <div class="pk-attrs">
          ${p.attributes.map(a => `
            <div class="pk-attr">
              <div class="pk-attr-name">${esc(a.label)}<span>${esc(a.hint)}</span></div>
              ${bar(a.score)}
              <b style="color:${scoreColour(a.score)}">${a.score}</b>
              <div class="pk-attr-note">${esc(a.note)}</div>
            </div>`).join('')}
        </div>
        ${p.notes ? `<div class="pk-block"><strong>Interview notes</strong><div>${esc(p.notes)}</div></div>` : ''}
        ${p.toCommittee ? `<div class="pk-block pk-rec"><strong>To the committee</strong><div>${esc(p.toCommittee)}</div></div>` : ''}
      </div>`;
  }

  /**
   * Their own answer rewritten to strong-hire standard. Anything the model
   * supplied that they never said is shown bold and listed underneath, so the
   * story stays theirs and they do not memorise an invented detail.
   */
  /** What they said, next to the same story rewritten to strong-hire
   *  standard — the fastest way to see what a Google answer needs. */
  function improvedHtml(imp, said, question) {
    if (!imp?.spans?.length) return '';
    const body = imp.spans.map(sp => sp.added
      ? `<strong class="imp-add">${esc(sp.text)}</strong>`
      : esc(sp.text)).join('');
    const plain = imp.spans.map(sp => sp.text).join('');
    const words = t => String(t || '').trim().split(/\s+/).filter(Boolean).length;
    return `
      <div class="imp" data-q="${esc(question || '')}" data-text="${esc(plain)}">
        <div class="imp-head">
          <h3>Your answer vs a Google-ready version</h3>
          ${imp.addedCount ? `<span class="imp-key"><strong class="imp-add">bold</strong>
            = not in your answer, added to reach strong hire</span>` : ''}
        </div>
        <div class="imp-compare">
          ${said ? `<section class="imp-col imp-said" aria-label="What you said">
            <h4>What you said <span class="gl-muted">· ${words(said)} words</span></h4>
            <div class="imp-said-body">${esc(said)}</div></section>` : ''}
          <section class="imp-col imp-best" aria-label="Google-ready version">
            <h4>Google-ready version <span class="gl-muted">· ${words(plain)} words, about ${Math.max(1, Math.round(words(plain) / 140))} min spoken</span></h4>
            <div class="imp-body">${body}</div></section>
        </div>
        ${imp.additions.length ? `
          <div class="imp-list">
            <h4>What changed, and the Google signal it shows</h4>
            <ul>${imp.additions.map(a => `<li><strong>${esc(String(a.text || '').replace(/\[\[|\]\]/g, ''))}</strong>${
              a.why ? ` — ${esc(a.why)}` : ''}</li>`).join('')}</ul>
            <p class="imp-warn">Check every bold part against what actually happened before
              you use it. Anything you cannot stand behind, cut or replace with the real figure.</p>
          </div>` : ''}
        <div class="imp-actions">
          <button type="button" class="ghost" data-imp="copy">Copy the Google-ready version</button>
          <button type="button" class="ghost" data-imp="save">Open in My stories</button>
          ${question ? '<button type="button" class="primary" data-imp="again">Practise this question again</button>' : ''}
        </div>
      </div>`;
  }

  // One handler for every compare block, wherever it is rendered (score page,
  // round breakdown, History).
  document.addEventListener('click', async e => {
    const btn = e.target.closest('.imp [data-imp]');
    if (!btn) return;
    const box = btn.closest('.imp');
    const text = box.dataset.text || '', q = box.dataset.q || '';
    if (btn.dataset.imp === 'copy') {
      try { await navigator.clipboard.writeText(text); btn.textContent = 'Copied ✓'; } catch { btn.textContent = 'Select and copy the text above'; }
    } else if (btn.dataset.imp === 'save') {
      // Already captured automatically when it was scored; open the bank on it.
      window.QFStories?.open?.('questions', q);
    } else if (btn.dataset.imp === 'again' && q) {
      window.setInterviewMode?.('behavioural');
      window.behaviouralPractise?.(q, 'Practise again');
    }
  });

  /** Every scored answer becomes a story in My stories (your words + the rewrite). */
  function captureStory(card) {
    const improved = card.improvedAnswer?.spans?.map(sp => sp.text).join('') || '';
    try { window.QFStories?.addFromInterview?.({ question: card.question, said: card.said, improved, card }); } catch { /* the score still shows */ }
  }

  /** The candidate's own words for a transcript, joined. */
  const saidIn = messages => (messages || []).filter(m => m.role === 'user').map(m => String(m.content || '').trim()).filter(Boolean).join('\n\n');

  /** A full round's per-question breakdown. Retry buttons only on the live
   *  page; History renders the same card without them. */
  function roundHtml(round, live) {
    if (!Array.isArray(round) || !round.length) return '';
    return `
      <div class="bv-round">
        <h3>Question by question</h3>
        <ol class="bv-round-list">
          ${round.map((q, i) => {
            const [lbl, col] = q.card ? (REC[q.card.overall] || ['—', 'var(--muted)']) : ['', ''];
            const status = q.card
              ? `<span class="bv-round-rec" style="color:${col}">${esc(lbl)} · ${q.card.total}/${q.card.max}</span>`
              : !q.answered ? '<span class="gl-muted">Not answered</span>'
              : `<span class="bv-err">Scoring failed${q.error ? `: ${esc(q.error)}` : ''}</span>
                 ${live ? `<button type="button" class="ghost" data-round-retry="${i}">Retry</button>` : ''}`;
            return `<li class="bv-round-item">
              <div class="bv-round-top">
                <div><div class="bv-qlabel">${esc(q.label)}</div><div class="bv-round-q">${esc(q.question)}</div></div>
                <div class="bv-round-status">${status}</div>
              </div>
              ${q.card ? `<div class="bv-headline">${esc(q.card.headline)}</div>
                ${improvedHtml(q.card.improvedAnswer, q.card.said, q.card.question || q.question)}
                <details class="bv-round-more"><summary>Full write-up for this answer</summary>${scorecardHtml({ ...q.card, improvedAnswer: null })}</details>` : ''}
            </li>`;
          }).join('')}
        </ol>
      </div>`;
  }

  function scorecardHtml(c, { live = false } = {}) {
    const [recLabel, recColour] = REC[c.overall] || REC.no_hire;
    const avg = c.dimensions.reduce((a, d) => a + d.score, 0) / c.dimensions.length;
    return `${c.round ? `<p class="bv-qlabel">Full Googleyness &amp; Leadership round · combined read</p>` : ''}
      <div class="bv-verdict">
        <div class="bv-ring" style="background:
          conic-gradient(${recColour} ${c.percent * 3.6}deg, var(--bg-alt) 0);">
          <span style="background:var(--panel);width:66px;height:66px;border-radius:50%;
                display:grid;place-items:center;">${c.total}/${c.max}</span>
        </div>
        <div>
          <div class="bv-rec" style="color:${recColour}">${esc(recLabel)}</div>
          <div class="bv-headline">${esc(c.headline)}</div>
        </div>
      </div>
      ${roundHtml(c.round, live)}
      ${c.round ? '<h3 class="bv-round-h">Signals averaged across the round</h3>' : ''}
      <div class="bv-dims">
        ${c.dimensions.map(d => `
          <div class="bv-dim">
            <div>
              <div class="bv-dim-name">${esc(d.label)}</div>
              <div class="bv-dim-hint">${esc(d.hint)}</div>
            </div>
            <div>
              <div class="bv-bar"><span style="width:${(d.score / 4) * 100}%;
                background:${scoreColour(d.score)}"></span></div>
              <div class="bv-dim-comment">${esc(d.comment)}</div>
              ${d.anchor ? `<div class="bv-dim-anchor">Scored ${d.score}: ${esc(d.anchor)}</div>` : ''}
              ${d.evidence ? `<div class="bv-dim-ev">${esc(d.evidence)}</div>` : ''}
            </div>
            <div class="bv-dim-score" style="color:${scoreColour(d.score)}">${d.score}</div>
          </div>`).join('')}
      </div>
      <div class="bv-cols">
        <div class="bv-card"><h3>Strengths</h3><ul>${
          (c.strengths.length ? c.strengths : ['—']).map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>
        <div class="bv-card"><h3>Work on</h3><ul>${
          (c.improvements.length ? c.improvements : ['—']).map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>
      </div>
      ${improvedHtml(c.improvedAnswer, c.said, c.question)}
      ${c.modelAnswer ? `<div class="bv-model"><h3>How a level-4 answer would sound</h3>
        <div>${esc(c.modelAnswer)}</div></div>` : ''}
      ${packetHtml(c.packet)}
      <p class="bv-hint">Average ${avg.toFixed(1)} / 4 across ${c.dimensions.length} dimensions.</p>`;
  }

  function renderScorecard(c) {
    $('bvScoreBody').innerHTML = scorecardHtml(c);
  }
  // History renders the same report from the same builder, so the two can
  // never drift apart.
  window.scorecardHtml = scorecardHtml;

  // --- voice ----------------------------------------------------------------
  // Reading the interviewer aloud and answering by speech are independent:
  // some people want to hear the question but still type, so they are two
  // controls rather than one "voice mode".
  let speakReplies = false;
  // True only while a dictation is actively allowed to write into the box.
  let dictating = false;
  // Distinguishes our own writes from the candidate's typing, so typing can
  // end a dictation instead of being overwritten by the next partial result.
  let selfWrite = false;

  function syncVoiceButtons() {
    const mic = $('bvMic'), spk = $('bvSpeak');
    if (mic) {
      const ok = window.Voice?.canListen();
      mic.disabled = !ok;
      mic.title = ok ? 'Answer by voice' : (window.Voice?.why() || 'Voice input is unavailable here');
      mic.classList.toggle('is-disabled', !ok);
    }
    if (spk) {
      const ok = window.Voice?.canSpeak();
      spk.disabled = !ok;
      spk.classList.toggle('active', speakReplies && ok);
      spk.setAttribute('aria-pressed', String(speakReplies && ok));
      spk.title = ok ? (speakReplies ? 'Stop reading replies aloud' : 'Read the interviewer aloud')
                     : 'Speech output is unavailable here';
    }
  }

  function maybeSpeak(text) {
    if (speakReplies && window.Voice?.canSpeak()) window.Voice.speak(text);
  }

  function initVoice() {
    if (!window.Voice) return;
    speakReplies = Boolean(window.Voice.prefs().output);
    const mic = $('bvMic'), spk = $('bvSpeak');

    spk?.addEventListener('click', () => {
      speakReplies = !speakReplies;
      window.Voice.setPrefs({ output: speakReplies });
      if (!speakReplies) window.Voice.stopSpeaking();
      syncVoiceButtons();
    });

    mic?.addEventListener('click', () => {
      if (window.Voice.listening()) { window.Voice.stopListening(); return; }
      const box = $('bvInput');
      // Captured per dictation, and abandoned if the box is cleared (by Send)
      // while recognition is still running — otherwise the transcript we just
      // sent gets written straight back into the empty box.
      let before = box.value ? box.value.trim() + ' ' : '';
      const write = t => {
        if (!dictating) return;
        // Recognisers mangle Big-O and identifiers; repair before it is shown.
        const fixed = window.Dictation?.normaliseTechnical(t) ?? t;
        selfWrite = true;
        box.value = (before + fixed).trimStart();
        selfWrite = false;
      };
      dictating = true;
      mic.classList.add('recording');
      window.Voice.listen({
        onPartial: write,
        onResult: t => { write(t); box.value = box.value.trim(); },
        onError: msg => {
          const hint = document.querySelector('#bvInterview .bv-hint');
          if (hint) { hint.textContent = msg; hint.classList.add('bv-err'); }
        },
        onEnd: () => {
          dictating = false;
          mic.classList.remove('recording');
          // Sending is left to the candidate: an interview answer often needs
          // a moment's edit, and auto-send would cut people off mid-thought.
          box.focus();
        },
      });
    });
    // Typing is an explicit switch back to text: stop listening and keep what
    // they wrote, rather than letting the next transcript clobber it.
    $('bvInput')?.addEventListener('input', () => {
      if (!dictating || selfWrite) return;
      dictating = false;
      window.Voice?.stopListening();
      $('bvMic')?.classList.remove('recording');
    });

    syncVoiceButtons();
    window.addEventListener('voiceprefschanged', () => {
      speakReplies = Boolean(window.Voice.prefs().output);
      syncVoiceButtons();
    });
  }

  // --- Googleyness attributes sheet ------------------------------------------
  // What a G&L interviewer is actually listening for, attribute by attribute,
  // with a one-click way to practise each on a question that tests it.
  const ATTRIBUTES = [
    {
      name: 'Thriving in ambiguity',
      listen: ['You create structure: clarify the goal, state assumptions, pick a first step', 'You move before everything is known, and say how you de-risked it', 'You re-plan calmly when the facts change'],
      red: ['Waiting for someone to define the problem', 'Blaming unclear requirements for the outcome', '"We figured it out" with no account of how'],
      outline: ['Situation: what was unclear, and what was at stake if nobody acted.', 'Action: how you framed it — the questions you asked, the assumption you made, the small bet you shipped first.', 'Result: what became clear, the measurable outcome, and how you would frame it faster now.'],
      question: 'Describe a time you joined a project with no clear direction. What did you do in the first couple of weeks?',
    },
    {
      name: 'Valuing feedback',
      listen: ['You asked for feedback, not just received it', 'A specific change in behaviour, with evidence it stuck', 'You give feedback kindly and directly, too'],
      red: ['Defensiveness, or "the feedback was wrong"', 'A humble-brag weakness', 'No visible change afterwards'],
      outline: ['Situation: the feedback, quoted as close to verbatim as you can, and who gave it.', 'Action: what you did with it — how you checked it was fair, the habit you changed.', 'Result: the later moment where the change paid off, ideally one someone else noticed.'],
      question: 'Describe a time you received critical feedback and what you actually changed.',
    },
    {
      name: 'Challenging the status quo',
      listen: ['You questioned a process with evidence, not opinion', 'You proposed an alternative and ran a small test', 'You brought people along rather than going around them'],
      red: ['Change for its own sake', 'Complaining without proposing anything', 'Steamrolling the people who owned the old way'],
      outline: ['Situation: the accepted way of doing things, and the cost it was quietly causing.', 'Action: the data you gathered, the pilot you proposed, how you handled pushback.', 'Result: what changed, the number before and after, and who adopted it.'],
      question: 'Tell me about a time you challenged the way things had always been done.',
    },
    {
      name: 'Putting the user first',
      listen: ['You can name the user and what they needed', 'A trade-off where the user won, and what it cost', 'You used user data or feedback to decide'],
      red: ['"The user" as an abstraction with no detail', 'Shipping to a deadline you knew would hurt users, without raising it', 'No measure of user impact'],
      outline: ['Situation: who the user was and the pain they had.', 'Action: the decision you made for them, what you gave up, and how you made the case.', 'Result: the user-side outcome — adoption, complaints, time saved — with a number.'],
      question: 'Tell me about a time you put the user first even though it cost you or your team something.',
    },
    {
      name: 'Doing the right thing',
      listen: ['You own mistakes early and openly', 'Integrity when the easy path was available', 'You fixed the cause, not just the symptom'],
      red: ['Hiding or minimising a mistake', 'Blaming another team or person', 'A "failure" that is really a success story'],
      outline: ['Situation: what went wrong, or what the tempting shortcut was.', 'Action: how you raised it, who you told and when, and what you did to put it right.', 'Result: the outcome, and the safeguard you added so it cannot recur.'],
      question: 'Tell me about a time you messed up. How did you find out, and how did you fix it?',
    },
    {
      name: 'Caring about the team',
      listen: ['You noticed someone struggling without being told', 'Concrete help: pairing, unblocking, sharing credit', 'The team got better, not just the task done'],
      red: ['Helping only when it was your job', 'Taking over instead of enabling', 'Others appear only as obstacles'],
      outline: ['Situation: who was struggling and why it mattered to the team.', 'Action: exactly what you did — time you gave, what you taught, what you took off their plate.', 'Result: how they and the team did afterwards, in their terms, not yours.'],
      question: 'Tell me about a time you helped a teammate who was struggling, when it was not your job to.',
    },
    {
      name: 'Bias to action',
      listen: ['You decided with incomplete data and said why that was acceptable', 'You made the decision reversible or cheap to undo', 'You followed up and corrected course'],
      red: ['Analysis paralysis, or waiting for permission', 'Reckless action with no thought to risk', 'No follow-up on whether it worked'],
      outline: ['Situation: the decision, the deadline, and what data was missing.', 'Action: the options, the call you made, and how you limited the downside.', 'Result: what happened, what you learned, and what you adjusted once the data arrived.'],
      question: 'Tell me about a time you had to make a decision without enough data.',
    },
    {
      name: 'Collaboration and inclusion',
      listen: ['You sought out different perspectives on purpose', 'You made room for quieter or remote voices', 'Disagreement handled with respect, ending in a shared decision'],
      red: ['"I just did it myself"', 'Dismissing a discipline or background as not technical enough', 'Consensus by exhaustion'],
      outline: ['Situation: the people involved and how differently they saw the problem.', 'Action: how you brought them in — the forum, the questions, what you changed because of them.', 'Result: the outcome and why it was better for having those people in it.'],
      question: 'Describe a time you worked closely with people from a very different discipline or background.',
    },
  ];

  function attributesHtml() {
    const list = items => `<ul>${items.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`;
    return `
      <summary>
        <span class="ga-title">Googleyness attributes</span>
        <span class="ga-sub">What the interviewer listens for, the red flags, and a strong-answer outline for each of the eight.</span>
      </summary>
      <div class="ga-grid">
        ${ATTRIBUTES.map((a, i) => `
          <article class="ga-attr" aria-labelledby="gaName${i}">
            <h3 id="gaName${i}">${esc(a.name)}</h3>
            <div class="ga-cols">
              <div><h4>Listen for</h4>${list(a.listen)}</div>
              <div><h4>Red flags</h4>${list(a.red)}</div>
            </div>
            <h4>Strong answer, in three lines</h4>
            <ol class="ga-outline">${a.outline.map(x => `<li>${esc(x)}</li>`).join('')}</ol>
            <div class="ga-foot">
              <span class="gl-muted ga-q">“${esc(a.question)}”</span>
              <button type="button" class="ghost ga-practise" data-i="${i}">Practise this</button>
            </div>
          </article>`).join('')}
      </div>`;
  }

  /** Controls index.html does not have yet: the attributes sheet, the round
   *  note, the Next-question button and the chooser's Cancel button. */
  function injectExtras() {
    const cats = $('bvCats');
    if (cats && !$('bvAttrs')) {
      const sheet = document.createElement('details');
      sheet.id = 'bvAttrs';
      sheet.className = 'ga-sheet';
      sheet.innerHTML = attributesHtml();
      cats.before(sheet);
      try { sheet.open = localStorage.getItem('bv.attrsOpen') === '1'; } catch { /* private mode */ }
      sheet.addEventListener('toggle', () => { try { localStorage.setItem('bv.attrsOpen', sheet.open ? '1' : '0'); } catch { /* private mode */ } });
      sheet.querySelectorAll('.ga-practise').forEach(b => {
        b.onclick = () => window.behaviouralPractise(ATTRIBUTES[Number(b.dataset.i)].question, `Googleyness · ${ATTRIBUTES[Number(b.dataset.i)].name}`);
      });
    }
    const startRow = $('bvStart')?.closest('.bv-setup-row');
    if (startRow && !$('bvRoundNote')) {
      startRow.insertAdjacentHTML('afterend', `<p id="bvRoundNote" class="bv-round-note" hidden>
        <strong>Full G&amp;L round.</strong> Four questions in one sitting — Googleyness, one actually asked at Google,
        conflict or ambiguity, and leadership — with an equal share of the time each. The next question starts by
        itself when a share runs out, or press <em>Next question</em>. Each answer is scored, then combined.
        The area picked above is not used.</p>`);
    }
    const end = $('bvEnd');
    if (end && !$('bvNext')) {
      end.insertAdjacentHTML('beforebegin', '<button type="button" id="bvNext" class="ghost" hidden>Next question</button>');
      $('bvNext').onclick = () => nextQuestion();
    }
    const label = $('bvCatLabel');
    if (label && !$('bvRoundLeft')) {
      label.insertAdjacentHTML('afterend', '<div id="bvRoundLeft" class="bv-round-left" aria-live="off" hidden></div>');
    }
    injectAskCancel();
  }

  /** The Text / Voice chooser had no way out but Escape. Its markup and logic
   *  live elsewhere, so the button is added here: it records the cancel, then
   *  closes the dialog through its own Escape handler and puts the voice
   *  preferences back the way they were (Escape would set them to text). */
  function injectAskCancel() {
    const box = document.querySelector('#modeAsk .ask-box');
    if (!box || box.querySelector('.ask-cancel')) return;
    const row = document.createElement('div');
    row.className = 'ask-cancel-row';
    row.innerHTML = '<button type="button" class="ghost ask-cancel">Cancel</button>';
    box.appendChild(row);
    row.querySelector('.ask-cancel').onclick = () => {
      const before = window.Voice?.prefs?.();
      askCancelled = true;
      // Dispatched from inside the dialog so handlers that read e.target get an element.
      row.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      if (before && window.Voice?.setPrefs) {
        window.Voice.setPrefs({ input: before.input, output: before.output });
        window.dispatchEvent(new CustomEvent('voiceprefschanged'));
      }
      // Escape alone (no Cancel) still means "text" for the other callers.
      setTimeout(() => { askCancelled = false; }, 0);
    };
  }

  // --- wiring ---------------------------------------------------------------
  function init() {
    if (!$('bvLayout')) return;
    $('modeCoding').onclick = () => setMode('coding');
    $('modeBehavioural').onclick = () => setMode('behavioural');
    if ($('modeResume')) $('modeResume').onclick = () => setMode('resume');
    if ($('modeToolkit')) $('modeToolkit').onclick = () => setMode('toolkit');
    if ($('modeRealq')) $('modeRealq').onclick = () => setMode('realq');
    if ($('modeHistory')) $('modeHistory').onclick = () => setMode('history');
    if ($('modeSettings')) $('modeSettings').onclick = () => setMode('settings');
    if ($('modeLearn')) $('modeLearn').onclick = () => setMode('learn');
    if ($('modeProLearn')) $('modeProLearn').onclick = () => setMode('prolearn');
    if ($('modeSmart')) $('modeSmart').onclick = () => setMode('smart');
    if ($('modeNeetcode')) $('modeNeetcode').onclick = () => setMode('neetcode');
    if ($('modeGoogle')) $('modeGoogle').onclick = () => setMode('google');
    if ($('modeWatch')) $('modeWatch').onclick = () => setMode('watch');
    if ($('modeTalk')) $('modeTalk').onclick = () => setMode('talk');
    if ($('modeHome')) $('modeHome').onclick = () => setMode('home');
    if ($('modeHftPrep')) $('modeHftPrep').onclick = () => setMode('hftprep');
    if ($('modeHftPractice')) $('modeHftPractice').onclick = () => setMode('hftpractice');
    if ($('modeHftHub')) $('modeHftHub').onclick = () => setMode('hfthub');
    if ($('modeHftTopics')) $('modeHftTopics').onclick = () => setMode('hfttopics');
    if ($('modeHftCoach')) $('modeHftCoach').onclick = () => setMode('hftcoach');
    if ($('trackSel')) $('trackSel').onchange = e => setTrack(e.target.value);
    setTrack(currentTrack(), { keepMode: true });
    $('bvStart').onclick = start;
    $('bvSend').onclick = send;
    $('bvEnd').onclick = endAndScore;
    $('bvAgain').onclick = () => {
      state.round = null;
      $('bvScore').classList.add('hidden');
      $('bvTranscript').classList.add('hidden');
      $('bvSetup').classList.remove('hidden');
    };
    $('bvReview').onclick = () => $('bvTranscript').classList.toggle('hidden');
    // An unscored interview lives only in this page: warn before a reload or
    // close throws it away. Once scored it is in History and the view moves on.
    window.addEventListener('beforeunload', e => {
      if ($('bvInterview').classList.contains('hidden')) return;
      const said = state.messages.some(m => m.role === 'user') || Boolean($('bvInput').value.trim())
        || Boolean(state.round?.items.some(answered));
      if (!said) return;
      e.preventDefault();
      e.returnValue = '';
    });
    initVoice();
    $('bvSurprise')?.addEventListener('change', e => {
      if (e.target.checked) {
        document.querySelectorAll('.bv-cat').forEach(b => { b.classList.remove('sel'); b.setAttribute('aria-pressed', 'false'); });
        state.category = null;
      }
      syncStartButton();
    });
    injectExtras();
    $('bvLen')?.addEventListener('change', syncStartButton);
    syncStartButton();
    $('bvInput').addEventListener('keydown', e => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); send(); }
    });
    let saved = 'coding';
    try { saved = localStorage.getItem('mode') || 'home'; } catch { /* private mode */ }
    const params = new URLSearchParams(location.search);
    if (params.has('q')) saved = 'coding';
    // A popped-out page: /?view=realq&id=q1 opens that page directly.
    const view = params.get('view'), id = params.get('id') || '';
    if (view && MODES.includes(view) && view !== 'coding') {
      const openers = { realq: window.openRealq, toolkit: window.openToolkit, prolearn: window.openProLearn, smart: window.openSmart,
        learn: window.Learn?.openPattern, hftprep: window.openHft, hftpractice: window.openHft };
      if (id && openers[view]) { openers[view](id); return; }
      saved = view;
    }
    setMode(saved);
  }

  // The interviewer and scorer both need the model; reflect that in the tab.
  /** Start a behavioural interview on an arbitrary question (used by the
   *  resume tab's "Practise" buttons). */
  window.behaviouralPractise = async function (question, label) {
    setMode('behavioural');
    if (!state.categories.length) await loadCategories();
    // Same Text / Voice choice as Start interview; Cancel leaves you on setup.
    askCancelled = false;
    if (typeof window.askInterviewMode === 'function') await window.askInterviewMode();
    if (askCancelled) { askCancelled = false; return; }
    window.BehaviouralBank?.close?.();
    state.round = null;
    state.question = question;
    state.messages = [];
    newSession();
    state.label = label || 'From your resume';
    $('bvCatLabel').textContent = state.label;
    $('bvQuestion').textContent = question;
    showInterview();
    startTimer(Number($('bvLen').value) || 25);
    renderLog($('bvLog'), [], true);
    await turn('Hello — I am ready to begin.', { hideFirstUserTurn: true });
    $('bvInput').focus();
  };

  window.behaviouralSetAvailable = function (ok) {
    if (ok) return;
    for (const id of ['modeBehavioural', 'modeResume', 'modeProLearn']) {
      const b = $(id);
      if (!b) continue;
      b.disabled = true;
      b.title = 'Model not configured on the server';
      b.classList.add('is-disabled');
    }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
