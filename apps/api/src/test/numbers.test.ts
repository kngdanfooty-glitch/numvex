import mongoose from 'mongoose';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/mailer.js', () => ({ sendCodeEmail: async () => {} }));

import { buildApp } from '../app.js';
import { User } from '../models/User.js';
import { Activation } from '../models/Activation.js';
import { resetDaisyPricesCache } from '../services/daisysms.js';
import { resetSmspoolCache } from '../services/smspool.js';
import { resetJuicyCache } from '../services/juicysms.js';
import { resetFivesimCache } from '../services/fivesim.js';
import { resetPollCooldowns, runPollSweep } from '../jobs/pollJob.js';
import { runRefundSweep } from '../jobs/refundJob.js';
import { WAIT_MS, waitingUntil } from '../services/numbers.service.js';
import { providerFetch } from '../lib/providerFetch.js';
import { ACCESS_COOKIE, signAccessToken } from '../lib/tokens.js';

const app = buildApp();

// A fake DaisySMS: answers by action, so each test decides what the provider says.
let provider: Record<string, string>;
let daisyUrls: URL[];
beforeEach(() => {
  resetFivesimCache();
  resetJuicyCache();
  resetSmspoolCache();
  resetPollCooldowns();
  resetDaisyPricesCache();
  process.env.DAISYSMS_API_KEY = 'test-key';
  provider = {
    getPrices: JSON.stringify({ amazon: { cost: 0.3, count: 10, multi: 1 } }),
    getNumber: 'ACCESS_NUMBER:555:12025550123',
    getStatus: 'STATUS_WAIT_CODE',
    setStatus: 'ACCESS_CANCEL',
  };
  daisyUrls = [];
  vi.stubGlobal('fetch', async (url: string) => {
    daisyUrls.push(new URL(url));
    const action = new URL(url).searchParams.get('action')!;
    return new Response(provider[action] ?? 'BAD_ACTION');
  });
});
afterEach(() => vi.unstubAllGlobals());

// $0.30 x 1500 = N450, plus 30% = N585 = 58,500 kobo
const COST = 58_500;

let counter = 0;
async function loggedInUser(balanceKobo: number) {
  const n = ++counter;
  const user = await User.create({
    email: `u${n}@example.com`,
    phone: `+234803${String(1000000 + n)}`,
    username: `user${n}`,
    usernameLower: `user${n}`,
    passwordHash: 'x',
    isVerified: true,
    balanceKobo,
  });
  return { user, cookie: `${ACCESS_COOKIE}=${signAccessToken(String(user._id), 'user')}` };
}

describe('numbers: DaisySMS buying', () => {
  it('quotes the naira price', async () => {
    const { cookie } = await loggedInUser(0);
    const res = await request(app).get('/api/v1/numbers/servers/daisysms/price?service=amazon').set('Cookie', cookie).expect(200);
    expect(res.body).toEqual({ costKobo: COST, stock: 10 });
  });

  it('asks DaisySMS for the price list once for several quotes in a row', async () => {
    const { cookie } = await loggedInUser(0);
    for (let i = 0; i < 5; i++) await request(app).get('/api/v1/numbers/servers/daisysms/price?service=amazon').set('Cookie', cookie).expect(200);
    expect(daisyUrls.filter((u) => u.searchParams.get('action') === 'getPrices').length).toBe(1);
  });

  it('keeps showing prices from the last good list when DaisySMS says RATE_LIMIT_EXCEEDED', async () => {
    const { cookie } = await loggedInUser(0);
    await request(app).get('/api/v1/numbers/servers/daisysms/price?service=amazon').set('Cookie', cookie).expect(200);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 60_000); // the 20s cache has gone stale
    provider.getPrices = 'RATE_LIMIT_EXCEEDED';
    const res = await request(app).get('/api/v1/numbers/servers/daisysms/price?service=amazon').set('Cookie', cookie);
    vi.useRealTimers();
    expect(res.status).toBe(200);
    expect(res.body.costKobo).toBe(COST);
  });

  it('says the server is busy (not a 500) when rate limited with nothing cached', async () => {
    provider.getPrices = 'RATE_LIMIT_EXCEEDED';
    const { cookie } = await loggedInUser(0);
    const res = await request(app).get('/api/v1/numbers/servers/daisysms/price?service=amazon').set('Cookie', cookie);
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('server_busy');
  });

  it('reads the price list whether it is flat or nested under the USA code', async () => {
    provider.getPrices = JSON.stringify({ '187': { amazon: { cost: 0.3, count: 10 } } });
    const { cookie } = await loggedInUser(0);
    const res = await request(app).get('/api/v1/numbers/servers/daisysms/price?service=amazon').set('Cookie', cookie).expect(200);
    expect(res.body).toEqual({ costKobo: COST, stock: 10 });
  });

  it('charges the wallet and stores the number', async () => {
    const { user, cookie } = await loggedInUser(COST + 500);
    const res = await request(app).post('/api/v1/numbers/servers/daisysms/buy').set('Cookie', cookie).send({ service: 'amazon' }).expect(201);
    expect(res.body.activation.number).toBe('+12025550123');
    expect((await User.findById(user._id))!.balanceKobo).toBe(500);
  });

  it('gives the buyer at most 7 minutes to wait, even though DaisySMS itself would hold the number for 15', async () => {
    const MIN = 60_000;
    const { cookie } = await loggedInUser(COST + 500);
    const before = Date.now();
    const res = await request(app).post('/api/v1/numbers/servers/daisysms/buy').set('Cookie', cookie).send({ service: 'amazon' }).expect(201);
    const left = new Date(res.body.activation.expiresAt).getTime() - before;
    expect(left).toBeGreaterThan(6.9 * MIN);
    expect(left).toBeLessThanOrEqual(7 * MIN + 1_000);
  });

  it('the wait is 7 minutes, or less when the provider keeps the number for less', () => {
    const MIN = 60_000;
    const now = Date.UTC(2026, 9, 8, 12, 0, 0);
    const at = (minutes: number) => new Date(now + minutes * MIN);
    expect(waitingUntil(at(20), 0, now)).toEqual(at(7)); // provider would hold it 20 minutes: cancelled at 7
    expect(waitingUntil(undefined, 15 * MIN, now)).toEqual(at(7)); // no end time from the provider: its usual 15 minutes, capped at 7
    expect(waitingUntil(at(3), 20 * MIN, now)).toEqual(at(3)); // provider ends sooner: never promise longer than it keeps the number
    expect(waitingUntil(undefined, 5 * MIN, now)).toEqual(at(5));
    expect(WAIT_MS).toBe(7 * MIN);
  });

  it('refuses when the balance is too low, and charges nothing', async () => {
    const { user, cookie } = await loggedInUser(COST - 1);
    const res = await request(app).post('/api/v1/numbers/servers/daisysms/buy').set('Cookie', cookie).send({ service: 'amazon' });
    expect(res.status).toBe(402);
    expect((await User.findById(user._id))!.balanceKobo).toBe(COST - 1);
  });

  it('gives the money back when the provider has no number', async () => {
    provider.getNumber = 'NO_NUMBERS';
    const { user, cookie } = await loggedInUser(COST);
    const res = await request(app).post('/api/v1/numbers/servers/daisysms/buy').set('Cookie', cookie).send({ service: 'amazon' });
    expect(res.status).toBe(409);
    expect((await User.findById(user._id))!.balanceKobo).toBe(COST);
  });

  it("tells the user the server is unavailable (not 'no numbers') when our own DaisySMS balance is empty, and refunds", async () => {
    provider.getNumber = 'NO_MONEY';
    const { user, cookie } = await loggedInUser(COST);
    const res = await request(app).post('/api/v1/numbers/servers/daisysms/buy').set('Cookie', cookie).send({ service: 'amazon' });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('server_unavailable');
    expect((await User.findById(user._id))!.balanceKobo).toBe(COST);
  });

  it('shows the code once it arrives', async () => {
    const { cookie } = await loggedInUser(COST);
    const bought = await request(app).post('/api/v1/numbers/servers/daisysms/buy').set('Cookie', cookie).send({ service: 'amazon' });
    provider.getStatus = 'STATUS_OK:123456';
    await runPollSweep(); // the job asks DaisySMS and writes the code to the database; the page then just reads it
    const res = await request(app).get(`/api/v1/numbers/activations/${bought.body.activation.id}`).set('Cookie', cookie).expect(200);
    expect(res.body.activation).toMatchObject({ status: 'completed', code: '123456' });
  });

  it("lists only the user's own numbers, newest first", async () => {
    const a = await loggedInUser(COST * 2);
    const b = await loggedInUser(COST);
    await request(app).post('/api/v1/numbers/servers/daisysms/buy').set('Cookie', a.cookie).send({ service: 'amazon' }).expect(201);
    provider.getNumber = 'ACCESS_NUMBER:556:12025550199';
    await request(app).post('/api/v1/numbers/servers/daisysms/buy').set('Cookie', a.cookie).send({ service: 'amazon' }).expect(201);
    await request(app).post('/api/v1/numbers/servers/daisysms/buy').set('Cookie', b.cookie).send({ service: 'amazon' }).expect(201);

    const mine = await request(app).get('/api/v1/numbers/activations').set('Cookie', a.cookie).expect(200);
    expect(mine.body.activations.map((x: { number: string }) => x.number)).toEqual(['+12025550199', '+12025550123']);
    expect(mine.body.activations[0]).toHaveProperty('createdAt');
    await request(app).get('/api/v1/numbers/activations').expect(401);
  });

  it('refunds a cancel exactly once, even if cancel is pressed twice', async () => {
    const { user, cookie } = await loggedInUser(COST);
    const bought = await request(app).post('/api/v1/numbers/servers/daisysms/buy').set('Cookie', cookie).send({ service: 'amazon' });
    const id = bought.body.activation.id;
    await request(app).post(`/api/v1/numbers/activations/${id}/cancel`).set('Cookie', cookie).expect(200);
    await request(app).post(`/api/v1/numbers/activations/${id}/cancel`).set('Cookie', cookie).expect(200);
    expect((await User.findById(user._id))!.balanceKobo).toBe(COST);
    expect((await Activation.findById(id))!.status).toBe('cancelled');
  });

  it("won't show or cancel someone else's number", async () => {
    const a = await loggedInUser(COST);
    const b = await loggedInUser(0);
    const bought = await request(app).post('/api/v1/numbers/servers/daisysms/buy').set('Cookie', a.cookie).send({ service: 'amazon' });
    await request(app).get(`/api/v1/numbers/activations/${bought.body.activation.id}`).set('Cookie', b.cookie).expect(404);
  });
});

