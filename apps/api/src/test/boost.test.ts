import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/mailer.js', () => ({ sendCodeEmail: async () => {} }));

import { buildApp } from '../app.js';
import { User } from '../models/User.js';
import { ACCESS_COOKIE, signAccessToken } from '../lib/tokens.js';
import { buildCatalog, decodeEntities, isDivider, platformOf, ratePer1kKobo, resetBoostCache } from '../services/boost.service.js';

const app = buildApp();

let counter = 0;
async function cookie() {
  const n = ++counter;
  const user = await User.create({
    email: `b${n}@example.com`, phone: `+234807${String(2000000 + n)}`, username: `boost${n}`, usernameLower: `boost${n}`,
    passwordHash: 'x', isVerified: true,
  });
  return `${ACCESS_COOKIE}=${signAccessToken(String(user._id), 'user')}`;
}

// 0.90 USD per 1,000 x 1500 x 1.30 = N1,755 per 1k = 175,500 kobo (default markup 30%)
const ROWS = [
  { service: 101, name: 'Instagram Followers | Real | 30 Day Refill', type: 'Default', category: 'Instagram Followers', rate: '0.90', min: '50', max: '10000', refill: true },
  { service: 102, name: 'Instagram Likes', type: 'Default', category: 'Instagram Likes', rate: '0.10', min: '10', max: '5000' },
  { service: 201, name: 'TikTok Views', type: 'Default', category: 'TikTok Views', rate: '0.02', min: '100', max: '1000000' },
  { service: 301, name: 'YouTube Custom Comments', type: 'Custom Comments', category: 'YouTube Comments', rate: '5.00', min: '10', max: '500' },
  { service: 401, name: 'Free trial', type: 'Default', category: 'Instagram Followers', rate: '0', min: '10', max: '100' },
  { service: 501, name: 'Broken limits', type: 'Default', category: 'Instagram Followers', rate: '1', min: '500', max: '100' },
  { service: 601, name: 'Mystery boost', type: 'Default', category: 'Misc', rate: '0.50', min: '1', max: '1000' },
];

