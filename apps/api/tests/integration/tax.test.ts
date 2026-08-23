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
});

describe('GET /api/tax/summary (admin)', () => {
  it('returns a tax summary', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const res = await request(app).get('/api/tax/summary').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});
