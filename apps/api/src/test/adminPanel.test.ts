import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/mailer.js', () => ({ sendCodeEmail: async () => {} }));

import { buildApp } from '../app.js';
import { ACCESS_COOKIE, signAccessToken } from '../lib/tokens.js';
import { Activation } from '../models/Activation.js';
import { AdminAction } from '../models/AdminAction.js';
import { BoostOrder } from '../models/BoostOrder.js';
import { RefreshToken } from '../models/RefreshToken.js';
import { Settings } from '../models/Settings.js';
import { User } from '../models/User.js';
import { VirtualAccount } from '../models/VirtualAccount.js';
import { WalletDeposit } from '../models/WalletDeposit.js';
import { ratePer1kKobo } from '../services/boost.service.js';
import { priceKobo } from '../services/numbers.service.js';
import { resetSettingsForTests } from '../services/settings.service.js';

const app = buildApp();
afterEach(() => resetSettingsForTests());

let counter = 0;
interface Opts { role?: 'user' | 'admin'; adminRole?: string; adminPermissions?: string[]; balanceKobo?: number; status?: 'active' | 'suspended'; isVerified?: boolean }
async function person(o: Opts = {}) {
  const n = ++counter;
  const u = await User.create({
    email: `ap${n}@example.com`, username: `ap${n}`, usernameLower: `ap${n}`, phone: `+234809${String(7000000 + n)}`, passwordHash: 'x',
    isVerified: o.isVerified ?? true, role: o.role ?? 'user', balanceKobo: o.balanceKobo ?? 0, status: o.status ?? 'active',
    ...(o.adminRole ? { adminRole: o.adminRole } : {}), ...(o.adminPermissions ? { adminPermissions: o.adminPermissions } : {}),
  });
  // the token always says "admin": the server must decide from the DATABASE
  return { u, cookie: `${ACCESS_COOKIE}=${signAccessToken(String(u._id), 'admin')}` };
}
const superAdmin = () => person({ role: 'admin' });
const get = (cookie: string, path: string) => request(app).get(`/api/v1/admin${path}`).set('Cookie', cookie);
const send = (method: 'post' | 'put' | 'patch' | 'delete', cookie: string, path: string, body?: unknown) => request(app)[method](`/api/v1/admin${path}`).set('Cookie', cookie).send((body ?? {}) as object);
const balance = async (u: { _id: unknown }) => (await User.findById(u._id as string))!.balanceKobo;

const T = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000);
const raw = (m: { collection: { insertOne: (d: object) => Promise<unknown> } }, doc: object) => m.collection.insertOne(doc);

describe('admin panel: who may open what', () => {
  it('a super admin (no specific role) can open every section; /me lists them', async () => {
    const a = await superAdmin();
    const me = await get(a.cookie, '/me');
    expect(me.status).toBe(200);
    expect(me.body.admin).toMatchObject({ email: a.u.email, isSuperAdmin: true, adminRole: 'super_admin' });
    expect(me.body.admin.permissions).toHaveLength(8);
    for (const path of ['/dashboard', '/users', '/orders?kind=numbers', '/deposits', '/finance', '/pricing', '/services', '/team', '/audit']) {
      expect((await get(a.cookie, path)).status, path).toBe(200);
    }
  });

  it('a support agent gets dashboard, users and orders, and nothing about money, pricing or the team', async () => {
    const s = await person({ role: 'admin', adminRole: 'support_agent' });
    for (const path of ['/dashboard', '/users', '/orders?kind=boost']) expect((await get(s.cookie, path)).status, path).toBe(200);
    for (const path of ['/deposits', '/deposits/unmatched', '/finance', '/pricing', '/services', '/team', '/audit']) {
      const r = await get(s.cookie, path);
      expect([r.status, path]).toEqual([403, path]);
    }
    // they may look at orders, but moving money needs the wallet permission
    const other = await person({ balanceKobo: 100 });
    expect((await send('post', s.cookie, '/wallet/adjust', { user: other.u.email, direction: 'credit', amountKobo: 100, reason: 'try it' })).status).toBe(403);
    expect(await balance(other.u)).toBe(100);
  });

  it('a finance officer gets money, orders and pricing, but not users or the team', async () => {
    const f = await person({ role: 'admin', adminRole: 'finance_officer' });
    for (const path of ['/dashboard', '/deposits', '/finance', '/pricing', '/orders?kind=numbers']) expect((await get(f.cookie, path)).status, path).toBe(200);
    for (const path of ['/users', '/services', '/team', '/audit']) expect((await get(f.cookie, path)).status, path).toBe(403);
  });

  it('a custom role gets exactly the sections ticked for it', async () => {
    const c = await person({ role: 'admin', adminRole: 'custom', adminPermissions: ['reports'] });
    expect((await get(c.cookie, '/finance')).status).toBe(200);
    expect((await get(c.cookie, '/dashboard')).status).toBe(403);
    expect((await get(c.cookie, '/me')).body.admin.permissions).toEqual(['reports']);
  });

  it('changes take effect on the very next request, whatever the token says', async () => {
    const a = await person({ role: 'admin', adminRole: 'support_agent' });
    expect((await get(a.cookie, '/users')).status).toBe(200);
    await User.updateOne({ _id: a.u._id }, { adminRole: 'finance_officer' });
    expect((await get(a.cookie, '/users')).status).toBe(403);
    await User.updateOne({ _id: a.u._id }, { role: 'user' });
    expect((await get(a.cookie, '/me')).status).toBe(403);
  });
});

