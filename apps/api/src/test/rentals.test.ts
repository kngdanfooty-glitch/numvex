import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/mailer.js', () => ({ sendCodeEmail: async () => {} }));

import { buildApp } from '../app.js';
import { User } from '../models/User.js';
import { Rental } from '../models/Rental.js';
import { ACCESS_COOKIE, signAccessToken } from '../lib/tokens.js';
import { rentalPriceKobo, resetRentalCache, runRentalSweep } from '../services/rentals.service.js';

const app = buildApp();

let counter = 0;
async function user(balanceKobo: number) {
  const n = ++counter;
  const u = await User.create({ email: `rn${n}@example.com`, phone: `+234805${String(5000000 + n)}`, username: `rn${n}`, usernameLower: `rn${n}`, passwordHash: 'x', isVerified: true, balanceKobo });
  return { u, cookie: `${ACCESS_COOKIE}=${signAccessToken(String(u._id), 'user')}` };
}
const wallet = async (u: { _id: unknown }) => (await User.findById(u._id as string))!.balanceKobo;

type Reply = { status?: number; body: unknown } | ((init?: RequestInit) => { status?: number; body: unknown });
let routes: Record<string, Reply>;
let seen: { method: string; url: string; body: string }[];

function stubFetch() {
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    const u = new URL(url);
    const method = (init?.method ?? 'GET').toUpperCase();
    seen.push({ method, url: `${u.pathname}${u.search}`, body: String(init?.body ?? '') });
    const hit = routes[`${method} ${u.pathname}`];
    if (!hit) return new Response('{}', { status: 404 });
    const r = typeof hit === 'function' ? hit(init) : hit;
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200 });
  });
}
const sent = (method: string, path: string) => seen.filter((s) => s.method === method && s.url.startsWith(path));

const FUTURE = new Date(Date.now() + 31 * 86_400_000).toISOString();

