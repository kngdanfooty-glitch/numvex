import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../lib/mailer.js', () => ({ sendCodeEmail: async () => {} }));

import { buildApp } from '../app.js';
import { User } from '../models/User.js';
import { Activation } from '../models/Activation.js';
import { BoostOrder } from '../models/BoostOrder.js';
import { WalletDeposit } from '../models/WalletDeposit.js';
import { ACCESS_COOKIE, signAccessToken } from '../lib/tokens.js';

const app = buildApp();

let counter = 0;
async function user() {
  const n = ++counter;
  const u = await User.create({ email: `hs${n}@example.com`, username: `hs${n}`, usernameLower: `hs${n}`, passwordHash: 'x', isVerified: true });
  return { u, cookie: `${ACCESS_COOKIE}=${signAccessToken(String(u._id), 'user')}` };
}

// Insert straight into the collection so the dates are exactly what the test says (not "now").
const T0 = Date.UTC(2026, 9, 1, 12, 0, 0);
const at = (minutes: number) => new Date(T0 + minutes * 60_000);
const raw = (model: { collection: { insertOne: (d: object) => Promise<unknown> } }, doc: object) => model.collection.insertOne(doc);
const get = (cookie: string, qs = '') => request(app).get(`/api/v1/history${qs}`).set('Cookie', cookie);

async function seed(userId: unknown) {
  await raw(WalletDeposit, { reference: `d-${Math.random()}`, userId, amountKobo: 1_000_000, status: 'credited', createdAt: at(0), updatedAt: at(0) });
  await raw(WalletDeposit, { reference: `u-${Math.random()}`, amountKobo: 777, status: 'unmatched', createdAt: at(1), updatedAt: at(1) }); // not anyone's money
  // a number that arrived: charge only
  await raw(Activation, { userId, server: 'smspool', providerOrderId: 'a1', number: '+15550001', service: 'WhatsApp', country: 'United States', costKobo: 200_000, status: 'completed', expiresAt: at(60), createdAt: at(10), updatedAt: at(12) });
  // a number that never got a code: charge, then a full refund
  await raw(Activation, { userId, server: 'smspool', providerOrderId: 'a2', number: '+15550002', service: 'Telegram', country: 'Nigeria', costKobo: 150_000, status: 'cancelled', expiresAt: at(60), createdAt: at(20), updatedAt: at(30) });
  // a boost order refunded in part
  await raw(BoostOrder, { userId, requestId: 'b1', server: 'peakerr', serviceId: '1', serviceName: 'Instagram Followers [Real]', link: 'https://x', quantity: 1000, costKobo: 500_000, status: 'partial', refundedKobo: 120_000, createdAt: at(40), updatedAt: at(100) });
}

describe('history', () => {
  it('is empty for someone with no activity', async () => {
    const { cookie } = await user();
    const res = await get(cookie);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ entries: [], nextBefore: null });
  });

  it('lists deposits, purchases and refunds, newest first, with money in as + and money out as -', async () => {
    const { u, cookie } = await user();
    await seed(u._id);
    const { entries, nextBefore } = (await get(cookie)).body;
    expect(nextBefore).toBeNull();
    // newest first by the moment each thing happened (a refund counts at the time it was refunded)
    expect(entries.map((e: { id: string }) => e.id.replace(/:[0-9a-f]{24}/, ''))).toEqual([
      'boost:refund', 'boost:purchase', 'number:refund', 'number:purchase', 'number:purchase', 'deposit',
    ]);
    expect(entries.find((e: { type: string }) => e.type === 'deposit')).toMatchObject({ title: 'Bank transfer deposit', amountKobo: 1_000_000 });
    expect(entries.filter((e: { kind: string; type: string }) => e.kind === 'boost')).toMatchObject([
      { type: 'refund', amountKobo: 120_000, title: 'Refund: Instagram Followers [Real]' },
      { type: 'purchase', amountKobo: -500_000, title: 'Instagram Followers [Real]', detail: '1,000 units' },
    ]);
    expect(entries.filter((e: { kind: string }) => e.kind === 'number')).toMatchObject([
      { type: 'refund', amountKobo: 150_000, title: 'Refund: Telegram number' },
      { type: 'purchase', amountKobo: -150_000, title: 'Telegram number', detail: 'Nigeria · +15550002' },
      { type: 'purchase', amountKobo: -200_000, title: 'WhatsApp number' },
    ]);
  });

  it('every refund is matched by an earlier charge, and the net matches what the wallet should hold', async () => {
    const { u, cookie } = await user();
    await seed(u._id);
    const { entries } = (await get(cookie)).body;
    const net = entries.reduce((sum: number, e: { amountKobo: number }) => sum + e.amountKobo, 0);
    // +1,000,000 deposit -200,000 -150,000 +150,000 -500,000 +120,000
    expect(net).toBe(1_000_000 - 200_000 - 150_000 + 150_000 - 500_000 + 120_000);
  });

  it('does not show deposits that were not credited to anyone, nor anyone else\'s activity', async () => {
    const me = await user();
    const other = await user();
    await seed(me.u._id);
    await raw(BoostOrder, { userId: other.u._id, requestId: 'x', server: 'peakerr', serviceId: '9', serviceName: 'Someone else\'s order', link: 'https://y', quantity: 5, costKobo: 1, status: 'completed', refundedKobo: 0, createdAt: at(5), updatedAt: at(5) });
    const mine = (await get(me.cookie)).body.entries;
    expect(JSON.stringify(mine)).not.toMatch(/Someone else/);
    expect(mine.some((e: { amountKobo: number }) => e.amountKobo === 777)).toBe(false); // the unmatched deposit
    const theirs = (await get(other.cookie)).body.entries;
    expect(theirs).toHaveLength(1);
  });

  it('pages through everything exactly once, in order', async () => {
    const { u, cookie } = await user();
    await seed(u._id);
    const everything = (await get(cookie, '?limit=50')).body.entries as { id: string }[];
    const seen: string[] = [];
    let before: string | null | undefined;
    for (let i = 0; i < 20; i++) {
      const res = await get(cookie, `?limit=3${before ? `&before=${encodeURIComponent(before)}` : ''}`);
      expect(res.status).toBe(200);
      seen.push(...res.body.entries.map((e: { id: string }) => e.id));
      before = res.body.nextBefore;
      if (!before) break;
    }
    expect(seen).toEqual(everything.map((e) => e.id));
    expect(new Set(seen).size).toBe(seen.length);
  });

  it('refuses a bad cursor or page size, and needs sign-in', async () => {
    const { cookie } = await user();
    expect((await get(cookie, '?before=yesterday')).status).toBe(400);
    expect((await get(cookie, '?limit=500')).status).toBe(400);
    expect((await get(cookie, '?limit=0')).status).toBe(400);
    expect((await request(app).get('/api/v1/history')).status).toBe(401);
  });
});
