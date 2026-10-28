import { createHash, randomBytes } from 'node:crypto';
import type { Response } from 'express';
import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';
import { env } from '../config/env.js';
import { RefreshToken } from '../models/RefreshToken.js';

/*
 * How a login session works (two tokens, both in httpOnly cookies that JavaScript can't read):
 *
 *  ACCESS token  - a signed JWT, valid 15 minutes. Sent with every request to prove who you are.
 *  REFRESH token - a random string, valid 7 days. When the access token expires, the web app
 *                  swaps it for a new pair (POST /auth/refresh) so you stay logged in.
 *
 * Short access tokens limit the damage if one leaks; the refresh token lives in our database
 * so we can revoke it (logout, password reset).
 */

const ACCESS_TTL_SECONDS = 15 * 60;
const REFRESH_TTL_SECONDS = 7 * 24 * 60 * 60;

export const ACCESS_COOKIE = 'mhub_access';
export const REFRESH_COOKIE = 'mhub_refresh';

export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

export function signAccessToken(userId: string, role: string): string {
  return jwt.sign({ sub: userId, role }, env.JWT_ACCESS_SECRET, { expiresIn: ACCESS_TTL_SECONDS });
}

/** Returns the user id if the token is valid and not expired, otherwise null. */
export function verifyAccessToken(token: string): { userId: string; role: string } | null {
  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as jwt.JwtPayload;
    return { userId: String(payload.sub), role: String(payload.role) };
  } catch {
    return null;
  }
}

const cookieOptions = (maxAgeSeconds: number) => ({
  httpOnly: true, // JavaScript on the page cannot read it (blocks token theft via XSS)
  secure: env.COOKIE_SECURE, // https only in production
  sameSite: 'lax' as const, // not sent on cross-site POSTs (CSRF protection)
  path: '/',
  maxAge: maxAgeSeconds * 1000,
});

/** Log the user in: create a session row and set both cookies on the response. */
export async function startSession(res: Response, userId: Types.ObjectId, role: string) {
  const refreshToken = randomBytes(32).toString('base64url');

  await RefreshToken.create({
    userId,
    tokenHash: sha256(refreshToken), // we store the hash, never the token itself
    expiresAt: new Date(Date.now() + REFRESH_TTL_SECONDS * 1000),
  });

  res.cookie(ACCESS_COOKIE, signAccessToken(String(userId), role), cookieOptions(ACCESS_TTL_SECONDS));
  res.cookie(REFRESH_COOKIE, refreshToken, cookieOptions(REFRESH_TTL_SECONDS));
}

export function clearSessionCookies(res: Response) {
  res.clearCookie(ACCESS_COOKIE, { path: '/' });
  res.clearCookie(REFRESH_COOKIE, { path: '/' });
}
