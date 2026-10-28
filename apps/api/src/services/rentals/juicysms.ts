import type { RentalCountry } from '@numvexs/shared';
import { AppError } from '../../lib/errors.js';
import { providerFetch } from '../../lib/providerFetch.js';
import { rates } from '../settings.service.js';
import type { ProviderRentalOption, ProviderSms, RentalProvider } from './types.js';

/*
 * JuicySMS v2 rentals (Netherlands and United Kingdom). Same bearer key as the one-time numbers; prices in EUR.
 *   packages   GET   /rental-packages               -> { data: [{ key:'1m', name:'1 Month', days:31, your_price:{ amount:'15.00' } }] }   (seen live)
 *   rent       POST  /rentals { country:'NL'|'UK', package, auto_renew:false } -> the rental (id, phone_number, expires_at)
 *   extend     POST  /rentals/:id/extend { package }
 *   messages   GET   /rentals/:id/messages          -> { data: [{ code, text, ... }] }
 * We always send auto_renew:false: nothing here bills on its own.
 * NOT yet seen (no purchase made): the reply shapes of rent / extend / messages, so they are read defensively; an unexpected reply after
 * the purchase call becomes 'purchase_unclear' (money held, not refunded).
 */
const BASE = 'https://juicysms.com/api/v2';
const COUNTRIES: RentalCountry[] = [
  { id: 'NL', name: 'Netherlands' },
  { id: 'UK', name: 'United Kingdom' },
];

function key(): string {
  const k = process.env.JUICYSMS_API_KEY;
  if (!k) {
    console.error('[config] JUICYSMS_API_KEY missing: this server is switched off for users');
    throw new AppError(503, 'server_not_configured', "This server isn't set up yet.");
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
  if (res.status === 429) throw new AppError(429, 'server_busy', 'This server is busy right now. Try again in a few seconds.');
  return { status: res.status, json };
}

const unclearPurchase = () => new AppError(502, 'purchase_unclear', 'We are confirming your purchase with the server. It will appear in your rentals or be refunded.');
const eurToUsd = (eur: number) => eur * rates().eurUsdRate;

async function packages(): Promise<ProviderRentalOption[]> {
  const r = await call('GET', '/rental-packages');
  if (r.status !== 200 || !Array.isArray(r.json?.data)) throw new AppError(502, 'provider_error', `The server answered ${r.status}. Try again shortly.`);
  return r.json.data
    .filter((p: any) => Number(p.your_price?.amount) > 0)
    .map((p: any) => ({ id: String(p.key), label: String(p.name), days: Number(p.days), usd: eurToUsd(Number(p.your_price.amount)) }));
}

async function ensureFresh(optionId: string, country: string, maxUsd: number) {
  if (!COUNTRIES.some((c) => c.id === country)) throw new AppError(404, 'country_not_found', 'That country is not available on this server.');
  const live = (await packages()).find((p) => p.id === optionId);
  if (!live) throw new AppError(404, 'option_not_found', 'That rental length is not available.');
  if (live.usd > maxUsd + 0.005) throw new AppError(409, 'price_changed', 'The price just changed. Refresh and try again.');
}

function refusal(code: string | undefined): AppError | null {
  switch (code) {
    case 'out_of_stock':
      return new AppError(409, 'no_numbers', 'No rental number is available right now. Try another country, length or server.');
    case 'insufficient_balance':
      console.error('[juicysms rentals] the provider account balance is too low: top up the JuicySMS account');
      return new AppError(503, 'server_unavailable', 'This server is temporarily unavailable. Try another server.');
    case 'validation_failed':
    case 'invalid_package':
      return new AppError(404, 'option_not_found', 'That rental length is not available.');
    default:
      return null;
  }
}

export const juicysmsRentals: RentalProvider = {
  async countries() {
    return COUNTRIES;
  },

  async options(country) {
    if (!COUNTRIES.some((c) => c.id === country)) throw new AppError(404, 'country_not_found', 'That country is not available on this server.');
    return packages();
  },

  async rent(optionId, country, maxUsd) {
    await ensureFresh(optionId, country, maxUsd);
    let r;
    try {
      r = await call('POST', '/rentals', { country, package: optionId, auto_renew: false });
    } catch {
      throw unclearPurchase();
    }
    const id = r.json?.id ?? r.json?.contract_id;
    const number = r.json?.phone_number ?? r.json?.number;
    if ((r.status === 200 || r.status === 201) && id && number && r.json?.expires_at) {
      return { ref: String(id), number: String(number), expiresAt: new Date(r.json.expires_at) };
    }
    if (r.status >= 400 && r.status < 500) {
      console.error(`[juicysms rentals] purchase refused ${r.status}: ${JSON.stringify(r.json)?.slice(0, 200)}`);
      throw refusal(r.json?.code) ?? new AppError(409, 'no_numbers', 'No rental number is available right now. Try another country, length or server.');
    }
    throw unclearPurchase();
  },

  async extend(ref, optionId, country, maxUsd) {
    await ensureFresh(optionId, country, maxUsd);
    let r;
    try {
      r = await call('POST', `/rentals/${encodeURIComponent(ref)}/extend`, { package: optionId });
    } catch {
      throw unclearPurchase();
    }
    if (r.status === 200 || r.status === 201) return { expiresAt: r.json?.expires_at ? new Date(r.json.expires_at) : undefined };
    if (r.status >= 400 && r.status < 500) {
      console.error(`[juicysms rentals] extension refused ${r.status}: ${JSON.stringify(r.json)?.slice(0, 200)}`);
      throw refusal(r.json?.code) ?? new AppError(409, 'extend_failed', 'The server did not extend this rental. Nothing was charged.');
    }
    throw unclearPurchase();
  },

  async messages(ref): Promise<ProviderSms[]> {
    const r = await call('GET', `/rentals/${encodeURIComponent(ref)}/messages`);
    if (r.status !== 200) throw new AppError(502, 'provider_error', `The server answered ${r.status}.`);
    const rows: any[] = Array.isArray(r.json?.data) ? r.json.data : [];
    return rows.map((m, i) => {
      const text = String(m.text ?? m.body ?? '');
      const at = m.received_at ?? m.created_at ?? m.date;
      return {
        id: String(m.id ?? `${at ?? i}:${text.slice(0, 40)}`),
        from: m.from ?? m.sender ?? null,
        text,
        code: m.code ?? text.match(/\b\d{4,8}\b/)?.[0] ?? null,
        receivedAt: at ? new Date(at) : new Date(),
      };
    });
  },
};
