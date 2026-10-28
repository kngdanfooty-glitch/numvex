import type { BoostCatalog, BoostServerId, PlatformId, SmmCategory, SmmPlatform, SmmService } from '@numvexs/shared';
import { env } from '../config/env.js';
import { AppError } from '../lib/errors.js';
import { providerFetch } from '../lib/providerFetch.js';
import { rates } from './settings.service.js';

/*
 * The three boost servers are SMM panels that all speak the same standard "v2" API:
 *   POST <panel>/api/v2   form body: key=<api key>&action=services|add|status|...
 * This file reads a panel's service list and turns it into what the page shows: platforms -> categories -> services,
 * priced in naira. (Placing orders is a later step.)
 */
const PANELS: Record<BoostServerId, { url: string; keyEnv: string }> = {
  morethanpanel: { url: 'https://morethanpanel.com/api/v2', keyEnv: 'MORETHANPANEL_API_KEY' },
  peakerr: { url: 'https://peakerr.com/api/v2', keyEnv: 'PEAKERR_API_KEY' },
  resellersmm: { url: 'https://resellersmm.com/api/v2', keyEnv: 'RESELLERSMM_API_KEY' },
};

const CACHE_MS = 10 * 60 * 1000; // a panel's list is big and rarely changes

/** The panel answered, but refused: `{"error": "..."}`. `panelMessage` is its own wording (e.g. "Incorrect link", "Not enough funds"). */
export class PanelError extends AppError {
  constructor(readonly panelMessage: string) {
    super(502, 'provider_error', 'The server did not answer properly. Try again shortly.');
  }
}

async function callPanel(server: BoostServerId, params: Record<string, string>): Promise<unknown> {
  const { url, keyEnv } = PANELS[server];
  const key = process.env[keyEnv];
  if (!key) {
    console.error(`[boost] not configured: ${keyEnv} missing`);
    throw new AppError(503, 'server_not_configured', 'This server is temporarily unavailable. Try another server.');
  }
  const res = await providerFetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: new URLSearchParams({ key, ...params }),
  });
  if (res.status === 429) throw new AppError(429, 'server_busy', 'This server is busy right now. Try again in a few seconds.');
  const json = await res.json().catch(() => null);
  const error = (json as { error?: unknown } | null)?.error;
  if (res.status === 401 || (typeof error === 'string' && /invalid api key|api key/i.test(error))) {
    // The panel does not accept OUR key: loud for us, plain for the user.
    console.error(`[boost:${server}] the API key was rejected: check ${keyEnv}`);
    throw new AppError(503, 'server_unavailable', 'This server is temporarily unavailable. Try another server.');
  }
  if (typeof error === 'string' && error) throw new PanelError(error);
  if (!res.ok || error || json === null) throw new AppError(502, 'provider_error', 'The server did not answer properly. Try again shortly.');
  return json;
}

/* ---------------- platforms ---------------- */

const PLATFORM_ORDER: { id: PlatformId; name: string; test: RegExp }[] = [
  { id: 'instagram', name: 'Instagram', test: /instagram|\binsta\b|\big\b/i },
  { id: 'facebook', name: 'Facebook', test: /facebook|\bfb\b/i },
  { id: 'tiktok', name: 'TikTok', test: /tik\s?tok/i },
  { id: 'youtube', name: 'YouTube', test: /youtube|\byt\b/i },
  { id: 'twitter', name: 'Twitter / X', test: /twitter|tweet|x\.com|(^|[^a-z])x (followers|likes|views|reposts|retweets|comments|impressions|polls)/i },
  { id: 'telegram', name: 'Telegram', test: /telegram/i },
  { id: 'discord', name: 'Discord', test: /discord/i },
  { id: 'linkedin', name: 'LinkedIn', test: /linkedin/i },
  { id: 'snapchat', name: 'Snapchat', test: /snapchat/i },
  { id: 'spotify', name: 'Spotify', test: /spotify/i },
  { id: 'twitch', name: 'Twitch', test: /twitch/i },
  { id: 'kick', name: 'Kick', test: /\bkick\b/i },
  { id: 'threads', name: 'Threads', test: /\bthreads\b/i },
  { id: 'whatsapp', name: 'WhatsApp', test: /whats\s?app/i },
  { id: 'pinterest', name: 'Pinterest', test: /pinterest/i },
  { id: 'reddit', name: 'Reddit', test: /reddit/i },
  { id: 'soundcloud', name: 'SoundCloud', test: /soundcloud/i },
  { id: 'audiomack', name: 'Audiomack', test: /audiomack/i },
  { id: 'rumble', name: 'Rumble', test: /rumble/i },
  { id: 'vk', name: 'VK', test: /\bvk\b|vkontakte/i },
  { id: 'website', name: 'Website', test: /website|web traffic|\btraffic\b|\bseo\b/i },
  { id: 'google', name: 'Google', test: /google/i },
  { id: 'other', name: 'Other', test: /.^/ },
];

