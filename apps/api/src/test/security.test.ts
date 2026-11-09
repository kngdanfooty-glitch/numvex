import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { isBrandEmail, isReservedUsername } from '@numvexs/shared';
import { buildApp } from '../app.js';
import { hasOperatorKeys } from '../middleware/noSqlInjection.js';
import { User } from '../models/User.js';

const app = buildApp();
const signUp = {
  email: 'real.person@gmail.com',
  phone: '0803 123 4567',
  password: 'Passw0rd!',
  username: 'real_person',
  heardFrom: 'friend',
};

describe('sign-up refuses names and addresses that pass for ours', () => {
  it.each(['admin', 'Admin', 'superadmin', 'support', 'ceo', 'adm1n', '@dmin', 'ad_min', 'admin01', 'megahub', 'MegaHub_Fan', 'numvex', 'official.help', 'security', 'billing'])(
    'username %s is reserved',
    (name) => expect(isReservedUsername(name)).toBe(true),
  );

  it.each(['admin@megahub.ng', 'support@megahub.com', 'ceo@MegaHub.ng', 'anyone@megahub.ng', 'megahubadmin@gmail.com', 'adminmegahubng@gmail.com', 'officialmegahub@gmail.com', 'megahub.store@gmail.com'.replace('store', 'support'), 'x@numvexs.com'])(
    'email %s is refused',
    (email) => expect(isBrandEmail(email)).toBe(true),
  );

  // Real customers who signed up on the live site: none may be caught by the new rules.
  it.each(['chimenamefavou', 'Destiny55', 'paul', 'Ayuba', 'Salim', 'muktar123456', 'Chisom', 'Ayo', 'Helen', 'FreehomeEfe', 'anointedwizzy', 'Cheyenne', 'Samuel', 'isrealite', 'pop', 'Sulaiman', 'osyagbatac', 'tauraro', 'ayomide56', 'Steam_boat', 'bob_builder'])(
    'real username %s is allowed',
    (name) => expect(isReservedUsername(name)).toBe(false),
  );
  it.each(['chimenamefavour@gmail.com', 'rasheedayuba669@gmail.com', 'ayomideolojede56@gmail.com', 'bob@example.com', 'megahubng1@gmail.com'])('real email %s is allowed', (email) =>
    expect(isBrandEmail(email)).toBe(false),
  );

  it('the API answers 400 and creates nothing', async () => {
    for (const body of [{ ...signUp, username: 'superadmin' }, { ...signUp, email: 'security@megahub.ng' }, { ...signUp, email: 'megahubadmin@gmail.com' }]) {
      const res = await request(app).post('/api/v1/auth/register').send(body);
      expect(res.status).toBe(400);
    }
    expect(await User.countDocuments()).toBe(0);
    await request(app).post('/api/v1/auth/register').send(signUp).expect(201);
  });
});

describe('NoSQL injection', () => {
  it('finds operator keys at any depth', () => {
    expect(hasOperatorKeys({ email: { $ne: '' } })).toBe(true);
    expect(hasOperatorKeys({ a: [{ b: { $gt: '' } }] })).toBe(true);
    expect(hasOperatorKeys({ 'profile.role': 'admin' })).toBe(true);
    expect(hasOperatorKeys({ email: 'a@b.com', n: 5, tags: ['x'] })).toBe(false);
  });

  it('login with { $ne } instead of a password is refused, and signs nobody in', async () => {
    await request(app).post('/api/v1/auth/register').send(signUp).expect(201);
    for (const body of [{ identifier: { $ne: '' }, password: { $ne: '' } }, { identifier: 'real_person', password: { $gt: '' } }, { identifier: { $regex: '.*' }, password: 'Passw0rd!' }]) {
      const res = await request(app).post('/api/v1/auth/login').send(body);
      expect(res.status).toBe(400);
      expect(res.headers['set-cookie']).toBeUndefined();
    }
  });

  it('operator-looking query strings and URL parts are refused too', async () => {
    const agent = request.agent(app);
    await agent.post('/api/v1/auth/register').send(signUp).expect(201);
    await agent.get('/api/v1/numbers/activations?id[$ne]=1').expect(400);
    await agent.get('/api/v1/numbers/activations/$ne/cancel').expect(404); // not a route: nothing runs
  });

  it('a cookie that turns into an object (j:{"$ne":1}) is refused', async () => {
    const res = await request(app).post('/api/v1/auth/refresh').set('Cookie', 'mhub_refresh=j:{"$ne":1}');
    expect(res.status).toBe(400);
    await request(app).post('/api/v1/auth/logout').set('Cookie', 'mhub_refresh=j:{"$gt":""}').expect(400);
  });

  it('a normal request still works', async () => {
    await request(app).post('/api/v1/auth/register').send(signUp).expect(201);
    await request(app).post('/api/v1/auth/login').send({ identifier: 'real_person', password: 'Passw0rd!' }).expect(200);
  });
});
