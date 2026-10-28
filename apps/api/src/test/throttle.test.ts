import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { byEmail, byIpAndEmail, byUser, makeLimiter } from '../middleware/rateLimit.js';

// Small apps with the real limiter factory (switched on for tests), so we test the rules, not the whole API.
const appWith = (limiter: express.RequestHandler, locals?: (req: express.Request) => string | undefined) => {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    res.locals.userId = locals?.(req);
    next();
  });
  app.post('/x', limiter, (_req, res) => void res.json({ ok: true }));
  return app;
};

describe('throttling', () => {
  it('lets a person through up to the limit, then answers 429 with our error shape and Retry-After', async () => {
    const app = appWith(makeLimiter({ windowMs: 60_000, limit: 3, message: 'slow down', inTests: true }));
    for (let i = 0; i < 3; i++) await request(app).post('/x').send({}).expect(200);
    const res = await request(app).post('/x').send({});
    expect(res.status).toBe(429);
    expect(res.body).toEqual({ error: { code: 'rate_limited', message: 'slow down' } });
    expect(res.headers['retry-after']).toBeDefined();
  });

  it('login: one email from one IP is limited, a different email is not', async () => {
    const app = appWith(makeLimiter({ windowMs: 60_000, limit: 2, key: byIpAndEmail, inTests: true }));
    await request(app).post('/x').send({ email: 'a@x.com' }).expect(200);
    await request(app).post('/x').send({ email: 'A@x.com ' }).expect(200); // same email: case and spaces don't dodge the limit
    await request(app).post('/x').send({ email: 'a@x.com' }).expect(429);
    await request(app).post('/x').send({ email: 'b@x.com' }).expect(200);
  });

  it('code checks: the email alone is the budget, so changing IP does not help a guesser', async () => {
    const app = appWith(makeLimiter({ windowMs: 60_000, limit: 2, key: byEmail, inTests: true }));
    app.set('trust proxy', true);
    await request(app).post('/x').set('X-Forwarded-For', '1.1.1.1').send({ email: 'a@x.com' }).expect(200);
    await request(app).post('/x').set('X-Forwarded-For', '2.2.2.2').send({ email: 'a@x.com' }).expect(200);
    await request(app).post('/x').set('X-Forwarded-For', '3.3.3.3').send({ email: 'a@x.com' }).expect(429);
  });

  it('signed-in routes: each user has their own budget', async () => {
    const app = appWith(makeLimiter({ windowMs: 60_000, limit: 1, key: byUser, inTests: true }), (req) => req.header('x-user'));
    await request(app).post('/x').set('x-user', 'u1').send({}).expect(200);
    await request(app).post('/x').set('x-user', 'u1').send({}).expect(429);
    await request(app).post('/x').set('x-user', 'u2').send({}).expect(200);
  });

  it('is switched off in tests unless asked for', async () => {
    const app = appWith(makeLimiter({ windowMs: 60_000, limit: 1 }));
    for (let i = 0; i < 5; i++) await request(app).post('/x').send({}).expect(200);
  });
});
