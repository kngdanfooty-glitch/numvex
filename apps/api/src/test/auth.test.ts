import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Instead of sending real emails, remember every code the app "emails", so tests can read it.
const sent = vi.hoisted(() => [] as { to: string; purpose: string; code: string }[]);
vi.mock('../lib/mailer.js', () => ({
  sendCodeEmail: async (to: string, purpose: string, code: string) => {
    sent.push({ to, purpose, code });
  },
}));

import { formatNigerianPhone, normalizeNigerianPhone } from '@numvexs/shared';
import { buildApp } from '../app.js';
import { AuthCode } from '../models/AuthCode.js';

const app = buildApp();
const lastCode = (purpose: string) => sent.filter((m) => m.purpose === purpose).at(-1)!.code;

const user = {
  email: 'Bob@Example.com',
  phone: '0803 123 4567', // typed the way people type it; stored as +2348031234567
  password: 'Passw0rd!',
  username: 'bob_builder',
};

beforeEach(() => {
  sent.length = 0;
});

/** Register, returning an agent that is logged in (keeps cookies like a browser). Email verification is OFF for now, so sign-up signs in at once. */
async function signUpAndVerify() {
  const agent = request.agent(app);
  await agent.post('/api/v1/auth/register').send(user).expect(201);
  return agent;
}

