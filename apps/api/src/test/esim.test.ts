import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/mailer.js', () => ({ sendCodeEmail: async () => {} }));

import { buildApp } from '../app.js';
import { User } from '../models/User.js';
import { EsimOrder } from '../models/EsimOrder.js';
import { ACCESS_COOKIE, signAccessToken } from '../lib/tokens.js';
import { planPriceKobo, resetEsimCache } from '../services/esim.service.js';
import { pikasimEsim } from '../services/esim/pikasim.js';

const app = buildApp();

// 0.40 USD x 1500 x 1.30 = N780 = 78,000 kobo (default markup 30%)
const PRICE = 78_000;

let counter = 0;
async function user(balanceKobo: number) {
  const n = ++counter;
  const email = `es${n}@example.com`;
  const u = await User.create({ email, phone: `+234805${String(4000000 + n)}`, username: `es${n}`, usernameLower: `es${n}`, passwordHash: 'x', isVerified: true, balanceKobo });
  return { u, email, cookie: `${ACCESS_COOKIE}=${signAccessToken(String(u._id), 'user')}` };
}
const wallet = async (u: { _id: unknown }) => (await User.findById(u._id as string))!.balanceKobo;

type Hit = { status?: number; body: unknown };

describe('esim: pricing', () => {
  it('our price = provider dollars x naira rate x (1 + markup), in kobo, never free', () => {
    expect(planPriceKobo(0.4)).toBe(PRICE);
    expect(planPriceKobo(0)).toBe(1);
  });
});

