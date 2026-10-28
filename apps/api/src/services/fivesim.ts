import { AppError, badRequest } from '../lib/errors.js';
import { providerFetch } from '../lib/providerFetch.js';
import type { BuyProvider, PriceTier, ProviderStatus } from './providers/types.js';

/*
 * 5sim (numbers in ~150 countries). Bearer-key REST API, built from 5sim's documented endpoints:
 *   price tiers  GET  /v1/guest/prices?country=<slug>&product=<name>   (public, tight rate limit)
 *                -> { <country>: { <product>: { <operator>: { cost, count, rate } } } }: one tier per operator
 *   buy          GET  /v1/user/buy/activation/<country>/<operator>/<product>?maxPrice=<tier price>
 *                -> an order { id, phone, price, status, expires, sms: [] }   (errors are plain text: "no free phones", ...)
 *   check        GET  /v1/user/check/<id>   status PENDING | RECEIVED (= waiting for the SMS!) | FINISHED | CANCELED | TIMEOUT | BANNED, sms: [{ code, text }]
 *   cancel       GET  /v1/user/cancel/<id>  ("you need to wait time" while it is too early; "order has sms" once a code arrived)
 *   finish       GET  /v1/user/finish/<id>
 * Prices are dollars.
 */
const BASE = 'https://5sim.net/v1';
const LIST_TTL_MS = 30 * 1000;

const busy = () => new AppError(429, 'server_busy', 'This server is busy right now. Try again in a few seconds.');

/** The key lives in FIVESIM_API_KEY (hosts like Render refuse names that start with a digit). The old 5SIM_API_KEY still works for existing local setups. */
function key(): string {
  const k = process.env.FIVESIM_API_KEY || process.env['5SIM_API_KEY'];
  if (!k) {
    console.error(`[fivesim] not configured: FIVESIM_API_KEY missing`);
    throw new AppError(503, 'server_not_configured', 'This server is temporarily unavailable. Try another server.');
  }
  return k.trim();
}

const rejected = () => {
  // 5sim said 401: OUR key is not accepted. Loud for us, plain for the user.
  console.error('[5sim] the API key was rejected (401): check FIVESIM_API_KEY');
  return new AppError(503, 'server_unavailable', 'This server is temporarily unavailable. Try another server.');
};

/** A /v1/user/... call. Success is JSON; failures are HTTP errors with a plain-text reason, returned as `text`. */
async function user(path: string): Promise<{ status: number; json: any; text: string }> {
  const res = await providerFetch(`${BASE}/user/${path}`, { headers: { Authorization: `Bearer ${key()}`, accept: 'application/json' } });
  if (res.status === 401) throw rejected();
  if (res.status === 429 || res.status === 503) throw busy();
  const text = (await res.text()).trim();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: res.status, json, text };
}

interface Operator {
  cost: number;
  count: number;
}

const lists = new Map<string, { at: number; ops: Record<string, Operator> }>();
const inFlight = new Map<string, Promise<Record<string, Operator>>>();

/** The operators selling one product in one country. Cached for a few seconds: the public prices call is rate limited. */
async function operatorsFor(country: string, product: string): Promise<Record<string, Operator>> {
  const k = `${country}/${product}`;
  const hit = lists.get(k);
  if (hit && Date.now() - hit.at < LIST_TTL_MS) return hit.ops;
  let pending = inFlight.get(k);
  if (!pending) {
    pending = (async () => {
      try {
        const res = await providerFetch(`${BASE}/guest/prices?${new URLSearchParams({ country, product })}`, { headers: { accept: 'application/json' } });
        if (res.status === 429 || res.status === 503) throw busy();
        if (!res.ok) throw new AppError(502, 'provider_error', `The server answered ${res.status}. Try again shortly.`);
        const body = (await res.json().catch(() => ({}))) as Record<string, Record<string, Record<string, Operator>>>;
        const ops = body[country]?.[product] ?? {};
        lists.set(k, { at: Date.now(), ops });
        return ops;
      } catch (err) {
        if (hit) return hit.ops; // rate limited or down: keep serving the last good list
        throw err;
      } finally {
        inFlight.delete(k);
      }
    })();
    inFlight.set(k, pending);
  }
  return pending;
}

