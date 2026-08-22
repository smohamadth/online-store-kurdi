/**
 * Inventory integration tests.
 *
 * Most consequential behaviors:
 *   - the adjust endpoint cannot drive quantity below zero
 *   - bulk-update reports per-item success/failure
 *   - the in/out/low filters and the summary counts
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { getTestApp, cleanDatabase, authHeader } from '../helpers/db';
import { mockPrisma } from '../helpers/mockPrisma';
import { createProduct } from '../helpers/factories';
import type { Express } from 'express';

let app: Express;
beforeAll(async () => { app = await getTestApp(); });
afterAll(async () => { await mockPrisma.$disconnect(); });
beforeEach(async () => { await cleanDatabase(); });

describe('POST /api/inventory/adjust', () => {
  it('adds to inventory and logs the change', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const p = await createProduct({ quantity: 10 });
    const res = await request(app)
      .post('/api/inventory/adjust')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId: p.id, quantityChange: 5, reason: 'restock' });
    expect(res.status).toBe(200);
    expect(res.body.data.newQuantity).toBe(15);
    const logs = await mockPrisma.inventoryLog.findMany({ where: { productId: p.id } });
    expect(logs).toHaveLength(1);
  });

  it('rejects an adjustment that would make quantity negative', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const p = await createProduct({ quantity: 1 });
    const res = await request(app)
      .post('/api/inventory/adjust')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId: p.id, quantityChange: -5, reason: 'sale' });
    expect(res.status).toBe(400);
  });

  it('404 for an unknown product', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const res = await request(app)
      .post('/api/inventory/adjust')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId: '00000000-0000-4000-a000-000000000000', quantityChange: 1, reason: 'restock' });
    expect(res.status).toBe(404);
  });
});

describe('POST /api/inventory/bulk-update', () => {
  it('reports per-item success/failure counts', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const a = await createProduct({ quantity: 10 });
    const b = await createProduct({ quantity: 5 });
    const res = await request(app)
      .post('/api/inventory/bulk-update')
      .set('Authorization', `Bearer ${token}`)
      .send({ updates: [
        { productId: a.id, quantity: 50 },
        { productId: b.id, quantity: 3 },
      ] });
    expect(res.status).toBe(200);
    expect(res.body.data.success).toBe(2);
    expect(res.body.data.failed).toBe(0);
  });
});

describe('GET /api/inventory (summary)', () => {
  it('returns the low-stock and out-of-stock counts', async () => {
    const { token } = await authHeader({ role: 'admin' });
    await createProduct({ quantity: 0 });
    await createProduct({ quantity: 5 });
    await createProduct({ quantity: 100 });
    const res = await request(app).get('/api/inventory').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.summary.outOfStockCount).toBe(1);
    expect(res.body.summary.lowStockCount).toBe(1);
  });
});

describe('POST /api/inventory/alerts', () => {
  it('upserts an alert for a product', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const p = await createProduct();
    const res = await request(app)
      .post('/api/inventory/alerts')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId: p.id, lowStockThreshold: 3 });
    expect(res.status).toBe(200);
  });
});
