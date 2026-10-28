import argon2 from 'argon2';
import type { Response } from 'express';
import type {
  ChangePasswordBody,
  ForgotPasswordBody,
  LoginBody,
  RegisterBody,
  ResendVerificationBody,
  ResetPasswordBody,
  VerifyEmailBody,
} from '@numvexs/shared';
import { AuthCode } from '../models/AuthCode.js';
import { RefreshToken } from '../models/RefreshToken.js';
import { User } from '../models/User.js';
import { badRequest, conflict, forbidden, tooMany, unauthorized } from '../lib/errors.js';
import { generateCode, hashCode, hashesMatch } from '../lib/codes.js';
import { sendCodeEmail, type CodePurpose } from '../lib/mailer.js';
import { sha256, startSession } from '../lib/tokens.js';

const CODE_TTL_MINUTES = 10; // a code stops working after this long
const MAX_CODE_ATTEMPTS = 5; // wrong guesses allowed before the code is destroyed
const RESEND_COOLDOWN_SECONDS = 30; // minimum gap between two emails to the same person

/* ------------------------------------------------------------------ */
/* Codes: create + email one, and check one                            */
/* ------------------------------------------------------------------ */

/**
 * Create a fresh 6-digit code for this email and send it.
 * If we already sent one a few seconds ago we quietly do nothing — that stops anyone
 * from using us to spam somebody's inbox.
 */
async function sendCode(email: string, purpose: CodePurpose) {
  const existing = await AuthCode.findOne({ email, purpose });
  if (existing && Date.now() - existing.sentAt.getTime() < RESEND_COOLDOWN_SECONDS * 1000) return;

  const code = generateCode();

  // upsert = "update the existing row, or create it if there isn't one" (so one code per email+purpose)
  await AuthCode.findOneAndUpdate(
    { email, purpose },
    {
      codeHash: hashCode(code),
      attempts: 0,
      sentAt: new Date(),
      expiresAt: new Date(Date.now() + CODE_TTL_MINUTES * 60_000),
    },
    { upsert: true },
  );

  await sendCodeEmail(email, purpose, code, CODE_TTL_MINUTES);
}

/**
 * Check a code the user typed. Returns normally if it's right (and uses it up),
 * throws an error if it's wrong, expired, or guessed too many times.
 */
async function checkCode(email: string, purpose: CodePurpose, code: string) {
  const record = await AuthCode.findOne({ email, purpose });

  // Same message for "no code" and "expired" so we don't reveal anything.
  if (!record || record.expiresAt.getTime() < Date.now()) {
    throw badRequest('invalid_code', 'That code is invalid or has expired.');
  }

  if (record.attempts >= MAX_CODE_ATTEMPTS) {
    await record.deleteOne(); // too many guesses: they must request a new code
    throw tooMany('too_many_attempts', 'Too many wrong attempts. Please request a new code.');
  }

  if (!hashesMatch(record.codeHash, hashCode(code))) {
    record.attempts += 1;
    await record.save();
    throw badRequest('invalid_code', 'That code is invalid or has expired.');
  }

  await record.deleteOne(); // a code can only be used once
}

/* ------------------------------------------------------------------ */
/* Register                                                            */
/* ------------------------------------------------------------------ */

export async function register(body: RegisterBody, res: Response) {
  const { email, phone, password, referralCode } = body;

  // One account per email, verified or not. Someone else's half-finished sign-up is never overwritten:
  // its owner can sign in with their password to get a new code and finish verifying.
  const existing = await User.exists({ email });
  if (existing) throw conflict('email_taken', 'An account with this email already exists.'); // same words either way: it doesn't reveal who has verified

  const { username } = body; // kept exactly as typed, capitals included
  const usernameLower = username.toLowerCase();
  if (await User.exists({ usernameLower })) {
    throw conflict('username_taken', 'That username is already taken.');
  }

  if (await User.exists({ phone })) {
    throw conflict('phone_taken', 'An account with this phone number already exists.');
  }

  const passwordHash = await argon2.hash(password); // never store the plain password

  const user = await User.create({
    email,
    phone,
    username,
    usernameLower,
    passwordHash,
    referredBy: referralCode || undefined,
    isVerified: true, // TEMPORARY: emails are trusted for now (no verification code). To bring verification back, remove this line and uncomment sendCode below.
  });

  // await sendCode(email, 'verify_email'); // EMAIL VERIFICATION OFF for now

  // Signed straight in, so they land on the dashboard.
  await startSession(res, user._id, user.role);
  return user;
}

/* ------------------------------------------------------------------ */
/* Verify email + resend                                               */
/* ------------------------------------------------------------------ */

