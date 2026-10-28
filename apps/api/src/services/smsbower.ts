import { AppError, badRequest } from '../lib/errors.js';
import { providerFetch } from '../lib/providerFetch.js';
import type { BuyProvider, PriceTier, ProviderStatus } from './providers/types.js';

/*
 * SMSBower (numbers in ~200 countries), the handler_api protocol, copied from how FloZap does it:
 *   price tiers  getPricesV3&service&country -> { <country>: { <service>: { <providerId>: { price, count, provider_id } } } }
 *                (several providers sell the same service, each at its own price and stock: one tier each)
 *   buy          getNumber&service&country&maxPrice=<price>&minPrice=<price>   (min = max: we pay exactly the tier the buyer saw)
 *                -> "ACCESS_NUMBER:<id>:<number>"
 *   status       getStatus&id          -> STATUS_OK:<code> | STATUS_CANCEL | STATUS_WAIT_*
 *   cancel       setStatus&status=8    -> ACCESS_CANCEL (instant, no waiting period)
 *   done         setStatus&status=6
 */
const base = () => process.env.SMSBOWER_BASE_URL || 'https://smsbower.page/stubs/handler_api.php';

const busy = () => new AppError(429, 'server_busy', 'This server is busy right now. Try again in a few seconds.');

function key(): string {
  const k = process.env.SMSBOWER_API_KEY;
  if (!k) {
    console.error(`[smsbower] not configured: SMSBOWER_API_KEY missing`);
    throw new AppError(503, 'server_not_configured', 'This server is temporarily unavailable. Try another server.');
  }
  return k;
}

async function handler(params: Record<string, string>): Promise<string> {
  const res = await providerFetch(`${base()}?${new URLSearchParams({ api_key: key(), ...params })}`);
  if (res.status === 429) throw busy();
  return (await res.text()).trim();
}

export const smsbowerProvider: BuyProvider = {
  country: 'United States', // never shown: the page always sends the country, and the order stores its name
  lifetimeMs: 20 * 60 * 1000, // numbers are held about 20 minutes

  async quote(service, { country }) {
    if (!country) throw badRequest('country_required', 'Pick a country first.');
    const text = await handler({ action: 'getPricesV3', service, country });
    let providers: Record<string, { price?: number | number[]; count?: number; provider_id?: number | string }> = {};
    try {
      providers = JSON.parse(text)?.[country]?.[service] ?? {}; // a plain-text answer (e.g. BAD_SERVICE) just means "nothing here"
    } catch {
      providers = {};
    }
    const tiers: PriceTier[] = Object.entries(providers)
      .map(([id, p]) => ({
        id: String(p.provider_id ?? id),
        usd: Number(Array.isArray(p.price) ? p.price[0] : p.price),
        count: Number(p.count ?? 0),
      }))
      .filter((t) => t.usd > 0 && t.count > 0)
      .sort((a, b) => a.usd - b.usd);
    if (!tiers.length) throw new AppError(404, 'service_not_found', 'No numbers for that service in this country right now.');
    return { usd: tiers[0]!.usd, count: tiers.reduce((sum, t) => sum + t.count, 0), tiers };
  },

  async buy(service, maxUsd, { country }) {
    if (!country) throw badRequest('country_required', 'Pick a country first.');
    const price = String(maxUsd);
    const text = await handler({ action: 'getNumber', service, country, maxPrice: price, minPrice: price });
    if (text.startsWith('ACCESS_NUMBER:')) {
      const [, id, number] = text.split(':');
      return { id: id!, number: `+${number}` };
    }
    if (text === 'NO_BALANCE') {
      // OUR SMSBower account is out of funds: say so to us loudly, and plainly to the user.
      console.error('[smsbower] the provider account balance is too low to buy: top up the SMSBower account');
      throw new AppError(503, 'server_unavailable', 'This server is temporarily unavailable. Try another server.');
    }
    if (text.startsWith('WRONG_MAX_PRICE')) throw new AppError(409, 'price_changed', 'The price just changed. Refresh and try again.');
    throw new AppError(409, 'no_numbers', 'No number is available right now. Try another price, service or server.');
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
