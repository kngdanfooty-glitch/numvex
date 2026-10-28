import { Router } from 'express';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resendVerificationSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from '@numvexs/shared';
import { User } from '../models/User.js';
import { requireAuth } from '../middleware/auth.js';
import { authLimiter, codeCheckLimiter, emailCodeLimiter, loginLimiter, registerLimiter } from '../middleware/rateLimit.js';
import * as auth from '../services/auth.service.js';
import { unauthorized } from '../lib/errors.js';
import { toPublicUser } from '../lib/publicUser.js';
import { clearSessionCookies, REFRESH_COOKIE } from '../lib/tokens.js';

/*
 * Every route does the same 3 steps:
 *   1. validate the request body with the shared Zod schema (throws -> 400 if invalid)
 *   2. call the matching function in the service
 *   3. send back JSON
 * (Express 5 forwards errors from async handlers automatically, so no try/catch needed.)
 */
const router = Router();

router.post('/register', authLimiter, registerLimiter, async (req, res) => {
  const body = registerSchema.parse(req.body);
  const user = await auth.register(body, res); // signed in at once while email verification is off
  res.status(201).json({ user: toPublicUser(user) });
});

router.post('/login', authLimiter, loginLimiter, async (req, res) => {
  const body = loginSchema.parse(req.body);
  const user = await auth.login(body, res);
  res.json({ user: toPublicUser(user) });
});

router.post('/verify-email', authLimiter, codeCheckLimiter, async (req, res) => {
  const body = verifyEmailSchema.parse(req.body);
  const user = await auth.verifyEmail(body, res);
  res.json({ user: toPublicUser(user) });
});

router.post('/resend-verification', authLimiter, emailCodeLimiter, async (req, res) => {
  const body = resendVerificationSchema.parse(req.body);
  await auth.resendVerification(body);
  res.json({ ok: true });
});

router.post('/forgot-password', authLimiter, emailCodeLimiter, async (req, res) => {
  const body = forgotPasswordSchema.parse(req.body);
  await auth.forgotPassword(body);
  res.json({ ok: true });
});

router.post('/reset-password', authLimiter, codeCheckLimiter, async (req, res) => {
  const body = resetPasswordSchema.parse(req.body);
  await auth.resetPassword(body);
  res.json({ ok: true });
});

// Signed-in only (requireAuth runs first and puts the user id in res.locals).
router.post('/change-password', requireAuth, authLimiter, async (req, res) => {
  const body = changePasswordSchema.parse(req.body);
  await auth.changePassword(res.locals.userId, body, res);
  res.json({ ok: true });
});

router.post('/refresh', async (req, res) => {
  try {
    await auth.refresh(req.cookies?.[REFRESH_COOKIE], res);
    res.json({ ok: true });
  } catch (err) {
    clearSessionCookies(res); // the session is dead, so remove the stale cookies
    throw err;
  }
});

router.post('/logout', async (req, res) => {
  await auth.logout(req.cookies?.[REFRESH_COOKIE]);
  clearSessionCookies(res);
  res.json({ ok: true });
});

// "Who am I?" — the web app calls this on load to know if someone is signed in.
router.get('/me', requireAuth, async (_req, res) => {
  const user = await User.findById(res.locals.userId);
  if (!user || user.status !== 'active') throw unauthorized('unauthenticated', 'Please sign in.');
  res.json({ user: toPublicUser(user) });
});

export default router;
