import type { CatalogItem, NumberCatalog, NumberServerId } from '@numvexs/shared';
import { isValidObjectId } from 'mongoose';
import { env } from '../config/env.js';
import { AppError, badRequest, conflict, notFound } from '../lib/errors.js';
import { isBusy, isUnreachable, providerFetch } from '../lib/providerFetch.js';
import { Activation } from '../models/Activation.js';
import { inTx } from '../lib/tx.js';
import { User } from '../models/User.js';
import { daisyPrices, daisyProvider } from './daisysms.js';
import { fivesimProvider } from './fivesim.js';
import { herosmsProvider } from './herosms.js';
import { manesmsProvider } from './manesms.js';
import { smsbowerProvider } from './smsbower.js';
import { juicysmsProvider } from './juicysms.js';
import { smspoolProvider } from './smspool.js';
import type { BuyProvider, QuoteOptions } from './providers/types.js';
import { textverifiedProvider } from './textverified.js';
import { rates } from './settings.service.js';

/*
 * How long a user waits for a code: at most 7 minutes. That is the countdown on the page, how long the poll job keeps asking the provider,
 * and the moment the number is cancelled and refunded if no code came. A provider that holds the number for less than that wins
 * (we never promise a number longer than the provider will keep it); one that holds it for 15-20 minutes is cancelled at 7.
 */
export const WAIT_MS = 7 * 60 * 1000;
/** A number with no code this long after the purchase is refunded without asking the provider (a provider that won't cancel can't hold the money). */
export const FORCE_REFUND_MS = 15 * 60 * 1000;
export const waitingUntil = (providerEnds: Date | undefined, providerLifetimeMs: number, now = Date.now()): Date =>
  new Date(Math.min(providerEnds ? providerEnds.getTime() : now + providerLifetimeMs, now + WAIT_MS));


/*
 * One small "adapter" per provider. Each knows how to ask ITS provider for countries + services
 * and turn the answer into the same { id, name } lists. Only the server whose tab was opened is
 * ever called (no Promise.all across servers); a server's own two lists are fetched one after the other.
 */

const CACHE_MS = 5 * 60 * 1000; // same 5 minutes the FloZap site used
const cache = new Map<NumberServerId, { at: number; data: NumberCatalog }>();

async function getJson(url: string, headers: Record<string, string> = {}): Promise<any> {
  const res = await providerFetch(url, { headers: { accept: 'application/json', ...headers } });
  if (!res.ok) throw new AppError(502, 'provider_error', `The server answered ${res.status}. Try again shortly.`);
  return res.json();
}

function needKey(value: string | undefined, name: string): string {
  if (!value) {
    console.error(`[numbers] not configured: ${name} missing`);
    throw new AppError(503, 'server_not_configured', 'This server is temporarily unavailable. Try another server.');
  }
  return value;
}

const byName = (a: CatalogItem, b: CatalogItem) => a.name.localeCompare(b.name);

/** The same service listed twice (same id or same name): keep the first, so the picker never shows a duplicate. */
function uniqueByName(items: CatalogItem[]): CatalogItem[] {
  const seen = new Set<string>();
  return items.filter((i) => !seen.has(`i:${i.id}`) && !seen.has(`n:${i.name.toLowerCase()}`) && !!seen.add(`i:${i.id}`).add(`n:${i.name.toLowerCase()}`));
}

/** HeroSMS, SMSBower and ManeSMS all speak the same "handler_api.php" protocol. */
async function handlerApi(base: string, key: string, keepServiceOrder = false): Promise<Omit<NumberCatalog, 'server'>> {
  const countries = await getJson(`${base}?api_key=${key}&action=getCountries`);
  const services = await getJson(`${base}?api_key=${key}&action=getServicesList`);
  return {
    countries: Object.values<any>(countries).map((c) => ({ id: String(c.id), name: String(c.eng) })).sort(byName),
    // ManeSMS lists the popular services first (WhatsApp, Facebook, Telegram…): keep that instead of burying them in A-Z.
    services: uniqueByName((services.services ?? []).map((s: any) => ({ id: String(s.code), name: String(s.name).trim() }))).sort(keepServiceOrder ? () => 0 : byName),
  };
}

