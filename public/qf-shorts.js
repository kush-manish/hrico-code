/* Shorts — 2–3 minute narrated, animated explainers, one per NeetCode problem.
 *
 *   1. The problem     what is asked, the example drawn as data structures
 *   2. Brute force     the obvious idea, a fast replay of it running, why it is slow
 *   3. The insight     the "aha", the steps, brute vs optimal step race
 *   4. Watch it run    the optimal solution traced on the example, frame by frame
 *   5. The code        the solution, key lines lit up one by one
 *   6. Recap           complexity, pattern, pitfalls, "solve it now"
 *
 * Narration is spoken (neural voice when the server has it, the browser's
 * otherwise) and always captioned. Space pauses, ←/→ move between scenes,
 * ↑/↓ (or a swipe) move between shorts in a topic, M mutes, Esc closes.
 * Scripts come from /api/shorts (written ahead of time and checked by running
 * both solutions); the traces are real executions of that code.
 */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  /** A code line with its indent in --ind, so a wrapped line hangs under its own code (same as qf-trace). */
  const codeCell = l => { const t = String(l).trimStart(); return `<code style="--ind:${String(l).length - t.length}">${esc(t) || ' '}</code>`; };
  const PREF = 'qf.shorts';
  const pref = () => { try { return JSON.parse(localStorage.getItem(PREF)) || {}; } catch { return {}; } };
  const setPref = p => { try { localStorage.setItem(PREF, JSON.stringify({ ...pref(), ...p })); } catch { /* fine */ } };

  // ------------------------------------------------------------ index --
  let INDEX = null;
  async function index() {
    if (INDEX) return INDEX;
    try {
      const r = await fetch('/api/shorts', { credentials: 'same-origin' });
      if (!r.ok) throw new Error();
      INDEX = (await r.json()).shorts || [];
    } catch { INDEX = []; }
    return INDEX;
  }
  const has = slug => (INDEX || []).some(s => s.slug === slug);
  const cache = new Map();
  async function fetchShort(slug) {
    if (cache.has(slug)) return cache.get(slug);
    const p = fetch(`/api/shorts/${encodeURIComponent(slug)}`, { credentials: 'same-origin' }).then(async r => {
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || `server said ${r.status}`);
      return d;
    });
    cache.set(slug, p);
    p.catch(() => cache.delete(slug));
    return p;
  }

  // ------------------------------------------------------------ state --
  let root = null, S = null;       // S: the playing short
  let token = 0;                   // bumps on every scene change; stale timers die
  let playing = true, speed = 1;
  let ended = false;               // the current scene ran to its end and stopped
  let list = [], listIdx = 0;

  /** Sleep for `ms` of *playing* time: pausing freezes it, speed shortens it. */
  function sleep(ms) {
    const my = token;
    return new Promise(res => {
      let left = ms, last = performance.now();
      const tick = now => {
        if (my !== token || !root) return;
        if (playing) left -= (now - last) * speed;
        last = now;
        if (left <= 0) res(); else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }

  // -------------------------------------------------------- narration --
  const muted = () => !!pref().muted || !window.Voice?.canSpeak?.();
  const sentences = t => (String(t || '').match(/[^.!?]+[.!?]*(\s+|$)/g) || []).map(s => s.trim()).filter(Boolean);
  const wps = 2.2;                                     // spoken words per second at the teaching pace
  // Shorts speak slower than chat: 1.15× longer at 1×, and the speed button
  // (0.75× … 1.5×) changes the voice too, not just the pictures.
  const pace = () => Math.min(1.5, Math.max(0.75, Math.round((1.15 / speed) * 100) / 100));
  const words = t => String(t || '').split(/\s+/).filter(Boolean).length;
  let narr = null;
  /** A human beat between sentences: longer after a question (let it land),
   *  before a turn ("So…", "But…", "Now…") and after a short punchy line. */
  function beat(prev, next) {
    // A teaching pace: room to look at the picture between sentences.
    let ms = 560;
    if (/\?\s*$/.test(prev)) ms = 1150;
    else if (/!\s*$/.test(prev)) ms = 750;
    if (/^(so|but|now|here|notice|that|this|and that|which means|the trick|watch|then)\b/i.test(next)) ms += 300;
    if (words(prev) <= 5) ms += 250;
    if (numsIn(prev).length >= 2) ms += 250;      // numbers take a moment to match on screen
    return Math.min(1700, ms) / speed;
  }
  /** Speak a scene's narration one sentence at a time. Each caption lights up
   *  exactly when its sentence starts playing (the next sentence's audio is
   *  fetched while the current one plays, so there are no gaps), and
   *  `onSentence(k, n)` lets the scene move its picture in step with the voice.
   *  Muted, captions advance on a reading-speed timer instead. */
  function narrate(text, onSentence, gate) {
    const my = token;
    // A sentence never starts before the last one had time to be read (if
    // speech fails fast, scenes would flash past) or before the picture has
    // caught up with what was just said (`gate`).
    let lastAt = 0, lastWords = 0;
    const ready = async i => {
      const floor = lastAt + ((lastWords / wps) * 800) / speed;
      while (Date.now() < floor && my === token) await sleep(80);
      if (gate && i > 0) { const t0 = Date.now(); while (!gate(i) && my === token && Date.now() - t0 < 9000) await sleep(80); }
    };
    const ss = Array.isArray(text) ? text : sentences(text);   // a list is spoken one item per "sentence"
    const cap = root.querySelector('.qs-cap');
    cap.innerHTML = ss.map((s, k) => `<span data-k="${k}">${esc(s)} </span>`).join('');
    const mark = k => {
      if (k < ss.length) { lastAt = Date.now(); lastWords = words(ss[k]); }
      cap.querySelectorAll('span').forEach(x => { x.classList.toggle('on', +x.dataset.k === k); x.classList.toggle('said', +x.dataset.k < k); });
      if (k < ss.length) { try { onSentence?.(k, ss.length); } catch { /* drawing only */ } }
    };
    if (!ss.length) { onSentence?.(0, 1); return Promise.resolve(); }
    return new Promise(resolve => {
      let k = 0, q = null, gen = 0;
      const done = () => { if (my !== token) return; narr = null; mark(ss.length - 1); resolve(); };
      const voiced = () => !muted() && window.Voice?.queue;
      const viaVoice = from => {
        const g = ++gen;
        q = window.Voice.queue({ pace: pace() });
        for (let i = from; i < ss.length; i++) q.add(ss[i], { pauseBefore: i > from ? beat(ss[i - 1], ss[i]) : 0, waitFor: () => ready(i), onStart: () => { if (g === gen && my === token) { k = i; mark(i); } } });
        q.done();
        q.idle.then(() => { if (g === gen && my === token && playing) done(); });
      };
      const viaTimer = async from => {
        const g = ++gen;
        for (let i = from; i < ss.length; i++) {
          if (g !== gen || my !== token) return;
          if (gate && i > from) await ready(i);
          if (g !== gen || my !== token) return;
          k = i; mark(i);
          await sleep((words(ss[i]) / wps) * 1000 + (i + 1 < ss.length ? beat(ss[i], ss[i + 1]) : 250));
        }
        if (g === gen) done();
      };
      const start = from => (voiced() ? viaVoice(from) : viaTimer(from));
      narr = {
        pause() { gen++; q?.stop(); q = null; },
        resume() { start(k); },
        mute() { gen++; q?.stop(); q = null; viaTimer(k); },
      };
      start(0);
    });
  }
  function hush() { try { narr?.pause(); window.Voice?.stopSpeaking?.(); } catch { /* fine */ } narr = null; }

  // ---------------------------------------------------------- traces --
  function prep(trace, code) {
    const T = window.QFTrace;
    if (!T || !trace || !(trace.steps || []).length) return null;
    const lines = code.split('\n');
    const info = T.analyze(code);
    try { T.prepareTrace?.(trace.steps, info); } catch { /* drawn without the extras */ }
    return { steps: trace.steps, lines, info, result: trace.result, truncated: trace.truncated, error: trace.error };
  }
  function frame(t, i, opts = {}) {
    const T = window.QFTrace;
    const step = t.steps[i];
    let html = '', note = '';
    try { html = T.frameHtml(step, t.steps[i - 1], t.lines, { steps: t.steps, i, info: t.info, codeWindow: opts.codeWindow }); } catch { html = '<p class="qf-muted">(this step could not be drawn)</p>'; }
    if (opts.note !== false) { try { note = humanNote(T.noteFor(step, t.steps[i - 1], t.lines, { steps: t.steps, i, info: t.info })); } catch { note = ''; } }
    return { html, note };
  }
  /** Which frames to show: all of them when short, otherwise an even sample
   *  that always keeps the first and the last. */
  function pick(n, max) {
    if (n <= max) return [...Array(n).keys()];
    const out = [];
    for (let k = 0; k < max; k++) out.push(Math.round((k * (n - 1)) / (max - 1)));
    return [...new Set(out)];
  }

  // ------------------------------------------------------- memory --
  // How to spot each pattern next time: the signal in the problem statement.
  const SIGNAL = {
    'Arrays & Hashing': 'you need fast "have I seen this?" lookups, counts or groups',
    'Two Pointers': 'the input is sorted, or you compare pairs from both ends',
    'Sliding Window': 'you want the best contiguous subarray or substring',
    'Stack': 'brackets, "next greater", or undoing the most recent thing',
    'Binary Search': 'it is sorted, or you search for the smallest value that works',
    'Linked List': 'you rewire pointers: reverse, merge, find the middle or a cycle',
    'Trees': 'each node can answer from what its children return',
    'Heap / Priority Queue': 'you keep asking for the smallest or largest, or the top k',
    'Backtracking': 'you must list every combination, permutation or placement',
    'Tries': 'many words share prefixes',
    'Graphs': 'grids, islands, dependencies or connected pieces',
    'Advanced Graphs': 'weighted shortest paths or connecting everything cheaply',
    '1-D Dynamic Programming': 'the answer at i is built from a few earlier answers',
    '2-D Dynamic Programming': 'two strings or a grid of choices',
    'Greedy': 'a locally best choice is always safe',
    'Intervals': 'ranges that overlap — sort by start and sweep',
    'Math & Geometry': 'matrix walks or a number trick',
    'Bit Manipulation': 'pairs cancel, or you test and set individual bits',
  };
  const GAPS = [1, 3, 7, 16, 35];                     // days between reviews
  const DAYMS = 864e5;
  function schedule(slug, ok) {
    const r = { ...(pref().review || {}) }, c = r[slug] || { box: 0 };
    // Only a review on or after its due date earns a longer gap; getting it
    // right again an hour later says nothing about remembering it in a week.
    const early = c.due && c.due > Date.now() + 60e3;
    if (ok && early) return;
    const box = ok ? Math.min(GAPS.length - 1, (c.due ? c.box + 1 : 0)) : 0;
    r[slug] = { box, due: Date.now() + (ok ? GAPS[box] * DAYMS : 10 * 60e3) };
    setPref({ review: r });
  }
  const dueFor = slug => { const c = pref().review?.[slug]; return !!(c && c.due <= Date.now()); };

  // ---------------------------------------------------------- scenes --
  const SCENES = [
    { id: 'intro', label: 'Problem' },
    { id: 'brute', label: 'Brute force' },
    { id: 'insight', label: 'Insight' },
    { id: 'anim', label: 'Watch it run' },
    { id: 'code', label: 'Code' },
    { id: 'check', label: 'Quick check' },
    { id: 'outro', label: 'Remember it' },
  ];
  let sceneIdx = 0;

  const fmtIn = s => String(s.input || '').split('\n').filter(Boolean).map((l, k) => {
    const name = s.meta?.params?.[k]?.name || (s.meta?.classname ? (k ? 'args' : 'calls') : `arg${k + 1}`);
    return `<code>${esc(name)} = ${esc(l.length > 90 ? l.slice(0, 88) + '…' : l)}</code>`;
  }).join(' ');

  function reveal(stage) {
    // Staggered entrance for everything marked .qs-in, in order.
    const items = [...stage.querySelectorAll('.qs-in')];
    return items;
  }
  const show = el => el && el.classList.add('vis');
  /** Reveal `items` in step with the voice: by sentence k of n, the first
   *  ceil((k+1)/n · items) are visible (the first one shows at once). */
  const inStep = (items, extra) => { show(items[0]); return (k, n) => { const upto = Math.ceil(((k + 1) / n) * items.length); items.slice(0, upto).forEach(it => { if (!it.classList.contains('vis')) { show(it); extra?.(it); } }); }; };

  function sayHit(stage, sentence) {
    stage.querySelectorAll('.qs-say-hit').forEach(e => e.classList.remove('qs-say-hit'));
    const want = numsIn(sentence || '');
    if (!want.length) return;
    const byIndex = /\b(index|indices|position|positions)\b/i.test(sentence);
    stage.querySelectorAll('.qt-cell').forEach(c => {
      const v = c.querySelector('.qt-v')?.textContent.trim(), i = c.querySelector('.qt-i')?.textContent.trim();
      const hitV = v !== '' && want.includes(+v) && /^-?\d+$/.test(v);
      const hitI = byIndex && i !== '' && want.includes(+i);
      if (hitV || hitI) c.classList.add('qs-say-hit');
    });
  }
  async function sceneIntro(stage, s) {
    const t = S.opt;
    const vis = t ? frame(t, 0, { note: false }).html : '';
    stage.innerHTML = `
      <div class="qs-intro">
        <div class="qs-kicker qs-in">${s.kind === 'pattern' ? `📘 ${s.name ? 'Sub-pattern' : 'Pattern'} short · ${esc(s.pattern || '')}${(s.sources || []).length ? ` · ${esc(s.sources.join(' · '))}` : ''}` : `${esc(s.pattern || '')} · ${esc(s.difficulty || '')}`}</div>
        <h2 class="qs-title qs-in">${esc(s.title)}</h2>
        <p class="qs-hook qs-in">${esc(s.hook || '')}</p>
        <p class="qs-ask qs-in">${esc(s.ask || '')}</p>
        <div class="qs-ex qs-in"><div class="qs-ex-in">${fmtIn(s)}</div>${vis ? `<div class="qs-vis-only">${vis}</div>` : ''}</div>
        <div class="qs-out qs-in"><span class="qs-arrow">→</span> <b>${esc(s.output)}</b><span class="qs-why">${esc(s.exampleWhy || '')}</span></div>
      </div>`;
    const items = reveal(stage);
    show(items[1]);
    // As each sentence names numbers, light those cells in the example, so
    // "seventy five waits four days for seventy six" points at 75 and 76.
    const ssIntro = sentences(s.say?.intro), step = inStep(items);
    await narrate(s.say?.intro, (k, n) => { step(k, n); sayHit(stage, ssIntro[k]); });
    sayHit(stage, '');
    items.forEach(show);
    await sleep(500);
  }

  async function sceneBrute(stage, s) {
    const b = s.brute || {};
    const t = S.brute;
    stage.innerHTML = `
      <div class="qs-two">
        <div class="qs-col">
          <div class="qs-tag bad qs-in">${s.kind === 'pattern' ? 'Without the pattern' : 'Brute force'}</div>
          <p class="qs-big qs-in">${esc(b.idea || '')}</p>
          <ol class="qs-steps">${(b.steps || []).map(x => `<li class="qs-in">${esc(x)}</li>`).join('')}</ol>
          <div class="qs-badges qs-in"><span class="qs-badge bad">Time ${esc(b.time || '?')}</span><span class="qs-badge">Space ${esc(b.space || '?')}</span></div>
          <p class="qs-slow qs-in">🐢 ${esc(b.whySlow || '')}</p>
        </div>
        <div class="qs-col qs-mini">${t ? '<div class="qs-mini-frame"></div><p class="qs-mini-note"></p><div class="qs-mini-count"></div>' : `<pre class="qs-codebox">${esc(b.code || '')}</pre>`}</div>
      </div>`;
    const items = reveal(stage);
    let voiceOn; const voiceStarted = new Promise(r => { voiceOn = r; });
    const step0 = inStep(items);
    const said = narrate(s.say?.brute, (k, n) => { voiceOn(); step0(k, n); });
    const anim = (async () => {
      if (!t) return;
      await Promise.race([voiceStarted, sleep(4000)]);
      const box = stage.querySelector('.qs-mini-frame'), note = stage.querySelector('.qs-mini-note'), cnt = stage.querySelector('.qs-mini-count');
      const idx = pick(t.steps.length, 18);
      for (let k = 0; k < idx.length; k++) {
        const f = frame(t, idx[k], { codeWindow: 2 });   // a compact code window leaves room for the data
        box.innerHTML = f.html; note.textContent = f.note;
        cnt.innerHTML = `step <b>${idx[k] + 1}</b> of ${t.steps.length}${t.truncated ? '+' : ''}`;
        await sleep(k === 0 ? 1200 : 650);
      }
      cnt.innerHTML = `<b>${t.steps.length}${t.truncated ? '+' : ''} steps</b> on this tiny example — and it grows ${esc(b.time || 'fast')}.`;
      cnt.classList.add('hot');
    })();
    await Promise.all([said, anim]);
    items.forEach(show);
    await sleep(500);
  }

  async function sceneInsight(stage, s) {
    const o = s.optimal || {}, b = s.brute || {};
    const bs = S.brute?.steps.length || 0, os = S.opt?.steps.length || 0;
    const race = bs && os;
    stage.innerHTML = `
      <div class="qs-insight">
        <div class="qs-tag good qs-in">${s.kind === 'pattern' ? 'The recipe' : 'The insight'}</div>
        <p class="qs-aha qs-in qs-kin"><span aria-hidden="true">💡</span> ${kinetic(o.insight || '')}</p>
        <ol class="qs-steps">${(o.steps || []).map(x => `<li class="qs-in">${esc(x)}</li>`).join('')}</ol>
        <div class="qs-race qs-in">
          <div class="qs-race-row"><span>Brute force <small>${esc(b.time || '')}</small></span><div class="qs-race-bar bad"><i></i></div><b>${race ? bs + (S.brute.truncated ? '+' : '') : esc(b.time || '')}</b></div>
          <div class="qs-race-row"><span>Optimal <small>${esc(o.time || '')}</small></span><div class="qs-race-bar good"><i></i></div><b>${race ? os : esc(o.time || '')}</b></div>
          <small class="qs-race-cap">${race ? 'steps on this example' : 'time complexity'}</small>
        </div>
      </div>`;
    const items = reveal(stage);
    const race_ = it => {
      if (!it.classList.contains('qs-race')) return;
      const max = Math.max(bs, os, 1);
      const [bb, ob] = it.querySelectorAll('.qs-race-bar i');
      requestAnimationFrame(() => { bb.style.width = `${race ? Math.max(4, (100 * bs) / max) : 100}%`; ob.style.width = `${race ? Math.max(4, (100 * os) / max) : 30}%`; });
    };
    show(items[1]);
    const said = narrate(s.say?.insight, inStep(items, race_));
    await said;
    items.forEach(it => { if (!it.classList.contains('vis')) { show(it); race_(it); } });
    await sleep(600);
  }

  // Which frame each sentence of the run narration belongs to. A sentence
  // that names a number ("now we're at four", "we need two") starts on the
  // first frame after the last anchor where a variable changes to that value;
  // "done"/"return" sentences land on the final frames; the rest are spread
  // evenly between their neighbours. starts[k] is a position in `idx`.
  const UNITS = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
  const TENS = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
  /** Every number a sentence says, in words or digits: "seventy two" → 72,
   *  "one hundred and five" → 105, "minus three" → -3, "index 4" → 4. */
  function numsIn(text) {
    const out = new Set();
    const toks = String(text).toLowerCase().replace(/(\d),(\d)/g, '$1$2').replace(/[^a-z0-9\-\s]/g, ' ').replace(/-/g, ' ').split(/\s+/).filter(Boolean);
    for (let i = 0; i < toks.length; i++) {
      const neg = /^(minus|negative)$/.test(toks[i - 1] || '');
      if (/^\d+$/.test(toks[i])) { out.add(neg ? -+toks[i] : +toks[i]); continue; }
      if (!(toks[i] in UNITS) && !(toks[i] in TENS) && toks[i] !== 'hundred') continue;
      let v = 0, cur = 0, j = i;
      for (; j < toks.length; j++) {
        const w = toks[j];
        if (w in UNITS) cur += UNITS[w];
        else if (w in TENS) cur += TENS[w];
        else if (w === 'hundred') cur = (cur || 1) * 100;
        else if (w === 'thousand') { v += (cur || 1) * 1000; cur = 0; }
        else if (w === 'and' && j > i && (toks[j + 1] in UNITS || toks[j + 1] in TENS)) continue;
        else break;
      }
      v += cur;
      out.add(neg ? -v : v);
      i = j - 1;
    }
    return [...out];
  }
  /** Turn a raw interpreter note into plain words for the viewer. */
  function humanNote(n) {
    let t = String(n || '');
    // "Just ran line 9 (r -= 1): r: 6 → 5"  →  "r -= 1   ·   r: 6 → 5"
    t = t.replace(/^Just ran line \d+ \((.+?)\):\s*/, (_, c) => `${c}   ·   `);
    t = t.replace(/^Just ran line \d+:\s*/, '');
    let m = /^(if|elif|while)\s+(.+?)(?:\s+→\s+(.+?))?\s+→\s+(True|False)(\s*\(loop ends\))?$/.exec(t);
    if (m) {
      const shown = (m[3] || m[2]).trim();
      return `Check: ${shown}?  →  ${m[4] === 'True' ? 'yes' : 'no'}${m[5] ? ', so the loop stops' : ''}`;
    }
    t = t.replace(/^next iteration — /, 'Next: ').replace(/^for (.+) — loop ends$/, 'Loop finished');
    t = t.replace(/^Just ran line \d+$/, '');
    return t;
  }
  const VALS = /^(n|num|x|val|v|cur|curr|c|ch|el|e|item|h|height|price|p|a|b|w|word|node|total|sum|cnt|count|res|ans|best|t|temp|stackT)$/;
  const IDX = /^(i|j|k|l|r|lo|hi|mid|left|right|start|end|idx|index|stackInd)$/;
  function anchors(ss, steps, idx) {
    const L = idx.length, n = ss.length;
    if (!n) return [];
    const scal = st => { const o = {}; for (const [k, v] of Object.entries(st?.locals || {})) if (!/[[{(]/.test(v) && /^-?\d+(\.\d+)?$/.test(String(v).trim())) o[k] = +v; return o; };
    const known = new Array(n).fill(null);
    known[0] = 0;
    let from = 1;
    for (let k = 1; k < n; k++) {
      const s = ss[k];
      if (/\b(done|that's it|we return|returns?|answer is|finished)\b/i.test(s) && k >= n - 2) { known[k] = Math.max(from, L - 2); from = known[k]; continue; }
      if (/\b(at the end|in the end|by the end|finally|end up|once the loop)\b/i.test(s)) { known[k] = Math.max(from, L - 3); from = known[k]; continue; }
      const want = numsIn(s);
      if (!want.length) continue;
      // "Now we're at four" means the element being looked at is 4, so try
      // the loop-element variables first, then any variable.
      const find = only => {
        for (let j = from; j < L; j++) {
          const cur = scal(steps[idx[j]]), prev = scal(steps[idx[j] - 1] || steps[idx[j - 1]]);
          if (Object.entries(cur).some(([v, x]) => (!only || only.test(v)) && want.includes(x) && prev[v] !== x)) return j;
        }
        return -1;
      };
      const order = /\b(index|position|pointer)\b/i.test(s) ? [IDX, VALS, null] : [VALS, IDX, null];
      let hit = -1;
      for (const o of order) { hit = find(o); if (hit >= 0) break; }
      if (hit >= 0) { known[k] = hit; from = hit + 1; }
    }
    // Keep them in order, then fill the gaps evenly.
    let last = 0;
    for (let k = 0; k < n; k++) { if (known[k] != null) { if (known[k] < last) known[k] = null; else last = known[k]; } }
    const out = new Array(n);
    let pk = 0, pv = 0;
    for (let k = 0; k < n; k++) {
      if (known[k] != null) { out[k] = known[k]; pk = k; pv = known[k]; continue; }
      let nk = k + 1; while (nk < n && known[nk] == null) nk++;
      const nv = nk < n ? known[nk] : L;
      out[k] = Math.round(pv + ((nv - pv) * (k - pk)) / (nk - pk));
    }
    for (let k = 1; k < n; k++) out[k] = Math.min(L - 1, Math.max(out[k], out[k - 1]));
    return out;
  }

  async function sceneAnim(stage, s) {
    const t = S.opt;
    if (!t) {
      stage.innerHTML = `<div class="qs-insight"><div class="qs-tag good">Optimal</div><pre class="qs-codebox">${esc(s.optimalCode || '')}</pre></div>`;
      await narrate(s.say?.anim); await sleep(800); return;
    }
    stage.innerHTML = `<div class="qs-anim"><div class="qs-anim-head"><span class="qs-tag good">Optimal · ${esc(s.optimal?.time || '')}</span><span class="qs-anim-count"></span></div>
      <div class="qs-anim-frame"></div><p class="qs-anim-note" aria-live="off"></p>
      <div class="qs-anim-scrub"><i></i></div></div>`;
    const box = stage.querySelector('.qs-anim-frame'), note = stage.querySelector('.qs-anim-note'), cnt = stage.querySelector('.qs-anim-count'), bar = stage.querySelector('.qs-anim-scrub i');
    // Fit the run into ~25–75 s: shorter traces play slower, long ones are sampled.
    const idx = pick(t.steps.length, 40);
    const per = Math.min(2200, Math.max(1000, 60000 / idx.length));
    // Voice and picture move in lockstep. The frames are split into one
    // chunk per sentence: chunk k plays while sentence k is spoken, at a pace
    // fitted to how long that sentence takes, and sentence k+1 waits until
    // chunk k is on screen. So what is said is what is on screen.
    const ss = sentences(s.say?.anim || '');
    const n = Math.max(1, ss.length);
    // Each sentence is pinned to the frame it describes (build-anim-narration.mjs);
    // older scripts without pins fall back to matching the numbers they mention.
    const cues = s.animCues;
    const starts = Array.isArray(cues) && cues.length === ss.length && cues.every((c, k) => c >= 0 && c < idx.length && (!k || c > cues[k - 1]))
      ? cues.slice() : anchors(ss, t.steps, idx);
    const ends = ss.map((_, k) => Math.min(idx.length, (k + 1 < ss.length ? starts[k + 1] : idx.length - 1) + 1));
    let target = 0, shown = 0, talking = true, sent = 0, stalled = false;
    const said = narrate(s.say?.anim, k => { sent = k; target = Math.max(target, ends[k] || idx.length); },
      i => shown >= Math.min(idx.length, starts[i] + 1)).then(() => { talking = false; target = idx.length; });
    for (let k = 0; k < idx.length; k++) {
      // Frames wait for the voice to reach them — except the first, which is drawn at once, and a
      // stalled voice (slow speech service) never freezes the picture: after ~6 s it moves on alone.
      for (let waited = 0; k > 0 && k >= target && talking && !stalled; waited += 80) {
        if (waited >= 6000) { stalled = true; break; }      // from here on, frames play at their own pace
        await sleep(80);
      }
      const f = frame(t, idx[k]);
      box.innerHTML = f.html; note.textContent = f.note;
      if (talking) sayHit(box, ss[sent]);
      cnt.textContent = `step ${idx[k] + 1} / ${t.steps.length}`;
      bar.style.width = `${(100 * (k + 1)) / idx.length}%`;
      box.classList.remove('tick'); void box.offsetWidth; box.classList.add('tick');
      shown = k + 1;
      let dwell = per;
      if (talking && ss[sent]) {
        const size = Math.max(1, (ends[sent] || idx.length) - (starts[sent] || 0));
        dwell = Math.min(2200, Math.max(650, ((words(ss[sent]) / wps) * 1000) / size));
      }
      await sleep(k === 0 ? Math.max(dwell, 900) : k === idx.length - 1 ? Math.max(dwell, 1600) : dwell);
      // Pause and predict, once, around 40% in: guessing the next state before
      // seeing it is what makes the pattern stick.
      if (idx.length >= 16 && k === Math.floor(idx.length * 0.4)) {
        const nx = frame(t, idx[k + 1]);
        const ask = document.createElement('div');
        ask.className = 'qs-predict';
        ask.innerHTML = `<b>🤔 Pause &amp; predict</b><span>What happens on the next step? Say it before it plays.</span><i></i>`;
        box.appendChild(ask);
        await sleep(3200);
        ask.innerHTML = `<b>👀 Next:</b><span>${esc(nx.note || 'watch the highlight')}</span>`;
        await sleep(1400);
        ask.remove();
      }
    }
    note.innerHTML = `Result: <b>${esc(t.result ?? s.output)}</b> ✓`;
    await said;
    await sleep(900);
  }

  async function sceneCode(stage, s) {
    const code = s.optimalCode || '';
    const lines = code.split('\n');
    const walk = s.lineNotes?.length === lines.length;
    const notes = walk
      ? lines.map((_, line) => ({ line, note: s.lineNotes[line] })).filter(n => n.note)
      : (s.codeNotes || []).map(n => ({ ...n, line: lines.findIndex(l => n.match && l.includes(n.match)) })).filter(n => n.line >= 0);
    stage.innerHTML = `
      <div class="qs-codewrap">
        <div class="qs-anim-head"><span class="qs-tag good">The code</span><span class="qs-badges"><span class="qs-badge good">Time ${esc(s.optimal?.time || '?')}</span><span class="qs-badge">Space ${esc(s.optimal?.space || '?')}</span></span>
          <span class="qs-copy-row"><button type="button" class="qs-copy" data-copy="optimal">📋 Copy solution</button>${s.brute?.code ? '<button type="button" class="qs-copy" data-copy="brute">📋 Copy brute force</button>' : ''}
            <button type="button" class="qs-copy qs-to-ed" data-edit="optimal" title="Close the Short and open this problem in the editor with the optimal solution">✍ Open in editor</button>${s.brute?.code ? '<button type="button" class="qs-copy qs-to-ed" data-edit="brute" title="Open in the editor with the brute force instead">✍ Brute force in editor</button>' : ''}</span></div>
        <pre class="qs-code">${lines.map((l, k) => `<div data-l="${k}"><i>${k + 1}</i>${codeCell(l)}</div>`).join('')}</pre>
        <div class="qs-callout" hidden></div>
      </div>`;
    const pre = stage.querySelector('.qs-code'), call = stage.querySelector('.qs-callout');
    // Straight to the editor: close the Short, open this problem, and load the chosen solution.
    stage.querySelectorAll('[data-edit]').forEach(b => {
      b.onclick = e => {
        e.stopPropagation();
        const slug = S?.s?.slug, title = S?.s?.title, text = b.dataset.edit === 'brute' ? (s.brute?.code || '') : code;
        if (!slug || !text) return;
        close();
        window.openQuestion?.(slug, title, { code: text })?.catch?.(() => { /* openQuestion shows its own toast */ });
      };
    });
    // Copy the code to the clipboard (falls back to a hidden textarea where the async API is blocked).
    stage.querySelectorAll('.qs-copy').forEach(b => {
      b.onclick = async e => {
        e.stopPropagation();
        const text = b.dataset.copy === 'brute' ? (s.brute?.code || '') : code;
        let ok = false;
        try { await navigator.clipboard.writeText(text); ok = true; } catch {
          const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
          document.body.appendChild(ta); ta.select();
          try { ok = document.execCommand('copy'); } catch { /* nothing more to try */ }
          ta.remove();
        }
        const label = b.textContent;
        b.textContent = ok ? '✓ Copied' : 'Copy failed';
        setTimeout(() => { b.textContent = label; }, 1600);
      };
    });
    let shown = -1;
    const light = j => {
      if (j <= shown || !notes[j]) return;
      shown = j;
      const n = notes[j];
      pre.querySelectorAll('[data-l]').forEach(d => { const k = +d.dataset.l; d.classList.toggle('on', k === n.line); d.classList.toggle('seen', d.classList.contains('seen') || k === n.line); });
      pre.querySelector(`[data-l="${n.line}"]`)?.scrollIntoView({ block: 'nearest', behavior: reduced() ? 'auto' : 'smooth' });
      call.hidden = false;
      call.innerHTML = `<b>line ${n.line + 1}</b> ${esc(n.note)}`;
      call.classList.remove('pop'); void call.offsetWidth; call.classList.add('pop');
    };
    // With line notes, walk the whole solution top to bottom: each line is lit
    // while its explanation is spoken. Otherwise each sentence of the
    // voice-over moves the highlight to the matching key-line note.
    const said = walk
      ? narrate(notes.map(n => n.note), k => light(k))
      : narrate(s.say?.code, (k, n) => light(Math.min(notes.length - 1, Math.floor((k * notes.length) / n))));
    await said;
    for (let j = shown + 1; j < notes.length; j++) { light(j); await sleep(1800); }
    await sleep(1200);
    pre.querySelectorAll('.on').forEach(d => d.classList.remove('on'));
    await sleep(600);
  }

  const spokenO = t => ({ 'O(1)': 'constant time', 'O(log n)': 'log n time', 'O(n)': 'linear time', 'O(n log n)': 'n log n time', 'O(n²)': 'n squared time', 'O(n³)': 'n cubed time', 'O(2^n)': 'exponential time' })[t]
    || String(t).replace(/^O\((.*)\)$/, '$1').replace(/²/g, ' squared').replace(/³/g, ' cubed').replace(/\^/g, ' to the ').replace(/·/g, ' times ');
  /** Insight text, word by word, with the load-bearing words lit up. */
  const KEYW = /^(set|map|hash|stack|queue|heap|deque|pointer|pointers|window|sorted|binary|half|prefix|suffix|sum|count|counts|greedy|dp|table|graph|bfs|dfs|visited|trie|interval|intervals|sort|once|constant|linear|log|left|right|max|min|previous|seen|partner|complement|monotonic|recursion|memo|cycle|xor|bit|bits|parent|children)$/i;
  const kinetic = t => String(t).split(/(\s+)/).map((w, i) => /^\s+$/.test(w) ? w : `<span class="kw${KEYW.test(w.replace(/[^\w]/g, '')) ? ' hot' : ''}" style="--d:${Math.min(i / 2, 40) * 70}ms">${esc(w)}</span>`).join('');
  const TIMES = ['O(1)', 'O(log n)', 'O(n)', 'O(n log n)', 'O(n²)', 'O(n³)', 'O(2^n)', 'O(n!)'];
  const shuffle = a => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
  /** Retrieval beats re-watching: two quick questions before the recap. */
  async function sceneCheck(stage, s) {
    const qs = [];
    if (s.kind === 'pattern' && s.signals?.length) {
      const names = [...new Set((INDEX || []).filter(isPat).map(x => x.name || x.pattern))];
      const me = s.name || s.pattern;
      const sig = s.signals[Math.floor(Math.random() * s.signals.length)];
      qs.push({ q: `"${sig}" — which pattern?`, say: 'Quick check. A problem says this. Which pattern do you reach for?', a: me, opts: shuffle([me, ...shuffle(names.filter(n => n !== me)).slice(0, 3)]) });
    } else if (s.pattern) qs.push({ q: 'Which pattern cracks it?', say: 'Quick check. Which pattern was that?', a: s.pattern, opts: shuffle([s.pattern, ...shuffle(PATTERNS.filter(p => p !== s.pattern)).slice(0, 3)]) });
    const t = s.optimal?.time;
    if (t) {
      const pool = [t, ...(s.brute?.time && s.brute.time !== t ? [s.brute.time] : []), ...shuffle(TIMES.filter(x => x !== t && x !== s.brute?.time))].slice(0, 4);
      qs.push({ q: 'How fast is the optimal solution?', say: 'And how fast is the optimal solution?', a: t, opts: shuffle(pool) });
    }
    let score = 0;
    for (let i = 0; i < qs.length; i++) {
      const x = qs[i];
      stage.innerHTML = `<div class="qs-check"><div class="qs-tag qs-in vis">🧠 Quick check · ${i + 1}/${qs.length}</div>
        <h3 class="qs-check-q">${esc(x.q)}</h3><p class="qs-check-sub">${esc(s.title)} — answer from memory, then check.</p>
        <div class="qs-check-opts">${x.opts.map((o, k) => `<button type="button" data-k="${k}"><kbd>${k + 1}</kbd>${esc(o)}</button>`).join('')}</div>
        <p class="qs-check-fb" aria-live="polite"></p><div class="qs-check-time"><i></i></div></div>`;
      const my = token;
      let picked = null;
      const choose = k => { if (picked === null) picked = k; };
      stage.querySelectorAll('[data-k]').forEach(b => { b.onclick = () => choose(+b.dataset.k); });
      // Answer keys 1–4 belong to this question only. If the player was
      // closed mid-question the listener removes itself instead of eating
      // digits everywhere else (the code editor, inputs) for good.
      const key = e => {
        if (my !== token || !root || !root.isConnected) { document.removeEventListener('keydown', key, true); return; }
        if (e.target?.closest?.('input, textarea, select, [contenteditable="true"], .cm-editor')) return;
        if (/^[1-4]$/.test(e.key)) { e.preventDefault(); e.stopPropagation(); choose(+e.key - 1); }
      };
      document.addEventListener('keydown', key, true);
      narrate(x.say);
      const bar = stage.querySelector('.qs-check-time i');
      const LIM = 15000; let waited = 0;
      while (picked === null && waited < LIM) { await sleep(100); if (my !== token) { document.removeEventListener('keydown', key, true); return; } waited += 100; bar.style.width = `${100 - (100 * waited) / LIM}%`; }
      document.removeEventListener('keydown', key, true);
      const right = picked !== null && x.opts[picked] === x.a;
      if (right) score++;
      stage.querySelectorAll('[data-k]').forEach(b => { b.disabled = true; const o = x.opts[+b.dataset.k]; if (o === x.a) b.classList.add('ok'); else if (+b.dataset.k === picked) b.classList.add('bad'); });
      const fb = stage.querySelector('.qs-check-fb');
      fb.className = `qs-check-fb ${right ? 'ok' : 'bad'}`;
      fb.textContent = right ? (i ? 'Yes — exactly.' : 'Yes! Spotting the pattern is half the interview.') : `${picked === null ? 'Time.' : 'Not quite.'} It is ${x.a}.`;
      await narrate(right ? 'Yes, that is it.' : `It is ${spokenO(x.a)}.`);
      await sleep(900);
    }
    const p = pref(); setPref({ checks: { ...(p.checks || {}), [s.slug]: { score, of: qs.length, at: Date.now() } } });
    schedule(s.slug, score === qs.length);
  }

  async function sceneOutro(stage, s) {
    const next = list[listIdx + 1];
    stage.innerHTML = `
      <div class="qs-outro">
        <div class="qs-tag good qs-in">🧠 Remember it</div>
        <h2 class="qs-title qs-in">${esc(s.title)}</h2>
        <div class="qs-recap qs-in">
          <div><small>Brute force</small><b class="bad${(s.brute?.time || '').length > 12 ? ' long' : ''}">${esc(s.brute?.time || '?')}</b></div><span class="qs-arrow">→</span><div><small>Optimal</small><b class="good">${esc(s.optimal?.time || '?')}</b><small>space ${esc(s.optimal?.space || '?')}</small></div>
        </div>
        <div class="qs-mem qs-in">
          <div class="qs-mem-row"><span class="qs-mem-k">👀 Spot it</span>${(s.signals || []).length ? `<ul class="qs-sig">${s.signals.map(x => `<li>${esc(x)}</li>`).join('')}</ul><p>→ think <b>${esc(s.name || s.pattern || '')}</b>.</p>` : `<p>When ${esc(SIGNAL[s.pattern] || 'you see this shape again')} → think <b>${esc(s.pattern || '')}</b>.</p>`}</div>
          ${(s.variants || []).length ? `<div class="qs-mem-row"><span class="qs-mem-k">🧩 Variants</span><p>${s.variants.map(esc).join(' · ')}</p></div>` : ''}
          ${(s.problems || []).length ? `<div class="qs-mem-row"><span class="qs-mem-k">🏋️ Practise it</span><p class="qs-prac">${s.problems.filter(has).map(sl => `<button type="button" data-prac="${esc(sl)}">${esc((INDEX.find(x => x.slug === sl) || {}).title || sl)}</button>`).join('')}</p></div>` : ''}
          <div class="qs-mem-row"><span class="qs-mem-k">💡 The trick</span><p>${esc(s.optimal?.insight || '')}</p></div>
          ${(s.pitfalls || [])[0] ? `<div class="qs-mem-row"><span class="qs-mem-k">⚠️ Watch out</span><p>${esc(s.pitfalls[0])}</p></div>` : ''}
        </div>
        <label class="qs-own qs-in">✍️ <span>In your own words — the trick, in one line (saved to your card):</span><textarea rows="2" data-own placeholder="e.g. keep a map of what I've seen; look up target − n">${esc(pref().notes?.[s.slug] || '')}</textarea></label>
        <div class="qs-rewatch qs-in"><span>Rewatch:</span><button type="button" data-goto="1">Brute force</button><button type="button" data-goto="2">Insight</button><button type="button" data-goto="3">Animation</button><button type="button" data-goto="4">Code</button></div>
        <p class="qs-review qs-in">🃏 Saved to your trick cards — it comes back for a 10-second review in ${pref().review?.[s.slug] ? Math.max(1, Math.round((pref().review[s.slug].due - Date.now()) / DAYMS)) : 1} day(s).</p>
        <div class="qs-end-acts qs-in">
          <button type="button" class="qs-btn pri" data-solve>Solve it now</button>
          <button type="button" class="qs-btn" data-replay>↺ Replay</button>
          ${next ? `<button type="button" class="qs-btn" data-next>Next: ${esc(next.title)} ↓</button>` : ''}
        </div>
        ${next ? '<p class="qs-auto" hidden></p>' : ''}
      </div>`;
    stage.querySelector('[data-solve]').onclick = () => solve(s);
    stage.querySelector('[data-replay]').onclick = () => go(0);
    stage.querySelectorAll('[data-goto]').forEach(b => { b.onclick = () => go(+b.dataset.goto); });
    stage.querySelectorAll('[data-prac]').forEach(b => { b.onclick = () => { const ps = (s.problems || []).filter(has).map(sl => INDEX.find(x => x.slug === sl)); open(b.dataset.prac, ps); }; });
    const own = stage.querySelector('[data-own]');
    let stopAuto = () => {};
    own.addEventListener('focus', () => { stopAuto(); if (playing) toggle(); });
    own.addEventListener('input', () => { const n = { ...(pref().notes || {}) }; const v = own.value.trim().slice(0, 300); if (v) n[s.slug] = v; else delete n[s.slug]; setPref({ notes: n }); });
    stage.querySelector('[data-next]')?.addEventListener('click', () => step(1));
    const items = reveal(stage);
    show(items[1]); show(items[2]);
    await narrate(s.say?.outro, inStep(items));
    items.forEach(show);
    // Count S.watched once it reaches the recap.
    markWatched(s.slug);
    if (next && pref().autoNext !== false) {
      const p = stage.querySelector('.qs-auto');
      p.hidden = false;
      // Staying: nothing plays any more, so show ▶ (pressing it replays this scene).
      stopAuto = () => { token++; p.textContent = 'Staying here.'; ended = true; playing = false; paintCtl(); };
      for (let n = 6; n > 0; n--) { p.innerHTML = `Next short in ${n}… <button type="button" class="qs-link" data-stay>stay here</button>`; p.querySelector('[data-stay]').onclick = () => stopAuto(); await sleep(1000); }
      step(1);
    } else { ended = true; playing = false; paintCtl(); }
  }
  const RUN = { intro: sceneIntro, brute: sceneBrute, insight: sceneInsight, anim: sceneAnim, code: sceneCode, check: sceneCheck, outro: sceneOutro };

  function markWatched(slug) {
    const p = pref(); const w = p.watched || {};
    if (!w[slug]) { w[slug] = Date.now(); setPref({ watched: w }); }
    if (!pref().review?.[slug]) schedule(slug, true);
  }
  function solve(s) {
    backToPicker = false;
    close();
    const slug = s.kind === 'pattern' && s.rep ? s.rep : s.slug;
    const title = s.kind === 'pattern' ? ((INDEX || []).find(x => x.slug === slug) || {}).title || slug : s.title;
    if (window.QFSprint?.openHere) window.QFSprint.openHere(slug, title);
    else $('modeNeetcode')?.click();
  }

  // ------------------------------------------------------- the shell --
  function build() {
    root = document.createElement('div');
    root.className = 'qs-back';
    root.innerHTML = `
      <div class="qs-frame" role="dialog" aria-modal="true" aria-label="Short">
        <div class="qs-top">
          <div class="qs-segs">${SCENES.map((sc, k) => `<button type="button" class="qs-seg" data-seg="${k}" aria-label="${esc(sc.label)}"><i></i></button>`).join('')}</div>
          <div class="qs-bar">
            <span class="qs-scene"></span>
            <span class="qs-pos"></span>
            <button type="button" class="qs-ic qs-mk" data-a="mark" aria-label="Mark">☆</button>
            <button type="button" class="qs-ic" data-a="mute" aria-label="Mute"></button>
            <button type="button" class="qs-ic" data-a="speed" aria-label="Speed">1×</button>
            <button type="button" class="qs-ic" data-a="close" aria-label="Close">×</button>
          </div>
        </div>
        <div class="qs-stage"></div>
        <div class="qs-cap" aria-live="polite"></div>
        <div class="qs-ctl">
          <button type="button" class="qs-ic" data-a="prevShort" aria-label="Previous short">⤒</button>
          <button type="button" class="qs-ic" data-a="prev" aria-label="Previous scene">⏮</button>
          <button type="button" class="qs-ic qs-play" data-a="play" aria-label="Pause">❚❚</button>
          <button type="button" class="qs-ic" data-a="next" aria-label="Next scene">⏭</button>
          <button type="button" class="qs-ic" data-a="nextShort" aria-label="Next short">⤓</button>
          <button type="button" class="qs-solve" data-a="solve">Solve it</button>
        </div>
      </div>`;
    document.body.appendChild(root);
    document.documentElement.classList.add('qs-open');
    root.addEventListener('click', e => {
      if (e.target === root) return close();
      const seg = e.target.closest('[data-seg]'); if (seg) return go(+seg.dataset.seg);
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (!a) {
        // A tap on the picture pauses / resumes (not on buttons or the code).
        if (e.target.closest('.qs-stage') && !e.target.closest('button, a, input, select, pre')) toggle();
        return;
      }
      ({ close, play: toggle, prev: () => go(sceneIdx - 1), next: () => go(sceneIdx + 1), prevShort: () => step(-1), nextShort: () => step(1),
        mute: () => { setPref({ muted: !pref().muted }); if (narr) { narr.pause(); if (playing) narr.resume(); } paintCtl(); },
        speed: () => { speed = speed === 1 ? 1.25 : speed === 1.25 ? 1.5 : speed === 1.5 ? 0.75 : 1; paintCtl(); if (playing && narr) { narr.pause(); narr.resume(); } },
        solve: () => S && solve(S.s), mark: () => { if (S) { setMarked(S.s.slug, !isMarked(S.s.slug)); paintCtl(); } } })[a]?.();
    });
    let y0 = null, x0 = null;
    root.addEventListener('touchstart', e => { y0 = e.touches[0].clientY; x0 = e.touches[0].clientX; }, { passive: true });
    root.addEventListener('touchend', e => {
      if (y0 == null) return;
      const dy = e.changedTouches[0].clientY - y0, dx = e.changedTouches[0].clientX - x0;
      y0 = null;
      if (Math.abs(dy) > 80 && Math.abs(dy) > Math.abs(dx) * 1.5 && !e.target.closest('.qs-code, .qs-anim-frame, .qs-mini-frame')) step(dy < 0 ? 1 : -1);
      else if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5) go(sceneIdx + (dx < 0 ? 1 : -1));
    }, { passive: true });
    document.addEventListener('keydown', onKey, true);
    root.querySelector('.qs-play').focus();
  }
  function onKey(e) {
    if (!root || e.metaKey || e.ctrlKey || e.altKey) return;
    // Escape closes the player even while typing in the "own words" box.
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (e.target.closest?.('input, textarea, select')) return;
    const k = e.key;
    const map = { ' ': toggle, k: toggle, ArrowRight: () => go(sceneIdx + 1), ArrowLeft: () => go(sceneIdx - 1), ArrowDown: () => step(1), ArrowUp: () => step(-1), Escape: close,
      m: () => root.querySelector('[data-a=mute]').click(), M: () => root.querySelector('[data-a=mute]').click() };
    if (map[k] && !(k === ' ' && e.target.closest?.('button') && root.contains(e.target))) { e.preventDefault(); e.stopPropagation(); map[k](); }
    else if (k === 'Escape') { e.stopPropagation(); close(); }
  }
  function paintCtl() {
    if (!root) return;
    const p = root.querySelector('.qs-play');
    p.textContent = playing ? '❚❚' : '▶'; p.setAttribute('aria-label', playing ? 'Pause' : 'Play');
    const m = root.querySelector('[data-a=mute]');
    m.textContent = muted() ? '🔇' : '🔊'; m.setAttribute('aria-label', muted() ? 'Unmute' : 'Mute');
    if (!window.Voice?.canSpeak?.()) m.title = 'This browser cannot speak — captions only';
    root.querySelector('[data-a=speed]').textContent = `${speed}×`;
    const mk = root.querySelector('[data-a=mark]'); const on = !!(S && isMarked(S.s.slug)); mk.textContent = on ? '★' : '☆'; mk.classList.toggle('on', on); mk.setAttribute('aria-label', on ? 'Unmark this short' : 'Mark this short'); mk.title = on ? 'Marked — click to unmark' : 'Mark for later';
    root.querySelector('[data-a=prevShort]').disabled = listIdx <= 0;
    root.querySelector('[data-a=nextShort]').disabled = listIdx >= list.length - 1;
    root.querySelector('.qs-pos').textContent = list.length > 1 ? `${listIdx + 1} / ${list.length}` : '';
    root.classList.toggle('paused', !playing);
  }
  function toggle() {
    playing = !playing;
    // The scene already finished (end of the recap, or "stay here"): ▶ replays it.
    if (playing && !narr && ended) return go(sceneIdx);
    if (narr) { if (playing) narr.resume(); else narr.pause(); }
    paintCtl();
  }

  /** Progress: earlier scenes full, the current one fills over its estimate. */
  let segRaf = 0, segT = 0, segEst = 1;
  function estimate(sc, s) {
    const w = words(sc === 'code' && s.lineNotes ? s.lineNotes.join(' ') : s.say?.[sc]) / wps * 1000;
    if (sc === 'anim' && S.opt) { const n = pick(S.opt.steps.length, 64).length; return Math.max(w, n * Math.min(1800, Math.max(750, 60000 / n)) + 3000); }
    if (sc === 'brute' && S.brute) return Math.max(w, pick(S.brute.steps.length, 18).length * 650 + 1700);
    return Math.max(w + 1200, 6000);
  }
  function paintSegs() {
    cancelAnimationFrame(segRaf);
    const segs = root.querySelectorAll('.qs-seg i');
    segs.forEach((x, k) => { x.style.width = k < sceneIdx ? '100%' : '0%'; });
    let last = performance.now();
    const my = token;
    const tick = now => {
      if (my !== token || !root) return;
      if (playing) segT += (now - last) * speed;
      last = now;
      segs[sceneIdx].style.width = `${Math.min(100, (100 * segT) / segEst)}%`;
      segRaf = requestAnimationFrame(tick);
    };
    segRaf = requestAnimationFrame(tick);
  }

  async function go(k) {
    if (!S) return;
    k = Math.max(0, Math.min(SCENES.length - 1, k));
    token++; hush();
    sceneIdx = k; ended = false;
    if (!playing) { playing = true; }
    paintCtl();
    const sc = SCENES[k];
    root.querySelector('.qs-scene').textContent = `${k + 1}. ${S.s.kind === 'pattern' ? ({ brute: 'Without the pattern', insight: 'The recipe', anim: 'See it work' })[sc.id] || sc.label : sc.label}`;
    const stage = root.querySelector('.qs-stage');
    stage.className = `qs-stage sc-${sc.id}`;
    stage.scrollTop = 0;
    segT = 0; segEst = estimate(sc.id, S.s);
    paintSegs();
    const my = token;
    try { await RUN[sc.id](stage, S.s); }
    catch (e) { console.warn('[shorts]', e); }
    if (my !== token || !root) return;
    if (k < SCENES.length - 1) go(k + 1);
  }

  async function load(slug) {
    token++; hush();
    const stage = root.querySelector('.qs-stage');
    root.querySelector('.qs-cap').textContent = '';
    root.querySelectorAll('.qs-seg i').forEach(x => { x.style.width = '0'; });
    stage.className = 'qs-stage';
    stage.innerHTML = `<div class="qs-loading"><div class="qs-spin"></div><p>Loading the short…</p></div>`;
    const my = token;
    let d;
    try { d = await fetchShort(slug); }
    catch (e) {
      if (my !== token) return;
      stage.innerHTML = `<div class="qs-loading"><p>Could not load this short: ${esc(e.message)}</p><button type="button" class="qs-btn pri" data-retry>Try again</button></div>`;
      stage.querySelector('[data-retry]').onclick = () => load(slug);
      return;
    }
    if (my !== token || !root) return;
    markStarted(slug);
    S = { s: d, opt: prep(d.traces?.optimal, d.optimalCode || ''), brute: prep(d.traces?.brute, d.brute?.code || '') };
    root.querySelector('.qs-frame').setAttribute('aria-label', `Short: ${d.title}`);
    paintCtl();
    // Warm the next one so swiping feels instant.
    if (list[listIdx + 1]) fetchShort(list[listIdx + 1].slug).catch(() => {});
    // The neural voice takes seconds per sentence to synthesise; doing that on
    // demand left the picture running ahead of a silent voice. Fetch every
    // sentence of this short now, in speaking order, and only start once the
    // opening lines are ready — then each scene's voice is already there.
    if (!muted() && window.Voice?.willUseServer?.() && window.Voice.synthText) {
      const all = ['intro', 'brute', 'insight', 'anim', 'code', 'outro'].flatMap(k => (k === 'code' && d.lineNotes ? d.lineNotes.filter(Boolean) : sentences(d.say?.[k])));
      all.push('Quick check. Which pattern was that?', 'Quick check. A problem says this. Which pattern do you reach for?', 'And how fast is the optimal solution?', 'Yes, that is it.');
      let next = 0;
      const worker = async () => { while (next < all.length && my === token) { const t = all[next++]; await window.Voice.synthText(t, undefined, pace()); } };
      const pool = [worker(), worker(), worker()];
      const first = sentences(d.say?.intro).slice(0, 2).map(t => window.Voice.synthText(t, undefined, pace()));
      stage.innerHTML = '<div class="qs-loading"><div class="qs-spin"></div><p>Getting the voice ready…</p></div>';
      await Promise.race([Promise.all(first), new Promise(r => setTimeout(r, 12000))]);
      void pool;
      if (my !== token || !root) return;
    }
    playing = true;
    go(0);
  }
  function step(dir) {
    const n = listIdx + dir;
    if (n < 0 || n >= list.length) return;
    listIdx = n;
    paintCtl();
    root.querySelector('.qs-frame').classList.remove('slide-up', 'slide-down'); void root.offsetWidth;
    root.querySelector('.qs-frame').classList.add(dir > 0 ? 'slide-up' : 'slide-down');
    load(list[listIdx].slug);
  }

  function close() {
    if (!root) return;
    token++; hush();
    cancelAnimationFrame(segRaf);
    document.removeEventListener('keydown', onKey, true);
    root.remove(); root = null; S = null;
    document.documentElement.classList.remove('qs-open');
    paintBadges();
    // Opened from the Shorts picker: closing goes back to it, not past it.
    if (backToPicker) { backToPicker = false; picker(); }
  }
  let backToPicker = false;

  /** Open one short. `items` (optional) is the list to swipe through. */
  async function open(slug, items) {
    await index();
    list = items && items.length ? items : INDEX.filter(x => x.slug === slug);
    if (!list.length) list = [{ slug, title: slug }];
    listIdx = Math.max(0, list.findIndex(x => x.slug === slug));
    if (!root) build();
    speed = 1;
    paintCtl();
    load(list[listIdx].slug);
  }
  /** A topic as a feed, starting with the first one not watched yet. */
  // ------------------------------------------------------- status --
  // pending (blue) · in progress (orange) · done (green) · marked (yellow)
  const statusOf = slug => { const p = pref(); return p.watched?.[slug] ? 'done' : p.started?.[slug] ? 'doing' : 'todo'; };
  const isMarked = slug => !!pref().marked?.[slug];
  function setMarked(slug, on) { const m = { ...(pref().marked || {}) }; if (on) m[slug] = Date.now(); else delete m[slug]; setPref({ marked: m }); }
  function markStarted(slug) { const p = pref(); if (p.watched?.[slug] || p.started?.[slug]) return; setPref({ started: { ...(p.started || {}), [slug]: Date.now() } }); }

  const PATTERNS = ['Arrays & Hashing', 'Two Pointers', 'Sliding Window', 'Stack', 'Binary Search', 'Linked List', 'Trees', 'Heap / Priority Queue', 'Backtracking', 'Tries', 'Graphs', 'Advanced Graphs', '1-D Dynamic Programming', '2-D Dynamic Programming', 'Greedy', 'Intervals', 'Math & Geometry', 'Bit Manipulation'];
  const isPat = x => x.kind === 'pattern';
  const LISTS = [
    { id: 'g30', label: 'Google · last 30 days', test: x => isPat(x) || (x.lists || []).includes('Google-Last-30-Days') },
    { id: 'google', label: 'All Google', test: x => isPat(x) || (x.lists || []).length > 0 },
    { id: 'nc', label: 'NeetCode 150', test: x => isPat(x) || x.neetcode },
    { id: 'pat', label: '📘 Patterns', test: isPat },
    { id: 'all', label: 'Everything', test: () => true },
  ];
  const SHOW = [['all', 'All'], ['todo', 'Pending'], ['doing', 'In progress'], ['done', 'Done'], ['marked', 'Marked'], ['review', 'Review due']];
  const inList = id => INDEX.filter((LISTS.find(l => l.id === id) || LISTS[3]).test);
  const byTopic = xs => { const g = {}; for (const x of [...xs.filter(isPat), ...xs.filter(y => !isPat(y))]) (g[x.pattern] ||= []).push(x); return Object.entries(g).sort((a, b) => { const i = p => { const n = PATTERNS.indexOf(p); return n < 0 ? 99 : n; }; return i(a[0]) - i(b[0]); }); };

  async function topic(pattern, listId) {
    await index();
    const items = (listId ? inList(listId) : INDEX).filter(x => !pattern || x.pattern === pattern);
    if (!items.length) return picker();
    const first = items.find(x => statusOf(x.slug) === 'doing') || items.find(x => statusOf(x.slug) === 'todo') || items[0];
    open(first.slug, items);
  }

  /** Trick cards: every watched short as a flashcard, due ones first.
   *  Recall the trick, flip, then say whether you had it — that sets the
   *  next review (1, 3, 7, 16, 35 days). */
  async function deck() {
    await index();
    const watched = INDEX.filter(x => pref().watched?.[x.slug]);
    const due = watched.filter(x => dueFor(x.slug)), rest = watched.filter(x => !dueFor(x.slug));
    const cards = [...shuffle(due), ...shuffle(rest)];
    const back = document.createElement('div');
    back.className = 'qs-back qs-deck-back';
    document.body.appendChild(back);
    let i = 0, flipped = false, got = 0;
    const shut = () => { back.remove(); document.removeEventListener('keydown', key, true); };
    const draw = () => {
      if (i >= cards.length) {
        back.innerHTML = `<div class="qs-deck" role="dialog" aria-modal="true"><div class="qs-pick-head"><h2>🃏 Trick cards</h2><button type="button" class="qs-ic" data-x aria-label="Close">×</button></div>
          <div class="qs-deck-end"><div class="qs-q-big">${got}<small>/${cards.length}</small></div><p>${cards.length ? 'Tricks recalled. The ones you missed come back in ten minutes; the rest in a few days.' : 'Watch a short to collect its trick card.'}</p>
          <div class="qs-end-acts"><button type="button" class="qs-btn pri" data-x>Done</button></div></div></div>`;
        return;
      }
      const x = cards[i];
      back.innerHTML = `<div class="qs-deck" role="dialog" aria-modal="true" aria-label="Trick cards">
        <div class="qs-pick-head"><h2>🃏 Trick cards</h2><span class="qs-pos">${i + 1} / ${cards.length}${dueFor(x.slug) ? ' · due' : ''}</span><button type="button" class="qs-ic" data-x aria-label="Close">×</button></div>
        <div class="qs-card${flipped ? ' flip' : ''}" data-flip tabindex="0" role="button" aria-label="${flipped ? 'Card back' : 'Show the trick'}">
          <div class="qs-card-in">
            <div class="qs-card-f"><span class="qs-kicker">${esc(x.difficulty || '')}</span><h3>${esc(x.title)}</h3><p>Which pattern, and what's the trick? Say both out loud, then tap to check.</p><span class="qs-card-tap">Tap or press Space</span></div>
            <div class="qs-card-b"><span class="qs-kicker">${esc(x.title)}</span><p class="qs-card-trick">💡 ${esc(x.insight || '')}</p><p class="qs-card-spot">👀 When ${esc(SIGNAL[x.pattern] || 'you see this shape')} → <b>${esc(x.pattern || '')}</b></p><p class="qs-card-cost">${esc(x.bruteTime || '?')} → <b>${esc(x.time || '?')}</b></p>${pref().notes?.[x.slug] ? `<p class="qs-card-own">✍️ You wrote: “${esc(pref().notes[x.slug])}”</p>` : ''}</div>
          </div>
        </div>
        <div class="qs-deck-acts">${flipped ? `<button type="button" class="qs-btn" data-again>✗ Missed it <kbd>1</kbd></button><button type="button" class="qs-btn pri" data-got>✓ Had it <kbd>2</kbd></button><button type="button" class="qs-btn" data-watch>▶ Rewatch</button>` : `<button type="button" class="qs-btn pri" data-flip>Show the trick</button>`}</div>
      </div>`;
      back.querySelector(flipped ? '[data-got]' : '[data-flip]')?.focus();
    };
    const grade = ok => { schedule(cards[i].slug, ok); if (ok) got++; i++; flipped = false; draw(); };
    const key = e => {
      if (e.key === 'Escape') { e.stopPropagation(); shut(); return; }
      if (i >= cards.length) return;
      if (!flipped && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); flipped = true; draw(); }
      else if (flipped && e.key === '1') grade(false); else if (flipped && e.key === '2') grade(true);
    };
    document.addEventListener('keydown', key, true);
    back.addEventListener('click', e => {
      if (e.target === back || e.target.closest('[data-x]')) return shut();
      if (e.target.closest('[data-flip]') && !flipped) { flipped = true; draw(); return; }
      if (e.target.closest('[data-again]')) return grade(false);
      if (e.target.closest('[data-got]')) return grade(true);
      if (e.target.closest('[data-watch]')) { const x = cards[i]; shut(); open(x.slug, INDEX.filter(y => y.pattern === x.pattern)); }
    });
    draw();
  }

  /** The Shorts page: pick a list, then every topic in it, coloured by status. */
  async function picker() {
    await index();
    const back = document.createElement('div');
    back.className = 'qs-back qs-pick-back';
    document.body.appendChild(back);
    let list = pref().list || 'g30', show = pref().show || 'all';
    const draw = () => {
      const xs = inList(list);
      const keep = x => show === 'all' || (show === 'marked' ? isMarked(x.slug) : show === 'review' ? dueFor(x.slug) : statusOf(x.slug) === show);
      const groups = byTopic(xs);
      const cnt = k => xs.filter(x => k === 'marked' ? isMarked(x.slug) : k === 'review' ? dueFor(x.slug) : statusOf(x.slug) === k).length;
      const deckN = INDEX.filter(x => pref().watched?.[x.slug]).length, dueN = INDEX.filter(x => dueFor(x.slug)).length;
      back.innerHTML = `<div class="qs-pick" role="dialog" aria-modal="true" aria-labelledby="qsPickH">
        <div class="qs-pick-head"><h2 id="qsPickH">🎬 Shorts</h2><button type="button" class="qs-deck-btn${dueN ? ' due' : ''}" data-deck ${deckN ? '' : 'disabled title="Watch a short to collect its trick card"'}>🃏 Trick cards <small>${dueN ? `${dueN} due` : deckN}</small></button><button type="button" class="qs-ic" data-x aria-label="Close">×</button></div>
        <p class="qf-muted">2–3 minute explainers: the problem, the brute force, the insight, the optimal solution running, the code. Swipe or press ↓ for the next one.</p>
        <div class="qs-lists" role="tablist" aria-label="Question list">${LISTS.map(l => `<button type="button" role="tab" aria-selected="${l.id === list}" data-list="${l.id}">${esc(l.label)} <small>${inList(l.id).length}</small></button>`).join('')}</div>
        <div class="qs-legend">${SHOW.map(([k, lab]) => `<button type="button" class="qs-filt k-${k}" aria-pressed="${show === k}" data-show="${k}">${k === 'all' ? '' : '<i></i>'}${lab}${k === 'all' ? ` <small>${xs.length}</small>` : ` <small>${cnt(k)}</small>`}</button>`).join('')}</div>
        ${xs.length ? '' : '<p class="qf-muted">No shorts in this list yet.</p>'}
        <div class="qs-topics">${groups.map(([p, all]) => {
          const vis = all.filter(keep);
          if (!vis.length) return '';
          const d = all.filter(x => statusOf(x.slug) === 'done').length, g = all.filter(x => statusOf(x.slug) === 'doing').length;
          return `<section class="qs-topic"><button type="button" class="qs-topic-head" data-topic="${esc(p)}"><b>${esc(p)}</b><span>${d}/${all.length} done${g ? ` · ${g} in progress` : ''} · ▶ play topic</span><i class="d" style="width:${(100 * d) / all.length}%"></i><i class="g" style="left:${(100 * d) / all.length}%;width:${(100 * g) / all.length}%"></i></button>
            <div class="qs-topic-list">${vis.map(x => { const st = statusOf(x.slug), mk = isMarked(x.slug); return `<div class="qs-tile st-${st}${mk ? ' marked' : ''}${isPat(x) ? ' pattern' : ''}"><button type="button" class="qs-tile-main" data-slug="${esc(x.slug)}" data-topic="${esc(p)}"><span class="qs-tile-play">▶</span>${isPat(x) ? `<span class="qs-tile-kind">📘 ${x.name ? 'SUB-PATTERN' : 'PATTERN'}</span>` : ''}<b>${esc(isPat(x) ? (x.name || x.pattern) : x.title)}</b><small>${dueFor(x.slug) ? '<span class="qs-due">↻ review</span> ' : ''}${esc(x.difficulty || '')} · ${mk ? '★ ' : ''}${{ todo: 'pending', doing: 'in progress', done: 'done ✓' }[st]}</small></button><button type="button" class="qs-star" data-mark="${esc(x.slug)}" aria-pressed="${mk}" aria-label="${mk ? 'Unmark' : 'Mark'} ${esc(x.title)}" title="${mk ? 'Unmark' : 'Mark for later'}">${mk ? '★' : '☆'}</button></div>`; }).join('')}</div></section>`;
        }).join('') || (xs.length ? '<p class="qf-muted">Nothing here with this filter.</p>' : '')}</div></div>`;
    };
    draw();
    const shut = () => { back.remove(); document.removeEventListener('keydown', k, true); };
    const k = e => { if (e.key === 'Escape') { e.stopPropagation(); shut(); } };
    document.addEventListener('keydown', k, true);
    back.addEventListener('click', e => {
      if (e.target === back || e.target.closest('[data-x]')) return shut();
      if (e.target.closest('[data-deck]')) { shut(); deck(); return; }
      const l = e.target.closest('[data-list]'); if (l) { list = l.dataset.list; setPref({ list }); draw(); return; }
      const f = e.target.closest('[data-show]'); if (f) { show = f.dataset.show; setPref({ show }); draw(); return; }
      const m = e.target.closest('[data-mark]'); if (m) { setMarked(m.dataset.mark, !isMarked(m.dataset.mark)); draw(); back.querySelector(`[data-mark="${CSS.escape(m.dataset.mark)}"]`)?.focus(); return; }
      const t = e.target.closest('[data-slug]');
      if (t) { shut(); open(t.dataset.slug, inList(list).filter(x => x.pattern === t.dataset.topic)).then(() => { backToPicker = true; }); return; }
      const h = e.target.closest('.qs-topic-head');
      if (h) { shut(); topic(h.dataset.topic, list); }
    });
    back.querySelector('[aria-selected="true"], [data-x]')?.focus();
  }

  // ------------------------------------------------- entry points ----
  /** Add "▶ Short" buttons wherever a problem or topic appears. */
  function decorate(rootEl = document) {
    if (!INDEX || !INDEX.length) return;
    const btn = (slug, cls, label) => `<button type="button" class="qs-open ${cls}" data-short="${esc(slug)}" title="2–3 minute animated explainer">${label}</button>`;
    // Problem pages (Google list, NeetCode) and the Coding tab: next to "Watch the solution".
    rootEl.querySelectorAll?.('details.qt-embed:not([data-qs])').forEach(d => {
      d.dataset.qs = '1';
      const slug = d.dataset.slug || (d.id === 'qtCodingEmbed' ? '' : '');
      const b = document.createElement('div');
      b.className = 'qs-embed-row';
      b.innerHTML = `<button type="button" class="qs-open qs-embed" data-short-current="${d.id === 'qtCodingEmbed' ? '1' : ''}" data-short="${esc(slug)}"><span class="qs-play-ic" aria-hidden="true">▶</span> Watch the 2-minute Short <small>problem → brute force → insight → animation → code</small></button>`;
      d.before(b);
      paintEmbed(b);
    });
    document.querySelectorAll('.qs-embed-row').forEach(paintEmbed);
    // NeetCode tab: each open topic gets "Watch this topic as Shorts".
    rootEl.querySelectorAll?.('.nc-group-items:not([data-qs])').forEach(g => {
      g.dataset.qs = '1';
      const p = g.parentElement?.querySelector('.nc-group-head')?.dataset.pattern;
      const n = INDEX.filter(x => x.pattern === p).length;
      if (!p || !n) return;
      g.insertAdjacentHTML('afterbegin', `<button type="button" class="qs-open qs-topic-btn" data-short-topic="${esc(p)}">🎬 Watch ${esc(p)} as Shorts <small>${n} × 2–3 min</small></button>`);
    });
    // Today: problem tasks get a "Short" button before "Solve".
    rootEl.querySelectorAll?.('.qf-task [data-go^="p:"]:not([data-qs])').forEach(b => {
      b.dataset.qs = '1';
      const slug = b.dataset.go.slice(2);
      if (!has(slug)) return;
      b.insertAdjacentHTML('beforebegin', btn(slug, 'qf-b sm qs-task', '▶ Short'));
    });
  }
  function paintEmbed(row) {
    const b = row.querySelector('.qs-embed');
    const slug = b.dataset.shortCurrent === '1' ? window.currentQuestion?.slug : b.dataset.short;
    row.hidden = !slug || !has(slug);
  }
  function paintBadges() { document.querySelectorAll('.qs-embed-row').forEach(paintEmbed); }

  document.addEventListener('click', e => {
    const b = e.target.closest('[data-short], [data-short-topic]');
    if (!b || b.closest('.qs-back')) return;
    e.preventDefault(); e.stopPropagation();
    if (b.dataset.shortTopic) { topic(b.dataset.shortTopic); return; }
    const slug = b.dataset.shortCurrent === '1' ? window.currentQuestion?.slug : b.dataset.short;
    if (!slug) return;
    const me = INDEX.find(x => x.slug === slug);
    open(slug, me ? INDEX.filter(x => x.pattern === me.pattern) : null);
  }, true);

  async function boot() {
    await index();
    if (!INDEX.length) { setTimeout(() => { INDEX = null; boot(); }, 15000); return; }   // signed out: try again later
    decorate();
    let q = 0;
    new MutationObserver(() => { if (q) return; q = requestAnimationFrame(() => { q = 0; decorate(); }); }).observe(document.body, { childList: true, subtree: true });
    window.addEventListener('question-changed', paintBadges);
  }
  window.QFShorts = { open, topic, picker, deck, statusOf, isMarked, setMarked, has: s => has(s), index };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 1200)); else setTimeout(boot, 1200);
})();
