/**
 * Newsletter integration tests.
 *
 * Tests the "already subscribed" path (no double-subscribe), the
 * admin subscriber list, and the validation of email shape.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { getTestApp } from '../helpers/db';
import { mockPrisma } from '../helpers/mockPrisma';
import type { Express } from 'express';

let app: Express;
beforeAll(async () => { app = await getTestApp(); });
afterAll(async () => { await mockPrisma.$disconnect(); });
beforeEach(async () => { /* in-memory Set in the route */ });

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
  });

  it('400 on an invalid email', async () => {
    const res = await request(app)
      .post('/api/newsletter/subscribe')
      .send({ email: 'nope' });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/newsletter/subscribers', () => {
  it('returns the subscriber list', async () => {
    await request(app).post('/api/newsletter/subscribe').send({ email: 'a@b.c' });
    await request(app).post('/api/newsletter/subscribe').send({ email: 'b@b.c' });
    const res = await request(app).get('/api/newsletter/subscribers');
    expect(res.status).toBe(200);
    expect(res.body.data.count).toBe(2);
  });
});
