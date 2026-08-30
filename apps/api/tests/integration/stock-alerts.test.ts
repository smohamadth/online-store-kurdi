/**
 * Stock alerts integration tests.
 *
 * Subscriptions are StockAlertSubscription rows (they used to live in an
 * in-memory Map), keyed per product and optionally per variant. The auth
 * requirement is that the user is either logged in OR supplies an email.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { getTestApp, cleanDatabase } from '../helpers/db';
import { mockPrisma } from '../helpers/mockPrisma';
import type { Express } from 'express';

let app: Express;
beforeAll(async () => { app = await getTestApp(); });
afterAll(async () => { await mockPrisma.$disconnect(); });
beforeEach(async () => { await cleanDatabase(); });

describe('POST /api/stock-alerts', () => {
  it('subscribes an anonymous user when an email is supplied', async () => {
    const res = await request(app)
      .post('/api/stock-alerts')
      .send({ productId: 'p1', email: 'a@example.com' });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/notified/);
  });

  it('is idempotent for the same email', async () => {
    await request(app).post('/api/stock-alerts').send({ productId: 'p1', email: 'a@example.com' });
    const res = await request(app).post('/api/stock-alerts').send({ productId: 'p1', email: 'a@example.com' });
    expect(res.body.message).toMatch(/already/);
  });
});

describe('GET /api/stock-alerts/check/:productId', () => {
  it('reports whether alerts exist', async () => {
    await request(app).post('/api/stock-alerts').send({ productId: 'pX', email: 'a@example.com' });
    const res = await request(app).get('/api/stock-alerts/check/pX');
    expect(res.status).toBe(200);
    expect(res.body.data.hasAlerts).toBe(true);
  });

  it('keeps variant-level and product-level alerts apart (the old key semantics)', async () => {
    await request(app).post('/api/stock-alerts').send({ productId: 'pZ', variantId: 'v1', email: 'a@example.com' });
    // A product-level check must NOT count the variant-level alert...
    const productLevel = await request(app).get('/api/stock-alerts/check/pZ');
    expect(productLevel.body.data.alertCount).toBe(0);
    // ...and the variant-level check sees exactly one.
    const variantLevel = await request(app).get('/api/stock-alerts/check/pZ?variantId=v1');
    expect(variantLevel.body.data.alertCount).toBe(1);
  });

  it('persists the subscription to the database (survives a restart)', async () => {
    await request(app).post('/api/stock-alerts').send({ productId: 'pP', variantId: 'v9', email: 'd@example.com' });
    const rows = await mockPrisma.stockAlertSubscription.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0].productId).toBe('pP');
    expect(rows[0].variantId).toBe('v9');
    expect(rows[0].userId).toBe('anonymous'); // guests subscribe by email
  });
});

describe('DELETE /api/stock-alerts/:productId', () => {
  it('removes the subscription for the supplied email', async () => {
    await request(app).post('/api/stock-alerts').send({ productId: 'pY', email: 'a@example.com' });
    const res = await request(app).delete('/api/stock-alerts/pY?email=a@example.com');
    expect(res.status).toBe(200);
    const after = await request(app).get('/api/stock-alerts/check/pY');
    expect(after.body.data.hasAlerts).toBe(false);
  });
});
