/* Minimal editor matching Google's interview tool: syntax highlighting,
   auto-indent and bracket completion, but deliberately no autocomplete. */
(function () {
  const ta = document.getElementById('code');
  const hl = document.querySelector('#highlight code');
  const gutter = document.getElementById('gutter');
  const wrap = document.getElementById('editorWrap');

  const KEYWORDS = new Set(`
    def class return if elif else for while in not and or is None True False lambda import from as
    try except finally raise with yield pass break continue global nonlocal assert del self print
    int long double float char bool void auto const static public private protected new delete
    struct typedef namespace using template typename this null nullptr true false string vector
    var let function const class extends super typeof instanceof of do switch case default throw
    package interface implements extends final abstract synchronized volatile transient enum
    func type range map chan go defer select fallthrough
  `.trim().split(/\s+/));

  const PAIRS = { '(': ')', '[': ']', '{': '}', '"': '"', "'": "'", '`': '`' };
  const CLOSERS = new Set([')', ']', '}', '"', "'", '`']);

  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  function highlight(src) {
    const re = /(#[^\n]*|\/\/[^\n]*|\/\*[\s\S]*?\*\/)|("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_]\w*)/g;
    let out = '', last = 0, m;
    while ((m = re.exec(src))) {
      out += esc(src.slice(last, m.index));
      if (m[1]) out += `<span class="tok-com">${esc(m[1])}</span>`;
      else if (m[2]) out += `<span class="tok-str">${esc(m[2])}</span>`;
      else if (m[3]) out += `<span class="tok-num">${esc(m[3])}</span>`;
      else {
        const w = m[4];
        if (KEYWORDS.has(w)) out += `<span class="tok-kw">${esc(w)}</span>`;
        else if (src[re.lastIndex] === '(') out += `<span class="tok-fn">${esc(w)}</span>`;
        else out += esc(w);
      }
      last = re.lastIndex;
    }
    return out + esc(src.slice(last));
  }

  let plain = false;

  function render() {
    hl.innerHTML = (plain ? esc(ta.value) : highlight(ta.value)) + '\n';
    const lines = ta.value.split('\n').length;
    gutter.textContent = Array.from({ length: lines }, (_, i) => i + 1).join('\n');
    syncScroll();
  }

  function syncScroll() {
    hl.parentElement.scrollTop = ta.scrollTop;
    hl.parentElement.scrollLeft = ta.scrollLeft;
    gutter.scrollTop = ta.scrollTop;
  }

  function setSel(start, end = start) {
    ta.selectionStart = start;
    ta.selectionEnd = end;
  }

  // Replace [from, to) with text through execCommand so Ctrl+Z can undo it;
  // falls back to plain assignment (no undo) where execCommand is unsupported.
  function replaceRange(from, to, text) {
    setSel(from, to);
    let ok = false;
    try { ok = document.execCommand(text ? 'insertText' : 'delete', false, text); } catch { ok = false; }
    if (!ok) {
      const v = ta.value;
      ta.value = v.slice(0, from) + text + v.slice(to);
    }
  }

  function insert(text, caretOffset = text.length) {
    const { selectionStart: s, selectionEnd: e } = ta;
    replaceRange(s, e, text);
    setSel(s + caretOffset);
    render();
  }

  function lineStart(pos) {
    return ta.value.lastIndexOf('\n', pos - 1) + 1;
  }

  ta.addEventListener('input', render);
  ta.addEventListener('scroll', syncScroll);

  ta.addEventListener('keydown', (ev) => {
    const { selectionStart: s, selectionEnd: e, value } = ta;
    const sel = value.slice(s, e);

    if (ev.key === 'Tab') {
      ev.preventDefault();
      if (sel.includes('\n')) {
        const from = lineStart(s);
        const block = value.slice(from, e);
        const shifted = ev.shiftKey
          ? block.replace(/^ {1,4}/gm, '')
          : block.replace(/^/gm, '    ');
        replaceRange(from, e, shifted);
        setSel(from, from + shifted.length);
      } else {
        insert('    ');
      }
      render();
      return;
    }

    // Plain-text mode mimics a bare Google Doc: no bracket or indent assistance.
    if (plain) return;

    if (ev.key === 'Enter') {
      ev.preventDefault();
      const from = lineStart(s);
      const line = value.slice(from, s);
      let indent = (line.match(/^[ \t]*/) || [''])[0];
      const prevChar = value[s - 1];
      const nextChar = value[s];
      if (/[:{[(]$/.test(line.trimEnd())) indent += '    ';
      if (PAIRS[prevChar] && PAIRS[prevChar] === nextChar && prevChar !== '"' && prevChar !== "'") {
        const outer = indent.slice(0, -4);
        insert('\n' + indent + '\n' + outer, 1 + indent.length);
        return;
      }
      insert('\n' + indent);
      return;
    }

    if (PAIRS[ev.key]) {
      const nextChar = value[e];
      const isQuote = ev.key === '"' || ev.key === "'" || ev.key === '`';
      if (isQuote && nextChar === ev.key) {
        ev.preventDefault();
        setSel(e + 1);
        return;
      }
      if (sel) {
        ev.preventDefault();
        replaceRange(s, e, ev.key + sel + PAIRS[ev.key]);
        setSel(s + 1, e + 1);
        render();
        return;
      }
      if (isQuote && /\w/.test(value[s - 1] || '')) return;   // apostrophe: don't → don't, not don''
      if (!nextChar || /[\s)\]},;]/.test(nextChar)) {
        ev.preventDefault();
        insert(ev.key + PAIRS[ev.key], 1);
      }
      return;
    }

    if (CLOSERS.has(ev.key) && value[e] === ev.key && s === e) {
      ev.preventDefault();
      setSel(e + 1);
      return;
    }

    if (ev.key === 'Backspace' && s === e && PAIRS[value[s - 1]] === value[s]) {
      ev.preventDefault();
      replaceRange(s - 1, s + 1, '');
      setSel(s - 1);
      render();
    }
  });

  window.Editor = {
    get value() { return ta.value; },
    set value(v) { ta.value = v; render(); ta.scrollTop = 0; },
    get plain() { return plain; },
    set plain(v) { plain = v; render(); },
    focus: () => ta.focus(),
  };

  render();
  new ResizeObserver(syncScroll).observe(wrap);
})();
