/*
 * What every server we can BUY from must offer. numbers.service.ts only talks to this,
 * so adding a server means writing one file that fills in these five things.
 */
export type ProviderStatus = { status: 'pending' } | { status: 'completed'; code: string } | { status: 'cancelled' };

/** What the buyer picked besides the service. `country` for servers whose prices depend on it; `tier` for servers that sell the same number at several prices. */
export interface QuoteOptions {
  country?: string;
  tier?: string;
}

/** A server that sells the same service at several prices (HeroSMS). `id` is what the buyer sends back to choose one. */
export interface PriceTier {
  id: string;
  usd: number;
  count: number;
  /** A few words shown under the price, to help choose between tiers ("Cheapest option"). */
  note?: string;
}

export interface ProviderQuote {
  /** Dollar price (the cheapest tier when there are tiers), and stock when the provider tells us (null = it doesn't or the call failed). */
  usd: number;
  count: number | null;
  tiers?: PriceTier[];
}

export interface BuyProvider {
  /** Shown on the activation, e.g. "United States". A server that sells several countries returns the real one from buy(). */
  readonly country: string;
  /** How long a number is held when the provider doesn't say. */
  readonly lifetimeMs: number;
  quote(service: string, options: QuoteOptions): Promise<ProviderQuote>;
  /** `maxUsd` is the price we charged against (the chosen tier's, if any): a ceiling so a price jump can't overcharge us. */
  buy(service: string, maxUsd: number, options: QuoteOptions): Promise<{ id: string; number: string; expiresAt?: Date; country?: string }>;
  status(id: string): Promise<ProviderStatus>;
  /** true = the provider cancelled it (so we may refund). false = it can't be cancelled (e.g. the code arrived). */
  cancel(id: string): Promise<boolean>;
  /** Optional: tell the provider we're finished with a number whose code arrived (DaisySMS status 6). */
  done?(id: string): Promise<void>;
}
