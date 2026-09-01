/**
 * Auth route integration tests.
 *
 * These hit the real express app via supertest. They:
 *   - register users and confirm the response shape
 *   - login / logout / refresh token round-trips
 *   - enforce "user not found" / "wrong password" / "deactivated" paths
 *   - cover the password reset flow (request -> token -> reset)
 *
 * Under vitest.integration.config.ts the mockPrisma client is swapped for
 * tests/helpers/mockPrisma.ts (a Map-based fake) so the suite needs no
 * network. To run against a real database, drop the mock and run
 * `npm test` instead.
 */
import { describe, it, expect, beforeEach, afterAll, beforeAll } from 'vitest';
import request from 'supertest';
import { getTestApp, cleanDatabase, authHeader } from '../helpers/db';
import { mockPrisma } from '../helpers/mockPrisma';
import type { Express } from 'express';

let app: Express;
beforeAll(async () => { app = await getTestApp(); });
afterAll(async () => { await mockPrisma.$disconnect(); });
beforeEach(async () => { await cleanDatabase(); });

const registerPayload = (over: any = {}) => ({
  email: 'newuser@test.local',
  password: 'Password123!',
  firstName: 'New',
  lastName: 'User',
  ...over,
});

describe('POST /api/auth/register', () => {
  it('creates a user and returns a token pair', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send(registerPayload());
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('success');
    expect(res.body.data.user.email).toBe('newuser@test.local');
    expect(res.body.data.user.role).toBe('customer');
    expect(res.body.data.user.password).toBeUndefined();
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.refreshToken).toBeDefined();
  });

  it('rejects an invalid email (400)', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send(registerPayload({ email: 'not-an-email' }));
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('rejects a too-short password (400)', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send(registerPayload({ password: '123' }));
    expect(res.status).toBe(400);
  });

  it('rejects duplicate email (409)', async () => {
    await request(app).post('/api/auth/register').send(registerPayload());
    const res = await request(app)
      .post('/api/auth/register')
      .send(registerPayload({ firstName: 'Other' }));
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('CONFLICT');
  });

  it('persists the hashed password, not the plaintext', async () => {
    await request(app).post('/api/auth/register').send(registerPayload());
    const u = await mockPrisma.user.findUnique({ where: { email: 'newuser@test.local' } });
    expect(u?.password).not.toBe('Password123!');
    // bcrypt hashes start with $2a$ or $2b$ or $2y$
    expect(u?.password).toMatch(/^\$2[aby]\$/);
  });

  it('normalizes email case on register (one account per mailbox)', async () => {
    // Regression: 'User@X.com' and 'user@x.com' used to create TWO
    // accounts for the same mailbox; case-mismatched logins also failed.
    const res = await request(app)
      .post('/api/auth/register')
      .send(registerPayload({ email: 'MiXeD@TeSt.LoCal' }));
    expect(res.status).toBe(201);
    const stored = await mockPrisma.user.findUnique({ where: { email: 'mixed@test.local' } });
    expect(stored).toBeTruthy();

    // A second registration with a different case is the SAME account.
    const dup = await request(app)
      .post('/api/auth/register')
      .send(registerPayload({ email: 'MIXED@TEST.LOCAL', firstName: 'Other' }));
    expect(dup.status).toBe(409);
  });
});

