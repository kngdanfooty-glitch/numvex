import { env } from '../config/env.js';
import { AppError, badRequest } from '../lib/errors.js';
import { providerFetch } from '../lib/providerFetch.js';
import type { BuyProvider, ProviderStatus } from './providers/types.js';
import { rates } from './settings.service.js';

/*
 * JuicySMS v2 (US, UK, NL, PH, PL, DE one-time numbers). Bearer-key JSON API, prices in EUR:
 *   price      GET  /services?country=<code>   -> every service priced for that country in one call (no stock figures)
 *   buy        POST /orders { service_id, country, max_price }  -> an order with phone_number, expires_at (10-minute window)
 *   status     GET  /orders/:id/messages -> { order_status, data: [{ code, text }] }   pending | completed | canceled | expired
 *   cancel     POST /orders/:id/cancel   (free; 409 order_not_open once it is no longer pending)
 * Nothing is charged until a message arrives, so a cancelled or expired order costs us nothing (refund at once).
 * Errors are problem documents: branch on `code`. The account may hold ONE open order at a time unless
 * `parallel_orders_allowed` is on: a second buy is 409 concurrent_order_limit.
 */
const BASE = 'https://juicysms.com/api/v2';
const LIST_TTL_MS = 30 * 1000;

const BUSY_MESSAGE = 'This server can only give out one number at a time and is busy right now. Try again in a minute, or use another server.';

function key(): string {
  const k = process.env.JUICYSMS_API_KEY;
  if (!k) {
    console.error(`[juicysms] not configured: JUICYSMS_API_KEY missing`);
    throw new AppError(503, 'server_not_configured', 'This server is temporarily unavailable. Try another server.');
  }
  return k;
}

async function call(method: 'GET' | 'POST', path: string, body?: unknown): Promise<{ status: number; json: any }> {
  const res = await providerFetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${key()}`, accept: 'application/json', ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  if (res.status === 429) {
    throw new AppError(429, 'server_busy', 'This server is busy right now. Try again in a few seconds.', { retryAfterSec: Number(res.headers.get('retry-after')) || undefined });
  }
  return { status: res.status, json };
}

interface ServiceRow {
  id: number;
  price: { amount: string } | null;
}

const lists = new Map<string, { at: number; rows: ServiceRow[] }>();
const inFlight = new Map<string, Promise<ServiceRow[]>>();

/** Every service priced for one country. Cached for a few seconds and shared between simultaneous callers. */
async function servicesFor(country: string): Promise<ServiceRow[]> {
  const hit = lists.get(country);
  if (hit && Date.now() - hit.at < LIST_TTL_MS) return hit.rows;
  let pending = inFlight.get(country);
  if (!pending) {
    pending = (async () => {
      try {
        const r = await call('GET', `/services?country=${encodeURIComponent(country)}`);
        if (r.status === 422) throw new AppError(404, 'service_not_found', 'That country is not available on this server.');
        if (r.status !== 200 || !Array.isArray(r.json?.data)) throw new AppError(502, 'provider_error', `The server answered ${r.status}. Try again shortly.`);
        lists.set(country, { at: Date.now(), rows: r.json.data });
        return r.json.data as ServiceRow[];
      } catch (err) {
        if (hit) return hit.rows; // rate limited or down: keep serving the last good list
        throw err;
      } finally {
        inFlight.delete(country);
      }
    })();
    inFlight.set(country, pending);
  }
  return pending;
}

/** For tests: forget the cached lists. */
export function resetJuicyCache() {
  lists.clear();
  inFlight.clear();
}

/** JuicySMS prices are euros; the rest of the app prices from dollars, so convert at EUR_USD_RATE. */
const eurToUsd = (eur: number) => eur * rates().eurUsdRate;

async function priceRow(service: string, country: string): Promise<ServiceRow & { price: { amount: string } }> {
  const row = (await servicesFor(country)).find((r) => String(r.id) === service);
  if (!row?.price || !(Number(row.price.amount) > 0)) throw new AppError(404, 'service_not_found', 'That service is not available for this country.');
  return row as ServiceRow & { price: { amount: string } };
}

export const juicysmsProvider: BuyProvider = {
  country: 'United States', // never shown: the page always sends the country, and the order stores its name
  lifetimeMs: 10 * 60 * 1000, // a ten-minute window

  async quote(service, { country }) {
    if (!country) throw badRequest('country_required', 'Pick a country first.');
    const row = await priceRow(service, country);
    return { usd: eurToUsd(Number(row.price.amount)), count: null }; // JuicySMS publishes no stock figures
  },

  async buy(service, _maxUsd, { country }) {
    if (!country) throw badRequest('country_required', 'Pick a country first.');
    // The ceiling is the EUR price the buyer was quoted: if it moved up since, JuicySMS refuses and nothing is allocated.
    const { price } = await priceRow(service, country);
    const order = { service_id: Number(service), country, max_price: price.amount };

    let r = await call('POST', '/orders', order);
    if (r.json?.code === 'service_busy') r = await call('POST', '/orders', order); // "retry immediately": another order for it is being allocated

    if (r.status === 201 && r.json?.id && r.json.phone_number) {
      return { id: String(r.json.id), number: String(r.json.phone_number), expiresAt: r.json.expires_at ? new Date(r.json.expires_at) : undefined };
    }
    switch (r.json?.code) {
      case 'concurrent_order_limit':
      case 'service_busy':
        throw new AppError(429, 'server_busy', BUSY_MESSAGE);
      case 'out_of_stock':
        throw new AppError(409, 'no_numbers', 'No number is available right now. Try another service, country or server.');
      case 'price_above_maximum':
        throw new AppError(409, 'price_changed', 'The price just changed. Refresh and try again.');
      case 'insufficient_balance':
        // OUR JuicySMS account is out of funds: say so to us loudly, and plainly to the user.
        console.error('[juicysms] the provider account balance is too low to buy: top up the JuicySMS account');
        throw new AppError(503, 'server_unavailable', 'This server is temporarily unavailable. Try another server.');
      default:
        throw new AppError(502, 'provider_error', 'Could not get a number right now. Try again shortly.');
    }
  },

  async status(id): Promise<ProviderStatus> {
    const { json } = await call('GET', `/orders/${encodeURIComponent(id)}/messages`);
    const messages: { code: string | null; text: string }[] = Array.isArray(json?.data) ? json.data : [];
    if (messages.length > 0 || json?.order_status === 'completed') {
      const withCode = messages.find((m) => m.code);
      const text = messages[0]?.text ?? '';
      // `code` is JuicySMS's best guess; if it found none, show the text itself so the user can still read it.
      return { status: 'completed', code: withCode?.code ?? (text.match(/\b\d{4,8}\b/)?.[0] ?? (text.trim().slice(0, 100) || 'See message')) };
    }
    // canceled / expired: never charged, so it is safe to refund at once.
    if (json?.order_status === 'canceled' || json?.order_status === 'expired') return { status: 'cancelled' };
    return { status: 'pending' };
  },

  async cancel(id) {
    const r = await call('POST', `/orders/${encodeURIComponent(id)}/cancel`);
    if (r.status === 200) return true;
    // 409 order_not_open: it is no longer pending. Only a number that was already cancelled/expired counts as cancelled.
    const after = await call('GET', `/orders/${encodeURIComponent(id)}/messages`);
    return after.json?.order_status === 'canceled' || after.json?.order_status === 'expired';
  },
};