// A fake TextVerified: answers by method + path, so each test decides what the provider says.
describe('numbers: TextVerified buying', () => {
  const NUMBER = '5551234567';
  let tv: Record<string, { status?: number; body?: unknown }>;
  const calls: string[] = [];
  let bodies: Record<string, any>;

  beforeEach(() => {
    process.env.TEXTVERIFIED_API_KEY = 'k';
    process.env.TEXTVERIFIED_USERNAME = 'u@example.com';
    calls.length = 0;
    const verification = (state: string) => ({
      id: 'v1',
      number: NUMBER,
      state,
      createdAt: '2026-01-01T00:00:00Z',
      endsAt: new Date(Date.now() + 600_000).toISOString(),
    });
    tv = {
      'POST /auth': { body: { token: 'tok', expiresAt: new Date(Date.now() + 3_600_000).toISOString() } },
      'POST /pricing/verifications': { body: { serviceName: 'amazon', price: 0.3 } },
      'POST /inventory/verifications': { body: { availableQuantity: 372 } },
      'POST /verifications': { status: 201, body: { method: 'GET', href: 'https://www.textverified.com/api/pub/v2/verifications/v1' } },
      'GET /verifications/v1': { body: verification('verificationPending') },
      'GET /sms': { body: { data: [] } },
      'POST /verifications/v1/cancel': { status: 200, body: {} },
    };
    bodies = {};
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      const path = new URL(url).pathname.replace('/api/pub/v2', '');
      const key = `${init?.method ?? 'GET'} ${path}`;
      calls.push(key);
      if (init?.body) bodies[key] = JSON.parse(String(init.body));
      const hit = tv[key];
      return hit ? new Response(JSON.stringify(hit.body ?? {}), { status: hit.status ?? 200 }) : new Response('{}', { status: 404 });
    });
  });

  const buyOne = async (balance = COST) => {
    const u = await loggedInUser(balance);
    const res = await request(app).post('/api/v1/numbers/servers/textverified/buy').set('Cookie', u.cookie).send({ service: 'amazon' });
    return { ...u, res };
  };

  it('quotes in naira, with the stock TextVerified reports', async () => {
    const { cookie } = await loggedInUser(0);
    const res = await request(app).get('/api/v1/numbers/servers/textverified/price?service=amazon').set('Cookie', cookie).expect(200);
    expect(res.body).toEqual({ costKobo: COST, stock: 372 });
    expect(bodies['POST /inventory/verifications']).toMatchObject({ serviceName: 'amazon', numberType: 'mobile', capability: 'sms' });
  });

  it('reports 0 stock when TextVerified has none', async () => {
    tv['POST /inventory/verifications'] = { body: { availableQuantity: 0 } };
    const { cookie } = await loggedInUser(0);
    const res = await request(app).get('/api/v1/numbers/servers/textverified/price?service=amazon').set('Cookie', cookie).expect(200);
    expect(res.body.stock).toBe(0);
  });

  it('still shows the price when the stock call fails', async () => {
    tv['POST /inventory/verifications'] = { status: 500, body: {} };
    const { cookie } = await loggedInUser(0);
    const res = await request(app).get('/api/v1/numbers/servers/textverified/price?service=amazon').set('Cookie', cookie).expect(200);
    expect(res.body).toEqual({ costKobo: COST, stock: null });
  });

  it('buys: follows the link, formats the number, charges the wallet', async () => {
    const { user, res } = await buyOne(COST + 500);
    expect(res.status).toBe(201);
    expect(res.body.activation).toMatchObject({ number: '+15551234567', server: 'textverified' });
    expect((await User.findById(user._id))!.balanceKobo).toBe(500);
  });

  it('refunds when TextVerified refuses to create the number', async () => {
    tv['POST /verifications'] = { status: 400, body: {} };
    const { user, res } = await buyOne();
    expect(res.status).toBe(409);
    expect((await User.findById(user._id))!.balanceKobo).toBe(COST);
  });

  it('shows the code once a message arrives', async () => {
    const { cookie, res } = await buyOne();
    tv['GET /sms'] = { body: { data: [{ parsedCode: '482913', createdAt: '2026-01-01T00:00:05Z' }] } };
    await runPollSweep();
    const got = await request(app).get(`/api/v1/numbers/activations/${res.body.activation.id}`).set('Cookie', cookie).expect(200);
    expect(got.body.activation).toMatchObject({ status: 'completed', code: '482913' });
  });

  it("ignores a message older than this verification (a reused number's old code)", async () => {
    const { cookie, res } = await buyOne();
    tv['GET /sms'] = { body: { data: [{ parsedCode: '111111', createdAt: '2025-12-31T00:00:00Z' }] } };
    await runPollSweep();
    const got = await request(app).get(`/api/v1/numbers/activations/${res.body.activation.id}`).set('Cookie', cookie).expect(200);
    expect(got.body.activation.status).toBe('pending');
  });

  it('refunds when TextVerified reports the verification timed out', async () => {
    const { user, cookie, res } = await buyOne();
    tv['GET /verifications/v1'] = { body: { id: 'v1', number: NUMBER, state: 'verificationTimedOut', createdAt: '2026-01-01T00:00:00Z', endsAt: '2026-01-01T00:10:00Z' } };
    await runPollSweep();
    const got = await request(app).get(`/api/v1/numbers/activations/${res.body.activation.id}`).set('Cookie', cookie).expect(200);
    expect(got.body.activation.status).toBe('cancelled');
    expect((await User.findById(user._id))!.balanceKobo).toBe(COST);
  });

  it('cancels and refunds once, and signs in only once', async () => {
    const { user, cookie, res } = await buyOne();
    const id = res.body.activation.id;
    await request(app).post(`/api/v1/numbers/activations/${id}/cancel`).set('Cookie', cookie).expect(200);
    await request(app).post(`/api/v1/numbers/activations/${id}/cancel`).set('Cookie', cookie).expect(200);
    expect((await User.findById(user._id))!.balanceKobo).toBe(COST);
    expect(calls.filter((c) => c === 'POST /auth').length).toBeLessThanOrEqual(1);
  });
});

const connectTimeout = () => Object.assign(new TypeError('fetch failed'), { cause: { code: 'UND_ERR_CONNECT_TIMEOUT' } });