describe('admin panel: dashboard', () => {
  it('counts what happened, flags what needs attention, and nets refunds out of revenue', async () => {
    const a = await superAdmin();
    const buyer = await person({ balanceKobo: 70_000 });
    await raw(WalletDeposit, { reference: 'dash-1', userId: buyer.u._id, amountKobo: 500_000, status: 'credited', createdAt: T(10), updatedAt: T(10) });
    await raw(WalletDeposit, { reference: 'dash-2', amountKobo: 9_000, status: 'unmatched', createdAt: T(5), updatedAt: T(5) });
    await raw(Activation, { userId: buyer.u._id, server: 's', providerOrderId: 'p', number: '+1', service: 'WhatsApp', country: 'US', costKobo: 200_000, status: 'completed', expiresAt: T(-30), createdAt: T(20), updatedAt: T(20) });
    await raw(Activation, { userId: buyer.u._id, server: 's', providerOrderId: 'p2', number: '+2', service: 'Telegram', country: 'US', costKobo: 100_000, status: 'pending', expiresAt: T(60), createdAt: T(120), updatedAt: T(120) }); // expired an hour ago, still pending: stuck
    await raw(BoostOrder, { userId: buyer.u._id, requestId: 'b', server: 'x', serviceId: '1', serviceName: 'Followers', link: 'l', quantity: 100, costKobo: 50_000, status: 'partial', refundedKobo: 20_000, createdAt: T(30), updatedAt: T(25) });
    const d = (await get(a.cookie, '/dashboard')).body;
    expect(d.totals.users).toBe(2);
    expect(d.totals.walletFloatKobo).toBe(70_000);
    expect(d.totals.depositsMonthKobo).toBe(500_000); // the unmatched one is not money in
    expect(d.orders.numbers.month).toBe(2);
    expect(d.orders.boost.month).toBe(1);
    expect(d.needsAttention).toEqual({ unmatchedDeposits: 1, telegramReview: 0, stuckNumbers: 1 });
    expect(d.revenueTrend).toHaveLength(14);
    expect(d.userGrowth).toHaveLength(14);
    expect(d.revenueTrend.reduce((s: number, p: { value: number }) => s + p.value, 0)).toBe(200_000 + 100_000 + 50_000 - 20_000); // charged - refunded
    expect(d.recent).toHaveLength(3);

    // A support agent gets the counts, but no naira at all; a finance officer still sees the money.
    const agent = await person({ role: 'admin', adminRole: 'support_agent' });
    const seen = (await get(agent.cookie, '/dashboard')).body;
    expect(seen.totals).toMatchObject({ users: 3, walletFloatKobo: null, depositsTodayKobo: null, depositsMonthKobo: null });
    expect(seen.revenueTrend).toBeNull();
    expect(seen.recent.length).toBeGreaterThan(0);
    expect(seen.recent.every((r: { amountKobo: number | null }) => r.amountKobo === null)).toBe(true);
    expect(JSON.stringify(seen)).not.toContain('70000');
    const finance = await person({ role: 'admin', adminRole: 'finance_officer' });
    expect((await get(finance.cookie, '/dashboard')).body.totals.walletFloatKobo).toBe(70_000);
  });
});

