/**
 * Integration tests for the receipt endpoints.
 *
 *   GET /api/orders/:id/receipt         (HTML)
 *   GET /api/orders/:id/receipt.pdf     (PDF)
 *   GET /api/orders/:id/receipt.json    (structured)
 *
 * Auth/authorization: order owner OR admin/manager.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { getTestApp, cleanDatabase, authHeader } from '../helpers/db';
import { mockPrisma } from '../helpers/mockPrisma';
import {
  createUser,
  createCategory,
  createProduct,
  createOrder,
  createOrderItem,
  createAddress,
} from '../helpers/factories';
import type { Express } from 'express';

let app: Express;
beforeAll(async () => { app = await getTestApp(); });
afterAll(async () => { await mockPrisma.$disconnect(); });
beforeEach(async () => { await cleanDatabase(); });

/**
 * Mint a token for an already-created user. We need this because
 * `authHeader` in db.ts creates its own user row - passing it the
 * same email as an existing user would yield a SECOND user and
 * the token's id wouldn't match. Most receipt tests follow the
 * pattern "create the user, then mint the token here".
 */
async function tokenFor(user: { id: string; email: string; role: string }): Promise<string> {
  const { generateTokens } = await import('../../src/middleware/auth');
  return generateTokens({ id: user.id, email: user.email, role: user.role }).accessToken;
}

/**
 * Helper: build a full order with one line item, the right
 * addresses, and return both the order row and the user so each
 * test can call the receipt endpoint with the right token.
 */
async function makeOrder() {
  const owner = await createUser({ role: 'customer', email: 'owner@t.local' });
  const ownerToken = await tokenFor(owner);
  const cat = await createCategory({ slug: 'c', name: 'C' });
  const p = await createProduct({
    name: 'Hoodie', slug: 'hoodie', sku: 'HOOD-1', price: 25,
    quantity: 10, categoryId: cat.id,
  });
  const ship = await mockPrisma.address.create({
    data: {
      userId: owner.id, firstName: 'Alice', lastName: 'Doe',
      address1: '123 Main St', city: 'Springfield', state: 'IL',
      postalCode: '62701', country: 'US', type: 'shipping',
    },
  });
  await mockPrisma.address.create({
    data: {
      userId: owner.id, firstName: 'Alice', lastName: 'Doe',
      address1: '456 Office Rd', city: 'Springfield', state: 'IL',
      postalCode: '62701', country: 'US', type: 'billing',
    },
  });
  const order = await createOrder(owner.id, {
    subtotal: 50, shippingAmount: 0, taxAmount: 4.5, totalAmount: 54.5,
  });
  await createOrderItem(order.id, p.id, { quantity: 2, unitPrice: 25, totalPrice: 50 });
  await mockPrisma.order.update({
    where: { id: order.id },
    data: { shippingAddressId: ship.id, status: 'delivered', paymentStatus: 'paid' },
  });
  return { owner, token: ownerToken, order };
}

