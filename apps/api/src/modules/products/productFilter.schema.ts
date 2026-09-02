/**
 * Extended product filter schema.
 *
 * The original `productQuerySchema` in product.routes.ts accepts single
 * values for everything (one category, one minPrice, one maxPrice). That
 * works for an admin "filter this row" UI but the storefront needs
 * multi-select + ranges. This file holds the storefront-facing schema
 * and the helper that turns a parsed query into a Prisma `where`.
 *
 * Why a separate file:
 *   - The existing schema is referenced by both the listing route and the
 *     unit/integration tests. Adding multi-value fields there would
 *     change the contract for every caller.
 *   - This file can grow (e.g. with a `match` operator) without churning
 *     the routes that don't need it.
 */
import { z } from 'zod';

// `?category=foo,bar` -> ['foo', 'bar']. Repeatable. We accept both a
// CSV in a single key and repeated keys, which is the convention for
// most REST query-string parsers.
const csv = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((v) => {
    if (v === undefined) return [] as string[];
    if (Array.isArray(v)) return v.flatMap((s) => s.split(','));
    return v.split(',').map((s) => s.trim()).filter(Boolean);
  });

// A positive number or empty. The store UI sends an empty string when
// the user clears a price input. Reject garbage (e.g. ?minPrice=abc)
// with a Zod issue so the route returns a 400, not a 200 with the
// filter silently coerced.
const optionalNumber = z
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
  });

const optionalBool = z
  .union([z.string(), z.boolean()])
  .optional()
  .transform((v) => {
    if (v === undefined || v === null || v === '') return false;
    if (typeof v === 'boolean') return v;
    return v === 'true' || v === '1';
  });

const sortEnum = z.enum([
  'newest',
  'oldest',
  'price_asc',
  'price_desc',
  'name_asc',
  'name_desc',
  'rating_desc',
  'popular',
  'relevance',
]);

export const productFilterSchema = z.object({
  // Pagination
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

  // Admin / testing: override the default `active` filter. The route
  // narrows this further for non-admin callers; see product.routes.ts.
  status: z
    .enum(['draft', 'active', 'inactive', 'archived'])
    .optional()
    .transform((v) => v ?? 'active'),

  // Multi-select facets
  category: csv,
  type: csv.transform((arr) =>
    arr.filter((s) => s === 'physical' || s === 'digital'),
  ),
  // Variant attributes, e.g. ?attr.size=M,L&attr.color=red
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
      // Drop empty value lists so the caller can pass ?attr.size= and
      // have it ignored (an empty filter shouldn't narrow results).
      for (const k of Object.keys(out)) {
        if (out[k].length === 0) delete out[k];
      }
      return out;
    }),

  // Price range
  minPrice: optionalNumber,
  maxPrice: optionalNumber,

  // Boolean facets
  inStock: optionalBool,
  onSale: optionalBool,

  // Quality
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

  // Free-text
  search: z.string().optional(),

  // Typed option filter (?optionValueId=...) - returns products
  // that have at least one variant with this OptionValue selected.
  // Plumbed through the storefront URL: any "swatch chip" link
  // on the PDP can deep-link to /products?optionValueId=<id> and
  // land on a filtered list. Multi-value is supported as CSV.
  optionValueId: csv,

  // Sort + ordering
  sort: sortEnum.default('newest'),
});

export type ProductFilter = z.infer<typeof productFilterSchema>;
export type ProductSort = z.infer<typeof sortEnum>;

// Re-export the option filter helper for callers that want to
// introspect a filter (the storefront's decodeFilter, etc.).
export function getOptionValueIds(filter: ProductFilter): string[] {
  return filter.optionValueId || [];
}

/**
 * Convert a parsed filter into a Prisma `where` clause.
 *
 * Design notes:
 *   - `category` slugs are resolved to ids by the caller because the
 *     Prisma `where.category` is an id-relation; this function only
 *     composes the structural shape. The caller (the route) does the
 *     slug-to-id lookup once and passes ids into `categoryIds`.
 *   - Attribute filters are applied via an `OR` over variants: a
 *     product is in scope if ANY of its variants matches the requested
 *     size AND ANY matches the requested color. Multi-attribute
 *     filters within the same key are ANDed; across keys they're
 *     composed as an outer AND.
 *   - `onSale` is computed as `compareAtPrice > price` at the DB level.
 *   - `minRating` is approximated: a product qualifies if it has at
 *     least one review. The route then filters in memory because
 *     Prisma can't aggregate on a related collection without raw SQL.
 *     This is a known limitation; we keep it explicit so the test
 *     documents the contract.
 */
export interface BuildWhereArgs {
  status?: string;
  categoryIds?: string[];
  type?: string[];
  attr?: Record<string, string[]>;
  minPrice?: number;
  maxPrice?: number;
  inStock?: boolean;
  onSale?: boolean;
  search?: string;
  optionValueIds?: string[];
  // When true, ignore the `status` filter (used for the facets endpoint,
  // which counts every state so the sidebar shows the user what's
  // possible).
  includeAllStatuses?: boolean;
}

