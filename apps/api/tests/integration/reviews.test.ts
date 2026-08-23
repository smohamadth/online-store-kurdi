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
