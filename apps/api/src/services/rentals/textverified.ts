import type { RentalCountry } from '@numvexs/shared';
import { AppError } from '../../lib/errors.js';
import { providerFetch } from '../../lib/providerFetch.js';
import type { ProviderRentalOption, ProviderSms, RentalProvider } from './types.js';

/*
 * TextVerified v2 rentals (US). Same sign-in as the one-time numbers (X-API-KEY + X-API-USERNAME -> bearer token). We sell only
 * non-renewable, always-on rentals of the "allservices" line (works for any app), so there is nothing to wake and nothing that bills on its own.
 *   price      POST /pricing/rentals          { serviceName, areaCode:false, numberType:'mobile', capability:'sms', isRenewable:false, alwaysOn:true, duration } -> { price }
 *   rent       POST /reservations/rental      same fields + allowBackOrderReservations:false -> a link to the sale; GET it -> { state, reservations:[{ id }] }
 *   details    GET  /reservations/rental/nonrenewable/:id -> { id, number, endsAt, state }
 *   extend     POST /reservations/rentals/extensions { extensionDuration, rentalId } -> 2xx
 *   messages   GET  /sms?to=<number>&reservationType=nonrenewable -> { data: [{ id, from, smsContent, parsedCode, createdAt }] }
 * Seen live with our key: the price call, the empty sms list and the empty rental list. NOT yet seen (no purchase made): the sale and
 * rental replies, so those are read defensively and anything unexpected after the purchase call becomes 'purchase_unclear'.
 */
const BASE = 'https://www.textverified.com/api/pub/v2';
const SERVICE = 'allservices';
const DURATIONS = [
  { id: 'threeDay', label: '3 days', days: 3 },
  { id: 'sevenDay', label: '7 days', days: 7 },
  { id: 'fourteenDay', label: '14 days', days: 14 },
  { id: 'thirtyDay', label: '30 days', days: 30 },
  { id: 'ninetyDay', label: '90 days', days: 90 },
] as const;

let cached: { token: string; expiresAt: number } | null = null;

async function token(): Promise<string> {
  if (cached && cached.expiresAt - 60_000 > Date.now()) return cached.token;
  const key = process.env.TEXTVERIFIED_API_KEY;
  const user = process.env.TEXTVERIFIED_USERNAME;
  if (!key || !user) {
    console.error('[config] TEXTVERIFIED_API_KEY / TEXTVERIFIED_USERNAME missing: this server is switched off for users');
    throw new AppError(503, 'server_not_configured', "This server isn't set up yet.");
  }
  const res = await providerFetch(`${BASE}/auth`, { method: 'POST', headers: { 'X-API-KEY': key, 'X-API-USERNAME': user } });
  if (!res.ok) throw new AppError(502, 'provider_error', 'Could not sign in to this server.');
  const body = (await res.json()) as { token: string; expiresAt: string };
  cached = { token: body.token, expiresAt: new Date(body.expiresAt).getTime() };
  return body.token;
}

