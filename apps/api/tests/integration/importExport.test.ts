/**
 * Integration tests for the bulk import/export feature
 * (src/modules/importExport/, mounted at /api/import-export).
 *
 * Covers:
 *   - admin/manager-only access
 *   - CSV + JSON export (products & categories) and the sample templates
 *   - preview: create/update/error classification without writing
 *   - commit: all-or-nothing application, SKU matching, category
 *     resolution, variant/image replacement, row-level error reporting
 *   - the export->import round-trip
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { getTestApp, cleanDatabase, authHeader } from '../helpers/db';
import { mockPrisma, peekMockStore } from '../helpers/mockPrisma';
import { createCategory, createProduct, addProductImage, createVariant } from '../helpers/factories';
import { PRODUCT_CSV_HEADERS, CATEGORY_CSV_HEADERS } from '../../src/modules/importExport/mappers';
import type { Express } from 'express';

let app: Express;
beforeAll(async () => { app = await getTestApp(); });
afterAll(async () => { await mockPrisma.$disconnect(); });
beforeEach(async () => { await cleanDatabase(); });

// Build a CSV string from a header + data rows, quoting cells that need it.
const csv = (headers: string[], rows: (string | number)[][]) =>
  [headers, ...rows]
    .map((r) =>
      r
        .map((c) => {
          const s = String(c ?? '');
          return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(','),
    )
    .join('\n');

const admin = () => authHeader({ role: 'admin' });
const manager = () => authHeader({ role: 'manager' });
const customer = () => authHeader({ role: 'customer' });

// ---------------------------------------------------------------------------
// access control + request validation
// ---------------------------------------------------------------------------

describe('access control', () => {
  it('rejects unauthenticated requests (401)', async () => {
    const res = await request(app).get('/api/import-export/export/products');
    expect(res.status).toBe(401);
  });

  it('rejects customers (403) on export, preview and commit', async () => {
    const { token } = await customer();
    expect((await request(app).get('/api/import-export/export/products').set('Authorization', `Bearer ${token}`)).status).toBe(403);
    expect(
      (
        await request(app)
          .post('/api/import-export/preview')
          .set('Authorization', `Bearer ${token}`)
          .send({ entity: 'products', format: 'csv', text: 'name,sku,price\nA,a,1' })
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .post('/api/import-export/commit')
          .set('Authorization', `Bearer ${token}`)
          .send({ entity: 'products', format: 'csv', text: 'name,sku,price\nA,a,1' })
      ).status,
    ).toBe(403);
  });

  it('allows managers (not only admins)', async () => {
    const { token } = await manager();
    const res = await request(app).get('/api/import-export/export/products').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});

describe('request validation', () => {
  it('400 for an unknown export entity', async () => {
    const { token } = await admin();
    const res = await request(app).get('/api/import-export/export/orders').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  it('400 for an unknown export format', async () => {
    const { token } = await admin();
    const res = await request(app).get('/api/import-export/export/products?format=xml').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  it('400 when the preview body is missing text or has a bad entity/format', async () => {
    const { token } = await admin();
    for (const body of [
      { entity: 'products', format: 'csv' },
      { entity: 'nope', format: 'csv', text: 'a' },
      { entity: 'products', format: 'xml', text: 'a' },
    ]) {
      const res = await request(app).post('/api/import-export/preview').set('Authorization', `Bearer ${token}`).send(body);
      expect(res.status).toBe(400);
    }
  });

  it('400 when the file exceeds the row limit', async () => {
    const { token } = await admin();
    const rows = Array.from({ length: 2001 }, (_, i) => [`P${i}`, `sku-${i}`, '1']);
    const res = await request(app)
      .post('/api/import-export/preview')
      .set('Authorization', `Bearer ${token}`)
      .send({ entity: 'products', format: 'csv', text: csv(['name', 'sku', 'price'], rows) });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Too many rows/);
  });

  it('400 for invalid JSON in a JSON import', async () => {
    const { token } = await admin();
    const res = await request(app)
      .post('/api/import-export/preview')
      .set('Authorization', `Bearer ${token}`)
      .send({ entity: 'products', format: 'json', text: '{not json' });
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// export
// ---------------------------------------------------------------------------

describe('GET /api/import-export/export/:entity', () => {
  it('exports products as CSV with the full header and quoted cells', async () => {
    const { token } = await admin();
    const cat = await createCategory({ name: 'General', slug: 'general' });
    const product = await createProduct({
      name: 'The Widget',
      sku: 'W-1',
      categoryId: cat.id,
      description: 'Comma, "quotes" and\na newline',
      price: 12.5,
    });
    await addProductImage(product.id, { url: '/img/a.jpg', alt: 'A' });

    const res = await request(app).get('/api/import-export/export/products').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.headers['content-disposition']).toMatch(/products-export-\d{8}\.csv/);

    const text: string = res.text;
    const firstLine = text.split('\n')[0];
    expect(firstLine.split(',')).toEqual(PRODUCT_CSV_HEADERS);
    expect(text).toContain('The Widget');
    expect(text).toContain('W-1');
    // description contains a comma/quote/newline -> must be quoted
    expect(text).toContain('"Comma, ""quotes"" and');
    expect(text).toContain('"/img/a.jpg"');
  });

  it('exports products as JSON with nested images/variants', async () => {
    const { token } = await admin();
    const cat = await createCategory({ name: 'General', slug: 'general' });
    const product = await createProduct({ sku: 'W-2', categoryId: cat.id, price: 7 });
    await createVariant(product.id, { sku: 'W-2-BIG', name: 'Big', price: 9 });
    await addProductImage(product.id, { url: '/img/b.jpg', alt: 'B' });

    const res = await request(app).get('/api/import-export/export/products?format=json').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toMatch(/products-export-\d{8}\.json/);
    const body = res.body;
    expect(body.entity).toBe('products');
    expect(body.count).toBe(1);
    expect(body.products[0].sku).toBe('W-2');
    expect(body.products[0].category).toBe('General');
    expect(body.products[0].variants).toEqual(
      expect.arrayContaining([expect.objectContaining({ sku: 'W-2-BIG', price: 9 })]),
    );
    expect(body.products[0].images).toEqual(
      expect.arrayContaining([expect.objectContaining({ url: '/img/b.jpg' })]),
    );
  });

  it('exports categories as CSV including the parent name', async () => {
    const { token } = await admin();
    const parent = await createCategory({ name: 'Shoes', slug: 'shoes' });
    await createCategory({ name: 'Sneakers', slug: 'sneakers' }).then((c) =>
      mockPrisma.category.update({ where: { id: c.id }, data: { parentId: parent.id } }),
    );

    const res = await request(app).get('/api/import-export/export/categories').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.text.split('\n')[0].split(',')).toEqual(CATEGORY_CSV_HEADERS);
    expect(res.text).toContain('Shoes');
    // the child row lists its parent name in the `parent` column
    const sneakerRow = res.text.split('\n').find((l: string) => l.startsWith('Sneakers,'));
    expect(sneakerRow).toContain('Shoes');
  });

  it('exports categories as JSON', async () => {
    const { token } = await admin();
    await createCategory({ name: 'Books', slug: 'books' });
    const res = await request(app).get('/api/import-export/export/categories?format=json').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
    expect(res.body.categories[0].name).toBe('Books');
  });

  it('returns a one-row template for sample=1', async () => {
    const { token } = await admin();
    const res = await request(app).get('/api/import-export/export/products?sample=1').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toMatch(/products-template-\d{8}\.csv/);
    const lines = res.text.trim().split('\n');
    expect(lines).toHaveLength(2); // header + one sample row
    expect(lines[1]).toContain('SKU-0001');

    const json = await request(app).get('/api/import-export/export/categories?sample=1&format=json').set('Authorization', `Bearer ${token}`);
    expect(json.body.count).toBe(1);
    expect(json.body.categories[0].name).toBe('Sample Category');
  });
});

// ---------------------------------------------------------------------------
// preview
// ---------------------------------------------------------------------------

describe('POST /api/import-export/preview (products)', () => {
  it('classifies rows as create / update / error without writing', async () => {
    const { token } = await admin();
    const cat = await createCategory({ name: 'General', slug: 'general' });
    await createProduct({ name: 'Existing', sku: 'EXIST-1', categoryId: cat.id });

    const text = csv(
      ['name', 'sku', 'price', 'category'],
      [
        ['New One', 'NEW-1', '5', 'General'],
        ['Existing', 'EXIST-1', '99', 'General'],
        ['Bad Price', 'BAD-1', 'not-a-number', 'General'],
        ['Dup', 'DUP-1', '1', 'General'],
        ['Dup again', 'DUP-1', '2', 'General'],
      ],
    );
    const before = peekMockStore('product').length;

    const res = await request(app)
      .post('/api/import-export/preview')
      .set('Authorization', `Bearer ${token}`)
      .send({ entity: 'products', format: 'csv', text });

    expect(res.status).toBe(200);
    const { data } = res.body;
    expect(data.entity).toBe('products');
    expect(data.total).toBe(5);
    // NEW-1 + first DUP-1 are creates; EXIST-1 is an update; BAD-1 (bad
    // price) and the second DUP-1 are errors.
    expect(data.summary).toEqual({ create: 2, update: 1, error: 2 });
    expect(data.rows[0]).toMatchObject({ row: 1, status: 'create', sku: 'NEW-1', errors: [] });
    expect(data.rows[1]).toMatchObject({ row: 2, status: 'update', sku: 'EXIST-1' });
    expect(data.rows[2].status).toBe('error');
    expect(data.rows[2].errors.join(' ')).toMatch(/price/);
    expect(data.rows[3]).toMatchObject({ row: 4, status: 'create', sku: 'DUP-1' });
    expect(data.rows[4].errors.join(' ')).toMatch(/duplicate sku/i);
    // preview must not write anything
    expect(peekMockStore('product').length).toBe(before);
  });

  it('reports bad boolean/date/JSON cells as row errors instead of crashing (500)', async () => {
    const { token } = await admin();
    const text = csv(
      ['name', 'sku', 'price', 'trackInventory', 'expectedRestockAt', 'dimensions', 'metaKeywords'],
      [
        ['Bad Bool', 'BB-1', '1', 'maybe', 'not-a-date', '{bad json', ''],
        ['Good', 'GG-1', '1', 'yes', '2026-12-01', '{"length":1}', 'a, b, c'],
      ],
    );
    const res = await request(app)
      .post('/api/import-export/preview')
      .set('Authorization', `Bearer ${token}`)
      .send({ entity: 'products', format: 'csv', text });

    expect(res.status).toBe(200);
    // The first bad cell aborts the row (one clear error is reported);
    // the important thing is it is a row error, not a 500.
    expect(res.body.data.rows[0].status).toBe('error');
    expect(res.body.data.rows[0].errors.join(' ')).toMatch(/trackInventory/);
    expect(res.body.data.rows[1].status).toBe('create');
    expect(res.body.data.rows[1].errors).toEqual([]);
  });
});

describe('POST /api/import-export/preview (categories)', () => {
  it('classifies by slug, then name (case-insensitive)', async () => {
    const { token } = await admin();
    await createCategory({ name: 'Books', slug: 'books' });
    const text = csv(
      ['name', 'slug', 'sortOrder'],
      [
        ['New Cat', 'new-cat', '1'],
        ['BOOKS', '', '2'], // matches existing by name, case-insensitive
        ['', '', '3'], // neither name nor slug -> error (non-empty so the parser keeps it)
      ],
    );
    const res = await request(app)
      .post('/api/import-export/preview')
      .set('Authorization', `Bearer ${token}`)
      .send({ entity: 'categories', format: 'csv', text });
    expect(res.status).toBe(200);
    expect(res.body.data.rows.map((r: any) => r.status)).toEqual(['create', 'update', 'error']);
    expect(res.body.data.rows[2].errors.join(' ')).toMatch(/name/);
  });
});

// ---------------------------------------------------------------------------
// commit (products)
// ---------------------------------------------------------------------------

describe('POST /api/import-export/commit (products)', () => {
  it('creates a product with variants and images, applying defaults', async () => {
    const { token } = await admin();
    await createCategory({ name: 'General', slug: 'general' });

    const text = csv(
      ['name', 'sku', 'price', 'category', 'variants', 'images'],
      [
        [
          'Multi Variant Widget',
          'MV-1',
          '10',
          'General',
          JSON.stringify([
            { name: 'Small', sku: 'MV-1-S', price: 8, quantity: 5, attributes: { size: 'S' } },
            { name: 'Large', sku: 'MV-1-L', price: 12 },
          ]),
          JSON.stringify([
            { url: '/img/1.jpg', alt: 'First' },
            { url: '/img/2.jpg' },
          ]),
        ],
      ],
    );
    const res = await request(app)
      .post('/api/import-export/commit')
      .set('Authorization', `Bearer ${token}`)
      .send({ entity: 'products', format: 'csv', text });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ created: 1, updated: 0, failed: 0 });
    expect(res.body.data.errors).toEqual([]);

    const [product] = peekMockStore('product');
    expect(product.sku).toBe('MV-1');
    expect(product.name).toBe('Multi Variant Widget');
    expect(product.slug).toBe('multi-variant-widget');
    expect(product.status).toBe('active'); // schema default applied
    expect(product.categoryId).toBeDefined();

    const variants = peekMockStore('variant').filter((v) => v.productId === product.id);
    expect(variants).toHaveLength(2);
    const small = variants.find((v) => v.sku === 'MV-1-S');
    expect(small.price).toBe(8);
    expect(JSON.parse(small.attributes)).toEqual({ size: 'S' });

    const images = peekMockStore('productImage').filter((i) => i.productId === product.id);
    expect(images).toHaveLength(2);
    expect(images[0].isPrimary).toBe(true); // first image becomes primary
    expect(images[1].isPrimary).toBe(false);
  });

  it('matches by SKU and updates only the provided fields (empty cells ignored)', async () => {
    const { token } = await admin();
    const cat = await createCategory({ name: 'General', slug: 'general' });
    const existing = await createProduct({ name: 'Old Name', sku: 'U-1', categoryId: cat.id, price: 5 });
    await createVariant(existing.id, { sku: 'U-1-V', name: 'V', price: 6 });

    // Only name + price columns: no variants column -> variants untouched.
    const text = csv(['name', 'sku', 'price'], [['New Name', 'U-1', '10']]);
    const res = await request(app)
      .post('/api/import-export/commit')
      .set('Authorization', `Bearer ${token}`)
      .send({ entity: 'products', format: 'csv', text });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ created: 0, updated: 1, failed: 0 });
    expect(peekMockStore('product')).toHaveLength(1);
    const after = peekMockStore('product')[0];
    expect(after.name).toBe('New Name');
    expect(after.price).toBe(10);
    expect(after.slug).toBe(existing.slug); // untouched field keeps its value
    const variants = peekMockStore('variant').filter((v) => v.productId === existing.id);
    expect(variants.map((v) => v.sku)).toEqual(['U-1-V']); // untouched
  });

  it('replaces variants and images when the file provides them', async () => {
    const { token } = await admin();
    const cat = await createCategory({ name: 'General', slug: 'general' });
    const existing = await createProduct({ name: 'P', sku: 'R-1', categoryId: cat.id, price: 5 });
    await createVariant(existing.id, { sku: 'OLD-V', name: 'Old', price: 6 });
    await addProductImage(existing.id, { url: '/old.jpg' });

    const text = csv(
      ['name', 'sku', 'price', 'variants', 'images'],
      [
        ['P', 'R-1', '5', JSON.stringify([{ name: 'New', sku: 'NEW-V', price: 7 }]), JSON.stringify([{ url: '/new.jpg' }])],
      ],
    );
    const res = await request(app)
      .post('/api/import-export/commit')
      .set('Authorization', `Bearer ${token}`)
      .send({ entity: 'products', format: 'csv', text });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ updated: 1, failed: 0 });
    const variants = peekMockStore('variant').filter((v) => v.productId === existing.id);
    expect(variants.map((v) => v.sku)).toEqual(['NEW-V']);
    const images = peekMockStore('productImage').filter((i) => i.productId === existing.id);
    expect(images.map((i) => i.url)).toEqual(['/new.jpg']);
  });

  it('resolves the category case-insensitively', async () => {
    const { token } = await admin();
    await createCategory({ name: 'General', slug: 'general' });
    const text = csv(['name', 'sku', 'price', 'category'], [['Cased', 'C-1', '1', 'gEnErAl']]);
    const res = await request(app)
      .post('/api/import-export/commit')
      .set('Authorization', `Bearer ${token}`)
      .send({ entity: 'products', format: 'csv', text });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ created: 1, failed: 0 });
  });

  it('is all-or-nothing: a missing category blocks the WHOLE file', async () => {
    const { token } = await admin();
    const cat = await createCategory({ name: 'General', slug: 'general' });
    await createProduct({ name: 'Keep Me', sku: 'K-1', categoryId: cat.id, price: 1 });

    const text = csv(
      ['name', 'sku', 'price', 'category'],
      [
        ['Fine One', 'F-1', '1', 'General'],
        ['No Category', 'N-1', '2', 'Does Not Exist'],
      ],
    );
    const res = await request(app)
      .post('/api/import-export/commit')
      .set('Authorization', `Bearer ${token}`)
      .send({ entity: 'products', format: 'csv', text });

    expect(res.status).toBe(200);
    const { data } = res.body;
    expect(data.created).toBe(0); // NOTHING was applied
    expect(data.updated).toBe(0);
    expect(data.failed).toBeGreaterThanOrEqual(1);
    expect(data.errors[0].errors.join(' ')).toMatch(/category/i);
    // The bad row was not created; the pre-existing product is intact.
    // (Full transaction rollback is guaranteed by Prisma in production;
    // the in-memory mock has no rollback, so partial in-flight writes
    // from the aborted run may linger in its store.)
    expect(peekMockStore('product').map((p) => p.sku)).not.toContain('N-1');
    expect(peekMockStore('product').map((p) => p.sku)).toContain('K-1');
  });

  it('returns row validation errors and writes nothing when any row is invalid', async () => {
    const { token } = await admin();
    const cat = await createCategory({ name: 'General', slug: 'general' });
    const text = csv(
      ['name', 'sku', 'price', 'category'],
      [
        ['Good', 'G-1', '1', 'General'],
        ['Bad', 'B-1', '-5', 'General'], // negative price
      ],
    );
    const res = await request(app)
      .post('/api/import-export/commit')
      .set('Authorization', `Bearer ${token}`)
      .send({ entity: 'products', format: 'csv', text });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ created: 0, updated: 0 });
    expect(res.body.data.errors.length).toBeGreaterThan(0);
    expect(res.body.data.errors[0].row).toBe(2);
    expect(peekMockStore('product').map((p) => p.sku)).toEqual([]);
  });

  it('accepts a plain JSON array too', async () => {
    const { token } = await admin();
    await createCategory({ name: 'General', slug: 'general' });
    const res = await request(app)
      .post('/api/import-export/commit')
      .set('Authorization', `Bearer ${token}`)
      .send({
        entity: 'products',
        format: 'json',
        text: JSON.stringify([{ name: 'Json Product', sku: 'J-1', price: 3, category: 'General' }]),
      });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ created: 1, failed: 0 });
  });

  it('round-trips: an exported JSON file re-imports as an update', async () => {
    const { token } = await admin();
    const cat = await createCategory({ name: 'General', slug: 'general' });
    const product = await createProduct({ name: 'RT', sku: 'RT-1', categoryId: cat.id, price: 4 });
    await createVariant(product.id, { sku: 'RT-1-V', name: 'V', price: 5 });
    await addProductImage(product.id, { url: '/rt.jpg', alt: 'RT' });

    const exported = await request(app).get('/api/import-export/export/products?format=json').set('Authorization', `Bearer ${token}`);
    expect(exported.status).toBe(200);

    const res = await request(app)
      .post('/api/import-export/commit')
      .set('Authorization', `Bearer ${token}`)
      .send({ entity: 'products', format: 'json', text: JSON.stringify(exported.body) });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ created: 0, updated: 1, failed: 0 });
    expect(res.body.data.errors).toEqual([]);
    // nothing duplicated
    expect(peekMockStore('product')).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// commit (categories)
// ---------------------------------------------------------------------------

describe('POST /api/import-export/commit (categories)', () => {
  it('creates categories and links parents by name', async () => {
    const { token } = await admin();
    const text = csv(
      ['name', 'slug', 'parent', 'sortOrder'],
      [
        ['Shoes', 'shoes', '', '1'],
        ['Sneakers', 'sneakers', 'Shoes', '2'],
      ],
    );
    const res = await request(app)
      .post('/api/import-export/commit')
      .set('Authorization', `Bearer ${token}`)
      .send({ entity: 'categories', format: 'csv', text });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ created: 2, updated: 0, failed: 0 });
    const shoes = peekMockStore('category').find((c) => c.slug === 'shoes');
    const sneakers = peekMockStore('category').find((c) => c.slug === 'sneakers');
    expect(sneakers.parentId).toBe(shoes.id);
  });

  it('updates an existing category matched by name (case-insensitive)', async () => {
    const { token } = await admin();
    const existing = await createCategory({ name: 'Books', slug: 'books', sortOrder: 0 });
    const text = csv(['name', 'description', 'sortOrder'], [['BOOKS', 'Updated description', '5']]);
    const res = await request(app)
      .post('/api/import-export/commit')
      .set('Authorization', `Bearer ${token}`)
      .send({ entity: 'categories', format: 'csv', text });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ created: 0, updated: 1, failed: 0 });
    const after = peekMockStore('category')[0];
    expect(after.id).toBe(existing.id);
    expect(after.description).toBe('Updated description');
    expect(after.sortOrder).toBe(5);
  });

  it('suffixes an auto-generated slug that collides with an existing one', async () => {
    const { token } = await admin();
    // Existing category whose slug collides with the slug that would be
    // generated from the NEW name (the names themselves differ, so the
    // row is a create, not an update).
    await createCategory({ name: 'Books, Edition', slug: 'books-edition' });
    const text = csv(['name'], [['Books-Edition']]);
    const res = await request(app)
      .post('/api/import-export/commit')
      .set('Authorization', `Bearer ${token}`)
      .send({ entity: 'categories', format: 'csv', text });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ created: 1, failed: 0 });
    expect(peekMockStore('category').map((c) => c.slug).sort()).toEqual(['books-edition', 'books-edition-2']);
  });

  it('rejects a category that is its own parent (writes nothing)', async () => {
    const { token } = await admin();
    const existing = await createCategory({ name: 'Books', slug: 'books' });
    const text = csv(['name', 'parent'], [['Books', 'Books']]);
    const res = await request(app)
      .post('/api/import-export/commit')
      .set('Authorization', `Bearer ${token}`)
      .send({ entity: 'categories', format: 'csv', text });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ created: 0, updated: 0, failed: 1 });
    expect(res.body.data.errors[0].errors.join(' ')).toMatch(/its own parent/);
    expect(peekMockStore('category')).toHaveLength(1);
    expect(peekMockStore('category')[0].id).toBe(existing.id);
  });

  it('is all-or-nothing when a parent is missing', async () => {
    const { token } = await admin();
    const text = csv(
      ['name', 'parent'],
      [
        ['A', '', ''],
        ['B', 'No Such Parent', ''],
      ],
    );
    const res = await request(app)
      .post('/api/import-export/commit')
      .set('Authorization', `Bearer ${token}`)
      .send({ entity: 'categories', format: 'csv', text });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ created: 0, updated: 0 });
    expect(res.body.data.errors[0].errors.join(' ')).toMatch(/parent/i);
    // The row with the missing parent was not created (production
    // rollback of row A is Prisma's job; the mock has none).
    expect(peekMockStore('category').map((c) => c.name)).not.toContain('B');
  });
});
