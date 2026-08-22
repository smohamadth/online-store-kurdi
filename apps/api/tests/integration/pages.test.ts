/**
 * Pages integration tests.
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

const pageBody = (over: any = {}) => ({
  slug: 'about-us',
  title: 'About Us',
  content: 'About our company.',
  ...over,
});

describe('GET /api/pages (public)', () => {
  it('returns only published pages', async () => {
    const { token } = await authHeader({ role: 'admin' });
    await request(app).post('/api/pages').set('Authorization', `Bearer ${token}`).send(pageBody({ slug: 'pub', status: 'published' }));
    await request(app).post('/api/pages').set('Authorization', `Bearer ${token}`).send(pageBody({ slug: 'drft', status: 'draft' }));
    const res = await request(app).get('/api/pages');
    expect(res.status).toBe(200);
    expect(res.body.data.every((p: any) => p.slug !== 'drft')).toBe(true);
  });
});

describe('GET /api/pages/slug/:slug (public)', () => {
  it('returns a published page', async () => {
    const { token } = await authHeader({ role: 'admin' });
    await request(app).post('/api/pages').set('Authorization', `Bearer ${token}`).send(pageBody());
    const res = await request(app).get('/api/pages/slug/about-us');
    expect(res.status).toBe(200);
  });

  it('404s a draft', async () => {
    const { token } = await authHeader({ role: 'admin' });
    await request(app).post('/api/pages').set('Authorization', `Bearer ${token}`).send(pageBody({ status: 'draft' }));
    const res = await request(app).get('/api/pages/slug/about-us');
    expect(res.status).toBe(404);
  });
});

describe('GET /api/pages/all (admin)', () => {
  it('returns drafts and published alike', async () => {
    const { token } = await authHeader({ role: 'admin' });
    await request(app).post('/api/pages').set('Authorization', `Bearer ${token}`).send(pageBody({ slug: 'p1', status: 'draft' }));
    const res = await request(app).get('/api/pages/all').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
  });

  it('rejects a customer (403)', async () => {
    const { token } = await authHeader();
    const res = await request(app).get('/api/pages/all').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});

describe('POST /api/pages (admin)', () => {
  it('creates a published page by default', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const res = await request(app).post('/api/pages').set('Authorization', `Bearer ${token}`).send(pageBody());
    expect(res.status).toBe(201);
  });

  it('rejects a reserved slug (admin)', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const res = await request(app).post('/api/pages').set('Authorization', `Bearer ${token}`).send(pageBody({ slug: 'admin' }));
    expect(res.status).toBe(400);
  });

  it('409 on duplicate slug', async () => {
    const { token } = await authHeader({ role: 'admin' });
    await request(app).post('/api/pages').set('Authorization', `Bearer ${token}`).send(pageBody());
    const res = await request(app).post('/api/pages').set('Authorization', `Bearer ${token}`).send(pageBody());
    expect(res.status).toBe(409);
  });
});

describe('PUT /api/pages/:id (admin)', () => {
  it('updates a page', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const created = await request(app).post('/api/pages').set('Authorization', `Bearer ${token}`).send(pageBody());
    const res = await request(app).put(`/api/pages/${created.body.data.id}`).set('Authorization', `Bearer ${token}`).send({ title: 'New' });
    expect(res.status).toBe(200);
  });

  it('400 when no changes', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const created = await request(app).post('/api/pages').set('Authorization', `Bearer ${token}`).send(pageBody());
    const res = await request(app).put(`/api/pages/${created.body.data.id}`).set('Authorization', `Bearer ${token}`).send({});
    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/pages/:id (admin)', () => {
  it('removes a page', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const created = await request(app).post('/api/pages').set('Authorization', `Bearer ${token}`).send(pageBody());
    const res = await request(app).delete(`/api/pages/${created.body.data.id}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});
