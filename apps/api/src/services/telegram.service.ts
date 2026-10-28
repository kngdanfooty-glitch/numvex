import type { ClientSession } from 'mongoose';
import type { PlaceTelegramOrderBody, TelegramOrder as TelegramOrderView, TelegramOrderStatus, TelegramQuote, TelegramQuoteQuery, TelegramService } from '@numvexs/shared';
import { env } from '../config/env.js';
import { AppError, badRequest, conflict } from '../lib/errors.js';
import { TelegramOrder } from '../models/TelegramOrder.js';
import { inTx } from '../lib/tx.js';
import { User } from '../models/User.js';
import * as gramsubs from './telegram/gramsubs.js';
import { rates } from './settings.service.js';

/*
 * Telegram Premium and Stars. Same money rules as numbers, boost and eSIMs:
 *  - the price is worked out HERE from GramSubs' own price for this exact order, never taken from the page;
 *  - the wallet is charged first (atomically) and given back, once, if GramSubs refuses or the order fails;
 *  - the same request id twice is the same purchase;
 *  - if we can't tell whether GramSubs took the order (the connection dropped after we sent it), the money is HELD, not refunded:
 *    refunding then would hand out free Premium if the order did go through. Those orders are 'review' and are logged.
 */
const QUOTE_TTL = 60 * 1000;

/** Our price in kobo: GramSubs' dollar price x the naira rate, plus our markup. */
export const priceKobo = (usdCents: number) => Math.max(1, Math.round((usdCents / 100) * rates().usdNgnRate * (1 + rates().telegramMarkupPercent / 100) * 100));

const quotes = new Map<string, { at: number; data: gramsubs.RecipientQuote }>();

/** For tests: forget cached quotes. */
export const resetTelegramCache = () => quotes.clear();

/** Cached briefly: GramSubs allows 60 calls a minute for the whole key, and people re-check the same username. */
async function lookup(service: TelegramService, units: number, username: string, fresh = false) {
  const k = `${service}:${units}:${username.toLowerCase()}`;
  const hit = quotes.get(k);
  if (!fresh && hit && Date.now() - hit.at < QUOTE_TTL) return hit.data;
  const data = await gramsubs.recipient(service, units, username);
  quotes.set(k, { at: Date.now(), data });
  if (quotes.size > 500) for (const [key, v] of quotes) if (Date.now() - v.at > QUOTE_TTL) quotes.delete(key);
  return data;
}

export async function quote(q: TelegramQuoteQuery): Promise<TelegramQuote> {
  const r = await lookup(q.service, q.units, q.username);
  return { recipient: r.recipient, name: r.name, photo: r.photo, priceKobo: priceKobo(r.usdCents) };
}

export const toView = (o: InstanceType<typeof TelegramOrder>): TelegramOrderView => ({
  id: String(o._id),
  service: o.service as TelegramService,
  units: o.units,
  recipient: o.recipient,
  costKobo: o.costKobo,
  status: o.status as TelegramOrderStatus,
  createdAt: (o.createdAt as Date).toISOString(),
});

const refund = (userId: unknown, kobo: number, session?: ClientSession) => User.updateOne({ _id: userId }, { $inc: { balanceKobo: kobo } }, { session });

/** Mark an open order failed and give the money back. The status change is the lock: it only ever pays out once. */
export async function failAndRefund(orderId: unknown, from: TelegramOrderStatus[], reason: string) {
  // Mark failed, record the refund and pay it back as ONE step, so a crash can't leave the order failed with the money never returned.
  return inTx(async (session) => {
    const o = await TelegramOrder.findOneAndUpdate({ _id: orderId, status: { $in: from } }, { status: 'failed', failReason: reason }, { session });
    if (!o) return null;
    await TelegramOrder.updateOne({ _id: orderId }, { refundedKobo: o.costKobo }, { session });
    await refund(o.userId, o.costKobo, session);
    return o;
  });
}

