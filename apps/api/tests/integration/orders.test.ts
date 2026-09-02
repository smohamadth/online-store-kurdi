/**
 * Order integration tests.
 *
 * Notable paths:
 *   - the auto-generated order number is unique even on rapid re-order
 *   - the inventory is decremented (and re-incremented on cancel)
 *   - status update rejects unknown statuses (the regression that
 *     silently typed any string into prisma.update)
 *   - cancel restores inventory; only pending/processing can be cancelled
 *   - users can only see their own orders; admins see everything
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { getTestApp, cleanDatabase, authHeader } from '../helpers/db';
import { mockPrisma, peekMockStore } from '../helpers/mockPrisma';
import { createProduct, createVariant, createAddress, createOrder, createOrderItem, createCoupon } from '../helpers/factories';
import type { Express } from 'express';

let app: Express;
beforeAll(async () => { app = await getTestApp(); });
afterAll(async () => { await mockPrisma.$disconnect(); });
beforeEach(async () => { await cleanDatabase(); });

describe('GET /api/orders', () => {
  it("returns the user own orders", async () => {
    const { token, user } = await authHeader();
    await createOrder(user.id);
    const res = await request(app).get('/api/orders').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
  });

  it('an admin sees all orders', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const { user: other } = await authHeader();
    await createOrder(other.id);
    const res = await request(app).get('/api/orders').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
  });
});

describe('GET /api/orders/:id', () => {
  it("returns the user's own order", async () => {
    const { token, user } = await authHeader();
    const o = await createOrder(user.id);
    const res = await request(app).get(`/api/orders/${o.id}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it('forbids another customer (403)', async () => {
    const { user: a } = await authHeader();
    const { token: b } = await authHeader();
    const o = await createOrder(a.id);
    const res = await request(app).get(`/api/orders/${o.id}`).set('Authorization', `Bearer ${b}`);
    expect(res.status).toBe(403);
  });

  it('404 for an unknown order', async () => {
    const { token } = await authHeader();
    const res = await request(app)
      .get('/api/orders/00000000-0000-4000-a000-000000000000')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});

describe('POST /api/orders', () => {
  it('rejects an empty cart (400)', async () => {
    const { token } = await authHeader();
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ items: [] });
    expect(res.status).toBe(400);
  });

  it('creates an order from cart items, decrements stock, clears the cart', async () => {
    const { token, user } = await authHeader();
    const p = await createProduct({ price: 10, quantity: 50 });
    await mockPrisma.cartItem.create({ data: { userId: user.id, productId: p.id, quantity: 2 } });
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ items: [{ productId: p.id, quantity: 2 }] });
    expect(res.status).toBe(201);
    expect(res.body.data.orderNumber).toMatch(/^ORD-/);
    const after = await mockPrisma.product.findUnique({ where: { id: p.id } });
    expect(after?.quantity).toBe(48);
    const cart = await mockPrisma.cartItem.findMany({ where: { userId: user.id } });
    expect(cart).toHaveLength(0);
  });

  it('mints a download token for digital line items and returns it in the response', async () => {
    // Digital products don't decrement stock; they mint a
    // per-order ProductDownload row instead. The response shape
    // must include the token so the storefront can show the
    // download button right after checkout.
    const { token, user } = await authHeader();
    const p = await createProduct({
      name: 'eBook',
      slug: 'ebook',
      price: 9.99,
      type: 'digital',
      // Digital SKUs don't track inventory. The order route
      // rejects with 400 "Insufficient stock" otherwise, even
      // though for digital products there's no physical stock
      // to deplete.
      trackInventory: false,
      quantity: 0,
      downloadUrl: 'https://cdn.example.com/files/ebook.pdf',
      downloadLimit: 5,
      downloadExpiry: 30,
    });
    await mockPrisma.cartItem.create({ data: { userId: user.id, productId: p.id, quantity: 1 } });
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ items: [{ productId: p.id, quantity: 1 }] });
    if (res.status !== 201) {
      // Surface the server message so a 400 vs 500 is easy to
      // tell apart when this test regresses.
      throw new Error(`expected 201, got ${res.status}: ${JSON.stringify(res.body)}`);
    }
    // The freshly-created order carries the download token at
    // the top-level `downloads` array (also reflected on each
    // `items[].downloads[0]`).
    const order = res.body.data;
    expect(order.downloads).toBeDefined();
    expect(order.downloads).toHaveLength(1);
    expect(order.downloads[0].token).toMatch(/.+/);
    expect(order.downloads[0].productName).toBe('eBook');
    // The download row also persists in the DB.
    const itemId = order.items[0].id;
    const rows = await mockPrisma.productDownload.findMany({
      where: { orderItemId: itemId },
    });
    expect(rows).toHaveLength(1);
  });

  it('rejects an order for an inactive product (400)', async () => {
    const { token } = await authHeader();
    const p = await createProduct({ status: 'inactive' });
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ items: [{ productId: p.id, quantity: 1 }] });
    expect(res.status).toBe(400);
  });

  it('rejects when stock is insufficient (400)', async () => {
    const { token } = await authHeader();
    const p = await createProduct({ quantity: 1 });
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ items: [{ productId: p.id, quantity: 5 }] });
    expect(res.status).toBe(400);
  });

  it('creates an order with a variant and decrements variant stock', async () => {
    const { token, user } = await authHeader();
    const p = await createProduct({ quantity: 100 });
    const v = await createVariant(p.id, { price: 20, quantity: 10 });
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ items: [{ productId: p.id, variantId: v.id, quantity: 3 }] });
    expect(res.status).toBe(201);
    const variant = await mockPrisma.productVariant.findUnique({ where: { id: v.id } });
    expect(variant?.quantity).toBe(7);
  });

  it('creates a shipping address from the inline object', async () => {
    const { token } = await authHeader();
    const p = await createProduct({ quantity: 5 });
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        items: [{ productId: p.id, quantity: 1 }],
        shippingAddress: {
          firstName: 'A', lastName: 'B', address: '1 St', city: 'NYC', state: 'NY', zipCode: '10001', country: 'US', phone: '555',
        },
      });
    expect(res.status).toBe(201);
  });

  it('ignores client-sent amounts and stores server-computed totals', async () => {
    // Regression: order placement used to trust the client's
    // subtotal/tax/shipping/discount/total verbatim, so a request
    // claiming $1 for a $20 cart was recorded at $1. Totals are now
    // recomputed server-side from DB prices and the configured rules.
    const { token } = await authHeader();
    const p = await createProduct({ price: 10, quantity: 50 });
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        items: [{ productId: p.id, quantity: 2 }],
        subtotal: 1,
        taxAmount: 1,
        shippingAmount: 1,
        discountAmount: 50,
        totalAmount: 1,
      });
    expect(res.status).toBe(201);
    expect(res.body.data.subtotal).toBe(20);
    expect(res.body.data.taxAmount).toBe(0); // no tax rates configured
    expect(res.body.data.shippingAmount).toBe(0); // no shipping method
    expect(res.body.data.discountAmount).toBe(0); // no coupon
    expect(res.body.data.totalAmount).toBe(20);
  });

  it('recomputes the discount from the coupon instead of trusting discountAmount', async () => {
    const { token } = await authHeader();
    const p = await createProduct({ price: 10, quantity: 50 });
    const coupon = await createCoupon({ type: 'percentage', value: 10 });
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        items: [{ productId: p.id, quantity: 2 }],
        couponId: coupon.id,
        discountAmount: 999, // client claims $999 off — must be ignored
      });
    expect(res.status).toBe(201);
    expect(res.body.data.discountAmount).toBe(2); // 10% of 20
    expect(res.body.data.totalAmount).toBe(18);
    // Usage is still counted exactly once for the validated coupon.
    const after = await mockPrisma.coupon.findUnique({ where: { id: coupon.id } });
    expect(after?.usedCount).toBe(1);
  });

  it('rejects an order carrying an invalid coupon (400)', async () => {
    const { token } = await authHeader();
    const p = await createProduct({ quantity: 5 });
    const coupon = await createCoupon({ isActive: false });
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ items: [{ productId: p.id, quantity: 1 }], couponId: coupon.id });
    expect(res.status).toBe(400);
    // No order may be created for a request that lied about its discount.
    const orders = await mockPrisma.order.findMany({});
    expect(orders).toHaveLength(0);
  });

  it('recomputes tax server-side from the destination and configured rates', async () => {
    const { token } = await authHeader();
    const p = await createProduct({ price: 10, quantity: 50 });
    await mockPrisma.taxRate.create({
      // isActive must be explicit: the in-memory mock does not apply
      // Prisma schema defaults.
      data: { name: 'US Tax', rate: 0.1, country: 'US', isActive: true },
    });
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        items: [{ productId: p.id, quantity: 2 }],
        shippingAddress: {
          firstName: 'A', lastName: 'B', address: '1 St', city: 'NYC', state: 'NY', zipCode: '10001', country: 'US', phone: '555',
        },
        taxAmount: 0, // client claims no tax — server must still charge it
      });
    expect(res.status).toBe(201);
    expect(res.body.data.taxAmount).toBe(2); // 10% of the $20 subtotal
    expect(res.body.data.totalAmount).toBe(22);
  });

  it('recomputes shipping from the chosen method instead of trusting shippingAmount', async () => {
    const { token } = await authHeader();
    const p = await createProduct({ price: 10, quantity: 50 });
    const zone = await mockPrisma.shippingZone.create({
      data: { name: 'US Zone', countries: JSON.stringify(['US']), isActive: true },
    });
    const method = await mockPrisma.shippingMethod.create({
      data: { zoneId: zone.id, name: 'Standard', type: 'flat', baseRate: 7, isActive: true },
    });
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        items: [{ productId: p.id, quantity: 2 }],
        shippingMethodId: method.id,
        shippingAddress: {
          firstName: 'A', lastName: 'B', address: '1 St', city: 'NYC', state: 'NY', zipCode: '10001', country: 'US', phone: '555',
        },
        shippingAmount: 1, // client claims $1 — the real rate is $7
      });
    expect(res.status).toBe(201);
    expect(res.body.data.shippingAmount).toBe(7);
    expect(res.body.data.totalAmount).toBe(27);
  });

  it('refuses a shipping method that is not available for the destination', async () => {
    const { token } = await authHeader();
    const p = await createProduct({ quantity: 5 });
    const zone = await mockPrisma.shippingZone.create({
      data: { name: 'DE Zone', countries: JSON.stringify(['DE']), isActive: true },
    });
    const method = await mockPrisma.shippingMethod.create({
      data: { zoneId: zone.id, name: 'German only', type: 'flat', baseRate: 5, isActive: true },
    });
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        items: [{ productId: p.id, quantity: 1 }],
        shippingMethodId: method.id,
        shippingAddress: {
          firstName: 'A', lastName: 'B', address: '1 St', city: 'NYC', state: 'NY', zipCode: '10001', country: 'US', phone: '555',
        },
      });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/not available/);
  });

  it('a free_shipping coupon zeroes the shipping cost', async () => {
    const { token } = await authHeader();
    const p = await createProduct({ price: 10, quantity: 50 });
    const zone = await mockPrisma.shippingZone.create({
      data: { name: 'US Zone', countries: JSON.stringify(['US']), isActive: true },
    });
    const method = await mockPrisma.shippingMethod.create({
      data: { zoneId: zone.id, name: 'Standard', type: 'flat', baseRate: 7, isActive: true },
    });
    const coupon = await createCoupon({ type: 'free_shipping', value: 0 });
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        items: [{ productId: p.id, quantity: 2 }],
        couponId: coupon.id,
        shippingMethodId: method.id,
        shippingAddress: {
          firstName: 'A', lastName: 'B', address: '1 St', city: 'NYC', state: 'NY', zipCode: '10001', country: 'US', phone: '555',
        },
      });
    expect(res.status).toBe(201);
    expect(res.body.data.shippingAmount).toBe(0);
    expect(res.body.data.totalAmount).toBe(20);
  });

  it('rejects quantity 0 (the free-digital-goods hole)', async () => {
    // Regression: quantity was unvalidated, so `quantity: 0` passed the
    // stock check AND still minted a download token for digital products —
    // an attacker could farm paid downloads for free. Quantities must be
    // integers >= 1.
    const { token } = await authHeader();
    const p = await createProduct({
      name: 'eBook', slug: 'ebook-0', price: 9.99, type: 'digital',
      trackInventory: false, quantity: 0,
      downloadUrl: 'https://cdn.example.com/files/ebook.pdf',
    });
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ items: [{ productId: p.id, quantity: 0 }] });
    expect(res.status).toBe(400);
    const downloads = await mockPrisma.productDownload.findMany({});
    expect(downloads).toHaveLength(0);
  });

  it('rejects fractional and non-numeric quantities (400)', async () => {
    const { token } = await authHeader();
    const p = await createProduct({ price: 10, quantity: 50 });
    for (const q of [1.5, '2', -1, null]) {
      const res = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${token}`)
        .send({ items: [{ productId: p.id, quantity: q }] });
      expect(res.status, `quantity=${String(q)}`).toBe(400);
    }
  });

  it('caps the list page size and tolerates hostile pagination params', async () => {
    // Regression: limit/page were `parseInt(...) || N` with no bounds —
    // `?limit=999999999` asked the DB for every row and `?limit=-5&page=2`
    // produced a negative skip (500). Both must now be clamped.
    const { token } = await authHeader();
    await createProduct({ price: 1, quantity: 5 });

    const res = await request(app)
      .get('/api/orders?limit=-5&page=2')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.pagination.limit).toBeGreaterThan(0);

    const res2 = await request(app)
      .get('/api/orders?limit=999999999')
      .set('Authorization', `Bearer ${token}`);
    expect(res2.status).toBe(200);
    expect(res2.body.pagination.limit).toBeLessThanOrEqual(100);
  });
});

describe('PUT /api/orders/:id/status (admin)', () => {
  it('rejects an unknown status (400)', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const { user } = await authHeader();
    const o = await createOrder(user.id);
    const res = await request(app)
      .put(`/api/orders/${o.id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'not-a-real-status' });
    expect(res.status).toBe(400);
    const after = await mockPrisma.order.findUnique({ where: { id: o.id } });
    // regression: a bad status used to PERSIST before validation
    expect(after?.status).toBe('pending');
  });

  it('accepts a valid status and sets shippedAt for "shipped"', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const { user } = await authHeader();
    const o = await createOrder(user.id);
    const res = await request(app)
      .put(`/api/orders/${o.id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'shipped', trackingNumber: 'TRK-1' });
    expect(res.status).toBe(200);
    const after = await mockPrisma.order.findUnique({ where: { id: o.id } });
    expect(after?.status).toBe('shipped');
    expect(after?.trackingNumber).toBe('TRK-1');
    expect(after?.shippedAt).toBeDefined();
  });

  it('rejects a non-admin (403)', async () => {
    const { token, user } = await authHeader();
    const o = await createOrder(user.id);
    const res = await request(app)
      .put(`/api/orders/${o.id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'shipped' });
    expect(res.status).toBe(403);
  });
});

describe('POST /api/orders/:id/cancel', () => {
  it('cancels a pending order and restores inventory', async () => {
    const { token } = await authHeader();
    const p = await createProduct({ quantity: 10 });
    // Create the order via the public route so its items come from the
    // route's nested-create path (the same path the real checkout uses).
    const res1 = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ items: [{ productId: p.id, quantity: 2 }] });
    expect(res1.status).toBe(201);
    const orderId = res1.body.data.id;
    const res = await request(app)
      .post(`/api/orders/${orderId}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(200);
    const product = await mockPrisma.product.findUnique({ where: { id: p.id } });
    expect(product?.quantity).toBe(10);
  });

  it('refuses to cancel a delivered order (400)', async () => {
    const { token, user } = await authHeader();
    const o = await createOrder(user.id, { status: 'delivered' });
    const res = await request(app)
      .post(`/api/orders/${o.id}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('refuses to cancel a paid order without a refund (400, stock kept)', async () => {
    // Regression: a paid order could be cancelled with no refund — the
    // customer's money stayed with the store while the order was marked
    // cancelled and the stock restored. Cancellation now requires a
    // pending paymentStatus; settled orders must go through the admin
    // refund endpoint first.
    const { token, user } = await authHeader();
    const p = await createProduct({ quantity: 10 });
    const o = await createOrder(user.id, { paymentStatus: 'paid' });
    await createOrderItem(o.id, p.id, { quantity: 2 });
    const res = await request(app)
      .post(`/api/orders/${o.id}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/refund/i);
    const product = await mockPrisma.product.findUnique({ where: { id: p.id } });
    expect(product?.quantity).toBe(10); // NOT restored
  });

  it('restores BOTH variant and parent product stock on cancel', async () => {
    // Regression: the restore loop used else-if, so a variant line only
    // restored the variant — the parent product's denormalized quantity
    // (decremented at sale) was never re-incremented and drifted low.
    const { token } = await authHeader();
    const p = await createProduct({ quantity: 100 });
    const v = await createVariant(p.id, { price: 20, quantity: 10 });
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ items: [{ productId: p.id, variantId: v.id, quantity: 3 }] });
    expect(res.status).toBe(201);
    const orderId = res.body.data.id;

    // Sale decremented both.
    expect((await mockPrisma.product.findUnique({ where: { id: p.id } }))!.quantity).toBe(97);
    expect((await mockPrisma.productVariant.findUnique({ where: { id: v.id } }))!.quantity).toBe(7);

    const cancel = await request(app)
      .post(`/api/orders/${orderId}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(cancel.status).toBe(200);

    expect((await mockPrisma.product.findUnique({ where: { id: p.id } }))!.quantity).toBe(100);
    expect((await mockPrisma.productVariant.findUnique({ where: { id: v.id } }))!.quantity).toBe(10);
  });

  it('does not inflate stock for non-tracked products on cancel', async () => {
    // Regression: decrementStock is a no-op for trackInventory=false
    // products, but cancel blindly incremented them — phantom stock
    // accumulated on every cancel cycle.
    const { token } = await authHeader();
    const p = await createProduct({ quantity: 5, trackInventory: false });
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ items: [{ productId: p.id, quantity: 2 }] });
    expect(res.status).toBe(201);
    const cancel = await request(app)
      .post(`/api/orders/${res.body.data.id}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(cancel.status).toBe(200);
    expect((await mockPrisma.product.findUnique({ where: { id: p.id } }))!.quantity).toBe(5);
  });

  it('rejects an oversized cancel reason (400)', async () => {
    const { token, user } = await authHeader();
    const o = await createOrder(user.id);
    const res = await request(app)
      .post(`/api/orders/${o.id}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'x'.repeat(501) });
    expect(res.status).toBe(400);
  });

  it('forbids cancelling another user\'s order (403)', async () => {
    const { user: a } = await authHeader();
    const { token: b } = await authHeader();
    const o = await createOrder(a.id);
    const res = await request(app)
      .post(`/api/orders/${o.id}/cancel`)
      .set('Authorization', `Bearer ${b}`)
      .send({});
    expect(res.status).toBe(403);
  });
});

describe('GET /api/orders/:id/tracking', () => {
  it('returns the timeline for the order owner (pending order)', async () => {
    const { token, user } = await authHeader();
    const o = await createOrder(user.id);
    const res = await request(app)
      .get(`/api/orders/${o.id}/tracking`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.orderNumber).toBe(o.orderNumber);
    expect(res.body.data.status).toBe('pending');
    expect(res.body.data.steps).toHaveLength(4);
    expect(res.body.data.steps[0]).toMatchObject({ key: 'placed', done: true });
    expect(res.body.data.steps[1].done).toBe(false);
    expect(res.body.data.terminal).toBeNull();
    expect(res.body.data.trackingNumber).toBeNull();
  });

  it("returns 403 for a non-owner user", async () => {
    const { token, user } = await authHeader(); // the order owner
    const { token: stranger } = await authHeader(); // a different customer
    const o = await createOrder(user.id);
    const res = await request(app)
      .get(`/api/orders/${o.id}/tracking`)
      .set('Authorization', `Bearer ${stranger}`);
    expect(res.status).toBe(403);
  });

  it('returns 404 for a missing order', async () => {
    const { token } = await authHeader();
    const res = await request(app)
      .get('/api/orders/does-not-exist/tracking')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('reflects paid + shipped state with the tracking number', async () => {
    const { token, user } = await authHeader();
    const o = await createOrder(user.id);
    const p = await mockPrisma;
    await p.order.update({
      where: { id: o.id },
      data: {
        status: 'shipped',
        paymentStatus: 'completed',
        shippedAt: new Date('2026-01-05T10:00:00Z'),
        trackingNumber: 'TRK-12345',
      },
    });
    const res = await request(app)
      .get(`/api/orders/${o.id}/tracking`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.steps[1]).toMatchObject({ key: 'paid', done: true });
    expect(res.body.data.steps[2]).toMatchObject({ key: 'shipped', done: true });
    expect(res.body.data.steps[3].done).toBe(false);
    expect(res.body.data.trackingNumber).toBe('TRK-12345');
    expect(res.body.data.terminal).toBeNull();
  });

  it('ends in an honest terminal state for cancelled orders', async () => {
    const { token, user } = await authHeader();
    const o = await createOrder(user.id, { status: 'cancelled' });
    const p = await mockPrisma;
    await p.order.update({
      where: { id: o.id },
      data: { cancelledAt: new Date('2026-01-06T09:00:00Z') },
    });
    const res = await request(app)
      .get(`/api/orders/${o.id}/tracking`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('cancelled');
    expect(res.body.data.terminal).toMatchObject({ type: 'cancelled' });
  });

  it('lets an admin track any order', async () => {
    const { token: admin } = await authHeader({ role: 'admin' });
    const { user } = await authHeader();
    const o = await createOrder(user.id);
    const res = await request(app)
      .get(`/api/orders/${o.id}/tracking`)
      .set('Authorization', `Bearer ${admin}`);
    expect(res.status).toBe(200);
  });
});


describe('purchase event tracking (server-side)', () => {
  it('records one purchase event per line item when tracking is enabled', async () => {
    process.env.ANALYTICS_TRACKING_ENABLED = 'true';
    try {
      const { token } = await authHeader();
      const p = await createProduct({ price: 10, quantity: 50 });
      const res = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${token}`)
        .send({ items: [{ productId: p.id, quantity: 2 }] });
      expect(res.status).toBe(201);
      const events = peekMockStore('userEvent').filter((e: any) => e.eventType === 'purchase');
      expect(events).toHaveLength(1);
      expect(events[0].productId).toBe(p.id);
      const meta = JSON.parse(events[0].metadata);
      expect(meta.quantity).toBe(2);
      expect(String(meta.orderId)).toBe(res.body.data.id);
    } finally {
      delete process.env.ANALYTICS_TRACKING_ENABLED;
    }
  });

  it('records no purchase events when tracking is disabled (default)', async () => {
    delete process.env.ANALYTICS_TRACKING_ENABLED;
    const { token } = await authHeader();
    const p = await createProduct({ price: 10, quantity: 50 });
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ items: [{ productId: p.id, quantity: 1 }] });
    expect(res.status).toBe(201);
    expect(peekMockStore('userEvent')).toHaveLength(0);
  });
});

describe('POST /api/orders/:id/pay (retry payment)', () => {
  it('forbids another customer (403)', async () => {
    const { user: a } = await authHeader();
    const { token: b } = await authHeader();
    const o = await createOrder(a.id, { paymentStatus: 'pending' });
    const res = await request(app)
      .post(`/api/orders/${o.id}/pay`)
      .set('Authorization', `Bearer ${b}`);
    expect(res.status).toBe(403);
  });

  it('rejects an already-paid order (400)', async () => {
    const { token, user } = await authHeader();
    const o = await createOrder(user.id);
    await mockPrisma.order.update({ where: { id: o.id }, data: { paymentStatus: 'completed' } });
    const res = await request(app)
      .post(`/api/orders/${o.id}/pay`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/already been paid/i);
  });

  it('rejects a COD order (not payable online)', async () => {
    const { token, user } = await authHeader();
    const o = await createOrder(user.id, { paymentStatus: 'pending' });
    await mockPrisma.order.update({ where: { id: o.id }, data: { paymentMethod: 'cod' } });
    const res = await request(app)
      .post(`/api/orders/${o.id}/pay`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/not payable online/i);
  });

  it('rejects a partially-refunded order (already paid)', async () => {
    const { token, user } = await authHeader();
    const o = await createOrder(user.id);
    await mockPrisma.order.update({ where: { id: o.id }, data: { paymentStatus: 'partially_refunded' } });
    const res = await request(app)
      .post(`/api/orders/${o.id}/pay`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/already been paid/i);
  });
});
