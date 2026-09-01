/**
 * Category integration tests.
 *
 * The route accepts both a UUID and a slug on GET /:id and DELETE
 * (so category pages addressed by slug work). Tests cover both
 * shapes, the "cannot delete a category with products" guard, and
 * the admin authorization rules.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { getTestApp, cleanDatabase, authHeader } from '../helpers/db';
import { mockPrisma } from '../helpers/mockPrisma';
import { createCategory, createProduct } from '../helpers/factories';
import type { Express } from 'express';

let app: Express;
beforeAll(async () => { app = await getTestApp(); });
afterAll(async () => { await mockPrisma.$disconnect(); });
beforeEach(async () => { await cleanDatabase(); });

describe('GET /api/categories', () => {
  it('returns all categories with product count', async () => {
    const cat = await createCategory({ slug: 'books' });
    await createProduct({ categoryId: cat.id });
    await createProduct({ categoryId: cat.id });
    const res = await request(app).get('/api/categories');
    expect(res.status).toBe(200);
    const found = res.body.data.find((c: any) => c.slug === 'books');
    expect(found?._count?.products).toBe(2);
  });
});

describe('GET /api/categories/:id', () => {
  it('looks up by UUID', async () => {
    const cat = await createCategory({ slug: 'uuid-test' });
    const res = await request(app).get(`/api/categories/${cat.id}`);
    expect(res.status).toBe(200);
    expect(res.body.data.slug).toBe('uuid-test');
  });

  it('looks up by slug', async () => {
    await createCategory({ slug: 'slug-test' });
    const res = await request(app).get('/api/categories/slug-test');
    expect(res.status).toBe(200);
    expect(res.body.data.slug).toBe('slug-test');
  });

  it('404 for unknown', async () => {
    const res = await request(app).get('/api/categories/nonexistent');
    expect(res.status).toBe(404);
  });
});

describe('POST /api/categories (admin/manager)', () => {
  it('creates a category (admin)', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const res = await request(app)
      .post('/api/categories')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Books', description: 'Reading material' });
    expect(res.status).toBe(201);
    expect(res.body.data.slug).toBe('books');
  });

  it('creates a category (manager)', async () => {
    const { token } = await authHeader({ role: 'manager' });
    const res = await request(app)
      .post('/api/categories')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Mangas' });
    expect(res.status).toBe(201);
  });

  it('rejects a customer (403)', async () => {
    const { token } = await authHeader();
    const res = await request(app)
      .post('/api/categories')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'X' });
    expect(res.status).toBe(403);
  });

  it('400 on duplicate slug', async () => {
    const { token } = await authHeader({ role: 'admin' });
    await createCategory({ slug: 'taken' });
    const res = await request(app)
      .post('/api/categories')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Y', slug: 'taken' });
    expect(res.status).toBe(400);
  });

  it('rejects self-parenting and child-cycles on update (regression)', async () => {
    // Create can't self-parent (the id doesn't exist yet), but update
    // could — a self-loop (or a two-row cycle) breaks the tree renderers.
    const { token } = await authHeader({ role: 'admin' });
    const a = await createCategory({ slug: 'a' });
    const b = await createCategory({ slug: 'b' });
    await mockPrisma.category.update({ where: { id: b.id }, data: { parentId: a.id } });

    const self = await request(app)
      .put(`/api/categories/${a.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ parentId: a.id });
    expect(self.status).toBe(400);

    // a -> b while b -> a would be a cycle.
    const cycle = await request(app)
      .put(`/api/categories/${a.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ parentId: b.id });
    expect(cycle.status).toBe(400);

    // A valid parent still works.
    const c = await createCategory({ slug: 'c' });
    const ok = await request(app)
      .put(`/api/categories/${a.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ parentId: c.id });
    expect(ok.status).toBe(200);
  });
});

describe('DELETE /api/categories/:id (admin/manager)', () => {
  it('deletes an empty category', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const c = await createCategory({ slug: 'gone' });
    const res = await request(app)
      .delete(`/api/categories/${c.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it('400 when the category has products', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const c = await createCategory();
    await createProduct({ categoryId: c.id });
    const res = await request(app)
      .delete(`/api/categories/${c.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/products/i);
  });
});
