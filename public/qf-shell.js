/* QuantFlash shell: accounts, per-user data, grouped navigation and the live
 * status bar. Loaded first, before every other script, so the signed-in
 * user's saved tabs are in localStorage before any tab reads them.
 */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // Kept per device, never per user. Everything else (history, plans, drafts,
  // design choice) belongs to the signed-in account and follows it around.
  const DEVICE_KEYS = new Set(['uiZoom', 'qf.uid', 'qf.syncedAt', 'qf.dirty', 'questionPaneWidth', 'qf.sideCollapsed']);

  // ------------------------------------------------- who is signed in (sync) ---
  let me = { user: null, required: true, external: null, firstUser: false };
  try {
    const x = new XMLHttpRequest();
    x.open('GET', '/api/auth/me?state=1', false);            // deliberate: must finish before the app boots
    x.send();
    if (x.status === 200) me = JSON.parse(x.responseText);
  } catch { /* offline: the app shows its own errors */ }
  window.QF = { user: me.user, required: me.required, external: me.external };

  // ------------------------------------------------ per-user data isolation ---
  const rawSet = Storage.prototype.setItem, rawRemove = Storage.prototype.removeItem;
  const ls = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { rawSet.call(localStorage, k, v); } catch { /* full */ } } };
  function userKeys() {
    const out = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && !DEVICE_KEYS.has(k)) out[k] = localStorage.getItem(k);
    }
    return out;
  }
  function clearUserKeys() {
    const ks = [];
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && !DEVICE_KEYS.has(k)) ks.push(k); }
    ks.forEach(k => rawRemove.call(localStorage, k));
  }
  function loadKeys(keys) { for (const [k, v] of Object.entries(keys || {})) if (!DEVICE_KEYS.has(k)) ls.set(k, v); }

  // ------------------------------------------------------- merging copies ---
  // Three-way merge of two copies of the account's keys against the copy both
  // started from (base). Lists of records with ids (history, attempts,
  // stories) are merged record by record, objects (progress maps, plans) key
  // by key, so two devices adding to the same list both keep their entries.
  // A side that did not touch something takes the other side's version;
  // an edit beats a delete; when both edited the same thing, the newer record
  // (or this device, for plain values) wins.
  const J = s => { try { return JSON.parse(s); } catch { return undefined; } };
  const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
  const same = (a, b) => a === b || JSON.stringify(a) === JSON.stringify(b);
  const stamp = (x, fields) => { for (const f of fields) if (Number.isFinite(x?.[f])) return x[f]; return null; };
  const BORN = ['createdAt', 'savedAt', 'at', 'startedAt'], TOUCHED = ['updatedAt', ...BORN];
  const rid = x => (isObj(x) && (typeof x.id === 'string' || typeof x.id === 'number') ? String(x.id) : null);
  function mergeList(b, m, t) {
    if (![...m, ...t].every(x => rid(x) != null)) return undefined;
    const B = new Map((Array.isArray(b) ? b : []).filter(x => rid(x) != null).map(x => [rid(x), x]));
    const M = new Map(m.map(x => [rid(x), x])), T = new Map(t.map(x => [rid(x), x]));
    const out = [];
    for (const k of [...M.keys(), ...[...T.keys()].filter(k => !M.has(k))]) {
      const mv = M.get(k), tv = T.get(k), bv = B.get(k);
      if (mv && tv) out.push(same(mv, bv) ? tv : same(tv, bv) ? mv : (stamp(tv, TOUCHED) ?? 0) > (stamp(mv, TOUCHED) ?? 0) ? tv : mv);
      else if (mv) { if (!bv || !same(mv, bv)) out.push(mv); }      // added here, or edited here while deleted there
      else if (tv) { if (!bv || !same(tv, bv)) out.push(tv); }
    }
    // Keep the list's time order (newest first or oldest first) when it has one.
    const ref = m.length > 1 ? m : t;
    const ts = ref.map(x => stamp(x, BORN));
    if (ref.length > 1 && out.every(x => stamp(x, BORN) != null) && ts.every(v => v != null)) {
      const desc = ts.every((v, i) => !i || ts[i - 1] >= v), asc = ts.every((v, i) => !i || ts[i - 1] <= v);
      if (desc !== asc) out.sort((x, y) => (desc ? stamp(y, BORN) - stamp(x, BORN) : stamp(x, BORN) - stamp(y, BORN)));
    }
    return out;
  }
  function mergeVal(b, m, t) {
    if (same(m, t)) return m;
    if (same(m, b)) return t;
    if (same(t, b)) return m;
    if (m === undefined) return t;                                   // deleted here, edited there
    if (t === undefined) return m;
    if (Array.isArray(m) && Array.isArray(t)) return mergeList(b, m, t) ?? m;
    if (isObj(m) && isObj(t)) {
      const o = {}, bb = isObj(b) ? b : {};
      for (const k of new Set([...Object.keys(m), ...Object.keys(t)])) { const v = mergeVal(bb[k], m[k], t[k]); if (v !== undefined) o[k] = v; }
      return o;
    }
    return m;
  }
  /** base/mine/theirs: {key: string}. Returns {key: string|undefined}. */
  function mergeKeys(base, mine, theirs) {
    const out = {};
    for (const k of new Set([...Object.keys(mine), ...Object.keys(theirs)])) {
      const b = base[k], m = mine[k], t = theirs[k];
      if (m === t) { out[k] = m; continue; }
      if (m === b) { out[k] = t; continue; }
      if (t === b) { out[k] = m; continue; }
      if (m === undefined || t === undefined) { out[k] = m ?? t; continue; }
      const pm = J(m), pt = J(t);
      if (pm === undefined || pt === undefined || typeof pm !== 'object' || typeof pt !== 'object' || pm === null || pt === null) { out[k] = m; continue; }
      const v = mergeVal(b === undefined ? undefined : J(b), pm, pt);
      out[k] = v === undefined ? undefined : JSON.stringify(v);
    }
    return out;
  }
  function applyKeys(keys) {
    for (const [k, v] of Object.entries(keys)) {
      if (DEVICE_KEYS.has(k)) continue;
      if (v === undefined) rawRemove.call(localStorage, k);
      else if (ls.get(k) !== v) ls.set(k, v);
    }
  }
  window.QF._merge = mergeKeys;      // exposed for tests

  let syncedAt = null, base = null;
  if (me.user) {
    try {
      const owner = ls.get('qf.uid');
      const server = me.state || { keys: {}, savedAt: null };
      server.keys = server.keys || {};
      const serverHasData = Object.keys(server.keys).length > 0;
      syncedAt = ls.get('qf.syncedAt');
      // Changes this device made but never got onto the server (the tab was
      // closed mid-save, or the save was refused): never thrown away.
      const unsaved = ls.get('qf.dirty') === '1';
      if (owner !== me.user.id) {
        // A different person used this browser, or this is the first sign-in
        // here: this account sees ONLY its own data. Whatever is in this
        // browser (another person's progress, or anything left from before
        // signing in) is cleared, never adopted into this account.
        clearUserKeys(); loadKeys(server.keys);
        rawRemove.call(localStorage, 'qf.dirty');
        ls.set('qf.uid', me.user.id);
        syncedAt = server.savedAt;
        base = server.keys;
        if (!serverHasData) setTimeout(() => push(true), 1500);
      } else if (server.savedAt && server.savedAt !== syncedAt) {
        // Same person, but another device saved since this one last synced.
        // Nothing unsaved here: take theirs. Unsaved work here: merge both
        // (no common base is known, so nothing is treated as deleted).
        const local = userKeys();
        applyKeys(unsaved ? mergeKeys({}, local, server.keys) : mergeKeys(local, local, server.keys));
        syncedAt = server.savedAt;
        base = server.keys;
        if (unsaved) setTimeout(() => push(true), 1500);
      } else {
        base = server.keys;
        if (unsaved) setTimeout(() => push(true), 1500);
      }
      if (syncedAt) ls.set('qf.syncedAt', syncedAt);
      // The design is part of the account: apply the restored one before paint settles.
      const d = document.documentElement;
      if (ls.get('skin')) d.setAttribute('data-skin', ls.get('skin'));
      if (ls.get('theme')) d.setAttribute('data-theme', ls.get('theme'));
    } catch { /* storage blocked: the app still works for this page */ }
  }
  // Default look for the redesign; an explicit earlier choice is kept.
  if (!ls.get('skin')) { document.documentElement.setAttribute('data-skin', 'qf'); }

  // Mirror every change to the server, a few seconds after the last one.
  let dirty = false, timer = null, lastSaved = null, saveErr = false, inflight = null;
  let saveWhy = '', backoff = 0;
  // Another tab signed in as someone else: this tab's account is no longer
  // the one in this browser's storage. Never save that storage into this
  // account (it would copy the other person's data in); reload instead.
  function ownerChanged() {
    if (!me.user) return false;
    const owner = ls.get('qf.uid');
    if (owner && owner !== me.user.id) { clearTimeout(timer); dirty = false; setTimeout(() => location.reload(), 0); return true; }
    return false;
  }
  function push(force, retry = 3, keepalive = false) {
    if (!me.user || (!dirty && !force)) return Promise.resolve();
    if (ownerChanged()) return Promise.resolve();
    // One save at a time per tab; a change made meanwhile goes in the next one.
    if (inflight) { dirty = true; return inflight.then(() => push(true, retry, keepalive)); }
    dirty = false;
    // Several tabs share one localStorage: whichever tab saved last already
    // wrote the server's new version here, so start from that, not from the
    // value this tab remembered (which made every other tab's save look stale).
    syncedAt = ls.get('qf.syncedAt') || syncedAt;
    const sent = userKeys();
    const body = JSON.stringify({ keys: sent, base: syncedAt });
    // Started synchronously, so a save begun as the tab is hidden still goes out.
    const req = rawFetch('/api/auth/state', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body,
      keepalive: keepalive && body.length < 60000,
    });
    inflight = (async () => {
      let again = false;
      try {
        const r = await req;
        const b = await r.json().catch(() => ({}));
        if (r.status === 409 && b.state && retry > 0) {
          // Someone saved from another device or tab first: merge their copy
          // with everything here (including changes made while this save was
          // in flight), then save the result.
          const theirs = b.state.keys || {};
          applyKeys(mergeKeys(base || {}, userKeys(), theirs));
          base = theirs;
          // Remember the server's version everywhere this tab looks for it, or the
          // retry would still send the old one and be refused again forever.
          syncedAt = b.state.savedAt;
          if (syncedAt) ls.set('qf.syncedAt', syncedAt);
          again = true;
        } else {
          saveErr = !r.ok;
          if (r.ok) {
            lastSaved = new Date(); syncedAt = b.savedAt; ls.set('qf.syncedAt', syncedAt); base = sent; backoff = 0; saveWhy = '';
            if (!dirty) rawRemove.call(localStorage, 'qf.dirty');
          } else { saveWhy = r.status === 409 ? 'syncing' : r.status === 401 ? 'signed out' : (b.error || `server said ${r.status}`); dirty = true; }
        }
      } catch (e) { saveErr = true; dirty = true; saveWhy = 'offline'; }
      // A failed save always tries again, a little later each time (max 1 min).
      if (saveErr && !again && !/too large/i.test(saveWhy)) { backoff = Math.min(60000, (backoff || 2500) * 2); clearTimeout(timer); timer = setTimeout(() => push(true), saveWhy === 'syncing' ? 1500 : backoff); }
      return again;
    })();
    return inflight.then(again => { inflight = null; paintBar(); return again ? push(true, retry - 1) : undefined; });
  }
  const schedule = () => { if (ownerChanged()) return; dirty = true; ls.set('qf.dirty', '1'); clearTimeout(timer); timer = setTimeout(push, 2500); };
  // Only real changes count: some tabs re-save an unchanged draft every few
  // seconds, which used to upload the whole account that often.
  Storage.prototype.setItem = function (k, v) {
    const watch = this === localStorage && me.user && !DEVICE_KEYS.has(k);
    const before = watch ? this.getItem(k) : null;
    rawSet.call(this, k, v);
    if (watch && before !== String(v)) schedule();
  };
  Storage.prototype.removeItem = function (k) {
    const watch = this === localStorage && me.user && !DEVICE_KEYS.has(k);
    const had = watch && this.getItem(k) !== null;
    rawRemove.call(this, k);
    if (had) schedule();
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && dirty && me.user) { clearTimeout(timer); push(true, 3, true); }
  });
  window.addEventListener('pagehide', () => { if (dirty && me.user) { clearTimeout(timer); push(true, 0, true); } });
  window.addEventListener('storage', e => {
    // Another tab of this browser saved: everything in localStorage (which
    // the tabs share) is now on the server, so that is the new common base.
    if (e.key === 'qf.syncedAt' && e.newValue) { syncedAt = e.newValue; base = userKeys(); }
    // Signed out, or someone else signed in, in another tab.
    if (e.key === 'qf.uid' && me.user && e.newValue !== me.user.id) location.reload();
  });
  window.QF.flush = () => push(true);

  // Signed out: the app's own startup calls would only bounce with 401, so hold
  // them; the page reloads after sign-in anyway. A session that expires later
  // brings the sign-in screen back.
  const rawFetch = window.fetch.bind(window);
  window.fetch = async function (...args) {
    const url = String(args[0] && args[0].url || args[0]);
    if (me.required && !me.user && /\/api\//.test(url) && !url.includes('/api/auth/')) return new Promise(() => {});
    const res = await rawFetch(...args);
    if (res.status === 401 && me.required && !url.includes('/api/auth/')) {
      res.clone().json().then(b => { if (b && b.code === 'signed_out') showAuth('signin', 'Your session ended. Sign in again.'); }).catch(() => {});
    }
    return res;
  };

  // ------------------------------------------------------------ auth screen ---
  const COMPANIES = ['Google', 'Meta', 'Amazon', 'Apple', 'Microsoft', 'Netflix', 'Optiver', 'Jane Street', 'Citadel', 'Other'];
  const icon = {
    google: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="#4285F4" d="M22.5 12.3c0-.8-.1-1.5-.2-2.2H12v4.2h5.9a5 5 0 0 1-2.2 3.3v2.7h3.5c2.1-1.9 3.3-4.7 3.3-8z"/><path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.5-2.7c-1 .7-2.3 1.1-3.8 1.1-2.9 0-5.4-2-6.3-4.6H2.1v2.8A11 11 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.7 14.1a6.6 6.6 0 0 1 0-4.2V7.1H2.1a11 11 0 0 0 0 9.8l3.6-2.8z"/><path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.1-3.1A11 11 0 0 0 2.1 7.1l3.6 2.8C6.6 7.4 9.1 5.4 12 5.4z"/></svg>',
  };

  function authHtml(mode, note) {
    const ext = me.external;
    const opts = COMPANIES.map(c => `<option${c === 'Google' ? ' selected' : ''}>${c}</option>`).join('');
    return `
    <div class="qf-auth-wrap">
      <section class="qf-auth-brand">
        <div class="qf-logo"><span class="qf-logo-mark" aria-hidden="true">Q</span>QuantFlash</div>
        <h1>Prepare for the interview you actually have.</h1>
        <p>Pick your target and date. QuantFlash turns it into a day-by-day plan across every coding pattern and Googleyness, with fast drills, a live AI interviewer and a real judge.</p>
        <ul class="qf-auth-points">
          <li><b>Plan</b> built from your interview date</li>
          <li><b>Drills</b> that teach patterns in minutes</li>
          <li><b>Live</b> mock interviews with a scored write-up</li>
        </ul>
      </section>
      <section class="qf-auth-card" aria-labelledby="qfAuthTitle">
        <div class="qf-auth-tabs" role="tablist">
          <button type="button" role="tab" data-to="signin" aria-selected="${mode === 'signin'}">Sign in</button>
          <button type="button" role="tab" data-to="signup" aria-selected="${mode === 'signup'}">Create account</button>
        </div>
        <h2 id="qfAuthTitle" class="qf-sr">${mode === 'signin' ? 'Sign in' : 'Create account'}</h2>
        ${note ? `<p class="qf-auth-note">${esc(note)}</p>` : ''}
        ${me.firstUser && mode === 'signup' ? '<p class="qf-auth-note">This is the first account on this server, so it becomes the admin (it alone can change the LeetCode judge cookie).</p>' : ''}
        <button type="button" class="qf-btn qf-btn-google" id="qfGoogle" ${ext ? '' : 'aria-describedby="qfGoogleHint"'}>
          ${icon.google}<span>${ext ? `Continue as ${esc(ext)}` : 'Continue with Google'}</span>
        </button>
        ${ext ? '' : '<p class="qf-hint" id="qfGoogleHint">Google sign-in works on the live site, where Cloudflare Access verifies your Google account.</p>'}
        <div class="qf-or"><span>or with email</span></div>
        <form id="qfAuthForm" novalidate>
          ${mode === 'signup' ? `
          <label class="qf-field"><span>Name</span><input name="name" autocomplete="name" required maxlength="80"></label>` : ''}
          <label class="qf-field"><span>Email</span><input name="email" type="email" autocomplete="email" required></label>
          <label class="qf-field"><span>Password</span><input name="password" type="password" autocomplete="${mode === 'signup' ? 'new-password' : 'current-password'}" required minlength="${mode === 'signup' ? 8 : 1}">
            ${mode === 'signup' ? '<small>At least 8 characters.</small>' : ''}</label>
          ${mode === 'signup' ? `
          <div class="qf-row">
            <label class="qf-field"><span>Target company</span><select name="company">${opts}</select></label>
            <label class="qf-field"><span>Level</span><select name="level"><option>L3</option><option selected>L4</option><option>L5</option><option>L6</option></select></label>
          </div>
          <label class="qf-field"><span>Interview date</span><input name="date" type="date" value="2026-11-03"></label>` : ''}
          <p class="qf-auth-err" id="qfAuthErr" role="alert"></p>
          <button class="qf-btn qf-btn-primary" type="submit">${mode === 'signin' ? 'Sign in' : 'Create account'}</button>
        </form>
      </section>
    </div>`;
  }

  function showAuth(mode = 'signin', note = '') {
    let el = $('qfAuth');
    if (!el) { el = document.createElement('div'); el.id = 'qfAuth'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); document.body.appendChild(el); }
    el.innerHTML = authHtml(mode, note);
    document.documentElement.classList.add('qf-locked');
    el.querySelectorAll('[data-to]').forEach(b => { b.onclick = () => showAuth(b.dataset.to); });
    $('qfGoogle').onclick = async () => {
      const r = await rawFetch('/api/auth/google', { method: 'POST', credentials: 'same-origin' });
      const b = await r.json().catch(() => ({}));
      if (r.ok) return location.reload();
      $('qfAuthErr').textContent = b.error || 'Google sign-in is not available here.';
    };
    $('qfAuthForm').onsubmit = async e => {
      e.preventDefault();
      const f = new FormData(e.target);
      const btn = e.target.querySelector('button[type=submit]');
      $('qfAuthErr').textContent = '';
      // The form is novalidate (for our own wording), so say what is missing here.
      const miss = [mode === 'signup' && !String(f.get('name') || '').trim() && 'your name', !String(f.get('email') || '').trim() && 'your email', !f.get('password') && 'a password'].filter(Boolean);
      if (miss.length) { $('qfAuthErr').textContent = `Enter ${miss.join(' and ')}.`; e.target.querySelector(`[name="${miss[0] === 'your name' ? 'name' : miss[0] === 'your email' ? 'email' : 'password'}"]`)?.focus(); return; }
      btn.disabled = true;
      const body = mode === 'signin'
        ? { email: f.get('email'), password: f.get('password') }
        : { name: f.get('name'), email: f.get('email'), password: f.get('password'),
            target: { company: f.get('company'), level: f.get('level'), role: 'Software Engineer', date: f.get('date') } };
      try {
        const r = await rawFetch(`/api/auth/${mode === 'signin' ? 'login' : 'signup'}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(body) });
        const b = await r.json().catch(() => ({}));
        if (!r.ok) { $('qfAuthErr').textContent = b.error || 'That did not work. Try again.'; btn.disabled = false; return; }
        location.reload();
      } catch { $('qfAuthErr').textContent = 'Network error. Check your connection.'; btn.disabled = false; }
    };
    // Focus at once (never on a timer, which could steal focus mid-typing), and
    // not on touch screens, where it would throw up the keyboard uninvited.
    if (matchMedia('(pointer: fine)').matches && !el.contains(document.activeElement)) el.querySelector('input')?.focus();
  }

  async function logout() {
    try { await push(true); } catch { /* best effort */ }
    await rawFetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
    clearUserKeys();
    ['qf.uid', 'qf.syncedAt', 'qf.dirty'].forEach(k => rawRemove.call(localStorage, k));
    location.reload();
  }
  window.QF.logout = logout;

  // ------------------------------------------------------------ navigation ---
  // One left sidebar with every page in four groups; on a phone it becomes a
  // bottom tab bar whose groups open a sheet. Each entry points at the
  // original tab button, so every tab keeps working exactly as before.
  const I = {
    today: '<path d="M3 10.5 12 3l9 7.5V21H3z"/><path d="M9 21v-6h6v6"/>',
    learn: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5"/>',
    pro: '<path d="m12 3 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8L3.5 9.2l5.9-.9z"/>',
    smart: '<circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4M5 5l3 3M16 16l3 3M5 19l3-3M16 8l3-3"/>',
    toolkit: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z"/>',
    code: '<path d="m8 8-5 4 5 4M16 8l5 4-5 4M14 4l-4 16"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    g: '<path d="M21 12.2c0-.7-.1-1.3-.2-1.9H12v3.6h5.1a4.4 4.4 0 0 1-1.9 2.9v2.4h3.1c1.8-1.7 2.7-4.1 2.7-7z"/><path d="M12 21c2.6 0 4.7-.9 6.3-2.3l-3.1-2.4c-.9.6-2 .9-3.2.9-2.5 0-4.6-1.7-5.3-3.9H3.5v2.5A9.5 9.5 0 0 0 12 21z"/>',
    real: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
    people: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 20a6 6 0 0 0-3-5.2"/>',
    mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
    eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    file: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    map: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
    more: '<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>',
    collapse: '<path d="M15 6l-6 6 6 6"/>',
  };
  const svg = (k, s = 18) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[k] || ''}</svg>`;
  const GROUPS = [
    { id: 'prepare', label: 'Prepare', icon: 'learn', items: [['modeHome', 'Today', 'today'], ['qf:plan', 'Nov 3 plan', 'smart'], ['modeLearn', 'Learn', 'learn'], ['modeProLearn', 'Pro-Learn', 'pro'], ['modeSmart', 'SMART map', 'smart'], ['modeToolkit', 'Toolkit', 'toolkit'],
      ['modeHftHub', 'Firms', 'map'], ['modeHftTopics', 'Topics', 'learn'], ['modeHftCoach', 'AI Coach', 'people']] },
    { id: 'practice', label: 'Practice', icon: 'code', items: [['modeCoding', 'Coding practice', 'code'], ['qf:approach', 'Talk through approach', 'mic'], ['qf:shorts', 'Shorts (2-min videos)', 'eye'], ['modeNeetcode', 'NeetCode lists', 'list'], ['modeGoogle', 'Google list', 'g'], ['modeRealq', 'Real questions', 'real'],
      ['modeHftPrep', 'Game prep', 'bolt'], ['modeHftPractice', 'Timed practice', 'clock']] },
    { id: 'interview', label: 'Interview', icon: 'people', items: [['qf:codinginterview', 'Coding interview', 'clock'], ['modeBehavioural', 'Googleyness', 'people'], ['modeTalk', 'Talk to a Googler', 'mic'], ['modeWatch', 'Watch a mock', 'eye'], ['qf:stories', 'My stories', 'file'], ['modeResume', 'Resume questions', 'file']] },
    { id: 'review', label: 'Review', icon: 'chart', items: [['modeHistory', 'History', 'clock'], ['modeSettings', 'Settings', 'gear']] },
  ];
  // A tab exists for this track if the app has not hidden it.
  const visible = id => { if (id.startsWith('qf:')) return true; const b = $(id); return !!b && !b.hidden && !/(^|\s)hidden(\s|$)/.test(b.className) && getComputedStyle(b).display !== 'none'; };
  const enabled = id => { if (id.startsWith('qf:')) return true; const b = $(id); return !!b && !b.disabled; };
  const activeId = () => {
    // The full-page views sit over whatever tab was open; they are the page.
    if ($('qfApproachPage')) return 'qf:approach';
    if ($('qfStoriesPage')) return 'qf:stories';
    if ($('qfPlanPage')) return 'qf:plan';
    const b = document.querySelector('.modeSwitch .mode[aria-selected="true"]');
    const id = b ? b.id : 'modeHome';
    return id === 'modeCoding' && document.documentElement.dataset.coding === 'interview' ? 'qf:codinginterview' : id;
  };
  const groupOf = id => GROUPS.find(g => g.items.some(([i]) => i === id)) || GROUPS[0];
  const why = id => ($(id)?.title || 'Not available on this server yet');
  // The full-page views open over the Coding tab without switching tab, so
  // the guard app.js puts on the tabs never sees them: ask here, the same way.
  const mockLive = () => Boolean(window.QF_SESSION?.running) || Boolean($('stopBtn') && !$('stopBtn').disabled);
  const leaveMock = () => {
    if (!mockLive()) return true;
    if (!confirm('A mock interview is running. Leave it?')) return false;
    window.stopCodingSession?.('left-tab');
    return true;
  };
  const open = id => {
    if ((id === 'qf:stories' || id === 'qf:approach' || id === 'qf:plan') && activeId() !== id && !leaveMock()) return;
    if (id !== 'qf:plan') window.QFPlan?.close?.();
    if (id === 'qf:plan') { closeSheet(); window.QFStories?.close?.(); window.QFApproach?.close?.(); window.QFPlan?.open?.(); return; }
    if (id === 'qf:stories') { closeSheet(); window.QFApproach?.close?.(); window.QFStories?.open?.(); return; }
    if (id === 'qf:shorts') { closeSheet(); window.QFShorts?.picker?.(); return; }
    if (id === 'qf:approach') { closeSheet(); window.QFStories?.close?.(); window.QFApproach?.open?.(); return; }
    if (id === 'qf:codinginterview') { window.QFStories?.close?.(); window.QFApproach?.close?.(); closeSheet(); $('modeCoding')?.click(); window.QFCoding?.setFlavour('interview'); return; }
    if (!enabled(id)) return; window.QFStories?.close?.(); window.QFApproach?.close?.();
    if (id === 'modeCoding') window.QFCoding?.setFlavour('practice');
    $(id)?.click(); closeSheet();
  };

  function buildNav() {
    const old = document.querySelector('.modeSwitch');
    if (!old || $('qfSide')) return;
    old.classList.add('qf-hidden-nav');
    const side = document.createElement('aside');
    side.id = 'qfSide'; side.setAttribute('aria-label', 'Main');
    document.body.appendChild(side);
    const tabs = document.createElement('nav');
    tabs.id = 'qfTabs'; tabs.setAttribute('aria-label', 'Main');
    document.body.appendChild(tabs);
    let collapsed = false;
    try { collapsed = localStorage.getItem('qf.sideCollapsed') === '1'; } catch { /* fine */ }
    document.documentElement.classList.toggle('qf-side-mini', collapsed);
    paintNav();
    new MutationObserver(paintNav).observe(old, { subtree: true, attributes: true, attributeFilter: ['aria-selected', 'class', 'disabled', 'hidden', 'style'] });
    // Opening or closing a full-page view (approach, stories) or switching the
    // coding flavour changes the active entry without touching the old tabs.
    new MutationObserver(() => { if (activeId() !== painted) paintNav(); })
      .observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-coding'] });
    new MutationObserver(() => { if (activeId() !== painted) paintNav(); }).observe(document.body, { childList: true });
    $('trackSel')?.addEventListener('change', () => setTimeout(paintNav, 0));
  }

  let painted = null;
  function paintNav() {
    const side = $('qfSide'), tabs = $('qfTabs');
    if (!side || !tabs) return;
    const act = activeId(), g = groupOf(act);
    painted = act;
    // Repainting replaces the buttons: keep keyboard focus where it was.
    const f = document.activeElement;
    const keep = f && (side.contains(f) || tabs.contains(f)) ? (f.id ? `#${f.id}` : f.dataset.open ? `[data-open="${f.dataset.open}"]` : f.dataset.group ? `[data-group="${f.dataset.group}"]` : f.dataset.track ? `[data-track="${f.dataset.track}"]` : null) : null;
    const keepIn = f && tabs.contains(f) ? tabs : side;
    const track = $('trackSel')?.value || 'maang';
    const item = ([id, label, ic]) => {
      const on = id === act, ok = enabled(id);
      return `<button type="button" class="qf-nav-item${on ? ' on' : ''}" data-open="${id}" ${on ? 'aria-current="page"' : ''} aria-label="${esc(label)}"
        ${ok ? `title="${esc(label)}"` : `aria-disabled="true" title="${esc(label)} — ${esc(why(id))}"`}>${svg(ic)}<span class="qf-nav-l">${esc(label)}</span>${ok ? '' : '<span class="qf-nav-off" aria-hidden="true">off</span>'}</button>`;
    };
    const mini = document.documentElement.classList.contains('qf-side-mini');
    side.innerHTML = `
      <div class="qf-side-top">
        <span class="qf-side-brand"><span class="qf-logo-mark" aria-hidden="true">Q</span><span class="qf-nav-l">QuantFlash</span></span>
      </div>
      ${trackToggle()}
      <div class="qf-side-scroll">
        ${GROUPS.map(gr => {
          const items = gr.items.filter(([i]) => visible(i));
          return items.length ? `<div class="qf-nav-group"><h3 class="qf-nav-h">${esc(gr.label)}</h3>${items.map(item).join('')}</div>` : '';
        }).join('')}
      </div>
      <button type="button" class="qf-nav-item qf-collapse" id="qfCollapse" aria-label="${mini ? 'Expand sidebar' : 'Collapse sidebar'}" title="${mini ? 'Expand sidebar' : 'Collapse sidebar'}" aria-expanded="${!mini}">${svg('collapse')}<span class="qf-nav-l">Collapse</span></button>`;
    side.querySelectorAll('[data-open]').forEach(b => { b.onclick = () => open(b.dataset.open); });
    wireTrack(side);
    $('qfCollapse').onclick = () => {
      const mini = !document.documentElement.classList.contains('qf-side-mini');
      document.documentElement.classList.toggle('qf-side-mini', mini);
      try { localStorage.setItem('qf.sideCollapsed', mini ? '1' : '0'); } catch { /* fine */ }
      paintNav();
    };
    // Phone: Today + the four groups.
    const groupBtn = gr => {
      const items = gr.items.filter(([i]) => visible(i));
      if (!items.length) return '';
      const on = gr.id === g.id && act !== 'modeHome';
      return `<button type="button" class="qf-tab-btn${on ? ' on' : ''}" data-group="${gr.id}" ${on ? 'aria-current="page"' : ''}>${svg(gr.icon, 22)}<span>${esc(gr.label)}</span></button>`;
    };
    // Today is a MAANG page; the HFT track has no Today tab to open.
    tabs.innerHTML = (visible('modeHome') ? `<button type="button" class="qf-tab-btn${act === 'modeHome' ? ' on' : ''}" data-open="modeHome" ${act === 'modeHome' ? 'aria-current="page"' : ''}>${svg('today', 22)}<span>Today</span></button>` : '') +
      GROUPS.map(groupBtn).join('');
    tabs.querySelectorAll('[data-open]').forEach(b => { b.onclick = () => open(b.dataset.open); });
    tabs.querySelectorAll('[data-group]').forEach(b => { b.onclick = () => openSheet(b.dataset.group); });
    if (keep) keepIn.querySelector(keep)?.focus({ preventScroll: true });
    window.QFDesign?.paintRail?.();
  }

  function openSheet(gid) {
    closeSheet();
    const gr = GROUPS.find(x => x.id === gid); if (!gr) return;
    const act = activeId();
    const back = document.createElement('div');
    back.id = 'qfSheet'; back.className = 'qf-sheet-back';
    back.innerHTML = `<div class="qf-sheet" role="dialog" aria-modal="true" aria-label="${esc(gr.label)}">
      <div class="qf-sheet-grip" aria-hidden="true"></div>
      <div class="qf-sheet-head"><h2>${esc(gr.label)}</h2>${trackToggle()}</div>
      ${gr.items.filter(([i]) => visible(i)).map(([id, label, ic]) => `<button type="button" class="qf-nav-item${id === act ? ' on' : ''}" data-open="${id}" ${enabled(id) ? '' : `aria-disabled="true"`}>
        ${svg(ic)}<span class="qf-nav-l">${esc(label)}${enabled(id) ? '' : `<small>${esc(why(id))}</small>`}</span></button>`).join('')}
    </div>`;
    document.body.appendChild(back);
    back.addEventListener('click', e => { if (e.target === back) closeSheet(); });
    back.addEventListener('keydown', e => {
      if (e.key === 'Escape') { closeSheet(); $('qfTabs')?.querySelector(`[data-group="${gid}"]`)?.focus(); }
      if (e.key === 'Tab') {   // keep focus inside the sheet
        const fs = [...back.querySelectorAll('button:not([aria-disabled])')];
        if (!fs.length) return;
        if (e.shiftKey && document.activeElement === fs[0]) { fs[fs.length - 1].focus(); e.preventDefault(); }
        else if (!e.shiftKey && document.activeElement === fs[fs.length - 1]) { fs[0].focus(); e.preventDefault(); }
      }
    });
    back.querySelectorAll('[data-open]').forEach(b => { b.onclick = () => open(b.dataset.open); });
    wireTrack(back, () => openSheet(gid));
    back.querySelector('.qf-nav-item:not([aria-disabled])')?.focus();
  }
  function closeSheet() { $('qfSheet')?.remove(); }
  // MAANG / HFT switch, shared by the sidebar, the phone sheets and the palette.
  const trackToggle = () => {
    const t = $('trackSel')?.value || 'maang';
    return `<div class="qf-track" role="group" aria-label="Track"><button type="button" data-track="maang" aria-pressed="${t === 'maang'}">MAANG</button><button type="button" data-track="hft" aria-pressed="${t === 'hft'}">HFT</button></div>`;
  };
  function setTrack(v) { const s = $('trackSel'); if (s && s.value !== v) { s.value = v; s.dispatchEvent(new Event('change')); } }
  function wireTrack(root, after) { root.querySelectorAll('[data-track]').forEach(b => { b.onclick = () => { setTrack(b.dataset.track); setTimeout(() => after?.(), 30); }; }); }
  Object.assign(window.QF, { groups: GROUPS, visible, activeId, enabled, setTrack, paintNav, open });

  // ------------------------------------------------------------- user menu ---
  function buildUserMenu() {
    const top = document.querySelector('.bar-top');
    if (!top || !me.user || $('qfUser')) return;
    const wrap = document.createElement('div');
    wrap.className = 'qf-user'; wrap.id = 'qfUser';
    const initials = (me.user.name || me.user.email).split(/\s+/).map(s => s[0]).join('').slice(0, 2).toUpperCase();
    // Hovering the initials says which account this is, without opening the menu.
    const via = me.user.provider === 'google' ? 'Google' : 'email and password';
    const who = `${me.user.name ? `${me.user.name} · ` : ''}${me.user.email} — signed in with ${via}`;
    wrap.innerHTML = `
      <button type="button" class="qf-avatar" id="qfUserBtn" aria-haspopup="true" aria-expanded="false" title="${esc(who)}" aria-label="Account menu for ${esc(who)}">${esc(initials)}</button>
      <div class="qf-menu" id="qfMenu" hidden>
        <div class="qf-menu-head"><b>${esc(me.user.name)}</b><span>${esc(me.user.email)}</span>
          <span class="qf-chip">${me.user.role === 'admin' ? 'Admin' : 'Member'}</span>
          <span class="qf-chip">${esc((me.user.plan || 'free').replace(/^./, c => c.toUpperCase()))}</span></div>
        <button type="button" data-act="target">Plans &amp; your week</button>
        <button type="button" data-act="plan">Your AI plan</button>
        <button type="button" data-act="password">Change password</button>
        <button type="button" data-act="track">Switch to ${($('trackSel')?.value || 'maang') === 'hft' ? 'MAANG' : 'HFT'} track</button>
        <button type="button" data-act="settings">Settings</button>
        <button type="button" data-act="logout">Sign out</button>
      </div>`;
    top.appendChild(wrap);
    const btn = $('qfUserBtn'), menu = $('qfMenu');
    btn.onclick = e => { e.stopPropagation(); menu.hidden = !menu.hidden; btn.setAttribute('aria-expanded', String(!menu.hidden)); };
    document.addEventListener('click', e => { if (!wrap.contains(e.target)) { menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); } });
    wrap.addEventListener('keydown', e => { if (e.key === 'Escape' && !menu.hidden) { menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); btn.focus(); } });
    // Every item closes the menu, and the button must say so too.
    menu.addEventListener('click', e => { if (e.target.closest('button')) btn.setAttribute('aria-expanded', 'false'); });
    menu.querySelector('[data-act=logout]').onclick = logout;
    menu.querySelector('[data-act=settings]').onclick = () => { menu.hidden = true; $('modeSettings')?.click(); };
    menu.querySelector('[data-act=target]').onclick = () => { menu.hidden = true; window.QFSprint?.plansModal?.('list'); };
    menu.querySelector('[data-act=plan]').onclick = () => { menu.hidden = true; window.PlanGate?.show(); };
    menu.querySelector('[data-act=password]').onclick = () => { menu.hidden = true; changePassword(); };
    menu.querySelector('[data-act=track]').onclick = e => {
      menu.hidden = true;
      const next = ($('trackSel')?.value || 'maang') === 'hft' ? 'maang' : 'hft';
      setTrack(next);
      e.target.textContent = `Switch to ${next === 'hft' ? 'MAANG' : 'HFT'} track`;
    };
    // The track can also change from the sidebar, palette or Settings: keep this label true.
    $('trackSel')?.addEventListener('change', () => {
      const b = menu.querySelector('[data-act=track]');
      if (b) b.textContent = `Switch to ${($('trackSel')?.value || 'maang') === 'hft' ? 'MAANG' : 'HFT'} track`;
    });
  }

  function changePassword() {
    window.QFDesign?.closeModal?.();
    const back = document.createElement('div');
    back.className = 'qf-modal-back'; back.id = 'qfModal';
    back.innerHTML = `<div class="qf-modal qf-narrow" role="dialog" aria-modal="true" aria-labelledby="qfPwT">
      <div class="qf-modal-head"><h2 id="qfPwT">Change password</h2><button type="button" class="qf-x" data-close aria-label="Close">✕</button></div>
      <form id="qfPw" novalidate>
        ${me.user.provider === 'google' ? '' : '<label class="qf-field"><span>Current password</span><input name="current" type="password" autocomplete="current-password" required></label>'}
        <label class="qf-field"><span>New password</span><input name="next" type="password" autocomplete="new-password" minlength="8" required><small>At least 8 characters. Other devices will be signed out.</small></label>
        <p class="qf-auth-err" id="qfPwErr" role="alert"></p>
        <div class="qf-m-act"><button type="submit" class="qf-b pri">Save password</button><button type="button" class="qf-b" data-close>Cancel</button></div>
      </form></div>`;
    document.body.appendChild(back);
    const close = () => { back.remove(); document.removeEventListener('keydown', esc); $('qfUserBtn')?.focus(); };
    const esc = e => { if (e.key === 'Escape') close(); };
    back.addEventListener('click', e => { if (e.target === back || e.target.closest('[data-close]')) close(); });
    document.addEventListener('keydown', esc);
    back.querySelector('input').focus();
    back.querySelector('#qfPw').onsubmit = async e => {
      e.preventDefault();
      const f = new FormData(e.target);
      const err = back.querySelector('#qfPwErr'), btn = e.target.querySelector('button[type=submit]');
      err.textContent = '';
      if (me.user.provider !== 'google' && !f.get('current')) { err.textContent = 'Enter your current password.'; return; }
      if (String(f.get('next') || '').length < 8) { err.textContent = 'Use a new password of at least 8 characters.'; return; }
      btn.disabled = true;
      let r, b;
      try {
        r = await rawFetch('/api/auth/password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
          body: JSON.stringify({ current: f.get('current') || '', next: f.get('next') }) });
        b = await r.json().catch(() => ({}));
      } catch { err.textContent = 'Network error. Check your connection.'; btn.disabled = false; return; }
      btn.disabled = false;
      if (!r.ok) { err.textContent = b.error || 'Could not change the password.'; return; }
      close(); window.QF.toast('Password changed. Other devices have been signed out.');
    };
  }

  // ------------------------------------------------------------- live bar ---
  const live = { judge: null, llm: null, tts: null, ms: null, ok: null, judgeDown: null };
  // The Coding tab reports what the judge actually did: a configured cookie is
  // not the same as LeetCode answering.
  window.QF.setJudge = (ok, reason) => { live.judgeDown = ok ? null : (reason || 'LeetCode unreachable'); paintBar(); };
  async function ping() {
    const t0 = performance.now();
    try {
      const r = await rawFetch('/api/status', { credentials: 'same-origin', cache: 'no-store' });
      live.ms = Math.round(performance.now() - t0);
      if (r.ok) { const b = await r.json(); live.judge = !!b.capabilities?.leetcode; live.llm = !!b.capabilities?.llm; live.tts = !!b.capabilities?.tts; live.ok = true; }
      else live.ok = r.status !== 401 ? false : live.ok;
    } catch { live.ok = false; live.ms = null; }
    paintBar();
  }
  const dot = (ok, label, title) => `<span class="qf-live-item ${ok === true ? 'ok' : ok === false ? 'bad' : 'idle'}" title="${esc(title)}">` +
    `<span class="qf-shape" aria-hidden="true">${ok === true ? '●' : ok === false ? '▲' : '○'}</span>${label}</span>`;

  function sessionBits() {
    const mode = document.body.dataset.mode;
    if (mode !== 'coding') return '';
    const t = $('timer')?.textContent || '';
    const running = $('stopBtn') && !$('stopBtn').disabled;
    const q = window.currentQuestion;
    let last = '';
    if (q && window.Attempts) {
      const a = window.Attempts.forQuestion(q.slug)[0];
      if (a) last = a.ok ? 'Last run: passed' : `Last run: ${a.verdict || 'failed'}`;
    }
    const ss = window.QF_SESSION;
    const phase = running && ss?.phase ? `<span class="qf-live-item qf-phase">${esc(ss.phase)}</span>` : '';
    const fc = running && ss?.firstCodeAt && ss?.startedAt ? `<span class="qf-live-item">first code ${Math.floor((ss.firstCodeAt - ss.startedAt) / 60000)}:${String(Math.floor((ss.firstCodeAt - ss.startedAt) / 1000) % 60).padStart(2, '0')}</span>` : '';
    const practice = !running && document.documentElement.dataset.coding !== 'interview';
    return `<span class="qf-live-item ${running ? 'rec' : 'idle'}"><span class="qf-shape" aria-hidden="true">${running ? '◉' : '◌'}</span>${running ? (ss?.realistic ? 'Mock live · no-run' : 'Mock live') : practice ? 'Practice' : 'Interview ready'}${practice ? '' : ` · ${esc(t)}`}</span>` + phase + fc +
      (last ? `<span class="qf-live-item">${esc(last)}</span>` : '');
  }

  function paintBar() {
    const bar = $('qfLive'); if (!bar) return;
    const days = window.QFSprint?.daysLeft?.();
    const tgt = window.QFSprint?.target?.() || me.user?.target;
    const saved = saveErr && saveWhy === 'syncing' ? '<span class="qf-live-item">Syncing with your other device…</span>' : saveErr ? `<span class="qf-live-item bad" title="${esc(saveWhy)}"><span class="qf-shape" aria-hidden="true">▲</span>Not saved — retrying${saveWhy ? ` (${esc(saveWhy).slice(0, 40)})` : ''}</span>`
      : dirty || inflight ? '<span class="qf-live-item idle"><span class="qf-shape" aria-hidden="true">○</span>Saving…</span>'
      : lastSaved ? `<span class="qf-live-item ok"><span class="qf-shape" aria-hidden="true">●</span>Saved ${lastSaved.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>` : '';
    // Phones hide the bar outside Coding; a failing save must still be seen.
    document.documentElement.classList.toggle('qf-save-bad', !!saveErr && saveWhy !== 'syncing');
    bar.innerHTML = `
      <span class="qf-live-tag">LIVE</span>
      ${sessionBits()}
      ${live.judgeDown || live.judge === false
        ? `<button type="button" class="qf-live-item bad qf-live-btn" id="qfJudgeFix" title="${esc(live.judgeDown || 'LeetCode cookie missing')}"><span class="qf-shape" aria-hidden="true">▲</span>Judge: ${esc(/cookie/i.test(live.judgeDown || 'cookie') ? 'cookie expired — fix' : 'unreachable')}</button>`
        : dot(live.judge, 'Judge', live.judge ? 'LeetCode judge configured' : 'Checking the judge…')}
      ${dot(live.llm, 'AI', live.llm ? 'Interviewer model ready' : 'Model not configured')}
      ${dot(live.tts, 'Voice', live.tts ? 'Speech ready' : 'Speech unavailable')}
      ${dot(live.ok, live.ms != null ? `${live.ms} ms` : 'Server', 'Server round trip')}
      <span class="qf-spacer"></span>
      ${saved}
      ${typeof days === 'number' && tgt ? `<span class="qf-live-item qf-count">${esc(tgt.company)} ${esc(tgt.level || '')} · ${days > 0 ? `${days} day${days === 1 ? '' : 's'} to go` : days === 0 ? 'Interview today' : 'Interview done'}</span>` : ''}`;
  }

  document.addEventListener('click', e => { if (e.target.closest('#qfJudgeFix')) $('modeSettings')?.click(); });
  function buildBar() {
    if ($('qfLive')) return;
    const bar = document.createElement('footer');
    bar.id = 'qfLive'; bar.setAttribute('aria-label', 'Live status'); bar.setAttribute('aria-live', 'off');
    document.body.appendChild(bar);
    paintBar(); ping();
    setInterval(ping, 20000);
    setInterval(paintBar, 1000);
  }

  // ------------------------------------------------------------------ boot ---
  function boot() {
    document.documentElement.classList.add('qf');
    buildNav();
    if (me.required && !me.user) { showAuth(me.firstUser ? 'signup' : 'signin'); return; }
    buildUserMenu();
    buildBar();
  }
  window.QF.paintBar = paintBar;
  // Small, polite notices: one at a time, read out by screen readers.
  window.QF.toast = (text, ms = 4200) => {
    let t = $('qfToast');
    if (!t) { t = document.createElement('div'); t.id = 'qfToast'; t.setAttribute('role', 'status'); t.setAttribute('aria-live', 'polite'); document.body.appendChild(t); }
    t.textContent = text; t.classList.add('show');
    clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), ms);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();

