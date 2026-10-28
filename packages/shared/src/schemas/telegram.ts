import { z } from 'zod';

/*
 * Telegram Premium and Stars, delivered to a Telegram username by GramSubs.
 * Premium is bought by months, Stars by a number of stars. The buyer types the username, checks who it is, then buys.
 */
export const TELEGRAM_SERVICES = ['premium', 'stars'] as const;
export type TelegramService = (typeof TELEGRAM_SERVICES)[number];

export const PREMIUM_MONTHS = [3, 6, 12] as const;
export const STARS_PACKS = [50, 100, 500, 1000, 2500] as const;

/** Telegram usernames: 5 to 32 letters, digits or underscores (the @ is optional when typing). */
export const telegramUsernameSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/^@/, ''))
  .pipe(z.string().regex(/^[A-Za-z0-9_]{5,32}$/, 'Enter a valid Telegram username (5 to 32 letters, numbers or underscores).'));

/** Exactly one of `months` (premium) or `quantity` (stars) is meant to be set; `units` is whichever it is. */
const productFields = {
  service: z.enum(TELEGRAM_SERVICES),
  units: z.coerce.number().int().positive(),
  username: telegramUsernameSchema,
};

const checkUnits = (v: { service: TelegramService; units: number }) =>
  v.service === 'premium' ? (PREMIUM_MONTHS as readonly number[]).includes(v.units) : (STARS_PACKS as readonly number[]).includes(v.units);
const unitsMessage = { message: 'Pick one of the listed plans.', path: ['units'] };

export const telegramQuoteSchema = z.object(productFields).refine(checkUnits, unitsMessage);
export type TelegramQuoteQuery = z.infer<typeof telegramQuoteSchema>;

export const placeTelegramOrderSchema = z
  .object({ ...productFields, requestId: z.string().trim().min(8).max(64) })
  .refine(checkUnits, unitsMessage);
export type PlaceTelegramOrderBody = z.infer<typeof placeTelegramOrderSchema>;

/** Who the username belongs to and what it costs, before anything is bought. */
export interface TelegramQuote {
  recipient: string;
  name: string | null;
  photo: string | null;
  /** Our price in kobo. */
  priceKobo: number;
}

/*
 * placing    we have the money and are asking the supplier
 * processing the supplier has it and has not delivered yet
 * delivered  done
 * failed     refused or failed: the money went back
 * review     we could not tell whether the supplier took the order: the money is held until it is checked
 */
export type TelegramOrderStatus = 'placing' | 'processing' | 'delivered' | 'failed' | 'review';

export interface TelegramOrder {
  id: string;
  service: TelegramService;
  units: number;
  recipient: string;
  costKobo: number;
  status: TelegramOrderStatus;
  createdAt: string;
}
