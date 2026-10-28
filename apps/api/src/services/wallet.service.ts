import { createHmac, timingSafeEqual } from 'node:crypto';
import { accountNameFromUsername, type VirtualAccount as VirtualAccountView, type WalletDeposit as WalletDepositView } from '@numvexs/shared';
import { env } from '../config/env.js';
import { AppError, badRequest, conflict } from '../lib/errors.js';
import { inTx } from '../lib/tx.js';
import { User } from '../models/User.js';
import { VirtualAccount } from '../models/VirtualAccount.js';
import { WalletDeposit } from '../models/WalletDeposit.js';
import * as pocketfi from './wallet/pocketfi.js';

/*
 * Funding the wallet by bank transfer.
 *  - Every user gets ONE static account (PocketFi, via Paga). Asking again just returns it.
 *  - A transfer into it arrives as a signed webhook. We credit the wallet only when (1) the signature is right, (2) we can tell
 *    WHOSE account was paid, and (3) we haven't already credited that transfer's reference. Anything else is stored, not credited.
 */

const view = (a: InstanceType<typeof VirtualAccount>): VirtualAccountView => ({ bankName: a.bankName!, accountNumber: a.accountNumber!, accountName: a.accountName! });

export async function getAccount(userId: string): Promise<VirtualAccountView | null> {
  const a = await VirtualAccount.findOne({ userId, status: 'active' });
  return a ? view(a) : null;
}

/** "+2348012345678" -> "08012345678", the form PocketFi's docs use. */
export const toLocalPhone = (phone: string) => (phone.startsWith('+234') ? `0${phone.slice(4)}` : phone);

const LOCK_MS = 2 * 60 * 1000;

export async function createAccount(userId: string): Promise<VirtualAccountView> {
  const existing = await VirtualAccount.findOne({ userId });
  if (existing?.status === 'active') return view(existing); // one account per user: asking again is fine

  const user = await User.findById(userId);
  if (!user) throw badRequest('no_user', 'Please sign in again.');
  if (!user.phone) throw badRequest('phone_required', 'Add your phone number to your profile first.');
  const name = accountNameFromUsername(user.username); // the username is both first and last name: nobody types one
  const names = { firstName: name, lastName: name };

  // Take a lock first, so two clicks (or two tabs) can't make PocketFi create two accounts.
  if (existing) {
    const stale = Date.now() - (existing.updatedAt as Date).getTime() > LOCK_MS;
    if (!stale) throw conflict('in_progress', 'Your account number is being created. Please wait a moment.');
    await VirtualAccount.updateOne({ _id: existing._id }, { $currentDate: { updatedAt: true } });
  } else {
    try {
      await VirtualAccount.create({ userId, status: 'creating', firstName: names.firstName, lastName: names.lastName });
    } catch (err) {
      if ((err as { code?: number }).code === 11000) throw conflict('in_progress', 'Your account number is being created. Please wait a moment.');
      throw err;
    }
  }

  let created: pocketfi.CreatedAccount;
  try {
    created = await pocketfi.createAccount({ firstName: names.firstName, lastName: names.lastName, phone: toLocalPhone(user.phone), email: user.email });
  } catch (err) {
    await VirtualAccount.deleteOne({ userId, status: 'creating' }); // nothing was made: let them try again
    throw err;
  }

  try {
    const done = await VirtualAccount.findOneAndUpdate(
      { userId, status: 'creating' },
      { status: 'active', firstName: names.firstName, lastName: names.lastName, bank: created.bank, bankName: created.bankName, accountNumber: created.accountNumber, accountName: created.accountName, mode: env.POCKETFI_MODE },
      { new: true },
    );
    if (!done) return (await getAccount(userId))!;
    return view(done);
  } catch (err) {
    // Release the lock either way, so the user is never left stuck on "being created".
    await VirtualAccount.deleteOne({ userId, status: 'creating' });
    if ((err as { code?: number }).code === 11000) {
      // That number already belongs to someone else. In PocketFi's test mode that is expected: it hands EVERY request the same dummy number.
      console.error(`[wallet] PocketFi gave user ${userId} account number ${created.accountNumber}, which another user already has (mode ${env.POCKETFI_MODE}).`);
      throw env.POCKETFI_MODE === 'test'
        ? conflict('test_number_taken', "PocketFi's test mode gives every account the same number, and another test user already has it. In test mode only one user can hold an account at a time.")
        : new AppError(500, 'account_save_failed', 'We could not save your account number. Please contact support.');
    }
    console.error(`[wallet] PocketFi made account ${created.accountNumber} for user ${userId} but saving it failed:`, (err as Error).message);
    throw new AppError(500, 'account_save_failed', 'We could not save your account number. Please contact support.');
  }
}

