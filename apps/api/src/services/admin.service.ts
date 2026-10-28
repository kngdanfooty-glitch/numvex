import type { AdjustWalletBody, CreditDepositBody, ResolveTelegramBody, ReviewTelegramOrder, UnmatchedDeposit } from '@numvexs/shared';
import type { Types } from 'mongoose';
import { conflict, notFound } from '../lib/errors.js';
import { AdminAction } from '../models/AdminAction.js';
import { isValidObjectId } from 'mongoose';
import { inTx } from '../lib/tx.js';
import { TelegramOrder } from '../models/TelegramOrder.js';
import { failAndRefund } from './telegram.service.js';
import { User } from '../models/User.js';
import { WalletDeposit } from '../models/WalletDeposit.js';

/*
 * The cases that need a person. Each action:
 *  - needs a written reason;
 *  - changes the thing's status FIRST with an atomic check (so two clicks, or two admins, can't do it twice), then moves the money;
 *  - is written to the audit log.
 */
const emailOrName = (who: string) => who.trim().toLowerCase();

async function findUser(who: string) {
  const key = emailOrName(who);
  const user = await User.findOne({ $or: [{ email: key }, { usernameLower: key }] });
  if (!user) throw notFound('user_not_found', 'No user with that email or username.');
  return user;
}

const log = (
  adminId: string,
  action: 'credit_deposit' | 'credit' | 'debit' | 'telegram_delivered' | 'telegram_refund',
  reason: string,
  extra: { userId?: Types.ObjectId; amountKobo?: number; targetRef?: string } = {},
) => AdminAction.create({ adminId, module: action.startsWith('telegram') ? 'orders' : 'wallet', action, reason, ...extra });

/* ---------------- unmatched bank deposits ---------------- */

export async function listUnmatchedDeposits(): Promise<UnmatchedDeposit[]> {
  const rows = await WalletDeposit.find({ status: 'unmatched' }).sort({ createdAt: -1 }).limit(100);
  return rows.map((d) => ({
    id: String(d._id),
    reference: d.reference,
    amountKobo: d.amountKobo,
    description: typeof (d.payload as any)?.order?.description === 'string' ? (d.payload as any).order.description : null,
    createdAt: (d.createdAt as Date).toISOString(),
  }));
}

/** An admin has worked out whose transfer this was (for example from PocketFi's dashboard): credit that user, once. */
export async function creditUnmatchedDeposit(adminId: string, depositId: string, body: CreditDepositBody) {
  const user = await findUser(body.user);
  if (!isValidObjectId(depositId)) throw conflict('already_handled', 'That deposit was already handled, or does not exist.');
  // Mark credited and add the money as ONE step: a crash can't leave a deposit marked credited with the money never added.
  const deposit = await inTx(async (session) => {
    const claimed = await WalletDeposit.findOneAndUpdate({ _id: depositId, status: 'unmatched' }, { status: 'credited', userId: user._id }, { session });
    if (claimed) await User.updateOne({ _id: user._id }, { $inc: { balanceKobo: claimed.amountKobo } }, { session });
    return claimed;
  });
  if (!deposit) throw conflict('already_handled', 'That deposit was already handled, or does not exist.');
  await log(adminId, 'credit_deposit', body.reason, { userId: user._id, amountKobo: deposit.amountKobo, targetRef: deposit.reference });
  return { credited: deposit.amountKobo, user: user.email };
}

/* ---------------- manual wallet adjustments ---------------- */

export async function adjustWallet(adminId: string, body: AdjustWalletBody) {
  const user = await findUser(body.user);
  if (body.direction === 'credit') {
    await User.updateOne({ _id: user._id }, { $inc: { balanceKobo: body.amountKobo } });
  } else {
    // A debit only goes through if the wallet covers it (one atomic step): the balance can never be pushed below zero.
    const done = await User.findOneAndUpdate({ _id: user._id, balanceKobo: { $gte: body.amountKobo } }, { $inc: { balanceKobo: -body.amountKobo } });
    if (!done) throw conflict('insufficient_balance', "That user's wallet does not hold that much.");
  }
  await log(adminId, body.direction, body.reason, { userId: user._id, amountKobo: body.direction === 'credit' ? body.amountKobo : -body.amountKobo });
  return { user: user.email, balanceKobo: (await User.findById(user._id))!.balanceKobo };
}

/* ---------------- Telegram orders we could not confirm ---------------- */

export async function listReviewTelegram(): Promise<ReviewTelegramOrder[]> {
  const rows = await TelegramOrder.find({ status: 'review' }).sort({ createdAt: -1 }).limit(100);
  const users = await User.find({ _id: { $in: rows.map((r) => r.userId) } }).select('email');
  const email = new Map(users.map((u) => [String(u._id), u.email]));
  return rows.map((o) => ({
    id: String(o._id),
    user: email.get(String(o.userId)) ?? 'unknown',
    service: o.service as 'premium' | 'stars',
    units: o.units,
    recipient: o.recipient,
    costKobo: o.costKobo,
    createdAt: (o.createdAt as Date).toISOString(),
  }));
}

/** After checking the supplier's dashboard: it WAS delivered (close it), or it was NOT (give the user their money back, once). */
export async function resolveTelegram(adminId: string, orderId: string, body: ResolveTelegramBody) {
  const order = await TelegramOrder.findOne({ _id: orderId, status: 'review' }).catch(() => null);
  if (!order) throw conflict('already_handled', 'That order was already handled, or does not exist.');

  if (body.outcome === 'delivered') {
    const done = await TelegramOrder.findOneAndUpdate({ _id: order._id, status: 'review' }, { status: 'delivered' });
    if (!done) throw conflict('already_handled', 'That order was already handled.');
    await log(adminId, 'telegram_delivered', body.reason, { userId: order.userId, amountKobo: order.costKobo, targetRef: String(order._id) });
    return { status: 'delivered' as const };
  }

  const refunded = await failAndRefund(order._id, ['review'], `Admin: ${body.reason}`);
  if (!refunded) throw conflict('already_handled', 'That order was already handled.');
  await log(adminId, 'telegram_refund', body.reason, { userId: order.userId, amountKobo: order.costKobo, targetRef: String(order._id) });
  return { status: 'failed' as const };
}
