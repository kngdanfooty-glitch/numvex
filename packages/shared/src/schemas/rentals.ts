import { z } from 'zod';

/*
 * Number rentals: a phone number that is yours for days or months and receives every SMS sent to it (one-time numbers last minutes).
 * Bought once, extended by hand (no auto-renew), never refunded after the provider handed the number over.
 * The page asks one server for its countries, then for that country's rental lengths.
 */
export const RENTAL_SERVERS = [
  { id: 'r1', label: 'Server 1' },
  { id: 'r2', label: 'Server 2' },
] as const;

export type RentalServerId = (typeof RENTAL_SERVERS)[number]['id'];
export const rentalServerIdSchema = z.enum(RENTAL_SERVERS.map((s) => s.id) as [string, ...string[]]);

export interface RentalCountry {
  id: string;
  name: string;
}

/** One rental length for sale ("30 days"). `id` is what the buyer sends back to choose it. */
export interface RentalOption {
  id: string;
  label: string;
  days: number;
  /** Our price in kobo. */
  priceKobo: number;
}

export type RentalStatus = 'placing' | 'active' | 'expired' | 'failed';

export interface RentalMessage {
  id: string;
  from: string | null;
  text: string;
  /** The code in the text, when we could find one. */
  code: string | null;
  receivedAt: string;
}

export interface Rental {
  id: string;
  server: RentalServerId | 'retired';
  countryId: string;
  countryName: string;
  number: string;
  /** What was bought first ("30 days"), and the total days now (after extensions). */
  label: string;
  totalDays: number;
  /** All the user paid for this rental, extensions included. */
  costKobo: number;
  status: RentalStatus;
  createdAt: string;
  expiresAt: string | null;
  /** Newest first. Only on a single rental (GET /rentals/:id), never in the list. */
  messages: RentalMessage[];
  messageCount: number;
}

/** What the page sends to rent. `requestId` is made up per purchase, so a double-click can't buy two. */
export const placeRentalSchema = z.object({
  option: z.string().trim().min(1).max(32),
  country: z.string().trim().min(1).max(16),
  requestId: z.string().trim().min(8).max(64),
});
export type PlaceRentalBody = z.infer<typeof placeRentalSchema>;

export const extendRentalSchema = z.object({
  option: z.string().trim().min(1).max(32),
  requestId: z.string().trim().min(8).max(64),
});
export type ExtendRentalBody = z.infer<typeof extendRentalSchema>;
