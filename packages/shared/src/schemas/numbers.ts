import { z } from 'zod';

/*
 * Virtual-number servers (the providers we resell). They live on two pages:
 *  - USA_SERVERS: the USA-only ones, on their own page (/dashboard/usa), one card each.
 *  - NUMBER_SERVERS: every other server, one tab each on /dashboard/numbers.
 * A page only asks a server for its country + service lists when that server is opened.
 */
export const USA_SERVERS = [
  { id: 'daisysms', label: 'Server 1' },
  { id: 'textverified', label: 'Server 2' },
] as const;

export const NUMBER_SERVERS = [
  { id: 'manesms', label: 'Server 1' },
  { id: 'smspool', label: 'Server 2' },
  { id: 'herosms', label: 'Server 3' },
  { id: 'fivesim', label: 'Server 4' },
  { id: 'juicysms', label: 'Server 5' },
  { id: 'smsbower', label: 'Server 6' },
] as const;

export type UsaServerId = (typeof USA_SERVERS)[number]['id'];
export type NumberServerId = UsaServerId | (typeof NUMBER_SERVERS)[number]['id'];

const ALL_SERVER_IDS = [...USA_SERVERS, ...NUMBER_SERVERS].map((s) => s.id);
export const numberServerIdSchema = z.enum(ALL_SERVER_IDS as [string, ...string[]]);

/** Same shape for every server, whatever the provider sends back. */
export interface CatalogItem {
  id: string;
  name: string;
  /** Present when the server's list call already carries prices (DaisySMS does). */
  costKobo?: number;
  stock?: number;
}
export interface NumberCatalog {
  server: NumberServerId;
  countries: CatalogItem[];
  services: CatalogItem[];
}

/** Servers where buying is built end to end (the rest only list their catalogue). */
export const BUYABLE_SERVERS: readonly NumberServerId[] = ['daisysms', 'textverified', 'herosms', 'smsbower', 'smspool', 'juicysms', 'fivesim', 'manesms'];

export interface NumberQuote {
  /** The price (the cheapest, when `tiers` is set). */
  costKobo: number;
  /** null when the server doesn't publish stock (TextVerified). */
  stock: number | null;
  /** Set by servers that sell the same number at several prices (HeroSMS): pick one and send its `id` when buying. */
  tiers?: { id: string; costKobo: number; stock: number; note?: string }[];
}

export type ActivationStatus = 'pending' | 'completed' | 'cancelled';

/** What the API returns for a bought number. */
export interface NumberActivation {
  id: string;
  server: NumberServerId;
  number: string;
  service: string;
  country: string;
  costKobo: number;
  status: ActivationStatus;
  code: string | null;
  expiresAt: string;
  createdAt: string;
}