describe('admin panel: users', () => {
  it('lists newest first with paging, search and a status filter', async () => {
    const a = await superAdmin();
    const x = await person();
    const y = await person({ status: 'suspended' });
    for (let i = 0; i < 4; i++) await person();
    const first = (await get(a.cookie, '/users?limit=3')).body;
    expect(first.items).toHaveLength(3);
    expect(first.totalPages).toBe(3); // 7 users
    expect((await get(a.cookie, '/users?limit=3&page=3')).body.items).toHaveLength(1);
    expect((await get(a.cookie, `/users?search=${y.u.username}`)).body.items.map((u: { id: string }) => u.id)).toEqual([String(y.u._id)]);
    expect((await get(a.cookie, `/users?search=${encodeURIComponent(x.u.email.toUpperCase())}`)).body.items).toHaveLength(1);
    expect((await get(a.cookie, '/users?status=suspended')).body.items.map((u: { id: string }) => u.id)).toEqual([String(y.u._id)]);
    expect((await get(a.cookie, '/users?search=.*')).body.items).toHaveLength(0); // typed text is never treated as a pattern
    expect((await get(a.cookie, '/users?limit=500')).status).toBe(400);
  });

  it('shows one user with what they have bought, spent and deposited', async () => {
    const a = await superAdmin();
    const u = await person({ balanceKobo: 12_345 });
    await raw(WalletDeposit, { reference: 'ud-1', userId: u.u._id, amountKobo: 1_000_000, status: 'credited', createdAt: T(9), updatedAt: T(9) });
    await raw(Activation, { userId: u.u._id, server: 's', providerOrderId: 'p', number: '+1', service: 'WhatsApp', country: 'US', costKobo: 200_000, status: 'cancelled', expiresAt: T(-30), createdAt: T(8), updatedAt: T(7) });
    await raw(BoostOrder, { userId: u.u._id, requestId: 'e', server: 's', serviceId: '1', serviceName: 'F', link: 'l', quantity: 10, costKobo: 50_000, status: 'completed', refundedKobo: 0, createdAt: T(6), updatedAt: T(6) });
    await VirtualAccount.create({ userId: u.u._id, status: 'active', bankName: 'Paga', accountNumber: '78002857264', accountName: 'Ada' });
    const d = (await get(a.cookie, `/users/${u.u._id}`)).body.user;
    expect(d).toMatchObject({ email: u.u.email, balanceKobo: 12_345, depositedKobo: 1_000_000, counts: { numbers: 1, boost: 1 }, account: { bankName: 'Paga', accountNumber: '78002857264' } });
    expect(d.spentKobo).toBe(200_000 + 50_000 - 200_000); // the cancelled number was refunded in full
    expect((await get(a.cookie, '/users/000000000000000000000000')).status).toBe(404);
    expect((await get(a.cookie, '/users/not-an-id')).status).toBe(404);
  });

  it('suspends with a reason: they cannot refresh a session, and it is logged; then restores them', async () => {
    const a = await superAdmin();
    const u = await person();
    await RefreshToken.create({ userId: u.u._id, tokenHash: 'h1', expiresAt: T(-60 * 24) });
    expect((await send('post', a.cookie, `/users/${u.u._id}/suspend`, { reason: '' })).status).toBe(400);
    const res = await send('post', a.cookie, `/users/${u.u._id}/suspend`, { reason: 'Chargeback abuse' });
    expect(res.status).toBe(200);
    expect(res.body.user.status).toBe('suspended');
    expect(await RefreshToken.countDocuments({ userId: u.u._id })).toBe(0); // current sessions cut
    expect((await send('post', a.cookie, `/users/${u.u._id}/suspend`, { reason: 'again' })).status).toBe(409);
    expect((await send('post', a.cookie, `/users/${u.u._id}/unsuspend`, { reason: 'Resolved with the user' })).body.user.status).toBe('active');
    expect((await send('post', a.cookie, `/users/${u.u._id}/unsuspend`, { reason: 'again' })).status).toBe(409);
    expect((await AdminAction.find({ userId: u.u._id }).sort({ createdAt: 1 })).map((x) => [x.module, x.action, x.reason])).toEqual([
      ['users', 'user_suspend', 'Chargeback abuse'],
      ['users', 'user_unsuspend', 'Resolved with the user'],
    ]);
  });

  it('refuses to suspend yourself or another admin', async () => {
    const a = await superAdmin();
    const b = await superAdmin();
    expect((await send('post', a.cookie, `/users/${a.u._id}/suspend`, { reason: 'oops' })).status).toBe(409);
    expect((await send('post', a.cookie, `/users/${b.u._id}/suspend`, { reason: 'not like this' })).status).toBe(409);
    expect((await User.findById(b.u._id))!.status).toBe('active');
  });
});