/** Which platform a service belongs to: judged by its category first (panels name categories by platform), then its name. */
export function platformOf(category: string, name: string): PlatformId {
  const hit = PLATFORM_ORDER.find((p) => p.test.test(category)) ?? PLATFORM_ORDER.find((p) => p.test.test(name));
  return hit?.id ?? 'other';
}

/* ---------------- cleaning a panel's list ---------------- */

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** Panels send names with HTML codes ("Fast &amp; Cheap", "&#039;"): show the real characters. */
export function decodeEntities(text: string): string {
  let out = text;
  // Some panels encode twice ("&amp;amp;"), so go again until nothing changes (a few passes at most).
  for (let i = 0; i < 3; i++) {
    const next = out
      .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
      .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
      .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m);
    if (next === out) break;
    out = next;
  }
  return out.replace(/\s+/g, ' ').trim();
}

/**
 * Panels put fake "services" in their lists to act as section headings ("👇👇👇 DISCORD SERVICES 👇👇👇",
 * "↓↓~~~~ YouTube ~~~~↓↓", "-----------"), priced at absurd amounts. A run of 4+ decoration characters gives them away.
 */
export function isDivider(name: string): boolean {
  return /(?:👇|👆|⬇|⬆|↓|↑|[~=_*#/\\-]){4,}/u.test(name);
}

/** Nothing real costs this much per 1,000 (the dearest real ones are a few thousand dollars): it is a typo or a joke. */
const MAX_RATE_USD_PER_1K = 20_000;

/* ---------------- the panel's list -> our catalogue ---------------- */

interface PanelRow {
  service: number | string;
  name: string;
  type?: string;
  category?: string;
  rate: string | number;
  min: string | number;
  max: string | number;
}

/** Our price for 1,000, in kobo: the dollar rate x the naira rate, plus our markup. */
export function ratePer1kKobo(rateUsd: number): number {
  return Math.max(1, Math.round(rateUsd * rates().usdNgnRate * (1 + rates().boostMarkupPercent / 100) * 100));
}

export function buildCatalog(server: BoostServerId, rows: PanelRow[]): BoostCatalog {
  const byPlatform = new Map<PlatformId, Map<string, SmmService[]>>();
  for (const r of rows) {
    // Only plain "link + quantity" services for now (custom-comment, subscription and package types need more fields).
    if (r.type && r.type.toLowerCase() !== 'default') continue;
    const rate = Number(r.rate);
    const min = Number(r.min);
    const max = Number(r.max);
    const name = decodeEntities(String(r.name ?? ''));
    if (!(rate > 0) || rate > MAX_RATE_USD_PER_1K || !(min > 0) || !(max >= min) || !name || isDivider(name)) continue;

    const category = decodeEntities(r.category ?? '') || 'Other';
    if (isDivider(category)) continue;
    const platform = platformOf(category, name);
    if (platform === 'discord') continue; // not sold here
    const categories = byPlatform.get(platform) ?? new Map<string, SmmService[]>();
    categories.set(category, [...(categories.get(category) ?? []), { id: String(r.service), name, min, max, ratePer1kKobo: ratePer1kKobo(rate) }]);
    byPlatform.set(platform, categories);
  }

  const platforms: SmmPlatform[] = PLATFORM_ORDER.filter((p) => byPlatform.has(p.id)).map((p) => ({
    id: p.id,
    name: p.name,
    categories: [...byPlatform.get(p.id)!].map(([name, services], i): SmmCategory => ({ id: `${p.id}-${i + 1}`, name, services })),
  }));
  return { server, platforms };
}

/* ---------------- cached read ---------------- */

const cache = new Map<BoostServerId, { at: number; data: BoostCatalog }>();
const inFlight = new Map<BoostServerId, Promise<BoostCatalog>>();

/** One server's catalogue. Cached for 10 minutes and shared between simultaneous callers; a panel that is down keeps serving the last good copy. */
export async function getBoostCatalog(server: BoostServerId): Promise<BoostCatalog> {
  const hit = cache.get(server);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.data;
  let pending = inFlight.get(server);
  if (!pending) {
    pending = (async () => {
      try {
        const rows = await callPanel(server, { action: 'services' });
        if (!Array.isArray(rows)) throw new AppError(502, 'provider_error', 'The server did not answer properly. Try again shortly.');
        const data = buildCatalog(server, rows as PanelRow[]);
        cache.set(server, { at: Date.now(), data });
        return data;
      } catch (err) {
        if (hit) return hit.data; // down or rate limited: keep showing the last good list
        throw err;
      } finally {
        inFlight.delete(server);
      }
    })();
    inFlight.set(server, pending);
  }
  return pending;
}

/** For tests: forget every cached catalogue. */
export function resetBoostCache() {
  cache.clear();
  inFlight.clear();
}

/* ---------------- orders ---------------- */

/** Send an order to a panel. Returns the panel's own order id. Throws PanelError when the panel refuses it. */
export async function panelAdd(server: BoostServerId, order: { service: string; link: string; quantity: number }): Promise<string> {
  const json = (await callPanel(server, { action: 'add', service: order.service, link: order.link, quantity: String(order.quantity) })) as { order?: unknown };
  const id = Array.isArray(json.order) ? json.order[0] : json.order; // some panels wrap it in a list
  if (id === undefined || id === null || id === '') throw new AppError(502, 'provider_error', 'The server did not answer properly. Try again shortly.');
  return String(id);
}

export interface PanelOrderStatus {
  /** The panel's own word: "Pending", "In progress", "Completed", "Partial", "Canceled"... */
  status: string;
  remains: number | null;
  startCount: number | null;
}

/** Ask a panel about up to 100 orders at once. An id the panel doesn't know comes back as { error }. */
export async function panelStatuses(server: BoostServerId, ids: string[]): Promise<Record<string, PanelOrderStatus | { error: string }>> {
  const json = (await callPanel(server, { action: 'status', orders: ids.join(',') })) as Record<string, any>;
  // One id can come back as the status object itself instead of { "<id>": ... }.
  const keyed: Record<string, any> = ids.length === 1 && 'status' in json ? { [ids[0]!]: json } : json;
  const out: Record<string, PanelOrderStatus | { error: string }> = {};
  for (const id of ids) {
    const row = keyed[id];
    if (!row) continue;
    if (row.error) out[id] = { error: String(row.error) };
    else {
      const num = (v: unknown) => (v === undefined || v === null || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
      out[id] = { status: String(row.status ?? ''), remains: num(row.remains), startCount: num(row.start_count) };
    }
  }
  return out;
}

/** The panel's wording -> ours. Anything unrecognised counts as "pending" (we ask again next time). */
export function mapPanelStatus(raw: string): 'pending' | 'in_progress' | 'completed' | 'partial' | 'canceled' {
  const s = raw.toLowerCase();
  if (/partial/.test(s)) return 'partial';
  if (/cancel|refund|fail|error|reject/.test(s)) return 'canceled';
  if (/complete|finish|success|done/.test(s)) return 'completed';
  if (/progress|process|running|active|start/.test(s)) return 'in_progress';
  return 'pending';
}
