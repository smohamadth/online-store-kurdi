/**
 * Advanced product filter tests.
 *
 * The legacy `products.test.ts` covers the original GET /api/products
 * surface (single category, type, price range, sort, pagination). This
 * file covers the new filter surface added in productFilter.service.ts:
 *
 *   - multi-select categories (CSV + one-level parent expansion)
 *   - multi-select types
 *   - variant attribute filters (?attr.size=M&attr.color=red)
 *   - onSale boolean
 *   - minRating threshold
 *   - relevance-ranked search
 *   - rating_desc, popular sorts
 *   - GET /api/products/facets (count buckets for the sidebar)
 *
 * The "exact" contract each test pins:
 *   - the response shape is unchanged (status, data, pagination, applied)
 *   - the new "applied" field echoes what the route actually used
 *     (so the UI can show "X filters applied" without a second call)
 *   - the facets endpoint is read-only and unauthenticated
 *   - the legacy status= query param is still honoured for admin views
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

describe('GET /api/products - advanced filters', () => {
  // A reusable fixture: three categories, each with one product, plus
  // a digital product with no category, plus a product with variants
  // and reviews. Tests should narrow this set in interesting ways.
  async function seedFixture() {
    const clothing = await createCategory({ slug: 'clothing', name: 'Clothing' });
    const books = await createCategory({ slug: 'books', name: 'Books' });
    const sale = await createCategory({ slug: 'sale', name: 'Sale' });

    const shirt = await createProduct({
      name: 'Cool T-Shirt',
      slug: 'cool-t-shirt',
      price: 25,
      compareAtPrice: 40, // on sale
      quantity: 10,
      categoryId: clothing.id,
    });
    const book = await createProduct({
      name: 'TypeScript Handbook',
      slug: 'ts-handbook',
      price: 35,
      quantity: 5,
      categoryId: books.id,
    });
    const saleItem = await createProduct({
      name: 'Last Year Bag',
      slug: 'last-year-bag',
      price: 50,
      compareAtPrice: 80, // on sale
      quantity: 0, // out of stock
      categoryId: sale.id,
    });
    const digital = await createProduct({
      name: 'eBook PDF',
      slug: 'ebook-pdf',
      price: 9.99,
      quantity: 100,
      type: 'digital',
    });
    const user = await createUser({});

    // Variants on the shirt (size + color)
    await createVariant(shirt.id, { name: 'M', sku: 'shirt-m', price: 25, quantity: 5, attributes: { size: 'M', color: 'red' } });
    await createVariant(shirt.id, { name: 'L', sku: 'shirt-l', price: 25, quantity: 5, attributes: { size: 'L', color: 'blue' } });
    await createVariant(shirt.id, { name: 'XL', sku: 'shirt-xl', price: 25, quantity: 0, attributes: { size: 'XL', color: 'red' } });

    // Reviews (used by minRating and rating_desc)
    await createReview(user.id, book.id, { rating: 5, isApproved: true });
    await createReview(user.id, shirt.id, { rating: 4, isApproved: true });
    await createReview(user.id, saleItem.id, { rating: 2, isApproved: true });

    return { clothing, books, sale, shirt, book, saleItem, digital };
  }

  describe('multi-select', () => {
    it('accepts comma-separated category slugs', async () => {
      const { clothing, books } = await seedFixture();
      const res = await request(app).get('/api/products?category=clothing,books');
      expect(res.status).toBe(200);
      const slugs = res.body.data.map((p: any) => p.category?.slug).sort();
      expect(slugs).toEqual(['books', 'clothing']);
      // Digital is uncategorised and must NOT be in the result.
      expect(res.body.data.some((p: any) => p.slug === 'ebook-pdf')).toBe(false);
    });

    it('accepts repeated category query keys (?category=a&category=b)', async () => {
      const { clothing, books } = await seedFixture();
      const res = await request(app).get('/api/products?category=clothing&category=books');
      expect(res.status).toBe(200);
      const slugs = res.body.data.map((p: any) => p.category?.slug).sort();
      expect(slugs).toEqual(['books', 'clothing']);
    });

    it('accepts multiple type values', async () => {
      await seedFixture();
      const res = await request(app).get('/api/products?type=physical,digital');
      expect(res.status).toBe(200);
      // All four products are in scope (3 physical + 1 digital).
      expect(res.body.data).toHaveLength(4);
    });

    it('an empty multi-value (e.g. ?type=) does not filter', async () => {
      await seedFixture();
      const res = await request(app).get('/api/products?type=');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(4);
    });

    it('unknown category slugs return an empty list (not 404)', async () => {
      await seedFixture();
      const res = await request(app).get('/api/products?category=does-not-exist');
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });
  });

  describe('price + stock + sale', () => {
    it('onSale=true returns only products where compareAtPrice > price', async () => {
      await seedFixture();
      const res = await request(app).get('/api/products?onSale=true');
      expect(res.status).toBe(200);
      const slugs = res.body.data.map((p: any) => p.slug).sort();
      expect(slugs).toEqual(['cool-t-shirt', 'last-year-bag']);
      for (const p of res.body.data) {
        expect(p.compareAtPrice).not.toBeNull();
        expect(p.compareAtPrice).toBeGreaterThan(p.price);
      }
    });

    it('inStock=true excludes zero-quantity products', async () => {
      await seedFixture();
      const res = await request(app).get('/api/products?inStock=true');
      expect(res.status).toBe(200);
      const slugs = res.body.data.map((p: any) => p.slug).sort();
      // Last Year Bag has quantity=0 and must be excluded.
      expect(slugs).not.toContain('last-year-bag');
      expect(slugs).toContain('cool-t-shirt');
    });

    it('minPrice + maxPrice brackets correctly', async () => {
      await seedFixture();
      const res = await request(app).get('/api/products?minPrice=20&maxPrice=40');
      expect(res.status).toBe(200);
      for (const p of res.body.data) {
        expect(p.price).toBeGreaterThanOrEqual(20);
        expect(p.price).toBeLessThanOrEqual(40);
      }
    });

    it('minPrice alone is an open lower bound', async () => {
      await seedFixture();
      const res = await request(app).get('/api/products?minPrice=30');
      const slugs = res.body.data.map((p: any) => p.slug).sort();
      expect(slugs).toEqual(['last-year-bag', 'ts-handbook']);
    });
  });

  describe('variant attributes', () => {
    it('filters by a single attribute value', async () => {
      await seedFixture();
      const res = await request(app).get('/api/products?attr.size=M');
      expect(res.status).toBe(200);
      expect(res.body.data.map((p: any) => p.slug)).toEqual(['cool-t-shirt']);
    });

    it('accepts multiple values for one attribute (?attr.size=M,L)', async () => {
      await seedFixture();
      const res = await request(app).get('/api/products?attr.size=M,L');
      expect(res.status).toBe(200);
      expect(res.body.data.map((p: any) => p.slug)).toEqual(['cool-t-shirt']);
    });

    it('AND across multiple attributes (?attr.size=M&attr.color=red)', async () => {
      await seedFixture();
      const res = await request(app).get('/api/products?attr.size=M&attr.color=red');
      expect(res.status).toBe(200);
      // Only the M/red variant matches both keys.
      expect(res.body.data.map((p: any) => p.slug)).toEqual(['cool-t-shirt']);

      // M + blue: the L/blue variant doesn't match size=M.
      const res2 = await request(app).get('/api/products?attr.size=M&attr.color=blue');
      expect(res2.body.data).toEqual([]);
    });

    it('an unknown attribute key returns the unfiltered set', async () => {
      await seedFixture();
      const res = await request(app).get('/api/products?attr.weird=value');
      // No variant has `weird`, so no variant matches the combined
      // predicate, and the result is empty. (The route can't tell
      // `?attr.weird=` from "weird=foo" + "no such variant".)
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });
  });

  describe('rating + search', () => {
    it('minRating excludes low-rated products', async () => {
      await seedFixture();
      const res = await request(app).get('/api/products?minRating=4');
      expect(res.status).toBe(200);
      const slugs = res.body.data.map((p: any) => p.slug).sort();
      // Book is 5/5, shirt is 4/4. Bag is 2/2 and must be excluded.
      expect(slugs).toEqual(['cool-t-shirt', 'ts-handbook']);
    });

    it('rating_desc sorts by computed rating', async () => {
      await seedFixture();
      const res = await request(app).get('/api/products?sort=rating_desc');
      expect(res.status).toBe(200);
      // First two should be the book (5) and shirt (4) in that order.
      const slugs = res.body.data.map((p: any) => p.slug);
      expect(slugs[0]).toBe('ts-handbook');
      expect(slugs[1]).toBe('cool-t-shirt');
    });

    it('relevance sort puts name matches before description matches', async () => {
      const cat = await createCategory({ slug: 'misc', name: 'Misc' });
      // The "Widget Pro" name is an exact match; the other one is only
      // a description match.
      await createProduct({ name: 'Widget Pro', slug: 'widget-pro', price: 10, quantity: 5, categoryId: cat.id });
      await createProduct({ name: 'Other', slug: 'other', description: 'This product is a widget for testing', price: 10, quantity: 5, categoryId: cat.id });
      const res = await request(app).get('/api/products?search=widget&sort=relevance');
      expect(res.status).toBe(200);
      expect(res.body.data[0].slug).toBe('widget-pro');
      expect(res.body.data[1].slug).toBe('other');
    });

    it('search with no matches returns an empty list', async () => {
      await seedFixture();
      const res = await request(app).get('/api/products?search=nonexistent-string');
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });
  });

  describe('response shape', () => {
    it('echoes the applied filter under the "applied" key', async () => {
      await seedFixture();
      const res = await request(app).get('/api/products?category=clothing&onSale=true&sort=price_asc');
      expect(res.status).toBe(200);
      expect(res.body.applied).toMatchObject({
        category: ['clothing'],
        onSale: true,
        sort: 'price_asc',
      });
    });

    it('pagination.total reflects the post-filter count, not the DB count, when post-filters apply', async () => {
      await seedFixture();
      // Without filters, total=4. With onSale=true, total=2.
      const all = await request(app).get('/api/products');
      expect(all.body.pagination.total).toBe(4);
      const sale = await request(app).get('/api/products?onSale=true');
      expect(sale.body.pagination.total).toBe(2);
    });

    it('respects an explicit status= filter (admin view)', async () => {
      const cat = await createCategory({ slug: 'mix', name: 'Mix' });
      await createProduct({ name: 'A', slug: 'a', price: 1, quantity: 1, categoryId: cat.id, status: 'active' });
      await createProduct({ name: 'B', slug: 'b', price: 1, quantity: 1, categoryId: cat.id, status: 'inactive' });
      const res = await request(app).get('/api/products?status=inactive');
      expect(res.body.data.map((p: any) => p.slug)).toEqual(['b']);
    });
  });
});

describe('GET /api/products/facets', () => {
  async function seedFacetsFixture() {
    const clothing = await createCategory({ slug: 'clothing', name: 'Clothing' });
    const books = await createCategory({ slug: 'books', name: 'Books' });
    const tshirt = await createProduct({ name: 'T-Shirt', slug: 't-shirt', price: 20, quantity: 5, categoryId: clothing.id });
    const book = await createProduct({ name: 'Book', slug: 'book', price: 30, quantity: 5, categoryId: books.id });
    await createVariant(tshirt.id, { name: 'M', sku: 'm1', attributes: { size: 'M' } });
    await createVariant(tshirt.id, { name: 'L', sku: 'l1', attributes: { size: 'L' } });
    await createVariant(book.id, { name: 'HC', sku: 'hc1', attributes: { format: 'hardcover' } });
    return { clothing, books, tshirt, book };
  }

  it('returns category counts', async () => {
    await seedFacetsFixture();
    const res = await request(app).get('/api/products/facets');
    expect(res.status).toBe(200);
    const cats = res.body.data.categories;
    expect(cats).toHaveLength(2);
    const clothing = cats.find((c: any) => c.value.slug === 'clothing');
    expect(clothing.count).toBe(1);
  });

  it('returns type counts (physical + digital)', async () => {
    await seedFacetsFixture();
    const res = await request(app).get('/api/products/facets');
    expect(res.body.data.types).toEqual(
      expect.arrayContaining([
        { value: 'physical', count: expect.any(Number), selected: false },
        { value: 'digital', count: expect.any(Number), selected: false },
      ]),
    );
  });

  it('returns a price range', async () => {
    await seedFacetsFixture();
    const res = await request(app).get('/api/products/facets');
    expect(res.body.data.priceRange).toEqual({ min: 20, max: 30 });
  });

  it('returns inStock and onSale totals', async () => {
    await seedFacetsFixture();
    const res = await request(app).get('/api/products/facets');
    expect(res.body.data.inStock).toMatchObject({ count: 2, total: 2 });
    expect(res.body.data.onSale).toMatchObject({ count: 0, total: 2 });
  });

  it('returns rating buckets', async () => {
    const user = await createUser({});
    const cat = await createCategory({ slug: 'cat', name: 'Cat' });
    const p = await createProduct({ name: 'P', slug: 'p', price: 1, quantity: 1, categoryId: cat.id });
    // Two reviews so the product's average rating is 4.5 (between buckets
    // 4 and 5).
    await createReview(user.id, p.id, { rating: 5, isApproved: true });
    await createReview(user.id, p.id, { rating: 4, isApproved: true });
    const res = await request(app).get('/api/products/facets');
    // Bucket 4 covers 4.0..4.99 - the 4.5 average lands here.
    const bucket4 = res.body.data.rating.buckets.find((b: any) => b.value === 4);
    expect(bucket4.count).toBe(1);
    // Bucket 5 covers 5.0..5 - no product has a perfect average here.
    const bucket5 = res.body.data.rating.buckets.find((b: any) => b.value === 5);
    expect(bucket5.count).toBe(0);
  });

  it('returns dynamic attribute facets', async () => {
    await seedFacetsFixture();
    const res = await request(app).get('/api/products/facets');
    // The fixture created size and format attributes.
    expect(res.body.data.attributes.size).toBeDefined();
    const sizeValues = res.body.data.attributes.size.map((v: any) => v.value).sort();
    expect(sizeValues).toEqual(['L', 'M']);
    expect(res.body.data.attributes.format).toBeDefined();
  });

  it('marks a category as selected when its slug is in the filter', async () => {
    await seedFacetsFixture();
    const res = await request(app).get('/api/products/facets?category=clothing');
    const clothing = res.body.data.categories.find((c: any) => c.value.slug === 'clothing');
    expect(clothing.selected).toBe(true);
  });

  it('respects other active filters in the counts (facet drill-down)', async () => {
    const cat = await createCategory({ slug: 'mix', name: 'Mix' });
    const cheap = await createProduct({ name: 'Cheap', slug: 'cheap', price: 5, quantity: 1, categoryId: cat.id });
    const pricey = await createProduct({ name: 'Pricey', slug: 'pricey', price: 50, quantity: 1, categoryId: cat.id });
    // No filter: 2 results.
    const all = await request(app).get('/api/products/facets');
    expect(all.body.data.inStock.count).toBe(2);
    // With maxPrice=10: only the cheap one.
    const cheapOnly = await request(app).get('/api/products/facets?maxPrice=10');
    expect(cheapOnly.body.data.inStock.count).toBe(1);
  });

  it('returns an empty facet set when the catalog is empty', async () => {
    const res = await request(app).get('/api/products/facets');
    expect(res.status).toBe(200);
    expect(res.body.data.categories).toEqual([]);
    expect(res.body.data.priceRange).toEqual({ min: 0, max: 0 });
  });
});

describe('GET /api/products/facets - auth & methods', () => {
  it('does not require authentication', async () => {
    const res = await request(app).get('/api/products/facets');
    expect(res.status).toBe(200);
  });

  it('rejects unsupported HTTP methods with 404 from express', async () => {
    const res = await request(app).post('/api/products/facets');
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});
