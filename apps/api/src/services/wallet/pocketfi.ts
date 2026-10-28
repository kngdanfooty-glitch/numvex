import { env } from '../../config/env.js';
import { AppError } from '../../lib/errors.js';
import { providerFetch } from '../../lib/providerFetch.js';

/*
 * PocketFi (docs: developer.pocketfi.ng/docs). JSON with `Authorization: Bearer <token>`.
 *   live     https://api.pocketfi.ng/api/v1
 *   sandbox  https://api.pocketfi.ng/api/test   (no real money; what POCKETFI_MODE=test uses)
 *   POST /virtual-accounts/create  { first_name, last_name, phone, email (unique per account), businessId, bank, nin?, bvn? }
 *     -> { status: true, service, businessId, banks: [{ bankName, accountNumber, accountName }] }
 * Bank is paga/kuda/9psb/saveheaven; BVN/NIN are only required for palmpay, which we don't use.
 * Confirmed against the sandbox (2026-10-08): the reply has banks[0].{bankName ("paga"), accountNumber (11 digits for Paga), accountName (the first name only)}.
 */
const base = () => (env.POCKETFI_MODE === 'live' ? 'https://api.pocketfi.ng/api/v1' : 'https://api.pocketfi.ng/api/test');

const unavailable = () => new AppError(503, 'server_unavailable', 'Bank transfer funding is temporarily unavailable. Please try again later.');

/** PocketFi answers "paga" (lowercase): show the name people know. */
const BANK_NAMES: Record<string, string> = { paga: 'Paga', kuda: 'Kuda', '9psb': '9PSB', saveheaven: 'Safe Haven' };
const prettyBank = (name: string) => BANK_NAMES[name.trim().toLowerCase()] ?? name;

export interface CreatedAccount {
  bank: string;
  bankName: string;
  accountNumber: string;
  accountName: string;
}

export interface NewAccountInput {
  firstName: string;
  lastName: string;
  /** Local format, "09029163518". */
  phone: string;
  email: string;
}

export async function createAccount(input: NewAccountInput): Promise<CreatedAccount> {
  if (!env.POCKETFI_API_TOKEN || !env.POCKETFI_BUSINESS_ID) {
    throw new AppError(503, 'server_not_configured', "Bank transfer funding isn't set up yet.");
  }
  const res = await providerFetch(`${base()}/virtual-accounts/create`, {
    method: 'POST',
    headers: { authorization: `Bearer ${env.POCKETFI_API_TOKEN}`, accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({
      first_name: input.firstName,
      last_name: input.lastName,
      phone: input.phone,
      email: input.email,
      businessId: env.POCKETFI_BUSINESS_ID,
      bank: env.POCKETFI_BANK,
    }),
  });
  const json: any = await res.json().catch(() => null);

  if (res.status === 401 || res.status === 403) {
    console.error('[wallet:pocketfi] the API token was rejected: check POCKETFI_API_TOKEN');
    throw unavailable();
  }
  if (res.status === 429) throw new AppError(429, 'server_busy', 'Too many requests right now. Try again in a few seconds.');

  const row = Array.isArray(json?.banks) ? json.banks[0] : undefined;
  if (res.status >= 200 && res.status < 300 && json?.status !== false && row?.accountNumber) {
    return {
      bank: env.POCKETFI_BANK,
      bankName: prettyBank(String(row.bankName ?? env.POCKETFI_BANK)),
      accountNumber: String(row.accountNumber),
      accountName: String(row.accountName ?? `${input.firstName} ${input.lastName}`),
    };
  }

  // A refusal with a reason (bad details, or this email already has an account there). Logged, and shown plainly.
  console.error('[wallet:pocketfi] account creation refused:', res.status, JSON.stringify(json)?.slice(0, 300));
  if (res.status >= 400 && res.status < 500) {
    throw new AppError(409, 'account_refused', "We couldn't create your account number. Check your details and try again, or contact support.");
  }
  throw new AppError(502, 'provider_error', 'The server did not answer properly. Try again shortly.');
}
