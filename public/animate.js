/* A small frame player for algorithm walkthroughs. Frames come from the
 * server (see server/explain.js); this draws them as SVG and steps through
 * them with play / pause / step / speed / loop. Five kinds: array, grid,
 * list, tree, graph. */
window.Animate = (function () {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const W = 560;

  // ---------------------------------------------------------------- draw ---
  const cellFill = (i, f, key = i => i) =>
    f.highlight?.some(h => key(h) === key(i)) ? 'var(--an-hl)'
      : f.done?.some(d => key(d) === key(i)) ? 'var(--an-done)'
      : f.bad?.some(d => key(d) === key(i)) ? 'var(--an-bad)' : 'var(--an-cell)';

  /** Width of one cell for `vals`: wide enough for the longest value, but all cells must fit in `avail`. */
  const PX_PER_CH = 8.2;
  function fitWidth(vals, avail, base = 56, max = 150) {
    const n = Math.max(vals.length, 1);
    const longest = Math.max(1, ...vals.map(v => String(v ?? '').length));
    const want = Math.max(base, Math.min(max, Math.ceil(longest * PX_PER_CH) + 16));
    return Math.max(28, Math.min(want, Math.floor(avail / n)));
  }
  /** A value in a cell: shrink the font when it would not fit, then clip it. */
  function cellText(x, y, w, v, cls = 'an-val') {
    const str = String(v ?? '');
    const room = (w - 8) / PX_PER_CH;
    let size = '';
    if (str.length > room) size = ` style="font-size:${Math.max(8.5, 13 * room / str.length).toFixed(1)}px"`;
    return `<text x="${x}" y="${y}" text-anchor="middle" class="${cls}"${size}>${esc(str)}</text>`;
  }

  function drawArray(f) {
    const n = Math.max(f.cells.length, 1);
    const auxVals = Object.values(f.aux || {}).flat();
    const cw = fitWidth([...f.cells, ...auxVals], W - 24), ch = 40, x0 = (W - cw * n) / 2;
    const ranges = (f.ranges || []).filter(g => g.from <= g.to && g.from >= 0 && g.to < n);
    const y0 = 34 + ranges.length * 22;                     // brackets sit above the cells
    const hasLabels = Object.keys(f.labels || {}).length > 0;
    const ptrRows = Math.max(0, ...Object.values(
      Object.entries(f.pointers || {}).reduce((a, [, i]) => { a[i] = (a[i] || 0) + 1; return a; }, {})));
    const belowH = 8 + ptrRows * 16 + (ptrRows ? 12 : 0) + (hasLabels ? 16 : 0);
    const auxRows = Object.entries(f.aux || {});
    const H = y0 + ch + belowH + 16 + auxRows.length * (ch + 22);
    let s = `<svg class="an-svg" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">`;
    ranges.forEach((g, r) => {
      const xa = x0 + g.from * cw, xb = x0 + g.to * cw + (cw - 4), y = 14 + r * 22;
      s += `<path d="M${xa} ${y + 8} L${xa} ${y} L${xb} ${y} L${xb} ${y + 8}" fill="none" stroke="var(--an-ptr)" stroke-width="1.5"/>
            <text x="${(xa + xb) / 2}" y="${y - 3}" text-anchor="middle" class="an-ptr">${esc(g.label)}</text>`;
    });
    f.cells.forEach((v, i) => {
      s += `<rect x="${x0 + i * cw}" y="${y0}" width="${cw - 4}" height="${ch}" rx="6" fill="${cellFill(i, f)}" stroke="var(--an-line)"/>
            ${cellText(x0 + i * cw + (cw - 4) / 2, y0 + ch / 2 + 5, cw - 4, v)}
            <text x="${x0 + i * cw + (cw - 4) / 2}" y="${y0 - 8}" text-anchor="middle" class="an-idx">${i}</text>`;
      const lab = f.labels?.[String(i)];
      if (lab) s += `<text x="${x0 + i * cw + (cw - 4) / 2}" y="${y0 + ch + 13}" text-anchor="middle" class="an-lab">${esc(lab)}</text>`;
    });
    // pointers under the cells (below any labels), stacked when two share an index
    const seen = {};
    const pY = y0 + ch + 6 + (hasLabels ? 16 : 0);
    for (const [name, idx] of Object.entries(f.pointers || {})) {
      if (idx < 0 || idx >= n) continue;
      const row = (seen[idx] = (seen[idx] || 0) + 1);
      const cx = x0 + idx * cw + (cw - 4) / 2, y = pY + (row - 1) * 16;
      s += `<path d="M${cx - 5} ${y + 8} L${cx} ${y} L${cx + 5} ${y + 8}" fill="var(--an-ptr)"/>
            <text x="${cx}" y="${y + 20}" text-anchor="middle" class="an-ptr">${esc(name)}</text>`;
    }
    auxRows.forEach(([name, vals], r) => {
      const y = y0 + ch + belowH + 16 + r * (ch + 22);
      s += `<text x="${x0}" y="${y - 6}" class="an-idx">${esc(name)}</text>`;
      vals.forEach((v, i) => {
        s += `<rect x="${x0 + i * cw}" y="${y}" width="${cw - 4}" height="${ch - 8}" rx="5" fill="var(--an-aux)" stroke="var(--an-line)"/>
              ${cellText(x0 + i * cw + (cw - 4) / 2, y + (ch - 8) / 2 + 5, cw - 4, v, 'an-val an-small')}`;
      });
    });
    return s + '</svg>';
  }

  // Interval-DP tables are filled one diagonal (substring length) at a time; colour each diagonal.
  const DIAG = [210, 330, 280, 30, 160, 50];

  function drawGrid(f) {
    const rows = f.grid.length, cols = Math.max(...f.grid.map(r => r.length), 1);
    const rl = f.rowLabels || [], cl = f.colLabels || [];
    const left = 30 + (rl.length ? 26 : 0) + 20, top = 22 + (cl.length ? 26 : 0) + 20;
    const c = Math.min(52, Math.floor((W - left - 12) / cols), Math.floor(300 / Math.max(rows, 1)));
    const x0 = Math.max(left, (W - c * cols) / 2 + left / 2), y0 = top, H = y0 + c * rows + 12;
    const cx = k => x0 + k * c + (c - 3) / 2, cy = k => y0 + k * c + (c - 3) / 2;
    const key = p => `${p[0]},${p[1]}`;
    const at = (name, n) => { const v = Number(f.vars?.[name]); return Number.isInteger(v) && v >= 0 && v < n ? v : null; };
    const pi = at('i', rows) ?? at('r', rows) ?? at('row', rows), pj = at('j', cols) ?? at('c', cols) ?? at('col', cols);
    const isDone = (r, k) => f.done?.some(d => d[0] === r && d[1] === k);
    const isHl = (r, k) => f.highlight?.some(d => d[0] === r && d[1] === k);
    let s = `<svg class="an-svg" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">`;
    for (let k = 0; k < cols; k++) {
      s += `<text x="${cx(k)}" y="${y0 - 8}" text-anchor="middle" class="an-idx">${k}</text>`;
      if (cl[k] != null) s += `<text x="${cx(k)}" y="${y0 - 30}" text-anchor="middle" class="an-val an-head">${esc(cl[k])}</text>`;
    }
    for (let r = 0; r < rows; r++) {
      s += `<text x="${x0 - 12}" y="${cy(r) + 5}" text-anchor="end" class="an-idx">${r}</text>`;
      if (rl[r] != null) s += `<text x="${x0 - 36}" y="${cy(r) + 6}" text-anchor="end" class="an-val an-head">${esc(rl[r])}</text>`;
    }
    if (pj != null) s += `<text x="${cx(pj)}" y="${14}" text-anchor="middle" class="an-ptr">j ↓</text>`;
    if (pi != null) s += `<text x="${x0 - (rl.length ? 54 : 30)}" y="${cy(pi) + 5}" text-anchor="end" class="an-ptr">i →</text>`;
    f.grid.forEach((row, r) => row.forEach((v, k) => {
      const x = x0 + k * c, y = y0 + r * c;
      if (f.interval && r > k) {
        s += `<rect x="${x}" y="${y}" width="${c - 3}" height="${c - 3}" rx="5" fill="none" stroke="var(--an-line)" opacity=".35"/>`;
        return;
      }
      const fill = f.interval && isDone(r, k) && !isHl(r, k)
        ? `hsl(${DIAG[(k - r) % DIAG.length]} 70% 50% / .55)` : cellFill([r, k], f, key);
      const answer = f.interval && r === 0 && k === cols - 1;
      s += `<rect x="${x}" y="${y}" width="${c - 3}" height="${c - 3}" rx="5" fill="${fill}" stroke="${answer ? 'var(--an-done)' : 'var(--an-line)'}" stroke-width="${answer || isHl(r, k) ? 3 : 1}"/>
            <text x="${cx(k)}" y="${cy(r) + 5}" text-anchor="middle" class="an-val">${esc(v)}</text>`;
    }));
    return s + '</svg>';
  }

  /** Characters along the grid edges, read from the example input (e.g. s = "total", text1 = "abc"). */
  function gridHeaders(input, f) {
    if (!f.grid?.length) return {};
    if (f.rowLabels || f.colLabels) return { rowLabels: f.rowLabels, colLabels: f.colLabels, interval: f.interval };
    const rows = f.grid.length, cols = f.grid[0].length;
    const strs = [...String(input || '').matchAll(/"([^"]*)"|'([^']*)'/g)].map(m => [...(m[1] ?? m[2])]);
    if (strs.length === 1) {
      const s = strs[0];
      const blank = v => /^(0|F|False|false|-|\.|)$/.test(String(v).trim());
      const lowerEmpty = f.grid.every((row, r) => row.every((v, k) => k >= r || blank(v)));
      if (rows === s.length && cols === s.length) return { rowLabels: s, colLabels: s, interval: lowerEmpty };
      if (rows === s.length + 1 && cols === s.length + 1) return { rowLabels: ['∅', ...s], colLabels: ['∅', ...s] };
    }
    if (strs.length >= 2) {
      for (const [a, b] of [[strs[0], strs[1]], [strs[1], strs[0]]]) {
        if (rows === a.length + 1 && cols === b.length + 1) return { rowLabels: ['∅', ...a], colLabels: ['∅', ...b] };
        if (rows === a.length && cols === b.length) return { rowLabels: a, colLabels: b };
      }
    }
    return {};
  }

  function drawList(f) {
    // order nodes by following next from the node nothing points to
    const pointed = new Set(Object.values(f.next || {}));
    const byId = Object.fromEntries(f.nodes.map(n => [n.id, n]));
    let head = f.nodes.find(n => !pointed.has(n.id))?.id || f.nodes[0]?.id;
    const order = []; const seen = new Set();
    while (head && byId[head] && !seen.has(head) && order.length < 16) { seen.add(head); order.push(head); head = f.next?.[head]; }
    for (const n of f.nodes) if (!seen.has(n.id)) order.push(n.id);
    const n = Math.max(order.length, 1), cw = Math.min(64, Math.floor((W - 24) / n)), r = 17;
    const x0 = (W - cw * n) / 2 + cw / 2, y = 44;
    let s = `<svg class="an-svg" viewBox="0 0 ${W} 110" xmlns="http://www.w3.org/2000/svg">`;
    order.forEach((id, i) => {
      const nx = f.next?.[id]; const j = order.indexOf(nx);
      if (j >= 0) {
        const x1 = x0 + i * cw + r, x2 = x0 + j * cw - r;
        s += j === i + 1
          ? `<line x1="${x1}" y1="${y}" x2="${x2 - 4}" y2="${y}" stroke="var(--an-line)" stroke-width="1.5" marker-end="url(#an-arrow)"/>`
          : `<path d="M${x0 + i * cw} ${y - r} Q${(x0 + i * cw + x0 + j * cw) / 2} ${y - 48} ${x0 + j * cw} ${y - r - 2}" fill="none" stroke="var(--an-ptr)" stroke-width="1.5" marker-end="url(#an-arrow)"/>`;
      }
    });
    s += `<defs><marker id="an-arrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8 z" fill="var(--an-line)"/></marker></defs>`;
    order.forEach((id, i) => {
      const cx = x0 + i * cw;
      s += `<circle cx="${cx}" cy="${y}" r="${r}" fill="${cellFill(id, f)}" stroke="var(--an-line)"/>
            <text x="${cx}" y="${y + 5}" text-anchor="middle" class="an-val">${esc(byId[id]?.label ?? id)}</text>`;
    });
    const seen2 = {};
    for (const [name, id] of Object.entries(f.pointers || {})) {
      const i = order.indexOf(id); if (i < 0) continue;
      const row = (seen2[i] = (seen2[i] || 0) + 1);
      const cx = x0 + i * cw, py = y + r + 6 + (row - 1) * 16;
      s += `<path d="M${cx - 5} ${py + 8} L${cx} ${py} L${cx + 5} ${py + 8}" fill="var(--an-ptr)"/>
            <text x="${cx}" y="${py + 20}" text-anchor="middle" class="an-ptr">${esc(name)}</text>`;
    }
    return s + '</svg>';
  }

  function drawTree(f) {
    const byId = {}; f.nodes.forEach(n => { byId[n.id] = { ...n, kids: [] }; });
    const roots = [];
    f.nodes.forEach(n => { if (n.parent && byId[n.parent]) byId[n.parent].kids.push(n.id); else roots.push(n.id); });
    // Binary trees are laid out in-order (left child left of the parent).
    // Forests, tries and n-ary trees — any node with three children, or two
    // on the same side — centre each parent above its children instead.
    const nary = f.nodes.some(n => byId[n.id].kids.length > 2) || !f.nodes.some(n => n.side === 'L' || n.side === 'R');
    const pos = {}; let cursor = 0; const seen = new Set();
    const walk = (id, d) => {
      const n = byId[id]; if (!n || seen.has(id)) return; seen.add(id);
      if (nary) {
        if (!n.kids.length) { pos[id] = { x: cursor++, d }; return; }
        n.kids.forEach(k => walk(k, d + 1));
        const xs = n.kids.map(k => pos[k]?.x).filter(x => x != null);
        pos[id] = { x: xs.length ? (Math.min(...xs) + Math.max(...xs)) / 2 : cursor++, d };
        return;
      }
      const L = n.kids.filter(k => byId[k].side !== 'R'), R = n.kids.filter(k => byId[k].side === 'R');
      L.forEach(k => walk(k, d + 1));
      pos[id] = { x: cursor++, d };
      R.forEach(k => walk(k, d + 1));
    };
    roots.forEach(r => walk(r, 0));
    f.nodes.forEach(n => walk(n.id, 0));   // anything orphaned by a bad parent id still gets drawn
    const cols = Math.max(cursor, 1), depth = Math.max(...Object.values(pos).map(p => p.d), 0) + 1;
    // forest roots sit side by side; pointer/parent links may point at a node
    // drawn later, so edges are drawn after every position is known
    const cw = Math.min(70, (W - 40) / cols), rh = 62, r = 17;
    const X = id => 20 + pos[id].x * cw + cw / 2, Y = id => 26 + pos[id].d * rh;
    const H = 26 + depth * rh + 10;
    let s = `<svg class="an-svg" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">`;
    f.nodes.forEach(n => { if (n.parent && pos[n.parent] && pos[n.id])
      s += `<line x1="${X(n.parent)}" y1="${Y(n.parent)}" x2="${X(n.id)}" y2="${Y(n.id)}" stroke="var(--an-line)" stroke-width="1.5"/>`; });
    f.nodes.forEach(n => { if (!pos[n.id]) return;
      s += `<circle cx="${X(n.id)}" cy="${Y(n.id)}" r="${r}" fill="${cellFill(n.id, f)}" stroke="var(--an-line)"/>
            <text x="${X(n.id)}" y="${Y(n.id) + 5}" text-anchor="middle" class="an-val">${esc(n.label)}</text>`;
      const lab = f.labels?.[n.id];
      if (lab) s += `<text x="${X(n.id)}" y="${Y(n.id) + r + 13}" text-anchor="middle" class="an-ptr">${esc(lab)}</text>`;
    });
    return s + '</svg>';
  }

  function drawGraph(f) {
    const n = Math.max(f.nodes.length, 1), cx = W / 2, cy = 120, R = Math.min(96, 40 + n * 9), r = 17;
    const pos = {}; f.nodes.forEach((nd, i) => { const a = -Math.PI / 2 + i * 2 * Math.PI / n; pos[nd.id] = { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) }; });
    const active = new Set((f.activeEdges || []).map(e => e.join('>')));
    let s = `<svg class="an-svg" viewBox="0 0 ${W} 250" xmlns="http://www.w3.org/2000/svg">
      <defs><marker id="an-g-arrow" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto" markerUnits="userSpaceOnUse"><path d="M0 0 L9 4.5 L0 9 z" fill="var(--an-line)"/></marker>
      <marker id="an-g-arrow-on" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto" markerUnits="userSpaceOnUse"><path d="M0 0 L9 4.5 L0 9 z" fill="var(--an-ptr)"/></marker></defs>`;
    for (const [a, b, w] of f.edges || []) {
      if (!pos[a] || !pos[b]) continue;
      const on = active.has(`${a}>${b}`) || (!f.directed && active.has(`${b}>${a}`));
      // stop the line at the target circle's edge so an arrowhead is visible
      const dx = pos[b].x - pos[a].x, dy = pos[b].y - pos[a].y, len = Math.hypot(dx, dy) || 1;
      const x2 = f.directed ? pos[b].x - dx / len * (r + 1) : pos[b].x, y2 = f.directed ? pos[b].y - dy / len * (r + 1) : pos[b].y;
      s += `<line x1="${pos[a].x}" y1="${pos[a].y}" x2="${x2}" y2="${y2}" stroke="${on ? 'var(--an-ptr)' : 'var(--an-line)'}" stroke-width="${on ? 3 : 1.5}"${f.directed ? ` marker-end="url(#an-g-arrow${on ? '-on' : ''})"` : ''}/>`;
      if (w != null) s += `<text x="${(pos[a].x + pos[b].x) / 2}" y="${(pos[a].y + pos[b].y) / 2 - 4}" text-anchor="middle" class="an-ptr">${esc(w)}</text>`;
    }
    for (const nd of f.nodes) {
      const p = pos[nd.id];
      s += `<circle cx="${p.x}" cy="${p.y}" r="${r}" fill="${cellFill(nd.id, f)}" stroke="var(--an-line)"/>
            <text x="${p.x}" y="${p.y + 5}" text-anchor="middle" class="an-val">${esc(nd.label || nd.id)}</text>`;
      const lab = f.labels?.[nd.id];
      if (lab) s += `<text x="${p.x}" y="${p.y + r + 13}" text-anchor="middle" class="an-lab">${esc(lab)}</text>`;
    }
    return s + '</svg>';
  }

  /** Input row on top (reusing the array drawing), then a vertical stack and/or a queue. */
  function drawStack(f) {
    const top = drawArray({ ...f, aux: {} }).replace(/<svg[^>]*>/, '').replace('</svg>', '');
    const topH = Number(/viewBox="0 0 \d+ (\d+)"/.exec(drawArray({ ...f, aux: {} }))?.[1] || 120);
    const stack = f.stack || [], queue = f.queue || [];
    const cw = fitWidth(stack, 200, 52, 200), ch = 30;
    const stackH = stack.length ? Math.max(stack.length, 1) * (ch + 4) + 34 : 0;
    const queueH = queue.length ? ch + 44 : 0;
    const H = topH + Math.max(stackH, queueH) + 8;
    let s = `<svg class="an-svg" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">${top}`;
    if (stack.length) {
      const x = 40, base = topH + stackH - 6;
      s += `<text x="${x + (cw - 4) / 2}" y="${topH + 14}" text-anchor="middle" class="an-idx">stack · top ↑</text>`;
      s += `<path d="M${x - 8} ${topH + 22} L${x - 8} ${base + 2} L${x + cw + 4} ${base + 2} L${x + cw + 4} ${topH + 22}" fill="none" stroke="var(--an-line)"/>`;
      stack.forEach((v, i) => {
        const y = base - (i + 1) * (ch + 4) + 2;
        const fill = (f.stackHl || []).includes(i) ? 'var(--an-hl)' : 'var(--an-cell)';
        s += `<rect x="${x}" y="${y}" width="${cw - 4}" height="${ch}" rx="5" fill="${fill}" stroke="var(--an-line)"/>
              ${cellText(x + (cw - 4) / 2, y + ch / 2 + 5, cw - 4, v, 'an-val an-small')}`;
      });
    }
    if (queue.length) {
      const n = queue.length, avail = stack.length ? W - 40 - (cw + 40) : W - 40;
      const qw = fitWidth(queue, avail, 52, 120), x0 = stack.length ? 40 + cw + 40 : (W - qw * n) / 2, y = topH + 30;
      s += `<text x="${x0}" y="${topH + 14}" class="an-idx">queue · front → back</text>`;
      queue.forEach((v, i) => {
        const fill = (f.queueHl || []).includes(i) ? 'var(--an-hl)' : 'var(--an-cell)';
        s += `<rect x="${x0 + i * qw}" y="${y}" width="${qw - 4}" height="${ch}" rx="5" fill="${fill}" stroke="var(--an-line)"/>
              ${cellText(x0 + i * qw + (qw - 4) / 2, y + ch / 2 + 5, qw - 4, v, 'an-val an-small')}`;
      });
    }
    return s + '</svg>';
  }

  const DRAW = { array: drawArray, grid: drawGrid, list: drawList, tree: drawTree, graph: drawGraph, stack: drawStack };

  /** Append queue / stack rows under any picture that carries them (the stack kind draws its own). */
  function withCollections(svg, kind, f) {
    const rows = [];
    if (kind !== 'stack' && f.queue?.length) rows.push(['queue · front → back', f.queue, f.queueHl || []]);
    if (kind !== 'stack' && f.stack?.length) rows.push(['stack · bottom → top', f.stack, f.stackHl || []]);
    if (!rows.length) return svg;
    const m = /viewBox="0 0 (\d+) (\d+)"/.exec(svg);
    if (!m) return svg;
    const H = Number(m[2]), ch = 30, rowH = ch + 30;
    let extra = '';
    rows.forEach(([label, items, hl], r) => {
      const y = H + 6 + r * rowH;
      const n = items.length, cw = fitWidth(items, W - 40, 64, 140), x0 = (W - cw * n) / 2;
      extra += `<text x="${x0}" y="${y + 10}" class="an-idx">${esc(label)}</text>`;
      items.forEach((v, i) => {
        extra += `<rect x="${x0 + i * cw}" y="${y + 16}" width="${cw - 4}" height="${ch}" rx="5" fill="${hl.includes(i) ? 'var(--an-hl)' : 'var(--an-aux)'}" stroke="var(--an-line)"/>
                  ${cellText(x0 + i * cw + (cw - 4) / 2, y + 16 + ch / 2 + 5, cw - 4, v, 'an-val an-small')}`;
      });
    });
    return svg.replace(m[0], `viewBox="0 0 ${m[1]} ${H + 6 + rows.length * rowH}"`).replace('</svg>', extra + '</svg>');
  }

  function draw(kind, f) {
    try { return withCollections((DRAW[kind] || drawArray)(f), kind, f); }
    catch { return '<p class="an-err">This frame could not be drawn.</p>'; }
  }

  // -------------------------------------------------------------- player ---
  // Narration is off by default and remembered per device.
  const narrateOn = () => { try { return localStorage.getItem('walk.narrate') === '1'; } catch { return false; } };
  const setNarrate = on => { try { localStorage.setItem('walk.narrate', on ? '1' : '0'); } catch { /* fine */ } };
  const canNarrate = () => Boolean(window.Voice?.canSpeak?.());
  /** What is read aloud for a frame: the spoken line if it has one, else the caption and the why. */
  const narration = f => (f.say || [f.caption, f.note].filter(Boolean).join('. ')).replace(/\s+/g, ' ').trim();

  /** Mount a player into `el` for walkthrough `w`. Returns { destroy }. */
  function mount(el, w) {
    const examples = (w.examples && w.examples.length) ? w.examples : [{ name: 'General case', input: w.input, frames: w.frames || [] }];
    let ex = 0;
    let frames = examples[0].frames || [];
    let i = 0, playing = false, timer = null, speed = 1;
    const codeLines = String(w.code || '').split('\n');
    const hasCode = codeLines.length > 1 && frames.some(f => f.line);
    const tab = (e, k) => `<button class="an-ex${k === 0 ? ' sel' : ''}${e.yours ? ' an-ex-yours' : ''}" data-k="${k}" role="tab" title="${esc(e.input)}">${esc(e.name)}${
      e.verified === true ? '<span class="an-verified" title="The code was run on this input and returned exactly this">✓</span>'
      : e.verified === false ? '<span class="an-unverified" title="Could not confirm by running the code">?</span>' : ''}</button>`;
    el.innerHTML = `
      <div class="an-examples" role="tablist">
        ${examples.map(tab).join('')}
        ${w.onAddExample ? '<button class="an-ex an-ex-add" type="button" title="Trace this code on an input you choose">+ Your input</button>' : ''}
      </div>
      ${w.onAddExample ? `<form class="an-add" hidden>
        <input class="an-add-input" type="text" maxlength="400" placeholder="e.g. [[&quot;Ann&quot;, 1, 5], [&quot;Bob&quot;, 3, 9]]  — the argument(s) as Python literals" autocomplete="off">
        <button class="primary an-add-go" type="submit">Trace it</button>
        <button class="ghost an-add-cancel" type="button">Cancel</button>
        <div class="an-add-msg" hidden></div>
      </form>` : ''}
      <div class="an-input"><span class="an-io"><b>Input</b> <code class="an-in"></code></span><span class="an-io an-exp"><b>Expected</b> <code class="an-out"></code></span><span class="an-io an-actual" hidden><b>Code returned</b> <code class="an-act"></code></span>${w.onRemoveExample ? '<button class="ghost an-ex-remove" type="button" hidden>Remove this example</button>' : ''}</div>
      <div class="an-why"></div>
      <div class="an-stage"></div>
      <div class="an-legend"><span><i class="l-hl"></i>examining</span><span><i class="l-done"></i>settled</span><span><i class="l-bad"></i>ruled out</span><span><i class="l-ptr"></i>pointer / active edge</span></div>
      <div class="an-vars"></div>
      <div class="an-caption"></div>
      <div class="an-say" hidden></div>
      <div class="an-note"></div>
      <div class="an-controls">
        <button class="ghost an-first" title="First frame">⏮</button>
        <button class="ghost an-prev" title="Previous">◀</button>
        <button class="primary an-play" title="Play">▶ Play</button>
        <button class="ghost an-next" title="Next">▶</button>
        <span class="an-pos"></span>
        <label class="an-speed">Speed
          <select><option value="0.5">0.5×</option><option value="1" selected>1×</option><option value="2">2×</option></select>
        </label>
        <label class="an-loop"><input type="checkbox" checked> Loop</label>
        <label class="an-narrate" title="Read each step aloud"><input type="checkbox"${narrateOn() ? ' checked' : ''}> &#128264; Narrate</label>
        <input type="range" class="an-scrub" min="0" max="${Math.max(frames.length - 1, 0)}" value="0" aria-label="Scrub frames">
      </div>
      ${w.onAsk ? `<div class="an-ask">
        <div class="an-ask-title">Ask about this step</div>
        <div class="an-ask-log"></div>
        <div class="an-ask-chips">${['Why do we do this here?', 'What would go wrong if we skipped it?', 'What should I say out loud at this point?', 'How does this step handle the edge case?']
          .map(c => `<button class="ln-chip an-ask-chip">${esc(c)}</button>`).join('')}</div>
        <div class="bv-compose an-ask-compose">
          <textarea class="an-ask-input" rows="2" placeholder="Anything about step 1 — the values on screen, the why, what to say…"></textarea>
          <button class="primary an-ask-send">Ask</button>
        </div>
      </div>` : ''}
      ${hasCode ? `<details class="an-code" open><summary>Code — the highlighted line is the one this step runs</summary>
        <pre class="ln-code an-pre">${codeLines.map((l, n) => `<span class="an-ln" data-n="${n + 1}"><i>${n + 1}</i>${esc(l) || ' '}</span>`).join('\n')}</pre>
      </details>` : ''}`;
    const withHeaders = f => (w.kind === 'grid' ? { ...f, ...gridHeaders(examples[ex].input, f) } : f);
    const $ = c => el.querySelector(c);
    const stage = $('.an-stage'), cap = $('.an-caption'), note = $('.an-note'), vars = $('.an-vars'), say = $('.an-say'),
      pos = $('.an-pos'), play = $('.an-play'), scrub = $('.an-scrub'), inputEl = $('.an-in'), expEl = $('.an-out'), whyEl = $('.an-why');
    function showExample(e) {
      inputEl.textContent = e.input || '';
      expEl.textContent = e.expected || '';
      $('.an-exp').hidden = !e.expected;
      // When execution disagreed with the trace, show both so the reader trusts the code, not the frames.
      const mismatch = e.verified === false && e.actual && e.actual !== e.expected;
      $('.an-act').textContent = mismatch ? e.actual : '';
      $('.an-actual').hidden = !mismatch;
      const rm = $('.an-ex-remove');
      if (rm) rm.hidden = !e.yours;
      whyEl.textContent = e.why ? `Why this example: ${e.why}` : '';
      whyEl.hidden = !e.why;
    }

    if (w.onAddExample) {
      const form = $('.an-add'), input = $('.an-add-input'), msg = $('.an-add-msg'), go = $('.an-add-go');
      $('.an-ex-add').onclick = () => { form.hidden = !form.hidden; if (!form.hidden) input.focus(); };
      $('.an-add-cancel').onclick = () => { form.hidden = true; msg.hidden = true; };
      form.onsubmit = async ev => {
        ev.preventDefault();
        const text = input.value.trim();
        if (!text) return;
        go.disabled = true;
        msg.hidden = false; msg.className = 'an-add-msg'; msg.textContent = 'Running the code on your input and tracing it… about twenty seconds.';
        try {
          await w.onAddExample(text);     // the caller re-mounts with the new example selected
        } catch (err) {
          msg.className = 'an-add-msg an-add-err';
          msg.textContent = err.message || 'Could not trace that input.';
          go.disabled = false;
        }
      };
    }
    if (w.onRemoveExample) $('.an-ex-remove').onclick = () => w.onRemoveExample(ex);

    function pick(k) {
      stop();
      ex = Math.max(0, Math.min(examples.length - 1, k));
      frames = examples[ex].frames || [];
      scrub.max = String(Math.max(frames.length - 1, 0));
      showExample(examples[ex]);
      el.querySelectorAll('.an-ex[data-k]').forEach(b => b.classList.toggle('sel', Number(b.dataset.k) === ex));
      settleHeight();
      show(0);
    }
    el.querySelectorAll('.an-ex[data-k]').forEach(b => { b.onclick = () => pick(Number(b.dataset.k)); });
    showExample(examples[0]);

    function show(k) {
      i = Math.max(0, Math.min(frames.length - 1, k));
      const f = frames[i];
      if (!f) { stage.innerHTML = '<p class="an-err">No frames.</p>'; return; }
      stage.innerHTML = draw(w.kind, withHeaders(f));
      cap.innerHTML = `<span class="an-step">Step ${i + 1}</span> ${esc(f.caption)}`;
      note.textContent = f.note || '';
      note.hidden = !f.note;
      say.innerHTML = f.say ? `<span class="an-say-tag">You say</span> “${esc(f.say)}”` : '';
      say.hidden = !f.say;
      const vs = Object.entries(f.vars || {});
      vars.innerHTML = vs.map(([k2, v]) => `<span class="an-var"><b>${esc(k2)}</b> ${esc(v)}</span>`).join('');
      vars.hidden = !vs.length;
      pos.textContent = `${i + 1} / ${frames.length}`;
      scrub.value = String(i);
      if (hasCode) {
        el.querySelectorAll('.an-ln.on').forEach(x => x.classList.remove('on'));
        const ln = f.line && el.querySelector(`.an-ln[data-n="${f.line}"]`);
        if (ln) {
          ln.classList.add('on');
          // Scroll the code box itself, never the page: scrollIntoView walks
          // every scrollable ancestor and yanked the whole pane about.
          const pre = el.querySelector('.an-pre');
          const target = ln.offsetTop - pre.clientHeight / 2 + ln.offsetHeight / 2;
          if (Math.abs(pre.scrollTop - target) > 8) pre.scrollTop = Math.max(0, target);
        }
      }
      if (narrate && !quiet) speakFrame(f);
      el.dispatchEvent(new CustomEvent('an-step'));
    }

    // The drawing's height varies with pointers, brackets and aux rows, so
    // the stage is held at the tallest frame of the example: nothing below
    // it moves as the steps change.
    function settleHeight() {
      let maxH = 0;
      for (const f of frames) {
        const m = /viewBox="0 0 \d+ (\d+)"/.exec(draw(w.kind, withHeaders(f)));
        if (m) maxH = Math.max(maxH, Number(m[1]));
      }
      // The SVG fills the stage width, so its rendered height scales with it.
      // No width yet means the pane is not laid out; try again shortly.
      const width = Math.min(stage.clientWidth, 760);        // the SVG is capped at 760px wide
      // Stop once the player is gone (re-mounted or the page moved on), or it polls forever.
      if (!width) { if (el.isConnected && !destroyed) setTimeout(settleHeight, 300); return; }
      stage.style.minHeight = maxH ? `${Math.ceil(maxH * width / 560) + 2}px` : '';
    }

    let destroyed = false;
    let narrate = narrateOn() && canNarrate();
    let speaking = null;                    // promise of the line being read
    function speakFrame(f) {
      const text = narration(f);
      if (!text || !canNarrate()) return Promise.resolve();
      speaking = window.Voice.speakAsync(text, { voice: window.Voice.voiceFor?.('interviewer') });
      return speaking;
    }
    let quiet = false;                      // suppress narration during a silent redraw
    async function tick() {
      if (!playing) return;
      if (i >= frames.length - 1) {
        if ($('.an-loop input').checked) show(0); else { stop(); return; }
      } else show(i + 1);
      if (narrate && speaking) {
        // Let the line finish before moving on, as a person explaining would.
        await speaking.catch(() => {});
        if (!playing) return;
        timer = setTimeout(tick, 700 / speed);
      } else {
        timer = setTimeout(tick, 2800 / speed);
      }
    }
    async function start() {
      if (playing) return;
      playing = true; play.textContent = '❚❚ Pause';
      if (narrate) { await speakFrame(frames[i]).catch(() => {}); if (!playing) return; timer = setTimeout(tick, 700 / speed); }
      else timer = setTimeout(tick, 2800 / speed);
    }
    function stop() { playing = false; play.textContent = '▶ Play'; clearTimeout(timer); if (narrate) window.Voice?.stopSpeaking?.(); }

    play.onclick = () => (playing ? stop() : start());
    $('.an-prev').onclick = () => { stop(); show(i - 1); };
    $('.an-next').onclick = () => { stop(); show(i + 1); };
    $('.an-first').onclick = () => { stop(); show(0); };
    $('.an-speed select').onchange = e => { speed = Number(e.target.value) || 1; };
    scrub.oninput = () => { stop(); show(Number(scrub.value)); };
    const narrateBox = $('.an-narrate input');
    if (!canNarrate()) { narrateBox.disabled = true; $('.an-narrate').title = 'No voice available in this browser'; }
    narrateBox.onchange = () => {
      narrate = narrateBox.checked && canNarrate();
      setNarrate(narrateBox.checked);
      if (narrate) speakFrame(frames[i]); else window.Voice?.stopSpeaking?.();
    };
    // --- ask about the step on screen ---------------------------------------
    if (w.onAsk) {
      const log = $('.an-ask-log'), input = $('.an-ask-input'), send = $('.an-ask-send');
      const thread = [];                      // per player, cleared when the step changes
      let busy = false, threadStep = -1;
      const renderLog = thinking => {
        log.innerHTML = thread.map(m => `<div class="bv-turn ${m.role === 'user' ? 'me' : ''}"><div class="bv-who">${m.role === 'user' ? 'You' : 'Tutor'}</div><div class="bv-text">${esc(m.content)}</div></div>`).join('')
          + (thinking ? '<div class="bv-turn"><div class="bv-who">Tutor</div><div class="bv-text bv-typing">thinking…</div></div>' : '');
        log.hidden = !thread.length && !thinking;
      };
      const ask = async text => {
        text = String(text || '').trim();
        if (!text || busy) return;
        if (threadStep !== i) { thread.length = 0; threadStep = i; }
        busy = true; send.disabled = true; input.value = '';
        thread.push({ role: 'user', content: text });
        renderLog(true);
        try {
          const reply = await w.onAsk({ example: ex, frame: i, question: text, messages: thread.slice(0, -1).slice(-6) });
          thread.push({ role: 'assistant', content: reply });
        } catch (e) {
          thread.push({ role: 'assistant', content: `[${e.message}]` });
          input.value = text;
        } finally { busy = false; send.disabled = false; renderLog(false); }
      };
      send.onclick = () => ask(input.value);
      input.addEventListener('keydown', e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); ask(input.value); } });
      el.querySelectorAll('.an-ask-chip').forEach(c => { c.onclick = () => ask(c.textContent); });
      renderLog(false);
      el.addEventListener('an-step', () => {
        input.placeholder = `Anything about step ${i + 1} — the values on screen, the why, what to say…`;
        if (threadStep !== i && thread.length) { thread.length = 0; renderLog(false); }
      });
    }

    const onResize = () => settleHeight();
    window.addEventListener('resize', onResize);
    settleHeight();
    quiet = true;
    if (Number.isInteger(w.startAt) && w.startAt > 0 && w.startAt < examples.length) pick(w.startAt); else show(0);
    quiet = false;
    return { destroy: () => { destroyed = true; stop(); window.removeEventListener('resize', onResize); }, play: start };
  }

  return { mount, draw };
})();
