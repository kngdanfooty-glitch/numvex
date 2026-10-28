import { createHmac } from 'node:crypto';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/mailer.js', () => ({ sendCodeEmail: async () => {} }));

import { buildApp } from '../app.js';
import { env } from '../config/env.js';
import { accountNameFromUsername } from '@numvexs/shared';
import { User } from '../models/User.js';
import { VirtualAccount } from '../models/VirtualAccount.js';
import { WalletDeposit } from '../models/WalletDeposit.js';
import { ACCESS_COOKIE, signAccessToken } from '../lib/tokens.js';
import { toLocalPhone } from '../services/wallet.service.js';

const app = buildApp();
const SECRET = 'whsec_test_secret';

let counter = 0;
async function user(opts: { phone?: string | null; balanceKobo?: number; username?: string } = {}) {
  const n = ++counter;
  const u = await User.create({
    email: `wl${n}@example.com`, username: opts.username ?? `wl${n}`, usernameLower: (opts.username ?? `wl${n}`).toLowerCase() + n, passwordHash: 'x', isVerified: true, balanceKobo: opts.balanceKobo ?? 0,
    ...(opts.phone === null ? {} : { phone: opts.phone ?? `+234807${String(6000000 + n)}` }),
  });
  return { u, cookie: `${ACCESS_COOKIE}=${signAccessToken(String(u._id), 'user')}` };
}
const wallet = async (u: { _id: unknown }) => (await User.findById(u._id as string))!.balanceKobo;

let calls: { path: string; auth: string | null; body: any }[];
let reply: { status?: number; body?: unknown; throws?: boolean; delayMs?: number };
let nextAccount: number;

// What the sandbox really answers: bankName in lowercase, an 11-digit account number, the first name only.
const OK = (n: number, name = 'Ada') => ({ status: true, service: 'pagaStatic', businessId: 29492, banks: [{ bankName: 'paga', accountNumber: String(n), accountName: name }] });

beforeEach(() => {
  env.POCKETFI_API_TOKEN = 'tok_test';
  env.POCKETFI_BUSINESS_ID = '29492';
  env.POCKETFI_WEBHOOK_SECRET = SECRET;
  env.POCKETFI_MODE = 'test';
  env.POCKETFI_BANK = 'paga';
  calls = [];
  nextAccount = 78000000001 + counter * 10; // 11 digits, like Paga's
  reply = { body: undefined };
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    calls.push({ path: new URL(url).pathname, auth: (init?.headers as Record<string, string>)?.authorization ?? null, body: init?.body ? JSON.parse(String(init.body)) : null });
    if (reply.delayMs) await new Promise((r) => setTimeout(r, reply.delayMs));
    if (reply.throws) throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNRESET' } });
    return new Response(JSON.stringify(reply.body ?? OK(nextAccount++)), { status: reply.status ?? 200, headers: { 'content-type': 'application/json' } });
  });
});
afterEach(() => vi.unstubAllGlobals());

const make = (cookie: string, body: Record<string, unknown> = {}) => request(app).post('/api/v1/wallet/account').set('Cookie', cookie).send(body);

