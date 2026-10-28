import type { EsimServerId, RentalServerId } from '@numvexs/shared';
import { badRequest } from './errors.js';

/*
 * Which provider is behind each eSIM / rental server. Only the API knows this: the browser only ever sees the neutral ids
 * ("e1", "r1") in addresses and replies, never a provider's name. The database keeps the provider's name.
 */
export const ESIM_PROVIDERS = {
  e1: 'smspool',
} as const satisfies Record<EsimServerId, string>;

export const RENTAL_PROVIDERS = {
  r1: 'textverified',
  r2: 'juicysms',
} as const satisfies Record<RentalServerId, string>;

export type RentalSource = (typeof RENTAL_PROVIDERS)[RentalServerId];
export type EsimSource = (typeof ESIM_PROVIDERS)[EsimServerId];

function directions<P extends string, S extends string>(map: Record<S, P>) {
  const back = new Map<string, S>(Object.entries(map).map(([s, p]) => [p as string, s as S]));
  return {
    /** The neutral id from the address -> the provider. An unknown id is a plain 400. */
    provider: (server: string): P => {
      if (!Object.hasOwn(map, server)) throw badRequest('unknown_server', 'Unknown server.');
      return map[server as S];
    },
    /** The provider stored in the database -> the neutral id the browser may see. */
    publicId: (provider: string): S => {
      const s = back.get(provider);
      if (!s) throw new Error(`no public server id for provider "${provider}"`);
      return s;
    },
    /** Like publicId, but for old rows whose provider has since been removed: shows a neutral placeholder. */
    publicIdOrRetired: (provider: string): S | 'retired' => back.get(provider) ?? 'retired',
    /** Like publicId, but undefined instead of throwing (for converting old saved settings). */
    tryPublicId: (provider: string): S | undefined => back.get(provider),
  };
}

export const esimServers = directions<EsimSource, EsimServerId>(ESIM_PROVIDERS);
export const rentalServers = directions<RentalSource, RentalServerId>(RENTAL_PROVIDERS);
