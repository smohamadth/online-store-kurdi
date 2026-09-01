/**
 * Coupon integration tests.
 *
 * The `validate` endpoint is the most consequential - it returns a
 * discount that the storefront will trust. Tests cover:
 *   - percentage / fixed / free_shipping types
 *   - usage limit + min order amount + active / expired windows
 *   - the never-negative guarantee (a fixed $50 coupon against a $10
 *     order used to produce a negative total)
 *   - admin CRUD
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { getTestApp, cleanDatabase, authHeader } from '../helpers/db';
import { mockPrisma } from '../helpers/mockPrisma';
import { createCoupon } from '../helpers/factories';
import type { Express } from 'express';

let app: Express;
beforeAll(async () => { app = await getTestApp(); });
afterAll(async () => { await mockPrisma.$disconnect(); });
beforeEach(async () => { await cleanDatabase(); });

describe('POST /api/coupons/validate (public)', () => {
  it('returns a percentage discount', async () => {
    await createCoupon({ code: 'WELCOME10', type: 'percentage', value: 10 });
    const res = await request(app).post('/api/coupons/validate').send({ code: 'WELCOME10', subtotal: 100 });
    expect(res.status).toBe(200);
    expect(res.body.data.valid).toBe(true);
    expect(res.body.data.discount).toBe(10);
  });

  it('returns a fixed discount', async () => {
    await createCoupon({ code: 'TEN', type: 'fixed', value: 10 });
    const res = await request(app).post('/api/coupons/validate').send({ code: 'TEN', subtotal: 100 });
    expect(res.body.data.discount).toBe(10);
  });

  it('clamps a fixed discount that exceeds the subtotal', async () => {
    // regression: a $50 fixed against a $10 order used to return 50
    await createCoupon({ code: 'BIG', type: 'fixed', value: 50 });
    const res = await request(app).post('/api/coupons/validate').send({ code: 'BIG', subtotal: 10 });
    expect(res.body.data.discount).toBe(10);
  });

  it('honours maxDiscountAmount for percentage coupons', async () => {
    await createCoupon({ code: 'PCT', type: 'percentage', value: 50, maxDiscountAmount: 20 });
    const res = await request(app).post('/api/coupons/validate').send({ code: 'PCT', subtotal: 100 });
    expect(res.body.data.discount).toBe(20);
  });

  it('rejects when the code does not exist', async () => {
    const res = await request(app).post('/api/coupons/validate').send({ code: 'NOPE', subtotal: 100 });
    expect(res.body.data.valid).toBe(false);
  });

  it('rejects an inactive coupon', async () => {
    await createCoupon({ code: 'OFF', isActive: false });
    const res = await request(app).post('/api/coupons/validate').send({ code: 'OFF', subtotal: 100 });
    expect(res.body.data.valid).toBe(false);
    expect(res.body.data.error).toMatch(/active/);
  });

  it('rejects an expired coupon', async () => {
    await createCoupon({ code: 'OLD', expiresAt: new Date(Date.now() - 1000) });
    const res = await request(app).post('/api/coupons/validate').send({ code: 'OLD', subtotal: 100 });
    expect(res.body.data.error).toMatch(/expired/);
  });

  it('rejects a not-yet-started coupon', async () => {
    await createCoupon({ code: 'FUTURE', startsAt: new Date(Date.now() + 100_000) });
    const res = await request(app).post('/api/coupons/validate').send({ code: 'FUTURE', subtotal: 100 });
    expect(res.body.data.error).toMatch(/not yet/);
  });

  it('rejects when usage limit is reached', async () => {
    await createCoupon({ code: 'MAX', usageLimit: 3, usedCount: 3 });
    const res = await request(app).post('/api/coupons/validate').send({ code: 'MAX', subtotal: 100 });
    expect(res.body.data.error).toMatch(/usage limit/);
  });

  it('rejects when below min order amount', async () => {
    await createCoupon({ code: 'MIN', minOrderAmount: 50 });
    const res = await request(app).post('/api/coupons/validate').send({ code: 'MIN', subtotal: 10 });
    expect(res.body.data.error).toMatch(/Minimum/);
  });

  it('free_shipping type returns a 0 discount (shipping handled separately)', async () => {
    await createCoupon({ code: 'SHIPFREE', type: 'free_shipping' });
    const res = await request(app).post('/api/coupons/validate').send({ code: 'SHIPFREE', subtotal: 100 });
    expect(res.body.data.valid).toBe(true);
    expect(res.body.data.discount).toBe(0);
  });

  it('400 when code is missing', async () => {
    const res = await request(app).post('/api/coupons/validate').send({ subtotal: 100 });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/coupons (admin)', () => {
  it('lists all coupons', async () => {
    const { token } = await authHeader({ role: 'admin' });
    await createCoupon();
    await createCoupon();
    const res = await request(app).get('/api/coupons').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(2);
  });

  it('rejects a customer (403)', async () => {
    const { token } = await authHeader();
    const res = await request(app).get('/api/coupons').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});

describe('POST /api/coupons (admin)', () => {
  it('creates a coupon', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const res = await request(app)
      .post('/api/coupons')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: 'spring20', type: 'percentage', value: 20 });
    expect(res.status).toBe(201);
    expect(res.body.data.code).toBe('SPRING20'); // upper-cased
  });

  it('400 on duplicate code', async () => {
    const { token } = await authHeader({ role: 'admin' });
    await createCoupon({ code: 'TAKEN' });
    const res = await request(app)
      .post('/api/coupons')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: 'taken', type: 'fixed', value: 5 });
    expect(res.status).toBe(400);
  });

  it('400 when code or type missing', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const res = await request(app)
      .post('/api/coupons')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: 'X' });
    expect(res.status).toBe(400);
  });

  it('rejects an Infinity value (1e999) — parseFloat used to store Infinity (400)', async () => {
    // Regression: `parseFloat(value) || 0` turned JSON 1e999 into
    // Infinity, and an Infinity percentage coupon made EVERY checkout
    // fail with a negative total.
    const { token } = await authHeader({ role: 'admin' });
    // Raw JSON body: JSON.stringify would mangle Infinity into null, but
    // a real hostile client sends the literal 1e999 token.
    const res = await request(app)
      .post('/api/coupons')
      .set('Authorization', `Bearer ${token}`)
      .set('Content-Type', 'application/json')
      .send('{"code":"INF","type":"percentage","value":1e999}');
    expect(res.status).toBe(400);
    expect(await mockPrisma.coupon.findMany({ where: { code: 'INF' } })).toHaveLength(0);
  });

  it('rejects an unknown coupon type (400)', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const res = await request(app)
      .post('/api/coupons')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: 'HACK', type: 'unlimited_free_stuff', value: 100 });
    expect(res.status).toBe(400);
  });

  it('rejects a negative value and a NaN usageLimit (400)', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const res = await request(app)
      .post('/api/coupons')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: 'NEG', type: 'fixed', value: -5 });
    expect(res.status).toBe(400);
    const res2 = await request(app)
      .post('/api/coupons')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: 'LIM', type: 'fixed', value: 5, usageLimit: 'abc' });
    expect(res2.status).toBe(400);
  });
});

describe('PUT /api/coupons/:id (admin)', () => {
  it('updates a coupon', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const c = await createCoupon({ code: 'X', value: 5 });
    const res = await request(app)
      .put(`/api/coupons/${c.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ value: 25 });
    expect(res.status).toBe(200);
    const after = await mockPrisma.coupon.findUnique({ where: { id: c.id } });
    expect(after?.value).toBe(25);
  });

  it('rejects an Infinity or negative value on update (400)', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const c = await createCoupon({ code: 'X2', value: 5 });
    const res = await request(app)
      .put(`/api/coupons/${c.id}`)
      .set('Authorization', `Bearer ${token}`)
      .set('Content-Type', 'application/json')
      .send('{"value":1e999}');
    expect(res.status).toBe(400);
    const res2 = await request(app)
      .put(`/api/coupons/${c.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ value: -5 });
    expect(res2.status).toBe(400);
    const after = await mockPrisma.coupon.findUnique({ where: { id: c.id } });
    expect(after?.value).toBe(5); // unchanged
  });

  it('404 for unknown id', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const res = await request(app)
      .put('/api/coupons/nope')
      .set('Authorization', `Bearer ${token}`)
      .send({ value: 5 });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/coupons/:id (admin)', () => {
  it('deletes a coupon', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const c = await createCoupon({ code: 'GONE' });
    const res = await request(app)
      .delete(`/api/coupons/${c.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const after = await mockPrisma.coupon.findUnique({ where: { id: c.id } });
    expect(after).toBeNull();
  });

  it('404 for unknown id', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const res = await request(app)
      .delete('/api/coupons/nope')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});

describe('POST /api/coupons/:id/apply (removed)', () => {
  it('no longer exists — usage is only counted at order placement', async () => {
    // Regression: this endpoint let ANY authenticated customer increment
    // ANY coupon's usedCount (no active/expiry check, no order link, no
    // rate limit). The coupon id is public (returned by /validate), so
    // the endpoint could be hammered to burn a coupon's usage limit and
    // deny legitimate customers. It is gone; the storefront only uses
    // /coupons/validate and order placement counts usage in its
    // transaction.
    const { token } = await authHeader();
    const admin = await authHeader({ role: 'admin' });
    const created = await request(app)
      .post('/api/coupons')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ code: 'SAVE10', type: 'percentage', value: 10, usageLimit: 5 });
    const couponId = created.body.data.id;
    expect(couponId).toBeTruthy();

    for (let i = 0; i < 3; i++) {
      const res = await request(app)
        .post(`/api/coupons/${couponId}/apply`)
        .set('Authorization', `Bearer ${token}`);
      expect([400, 404]).toContain(res.status);
    }

    // The usage count must be untouched by the removed endpoint.
    const stored = await mockPrisma.coupon.findUnique({ where: { id: couponId } });
    expect(stored.usedCount).toBe(0);
  });
});
