import type {
  AdminDepositRow,
  AdminOrderRow,
  AdminUserDetail,
  AdminUserRow,
  AuditEntry,
  DashboardData,
  DayPoint,
  DepositListQuery,
  FinanceReport,
  FinanceRow,
  OrderKind,
  OrderListQuery,
  Paged,
  UserListQuery,
} from '@numvexs/shared';
import type { Model } from 'mongoose';
import { conflict, notFound } from '../lib/errors.js';
import { Activation } from '../models/Activation.js';
import { AdminAction } from '../models/AdminAction.js';
import { BoostOrder } from '../models/BoostOrder.js';
import { EsimOrder } from '../models/EsimOrder.js';
import { Rental } from '../models/Rental.js';
import { TelegramOrder } from '../models/TelegramOrder.js';
import { RefreshToken } from '../models/RefreshToken.js';
import { User } from '../models/User.js';
import { VirtualAccount } from '../models/VirtualAccount.js';
import { WalletDeposit } from '../models/WalletDeposit.js';

/*
 * What the admin panel reads. Everything here only READS (the one exception is suspending a user). Money is always kobo.
 * There is no ledger: "charged" is the cost stored on each order, "refunded" is its refundedKobo (a cancelled number counts as
 * refunded in full), and deposits are the credited WalletDeposit rows.
 */
const DAY_MS = 24 * 60 * 60 * 1000;
const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};
const daysAgo = (n: number) => new Date(Date.now() - n * DAY_MS);
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const iso = (d: unknown) => (d as Date).toISOString();