async function call(method: 'GET' | 'POST', path: string, body?: unknown): Promise<Response> {
  const url = path.startsWith('http') ? path : `${BASE}${path}`;
  return providerFetch(url, {
    method,
    headers: { Authorization: `Bearer ${await token()}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
}

const spec = (duration: string) => ({ serviceName: SERVICE, areaCode: false, numberType: 'mobile', capability: 'sms', isRenewable: false, alwaysOn: true, duration });

async function priceOf(duration: string): Promise<number> {
  const res = await call('POST', '/pricing/rentals', spec(duration));
  if (res.status === 400 || res.status === 404) throw new AppError(404, 'option_not_found', 'That rental length is not available.');
  if (!res.ok) throw new AppError(502, 'provider_error', `The server answered ${res.status}. Try again shortly.`);
  return Number(((await res.json()) as { price: number }).price);
}

const unclearPurchase = () => new AppError(502, 'purchase_unclear', 'We are confirming your purchase with the server. It will appear in your rentals or be refunded.');

/** TextVerified numbers come as 10 digits; show them as +1... like the other servers. */
const formatNumber = (raw: string) => {
  const d = raw.replace(/\D/g, '');
  return d.length === 10 ? `+1${d}` : `+${d}`;
};

async function ensureFresh(optionId: string, maxUsd: number) {
  if (!DURATIONS.some((d) => d.id === optionId)) throw new AppError(404, 'option_not_found', 'That rental length is not available.');
  if ((await priceOf(optionId)) > maxUsd + 0.005) throw new AppError(409, 'price_changed', 'The price just changed. Refresh and try again.');
}

export const textverifiedRentals: RentalProvider = {
  async countries(): Promise<RentalCountry[]> {
    return [{ id: 'US', name: 'United States' }];
  },

  async options(): Promise<ProviderRentalOption[]> {
    const out: ProviderRentalOption[] = [];
    for (const d of DURATIONS) {
      try {
        out.push({ ...d, usd: await priceOf(d.id) }); // a length with no price right now (it answers "Pricing not found") is simply not offered
      } catch (err) {
        if (!(err instanceof AppError) || err.code !== 'option_not_found') throw err;
      }
    }
    return out;
  },

  async rent(optionId, _country, maxUsd) {
    await ensureFresh(optionId, maxUsd);
    // From here on the provider may have charged us. Nothing below may be reported as a plain failure unless it clearly was one.
    let res: Response;
    try {
      res = await call('POST', '/reservations/rental', { ...spec(optionId), allowBackOrderReservations: false });
    } catch {
      throw unclearPurchase();
    }
    if (res.status === 400 || res.status === 402 || res.status === 409 || res.status === 422) {
      const text = await res.text().catch(() => '');
      console.error(`[textverified rentals] purchase refused ${res.status}: ${text.slice(0, 200)}`);
      throw new AppError(409, 'no_numbers', 'No rental number is available right now. Try another length or server.');
    }
    if (!res.ok) throw unclearPurchase();

    try {
      const href = ((await res.json()) as { href?: string }).href;
      if (!href) throw unclearPurchase();
      // The sale can take a moment to finish.
      for (let i = 0; i < 6; i++) {
        const sale = (await (await call('GET', href)).json()) as { state?: string; reservations?: { id?: string }[] };
        if (sale.state === 'failed') throw new AppError(409, 'no_numbers', 'No rental number is available right now. Try another length or server.');
        const id = sale.reservations?.[0]?.id;
        if (sale.state === 'succeeded' && id) {
          const r = (await (await call('GET', `/reservations/rental/nonrenewable/${encodeURIComponent(id)}`)).json()) as { id: string; number: string; endsAt: string };
          if (!r.number || !r.endsAt) throw unclearPurchase();
          return { ref: String(r.id ?? id), number: formatNumber(r.number), expiresAt: new Date(r.endsAt) };
        }
        await new Promise((ok) => setTimeout(ok, 1000));
      }
    } catch (err) {
      if (err instanceof AppError && err.code !== 'provider_unreachable' && err.code !== 'provider_error') throw err;
    }
    throw unclearPurchase();
  },

  async extend(ref, optionId, _country, maxUsd) {
    await ensureFresh(optionId, maxUsd);
    let res: Response;
    try {
      res = await call('POST', '/reservations/rentals/extensions', { extensionDuration: optionId, rentalId: ref });
    } catch {
      throw unclearPurchase();
    }
    if (res.status >= 400 && res.status < 500) {
      console.error(`[textverified rentals] extension refused ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
      throw new AppError(409, 'extend_failed', 'The server did not extend this rental. Nothing was charged.');
    }
    if (!res.ok) throw unclearPurchase();
    // The new end date: read it back. If that fails the caller adds the days itself.
    const r = await call('GET', `/reservations/rental/nonrenewable/${encodeURIComponent(ref)}`).then((x) => (x.ok ? (x.json() as Promise<{ endsAt?: string }>) : null)).catch(() => null);
    return { expiresAt: r?.endsAt ? new Date(r.endsAt) : undefined };
  },

  async messages(_ref, number): Promise<ProviderSms[]> {
    const to = number.replace(/\D/g, '').slice(-10);
    const res = await call('GET', `/sms?to=${encodeURIComponent(to)}&reservationType=nonrenewable`);
    if (!res.ok) throw new AppError(502, 'provider_error', `The server answered ${res.status}.`);
    const body = (await res.json()) as { data?: { id: string; from?: string | null; smsContent?: string | null; parsedCode?: string | null; createdAt: string }[] };
    return (body.data ?? []).map((m) => ({
      id: String(m.id),
      from: m.from ?? null,
      text: m.smsContent ?? '',
      code: m.parsedCode ?? m.smsContent?.match(/\b\d{4,8}\b/)?.[0] ?? null,
      receivedAt: new Date(m.createdAt),
    }));
  },
};