describe('Auth & authorization', () => {
  it('GET receipt without a token -> 401', async () => {
    const { order } = await makeOrder();
    const res = await request(app).get(`/api/orders/${order.id}/receipt`);
    expect(res.status).toBe(401);
  });

  it('GET receipt as a different customer -> 403', async () => {
    const { order } = await makeOrder();
    const other = await createUser({ email: 'other@t.local' });
    const { token: otherToken } = await authHeader({ email: other.email });
    const res = await request(app)
      .get(`/api/orders/${order.id}/receipt`)
      .set('Authorization', `Bearer ${otherToken}`);
    expect(res.status).toBe(403);
  });

  it('GET receipt as the order owner -> 200', async () => {
    const { order, token } = await makeOrder();
    const res = await request(app)
      .get(`/api/orders/${order.id}/receipt`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it('GET receipt as an admin (on behalf of the customer) -> 200', async () => {
    const { order } = await makeOrder();
    const admin = await createUser({ role: 'admin' });
    const adminToken = await tokenFor(admin);
    const res = await request(app)
      .get(`/api/orders/${order.id}/receipt`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });

  it('GET receipt as a manager (refund support) -> 200', async () => {
    const { order } = await makeOrder();
    const mgr = await createUser({ role: 'manager' });
    const mgrToken = await tokenFor(mgr);
    const res = await request(app)
      .get(`/api/orders/${order.id}/receipt`)
      .set('Authorization', `Bearer ${mgrToken}`);
    expect(res.status).toBe(200);
  });

  it('GET receipt for an unknown order -> 404', async () => {
    const admin = await createUser({ role: 'admin' });
    const token = await tokenFor(admin);
    const res = await request(app)
      .get('/api/orders/00000000-0000-0000-0000-000000000000/receipt')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});

describe('HTML receipt', () => {
  it('returns Content-Type text/html', async () => {
    const { order, token } = await makeOrder();
    const res = await request(app)
      .get(`/api/orders/${order.id}/receipt`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.headers['content-type']).toMatch(/text\/html/);
  });

  it('embeds the order number, status, and totals', async () => {
    const { order, token } = await makeOrder();
    const res = await request(app)
      .get(`/api/orders/${order.id}/receipt`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain(order.orderNumber);
    expect(res.text).toContain('delivered');
    expect(res.text).toContain('Hoodie');
    expect(res.text).toContain('HOOD-1');
    expect(res.text).toContain('$50.00');  // subtotal
    expect(res.text).toContain('$4.50');   // tax
    expect(res.text).toContain('$54.50');  // total
  });

  it('renders the shipping address', async () => {
    const { order, token } = await makeOrder();
    const res = await request(app)
      .get(`/api/orders/${order.id}/receipt`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.text).toContain('Shipping address');
    expect(res.text).toContain('123 Main St');
    expect(res.text).toContain('Springfield');
  });

  it('renders the billing address when one exists', async () => {
    const { order, token } = await makeOrder();
    const res = await request(app)
      .get(`/api/orders/${order.id}/receipt`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.text).toContain('Billing address');
    expect(res.text).toContain('456 Office Rd');
  });

  it('falls back to the shipping address when no billing address exists', async () => {
    // Build an order whose user has no billing address row.
    const owner = await createUser({ email: 'no-bill@t.local' });
    const { generateTokens } = await import('../../src/middleware/auth');
    const token = generateTokens({ id: owner.id, email: owner.email, role: owner.role }).accessToken;
    const cat = await createCategory({ slug: 'c', name: 'C' });
    const p = await createProduct({ name: 'X', slug: 'x', sku: 'X-1', price: 5, quantity: 1, categoryId: cat.id });
    const ship = await mockPrisma.address.create({
      data: { userId: owner.id, firstName: 'A', lastName: 'B', address1: '1 St', city: 'C', state: 'S', postalCode: '00000', country: 'US', type: 'shipping' },
    });
    const order = await createOrder(owner.id, { subtotal: 5, totalAmount: 5 });
    await createOrderItem(order.id, p.id, { quantity: 1, unitPrice: 5, totalPrice: 5 });
    await mockPrisma.order.update({
      where: { id: order.id },
      data: { shippingAddressId: ship.id },
    });
    const res = await request(app)
      .get(`/api/orders/${order.id}/receipt`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.text).toContain('Billing address');
    // The fallback is the shipping address; the text "1 St" should
    // appear twice (once for shipping, once for billing fallback).
    const matches = res.text.match(/1 St/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it('escapes user-supplied HTML in the order number (XSS)', async () => {
    const { order, token } = await makeOrder();
    // Mutate the order number to contain a script tag. The mock
    // prisma's update is unrestricted.
    await mockPrisma.order.update({
      where: { id: order.id },
      data: { orderNumber: '<script>alert("xss")</script>' },
    });
    const res = await request(app)
      .get(`/api/orders/${order.id}/receipt`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.text).not.toContain('<script>alert("xss")</script>');
    expect(res.text).toContain('&lt;script&gt;');
  });

  it('includes a link to the PDF endpoint for download', async () => {
    const { order, token } = await makeOrder();
    const res = await request(app)
      .get(`/api/orders/${order.id}/receipt`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.text).toContain(`/api/orders/${order.id}/receipt.pdf`);
  });
});

describe('PDF receipt', () => {
  it('returns Content-Type application/pdf', async () => {
    const { order, token } = await makeOrder();
    const res = await request(app)
      .get(`/api/orders/${order.id}/receipt.pdf`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.headers['content-type']).toBe('application/pdf');
  });

  it('returns a Buffer with the PDF magic bytes', async () => {
    const { order, token } = await makeOrder();
    const res = await request(app)
      .get(`/api/orders/${order.id}/receipt.pdf`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    // supertest returns the body as a string by default; the
    // response is binary so we look at the first few chars.
    const head = res.body.toString('ascii').slice(0, 5);
    expect(head).toBe('%PDF-');
  });

  it('includes the order number in the Content-Disposition filename', async () => {
    const { order, token } = await makeOrder();
    const res = await request(app)
      .get(`/api/orders/${order.id}/receipt.pdf`)
      .set('Authorization', `Bearer ${token}`);
    const cd = res.headers['content-disposition'];
    expect(cd).toContain(order.orderNumber);
    expect(cd).toMatch(/^inline; filename="receipt-.+\.pdf"$/);
  });

  it('ends with the PDF EOF marker', async () => {
    const { order, token } = await makeOrder();
    const res = await request(app)
      .get(`/api/orders/${order.id}/receipt.pdf`)
      .set('Authorization', `Bearer ${token}`);
    const tail = res.body.toString('ascii').slice(-32);
    expect(tail).toMatch(/%%EOF/);
  });

  it('produces a non-trivial size PDF', async () => {
    const { order, token } = await makeOrder();
    const res = await request(app)
      .get(`/api/orders/${order.id}/receipt.pdf`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.length).toBeGreaterThan(1000);
  });

  it('rejects unauthorized PDF download', async () => {
    const { order } = await makeOrder();
    const res = await request(app).get(`/api/orders/${order.id}/receipt.pdf`);
    expect(res.status).toBe(401);
  });
});

describe('JSON receipt', () => {
  it('returns structured data for admin/manager', async () => {
    const { order } = await makeOrder();
    const admin = await createUser({ role: 'admin' });
    // Mint a token for the admin we already created (not the one
    // authHeader would create).
    const { generateTokens } = await import('../../src/middleware/auth');
    const token = generateTokens({ id: admin.id, email: admin.email, role: admin.role }).accessToken;
    const res = await request(app)
      .get(`/api/orders/${order.id}/receipt.json`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.order.orderNumber).toBe(order.orderNumber);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.totals.subtotal).toBe(50);
  });

  it('rejects a customer trying to fetch the JSON (admin/manager only)', async () => {
    const { order, token } = await makeOrder();
    const res = await request(app)
      .get(`/api/orders/${order.id}/receipt.json`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('rejects unauthenticated JSON fetch', async () => {
    const { order } = await makeOrder();
    const res = await request(app).get(`/api/orders/${order.id}/receipt.json`);
    expect(res.status).toBe(401);
  });
});