export async function placeOrder(userId: string, body: PlaceTelegramOrderBody) {
  // The same purchase form twice (a double click, a retry) is the same purchase: hand back the first, charge nothing more.
  const existing = await TelegramOrder.findOne({ userId, requestId: body.requestId });
  if (existing) {
    if (existing.status === 'failed') throw conflict('order_failed', 'That purchase did not go through. Please try again.');
    return existing;
  }

  const user = await User.findById(userId);
  if (!user) throw badRequest('no_user', 'Please sign in again.');

  // A fresh look at the recipient and the price (not the cached one the page may be showing).
  const r = await lookup(body.service, body.units, body.username, true);
  const cost = priceKobo(r.usdCents);

  // Take the money and record the order as ONE step: both happen or neither does (a crash can't leave a charge with no order). The charge only
  // goes through if there's enough, in one atomic step, so two clicks can't overspend.
  let order;
  try {
    order = await inTx(async (session) => {
      const charged = await User.findOneAndUpdate({ _id: userId, balanceKobo: { $gte: cost } }, { $inc: { balanceKobo: -cost } }, { session });
      if (!charged) throw new AppError(402, 'insufficient_balance', 'Insufficient balance. Fund your wallet and try again.');
      const [created] = await TelegramOrder.create([{
        userId, requestId: body.requestId, service: body.service, units: body.units, username: body.username,
        recipient: r.recipient, recipientName: r.name ?? undefined, costKobo: cost, usdCents: r.usdCents,
      }], { session });
      return created!;
    });
  } catch (err) {
    if ((err as { code?: number }).code === 11000) return (await TelegramOrder.findOne({ userId, requestId: body.requestId }))!; // the other copy won (and our charge rolled back)
    throw err;
  }

  const result = await gramsubs.createOrder(body.service, body.units, body.username);

  if (result.kind === 'refused') {
    await failAndRefund(order._id, ['placing'], result.message);
    throw new AppError(409, 'order_refused', result.message);
  }

  if (result.kind === 'unknown') {
    await TelegramOrder.updateOne({ _id: order._id, status: 'placing' }, { status: 'review' });
    console.error(`[telegram] order ${order._id} (${body.service} x${body.units} to @${body.username}, ${cost} kobo) is in REVIEW: the supplier may or may not have taken it. Check the supplier dashboard, then refund or mark it delivered by hand.`);
    return (await TelegramOrder.findById(order._id))!;
  }

  if (result.usdCents > r.usdCents) {
    console.error(`[telegram] GramSubs charged ${result.usdCents} cents for order ${order._id} but quoted ${r.usdCents}: our price is now below cost for it`);
  }
  if (result.status === 'failed') {
    await failAndRefund(order._id, ['placing'], 'The supplier failed the order');
    throw new AppError(409, 'order_refused', 'The server could not deliver this order. You have not been charged.');
  }
  return (await TelegramOrder.findOneAndUpdate(
    { _id: order._id, status: 'placing' },
    { providerRef: result.ref, status: result.status, usdCents: result.usdCents || r.usdCents, mode: result.mode },
    { new: true },
  ))!;
}

export const listMine = (userId: string) => TelegramOrder.find({ userId }).sort({ createdAt: -1 }).limit(100);

/**
 * The telegram job: follows orders GramSubs has but has not delivered yet, and records the result (and any refund) in our database.
 * The page never asks GramSubs anything about an order: it reads what this writes.
 */
export async function settleTelegramOrders(): Promise<{ looked: number; settled: number }> {
  const open = await TelegramOrder.find({ status: 'processing', providerRef: { $exists: true } }).sort({ updatedAt: 1 }).limit(40);
  let settled = 0;
  for (const o of open) {
    try {
      const s = await gramsubs.orderStatus(o.providerRef!);
      if (!s) continue;
      if (s.status === 'delivered') {
        if ((await TelegramOrder.updateOne({ _id: o._id, status: 'processing' }, { status: 'delivered' })).modifiedCount) settled++;
      } else if (s.status === 'failed') {
        if (await failAndRefund(o._id, ['processing'], 'The supplier failed the order')) settled++;
      } else {
        await TelegramOrder.updateOne({ _id: o._id }, { $currentDate: { updatedAt: true } }); // look at the others first next time
      }
    } catch (err) {
      console.error(`[telegram job] could not check order ${o._id}:`, (err as Error).message);
    }
  }
  return { looked: open.length, settled };
}
