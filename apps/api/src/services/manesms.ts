import { AppError, badRequest } from '../lib/errors.js';
import { providerFetch } from '../lib/providerFetch.js';
import type { BuyProvider, PriceTier, ProviderStatus } from './providers/types.js';

/*
 * ManeSMS (many countries), the SMS-Activate "handler_api.php" protocol (manesms.com/api-docs):
 *   price     getPricesV2&service&country   -> { <country>: { <service>: { prices: { "<price>": <count at or under it> } } } }  (every tier)
 *   buy       getNumber&service&country&maxPrice=<price>   -> "ACCESS_NUMBER:<id>:<number>" (cheapest at or under maxPrice, else WRONG_MAX_PRICE)
 *             add fixedPrice=true to buy exactly that tier (the one the buyer picked)
 *   status    getStatus&id                -> STATUS_OK:<code> | STATUS_CANCEL | STATUS_WAIT_*
 *   cancel    setStatus&status=8          -> ACCESS_CANCEL
 *   done      setStatus&status=6
 * A wrong key answers HTTP 401 "BAD_KEY".
 */
const base = () => process.env.MANESMS_BASE_URL || 'https://manesms.com/stubs/handler_api.php';

const busy = () => new AppError(429, 'server_busy', 'This server is busy right now. Try again in a few seconds.');
const unavailable = () => new AppError(503, 'server_unavailable', 'This server is temporarily unavailable. Try another server.');

function key(): string {
  const k = process.env.MANESMS_API_KEY;
  if (!k) {
    console.error(`[manesms] not configured: MANESMS_API_KEY missing`);
    throw new AppError(503, 'server_not_configured', 'This server is temporarily unavailable. Try another server.');
  }
  return k;
}

async function handler(params: Record<string, string>): Promise<string> {
  const res = await providerFetch(`${base()}?${new URLSearchParams({ api_key: key(), ...params })}`);
  if (res.status === 429) throw busy();
  const text = (await res.text()).trim();
  if (res.status === 401 || text === 'BAD_KEY') {
    console.error('[manesms] the provider rejected our API key: check MANESMS_API_KEY');
    throw unavailable();
  }
  return text;
}

export const manesmsProvider: BuyProvider = {
  country: 'United States', // never shown: the page always sends the country, and the order stores its name
  lifetimeMs: 15 * 60 * 1000, // not documented; the wait is capped at 7 minutes anyway

  async quote(service, { country }) {
    if (!country) throw badRequest('country_required', 'Pick a country first.');
    const text = await handler({ action: 'getPricesV2', service, country });
    let prices: Record<string, number | string> = {};
    try {
      prices = JSON.parse(text)?.[country]?.[service]?.prices ?? {}; // a plain-text answer (e.g. BAD_SERVICE) just means "nothing here"
    } catch {
      prices = {};
    }
    const tiers: PriceTier[] = Object.entries(prices)
      .map(([price, count]) => ({ id: price, usd: parseFloat(price), count: Number(count) }))
      .filter((t) => t.usd > 0 && t.count > 0)
      .sort((a, b) => a.usd - b.usd);
    if (!tiers.length) throw new AppError(404, 'service_not_found', 'No numbers for that service in this country right now.');
    // The counts are "this many at this price or less", so the biggest is the total. One price needs no choosing.
    const count = Math.max(...tiers.map((t) => t.count));
    return tiers.length > 1 ? { usd: tiers[0]!.usd, count, tiers } : { usd: tiers[0]!.usd, count };
  },

  async buy(service, maxUsd, { country, tier }) {
    if (!country) throw badRequest('country_required', 'Pick a country first.');
    // maxPrice is inclusive; round UP to the cent so rounding can never make our own price "exceed" it.
    // A picked tier is bought exactly (fixedPrice); otherwise maxPrice is just a ceiling.
    const text = await handler({
      action: 'getNumber',
      service,
      country,
      maxPrice: tier ? String(maxUsd) : (Math.ceil(maxUsd * 100 - 1e-9) / 100).toFixed(2),
      ...(tier ? { fixedPrice: 'true' } : {}),
    });
    if (text.startsWith('ACCESS_NUMBER:')) {
      const [, id, number] = text.split(':');
      return { id: id!, number: `+${number}` };
    }
    if (text === 'NO_BALANCE') {
      // OUR ManeSMS account is out of funds: say so to us loudly, and plainly to the user.
      console.error('[manesms] the provider account balance is too low to buy: top up the ManeSMS account');
      throw unavailable();
    }
    if (text.startsWith('WRONG_MAX_PRICE')) throw new AppError(409, 'price_changed', 'The price just changed. Refresh and try again.');
    throw new AppError(409, 'no_numbers', 'No number is available right now. Try another service or server.');
  },

  async status(id): Promise<ProviderStatus> {
    const text = await handler({ action: 'getStatus', id });
    if (text.startsWith('STATUS_OK')) return { status: 'completed', code: text.slice(text.indexOf(':') + 1).trim() };
    if (text === 'STATUS_CANCEL' || text === 'ACCESS_CANCEL') return { status: 'cancelled' };
    return { status: 'pending' };
  },

  async cancel(id) {
    return (await handler({ action: 'setStatus', status: '8', id })) === 'ACCESS_CANCEL';
  },

  async done(id) {
    await handler({ action: 'setStatus', status: '6', id });
  },
};
