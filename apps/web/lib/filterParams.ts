/**
 * Encode/decode product filter state to and from the URL query string.
 *
 * The storefront's `/products` page keeps the entire filter in the URL
 * so a shopper can share, bookmark, and back-navigate without losing
 * what they had selected. The contract with the API is documented in
 * `apps/api/src/modules/products/productFilter.schema.ts` and mirrored
 * here so the UI can build the query string without duplicating the
 * allowed values.
 *
 * Conventions:
 *   - Multi-value fields use CSV:  ?category=clothing,books
 *   - Attribute filters use dots:  ?attr.size=M&attr.color=red
 *   - Boolean fields are 'true' or absent
 *   - Empty strings mean "no value", not "selected" (the API treats
 *     them the same as absent)
 *   - Sort is always present (default 'newest'); we serialise it as
 *     the literal name.
 */
import type { ProductFilter } from './filterParams.types';

/** The list of sort values the API accepts. Kept in sync with the schema. */
export const SORT_VALUES = [
  'newest',
  'oldest',
  'price_asc',
  'price_desc',
  'name_asc',
  'name_desc',
  'rating_desc',
  'popular',
  'relevance',
] as const;
export type SortValue = (typeof SORT_VALUES)[number];

/** Default filter state - what you get with no query string. */
export const EMPTY_FILTER: ProductFilter = {
  page: 1,
  limit: 20,
  status: 'active',
  category: [],
  type: [],
  attr: {},
  inStock: false,
  onSale: false,
  minRating: undefined,
  minPrice: undefined,
  maxPrice: undefined,
  search: undefined,
  optionValueId: [],
  sort: 'newest',
};

/** A serialised filter as it appears in the URL. */
export interface SerialisedFilter {
  category?: string;
  type?: string;
  attr?: Record<string, string>;
  inStock?: 'true';
  onSale?: 'true';
  minRating?: string;
  minPrice?: string;
  maxPrice?: string;
  search?: string;
  optionValueId?: string;
  sort?: string;
  page?: string;
  limit?: string;
}

/**
 * Build a URLSearchParams from a ProductFilter. Excludes defaults to
 * keep the URL short. Use the returned object directly with
 * `router.push(`?${params.toString()}`)` or pass it to Next's
 * `useRouter().push({ query: ... })`.
 *
 * Empty arrays and empty objects are dropped, so a fresh filter
 * produces an empty query string (clean URLs).
 */
export function encodeFilter(filter: Partial<ProductFilter>): URLSearchParams {
  const params = new URLSearchParams();
  if (filter.category && filter.category.length) params.set('category', filter.category.join(','));
  if (filter.type && filter.type.length) params.set('type', filter.type.join(','));
  if (filter.attr) {
    for (const [k, vs] of Object.entries(filter.attr)) {
      if (vs && vs.length) params.set(`attr.${k}`, vs.join(','));
    }
  }
  if (filter.inStock) params.set('inStock', 'true');
  if (filter.onSale) params.set('onSale', 'true');
  if (filter.minRating !== undefined && filter.minRating !== null) {
    params.set('minRating', String(filter.minRating));
  }
  if (filter.minPrice !== undefined && filter.minPrice !== null) {
    params.set('minPrice', String(filter.minPrice));
  }
  if (filter.maxPrice !== undefined && filter.maxPrice !== null) {
    params.set('maxPrice', String(filter.maxPrice));
  }
  if (filter.search && filter.search.trim()) params.set('search', filter.search.trim());
  if (filter.optionValueId && filter.optionValueId.length) {
    params.set('optionValueId', filter.optionValueId.join(','));
  }
  if (filter.sort && filter.sort !== 'newest') params.set('sort', filter.sort);
  if (filter.page && filter.page > 1) params.set('page', String(filter.page));
  if (filter.limit && filter.limit !== 20) params.set('limit', String(filter.limit));
  return params;
}

/**
 * Parse a URLSearchParams (or a Next `router.query` object, which is
 * the same shape with possibly-undefined values) into a ProductFilter.
 *
 * Unknown keys are ignored. Empty strings are treated as absent. The
 * returned object always has all fields defined, so consumers can
 * destructure without optional chaining everywhere.
 */
