/**
 * VariantAttribute query index - the (key, value) mirror of the
 * Variant.attributes JSON column.
 *
 * Pins the maintenance contract (every variant write site keeps the
 * index in step) and the read contract (/products attribute filtering
 * and the facet tally run against the index, so a variant with no
 * index rows is invisible to attribute filters even if its JSON column
 * is correct).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { getTestApp, cleanDatabase, authHeader } from '../helpers/db';
import { mockPrisma } from '../helpers/mockPrisma';
import { createProduct, createVariant, createCategory } from '../helpers/factories';
import type { Express } from 'express';

let app: Express;
beforeAll(async () => { app = await getTestApp(); });
afterAll(async () => { await mockPrisma.$disconnect(); });
beforeEach(async () => { await cleanDatabase(); });

const indexRowsFor = (variantId: string) =>
  mockPrisma.variantAttribute.findMany({ where: { variantId } });

describe('maintenance: the index tracks variant writes', () => {
  it('createVariant writes one index row per attribute pair', async () => {
    const p = await createProduct();
    const v = await createVariant(p.id, { attributes: { color: 'red', size: 'M' } });
    const rows = (await indexRowsFor(v.id)).sort((a: any, b: any) => a.key.localeCompare(b.key));
    expect(rows.map((r: any) => [r.key, r.value])).toEqual([
      ['color', 'red'],
      ['size', 'M'],
    ]);
  });

  it('a variant without attributes has no index rows', async () => {
    const p = await createProduct();
    const v = await createVariant(p.id, {});
    expect(await indexRowsFor(v.id)).toHaveLength(0);
  });

  it('the product-create route keeps the index in step for nested variants', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const res = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Indexed Shirt',
        sku: 'IDX-SHIRT-1',
        description: 'A shirt with indexed attributes',
        price: 19.99,
        variants: [
          { name: 'Red M', sku: 'IDX-SHIRT-RED-M', price: 19.99, attributes: '{"color":"red","size":"M"}' },
          { name: 'Blue L', sku: 'IDX-SHIRT-BLUE-L', price: 19.99, attributes: '{"color":"blue","size":"L"}' },
        ],
      });
    expect(res.status).toBe(201);
    const created = await mockPrisma.product.findUnique({ where: { sku: 'IDX-SHIRT-1' } });
    const variants = await mockPrisma.variant.findMany({ where: { productId: created.id } });
    expect(variants).toHaveLength(2);
    const allRows = await mockPrisma.variantAttribute.findMany({
      where: { variantId: { in: variants.map((v: any) => v.id) } },
    });
    expect(allRows).toHaveLength(4); // 2 pairs per variant
  });

  it('replacing a product\'s variants via import/export commit rewrites the index', async () => {
    // The import's product row has no category, so it needs the default
    // "General" category to exist (the seed creates it on fresh installs).
    await createCategory({ name: 'General', slug: 'general' });
    const p = await createProduct({ sku: 'IDX-IMPORT' });
    const v = await createVariant(p.id, { attributes: { color: 'red' } });
    expect(await indexRowsFor(v.id)).toHaveLength(1);

    const { token } = await authHeader({ role: 'admin' });
    // Commit an update that replaces the variant set with a different one.
    const res = await request(app)
      .post('/api/import-export/commit')
      .set('Authorization', `Bearer ${token}`)
      .send({
        entity: 'products',
        format: 'json',
        text: JSON.stringify([
          { sku: 'IDX-IMPORT', name: 'IDX-IMPORT', price: 10, variants: [{ name: 'Green S', sku: 'IDX-IMPORT-GRN', price: 10, attributes: { color: 'green', size: 'S' } }] },
        ]),
      });
    expect(res.status).toBe(200);
    // The old variant (and its red row) is gone; the new one has its pair.
    expect(await indexRowsFor(v.id)).toHaveLength(0);
    const fresh = await mockPrisma.variant.findUnique({ where: { sku: 'IDX-IMPORT-GRN' } });
    const rows = (await indexRowsFor(fresh.id)).sort((a: any, b: any) => a.key.localeCompare(b.key));
    expect(rows.map((r: any) => [r.key, r.value])).toEqual([['color', 'green'], ['size', 'S']]);
  });
});

describe('reads: the SQL attribute filter uses the index', () => {
  async function fixture() {
    const pA = await createProduct({ name: 'Shirt A', sku: 'FILT-A' });
    const pB = await createProduct({ name: 'Shirt B', sku: 'FILT-B' });
    await createVariant(pA.id, { attributes: { color: 'red', size: 'M' } });
    await createVariant(pA.id, { attributes: { color: 'blue', size: 'L' } });
    await createVariant(pB.id, { attributes: { color: 'red', size: 'L' } });
    return { pA, pB };
  }

  it('finds products whose one variant matches the attribute pair', async () => {
    await fixture();
    // color=red: both products have a red variant.
    const res = await request(app).get('/api/products?attr.color=red');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
  });

  it('AND across keys requires ONE variant with all pairs', async () => {
    await fixture();
    // color=red AND size=M: only Shirt A (its red variant is also M).
    const res = await request(app).get('/api/products?attr.color=red&attr.size=M');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].sku).toBe('FILT-A');
  });

  it('OR within a key accepts any listed value', async () => {
    await fixture();
    // size=M or size=L: both products (A has both sizes, B has L).
    const res = await request(app).get('/api/products?attr.size=M,L');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
  });

  it('returns an empty list (not the unfiltered set) when nothing matches', async () => {
    await fixture();
    const res = await request(app).get('/api/products?attr.color=yellow');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
    expect(res.body.pagination.total).toBe(0);
  });

  it('ignores index rows of inactive variants (old post-filter semantics)', async () => {
    const p = await createProduct({ name: 'Shirt C', sku: 'FILT-C' });
    const v = await createVariant(p.id, { attributes: { color: 'green' } });
    // Deactivate the variant - its index rows remain but must not match.
    await mockPrisma.variant.update({ where: { id: v.id }, data: { isActive: false } });
    const res = await request(app).get('/api/products?attr.color=green');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
  });
});

describe('reads: the facet tally reads the index', () => {
  it('counts (key, value) pairs from the index over the candidate set', async () => {
    const pA = await createProduct({ name: 'Facet A', sku: 'FACET-A' });
    const pB = await createProduct({ name: 'Facet B', sku: 'FACET-B' });
    await createVariant(pA.id, { attributes: { color: 'red' } });
    await createVariant(pA.id, { attributes: { color: 'red' } });
    await createVariant(pB.id, { attributes: { color: 'blue' } });

    const res = await request(app).get('/api/products/facets');
    expect(res.status).toBe(200);
    expect(res.body.data.attributes.color).toEqual(
      expect.arrayContaining([
        { value: 'red', count: 2, selected: false },
        { value: 'blue', count: 1, selected: false },
      ]),
    );
  });
});
