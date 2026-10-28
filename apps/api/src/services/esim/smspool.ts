import type { EsimCountry, EsimDetails } from '@numvexs/shared';
import { AppError } from '../../lib/errors.js';
import { providerFetch } from '../../lib/providerFetch.js';
import type { EsimProvider, ProviderPlan } from './types.js';

/*
 * SMSPool eSIMs. Form POSTs with the key in the body (the same account as the numbers):
 *   countries  GET  /country/retrieve_all                       (the same list the numbers use; here the two-letter code is what counts)
 *   plans      POST /esim/plans    country=<two-letter code>    -> [{ ID, dataInGb, duration (days), price (USD), network, speed }]
 *              (their docs say "name or ID", but only the code (US, GB, NG) works: an ID gives no plans, a name gives an error)
 *   buy        POST /esim/purchase plan=<plan ID>               -> the purchase, with a transaction id
 *   details    POST /esim/profile  transactionId=<id>           -> { ac ("LPA:1$..."), smdp, activationCode, apn, remainingData, totalData }
 */
const BASE = 'https://api.smspool.net';

const busy = () => new AppError(429, 'server_busy', 'This server is busy right now. Try again in a few seconds.');

function key(): string {
  const k = process.env.SMSPOOL_API_KEY;
  if (!k) {
    console.error('[config] SMSPOOL_API_KEY missing: this server is switched off for users');
    throw new AppError(503, 'server_not_configured', "This server isn't set up yet.");
  }
  return k;
}

async function post(path: string, params: Record<string, string>): Promise<{ status: number; json: any }> {
  const res = await providerFetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json', authorization: `Bearer ${key()}` },
    body: new URLSearchParams({ key: key(), ...params }),
  });
  if (res.status === 429) throw busy();
  return { status: res.status, json: await res.json().catch(() => null) };
}

/** "[{country, network: [{operatorName, networkType}]}]" (a JSON string) -> "Verizon 5G, AT&T 5G". */
function networkSummary(raw: unknown): string | null {
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const names = (Array.isArray(parsed) ? parsed : []).flatMap((c: any) => (c.network ?? []).map((n: any) => `${n.operatorName} ${n.networkType ?? ''}`.trim()));
    return names.length ? [...new Set(names)].slice(0, 4).join(', ') : null;
  } catch {
    return null;
  }
}

export const smspoolEsim: EsimProvider = {
  async countries(): Promise<EsimCountry[]> {
    const res = await providerFetch(`${BASE}/country/retrieve_all`, { headers: { accept: 'application/json', authorization: `Bearer ${key()}` } });
    if (res.status === 429) throw busy();
    const rows = (await res.json().catch(() => null)) as { name: string; short_name?: string }[] | null;
    if (!res.ok || !Array.isArray(rows)) throw new AppError(502, 'provider_error', 'The server did not answer properly. Try again shortly.');
    // The id is the two-letter code: that is what the plans call takes.
    return rows
      .filter((c) => c.short_name)
      .map((c) => ({ id: String(c.short_name).toUpperCase(), name: String(c.name) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },

  async plans(countryId): Promise<ProviderPlan[]> {
    const { json } = await post('/esim/plans', { country: countryId });
    if (json && !Array.isArray(json)) return []; // "Invalid country" and the like (success: false / 0): just no plans
    if (!Array.isArray(json)) throw new AppError(502, 'provider_error', 'The server did not answer properly. Try again shortly.');
    return json
      .map((p: any) => ({ id: String(p.ID), dataGb: Number(p.dataInGb), days: Number(p.duration), usd: Number(p.price), network: networkSummary(p.network), speed: p.speed ?? null }))
      .filter((p) => p.usd > 0 && p.dataGb > 0 && p.days > 0)
      .sort((a, b) => a.usd - b.usd);
  },

  async buy(planId) {
    const { json } = await post('/esim/purchase', { plan: planId });
    const message = String(json?.message ?? json?.errors?.[0]?.message ?? '');
    if (json?.success === 0 || !json) {
      if (/balance|fund|credit/i.test(message)) {
        console.error('[esim:smspool] the provider account balance is too low to buy: top up the SMSPool account');
        throw new AppError(503, 'server_unavailable', 'This server is temporarily unavailable. Try another server.');
      }
      throw new AppError(409, 'order_refused', 'The server could not sell this eSIM right now. Try another plan or server.');
    }
    const ref = json.transactionId ?? json.transaction_id ?? json.data?.transactionId ?? json.orderid;
    if (!ref) throw new AppError(502, 'provider_error', 'The server did not answer properly. Try again shortly.');
    return { ref: String(ref) };
  },

  async details(ref): Promise<EsimDetails> {
    const { json } = await post('/esim/profile', { transactionId: ref });
    if (!json || json.success === 0) throw new AppError(502, 'provider_error', 'The server did not answer properly. Try again shortly.');
    return {
      lpa: json.ac ?? null,
      qrUrl: null,
      smdp: json.smdp ?? null,
      activationCode: json.activationCode ?? null,
      apn: json.apn ?? null,
      instructions: null,
      remainingData: json.remainingData ?? null,
      totalData: json.totalData ?? null,
    };
  },
};
