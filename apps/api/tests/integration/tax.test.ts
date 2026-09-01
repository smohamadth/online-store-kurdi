/**
 * Tax integration tests.
 *
 * Covers rates + classes CRUD, the calculate endpoint, and the admin summary.
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

describe('Tax rates (admin)', () => {
  it('lists rates', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const res = await request(app).get('/api/tax/rates').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it('creates a rate', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const res = await request(app)
      .post('/api/tax/rates')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'VAT 20', rate: 0.20, country: 'GB' });
    expect(res.status).toBe(201);
  });
});

describe('Tax classes (admin)', () => {
  it('lists classes', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const res = await request(app).get('/api/tax/classes').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});

describe('POST /api/tax/calculate (public)', () => {
  it('computes tax on a subtotal', async () => {
    const res = await request(app)
      .post('/api/tax/calculate')
      .send({ subtotal: 100, country: 'US' });
    expect(res.status).toBe(200);
  });

  it('tolerates hostile numeric payloads (no NaN tax)', async () => {
    // Regression: Number('abc') and Infinity flowed into the rate math
    // (NaN * rate = NaN, returned as JSON null); item rows with bad
    // price/quantity poisoned the whole calculation.
    for (const payload of [
      { country: 'US', subtotal: 'abc' },
      { country: 'US', subtotal: 1e999 },
      { country: 'US', subtotal: -100 },
      { country: 'US', subtotal: 100, items: [{ price: 'x', quantity: 'y' }] },
      { country: 'US', subtotal: 100, items: [{ price: 10, quantity: -2 }] },
      { country: 'US', subtotal: 100, items: [{ price: Infinity, quantity: 1 }] },
    ]) {
      const res = await request(app).post('/api/tax/calculate').send(payload);
      expect(res.status).toBe(200);
      expect(res.body.data.taxAmount).toBeTypeOf('number');
      expect(Number.isNaN(res.body.data.taxAmount)).toBe(false);
    }
  });
});

describe('GET /api/tax/summary (admin)', () => {
  it('returns a tax summary', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const res = await request(app).get('/api/tax/summary').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});