const adapters: Record<NumberServerId, () => Promise<Omit<NumberCatalog, 'server'>>> = {
  manesms: () =>
    handlerApi(process.env.MANESMS_BASE_URL ?? 'https://manesms.com/stubs/handler_api.php', needKey(process.env.MANESMS_API_KEY, 'MANESMS_API_KEY'), true),

  herosms: () =>
    handlerApi('https://hero-sms.com/stubs/handler_api.php', needKey(process.env.HEROSMS_API_KEY, 'HEROSMS_API_KEY')),

  smsbower: () =>
    handlerApi(process.env.SMSBOWER_BASE_URL ?? 'https://smsbower.page/stubs/handler_api.php', needKey(process.env.SMSBOWER_API_KEY, 'SMSBOWER_API_KEY')),

  smspool: async () => {
    const headers = { Authorization: `Bearer ${needKey(process.env.SMSPOOL_API_KEY, 'SMSPOOL_API_KEY')}` };
    const countries = await getJson('https://api.smspool.net/country/retrieve_all', headers);
    const services = await getJson('https://api.smspool.net/service/retrieve_all', headers);
    return {
      countries: countries.map((c: any) => ({ id: String(c.ID), name: String(c.name) })).sort(byName),
      services: services.map((s: any) => ({ id: String(s.ID), name: String(s.name) })).sort(byName),
    };
  },

  // 5sim's catalogue is public (no key needed). Both come back as objects keyed by name.
  fivesim: async () => {
    const countries = await getJson('https://5sim.net/v1/guest/countries');
    const products = await getJson('https://5sim.net/v1/guest/products/any/any');
    return {
      countries: Object.entries<any>(countries)
        .map(([slug, c]) => ({ id: slug, name: String(c.text_en ?? slug) }))
        .sort(byName),
      services: Object.keys(products)
        .map((p) => ({ id: p, name: p }))
        .sort(byName),
    };
  },

  // TextVerified: swap the API key for a short-lived token, then ask for the service list. US numbers only.
  textverified: async () => {
    const key = needKey(process.env.TEXTVERIFIED_API_KEY, 'TEXTVERIFIED_API_KEY');
    const user = needKey(process.env.TEXTVERIFIED_USERNAME, 'TEXTVERIFIED_USERNAME');
    const auth = await providerFetch('https://www.textverified.com/api/pub/v2/auth', {
      method: 'POST',
      headers: { 'X-API-KEY': key, 'X-API-USERNAME': user },
    });
    if (!auth.ok) throw new AppError(502, 'provider_error', 'Could not sign in to this server.');
    const { token } = (await auth.json()) as { token: string };
    const services = await getJson(
      'https://www.textverified.com/api/pub/v2/services?numberType=mobile&reservationType=verification',
      { Authorization: `Bearer ${token}` },
    );
    return {
      countries: [{ id: 'US', name: 'United States' }],
      services: services.map((s: any) => ({ id: String(s.serviceName), name: String(s.serviceName) })).sort(byName),
    };
  },

  // DaisySMS: USA numbers only. getPrices is a flat list { serviceCode: { cost, count, multi } } with no
  // display names, so the code ("amazon", "aws"...) is shown as the name.
  daisysms: async () => {
    const prices = await daisyPrices();
    return {
      countries: [{ id: '187', name: 'United States' }],
      // The price list is the service list, so the naira price and stock ride along (no second call).
      services: Object.entries(prices)
        .map(([code, p]) => ({ id: code, name: code, costKobo: priceKobo(Number(p.cost)), stock: Number(p.count) }))
        .sort(byName),
    };
  },

  // JuicySMS v2 (documented at juicysms.com/api, bearer key). It has no country-list call, so the
  // countries are the six its docs name; a service's price only appears once a country is chosen.
  juicysms: async () => {
    const key = needKey(process.env.JUICYSMS_API_KEY, 'JUICYSMS_API_KEY');
    const res = await getJson('https://juicysms.com/api/v2/services', { Authorization: `Bearer ${key}` });
    return {
      countries: [
        { id: 'USA', name: 'United States' },
        { id: 'UK', name: 'United Kingdom' },
        { id: 'NL', name: 'Netherlands' },
        { id: 'PH', name: 'Philippines' },
        { id: 'PL', name: 'Poland' },
        { id: 'DE', name: 'Germany' },
      ],
      services: (res.data as any[]).map((x) => ({ id: String(x.id), name: String(x.name) })).sort(byName),
    };
  },
};

export async function getCatalog(server: NumberServerId): Promise<NumberCatalog> {
  const hit = cache.get(server);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.data;
  const data: NumberCatalog = { server, ...(await adapters[server]()) };
  cache.set(server, { at: Date.now(), data });
  return data;
}

/* ------------------------------------------------------------------ */
/* Pricing, buying, checking and cancelling (any server in `providers`)  */
/* ------------------------------------------------------------------ */