function paged<T>(items: T[], total: number, page: number, limit: number): Paged<T> {
  return { items, page, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

/** Sum one field over the documents that match. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function sum(model: Model<any>, match: object, field: string): Promise<number> {
  const r = await model.aggregate<{ t: number }>([{ $match: match }, { $group: { _id: null, t: { $sum: `$${field}` } } }]);
  return r[0]?.t ?? 0;
}

/** Sum a field per calendar day (as "YYYY-MM-DD") over the last `days` days. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function perDay(model: Model<any>, match: object, dateField: string, valueField: string | null, since: Date) {
  const rows = await model.aggregate<{ _id: string; t: number }>([
    { $match: { ...match, [dateField]: { $gte: since } } },
    { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: `$${dateField}` } }, t: { $sum: valueField ? `$${valueField}` : 1 } } },
  ]);
  return new Map(rows.map((r) => [r._id, r.t]));
}

function series(days: number, ...parts: { map: Map<string, number>; sign: 1 | -1 }[]): DayPoint[] {
  const out: DayPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(Date.now() - i * DAY_MS).toISOString().slice(0, 10);
    out.push({ day, value: parts.reduce((total, p) => total + p.sign * (p.map.get(day) ?? 0), 0) });
  }
  return out;
}

/* ---------------- dashboard ---------------- */

/** `showMoney` is false for admins without the Finance section: their dashboard has counts only, no naira. */
export async function dashboard(showMoney: boolean): Promise<DashboardData> {
  const today = startOfToday();
  const month = daysAgo(30);
  const trendFrom = daysAgo(14);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const count = (m: Model<any>, f: object) => m.countDocuments(f);

  const [users, newUsers, float, depToday, depMonth, unmatched, review, stuck] = await Promise.all([
    count(User, {}),
    count(User, { createdAt: { $gte: month } }),
    showMoney ? sum(User, {}, 'balanceKobo') : null,
    showMoney ? sum(WalletDeposit, { status: 'credited', createdAt: { $gte: today } }, 'amountKobo') : null,
    showMoney ? sum(WalletDeposit, { status: 'credited', createdAt: { $gte: month } }, 'amountKobo') : null,
    count(WalletDeposit, { status: 'unmatched' }),
    count(TelegramOrder, { status: 'review' }),
    count(Activation, { status: 'pending', expiresAt: { $lt: new Date(Date.now() - 10 * 60_000) } }),
  ]);

  const kinds = { numbers: Activation, boost: BoostOrder, esim: EsimOrder, rentals: Rental, telegram: TelegramOrder } as const;
  const orders = {} as DashboardData['orders'];
  for (const [k, model] of Object.entries(kinds)) {
    orders[k as keyof typeof kinds] = { today: await count(model, { createdAt: { $gte: today } }), month: await count(model, { createdAt: { $gte: month } }) };
  }

  // Money kept per day over the last 14 days = charged - refunded, across both services.
  const charged = !showMoney ? [] : await Promise.all([Activation, BoostOrder, EsimOrder, Rental, TelegramOrder].map((m) => perDay(m, {}, 'createdAt', 'costKobo', trendFrom)));
  const refunded = !showMoney ? [] : await Promise.all([
    perDay(Activation, { status: 'cancelled' }, 'updatedAt', 'costKobo', trendFrom),
    perDay(BoostOrder, { refundedKobo: { $gt: 0 } }, 'updatedAt', 'refundedKobo', trendFrom),
    perDay(EsimOrder, { refundedKobo: { $gt: 0 } }, 'updatedAt', 'refundedKobo', trendFrom),
    perDay(Rental, { refundedKobo: { $gt: 0 } }, 'updatedAt', 'refundedKobo', trendFrom),
    perDay(TelegramOrder, { refundedKobo: { $gt: 0 } }, 'updatedAt', 'refundedKobo', trendFrom),
  ]);
  const revenueTrend = !showMoney ? null : series(14, ...charged.map((map) => ({ map, sign: 1 as const })), ...refunded.map((map) => ({ map, sign: -1 as const })));
  const userGrowth = series(14, { map: await perDay(User, {}, 'createdAt', null, trendFrom), sign: 1 });

  const latest = await Promise.all([
    Activation.find({}).sort({ createdAt: -1 }).limit(6),
    BoostOrder.find({}).sort({ createdAt: -1 }).limit(6),
    EsimOrder.find({}).sort({ createdAt: -1 }).limit(6),
    Rental.find({}).sort({ createdAt: -1 }).limit(6),
    TelegramOrder.find({}).sort({ createdAt: -1 }).limit(6),
  ]);
  type Rec = { _id: unknown; userId: unknown; costKobo: number; createdAt: Date };
  const title = (kind: string, r: Record<string, unknown>) =>
    kind === 'numbers' ? `${r.service} number` : kind === 'boost' ? String(r.serviceName) : kind === 'esim' ? `${r.countryName} eSIM` : kind === 'rentals' ? `${r.countryName} rental` : `Telegram ${r.service === 'premium' ? `${r.units} months Premium` : `${r.units} Stars`}`;
  const merged = (['numbers', 'boost', 'esim', 'rentals', 'telegram'] as const).flatMap((k, i) => (latest[i] as unknown as (Rec & Record<string, unknown>)[]).map((r) => ({ r, k })));
  merged.sort((a, b) => b.r.createdAt.getTime() - a.r.createdAt.getTime());
  const top = merged.slice(0, 6);
  const owners = await User.find({ _id: { $in: top.map((t) => t.r.userId) } }).select('email');
  const email = new Map(owners.map((u) => [String(u._id), u.email]));
  const recent = top.map(({ r, k }) => ({ id: `${k}:${String(r._id)}`, title: title(k, r), user: email.get(String(r.userId)) ?? 'unknown', amountKobo: showMoney ? -r.costKobo : null, createdAt: iso(r.createdAt) }));

  return {
    totals: { users, newUsers30d: newUsers, walletFloatKobo: float, depositsTodayKobo: depToday, depositsMonthKobo: depMonth },
    orders,
    needsAttention: { unmatchedDeposits: unmatched, telegramReview: review, stuckNumbers: stuck },
    revenueTrend,
    userGrowth,
    recent,
  };
}

/* ---------------- users ---------------- */

const userRow = (u: InstanceType<typeof User>): AdminUserRow => ({
  id: String(u._id),
  email: u.email,
  username: u.username,
  phone: u.phone ?? null,
  role: u.role,
  status: u.status as 'active' | 'suspended',
  isVerified: u.isVerified,
  balanceKobo: u.balanceKobo,
  createdAt: iso(u.createdAt),
});

export async function listUsers(q: UserListQuery): Promise<Paged<AdminUserRow>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filter: Record<string, any> = {};
  if (q.status) filter.status = q.status;
  if (q.search) {
    const rx = new RegExp(escape(q.search), 'i');
    filter.$or = [{ email: rx }, { username: rx }, { phone: rx }];
  }
  const [rows, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip((q.page - 1) * q.limit).limit(q.limit),
    User.countDocuments(filter),
  ]);
  return paged(rows.map(userRow), total, q.page, q.limit);
}