/** For tests: forget the cached lists. */
export function resetFivesimCache() {
  lists.clear();
  inFlight.clear();
}

export const fivesimProvider: BuyProvider = {
  country: 'United States', // never shown: the page always sends the country, and the order stores its name
  lifetimeMs: 15 * 60 * 1000, // 5sim says when (order.expires); this is only the fallback

  async quote(service, { country }) {
    if (!country) throw badRequest('country_required', 'Pick a country first.');
    const ops = await operatorsFor(country, service);
    const tiers: PriceTier[] = Object.entries(ops)
      .map(([operator, o]) => ({ id: operator, usd: Number(o.cost), count: Number(o.count) }))
      .filter((t) => t.usd > 0 && t.count > 0)
      .sort((a, b) => a.usd - b.usd);
    if (!tiers.length) throw new AppError(404, 'service_not_found', 'No numbers for that service in this country right now.');
    return { usd: tiers[0]!.usd, count: tiers.reduce((sum, t) => sum + t.count, 0), tiers };
  },

  async buy(service, maxUsd, { country, tier }) {
    if (!country || !tier) throw badRequest('country_required', 'Pick a country and a price first.');
    const path = ['buy', 'activation', country, tier, service].map(encodeURIComponent).join('/');
    const r = await user(`${path}?${new URLSearchParams({ maxPrice: String(maxUsd) })}`);
    if (r.json?.id && r.json.phone) {
      return { id: String(r.json.id), number: String(r.json.phone), expiresAt: r.json.expires ? new Date(r.json.expires) : undefined };
    }
    const reason = (r.json?.message ?? r.text).toLowerCase();
    if (reason.includes('not enough user balance') || reason.includes('not enough rating')) {
      // OUR 5sim account can't buy (empty balance, or its rating is too low): say so to us loudly, plainly to the user.
      console.error(`[5sim] cannot buy: ${reason}`);
      throw new AppError(503, 'server_unavailable', 'This server is temporarily unavailable. Try another server.');
    }
    throw new AppError(409, 'no_numbers', 'No number is available right now. Try another price, service or server.');
  },

  async status(id): Promise<ProviderStatus> {
    const { json } = await user(`check/${encodeURIComponent(id)}`);
    const sms: { code?: string; text?: string }[] = Array.isArray(json?.sms) ? json.sms : [];
    const state = String(json?.status ?? '');
    // A code exists only once the `sms` list has an entry. NOTE: `RECEIVED` does NOT mean a message arrived: it is 5sim's
    // word for "number allocated, receiving SMS" (the normal waiting state; the list stays empty and we were already charged).
    if (sms.length > 0) {
      const last = sms[sms.length - 1];
      return { status: 'completed', code: String(last?.code || last?.text?.match(/\b\d{4,8}\b/)?.[0] || last?.text?.trim().slice(0, 100) || 'See message') };
    }
    // Cancelled, timed out or banned with no code: 5sim returns the money, so it is safe to refund.
    if (state === 'CANCELED' || state === 'TIMEOUT' || state === 'BANNED') return { status: 'cancelled' };
    return { status: 'pending' }; // PENDING / RECEIVED (waiting for the SMS)
  },

  async cancel(id) {
    // "you need to wait time" (too early) and "order has sms" (a code arrived) come back as errors: not cancelled.
    const r = await user(`cancel/${encodeURIComponent(id)}`);
    return r.status >= 200 && r.status < 300 && String(r.json?.status) === 'CANCELED';
  },

  async done(id) {
    await user(`finish/${encodeURIComponent(id)}`);
  },
};
