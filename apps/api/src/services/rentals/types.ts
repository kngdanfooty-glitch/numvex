import type { RentalCountry } from '@numvexs/shared';

/* What a rental provider must offer. rentals.service.ts only talks to this. */
export interface ProviderRentalOption {
  id: string;
  label: string;
  days: number;
  /** The provider's price, in dollars. */
  usd: number;
}

export interface ProviderSms {
  id: string;
  from: string | null;
  text: string;
  code: string | null;
  receivedAt: Date;
}

export interface RentalProvider {
  countries(): Promise<RentalCountry[]>;
  options(country: string): Promise<ProviderRentalOption[]>;
  /**
   * Rent a number. `maxUsd` is the price we charged against: refuse (409 price_changed) if the provider's live price is higher.
   * Throws AppError code 'purchase_unclear' when the provider may have sold it but we could not confirm: the caller keeps the money held.
   */
  rent(optionId: string, country: string, maxUsd: number): Promise<{ ref: string; number: string; expiresAt: Date }>;
  /** Add time. Returns the new end date when the provider says it. Same 'purchase_unclear' rule. */
  extend(ref: string, optionId: string, country: string, maxUsd: number): Promise<{ expiresAt?: Date }>;
  /** Every message received so far (newest or oldest first, either is fine). */
  messages(ref: string, number: string): Promise<ProviderSms[]>;
}
