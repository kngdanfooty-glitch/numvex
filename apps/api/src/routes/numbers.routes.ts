import { Router } from 'express';
import { z } from 'zod';
import { numberServerIdSchema, type NumberServerId } from '@numvexs/shared';
import { requireAuth } from '../middleware/auth.js';
import { spendLimiter } from '../middleware/rateLimit.js';
import { AppError } from '../lib/errors.js';
import * as numbers from '../services/numbers.service.js';
import { assertServiceOn } from '../services/settings.service.js';

const router = Router();
router.use(requireAuth);

// `country` (for servers whose prices depend on it) and `tier` (the price the buyer picked) are optional.
const serviceBody = z.object({
  service: z.string().trim().min(1).max(64),
  country: z.string().trim().min(1).max(32).optional(),
  tier: z.string().trim().min(1).max(32).optional(),
});

// Only the servers whose buying is built. The others still list their catalogue.
function buyable(server: string): NumberServerId {
  const id = numberServerIdSchema.parse(server) as NumberServerId;
  if (!numbers.isBuyable(id)) throw new AppError(501, 'server_not_ready', 'Buying from this server is not available yet.');
  return id;
}

const publicActivation = (a: Awaited<ReturnType<typeof numbers.getMine>>) => ({
  id: String(a._id),
  server: a.server,
  number: a.number,
  service: a.service,
  country: a.country,
  costKobo: a.costKobo,
  status: a.status,
  code: a.code ?? null,
  expiresAt: a.expiresAt,
  createdAt: a.createdAt,
});

// One server per request: the page calls this when that server's tab is opened.
router.get('/servers/:server/catalog', async (req, res) => {
  const server = numberServerIdSchema.parse(req.params.server) as NumberServerId;
  res.json(await numbers.getCatalog(server));
});

router.get('/servers/:server/price', async (req, res) => {
  const server = buyable(req.params.server);
  const { service, country } = serviceBody.parse(req.query);
  res.json(await numbers.quote(server, service, { country }));
});

router.post('/servers/:server/buy', spendLimiter, async (req, res) => {
  assertServiceOn('numbers', req.params.server); // switched off in the admin panel? say so, charge nothing
  const server = buyable(req.params.server);
  const { service, country, tier } = serviceBody.parse(req.body);
  res.status(201).json({ activation: publicActivation(await numbers.buy(res.locals.userId, server, service, { country, tier })) });
});

// The Orders page. Must come before '/activations/:id' so "activations" alone isn't read as an id.
router.get('/activations', async (_req, res) => {
  res.json({ activations: (await numbers.listMine(res.locals.userId)).map(publicActivation) });
});

router.get('/activations/:id', async (req, res) => {
  res.json({ activation: publicActivation(await numbers.getMine(res.locals.userId, req.params.id)) });
});

router.post('/activations/:id/done', spendLimiter, async (req, res) => {
  res.json({ activation: publicActivation(await numbers.markDone(res.locals.userId, req.params.id)) });
});

router.post('/activations/:id/cancel', spendLimiter, async (req, res) => {
  const { activation, refused } = await numbers.cancel(res.locals.userId, req.params.id);
  res.json({ activation: publicActivation(activation), refused });
});

export default router;
