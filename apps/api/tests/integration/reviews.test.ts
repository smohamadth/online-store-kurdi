/**
 * Review integration tests.
 *
 * Specifically covers the moderation flow (the route sets
 * `isApproved: process.env.REVIEWS_AUTO_APPROVE === 'true'`), the
 * "one review per user per product" uniqueness rule, and the admin
 * queue (`GET /api/reviews`).
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

describe('GET /api/products/:productId/reviews', () => {
  it('returns only approved reviews', async () => {
    const p = await createProduct();
    const { user } = await authHeader();
    const { user: user2 } = await authHeader();
    await mockPrisma.review.create({ data: { userId: user.id, productId: p.id, rating: 5, isApproved: true } });
    await mockPrisma.review.create({ data: { userId: user2.id, productId: p.id, rating: 3, isApproved: false } });

    const res = await request(app).get(`/api/products/${p.id}/reviews`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].rating).toBe(5);
  });
});

describe('POST /api/products/:productId/reviews', () => {
  it('creates a review (defaults to pending when REVIEWS_AUTO_APPROVE is false)', async () => {
    const { token, user } = await authHeader();
    const p = await createProduct();
    const res = await request(app)
      .post(`/api/products/${p.id}/reviews`)
      .set('Authorization', `Bearer ${token}`)
      .send({ rating: 4, title: 'Good', comment: 'Loved it' });
    expect(res.status).toBe(201);
    expect(res.body.data.isApproved).toBe(false);
    const reviews = await mockPrisma.review.findMany({ where: { userId: user.id } });
    expect(reviews).toHaveLength(1);
  });

  it('rejects a rating outside 1..5', async () => {
    const { token } = await authHeader();
    const p = await createProduct();
    for (const r of [0, 6, -1]) {
      const res = await request(app)
        .post(`/api/products/${p.id}/reviews`)
        .set('Authorization', `Bearer ${token}`)
        .send({ rating: r });
      expect(res.status).toBe(400);
    }
  });

  it('rejects a duplicate review from the same user', async () => {
    const { token, user } = await authHeader();
    const p = await createProduct();
    await mockPrisma.review.create({ data: { userId: user.id, productId: p.id, rating: 5 } });
    const res = await request(app)
      .post(`/api/products/${p.id}/reviews`)
      .set('Authorization', `Bearer ${token}`)
      .send({ rating: 1 });
    expect(res.status).toBe(400);
  });

  it('404 for an unknown product', async () => {
    const { token } = await authHeader();
    const res = await request(app)
      .post('/api/products/nope/reviews')
      .set('Authorization', `Bearer ${token}`)
      .send({ rating: 5 });
    expect(res.status).toBe(404);
  });
});

describe('PUT /api/reviews/:reviewId', () => {
  it('lets the author update their own review', async () => {
    const { token, user } = await authHeader();
    const p = await createProduct();
    const r = await mockPrisma.review.create({ data: { userId: user.id, productId: p.id, rating: 3 } });
    const res = await request(app)
      .put(`/api/reviews/${r.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ rating: 5 });
    expect(res.status).toBe(200);
    const after = await mockPrisma.review.findUnique({ where: { id: r.id } });
    expect(after?.rating).toBe(5);
  });

  it('lets an admin toggle isApproved', async () => {
    const { user } = await authHeader();
    const { token: adminToken } = await authHeader({ role: 'admin' });
    const p = await createProduct();
    const r = await mockPrisma.review.create({ data: { userId: user.id, productId: p.id, rating: 3, isApproved: false } });
    const res = await request(app)
      .put(`/api/reviews/${r.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isApproved: true });
    expect(res.status).toBe(200);
    const after = await mockPrisma.review.findUnique({ where: { id: r.id } });
    expect(after?.isApproved).toBe(true);
  });

  it('forbids a non-owner from changing isApproved', async () => {
    const { user } = await authHeader();
    const { token: other } = await authHeader({ role: 'customer' });
    const p = await createProduct();
    const r = await mockPrisma.review.create({ data: { userId: user.id, productId: p.id, rating: 3, isApproved: false } });
    const res = await request(app)
      .put(`/api/reviews/${r.id}`)
      .set('Authorization', `Bearer ${other}`)
      .send({ isApproved: true });
    // A non-owner non-moderator is rejected outright.
    expect(res.status).toBe(403);
    const after = await mockPrisma.review.findUnique({ where: { id: r.id } });
    expect(after?.isApproved).toBe(false);
  });

  it('rejects a different non-owner customer (403)', async () => {
    const { user } = await authHeader();
    const { token: other } = await authHeader();
    const p = await createProduct();
    const r = await mockPrisma.review.create({ data: { userId: user.id, productId: p.id, rating: 3 } });
    const res = await request(app)
      .put(`/api/reviews/${r.id}`)
      .set('Authorization', `Bearer ${other}`)
      .send({ rating: 1 });
    expect(res.status).toBe(403);
  });
});

describe('DELETE /api/reviews/:reviewId', () => {
  it('lets the author delete their own review', async () => {
    const { token, user } = await authHeader();
    const p = await createProduct();
    const r = await mockPrisma.review.create({ data: { userId: user.id, productId: p.id, rating: 5 } });
    const res = await request(app)
      .delete(`/api/reviews/${r.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const after = await mockPrisma.review.findUnique({ where: { id: r.id } });
    expect(after).toBeNull();
  });

  it('lets an admin delete any review', async () => {
    const { user } = await authHeader();
    const { token: adminToken } = await authHeader({ role: 'admin' });
    const p = await createProduct();
    const r = await mockPrisma.review.create({ data: { userId: user.id, productId: p.id, rating: 5 } });
    const res = await request(app)
      .delete(`/api/reviews/${r.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });

  it('forbids another customer from deleting (403)', async () => {
    const { user } = await authHeader();
    const { token: other } = await authHeader();
    const p = await createProduct();
    const r = await mockPrisma.review.create({ data: { userId: user.id, productId: p.id, rating: 5 } });
    const res = await request(app)
      .delete(`/api/reviews/${r.id}`)
      .set('Authorization', `Bearer ${other}`);
    expect(res.status).toBe(403);
  });
});

describe('GET /api/reviews (admin queue)', () => {
  it('returns every review with the user + product', async () => {
    const { token: adminToken } = await authHeader({ role: 'admin' });
    const { user } = await authHeader();
    const p = await createProduct();
    await mockPrisma.review.create({ data: { userId: user.id, productId: p.id, rating: 5, isApproved: true } });
    await mockPrisma.review.create({ data: { userId: user.id, productId: p.id, rating: 1, isApproved: false } });
    const res = await request(app).get('/api/reviews').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
  });

  it('filters by status=pending', async () => {
    const { token: adminToken } = await authHeader({ role: 'admin' });
    const { user } = await authHeader();
    const p = await createProduct();
    await mockPrisma.review.create({ data: { userId: user.id, productId: p.id, rating: 5, isApproved: true } });
    await mockPrisma.review.create({ data: { userId: user.id, productId: p.id, rating: 1, isApproved: false } });
    const res = await request(app).get('/api/reviews?status=pending').set('Authorization', `Bearer ${adminToken}`);
    expect(res.body.data).toHaveLength(1);
  });

  it('rejects a non-admin (403)', async () => {
    const { token } = await authHeader();
    const res = await request(app).get('/api/reviews').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});

describe('GET /api/users/me/reviews', () => {
  it('returns the user own reviews with the product name', async () => {
    const { token, user } = await authHeader();
    const p = await createProduct({ name: 'Cool Hat' });
    await mockPrisma.review.create({ data: { userId: user.id, productId: p.id, rating: 5 } });
    const res = await request(app).get('/api/users/me/reviews').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].productName).toBe('Cool Hat');
  });
});

/**
 * Verified-purchaser badge.
 *
 * The previous route hard-coded `isVerified: true` on every
 * review, which made the badge useless. These tests pin the
 * new behaviour: the badge lights up only when the reviewer
 * has a non-cancelled / non-refunded order containing the
 * product.
 */
