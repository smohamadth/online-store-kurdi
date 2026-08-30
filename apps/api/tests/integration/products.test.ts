/**
 * Product route integration tests.
 *
 * Covers:
 *   - listing with filters (search, category, type, status, inStock, price range)
 *   - sort variations
 *   - pagination
 *   - CRUD: create / read / update / delete (soft archive)
 *   - featured / search / by-slug / related
 *   - input validation (negative price, bad type, etc.)
 *   - authorization (admin/manager for writes)
 *   - the rich-text sanitiser: a stored XSS payload in `description`
 *     is stripped on write
 *   - the metaKeywords transform: array -> JSON string
 */
import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { getTestApp, cleanDatabase, authHeader } from '../helpers/db';
import { mockPrisma } from '../helpers/mockPrisma';
import {
  createProduct,
  createCategory,
  addProductImage,
  createVariant,
} from '../helpers/factories';
import type { Express } from 'express';

let app: Express;
beforeAll(async () => { app = await getTestApp(); });
afterAll(async () => { await mockPrisma.$disconnect(); });
beforeEach(async () => { await cleanDatabase(); });

describe('GET /api/products', () => {
  beforeEach(async () => {
    const cat = await createCategory({ slug: 'clothing' });
    await createProduct({ name: 'T-Shirt', slug: 't-shirt', price: 19.99, quantity: 5, categoryId: cat.id });
    await createProduct({ name: 'Hat', slug: 'hat', price: 9.99, quantity: 0, categoryId: cat.id, status: 'inactive' });
    await createProduct({ name: 'Sticker', slug: 'sticker', price: 1.99, quantity: 100, type: 'digital' });
  });

  it('returns active products by default', async () => {
    const res = await request(app).get('/api/products');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);  // T-Shirt + Sticker; Hat is inactive
    expect(res.body.pagination.total).toBe(2);
  });

  it('filters by category slug', async () => {
    const res = await request(app).get('/api/products?category=clothing');
    expect(res.status).toBe(200);
    expect(res.body.data.every((p: any) => p.category?.slug === 'clothing')).toBe(true);
  });

  it('filters by inStock=true', async () => {
    const res = await request(app).get('/api/products?inStock=true');
    expect(res.status).toBe(200);
    expect(res.body.data.every((p: any) => p.quantity > 0)).toBe(true);
  });

  it('filters by type=digital', async () => {
    const res = await request(app).get('/api/products?type=digital');
    expect(res.status).toBe(200);
    expect(res.body.data.every((p: any) => p.type === 'digital')).toBe(true);
  });

  it('filters by status=inactive (admin-only view)', async () => {
    const res = await request(app).get('/api/products?status=inactive');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it('filters by price range', async () => {
    const res = await request(app).get('/api/products?minPrice=5&maxPrice=15');
    expect(res.status).toBe(200);
    expect(res.body.data.every((p: any) => p.price >= 5 && p.price <= 15)).toBe(true);
  });

  it('searches by name (case insensitive)', async () => {
    const res = await request(app).get('/api/products?search=SHIRT');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toMatch(/Shirt/);
  });

  it('paginates', async () => {
    const res = await request(app).get('/api/products?page=1&limit=1');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.pagination.totalPages).toBe(2);
  });

  it('sorts by price ascending', async () => {
    const res = await request(app).get('/api/products?sort=price_asc');
    const prices = res.body.data.map((p: any) => p.price);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
  });

  it('sorts by price descending', async () => {
    const res = await request(app).get('/api/products?sort=price_desc');
    const prices = res.body.data.map((p: any) => p.price);
    expect(prices).toEqual([...prices].sort((a, b) => b - a));
  });
});

describe('GET /api/products/featured', () => {
  it('returns the most recent active products up to a limit', async () => {
    for (let i = 0; i < 5; i++) await createProduct({ name: `P${i}`, slug: `p-${i}` });
    const res = await request(app).get('/api/products/featured?limit=3');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(3);
  });
});