describe('numbers: refund job, mark as done, flaky networks', () => {
  const MIN = 60_000;
  /** A pending DaisySMS number for a fresh user, expiring `expiresInMs` from now (negative = already expired). */
  async function pendingNumber(expiresInMs: number, providerOrderId = '555', balance = 0) {
    const u = await loggedInUser(balance);
    const a = await Activation.create({
      userId: u.user._id, server: 'daisysms', providerOrderId, number: '+12025550123', service: 'amazon',
      country: 'United States', costKobo: COST, expiresAt: new Date(Date.now() + expiresInMs),
    });
    return { ...u, id: String(a._id) };
  }
  const walletOf = async (u: { user: { _id: unknown } }) => (await User.findById(u.user._id as string))!.balanceKobo;
  const statusOf = async (id: string) => (await Activation.findById(id))!.status;

  it('job refunds a number that expired when the provider says it was cancelled', async () => {
    provider.getStatus = 'STATUS_CANCEL';
    const n = await pendingNumber(-5 * MIN);
    expect(await runRefundSweep()).toMatchObject({ looked: expect.any(Number) });
    expect(await statusOf(n.id)).toBe('cancelled');
    expect(await walletOf(n)).toBe(COST);
  });

  it('job cancels an expired number at the provider, then refunds', async () => {
    const n = await pendingNumber(-5 * MIN); // provider: still waiting, and cancel works
    await runRefundSweep();
    expect(daisyUrls.some((u) => u.searchParams.get('action') === 'setStatus' && u.searchParams.get('status') === '8')).toBe(true);
    expect(await statusOf(n.id)).toBe('cancelled');
    expect(await walletOf(n)).toBe(COST);
  });

  it('job completes (and does not refund) a number whose code arrived after all', async () => {
    provider.getStatus = 'STATUS_OK:424242';
    const n = await pendingNumber(-5 * MIN);
    await runRefundSweep();
    const a = (await Activation.findById(n.id))!;
    expect([a.status, a.code]).toEqual(['completed', '424242']);
    expect(await walletOf(n)).toBe(0);
  });

  it('job does not refund when the provider cannot cancel and the number is still waiting', async () => {
    provider.setStatus = 'ACCESS_READY'; // DaisySMS: "can't cancel"
    const n = await pendingNumber(-5 * MIN);
    await runRefundSweep();
    expect(await statusOf(n.id)).toBe('pending');
    expect(await walletOf(n)).toBe(0);
  });

  it('job refunds a number 15 minutes old even when the provider cannot cancel it and still says waiting', async () => {
    provider.setStatus = 'ACCESS_READY'; // the provider refuses to cancel
    const n = await pendingNumber(-8 * MIN);
    await Activation.collection.updateOne({ _id: new mongoose.Types.ObjectId(n.id) }, { $set: { createdAt: new Date(Date.now() - 16 * MIN) } });
    await runRefundSweep();
    expect(await statusOf(n.id)).toBe('cancelled');
    expect(await walletOf(n)).toBe(COST);
  });

  it('job leaves alone numbers not yet expired, inside the few seconds of grace, and older than a day', async () => {
    const fresh = await pendingNumber(5 * MIN, '1');
    const grace = await pendingNumber(-2_000, '2'); // the countdown ended 2 seconds ago
    const ancient = await pendingNumber(-25 * 60 * MIN, '3');
    await runRefundSweep();
    for (const n of [fresh, grace, ancient]) expect(await statusOf(n.id)).toBe('pending');
  });

  it("both jobs leave alone an order for a server we no longer sell (no errors, no refund)", async () => {
    const u = await loggedInUser(0);
    const old = await Activation.create({
      userId: u.user._id, server: 'pvadeals', providerOrderId: 'old1', number: '+13130001234', service: 'Amazon',
      country: 'United States', costKobo: COST, expiresAt: new Date(Date.now() - 5 * MIN),
    });
    expect(await runRefundSweep()).toEqual({ looked: 0, settled: 0 });
    expect(await runPollSweep()).toEqual({ polled: 0, settled: 0 });
    expect((await Activation.findById(old._id))!.status).toBe('pending');
  });

  it('cancels and refunds a number within seconds of the countdown ending, and not before', async () => {
    const early = await pendingNumber(-2_000, 'a'); // ended 2 seconds ago: still inside the few seconds of grace
    const due = await pendingNumber(-10_000, 'b'); // ended 10 seconds ago
    await runRefundSweep();
    expect(await statusOf(early.id)).toBe('pending');
    expect(await statusOf(due.id)).toBe('cancelled');
    expect(await walletOf(due)).toBe(COST);
  });

  it('running the job twice refunds only once', async () => {
    const n = await pendingNumber(-5 * MIN);
    await runRefundSweep();
    await runRefundSweep();
    expect(await walletOf(n)).toBe(COST);
  });

  it('job keeps going when one provider call cannot connect', async () => {
    const stuck = await pendingNumber(-5 * MIN, '111');
    const fine = await pendingNumber(-5 * MIN, '222');
    vi.stubGlobal('fetch', async (url: string) => {
      const u = new URL(url);
      if (u.searchParams.get('id') === '111') throw connectTimeout();
      return new Response(u.searchParams.get('action') === 'getStatus' ? 'STATUS_CANCEL' : 'ACCESS_CANCEL');
    });
    await runRefundSweep();
    expect(await statusOf(stuck.id)).toBe('pending'); // looked at again next minute
    expect(await walletOf(stuck)).toBe(0);
    expect(await statusOf(fine.id)).toBe('cancelled');
    expect(await walletOf(fine)).toBe(COST);
  });

  it('the page poll only reads the database: it never calls a provider, even for a waiting number', async () => {
    const n = await pendingNumber(10 * MIN);
    let providerCalls = 0;
    vi.stubGlobal('fetch', async () => { providerCalls++; throw connectTimeout(); });
    for (let i = 0; i < 3; i++) {
      const res = await request(app).get(`/api/v1/numbers/activations/${n.id}`).set('Cookie', n.cookie).expect(200);
      expect(res.body.activation.status).toBe('pending');
    }
    expect(providerCalls).toBe(0);
  });

  it('the poll job writes the code to the database for the page to read, and the page never needed the provider', async () => {
    provider.getStatus = 'STATUS_OK:777888';
    const n = await pendingNumber(10 * MIN);
    expect(await runPollSweep()).toEqual({ polled: 1, settled: 1 });
    vi.stubGlobal('fetch', async () => { throw connectTimeout(); }); // provider now unreachable: the page still has the code
    const res = await request(app).get(`/api/v1/numbers/activations/${n.id}`).set('Cookie', n.cookie).expect(200);
    expect(res.body.activation).toMatchObject({ status: 'completed', code: '777888' });
  });

  it('the poll job asks about one number at most every 12 seconds, and skips expired ones', async () => {
    await pendingNumber(10 * MIN, '801');
    await pendingNumber(-5 * MIN, '802'); // expired: the refund job's business, not the poll job's
    expect((await runPollSweep()).polled).toBe(1);
    expect((await runPollSweep()).polled).toBe(0); // just polled
    expect(daisyUrls.filter((u) => u.searchParams.get('action') === 'getStatus').map((u) => u.searchParams.get('id'))).toEqual(['801']);
    expect((await runPollSweep(new Date(Date.now() + 5_000))).polled).toBe(0); // 5s later: still too soon
    expect((await runPollSweep(new Date(Date.now() + 15_000))).polled).toBe(1); // 15s later: due again
  });

  it('the poll job survives a provider that cannot be reached, and still serves the others', async () => {
    const stuck = await pendingNumber(10 * MIN, '811');
    const fine = await pendingNumber(10 * MIN, '812');
    vi.stubGlobal('fetch', async (url: string) => {
      const u = new URL(url);
      if (u.searchParams.get('id') === '811') throw connectTimeout();
      return new Response('STATUS_OK:5555');
    });
    await runPollSweep();
    expect(await statusOf(stuck.id)).toBe('pending');
    expect(await statusOf(fine.id)).toBe('completed');
  });

  it('refunds when DaisySMS no longer knows the order (NO_ACTIVATION)', async () => {
    provider.getStatus = 'NO_ACTIVATION';
    const n = await pendingNumber(10 * MIN);
    await runPollSweep();
    const res = await request(app).get(`/api/v1/numbers/activations/${n.id}`).set('Cookie', n.cookie).expect(200);
    expect(res.body.activation.status).toBe('cancelled');
    expect(await walletOf(n)).toBe(COST);
  });

  it('a cancel that cannot reach the provider answers "try again" (not an error), keeps the number, and loses nothing', async () => {
    const n = await pendingNumber(10 * MIN, '951');
    vi.stubGlobal('fetch', async () => { throw connectTimeout(); });
    const res = await request(app).post(`/api/v1/numbers/activations/${n.id}/cancel`).set('Cookie', n.cookie).expect(200);
    expect([res.body.activation.status, res.body.refused]).toEqual(['pending', true]);
    expect(await walletOf(n)).toBe(0);
    // ...and once the provider is reachable again, the same button works and refunds once
    vi.unstubAllGlobals();
    vi.stubGlobal('fetch', async () => new Response('ACCESS_CANCEL'));
    const again = await request(app).post(`/api/v1/numbers/activations/${n.id}/cancel`).set('Cookie', n.cookie).expect(200);
    expect([again.body.activation.status, again.body.refused]).toEqual(['cancelled', false]);
    expect(await walletOf(n)).toBe(COST);
  });

  it('a cancel while the provider says slow down answers "try again" too', async () => {
    provider.setStatus = 'RATE_LIMIT_EXCEEDED';
    const n = await pendingNumber(10 * MIN, '952');
    const res = await request(app).post(`/api/v1/numbers/activations/${n.id}/cancel`).set('Cookie', n.cookie).expect(200);
    expect(res.body.refused).toBe(true);
    expect(await statusOf(n.id)).toBe('pending');
  });

  it('mark as done tells DaisySMS status 6 once the code has arrived, and not before', async () => {
    const waiting = await pendingNumber(10 * MIN, '700');
    await request(app).post(`/api/v1/numbers/activations/${waiting.id}/done`).set('Cookie', waiting.cookie).expect(200);
    expect(daisyUrls.some((u) => u.searchParams.get('status') === '6')).toBe(false);

    const got = await pendingNumber(10 * MIN, '701');
    await Activation.updateOne({ _id: got.id }, { status: 'completed', code: '123456' });
    await request(app).post(`/api/v1/numbers/activations/${got.id}/done`).set('Cookie', got.cookie).expect(200);
    const done = daisyUrls.find((u) => u.searchParams.get('status') === '6')!;
    expect([done.searchParams.get('action'), done.searchParams.get('id')]).toEqual(['setStatus', '701']);
  });

  it("mark as done never fails the user, and won't touch someone else's number", async () => {
    const mine = await pendingNumber(10 * MIN, '702');
    await Activation.updateOne({ _id: mine.id }, { status: 'completed', code: '1' });
    vi.stubGlobal('fetch', async () => { throw connectTimeout(); });
    await request(app).post(`/api/v1/numbers/activations/${mine.id}/done`).set('Cookie', mine.cookie).expect(200);
    const other = await loggedInUser(0);
    await request(app).post(`/api/v1/numbers/activations/${mine.id}/done`).set('Cookie', other.cookie).expect(404);
  });
});

describe('providerFetch', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('retries once when the connection was never made, even for a POST', async () => {
    let calls = 0;
    vi.stubGlobal('fetch', async () => {
      if (++calls === 1) throw connectTimeout();
      return new Response('ok');
    });
    const res = await providerFetch('https://x.test/buy', { method: 'POST' });
    expect([calls, await res.text()]).toEqual([2, 'ok']);
  });

  it('does NOT repeat a POST that may already have been processed', async () => {
    let calls = 0;
    vi.stubGlobal('fetch', async () => {
      calls++;
      throw Object.assign(new Error('timed out'), { name: 'TimeoutError' });
    });
    await expect(providerFetch('https://x.test/buy', { method: 'POST' })).rejects.toMatchObject({ status: 502, code: 'provider_unreachable' });
    expect(calls).toBe(1);
  });

  it('retries a GET that timed out, then gives a clean 502', async () => {
    let calls = 0;
    vi.stubGlobal('fetch', async () => {
      calls++;
      throw Object.assign(new Error('timed out'), { name: 'TimeoutError' });
    });
    await expect(providerFetch('https://x.test/status')).rejects.toMatchObject({ status: 502, code: 'provider_unreachable' });
    expect(calls).toBe(2);
  });
});

