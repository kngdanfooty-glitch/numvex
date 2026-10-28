import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/mailer.js', () => ({ sendCodeEmail: async () => {} }));

import { buildApp } from '../app.js';
import { User } from '../models/User.js';
import { BoostOrder } from '../models/BoostOrder.js';
import { ACCESS_COOKIE, signAccessToken } from '../lib/tokens.js';
import { mapPanelStatus, resetBoostCache } from '../services/boost.service.js';
import { orderCostKobo, settleBoostOrders } from '../services/boostOrders.service.js';

const app = buildApp();

// service 101: 0.90 USD per 1,000 x 1500 x 1.30 = N1,755 per 1k = 175,500 kobo. 100 units = 17,550 kobo.
const RATE = 175_500;
const ROWS = [
  { service: 101, name: 'Instagram Followers | Real', type: 'Default', category: 'Instagram Followers', rate: '0.90', min: 50, max: 10000 },
  { service: 102, name: 'Instagram Likes', type: 'Default', category: 'Instagram Likes', rate: '0.10', min: 10, max: 5000 },
];
const cost = (qty: number) => Math.round((qty * RATE) / 1000);

let counter = 0;
async function user(balanceKobo: number) {
  const n = ++counter;
  const u = await User.create({
    email: `bo${n}@example.com`, phone: `+234806${String(3000000 + n)}`, username: `bo${n}`, usernameLower: `bo${n}`,
    passwordHash: 'x', isVerified: true, balanceKobo,
  });
  return { u, cookie: `${ACCESS_COOKIE}=${signAccessToken(String(u._id), 'user')}` };
}
const wallet = async (u: { _id: unknown }) => (await User.findById(u._id as string))!.balanceKobo;

