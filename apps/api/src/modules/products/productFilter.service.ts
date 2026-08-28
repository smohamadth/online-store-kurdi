/**
 * Server-side product filter implementation.
 *
 * Wraps the prisma calls behind pure-ish helpers so:
 *   - The route is a thin shell that parses input and serialises output.
 *   - The service is testable without spinning up express.
 *   - The mock prisma is hit with the same query shape as the real one.
 *
 * Public surface:
 *   - `listProducts(filter)` -> { data, pagination, total, facets }
 *   - `getFacets(filter)`    -> facet counts for the sidebar
 *   - `parseFilterFromQuery(qs)` -> helper used by both the list and
 *     facets endpoints so they accept the same query string
 */
import { prisma } from '../../config/database';
import {
  buildProductWhere,
  buildOrderBy,
  parseAttributes,
  productFilterSchema,
  relevanceScore,
  type ProductFilter,
} from './productFilter.schema';
import type { Prisma } from '@prisma/client';

export interface ListResult {
  data: any[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  total: number;
  applied: ProductFilter;
}

/**
 * Resolve category slugs to ids. Returns a list of ids; the empty list
 * means "no filter" (don't apply a category constraint at all).
 */
export async function resolveCategorySlugs(
  slugs: string[],
  includeChildren: boolean,
): Promise<string[]> {
  if (!slugs || slugs.length === 0) return [];
  const categories = await prisma.category.findMany({
    where: { slug: { in: slugs } },
    select: { id: true, slug: true, parentId: true },
  });
  if (categories.length === 0) return [];
  if (!includeChildren) {
    return categories.map((c) => c.id);
  }
  // Walk one level: if the user asked for "clothing", also include any
  // direct child like "mens-clothing". This is a one-level expansion;
  // a real recursive CTE would do more, but the schema only has a
  // single parentId and most stores keep 1-2 levels of depth.
  const ids = categories.map((c) => c.id);
  const children = await prisma.category.findMany({
    where: { parentId: { in: ids } },
    select: { id: true },
  });
  return [...ids, ...children.map((c) => c.id)];
}

export async function listProducts(
  filter: ProductFilter,
): Promise<ListResult> {
  const skip = (filter.page - 1) * filter.limit;
  const categoryIds = await resolveCategorySlugs(filter.category || [], true);

  // If the user asked for specific category slugs but none of them
  // resolved to a real category, the result is unambiguously empty.
  // (Otherwise `categoryIds` is `[]` and the where clause falls back
  // to "no category filter", which would return unrelated products
  // and silently change the result.)
  if ((filter.category || []).length > 0 && categoryIds.length === 0) {
    return {
      data: [],
      pagination: { page: filter.page, limit: filter.limit, total: 0, totalPages: 1 },
      total: 0,
      applied: filter,
    };
  }

  const where = buildProductWhere({
    status: filter.status,
    categoryIds: categoryIds.length ? categoryIds : undefined,
    type: filter.type,
    attr: filter.attr,
    minPrice: filter.minPrice,
    maxPrice: filter.maxPrice,
    inStock: filter.inStock,
    onSale: filter.onSale,
    search: filter.search,
    optionValueIds: filter.optionValueId?.length ? filter.optionValueId : undefined,
  });

  const orderBy = buildOrderBy(filter.sort);

  // Pull all candidates that match the structural filters. The exact
  // match for attribute values, onSale, and relevance ranking happen
  // in post-processing.
  const [candidates, total] = await Promise.all([
    prisma.product.findMany({
      where,
      include: {
        images: true,
        category: true,
        variants: { where: { isActive: true } },
        reviews: { select: { rating: true } },
      },
      orderBy,
      skip: filter.sort === 'relevance' ? 0 : skip,
      take: filter.sort === 'relevance' ? 1000 : filter.limit,
    }),
    prisma.product.count({ where }),
  ]);

  // Compute ratings once, used by both the on-sale filter (no) and the
  // rating filter.
  const enriched = candidates.map((p) => {
    const ratings = (p.reviews || []).map((r: any) => r.rating);
    const averageRating = ratings.length
      ? ratings.reduce((a: number, b: number) => a + b, 0) / ratings.length
      : 0;
    return { ...p, _averageRating: averageRating };
  });

  // Post-filter: onSale (compareAtPrice > price), attribute exact match,
  // and minRating.
  let filtered = enriched;
  if (filter.onSale) {
    filtered = filtered.filter(
      (p) => p.compareAtPrice !== null && Number(p.compareAtPrice) > Number(p.price),
    );
  }
  if (filter.attr && Object.keys(filter.attr).length > 0) {
    filtered = filtered.filter((p) => {
      // A single variant must satisfy ALL requested (key, value) pairs.
      // E.g. {size: 'M', color: 'red'} matches the M/red variant, not
      // the L/red one. We also accept OR within a key (?attr.size=M,L)
      // which is the only sensible behaviour for a "size picker" UI.
      const keys = Object.keys(filter.attr!);
      return (p.variants || []).some((v: any) => {
        const parsed = parseAttributes(v.attributes);
        return keys.every((key) => {
          const wanted = filter.attr![key];
          return wanted.includes(parsed[key]);
        });
      });
    });
  }
  if (filter.minRating !== undefined) {
    filtered = filtered.filter((p) => (p as any)._averageRating >= (filter.minRating as number));
  }

  // Re-sort if the user asked for relevance, rating, or if post-filtering
  // changed the order.
  if (filter.sort === 'relevance' && filter.search) {
    filtered.sort((a, b) => relevanceScore(b, filter.search!) - relevanceScore(a, filter.search!));
  } else if (filter.sort === 'rating_desc') {
    filtered.sort((a, b) => (b as any)._averageRating - (a as any)._averageRating);
  }

  const totalAfterPost = filtered.length;
  // Operator precedence trap: `||` binds tighter than `!==`, so the
  // original `(onSale || attr || minRating !== undefined)` was effectively
  // `((onSale || attr || minRating) !== undefined)`, which is always
  // true once minRating is undefined. Use parens to OR the three.
  const hasPostFilter =
    filter.onSale === true ||
    (filter.attr && Object.keys(filter.attr).length > 0) ||
    filter.minRating !== undefined;
  const finalTotal = hasPostFilter ? totalAfterPost : total;

  // Apply pagination after the post-filter so totals are correct.
  const page = filter.sort === 'relevance' ? filtered.slice(skip, skip + filter.limit) : filtered;

  return {
    data: page,
    pagination: {
      page: filter.page,
      limit: filter.limit,
      total: finalTotal,
      totalPages: Math.max(1, Math.ceil(finalTotal / filter.limit)),
    },
    total: finalTotal,
    applied: filter,
  };
}

/**
 * Facets for the filter sidebar.
 *
 * Returns, for each filterable dimension, the distinct values present
 * in the result set and a count of how many products would match if
 * the user added that value to their filter. The sidebar uses these
 * counts to render "(N)" next to each checkbox.
 *
 * Counts are based on the candidate set after every other filter
 * (price, inStock, search, ...) but BEFORE the dimension being
 * counted. This is the standard facet UX: when you tick "In stock",
 * the brand list updates to show counts as if in-stock were already
 * applied.
 */
export interface FacetBucket<T> {
  value: T;
  count: number;
  // The count if the user added this value to their current filter.
  selected: boolean;
}

export interface Facets {
  categories: FacetBucket<{ id: string; name: string; slug: string }>[];
  types: FacetBucket<'physical' | 'digital'>[];
  // Dynamic attribute facets. We look at all parsed variant attributes
  // and return the most common keys (size, color, ...). The list of
  // keys is fixed at query time: it doesn't change based on the
  // current filter.
  attributes: Record<
    string,
    { value: string; count: number; selected: boolean }[]
  >;
  // Typed option facets. One section per Option, with the
  // distinct OptionValues from the candidate variants.
  // `optionValueId` is the value used in the `?optionValueId=`
  // query string. The same option may appear under a different
  // name on different products (e.g. "Colour" vs "Color"), so
  // the facet is global across the catalogue rather than per
  // product.
  typedOptions: {
    id: string;
    name: string;
    values: { id: string; value: string; swatch: string | null; count: number; selected: boolean }[];
  }[];
  priceRange: { min: number; max: number };
  inStock: { count: number; total: number };
  onSale: { count: number; total: number };
  rating: { min: number; max: number; buckets: { value: number; count: number }[] };
}

export async function getFacets(filter: ProductFilter): Promise<Facets> {
  const categoryIds = await resolveCategorySlugs(filter.category || [], true);

  // If the user asked for category slugs but none of them resolved,
  // every dimension is empty. Match the list endpoint's behaviour.
  if ((filter.category || []).length > 0 && categoryIds.length === 0) {
    return {
      categories: [],
      types: [],
      attributes: {},
      typedOptions: [],
      priceRange: { min: 0, max: 0 },
      inStock: { count: 0, total: 0 },
      onSale: { count: 0, total: 0 },
      rating: { min: 0, max: 0, buckets: [1, 2, 3, 4, 5].map((v) => ({ value: v, count: 0 })) },
    };
  }

  // Pull the broader candidate set: apply every filter EXCEPT the
  // dimension we are about to count, so the counts reflect "what
  // would happen if I added this to my current filter".
  const candidate = (excludedDim: 'category' | 'type' | 'attr' | 'price' | 'inStock' | 'onSale' | 'rating' | 'optionValueId') => {
    return buildProductWhere({
      categoryIds:
        excludedDim === 'category' || categoryIds.length === 0 ? categoryIds : categoryIds,
      type: excludedDim === 'type' ? undefined : filter.type,
      attr: excludedDim === 'attr' ? undefined : filter.attr,
      minPrice: excludedDim === 'price' ? undefined : filter.minPrice,
      maxPrice: excludedDim === 'price' ? undefined : filter.maxPrice,
      inStock: excludedDim === 'inStock' ? undefined : filter.inStock,
      onSale: excludedDim === 'onSale' ? undefined : filter.onSale,
      search: filter.search,
      optionValueIds: excludedDim === 'optionValueId'
        ? undefined
        : (filter.optionValueId?.length ? filter.optionValueId : undefined),
    });
  };

  // The "base" set: all other filters applied, used to compute the
  // totals and the attribute key list.
  const baseWhere = buildProductWhere({
    categoryIds: categoryIds.length ? categoryIds : undefined,
    type: filter.type,
    attr: filter.attr,
    minPrice: filter.minPrice,
    maxPrice: filter.maxPrice,
    inStock: filter.inStock,
    onSale: filter.onSale,
    search: filter.search,
    optionValueIds: filter.optionValueId?.length ? filter.optionValueId : undefined,
  });

  // Categories
  const categories = await prisma.category.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
  });
  const categoryCounts = await prisma.product.groupBy({
    by: ['categoryId'],
    where: { ...candidate('category'), status: 'active' },
    _count: { _all: true },
  });
  const catCountMap = new Map<string, number>();
  for (const row of categoryCounts as any[]) {
    catCountMap.set(String(row.categoryId), Number(row._count?._all ?? 0));
  }
  const categoryFacets = categories
    .map((c) => ({
      value: { id: c.id, name: c.name, slug: c.slug },
      count: catCountMap.get(c.id) ?? 0,
      selected: (filter.category || []).includes(c.slug),
    }))
    // Only show categories that have at least one product in the
    // current candidate set.
    .filter((f) => f.count > 0 || f.selected);

  // Types
  const allTypes: ('physical' | 'digital')[] = ['physical', 'digital'];
  const typeFacets: FacetBucket<'physical' | 'digital'>[] = [];
  for (const t of allTypes) {
    const count = await prisma.product.count({
      where: { ...candidate('type'), type: t, status: 'active' },
    });
    typeFacets.push({ value: t, count, selected: (filter.type || []).includes(t) });
  }

  // Price range (over the base set)
  const priceAgg = await prisma.product.aggregate({
    where: { ...baseWhere, status: 'active' },
    _min: { price: true },
    _max: { price: true },
  });

  // In stock
  const inStockWhere = { ...baseWhere, status: 'active' };
  const inStockCount = await prisma.product.count({
    where: {
      ...inStockWhere,
      OR: [{ quantity: { gt: 0 } }, { trackInventory: false }],
    },
  });
  const totalActive = await prisma.product.count({ where: { ...inStockWhere, status: 'active' } });

  // On sale
  const onSaleCount = await prisma.product.count({
    where: {
      ...baseWhere,
      status: 'active',
      compareAtPrice: { not: null },
    },
  });
  // We can't express compareAtPrice > price in Prisma where, so we
  // approximate the count with the candidate set and a post-filter.
  const onSaleCandidates = await prisma.product.findMany({
    where: {
      ...baseWhere,
      status: 'active',
      compareAtPrice: { not: null },
    },
    select: { price: true, compareAtPrice: true },
  });
  const onSaleReal = onSaleCandidates.filter(
    (p) => Number(p.compareAtPrice) > Number(p.price),
  ).length;

  // Rating buckets
  const reviews = await prisma.review.findMany({
    where: {
      product: { ...baseWhere, status: 'active' },
      isApproved: true,
    },
    select: { productId: true, rating: true },
  });
  const byProduct = new Map<string, number[]>();
  for (const r of reviews) {
    if (!byProduct.has(r.productId)) byProduct.set(r.productId, []);
    byProduct.get(r.productId)!.push(r.rating);
  }
  const productAvgs = new Map<string, number>();
  for (const [pid, rs] of byProduct) {
    productAvgs.set(pid, rs.reduce((a, b) => a + b, 0) / rs.length);
  }
  const buckets = [1, 2, 3, 4, 5].map((v) => {
    const lo = v;
    const hi = v === 5 ? 5 : v + 0.99;
    const count = [...productAvgs.values()].filter((avg) => avg >= lo && avg <= hi).length;
    return { value: v, count };
  });
  const allAvgs = [...productAvgs.values()];
  const ratingRange = {
    min: allAvgs.length ? Math.min(...allAvgs) : 0,
    max: allAvgs.length ? Math.max(...allAvgs) : 0,
    buckets,
  };

  // Attributes: enumerate distinct (key, value) pairs across all
  // variants of the base candidate set.
  const variants = await prisma.variant.findMany({
    where: { isActive: true, product: { ...baseWhere, status: 'active' } },
    select: { attributes: true },
  });
  const attrTally = new Map<string, Map<string, number>>();
  for (const v of variants) {
    const parsed = parseAttributes(v.attributes);
    for (const [k, val] of Object.entries(parsed)) {
      if (!attrTally.has(k)) attrTally.set(k, new Map());
      const inner = attrTally.get(k)!;
      inner.set(val, (inner.get(val) || 0) + 1);
    }
  }
  // Cap the number of attribute keys to 8 so the response stays small
  // for stores with hundreds of variant attributes.
  const topKeys = [...attrTally.entries()]
    .sort((a, b) => {
      const sumA = [...a[1].values()].reduce((x, y) => x + y, 0);
      const sumB = [...b[1].values()].reduce((x, y) => x + y, 0);
      return sumB - sumA;
    })
    .slice(0, 8)
    .map(([k]) => k);

  const attributes: Facets['attributes'] = {};
  for (const key of topKeys) {
    const inner = attrTally.get(key)!;
    const entries = [...inner.entries()]
      .map(([value, count]) => ({
        value,
        count,
        selected: (filter.attr?.[key] || []).includes(value),
      }))
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
    attributes[key] = entries;
  }

  // Typed options. Pull every Option across the candidate products
  // and bucket the OptionValues. We group by (optionId) so a single
  // "Color" option on a product shows up once with the union of
  // values across all products that use it.
  const optionRows = await prisma.option.findMany({
    where: { product: { ...baseWhere, status: 'active' } },
    include: {
      values: {
        orderBy: { sortOrder: 'asc' },
        include: {
          // The VariantOptionValue rows are the join between a
          // Variant and an OptionValue. We need the count of
          // DISTINCT products that have a variant pointing at this
          // option value (under the current filter).
          variantValues: {
            where: { variant: { isActive: true, product: { ...candidate('optionValueId'), status: 'active' } } },
            select: { variant: { select: { productId: true } } },
          },
        },
      },
    },
    orderBy: { sortOrder: 'asc' },
  });
  // Reduce to one entry per (option name); tally per-value products.
  const optionTally = new Map<string, { id: string; name: string; values: Map<string, { id: string; value: string; swatch: string | null; products: Set<string> }> }>();
  for (const o of optionRows) {
    if (!optionTally.has(o.name)) {
      optionTally.set(o.name, { id: o.id, name: o.name, values: new Map() });
    }
    const bucket = optionTally.get(o.name)!;
    for (const v of o.values) {
      const products = new Set<string>();
      for (const vv of v.variantValues) {
        if (vv.variant?.productId) products.add(vv.variant.productId);
      }
      const existing = bucket.values.get(v.value);
      if (existing) {
        for (const p of products) existing.products.add(p);
      } else {
        bucket.values.set(v.value, {
          id: v.id,
          value: v.value,
          swatch: v.swatch,
          products,
        });
      }
    }
  }
  const typedOptions: Facets['typedOptions'] = [...optionTally.values()].map((o) => ({
    id: o.id,
    name: o.name,
    values: [...o.values.values()].map((v) => ({
      id: v.id,
      value: v.value,
      swatch: v.swatch,
      count: v.products.size,
      selected: (filter.optionValueId || []).includes(v.id),
    })).sort((a, b) => b.count - a.count || a.value.localeCompare(b.value)),
  })).filter((o) => o.values.some((v) => v.count > 0));

  return {
    categories: categoryFacets,
    types: typeFacets,
    attributes,
    typedOptions,
    priceRange: {
      min: Number(priceAgg?._min?.price ?? 0),
      max: Number(priceAgg?._max?.price ?? 0),
    },
    inStock: { count: inStockCount, total: totalActive },
    onSale: { count: onSaleReal, total: totalActive },
    rating: ratingRange,
  };
}

/**
 * Parse and validate a request's query string into a ProductFilter.
 * Re-exported from the schema module so callers only need to import
 * the service.
 */
export function parseFilterFromQuery(qs: any): ProductFilter {
  return productFilterSchema.parse(qs);
}