describe('wallet: static account', () => {
  it('turns +234 numbers into the local form PocketFi uses', () => {
    expect(toLocalPhone('+2348012345678')).toBe('08012345678');
  });

  it('is null before the user makes one', async () => {
    const { cookie } = await user();
    const res = await request(app).get('/api/v1/wallet/account').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.account).toBeNull();
  });

  it('makes one account through PocketFi, with the right details, in the sandbox', async () => {
    const { u, cookie } = await user({ phone: '+2348061234567', username: 'Ada_Obi99' });
    const res = await make(cookie);
    expect(res.status).toBe(201);
    expect(res.body.account).toMatchObject({ bankName: 'Paga', accountName: 'Ada' }); // "paga" is shown as "Paga"
    expect(res.body.account.accountNumber).toMatch(/^\d{11}$/);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.path).toBe('/api/test/virtual-accounts/create'); // sandbox, not live
    expect(calls[0]!.auth).toBe('Bearer tok_test');
    expect(calls[0]!.body).toEqual({ first_name: 'AdaObi', last_name: 'AdaObi', phone: '08061234567', email: `${(await User.findById(u._id))!.email}`, businessId: '29492', bank: 'paga' });
    expect(await VirtualAccount.countDocuments({ userId: u._id, status: 'active' })).toBe(1);
  });

  it('uses the live address only when the mode is live', async () => {
    env.POCKETFI_MODE = 'live';
    const { cookie } = await user();
    await make(cookie);
    expect(calls[0]!.path).toBe('/api/v1/virtual-accounts/create');
  });

  it('is one account per user: asking again returns it and does not ask PocketFi again', async () => {
    const { cookie } = await user();
    const a = await make(cookie);
    const b = await make(cookie, { firstName: 'Someone', lastName: 'Else' });
    expect(b.body.account).toEqual(a.body.account);
    expect(calls).toHaveLength(1);
  });

  it('two clicks at once make one account (the second is told to wait)', async () => {
    reply = { delayMs: 60 };
    const { cookie } = await user();
    const [a, b] = await Promise.all([make(cookie), make(cookie)]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect(calls).toHaveLength(1);
  });

  it("uses the username as BOTH first and last name (letters only), and ignores any name a page sends", async () => {
    const { cookie } = await user({ username: 'Bob.Builder_2026' });
    await make(cookie, { firstName: 'Someone', lastName: 'Else' }).expect(201);
    expect(calls[0]!.body).toMatchObject({ first_name: 'BobBuilder', last_name: 'BobBuilder' });
  });

  it('a username with fewer than 2 letters left uses NumVex, and a very long one is cut to 40 letters', async () => {
    const a = await user({ username: 'x1_9' });
    await make(a.cookie).expect(201);
    expect(calls[0]!.body).toMatchObject({ first_name: 'NumVex', last_name: 'NumVex' });
    const b = await user({ username: 'a'.repeat(60) });
    await make(b.cookie).expect(201);
    expect(calls[1]!.body.first_name).toBe('A' + 'a'.repeat(39)); // cut to 40 letters, first one capital
    expect(accountNameFromUsername('ada_obi99')).toBe('Adaobi');
    expect(accountNameFromUsername('Ada_Obi99')).toBe('AdaObi');
  });

  it('needs a phone number on the profile', async () => {
    const { cookie } = await user({ phone: null });
    const res = await make(cookie);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('phone_required');
    expect(calls).toHaveLength(0);
  });

  it('test mode: PocketFi hands everyone the same dummy number, so the second user gets a clear message and no stuck lock', async () => {
    const first = await user();
    const second = await user();
    reply = { body: OK(78002857264) };
    expect((await make(first.cookie)).status).toBe(201);
    const res = await make(second.cookie);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('test_number_taken');
    expect(res.body.error.message).toMatch(/test mode/i);
    expect(await VirtualAccount.countDocuments({ userId: second.u._id })).toBe(0); // lock released: not stuck on "creating"
    expect(await VirtualAccount.countDocuments({ userId: first.u._id, status: 'active' })).toBe(1); // the first user is untouched
  });

  it('live mode: a number that is already taken is never handed to a second user', async () => {
    env.POCKETFI_MODE = 'live';
    const first = await user();
    const second = await user();
    reply = { body: OK(78002857264) };
    await make(first.cookie);
    const res = await make(second.cookie);
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('account_save_failed');
    expect(await VirtualAccount.countDocuments({ accountNumber: '78002857264' })).toBe(1);
  });

  it('needs sign-in', async () => {
    expect((await request(app).get('/api/v1/wallet/account')).status).toBe(401);
    expect((await request(app).post('/api/v1/wallet/account').send({ firstName: 'Ada', lastName: 'Obi' })).status).toBe(401);
  });

  it('can be retried after PocketFi refuses or is down (no stuck lock)', async () => {
    const { u, cookie } = await user();
    reply = { status: 422, body: { status: false, message: 'email taken' } };
    expect((await make(cookie)).status).toBe(409);
    reply = { throws: true };
    expect((await make(cookie)).status).toBe(502);
    expect(await VirtualAccount.countDocuments({ userId: u._id })).toBe(0);
    reply = { body: undefined };
    expect((await make(cookie)).status).toBe(201);
  });

  it('never shows PocketFi wording, and says "not set up" with no token', async () => {
    const { cookie } = await user();
    reply = { status: 422, body: { status: false, message: 'PocketFi internal: BVN invalid' } };
    expect(JSON.stringify((await make(cookie)).body)).not.toMatch(/PocketFi|BVN/);
    env.POCKETFI_API_TOKEN = undefined;
    expect((await make(cookie)).status).toBe(503);
  });
});