describe('POST /api/products/:productId/reviews: verified-purchaser badge', () => {
  it('sets isVerified=true when the user has a non-cancelled order for the product', async () => {
    const { token, user } = await authHeader();
    const p = await createProduct();
    // A shipped order for this user containing this product.
    const order = await mockPrisma.order.create({
      data: { userId: user.id, orderNumber: 'ORD-1', status: 'shipped', subtotal: 10, totalAmount: 10 },
    });
    await mockPrisma.orderItem.create({
      data: { orderId: order.id, productId: p.id, quantity: 1, unitPrice: 10, totalPrice: 10 },
    });
    const res = await request(app)
      .post(`/api/products/${p.id}/reviews`)
      .set('Authorization', `Bearer ${token}`)
      .send({ rating: 5 });
    expect(res.status).toBe(201);
    expect(res.body.data.isVerified).toBe(true);
  });

  it('sets isVerified=false when the user has no orders for the product', async () => {
    const { token, user } = await authHeader();
    const p = await createProduct();
    // An order for a *different* product should not count.
    const otherProduct = await createProduct({ slug: 'other' });
    const order = await mockPrisma.order.create({
      data: { userId: user.id, orderNumber: 'ORD-1', status: 'shipped', subtotal: 10, totalAmount: 10 },
    });
    await mockPrisma.orderItem.create({
      data: { orderId: order.id, productId: otherProduct.id, quantity: 1, unitPrice: 10, totalPrice: 10 },
    });
    const res = await request(app)
      .post(`/api/products/${p.id}/reviews`)
      .set('Authorization', `Bearer ${token}`)
      .send({ rating: 5 });
    expect(res.status).toBe(201);
    expect(res.body.data.isVerified).toBe(false);
  });

  it('sets isVerified=false when the only matching order is cancelled', async () => {
    const { token, user } = await authHeader();
    const p = await createProduct();
    const order = await mockPrisma.order.create({
      data: { userId: user.id, orderNumber: 'ORD-1', status: 'cancelled', subtotal: 10, totalAmount: 10 },
    });
    await mockPrisma.orderItem.create({
      data: { orderId: order.id, productId: p.id, quantity: 1, unitPrice: 10, totalPrice: 10 },
    });
    const res = await request(app)
      .post(`/api/products/${p.id}/reviews`)
      .set('Authorization', `Bearer ${token}`)
      .send({ rating: 5 });
    expect(res.body.data.isVerified).toBe(false);
  });

  it('sets isVerified=false when the only matching order is refunded', async () => {
    const { token, user } = await authHeader();
    const p = await createProduct();
    const order = await mockPrisma.order.create({
      data: { userId: user.id, orderNumber: 'ORD-1', status: 'refunded', subtotal: 10, totalAmount: 10 },
    });
    await mockPrisma.orderItem.create({
      data: { orderId: order.id, productId: p.id, quantity: 1, unitPrice: 10, totalPrice: 10 },
    });
    const res = await request(app)
      .post(`/api/products/${p.id}/reviews`)
      .set('Authorization', `Bearer ${token}`)
      .send({ rating: 5 });
    expect(res.body.data.isVerified).toBe(false);
  });

  it('counts any non-cancelled status (pending / processing / shipped / delivered)', async () => {
    for (const status of ['pending', 'processing', 'shipped', 'delivered']) {
      await cleanDatabase();
      const { token, user } = await authHeader();
      const p = await createProduct();
      const order = await mockPrisma.order.create({
        data: { userId: user.id, orderNumber: `O-${status}`, status, subtotal: 10, totalAmount: 10 },
      });
      await mockPrisma.orderItem.create({
        data: { orderId: order.id, productId: p.id, quantity: 1, unitPrice: 10, totalPrice: 10 },
      });
      const res = await request(app)
        .post(`/api/products/${p.id}/reviews`)
        .set('Authorization', `Bearer ${token}`)
        .send({ rating: 5 });
      expect(res.body.data.isVerified, `status=${status}`).toBe(true);
    }
  });
});