export function buildProductWhere(args: BuildWhereArgs) {
  const where: any = {};
  if (!args.includeAllStatuses) {
    where.status = args.status ?? 'active';
  }

  if (args.categoryIds && args.categoryIds.length > 0) {
    where.categoryId = { in: args.categoryIds };
  }

  if (args.type && args.type.length > 0) {
    where.type = { in: args.type };
  }

  // Price range
  if (args.minPrice !== undefined || args.maxPrice !== undefined) {
    where.price = {};
    if (args.minPrice !== undefined) where.price.gte = args.minPrice;
    if (args.maxPrice !== undefined) where.price.lte = args.maxPrice;
  }

  // In stock: at least one unit available, OR inventory is untracked.
  if (args.inStock) {
    where.OR = [
      { quantity: { gt: 0 } },
      { trackInventory: false },
    ];
  }

  // On sale: compareAtPrice strictly greater than price.
  if (args.onSale) {
    where.compareAtPrice = { not: null };
    // We need a numeric comparison. Prisma can do `gt` on a float.
    // The trick: compareAtPrice > price, expressed as
    //   { price: { lt: { _ref: 'compareAtPrice' } } } -- which Prisma
    //   doesn't actually support. The accepted pattern is to fetch
    //   candidates and filter in code, OR to denormalise the discount
    //   into a boolean column. We use the in-memory approach: the route
    //   returns rows that match the other filters, then we drop the
    //   ones where compareAtPrice <= price.
    // For the mock prisma, this works the same way: we set a
    // `compareAtPrice: { not: null }` predicate and the route
    // post-filters.
  }

  // Variant attributes. We do NOT add a DB-level `variants: { some: ... }`
  // filter because the attributes column is a JSON string and the
  // exact-value match has to happen in JS (post-filter). The DB filter
  // could narrow the candidate set with a `contains` substring, but
  // the savings are small and the JS filter is what guarantees
  // correctness. Leaving this as a no-op keeps the contract simple
  // and avoids depending on Prisma's relation-filter behaviour.
  // The post-filter in `listProducts` does the real work.
  void args;

  // Free-text: contains on name, description, sku, and
  // tags (from metaKeywords JSON). No `mode: 'insensitive'` - the
  // SQLite provider rejects it (case-sensitive matching instead).
  if (args.search && args.search.trim()) {
    const q = args.search.trim();
    where.OR = [
      { name: { contains: q } },
      { description: { contains: q } },
      { sku: { contains: q } },
      { metaKeywords: { contains: q } },
    ];
  }

  // Typed option filter: at least one variant must have a
  // VariantOptionValue pointing at one of the requested option
  // values. We express this as a relation filter on variants. The
  // mock prisma supports the same nested-where shape (it resolves
  // via the VariantOptionValue model), so this works in tests too.
  if (args.optionValueIds && args.optionValueIds.length > 0) {
    where.variants = {
      some: {
        isActive: true,
        optionValues: { some: { optionValueId: { in: args.optionValueIds } } },
      },
    };
  }

  return where;
}

/**
 * Convert a filter's `sort` into a Prisma `orderBy` clause.
 *
 * `relevance` and `popular` aren't single-field orderings so they need
 * special handling. The route uses `popular` as-is (it really is just
 * `reviews._count desc`) and the in-memory ranker for `relevance`.
 */
export function buildOrderBy(sort: ProductSort) {
  switch (sort) {
    case 'price_asc':
      return { price: 'asc' as const };
    case 'price_desc':
      return { price: 'desc' as const };
    case 'name_asc':
      return { name: 'asc' as const };
    case 'name_desc':
      return { name: 'desc' as const };
    case 'rating_desc':
      // Prisma can't aggregate to a sort key. We return a stable
      // secondary order and post-sort by computed rating in the route.
      return [{ createdAt: 'desc' as const }];
    case 'popular':
      return { reviews: { _count: 'desc' as const } };
    case 'oldest':
      return { createdAt: 'asc' as const };
    case 'relevance':
    case 'newest':
    default:
      return { createdAt: 'desc' as const };
  }
}

/**
 * Compute a relevance score for a product against a search query.
 *
 * The score is a small integer:
 *   - +3 if `name` contains the query
 *   - +2 if `description` contains the query
 *   - +1 if `sku` contains the query
 *   - +1 if `metaKeywords` contains the query
 *   - +1 if the product's category name contains the query
 *   - +2 bonus for a prefix match on name (helps "iph" -> iPhone win)
 *
 * Higher is more relevant. The route sorts `relevance` results by this
 * score in descending order.
 */
export function relevanceScore(product: any, query: string): number {
  if (!query) return 0;
  const q = query.toLowerCase();
  let score = 0;
  if (product.name && product.name.toLowerCase().includes(q)) score += 3;
  if (product.name && product.name.toLowerCase().startsWith(q)) score += 2;
  if (product.description && product.description.toLowerCase().includes(q)) score += 2;
  if (product.sku && product.sku.toLowerCase().includes(q)) score += 1;
  if (product.metaKeywords && String(product.metaKeywords).toLowerCase().includes(q)) score += 1;
  if (product.category?.name && product.category.name.toLowerCase().includes(q)) score += 1;
  return score;
}

/**
 * Parse a product's `attributes` JSON column into a typed map.
 *
 * The DB stores a JSON string `{"size":"M","color":"red"}`. We try
 * to parse it and fall back to an empty object on any failure. Used
 * by both the route (to evaluate the `attr.<key>` filter exactly)
 * and the facets endpoint (to enumerate distinct values).
 */
export function parseAttributes(json: string | null | undefined): Record<string, string> {
  if (!json) return {};
  try {
    const parsed = JSON.parse(json);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(parsed)) {
        if (v === null || v === undefined) continue;
        out[k] = String(v);
      }
      return out;
    }
  } catch {
    /* fallthrough */
  }
  return {};
}
