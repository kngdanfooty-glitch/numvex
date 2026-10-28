import type { ClientSession } from 'mongoose';
import type { ExtendRentalBody, PlaceRentalBody, Rental as RentalView, RentalCountry, RentalOption, RentalServerId, RentalStatus } from '@numvexs/shared';
import { AppError, badRequest, conflict, notFound } from '../lib/errors.js';
import { rentalServers, type RentalSource } from '../lib/servers.js';
import { inTx } from '../lib/tx.js';
import { Rental } from '../models/Rental.js';
import { User } from '../models/User.js';
import { juicysmsRentals } from './rentals/juicysms.js';
import { textverifiedRentals } from './rentals/textverified.js';
import type { ProviderRentalOption, RentalProvider } from './rentals/types.js';
import { rates } from './settings.service.js';

/*
 * Number rentals. Same money rules as eSIMs:
 *  - the price is worked out HERE from the provider's own price list, never taken from the page;
 *  - the wallet is charged first (atomically, together with the order record) and given back, once, if the provider clearly refused;
 *  - the same request id twice is the same purchase.
 * Extra rule because a rental is expensive and cannot be undone: if the provider MAY have sold it but we could not confirm
 * ('purchase_unclear'), the money stays held and the rental stays `placing` (visible, logged), never refunded blindly.
 * No refunds once the number is handed over. Extending is manual: no auto-renew anywhere.
 * The page only reads our database; the rental job (jobs/rentalJob.ts) fetches new messages and marks ended rentals.
 */
const providers: Record<RentalSource, RentalProvider> = { textverified: textverifiedRentals, juicysms: juicysmsRentals };

const OPTIONS_TTL = 5 * 60 * 1000;
const MAX_MESSAGES = 200;

/** Our price in kobo: the provider's dollar price x the naira rate, plus our markup. */
export const rentalPriceKobo = (usd: number) => Math.max(1, Math.round(usd * rates().usdNgnRate * (1 + rates().rentalMarkupPercent / 100) * 100));

/* ---------------- cached reads ---------------- */

const cache = new Map<string, { at: number; data: ProviderRentalOption[] }>();
const inFlight = new Map<string, Promise<ProviderRentalOption[]>>();