export async function userDetail(id: string): Promise<AdminUserDetail> {
  const user = await User.findById(id).catch(() => null);
  if (!user) throw notFound('user_not_found', 'User not found.');
  const uid = user._id;
  const [account, numbers, boost, esim, rentals, telegram, deposited] = await Promise.all([
    VirtualAccount.findOne({ userId: uid, status: 'active' }),
    Activation.countDocuments({ userId: uid }),
    BoostOrder.countDocuments({ userId: uid }),
    EsimOrder.countDocuments({ userId: uid }),
    Rental.countDocuments({ userId: uid }),
    TelegramOrder.countDocuments({ userId: uid }),
    sum(WalletDeposit, { userId: uid, status: 'credited' }, 'amountKobo'),
  ]);
  const charged = await Promise.all([Activation, BoostOrder, EsimOrder, Rental, TelegramOrder].map((m) => sum(m, { userId: uid }, 'costKobo')));
  const refunded = await Promise.all([
    sum(Activation, { userId: uid, status: 'cancelled' }, 'costKobo'),
    sum(BoostOrder, { userId: uid }, 'refundedKobo'),
    sum(EsimOrder, { userId: uid }, 'refundedKobo'),
    sum(Rental, { userId: uid }, 'refundedKobo'),
    sum(TelegramOrder, { userId: uid }, 'refundedKobo'),
  ]);
  return {
    ...userRow(user),
    account: account ? { bankName: account.bankName ?? '', accountNumber: account.accountNumber ?? '' } : null,
    counts: { numbers, boost, esim, rentals, telegram },
    spentKobo: charged.reduce((a, b) => a + b, 0) - refunded.reduce((a, b) => a + b, 0),
    depositedKobo: deposited,
  };
}

/** Suspend or restore a user. A suspended user can't sign in or refresh a session; their current sessions are cut at once. */
export async function setSuspended(adminId: string, id: string, suspended: boolean, reason: string) {
  const user = await User.findById(id).catch(() => null);
  if (!user) throw notFound('user_not_found', 'User not found.');
  if (String(user._id) === adminId) throw conflict('self_action', "You can't suspend your own account.");
  if (user.role === 'admin') throw conflict('is_admin', 'Remove their admin access first (Admin team), then suspend them.');
  const next = suspended ? 'suspended' : 'active';
  if (user.status === next) throw conflict('no_change', suspended ? 'This user is already suspended.' : 'This user is not suspended.');
  user.status = next;
  await user.save();
  if (suspended) await RefreshToken.deleteMany({ userId: user._id });
  await AdminAction.create({ adminId, module: 'users', action: suspended ? 'user_suspend' : 'user_unsuspend', userId: user._id, targetRef: String(user._id), reason });
  return userRow(user);
}

/* ---------------- orders ---------------- */

async function userIdsFor(search: string | undefined) {
  if (!search) return undefined;
  const rx = new RegExp(escape(search), 'i');
  return (await User.find({ $or: [{ email: rx }, { username: rx }] }).select('_id').limit(200)).map((u) => u._id);
}

export async function listOrders(q: OrderListQuery): Promise<Paged<AdminOrderRow>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filter: Record<string, any> = {};
  if (q.status) filter.status = q.status;
  const ids = await userIdsFor(q.search);
  if (ids) filter.userId = { $in: ids };

  const model = ({ numbers: Activation, boost: BoostOrder, esim: EsimOrder, rentals: Rental, telegram: TelegramOrder } as const)[q.kind as OrderKind];
  const [rows, total] = await Promise.all([
    (model as Model<any>).find(filter).sort({ createdAt: -1 }).skip((q.page - 1) * q.limit).limit(q.limit),
    (model as Model<any>).countDocuments(filter),
  ]);
  const owners = await User.find({ _id: { $in: rows.map((r: { userId: unknown }) => r.userId) } }).select('email');
  const email = new Map(owners.map((u) => [String(u._id), u.email]));

  const items = (rows as unknown as Record<string, any>[]).map((r): AdminOrderRow => {
    const base = { id: String(r._id), user: email.get(String(r.userId)) ?? 'unknown', status: r.status as string, costKobo: r.costKobo as number, createdAt: iso(r.createdAt) };
    if (q.kind === 'numbers') return { ...base, title: `${r.service} number`, detail: `${r.country} · ${r.number} · ${r.server}`, refundedKobo: r.status === 'cancelled' ? r.costKobo : 0 };
    if (q.kind === 'esim') return { ...base, title: `${r.countryName} eSIM`, detail: `${r.planSummary} · ${r.server}`, refundedKobo: r.refundedKobo ?? 0 };
    if (q.kind === 'rentals') return { ...base, title: `${r.countryName} rental`, detail: `${r.number ?? 'no number yet'} · ${r.totalDays} days · ${r.server}`, refundedKobo: r.refundedKobo ?? 0 };
    if (q.kind === 'telegram') return { ...base, title: `Telegram ${r.service === 'premium' ? `${r.units} months Premium` : `${Number(r.units).toLocaleString()} Stars`}`, detail: r.recipient, refundedKobo: r.refundedKobo ?? 0 };
    return { ...base, title: r.serviceName, detail: `${Number(r.quantity).toLocaleString()} units · ${r.server}`, refundedKobo: r.refundedKobo ?? 0 };
  });
  return paged(items, total, q.page, q.limit);
}

