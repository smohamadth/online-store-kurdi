/**
 * Admin sales report endpoints.
 *
 * These expose revenue and customer emails, so the authorization checks
 * matter as much as the payload shape.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { getTestApp, cleanDatabase, authHeader } from '../helpers/db';
import { mockPrisma } from '../helpers/mockPrisma';
import type { Express } from 'express';
import { resolveRange } from '../../src/modules/analytics/report.service';

let app: Express;
beforeAll(async () => { app = await getTestApp(); });
afterAll(async () => { await mockPrisma.$disconnect(); });
beforeEach(async () => { await cleanDatabase(); });

describe('GET /api/reports/sales', () => {
  it('returns the report for an admin', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const res = await request(app)
      .get('/api/reports/sales?days=30')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d).toBeTruthy();
    expect(d.totals).toBeDefined();
    expect(d.deltas).toBeDefined();
    expect(Array.isArray(d.series)).toBe(true);
    expect(d.range.days).toBe(30);
  });

  it('rejects a customer (403)', async () => {
    const { token } = await authHeader();
    const res = await request(app)
      .get('/api/reports/sales')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('rejects an anonymous request (401)', async () => {
    const res = await request(app).get('/api/reports/sales');
    expect(res.status).toBe(401);
  });

  it('falls back to the default window on rubbish input rather than 500ing', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const res = await request(app)
      .get('/api/reports/sales?days=not-a-number&from=nonsense')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.range.days).toBe(30);
  });

  it('honours an explicit from/to range', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const res = await request(app)
      .get('/api/reports/sales?from=2024-01-01&to=2024-01-31')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.range.from.slice(0, 10)).toBe('2024-01-01');
    expect(res.body.data.range.to.slice(0, 10)).toBe('2024-01-31');
  });

  it('never reports a percentage against an empty previous period', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const res = await request(app)
      .get('/api/reports/sales?days=7')
      .set('Authorization', `Bearer ${token}`);
    // An empty test store has no prior sales, so percent must be null, not 0
    // dressed up as a trend or a hardcoded "12%".
    expect(res.body.data.deltas.revenue.percent).toBeNull();
  });
});

describe('GET /api/reports/sales.pdf', () => {
  it('streams a PDF to an admin', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const res = await request(app)
      .get('/api/reports/sales.pdf?days=30')
      .set('Authorization', `Bearer ${token}`)
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.headers['content-disposition']).toContain('sales-report-');
    expect((res.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('rejects a customer (403)', async () => {
    const { token } = await authHeader();
    const res = await request(app)
      .get('/api/reports/sales.pdf')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('rejects an anonymous request (401)', async () => {
    const res = await request(app).get('/api/reports/sales.pdf');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/reports/sales.csv', () => {
  it('streams a CSV to an admin', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const res = await request(app)
      .get('/api/reports/sales.csv?days=30')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.text).toContain('Summary');
  });

  it('rejects a customer (403)', async () => {
    const { token } = await authHeader();
    const res = await request(app)
      .get('/api/reports/sales.csv')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});

// --- Range resolution ------------------------------------------------------
// These pin three defects found by driving the real service with seeded data.
describe('resolveRange (range semantics)', () => {
  it('includes the whole of a bare "to" day', () => {
    // ?to=2024-06-10 used to parse as midnight, silently excluding every sale
    // made on the 10th - a whole day of takings missing from the report.
    const r = resolveRange({ from: '2024-06-01', to: '2024-06-10' });
    expect(r.to.toISOString()).toBe('2024-06-10T23:59:59.999Z');
    expect(r.from.toISOString()).toBe('2024-06-01T00:00:00.000Z');
  });

  it('honours a full ISO timestamp exactly', () => {
    const r = resolveRange({ from: '2024-06-01T06:00:00Z', to: '2024-06-10T09:30:00Z' });
    expect(r.to.toISOString()).toBe('2024-06-10T09:30:00.000Z');
  });

  it('swaps a reversed range instead of throwing', () => {
    // `to` was const, so the documented swap threw "Assignment to constant
    // variable" and turned a mistyped URL into a 500.
    expect(() => resolveRange({ from: '2024-03-31', to: '2024-03-01' })).not.toThrow();
    const r = resolveRange({ from: '2024-03-31', to: '2024-03-01' });
    expect(r.from.getTime()).toBeLessThan(r.to.getTime());
  });

  it('falls back to the default window on nonsense input', () => {
    expect(resolveRange({ days: 'abc' }).days).toBe(30);
    expect(resolveRange({ days: -5 }).days).toBe(30);
    expect(resolveRange({ days: 99999 }).days).toBe(30);
    expect(resolveRange({}).days).toBe(30);
  });

  it('accepts a valid lookback', () => {
    expect(resolveRange({ days: 7 }).days).toBe(7);
    expect(resolveRange({ days: 365 }).days).toBe(365);
  });
});

describe('units sold across the whole catalogue', () => {
  it('counts every product, not just the ten in the table', async () => {
    // Regression: unitsSold summed `topProducts`, which is capped at 10, so a
    // store selling more than ten distinct products under-reported its unit
    // count with no hint the figure was partial (88 instead of 178).
    const { mockPrisma } = await import('../helpers/mockPrisma');
    const { assembleSalesReport, resolveRange } =
      await import('../../src/modules/analytics/report.service');

    const orderId = 'units-order';
    await mockPrisma.order.create({
      data: {
        id: orderId, orderNumber: 'ORD-UNITS', userId: 'u-units', status: 'delivered',
        subtotal: 0, totalAmount: 150, paymentMethod: 'cod', paymentStatus: 'completed',
        createdAt: new Date(Date.now() - 86400000),
      },
    });
    for (let i = 0; i < 15; i++) {
      await mockPrisma.product.create({
        data: {
          id: `up${i}`, name: `Unit ${i}`, slug: `up-${i}`, sku: `USKU-${i}`,
          price: 10, quantity: 99, status: 'active', createdAt: new Date(),
        },
      });
      await mockPrisma.orderItem.create({
        data: {
          id: `uoi${i}`, orderId, productId: `up${i}`,
          quantity: 10, unitPrice: 10, totalPrice: 100,
        },
      });
    }

    const report = await assembleSalesReport(resolveRange({ days: 30 }));
    expect(report.topProducts.length).toBeLessThanOrEqual(10);
    // 15 products x 10 units, regardless of the table cap.
    expect(report.totals.unitsSold).toBe(150);
  });
});