describe('POST /api/auth/login', () => {
  beforeEach(async () => {
    await request(app).post('/api/auth/register').send(registerPayload());
  });

  it('logs in a known user', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'newuser@test.local', password: 'Password123!' });
    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe('newuser@test.local');
    expect(res.body.data.user.password).toBeUndefined();
    expect(res.body.data.accessToken).toBeDefined();
  });

  it('logs in with a different email case (normalized lookup)', async () => {
    // Regression: case-mismatched logins failed (findUnique is
    // case-sensitive); now the exact value is tried first, then the
    // lowercase form, so legacy mixed-case rows still resolve.
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'NEWUSER@TEST.LOCAL', password: 'Password123!' });
    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeDefined();
  });

  it('does NOT log in with a wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'newuser@test.local', password: 'wrong' });
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/Invalid/);
  });

  it('does NOT log in an unknown user', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@test.local', password: 'whatever' });
    expect(res.status).toBe(401);
  });

  it('rejects a deactivated account', async () => {
    await mockPrisma.user.update({
      where: { email: 'newuser@test.local' },
      data: { isActive: false },
    });
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'newuser@test.local', password: 'Password123!' });
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/deactivated/);
  });

  it('rejects an invalid email shape', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nope', password: 'Password123!' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/refresh', () => {
  it('issues a new token pair given a valid refresh token', async () => {
    const reg = await request(app).post('/api/auth/register').send(registerPayload());
    const refreshToken = reg.body.data.refreshToken;
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken });
    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.refreshToken).toBeDefined();
    // the new refresh token must be different (rotation)
    expect(res.body.data.refreshToken).not.toBe(refreshToken);
  });

  it('rejects a missing token', async () => {
    const res = await request(app).post('/api/auth/refresh').send({});
    expect(res.status).toBe(401);
  });

  it('rejects a non-refresh token', async () => {
    const reg = await request(app).post('/api/auth/register').send(registerPayload());
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: reg.body.data.accessToken });
    expect(res.status).toBe(401);
  });

  it('rejects a token that has no session record', async () => {
    const reg = await request(app).post('/api/auth/register').send(registerPayload());
    // wipe the session, keep the token
    await mockPrisma.session.deleteMany({});
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: reg.body.data.refreshToken });
    expect(res.status).toBe(401);
  });

  it('rejects a refresh token whose session expired', async () => {
    const reg = await request(app).post('/api/auth/register').send(registerPayload());
    await mockPrisma.session.updateMany({
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: reg.body.data.refreshToken });
    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/logout', () => {
  it('kills all sessions for a user when no refresh token is supplied', async () => {
    const { token, user } = await authHeader();
    // simulate a prior session
    await mockPrisma.session.create({
      data: {
        userId: user.id,
        refreshToken: 'rt-1',
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    const res = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(200);
    const sessions = await mockPrisma.session.count({ where: { userId: user.id } });
    expect(sessions).toBe(0);
  });

  it('kills only the matching session when a refresh token is supplied', async () => {
    const { token, user } = await authHeader();
    await mockPrisma.session.createMany({
      data: [
        { userId: user.id, refreshToken: 'keep', expiresAt: new Date(Date.now() + 60_000) },
        { userId: user.id, refreshToken: 'drop', expiresAt: new Date(Date.now() + 60_000) },
      ],
    });
    const res = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${token}`)
      .send({ refreshToken: 'drop' });
    expect(res.status).toBe(200);
    const remaining = await mockPrisma.session.findMany({ where: { userId: user.id } });
    expect(remaining.map((s) => s.refreshToken)).toEqual(['keep']);
  });

  it('rejects an unauthenticated logout (401)', async () => {
    const res = await request(app).post('/api/auth/logout').send({});
    expect(res.status).toBe(401);
  });
});

describe('GET /api/auth/me', () => {
  it('returns the current user', async () => {
    const { token, user } = await authHeader({ firstName: 'A', lastName: 'B' });
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe(user.email);
    expect(res.body.data.firstName).toBe('A');
    expect(res.body.data._count).toBeDefined();
  });

  it('rejects unauthenticated (401)', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/forgot-password', () => {
  it('always returns success (no user enumeration)', async () => {
    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'nobody@test.local' });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/If an account exists/);
  });

  it('creates a reset token for an existing user', async () => {
    const u = await mockPrisma.user.create({
      data: { email: 'reset@test.local', password: 'x', firstName: 'A', lastName: 'B' },
    });
    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'reset@test.local' });
    expect(res.status).toBe(200);
    const row = await mockPrisma.passwordReset.findFirst({ where: { userId: u.id } });
    expect(row).toBeTruthy();
  });

  it('finds the user for forgot-password with a different email case', async () => {
    const u = await mockPrisma.user.create({
      data: { email: 'LegacyCase@test.local', password: 'x', firstName: 'A', lastName: 'B' },
    });
    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'legacycase@test.local' });
    expect(res.status).toBe(200);
    const row = await mockPrisma.passwordReset.findFirst({ where: { userId: u.id } });
    expect(row).toBeTruthy();
  });

  it('invalidates previous tokens when a new one is requested', async () => {
    const user = await mockPrisma.user.create({
      data: { email: 'reset@test.local', password: 'x', firstName: 'A', lastName: 'B' },
    });
    const old = await mockPrisma.passwordReset.create({
      data: { userId: user.id, token: 'old', expiresAt: new Date(Date.now() + 60_000) },
    });
    await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'reset@test.local' });
    const kept = await mockPrisma.passwordReset.findUnique({ where: { id: old.id } });
    expect(kept).toBeNull();
  });
});

describe('POST /api/auth/reset-password', () => {
  it('resets a password given a fresh token', async () => {
    const user = await mockPrisma.user.create({
      data: { email: 'u@t.l', password: 'old-hash', firstName: 'A', lastName: 'B' },
    });
    const token = 'good-token';
    await mockPrisma.passwordReset.create({
      data: { userId: user.id, token, expiresAt: new Date(Date.now() + 60_000) },
    });
    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token, password: 'NewPassword123!' });
    expect(res.status).toBe(200);
    const after = await mockPrisma.user.findUnique({ where: { id: user.id } });
    expect(after?.password).not.toBe('old-hash');
  });

  it('rejects an unknown token (400)', async () => {
    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: 'nope', password: 'NewPassword123!' });
    expect(res.status).toBe(400);
  });

  it('rejects a token that is already used (400)', async () => {
    const user = await mockPrisma.user.create({
      data: { email: 'u@t.l', password: 'x', firstName: 'A', lastName: 'B' },
    });
    await mockPrisma.passwordReset.create({
      data: { userId: user.id, token: 'used', expiresAt: new Date(Date.now() + 60_000), used: true },
    });
    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: 'used', password: 'NewPassword123!' });
    expect(res.status).toBe(400);
  });

  it('rejects an expired token and removes it (400)', async () => {
    const user = await mockPrisma.user.create({
      data: { email: 'u@t.l', password: 'x', firstName: 'A', lastName: 'B' },
    });
    const row = await mockPrisma.passwordReset.create({
      data: { userId: user.id, token: 'exp', expiresAt: new Date(Date.now() - 1000) },
    });
    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: 'exp', password: 'NewPassword123!' });
    expect(res.status).toBe(400);
    const after = await mockPrisma.passwordReset.findUnique({ where: { id: row.id } });
    expect(after).toBeNull();
  });

  it('invalidates every active session after a reset', async () => {
    const user = await mockPrisma.user.create({
      data: { email: 'u@t.l', password: 'old', firstName: 'A', lastName: 'B' },
    });
    await mockPrisma.session.create({
      data: { userId: user.id, refreshToken: 'r1', expiresAt: new Date(Date.now() + 60_000) },
    });
    await mockPrisma.passwordReset.create({
      data: { userId: user.id, token: 'tok', expiresAt: new Date(Date.now() + 60_000) },
    });
    await request(app)
      .post('/api/auth/reset-password')
      .send({ token: 'tok', password: 'NewPassword123!' });
    const sessions = await mockPrisma.session.count({ where: { userId: user.id } });
    expect(sessions).toBe(0);
  });

  it('rejects when token or password is missing (400)', async () => {
    const r1 = await request(app).post('/api/auth/reset-password').send({ password: 'a' });
    expect(r1.status).toBe(400);
    const r2 = await request(app).post('/api/auth/reset-password').send({ token: 't' });
    expect(r2.status).toBe(400);
  });

  it('rejects a password shorter than 8 chars (400)', async () => {
    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: 't', password: 'short' });
    expect(res.status).toBe(400);
  });
});
