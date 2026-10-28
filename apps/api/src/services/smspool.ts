import { AppError, badRequest } from '../lib/errors.js';
import { providerFetch } from '../lib/providerFetch.js';
import type { BuyProvider, PriceTier, ProviderStatus } from './providers/types.js';

/*
 * SMSPool (numbers in ~150 countries). Form-encoded POSTs with the key in the body, copied from how FloZap does it:
 *   price + stock  POST /request/success_rate  service=<id>  -> every country for that service:
 *                  [{ country_id, price (high), low_price, success_rate, stock }]. Two options: the cheapest (pricing_option 0)
 *                  and the one with the best success rate (pricing_option 1); when they cost the same there is just one.
 *   buy            POST /purchase/sms  country, service, pricing_option -> { success: 1, order_id, number, ... }
 *   status         POST /sms/check     orderid -> { status, sms }   1 waiting, 2 expired, 3 code arrived, 5 cancelled, 6 refunded
 *   cancel         POST /sms/cancel    orderid -> { success: 1 }  (refused for a few seconds after buying: "cannot be cancelled yet")
 *   done           POST /sms/check     (what FloZap's "mark as done" does for SMSPool)
 */
const BASE = 'https://api.smspool.net';
const LIST_TTL_MS = 30 * 1000; // one list covers every country for a service, so picking another country costs no call

const busy = () => new AppError(429, 'server_busy', 'This server is busy right now. Try again in a few seconds.');

function key(): string {
  const k = process.env.SMSPOOL_API_KEY;
  if (!k) {
    console.error(`[smspool] not configured: SMSPOOL_API_KEY missing`);
    throw new AppError(503, 'server_not_configured', 'This server is temporarily unavailable. Try another server.');
  }
  return k;
}

async function post(path: string, params: Record<string, string>): Promise<{ status: number; json: any }> {
  const res = await providerFetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: new URLSearchParams({ key: key(), ...params }),
  });
  if (res.status === 429) throw busy();
  return { status: res.status, json: await res.json().catch(() => null) };
}

interface CountryRow {
  country_id: number | string;
  price: string;
  low_price: string;
  success_rate?: number;
  stock: number;
}

const lists = new Map<string, { at: number; rows: CountryRow[] }>();
const inFlight = new Map<string, Promise<CountryRow[]>>();

async function countriesFor(service: string): Promise<CountryRow[]> {
  const hit = lists.get(service);
  if (hit && Date.now() - hit.at < LIST_TTL_MS) return hit.rows;
  let pending = inFlight.get(service);
  if (!pending) {
    pending = (async () => {
      try {
        const r = await post('/request/success_rate', { service });
        if (r.status !== 200 || !Array.isArray(r.json)) throw new AppError(502, 'provider_error', `The server answered ${r.status}. Try again shortly.`);
        lists.set(service, { at: Date.now(), rows: r.json });
        return r.json as CountryRow[];
      } catch (err) {
        if (hit) return hit.rows; // rate limited or down: keep serving the last good list
        throw err;
      } finally {
        inFlight.delete(service);
      }
    })();
    inFlight.set(service, pending);
  }
  return pending;
}

/** For tests: forget the cached lists. */
export function resetSmspoolCache() {
  lists.clear();
  inFlight.clear();
}

export const smspoolProvider: BuyProvider = {
  country: 'United States', // never shown: the page always sends the country, and the order stores its name
  lifetimeMs: 20 * 60 * 1000, // SMSPool holds a number about 20 minutes

  async quote(service, { country }) {
    if (!country) throw badRequest('country_required', 'Pick a country first.');
    const row = (await countriesFor(service)).find((r) => String(r.country_id) === country);
    const low = Number(row?.low_price);
    const high = Number(row?.price);
    const stock = Number(row?.stock ?? 0);
    if (!row || !(high > 0) || stock <= 0) throw new AppError(404, 'service_not_found', 'No numbers for that service in this country right now.');

    const tiers: PriceTier[] =
      low > 0 && low < high
        ? [
            { id: '0', usd: low, count: stock, note: 'Cheapest option' },
            { id: '1', usd: high, count: stock, note: 'Higher success rate' },
          ]
        : [{ id: '1', usd: high, count: stock }]; // same price: take the better one, and there is nothing to choose
    return { usd: tiers[0]!.usd, count: stock, tiers };
  },

  async buy(service, _maxUsd, { country, tier }) {
    if (!country) throw badRequest('country_required', 'Pick a country first.');
    const r = await post('/purchase/sms', { country, service, pricing_option: tier ?? '1' });
    if (r.json?.success === 1 && r.json.order_id) {
      const number = r.json.number ?? `${r.json.cc ?? ''}${r.json.phonenumber ?? ''}`;
      return { id: String(r.json.order_id), number: `+${number}` };
    }
    const message = String(r.json?.message ?? '');
    if (/balance|fund|credit/i.test(message)) {
      // OUR SMSPool account is out of funds: say so to us loudly, and plainly to the user.
      console.error('[smspool] the provider account balance is too low to buy: top up the SMSPool account');
      throw new AppError(503, 'server_unavailable', 'This server is temporarily unavailable. Try another server.');
    }
    throw new AppError(409, 'no_numbers', 'No number is available right now. Try another price, service or server.');
  },

  async status(id): Promise<ProviderStatus> {
    const { json } = await post('/sms/check', { orderid: id });
    if (Number(json?.status) === 3 && json.sms) return { status: 'completed', code: String(json.sms) };
    if (Number(json?.status) === 5 || Number(json?.status) === 6) return { status: 'cancelled' };
    return { status: 'pending' }; // 1 waiting, 2 expired (our expiry path cancels it for the refund), 4 resend
  },

  async cancel(id) {
    // success 1 = cancelled and refunded. "cannot be cancelled yet" (the first few seconds) = not cancelled; try again.
    return (await post('/sms/cancel', { orderid: id })).json?.success === 1;
  },

  async done(id) {
    await post('/sms/check', { orderid: id });
  },
};