describe('admin panel: orders and deposits', () => {
  it('lists each kind with who bought it, filtered by status or by the buyer', async () => {
    const a = await superAdmin();
    const one = await person();
    const two = await person();
    await raw(Activation, { userId: one.u._id, server: 'smspool', providerOrderId: 'p', number: '+15550001', service: 'WhatsApp', country: 'United States', costKobo: 200_000, status: 'completed', expiresAt: T(-30), createdAt: T(3), updatedAt: T(3) });
    await raw(Activation, { userId: two.u._id, server: 'herosms', providerOrderId: 'p2', number: '+15550002', service: 'Telegram', country: 'Nigeria', costKobo: 150_000, status: 'cancelled', expiresAt: T(-30), createdAt: T(2), updatedAt: T(2) });
    await raw(BoostOrder, { userId: one.u._id, requestId: 'bo', server: 'peakerr', serviceId: '1', serviceName: 'Instagram Followers', link: 'l', quantity: 1500, costKobo: 90_000, status: 'completed', refundedKobo: 0, createdAt: T(1), updatedAt: T(1) });
    const all = (await get(a.cookie, '/orders?kind=numbers')).body;
    expect(all.total).toBe(2);
    expect(all.items[0]).toMatchObject({ user: two.u.email, title: 'Telegram number', detail: 'Nigeria · +15550002 · herosms', status: 'cancelled', costKobo: 150_000, refundedKobo: 150_000 }); // newest first; cancelled = fully refunded
    expect((await get(a.cookie, '/orders?kind=numbers&status=completed')).body.items).toHaveLength(1);
    expect((await get(a.cookie, `/orders?kind=numbers&search=${one.u.username}`)).body.items.map((o: { user: string }) => o.user)).toEqual([one.u.email]);
    expect((await get(a.cookie, '/orders?kind=boost')).body.items[0]).toMatchObject({ title: 'Instagram Followers', detail: '1,500 units · peakerr' });
    expect((await get(a.cookie, '/orders?kind=nope')).status).toBe(400);
  });

  it('lists every bank deposit, and only the credited or only the unmatched ones when asked', async () => {
    const a = await superAdmin();
    const u = await person();
    await raw(WalletDeposit, { reference: 'dl-1', userId: u.u._id, accountNumber: '78002857264', amountKobo: 100_000, status: 'credited', createdAt: T(5), updatedAt: T(5) });
    await raw(WalletDeposit, { reference: 'dl-2', amountKobo: 5_000, status: 'unmatched', createdAt: T(4), updatedAt: T(4) });
    const everything = (await get(a.cookie, '/deposits')).body;
    expect(everything.total).toBe(2);
    expect(everything.items[1]).toMatchObject({ reference: 'dl-1', user: u.u.email, accountNumber: '78002857264', amountKobo: 100_000, status: 'credited' });
    expect((await get(a.cookie, '/deposits?status=unmatched')).body.items).toMatchObject([{ reference: 'dl-2', user: null }]);
  });
});

