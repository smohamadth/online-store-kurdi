/**
 * Per-customer coupon limits, end-to-end.
 *
 * Coupon.usedCount is global, so before this a "one per customer" promotion
 * was impossible and a single-use code could be shared publicly and drained.
 * These drive real order placement so the redemption ledger, the global
 * counter and the validator are all exercised together.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { getTestApp, cleanDatabase, authHeader } from '../helpers/db';
import { mockPrisma } from '../helpers/mockPrisma';
import { createProduct, createCoupon, createCategory } from '../helpers/factories';
import type { Express } from 'express';

let app: Express;
beforeAll(async () => { app = await getTestApp(); });
afterAll(async () => { await mockPrisma.$disconnect(); });
beforeEach(async () => { await cleanDatabase(); });

const ADDRESS = {
  firstName: 'A', lastName: 'B', address: '1 St',
  city: 'NYC', state: 'NY', zipCode: '10001', country: 'US',
};

async function placeOrder(token: string, productId: string, extra: Record<string, unknown> = {}) {
  return request(app)
    .post('/api/orders')
    .set('Authorization', `Bearer ${token}`)
    .send({ items: [{ productId, quantity: 1 }], shippingAddress: ADDRESS, ...extra });
}

describe('perCustomerLimit at order placement', () => {
  it('lets the same customer use a limit-1 coupon exactly once', async () => {
    const { token } = await authHeader();
    const p = await createProduct({ price: 100, quantity: 50 });
    const c = await createCoupon({ code: 'ONCE', type: 'percentage', value: 10, perCustomerLimit: 1 });

    const first = await placeOrder(token, p.id, { couponCode: c.code });
    expect(first.status).toBe(201);

    const second = await placeOrder(token, p.id, { couponCode: c.code });
    expect(second.status).toBe(400);
    expect(second.body.message).toMatch(/already used/i);
  });

  it('does not let one customer exhaust another customer\'s allowance', async () => {
    // The whole point of a per-customer ledger: two people each get one use.
    const a = await authHeader();
    const b = await authHeader();
    const p = await createProduct({ price: 100, quantity: 50 });
    const c = await createCoupon({ code: 'EACH', perCustomerLimit: 1 });

    expect((await placeOrder(a.token, p.id, { couponCode: c.code })).status).toBe(201);
    expect((await placeOrder(b.token, p.id, { couponCode: c.code })).status).toBe(201);
  });

  it('records one redemption row per successful use', async () => {
    const { token, user } = await authHeader();
    const p = await createProduct({ price: 100, quantity: 50 });
    const c = await createCoupon({ code: 'LEDGER', perCustomerLimit: 3 });

    await placeOrder(token, p.id, { couponCode: c.code });
    await placeOrder(token, p.id, { couponCode: c.code });

    const rows = await mockPrisma.couponRedemption.findMany({
      where: { couponId: c.id, userId: user.id },
    });
    expect(rows).toHaveLength(2);
    // Each is tied to the order it paid for, so the ledger is auditable.
    expect(rows.every((r: any) => r.orderId)).toBe(true);
  });

  it('allows up to the limit and blocks the one after', async () => {
    const { token } = await authHeader();
    const p = await createProduct({ price: 100, quantity: 50 });
    const c = await createCoupon({ code: 'TWICE', perCustomerLimit: 2 });

    expect((await placeOrder(token, p.id, { couponCode: c.code })).status).toBe(201);
    expect((await placeOrder(token, p.id, { couponCode: c.code })).status).toBe(201);
    expect((await placeOrder(token, p.id, { couponCode: c.code })).status).toBe(400);
  });

  it('leaves unrestricted coupons reusable, as before', async () => {
    const { token } = await authHeader();
    const p = await createProduct({ price: 100, quantity: 50 });
    const c = await createCoupon({ code: 'FREE4ALL', perCustomerLimit: null });

    for (let i = 0; i < 3; i++) {
      expect((await placeOrder(token, p.id, { couponCode: c.code })).status).toBe(201);
    }
  });
});

describe('newCustomersOnly', () => {
  it('accepts a first-time buyer', async () => {
    const { token } = await authHeader();
    const p = await createProduct({ price: 100, quantity: 50 });
    const c = await createCoupon({ code: 'WELCOME', newCustomersOnly: true });

    expect((await placeOrder(token, p.id, { couponCode: c.code })).status).toBe(201);
  });

  it('rejects a customer who already has an order', async () => {
    const { token } = await authHeader();
    const p = await createProduct({ price: 100, quantity: 50 });
    const c = await createCoupon({ code: 'WELCOME2', newCustomersOnly: true });

    await placeOrder(token, p.id);           // an ordinary prior order
    const res = await placeOrder(token, p.id, { couponCode: c.code });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/first order/i);
  });
});

describe('global usedCount still applies', () => {
  it('increments usedCount when the coupon is applied BY CODE', async () => {
    // Regression: usage tracking keyed off the raw `couponId` request field,
    // so a coupon applied by code never incremented the global counter and a
    // usageLimit-capped coupon could be redeemed without limit that way.
    const { token } = await authHeader();
    const p = await createProduct({ price: 100, quantity: 50 });
    const c = await createCoupon({ code: 'BYCODE', usageLimit: 5 });

    await placeOrder(token, p.id, { couponCode: c.code });

    const after = await mockPrisma.coupon.findUnique({ where: { id: c.id } });
    expect(after!.usedCount).toBe(1);
  });

  it('still blocks everyone once the global limit is reached', async () => {
    const a = await authHeader();
    const p = await createProduct({ price: 100, quantity: 50 });
    const c = await createCoupon({ code: 'GLOBAL1', usageLimit: 1 });

    expect((await placeOrder(a.token, p.id, { couponCode: c.code })).status).toBe(201);

    const b = await authHeader();
    const res = await placeOrder(b.token, p.id, { couponCode: c.code });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/usage limit/i);
  });
});

describe('POST /api/coupons/validate reflects the caller', () => {
  // NOTE: this endpoint is advisory and always answers 200; the verdict is in
  // data.valid. Asserting on the status code here would pass for the wrong
  // reason, so these assert the body.
  it('reports a limit-exhausted coupon as invalid for that customer', async () => {
    const { token } = await authHeader();
    const p = await createProduct({ price: 100, quantity: 50 });
    const c = await createCoupon({ code: 'PREVIEW', perCustomerLimit: 1 });
    await placeOrder(token, p.id, { couponCode: c.code });

    // Signed in: their personal allowance is spent.
    const mine = await request(app)
      .post('/api/coupons/validate')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: 'PREVIEW', subtotal: 100 });
    expect(mine.status).toBe(200);
    expect(mine.body.data.valid).toBe(false);
    expect(mine.body.data.error).toMatch(/already used/i);

    // A different signed-in shopper still sees it as valid.
    const other = await authHeader();
    const theirs = await request(app)
      .post('/api/coupons/validate')
      .set('Authorization', `Bearer ${other.token}`)
      .send({ code: 'PREVIEW', subtotal: 100 });
    expect(theirs.status).toBe(200);
    expect(theirs.body.data.valid).toBe(true);
  });

  it('asks an anonymous shopper to sign in for a restricted coupon', async () => {
    await createCoupon({ code: 'MEMBERS', perCustomerLimit: 1 });
    const res = await request(app)
      .post('/api/coupons/validate')
      .send({ code: 'MEMBERS', subtotal: 100 });

    expect(res.status).toBe(200);
    expect(res.body.data.valid).toBe(false);
    expect(res.body.data.error).toMatch(/sign in/i);
  });

  it('still previews unrestricted coupons for anonymous shoppers', async () => {
    await createCoupon({ code: 'OPEN', type: 'percentage', value: 10 });
    const res = await request(app)
      .post('/api/coupons/validate')
      .send({ code: 'OPEN', subtotal: 100 });
    expect(res.status).toBe(200);
    expect(res.body.data.valid).toBe(true);
  });
});

describe('admin CRUD round-trips the new fields', () => {
  it('persists perCustomerLimit and newCustomersOnly on create', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const res = await request(app)
      .post('/api/coupons')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: 'NEWFIELDS', type: 'percentage', value: 5, perCustomerLimit: 2, newCustomersOnly: true });

    expect(res.status).toBe(201);
    const row = await mockPrisma.coupon.findUnique({ where: { code: 'NEWFIELDS' } });
    expect(row!.perCustomerLimit).toBe(2);
    expect(row!.newCustomersOnly).toBe(true);
  });

  it('defaults to unrestricted when the fields are omitted', async () => {
    const { token } = await authHeader({ role: 'admin' });
    await request(app)
      .post('/api/coupons')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: 'PLAIN', type: 'percentage', value: 5 })
      .expect(201);

    const row = await mockPrisma.coupon.findUnique({ where: { code: 'PLAIN' } });
    expect(row!.perCustomerLimit).toBeNull();
    expect(row!.newCustomersOnly).toBe(false);
  });
});