describe('esim: Server 1 (PikaSim)', () => {
  type Seen = { method: string; path: string; query: URLSearchParams; key: string | null; body: any };
  let seen: Seen[];
  let orderStates: string[]; // what GET /orders/:id answers, one per call (the last repeats)
  let answers: Record<string, { status?: number; body: unknown }>;

  const pkg = (code: string, locationCode: string, region: string, volumeGB: number, validityDays: number, cents: number) => ({
    packageCode: code, locationCode, region, location: locationCode, volumeGB, validityDays, price: cents, speed: '3G/4G/5G',
    locationNetworkList: [{ operatorList: [{ operatorName: 'Verizon', networkType: '5G' }, { operatorName: 'AT&T', networkType: '5G' }] }],
  });
  const ESIM = { iccid: '8901', activationCode: 'LPA:1$rsp.example.test$ABC123', qrCodeUrl: 'https://qr.example.test/1.png', apn: 'internet', remainingData: 104_857_600, totalData: 104_857_600 };

  beforeEach(() => {
    resetEsimCache();
    process.env.PIKASIM_API_KEY = 'pk_live_test';
    seen = [];
    orderStates = ['completed'];
    answers = {
      'GET /packages': { body: { success: true, data: { packages: [pkg('P1', 'US', 'United States', 0.1, 7, 135), pkg('P2', 'US', 'United States', 1, 7, 325), pkg('P3', 'GB', 'United Kingdom', 1, 7, 300), pkg('JUNK', 'US', 'United States', 0, 0, 0)], pagination: { page: 1, limit: 200, total: 4, pages: 1 } } } },
      'POST /orders': { status: 201, body: { success: true, data: { orderId: 'ORD1', status: 'processing' } } },
      'GET /esims/8901': { body: { success: true, data: ESIM } },
    };
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      const u = new URL(url);
      const method = init?.method ?? 'GET';
      const path = u.pathname.replace('/api/v1/reseller', '');
      seen.push({ method, path, query: u.searchParams, key: (init?.headers as Record<string, string>)['x-api-key'] ?? null, body: init?.body ? JSON.parse(String(init.body)) : null });
      if (method === 'GET' && path.startsWith('/orders/')) {
        const state = orderStates.length > 1 ? orderStates.shift()! : orderStates[0]!;
        return new Response(JSON.stringify({ success: true, data: { orderId: 'ORD1', status: state, ...(state === 'completed' ? { esim: { iccid: '8901' } } : {}) } }));
      }
      const hit = answers[`${method} ${path}`];
      return hit ? new Response(JSON.stringify(hit.body), { status: hit.status ?? 200 }) : new Response('{}', { status: 404 });
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  const buy = (cookie: string, over: Record<string, unknown> = {}) =>
    request(app).post('/api/v1/esim/servers/e2/orders').set('Cookie', cookie).send({ plan: 'P1', country: 'US', requestId: `r-${Math.random().toString(36).slice(2)}-xx`, ...over });
  const calls = (method: string, path: string) => seen.filter((x) => x.method === method && x.path === path);
  const P1 = planPriceKobo(1.35);

  it('lists countries by their full name, sorted, asking with the API key', async () => {
    const { cookie } = await user(0);
    const res = await request(app).get('/api/v1/esim/servers/e2/countries').set('Cookie', cookie).expect(200);
    expect(res.body.countries).toEqual([{ id: 'GB', name: 'United Kingdom' }, { id: 'US', name: 'United States' }]);
    expect(seen[0]!.key).toBe('pk_live_test');
    expect(seen[0]!.query.get('type')).toBe('data');
  });

  it('reads every page of packages', async () => {
    answers['GET /packages'] = { body: { success: true, data: { packages: [pkg('P3', 'GB', 'United Kingdom', 1, 7, 300)], pagination: { page: 1, limit: 200, total: 2, pages: 2 } } } };
    const { cookie } = await user(0);
    await request(app).get('/api/v1/esim/servers/e2/countries').set('Cookie', cookie).expect(200);
    expect(calls('GET', '/packages').map((c) => c.query.get('page')).sort()).toEqual(['1', '2']);
  });

  it('lists a country\'s plans cheapest first, in naira, with networks, dropping junk and other countries', async () => {
    const { cookie } = await user(0);
    const res = await request(app).get('/api/v1/esim/servers/e2/plans?country=US').set('Cookie', cookie).expect(200);
    expect(res.body.plans).toEqual([
      { id: 'P1', dataGb: 0.1, days: 7, priceKobo: P1, network: 'Verizon 5G, AT&T 5G', speed: '3G/4G/5G' },
      { id: 'P2', dataGb: 1, days: 7, priceKobo: planPriceKobo(3.25), network: 'Verizon 5G, AT&T 5G', speed: '3G/4G/5G' },
    ]);
    expect(calls('GET', '/packages')[0]!.query.get('country')).toBe('US');
  });

  it('a regional bundle ("AF-29") has no country filter on their side: its plans are picked out of the full list', async () => {
    answers['GET /packages'] = { body: { success: true, data: { packages: [pkg('R1', 'AF-29', 'Africa (25+ areas)', 1, 7, 900), pkg('P1', 'US', 'United States', 0.1, 7, 135)], pagination: { page: 1, limit: 200, total: 2, pages: 1 } } } };
    const { cookie } = await user(0);
    const res = await request(app).get('/api/v1/esim/servers/e2/plans?country=AF-29').set('Cookie', cookie).expect(200);
    expect(res.body.plans.map((p: { id: string }) => p.id)).toEqual(['R1']);
    expect(calls('GET', '/packages')[0]!.query.has('country')).toBe(false);
  });

  it('buys: charges what the SERVER works out, uses our order id as the idempotency key, and returns the install data', async () => {
    const { u, cookie } = await user(P1 + 500);
    const res = await buy(cookie, { costKobo: 1 }).expect(201);
    expect(res.body.order).toMatchObject({ server: 'e2', countryName: 'United States', planSummary: '100 MB · 7 days', costKobo: P1, status: 'active' });
    expect(res.body.order.details).toMatchObject({ lpa: 'LPA:1$rsp.example.test$ABC123', smdp: 'rsp.example.test', activationCode: 'ABC123', qrUrl: 'https://qr.example.test/1.png', apn: 'internet', remainingData: '105 MB' });
    expect(await wallet(u)).toBe(500);
    const sent = calls('POST', '/orders')[0]!;
    expect(sent.body).toEqual({ packageCode: 'P1', externalOrderId: res.body.order.id });
  });

  it('waits while the eSIM is still being made', async () => {
    orderStates = ['processing', 'completed'];
    const { cookie } = await user(P1);
    const res = await buy(cookie).expect(201);
    expect(res.body.order.details?.lpa).toBe('LPA:1$rsp.example.test$ABC123');
    expect(calls('GET', '/orders/ORD1').length).toBeGreaterThanOrEqual(2);
  }, 20_000);

  it('gives the money back when PikaSim fails the order after accepting it', async () => {
    orderStates = ['failed'];
    const { u, cookie } = await user(P1);
    const res = await buy(cookie);
    expect([res.status, res.body.error.code]).toEqual([409, 'order_refused']);
    expect(await wallet(u)).toBe(P1);
    expect((await EsimOrder.findOne({ userId: u._id }))!.status).toBe('failed');
  }, 20_000);

  it('refunds, and never names the provider, key or wallet, when the provider refuses', async () => {
    for (const [status, body, expected, code] of [
      [402, { success: false, error: 'Insufficient balance' }, 503, 'server_unavailable'],
      [401, { success: false, error: 'Invalid API key pk_live_test' }, 503, 'server_unavailable'],
      [403, { success: false, error: 'IP not whitelisted' }, 503, 'server_unavailable'],
      [404, { success: false, error: 'Out of stock', code: 'OUT_OF_STOCK' }, 409, 'order_refused'],
      [404, { success: false, code: 'PACKAGE_RETIRED', replacement: 'P9' }, 409, 'order_refused'],
    ] as const) {
      answers['POST /orders'] = { status, body };
      const { u, cookie } = await user(P1);
      const res = await buy(cookie);
      expect([res.status, res.body.error.code]).toEqual([expected, code]);
      expect(JSON.stringify(res.body)).not.toMatch(/pika|pk_live|whitelist|wallet|balance|stock|retired/i);
      expect(await wallet(u)).toBe(P1);
    }
  });

  it('says yes without an order id: refunded, since we could not track it', async () => {
    answers['POST /orders'] = { status: 201, body: { success: true, data: {} } };
    const { u, cookie } = await user(P1);
    const res = await buy(cookie);
    expect([res.status, res.body.error.code]).toEqual([502, 'provider_error']);
    expect(await wallet(u)).toBe(P1);
  });

  it('is switched off, with a neutral message, when there is no key', async () => {
    delete process.env.PIKASIM_API_KEY;
    const { cookie } = await user(0);
    const res = await request(app).get('/api/v1/esim/servers/e2/countries').set('Cookie', cookie);
    expect([res.status, res.body.error.code]).toEqual([503, 'server_not_configured']);
    expect(JSON.stringify(res.body)).not.toMatch(/pika|PIKASIM/i);
  });

  it('a slow eSIM is still the buyer\'s: paid, no install data yet, fetched when they open it', async () => {
    orderStates = ['processing'];
    vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] });
    try {
      const pending = pikasimEsim.buy('P1', { countryId: 'US', email: 'a@example.test', orderId: 'OID1' });
      await vi.advanceTimersByTimeAsync(30_000);
      const bought = await pending;
      expect(bought).toEqual({ ref: 'ORD1' }); // no details yet
      await expect(pikasimEsim.details('ORD1')).rejects.toMatchObject({ code: 'provider_error' }); // still processing

      orderStates = ['completed'];
      expect(await pikasimEsim.details('ORD1')).toMatchObject({ lpa: 'LPA:1$rsp.example.test$ABC123', smdp: 'rsp.example.test' });
    } finally {
      vi.useRealTimers();
    }
  });
});
