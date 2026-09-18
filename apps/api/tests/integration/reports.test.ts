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
