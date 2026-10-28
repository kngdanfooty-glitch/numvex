import { z } from 'zod';
import { phoneSchema } from './phone';

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

/* ---------- request bodies (one per endpoint) ---------- */

export const registerSchema = z.object({
  email: emailSchema,
  phone: phoneSchema,
  password: passwordSchema,
  username: usernameSchema,
  referralCode: z.string().trim().max(32).optional(),
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
