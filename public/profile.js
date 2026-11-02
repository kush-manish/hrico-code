/* The candidate profile: what the resume upload extracted, kept in this
 * browser only, and sent along with interview requests when enabled so the
 * interviewers ask about the real CV and the watched candidate is you. */
window.Profile = (function () {
  const KEY = 'candidateProfile';
  function read() {
    try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; }
  }
  function write(v) {
    try { if (v) localStorage.setItem(KEY, JSON.stringify(v)); else localStorage.removeItem(KEY); } catch { /* private mode */ }
  }
  const get = () => read()?.profile || null;
  const enabled = () => { const r = read(); return !!(r?.profile) && r.enabled !== false; };
  const set = (profile, on = true) => write(profile ? { profile, enabled: on, savedAt: Date.now() } : null);
  const enable = on => { const r = read(); if (r?.profile) write({ ...r, enabled: !!on }); };
  const clear = () => write(null);
  /** What to send with a request: the profile when enabled, else undefined. */
  const active = () => (enabled() ? get() : undefined);
  const firstName = () => (get()?.name || '').split(' ')[0] || '';
  return { get, set, enable, enabled, clear, active, firstName };
})();
