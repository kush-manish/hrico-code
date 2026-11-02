/* Speech in and out, entirely in the browser.
 *
 * Recognition is Web Speech (webkit-prefixed outside Chrome/Safari-standard);
 * synthesis is speechSynthesis. Neither is universally supported, so every
 * entry point reports availability and the UI degrades to text rather than
 * offering a control that silently does nothing. */
window.Voice = (function () {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const synth = window.speechSynthesis || null;
  const KEY = 'voicePrefs';

  const DEFAULTS = {
    input: false, output: false, voiceName: '', rate: 0.95, volume: 1, lang: 'en-GB',
    // 'natural' uses the server's neural voice when it is available and falls
    // back on its own; 'browser' forces speechSynthesis.
    engine: 'natural',
    // serverVoice is the interviewer (kept under its old name so saved
    // settings carry over); candidateVoice is the other side of a watched
    // interview. Empty means the defaults below, which differ in gender so
    // the two are never confused.
    serverVoice: '', candidateVoice: '',
  };

  function prefs() {
    try { return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) || '{}') || {}) }; }
    catch { return { ...DEFAULTS }; }
  }
  function setPrefs(patch) {
    const next = { ...prefs(), ...patch };
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* private mode */ }
    return next;
  }

  const canListen = () => Boolean(SR) && window.isSecureContext;
  // Either engine counts as being able to speak.
  const canSpeak = () => Boolean(synth) || serverReady();

  function why() {
    if (!window.isSecureContext) return 'Voice needs a secure connection (https or localhost).';
    if (!SR && !synth) return 'This browser supports neither speech recognition nor speech synthesis.';
    if (!SR) return 'This browser cannot listen — Chrome, Edge and Safari can. Speaking still works.';
    return '';
  }

  // --- server-side neural speech -------------------------------------------
  let server = { available: false, voices: [], default: null, checked: 0 };
  let current = null;                    // the <audio> element in flight

  // A failed check is not "no neural voice": the page may have loaded while
  // the server was restarting. Retry on the next call after a short backoff,
  // and re-check a stale success too so a restarted speech service is seen.
  let checking = null;
  async function checkServer(force = false) {
    const age = Date.now() - (server.checked || 0);
    if (!force && server.checked && (server.available ? age < 5 * 60_000 : age < 15_000)) return server;
    if (checking) return checking;
    checking = (async () => {
      try {
        const r = await fetch('/api/tts/voices', { cache: 'no-store' });
        if (r.ok) Object.assign(server, await r.json(), { checked: Date.now() });
        else server.checked = Date.now();
      } catch { server.checked = Date.now(); }
      finally { checking = null; }
      return server;
    })();
    return checking;
  }
  checkServer();
  const serverVoices = () => server.voices;
  const serverReady = () => server.available;

  // Safari only lets audio start inside a user gesture, and an interviewer
  // reply arrives seconds after the last click. Two things make server
  // speech reliable anyway:
  //   1. an AudioContext, resumed on every gesture — once running it plays
  //      decoded buffers whenever asked, which is the route Safari honours;
  //   2. a single <audio> element blessed with a real (50 ms) silent clip on
  //      the first gesture, as the fallback when Web Audio is unavailable.
  // Without this every reply was refused and silently replaced by the
  // browser's built-in voice regardless of the settings.
  const SILENCE = 'data:audio/wav;base64,UklGRkQDAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YSADAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=='; 
  const AC = window.AudioContext || window.webkitAudioContext;
  let ctx = null;
  const player = typeof Audio === 'function' ? new Audio() : null;
  let unlocked = false;
  function unlock() {
    try {
      if (AC) { ctx = ctx || new AC(); if (ctx.state !== 'running') ctx.resume().catch(() => {}); }
    } catch { ctx = null; }
    if (unlocked || !player) return;
    unlocked = true;
    try {
      player.src = SILENCE;
      player.play().catch(() => { unlocked = false; });
    } catch { unlocked = false; }
  }
  for (const ev of ['pointerdown', 'keydown', 'touchend']) {
    document.addEventListener(ev, unlock, { capture: true, passive: true });
  }

  const volume = () => { const v = Number(prefs().volume); return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 1; };

  let lastSpoke = { engine: '', voice: '', reason: '' };   // for the settings page
  const lastSpokeWith = () => ({ ...lastSpoke });

  const ROLE_DEFAULTS = { interviewer: 'bf_emma', candidate: 'bm_george' };
  /** The neural voice id for a role. The interviewer always gets its choice;
   *  the candidate yields if it would sound the same, moving to the first
   *  voice of the other gender. */
  function voiceFor(role) {
    const p = prefs();
    const interviewer = p.serverVoice || server.default || ROLE_DEFAULTS.interviewer;
    if (role !== 'candidate') return interviewer;
    const pick = p.candidateVoice || ROLE_DEFAULTS.candidate;
    if (pick !== interviewer) return pick;
    const other = genderOf(interviewer) === 'f' ? /^[ab]m_/ : /^[ab]f_/;
    const alt = server.voices.map(v => (typeof v === 'string' ? v : v.id)).find(id => other.test(id) && id !== interviewer);
    return alt || pick;
  }

  function stopServerAudio() {
    if (!current) return;
    try { current.stop(); } catch { /* already stopped */ }
    current = null;
  }

  /** True when Web Audio is running, after one try at waking it. Safari parks a
   *  context as "interrupted" when another clip plays, and a parked context
   *  "plays" a buffer silently while still firing onended on time. */
  async function contextRunning() {
    if (!ctx) return false;
    if (ctx.state !== 'running') { try { await ctx.resume(); } catch { /* not allowed now */ } }
    return ctx.state === 'running';
  }

  /** Play a WAV through Web Audio; resolves once the clock is confirmed moving,
   *  rejects if the context stalls so the caller can use the <audio> element. */
  function playBuffer(bytes, rate, onEnd) {
    return new Promise((resolve, reject) => {
      ctx.decodeAudioData(bytes.slice(0), buffer => {
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        src.playbackRate.value = rate;
        const gain = ctx.createGain();
        gain.gain.value = volume();
        src.connect(gain).connect(ctx.destination);
        let done = false;
        const finish = () => { if (done) return; done = true; current = null; onEnd?.(); };
        src.onended = finish;
        current = { stop: () => { try { src.stop(); } catch { /* ignore */ } finish(); } };
        const t0 = ctx.currentTime;
        try { src.start(); } catch (err) { current = null; return reject(err); }
        setTimeout(() => {
          if (done) return resolve();
          if (ctx.state === 'running' && ctx.currentTime > t0) return resolve();
          // Clock did not move: the context is parked. Silence this source
          // without reporting an end, so the caller can replay it audibly.
          done = true; current = null;
          try { src.onended = null; src.stop(); } catch { /* ignore */ }
          reject(new Error(`audio context ${ctx.state}`));
        }, 350);
      }, reject);
    });
  }

  /** Fallback: the blessed <audio> element. */
  function playElement(blob, rate, onEnd) {
    const url = URL.createObjectURL(blob);
    player.src = url;
    player.playbackRate = rate;
    player.volume = volume();
    let done = false;
    const finish = () => { if (done) return; done = true; URL.revokeObjectURL(url); player.onended = null; player.onerror = null; current = null; onEnd?.(); };
    current = { stop: () => { try { player.pause(); } catch { /* ignore */ } finish(); } };
    player.onended = finish;
    player.onerror = finish;
    return player.play().catch(err => { current = null; URL.revokeObjectURL(url); throw err; });
  }

  async function speakViaServer(text, onEnd, voiceOverride) {
    const voice = voiceOverride || prefs().serverVoice || undefined;
    const r = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice }),
    });
    if (!r.ok) throw new Error(`tts ${r.status}`);
    const bytes = await r.arrayBuffer();
    stopServerAudio();
    const rate = Math.min(1.4, Math.max(0.7, Number(prefs().rate) || 1));
    let played = false;
    if (await contextRunning()) {
      try { await playBuffer(bytes, rate, onEnd); played = true; }
      catch (err) { console.warn('[voice] web audio stalled, using the audio element:', err?.message || err); }
    }
    if (!played) {
      if (!player) throw new Error('no audio output available');
      await playElement(new Blob([bytes], { type: 'audio/wav' }), rate, onEnd);
    }
    lastSpoke = { engine: 'server', voice: r.headers.get('X-Voice') || voice || server.default || '', reason: '' };
  }

  /** Fetch the neural voice for one sentence (cached per text+voice for the
   *  page's life), so callers can synthesise ahead of when they speak. */
  const synthCache = new Map();
  function synthText(text, voice, pace = 1) {
    const v = voice || prefs().serverVoice || '';
    const key = `${v}|${pace}|${text}`;
    if (synthCache.has(key)) return synthCache.get(key);
    const p = (async () => {
      try {
        const r = await fetch('/api/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, voice: v || undefined, ...(pace !== 1 ? { pace } : {}) }) });
        return r.ok ? await r.arrayBuffer() : null;
      } catch { return null; }
    })();
    synthCache.set(key, p);
    p.then(b => { if (!b) synthCache.delete(key); });
    if (synthCache.size > 300) synthCache.delete(synthCache.keys().next().value);
    return p;
  }
  const willUseServer = () => prefs().engine !== 'browser' && serverReady();

  // --- streamed speech: a queue of sentences ---------------------------------
  // Text arrives a token at a time; each completed sentence is synthesised
  // while the previous one plays, so the first words are heard within a
  // couple of seconds and there is no gap between sentences.
  function queue({ voice, pace = 1 } = {}) {
    const items = [];                       // { text, audio: Promise<ArrayBuffer|null> }
    let stopped = false, closed = false, playing = false, idleResolve = null;
    const idle = new Promise(res => { idleResolve = res; });
    const rate = Math.min(1.4, Math.max(0.7, Number(prefs().rate) || 1));
    const synthesise = text => synthText(text, voice, pace);
    const pump = async () => {
      if (playing) return;
      playing = true;
      while (!stopped && items.length) {
        const it = items.shift();
        const bytes = await it.audio;
        if (stopped) break;
        if (it.pauseBefore) await new Promise(res => setTimeout(res, it.pauseBefore));
        if (stopped) break;
        if (it.waitFor) { try { await it.waitFor(); } catch { /* go on */ } }
        if (stopped) break;
        try { it.onStart?.(); } catch { /* caller's problem */ }
        if (bytes && await contextRunning()) {
          let ok = true;
          await new Promise(res => playBuffer(bytes, rate, res).catch(() => { ok = false; res(); }));
          if (!ok && player) await new Promise(res => playElement(new Blob([bytes], { type: 'audio/wav' }), rate, res).catch(res));
        } else if (bytes && player) {
          await new Promise(res => playElement(new Blob([bytes], { type: 'audio/wav' }), rate, res).catch(res));
        } else {
          await new Promise(res => browserSpeak(it.text, res, voice));   // no server voice: fall back
        }
      }
      playing = false;
      if ((closed || stopped) && !items.length) idleResolve();
    };
    return {
      add(text, { onStart, pauseBefore = 0, waitFor = null } = {}) {
        text = String(text || '').trim();
        if (!text || stopped) return;
        const useServer = prefs().engine !== 'browser' && serverReady();
        items.push({ text, onStart, pauseBefore, waitFor, audio: useServer ? synthesise(text) : Promise.resolve(null) });   // cached: free if prefetched
        pump();
      },
      done() { closed = true; if (!playing && !items.length) idleResolve(); },
      stop() { stopped = true; items.length = 0; stopSpeaking(); idleResolve(); },
      idle,
      get busy() { return playing || items.length > 0; },
    };
  }

  // --- speaking --------------------------------------------------------------
  let voicesCache = [];
  function voices() {
    if (!synth) return [];
    const all = synth.getVoices();
    if (all.length) voicesCache = all;
    return voicesCache;
  }
  if (synth) {
    // The list is populated asynchronously and is empty on first call.
    synth.addEventListener?.('voiceschanged', voices);
    voices();
  }

  // Names that tend to be the better British voices across platforms. Apple's
  // Siri and enhanced voices and Google's UK voice sound markedly less robotic
  // than the default fallback, which is usually a low-quality en-US one.
  const GOOD_UK = /(siri|daniel|kate|serena|oliver|arthur|martha|jamie|google uk|premium|enhanced|neural|natural)/i;

  // Kokoro ids encode gender in their prefix (bf_emma, bm_george). When a
  // caller asks for one of those but the browser engine is in use, pick a
  // browser voice of the same gender so two speakers still sound different.
  const FEMALE = /(kate|serena|martha|moira|fiona|karen|tessa|samantha|victoria|zira|hazel|libby|sonia|female|woman)/i;
  const MALE = /(daniel|oliver|arthur|jamie|alex|fred|rishi|george|ryan|thomas|david|mark|male\b|\bman\b)/i;
  const genderOf = id => (/^[ab]f_/.test(id || '') ? 'f' : /^[ab]m_/.test(id || '') ? 'm' : '');

  function pickVoice(hint) {
    const list = voices();
    if (!list.length) return null;
    const { voiceName } = prefs();
    const g = genderOf(hint);
    if (g) {
      const want = g === 'f' ? FEMALE : MALE, avoid = g === 'f' ? MALE : FEMALE;
      const gb = list.filter(v => /^en[-_]GB/i.test(v.lang));
      const en = list.filter(v => /^en[-_]/i.test(v.lang));
      const hit = gb.find(v => want.test(v.name) && GOOD_UK.test(v.name)) || gb.find(v => want.test(v.name))
        || en.find(v => want.test(v.name)) || gb.find(v => !avoid.test(v.name) && v.name !== voiceName);
      if (hit) return hit;
    }
    if (voiceName) {
      const exact = list.find(v => v.name === voiceName);
      if (exact) return exact;
    }
    const gb = list.filter(v => /^en[-_]GB/i.test(v.lang));
    return gb.find(v => GOOD_UK.test(v.name))
      || gb.find(v => v.localService)
      || gb[0]
      || list.find(v => /^en[-_]/i.test(v.lang) && GOOD_UK.test(v.name))
      || list.find(v => /^en[-_]/i.test(v.lang))
      || list[0];
  }

  /** Voices sorted so British ones are offered first in the picker. */
  function sortedVoices() {
    return voices().slice().sort((a, b) => {
      const score = v => (/^en[-_]GB/i.test(v.lang) ? 0 : /^en[-_]/i.test(v.lang) ? 1 : 2)
        + (GOOD_UK.test(v.name) ? -0.5 : 0);
      return score(a) - score(b) || a.name.localeCompare(b.name);
    });
  }

  /**
   * iOS will not speak unless synthesis has been started from a user gesture
   * at least once, and an interviewer reply does not arrive during one. Prime
   * it on the first interaction so later replies are audible.
   */
  let primed = false;
  function prime() {
    if (primed || !synth) return;
    primed = true;
    try {
      const u = new SpeechSynthesisUtterance('');
      u.volume = 0;
      synth.speak(u);
    } catch { /* not fatal */ }
  }
  ['pointerdown', 'keydown'].forEach(ev =>
    window.addEventListener(ev, prime, { once: true, capture: true }));

  function speak(text, { onEnd, voice } = {}) {
    if (!text) { onEnd?.(); return; }
    stopSpeaking();
    // Markdown and code read badly aloud; strip the obvious noise.
    const clean = String(text)
      .replace(/```[\s\S]*?```/g, ' code block omitted. ')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/[*_#>]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!clean) { onEnd?.(); return; }

    // Prefer the neural voice; fall back to the browser on any failure so a
    // TTS outage never leaves the interviewer silent. The availability check
    // is async and can still be in flight on the very first utterance, so wait
    // for it rather than silently defaulting to the robotic voice.
    if (prefs().engine === 'browser') { browserSpeak(clean, onEnd, voice); return; }
    checkServer()
      .then(() => (serverReady()
        ? speakViaServer(clean, onEnd, voice)
        : Promise.reject(new Error('the neural voice server is not reachable'))))
      .catch(err => {
        lastSpoke = { engine: 'browser', voice: '', reason: String(err?.message || err) };
        console.warn('[voice] fell back to the browser voice:', lastSpoke.reason);
        browserSpeak(clean, onEnd, voice);
      });
  }

  function browserSpeak(clean, onEnd, hint) {
    if (!synth) { onEnd?.(); return; }
    const u = new SpeechSynthesisUtterance(clean);
    const v = pickVoice(hint);
    if (lastSpoke.engine !== 'browser' || !lastSpoke.reason) lastSpoke = { engine: 'browser', voice: v?.name || '', reason: prefs().engine === 'browser' ? 'browser engine selected' : '' };
    else lastSpoke.voice = v?.name || '';
    if (v) { u.voice = v; u.lang = v.lang; }
    u.rate = Math.min(2, Math.max(0.5, Number(prefs().rate) || 1));
    u.volume = volume();
    u.onend = () => onEnd?.();
    u.onerror = () => onEnd?.();
    synth.speak(u);
  }

  function stopSpeaking() {
    stopServerAudio();
    try { synth?.cancel(); } catch { /* ignore */ }
  }
  const speaking = () => Boolean(synth?.speaking) || Boolean(current);

  // --- listening -------------------------------------------------------------
  let recog = null;

  const ERRORS = {
    'not-allowed': 'Microphone access was blocked. Allow it in your browser settings and try again.',
    'service-not-allowed': 'Microphone access was blocked by the browser.',
    'audio-capture': 'No microphone was found.',
    'no-speech': 'I did not catch anything — try again.',
    network: 'Speech recognition needs a network connection.',
  };

  /**
   * One utterance per call. Interim results stream to onPartial so the user
   * can see they are being heard; the final transcript goes to onResult.
   */
  function listen({ onPartial, onResult, onError, onEnd } = {}) {
    if (!canListen()) { onError?.(why() || 'Listening is not supported here.'); onEnd?.(); return () => {}; }
    stopListening();
    stopSpeaking();                       // never record our own voice back

    recog = new SR();
    recog.lang = prefs().lang;
    recog.interimResults = true;
    recog.continuous = true;              // let the candidate pause mid-answer
    recog.maxAlternatives = 1;

    let finalText = '';
    recog.onresult = e => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const chunk = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += chunk;
        else interim += chunk;
      }
      onPartial?.((finalText + ' ' + interim).trim());
    };
    recog.onerror = e => {
      if (e.error === 'aborted') return;  // we stopped it deliberately
      onError?.(ERRORS[e.error] || `Speech recognition failed (${e.error}).`);
    };
    recog.onend = () => {
      const text = finalText.trim();
      recog = null;
      if (text) onResult?.(text);
      onEnd?.();
    };
    try { recog.start(); } catch { onError?.('Could not start listening.'); onEnd?.(); }
    return stopListening;
  }

  function stopListening() {
    if (!recog) return;
    try { recog.stop(); } catch { /* already stopped */ }
  }
  const listening = () => Boolean(recog);

  /** Speaks and resolves when the audio finishes, so a caller can wait for a
   *  line to land before starting the next one. */
  function speakAsync(text, opts = {}) {
    return new Promise(resolve => {
      let done = false;
      const finish = () => { if (!done) { done = true; resolve(); } };
      speak(text, { ...opts, onEnd: finish });
      // A silent failure must not stall a sequence forever.
      setTimeout(finish, 90_000);
    });
  }

  return {
    canListen, canSpeak, why, prefs, setPrefs, speakAsync, voiceFor, queue,
    checkServer, serverReady, serverVoices, lastSpokeWith,
    voices, sortedVoices, speak, stopSpeaking, speaking, synthText, willUseServer,
    listen, stopListening, listening,
  };
})();