export function decodeFilter(input: URLSearchParams | Record<string, string | string[] | undefined>): ProductFilter {
  const get = (k: string): string | undefined => {
    if (input instanceof URLSearchParams) {
      const v = input.get(k);
      return v === '' ? undefined : (v ?? undefined);
    }
    const raw = input[k];
    if (raw === undefined) return undefined;
    if (Array.isArray(raw)) return raw[0];
    return raw === '' ? undefined : raw;
  };

  const csv = (k: string): string[] => {
    // Pull every occurrence of the key and split each on commas. This
    // supports both the CSV form (?category=a,b) and the repeated
    // form (?category=a&category=b) without double-counting.
    let all: string[] = [];
    if (input instanceof URLSearchParams) {
      for (const v of input.getAll(k)) {
        all = all.concat(v.split(','));
      }
    } else {
      const raw = input[k];
      if (Array.isArray(raw)) {
        for (const v of raw) all = all.concat(String(v).split(','));
      } else if (raw !== undefined) {
        all = all.concat(String(raw).split(','));
      }
    }
    return all.map((s) => s.trim()).filter(Boolean);
  };

  const csvRecord = (prefix: string): Record<string, string[]> => {
    const out: Record<string, string[]> = {};
    const iter: [string, string | string[] | undefined][] = input instanceof URLSearchParams
      ? Array.from(input.entries()) as [string, string][]
      : Object.entries(input);
    for (const [k, v] of iter) {
      if (!k.startsWith(prefix + '.')) continue;
      const sub = k.slice(prefix.length + 1);
      if (!sub) continue;
      const values = (Array.isArray(v) ? v : [v])
        .flatMap((s) => String(s ?? '').split(','))
        .map((s) => s.trim())
        .filter(Boolean);
      if (!values.length) continue;
      out[sub] = out[sub] ? [...out[sub], ...values] : values;
    }
    return out;
  };

  const toNumber = (v: string | undefined): number | undefined => {
    if (v === undefined) return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };

  const sortRaw = get('sort');
  const sort: SortValue = (SORT_VALUES as readonly string[]).includes(sortRaw ?? '')
    ? (sortRaw as SortValue)
    : 'newest';

  return {
    page: toNumber(get('page')) ?? 1,
    limit: toNumber(get('limit')) ?? 20,
    status: 'active',
    category: csv('category'),
    type: csv('type').filter((t) => t === 'physical' || t === 'digital'),
    attr: csvRecord('attr'),
    inStock: get('inStock') === 'true',
    onSale: get('onSale') === 'true',
    minRating: toNumber(get('minRating')),
    minPrice: toNumber(get('minPrice')),
    maxPrice: toNumber(get('maxPrice')),
    search: get('search'),
    optionValueId: csv('optionValueId'),
    sort,
  };
}

/**
 * True when the filter is the default (nothing applied). Used by the
 * UI to decide whether to show the "Clear all" button.
 */
export function isEmptyFilter(filter: Partial<ProductFilter>): boolean {
  return (
    (!filter.category || filter.category.length === 0) &&
    (!filter.type || filter.type.length === 0) &&
    (!filter.attr || Object.keys(filter.attr).length === 0) &&
    !filter.inStock &&
    !filter.onSale &&
    (filter.minRating === undefined || filter.minRating === null) &&
    (filter.minPrice === undefined || filter.minPrice === null) &&
    (filter.maxPrice === undefined || filter.maxPrice === null) &&
    (!filter.search || !filter.search.trim()) &&
    (!filter.optionValueId || filter.optionValueId.length === 0) &&
    (!filter.sort || filter.sort === 'newest')
  );
}

/** Count the number of distinct "active" filter dimensions for the chip rail. */
export function activeFilterCount(filter: Partial<ProductFilter>): number {
  let n = 0;
  if (filter.category && filter.category.length) n += filter.category.length;
  if (filter.type && filter.type.length) n += filter.type.length;
  if (filter.attr) {
    for (const vs of Object.values(filter.attr)) {
      if (vs && vs.length) n += vs.length;
    }
  }
  if (filter.inStock) n += 1;
  if (filter.onSale) n += 1;
  if (filter.minRating !== undefined && filter.minRating !== null) n += 1;
  if (filter.minPrice !== undefined || filter.maxPrice !== undefined) n += 1;
  if (filter.search && filter.search.trim()) n += 1;
  if (filter.optionValueId && filter.optionValueId.length) n += filter.optionValueId.length;
  if (filter.sort && filter.sort !== 'newest') n += 1;
  return n;
}
