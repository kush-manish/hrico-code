/* Today: the interview sprint. Turns the target and date into a day-by-day
 * plan across every coding pattern plus Googleyness, and adds three fast,
 * interactive ways to learn: pattern-spotting drills, spaced-recall
 * flashcards with the official solutions, and timed STAR practice.
 * Everything is kept in localStorage ('qf.sprint'), which the shell mirrors
 * to the signed-in user's account.
 */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const KEY = 'qf.sprint';
  const DAY = 864e5;

  // --------------------------------------------------------------- dates --
  const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const parseYmd = s => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1); };
  const today = () => parseYmd(ymd(new Date()));
  // Calendar arithmetic, not +n×24h: the UK clocks change in March and
  // October, and a 23- or 25-hour day would repeat or skip a date.
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const fmt = (d, o = { weekday: 'short', day: 'numeric', month: 'short' }) => d.toLocaleDateString(undefined, o);

  // --------------------------------------------------------------- state --
  // Several plans (one per interview), each with its own target, start date
  // and ticks. What you learn — drill accuracy, flashcards, STAR answers —
  // is shared, because it carries over from one interview to the next.
  // The week describes the time you actually have: office days are light,
  // days off carry the heavy work and the mocks, rest days have nothing.
  const DAY_TYPES = {
    office: { label: 'Office day', short: 'Office', weight: 1, hint: 'About 1 hour: primer, 2 problems, a drill on the commute' },
    wfh: { label: 'Work from home', short: 'WFH', weight: 2, hint: 'About 2 hours: primer, 3–4 problems, drill, Googleyness' },
    off: { label: 'Day off', short: 'Off', weight: 3, hint: '4+ hours: more problems and a timed mock' },
    rest: { label: 'Rest', short: 'Rest', weight: 0, hint: 'No plan. Flashcards only if you want' },
  };
  const DEFAULT_WEEK = { 0: 'off', 1: 'wfh', 2: 'office', 3: 'office', 4: 'office', 5: 'wfh', 6: 'off' };

  function defaultTarget() {
    const t = window.QF?.user?.target || {};
    return { company: t.company || 'Google', level: t.level || 'L4', role: t.role || 'Software Engineer', date: t.date || '2026-11-03' };
  }
  function newPlan(tgt, start = ymd(today())) {
    return { id: Math.random().toString(36).slice(2, 10), target: { ...tgt }, start, done: {}, created: Date.now() };
  }
  function load() {
    let s = {};
    try { s = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { s = {}; }
    s.drill ||= {}; s.cards ||= {}; s.star ||= []; s.days ||= [];
    s.week ||= { ...DEFAULT_WEEK }; s.overrides ||= {};
    if (!Array.isArray(s.plans) || !s.plans.length) {
      // First run, or state from the single-plan version: becomes plan one.
      const p = newPlan(defaultTarget(), s.start || ymd(today()));
      p.done = s.done || {};
      s.plans = [p];
    }
    delete s.done; delete s.start;
    if (!s.plans.some(p => p.id === s.active)) s.active = s.plans[0].id;
    return s;
  }
  let S = load();
  const active = () => S.plans.find(p => p.id === S.active) || S.plans[0];
  const target = () => active().target;
  function daysLeft() { return Math.round((parseYmd(target().date) - today()) / DAY); }
  const dayType = d => S.overrides[ymd(d)] || S.week[d.getDay()] || 'wfh';
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* quota */ } };
  function markActive() { const d = ymd(today()); if (!S.days.includes(d)) { S.days.push(d); S.days = S.days.slice(-120); } }
  function streak() {
    let n = 0; const set = new Set(S.days);
    for (let d = today(); set.has(ymd(d)); d = addDays(d, -1)) n++;
    return n;
  }

  // ------------------------------------------------------------ patterns --
  // What to notice, the shape of the answer, and where people slip. Short on
  // purpose: these are read in thirty seconds before a problem, not studied.
  const CUES = {
    'Arrays & Hashing': { see: 'Need to find, count or group things fast; "seen before?"', do: 'Hash map / set for O(1) lookups; count with a dict; group by a canonical key (sorted string, tuple of counts).', o: 'O(n) time, O(n) space', slip: 'Mutating while iterating; forgetting duplicates.' },
    'Two Pointers': { see: 'Sorted array, pairs/triplets, palindromes, in-place partition.', do: 'l=0, r=n-1; move the side that cannot be part of a better answer. For triplets: fix i, two-pointer the rest, skip duplicates.', o: 'O(n) after O(n log n) sort', slip: 'Duplicate skipping; off-by-one when l==r.' },
    'Sliding Window': { see: 'Contiguous subarray/substring with a constraint (longest, shortest, at most k).', do: 'Expand r; while invalid shrink l; update best. Track counts in a map.', o: 'O(n)', slip: 'Updating the answer before vs after shrinking.' },
    'Stack': { see: 'Matching brackets, "next greater/smaller", evaluate expressions, undo.', do: 'Monotonic stack of indices: pop while the new value beats the top; the pop is when an element finds its answer.', o: 'O(n) — each index pushed and popped once', slip: 'Storing values when you need indices.' },
    'Binary Search': { see: 'Sorted input, or "minimise the maximum" / "smallest x such that…" (search on the answer).', do: 'lo,hi; while lo<hi: mid; keep the half that still contains the answer. Write the predicate first.', o: 'O(log n) or O(n log range)', slip: 'Infinite loops: mid rounding vs lo=mid.' },
    'Linked List': { see: 'Reverse, merge, cycle, kth from end, reorder.', do: 'Dummy head; slow/fast pointers; reverse with prev/cur/next. Draw three nodes.', o: 'O(n), O(1) space', slip: 'Losing the next pointer; not returning dummy.next.' },
    'Trees': { see: 'Anything on a binary tree or BST: depth, paths, LCA, validate, serialise.', do: 'Recursive DFS returning what the parent needs; BFS with a queue for levels; BST = in-order is sorted.', o: 'O(n), O(h) stack', slip: 'Mixing "return value" and "global best" (e.g. max path sum).' },
    'Heap / Priority Queue': { see: 'Top k, k-th largest, merge k sorted, running median, schedule by earliest.', do: 'Min-heap of size k for top-k largest; two heaps for median; push (key, item).', o: 'O(n log k)', slip: 'Python heapq is a min-heap — negate for max.' },
    'Backtracking': { see: 'All combinations / permutations / subsets / boards; "generate every…".', do: 'choose → recurse → un-choose. Pass start index to avoid reuse; sort + skip equal siblings for duplicates.', o: 'Exponential — say it up front', slip: 'Appending the same list object instead of a copy.' },
    'Tries': { see: 'Prefix lookups, word search with many words, autocomplete.', do: 'Node = dict of children + end flag; insert/search char by char; prune found words in board search.', o: 'O(total chars)', slip: 'Not marking end-of-word separately from prefix.' },
    'Graphs': { see: 'Grids of islands, dependencies, connectivity, shortest path in unweighted graph.', do: 'Adjacency list; BFS for shortest steps, DFS for components; visited set; topological sort for prerequisites; union-find for connectivity.', o: 'O(V+E)', slip: 'Marking visited on pop instead of on push (BFS blow-up).' },
    'Advanced Graphs': { see: 'Weighted shortest path, minimum spanning tree, cheapest with k stops.', do: 'Dijkstra with a heap (dist, node); Prim/Kruskal for MST; Bellman-Ford for k edges.', o: 'O(E log V)', slip: 'Skipping stale heap entries (if d > dist[u]: continue).' },
    '1-D Dynamic Programming': { see: 'Count ways / min cost / max value over a sequence where choices overlap.', do: 'Define dp[i] in words; recurrence from the last choice; base cases; then roll to O(1) space.', o: 'O(n) or O(n·k)', slip: 'Not saying the state out loud before coding.' },
    '2-D Dynamic Programming': { see: 'Two strings, grid paths, knapsack, intervals of a range.', do: 'dp[i][j] = answer for prefixes i, j; fill in dependency order; compare edit-distance/LCS shapes.', o: 'O(n·m)', slip: 'Index shift: dp size (n+1)×(m+1).' },
    'Greedy': { see: 'Local choice provably safe: jump game, intervals, gas station, partition labels.', do: 'Sort or scan once, keep the best reach/end so far; justify with an exchange argument.', o: 'O(n) or O(n log n)', slip: 'Using greedy where a counter-example exists — test one.' },
    'Intervals': { see: 'Merge, insert, overlap, meeting rooms.', do: 'Sort by start; compare with last merged end; heap of end times for rooms.', o: 'O(n log n)', slip: 'Touching intervals [1,2],[2,3] — clarify inclusive.' },
    'Math & Geometry': { see: 'Rotate/spiral matrix, powers, digits, overflow.', do: 'Work layer by layer; fast power by squaring; handle sign and overflow explicitly.', o: 'Usually O(n) / O(log n)', slip: 'Boundary indices on non-square matrices.' },
    'Bit Manipulation': { see: 'Single number, counting bits, sums without +, subsets as masks.', do: 'XOR cancels pairs; n & (n-1) drops lowest bit; masks for subsets.', o: 'O(n) / O(1)', slip: 'Python ints are unbounded — mask to 32 bits.' },
  };
  const PATTERNS = Object.keys(CUES);
  // The Learn tab's own lesson for each pattern.
  const LEARN_ID = { 'Arrays & Hashing': 'hash-map', 'Two Pointers': 'two-pointers', 'Sliding Window': 'sliding-window-dynamic', 'Stack': 'monotonic-stack',
    'Binary Search': 'binary-search', 'Linked List': 'linked-list', 'Trees': 'tree-traversal', 'Heap / Priority Queue': 'heap', 'Backtracking': 'backtracking',
    'Tries': 'trie', 'Graphs': 'graph-traversal', 'Advanced Graphs': 'graph-traversal', '1-D Dynamic Programming': 'dp-1d', '2-D Dynamic Programming': 'dp-2d',
    'Greedy': 'kadane', 'Intervals': 'intervals', 'Math & Geometry': 'matrix', 'Bit Manipulation': 'bit-manipulation' };

  // A two-week sprint, front-loaded with what Google asks most. Stretched or
  // squeezed to the days that are actually left.
  const TEMPLATE = [
    { topics: ['Arrays & Hashing', 'Two Pointers'] },
    { topics: ['Sliding Window', 'Stack'] },
    { topics: ['Binary Search'] },
    { topics: ['Linked List', 'Intervals'] },
    { topics: ['Trees'] },
    { topics: ['Trees', 'Tries'] },
    { topics: ['Heap / Priority Queue', 'Greedy'] },
    { topics: ['Graphs'], mock: true },
    { topics: ['Advanced Graphs', 'Graphs'] },
    { topics: ['Backtracking'] },
    { topics: ['1-D Dynamic Programming'] },
    { topics: ['2-D Dynamic Programming'], mock: true },
    { topics: ['Math & Geometry', 'Bit Manipulation'] },
    { topics: [], special: 'google', title: 'Google’s most-asked questions' },
    { topics: [], special: 'loop', title: 'Full loop rehearsal', mock: true },
    { topics: [], special: 'review', title: 'Light review and rest' },
  ];

  let NC = null, GQ = [], loadErr = null;          // NeetCode 150, Googleyness questions
  async function data() {
    if (!NC) {
      try {
        const r = await fetch('/api/neetcode');
        if (!r.ok) throw new Error(r.status === 429 ? 'Too many requests — wait a few seconds' : `server said ${r.status}`);
        NC = (await r.json()).questions || [];
        loadErr = null;
      } catch (e) { NC = null; loadErr = e.message; return []; }
      try { const r = await fetch('/api/behavioural/questions/googleyness'); if (r.ok) GQ = (await r.json()).questions || []; } catch { /* fallback question */ }
    }
    return NC;
  }

  function solvedSet() {
    const set = new Set();
    try { for (const a of window.Attempts?.all?.() || []) if (a.mode === 'submit' && a.ok) set.add(a.slug); } catch { /* none */ }
    for (const p of S.plans) for (const k of Object.keys(p.done || {})) if (k.startsWith('p:') && p.done[k]) set.add(k.slice(2));
    return set;
  }

  /**
   * Lays the template over the days left, in proportion to the time each day
   * has: an office day takes a third of what a day off takes, rest days take
   * nothing. Mocks land on days with real time. Spare days revise.
   */
  function plan() {
    const start = parseYmd(active().start);
    const end = parseYmd(target().date);
    const n = Math.max(1, Math.round((end - start) / DAY));
    const days = [];
    for (let i = 0; i < n; i++) {
      const date = addDays(start, i);
      const type = dayType(date);
      days.push({ i, date, type, weight: DAY_TYPES[type]?.weight ?? 2, parts: [] });
    }
    let W = days.reduce((a, d) => a + d.weight, 0);
    if (!W) { days.forEach(d => { d.weight = 1; }); W = n; }
    // After a re-plan, parts already covered are left out so the rest spread
    // over the days that are actually left.
    const skip = new Set(active().skip || []);
    const TPL = TEMPLATE.filter((_, k) => !skip.has(k));
    const T = TPL.length;
    TPL.forEach((part, k) => {
      const pos = k / T * W + 1e-9;      // part 0 always lands on the first working day
      let acc = 0;
      for (const d of days) { acc += d.weight; if (d.weight && pos <= acc) { d.parts.push(part); break; } }
    });
    let lastTopics = [];
    for (const d of days) {
      d.topics = [...new Set(d.parts.flatMap(p => p.topics))];
      // A day can host two special parts (Google's most-asked and the loop
      // rehearsal on a long day off): keep both, not just the first.
      d.specials = d.parts.filter(p => p.special).map(p => p.special);
      d.special = d.specials[0] || null;
      d.mock = false;
      if (d.topics.length) lastTopics = d.topics;
      if (!d.weight) { d.title = 'Rest day'; d.special = 'rest'; d.specials = ['rest']; continue; }
      if (!d.parts.length) { d.topics = lastTopics.slice(0, 2); d.review = true; }
      d.title = d.parts.length
        ? (d.topics.length ? d.topics.join(' · ') : (d.parts.filter(p => p.title).map(p => p.title).join(' · ') || 'Mixed review'))
        : (d.topics.length ? `Revise: ${d.topics.join(' · ')}` : 'Mixed review');
    }
    // Each mock goes to the first day from its slot on that has real time.
    TPL.forEach(part => {
      if (!part.mock) return;
      const at = days.findIndex(d => d.parts.includes(part));
      const host = days.slice(Math.max(0, at)).find(d => d.weight >= 2) || days.slice(0, Math.max(0, at)).reverse().find(d => d.weight >= 2);
      if (host) host.mock = true;
    });
    return days;
  }

  const PER_DAY = { office: 2, wfh: 4, off: 6, rest: 0 };
  // A day's problems are chosen once and then kept, so ticking or solving one
  // leaves it in place (checked) instead of swapping in the next problem.
  function problemsFor(day) {
    const p = active(); p.picks ||= {};
    const key = ymd(day.date), sig = `${day.type}|${day.specials.join('+')}|${day.topics.join(',')}`;
    const kept = p.picks[key];
    if (kept && kept.sig === sig) {
      const by = new Map(NC.map(q => [q.slug, q]));
      const list = kept.slugs.map(x => by.get(x)).filter(Boolean);
      if (list.length === kept.slugs.length) return list;
    }
    const list = pickProblems(day, key);
    p.picks[key] = { sig, slugs: list.map(q => q.slug) };
    savePicksSoon();
    return list;
  }
  let pickTimer = null;
  const savePicksSoon = () => { clearTimeout(pickTimer); pickTimer = setTimeout(save, 400); };

  // LeetCode Premium problems: their statements cannot be fetched, so the
  // plan never hands them out as a day's problem.
  const PREMIUM = new Set(['meeting-rooms', 'meeting-rooms-ii', 'graph-valid-tree', 'number-of-connected-components-in-an-undirected-graph', 'walls-and-gates', 'alien-dictionary', 'encode-and-decode-strings', 'missing-ranges', 'longest-substring-with-at-most-two-distinct-characters', 'one-edit-distance', 'reconstruct-itinerary-premium']);
  function pickProblems(day, key) {
    const solved = solvedSet();
    // Problems already handed to an earlier day stay there.
    const taken = new Set(Object.entries(active().picks || {}).filter(([k]) => k < key).flatMap(([, v]) => v.slugs));
    const total = PER_DAY[day.type] ?? 4;
    if (!total) return [];
    if (day.specials.includes('google')) {
      const pool = NC.filter(q => q.blind75 && q.difficulty === 'Medium' && !PREMIUM.has(q.slug)).sort((a, b) => a.slug.localeCompare(b.slug));
      const fresh = pool.filter(q => !taken.has(q.slug) && !solved.has(q.slug));
      return [...fresh.filter((_, i) => i % 7 === day.i % 7), ...fresh].filter((q, i, a) => a.indexOf(q) === i).slice(0, total);
    }
    if (!day.topics.length) return [];
    const per = Math.max(1, Math.ceil(total / day.topics.length));
    const rank = q => (q.blind75 ? 0 : 10) + ({ Easy: 0, Medium: 1, Hard: 3 }[q.difficulty] ?? 2) + (day.review ? -({ Medium: 1 }[q.difficulty] || 0) : 0);
    const out = [];
    for (const t of day.topics) {
      const pool = NC.filter(q => q.pattern === t).sort((a, b) => rank(a) - rank(b));
      // Revision days skip what the earlier days already handed out.
      const open = pool.filter(q => !PREMIUM.has(q.slug));
      const pick = [...open.filter(q => !solved.has(q.slug) && !taken.has(q.slug)), ...open.filter(q => !solved.has(q.slug) && taken.has(q.slug)), ...open.filter(q => solved.has(q.slug))];
      for (const q of pick) { if (out.filter(x => x.pattern === t).length >= per || out.length >= total) break; if (!out.includes(q)) out.push(q); }
    }
    return out;
  }

  function tasksFor(day) {
    const t = [];
    if (day.type === 'rest') {
      t.push({ id: `f:${day.i}`, kind: 'flash', label: 'Optional: recall flashcards', sub: 'Rest day — five minutes at most' });
      return t;
    }
    if (!day.review) for (const topic of day.topics) t.push({ id: `l:${day.i}:${topic}`, kind: 'learn', topic, label: `Read the ${topic} primer`, sub: '30-second pattern card' });
    for (const q of problemsFor(day)) t.push({ id: `p:${q.slug}`, kind: 'problem', q, label: q.title, sub: `${q.pattern} · ${q.difficulty}${q.blind75 ? ' · Blind 75' : ''}` });
    const has = s => day.specials.includes(s);
    if (day.topics.length || has('google')) t.push({ id: `d:${day.i}`, kind: 'drill', label: 'Pattern drill — 10 quick questions', sub: day.type === 'office' ? '2 minutes — good on the commute' : '2 minutes' });
    if (day.mock) t.push({ id: `m:${day.i}`, kind: 'mock', label: has('loop') ? 'Two 45-minute coding mocks, back to back' : 'Timed 45-minute coding mock', sub: 'With the AI interviewer and a scored write-up' });
    // Two behavioural questions a day. The first keeps its old id and question (ticks already
    // made stay valid); the second comes from the other half of the list, so the two always differ.
    const gq = GQ.length ? GQ[day.i % GQ.length] : 'Tell me about a time you helped a teammate who was struggling.';
    t.push({ id: `g:${day.i}`, kind: 'star', gq, label: 'Googleyness: ' + gq, sub: 'STAR answer in 2 minutes' });
    const gq2 = GQ.length > 1 ? GQ[(day.i + Math.floor(GQ.length / 2)) % GQ.length] : 'Tell me about a time you disagreed with a teammate and how you resolved it.';
    t.push({ id: `g2:${day.i}`, kind: 'star', gq: gq2, label: 'Googleyness: ' + gq2, sub: 'Second STAR answer in 2 minutes' });
    if (has('loop')) t.push({ id: `b:${day.i}`, kind: 'bmock', label: 'Googleyness mock interview (25 min)', sub: 'AI interviewer, scored on six dimensions' });
    if (has('review') || day.type === 'office') t.push({ id: `f:${day.i}`, kind: 'flash', label: 'Recall flashcards — everything due', sub: day.type === 'office' ? 'Spaced repetition — fits a coffee break' : 'Spaced repetition' });
    return t;
  }
  const isDone = task => Boolean(active().done[task.id]) || (task.kind === 'problem' && solvedSet().has(task.q.slug));

  function readiness() {
    const solved = solvedSet();
    return PATTERNS.map(p => {
      const pool = NC ? NC.filter(q => q.pattern === p) : [];
      const sv = pool.filter(q => solved.has(q.slug)).length;
      const [ok, tot] = S.drill[p] || [0, 0];
      const solvedPart = pool.length ? Math.min(1, sv / Math.min(pool.length, 6)) : 0;
      const pct = Math.round(100 * (tot ? 0.65 * solvedPart + 0.35 * (ok / tot) : solvedPart));
      return { p, pct, sv, total: pool.length, drill: tot ? `${ok}/${tot}` : '—' };
    });
  }

  // ------------------------------------------------------------ re-plan --
  /** Template parts already covered: every topic's primer read or a problem of it solved. */
  function coveredParts() {
    const done = active().done || {}, solved = solvedSet();
    const met = new Set(Object.keys(done).filter(k => done[k] && k.startsWith('l:')).map(k => k.split(':').slice(2).join(':')));
    (NC || []).forEach(q => { if (solved.has(q.slug)) met.add(q.pattern); });
    const skip = new Set(active().skip || []);
    TEMPLATE.forEach((part, k) => { if (part.topics?.length && !part.mock && part.topics.every(t => met.has(t))) skip.add(k); });
    return [...skip];
  }
  function replan() {
    const p = active();
    p.skip = coveredParts();
    p.start = ymd(today());
    p.picks = {};
    // Day-indexed ticks (l:/d:/g:/m:/f:/b:) belong to the old calendar; problem
    // ticks (p:<slug>) stay, they are about the problem not the day.
    p.done = Object.fromEntries(Object.entries(p.done || {}).filter(([k]) => k.startsWith('p:')));
    S.replanSeen = ymd(today());
    save(); selDay = null; render();
    window.QF?.toast?.('Re-planned: the days left now cover everything you have not done yet.');
  }
  /** Core = the ~60-minute loop that makes a day count; the rest is stretch. */
  function splitDay(tasks) {
    const core = [], stretch = [];
    let learn = 0, probs = 0;
    for (const x of tasks) {
      if (x.kind === 'learn') (learn++ < 1 ? core : stretch).push(x);
      else if (x.kind === 'problem') (probs++ < 2 ? core : stretch).push(x);
      else if (x.kind === 'flash') stretch.push(x);
      else core.push(x);
    }
    return { core, stretch };
  }

  // -------------------------------------------------------------- render --
  let selDay = null;
  function root() {
    let el = $('qfSprint');
    if (!el) {
      // Inside the Home layout, above the original Home content, so both
      // scroll together and show and hide with the tab.
      el = document.createElement('section');
      el.id = 'qfSprint'; el.setAttribute('aria-label', 'Today');
      const hm = $('hmLayout');
      if (hm) hm.prepend(el); else document.body.appendChild(el);
    }
    return el;
  }

  async function render() {
    // STAR answers saved before they were logged to History get their row once.
    if (window.History && S.star.some(x => !x.hid)) { S.star.forEach(x => { if (!x.hid) logStar(x); }); save(); }
    const el = root();
    if (!NC) { el.innerHTML = '<div class="qf-sp"><p class="qf-muted">Loading your plan…</p></div>'; await data(); }
    if (!NC) {
      el.innerHTML = `<div class="qf-sp"><div class="qf-card qf-err" role="alert"><h2>Could not load your plan</h2>
        <p class="qf-muted">${esc(loadErr || 'Network error')}. Your progress is safe.</p><button type="button" class="qf-b pri" id="qfRetry">Try again</button></div></div>`;
      $('qfRetry').onclick = () => render();
      return;
    }
    const t = target(), left = daysLeft(), days = plan();
    const idx = Math.max(0, Math.min(days.length - 1, Math.round((today() - parseYmd(active().start)) / DAY)));
    if (selDay == null || selDay >= days.length) selDay = idx;
    const day = days[selDay];
    const allTasks = days.flatMap(tasksFor);
    const doneN = allTasks.filter(isDone).length;
    const ready = readiness();
    const overall = Math.round(ready.reduce((a, r) => a + r.pct, 0) / ready.length);
    const due = dueCards().length;
    const tasks = tasksFor(day);
    const { core, stretch } = splitDay(tasks);
    const next = core.find(x => !isDone(x)) || stretch.find(x => !isDone(x));
    // The hero button is about TODAY, whichever day is being browsed below.
    const todaySplit = splitDay(tasksFor(days[idx]));
    const heroNext = todaySplit.core.find(x => !isDone(x)) || todaySplit.stretch.find(x => !isDone(x));
    const missed = days.filter(d => d.i < idx && d.weight && !tasksFor(d).some(isDone)).length;
    const showReplan = missed > 0 && S.replanSeen !== ymd(today());
    const coreMin = core.reduce((a, x) => a + ({ learn: 5, problem: 20, drill: 3, mock: 45, star: 5, bmock: 25, flash: 5 }[x.kind] || 5), 0);
    const name = (window.QF?.user?.name || '').split(' ')[0];

    el.innerHTML = `
    <div class="qf-sp">
      <section class="qf-hero qf-card">
        <div class="qf-hero-main">
          <p class="qf-eyebrow">${esc(t.company)} · ${esc(t.level)} ${esc(t.role)} · ${esc(fmt(parseYmd(t.date), { weekday: 'long', day: 'numeric', month: 'long' }))}</p>
          <h1>${left > 0 ? `${name ? esc(name) + ', ' : ''}<span class="qf-big">${left}</span> day${left === 1 ? '' : 's'} to your interview` : left === 0 ? 'Interview day. You are ready.' : 'Interview done — how did it go?'}</h1>
          <p class="qf-muted">Day ${idx + 1} of ${days.length}: <b>${esc(days[idx].title)}</b>. ${heroNext ? `Next up: ${esc(heroNext.label)}.` : ''}</p>
          <div class="qf-hero-act">
            <button type="button" class="qf-b pri" id="qfNext">${heroNext ? 'Start next task' : 'All done today — drill'}</button>
            <button type="button" class="qf-b" id="qfEditTarget">Plans &amp; your week</button>
          </div>
        </div>
        <dl class="qf-stats">
          <div><dt>Readiness</dt><dd>${overall}%</dd><div class="qf-bar" aria-hidden="true"><i style="width:${overall}%"></i></div></div>
          <div><dt>Plan done</dt><dd>${doneN}/${allTasks.length}</dd><div class="qf-bar" aria-hidden="true"><i style="width:${allTasks.length ? Math.round(100 * doneN / allTasks.length) : 0}%"></i></div></div>
          <div><dt>Streak</dt><dd>${streak()} day${streak() === 1 ? '' : 's'}</dd></div>
          <div><dt>Cards due</dt><dd>${due}</dd></div>
        </dl>
      </section>

      ${showReplan ? `<div class="qf-replan" role="status"><span>You missed ${missed} day${missed === 1 ? '' : 's'}. Re-plan the ${left} day${left === 1 ? '' : 's'} left so every pattern you have not covered still fits?</span>
        <button type="button" class="qf-b pri" id="qfReplan">Re-plan</button><button type="button" class="qf-b" id="qfReplanNo">Keep as is</button></div>` : ''}

      <nav class="qf-days" aria-label="Sprint days">
        ${days.map(d => {
          const ts = tasksFor(d), dn = ts.filter(isDone).length;
          const st = dn === ts.length && ts.length ? 'done' : d.i < idx ? 'behind' : d.i === idx ? 'today' : '';
          return `<button type="button" class="qf-day ${st}${d.i === selDay ? ' sel' : ''}" data-day="${d.i}" aria-pressed="${d.i === selDay}"
            aria-label="Day ${d.i + 1}, ${esc(fmt(d.date))}, ${esc(DAY_TYPES[d.type].label)}: ${esc(d.title)}, ${dn} of ${ts.length} done">
            <span class="qf-day-n">${d.i === idx ? 'Today' : `Day ${d.i + 1}`}</span><span class="qf-day-d">${esc(fmt(d.date, { day: 'numeric', month: 'short' }))}</span>
            <span class="qf-day-t">${esc(d.title)}</span><span class="qf-day-k k-${d.type}">${esc(DAY_TYPES[d.type].short)}${S.overrides[ymd(d.date)] ? ' *' : ''}</span><span class="qf-day-p">${dn}/${ts.length}${st === 'done' ? ' ✓' : ''}</span></button>`;
        }).join('')}
      </nav>

      <div class="qf-grid">
        <section class="qf-card qf-today" aria-labelledby="qfDayTitle">
          <div class="qf-sec-head"><h2 id="qfDayTitle">${selDay === idx ? 'Today' : `Day ${selDay + 1}`} · ${esc(day.title)}</h2>
            <label class="qf-daytype"><span>${esc(fmt(day.date))} is a</span>
              <select id="qfDayType" aria-label="Kind of day for ${esc(fmt(day.date))}">
                ${Object.entries(DAY_TYPES).map(([k, v]) => `<option value="${k}" ${day.type === k ? 'selected' : ''}>${esc(v.label)}</option>`).join('')}
              </select></label></div>
          <p class="qf-muted qf-daytype-hint">${esc(DAY_TYPES[day.type].hint)}${day.review ? ' · Revision day: no new topic, consolidate the last one.' : ''}</p>
          ${day.topics.length ? `<div class="qf-cue-row">${day.topics.map(p => `<button type="button" class="qf-cue-chip" data-cue="${esc(p)}">${esc(p)} primer</button>`).join('')}</div>` : ''}
          <p class="qf-loop-head"><b>Today's loop</b> · about ${coreMin} min · ${core.filter(isDone).length} of ${core.length} done</p>
          <ul class="qf-tasks qf-core">
            ${core.map(x => `
              <li class="qf-task${isDone(x) ? ' done' : ''}">
                <input type="checkbox" id="t_${esc(x.id)}" data-tick="${esc(x.id)}" ${isDone(x) ? 'checked' : ''}>
                <label for="t_${esc(x.id)}"><span class="qf-task-l">${esc(x.label)}</span><span class="qf-task-s">${esc(x.sub)}</span></label>
                <button type="button" class="qf-b sm${x === next ? ' pri' : ''}" data-go="${esc(x.id)}">${({ learn: 'Read', problem: 'Solve', drill: 'Drill', mock: 'Start mock', star: 'Practise', bmock: 'Start', flash: 'Review' })[x.kind]}</button>
              </li>`).join('')}
          </ul>
          ${stretch.length ? `<details class="qf-stretch"${stretch.some(isDone) ? ' open' : ''}><summary>Stretch, if you have time (${stretch.filter(isDone).length}/${stretch.length})</summary>
          <ul class="qf-tasks">
            ${stretch.map(x => `
              <li class="qf-task${isDone(x) ? ' done' : ''}">
                <input type="checkbox" id="t_${esc(x.id)}" data-tick="${esc(x.id)}" ${isDone(x) ? 'checked' : ''}>
                <label for="t_${esc(x.id)}"><span class="qf-task-l">${esc(x.label)}</span><span class="qf-task-s">${esc(x.sub)}</span></label>
                <button type="button" class="qf-b sm${x === next ? ' pri' : ''}" data-go="${esc(x.id)}">${({ learn: 'Read', problem: 'Solve', drill: 'Drill', mock: 'Start mock', star: 'Practise', bmock: 'Start', flash: 'Review' })[x.kind]}</button>
              </li>`).join('')}
          </ul></details>` : ''}
        </section>

        <aside class="qf-side">
          <section class="qf-card">
            <h2>Learn fast</h2>
            <p class="qf-muted">Short, interactive loops. Do one between problems.</p>
            <div class="qf-drills">
              <button type="button" class="qf-drill" id="qfDrillBtn"><b>Pattern drill</b><span>See a problem, name the pattern. 10 in 2 minutes.</span></button>
              <button type="button" class="qf-drill" id="qfFlashBtn"><b>Recall flashcards <span class="qf-pill${due ? ' hot' : ''}">${due} due</span></b><span>Recall the idea, then check the official solution.</span></button>
              <button type="button" class="qf-drill" id="qfStarBtn"><b>Googleyness STAR</b><span>Two minutes, four boxes, optional AI review.</span></button>
              <button type="button" class="qf-drill" id="qfStoriesBtn"><b>My stories <span class="qf-pill">${(window.QFStories?.read?.() || S.star).length}</span></b><span>Your story bank: every common question, your STAR answers, add / edit / delete.</span></button>
              <button type="button" class="qf-drill" id="qfWatchBtn"><b>Watch a pattern</b><span>Animated walkthroughs of all 18 patterns, step by step.</span></button>
            </div>
          </section>
          <section class="qf-card">
            <div class="qf-sec-head"><h2>Pattern map</h2><span class="qf-pill">goal 70%</span></div>
            <div class="qf-pmap" role="list">
              ${ready.map(r => `<button type="button" role="listitem" class="qf-pm ${r.pct >= 70 ? 'strong' : r.pct > 0 ? 'learning' : 'new'}" data-cue="${esc(r.p)}" title="${esc(r.p)} · ${r.pct}% · ${r.sv}/${r.total} solved · drill ${esc(r.drill)}" aria-label="${esc(r.p)}, ${r.pct} percent">
                <span class="qf-pm-n">${esc(r.p)}</span><span class="qf-pm-p">${r.pct}%</span><i style="width:${Math.max(0, r.pct)}%"></i></button>`).join('')}
            </div>
            <p class="qf-pm-key"><span class="k strong"></span>ready <span class="k learning"></span>learning <span class="k new"></span>not started · tap a pattern for its primer</p>
          </section>
          <section class="qf-card">
            <h2>In the coding round</h2>
            <ol class="qf-steps">
              <li><b>Clarify</b> inputs, sizes, edge cases — out loud.</li>
              <li><b>Approach</b> in words with time and space before typing.</li>
              <li><b>Code</b> clean, real syntax; name things well.</li>
              <li><b>Test</b> by hand, find your own bug, then optimise.</li>
            </ol>
          </section>
        </aside>
      </div>
      <p class="qf-classic-row"><button type="button" class="qf-linkbtn" id="qfClassic" aria-expanded="${document.body.classList.contains('qf-show-classic')}">${document.body.classList.contains('qf-show-classic') ? 'Hide the classic Home' : 'Show the classic Home (recruiter brief, links)'}</button></p>
    </div>`;

    el.querySelectorAll('[data-day]').forEach(b => { b.onclick = () => { selDay = +b.dataset.day; render(); }; });
    el.querySelectorAll('[data-tick]').forEach(c => {
      c.onchange = () => { active().done[c.dataset.tick] = c.checked; if (c.checked) markActive(); save(); render(); };
    });
    el.querySelectorAll('[data-go]').forEach(b => { b.onclick = () => go(tasks.find(x => x.id === b.dataset.go)); });
    el.querySelectorAll('[data-cue]').forEach(b => { b.onclick = () => cue(b.dataset.cue); });
    $('qfNext').onclick = () => (heroNext ? go(heroNext) : drill());
    $('qfReplan')?.addEventListener('click', replan);
    $('qfReplanNo')?.addEventListener('click', () => { S.replanSeen = ymd(today()); save(); render(); });
    $('qfEditTarget').onclick = () => plansModal();
    $('qfDayType').onchange = e => {
      const k = ymd(day.date);
      if (e.target.value === (S.week[day.date.getDay()] || 'wfh')) delete S.overrides[k]; else S.overrides[k] = e.target.value;
      save(); render();
    };
    $('qfDrillBtn').onclick = () => drill();
    $('qfFlashBtn').onclick = () => flash();
    $('qfStarBtn').onclick = () => star();
    $('qfWatchBtn').onclick = () => gallery();
    $('qfStoriesBtn').onclick = () => (window.QFStories ? window.QFStories.open('questions') : stories());
    const cls = $('qfClassic');
    if (cls) cls.onclick = () => { const on = !document.body.classList.contains('qf-show-classic'); document.body.classList.toggle('qf-show-classic', on); cls.setAttribute('aria-expanded', String(on)); cls.textContent = on ? 'Hide the classic Home' : 'Show the classic Home (recruiter brief, links)'; };
    { // centre the chosen day in its strip without scrolling the page
      const strip = el.querySelector('.qf-days'), d = el.querySelector('.qf-day.sel');
      if (strip && d) strip.scrollLeft = d.offsetLeft - strip.offsetLeft - (strip.clientWidth - d.offsetWidth) / 2;
    }
    window.QF?.paintBar?.();
  }

  // ------------------------------------------------------------- actions --
  function openHere(slug, title, queue) {
    // openQuestion prefers a new tab; inside the sprint we want the same one.
    const o = window.open; window.open = () => null;
    try { return window.openQuestion?.(slug, title, queue ? { queue } : undefined); } finally { window.open = o; }
  }
  /** The selected day's problems, so ‹ › in the editor walks today's plan. */
  function dayQueue() {
    const days = plan(), d = days[selDay ?? 0] || days[0];
    const items = d ? tasksFor(d).filter(x => x.kind === 'problem').map(x => ({ slug: x.q.slug, title: x.q.title, difficulty: x.q.difficulty })) : [];
    return items.length ? { key: 'today', label: d.i === Math.round((today() - parseYmd(active().start)) / DAY) ? "Today's plan" : `Day ${d.i + 1} plan`, items } : null;
  }
  const shuffled = a => a.map(x => [Math.random(), x]).sort((a, b) => a[0] - b[0]).map(x => x[1]);

  // The Googleyness mock task ticks itself when a behavioural session is saved.
  let pendingBmock = null;
  window.addEventListener('history-saved', e => {
    if (pendingBmock && e.detail?.type === 'behavioural') { active().done[pendingBmock] = true; pendingBmock = null; markActive(); save(); }
  });
  function go(task) {
    if (!task) return;
    const done = () => { active().done[task.id] = true; markActive(); save(); };
    switch (task.kind) {
      case 'learn': cue(task.topic, () => { done(); render(); }); break;
      case 'problem': markActive(); save(); Promise.resolve(openHere(task.q.slug, task.q.title, dayQueue())).catch(() => { /* openQuestion showed the toast */ }); break;
      case 'drill': drill(task); break;
      case 'mock': {
        // A Medium from the day's topics whose statement actually loads (the
        // premium ones do not), opened in the Coding interview view; the mock
        // starts only once that question is on screen.
        const topics = selDayTopics();
        const med = NC.filter(q => q.difficulty === 'Medium');
        const pool = [...shuffled(med.filter(q => topics.includes(q.pattern))), ...shuffled(med)];
        (async () => {
          let q = null;
          for (const c of pool.slice(0, 12)) if (!/Statement unavailable/.test(await statement(c.slug))) { q = c; break; }
          q ||= NC.find(x => x.slug === 'two-sum') || NC[0];
          if (window.QFCoding) window.QFCoding.keep = true;
          let ok;
          try { ok = await openHere(q.slug, q.title); } catch { return; } finally { if (window.QFCoding) window.QFCoding.keep = false; }
          window.QFCoding?.setFlavour?.('interview');
          if (ok === false) return;
          const b = $('startBtn'); if (b && !b.disabled) b.click();
          // Ticked only once the mock is really running (the mode dialog can be cancelled).
          for (let i = 0; i < 120; i++) { await new Promise(r => setTimeout(r, 500)); if (window.QF_SESSION?.running) { done(); break; } }
        })();
        break;
      }
      case 'star': star(task.gq, task); break;
      case 'bmock': pendingBmock = task.id; $('modeBehavioural')?.click(); setTimeout(() => document.querySelector('#bvCats .bv-cat[data-id="googleyness"]')?.click(), 600); break;
      case 'flash': flash(task); break;
    }
  }
  const selDayTopics = () => (plan()[selDay] || {}).topics || [];

  // ---------------------------------------------------------------- modal --
  function modal(title, body, { wide = false } = {}) {
    window.QFDesign?.closeModal?.();
    const back = document.createElement('div');
    back.className = 'qf-modal-back'; back.id = 'qfModal';
    back.innerHTML = `<div class="qf-modal${wide ? '' : ' qf-narrow'}" role="dialog" aria-modal="true" aria-labelledby="qfMTitle">
      <div class="qf-modal-head"><h2 id="qfMTitle">${title}</h2><button type="button" class="qf-x" data-close aria-label="Close">✕</button></div>
      <div id="qfMBody">${body}</div></div>`;
    document.body.appendChild(back);
    back.addEventListener('click', e => { if (e.target === back || e.target.closest('[data-close]')) close(); });
    back.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
    setTimeout(() => (back.querySelector('#qfMBody button, #qfMBody input, #qfMBody textarea') || back.querySelector('.qf-x'))?.focus(), 20);
    return back;
  }
  function close() { $('qfModal')?.remove(); planButton(); if (document.body.dataset.mode === 'home') render(); }

  function cueHtml(p) {
    const c = CUES[p]; if (!c) return '';
    return `<dl class="qf-cue">
      <div><dt>When you see</dt><dd>${esc(c.see)}</dd></div>
      <div><dt>Do this</dt><dd>${esc(c.do)}</dd></div>
      <div><dt>Complexity</dt><dd>${esc(c.o)}</dd></div>
      <div><dt>Common slip</dt><dd>${esc(c.slip)}</dd></div></dl>`;
  }
  function cue(p, onDone) {
    const m = modal(`${esc(p)} — pattern primer`, `<div id="qfAnimBox"></div>${cueHtml(p)}
      <div class="qf-m-act">
        <button type="button" class="qf-b pri" id="qfCueOk">Got it</button>
        <button type="button" class="qf-b" id="qfCueLearn">Open the full lesson in Learn</button>
      </div>`);
    if (!window.QFAnim?.mount(m.querySelector('#qfAnimBox'), p)) m.querySelector('#qfAnimBox').remove();
    m.querySelector('.qf-modal').classList.remove('qf-narrow');
    m.querySelector('#qfCueOk').onclick = () => { onDone?.(); close(); };
    m.querySelector('#qfCueLearn').onclick = () => {
      onDone?.(); m.remove(); $('modeLearn')?.click();
      setTimeout(() => window.Learn?.openPattern?.(LEARN_ID[p] || 'hash-map'), 150);
    };
  }

  // The STAR reviewer's verdict, as something a person can read.
  function starReviewHtml(b) {
    const o = b.overall || {}, a = (b.answers || [])[0];
    if (!a && o.score == null) return '<p class="qf-fb no">The reviewer returned nothing usable. Try again.</p>';
    const parts = [['situation', 'Situation'], ['task', 'Task'], ['action', 'Action'], ['result', 'Result'], ['reflection', 'Reflection']];
    return `<div class="qf-fb ok qf-star-rev">
      ${o.score != null ? `<p class="qf-star-score"><b>${o.score}/10</b> ${a?.verdict ? `· ${esc(a.verdict)}` : ''}</p>` : ''}
      ${o.summary ? `<p>${esc(o.summary)}</p>` : ''}
      ${a ? `<ul class="qf-star-parts">${parts.map(([k, l]) => `<li class="${a[k]?.present ? 'yes' : 'no'}"><b>${a[k]?.present ? '✓' : '✕'} ${l}</b>${a[k]?.note ? ` — ${esc(a[k].note)}` : ''}</li>`).join('')}</ul>` : ''}
      ${a?.fix ? `<p><b>Fix:</b> ${esc(a.fix)}</p>` : ''}
      ${b.model ? `<p class="qf-muted">Reviewed by ${esc(b.model)}</p>` : ''}
    </div>`;
  }

  // Every saved STAR answer, grouped by question, with coverage of the Googleyness set.
  function stories() {
    const by = new Map();
    for (const x of S.star) { if (!by.has(x.q)) by.set(x.q, []); by.get(x.q).push(x); }
    const covered = GQ.filter(q => by.has(q)).length;
    const m = modal('My stories', `
      <p class="qf-muted">${S.star.length} saved answer${S.star.length === 1 ? '' : 's'} · ${covered} of ${GQ.length || 12} Googleyness questions covered.</p>
      <div class="qf-bar" aria-hidden="true"><i style="width:${GQ.length ? Math.round(100 * covered / GQ.length) : 0}%"></i></div>
      ${by.size ? `<ul class="qf-stories">${[...by.entries()].reverse().map(([q, xs]) => {
        const x = xs[xs.length - 1];
        return `<li><b>${esc(q)}</b><span class="qf-muted">${xs.length} version${xs.length === 1 ? '' : 's'} · ${esc(new Date(x.at).toLocaleDateString())}</span>
          ${x.text ? `<p class="qf-pre">${esc(x.text)}</p><span class="qf-pill">Google-ready version from a mock</span>` : `<p><b>S</b> ${esc(x.s || '—')}</p><p><b>T</b> ${esc(x.t || '—')}</p><p><b>A</b> ${esc(x.a || '—')}</p><p><b>R</b> ${esc(x.r || '—')}</p>`}
          <div class="qf-m-act"><button type="button" class="qf-b sm" data-q="${esc(q)}">Practise again</button></div></li>`;
      }).join('')}</ul>` : '<p>No answers yet. Start with today’s Googleyness question.</p>'}
      ${GQ.filter(q => !by.has(q)).length ? `<h3>Not answered yet</h3><ul class="qf-todo">${GQ.filter(q => !by.has(q)).map(q => `<li><button type="button" class="qf-linkbtn" data-q="${esc(q)}">${esc(q)}</button></li>`).join('')}</ul>` : ''}`, { wide: true });
    m.querySelectorAll('[data-q]').forEach(b => { b.onclick = () => star(b.dataset.q); });
  }

  // Every animation in one place, in plan order.
  function gallery() {
    const m = modal('Watch a pattern', `<div class="qf-cue-row" role="group" aria-label="Pattern">${PATTERNS.map(p => `<button type="button" class="qf-cue-chip" data-pat="${esc(p)}">${esc(p)}</button>`).join('')}</div><div id="qfGal"></div><button type="button" class="qs-open qs-topic-btn" id="qfGalShorts" hidden>🎬 Watch this topic as Shorts</button><div id="qfGalCue"></div>`, { wide: true });
    const show = p => {
      m.querySelectorAll('[data-pat]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.pat === p)));
      window.QFAnim?.mount(m.querySelector('#qfGal'), p);
      m.querySelector('#qfGalCue').innerHTML = cueHtml(p);
      const gs = m.querySelector('#qfGalShorts'); if (gs) { gs.dataset.shortTopic = p; gs.innerHTML = `🎬 Watch ${esc(p)} as Shorts <small>2–3 min each</small>`; gs.hidden = !window.QFShorts; }
    };
    m.querySelectorAll('[data-pat]').forEach(b => { b.onclick = () => show(b.dataset.pat); });
    show(selDayTopics()[0] || PATTERNS[0]);
  }

  // The statement and its first example, trimmed, so the drill is answerable
  // from the problem itself rather than from remembering the title.
  const stmtCache = {};
  async function statement(slug) {
    if (stmtCache[slug]) return stmtCache[slug];
    try {
      const r = await fetch(`/api/question/${encodeURIComponent(slug)}`);
      if (!r.ok) throw new Error();
      const q = await r.json();
      const div = document.createElement('div'); div.innerHTML = q.content || '';
      div.querySelectorAll('img, script, style').forEach(x => x.remove());
      const kids = [...div.children];
      const ex = kids.findIndex(el => /Example\s*1/i.test(el.textContent));
      const desc = (ex > 0 ? kids.slice(0, ex) : kids.slice(0, 3)).map(el => el.textContent.trim()).filter(Boolean).join('\n\n');
      const pre = div.querySelector('pre')?.textContent.trim() || '';
      const html = `<p class="qf-pre">${esc(desc.slice(0, 700))}${desc.length > 700 ? '…' : ''}</p>${pre ? `<pre class="qf-drill-ex">${esc(pre.slice(0, 400))}</pre>` : ''}`;
      return (stmtCache[slug] = html);
    } catch { return '<p class="qf-muted">Statement unavailable — go by the title.</p>'; }
  }

  // Pattern drill: name the pattern from the problem itself.
  async function drill(task) {
    await data();
    const focus = selDayTopics();
    const pool = NC.filter(q => q.pattern && CUES[q.pattern]);
    const pick = [];
    const focusPool = pool.filter(q => focus.includes(q.pattern));
    const m = modal('Pattern drill', '<p class="qf-muted">Picking ten problems…</p>');
    const body = m.querySelector('#qfMBody');
    // Only problems whose statement we can show: the drill is answered from
    // the problem, not from remembering a title.
    const order = [...shuffled(focusPool), ...shuffled(pool)].filter((q, k, a) => a.indexOf(q) === k);
    for (let k = 0; k < order.length && pick.length < 10; k += 6) {
      const batch = order.slice(k, k + 6);
      const ok = await Promise.all(batch.map(q => statement(q.slug).then(h => !/Statement unavailable/.test(h))));
      batch.forEach((q, j) => { if (ok[j] && pick.length < 10) pick.push(q); });
      if (!document.body.contains(body)) return;
    }
    if (!pick.length) { body.innerHTML = '<p class="bv-err">Could not load problems for the drill. Try again in a moment.</p>'; return; }
    let i = 0, right = 0;
    const ask = () => {
      if (i >= pick.length) {
        if (task) { active().done[task.id] = true; }
        markActive(); save();
        body.innerHTML = `<p class="qf-drill-score"><b>${right}/${pick.length}</b> correct</p>
          <p class="qf-muted">${right >= 8 ? 'Strong — your pattern recognition is interview-ready.' : right >= 5 ? 'Good. Re-read the primers for the ones you missed.' : 'Read today’s primers, then try again — this improves fast.'}</p>
          <div class="qf-m-act"><button type="button" class="qf-b pri" id="qfAgain">Another round</button><button type="button" class="qf-b" data-close>Done</button></div>`;
        body.querySelector('#qfAgain').onclick = () => drill(task);
        body.querySelector('#qfAgain').focus();
        return;
      }
      const q = pick[i];
      const opts = shuffled([q.pattern, ...shuffled(PATTERNS.filter(p => p !== q.pattern)).slice(0, 3)]);
      body.innerHTML = `<p class="qf-muted">Question ${i + 1} of ${pick.length} · ${right} right</p>
        <div class="qf-bar" aria-hidden="true"><i style="width:${100 * i / pick.length}%"></i></div>
        <p class="qf-q">${esc(q.title)} <span class="qf-pill">${esc(q.difficulty)}</span></p>
        <div class="qf-drill-stmt" id="qfDrillStmt"><p class="qf-muted">Loading the problem…</p></div>
        <p class="qf-muted">Which pattern solves it best?</p>
        <div class="qf-opts">${opts.map(o => `<button type="button" class="qf-opt" data-o="${esc(o)}">${esc(o)}</button>`).join('')}</div>
        <div id="qfFb" aria-live="polite"></div>`;
      statement(q.slug).then(html => { const el = body.querySelector('#qfDrillStmt'); if (el) el.innerHTML = html; });
      body.querySelectorAll('[data-o]').forEach(b => {
        b.onclick = () => {
          const ok = b.dataset.o === q.pattern;
          const st = S.drill[q.pattern] || [0, 0]; st[1]++; if (ok) { st[0]++; right++; } S.drill[q.pattern] = st;
          body.querySelectorAll('[data-o]').forEach(x => {
            x.disabled = true;
            if (x.dataset.o === q.pattern) x.classList.add('right');
            else if (x === b) x.classList.add('wrong');
          });
          body.querySelector('#qfFb').innerHTML = `<p class="qf-fb ${ok ? 'ok' : 'no'}"><b>${ok ? '✓ Correct.' : `✕ It’s ${esc(q.pattern)}.`}</b> ${esc(CUES[q.pattern].see)}</p>
            <button type="button" class="qf-b pri" id="qfNextQ">${i + 1 < pick.length ? 'Next' : 'See score'}</button>`;
          const n = body.querySelector('#qfNextQ'); n.onclick = () => { i++; ask(); }; n.focus();
        };
      });
      body.querySelector('[data-o]')?.focus();
    };
    ask();
  }

  // Spaced recall: Leitner boxes. A card becomes due again after 1, 2, 4, 8… days.
  function dueCards() {
    if (!NC) return [];
    const now = Date.now();
    const learnt = solvedSet();
    // Topics reached by today (not by whichever day is being browsed), so the
    // count does not jump around while you look at future days.
    // Only patterns you have actually met (primer read, or a problem of it
    // solved): recall works on what was learnt, not on what is merely scheduled.
    const done = active().done || {};
    const topics = new Set(Object.keys(done).filter(k => done[k] && k.startsWith('l:')).map(k => k.split(':').slice(2).join(':')));
    NC.forEach(q => { if (learnt.has(q.slug)) topics.add(q.pattern); });
    return NC.filter(q => learnt.has(q.slug) || topics.has(q.pattern))
      .filter(q => q.hasSolution)
      .filter(q => !S.cards[q.slug] || S.cards[q.slug].due <= now)
      ;
  }
  async function flash(task) {
    await data();
    const cards = dueCards().slice(0, 20);
    const m = modal('Recall flashcards', '', { wide: true });
    const body = m.querySelector('#qfMBody');
    if (!cards.length) { if (task) { active().done[task.id] = true; markActive(); save(); }
      body.innerHTML = '<p>Nothing due. Solve a few problems or come back tomorrow.</p><div class="qf-m-act"><button type="button" class="qf-b pri" data-close>Close</button></div>'; return; }
    let i = 0;
    const show = () => {
      if (i >= cards.length) {
        if (task) active().done[task.id] = true;
        markActive(); save();
        body.innerHTML = `<p class="qf-drill-score"><b>${cards.length}</b> cards reviewed</p><div class="qf-m-act"><button type="button" class="qf-b pri" data-close>Done</button></div>`;
        return;
      }
      const q = cards[i];
      body.innerHTML = `<p class="qf-muted">Card ${i + 1} of ${cards.length}</p>
        <p class="qf-q">${esc(q.title)} <span class="qf-pill">${esc(q.difficulty)}</span></p>
        <p>Before you reveal: say the <b>pattern</b>, the <b>key idea</b> in one sentence, and the <b>time/space</b>.</p>
        <button type="button" class="qf-b pri" id="qfReveal">Reveal answer</button>
        <div id="qfAns" hidden></div>`;
      const reveal = body.querySelector('#qfReveal');
      reveal.focus();
      reveal.onclick = async () => {
        reveal.remove();
        const ans = body.querySelector('#qfAns'); ans.hidden = false;
        ans.innerHTML = `<p><b>Pattern:</b> ${esc(q.pattern)}</p>${cueHtml(q.pattern)}<p class="qf-muted">Loading the official solution…</p>`;
        let code = '';
        try { code = (await fetch(`/api/neetcode/solution/${encodeURIComponent(q.slug)}`).then(r => r.json())).solution || ''; } catch { /* offline */ }
        ans.innerHTML = `<p><b>Pattern:</b> ${esc(q.pattern)} — ${esc(CUES[q.pattern]?.do || '')}</p>
          ${code ? `<pre class="qf-code"><code>${esc(code)}</code></pre>` : ''}
          <p class="qf-muted">How well did you recall it?</p>
          <div class="qf-opts qf-grade">
            <button type="button" class="qf-opt" data-g="0">Again <small>today</small></button>
            <button type="button" class="qf-opt" data-g="1">Hard <small>tomorrow</small></button>
            <button type="button" class="qf-opt" data-g="2">Good <small>later</small></button>
            <button type="button" class="qf-opt" data-g="3">Easy <small>much later</small></button>
          </div>`;
        ans.querySelectorAll('[data-g]').forEach(b => {
          b.onclick = () => {
            const g = +b.dataset.g, c = S.cards[q.slug] || { box: 0 };
            c.box = g === 0 ? 0 : g === 1 ? Math.max(1, c.box) : c.box + g - 1;
            c.due = g === 0 ? Date.now() + 10 * 60e3 : Date.now() + Math.pow(2, c.box) * DAY / (g === 1 ? 2 : 1);
            S.cards[q.slug] = c; save(); i++; show();
          };
        });
        ans.querySelector('[data-g="2"]').focus();
      };
    };
    show();
  }

  // STAR: four boxes against a two-minute clock, saved to the account.
  // Every save is a new version — nothing is overwritten or dropped. The AI
  // review and the 10/10 rewrite are kept with the version they were made
  // for, shown again when the question is reopened, and logged to History.
  const STAR_PARTS = [['situation', 'Situation'], ['task', 'Task'], ['action', 'Action'], ['result', 'Result'], ['reflection', 'Reflection']];
  const sameAnswer = (x, v) => !!x && ['s', 't', 'a', 'r'].every(k => (x[k] || '') === (v[k] || ''));
  const gapMark = t => esc(t).replace(/\[([^\]]+)\]/g, '<mark class="bk-gap">[$1]</mark>');
  const gapsOf = rw => [...new Set(STAR_PARTS.flatMap(([k]) => String(rw?.[k] || '').match(/\[[^\]]+\]/g) || []))];
  /** Save an answer for a question as a new STAR version (or return the identical latest one). */
  function addStarVersion(q, v, extra = {}) {
    const latest = S.star.filter(s => s.q === q).slice(-1)[0];
    if (sameAnswer(latest, v)) return latest;
    const x = { q, ...v, at: Date.now(), ...extra };
    S.star.push(x);
    window.QFStories?.upsert?.({ title: (v.s || v.a || '').split(/(?<=[.!?])\s/)[0].slice(0, 90), situation: v.s, task: v.t, action: v.a, result: v.r, questions: [q], source: 'star', migratedAt: x.at });
    logStar(x); save();
    return x;
  }
  function logStar(x) {
    const H = window.History;
    if (!H) return;
    const fields = { answer: { s: x.s, t: x.t, a: x.a, r: x.r }, review: x.review || null, rewrite: x.rewrite || null };
    if (x.hid && H.update?.(x.hid, fields)) return;
    x.hid = H.save({ type: 'star', category: 'Today · Googleyness STAR', question: x.q, startedAt: x.at, endedAt: x.at, durationSec: 0, ...fields });
  }
  // Same answer again: say so and show what is saved, rather than asking the model twice.
  const already = (what, x) => `<p class="qf-fb warn">⚠ This exact answer already has ${what} (saved ${esc(new Date(x.at).toLocaleString())}), so it was not sent again. Change the answer to get a new one.</p>`;
  /** Your answer beside the 10/10 version, one STAR part per row. */
  function cmpHtml(mine, rw, heads = ['What you submitted', 'What it should look like']) {
    const yours = { situation: mine?.s, task: mine?.t, action: mine?.a, result: mine?.r };
    return `<div class="qf-star-cmp"><span class="qf-star-cmp-h">${heads[0]}</span><span class="qf-star-cmp-h">${heads[1]}</span>
      ${STAR_PARTS.map(([k, l]) => (rw?.[k] || yours[k] ? `<div class="qf-star-cmp-mine"><b>${l}</b> ${yours[k] ? esc(yours[k]) : '<i class="qf-muted">— missing</i>'}</div>
        <div class="qf-star-cmp-best"><b>${l}</b> ${rw ? gapMark(rw[k] || '') : '<i class="qf-muted">—</i>'}</div>` : '')).join('')}</div>`;
  }
  // Which model wrote and checked what, for the record.
  const byLine = (x) => [
    x.review && `Feedback ${x.review.overall?.score ?? '?'}/10 by ${esc(x.review.model || 'model not recorded')}`,
    x.rewrite && `10/10 version written by ${esc(x.rewrite.model || 'model not recorded')}${x.rewrite.score != null ? `, checked ${x.rewrite.score}/10 by ${esc(x.rewrite.review?.model || 'model not recorded')}` : ''}`,
  ].filter(Boolean).join(' · ');
  function rewriteHtml(d, mine) {
    const rw = d.rewrite || {}, gaps = gapsOf(rw);
    return `<div class="qf-fb ok qf-star-rw">
      <p class="qf-star-score"><b>✦ Your answer, framed for 10/10</b>${d.score != null ? ` · reviewer <b>${d.score}/10</b>` : ''}</p>
      ${cmpHtml(mine, rw)}
      ${gaps.length ? `<div class="qf-star-gaps"><p><b>Only you know ${gaps.length === 1 ? 'this' : 'these'}.</b> Fill ${gaps.length === 1 ? 'it' : 'them'} in with the real figure — that is what takes the Result to 10/10.</p>
        ${gaps.map((g, i) => `<label class="qf-field"><span>${esc(g.slice(1, -1))}</span><input data-gap="${i}" autocomplete="off"></label>`).join('')}</div>` : ''}
      ${rw.changes?.length ? `<details><summary>What changed from your version</summary><ul>${rw.changes.map(c => `<li>${esc(c)}</li>`).join('')}</ul></details>` : ''}
      <div class="qf-m-act">
        ${gaps.length ? '<button type="button" class="qf-b" data-rw="check">Fill in and re-check</button>' : ''}
        <button type="button" class="qf-b pri" data-rw="use">Save as my new version</button>
      </div>
      <p class="qf-muted">Your own answer stays saved; this is added as another version.${d.model ? ` Written by ${esc(d.model)}${d.review?.model ? `, checked by ${esc(d.review.model)}` : ''}.` : ''}</p>
    </div>`;
  }

  async function star(question, task) {
    await data();
    const q = question || (GQ.length ? GQ[Math.floor(Math.random() * GQ.length)] : 'Tell me about a time you helped a teammate who was struggling.');
    S.starDraft ||= {};
    const versions = () => S.star.filter(s => s.q === q);
    const last = versions().slice(-1)[0];
    const prev = S.starDraft[q] || last || {};
    const n = versions().length;
    const m = modal('Googleyness · STAR practice', `
      <p class="qf-q">${esc(q)}</p>
      <div class="qf-star-tabs" role="tablist">
        <button type="button" role="tab" data-tab="answer" aria-selected="true">Answer</button>
        <button type="button" role="tab" data-tab="hist" aria-selected="false">History (<span id="qfStarHistN">${n}</span>)</button>
      </div>
      <div id="qfStarHist" data-pane="hist" hidden></div>
      <div data-pane="answer">
      ${n ? `<p class="qf-star-saved">✓ You have answered this ${n === 1 ? 'once' : `${n} times`} — your latest saved answer is filled in below${S.starDraft[q] ? ', with the edits you had not saved yet' : ''}.
        ${n > 1 ? `<span class="qf-pager" aria-label="Saved versions">${versions().map((x, i) => `<button type="button" data-ver="${i}" title="${esc(new Date(x.at).toLocaleString())}">${i + 1}</button>`).join('')}</span>` : ''}</p>` : ''}
      <p class="qf-muted">Google listens for: working well with others, comfort with ambiguity, doing the right thing for users, humility and growth. Keep it to about two minutes spoken.</p>
      <p class="qf-timer" id="qfStarClock" aria-live="off">2:00</p>
      <form id="qfStarForm" class="qf-star">
        ${[['s', 'Situation', 'Where, when, what was at stake — one or two sentences.'], ['t', 'Task', 'What you specifically had to do.'], ['a', 'Action', 'What YOU did, step by step. Use “I”, not “we”.'], ['r', 'Result', 'The outcome, with a number if you can. What you learnt.']]
          .map(([k, l, h]) => `<label class="qf-field"><span>${l}</span><textarea name="${k}" placeholder="${esc(h)}">${esc(prev[k] || '')}</textarea></label>`).join('')}
        <div class="qf-m-act">
          <button type="submit" class="qf-b pri">Save answer</button>
          <button type="button" class="qf-b" id="qfStarAi">Get AI feedback</button>
          <button type="button" class="qf-b" id="qfStarRewrite" title="Your facts, reframed so every STAR part scores">✦ Frame it for 10/10</button>
          <button type="button" class="qf-b" id="qfStarOther">Another question</button>
        </div>
        <div id="qfStarFb" aria-live="polite"></div>
        <div id="qfStarRw" aria-live="polite"></div>
      </form>
      </div>`, { wide: true });
    let secs = 120; const clock = m.querySelector('#qfStarClock');
    const tick = setInterval(() => {
      if (!document.body.contains(clock)) return clearInterval(tick);
      secs = Math.max(0, secs - 1);
      clock.textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
      clock.classList.toggle('over', secs === 0);
    }, 1000);
    const form = m.querySelector('#qfStarForm');
    const value = () => Object.fromEntries(['s', 't', 'a', 'r'].map(k => [k, form.elements[k].value.trim()]));
    // Typing is kept as a draft, so Escape or a stray click never loses it.
    let dt = 0;
    form.addEventListener('input', () => { clearTimeout(dt); dt = setTimeout(() => { S.starDraft[q] = value(); save(); }, 400); });
    const fb = m.querySelector('#qfStarFb'), rwBox = m.querySelector('#qfStarRw');
    // History tab: every version of this question, newest first — your words,
    // the 10/10 version made from them, the scores, and which model did what.
    const tab = name => m.querySelectorAll('[data-tab]').forEach(b => {
      const on = b.dataset.tab === name;
      b.setAttribute('aria-selected', String(on));
      m.querySelector(`[data-pane="${b.dataset.tab}"]`).hidden = !on;
    });
    const drawHist = () => {
      const vs = versions(), box = m.querySelector('#qfStarHist');
      m.querySelector('#qfStarHistN').textContent = vs.length;
      box.innerHTML = vs.length ? vs.map((x, i) => [x, i]).reverse().map(([x, i]) => `
        <article class="qf-star-ver">
          <div class="qf-star-ver-h"><b>Version ${i + 1}</b><span class="qf-muted">${esc(new Date(x.at).toLocaleString())}${i === vs.length - 1 ? ' · latest' : ''}</span>
            <button type="button" class="qf-b sm" data-load="${i}">Load into the boxes</button></div>
          ${cmpHtml(x, x.rewrite?.rewrite, ['My answer', x.rewrite ? `Best version${x.rewrite.score != null ? ` · ${x.rewrite.score}/10` : ''}` : 'Best version'])}
          ${x.rewrite ? '' : '<p class="qf-muted">No 10/10 version yet — load it and press ✦ Frame it for 10/10.</p>'}
          ${byLine(x) ? `<p class="qf-muted qf-star-by">${byLine(x)}</p>` : ''}
        </article>`).join('') : '<p class="qf-muted">No saved answers for this question yet. Save one in the Answer tab.</p>';
      box.querySelectorAll('[data-load]').forEach(b => {
        b.onclick = () => {
          const x = vs[+b.dataset.load];
          for (const k of ['s', 't', 'a', 'r']) form.elements[k].value = x[k] || '';
          tab('answer'); showSaved(x);
        };
      });
    };
    m.querySelectorAll('[data-tab]').forEach(b => { b.onclick = () => { if (b.dataset.tab === 'hist') drawHist(); tab(b.dataset.tab); }; });
    const review = (v, model) => fetch('/api/behavioural/star', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: q, model, messages: [{ role: 'assistant', content: q }, { role: 'user', content: `Situation: ${v.s}\nTask: ${v.t}\nAction: ${v.a}\nResult: ${v.r}` }] }) })
      .then(async r => { const b = await r.json().catch(() => ({})); if (!r.ok) throw new Error(b.error || 'review unavailable'); return b; });
    // The answer in the boxes as a saved version: the latest one when unchanged, else a new one.
    const saveVersion = v => {
      clearTimeout(dt);
      const latest = versions().slice(-1)[0];
      if (sameAnswer(latest, v)) { delete S.starDraft[q]; save(); return latest; }
      const x = { q, ...v, at: Date.now() };
      S.star.push(x);
      delete S.starDraft[q];
      window.QFStories?.upsert?.({ title: (v.s || v.a).split(/(?<=[.!?])\s/)[0].slice(0, 90), situation: v.s, task: v.t, action: v.a, result: v.r, questions: [q], source: 'star', migratedAt: x.at });
      if (task) active().done[task.id] = true;
      markActive(); logStar(x); save();
      m.querySelector('#qfStarHistN').textContent = versions().length;
      return x;
    };
    const showRewrite = (x, d, note = '') => {
      rwBox.innerHTML = note + rewriteHtml(d, x);
      const filled = () => {
        const vals = [...rwBox.querySelectorAll('[data-gap]')].map(i => i.value.trim());
        const gaps = gapsOf(d.rewrite);
        return Object.fromEntries(STAR_PARTS.map(([k]) => [k, gaps.reduce((t, g, i) => (vals[i] ? t.split(g).join(vals[i]) : t), d.rewrite[k] || '')]));
      };
      rwBox.querySelector('[data-rw="check"]')?.addEventListener('click', async e => {
        const rw = filled(), btn = e.currentTarget;
        btn.disabled = true; btn.textContent = 'Checking…';
        try {
          const b = await review({ s: rw.situation, t: rw.task, a: rw.action, r: [rw.result, rw.reflection].filter(Boolean).join(' ') }, window.Settings?.modelFor?.('behaviouralScore'));
          x.rewrite = { ...d, rewrite: { ...d.rewrite, ...rw }, score: b.overall?.score ?? d.score, review: b };
          save(); logStar(x); showRewrite(x, x.rewrite);
        } catch (err) { btn.disabled = false; btn.textContent = 'Fill in and re-check'; window.QF?.toast?.(`Could not re-check: ${err.message}`); }
      });
      rwBox.querySelector('[data-rw="use"]').onclick = () => {
        const rw = filled();
        const v = { s: rw.situation, t: rw.task, a: rw.action, r: [rw.result, rw.reflection].filter(Boolean).join(' ') };
        for (const k of ['s', 't', 'a', 'r']) form.elements[k].value = v[k];
        const nx = saveVersion(v);
        // The new version IS the 10/10 answer: carry its check over so the model is never asked about it again.
        nx.review = x.rewrite?.review || nx.review; nx.rewrite = nx.rewrite || x.rewrite; save(); logStar(nx);
        fb.innerHTML = `<p class="qf-fb ok"><b>✓ Saved as version ${versions().length}.</b> Your earlier version${versions().length > 2 ? 's are' : ' is'} still saved — reopen this question to switch between them.</p>`;
      };
    };
    const showSaved = x => {
      fb.innerHTML = x?.review ? starReviewHtml(x.review) : '';
      rwBox.innerHTML = '';
      if (x?.rewrite) showRewrite(x, x.rewrite);
    };
    // Reopened: show the review and rewrite that belong to the answer on screen.
    if (last && sameAnswer(last, prev)) showSaved(last);
    m.querySelectorAll('[data-ver]').forEach(b => {
      b.onclick = () => {
        const x = versions()[+b.dataset.ver];
        for (const k of ['s', 't', 'a', 'r']) form.elements[k].value = x[k] || '';
        m.querySelectorAll('[data-ver]').forEach(o => o.setAttribute('aria-pressed', String(o === b)));
        showSaved(x);
      };
    });
    form.onsubmit = e => {
      e.preventDefault();
      const v = value();
      if (!v.s && !v.a) { fb.innerHTML = '<p class="qf-fb no">Write at least the situation and your actions.</p>'; return; }
      const latest = versions().slice(-1)[0];
      if (sameAnswer(latest, v)) { fb.innerHTML = `<p class="qf-fb warn">⚠ This exact answer is already saved (version ${versions().length}, ${esc(new Date(latest.at).toLocaleString())}) — nothing new to save.</p>`; return; }
      saveVersion(v);
      fb.innerHTML = '<p class="qf-fb ok"><b>✓ Saved.</b> Say it out loud once, then try the AI mock in Interview → Googleyness.</p>';
    };
    m.querySelector('#qfStarOther').onclick = () => star(null, task);
    m.querySelector('#qfStarAi').onclick = async () => {
      const v = value();
      if (!v.s && !v.a) { fb.innerHTML = '<p class="qf-fb no">Write your answer first.</p>'; return; }
      const x = saveVersion(v);
      if (x.review) { fb.innerHTML = already('AI feedback', x) + starReviewHtml(x.review); return; }
      fb.innerHTML = '<p class="qf-muted">Reviewing your answer…</p>';
      try {
        x.review = await review(v, window.Settings?.modelFor?.('behaviouralScore'));
        save(); logStar(x);
        fb.innerHTML = starReviewHtml(x.review);
      } catch (e) { fb.innerHTML = `<p class="qf-fb no">AI feedback is not available right now (${esc(e.message)}).</p>`; }
    };
    m.querySelector('#qfStarRewrite').onclick = async e => {
      const v = value(), btn = e.currentTarget;
      if (!v.s && !v.a) { rwBox.innerHTML = '<p class="qf-fb no">Write your answer first — the rewrite keeps your story and facts.</p>'; return; }
      const x = saveVersion(v);
      if (x.rewrite) { showRewrite(x, x.rewrite, already('a 10/10 version', x)); return; }
      btn.disabled = true;
      rwBox.innerHTML = '<p class="qf-muted">Framing your answer for 10/10 and checking it with the reviewer… about 30–60 seconds.</p>';
      try {
        const r = await fetch('/api/behavioural/star-rewrite', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question: q, answer: v, model: window.Settings?.modelFor?.('starRewrite'), reviewModel: window.Settings?.modelFor?.('behaviouralScore') }) });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || 'rewrite unavailable');
        x.rewrite = d;
        save(); logStar(x);
        showRewrite(x, d);
      } catch (err) { rwBox.innerHTML = `<p class="qf-fb no">Could not frame it right now (${esc(err.message)}).</p>`; }
      btn.disabled = false;
    };
  }

  async function pushTarget(t) {
    // The account keeps the first plan's target, so a new device starts there.
    if (!window.QF?.user || S.plans[0].id !== active().id) return;
    try {
      const r = await fetch('/api/auth/me', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ target: t }) });
      if (r.ok) window.QF.user = (await r.json()).user;
    } catch { /* offline: the plan itself is saved */ }
  }

  function planForm(p, isNew) {
    const t = p ? p.target : { company: 'Google', level: 'L4', role: 'Software Engineer', date: ymd(addDays(today(), 21)) };
    return `<form id="qfPlanForm" class="qf-plan-form">
      <h3>${isNew ? 'New plan' : 'Edit plan'}</h3>
      <div class="qf-row">
        <label class="qf-field"><span>Company</span><input name="company" value="${esc(t.company)}" required maxlength="60"></label>
        <label class="qf-field"><span>Level</span><input name="level" value="${esc(t.level)}" maxlength="20"></label>
      </div>
      <div class="qf-row">
        <label class="qf-field"><span>Role</span><input name="role" value="${esc(t.role)}" maxlength="80"></label>
        <label class="qf-field"><span>Interview date</span><input name="date" type="date" value="${esc(t.date)}" required></label>
      </div>
      ${isNew ? '' : '<label class="qf-check"><input type="checkbox" name="restart"> Restart this plan from today</label>'}
      <p class="qf-auth-err" id="qfPlanErr" role="alert"></p>
      <div class="qf-m-act"><button type="submit" class="qf-b pri">${isNew ? 'Create plan' : 'Save plan'}</button><button type="button" class="qf-b" id="qfPlanCancel">Cancel</button></div>
    </form>`;
  }

  function plansModal(view = 'list', editId = null, keep = null) {
    const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const order = [1, 2, 3, 4, 5, 6, 0];
    const planRow = p => {
      const left = Math.round((parseYmd(p.target.date) - today()) / DAY);
      const on = p.id === active().id;
      return `<li class="qf-plan${on ? ' on' : ''}">
        <div class="qf-plan-main"><b>${esc(p.target.company)} ${esc(p.target.level)}</b>
          <span>${esc(p.target.role)} · ${esc(fmt(parseYmd(p.target.date), { day: 'numeric', month: 'short', year: 'numeric' }))} · ${left > 0 ? `${left} days to go` : left === 0 ? 'today' : 'done'}</span></div>
        <div class="qf-plan-act">
          ${on ? '<span class="qf-pill">Active</span>' : `<button type="button" class="qf-b sm pri" data-use="${p.id}">Switch to</button>`}
          <button type="button" class="qf-b sm" data-edit="${p.id}">Edit</button>
          ${S.plans.length > 1 ? `<button type="button" class="qf-b sm" data-del="${p.id}" aria-label="Delete plan ${esc(p.target.company)} ${esc(p.target.level)}">Delete</button>` : ''}
        </div></li>`;
    };
    const body = view === 'list' ? `
      <section aria-labelledby="qfPlansH">
        <div class="qf-sec-head"><h3 id="qfPlansH">Your plans</h3><button type="button" class="qf-b sm pri" id="qfPlanNew">+ New plan</button></div>
        <ul class="qf-plans">${S.plans.map(planRow).join('')}</ul>
      </section>
      <section aria-labelledby="qfWeekH" class="qf-week-sec">
        <h3 id="qfWeekH">Your week</h3>
        <p class="qf-muted">Tell it how much time each day has. Office days get a light load, days off carry the heavy work and the mocks, rest days have nothing. Change a single date (a holiday, a late meeting) from that day’s card.</p>
        <div class="qf-week">
          ${order.map(d => `<div class="qf-week-row"><span class="qf-week-d">${names[d]}</span>
            <div class="qf-seg" role="group" aria-label="${names[d]}">
              ${Object.entries(DAY_TYPES).map(([k, v]) => `<button type="button" data-wd="${d}" data-wt="${k}" aria-pressed="${(S.week[d] || 'wfh') === k}">${esc(v.short)}</button>`).join('')}
            </div></div>`).join('')}
        </div>
        <ul class="qf-legend">${Object.values(DAY_TYPES).map(v => `<li><b>${esc(v.label)}</b> — ${esc(v.hint)}</li>`).join('')}</ul>
        ${Object.keys(S.overrides).length ? `<p class="qf-muted">${Object.keys(S.overrides).length} single-date change${Object.keys(S.overrides).length === 1 ? '' : 's'}. <button type="button" class="qf-linkbtn" id="qfClearOv">Clear them</button></p>` : ''}
      </section>` : planForm(view === 'edit' ? S.plans.find(p => p.id === editId) : null, view === 'new');
    const m = modal('Plans & your week', body);
    const b = m.querySelector('#qfMBody');
    // Re-render in place: keep the scroll position and the focused control, so
    // setting Friday on a phone does not jump back to the top of the sheet.
    if (keep) setTimeout(() => { m.scrollTop = keep.top; if (keep.sel) m.querySelector(keep.sel)?.focus({ preventScroll: true }); }, 30);
    const rerender = sel => { const top = m.scrollTop; m.remove(); plansModal(view, editId, { top, sel }); };
    b.querySelector('#qfPlanNew')?.addEventListener('click', () => { m.remove(); plansModal('new'); });
    b.querySelectorAll('[data-use]').forEach(x => { x.onclick = () => { S.active = x.dataset.use; selDay = null; save(); rerender(); }; });
    b.querySelectorAll('[data-edit]').forEach(x => { x.onclick = () => { m.remove(); plansModal('edit', x.dataset.edit); }; });
    b.querySelectorAll('[data-del]').forEach(x => {
      x.onclick = () => {
        if (x.dataset.confirm !== '1') { x.dataset.confirm = '1'; x.textContent = 'Really delete?'; return; }
        const wasFirst = S.plans[0]?.id === x.dataset.del;
        S.plans = S.plans.filter(p => p.id !== x.dataset.del);
        if (!S.plans.some(p => p.id === S.active)) S.active = S.plans[0].id;
        selDay = null; save(); rerender();
        // The account's interview target follows the plan that is now first.
        if (wasFirst) pushTarget(S.plans[0].target).catch?.(() => {});
      };
    });
    b.querySelectorAll('[data-wd]').forEach(x => { x.onclick = () => { S.week[x.dataset.wd] = x.dataset.wt; save(); rerender(`[data-wd="${x.dataset.wd}"][data-wt="${x.dataset.wt}"]`); }; });
    b.querySelector('#qfClearOv')?.addEventListener('click', () => { S.overrides = {}; save(); rerender(); });
    const form = b.querySelector('#qfPlanForm');
    if (form) {
      b.querySelector('#qfPlanCancel').onclick = () => { m.remove(); plansModal('list'); };
      form.onsubmit = async e => {
        e.preventDefault();
        const f = new FormData(form);
        const t = { company: String(f.get('company')).trim(), level: String(f.get('level')).trim(), role: String(f.get('role')).trim() || 'Software Engineer', date: f.get('date') };
        if (!t.company || !/^\d{4}-\d{2}-\d{2}$/.test(t.date)) { b.querySelector('#qfPlanErr').textContent = 'Add a company and a date.'; return; }
        if (parseYmd(t.date) <= today()) { b.querySelector('#qfPlanErr').textContent = 'Pick a date after today.'; return; }
        if (view === 'new') { const p = newPlan(t); S.plans.push(p); S.active = p.id; }
        else { const p = S.plans.find(x => x.id === editId); p.target = t;
          if (f.get('restart')) {
            // Day-numbered ticks (primers, drills, STAR, mocks) belonged to the old
            // days; solved problems stay solved.
            p.start = ymd(today()); p.picks = {};
            p.done = Object.fromEntries(Object.entries(p.done || {}).filter(([k]) => k.startsWith('p:')));
          }
        }
        selDay = null; save(); await pushTarget(t);
        m.remove(); plansModal('list');
      };
    }
  }
  const editTarget = () => plansModal('edit', active().id);

  // Header button: which plan you are on, and how long is left.
  function planButton() {
    const top = document.querySelector('.bar-top');
    if (!top) return;
    let btn = $('qfPlanBtn');
    if (!btn) {
      btn = document.createElement('button');
      btn.type = 'button'; btn.id = 'qfPlanBtn'; btn.className = 'qf-plan-btn';
      btn.onclick = () => plansModal('list');
      top.prepend(btn);
    }
    const t = target(), left = daysLeft();
    btn.setAttribute('aria-label', `Plan: ${t.company} ${t.level}, ${left} days to go. Change plan`);
    btn.innerHTML = `<span>${esc(t.company)} ${esc(t.level)}</span><em>${left > 0 ? `${left}d` : left === 0 ? 'today' : 'done'}</em><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>`;
  }

  // ---------------------------------------------------------------- boot --
  function sync() {
    root();
    if (document.body.dataset.mode === 'home') render();
    planButton();
  }
  function boot() {
    // Every window title names the app, so several tabs stay tellable apart.
    const orig = window.syncDocumentTitle;
    if (orig && !orig.qf) {
      window.syncDocumentTitle = mode => {
        orig(mode);
        const m = mode || document.body.dataset.mode;
        document.title = `${m === 'home' ? 'Today' : document.title} · QuantFlash`;
      };
      window.syncDocumentTitle.qf = true;
      window.syncDocumentTitle();
    }
    if (!window.QF?.user && window.QF?.required) return;
    root();
    new MutationObserver(sync).observe(document.body, { attributes: true, attributeFilter: ['data-mode'] });
    window.addEventListener('focus', () => { if (document.body.dataset.mode === 'home' && !$('qfModal')) render(); });
    // First visit after the redesign lands on Today.
    try {
      if (!localStorage.getItem('qf.seenToday')) { localStorage.setItem('qf.seenToday', '1'); setTimeout(() => $('modeHome')?.click(), 50); }
    } catch { /* fine */ }
    sync();
  }

  window.QFSprint = { openHere, readiness, dueCount: () => dueCards().length, stories, gallery, daysLeft, target, editTarget, plansModal, drill, flash, star, addStarVersion, render, startNext: () => { const ds = plan(); const d = ds[Math.max(0, Math.min(ds.length - 1, Math.round((today() - parseYmd(active().start)) / DAY)))]; const n = d && tasksFor(d).find(x => !isDone(x)); n ? go(n) : drill(); } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else setTimeout(boot, 0);
})();