describe('boost: how a panel list becomes our catalogue', () => {
  it('prices per 1,000 in kobo: dollar rate x naira rate x (1 + markup)', () => {
    expect(ratePer1kKobo(0.9)).toBe(175_500);
    expect(ratePer1kKobo(0)).toBe(1); // never free
  });

  it('puts a service under the platform named by its category, then by its name', () => {
    expect(platformOf('Instagram Followers', 'whatever')).toBe('instagram');
    expect(platformOf('Misc', 'Telegram Members | Real')).toBe('telegram');
    expect(platformOf('Twitter / X Followers', 'x')).toBe('twitter');
    expect(platformOf('Misc', 'X Followers | Worldwide')).toBe('twitter');
    expect(platformOf('Web', 'Website Traffic | Google')).toBe('website');
    expect(platformOf('Misc', 'Totally unknown')).toBe('other');
    expect(platformOf('Facebook Page Likes', 'Instagram style')).toBe('facebook'); // the category wins
  });

  it('groups into platforms > categories > services and leaves out services we cannot sell', () => {
    const c = buildCatalog('peakerr', ROWS);
    expect(c.server).toBe('peakerr');
    expect(c.platforms.map((p) => p.id)).toEqual(['instagram', 'tiktok', 'other']); // fixed order; custom comments, free and broken ones are gone
    const ig = c.platforms[0]!;
    expect(ig.categories.map((x) => x.name)).toEqual(['Instagram Followers', 'Instagram Likes']);
    expect(ig.categories[0]!.services).toEqual([{ id: '101', name: 'Instagram Followers | Real | 30 Day Refill', min: 50, max: 10000, ratePer1kKobo: 175_500 }]);
    expect(c.platforms[2]!.categories[0]!.name).toBe('Misc');
  });

  it('recognises the newer platforms', () => {
    expect(platformOf('Twitch Followers', 'x')).toBe('twitch');
    expect(platformOf('Misc', 'Kick Live Stream Viewers')).toBe('kick');
    expect(platformOf('Misc', 'Threads Followers')).toBe('threads');
    expect(platformOf('Misc', 'WhatsApp Channel Members')).toBe('whatsapp');
    expect(platformOf('Misc', 'Google Maps Reviews')).toBe('google');
    expect(platformOf('Misc', 'Audiomack Plays')).toBe('audiomack');
  });

  it('turns HTML codes in names and categories into real characters', () => {
    expect(decodeEntities('Fast &amp; Cheap &lt;New&gt; &quot;Real&quot; it&#039;s &#x41;')).toBe('Fast & Cheap <New> "Real" it\'s A');
    expect(decodeEntities('Real &amp;amp; Old &amp;amp;amp; New')).toBe('Real & Old & New'); // encoded twice (or more)
    const c = buildCatalog('peakerr', [{ service: 1, name: 'Likes &amp; Views', category: 'Instagram &amp; More', rate: '1', min: '1', max: '10' }]);
    expect([c.platforms[0]!.categories[0]!.name, c.platforms[0]!.categories[0]!.services[0]!.name]).toEqual(['Instagram & More', 'Likes & Views']);
  });

  it('leaves Discord services out of the catalog', () => {
    const c = buildCatalog('peakerr', [
      { service: 1, name: 'Discord Members', category: 'Discord Members', rate: '1', min: '1', max: '10' },
      { service: 2, name: 'Followers', category: 'Instagram Followers', rate: '1', min: '1', max: '10' },
    ]);
    expect(c.platforms.map((p) => p.id)).toEqual(['instagram']);
  });

  it("drops the panel's fake section-heading 'services'", () => {
    for (const name of ['👇👇👇👇👇 DISCORD SERVICES 👇👇👇👇👇', '↓↓~~~~~~~~ YouTube ~~~~~~~~↓↓', '--------------------', '~~~~~~~~~~', '====== INDIA ======']) expect(isDivider(name)).toBe(true);
    for (const name of ['Instagram Followers | Real | 30 Day Refill', 'Likes ➜ [ Speed : 15K+/ Day ]', 'Telegram Members - Fast', '🔵 Instagram Likes | Max 1K']) expect(isDivider(name)).toBe(false);
    const c = buildCatalog('peakerr', [
      { service: 1, name: '👇👇👇👇 INSTAGRAM SERVICES 👇👇👇👇', category: 'Instagram', rate: '9700', min: '1', max: '1' },
      { service: 2, name: 'Instagram Likes', category: 'Instagram', rate: '1', min: '1', max: '10' },
    ]);
    expect(c.platforms[0]!.categories[0]!.services.map((x) => x.id)).toEqual(['2']);
  });

  it('keeps real expensive services but drops anything above $20,000 per 1,000', () => {
    const c = buildCatalog('peakerr', [
      { service: 1, name: 'Telegram Premium Boost | 30 Day', category: 'Telegram', rate: '236', min: '10', max: '1000' },
      { service: 2, name: 'Instagram Verification Service', category: 'Instagram', rate: '3744', min: '1', max: '10' },
      { service: 3, name: 'Kick Live Chat', category: 'Kick', rate: '1090346', min: '1', max: '5' },
    ]);
    expect(c.platforms.flatMap((p) => p.categories.flatMap((x) => x.services.map((y) => y.id)))).toEqual(['2', '1']);
  });

  it('gives a service with no category the name "Other"', () => {
    const c = buildCatalog('peakerr', [{ service: 1, name: 'Plain', rate: '1', min: '1', max: '10' }]);
    expect(c.platforms[0]!.categories[0]!.name).toBe('Other');
  });
});

