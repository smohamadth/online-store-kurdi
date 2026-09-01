/**
 * Recommendations integration tests.
 *
 * The full set of recommendation endpoints is exercised; several are public
 * (`trending`, `new-arrivals`) while others require authentication.
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

describe('Public recommendation endpoints', () => {
  it('GET /trending', async () => {
    const res = await request(app).get('/api/recommendations/trending');
    expect(res.status).toBe(200);
  });

  it('GET /new-arrivals', async () => {
    const res = await request(app).get('/api/recommendations/new-arrivals');
    expect(res.status).toBe(200);
  });
});

describe('Authenticated recommendation endpoints', () => {
  it('GET /history (auth required)', async () => {
    const res = await request(app).get('/api/recommendations/history');
    expect(res.status).toBe(401);
  });

  it('GET /personalized returns a list for an authed user', async () => {
    const { token } = await authHeader();
    const res = await request(app)
      .get('/api/recommendations/personalized')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it('GET /also-bought/:productId', async () => {
    const res = await request(app).get(
      '/api/recommendations/also-bought/00000000-0000-4000-a000-000000000000',
    );
    expect(res.status).toBe(200);
  });

  it('GET /bought-together/:productId', async () => {
    const res = await request(app).get(
      '/api/recommendations/bought-together/00000000-0000-4000-a000-000000000000',
    );
    expect(res.status).toBe(200);
  });
});

describe('POST /api/recommendations/click', () => {
  it('logs a recommendation click', async () => {
    const res = await request(app)
      .post('/api/recommendations/click')
      .send({ productId: '00000000-0000-4000-a000-000000000000' });
    expect(res.status).toBe(200);
  });

  it('rejects unbounded payload fields (regression)', async () => {
    // Public endpoint: oversized strings used to be stored verbatim per
    // click (free DB bloat). A too-long type/algorithm must now 400.
    const big = 'x'.repeat(10_000);
    const res = await request(app)
      .post('/api/recommendations/click')
      .send({ productId: '00000000-0000-4000-a000-000000000000', recommendationType: big });
    expect(res.status).toBe(400);

    const res2 = await request(app)
      .post('/api/recommendations/click')
      .send({ productId: '00000000-0000-4000-a000-000000000000', algorithmVersion: big });
    expect(res2.status).toBe(400);

    const res3 = await request(app)
      .post('/api/recommendations/click')
      .send({ productId: '00000000-0000-4000-a000-000000000000' });
    expect(res3.status).toBe(200);
  });
});
