/**
 * How many featured products to paint on the home grid.
 *
 * The builder's `config.limit` is the cap. We never drop leftover cards
 * just to fill a complete last row (that hid a 5th product on a 4-col grid).
 */
export function featuredProductsToShow<T>(
  products: T[],
  limit: unknown,
): T[] {
  const cap =
    typeof limit === 'number' && Number.isFinite(limit) && limit > 0
      ? Math.floor(limit)
      : products.length;
  return products.slice(0, cap);
}