describe('boost: placing orders and following them', () => {
  let panel: (host: string, form: URLSearchParams) => { status?: number; body: unknown };
  let calls: { host: string; form: URLSearchParams }[];
  let nextOrderId: number;

  beforeEach(() => {
    resetBoostCache();
    process.env.MORETHANPANEL_API_KEY = 'mk';
    process.env.PEAKERR_API_KEY = 'pk';
    nextOrderId = 5000;
    calls = [];
    panel = (_host, form) => {
      if (form.get('action') === 'services') return { body: ROWS };
      if (form.get('action') === 'add') return { body: { order: ++nextOrderId } };
      if (form.get('action') === 'status') {
        const out: Record<string, unknown> = {};
        for (const id of String(form.get('orders')).split(',')) out[id] = { status: 'In progress', remains: '60', start_count: '10', currency: 'USD' };
        return { body: out };
      }
      return { body: { error: 'Incorrect action' } };
    };
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      const form = new URLSearchParams(String(init?.body ?? ''));
      calls.push({ host: new URL(url).hostname, form });
      const r = panel(new URL(url).hostname, form);
      return new Response(JSON.stringify(r.body), { status: r.status ?? 200 });
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  const place = (cookie: string, over: Record<string, unknown> = {}, server = 'morethanpanel') =>
    request(app).post(`/api/v1/boost/servers/${server}/orders`).set('Cookie', cookie)
      .send({ service: '101', link: 'https://instagram.com/someone', quantity: 100, requestId: `req-${Math.random().toString(36).slice(2)}-xx`, ...over });
  const adds = () => calls.filter((c) => c.form.get('action') === 'add');

  it('the charge and the order are ONE step: if the order cannot be saved, the money never leaves the wallet and nothing is sent to the panel', async () => {
    const { u, cookie } = await user(cost(100) + 500);
    const spy = vi.spyOn(BoostOrder, 'create').mockRejectedValueOnce(new Error('disk full') as never);
    const res = await place(cookie);
    spy.mockRestore();
    expect(res.status).toBe(500);
    expect(await wallet(u)).toBe(cost(100) + 500);
    expect(adds().length).toBe(0);
  });

  it('a failed placement marks the order failed and pays the refund as ONE step: if paying fails, the order is not left marked refunded', async () => {
    const { u, cookie } = await user(cost(100));
    panel = (_h, form) => (form.get('action') === 'services' ? { body: ROWS } : { body: { error: 'Incorrect link' } });
    resetBoostCache();
    const spy = vi.spyOn(User, 'updateOne').mockImplementationOnce((() => { throw new Error('boom'); }) as never);
    await place(cookie);
    spy.mockRestore();
    expect(await BoostOrder.findOne({ userId: u._id })).toMatchObject({ status: 'placing', refundedKobo: 0 }); // rolled back: the refund job / a retry settles it
    expect(await wallet(u)).toBe(0);
  });

  it('maps the panels\' words for a status', () => {
    expect(mapPanelStatus('Pending')).toBe('pending');
    expect(mapPanelStatus('In progress')).toBe('in_progress');
    expect(mapPanelStatus('Processing')).toBe('in_progress');
    expect(mapPanelStatus('Completed')).toBe('completed');
    expect(mapPanelStatus('Partial')).toBe('partial');
    for (const w of ['Canceled', 'Cancelled', 'Refunded', 'Failed']) expect(mapPanelStatus(w)).toBe('canceled');
    expect(mapPanelStatus('Something new')).toBe('pending');
    expect(orderCostKobo(1, 1)).toBe(1); // never free
  });

  describe('placing', () => {
    it('charges the wallet the price the SERVER works out, sends the order to that panel, and stores it', async () => {
      const { u, cookie } = await user(cost(100) + 500);
      const res = await place(cookie).expect(201);
      expect(res.body.order).toMatchObject({ server: 'morethanpanel', serviceName: 'Instagram Followers | Real', quantity: 100, costKobo: cost(100), status: 'pending', refundedKobo: 0 });
      expect(await wallet(u)).toBe(500);
      const add = adds()[0]!;
      expect([add.host, add.form.get('key'), add.form.get('service'), add.form.get('link'), add.form.get('quantity')]).toEqual(['morethanpanel.com', 'mk', '101', 'https://instagram.com/someone', '100']);
      expect((await BoostOrder.findOne({ userId: u._id }))!.panelOrderId).toBe('5001');
    });

    it('goes to the panel of the server in the URL', async () => {
      const { cookie } = await user(cost(100));
      await place(cookie, {}, 'peakerr').expect(201);
      expect(adds()[0]!.host).toBe('peakerr.com');
    });

    it('ignores any price the page sends', async () => {
      const { u, cookie } = await user(1_000_000);
      await place(cookie, { costKobo: 1, price: 1, ratePer1kKobo: 1 }).expect(201);
      expect(await wallet(u)).toBe(1_000_000 - cost(100));
    });

    it('refuses when the balance is too low, and charges nothing and sends nothing', async () => {
      const { u, cookie } = await user(cost(100) - 1);
      const res = await place(cookie);
      expect([res.status, res.body.error.code]).toEqual([402, 'insufficient_balance']);
      expect(await wallet(u)).toBe(cost(100) - 1);
      expect(adds().length).toBe(0);
    });

    it('checks the link, the quantity limits and the service', async () => {
      const { cookie } = await user(10_000_000);
      expect((await place(cookie, { link: 'not a link' })).status).toBe(400);
      expect((await place(cookie, { quantity: 0 })).status).toBe(400);
      expect((await place(cookie, { quantity: 1.5 })).status).toBe(400);
      const low = await place(cookie, { quantity: 49 });
      expect([low.status, low.body.error.message]).toEqual([400, 'Minimum quantity is 50.']);
      expect((await place(cookie, { quantity: 10001 })).body.error.message).toBe('Maximum quantity is 10,000.');
      expect((await place(cookie, { service: '999999' })).status).toBe(404);
      await request(app).post('/api/v1/boost/servers/nope/orders').set('Cookie', cookie).send({}).expect(400);
      expect(adds().length).toBe(0);
    });

    it('needs a signed-in user', async () => {
      await request(app).post('/api/v1/boost/servers/peakerr/orders').send({}).expect(401);
      await request(app).get('/api/v1/boost/orders').expect(401);
    });

    it('treats the same request id twice as ONE order: one charge, one panel order', async () => {
      const { u, cookie } = await user(cost(100) * 3);
      const requestId = 'same-form-12345';
      const a = await place(cookie, { requestId }).expect(201);
      const b = await place(cookie, { requestId }).expect(201);
      expect(b.body.order.id).toBe(a.body.order.id);
      expect(await wallet(u)).toBe(cost(100) * 2);
      expect(adds().length).toBe(1);
    });

    it('two copies at the same moment still make one order and one charge', async () => {
      const { u, cookie } = await user(cost(100) * 3);
      const requestId = 'racing-form-12345';
      await Promise.all([place(cookie, { requestId }), place(cookie, { requestId })]);
      expect(await BoostOrder.countDocuments({ userId: u._id })).toBe(1);
      expect(await wallet(u)).toBe(cost(100) * 2);
    });

    it('gives the money back, and says why, when the panel refuses', async () => {
      const cases: [string, number, string][] = [
        ['Incorrect link', 400, 'invalid_link'],
        ['Not enough funds on balance', 503, 'server_unavailable'],
        ['You have active order with this link. Please wait until order being completed.', 409, 'order_in_progress'],
        ['Quantity less than minimal', 400, 'invalid_quantity'],
        ['Something nobody planned for', 409, 'order_refused'],
      ];
      for (const [message, status, code] of cases) {
        panel = (_h, form) => (form.get('action') === 'services' ? { body: ROWS } : { body: { error: message } });
        resetBoostCache();
        const { u, cookie } = await user(cost(100));
        const res = await place(cookie);
        expect([res.status, res.body.error.code]).toEqual([status, code]);
        expect(await wallet(u)).toBe(cost(100));
        expect((await BoostOrder.findOne({ userId: u._id }))!.status).toBe('failed');
      }
    });

    it('gives the money back when the panel cannot be reached, and a re-sent refused form says "submit again"', async () => {
      const { u, cookie } = await user(cost(100));
      const requestId = 'unreachable-12345';
      vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
        if (new URLSearchParams(String(init?.body)).get('action') === 'add') throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'UND_ERR_CONNECT_TIMEOUT' } });
        return new Response(JSON.stringify(ROWS));
      });
      const res = await place(cookie, { requestId });
      expect([res.status, res.body.error.code]).toEqual([502, 'provider_unreachable']);
      expect(await wallet(u)).toBe(cost(100));
      const again = await place(cookie, { requestId });
      expect([again.status, again.body.error.code]).toEqual([409, 'order_failed']);
    });

    it('accepts a panel that wraps the order id in a list', async () => {
      panel = (_h, form) => (form.get('action') === 'services' ? { body: ROWS } : { body: { order: [777] } });
      const { u, cookie } = await user(cost(100));
      await place(cookie).expect(201);
      expect((await BoostOrder.findOne({ userId: u._id }))!.panelOrderId).toBe('777');
    });
  });

  describe('following (the boost job) and the Orders list', () => {
    const placeOne = async (balance = cost(100), over: Record<string, unknown> = {}) => {
      const x = await user(balance);
      const res = await place(x.cookie, over).expect(201);
      return { ...x, id: res.body.order.id as string };
    };
    const statusAnswer = (obj: Record<string, unknown>) => {
      panel = (_h, form) => {
        const action = form.get('action');
        if (action === 'status') return { body: { [String(form.get('orders'))]: obj } };
        if (action === 'add') return { body: { order: ++nextOrderId } };
        return { body: ROWS };
      };
    };
    const read = async (id: string) => (await BoostOrder.findById(id))!;

    it('records progress without refunding: in progress, then start count and remains', async () => {
      const o = await placeOne();
      await settleBoostOrders();
      const r = await read(o.id);
      expect([r.status, r.panelStatus, r.remains, r.startCount]).toEqual(['in_progress', 'In progress', 60, 10]);
      expect(await wallet(o.u)).toBe(0);
    });

    it('completed: marks it done, nothing refunded', async () => {
      const o = await placeOne();
      statusAnswer({ status: 'Completed', remains: '0' });
      expect((await settleBoostOrders()).settled).toBe(1);
      expect([(await read(o.id)).status, await wallet(o.u)]).toEqual(['completed', 0]);
    });

    it('canceled: refunds the whole price, once, even if the job runs again', async () => {
      const o = await placeOne();
      statusAnswer({ status: 'Canceled', remains: '100' });
      await settleBoostOrders();
      await settleBoostOrders();
      const r = await read(o.id);
      expect([r.status, r.refundedKobo, await wallet(o.u)]).toEqual(['canceled', cost(100), cost(100)]);
    });

    it('partial: refunds only the undelivered part, once', async () => {
      const o = await placeOne();
      statusAnswer({ status: 'Partial', remains: '25' }); // 25 of 100 undelivered
      await settleBoostOrders();
      await settleBoostOrders();
      const r = await read(o.id);
      expect(r.status).toBe('partial');
      expect(r.refundedKobo).toBe(Math.floor((cost(100) * 25) / 100));
      expect(await wallet(o.u)).toBe(r.refundedKobo);
    });

    it('partial with nothing left undelivered counts as completed; with everything left, as cancelled', async () => {
      const a = await placeOne();
      statusAnswer({ status: 'Partial', remains: '0' });
      await settleBoostOrders();
      expect([(await read(a.id)).status, await wallet(a.u)]).toEqual(['completed', 0]);
      const b = await placeOne();
      statusAnswer({ status: 'Partial', remains: '100' });
      await settleBoostOrders();
      expect([(await read(b.id)).status, await wallet(b.u)]).toEqual(['canceled', cost(100)]);
    });

    it('asks each panel in batches of 100 with the "orders" list, and only about open orders', async () => {
      for (let i = 0; i < 3; i++) await placeOne();
      const done = await placeOne();
      statusAnswer({ status: 'Completed', remains: '0' });
      await BoostOrder.updateOne({ _id: done.id }, { status: 'completed' });
      calls = [];
      await settleBoostOrders();
      const statusCalls = calls.filter((c) => c.form.get('action') === 'status');
      expect(statusCalls.length).toBe(1);
      expect(String(statusCalls[0]!.form.get('orders')).split(',').length).toBe(3);
    });

    it('keeps going when a panel is down, and leaves its orders for next time', async () => {
      const o = await placeOne();
      vi.stubGlobal('fetch', async () => { throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'UND_ERR_CONNECT_TIMEOUT' } }); });
      await expect(settleBoostOrders()).resolves.toMatchObject({ settled: 0 });
      expect([(await read(o.id)).status, await wallet(o.u)]).toEqual(['pending', 0]);
    });

    it('does not refund because a panel says it does not know the order id', async () => {
      const o = await placeOne();
      statusAnswer({ error: 'Incorrect order ID' });
      await settleBoostOrders();
      expect([(await read(o.id)).status, await wallet(o.u)]).toEqual(['pending', 0]);
    });

    it('the Orders list shows only my orders, newest first, with refunds, and never the in-flight ones', async () => {
      const a = await user(cost(100) * 3);
      const b = await user(cost(100));
      await place(a.cookie, { quantity: 100 }).expect(201);
      const second = await place(a.cookie, { quantity: 200 }).expect(201);
      await place(b.cookie).expect(201);
      await BoostOrder.create({ userId: a.u._id, requestId: 'placing-only', server: 'peakerr', serviceId: '1', serviceName: 'x', link: 'https://x.test', quantity: 1, costKobo: 1 }); // status "placing"
      const list = await request(app).get('/api/v1/boost/orders').set('Cookie', a.cookie).expect(200);
      expect(list.body.orders.map((o: { quantity: number }) => o.quantity)).toEqual([200, 100]);
      expect(list.body.orders[0].id).toBe(second.body.order.id);
      expect(list.body.orders[0]).toHaveProperty('refundedKobo');
    });
  });
});
