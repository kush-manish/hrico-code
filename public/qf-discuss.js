/* Discuss approach: a chat with the AI interviewer about how to solve the
 * problem on screen, in a floating panel opened from the editor's console tabs
 * (next to History). Close it and open it again later: the conversation for
 * each question is kept (localStorage 'qf.discuss', synced to the account).
 * The agent sees the statement and your current code, nudges rather than
 * hands over the answer, and states complexity as you go. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // Replies use **bold** and `code`; show them as such (escaped first, so nothing else is HTML).
  const md = t => esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`([^`\n]+)`/g, '<code>$1</code>');
  const KEY = 'qf.discuss';
  const MAX_TURNS = 60;                           // kept per question
  const all = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; } };
  const slug = () => window.currentQuestion?.slug || '';
  const thread = () => all()[slug()] || [];
  const keep = msgs => {
    const a = all(); a[slug()] = msgs.slice(-MAX_TURNS);
    try { localStorage.setItem(KEY, JSON.stringify(a)); } catch { /* quota */ }
  };

  // How the agent should behave here: an approach discussion, not a solution dump.
  const BRIEF = 'We are discussing the APPROACH before or while I code. Talk it through with me like a Google interviewer pairing: ask what I am thinking, react to my idea, point out the edge cases and the complexity of what I propose, and nudge me towards the optimal idea one step at a time. Do not write the full solution unless I explicitly ask for it.';
  // After a submission: the interviewer's read of the solution against Google's coding rubric.
  const REVIEW = res => `Review my ${res ? 'submitted' : 'current'} solution exactly as a Google L4 phone-screen interviewer would score it.${res ? ` The judge said: ${res.status}${res.passed != null ? ` (${res.passed}/${res.total} cases)` : ''}${res.runtime ? `, runtime ${res.runtime}${res.runtimePercentile ? ` (beats ${Math.round(res.runtimePercentile)}%)` : ''}` : ''}${res.memory ? `, memory ${res.memory}` : ''}${res.lastTestcase ? `. Failing input: ${String(res.lastTestcase).slice(0, 200)}` : ''}.` : ' I have not submitted it yet.'}
Answer in this order, plainly, up to 250 words (longer than usual is fine for this review):
1. Verdict for Google: Strong hire / Hire / Lean hire / No hire, and why in one line.
2. Correctness: any bug or edge case it misses (empty input, one element, duplicates, overflow, large n).
3. Complexity: its time and space, and whether that is the optimal Google expects; if not, name the better approach in one line without writing it.
4. Code quality: naming, structure, readability, idiomatic use of the language — point at line numbers.
5. What to SAY: the two or three sentences I should have said aloud (approach, complexity, trade-offs, tests) to score well.
6. The single most important improvement.`;
  const STARTERS = ['What pattern does this look like?', 'Here is my idea: …', 'What is the brute force and its complexity?', 'What edge cases should I check?', 'Review my current code'];

  let busy = false, lastNote = '';
  function panel() { return $('qfDiscuss'); }
  function open() {
    if (!slug()) { window.QF?.toast?.('Open a question first.'); return; }
    let p = panel();
    if (!p) {
      p = document.createElement('section');
      p.id = 'qfDiscuss'; p.className = 'qf-dsc'; p.setAttribute('role', 'dialog'); p.setAttribute('aria-label', 'Discuss the approach');
      document.body.appendChild(p);
    }
    p.hidden = false;
    paint();
    p.querySelector('textarea')?.focus();
  }
  function close() { const p = panel(); if (p) p.hidden = true; }
  const toggle = () => (panel() && !panel().hidden ? close() : open());

  function paint(note = lastNote) {
    const p = panel(); if (!p || p.hidden) return;
    const q = window.currentQuestion, msgs = thread();
    p.innerHTML = `
      <header class="qf-dsc-h"><b>💬 Discuss approach</b><span class="qf-muted">${esc(q?.title || '')}</span>
        <button type="button" class="qf-dsc-x" data-dsc="clear" title="Start this question's discussion again">↺</button>
        <button type="button" class="qf-dsc-x" data-dsc="close" aria-label="Close (the conversation is kept)">✕</button></header>
      <div class="qf-dsc-log" aria-live="polite">${msgs.length ? msgs.map(m => `<div class="qf-dsc-m ${m.role === 'user' ? 'me' : ''}${m.review ? ' review' : ''}"><b>${m.role === 'user' ? 'You' : m.review ? '🎯 Google review' : 'Interviewer'}</b><p>${md(m.label || m.content)}</p></div>`).join('')
        : `<p class="qf-muted">Talk through your approach before you code. The interviewer sees the problem and your code, reacts to your idea and nudges you — it won't hand over the answer unless you ask.</p>
           <div class="qf-dsc-starts">${STARTERS.map(s => `<button type="button" class="qf-b sm" data-start="${esc(s)}">${esc(s)}</button>`).join('')}</div>`}
        ${busy ? '<div class="qf-dsc-m"><b>Interviewer</b><p class="qf-muted">thinking…</p></div>' : ''}
        ${note ? `<p class="qf-fb no">${esc(note)}</p>` : ''}</div>
      <form class="qf-dsc-f"><textarea rows="2" placeholder="Your idea, a question, or “review my code”… (Enter to send, Shift+Enter for a new line)"${busy ? ' disabled' : ''}></textarea>
        <button type="submit" class="qf-b pri sm"${busy ? ' disabled' : ''}>Send</button></form>`;
    const log = p.querySelector('.qf-dsc-log'); log.scrollTop = log.scrollHeight;
    const ta = p.querySelector('textarea'), form = p.querySelector('form');
    p.querySelector('[data-dsc=close]').onclick = close;
    p.querySelector('[data-dsc=clear]').onclick = () => { if (confirm('Start this question’s discussion again?')) { keep([]); paint(); } };
    p.querySelectorAll('[data-start]').forEach(b => { b.onclick = () => { ta.value = b.dataset.start.replace(' …', ' '); ta.focus(); if (!/…/.test(b.dataset.start)) form.requestSubmit(); }; });
    ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } if (e.key === 'Escape') close(); });
    form.onsubmit = e => { e.preventDefault(); const t = ta.value.trim(); if (t) send(t); };
  }

  async function send(text, extra = {}) {
    if (busy) return;
    lastNote = '';
    const forSlug = slug(), q = window.currentQuestion;
    const msgs = [...thread(), { role: 'user', content: text, ...extra }];
    keep(msgs); busy = true; paint();
    let note = '';
    try {
      const r = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        persona: 'helper', model: window.Settings?.modelFor?.('codingChat'), profile: window.Profile?.active?.(),
        messages: [{ role: 'user', content: BRIEF }, { role: 'assistant', content: 'Sure — tell me how you are thinking about it.' }, ...msgs.slice(-20).map(m => ({ role: m.role, content: m.content }))],
        context: {
          title: q?.title, difficulty: q?.difficulty, statement: q?.plainStatement || String(q?.content || '').replace(/<[^>]+>/g, ' '),
          code: (window.Editor?.value || '').split('\n').map((l, i) => `${i + 1}: ${l}`).join('\n'),
          lang: $('langSel')?.value || 'python3',
        } }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || `server said ${r.status}`);
      // The question may have changed while waiting: file the reply under the one it was asked about.
      const a = all(); a[forSlug] = [...(a[forSlug] || msgs), { role: 'assistant', content: d.reply || '(no reply)', ...(extra.review ? { review: true } : {}) }].slice(-MAX_TURNS);
      try { localStorage.setItem(KEY, JSON.stringify(a)); } catch { /* quota */ }
    } catch (e) { note = `Could not reach the interviewer: ${e.message}. Your message is kept — press Send again.`; }
    busy = false; lastNote = note; paint();
  }

  /** 🎯 Review for Google: the submitted code and its judge result, read against the rubric. Never asked twice for the same code. */
  const hash = t => { let h = 0; for (const c of String(t)) h = (h * 31 + c.charCodeAt(0)) | 0; return String(h); };
  function review() {
    if (!slug()) { window.QF?.toast?.('Open a question first.'); return; }
    const code = window.Editor?.value || '';
    if (!code.trim()) { window.QF?.toast?.('Write a solution first.'); return; }
    const last = window.QF_LAST_RESULT, res = last && last.slug === slug() ? last : null;
    const key = hash(code + (res?.status || ''));
    open();
    if (busy) return;
    if (thread().some(m => m.review && m.key === key)) {
      lastNote = '⚠ This exact code was already reviewed (the review is above), so the interviewer was not asked again. Change the code or submit again for a fresh review.';
      paint(); return;
    }
    const label = `🎯 Review my ${res ? `submitted solution (${res.status}${res.runtime ? `, ${res.runtime}` : ''})` : 'current code (not submitted yet)'} for a Google interview.`;
    send(REVIEW(res), { review: true, key, label });
  }

  function addButton() {
    const tabs = $('consoleTabs'); if (!tabs || $('qfDscBtn')) return;
    const b = document.createElement('button');
    b.id = 'qfDscBtn'; b.type = 'button'; b.className = 'tab qf-dsc-tab'; b.title = 'Discuss your approach with the AI interviewer — close and reopen any time, the chat is kept';
    b.textContent = '💬 Discuss approach';
    b.onclick = toggle;
    tabs.querySelector('[data-tab="attempts"]')?.after(b);
    const r = document.createElement('button');
    r.id = 'qfRevBtn'; r.type = 'button'; r.className = 'tab qf-dsc-tab'; r.title = 'After you submit: is this a hire-level solution for Google, and what would improve it? Opens in the Discuss chat so you can ask follow-ups';
    r.textContent = '🎯 Review for Google';
    r.onclick = review;
    b.after(r);
  }
  // A new question: show its own conversation if the panel is open.
  let shownFor = '';
  setInterval(() => { const p = panel(); if (p && !p.hidden && !busy && slug() !== shownFor) { shownFor = slug(); paint(); } }, 800);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && panel() && !panel().hidden && panel().contains(document.activeElement)) close(); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addButton); else addButton();
  window.QFDiscuss = { open, close, toggle, review };
})();