describe('register', () => {
  it('rejects invalid input with a clear message', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'nope', phone: '123', password: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('validation_error');
    expect(res.body.error.details).toHaveProperty('email');
    expect(res.body.error.details).toHaveProperty('password');
    expect(res.body.error.details).toHaveProperty('phone');
  });

  it('creates a verified account and signs the user in at once, with no email (verification is off for now)', async () => {
    const agent = request.agent(app);
    const res = await agent.post('/api/v1/auth/register').send(user).expect(201);
    expect(res.body.user).toMatchObject({ email: 'bob@example.com', username: 'bob_builder' }); // email lowercased
    expect(sent).toHaveLength(0);
    expect((await agent.get('/api/v1/auth/me')).body.user.email).toBe('bob@example.com');
    const { User } = await import('../models/User.js');
    expect((await User.findOne({ email: 'bob@example.com' }))!.isVerified).toBe(true);
  });

  it('an account made before verification was switched off can sign in, and is marked verified', async () => {
    const { User } = await import('../models/User.js');
    await request(app).post('/api/v1/auth/register').send(user).expect(201);
    await User.updateOne({ email: 'bob@example.com' }, { isVerified: false });
    await request(app).post('/api/v1/auth/login').send({ identifier: user.email, password: user.password }).expect(200);
    expect((await User.findOne({ email: 'bob@example.com' }))!.isVerified).toBe(true);
    expect(sent).toHaveLength(0);
  });

  it('refuses an email that is already verified, and a taken username', async () => {
    await signUpAndVerify();
    const dup = await request(app).post('/api/v1/auth/register').send(user);
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('email_taken');

    const takenName = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'other@example.com', phone: '08098765432', password: 'Passw0rd!', username: 'BOB_builder' });
    expect(takenName.body.error.code).toBe('username_taken');
  });

  // Needs email verification (switched off for now): unverified accounts no longer exist.
  it.skip("never overwrites someone's unverified sign-up: the same email is refused, and the first details stay", async () => {
    await request(app).post('/api/v1/auth/register').send(user).expect(201);
    const second = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'BOB@example.COM', phone: '08098765432', password: 'Different1!', username: 'someone_else' }); // capitals don't dodge it
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('email_taken');
    expect(second.body.error.message).toBe('An account with this email already exists.'); // same words as for a verified account
    expect(sent).toHaveLength(1); // no second code was sent to the owner's inbox either

    // The first person's details are untouched: their own password still works, the new one does not.
    const wrong = await request(app).post('/api/v1/auth/login').send({ identifier: user.email, password: 'Different1!' });
    expect(wrong.status).toBe(401);
    const mine = await request(app).post('/api/v1/auth/login').send({ identifier: user.email, password: user.password });
    expect(mine.status).toBe(403); // right password, still unverified: goes to the verify page (a fresh code is sent once the 30-second cooldown is over)
    expect(mine.body.error.code).toBe('email_not_verified');
    expect(sent.every((m) => m.to === 'bob@example.com')).toBe(true); // nothing went to the second person
    const { User } = await import('../models/User.js');
    expect(await User.countDocuments({ email: 'bob@example.com' })).toBe(1);
    expect((await User.findOne({ email: 'bob@example.com' }))!.username).toBe('bob_builder');
  });

  it.skip("the unverified owner can still finish: sign in, use the new code, and they're in", async () => {
    await request(app).post('/api/v1/auth/register').send(user).expect(201);
    await request(app).post('/api/v1/auth/login').send({ identifier: user.email, password: user.password }).expect(403); // sends a fresh code
    const agent = request.agent(app);
    await agent.post('/api/v1/auth/verify-email').send({ email: user.email, code: lastCode('verify_email') }).expect(200);
  });

  it('a phone number or username held by an unverified sign-up is also taken', async () => {
    await request(app).post('/api/v1/auth/register').send(user).expect(201);
    const samePhone = await request(app).post('/api/v1/auth/register').send({ email: 'p@example.com', phone: '2348031234567', password: 'Passw0rd!', username: 'phone_dup' });
    expect(samePhone.body.error.code).toBe('phone_taken');
    const sameName = await request(app).post('/api/v1/auth/register').send({ email: 'n@example.com', phone: '08011112222', password: 'Passw0rd!', username: 'BOB_BUILDER' });
    expect(sameName.body.error.code).toBe('username_taken');
  });

  it('keeps the capitals the user typed in their username', async () => {
    await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'cap@example.com', phone: '07022222222', password: 'Passw0rd!', username: 'Abassgold' })
      .expect(201);
    const agent = request.agent(app);
    await agent.post('/api/v1/auth/login').send({ identifier: 'cap@example.com', password: 'Passw0rd!' });
    expect((await agent.get('/api/v1/auth/me')).body.user.username).toBe('Abassgold');
    // ...and can still sign in with any casing
    await request(app)
      .post('/api/v1/auth/login')
      .send({ identifier: 'ABASSGOLD', password: 'Passw0rd!' })
      .expect(200);
  });

  it('requires a username', async () => {
    const missing = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'nouser@example.com', phone: '08111111111', password: 'Passw0rd!' });
    expect(missing.status).toBe(400);
    expect(missing.body.error.message).toBe('Choose a username.');

    const blank = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'nouser@example.com', phone: '08111111111', username: '   ', password: 'Passw0rd!' });
    expect(blank.status).toBe(400);
    expect(blank.body.error.details).toHaveProperty('username');
  });
});