describe('GET /api/products/search', () => {
  beforeEach(async () => {
    await createProduct({ name: 'Red Apple', slug: 'red-apple' });
    await createProduct({ name: 'Green Apple', slug: 'green-apple' });
    await createProduct({ name: 'Banana', slug: 'banana' });
  });

  it('returns matching products', async () => {
    const res = await request(app).get('/api/products/search?q=Apple');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
  });

  it('400 when q is missing', async () => {
    const res = await request(app).get('/api/products/search');
    expect(res.status).toBe(400);
  });
});

describe('GET /api/products/:id', () => {
  it('returns the product or 404', async () => {
    const p = await createProduct();
    const ok = await request(app).get(`/api/products/${p.id}`);
    expect(ok.status).toBe(200);
    expect(ok.body.data.id).toBe(p.id);
    expect(ok.body.data.averageRating).toBe(0);  // no reviews
    expect(ok.body.data.reviewCount).toBe(0);

    const nf = await request(app).get('/api/products/nope');
    expect(nf.status).toBe(404);
  });
});

describe('GET /api/products/slug/:slug', () => {
  it('returns a product by slug', async () => {
    const p = await createProduct({ slug: 'cool-hat' });
    const res = await request(app).get('/api/products/slug/cool-hat');
    expect(res.status).toBe(200);
    expect(res.body.data.slug).toBe('cool-hat');
  });
});

describe('GET /api/products/:id/related', () => {
  it('returns same-category products except the source one', async () => {
    const cat = await createCategory({ slug: 'shoes' });
    const p = await createProduct({ slug: 'shoe-1', categoryId: cat.id });
    await createProduct({ slug: 'shoe-2', categoryId: cat.id });
    await createProduct({ slug: 'unrelated', categoryId: (await createCategory({ slug: 'misc' })).id });

    const res = await request(app).get(`/api/products/${p.id}/related`);
    expect(res.status).toBe(200);
    expect(res.body.data.every((r: any) => r.id !== p.id)).toBe(true);
    expect(res.body.data.every((r: any) => r.category?.slug === 'shoes')).toBe(true);
  });
});

