/**
 * Payments integration tests.
 *
 * Notable paths:
 *   - /process refuses a customer unless PAYMENTS_ALLOW_MOCK=true
 *   - already-paid orders are rejected
 *   - the order's payment status is updated to 'completed'
 *   - /refund sets the order to 'refunded'
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { getTestApp, cleanDatabase, authHeader } from '../helpers/db';
import { mockPrisma } from '../helpers/mockPrisma';
import { createOrder } from '../helpers/factories';
import type { Express } from 'express';

let app: Express;
beforeAll(async () => { app = await getTestApp(); });
afterAll(async () => { await mockPrisma.$disconnect(); });
beforeEach(async () => { await cleanDatabase(); });

describe('GET /api/payments (admin)', () => {
  it('lists payments (empty by default)', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const res = await request(app).get('/api/payments').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('rejects a non-admin (403)', async () => {
    const { token } = await authHeader();
    const res = await request(app).get('/api/payments').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});

describe('POST /api/payments/process', () => {
  it('returns 501 for a customer (mock payments disabled)', async () => {
    const { token, user } = await authHeader();
    const o = await createOrder(user.id, { paymentStatus: 'pending' });
    const res = await request(app)
      .post('/api/payments/process')
      .set('Authorization', `Bearer ${token}`)
      .send({ orderId: o.id, paymentMethod: 'stripe' });
    expect(res.status).toBe(501);
  });

  it('lets an admin settle a payment', async () => {
    const { token: admin } = await authHeader({ role: 'admin' });
    const { user } = await authHeader();
    const o = await createOrder(user.id, { paymentStatus: 'pending' });
    const res = await request(app)
      .post('/api/payments/process')
      .set('Authorization', `Bearer ${admin}`)
      .send({ orderId: o.id, paymentMethod: 'stripe' });
    expect(res.status).toBe(200);
    const after = await mockPrisma.order.findUnique({ where: { id: o.id } });
    expect(after?.paymentStatus).toBe('completed');
  });

  it('rejects an already-paid order (400)', async () => {
    const { token: admin } = await authHeader({ role: 'admin' });
    const { user } = await authHeader();
    const o = await createOrder(user.id, { paymentStatus: 'completed' });
    const res = await request(app)
      .post('/api/payments/process')
      .set('Authorization', `Bearer ${admin}`)
      .send({ orderId: o.id });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/payments/refund (admin)', () => {
  it('refunds a paid order', async () => {
    const { token: admin } = await authHeader({ role: 'admin' });
    const { user } = await authHeader();
    const o = await createOrder(user.id, { paymentStatus: 'completed' });
    const res = await request(app)
      .post('/api/payments/refund')
      .set('Authorization', `Bearer ${admin}`)
      .send({ orderId: o.id, reason: 'customer request' });
    expect(res.status).toBe(200);
  });

  it('rejects an unpaid order (400)', async () => {
    const { token: admin } = await authHeader({ role: 'admin' });
    const { user } = await authHeader();
    const o = await createOrder(user.id, { paymentStatus: 'pending' });
    const res = await request(app)
      .post('/api/payments/refund')
      .set('Authorization', `Bearer ${admin}`)
      .send({ orderId: o.id });
    expect(res.status).toBe(400);
  });

  it('rejects a non-admin (403)', async () => {
    const { token, user } = await authHeader();
    const o = await createOrder(user.id, { paymentStatus: 'completed' });
    const res = await request(app)
      .post('/api/payments/refund')
      .set('Authorization', `Bearer ${token}`)
      .send({ orderId: o.id });
    expect(res.status).toBe(403);
  });
});

describe('GET /api/payments/order/:orderId', () => {
  it('returns the payments for the order', async () => {
    const { token, user } = await authHeader();
    const o = await createOrder(user.id, { paymentStatus: 'pending' });
    const res = await request(app)
      .get(`/api/payments/order/${o.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('forbids another customer (403)', async () => {
    const { user: a } = await authHeader();
    const { token: b } = await authHeader();
    const o = await createOrder(a.id);
    const res = await request(app)
      .get(`/api/payments/order/${o.id}`)
      .set('Authorization', `Bearer ${b}`);
    expect(res.status).toBe(403);
  });
});
