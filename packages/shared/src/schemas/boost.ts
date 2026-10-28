import { z } from 'zod';

/*
 * Boosting (social media services). Three SMM panels, all speaking the same standard "v2" API, one tab each.
 * The page asks one server for its service list when it is opened, and shows the first server by default.
 */
export const BOOST_SERVERS = [
  { id: 'morethanpanel', label: 'Server 1' },
  { id: 'peakerr', label: 'Server 2' },
  { id: 'resellersmm', label: 'Server 3' },
] as const;

export type BoostServerId = (typeof BOOST_SERVERS)[number]['id'];
export const boostServerIdSchema = z.enum(BOOST_SERVERS.map((s) => s.id) as [string, ...string[]]);

export type PlatformId =
  | 'instagram'
  | 'facebook'
  | 'tiktok'
  | 'youtube'
  | 'twitter'
  | 'telegram'
  | 'discord'
  | 'linkedin'
  | 'snapchat'
  | 'spotify'
  | 'twitch'
  | 'kick'
  | 'threads'
  | 'whatsapp'
  | 'pinterest'
  | 'reddit'
  | 'soundcloud'
  | 'audiomack'
  | 'rumble'
  | 'vk'
  | 'google'
  | 'website'
  | 'other';

export interface SmmService {
  /** The panel's own service id (unique within one server). */
  id: string;
  name: string;
  min: number;
  max: number;
  /** Our price for 1,000 units, in kobo. */
  ratePer1kKobo: number;
}

export interface SmmCategory {
  id: string;
  name: string;
  services: SmmService[];
}

export interface SmmPlatform {
  id: PlatformId;
  name: string;
  categories: SmmCategory[];
}

export interface BoostCatalog {
  server: BoostServerId;
  platforms: SmmPlatform[];
}

/*
 * Placing and following a boost order.
 */
export const BOOST_ORDER_STATUSES = ['placing', 'pending', 'in_progress', 'completed', 'partial', 'canceled', 'failed'] as const;
export type BoostOrderStatus = (typeof BOOST_ORDER_STATUSES)[number];

/** What the page sends. `requestId` is made up by the page for each order form, so a double-click can't charge twice. */
export const placeBoostOrderSchema = z.object({
  service: z.string().trim().min(1).max(32),
  link: z.url('Enter a valid link, starting with https://').max(500),
  quantity: z.coerce.number('Enter a quantity.').int('Quantity must be a whole number.').positive('Enter a quantity.'),
  requestId: z.string().trim().min(8).max(64),
});
export type PlaceBoostOrderBody = z.infer<typeof placeBoostOrderSchema>;

/** What the API returns for a boost order. */
export interface BoostOrder {
  id: string;
  server: BoostServerId;
  serviceName: string;
  link: string;
  quantity: number;
  /** What the user paid, in kobo. */
  costKobo: number;
  /** Given back so far (a cancelled order, or the undelivered part of a partial one), in kobo. */
  refundedKobo: number;
  status: BoostOrderStatus;
  /** The panel's own words for the status ("In progress"), when we have them. */
  panelStatus: string | null;
  startCount: number | null;
  /** How many are still undelivered, when the panel says. */
  remains: number | null;
  createdAt: string;
}
