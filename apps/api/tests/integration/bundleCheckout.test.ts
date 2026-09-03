/**
 * Bundle discounts must actually be applied at checkout.
 *
 * The storefront advertises "Save $25" and adds the components to the cart at
 * LIST price, on the stated understanding that the discount is applied
 * server-side at order placement. Nothing was doing that: the customer saw a
 * saving, then paid the undiscounted total.
 *
 * That is the worst class of bug in a store - a customer-visible price promise
 * the checkout does not honour - so these drive real order placement and
 * assert on the stored money.
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

const ADDRESS = {
  firstName: 'A', lastName: 'B', address: '1 St',
  city: 'NYC', state: 'NY', zipCode: '10001', country: 'US',
};

async function twoProducts() {
  const a = await createProduct({ price: 60, quantity: 20, sku: 'BC-A', slug: 'bc-a', name: 'Widget' });
  const b = await createProduct({ price: 40, quantity: 20, sku: 'BC-B', slug: 'bc-b', name: 'Gadget' });
  return { a, b };
}

async function makeBundle(
  adminToken: string,
  items: Array<{ productId: string; quantity: number }>,
  over: Record<string, unknown> = {},
) {
  const res = await request(app)
    .post('/api/bundles')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      name: 'Kit', slug: 'kit',
      discountType: 'percentage', discountValue: 25,
      items, ...over,
    });
  expect(res.status).toBe(201);
  return res.body.data;
}

function order(token: string, items: Array<{ productId: string; quantity: number }>) {
  return request(app)
    .post('/api/orders')
    .set('Authorization', `Bearer ${token}`)
    .send({ items, shippingAddress: ADDRESS });
}

describe('a complete bundle in the cart is discounted', () => {
  it('charges the bundle price, not the sum of list prices', async () => {
    const { a, b } = await twoProducts();
    const admin = await authHeader({ role: 'admin' });
    await makeBundle(admin.token, [
      { productId: a.id, quantity: 1 },
      { productId: b.id, quantity: 1 },
    ]);

    const { token } = await authHeader();
    const res = await order(token, [
      { productId: a.id, quantity: 1 },
      { productId: b.id, quantity: 1 },
    ]);

    expect(res.status).toBe(201);
    // 100 list, 25% bundle discount => 75 payable.
    expect(res.body.data.subtotal).toBe(100);
    expect(res.body.data.discountAmount).toBe(25);
    expect(res.body.data.totalAmount).toBe(75);
  });

  it('honours a fixed-price bundle', async () => {
    const { a, b } = await twoProducts();
    const admin = await authHeader({ role: 'admin' });
    await makeBundle(
      admin.token,
      [{ productId: a.id, quantity: 1 }, { productId: b.id, quantity: 1 }],
      { discountType: 'fixed', discountValue: 80 },
    );

    const { token } = await authHeader();
    const res = await order(token, [
      { productId: a.id, quantity: 1 },
      { productId: b.id, quantity: 1 },
    ]);

    expect(res.body.data.discountAmount).toBe(20); // 100 - 80
    expect(res.body.data.totalAmount).toBe(80);
  });

  it('applies the discount once per complete set', async () => {
    // Two of everything is two bundles, so the saving doubles. Applying it
    // once would under-deliver; applying it per line would over-deliver.
    const { a, b } = await twoProducts();
    const admin = await authHeader({ role: 'admin' });
    await makeBundle(admin.token, [
      { productId: a.id, quantity: 1 },
      { productId: b.id, quantity: 1 },
    ]);

    const { token } = await authHeader();
    const res = await order(token, [
      { productId: a.id, quantity: 2 },
      { productId: b.id, quantity: 2 },
    ]);

    expect(res.body.data.subtotal).toBe(200);
    expect(res.body.data.discountAmount).toBe(50); // 2 x 25
    expect(res.body.data.totalAmount).toBe(150);
  });

  it('respects component quantities in the bundle definition', async () => {
    const { a, b } = await twoProducts();
    const admin = await authHeader({ role: 'admin' });
    // Bundle is 2x Widget + 1x Gadget = 160 list, 25% off => 40 saved.
    await makeBundle(admin.token, [
      { productId: a.id, quantity: 2 },
      { productId: b.id, quantity: 1 },
    ]);

    const { token } = await authHeader();
    const res = await order(token, [
      { productId: a.id, quantity: 2 },
      { productId: b.id, quantity: 1 },
    ]);

    expect(res.body.data.subtotal).toBe(160);
    expect(res.body.data.discountAmount).toBe(40);
  });
});

describe('an incomplete bundle is NOT discounted', () => {
  it('gives no discount when a component is missing', async () => {
    // Otherwise a shopper buys the cheap half of a bundle at bundle pricing.
    const { a, b } = await twoProducts();
    const admin = await authHeader({ role: 'admin' });
    await makeBundle(admin.token, [
      { productId: a.id, quantity: 1 },
      { productId: b.id, quantity: 1 },
    ]);

    const { token } = await authHeader();
    const res = await order(token, [{ productId: a.id, quantity: 1 }]);

    expect(res.body.data.subtotal).toBe(60);
    expect(res.body.data.discountAmount).toBe(0);
    expect(res.body.data.totalAmount).toBe(60);
  });

  it('gives no discount when a component quantity is short', async () => {
    const { a, b } = await twoProducts();
    const admin = await authHeader({ role: 'admin' });
    await makeBundle(admin.token, [
      { productId: a.id, quantity: 3 },
      { productId: b.id, quantity: 1 },
    ]);

    const { token } = await authHeader();
    const res = await order(token, [
      { productId: a.id, quantity: 2 },   // one short
      { productId: b.id, quantity: 1 },
    ]);

    expect(res.body.data.discountAmount).toBe(0);
  });

  it('ignores an inactive bundle', async () => {
    const { a, b } = await twoProducts();
    const admin = await authHeader({ role: 'admin' });
    await makeBundle(
      admin.token,
      [{ productId: a.id, quantity: 1 }, { productId: b.id, quantity: 1 }],
      { isActive: false },
    );

    const { token } = await authHeader();
    const res = await order(token, [
      { productId: a.id, quantity: 1 },
      { productId: b.id, quantity: 1 },
    ]);

    expect(res.body.data.discountAmount).toBe(0);
    expect(res.body.data.totalAmount).toBe(100);
  });
});

describe('bundle discount interacts safely with coupons', () => {
  it('never drives the total below zero', async () => {
    // A 100%-off bundle plus a coupon must floor at 0, not go negative -
    // a negative total is a refund the store never intended.
    const { a, b } = await twoProducts();
    const admin = await authHeader({ role: 'admin' });
    await makeBundle(
      admin.token,
      [{ productId: a.id, quantity: 1 }, { productId: b.id, quantity: 1 }],
      { discountType: 'percentage', discountValue: 100 },
    );
    await mockPrisma.coupon.create({
      data: {
        code: 'EXTRA50', type: 'fixed', value: 50, isActive: true, usedCount: 0,
        newCustomersOnly: false,
      },
    });

    const { token } = await authHeader();
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        items: [{ productId: a.id, quantity: 1 }, { productId: b.id, quantity: 1 }],
        shippingAddress: ADDRESS,
        couponCode: 'EXTRA50',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.totalAmount).toBeGreaterThanOrEqual(0);
    expect(res.body.data.discountAmount).toBeLessThanOrEqual(res.body.data.subtotal);
  });

  it('stacks a coupon on top of the bundle saving', async () => {
    const { a, b } = await twoProducts();
    const admin = await authHeader({ role: 'admin' });
    await makeBundle(admin.token, [
      { productId: a.id, quantity: 1 },
      { productId: b.id, quantity: 1 },
    ]);
    await mockPrisma.coupon.create({
      data: {
        code: 'TENOFF', type: 'fixed', value: 10, isActive: true, usedCount: 0,
        newCustomersOnly: false,
      },
    });

    const { token } = await authHeader();
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        items: [{ productId: a.id, quantity: 1 }, { productId: b.id, quantity: 1 }],
        shippingAddress: ADDRESS,
        couponCode: 'TENOFF',
      });

    // 100 - 25 (bundle) - 10 (coupon) = 65
    expect(res.body.data.discountAmount).toBe(35);
    expect(res.body.data.totalAmount).toBe(65);
  });
});

describe('no bundles configured', () => {
  it('leaves ordinary orders completely untouched', async () => {
    const { a } = await twoProducts();
    const { token } = await authHeader();
    const res = await order(token, [{ productId: a.id, quantity: 1 }]);

    expect(res.status).toBe(201);
    expect(res.body.data.subtotal).toBe(60);
    expect(res.body.data.discountAmount).toBe(0);
    expect(res.body.data.totalAmount).toBe(60);
  });
});