/* A webhook as PocketFi documents it: no account number in it, so the tests put one in the description. */
const body = (o: { amount?: number; reference?: string; description?: string; extra?: Record<string, unknown> } = {}) =>
  JSON.stringify({ order: { amount: o.amount ?? 5000, settlement_amount: 4875, fee: 125, description: o.description ?? '' }, transaction: { reference: o.reference ?? `pfi_ref_${Math.random().toString(36).slice(2)}` }, ...(o.extra ?? {}) });
const sign = (raw: string, secret = SECRET) => createHmac('sha512', secret).update(raw).digest('hex');
const hook = (raw: string, signature: string | undefined, header = 'Pocketfi-Signature') => {
  const r = request(app).post('/api/v1/webhooks/pocketfi').set('Content-Type', 'application/json');
  if (signature !== undefined) r.set(header, signature);
  return r.send(raw);
};

async function withAccount(balanceKobo = 0) {
  const { u, cookie } = await user({ balanceKobo });
  const acct = (await make(cookie)).body.account.accountNumber as string;
  return { u, cookie, acct };
}

describe('wallet: webhook', () => {
  it('credits the wallet with exactly what was sent, in kobo', async () => {
    const { u, acct } = await withAccount(1_000);
    const raw = body({ amount: 5000, description: `Transfer to ${acct} from Tunde` });
    const res = await hook(raw, sign(raw));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'success' });
    expect(await wallet(u)).toBe(1_000 + 500_000);
    expect(await WalletDeposit.findOne({ userId: u._id })).toMatchObject({ status: 'credited', amountKobo: 500_000, accountNumber: acct });
  });

  it('turns naira with kobo into exact kobo (4999.99 -> 499,999)', async () => {
    const { u, acct } = await withAccount();
    const raw = body({ amount: 4999.99, description: acct });
    await hook(raw, sign(raw));
    expect(await wallet(u)).toBe(499_999);
  });

  it('refuses a missing, wrong or other-secret signature, and credits nothing', async () => {
    const { u, acct } = await withAccount();
    const raw = body({ description: acct });
    expect((await hook(raw, undefined)).status).toBe(400);
    expect((await hook(raw, 'deadbeef')).status).toBe(400);
    expect((await hook(raw, sign(raw, 'someone-elses-secret'))).status).toBe(400);
    expect((await hook(raw, sign(raw + ' '))).status).toBe(400); // signed for different bytes
    expect(await wallet(u)).toBe(0);
    expect(await WalletDeposit.countDocuments()).toBe(0);
  });

  it('refuses everything when no secret is set', async () => {
    const { u, acct } = await withAccount();
    env.POCKETFI_WEBHOOK_SECRET = undefined;
    const raw = body({ description: acct });
    expect((await hook(raw, sign(raw))).status).toBe(400);
    expect((await hook(raw, sign(raw, ''))).status).toBe(400);
    expect(await wallet(u)).toBe(0);
  });

  it('accepts the signature header under either name, in any letter case', async () => {
    const { u, acct } = await withAccount();
    const raw = body({ description: acct });
    expect((await hook(raw, sign(raw).toUpperCase(), 'http_pocketfi_signature')).status).toBe(200);
    expect(await wallet(u)).toBe(500_000);
  });

  it("accepts the names PocketFi's live calls really use (x-pocketfi-signature and pocketfi_signature), alone or together, and still refuses a wrong value", async () => {
    for (const names of [['x-pocketfi-signature'], ['pocketfi_signature'], ['x-pocketfi-signature', 'pocketfi_signature']]) {
      const { u, acct } = await withAccount();
      const raw = body({ description: acct });
      const r = request(app).post('/api/v1/webhooks/pocketfi').set('Content-Type', 'application/json');
      for (const n of names) r.set(n, sign(raw));
      expect((await r.send(raw)).status).toBe(200);
      expect(await wallet(u)).toBe(500_000);
    }
    const { u, acct } = await withAccount();
    const raw = body({ description: acct });
    expect((await hook(raw, sign(raw, 'wrong'), 'x-pocketfi-signature')).status).toBe(400);
    expect((await hook(raw, sign(raw, 'wrong'), 'pocketfi_signature')).status).toBe(400);
    expect(await wallet(u)).toBe(0);
  });

  it('credits a transfer once however many times it is delivered', async () => {
    const { u, acct } = await withAccount();
    const raw = body({ reference: 'pfi_ref_same', description: acct });
    const sig = sign(raw);
    await Promise.all([hook(raw, sig), hook(raw, sig), hook(raw, sig)]);
    await hook(raw, sig);
    expect(await wallet(u)).toBe(500_000);
    expect(await WalletDeposit.countDocuments({ reference: 'pfi_ref_same' })).toBe(1);
  });

  it('does NOT credit a transfer that does not say whose account it was (kept for a person)', async () => {
    const { u } = await withAccount();
    const raw = body({ description: 'Payment for Order #1234' });
    const res = await hook(raw, sign(raw));
    expect(res.status).toBe(200); // verified: acknowledged so PocketFi stops retrying
    expect(await wallet(u)).toBe(0);
    expect(await WalletDeposit.findOne({ reference: JSON.parse(raw).transaction.reference })).toMatchObject({ status: 'unmatched', amountKobo: 500_000 });
  });

  it('matches account numbers of any normal length (10 or 11 digits) and not part of a longer number', async () => {
    const { u, acct } = await withAccount();
    expect(acct).toHaveLength(11);
    const longer = body({ description: `ref ${acct}9` }); // part of a longer number: not this account
    await hook(longer, sign(longer));
    expect(await wallet(u)).toBe(0);
    const exact = body({ description: `Paga transfer to acct ${acct}.` });
    await hook(exact, sign(exact));
    expect(await wallet(u)).toBe(500_000);
  });

  it('does not credit when the account number is unknown, or when two accounts are named', async () => {
    const a = await withAccount();
    const b = await withAccount();
    const unknown = body({ description: 'to 9999999999' });
    await hook(unknown, sign(unknown));
    const two = body({ description: `${a.acct} and ${b.acct}` });
    await hook(two, sign(two));
    expect(await wallet(a.u)).toBe(0);
    expect(await wallet(b.u)).toBe(0);
    expect(await WalletDeposit.countDocuments({ status: 'unmatched' })).toBe(2);
  });

  it('never matches an account number that only appears inside the transaction reference', async () => {
    const { u, acct } = await withAccount();
    const raw = body({ reference: `ref${acct}`, description: 'nothing useful' });
    await hook(raw, sign(raw));
    expect(await wallet(u)).toBe(0);
  });

  it('ignores a payload it does not understand (answers 200, credits nothing)', async () => {
    const { u, acct } = await withAccount();
    for (const raw of [JSON.stringify({ hello: 'world', note: acct }), JSON.stringify({ order: { amount: -5 }, transaction: { reference: 'r1' }, note: acct }), JSON.stringify({ order: { amount: 'abc' }, transaction: { reference: 'r2' } })]) {
      expect((await hook(raw, sign(raw))).status).toBe(200);
    }
    expect(await wallet(u)).toBe(0);
    expect(await WalletDeposit.countDocuments()).toBe(0);
  });

  it('puts the money on the right wallet when several users have accounts', async () => {
    const a = await withAccount(100);
    const b = await withAccount(200);
    const raw = body({ amount: 1000, description: `to ${b.acct}` });
    await hook(raw, sign(raw));
    expect(await wallet(a.u)).toBe(100);
    expect(await wallet(b.u)).toBe(200 + 100_000);
  });
});

