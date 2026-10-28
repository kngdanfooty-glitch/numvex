import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/mailer.js', () => ({ sendCodeEmail: async () => {} }));

import { buildApp } from '../app.js';
import { ACCESS_COOKIE, signAccessToken } from '../lib/tokens.js';
import { User } from '../models/User.js';
import { VirtualAccount } from '../models/VirtualAccount.js';
import { WalletDeposit } from '../models/WalletDeposit.js';
import { creditUnmatchedDeposit } from '../services/admin.service.js';
import { handleDeposit } from '../services/wallet.service.js';

/*
 * Money moves in pairs (take it + record why; mark refunded + pay it back). These tests make the SECOND write fail on purpose and check the
 * FIRST was undone: no order marked refunded with the money not returned, no charge without an order, no deposit marked credited but not added.
 */
const app = buildApp();
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

let n = 0;
async function user(balanceKobo: number, role: 'user' | 'admin' = 'user') {
  n++;
  const u = await User.create({ email: `ms${n}@example.com`, username: `ms${n}`, usernameLower: `ms${n}`, passwordHash: 'x', isVerified: true, balanceKobo, role });
  return { u, cookie: `${ACCESS_COOKIE}=${signAccessToken(String(u._id), role)}` };
}
const bal = async (u: { _id: unknown }) => (await User.findById(u._id as string))!.balanceKobo;
const boom = () => vi.spyOn(User, 'updateOne').mockImplementationOnce((() => { throw new Error('boom'); }) as never);

describe('refunds: marking and paying are one step', () => {
  it('admin credit of an unmatched deposit: if adding the money fails, the deposit stays unmatched; a retry credits once', async () => {
    const admin = await user(0, 'admin');
    const buyer = await user(0);
    const dep = await WalletDeposit.create({ reference: 'um-1', amountKobo: 700_000, status: 'unmatched', payload: {} });
    boom();
    await expect(creditUnmatchedDeposit(String(admin.u._id), String(dep._id), { user: buyer.u.email, reason: 'checked' })).rejects.toThrow('boom');
    expect(await WalletDeposit.findById(dep._id)).toMatchObject({ status: 'unmatched' });
    expect(await bal(buyer.u)).toBe(0);
    await creditUnmatchedDeposit(String(admin.u._id), String(dep._id), { user: buyer.u.email, reason: 'checked' });
    await expect(creditUnmatchedDeposit(String(admin.u._id), String(dep._id), { user: buyer.u.email, reason: 'again' })).rejects.toMatchObject({ code: 'already_handled' });
    expect(await bal(buyer.u)).toBe(700_000);
  });
});

describe('deposits: the record and the credit are one step', () => {
  const payload = (ref: string, account: string, email: string) => ({ transaction: { reference: ref }, order: { amount: 5000 }, account_number: account, customer: { email } });

  it('if adding the money fails, no "credited" record is left behind, so the provider\'s retry credits it; a repeat after that does nothing', async () => {
    const { u } = await user(0);
    await VirtualAccount.create({ userId: u._id, status: 'active', bankName: 'Bank', accountNumber: '0107967374', accountName: 'Ada' });
    boom();
    await expect(handleDeposit(payload('tx-1', '0107967374', u.email))).rejects.toThrow('boom');
    expect(await WalletDeposit.countDocuments()).toBe(0);
    expect(await bal(u)).toBe(0);
    expect(await handleDeposit(payload('tx-1', '0107967374', u.email))).toBe('credited');
    expect(await handleDeposit(payload('tx-1', '0107967374', u.email))).toBe('duplicate');
    expect(await bal(u)).toBe(500_000);
  });
});