async function providerOptions(server: RentalSource, country: string): Promise<ProviderRentalOption[]> {
  const key = `${server}:${country}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < OPTIONS_TTL) return hit.data;
  let pending = inFlight.get(key);
  if (!pending) {
    pending = (async () => {
      try {
        const data = await providers[server].options(country);
        cache.set(key, { at: Date.now(), data });
        return data;
      } catch (err) {
        if (hit) return hit.data; // the provider is down: keep serving the last good list
        throw err;
      } finally {
        inFlight.delete(key);
      }
    })();
    inFlight.set(key, pending);
  }
  return pending;
}

/** For tests. */
export function resetRentalCache() {
  cache.clear();
  inFlight.clear();
}

export const listCountries = (server: RentalSource): Promise<RentalCountry[]> => providers[server].countries();

export async function listOptions(server: RentalSource, country: string): Promise<RentalOption[]> {
  return (await providerOptions(server, country)).map((o) => ({ id: o.id, label: o.label, days: o.days, priceKobo: rentalPriceKobo(o.usd) }));
}

/* ---------------- views ---------------- */

export const toView = (r: InstanceType<typeof Rental>, withMessages = false): RentalView => {
  const sorted = [...r.messages].sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime());
  return {
    id: String(r._id),
    server: rentalServers.publicIdOrRetired(r.server) as RentalServerId | 'retired',
    countryId: r.countryId,
    countryName: r.countryName,
    number: r.number ?? '',
    label: r.label,
    totalDays: r.totalDays,
    costKobo: r.costKobo,
    status: r.status as RentalStatus,
    createdAt: (r.createdAt as Date).toISOString(),
    expiresAt: r.expiresAt ? r.expiresAt.toISOString() : null,
    messages: withMessages
      ? sorted.map((m) => ({ id: m.msgId, from: m.from ?? null, text: m.text, code: m.code ?? null, receivedAt: m.receivedAt.toISOString() }))
      : [],
    messageCount: r.messages.length,
  };
};

const refund = (userId: unknown, kobo: number, session?: ClientSession) => User.updateOne({ _id: userId }, { $inc: { balanceKobo: kobo } }, { session });
const isUnclear = (err: unknown) => err instanceof AppError && err.code === 'purchase_unclear';

/* ---------------- renting ---------------- */

export async function rent(userId: string, server: RentalSource, body: PlaceRentalBody) {
  const existing = await Rental.findOne({ userId, requestId: body.requestId });
  if (existing) {
    if (existing.status === 'failed') throw conflict('order_failed', 'That purchase did not go through. Please try again.');
    return existing;
  }

  const country = (await listCountries(server)).find((c) => c.id === body.country);
  if (!country) throw notFound('country_not_found', 'That country is not available on this server.');
  const option = (await providerOptions(server, country.id)).find((o) => o.id === body.option);
  if (!option) throw notFound('option_not_found', 'That rental length is not available any more. Pick another one.');
  const costKobo = rentalPriceKobo(option.usd);
  if (!(await User.exists({ _id: userId }))) throw badRequest('no_user', 'Please sign in again.');

  let order;
  try {
    order = await inTx(async (session) => {
      const charged = await User.findOneAndUpdate({ _id: userId, balanceKobo: { $gte: costKobo } }, { $inc: { balanceKobo: -costKobo } }, { session });
      if (!charged) throw new AppError(402, 'insufficient_balance', 'Insufficient balance. Fund your wallet and try again.');
      const [created] = await Rental.create(
        [{ userId, requestId: body.requestId, server, countryId: country.id, countryName: country.name, optionId: option.id, label: option.label, totalDays: option.days, costKobo }],
        { session },
      );
      return created!;
    });
  } catch (err) {
    if ((err as { code?: number }).code === 11000) return (await Rental.findOne({ userId, requestId: body.requestId }))!;
    throw err;
  }

  try {
    const bought = await providers[server].rent(option.id, country.id, option.usd);
    return (await Rental.findByIdAndUpdate(order._id, { providerRef: bought.ref, number: bought.number, expiresAt: bought.expiresAt, status: 'active' }, { new: true }))!;
  } catch (err) {
    if (isUnclear(err)) {
      console.error(`[rentals] UNCLEAR purchase: rental ${order._id} (${server}, ${option.id}, ${costKobo} kobo) stays 'placing' with the money held. Check the provider account, then settle by hand.`);
      throw err;
    }
    await inTx(async (session) => {
      const failed = await Rental.findOneAndUpdate({ _id: order._id, status: 'placing' }, { status: 'failed', refundedKobo: costKobo }, { session });
      if (failed) await refund(userId, costKobo, session);
    });
    throw err;
  }
}

export async function extend(userId: string, id: string, body: ExtendRentalBody) {
  const rental = await Rental.findOne({ _id: id, userId }).catch(() => null);
  if (!rental) throw notFound('rental_not_found', 'Rental not found.');
  const done = rental.extensions.find((e) => e.requestId === body.requestId);
  if (done) {
    if (done.status === 'failed') throw conflict('order_failed', 'That purchase did not go through. Please try again.');
    return rental;
  }
  if (rental.status !== 'active' || !rental.providerRef || !rental.number) throw conflict('rental_not_active', 'Only an active rental can be extended.');
  const server = rental.server as RentalSource;
  if (!providers[server]) throw conflict('rental_not_active', 'This rental can no longer be extended.');
  const option = (await providerOptions(server, rental.countryId)).find((o) => o.id === body.option);
  if (!option) throw notFound('option_not_found', 'That rental length is not available any more. Pick another one.');
  const costKobo = rentalPriceKobo(option.usd);

  try {
    await inTx(async (session) => {
      const charged = await User.findOneAndUpdate({ _id: userId, balanceKobo: { $gte: costKobo } }, { $inc: { balanceKobo: -costKobo } }, { session });
      if (!charged) throw new AppError(402, 'insufficient_balance', 'Insufficient balance. Fund your wallet and try again.');
      const added = await Rental.updateOne(
        { _id: id, userId, status: 'active', 'extensions.requestId': { $ne: body.requestId } },
        { $push: { extensions: { requestId: body.requestId, optionId: option.id, days: option.days, costKobo, status: 'pending', createdAt: new Date(), updatedAt: new Date() } }, $inc: { costKobo } },
        { session },
      );
      if (added.modifiedCount !== 1) throw conflict('rental_busy', 'That rental changed. Refresh and try again.');
    });
  } catch (err) {
    if (err instanceof AppError && err.code === 'rental_busy') {
      const again = await Rental.findOne({ _id: id, userId });
      if (again?.extensions.some((e) => e.requestId === body.requestId)) return again; // a double click: the first one is running
    }
    throw err;
  }

  try {
    const res = await providers[server].extend(rental.providerRef, option.id, rental.countryId, option.usd);
    const newEnd = res.expiresAt ?? new Date((rental.expiresAt ?? new Date()).getTime() + option.days * 86_400_000);
    return (await Rental.findOneAndUpdate(
      { _id: id },
      { $set: { 'extensions.$[e].status': 'ok', 'extensions.$[e].updatedAt': new Date(), expiresAt: newEnd }, $inc: { totalDays: option.days } },
      { arrayFilters: [{ 'e.requestId': body.requestId }], new: true },
    ))!;
  } catch (err) {
    if (isUnclear(err)) {
      console.error(`[rentals] UNCLEAR extension on rental ${id} (${option.id}, ${costKobo} kobo): left 'pending' with the money held. Check the provider account.`);
      throw err;
    }
    await inTx(async (session) => {
      const flipped = await Rental.updateOne(
        { _id: id, extensions: { $elemMatch: { requestId: body.requestId, status: 'pending' } } },
        { $set: { 'extensions.$.status': 'failed', 'extensions.$.updatedAt': new Date() }, $inc: { refundedKobo: costKobo } },
        { session },
      );
      if (flipped.modifiedCount === 1) await refund(userId, costKobo, session);
    });
    throw err;
  }
}

/* ---------------- my rentals ---------------- */

export async function listMine(userId: string) {
  return Rental.find({ userId, status: { $in: ['active', 'expired', 'placing'] } }).sort({ createdAt: -1 }).limit(100);
}

export async function getMine(userId: string, id: string) {
  const r = await Rental.findOne({ _id: id, userId, status: { $ne: 'failed' } }).catch(() => null);
  if (!r) throw notFound('rental_not_found', 'Rental not found.');
  return r;
}

/* ---------------- messages (called by the job and by Refresh) ---------------- */

/** Ask the provider for new messages and keep the ones we hadn't seen. Returns how many were new. */
export async function syncMessages(rental: InstanceType<typeof Rental>): Promise<number> {
  if (!rental.providerRef || !rental.number) return 0;
  const source = rental.server as RentalSource;
  if (!providers[source]) return 0; // a provider we no longer use
  const fetched = await providers[source].messages(rental.providerRef, rental.number);
  const seen = new Set(rental.messages.map((m) => m.msgId));
  const fresh = fetched.filter((m) => !seen.has(m.id) && m.text);
  if (fresh.length) {
    await Rental.updateOne(
      { _id: rental._id },
      { $push: { messages: { $each: fresh.map((m) => ({ msgId: m.id, from: m.from ?? undefined, text: m.text.slice(0, 1000), code: m.code ?? undefined, receivedAt: m.receivedAt })), $slice: -MAX_MESSAGES } } },
    );
  }
  return fresh.length;
}

const REFRESH_MIN_MS = 10_000;

/** The Refresh button: look now, but no more than once every few seconds per rental. */
export async function refreshMine(userId: string, id: string) {
  const r = await getMine(userId, id);
  if (r.status !== 'active') return r;
  const claimed = await Rental.findOneAndUpdate(
    { _id: id, $or: [{ lastPolledAt: { $exists: false } }, { lastPolledAt: { $lt: new Date(Date.now() - REFRESH_MIN_MS) } }] },
    { lastPolledAt: new Date() },
  );
  if (claimed) await syncMessages(r).catch((err) => console.error('[rentals] refresh failed:', (err as Error).message));
  return getMine(userId, id);
}

const POLL_EVERY_MS = 55_000;
const BATCH = 40;

/** One sweep of the job: poll rentals due for a look, then close the ones whose time is up (after one last look, so a late code isn't lost). */
export async function runRentalSweep(now = new Date()): Promise<{ polled: number; newMessages: number; expired: number }> {
  const due = await Rental.find({
    status: 'active',
    $or: [{ lastPolledAt: { $exists: false } }, { lastPolledAt: { $lt: new Date(now.getTime() - POLL_EVERY_MS) } }],
  })
    .sort({ lastPolledAt: 1 })
    .limit(BATCH);
  let polled = 0;
  let newMessages = 0;
  let expired = 0;
  for (const r of due) {
    const claimed = await Rental.findOneAndUpdate({ _id: r._id, status: 'active', $or: [{ lastPolledAt: { $exists: false } }, { lastPolledAt: { $lt: new Date(now.getTime() - POLL_EVERY_MS) } }] }, { lastPolledAt: now });
    if (!claimed) continue;
    polled++;
    try {
      newMessages += await syncMessages(r);
    } catch (err) {
      console.error(`[rentals] could not read messages for ${r._id}:`, (err as Error).message);
      continue; // keep it active: a provider hiccup must not end someone's rental
    }
    if (r.expiresAt && r.expiresAt.getTime() <= now.getTime()) {
      const done = await Rental.updateOne({ _id: r._id, status: 'active', expiresAt: { $lte: now } }, { status: 'expired' });
      expired += done.modifiedCount;
    }
  }
  return { polled, newMessages, expired };
}
