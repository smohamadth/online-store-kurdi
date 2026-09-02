/**
 * Wishlist integration tests.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { getTestApp, cleanDatabase, authHeader } from '../helpers/db';
import { mockPrisma } from '../helpers/mockPrisma';
import { createProduct, createWishlistItem } from '../helpers/factories';
import type { Express } from 'express';

let app: Express;
beforeAll(async () => { app = await getTestApp(); });
afterAll(async () => { await mockPrisma.$disconnect(); });
beforeEach(async () => { await cleanDatabase(); });

describe('GET /api/wishlist', () => {
  it('returns the user wishlist', async () => {
    const { token, user } = await authHeader();
    const p = await createProduct();
    await createWishlistItem(user.id, p.id);
    const res = await request(app).get('/api/wishlist').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it('401 unauthenticated', async () => {
    const res = await request(app).get('/api/wishlist');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/wishlist', () => {
  it('adds a product to the wishlist', async () => {
    const { token, user } = await authHeader();
    const p = await createProduct();
    const res = await request(app)
      .post('/api/wishlist')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId: p.id });
    expect(res.status).toBe(201);
    const items = await mockPrisma.wishlistItem.findMany({ where: { userId: user.id } });
    expect(items).toHaveLength(1);
  });

  it('400 if the product is already in the wishlist', async () => {
    const { token, user } = await authHeader();
    const p = await createProduct();
    await createWishlistItem(user.id, p.id);
    const res = await request(app)
      .post('/api/wishlist')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId: p.id });
    expect(res.status).toBe(400);
  });

  it('404 for an unknown product', async () => {
    const { token } = await authHeader();
    const res = await request(app)
      .post('/api/wishlist')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId: '00000000-0000-4000-a000-000000000000' });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/wishlist/:productId', () => {
  it('removes the item', async () => {
    const { token, user } = await authHeader();
    const p = await createProduct();
    await createWishlistItem(user.id, p.id);
    const res = await request(app)
      .delete(`/api/wishlist/${p.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const items = await mockPrisma.wishlistItem.findMany({ where: { userId: user.id } });
    expect(items).toHaveLength(0);
  });

  it('404 when the item is not in the wishlist', async () => {
    const { token } = await authHeader();
    const p = await createProduct();
    const res = await request(app)
      .delete(`/api/wishlist/${p.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});

describe('POST /api/wishlist/check', () => {
  it('reports whether a product is in the wishlist', async () => {
    const { token, user } = await authHeader();
    const p = await createProduct();
    await createWishlistItem(user.id, p.id);
    const res = await request(app)
      .post('/api/wishlist/check')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId: p.id });
    expect(res.status).toBe(200);
    expect(res.body.data.inWishlist).toBe(true);
  });
});

describe('POST /api/wishlist/move-to-cart', () => {
  it('moves an item from the wishlist into the cart', async () => {
    const { token, user } = await authHeader();
    const p = await createProduct({ quantity: 50 });
    await createWishlistItem(user.id, p.id);
    const res = await request(app)
      .post('/api/wishlist/move-to-cart')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId: p.id, quantity: 1 });
    expect(res.status).toBe(200);
    const wish = await mockPrisma.wishlistItem.findMany({ where: { userId: user.id } });
    const cart = await mockPrisma.cartItem.findMany({ where: { userId: user.id } });
    expect(wish).toHaveLength(0);
    expect(cart).toHaveLength(1);
  });

  it('404 when the product is not in the wishlist', async () => {
    const { token } = await authHeader();
    const p = await createProduct();
    const res = await request(app)
      .post('/api/wishlist/move-to-cart')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId: p.id, quantity: 1 });
    expect(res.status).toBe(404);
  });

  it('rejects a hostile quantity (400, nothing written)', async () => {
    // Regression: `quantity || 1` stored -5/1.5/'abc'/1e9 straight into
    // the cart — the cart add route validates int>=1; move-to-cart must
    // match that contract.
    const { token, user } = await authHeader();
    const p = await createProduct({ quantity: 50 });
    await createWishlistItem(user.id, p.id);
    for (const quantity of [-5, 1.5, 'abc', 0, 1000000, null]) {
      const res = await request(app)
        .post('/api/wishlist/move-to-cart')
        .set('Authorization', `Bearer ${token}`)
        .send({ productId: p.id, quantity });
      expect(res.status).toBe(400);
      // The wishlist row must survive the rejection.
      const wish = await mockPrisma.wishlistItem.findMany({ where: { userId: user.id } });
      expect(wish).toHaveLength(1);
    }
    const cart = await mockPrisma.cartItem.findMany({ where: { userId: user.id } });
    expect(cart).toHaveLength(0);
  });

  it('404 + cleanup when the product is no longer active', async () => {
    const { token, user } = await authHeader();
    const p = await createProduct({ quantity: 50 });
    await createWishlistItem(user.id, p.id);
    await mockPrisma.product.update({ where: { id: p.id }, data: { status: 'archived' } });
    const res = await request(app)
      .post('/api/wishlist/move-to-cart')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId: p.id, quantity: 1 });
    expect(res.status).toBe(404);
    // Dead wishlist rows self-clean.
    const wish = await mockPrisma.wishlistItem.findMany({ where: { userId: user.id } });
    expect(wish).toHaveLength(0);
  });
});
