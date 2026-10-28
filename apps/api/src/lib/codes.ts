import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { AUTH_CODE_LENGTH } from '@numvexs/shared';
import { env } from '../config/env.js';

/** A random 6-digit code like "042913". randomInt is cryptographically secure (Math.random is NOT). */
export function generateCode(): string {
  return randomInt(0, 10 ** AUTH_CODE_LENGTH).toString().padStart(AUTH_CODE_LENGTH, '0');
}

/**
 * One-way hash of a code. We mix in a server secret (HMAC) because there are only
 * a million possible codes, so a plain hash could be reversed instantly by trying them all.
 */
export function hashCode(code: string): string {
  return createHmac('sha256', env.JWT_ACCESS_SECRET).update(code).digest('hex');
}

/** Compare two hashes in constant time (so response timing can't leak information). */
export function hashesMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}
