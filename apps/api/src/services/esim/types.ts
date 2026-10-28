import type { EsimCountry, EsimDetails } from '@numvexs/shared';

/* What an eSIM provider must offer. esim.service.ts only talks to this. */
export interface ProviderPlan {
  id: string;
  dataGb: number;
  days: number;
  /** The provider's price, in dollars. */
  usd: number;
  network: string | null;
  speed: string | null;
}

export interface EsimProvider {
  countries(): Promise<EsimCountry[]>;
  plans(countryId: string): Promise<ProviderPlan[]>;
  /** Buy one plan. `ref` is the provider's id for the purchase; `details` when it already has the install data. */
  buy(planId: string, ctx: { countryId: string; email: string }): Promise<{ ref: string; details?: EsimDetails }>;
  /** The install data for a purchase we already hold. */
  details(ref: string): Promise<EsimDetails>;
}
