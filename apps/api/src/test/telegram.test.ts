import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/mailer.js', () => ({ sendCodeEmail: async () => {} }));

import { buildApp } from '../app.js';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { TelegramOrder } from '../models/TelegramOrder.js';
import { ACCESS_COOKIE, signAccessToken } from '../lib/tokens.js';
import { priceKobo, resetTelegramCache, settleTelegramOrders } from '../services/telegram.service.js';

const app = buildApp();

// 2850 cents = $28.50 x 1500 x 1.30 = N55,575 = 5,557,500 kobo (default markup 30%)
const CENTS = 2850;
const PRICE = 5_557_500;

let counter = 0;
async function user(balanceKobo: number) {
  const n = ++counter;
  const u = await User.create({ email: `tg${n}@example.com`, phone: `+234806${String(5000000 + n)}`, username: `tg${n}`, usernameLower: `tg${n}`, passwordHash: 'x', isVerified: true, balanceKobo });
  return { u, cookie: `${ACCESS_COOKIE}=${signAccessToken(String(u._id), 'user')}` };
}
const wallet = async (u: { _id: unknown }) => (await User.findById(u._id as string))!.balanceKobo;

type Reply = { status?: number; body?: unknown; throws?: boolean };
let recipientReply: Reply;
let orderReply: Reply;
let statusReply: Reply;
let calls: { method: string; path: string; query: URLSearchParams; body: any; auth: string | null }[];

const RECIPIENT = { valid: true, recipient: '@ada_codes', name: 'Ada', photo: 'https://t.me/i/userpic/320/ada_codes.jpg', myself: false, amount_cents: CENTS, amount_usd: '28.50', error: null };
const CREATED = { id: 'ord_1', status: 'delivered', service: 'stars', quantity: 1000, recipient: '@ada_codes', amount_cents: CENTS, mode: 'test', created_at: '2026-10-07T10:00:00+00:00' };

beforeEach(() => {
  resetTelegramCache();
  env.GRAMSUBS_SECRET_KEY = 'sk_test_fake';
  calls = [];
  recipientReply = { body: RECIPIENT };
  orderReply = { status: 201, body: CREATED };
  statusReply = { body: { ...CREATED, status: 'delivered' } };
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    const u = new URL(url);
    const method = (init?.method ?? 'GET').toUpperCase();
    calls.push({ method, path: u.pathname, query: u.searchParams, body: init?.body ? JSON.parse(String(init.body)) : null, auth: (init?.headers as Record<string, string>)?.authorization ?? null });
    const reply = u.pathname === '/api/v1/recipient' ? recipientReply : method === 'POST' ? orderReply : statusReply;
    if (reply.throws) throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNRESET' } });
    return new Response(JSON.stringify(reply.body ?? {}), { status: reply.status ?? 200, headers: { 'content-type': 'application/json' } });
  });
});
afterEach(() => vi.unstubAllGlobals());

const posts = () => calls.filter((c) => c.method === 'POST');
const buy = (cookie: string, extra: Record<string, unknown> = {}) =>
  request(app).post('/api/v1/telegram/orders').set('Cookie', cookie).send({ service: 'stars', units: 1000, username: '@ada_codes', requestId: `req-${Math.random().toString(36).slice(2)}-aaaa`, ...extra });

describe('telegram: pricing', () => {
  it('our price = GramSubs dollars x naira rate x (1 + markup), in kobo, never free', () => {
    expect(priceKobo(CENTS)).toBe(PRICE);
    expect(priceKobo(0)).toBe(1);
  });
});

