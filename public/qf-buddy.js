/* Nibble — the floating prep companion.
 *
 * A small glossy 3D-ish character that lives in the corner and turns prep
 * into a loop you want to stay in:
 *   - one big "Just start" button (the next task from today's plan),
 *   - 20-second "Pattern snap" recall rounds (which pattern solves X?),
 *   - XP and levels earned only by proof (accepted submits, mocks, recall),
 *   - a daily goal of 3 reps and a forgiving momentum streak (2 freezes),
 *   - a redemption list: failed problems come back at 1, 3 and 7 days,
 *   - Google-ready % with the change since yesterday,
 *   - surprise insight drops, level-up accessories, a tie on interview eve.
 * It speaks only at boundaries (a solve, a fail, a return, a long stretch),
 * never during a mock or focus mode, at most once every few minutes, and can
 * be quietened, napped, hidden for the day or put to sleep.
 *
 * State lives in localStorage 'qf.buddy', which the shell syncs per account.
 */
(function () {
  'use strict';
  const KEY = 'qf.buddy';
  const DAY = 864e5;
  const GOAL = 3;
  const INTERVIEW = '2026-11-03';
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const ymd = (t = Date.now()) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const dayStart = (t = Date.now()) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const readJSON = (k, f) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? f; } catch { return f; } };

  // ------------------------------------------------------------ state --
  let S = null;
  function load() {
    S = readJSON(KEY, null);
    if (!S || typeof S !== 'object') S = null;
    return S;
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* full: fine */ } }
  const xpFor = n => 25 * n * (n + 1) - 50;              // L1 0, L2 100, L3 250, L4 450, L5 700…
  const levelOf = xp => { let n = 1; while (xp >= xpFor(n + 1)) n++; return n; };

  const attempts = () => { const a = readJSON('codeAttempts', []); return Array.isArray(a) ? a : []; };
  const history = () => { const a = readJSON('interviewHistory', []); return Array.isArray(a) ? a : []; };
  function countDone() {
    let n = 0;
    const walk = (o, d) => { if (!o || typeof o !== 'object' || d > 6) return; for (const [k, v] of Object.entries(o)) { if (k === 'done' && v && typeof v === 'object' && !Array.isArray(v)) n += Object.values(v).filter(Boolean).length; else walk(v, d + 1); } };
    walk(readJSON('qf.sprint', {}), 0);
    return n;
  }
  function countStories() {
    const s = readJSON('qf.stories', null);
    if (Array.isArray(s)) return s.length;
    if (s && Array.isArray(s.stories)) return s.stories.length;
    if (s && typeof s === 'object') return Object.values(s).filter(v => Array.isArray(v)).reduce((a, v) => Math.max(a, v.length), 0);
    return 0;
  }
  function countApproach() {
    const s = readJSON('qf.approach', {});
    let n = 0;
    const walk = (o, d) => { if (!o || typeof o !== 'object' || d > 4) return; for (const [k, v] of Object.entries(o)) { if (k === 'notes' && typeof v === 'string' && v.trim().length >= 80) n++; else walk(v, d + 1); } };
    walk(s, 0);
    return n;
  }

  /** First run: count what was already done so the level feels earned. */
  function hatch() {
    const at = attempts();
    const solved = {}, failed = {}, days = {};
    for (const r of [...at].reverse()) {
      if (r.mode !== 'submit' || !r.slug) continue;
      if (r.ok) { if (!solved[r.slug]) days[ymd(r.at)] = (days[ymd(r.at)] || 0) + 1; solved[r.slug] = r.at; delete failed[r.slug]; }
      else if (!solved[r.slug] && !failed[r.slug]) failed[r.slug] = { at: r.at, title: r.title || r.slug, n: 0 };
    }
    for (const h of history()) { const t = h.at || h.date || h.startedAt; if (t) days[ymd(new Date(t).getTime())] = (days[ymd(new Date(t).getTime())] || 0) + 1; }
    const xp = Object.keys(solved).length * 30 + history().length * 60 + countStories() * 20;
    S = {
      v: 1, xp, born: Date.now(), days, solved, failed, freezesUsed: {}, mute: '', napUntil: 0, hideDay: '', lastBubble: 0,
      seen: { at: at[0]?.at || Date.now(), hist: history().length, done: countDone(), stories: countStories(), approach: countApproach() },
      ready: {}, quizBest: 0, greeted: '', flags: {},
    };
    save();
    return true;
  }

  // ------------------------------------------------------- momentum --
  /** Days in a row with a rep. Today counts once it has one; a missed day is
   *  bridged by a freeze (2 for the whole sprint), so one bad day never wipes
   *  the run. */
  function momentum() {
    let n = 0, t = dayStart(), free = 2 - Object.keys(S.freezesUsed).length;
    if (!(S.days[ymd(t)] > 0)) t -= DAY;
    for (let i = 0; i < 400; i++, t -= DAY) {
      const k = ymd(t);
      if (S.days[k] > 0) { n++; continue; }
      if (S.freezesUsed[k]) continue;
      if (free > 0 && n > 0 && S.days[ymd(t - DAY)] > 0) { S.freezesUsed[k] = 1; free--; save(); continue; }
      break;
    }
    return { n, free: Math.max(0, 2 - Object.keys(S.freezesUsed).length) };
  }
  const todayReps = () => S.days[ymd()] || 0;
  /** The interview Nibble counts down to — from the user's plan, not hard-coded. */
  function tgt() {
    const t = window.QFSprint?.target?.() || {};
    const d = t.date ? new Date(t.date + 'T00:00:00') : null;
    return { company: t.company || 'Google', date: d && Number.isFinite(d.getTime()) ? d.toLocaleDateString([], { month: 'short', day: 'numeric' }) : '' };
  }
  function daysLeft() {
    const v = window.QFSprint?.daysLeft?.();
    if (Number.isFinite(v)) return v;
    return Math.round((new Date(`${INTERVIEW}T00:00:00`).getTime() - dayStart()) / DAY);
  }
  function readiness() {
    try {
      const r = window.QFSprint?.readiness?.();
      if (!Array.isArray(r) || !r.length) return null;
      const pct = r.reduce((a, x) => a + x.pct, 0) / r.length;
      const weak = [...r].sort((a, b) => a.pct - b.pct)[0];
      return { pct: Math.round(pct * 10) / 10, weak };
    } catch { return null; }
  }

  // --------------------------------------------------------- insight --
  const INSIGHTS = [
    'Google interviewers score four things: problem solving, coding, communication and Googleyness. Narrating your thinking feeds three of them.',
    'Ask one clarifying question before coding — input size, duplicates, empty input. It reads as seniority, not hesitation.',
    'Say the brute force first, out loud, with its Big-O. Then improve it. Interviewers want to see the climb.',
    'Stuck? Say what you are stuck on. "I need the max in a sliding window fast" often unlocks the deque idea by itself.',
    'Dry-run your code on a tiny example before saying "done". Catching your own bug scores higher than not having one.',
    '"Sorted input" whispers binary search or two pointers. "All subsets / permutations" whispers backtracking.',
    '"Shortest path, unweighted" → BFS. "Weighted, non-negative" → Dijkstra. Name the signal, then the tool.',
    'Top-k anything → heap of size k. O(n log k) beats sorting when k is small.',
    'Counting or "have I seen it?" → hash map. It is the first tool to reach for in Arrays & Hashing.',
    'Intervals: sort by start, then sweep. Merging, inserting, meeting rooms — same skeleton.',
    'DP recipe: state, transition, base case, order. Say the state in one sentence before writing code.',
    'Googleyness is evidence of behaviour: a story with a conflict, what YOU did, and a measurable result.',
    'Use STAR but spend 60% of the time on the Action. That is where the signal is.',
    'If a hint comes, take it gracefully and build on it. Using hints well is scored, not penalised.',
    'Name variables for what they mean (left, window_sum, seen) — readability is part of the coding score.',
    'Test edge cases you choose: empty, one element, all equal, negatives. Say why each matters.',
    'Retrieval beats re-reading: trying to recall a solution before looking strengthens it far more.',
    'Spacing beats cramming. Reviewing a problem 1, 3 and 7 days later makes it stick for interview day.',
    'Sleep is when patterns consolidate. A late extra problem is worth less than the sleep it costs.',
    'Monotonic stack: "next greater / smaller element" problems. Keep the stack sorted, pop what loses.',
    'Linked list tricks: dummy head for edge cases, slow/fast pointers for middle and cycles.',
    'Tree problems are usually "what does each node return to its parent?" Define that and recursion writes itself.',
    'Graphs on grids: each cell is a node, 4 neighbours are edges. Mark visited when you enqueue, not when you pop.',
    'Union-Find answers "are these connected?" in near O(1). Path compression + union by rank.',
    'Tries: prefix questions and word search over a board. Store end-of-word on the node.',
    'Sliding window: expand right, shrink left while invalid, record the answer when valid.',
    'Big-O snap: nested loops over n → O(n²); halving each step → O(log n); sort → O(n log n).',
    'At the end, offer the complexity unprompted and one improvement you would make with more time.',
  ];
  function insight() { const i = Math.floor(Math.random() * INSIGHTS.length); return INSIGHTS[i]; }

  // --------------------------------------------------------- the body --
  const SVG = `
<svg class="nb-svg" viewBox="0 0 120 132" aria-hidden="true" focusable="false">
  <defs>
    <radialGradient id="nbBody" cx="34%" cy="26%" r="80%">
      <stop offset="0" stop-color="#a6f4e3"/><stop offset=".38" stop-color="#3cc6b8"/><stop offset=".78" stop-color="#3a63d0"/><stop offset="1" stop-color="#2a2f8f"/>
    </radialGradient>
    <radialGradient id="nbBulb" cx="35%" cy="30%" r="70%"><stop offset="0" stop-color="#fff"/><stop offset=".35" stop-color="var(--nb-mood,#7cf0a8)"/><stop offset="1" stop-color="var(--nb-mood2,#1f9d5a)"/></radialGradient>
    <linearGradient id="nbRim" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#d6f6ff" stop-opacity=".75"/></linearGradient>
    <radialGradient id="nbArm" cx="35%" cy="30%" r="80%"><stop offset="0" stop-color="#8fe9da"/><stop offset="1" stop-color="#2f74c8"/></radialGradient>
  </defs>
  <g class="nb-ant"><path d="M60 22 C 58 14 64 10 62 4" stroke="#2c3f9e" stroke-width="3" fill="none" stroke-linecap="round"/><circle class="nb-bulb" cx="62" cy="5" r="5.5" fill="url(#nbBulb)"/></g>
  <g class="nb-arm nb-arm-l"><ellipse cx="15" cy="84" rx="8" ry="10" fill="url(#nbArm)"/></g>
  <g class="nb-arm nb-arm-r"><ellipse cx="105" cy="84" rx="8" ry="10" fill="url(#nbArm)"/></g>
  <path class="nb-tail" d="M100 108 q14 4 14 -8 l5 1 -4 -9 -6 7 4 0 q0 8 -11 5z" fill="#3156c4"/>
  <path d="M60 20 C 93 20 107 54 107 84 C 107 110 88 122 60 122 C 32 122 13 110 13 84 C 13 54 27 20 60 20 Z" fill="url(#nbBody)"/>
  <path d="M100 66 C 106 80 106 98 96 110" stroke="url(#nbRim)" stroke-width="4" fill="none" stroke-linecap="round"/>
  <ellipse cx="40" cy="40" rx="15" ry="9" fill="#fff" opacity=".45" transform="rotate(-28 40 40)"/>
  <ellipse cx="34" cy="52" rx="4" ry="2.5" fill="#fff" opacity=".35" transform="rotate(-28 34 52)"/>
  <g class="nb-acc nb-band"><path d="M20 58 C 40 46 80 46 100 58 L 101 64 C 80 53 40 53 19 64 Z" fill="#ff6b6b"/><circle cx="100" cy="61" r="3" fill="#ffd166"/></g>
  <g class="nb-acc nb-phones"><path d="M18 72 C 16 34 104 34 102 72" stroke="#22264d" stroke-width="5" fill="none"/><rect x="9" y="66" width="12" height="18" rx="5" fill="#22264d"/><rect x="99" y="66" width="12" height="18" rx="5" fill="#22264d"/></g>
  <g class="nb-acc nb-cap"><path d="M30 34 C 40 14 80 14 90 34 Z" fill="#4285f4"/><path d="M30 34 L 90 34 L 104 38 L 30 38 Z" fill="#2a63c9"/><circle cx="60" cy="19" r="3" fill="#fbbc05"/></g>
  <g class="nb-eyes">
    <g class="nb-eye"><ellipse cx="45" cy="72" rx="9.5" ry="12.5" fill="#fff"/><g class="nb-pupil"><ellipse cx="45" cy="74" rx="5.6" ry="7" fill="#1b1f3b"/><circle cx="47.5" cy="70" r="2.2" fill="#fff"/></g></g>
    <g class="nb-eye"><ellipse cx="75" cy="72" rx="9.5" ry="12.5" fill="#fff"/><g class="nb-pupil"><ellipse cx="75" cy="74" rx="5.6" ry="7" fill="#1b1f3b"/><circle cx="77.5" cy="70" r="2.2" fill="#fff"/></g></g>
    <path class="nb-lid" d="M35 62 Q45 58 55 62 M65 62 Q75 58 85 62" stroke="#1b1f3b" stroke-width="2.5" fill="none" stroke-linecap="round"/>
  </g>
  <ellipse cx="33" cy="92" rx="7" ry="4" fill="#ff8a8a" opacity=".7"/><ellipse cx="87" cy="92" rx="7" ry="4" fill="#ff8a8a" opacity=".7"/>
  <path class="nb-mouth nb-m-smile" d="M51 92 Q60 101 69 92" stroke="#1b1f3b" stroke-width="3" fill="none" stroke-linecap="round"/>
  <path class="nb-mouth nb-m-grin" d="M49 90 Q60 108 71 90 Z" fill="#1b1f3b"/><path class="nb-mouth nb-m-grin" d="M53 97 Q60 104 67 97 Z" fill="#ff7a8a"/>
  <ellipse class="nb-mouth nb-m-o" cx="60" cy="95" rx="4.5" ry="5.5" fill="#1b1f3b"/>
  <path class="nb-mouth nb-m-flat" d="M52 96 Q60 92 68 96" stroke="#1b1f3b" stroke-width="3" fill="none" stroke-linecap="round"/>
  <path class="nb-mouth nb-m-sleep" d="M54 95 Q60 98 66 95" stroke="#1b1f3b" stroke-width="2.5" fill="none" stroke-linecap="round"/>
  <g class="nb-acc nb-tie"><path d="M56 112 L64 112 L62 117 L66 130 L60 134 L54 130 L58 117 Z" fill="#d93025"/><path d="M50 110 L60 114 L70 110" stroke="#fff" stroke-width="2" fill="none"/></g>
  <text class="nb-zz" x="88" y="30" font-size="13" font-weight="700" fill="#6f7bd8">z<tspan dx="1" dy="-6" font-size="10">z</tspan></text>
</svg>`;

  let el = null, panel = null, bubble = null, bubbleTimer = null, moodTimer = null;
  function mount() {
    if ($('nbBuddy')) return;
    el = document.createElement('div');
    el.id = 'nbBuddy';
    el.innerHTML = `<button type="button" class="nb-char" aria-label="Nibble, your prep buddy — open" aria-haspopup="dialog" aria-expanded="false"><span class="nb-tilt">${SVG}</span><span class="nb-badge" hidden></span></button><span class="nb-shadow" aria-hidden="true"></span><div class="nb-bubble" role="status" aria-live="polite" hidden></div>`;
    document.body.appendChild(el);
    bubble = el.querySelector('.nb-bubble');
    el.querySelector('.nb-char').addEventListener('click', e => { e.stopPropagation(); poke(); togglePanel(); });
    document.addEventListener('pointermove', look, { passive: true });
    document.addEventListener('click', e => { if (panel && !panel.contains(e.target) && !el.contains(e.target)) closePanel(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && panel) { closePanel(); el.querySelector('.nb-char').focus(); } });
    blinkLoop();
    // Tuck aside while the page scrolls, so it never sits on a button you are reaching for.
    let tuckT = 0;
    window.addEventListener('scroll', () => { if (panel || !bubble.hidden) return; el.classList.add('tuck'); clearTimeout(tuckT); tuckT = setTimeout(() => el.classList.remove('tuck'), 1400); }, { passive: true, capture: true });
    paint();
  }

  // Eyes follow the pointer; the whole body turns a little toward it.
  let lookRaf = 0;
  function look(e) {
    if (!el || lookRaf) return;
    lookRaf = requestAnimationFrame(() => {
      lookRaf = 0;
      const r = el.querySelector('.nb-char').getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height * 0.55;
      const dx = e.clientX - cx, dy = e.clientY - cy, d = Math.hypot(dx, dy) || 1;
      const k = Math.min(1, d / 260);
      el.querySelectorAll('.nb-pupil').forEach(p => p.setAttribute('transform', `translate(${(dx / d * 3.4 * k).toFixed(2)} ${(dy / d * 3.6 * k).toFixed(2)})`));
      if (!reduced()) el.querySelector('.nb-tilt').style.transform = `rotateY(${(dx / d * 16 * k).toFixed(1)}deg) rotateX(${(-dy / d * 8 * k).toFixed(1)}deg)`;
    });
  }
  function blinkLoop() {
    setTimeout(() => {
      if (el && !reduced()) { el.classList.add('blink'); setTimeout(() => el?.classList.remove('blink'), 140); }
      blinkLoop();
    }, 2600 + Math.random() * 4200);
  }
  function poke() { if (reduced()) return; el.classList.remove('poke'); void el.offsetWidth; el.classList.add('poke'); }

  /** idle | happy | cheer | worried | thinking | sleepy | proud */
  function mood(m, ms = 0) {
    if (!el) return;
    el.dataset.mood = m;
    clearTimeout(moodTimer); moodTimer = null;
    if (ms) moodTimer = setTimeout(() => { moodTimer = null; el.dataset.mood = baseMood(); }, ms);
  }
  function baseMood() {
    const h = new Date().getHours() + new Date().getMinutes() / 60;
    if (h >= 22.5 || h < 5) return 'sleepy';
    if (todayReps() >= GOAL) return 'proud';
    return 'idle';
  }

  // ----------------------------------------------------- visibility --
  function hiddenNow() {
    if (!S) return true;
    if (S.napUntil > Date.now()) return true;
    if (S.hideDay === ymd()) return true;
    try { if (typeof session !== 'undefined' && session && session.running) return true; } catch { /* not loaded */ }
    if (document.body.classList.contains('focus')) return true;
    // On the Coding tab the interviewer panel's Send and mic sit where Nibble does.
    if (document.body.dataset.mode === 'coding') {
      const cp = $('chatPane');
      if (cp && !cp.classList.contains('hidden') && cp.offsetParent !== null) return true;
    }
    // A question dialog (mode picker, confirm) is open: stay out of it.
    if (document.querySelector('.ask-backdrop:not(.hidden)')) return true;
    const auth = $('qfAuth');
    if (auth && auth.offsetParent !== null && getComputedStyle(auth).display !== 'none') return true;
    // Phone keyboard open: get out of the way.
    const vv = window.visualViewport;
    if (vv && window.innerWidth < 760 && vv.height < window.innerHeight * 0.72) return true;
    return false;
  }
  function paintVisibility() {
    if (!el) return;
    const h = hiddenNow();
    el.hidden = h;
    el.classList.toggle('asleep', S?.mute === 'off');
    if (h) { closePanel(); hideBubble(); }
  }

  // --------------------------------------------------------- bubble --
  /** Say something. Unprompted talk is rate-limited to once every 3 minutes;
   *  `force` is for replies to something the person just did. */
  function say(html, { actions = [], ttl = 7000, force = false, m = 'happy' } = {}) {
    if (!el || hiddenNow() || S.mute === 'quiet' || S.mute === 'off') { if (m && el) mood(m, 2500); return false; }
    const now = Date.now();
    if (!force && now - (S.lastBubble || 0) < 180e3) return false;
    if (panel) return false;
    // On a phone the card sits over the content, so keep it short, and stay
    // quiet in the editor and full-screen players unless it really matters.
    const phone = matchMedia('(max-width: 759px)').matches;
    if (phone) {
      ttl = Math.min(ttl, 4500);
      const busy = document.body.dataset.mode === 'coding' || document.querySelector('.qs-back, #qfApproach:not([hidden])');
      if (busy && !force) return false;
    }
    const ae = document.activeElement;
    if (!force && ae && (ae.matches?.('textarea, input[type=text], [contenteditable="true"]') || ae.closest?.('.cm-editor'))) return false;
    S.lastBubble = now; save();
    bubble.innerHTML = `<button type="button" class="nb-x" aria-label="Dismiss">×</button><div class="nb-say">${html}</div>${actions.length ? `<div class="nb-acts">${actions.map((a, i) => `<button type="button" data-i="${i}" class="${i ? '' : 'pri'}">${esc(a.label)}</button>`).join('')}</div>` : ''}`;
    bubble.hidden = false;
    requestAnimationFrame(() => bubble.classList.add('on'));
    bubble.querySelector('.nb-x').onclick = hideBubble;
    bubble.querySelectorAll('[data-i]').forEach(b => { b.onclick = () => { hideBubble(); actions[+b.dataset.i].fn(); }; });
    mood(m, Math.min(ttl, 6000));
    clearTimeout(bubbleTimer);
    let left = ttl;
    const tick = () => { bubbleTimer = setTimeout(() => { if (bubble.matches(':hover') || bubble.contains(document.activeElement)) { tick(); return; } hideBubble(); }, left); };
    tick();
    return true;
  }
  // Changing tab moves on: an old nudge should not sit over the new page.
  document.addEventListener('click', e => { if (e.target.closest?.('[data-open], [data-group], #qfTabs button') && bubble && !bubble.contains(e.target)) hideBubble(); }, true);
  function hideBubble() { if (!bubble) return; clearTimeout(bubbleTimer); bubble.classList.remove('on'); bubble.hidden = true; }

  // ------------------------------------------------------- rewards --
  const toastXp = (n, why) => {
    if (!el || hiddenNow()) return;
    const t = document.createElement('span');
    t.className = 'nb-xp'; t.textContent = `+${n} XP${why ? ` · ${why}` : ''}`;
    el.appendChild(t); setTimeout(() => t.remove(), 1700);
  };
  function confetti(n = 26) {
    if (!el || reduced() || hiddenNow()) return;
    const box = document.createElement('div'); box.className = 'nb-conf';
    const cols = ['#4285f4', '#ea4335', '#fbbc05', '#34a853', '#a78bfa', '#3cc6b8'];
    for (let i = 0; i < n; i++) {
      const p = document.createElement('i');
      const a = (Math.PI * 2 * i) / n + Math.random() * 0.4, d = 60 + Math.random() * 90;
      p.style.cssText = `--dx:${Math.cos(a) * d}px;--dy:${Math.sin(a) * d - 60}px;--r:${Math.random() * 720 - 360}deg;background:${cols[i % cols.length]};animation-delay:${Math.random() * 80}ms`;
      box.appendChild(p);
    }
    el.appendChild(box); setTimeout(() => box.remove(), 1400);
  }
  /** XP for proof. `rep` counts toward today's goal of 3. */
  function award(xp, why, rep = true) {
    const lvBefore = levelOf(S.xp);
    const repsBefore = todayReps();
    S.xp += xp;
    if (rep) S.days[ymd()] = repsBefore + 1;
    save();
    toastXp(xp, why);
    const lv = levelOf(S.xp);
    paint();
    if (lv > lvBefore) {
      confetti(40); mood('cheer', 4000);
      const unlock = { 2: 'a headband', 4: 'headphones', 6: 'a Google cap' }[lv];
      say(`<b>Level ${lv}!</b> ${unlock ? `I unlocked ${unlock}. ` : ''}<span class="nb-ins">💡 ${esc(insight())}</span>`, { force: true, ttl: 11000, m: 'cheer' });
      return;
    }
    if (rep && repsBefore + 1 === GOAL) {
      confetti(); mood('proud', 5000);
      const m = momentum();
      say(`<b>Done for today ✓</b> 3 reps in. ${m.n > 1 ? `${m.n}-day momentum. ` : ''}Anything more is a bonus — or rest, it counts too.`, { force: true, ttl: 9000, m: 'proud', actions: [{ label: 'One bonus snap', fn: quiz }, { label: 'Rest', fn: () => {} }] });
      return;
    }
    return lv;
  }

  // ----------------------------------------------------- watching --
  let lastActivity = Date.now(), activeSince = Date.now(), lastAttemptAt = Date.now(), codingSince = 0;
  ['keydown', 'pointerdown', 'wheel', 'touchstart'].forEach(ev => document.addEventListener(ev, () => {
    const now = Date.now();
    if (now - lastActivity > 10 * 60e3) activeSince = now;
    lastActivity = now;
  }, { passive: true, capture: true }));

  const FRESH = '<b>Mock complete.</b> Read the write-up while it is fresh — the one thing to fix next time matters more than the score.';
  let writeupWait = null;
  function scan() {
    if (!S) return;
    const seen = S.seen;
    // New judge submits.
    const fresh = attempts().filter(r => r.at > seen.at).reverse();
    for (const r of fresh) {
      seen.at = r.at; lastAttemptAt = Date.now();
      if (r.mode !== 'submit' || !r.slug) continue;
      const title = r.title || r.slug;
      if (r.ok) {
        const was = S.failed[r.slug];
        const first = !S.solved[r.slug];
        S.solved[r.slug] = r.at;
        if (was) {
          delete S.failed[r.slug];
          award(40, 'redeemed');
          confetti();
          say(`<b>Redeemed!</b> ${esc(title)} went from fail to pass. That is exactly the rep that sticks.`, { force: true, m: 'cheer' });
        } else if (first) {
          const lv = award(50, 'new solve');
          if (lv) say(`<b>${esc(title)} — accepted!</b> ${Math.random() < 0.35 ? `<span class="nb-ins">💡 ${esc(insight())}</span>` : 'Say the complexity out loud once — interview habit.'}`, { force: true, m: 'cheer', ttl: 8000 });
        } else award(15, 'solved again', false);
      } else {
        if (!S.solved[r.slug]) { const f = S.failed[r.slug]; if (!f) S.failed[r.slug] = { at: r.at, title, n: 0 }; else if (r.at - f.at > 3600e3) { f.at = r.at; f.n = 0; } }
        S.xp += 5; save(); toastXp(5, 'effort');
        say(`Not yet — and that is data, not a verdict. Read the failing case, then trace it by hand.`, { force: true, m: 'worried', actions: [{ label: 'Talk it through', fn: () => window.QFApproach?.open?.() }, { label: 'Got it', fn: () => {} }] });
      }
    }
    const hl = history(), h = hl.length;
    if (h > seen.hist) {
      seen.hist = h; award(60, 'mock done'); confetti();
      // A coding write-up arrives a little after the row is saved; only point
      // at it once it exists (it may have failed).
      const latest = hl[0];
      if (latest?.type === 'coding' && !latest.score) writeupWait = { id: latest.id, at: Date.now() };
      else say(FRESH, { force: true, m: 'proud' });
    }
    else if (h < seen.hist) seen.hist = h;
    if (writeupWait) {
      const row = hl.find(r => r.id === writeupWait.id);
      if (row?.score) { writeupWait = null; say(FRESH, { force: true, m: 'proud' }); }
      else if (!row || Date.now() - writeupWait.at > 120e3) writeupWait = null;   // no write-up: say nothing about it
    }
    const d = countDone();
    if (d > seen.done) { const n = d - seen.done; seen.done = d; award(10 * Math.min(n, 3), 'plan task'); } else if (d < seen.done) seen.done = d;
    const st = countStories();
    if (st > seen.stories) { seen.stories = st; award(20, 'story'); } else if (st < seen.stories) seen.stories = st;
    const ap = countApproach();
    if (ap > seen.approach) { seen.approach = ap; award(15, 'approach'); } else if (ap < seen.approach) seen.approach = ap;
    save();
    nudges();
    paint();
  }

  /** Boundary moments only, each at most once in its window. */
  function nudges() {
    if (!el || hiddenNow()) return;
    const now = Date.now(), f = S.flags;
    const once = (k, ms) => { if (f[k] && now - f[k] < ms) return false; f[k] = now; save(); return true; };
    const mode = document.body.dataset.mode;
    // Daily hello with the plan.
    const phoneBusy = window.innerWidth < 760 && (document.activeElement?.matches?.('input, textarea, [contenteditable="true"]') || document.querySelector('.qf-modal-back, .ask-backdrop:not(.hidden), .qs-back'));
    if (S.greeted !== ymd() && now - lastActivity < 60e3 && !phoneBusy) {
      S.greeted = ymd(); save();
      const dl = daysLeft(), reps = todayReps(), m = momentum();
      const hr = new Date().getHours();
      const hi = hr < 12 ? 'Morning' : hr < 17 ? 'Hey' : 'Evening';
      if (hr >= 22 && hr < 24 || hr < 5) say(`${hi}. It is late — one 20-second pattern snap, then sleep. Sleep is when today's patterns stick.`, { force: true, m: 'sleepy', actions: [{ label: 'Quick snap', fn: quiz }, { label: 'Goodnight', fn: () => {} }] });
      else say(`<b>${hi}!</b> ${dl > 0 ? `${dl} day${dl === 1 ? '' : 's'} to ${esc(tgt().company)}. ` : ''}${reps ? `${reps}/${GOAL} reps already.` : `3 reps today${m.n ? ` keeps your ${m.n}-day momentum` : ''}.`}`, { force: true, ttl: 9000, actions: [{ label: '▶ Just start', fn: start }, { label: '20s snap', fn: quiz }] });
      return;
    }
    // Long stretch → break.
    if (now - activeSince > 50 * 60e3 && now - lastActivity < 60e3 && once('break', 90 * 60e3)) {
      say('50 minutes deep. Stand up for 5 — breaks are when the brain files what you just did.', { m: 'happy', actions: [{ label: 'OK, 5 min', fn: () => { activeSince = Date.now() + 5 * 60e3; } }] });
      return;
    }
    // Coding with no submit for a while → rubber duck.
    if (mode === 'coding') { if (!codingSince) codingSince = now; } else codingSince = 0;
    if (codingSince && now - Math.max(codingSince, lastAttemptAt) > 14 * 60e3 && now - lastActivity < 90e3 && once('stuck', 25 * 60e3)) {
      say('14 minutes on this one. Stuck? Explain it to me out loud — rubber-ducking finds the gap fast. In the interview you would be narrating anyway.', { m: 'thinking', actions: [{ label: 'Talk it through', fn: () => window.QFApproach?.open?.() }, { label: 'Still going', fn: () => {} }] });
      return;
    }
    // Something is due for redemption.
    const due = redeemDue();
    if (due.length && mode !== 'coding' && once('redeem', 4 * 3600e3)) {
      say(`<b>${esc(due[0].title)}</b> beat you ${ago(due[0].at)}. Ready for the rematch? Redeeming a fail is worth +40.`, { m: 'thinking', actions: [{ label: 'Rematch', fn: () => openProblem(due[0].slug, due[0].title) }, { label: 'Later', fn: () => { const f = S.failed[due[0].slug]; if (f) { f.at = Date.now(); f.n = (f.n || 0) + 1; save(); } } }] });
    }
  }
  const ago = t => { const d = Math.round((dayStart() - dayStart(t)) / DAY); return d <= 0 ? 'earlier today' : d === 1 ? 'yesterday' : `${d} days ago`; };
  /** Failed problems come back after 1, 3 and 7 days. */
  function redeemDue() {
    const gaps = [1, 3, 7];
    return Object.entries(S.failed).map(([slug, f]) => ({ slug, ...f, dueAt: f.at + gaps[Math.min(f.n || 0, 2)] * DAY }))
      .filter(f => f.dueAt <= Date.now()).sort((a, b) => a.dueAt - b.dueAt);
  }
  function openProblem(slug, title) {
    closePanel();
    if (window.QFSprint?.openHere) window.QFSprint.openHere(slug, title);
    else { $('modeNeetcode')?.click(); }
  }
  function start() {
    closePanel();
    if (window.QFSprint?.startNext) { $('modeHome')?.click(); setTimeout(() => window.QFSprint.startNext(), 60); } else quiz();
  }

  // ------------------------------------------------------- the panel --
  function togglePanel() { if (panel) closePanel(); else openPanel(); }
  function closePanel() {
    if (!panel) return;
    panel.remove(); panel = null;
    el?.querySelector('.nb-char')?.setAttribute('aria-expanded', 'false');
  }
  function ring(done) {
    const r = 22, c = 2 * Math.PI * r, p = Math.min(1, done / GOAL);
    return `<svg class="nb-ring" viewBox="0 0 56 56" aria-hidden="true"><circle cx="28" cy="28" r="${r}" class="bg"/><circle cx="28" cy="28" r="${r}" class="fg" stroke-dasharray="${(c * p).toFixed(1)} ${c.toFixed(1)}"/><text x="28" y="33" text-anchor="middle">${Math.min(done, 9)}/${GOAL}</text></svg>`;
  }
  // ------------------------------------------------------------ chat --
  // A short conversation with Nibble about whatever is on screen. Kept for
  // the page's life (not stored): it is a quick helper, not a transcript.
  const chatLog = [];
  const chatHtml = m => `<div class="nb-msg ${m.role === 'user' ? 'me' : 'nb'}">${esc(m.content).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\n/g, '<br>')}</div>`;
  function screenContext() {
    const q = window.currentQuestion;
    const mode = document.body.dataset.mode || '';
    const coding = mode === 'coding' && q;
    let code = '';
    try { code = coding ? (window.Editor?.value || '') : ''; } catch { code = ''; }
    const rd = readiness();
    return {
      page: ({ coding: 'the Coding tab', home: 'Today', learn: 'Learn', behavioural: 'Googleyness practice' })[mode] || mode || 'the site',
      question: coding ? `${q.id}. ${q.title}` : undefined,
      difficulty: coding ? q.difficulty : undefined,
      pattern: coding ? (q.topicTags || []).slice(0, 3).join(', ') : undefined,
      statement: coding ? String(q.plainStatement || '').slice(0, 1400) : undefined,
      code: code ? String(code).slice(0, 2800) : undefined,
      daysLeft: daysLeft(),
      weak: rd?.weak?.p,
    };
  }
  function wireChat(p) {
    const form = p.querySelector('.nb-chat'), input = p.querySelector('#nbChatIn'), log = p.querySelector('.nb-chat-log');
    if (!form) return;
    const paintLog = () => { log.innerHTML = chatLog.map(chatHtml).join(''); log.scrollTop = log.scrollHeight; };
    if (chatLog.length) log.scrollTop = log.scrollHeight;
    let busy = false;
    const send = async text => {
      text = String(text || '').trim();
      if (!text || busy) return;
      busy = true;
      p.querySelector('.nb-chat-sugg')?.remove();
      chatLog.push({ role: 'user', content: text });
      paintLog();
      log.insertAdjacentHTML('beforeend', '<div class="nb-msg nb nb-typing">…</div>');
      log.scrollTop = log.scrollHeight;
      mood('thinking', 4000);
      try {
        const r = await fetch('/api/buddy/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: chatLog.slice(-12), context: screenContext() }) });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || 'Nibble could not answer just now.');
        chatLog.push({ role: 'assistant', content: d.reply });
        mood('happy', 2500);
      } catch (e) {
        chatLog.push({ role: 'assistant', content: `Sorry — ${e.message} Try again in a moment.` });
        mood('worried', 2500);
      }
      busy = false;
      if (chatLog.length > 24) chatLog.splice(0, chatLog.length - 24);
      if (panel === p) paintLog();
    };
    form.onsubmit = e => { e.preventDefault(); const t = input.value; input.value = ''; send(t); };
    p.querySelectorAll('[data-sugg]').forEach(b => { b.onclick = e => { e.stopPropagation(); send(b.dataset.sugg); }; });
    setTimeout(() => input.focus({ preventScroll: true }), 50);
  }

  function openPanel() {
    if (S.mute === 'off') { S.mute = ''; save(); paintVisibility(); paint(); say('I am back! Tap me any time.', { force: true, m: 'cheer' }); return; }
    hideBubble();
    const lv = levelOf(S.xp), lo = xpFor(lv), hi = xpFor(lv + 1);
    const m = momentum(), reps = todayReps(), dl = daysLeft(), rd = readiness();
    const yest = S.ready[ymd(Date.now() - DAY)];
    const delta = rd && yest != null ? Math.round((rd.pct - yest) * 10) / 10 : null;
    const due = redeemDue(), open = Object.entries(S.failed);
    panel = document.createElement('div');
    panel.className = 'nb-panel'; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Nibble');
    panel.innerHTML = `
      <div class="nb-p-head">
        ${ring(reps)}
        <div class="nb-p-who"><b>Nibble · Level ${lv}</b>
          <div class="nb-bar" title="${S.xp - lo} / ${hi - lo} XP to level ${lv + 1}"><i style="width:${Math.round(100 * (S.xp - lo) / (hi - lo))}%"></i></div>
          <small>${S.xp} XP · ${hi - S.xp} to level ${lv + 1}</small></div>
        <button type="button" class="nb-p-x" aria-label="Close">×</button>
      </div>
      <div class="nb-stats">
        <div><b>${m.n}</b><span>day momentum</span><small>${'❄'.repeat(m.free)}${m.free ? ' freeze' + (m.free > 1 ? 's' : '') : 'no freezes'}</small></div>
        <div><b>${dl > 0 ? dl : dl === 0 ? 'Today' : '—'}</b><span>${dl > 0 ? `days to ${esc(tgt().company)}` : dl === 0 ? 'interview day' : 'after'}</span><small>${dl >= 1 && dl <= 3 ? 'taper: light reps' : esc(tgt().date)}</small></div>
        <div><b>${rd ? `${Math.round(rd.pct)}%` : '—'}</b><span>${esc(tgt().company)}-ready</span><small>${delta == null ? 'proof moves it' : `${delta >= 0 ? '+' : ''}${delta} since yesterday`}</small></div>
      </div>
      <form class="nb-chat" autocomplete="off">
        <div class="nb-chat-log" aria-live="polite">${chatLog.length ? chatLog.map(chatHtml).join('') : `<p class="nb-chat-hi">Ask me anything — stuck on a problem, a pattern, or what to do next. I give hints first, not answers.</p>`}</div>
        <div class="nb-chat-row">
          <label class="nb-sr" for="nbChatIn">Ask Nibble</label>
          <input id="nbChatIn" placeholder="Ask Nibble…" maxlength="600">
          <button type="submit" class="nb-chat-send" aria-label="Send">➤</button>
        </div>
        ${chatLog.length ? '' : `<div class="nb-chat-sugg">${['I’m stuck — give me a hint', 'Which pattern is this?', 'What should I do next?'].map(t => `<button type="button" data-sugg="${esc(t)}">${esc(t)}</button>`).join('')}</div>`}
      </form>
      <button type="button" class="nb-go" data-act="start">▶ Just start <small>next task from today's plan</small></button>
      <div class="nb-grid">
        <button type="button" data-act="quiz"><b>⚡ Pattern snap</b><small>20s rounds · best ${S.quizBest || 0}/5</small></button>
        <button type="button" data-act="duck"><b>🦆 Talk it through</b><small>explain an approach</small></button>
        <button type="button" data-act="shorts" class="nb-wide"><b>🎬 Shorts</b><small>${rd?.weak ? `2-min explainers · start with ${esc(rd.weak.p)}` : '2-min animated explainers'}</small></button>
      </div>
      ${open.length ? `<div class="nb-sec"><b>Redemption</b> <small>${due.length ? `${due.length} ready for a rematch` : 'fails come back at 1, 3, 7 days'}</small>
        <ul>${(due.length ? due : open.map(([slug, f]) => ({ slug, ...f }))).slice(0, 4).map(f => `<li><button type="button" data-slug="${esc(f.slug)}" data-title="${esc(f.title)}">${esc(f.title)}</button><small>${due.includes(f) ? 'ready' : ago(f.at)}</small></li>`).join('')}</ul></div>` : ''}
      ${rd?.weak ? `<div class="nb-sec"><b>Weakest pattern</b> <small>${esc(rd.weak.p)} · ${rd.weak.pct}%</small></div>` : ''}
      <div class="nb-ins-card">💡 ${esc(insight())}</div>
      <div class="nb-mute"><span>Nibble:</span>
        <button type="button" data-mute="" class="${!S.mute ? 'on' : ''}">Chatty</button>
        <button type="button" data-mute="quiet" class="${S.mute === 'quiet' ? 'on' : ''}">Quiet</button>
        <button type="button" data-mute="nap">Nap 1h</button>
        <button type="button" data-mute="day">Hide today</button>
        <button type="button" data-mute="off">Sleep</button>
      </div>`;
    el.appendChild(panel);
    el.querySelector('.nb-char').setAttribute('aria-expanded', 'true');
    panel.querySelector('.nb-p-x').onclick = closePanel;
    wireChat(panel);
    panel.querySelector('[data-act=start]').onclick = start;
    panel.querySelector('[data-act=quiz]').onclick = () => { closePanel(); quiz(); };
    panel.querySelector('[data-act=shorts]').onclick = () => { closePanel(); rd?.weak ? window.QFShorts?.topic?.(rd.weak.p) : window.QFShorts?.picker?.(); };
    panel.querySelector('[data-act=duck]').onclick = () => { closePanel(); window.QFApproach?.open?.(); };
    panel.querySelectorAll('[data-slug]').forEach(b => { b.onclick = () => openProblem(b.dataset.slug, b.dataset.title); });
    panel.querySelectorAll('[data-mute]').forEach(b => { b.onclick = () => {
      const v = b.dataset.mute;
      if (v === 'nap') S.napUntil = Date.now() + 3600e3;
      else if (v === 'day') S.hideDay = ymd();
      else S.mute = v;
      save(); closePanel(); paintVisibility(); paint();
      if (v === 'quiet') mood('sleepy', 1500);
    }; });
    panel.querySelector('.nb-go').focus();
  }

  // ---------------------------------------------------- pattern snap --
  let NC = null;
  async function bank() {
    if (NC) return NC;
    const r = await fetch('/api/neetcode', { credentials: 'same-origin' });
    if (!r.ok) throw new Error('bank');
    const d = await r.json();
    NC = { qs: d.questions || [], patterns: d.patterns || [...new Set((d.questions || []).map(q => q.pattern))] };
    return NC;
  }
  const shuffle = a => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
  const CUES = {
    'Arrays & Hashing': 'Counting, grouping or "seen before?" → a hash map/set gives O(1) lookups.',
    'Two Pointers': 'Sorted array or pairs from both ends → move left/right pointers inward.',
    'Sliding Window': 'Best contiguous substring/subarray → grow right, shrink left while invalid.',
    'Stack': 'Matching brackets, "next greater", or undoing the last thing → a stack.',
    'Binary Search': 'Sorted, or "minimum value that works" → halve the search space each step.',
    'Linked List': 'Pointer surgery: dummy head, slow/fast pointers, reverse in place.',
    'Trees': 'Each node returns something to its parent → DFS recursion (or BFS by level).',
    'Heap / Priority Queue': 'Top-k, k-th largest, or always-take-the-smallest → a heap.',
    'Backtracking': 'All combinations/permutations/placements → choose, explore, un-choose.',
    'Tries': 'Prefixes and many words at once → a trie of characters.',
    'Graphs': 'Grids, islands, prerequisites → BFS/DFS with a visited set, or topological sort.',
    'Advanced Graphs': 'Weighted shortest paths or MST → Dijkstra / Prim / Kruskal.',
    '1-D Dynamic Programming': 'Answer for i depends on a few earlier answers → dp[i] from dp[i-1], dp[i-2]…',
    '2-D Dynamic Programming': 'Two strings or a grid of choices → dp[i][j] table.',
    'Greedy': 'A locally best choice is provably safe → take it and never look back.',
    'Intervals': 'Ranges that overlap → sort by start and sweep.',
    'Math & Geometry': 'Matrix rotation/spiral or number tricks → careful index maths.',
    'Bit Manipulation': 'XOR cancels pairs, masks test bits → bitwise operators.',
  };
  async function quiz() {
    closePanel(); hideBubble();
    let data;
    try { data = await bank(); } catch { say('Could not load the problem list. Try again in a moment.', { force: true, m: 'worried' }); return; }
    const pool = shuffle(data.qs.filter(q => q.pattern)).slice(0, 5);
    if (!pool.length) return;
    let i = 0, score = 0, streak = 0, timer = null, missed = [];
    const back = document.createElement('div');
    back.className = 'nb-quiz-back';
    back.innerHTML = `<div class="nb-quiz" role="dialog" aria-modal="true" aria-labelledby="nbQh"><div class="nb-q-top"><b id="nbQh">⚡ Pattern snap</b><span class="nb-q-n"></span><button type="button" class="nb-p-x" aria-label="Close">×</button></div><div class="nb-q-time"><i></i></div><div class="nb-q-body"></div></div>`;
    document.body.appendChild(back);
    const body = back.querySelector('.nb-q-body');
    const close = () => { clearInterval(timer); back.remove(); document.removeEventListener('keydown', key, true); };
    back.querySelector('.nb-p-x').onclick = close;
    back.addEventListener('click', e => { if (e.target === back) close(); });
    let answer = null;
    function key(e) {
      if (e.key === 'Escape') { e.stopPropagation(); close(); return; }
      if (answer && /^[1-4]$/.test(e.key)) { e.preventDefault(); answer(+e.key - 1); }
      else if (!answer && (e.key === 'Enter' || e.key === ' ') && back.querySelector('.nb-q-next')) { e.preventDefault(); back.querySelector('.nb-q-next').click(); }
    }
    document.addEventListener('keydown', key, true);
    function ask() {
      const q = pool[i];
      const opts = shuffle([q.pattern, ...shuffle(data.patterns.filter(p => p !== q.pattern)).slice(0, 3)]);
      back.querySelector('.nb-q-n').textContent = `${i + 1} / ${pool.length}${streak > 1 ? ` · 🔥${streak}` : ''}`;
      body.innerHTML = `<p class="nb-q-q">Which pattern cracks</p><h3>${esc(q.title)} <small class="d-${esc((q.difficulty || '').toLowerCase())}">${esc(q.difficulty || '')}</small></h3>
        <div class="nb-q-opts">${opts.map((o, k) => `<button type="button" data-k="${k}"><kbd>${k + 1}</kbd>${esc(o)}</button>`).join('')}</div>`;
      const bar = back.querySelector('.nb-q-time i');
      const t0 = Date.now(), LIM = 20e3;
      clearInterval(timer);
      timer = setInterval(() => { const f = Math.max(0, 1 - (Date.now() - t0) / LIM); bar.style.width = `${f * 100}%`; bar.classList.toggle('low', f < 0.3); if (f <= 0) answer(-1); }, 100);
      answer = k => {
        if (!answer) return;
        answer = null; clearInterval(timer);
        const right = k >= 0 && opts[k] === q.pattern;
        if (right) { score++; streak++; } else { streak = 0; missed.push(q); }
        body.querySelectorAll('[data-k]').forEach(b => { b.disabled = true; const o = opts[+b.dataset.k]; if (o === q.pattern) b.classList.add('ok'); else if (+b.dataset.k === k) b.classList.add('bad'); });
        body.insertAdjacentHTML('beforeend', `<div class="nb-q-why ${right ? 'ok' : 'bad'}"><b>${right ? (streak > 2 ? `${streak} in a row!` : 'Yes!') : k < 0 ? 'Time — it is' : 'It is'} ${esc(q.pattern)}.</b> ${esc(CUES[q.pattern] || '')}</div><button type="button" class="nb-q-next pri">${i + 1 < pool.length ? 'Next →' : 'See score'}</button>`);
        mood(right ? 'cheer' : 'worried', 1500);
        const nx = body.querySelector('.nb-q-next'); nx.focus();
        nx.onclick = () => { i++; if (i < pool.length) ask(); else finish(); };
      };
      body.querySelectorAll('[data-k]').forEach(b => { b.onclick = () => answer && answer(+b.dataset.k); });
      body.querySelector('[data-k]').focus();
    }
    function finish() {
      clearInterval(timer);
      const xp = score * 5 + (score === pool.length ? 10 : 0);
      const best = score > (S.quizBest || 0);
      if (best) S.quizBest = score;
      save();
      back.querySelector('.nb-q-time i').style.width = '0';
      body.innerHTML = `<div class="nb-q-end"><div class="nb-q-score">${score}<small>/${pool.length}</small></div>
        <p>${score === pool.length ? 'Perfect round! Pattern spotting is the first minute of every interview.' : score >= 3 ? 'Solid. The misses below are worth one look.' : `Good to find these now, not on ${tgt().date ? esc(tgt().date) : 'the day'}.`}${best ? ' <b>New best.</b>' : ''}</p>
        ${missed.length ? `<ul class="nb-q-miss">${missed.map(q => `<li><button type="button" data-slug="${esc(q.slug)}" data-title="${esc(q.title)}">${esc(q.title)}</button> <small>${esc(q.pattern)}</small></li>`).join('')}</ul>` : ''}
        <div class="nb-acts"><button type="button" class="pri" data-again>Another round</button><button type="button" data-done>Done</button></div></div>`;
      body.querySelector('[data-again]').onclick = () => { close(); quiz(); };
      body.querySelector('[data-done]').onclick = close;
      body.querySelectorAll('[data-slug]').forEach(b => { b.onclick = () => { close(); openProblem(b.dataset.slug, b.dataset.title); }; });
      body.querySelector('[data-again]').focus();
      if (score === pool.length) confetti(36);
      if (xp) award(xp, 'recall', score >= 3);
    }
    ask();
  }

  // ---------------------------------------------------------- paint --
  function paint() {
    if (!el || !S) return;
    const lv = levelOf(S.xp), dl = daysLeft();
    el.classList.toggle('acc-band', lv >= 2 && lv < 6);
    el.classList.toggle('acc-phones', lv >= 4);
    el.classList.toggle('acc-cap', lv >= 6);
    el.classList.toggle('acc-tie', dl === 1 || dl === 0);
    const reps = todayReps();
    // The antenna bulb shows the day: grey-blue (no rep yet), amber (going), green (goal met).
    el.style.setProperty('--nb-mood', reps >= GOAL ? '#7cf0a8' : reps ? '#ffd166' : '#9fb4ff');
    el.style.setProperty('--nb-mood2', reps >= GOAL ? '#1f9d5a' : reps ? '#d68a00' : '#4a5fc4');
    const due = redeemDue().length;
    const badge = el.querySelector('.nb-badge');
    badge.hidden = !(reps < GOAL || due);
    badge.textContent = due ? `${due}` : `${reps}/${GOAL}`;
    badge.classList.toggle('due', !!due);
    if (!el.dataset.mood || !moodTimer) el.dataset.mood = baseMood();
    paintVisibility();
    // Remember today's readiness so tomorrow can show the change.
    const rd = readiness();
    if (rd && S.ready[ymd()] !== rd.pct) { S.ready[ymd()] = rd.pct; const ks = Object.keys(S.ready).sort(); while (ks.length > 30) delete S.ready[ks.shift()]; save(); }
  }

  // ----------------------------------------------------------- boot --
  let started = false;
  function boot() {
    if (started) return;
    // Wait for sign-in: the account's data must be in localStorage first.
    const auth = $('qfAuth');
    if (auth && auth.offsetParent !== null) { setTimeout(boot, 1500); return; }
    started = true;
    const fresh = !load() && hatch();
    mount();
    if (fresh) {
      const lv = levelOf(S.xp);
      setTimeout(() => say(`<b>Hi, I'm Nibble!</b> I counted what you've already done: <b>level ${lv}</b>. I turn proof into XP — solves, mocks, recall rounds. Tap me for your next move.`, { force: true, ttl: 12000, m: 'cheer', actions: [{ label: '▶ Just start', fn: start }, { label: 'Try a 20s snap', fn: quiz }] }), 1200);
    }
    setInterval(scan, 3000);
    setInterval(() => { if (el && !moodTimer) el.dataset.mood = baseMood(); paintVisibility(); }, 1500);
    window.addEventListener('storage', e => { if (e.key === KEY) { load(); paint(); } else scan(); });
    window.visualViewport?.addEventListener('resize', paintVisibility);
    document.addEventListener('focusin', e => { if (window.innerWidth < 760 && e.target.matches?.('input, textarea, [contenteditable="true"]')) setTimeout(paintVisibility, 300); });
    let hiddenAt = 0;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); return; }
      load();
      if (hiddenAt && Date.now() - hiddenAt > 45 * 60e3 && S.greeted === ymd()) setTimeout(() => say(`Welcome back! Warm up with a 20-second pattern snap?`, { force: true, actions: [{ label: '⚡ Snap', fn: quiz }, { label: '▶ Just start', fn: start }] }), 800);
      paint();
    });
  }
  /** Undo nap / hide-for-today / sleep and say hello (palette "Show Nibble"). */
  function wake() {
    if (!S) return;
    S.napUntil = 0; S.hideDay = ''; if (S.mute === 'off') S.mute = ''; save();
    paintVisibility();
    if (hiddenNow()) { window.QF?.toast?.('Nibble is tucked away on this screen — it comes back on Today.'); return; }
    say('<b>I\'m back!</b> Tap me for your next move.', { force: true, m: 'cheer' });
  }
  window.QFBuddy = { wake, quiz, start, say: (h, o) => say(h, { force: true, ...o }), open: () => { if (!panel) openPanel(); }, state: () => S, award, reset: () => { localStorage.removeItem(KEY); location.reload(); } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 800)); else setTimeout(boot, 800);
})();