describe('rentals: JuicySMS (Server 2)', () => {
  const PACKAGES = {
    data: [
      { object: 'rental_package', key: '1m', name: '1 Month', days: 31, your_price: { amount: '15.00' } },
      { object: 'rental_package', key: '3m', name: '3 Months', days: 93, your_price: { amount: '30.00' } },
    ],
  };
  const RENTAL = { id: 'rt_1', phone_number: '+31612345678', expires_at: FUTURE };
  const price1m = () => rentalPriceKobo(15 * 1.15);

  beforeEach(() => {
    resetRentalCache();
    process.env.JUICYSMS_API_KEY = 'jk';
    seen = [];
    routes = {
      'GET /api/v2/rental-packages': { body: PACKAGES },
      'POST /api/v2/rentals': { status: 201, body: RENTAL },
      'GET /api/v2/rentals/rt_1/messages': { body: { data: [] } },
      'POST /api/v2/rentals/rt_1/extend': { body: { expires_at: new Date(Date.now() + 62 * 86_400_000).toISOString() } },
    };
    stubFetch();
  });
  afterEach(() => vi.unstubAllGlobals());

  const rent = (cookie: string, over: Record<string, unknown> = {}) =>
    request(app).post('/api/v1/rentals/servers/r2/rentals').set('Cookie', cookie).send({ option: '1m', country: 'NL', requestId: `r-${Math.random().toString(36).slice(2)}-xx`, ...over });

  it('needs sign-in and a known server', async () => {
    await request(app).get('/api/v1/rentals/servers/r2/countries').expect(401);
    const { cookie } = await user(0);
    await request(app).get('/api/v1/rentals/servers/zz/countries').set('Cookie', cookie).expect(400);
  });

  it('lists countries and prices each length with our markup, and never names the provider', async () => {
    const { cookie } = await user(0);
    const c = await request(app).get('/api/v1/rentals/servers/r2/countries').set('Cookie', cookie).expect(200);
    expect(c.body.countries.map((x: { id: string }) => x.id)).toEqual(['NL', 'UK']);
    const o = await request(app).get('/api/v1/rentals/servers/r2/options?country=NL').set('Cookie', cookie).expect(200);
    expect(o.body.options[0]).toEqual({ id: '1m', label: '1 Month', days: 31, priceKobo: price1m() });
    expect(JSON.stringify(o.body).toLowerCase()).not.toContain('juicy');
  });

  it('rents: charges once, always sends auto_renew false, returns the number', async () => {
    const { u, cookie } = await user(price1m() + 100);
    const res = await rent(cookie).expect(201);
    expect(res.body.rental).toMatchObject({ countryId: 'NL', number: '+31612345678', status: 'active', costKobo: price1m(), totalDays: 31, server: 'r2' });
    expect(await wallet(u)).toBe(100);
    expect(JSON.parse(sent('POST', '/api/v2/rentals')[0]!.body)).toEqual({ country: 'NL', package: '1m', auto_renew: false });
  });

  it('the same request id twice is one purchase', async () => {
    const { u, cookie } = await user(price1m() * 3);
    const requestId = 'same-request-id';
    await rent(cookie, { requestId }).expect(201);
    await rent(cookie, { requestId }).expect(201);
    expect(sent('POST', '/api/v2/rentals').length).toBe(1);
    expect(await wallet(u)).toBe(price1m() * 2);
  });

  it('too little money: 402 and nothing is bought', async () => {
    const { u, cookie } = await user(1000);
    const res = await rent(cookie);
    expect(res.status).toBe(402);
    expect(sent('POST', '/api/v2/rentals').length).toBe(0);
    expect(await wallet(u)).toBe(1000);
  });

  it('a clear refusal gives the money back once and marks it failed', async () => {
    routes['POST /api/v2/rentals'] = { status: 409, body: { code: 'out_of_stock' } };
    const { u, cookie } = await user(price1m());
    const res = await rent(cookie);
    expect(res.status).toBe(409);
    expect(await wallet(u)).toBe(price1m());
    const r = await Rental.findOne({ userId: u._id });
    expect(r).toMatchObject({ status: 'failed', refundedKobo: price1m() });
  });

  it('an unexpected reply after the purchase call HOLDS the money (no blind refund)', async () => {
    routes['POST /api/v2/rentals'] = { status: 500, body: {} };
    const { u, cookie } = await user(price1m());
    const res = await rent(cookie);
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('purchase_unclear');
    expect(await wallet(u)).toBe(0);
    expect((await Rental.findOne({ userId: u._id }))!.status).toBe('placing');
  });

  it('a price that rose since the quote is refused before buying, and refunded', async () => {
    const { u, cookie } = await user(price1m());
    await request(app).get('/api/v1/rentals/servers/r2/options?country=NL').set('Cookie', cookie).expect(200); // fills the cache at €15
    routes['GET /api/v2/rental-packages'] = { body: { data: [{ key: '1m', name: '1 Month', days: 31, your_price: { amount: '18.00' } }] } };
    const res = await rent(cookie);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('price_changed');
    expect(sent('POST', '/api/v2/rentals').length).toBe(0);
    expect(await wallet(u)).toBe(price1m());
  });

  it('the job stores new messages once, and the page reads them from our database', async () => {
    const { u, cookie } = await user(price1m());
    const id = (await rent(cookie).expect(201)).body.rental.id as string;
    routes['GET /api/v2/rentals/rt_1/messages'] = { body: { data: [{ id: 'm1', code: '123456', text: 'Your code is 123456', received_at: new Date().toISOString() }] } };
    expect((await runRentalSweep(new Date(Date.now() + 60_000))).newMessages).toBe(1);
    expect((await runRentalSweep(new Date(Date.now() + 130_000))).newMessages).toBe(0); // same message: not stored twice
    const calls = seen.length;
    const one = await request(app).get(`/api/v1/rentals/rentals/${id}`).set('Cookie', cookie).expect(200);
    expect(seen.length).toBe(calls); // reading asked the provider nothing
    expect(one.body.rental.messages).toHaveLength(1);
    expect(one.body.rental.messages[0]).toMatchObject({ code: '123456', text: 'Your code is 123456' });
    const list = await request(app).get('/api/v1/rentals/rentals').set('Cookie', cookie).expect(200);
    expect(list.body.rentals[0].messages).toEqual([]); // the list leaves the messages out
    expect(list.body.rentals[0].messageCount).toBe(1);
    void u;
  });

  it('another user cannot see or extend my rental', async () => {
    const mine = await user(price1m());
    const other = await user(price1m() * 2);
    const id = (await rent(mine.cookie).expect(201)).body.rental.id as string;
    await request(app).get(`/api/v1/rentals/rentals/${id}`).set('Cookie', other.cookie).expect(404);
    await request(app).post(`/api/v1/rentals/rentals/${id}/extend`).set('Cookie', other.cookie).send({ option: '1m', requestId: 'abcdefgh1' }).expect(404);
  });

  it('extends: charges once, adds the days, moves the end date; the same request id is not charged twice', async () => {
    const { u, cookie } = await user(price1m() * 3);
    const id = (await rent(cookie).expect(201)).body.rental.id as string;
    const body = { option: '1m', requestId: 'extend-request-1' };
    const a = await request(app).post(`/api/v1/rentals/rentals/${id}/extend`).set('Cookie', cookie).send(body).expect(200);
    await request(app).post(`/api/v1/rentals/rentals/${id}/extend`).set('Cookie', cookie).send(body).expect(200);
    expect(sent('POST', '/api/v2/rentals/rt_1/extend').length).toBe(1);
    expect(a.body.rental).toMatchObject({ totalDays: 62, costKobo: price1m() * 2 });
    expect(await wallet(u)).toBe(price1m());
  });

  it('a refused extension gives the money back and leaves the rental as it was', async () => {
    routes['POST /api/v2/rentals/rt_1/extend'] = { status: 409, body: { code: 'rental_not_extendable' } };
    const { u, cookie } = await user(price1m() * 2);
    const id = (await rent(cookie).expect(201)).body.rental.id as string;
    const res = await request(app).post(`/api/v1/rentals/rentals/${id}/extend`).set('Cookie', cookie).send({ option: '1m', requestId: 'extend-request-2' });
    expect(res.status).toBe(409);
    expect(await wallet(u)).toBe(price1m());
    expect(await Rental.findById(id)).toMatchObject({ totalDays: 31, refundedKobo: price1m() });
  });

  it('a rental whose time is up is closed by the job, after one last look for messages', async () => {
    const { cookie } = await user(price1m());
    const id = (await rent(cookie).expect(201)).body.rental.id as string;
    await runRentalSweep(new Date(Date.now() + 32 * 86_400_000));
    expect((await Rental.findById(id))!.status).toBe('expired');
    await request(app).post(`/api/v1/rentals/rentals/${id}/extend`).set('Cookie', cookie).send({ option: '1m', requestId: 'extend-request-3' }).expect(409);
  });

  it('History shows the purchase, each extension and a refused extension as separate wallet movements', async () => {
    const { cookie } = await user(price1m() * 4);
    const id = (await rent(cookie).expect(201)).body.rental.id as string;
    await request(app).post(`/api/v1/rentals/rentals/${id}/extend`).set('Cookie', cookie).send({ option: '1m', requestId: 'hist-extend-1' }).expect(200);
    routes['POST /api/v2/rentals/rt_1/extend'] = { status: 409, body: { code: 'x' } };
    await request(app).post(`/api/v1/rentals/rentals/${id}/extend`).set('Cookie', cookie).send({ option: '1m', requestId: 'hist-extend-2' }).expect(409);
    const h = await request(app).get('/api/v1/history').set('Cookie', cookie).expect(200);
    const amounts = (h.body.entries as { kind: string; amountKobo: number }[]).filter((e) => e.kind === 'rental').map((e) => e.amountKobo).sort((a, b) => a - b);
    expect(amounts).toEqual([-price1m(), -price1m(), -price1m(), price1m()].sort((a, b) => a - b));
    expect(amounts.reduce((a, b) => a + b, 0)).toBe(-price1m() * 2); // net: the first rental + one good extension
  });

  it('a switched-off service refuses to sell', async () => {
    const { Settings } = await import('../models/Settings.js');
    const { loadSettings, resetSettingsForTests } = await import('../services/settings.service.js');
    await Settings.create({ key: 'main', toggles: { rentals: false } });
    await loadSettings();
    const { cookie } = await user(price1m());
    const res = await rent(cookie);
    expect(res.status).toBe(503);
    await Settings.deleteMany({});
    resetSettingsForTests();
  });
});

