import type { PricingSettings, ServiceKey, ServiceSettings } from '@numvexs/shared';
import { env } from '../config/env.js';
import { AppError } from '../lib/errors.js';
import { Settings } from '../models/Settings.js';

/*
 * Live settings. Prices and service switches are edited in the admin panel and stored in the database, but the rest of the code
 * reads them synchronously from memory (`rates()`), refreshed at start-up, every 30 seconds, and the moment an admin saves.
 * Anything not set in the database falls back to the .env value.
 */
const fromEnv = (): PricingSettings => ({
  usdNgnRate: env.USD_NGN_RATE,
  eurUsdRate: env.EUR_USD_RATE,
  numberMarkupPercent: env.NUMBER_MARKUP_PERCENT,
  boostMarkupPercent: env.BOOST_MARKUP_PERCENT,
  esimMarkupPercent: env.ESIM_MARKUP_PERCENT,
  rentalMarkupPercent: env.RENTAL_MARKUP_PERCENT,
  telegramMarkupPercent: env.TELEGRAM_MARKUP_PERCENT,
});
const defaultServices = (): ServiceSettings => ({
  toggles: { numbers: true, boost: true, esim: true, rentals: true, telegram: true, deposits: true },
  disabledServers: [],
});

let currentRates: PricingSettings = fromEnv();
let currentServices: ServiceSettings = defaultServices();
let loadedAt = 0;
const TTL_MS = 30_000;

/** The prices in force right now. */
export const rates = (): PricingSettings => currentRates;
export const serviceSettings = (): ServiceSettings => currentServices;

/** Read the settings document into memory. If it fails, the previous values simply stay in force. */
export async function loadSettings(): Promise<void> {
  const doc = await Settings.findOne({ key: 'main' }).lean();
  const base = fromEnv();
  const r = (doc?.rates ?? {}) as Partial<PricingSettings>;
  currentRates = {
    usdNgnRate: r.usdNgnRate ?? base.usdNgnRate,
    eurUsdRate: r.eurUsdRate ?? base.eurUsdRate,
    numberMarkupPercent: r.numberMarkupPercent ?? base.numberMarkupPercent,
    boostMarkupPercent: r.boostMarkupPercent ?? base.boostMarkupPercent,
    esimMarkupPercent: r.esimMarkupPercent ?? base.esimMarkupPercent,
    rentalMarkupPercent: r.rentalMarkupPercent ?? base.rentalMarkupPercent,
    telegramMarkupPercent: r.telegramMarkupPercent ?? base.telegramMarkupPercent,
  };
  const t = (doc?.toggles ?? {}) as Partial<Record<ServiceKey, boolean>>;
  currentServices = {
    toggles: { numbers: t.numbers ?? true, boost: t.boost ?? true, esim: t.esim ?? true, rentals: t.rentals ?? true, telegram: t.telegram ?? true, deposits: t.deposits ?? true },
    disabledServers: doc?.disabledServers ?? [],
  };
  loadedAt = Date.now();
}

/** Keep the in-memory copy fresh without making every request wait for the database. */
export function refreshIfStale(): void {
  if (Date.now() - loadedAt > TTL_MS) {
    loadedAt = Date.now(); // one refresh at a time
    loadSettings().catch((err) => console.error('[settings] refresh failed:', (err as Error).message));
  }
}

export async function savePricing(p: PricingSettings) {
  await Settings.findOneAndUpdate({ key: 'main' }, { $set: { rates: p } }, { upsert: true });
  await loadSettings();
}

export async function saveServices(s: ServiceSettings) {
  await Settings.findOneAndUpdate({ key: 'main' }, { $set: { toggles: s.toggles, disabledServers: s.disabledServers } }, { upsert: true });
  await loadSettings();
}

/** For tests: back to the .env values with everything on. */
export function resetSettingsForTests() {
  currentRates = fromEnv();
  currentServices = defaultServices();
  loadedAt = Date.now();
}

/** Throws a plain 503 when buying this service (or this server of it) is switched off. */
export function assertServiceOn(service: ServiceKey, server?: string): void {
  refreshIfStale();
  const s = currentServices;
  const off = !s.toggles[service];
  const serverOff = !!server && s.disabledServers.includes(`${service}:${server}`);
  if (off || serverOff) {
    throw new AppError(
      503,
      'service_unavailable',
      serverOff && !off ? 'This server is temporarily unavailable. Try another server.' : 'This service is temporarily unavailable. Please try again later.',
    );
  }
}