/** Servers we can buy from. Add a server here (and to BUYABLE_SERVERS in shared) once its provider file exists. */
const providers: Partial<Record<NumberServerId, BuyProvider>> = {
  daisysms: daisyProvider,
  textverified: textverifiedProvider,
  herosms: herosmsProvider,
  smsbower: smsbowerProvider,
  smspool: smspoolProvider,
  juicysms: juicysmsProvider,
  fivesim: fivesimProvider,
  manesms: manesmsProvider,
};

export const isBuyable = (server: NumberServerId) => server in providers;

/** The servers we can buy from. The background jobs only look at these, so an order for a server we no longer sell is left alone. */
export const buyableServers = () => Object.keys(providers);

function providerFor(server: string): BuyProvider {
  const p = providers[server as NumberServerId];
  if (!p) throw new AppError(501, 'server_not_ready', 'Buying from this server is not available yet.');
  return p;
}

/** What the user pays, in kobo: the provider's dollar price in naira plus our markup percentage, rounded up to a whole naira (never below N1). */
export function priceKobo(usd: number): number {
  // Round off float noise first (a 20% surcharge can give 540.0000000000001, which would ceil to 541).
  const naira = Math.round(usd * rates().usdNgnRate * (1 + rates().numberMarkupPercent / 100) * 1e6) / 1e6;
  return Math.max(1, Math.ceil(naira)) * 100;
}

export async function quote(server: NumberServerId, service: string, options: QuoteOptions = {}) {
  const q = await providerFor(server).quote(service, options);
  return {
    costKobo: priceKobo(q.usd),
    stock: q.count,
    // A server with several prices (HeroSMS): every tier in naira, cheapest first. The buyer sends back the tier id.
    ...(q.tiers ? { tiers: q.tiers.map((t) => ({ id: t.id, costKobo: priceKobo(t.usd), stock: t.count, ...(t.note ? { note: t.note } : {}) })) } : {}),
  };
}

/** Friendly names for the Orders list ("WhatsApp", "United Kingdom") instead of ids. Best effort: falls back to the ids. */
async function labelsFor(server: NumberServerId, service: string, country?: string) {
  try {
    const cat = await getCatalog(server);
    return {
      service: cat.services.find((s) => s.id === service)?.name ?? service,
      country: country ? cat.countries.find((c) => c.id === country)?.name : undefined,
    };
  } catch {
    return { service, country: undefined };
  }
}

export async function buy(userId: string, server: NumberServerId, service: string, options: QuoteOptions = {}) {
  const provider = providerFor(server);
  const q = await provider.quote(service, options);

  // A server with several prices: the buyer must have picked one, and it must still exist. We charge THAT price.
  let usd = q.usd;
  if (q.tiers) {
    if (!options.tier) throw badRequest('choose_price', 'Pick a price first.');
    const tier = q.tiers.find((t) => t.id === options.tier);
    if (!tier) throw conflict('price_changed', 'That price is no longer available. Refresh and try again.');
    usd = tier.usd;
  }
  const costKobo = priceKobo(usd);

  // Take the money first, but only if there's enough (one atomic step, so two clicks can't overspend).
  const charged = await User.findOneAndUpdate(
    { _id: userId, balanceKobo: { $gte: costKobo } },
    { $inc: { balanceKobo: -costKobo } },
  );
  if (!charged) throw new AppError(402, 'insufficient_balance', 'Insufficient balance. Fund your wallet and try again.');

  let bought: Awaited<ReturnType<BuyProvider['buy']>> | undefined;
  try {
    bought = await provider.buy(service, usd, options);
    const labels = await labelsFor(server, service, options.country);
    return await Activation.create({
      userId,
      server,
      providerOrderId: bought.id,
      number: bought.number,
      service: labels.service,
      country: bought.country ?? labels.country ?? provider.country,
      costKobo,
      expiresAt: waitingUntil(bought.expiresAt, provider.lifetimeMs),
    });
  } catch (err) {
    // If the provider already gave us a number but we couldn't record it, release it so we aren't charged for nothing.
    if (bought) await provider.cancel(bought.id).catch(() => false);
    await User.updateOne({ _id: userId }, { $inc: { balanceKobo: costKobo } }); // nothing usable was bought: give it back
    throw err;
  }
}

/** Flip pending -> cancelled exactly once, then refund exactly once. */
async function cancelAndRefund(activation: InstanceType<typeof Activation>) {
  // Mark cancelled and refund as ONE step: a crash can't leave a number cancelled with the money never returned.
  const flipped = await inTx(async (session) => {
    const done = await Activation.findOneAndUpdate({ _id: activation._id, status: 'pending' }, { status: 'cancelled' }, { new: true, session });
    if (done) await User.updateOne({ _id: activation.userId }, { $inc: { balanceKobo: activation.costKobo } }, { session });
    return done;
  });
  return flipped ?? (await Activation.findById(activation._id))!;
}

