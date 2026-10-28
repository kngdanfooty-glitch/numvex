import type { Request, RequestHandler, Response } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { env } from '../config/env.js';

/*
 * Throttling: how often one person may call us. Every limiter answers 429 { error: { code: 'rate_limited', message } } and a
 * Retry-After header. They are switched off in tests (so the suite runs fast) unless a test asks for them with `inTests`.
 *
 * Who is "one person" depends on the route:
 *  - signed-in routes: the user id (an office sharing one IP doesn't share a budget);
 *  - login / email codes: IP + the email typed (one attacker can't hammer one account, and one typo-prone user can't lock out a building);
 *  - code checks (6-digit codes): the email alone, because a guesser can switch IPs but cannot switch the account they are attacking.
 */

interface Options {
  windowMs: number;
  limit: number;
  message?: string;
  /** Who the budget belongs to. Defaults to the caller's IP address. */
  key?: (req: Request, res: Response) => string;
  /** Enforce even when NODE_ENV is "test" (only the throttling tests set this). */
  inTests?: boolean;
}

export const ip = (req: Request) => ipKeyGenerator(req.ip ?? '');
const emailIn = (req: Request) => (typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase().slice(0, 254) : '');
export const byUser = (req: Request, res: Response) => (typeof res.locals.userId === 'string' ? `u:${res.locals.userId}` : `ip:${ip(req)}`);
export const byIpAndEmail = (req: Request) => `${ip(req)}|${emailIn(req)}`;
export const byEmail = (req: Request) => (emailIn(req) ? `e:${emailIn(req)}` : `ip:${ip(req)}`);

// Typed as a handler for ANY route params, so putting it before a handler doesn't stop Express reading `:server` etc. from the path.
export function makeLimiter({ windowMs, limit, message = 'Too many attempts. Please try again later.', key, inTests }: Options): RequestHandler<any> {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: (req, res) => (key ? key(req, res) : ip(req)),
    validate: { keyGeneratorIpFallback: false }, // we build IPv6-safe keys ourselves (ipKeyGenerator)
    skip: () => env.NODE_ENV === 'test' && !inTests,
    handler: (_req, res) => {
      res.status(429).json({ error: { code: 'rate_limited', message } });
    },
  });
}

const MIN = 60_000;
const HOUR = 60 * MIN;

/** Every API call from one IP: a generous ceiling that only stops scripts. */
export const apiLimiter = makeLimiter({ windowMs: MIN, limit: 300, message: 'Too many requests. Please slow down.' });
/** All the sign-in routes together from one IP (the specific limiters below are stricter). */
export const authLimiter = makeLimiter({ windowMs: 15 * MIN, limit: 60 });

/** Creating accounts also sends an email: 5 an hour per IP. */
export const registerLimiter = makeLimiter({ windowMs: HOUR, limit: 5, message: 'Too many sign-ups from this connection. Please try again in an hour.' });
/** Password tries: 10 per 15 minutes for one email from one IP. */
export const loginLimiter = makeLimiter({ windowMs: 15 * MIN, limit: 10, key: byIpAndEmail, message: 'Too many sign-in attempts. Please try again in 15 minutes.' });
/** Sending a code by email (verify again, forgot password): 5 per 15 minutes per email and IP. */
export const emailCodeLimiter = makeLimiter({ windowMs: 15 * MIN, limit: 5, key: byIpAndEmail, message: 'We already sent you a code. Please wait a few minutes before asking again.' });
/** Typing a 6-digit code: 10 tries per 15 minutes per email, from anywhere. */
export const codeCheckLimiter = makeLimiter({ windowMs: 15 * MIN, limit: 10, key: byEmail, message: 'Too many wrong codes. Please wait 15 minutes, or ask for a new code.' });

/** Anything that spends wallet money (buy, order, cancel, done): 20 a minute per user. */
export const spendLimiter = makeLimiter({ windowMs: MIN, limit: 20, key: byUser, message: 'You are doing that too fast. Please wait a moment.' });
/** Making a bank account number (a real call to PocketFi): 5 an hour per user. */
export const accountLimiter = makeLimiter({ windowMs: HOUR, limit: 5, key: byUser, message: 'Too many tries. Please wait before asking for your account number again.' });
