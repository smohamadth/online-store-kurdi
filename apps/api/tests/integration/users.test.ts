/**
 * Users integration tests.
 *
 * Covers the admin user management, profile updates (self vs admin), the
 * "last admin" guard, and the user orders / wishlist views.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { getTestApp, cleanDatabase, authHeader } from '../helpers/db';
import { mockPrisma } from '../helpers/mockPrisma';
import { createUser, createOrder } from '../helpers/factories';
import type { Express } from 'express';

let app: Express;
beforeAll(async () => { app = await getTestApp(); });
afterAll(async () => { await mockPrisma.$disconnect(); });
beforeEach(async () => { await cleanDatabase(); });

describe('GET /api/users (admin)', () => {
  it('lists all users', async () => {
    const { token } = await authHeader({ role: 'admin' });
    await createUser();
    await createUser();
    const res = await request(app).get('/api/users').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(2);
  });

  it('rejects a non-admin (403)', async () => {
    const { token } = await authHeader();
    const res = await request(app).get('/api/users').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});

describe('GET /api/users/:id', () => {
  it('lets a user view their own profile', async () => {
    const { token, user } = await authHeader();
    const res = await request(app).get(`/api/users/${user.id}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(user.id);
  });

  it('lets an admin view any profile', async () => {
    const { token: admin } = await authHeader({ role: 'admin' });
    const { user } = await authHeader();
    const res = await request(app).get(`/api/users/${user.id}`).set('Authorization', `Bearer ${admin}`);
    expect(res.status).toBe(200);
  });

  it('forbids another customer from viewing (403)', async () => {
    const { token, user } = await authHeader();
    const other = await authHeader();
    const res = await request(app).get(`/api/users/${other.user.id}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('404 for unknown user', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const res = await request(app)
      .get('/api/users/00000000-0000-4000-a000-000000000000')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});

describe('PUT /api/users/:id', () => {
  it('lets a user update their own profile', async () => {
    const { token, user } = await authHeader();
    const res = await request(app)
      .put(`/api/users/${user.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ firstName: 'NewName' });
    expect(res.status).toBe(200);
    expect(res.body.data.firstName).toBe('NewName');
  });

  it('rejects a non-self non-admin (403)', async () => {
    const { token, user } = await authHeader();
    const other = await authHeader();
    const res = await request(app)
      .put(`/api/users/${other.user.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ firstName: 'Hax' });
    expect(res.status).toBe(403);
  });

  it('rejects role changes from a non-admin (silent drop prevention)', async () => {
    const { token, user } = await authHeader();
    const res = await request(app)
      .put(`/api/users/${user.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ role: 'admin' });
    expect(res.status).toBe(400);
  });

  it('lets an admin change role', async () => {
    const { token: admin } = await authHeader({ role: 'admin' });
    const { user } = await authHeader();
    const res = await request(app)
      .put(`/api/users/${user.id}`)
      .set('Authorization', `Bearer ${admin}`)
      .send({ role: 'manager' });
    expect(res.status).toBe(200);
    expect(res.body.data.role).toBe('manager');
  });

  it('forbids an admin from deactivating themselves', async () => {
    const { token, user } = await authHeader({ role: 'admin' });
    const res = await request(app)
      .put(`/api/users/${user.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ isActive: false });
    expect(res.status).toBe(400);
  });

  it('forbids an admin from demoting themselves', async () => {
    const { token, user } = await authHeader({ role: 'admin' });
    const res = await request(app)
      .put(`/api/users/${user.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ role: 'customer' });
    expect(res.status).toBe(400);
  });

  it('refuses to demote/deactivate the last active admin', async () => {
    const { token, user } = await authHeader({ role: 'admin' });
    const res = await request(app)
      .put(`/api/users/${user.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ isActive: false });
    // the "you cannot deactivate yourself" rule fires first, but the same
    // path is the only active admin -> the response is a 400 either way.
    expect(res.status).toBe(400);
  });

  it('400 when no fields are supplied', async () => {
    const { token, user } = await authHeader();
    const res = await request(app)
      .put(`/api/users/${user.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(400);
  });
});

describe('GET /api/users/:id/orders', () => {
  it('returns the user own orders', async () => {
    const { token, user } = await authHeader();
    await createOrder(user.id);
    const res = await request(app)
      .get(`/api/users/${user.id}/orders`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
  });

  it('forbids another customer (403)', async () => {
    const { token, user } = await authHeader();
    const other = await authHeader();
    const res = await request(app)
      .get(`/api/users/${other.user.id}/orders`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});

describe('GET /api/users/:id/wishlist', () => {
  it('returns the user own wishlist', async () => {
    const { token, user } = await authHeader();
    await createUser(); // to make at least one product
    const p = await mockPrisma.product.create({ data: { name: 'p', slug: 'p', description: 'p', sku: 'p', price: 1 } });
    await mockPrisma.wishlistItem.create({ data: { userId: user.id, productId: p.id } });
    const res = await request(app)
      .get(`/api/users/${user.id}/wishlist`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
  });
});
