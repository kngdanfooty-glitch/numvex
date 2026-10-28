import { Router } from 'express';
import { z } from 'zod';
import { placeEsimOrderSchema } from '@numvexs/shared';
import { esimServers } from '../lib/servers.js';
import { requireAuth } from '../middleware/auth.js';
import { spendLimiter } from '../middleware/rateLimit.js';
import * as esim from '../services/esim.service.js';
import { assertServiceOn } from '../services/settings.service.js';

const router = Router();
router.use(requireAuth);

const serverOf = (value: string) => esimServers.provider(value);

// One server per request: the page calls these for the server in the dropdown (the first one, by default).
router.get('/servers/:server/countries', async (req, res) => {
  res.json({ countries: await esim.listCountries(serverOf(req.params.server)) });
});

router.get('/servers/:server/plans', async (req, res) => {
  const { country } = z.object({ country: z.string().trim().min(1).max(64) }).parse(req.query);
  res.json({ plans: await esim.listPlans(serverOf(req.params.server), country) });
});

// Buy one plan. The price is worked out here, from the provider's own plan list.
router.post('/servers/:server/orders', spendLimiter, async (req, res) => {
  assertServiceOn('esim', req.params.server);
  const body = placeEsimOrderSchema.parse(req.body);
  res.status(201).json({ order: esim.toView(await esim.placeOrder(res.locals.userId, serverOf(req.params.server), body), true) });
});

// My eSIMs (the list leaves out the install data; open one to get it).
router.get('/orders', async (_req, res) => {
  res.json({ orders: (await esim.listMine(res.locals.userId)).map((o) => esim.toView(o)) });
});

router.get('/orders/:id', async (req, res) => {
  res.json({ order: esim.toView(await esim.getMine(res.locals.userId, req.params.id), true) });
});

export default router;
