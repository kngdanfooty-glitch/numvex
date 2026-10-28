import { Router } from 'express';
import {
  type AdminMe,
  addAdminSchema,
  adjustWalletSchema,
  resolveTelegramSchema,
  auditQuerySchema,
  creditDepositSchema,
  depositListQuerySchema,
  financeQuerySchema,
  orderListQuerySchema,
  saveServicesSchema,
  savePricingSchema,
  suspendSchema,
  updateAdminSchema,
  userListQuerySchema,
} from '@numvexs/shared';
import { requireAdmin, requirePermission, requireSuperAdmin } from '../middleware/admin.js';
import { requireAuth } from '../middleware/auth.js';
import * as admin from '../services/admin.service.js';
import * as panel from '../services/adminPanel.service.js';
import * as settings from '../services/adminSettings.service.js';
import { rates } from '../services/settings.service.js';
import * as team from '../services/team.service.js';

const router = Router();
router.use(requireAuth, requireAdmin); // signed in, AND an admin right now (checked in the database)

// Who am I, and which sections may I open? (The menu is built from this; the server still checks every call.)
router.get('/me', (_req, res) => {
  res.json({ admin: res.locals.admin });
});

const section = requirePermission;
const id = (p: string | string[] | undefined) => (Array.isArray(p) ? p[0]! : p!);

/* ---- dashboard ---- */
router.get('/dashboard', section('dashboard'), async (_req, res) => {
  // Money totals are for people who may open Finance; a support agent sees counts only.
  res.json(await panel.dashboard((res.locals.admin as AdminMe).permissions.includes('reports')));
});

/* ---- users ---- */
router.get('/users', section('users'), async (req, res) => {
  res.json(await panel.listUsers(userListQuerySchema.parse(req.query)));
});
router.get('/users/:id', section('users'), async (req, res) => {
  res.json({ user: await panel.userDetail(id(req.params.id)) });
});
router.post('/users/:id/suspend', section('users'), async (req, res) => {
  res.json({ user: await panel.setSuspended(res.locals.userId, id(req.params.id), true, suspendSchema.parse(req.body).reason) });
});
router.post('/users/:id/unsuspend', section('users'), async (req, res) => {
  res.json({ user: await panel.setSuspended(res.locals.userId, id(req.params.id), false, suspendSchema.parse(req.body).reason) });
});

/* ---- wallet & deposits ---- */
router.get('/deposits', section('wallet'), async (req, res) => {
  res.json(await panel.listDeposits(depositListQuerySchema.parse(req.query)));
});
router.get('/deposits/unmatched', section('wallet'), async (_req, res) => {
  res.json({ deposits: await admin.listUnmatchedDeposits() });
});
router.post('/deposits/:id/credit', section('wallet'), async (req, res) => {
  res.json(await admin.creditUnmatchedDeposit(res.locals.userId, id(req.params.id), creditDepositSchema.parse(req.body)));
});
router.post('/wallet/adjust', section('wallet'), async (req, res) => {
  res.json(await admin.adjustWallet(res.locals.userId, adjustWalletSchema.parse(req.body)));
});

/* ---- orders ---- */
router.get('/telegram/review', section('orders'), async (_req, res) => {
  res.json({ orders: await admin.listReviewTelegram() });
});

router.post('/telegram/:id/resolve', section('wallet'), async (req, res) => {
  res.json(await admin.resolveTelegram(res.locals.userId, id(req.params.id), resolveTelegramSchema.parse(req.body)));
});

router.get('/orders', section('orders'), async (req, res) => {
  res.json(await panel.listOrders(orderListQuerySchema.parse(req.query)));
});

/* ---- finance ---- */
router.get('/finance', section('reports'), async (req, res) => {
  res.json(await panel.finance(financeQuerySchema.parse(req.query).days));
});

/* ---- pricing ---- */
router.get('/pricing', section('prices'), (_req, res) => {
  res.json({ pricing: rates() });
});
router.put('/pricing', section('prices'), async (req, res) => {
  const body = savePricingSchema.parse(req.body);
  res.json({ pricing: await settings.updatePricing(res.locals.userId, body.pricing, body.reason) });
});

/* ---- services & settings ---- */
router.get('/services', section('settings'), (_req, res) => {
  res.json(settings.servicesView());
});
router.put('/services', section('settings'), async (req, res) => {
  const body = saveServicesSchema.parse(req.body);
  res.json(await settings.updateServices(res.locals.userId, body.services, body.reason));
});

/* ---- admin team & audit log: super admin only ---- */
router.get('/team', requireSuperAdmin, async (_req, res) => {
  res.json({ team: await team.listTeam() });
});
router.post('/team', requireSuperAdmin, async (req, res) => {
  res.status(201).json({ member: await team.addAdmin(res.locals.userId, addAdminSchema.parse(req.body)) });
});
router.patch('/team/:id', requireSuperAdmin, async (req, res) => {
  res.json({ member: await team.updateAdmin(res.locals.userId, id(req.params.id), updateAdminSchema.parse(req.body)) });
});
router.delete('/team/:id', requireSuperAdmin, async (req, res) => {
  await team.revokeAdmin(res.locals.userId, id(req.params.id));
  res.json({ ok: true });
});
router.get('/audit', requireSuperAdmin, async (req, res) => {
  const q = auditQuerySchema.parse(req.query);
  res.json(await panel.listAudit(q.module, q.page, q.limit));
});

export default router;
