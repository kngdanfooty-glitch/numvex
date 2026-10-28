import type { EsimCountry, EsimDetails, EsimOrder as EsimOrderView, EsimOrderStatus, EsimPlan, EsimServerId, PlaceEsimOrderBody } from '@numvexs/shared';
import { esimServers, type EsimSource } from '../lib/servers.js';
import type { ClientSession } from 'mongoose';
import { env } from '../config/env.js';
import { AppError, badRequest, conflict, notFound } from '../lib/errors.js';
import { EsimOrder } from '../models/EsimOrder.js';
import { inTx } from '../lib/tx.js';
import { User } from '../models/User.js';
import { smspoolEsim } from './esim/smspool.js';
import type { EsimProvider, ProviderPlan } from './esim/types.js';
import { rates } from './settings.service.js';

/*
 * eSIMs. Same money rules as numbers and boost:
 *  - the price is worked out HERE from the provider's plan list, never taken from the page;
 *  - the wallet is charged first (atomically) and given back, once, if the provider refuses;
 *  - the same request id twice is the same purchase.
 * The provider hands over the install data (QR); we keep it so the buyer can open it again later.
 */
const providers: Record<EsimSource, EsimProvider> = { smspool: smspoolEsim };

const COUNTRIES_TTL = 10 * 60 * 1000;
const PLANS_TTL = 5 * 60 * 1000;

/** Our price in kobo: the provider's dollar price x the naira rate, plus our markup. */
export const planPriceKobo = (usd: number) => Math.max(1, Math.round(usd * rates().usdNgnRate * (1 + rates().esimMarkupPercent / 100) * 100));

/* ---------------- cached reads ---------------- */

const cache = new Map<string, { at: number; data: unknown }>();
const inFlight = new Map<string, Promise<unknown>>();

/** Cached for a while, shared between simultaneous callers, and a provider that is down keeps serving the last good copy. */
async function cached<T>(key: string, ttl: number, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.data as T;
  let pending = inFlight.get(key) as Promise<T> | undefined;
  if (!pending) {
    pending = (async () => {
      try {
        const data = await load();
        cache.set(key, { at: Date.now(), data });
        return data;
      } catch (err) {
        if (hit) return hit.data as T;
        throw err;
      } finally {
        inFlight.delete(key);
      }
    })();
    inFlight.set(key, pending);
  }
  return pending;
}

/** For tests: forget everything cached. */
export function resetEsimCache() {
  cache.clear();
  inFlight.clear();
}

export const listCountries = (server: EsimSource): Promise<EsimCountry[]> => cached(`c:${server}`, COUNTRIES_TTL, () => providers[server].countries());

const providerPlans = (server: EsimSource, country: string): Promise<ProviderPlan[]> =>
  cached(`p:${server}:${country}`, PLANS_TTL, () => providers[server].plans(country));

export async function listPlans(server: EsimSource, country: string): Promise<EsimPlan[]> {
  return (await providerPlans(server, country)).map((p) => ({ id: p.id, dataGb: p.dataGb, days: p.days, priceKobo: planPriceKobo(p.usd), network: p.network, speed: p.speed }));
}

/* ---------------- orders ---------------- */

const gb = (n: number) => (n < 1 ? `${Math.round(n * 1000)} MB` : `${Number(n.toFixed(2))} GB`);
const summary = (p: ProviderPlan) => `${gb(p.dataGb)} · ${p.days} day${p.days === 1 ? '' : 's'}`;

export const toView = (o: InstanceType<typeof EsimOrder>, withDetails = false): EsimOrderView => ({
  id: String(o._id),
  server: esimServers.publicIdOrRetired(o.server) as EsimServerId, // 'retired' for a provider that has since been removed
  countryName: o.countryName,
  planSummary: o.planSummary,
  costKobo: o.costKobo,
  status: o.status as EsimOrderStatus,
  createdAt: (o.createdAt as Date).toISOString(),
  details: withDetails ? ((o.details as EsimDetails | undefined) ?? null) : null,
});

