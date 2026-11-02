/**
 * Structural checks on an animated trace: every slide must draw something
 * that refers to real cells or nodes, carry a teaching note, show the queue
 * or stack when the code uses one, and the last slide must state the answer.
 * Returns human-readable issues per example; an empty list means clean.
 */

const usesQueue = code => /deque\(|popleft|heapq|heappop|heappush|PriorityQueue/.test(code);
/** An explicit stack variable, or a function that calls itself. */
function usesStack(code) {
  if (/\bstack\b/.test(code)) return true;
  // A function whose own body calls it: split on defs at the same indent and look inside each.
  const defs = [...code.matchAll(/^( *)def (\w+)\([^)]*\):\n/gm)];
  return defs.some((m, i) => {
    const indent = m[1].length;
    const start = m.index + m[0].length;
    const rest = code.slice(start);
    const endRel = rest.search(new RegExp(`^ {0,${indent}}\\S`, 'm'));
    const body = endRel < 0 ? rest : rest.slice(0, endRel);
    return new RegExp(`(?<![\\w.])${m[2]}\\(`).test(body);
  });
}

/** The literal tokens of an expected value, so we can tell whether the final caption mentions it. */
function answerTokens(expected) {
  return String(expected || '').match(/-?\d+(?:\.\d+)?|'[^']*'|"[^"]*"|True|False|None/g) || [];
}

function frameIssues(f, k, kind, n) {
  const at = `slide ${k + 1}/${n}`;
  const out = [];
  if (!f.note || f.note.length < 12) out.push(`${at}: no teaching note`);
  if (f.caption.length < 10) out.push(`${at}: caption too short`);
  const text = `${f.caption} ${f.note}`;
  if (/\b(wait|hmm|actually|let me|oops|i think|re-?check)\b/i.test(text) || /\?\s*(wait|no)\b/i.test(text)) out.push(`${at}: thinking-aloud left in the text`);
  if (/\b(summari[sz]es?|for brevity|skipping|each (one|of them) (is|are|gets?)|and so on|similarly for the rest)\b/i.test(text)) {
    out.push(`${at}: several steps collapsed into one slide — show each change on its own slide`);
  }
  // Middle slides must point at something; the first shows the input and the last the answer.
  const marked = (f.highlight?.length || f.done?.length || f.bad?.length || f.ranges?.length || f.activeEdges?.length
    || Object.keys(f.pointers || {}).length || f.stackHl?.length || f.queueHl?.length || Object.keys(f.labels || {}).length);
  if (!marked && k > 0 && k < n - 1) out.push(`${at}: nothing marked — which cell or node is this step about?`);
  if (kind === 'array' || kind === 'stack') {
    if (!f.cells.length && kind === 'array') out.push(`${at}: no cells drawn`);
  } else if (kind === 'grid') {
    const rows = f.grid.length, cols = f.grid[0]?.length || 0;
    if (!rows || !cols) out.push(`${at}: empty grid`);
    const ragged = f.grid.some(r => r.length !== cols);
    if (ragged) out.push(`${at}: ragged grid rows`);
    for (const g of ['highlight', 'done', 'bad']) {
      if (f[g].some(([r, c]) => r < 0 || c < 0 || r >= rows || c >= cols)) out.push(`${at}: ${g} cell outside the grid`);
    }
  } else {
    const ids = new Set(f.nodes.map(x => x.id));
    for (const g of ['highlight', 'done', 'bad']) {
      const missing = (f[g] || []).filter(id => !ids.has(id));
      if (missing.length) out.push(`${at}: ${g} refers to unknown node ${missing[0]}`);
    }
    if (kind === 'graph') {
      const bad = f.edges.find(([a, b]) => !ids.has(a) || !ids.has(b));
      if (bad) out.push(`${at}: edge ${bad[0]}-${bad[1]} touches an unknown node`);
      const badA = f.activeEdges.find(([a, b]) => !ids.has(a) || !ids.has(b));
      if (badA) out.push(`${at}: active edge ${badA[0]}-${badA[1]} touches an unknown node`);
    }
    if (kind === 'tree') {
      const roots = f.nodes.filter(x => x.parent == null).length;
      if (f.nodes.length > 1 && roots === f.nodes.length) out.push(`${at}: tree has no parent links — draws as a flat row`);
    }
    if (kind === 'list') {
      const dangling = Object.entries(f.next).find(([a, b]) => !ids.has(a) || !ids.has(b));
      if (dangling) out.push(`${at}: next link ${dangling[0]}→${dangling[1]} touches an unknown node`);
    }
  }
  return out;
}

const sig = f => JSON.stringify([f.caption, f.cells, f.grid, f.nodes, f.highlight, f.done, f.bad, f.pointers, f.stack, f.queue, f.vars]);

/** Issues for one example of a trace (`code` is the snippet the frames trace, '' for a question explainer). */
export function lintExample(e, kind, code) {
  const fr = e.frames || [];
  const n = fr.length;
  const out = [];
  if (n < 4) out.push(`only ${n} slides`);
  if (!e.input) out.push('no input shown');
  // A matrix input flattened into a row of "(r,c)" cells hides the shape the reader needs to see.
  if (kind !== 'grid' && /\[\s*\[\s*-?\d+\s*,\s*-?\d+/.test(`${e.input} ${e.call || ''}`)
      && (e.frames || []).some(f => (f.cells || []).filter(c => /^\(\d+,\s*\d+\)/.test(c)).length >= 4)) {
    out.push('input is a 2-D grid but drawn as a flat row of (r,c) cells — use kind "grid"');
  }
  if (!e.expected) out.push('no expected output');
  fr.forEach((f, k) => out.push(...frameIssues(f, k, kind, n)));
  for (let k = 1; k < n; k++) if (sig(fr[k]) === sig(fr[k - 1])) out.push(`slide ${k + 1}/${n}: identical to the previous slide`);
  if (code) {
    const withLine = fr.filter(f => f.line).length;
    if (withLine < n * 0.6) out.push(`${n - withLine} of ${n} slides point at no code line`);
    if (usesQueue(code) && !fr.some(f => f.queue?.length)) out.push('code uses a queue/heap but no slide shows it');
    if (usesStack(code) && !fr.some(f => f.stack?.length)) out.push('code uses a stack/recursion but no slide shows it');
  }
  const last = fr[n - 1];
  if (last) {
    const toks = answerTokens(e.expected);
    const text = `${last.caption} ${last.note}`;
    const hit = toks.filter(t => text.includes(t.replace(/^['"]|['"]$/g, '')));
    const squash = s => String(s).replace(/\s+/g, '');
    // A scalar must appear; a list/matrix answer must appear whole (the reader compares it to "expected").
    const stated = toks.length <= 2 ? hit.length === toks.length : squash(text).includes(squash(e.expected));
    if (toks.length && !stated) out.push(`last slide does not state the final answer ${String(e.expected).slice(0, 60)} in its caption`);
  }
  if (e.verified === false) out.push(`expected output not confirmed by running the code${e.verifyError ? ` (${e.verifyError})` : ''}`);
  // Cap so one broken trace does not flood the report.
  return out.slice(0, 12);
}

/** { exampleName: [issues] } for every example that has any. */
export function lint(anim, code = anim.code || '') {
  const out = {};
  for (const e of anim.examples || []) {
    const issues = lintExample(e, anim.kind, code);
    if (issues.length) out[e.name] = issues;
  }
  return out;
}

export const issueCount = (anim, code) => Object.values(lint(anim, code)).reduce((s, l) => s + l.length, 0);
