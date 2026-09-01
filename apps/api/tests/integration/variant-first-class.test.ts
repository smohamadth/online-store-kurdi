/**
 * Integration tests for first-class variant endpoints.
 *
 *   GET    /api/variants                          (list with filters)
 *   GET    /api/variants/:idOrSlug               (by id OR url slug)
 *   POST   /api/variants                          (top-level create)
 *   PATCH  /api/variants/:id                     (top-level update)
 *   DELETE /api/variants/:id                     (soft; ?force=true hard)
 *   PUT    /api/variants/:id/options             (replace chosen values)
 *   GET    /api/variants/:id/options             (read chosen values)
 *   GET    /api/products/:productId/variants     (nested list)
 *   POST   /api/products/:productId/variants     (nested create)
 *   PATCH  /api/products/:productId/variants/:id (nested update)
 *   DELETE /api/products/:productId/variants/:id (nested delete)
 *   GET    /api/products/:productId/options      (read product options)
 *   PUT    /api/products/:productId/options      (replace product options)
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { getTestApp, cleanDatabase, authHeader } from '../helpers/db';
import { mockPrisma } from '../helpers/mockPrisma';
import { createProduct, createCategory } from '../helpers/factories';
import type { Express } from 'express';

let app: Express;
let adminToken: string;
let customerToken: string;
let productId: string;

beforeAll(async () => { app = await getTestApp(); });
afterAll(async () => { await mockPrisma.$disconnect(); });
beforeEach(async () => {
  await cleanDatabase();
  const { token: a } = await authHeader({ role: 'admin' });
  adminToken = a;
  const { token: c } = await authHeader();
  customerToken = c;
  const cat = await createCategory({});
  const product = await createProduct({ categoryId: cat.id, price: 100, quantity: 50 });
  productId = product.id;
});

describe('first-class variant: top-level GET /api/variants', () => {
  it('lists every variant across the catalogue with no filters', async () => {
    await request(app).post(`/api/products/${productId}/variants`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Red', sku: 'r-1', price: 10, quantity: 5 });
    await request(app).post(`/api/products/${productId}/variants`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Blue', sku: 'b-1', price: 12, quantity: 0 });
    const res = await request(app).get('/api/variants');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
  });

  it('filters by productId', async () => {
    const otherCat = await createCategory({});
    const otherProduct = await createProduct({ categoryId: otherCat.id, price: 50, quantity: 10 });
    await request(app).post(`/api/products/${productId}/variants`)
      .set('Authorization', `Bearer ${adminToken}`).send({ name: 'A', sku: 'a-1', price: 1 });
    await request(app).post(`/api/products/${otherProduct.id}/variants`)
      .set('Authorization', `Bearer ${adminToken}`).send({ name: 'B', sku: 'b-1', price: 1 });
    const res = await request(app).get(`/api/variants?productId=${productId}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].productId).toBe(productId);
  });

  it('filters by inStock=true', async () => {
    await request(app).post(`/api/products/${productId}/variants`)
      .set('Authorization', `Bearer ${adminToken}`).send({ name: 'InStock', sku: 'is-1', price: 1, quantity: 5 });
    await request(app).post(`/api/products/${productId}/variants`)
      .set('Authorization', `Bearer ${adminToken}`).send({ name: 'Out', sku: 'o-1', price: 1, quantity: 0 });
    const res = await request(app).get('/api/variants?inStock=true');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].sku).toBe('is-1');
  });

  it('filters by minPrice/maxPrice', async () => {
    await request(app).post(`/api/products/${productId}/variants`)
      .set('Authorization', `Bearer ${adminToken}`).send({ name: 'Cheap', sku: 'c-1', price: 5 });
    await request(app).post(`/api/products/${productId}/variants`)
      .set('Authorization', `Bearer ${adminToken}`).send({ name: 'Mid', sku: 'm-1', price: 50 });
    await request(app).post(`/api/products/${productId}/variants`)
      .set('Authorization', `Bearer ${adminToken}`).send({ name: 'Costly', sku: 'x-1', price: 500 });
    const res = await request(app).get('/api/variants?minPrice=10&maxPrice=100');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].sku).toBe('m-1');
  });

  it('filters by sku substring', async () => {
    await request(app).post(`/api/products/${productId}/variants`)
      .set('Authorization', `Bearer ${adminToken}`).send({ name: 'A', sku: 'WIDGET-RED-L', price: 1 });
    await request(app).post(`/api/products/${productId}/variants`)
      .set('Authorization', `Bearer ${adminToken}`).send({ name: 'B', sku: 'OTHER-001', price: 1 });
    const res = await request(app).get('/api/variants?sku=WIDGET');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].sku).toBe('WIDGET-RED-L');
  });

  it('is publicly accessible (no auth required)', async () => {
    const res = await request(app).get('/api/variants');
    expect(res.status).toBe(200);
  });
});

describe('first-class variant: GET /api/variants/:idOrSlug', () => {
  it('looks up by id', async () => {
    const create = await request(app).post(`/api/products/${productId}/variants`)
      .set('Authorization', `Bearer ${adminToken}`).send({ name: 'V1', sku: 'v1', price: 1 });
    const id = create.body.data.id;
    const res = await request(app).get(`/api/variants/${id}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(id);
  });

  it('looks up by URL slug (first-class URL support)', async () => {
    await request(app).post(`/api/products/${productId}/variants`)
      .set('Authorization', `Bearer ${adminToken}`).send({ name: 'V1', sku: 'v1', price: 1, slug: 'red-large' });
    const res = await request(app).get('/api/variants/red-large');
    expect(res.status).toBe(200);
    expect(res.body.data.slug).toBe('red-large');
  });

  it('returns 404 when neither id nor slug matches', async () => {
    const res = await request(app).get('/api/variants/does-not-exist');
    expect(res.status).toBe(404);
  });
});

describe('first-class variant: POST /api/variants (top-level create)', () => {
  it('creates a variant when the body has productId', async () => {
    const res = await request(app).post('/api/variants')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ productId, name: 'Top-level', sku: 'tl-1', price: 10 });
    expect(res.status).toBe(201);
    expect(res.body.data.productId).toBe(productId);
    expect(res.body.data.sku).toBe('tl-1');
  });

  it('accepts slug + compareAtPrice', async () => {
    const res = await request(app).post('/api/variants')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ productId, name: 'On Sale', sku: 'sale-1', slug: 'red-large', price: 8, compareAtPrice: 12 });
    expect(res.status).toBe(201);
    expect(res.body.data.slug).toBe('red-large');
    expect(res.body.data.compareAtPrice).toBe(12);
  });

  it('rejects a duplicate SKU with 409', async () => {
    await request(app).post('/api/variants').set('Authorization', `Bearer ${adminToken}`)
      .send({ productId, name: 'A', sku: 'dup', price: 1 });
    const res = await request(app).post('/api/variants').set('Authorization', `Bearer ${adminToken}`)
      .send({ productId, name: 'B', sku: 'dup', price: 1 });
    expect(res.status).toBe(409);
  });

  it('rejects a duplicate slug with 409', async () => {
    await request(app).post('/api/variants').set('Authorization', `Bearer ${adminToken}`)
      .send({ productId, name: 'A', sku: 'a-dup', price: 1, slug: 'red' });
    const res = await request(app).post('/api/variants').set('Authorization', `Bearer ${adminToken}`)
      .send({ productId, name: 'B', sku: 'b-dup', price: 1, slug: 'red' });
    expect(res.status).toBe(409);
  });

  it('rejects compareAtPrice < price', async () => {
    const res = await request(app).post('/api/variants')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ productId, name: 'Bad sale', sku: 'bad-sale', price: 100, compareAtPrice: 50 });
    expect(res.status).toBe(400);
  });

  it('rejects a non-existent productId with 404', async () => {
    const res = await request(app).post('/api/variants')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ productId: '00000000-0000-0000-0000-000000000000', name: 'X', sku: 'x-1', price: 1 });
    expect(res.status).toBe(404);
  });

  it('rejects when productId is missing', async () => {
    const res = await request(app).post('/api/variants')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'X', sku: 'x-1', price: 1 });
    expect(res.status).toBe(400);
  });

  it('rejects a customer (403)', async () => {
    const res = await request(app).post('/api/variants')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ productId, name: 'X', sku: 'x-1', price: 1 });
    expect(res.status).toBe(403);
  });
});

describe('first-class variant: PATCH /api/variants/:id', () => {
  it('updates fields including the new slug + compareAtPrice', async () => {
    const create = await request(app).post('/api/variants')
      .set('Authorization', `Bearer ${adminToken}`).send({ productId, name: 'A', sku: 'a-1', price: 5 });
    const id = create.body.data.id;
    const res = await request(app).patch(`/api/variants/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'A renamed', price: 7, slug: 'renamed', compareAtPrice: 10 });
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('A renamed');
    expect(res.body.data.price).toBe(7);
    expect(res.body.data.slug).toBe('renamed');
    expect(res.body.data.compareAtPrice).toBe(10);
  });

  it('clears the slug with null (nullable field)', async () => {
    const create = await request(app).post('/api/variants')
      .set('Authorization', `Bearer ${adminToken}`).send({ productId, name: 'A', sku: 'a-1', price: 1, slug: 'red' });
    const id = create.body.data.id;
    const res = await request(app).patch(`/api/variants/${id}`)
      .set('Authorization', `Bearer ${adminToken}`).send({ slug: null });
    expect(res.status).toBe(200);
    expect(res.body.data.slug).toBeNull();
  });

  it('rejects a SKU change that conflicts (409)', async () => {
    const a = await request(app).post('/api/variants').set('Authorization', `Bearer ${adminToken}`)
      .send({ productId, name: 'A', sku: 'sku-a', price: 1 });
    const b = await request(app).post('/api/variants').set('Authorization', `Bearer ${adminToken}`)
      .send({ productId, name: 'B', sku: 'sku-b', price: 1 });
    const res = await request(app).patch(`/api/variants/${b.body.data.id}`)
      .set('Authorization', `Bearer ${adminToken}`).send({ sku: 'sku-a' });
    expect(res.status).toBe(409);
  });

  it('returns 404 for an unknown id', async () => {
    const res = await request(app).patch('/api/variants/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${adminToken}`).send({ name: 'X' });
    expect(res.status).toBe(404);
  });
});

describe('first-class variant: DELETE /api/variants/:id', () => {
  it('soft-deletes by default (isActive=false, quantity=0)', async () => {
    const create = await request(app).post('/api/variants')
      .set('Authorization', `Bearer ${adminToken}`).send({ productId, name: 'A', sku: 'a-1', price: 1, quantity: 5 });
    const id = create.body.data.id;
    const res = await request(app).delete(`/api/variants/${id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const get = await request(app).get(`/api/variants/${id}`);
    expect(get.status).toBe(200);
    expect(get.body.data.isActive).toBe(false);
    expect(get.body.data.quantity).toBe(0);
  });

  it('?force=true hard-deletes', async () => {
    const create = await request(app).post('/api/variants')
      .set('Authorization', `Bearer ${adminToken}`).send({ productId, name: 'A', sku: 'a-1', price: 1 });
    const id = create.body.data.id;
    const res = await request(app).delete(`/api/variants/${id}?force=true`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.deleted).toBe(true);
    const get = await request(app).get(`/api/variants/${id}`);
    expect(get.status).toBe(404);
  });

  it('rejects a customer (403)', async () => {
    const create = await request(app).post('/api/variants')
      .set('Authorization', `Bearer ${adminToken}`).send({ productId, name: 'A', sku: 'a-1', price: 1 });
    const res = await request(app).delete(`/api/variants/${create.body.data.id}`)
      .set('Authorization', `Bearer ${customerToken}`);
    expect(res.status).toBe(403);
  });
});

describe('first-class variant: options tree', () => {
  it('PUT /api/products/:id/options replaces the option tree', async () => {
    const res = await request(app).put(`/api/products/${productId}/options`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        options: [
          { name: 'Color', values: [{ value: 'Red' }, { value: 'Blue', swatch: '#0000ff' }] },
          { name: 'Size', values: [{ value: 'Small' }, { value: 'Large' }] },
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0].name).toBe('Color');
    expect(res.body.data[0].values).toHaveLength(2);
  });

  it('GET /api/products/:id/options returns the option tree', async () => {
    await request(app).put(`/api/products/${productId}/options`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ options: [{ name: 'Color', values: [{ value: 'Red' }] }] });
    const res = await request(app).get(`/api/products/${productId}/options`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe('Color');
  });

  it('a second PUT replaces the previous options (delete + recreate)', async () => {
    await request(app).put(`/api/products/${productId}/options`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ options: [{ name: 'Color', values: [{ value: 'Red' }] }] });
    await request(app).put(`/api/products/${productId}/options`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ options: [{ name: 'Size', values: [{ value: 'Large' }] }] });
    const res = await request(app).get(`/api/products/${productId}/options`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe('Size');
  });

  it('PUT /api/variants/:id/options sets the variant\'s chosen values', async () => {
    await request(app).put(`/api/products/${productId}/options`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        options: [
          { name: 'Color', values: [{ value: 'Red' }, { value: 'Blue' }] },
          { name: 'Size', values: [{ value: 'Large' }] },
        ],
      });
    const optsRes = await request(app).get(`/api/products/${productId}/options`);
    const redId = optsRes.body.data[0].values[0].id;
    const largeId = optsRes.body.data[1].values[0].id;

    const v = await request(app).post('/api/variants')
      .set('Authorization', `Bearer ${adminToken}`).send({ productId, name: 'Red Large', sku: 'rl-1', price: 1 });
    const res = await request(app).put(`/api/variants/${v.body.data.id}/options`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ optionValueIds: [redId, largeId] });
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
  });

  it('rejects optionValueIds that do not belong to the variant\'s product (400)', async () => {
    await request(app).put(`/api/products/${productId}/options`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ options: [{ name: 'Color', values: [{ value: 'Red' }] }] });
    const aOpts = await request(app).get(`/api/products/${productId}/options`);
    const aRedId = aOpts.body.data[0].values[0].id;

    const otherCat = await createCategory({});
    const otherProduct = await createProduct({ categoryId: otherCat.id, price: 10, quantity: 5 });
    await request(app).put(`/api/products/${otherProduct.id}/options`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ options: [{ name: 'Size', values: [{ value: 'Large' }] }] });
    const bOpts = await request(app).get(`/api/products/${otherProduct.id}/options`);
    const bLargeId = bOpts.body.data[0].values[0].id;

    const v = await request(app).post('/api/variants')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ productId: otherProduct.id, name: 'V', sku: 'b-1', price: 1 });

    const res = await request(app).put(`/api/variants/${v.body.data.id}/options`)
      .set('Authorization', `Bearer ${adminToken}`).send({ optionValueIds: [aRedId] });
    expect(res.status).toBe(400);
  });

  it('GET /api/variants/:id/options reads the chosen values', async () => {
    await request(app).put(`/api/products/${productId}/options`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ options: [{ name: 'Color', values: [{ value: 'Red' }] }] });
    const optsRes = await request(app).get(`/api/products/${productId}/options`);
    const redId = optsRes.body.data[0].values[0].id;
    const v = await request(app).post('/api/variants')
      .set('Authorization', `Bearer ${adminToken}`).send({ productId, name: 'V', sku: 'v-1', price: 1 });
    await request(app).put(`/api/variants/${v.body.data.id}/options`)
      .set('Authorization', `Bearer ${adminToken}`).send({ optionValueIds: [redId] });
    const res = await request(app).get(`/api/variants/${v.body.data.id}/options`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].optionValue.value).toBe('Red');
  });

  it('an empty optionValueIds array clears the selection', async () => {
    await request(app).put(`/api/products/${productId}/options`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ options: [{ name: 'Color', values: [{ value: 'Red' }] }] });
    const optsRes = await request(app).get(`/api/products/${productId}/options`);
    const redId = optsRes.body.data[0].values[0].id;
    const v = await request(app).post('/api/variants')
      .set('Authorization', `Bearer ${adminToken}`).send({ productId, name: 'V', sku: 'v-1', price: 1 });
    await request(app).put(`/api/variants/${v.body.data.id}/options`)
      .set('Authorization', `Bearer ${adminToken}`).send({ optionValueIds: [redId] });
    const clear = await request(app).put(`/api/variants/${v.body.data.id}/options`)
      .set('Authorization', `Bearer ${adminToken}`).send({ optionValueIds: [] });
    expect(clear.status).toBe(200);
    const after = await request(app).get(`/api/variants/${v.body.data.id}/options`);
    expect(after.body.data).toHaveLength(0);
  });
});

describe('first-class variant: nested routes still work', () => {
  it('POST /api/products/:id/variants creates a variant under the product', async () => {
    const res = await request(app).post(`/api/products/${productId}/variants`)
      .set('Authorization', `Bearer ${adminToken}`).send({ name: 'Nested', sku: 'nest-1', price: 1 });
    expect(res.status).toBe(201);
    expect(res.body.data.productId).toBe(productId);
  });

  it('GET /api/products/:id/variants lists the product\'s variants', async () => {
    await request(app).post(`/api/products/${productId}/variants`)
      .set('Authorization', `Bearer ${adminToken}`).send({ name: 'A', sku: 'a-1', price: 1 });
    await request(app).post(`/api/products/${productId}/variants`)
      .set('Authorization', `Bearer ${adminToken}`).send({ name: 'B', sku: 'b-1', price: 1 });
    const res = await request(app).get(`/api/products/${productId}/variants`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
  });

  it('PATCH /api/products/:id/variants/:vid updates via the nested route', async () => {
    const c = await request(app).post(`/api/products/${productId}/variants`)
      .set('Authorization', `Bearer ${adminToken}`).send({ name: 'A', sku: 'a-1', price: 1 });
    const res = await request(app).patch(`/api/products/${productId}/variants/${c.body.data.id}`)
      .set('Authorization', `Bearer ${adminToken}`).send({ name: 'A2' });
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('A2');
  });

  it('DELETE /api/products/:id/variants/:vid soft-deletes via the nested route', async () => {
    const c = await request(app).post(`/api/products/${productId}/variants`)
      .set('Authorization', `Bearer ${adminToken}`).send({ name: 'A', sku: 'a-1', price: 1 });
    const res = await request(app).delete(`/api/products/${productId}/variants/${c.body.data.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });
});

describe('first-class variant: back-compat alias', () => {
  it('prisma.productVariant is the same object as prisma.variant', async () => {
    const c = await request(app).post('/api/variants')
      .set('Authorization', `Bearer ${adminToken}`).send({ productId, name: 'A', sku: 'a-1', price: 1 });
    const id = c.body.data.id;
    const { peekMockStore } = await import('../helpers/mockPrisma');
    const byVariant = peekMockStore('Variant');
    const byAlias = peekMockStore('ProductVariant');
    expect(byVariant).toHaveLength(1);
    expect(byAlias).toHaveLength(1);
    expect(byVariant[0].id).toBe(id);
    expect(byAlias[0].id).toBe(id);
  });
});
