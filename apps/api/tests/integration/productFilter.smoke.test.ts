/**
 * Live integration smoke test for the new filter feature.
 *
 * Purpose: confirm that the route, the service, the schema, and the
 * query-string parser all line up end-to-end. We hit the real
 * supertest app (not just the service function) with every interesting
 * query string variation and assert the response shape.
 *
 * This test is intentionally verbose: each "it" block sets up its
 * own fixture and writes a single short assertion, so a failure
 * points at exactly one query combination.
 */
import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { getTestApp, cleanDatabase } from '../helpers/db';
import { mockPrisma } from '../helpers/mockPrisma';
import {
  createProduct,
  createCategory,
  createVariant,
  createReview,
  createUser,
} from '../helpers/factories';
import type { Express } from 'express';

let app: Express;
beforeAll(async () => { app = await getTestApp(); });
afterAll(async () => { await mockPrisma.$disconnect(); });
beforeEach(async () => { await cleanDatabase(); });

/**
 * Build a small catalog that exercises every filter dimension.
 * Returns the products by slug for easy lookup in assertions.
 */
async function seed() {
  const clothing = await createCategory({ slug: 'clothing', name: 'Clothing' });
  const books = await createCategory({ slug: 'books', name: 'Books' });

  // Two clothing products, one on-sale, one not, both with variants.
  const shirt = await createProduct({
    name: 'Cool Shirt', slug: 'cool-shirt', price: 20, compareAtPrice: 30,
    quantity: 10, categoryId: clothing.id,
  });
  const hoodie = await createProduct({
    name: 'Plain Hoodie', slug: 'plain-hoodie', price: 50,
    quantity: 0, categoryId: clothing.id, status: 'active',
  });
  // A book, in stock, no variants, no discount.
  const book = await createProduct({
    name: 'TS Handbook', slug: 'ts-handbook', price: 35, quantity: 5,
    categoryId: books.id,
  });
  // A digital product with no category (should be reachable only by
  // omitting the category filter).
  const ebook = await createProduct({
    name: 'eBook PDF', slug: 'ebook', price: 9.99, quantity: 100, type: 'digital',
  });
  // Variants on the shirt with attributes we can filter on.
  await createVariant(shirt.id, { name: 'M-red', sku: 'shirt-m', attributes: { size: 'M', color: 'red' } });
  await createVariant(shirt.id, { name: 'L-blue', sku: 'shirt-l', attributes: { size: 'L', color: 'blue' } });
  await createVariant(hoodie.id, { name: 'XL-red', sku: 'hoodie-xl', attributes: { size: 'XL', color: 'red' } });

  const user = await createUser({});
  await createReview(user.id, book.id, { rating: 5, isApproved: true });
  await createReview(user.id, shirt.id, { rating: 4, isApproved: true });
  await createReview(user.id, hoodie.id, { rating: 3, isApproved: true });

  return { clothing, books, shirt, hoodie, book, ebook };
}

