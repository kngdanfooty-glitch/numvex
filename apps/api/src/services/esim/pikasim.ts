import type { EsimCountry, EsimDetails } from '@numvexs/shared';
import { AppError } from '../../lib/errors.js';
import { providerFetch } from '../../lib/providerFetch.js';
import type { EsimProvider, ProviderPlan } from './types.js';

/*
 * PikaSim reseller eSIMs. JSON over HTTPS, the key in the X-API-Key header, prices in integer US cents (already our reseller price).
 *   packages   GET  /packages?type=data&country=<code>&page=&limit=200   -> { data: [{ packageCode, location, locationCode, volumeGB, validityDays, price }], pagination }
 *              (there is no countries call: the country list is built from the packages)
 *   buy        POST /orders { packageCode, externalOrderId }              -> { data: { orderId, status: "processing" } }  (async: ready in seconds)
 *   order      GET  /orders/:orderId                                      -> status processing | completed | failed, with the eSIM once completed
 *   details    GET  /esims/:iccid                                         -> { activationCode ("LPA:1$smdp$code"), qrCodeUrl, apn, remainingData ... }
 * externalOrderId is the idempotency key: we send our own order id, so a retry can never buy twice.
 */
const BASE = 'https://pikasim.com/api/v1/reseller';
const POLL_EVERY_MS = 2_000;
const POLL_FOR_MS = 25_000;

const unavailable = () => new AppError(503, 'server_unavailable', 'This server is temporarily unavailable. Try another server.');
const badReply = () => new AppError(502, 'provider_error', 'The server did not answer properly. Try again shortly.');
const busy = () => new AppError(429, 'server_busy', 'This server is busy right now. Try again in a few seconds.');

function key(): string {
  const k = process.env.PIKASIM_API_KEY;
  if (!k) {
    console.error('[config] PIKASIM_API_KEY missing: this server is switched off for users');
    throw new AppError(503, 'server_not_configured', "This server isn't set up yet.");
  }
  return k;
}

async function call(method: 'GET' | 'POST', path: string, body?: unknown): Promise<{ status: number; json: any }> {
  const res = await providerFetch(`${BASE}${path}`, {
    method,
    headers: { accept: 'application/json', 'x-api-key': key(), ...(body ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (res.status === 429) throw busy();
  if (res.status === 401 || res.status === 403) {
    console.error(`[esim:pikasim] the provider rejected our key or this server's IP (HTTP ${res.status}): check PIKASIM_API_KEY and the IP whitelist`);
    throw unavailable();
  }
  return { status: res.status, json: await res.json().catch(() => null) };
}

/** Every data package, optionally for one country, across all pages. */
async function packages(country?: string): Promise<any[]> {
  const all: any[] = [];
  for (let page = 1; page <= 50; page++) {
    const q = new URLSearchParams({ type: 'data', page: String(page), limit: '200', ...(country ? { country } : {}) });
    const { status, json } = await call('GET', `/packages?${q}`);
    if (status >= 400 || !json?.success || !Array.isArray(json.data)) throw badReply();
    all.push(...json.data);
    if (page >= Number(json.pagination?.pages ?? 1)) break;
  }
  return all;
}

/** "LPA:1$smdp.example$CODE" -> the two parts, for installing by hand. */
function parseLpa(lpa: string | null): { smdp: string | null; code: string | null } {
  const m = /^LPA:1\$([^$]*)\$?(.*)$/i.exec(lpa ?? '');
  return { smdp: m?.[1] || null, code: m?.[2] || null };
}

const mb = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) ? `${Math.round(n / 1e6)} MB` : null);

function toDetails(e: any): EsimDetails {
  const lpa: string | null = e.activationCode ?? e.lpaUrl ?? null;
  const { smdp, code } = parseLpa(lpa);
  return {
    lpa,
    qrUrl: e.qrCodeUrl ?? null,
    smdp,
    activationCode: code,
    apn: e.apn ?? null,
    instructions: null,
    remainingData: mb(e.remainingData),
    totalData: mb(e.totalData),
  };
}

/** The order, once it has been made: its status and (when ready) the eSIM. */
async function order(ref: string) {
  const { status, json } = await call('GET', `/orders/${encodeURIComponent(ref)}`);
  if (status >= 400 || !json?.success) throw badReply();
  const d = json.data ?? {};
  const esim = d.esim ?? d.esims?.[0] ?? (d.iccid ? d : null);
  return { state: String(d.status ?? ''), esim };
}

export const pikasimEsim: EsimProvider = {
  async countries(): Promise<EsimCountry[]> {
    const byCode = new Map<string, string>();
    for (const p of await packages()) {
      const id = String(p.locationCode ?? '').toUpperCase();
      if (id && !byCode.has(id)) byCode.set(id, String(p.location ?? id));
    }
    return [...byCode].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  },

  async plans(countryId): Promise<ProviderPlan[]> {
    return (await packages(countryId))
      .filter((p) => String(p.locationCode ?? '').toUpperCase() === countryId.toUpperCase())
      .map((p) => ({ id: String(p.packageCode), dataGb: Number(p.volumeGB), days: Number(p.validityDays), usd: Number(p.price) / 100, network: null, speed: null }))
      .filter((p) => p.id && p.usd > 0 && p.dataGb > 0 && p.days > 0)
      .sort((a, b) => a.usd - b.usd);
  },

  async buy(planId, ctx) {
    const { status, json } = await call('POST', '/orders', { packageCode: planId, externalOrderId: ctx.orderId });
    if (status === 402) {
      console.error('[esim:pikasim] the provider wallet balance is too low to buy: deposit into the PikaSim reseller wallet');
      throw unavailable();
    }
    if (status >= 400 || !json?.success) {
      console.error(`[esim:pikasim] order refused (HTTP ${status}): ${json?.error ?? json?.code ?? 'no reason given'}`);
      throw new AppError(409, 'order_refused', 'The server could not sell this eSIM right now. Try another plan or server.');
    }
    const ref = json.data?.orderId;
    if (!ref) throw badReply();
    if (json.data?.status === 'failed') throw new AppError(409, 'order_refused', 'The server could not sell this eSIM right now. Try another plan or server.');

    // The eSIM is made asynchronously (usually within seconds). Wait a little for it; if it is slow, the order is still ours and
    // the install data is fetched when the buyer opens it.
    const until = Date.now() + POLL_FOR_MS;
    while (Date.now() < until) {
      await new Promise((r) => setTimeout(r, POLL_EVERY_MS));
      const o = await order(String(ref)).catch(() => null);
      if (!o) continue;
      if (o.state === 'failed') throw new AppError(409, 'order_refused', 'The server could not sell this eSIM right now. Try another plan or server.');
      if (o.state === 'completed' && o.esim?.iccid) return { ref: String(ref), details: await this.details(String(ref)).catch(() => undefined) };
    }
    return { ref: String(ref) };
  },

  async details(ref): Promise<EsimDetails> {
    const o = await order(ref);
    if (o.state === 'failed') throw badReply();
    const iccid = o.esim?.iccid;
    if (!iccid) throw badReply(); // not ready yet: the buyer can open it again in a moment
    const { status, json } = await call('GET', `/esims/${encodeURIComponent(String(iccid))}`);
    if (status >= 400 || !json?.success) throw badReply();
    return toDetails(json.data ?? {});
  },
};