describe('telegram: quote', () => {
  it('shows who the username is and our price, charging nothing', async () => {
    const { cookie, u } = await user(1_000);
    const res = await request(app).get('/api/v1/telegram/quote?service=stars&units=1000&username=@ada_codes').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.quote).toEqual({ recipient: '@ada_codes', name: 'Ada', photo: RECIPIENT.photo, priceKobo: PRICE });
    expect(calls[0]!.auth).toBe('Bearer sk_test_fake');
    expect(calls[0]!.query.get('quantity')).toBe('1000'); // stars are asked for by quantity
    expect(calls[0]!.query.get('username')).toBe('ada_codes'); // the @ is dropped
    expect(await wallet(u)).toBe(1_000);
  });

  it('asks for premium by months', async () => {
    const { cookie } = await user(0);
    await request(app).get('/api/v1/telegram/quote?service=premium&units=6&username=ada_codes').set('Cookie', cookie);
    expect(calls[0]!.query.get('months')).toBe('6');
    expect(calls[0]!.query.get('quantity')).toBeNull();
  });

  it('says so when the username does not exist', async () => {
    recipientReply = { status: 422, body: { valid: false, error: 'recipient_invalid' } };
    const { cookie } = await user(0);
    const res = await request(app).get('/api/v1/telegram/quote?service=stars&units=50&username=nobody_here').set('Cookie', cookie);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('recipient_invalid');
  });

  it("never shows the supplier's own sentence when the check fails with one (it could name them)", async () => {
    recipientReply = { status: 200, body: { valid: false, recipient: null, amount_cents: CENTS, error: "We couldn't check that username right now. Please try again." } };
    const { cookie } = await user(0);
    const res = await request(app).get('/api/v1/telegram/quote?service=stars&units=50&username=ada_codes').set('Cookie', cookie);
    expect(res.status).toBe(422);
    expect(res.body.error.message).toBe("We couldn't find that Telegram username. Check the spelling and try again.");
  });

  it('refuses a plan or a username that is not allowed, before asking GramSubs', async () => {
    const { cookie } = await user(0);
    for (const q of ['service=stars&units=7&username=ada_codes', 'service=premium&units=1&username=ada_codes', 'service=stars&units=50&username=ab', 'service=gold&units=50&username=ada_codes']) {
      expect((await request(app).get(`/api/v1/telegram/quote?${q}`).set('Cookie', cookie)).status).toBe(400);
    }
    expect(calls).toHaveLength(0);
  });

  it('needs sign-in', async () => {
    expect((await request(app).get('/api/v1/telegram/quote?service=stars&units=50&username=ada_codes')).status).toBe(401);
  });
});

describe('telegram: buying', () => {
  it('the charge and the order are ONE step: if the order cannot be saved, the money never leaves the wallet and nothing is ordered', async () => {
    const { cookie, u } = await user(PRICE + 100);
    const spy = vi.spyOn(TelegramOrder, 'create').mockRejectedValueOnce(new Error('disk full') as never);
    const res = await buy(cookie);
    spy.mockRestore();
    expect(res.status).toBe(500);
    expect(await wallet(u)).toBe(PRICE + 100);
    expect(posts()).toHaveLength(0);
  });

  it('charges the wallet exactly once and records the delivered order', async () => {
    const { cookie, u } = await user(PRICE + 100);
    const res = await buy(cookie);
    expect(res.status).toBe(201);
    expect(res.body.order).toMatchObject({ service: 'stars', units: 1000, recipient: '@ada_codes', costKobo: PRICE, status: 'delivered' });
    expect(await wallet(u)).toBe(100);
    expect(posts()).toHaveLength(1);
    expect(posts()[0]!.body).toEqual({ service: 'stars', username: 'ada_codes', quantity: 1000 });
    const saved = await TelegramOrder.findOne({ userId: u._id });
    expect(saved).toMatchObject({ providerRef: 'ord_1', mode: 'test', usdCents: CENTS, refundedKobo: 0 });
  });

  it('sends premium with months', async () => {
    const { cookie } = await user(PRICE);
    await buy(cookie, { service: 'premium', units: 6 });
    expect(posts()[0]!.body).toEqual({ service: 'premium', username: 'ada_codes', months: 6 });
  });

  it('ignores the price from the page: it only ever charges what GramSubs quoted', async () => {
    const { cookie, u } = await user(PRICE);
    await buy(cookie, { priceKobo: 1, costKobo: 1 });
    expect(await wallet(u)).toBe(0);
  });

  it('is not charged and nothing is ordered when the wallet is too low', async () => {
    const { cookie, u } = await user(PRICE - 1);
    const res = await buy(cookie);
    expect(res.status).toBe(402);
    expect(res.body.error.code).toBe('insufficient_balance');
    expect(await wallet(u)).toBe(PRICE - 1);
    expect(posts()).toHaveLength(0);
  });

  it('does not charge for a username that does not exist', async () => {
    recipientReply = { status: 422, body: { valid: false } };
    const { cookie, u } = await user(PRICE);
    const res = await buy(cookie);
    expect(res.status).toBe(422);
    expect(await wallet(u)).toBe(PRICE);
    expect(posts()).toHaveLength(0);
  });

  it('the same request id twice is one purchase and one charge', async () => {
    const { cookie, u } = await user(PRICE * 2);
    const requestId = 'same-request-id-1';
    const a = await buy(cookie, { requestId });
    const b = await buy(cookie, { requestId });
    expect(a.body.order.id).toBe(b.body.order.id);
    expect(posts()).toHaveLength(1);
    expect(await wallet(u)).toBe(PRICE);
  });

  it('gives the money back, once, when GramSubs refuses the order', async () => {
    for (const status of [422, 402, 401, 429]) {
      orderReply = { status, body: { error: 'nope' } };
      const { cookie, u } = await user(PRICE);
      const res = await buy(cookie);
      expect(res.status).toBe(409);
      expect(await wallet(u)).toBe(PRICE);
      expect(await TelegramOrder.findOne({ userId: u._id })).toMatchObject({ status: 'failed', refundedKobo: PRICE });
    }
  });

  it('never shows the buyer GramSubs\' own words or balance problems', async () => {
    orderReply = { status: 402, body: { error: 'insufficient_balance', message: 'GramSubs wallet is empty' } };
    const { cookie } = await user(PRICE);
    const res = await buy(cookie);
    expect(JSON.stringify(res.body)).not.toMatch(/GramSubs|wallet is empty|insufficient_balance/);
  });

  it('HOLDS the money (no refund) when it cannot tell whether GramSubs took the order', async () => {
    for (const reply of [{ status: 500, body: {} }, { throws: true }] as Reply[]) {
      orderReply = reply;
      const { cookie, u } = await user(PRICE);
      const res = await buy(cookie);
      expect(res.status).toBe(201);
      expect(res.body.order.status).toBe('review');
      expect(await wallet(u)).toBe(0); // NOT refunded: the order may have gone through
      expect(await TelegramOrder.findOne({ userId: u._id })).toMatchObject({ status: 'review', refundedKobo: 0 });
    }
  });

  it('holds the money when GramSubs says yes but gives no order id', async () => {
    orderReply = { status: 201, body: { status: 'delivered' } };
    const { cookie, u } = await user(PRICE);
    expect((await buy(cookie)).body.order.status).toBe('review');
    expect(await wallet(u)).toBe(0);
  });

  it('refunds when GramSubs accepts the order and fails it straight away', async () => {
    orderReply = { status: 201, body: { ...CREATED, status: 'failed' } };
    const { cookie, u } = await user(PRICE);
    expect((await buy(cookie)).status).toBe(409);
    expect(await wallet(u)).toBe(PRICE);
  });

  it('says "not set up" and charges nothing when there is no key', async () => {
    env.GRAMSUBS_SECRET_KEY = undefined;
    env.GRAMSUBS_API_KEY = undefined;
    const { cookie, u } = await user(PRICE);
    const res = await buy(cookie);
    expect(res.status).toBe(503);
    expect(await wallet(u)).toBe(PRICE);
  });
});