describe('GET /api/products - filter smoke', () => {
  it('returns the default page (no query) with all active products', async () => {
    await seed();
    const res = await request(app).get('/api/products');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data).toHaveLength(4); // shirt, hoodie, book, ebook
    expect(res.body.pagination.total).toBe(4);
    expect(res.body.pagination.page).toBe(1);
    expect(res.body.pagination.limit).toBe(20);
  });

  it('echoes the resolved filter under "applied"', async () => {
    await seed();
    const res = await request(app).get('/api/products?category=clothing&onSale=true&sort=price_asc');
    expect(res.status).toBe(200);
    expect(res.body.applied).toMatchObject({
      category: ['clothing'],
      onSale: true,
      sort: 'price_asc',
    });
    // Sort is preserved as a literal, not normalised.
    expect(res.body.applied.sort).toBe('price_asc');
  });

  it('multi-select category: ?category=clothing,books', async () => {
    await seed();
    const res = await request(app).get('/api/products?category=clothing,books');
    expect(res.status).toBe(200);
    const slugs = res.body.data.map((p: any) => p.slug).sort();
    // 3 products: shirt, hoodie, book. ebook is uncategorised.
    expect(slugs).toEqual(['cool-shirt', 'plain-hoodie', 'ts-handbook']);
  });

  it('repeated category keys: ?category=clothing&category=books', async () => {
    await seed();
    const res = await request(app).get('/api/products?category=clothing&category=books');
    expect(res.status).toBe(200);
    const slugs = res.body.data.map((p: any) => p.slug).sort();
    expect(slugs).toEqual(['cool-shirt', 'plain-hoodie', 'ts-handbook']);
  });

  it('onSale=true returns only products with compareAtPrice > price', async () => {
    await seed();
    const res = await request(app).get('/api/products?onSale=true');
    expect(res.status).toBe(200);
    const slugs = res.body.data.map((p: any) => p.slug).sort();
    expect(slugs).toEqual(['cool-shirt']);
    for (const p of res.body.data) {
      expect(p.compareAtPrice).toBeGreaterThan(p.price);
    }
  });

  it('inStock=true excludes quantity=0 products', async () => {
    await seed();
    const res = await request(app).get('/api/products?inStock=true');
    expect(res.status).toBe(200);
    const slugs = res.body.data.map((p: any) => p.slug).sort();
    expect(slugs).toEqual(['cool-shirt', 'ebook', 'ts-handbook']); // hoodie is out of stock
  });

  it('minPrice + maxPrice brackets correctly', async () => {
    await seed();
    const res = await request(app).get('/api/products?minPrice=10&maxPrice=40');
    expect(res.status).toBe(200);
    for (const p of res.body.data) {
      expect(p.price).toBeGreaterThanOrEqual(10);
      expect(p.price).toBeLessThanOrEqual(40);
    }
  });

  it('attribute filter: ?attr.size=M returns only the shirt (M variant)', async () => {
    await seed();
    const res = await request(app).get('/api/products?attr.size=M');
    expect(res.status).toBe(200);
    const slugs = res.body.data.map((p: any) => p.slug);
    expect(slugs).toEqual(['cool-shirt']);
  });

  it('attribute multi-value: ?attr.size=M,L', async () => {
    await seed();
    const res = await request(app).get('/api/products?attr.size=M,L');
    expect(res.status).toBe(200);
    const slugs = res.body.data.map((p: any) => p.slug);
    expect(slugs).toEqual(['cool-shirt']);
  });

  it('attribute AND across keys: ?attr.size=M&attr.color=red', async () => {
    await seed();
    // The shirt has M/red. The hoodie has XL/red (so attr.color=red
    // matches, but attr.size=M doesn't). The expected result is the
    // shirt only because we require ONE variant to match BOTH keys.
    const res = await request(app).get('/api/products?attr.size=M&attr.color=red');
    expect(res.status).toBe(200);
    expect(res.body.data.map((p: any) => p.slug)).toEqual(['cool-shirt']);

    // M + blue: only the shirt matches both, but its blue variant
    // is size L. So no product has M+blue.
    const res2 = await request(app).get('/api/products?attr.size=M&attr.color=blue');
    expect(res2.body.data).toEqual([]);
  });

  it('minRating=4 returns products with avg rating >= 4', async () => {
    await seed();
    const res = await request(app).get('/api/products?minRating=4');
    expect(res.status).toBe(200);
    const slugs = res.body.data.map((p: any) => p.slug).sort();
    // book has 5, shirt has 4. hoodie has 3 (excluded).
    expect(slugs).toEqual(['cool-shirt', 'ts-handbook']);
  });

  it('search=shirt returns products matching the name', async () => {
    await seed();
    const res = await request(app).get('/api/products?search=shirt');
    expect(res.status).toBe(200);
    expect(res.body.data.map((p: any) => p.slug)).toEqual(['cool-shirt']);
  });

  it('sort=price_asc returns ascending prices', async () => {
    await seed();
    const res = await request(app).get('/api/products?sort=price_asc');
    expect(res.status).toBe(200);
    const prices = res.body.data.map((p: any) => p.price);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
  });

  it('sort=relevance ranks name matches first', async () => {
    await seed();
    // "shirt" appears in the name of cool-shirt. "shirt" does not
    // appear in the other names, so relevance puts cool-shirt first.
    const res = await request(app).get('/api/products?search=shirt&sort=relevance');
    expect(res.status).toBe(200);
    expect(res.body.data[0].slug).toBe('cool-shirt');
  });

  it('pagination: ?page=1&limit=2 returns 2 with totalPages=2', async () => {
    await seed();
    const res = await request(app).get('/api/products?page=1&limit=2');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.pagination.total).toBe(4);
    expect(res.body.pagination.totalPages).toBe(2);
  });

  it('unknown category returns an empty list, not 404', async () => {
    await seed();
    const res = await request(app).get('/api/products?category=does-not-exist');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('rejects bad sort with a 400-ish response (zod validation error)', async () => {
    await seed();
    const res = await request(app).get('/api/products?sort=not-a-sort');
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('rejects non-numeric page with a 400-ish response', async () => {
    await seed();
    const res = await request(app).get('/api/products?page=abc');
    // The schema's `z.union([string, number]).transform(Number)` - if
    // Number('abc') is NaN, Math.max(1, NaN) is NaN. Pin the exact
    // behaviour here so a regression is visible.
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

describe('GET /api/products/facets - smoke', () => {
  it('returns counts for categories, types, price, inStock, onSale, rating, attributes', async () => {
    await seed();
    const res = await request(app).get('/api/products/facets');
    expect(res.status).toBe(200);
    expect(res.body.data.categories.length).toBeGreaterThan(0);
    expect(res.body.data.types).toEqual(expect.arrayContaining([
      expect.objectContaining({ value: 'physical' }),
      expect.objectContaining({ value: 'digital' }),
    ]));
    expect(res.body.data.priceRange).toMatchObject({ min: expect.any(Number), max: expect.any(Number) });
    expect(res.body.data.inStock).toMatchObject({ count: expect.any(Number), total: expect.any(Number) });
    expect(res.body.data.onSale).toMatchObject({ count: expect.any(Number), total: expect.any(Number) });
    expect(res.body.data.rating.buckets).toHaveLength(5);
    expect(res.body.data.attributes.size).toBeDefined();
    expect(res.body.data.attributes.color).toBeDefined();
  });

  it('category counts drop to zero when the filter excludes everything', async () => {
    await seed();
    const res = await request(app).get('/api/products/facets?category=does-not-exist');
    expect(res.status).toBe(200);
    // categories are filtered to ones with count > 0, so the list
    // should be empty.
    expect(res.body.data.categories).toEqual([]);
  });

  it('marks selected categories', async () => {
    await seed();
    const res = await request(app).get('/api/products/facets?category=clothing');
    expect(res.status).toBe(200);
    const clothing = res.body.data.categories.find((c: any) => c.value.slug === 'clothing');
    expect(clothing.selected).toBe(true);
  });

  it('on a completely empty catalog returns 0s and []s', async () => {
    const res = await request(app).get('/api/products/facets');
    expect(res.status).toBe(200);
    expect(res.body.data.categories).toEqual([]);
    expect(res.body.data.priceRange).toEqual({ min: 0, max: 0 });
    expect(res.body.data.inStock).toEqual({ count: 0, total: 0 });
  });
});

describe('GET /api/products - combined query string', () => {
  it('one query string combining every filter dimension parses correctly', async () => {
    await seed();
    const res = await request(app).get(
      '/api/products?category=clothing&onSale=true&minPrice=15&maxPrice=100&attr.size=M&minRating=4&sort=price_asc&inStock=true'
    );
    expect(res.status).toBe(200);
    expect(res.body.data.map((p: any) => p.slug)).toEqual(['cool-shirt']);
    expect(res.body.applied).toMatchObject({
      category: ['clothing'],
      onSale: true,
      minPrice: 15,
      maxPrice: 100,
      minRating: 4,
      sort: 'price_asc',
      inStock: true,
    });
    expect(res.body.applied.attr).toEqual({ size: ['M'] });
  });
});
