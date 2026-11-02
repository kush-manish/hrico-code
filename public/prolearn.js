/* Pro-Learn tab: the full curriculum as a browsable handbook. A chapter tree
 * on the left, one reference page per topic on the right. Pages are written by
 * the server on first open and cached there, so a second visit is instant. */
(function () {
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let outline = [];
  let written = new Set();
  let current = null;                        // the slug on screen
  let seq = 0;                               // bumps on every open; stale replies are cached, not shown
  const inflight = {};                       // `${view}:${slug}` -> the fetch already running
  const cache = {};                          // slug -> article, per page load
  const simpleCache = {};                    // slug -> simple view, per page load
  const practiceCache = {};                  // slug -> raw problem statements, per page load
  const approachCache = {};                  // slug -> brute + variants, per page load
  const open = new Set();                    // expanded chapters
  let query = '';
  let player = null;                         // the mounted frame player, if any

  const VIEW = 'prolearn.view';
  const VIEWS = ['simple', 'full', 'practice'];
  let view = 'simple';
  try { const v = localStorage.getItem(VIEW); if (VIEWS.includes(v)) view = v; } catch { /* private mode */ }
  const storeFor = v => (v === 'simple' ? simpleCache : v === 'practice' ? practiceCache : cache);

  const READ = 'prolearn.read';
  const read = new Set();
  try { JSON.parse(localStorage.getItem(READ) || '[]').forEach(s => read.add(s)); } catch { /* start clean */ }
  const persist = () => {
    try { localStorage.setItem(READ, JSON.stringify([...read])); } catch { /* quota or private mode */ }
  };

  // Topics marked for a second pass.
  const STAR = 'prolearn.starred';
  const starred = new Set();
  try { JSON.parse(localStorage.getItem(STAR) || '[]').forEach(s => starred.add(s)); } catch { /* start clean */ }
  let starOnly = false;
  let probOnly = false;                      // sidebar shows only the practice problems
  // Practice problems (from algo.monster's syllabus): where to solve them.
  const DIFF = { Easy: 'E', Medium: 'M', Hard: 'H' };
  const probPill = p => (p ? `<span class="pl-prob-pill ${String(p.lc?.difficulty || '').toLowerCase()}" title="Practice problem${p.lc ? ` · LeetCode ${esc(p.lc.id)} · ${esc(p.lc.difficulty)}` : ' on algo.monster'}">${p.lc ? DIFF[p.lc.difficulty] || '•' : 'AM'}</span>` : '');
  function probBar(a) {
    const p = a?.prob;
    if (!p) return '';
    return `<div class="pl-prob-bar">
      <span class="pl-prob-tag">🎯 Practice problem${p.lc ? ` · <b class="${esc(p.lc.difficulty.toLowerCase())}">${esc(p.lc.difficulty)}</b> · LeetCode ${esc(p.lc.id)}${p.lc.paid ? ' · Premium' : ''}` : ''}</span>
      ${p.lc ? `<button type="button" class="pl-solve primary" data-slug="${esc(p.lc.slug)}" data-title="${esc(a.title)}">Solve here →</button>` : ''}
      ${p.am ? `<a class="pl-am-link" href="https://algo.monster/problems/${encodeURIComponent(a.slug)}" target="_blank" rel="noopener noreferrer">Open on AlgoMonster ↗</a>` : ''}
    </div>`;
  }
  const toggleStar = slug => {
    if (starred.has(slug)) starred.delete(slug); else starred.add(slug);
    try { localStorage.setItem(STAR, JSON.stringify([...starred])); } catch { /* quota or private mode */ }
  };

  // ------------------------------------------------------------------- load
  async function load() {
    if (outline.length) return;
    const r = await fetch('/api/prolearn');
    if (!r.ok) throw new Error(r.status === 429 ? 'too many requests — wait a few seconds' : `server said ${r.status}`);
    const d = await r.json();
    outline = d.chapters || [];
    written = new Set(d.written || []);
    if (!open.size && outline[0]) open.add(outline[0].chapter);
  }

  const articles = () => outline.flatMap(c => c.groups.flatMap(g =>
    g.articles.map(a => ({ ...a, chapter: c.chapter, group: g.group }))));

  // ---------------------------------------------------------------- sidebar
  function matches(a, group) {
    if (starOnly && !starred.has(a.slug)) return false;
    if (probOnly && !a.prob) return false;
    if (!query) return true;
    const q = query.toLowerCase();
    return a.title.toLowerCase().includes(q) || String(group || '').toLowerCase().includes(q);
  }

  function renderTree() {
    const total = outline.reduce((n, c) => n + c.count, 0);
    const chapters = outline.map(c => {
      const groups = c.groups
        .map(g => ({ ...g, articles: g.articles.filter(a => matches(a, g.group)) }))
        .filter(g => g.articles.length);
      if (!groups.length) return '';
      const isOpen = open.has(c.chapter) || Boolean(query) || starOnly || probOnly;
      const done = c.groups.reduce((n, g) => n + g.articles.filter(a => read.has(a.slug)).length, 0);
      return `<div class="pl-chapter${isOpen ? ' open' : ''}">
        <button class="pl-chap-head" data-chapter="${esc(c.chapter)}">
          <span class="pl-caret">${isOpen ? '▾' : '▸'}</span>
          <span class="pl-chap-name">${esc(c.chapter)}</span>
          <span class="pl-chap-count">${done}/${c.count}</span>
        </button>
        ${isOpen ? groups.map(g => `
          <div class="pl-group">
            <div class="pl-group-name">${esc(g.group)}</div>
            <ul class="pl-arts">${g.articles.map(a => `
              <li><button class="pl-art${a.slug === current ? ' sel' : ''}${read.has(a.slug) ? ' read' : ''}${a.prob ? ' prob' : ''}"
                data-slug="${esc(a.slug)}">
                <span class="pl-art-dot">${written.has(a.slug) ? '●' : '○'}</span>
                <span>${esc(a.title)}</span>${probPill(a.prob)}
                ${starred.has(a.slug) ? '<span class="pl-art-star" title="Starred to revisit">★</span>' : ''}
              </button></li>`).join('')}</ul>
          </div>`).join('') : ''}
      </div>`;
    }).join('');

    $('plList').innerHTML = `
      <div class="pl-side-head">
        <div class="pl-side-title">Handbook</div>
        <div class="pl-side-sub">${read.size} of ${total} topics read</div>
        <input id="plSearch" class="pl-search" type="search" placeholder="Search topics…" value="${esc(query)}">
        <button id="plStarOnly" class="pl-star-filter${starOnly ? ' sel' : ''}" type="button"
          aria-pressed="${starOnly}">★ Starred to revisit <span>${starred.size}</span></button>
        <button id="plProbOnly" class="pl-star-filter${probOnly ? ' sel' : ''}" type="button"
          aria-pressed="${probOnly}" title="Only the practice problems from algo.monster's syllabus">🎯 Practice problems only <span>${articles().filter(a => a.prob).length}</span></button>
      </div>
      <div class="pl-tree">${chapters || `<p class="hs-empty">${starOnly
        ? 'Nothing starred yet. Use ☆ Star on a topic you want to come back to.'
        : 'Nothing matches that.'}</p>`}</div>`;
    wireTree();
  }

  function wireTree() {
    $('plList').querySelectorAll('.pl-chap-head').forEach(b => {
      b.onclick = () => {
        const c = b.dataset.chapter;
        if (open.has(c)) open.delete(c); else open.add(c);
        renderTree();
      };
    });
    $('plList').querySelectorAll('.pl-art').forEach(b => {
      b.onclick = () => openArticle(b.dataset.slug);
    });
    $('plStarOnly').onclick = () => { starOnly = !starOnly; renderTree(); };
    $('plProbOnly').onclick = () => { probOnly = !probOnly; renderTree(); };
    const s = $('plSearch');
    let t = null;
    s.oninput = () => {
      clearTimeout(t);
      t = setTimeout(() => {
        query = s.value.trim();
        const pos = s.selectionStart;
        renderTree();
        const n = $('plSearch');
        n.focus();
        n.setSelectionRange(pos, pos);
      }, 150);
    };
  }

  // ----------------------------------------------------------------- article
  function welcome() {
    const total = outline.reduce((n, c) => n + c.count, 0);
    $('plDetail').innerHTML = `
      <div class="pl-welcome">
        <h1>The handbook</h1>
        <p class="bv-lede">Every topic a Google-style loop expects you to know, in reading order:
          ${total} pages across ${outline.length} chapters. Each page gives you the idea, the cue that
          should make you reach for it, the canonical code, a traced example, complexity, the variants,
          the traps, and what to say out loud. Pick a topic from the list.</p>
        <div class="pl-chips">${outline.map(c =>
          `<button class="pl-chip" data-chapter="${esc(c.chapter)}">${esc(c.chapter)} <span>${c.count}</span></button>`).join('')}</div>
      </div>`;
    $('plDetail').querySelectorAll('.pl-chip').forEach(b => {
      b.onclick = () => {
        open.clear();
        open.add(b.dataset.chapter);
        renderTree();
        const first = outline.find(c => c.chapter === b.dataset.chapter)?.groups[0]?.articles[0];
        if (first) openArticle(first.slug);
      };
    });
  }

  // A page can take a minute to write. Clicking another topic (or view) while
  // it writes used to be silently ignored; now the newest click wins and the
  // slower reply is still cached for when the user comes back.
  async function openArticle(slug) {
    const my = ++seq;
    current = slug;
    renderTree();
    const store = storeFor(view);
    if (store[slug]) return render(store[slug]);

    const meta = articles().find(a => a.slug === slug);
    const mine = view;
    const practice = view === 'practice';
    $('plDetail').innerHTML = `
      <div class="pl-loading">
        <h1>${esc(meta?.title || 'Loading')}</h1>
        ${viewToggle()}
        <p class="sol-loading">${practice ? 'Fetching the problems…'
          : view === 'simple'
            ? 'Cutting this down and drawing the animation… a minute or so, once ever.'
            : 'Writing this page… it takes twenty seconds or so, once ever.'}</p>
      </div>`;
    wireView($('plDetail'));
    const fkey = `${mine}:${slug}`;
    try {
      // Coming back to a page that is still being written joins that request
      // instead of paying for a second generation.
      const d = await (inflight[fkey] ||= (async () => {
        const model = practice ? null : window.Settings?.modelFor?.('prolearn');
        const base = practice ? '/api/prolearn-practice/' : mine === 'simple' ? '/api/prolearn-simple/' : '/api/prolearn/';
        const r = await fetch(`${base}${encodeURIComponent(slug)}${model ? `?model=${encodeURIComponent(model)}` : ''}`);
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(r.status === 429 ? 'too many requests — wait a minute and try again' : body.error || `server said ${r.status}`);
        return body;
      })().finally(() => { delete inflight[fkey]; }));
      store[slug] = d;
      if (mine !== 'practice') written.add(slug);      // simple writes the full page first
      if (my !== seq) return;                          // the user moved on while it wrote
      // Practising cold is not reading the topic, so it does not mark it read;
      // nor does a page that finished writing after the user moved on.
      if (!practice) { read.add(slug); persist(); }
      render(d);
      renderTree();
    } catch (e) {
      if (my !== seq) return;
      // Keep the Simple / Full / Practice switch and offer a retry, so a
      // failed page is never a dead end.
      $('plDetail').innerHTML = `<div class="pl-loading"><h1>${esc(meta?.title || 'Topic')}</h1>
        ${viewToggle()}
        <p class="sol-loading" style="color:var(--red)">Could not ${practice ? 'load the problems' : 'write this page'}: ${esc(e.message)}</p>
        <p><button class="primary pl-retry" type="button">Try again</button>${view !== 'full' && !practice ? ' <span class="qf-muted">or switch to Full above.</span>' : ''}</p></div>`;
      wireView($('plDetail'));
      $('plDetail').querySelector('.pl-retry').onclick = () => openArticle(slug);
    }
  }

  /** The toggle sits on every view, so all of them render through here. */
  function render(d) {
    player?.destroy?.();
    player = null;
    (view === 'simple' ? paintSimple : view === 'practice' ? paintPractice : paint)(d);
  }

  function setView(next) {
    if (view === next) return;
    view = next;
    try { localStorage.setItem(VIEW, view); } catch { /* private mode */ }
    if (current) openArticle(current);
  }

  const viewToggle = () => `${current ? probBar(articles().find(a => a.slug === current)) + starBtn(current) : ''}
    <div class="pl-view" role="tablist" aria-label="Level of detail">
      <button class="pl-view-btn${view === 'simple' ? ' sel' : ''}" data-view="simple"
        role="tab" aria-selected="${view === 'simple'}" title="The gist, the recipe, the animation and a few drills">Simple</button>
      <button class="pl-view-btn${view === 'full' ? ' sel' : ''}" data-view="full"
        role="tab" aria-selected="${view === 'full'}" title="The complete reference page">Full</button>
      <button class="pl-view-btn${view === 'practice' ? ' sel' : ''}" data-view="practice"
        role="tab" aria-selected="${view === 'practice'}" title="Just the problem statements, nothing that gives the answer away">Practice</button>
    </div>${current ? window.Focus?.btn?.('prolearn', current) || '' : ''}`;

  const starBtn = slug => {
    const on = starred.has(slug);
    return `<button class="pl-star${on ? ' on' : ''}" type="button" aria-pressed="${on}"
      title="${on ? 'Starred to revisit, click to clear' : 'Star to revisit later'}">${on ? '★ Starred' : '☆ Star'}</button>`;
  };

  /** Chapter-wide videos, keyed by the chapter name in the outline. */
  const VIDEOS = {
    'Dynamic Prog.': [{ id: '66hDgWottdA', title: 'Learn Dynamic Programming with Animations – Full Course for Beginners', by: 'freeCodeCamp.org' }],
  };

  // A thumbnail until clicked, so the YouTube player never slows the page down.
  const videoBlock = chapter => (VIDEOS[chapter] || []).map(v => `<section class="pl-sec pl-video">
      <h2>Watch the course</h2>
      <button class="pl-video-play" type="button" data-yt="${esc(v.id)}" title="Play: ${esc(v.title)}">
        <img src="https://i.ytimg.com/vi/${esc(v.id)}/hqdefault.jpg" alt="" loading="lazy">
        <span class="pl-video-icon" aria-hidden="true">▶</span>
      </button>
      <p class="pl-cap">${esc(v.title)} · ${esc(v.by)} ·
        <a href="https://www.youtube.com/watch?v=${esc(v.id)}" target="_blank" rel="noopener">Open on YouTube ↗</a></p>
    </section>`).join('');

  function wireView(box) {
    box.querySelectorAll('.pl-view-btn').forEach(b => {
      b.onclick = () => setView(b.dataset.view);
    });
    const star = box.querySelector('.pl-star');
    if (star) star.onclick = () => {
      toggleStar(current);
      const on = starred.has(current);
      star.classList.toggle('on', on);
      star.setAttribute('aria-pressed', String(on));
      star.textContent = on ? '★ Starred' : '☆ Star';
      renderTree();
    };
    box.querySelectorAll('.pl-video-play').forEach(b => {
      b.onclick = () => {
        const f = document.createElement('iframe');
        f.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(b.dataset.yt)}?autoplay=1&rel=0`;
        f.title = b.title;
        f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
        f.allowFullscreen = true;
        f.referrerPolicy = 'strict-origin-when-cross-origin';
        f.className = 'pl-video-frame';
        b.replaceWith(f);
      };
    });
  }

  /**
   * Brute force and the variants, each with its own code and trace. They cost a
   * minute to write the first time, so they are fetched only when asked for.
   */
  function wireApproaches(box, a) {
    const bar = box.querySelector('#plAppr');
    const why = box.querySelector('#plApprWhy');
    const more = bar?.querySelector('.pl-appr-more');
    if (!bar) return;

    const optimal = { id: 'optimal', name: 'Optimal', anim: a.anim, code: a.code?.source, complexity: a.complexity };
    let items = [optimal];
    let selCode = optimal.code || '';           // code of the approach tab on screen, for "To editor"
    const codeOf = () => selCode;

    const show = id => {
      const it = items.find(x => x.id === id);
      if (!it) return;
      bar.querySelectorAll('.pl-appr-btn').forEach(b => {
        const on = b.dataset.appr === id;
        b.classList.toggle('sel', on);
        b.setAttribute('aria-selected', String(on));
      });
      const cx = it.complexity?.time ? `${it.complexity.time} time, ${it.complexity.space} space. ` : '';
      why.textContent = `${cx}${it.why || it.complexity?.why || ''}`.trim();
      why.hidden = !why.textContent;
      player?.destroy?.();
      player = null;
      try { player = window.Animate?.mount?.(box.querySelector('#plPlayer'), it.anim) || null; }
      catch { box.querySelector('#plPlayer').innerHTML = '<p class="sol-loading">Could not draw the animation.</p>'; }
      // The code block below the player belongs to the approach on screen.
      selCode = it.code || '';
      const sol = box.querySelector('.sol-code');
      const pre = sol?.querySelector('code');
      if (pre) {
        if (it.code) pre.textContent = it.code;
        sol.style.display = it.code ? '' : 'none';
        let none = box.querySelector('.pl-nocode');
        if (!none) {
          none = document.createElement('p');
          none.className = 'pl-cap pl-nocode';
          none.textContent = 'No code for this approach.';
          sol.after(none);
        }
        none.hidden = Boolean(it.code);
      }
    };

    const paintTabs = () => {
      more?.remove();
      selCode = optimal.code || '';
      bar.innerHTML = items.map(it =>
        `<button class="pl-appr-btn${it.id === 'optimal' ? ' sel' : ''}" data-appr="${esc(it.id)}"
           role="tab" aria-selected="${it.id === 'optimal'}">${esc(it.name)}</button>`).join('');
      bar.querySelectorAll('.pl-appr-btn').forEach(b => { b.onclick = () => show(b.dataset.appr); });
    };

    if (approachCache[a.slug]) {
      items = [optimal, ...approachCache[a.slug]];
      paintTabs();
      return codeOf;
    }

    more?.addEventListener('click', async () => {
      more.disabled = true;
      more.textContent = 'Writing them…';
      try {
        const model = window.Settings?.modelFor?.('prolearn');
        const r = await fetch(`/api/prolearn-approaches/${encodeURIComponent(a.slug)}${model ? `?model=${encodeURIComponent(model)}` : ''}`);
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(r.status === 429 ? 'too many requests, wait a minute' : d.error || `server said ${r.status}`);
        approachCache[a.slug] = d.items || [];
        if (current !== a.slug) return;                 // moved on while it wrote
        items = [optimal, ...approachCache[a.slug]];
        paintTabs();
      } catch (e) {
        more.disabled = false;
        more.textContent = `Could not write them: ${e.message}`;
      }
    });
    return codeOf;
  }

  /**
   * "To editor" never overwrites the draft of whatever problem is open: it
   * opens the page's first practice problem with this code; only a page with
   * no local problem falls back to the open editor, after asking.
   */
  function toEditor(a, code) {
    if (!code) return;
    const p = (a.problems || []).find(x => x.available && x.slug);
    if (p && window.openQuestion) return window.openQuestion(p.slug, p.title, { code });
    if (!confirm('Replace the code in the editor for the open problem?')) return;
    window.loadIntoEditor?.(code);
  }

  const para = t => String(t || '').split(/\n{2,}/).map(p => `<p>${esc(p)}</p>`).join('');

  /**
   * Every data structure and idiom the page's code relies on, with how to
   * declare it, its methods and their cost, so none of it has to be looked up
   * mid-read. Derived server-side from the code, so it is only as long as the
   * code needs.
   */
  const toolkitBlock = items => (items?.length ? `<section class="pl-sec pl-tk">
      <h2>Data structures used in this code</h2>
      <p class="pl-cap">Declare it, the methods you will call, and what each costs. Click a name to open its full card in the Toolkit.</p>
      <div class="pl-tk-grid">${items.map(it => `
        <details class="pl-tk-item">
          <summary>
            <span class="pl-tk-name">${esc(it.name)}</span>
            <span class="pl-tk-cost">${esc(it.cost || '')}</span>
          </summary>
          <div class="pl-tk-body">
            <div class="pl-tk-cols">
              <div style="min-width:0"><div class="pl-tk-label">Declare</div><pre class="pl-tk-code">${esc(it.define)}</pre></div>
              <div style="min-width:0"><div class="pl-tk-label">Methods</div><pre class="pl-tk-code">${esc(it.use)}</pre></div>
            </div>
            ${it.tricks?.length ? `<ul class="pl-tk-tricks">${it.tricks.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
            <button class="pl-tk-open ghost" type="button" data-tk="${esc(it.id)}">Open in Toolkit →</button>
          </div>
        </details>`).join('')}
      </div>
    </section>` : '');

  function wireToolkit(box) {
    box.querySelectorAll('.pl-tk-open').forEach(b => {
      b.onclick = () => window.openToolkit?.(b.dataset.tk);
    });
  }

  /** Practise chips and the "not in the local set" fallback, shared by both views. */
  const probChips = probs => probs.map(p => p.available
    ? `<button class="pl-open" data-slug="${esc(p.slug)}" data-title="${esc(p.title)}">
         ${esc(p.title)}<span class="ln-diff ${esc(String(p.difficulty || '').toLowerCase())}">${esc(p.difficulty || '')}</span>
       </button>`
    : `<a class="pl-open ext" href="https://leetcode.com/problems/${esc(String(p.title || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''))}/"
         target="_blank" rel="noopener" title="Not in the local question set — opens LeetCode">${esc(p.title)} ↗</a>`).join('');

  function paintSimple(a) {
    const probs = a.problems || [];
    $('plDetail').innerHTML = `
      <article class="pl-article pl-simple">
        <div class="pl-head">
          <div class="pl-crumbs">${esc(a.chapter)} <span>›</span> ${esc(a.group)}</div>
          ${viewToggle()}
        </div>
        <h1>${esc(a.title)}</h1>
        <p class="pl-summary">${esc(a.gist)}</p>
        ${a.when ? `<div class="pl-cue"><strong>Use it when</strong> ${esc(a.when)}</div>` : ''}
        ${videoBlock(a.chapter)}

        ${a.steps?.length ? `<section class="pl-sec">
          <h2>The recipe</h2>
          <ol class="pl-recipe">${a.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol>
        </section>` : ''}

        ${a.anim ? `<section class="pl-sec">
          <h2>Watch it run</h2>
          <div class="pl-appr" id="plAppr" role="tablist" aria-label="Approach">
            <button class="pl-appr-btn sel" data-appr="optimal" role="tab" aria-selected="true">Optimal</button>
            <button class="pl-appr-more ghost" type="button">+ other approaches</button>
          </div>
          <p class="pl-appr-why" id="plApprWhy" hidden></p>
          <div class="pl-player" id="plPlayer"></div>
        </section>` : ''}

        ${a.keys?.length ? `<section class="pl-sec">
          <h2>The moving parts</h2>
          <dl class="pl-variants">${a.keys.map(k =>
            `<dt>${esc(k.term)}</dt><dd>${esc(k.what)}</dd>`).join('')}</dl>
        </section>` : ''}

        ${a.code?.source ? `<section class="pl-sec">
          <h2>The code</h2>
          <div class="sol-code">
            <pre><code>${esc(a.code.source)}</code></pre>
            <div class="sol-actions"><button class="pl-to-editor ghost">To editor</button></div>
          </div>
        </section>` : ''}

        ${toolkitBlock(a.toolkit)}

        ${a.complexity?.time ? `<section class="pl-sec">
          <h2>Complexity</h2>
          <div class="pl-cx">
            <div><span>Time</span><strong>${esc(a.complexity.time)}</strong></div>
            <div><span>Space</span><strong>${esc(a.complexity.space)}</strong></div>
          </div>
          ${a.complexity.why ? `<p>${esc(a.complexity.why)}</p>` : ''}
        </section>` : ''}

        ${a.drills?.length ? `<section class="pl-sec">
          <h2>Can you answer these</h2>
          <div class="pl-drills">${a.drills.map((d, i) => `
            <details class="pl-drill">
              <summary><span class="pl-drill-n">${i + 1}</span>${esc(d.ask)}</summary>
              ${d.hint ? `<p class="pl-hint"><strong>Hint</strong> ${esc(d.hint)}</p>` : ''}
              <div class="pl-answer">${para(d.answer)}</div>
            </details>`).join('')}
          </div>
        </section>` : ''}

        ${a.traps?.length ? `<section class="pl-sec">
          <h2>Traps</h2>
          <ul class="pl-traps">${a.traps.map(t => `<li>${esc(t)}</li>`).join('')}</ul>
        </section>` : ''}

        ${probs.length ? `<section class="pl-sec">
          <h2>Practise</h2>
          <div class="pl-probs">${probChips(probs)}</div>
        </section>` : ''}

        ${a.related?.length ? `<section class="pl-sec">
          <h2>Next in ${esc(a.group)}</h2>
          <div class="pl-probs">${a.related.map(t =>
            `<button class="pl-step" data-slug="${esc(t.slug)}">${esc(t.title)}</button>`).join('')}</div>
        </section>` : ''}
      </article>`;

    const box = $('plDetail');
    wireView(box);
    wireToolkit(box);
    let codeOf = () => a.code?.source;
    if (a.anim) {
      try { player = window.Animate?.mount?.($('plPlayer'), a.anim) || null; }
      catch { $('plPlayer').innerHTML = '<p class="sol-loading">Could not draw the animation.</p>'; }
      codeOf = wireApproaches(box, a) || codeOf;
    }
    box.querySelector('.pl-to-editor')?.addEventListener('click', () => toEditor(a, codeOf()));
    box.querySelectorAll('.pl-open[data-slug]').forEach(b => {
      b.onclick = () => window.openQuestion?.(b.dataset.slug, b.dataset.title);
    });
    box.querySelectorAll('.pl-step').forEach(b => {
      b.onclick = () => { openArticle(b.dataset.slug); box.scrollTop = 0; };
    });
    box.scrollTop = 0;
  }

  /**
   * Practice: the raw statements only. No recipe, code, trace or animation, so
   * the problem can be attempted cold; Simple/Full are one click away afterwards.
   */
  function paintPractice(a) {
    const probs = a.problems || [];
    const local = probs.filter(p => p.available);
    const ext = probs.filter(p => !p.available);
    const diff = d => `<span class="ln-diff ${esc(String(d || '').toLowerCase())}">${esc(d || '')}</span>`;
    $('plDetail').innerHTML = `
      <article class="pl-article pl-practice">
        <div class="pl-head">
          <div class="pl-crumbs">${esc(a.chapter)} <span>›</span> ${esc(a.group)}</div>
          ${viewToggle()}
        </div>
        <h1>${esc(a.title)}</h1>
        <p class="pl-summary">Problems this topic teaches, statement only. Attempt each one before
          switching to Simple or Full for the approach.</p>

        ${!a.written ? `<p class="pl-cap pl-practice-empty">This topic has not been written yet, so its problem set is
          not known. Open it in <button class="pl-view-link" data-view="simple">Simple</button> or
          <button class="pl-view-link" data-view="full">Full</button> once, then come back here.</p>` : ''}

        ${a.written && !probs.length ? '<p class="pl-cap pl-practice-empty">This topic lists no practice problems.</p>' : ''}

        ${local.length ? `<nav class="pl-practice-toc" aria-label="Problems">${local.map((p, i) =>
          `<a href="#pl-prob-${i}">${i + 1}. ${esc(p.title)}${diff(p.difficulty)}</a>`).join('')}</nav>` : ''}

        ${local.map((p, i) => `<section class="pl-sec pl-prob" id="pl-prob-${i}">
          <h2>${esc(p.id ? `${p.id}. ` : '')}${esc(p.title)}</h2>
          <div class="pl-prob-meta">${diff(p.difficulty)}${p.topicTags?.length
            ? ` · <span class="pl-prob-tags">${esc(p.topicTags.join(', '))}</span>` : ''}</div>
          <div class="prose pl-prob-body">${p.content || '<p>Premium content unavailable.</p>'}</div>
          <div class="sol-actions">
            <button class="pl-open primary" data-slug="${esc(p.slug)}" data-title="${esc(p.title)}">Try it in the editor →</button>
          </div>
        </section>`).join('')}

        ${ext.length ? `<section class="pl-sec">
          <h2>Not in the local set</h2>
          <div class="pl-probs">${probChips(ext)}</div>
        </section>` : ''}
      </article>`;

    const box = $('plDetail');
    wireView(box);
    box.querySelectorAll('.pl-view-link').forEach(b => { b.onclick = () => setView(b.dataset.view); });
    box.querySelectorAll('.pl-open[data-slug]').forEach(b => {
      b.onclick = () => window.openQuestion?.(b.dataset.slug, b.dataset.title);
    });
    box.querySelectorAll('.pl-practice-toc a').forEach(l => {
      l.onclick = e => {
        e.preventDefault();
        box.querySelector(l.getAttribute('href'))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      };
    });
    box.scrollTop = 0;
  }

  function paint(a) {
    const probs = a.problems || [];
    $('plDetail').innerHTML = `
      <article class="pl-article">
        <div class="pl-head">
          <div class="pl-crumbs">${esc(a.chapter)} <span>›</span> ${esc(a.group)}</div>
          ${viewToggle()}
        </div>
        <h1>${esc(a.title)}</h1>
        <p class="pl-summary">${esc(a.summary)}</p>
        ${videoBlock(a.chapter)}
        ${a.cue ? `<div class="pl-cue"><strong>Reach for this when</strong> ${esc(a.cue)}</div>` : ''}

        ${a.sections.map(s => `<section class="pl-sec"><h2>${esc(s.heading)}</h2>${para(s.body)}</section>`).join('')}

        ${a.code?.source ? `<section class="pl-sec">
          <h2>The code</h2>
          ${a.code.caption ? `<p class="pl-cap">${esc(a.code.caption)}</p>` : ''}
          <div class="sol-code">
            <pre><code>${esc(a.code.source)}</code></pre>
            <div class="sol-actions">
              <button class="pl-to-editor ghost">To editor</button>
            </div>
          </div>
        </section>` : ''}

        ${toolkitBlock(a.toolkit)}

        ${a.walkthrough?.steps?.length ? `<section class="pl-sec">
          <h2>Traced on an example</h2>
          ${a.walkthrough.input ? `<p class="pl-cap"><code>${esc(a.walkthrough.input)}</code></p>` : ''}
          <ol class="pl-steps">${a.walkthrough.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol>
        </section>` : ''}

        ${a.complexity?.time ? `<section class="pl-sec">
          <h2>Complexity</h2>
          <div class="pl-cx">
            <div><span>Time</span><strong>${esc(a.complexity.time)}</strong></div>
            <div><span>Space</span><strong>${esc(a.complexity.space)}</strong></div>
          </div>
          ${a.complexity.why ? `<p>${esc(a.complexity.why)}</p>` : ''}
        </section>` : ''}

        ${a.variants?.length ? `<section class="pl-sec">
          <h2>Variants</h2>
          <dl class="pl-variants">${a.variants.map(v =>
            `<dt>${esc(v.name)}</dt><dd>${esc(v.change)}</dd>`).join('')}</dl>
        </section>` : ''}

        ${a.traps?.length ? `<section class="pl-sec">
          <h2>Traps</h2>
          <ul class="pl-traps">${a.traps.map(t => `<li>${esc(t)}</li>`).join('')}</ul>
        </section>` : ''}

        ${a.interview?.length ? `<section class="pl-sec">
          <h2>What to say out loud</h2>
          <ol class="pl-say">${a.interview.map(t => `<li>${esc(t)}</li>`).join('')}</ol>
        </section>` : ''}

        ${probs.length ? `<section class="pl-sec">
          <h2>Practise</h2>
          <div class="pl-probs">${probChips(probs)}</div>
        </section>` : ''}

        <nav class="pl-nav">
          ${a.prev ? `<button class="pl-step ghost" data-slug="${esc(a.prev.slug)}">← ${esc(a.prev.title)}</button>` : '<span></span>'}
          ${a.next ? `<button class="pl-step ghost" data-slug="${esc(a.next.slug)}">${esc(a.next.title)} →</button>` : '<span></span>'}
        </nav>
      </article>`;

    const box = $('plDetail');
    wireView(box);
    wireToolkit(box);
    box.querySelector('.pl-to-editor')?.addEventListener('click', () => toEditor(a, a.code?.source));
    box.querySelectorAll('.pl-open[data-slug]').forEach(b => {
      b.onclick = () => window.openQuestion?.(b.dataset.slug, b.dataset.title);
    });
    box.querySelectorAll('.pl-step').forEach(b => {
      b.onclick = () => { openArticle(b.dataset.slug); box.scrollTop = 0; };
    });
    box.scrollTop = 0;
  }

  /** Deep link from elsewhere in the app, e.g. the coding tab's topic links. */
  window.openProLearn = slug => {
    window.setInterviewMode?.('prolearn');
    load().then(() => {
      const meta = articles().find(a => a.slug === slug);
      if (!meta) return;
      open.clear();
      open.add(meta.chapter);
      openArticle(slug);
    }).catch(() => {});
  };

  window.renderProLearn = () => {
    load().then(() => {
      renderTree();
      const store = storeFor(view);
      if (current && store[current]) render(store[current]);
      else if (current) openArticle(current);
      else welcome();
    }).catch(e => {
      $('plList').innerHTML = `<p class="hs-empty">Could not load the handbook (${esc(e.message)}). <button class="ghost pl-reload" type="button">Try again</button></p>`;
      $('plList').querySelector('.pl-reload').onclick = () => window.renderProLearn();
    });
  };
  // "Solve here" on a practice problem's bar, whichever view drew it.
  document.addEventListener('click', e => {
    const b = e.target.closest?.('.pl-solve[data-slug]');
    if (b) window.openQuestion?.(b.dataset.slug, b.dataset.title);
  });
})();
