import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { accountLimiter } from '../middleware/rateLimit.js';
import * as wallet from '../services/wallet.service.js';
import { assertServiceOn } from '../services/settings.service.js';

const router = Router();
router.use(requireAuth);

// My static bank account, or null when I haven't made one yet.
router.get('/account', async (_req, res) => {
  res.json({ account: await wallet.getAccount(res.locals.userId) });
});

// Make it (once). Asking again just returns the same account. No body: the name comes from the user's username (a stale page that still sends names is simply ignored).
router.post('/account', accountLimiter, async (req, res) => {
  assertServiceOn('deposits'); // new account numbers can be paused; money already sent to an account is still credited
  res.status(201).json({ account: await wallet.createAccount(res.locals.userId) });
});

// Bank transfers that reached my wallet.
router.get('/deposits', async (_req, res) => {
  res.json({ deposits: await wallet.listDeposits(res.locals.userId) });
});

export default router;
