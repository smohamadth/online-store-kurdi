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

  /**
   * Regression: a click that omitted `recommendationType` returned 200 but
   * persisted NOTHING.
   *
   * `recommendationType` is a required non-null column on RecommendationLog,
   * yet the request schema marked it `.optional()`. Prisma therefore received
   * `undefined` for a required field and threw; the service catches and logs
   * its errors so the caller still saw a success. Asserting only on the status
   * code (as the test above does) cannot see this — the row has to be read
   * back.
   */
  it('persists the click row when recommendationType is omitted', async () => {
    const productId = '00000000-0000-4000-a000-000000000000';
    const res = await request(app)
      .post('/api/recommendations/click')
      .send({ productId });
    expect(res.status).toBe(200);

    const rows = await mockPrisma.recommendationLog.findMany({});
    expect(rows).toHaveLength(1);
    expect(rows[0].clicked).toBe(true);
    // Defaulted rather than left undefined, so the insert is valid.
    expect(rows[0].recommendationType).toBe('unknown');
    expect(rows[0].algorithmVersion).toBe('v1');
    expect(JSON.parse(rows[0].products)).toEqual([productId]);
  });

  it('persists the supplied recommendationType and algorithmVersion', async () => {
    const productId = '00000000-0000-4000-a000-000000000001';
    const res = await request(app).post('/api/recommendations/click').send({
      productId,
      recommendationType: 'collaborative',
      algorithmVersion: 'v3',
    });
    expect(res.status).toBe(200);

    const rows = await mockPrisma.recommendationLog.findMany({});
    expect(rows).toHaveLength(1);
    expect(rows[0].recommendationType).toBe('collaborative');
    expect(rows[0].algorithmVersion).toBe('v3');
  });

  it('requires a productId', async () => {
    const res = await request(app)
      .post('/api/recommendations/click')
      .send({ recommendationType: 'hybrid' });
    expect(res.status).toBe(400);
  });
});
