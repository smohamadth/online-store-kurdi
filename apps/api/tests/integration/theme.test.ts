/**
 * Theme integration tests.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { getTestApp, cleanDatabase, authHeader } from '../helpers/db';
import { mockPrisma } from '../helpers/mockPrisma';
import type { Express } from 'express';

let app: Express;
beforeAll(async () => { app = await getTestApp(); });
afterAll(async () => { await mockPrisma.$disconnect(); });
beforeEach(async () => { await cleanDatabase(); });

describe('GET /api/theme (public)', () => {
  it('returns the default theme', async () => {
    const res = await request(app).get('/api/theme');
    expect(res.status).toBe(200);
    expect(res.body.data).toBeTruthy();
  });
});

describe('PUT /api/theme (admin)', () => {
  it('updates theme', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const res = await request(app)
      .put('/api/theme')
      .set('Authorization', `Bearer ${token}`)
      .send({ primaryColor: '#ff0000' });
    expect(res.status).toBe(200);
  });

  it('rejects a customer (403)', async () => {
    const { token } = await authHeader();
    const res = await request(app)
      .put('/api/theme')
      .set('Authorization', `Bearer ${token}`)
      .send({ primaryColor: '#ff0000' });
    expect(res.status).toBe(403);
  });
});

describe('POST /api/theme/reset (admin)', () => {
  it('resets to defaults', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const res = await request(app).post('/api/theme/reset').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});
