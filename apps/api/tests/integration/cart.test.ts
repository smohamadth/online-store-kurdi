/**
 * Cart integration tests.
 *
 * Covers the four HTTP operations: GET, POST, PUT, DELETE. Verifies:
 *   - quantity aggregation when the same product is added twice
 *   - insufficient-stock guard (both product and variant)
 *   - ownership check (one user cannot edit another's cart)
 *   - the /sync endpoint for localStorage migration
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { getTestApp, cleanDatabase, authHeader } from '../helpers/db';
import { mockPrisma } from '../helpers/mockPrisma';
import { createProduct, createVariant, createCartItem } from '../helpers/factories';
import type { Express } from 'express';

let app: Express;
beforeAll(async () => { app = await getTestApp(); });
afterAll(async () => { await mockPrisma.$disconnect(); });
beforeEach(async () => { await cleanDatabase(); });

describe('GET /api/cart', () => {
  it('returns the user cart with subtotal and item count', async () => {
    const { token, user } = await authHeader();
    const p = await createProduct({ price: 10 });
    const v = await createVariant(p.id, { price: 20 });
    await createCartItem(user.id, p.id, { quantity: 2, variantId: v.id });
    await createCartItem(user.id, p.id, { quantity: 1, variantId: null });

    const res = await request(app).get('/api/cart').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(2);
    expect(res.body.data.subtotal).toBe(50); // 2*20 + 1*10
    expect(res.body.data.itemCount).toBe(3);
  });

  it('rejects unauthenticated (401)', async () => {
    const res = await request(app).get('/api/cart');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/cart', () => {
  it('adds a new item to the cart', async () => {
    const { token, user } = await authHeader();
    const p = await createProduct({ price: 10, quantity: 50 });
    const res = await request(app)
      .post('/api/cart')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId: p.id, quantity: 3 });
    expect(res.status).toBe(200);
    const items = await mockPrisma.cartItem.findMany({ where: { userId: user.id } });
    expect(items).toHaveLength(1);
    expect(items[0].quantity).toBe(3);
  });

  it('aggregates quantity when the same (product, variant) is added twice', async () => {
    const { token, user } = await authHeader();
    const p = await createProduct({ price: 5, quantity: 50 });
    await request(app).post('/api/cart').set('Authorization', `Bearer ${token}`).send({ productId: p.id, quantity: 2 });
    await request(app).post('/api/cart').set('Authorization', `Bearer ${token}`).send({ productId: p.id, quantity: 3 });
    const items = await mockPrisma.cartItem.findMany({ where: { userId: user.id } });
    expect(items).toHaveLength(1);
    expect(items[0].quantity).toBe(5);
  });

  it('does NOT aggregate a no-variant item with a variant item', async () => {
    const { token, user } = await authHeader();
    const p = await createProduct({ price: 5, quantity: 50 });
    const v = await createVariant(p.id, { price: 7, quantity: 50 });
    await request(app).post('/api/cart').set('Authorization', `Bearer ${token}`).send({ productId: p.id, quantity: 1 });
    await request(app).post('/api/cart').set('Authorization', `Bearer ${token}`).send({ productId: p.id, variantId: v.id, quantity: 1 });
    const items = await mockPrisma.cartItem.findMany({ where: { userId: user.id } });
    expect(items).toHaveLength(2);
  });

  it('404 for an unknown product', async () => {
    const { token } = await authHeader();
    const res = await request(app)
      .post('/api/cart')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId: '00000000-0000-4000-a000-000000000000' });
    expect(res.status).toBe(404);
  });

  it('400 for an inactive product', async () => {
    const { token } = await authHeader();
    const p = await createProduct({ status: 'inactive' });
    const res = await request(app)
      .post('/api/cart')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId: p.id, quantity: 1 });
    expect(res.status).toBe(400);
  });

  it('400 when stock is insufficient', async () => {
    const { token } = await authHeader();
    const p = await createProduct({ quantity: 1 });
    const res = await request(app)
      .post('/api/cart')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId: p.id, quantity: 5 });
    expect(res.status).toBe(400);
  });

  it('400 for an inactive variant', async () => {
    const { token } = await authHeader();
    const p = await createProduct({ quantity: 50 });
    const v = await createVariant(p.id, { isActive: false, quantity: 50 });
    const res = await request(app)
      .post('/api/cart')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId: p.id, variantId: v.id, quantity: 1 });
    expect(res.status).toBe(400);
  });

  it('400 when the variant belongs to a different product (regression)', async () => {
    // A mismatched (product, variant) pair used to be stored, then the
    // order route silently ignored the variant — the cart and the order
    // disagreed about what was bought.
    const { token, user } = await authHeader();
    const p1 = await createProduct({ quantity: 50 });
    const p2 = await createProduct({ quantity: 50 });
    const v2 = await createVariant(p2.id, { quantity: 50 });
    const res = await request(app)
      .post('/api/cart')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId: p1.id, variantId: v2.id, quantity: 1 });
    expect(res.status).toBe(400);
    // And nothing was stored.
    const items = await mockPrisma.cartItem.findMany({ where: { userId: user.id } });
    expect(items).toHaveLength(0);
  });

  it('400 when quantity exceeds the order-placement cap (regression)', async () => {
    const { token } = await authHeader();
    const p = await createProduct({ quantity: 999999 });
    const res = await request(app)
      .post('/api/cart')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId: p.id, quantity: 100000 });
    expect(res.status).toBe(400);
  });
});

describe('PUT /api/cart/:id', () => {
  it('updates a cart item quantity', async () => {
    const { token, user } = await authHeader();
    const p = await createProduct({ quantity: 50 });
    const item = await createCartItem(user.id, p.id, { quantity: 1 });

    const res = await request(app)
      .put(`/api/cart/${item.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ quantity: 4 });
    expect(res.status).toBe(200);
    const after = await mockPrisma.cartItem.findUnique({ where: { id: item.id } });
    expect(after?.quantity).toBe(4);
  });

  it('rejects when the item belongs to another user (403)', async () => {
    const { token } = await authHeader();
    const other = await authHeader({ role: 'customer' });
    const p = await createProduct({ quantity: 50 });
    const item = await createCartItem(other.user.id, p.id);

    const res = await request(app)
      .put(`/api/cart/${item.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ quantity: 4 });
    expect(res.status).toBe(403);
  });

  it('rejects when stock is insufficient', async () => {
    const { token, user } = await authHeader();
    const p = await createProduct({ quantity: 1 });
    const item = await createCartItem(user.id, p.id);
    const res = await request(app)
      .put(`/api/cart/${item.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ quantity: 5 });
    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/cart/:id', () => {
  it('removes the item', async () => {
    const { token, user } = await authHeader();
    const p = await createProduct({ quantity: 50 });
    const item = await createCartItem(user.id, p.id);
    const res = await request(app)
      .delete(`/api/cart/${item.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const after = await mockPrisma.cartItem.findUnique({ where: { id: item.id } });
    expect(after).toBeNull();
  });

  it('404 for an unknown item', async () => {
    const { token } = await authHeader();
    const res = await request(app)
      .delete('/api/cart/nope')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('403 when the item belongs to someone else', async () => {
    const { token } = await authHeader();
    const other = await authHeader();
    const p = await createProduct({ quantity: 50 });
    const item = await createCartItem(other.user.id, p.id);
    const res = await request(app)
      .delete(`/api/cart/${item.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});

describe('DELETE /api/cart (clear)', () => {
  it('clears the user cart', async () => {
    const { token, user } = await authHeader();
    const p = await createProduct({ quantity: 50 });
    await createCartItem(user.id, p.id, { quantity: 1 });
    await createCartItem(user.id, p.id, { quantity: 2 });
    const res = await request(app)
      .delete('/api/cart')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const items = await mockPrisma.cartItem.findMany({ where: { userId: user.id } });
    expect(items).toHaveLength(0);
  });
});

describe('POST /api/cart/sync', () => {
  it('migrates a localStorage cart into the server cart', async () => {
    const { token, user } = await authHeader();
    const p1 = await createProduct({ quantity: 50 });
    const p2 = await createProduct({ quantity: 50 });
    const res = await request(app)
      .post('/api/cart/sync')
      .set('Authorization', `Bearer ${token}`)
      .send({ items: [{ productId: p1.id, quantity: 2 }, { productId: p2.id, quantity: 1 }] });
    expect(res.status).toBe(200);
    const items = await mockPrisma.cartItem.findMany({ where: { userId: user.id } });
    expect(items).toHaveLength(2);
  });

  it('400 when items is not an array', async () => {
    const { token } = await authHeader();
    const res = await request(app)
      .post('/api/cart/sync')
      .set('Authorization', `Bearer ${token}`)
      .send({ items: 'not-an-array' });
    expect(res.status).toBe(400);
  });
});
