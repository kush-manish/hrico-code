/* Per-role model selection. Saved to the signed-in account (localStorage is
 * synced to the server by qf-shell.js); the server validates any choice
 * against the models the proxy actually offers before using it. */
window.Settings = (function () {
  const KEY = 'modelChoices';

  // Conversation turns are latency-bound; scoring and resume analysis are
  // judgement-bound and run once. Splitting them lets each be chosen properly.
  const ROLES = [
    { id: 'codingChat', group: 'Coding', label: 'Interviewer chat',
      hint: 'Replies while you code, in Talk through approach, and in the Learn and Google-list tutors. Wants low latency.', rec: 'gemini-3.5-flash-lite' },
    { id: 'codingSolution', group: 'Coding', label: 'Solution breakdown',
      hint: 'Writes the 3-approach walkthrough. Wants accuracy.', rec: 'gemini-3.6-flash-high' },
    { id: 'behaviouralChat', group: 'Behavioural', label: 'Interviewer chat',
      hint: 'Asks and probes, and plays both sides in Watch a mock. Wants low latency and a steady persona.', rec: 'gemini-3.5-flash-lite' },
    { id: 'behaviouralScore', group: 'Behavioural', label: 'Scoring',
      hint: 'Grades six signals as JSON — Googleyness answers, coding write-ups, Talk and Watch scorecards, story-bank model answers. Wants accuracy and format discipline.',
      rec: 'gemini-3.7-flash-low' },
    { id: 'starRewrite', group: 'Behavioural', label: '10/10 answer rewrite',
      hint: 'Today → Googleyness STAR: reframes YOUR answer (your facts, nothing invented) so every STAR part scores, then re-checks it with the Scoring model. Unset uses devin/claude-sonnet-5; a model that fails falls back to the server default.',
      rec: 'devin/claude-sonnet-5' },
    { id: 'grokCoach', group: 'Behavioural', label: 'Nov 3 plan: answers & watched mocks',
      hint: 'Frames answers from ALL your saved stories and plays both sides of the watched Googleyness round. Unset uses grok-4.6 on your xAI subscription; when an xAI model fails (or is not offered) it falls back to devin/grok-4-6, then the server default.',
      rec: 'grok-4.6' },
    { id: 'talk', group: 'Talk', label: 'Talk to a Googler',
      hint: 'A live call, spoken a sentence at a time as the reply lands. Gemini flash-lite answers in about four seconds and does not touch the gpt-5.5 quota. The Claude models answer as "Claude Code" through this proxy and are skipped automatically.', rec: 'gemini-3.5-flash-lite' },
    { id: 'explain', group: 'Learn', label: 'Google question explanations',
      hint: 'Writes the interview-grade explanation and the animated walkthrough as JSON. Wants accuracy.',
      rec: 'gemini-3.6-flash-high' },
    { id: 'prolearn', group: 'Learn', label: 'Pro-Learn pages and animations',
      hint: 'Writes the Pro-Learn topic pages, extra approaches, and the Real-questions walkthroughs and animations. Generated once and cached. Wants accuracy.',
      rec: 'gemini-3.6-flash-high' },
    { id: 'resume', group: 'Resume', label: 'Question generation',
      hint: 'Reads the resume and drafts questions. Wants accuracy.', rec: 'gemini-3.7-flash-low' },
    { id: 'hftCoach', group: 'HFT', label: 'AI career coach',
      hint: 'Firm advice, concept explanations, mock questions and offer comparison for trading firms. Wants accuracy; streamed.', rec: 'gemini-3.6-flash-high' },
  ];

  function read() {
    try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; }
    catch { return {}; }
  }
  function write(v) {
    try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* private mode */ }
  }

  /** Undefined means "let the server use its default". */
  const modelFor = role => read()[role] || undefined;
  const set = (role, model) => { const v = read(); if (model) v[role] = model; else delete v[role]; write(v); };
  const clear = () => { try { localStorage.removeItem(KEY); } catch { /* ignore */ } };

  return { ROLES, read, set, clear, modelFor };
})();