describe('admin panel: finance', () => {
  it('adds up charged, refunded and kept per service for the chosen days (older activity is left out)', async () => {
    const a = await superAdmin();
    const u = await person({ balanceKobo: 40_000 });
    const person2 = await person({ balanceKobo: 60_000 });
    await raw(Activation, { userId: u.u._id, server: 's', providerOrderId: 'p', number: '+1', service: 'W', country: 'US', costKobo: 200_000, status: 'completed', expiresAt: T(-30), createdAt: T(60), updatedAt: T(60) });
    await raw(Activation, { userId: u.u._id, server: 's', providerOrderId: 'p2', number: '+2', service: 'W', country: 'US', costKobo: 100_000, status: 'cancelled', expiresAt: T(-30), createdAt: T(50), updatedAt: T(40) });
    await raw(Activation, { userId: u.u._id, server: 's', providerOrderId: 'old', number: '+3', service: 'W', country: 'US', costKobo: 999_999, status: 'completed', expiresAt: T(-30), createdAt: T(60 * 24 * 60), updatedAt: T(60 * 24 * 60) }); // 60 days ago
    await raw(BoostOrder, { userId: u.u._id, requestId: 'fb', server: 'x', serviceId: '1', serviceName: 'F', link: 'l', quantity: 10, costKobo: 50_000, status: 'partial', refundedKobo: 12_000, createdAt: T(30), updatedAt: T(20) });
    await raw(WalletDeposit, { reference: 'fin-1', userId: u.u._id, amountKobo: 700_000, status: 'credited', createdAt: T(15), updatedAt: T(15) });
    await raw(WalletDeposit, { reference: 'fin-2', amountKobo: 11_111, status: 'unmatched', createdAt: T(14), updatedAt: T(14) });
    const f = (await get(a.cookie, '/finance?days=30')).body;
    const row = (s: string) => f.rows.find((r: { service: string }) => r.service === s);
    expect(row('numbers')).toEqual({ service: 'numbers', orders: 2, chargedKobo: 300_000, refundedKobo: 100_000, netKobo: 200_000 });
    expect(row('boost')).toEqual({ service: 'boost', orders: 1, chargedKobo: 50_000, refundedKobo: 12_000, netKobo: 38_000 });
    expect(f.totals).toEqual({ chargedKobo: 350_000, refundedKobo: 112_000, netKobo: 238_000, depositedKobo: 700_000, walletFloatKobo: 100_000 });
    expect((await get(a.cookie, '/finance?days=365')).body.rows.find((r: { service: string }) => r.service === 'numbers').chargedKobo).toBe(300_000 + 999_999);
    expect((await get(a.cookie, '/finance?days=0')).status).toBe(400);
  });
});