async function mine(userId: string, id: string) {
  const activation = isValidObjectId(id) ? await Activation.findOne({ _id: id, userId }) : null;
  if (!activation) throw notFound('activation_not_found', 'Activation not found.');
  return activation;
}

/** The user's most recent numbers, newest first (the Orders page). Read-only: opening one is what settles it. */
export async function listMine(userId: string) {
  return Activation.find({ userId }).sort({ createdAt: -1 }).limit(50);
}

/**
 * Look at one pending number and settle it: code arrived -> completed, provider cancelled -> refund,
 * expired with no code -> cancel then refund. Shared by the user's polling and the refund job.
 * A server we can't reach leaves the number pending (it is looked at again next time), never an error.
 */
export async function settleActivation(activation: InstanceType<typeof Activation>) {
  if (activation.status !== 'pending') return activation;
  const provider = providerFor(activation.server);
  const id = activation._id;
  const complete = async (code: string) =>
    (await Activation.findOneAndUpdate({ _id: id, status: 'pending' }, { status: 'completed', code }, { new: true })) ?? activation;

  // 15 minutes with no code: refund now, before asking the provider anything. We still tell the provider to cancel (best effort, the answer
  // is ignored) so it can refund us. Only a number still 'pending' here is refunded, so a code the poll job already saved is never refunded.
  if (Date.now() - activation.createdAt.getTime() >= FORCE_REFUND_MS) {
    await provider.cancel(activation.providerOrderId).catch(() => false);
    return await cancelAndRefund(activation);
  }

  try {
    const result = await provider.status(activation.providerOrderId);
    if (result.status === 'completed') return await complete(result.code);
    if (result.status === 'cancelled') return await cancelAndRefund(activation);
    if (activation.expiresAt.getTime() < Date.now()) {
      // Expired with no code. Only refund once the provider confirms it cancelled; if it can't, the code may
      // have just landed, so look once more instead of refunding a number that worked.
      if (!(await provider.cancel(activation.providerOrderId).catch(() => false))) {
        const again = await provider.status(activation.providerOrderId);
        if (again.status === 'completed') return await complete(again.code);
        if (again.status === 'pending') return activation; // try again next time
      }
      return await cancelAndRefund(activation);
    }
    return activation;
  } catch (err) {
    if (isUnreachable(err)) return activation;
    throw err;
  }
}

/**
 * What the page polls. It reads OUR database only and never calls a provider (same as FloZap): the poll job
 * and the refund job are what write codes and refunds into the database.
 */
export async function getMine(userId: string, id: string) {
  return mine(userId, id);
}

/**
 * The user is finished with a number whose code arrived: tell the provider (where it has such a call, e.g.
 * DaisySMS status 6) so the number is released. Best effort: the code is already ours, so this never fails the user.
 */
export async function markDone(userId: string, id: string) {
  const activation = await mine(userId, id);
  if (activation.status === 'completed') {
    await providerFor(activation.server).done?.(activation.providerOrderId).catch(() => undefined);
  }
  return activation;
}

/**
 * The user presses Cancel. `refused` = the provider wouldn't cancel yet (HeroSMS: not in the first ~2 minutes; or the
 * code just arrived), so the number is still waiting and nothing was refunded. The jobs refund it later if no code comes.
 */
export async function cancel(userId: string, id: string) {
  const activation = await mine(userId, id);
  if (activation.status !== 'pending') return { activation, refused: false };
  let cancelled: boolean;
  try {
    cancelled = await providerFor(activation.server).cancel(activation.providerOrderId);
  } catch (err) {
    // The server can't be reached (or says slow down) right now. Nothing was cancelled and nothing is lost: the number
    // is still ours, the user can press Cancel again, and the refund job settles it if they don't.
    if (isUnreachable(err) || isBusy(err)) return { activation, refused: true };
    throw err;
  }
  if (!cancelled) {
    // Couldn't cancel: maybe the code just arrived. Look once more at the provider instead of refunding.
    const after = await settleActivation(activation).catch((err) => {
      if (isBusy(err)) return activation; // the server says slow down: leave it pending, the jobs will settle it
      throw err;
    });
    return { activation: after, refused: after.status === 'pending' };
  }
  return { activation: await cancelAndRefund(activation), refused: false };
}
