import type { RequestHandler } from 'express';
import { badRequest } from '../lib/errors.js';

/*
 * NoSQL-injection guard. It REFUSES a tainted request (400) instead of "cleaning" it: stripping the operator out of { "$ne": "" } leaves { },
 * and an empty filter matches everyone, so quietly sanitizing could itself open the hole. MongoDB treats a key that starts with "$" ({ "$ne": "" }, { "$gt": "" }, { "$where": ... }) as an operator, and a key
 * with a "." as a path into a document. A caller who gets such an object into a query (login with { "email": { "$ne": "" } }) changes what
 * the query MEANS. Our Zod schemas already refuse non-strings, and every search escapes its regex; this is the net underneath, so a route
 * somebody adds later without a schema is still safe: any request carrying an operator-like key anywhere in its body, query or URL
 * parameters is refused before a route sees it.
 *
 * Not applied to /webhooks: those are signed messages from the payment provider, checked against their raw bytes, and must never be turned away.
 */

const MAX_DEPTH = 8;

/** true when `value` (or anything inside it) has a key that starts with "$" or contains "." (or nests deeper than any real request). */
export function hasOperatorKeys(value: unknown, depth = 0): boolean {
  if (value === null || typeof value !== 'object') return false;
  if (depth > MAX_DEPTH) return true;
  if (Array.isArray(value)) return value.some((v) => hasOperatorKeys(v, depth + 1));
  for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
    if (key.startsWith('$') || key.includes('.') || key.includes('$')) return true;
    if (hasOperatorKeys(inner, depth + 1)) return true;
  }
  return false;
}

/**
 * Cookies are plain text, but cookie-parser turns one that starts with "j:" into a JSON object (j:{"$ne":1}). Our cookies are tokens, so
 * every cookie value must stay a string.
 */
const cookiesAreText = (cookies: unknown) =>
  cookies === undefined || cookies === null || (typeof cookies === 'object' && Object.values(cookies as Record<string, unknown>).every((v) => typeof v === 'string'));

export const noSqlInjection: RequestHandler = (req, _res, next) => {
  if (req.path.startsWith('/webhooks')) return next();
  if (hasOperatorKeys(req.body) || hasOperatorKeys(req.query) || hasOperatorKeys(req.params) || !cookiesAreText(req.cookies)) {
    return next(badRequest('invalid_request', 'That request is not valid.'));
  }
  next();
};
