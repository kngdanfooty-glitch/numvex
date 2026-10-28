import { Router } from 'express';
import { historyQuerySchema } from '@numvexs/shared';
import { requireAuth } from '../middleware/auth.js';
import { listHistory } from '../services/history.service.js';

const router = Router();
router.use(requireAuth);

// My money history, newest first. Ask for the next page with `before` = the previous page's `nextBefore`.
router.get('/', async (req, res) => {
  const q = historyQuerySchema.parse(req.query);
  res.json(await listHistory(res.locals.userId, q.before ? new Date(q.before) : undefined, q.limit));
});

export default router;