/**
 * Review photos.
 *
 * Photos are uploaded through `POST /api/upload/image` (which
 * returns a URL + thumbnail). The review POST / PUT just take
 * a list of URLs and persist them as `ReviewPhoto` rows.
 */
describe('POST /api/products/:productId/reviews: photos', () => {
  it('persists photos and returns them on the response', async () => {
    const { token, user } = await authHeader();
    const p = await createProduct();
    const res = await request(app)
      .post(`/api/products/${p.id}/reviews`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        rating: 5,
        photos: [
          'https://cdn.example.com/a.jpg',
          { url: 'https://cdn.example.com/b.jpg', thumbnail: 'https://cdn.example.com/b-thumb.jpg' },
        ],
      });
    expect(res.status).toBe(201);
    expect(res.body.data.photos).toHaveLength(2);
    expect(res.body.data.photos[0].url).toBe('https://cdn.example.com/a.jpg');
    expect(res.body.data.photos[1].thumbnail).toBe('https://cdn.example.com/b-thumb.jpg');
    // Persisted as rows too.
    const photos = await mockPrisma.reviewPhoto.findMany({ where: { review: { userId: user.id } } });
    expect(photos).toHaveLength(2);
  });

  it('rejects more than the cap with a 400', async () => {
    const { token } = await authHeader();
    const p = await createProduct();
    const tooMany = Array.from({ length: 6 }, (_, i) => `https://x/${i}.jpg`);
    const res = await request(app)
      .post(`/api/products/${p.id}/reviews`)
      .set('Authorization', `Bearer ${token}`)
      .send({ rating: 5, photos: tooMany });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/at most/);
  });

  it('rejects non-array photos with a 400', async () => {
    const { token } = await authHeader();
    const p = await createProduct();
    const res = await request(app)
      .post(`/api/products/${p.id}/reviews`)
      .set('Authorization', `Bearer ${token}`)
      .send({ rating: 5, photos: 'not-an-array' });
    expect(res.status).toBe(400);
  });

  it('rejects photo entries without a url with a 400', async () => {
    const { token } = await authHeader();
    const p = await createProduct();
    const res = await request(app)
      .post(`/api/products/${p.id}/reviews`)
      .set('Authorization', `Bearer ${token}`)
      .send({ rating: 5, photos: [{ thumbnail: 'x' }] });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('url is required');
  });

  it('allows a review with no photos', async () => {
    const { token } = await authHeader();
    const p = await createProduct();
    const res = await request(app)
      .post(`/api/products/${p.id}/reviews`)
      .set('Authorization', `Bearer ${token}`)
      .send({ rating: 4 });
    expect(res.status).toBe(201);
    expect(res.body.data.photos).toEqual([]);
  });
});

