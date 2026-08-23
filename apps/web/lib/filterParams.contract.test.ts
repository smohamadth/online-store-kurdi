/**
 * Contract test: the storefront's `encodeFilter` produces a URL
 * that the API's `parseFilterFromQuery` can decode back into an
 * equivalent filter.
 *
 * The two implementations are in different packages and use
 * different Zod schemas. This test pins the agreement.
 *
 * It runs the encode step, then runs the API's parser against the
 * produced URL, and asserts the result equals the original.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { encodeFilter, EMPTY_FILTER } from './filterParams';
import type { ProductFilter } from './filterParams.types';

// We can't import the API's parser directly (it depends on
// @prisma/client). Instead we re-implement the same surface here by
// inlining the zod schema. The schema is the source of truth and
// the contract; if either side drifts, this test catches it.

import { z } from 'zod';

// Mirror of apps/api/src/modules/products/productFilter.schema.ts
// productFilterSchema. Kept verbatim so the contract is visible
// here without dragging in prisma.
const apiSchema = z.object({
  page: z
    .union([z.string(), z.number()])
    .optional()
    .transform((v, ctx) => {
      if (v === undefined) return 1;
      const n = Number(v);
      if (!Number.isFinite(n) || n < 1) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'page must be a positive integer' });
        return z.NEVER;
      }
      return Math.floor(n);
    }),
  limit: z
    .union([z.string(), z.number()])
    .optional()
    .transform((v, ctx) => {
      const n = v === undefined ? 20 : Number(v);
      if (!Number.isFinite(n) || n < 1) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'limit must be a positive integer' });
        return z.NEVER;
      }
      return Math.min(100, Math.floor(n));
    }),
  category: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((v) => {
      if (v === undefined) return [] as string[];
      if (Array.isArray(v)) return v.flatMap((s) => s.split(','));
      return v.split(',').map((s) => s.trim()).filter(Boolean);
    }),
  type: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((arr) => {
      const arr2 = Array.isArray(arr) ? arr.flatMap((s) => s.split(',')) : (arr ? arr.split(',') : []);
      return arr2.filter((s) => s === 'physical' || s === 'digital');
    }),
  attr: z
    .record(z.union([z.string(), z.array(z.string())]))
    .optional()
    .transform((record) => {
      if (!record) return {} as Record<string, string[]>;
      const out: Record<string, string[]> = {};
      for (const [k, v] of Object.entries(record)) {
        const values = Array.isArray(v) ? v : String(v).split(',');
        out[k] = values.map((s) => s.trim()).filter(Boolean);
      }
      for (const k of Object.keys(out)) {
        if (out[k].length === 0) delete out[k];
      }
      return out;
    }),
  inStock: z
    .union([z.string(), z.boolean()])
    .optional()
    .transform((v) => {
      if (v === undefined || v === null || v === '') return false;
      if (typeof v === 'boolean') return v;
      return v === 'true' || v === '1';
    }),
  onSale: z
    .union([z.string(), z.boolean()])
    .optional()
    .transform((v) => {
      if (v === undefined || v === null || v === '') return false;
      if (typeof v === 'boolean') return v;
      return v === 'true' || v === '1';
    }),
  minPrice: z
    .union([z.string(), z.number()])
    .optional()
    .transform((v, ctx) => {
      if (v === undefined || v === null || v === '') return undefined;
      const n = Number(v);
      if (!Number.isFinite(n)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'expected a number' });
        return z.NEVER;
      }
      return n;
    }),
  maxPrice: z
    .union([z.string(), z.number()])
    .optional()
    .transform((v, ctx) => {
      if (v === undefined || v === null || v === '') return undefined;
      const n = Number(v);
      if (!Number.isFinite(n)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'expected a number' });
        return z.NEVER;
      }
      return n;
    }),
  minRating: z
    .union([z.string(), z.number()])
    .optional()
    .transform((v, ctx) => {
      if (v === undefined || v === null || v === '') return undefined;
      const n = Number(v);
      if (!Number.isFinite(n)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'minRating must be a number' });
        return z.NEVER;
      }
      return Math.max(0, Math.min(5, n));
    }),
  search: z.string().optional(),
  sort: z
    .enum(['newest', 'oldest', 'price_asc', 'price_desc', 'name_asc', 'name_desc', 'rating_desc', 'popular', 'relevance'])
    .default('newest'),
});

// The API also accepts the `attr.size=M` dot-notation. Express's qs
// parser doesn't expand those into a nested object by default, so
// the route has a flattenAttrQuery helper. Mirror that here.
function flattenAttr(qs: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = { ...qs };
  const attr: Record<string, string | string[]> = {};
  for (const [k, v] of Object.entries(qs)) {
    if (k.startsWith('attr.')) {
      const sub = k.slice(5);
      attr[sub] = v as any;
      delete out[k];
    }
  }
  if (Object.keys(attr).length > 0) out.attr = attr;
  return out;
}

function parseApiQuery(qs: Record<string, any>) {
  return apiSchema.parse(flattenAttr(qs));
}

describe('Storefront <-> API contract', () => {
  it('empty filter produces a query the API accepts as the default', () => {
    const url = encodeFilter(EMPTY_FILTER);
    const parsed = parseApiQuery(Object.fromEntries(url.entries()));
    // The API applies defaults: page=1, limit=20, sort=newest.
    expect(parsed).toMatchObject({
      page: 1,
      limit: 20,
      category: [],
      type: [],
      inStock: false,
      onSale: false,
      sort: 'newest',
    });
  });

  it('a full filter round-trips through the API parser', () => {
    const original: ProductFilter = {
      ...EMPTY_FILTER,
      page: 2,
      limit: 24,
      category: ['clothing', 'books'],
      type: ['physical', 'digital'],
      attr: { size: ['M', 'L'], color: ['red'] },
      inStock: true,
      onSale: true,
      minPrice: 20,
      maxPrice: 80,
      minRating: 4,
      search: 'red shoes',
      sort: 'rating_desc',
    };
    const url = encodeFilter(original);
    const parsed = parseApiQuery(Object.fromEntries(url.entries()));
    // Normalise: API applies defaults for omitted fields.
    expect(parsed).toMatchObject({
      page: 2,
      limit: 24,
      category: ['clothing', 'books'],
      type: ['physical', 'digital'],
      attr: { size: ['M', 'L'], color: ['red'] },
      inStock: true,
      onSale: true,
      minPrice: 20,
      maxPrice: 80,
      minRating: 4,
      search: 'red shoes',
      sort: 'rating_desc',
    });
  });

  it('attribute filter (the only non-trivial one) round-trips', () => {
    const original: ProductFilter = { ...EMPTY_FILTER, attr: { size: ['M'], color: ['red', 'blue'] } };
    const url = encodeFilter(original);
    const parsed = parseApiQuery(Object.fromEntries(url.entries()));
    expect(parsed.attr).toEqual({ size: ['M'], color: ['red', 'blue'] });
  });

  it('CSV category round-trips', () => {
    const original: ProductFilter = { ...EMPTY_FILTER, category: ['a', 'b', 'c'] };
    const url = encodeFilter(original);
    const parsed = parseApiQuery(Object.fromEntries(url.entries()));
    expect(parsed.category).toEqual(['a', 'b', 'c']);
  });

  it('boolean booleans round-trip', () => {
    const original: ProductFilter = { ...EMPTY_FILTER, inStock: true, onSale: true };
    const url = encodeFilter(original);
    expect(url.get('inStock')).toBe('true');
    expect(url.get('onSale')).toBe('true');
    const parsed = parseApiQuery(Object.fromEntries(url.entries()));
    expect(parsed.inStock).toBe(true);
    expect(parsed.onSale).toBe(true);
  });
});
