/* Home: where you stand and what to do next. Reads only what the other tabs
 * already keep (history, progress, profile, preferences — all synced to the
 * signed-in account) plus three cheap catalogue calls, so it costs nothing
 * to open. A failed catalogue call is not cached and offers a Retry. */
(function () {
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const key = t => String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  let cache = { algomaster: null, google: null, categories: null };
  const inflight = {};
  let renderSeq = 0;        // only the latest render may paint

  /** Fetches JSON and throws on a non-2xx (a 429 from the rate limiter must
   *  not be cached as if it were the catalogue). */
  async function getJson(url) {
    const r = await fetch(url);
    const d = await r.json().catch(() => null);
    if (!r.ok) throw new Error(r.status === 429 ? 'too many requests (429)' : (d?.error || `request failed (${r.status})`));
    if (!d || typeof d !== 'object') throw new Error('empty response');
    return d;
  }

  async function catalogue() {
    const failed = [];
    const get = async (k, url, label) => {
      if (cache[k]) return cache[k];
      try {
        inflight[k] = inflight[k] || getJson(url).finally(() => { delete inflight[k]; });
        cache[k] = await inflight[k];
      } catch (e) { failed.push(`${label}: ${e.message}`); }
      return cache[k];
    };
    await Promise.all([
      get('algomaster', '/api/patterns/meta/algomaster', 'AlgoMaster list'),
      get('google', '/api/google/questions', 'Google set'),
      get('categories', '/api/behavioural/categories', 'behavioural categories'),
    ]);
    return { ...cache, failed };
  }

  function progress() {
    try { return JSON.parse(localStorage.getItem('learn.progress') || '{}'); } catch { return {}; }
  }

  const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; };
  const pct = (a, b) => (b ? Math.round(100 * a / b) : 0);

  // What the recruiter said the next stage is. Kept as data so the card, the
  // checklist and the mock buttons all describe the same round.
  const ROUND = {
    title: 'Next: Technical phone screen + Googleyness',
    sub: '2 × 45 minutes over Google Meet · headset, stable connection · casual, be yourself',
    coding: [
      ['Clarify', 'The question is open-ended on purpose. Ask about input size, types, duplicates, empties; state assumptions out loud.'],
      ['Algorithm', 'Explain the approach in words with time and space before typing anything.'],
      ['Code', '20–30 lines of real code in your strongest language. Proper syntax, the right data structures, no pseudo-code. Write it, then refine.'],
      ['Optimise & test', 'Improve complexity, name edge and corner cases, trace a test by hand, find your own bugs, make it production-ready.'],
    ],
    gca: [
      ['Understand', 'Ask clarifying questions; if you get no answer, state an assumption and carry on.'],
      ['Prepare', 'Say what data you need — existing, historic, new — and where it would come from.'],
      ['Identify a solution', 'Weigh the options, then commit to one recommendation.'],
      ['Support it', 'What the outcome would be, and how you would track it over time.'],
    ],
    googleyness: ['Working alone vs in a team', 'Helping others', 'Navigating ambiguity', 'Growing outside your comfort zone', 'Leading without the title'],
    links: [
      ['SWE candidate prep', 'https://www.google.com/about/careers/applications/candidate-prep/swe'],
      ['Interview tips', 'https://www.google.com/about/careers/applications/interview-tips/'],
      ['How we hire', 'https://www.google.com/about/careers/applications/how-we-hire/'],
      ['Pathways', 'https://rsvp.withgoogle.com/events/google-pathways/home'],
      ['Example interview', 'https://www.youtube.com/watch?v=XKu_SEDAykw'],
      ['Coding prep video', 'https://www.youtube.com/watch?v=6ZZX9iIgFoo'],
      ['Googleyness video', 'https://www.youtube.com/watch?v=2Cr3-et4xkI'],
      ['Tips from SWEs', 'https://www.youtube.com/watch?v=XOtrOSatBoY'],
    ],
  };

  function nextRound() {
    const steps = list => `<ol class="hm-steps">${list.map(([k, v]) => `<li><strong>${esc(k)}</strong> — ${esc(v)}</li>`).join('')}</ol>`;
    return `
      <section class="hm-card hm-round">
        <div class="hm-round-head">
          <div>
            <h2>${esc(ROUND.title)}</h2>
            <p class="gl-muted">${esc(ROUND.sub)}</p>
          </div>
          <div class="hm-round-cta">
            <button class="primary" data-mock="phonescreen">&#9654; 45-min phone screen mock</button>
            <button class="ghost" data-mock="googleyness">Googleyness mock</button>
            <button class="ghost" data-mock="gca">Hypothetical (GCA) mock</button>
          </div>
        </div>
        <div class="hm-round-grid">
          <div><h3>Coding round — how it runs</h3>${steps(ROUND.coding)}</div>
          <div><h3>Hypotheticals — 4-step framework</h3>${steps(ROUND.gca)}</div>
          <div>
            <h3>Googleyness — have a story for</h3>
            <ul class="hm-tags">${ROUND.googleyness.map(t => `<li>${esc(t)}</li>`).join('')}</ul>
            <h3>Also scored throughout</h3>
            <p class="hm-small">General Cognitive Ability, Role-Related Knowledge, Leadership, Googleyness. Expect a question about something on your resume.</p>
            <h3>Recruiter's links</h3>
            <p class="hm-links">${ROUND.links.map(([t, u]) => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(t)}</a>`).join('')}</p>
          </div>
        </div>
      </section>`;
  }

  async function startMock(kind) {
    if (kind === 'phonescreen') {
      try { localStorage.setItem('persona', 'phonescreen'); } catch { /* fine */ }
      const sel = $('personaSel');
      if (sel && [...sel.options].some(o => o.value === 'phonescreen')) { sel.value = 'phonescreen'; sel.onchange?.(); }
      window.setInterviewMode?.('coding');
      // The mock lives in the Coding interview view (interviewer, Start, timer),
      // not in practice, which hides all of them.
      window.QFCoding?.setFlavour?.('interview');
      return;
    }
    if ($('bvLen')) $('bvLen').value = '45';   // the real round is 45 minutes
    try {
      const d = await getJson(`/api/behavioural/questions/${kind}`);
      const qs = d.questions || [];
      const q = qs[Math.floor(Math.random() * qs.length)];
      if (q) return window.behaviouralPractise?.(q, kind === 'gca' ? 'General Cognitive Ability' : 'Googleyness & Leadership');
    } catch { /* fall through */ }
    window.setInterviewMode?.('behavioural');
  }

  async function render() {
    const root = $('hmRoot'); if (!root) return;
    root.innerHTML = '<p class="gl-muted">Loading…</p>';
    const seq = ++renderSeq;
    const c = await catalogue();
    if (seq !== renderSeq) return;
    const failed = c.failed;
    const profile = window.Profile?.get();
    const profileOn = window.Profile?.enabled?.();
    const stats = window.History?.stats?.() || { total: 0, coding: 0, behavioural: 0, acceptRate: null, avgPercent: null, perSignal: [], totalMinutes: 0 };
    const recent = (window.History?.list?.() || []).slice(0, 4);
    const prog = progress(); const solvedKeys = new Set(Object.keys(prog.solved || {}));
    const am = c.algomaster; const amAll = am && Array.isArray(am.sections) ? am.sections.flatMap(s => s.problems || []) : [];
    const amSolved = amAll.filter(p => solvedKeys.has(key(p.title))).length;
    const amNext = amAll.filter(p => p.available && !solvedKeys.has(key(p.title)));
    const pick = amNext.length ? amNext[Math.floor(Math.random() * amNext.length)] : null;
    const g = c.google;
    const vp = window.Voice?.prefs?.() || {};
    const voiceReady = window.Voice?.serverReady?.();
    const weakest = stats.perSignal?.[0];
    const cats = c.categories?.categories || [];
    const cat = cats.length ? cats[Math.floor(Math.random() * cats.length)] : null;
    // Fall back to the account and the active Today plan, so this page names
    // the same person and interview as the rest of the app.
    const name = (profile?.name || window.QF?.user?.name || '').split(' ')[0];
    const plan = window.QFSprint?.target?.();
    const target = profile?.targetRole || (plan ? `${plan.company} ${plan.level} ${plan.role}`.trim() : 'Software Engineer III · Google London');

    const setup = [
      { ok: !!profile && profileOn, label: profile ? (profileOn ? 'Resume profile on — interviews are tailored to you' : 'Resume profile is off') : 'Upload your resume so every interview is about you', go: 'resume' },
      { ok: voiceReady && vp.engine !== 'browser', label: voiceReady ? (vp.engine !== 'browser' ? 'Neural voice on' : 'Voice engine set to Browser — switch to Natural') : 'Neural voice not reachable right now', go: 'settings' },
      { ok: stats.total > 0, label: stats.total ? `${stats.total} session${stats.total === 1 ? '' : 's'} recorded` : 'Run your first mock interview', go: 'coding' },
    ];

    root.innerHTML = `
      <div class="hm-head">
        <div>
          <h1>${greeting()}${name ? `, ${esc(name)}` : ''}.</h1>
          <p class="bv-lede">Preparing for <strong>${esc(target)}</strong>. Here is where you stand and what to do next.</p>
        </div>
      </div>
      ${failed.length ? `<div class="hs-note err hm-load-err" role="alert">Some of this page could not load (${esc(failed.join('; '))}), so a few numbers are missing.
        <button type="button" class="ghost qf-retry" id="hmRetry">Retry</button></div>` : ''}

      <div class="hm-stats">
        <button class="hm-stat" data-go="learn" data-learn="problems">
          <span class="hm-stat-label">AlgoMaster 300</span>
          <span class="hm-stat-value">${amSolved}<small>/${amAll.length || 300}</small></span>
          <span class="hs-bar"><i style="width:${pct(amSolved, amAll.length || 300)}%"></i></span>
          <span class="hm-stat-sub">problems solved</span>
        </button>
        <button class="hm-stat" data-go="learn" data-learn="google">
          <span class="hm-stat-label">Google set</span>
          <span class="hm-stat-value">${g?.explained ?? '–'}<small>/${g?.questions?.length ?? 643}</small></span>
          <span class="hs-bar"><i style="width:${pct(g?.explained || 0, g?.questions?.length || 643)}%"></i></span>
          <span class="hm-stat-sub">explained · ${g?.animated ?? 0} animated</span>
        </button>
        <button class="hm-stat" data-go="history">
          <span class="hm-stat-label">Coding interviews</span>
          <span class="hm-stat-value">${stats.coding}</span>
          <span class="hm-stat-sub">${stats.acceptRate != null ? `${stats.acceptRate}% accepted` : 'none yet'}</span>
        </button>
        <button class="hm-stat" data-go="history">
          <span class="hm-stat-label">Behavioural</span>
          <span class="hm-stat-value">${stats.behavioural}</span>
          <span class="hm-stat-sub">${stats.avgPercent != null ? `${stats.avgPercent}% average score` : 'none yet'}</span>
        </button>
      </div>

      ${nextRound()}

      <div class="hm-grid">
        <section class="hm-card">
          <h3>Practise now</h3>
          <div class="hm-actions">
            ${pick ? `<button class="hm-action" data-open="${esc(pick.slug)}" data-title="${esc(pick.title)}">
              <span class="hm-action-k">Next problem</span><span class="hm-action-v">${esc(pick.title)} <span class="ln-diff ${esc((pick.difficulty || '').toLowerCase())}">${esc(pick.difficulty)}</span></span>
              <span class="hm-action-s">A random unsolved one from the 300 — 45 minutes, interviewer on</span></button>` : ''}
            ${cat ? `<button class="hm-action" data-bhv="${esc(cat.id)}" data-label="${esc(cat.label || cat.name || cat.id)}">
              <span class="hm-action-k">Behavioural</span><span class="hm-action-v">${esc(cat.label || cat.name || cat.id)}</span>
              <span class="hm-action-s">One question, scored on six signals, with the level-4 rewrite of your answer</span></button>` : ''}
            <button class="hm-action" data-go="talk">
              <span class="hm-action-k">Talk</span><span class="hm-action-v">Five minutes with a Googler</span>
              <span class="hm-action-s">Introduce yourself out loud; get a read on clarity, concision and warmth</span></button>
            <button class="hm-action" data-go="watch">
              <span class="hm-action-k">Watch</span><span class="hm-action-v">See a strong candidate do it</span>
              <span class="hm-action-s">Two agents run an interview while you watch, then a STAR check</span></button>
          </div>
        </section>

        <section class="hm-card">
          <h3>Set-up</h3>
          <ul class="hm-check">${setup.map(s => `<li class="${s.ok ? 'ok' : ''}"><i>${s.ok ? '✓' : '○'}</i><button class="ln-inline" data-go="${s.go}">${esc(s.label)}</button></li>`).join('')}</ul>
          ${weakest ? `<h3>Work on</h3>
            <p class="hm-weak"><strong>${esc(weakest.label)}</strong> is your lowest signal so far, averaging ${weakest.avg.toFixed(1)} / 4 across ${stats.scoredCount} scored session${stats.scoredCount === 1 ? '' : 's'}.
              <button class="ln-inline" data-go="history">See the write-ups</button></p>` : ''}
        </section>

        <section class="hm-card hm-recent">
          <h3>Recent</h3>
          ${recent.length ? `<ul class="hm-recent-list">${recent.map(r => `<li>
              <span class="hm-type ${esc(r.type)}">${esc(r.type)}</span>
              <span class="hm-recent-title">${esc(r.title || r.question || '')}</span>
              <span class="hm-recent-meta">${r.score?.percent != null ? `${r.score.percent}%` : r.accepted ? 'accepted' : r.verdict ? esc(String(r.verdict).split('·')[0].trim()) : ''} · ${new Date(r.endedAt || r.startedAt).toLocaleDateString()}</span>
            </li>`).join('')}</ul>
            <button class="ghost" data-go="history">All history</button>` : `<p class="gl-muted">Nothing yet. Your sessions, scores and write-ups will appear here — saved to your account and synced across your devices.</p>`}
        </section>
      </div>`;

    if ($('hmRetry')) $('hmRetry').onclick = () => render();
    root.querySelectorAll('[data-go]').forEach(b => {
      b.onclick = () => {
        if (b.dataset.learn) { try { localStorage.setItem('learn.mode', b.dataset.learn === 'google' ? 'google' : 'problems'); } catch { /* fine */ } }
        window.setInterviewMode?.(b.dataset.go);
      };
    });
    root.querySelectorAll('[data-mock]').forEach(b => { b.onclick = () => startMock(b.dataset.mock); });
    root.querySelectorAll('[data-open]').forEach(b => { b.onclick = () => window.openQuestion?.(b.dataset.open, b.dataset.title); });
    root.querySelectorAll('[data-bhv]').forEach(b => {
      b.onclick = async () => {
        try {
          const d = await getJson(`/api/behavioural/questions/${encodeURIComponent(b.dataset.bhv)}`);
          const qs = d.questions || [];
          const q = qs[Math.floor(Math.random() * qs.length)];
          const text = typeof q === 'string' ? q : (q?.text || q?.q || q?.question);
          if (text) window.behaviouralPractise?.(text, b.dataset.label);
          else window.setInterviewMode?.('behavioural');
        } catch { window.setInterviewMode?.('behavioural'); }
      };
    });
  }

  window.renderHome = render;
})();
