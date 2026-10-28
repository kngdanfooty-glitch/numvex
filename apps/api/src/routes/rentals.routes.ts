import { Router } from 'express';
import { z } from 'zod';
import { extendRentalSchema, placeRentalSchema } from '@numvexs/shared';
import { rentalServers } from '../lib/servers.js';
import { requireAuth } from '../middleware/auth.js';
import { spendLimiter } from '../middleware/rateLimit.js';
import * as rentals from '../services/rentals.service.js';
import { assertServiceOn } from '../services/settings.service.js';

const router = Router();
router.use(requireAuth);

const serverOf = (value: string) => rentalServers.provider(value);

router.get('/servers/:server/countries', async (req, res) => {
  res.json({ countries: await rentals.listCountries(serverOf(req.params.server)) });
});

router.get('/servers/:server/options', async (req, res) => {
  const { country } = z.object({ country: z.string().trim().min(1).max(16) }).parse(req.query);
  res.json({ options: await rentals.listOptions(serverOf(req.params.server), country) });
});

router.post('/servers/:server/rentals', spendLimiter, async (req, res) => {
  assertServiceOn('rentals', req.params.server);
  const body = placeRentalSchema.parse(req.body);
  res.status(201).json({ rental: rentals.toView(await rentals.rent(res.locals.userId, serverOf(req.params.server), body)) });
});

router.get('/rentals', async (_req, res) => {
  res.json({ rentals: (await rentals.listMine(res.locals.userId)).map((r) => rentals.toView(r)) });
});

router.get('/rentals/:id', async (req, res) => {
  res.json({ rental: rentals.toView(await rentals.getMine(res.locals.userId, req.params.id), true) });
});

router.post('/rentals/:id/refresh', spendLimiter, async (req, res) => {
  res.json({ rental: rentals.toView(await rentals.refreshMine(res.locals.userId, req.params.id), true) });
});

router.post('/rentals/:id/extend', spendLimiter, async (req, res) => {
  const rental = await rentals.getMine(res.locals.userId, req.params.id);
  assertServiceOn('rentals', rentalServers.publicIdOrRetired(rental.server));
  const body = extendRentalSchema.parse(req.body);
  res.json({ rental: rentals.toView(await rentals.extend(res.locals.userId, req.params.id, body), true) });
});

export default router;