// Email verification is switched off for now (see auth.service.ts). These tests come back with it.
describe.skip('verify email', () => {
  it('blocks login until verified, and tells the web app which email to verify', async () => {
    await request(app).post('/api/v1/auth/register').send(user).expect(201);
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ identifier: user.email, password: user.password });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('email_not_verified');
    expect(res.body.error.details.email).toBe('bob@example.com');
  });

  it('rejects a wrong code, accepts the right one, and logs the user in', async () => {
    await request(app).post('/api/v1/auth/register').send(user).expect(201);
    const code = lastCode('verify_email');
    const wrong = code === '000000' ? '111111' : '000000';

    const bad = await request(app).post('/api/v1/auth/verify-email').send({ email: user.email, code: wrong });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('invalid_code');

    const agent = request.agent(app);
    const ok = await agent.post('/api/v1/auth/verify-email').send({ email: user.email, code });
    expect(ok.status).toBe(200);
    expect(ok.body.user.isVerified).toBe(true);
    expect(ok.body.user).not.toHaveProperty('passwordHash');

    // The cookies from verifying let us call a protected route.
    expect((await agent.get('/api/v1/auth/me')).body.user.email).toBe('bob@example.com');
  });

  it('only lets a code be used once', async () => {
    await request(app).post('/api/v1/auth/register').send(user);
    const code = lastCode('verify_email');
    await request(app).post('/api/v1/auth/verify-email').send({ email: user.email, code }).expect(200);
    await request(app).post('/api/v1/auth/verify-email').send({ email: user.email, code }).expect(400);
  });

  it('destroys the code after 5 wrong guesses, even if the 6th is correct', async () => {
    await request(app).post('/api/v1/auth/register').send(user);
    const code = lastCode('verify_email');
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) {
      await request(app).post('/api/v1/auth/verify-email').send({ email: user.email, code: wrong });
    }
    const res = await request(app).post('/api/v1/auth/verify-email').send({ email: user.email, code });
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('too_many_attempts');
    expect(await AuthCode.countDocuments()).toBe(0);
  });

  it('does not email again inside the 30-second cooldown', async () => {
    await request(app).post('/api/v1/auth/register').send(user);
    await request(app).post('/api/v1/auth/resend-verification').send({ email: user.email }).expect(200);
    expect(sent).toHaveLength(1); // still only the first email
  });
});

describe('login', () => {
  it('works with email or username, and rejects a wrong password generically', async () => {
    await signUpAndVerify();
    await request(app).post('/api/v1/auth/login').send({ identifier: 'bob@example.com', password: user.password }).expect(200);
    await request(app).post('/api/v1/auth/login').send({ identifier: 'BOB_builder', password: user.password }).expect(200);

    const wrong = await request(app).post('/api/v1/auth/login').send({ identifier: 'bob@example.com', password: 'Wrong1234' });
    const nobody = await request(app).post('/api/v1/auth/login').send({ identifier: 'ghost@example.com', password: 'Wrong1234' });
    expect(wrong.status).toBe(401);
    expect(wrong.body.error).toEqual(nobody.body.error); // can't tell which part was wrong
  });

  it('protects /me', async () => {
    const res = await request(app).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
  });
});

describe('sessions', () => {
  it('refresh issues a new session; logout kills it', async () => {
    const agent = await signUpAndVerify();
    await agent.post('/api/v1/auth/refresh').expect(200);
    await agent.get('/api/v1/auth/me').expect(200);

    await agent.post('/api/v1/auth/logout').expect(200);
    await agent.post('/api/v1/auth/refresh').expect(401);
    await agent.get('/api/v1/auth/me').expect(401);
  });
});

describe('forgot + reset password', () => {
  it('answers the same for unknown emails and sends nothing', async () => {
    await request(app).post('/api/v1/auth/forgot-password').send({ email: 'ghost@example.com' }).expect(200);
    expect(sent).toHaveLength(0);
  });

  it('resets the password with the emailed code and signs out other sessions', async () => {
    const agent = await signUpAndVerify();

    await request(app).post('/api/v1/auth/forgot-password').send({ email: user.email }).expect(200);
    const code = lastCode('reset_password');

    // Weak new password is rejected by the shared schema.
    await request(app).post('/api/v1/auth/reset-password').send({ email: user.email, code, password: 'short' }).expect(400);

    await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ email: user.email, code, password: 'BrandNew123' })
      .expect(200);

    // Old password no longer works, the new one does.
    await request(app).post('/api/v1/auth/login').send({ identifier: user.email, password: user.password }).expect(401);
    await request(app).post('/api/v1/auth/login').send({ identifier: user.email, password: 'BrandNew123' }).expect(200);

    // The session from before the reset was revoked.
    await agent.post('/api/v1/auth/refresh').expect(401);
  });

  // Needs verification codes, which are off for now.
  it.skip('a verify-email code cannot be used to reset a password', async () => {
    await request(app).post('/api/v1/auth/register').send(user);
    const verifyCode = lastCode('verify_email');
    const res = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ email: user.email, code: verifyCode, password: 'BrandNew123' });
    expect(res.status).toBe(400);
  });
});

