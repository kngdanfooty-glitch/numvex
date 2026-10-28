import { z } from 'zod';

/*
 * eSIMs: travel/data plans delivered as a QR code. One provider (SMSPool). Add another entry here, and its provider file, to bring back a server dropdown.
 * The page asks one server for its countries, then for that country's plans, when they are picked.
 */
export const ESIM_SERVERS = [
  { id: 'e1', label: 'Server 1' },
] as const;

export type EsimServerId = (typeof ESIM_SERVERS)[number]['id'];
export const esimServerIdSchema = z.enum(ESIM_SERVERS.map((s) => s.id) as [string, ...string[]]);

export interface EsimCountry {
  id: string;
  name: string;
}

export interface EsimPlan {
  id: string;
  dataGb: number;
  days: number;
  /** Our price in kobo. */
  priceKobo: number;
  /** The networks it runs on, in a few words ("Verizon 5G, AT&T 5G"). */
  network: string | null;
  speed: string | null;
}

/** What the buyer needs to install the eSIM. Only ever sent to the person who bought it. */
export interface EsimDetails {
  /** The full activation string ("LPA:1$..."): turn it into the QR code. */
  lpa: string | null;
  /** Or the provider's own ready-made QR image. */
  qrUrl: string | null;
  /** For installing by hand instead of scanning. */
  smdp: string | null;
  activationCode: string | null;
  apn: string | null;
  instructions: string | null;
  remainingData: string | null;
  totalData: string | null;
}

export type EsimOrderStatus = 'placing' | 'active' | 'failed';

export interface EsimOrder {
  id: string;
  server: EsimServerId;
  countryName: string;
  planSummary: string;
  costKobo: number;
  status: EsimOrderStatus;
  createdAt: string;
  /** Only on a single order (GET /orders/:id), never in the list. */
  details: EsimDetails | null;
}

/** What the page sends. `requestId` is made up per purchase, so a double-click can't buy two. */
export const placeEsimOrderSchema = z.object({
  plan: z.string().trim().min(1).max(64),
  country: z.string().trim().min(1).max(64),
  requestId: z.string().trim().min(8).max(64),
});
export type PlaceEsimOrderBody = z.infer<typeof placeEsimOrderSchema>;
