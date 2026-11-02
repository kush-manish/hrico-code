/* Resume -> interview questions. Upload, analyse, browse, practise. */
(function () {
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let result = null;
  let filter = 'all';
  let busy = false;

  // The generated questions survive a reload: they cost a 20–40 second model
  // call and the resume text itself is never kept, so they cannot be redone
  // without uploading again.
  const LAST = 'resume.lastQuestions';
  function saveLast(data) {
    try { localStorage.setItem(LAST, JSON.stringify({ ...data, savedAt: data.savedAt || Date.now() })); } catch { /* quota or private mode */ }
  }
  function loadLast() {
    try {
      const d = JSON.parse(localStorage.getItem(LAST) || 'null');
      return d && Array.isArray(d.sections) ? d : null;
    } catch { return null; }
  }

  function status(msg, isError) {
    const el = $('rsStatus');
    el.className = 'rs-status' + (isError ? ' err' : '');
    el.innerHTML = msg;
    el.classList.remove('hidden');
  }
  const clearStatus = () => $('rsStatus').classList.add('hidden');

  async function analyse(file) {
    if (!file || busy) return;
    // Clear the picker so choosing the same file again (after an error) still fires 'change'.
    if ($('rsFile')) $('rsFile').value = '';
    const MAX = 2 * 1024 * 1024;
    if (file.size > MAX) {
      status(`That file is ${(file.size / 1048576).toFixed(1)} MB — the limit is 2 MB.`, true);
      return;
    }
    status(`Reading <strong>${esc(file.name)}</strong> and drafting questions… this usually takes 20–40 seconds.`);
    const body = new FormData();
    body.append('resume', file);
    const model = window.Settings?.modelFor('resume');
    if (model) body.append('model', model);
    busy = true;
    $('rsDrop')?.classList.add('busy');
    try {
      const res = await fetch('/api/resume/questions', { method: 'POST', body });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
      result = data;
      saveLast(data);
      if (data.profile) window.Profile?.set(data.profile, true);
      clearStatus();
      render();
      $('rsUpload').classList.add('hidden');
      $('rsResults').classList.remove('hidden');
    } catch (e) {
      status(esc(e instanceof TypeError ? 'Could not reach the server — check your connection and try again.' : e.message), true);
    } finally {
      busy = false;
      $('rsDrop')?.classList.remove('busy');
    }
  }

  /** The candidate definition the interviews will use. */
  function profileCard(p, { compact = false } = {}) {
    if (!p) return '';
    const on = window.Profile?.enabled();
    const chips = [p.targetRole, p.yearsExperience != null ? `${p.yearsExperience} yrs` : '', p.location].filter(Boolean);
    const has = v => Array.isArray(v) && v.length > 0;
    // Only the sections that have something in them: an empty heading reads as broken.
    const exp = has(p.companies) ? `<h4>Experience</h4><ul>${p.companies.map(c => `<li><strong>${esc(c.role || '')}</strong>${c.name ? ` at ${esc(c.name)}` : ''}${c.period ? ` <span class="gl-muted">(${esc(c.period)})</span>` : ''}
          ${has(c.highlights) ? `<ul>${c.highlights.map(h => `<li>${esc(h)}</li>`).join('')}</ul>` : ''}</li>`).join('')}</ul>` : '';
    const proj = has(p.projects) ? `<h4>Projects</h4><ul>${p.projects.map(x => `<li><strong>${esc(x.name || '')}</strong>${x.what ? ` — ${esc(x.what)}` : ''}${x.impact ? ` <span class="gl-muted">${esc(x.impact)}</span>` : ''}</li>`).join('')}</ul>` : '';
    const stack = has(p.stack) ? `<h4>Stack</h4><div class="rs-sum-meta">${p.stack.map(t => `<span class="rs-chip">${esc(t)}</span>`).join('')}</div>` : '';
    const str = has(p.strengths) ? `<h4>Strengths</h4><ul>${p.strengths.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '';
    const probe = has(p.gaps) ? `<h4>An interviewer will probe</h4><ul>${p.gaps.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '';
    const cols = [exp, proj + stack, str + probe].filter(Boolean);
    return `<div class="rs-profile${compact ? ' compact' : ''}">
      <div class="rs-profile-head">
        <div>
          <div class="ln-fam">Candidate profile · used by the interviewers and the watched candidate</div>
          <h3>${esc(p.name || 'Candidate')}</h3>
          ${p.headline ? `<div class="rs-profile-headline">${esc(p.headline)}</div>` : ''}
          ${chips.length ? `<div class="rs-sum-meta">${chips.map(c => `<span class="rs-chip">${esc(c)}</span>`).join('')}</div>` : ''}
        </div>
        <div class="rs-profile-actions">
          <label class="gl-solved"><input type="checkbox" class="rs-profile-on" ${on ? 'checked' : ''}> Use in interviews</label>
          <button class="ghost rs-profile-clear">Clear</button>
        </div>
      </div>
      ${compact || !cols.length ? '' : `
      <div class="rs-profile-grid">${cols.map(c => `<div>${c}</div>`).join('')}</div>`}
    </div>`;
  }
  /** The card is rendered in two places (upload panel and results), so its
   *  controls are wired within their own root, never by a shared id. */
  function wireProfileCard(root, rerender) {
    if (!root) return;
    const on = root.querySelector('.rs-profile-on'), clear = root.querySelector('.rs-profile-clear');
    if (on) on.onchange = e => {
      window.Profile?.enable(e.target.checked);
      document.querySelectorAll('.rs-profile-on').forEach(x => { x.checked = e.target.checked; });
    };
    if (clear) clear.onclick = () => {
      window.Profile?.clear();
      // The saved questions carry a copy of the profile; drop it too or it comes back on reload.
      const last = loadLast();
      if (last?.profile) saveLast({ ...last, profile: null });
      if (result) result.profile = null;
      rerender();
      if (rerender !== renderOnFile) renderOnFile();
    };
  }
  function renderOnFile() {
    const host = $('rsProfileOnFile');
    if (!host) return;
    const p = window.Profile?.get();
    host.innerHTML = p ? profileCard(p, { compact: true }) : '';
    wireProfileCard(host, renderOnFile);
  }

  function render() {
    const s = result.summary || {};
    const saved = result.savedAt ? new Date(result.savedAt) : null;
    // The stored profile is the one the interviews use, so it is the one shown.
    $('rsSummary').innerHTML = profileCard(window.Profile?.get()) + `
      <div class="rs-sum">
        <h2>${esc(s.headline || 'Your resume')}</h2>
        <div class="rs-sum-meta">
          ${s.level ? `<span class="rs-chip">${esc(s.level)}</span>` : ''}
          ${s.focus ? `<span class="rs-chip">${esc(s.focus)}</span>` : ''}
          <span class="rs-chip">${result.totalQuestions} questions</span>
          <span class="rs-chip">${result.sections.length} sections</span>
          ${saved ? `<span class="rs-chip" title="Kept in this browser">Generated ${esc(saved.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }))}</span>` : ''}
        </div>
        ${(s.watchOuts && s.watchOuts.length) ? `<div><strong>An interviewer will push on:</strong>
          <ul class="rs-watch">${s.watchOuts.map(w => `<li>${esc(w)}</li>`).join('')}</ul></div>` : ''}
      </div>`;

    $('rsSections').innerHTML = result.sections.map(sec => `
      <div class="rs-sec" data-sec="${esc(sec.id)}">
        <div class="rs-sec-head">
          <div class="rs-sec-title">
            <span>${esc(sec.title)}</span>
            <span class="rs-kind ${sec.kind === 'risk' ? 'risk' : ''}">${esc(sec.kind)}</span>
          </div>
          ${sec.source ? `<div class="rs-src">${esc(sec.source)}</div>` : ''}
        </div>
        ${sec.questions.map((q, i) => `
          <div class="rs-q" data-type="${esc(q.type)}">
            <span class="rs-type ${esc(q.type)}">${esc(q.type)}</span>
            <div class="rs-q-body">
              <div class="rs-q-text">${esc(q.q)}</div>
              ${q.why ? `<div class="rs-q-why">Tests: ${esc(q.why)}</div>` : ''}
            </div>
            <button class="ghost rs-practise" data-sec="${esc(sec.id)}" data-i="${i}">Practise</button>
          </div>`).join('')}
      </div>`).join('');

    wireProfileCard($('rsSummary'), () => { if (result) render(); });

    $('rsSections').querySelectorAll('.rs-practise').forEach(btn => {
      btn.onclick = () => {
        const sec = result.sections.find(x => x.id === btn.dataset.sec);
        const q = sec && sec.questions[Number(btn.dataset.i)];
        if (!q) return;
        if (typeof window.behaviouralPractise === 'function') {
          window.behaviouralPractise(q.q, sec.title);
        }
      };
    });
    applyFilter();
  }

  function applyFilter() {
    document.querySelectorAll('#rsSections .rs-q').forEach(el => {
      el.classList.toggle('hide', filter !== 'all' && el.dataset.type !== filter);
    });
    // A section with nothing left to show should not leave an empty shell.
    document.querySelectorAll('#rsSections .rs-sec').forEach(sec => {
      const visible = sec.querySelectorAll('.rs-q:not(.hide)').length;
      sec.classList.toggle('empty', visible === 0);
    });
  }

  function asText() {
    if (!result) return '';
    const s = result.summary || {};
    const lines = [s.headline || 'Resume questions', ''];
    if (s.watchOuts?.length) {
      lines.push('An interviewer will push on:');
      s.watchOuts.forEach(w => lines.push(`  - ${w}`));
      lines.push('');
    }
    for (const sec of result.sections) {
      lines.push(`## ${sec.title}  [${sec.kind}]`);
      if (sec.source) lines.push(`   > ${sec.source}`);
      sec.questions.forEach(q => lines.push(`   - (${q.type}) ${q.q}${q.why ? `  — tests: ${q.why}` : ''}`));
      lines.push('');
    }
    return lines.join('\n');
  }

  function init() {
    const drop = $('rsDrop');
    if (!drop) return;

    $('rsFile').addEventListener('change', e => analyse(e.target.files[0]));
    renderOnFile();
    const last = loadLast();
    if (last) {
      try {
        result = last;
        render();
        $('rsUpload').classList.add('hidden');
        $('rsResults').classList.remove('hidden');
      } catch { result = null; }
    }

    ['dragenter', 'dragover'].forEach(ev =>
      drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach(ev =>
      drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
    drop.addEventListener('drop', e => analyse(e.dataTransfer?.files?.[0]));

    document.querySelectorAll('.rs-filter').forEach(btn => {
      btn.onclick = () => {
        filter = btn.dataset.type;
        document.querySelectorAll('.rs-filter').forEach(b => b.classList.toggle('active', b === btn));
        applyFilter();
      };
    });

    $('rsNew').onclick = () => {
      result = null;
      // Otherwise the old questions come straight back on the next reload.
      try { localStorage.removeItem(LAST); } catch { /* private mode */ }
      $('rsFile').value = '';
      $('rsResults').classList.add('hidden');
      $('rsUpload').classList.remove('hidden');
      renderOnFile();
      clearStatus();
    };

    $('rsCopy').onclick = async () => {
      try {
        await navigator.clipboard.writeText(asText());
        $('rsCopy').textContent = 'Copied';
        setTimeout(() => { $('rsCopy').textContent = 'Copy all'; }, 1400);
      } catch {
        $('rsCopy').textContent = 'Copy failed';
        setTimeout(() => { $('rsCopy').textContent = 'Copy all'; }, 1400);
      }
    };
  }

  window.renderResume = renderOnFile;      // the profile may have changed since load

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
