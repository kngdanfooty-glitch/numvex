import { z } from 'zod';

/*
 * The user's money history: every bank deposit, every purchase (numbers, boost, eSIMs, rentals, Telegram) and every refund, newest first.
 * There is no separate ledger: each entry is read from the record that already exists (an order, a deposit).
 */
export const HISTORY_KINDS = ['deposit', 'number', 'boost', 'esim', 'rental', 'telegram'] as const;
export type HistoryKind = (typeof HISTORY_KINDS)[number];

export type HistoryType = 'deposit' | 'purchase' | 'refund';

export interface HistoryEntry {
  /** Unique per entry, e.g. "boost:<orderId>:refund". */
  id: string;
  kind: HistoryKind;
  type: HistoryType;
  title: string;
  detail: string | null;
  /** Signed, in kobo: money in is positive (deposit, refund), money out is negative (purchase). */
  amountKobo: number;
  createdAt: string;
}

/** `before` is the `nextBefore` of the previous page: it asks for the entries older than that moment. */
export const historyQuerySchema = z.object({
  before: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(30),
});
export type HistoryQuery = z.infer<typeof historyQuerySchema>;

export interface HistoryPage {
  entries: HistoryEntry[];
  /** Pass this as `before` to get the next page; null when there is nothing older. */
  nextBefore: string | null;
}