(function () {
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let groups = [];
  let serverDefault = null;
  let loaded = false;

  function note(msg, isError, retry) {
    const el = $('stNote');
    el.className = 'hs-note' + (isError ? ' err' : '');
    el.innerHTML = msg + (retry ? ' <button type="button" class="ghost qf-retry" id="stNoteRetry">Retry</button>' : '');
    el.classList.remove('hidden');
    if (retry) $('stNoteRetry').onclick = () => { el.classList.add('hidden'); retry(); };
  }

  const isAdmin = () => window.QF?.user?.role === 'admin'
    // With sign-in switched off there is no account and the server lets the
    // box owner change everything.
    || (!window.QF?.user && window.QF?.required === false);

  async function jsonFetch(path, opts) {
    const res = await fetch(path, opts);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  }

  function optionsHtml(selected) {
    const opts = groups.map(g =>
      `<optgroup label="${esc(g.family)}">` +
      g.models.map(m => `<option value="${esc(m)}"${m === selected ? ' selected' : ''}>${esc(m)}</option>`).join('') +
      `</optgroup>`).join('');
    // A saved choice this server does not offer is still shown (and kept), not silently replaced by "Server default".
    const known = groups.some(g => g.models.includes(selected));
    const extra = selected && !known ? `<option value="${esc(selected)}" selected>${esc(selected)} (not offered by this server)</option>` : '';
    return `<option value=""${selected ? '' : ' selected'}>Server default (${esc(serverDefault || '—')})</option>${extra}${opts}`;
  }

  function render() {
    const chosen = window.Settings.read();
    const byGroup = new Map();
    for (const r of window.Settings.ROLES) {
      if (!byGroup.has(r.group)) byGroup.set(r.group, []);
      byGroup.get(r.group).push(r);
    }
    $('stRoles').innerHTML = [...byGroup.entries()].map(([group, roles]) => `
      <div class="st-group">
        <h3>${esc(group)}</h3>
        ${roles.map(r => `
          <div class="st-role">
            <div>
              <div class="st-label">${esc(r.label)}</div>
              <div class="st-hint">${esc(r.hint)}</div>
            </div>
            <div class="st-pick">
              <select data-role="${r.id}" ${loaded ? '' : 'disabled'}>${optionsHtml(chosen[r.id])}</select>
              ${r.rec && groups.some(g => g.models.includes(r.rec)) ? `<button class="ghost st-rec" data-rec="${r.id}" data-model="${esc(r.rec)}"
                 title="Use ${esc(r.rec)}">Use recommended</button>` : ''}
              <span class="st-timing" data-timing="${r.id}"></span>
            </div>
          </div>`).join('')}
      </div>`).join('');

    $('stRoles').querySelectorAll('[data-rec]').forEach(btn => {
      btn.onclick = () => {
        window.Settings.set(btn.dataset.rec, btn.dataset.model);
        render();
        note(`Set <strong>${esc(btn.dataset.rec)}</strong> to ${esc(btn.dataset.model)}.`);
      };
    });
    $('stRoles').querySelectorAll('select[data-role]').forEach(sel => {
      sel.onchange = () => {
        window.Settings.set(sel.dataset.role, sel.value);
        if (/claude|sonnet|opus|haiku|fable/i.test(sel.value)) {
          note('Heads up: the Claude models on this proxy arrive with their own ' +
               'system preamble, which overrides the interviewer persona and the ' +
               'JSON-only scoring format. In testing they replied out of character ' +
               'or returned prose instead of a scorecard.', true);
          return;
        }
        note(`Saved. <strong>${esc(sel.dataset.role)}</strong> now uses ` +
             `${esc(sel.value || `the server default (${serverDefault})`)}.`);
      };
    });
  }

  let loading = null;
  function load() {
    if (!loading) loading = loadModels().finally(() => { loading = null; });
    return loading;
  }
  async function loadModels() {
    try {
      const r = await fetch('/api/models');
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(r.status === 429 ? 'too many requests just now (429)' : (d.error || `request failed (${r.status})`));
      if (!Array.isArray(d.groups)) throw new Error('the server returned no model list');
      groups = d.groups;
      serverDefault = d.default;
      loaded = true;
      render();
    } catch (e) {
      loaded = false;
      render();
      note(`Could not load the model list: ${esc(e.message)}.`, true, load);
    }
  }
  window.renderSettings = () => { render(); renderLeetcode(); renderVoice(); renderPlan(); if (!loaded) load(); };

  function setLcStatus(msg, cls = '', retry) {
    const el = $('lcStatus');
    if (!el) return;
    el.className = `st-hint ${cls}`.trim();
    el.innerHTML = msg + (retry ? ' <button type="button" class="ghost qf-retry" id="lcRetry">Retry</button>' : '');
    if (retry) $('lcRetry').onclick = retry;
  }

  async function validateLeetcode() {
    const btn = $('lcValidate');
    if (btn) btn.disabled = true;
    setLcStatus('Validating…');
    try {
      const d = await jsonFetch('/api/leetcode/credentials/validate', { method: 'POST' });
      if (d.ok) {
        setLcStatus(`Connected${d.username ? ` as <strong>${esc(d.username)}</strong>` : ''}. Run and Submit are enabled.`, 'ok');
        window.QF?.setJudge?.(true);
        await window.refreshCapabilities?.();
      } else {
        setLcStatus(esc(d.message || 'Credentials were rejected.'), 'bad');
        window.QF?.setJudge?.(false, 'LeetCode cookie rejected');
      }
      return d;
    } catch (e) {
      // Keep the status bar honest: a configured cookie is not a working judge.
      window.QF?.setJudge?.(false, `LeetCode unreachable: ${e.message}`);
      setLcStatus(`Could not check the judge login: ${esc(e.message)}.`, 'bad', validateLeetcode);
      return { ok: false };
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function parseCookieHeader(text) {
    const out = {};
    for (const part of String(text || '').split(';')) {
      const at = part.indexOf('=');
      if (at <= 0) continue;
      out[part.slice(0, at).trim()] = part.slice(at + 1).trim();
    }
    return out;
  }

  /** Members see the judge status but cannot change the shared login; the
   *  server refuses their writes with 403 anyway, so the form says so up front. */
  function applyLcAccess() {
    const form = $('lcCredForm');
    const admin = isAdmin();
    form.classList.toggle('st-readonly', !admin);
    form.setAttribute('aria-disabled', String(!admin));
    form.querySelectorAll('input, textarea, button, select').forEach(el => { el.disabled = !admin; });
    let lock = $('lcAdminNote');
    if (!admin && !lock) {
      lock = document.createElement('p');
      lock.id = 'lcAdminNote';
      lock.className = 'st-note st-lock';
      lock.setAttribute('role', 'note');
      lock.textContent = 'Only the admin can change the judge login. You can still check its status above.';
      form.parentNode.insertBefore(lock, form);
    } else if (admin && lock) {
      lock.remove();
    }
  }

  async function renderLeetcode() {
    if (!$('lcCredForm')) return;
    applyLcAccess();
    $('lcValidate').onclick = validateLeetcode;
    $('lcExtract').onclick = () => {
      const c = parseCookieHeader($('lcCookiePaste').value);
      if (c.LEETCODE_SESSION) $('lcSession').value = c.LEETCODE_SESSION;
      if (c.csrftoken) $('lcCsrf').value = c.csrftoken;
      if (c.cf_clearance) $('lcCf').value = c.cf_clearance;
      $('lcCookiePaste').value = '';
      setLcStatus(c.LEETCODE_SESSION && c.csrftoken
        ? 'Extracted required fields. Click Save and validate.'
        : 'Could not find both LEETCODE_SESSION and csrftoken in that cookie string.',
        c.LEETCODE_SESSION && c.csrftoken ? '' : 'bad');
    };
    $('lcCredForm').onsubmit = async e => {
      e.preventDefault();
      if (!isAdmin()) { setLcStatus('Only the admin can change the judge login.', 'bad'); return; }
      const btn = $('lcSave');
      btn.disabled = true;
      setLcStatus('Saving and validating…');
      try {
        const d = await jsonFetch('/api/leetcode/credentials', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session: $('lcSession').value,
            csrf: $('lcCsrf').value,
            cfClearance: $('lcCf').value,
            userAgent: $('lcUa').value,
          }),
        });
        if (d.ok) {
          ['lcSession', 'lcCsrf', 'lcCf', 'lcUa'].forEach(id => { $(id).value = ''; });
          setLcStatus(`Saved and connected${d.username ? ` as <strong>${esc(d.username)}</strong>` : ''}. Run and Submit are enabled.`, 'ok');
          await window.refreshCapabilities?.();
        } else {
          setLcStatus(esc(d.message || 'Credentials were saved but LeetCode rejected them.'), 'bad');
        }
      } catch (err) {
        setLcStatus(esc(err.message), 'bad');
      } finally {
        btn.disabled = false;
      }
    };
    validateLeetcode();
  }

  /** Plan: everyone sees the catalog and can raise a request; the admin also
   *  sees the pending queue here, right next to the other admin-only controls. */
  async function renderPlan() {
    const host = $('stPlan');
    if (!host) return;
    host.innerHTML = '<h3>Plan</h3><p class="st-hint">Loading…</p>';
    try {
      const mine = await jsonFetch('/api/plan/catalog');
      const rows = mine.plans.map(p => {
        const isMine = p.id === mine.mine;
        const pending = mine.pending && mine.pending.toPlan === p.id;
        const locked = p.order < mine.plans.find(x => x.id === mine.mine).order;
        const action = isMine ? '<span class="qf-chip">Your plan</span>'
          : pending ? '<span class="qf-chip">Request pending</span>'
          : locked ? '' : `<button type="button" class="ghost" data-req="${esc(p.id)}">Request this plan</button>`;
        return `<div class="st-role">
          <div><div class="st-label">${esc(p.label)}${p.aiAccess ? ' · AI access' : ''}</div><div class="st-hint">${esc(p.blurb)}</div></div>
          <div class="st-pick">${action}</div>
        </div>`;
      }).join('');
      let adminHtml = '';
      if (isAdmin()) {
        const pend = await jsonFetch('/api/plan/requests?status=pending');
        adminHtml = `<h3>Upgrade requests</h3>` + (pend.requests.length
          ? pend.requests.map(r => `<div class="st-role">
              <div><div class="st-label">${esc(r.email)}</div><div class="st-hint">${esc(r.fromPlan)} &rarr; ${esc(r.toPlan)} · asked ${esc(new Date(r.createdAt).toLocaleString())}</div></div>
              <div class="st-pick">
                <button type="button" class="ghost" data-approve="${esc(r.id)}">Approve</button>
                <button type="button" class="ghost" data-decline="${esc(r.id)}">Decline</button>
              </div>
            </div>`).join('')
          : '<p class="st-hint">No pending requests.</p>');
      }
      host.innerHTML = `<h3>Plan</h3>${rows}${adminHtml}`;
      host.querySelectorAll('[data-req]').forEach(btn => {
        btn.onclick = async () => {
          btn.disabled = true;
          try {
            await jsonFetch('/api/plan/request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan: btn.dataset.req }) });
            note('Request sent to the admin.');
            renderPlan();
          } catch (e) { note(esc(e.message), true); btn.disabled = false; }
        };
      });
      host.querySelectorAll('[data-approve], [data-decline]').forEach(btn => {
        const id = btn.dataset.approve || btn.dataset.decline;
        const decision = btn.dataset.approve ? 'approve' : 'decline';
        btn.onclick = async () => {
          btn.disabled = true;
          try { await jsonFetch(`/api/plan/requests/${id}/${decision}`, { method: 'POST' }); renderPlan(); }
          catch (e) { note(esc(e.message), true); btn.disabled = false; }
        };
      });
    } catch (e) {
      host.innerHTML = `<h3>Plan</h3><p class="st-hint">Could not load plans: ${esc(e.message)}</p>`;
    }
  }

  /** Times one short round trip per selected model, so "fast" is measured
   *  rather than assumed. */
  async function bench() {
    const btn = $('stBench');
    btn.disabled = true;
    const original = btn.textContent;
    const roles = window.Settings.ROLES;
    for (const r of roles) {
      const cell = document.querySelector(`[data-timing="${r.id}"]`);
      const model = window.Settings.modelFor(r.id);
      cell.textContent = '…';
      const t0 = performance.now();
      try {
        const res = await fetch('/api/behavioural/chat', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            question: 'Tell me about a time you missed a deadline.',
            messages: [{ role: 'user', content: 'Ready to begin.' }],
            timeLeft: '20:00', model,
          }),
        });
        const d = await res.json();
        const ms = Math.round(performance.now() - t0);
        cell.textContent = res.ok && d.reply ? `${(ms / 1000).toFixed(1)}s` : 'failed';
        cell.className = 'st-timing' + (res.ok && d.reply ? (ms < 5000 ? ' fast' : ' slow') : ' bad');
      } catch {
        cell.textContent = 'failed';
        cell.className = 'st-timing bad';
      }
    }
    btn.disabled = false;
    btn.textContent = original;
    note('Timings are one round trip each, including network. Under ~3s feels conversational.');
  }

  // --- interface size -------------------------------------------------------
  const ZOOM_MIN = 70, ZOOM_MAX = 160, ZOOM_STEP = 5;

  function readZoom() {
    const n = parseInt(localStorage.getItem('uiZoom') || '100', 10);
    return Number.isFinite(n) && n >= ZOOM_MIN && n <= ZOOM_MAX ? n : 100;
  }

  function applyZoom(pct, persist) {
    const z = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(pct / ZOOM_STEP) * ZOOM_STEP));
    document.documentElement.style.setProperty('--ui-zoom', z / 100);
    if ($('zoomRange')) $('zoomRange').value = String(z);
    if ($('zoomValue')) $('zoomValue').textContent = `${z}%`;
    if (persist) { try { localStorage.setItem('uiZoom', String(z)); } catch { /* private mode */ } }
    return z;
  }

  function initZoom() {
    if (!$('zoomRange')) return;
    applyZoom(readZoom(), false);
    $('zoomRange').addEventListener('input', e => applyZoom(Number(e.target.value), true));
    $('zoomDown').onclick = () => applyZoom(readZoom() - ZOOM_STEP, true);
    $('zoomUp').onclick = () => applyZoom(readZoom() + ZOOM_STEP, true);
    $('zoomReset').onclick = () => applyZoom(100, true);
  }

  // --- voice ----------------------------------------------------------------
  async function renderVoice() {
    await window.Voice?.checkServer?.();
    const host = $('stVoice');
    if (!host || !window.Voice) return;
    const V = window.Voice, p = V.prefs();
    const warn = V.why();
    const list = V.sortedVoices ? V.sortedVoices() : V.voices();

    host.innerHTML = `
      ${warn ? `<p class="st-note warn">${esc(warn)}</p>` : ''}
      <p class="st-note">Listening uses your browser's speech recognition and no audio is recorded.
        With the natural voice, the text to be read aloud is sent to the server to generate speech.
        Your voice settings are saved to your account and synced across your devices.
        Speaking and listening are separate, so you can hear the interviewer while still typing.</p>
      <div class="st-role">
        <div>
          <div class="st-label">Answer by voice</div>
          <div class="st-hint">Adds a microphone button to both interviews. Your words fill the
            box so you can edit before sending.</div>
        </div>
        <div class="st-voice-row">
          <label><input type="checkbox" id="vIn" ${p.input ? 'checked' : ''}
            ${V.canListen() ? '' : 'disabled'}> Enabled</label>
        </div>
      </div>
      <div class="st-role">
        <div>
          <div class="st-label">Read the interviewer aloud</div>
          <div class="st-hint">Speaks each reply as it arrives.</div>
        </div>
        <div class="st-voice-row">
          <label><input type="checkbox" id="vOut" ${p.output ? 'checked' : ''}
            ${V.canSpeak() ? '' : 'disabled'}> Enabled</label>
        </div>
      </div>
      <div class="st-role">
        <div>
          <div class="st-label">Speech engine</div>
          <div class="st-hint">${V.serverReady()
            ? 'A neural voice runs on the server and sounds markedly more human than the browser\'s built-in one. It takes a second or two to generate.'
            : 'The server\'s neural voice could not be reached just now, so the browser\'s built-in speech is used. <button class="ln-inline" id="vRecheck">Check again</button>'}</div>
        </div>
        <div class="st-voice-row st-voice-col">
          <select id="vEngine" ${V.serverReady() ? '' : 'disabled'}>
            <option value="natural"${p.engine !== 'browser' ? ' selected' : ''}>Natural (server)</option>
            <option value="browser"${p.engine === 'browser' ? ' selected' : ''}>Browser built-in</option>
          </select>
          <div id="vLast" class="st-hint st-last"></div>
        </div>
      </div>
      ${[['interviewer', 'serverVoice', 'Interviewer voice', 'Used for the interviewer in the coding and behavioural interviews, and for the interviewer in Watch.'],
         ['candidate', 'candidateVoice', 'Candidate voice', 'Used for the candidate in Watch, so the two sides are easy to tell apart. Defaults to the opposite gender of the interviewer.']]
        .map(([role, key, label, hint]) => `
      <div class="st-role">
        <div>
          <div class="st-label">${label}</div>
          <div class="st-hint">${hint}</div>
        </div>
        <div class="st-voice-row">
          <select id="vRole-${role}" data-key="${key}" ${V.serverReady() && p.engine !== 'browser' ? '' : 'disabled'}>
            <option value="">Default (${esc(V.voiceFor(role))})</option>
            ${V.serverVoices().map(v => {
              const id = typeof v === 'string' ? v : v.id;
              const lab = typeof v === 'string' ? id.replace(/^en_GB-/, '').replace(/_/g, ' ') : v.label;
              const eng = typeof v === 'string' ? '' : ` · ${v.engine}`;
              return `<option value="${esc(id)}"${id === p[key] ? ' selected' : ''}>${esc(lab)}${esc(eng)}</option>`;
            }).join('')}
          </select>
          <button class="ghost st-preview" data-role="${role}" ${V.canSpeak() ? '' : 'disabled'}>Preview</button>
        </div>
      </div>`).join('')}
      <div class="st-role">
        <div>
          <div class="st-label">Voice speed and volume</div>
          <div class="st-hint">${list.length ? `${list.length} voices available.` : 'Loading voices…'}</div>
        </div>
        <div class="st-voice-row">
          <select id="vName" ${V.canSpeak() ? '' : 'disabled'}>
            <option value="">Automatic</option>
            ${list.map(v => `<option value="${esc(v.name)}"${v.name === p.voiceName ? ' selected' : ''}>${esc(v.name)} (${esc(v.lang)})</option>`).join('')}
          </select>
          <input id="vRate" type="range" min="0.6" max="1.6" step="0.1" value="${p.rate}"
            aria-label="Speech rate" ${V.canSpeak() ? '' : 'disabled'}>
          <span class="st-timing" id="vRateVal">${Number(p.rate).toFixed(1)}x</span>
          <button id="vTest" class="ghost" ${V.canSpeak() ? '' : 'disabled'}>Test</button>
        
          <span class="st-vol" title="Volume">&#128266;
            <input id="vVolume" type="range" min="0" max="1" step="0.05" value="${p.volume ?? 1}" aria-label="Volume" ${V.canSpeak() ? '' : 'disabled'}>
            <span id="vVolumeVal">${Math.round((p.volume ?? 1) * 100)}%</span></span>
        </div>
      </div>`;

    $('vIn').onchange = e => V.setPrefs({ input: e.target.checked });
    $('vOut').onchange = e => V.setPrefs({ output: e.target.checked });
    $('vName').onchange = e => V.setPrefs({ voiceName: e.target.value });
    $('vVolume').oninput = e => {
      V.setPrefs({ volume: Number(e.target.value) });
      $('vVolumeVal').textContent = `${Math.round(Number(e.target.value) * 100)}%`;
    };
    $('vRate').oninput = e => {
      V.setPrefs({ rate: Number(e.target.value) });
      $('vRateVal').textContent = `${Number(e.target.value).toFixed(1)}x`;
    };
    if ($('vEngine')) {
      $('vEngine').onchange = e => { V.setPrefs({ engine: e.target.value }); renderVoice(); };
      const recheck = $('vRecheck');
      if (recheck) recheck.onclick = () => { recheck.disabled = true; V.checkServer(true).then(renderVoice); };
      // The check may still be in flight on first paint; redraw once it lands.
      if (!V.serverReady()) V.checkServer().then(s => { if (s.available) renderVoice(); });
    }
    host.querySelectorAll('select[data-key]').forEach(sel => {
      sel.onchange = e => { V.setPrefs({ [sel.dataset.key]: e.target.value }); renderVoice(); };
    });
    const SAMPLE = {
      interviewer: "Hello, I'm on the Maps team here in London. Shall we start with a quick problem?",
      candidate: 'Sure. Before I code anything, can I check the input is always sorted?',
    };
    host.querySelectorAll('.st-preview').forEach(b => {
      b.onclick = () => {
        V.speak(SAMPLE[b.dataset.role], { voice: V.voiceFor(b.dataset.role) });
        for (const ms of [1500, 4000, 8000]) setTimeout(showLast, ms);
      };
    });
    $('vTest').onclick = () => {
      V.speak('Tell me about a time you disagreed with a teammate on a technical decision.');
      // The neural clip takes a few seconds to arrive; keep the line current.
      for (const ms of [1500, 4000, 8000]) setTimeout(showLast, ms);
    };
    showLast();
  }

  /** Which engine the last utterance really used — the first thing to check
   *  when the voice does not sound like the one selected. */
  function showLast() {
    const el = $('vLast'), last = window.Voice?.lastSpokeWith?.();
    if (!el || !last) return;
    if (!last.engine) { el.textContent = 'Nothing has been spoken on this page yet.'; return; }
    el.textContent = last.engine === 'server'
      ? `Last spoke with the neural voice (${last.voice}).`
      : `Last spoke with the browser voice${last.voice ? ` (${last.voice})` : ''}${last.reason ? ` — ${last.reason}` : ''}.`;
  }
  window.renderVoiceSettings = renderVoice;

  // ---- backup & restore: your saved data as one file -------------------------
  // Everything that belongs to the account (plans, stories, attempts, drafts
  // too), not a hand-kept list that silently missed the newer features.
  // Only the sign-in bookkeeping is left out.
  const NOT_BACKED_UP = new Set(['qf.uid', 'qf.syncedAt', 'qf.dirty']);
  const BACKUP_KEYS = () => { const out = []; try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && !NOT_BACKED_UP.has(k)) out.push(k); } } catch { /* blocked */ } return out; };
  const restorable = k => typeof k === 'string' && k.length <= 80 && !NOT_BACKED_UP.has(k);
  function renderBackup() {
    const host = $('stBackup'); if (!host) return;
    const sizes = BACKUP_KEYS().map(k => { try { return (localStorage.getItem(k) || '').length; } catch { return 0; } });
    const kb = Math.round(sizes.reduce((a, b) => a + b, 0) / 1024);
    host.innerHTML = `
      <h3>Backup</h3>
      <div class="st-role">
        <div>
          <div class="st-label">Back up your data</div>
          <div class="st-hint">History, write-ups, plans, stories, code attempts, Learn progress, your resume profile, voice and model settings — ${kb} KB.
            All of it is saved to your account and synced across your devices; this file is an extra copy you can keep or restore from.</div>
        </div>
        <div class="st-voice-row">
          <button id="stExport" class="ghost">Export backup</button>
          <label class="ghost st-import">Restore… <input type="file" id="stImport" accept="application/json" hidden></label>
        </div>
      </div>`;
    $('stExport').onclick = () => {
      const data = {};
      for (const k of BACKUP_KEYS()) { try { const v = localStorage.getItem(k); if (v != null) data[k] = v; } catch { /* skip */ } }
      const blob = new Blob([JSON.stringify({ app: 'interview-sim', version: 1, exportedAt: new Date().toISOString(), data }, null, 1)], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
      a.download = `interview-prep-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      note('Backup downloaded.');
    };
    $('stImport').onchange = async e => {
      const f = e.target.files?.[0]; if (!f) return;
      try {
        const parsed = JSON.parse(await f.text());
        if (parsed?.app !== 'interview-sim' || !parsed.data) throw new Error('not an interview-prep backup');
        let n = 0;
        for (const [k, v] of Object.entries(parsed.data)) { if (restorable(k) && typeof v === 'string') { localStorage.setItem(k, v); n++; } }
        note(`Restored ${n} item${n === 1 ? '' : 's'}. Saving to your account…`);
        // Save to the account before reloading, or the reload drops the pending save.
        try { await window.QF?.flush?.(); } catch { /* the shell retries on next load */ }
        setTimeout(() => location.reload(), 400);
      } catch (err) { note(`Could not restore: ${esc(err.message)}`, true); }
      e.target.value = '';
    };
  }

  function init() {
    if (!$('stRoles')) return;
    // The static intro in index.html predates accounts; keep it accurate.
    const lede = document.querySelector('#stLayout .bv-intro .bv-lede');
    if (lede) lede.textContent = 'Each job uses a different mix of speed and judgement, so they are chosen ' +
      'separately. Conversation turns want a fast model; scoring and resume analysis want an ' +
      'accurate one. Saved to your account and synced across your devices.';
    initZoom();
    renderVoice();
    // The voice list arrives asynchronously and is usually empty on first paint.
    // Safari fires voiceschanged on every getVoices() call, which the render
    // itself makes — re-rendering unconditionally looped and reset the
    // controls under the cursor. Only redraw when the list actually grew.
    let voiceCount = window.Voice?.voices?.().length || 0;
    window.speechSynthesis?.addEventListener?.('voiceschanged', () => {
      const n = window.Voice?.voices?.().length || 0;
      if (n !== voiceCount && !$('stVoice')?.contains(document.activeElement)) { voiceCount = n; renderVoice(); }
    });
    $('stReset').onclick = () => {
      window.Settings.clear();
      render();
      note('Cleared. Every job is back to the server default.');
    };
    $('stBench').onclick = bench;
    renderBackup();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
