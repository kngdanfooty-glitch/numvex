import { z } from 'zod';

/*
 * The admin page: the few cases that need a person. Every action here moves money or settles an order, so each needs a written
 * reason, and each is recorded (who, what, how much, why) in an audit log nobody can edit from the app.
 */
export const reasonSchema = z.string().trim().min(3, 'Write a short reason (at least 3 characters).').max(300, 'Keep the reason under 300 characters.');
/** Someone's email or username, as the admin types it. */
export const whoSchema = z.string().trim().min(2, 'Enter the user\'s email or username.').max(120);

/** The biggest single manual change: a typo (an extra zero) can't move more than this. */
export const MAX_ADJUSTMENT_KOBO = 100_000_000; // ₦1,000,000

export const creditDepositSchema = z.object({ user: whoSchema, reason: reasonSchema });
export type CreditDepositBody = z.infer<typeof creditDepositSchema>;

export const adjustWalletSchema = z.object({
  user: whoSchema,
  direction: z.enum(['credit', 'debit']),
  amountKobo: z.number().int().positive().max(MAX_ADJUSTMENT_KOBO, 'That is more than one adjustment may move.'),
  reason: reasonSchema,
});
export type AdjustWalletBody = z.infer<typeof adjustWalletSchema>;

export const resolveTelegramSchema = z.object({ outcome: z.enum(['delivered', 'refund']), reason: reasonSchema });
export type ResolveTelegramBody = z.infer<typeof resolveTelegramSchema>;

export interface UnmatchedDeposit {
  id: string;
  reference: string;
  amountKobo: number;
  description: string | null;
  createdAt: string;
}

export interface AdminAction {
  id: string;
  admin: string;
  action: string;
  user: string | null;
  amountKobo: number | null;
  reason: string;
  createdAt: string;
}

export interface ReviewTelegramOrder {
  id: string;
  user: string;
  service: 'premium' | 'stars';
  units: number;
  recipient: string;
  costKobo: number;
  createdAt: string;
}
