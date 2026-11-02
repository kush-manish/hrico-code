/**
 * Catches the 402 a plan-gated AI call returns (see server/middleware.js
 * requireAi) and shows what's locked and why, instead of a silent failure.
 * Loads after qf-shell.js, which already wraps window.fetch for the 401
 * sign-out case; this wraps whatever is there, so both compose.
 */
(function () {
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const prevFetch = window.fetch.bind(window);
  let showing = false; // one popup at a time — a burst of calls should not stack modals

  window.fetch = async function (...args) {
    const res = await prevFetch(...args);
    if (res.status === 402 && !showing) {
      res.clone().json().then(b => { if (b && b.code === 'plan_required') openUpsell(b); }).catch(() => {});
    }
    return res;
  };

  async function fetchCatalog() {
    try {
      const r = await prevFetch('/api/plan/catalog');
      return r.ok ? r.json() : null;
    } catch { return null; }
  }

  async function requestUpgrade(plan, btn) {
    btn.disabled = true;
    try {
      const r = await prevFetch('/api/plan/request', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan }),
      });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) { btn.disabled = false; window.QF?.toast?.(b.error || 'Could not send the request.'); return; }
      window.QF?.toast?.(`Asked the admin to move you to ${esc(b.request.toPlan)}.`);
      closeUpsell();
    } catch {
      btn.disabled = false;
    }
  }

  function planRows(catalog) {
    return catalog.plans.map(p => {
      const mine = p.id === catalog.mine;
      const pending = catalog.pending && catalog.pending.toPlan === p.id;
      const locked = p.order < catalog.plans.find(x => x.id === catalog.mine).order;
      let action = '';
      if (mine) action = '<span class="qf-chip">Your plan</span>';
      else if (pending) action = '<span class="qf-chip">Request pending</span>';
      else if (!locked) action = `<button type="button" class="ghost" data-request="${esc(p.id)}">Request this plan</button>`;
      return `<div class="st-role">
        <div>
          <div class="st-label">${esc(p.label)}${p.aiAccess ? ' · AI access' : ''}</div>
          <div class="st-hint">${esc(p.blurb)}</div>
        </div>
        <div class="st-pick">${action}</div>
      </div>`;
    }).join('');
  }

  async function openUpsell(body) {
    showing = true;
    window.QFDesign?.closeModal?.();
    const catalog = await fetchCatalog();
    const back = document.createElement('div');
    back.className = 'qf-modal-back'; back.id = 'qfPlanModal';
    back.innerHTML = `<div class="qf-modal" role="dialog" aria-modal="true" aria-labelledby="qfPlanT">
      <div class="qf-modal-head"><h2 id="qfPlanT">This needs AI access</h2><button type="button" class="qf-x" data-close aria-label="Close">✕</button></div>
      <p class="qf-hint">You're on <strong>${esc(body.planLabel || 'Free')}</strong>${body.pending ? ' — an upgrade request is already pending.' : '.'} Raising a request sends it to the admin, who approves or declines it.</p>
      <div id="qfPlanRows">${catalog ? planRows(catalog) : '<p class="st-hint">Could not load the plan list.</p>'}</div>
    </div>`;
    document.body.appendChild(back);
    const close = () => { back.remove(); document.removeEventListener('keydown', esc2); showing = false; };
    const esc2 = e => { if (e.key === 'Escape') close(); };
    back.addEventListener('click', e => { if (e.target === back || e.target.closest('[data-close]')) close(); });
    document.addEventListener('keydown', esc2);
    back.querySelectorAll('[data-request]').forEach(btn => {
      btn.onclick = () => requestUpgrade(btn.dataset.request, btn);
    });
  }
  function closeUpsell() { $('qfPlanModal')?.remove(); showing = false; }

  window.PlanGate = { show: () => openUpsell({ planLabel: null, pending: false }) };
})();