/* Videos play here, not on YouTube. Any link to a YouTube video anywhere in
 * the app (NeetCode walkthroughs, Google list, Home, Pro-Learn) opens a
 * player over the page; Esc or × closes it and you are where you were.
 * Cmd/Ctrl-click still opens YouTube in a new tab. */
(function () {
  const idOf = href => {
    try {
      const u = new URL(href, location.href);
      const h = u.hostname.replace(/^www\.|^m\./, '');
      if (h === 'youtu.be') return u.pathname.slice(1).split('/')[0] || null;
      if (h === 'youtube.com' || h === 'youtube-nocookie.com') {
        if (u.pathname === '/watch') return u.searchParams.get('v');
        const m = u.pathname.match(/^\/(?:embed|shorts|live)\/([\w-]{6,})/);
        return m ? m[1] : null;
      }
    } catch { /* not a URL */ }
    return null;
  };
  const startOf = href => {
    try { const t = new URL(href, location.href).searchParams.get('t'); return t ? parseInt(t, 10) || 0 : 0; } catch { return 0; }
  };
  let back = null, lastFocus = null;
  function close() {
    if (!back) return;
    back.remove(); back = null;
    document.removeEventListener('keydown', onKey, true);
    lastFocus?.focus?.();
  }
  function onKey(e) {
    if (!back) return;
    // A dialog opened on top of the video gets the key first.
    const m = document.getElementById('qfModal');
    if (m && (back.compareDocumentPosition(m) & Node.DOCUMENT_POSITION_FOLLOWING)) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (e.key === 'Tab') {
      // Keep focus inside the player (link, close button, video).
      const f = [...back.querySelectorAll('a[href], button, iframe')];
      if (!f.length) return;
      const i = f.indexOf(document.activeElement);
      if (i === -1 || (e.shiftKey && i === 0) || (!e.shiftKey && i === f.length - 1)) {
        e.preventDefault(); f[e.shiftKey ? f.length - 1 : 0].focus();
      }
    }
  }
  function play(id, title = 'Video', start = 0) {
    if (!/^[\w-]{6,20}$/.test(id || '')) return false;
    close();
    window.Voice?.stopSpeaking?.();
    lastFocus = document.activeElement;
    back = document.createElement('div');
    back.className = 'qf-vid-back';
    back.innerHTML = `<div class="qf-vid" role="dialog" aria-modal="true" aria-label="${title.replace(/"/g, '&quot;')}">
        <div class="qf-vid-bar"><span class="qf-vid-t"></span>
          <a class="qf-vid-out" href="https://www.youtube.com/watch?v=${id}${start ? `&t=${start}s` : ''}" target="_blank" rel="noopener" data-yt-out>Open on YouTube ↗</a>
          <button type="button" class="qf-vid-x" aria-label="Close video">×</button></div>
        <div class="qf-vid-frame"><iframe src="https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&modestbranding=1${start ? `&start=${start}` : ''}"
          title="" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>
      </div>`;
    back.querySelector('.qf-vid-t').textContent = title;
    back.querySelector('iframe').title = title;
    back.addEventListener('click', e => { if (e.target === back || e.target.closest('.qf-vid-x')) close(); });
    document.body.appendChild(back);
    document.addEventListener('keydown', onKey, true);
    back.querySelector('.qf-vid-x').focus();
    return true;
  }
  document.addEventListener('click', e => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest?.('a[href]');
    if (!a || a.hasAttribute('data-yt-out')) return;
    const id = idOf(a.href);
    if (!id) return;
    const title = a.dataset.title || (a.textContent || '').replace(/[▶↗]/g, '').trim() || 'Video';
    if (play(id, title, startOf(a.href))) e.preventDefault();
  }, true);
  window.QFVideo = { play, close, idOf };
})();
