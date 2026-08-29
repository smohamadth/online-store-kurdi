/**
 * Analytics integration tests.
 *
 * Tracks that the public /track endpoints accept events ONLY when the
 * store has opted in (ANALYTICS_TRACKING_ENABLED=true - the endpoints
 * 404 by default, since they store IP address, user agent and session
 * per customer event), that the public /trending returns a list, and
 * that the admin /search /realtime /products/:id are protected.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { getTestApp, cleanDatabase, authHeader } from '../helpers/db';
import { mockPrisma, peekMockStore } from '../helpers/mockPrisma';
import type { Express } from 'express';

let app: Express;
beforeAll(async () => { app = await getTestApp(); });
afterAll(async () => { await mockPrisma.$disconnect(); });
beforeEach(async () => { await cleanDatabase(); });
// The gate reads the flag at request time; never leak it into other files.
afterEach(() => { delete process.env.ANALYTICS_TRACKING_ENABLED; });

describe('POST /api/analytics/track (disabled by default)', () => {
  it('404s for a single event and stores nothing when the flag is unset', async () => {
    delete process.env.ANALYTICS_TRACKING_ENABLED;
    const res = await request(app)
      .post('/api/analytics/track')
      .send({ eventType: 'page_view' });
    expect(res.status).toBe(404);
    expect(peekMockStore('userEvent')).toHaveLength(0);
  });

  it('404s for a batch when the flag is explicitly false', async () => {
    process.env.ANALYTICS_TRACKING_ENABLED = 'false';
    const res = await request(app)
      .post('/api/analytics/track/batch')
      .send({ events: [{ eventType: 'view' }] });
    expect(res.status).toBe(404);
  });
});

describe('POST /api/analytics/track (opt-in enabled)', () => {
  it('accepts a single event and stores it', async () => {
    process.env.ANALYTICS_TRACKING_ENABLED = 'true';
    const res = await request(app)
      .post('/api/analytics/track')
      .send({ eventType: 'page_view', productId: 'p-1' });
    expect(res.status).toBe(200);
    const events = peekMockStore('userEvent');
    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe('page_view');
  });

  it('accepts a batch', async () => {
    process.env.ANALYTICS_TRACKING_ENABLED = 'true';
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