describe('poll job protections: back-off and per-provider cap', () => {
  const MIN = 60_000;
  async function waitingNumber(server: 'daisysms' | 'smsbower' | 'juicysms', providerOrderId: string) {
    const u = await loggedInUser(0);
    const a = await Activation.create({
      userId: u.user._id, server, providerOrderId, number: '+12025550123', service: 'amazon',
      country: 'United States', costKobo: COST, expiresAt: new Date(Date.now() + 10 * MIN),
    });
    return String(a._id);
  }
  const statusCalls = () => daisyUrls.filter((u) => u.searchParams.get('action') === 'getStatus').length;

  it('pauses a server that says RATE_LIMIT_EXCEEDED, resumes after the pause, and never refunds because of it', async () => {
    provider.getStatus = 'RATE_LIMIT_EXCEEDED';
    const id = await waitingNumber('daisysms', '901');
    await waitingNumber('daisysms', '902');
    const t0 = new Date();
    await runPollSweep(t0);
    expect(statusCalls()).toBe(1); // the first answer was "slow down": the second number was not even tried

    await runPollSweep(new Date(t0.getTime() + 20_000));
    expect(statusCalls()).toBe(1); // still inside the 60s pause: no new calls at all

    provider.getStatus = 'STATUS_OK:314159';
    await runPollSweep(new Date(t0.getTime() + 61_000)); // pause over
    expect(statusCalls()).toBeGreaterThan(1);
    const a = (await Activation.findById(id))!;
    expect(['pending', 'completed']).toContain(a.status); // never "cancelled" just because we were rate limited
  });

  it('pauses only the server that is rate limiting; others keep being polled', async () => {
    provider.getStatus = 'RATE_LIMIT_EXCEEDED'; // DaisySMS is limiting us...
    await waitingNumber('daisysms', '911');
    process.env.SMSBOWER_API_KEY = 'bk';
    const bowerId = await waitingNumber('smsbower', '912');
    vi.stubGlobal('fetch', async (url: string) => {
      const u = new URL(url);
      if (u.hostname.includes('smsbower')) return new Response('STATUS_WAIT_CODE');
      daisyUrls.push(u);
      return new Response('RATE_LIMIT_EXCEEDED');
    });
    await runPollSweep();
    expect(await Activation.findById(bowerId).then((a) => a!.lastPolledAt)).toBeTruthy(); // ...SMSBower was still polled
  });

  it('honours how long a server says to wait (Retry-After on its 429)', async () => {
    process.env.JUICYSMS_API_KEY = 'jk';
    await waitingNumber('juicysms', '8101');
    await waitingNumber('juicysms', '8102');
    let calls = 0;
    vi.stubGlobal('fetch', async () => {
      calls++;
      return new Response('{}', { status: 429, headers: { 'retry-after': '120' } });
    });
    const t0 = new Date();
    await runPollSweep(t0);
    expect(calls).toBe(1);
    await runPollSweep(new Date(t0.getTime() + 100_000));
    expect(calls).toBe(1); // 100s later: still inside their 120s
    await runPollSweep(new Date(t0.getTime() + 121_000));
    expect(calls).toBeGreaterThan(1);
  });

  it('polls at most 20 numbers of one server per run, and the rest are first in line next run', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 25; i++) ids.push(await waitingNumber('daisysms', `${1000 + i}`));
    const t0 = new Date();
    expect((await runPollSweep(t0)).polled).toBe(20);
    const second = await runPollSweep(new Date(t0.getTime() + 13_000));
    expect(second.polled).toBe(20);
    const never = await Activation.countDocuments({ _id: { $in: ids }, lastPolledAt: { $exists: false } });
    expect(never).toBe(0); // every one of the 25 got its turn by the second run
  });

  it("a user's cancel that the provider refuses while it is busy leaves the number waiting instead of failing", async () => {
    provider.setStatus = 'ACCESS_READY'; // can't cancel...
    provider.getStatus = 'RATE_LIMIT_EXCEEDED'; // ...and the re-check is rate limited
    const u = await loggedInUser(0);
    const a = await Activation.create({
      userId: u.user._id, server: 'daisysms', providerOrderId: '931', number: '+12025550123', service: 'amazon',
      country: 'United States', costKobo: COST, expiresAt: new Date(Date.now() + 10 * MIN),
    });
    const res = await request(app).post(`/api/v1/numbers/activations/${a._id}/cancel`).set('Cookie', u.cookie).expect(200);
    expect(res.body.activation.status).toBe('pending');
  });
});

// A fake HeroSMS: the offers (price tiers) endpoint and the handler_api protocol, answered by URL.
describe('numbers: HeroSMS (price tiers, countries, early-cancel)', () => {
  const OFFERS = { data: { wa: { '16': { map: { '0.0500': 100, '0.1000': 250 } } } } };
  let hero: Record<string, string | { status: number; body: string }>;
  let seen: { url: URL; init?: RequestInit }[];

  beforeEach(() => {
    process.env.HEROSMS_API_KEY = 'hk';
    seen = [];
    hero = {
      offers: JSON.stringify(OFFERS),
      getNumber: 'ACCESS_NUMBER:777:447700900123',
      getStatus: 'STATUS_WAIT_CODE',
      cancelActivation: { status: 204, body: '' },
      finishActivation: 'ACCESS_ACTIVATION',
      getCountries: JSON.stringify({ '16': { id: 16, eng: 'United Kingdom' }, '187': { id: 187, eng: 'USA' } }),
      getServicesList: JSON.stringify({ status: 'success', services: [{ code: 'wa', name: 'WhatsApp' }] }),
    };
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      const u = new URL(url);
      seen.push({ url: u, init });
      const key = u.pathname.includes('/activations/offers') ? 'offers' : u.searchParams.get('action')!;
      const hit = hero[key];
      if (hit === undefined) return new Response('BAD_ACTION');
      return typeof hit === 'string' ? new Response(hit) : new Response(hit.body || null, { status: hit.status }); // a 204 has no body
    });
  });

  // $0.05 x 1500 = N75 +30% = N97.5 -> N98 ; $0.10 x 1500 = N150 +30% = N195
  const T1 = { id: '0.0500', costKobo: 9_800 };
  const T2 = { id: '0.1000', costKobo: 19_500 };
  const buyUk = async (balance: number, tier: string | null = T2.id) => {
    const u = await loggedInUser(balance);
    const res = await request(app).post('/api/v1/numbers/servers/herosms/buy').set('Cookie', u.cookie).send({ service: 'wa', country: '16', ...(tier ? { tier } : {}) });
    return { ...u, res };
  };
  const calls = (action: string) => seen.filter((x) => x.url.searchParams.get('action') === action);

  it('quotes every price tier in naira, cheapest first, asking HeroSMS for that service in that country', async () => {
    const { cookie } = await loggedInUser(0);
    const res = await request(app).get('/api/v1/numbers/servers/herosms/price?service=wa&country=16').set('Cookie', cookie).expect(200);
    expect(res.body).toEqual({
      costKobo: T1.costKobo,
      stock: 250,
      tiers: [{ ...T1, stock: 100 }, { ...T2, stock: 250 }],
    });
    const offers = seen.find((x) => x.url.pathname.includes('/activations/offers'))!;
    expect([offers.url.searchParams.get('services'), offers.url.searchParams.get('countries')]).toEqual(['wa', '16']);
    expect((offers.init?.headers as Record<string, string>).Authorization).toBe('ApiKey hk');
  });

  it('needs a country, and says so when HeroSMS has no numbers there', async () => {
    const { cookie } = await loggedInUser(0);
    await request(app).get('/api/v1/numbers/servers/herosms/price?service=wa').set('Cookie', cookie).expect(400);
    hero.offers = JSON.stringify({ data: {} });
    const res = await request(app).get('/api/v1/numbers/servers/herosms/price?service=wa&country=16').set('Cookie', cookie);
    expect(res.status).toBe(404);
  });

  it('buys the tier the user picked: charges that price, asks HeroSMS for exactly it, stores readable names', async () => {
    const { user, res } = await buyUk(T2.costKobo + 500);
    expect(res.status).toBe(201);
    const q = calls('getNumber')[0]!.url.searchParams;
    expect([q.get('service'), q.get('country'), q.get('fixedPrice'), q.get('freePrice')]).toEqual(['wa', '16', '0.1', 'true']);
    expect(res.body.activation).toMatchObject({ number: '+447700900123', service: 'WhatsApp', country: 'United Kingdom', costKobo: T2.costKobo, server: 'herosms' });
    expect((await User.findById(user._id))!.balanceKobo).toBe(500);
  });

  it('refuses to buy without a price, or with one that no longer exists, and charges nothing', async () => {
    const none = await buyUk(T2.costKobo, null);
    expect([none.res.status, none.res.body.error.code]).toEqual([400, 'choose_price']);
    const gone = await buyUk(T2.costKobo, '9.9999');
    expect([gone.res.status, gone.res.body.error.code]).toEqual([409, 'price_changed']);
    expect(calls('getNumber').length).toBe(0);
    expect((await User.findById(none.user._id))!.balanceKobo).toBe(T2.costKobo);
    expect((await User.findById(gone.user._id))!.balanceKobo).toBe(T2.costKobo);
  });

  it('refunds with a fitting message when HeroSMS has no number, our balance is empty, or the price moved', async () => {
    for (const [answer, status, code] of [['NO_NUMBERS', 409, 'no_numbers'], ['NO_BALANCE', 503, 'server_unavailable'], ['WRONG_MAX_PRICE:0.12', 409, 'price_changed']] as const) {
      hero.getNumber = answer;
      const { user, res } = await buyUk(T2.costKobo);
      expect([res.status, res.body.error.code]).toEqual([status, code]);
      expect((await User.findById(user._id))!.balanceKobo).toBe(T2.costKobo);
    }
  });

  it('releases a number it could not record, instead of leaving it open at the provider', async () => {
    const spy = vi.spyOn(Activation, 'create').mockRejectedValueOnce(new Error('db down'));
    const { user, res } = await buyUk(T2.costKobo);
    spy.mockRestore();
    expect(res.status).toBe(500);
    expect(calls('cancelActivation')[0]!.url.searchParams.get('id')).toBe('777');
    expect((await User.findById(user._id))!.balanceKobo).toBe(T2.costKobo);
  });

  it('the poll job brings the code in; a provider-side cancel is refunded', async () => {
    const got = await buyUk(T2.costKobo);
    hero.getStatus = 'STATUS_OK:246810';
    await runPollSweep();
    const a = await request(app).get(`/api/v1/numbers/activations/${got.res.body.activation.id}`).set('Cookie', got.cookie).expect(200);
    expect(a.body.activation).toMatchObject({ status: 'completed', code: '246810' });

    const gone = await buyUk(T2.costKobo);
    hero.getStatus = 'STATUS_CANCEL';
    await runPollSweep(new Date(Date.now() + 20_000));
    expect((await User.findById(gone.user._id))!.balanceKobo).toBe(T2.costKobo);
  });

  it('cancel in the first two minutes is refused (409 EARLY_CANCEL_DENIED): still waiting, not refunded, and works later', async () => {
    const { user, cookie, res } = await buyUk(T2.costKobo);
    const id = res.body.activation.id;
    hero.cancelActivation = { status: 409, body: '{"title":"EARLY_CANCEL_DENIED"}' };
    const early = await request(app).post(`/api/v1/numbers/activations/${id}/cancel`).set('Cookie', cookie).expect(200);
    expect([early.body.activation.status, early.body.refused]).toEqual(['pending', true]);
    expect((await User.findById(user._id))!.balanceKobo).toBe(0);

    hero.cancelActivation = { status: 204, body: '' };
    const later = await request(app).post(`/api/v1/numbers/activations/${id}/cancel`).set('Cookie', cookie).expect(200);
    expect([later.body.activation.status, later.body.refused]).toEqual(['cancelled', false]);
    expect((await User.findById(user._id))!.balanceKobo).toBe(T2.costKobo);
  });

  it('mark as done sends finishActivation (POST) once the code has arrived', async () => {
    const { cookie, res } = await buyUk(T2.costKobo);
    await Activation.updateOne({ _id: res.body.activation.id }, { status: 'completed', code: '1' });
    await request(app).post(`/api/v1/numbers/activations/${res.body.activation.id}/done`).set('Cookie', cookie).expect(200);
    const fin = seen.find((x) => x.url.searchParams.get('action') === 'finishActivation')!;
    expect([fin.url.searchParams.get('id'), fin.init?.method]).toEqual(['777', 'POST']);
  });
});

