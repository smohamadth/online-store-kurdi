/**
 * Newsletter integration tests.
 *
 * Tests the "already subscribed" path (no double-subscribe), the
 * admin subscriber list, the validation of email shape, and the
 * durability contract (subscribers are NewsletterSubscriber rows, not
 * an in-memory Set).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { getTestApp, cleanDatabase, authHeader } from '../helpers/db';
import { mockPrisma } from '../helpers/mockPrisma';
import type { Express } from 'express';

let app: Express;
beforeAll(async () => { app = await getTestApp(); });
afterAll(async () => { await mockPrisma.$disconnect(); });
beforeEach(async () => { await cleanDatabase(); });

describe('POST /api/newsletter/subscribe', () => {
  it('subscribes a new email', async () => {
    const res = await request(app)
      .post('/api/newsletter/subscribe')
      .send({ email: 'sub@example.com' });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/subscribed/);
  });

  it('is idempotent: a second subscribe of the same email is a no-op', async () => {
    await request(app).post('/api/newsletter/subscribe').send({ email: 'x@x.com' });
    const res = await request(app).post('/api/newsletter/subscribe').send({ email: 'x@x.com' });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/already/);
    // Exactly ONE row - the re-subscribe must not duplicate it.
    const rows = await mockPrisma.newsletterSubscriber.findMany({ where: { email: 'x@x.com' } });
    expect(rows).toHaveLength(1);
  });

  it('persists the subscriber to the database (survives a restart)', async () => {
    await request(app).post('/api/newsletter/subscribe').send({ email: 'persist@example.com' });
    const rows = await mockPrisma.newsletterSubscriber.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0].email).toBe('persist@example.com');
  });

  it('400 on an invalid email', async () => {
    const res = await request(app)
      .post('/api/newsletter/subscribe')
      .send({ email: 'nope' });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/newsletter/subscribers', () => {
  it('refuses anonymous access (401) — subscriber emails are customer data', async () => {
    const res = await request(app).get('/api/newsletter/subscribers');
    expect(res.status).toBe(401);
  });

  it('refuses customers (403)', async () => {
    const { token } = await authHeader();
    const res = await request(app).get('/api/newsletter/subscribers').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('returns the subscriber list to an admin', async () => {
    // (Note: these must be zod-valid emails - "a@b.c" has a one-letter
    // TLD and is rejected with 400. This test used to pass by accident:
    // both subscribes 400'd, and the count of 2 came from rows leaked
    // by the earlier tests in this file.)
    await request(app).post('/api/newsletter/subscribe').send({ email: 'a@b.com' });
    await request(app).post('/api/newsletter/subscribe').send({ email: 'b@b.com' });
    const { token: adminToken } = await authHeader({ role: 'admin' });
    const res = await request(app).get('/api/newsletter/subscribers').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.count).toBe(2);
    expect(res.body.data.subscribers.sort()).toEqual(['a@b.com', 'b@b.com']);
  });
});
