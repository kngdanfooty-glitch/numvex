import { Router } from 'express';
import { boostServerIdSchema, placeBoostOrderSchema, type BoostServerId } from '@numvexs/shared';
import { requireAuth } from '../middleware/auth.js';
import { spendLimiter } from '../middleware/rateLimit.js';
import * as boost from '../services/boost.service.js';
import * as orders from '../services/boostOrders.service.js';
import { assertServiceOn } from '../services/settings.service.js';

const router = Router();
router.use(requireAuth);

// One server per request: the page calls this for the server tab that is open (the first one, by default).
router.get('/servers/:server/catalog', async (req, res) => {
  const server = boostServerIdSchema.parse(req.params.server) as BoostServerId;
  res.json(await boost.getBoostCatalog(server));
});

// Place an order on one server. The price is worked out here, from the panel's own catalogue.
router.post('/servers/:server/orders', spendLimiter, async (req, res) => {
  assertServiceOn('boost', req.params.server);
  const server = boostServerIdSchema.parse(req.params.server) as BoostServerId;
  const body = placeBoostOrderSchema.parse(req.body);
  res.status(201).json({ order: orders.toView(await orders.placeOrder(res.locals.userId, server, body)) });
});

// The Orders page. Reads our database only: the boost job is what asks the panels.
router.get('/orders', async (_req, res) => {
  res.json({ orders: (await orders.listMine(res.locals.userId)).map(orders.toView) });
});

export default router;
