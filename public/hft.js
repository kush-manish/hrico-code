/* HFT / Optiver prep: animated guides plus timed practice replicas. */
(function () {
  /** Fair shuffle (sort with a random comparator is biased in V8). */
  const fyShuffle = a => { const r = [...a]; for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; };
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const rnd = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
  const pick = xs => xs[rnd(0, xs.length - 1)];
  const fmt = n => Number.isInteger(n) ? String(n) : String(Number(n.toFixed(2))).replace(/\.0$/, '');
  const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  const STORE = 'hft.practice.history';
  let page = 'prep', current = 'overview', run = null, demoTimers = [], keyHandler = null;

  const prepItems = [
    { id: 'overview', group: 'Optiver HFT plan', title: '5-hour crash plan', sub: 'What to prioritise now' },
    { id: '80in8', group: '80 in 8 math', title: '80 in 8 scoring & pace', sub: '+1 / -1, six seconds per question' },
    { id: 'math-tricks', group: '80 in 8 math', title: 'Animated mental-math tricks', sub: '11×, 12×, 5×, x5², missing operand' },
    { id: 'zapn', group: 'Zap-N games', title: 'Zap-N game-by-game guide', sub: 'Code Compare, Switch, Skyscraper, Balloon…' },
    { id: 'strategy', group: 'Exam strategy', title: 'Score maximisation rules', sub: 'When to answer, slow down, or bail' },
  ];

  const practiceItems = [
    { id: 'p80', group: 'Math practice', title: '80 in 8 replica', sub: '80 questions · 8 minutes · +1/−1' },
    { id: 'p20', group: 'Math practice', title: '20-question sprint', sub: 'Fast warm-up before full runs' },
    { id: 'number-logic', group: 'Pattern practice', title: 'Number Logic', sub: 'Optiver-style sequence rules' },
    { id: 'code-compare', group: 'Zap-N practice', title: 'Code Compare', sub: 'Same/different string matching' },
    { id: 'switch', group: 'Zap-N practice', title: 'The Switch', sub: 'Rule flipping: arrows vs odd/even' },
    { id: 'skyscraper', group: 'Zap-N practice', title: 'Skyscraper', sub: 'Block-stacking planning' },
    { id: 'balloon', group: 'Zap-N practice', title: 'Balloon risk', sub: 'Pump/cash-out EV discipline' },
    { id: 'pin', group: 'Zap-N practice', title: 'Digit recall', sub: 'Chunk PIN memory' },
    { id: 'twentyfour', group: 'Zap-N practice', title: '24 points', sub: 'Arithmetic search speed' },
    { id: 'dial', group: 'Zap-N practice', title: 'Dial timing', sub: 'Reaction timing without panic' },
    { id: 'pattern', group: 'Zap-N practice', title: 'Pattern deduction', sub: 'Matrix rule spotting' },
  ];

  const gameTips = {
    'code-compare': ['Scan in fixed chunks of 3–4 characters.', 'Do not read aloud mentally; compare shape first, then exact mismatch.', 'Use keyboard: left = same, right = different.'],
    switch: ['Say the active rule in your head once: arrow or parity.', 'On rule flips, pause 0.2s; most errors happen immediately after a flip.', 'For parity, only inspect the last digit.'],
    skyscraper: ['Think target skyline, not individual blocks.', 'Place biggest columns first; avoid creating holes you cannot fix.', 'If one move is clearly safe, take it fast and bank time.'],
    balloon: ['Treat early pumps as high EV, late pumps as danger.', 'Cash out after 4–6 safe pumps unless the run has shown very low risk.', 'Never chase after a burst; reset emotionally.'],
    pin: ['Chunk 6–8 digits as 2–2–2 or 3–3.', 'Say chunks rhythmically once, then type immediately.', 'Do not re-read every digit; trust the chunk.'],
    twentyfour: ['Search around 6×4, 8×3, 12×2, 20+4.', 'Use all four numbers exactly once.', 'If stuck after 8s, reset with a different pair.'],
    dial: ['Track rhythm, not the hand visually every millisecond.', 'Click slightly before the centre of the target if you react late.', 'Relax shoulders; tension adds delay.'],
    pattern: ['Check row rule, column rule, shape count, rotation, fill, then colour.', 'Name the rule in one sentence before answering.', 'Eliminate options that violate any one dimension.'],
  };

  function setKeys(fn) {
    if (keyHandler) document.removeEventListener('keydown', keyHandler, true);
    keyHandler = fn || null;
    if (keyHandler) document.addEventListener('keydown', keyHandler, true);
  }

  function stopRun() {
    // Leaving mid-run keeps what was answered (marked partial) instead of losing it silently.
    if (run && run.idx > 0 && typeof run.correct === 'number') {
      try { saveHistory({ type: run.type, score: run.correct - run.wrong, correct: run.correct, wrong: run.wrong, partial: true }); window.QF?.toast?.(`Saved a partial run (${run.idx} answered).`); } catch { /* best effort */ }
    }
    if (run?.timer) clearInterval(run.timer);
    if (run?.anim) clearInterval(run.anim);
    run = null;
    setKeys(null);
  }

  function clearDemos() {
    demoTimers.forEach(clearInterval);
    demoTimers = [];
  }

  function history() {
    try { return JSON.parse(localStorage.getItem(STORE) || '[]'); } catch { return []; }
  }
  function saveHistory(rec) {
    const h = history();
    h.unshift({ ...rec, at: new Date().toISOString() });
    try { localStorage.setItem(STORE, JSON.stringify(h.slice(0, 40))); } catch { /* private */ }
  }

  function renderSide() {
    const items = page === 'prep' ? prepItems : practiceItems;
    const groups = [...new Set(items.map(x => x.group))];
    $('hftList').innerHTML = `<div class="pl-side-head">
      <div class="pl-side-title">HFT ${page === 'prep' ? 'Prep' : 'Practice'}</div>
      <div class="pl-side-sub">Optiver-focused math + Zap-N trainer</div>
    </div><nav class="pl-tree">
      ${groups.map(g => `<div class="pl-group-name">${esc(g)}</div>${items.filter(x => x.group === g).map(x => `<button class="pl-art${current === x.id ? ' sel' : ''}" data-id="${esc(x.id)}"><span class="pl-art-dot">●</span><span>${esc(x.title)}<br><small>${esc(x.sub)}</small></span></button>`).join('')}`).join('')}
    </nav>`;
    $('hftList').querySelectorAll('.pl-art').forEach(b => b.onclick = () => open(b.dataset.id));
  }

  function open(id) {
    stopRun(); clearDemos();
    current = id || (page === 'prep' ? 'overview' : 'p80');
    renderSide();
    if (page === 'prep') renderPrep(current); else renderPractice(current);
  }
  window.openHft = open;
  window.stopHft = () => { stopRun(); clearDemos(); };

  function renderHft(nextPage) {
    page = nextPage || 'prep';
    const valid = (page === 'prep' ? prepItems : practiceItems).some(x => x.id === current);
    if (!valid) current = page === 'prep' ? 'overview' : 'p80';
    open(current);
  }
  window.renderHft = renderHft;

  function facts() {
    return `<div class="hft-facts">
      <div class="hft-fact"><b>80</b><span>questions in 8 min</span></div>
      <div class="hft-fact"><b>+1 / −1</b><span>wrong answers hurt</span></div>
      <div class="hft-fact"><b>55+</b><span>reported pass-zone net</span></div>
      <div class="hft-fact"><b>70+</b><span>competitive target</span></div>
    </div>`;
  }

  function renderPrep(id) {
    const views = { overview, '80in8': eightyGuide, 'math-tricks': mathTricks, zapn, strategy };
    $('hftDetail').innerHTML = `<article class="hft-page">${views[id]?.() || overview()}</article>`;
    setupDemos();
  }

  function overview() {
    return `<div class="hft-kicker">Optiver HFT track</div><h1>Prep + real practice for Optiver-style assessment</h1>
      <p class="hft-lede">Use this as your last-hours plan: first stabilise 80-in-8 accuracy, then learn every Zap-N game shape so the real screen is not your first exposure.</p>${facts()}
      <h2>5-hour crash plan</h2><ol class="hft-steps">
        <li><b>45 min:</b> learn the scoring rule and do one 20-question math sprint cleanly.</li>
        <li><b>90 min:</b> full 80-in-8 run, review misses, then repeat only weak families.</li>
        <li><b>75 min:</b> Zap-N guide + one short practice for each game.</li>
        <li><b>45 min:</b> Number Logic and 24-points arithmetic.</li>
        <li><b>45 min:</b> one final mixed run; stop reckless guessing and sleep/food/water reset.</li>
      </ol>
      <div class="hft-grid">
        <div class="hft-card"><h3><span class="hft-tag math">Math</span> 80 in 8</h3><p>Multiple choice mental arithmetic. Wrong answer is a two-point swing versus a correct answer, so accuracy beats panic speed.</p><div class="hft-actions"><button class="primary hft-jump" data-page="practice" data-id="p80">Start full replica</button></div></div>
        <div class="hft-card"><h3><span class="hft-tag">Zap-N</span> Cognitive games</h3><p>Reaction, memory, risk, planning and switching games. Familiarity matters more than raw talent.</p><div class="hft-actions"><button class="hft-jump" data-id="zapn">Read game guide</button></div></div>
      </div>`;
  }

  function eightyGuide() {
    return `<div class="hft-kicker">80 in 8</div><h1>How to maximise score</h1>${facts()}
      <div class="hft-tip"><b>Main rule:</b> 55 clean answers with 0 wrong beats 65 attempts with 10 wrong. Do not guess on noise.</div>
      <h2>Pacing targets</h2><ul><li>Warm-up target: 20 questions in 2:15 with at least 90% accuracy.</li><li>Pass-zone target: net 55+ on full run.</li><li>Top target: net 70+ only if accuracy stays above 90%.</li></ul>
      <h2>Question families</h2><div class="hft-grid">
        ${['Integer add/subtract: round to tens, fix the offset.', 'Multiplication: split one number into easy parts.', 'Division/missing operand: rewrite instantly as division.', 'Decimals/fractions: memorise eighths, sixths, quarters and tenths.'].map(x => `<div class="hft-card"><p>${esc(x)}</p></div>`).join('')}
      </div><button class="primary hft-jump" data-page="practice" data-id="p80">Run 80 in 8 now</button>`;
  }

  function mathTricks() {
    return `<div class="hft-kicker">Animated tricks</div><h1>Optiver mental-math patterns</h1><p class="hft-lede">Replay each demo until the transformation feels automatic.</p>
      ${demo('m11', 'Multiplying by 11', '386 × 11')}
      ${demo('square5', 'Squaring numbers ending in 5', '85²')}
      ${demo('m12', 'Multiplying by 12', '386 × 12')}
      ${demo('m5', 'Multiplying by 5', '76 × 5')}
      ${demo('missing', 'Missing operand', '66 × ? = 138.6')}
      <button class="primary hft-jump" data-page="practice" data-id="p20">Practise with 20-question sprint</button>`;
  }

  function demo(id, title, ex) {
    return `<section class="hft-demo" data-demo="${id}"><div class="hft-demo-head"><b>${esc(title)}</b><span>${esc(ex)}</span><button class="hft-replay">Replay</button></div><div class="hft-demo-stage"></div><div class="hft-demo-steps"></div></section>`;
  }

  function zapn() {
    const games = [
      ['code-compare', 'Code Compare', 'Same/different strings under a shrinking timer.'], ['switch', 'The Switch', 'Alternate arrows and odd/even math.'],
      ['skyscraper', 'Skyscraper', 'Stack blocks to match a skyline.'], ['balloon', 'Balloon risk', 'Pump for reward, cash out before burst.'],
      ['pin', 'Digit recall', 'Memorise and type PIN-like strings.'], ['twentyfour', '24 points', 'Use four numbers to make 24.'],
      ['dial', 'Dial timing', 'Stop the rotating hand in target zone.'], ['pattern', 'Pattern deduction', 'Find the missing tile in a rule grid.'],
    ];
    return `<div class="hft-kicker">Zap-N games</div><h1>Game-by-game tricks to crack the cognitive section</h1><p class="hft-lede">Recent reports mention different subsets, so prepare all shapes. Math rounds still carry large weight.</p>
      <div class="hft-grid">${games.map(([id, title, desc]) => `<div class="hft-card"><h3><span class="hft-tag">Zap-N</span>${esc(title)}</h3><p>${esc(desc)}</p><ul>${gameTips[id].map(t => `<li>${esc(t)}</li>`).join('')}</ul><div class="hft-actions"><button class="hft-jump" data-page="practice" data-id="${id}">Practise</button></div></div>`).join('')}</div>
      ${demo('zap', 'Visual map: how to approach Zap-N', 'Recognise → Rule → Execute')}`;
  }

  function strategy() {
    return `<div class="hft-kicker">Score strategy</div><h1>Rules for best score on test day</h1>
      <ol class="hft-steps"><li><b>Accuracy lock:</b> if two options are close and you are unsure, slow down for a sanity check.</li><li><b>No emotional debt:</b> after one miss/burst, treat next question as question 1.</li><li><b>Keyboard first:</b> use number keys/arrow keys in practice so answer selection is automatic.</li><li><b>Warm up, then stop:</b> in the last 30 minutes, do short confidence runs only. Do not fry yourself.</li></ol>
      <div class="hft-tip"><b>Exam mindset:</b> Optiver screens consistency. A calm 90% accuracy candidate beats a flashy but unstable candidate.</div>`;
  }

  function setupDemos() {
    $('hftDetail').querySelectorAll('.hft-demo').forEach(el => {
      const render = () => runDemo(el, el.dataset.demo);
      el.querySelector('.hft-replay').onclick = render;
      render();
    });
  }

  const demos = {
    m11: [
      ['<div class="hft-row"><span class="hft-tok hi">386</span><span class="hft-arrow">×11</span></div>', 'Split 11 as 10 + 1.'],
      ['<div class="hft-row"><span class="hft-tok hi">3860</span><span class="hft-arrow">+</span><span class="hft-tok hi">386</span></div>', 'Move one zero, then add the original.'],
      ['<div class="hft-row"><span class="hft-tok ok pop">4246</span></div>', '3860 + 386 = 4246.'],
    ],
    square5: [
      ['<div class="hft-row"><span class="hft-tok hi">85²</span></div>', 'For n5², multiply n by n+1, then append 25.'],
      ['<div class="hft-row"><span class="hft-tok hi">8×9</span><span class="hft-arrow">then</span><span class="hft-tok">25</span></div>', '8 × 9 = 72.'],
      ['<div class="hft-row"><span class="hft-tok ok pop">7225</span></div>', 'Append 25 → 7225.'],
    ],
    m12: [
      ['<div class="hft-row"><span class="hft-tok hi">386 × 12</span></div>', 'Split 12 as 10 + 2.'],
      ['<div class="hft-row"><span class="hft-tok hi">3860</span><span class="hft-arrow">+</span><span class="hft-tok hi">772</span></div>', '386×10 = 3860 and 386×2 = 772.'],
      ['<div class="hft-row"><span class="hft-tok ok pop">4632</span></div>', 'Add them: 4632.'],
    ],
    m5: [
      ['<div class="hft-row"><span class="hft-tok hi">76 × 5</span></div>', 'Multiply by 10 then halve.'],
      ['<div class="hft-row"><span class="hft-tok hi">760 ÷ 2</span></div>', 'This is easier than repeated addition.'],
      ['<div class="hft-row"><span class="hft-tok ok pop">380</span></div>', 'Answer = 380.'],
    ],
    missing: [
      ['<div class="hft-row"><span class="hft-tok hi">66 × ? = 138.6</span></div>', 'Reframe missing operand as division instantly.'],
      ['<div class="hft-row"><span class="hft-tok hi">138.6 ÷ 66</span></div>', '66×2 = 132, remainder 6.6.'],
      ['<div class="hft-row"><span class="hft-tok ok pop">2.1</span></div>', '6.6 is 0.1×66, so ? = 2.1.'],
    ],
    zap: [
      ['<div class="hft-row"><span class="hft-tok hi">Recognise</span><span class="hft-arrow">→</span><span class="hft-tok">Rule</span><span class="hft-arrow">→</span><span class="hft-tok">Execute</span></div>', 'First identify the game and scoring pressure.'],
      ['<div class="hft-row"><span class="hft-tok">Recognise</span><span class="hft-arrow">→</span><span class="hft-tok hi">Rule</span><span class="hft-arrow">→</span><span class="hft-tok">Execute</span></div>', 'Name the active rule in one phrase.'],
      ['<div class="hft-row"><span class="hft-tok">Recognise</span><span class="hft-arrow">→</span><span class="hft-tok">Rule</span><span class="hft-arrow">→</span><span class="hft-tok ok">Execute</span></div>', 'Then act fast; do not debate.'],
    ],
  };
  function runDemo(el, id) {
    const steps = demos[id] || demos.zap;
    const stage = el.querySelector('.hft-demo-stage'), nav = el.querySelector('.hft-demo-steps');
    let i = 0;
    const draw = () => { stage.innerHTML = `${steps[i][0]}<div class="hft-demo-caption">${esc(steps[i][1])}</div>`; nav.innerHTML = steps.map((_, j) => `<button class="${i === j ? 'on' : ''}" data-i="${j}">${j + 1}</button>`).join(''); nav.querySelectorAll('button').forEach(b => b.onclick = () => { i = Number(b.dataset.i); draw(); }); i = (i + 1) % steps.length; };
    draw(); demoTimers.push(setInterval(draw, 2200));
  }

  function renderPractice(id) {
    const meta = practiceItems.find(x => x.id === id) || practiceItems[0];
    $('hftDetail').innerHTML = `<article class="hft-page"><div class="hft-kicker">Real Optiver-based practice</div><h1>${esc(meta.title)}</h1><p class="hft-lede">${esc(meta.sub)}. Keyboard shortcuts are enabled where useful.</p><div id="hftRunner"></div><section class="hft-hist"><h2>Recent scores</h2>${historyTable(id)}</section></article>`;
    setupPractice(id);
  }

  function historyTable(type) {
    const rows = history().filter(x => x.type === type).slice(0, 8);
    if (!rows.length) return '<p>No attempts yet.</p>';
    return `<table><thead><tr><th>When</th><th>Score</th><th>Correct</th><th>Wrong</th></tr></thead><tbody>${rows.map(r => `<tr><td>${new Date(r.at).toLocaleString()}</td><td>${r.score}</td><td>${r.correct}</td><td>${r.wrong}</td></tr>`).join('')}</tbody></table>`;
  }

  function setupPractice(id) {
    const full = id === 'p80';
    if (id === 'p80' || id === 'p20') startMathSetup(id, full ? 80 : 20, full ? 480 : 150);
    else if (id === 'number-logic') startNumberLogicSetup(id);
    else startGameSetup(id);
  }

  function startMathSetup(type, total, seconds) {
    $('hftRunner').innerHTML = `<div class="hft-setup"><button class="primary" id="hftStart">Start ${total}-question run</button><button id="hftTips">Show rules</button></div><div id="hftTipBox" class="hft-tip hidden"><b>Rule:</b> four options, answer advances instantly, +1 correct and −1 wrong. Use keys 1–4. Keep accuracy above 90%.</div>`;
    $('hftTips').onclick = () => $('hftTipBox').classList.toggle('hidden');
    $('hftStart').onclick = () => startMath(type, total, seconds);
  }

  function genMath() {
    const kind = pick(['add', 'sub', 'mul', 'div', 'missing', 'decimal', 'fraction']);
    let q, ans, family = kind;
    if (kind === 'add') { const a = rnd(80, 899), b = rnd(30, 499); q = `${a} + ${b}`; ans = a + b; }
    if (kind === 'sub') { const a = rnd(200, 999), b = rnd(40, Math.min(799, a - 1)); q = `${a} − ${b}`; ans = a - b; }
    if (kind === 'mul') { const a = rnd(12, 99), b = rnd(3, 19); q = `${a} × ${b}`; ans = a * b; }
    if (kind === 'div') { const b = rnd(3, 19), ans0 = rnd(4, 80); q = `${b * ans0} ÷ ${b}`; ans = ans0; }
    if (kind === 'missing') { const a = rnd(12, 90), x = pick([1.2, 1.5, 2.1, 2.5, 3, 4, 7, 8]); ans = x; q = `${a} × ? = ${fmt(a * x)}`; }
    if (kind === 'decimal') { let a10 = rnd(15, 99); if (a10 % 10 === 0) a10 += rnd(1, 9); const a = a10 / 10, b = rnd(12, 90); q = `${fmt(a)} × ${b}`; ans = a * b; }
    if (kind === 'fraction') { const den = pick([4, 5, 8, 10, 20]), n = rnd(1, den - 1), base = den * rnd(3, 30); q = `${n}/${den} of ${base}`; ans = n * base / den; }
    const opts = new Set([fmt(ans)]);
    while (opts.size < 4) {
      // Small answers (1.2, 2.5…) get near-miss distractors, never negatives.
      const delta = ans < 10 ? pick([-1, -0.5, -0.2, -0.1, 0.1, 0.2, 0.3, 0.5, 1, 1.5]) : pick([-20, -12, -10, -5, -2, -1, 1, 2, 5, 10, 12, 20]);
      if (Number(ans) + delta > 0) opts.add(fmt(Number(ans) + delta));
    }
    return { q, ans: fmt(ans), opts: fyShuffle(opts), family };
  }

  function startMath(type, total, seconds) {
    run = { type, total, left: seconds, idx: 0, correct: 0, wrong: 0, missed: [], q: null, timer: null, next: nextMath };
    drawMathShell(); nextMath();
    run.timer = setInterval(() => { run.left--; updateBar(); if (run.left <= 0) finishRun(); }, 1000);
    setKeys(e => { if (!run || document.body.dataset.mode !== 'hftpractice') return; const k = Number(e.key); if (k >= 1 && k <= 4) { e.preventDefault(); chooseMath(k - 1); } });
  }
  function drawMathShell() { $('hftRunner').innerHTML = `<div class="hft-run"><div class="hft-run-bar"><b class="hft-clock" id="hftClock"></b><span id="hftProgress"></span><span class="spacer"></span><span class="hft-score" id="hftScore"></span><button id="hftStop">Stop</button></div><div id="hftRunBody"></div><div id="hftFeedback" class="hft-feedback"></div></div>`; $('hftStop').onclick = finishRun; updateBar();
    // On a phone/Fold the item list sits above the detail: bring the timer and the game into view.
    if (window.matchMedia?.('(max-width: 900px)').matches) requestAnimationFrame(() => $('hftRunner')?.scrollIntoView({ block: 'start' })); }
  function updateBar() { if (!run) return; const m = Math.floor(run.left / 60), s = String(run.left % 60).padStart(2, '0'); $('hftClock').textContent = `${m}:${s}`; $('hftClock').classList.toggle('low', run.left <= 30); $('hftProgress').textContent = run.total >= 999 ? `${run.idx} done` : `${run.idx}/${run.total}`; $('hftScore').innerHTML = `<span class="pos">${run.correct}</span> / <span class="neg">${run.wrong}</span> · net ${run.correct - run.wrong}`; }
  function nextMath() { if (!run || run.idx >= run.total) return finishRun(); run.locked = false; run.q = genMath(); $('hftRunBody').innerHTML = `<div class="hft-q">${esc(run.q.q)} = ?<small>${esc(run.q.family)}</small></div><div class="hft-opts">${run.q.opts.map((o, i) => `<button class="hft-opt" data-i="${i}"><kbd>${i + 1}</kbd>${esc(o)}</button>`).join('')}</div>`; $('hftRunBody').querySelectorAll('.hft-opt').forEach(b => b.onclick = () => chooseMath(Number(b.dataset.i))); $('hftFeedback').textContent = ''; }
  function chooseMath(i) { if (!run || run.locked || !run.q) return; run.locked = true; const chosen = run.q.opts[i], ok = chosen === run.q.ans; run.idx++; if (ok) run.correct++; else { run.wrong++; run.missed.push({ q: run.q.q, you: chosen, ans: run.q.ans, family: run.q.family }); } updateBar(); $('hftFeedback').className = `hft-feedback ${ok ? 'ok' : 'bad'}`; $('hftFeedback').textContent = ok ? 'Correct' : `Wrong: ${run.q.ans}`; const r = run; setTimeout(() => { if (run === r) r.next(); }, 180); }

  function finishRun() {
    if (!run) return;
    if (run.timer) clearInterval(run.timer);
    if (run.anim) clearInterval(run.anim);
    const r = run; run = null; setKeys(null);
    const score = r.correct - r.wrong;
    saveHistory({ type: r.type, score, correct: r.correct, wrong: r.wrong });
    const advice = score >= 70 ? 'Excellent. Keep accuracy; do not over-practise now.' : score >= 55 ? 'Pass-zone. Drill the missed families and keep calm.' : 'Below target. Slow down: accuracy must come before volume.';
    $('hftRunner').innerHTML = `<div class="hft-result"><h2>Run complete</h2><div class="big">${score}</div><p>${esc(advice)}</p><div class="hft-break"><div><b>${r.correct}</b>correct</div><div><b>${r.wrong}</b>wrong</div><div><b>${r.idx}</b>attempted</div><div><b>${Math.round(100 * r.correct / Math.max(1, r.idx))}%</b>accuracy</div></div>${r.missed.length ? `<h3>Misses to review</h3><ul class="hft-miss">${r.missed.slice(0, 12).map(x => `<li><span>${esc(x.q)}</span><span class="you">you ${esc(x.you)}</span><span class="ans">ans ${esc(x.ans)}</span></li>`).join('')}</ul>` : ''}<button class="primary" id="hftAgain">Run again</button></div>`;
    $('hftAgain').onclick = () => setupPractice(r.type);
  }

  const seqRules = [
    () => { const a = rnd(2, 12), d = rnd(2, 9); return { xs: [0,1,2,3,4].map(i => a + i*d), ans: a + 5*d, rule: `+${d}` }; },
    () => { const a = rnd(30, 80), d = rnd(3, 11); return { xs: [0,1,2,3,4].map(i => a - i*d), ans: a - 5*d, rule: `-${d}` }; },
    () => { const a = rnd(1, 5), r = pick([2, 3]); return { xs: [0,1,2,3,4].map(i => a * r ** i), ans: a * r ** 5, rule: `×${r}` }; },
    () => { const a = rnd(1, 8), d = rnd(1, 4); let xs = [a]; for (let i=1;i<6;i++) xs.push(xs.at(-1) + d*i); return { xs: xs.slice(0,5), ans: xs[5], rule: `+${d}, +${2*d}, ...` }; },
  ];
  function startNumberLogicSetup(type) { $('hftRunner').innerHTML = `<button class="primary" id="hftStart">Start 20 sequence questions</button>`; $('hftStart').onclick = () => startLogic(type); }
  function startLogic(type) { run = { type, total: 20, left: 180, idx: 0, correct: 0, wrong: 0, missed: [], timer: null, next: nextLogic }; drawMathShell(); nextLogic(); run.timer = setInterval(() => { run.left--; updateBar(); if (run.left <= 0) finishRun(); }, 1000); setKeys(e => { const k=Number(e.key); if(k>=1&&k<=4) { e.preventDefault(); chooseMath(k-1); } }); }
  function nextLogic() { if (!run || run.idx >= run.total) return finishRun(); run.locked = false; const s = pick(seqRules)(); const opts = new Set([String(s.ans)]); while (opts.size < 4) opts.add(String(Number(s.ans) + pick([-12,-8,-5,-3,3,5,8,12]))); run.q = { q: `${s.xs.join(', ')}, ?`, ans: String(s.ans), opts: fyShuffle(opts), family: s.rule }; $('hftRunBody').innerHTML = `<div class="hft-q">${esc(run.q.q)}<small>Find the next number</small></div><div class="hft-opts">${run.q.opts.map((o,i)=>`<button class="hft-opt" data-i="${i}"><kbd>${i+1}</kbd>${esc(o)}</button>`).join('')}</div>`; $('hftRunBody').querySelectorAll('.hft-opt').forEach(b => b.onclick = () => chooseMath(Number(b.dataset.i))); }

  function startGameSetup(id) {
    $('hftRunner').innerHTML = `<div class="hft-tip"><b>Tips:</b><ul>${(gameTips[id] || []).map(t => `<li>${esc(t)}</li>`).join('')}</ul></div><button class="primary" id="hftStart">Start 60-second ${esc(practiceItems.find(x => x.id === id)?.title || id)}</button>`;
    $('hftStart').onclick = () => startGame(id);
  }
  function startGame(id) { run = { type: id, total: 999, left: 60, idx: 0, correct: 0, wrong: 0, missed: [], timer: null }; drawMathShell(); run.timer = setInterval(() => { run.left--; updateBar(); if (run.left <= 0) finishRun(); }, 1000); nextGame(id); }
  function answerGame(ok, detail='') { if (!run || run.locked) return; run.locked = true; if (run.anim) { clearInterval(run.anim); run.anim = null; } run.idx++; ok ? run.correct++ : (run.wrong++, run.missed.push({ q: detail || run.type, you: 'miss', ans: 'correct action', family: run.type })); updateBar(); $('hftFeedback').className = `hft-feedback ${ok ? 'ok' : 'bad'}`; $('hftFeedback').textContent = ok ? 'Good' : 'Miss'; const r = run; setTimeout(() => { if (run === r) nextGame(r.type); }, 220); }
  function nextGame(id) {
    if (!run) return;
    run.locked = false;
    const body = $('hftRunBody');
    if (id === 'code-compare') { const a = randCode(), same = Math.random() < .5, b = same ? a : mutate(a); body.innerHTML = `<div class="hft-code-play"><div class="hft-code">${chars(a)}</div><div class="hft-code">${chars(b)}</div></div><div class="hft-keys"><button id="same">Same ←</button><button id="diff">Different →</button></div>`; $('same').onclick=()=>answerGame(same, `${a}/${b}`); $('diff').onclick=()=>answerGame(!same, `${a}/${b}`); setKeys(e=>{ if(e.key==='ArrowLeft') { e.preventDefault(); $('same')?.click(); } if(e.key==='ArrowRight') { e.preventDefault(); $('diff')?.click(); } }); }
    else if (id === 'switch') { const arrow = Math.random()<.5, parity = rnd(10,99), want = arrow ? pick(['←','→']) : (parity%2?'Odd':'Even'); body.innerHTML = `<div class="hft-stage-game"><div><span class="hft-switch-rule ${arrow?'on':''}">ARROW</span> <span class="hft-switch-rule ${!arrow?'on':''}">PARITY</span></div><div class="hft-big-key">${arrow ? want : parity}</div><div class="hft-keys"><button id="left">Left/Odd</button><button id="right">Right/Even</button></div></div>`; $('left').onclick=()=>answerGame(arrow ? want==='←' : parity%2===1); $('right').onclick=()=>answerGame(arrow ? want==='→' : parity%2===0); setKeys(e=>{ if(e.key==='ArrowLeft') { e.preventDefault(); $('left')?.click(); } if(e.key==='ArrowRight') { e.preventDefault(); $('right')?.click(); } }); }
    else if (id === 'skyscraper') { const heights=[rnd(1,4),rnd(1,4),rnd(1,4)], tallest=Math.max(...heights); body.innerHTML = `<div class="hft-stage-game"><p>Click the tallest tower</p><div class="hft-sky-play">${heights.map((h,i)=>`<div class="hft-sky-col" data-i="${i}">${Array.from({length:h},()=>'<span class="hft-sky-blk"></span>').join('')}</div>`).join('')}</div></div>`; body.querySelectorAll('.hft-sky-col').forEach(c=>c.onclick=()=>answerGame(heights[Number(c.dataset.i)]===tallest)); }
    else if (id === 'balloon') { let pumps=0, limit=rnd(3,8), bank=0; const draw=()=>{ body.innerHTML=`<div class="hft-bal-stage"><div class="hft-bal" style="width:${50+pumps*12}px;height:${62+pumps*14}px"></div><div>Bank this balloon: ${pumps}</div><div class="hft-keys"><button id="pump">Pump</button><button id="cash">Cash out</button></div></div>`; $('pump').onclick=()=>{ pumps++; if(pumps>=limit) answerGame(false,'burst'); else { bank++; draw(); } }; $('cash').onclick=()=>answerGame(pumps>=3,'cash out too early/late');}; draw(); }
    else if (id === 'pin') { const pin=String(rnd(100000,999999)); body.innerHTML=`<div class="hft-stage-game"><div id="pinShow" class="hft-pin">${pin}</div><input id="pinIn" class="hft-input hidden" maxlength="6" inputmode="numeric"><button id="pinGo">Ready</button></div>`; $('pinGo').onclick=()=>{ $('pinShow').textContent='••••••'; $('pinIn').classList.remove('hidden'); $('pinIn').focus(); }; $('pinIn').oninput=e=>{ if(e.target.value.length===6) answerGame(e.target.value===pin,pin); }; }
    else if (id === 'twentyfour') { const set=pick([[3,3,8,8],[1,5,5,5],[2,4,6,8],[4,4,7,9],[1,3,4,6]]); body.innerHTML=`<div class="hft-stage-game"><div class="hft-24">${set.map(n=>`<span>${n}</span>`).join('')}</div><input id="expr" class="hft-input" placeholder="e.g. (8-4)*6" aria-label="Expression using each number once" autocomplete="off"><button id="submitExpr">Submit</button></div>`; $('expr').onkeydown=e=>{ if(e.key==='Enter') { e.preventDefault(); $('submitExpr').click(); } }; $('submitExpr').onclick=()=>{ try { const src=$('expr').value, used=(src.match(/\d+(?:\.\d+)?/g)||[]).map(Number).sort((x,y)=>x-y), want=[...set].sort((x,y)=>x-y); const v=calcExpr(src); answerGame(Math.abs(v-24)<1e-9 && used.join()===want.join(),src); } catch { answerGame(false,'invalid'); } }; }
    else if (id === 'dial') { const target=rnd(0,330), start=Date.now(); body.innerHTML=`<div class="hft-stage-game hft-dial-play"><div class="hft-dial"><span class="hft-dial-target" style="--t:${target}deg"></span><span id="hand" class="hft-dial-hand"></span></div><button id="stopDial" class="primary">Stop</button></div>`; run.anim=setInterval(()=>{ const deg=((Date.now()-start)/4)%360; $('hand')?.style.setProperty('--h',`${deg}deg`); },16); $('stopDial').onclick=()=>{ const deg=((Date.now()-start)/4)%360; const diff=Math.min(Math.abs(deg-target),360-Math.abs(deg-target)); answerGame(diff<28,`diff ${Math.round(diff)}°`); }; }
    else { const shapes=['▲','■','●'], s=fyShuffle(shapes), grid=[s[0],s[1],s[2],s[1],s[2],s[0],s[2],s[0],s[1]], missing=grid[8]; body.innerHTML=`<div class="hft-stage-game hft-pat-play"><p>Each row and column has one of each shape</p><div class="hft-pat">${grid.slice(0,8).map(x=>`<span>${x}</span>`).join('')}<span class="q">?</span></div><div class="hft-keys">${shapes.map(s=>`<button data-s="${s}">${s}</button>`).join('')}</div></div>`; body.querySelectorAll('[data-s]').forEach(b=>b.onclick=()=>answerGame(b.dataset.s===missing)); }
  }

  function calcExpr(src) {
    const tokens = String(src).replace(/\s+/g, '').match(/\d+(?:\.\d+)?|[()+\-*/]/g) || [];
    let i = 0;
    const peek = () => tokens[i];
    const eat = t => tokens[i] === t && (i++, true);
    function value() {
      if (eat('(')) { const v = expr(); if (!eat(')')) throw new Error('paren'); return v; }
      if (eat('-')) return -value();
      const t = tokens[i++];
      if (!/^\d/.test(t || '')) throw new Error('number');
      return Number(t);
    }
    function term() {
      let v = value();
      while (peek() === '*' || peek() === '/') {
        const op = tokens[i++], r = value();
        v = op === '*' ? v * r : v / r;
      }
      return v;
    }
    function expr() {
      let v = term();
      while (peek() === '+' || peek() === '-') {
        const op = tokens[i++], r = term();
        v = op === '+' ? v + r : v - r;
      }
      return v;
    }
    const out = expr();
    if (i !== tokens.length || !Number.isFinite(out)) throw new Error('expr');
    return out;
  }

  function randCode() { return Array.from({length:8},()=>pick('ABCDEFGHJKLMNPQRSTUVWXYZ23456789')).join(''); }
  function mutate(s) { const i=rnd(0,s.length-1), c=pick('ABCDEFGHJKLMNPQRSTUVWXYZ23456789'.replace(s[i],'')); return s.slice(0,i)+c+s.slice(i+1); }
  function chars(s, base='') { return s.split('').map((c,i)=>`<span class="${base && base[i]!==c ? 'diff' : ''}">${esc(c)}</span>`).join(''); }

  document.addEventListener('click', e => {
    const b = e.target.closest('.hft-jump');
    if (!b) return;
    if (b.dataset.page === 'practice') window.setInterviewMode?.('hftpractice');
    current = b.dataset.id;
    open(current);
  });
})();
