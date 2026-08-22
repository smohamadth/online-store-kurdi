/**
 * Stock alerts (in-memory) integration tests.
 *
 * The store is a Map<productKey, Alert[]>. The auth requirement is
 * that the user is either logged in OR supplies an email.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { getTestApp } from '../helpers/db';
import { mockPrisma } from '../helpers/mockPrisma';
import type { Express } from 'express';

let app: Express;
beforeAll(async () => { app = await getTestApp(); });
afterAll(async () => { await mockPrisma.$disconnect(); });
beforeEach(async () => { /* in-memory state */ });

describe('POST /api/stock-alerts', () => {
  it('subscribes an anonymous user when an email is supplied', async () => {
    const res = await request(app)
      .post('/api/stock-alerts')
      .send({ productId: 'p1', email: 'a@example.com' });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/notified/);
  });

  it('is idempotent for the same email', async () => {
    await request(app).post('/api/stock-alerts').send({ productId: 'p1', email: 'a@example.com' });
    const res = await request(app).post('/api/stock-alerts').send({ productId: 'p1', email: 'a@example.com' });
    expect(res.body.message).toMatch(/already/);
  });
});

describe('GET /api/stock-alerts/check/:productId', () => {
  it('reports whether alerts exist', async () => {
    await request(app).post('/api/stock-alerts').send({ productId: 'pX', email: 'a@example.com' });
    const res = await request(app).get('/api/stock-alerts/check/pX');
    expect(res.status).toBe(200);
    expect(res.body.data.hasAlerts).toBe(true);
  });
});

describe('DELETE /api/stock-alerts/:productId', () => {
  it('removes the subscription for the supplied email', async () => {
    await request(app).post('/api/stock-alerts').send({ productId: 'pY', email: 'a@example.com' });
    const res = await request(app).delete('/api/stock-alerts/pY?email=a@example.com');
    expect(res.status).toBe(200);
    const after = await request(app).get('/api/stock-alerts/check/pY');
    expect(after.body.data.hasAlerts).toBe(false);
  });
});
