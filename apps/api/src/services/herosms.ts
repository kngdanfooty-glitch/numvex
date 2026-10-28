import { AppError, badRequest } from '../lib/errors.js';
import { providerFetch } from '../lib/providerFetch.js';
import type { BuyProvider, PriceTier, ProviderStatus } from './providers/types.js';

/*
 * HeroSMS (numbers in ~195 countries). Copied from how FloZap does it:
 *   price tiers   GET  /api/v1/activations/offers?services=<code>&countries=<id>   (header Authorization: ApiKey ...)
 *                      -> data[code][id].map = { "<price>": <stock>, ... }: the same number at several prices
 *   buy           GET  handler_api.php?action=getNumber&service&country&fixedPrice=<tier price>&freePrice=true
 *                      -> "ACCESS_NUMBER:<id>:<number>"   (fixedPrice = we pay exactly the tier the buyer saw)
 *   status        GET  handler_api.php?action=getStatus&id  -> STATUS_OK:<code> | STATUS_CANCEL | STATUS_WAIT_*
 *   cancel        GET  handler_api.php?action=cancelActivation&id -> HTTP 204; 409 EARLY_CANCEL_DENIED in the first ~2 min
 *   done          POST handler_api.php?action=finishActivation&id
 */
const BASE = 'https://hero-sms.com/stubs/handler_api.php';
const OFFERS = 'https://hero-sms.com/api/v1/activations/offers';

const busy = () => new AppError(429, 'server_busy', 'This server is busy right now. Try again in a few seconds.');

function key(): string {
  const k = process.env.HEROSMS_API_KEY;
  if (!k) {
    console.error(`[herosms] not configured: HEROSMS_API_KEY missing`);
    throw new AppError(503, 'server_not_configured', 'This server is temporarily unavailable. Try another server.');
  }
  return k;
}

async function handler(params: Record<string, string>, method: 'GET' | 'POST' = 'GET'): Promise<{ status: number; text: string }> {
  const res = await providerFetch(`${BASE}?${new URLSearchParams({ api_key: key(), ...params })}`, { method });
  if (res.status === 429) throw busy();
  return { status: res.status, text: (await res.text()).trim() };
}

export const herosmsProvider: BuyProvider = {
  country: 'United States', // never shown: buy() works the real country out from what the buyer picked
  lifetimeMs: 20 * 60 * 1000, // HeroSMS holds a number about 20 minutes

  async quote(service, { country }) {
    if (!country) throw badRequest('country_required', 'Pick a country first.');
    const res = await providerFetch(`${OFFERS}?${new URLSearchParams({ services: service, countries: country })}`, {
      headers: { Authorization: `ApiKey ${key()}`, accept: 'application/json' },
    });
    if (res.status === 429) throw busy();
    if (!res.ok) throw new AppError(502, 'provider_error', `The server answered ${res.status}. Try again shortly.`);
    const body = (await res.json().catch(() => ({}))) as { data?: Record<string, Record<string, { map?: Record<string, number> }>> };
    const map = body.data?.[service]?.[country]?.map ?? {};
    const tiers: PriceTier[] = Object.entries(map)
      .map(([price, count]) => ({ id: price, usd: parseFloat(price), count: Number(count) }))
      .filter((t) => t.usd > 0 && t.count > 0)
      .sort((a, b) => a.usd - b.usd);
    if (!tiers.length) throw new AppError(404, 'service_not_found', 'No numbers for that service in this country right now.');
    // The counts only ever grow with the price ("this many at this price or less"), so the biggest is the total.
    return { usd: tiers[0]!.usd, count: Math.max(...tiers.map((t) => t.count)), tiers };
  },

  async buy(service, maxUsd, { country }) {
    if (!country) throw badRequest('country_required', 'Pick a country first.');
    const { text } = await handler({ action: 'getNumber', service, country, fixedPrice: String(maxUsd), freePrice: 'true' });
    if (text.startsWith('ACCESS_NUMBER:')) {
      const [, id, number] = text.split(':');
      return { id: id!, number: `+${number}` };
    }
    if (text === 'NO_BALANCE') {
      // OUR HeroSMS account is out of funds: say so to us loudly, and plainly to the user.
      console.error('[herosms] the provider account balance is too low to buy: top up the HeroSMS account');
      throw new AppError(503, 'server_unavailable', 'This server is temporarily unavailable. Try another server.');
    }
    if (text.startsWith('WRONG_MAX_PRICE')) throw new AppError(409, 'price_changed', 'The price just changed. Refresh and try again.');
    throw new AppError(409, 'no_numbers', 'No number is available right now. Try another price, service or server.');
  },

  async status(id): Promise<ProviderStatus> {
    const { text } = await handler({ action: 'getStatus', id });
    if (text.startsWith('STATUS_OK')) return { status: 'completed', code: text.slice(text.indexOf(':') + 1).trim() };
    if (text === 'STATUS_CANCEL' || text === 'ACCESS_CANCEL') return { status: 'cancelled' };
    return { status: 'pending' };
  },

  async cancel(id) {
    // 2xx = cancelled. 409 EARLY_CANCEL_DENIED = too soon (the first ~2 minutes), so we say "not cancelled" and try later.
    const { status } = await handler({ action: 'cancelActivation', id });
    return status >= 200 && status < 300;
  },

  async done(id) {
    await handler({ action: 'finishActivation', id }, 'POST');
  },
};