describe('admin panel: pricing', () => {
  const body = (over: Record<string, number> = {}) => ({
    pricing: { usdNgnRate: 1500, eurUsdRate: 1.15, numberMarkupPercent: 30, boostMarkupPercent: 30, esimMarkupPercent: 30, rentalMarkupPercent: 30, telegramMarkupPercent: 30, ...over },
    reason: 'Rate moved',
  });

  it('starts from the .env values, and a saved change prices the very next order', async () => {
    const a = await superAdmin();
    expect((await get(a.cookie, '/pricing')).body.pricing).toMatchObject({ usdNgnRate: 1500, boostMarkupPercent: 30 });
    expect(ratePer1kKobo(0.4)).toBe(78_000); // 0.40 x 1500 x 1.30 = N780
    const res = await send('put', a.cookie, '/pricing', body({ usdNgnRate: 1600, boostMarkupPercent: 50 }));
    expect(res.status).toBe(200);
    expect(ratePer1kKobo(0.4)).toBe(96_000); // 0.40 x 1600 x 1.50 = N960
    expect((await get(a.cookie, '/pricing')).body.pricing).toMatchObject({ usdNgnRate: 1600, boostMarkupPercent: 50 });
    expect(await Settings.countDocuments()).toBe(1);
  });

  it('prices virtual numbers by percentage like everything else: 30% by default, and a saved change applies to the very next number', async () => {
    const a = await superAdmin();
    expect(priceKobo(0.3)).toBe(58_500); // $0.30 x 1500 = N450, +30% = N585
    expect(priceKobo(0.31)).toBe(60_500); // N604.5 rounds UP to a whole naira
    expect(priceKobo(0)).toBe(100); // never free: at least N1
    expect((await send('put', a.cookie, '/pricing', body({ numberMarkupPercent: 50 }))).status).toBe(200);
    expect(priceKobo(0.3)).toBe(67_500); // N450 +50% = N675
    expect((await get(a.cookie, '/pricing')).body.pricing).toMatchObject({ numberMarkupPercent: 50 });
    expect((await send('put', a.cookie, '/pricing', body({ numberMarkupPercent: -1 }))).status).toBe(400);
    expect((await send('put', a.cookie, '/pricing', body({ numberMarkupPercent: 5000 }))).status).toBe(400);
    expect(priceKobo(0.3)).toBe(67_500); // the refused changes did nothing
  });

  it('refuses nonsense rates and a missing reason, changing nothing', async () => {
    const a = await superAdmin();
    for (const bad of [body({ usdNgnRate: 0 }), body({ usdNgnRate: -5 }), body({ boostMarkupPercent: -1 }), body({ boostMarkupPercent: 5000 }), { ...body(), reason: '' }, { pricing: { usdNgnRate: 1500 }, reason: 'partial' }]) {
      expect((await send('put', a.cookie, '/pricing', bad)).status).toBe(400);
    }
    expect(ratePer1kKobo(0.4)).toBe(78_000);
  });

  it('records the old and new values in the audit log', async () => {
    const a = await superAdmin();
    await send('put', a.cookie, '/pricing', body({ usdNgnRate: 1700 }));
    const entry = (await get(a.cookie, '/audit?module=prices')).body.items[0];
    expect(entry).toMatchObject({ module: 'prices', action: 'pricing_update', reason: 'Rate moved' });
    expect(entry.details.before.usdNgnRate).toBe(1500);
    expect(entry.details.after.usdNgnRate).toBe(1700);
  });
});

describe('admin panel: service switches', () => {
  const services = (o: { boost?: boolean; deposits?: boolean; disabledServers?: string[] } = {}) => ({
    services: { toggles: { numbers: true, boost: o.boost ?? true, esim: true, rentals: true, telegram: true, deposits: o.deposits ?? true }, disabledServers: o.disabledServers ?? [] },
    reason: 'Provider is down',
  });

  it('switching a service off stops buying it, charges nothing, and switching it on brings it back', async () => {
    const a = await superAdmin();
    const buyer = await person({ balanceKobo: 5_000_000 });
    const order = () => request(app).post('/api/v1/boost/servers/peakerr/orders').set('Cookie', buyer.cookie).send({});
    await send('put', a.cookie, '/services', services({ boost: false }));
    const blocked = await order();
    expect(blocked.status).toBe(503);
    expect(blocked.body.error.code).toBe('service_unavailable');
    expect(await balance(buyer.u)).toBe(5_000_000);
    await send('put', a.cookie, '/services', services({ boost: true }));
    expect((await order()).body.error?.code).not.toBe('service_unavailable'); // now it gets as far as checking the order itself
  });

  it('can switch off a single server and leave the others working', async () => {
    const a = await superAdmin();
    const buyer = await person({ balanceKobo: 5_000_000 });
    await send('put', a.cookie, '/services', services({ disabledServers: ['boost:peakerr'] }));
    const order = (server: string) => request(app).post(`/api/v1/boost/servers/${server}/orders`).set('Cookie', buyer.cookie).send({});
    const off = await order('peakerr');
    expect(off.status).toBe(503);
    expect(off.body.error.message).toMatch(/server is temporarily unavailable/i);
    expect((await order('resellersmm')).status).not.toBe(503); // reaches validation instead
  });

  it('can pause new bank account numbers, and refuses nonsense server names', async () => {
    const a = await superAdmin();
    const u = await person();
    await send('put', a.cookie, '/services', services({ deposits: false }));
    const res = await request(app).post('/api/v1/wallet/account').set('Cookie', u.cookie).send({ firstName: 'Ada', lastName: 'Obi' });
    expect(res.status).toBe(503);
    expect(await VirtualAccount.countDocuments({ userId: u.u._id })).toBe(0);
    expect((await send('put', a.cookie, '/services', services({ disabledServers: ['../etc:passwd'] }))).status).toBe(400);
  });

  it('shows the switches with the servers each service has, and logs every change', async () => {
    const a = await superAdmin();
    const view = (await get(a.cookie, '/services')).body;
    expect(view.settings.toggles).toEqual({ numbers: true, boost: true, esim: true, rentals: true, telegram: true, deposits: true });
    expect(view.servers.numbers.length).toBeGreaterThan(5);
    expect(view.servers.boost.map((s: { id: string }) => s.id)).toContain('peakerr');
    await send('put', a.cookie, '/services', services({ boost: false }));
    expect((await get(a.cookie, '/audit?module=settings')).body.items[0]).toMatchObject({ action: 'services_update', reason: 'Provider is down' });
  });
});

