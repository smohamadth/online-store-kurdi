/**
 * Live HTTP exercise of the filter feature.
 *
 * Renders the actual supertest app, hits it with a sequence of
 * query strings that mirror what the storefront will send, and
 * prints the responses. The point is to eyeball the actual JSON
 * shape and confirm that what the storefront will see matches
 * what the tests assert.
 *
 * Run with: npx vitest run --config vitest.integration.config.ts
 *           tests/integration/productFilter.live.test.ts
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

describe('Live exercise', () => {
  it('showcases the contract', async () => {
    const clothing = await createCategory({ slug: 'clothing', name: 'Clothing' });
    const books = await createCategory({ slug: 'books', name: 'Books' });
    // One shared timestamp for every product: the pagination case
    // below asserts on INSERTION order, which requires all createdAt
    // values to be equal. The wall clock does not guarantee that
    // (four sequential creates can straddle a millisecond boundary),
    // which is exactly how this test started flaking.
    const T = new Date();
    const shirt = await createProduct({
      name: 'Cool Shirt', slug: 'cool-shirt', price: 20, compareAtPrice: 30,
      quantity: 10, categoryId: clothing.id, createdAt: T,
    });
    const hoodie = await createProduct({
      name: 'Plain Hoodie', slug: 'plain-hoodie', price: 50, quantity: 0,
      categoryId: clothing.id, createdAt: T,
    });
    const book = await createProduct({
      name: 'TS Handbook', slug: 'ts-handbook', price: 35, quantity: 5,
      categoryId: books.id, createdAt: T,
    });
    const ebook = await createProduct({
      name: 'eBook PDF', slug: 'ebook', price: 9.99, quantity: 100, type: 'digital',
      createdAt: T,
    });
    await createVariant(shirt.id, { name: 'M-red', sku: 'shirt-m', attributes: { size: 'M', color: 'red' } });
    await createVariant(shirt.id, { name: 'L-blue', sku: 'shirt-l', attributes: { size: 'L', color: 'blue' } });
    await createVariant(hoodie.id, { name: 'XL-red', sku: 'hoodie-xl', attributes: { size: 'XL', color: 'red' } });
    const user = await createUser({});
    await createReview(user.id, book.id, { rating: 5, isApproved: true });
    await createReview(user.id, shirt.id, { rating: 4, isApproved: true });
    await createReview(user.id, hoodie.id, { rating: 3, isApproved: true });

    const cases: { label: string; url: string; expectSlugs?: string[]; expectAppliedContains?: Record<string, any> }[] = [
      {
        label: 'no filter (default page)',
        url: '/api/products',
        // Insertion order is the order the factory created them.
        expectSlugs: ['cool-shirt', 'ebook', 'plain-hoodie', 'ts-handbook'],
      },
      {
        label: 'multi-category + onSale + sort',
        url: '/api/products?category=clothing&onSale=true&sort=price_asc',
        expectSlugs: ['cool-shirt'],
        expectAppliedContains: { category: ['clothing'], onSale: true, sort: 'price_asc' },
      },
      {
        label: 'attribute single value',
        url: '/api/products?attr.size=M',
        expectSlugs: ['cool-shirt'],
      },
      {
        label: 'attribute multi-value',
        url: '/api/products?attr.size=M,L',
        expectSlugs: ['cool-shirt'],
      },
      {
        label: 'attribute AND across keys (M+red only)',
        url: '/api/products?attr.size=M&attr.color=red',
        expectSlugs: ['cool-shirt'],
      },
      {
        label: 'attribute AND mismatch (M+blue = nothing)',
        url: '/api/products?attr.size=M&attr.color=blue',
        expectSlugs: [],
      },
      {
        label: 'price range $20-$40',
        url: '/api/products?minPrice=20&maxPrice=40',
        expectSlugs: ['cool-shirt', 'ts-handbook'],
      },
      {
        label: 'inStock=true excludes hoodie',
        url: '/api/products?inStock=true',
        expectSlugs: ['cool-shirt', 'ebook', 'ts-handbook'],
      },
      {
        label: 'minRating=4 excludes hoodie (3/5)',
        url: '/api/products?minRating=4',
        expectSlugs: ['cool-shirt', 'ts-handbook'],
      },
      {
        label: 'search=shirt',
        url: '/api/products?search=shirt',
        expectSlugs: ['cool-shirt'],
      },
      {
        label: 'combined: clothing + onSale + M + 4+ stars + sort=price_asc',
        url: '/api/products?category=clothing&onSale=true&attr.size=M&minRating=4&sort=price_asc',
        expectSlugs: ['cool-shirt'],
      },
      {
        label: 'pagination page=2 limit=2',
        url: '/api/products?page=2&limit=2',
        // Insertion order: shirt, hoodie, book, ebook. The mock's
        // stable sort preserves that because all createdAt timestamps
        // are equal. Page 1 = [shirt, hoodie], page 2 = [book, ebook].
        expectSlugs: ['ebook', 'ts-handbook'],
      },
      {
        label: 'unknown category returns empty list',
        url: '/api/products?category=does-not-exist',
        expectSlugs: [],
      },
      {
        label: 'rejects bad sort',
        url: '/api/products?sort=lol',
        expectSlugs: undefined, // we expect 400
      },
      {
        label: 'rejects non-numeric page',
        url: '/api/products?page=abc',
        expectSlugs: undefined,
      },
    ];

    for (const c of cases) {
      const res = await request(app).get(c.url);
      // Pin a header that identifies the test case in any failure log.
      const header = `\n--- ${c.label} (${c.url}) -> ${res.status} ---`;
      if (res.status >= 400) {
        // Pin the error case explicitly.
        if (c.expectSlugs !== undefined) {
          expect.fail(`${header} expected 2xx but got ${res.status}: ${JSON.stringify(res.body)}`);
        } else {
          // We expected 4xx. Assert it explicitly.
          expect(res.status, header).toBeGreaterThanOrEqual(400);
        }
      } else {
        if (c.expectSlugs === undefined) {
          expect.fail(`${header} expected >=400 but got 2xx: ${JSON.stringify(res.body)}`);
        }
        const slugs = res.body.data.map((p: any) => p.slug).sort();
        expect(slugs, header).toEqual(c.expectSlugs.sort());
        if (c.expectAppliedContains) {
          for (const [k, v] of Object.entries(c.expectAppliedContains)) {
            expect(res.body.applied[k], `${header} applied.${k}`).toEqual(v);
          }
        }
      }
    }

    // Now facets
    const facetsRes = await request(app).get('/api/products/facets');
    expect(facetsRes.status).toBe(200);
    expect(facetsRes.body.data.categories.length).toBeGreaterThan(0);
    expect(facetsRes.body.data.attributes.size).toBeDefined();
    expect(facetsRes.body.data.attributes.color).toBeDefined();
  });
});
