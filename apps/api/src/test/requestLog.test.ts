import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/mailer.js', () => ({ sendCodeEmail: async () => {} }));

import { buildApp } from '../app.js';

const app = buildApp();
let lines: string[];
beforeEach(() => {
  process.env.LOG_REQUESTS = '1';
  lines = [];
  vi.spyOn(console, 'log').mockImplementation((m: unknown) => void lines.push(String(m)));
  vi.spyOn(console, 'error').mockImplementation((m: unknown) => void lines.push(String(m)));
});
afterEach(() => {
  delete process.env.LOG_REQUESTS;
  vi.restoreAllMocks();
});

describe('request log', () => {
  it('logs method, path, status, time and proxy hops for every call, and never the query, body or cookies', async () => {
    await request(app).get('/api/v1/auth/me?token=SECRET123').set('Cookie', 'mhub_access=COOKIEVALUE').set('X-Forwarded-For', '1.1.1.1, 2.2.2.2');
    const line = lines.find((l) => l.startsWith('[req] GET /api/v1/auth/me'))!;
    expect(line).toMatch(/^\[req\] GET \/api\/v1\/auth\/me 401 \d+ms hops=2$/);
    expect(lines.join('\n')).not.toMatch(/SECRET123|COOKIEVALUE/);
  });

  it('logs a webhook call with its content type and size, even when it is refused before the webhook code runs', async () => {
    await request(app).post('/api/v1/webhooks/pocketfi').set('Content-Type', 'text/plain').send('hello');
    expect(lines.some((l) => /^\[req\] POST \/api\/v1\/webhooks\/pocketfi 400 \d+ms hops=0 content-type=text\/plain bytes=5$/.test(l))).toBe(true);
    expect(lines.some((l) => l.includes('webhook REFUSED (400)') && l.includes('no body'))).toBe(true);
  });

  it('says so when a webhook body is not valid JSON', async () => {
    await request(app).post('/api/v1/webhooks/pocketfi').set('Content-Type', 'application/json').send('{not json');
    expect(lines.some((l) => l.includes('the body is not valid JSON'))).toBe(true);
    expect(lines.some((l) => /POST \/api\/v1\/webhooks\/pocketfi 400/.test(l))).toBe(true);
  });

  it('skips /health', async () => {
    await request(app).get('/health').expect(200);
    expect(lines.filter((l) => l.startsWith('[req]'))).toEqual([]);
  });
});
