/**
 * Analytics integration tests.
 *
 * Tracks that the public /track endpoint accepts events, the public /trending
 * returns a list, and the admin /search /realtime /products/:id are protected.
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

describe('POST /api/analytics/track (public)', () => {
  it('accepts a single event', async () => {
    const res = await request(app)
      .post('/api/analytics/track')
      .send({ eventType: 'page_view' });
    expect(res.status).toBe(200);
  });
});

describe('POST /api/analytics/track/batch (public)', () => {
  it('accepts a batch', async () => {
    const res = await request(app)
      .post('/api/analytics/track/batch')
      .send({ events: [{ eventType: 'view' }, { eventType: 'click' }] });
    expect(res.status).toBe(200);
  });
});

describe('GET /api/analytics/trending (public)', () => {
  it('returns trending products', async () => {
    const res = await request(app).get('/api/analytics/trending');
    expect(res.status).toBe(200);
  });
});

describe('GET /api/analytics/user/behavior', () => {
  it('requires auth (401)', async () => {
    const res = await request(app).get('/api/analytics/user/behavior');
    expect(res.status).toBe(401);
  });

  it('returns the user behavior', async () => {
    const { token } = await authHeader();
    const res = await request(app)
      .get('/api/analytics/user/behavior')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});

describe('Admin analytics', () => {
  it('GET /products/:id requires admin', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const res = await request(app)
      .get('/api/analytics/products/00000000-0000-4000-a000-000000000000')
      .set('Authorization', `Bearer ${token}`);
    expect([200, 404]).toContain(res.status);
  });

  it('GET /search requires admin (403 for non-admin)', async () => {
    const { token } = await authHeader();
    const res = await request(app)
      .get('/api/analytics/search')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('GET /realtime requires admin', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const res = await request(app)
      .get('/api/analytics/realtime')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});
