import type { RequestHandler } from 'express';
import { unauthorized } from '../lib/errors.js';
import { ACCESS_COOKIE, verifyAccessToken } from '../lib/tokens.js';

/**
 * Put this in front of any route that needs a logged-in user.
 * It reads the access-token cookie; if it's valid, the user id is available as
 * `res.locals.userId`, otherwise the request is rejected with 401.
 */
export const requireAuth: RequestHandler = (req, res, next) => {
  const token: string | undefined = req.cookies?.[ACCESS_COOKIE];
  const payload = token ? verifyAccessToken(token) : null;
  if (!payload) throw unauthorized('unauthenticated', 'Please sign in.');

  res.locals.userId = payload.userId;
  next();
};