describe('wallet: deposits list', () => {
  it('shows only my credited deposits', async () => {
    const a = await withAccount();
    const b = await withAccount();
    const mine = body({ amount: 2000, description: a.acct });
    const theirs = body({ amount: 3000, description: b.acct });
    const nobody = body({ amount: 4000, description: 'nothing' });
    for (const raw of [mine, theirs, nobody]) await hook(raw, sign(raw));
    const res = await request(app).get('/api/v1/wallet/deposits').set('Cookie', a.cookie);
    expect(res.status).toBe(200);
    expect(res.body.deposits).toHaveLength(1);
    expect(res.body.deposits[0].amountKobo).toBe(200_000);
  });
});

/* PocketFi's real message, as they sent it to us. The account that was paid is in `account_number`; the description also names the SENDER's account. */
const real = (o: { account: string; email?: string | null; amount?: string | number; sender?: string; reference?: string; extraCustomer?: Record<string, unknown> }) =>
  JSON.stringify({
    order: { amount: o.amount ?? '1300.00', settlement_amount: 1280.5, fee: 19.5, description: `${o.account} received ${o.amount ?? '1300.00'} from SADIYA MOHAMMED (${o.sender ?? '7064854795'}, Opay)` },
    transaction: { reference: o.reference ?? `PFI|${Math.random().toString(10).slice(2, 22)}` },
    account_number: o.account,
    ...(o.email === null ? {} : { customer: { id: 369802, first_name: 'Ada', last_name: 'Obi', phone: '08011112222', email: o.email, nin: null, bvn: null, businessId: '29492', ...(o.extraCustomer ?? {}) } }),
  });

