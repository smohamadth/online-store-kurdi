/**
 * Shipping integration tests.
 *
 * Covers zones + methods CRUD, the calculate endpoint, and the lookup.
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

describe('Shipping zones (admin)', () => {
  it('lists zones', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const res = await request(app).get('/api/shipping/zones').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it('creates a zone', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const res = await request(app)
      .post('/api/shipping/zones')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Europe', countries: ['DE', 'FR'] });
    expect(res.status).toBe(201);
  });
});

describe('Shipping methods (admin)', () => {
  it('lists methods', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const res = await request(app).get('/api/shipping/methods').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});

describe('POST /api/shipping/calculate (public)', () => {
  it('calculates shipping for a destination', async () => {
    const res = await request(app)
      .post('/api/shipping/calculate')
      .send({ country: 'US', weight: 1 });
    expect(res.status).toBe(200);
  });
});

describe('POST /api/shipping/zones/lookup (public)', () => {
  it('returns the zone for a country', async () => {
    const res = await request(app)
      .post('/api/shipping/zones/lookup')
      .send({ country: 'US' });
    expect(res.status).toBe(200);
  });
});