describe('rentals: TextVerified (Server 1)', () => {
  const price = (usd: number) => rentalPriceKobo(usd);
  const priceReply = (init?: RequestInit) => {
    const d = JSON.parse(String(init?.body)).duration as string;
    const usd = ({ threeDay: 6, sevenDay: 7, thirtyDay: 10 } as Record<string, number>)[d];
    return usd ? { body: { serviceName: 'allservices', price: usd } } : { status: 400, body: 'Pricing not found.' };
  };

  beforeEach(() => {
    resetRentalCache();
    process.env.TEXTVERIFIED_API_KEY = 'k';
    process.env.TEXTVERIFIED_USERNAME = 'u';
    seen = [];
    routes = {
      'POST /api/pub/v2/auth': { body: { token: 'tok', expiresAt: new Date(Date.now() + 3_600_000).toISOString() } },
      'POST /api/pub/v2/pricing/rentals': priceReply,
      'POST /api/pub/v2/reservations/rental': { status: 201, body: { href: 'https://www.textverified.com/api/pub/v2/sales/s1', method: 'GET' } },
      'GET /api/pub/v2/sales/s1': { body: { state: 'succeeded', reservations: [{ id: 'res_1' }] } },
      'GET /api/pub/v2/reservations/rental/nonrenewable/res_1': { body: { id: 'res_1', number: '5551234567', endsAt: FUTURE, state: 'nonrenewableActive' } },
      'GET /api/pub/v2/sms': { body: { data: [] } },
      'POST /api/pub/v2/reservations/rentals/extensions': { body: true },
    };
    stubFetch();
  });
  afterEach(() => vi.unstubAllGlobals());

  const rent = (cookie: string, over: Record<string, unknown> = {}) =>
    request(app).post('/api/v1/rentals/servers/r1/rentals').set('Cookie', cookie).send({ option: 'thirtyDay', country: 'US', requestId: `t-${Math.random().toString(36).slice(2)}-xx`, ...over });

  it('offers only the lengths that have a price', async () => {
    const { cookie } = await user(0);
    const o = await request(app).get('/api/v1/rentals/servers/r1/options?country=US').set('Cookie', cookie).expect(200);
    expect(o.body.options.map((x: { id: string; priceKobo: number }) => [x.id, x.priceKobo])).toEqual([
      ['threeDay', price(6)],
      ['sevenDay', price(7)],
      ['thirtyDay', price(10)],
    ]);
  });

  it('rents a non-renewable, always-on rental and formats the number as +1...', async () => {
    const { u, cookie } = await user(price(10));
    const res = await rent(cookie).expect(201);
    expect(res.body.rental).toMatchObject({ number: '+15551234567', status: 'active', totalDays: 30, server: 'r1' });
    expect(await wallet(u)).toBe(0);
    expect(JSON.parse(sent('POST', '/api/pub/v2/reservations/rental')[0]!.body)).toMatchObject({ isRenewable: false, alwaysOn: true, duration: 'thirtyDay', allowBackOrderReservations: false });
  });

  it('a failed sale refunds; an unreadable one holds the money', async () => {
    routes['GET /api/pub/v2/sales/s1'] = { body: { state: 'failed', reservations: [] } };
    const a = await user(price(10));
    expect((await rent(a.cookie)).status).toBe(409);
    expect(await wallet(a.u)).toBe(price(10));

    routes['GET /api/pub/v2/sales/s1'] = { status: 500, body: {} };
    const b = await user(price(10));
    const res = await rent(b.cookie);
    expect(res.body.error.code).toBe('purchase_unclear');
    expect(await wallet(b.u)).toBe(0);
  }, 20_000);

  it('reads messages by the 10-digit number and keeps the parsed code', async () => {
    const { cookie } = await user(price(10));
    const id = (await rent(cookie).expect(201)).body.rental.id as string;
    routes['GET /api/pub/v2/sms'] = { body: { data: [{ id: 's1', from: 'Google', smsContent: 'G-445566 is your code', parsedCode: '445566', createdAt: new Date().toISOString() }] } };
    const res = await request(app).post(`/api/v1/rentals/rentals/${id}/refresh`).set('Cookie', cookie).expect(200);
    expect(res.body.rental.messages[0]).toMatchObject({ from: 'Google', code: '445566' });
    expect(sent('GET', '/api/pub/v2/sms')[0]!.url).toContain('to=5551234567');
    expect(sent('GET', '/api/pub/v2/sms')[0]!.url).toContain('reservationType=nonrenewable');
  });
});
