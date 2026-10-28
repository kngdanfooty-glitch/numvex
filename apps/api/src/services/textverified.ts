import { AppError } from '../lib/errors.js';
import { providerFetch } from '../lib/providerFetch.js';
import type { BuyProvider, ProviderStatus } from './providers/types.js';

/*
 * TextVerified v2 (US numbers). Unlike the handler_api servers it is a JSON API with a bearer token:
 *   POST /auth                      X-API-KEY + X-API-USERNAME  -> { token, expiresAt }
 *   POST /pricing/verifications     -> { serviceName, price }                      (dollars)
 *   POST /inventory/verifications   -> { availableQuantity }  (capped at 9000, meaning "9000 or more")
 *   POST /verifications             -> a link; GET it -> { id, number, state, endsAt }
 *   GET  /sms?to=<number>&reservationType=verification  -> { data: [{ parsedCode, smsContent, createdAt }] }
 *   POST /verifications/:id/cancel  -> 2xx when cancelled (TextVerified refunds us)
 */
const BASE = 'https://www.textverified.com/api/pub/v2';

let cached: { token: string; expiresAt: number } | null = null;

async function token(): Promise<string> {
  // Reuse the token until a minute before it expires.
  if (cached && cached.expiresAt - 60_000 > Date.now()) return cached.token;
  const key = process.env.TEXTVERIFIED_API_KEY;
  const user = process.env.TEXTVERIFIED_USERNAME;
  if (!key || !user) {
    console.error(`[textverified] not configured: TEXTVERIFIED_API_KEY / TEXTVERIFIED_USERNAME missing`);
    throw new AppError(503, 'server_not_configured', 'This server is temporarily unavailable. Try another server.');
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

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new AppError(502, 'provider_error', `The server answered ${res.status}. Try again shortly.`);
  return (await res.json()) as T;
}

/** TextVerified numbers come as 10 digits ("5551234567"); show them as +1... like the other servers. */
function formatNumber(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  return digits.length === 10 ? `+1${digits}` : `+${digits}`;
}

const GONE = new Set(['verificationCanceled', 'verificationTimedOut', 'verificationRefunded', 'verificationReported']);

interface Verification {
  id: string;
  number: string;
  state: string;
  createdAt: string;
  endsAt: string;
}

export const textverifiedProvider: BuyProvider = {
  country: 'United States',
  lifetimeMs: 10 * 60 * 1000,

  async quote(service) {
    const res = await call('POST', '/pricing/verifications', {
      serviceName: service,
      areaCode: false,
      carrier: false,
      numberType: 'mobile',
      capability: 'sms',
    });
    if (res.status === 404 || res.status === 400) throw new AppError(404, 'service_not_found', 'That service is not available on this server.');
    const { price } = await json<{ price: number }>(res);

    // Stock is a separate call. If it fails, still show the price: a missing stock figure shouldn't block a sale.
    const inv = await call('POST', '/inventory/verifications', { serviceName: service, numberType: 'mobile', capability: 'sms' });
    const count = inv.ok ? Number(((await inv.json()) as { availableQuantity: number }).availableQuantity) : null;
    return { usd: Number(price), count };
  },

  async buy(service, maxUsd) {
    const created = await call('POST', '/verifications', {
      serviceName: service,
      capability: 'sms',
      maxPrice: maxUsd,
    });
    if (!created.ok) throw new AppError(409, 'no_numbers', 'No number is available right now. Try another service or server.');
    // The answer is a link to the new verification: follow it to read the number.
    const link = ((await created.json()) as { href: string }).href;
    const v = await json<Verification>(await call('GET', link));
    return { id: v.id, number: formatNumber(v.number), expiresAt: new Date(v.endsAt) };
  },

  async status(id): Promise<ProviderStatus> {
    const v = await json<Verification>(await call('GET', `/verifications/${encodeURIComponent(id)}`));

    // The code can land before the state flips, so look for it first.
    const sms = await json<{ data: { parsedCode?: string | null; smsContent?: string | null; createdAt: string }[] }>(
      await call('GET', `/sms?to=${encodeURIComponent(v.number)}&reservationType=verification`),
    );
    const since = new Date(v.createdAt).getTime();
    for (const m of sms.data ?? []) {
      if (new Date(m.createdAt).getTime() < since) continue; // an older message on a reused number
      const code = m.parsedCode ?? m.smsContent?.match(/\d{4,8}/)?.[0];
      if (code) return { status: 'completed', code };
    }
    return GONE.has(v.state) ? { status: 'cancelled' } : { status: 'pending' };
  },

  async cancel(id) {
    return (await call('POST', `/verifications/${encodeURIComponent(id)}/cancel`)).ok;
  },
};
