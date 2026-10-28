import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/mailer.js', () => ({ sendCodeEmail: async () => {} }));

import { buildApp } from '../app.js';
import { User } from '../models/User.js';
import { EsimOrder } from '../models/EsimOrder.js';
import { ACCESS_COOKIE, signAccessToken } from '../lib/tokens.js';
import { planPriceKobo, resetEsimCache } from '../services/esim.service.js';

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

describe('esim: Server 1 (SMSPool)', () => {
  let pool: Record<string, Hit>;
  let seen: { path: string; form: URLSearchParams; auth: string | null }[];

  const PLANS = [
    { ID: 2363, extendable: 1, dataInGb: 0.49, network: '[{"country":"United States","network":[{"operatorName":"Verizon","networkType":"5G"},{"operatorName":"AT&T","networkType":"5G"}]}]', duration: 1, price: '0.70', speed: '3G/4G/5G', ip: 'US' },
    { ID: 975, extendable: 2, dataInGb: 0.1, network: '[{"country":"United States","network":[{"operatorName":"Verizon","networkType":"5G"}]}]', duration: 7, price: '0.40', speed: '3G/4G/5G', ip: 'US' },
    { ID: 1, extendable: 0, dataInGb: 0, network: '[]', duration: 0, price: '0', speed: '' }, // junk row
  ];
  const PROFILE = { success: 1, activated: 1, ac: 'LPA:1$rsp.example.test$ABC123', smdp: 'rsp.example.test', activationCode: 'ABC123', apn: 'internet', remainingData: '100 MB', totalData: '100 MB', pin: '0000', puk: '1111' };

  beforeEach(() => {
    resetEsimCache();
    process.env.SMSPOOL_API_KEY = 'pk';
    seen = [];
    pool = {
      '/country/retrieve_all': { body: [{ ID: 2, name: 'United Kingdom', short_name: 'GB' }, { ID: 1, name: 'United States', short_name: 'US' }, { ID: 9, name: 'Nowhere', short_name: '' }] },
      '/esim/plans': { body: PLANS },
      '/esim/purchase': { body: { success: 1, transactionId: 'TX1' } },
      '/esim/profile': { body: PROFILE },
    };
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      const path = new URL(url).pathname;
      seen.push({ path, form: new URLSearchParams(String(init?.body ?? '')), auth: (init?.headers as Record<string, string> | undefined)?.authorization ?? null });
      const hit = pool[path];
      return hit ? new Response(JSON.stringify(hit.body), { status: hit.status ?? 200 }) : new Response('{}', { status: 404 });
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  const buy = (cookie: string, over: Record<string, unknown> = {}) =>
    request(app).post('/api/v1/esim/servers/e1/orders').set('Cookie', cookie).send({ plan: '975', country: 'US', requestId: `r-${Math.random().toString(36).slice(2)}-xx`, ...over });
  const calls = (path: string) => seen.filter((x) => x.path === path);

  it('the charge and the order are ONE step: if the order cannot be saved, the money never leaves the wallet and nothing is bought', async () => {
    const { u, cookie } = await user(PRICE + 500);
    const spy = vi.spyOn(EsimOrder, 'create').mockRejectedValueOnce(new Error('disk full') as never);
    const res = await buy(cookie);
    spy.mockRestore();
    expect(res.status).toBe(500);
    expect(await wallet(u)).toBe(PRICE + 500);
    expect(calls('/esim/purchase').length).toBe(0);
  });

  it('needs a signed-in user and a known server', async () => {
    await request(app).get('/api/v1/esim/servers/e1/countries').expect(401);
    await request(app).get('/api/v1/esim/servers/nope/countries').set('Cookie', (await user(0)).cookie).expect(400);
  });

  it('lists the countries by name, with the two-letter code as the id (the only form the plans call accepts)', async () => {
    const { cookie } = await user(0);
    const res = await request(app).get('/api/v1/esim/servers/e1/countries').set('Cookie', cookie).expect(200);
    expect(res.body.countries).toEqual([{ id: 'GB', name: 'United Kingdom' }, { id: 'US', name: 'United States' }]);
  });

  it('lists a country\'s plans, cheapest first, in naira, with the networks, dropping junk rows', async () => {
    const { cookie } = await user(0);
    const res = await request(app).get('/api/v1/esim/servers/e1/plans?country=US').set('Cookie', cookie).expect(200);
    expect(res.body.plans).toEqual([
      { id: '975', dataGb: 0.1, days: 7, priceKobo: PRICE, network: 'Verizon 5G', speed: '3G/4G/5G' },
      { id: '2363', dataGb: 0.49, days: 1, priceKobo: planPriceKobo(0.7), network: 'Verizon 5G, AT&T 5G', speed: '3G/4G/5G' },
    ]);
    expect(calls('/esim/plans')[0]!.form.get('country')).toBe('US');
    await request(app).get('/api/v1/esim/servers/e1/plans').set('Cookie', cookie).expect(400); // needs a country
  });

  it('asks SMSPool once for the same country\'s plans', async () => {
    const { cookie } = await user(0);
    for (let i = 0; i < 3; i++) await request(app).get('/api/v1/esim/servers/e1/plans?country=US').set('Cookie', cookie).expect(200);
    expect(calls('/esim/plans').length).toBe(1);
  });

  it('a country with no eSIM plans is an empty list, not an error', async () => {
    const { cookie } = await user(0);
    for (const answer of [{ success: false, message: 'Invalid country code' }, { success: 0, errors: [{ message: 'no plans' }] }]) {
      resetEsimCache();
      pool['/esim/plans'] = { body: answer };
      const res = await request(app).get('/api/v1/esim/servers/e1/plans?country=GB').set('Cookie', cookie).expect(200);
      expect(res.body.plans).toEqual([]);
    }
  });

  it('buys: charges what the SERVER works out, asks for that plan, and returns the install data', async () => {
    const { u, cookie } = await user(PRICE + 500);
    const res = await buy(cookie, { costKobo: 1 }).expect(201); // any price from the page is ignored
    expect(res.body.order).toMatchObject({ server: 'e1', countryName: 'United States', planSummary: '100 MB · 7 days', costKobo: PRICE, status: 'active' });
    expect(res.body.order.details).toMatchObject({ lpa: 'LPA:1$rsp.example.test$ABC123', smdp: 'rsp.example.test', activationCode: 'ABC123', apn: 'internet', remainingData: '100 MB' });
    expect(res.body.order.details).not.toHaveProperty('pin'); // PIN/PUK are not kept
    expect(res.body.order.details).not.toHaveProperty('puk');
    expect(await wallet(u)).toBe(500);
    const p = calls('/esim/purchase')[0]!;
    expect([p.form.get('plan'), p.auth]).toEqual(['975', 'Bearer pk']);
    expect(calls('/esim/profile')[0]!.form.get('transactionId')).toBe('TX1');
  });

  it('refuses when the balance is too low, or the country/plan is unknown, and sends nothing', async () => {
    const { u, cookie } = await user(PRICE - 1);
    const low = await buy(cookie);
    expect([low.status, low.body.error.code]).toEqual([402, 'insufficient_balance']);
    expect(await wallet(u)).toBe(PRICE - 1);
    const rich = await user(10_000_000);
    expect((await buy(rich.cookie, { country: '999' })).status).toBe(404);
    expect((await buy(rich.cookie, { plan: '424242' })).status).toBe(404);
    expect(calls('/esim/purchase').length).toBe(0);
  });

  it('the same request id twice is ONE purchase: one charge, one eSIM', async () => {
    const { u, cookie } = await user(PRICE * 3);
    const requestId = 'same-form-12345';
    const a = await buy(cookie, { requestId }).expect(201);
    const b = await buy(cookie, { requestId }).expect(201);
    expect(b.body.order.id).toBe(a.body.order.id);
    expect(await wallet(u)).toBe(PRICE * 2);
    expect(calls('/esim/purchase').length).toBe(1);
  });

  it('two copies at the same moment still make one purchase and one charge', async () => {
    const { u, cookie } = await user(PRICE * 3);
    const requestId = 'racing-form-12345';
    await Promise.all([buy(cookie, { requestId }), buy(cookie, { requestId })]);
    expect(await EsimOrder.countDocuments({ userId: u._id })).toBe(1);
    expect(await wallet(u)).toBe(PRICE * 2);
  });

  it('gives the money back, and says why, when SMSPool refuses', async () => {
    for (const [body, status, code] of [
      [{ success: 0, message: 'Insufficient balance' }, 503, 'server_unavailable'],
      [{ success: 0, message: 'Plan not available' }, 409, 'order_refused'],
      [{ success: 1 }, 502, 'provider_error'], // says yes but gives no transaction id: we can't track it
    ] as const) {
      pool['/esim/purchase'] = { body };
      const { u, cookie } = await user(PRICE);
      const res = await buy(cookie);
      expect([res.status, res.body.error.code]).toEqual([status, code]);
      expect(await wallet(u)).toBe(PRICE);
      expect((await EsimOrder.findOne({ userId: u._id }))!.status).toBe('failed');
    }
  });

  it('a re-sent refused form says "try again"', async () => {
    pool['/esim/purchase'] = { body: { success: 0, message: 'Plan not available' } };
    const { cookie } = await user(PRICE);
    const requestId = 'refused-form-123';
    await buy(cookie, { requestId });
    const again = await buy(cookie, { requestId });
    expect([again.status, again.body.error.code]).toEqual([409, 'order_failed']);
  });

  it('a purchase whose install data could not be fetched yet is still the buyer\'s: it is fetched when they open it', async () => {
    pool['/esim/profile'] = { body: { success: 0, message: 'not ready' } };
    const { u, cookie } = await user(PRICE);
    const res = await buy(cookie).expect(201);
    expect([res.body.order.status, res.body.order.details]).toEqual(['active', null]);
    expect(await wallet(u)).toBe(0); // paid, not refunded

    pool['/esim/profile'] = { body: PROFILE };
    const open = await request(app).get(`/api/v1/esim/orders/${res.body.order.id}`).set('Cookie', cookie).expect(200);
    expect(open.body.order.details.lpa).toBe('LPA:1$rsp.example.test$ABC123');
    expect((await EsimOrder.findById(res.body.order.id))!.details).toBeTruthy(); // and kept
  });

  it('My eSIMs lists only mine, newest first, WITHOUT the install data; opening one gives it, to its owner only', async () => {
    const a = await user(PRICE * 3);
    const b = await user(PRICE);
    const first = await buy(a.cookie).expect(201);
    const second = await buy(a.cookie, { plan: '2363' }).expect(201);
    await buy(b.cookie).expect(201);
    const list = await request(app).get('/api/v1/esim/orders').set('Cookie', a.cookie).expect(200);
    expect(list.body.orders.map((o: { id: string }) => o.id)).toEqual([second.body.order.id, first.body.order.id]);
    expect(list.body.orders.every((o: { details: unknown }) => o.details === null)).toBe(true);
    await request(app).get(`/api/v1/esim/orders/${first.body.order.id}`).set('Cookie', a.cookie).expect(200);
    await request(app).get(`/api/v1/esim/orders/${first.body.order.id}`).set('Cookie', b.cookie).expect(404);
    await request(app).get('/api/v1/esim/orders/not-an-id').set('Cookie', a.cookie).expect(404);
  });
});
