/**
 * Content translations API — per-locale content overrides.
 *
 * Pins the writer surface:
 *   - GET lists all locales for an entity (public)
 *   - PUT upserts a translation (admin/manager), rejects customer + bad
 *     locale + unknown entity type + trying to translate the default language
 *   - PUT strips fields that aren't translatable for that entity type
 *   - DELETE removes a translation; 404 if absent
 *   - data round-trips as parsed JSON
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { getTestApp, cleanDatabase, authHeader } from '../helpers/db';
import { mockPrisma } from '../helpers/mockPrisma';
import type { Express } from 'express';

let app: Express;

beforeAll(async () => {
  app = await getTestApp();
});
afterAll(async () => {
  await mockPrisma.$disconnect();
});
beforeEach(async () => {
  await cleanDatabase();
});

describe('GET /api/content-translations/:entityType/:entityId', () => {
  it('returns an empty list for an entity with no translations (public)', async () => {
    const res = await request(app).get('/api/content-translations/product/p1');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('returns all locales for an entity', async () => {
    const { token } = await authHeader({ role: 'admin' });
    await request(app)
      .put('/api/content-translations/product/p1/ku')
      .set('Authorization', `Bearer ${token}`)
      .send({ data: { name: 'ئایفۆن' } });
    const res = await request(app).get('/api/content-translations/product/p1');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].locale).toBe('ku');
    expect(res.body.data[0].data.name).toBe('ئایفۆن');
  });

  it('400 for an unknown entity type', async () => {
    const res = await request(app).get('/api/content-translations/bogus/p1');
    expect(res.status).toBe(400);
  });
});

describe('PUT /api/content-translations/:entityType/:entityId/:locale', () => {
  it('admin can upsert a translation', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const res = await request(app)
      .put('/api/content-translations/product/p1/ku')
      .set('Authorization', `Bearer ${token}`)
      .send({ data: { name: 'ئایفۆن', description: 'تەلەفۆنێک' } });
    expect(res.status).toBe(200);
    expect(res.body.data.locale).toBe('ku');
    expect(res.body.data.data.name).toBe('ئایفۆن');
  });

  it('manager can upsert a translation', async () => {
    const { token } = await authHeader({ role: 'manager' });
    const res = await request(app)
      .put('/api/content-translations/category/c1/ar')
      .set('Authorization', `Bearer ${token}`)
      .send({ data: { name: 'ملابس' } });
    expect(res.status).toBe(200);
  });

  it('customer is forbidden', async () => {
    const { token } = await authHeader({ role: 'customer' });
    const res = await request(app)
      .put('/api/content-translations/product/p1/ku')
      .set('Authorization', `Bearer ${token}`)
      .send({ data: { name: 'x' } });
    expect(res.status).toBe(403);
  });

  it('rejects an unsupported locale', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const res = await request(app)
      .put('/api/content-translations/product/p1/xx')
      .set('Authorization', `Bearer ${token}`)
      .send({ data: { name: 'x' } });
    expect(res.status).toBe(400);
  });

  it('rejects translating the default language', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const res = await request(app)
      .put('/api/content-translations/product/p1/en')
      .set('Authorization', `Bearer ${token}`)
      .send({ data: { name: 'x' } });
    expect(res.status).toBe(400);
  });

  it('strips fields that are not translatable for the entity type', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const res = await request(app)
      .put('/api/content-translations/product/p1/fa')
      .set('Authorization', `Bearer ${token}`)
      .send({ data: { name: 'آیفون', price: 99, sku: 'S1' } });
    expect(res.status).toBe(200);
    expect(res.body.data.data.name).toBe('آیفون');
    expect(res.body.data.data.price).toBeUndefined();
    expect(res.body.data.data.sku).toBeUndefined();
  });

  it('upsert updates rather than duplicates', async () => {
    const { token } = await authHeader({ role: 'admin' });
    await request(app)
      .put('/api/content-translations/page/p1/ku')
      .set('Authorization', `Bearer ${token}`)
      .send({ data: { title: 'تە' } });
    await request(app)
      .put('/api/content-translations/page/p1/ku')
      .set('Authorization', `Bearer ${token}`)
      .send({ data: { title: 'دواتر', content: 'ناوەڕۆک' } });
    const res = await request(app).get('/api/content-translations/page/p1');
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].data.title).toBe('دواتر');
    expect(res.body.data[0].data.content).toBe('ناوەڕۆک');
  });
});

describe('DELETE /api/content-translations/:entityType/:entityId/:locale', () => {
  it('removes a translation', async () => {
    const { token } = await authHeader({ role: 'admin' });
    await request(app)
      .put('/api/content-translations/product/p1/ku')
      .set('Authorization', `Bearer ${token}`)
      .send({ data: { name: 'x' } });
    const del = await request(app)
      .delete('/api/content-translations/product/p1/ku')
      .set('Authorization', `Bearer ${token}`);
    expect(del.status).toBe(200);
    const res = await request(app).get('/api/content-translations/product/p1');
    expect(res.body.data).toEqual([]);
  });

  it('404 when the translation does not exist', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const res = await request(app)
      .delete('/api/content-translations/product/p1/ku')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('customer is forbidden', async () => {
    const { token } = await authHeader({ role: 'customer' });
    const res = await request(app)
      .delete('/api/content-translations/product/p1/ku')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});