describe('admin panel: the admin team', () => {
  it('only a super admin can see or change the team and the audit log', async () => {
    const s = await person({ role: 'admin', adminRole: 'support_agent' });
    const target = await person();
    expect((await get(s.cookie, '/team')).status).toBe(403);
    expect((await send('post', s.cookie, '/team', { user: target.u.email, adminRole: 'support_agent' })).status).toBe(403);
    expect((await get(s.cookie, '/audit')).status).toBe(403);
    expect((await User.findById(target.u._id))!.role).toBe('user');
  });

  it('adds an admin from an existing, verified, active user, with a template or custom role', async () => {
    const a = await superAdmin();
    const x = await person();
    const res = await send('post', a.cookie, '/team', { user: x.u.email.toUpperCase(), adminRole: 'support_agent' });
    expect(res.status).toBe(201);
    expect(res.body.member).toMatchObject({ email: x.u.email, adminRole: 'support_agent', isSuperAdmin: false, permissions: ['dashboard', 'users', 'orders'] });
    const y = await person();
    expect((await send('post', a.cookie, '/team', { user: y.u.username, adminRole: 'custom', permissions: ['reports', 'prices'] })).body.member.permissions).toEqual(['reports', 'prices']);
    // and the new admin can really use it
    expect((await get(x.cookie, '/users')).status).toBe(200);
    expect((await get(x.cookie, '/finance')).status).toBe(403);
  });

  it('refuses: unknown people, existing admins, unverified or suspended users, and a custom role with no sections', async () => {
    const a = await superAdmin();
    const admin2 = await superAdmin();
    const unverified = await person({ isVerified: false });
    const suspended = await person({ status: 'suspended' });
    const ok = await person();
    expect((await send('post', a.cookie, '/team', { user: 'nobody@nowhere.test', adminRole: 'support_agent' })).status).toBe(404);
    expect((await send('post', a.cookie, '/team', { user: admin2.u.email, adminRole: 'support_agent' })).status).toBe(409);
    expect((await send('post', a.cookie, '/team', { user: unverified.u.email, adminRole: 'support_agent' })).status).toBe(409);
    expect((await send('post', a.cookie, '/team', { user: suspended.u.email, adminRole: 'support_agent' })).status).toBe(409);
    expect((await send('post', a.cookie, '/team', { user: ok.u.email, adminRole: 'custom', permissions: [] })).status).toBe(400);
    expect((await send('post', a.cookie, '/team', { user: ok.u.email, adminRole: 'king' })).status).toBe(400);
    expect((await send('post', a.cookie, '/team', { user: ok.u.email, adminRole: 'custom', permissions: ['everything'] })).status).toBe(400);
    expect((await User.findById(ok.u._id))!.role).toBe('user');
  });

  it('changes and removes admins, but never yourself and never the last super admin', async () => {
    const a = await superAdmin();
    const b = await person({ role: 'admin', adminRole: 'support_agent' });
    expect((await send('patch', a.cookie, `/team/${b.u._id}`, { adminRole: 'finance_officer' })).body.member.permissions).toContain('reports');
    expect((await send('patch', a.cookie, `/team/${a.u._id}`, { adminRole: 'support_agent' })).status).toBe(409); // not yourself
    expect((await send('delete', a.cookie, `/team/${a.u._id}`)).status).toBe(409);
    const b2 = await person({ role: 'admin', adminRole: 'support_agent' });
    // a is the ONLY super admin: b (a support agent) can't act, and demoting a via another super admin is blocked
    const c = await superAdmin();
    expect((await send('patch', c.cookie, `/team/${a.u._id}`, { adminRole: 'support_agent' })).status).toBe(200); // two supers (a, c): fine
    expect((await send('patch', a.cookie, `/team/${c.u._id}`, { adminRole: 'support_agent' })).status).toBe(403); // a is no longer super
    expect((await send('delete', c.cookie, `/team/${b2.u._id}`)).status).toBe(200);
    expect((await User.findById(b2.u._id))!).toMatchObject({ role: 'user' });
    expect((await get(b2.cookie, '/me')).status).toBe(403); // access gone at once
    // c is now the last super admin
    const d = await person({ role: 'admin', adminRole: 'custom', adminPermissions: ['users'] });
    expect((await send('delete', c.cookie, `/team/${d.u._id}`)).status).toBe(200);
  });

  it('the last super admin cannot be demoted or removed by anyone', async () => {
    const only = await superAdmin();
    const helper = await person({ role: 'admin', adminRole: 'custom', adminPermissions: ['roles'] });
    expect((await send('delete', helper.cookie, `/team/${only.u._id}`)).status).toBe(403); // a custom admin is not a super admin
    // with a second super admin around, removing one is fine, removing the last is not
    const second = await superAdmin();
    expect((await send('delete', second.cookie, `/team/${only.u._id}`)).status).toBe(200);
    expect((await send('delete', second.cookie, `/team/${second.u._id}`)).status).toBe(409);
    expect((await User.findById(second.u._id))!.role).toBe('admin');
  });

  it('writes every team change to the audit log', async () => {
    const a = await superAdmin();
    const x = await person();
    await send('post', a.cookie, '/team', { user: x.u.email, adminRole: 'support_agent' });
    await send('patch', a.cookie, `/team/${x.u._id}`, { adminRole: 'finance_officer' });
    await send('delete', a.cookie, `/team/${x.u._id}`);
    const log = (await get(a.cookie, '/audit?module=roles')).body.items;
    expect(log.map((e: { action: string }) => e.action)).toEqual(['admin_revoke', 'admin_update', 'admin_add']);
    expect(log.every((e: { user: string }) => e.user === x.u.email)).toBe(true);
  });

  it('the audit log pages and filters by section', async () => {
    const a = await superAdmin();
    const u = await person();
    for (let i = 0; i < 3; i++) await send('post', a.cookie, '/wallet/adjust', { user: u.u.email, direction: 'credit', amountKobo: 100, reason: `note ${i}` });
    await send('put', a.cookie, '/pricing', { pricing: { usdNgnRate: 1500, eurUsdRate: 1.15, numberMarkupPercent: 30, boostMarkupPercent: 30, esimMarkupPercent: 30, rentalMarkupPercent: 30, telegramMarkupPercent: 30 }, reason: 'same' });
    const wallet = (await get(a.cookie, '/audit?module=wallet&limit=2')).body;
    expect(wallet.total).toBe(3);
    expect(wallet.totalPages).toBe(2);
    expect((await get(a.cookie, '/audit?module=prices')).body.total).toBe(1);
    expect((await get(a.cookie, '/audit')).body.total).toBe(4);
    expect((await get(a.cookie, '/audit?limit=1000')).status).toBe(400);
  });
});