const refund = (userId: unknown, kobo: number, session?: ClientSession) => User.updateOne({ _id: userId }, { $inc: { balanceKobo: kobo } }, { session });

export async function placeOrder(userId: string, server: EsimSource, body: PlaceEsimOrderBody) {
  // The same purchase form twice (a double click, a retry) is the same purchase: hand back the first, charge nothing more.
  const existing = await EsimOrder.findOne({ userId, requestId: body.requestId });
  if (existing) {
    if (existing.status === 'failed') throw conflict('order_failed', 'That purchase did not go through. Please try again.');
    return existing;
  }

  const countries = await listCountries(server);
  const country = countries.find((c) => c.id === body.country);
  if (!country) throw notFound('country_not_found', 'That country is not available on this server.');
  const plan = (await providerPlans(server, country.id)).find((p) => p.id === body.plan);
  if (!plan) throw notFound('plan_not_found', 'That plan is not available any more. Pick another one.');
  const costKobo = planPriceKobo(plan.usd);

  const user = await User.findById(userId);
  if (!user) throw badRequest('no_user', 'Please sign in again.');
  // Take the money and record the order as ONE step: both happen or neither does (a crash can't leave a charge with no order). The charge only
  // goes through if there's enough, in one atomic step, so two clicks can't overspend.
  let order;
  try {
    order = await inTx(async (session) => {
      const charged = await User.findOneAndUpdate({ _id: userId, balanceKobo: { $gte: costKobo } }, { $inc: { balanceKobo: -costKobo } }, { session });
      if (!charged) throw new AppError(402, 'insufficient_balance', 'Insufficient balance. Fund your wallet and try again.');
      const [created] = await EsimOrder.create([{ userId, requestId: body.requestId, server, planId: plan.id, countryId: country.id, countryName: country.name, planSummary: summary(plan), costKobo }], { session });
      return created!;
    });
  } catch (err) {
    // Two copies of the same form raced and the other won: the charge above was rolled back with it, so just hand back the winner.
    if ((err as { code?: number }).code === 11000) return (await EsimOrder.findOne({ userId, requestId: body.requestId }))!;
    throw err;
  }

  try {
    const bought = await providers[server].buy(plan.id, { countryId: country.id, email: user.email });
    // The install data. If the provider can't give it yet, the order is still ours: it is fetched when the buyer opens it.
    const details = bought.details ?? (await providers[server].details(bought.ref).catch(() => undefined));
    return (await EsimOrder.findByIdAndUpdate(order._id, { providerRef: bought.ref, status: 'active', ...(details ? { details } : {}) }, { new: true }))!;
  } catch (err) {
    // Nothing was bought: mark it failed and give the money back, exactly once.
    await inTx(async (session) => {
      const failed = await EsimOrder.findOneAndUpdate({ _id: order._id, status: 'placing' }, { status: 'failed', refundedKobo: costKobo }, { session });
      if (failed) await refund(userId, costKobo, session);
    });
    throw err;
  }
}

export async function listMine(userId: string) {
  return EsimOrder.find({ userId, status: 'active' }).sort({ createdAt: -1 }).limit(100);
}

/** One of my eSIMs, with its install data. If we never got the data at purchase, ask the provider now and keep it. */
export async function getMine(userId: string, id: string) {
  const order = await EsimOrder.findOne({ _id: id, userId, status: 'active' }).catch(() => null);
  if (!order) throw notFound('esim_not_found', 'eSIM not found.');
  if (!order.details && order.providerRef) {
    // An order from a provider we no longer use has no one to ask, so it simply shows what we stored.
    const details = await providers[order.server as EsimSource]?.details(order.providerRef).catch(() => undefined);
    if (details) {
      order.details = details;
      await order.save();
    }
  }
  return order;
}