// A fake SMSBower: the handler_api protocol, answered by `action`.
describe('numbers: SMSBower (provider price tiers, instant cancel)', () => {
  // two providers sell WhatsApp in country 16 (UK): one at $0.20 (stock 40), one at $0.10 (stock 15); a third has no stock
  const V3 = { '16': { wa: { '3140': { price: 0.2, count: 40, provider_id: 3140 }, '14': { price: 0.1, count: 15, provider_id: 14 }, '9': { price: 0.05, count: 0, provider_id: 9 } } } };
  let bower: Record<string, string>;
  let seen: URL[];

  beforeEach(() => {
    process.env.SMSBOWER_API_KEY = 'bk';
    delete process.env.SMSBOWER_BASE_URL;
    seen = [];
    bower = {
      getPricesV3: JSON.stringify(V3),
      getNumber: 'ACCESS_NUMBER:888:447700900456',
      getStatus: 'STATUS_WAIT_CODE',
      setStatus: 'ACCESS_CANCEL',
      getCountries: JSON.stringify([{ id: 16, eng: 'United Kingdom' }]),
      getServicesList: JSON.stringify({ status: 'success', services: [{ code: 'wa', name: 'WhatsApp' }] }),
    };
    vi.stubGlobal('fetch', async (url: string) => {
      const u = new URL(url);
      seen.push(u);
      return new Response(bower[u.searchParams.get('action')!] ?? 'BAD_ACTION');
    });
  });

  // $0.10 -> N195 ; $0.20 x 1500 = N300 +30% = N390
  const CHEAP = { id: '14', costKobo: 19_500 };
  const DEAR = { id: '3140', costKobo: 39_000 };
  const buyUk = async (balance: number, tier: string | null = CHEAP.id) => {
    const u = await loggedInUser(balance);
    const res = await request(app).post('/api/v1/numbers/servers/smsbower/buy').set('Cookie', u.cookie).send({ service: 'wa', country: '16', ...(tier ? { tier } : {}) });
    return { ...u, res };
  };
  const calls = (action: string) => seen.filter((u) => u.searchParams.get('action') === action);

  it('quotes each provider as a price tier in naira, cheapest first, leaving out ones with no stock', async () => {
    const { cookie } = await loggedInUser(0);
    const res = await request(app).get('/api/v1/numbers/servers/smsbower/price?service=wa&country=16').set('Cookie', cookie).expect(200);
    expect(res.body).toEqual({
      costKobo: CHEAP.costKobo,
      stock: 55,
      tiers: [{ ...CHEAP, stock: 15 }, { ...DEAR, stock: 40 }],
    });
    const q = calls('getPricesV3')[0]!.searchParams;
    expect([q.get('service'), q.get('country'), q.get('api_key')]).toEqual(['wa', '16', 'bk']);
  });

  it('needs a country, and says so when nothing is on sale or the server answers with plain text', async () => {
    const { cookie } = await loggedInUser(0);
    await request(app).get('/api/v1/numbers/servers/smsbower/price?service=wa').set('Cookie', cookie).expect(400);
    bower.getPricesV3 = 'BAD_SERVICE';
    await request(app).get('/api/v1/numbers/servers/smsbower/price?service=wa&country=16').set('Cookie', cookie).expect(404);
    bower.getPricesV3 = JSON.stringify({ '16': { wa: {} } });
    await request(app).get('/api/v1/numbers/servers/smsbower/price?service=wa&country=16').set('Cookie', cookie).expect(404);
  });

  it('buys the picked tier: charges that price, asks for exactly it (min = max), stores readable names', async () => {
    const { user, res } = await buyUk(DEAR.costKobo + 500, DEAR.id);
    expect(res.status).toBe(201);
    const q = calls('getNumber')[0]!.searchParams;
    expect([q.get('service'), q.get('country'), q.get('maxPrice'), q.get('minPrice')]).toEqual(['wa', '16', '0.2', '0.2']);
    expect(res.body.activation).toMatchObject({ number: '+447700900456', service: 'WhatsApp', country: 'United Kingdom', costKobo: DEAR.costKobo, server: 'smsbower' });
    expect((await User.findById(user._id))!.balanceKobo).toBe(500);
  });

  it('refuses to buy without a price, or one that no longer exists, and charges nothing', async () => {
    const none = await buyUk(CHEAP.costKobo, null);
    expect([none.res.status, none.res.body.error.code]).toEqual([400, 'choose_price']);
    const gone = await buyUk(CHEAP.costKobo, '999');
    expect([gone.res.status, gone.res.body.error.code]).toEqual([409, 'price_changed']);
    expect(calls('getNumber').length).toBe(0);
  });

  it('refunds with a fitting message when there is no number, our balance is empty, or the price moved', async () => {
    for (const [answer, status, code] of [['NO_NUMBERS', 409, 'no_numbers'], ['NO_BALANCE', 503, 'server_unavailable'], ['WRONG_MAX_PRICE', 409, 'price_changed']] as const) {
      bower.getNumber = answer;
      const { user, res } = await buyUk(CHEAP.costKobo);
      expect([res.status, res.body.error.code]).toEqual([status, code]);
      expect((await User.findById(user._id))!.balanceKobo).toBe(CHEAP.costKobo);
    }
  });

  it('the poll job brings the code in; a provider-side cancel is refunded', async () => {
    const got = await buyUk(CHEAP.costKobo);
    bower.getStatus = 'STATUS_OK:135790';
    await runPollSweep();
    const a = await request(app).get(`/api/v1/numbers/activations/${got.res.body.activation.id}`).set('Cookie', got.cookie).expect(200);
    expect(a.body.activation).toMatchObject({ status: 'completed', code: '135790' });

    const gone = await buyUk(CHEAP.costKobo);
    bower.getStatus = 'STATUS_CANCEL';
    await runPollSweep(new Date(Date.now() + 20_000));
    expect((await User.findById(gone.user._id))!.balanceKobo).toBe(CHEAP.costKobo);
  });

  it('cancels at once with setStatus 8 and refunds once', async () => {
    const { user, cookie, res } = await buyUk(CHEAP.costKobo);
    const id = res.body.activation.id;
    const first = await request(app).post(`/api/v1/numbers/activations/${id}/cancel`).set('Cookie', cookie).expect(200);
    await request(app).post(`/api/v1/numbers/activations/${id}/cancel`).set('Cookie', cookie).expect(200);
    expect([first.body.activation.status, first.body.refused]).toEqual(['cancelled', false]);
    expect((await User.findById(user._id))!.balanceKobo).toBe(CHEAP.costKobo);
    const c = calls('setStatus')[0]!.searchParams;
    expect([c.get('status'), c.get('id')]).toEqual(['8', '888']);
  });

  it('mark as done sends setStatus 6 once the code has arrived', async () => {
    const { cookie, res } = await buyUk(CHEAP.costKobo);
    await Activation.updateOne({ _id: res.body.activation.id }, { status: 'completed', code: '1' });
    await request(app).post(`/api/v1/numbers/activations/${res.body.activation.id}/done`).set('Cookie', cookie).expect(200);
    const six = calls('setStatus').find((u) => u.searchParams.get('status') === '6')!;
    expect(six.searchParams.get('id')).toBe('888');
  });

  it('uses SMSBOWER_BASE_URL when it is set', async () => {
    process.env.SMSBOWER_BASE_URL = 'https://bower.example.test/stubs/handler_api.php';
    const { cookie } = await loggedInUser(0);
    await request(app).get('/api/v1/numbers/servers/smsbower/price?service=wa&country=16').set('Cookie', cookie).expect(200);
    expect(seen[0]!.hostname).toBe('bower.example.test');
  });
});

