/**
 * Plan catalog, self-service "raise a request", and the admin queue that
 * approves or declines them. Mounted under /api/plan; everything here sits
 * behind the normal session gate in routes/auth.js (gate runs before every
 * router in app.js), so req.user is always a signed-in account.
 */
import * as auth from '../auth.js';
import * as plans from '../plans.js';
import { readLimit, wrap } from '../middleware.js';

const adminOnly = (req, res, next) => (req.user?.role === 'admin'
  ? next()
  : res.status(403).json({ error: 'Admin only.', code: 'forbidden' }));

export function mount(app) {
  app.get('/api/plan/catalog', readLimit, wrap(async (req, res) => {
    res.json({
      plans: Object.values(plans.PLANS),
      mine: plans.planOf(req.user),
      pending: plans.pendingFor(req.user.id),
    });
  }));

  app.post('/api/plan/request', readLimit, wrap(async (req, res) => {
    try {
      const request = plans.createRequest(req.user, String(req.body?.plan || ''));
      res.status(201).json({ request });
    } catch (err) {
      if (err instanceof plans.PlanError) return res.status(err.status).json({ error: err.message, code: err.code });
      throw err;
    }
  }));

  app.get('/api/plan/requests', readLimit, adminOnly, wrap(async (req, res) => {
    const all = plans.listRequests().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const status = req.query.status;
    res.json({ requests: status ? all.filter(r => r.status === status) : all });
  }));

  const decide = decision => async (req, res) => {
    try {
      const request = plans.decideRequest(req.params.id, decision, req.user);
      if (decision === 'approved') auth.setPlan(request.userId, request.toPlan);
      res.json({ request });
    } catch (err) {
      if (err instanceof plans.PlanError) return res.status(err.status).json({ error: err.message, code: err.code });
      throw err;
    }
  };
  app.post('/api/plan/requests/:id/approve', readLimit, adminOnly, wrap(decide('approved')));
  app.post('/api/plan/requests/:id/decline', readLimit, adminOnly, wrap(decide('declined')));
}
