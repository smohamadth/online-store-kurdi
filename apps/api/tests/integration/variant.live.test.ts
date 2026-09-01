/**
 * Live HTTP smoke test for the first-class variant surface.
 *
 * Walks the full feature end-to-end through a real Express app,
 * real JWT tokens, and real route handlers. The only mocked
 * piece is the database.
 *
 * 1. Public GET /api/variants returns the (empty) list on a fresh
 *    database.
 * 2. Admin POST /api/variants creates a variant with the new
 *    slug + compareAtPrice fields.
 * 3. GET /api/variants/:idOrSlug works for both id and slug.
 * 4. PUT /api/products/:id/options builds the option tree.
 * 5. PUT /api/variants/:id/options sets the variant's chosen
 *    values, and GET reads them back.
 * 6. PATCH /api/variants/:id updates the variant (price, slug,
 *    compareAtPrice).
 * 7. DELETE /api/variants/:id?force=true hard-deletes.
 * 8. After hard delete, GET returns 404 - both by id and slug.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { getTestApp, cleanDatabase, authHeader } from '../helpers/db';
import { mockPrisma } from '../helpers/mockPrisma';
import { createProduct, createCategory } from '../helpers/factories';
import type { Express } from 'express';

let app: Express;
let adminToken: string;
let productId: string;

beforeAll(async () => { app = await getTestApp(); });
afterAll(async () => { await mockPrisma.$disconnect(); });
beforeEach(async () => {
  await cleanDatabase();
  const { token } = await authHeader({ role: 'admin' });
  adminToken = token;
  const cat = await createCategory({});
  const product = await createProduct({ categoryId: cat.id, price: 100, quantity: 50 });
  productId = product.id;
});

describe('variant (live): end-to-end PUT/GET round-trip', () => {
  it('public GET /api/variants returns an empty list on a fresh database', async () => {
    const res = await request(app).get('/api/variants');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('admin can create a variant with slug + compareAtPrice, both round-trip', async () => {
    const create = await request(app).post('/api/variants')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ productId, name: 'Red, Large', sku: 'r-1', slug: 'red-large', price: 8, compareAtPrice: 12 });
    expect(create.status).toBe(201);
    expect(create.body.data.slug).toBe('red-large');
    expect(create.body.data.compareAtPrice).toBe(12);
    const id = create.body.data.id;

    // Public GET by id.
    const byId = await request(app).get(`/api/variants/${id}`);
    expect(byId.status).toBe(200);
    expect(byId.body.data.price).toBe(8);
    expect(byId.body.data.compareAtPrice).toBe(12);

    // Public GET by slug (the first-class URL piece).
    const bySlug = await request(app).get('/api/variants/red-large');
    expect(bySlug.status).toBe(200);
    expect(bySlug.body.data.id).toBe(id);
  });

  it('options tree + variant options link round-trip', async () => {
    // Build the product's option tree.
    const opts = await request(app).put(`/api/products/${productId}/options`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        options: [
          { name: 'Color', values: [{ value: 'Red' }, { value: 'Blue' }] },
          { name: 'Size', values: [{ value: 'Small' }, { value: 'Large' }] },
        ],
      });
    expect(opts.status).toBe(200);
    const redId = opts.body.data[0].values.find((v: any) => v.value === 'Red').id;
    const largeId = opts.body.data[1].values.find((v: any) => v.value === 'Large').id;

    // Create a variant and link it to Red + Large.
    const v = await request(app).post('/api/variants')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ productId, name: 'Red, Large', sku: 'rl-1', price: 1 });
    const link = await request(app).put(`/api/variants/${v.body.data.id}/options`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ optionValueIds: [redId, largeId] });
    expect(link.status).toBe(200);
    expect(link.body.data).toHaveLength(2);

    // Read the chosen values back.
    const read = await request(app).get(`/api/variants/${v.body.data.id}/options`);
    expect(read.status).toBe(200);
    expect(read.body.data).toHaveLength(2);
    const values = read.body.data.map((x: any) => x.optionValue.value).sort();
    expect(values).toEqual(['Large', 'Red']);
  });

  it('PATCH updates price + slug + compareAtPrice; partial save does not wipe fields', async () => {
    const c = await request(app).post('/api/variants')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ productId, name: 'A', sku: 'a-1', price: 5, slug: 'a' });
    const id = c.body.data.id;

    // Bump the price.
    const p1 = await request(app).patch(`/api/variants/${id}`)
      .set('Authorization', `Bearer ${adminToken}`).send({ price: 7 });
    expect(p1.status).toBe(200);
    expect(p1.body.data.price).toBe(7);
    // Slug still present (not wiped by the price change).
    expect(p1.body.data.slug).toBe('a');

    // Bump the slug + add a sale price.
    const p2 = await request(app).patch(`/api/variants/${id}`)
      .set('Authorization', `Bearer ${adminToken}`).send({ slug: 'a-renamed', compareAtPrice: 9 });
    expect(p2.status).toBe(200);
    expect(p2.body.data.slug).toBe('a-renamed');
    expect(p2.body.data.compareAtPrice).toBe(9);
    // Price is still 7 (the earlier bump survived).
    expect(p2.body.data.price).toBe(7);
  });

  it('?force=true hard-deletes; subsequent GETs return 404 by id and slug', async () => {
    const c = await request(app).post('/api/variants')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ productId, name: 'A', sku: 'a-1', price: 1, slug: 'gone' });
    const id = c.body.data.id;

    const del = await request(app).delete(`/api/variants/${id}?force=true`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(del.status).toBe(200);
    expect(del.body.data.deleted).toBe(true);

    const byId = await request(app).get(`/api/variants/${id}`);
    expect(byId.status).toBe(404);
    const bySlug = await request(app).get('/api/variants/gone');
    expect(bySlug.status).toBe(404);
  });

  it('a non-admin cannot write (401/403)', async () => {
    const { token: customer } = await authHeader();
    const post = await request(app).post('/api/variants')
      .set('Authorization', `Bearer ${customer}`)
      .send({ productId, name: 'X', sku: 'x-1', price: 1 });
    expect(post.status).toBe(403);
  });

  it('rejects compareAtPrice < price with 400 (sale price must be >= current price)', async () => {
    const res = await request(app).post('/api/variants')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ productId, name: 'Bad', sku: 'bad-1', price: 100, compareAtPrice: 50 });
    expect(res.status).toBe(400);
  });
});