describe('PUT /api/reviews/:reviewId: photos', () => {
  it('replaces the photo set when the request includes a new list', async () => {
    const { token, user } = await authHeader();
    const p = await createProduct();
    const r = await mockPrisma.review.create({
      data: { userId: user.id, productId: p.id, rating: 4, isVerified: true },
    });
    await mockPrisma.reviewPhoto.create({ data: { reviewId: r.id, url: 'old-1', sortOrder: 0 } });
    await mockPrisma.reviewPhoto.create({ data: { reviewId: r.id, url: 'old-2', sortOrder: 1 } });
    const res = await request(app)
      .put(`/api/reviews/${r.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ photos: ['new-1', 'new-2', 'new-3'] });
    expect(res.status).toBe(200);
    expect(res.body.data.photos.map((p: any) => p.url)).toEqual(['new-1', 'new-2', 'new-3']);
    const persisted = await mockPrisma.reviewPhoto.findMany({ where: { reviewId: r.id } });
    expect(persisted).toHaveLength(3);
  });

  it('removes all photos when the new list is empty', async () => {
    const { token, user } = await authHeader();
    const p = await createProduct();
    const r = await mockPrisma.review.create({
      data: { userId: user.id, productId: p.id, rating: 4 },
    });
    await mockPrisma.reviewPhoto.create({ data: { reviewId: r.id, url: 'old-1', sortOrder: 0 } });
    const res = await request(app)
      .put(`/api/reviews/${r.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ photos: [] });
    expect(res.status).toBe(200);
    const persisted = await mockPrisma.reviewPhoto.findMany({ where: { reviewId: r.id } });
    expect(persisted).toHaveLength(0);
  });

  it('leaves photos alone when the request omits the key', async () => {
    const { token, user } = await authHeader();
    const p = await createProduct();
    const r = await mockPrisma.review.create({
      data: { userId: user.id, productId: p.id, rating: 4 },
    });
    await mockPrisma.reviewPhoto.create({ data: { reviewId: r.id, url: 'keep-me', sortOrder: 0 } });
    const res = await request(app)
      .put(`/api/reviews/${r.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ rating: 5 });
    expect(res.status).toBe(200);
    const persisted = await mockPrisma.reviewPhoto.findMany({ where: { reviewId: r.id } });
    expect(persisted).toHaveLength(1);
    expect(persisted[0].url).toBe('keep-me');
  });
});
