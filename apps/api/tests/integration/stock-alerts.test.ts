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

  it('lets a SECOND guest with a different email subscribe to the same product', async () => {
    // Regression: all guests share userId='anonymous', and the dedupe
    // check OR-ed that shared id in — so the first guest subscription on
    // a product made every later guest with a different email hit
    // "already subscribed" and never receive an alert.
    const first = await request(app).post('/api/stock-alerts').send({ productId: 'p1', email: 'a@example.com' });
    expect(first.body.message).toMatch(/notified/);
    const second = await request(app).post('/api/stock-alerts').send({ productId: 'p1', email: 'b@example.com' });
    expect(second.status).toBe(200);
    expect(second.body.message).toMatch(/notified/);
    expect(second.body.message).not.toMatch(/already/);
    const rows = await mockPrisma.stockAlertSubscription.findMany({ where: { productId: 'p1' } });
    expect(rows).toHaveLength(2);
    expect(rows.map((r: any) => r.email).sort()).toEqual(['a@example.com', 'b@example.com']);
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

  it('does not delete OTHER guests\' alerts (regression: OR on the shared anonymous userId)', async () => {
    // Guests all share userId 'anonymous'; the old where clause was
    // OR[{userId}, {email}] so ANY guest (even without an email) could
    // wipe every anonymous subscription on the product.
    await request(app).post('/api/stock-alerts').send({ productId: 'pZ', email: 'a@example.com' });
    await request(app).post('/api/stock-alerts').send({ productId: 'pZ', email: 'b@example.com' });

    // A guest with NO email: must be a no-op, not a mass unsubscribe.
    const noEmail = await request(app).delete('/api/stock-alerts/pZ');
    expect(noEmail.status).toBe(200);
    let check = await request(app).get('/api/stock-alerts/check/pZ');
    expect(check.body.data.alertCount).toBe(2);

    // A guest with email a@example.com: only their own row goes.
    const withEmail = await request(app).delete('/api/stock-alerts/pZ?email=a@example.com');
    expect(withEmail.status).toBe(200);
    check = await request(app).get('/api/stock-alerts/check/pZ');
    expect(check.body.data.alertCount).toBe(1);
  });
});
