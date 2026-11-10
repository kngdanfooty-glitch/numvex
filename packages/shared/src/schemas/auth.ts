import { z } from 'zod';
import { phoneSchema } from './phone';
import { isBrandEmail, isReservedUsername } from './reserved';

/*
 * Auth validation rules — written ONCE here, used by BOTH the web forms and the
 * API. If a rule changes, it changes everywhere, so client and server can't drift.
 */

export const AUTH_CODE_LENGTH = 6;

/* ---------- single fields ---------- */

// Trim + lowercase first, so "  Bob@Mail.com " and "bob@mail.com" are the same account.
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, 'Email is too long.')
  .pipe(z.email('Enter a valid email address.'));

// 3–15 characters, letters/numbers/underscore/dot/dash. Stored lowercase.
export const usernameSchema = z
  .string('Choose a username.')
  .trim()
  .min(1, 'Choose a username.')
  .regex(/^[a-zA-Z0-9_.-]{3,15}$/, '3–15 characters: letters, numbers, _ . -');

// Max 128 stops someone sending a 10 MB "password" to burn CPU while hashing.
export const passwordSchema = z
  .string()
  .min(8, 'Use at least 8 characters.')
  .max(128, 'Password is too long (max 128 characters).')
  .regex(/[A-Za-z]/, 'Include at least one letter.')
  .regex(/\d/, 'Include at least one number.');

// Exactly 6 digits, e.g. "042913".
export const codeSchema = z
  .string()
  .regex(new RegExp(`^\\d{${AUTH_CODE_LENGTH}}$`), `Enter the ${AUTH_CODE_LENGTH}-digit code.`);

/* ---------- Where a sign-up came from ---------- */

/**
 * Nobody is asked any more: the source comes from the link they arrived on (`?source=tiktok`, or `utm_source`), remembered by the web app.
 * Any short slug is accepted, so a new campaign needs no code change. These are just the nicer names the admin shows for known ones.
 */
export const HEARD_FROM_OPTIONS = [
  { value: 'tiktok', label: 'TikTok' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'x', label: 'X (Twitter)' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'friend', label: 'A friend' },
  { value: 'other', label: 'Other' },
] as const;

/** The words for a stored answer (and for "no answer": accounts made before the question existed). */
export const heardFromLabel = (v: string | null | undefined): string =>
  v ? (HEARD_FROM_OPTIONS.find((o) => o.value === v)?.label ?? v) : "Didn't say";

export type HeardFrom = string;

/** A source slug: lowercase letters, digits, `_` or `-`. Anything else in a link (junk, objects, long text) is dropped rather than blocking sign-up. */
export const sourceSchema = z.preprocess((v) => {
  if (typeof v !== 'string') return undefined;
  const slug = v.trim().toLowerCase();
  return /^[a-z0-9][a-z0-9_-]{0,31}$/.test(slug) ? slug : undefined;
}, z.string().optional());

/* ---------- request bodies (one per endpoint) ---------- */

// For creating an account only (login keeps accepting whatever exists): no names or addresses that pass for ours or for staff.
const newEmailSchema = emailSchema.refine((e) => !isBrandEmail(e), 'Please use your own personal email address.');
const newUsernameSchema = usernameSchema.refine((u) => !isReservedUsername(u), 'That username is not available. Please choose another.');

export const registerSchema = z.object({
  email: newEmailSchema,
  phone: phoneSchema,
  password: passwordSchema,
  username: newUsernameSchema,
  referralCode: z.string().trim().max(32).optional(),
  // Optional: taken from the link (`?source=tiktok`). It feeds the admin's "Where sign-ups come from" report.
  heardFrom: sourceSchema,
});

export const loginSchema = z.object({
  // Email OR username, so we only check it isn't empty/huge.
  identifier: z.string().trim().min(1, 'Enter your email or username.').max(254),
  password: z.string().min(1, 'Enter your password.').max(128),
});

export const verifyEmailSchema = z.object({ email: emailSchema, code: codeSchema });
export const resendVerificationSchema = z.object({ email: emailSchema });
export const forgotPasswordSchema = z.object({ email: emailSchema });
export const resetPasswordSchema = z.object({
  email: emailSchema,
  code: codeSchema,
  password: passwordSchema,
});

// Signed-in user changing their own password: must know the current one, and pick a different new one.
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password.').max(128),
    newPassword: passwordSchema,
  })
  .refine((v) => v.currentPassword !== v.newPassword, {
    path: ['newPassword'],
    message: 'Choose a different password from your current one.',
  });

/* ---------- TypeScript types come FROM the schemas ---------- */

export type RegisterBody = z.infer<typeof registerSchema>;
export type LoginBody = z.infer<typeof loginSchema>;
export type VerifyEmailBody = z.infer<typeof verifyEmailSchema>;
export type ResendVerificationBody = z.infer<typeof resendVerificationSchema>;
export type ForgotPasswordBody = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordBody = z.infer<typeof resetPasswordSchema>;
export type ChangePasswordBody = z.infer<typeof changePasswordSchema>;

/* ---------- response shapes ---------- */

export interface PublicUser {
  id: string;
  email: string;
  username: string;
  /** Nigerian mobile number in the standard form (+234…). Older accounts may not have one. */
  phone: string | null;
  role: 'user' | 'admin';
  status: 'active' | 'suspended';
  isVerified: boolean;
  balanceKobo: number;
  twoFactorEnabled: boolean;
  createdAt: string;
}

export interface AuthResponse {
  user: PublicUser;
}

/** Every API error looks like this. */
export interface ErrorResponse {
  error: { code: string; message: string; details?: unknown };
}

/* ---------- 2FA (the login screen supports it; the API side comes later) ---------- */

export interface TwoFactorRequiredResponse {
  twoFactorRequired: true;
  pendingToken: string;
}
export type LoginResponse = AuthResponse | TwoFactorRequiredResponse;

export interface VerifyTwoFactorBody {
  pendingToken: string;
  code: string;
}