describe('boost: GET /api/v1/boost/servers/:server/catalog', () => {
  let panel: (url: string, form: URLSearchParams) => { status?: number; body: unknown };
  let calls: { url: string; form: URLSearchParams }[];

  beforeEach(() => {
    resetBoostCache();
    process.env.MORETHANPANEL_API_KEY = 'mk';
    process.env.PEAKERR_API_KEY = 'pk';
    process.env.RESELLERSMM_API_KEY = 'rk';
    calls = [];
    panel = () => ({ body: ROWS });
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      const form = new URLSearchParams(String(init?.body ?? ''));
      calls.push({ url, form });
      const r = panel(url, form);
      return new Response(JSON.stringify(r.body), { status: r.status ?? 200 });
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('needs a signed-in user and a known server', async () => {
    await request(app).get('/api/v1/boost/servers/peakerr/catalog').expect(401);
    await request(app).get('/api/v1/boost/servers/nope/catalog').set('Cookie', await cookie()).expect(400);
  });

  it('asks each server its own panel, with its own key, and returns the catalogue', async () => {
    const c = await cookie();
    for (const [server, url, key] of [
      ['morethanpanel', 'https://morethanpanel.com/api/v2', 'mk'],
      ['peakerr', 'https://peakerr.com/api/v2', 'pk'],
      ['resellersmm', 'https://resellersmm.com/api/v2', 'rk'],
    ] as const) {
      const res = await request(app).get(`/api/v1/boost/servers/${server}/catalog`).set('Cookie', c).expect(200);
      expect(res.body.server).toBe(server);
      expect(res.body.platforms.length).toBeGreaterThan(0);
      const call = calls.find((x) => x.url === url)!;
      expect([call.form.get('action'), call.form.get('key')]).toEqual(['services', key]);
    }
  });

  it('asks the panel once for several requests (10-minute cache)', async () => {
    const c = await cookie();
    for (let i = 0; i < 3; i++) await request(app).get('/api/v1/boost/servers/peakerr/catalog').set('Cookie', c).expect(200);
    expect(calls.length).toBe(1);
  });

  it('keeps showing the last good list when the panel goes down later', async () => {
    const c = await cookie();
    await request(app).get('/api/v1/boost/servers/peakerr/catalog').set('Cookie', c).expect(200);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 30 * 60_000); // the cache has gone stale
    panel = () => ({ status: 503, body: { error: 'down' } });
    const later = await cookie(); // a fresh sign-in at the new time (the first one has expired by now)
    const res = await request(app).get('/api/v1/boost/servers/peakerr/catalog').set('Cookie', later);
    vi.useRealTimers();
    expect(res.status).toBe(200);
    expect(res.body.platforms.length).toBeGreaterThan(0);
  });

  it('says the server is not set up yet when its key is missing', async () => {
    delete process.env.PEAKERR_API_KEY;
    const res = await request(app).get('/api/v1/boost/servers/peakerr/catalog').set('Cookie', await cookie());
    expect([res.status, res.body.error.code]).toEqual([503, 'server_not_configured']);
    expect(calls.length).toBe(0);
  });

  it('says "temporarily unavailable" (and logs) when the panel rejects our key', async () => {
    panel = () => ({ status: 401, body: { error: 'Invalid API key' } });
    const res = await request(app).get('/api/v1/boost/servers/morethanpanel/catalog').set('Cookie', await cookie());
    expect([res.status, res.body.error.code]).toEqual([503, 'server_unavailable']);
  });

  it('answers 502 (not a crash) when the panel replies with an error or something that is not a list', async () => {
    const c = await cookie();
    panel = () => ({ body: { error: 'Something is wrong' } });
    await request(app).get('/api/v1/boost/servers/resellersmm/catalog').set('Cookie', c).expect(502);
    resetBoostCache();
    panel = () => ({ body: { not: 'a list' } });
    await request(app).get('/api/v1/boost/servers/resellersmm/catalog').set('Cookie', c).expect(502);
  });
});
