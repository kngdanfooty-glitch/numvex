import type { ClientSession } from 'mongoose';
import type { BoostOrder as BoostOrderView, BoostOrderStatus, BoostServerId, PlaceBoostOrderBody } from '@numvexs/shared';
import { AppError, badRequest, conflict, notFound } from '../lib/errors.js';
import { isBusy, isUnreachable } from '../lib/providerFetch.js';
import { BoostOrder } from '../models/BoostOrder.js';
import { inTx } from '../lib/tx.js';
import { User } from '../models/User.js';
import { getBoostCatalog, mapPanelStatus, PanelError, panelAdd, panelStatuses } from './boost.service.js';

/*
 * Placing a boost order, and following it. Money rules (same as numbers):
 *  - the price is worked out HERE from the panel's catalogue, never taken from the page;
 *  - the wallet is charged first (atomically) and given back if the panel refuses or can't be reached;
 *  - a refund is claimed by flipping the order's state in ONE atomic update first, so it can only happen once.
 */

const OPEN = ['pending', 'in_progress'] as const;

/** Whole kobo: quantity x (price per 1,000) / 1,000, at least 1. */
export const orderCostKobo = (quantity: number, ratePer1kKobo: number) => Math.max(1, Math.round((quantity * ratePer1kKobo) / 1000));

export const toView = (o: InstanceType<typeof BoostOrder>): BoostOrderView => ({
  id: String(o._id),
  server: o.server as BoostServerId,
  serviceName: o.serviceName,
  link: o.link,
  quantity: o.quantity,
  costKobo: o.costKobo,
  refundedKobo: o.refundedKobo ?? 0,
  status: o.status as BoostOrderStatus,
  panelStatus: o.panelStatus ?? null,
  startCount: o.startCount ?? null,
  remains: o.remains ?? null,
  createdAt: (o.createdAt as Date).toISOString(),
});

const refund = (userId: unknown, kobo: number, session?: ClientSession) => User.updateOne({ _id: userId }, { $inc: { balanceKobo: kobo } }, { session });

/** What the panel said when it refused an order, as something the user can act on. */
function refusal(panelMessage: string): AppError {
  const m = panelMessage.toLowerCase();
  if (/fund|balance|credit/.test(m)) {
    // OUR panel account is out of money: loud for us, plain for the user.
    console.error(`[boost] a panel refused an order because our balance is too low: ${panelMessage}`);
    return new AppError(503, 'server_unavailable', 'This server is temporarily unavailable. Try another server.');
  }
  if (/active order|wait until|already/.test(m)) return conflict('order_in_progress', 'This link already has an order in progress on this server. Wait until it finishes, or use another server.');
  if (/link|url/.test(m)) return badRequest('invalid_link', "The server doesn't accept that link for this service. Check it and try again.");
  if (/quantity|minimum|maximum|min|max/.test(m)) return badRequest('invalid_quantity', "The server doesn't accept that quantity for this service.");
  if (/service/.test(m)) return new AppError(409, 'service_unavailable', 'That service is not available right now. Try another one.');
  return new AppError(409, 'order_refused', 'The server could not place this order. Try again, or use another server.');
}

export async function placeOrder(userId: string, server: BoostServerId, body: PlaceBoostOrderBody) {
  // The same order form twice (a double click, a retry) is the same order: hand back the first one, charge nothing more.
  const existing = await BoostOrder.findOne({ userId, requestId: body.requestId });
  if (existing) {
    if (existing.status === 'failed') throw conflict('order_failed', 'That order was not placed. Please submit it again.');
    return existing;
  }

  const catalog = await getBoostCatalog(server);
  let service;
  for (const p of catalog.platforms) for (const c of p.categories) service ??= c.services.find((s) => s.id === body.service);
  if (!service) throw notFound('service_not_found', 'That service is not available on this server.');
  if (body.quantity < service.min) throw badRequest('invalid_quantity', `Minimum quantity is ${service.min.toLocaleString('en-US')}.`);
  if (body.quantity > service.max) throw badRequest('invalid_quantity', `Maximum quantity is ${service.max.toLocaleString('en-US')}.`);
  const costKobo = orderCostKobo(body.quantity, service.ratePer1kKobo);

  // Take the money and record the order as ONE step: both happen or neither does (a crash can't leave a charge with no order). The charge only
  // goes through if there's enough, in one atomic step, so two clicks can't overspend.
  let order;
  try {
    order = await inTx(async (session) => {
      const charged = await User.findOneAndUpdate({ _id: userId, balanceKobo: { $gte: costKobo } }, { $inc: { balanceKobo: -costKobo } }, { session });
      if (!charged) throw new AppError(402, 'insufficient_balance', 'Insufficient balance. Fund your wallet and try again.');
      const [created] = await BoostOrder.create([{
        userId, requestId: body.requestId, server, serviceId: service.id, serviceName: service.name, link: body.link, quantity: body.quantity, costKobo,
      }], { session });
      return created!;
    });
  } catch (err) {
    // Two copies of the same form raced and the other one won (its charge rolled back with it): give back the winner's order.
    if ((err as { code?: number }).code === 11000) return (await BoostOrder.findOne({ userId, requestId: body.requestId }))!;
    throw err;
  }

  try {
    const panelOrderId = await panelAdd(server, { service: service.id, link: body.link, quantity: body.quantity });
    return (await BoostOrder.findByIdAndUpdate(order._id, { panelOrderId, status: 'pending', panelStatus: 'Pending' }, { new: true }))!;
  } catch (err) {
    // Nothing was placed: mark it failed and give the money back, exactly once.
    await inTx(async (session) => {
      const failed = await BoostOrder.findOneAndUpdate({ _id: order._id, status: 'placing' }, { status: 'failed', refundedKobo: costKobo }, { session });
      if (failed) await refund(userId, costKobo, session);
    });
    throw err instanceof PanelError ? refusal(err.panelMessage) : err;
  }
}