describe('change password (signed in)', () => {
  it('requires a session', async () => {
    const res = await request(app)
      .post('/api/v1/auth/change-password')
      .send({ currentPassword: user.password, newPassword: 'BrandNew123' });
    expect(res.status).toBe(401);
  });

  it('rejects a wrong current password with 400 (not 401)', async () => {
    const agent = await signUpAndVerify();
    const res = await agent
      .post('/api/v1/auth/change-password')
      .send({ currentPassword: 'NotMyPass1', newPassword: 'BrandNew123' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid_current_password');
  });

  it('validates the new password and refuses re-using the current one', async () => {
    const agent = await signUpAndVerify();
    const weak = await agent
      .post('/api/v1/auth/change-password')
      .send({ currentPassword: user.password, newPassword: 'short' });
    expect(weak.status).toBe(400);
    const same = await agent
      .post('/api/v1/auth/change-password')
      .send({ currentPassword: user.password, newPassword: user.password });
    expect(same.status).toBe(400);
  });

  it('changes the password, keeps THIS device signed in, signs out other devices', async () => {
    const thisDevice = await signUpAndVerify();
    const otherDevice = request.agent(app);
    await otherDevice
      .post('/api/v1/auth/login')
      .send({ identifier: user.email, password: user.password })
      .expect(200);

    await thisDevice
      .post('/api/v1/auth/change-password')
      .send({ currentPassword: user.password, newPassword: 'BrandNew123' })
      .expect(200);

    await thisDevice.post('/api/v1/auth/refresh').expect(200); // still signed in
    await otherDevice.post('/api/v1/auth/refresh').expect(401); // kicked out

    await request(app).post('/api/v1/auth/login').send({ identifier: user.email, password: user.password }).expect(401);
    await request(app).post('/api/v1/auth/login').send({ identifier: user.email, password: 'BrandNew123' }).expect(200);
  });
});

describe('nigerian phone numbers', () => {
  it('accepts the common ways of typing a number and stores one standard form', () => {
    for (const typed of ['08031234567', '0803 123 4567', '803-123-4567', '+234 803 123 4567', '2348031234567', '(0803) 123.4567']) {
      expect(normalizeNigerianPhone(typed), typed).toBe('+2348031234567');
    }
    expect(normalizeNigerianPhone('09012345678')).toBe('+2349012345678');
    expect(normalizeNigerianPhone('07012345678')).toBe('+2347012345678');
  });

  it('rejects things that are not Nigerian mobile numbers', () => {
    for (const bad of ['', '123', '0803123456', '080312345678', '0603 123 4567', '+1 415 555 2671', '+233 24 123 4567', '0803abc4567', '+2340803123456']) {
      expect(normalizeNigerianPhone(bad), bad).toBeNull();
    }
  });

  it('formats back to the local style', () => {
    expect(formatNigerianPhone('+2348031234567')).toBe('0803 123 4567');
  });

  it('register refuses a missing or invalid phone with a clear message', async () => {
    const missing = await request(app).post('/api/v1/auth/register').send({ email: 'a@example.com', username: 'someone', password: 'Passw0rd!' });
    expect(missing.status).toBe(400);
    expect(missing.body.error.details).toHaveProperty('phone');

    const bad = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'a@example.com', phone: '+1 415 555 2671', username: 'someone', password: 'Passw0rd!' });
    expect(bad.status).toBe(400);
    expect(bad.body.error.message).toMatch(/Nigerian phone number/);
  });

  it('stores the number in the standard form and returns it on /me', async () => {
    const agent = await signUpAndVerify();
    expect((await agent.get('/api/v1/auth/me')).body.user.phone).toBe('+2348031234567');
  });

  it('refuses a number that another account already uses, however it is typed', async () => {
    await signUpAndVerify();
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'second@example.com', phone: '+234 803 123 4567', username: 'second_user', password: 'Passw0rd!' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('phone_taken');
  });
});