describe('POST /api/products (admin)', () => {
  it('creates a product when authenticated as admin', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const cat = await createCategory();
    const res = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'New Product',
        sku: 'NEW-1',
        price: 5,
        description: '<p>Hello</p>',
        categoryId: cat.id,
      });
    expect(res.status).toBe(201);
    expect(res.body.data.name).toBe('New Product');
    expect(res.body.data.slug).toBe('new-product');
  });

  it('persists digital product fields and surfaces them on the response', async () => {
    // The storefront branches on `type === 'digital'`; if the
    // downloadUrl / downloadLimit / downloadExpiry fields
    // vanish from the response shape, the whole digital-buy
    // flow breaks. Lock the round-trip here.
    const { token } = await authHeader({ role: 'admin' });
    const cat = await createCategory();
    const res = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'eBook',
        sku: 'EB-1',
        type: 'digital',
        price: 9.99,
        description: '<p>An eBook.</p>',
        categoryId: cat.id,
        downloadUrl: 'https://cdn.example.com/files/ebook.pdf',
        downloadLimit: 5,
        downloadExpiry: 30,
      });
    expect(res.status).toBe(201);
    expect(res.body.data.type).toBe('digital');
    expect(res.body.data.downloadUrl).toBe('https://cdn.example.com/files/ebook.pdf');
    expect(res.body.data.downloadLimit).toBe(5);
    expect(res.body.data.downloadExpiry).toBe(30);
    // GET /api/products/:id surfaces the same fields.
    const detail = await request(app).get(`/api/products/${res.body.data.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data.downloadUrl).toBe('https://cdn.example.com/files/ebook.pdf');
  });

  it('rejects anonymous (401)', async () => {
    const res = await request(app).post('/api/products').send({ name: 'X', sku: 'X', price: 1, description: 'x' });
    expect(res.status).toBe(401);
  });

  it('rejects a non-manager (403)', async () => {
    const { token } = await authHeader({ role: 'customer' });
    const res = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'X', sku: 'X', price: 1, description: 'x' });
    expect(res.status).toBe(403);
  });

  it('409 on duplicate slug', async () => {
    const { token } = await authHeader({ role: 'admin' });
    await createProduct({ slug: 'taken' });
    const res = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'X', sku: 'X', price: 1, description: 'x', slug: 'taken' });
    expect(res.status).toBe(409);
  });

  it('409 on duplicate SKU', async () => {
    const { token } = await authHeader({ role: 'admin' });
    await createProduct({ sku: 'TAKEN' });
    const res = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'X', sku: 'TAKEN', price: 1, description: 'x' });
    expect(res.status).toBe(409);
  });

  it('strips dangerous HTML from description (XSS)', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const res = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Pwned',
        sku: 'PWN-1',
        price: 1,
        description: 'safe<script>alert(1)</script><a href="javascript:bad()">x</a>',
      });
    expect(res.status).toBe(201);
    const stored = await mockPrisma.product.findUnique({ where: { id: res.body.data.id } });
    expect(stored?.description).not.toMatch(/<script/i);
    expect(stored?.description).not.toMatch(/javascript:/i);
  });

  it('accepts metaKeywords as an array and stores it as a JSON string', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const res = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Tagged',
        sku: 'TAG-1',
        price: 1,
        description: 'x',
        metaKeywords: ['alpha', 'beta'],
      });
    expect(res.status).toBe(201);
    const stored = await mockPrisma.product.findUnique({ where: { id: res.body.data.id } });
    expect(typeof stored?.metaKeywords).toBe('string');
    expect(JSON.parse(stored?.metaKeywords as string)).toEqual(['alpha', 'beta']);
  });

  it('400 on a negative price', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const res = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'X', sku: 'X', price: -5, description: 'x' });
    expect(res.status).toBe(400);
  });
});

describe('PUT /api/products/:id', () => {
  it('updates a product', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const p = await createProduct({ name: 'Old', sku: 'OLD' });
    const res = await request(app)
      .put(`/api/products/${p.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'New Name', price: 99 });
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('New Name');
  });

  it('returns 404 for an unknown id', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const res = await request(app)
      .put('/api/products/nonexistent')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'X' });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/products/:id (admin only, soft archive)', () => {
  it('soft-archives (sets status=archived)', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const p = await createProduct();
    const res = await request(app)
      .delete(`/api/products/${p.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const after = await mockPrisma.product.findUnique({ where: { id: p.id } });
    expect(after?.status).toBe('archived');
  });

  it('rejects a manager (only admin)', async () => {
    const { token } = await authHeader({ role: 'manager' });
    const p = await createProduct();
    const res = await request(app)
      .delete(`/api/products/${p.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// search backend (Postgres default) + reindex
// ---------------------------------------------------------------------------

describe('search backend (postgres default)', () => {
  it('GET /api/products/search returns active matches via the configured provider', async () => {
    await createProduct({ name: 'Kurdish Kurte', slug: 'kurte', description: 'a kurta shirt' });
    await createProduct({ name: 'Other', slug: 'other' });

    const res = await request(app).get('/api/products/search?q=kurte');
    expect(res.status).toBe(200);
    expect(res.body.data.map((p: any) => p.name)).toContain('Kurdish Kurte');
  });

  it('index maintenance on product writes is a no-op for postgres (create/update/archive still work)', async () => {
    const { token } = await authHeader({ role: 'admin' });

    const created = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Widget', sku: 'SEARCH-W', price: 5, description: 'd' });
    expect(created.status).toBe(201);
    const id = created.body.data.id;

    const updated = await request(app)
      .put(`/api/products/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ price: 9 });
    expect(updated.status).toBe(200);

    const archived = await request(app)
      .delete(`/api/products/${id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(archived.status).toBe(200);
  });
});

describe('POST /api/products/search/reindex', () => {
  it('requires admin', async () => {
    const { token } = await authHeader({ role: 'customer' });
    const res = await request(app).post('/api/products/search/reindex').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('is a no-op for the postgres backend and reports so', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const res = await request(app).post('/api/products/search/reindex').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.provider).toBe('postgres');
    expect(res.body.data.indexed).toBe(0);
  });
});