export async function listMine(userId: string) {
  return BoostOrder.find({ userId, status: { $ne: 'placing' } }).sort({ createdAt: -1 }).limit(100);
}

/**
 * Ask each panel about every open order (up to 100 per request) and record what it says. A cancelled order is refunded
 * in full; a partial one for the part that was not delivered. Refunds are claimed atomically, so they happen once.
 */
export async function settleBoostOrders(): Promise<{ looked: number; settled: number }> {
  const open = await BoostOrder.find({ status: { $in: OPEN }, panelOrderId: { $exists: true } }).sort({ lastCheckedAt: 1 }).limit(300);
  let settled = 0;

  const byServer = new Map<BoostServerId, typeof open>();
  for (const o of open) byServer.set(o.server as BoostServerId, [...(byServer.get(o.server as BoostServerId) ?? []), o]);

  for (const [server, orders] of byServer) {
    for (let i = 0; i < orders.length; i += 100) {
      const batch = orders.slice(i, i + 100);
      let answers;
      try {
        answers = await panelStatuses(server, batch.map((o) => o.panelOrderId!));
      } catch (err) {
        if (isUnreachable(err) || isBusy(err)) break; // this panel is down or says slow down: leave its orders for next time
        console.error(`[boost job] ${server} status check failed:`, err instanceof Error ? err.message : err);
        break;
      }
      for (const order of batch) {
        const a = answers[order.panelOrderId!];
        if (!a) continue;
        if ('error' in a) {
          console.error(`[boost job] ${server} does not know order ${order.panelOrderId}: ${a.error}`);
          continue;
        }
        if (await applyStatus(order, a)) settled++;
      }
    }
  }
  return { looked: open.length, settled };
}

/** Record one answer. Returns true when the order reached its end (completed, partial or cancelled). */
async function applyStatus(order: InstanceType<typeof BoostOrder>, a: { status: string; remains: number | null; startCount: number | null }) {
  const mapped = mapPanelStatus(a.status);
  const facts = { panelStatus: a.status, lastCheckedAt: new Date(), ...(a.remains !== null ? { remains: a.remains } : {}), ...(a.startCount !== null ? { startCount: a.startCount } : {}) };
  const stillOpen = { _id: order._id, status: { $in: OPEN } };

  if (mapped === 'pending' || mapped === 'in_progress') {
    await BoostOrder.updateOne(stillOpen, { ...facts, status: mapped });
    return false;
  }
  if (mapped === 'completed') {
    await BoostOrder.updateOne(stillOpen, { ...facts, status: 'completed', remains: 0 });
    return true;
  }

  // canceled, or partial: work out what goes back, claim it in the same atomic step, then credit the wallet.
  let back = order.costKobo;
  let status: BoostOrderStatus = 'canceled';
  if (mapped === 'partial') {
    const remains = Math.min(Math.max(a.remains ?? 0, 0), order.quantity);
    if (remains <= 0) {
      await BoostOrder.updateOne(stillOpen, { ...facts, status: 'completed' }); // "partial" with nothing left over: all delivered
      return true;
    }
    status = remains >= order.quantity ? 'canceled' : 'partial';
    back = Math.min(order.costKobo, Math.floor((order.costKobo * remains) / order.quantity));
  }
  // Claim and credit as ONE step: a crash between the two can't leave an order marked refunded with the money never paid.
  await inTx(async (session) => {
    const claimed = await BoostOrder.findOneAndUpdate({ ...stillOpen, refundedKobo: 0 }, { ...facts, status, refundedKobo: back }, { session });
    if (claimed && back > 0) await refund(order.userId, back, session);
  });
  return true;
}
