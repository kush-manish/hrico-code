/* Interviewer agent panel. Three personas with different levels of proactivity. */
(function () {
  const $ = id => document.getElementById(id);
  const pane = $('chatPane'), log = $('chatLog'), input = $('chatInput');
  const personaSel = $('personaSel');

  const HINTS = {
    phonescreen: 'Clarify → algorithm → code → optimise & test',
    helper: 'Pair-programs with you, gives TC/SC',
    recruiter: 'Nudges only when you stall',
    silent: 'Answers only when asked',
  };

  const OPENERS = {
    phonescreen: "We've got 45 minutes. I'll give you a problem — ask me anything you need, talk me through the idea before you code, then we'll test it together.",
    helper: "I'm here to work through this with you. Walk me through your first instinct and I'll tell you where it lands on time and space.",
    recruiter: 'Take your time. Talk me through your approach before you start coding.',
    silent: "Whenever you're ready. Let me know if you have questions about the problem.",
  };

  let persona = localStorage.getItem('persona') || 'recruiter';
  // Who is interviewing, for this session. Fetched when the interview starts
  // so each one is a different person on a different team.
  let interviewer = null;
  let history = [];
  // Every turn with the time it happened, kept in full (history is trimmed
  // for the model). Pacing in the write-up reads it: when complexity was
  // first stated, for instance.
  let timeline = [];
  let idleTimer = null;
  let lastNudgeCode = '';
  let busy = false;

  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

  function md(text) {
    return esc(text)
      .replace(/```(\w*)\n([\s\S]*?)```/g, (_, l, c) => `<pre><code>${c}</code></pre>`)
      .replace(/`([^`\n]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  }

  function bubble(who, text, cls = '') {
    const el = document.createElement('div');
    el.className = `msg ${cls}`;
    el.innerHTML = `<div class="who">${esc(who)}</div><div class="bubble">${md(text)}</div>`;
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
    return el;
  }

  function personaLabel() {
    return personaSel.options[personaSel.selectedIndex]?.text || 'Interviewer';
  }

  function lastResultText() {
    const r = document.getElementById('result');
    return r && !r.classList.contains('result-empty') ? r.innerText : '';
  }

  /** One quiet retry: a network blip or a server restart both surface as a
   *  generic fetch failure, and neither is worth showing the candidate. */
  async function postChat(body, attempt = 0) {
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
      return data;
    } catch (err) {
      const transient = err instanceof TypeError || /load failed|network|fetch/i.test(err.message);
      if (transient && attempt === 0) {
        await new Promise(r => setTimeout(r, 900));
        return postChat(body, 1);
      }
      throw transient
        ? new Error('Lost connection to the server. Your answer is back in the box — try sending it again.')
        : err;
    }
  }

  /** Interview-flow hints for the server prompt, from app.js's session. */
  function flowContext(extra) {
    const s = window.QF_SESSION;
    if (!s?.running) return { ...extra };
    const el = Date.now() - s.startedAt;
    const mm = `${String(Math.floor(el / 60000)).padStart(2, '0')}:${String(Math.floor(el / 1000) % 60).padStart(2, '0')}`;
    return { realistic: !!s.realistic, phase: s.phaseLabel || undefined, elapsed: mm, ...extra };
  }

  /** Keeps a request small: the newest messages only, at most `maxN` of them
   *  and `maxChars` characters in all (the newest one is always kept). */
  function fitMessages(list, maxChars = 20000, maxN = 40) {
    const out = list.slice(-maxN);
    let total = out.reduce((a, m) => a + String(m.content || '').length, 0);
    while (out.length > 1 && total > maxChars) total -= String(out.shift().content || '').length;
    return out;
  }
  window.QFFitMessages = fitMessages;

  async function ask(userText, { silentUser = false, flow = {}, quiet = false } = {}) {
    if (busy) return false;
    busy = true;
    if (userText && !silentUser) bubble('You', userText, 'me');
    const pending = bubble(personaLabel(), 'thinking…', 'thinking');

    const messages = [...history];
    if (userText) messages.push({ role: 'user', content: userText });

    try {
      const rawCode = window.Editor.value;
      const numberedCode = rawCode.split('\n').map((l, i) => `${i + 1}: ${l}`).join('\n');

      const data = await postChat({
        persona,
        messages: fitMessages(messages),
        model: window.Settings?.modelFor('codingChat'),
        interviewer,
        profile: window.Profile?.active(),
        context: {
          title: window.currentQuestion?.title,
          difficulty: window.currentQuestion?.difficulty,
          statement: window.currentQuestion?.plainStatement,
          code: numberedCode,
          lang: $('langSel').value,
          testInput: $('testInput')?.value,
          lastResult: lastResultText(),
          timeLeft: $('timer').textContent,
          ...flowContext(flow),
        },
      });

      pending.remove();
      bubble(personaLabel(), data.reply);
      window.codingSpeak?.(data.reply);
      // Stage directions sent on the candidate's behalf (nudges, the
      // follow-up cue) are for this one reply; keeping them out of history
      // keeps them out of the transcript the write-up is scored on.
      if (userText && !silentUser) history.push({ role: 'user', content: userText });
      history.push({ role: 'assistant', content: data.reply });
      const now = Date.now();
      if (userText && !silentUser) timeline.push({ role: 'user', content: userText, at: now });
      timeline.push({ role: 'assistant', content: data.reply, at: now });
      timeline = timeline.slice(-200);
      history = history.slice(-16);
      return true;
    } catch (e) {
      pending.remove();
      // A background follow-up that fails is retried by app.js later; the
      // candidate does not need to see an error for something they did not ask.
      if (!quiet) bubble('System', e.message);
      return false;
    } finally {
      busy = false;
    }
  }
  async function send() {
    const text = input.value.trim();
    if (!text) return;
    // End any dictation first: recognition is continuous, so a live session
    // would otherwise write its accumulated transcript back into the box we
    // are about to clear.
    dictating = false;
    window.Voice?.stopListening();
    $('chatMic')?.classList.remove('recording');
    input.value = '';
    // A long dictated answer is expensive to produce again, so put it back if
    // the send did not land.
    const ok = await ask(text);
    if (!ok && !input.value.trim()) {
      input.value = text;
      input.focus();
    }
  }

  // Typing ends any live dictation, so a transcript cannot overwrite it.
  input.addEventListener('input', () => {
    // Typing is activity: push the quiet timer back so the interviewer does
    // not cut across an answer being written.
    if (!selfWrite) scheduleNudge();
    if (!dictating || selfWrite) return;
    dictating = false;
    window.Voice?.stopListening();
    $('chatMic')?.classList.remove('recording');
  });

  $('chatSend').onclick = send;
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  });

  $('panelBtn').onclick = () => {
    const solPane = $('solutionPane');
    if (solPane && !solPane.classList.contains('hidden')) {
      solPane.classList.add('hidden');
      $('solutionBtn')?.classList.remove('active');
    }
    pane.classList.toggle('hidden');
    const open = !pane.classList.contains('hidden');
    $('panelBtn').classList.toggle('active', open);
    $('panelBtn').title = open ? 'Close the interviewer panel' : 'Open the AI interviewer panel';
    if (!pane.classList.contains('hidden')) input.focus();
  };

  // --- voice ---------------------------------------------------------------
  let speakReplies = Boolean(window.Voice?.prefs().output);
  let dictating = false;
  // Separates our own writes from the candidate's typing.
  let selfWrite = false;

  function syncVoice() {
    const mic = $('chatMic'), spk = $('chatSpeak');
    if (mic) {
      const ok = window.Voice?.canListen();
      mic.disabled = !ok;
      mic.title = ok ? 'Speak your answer' : (window.Voice?.why() || 'Voice input is unavailable');
      mic.classList.toggle('is-disabled', !ok);
    }
    if (spk) {
      const ok = window.Voice?.canSpeak();
      spk.disabled = !ok;
      spk.classList.toggle('active', speakReplies && ok);
      spk.setAttribute('aria-pressed', String(speakReplies && ok));
    }
  }

  $('chatSpeak')?.addEventListener('click', () => {
    speakReplies = !speakReplies;
    window.Voice?.setPrefs({ output: speakReplies });
    if (!speakReplies) window.Voice?.stopSpeaking();
    syncVoice();
  });

  $('chatMic')?.addEventListener('click', () => {
    if (window.Voice?.listening()) { window.Voice.stopListening(); return; }
    const before = input.value ? input.value.trim() + ' ' : '';
    const write = t => {
      if (!dictating) return;
      const fixed = window.Dictation?.normaliseTechnical(t) ?? t;
      selfWrite = true;
      input.value = (before + fixed).trimStart();
      selfWrite = false;
    };
    dictating = true;
    $('chatMic').classList.add('recording');
    window.Voice.listen({
      onError: m => window.QF?.toast?.(m),
      onPartial: write,
      onResult: t => { write(t); input.value = input.value.trim(); },
      onEnd: () => {
        dictating = false;
        $('chatMic').classList.remove('recording');
        input.focus();
      },
    });
  });

  // The Start dialog changes these prefs, so follow it rather than only
  // reacting to this panel's own button.
  window.addEventListener('voiceprefschanged', () => {
    speakReplies = Boolean(window.Voice?.prefs().output);
    syncVoice();
  });

  window.codingSpeak = text => {
    if (speakReplies && window.Voice?.canSpeak()) window.Voice.speak(text);
  };
  syncVoice();

  // The interviewer's own opening for this mock, re-shown after a Clear.
  let greeting = '';
  const mockRunning = () => Boolean(window.QF_SESSION?.running) || Boolean($('stopBtn') && !$('stopBtn').disabled);

  $('chatClear').onclick = () => {
    // During a mock the transcript is what the write-up is scored on, so the
    // log and the transcript are cleared together, and only after asking.
    if (mockRunning() && !confirm('Clear the conversation? The write-up is scored on the conversation, so what you clear here will not count.')) return;
    history = []; timeline = []; log.innerHTML = '';
    if (mockRunning() && greeting) {
      greet(greeting);
      history.push({ role: 'assistant', content: greeting });
      timeline.push({ role: 'assistant', content: greeting, at: Date.now() });
    } else greet();
  };

  /** The interviewer cannot change mid-mock: switching wipes the conversation. */
  function syncPersonaLock() {
    const lock = mockRunning();
    personaSel.disabled = lock;
    personaSel.title = lock ? 'The interviewer cannot change during a mock interview' : '';
  }
  { const sb = $('stopBtn'); if (sb) new MutationObserver(syncPersonaLock).observe(sb, { attributes: true, attributeFilter: ['disabled'] }); }

  function greet(text) {
    bubble(personaLabel(), text || OPENERS[persona]);
  }

  /**
   * Called when the candidate presses Start. Pulls a fresh interviewer and
   * opens the way a real one does — who they are, what they work on, and a
   * question about the candidate — before any code is written.
   */
  window.beginCodingInterview = async function () {
    history = [];
    timeline = [];
    log.innerHTML = '';
    try {
      const r = await fetch('/api/interviewer');
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'could not load interviewer');
      interviewer = d.interviewer;
      $('personaName').textContent = interviewer.firstName;
      setHint(`${interviewer.team} · ${interviewer.office}`);
      greeting = d.greeting;
      greet(d.greeting);
      history.push({ role: 'assistant', content: d.greeting });
      // The opening question belongs in the transcript the write-up reads.
      timeline.push({ role: 'assistant', content: d.greeting, at: Date.now() });
      window.codingSpeak?.(d.greeting);
    } catch {
      greeting = '';
      greet();                       // a missing identity must not block the interview
    }
    syncPersonaLock();
  };

  function applyPersona() {
    // Never wipe a running mock's conversation (the select is disabled then;
    // this covers a change that slips through).
    if (mockRunning()) { personaSel.value = persona; syncPersonaLock(); return; }
    persona = personaSel.value;
    localStorage.setItem('persona', persona);
    $('personaName').textContent = personaLabel();
    setHint(HINTS[persona] || '');
    history = [];
    timeline = [];
    log.innerHTML = '';
    greet();
    scheduleNudge();
    window.syncConsoleVisibility?.();
  }

  // The recruiter persona speaks up on its own when the candidate stalls.
  function scheduleNudge() {
    clearTimeout(idleTimer);
    if (persona !== 'recruiter') return;
    idleTimer = setTimeout(() => {
      const code = window.Editor.value;
      if (pane.classList.contains('hidden')) return scheduleNudge();
      // Mid-answer is the worst moment to interrupt: an unsent draft or a live
      // dictation both mean the candidate is still talking, not stalled.
      if (input.value.trim() || dictating) return scheduleNudge();
      if (code === lastNudgeCode) return scheduleNudge();
      lastNudgeCode = code;
      ask('[The candidate has been quiet for a while. Look at their current code and decide: if they are progressing well, stay encouraging and ask one probing question. If they appear stuck or the code is wrong, give one small hint.]',
        { silentUser: true, quiet: true }).then(scheduleNudge);
    }, 120000);
  }

  async function init() {
    const list = await (await fetch('/api/personas')).json();
    personaSel.innerHTML = list.map(p => `<option value="${p.id}">${p.label}</option>`).join('');
    personaSel.value = persona;
    personaSel.onchange = applyPersona;
    syncPersonaLock();
    $('personaName').textContent = personaLabel();
    setHint(HINTS[persona] || '');
    greet();
    scheduleNudge();
  }

  /** The subtitle is one ellipsised line; the full text stays in the tooltip. */
  function setHint(text) {
    const el = $('personaHint');
    el.textContent = text;
    el.title = text;
  }

  /**
   * The round's single Google-style follow-up (scale, streaming, a changed
   * constraint), asked by the interviewer unprompted. app.js decides when and
   * guarantees once; this waits briefly for any in-flight reply first.
   */
  async function followUp(reason) {
    for (let i = 0; busy && i < 40; i++) await new Promise(r => setTimeout(r, 500));
    const why = reason === 'samples-pass'
      ? 'The candidate has just got the sample cases passing.'
      : 'About 70% of the interview time has gone.';
    return ask(`[${why} Ask your one follow-up question now, as instructed.]`,
      { silentUser: true, quiet: true, flow: { followUp: reason } });
  }

  window.Interviewer = {
    // The write-up is scored on the whole interview, not the 16-turn window
    // the live chat sends to keep requests small.
    transcript: () => timeline.map(({ role, content }) => ({ role, content })),
    /** Every turn with its timestamp ({role, content, at}). */
    timeline: () => timeline.slice(),
    followUp,
    reset: () => { history = []; timeline = []; greeting = ''; log.innerHTML = ''; greet(); },
    /** One-off question from a UI button (hint, explain failure); shows in the log. */
    ask: text => ask(text),
  };

  init().catch(e => bubble('System', `Agent unavailable: ${e.message}`));
})();
