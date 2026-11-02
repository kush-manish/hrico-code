/* Animate: watch the brute-force and the optimal solution run on the
 * problem's own example, step by step. The code is the Solution pane's
 * (or NeetCode's official solution), the run is a real Python trace from the
 * server's debugger, and the picture is drawn from the live variables:
 * arrays become rows of cells with index variables as pointers under them,
 * 2-D lists become grids, dicts and sets become side tables, and every
 * changed value is highlighted. Works for any problem, nothing hand-drawn.
 */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  /** One code line with its indent carried in --ind, so where a line is
   *  allowed to wrap, the continuation hangs under the code, not the margin. */
  const codeCell = l => { const t = String(l).trimStart(); return `<code style="--ind:${String(l).length - t.length}">${esc(t) || ' '}</code>`; };

  // ------------------------------------------------ Python literal parser --
  // Locals arrive as repr() strings: [1, 2], {2: 0}, (1, 'a'), {'x'}, True, None.
  function parsePy(src) {
    let i = 0; const s = String(src);
    const ws = () => { while (i < s.length && /\s/.test(s[i])) i++; };
    function val() {
      ws();
      const c = s[i];
      if (c === '[' || c === '(') return seq(c === '[' ? ']' : ')');
      if (c === '{') return mapOrSet();
      if (c === "'" || c === '"') return str();
      const m = /^(-?\d+(\.\d+)?(e-?\d+)?|True|False|None|inf|-inf|nan)/.exec(s.slice(i));
      if (m) { i += m[0].length; const t = m[0]; return t === 'True' ? true : t === 'False' ? false : t === 'None' ? null : Number(t.replace('inf', 'Infinity')); }
      throw new Error('opaque');
    }
    function seq(close) {
      i++; const out = []; ws();
      if (s[i] === close) { i++; return out; }
      for (;;) { out.push(val()); ws(); if (s[i] === ',') { i++; ws(); if (s[i] === close) { i++; return out; } continue; } if (s[i] === close) { i++; return out; } throw new Error('bad'); }
    }
    function mapOrSet() {
      i++; ws();
      if (s[i] === '}') { i++; return { __map: [] }; }
      const first = val(); ws();
      if (s[i] === ':') {
        const pairs = []; i++; pairs.push([first, val()]); ws();
        while (s[i] === ',') { i++; ws(); if (s[i] === '}') break; const k = val(); ws(); if (s[i] !== ':') throw new Error('bad'); i++; pairs.push([k, val()]); ws(); }
        if (s[i] !== '}') throw new Error('bad'); i++; return { __map: pairs };
      }
      const items = [first]; ws();
      while (s[i] === ',') { i++; ws(); if (s[i] === '}') break; items.push(val()); ws(); }
      if (s[i] !== '}') throw new Error('bad'); i++; return { __set: items };
    }
    function str() {
      const q = s[i++]; let out = '';
      while (i < s.length && s[i] !== q) { if (s[i] === '\\') { i++; out += s[i] === 'n' ? '\n' : s[i]; i++; continue; } out += s[i++]; }
      i++; return out;
    }
    const v = val(); ws();
    if (i < s.length) throw new Error('trailing');
    return v;
  }
  // collections types arrive as deque([1, 2]), Counter({'a': 2}), defaultdict(<class 'list'>, {...}):
  // unwrap them to the literal inside and remember what they were.
  function unwrap(s) {
    // Nodes inside containers become short tokens the literal parser can read.
    const t = String(s ?? '')
      .replace(/TreeNode\(([^#()]*)#(\d+)\)/g, (_, v, id) => `'⟨${v.replace(/'/g, '')}#${id}⟩'`)
      .replace(/ListNode\(([^()]*)\)/g, (_, v) => `'${v ? v.replace(/ -> /g, '→').replace(/'/g, '') : '∅'}'`)
      .replace(/Node\((-?\d+)(?: -> \[[^\]]*\])?\)/g, "'node $1'")
      .replace(/\bset\(\)/g, "{'\u0001'}")
      .replace(/(^|[[\s,(:{])(-?)inf(?=[\]\s,)}:]|$)/g, '$1$21e999');
    let m;
    if ((m = /^deque\((\[[\s\S]*\])(?:, maxlen=\d+)?\)$/.exec(t))) return [m[1], 'deque'];
    if (t === 'deque([])') return ['[]', 'deque'];
    if ((m = /^Counter\((\{[\s\S]*\})?\)$/.exec(t))) return [m[1] || '{}', 'Counter'];
    if ((m = /^defaultdict\(<[^>]*>, (\{[\s\S]*\})\)$/.exec(t))) return [m[1], 'defaultdict'];
    if ((m = /^OrderedDict\(([\s\S]*)\)$/.exec(t))) return [m[1] ? m[1].replace(/^\[|\]$/g, '').replace(/\(([^,()]+), ([^()]+)\)/g, '$1: $2').replace(/^/, '{').replace(/$/, '}') : '{}', 'OrderedDict'];
    if (t === 'set()') return ['{}', 'set'];
    return [t, ''];
  }
  const tryParse = s => {
    const [src, kind] = unwrap(s);
    try {
      let v = parsePy(src);
      if (kind === 'set' && v && v.__map) v = { __set: [] };
      return { ok: true, v, kind };
    } catch { return { ok: false, v: s, kind: '' }; }
  };
  const isScalar = v => v === null || ['number', 'string', 'boolean'].includes(typeof v);
  const show = v => (v === null ? 'None' : v === true ? 'True' : v === false ? 'False' : typeof v === 'string' ? `'${v}'` : Array.isArray(v) ? `[${v.map(show).join(', ')}]` : v && v.__map ? `{${v.__map.map(([k, x]) => `${show(k)}: ${show(x)}`).join(', ')}}` : v && v.__set ? `{${v.__set.map(show).join(', ')}}` : String(v));

  // ---------------------------------------------------- solution sources --
  const cache = {};   // slug → { brute, optimal, src }
  const traceCache = new Map();   // slug|example|code → the server's trace
  function approachesFromMarkdown(md, fn) {
    const parts = String(md || '').split(/^#{2,3}\s+/m).slice(1).map(sec => {
      const title = sec.split('\n')[0].trim();
      const code = (/```(?:python3?|py)?\s*\n([\s\S]*?)```/i.exec(sec) || [])[1] || '';
      return { title, code: code.trim() };
    // Only code that defines the problem's own method can be traced; anything
    // else (a model answering a different question) would fail with a traceback.
    }).filter(p => p.code && (/^[A-Z]/.test(fn || '') ? new RegExp('class\\s+' + fn + '\\b').test(p.code) : /class\s+Solution/.test(p.code) && (!fn || new RegExp('def\\s+' + fn + '\\s*\\(').test(p.code))));
    if (!parts.length) return null;
    const brute = parts.find(p => /brute|naive/i.test(p.title)) || parts[0];
    const optimal = [...parts].reverse().find(p => /optimal|best|efficient/i.test(p.title) && p !== brute) || (parts.length > 1 ? parts[parts.length - 1] : null);
    return { brute, optimal };
  }

  const fnName = q => {
    let meta = q.metaData || {};
    if (typeof meta === 'string') { try { meta = JSON.parse(meta); } catch { meta = {}; } }
    if (/^\w+$/.test(meta.classname || '')) return meta.classname;
    return /^\w+$/.test(meta.name || '') ? meta.name : '';
  };
  // NeetCode's file often holds several versions (and the last one is not
  // always valid Python). Python would run the LAST `class Solution`, so the
  // code on screen and the code traced disagreed; take the first complete one.
  function firstSolution(src, fn) {
    // Official files often hold several attempts, helper classes and a
    // "Definition for a Node" docstring; keep imports, the helper classes
    // and the first Solution (the one defining fn), drop the rest.
    let text = String(src || '').replace(/^(\x22{3}|\x27{3})[\s\S]*?\1[^\n]*\n?/gm, '');
    // Some official answers are a bare method: wrap it in a Solution class.
    if (!/^class\s+Solution\b/m.test(text) && /^def\s+\w+\(self\b/m.test(text)) text = 'class Solution:\n' + text.split('\n').map(l => (l.trim() ? '    ' + l : l)).join('\n');
    const lines = text.split('\n');
    const starts = lines.map((l, k) => (/^class\s+\w+/.test(l) ? k : -1)).filter(k => k >= 0);
    if (starts.length < 2) return text.trim();
    const blocks = starts.map((a, k) => lines.slice(a, starts[k + 1] ?? lines.length).join('\n').replace(/\n#[^\n]*\s*$/, '').trim());
    const pre = lines.slice(0, starts[0]).join('\n').trim();
    const isClass = /^[A-Z]/.test(fn || '');
    let at = isClass ? blocks.findIndex(b => new RegExp(`^class\\s+${fn}\\b`).test(b)) : blocks.findIndex(b => /^class\s+Solution\b/.test(b) && (!fn || b.includes(`def ${fn}(`)));
    if (at < 0 && !isClass) at = blocks.findIndex(b => /^class\s+Solution\b/.test(b));
    if (at < 0) return text.trim();
    // Helper classes only if the chosen Solution actually uses them.
    const helpers = blocks.filter((b, k) => { const nm = (/^class\s+(\w+)/.exec(b) || [])[1] || ''; return k < at && nm !== fn && !/^Solution/.test(nm) && !/^(ListNode|TreeNode)$/.test(nm) && new RegExp(`\\b${nm}\\b`).test(blocks[at]); });
    const head = pre && !pre.split('\n').every(l => /^\s*(#|$)/.test(l)) ? pre : '';
    return [head, ...helpers, blocks[at]].filter(Boolean).join('\n\n');
  }
  async function solutionsFor(q) {
    if (cache[q.slug]) return cache[q.slug];
    let out = null, why = '';
    try {
      const r = await fetch('/api/solution', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: q.slug, title: q.title, difficulty: q.difficulty, statement: q.plainStatement || '', lang: 'python3', model: window.Settings?.modelFor?.('codingSolution') }) });
      const d = await r.json().catch(() => ({}));
      if (r.ok) { out = approachesFromMarkdown(d.markdown, fnName(q)); if (!out) why = 'the AI solution had no Python code for this problem'; } else why = d.error || `server said ${r.status}`;
    } catch (e) { why = e.message; }
    // NeetCode's official solution is a reliable optimal when the model is unavailable.
    if (!out?.optimal) {
      try {
        const r = await fetch(`/api/neetcode/solution/${encodeURIComponent(q.slug)}`);
        if (r.ok) { const d = await r.json(); const code = firstSolution(d.solution, fnName(q)); if (code) out = { brute: out?.brute || null, optimal: { title: 'Optimal (NeetCode official)', code } }; }
      } catch { /* none */ }
    }
    if (!out) throw new Error(why || 'no Python solution found for this problem');
    out.why = why;
    // Kept even when half arrived, so flipping tabs does not re-ask the model
    // (its budget is small); "Try again" clears it and asks afresh.
    cache[q.slug] = out;
    return out;
  }

  // --------------------------------------------------------- the inputs --
  function examples(q) {
    let meta = q.metaData || {};
    if (typeof meta === 'string') { try { meta = JSON.parse(meta); } catch { meta = {}; } }
    // Design problems (LRU Cache, Min Stack…) are a class driven by a list of
    // calls; the tracer only steps through a single function.
    const n = meta.classname ? 2 : (meta.params || []).length || 1;
    const lines = String(q.exampleTestcases || q.sampleTestCase || '').split('\n').filter(l => l.trim());
    const out = [];
    for (let k = 0; k + n <= lines.length && out.length < 6; k += n) out.push(lines.slice(k, k + n).join('\n'));
    return { cases: out, params: meta.classname ? ['operations', 'arguments'] : (meta.params || []).map(p => p.name), design: !!meta.classname };
  }

  // ------------------------------------------------------- the renderer --
  // Everything below draws one step. Rules that matter most:
  //  - a variable is a pointer under an array only where the code subscripts
  //    that array with it by name (A[i], A[i+1]), or by its role (l/r/mid/…);
  //  - expressions the NEXT line reads/writes (dp[i+1][j+1], dp[a-c]) are
  //    evaluated and marked on the data, which shows the recurrence itself;
  //  - loop variables of loops that have finished are greyed, never pointers.
  const KW = new Set('and or not in is if else elif for while return def class lambda None True False len range min max abs int str list dict set tuple enumerate zip sorted reversed sum any all print self float inf ord chr map filter isinstance pass break continue yield global nonlocal from import as with try except finally raise del assert heapq heappush heappop heapify collections deque defaultdict Counter math'.split(' '));
  const identsIn = expr => [...String(expr).matchAll(/(?<![.\w])([A-Za-z_]\w*)(?!\s*\()/g)].map(m => m[1]).filter(n => !KW.has(n));
  const ROLE = /^(l|r|lo|hi|low|high|left|right|start|end|mid|m|top|bot|bottom|goal|maxJump|farthest|far|maxReach|reach|boundary|lastEnd|prevEnd|slow|fast|i|j|k)$/;
  function bracketAt(src, open) {
    let d = 0;
    for (let k = open; k < src.length; k++) {
      if (src[k] === '[') d++;
      else if (src[k] === ']') { d--; if (!d) return [src.slice(open + 1, k), k + 1]; }
    }
    return [src.slice(open + 1), src.length];
  }
  const bareOf = e => { const m = /^\s*([A-Za-z_]\w*)\s*(?:[+-]\s*\d+\s*)?$/.exec(e); return m && !KW.has(m[1]) ? m[1] : null; };
  function analyze(code) {
    const info = { sub: {}, sub2: {}, subTuple: {}, lineSubs: {}, forEach: [], loops: [], heap: new Set(), stack: new Set(), queue: new Set(), bitVars: new Set(), comp: new Set(), ownAssigned: new Set(), iterated: new Set(), probed: new Set(), lenOf: {} };
    const src = String(code || '');
    const lines = src.split('\n');
    const clean = l => l.replace(/#.*$/, '').replace(/(['"])(?:\\.|(?!\1).)*\1/g, '""');
    const body = lines.map(clean).join('\n');
    const add = (map, k, names) => { (map[k] ||= new Set()); names.forEach(n => map[k].add(n)); };
    lines.forEach((raw, ln) => {
      const l = clean(raw);
      const isWrite = (after) => /^\s*(=(?!=)|\+=|-=|\*=|\/\/=|\|=|&=)/.test(l.slice(after));
      for (const m of l.matchAll(/([A-Za-z_][\w]*(?:\.[A-Za-z_]\w*)?)\s*\[/g)) {
        const name = m[1];
        if (KW.has(name)) continue;
        const open = m.index + m[0].length - 1;
        const [e1, after] = bracketAt(l, open);
        if (/^\s*$/.test(e1)) continue;
        const b1 = bareOf(e1);
        if (b1) add(info.sub, name, [b1]);
        if (e1.includes(':')) e1.split(':').map(bareOf).filter(Boolean).forEach(n => add(info.sub, name, [n]));
        const tup = e1.replace(/^\s*\(|\)\s*$/g, '').split(',');
        if (tup.length === 2) { const tb = tup.map(bareOf); if (tb.every(Boolean)) info.subTuple[name] ||= tb; }
        const m2 = /^\s*\[/.exec(l.slice(after));
        let e2 = null, end = after;
        if (m2) {
          const r2 = bracketAt(l, after + m2[0].length - 1);
          e2 = r2[0]; end = r2[1];
          info.sub2[name] ||= { r: new Set(), c: new Set() };
          if (b1) info.sub2[name].r.add(b1);
          const b2 = bareOf(e2); if (b2) info.sub2[name].c.add(b2);
        }
        (info.lineSubs[ln + 1] ||= []).push({ arr: name, e1, e2, write: isWrite(end) });
      }
      for (const m of l.matchAll(/([A-Za-z_]\w*)\s*=\s*len\(\s*([\w.]+)\s*\)\s*-\s*1/g)) info.lenOf[m[1]] = m[2];
      for (const m of l.matchAll(/\bin\s+([A-Za-z_][\w.]*)\b(?!\s*\()/g)) if (!/^\s*for\b/.test(l)) info.probed.add(m[1]);
    });
    const indent = l => l.match(/^\s*/)[0].length;
    const stmtFor = new Set();
    lines.forEach((l, k) => {
      const m = /^\s*(for|while)\s+(.+?)\s*:\s*(#.*)?$/.exec(l);
      if (!m) return;
      const ind = indent(l);
      let end = k + 1;
      while (end < lines.length && (lines[end].trim() === '' || indent(lines[end]) > ind)) end++;
      end += 1;   // as a 1-based line number: the first line after the body
      if (m[1] === 'while') { info.loops.push({ from: k + 1, to: end, vars: [] }); return; }
      const fm = /^(.+?)\s+in\s+(.+)$/.exec(m[2]);
      if (!fm) return;
      const targets = fm[1].replace(/[()]/g, '').split(',').map(s => s.trim()).filter(Boolean);
      targets.forEach(t => stmtFor.add(t));
      info.loops.push({ from: k + 1, to: end, vars: targets });
      const it = fm[2].trim();
      let r;
      if ((r = /^range\((.*)\)$/.exec(it))) return;
      if ((r = /^enumerate\(\s*([\w.]+)\s*\)$/.exec(it)) && targets.length >= 2) { info.forEach.push({ line: k + 1, to: end, vars: targets.slice(1), arr: r[1], indexVar: targets[0] }); info.iterated.add(r[1]); return; }
      if ((r = /^([A-Za-z_][\w.]*)\[\s*(\d+)\s*:\s*\]$/.exec(it))) { info.forEach.push({ line: k + 1, to: end, vars: targets, arr: r[1], offset: Number(r[2]) }); info.iterated.add(r[1]); return; }
      if ((r = /^([A-Za-z_][\w.]*)(?:\.(?:keys|values|items)\(\))?$/.exec(it))) { info.forEach.push({ line: k + 1, to: end, vars: targets, arr: r[1] }); info.iterated.add(r[1]); }
    });
    for (const m of body.matchAll(/[[{(][^\]})\n]*?\bfor\s+([\w\s,()]+?)\s+in\b/g)) m[1].replace(/[()]/g, '').split(',').map(s => s.trim()).filter(Boolean).forEach(n => info.comp.add(n));
    info.params = new Set();
    for (const l of lines) { const dm = /^\s*def\s+\w+\s*\(([^)]*)\)/.exec(l); if (dm) dm[1].split(',').map(x => x.split(/[:=]/)[0].trim()).filter(x => x && x !== 'self').forEach(x => info.params.add(x)); }
    for (const l of lines.map(clean)) { const m = /^\s*([A-Za-z_][\w\s,]*?)\s*(?:=|\+=|-=|\*=)(?!=)/.exec(l); if (m && !/^\s*(for|if|while|return|def|class|elif)\b/.test(l)) m[1].split(',').map(s => s.trim()).forEach(n => info.ownAssigned.add(n)); }
    for (const n of [...info.comp]) if (stmtFor.has(n) || info.ownAssigned.has(n)) info.comp.delete(n);
    for (const m of body.matchAll(/\b(?:heapq\.)?(?:heappush|heappop|heapify|heappushpop|heapreplace)\(\s*([\w.]+)/g)) info.heap.add(m[1]);
    for (const m of body.matchAll(/([\w.]+)\.popleft\(/g)) info.queue.add(m[1]);
    for (const m of body.matchAll(/([\w.]+)\s*=\s*(?:collections\.)?deque\(/g)) info.queue.add(m[1]);
    for (const m of body.matchAll(/([\w.]+)\.pop\(\s*\)/g)) if (!info.heap.has(m[1]) && !info.queue.has(m[1])) info.stack.add(m[1]);
    for (const m of body.matchAll(/([A-Za-z_]\w*)\s*(?:&|\||\^|<<|>>)(?!\s*=)|(?:&|\||\^|<<|>>)=?\s*([A-Za-z_]\w*)|bin\(\s*([A-Za-z_]\w*)/g)) { const n = m[1] || m[2] || m[3]; if (n && !KW.has(n)) info.bitVars.add(n); }
    info.windowVars = new Set();
    for (const m of body.matchAll(/while\s+\(?\s*([A-Za-z_]\w*)\s*<=?\s*([A-Za-z_]\w*)/g)) { info.windowVars.add(m[1]); info.windowVars.add(m[2]); }
    info.rowVars = new Set(Object.values(info.sub2).flatMap(x => [...x.r]));
    info.colVars = new Set(Object.values(info.sub2).flatMap(x => [...x.c]));
    info.isBits = info.bitVars.size > 0 && /(>>|<<|\^|&(?!&))/.test(body);
    info.orderOf = n => { const k = src.search(new RegExp(`\\b${n.replace(/[.[\]]/g, m => `\\${m}`)}\\b`)); return k < 0 ? 1e9 : k; };
    info.suffix = /range\([^)]*-\s*1\s*,\s*-1\s*,\s*-1\s*\)/.test(body) || (/\[\s*\w+\s*\+\s*1\s*\]\s*\[\s*\w+\s*\+\s*1\s*\]/.test(body) && !/\[\s*\w+\s*-\s*1\s*\]\s*\[\s*\w+\s*-\s*1\s*\]/.test(body));
    info.liveVar = (name, line) => {
      // A for-loop variable is live only inside its loop (or if reassigned elsewhere).
      const ls = info.loops.filter(L => L.vars.includes(name));
      if (!ls.length || info.ownAssigned.has(name) || info.params.has(name)) return true;
      return ls.some(L => line >= L.from && line < L.to + 0) || ls.some(L => line === L.from);
    };
    return info;
  }
  // Facts that need the whole run (decided once, so shapes never flip mid-run).
  function prepareTrace(steps, info) {
    if (info.preparedFor === steps) return;
    info.preparedFor = steps;
    info.hasLists = steps.some(s => Object.values(s.locals || {}).some(v => /^ListNode\(/.test(v)));
    info.hasTrees = steps.some(s => s.trees || s.tree);
    info.graphNames = new Set();
    for (const s of steps.filter((_, k) => k % Math.max(1, Math.floor(steps.length / 60)) === 0 || k === steps.length - 1)) {
      for (const [k, raw] of Object.entries(s.locals || {})) {
        if (info.graphNames.has(k) || !/^(\{|defaultdict|\[\[)/.test(raw)) continue;
        const p = parseLocal(raw);
        if (p.ok && isGraphy(k, p.v)) info.graphNames.add(k);
      }
    }
    info.retFns = new Set(steps.filter(s => s.retnode != null).map(s => s.func));
    info.graphNodeAt = {};
    for (const k of info.graphNames) {
      for (let j = steps.length - 1; j >= 0; j--) {
        const raw = steps[j].locals?.[k] ?? steps[j].outer?.[k];
        if (!raw) continue;
        const p = parseLocal(raw);
        if (!p.ok || !p.v?.__map) break;
        const keys = new Set(p.v.__map.map(([x]) => JSON.stringify(x)));
        const pairs = p.v.__map.flatMap(([, x]) => (x.__set || x)).filter(Array.isArray);
        if (pairs.length) info.graphNodeAt[k] = pairs.filter(t => keys.has(JSON.stringify(t[1]))).length > pairs.filter(t => keys.has(JSON.stringify(t[0]))).length ? 1 : 0;
        break;
      }
    }
  }
  const GRAPH_NAME = /adj|graph|edges|prereq|preMap|nei|neighbors|children|tickets|flights|times|connections|roads|courses|g$/i;
  function isGraphy(name, v) {
    if (v && v.__map && v.__map.length >= 2) {
      const ok = v.__map.every(([key, x]) => isScalar(key) && ((Array.isArray(x) && x.every(y => isScalar(y) || (Array.isArray(y) && y.length === 2 && y.every(isScalar)))) || (x && x.__set && x.__set.every(isScalar))));
      if (!ok) return false;
      if (GRAPH_NAME.test(name)) return true;
      const keys = new Set(v.__map.map(([key]) => JSON.stringify(key)));
      const ts = v.__map.flatMap(([, x]) => (x.__set || x).map(y => JSON.stringify(Array.isArray(y) ? y[0] : y)));
      const ts2 = v.__map.flatMap(([, x]) => (x.__set || x).map(y => JSON.stringify(Array.isArray(y) ? y[1] : y)));
      return ts.length > 0 && (ts.filter(t => keys.has(t)).length >= ts.length / 2 || ts2.filter(t => keys.has(t)).length >= ts2.length / 2);
    }
    if (Array.isArray(v) && v.length >= 1 && /edges|prereq|times|flights|tickets|connections|roads/i.test(name) && v.every(x => Array.isArray(x) && (x.length === 2 || x.length === 3) && x.every(isScalar))) return true;
    return false;
  }

  // ------------------------------------------- whole-trace context --
  const DIMS = [['m', 'n'], ['rows', 'cols'], ['ROWS', 'COLS'], ['R', 'C'], ['h', 'w'], ['H', 'W'], ['M', 'N']];
  const POS = [['r', 'c'], ['i', 'j'], ['row', 'col'], ['x', 'y'], ['nr', 'nc'], ['r1', 'c1'], ['y', 'x']];
  const intsOf = st => {
    const o = {};
    for (const [k, v] of Object.entries(st?.locals || {})) if (/^-?\d+$/.test(v)) o[k] = Number(v);
    return o;
  };
  function carried(steps, i, key) {
    for (let k = i; k >= 0; k--) if (steps[k] && key in steps[k]) return steps[k][key];
    return null;
  }
  const isRecursive = st => { const fs = (st || []).map(s => String(s).split('(')[0]); return fs.some((f, k) => fs.indexOf(f) !== k); };
  function boardFor(steps, i) {
    const iv = intsOf(steps[i]);
    const dim = DIMS.find(([a, b]) => Number.isInteger(iv[a]) && Number.isInteger(iv[b]) && iv[a] > 0 && iv[b] > 0 && iv[a] <= 20 && iv[b] <= 20);
    if (!dim) return null;
    const pos = POS.find(([a, b]) => a in iv && b in iv && !dim.includes(a));
    if (!pos) return null;
    const [R, C] = [iv[dim[0]], iv[dim[1]]];
    const visits = Array.from({ length: R }, () => Array(C).fill(0));
    let lastKey = null, lastDepth = 0;
    for (let k = 0; k <= i; k++) {
      const v = intsOf(steps[k]);
      const d = steps[k].depth || 0;
      if (pos[0] in v && pos[1] in v) {
        const key = `${v[pos[0]]},${v[pos[1]]}`;
        if ((d > lastDepth || key !== lastKey) && v[pos[0]] >= 0 && v[pos[0]] < R && v[pos[1]] >= 0 && v[pos[1]] < C) visits[v[pos[0]]][v[pos[1]]]++;
        lastKey = key;
      }
      lastDepth = d;
    }
    return { R, C, at: [iv[pos[0]], iv[pos[1]]], names: pos, dimNames: dim, visits };
  }
  function boardHtml(b) {
    const max = Math.max(1, ...b.visits.flat());
    const out = b.at[0] < 0 || b.at[0] >= b.R || b.at[1] < 0 || b.at[1] >= b.C;
    return `<div class="qt-arr"><div class="qt-name">${esc(b.dimNames[0])}×${esc(b.dimNames[1])} board <small>number = times the recursion entered this cell${out ? ` · <b class="bad">(${b.at[0]}, ${b.at[1]}) is off the board</b>` : ''}</small></div>
      <div class="qt-grid qt-board" style="grid-template-columns:repeat(${b.C}, minmax(24px, 34px))">${b.visits.map((row, y) => row.map((n, x) => {
        const hit = b.at[0] === y && b.at[1] === x;
        const heat = n ? Math.round(12 + 55 * n / max) : 0;
        return `<div class="qt-g${hit ? ' ptr' : ''}" style="${heat ? `background:color-mix(in srgb, var(--q-warn, #e37400) ${heat}%, transparent)` : ''}" title="(${y}, ${x}) entered ${n}×">${n || ''}</div>`;
      }).join('')).join('')}</div></div>`;
  }
  // The element a `for x in A` loop holds right now: the header line runs
  // once per iteration BEFORE x is rebound, so on the header itself x still
  // holds the previous element.
  function iterPos(steps, i, fe) {
    const d = steps[i].depth || 0;
    let n = 0;
    for (let k = i; k >= 0; k--) {
      const s2 = steps[k], d2 = s2.depth || 0;
      if (d2 < d) break;
      if (d2 > d) continue;
      if (s2.line === fe.line && s2.event === 'line') n++;
      else if (s2.event === 'line' && (s2.line < fe.line || s2.line >= fe.to)) break;
    }
    const onHeader = steps[i].line === fe.line;
    const pos = onHeader ? n - 2 : n - 1;
    return pos < 0 ? -1 : pos + (fe.offset || 0);
  }
  // Safely evaluate an index expression like "i + 1", "a - c", "len(s) - 1".
  function evalIdx(expr, scope, lens) {
    let e = String(expr).replace(/len\(\s*([\w.]+)\s*\)/g, (_, n) => (n in lens ? String(lens[n]) : 'NaN'));
    e = e.replace(/(?<![.\w])([A-Za-z_]\w*)(?![\w(])/g, (_, n) => (n in scope ? String(scope[n]) : 'NaN'));
    if (!/^[\d\s+\-*/%()]+$/.test(e) || /NaN/.test(e)) return null;
    try { const v = Function(`"use strict"; return (${e.replace(/\/\//g, '/')});`)(); return Number.isFinite(v) ? Math.trunc(v) : null; } catch { return null; }
  }

  // -------------------------------------------------------- value format --
  const cell = x => {
    if (x === Infinity) return '∞';
    if (x === -Infinity) return '-∞';
    if (x === true) return 'T';
    if (x === false) return 'F';
    if (x === null) return 'None';
    if (Array.isArray(x)) return `[${x.map(cell).join(', ')}]`;
    if (typeof x === 'string') {
      if (/^⟨.*⟩$/.test(x)) return x.replace(/^⟨(.*)#\d+⟩$/, '$1');
      if (/^-?[^#\s]*#\d+→/.test(x)) return `node ${x.split('#')[0]}`;
      if (/#\d+/.test(x)) return x.replace(/#\d+/g, '');
      return x === ' ' ? '␣' : x === '' ? "''" : x;
    }
    if (typeof x === 'number' && !Number.isInteger(x)) return String(Math.round(x * 1000) / 1000);
    return String(x);
  };
  const tokenTxt = x => (typeof x === 'string' && /^⟨.*⟩$/.test(x) ? `node ${x.replace(/^⟨(.*)#\d+⟩$/, '$1')}` : typeof x === 'string' && /^-?[^#\s]*#\d+(→|$)/.test(x) ? `node ${x.split('#')[0]}` : null);
  const brief = (x, n = 40) => { if (tokenTxt(x)) return tokenTxt(x); const t = Array.isArray(x) ? `[${x.map(y => cell(y)).join(', ')}]` : x && x.__map ? `{${x.__map.map(([k, v]) => `${cell(k)}: ${cell(v)}`).join(', ')}}` : x && x.__set ? `{${x.__set.map(cell).join(', ')}}` : typeof x === 'string' ? `'${cell(x)}'` : cell(x); return t.length > n ? t.slice(0, n - 1) + '…' : t; };
  const isNum = x => typeof x === 'number';
  const compactBadge = v => String(v).replace(/True/g, 'T').replace(/False/g, 'F').replace(/^\[(.*)\]$/, '$1').replace(/\s+/g, '');

  // ------------------------------------------------------------- pieces --
  function arrayHtml({ name, a, kind, ptrs, cur, was, bars, reads = {}, writes = new Set(), dim, headers }) {
    const pairs = [['l', 'r'], ['left', 'right'], ['lo', 'hi'], ['low', 'high'], ['start', 'end'], ['L', 'R'], ['top', 'bot'], ['top', 'bottom']];
    const lohi = pairs.find(([p, q]) => isNum(ptrs[p]) && isNum(ptrs[q]) && ptrs[p] <= ptrs[q]);
    const at = {};
    for (const [k, v] of Object.entries(ptrs)) (at[v] ||= []).push(k);
    const ghostL = at[-1], ghostR = at[a.length];
    const label = kind ? ` <small>${esc(kind)}${kind === 'stack' ? ' · top →' : kind === 'queue' ? ' · ← front' : kind === 'heap' ? ' · smallest first' : kind === 'max-heap' ? ' · stored negated, largest first' : ''}</small>` : '';
    const nums = a.filter(isNum);
    const lo0 = bars && nums.length ? Math.min(...nums) : 0, hi0 = bars && nums.length ? Math.max(...nums) : 1;
    const base = bars && lo0 > 0 && (hi0 - lo0) < hi0 * 0.4 ? lo0 - 1 : 0;
    const scale = x => Math.max(3, Math.round(70 * (x - base) / Math.max(1, hi0 - base)));
    const cellHtml = (x, k) => {
      const diff = was && JSON.stringify(was[k]) !== JSON.stringify(x);
      const inWin = lohi && k >= ptrs[lohi[0]] && k <= ptrs[lohi[1]];
      const isCur = cur && cur.pos === k;
      const rd = reads[k], wr = writes.has(k);
      const bar = bars && isNum(x) ? `<span class="qt-bar" style="height:${scale(x)}px"></span>` : '';
      const labels = [...(at[k] || []), ...(isCur ? [cur.name] : []), ...(rd ? rd.map(r => `${r}`) : [])];
      return `<div class="qt-cell${at[k] ? ' ptr' : ''}${diff || wr ? ' ch' : ''}${inWin ? ' win' : ''}${isCur ? ' cur' : ''}${rd ? ' rd' : ''}">${headers ? `<span class="qt-hd">${esc(headers[k] ?? '')}</span>` : ''}${bar}<span class="qt-v">${esc(cell(x))}</span><span class="qt-i">${kind === 'set' ? '' : k}</span><span class="qt-p">${labels.map(n => `<i>${esc(n)}</i>`).join('')}</span></div>`;
    };
    const ghost = names => `<div class="qt-cell ghost"><span class="qt-v">·</span><span class="qt-i"></span><span class="qt-p">${names.map(n => `<i>${esc(n)}</i>`).join('')}</span></div>`;
    return `<div class="qt-arr${dim ? ' dim' : ''}"><div class="qt-name${was ? ' ch' : ''}">${esc(name)}${label}${lohi ? ` <small>${esc(lohi[0])}..${esc(lohi[1])} shaded</small>` : ''}${base ? ` <small>bars start at ${base}</small>` : ''}</div><div class="qt-row${bars ? ' bars' : ''}">${ghostL ? ghost(ghostL) : ''}${a.map(cellHtml).join('')}${ghostR ? ghost(ghostR) : ''}${a.length ? '' : '<span class="qt-empty">empty</span>'}</div></div>`;
  }
  function rowsHtml({ name, rows, was, cur, dim }) {
    const grown = was && rows.length > was.length;
    const boards = rows.length && rows.every(r => Array.isArray(r) && r.length >= 4 && r.every(x => typeof x === 'string' && x.length === r.length));
    if (boards) {
      return `<div class="qt-arr${dim ? ' dim' : ''}"><div class="qt-name">${esc(name)} <small>${rows.length} ${rows.length === 1 ? 'board' : 'boards'}</small></div><div class="qt-boards">${rows.map((b, k) => `<div class="qt-miniboard${grown && k === rows.length - 1 ? ' ch' : ''}" style="grid-template-columns:repeat(${b.length}, 14px)">${b.map(line => [...line].map(ch => `<span class="${ch === '.' ? '' : 'q'}">${ch === '.' ? '' : esc(ch)}</span>`).join('')).join('')}</div>`).join('')}</div></div>`;
    }
    return `<div class="qt-arr${dim ? ' dim' : ''}"><div class="qt-name">${esc(name)} <small>${rows.length} ${rows.length === 1 ? 'list' : 'lists'}</small></div><div class="qt-rows">${rows.map((r, k) => `<div class="qt-rowline${grown && k === rows.length - 1 ? ' ch' : ''}${cur && cur.pos === k ? ' cur' : ''}"><span class="qt-i">${k}</span><span class="qt-br">[</span>${(Array.isArray(r) ? r : [r]).map(x => `<span class="qt-v">${esc(cell(x))}</span>`).join('')}<span class="qt-br">]</span></div>`).join('') || '<span class="qt-empty">empty</span>'}</div></div>`;
  }
  function gridHtml({ name, g, was, at, rowsHi, colsHi, queued, seen, seenA, rowHdr, colHdr, reads, writes, rowNames, colNames, dim }) {
    const R = g.length, C = g[0].length;
    const wide = Math.max(...g.flat().map(x => cell(x).length));
    const w = Math.min(64, Math.max(C > 12 ? 20 : 26, 9 * wide + 10));
    const head = `<div class="qt-gh"></div>${Array.from({ length: C }, (_, x) => `<div class="qt-gh${colsHi.has(x) ? ' on' : ''}" title="${esc((colNames[x] || []).join(' '))}">${colHdr ? esc(colHdr[x] === ' ' ? '␣' : colHdr[x] ?? '') + '<small>' + x + '</small>' : x}${colNames[x] ? `<small class="qt-hn">${esc(colNames[x].join(' '))}</small>` : ''}</div>`).join('')}`;
    const body2 = g.map((row, y) => `<div class="qt-gh${rowsHi.has(y) ? ' on' : ''}">${rowHdr ? esc(rowHdr[y] === ' ' ? '␣' : rowHdr[y] ?? '') + '<small>' + y + '</small>' : y}${rowNames[y] ? `<small class="qt-hn">${esc(rowNames[y].join(' '))}</small>` : ''}</div>` + row.map((x, xx) => {
      const diff = was && Array.isArray(was[y]) && JSON.stringify(was[y][xx]) !== JSON.stringify(x);
      const hit = at.some(([a, b]) => a === y && b === xx);
      const k = `${y},${xx}`;
      const rd = reads[k], wr = writes.has(k);
      const inA = seenA && seenA[0][1].has(k), inB = seenA && seenA[1][1].has(k);
      return `<div class="qt-g${hit ? ' ptr' : ''}${diff || wr ? ' ch' : ''}${queued.has(k) ? ' inq' : ''}${seen.has(k) ? ' seen' : ''}${inA && inB ? ' seenAB' : inA ? ' seenA' : inB ? ' seenB' : ''}${rd ? ' rd' : ''}"${rd ? ` title="read: ${esc(rd.join(', '))}"` : queued.has(k) ? ' title="waiting in the queue/stack/heap"' : seen.has(k) ? ' title="visited"' : ''}>${esc(cell(x))}</div>`;
    }).join('')).join('');
    const box3 = R === 9 && C === 9 ? ' sudoku' : '';
    return `<div class="qt-arr${dim ? ' dim' : ''}"><div class="qt-name${was ? ' ch' : ''}">${esc(name)} <small>${R}×${C}${Object.keys(reads).length ? ' · dashed = cells the next line reads' : ''}${seenA ? ` · <span class="qt-key seenA"></span> ${esc(seenA[0][0])} · <span class="qt-key seenB"></span> ${esc(seenA[1][0])} · <span class="qt-key seenAB"></span> both` : ''}</small></div><div class="qt-grid qt-hgrid${box3}" style="grid-template-columns:34px repeat(${C}, ${w}px)">${head}${body2}</div></div>`;
  }
  function memoHtml({ name, entries, hiKey, axis, rowHdr, colHdr, fixed, reads }) {
    const ks = entries.map(([k]) => k);
    const r0 = fixed ? 0 : Math.min(...ks.map(k => k[0])), r1 = fixed ? fixed[0] - 1 : Math.max(...ks.map(k => k[0]));
    const c0 = fixed ? 0 : Math.min(...ks.map(k => k[1])), c1 = fixed ? fixed[1] - 1 : Math.max(...ks.map(k => k[1]));
    const val = new Map(entries.map(([k, v]) => [`${k[0]},${k[1]}`, v]));
    const C = c1 - c0 + 1;
    const wide = Math.max(1, ...entries.map(([, v]) => cell(v).length));
    const w = Math.min(64, Math.max(24, 9 * wide + 10));
    let html = `<div class="qt-gh">${axis ? `<small>${esc(axis[0])}↓ ${esc(axis[1])}→</small>` : ''}</div>${Array.from({ length: C }, (_, x) => `<div class="qt-gh">${colHdr && colHdr[c0 + x] != null ? esc(colHdr[c0 + x]) + '<small>' + (c0 + x) + '</small>' : c0 + x}</div>`).join('')}`;
    for (let y = r0; y <= r1; y++) {
      html += `<div class="qt-gh">${rowHdr && rowHdr[y] != null ? esc(rowHdr[y]) + '<small>' + y + '</small>' : y}</div>`;
      for (let x = c0; x <= c1; x++) { const k = `${y},${x}`; html += `<div class="qt-g${hiKey === k ? ' ptr' : ''}${val.has(k) ? '' : ' blank'}${reads[k] ? ' rd' : ''}">${val.has(k) ? esc(cell(val.get(k))) : ''}</div>`; }
    }
    return `<div class="qt-arr"><div class="qt-name">${esc(name)} <small>memo table · ${entries.length} saved${axis ? ` · key (${esc(axis[0])}, ${esc(axis[1])})` : ''}</small></div><div class="qt-grid qt-hgrid" style="grid-template-columns:40px repeat(${C}, ${w}px)">${html}</div></div>`;
  }
  const idOf = x => (typeof x === 'string' ? (/#(\d+)/.exec(x) || [])[1] || null : null);
  function mapHtml({ name, m, kind, hiKeys, was, dim }) {
    const rows = m.__map ? m.__map.map(([k, v]) => [k, v]) : m.__set.map(x => [x]);
    if (m.__map && rows.every(([k]) => isNum(k))) rows.sort((a, b) => a[0] - b[0]);
    else if (m.__map && rows.every(([k]) => typeof k === 'string')) rows.sort((a, b) => (a[0] < b[0] ? -1 : 1));
    const old = was?.__map ? new Map(was.__map.map(([k, v]) => [JSON.stringify(k), JSON.stringify(v)])) : null;
    const sig = k => (Array.isArray(k) && k.length === 26 && k.every(isNum) ? k.map((n, i2) => (n ? String.fromCharCode(97 + i2) + n : '')).join('') || '∅' : brief(k, 30));
    return `<div class="qt-map${dim ? ' dim' : ''}"><div class="qt-name">${esc(name)} <small>${esc(kind || 'dict')} · ${rows.length}</small></div>
      <ul>${rows.slice(0, 18).map(r => { const key = JSON.stringify(r[0]); const ch = old && old.get(key) !== JSON.stringify(r[1]); return `<li class="${hiKeys.has(key) ? 'on' : ''}${ch ? ' ch' : ''}${r[1] === 0 ? ' zero' : ''}"><span>${esc(sig(r[0]))}</span>${r.length > 1 ? `<span>${esc(brief(r[1], 34).replace(/^'(node .*)'$/, '$1'))}${idOf(r[0]) && idOf(r[1]) && idOf(r[0]) !== idOf(r[1]) ? '′ <small>(copy)</small>' : ''}</span>` : ''}</li>`; }).join('')}
      ${rows.length > 18 ? `<li class="qf-muted">… ${rows.length - 18} more</li>` : ''}${rows.length ? '' : '<li class="qf-muted">empty</li>'}</ul></div>`;
  }
  function graphHtml({ name, m, cur, visited, active, used, dim, forest }) {
    const nodes = [], seen2 = new Set(), edges = [];
    const addN = x => { const k = JSON.stringify(x); if (!seen2.has(k)) { seen2.add(k); nodes.push(x); } };
    const keyset = new Set(m.__map.map(([k]) => JSON.stringify(k)));
    const pairsAll = m.__map.flatMap(([, vs]) => (vs.__set || vs)).filter(Array.isArray);
    const nodeAt = m.nodeAt != null ? m.nodeAt : pairsAll.length && pairsAll.filter(t => keyset.has(JSON.stringify(t[1]))).length > pairsAll.filter(t => keyset.has(JSON.stringify(t[0]))).length ? 1 : 0;
    for (const [k, vs] of m.__map) { addN(k); for (const t of (vs.__set || vs)) { const [to, w] = Array.isArray(t) ? [t[nodeAt], t[1 - nodeAt]] : [t, null]; addN(to); edges.push([k, to, w]); } }
    for (const [a, b] of used || []) { addN(a); addN(b); }
    if (nodes.length > 32) return '';
    const N = nodes.length, R = Math.max(60, 22 * N / Math.PI), W = 2 * R + 60;
    const pos = new Map(nodes.map((n, k) => [JSON.stringify(n), [W / 2 + R * Math.cos(2 * Math.PI * k / Math.max(1, N) - Math.PI / 2), W / 2 + R * Math.sin(2 * Math.PI * k / Math.max(1, N) - Math.PI / 2)]]));
    const key = (a, b) => `${JSON.stringify(a)}|${JSON.stringify(b)}`;
    const all = new Set(edges.map(([a, b]) => key(a, b)));
    const undirected = !forest && edges.length > 0 && edges.every(([a, b]) => all.has(key(b, a)));
    const drawn = new Set();
    const line = (a, b, cls, wt) => {
      const [x1, y1] = pos.get(JSON.stringify(a)), [x2, y2] = pos.get(JSON.stringify(b));
      const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1;
      const sx = x1 + dx / L * 15, sy = y1 + dy / L * 15, ex = x2 - dx / L * 17, ey = y2 - dy / L * 17;
      return `<line class="${cls}" x1="${sx}" y1="${sy}" x2="${ex}" y2="${ey}"${undirected ? '' : ' marker-end="url(#qtArrow)"'}/>${wt != null ? `<text class="w" x="${(sx + ex) / 2}" y="${(sy + ey) / 2 - 3}" text-anchor="middle">${esc(cell(wt))}</text>` : ''}`;
    };
    let lines = '';
    for (const [a, b] of used || []) if (!all.has(key(a, b))) lines += line(a, b, 'used', null);
    for (const [a, b, wt] of edges) {
      if (JSON.stringify(a) === JSON.stringify(b)) continue;
      if (undirected && drawn.has(key(b, a))) continue;
      drawn.add(key(a, b));
      lines += line(a, b, cur.has(JSON.stringify(a)) ? 'hot' : '', wt);
    }
    const roots = forest ? new Set(m.__map.filter(([k, vs]) => (vs || []).some(t => JSON.stringify(t) === JSON.stringify(k))).map(([k]) => JSON.stringify(k))) : null;
    const circles = nodes.map(n => {
      const k = JSON.stringify(n), [x, y] = pos.get(k);
      const cls = cur.has(k) ? 'on' : active.has(k) ? 'act' : visited.has(k) ? 'done' : '';
      return `<g class="${cls}${roots && roots.has(k) ? ' root' : ''}"><circle cx="${x}" cy="${y}" r="14"/><text x="${x}" y="${y + 4}" text-anchor="middle">${esc(cell(n))}</text></g>`;
    }).join('');
    return `<div class="qt-arr${dim ? ' dim' : ''}"><div class="qt-name">${esc(name)} <small>${forest ? 'union-find forest · arrow = parent · bold = root' : `graph${undirected ? '' : ' · directed'}`} · blue = current · orange = in progress · grey = visited${used && used.length ? ' · dashed = used' : ''}</small></div><svg class="qt-graph" viewBox="0 0 ${W} ${W}" style="max-width:${Math.min(W, 340)}px" role="img" aria-label="Graph ${esc(name)}"><defs><marker id="qtArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z"/></marker></defs>${lines}${circles}</svg></div>`;
  }
  function intervalsHtml({ name, iv, cur, extra, ticks, dim }) {
    const all = [...iv.flat(), ...extra.flatMap(e => e[1]), ...ticks.map(t => t[1])].filter(x => isNum(x) && Number.isFinite(x));
    if (!all.length) return '';
    const lo = Math.min(...all), hi = Math.max(...all), span = Math.max(1, hi - lo);
    const X = v => `${((v - lo) / span) * 100}%`;
    const bar = ([a, b], cls, lab) => `<div class="qt-ivrow ${cls}"><span class="qt-ivlab">${esc(lab)}</span><span class="qt-ivtrack"><span class="qt-ivbar" style="left:${X(a)};width:calc(${X(b)} - ${X(a)} + 3px)"></span>${ticks.map(([n, v]) => `<span class="qt-ivtick" style="left:${X(v)}" title="${esc(n)} = ${cell(v)}"></span>`).join('')}</span><span class="qt-ivv">[${cell(a)}, ${cell(b)}]</span></div>`;
    return `<div class="qt-arr${dim ? ' dim' : ''}"><div class="qt-name">${esc(name)} <small>intervals on a number line ${cell(lo)}…${cell(hi)}${ticks.length ? ` · ticks: ${ticks.map(([n, v]) => `${esc(n)}=${cell(v)}`).join(', ')}` : ''}</small></div><div class="qt-iv">${iv.map((p, k) => bar(p, cur && cur.pos === k ? 'cur' : '', k)).join('')}${extra.map(([n, p]) => bar(p, 'extra', n)).join('')}</div></div>`;
  }
  function treeHtml(name, tree, ptrs, queued, path, badges) {
    if (!tree || !tree.length || !tree[0]) return '';
    const nodes = [];
    const root = { v: tree[0][0], id: tree[0][1], depth: 0, kids: [null, null] };
    nodes.push(root);
    const queue = [root];
    let idx = 1;
    while (queue.length && idx < tree.length) {
      const par = queue.shift();
      for (const side of [0, 1]) {
        if (idx >= tree.length) break;
        const t = tree[idx++];
        if (t) { const n = { v: t[0], id: t[1], depth: par.depth + 1, kids: [null, null], parent: par }; par.kids[side] = n; nodes.push(n); queue.push(n); }
      }
    }
    let order = 0;
    const inorder = n => { if (!n) return; inorder(n.kids[0]); n.x = order++; inorder(n.kids[1]); };
    inorder(root);
    const depth = Math.max(...nodes.map(n => n.depth));
    const pad = 24, W = Math.max(120, order * 44 + 2 * pad), H = 52 * (depth + 1) + 18;
    const X = n => pad + 10 + n.x * 44, Y = n => 22 + n.depth * 52;
    const ids = new Set(nodes.map(n => String(n.id)));
    const edges = nodes.filter(n => n.parent).map(n => `<line class="${path.has(n.id) && path.has(n.parent.id) ? 'hot' : ''}" x1="${X(n.parent)}" y1="${Y(n.parent)}" x2="${X(n)}" y2="${Y(n)}"/>`).join('');
    const circles = nodes.map(n => {
      const p = ptrs[n.id];
      const cls = p ? 'on' : queued.has(String(n.id)) ? 'inq' : path.has(n.id) ? 'path' : '';
      const b = badges[n.id];
      return `<g class="${cls}"><circle cx="${X(n)}" cy="${Y(n)}" r="15"/><text x="${X(n)}" y="${Y(n) + 4}" text-anchor="middle">${esc(cell(n.v))}</text>${p ? `<text class="lbl" x="${X(n)}" y="${Y(n) - 19}" text-anchor="middle">${esc(p.join(' '))}</text>` : ''}${b != null ? `<text class="badge" x="${X(n)}" y="${Y(n) + 29}" text-anchor="middle">↑${esc(compactBadge(b).slice(0, 12))}</text>` : ''}</g>`;
    }).join('');
    return { html: `<div class="qt-arr"><div class="qt-name">${esc(name)} <small>tree · blue = current node · outlined = on the call path · dashed = waiting · ↑ = returned</small></div><svg class="qt-tree" viewBox="0 -8 ${W} ${H + 10}" style="max-width:${W}px" role="img" aria-label="The tree ${esc(name)}">${edges}${circles}</svg></div>`, ids };
  }
  function listsHtml(chains, labels, nones, faded) {
    const val = new Map(), next = new Map(), order = [];
    for (const [, nodes, back, trunc] of chains) {
      nodes.forEach((n, k) => { if (!val.has(n.id)) { val.set(n.id, n.v); order.push(n.id); } if (k + 1 < nodes.length) next.set(n.id, nodes[k + 1].id); });
      if (nodes.length && back != null) next.set(nodes[nodes.length - 1].id, back);
      else if (nodes.length && trunc && !next.has(nodes[nodes.length - 1].id)) next.set(nodes[nodes.length - 1].id, '…');
      else if (nodes.length && !next.has(nodes[nodes.length - 1].id)) next.set(nodes[nodes.length - 1].id, null);
    }
    if (!order.length && !nones.length) return '';
    order.sort((a, b) => (isNum(a) && isNum(b) ? a - b : 0));   // node ids = creation order: positions stay stable
    const indeg = new Map(order.map(id => [id, 0]));
    for (const [, t] of next) if (indeg.has(t)) indeg.set(t, indeg.get(t) + 1);
    const drawn = new Map();
    const rows = [];
    const walk = start => {
      const row = [];
      let cur = start, tail = null;
      while (cur != null && cur !== '…') {
        if (drawn.has(cur)) { tail = drawn.get(cur) === rows.length ? `↩ back to ${cell(val.get(cur))}` : `→ joins ${cell(val.get(cur))}`; break; }
        drawn.set(cur, rows.length); row.push(cur);
        cur = next.get(cur);
        if (cur === undefined) { tail = '…'; break; }
      }
      if (!tail) tail = cur === '…' ? '…' : 'None';
      rows.push({ row, tail });
    };
    for (const id of order) if (!drawn.has(id) && indeg.get(id) === 0) walk(id);
    for (const id of order) if (!drawn.has(id)) walk(id);
    const html = rows.map(({ row, tail }) => `<div class="qt-chain">${row.map(id => `<span class="qt-node${labels[id] ? ' ptr' : ''}${faded.has(id) ? ' faded' : ''}">${labels[id] ? `<small class="qt-hl">${esc(labels[id].join(' '))}</small>` : ''}${esc(cell(val.get(id)))}</span>`).join('<span class="qt-arrow" aria-hidden="true">→</span>')}<span class="qt-arrow" aria-hidden="true">→</span><span class="qf-muted">${esc(tail)}</span></div>`).join('');
    return `<div class="qt-arr"><div class="qt-name">linked list <small>each node drawn once · names show which node a variable points at</small></div>${html}${nones.length ? `<div class="qt-scal"><span class="qt-chip"><b>${esc(nones.join(', '))}</b> → None</span></div>` : ''}</div>`;
  }
  function bitsHtml(rows) {
    const width = Math.max(4, ...rows.map(([, v]) => v.toString(2).length));
    return `<div class="qt-arr"><div class="qt-name">bits <small>each number in binary, aligned</small></div><div class="qt-bitrows">${rows.map(([n, v, was]) => { const b = v.toString(2).padStart(width, '0'); const o = was != null && was >= 0 ? was.toString(2).padStart(width, '0') : null; return `<div class="qt-bitrow"><b>${esc(n)}</b>${[...b].map((c, k) => `<span class="${c === '1' ? 'one' : ''}${o && o[k] !== c ? ' ch' : ''}">${c}</span>`).join('')}<small>= ${v}</small></div>`; }).join('')}</div></div>`;
  }
  function stackHtml(stack, rets) {
    if (!stack || stack.length < 2) return '';
    const shown = stack.slice(-7);
    return `<div class="qt-stack" aria-label="Call stack, ${stack.length} deep"><span class="qt-name">call stack · ${stack.length} deep</span>
      <ol>${stack.length > shown.length ? `<li class="qf-muted">… ${stack.length - shown.length} more</li>` : ''}${shown.map((f, k) => `<li class="${k === shown.length - 1 ? 'top' : ''}"><code>${esc(String(f).replace(/\bL\((-?[\w.]+)\)/g, 'node $1').replace(/\bT\((-?[\w.]+)\)/g, 'node $1'))}</code></li>`).join('')}${rets ? `<li class="ret"><code>${esc(rets)}</code></li>` : ''}</ol></div>`;
  }

  // A design object's state arrives as {"__obj": cls, id, f:{...}} / {"__ref": id}.
  function objIndex(snap) {
    const byId = {};
    const walk = v => {
      if (!v || typeof v !== 'object') return;
      if (Array.isArray(v)) return v.forEach(walk);
      if (v.__obj) { if (!byId[v.id]) { byId[v.id] = v; Object.values(v.f || {}).forEach(walk); } return; }
      if (v.__map) return v.__map.forEach(([k, x]) => { walk(k); walk(x); });
      if (v.__set) return v.__set.forEach(walk);
    };
    walk(snap);
    return byId;
  }
  const deref = (v, byId) => (v && v.__ref ? byId[v.__ref] || null : v);
  const isPrim = v => v === null || ['number', 'string', 'boolean'].includes(typeof v);
  const pshow = v => (v === null ? 'None' : v === true ? 'True' : v === false ? 'False' : typeof v === 'string' ? v : String(v));
  function nodeLabel(o) {
    const f = o.f || {};
    if ('key' in f && 'val' in f) return `${pshow(f.key)}:${pshow(f.val)}`;
    for (const k of ['val', 'value', 'key', 'word', 'data']) if (k in f && isPrim(f[k])) return pshow(f[k]);
    return o.__obj;
  }
  function trieField(o, byId) {
    // A field that maps keys to objects of the same class: a trie / n-ary tree.
    for (const [k, v] of Object.entries(o.f || {})) if (v && v.__map && v.__map.length >= 0 && v.__map.every(([, x]) => { const d = deref(x, byId); return d && d.__obj === o.__obj; })) return k;
    // children as a fixed list (26 slots for a-z), None where there is no child
    for (const [k, v] of Object.entries(o.f || {})) if (Array.isArray(v) && v.length >= 2 && v.every(x => x === null || (deref(x, byId) || {}).__obj === o.__obj)) return k;
    return null;
  }
  function trieHtml(name, root, field, byId, hi) {
    const endKey = Object.keys(root.f || {}).find(k => /end|word|leaf|terminal|isEnd/i.test(k) && typeof root.f[k] === 'boolean');
    const nodes = []; let leaves = 0;
    const build = (o, label, depth) => {
      const fv = o.f[field];
      const kids = (Array.isArray(fv) ? fv.map((x, n) => [fv.length === 26 ? String.fromCharCode(97 + n) : n, x]) : (fv || {}).__map || []).map(([k, x]) => [k, deref(x, byId)]).filter(([, x]) => x);
      // An N-ary tree (children list, nodes that hold a value) is labelled by value; a trie by the edge's letter.
      const own = Array.isArray(fv) && fv.length !== 26 ? nodeLabel(o) : o.__obj;
      const n = { id: o.id, label: own !== o.__obj ? own : label, depth, end: endKey ? o.f[endKey] === true : false, kids: [] };
      nodes.push(n);
      if (depth < 9) for (const [k, x] of kids.slice(0, 26)) n.kids.push(build(x, pshow(k), depth + 1));
      if (!n.kids.length) n.x = leaves++;
      else n.x = (n.kids[0].x + n.kids[n.kids.length - 1].x) / 2;
      return n;
    };
    const tree = build(root, '', 0);
    const depth = Math.max(...nodes.map(n => n.depth));
    const W = Math.max(160, (leaves) * 44), H = 48 * (depth + 1);
    const X = n => 22 + n.x * 44, Y = n => 24 + n.depth * 48;
    let edges = '', circles = '';
    const draw = n => { for (const c of n.kids) { edges += `<line x1="${X(n)}" y1="${Y(n)}" x2="${X(c)}" y2="${Y(c)}"/>`; draw(c); } };
    draw(tree);
    for (const n of nodes) {
      const h = hi[n.id];
      circles += `<g class="${h ? 'on' : ''}${n.end ? ' end' : ''}"><circle cx="${X(n)}" cy="${Y(n)}" r="15"/>${n.end ? `<circle class="ring" cx="${X(n)}" cy="${Y(n)}" r="11"/>` : ''}<text x="${X(n)}" y="${Y(n) + 4}" text-anchor="middle">${esc(n.label || '·')}</text>${h ? `<text class="lbl" x="${X(n)}" y="${Y(n) - 19}" text-anchor="middle">${esc(h.join(' '))}</text>` : ''}</g>`;
    }
    return `<div class="qt-arr"><div class="qt-name">${esc(name)} <small>${esc(root.__obj)} tree${endKey ? ` · double ring = ${esc(endKey)}` : ''}</small></div><svg class="qt-tree" viewBox="0 -6 ${W} ${H + 4}" style="max-width:${W}px" role="img" aria-label="The ${esc(name)} structure">${edges}${circles}</svg></div>`;
  }
  function chainFrom(o, byId) {
    const out = [], seen = new Set();
    let cur = o;
    while (cur && cur.__obj && !seen.has(cur.id) && out.length < 30) { seen.add(cur.id); out.push(cur); cur = deref(cur.f.next, byId); }
    return out;
  }
  function objHtml(snap, hi, info) {
    const byId = objIndex(snap);
    const root = snap && snap.__obj ? snap : null;
    if (!root) return '';
    const parts = [], chips = [];
    const chainShown = new Set();
    const fields = Object.entries(root.f || {});
    for (const [name, raw] of fields) {
      const v = deref(raw, byId);
      if (isPrim(v)) { chips.push(`<span class="qt-chip"><b>self.${esc(name)}</b> ${esc(pshow(v))}</span>`); continue; }
      if (Array.isArray(v)) {
        const kind = info?.heap.has(`self.${name}`) || /heap|pq/i.test(name) ? (v.length && v.every(x => typeof x === 'number' && x <= 0) ? 'max-heap' : 'heap') : info?.stack.has(`self.${name}`) || /stack|stk/i.test(name) ? 'stack' : info?.queue.has(`self.${name}`) || /queue|q$/i.test(name) ? 'queue' : '';
        const cells = v.map(x => (isPrim(x) ? pshow(x) : Array.isArray(x) ? `(${x.map(pshow).join(', ')})` : x && x.__obj ? nodeLabel(x) : '…'));
        parts.push(`<div class="qt-arr"><div class="qt-name">self.${esc(name)}${kind ? ` <small>${kind}${kind === 'stack' ? ' · top →' : kind === 'heap' ? ' · smallest first' : kind === 'max-heap' ? ' · stored negated, largest first' : ''}</small>` : ''}</div><div class="qt-row">${cells.map((c, i) => `<div class="qt-cell"><span class="qt-v">${esc(c)}</span><span class="qt-i">${i}</span><span class="qt-p"></span></div>`).join('') || '<span class="qf-muted">empty</span>'}</div></div>`);
        continue;
      }
      if (v && v.__obj) {
        const tf = trieField(v, byId);
        if (tf) { parts.push(trieHtml(`self.${name}`, v, tf, byId, hi)); continue; }
        if ('next' in (v.f || {})) {
          if (chainShown.has(v.id)) continue;
          const chain = chainFrom(v, byId);
          chain.forEach(n => chainShown.add(n.id));
          parts.push(`<div class="qt-arr"><div class="qt-name">self.${esc(name)} <small>linked list from here${'prev' in v.f ? ' · doubly linked' : ''}</small></div><div class="qt-chain">${chain.map(n => `<span class="qt-node${hi[n.id] ? ' ptr' : ''}" title="${esc(hi[n.id]?.join(' ') || '')}">${esc(nodeLabel(n))}${hi[n.id] ? `<small class="qt-hl">${esc(hi[n.id].join(' '))}</small>` : ''}</span>`).join('<span class="qt-arrow" aria-hidden="true">⇄</span>')}</div></div>`);
          continue;
        }
        chips.push(`<span class="qt-chip"><b>self.${esc(name)}</b> ${esc(nodeLabel(v))}</span>`);
        continue;
      }
      if (v && (v.__map || v.__set)) {
        const rows = v.__map ? v.__map.map(([k, x]) => { const d = deref(x, byId); return [pshow(isPrim(k) ? k : Array.isArray(k) ? `(${k.map(pshow).join(', ')})` : '…'), isPrim(d) ? pshow(d) : Array.isArray(d) ? `[${d.map(y => (isPrim(y) ? pshow(y) : Array.isArray(y) ? `(${y.map(pshow).join(', ')})` : '…')).join(', ')}]` : d && d.__obj ? `→ ${nodeLabel(d)}` : '…']; }) : v.__set.map(x => [isPrim(x) ? pshow(x) : '…']);
        parts.push(`<div class="qt-maps"><div class="qt-map"><div class="qt-name">self.${esc(name)} <small>${v.__set ? 'set' : 'dict'} · ${rows.length}</small></div><ul>${rows.slice(0, 16).map(r => `<li>${r.map(c => `<span>${esc(c)}</span>`).join('')}</li>`).join('')}${rows.length > 16 ? `<li class="qf-muted">… ${rows.length - 16} more</li>` : ''}</ul></div></div>`);
      }
    }
    return `<div class="qt-obj">${parts.join('')}${chips.length ? `<div class="qt-scal">${chips.join('')}</div>` : ''}</div>`;
  }

  const fixEmptySets = v => {
    if (Array.isArray(v)) return v.map(fixEmptySets);
    if (v && v.__set) return { __set: v.__set.filter(x => x !== '\u0001').map(fixEmptySets) };
    if (v && v.__map) return { __map: v.__map.map(([k, x]) => [fixEmptySets(k), fixEmptySets(x)]) };
    return v;
  };
  const parseLocal = raw => { const p = tryParse(raw); if (p.ok) p.v = fixEmptySets(p.v); return p; };
  const LIST_RE = /^ListNode\((.*)\)$/;
  function parseChain(body) {
    let back = null, trunc = false, t = body.trim();
    const mb = / \^(\d+)$/.exec(t); if (mb) { back = Number(mb[1]); t = t.slice(0, mb.index); }
    if (/ \.\.\.$/.test(t)) { trunc = true; t = t.replace(/ \.\.\.$/, ''); }
    const nodes = t ? t.split(' -> ').map(x => { const m = /^(.*)#(\d+)$/.exec(x.trim()); return m ? { v: m[1], id: Number(m[2]) } : { v: x.trim(), id: x.trim() }; }) : [];
    return [nodes, back, trunc];
  }
  const shortNode = x => String(x ?? '').replace(/^TreeNode\((.*)#\d+\)$/, 'node $1').replace(/^ListNode\((-?[^#\s]*)#\d+.*\)$/, 'node $1').replace(/^ListNode\(\)$/, 'None').replace(/#\d+/g, '').replace(/@\d+$/, '').replace(/^(\w+)\((?:key|val)=([^,)]*).*\)$/, '$1 $2');
  const ROLE_PTR = /^(l|r|lo|hi|low|high|left|right|start|end|mid|goal|maxJump|farthest|far|maxReach|reach|boundary|top|bot|bottom)$/;

  function frameHtml(step, prev, codeLines, ctx = {}) {
    const info = ctx.info || analyze(codeLines.join('\n'));
    const steps = ctx.steps || [step];
    const i = ctx.i ?? 0;
    prepareTrace(steps, info);
    const depth = step.depth || 0;
    const outer = depth > 1 ? (carried(steps, i, 'outer') || {}) : {};
    const ownLocals = step.locals || {};
    const alias = {};
    for (const [k, v] of Object.entries(ownLocals)) for (const [ok, ov] of Object.entries(outer)) if (v === ov && /^[[{]|^ListNode|^defaultdict|^deque/.test(v) && v.length > 2 && ok !== k) alias[k] = ok;
    const dropOuter = new Set(Object.values(alias));
    const entries = [
      ...Object.entries(ownLocals).map(([k, v]) => [k, v, false]),
      ...Object.entries(outer).filter(([k]) => !(k in ownLocals) && !dropOuter.has(k)).map(([k, v]) => [k, v, true]),
    ].filter(([k, v]) => !info.comp.has(k) && !/^<(function|bound method|class|module|built-in)/.test(v));
    const live = k => info.liveVar(k, step.line);
    const ints = {};
    for (const [k, v, isOuter] of entries) if (!isOuter && /^-?\d+$/.test(v) && live(k)) ints[k] = Number(v);
    const scope = { ...ints };
    const lens = {};
    const prevSame = prev && (prev.depth || 0) === depth && !('stack' in step) ? prev : null;
    const wasOf = (k, isOuter) => (!isOuter && prevSame && k in (prevSame.locals || {}) && prevSame.locals[k] !== ownLocals[k] ? parseLocal(prevSame.locals[k]) : null);
    const label = (k, isOuter) => (alias[k] ? `${k} = ${alias[k]}` : isOuter ? `${k} (outer)` : k);
    const parsed = entries.map(([k, raw, isOuter]) => [k, raw, isOuter, parseLocal(raw)]);
    for (const [k, , , p] of parsed) if (p.ok && (Array.isArray(p.v) || typeof p.v === 'string')) lens[k] = p.v.length;
    const lineSubs = info.lineSubs[step.line] || [];
    const readsFor = (k, len) => {
      const reads = {}, writes = new Set();
      for (const s2 of lineSubs) {
        if (s2.arr !== k || s2.e2 != null) continue;
        const idx = evalIdx(s2.e1, scope, lens);
        if (idx == null) continue;
        const n = idx < 0 && len != null ? len + idx : idx;
        if (s2.write) writes.add(n);
        else if (/^\s*-?\d+\s*$/.test(s2.e1)) (reads[n] ||= []);
        else if (!bareOf(s2.e1) || !(s2.e1.trim() in ints)) (reads[n] ||= []).push(s2.e1.replace(/\s+/g, ''));
      }
      return { reads, writes };
    };
    const reads2For = (k, R, C) => {
      const reads = {}, writes = new Set(), at = [];
      for (const s2 of lineSubs) {
        if (s2.arr !== k || s2.e2 == null) continue;
        let r = evalIdx(s2.e1, scope, lens), c = evalIdx(s2.e2, scope, lens);
        if (r == null || c == null) continue;
        if (r < 0) r += R; if (c < 0) c += C;
        const key = `${r},${c}`;
        if (s2.write) writes.add(key); else (reads[key] ||= []).push(`[${s2.e1.trim()}][${s2.e2.trim()}]`);
        at.push([r, c]);
      }
      return { reads, writes, at };
    };

    const parts = [], chips = [], bitRows = [];
    const treePtrs = {}, treeQueued = new Set();
    const chains = [], listLabels = {}, nones = [];
    const queued = new Set(), seen = new Set();
    const maps = [], grids = [];
    const strs = parsed.filter(([, , , p]) => p.ok && typeof p.v === 'string').map(([k, , , p]) => [k, p.v]);
    // primary 1-D array: the one the code subscripts most (role pointers go there)
    const arr1 = parsed.filter(([k, , , p]) => p.ok && Array.isArray(p.v) && p.v.every(isScalar));
    const primary = arr1.filter(([k]) => info.sub[k]?.size).sort((a, b) => (info.sub[b[0]]?.size || 0) - (info.sub[a[0]]?.size || 0))[0]?.[0];
    const boundAnywhere = new Set(Object.values(info.sub).flatMap(s3 => [...s3]));

    const ptrsFor = (k, len, isOuter) => {
      const ptrs = {};
      if (isOuter) return ptrs;
      for (const n of info.sub[k] || []) if (n in ints && n !== k && live(n)) ptrs[n] = ints[n];
      for (const [n, v] of Object.entries(ints)) {
        if (n in ptrs || n === k || !ROLE_PTR.test(n)) continue;
        if (!info.lenOf[n] && !info.windowVars.has(n) && !(n === 'mid' || n === 'm')) continue;
        const target = info.lenOf[n] || (boundAnywhere.has(n) ? null : primary);
        if (target === k && v >= -1 && v <= len) ptrs[n] = v;
      }
      if ('m' in ints && 'l' in ptrs && 'r' in ptrs && !('m' in ptrs) && ints.m >= 0 && ints.m < len && !('n' in ints)) ptrs.m = ints.m;
      return ptrs;
    };
    const curFor = (k, arr) => {
      const fe = info.forEach.find(f => f.arr === k && step.line >= f.line && step.line < f.to && f.vars.some(n => n in ownLocals));
      if (!fe) return null;
      if (fe.indexVar && fe.indexVar in ints) return null;
      let pos = iterPos(steps, i, fe);
      if (arr && fe.vars.length === 1 && Array.isArray(arr)) {
        // sets/dicts iterate in their own order: find the held value instead
        const held = parseLocal(ownLocals[fe.vars[0]] ?? '');
        if (held.ok && (pos < 0 || pos >= arr.length || JSON.stringify(arr[pos]) !== JSON.stringify(held.v))) {
          const at = arr.findIndex(x => JSON.stringify(x) === JSON.stringify(held.v));
          if (at >= 0 && (pos < 0 || pos >= arr.length)) pos = at;
        }
      }
      return pos >= 0 && pos < (arr ? arr.length : 1e9) ? { pos, name: fe.vars.join(', ') } : null;
    };

    for (const [k, raw, isOuter, p] of parsed) {
      const ord = info.orderOf(k) + (isOuter ? 0.5 : 0);
      const name = label(k, isOuter);
      let m;
      if ((m = /^TreeNode\((.*)#(\d+)\)$/.exec(raw))) { if (!isOuter) (treePtrs[m[2]] ||= []).push(k); continue; }
      if ((m = LIST_RE.exec(raw))) { const [nodes, back, trunc] = parseChain(m[1]); if (nodes.length) { if (!isOuter || !alias[k]) (listLabels[nodes[0].id] ||= []).push(isOuter ? `${k} (outer)` : k); chains.push([k, nodes, back, trunc]); } continue; }
      if (raw === 'None' && info.hasLists && !info.hasTrees && /(^|_)(head|prev|cur|curr|node|slow|fast|tail|dummy|l1|l2|first|second|nxt|next|tmp|left|right|p|q|list\d?)$/i.test(k)) { if (!isOuter) nones.push(k); continue; }
      if (raw === 'None' && info.hasTrees && /(^|_)(root|node|cur|curr|p|q|left|right|subRoot|t)$/i.test(k)) continue;
      if (/^Node\((-?\d+)/.test(raw)) { chips.push([ord, name, `node ${/^Node\((-?\d+)/.exec(raw)[1]}`, isOuter]); continue; }
      if (/@\d+$/.test(raw) && carried(steps, i, 'obj')) continue;   // shown on the object picture
      if (!p.ok) { chips.push([ord, name, shortNode(raw), isOuter]); continue; }
      const v = p.v, was = wasOf(k, isOuter), wasV = was?.ok ? was.v : null;
      // nodes inside containers
      if (Array.isArray(v)) for (const x of v) { if (typeof x === 'string') { const t = /^⟨.*#(\d+)⟩$/.exec(x); if (t) treeQueued.add(t[1]); } }
      if (Array.isArray(v) && v.length && v.every(x => typeof x === 'string' && /^[^⟨]*#\d+(→|$)/.test(x))) {
        v.forEach((x, n) => { const [nodes, back, trunc] = parseChain(x.replace(/→/g, ' -> ')); if (nodes.length) { (listLabels[nodes[0].id] ||= []).push(`${k}[${n}]`); chains.push([`${k}[${n}]`, nodes, back, trunc]); } });
        continue;
      }
      if (typeof v === 'string') {
        if ((info.sub[k] || info.iterated.has(k) || info.probed.has(k)) && v.length >= 1 && v.length <= 60) {
          const { reads, writes } = readsFor(k, v.length);
          parts.push([ord, arrayHtml({ name, a: [...v], kind: 'string', ptrs: ptrsFor(k, v.length, isOuter), cur: isOuter ? null : curFor(k, [...v]), was: typeof wasV === 'string' ? [...wasV] : null, reads, writes, dim: isOuter })]);
        } else chips.push([ord, name, `'${v.length > 50 ? v.slice(0, 48) + '…' : v}'`, isOuter, !isOuter && !live(k)]);
        continue;
      }
      if (isScalar(v)) {
        if (info.isBits && Number.isInteger(v) && v >= 0 && v < 2 ** 32 && !isOuter) { const w0 = wasV; bitRows.push([k, v, Number.isInteger(w0) ? w0 : null]); continue; }
        chips.push([ord, name, cell(v), isOuter, !isOuter && !live(k)]);
        continue;
      }
      const kind0 = info.heap.has(k) ? 'heap' : info.stack.has(k) ? 'stack' : info.queue.has(k) || p.kind === 'deque' ? 'queue' : '';
      if (Array.isArray(v)) {
        const allScalar = v.every(isScalar);
        const allLists = v.length > 0 && v.every(x => Array.isArray(x) && x.every(isScalar));
        const kind = kind0 === 'heap' && v.length && v.every(x => (isNum(x) && x <= 0) || (Array.isArray(x) && isNum(x[0]) && x[0] <= 0)) && /-\s*\w+|-\s*count|-\s*cnt|\[-/.test(codeLines.join('\n')) ? 'max-heap' : kind0;
        if (kind) {
          for (const x of v) if (Array.isArray(x) && x.length >= 2) { const a = x.slice(-2); if (a.every(Number.isInteger)) queued.add(`${a[0]},${a[1]}`); }
          const { reads, writes } = readsFor(k, v.length);
          parts.push([ord, arrayHtml({ name, a: v, kind, ptrs: ptrsFor(k, v.length, isOuter), cur: null, was: Array.isArray(wasV) ? wasV : null, reads, writes, dim: isOuter })]);
          continue;
        }
        if (allScalar && v.length <= 60) {
          if (/^(par|parent|parents|root|uf)$/i.test(k) && v.every(x => Number.isInteger(x) && x >= 0 && x < v.length) && v.length <= 30) {
            parts.push([ord, graphHtml({ name, m: { __map: v.map((x, n) => [n, [x]]) }, cur: new Set(Object.entries(ints).filter(([n]) => /^(n|n1|n2|p|p1|p2|x|y|u|v|res|node)$/.test(n)).map(([, x]) => JSON.stringify(x))), visited: new Set(), active: new Set(), forest: true, dim: isOuter })]);
          }
          const { reads, writes } = readsFor(k, v.length);
          const bars = /^(heights?|prices|temperatures|elevation|hist|piles)$/i.test(k) && v.every(x => isNum(x) && x >= 0);
          const fe = info.forEach.find(f => f.arr === k && f.indexVar && f.indexVar in ints && step.line >= f.line && step.line < f.to);
          const ptrs = ptrsFor(k, v.length, isOuter);
          if (fe) ptrs[fe.indexVar] = ints[fe.indexVar];
          const headers = v.length === 26 && lineSubs.concat(...Object.values(info.lineSubs)).some(s2 => s2.arr === k && /ord\(/.test(s2.e1)) ? Array.from({ length: 26 }, (_, n) => String.fromCharCode(97 + n)) : null;
          parts.push([ord, arrayHtml({ name, a: v, kind: '', ptrs, cur: isOuter ? null : curFor(k, v), was: Array.isArray(wasV) ? wasV : null, bars, reads, writes, dim: isOuter, headers })]);
          continue;
        }
        if (info.graphNames.has(k) && allLists) {
          const mm = new Map();
          for (const x of v) { const key = JSON.stringify(x[0]); if (!mm.has(key)) mm.set(key, [x[0], []]); mm.get(key)[1].push(x.length === 3 ? [x[1], x[2]] : x[1]); }
          const g = graphHtml({ name, m: { __map: [...mm.values()] }, cur: new Set(), visited: new Set(), active: new Set(), dim: isOuter });
          if (g) { parts.push([ord, g]); continue; }
        }
        const pairs = allLists && v.every(x => x.length === 2 && x.every(isNum));
        const ivName = n => /interval|meeting|schedule|booking|ranges?$|segment|^times?$/i.test(n);
        const ivLike = ivName(k) || (/^(res|output|merged|ans|result)$/i.test(k) && parsed.some(([n2]) => ivName(n2))) || info.forEach.some(f => f.arr === k && f.vars.length === 2 && /^(s|start|l|left|a)/i.test(f.vars[0]) && /^(e|end|r|right|b)/i.test(f.vars[1]));
        if (pairs && ivLike && !info.sub2[k] && v.every(x => x[0] <= x[1]) && v.length <= 40) {
          const extra = parsed.filter(([n, , io, q]) => n !== k && !io && q.ok && Array.isArray(q.v) && q.v.length === 2 && q.v.every(isNum) && q.v[0] <= q.v[1] && /interval|new|cur|last|prev|merged/i.test(n)).map(([n, , , q]) => [n, q.v]);
          const ticks = Object.entries(ints).filter(([n]) => /end|start|prev|last|q$|query|time/i.test(n) && live(n)).slice(0, 3);
          const cur = (isOuter ? null : curFor(k, v)) || (() => { for (const n of info.sub[k] || []) if (n in ints) return { pos: ints[n], name: n }; return null; })();
          parts.push([ord, intervalsHtml({ name, iv: v, cur, extra, ticks, dim: isOuter })]);
          continue;
        }
        const cellsOk = allLists && v.every(x => x.every(y => isNum(y) || typeof y === 'boolean' || y === null || (typeof y === 'string' && y.length <= 2)));
        const rect = cellsOk && v.every(x => x.length === v[0].length) && v[0].length > 0;
        if (rect && (info.sub2[k] || /grid|board|matrix|mat$|dp|image|table|heights|land|rooms|isWater|cache|memo|^t$/i.test(k)) && v.length <= 26 && v[0].length <= 26) { grids.push([ord, k, name, v, wasV, isOuter]); continue; }
        if (v.every(x => Array.isArray(x) || isScalar(x)) && v.length <= 40) { parts.push([ord, rowsHtml({ name, rows: v, was: Array.isArray(wasV) ? wasV : null, cur: isOuter ? null : curFor(k, v), dim: isOuter })]); continue; }
        chips.push([ord, name, brief(v, 60), isOuter]);
        continue;
      }
      if (v && (v.__map || v.__set)) { maps.push([ord, k, name, v, kind0 || p.kind, wasV, isOuter]); continue; }
      chips.push([ord, name, brief(v, 60), isOuter]);
    }

    // sets: (r, c) pairs shade grids; scalar sets become sorted rows; graph colouring
    const visitedKeys = new Set(), activeKeys = new Set(), seenSets = [];
    for (const [, k, , v] of maps) {
      if (v.__set) {
        const pr = v.__set.filter(x => Array.isArray(x) && x.length === 2 && x.every(Number.isInteger));
        if (pr.length && pr.length === v.__set.length) { pr.forEach(x => seen.add(`${x[0]},${x[1]}`)); seenSets.push([k, new Set(pr.map(x => `${x[0]},${x[1]}`))]); }
        for (const x of v.__set) (/visiting|path|cycle|onpath|stack|curpath/i.test(k) ? activeKeys : visitedKeys).add(JSON.stringify(x));
      } else if (v.__map && v.__map.length && v.__map.every(([, x]) => typeof x === 'boolean')) {
        for (const [key, x] of v.__map) (x ? activeKeys : visitedKeys).add(JSON.stringify(key));
      }
    }
    const gridDims = grids.map(([, , , g]) => [g.length, g[0].length]);
    for (const [ord, k, name, v, kind, wasV, isOuter] of maps) {
      const hiKeys = new Set();
      if (!isOuter) for (const n of info.sub[k] || []) if (n in ownLocals && live(n)) hiKeys.add(JSON.stringify(parseLocal(ownLocals[n]).v));
      const fe = info.forEach.find(f => f.arr === k && step.line >= f.line && step.line < f.to);
      if (fe && fe.vars[0] in ownLocals) hiKeys.add(JSON.stringify(parseLocal(ownLocals[fe.vars[0]]).v));
      for (const s2 of lineSubs) if (s2.arr === k && s2.e2 == null) { const idx = evalIdx(s2.e1, scope, lens); if (idx != null) hiKeys.add(JSON.stringify(idx)); else { const b = bareOf(s2.e1); if (b && b in ownLocals) hiKeys.add(JSON.stringify(parseLocal(ownLocals[b]).v)); } }
      if (info.graphNames.has(k) && v.__map) {
        const used = [];
        if (info.graphNodeAt && k in info.graphNodeAt) v.nodeAt = info.graphNodeAt[k];
        const first = info.graphFirst?.[k];
        const g = graphHtml({ name, m: v, cur: hiKeys, visited: visitedKeys, active: activeKeys, used, dim: isOuter });
        if (g) { parts.push([ord, g]); continue; }
      }
      if (v.__map && v.__map.length && v.__map.every(([key]) => Array.isArray(key) && key.length === 2 && key.every(Number.isInteger)) && v.__map.every(([, x]) => isScalar(x))) {
        const ks = v.__map.map(([key]) => key);
        const tk = info.subTuple[k];
        const hiKey = tk && tk.every(n => n in ints) ? `${ints[tk[0]]},${ints[tk[1]]}` : null;
        const reads = {};
        for (const s2 of lineSubs) if (s2.arr === k && s2.e2 == null) { const tp = s2.e1.replace(/^\s*\(|\)\s*$/g, '').split(','); if (tp.length === 2) { const a = evalIdx(tp[0], scope, lens), b = evalIdx(tp[1], scope, lens); if (a != null && b != null) (reads[`${a},${b}`] ||= []).push(s2.e1); } }
        const fixed = gridDims.find(([R, C]) => ks.every(([a, b]) => a >= 0 && b >= 0 && a < R && b < C));
        const hdrFor = n => { if (!n) return null; const s3 = strs.find(([sn]) => info.sub[sn]?.has(n)); if (!s3) return null; const ch = [...s3[1]]; return info.suffix ? [...ch, '∅'] : ch; };
        const spanR = Math.max(...ks.map(x => x[0])) - Math.min(...ks.map(x => x[0])), spanC = Math.max(...ks.map(x => x[1])) - Math.min(...ks.map(x => x[1]));
        if (spanR <= 30 && spanC <= 40) { parts.push([ord, memoHtml({ name, entries: v.__map, hiKey, axis: tk, rowHdr: hdrFor(tk?.[0]), colHdr: hdrFor(tk?.[1]), fixed, reads })]); continue; }
      }
      if (v.__map && v.__map.length && v.__map.every(([key, x]) => Number.isInteger(key) && key >= 0 && key <= 60 && isScalar(x)) && /dp|memo|cache|count|freq/i.test(k)) {
        const mx = Math.max(...v.__map.map(([key]) => key));
        const arr = Array.from({ length: mx + 1 }, () => '·');
        for (const [key, x] of v.__map) arr[key] = x;
        const reads = {}; for (const s2 of lineSubs) if (s2.arr === k) { const idx = evalIdx(s2.e1, scope, lens); if (idx != null && !s2.write) (reads[idx] ||= []).push(s2.e1.replace(/\s+/g, '')); }
        parts.push([ord, arrayHtml({ name: `${name} (dict by index)`, a: arr, kind: '', ptrs: ptrsFor(k, arr.length, isOuter), cur: null, was: null, reads, dim: isOuter })]);
        continue;
      }
      if (v.__set && v.__set.length <= 40 && v.__set.every(isScalar) && !(v.__set.length && v.__set.every(x => Array.isArray(x)))) {
        const sorted = v.__set.slice().sort((a, b) => (isNum(a) && isNum(b) ? a - b : String(a) < String(b) ? -1 : 1));
        const held = fe && fe.vars[0] in ownLocals ? parseLocal(ownLocals[fe.vars[0]]).v : undefined;
        const cur = held !== undefined ? { pos: sorted.findIndex(x => JSON.stringify(x) === JSON.stringify(held)), name: fe.vars[0] } : null;
        parts.push([ord, arrayHtml({ name, a: sorted, kind: 'set', ptrs: {}, cur: cur && cur.pos >= 0 ? cur : null, was: null, dim: isOuter })]);
        continue;
      }
      if (v.__set && v.__set.length && v.__set.every(x => Array.isArray(x) && x.length === 2 && x.every(Number.isInteger)) && grids.length) { chips.push([ord, name, `${v.__set.length} cells (grey on the grid)`, isOuter]); continue; }
      parts.push([ord, `<div class="qt-maps">${mapHtml({ name, m: v, kind: v.__set ? 'set' : kind, hiKeys, was: wasV, dim: isOuter })}</div>`]);
    }
    for (const [ord, k, name, g, wasV, isOuter] of grids) {
      const R = g.length, C = g[0].length;
      const sub = info.sub2[k];
      const rowsHi = new Set(), colsHi = new Set(), rowNames = {}, colNames = {};
      let { reads, writes, at } = isOuter ? { reads: {}, writes: new Set(), at: [] } : reads2For(k, R, C);
      if (sub && !isOuter) {
        const rs = [...sub.r].filter(n => n in ints), cs = [...sub.c].filter(n => n in ints);
        rs.forEach(n => { rowsHi.add(ints[n]); (rowNames[ints[n]] ||= []).push(n); });
        cs.forEach(n => { colsHi.add(ints[n]); (colNames[ints[n]] ||= []).push(n); });
        if (!at.length && rs.length && cs.length) at = [[ints[rs[0]], ints[cs[0]]]];
      }
      for (const [n, x] of Object.entries(ints)) {
        if (/^(top|bot|bottom)$/.test(n) && !info.colVars.has(n) && x >= 0 && x <= R) (rowNames[x] ||= []).includes(n) || rowNames[x].push(n);
        if (/^(left|right)$/.test(n) && !primary && !info.rowVars.has(n) && x >= 0 && x <= C) (colNames[x] ||= []).includes(n) || colNames[x].push(n);
      }
      const hdr = (axisVars, len) => {
        if (!axisVars || !/dp|memo|cache|table|grid|t$/i.test(k) && !info.suffix && R * C > 0 && !strs.length) return null;
        const s3 = strs.find(([sn, sv]) => [...(axisVars || [])].some(n => info.sub[sn]?.has(n)) && (sv.length === len || sv.length + 1 === len));
        if (!s3) return null;
        const ch = [...s3[1]];
        return ch.length === len ? ch : info.suffix ? [...ch, '∅'] : ['∅', ...ch];
      };
      const named = seenSets.slice(0, 2);
      parts.push([ord, gridHtml({ name, g, was: Array.isArray(wasV) ? wasV : null, at, rowsHi, colsHi, queued: sub ? queued : new Set(), seen: sub && named.length < 2 ? seen : new Set(), seenA: sub && named.length === 2 ? named : null, rowHdr: hdr(sub?.r, R), colHdr: hdr(sub?.c, C), reads, writes, rowNames, colNames, dim: isOuter })]);
    }

    // trees: every TreeNode argument (or the tree being built), the call path, returned values
    let treesHtml = '';
    const trees = carried(steps, i, 'trees') || (carried(steps, i, 'tree') ? [['tree', carried(steps, i, 'tree')]] : null);
    if (trees) {
      const path = new Set(carried(steps, i, 'path') || []);
      const badges = {};
      const multi = info.retFns.size > 1;
      let from = 0;
      for (let k = i; k > 0; k--) if ('trees' in steps[k]) { from = k; break; }
      for (let k = from; k <= i; k++) if (steps[k].retnode != null && (!multi || steps[k].func === step.func) && steps[k].retval !== 'None') badges[steps[k].retnode] = shortNode(steps[k].retval);
      treesHtml = trees.map(([n, t]) => treeHtml(n, t, treePtrs, treeQueued, path, badges).html || '').join('');
      if (multi) treesHtml = treesHtml.replace('↑ = returned', `↑ = returned by ${esc(step.func)}()`);
    }

    const objSnap = carried(steps, i, 'obj');
    const opLabel = carried(steps, i, 'op');
    const objHi = {};
    for (const [k, raw] of Object.entries(ownLocals)) { const m3 = /@(\d+)$/.exec(raw); if (m3) (objHi[m3[1]] ||= []).push(k); }
    const stack = carried(steps, i, 'stack');
    const board = !grids.length && isRecursive(stack) ? boardFor(steps, i) : null;
    const span = ctx.codeWindow ?? 5;   // lines shown either side of the current one
    const lo = Math.max(1, step.line - span), hi = Math.min(codeLines.length, step.line + span);
    const ran = prevSame && prevSame.line !== step.line ? prevSame.line : null;
    parts.sort((a, b) => a[0] - b[0]);
    chips.sort((a, b) => a[0] - b[0]);
    return `
      <div class="qt-code" aria-label="Next to run: line ${step.line}">${codeLines.slice(lo - 1, hi).map((l, k) => `<div class="${lo + k === step.line ? 'on' : lo + k === ran ? 'ran' : ''}"><i>${lo + k}</i>${codeCell(l)}${lo + k === step.line ? `<em>${step.event === 'return' ? 'returning' : 'next'}</em>` : lo + k === ran ? '<em>just ran</em>' : ''}</div>`).join('')}</div>
      <div class="qt-vis">
        ${opLabel ? `<div class="qt-op">Call ${esc(opLabel)}</div>` : ''}
        ${objSnap ? objHtml(objSnap, objHi, info) : ''}
        ${treesHtml}
        ${chains.length || nones.length ? listsHtml(chains, listLabels, nones, new Set()) : ''}
        ${board ? boardHtml(board) : ''}
        ${parts.map(([, h]) => h).join('')}
        ${bitRows.length ? bitsHtml(bitRows) : ''}
        ${chips.length ? `<div class="qt-scal">${chips.map(([, k, v, isOuter, stale]) => `<span class="qt-chip${isOuter ? ' dim' : ''}${stale ? ' stale' : ''}${!isOuter && prevSame && prevSame.locals?.[k] !== ownLocals[k] && k in ownLocals ? ' ch' : ''}"${stale ? ' title="loop finished"' : ''}><b>${esc(k)}</b> ${esc(String(v).slice(0, 60))}</span>`).join('')}</div>` : ''}
        ${stackHtml(stack)}
        ${step.event === 'return' ? `<div class="qt-ret">${esc(step.func || '')}() returns ${esc(shortNode(step.retval))}</div>` : ''}
        ${step.event === 'exception' ? `<div class="qt-ret bad">raises ${esc(step.exc ?? '')}</div>` : ''}
      </div>`;
  }

  // ------------------------------------------------------------ the note --
  const indentOf = l => (String(l || '').match(/^\s*/) || [''])[0].length;
  function substitute(expr, locals) {
    let changed = false;
    const sc = {}, ln = {}, arrs = {};
    for (const [n, raw] of Object.entries(locals || {})) {
      if (/^-?\d+$/.test(raw)) sc[n] = Number(raw);
      const p = parseLocal(raw);
      if (p.ok && (Array.isArray(p.v) || typeof p.v === 'string')) { ln[n] = p.v.length; arrs[n] = p.v; }
    }
    expr = expr.replace(/len\(\s*([\w.]+)\s*\)/g, (w, n) => (n in ln ? (changed = true, String(ln[n])) : w));
    for (let pass = 0; pass < 2; pass++) {
      expr = expr.replace(/([A-Za-z_][\w.]*)\[([^\[\]]+)\](?:\[([^\[\]]+)\])?/g, (w, n, a, b) => {
        const A = arrs[n]; if (!A) return w;
        let i1 = evalIdx(a, sc, ln); if (i1 == null) return w; if (i1 < 0) i1 += A.length;
        let x = A[i1];
        if (b != null) { if (!Array.isArray(x)) return w; let i2 = evalIdx(b, sc, ln); if (i2 == null) return w; if (i2 < 0) i2 += x.length; x = x[i2]; }
        if (x === undefined) return w;
        changed = true;
        return typeof x === 'string' ? `'${x}'` : cell(x);
      });
    }
    const out = expr.replace(/(?<![.\w'"])([A-Za-z_]\w*)(?![\w(])/g, (w, n) => {
      if (KW.has(n) || !(n in locals)) return w;
      const raw = locals[n];
      if (/^-?\d+(\.\d+)?$/.test(raw) || raw === 'True' || raw === 'False' || raw === 'None' || /^'.{0,6}'$/.test(raw)) { changed = true; return raw; }
      return w;
    });
    return changed && out.length <= 70 ? out : null;
  }
  function noteFor(step, prev, codeLines, ctx = {}) {
    const info = ctx.info || analyze(codeLines.join('\n'));
    const steps = ctx.steps || [step];
    const i = ctx.i ?? 0;
    if (!prev) return `Starts at line ${step.line}: ${(codeLines[step.line - 1] || '').trim()}`;
    const op = carried(steps, i, 'op'), opPrev = i > 0 ? carried(steps, i - 1, 'op') : null;
    if (op && op !== opPrev) return `New call ${op}`;
    const dPrev = prev.depth || 0, d = step.depth || 0;
    const stack = carried(steps, i, 'stack');
    const top = stack && stack.length ? stack[stack.length - 1] : step.func;
    if (d > dPrev) return `Line ${prev.line} calls ${String(top).replace(/\bL\((-?[\w.]+)\)/g, 'node $1').replace(/\bT\((-?[\w.]+)\)/g, 'node $1')}`;
    if (d === dPrev && 'stack' in step && prev.event === 'return') return `${prev.func}() returned ${shortNode(prev.retval).slice(0, 30)} — now ${String(top).replace(/\bL\((-?[\w.]+)\)/g, 'node $1').replace(/\bT\((-?[\w.]+)\)/g, 'node $1')}`;
    if (d < dPrev) return `${prev.func}() returned ${shortNode(prev.retval).slice(0, 40)} — back in ${step.func}() at line ${step.line}`;
    const src = (codeLines[prev.line - 1] || '').trim();
    const head = `Just ran line ${prev.line}`;
    let condSrc = src.replace(/\s+#.*$/, ''), condEnd = prev.line;
    if (/^(if|elif|while)\b/.test(condSrc) && !/:\s*$/.test(condSrc)) {
      for (let k = prev.line; k < Math.min(codeLines.length, prev.line + 8); k++) { condSrc += ' ' + codeLines[k].trim().replace(/\s+#.*$/, ''); condEnd = k + 1; if (/:\s*$/.test(codeLines[k].replace(/\s+#.*$/, ''))) break; }
      condSrc = condSrc.replace(/\(\s+/g, '(').replace(/\s+\)/g, ')').replace(/\s+/g, ' ');
    }
    const cm = /^(if|elif|while)\s+(.+):\s*$/.exec(condSrc);
    if (cm) {
      const ind = indentOf(codeLines[prev.line - 1]);
      let blockEnd = condEnd;
      while (blockEnd < codeLines.length && (codeLines[blockEnd].trim() === '' || indentOf(codeLines[blockEnd]) > ind)) blockEnd++;
      const into = step.line > condEnd && step.line <= blockEnd;
      const sub = substitute(cm[2], prev.locals || {});
      return `${head}: ${cm[1]} ${cm[2]}${sub && sub !== cm[2] ? `  →  ${sub}` : ''}  →  ${into ? 'True' : 'False'}${into ? '' : cm[1] === 'while' ? ' (loop ends)' : ''}`;
    }
    const fm = /^for\s+(.+?)\s+in\s+(.+):\s*(#.*)?$/.exec(src);
    if (fm) {
      const inside = step.line > prev.line && indentOf(codeLines[step.line - 1]) > indentOf(codeLines[prev.line - 1]);
      if (!inside) return `${head}: for ${fm[1]} in ${fm[2]} — loop ends`;
      const vars = fm[1].replace(/[()]/g, '').split(',').map(s => s.trim());
      return `${head}: next iteration — ${vars.map(n => `${n} = ${shortNode(step.locals?.[n] ?? '?').slice(0, 24)}`).join(', ')}`;
    }
    const out = [];
    for (const [k, now] of Object.entries(step.locals || {})) {
      if (info.comp.has(k)) continue;
      const before = prev.locals?.[k];
      if (before === now) continue;
      const nodeTxt = x => { if (LIST_RE.test(x)) { const [ns] = parseChain(LIST_RE.exec(x)[1]); return ns[0] ? `node ${ns[0].v}` : 'None'; } if (/^TreeNode\(/.test(x)) return shortNode(x); if (/@\d+$/.test(x)) return `a ${x.split('(')[0]}`; return null; };
      if (before === undefined) { const q = parseLocal(now); out.push(`${k} = ${nodeTxt(now) || (q.ok ? brief(q.v, 28) : shortNode(now))}`); continue; }
      if (nodeTxt(before) || nodeTxt(now)) { if (!(LIST_RE.test(before) && LIST_RE.test(now))) { out.push(`${k}: ${nodeTxt(before) || shortNode(before)} → ${nodeTxt(now) || shortNode(now)}`); continue; } }
      if (LIST_RE.test(before) && LIST_RE.test(now)) {
        const [na] = parseChain(LIST_RE.exec(before)[1]), [nb] = parseChain(LIST_RE.exec(now)[1]);
        if (na[0] && nb[0] && na[0].id === nb[0].id) {
          const msg = `node ${nb[0].v}.next: ${na[1] ? na[1].v : 'None'} → ${nb[1] ? nb[1].v : 'None'}`;
          if ((na[1]?.id) !== (nb[1]?.id) && !out.includes(msg)) out.push(msg);
          continue;
        }
        out.push(`${k}: ${na[0] ? `node ${na[0].v}` : 'None'} → ${nb[0] ? `node ${nb[0].v}` : 'None'}`);
        continue;
      }
      const a = parseLocal(before), b = parseLocal(now);
      if (a.ok && b.ok && Array.isArray(a.v) && Array.isArray(b.v)) {
        const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
        if (b.v.length === a.v.length + 1 && a.v.every((x, n) => same(x, b.v[n]))) { out.push(`${k} ${info.heap.has(k) ? 'push' : 'append'} ${brief(b.v[b.v.length - 1], 20)}`); continue; }
        if (b.v.length + 1 === a.v.length && b.v.every((x, n) => same(x, a.v[n]))) { out.push(`${k} pop → ${brief(a.v[a.v.length - 1], 20)}`); continue; }
        if (b.v.length + 1 === a.v.length && b.v.every((x, n) => same(x, a.v[n + 1]))) { out.push(`${k} ${info.heap.has(k) ? 'heappop' : 'popleft'} → ${brief(a.v[0], 20)}`); continue; }
        if (a.v.length === b.v.length) {
          const diffs = [];
          b.v.forEach((x, n) => { if (!same(x, a.v[n])) diffs.push(n); });
          if (diffs.length && diffs.length <= 3 && b.v.every(y => !Array.isArray(y))) { diffs.forEach(n => out.push(`${k}[${n}]: ${cell(a.v[n])} → ${cell(b.v[n])}`)); continue; }
          if (diffs.length && diffs.length <= 3 && b.v.every(Array.isArray)) {
            for (const r of diffs) b.v[r].forEach((x, c) => { if (!same(x, a.v[r]?.[c])) out.push(`${k}[${r}][${c}]: ${cell(a.v[r]?.[c])} → ${cell(x)}`); });
            continue;
          }
        }
        if (info.heap.has(k) && a.v.length === b.v.length + 1) { out.push(`${k} heappop`); continue; }
        if (info.heap.has(k) && a.v.length + 1 === b.v.length) { out.push(`${k} heappush`); continue; }
      }
      if (a.ok && b.ok && (a.v?.__map || a.v?.__set) && (b.v?.__map || b.v?.__set)) {
        if (b.v.__set || a.v.__set) {
          const as = (a.v.__set || []).map(x => JSON.stringify(x)), bs = (b.v.__set || []).map(x => JSON.stringify(x));
          const added = bs.filter(x => !as.includes(x)), removed = as.filter(x => !bs.includes(x));
          if (added.length) out.push(`${k} add ${added.slice(0, 2).map(x => cell(JSON.parse(x))).join(', ')}`);
          if (removed.length) out.push(`${k} remove ${removed.slice(0, 2).map(x => cell(JSON.parse(x))).join(', ')}`);
          continue;
        }
        const old = new Map(a.v.__map.map(([x, y]) => [JSON.stringify(x), y]));
        const ch = b.v.__map.filter(([x, y]) => JSON.stringify(old.get(JSON.stringify(x))) !== JSON.stringify(y));
        const keyTxt = x => (Array.isArray(x) ? `(${x.map(cell).join(', ')})` : brief(x, 16));
        ch.slice(0, 2).forEach(([x, y]) => out.push(`${k}[${keyTxt(x)}]: ${old.has(JSON.stringify(x)) ? brief(old.get(JSON.stringify(x)), 14) + ' → ' : ''}${brief(y, 18)}`));
        const nowKeys = new Set(b.v.__map.map(([x]) => JSON.stringify(x)));
        const gone = [...old.keys()].filter(x => !nowKeys.has(x));
        if (gone.length) out.push(`${k} delete ${gone.slice(0, 2).map(x => cell(JSON.parse(x))).join(', ')}`);
        continue;
      }
      out.push(`${k}: ${shortNode(a.ok ? brief(a.v, 22) : before)} → ${shortNode(b.ok ? brief(b.v, 22) : now)}`);
    }
    // design problems / self.* changes
    const objA = i > 0 ? carried(steps, i - 1, 'obj') : null, objB = carried(steps, i, 'obj');
    if (objA && objB && JSON.stringify(objA) !== JSON.stringify(objB)) {
      for (const [f, vb] of Object.entries(objB.f || {})) {
        const va = objA.f?.[f];
        if (JSON.stringify(va) === JSON.stringify(vb)) continue;
        if (Array.isArray(va) && Array.isArray(vb) && vb.length === va.length + 1) out.push(`self.${f} add ${brief(vb[vb.length - 1], 16)}`);
        else if (Array.isArray(va) && Array.isArray(vb) && vb.length + 1 === va.length) out.push(`self.${f} remove one`);
        else out.push(`self.${f} updated`);
      }
    }
    if (!out.length) {
      const asg = /^([\w.\[\]\s,]+?)\s*(\+=|-=|\*=|\/\/=|\/=|%=|=)(?!=)/.exec(src.replace(/\s+#.*$/, ''));
      if (asg) { const tgt = asg[1].trim(); const val = prev.locals?.[tgt]; return `${head} (${src.length > 40 ? src.slice(0, 39) + '…' : src}): ${tgt} unchanged${val != null ? ` (still ${shortNode(val).slice(0, 20)})` : ''}`; }
      return `${head}: ${src.length > 60 ? src.slice(0, 59) + '…' : src}`;
    }
    return `${head} (${src.length > 36 ? src.slice(0, 35) + '…' : src}): ${out.slice(0, 3).join(' · ')}${out.length > 3 ? ` · +${out.length - 3} more` : ''}`;
  }

  // -------------------------------------------------------- the player --
  function player(box, trace, code, title) {
    const lines = code.split('\n');
    const steps = trace.steps || [];
    if (!steps.length && trace.error) {
      const last = String(trace.error).trim().split('\n').filter(Boolean).pop() || trace.error;
      box.innerHTML = `<div class="qt-head"><b>${esc(title)}</b></div>
        <p class="bv-err">This code did not run on the example: ${esc(last)}</p>
        <details><summary>Details</summary><pre class="qf-pre">${esc(trace.error)}</pre></details>`;
      return { stop() {}, steps: 0 };
    }
    let i = 0, timer = null, speed = 1;
    const info = analyze(code);
    prepareTrace(steps, info);
    box.innerHTML = `
      <div class="qt-head"><b>${esc(title)}</b><span class="qt-count"></span></div>
      <div class="qt-stage"></div>
      <p class="qt-note" aria-live="polite"></p>
      <div class="qa-ctl">
        <button type="button" data-a="first" aria-label="Restart">⏮</button>
        <button type="button" data-a="prev" aria-label="Previous step">◀</button>
        <button type="button" data-a="play" class="qa-play">▶ Play</button>
        <button type="button" data-a="next" aria-label="Next step">▶|</button>
        <input type="range" min="0" max="${Math.max(0, steps.length - 1)}" value="0" aria-label="Step">
        <button type="button" data-a="speed" aria-label="Speed">1×</button>
      </div>
      <p class="qt-sum">${steps.length} steps${trace.truncated ? ' (trace cut at 3000)' : ''} · result <code>${esc(trace.result ?? '—')}</code>${trace.error ? ` · <span class="bad">${esc(trace.error)}</span>` : ''}</p>`;
    const stage = box.querySelector('.qt-stage'), note = box.querySelector('.qt-note'), count = box.querySelector('.qt-count');
    const range = box.querySelector('input[type=range]'), play = box.querySelector('.qa-play'), sp = box.querySelector('[data-a=speed]');
    const draw = () => {
      if (!steps.length) { stage.innerHTML = '<p class="qf-muted">No steps were recorded.</p>'; return; }
      stage.innerHTML = frameHtml(steps[i], steps[i - 1], lines, { steps, i, info });
      note.textContent = noteFor(steps[i], steps[i - 1], lines, { steps, i, info });
      count.textContent = `step ${i + 1} / ${steps.length}`;
      range.value = i;
    };
    const stop = () => { clearInterval(timer); timer = null; play.textContent = '▶ Play'; };
    const start = () => {
      if (i >= steps.length - 1) i = 0;
      stop(); draw();
      timer = setInterval(() => { if (!document.body.contains(box) || i >= steps.length - 1) return stop(); i++; draw(); }, 900 / speed);
      play.textContent = '❚❚ Pause';
    };
    box.querySelector('.qa-ctl').addEventListener('click', e => {
      const a = e.target.closest('[data-a]')?.dataset.a; if (!a) return;
      if (a === 'play') return timer ? stop() : start();
      if (a === 'speed') { speed = speed === 1 ? 2 : speed === 2 ? 4 : speed === 4 ? 0.5 : 1; sp.textContent = `${speed}×`; if (timer) start(); return; }
      stop();
      if (a === 'first') i = 0; if (a === 'prev') i = Math.max(0, i - 1); if (a === 'next') i = Math.min(steps.length - 1, i + 1);
      draw();
    });
    range.addEventListener('input', () => { stop(); i = +range.value; draw(); });
    draw();
    return { stop, steps: steps.length };
  }

  // ------------------------------------------------- the reusable view --
  // mount(box, question): approach switch, example picker, and the player(s).
  // Used by the Coding tab's Animate pane and by every problem page.
  function mount(box, q, st = { which: 'optimal', caseIdx: 0 }) {
    if (!q) { box.innerHTML = '<p class="sol-placeholder">Open a question first.</p>'; return; }
    const ex = examples(q);
    const token = box._qtToken = {};
    box.innerHTML = `
      <div class="qt-top">
        <div class="qf-seg" role="group" aria-label="Approach">
          <button type="button" data-w="brute" aria-pressed="${st.which === 'brute'}">Brute force</button>
          <button type="button" data-w="optimal" aria-pressed="${st.which === 'optimal'}">Optimal</button>
          <button type="button" data-w="both" aria-pressed="${st.which === 'both'}">Side by side</button>
        </div>
        ${ex.cases.length > 1 ? `<label class="qt-case">Example <select class="qt-case-sel">${ex.cases.map((_, k) => `<option value="${k}" ${k === st.caseIdx ? 'selected' : ''}>${k + 1}</option>`).join('')}</select></label>` : ''}
      </div>
      <p class="qf-muted qt-in">${ex.params.map((p, k) => `<code>${esc(p)} = ${esc((ex.cases[st.caseIdx] || '').split('\n')[k] || '')}</code>`).join(' ')}</p>
      <div class="qt-body"><p class="sol-loading">Getting the solutions and tracing them on the example… (first time for a problem takes 10–20 s)</p></div>`;
    box.querySelectorAll('[data-w]').forEach(b => { b.onclick = () => { st.which = b.dataset.w; mount(box, q, st); }; });
    box.querySelector('.qt-case-sel')?.addEventListener('change', e => { st.caseIdx = +e.target.value; mount(box, q, st); });
    const body = box.querySelector('.qt-body');
    if (!ex.cases.length) { body.innerHTML = '<p class="bv-err">This problem has no example input to run.</p>'; return; }
    (async () => {
      let sols;
      try { sols = await solutionsFor(q); } catch (e) {
        if (box._qtToken !== token) return;
        body.innerHTML = `<p class="bv-err">Could not get the solutions: ${esc(e.message)}</p><button type="button" class="primary qt-retry">Try again</button>`;
        body.querySelector('.qt-retry').onclick = () => mount(box, q, st); return;
      }
      if (box._qtToken !== token) return;
      const want = st.which === 'both' ? ['brute', 'optimal'] : [st.which];
      body.innerHTML = `<div class="qt-cols${want.length > 1 ? ' two' : ''}">${want.map(w => `<section class="qt-pane" data-pane="${w}"><p class="sol-loading">Tracing ${w === 'brute' ? 'brute force' : 'the optimal solution'}…</p></section>`).join('')}</div>`;
      await Promise.all(want.map(async w => {
        const pane = body.querySelector(`[data-pane="${w}"]`);
        const sol = sols[w];
        if (!sol) {
          pane.innerHTML = `<p class="bv-err">The ${w === 'brute' ? 'brute-force' : 'optimal'} version comes from the AI solution, which did not arrive${sols.why ? ` (${esc(sols.why)})` : ''}.</p>
            <button type="button" class="primary qt-retry">Try again</button>`;
          pane.querySelector('.qt-retry').onclick = () => { delete cache[q.slug]; mount(box, q, st); };
          return;
        }
        // Traces are cached: flipping between the tabs or back to an example
        // must not spend the judge's per-minute budget (shared with Run/Submit).
        const key = `${q.slug}|${st.caseIdx}|${sol.code}`;
        if (!ex.design && !/^class\s+Solution\b/m.test(sol.code) && /^class\s+\w+/m.test(sol.code)) {
          pane.innerHTML = `<p class="qf-muted">This solution is a class driven by a sequence of calls (${esc((/^class\s+(\w+)/m.exec(sol.code) || [])[1])}), not one function, so it cannot be stepped through on the example. Read the code in the Solution tab, or step through your own version with <b>Debug</b> in Coding.</p>`;
          return;
        }
        try {
          let d = traceCache.get(key);
          if (!d) {
            const r = await fetch('/api/debug', { method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ slug: q.slug, code: sol.code, dataInput: ex.cases[st.caseIdx] }) });
            d = await r.json().catch(() => ({}));
            if (r.status === 429) throw new Error('the step-by-step runner is busy (it shares a per-minute limit with Run and Submit). Wait about a minute, then try again.');
            if (!r.ok) throw new Error(d.error || `server said ${r.status}`);
            traceCache.set(key, d);
            if (traceCache.size > 40) traceCache.delete(traceCache.keys().next().value);
          }
          if (box._qtToken !== token) return;
          player(pane, d, sol.code, sol.title || (w === 'brute' ? 'Brute force' : 'Optimal'));
        } catch (e) {
          if (box._qtToken !== token) return;
          pane.innerHTML = `<p class="bv-err">Could not trace it: ${esc(e.message)}</p><button type="button" class="primary qt-retry">Try again</button>`;
          pane.querySelector('.qt-retry').onclick = () => mount(box, q, st);
        }
      }));
    })();
  }

  const qCache = {};
  async function questionBySlug(slug) {
    if (qCache[slug]) return qCache[slug];
    const r = await fetch(`/api/question/${encodeURIComponent(slug)}`);
    if (!r.ok) throw new Error(`could not load the problem (${r.status})`);
    const q = await r.json();
    const div = document.createElement('div'); div.innerHTML = q.content || '';
    q.plainStatement = div.textContent || '';
    return (qCache[slug] = q);
  }

  // Every problem page (Google list, NeetCode, …) gets a "Watch the solution"
  // section under its statement, mounted only when opened.
  function embedUnder(statement) {
    if (!statement || statement.nextElementSibling?.classList.contains('qt-embed')) return;
    const scope = statement.parentElement;
    const link = scope?.querySelector('a.nc-ext[href*="leetcode.com/problems/"]') || scope?.querySelector('a[href*="leetcode.com/problems/"]');
    const slug = (/leetcode\.com\/problems\/([^/]+)/.exec(link?.getAttribute('href') || '') || [])[1];
    if (!slug) return;
    const d = document.createElement('details');
    d.className = 'qt-embed'; d.dataset.slug = slug;
    d.innerHTML = `<summary><span class="qt-play-ic" aria-hidden="true">▶</span> Watch the solution — brute force vs optimal, step by step</summary><div class="qt-embed-body"></div>`;
    statement.after(d);
    let st = { which: 'both', caseIdx: 0 };
    d.addEventListener('toggle', async () => {
      if (!d.open || d.dataset.loaded) return;
      d.dataset.loaded = '1';
      const body = d.querySelector('.qt-embed-body');
      body.innerHTML = '<p class="sol-loading">Loading…</p>';
      try { mount(body, await questionBySlug(slug), st); }
      catch (e) { body.innerHTML = `<p class="bv-err">${esc(e.message)}</p>`; delete d.dataset.loaded; }
    });
  }

  // The Coding tab: same section under the statement, for the open question.
  function embedInCoding() {
    const body = $('qBody');
    if (!body || $('qtCodingEmbed')) return;
    const d = document.createElement('details');
    d.className = 'qt-embed'; d.id = 'qtCodingEmbed';
    d.innerHTML = `<summary><span class="qt-play-ic" aria-hidden="true">▶</span> Watch the solution — brute force vs optimal, step by step</summary><div class="qt-embed-body"></div>`;
    body.after(d);
    const st = { which: 'both', caseIdx: 0 };
    const load = () => { if (d.open && window.currentQuestion) mount(d.querySelector('.qt-embed-body'), window.currentQuestion, st); };
    d.addEventListener('toggle', load);
    window.addEventListener('question-changed', () => { st.caseIdx = 0; d.open = false; d.querySelector('.qt-embed-body').innerHTML = ''; });
  }

  // ------------------------------------------------------------ the tab --
  const tabState = { which: 'optimal', caseIdx: 0 };
  function render() { const box = $('animContent'); if (box) mount(box, window.currentQuestion, tabState); }

  function boot() {
    const tabs = document.querySelector('#solHead .sol-tabs');
    if (!tabs || $('solTabAnim')) return;
    const btn = document.createElement('button');
    btn.className = 'sol-tab'; btn.id = 'solTabAnim'; btn.dataset.pane = 'anim'; btn.setAttribute('role', 'tab'); btn.setAttribute('aria-selected', 'false');
    btn.title = 'Watch brute force and optimal run on the example, step by step';
    btn.textContent = 'Animate';
    tabs.appendChild(btn);
    const content = document.createElement('div');
    content.id = 'animContent'; content.className = 'prose hidden';
    $('rkContent')?.after(content);
    const showAnim = on => {
      content.classList.toggle('hidden', !on);
      btn.classList.toggle('sel', on); btn.setAttribute('aria-selected', String(on));
      $('solGenerate')?.classList.toggle('qt-hide', on);
      if (on) {
        $('solContent')?.classList.add('hidden'); $('rkContent')?.classList.add('hidden');
        document.querySelectorAll('.sol-tab:not(#solTabAnim)').forEach(t => { t.classList.remove('sel'); t.setAttribute('aria-selected', 'false'); });
        render();
      }
    };
    btn.addEventListener('click', () => showAnim(true));
    tabs.querySelectorAll('.sol-tab:not(#solTabAnim)').forEach(t => t.addEventListener('click', () => showAnim(false)));
    window.addEventListener('question-changed', () => { tabState.caseIdx = 0; if (!content.classList.contains('hidden')) render(); });
    embedInCoding();
    // Problem pages render on demand: add the section whenever a statement appears.
    document.querySelectorAll('details.gl-statement').forEach(embedUnder);
    new MutationObserver(muts => {
      for (const m of muts) for (const n of m.addedNodes) {
        if (n.nodeType !== 1) continue;
        if (n.matches?.('details.gl-statement')) embedUnder(n);
        n.querySelectorAll?.('details.gl-statement').forEach(embedUnder);
      }
    }).observe(document.body, { childList: true, subtree: true });
    window.QFTrace = { open: () => { $('solutionBtn')?.click(); setTimeout(() => showAnim(true), 50); }, parsePy, mount, questionBySlug, player, firstSolution, examples, frameHtml, noteFor, analyze, prepareTrace, codeCell };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
