/**
 * Banner integration tests.
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

const bannerBody = (over: any = {}) => ({
  title: 'Big Sale',
  image: 'https://example.com/b.jpg',
  ...over,
});

describe('GET /api/banners (public)', () => {
  it('returns active banners', async () => {
    const { token } = await authHeader({ role: 'admin' });
    await request(app).post('/api/banners').set('Authorization', `Bearer ${token}`).send(bannerBody({ isActive: true }));
    await request(app).post('/api/banners').set('Authorization', `Bearer ${token}`).send(bannerBody({ title: 'Hidden', isActive: false }));
    const res = await request(app).get('/api/banners');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });
});

describe('GET /api/banners/all (admin)', () => {
  it('returns every banner regardless of active state', async () => {
    const { token } = await authHeader({ role: 'admin' });
    await request(app).post('/api/banners').set('Authorization', `Bearer ${token}`).send(bannerBody({ isActive: false }));
    const res = await request(app).get('/api/banners/all').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
  });

  it('rejects a customer (403)', async () => {
    const { token } = await authHeader();
    const res = await request(app).get('/api/banners/all').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});

describe('POST /api/banners (admin/manager)', () => {
  it('creates a banner', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const res = await request(app)
      .post('/api/banners')
      .set('Authorization', `Bearer ${token}`)
      .send(bannerBody());
    expect(res.status).toBe(201);
    expect(res.body.data.title).toBe('Big Sale');
  });
});

describe('PUT /api/banners/:id (admin)', () => {
  it('updates a banner', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const created = await request(app).post('/api/banners').set('Authorization', `Bearer ${token}`).send(bannerBody());
    const res = await request(app)
      .put(`/api/banners/${created.body.data.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Updated' });
    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe('Updated');
  });
});

describe('PUT /api/banners/bulk/reorder', () => {
  it('reorders banners', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const a = await request(app).post('/api/banners').set('Authorization', `Bearer ${token}`).send(bannerBody({ title: 'A' }));
    const b = await request(app).post('/api/banners').set('Authorization', `Bearer ${token}`).send(bannerBody({ title: 'B' }));
    const res = await request(app)
      .put('/api/banners/bulk/reorder')
      .set('Authorization', `Bearer ${token}`)
      .send({ items: [
        { id: a.body.data.id, sortOrder: 2 },
        { id: b.body.data.id, sortOrder: 1 },
      ] });
    expect(res.status).toBe(200);
  });
});

describe('DELETE /api/banners/:id', () => {
  it('removes a banner', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const created = await request(app).post('/api/banners').set('Authorization', `Bearer ${token}`).send(bannerBody());
    const res = await request(app)
      .delete(`/api/banners/${created.body.data.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});
