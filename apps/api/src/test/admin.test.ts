import type { Types } from 'mongoose';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../lib/mailer.js', () => ({ sendCodeEmail: async () => {} }));

import { buildApp } from '../app.js';
import { User } from '../models/User.js';
import { WalletDeposit } from '../models/WalletDeposit.js';
import { AdminAction } from '../models/AdminAction.js';
import { ACCESS_COOKIE, signAccessToken } from '../lib/tokens.js';

const app = buildApp();

let counter = 0;
async function person(opts: { role?: 'user' | 'admin'; balanceKobo?: number; status?: 'active' | 'suspended' } = {}) {
  const n = ++counter;
  const u = await User.create({ email: `ad${n}@example.com`, username: `ad${n}`, usernameLower: `ad${n}`, passwordHash: 'x', isVerified: true, role: opts.role ?? 'user', balanceKobo: opts.balanceKobo ?? 0, status: opts.status ?? 'active' });
  // the token says "admin" for everyone here on purpose: the server must check the DATABASE, not the token
  return { u, cookie: `${ACCESS_COOKIE}=${signAccessToken(String(u._id), 'admin')}` };
}
const balance = async (u: { _id: unknown }) => (await User.findById(u._id as string))!.balanceKobo;
const post = (cookie: string, path: string, body: unknown) => request(app).post(`/api/v1/admin${path}`).set('Cookie', cookie).send(body as object);
const get = (cookie: string, path: string) => request(app).get(`/api/v1/admin${path}`).set('Cookie', cookie);

const unmatched = (amountKobo = 500_000) => WalletDeposit.create({ reference: `ref-${Math.random().toString(36).slice(2)}`, amountKobo, status: 'unmatched', payload: { order: { amount: amountKobo / 100, description: 'Transfer from Tunde' } } });

describe('admin: who can get in', () => {
  it('refuses signed-out visitors (401) and ordinary users (403), even if their token says admin', async () => {
    const user = await person({ role: 'user' });
    expect((await request(app).get('/api/v1/admin/me')).status).toBe(401);
    const res = await get(user.cookie, '/me');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('not_admin');
    expect((await post(user.cookie, '/wallet/adjust', { user: user.u.email, direction: 'credit', amountKobo: 100, reason: 'test' })).status).toBe(403);
    expect(await balance(user.u)).toBe(0);
  });

  it('lets a real admin in, and stops a suspended admin', async () => {
    const admin = await person({ role: 'admin' });
    expect((await get(admin.cookie, '/me')).status).toBe(200);
    const gone = await person({ role: 'admin', status: 'suspended' });
    expect((await get(gone.cookie, '/me')).status).toBe(403);
  });

  it('takes effect at once when someone loses admin rights (no waiting for the token to expire)', async () => {
    const admin = await person({ role: 'admin' });
    expect((await get(admin.cookie, '/me')).status).toBe(200);
    await User.updateOne({ _id: admin.u._id }, { role: 'user' });
    expect((await get(admin.cookie, '/me')).status).toBe(403);
  });
});