describe('wallet: PocketFi\'s real message', () => {
  it('credits the owner of `account_number`, with the amount sent as text ("1300.00" = 130,000 kobo)', async () => {
    const { u, acct } = await withAccount();
    const email = (await User.findById(u._id))!.email;
    const raw = real({ account: acct, email });
    expect((await hook(raw, sign(raw))).status).toBe(200);
    expect(await wallet(u)).toBe(130_000);
    expect(await WalletDeposit.findOne({ userId: u._id })).toMatchObject({ status: 'credited', amountKobo: 130_000, accountNumber: acct });
  });

  it('keeps an account number that starts with zero exactly as text (0107967374)', async () => {
    const { u } = await user();
    await VirtualAccount.create({ userId: u._id, status: 'active', bankName: 'Bank', accountNumber: '0107967374', accountName: 'Ada' });
    const raw = real({ account: '0107967374', email: (await User.findById(u._id))!.email });
    await hook(raw, sign(raw));
    expect(await wallet(u)).toBe(130_000);
  });

  it('the SENDER\'s account number in the description never decides whose money it is, even if it is also one of ours', async () => {
    const a = await withAccount();
    const b = await withAccount();
    const raw = real({ account: a.acct, email: (await User.findById(a.u._id))!.email, sender: b.acct });
    await hook(raw, sign(raw));
    expect(await wallet(a.u)).toBe(130_000);
    expect(await wallet(b.u)).toBe(0);
  });

  it('when `account_number` is not one of ours, nothing is credited, even if our number appears elsewhere in the text', async () => {
    const a = await withAccount();
    const raw = real({ account: '0000000001', email: (await User.findById(a.u._id))!.email, sender: a.acct });
    await hook(raw, sign(raw));
    expect(await wallet(a.u)).toBe(0);
    expect(await WalletDeposit.findOne({ reference: JSON.parse(raw).transaction.reference })).toMatchObject({ status: 'unmatched', amountKobo: 130_000 });
  });

  it('refuses to credit when the customer\'s email is not the owner\'s, and keeps it for a person', async () => {
    const a = await withAccount();
    const raw = real({ account: a.acct, email: 'someone.else@example.com' });
    expect((await hook(raw, sign(raw))).status).toBe(200);
    expect(await wallet(a.u)).toBe(0);
    expect(await WalletDeposit.findOne({ reference: JSON.parse(raw).transaction.reference })).toMatchObject({ status: 'unmatched' });
  });

  it('compares the email without caring about capitals or spaces', async () => {
    const a = await withAccount();
    const raw = real({ account: a.acct, email: `  ${(await User.findById(a.u._id))!.email.toUpperCase()} ` });
    await hook(raw, sign(raw));
    expect(await wallet(a.u)).toBe(130_000);
  });

  it('still credits a message with no customer block at all', async () => {
    const a = await withAccount();
    const raw = real({ account: a.acct, email: null });
    await hook(raw, sign(raw));
    expect(await wallet(a.u)).toBe(130_000);
  });

  it('never stores the customer\'s ID numbers (nin / bvn), even if PocketFi sends them', async () => {
    const a = await withAccount();
    const raw = real({ account: a.acct, email: (await User.findById(a.u._id))!.email, extraCustomer: { nin: '12345678901', bvn: '98765432109' } });
    await hook(raw, sign(raw));
    const saved = await WalletDeposit.findOne({ userId: a.u._id });
    expect(JSON.stringify(saved!.payload)).not.toMatch(/12345678901|98765432109/);
    expect((saved!.payload as any).customer.email).toBeTruthy(); // the rest is kept for support
  });

  it('a repeat of the same real message credits once', async () => {
    const a = await withAccount();
    const raw = real({ account: a.acct, email: (await User.findById(a.u._id))!.email, reference: 'PFI|100004261003141309173155680880' });
    const sig = sign(raw);
    await Promise.all([hook(raw, sig), hook(raw, sig)]);
    await hook(raw, sig);
    expect(await wallet(a.u)).toBe(130_000);
  });

  it('turns amounts with kobo into exact kobo, as text or as a number', async () => {
    for (const amount of ['4999.99', 4999.99, '0.10']) {
      const a = await withAccount();
      const raw = real({ account: a.acct, email: (await User.findById(a.u._id))!.email, amount });
      await hook(raw, sign(raw));
      expect(await wallet(a.u)).toBe(Math.round(Number(amount) * 100));
    }
  });
});