// A fake SMSPool: form-encoded POSTs answered by path.
describe('numbers: SMSPool (cheapest / best-success options)', () => {
  let pool: Record<string, { status?: number; body: unknown }>;
  let seen: { path: string; form: URLSearchParams }[];

  const ROWS = [
    { country_id: 2, name: 'United Kingdom', price: '0.31', low_price: '0.30', success_rate: 100, stock: 761 },
    { country_id: 1, name: 'United States', price: '0.14', low_price: '0.14', success_rate: 100, stock: 16841 },
    { country_id: 9, name: 'Nowhere', price: '0.50', low_price: '0.40', success_rate: 80, stock: 0 },
  ];

  beforeEach(() => {
    process.env.SMSPOOL_API_KEY = 'pk';
    seen = [];
    pool = {
      '/request/success_rate': { body: ROWS },
      '/purchase/sms': { body: { success: 1, order_id: 'ORD1', number: 447700900789, cc: '44', phonenumber: '7700900789' } },
      '/sms/check': { body: { status: 1 } },
      '/sms/cancel': { body: { success: 1, message: 'The order has been cancelled, and you have been refunded 0.03 dollars.' } },
      '/country/retrieve_all': { body: [{ ID: 2, name: 'United Kingdom' }, { ID: 1, name: 'United States' }] },
      '/service/retrieve_all': { body: [{ ID: 1, name: 'Betfair' }] },
    };
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      const path = new URL(url).pathname;
      seen.push({ path, form: new URLSearchParams(String(init?.body ?? '')) });
      const hit = pool[path];
      return hit ? new Response(JSON.stringify(hit.body), { status: hit.status ?? 200 }) : new Response('{}', { status: 404 });
    });
  });

  // $0.30 -> N585 ; $0.31 x 1500 = N465 +30% = N604.5 -> N605 ; $0.14 -> N273
  const LOW = { id: '0', costKobo: 58_500 };
  const HIGH = { id: '1', costKobo: 60_500 };
  const buyUk = async (balance: number, tier: string | null = LOW.id) => {
    const u = await loggedInUser(balance);
    const res = await request(app).post('/api/v1/numbers/servers/smspool/buy').set('Cookie', u.cookie).send({ service: '1', country: '2', ...(tier ? { tier } : {}) });
    return { ...u, res };
  };
  const calls = (path: string) => seen.filter((x) => x.path === path);

  it('offers the cheapest and the best-success price when they differ, with the stock', async () => {
    const { cookie } = await loggedInUser(0);
    const res = await request(app).get('/api/v1/numbers/servers/smspool/price?service=1&country=2').set('Cookie', cookie).expect(200);
    expect(res.body).toEqual({
      costKobo: LOW.costKobo,
      stock: 761,
      tiers: [{ ...LOW, stock: 761, note: 'Cheapest option' }, { ...HIGH, stock: 761, note: 'Higher success rate' }],
    });
    expect(calls('/request/success_rate')[0]!.form.get('service')).toBe('1');
  });

  it('offers a single price when the two options cost the same', async () => {
    const { cookie } = await loggedInUser(0);
    const res = await request(app).get('/api/v1/numbers/servers/smspool/price?service=1&country=1').set('Cookie', cookie).expect(200);
    expect(res.body.tiers).toEqual([{ id: '1', costKobo: 27_300, stock: 16841 }]);
  });

  it('asks SMSPool once per service however many countries are looked at', async () => {
    const { cookie } = await loggedInUser(0);
    await request(app).get('/api/v1/numbers/servers/smspool/price?service=1&country=2').set('Cookie', cookie).expect(200);
    await request(app).get('/api/v1/numbers/servers/smspool/price?service=1&country=1').set('Cookie', cookie).expect(200);
    expect(calls('/request/success_rate').length).toBe(1);
  });

  it('needs a country, and says so for a country with no stock or no row', async () => {
    const { cookie } = await loggedInUser(0);
    await request(app).get('/api/v1/numbers/servers/smspool/price?service=1').set('Cookie', cookie).expect(400);
    await request(app).get('/api/v1/numbers/servers/smspool/price?service=1&country=9').set('Cookie', cookie).expect(404);
    await request(app).get('/api/v1/numbers/servers/smspool/price?service=1&country=77').set('Cookie', cookie).expect(404);
  });

  it('buys with the picked option, stores the full number and readable names', async () => {
    const { user, res } = await buyUk(HIGH.costKobo + 500, HIGH.id);
    expect(res.status).toBe(201);
    const f = calls('/purchase/sms')[0]!.form;
    expect([f.get('country'), f.get('service'), f.get('pricing_option'), f.get('key')]).toEqual(['2', '1', '1', 'pk']);
    expect(res.body.activation).toMatchObject({ number: '+447700900789', service: 'Betfair', country: 'United Kingdom', costKobo: HIGH.costKobo, server: 'smspool' });
    expect((await User.findById(user._id))!.balanceKobo).toBe(500);
  });

  it('refuses to buy without picking an option, or with one that is not offered, and charges nothing', async () => {
    const none = await buyUk(LOW.costKobo, null);
    expect([none.res.status, none.res.body.error.code]).toEqual([400, 'choose_price']);
    const gone = await buyUk(LOW.costKobo, '7');
    expect([gone.res.status, gone.res.body.error.code]).toEqual([409, 'price_changed']);
    expect(calls('/purchase/sms').length).toBe(0);
  });

  it('refunds with a fitting message when SMSPool has no number or our balance is empty', async () => {
    pool['/purchase/sms'] = { body: { success: 0, message: "<p>We couldn't find an available phone number for you, please try again later!</p>" } };
    const none = await buyUk(LOW.costKobo);
    expect([none.res.status, none.res.body.error.code]).toEqual([409, 'no_numbers']);
    pool['/purchase/sms'] = { body: { success: 0, message: 'You do not have enough balance to complete this order.' } };
    const broke = await buyUk(LOW.costKobo);
    expect([broke.res.status, broke.res.body.error.code]).toEqual([503, 'server_unavailable']);
    expect((await User.findById(none.user._id))!.balanceKobo).toBe(LOW.costKobo);
    expect((await User.findById(broke.user._id))!.balanceKobo).toBe(LOW.costKobo);
  });

  it('the poll job brings the code in (status 3); a refunded or cancelled order is refunded to the user', async () => {
    const got = await buyUk(LOW.costKobo);
    pool['/sms/check'] = { body: { status: 3, sms: '554433' } };
    await runPollSweep();
    const a = await request(app).get(`/api/v1/numbers/activations/${got.res.body.activation.id}`).set('Cookie', got.cookie).expect(200);
    expect(a.body.activation).toMatchObject({ status: 'completed', code: '554433' });

    const gone = await buyUk(LOW.costKobo);
    pool['/sms/check'] = { body: { status: 6 } };
    await runPollSweep(new Date(Date.now() + 20_000));
    expect((await User.findById(gone.user._id))!.balanceKobo).toBe(LOW.costKobo);
  });

  it('an expired order (status 2) is not refunded by us until SMSPool agrees to cancel it', async () => {
    const { user, res } = await buyUk(LOW.costKobo);
    pool['/sms/check'] = { body: { status: 2 } };
    pool['/sms/cancel'] = { body: { success: 0, message: 'Your order cannot be cancelled yet, please try again later.' } };
    await Activation.updateOne({ _id: res.body.activation.id }, { expiresAt: new Date(Date.now() - 5 * 60_000) });
    await runRefundSweep();
    expect((await User.findById(user._id))!.balanceKobo).toBe(0);
    pool['/sms/cancel'] = { body: { success: 1 } };
    await runRefundSweep();
    expect((await User.findById(user._id))!.balanceKobo).toBe(LOW.costKobo);
  });

  it('cancel is refused for the first few seconds ("cannot be cancelled yet"), then refunds once', async () => {
    const { user, cookie, res } = await buyUk(LOW.costKobo);
    const id = res.body.activation.id;
    pool['/sms/cancel'] = { body: { success: 0, message: 'Your order cannot be cancelled yet, please try again later.' } };
    const early = await request(app).post(`/api/v1/numbers/activations/${id}/cancel`).set('Cookie', cookie).expect(200);
    expect([early.body.activation.status, early.body.refused]).toEqual(['pending', true]);
    expect((await User.findById(user._id))!.balanceKobo).toBe(0);

    pool['/sms/cancel'] = { body: { success: 1 } };
    const later = await request(app).post(`/api/v1/numbers/activations/${id}/cancel`).set('Cookie', cookie).expect(200);
    await request(app).post(`/api/v1/numbers/activations/${id}/cancel`).set('Cookie', cookie).expect(200);
    expect([later.body.activation.status, later.body.refused]).toEqual(['cancelled', false]);
    expect((await User.findById(user._id))!.balanceKobo).toBe(LOW.costKobo);
  });

  it('mark as done checks the order (what FloZap does for SMSPool) once the code has arrived', async () => {
    const { cookie, res } = await buyUk(LOW.costKobo);
    await Activation.updateOne({ _id: res.body.activation.id }, { status: 'completed', code: '1' });
    const before = calls('/sms/check').length;
    await request(app).post(`/api/v1/numbers/activations/${res.body.activation.id}/done`).set('Cookie', cookie).expect(200);
    expect(calls('/sms/check').length).toBe(before + 1);
  });
});