describe('admin: unmatched bank deposits', () => {
  it('lists them, and credits one to the user it belongs to, exactly once, with a record', async () => {
    const admin = await person({ role: 'admin' });
    const owner = await person({ balanceKobo: 1_000 });
    const dep = await unmatched(500_000);
    const list = await get(admin.cookie, '/deposits/unmatched');
    expect(list.body.deposits).toHaveLength(1);
    expect(list.body.deposits[0]).toMatchObject({ amountKobo: 500_000, description: 'Transfer from Tunde' });

    const first = await post(admin.cookie, `/deposits/${dep._id}/credit`, { user: owner.u.email.toUpperCase(), reason: 'Matched in PocketFi dashboard' });
    expect(first.status).toBe(200);
    expect(await balance(owner.u)).toBe(501_000);
    // again, and from a second admin at the same moment: nothing more is paid
    const other = await person({ role: 'admin' });
    const results = await Promise.all([post(admin.cookie, `/deposits/${dep._id}/credit`, { user: owner.u.email, reason: 'again' }), post(other.cookie, `/deposits/${dep._id}/credit`, { user: owner.u.email, reason: 'again' })]);
    expect(results.map((r) => r.status)).toEqual([409, 409]);
    expect(await balance(owner.u)).toBe(501_000);
    expect((await get(admin.cookie, '/deposits/unmatched')).body.deposits).toHaveLength(0);
    expect(await AdminAction.find({ action: 'credit_deposit' })).toHaveLength(1);
    expect(await AdminAction.findOne({ action: 'credit_deposit' })).toMatchObject({ amountKobo: 500_000, reason: 'Matched in PocketFi dashboard' });
  });

  it('refuses without a reason, for an unknown user, or for a deposit that does not exist', async () => {
    const admin = await person({ role: 'admin' });
    const owner = await person();
    const dep = await unmatched();
    expect((await post(admin.cookie, `/deposits/${dep._id}/credit`, { user: owner.u.email, reason: '' })).status).toBe(400);
    expect((await post(admin.cookie, `/deposits/${dep._id}/credit`, { user: 'nobody@nowhere.test', reason: 'who is this' })).status).toBe(404);
    expect((await post(admin.cookie, `/deposits/000000000000000000000000/credit`, { user: owner.u.email, reason: 'no such deposit' })).status).toBe(409);
    expect((await post(admin.cookie, `/deposits/not-an-id/credit`, { user: owner.u.email, reason: 'bad id' })).status).toBe(409);
    expect(await balance(owner.u)).toBe(0);
    expect((await WalletDeposit.findById(dep._id))!.status).toBe('unmatched'); // still waiting
  });
});

describe('admin: manual wallet changes', () => {
  it('credits and debits, records both, and never lets the balance go below zero', async () => {
    const admin = await person({ role: 'admin' });
    const target = await person({ balanceKobo: 10_000 });
    const credit = await post(admin.cookie, '/wallet/adjust', { user: target.u.username, direction: 'credit', amountKobo: 5_000, reason: 'Goodwill after a failed order' });
    expect(credit.status).toBe(200);
    expect(credit.body.balanceKobo).toBe(15_000);
    const debit = await post(admin.cookie, '/wallet/adjust', { user: target.u.email, direction: 'debit', amountKobo: 15_000, reason: 'Deposit was reversed at PocketFi' });
    expect(debit.status).toBe(200);
    expect(await balance(target.u)).toBe(0);
    const tooMuch = await post(admin.cookie, '/wallet/adjust', { user: target.u.email, direction: 'debit', amountKobo: 1, reason: 'more than it holds' });
    expect(tooMuch.status).toBe(409);
    expect(tooMuch.body.error.code).toBe('insufficient_balance');
    expect(await balance(target.u)).toBe(0);
    const log = await AdminAction.find({ userId: target.u._id }).sort({ createdAt: 1 });
    expect(log.map((a) => [a.action, a.amountKobo])).toEqual([['credit', 5_000], ['debit', -15_000]]);
  });

  it('refuses a missing reason, a zero or negative or fractional amount, and one that is too large', async () => {
    const admin = await person({ role: 'admin' });
    const target = await person();
    const base = { user: target.u.email, direction: 'credit', amountKobo: 100, reason: 'a fine reason' };
    for (const bad of [{ reason: '' }, { reason: 'ab' }, { amountKobo: 0 }, { amountKobo: -5 }, { amountKobo: 1.5 }, { amountKobo: 100_000_001 }, { direction: 'steal' }]) {
      expect((await post(admin.cookie, '/wallet/adjust', { ...base, ...bad })).status).toBe(400);
    }
    expect(await balance(target.u)).toBe(0);
    expect(await AdminAction.countDocuments()).toBe(0);
  });
});

describe('admin: the audit log', () => {
  it('shows who did what, newest first, with the reason', async () => {
    const admin = await person({ role: 'admin' });
    const target = await person();
    await post(admin.cookie, '/wallet/adjust', { user: target.u.email, direction: 'credit', amountKobo: 100, reason: 'first' });
    await post(admin.cookie, '/wallet/adjust', { user: target.u.email, direction: 'credit', amountKobo: 200, reason: 'second' });
    const { items } = (await get(admin.cookie, '/audit')).body;
    expect(items.slice(0, 2)).toMatchObject([
      { module: 'wallet', user: target.u.email, action: 'credit', amountKobo: 200, reason: 'second' },
      { action: 'credit', amountKobo: 100, reason: 'first' },
    ]);
  });
});