/* ---------------- deposits ---------------- */

export async function listDeposits(q: DepositListQuery): Promise<Paged<AdminDepositRow>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filter: Record<string, any> = q.status ? { status: q.status } : { status: { $in: ['credited', 'unmatched'] } };
  const [rows, total] = await Promise.all([
    WalletDeposit.find(filter).sort({ createdAt: -1 }).skip((q.page - 1) * q.limit).limit(q.limit),
    WalletDeposit.countDocuments(filter),
  ]);
  const owners = await User.find({ _id: { $in: rows.map((r) => r.userId).filter(Boolean) } }).select('email');
  const email = new Map(owners.map((u) => [String(u._id), u.email]));
  return paged(
    rows.map((d): AdminDepositRow => ({
      id: String(d._id),
      reference: d.reference,
      user: d.userId ? (email.get(String(d.userId)) ?? 'unknown') : null,
      accountNumber: d.accountNumber ?? null,
      amountKobo: d.amountKobo,
      status: d.status as 'credited' | 'unmatched',
      createdAt: iso(d.createdAt),
    })),
    total,
    q.page,
    q.limit,
  );
}

/* ---------------- finance ---------------- */

export async function finance(days: number): Promise<FinanceReport> {
  const since = daysAgo(days);
  const defs = [
    { service: 'numbers' as const, model: Activation, refunded: () => sum(Activation, { status: 'cancelled', updatedAt: { $gte: since } }, 'costKobo') },
    { service: 'boost' as const, model: BoostOrder, refunded: () => sum(BoostOrder, { updatedAt: { $gte: since } }, 'refundedKobo') },
    { service: 'esim' as const, model: EsimOrder, refunded: () => sum(EsimOrder, { updatedAt: { $gte: since } }, 'refundedKobo') },
    { service: 'rentals' as const, model: Rental, refunded: () => sum(Rental, { updatedAt: { $gte: since } }, 'refundedKobo') },
    { service: 'telegram' as const, model: TelegramOrder, refunded: () => sum(TelegramOrder, { updatedAt: { $gte: since } }, 'refundedKobo') },
  ];
  const rows: FinanceRow[] = [];
  for (const d of defs) {
    const [orders, chargedKobo, refundedKobo] = await Promise.all([(d.model as Model<any>).countDocuments({ createdAt: { $gte: since } }), sum(d.model, { createdAt: { $gte: since } }, 'costKobo'), d.refunded()]);
    rows.push({ service: d.service, orders, chargedKobo, refundedKobo, netKobo: chargedKobo - refundedKobo });
  }
  const [depositedKobo, walletFloatKobo] = await Promise.all([sum(WalletDeposit, { status: 'credited', createdAt: { $gte: since } }, 'amountKobo'), sum(User, {}, 'balanceKobo')]);
  const totals = rows.reduce((t, r) => ({ ...t, chargedKobo: t.chargedKobo + r.chargedKobo, refundedKobo: t.refundedKobo + r.refundedKobo, netKobo: t.netKobo + r.netKobo }), { chargedKobo: 0, refundedKobo: 0, netKobo: 0 });
  return { days, rows, totals: { ...totals, depositedKobo, walletFloatKobo } };
}

/* ---------------- audit log ---------------- */

export async function listAudit(module: string | undefined, page: number, limit: number): Promise<Paged<AuditEntry>> {
  const filter = module ? { module } : {};
  const [rows, total] = await Promise.all([
    AdminAction.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    AdminAction.countDocuments(filter),
  ]);
  const ids = [...new Set(rows.flatMap((r) => [String(r.adminId), r.userId ? String(r.userId) : '']).filter(Boolean))];
  const who = await User.find({ _id: { $in: ids } }).select('email');
  const email = new Map(who.map((u) => [String(u._id), u.email]));
  return paged(
    rows.map((r): AuditEntry => ({
      id: String(r._id),
      admin: r.adminEmail ?? email.get(String(r.adminId)) ?? 'unknown',
      module: r.module ?? 'wallet',
      action: r.action,
      target: r.targetRef ?? null,
      user: r.userId ? (email.get(String(r.userId)) ?? 'unknown') : null,
      amountKobo: r.amountKobo ?? null,
      reason: r.reason ?? null,
      details: (r.details as Record<string, unknown> | undefined) ?? null,
      createdAt: iso(r.createdAt),
    })),
    total,
    page,
    limit,
  );
}