describe('telegram: orders and the job', () => {
  it('lists only my orders', async () => {
    const a = await user(PRICE);
    const b = await user(PRICE);
    await buy(a.cookie);
    expect((await request(app).get('/api/v1/telegram/orders').set('Cookie', a.cookie)).body.orders).toHaveLength(1);
    expect((await request(app).get('/api/v1/telegram/orders').set('Cookie', b.cookie)).body.orders).toHaveLength(0);
  });

  it('follows an order GramSubs has not delivered yet, and marks it delivered', async () => {
    orderReply = { status: 201, body: { ...CREATED, status: 'pending' } };
    const { cookie, u } = await user(PRICE);
    expect((await buy(cookie)).body.order.status).toBe('processing');
    statusReply = { body: { ...CREATED, status: 'pending' } };
    expect((await settleTelegramOrders()).settled).toBe(0);
    statusReply = { body: { ...CREATED, status: 'delivered' } };
    expect((await settleTelegramOrders()).settled).toBe(1);
    expect((await TelegramOrder.findOne({ userId: u._id }))!.status).toBe('delivered');
  });

  it('refunds an order that fails later, exactly once however often the job runs', async () => {
    orderReply = { status: 201, body: { ...CREATED, status: 'processing' } };
    const { cookie, u } = await user(PRICE);
    await buy(cookie);
    expect(await wallet(u)).toBe(0);
    statusReply = { body: { ...CREATED, status: 'failed' } };
    await Promise.all([settleTelegramOrders(), settleTelegramOrders()]);
    await settleTelegramOrders();
    expect(await wallet(u)).toBe(PRICE);
    expect(await TelegramOrder.findOne({ userId: u._id })).toMatchObject({ status: 'failed', refundedKobo: PRICE });
  });

  it('leaves the order alone when GramSubs cannot be reached', async () => {
    orderReply = { status: 201, body: { ...CREATED, status: 'pending' } };
    const { cookie, u } = await user(PRICE);
    await buy(cookie);
    statusReply = { status: 500, body: {} };
    expect((await settleTelegramOrders()).settled).toBe(0);
    expect(await wallet(u)).toBe(0);
    expect((await TelegramOrder.findOne({ userId: u._id }))!.status).toBe('processing');
  });
});
