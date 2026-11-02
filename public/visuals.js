/* Diagrams for the Learn tab.
 *
 * Each one shows the mechanism rather than decorating the page: where the
 * pointers are, which cells the window covers, what the stack holds. Drawn in
 * inline SVG with theme tokens so they follow whichever skin is active. */
window.Visuals = (function () {
  const C = {
    line: 'var(--line)', text: 'var(--text)', muted: 'var(--muted)',
    blue: 'var(--blue)', green: 'var(--green)', orange: 'var(--orange)', red: 'var(--red)',
    panel: 'var(--bg-alt)',
  };

  const cell = (x, y, w, h, fill, stroke) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="${fill || 'none'}"
       stroke="${stroke || C.line}" stroke-width="1.5"/>`;
  const label = (x, y, t, fill, size = 12, anchor = 'middle') =>
    `<text x="${x}" y="${y}" fill="${fill || C.text}" font-size="${size}"
       text-anchor="${anchor}" font-family="var(--code-font)">${t}</text>`;
  const note = (x, y, t, fill, anchor = 'middle') =>
    `<text x="${x}" y="${y}" fill="${fill || C.muted}" font-size="11"
       text-anchor="${anchor}" font-family="inherit">${t}</text>`;
  const arrow = (x, y, up, colour) => up
    ? `<path d="M${x} ${y} l-5 8 h10 z" fill="${colour}"/>`
    : `<path d="M${x} ${y} l-5 -8 h10 z" fill="${colour}"/>`;

  // Row labels are drawn at x=14 with text-anchor="end", so they extend into
  // negative x. Start the viewBox there rather than moving every coordinate.
  const wrap = (h, body) =>
    `<svg viewBox="-56 0 516 ${h}" role="img" class="viz"
       preserveAspectRatio="xMidYMid meet">${body}</svg>`;

  const row = (values, opts = {}) => {
    const { x0 = 20, y = 40, w = 40, h = 34, fills = {}, strokes = {} } = opts;
    return values.map((v, i) =>
      cell(x0 + i * w, y, w - 4, h, fills[i], strokes[i]) +
      label(x0 + i * w + (w - 4) / 2, y + h / 2 + 4, v)).join('');
  };

  const V = {
    twoPointers() {
      const nums = [2, 7, 11, 15, 19, 24];
      return wrap(150,
        note(230, 18, 'target = 26 · sum too small, so only a bigger left can help')
        + row(nums, { fills: { 0: 'color-mix(in srgb, var(--blue) 22%, transparent)', 5: 'color-mix(in srgb, var(--orange) 22%, transparent)' },
                      strokes: { 0: C.blue, 5: C.orange } })
        + arrow(38, 80, true, C.blue) + note(38, 106, 'left', C.blue)
        + arrow(238, 80, true, C.orange) + note(238, 106, 'right', C.orange)
        + `<path d="M46 126 h140" stroke="${C.blue}" stroke-width="1.5" stroke-dasharray="4 3"/>`
        + arrow(190, 126, false, C.blue)
        + note(230, 142, '2 + 24 = 26 ✓  otherwise move one inward', C.muted));
    },

    slidingWindow() {
      const nums = [1, 3, 2, 5, 4, 8];
      const inWin = i => i >= 1 && i <= 3;
      const fills = {}; const strokes = {};
      [1, 2, 3].forEach(i => { fills[i] = 'color-mix(in srgb, var(--green) 20%, transparent)'; strokes[i] = C.green; });
      return wrap(150,
        note(230, 18, 'window of size 3 — add the entering cell, drop the leaving one')
        + row(nums, { fills, strokes })
        + `<rect x="58" y="34" width="118" height="46" rx="6" fill="none" stroke="${C.green}" stroke-width="2"/>`
        + note(117, 100, 'sum = 10', C.green)
        + `<path d="M186 57 h40" stroke="${C.blue}" stroke-width="1.5"/>`
        + `<path d="M226 57 l-8 -5 v10 z" fill="${C.blue}"/>`
        + note(300, 61, 'slide: +4, −3', C.blue)
        + note(230, 138, 'O(n) — never recompute the whole window', C.muted));
    },

    prefixSum() {
      const nums = [3, 1, 4, 1, 5];
      const pre = [3, 4, 8, 9, 14];
      return wrap(170,
        note(230, 16, 'prefix[j] − prefix[i−1] gives any range in one subtraction')
        + row(nums, { y: 28, fills: { 2: 'color-mix(in srgb, var(--blue) 18%, transparent)', 3: 'color-mix(in srgb, var(--blue) 18%, transparent)' } })
        + note(14, 48, 'nums', C.muted, 'end')
        + row(pre, { y: 92 })
        + note(14, 112, 'prefix', C.muted, 'end')
        + `<path d="M140 78 v10" stroke="${C.blue}" stroke-width="1.5"/>`
        + note(230, 150, 'sum(2..3) = prefix[3] − prefix[1] = 9 − 4 = 5', C.blue));
    },

    kadane() {
      const nums = [-2, 1, -3, 4, -1, 2];
      const run = ['−2', '1', '−2', '4', '3', '5'];
      return wrap(170,
        note(230, 16, 'at each index: start fresh here, or extend the run')
        + row(nums, { y: 28 })
        + note(14, 48, 'nums', C.muted, 'end')
        + row(run, { y: 92, fills: { 5: 'color-mix(in srgb, var(--green) 22%, transparent)' }, strokes: { 5: C.green } })
        + note(14, 112, 'current', C.muted, 'end')
        + note(230, 150, 'best = 5 — reset whenever the run goes negative', C.green));
    },

    binarySearch() {
      const nums = [1, 3, 5, 7, 9, 11, 13];
      const fills = { 4: 'color-mix(in srgb, var(--blue) 20%, transparent)' };
      const dim = {}; [0, 1, 2, 3].forEach(i => { dim[i] = C.line; });
      return wrap(150,
        note(230, 18, 'target = 11 — mid is too small, so discard the left half')
        + row(nums, { fills, strokes: { 4: C.blue } })
        + `<rect x="16" y="34" width="160" height="46" rx="6" fill="color-mix(in srgb, var(--red) 10%, transparent)" stroke="none"/>`
        + note(96, 104, 'discarded', C.red)
        + arrow(198, 80, true, C.blue) + note(198, 106, 'mid', C.blue)
        + note(230, 138, 'halve the space each step — O(log n)', C.muted));
    },

    monotonicStack() {
      const nums = [2, 1, 5, 6];
      return wrap(170,
        note(230, 16, 'stack keeps decreasing values; a bigger number pops them')
        + row(nums, { y: 26, fills: { 2: 'color-mix(in srgb, var(--orange) 20%, transparent)' }, strokes: { 2: C.orange } })
        + cell(170, 84, 60, 26, 'color-mix(in srgb, var(--blue) 16%, transparent)', C.blue) + label(200, 102, '1')
        + cell(170, 110, 60, 26, 'color-mix(in srgb, var(--blue) 16%, transparent)', C.blue) + label(200, 128, '2')
        + note(200, 150, 'stack (bottom → top)', C.muted)
        + `<path d="M140 97 h22" stroke="${C.orange}" stroke-width="1.5"/>`
        + `<path d="M162 97 l-8 -5 v10 z" fill="${C.orange}"/>`
        + note(300, 94, '5 arrives → pop 1, pop 2', C.orange)
        + note(300, 112, 'each index pushed and popped once → O(n)', C.muted));
    },

    fastSlow() {
      const xs = [40, 100, 160, 220, 280, 340];
      const nodes = xs.map((x, i) =>
        `<circle cx="${x}" cy="70" r="16" fill="none" stroke="${i === 2 ? C.blue : i === 4 ? C.orange : C.line}" stroke-width="2"/>`
        + label(x, 75, String(i + 1), i === 2 ? C.blue : i === 4 ? C.orange : C.text)).join('');
      const links = xs.slice(0, -1).map(x =>
        `<path d="M${x + 17} 70 h26" stroke="${C.line}" stroke-width="1.5"/>`).join('');
      return wrap(150,
        note(230, 20, 'slow moves one step, fast moves two')
        + links + nodes
        + arrow(160, 96, true, C.blue) + note(160, 122, 'slow', C.blue)
        + arrow(280, 96, true, C.orange) + note(280, 122, 'fast', C.orange)
        + note(230, 142, 'when fast reaches the end, slow is at the middle — O(1) space', C.muted));
    },

    tree() {
      const n = (x, y, t, c) => `<circle cx="${x}" cy="${y}" r="15" fill="none" stroke="${c || C.line}" stroke-width="2"/>` + label(x, y + 5, t, c);
      const e = (x1, y1, x2, y2) => `<path d="M${x1} ${y1} L${x2} ${y2}" stroke="${C.line}" stroke-width="1.5"/>`;
      return wrap(180,
        note(230, 16, 'BFS walks level by level; DFS goes deep first')
        + e(230, 45, 160, 95) + e(230, 45, 300, 95)
        + e(160, 95, 110, 145) + e(160, 95, 210, 145)
        + n(230, 30, '1', C.blue) + n(160, 95, '2', C.green) + n(300, 95, '3', C.green)
        + n(110, 145, '4', C.orange) + n(210, 145, '5', C.orange)
        + note(400, 34, 'level 0', C.blue, 'start')
        + note(400, 99, 'level 1', C.green, 'start')
        + note(400, 149, 'level 2', C.orange, 'start'));
    },

    graph() {
      const n = (x, y, t, c) => `<circle cx="${x}" cy="${y}" r="15" fill="none" stroke="${c}" stroke-width="2"/>` + label(x, y + 5, t, c);
      const e = (x1, y1, x2, y2) => `<path d="M${x1} ${y1} L${x2} ${y2}" stroke="${C.line}" stroke-width="1.5"/>`;
      return wrap(170,
        note(230, 16, 'BFS expands a frontier — first arrival is the shortest path')
        + e(80, 85, 175, 50) + e(80, 85, 175, 120) + e(175, 50, 285, 85) + e(175, 120, 285, 85) + e(285, 85, 385, 85)
        + n(80, 85, 'S', C.blue) + n(175, 50, 'a', C.green) + n(175, 120, 'b', C.green)
        + n(285, 85, 'c', C.orange) + n(385, 85, 'G', C.red)
        + note(80, 122, 'start', C.blue) + note(230, 152, 'distance 0 → 1 → 2 → 3, every edge costs the same', C.muted));
    },

    dp1d() {
      const idx = ['0', '1', '2', '3', '4', '5'];
      const vals = ['1', '1', '2', '3', '5', '8'];
      return wrap(170,
        note(230, 16, 'dp[i] = dp[i−1] + dp[i−2] — say what dp[i] means first')
        + row(idx, { y: 28 }) + note(14, 48, 'i', C.muted, 'end')
        + row(vals, { y: 92, fills: { 5: 'color-mix(in srgb, var(--green) 20%, transparent)' }, strokes: { 5: C.green } })
        + note(14, 112, 'dp', C.muted, 'end')
        + `<path d="M180 128 q30 22 60 0" stroke="${C.blue}" stroke-width="1.5" fill="none"/>`
        + `<path d="M140 128 q50 32 100 0" stroke="${C.orange}" stroke-width="1.5" fill="none"/>`
        + note(230, 160, 'each cell needs only the two before it → O(1) space', C.muted));
    },

    dp2d() {
      const g = [];
      for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) {
        const on = r === 2 && c === 3;
        g.push(cell(120 + c * 44, 34 + r * 34, 40, 30,
          on ? 'color-mix(in srgb, var(--green) 22%, transparent)' : 'none', on ? C.green : C.line));
      }
      return wrap(170,
        note(230, 18, 'dp[i][j] relates a prefix of one input to a prefix of the other')
        + g.join('')
        + `<path d="M252 63 h40" stroke="${C.blue}" stroke-width="1.5"/>` + `<path d="M292 63 l-8 -5 v10 z" fill="${C.blue}"/>`
        + `<path d="M296 67 v30" stroke="${C.orange}" stroke-width="1.5"/>` + `<path d="M296 97 l-5 -8 h10 z" fill="${C.orange}"/>`
        + note(230, 158, 'each cell combines the ones above and to the left', C.muted));
    },

    intervals() {
      const bar = (x, w, y, c) => `<rect x="${x}" y="${y}" width="${w}" height="16" rx="8" fill="${c}" opacity="0.28"/>`
        + `<rect x="${x}" y="${y}" width="${w}" height="16" rx="8" fill="none" stroke="${c}" stroke-width="1.5"/>`;
      return wrap(160,
        note(230, 18, 'sort by start, then overlap is exactly start <= previous end')
        + bar(40, 120, 36, C.blue) + bar(120, 130, 62, C.blue) + bar(300, 90, 36, C.orange)
        + bar(40, 210, 104, C.green)
        + note(145, 122, 'merged', C.green) + note(345, 122, 'separate', C.orange));
    },

    hashmap() {
      return wrap(160,
        note(230, 18, 'remember what you have passed, so the second loop disappears')
        + row([2, 7, 11, 15], { y: 32, fills: { 1: 'color-mix(in srgb, var(--green) 20%, transparent)' }, strokes: { 1: C.green } })
        + cell(220, 80, 190, 26, C.panel, C.line) + label(315, 98, '{2: 0}  seen so far', C.muted, 11)
        + note(230, 132, 'target 9 → look for 9 − 7 = 2, already stored → O(n)', C.green));
    },

    backtracking() {
      const n = (x, y, t, c) => `<circle cx="${x}" cy="${y}" r="13" fill="none" stroke="${c}" stroke-width="1.8"/>` + label(x, y + 4, t, c, 11);
      const e = (x1, y1, x2, y2, c) => `<path d="M${x1} ${y1} L${x2} ${y2}" stroke="${c}" stroke-width="1.4"/>`;
      return wrap(175,
        note(230, 16, 'choose, recurse, then undo — the undo is the pattern')
        + e(230, 42, 160, 92, C.line) + e(230, 42, 300, 92, C.line)
        + e(160, 92, 115, 142, C.green) + e(160, 92, 205, 142, C.red)
        + n(230, 30, '[]', C.blue) + n(160, 92, '[1]', C.line) + n(300, 92, '[2]', C.line)
        + n(115, 142, '[1,2]', C.green) + n(205, 142, '✗', C.red)
        + note(400, 146, 'prune', C.red, 'start'));
    },
  };

  // Several patterns legitimately share a diagram.
  V.matrix = V.dp2d;
  V.heap = V.monotonicStack;
  V.topo = V.graph;
  V.trie = V.tree;
  V.bits = V.hashmap;

  return {
    has: id => typeof V[id] === 'function',
    render: id => (typeof V[id] === 'function' ? V[id]() : ''),
  };
})();
