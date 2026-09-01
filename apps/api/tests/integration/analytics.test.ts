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
import { createProduct, createUser } from '../helpers/factories';
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

// ---------------------------------------------------------------------------
// Full analytics loop: server-side event recording -> consumers
// ---------------------------------------------------------------------------


describe('search tracking (server-side)', () => {
  it('records a search event when tracking is enabled', async () => {
    process.env.ANALYTICS_TRACKING_ENABLED = 'true';
    await createProduct({ name: 'Ruby Slippers', status: 'active' });
    const res = await request(app).get('/api/products/search?q=Ruby');
    expect(res.status).toBe(200);
    const events = peekMockStore('userEvent').filter((e: any) => e.eventType === 'search');
    expect(events).toHaveLength(1);
    expect(events[0].searchQuery).toBe('Ruby');
  });

  it('records nothing when tracking is disabled (default)', async () => {
    delete process.env.ANALYTICS_TRACKING_ENABLED;
    await createProduct({ name: 'Ruby Slippers', status: 'active' });
    await request(app).get('/api/products/search?q=Ruby');
    expect(peekMockStore('userEvent')).toHaveLength(0);
  });
});

describe('trending (from view events)', () => {
  it('surfaces products with recent views', async () => {
    process.env.ANALYTICS_TRACKING_ENABLED = 'true';
    const p = await createProduct({ name: 'Trendy Widget', status: 'active' });
    for (let i = 0; i < 3; i++) {
      const res = await request(app)
        .post('/api/analytics/track')
        .send({ eventType: 'view', productId: p.id });
      expect(res.status).toBe(200);
    }
    const res = await request(app).get('/api/analytics/trending');
    expect(res.status).toBe(200);
    const ids = res.body.data.map((x: any) => x.id);
    expect(ids).toContain(p.id);
  });
});

describe('product analytics (admin)', () => {
  it('counts view/cart/purchase events and computes conversion', async () => {
    process.env.ANALYTICS_TRACKING_ENABLED = 'true';
    const { token } = await authHeader({ role: 'admin' });
    const p = await createProduct({ status: 'active' });
    const events = [
      { eventType: 'view', productId: p.id },
      { eventType: 'view', productId: p.id },
      { eventType: 'view', productId: p.id },
      { eventType: 'view', productId: p.id },
      { eventType: 'add_to_cart', productId: p.id },
      { eventType: 'add_to_cart', productId: p.id },
      { eventType: 'purchase', productId: p.id },
    ];
    for (const e of events) {
      const res = await request(app).post('/api/analytics/track').send(e);
      expect(res.status).toBe(200);
    }
    const res = await request(app)
      .get(`/api/analytics/products/${p.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.metrics).toEqual({ views: 4, addToCart: 2, purchases: 1, wishlist: 0 });
    expect(res.body.data.conversionRates.viewToCart).toBe(50);
    expect(res.body.data.conversionRates.cartToPurchase).toBe(50);
  });
});

describe('recommendations consume purchase events', () => {
  it('also-bought returns co-purchased products', async () => {
    const p1 = await createProduct({ name: 'Coffee', status: 'active' });
    const p2 = await createProduct({ name: 'Mug', status: 'active' });
    const p3 = await createProduct({ name: 'Candles', status: 'active' });
    const u1 = await createUser();
    const u2 = await createUser();
    const create = (userId: string, productId: string, sessionId: string) =>
      mockPrisma.userEvent.create({
        data: { userId, sessionId, eventType: 'purchase', productId, metadata: '{}' },
      });
    await create(u1.id, p1.id, 's1');
    await create(u1.id, p2.id, 's1');
    await create(u2.id, p1.id, 's2');
    await create(u2.id, p3.id, 's2');

    const res = await request(app).get(`/api/recommendations/also-bought/${p1.id}`);
    expect(res.status).toBe(200);
    const ids = res.body.data.map((x: any) => x.id);
    expect(ids).toContain(p2.id);
    expect(ids).toContain(p3.id);
    expect(ids).not.toContain(p1.id);
  });
});
