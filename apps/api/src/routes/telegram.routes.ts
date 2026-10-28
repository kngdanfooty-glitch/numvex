import { Router } from 'express';
import { placeTelegramOrderSchema, telegramQuoteSchema } from '@numvexs/shared';
import { requireAuth } from '../middleware/auth.js';
import { spendLimiter } from '../middleware/rateLimit.js';
import * as telegram from '../services/telegram.service.js';
import { assertServiceOn } from '../services/settings.service.js';

const router = Router();
router.use(requireAuth);

// Who a username is, and what the order costs. Nothing is charged.
router.get('/quote', async (req, res) => {
  res.json({ quote: await telegram.quote(telegramQuoteSchema.parse(req.query)) });
});

// Buy. The price is worked out here, from GramSubs' own price for this exact order.
router.post('/orders', spendLimiter, async (req, res) => {
  assertServiceOn('telegram');
  const order = await telegram.placeOrder(res.locals.userId, placeTelegramOrderSchema.parse(req.body));
  res.status(201).json({ order: telegram.toView(order) });
});

// My Telegram orders (reads our database only; the telegram job is what asks GramSubs).
router.get('/orders', async (_req, res) => {
  res.json({ orders: (await telegram.listMine(res.locals.userId)).map(telegram.toView) });
});

export default router;
