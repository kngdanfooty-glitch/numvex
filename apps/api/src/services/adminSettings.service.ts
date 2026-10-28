import { BOOST_SERVERS, ESIM_SERVERS, NUMBER_SERVERS, RENTAL_SERVERS, USA_SERVERS, type PricingSettings, type ServiceSettings } from '@numvexs/shared';
import { AdminAction } from '../models/AdminAction.js';
import { rates, savePricing, saveServices, serviceSettings } from './settings.service.js';

/* Edits to prices and service switches from the admin panel: saved, applied at once, and logged with before and after. */
const labelled = (list: readonly { id: string; label: string }[]) => list.map((s) => ({ id: s.id, label: s.label }));

export const servicesView = () => ({
  settings: serviceSettings(),
  // The servers each service can switch off one by one. (USA numbers are numbers too.)
  servers: {
    numbers: [...labelled(USA_SERVERS), ...labelled(NUMBER_SERVERS)],
    boost: labelled(BOOST_SERVERS),
    esim: labelled(ESIM_SERVERS),
    rentals: labelled(RENTAL_SERVERS),
  },
});

export async function updatePricing(adminId: string, next: PricingSettings, reason: string) {
  const before = { ...rates() };
  await savePricing(next);
  await AdminAction.create({ adminId, module: 'prices', action: 'pricing_update', reason, details: { before, after: next } });
  return rates();
}

export async function updateServices(adminId: string, next: ServiceSettings, reason: string) {
  const before = JSON.parse(JSON.stringify(serviceSettings())) as ServiceSettings;
  await saveServices({ toggles: next.toggles, disabledServers: [...new Set(next.disabledServers)] });
  await AdminAction.create({ adminId, module: 'settings', action: 'services_update', reason, details: { before, after: next } });
  return servicesView();
}