/* The Text / Voice chooser shown when an interview starts. Resolves to the
 * chosen mode and applies it, so callers just await it and carry on. */
window.askInterviewMode = function askInterviewMode() {
  const box = document.getElementById('modeAsk');
  const V = window.Voice;
  if (!box || !V) return Promise.resolve('text');

  const note = document.getElementById('askNote');
  const opts = [...box.querySelectorAll('.ask-opt')];

  // Offer only what this browser can actually do, with the reason attached.
  const reason = V.why();
  opts.forEach(o => {
    const needsMic = o.dataset.choice === 'voice';
    const needsSpeaker = o.dataset.choice !== 'text';
    const ok = (!needsMic || V.canListen()) && (!needsSpeaker || V.canSpeak());
    o.disabled = !ok;
    o.title = ok ? '' : reason;
  });
  if (reason) { note.textContent = reason; note.classList.remove('hidden'); }
  else note.classList.add('hidden');

  box.classList.remove('hidden');

  return new Promise(resolve => {
    function finish(choice) {
      box.classList.add('hidden');
      opts.forEach(o => { o.onclick = null; });
      document.removeEventListener('keydown', onKey);
      V.setPrefs({
        input: choice === 'voice',
        output: choice === 'voice' || choice === 'listen',
      });
      window.dispatchEvent(new CustomEvent('voiceprefschanged'));
      resolve(choice);
    }
    function onKey(e) { if (e.key === 'Escape') finish('text'); }
    opts.forEach(o => { o.onclick = () => { if (!o.disabled) finish(o.dataset.choice); }; });
    document.addEventListener('keydown', onKey);
    (opts.find(o => !o.disabled) || opts[0]).focus();
  });
};
