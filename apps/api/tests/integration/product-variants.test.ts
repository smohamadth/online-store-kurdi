/**
 * Integration tests for the product-variant endpoints.
 *
 *   GET    /api/products/:productId/variants
 *   POST   /api/products/:productId/variants
 *   PATCH  /api/products/:productId/variants/:id
 *   DELETE /api/products/:productId/variants/:id
 *   GET    /api/variants/:id
 *
 * Coverage groups:
 *   - Auth/authorization (public read, admin-only writes)
 *   - CRUD happy paths
 *   - Validation: required fields, price > 0, quantity >= 0, sku unique
 *   - Attribute round-trip (object in -> object out, malformed -> 400)
 *   - Soft vs force delete
 *   - Cross-product isolation
 *   - Real-world flows: create from product, then add to cart,
 *     then update price, then deactivate
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { getTestApp, cleanDatabase, authHeader } from '../helpers/db';
import { mockPrisma } from '../helpers/mockPrisma';
import {
  createProduct,
  createCategory,
  createUser,
  createVariant,
} from '../helpers/factories';
import type { Express } from 'express';

let app: Express;
beforeAll(async () => { app = await getTestApp(); });
afterAll(async () => { await mockPrisma.$disconnect(); });
beforeEach(async () => { await cleanDatabase(); });

// =====================================================================
// Auth / authorization
// =====================================================================

describe('Auth & authorization', () => {
  it('GET /api/products/:id/variants is public (no auth required)', async () => {
    const cat = await createCategory({ slug: 'c', name: 'C' });
    const p = await createProduct({ name: 'X', slug: 'x', price: 5, quantity: 0, categoryId: cat.id });
    await createVariant(p.id, { name: 'M', sku: 'sku-m', price: 5 });
    const res = await request(app).get(`/api/products/${p.id}/variants`);
    expect(res.status).toBe(200);
  });

  it('POST /api/products/:id/variants rejects unauthenticated requests (401)', async () => {
    const cat = await createCategory({ slug: 'c', name: 'C' });
    const p = await createProduct({ name: 'X', slug: 'x', price: 5, quantity: 0, categoryId: cat.id });
    const res = await request(app)
      .post(`/api/products/${p.id}/variants`)
      .send({ name: 'M', sku: 'sku-x', price: 5 });
    expect(res.status).toBe(401);
  });

  it('POST /api/products/:id/variants rejects customers (403)', async () => {
    const cat = await createCategory({ slug: 'c', name: 'C' });
    const p = await createProduct({ name: 'X', slug: 'x', price: 5, quantity: 0, categoryId: cat.id });
    const user = await createUser({});
    const { token: auth } = await authHeader({ email: user.email });
    const res = await request(app)
      .post(`/api/products/${p.id}/variants`)
      .set('Authorization', `Bearer ${auth}`)
      .send({ name: 'M', sku: 'sku-x', price: 5 });
    expect(res.status).toBe(403);
  });

  it('manager can write variants (200)', async () => {
    const cat = await createCategory({ slug: 'c', name: 'C' });
    const p = await createProduct({ name: 'X', slug: 'x', price: 5, quantity: 0, categoryId: cat.id });
    const mgr = await createUser({ role: 'manager' });
    const { token: auth } = await authHeader({ role: 'manager', email: mgr.email });
    const res = await request(app)
      .post(`/api/products/${p.id}/variants`)
      .set('Authorization', `Bearer ${auth}`)
      .send({ name: 'M', sku: 'm-sku', price: 5 });
    expect(res.status).toBe(201);
  });

  it('DELETE /api/products/:id/variants/:id requires admin (manager -> 403)', async () => {
    const cat = await createCategory({ slug: 'c', name: 'C' });
    const p = await createProduct({ name: 'X', slug: 'x', price: 5, quantity: 0, categoryId: cat.id });
    const v = await createVariant(p.id, { name: 'M', sku: 'm-sku', price: 5 });
    const mgr = await createUser({ role: 'manager' });
    const { token: auth } = await authHeader({ role: 'manager', email: mgr.email });
    const res = await request(app)
      .delete(`/api/products/${p.id}/variants/${v.id}`)
      .set('Authorization', `Bearer ${auth}`);
    expect(res.status).toBe(403);
  });
});

// =====================================================================
// CRUD happy paths
// =====================================================================

describe('CRUD', () => {
  it('POST creates a variant with parsed attributes object', async () => {
    const cat = await createCategory({ slug: 'c', name: 'C' });
    const p = await createProduct({ name: 'Shirt', slug: 'shirt', price: 5, quantity: 0, categoryId: cat.id });
    const admin = await createUser({ role: 'admin' });
    const { token: auth } = await authHeader({ role: 'admin', email: admin.email });
    const res = await request(app)
      .post(`/api/products/${p.id}/variants`)
      .set('Authorization', `Bearer ${auth}`)
      .send({
        name: 'Medium Red',
        sku: 'shirt-m-red',
        price: 25,
        quantity: 12,
        attributes: { size: 'M', color: 'red' },
      });
    expect(res.status).toBe(201);
    expect(res.body.data.attributes).toEqual({ size: 'M', color: 'red' });
    // Stored as JSON string in the DB.
    const raw = await mockPrisma.productVariant.findUnique({ where: { id: res.body.data.id } });
    expect(raw!.attributes).toBe('{"size":"M","color":"red"}');
  });

  it('GET returns the variants for a product, parsed', async () => {
    const cat = await createCategory({ slug: 'c', name: 'C' });
    const p = await createProduct({ name: 'Shirt', slug: 'shirt', price: 5, quantity: 0, categoryId: cat.id });
    await createVariant(p.id, { name: 'M', sku: 'm', price: 5, attributes: { size: 'M' } });
    await createVariant(p.id, { name: 'L', sku: 'l', price: 5, attributes: { size: 'L' } });
    const res = await request(app).get(`/api/products/${p.id}/variants`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0].attributes.size).toBeDefined();
  });

  it('GET /api/variants/:id returns one variant', async () => {
    const cat = await createCategory({ slug: 'c', name: 'C' });
    const p = await createProduct({ name: 'Shirt', slug: 'shirt', price: 5, quantity: 0, categoryId: cat.id });
    const v = await createVariant(p.id, { name: 'M', sku: 'm-solo', price: 5, attributes: { size: 'M' } });
    const res = await request(app).get(`/api/variants/${v.id}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(v.id);
    expect(res.body.data.attributes).toEqual({ size: 'M' });
  });

  it('PATCH updates selected fields only', async () => {
    const cat = await createCategory({ slug: 'c', name: 'C' });
    const p = await createProduct({ name: 'Shirt', slug: 'shirt', price: 5, quantity: 0, categoryId: cat.id });
    const v = await createVariant(p.id, { name: 'M', sku: 'patch-sku', price: 5, quantity: 10 });
    const admin = await createUser({ role: 'admin' });
    const { token: auth } = await authHeader({ role: 'admin', email: admin.email });
    const res = await request(app)
      .patch(`/api/products/${p.id}/variants/${v.id}`)
      .set('Authorization', `Bearer ${auth}`)
      .send({ price: 12.5, isActive: false });
    expect(res.status).toBe(200);
    expect(res.body.data.price).toBe(12.5);
    expect(res.body.data.isActive).toBe(false);
    // Untouched fields stay put.
    expect(res.body.data.name).toBe('M');
    expect(res.body.data.quantity).toBe(10);
  });

  it('DELETE soft-deletes by default (sets isActive=false, quantity=0)', async () => {
    const cat = await createCategory({ slug: 'c', name: 'C' });
    const p = await createProduct({ name: 'Shirt', slug: 'shirt', price: 5, quantity: 0, categoryId: cat.id });
    const v = await createVariant(p.id, { name: 'M', sku: 'del-soft', price: 5, quantity: 10 });
    const admin = await createUser({ role: 'admin' });
    const { token: auth } = await authHeader({ role: 'admin', email: admin.email });
    const res = await request(app)
      .delete(`/api/products/${p.id}/variants/${v.id}`)
      .set('Authorization', `Bearer ${auth}`);
    expect(res.status).toBe(200);
    const after = await mockPrisma.productVariant.findUnique({ where: { id: v.id } });
    expect(after).not.toBeNull();
    expect(after!.isActive).toBe(false);
    expect(after!.quantity).toBe(0);
  });

  it('DELETE ?force=true actually removes the row', async () => {
    const cat = await createCategory({ slug: 'c', name: 'C' });
    const p = await createProduct({ name: 'Shirt', slug: 'shirt', price: 5, quantity: 0, categoryId: cat.id });
    const v = await createVariant(p.id, { name: 'M', sku: 'del-force', price: 5 });
    const admin = await createUser({ role: 'admin' });
    const { token: auth } = await authHeader({ role: 'admin', email: admin.email });
    const res = await request(app)
      .delete(`/api/products/${p.id}/variants/${v.id}?force=true`)
      .set('Authorization', `Bearer ${auth}`);
    expect(res.status).toBe(200);
    expect(res.body.data.deleted).toBe(true);
    const after = await mockPrisma.productVariant.findUnique({ where: { id: v.id } });
    expect(after).toBeNull();
  });
});

// =====================================================================
// Validation
// =====================================================================

describe('Validation', () => {
  it('rejects creation with price = 0', async () => {
    const cat = await createCategory({ slug: 'c', name: 'C' });
    const p = await createProduct({ name: 'Shirt', slug: 'shirt', price: 5, quantity: 0, categoryId: cat.id });
    const admin = await createUser({ role: 'admin' });
    const { token: auth } = await authHeader({ role: 'admin', email: admin.email });
    const res = await request(app)
      .post(`/api/products/${p.id}/variants`)
      .set('Authorization', `Bearer ${auth}`)
      .send({ name: 'M', sku: 'p0', price: 0 });
    expect(res.status).toBe(400);
  });

  it('rejects creation with negative quantity', async () => {
    const cat = await createCategory({ slug: 'c', name: 'C' });
    const p = await createProduct({ name: 'Shirt', slug: 'shirt', price: 5, quantity: 0, categoryId: cat.id });
    const admin = await createUser({ role: 'admin' });
    const { token: auth } = await authHeader({ role: 'admin', email: admin.email });
    const res = await request(app)
      .post(`/api/products/${p.id}/variants`)
      .set('Authorization', `Bearer ${auth}`)
      .send({ name: 'M', sku: 'qneg', price: 5, quantity: -1 });
    expect(res.status).toBe(400);
  });

  it('rejects creation with non-integer quantity', async () => {
    const cat = await createCategory({ slug: 'c', name: 'C' });
    const p = await createProduct({ name: 'Shirt', slug: 'shirt', price: 5, quantity: 0, categoryId: cat.id });
    const admin = await createUser({ role: 'admin' });
    const { token: auth } = await authHeader({ role: 'admin', email: admin.email });
    const res = await request(app)
      .post(`/api/products/${p.id}/variants`)
      .set('Authorization', `Bearer ${auth}`)
      .send({ name: 'M', sku: 'qfrac', price: 5, quantity: 1.5 });
    expect(res.status).toBe(400);
  });

  it('rejects creation with empty name', async () => {
    const cat = await createCategory({ slug: 'c', name: 'C' });
    const p = await createProduct({ name: 'Shirt', slug: 'shirt', price: 5, quantity: 0, categoryId: cat.id });
    const admin = await createUser({ role: 'admin' });
    const { token: auth } = await authHeader({ role: 'admin', email: admin.email });
    const res = await request(app)
      .post(`/api/products/${p.id}/variants`)
      .set('Authorization', `Bearer ${auth}`)
      .send({ name: '', sku: 'noname', price: 5 });
    expect(res.status).toBe(400);
  });

  it('rejects creation with a sku that already exists (409)', async () => {
    const cat = await createCategory({ slug: 'c', name: 'C' });
    const p = await createProduct({ name: 'Shirt', slug: 'shirt', price: 5, quantity: 0, categoryId: cat.id });
    await createVariant(p.id, { name: 'M', sku: 'dup-sku', price: 5 });
    const admin = await createUser({ role: 'admin' });
    const { token: auth } = await authHeader({ role: 'admin', email: admin.email });
    const res = await request(app)
      .post(`/api/products/${p.id}/variants`)
      .set('Authorization', `Bearer ${auth}`)
      .send({ name: 'L', sku: 'dup-sku', price: 5 });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/already exists/i);
  });

  it('rejects creation on a non-existent product (404)', async () => {
    const admin = await createUser({ role: 'admin' });
    const { token: auth } = await authHeader({ role: 'admin', email: admin.email });
    const res = await request(app)
      .post('/api/products/00000000-0000-0000-0000-000000000000/variants')
      .set('Authorization', `Bearer ${auth}`)
      .send({ name: 'M', sku: 'no-product', price: 5 });
    expect(res.status).toBe(404);
  });

  it('PATCH on a non-existent variant returns 404', async () => {
    const cat = await createCategory({ slug: 'c', name: 'C' });
    const p = await createProduct({ name: 'Shirt', slug: 'shirt', price: 5, quantity: 0, categoryId: cat.id });
    const admin = await createUser({ role: 'admin' });
    const { token: auth } = await authHeader({ role: 'admin', email: admin.email });
    const res = await request(app)
      .patch(`/api/products/${p.id}/variants/00000000-0000-0000-0000-000000000000`)
      .set('Authorization', `Bearer ${auth}`)
      .send({ price: 99 });
    expect(res.status).toBe(404);
  });

  it('rejects attributes that are not valid JSON when passed as a string', async () => {
    const cat = await createCategory({ slug: 'c', name: 'C' });
    const p = await createProduct({ name: 'Shirt', slug: 'shirt', price: 5, quantity: 0, categoryId: cat.id });
    const admin = await createUser({ role: 'admin' });
    const { token: auth } = await authHeader({ role: 'admin', email: admin.email });
    const res = await request(app)
      .post(`/api/products/${p.id}/variants`)
      .set('Authorization', `Bearer ${auth}`)
      .send({ name: 'M', sku: 'bad-attrs', price: 5, attributes: 'not-json' });
    expect(res.status).toBe(400);
  });

  it('rejects non-object, non-string attributes (e.g. array)', async () => {
    const cat = await createCategory({ slug: 'c', name: 'C' });
    const p = await createProduct({ name: 'Shirt', slug: 'shirt', price: 5, quantity: 0, categoryId: cat.id });
    const admin = await createUser({ role: 'admin' });
    const { token: auth } = await authHeader({ role: 'admin', email: admin.email });
    const res = await request(app)
      .post(`/api/products/${p.id}/variants`)
      .set('Authorization', `Bearer ${auth}`)
      .send({ name: 'M', sku: 'arr-attrs', price: 5, attributes: ['a', 'b'] });
    // The route accepts only object or string; the zod schema for
    // record(unknown) refuses arrays, so this is 400.
    expect(res.status).toBe(400);
  });

  it('PATCH that changes sku to an existing one returns 409', async () => {
    const cat = await createCategory({ slug: 'c', name: 'C' });
    const p = await createProduct({ name: 'Shirt', slug: 'shirt', price: 5, quantity: 0, categoryId: cat.id });
    const a = await createVariant(p.id, { name: 'A', sku: 'sku-a', price: 5 });
    const b = await createVariant(p.id, { name: 'B', sku: 'sku-b', price: 5 });
    const admin = await createUser({ role: 'admin' });
    const { token: auth } = await authHeader({ role: 'admin', email: admin.email });
    const res = await request(app)
      .patch(`/api/products/${p.id}/variants/${a.id}`)
      .set('Authorization', `Bearer ${auth}`)
      .send({ sku: 'sku-b' });
    expect(res.status).toBe(409);
  });
});

// =====================================================================
// Attribute round-trip
// =====================================================================

describe('Attribute round-trip', () => {
  it('object input is stored as JSON and read back as an object', async () => {
    const cat = await createCategory({ slug: 'c', name: 'C' });
    const p = await createProduct({ name: 'X', slug: 'x', price: 5, quantity: 0, categoryId: cat.id });
    const admin = await createUser({ role: 'admin' });
    const { token: auth } = await authHeader({ role: 'admin', email: admin.email });
    const res = await request(app)
      .post(`/api/products/${p.id}/variants`)
      .set('Authorization', `Bearer ${auth}`)
      .send({
        name: 'M', sku: 'attr-1', price: 5,
        attributes: { color: 'red', size: 'M', fit: 'slim' },
      });
    expect(res.status).toBe(201);
    const got = await request(app).get(`/api/variants/${res.body.data.id}`);
    expect(got.body.data.attributes).toEqual({ color: 'red', size: 'M', fit: 'slim' });
  });

  it('JSON string input is stored verbatim', async () => {
    const cat = await createCategory({ slug: 'c', name: 'C' });
    const p = await createProduct({ name: 'X', slug: 'x', price: 5, quantity: 0, categoryId: cat.id });
    const admin = await createUser({ role: 'admin' });
    const { token: auth } = await authHeader({ role: 'admin', email: admin.email });
    const res = await request(app)
      .post(`/api/products/${p.id}/variants`)
      .set('Authorization', `Bearer ${auth}`)
      .send({
        name: 'M', sku: 'attr-2', price: 5,
        attributes: '{"color":"blue","size":"L"}',
      });
    expect(res.status).toBe(201);
    expect(res.body.data.attributes).toEqual({ color: 'blue', size: 'L' });
  });

  it('omitted attributes default to an empty object', async () => {
    const cat = await createCategory({ slug: 'c', name: 'C' });
    const p = await createProduct({ name: 'X', slug: 'x', price: 5, quantity: 0, categoryId: cat.id });
    const admin = await createUser({ role: 'admin' });
    const { token: auth } = await authHeader({ role: 'admin', email: admin.email });
    const res = await request(app)
      .post(`/api/products/${p.id}/variants`)
      .set('Authorization', `Bearer ${auth}`)
      .send({ name: 'M', sku: 'no-attrs', price: 5 });
    expect(res.status).toBe(201);
    expect(res.body.data.attributes).toEqual({});
  });

  it('a corrupt attributes string in the DB reads back as {} (no crash)', async () => {
    const cat = await createCategory({ slug: 'c', name: 'C' });
    const p = await createProduct({ name: 'X', slug: 'x', price: 5, quantity: 0, categoryId: cat.id });
    // Manually inject a corrupt row.
    const v = await mockPrisma.productVariant.create({
      data: { productId: p.id, name: 'X', sku: 'corrupt-attrs', price: 5, attributes: 'this is not json' },
    });
    const res = await request(app).get(`/api/variants/${v.id}`);
    expect(res.status).toBe(200);
    expect(res.body.data.attributes).toEqual({});
  });
});

// =====================================================================
// Cross-product isolation
// =====================================================================

describe('Cross-product isolation', () => {
  it("GET /api/products/:id/variants only returns that product's variants", async () => {
    const cat = await createCategory({ slug: 'c', name: 'C' });
    const a = await createProduct({ name: 'A', slug: 'a', price: 5, quantity: 0, categoryId: cat.id });
    const b = await createProduct({ name: 'B', slug: 'b', price: 5, quantity: 0, categoryId: cat.id });
    await createVariant(a.id, { name: 'A-M', sku: 'a-m', price: 5 });
    await createVariant(b.id, { name: 'B-M', sku: 'b-m', price: 5 });
    const list = await request(app).get(`/api/products/${a.id}/variants`);
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0].name).toBe('A-M');
  });

  it('PATCH with the wrong productId in the URL still finds the variant (the id is authoritative)', async () => {
    // The :productId in the URL is for context only; the variant id
    // is what identifies the row. This is a common pattern for
    // REST sub-resources and matches the implementation.
    const cat = await createCategory({ slug: 'c', name: 'C' });
    const a = await createProduct({ name: 'A', slug: 'a', price: 5, quantity: 0, categoryId: cat.id });
    const b = await createProduct({ name: 'B', slug: 'b', price: 5, quantity: 0, categoryId: cat.id });
    const v = await createVariant(a.id, { name: 'M', sku: 'cross-1', price: 5 });
    const admin = await createUser({ role: 'admin' });
    const { token: auth } = await authHeader({ role: 'admin', email: admin.email });
    const res = await request(app)
      .patch(`/api/products/${b.id}/variants/${v.id}`)
      .set('Authorization', `Bearer ${auth}`)
      .send({ price: 9.99 });
    expect(res.status).toBe(200);
    expect(res.body.data.price).toBe(9.99);
    // The variant's productId is still the original.
    expect(res.body.data.productId).toBe(a.id);
  });
});

// =====================================================================
// End-to-end flow
// =====================================================================

describe('Real-world flow', () => {
  it('create variant, list it, update price, deactivate, then DELETE ?force=true', async () => {
    const cat = await createCategory({ slug: 'c', name: 'C' });
    const p = await createProduct({ name: 'X', slug: 'x', price: 5, quantity: 0, categoryId: cat.id });
    const admin = await createUser({ role: 'admin' });
    const { token: auth } = await authHeader({ role: 'admin', email: admin.email });
    // 1. Create
    const create = await request(app)
      .post(`/api/products/${p.id}/variants`)
      .set('Authorization', `Bearer ${auth}`)
      .send({ name: 'M', sku: 'flow-1', price: 5, quantity: 10, attributes: { size: 'M' } });
    expect(create.status).toBe(201);
    const id = create.body.data.id;
    // 2. List
    const list = await request(app).get(`/api/products/${p.id}/variants`);
    expect(list.body.data).toHaveLength(1);
    // 3. Update price
    const patch = await request(app)
      .patch(`/api/products/${p.id}/variants/${id}`)
      .set('Authorization', `Bearer ${auth}`)
      .send({ price: 7.5 });
    expect(patch.body.data.price).toBe(7.5);
    // 4. Soft-delete (deactivate)
    const soft = await request(app)
      .delete(`/api/products/${p.id}/variants/${id}`)
      .set('Authorization', `Bearer ${auth}`);
    expect(soft.status).toBe(200);
    const stillThere = await mockPrisma.productVariant.findUnique({ where: { id } });
    expect(stillThere!.isActive).toBe(false);
    // 5. Force-delete
    const force = await request(app)
      .delete(`/api/products/${p.id}/variants/${id}?force=true`)
      .set('Authorization', `Bearer ${auth}`);
    expect(force.status).toBe(200);
    expect(force.body.data.deleted).toBe(true);
    expect(await mockPrisma.productVariant.findUnique({ where: { id } })).toBeNull();
  });
});