export async function listDeposits(userId: string): Promise<WalletDepositView[]> {
  const rows = await WalletDeposit.find({ userId, status: 'credited' }).sort({ createdAt: -1 }).limit(50);
  return rows.map((d) => ({ id: String(d._id), amountKobo: d.amountKobo, createdAt: (d.createdAt as Date).toISOString() }));
}

/* ---------------- webhook ---------------- */

/** Is a webhook secret configured at all? (Logged when a webhook is refused.) */
export const webhookSecretIsSet = () => Boolean(env.POCKETFI_WEBHOOK_SECRET);

/** True only when `signature` is HMAC-SHA512(raw body, POCKETFI_WEBHOOK_SECRET) in hex. With no secret set, nothing is ever valid. */
export function signatureIsValid(rawBody: Buffer, signature: string | undefined): boolean {
  if (!env.POCKETFI_WEBHOOK_SECRET || !signature) return false;
  const expected = createHmac('sha512', env.POCKETFI_WEBHOOK_SECRET).update(rawBody).digest('hex');
  const given = signature.trim().toLowerCase();
  return given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

/** Every run of 8 to 15 digits in the payload's text, apart from the transaction reference: possible account numbers (banks differ: PocketFi's Paga numbers have 11 digits, others 10). */
function candidateAccountNumbers(payload: any): string[] {
  const found = new Set<string>();
  const walk = (value: unknown, path: string) => {
    if (path === 'transaction.reference') return;
    if (typeof value === 'string' || typeof value === 'number') {
      for (const m of String(value).matchAll(/(?<!\d)\d{8,15}(?!\d)/g)) found.add(m[0]);
    } else if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) walk(v, path ? `${path}.${k}` : k);
    }
  };
  walk(payload, '');
  return [...found];
}

export type WebhookResult = 'credited' | 'duplicate' | 'unmatched' | 'ignored';

/**
 * What we keep of a webhook for support: the whole message, except the customer's ID numbers (PocketFi may send nin/bvn: we never need them).
 */
function sanitized(payload: any) {
  if (!payload?.customer || typeof payload.customer !== 'object') return payload;
  const { nin: _nin, bvn: _bvn, ...customer } = payload.customer;
  return { ...payload, customer };
}


export async function handleDeposit(payload: any): Promise<WebhookResult> {
  const reference = typeof payload?.transaction?.reference === 'string' ? payload.transaction.reference.trim() : '';
  const amount = Number(payload?.order?.amount);
  if (!reference || !Number.isFinite(amount) || amount <= 0) return 'ignored'; // not a payment we understand
  const amountKobo = Math.round(amount * 100);
  const kept = sanitized(payload);

  // Keep what we do NOT credit, once per reference (a repeat delivery is harmless), and say why.
  const keep = async (why: string) => {
    try {
      await WalletDeposit.create({ reference, amountKobo, status: 'unmatched', payload: kept });
      console.error(`[wallet] deposit ${reference} (${amountKobo} kobo) is UNMATCHED: ${why} NOT credited. Check it in PocketFi and credit the user by hand.`);
    } catch (err) {
      if ((err as { code?: number }).code !== 11000) throw err;
    }
    return 'unmatched' as const;
  };

  const named = typeof payload?.account_number === 'string' || typeof payload?.account_number === 'number' ? String(payload.account_number).trim() : '';
  const numbers = named ? [named] : candidateAccountNumbers(payload);
  const accounts = numbers.length ? await VirtualAccount.find({ accountNumber: { $in: numbers }, status: 'active' }) : [];
  if (accounts.length !== 1) return keep(named ? 'the account number is not one of ours.' : `no single account of ours was found in the message (${accounts.length} match(es)).`);
  const account = accounts[0]!;

  // Belt and braces: the customer PocketFi names must be the person who owns this account.
  const theirEmail = typeof payload?.customer?.email === 'string' ? payload.customer.email.trim().toLowerCase() : '';
  if (theirEmail) {
    const owner = await User.findById(account.userId).select('email');
    if (!owner || owner.email.toLowerCase() !== theirEmail) return keep('the customer email in the message is not the owner of that account.');
  }

  // The unique reference is the lock: the same transfer delivered twice credits once. The record and the credit are ONE step: both happen or
  // neither does, so a crash can't leave a deposit marked credited with the money never added (or the money added with no record).
  try {
    await inTx(async (session) => {
      await WalletDeposit.create([{ reference, userId: account.userId, accountNumber: account.accountNumber, amountKobo, status: 'credited', payload: kept }], { session });
      await User.updateOne({ _id: account.userId }, { $inc: { balanceKobo: amountKobo } }, { session });
    });
  } catch (err) {
    if ((err as { code?: number }).code === 11000) return 'duplicate';
    throw err; // nothing was recorded or credited: PocketFi's retry tries again
  }
  return 'credited';
}