// A fake JuicySMS v2: JSON, Bearer key, problem documents for errors. Prices are in EUR.
describe('numbers: JuicySMS (EUR prices, one open order at a time)', () => {
  type Hit = { status?: number; body: unknown };
  let juicy: Record<string, Hit | (() => Hit)>;
  let seen: { method: string; path: string; search: URLSearchParams; body: any }[];
  const problem = (status: number, code: string): Hit => ({ status, body: { type: `https://juicysms.com/api/errors#${code}`, title: code, status, code, detail: code, retryable: false } });

  beforeEach(() => {
    process.env.JUICYSMS_API_KEY = 'jk';
    seen = [];
    const priced = (amount: string) => ({ amount, amount_minor: Number(amount) * 100, currency: 'EUR' });
    juicy = {
      'GET /services': {
        body: {
          data: [
            { object: 'service', id: 523, name: '2dehands', slug: '2dehands', price: priced('0.50'), country: 'NL' },
            { object: 'service', id: 12, name: 'WhatsApp', slug: 'whatsapp', price: priced('1.20'), country: 'NL' },
            { object: 'service', id: 99, name: 'Nope', slug: 'nope', price: null, country: 'NL' },
          ],
        },
      },
      'POST /orders': { status: 201, body: { object: 'order', id: 8100, status: 'pending', phone_number: '+31686216609', expires_at: new Date(Date.now() + 600_000).toISOString() } },
      'GET /orders/8100/messages': { body: { data: [], order_id: 8100, order_status: 'pending' } },
      'POST /orders/8100/cancel': { body: { object: 'order', id: 8100, status: 'canceled' } },
    };
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      const u = new URL(url);
      const path = u.pathname.replace('/api/v2', '');
      const method = init?.method ?? 'GET';
      seen.push({ method, path, search: u.searchParams, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      const raw = juicy[`${method} ${path}`];
      const hit = typeof raw === 'function' ? raw() : raw;
      return hit ? new Response(JSON.stringify(hit.body), { status: hit.status ?? 200 }) : new Response('{}', { status: 404 });
    });
  });

  // EUR 0.50 x 1.15 = 0.575 USD x 1500 = N862.5, plus 30% = N1,121.25 -> N1,122
  const PRICE = 112_200;
  const buyNl = async (balance = PRICE) => {
    const u = await loggedInUser(balance);
    const res = await request(app).post('/api/v1/numbers/servers/juicysms/buy').set('Cookie', u.cookie).send({ service: '523', country: 'NL' });
    return { ...u, res };
  };
  const calls = (method: string, path: string) => seen.filter((x) => x.method === method && x.path === path);

  it('quotes the euro price converted to naira, with no stock figure, and lists the country once', async () => {
    const { cookie } = await loggedInUser(0);
    for (let i = 0; i < 3; i++) {
      const res = await request(app).get('/api/v1/numbers/servers/juicysms/price?service=523&country=NL').set('Cookie', cookie).expect(200);
      expect(res.body).toEqual({ costKobo: PRICE, stock: null });
    }
    expect(calls('GET', '/services').filter((c) => c.search.get('country') === 'NL').length).toBe(1);
  });

  it('needs a country, and says so for an unknown service or one with no price in that country', async () => {
    const { cookie } = await loggedInUser(0);
    await request(app).get('/api/v1/numbers/servers/juicysms/price?service=523').set('Cookie', cookie).expect(400);
    await request(app).get('/api/v1/numbers/servers/juicysms/price?service=4040&country=NL').set('Cookie', cookie).expect(404);
    await request(app).get('/api/v1/numbers/servers/juicysms/price?service=99&country=NL').set('Cookie', cookie).expect(404);
  });

  it('buys: sends the numeric service, the country and the quoted euro price as a ceiling; stores readable names', async () => {
    const { user, res } = await buyNl(PRICE + 500);
    expect(res.status).toBe(201);
    expect(calls('POST', '/orders')[0]!.body).toEqual({ service_id: 523, country: 'NL', max_price: '0.50' });
    expect(res.body.activation).toMatchObject({ number: '+31686216609', service: '2dehands', country: 'Netherlands', costKobo: PRICE, server: 'juicysms' });
    expect((await User.findById(user._id))!.balanceKobo).toBe(500);
  });

  it('says the server is busy (and refunds) when the account already holds an open order', async () => {
    juicy['POST /orders'] = problem(409, 'concurrent_order_limit');
    const { user, res } = await buyNl();
    expect([res.status, res.body.error.code]).toEqual([429, 'server_busy']);
    expect(res.body.error.message).toMatch(/one number at a time/);
    expect((await User.findById(user._id))!.balanceKobo).toBe(PRICE);
  });

  it('refunds with a fitting message for no stock, a moved price, an empty balance', async () => {
    for (const [code, status, expected] of [['out_of_stock', 409, 'no_numbers'], ['price_above_maximum', 409, 'price_changed'], ['insufficient_balance', 503, 'server_unavailable']] as const) {
      juicy['POST /orders'] = problem(status === 503 ? 402 : status === 409 && code === 'out_of_stock' ? 409 : 422, code);
      const { user, res } = await buyNl();
      expect([res.status, res.body.error.code]).toEqual([status, expected]);
      expect((await User.findById(user._id))!.balanceKobo).toBe(PRICE);
    }
  });

  it('retries once at once when JuicySMS says service_busy, then succeeds', async () => {
    let n = 0;
    juicy['POST /orders'] = () => (n++ === 0 ? problem(503, 'service_busy') : { status: 201, body: { id: 8100, status: 'pending', phone_number: '+31686216609' } });
    const { res } = await buyNl();
    expect(res.status).toBe(201);
    expect(calls('POST', '/orders').length).toBe(2);
  });

  it('the poll job brings the code in; a cancelled or expired order is refunded at once (it is never charged)', async () => {
    const got = await buyNl();
    juicy['GET /orders/8100/messages'] = { body: { order_id: 8100, order_status: 'completed', data: [{ code: '382914', text: 'Your code: 382-914', sender: 'X' }] } };
    await runPollSweep();
    const a = await request(app).get(`/api/v1/numbers/activations/${got.res.body.activation.id}`).set('Cookie', got.cookie).expect(200);
    expect(a.body.activation).toMatchObject({ status: 'completed', code: '382914' });

    for (const state of ['expired', 'canceled']) {
      juicy['GET /orders/8100/messages'] = { body: { order_id: 8100, order_status: 'pending', data: [] } };
      const gone = await buyNl();
      juicy['GET /orders/8100/messages'] = { body: { order_id: 8100, order_status: state, data: [] } };
      await runPollSweep(new Date(Date.now() + 20_000));
      expect((await User.findById(gone.user._id))!.balanceKobo).toBe(PRICE);
    }
  });

  it('shows the message text when JuicySMS could not pick a code out of it', async () => {
    const got = await buyNl();
    juicy['GET /orders/8100/messages'] = { body: { order_id: 8100, order_status: 'completed', data: [{ code: null, text: 'Use 12345678 or 87654321', sender: 'X' }] } };
    await runPollSweep();
    const a = await request(app).get(`/api/v1/numbers/activations/${got.res.body.activation.id}`).set('Cookie', got.cookie).expect(200);
    expect(a.body.activation.status).toBe('completed');
    expect(a.body.activation.code).toBe('12345678');
  });

  it('cancels (free) and refunds once', async () => {
    const { user, cookie, res } = await buyNl();
    const id = res.body.activation.id;
    const first = await request(app).post(`/api/v1/numbers/activations/${id}/cancel`).set('Cookie', cookie).expect(200);
    await request(app).post(`/api/v1/numbers/activations/${id}/cancel`).set('Cookie', cookie).expect(200);
    expect([first.body.activation.status, first.body.refused]).toEqual(['cancelled', false]);
    expect((await User.findById(user._id))!.balanceKobo).toBe(PRICE);
  });

  it('a cancel that arrives after the code (409 order_not_open) completes the number instead of refunding it', async () => {
    const { user, cookie, res } = await buyNl();
    juicy['POST /orders/8100/cancel'] = problem(409, 'order_not_open');
    juicy['GET /orders/8100/messages'] = { body: { order_id: 8100, order_status: 'completed', data: [{ code: '246810', text: 'x', sender: 'X' }] } };
    const out = await request(app).post(`/api/v1/numbers/activations/${res.body.activation.id}/cancel`).set('Cookie', cookie).expect(200);
    expect(out.body.activation).toMatchObject({ status: 'completed', code: '246810' });
    expect((await User.findById(user._id))!.balanceKobo).toBe(0);
  });

  it('has no mark-as-done call, and asking for it is harmless', async () => {
    const { cookie, res } = await buyNl();
    await Activation.updateOne({ _id: res.body.activation.id }, { status: 'completed', code: '1' });
    await request(app).post(`/api/v1/numbers/activations/${res.body.activation.id}/done`).set('Cookie', cookie).expect(200);
  });
});