export async function verifyEmail(body: VerifyEmailBody, res: Response) {
  await checkCode(body.email, 'verify_email', body.code);

  const user = await User.findOne({ email: body.email });
  if (!user) throw badRequest('invalid_code', 'That code is invalid or has expired.');

  user.isVerified = true;
  await user.save();

  // Verified -> log them straight in, so they land on the dashboard.
  await startSession(res, user._id, user.role);
  return user;
}

/** Always succeeds from the outside, so nobody can use this to discover which emails have accounts. */
export async function resendVerification(body: ResendVerificationBody) {
  const user = await User.findOne({ email: body.email });
  if (user && !user.isVerified) await sendCode(body.email, 'verify_email');
}

/* ------------------------------------------------------------------ */
/* Login / logout / refresh                                            */
/* ------------------------------------------------------------------ */

export async function login(body: LoginBody, res: Response) {
  const identifier = body.identifier.toLowerCase();

  // The identifier can be an email OR a username.
  const user = await User.findOne({ $or: [{ email: identifier }, { usernameLower: identifier }] });

  // Same message for "no such user" and "wrong password" — don't tell attackers which one it was.
  if (!user || !(await argon2.verify(user.passwordHash, body.password))) {
    throw unauthorized('invalid_credentials', 'Incorrect email/username or password.');
  }

  if (user.status === 'suspended') {
    throw forbidden('account_suspended', 'This account has been suspended.');
  }

  // EMAIL VERIFICATION OFF for now. To bring it back, delete the "mark verified" lines and uncomment the block below.
  // if (!user.isVerified) {
  //   // Correct password but email not confirmed yet: send a code and tell the web app
  //   // to show the "enter your code" page.
  //   await sendCode(user.email, 'verify_email');
  //   throw forbidden('email_not_verified', 'Please verify your email to continue.', {
  //     email: user.email,
  //   });
  // }
  if (!user.isVerified) {
    // An account made before verification was switched off: let them in and mark it verified.
    user.isVerified = true;
    await user.save();
  }

  await startSession(res, user._id, user.role);
  return user;
}

export async function logout(refreshToken: string | undefined) {
  if (refreshToken) await RefreshToken.deleteOne({ tokenHash: sha256(refreshToken) });
}

/** Swap a valid refresh token for a brand-new session (the old one is deleted: "rotation"). */
export async function refresh(refreshToken: string | undefined, res: Response) {
  const invalid = unauthorized('invalid_session', 'Your session has expired. Please sign in again.');
  if (!refreshToken) throw invalid;

  const session = await RefreshToken.findOneAndDelete({ tokenHash: sha256(refreshToken) });
  if (!session || session.expiresAt.getTime() < Date.now()) throw invalid;

  const user = await User.findById(session.userId);
  if (!user || user.status !== 'active') throw invalid;

  await startSession(res, user._id, user.role);
}

/* ------------------------------------------------------------------ */
/* Forgot / reset password                                             */
/* ------------------------------------------------------------------ */

/** Also always "succeeds" from the outside, for the same privacy reason as resendVerification. */
export async function forgotPassword(body: ForgotPasswordBody) {
  const user = await User.findOne({ email: body.email });
  if (user) await sendCode(body.email, 'reset_password');
}

export async function resetPassword(body: ResetPasswordBody) {
  await checkCode(body.email, 'reset_password', body.code);

  const user = await User.findOne({ email: body.email });
  if (!user) throw badRequest('invalid_code', 'That code is invalid or has expired.');

  user.passwordHash = await argon2.hash(body.password);
  await user.save();

  // Sign out everywhere: if someone else had access, they lose it now.
  await RefreshToken.deleteMany({ userId: user._id });
}

/* ------------------------------------------------------------------ */
/* Change password (signed in)                                         */
/* ------------------------------------------------------------------ */

export async function changePassword(userId: string, body: ChangePasswordBody, res: Response) {
  const user = await User.findById(userId);
  if (!user) throw unauthorized('unauthenticated', 'Please sign in.');

  // 400 (not 401) on purpose: a 401 would make the web app think the SESSION expired.
  if (!(await argon2.verify(user.passwordHash, body.currentPassword))) {
    throw badRequest('invalid_current_password', 'Your current password is incorrect.');
  }

  user.passwordHash = await argon2.hash(body.newPassword);
  await user.save();

  // Sign out every device (anyone who knew the old password loses access),
  // then give THIS device a fresh session so the user isn't kicked out.
  await RefreshToken.deleteMany({ userId: user._id });
  await startSession(res, user._id, user.role);
}
