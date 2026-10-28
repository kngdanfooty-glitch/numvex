import type { TelegramOrderStatus, TelegramService } from '@numvexs/shared';
import { env } from '../../config/env.js';
import { AppError } from '../../lib/errors.js';
import { providerFetch } from '../../lib/providerFetch.js';

/*
 * GramSubs (docs: www.gramsubs.com/developer/docs). JSON, `Authorization: Bearer <key>`, 60 requests a minute per key.
 *   GET  /recipient?service=&quantity=|months=&username=   who the username is + the price, no charge
 *   POST /orders  { service, quantity | months, username } -> { id, status, amount_cents, mode, ... }
 *   GET  /orders/{id}                                      -> the same order, later
 * sk_test_ keys run in a sandbox (delivers at once, never debits); sk_live_ keys spend the real USD balance.
 * Errors: 401 bad key, 402 balance too low, 422 bad parameters or unknown recipient, 429 rate limit.
 * The docs don't list the status words of an order that is not delivered yet, so unknown words count as "still processing".
 */
const BASE = 'https://www.gramsubs.com/api/v1';

export interface RecipientQuote {
  recipient: string;
  name: string | null;
  photo: string | null;
  myself: boolean;
  usdCents: number;
}

export type CreateResult =
  /** GramSubs took the order. */
  | { kind: 'created'; ref: string; status: TelegramOrderStatus; usdCents: number; mode: 'live' | 'test' | undefined }
  /** GramSubs said no (nothing was ordered): safe to give the money back. */
  | { kind: 'refused'; message: string }
  /** We cannot tell whether GramSubs took it (the connection dropped, or it answered with a server error). Do NOT refund. */
  | { kind: 'unknown' };

const unavailable = () => new AppError(503, 'server_unavailable', 'Telegram orders are temporarily unavailable. Please try again later.');

function key(): string {
  const k = env.GRAMSUBS_SECRET_KEY || env.GRAMSUBS_API_KEY;
  if (!k) {
    console.error('[config] GRAMSUBS_SECRET_KEY missing: this server is switched off for users');
    throw new AppError(503, 'server_not_configured', "Telegram orders aren't set up yet.");
  }
  return k;
}

const headers = () => ({ authorization: `Bearer ${key()}`, accept: 'application/json', 'content-type': 'application/json' });

const productParams = (service: TelegramService, units: number) => (service === 'premium' ? { months: units } : { quantity: units });

/** GramSubs' own reason, when it gives one in the usual places (only ever logged, never shown to the buyer). */
const reasonOf = (json: any): string => String(json?.message ?? json?.error?.message ?? (typeof json?.error === 'string' ? json.error : '') ?? '');

export function mapStatus(word: unknown): TelegramOrderStatus {
  const w = String(word ?? '').toLowerCase();
  if (['delivered', 'completed', 'complete', 'success', 'succeeded'].includes(w)) return 'delivered';
  if (['failed', 'canceled', 'cancelled', 'refunded', 'rejected', 'error', 'expired'].includes(w)) return 'failed';
  return 'processing';
}

/** Who the username is and what it costs. Nothing is charged and no order is made. */
export async function recipient(service: TelegramService, units: number, username: string): Promise<RecipientQuote> {
  const qs = new URLSearchParams({ service, username, ...Object.fromEntries(Object.entries(productParams(service, units)).map(([k, v]) => [k, String(v)])) });
  const res = await providerFetch(`${BASE}/recipient?${qs}`, { headers: headers() });
  const json: any = await res.json().catch(() => null);
  if (res.status === 401) {
    console.error('[telegram:gramsubs] the API key was rejected: check GRAMSUBS_SECRET_KEY');
    throw unavailable();
  }
  if (res.status === 429) throw new AppError(429, 'server_busy', 'Too many requests right now. Try again in a few seconds.');
  if (res.status === 422 || json?.valid === false) {
    // The supplier's own sentence could name them, so it is only logged; the buyer always gets our wording.
    console.error('[telegram:gramsubs] recipient check refused (422):', typeof json?.error === 'string' ? json.error : reasonOf(json));
    throw new AppError(422, 'recipient_invalid', "We couldn't find that Telegram username. Check the spelling and try again.");
  }
  const cents = Number(json?.amount_cents);
  if (res.status !== 200 || !json || !Number.isFinite(cents) || cents <= 0) {
    throw new AppError(502, 'provider_error', 'The server did not answer properly. Try again shortly.');
  }
  return {
    recipient: String(json.recipient ?? `@${username}`),
    name: json.name ? String(json.name) : null,
    photo: json.photo ? String(json.photo) : null,
    myself: !!json.myself,
    usdCents: cents,
  };
}

/** Place the order. Never throws for "GramSubs said no": it returns what happened, because that decides whether the money goes back. */
export async function createOrder(service: TelegramService, units: number, username: string): Promise<CreateResult> {
  let res: Response;
  try {
    res = await providerFetch(`${BASE}/orders`, { method: 'POST', headers: headers(), body: JSON.stringify({ service, username, ...productParams(service, units) }) });
  } catch {
    return { kind: 'unknown' }; // the request may have gone out before the connection dropped
  }
  const json: any = await res.json().catch(() => null);

  if (res.status === 200 || res.status === 201) {
    const ref = json?.id;
    if (!ref) return { kind: 'unknown' }; // a success with no order id: we can't follow it, so don't guess
    return { kind: 'created', ref: String(ref), status: mapStatus(json.status), usdCents: Number(json.amount_cents) || 0, mode: json.mode === 'test' ? 'test' : json.mode === 'live' ? 'live' : undefined };
  }
  if (res.status === 401) {
    console.error('[telegram:gramsubs] the API key was rejected: check GRAMSUBS_SECRET_KEY');
    return { kind: 'refused', message: 'Telegram orders are temporarily unavailable. Please try again later.' };
  }
  if (res.status === 402) {
    console.error('[telegram:gramsubs] the GramSubs balance is too low: top up the GramSubs wallet with TON');
    return { kind: 'refused', message: 'Telegram orders are temporarily unavailable. Please try again later.' };
  }
  if (res.status === 422) {
    console.error('[telegram:gramsubs] order refused (422):', reasonOf(json));
    return { kind: 'refused', message: "We couldn't deliver to that Telegram username. Check it and try again." };
  }
  if (res.status === 429) return { kind: 'refused', message: 'Too many requests right now. Try again in a few seconds.' };
  if (res.status >= 400 && res.status < 500) return { kind: 'refused', message: 'The server could not take this order. Please try again.' };
  return { kind: 'unknown' }; // 5xx: it may or may not have been created
}

/** The current status of one order. Null when GramSubs can't say right now (the job just tries again later). */
export async function orderStatus(ref: string): Promise<{ status: TelegramOrderStatus; usdCents: number } | null> {
  const res = await providerFetch(`${BASE}/orders/${encodeURIComponent(ref)}`, { headers: headers() });
  if (res.status !== 200) return null;
  const json: any = await res.json().catch(() => null);
  if (!json?.status) return null;
  return { status: mapStatus(json.status), usdCents: Number(json.amount_cents) || 0 };
}