// A fake 5sim: public prices + Bearer-key user endpoints. Errors are plain text, as 5sim sends them.
describe('numbers: 5sim (operator price tiers, plain-text errors)', () => {
  type Hit = { status?: number; body: unknown };
  let sim: Record<string, Hit | (() => Hit)>;
  let seen: { path: string; search: URLSearchParams; auth: string | null }[];
  const order = (status: string, sms: { code?: string; text?: string }[] = []) => ({ id: 555, phone: '+12025550177', status, price: 0.25, sms, expires: new Date(Date.now() + 900_000).toISOString() });

  beforeEach(() => {
    process.env.FIVESIM_API_KEY = 'sim-key';
    seen = [];
    sim = {
      '/v1/guest/prices': {
        body: { usa: { amazon: { virtual28: { cost: 0.25, count: 5000, rate: 18 }, virtual51: { cost: 0.3, count: 1200, rate: 0 }, virtual63: { cost: 0.2, count: 0, rate: 5 } } } },
      },
      '/v1/user/buy/activation/usa/virtual28/amazon': { body: order('PENDING') },
      '/v1/user/check/555': { body: order('PENDING') },
      '/v1/user/cancel/555': { body: order('CANCELED') },
      '/v1/user/finish/555': { body: order('FINISHED') },
      '/v1/guest/countries': { body: { usa: { text_en: 'USA', iso: { us: 1 } } } },
      '/v1/guest/products/any/any': { body: { amazon: { Category: 'activation', Qty: 1, Price: 1 } } },
    };
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      const u = new URL(url);
      seen.push({ path: u.pathname, search: u.searchParams, auth: (init?.headers as Record<string, string> | undefined)?.Authorization ?? null });
      const raw = sim[u.pathname];
      const hit = typeof raw === 'function' ? raw() : raw;
      if (!hit) return new Response('{}', { status: 404 });
      return new Response(typeof hit.body === 'string' ? hit.body : JSON.stringify(hit.body), { status: hit.status ?? 200 });
    });
  });

  // $0.25 x 1500 = N375 +30% = N487.5 -> N488 ; $0.30 -> N585
  const CHEAP = { id: 'virtual28', costKobo: 48_800 };
  const DEAR = { id: 'virtual51', costKobo: 58_500 };
  const buyUsa = async (balance: number, tier: string | null = CHEAP.id) => {
    const u = await loggedInUser(balance);
    const res = await request(app).post('/api/v1/numbers/servers/fivesim/buy').set('Cookie', u.cookie).send({ service: 'amazon', country: 'usa', ...(tier ? { tier } : {}) });
    return { ...u, res };
  };
  const calls = (path: string) => seen.filter((x) => x.path === path);

  it('quotes each operator as a price tier, cheapest first, leaving out ones with no stock', async () => {
    const { cookie } = await loggedInUser(0);
    const res = await request(app).get('/api/v1/numbers/servers/fivesim/price?service=amazon&country=usa').set('Cookie', cookie).expect(200);
    expect(res.body).toEqual({ costKobo: CHEAP.costKobo, stock: 6200, tiers: [{ ...CHEAP, stock: 5000 }, { ...DEAR, stock: 1200 }] });
    const q = calls('/v1/guest/prices')[0]!.search;
    expect([q.get('country'), q.get('product')]).toEqual(['usa', 'amazon']);
  });

  it('asks 5sim once for the same service and country (its public prices call is rate limited)', async () => {
    const { cookie } = await loggedInUser(0);
    for (let i = 0; i < 3; i++) await request(app).get('/api/v1/numbers/servers/fivesim/price?service=amazon&country=usa').set('Cookie', cookie).expect(200);
    expect(calls('/v1/guest/prices').length).toBe(1);
  });

  it('needs a country, says so when there is no stock, and answers "busy" (not a crash) when 5sim rate limits', async () => {
    const { cookie } = await loggedInUser(0);
    await request(app).get('/api/v1/numbers/servers/fivesim/price?service=amazon').set('Cookie', cookie).expect(400);
    sim['/v1/guest/prices'] = { body: { usa: { amazon: {} } } };
    await request(app).get('/api/v1/numbers/servers/fivesim/price?service=amazon&country=usa').set('Cookie', cookie).expect(404);
    resetFivesimCache();
    sim['/v1/guest/prices'] = { status: 429, body: 'too many requests' };
    const res = await request(app).get('/api/v1/numbers/servers/fivesim/price?service=amazon&country=usa').set('Cookie', cookie);
    expect([res.status, res.body.error.code]).toEqual([429, 'server_busy']);
  });

  it('buys the picked operator with the Bearer key and the price as a ceiling; stores readable names', async () => {
    const { user, res } = await buyUsa(DEAR.costKobo, CHEAP.id);
    expect(res.status).toBe(201);
    const buy = calls('/v1/user/buy/activation/usa/virtual28/amazon')[0]!;
    expect([buy.auth, buy.search.get('maxPrice')]).toEqual(['Bearer sim-key', '0.25']);
    expect(res.body.activation).toMatchObject({ number: '+12025550177', service: 'amazon', country: 'USA', costKobo: CHEAP.costKobo, server: 'fivesim' });
    expect((await User.findById(user._id))!.balanceKobo).toBe(DEAR.costKobo - CHEAP.costKobo);
  });

  it('refuses to buy without picking an operator or with one that is not offered, and charges nothing', async () => {
    const none = await buyUsa(CHEAP.costKobo, null);
    expect([none.res.status, none.res.body.error.code]).toEqual([400, 'choose_price']);
    const gone = await buyUsa(CHEAP.costKobo, 'virtual99');
    expect([gone.res.status, gone.res.body.error.code]).toEqual([409, 'price_changed']);
  });

  it('refunds with a fitting message for no free phones, an empty balance, a low rating or a rejected key', async () => {
    const cases: [Hit, number, string][] = [
      [{ status: 400, body: 'no free phones' }, 409, 'no_numbers'],
      [{ status: 400, body: 'not enough user balance' }, 503, 'server_unavailable'],
      [{ status: 400, body: 'not enough rating' }, 503, 'server_unavailable'],
      [{ status: 401, body: '' }, 503, 'server_unavailable'],
    ];
    for (const [hit, status, code] of cases) {
      sim['/v1/user/buy/activation/usa/virtual28/amazon'] = hit;
      const { user, res } = await buyUsa(CHEAP.costKobo);
      expect([res.status, res.body.error.code]).toEqual([status, code]);
      expect((await User.findById(user._id))!.balanceKobo).toBe(CHEAP.costKobo);
    }
  });

  it('the poll job brings the code in; a cancelled or timed-out order is refunded', async () => {
    const got = await buyUsa(CHEAP.costKobo);
    sim['/v1/user/check/555'] = { body: order('RECEIVED', [{ code: '112233', text: 'Your code is 112233' }]) };
    await runPollSweep();
    const a = await request(app).get(`/api/v1/numbers/activations/${got.res.body.activation.id}`).set('Cookie', got.cookie).expect(200);
    expect(a.body.activation).toMatchObject({ status: 'completed', code: '112233' });

    for (const state of ['TIMEOUT', 'CANCELED']) {
      sim['/v1/user/check/555'] = { body: order('PENDING') };
      const gone = await buyUsa(CHEAP.costKobo);
      sim['/v1/user/check/555'] = { body: order(state) };
      await runPollSweep(new Date(Date.now() + 20_000));
      expect((await User.findById(gone.user._id))!.balanceKobo).toBe(CHEAP.costKobo);
    }
  });

  it('RECEIVED with an empty sms list means "still waiting" (5sim\'s word for an allocated number), not a code', async () => {
    const got = await buyUsa(CHEAP.costKobo);
    sim['/v1/user/check/555'] = { body: order('RECEIVED', []) };
    await runPollSweep();
    const a = await request(app).get(`/api/v1/numbers/activations/${got.res.body.activation.id}`).set('Cookie', got.cookie).expect(200);
    expect([a.body.activation.status, a.body.activation.code]).toEqual(['pending', null]);
    // and it still cancels and refunds like any waiting number
    const out = await request(app).post(`/api/v1/numbers/activations/${got.res.body.activation.id}/cancel`).set('Cookie', got.cookie).expect(200);
    expect(out.body.activation.status).toBe('cancelled');
    expect((await User.findById(got.user._id))!.balanceKobo).toBe(CHEAP.costKobo);
  });

  it('falls back to the digits in the message text when 5sim gives no code field', async () => {
    const got = await buyUsa(CHEAP.costKobo);
    sim['/v1/user/check/555'] = { body: order('RECEIVED', [{ code: '', text: 'G-654321 is your Google code' }]) };
    await runPollSweep();
    const a = await request(app).get(`/api/v1/numbers/activations/${got.res.body.activation.id}`).set('Cookie', got.cookie).expect(200);
    expect(a.body.activation.code).toBe('654321');
  });

  it('cancel too early ("you need to wait time") is refused, still waiting; later it works and refunds once', async () => {
    const { user, cookie, res } = await buyUsa(CHEAP.costKobo);
    const id = res.body.activation.id;
    sim['/v1/user/cancel/555'] = { status: 400, body: 'you need to wait time' };
    const early = await request(app).post(`/api/v1/numbers/activations/${id}/cancel`).set('Cookie', cookie).expect(200);
    expect([early.body.activation.status, early.body.refused]).toEqual(['pending', true]);
    expect((await User.findById(user._id))!.balanceKobo).toBe(0);

    sim['/v1/user/cancel/555'] = { body: order('CANCELED') };
    const later = await request(app).post(`/api/v1/numbers/activations/${id}/cancel`).set('Cookie', cookie).expect(200);
    await request(app).post(`/api/v1/numbers/activations/${id}/cancel`).set('Cookie', cookie).expect(200);
    expect([later.body.activation.status, later.body.refused]).toEqual(['cancelled', false]);
    expect((await User.findById(user._id))!.balanceKobo).toBe(CHEAP.costKobo);
  });

  it('a cancel after the code arrived ("order has sms") completes the number instead of refunding it', async () => {
    const { user, cookie, res } = await buyUsa(CHEAP.costKobo);
    sim['/v1/user/cancel/555'] = { status: 400, body: 'order has sms' };
    sim['/v1/user/check/555'] = { body: order('RECEIVED', [{ code: '778899', text: 'x' }]) };
    const out = await request(app).post(`/api/v1/numbers/activations/${res.body.activation.id}/cancel`).set('Cookie', cookie).expect(200);
    expect(out.body.activation).toMatchObject({ status: 'completed', code: '778899' });
    expect((await User.findById(user._id))!.balanceKobo).toBe(0);
  });

  it('mark as done sends finish once the code has arrived', async () => {
    const { cookie, res } = await buyUsa(CHEAP.costKobo);
    await Activation.updateOne({ _id: res.body.activation.id }, { status: 'completed', code: '1' });
    await request(app).post(`/api/v1/numbers/activations/${res.body.activation.id}/done`).set('Cookie', cookie).expect(200);
    expect(calls('/v1/user/finish/555').length).toBe(1);
  });
});

describe('numbers: a failed purchase is refunded, and a cancel is all-or-nothing', () => {
  const buyNow = (cookie: string) => request(app).post('/api/v1/numbers/servers/daisysms/buy').set('Cookie', cookie).send({ service: 'amazon' });

  it('if saving the number fails after the provider gave one, the buyer is refunded and the provider number is released', async () => {
    const { user, cookie } = await loggedInUser(COST * 2);
    const spy = vi.spyOn(Activation, 'create').mockRejectedValueOnce(new Error('disk full') as never);
    const res = await buyNow(cookie);
    spy.mockRestore();
    expect(res.status).toBe(500);
    expect((await User.findById(user._id))!.balanceKobo).toBe(COST * 2);
    expect(daisyUrls.some((u) => u.searchParams.get('action') === 'setStatus')).toBe(true); // the number was given back to the provider
  });

  it('a cancel marks the number cancelled and returns the money as ONE step: if the refund fails, nothing changes and a retry works', async () => {
    const { user, cookie } = await loggedInUser(COST);
    const bought = await buyNow(cookie).expect(201);
    const spy = vi.spyOn(User, 'updateOne').mockImplementationOnce((() => { throw new Error('boom'); }) as never);
    const failed = await request(app).post(`/api/v1/numbers/activations/${bought.body.activation.id}/cancel`).set('Cookie', cookie);
    spy.mockRestore();
    expect(failed.status).toBe(500);
    expect((await Activation.findById(bought.body.activation.id))!.status).toBe('pending'); // not half-cancelled
    expect((await User.findById(user._id))!.balanceKobo).toBe(0);
    await request(app).post(`/api/v1/numbers/activations/${bought.body.activation.id}/cancel`).set('Cookie', cookie).expect(200);
    expect((await User.findById(user._id))!.balanceKobo).toBe(COST); // refunded once
  });
});
