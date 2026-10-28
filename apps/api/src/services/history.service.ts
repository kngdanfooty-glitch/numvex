import type { HistoryEntry, HistoryKind, HistoryPage, HistoryType } from '@numvexs/shared';
import { Activation } from '../models/Activation.js';
import { BoostOrder } from '../models/BoostOrder.js';
import { EsimOrder } from '../models/EsimOrder.js';
import { Rental } from '../models/Rental.js';
import { TelegramOrder } from '../models/TelegramOrder.js';
import { WalletDeposit } from '../models/WalletDeposit.js';

/*
 * The money history, built from the records we already keep:
 *  - every order is a CHARGE at the moment it was made (the wallet is taken from first), so it shows as a negative entry;
 *  - an order that was refunded also shows a positive REFUND entry, at the moment it was refunded;
 *  - a numbers purchase that was cancelled was refunded in full; boost orders carry the refunded amount;
 *  - a bank deposit credited to the wallet is a positive entry.
 * Nothing here changes any money: it only reads.
 */
const short = (s: string, n = 60) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

interface Rec {
  _id: unknown;
  createdAt: Date;
  updatedAt: Date;
  costKobo?: number;
  refundedKobo?: number;
}

function purchase(kind: HistoryKind, r: Rec, title: string, detail: string | null): HistoryEntry {
  return { id: `${kind}:${String(r._id)}:purchase`, kind, type: 'purchase', title, detail, amountKobo: -(r.costKobo ?? 0), createdAt: r.createdAt.toISOString() };
}
function refund(kind: HistoryKind, r: Rec, amountKobo: number, title: string, detail: string | null): HistoryEntry {
  return { id: `${kind}:${String(r._id)}:refund`, kind, type: 'refund' as HistoryType, title: `Refund: ${title}`, detail, amountKobo, createdAt: r.updatedAt.toISOString() };
}

/**
 * A rental is one record that grows: the first purchase, then any extensions. Each is its own charge at its own time, and a refused
 * purchase or extension is its own refund, so the history matches what the wallet really did.
 */
function rentalEntries(r: InstanceType<typeof Rental>): HistoryEntry[] {
  const title = `${r.countryName} number rental`;
  const exts = r.extensions;
  const extCost = exts.reduce((n, e) => n + e.costKobo, 0);
  const failedExt = exts.filter((e) => e.status === 'failed').reduce((n, e) => n + e.costKobo, 0);
  const rec = r as unknown as Rec;
  const out: HistoryEntry[] = [purchase('rental', { _id: rec._id, createdAt: rec.createdAt, updatedAt: rec.updatedAt, costKobo: r.costKobo - extCost }, title, r.label)];
  const baseRefund = (r.refundedKobo ?? 0) - failedExt;
  if (baseRefund > 0) out.push(refund('rental', rec, baseRefund, title, r.label));
  for (const e of exts) {
    const entry = { _id: `${String(r._id)}:${e.requestId}`, createdAt: e.createdAt, updatedAt: e.updatedAt, costKobo: e.costKobo };
    out.push(purchase('rental', entry, `${title} · extended`, `+${e.days} days`));
    if (e.status === 'failed') out.push(refund('rental', entry, e.costKobo, `${title} · extended`, `+${e.days} days`));
  }
  return out;
}

export async function listHistory(userId: string, before: Date | undefined, limit: number): Promise<HistoryPage> {
  const bought = (field: 'createdAt' | 'updatedAt') => ({ userId, ...(before ? { [field]: { $lt: before } } : {}) });
  const refunded = { ...bought('updatedAt'), refundedKobo: { $gt: 0 } };
  const newest = (field: 'createdAt' | 'updatedAt') => ({ [field]: -1 } as Record<string, -1>);

  const [deposits, acts, actRefunds, boosts, boostRefunds, esims, esimRefunds, rentals, tgs, tgRefunds] = await Promise.all([
    WalletDeposit.find({ ...bought('createdAt'), status: 'credited' }).sort(newest('createdAt')).limit(limit),
    Activation.find(bought('createdAt')).sort(newest('createdAt')).limit(limit),
    Activation.find({ ...bought('updatedAt'), status: 'cancelled' }).sort(newest('updatedAt')).limit(limit),
    BoostOrder.find(bought('createdAt')).sort(newest('createdAt')).limit(limit),
    BoostOrder.find(refunded).sort(newest('updatedAt')).limit(limit),
    EsimOrder.find(bought('createdAt')).sort(newest('createdAt')).limit(limit),
    EsimOrder.find(refunded).sort(newest('updatedAt')).limit(limit),
    Rental.find(bought('createdAt')).sort(newest('createdAt')).limit(limit),
    TelegramOrder.find(bought('createdAt')).sort(newest('createdAt')).limit(limit),
    TelegramOrder.find(refunded).sort(newest('updatedAt')).limit(limit),
  ]);

  const numberTitle = (a: (typeof acts)[number]) => `${a.service} number`;
  const numberDetail = (a: (typeof acts)[number]) => `${a.country} · ${a.number}`;
  const boostTitle = (b: (typeof boosts)[number]) => short(b.serviceName);
  const esimTitle = (e: (typeof esims)[number]) => `${e.countryName} eSIM`;
  const tgTitle = (t: (typeof tgs)[number]) => `Telegram ${t.service === 'premium' ? `${t.units} months Premium` : `${t.units.toLocaleString()} Stars`}`;
  const boostDetail = (b: (typeof boosts)[number]) => `${b.quantity.toLocaleString()} units`;

  const all: HistoryEntry[] = [
    ...deposits.map((d): HistoryEntry => ({ id: `deposit:${String(d._id)}`, kind: 'deposit', type: 'deposit', title: 'Bank transfer deposit', detail: null, amountKobo: d.amountKobo, createdAt: (d.createdAt as Date).toISOString() })),
    ...acts.map((a) => purchase('number', a as Rec, numberTitle(a), numberDetail(a))),
    ...actRefunds.map((a) => refund('number', a as Rec, a.costKobo, numberTitle(a), numberDetail(a))),
    ...boosts.map((b) => purchase('boost', b as Rec, boostTitle(b), boostDetail(b))),
    ...boostRefunds.map((b) => refund('boost', b as Rec, b.refundedKobo ?? 0, boostTitle(b), boostDetail(b))),
    ...esims.map((e) => purchase('esim', e as Rec, esimTitle(e), e.planSummary)),
    ...esimRefunds.map((e) => refund('esim', e as Rec, e.refundedKobo ?? 0, esimTitle(e), e.planSummary)),
    ...rentals.flatMap(rentalEntries).filter((e) => !before || e.createdAt < before.toISOString()),
    ...tgs.map((t) => purchase('telegram', t as Rec, tgTitle(t), t.recipient)),
    ...tgRefunds.map((t) => refund('telegram', t as Rec, t.refundedKobo ?? 0, tgTitle(t), t.recipient)),
  ];

  // Each source gave at most `limit` of its newest rows, so the newest `limit` of the merged list are correct.
  all.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : a.id < b.id ? 1 : -1));
  const entries = all.slice(0, limit);
  const sources = [deposits, acts, actRefunds, boosts, boostRefunds, esims, esimRefunds, rentals, tgs, tgRefunds];
  const more = all.length > limit || sources.some((s) => s.length === limit);
  return { entries, nextBefore: more && entries.length > 0 ? entries[entries.length - 1]!.createdAt : null };
}
