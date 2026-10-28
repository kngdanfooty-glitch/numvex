import { AppError } from '../lib/errors.js';
import { providerFetch } from '../lib/providerFetch.js';
import type { BuyProvider } from './providers/types.js';

/*
 * DaisySMS (USA numbers). It speaks the "handler_api.php" protocol: plain-text answers such as
 * "ACCESS_NUMBER:<id>:<number>", "STATUS_WAIT_CODE", "STATUS_OK:<code>", "NO_NUMBERS", "NO_MONEY".
 */
const BASE = 'https://daisysms.io/stubs/handler_api.php';

async function call(params: Record<string, string>): Promise<string> {
  const key = process.env.DAISYSMS_API_KEY;
  if (!key) {
    console.error(`[daisysms] not configured: DAISYSMS_API_KEY missing`);
    throw new AppError(503, 'server_not_configured', 'This server is temporarily unavailable. Try another server.');
  }
  const url = `${BASE}?${new URLSearchParams({ api_key: key, ...params })}`;
  const res = await providerFetch(url);
  if (!res.ok) throw new AppError(502, 'provider_error', `The server answered ${res.status}. Try again shortly.`);
  return (await res.text()).trim();
}

type PriceRow = { cost: number | string; count: number };

const PRICES_TTL_MS = 20 * 1000; // DaisySMS rate-limits (RATE_LIMIT_EXCEEDED), and one list serves every service
let pricesCache: { at: number; data: Record<string, PriceRow> } | null = null;
let pricesInFlight: Promise<Record<string, PriceRow>> | null = null;

async function fetchPrices(): Promise<Record<string, PriceRow>> {
  const answer = await call({ action: 'getPrices' });
  let raw: Record<string, any>;
  try {
    raw = JSON.parse(answer);
  } catch {
    // Not JSON: DaisySMS said something like RATE_LIMIT_EXCEEDED. Reuse the last good list if we have one.
    if (pricesCache) return pricesCache.data;
    throw new AppError(429, 'server_busy', 'This server is busy right now. Try again in a few seconds.');
  }
  // The docs nest it under the USA code (187); the older flat shape still works.
  const usa = raw['187'];
  const data: Record<string, PriceRow> = usa && typeof usa === 'object' ? usa : raw;
  pricesCache = { at: Date.now(), data };
  return data;
}

/** Every service with its dollar price and stock. Cached for a few seconds and shared between simultaneous callers. */
export async function daisyPrices(): Promise<Record<string, PriceRow>> {
  if (pricesCache && Date.now() - pricesCache.at < PRICES_TTL_MS) return pricesCache.data;
  pricesInFlight ??= fetchPrices().finally(() => {
    pricesInFlight = null;
  });
  return pricesInFlight;
}

/** For tests: forget the cached list. */
export function resetDaisyPricesCache() {
  pricesCache = null;
  pricesInFlight = null;
}

/** Dollar price and stock for one service. */
export async function daisyPrice(service: string): Promise<{ usd: number; count: number }> {
  const hit = (await daisyPrices())[service];
  if (!hit) throw new AppError(404, 'service_not_found', 'That service is not available on this server.');
  return { usd: Number(hit.cost), count: hit.count };
}

export async function daisyBuy(service: string, maxUsd: number): Promise<{ id: string; number: string }> {
  // max_price is inclusive; round UP to the cent so rounding can never make our own price "exceed" it.
  const answer = await call({ action: 'getNumber', service, max_price: (Math.ceil(maxUsd * 100 - 1e-9) / 100).toFixed(2) });
  if (answer.startsWith('ACCESS_NUMBER:')) {
    const [, id, number] = answer.split(':');
    return { id: id!, number: `+${number}` };
  }
  if (answer === 'RATE_LIMIT_EXCEEDED') throw new AppError(429, 'server_busy', 'This server is busy right now. Try again in a few seconds.');
  if (answer === 'NO_MONEY') {
    // OUR DaisySMS account is out of funds. That's not "no numbers": say so to us loudly, and plainly to the user.
    console.error('[daisysms] the provider account balance is too low to buy: top up the DaisySMS account');
    throw new AppError(503, 'server_unavailable', 'This server is temporarily unavailable. Try another server.');
  }
  if (answer === 'MAX_PRICE_EXCEEDED') throw new AppError(409, 'price_changed', 'The price just changed. Refresh and try again.');
  throw new AppError(409, 'no_numbers', 'No number is available right now. Try another service or server.');
}

export type DaisyStatus = { status: 'pending' } | { status: 'completed'; code: string } | { status: 'cancelled' };

export async function daisyStatus(id: string): Promise<DaisyStatus> {
  const answer = await call({ action: 'getStatus', id });
  if (answer === 'RATE_LIMIT_EXCEEDED') throw new AppError(429, 'server_busy', 'This server is busy right now. Try again in a few seconds.');
  if (answer.startsWith('STATUS_OK:')) return { status: 'completed', code: answer.slice('STATUS_OK:'.length) };
  // NO_ACTIVATION = DaisySMS no longer knows the order, so no code can come: treat as cancelled (same as FloZap).
  if (answer === 'STATUS_CANCEL' || answer === 'NO_ACTIVATION') return { status: 'cancelled' };
  return { status: 'pending' };
}

/** true = DaisySMS cancelled it (so we may refund). false = it can't be cancelled (e.g. the code already arrived). */
export async function daisyCancel(id: string): Promise<boolean> {
  return (await call({ action: 'setStatus', id, status: '8' })) === 'ACCESS_CANCEL';
}

/** Tell DaisySMS we're finished with the number (status 6), like FloZap's markDaisyRentalDone. Frees our concurrent-rental slot. */
export async function daisyDone(id: string): Promise<void> {
  await call({ action: 'setStatus', id, status: '6' });
}

export const daisyProvider: BuyProvider = {
  country: 'United States',
  lifetimeMs: 15 * 60 * 1000, // DaisySMS holds a number about this long
  quote: daisyPrice,
  buy: daisyBuy,
  status: daisyStatus,
  cancel: daisyCancel,
  done: daisyDone,
};
